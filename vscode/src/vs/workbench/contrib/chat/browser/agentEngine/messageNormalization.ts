/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Message Normalization
 *
 * Converts between VS Code Chat messages (IChatAgentHistoryEntry, IChatAgentRequest)
 * and the Agent Engine's internal Anthropic-like format (NormalizedMessageParam).
 */

import type { IChatAgentHistoryEntry, IChatAgentRequest } from '../../common/participants/chatAgents.js';
import type { NormalizedContentBlock, NormalizedMessageParam } from '../../common/agentEngine/providers/providerTypes.js';
import { IChatToolInvocation } from '../../common/chatService/chatService.js';
import type { IChatProgressResponseContent } from '../../common/model/chatModel.js';

const MAX_INLINE_TOOL_RESULT_CHARS = 4000;
const TOOL_RESULT_HEAD_CHARS = 2500;
const TOOL_RESULT_TAIL_CHARS = 1000;

/**
 * Extract the user's text message from an IChatAgentRequest.
 */
export function requestToUserMessage(request: IChatAgentRequest): string {
	return request.message || '';
}

/**
 * Convert chat history entries into NormalizedMessageParam[] for the Agent Engine.
 *
 * Each history entry has a request (user) and response (assistant) pair.
 * We convert them into the Anthropic-like message format.
 */
export function historyToNormalizedMessages(
	history: IChatAgentHistoryEntry[],
	richResponses?: ReadonlyArray<ReadonlyArray<IChatProgressResponseContent>>,
): NormalizedMessageParam[] {
	if (richResponses && richResponses.length !== history.length) {
		console.warn(`[Director-Code] rich response history length mismatch: history=${history.length}, richResponses=${richResponses.length}; falling back to plain text history.`);
		return historyToPlainTextMessages(history);
	}

	if (!richResponses) {
		return historyToPlainTextMessages(history);
	}

	const messages: NormalizedMessageParam[] = [];

	for (let i = 0; i < history.length; i++) {
		const entry = history[i];
		// User message
		if (entry.request.message) {
			messages.push({
				role: 'user',
				content: entry.request.message,
			});
		}

		messages.push(...richResponseToNormalizedMessages(richResponses[i]));
	}

	return messages;
}

function historyToPlainTextMessages(history: IChatAgentHistoryEntry[]): NormalizedMessageParam[] {
	const messages: NormalizedMessageParam[] = [];

	for (const entry of history) {
		if (entry.request.message) {
			messages.push({
				role: 'user',
				content: entry.request.message,
			});
		}

		const assistantText = extractAssistantText(entry.response);
		if (assistantText) {
			messages.push({
				role: 'assistant',
				content: assistantText,
			});
		}
	}

	return messages;
}

function richResponseToNormalizedMessages(response: ReadonlyArray<IChatProgressResponseContent>): NormalizedMessageParam[] {
	const messages: NormalizedMessageParam[] = [];
	let assistantBlocks: NormalizedContentBlock[] = [];
	let pendingToolResults: NormalizedContentBlock[] = [];

	const flushAssistant = () => {
		if (assistantBlocks.length > 0) {
			messages.push({
				role: 'assistant',
				content: assistantBlocks,
			});
			assistantBlocks = [];
		}
	};

	const flushToolRound = () => {
		if (pendingToolResults.length > 0) {
			flushAssistant();
			messages.push({
				role: 'user',
				content: pendingToolResults,
			});
			pendingToolResults = [];
		}
	};

	for (const part of response) {
		if (part.kind === 'thinking') {
			continue;
		}

		if (part.kind === 'toolInvocation' || part.kind === 'toolInvocationSerialized') {
			const restored = restoreToolInvocation(part);
			if (!restored) {
				continue;
			}
			assistantBlocks.push(restored.toolUse);
			pendingToolResults.push(restored.toolResult);
			continue;
		}

		const text = extractPartText(part);
		if (text) {
			flushToolRound();
			assistantBlocks.push({ type: 'text', text });
		}
	}

	flushToolRound();
	flushAssistant();

	return messages;
}

function restoreToolInvocation(part: IChatProgressResponseContent): { toolUse: NormalizedContentBlock; toolResult: NormalizedContentBlock } | undefined {
	const candidate = part as any;
	if (!IChatToolInvocation.isComplete(candidate)) {
		return undefined;
	}

	const toolUseId = candidate.toolCallId;
	const toolName = candidate.toolId || candidate.generatedTitle || 'unknown';
	if (!toolUseId) {
		return undefined;
	}

	const content = getToolResultText(candidate);
	if (!content) {
		return undefined;
	}

	return {
		toolUse: {
			type: 'tool_use',
			id: toolUseId,
			name: toolName,
			input: restoreToolInput(candidate),
		},
		toolResult: {
			type: 'tool_result',
			tool_use_id: toolUseId,
			content,
			is_error: isToolResultError(candidate) || undefined,
		},
	};
}

function restoreToolInput(part: any): any {
	const parameters = tryGetToolParameters(part);
	if (parameters !== undefined) {
		return normalizeToolInput(parameters);
	}

	const data = part.toolSpecificData;
	if (!data) {
		return { _note: 'arguments not available' };
	}

	switch (data.kind) {
		case 'input':
			return normalizeToolInput(data.rawInput);
		case 'terminal':
			return { input: data.input ?? data.commandLine ?? data.command ?? '' };
		case 'simpleToolInvocation':
			return { input: data.input ?? '' };
		case 'todoList':
			return { todoList: data.todoList ?? [] };
		case 'subagent':
			return {
				agentName: data.agentName,
				prompt: data.prompt,
				description: data.description,
			};
		case 'resources':
			return { values: (data.values ?? []).map((value: any) => String(value)) };
		case 'extensions':
			return { extensions: data.extensions ?? [] };
		case 'pullRequest':
			return { title: data.title, author: data.author, linkTag: data.linkTag };
		case 'modifiedFilesConfirmation':
			return { modifiedFiles: data.modifiedFiles ?? [], options: data.options ?? [] };
		default:
			return { _note: 'arguments not available' };
	}
}

function tryGetToolParameters(part: any): unknown | undefined {
	try {
		return IChatToolInvocation.getParameters(part);
	} catch {
		return undefined;
	}
}

function normalizeToolInput(value: unknown): any {
	if (value === undefined || value === null) {
		return { _note: 'arguments not available' };
	}
	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (!trimmed) {
			return { _note: 'arguments not available' };
		}
		try {
			return JSON.parse(trimmed);
		} catch {
			return { input: value };
		}
	}
	if (typeof value === 'object') {
		return value;
	}
	return { input: value };
}

function getToolResultText(part: any): string | undefined {
	const state = tryGetToolState(part);
	const contentForModel = Array.isArray(state?.contentForModel) ? state.contentForModel : undefined;
	const fromContent = contentForModel ? stringifyToolResultParts(contentForModel) : undefined;
	if (fromContent) {
		return normalizeToolResultText(fromContent);
	}

	const data = part.toolSpecificData;
	if (data?.kind === 'simpleToolInvocation' && data.output) {
		return normalizeToolResultText(String(data.output));
	}
	if (data?.kind === 'terminal' && data.output) {
		return normalizeToolResultText(String(data.output));
	}
	if (data?.kind === 'subagent' && data.result) {
		return normalizeToolResultText(String(data.result));
	}

	const details = IChatToolInvocation.resultDetails(part) ?? part.resultDetails ?? state?.resultDetails;
	const fromDetails = stringifyResultDetails(details);
	if (fromDetails) {
		return normalizeToolResultText(fromDetails);
	}

	return undefined;
}

function tryGetToolState(part: any): any | undefined {
	try {
		return part.state?.get?.() ?? part.state?.read?.();
	} catch {
		return undefined;
	}
}

function isToolResultError(part: any): boolean {
	const state = tryGetToolState(part);
	const details = IChatToolInvocation.resultDetails(part) ?? part.resultDetails ?? state?.resultDetails;
	return !!details?.isError || !!part.errorMessage;
}

function stringifyToolResultParts(parts: readonly any[]): string {
	const values: string[] = [];
	for (const part of parts) {
		if (part.kind === 'text' || part.type === 'text') {
			values.push(String(part.value ?? ''));
		} else if (part.kind === 'promptTsx' || part.type === 'prompt_tsx') {
			values.push(safeJson(part.value));
		} else if (part.kind === 'data' || part.type === 'data') {
			const mimeType = part.value?.mimeType ?? part.mimeType ?? 'application/octet-stream';
			const byteLength = part.value?.data?.byteLength ?? part.data?.byteLength;
			values.push(binaryPlaceholder(mimeType, byteLength));
		}
	}
	return values.filter(Boolean).join('\n');
}

function stringifyResultDetails(details: any): string | undefined {
	if (!details) {
		return undefined;
	}
	if (Array.isArray(details)) {
		return details.map(value => `[Tool output reference: ${String(value)}]`).join('\n');
	}
	if (details.output?.type === 'data' && details.output?.mimeType) {
		const byteLength = details.output.value?.byteLength ?? estimatedBase64Bytes(details.output.base64Data);
		return binaryPlaceholder(details.output.mimeType, byteLength);
	}
	if (Array.isArray(details.output)) {
		const values = details.output.map((output: any) => {
			if (output.type === 'embed') {
				if (output.isText) {
					return output.value;
				}
				return binaryPlaceholder(output.mimeType ?? 'application/octet-stream', estimatedBase64Bytes(output.value));
			}
			if (output.type === 'ref') {
				return `[Tool output reference: ${String(output.uri)}]`;
			}
			return safeJson(output);
		});
		return values.filter(Boolean).join('\n');
	}
	return undefined;
}

function normalizeToolResultText(value: string): string {
	const binary = binaryPlaceholderForString(value);
	if (binary) {
		return binary;
	}
	if (value.length < MAX_INLINE_TOOL_RESULT_CHARS) {
		return value;
	}
	return `${value.slice(0, TOOL_RESULT_HEAD_CHARS)}\n...(truncated)...\n${value.slice(-TOOL_RESULT_TAIL_CHARS)}`;
}

function binaryPlaceholderForString(value: string): string | undefined {
	const dataUri = /^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/i.exec(value.trim());
	if (dataUri) {
		return binaryPlaceholder(dataUri[1], estimatedBase64Bytes(dataUri[2]));
	}

	const trimmed = value.trim();
	if (trimmed.length > 500 && /^[A-Za-z0-9+/=]{500,}$/.test(trimmed) && !/\s/.test(value)) {
		return binaryPlaceholder('application/octet-stream', estimatedBase64Bytes(trimmed));
	}
	return undefined;
}

function binaryPlaceholder(mimeType: string, byteLength?: number): string {
	const size = typeof byteLength === 'number' && Number.isFinite(byteLength)
		? `, ${Math.max(1, Math.round(byteLength / 1024))}KB`
		: '';
	return `[Binary data: ${mimeType}${size}]`;
}

function estimatedBase64Bytes(value: string | undefined): number | undefined {
	if (!value) {
		return undefined;
	}
	return Math.floor(value.replace(/=+$/, '').length * 3 / 4);
}

function safeJson(value: unknown): string {
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

/**
 * Extract text content from chat response history parts.
 *
 * Response parts can be various types (markdown, progress messages, etc.).
 * We extract meaningful text content for conversation context.
 */
function extractAssistantText(
	response: ReadonlyArray<any>,
): string {
	const textParts: string[] = [];

	for (const part of response) {
		if (part.kind === 'markdownContent' && part.content) {
			// IChatMarkdownContent
			const value = typeof part.content === 'string'
				? part.content
				: part.content.value;
			if (value) {
				textParts.push(value);
			}
		} else if (part.kind === 'text' && part.value) {
			// Plain text content
			textParts.push(part.value);
		}
		// Skip thinking parts, progress messages, tool invocations, etc.
		// — they are internal state, not conversation content
	}

	return textParts.join('\n');
}

function extractPartText(part: any): string {
	if (part.kind === 'markdownContent' && part.content) {
		return typeof part.content === 'string'
			? part.content
			: part.content.value ?? '';
	}
	if (part.kind === 'text' && part.value) {
		return part.value;
	}
	return '';
}
