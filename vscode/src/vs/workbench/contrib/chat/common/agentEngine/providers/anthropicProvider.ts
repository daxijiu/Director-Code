/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Anthropic Messages API Provider
 *
 * Since the Agent Engine's internal format is Anthropic-like, this provider
 * does minimal conversion — mostly a thin pass-through.
 *
 * Uses native fetch (no @anthropic-ai/sdk dependency) to avoid adding
 * external npm dependencies to the VS Code build system.
 *
 * Supports:
 *   - Non-streaming: POST /v1/messages
 *   - Streaming:     POST /v1/messages (stream: true, SSE)
 *   - Extended thinking
 *   - Cache usage tracking
 *
 * Ported from open-agent-sdk-typescript/src/providers/anthropic.ts
 * Adapted to use native fetch instead of SDK.
 */

import type {
	LLMProvider,
	CreateMessageParams,
	CreateMessageResponse,
	StreamEvent,
	ProviderOptions,
	TokenUsage,
	NormalizedResponseBlock,
} from './providerTypes.js';

// ============================================================================
// Anthropic API types (minimal, matching Messages API)
// ============================================================================

interface AnthropicResponse {
	id: string;
	type: 'message';
	role: 'assistant';
	content: Array<
		| { type: 'text'; text: string }
		| { type: 'tool_use'; id: string; name: string; input: any }
		| { type: 'thinking'; thinking: string }
	>;
	stop_reason: 'end_turn' | 'max_tokens' | 'tool_use' | string | null;
	usage: {
		input_tokens: number;
		output_tokens: number;
		cache_creation_input_tokens?: number;
		cache_read_input_tokens?: number;
	};
}

interface AnthropicStreamEvent {
	type: string;
	// message_start
	message?: AnthropicResponse;
	// content_block_start
	index?: number;
	content_block?: {
		type: string;
		id?: string;
		name?: string;
		text?: string;
		thinking?: string;
	};
	// content_block_delta
	delta?: {
		type: string;
		text?: string;
		partial_json?: string;
		thinking?: string;
	};
	// message_delta
	usage?: { output_tokens: number };
}

// ============================================================================
// AnthropicProvider
// ============================================================================

export class AnthropicProvider implements LLMProvider {
	readonly apiType = 'anthropic-messages' as const;
	private readonly apiKey: string;
	private readonly baseURL: string;

	constructor(opts: ProviderOptions) {
		this.apiKey = opts.apiKey;
		this.baseURL = (opts.baseURL || 'https://api.anthropic.com').replace(/\/$/, '');
	}

	// ========================================================================
	// Non-streaming
	// ========================================================================

	async createMessage(params: CreateMessageParams): Promise<CreateMessageResponse> {
		const body = this.buildRequestBody(params);

		const response = await fetch(`${this.baseURL}/v1/messages`, {
			method: 'POST',
			headers: this.buildHeaders(),
			body: JSON.stringify(body),
			signal: params.abortSignal,
		});

		if (!response.ok) {
			const errBody = await response.text().catch(() => '');
			const err: any = new Error(
				`Anthropic API error: ${response.status} ${response.statusText}: ${errBody}`,
			);
			err.status = response.status;
			throw err;
		}

		const data = (await response.json()) as AnthropicResponse;
		return this.convertResponse(data);
	}

	// ========================================================================
	// Streaming
	// ========================================================================

	async *createMessageStream(params: CreateMessageParams): AsyncGenerator<StreamEvent> {
		const body = this.buildRequestBody(params);
		body.stream = true;

		const response = await fetch(`${this.baseURL}/v1/messages`, {
			method: 'POST',
			headers: this.buildHeaders(),
			body: JSON.stringify(body),
			signal: params.abortSignal,
		});

		if (!response.ok) {
			const errBody = await response.text().catch(() => '');
			const err: any = new Error(
				`Anthropic API error: ${response.status} ${response.statusText}: ${errBody}`,
			);
			err.status = response.status;
			throw err;
		}

		yield* this.parseAnthropicSSEStream(response.body!);
	}

	// ========================================================================
	// SSE Stream Parser
	// ========================================================================

	private async *parseAnthropicSSEStream(body: ReadableStream<Uint8Array>): AsyncGenerator<StreamEvent> {
		const reader = body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		let usage: TokenUsage = { input_tokens: 0, output_tokens: 0 };
		let cacheCreationTokens: number | undefined;
		let cacheReadTokens: number | undefined;
		let stopReason = 'end_turn';

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) { break; }

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop()!; // Keep incomplete line in buffer

				for (const line of lines) {
					const trimmed = line.trim();
					if (!trimmed.startsWith('data: ')) { continue; }

					const data = trimmed.slice(6).trim();
					if (!data) { continue; }

					let event: AnthropicStreamEvent;
					try {
						event = JSON.parse(data);
					} catch {
						continue; // Skip malformed events
					}

					switch (event.type) {
						case 'message_start': {
							// Extract initial usage (input tokens, cache tokens)
							if (event.message?.usage) {
								const u = event.message.usage;
								usage = {
									input_tokens: u.input_tokens,
									output_tokens: u.output_tokens,
								};
								cacheCreationTokens = u.cache_creation_input_tokens;
								cacheReadTokens = u.cache_read_input_tokens;
							}
							break;
						}

						case 'content_block_start': {
							const block = event.content_block;
							if (block?.type === 'tool_use' && block.id && block.name) {
								yield {
									type: 'tool_use_start',
									id: block.id,
									name: block.name,
								};
							}
							// text and thinking blocks start empty — content comes in deltas
							break;
						}

						case 'content_block_delta': {
							const delta = event.delta;
							if (!delta) { break; }

							if (delta.type === 'text_delta' && delta.text) {
								yield { type: 'text', text: delta.text };
							} else if (delta.type === 'input_json_delta' && delta.partial_json) {
								yield { type: 'tool_input_delta', json: delta.partial_json };
							} else if (delta.type === 'thinking_delta' && delta.thinking) {
								yield { type: 'thinking', thinking: delta.thinking };
							}
							break;
						}

						case 'message_delta': {
							// Contains stop_reason and output token usage delta
							if ((event as any).delta?.stop_reason) {
								stopReason = (event as any).delta.stop_reason;
							}
							if (event.usage?.output_tokens) {
								usage = {
									...usage,
									output_tokens: event.usage.output_tokens,
								};
							}
							break;
						}

						case 'message_stop': {
							// Stream ended — emit final message_complete below
							break;
						}

						// ping, content_block_stop — no action needed
						default:
							break;
					}
				}
			}
		} finally {
			reader.releaseLock();
		}

		// Emit final completion event
		const finalUsage: TokenUsage = {
			...usage,
			cache_creation_input_tokens: cacheCreationTokens,
			cache_read_input_tokens: cacheReadTokens,
		};
		yield { type: 'message_complete', usage: finalUsage, stopReason };
	}

	// ========================================================================
	// Helpers
	// ========================================================================

	private buildHeaders(): Record<string, string> {
		return {
			'Content-Type': 'application/json',
			'x-api-key': this.apiKey,
			'anthropic-version': '2023-06-01',
		};
	}

	private buildRequestBody(params: CreateMessageParams): Record<string, any> {
		const body: Record<string, any> = {
			model: params.model,
			max_tokens: params.maxTokens,
			system: params.system,
			messages: params.messages,
			tools: params.tools || undefined,
		};

		// Extended thinking support
		if (params.thinking?.type === 'enabled' && params.thinking.budget_tokens) {
			body.thinking = {
				type: 'enabled',
				budget_tokens: params.thinking.budget_tokens,
			};
		}

		return body;
	}

	private convertResponse(data: AnthropicResponse): CreateMessageResponse {
		// Since internal format is Anthropic-like, minimal conversion needed
		const content: NormalizedResponseBlock[] = [];

		for (const block of data.content) {
			if (block.type === 'text') {
				content.push({ type: 'text', text: block.text });
			} else if (block.type === 'tool_use') {
				content.push({
					type: 'tool_use',
					id: block.id,
					name: block.name,
					input: block.input,
				});
			}
			// thinking blocks are not included in NormalizedResponseBlock
		}

		if (content.length === 0) {
			content.push({ type: 'text', text: '' });
		}

		return {
			content,
			stopReason: data.stop_reason || 'end_turn',
			usage: {
				input_tokens: data.usage.input_tokens,
				output_tokens: data.usage.output_tokens,
				cache_creation_input_tokens: data.usage.cache_creation_input_tokens,
				cache_read_input_tokens: data.usage.cache_read_input_tokens,
			},
		};
	}
}
