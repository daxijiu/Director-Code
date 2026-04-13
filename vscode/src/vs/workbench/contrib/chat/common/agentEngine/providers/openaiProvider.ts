/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * OpenAI Chat Completions API Provider
 *
 * Converts between the Agent Engine's internal Anthropic-like message format
 * and OpenAI's Chat Completions API format. Uses native fetch (no SDK dependency).
 *
 * Also compatible with OpenAI-compatible APIs: DeepSeek, Silicon Flow, etc.
 *
 * Ported from open-agent-sdk-typescript/src/providers/openai.ts
 * Enhanced with SSE streaming support.
 */

import type {
	LLMProvider,
	CreateMessageParams,
	CreateMessageResponse,
	StreamEvent,
	ProviderOptions,
	NormalizedMessageParam,
	NormalizedTool,
	NormalizedResponseBlock,
	TokenUsage,
} from './providerTypes.js';

// ============================================================================
// OpenAI-specific types (minimal, no SDK dependency)
// ============================================================================

interface OpenAIChatMessage {
	role: 'system' | 'user' | 'assistant' | 'tool';
	content?: string | null;
	tool_calls?: OpenAIToolCall[];
	tool_call_id?: string;
}

interface OpenAIToolCall {
	id: string;
	type: 'function';
	function: {
		name: string;
		arguments: string;
	};
}

interface OpenAITool {
	type: 'function';
	function: {
		name: string;
		description: string;
		parameters: Record<string, any>;
	};
}

interface OpenAIChatResponse {
	id: string;
	choices: Array<{
		index: number;
		message: {
			role: 'assistant';
			content: string | null;
			tool_calls?: OpenAIToolCall[];
		};
		finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | string;
	}>;
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
}

interface OpenAIStreamChunk {
	id: string;
	choices: Array<{
		index: number;
		delta: {
			role?: string;
			content?: string | null;
			reasoning_content?: string | null;
			tool_calls?: Array<{
				index: number;
				id?: string;
				type?: string;
				function?: {
					name?: string;
					arguments?: string;
				};
			}>;
		};
		finish_reason: string | null;
	}>;
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
}

// ============================================================================
// OpenAIProvider
// ============================================================================

export class OpenAIProvider implements LLMProvider {
	readonly apiType = 'openai-completions' as const;
	private readonly apiKey: string;
	private readonly baseURL: string;

	constructor(opts: ProviderOptions) {
		this.apiKey = opts.apiKey;
		this.baseURL = (opts.baseURL || 'https://api.openai.com/v1').replace(/\/$/, '');
	}

	// ========================================================================
	// Non-streaming
	// ========================================================================

	async createMessage(params: CreateMessageParams): Promise<CreateMessageResponse> {
		const messages = this.convertMessages(params.system, params.messages);
		const tools = params.tools ? this.convertTools(params.tools) : undefined;

		const body: Record<string, any> = {
			model: params.model,
			max_tokens: params.maxTokens,
			messages,
		};

		if (tools && tools.length > 0) {
			body.tools = tools;
		}

		const response = await fetch(`${this.baseURL}/chat/completions`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${this.apiKey}`,
			},
			body: JSON.stringify(body),
			signal: params.abortSignal,
		});

		if (!response.ok) {
			const errBody = await response.text().catch(() => '');
			const err: any = new Error(
				`OpenAI API error: ${response.status} ${response.statusText}: ${errBody}`,
			);
			err.status = response.status;
			throw err;
		}

		const data = (await response.json()) as OpenAIChatResponse;
		return this.convertResponse(data);
	}

	// ========================================================================
	// Streaming
	// ========================================================================

	async *createMessageStream(params: CreateMessageParams): AsyncGenerator<StreamEvent> {
		const messages = this.convertMessages(params.system, params.messages);
		const tools = params.tools ? this.convertTools(params.tools) : undefined;

		const body: Record<string, any> = {
			model: params.model,
			max_tokens: params.maxTokens,
			messages,
			stream: true,
			stream_options: { include_usage: true },
		};

		if (tools && tools.length > 0) {
			body.tools = tools;
		}

		const response = await fetch(`${this.baseURL}/chat/completions`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${this.apiKey}`,
			},
			body: JSON.stringify(body),
			signal: params.abortSignal,
		});

		if (!response.ok) {
			const errBody = await response.text().catch(() => '');
			const err: any = new Error(
				`OpenAI API error: ${response.status} ${response.statusText}: ${errBody}`,
			);
			err.status = response.status;
			throw err;
		}

		yield* this.parseSSEStream(response.body!);
	}

	// ========================================================================
	// SSE Stream Parser
	// ========================================================================

	private async *parseSSEStream(body: ReadableStream<Uint8Array>): AsyncGenerator<StreamEvent> {
		const reader = body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		let finishReason = 'end_turn';
		let usage: TokenUsage = { input_tokens: 0, output_tokens: 0 };

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
					if (data === '[DONE]') {
						yield { type: 'message_complete', usage, stopReason: finishReason };
						return;
					}

					let chunk: OpenAIStreamChunk;
					try {
						chunk = JSON.parse(data);
					} catch {
						continue; // Skip malformed chunks
					}

					// Process content and tool call deltas
					yield* this.processStreamChunk(chunk);

					// Capture finish_reason
					const choice = chunk.choices?.[0];
					if (choice?.finish_reason) {
						finishReason = this.mapFinishReason(choice.finish_reason);
					}

					// Capture usage from final chunk (stream_options: include_usage)
					if (chunk.usage) {
						usage = {
							input_tokens: chunk.usage.prompt_tokens,
							output_tokens: chunk.usage.completion_tokens,
						};
					}
				}
			}
		} finally {
			reader.releaseLock();
		}

		// If stream ended without [DONE], still emit completion
		yield { type: 'message_complete', usage, stopReason: finishReason };
	}

	private *processStreamChunk(chunk: OpenAIStreamChunk): Generator<StreamEvent> {
		const choice = chunk.choices?.[0];
		if (!choice) { return; }

		const delta = choice.delta;

		// Reasoning/thinking content (DeepSeek R1, o1/o3 reasoning)
		if (delta.reasoning_content) {
			yield { type: 'thinking', thinking: delta.reasoning_content };
		}

		// Text content
		if (delta.content) {
			yield { type: 'text', text: delta.content };
		}

		// Tool calls (streamed incrementally by index)
		if (delta.tool_calls) {
			for (const tc of delta.tool_calls) {
				yield {
					type: 'tool_call_delta',
					index: tc.index,
					id: tc.id,
					name: tc.function?.name,
					arguments: tc.function?.arguments,
				};
			}
		}
	}

	// ========================================================================
	// Message Conversion: Internal (Anthropic-like) → OpenAI
	// ========================================================================

	private convertMessages(
		system: string,
		messages: readonly NormalizedMessageParam[],
	): OpenAIChatMessage[] {
		const result: OpenAIChatMessage[] = [];

		// System prompt as first message
		if (system) {
			result.push({ role: 'system', content: system });
		}

		for (const msg of messages) {
			if (msg.role === 'user') {
				this.convertUserMessage(msg, result);
			} else if (msg.role === 'assistant') {
				this.convertAssistantMessage(msg, result);
			}
		}

		return result;
	}

	private convertUserMessage(
		msg: NormalizedMessageParam,
		result: OpenAIChatMessage[],
	): void {
		if (typeof msg.content === 'string') {
			result.push({ role: 'user', content: msg.content });
			return;
		}

		// Content blocks may contain text and/or tool_result blocks
		const textParts: string[] = [];
		const toolResults: Array<{ tool_use_id: string; content: string }> = [];

		for (const block of msg.content) {
			if (block.type === 'text') {
				textParts.push(block.text);
			} else if (block.type === 'tool_result') {
				toolResults.push({
					tool_use_id: block.tool_use_id,
					content: block.content,
				});
			}
		}

		// Tool results become separate tool messages (must come before text)
		for (const tr of toolResults) {
			result.push({
				role: 'tool',
				tool_call_id: tr.tool_use_id,
				content: tr.content,
			});
		}

		// Text parts become a user message
		if (textParts.length > 0) {
			result.push({ role: 'user', content: textParts.join('\n') });
		}
	}

	private convertAssistantMessage(
		msg: NormalizedMessageParam,
		result: OpenAIChatMessage[],
	): void {
		if (typeof msg.content === 'string') {
			result.push({ role: 'assistant', content: msg.content });
			return;
		}

		// Extract text and tool_use blocks
		const textParts: string[] = [];
		const toolCalls: OpenAIToolCall[] = [];

		for (const block of msg.content) {
			if (block.type === 'text') {
				textParts.push(block.text);
			} else if (block.type === 'tool_use') {
				toolCalls.push({
					id: block.id,
					type: 'function',
					function: {
						name: block.name,
						arguments: typeof block.input === 'string'
							? block.input
							: JSON.stringify(block.input),
					},
				});
			}
		}

		const assistantMsg: OpenAIChatMessage = {
			role: 'assistant',
			content: textParts.length > 0 ? textParts.join('\n') : null,
		};

		if (toolCalls.length > 0) {
			assistantMsg.tool_calls = toolCalls;
		}

		result.push(assistantMsg);
	}

	// ========================================================================
	// Tool Conversion: Internal → OpenAI
	// ========================================================================

	private convertTools(tools: readonly NormalizedTool[]): OpenAITool[] {
		return tools.map((t) => ({
			type: 'function' as const,
			function: {
				name: t.name,
				description: t.description,
				parameters: t.input_schema,
			},
		}));
	}

	// ========================================================================
	// Response Conversion: OpenAI → Internal
	// ========================================================================

	private convertResponse(data: OpenAIChatResponse): CreateMessageResponse {
		const choice = data.choices[0];
		if (!choice) {
			return {
				content: [{ type: 'text', text: '' }],
				stopReason: 'end_turn',
				usage: { input_tokens: 0, output_tokens: 0 },
			};
		}

		const content: NormalizedResponseBlock[] = [];

		// Add reasoning/thinking content (DeepSeek R1, o1/o3)
		if ((choice.message as any).reasoning_content) {
			content.push({ type: 'thinking', thinking: (choice.message as any).reasoning_content });
		}

		// Add text content
		if (choice.message.content) {
			content.push({ type: 'text', text: choice.message.content });
		}

		// Add tool calls
		if (choice.message.tool_calls) {
			for (const tc of choice.message.tool_calls) {
				let input: any;
				try {
					input = JSON.parse(tc.function.arguments);
				} catch {
					input = tc.function.arguments;
				}

				content.push({
					type: 'tool_use',
					id: tc.id,
					name: tc.function.name,
					input,
				});
			}
		}

		// If no content at all, add empty text
		if (content.length === 0) {
			content.push({ type: 'text', text: '' });
		}

		const stopReason = this.mapFinishReason(choice.finish_reason);

		return {
			content,
			stopReason,
			usage: {
				input_tokens: data.usage?.prompt_tokens || 0,
				output_tokens: data.usage?.completion_tokens || 0,
			},
		};
	}

	private mapFinishReason(
		reason: string,
	): 'end_turn' | 'max_tokens' | 'tool_use' | string {
		switch (reason) {
			case 'stop':
				return 'end_turn';
			case 'length':
				return 'max_tokens';
			case 'tool_calls':
				return 'tool_use';
			default:
				return reason;
		}
	}
}
