/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Google Gemini Generative AI Provider
 *
 * Converts between the Agent Engine's internal Anthropic-like message format
 * and Google's Gemini Generative AI REST API format.
 *
 * Uses native fetch — no Google SDK dependency required.
 *
 * API Reference:
 *   Non-streaming: POST /v1beta/models/{model}:generateContent
 *   Streaming:     POST /v1beta/models/{model}:streamGenerateContent?alt=sse
 *
 * Supports:
 *   - Text generation
 *   - Function calling (tool_use ↔ functionCall/functionResponse)
 *   - Extended thinking (Gemini 2.5 models via thinkingConfig)
 *   - Streaming via SSE
 */

import type {
	CreateMessageParams,
	CreateMessageResponse,
	StreamEvent,
	NormalizedMessageParam,
	NormalizedContentBlock,
	NormalizedTool,
	NormalizedResponseBlock,
	TokenUsage,
	ApiType,
} from './providerTypes.js';
import { AbstractDirectorCodeProvider } from './abstractProvider.js';

// ============================================================================
// Gemini-specific types
// ============================================================================

interface GeminiContent {
	role: 'user' | 'model';
	parts: GeminiPart[];
}

type GeminiPart =
	| { text: string; thought?: boolean }
	| { functionCall: { name: string; args: Record<string, any> } }
	| { functionResponse: { name: string; response: { result: string } } }
	| { inlineData: { mimeType: string; data: string } };

interface GeminiFunctionDeclaration {
	name: string;
	description: string;
	parameters: Record<string, any>;
}

interface GeminiTool {
	functionDeclarations: GeminiFunctionDeclaration[];
}

interface GeminiCandidate {
	content: GeminiContent;
	finishReason?: string;
}

interface GeminiUsageMetadata {
	promptTokenCount?: number;
	candidatesTokenCount?: number;
	totalTokenCount?: number;
	cachedContentTokenCount?: number;
}

interface GeminiResponse {
	candidates?: GeminiCandidate[];
	usageMetadata?: GeminiUsageMetadata;
	error?: { code: number; message: string; status: string };
}

// ============================================================================
// Tool ID generation
// ============================================================================

let geminiCallCounter = 0;

function generateGeminiToolId(name: string): string {
	return `gemini_call_${++geminiCallCounter}_${name}`;
}

// ============================================================================
// GeminiProvider
// ============================================================================

export class GeminiProvider extends AbstractDirectorCodeProvider {
	readonly apiType = 'gemini-generative' as const;

	protected getApiType(): ApiType { return 'gemini-generative'; }
	protected getDefaultBaseURL(): string { return 'https://generativelanguage.googleapis.com'; }
	protected getProviderName(): string { return 'Gemini'; }

	// ========================================================================
	// Non-streaming
	// ========================================================================

	async createMessage(params: CreateMessageParams): Promise<CreateMessageResponse> {
		const body = this.buildRequestBody(params);
		const url = `${this.baseURL}/v1beta/models/${params.model}:generateContent?key=${this.apiKey}`;

		const response = await this.fetchWithErrorHandling(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
			signal: params.abortSignal,
		});

		const data = (await response.json()) as GeminiResponse;

		if (data.error) {
			const err: any = new Error(
				`Gemini API error: ${data.error.code} ${data.error.status}: ${data.error.message}`,
			);
			err.status = data.error.code;
			throw err;
		}

		return this.convertResponse(data);
	}

	// ========================================================================
	// Streaming
	// ========================================================================

	async *createMessageStream(params: CreateMessageParams): AsyncGenerator<StreamEvent> {
		const body = this.buildRequestBody(params);
		const url = `${this.baseURL}/v1beta/models/${params.model}:streamGenerateContent?alt=sse&key=${this.apiKey}`;

		const response = await this.fetchWithErrorHandling(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
			signal: params.abortSignal,
		});

		yield* this.parseGeminiSSEStream(response.body!);
	}

	// ========================================================================
	// SSE Stream Parser (uses base readSSELines)
	// ========================================================================

	private async *parseGeminiSSEStream(body: ReadableStream<Uint8Array>): AsyncGenerator<StreamEvent> {
		let usage: TokenUsage = { input_tokens: 0, output_tokens: 0 };
		let finishReason = 'end_turn';

		for await (const data of this.readSSELines(body)) {
			const chunk = this.parseSSEData<GeminiResponse>(data);
			if (!chunk) { continue; }

			if (chunk.candidates) {
				for (const candidate of chunk.candidates) {
					if (candidate.content?.parts) {
						for (const part of candidate.content.parts) {
							yield* this.processStreamPart(part);
						}
					}
					if (candidate.finishReason) {
						finishReason = this.mapFinishReason(candidate.finishReason);
					}
				}
			}

			if (chunk.usageMetadata) {
				usage = {
					input_tokens: chunk.usageMetadata.promptTokenCount || 0,
					output_tokens: chunk.usageMetadata.candidatesTokenCount || 0,
				};
			}
		}

		yield { type: 'message_complete', usage, stopReason: finishReason };
	}

	private *processStreamPart(part: GeminiPart): Generator<StreamEvent> {
		if ('text' in part) {
			if (part.thought) {
				yield { type: 'thinking', thinking: part.text };
			} else {
				yield { type: 'text', text: part.text };
			}
		} else if ('functionCall' in part) {
			const fc = part.functionCall;
			const id = generateGeminiToolId(fc.name);
			yield { type: 'tool_use_start', id, name: fc.name };
			yield { type: 'tool_input_delta', json: JSON.stringify(fc.args || {}) };
		}
	}

	// ========================================================================
	// Request Body Builder
	// ========================================================================

	private buildRequestBody(params: CreateMessageParams): Record<string, any> {
		const contents = this.convertMessages(params.messages);

		const body: Record<string, any> = {
			contents,
			generationConfig: {
				maxOutputTokens: params.maxTokens,
			},
		};

		if (params.system) {
			body.systemInstruction = { parts: [{ text: params.system }] };
		}

		if (params.tools && params.tools.length > 0) {
			body.tools = this.convertTools(params.tools);
		}

		if (params.thinking?.type === 'enabled' && params.thinking.budget_tokens) {
			body.generationConfig.thinkingConfig = {
				thinkingBudget: params.thinking.budget_tokens,
			};
		}

		return body;
	}

	// ========================================================================
	// Message Conversion: Internal (Anthropic-like) → Gemini
	// ========================================================================

	private convertMessages(messages: readonly NormalizedMessageParam[]): GeminiContent[] {
		const result: GeminiContent[] = [];
		const toolNameMap = new Map<string, string>();

		for (const msg of messages) {
			const parts: GeminiPart[] = [];
			const blocks: readonly NormalizedContentBlock[] = typeof msg.content === 'string'
				? [{ type: 'text' as const, text: msg.content }]
				: msg.content;

			for (const block of blocks) {
				switch (block.type) {
					case 'text':
						if (block.text) {
							parts.push({ text: block.text });
						}
						break;

					case 'tool_use':
						toolNameMap.set(block.id, block.name);
						parts.push({
							functionCall: {
								name: block.name,
								args: typeof block.input === 'object' ? block.input : {},
							},
						});
						break;

					case 'tool_result': {
						const name = toolNameMap.get(block.tool_use_id) || 'unknown';
						parts.push({
							functionResponse: {
								name,
								response: { result: block.content },
							},
						});
						break;
					}

					case 'thinking':
						parts.push({ text: block.thinking, thought: true });
						break;

					case 'image':
						if (block.source?.data && block.source?.media_type) {
							parts.push({
								inlineData: {
									mimeType: block.source.media_type,
									data: block.source.data,
								},
							});
						}
						break;
				}
			}

			if (parts.length > 0) {
				result.push({
					role: msg.role === 'assistant' ? 'model' : 'user',
					parts,
				});
			}
		}

		return result;
	}

	// ========================================================================
	// Tool Conversion: Internal → Gemini
	// ========================================================================

	private convertTools(tools: readonly NormalizedTool[]): GeminiTool[] {
		return [{
			functionDeclarations: tools.map((t) => ({
				name: t.name,
				description: t.description,
				parameters: t.input_schema,
			})),
		}];
	}

	// ========================================================================
	// Response Conversion: Gemini → Internal
	// ========================================================================

	private convertResponse(data: GeminiResponse): CreateMessageResponse {
		const candidate = data.candidates?.[0];
		if (!candidate) {
			return {
				content: [{ type: 'text', text: '' }],
				stopReason: 'end_turn',
				usage: { input_tokens: 0, output_tokens: 0 },
			};
		}

		const content: NormalizedResponseBlock[] = [];

		for (const part of candidate.content?.parts || []) {
			if ('text' in part && !part.thought) {
				content.push({ type: 'text', text: part.text });
			} else if ('functionCall' in part) {
				const fc = part.functionCall;
				content.push({
					type: 'tool_use',
					id: generateGeminiToolId(fc.name),
					name: fc.name,
					input: fc.args || {},
				});
			}
		}

		if (content.length === 0) {
			content.push({ type: 'text', text: '' });
		}

		const stopReason = this.mapFinishReason(candidate.finishReason || 'STOP');

		const usage: TokenUsage = {
			input_tokens: data.usageMetadata?.promptTokenCount || 0,
			output_tokens: data.usageMetadata?.candidatesTokenCount || 0,
		};

		return { content, stopReason, usage };
	}

	// ========================================================================
	// Finish Reason Mapping
	// ========================================================================

	private mapFinishReason(reason: string): 'end_turn' | 'max_tokens' | 'tool_use' | string {
		switch (reason) {
			case 'STOP':
				return 'end_turn';
			case 'MAX_TOKENS':
				return 'max_tokens';
			case 'SAFETY':
			case 'RECITATION':
				return 'content_filter';
			case 'TOOL_CALLS':
			case 'FUNCTION_CALL':
				return 'tool_use';
			default:
				return reason.toLowerCase();
		}
	}
}
