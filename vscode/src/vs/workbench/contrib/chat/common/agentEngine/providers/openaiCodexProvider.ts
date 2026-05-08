/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * OpenAI ChatGPT/Codex backend provider.
 *
 * This is intentionally separate from OpenAIProvider, which targets
 * api.openai.com/v1/chat/completions. OpenAI OAuth tokens are scoped for the
 * ChatGPT Codex backend at chatgpt.com/backend-api/codex.
 */

import type {
	ApiType,
	CreateMessageParams,
	CreateMessageResponse,
	NormalizedContentBlock,
	NormalizedMessageParam,
	NormalizedResponseBlock,
	NormalizedTool,
	StreamEvent,
	TokenUsage,
} from './providerTypes.js';
import { AbstractDirectorCodeProvider } from './abstractProvider.js';

const CODEX_BETA_HEADER = 'responses=experimental';
const CODEX_ORIGINATOR = 'director-code';

type CodexInputItem =
	| { role: 'user' | 'assistant'; content: string }
	| { type: 'function_call'; call_id: string; name: string; arguments: string }
	| { type: 'function_call_output'; call_id: string; output: string };

interface OpenAICodexTool {
	type: 'function';
	name: string;
	description: string;
	parameters: Record<string, any>;
	strict: false;
}

interface OpenAICodexResponse {
	id?: string;
	status?: string;
	output?: CodexOutputItem[];
	usage?: CodexUsage;
	error?: { type?: string; message?: string };
}

interface CodexUsage {
	input_tokens?: number;
	output_tokens?: number;
	total_tokens?: number;
	input_tokens_details?: {
		cached_tokens?: number;
	};
}

type CodexOutputItem =
	| CodexMessageOutputItem
	| CodexFunctionCallOutputItem
	| CodexReasoningOutputItem
	| Record<string, any>;

interface CodexMessageOutputItem {
	type: 'message';
	role?: 'assistant';
	content?: Array<{
		type?: string;
		text?: string;
	}>;
}

interface CodexFunctionCallOutputItem {
	type: 'function_call';
	id?: string;
	call_id?: string;
	name?: string;
	arguments?: string;
}

interface CodexReasoningOutputItem {
	type: 'reasoning';
	content?: Array<{ type?: string; text?: string }>;
	summary?: Array<{ type?: string; text?: string }>;
}

interface OpenAICodexStreamEvent {
	type?: string;
	delta?: string;
	output_index?: number;
	item_id?: string;
	item?: CodexOutputItem;
	response?: OpenAICodexResponse;
	error?: { type?: string; message?: string };
}

function stringifyJson(value: any): string {
	return typeof value === 'string' ? value : JSON.stringify(value ?? {});
}

function parseMaybeJson(value: string | undefined): any {
	if (!value) {
		return {};
	}
	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
}

function decodeBase64UrlText(value: string): string | undefined {
	try {
		const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
		const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
		const binary = atob(padded);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		return new TextDecoder().decode(bytes);
	} catch {
		return undefined;
	}
}

function extractChatGPTAccountId(accessToken: string): string | undefined {
	const parts = accessToken.split('.');
	if (parts.length !== 3) {
		return undefined;
	}

	const payloadText = decodeBase64UrlText(parts[1]);
	if (!payloadText) {
		return undefined;
	}

	try {
		const payload = JSON.parse(payloadText);
		const authClaim = payload?.['https://api.openai.com/auth'];
		return typeof authClaim?.chatgpt_account_id === 'string'
			? authClaim.chatgpt_account_id
			: undefined;
	} catch {
		return undefined;
	}
}

// ============================================================================
// OpenAICodexProvider
// ============================================================================

export class OpenAICodexProvider extends AbstractDirectorCodeProvider {
	readonly apiType = 'openai-codex' as const;

	protected getApiType(): ApiType { return 'openai-codex'; }
	protected getDefaultBaseURL(): string { return 'https://chatgpt.com/backend-api/codex'; }
	protected getProviderName(): string { return 'OpenAI Codex'; }

	async createMessage(params: CreateMessageParams): Promise<CreateMessageResponse> {
		const response = await this.fetchWithErrorHandling(`${this.baseURL}/responses`, {
			method: 'POST',
			headers: this.buildHeaders(false),
			body: JSON.stringify(this.buildRequestBody(params, false)),
			signal: params.abortSignal,
		});

		const data = (await response.json()) as OpenAICodexResponse;
		return this.convertResponse(data);
	}

	async *createMessageStream(params: CreateMessageParams): AsyncGenerator<StreamEvent> {
		const response = await this.fetchWithErrorHandling(`${this.baseURL}/responses`, {
			method: 'POST',
			headers: this.buildHeaders(true),
			body: JSON.stringify(this.buildRequestBody(params, true)),
			signal: params.abortSignal,
		});

		if (!response.body) {
			yield { type: 'message_complete', usage: { input_tokens: 0, output_tokens: 0 }, stopReason: 'end_turn' };
			return;
		}

		yield* this.parseCodexSSEStream(response.body);
	}

	private buildHeaders(stream: boolean): Record<string, string> {
		if (this.auth.kind !== 'bearer') {
			throw new Error('OpenAI Codex transport requires an OAuth bearer token.');
		}

		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			'Accept': stream ? 'text/event-stream' : 'application/json',
			'Authorization': `Bearer ${this.auth.accessToken}`,
			'OpenAI-Beta': CODEX_BETA_HEADER,
			'originator': CODEX_ORIGINATOR,
		};

		const accountId = extractChatGPTAccountId(this.auth.accessToken);
		if (accountId) {
			headers['chatgpt-account-id'] = accountId;
		}

		return headers;
	}

	private buildRequestBody(params: CreateMessageParams, stream: boolean): Record<string, any> {
		const tools = params.tools ? this.convertTools(params.tools) : undefined;
		const body: Record<string, any> = {
			model: params.model,
			store: false,
			instructions: params.system || '',
			input: this.convertMessages(params.messages),
			tool_choice: 'auto',
			parallel_tool_calls: true,
		};

		if (stream) {
			body.stream = true;
		}

		if (tools && tools.length > 0) {
			body.tools = tools;
		}

		return body;
	}

	private convertMessages(messages: readonly NormalizedMessageParam[]): CodexInputItem[] {
		const result: CodexInputItem[] = [];
		for (const message of messages) {
			if (typeof message.content === 'string') {
				result.push({ role: message.role, content: message.content });
				continue;
			}

			this.convertContentBlocks(message.role, message.content, result);
		}
		return result;
	}

	private convertContentBlocks(
		role: 'user' | 'assistant',
		blocks: readonly NormalizedContentBlock[],
		result: CodexInputItem[],
	): void {
		let textParts: string[] = [];
		const flushText = () => {
			if (textParts.length === 0) {
				return;
			}
			result.push({ role, content: textParts.join('\n') });
			textParts = [];
		};

		for (const block of blocks) {
			switch (block.type) {
				case 'text':
					textParts.push(block.text);
					break;
				case 'tool_use':
					flushText();
					if (role === 'assistant') {
						result.push({
							type: 'function_call',
							call_id: this.toCodexCallId(block.id),
							name: block.name,
							arguments: stringifyJson(block.input),
						});
					}
					break;
				case 'tool_result':
					flushText();
					result.push({
						type: 'function_call_output',
						call_id: this.toCodexCallId(block.tool_use_id),
						output: block.content,
					});
					break;
				case 'image':
					console.warn('[OpenAI-Codex] vision input not verified, dropped image block');
					break;
				case 'thinking':
					break;
			}
		}

		flushText();
	}

	private convertTools(tools: readonly NormalizedTool[]): OpenAICodexTool[] {
		return tools.map(tool => ({
			type: 'function' as const,
			name: tool.name,
			description: tool.description,
			parameters: tool.input_schema,
			strict: false,
		}));
	}

	private async *parseCodexSSEStream(body: ReadableStream<Uint8Array>): AsyncGenerator<StreamEvent> {
		let usage: TokenUsage = { input_tokens: 0, output_tokens: 0 };
		let stopReason = 'end_turn';
		let hasTextDelta = false;
		const emittedToolStarts = new Set<string>();
		let hasArgumentDelta = false;

		for await (const data of this.readSSELines(body)) {
			if (data === '[DONE]') {
				yield { type: 'message_complete', usage, stopReason };
				return;
			}

			const event = this.parseSSEData<OpenAICodexStreamEvent>(data);
			if (!event?.type) {
				continue;
			}

			if (event.type === 'response.output_text.delta' || event.type.includes('output_text.delta')) {
				if (event.delta) {
					hasTextDelta = true;
					yield { type: 'text', text: event.delta };
				}
				continue;
			}

			if (event.type.includes('reasoning') && event.type.includes('delta') && event.delta) {
				yield { type: 'thinking', thinking: event.delta };
				continue;
			}

			if (event.type.includes('function_call_arguments.delta') && event.delta) {
				hasArgumentDelta = true;
				yield {
					type: 'tool_input_delta',
					json: event.delta,
					index: event.output_index,
				};
				continue;
			}

			if (event.type === 'response.output_item.added' && this.isFunctionCallItem(event.item)) {
				yield* this.emitFunctionCallStart(event.item, emittedToolStarts, event.output_index);
				continue;
			}

			if (event.type === 'response.output_item.done' && event.item) {
				const willEmitText: boolean = !hasTextDelta && this.extractTextFromOutputItem(event.item).length > 0;
				yield* this.emitOutputItemDone(event.item, emittedToolStarts, hasTextDelta, hasArgumentDelta, event.output_index);
				hasTextDelta = hasTextDelta || willEmitText;
				continue;
			}

			if (event.type === 'response.completed' && event.response) {
				usage = this.convertUsage(event.response.usage);
				stopReason = this.inferStopReason(event.response);
				yield* this.emitResponseOutput(event.response, emittedToolStarts, hasTextDelta, hasArgumentDelta);
				yield { type: 'message_complete', usage, stopReason };
				return;
			}

			if (event.type === 'response.incomplete' && event.response) {
				usage = this.convertUsage(event.response.usage);
				stopReason = 'max_tokens';
				yield* this.emitResponseOutput(event.response, emittedToolStarts, hasTextDelta, hasArgumentDelta);
				yield { type: 'message_complete', usage, stopReason };
				return;
			}

			if (event.type === 'response.failed') {
				throw new Error(`OpenAI Codex response failed: ${event.error?.message || event.response?.error?.message || 'unknown error'}`);
			}
		}

		yield { type: 'message_complete', usage, stopReason };
	}

	private *emitResponseOutput(
		response: OpenAICodexResponse,
		emittedToolStarts: Set<string>,
		hasTextDelta: boolean,
		hasArgumentDelta: boolean,
	): Generator<StreamEvent> {
		for (const item of response.output ?? []) {
			yield* this.emitOutputItemDone(item, emittedToolStarts, hasTextDelta, hasArgumentDelta);
		}
	}

	private *emitOutputItemDone(
		item: CodexOutputItem,
		emittedToolStarts: Set<string>,
		hasTextDelta: boolean,
		hasArgumentDelta: boolean,
		index?: number,
	): Generator<StreamEvent> {
		if (this.isFunctionCallItem(item)) {
			yield* this.emitFunctionCallStart(item, emittedToolStarts, index);
			if (!hasArgumentDelta && item.arguments) {
				yield { type: 'tool_input_delta', json: item.arguments, index };
			}
			return;
		}

		if (hasTextDelta) {
			return;
		}

		for (const text of this.extractTextFromOutputItem(item)) {
			yield { type: 'text', text };
		}
	}

	private *emitFunctionCallStart(
		item: CodexFunctionCallOutputItem,
		emittedToolStarts: Set<string>,
		index?: number,
	): Generator<StreamEvent> {
		const id = item.call_id || item.id;
		if (!id || !item.name || emittedToolStarts.has(id)) {
			return;
		}
		emittedToolStarts.add(id);
		yield { type: 'tool_use_start', id, name: item.name, index };
	}

	private convertResponse(data: OpenAICodexResponse): CreateMessageResponse {
		const content: NormalizedResponseBlock[] = [];
		for (const item of data.output ?? []) {
			if (this.isFunctionCallItem(item)) {
				content.push({
					type: 'tool_use',
					id: item.call_id || item.id || this.toCodexCallId(item.name || 'tool'),
					name: item.name || 'tool',
					input: parseMaybeJson(item.arguments),
				});
				continue;
			}

			if (this.isReasoningItem(item)) {
				for (const thinking of this.extractReasoningText(item)) {
					content.push({ type: 'thinking', thinking });
				}
				continue;
			}

			for (const text of this.extractTextFromOutputItem(item)) {
				content.push({ type: 'text', text });
			}
		}

		if (content.length === 0) {
			content.push({ type: 'text', text: '' });
		}

		return {
			content,
			stopReason: this.inferStopReason(data),
			usage: this.convertUsage(data.usage),
		};
	}

	private convertUsage(usage: CodexUsage | undefined): TokenUsage {
		return {
			input_tokens: usage?.input_tokens ?? 0,
			output_tokens: usage?.output_tokens ?? 0,
			cache_read_input_tokens: usage?.input_tokens_details?.cached_tokens,
		};
	}

	private inferStopReason(response: OpenAICodexResponse): string {
		if ((response.output ?? []).some(item => this.isFunctionCallItem(item))) {
			return 'tool_use';
		}
		if (response.status === 'incomplete') {
			return 'max_tokens';
		}
		if (response.status === 'failed') {
			return 'error';
		}
		return 'end_turn';
	}

	private extractTextFromOutputItem(item: CodexOutputItem): string[] {
		if (!this.isMessageItem(item)) {
			return [];
		}

		return (item.content ?? [])
			.filter(part => part.type === 'output_text' || part.type === 'text')
			.map(part => part.text || '')
			.filter(text => text.length > 0);
	}

	private extractReasoningText(item: CodexReasoningOutputItem): string[] {
		return [...(item.summary ?? []), ...(item.content ?? [])]
			.map(part => part.text || '')
			.filter(text => text.length > 0);
	}

	private isMessageItem(item: CodexOutputItem | undefined): item is CodexMessageOutputItem {
		return item?.type === 'message';
	}

	private isFunctionCallItem(item: CodexOutputItem | undefined): item is CodexFunctionCallOutputItem {
		return item?.type === 'function_call';
	}

	private isReasoningItem(item: CodexOutputItem | undefined): item is CodexReasoningOutputItem {
		return item?.type === 'reasoning';
	}

	private toCodexCallId(id: string): string {
		if (id.startsWith('call_')) {
			return id;
		}
		if (id.startsWith('fc_')) {
			return `call_${id.slice(3)}`;
		}
		const sanitized = id.replace(/[^A-Za-z0-9_-]/g, '_') || 'tool';
		return sanitized.startsWith('call_') ? sanitized : `call_${sanitized}`;
	}
}
