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
	CreateMessageParams,
	CreateMessageResponse,
	StreamEvent,
	NormalizedMessageParam,
	NormalizedTool,
	NormalizedResponseBlock,
	TokenUsage,
	ApiType,
	ProviderReasoningEcho,
} from './providerTypes.js';
import { AbstractDirectorCodeProvider } from './abstractProvider.js';
import { getCatalogCapabilitiesForModel } from '../modelCatalog.js';

// ============================================================================
// OpenAI-specific types (minimal, no SDK dependency)
// ============================================================================

interface OpenAIChatMessage {
	role: 'system' | 'user' | 'assistant' | 'tool';
	content?: string | null | OpenAIContentPart[];
	tool_calls?: OpenAIToolCall[];
	tool_call_id?: string;
	reasoning_content?: string;
}

type OpenAIContentPart =
	| { type: 'text'; text: string }
	| { type: 'image_url'; image_url: { url: string } };

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
			reasoning_content?: string | null;
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

export class OpenAIProvider extends AbstractDirectorCodeProvider {
	readonly apiType = 'openai-completions' as const;
	private static readonly includeUsageUnsupportedBaseURLs = new Set<string>();
	private static readonly reasoningEchoRuntimeCache = new Map<string, ProviderReasoningEcho>();

	protected getApiType(): ApiType { return 'openai-completions'; }
	protected getDefaultBaseURL(): string { return 'https://api.openai.com/v1'; }
	protected getProviderName(): string { return 'OpenAI'; }

	// ========================================================================
	// Non-streaming
	// ========================================================================

	async createMessage(params: CreateMessageParams): Promise<CreateMessageResponse> {
		let reasoningFallback: ProviderReasoningEcho | undefined;
		let reasoningFallbackApplied = false;

		for (let attempt = 0; attempt < 2; attempt++) {
			const { body, appliedReasoningEcho } = this.buildChatCompletionsBody(params, {
				reasoningEcho: reasoningFallback,
			});

			try {
				const response = await this.postChatCompletions(body, params.abortSignal);
				if (reasoningFallbackApplied) {
					this.rememberReasoningEcho(params.model, reasoningFallback!);
				}
				const data = (await response.json()) as OpenAIChatResponse;
				return this.convertResponse(data);
			} catch (err: any) {
				if (
					!appliedReasoningEcho
					&& this.canApplyReasoningFallback(params.model)
					&& this.isReasoningContentRequiredError(err)
				) {
					reasoningFallback = { field: 'reasoning_content', includeEmpty: true };
					reasoningFallbackApplied = true;
					continue;
				}
				throw err;
			}
		}

		throw new Error('OpenAI API error: reasoning_content retry exhausted');
	}

	// ========================================================================
	// Streaming
	// ========================================================================

	async *createMessageStream(params: CreateMessageParams): AsyncGenerator<StreamEvent> {
		let includeUsage = !OpenAIProvider.includeUsageUnsupportedBaseURLs.has(this.baseURL);
		let includeUsageFallbackApplied = false;
		let reasoningFallback: ProviderReasoningEcho | undefined;
		let reasoningFallbackApplied = false;
		let response: Response | undefined;

		for (let attempt = 0; attempt < 3; attempt++) {
			const { body, appliedReasoningEcho } = this.buildChatCompletionsBody(params, {
				stream: true,
				includeUsage,
				reasoningEcho: reasoningFallback,
			});

			try {
				response = await this.postChatCompletions(body, params.abortSignal);
				if (reasoningFallbackApplied) {
					this.rememberReasoningEcho(params.model, reasoningFallback!);
				}
				break;
			} catch (err: any) {
				if (body.stream_options && !includeUsageFallbackApplied && this.isIncludeUsageUnsupportedError(err)) {
					OpenAIProvider.includeUsageUnsupportedBaseURLs.add(this.baseURL);
					includeUsage = false;
					includeUsageFallbackApplied = true;
					continue;
				}
				if (
					!appliedReasoningEcho
					&& !reasoningFallbackApplied
					&& this.canApplyReasoningFallback(params.model)
					&& this.isReasoningContentRequiredError(err)
				) {
					reasoningFallback = { field: 'reasoning_content', includeEmpty: true };
					reasoningFallbackApplied = true;
					continue;
				}
				throw err;
			}
		}

		if (!response) {
			throw new Error('OpenAI API error: streaming retry exhausted');
		}

		yield* this.parseOpenAISSEStream(response.body!);
	}

	private buildChatCompletionsBody(
		params: CreateMessageParams,
		options: {
			readonly stream?: boolean;
			readonly includeUsage?: boolean;
			readonly reasoningEcho?: ProviderReasoningEcho;
		} = {},
	): { body: Record<string, any>; appliedReasoningEcho: boolean } {
		const reasoningEcho = this.resolveReasoningEcho(params.model, options.reasoningEcho);
		const messages = this.convertMessages(params.system, params.messages, reasoningEcho);
		const tools = params.tools ? this.convertTools(params.tools) : undefined;
		const body: Record<string, any> = {
			model: params.model,
			messages,
		};

		if (options.stream) {
			body.stream = true;
			if (options.includeUsage) {
				body.stream_options = { include_usage: true };
			}
		}

		this.applyMaxTokens(body, params.model, params.maxTokens);

		if (tools && tools.length > 0) {
			body.tools = tools;
		}

		return { body, appliedReasoningEcho: !!reasoningEcho };
	}

	private postChatCompletions(body: Record<string, any>, abortSignal?: AbortSignal): Promise<Response> {
		return this.fetchWithErrorHandling(this.buildUrl('/chat/completions'), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${this.getAuthValue()}`, // [Director-Code] B1-1
			},
			body: JSON.stringify(body),
			signal: abortSignal,
		});
	}

	// ========================================================================
	// SSE Stream Parser (uses base readSSELines)
	// ========================================================================

	private async *parseOpenAISSEStream(body: ReadableStream<Uint8Array>): AsyncGenerator<StreamEvent> {
		let finishReason = 'end_turn';
		let usage: TokenUsage = { input_tokens: 0, output_tokens: 0 };

		for await (const data of this.readSSELines(body)) {
			if (data === '[DONE]') {
				yield { type: 'message_complete', usage, stopReason: finishReason };
				return;
			}

			const chunk = this.parseSSEData<OpenAIStreamChunk>(data);
			if (!chunk) { continue; }

			yield* this.processStreamChunk(chunk);

			const choice = chunk.choices?.[0];
			if (choice?.finish_reason) {
				finishReason = this.mapFinishReason(choice.finish_reason);
			}

			if (chunk.usage) {
				usage = {
					input_tokens: chunk.usage.prompt_tokens,
					output_tokens: chunk.usage.completion_tokens,
				};
			}
		}

		yield { type: 'message_complete', usage, stopReason: finishReason };
	}

	private *processStreamChunk(chunk: OpenAIStreamChunk): Generator<StreamEvent> {
		const choice = chunk.choices?.[0];
		if (!choice) { return; }

		const delta = choice.delta;

		if (delta.reasoning_content) {
			yield { type: 'thinking', thinking: delta.reasoning_content };
		}

		if (delta.content) {
			yield { type: 'text', text: delta.content };
		}

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
		reasoningEcho?: ProviderReasoningEcho,
	): OpenAIChatMessage[] {
		const result: OpenAIChatMessage[] = [];

		if (system) {
			result.push({ role: 'system', content: system });
		}

		for (const msg of messages) {
			if (msg.role === 'user') {
				this.convertUserMessage(msg, result);
			} else if (msg.role === 'assistant') {
				this.convertAssistantMessage(msg, result, reasoningEcho);
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

		const textParts: string[] = [];
		const imageParts: OpenAIContentPart[] = [];
		const toolResults: Array<{ tool_use_id: string; content: string }> = [];

		for (const block of msg.content) {
			if (block.type === 'text') {
				textParts.push(block.text);
			} else if (block.type === 'image') {
				const imagePart = this.convertImageBlock(block.source);
				if (imagePart) {
					imageParts.push(imagePart);
				}
			} else if (block.type === 'tool_result') {
				toolResults.push({
					tool_use_id: block.tool_use_id,
					content: block.content,
				});
			}
		}

		for (const tr of toolResults) {
			result.push({
				role: 'tool',
				tool_call_id: tr.tool_use_id,
				content: tr.content,
			});
		}

		if (imageParts.length > 0) {
			result.push({
				role: 'user',
				content: [
					...textParts.filter(Boolean).map(text => ({ type: 'text' as const, text })),
					...imageParts,
				],
			});
		} else if (textParts.length > 0) {
			result.push({ role: 'user', content: textParts.join('\n') });
		}
	}

	private convertAssistantMessage(
		msg: NormalizedMessageParam,
		result: OpenAIChatMessage[],
		reasoningEcho?: ProviderReasoningEcho,
	): void {
		if (typeof msg.content === 'string') {
			const assistantMsg: OpenAIChatMessage = { role: 'assistant', content: msg.content };
			this.applyReasoningEcho(assistantMsg, [], reasoningEcho);
			result.push(assistantMsg);
			return;
		}

		const textParts: string[] = [];
		const toolCalls: OpenAIToolCall[] = [];
		const thinkingParts: string[] = [];

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
			} else if (block.type === 'thinking') {
				thinkingParts.push(block.thinking);
			}
		}

		const assistantMsg: OpenAIChatMessage = {
			role: 'assistant',
			content: textParts.length > 0 ? textParts.join('\n') : null,
		};

		if (toolCalls.length > 0) {
			assistantMsg.tool_calls = toolCalls;
		}

		this.applyReasoningEcho(assistantMsg, thinkingParts, reasoningEcho);
		result.push(assistantMsg);
	}

	private applyReasoningEcho(
		message: OpenAIChatMessage,
		thinkingParts: readonly string[],
		reasoningEcho?: ProviderReasoningEcho,
	): void {
		if (!reasoningEcho) {
			return;
		}
		message.reasoning_content = thinkingParts.length > 0 ? thinkingParts.join('') : '';
	}

	private resolveReasoningEcho(model: string, override?: ProviderReasoningEcho): ProviderReasoningEcho | undefined {
		if (this.capabilities.reasoningEcho === false) {
			return undefined;
		}
		if (this.capabilities.reasoningEcho) {
			return this.capabilities.reasoningEcho;
		}
		if (override) {
			return override;
		}
		const catalogCapabilities = getCatalogCapabilitiesForModel('openai-compatible', model, this.apiType);
		if (catalogCapabilities?.reasoningEcho) {
			return catalogCapabilities.reasoningEcho;
		}
		return OpenAIProvider.reasoningEchoRuntimeCache.get(this.reasoningEchoCacheKey(model));
	}

	private canApplyReasoningFallback(model: string): boolean {
		return this.capabilities.reasoningEcho !== false && !this.resolveReasoningEcho(model);
	}

	private rememberReasoningEcho(model: string, reasoningEcho: ProviderReasoningEcho): void {
		if (this.capabilities.reasoningEcho === false) {
			return;
		}
		OpenAIProvider.reasoningEchoRuntimeCache.set(this.reasoningEchoCacheKey(model), reasoningEcho);
	}

	private reasoningEchoCacheKey(model: string): string {
		return `${this.baseURL.toLowerCase()}::${model.toLowerCase()}`;
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

		if ((choice.message as any).reasoning_content) {
			content.push({ type: 'thinking', thinking: (choice.message as any).reasoning_content });
		}

		if (choice.message.content) {
			content.push({ type: 'text', text: choice.message.content });
		}

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

	private applyMaxTokens(body: Record<string, any>, model: string, maxTokens: number): void {
		if (/^o(?:1|3|4)(?:-|$)/.test(model)) {
			body.max_completion_tokens = maxTokens;
		} else {
			body.max_tokens = maxTokens;
		}
	}

	private convertImageBlock(source: any): OpenAIContentPart | undefined {
		if (!source) {
			return undefined;
		}
		if (typeof source === 'string') {
			return { type: 'image_url', image_url: { url: source } };
		}
		if (typeof source.url === 'string' && source.url) {
			return { type: 'image_url', image_url: { url: source.url } };
		}
		const mediaType = source.media_type || source.mimeType;
		if (typeof source.data === 'string' && typeof mediaType === 'string') {
			return {
				type: 'image_url',
				image_url: { url: `data:${mediaType};base64,${source.data}` },
			};
		}
		return undefined;
	}

	private isIncludeUsageUnsupportedError(err: any): boolean {
		const message = String(err?.message || '');
		return err?.status === 400 && /stream_options|include_usage/i.test(message);
	}

	private isReasoningContentRequiredError(err: any): boolean {
		const message = String(err?.message || '');
		return err?.status === 400
			&& /reasoning_content/i.test(message)
			&& /must be passed back/i.test(message)
			&& !/must\s+not/i.test(message);
	}
}
