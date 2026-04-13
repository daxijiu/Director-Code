/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Progress Bridge
 *
 * Converts Agent Engine events (AgentEvent) into VS Code Chat UI
 * progress items (IChatProgress[]) that can be rendered in the Chat panel.
 */

import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import type { AgentEvent } from '../../common/agentEngine/agentEngineTypes.js';
import type { IChatProgress, IChatMarkdownContent, IChatProgressMessage, IChatThinkingPart } from '../../common/chatService/chatService.js';

/**
 * Convert an AgentEvent from the agentic loop into IChatProgress items
 * that can be passed to the VS Code Chat UI via the progress() callback.
 *
 * @returns An array of IChatProgress items, or empty array for events
 *          that don't produce UI output (e.g., 'result' events).
 */
export function agentEventToProgress(event: AgentEvent): IChatProgress[] {
	switch (event.type) {
		case 'assistant':
			return convertAssistantEvent(event);

		case 'tool_use':
			return convertToolUseEvent(event);

		case 'tool_result':
			return convertToolResultEvent(event);

		case 'system':
			return convertSystemEvent(event);

		case 'result':
			// Result events are handled by the invoke() return value,
			// not through progress. Return empty.
			return [];

		default:
			return [];
	}
}

// ============================================================================
// Assistant Event → Markdown Content + Thinking
// ============================================================================

function convertAssistantEvent(event: AgentEvent & { type: 'assistant' }): IChatProgress[] {
	const parts: IChatProgress[] = [];
	const content = event.message.content;

	// Handle string content (defensive — providers should return blocks)
	if (typeof content === 'string') {
		if (content) {
			const markdownContent: IChatMarkdownContent = {
				kind: 'markdownContent',
				content: new MarkdownString(content),
			};
			parts.push(markdownContent);
		}
		return parts;
	}

	for (const block of content) {
		if (block.type === 'text' && block.text) {
			const markdownContent: IChatMarkdownContent = {
				kind: 'markdownContent',
				content: new MarkdownString(block.text),
			};
			parts.push(markdownContent);
		} else if (block.type === 'thinking' && block.thinking) {
			const thinkingPart: IChatThinkingPart = {
				kind: 'thinking',
				value: block.thinking,
			};
			parts.push(thinkingPart);
		}
		// tool_use blocks are handled separately via tool_use events
	}

	return parts;
}

// ============================================================================
// Tool Use Event → Progress Message
// ============================================================================

function convertToolUseEvent(event: AgentEvent & { type: 'tool_use' }): IChatProgress[] {
	// Show a progress message indicating tool invocation
	const msg: IChatProgressMessage = {
		kind: 'progressMessage',
		content: new MarkdownString(`Using tool: **${(event as any).tool_name || 'unknown'}**`),
	};
	return [msg];
}

// ============================================================================
// Tool Result Event → Progress Message
// ============================================================================

function convertToolResultEvent(event: AgentEvent & { type: 'tool_result' }): IChatProgress[] {
	const resultEvent = event as any;
	const toolName = resultEvent.tool_name || 'tool';
	const isError = resultEvent.is_error;
	const content = resultEvent.content || '';

	// Truncate long results for the progress message
	const truncated = content.length > 200
		? content.substring(0, 200) + '...'
		: content;

	const prefix = isError ? `Tool **${toolName}** error` : `Tool **${toolName}** result`;

	const msg: IChatProgressMessage = {
		kind: 'progressMessage',
		content: new MarkdownString(`${prefix}: ${truncated}`),
	};
	return [msg];
}

// ============================================================================
// System Event → Progress Message
// ============================================================================

function convertSystemEvent(event: AgentEvent & { type: 'system' }): IChatProgress[] {
	const sysEvent = event as any;
	let message: string;

	switch (sysEvent.subtype) {
		case 'init':
			message = `Agent initialized (model: ${sysEvent.model || 'unknown'})`;
			break;
		case 'compact_boundary':
			message = 'Conversation compacted to save context space';
			break;
		default:
			message = sysEvent.message || 'Agent status update';
			break;
	}

	const msg: IChatProgressMessage = {
		kind: 'progressMessage',
		content: new MarkdownString(message),
		shimmer: sysEvent.subtype === 'init',
	};
	return [msg];
}
