/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Context Compression / Auto-Compaction
 *
 * Summarizes long conversation histories when context window fills up.
 * Three-tier system:
 * 1. Auto-compact: triggered when tokens exceed threshold
 * 2. Micro-compact: truncates large tool results per-request
 * 3. LLM-based summarization: replaces history with summary
 *
 * Ported from open-agent-sdk-typescript/src/utils/compact.ts
 */

import type { LLMProvider, NormalizedMessageParam } from './providers/providerTypes.js';
import type { AutoCompactState } from './agentEngineTypes.js';
import { estimateMessagesTokens, getAutoCompactThreshold, AUTOCOMPACT_BUFFER_TOKENS } from './tokens.js';

// --------------------------------------------------------------------------
// Auto-Compact State
// --------------------------------------------------------------------------

export function createAutoCompactState(): AutoCompactState {
	return {
		compacted: false,
		turnCounter: 0,
		consecutiveFailures: 0,
	};
}

// --------------------------------------------------------------------------
// Should Auto-Compact
// --------------------------------------------------------------------------

export function shouldAutoCompact(
	messages: any[],
	model: string,
	state: AutoCompactState,
	maxInputTokensOverride?: number,
): boolean {
	if (state.consecutiveFailures >= 3) { return false; }

	const estimatedTokens = estimateMessagesTokens(messages);
	const threshold = maxInputTokensOverride
		? maxInputTokensOverride - AUTOCOMPACT_BUFFER_TOKENS
		: getAutoCompactThreshold(model);

	return estimatedTokens >= threshold;
}

// --------------------------------------------------------------------------
// LLM-Based Compaction
// --------------------------------------------------------------------------

export async function compactConversation(
	provider: LLMProvider,
	model: string,
	messages: any[],
	state: AutoCompactState,
): Promise<{
	compactedMessages: NormalizedMessageParam[];
	summary: string;
	state: AutoCompactState;
}> {
	try {
		// Strip images before compacting to save tokens
		const strippedMessages = stripImagesFromMessages(messages);

		// Build compaction prompt
		const compactionPrompt = buildCompactionPrompt(strippedMessages);

		const response = await provider.createMessage({
			model,
			maxTokens: 8192,
			system: 'You are a conversation summarizer. Create a detailed summary of the conversation that preserves all important context, decisions made, files modified, tool outputs, and current state. The summary should allow the conversation to continue seamlessly.',
			messages: [
				{
					role: 'user',
					content: compactionPrompt,
				},
			],
		});

		const summary = response.content
			.filter((b): b is { type: 'text'; text: string } => b.type === 'text')
			.map((b) => b.text)
			.join('\n');

		// Replace messages with summary
		const compactedMessages: NormalizedMessageParam[] = [
			{
				role: 'user',
				content: `[Previous conversation summary]\n\n${summary}\n\n[End of summary - conversation continues below]`,
			},
			{
				role: 'assistant',
				content: 'I understand the context from the previous conversation. I\'ll continue from where we left off.',
			},
		];

		return {
			compactedMessages,
			summary,
			state: {
				compacted: true,
				turnCounter: state.turnCounter,
				consecutiveFailures: 0,
			},
		};
	} catch (err: any) {
		return {
			compactedMessages: messages,
			summary: '',
			state: {
				...state,
				consecutiveFailures: state.consecutiveFailures + 1,
			},
		};
	}
}

// --------------------------------------------------------------------------
// Micro-Compact
// --------------------------------------------------------------------------

export function microCompactMessages(
	messages: any[],
	maxToolResultChars: number = 50000,
): any[] {
	return messages.map((msg: any) => {
		if (typeof msg.content === 'string') { return msg; }
		if (!Array.isArray(msg.content)) { return msg; }

		const content = (msg.content as any[]).map((block: any) => {
			if (block.type === 'tool_result' && typeof block.content === 'string') {
				if (block.content.length > maxToolResultChars) {
					return {
						...block,
						content:
							block.content.slice(0, maxToolResultChars / 2) +
							'\n...(truncated)...\n' +
							block.content.slice(-maxToolResultChars / 2),
					};
				}
			}
			return block;
		});

		return { ...msg, content };
	});
}

// --------------------------------------------------------------------------
// Internal Helpers
// --------------------------------------------------------------------------

function stripImagesFromMessages(messages: any[]): any[] {
	return messages.map((msg: any) => {
		if (typeof msg.content === 'string') { return msg; }

		const filtered = (msg.content as any[]).filter((block: any) => {
			return block.type !== 'image';
		});

		return { ...msg, content: filtered.length > 0 ? filtered : '[content removed for compaction]' };
	});
}

function buildCompactionPrompt(messages: any[]): string {
	const parts: string[] = ['Please summarize this conversation:\n'];

	for (const msg of messages) {
		const role = msg.role === 'user' ? 'User' : 'Assistant';

		if (typeof msg.content === 'string') {
			parts.push(`${role}: ${msg.content.slice(0, 5000)}`);
		} else if (Array.isArray(msg.content)) {
			const texts: string[] = [];
			for (const block of msg.content as any[]) {
				if (block.type === 'text') {
					texts.push(block.text.slice(0, 3000));
				} else if (block.type === 'tool_use') {
					texts.push(`[Tool: ${block.name}]`);
				} else if (block.type === 'tool_result') {
					const content = typeof block.content === 'string'
						? block.content.slice(0, 1000)
						: '[tool result]';
					texts.push(`[Tool Result: ${content}]`);
				}
			}
			if (texts.length > 0) {
				parts.push(`${role}: ${texts.join('\n')}`);
			}
		}
	}

	return parts.join('\n\n');
}
