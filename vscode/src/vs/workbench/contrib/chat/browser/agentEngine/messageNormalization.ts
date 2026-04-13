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
import type { NormalizedMessageParam } from '../../common/agentEngine/providers/providerTypes.js';

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
export function historyToNormalizedMessages(history: IChatAgentHistoryEntry[]): NormalizedMessageParam[] {
	const messages: NormalizedMessageParam[] = [];

	for (const entry of history) {
		// User message
		if (entry.request.message) {
			messages.push({
				role: 'user',
				content: entry.request.message,
			});
		}

		// Assistant response — extract text content from response parts
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
