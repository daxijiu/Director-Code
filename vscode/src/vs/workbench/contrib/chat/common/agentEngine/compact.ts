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

import { OPENAI_CODEX_AUTH_VARIANT, type AuthVariantName, type LLMProvider, type NormalizedMessageParam } from './providers/providerTypes.js';
import type { AutoCompactState } from './agentEngineTypes.js';
import { estimateMessagesTokens, getAutoCompactThreshold, AUTOCOMPACT_BUFFER_TOKENS } from './tokens.js';
import { getCompactRank, getProviderDefaultCompactModel, type IModelEntry } from './modelCatalog.js';
import type { ProviderName } from './apiKeyService.js';

export const MIN_COMPACT_THRESHOLD = 8_000;

const compactModelUnavailable = new Set<string>();

export interface CompactModelResolution {
	readonly model: string;
	readonly unavailableKey?: string;
	readonly source: 'configured' | 'provider-default' | 'main';
}

export interface CompactModelSelectionOptions {
	readonly provider: ProviderName;
	readonly authVariant: AuthVariantName;
	readonly mainModel: string;
	readonly configuredCompactModel?: string;
	readonly availableModels?: readonly (IModelEntry & { readonly apiType?: string; readonly compactRank?: number })[];
	readonly availabilityKeyForModel?: (modelId: string) => string | undefined;
}

export interface CompactConversationOptions {
	readonly compactModel?: string;
	readonly unavailableKey?: string;
	readonly abortSignal?: AbortSignal;
}

export function createCompactModelAvailabilityKey(
	provider: ProviderName,
	normalizedBaseURL: string | undefined,
	authIdentityKey: string | undefined,
	authVariant: AuthVariantName,
	compactModelId: string,
): string {
	return `${provider}:${normalizedBaseURL || 'default'}:${authIdentityKey || 'no-key'}:${authVariant}:${compactModelId}`;
}

export function isCompactModelUnavailable(key: string | undefined): boolean {
	return !!key && compactModelUnavailable.has(key);
}

export function markCompactModelUnavailable(key: string | undefined): void {
	if (key) {
		compactModelUnavailable.add(key);
	}
}

export function clearCompactModelUnavailableForTests(): void {
	compactModelUnavailable.clear();
}

export function resolveCompactModel(options: CompactModelSelectionOptions): CompactModelResolution {
	const availableModels = options.availableModels ?? [];
	const availableById = new Map(availableModels.map(model => [model.id, model]));
	const keyFor = (modelId: string) => options.availabilityKeyForModel?.(modelId);
	const isAvailable = (modelId: string): boolean => {
		if (modelId === options.mainModel) {
			return true;
		}
		const key = keyFor(modelId);
		return availableById.has(modelId) && !isCompactModelUnavailable(key);
	};
	const useCandidate = (modelId: string, source: CompactModelResolution['source']): CompactModelResolution | undefined => {
		if (!modelId) {
			return undefined;
		}
		if (isAvailable(modelId)) {
			return { model: modelId, unavailableKey: keyFor(modelId), source };
		}
		return undefined;
	};

	const configuredCompactModel = options.configuredCompactModel?.trim();
	if (configuredCompactModel) {
		const configured = useCandidate(configuredCompactModel, 'configured');
		if (configured) {
			return configured;
		}
		console.warn(`[AgentEngine] Compact model "${configuredCompactModel}" is not available for provider "${options.provider}" (${options.authVariant}); falling back.`);
	}

	if (options.provider === 'openai' && options.authVariant === OPENAI_CODEX_AUTH_VARIANT) {
		const codexCandidate = availableModels
			.filter(model => model.apiType === 'openai-codex')
			.filter(model => !isCompactModelUnavailable(keyFor(model.id)))
			.sort((a, b) => getCompactRank(a) - getCompactRank(b) || a.id.localeCompare(b.id))[0];
		if (codexCandidate) {
			return { model: codexCandidate.id, unavailableKey: keyFor(codexCandidate.id), source: 'provider-default' };
		}
		return { model: options.mainModel, source: 'main' };
	}

	const providerDefault = getProviderDefaultCompactModel(options.provider, options.authVariant);
	const providerDefaultResolution = providerDefault ? useCandidate(providerDefault, 'provider-default') : undefined;
	if (providerDefaultResolution) {
		return providerDefaultResolution;
	}

	return { model: options.mainModel, source: 'main' };
}

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

	return estimatedTokens >= Math.max(MIN_COMPACT_THRESHOLD, threshold);
}

// --------------------------------------------------------------------------
// LLM-Based Compaction
// --------------------------------------------------------------------------

export async function compactConversation(
	provider: LLMProvider,
	model: string,
	messages: any[],
	state: AutoCompactState,
	options: CompactConversationOptions = {},
): Promise<{
	compactedMessages: NormalizedMessageParam[];
	summary: string;
	state: AutoCompactState;
	usedModel: string;
}> {
	const compactModel = options.compactModel && !isCompactModelUnavailable(options.unavailableKey)
		? options.compactModel
		: model;
	try {
		// Strip images before compacting to save tokens
		const strippedMessages = stripImagesFromMessages(messages);

		// Build compaction prompt
		const compactionPrompt = buildCompactionPrompt(strippedMessages);

		const response = await provider.createMessage({
			model: compactModel,
			maxTokens: 8192,
			system: 'You are a conversation summarizer. Create a detailed summary of the conversation that preserves all important context, decisions made, files modified, tool outputs, and current state. The summary should allow the conversation to continue seamlessly.',
			messages: [
				{
					role: 'user',
					content: compactionPrompt,
				},
			],
			abortSignal: options.abortSignal,
		});

		const summary = response.content
			.filter((b): b is { type: 'text'; text: string } => b.type === 'text')
			.map((b) => b.text)
			.join('\n');

		// [Director-Code] A3: compact success requires non-trivial output AND actual token reduction
		if (summary.length < 10) {
			console.warn('[AgentEngine] compact returned near-empty summary, keeping original messages');
			return {
				compactedMessages: messages,
				summary: '',
				state: { ...state, consecutiveFailures: state.consecutiveFailures + 1 },
				usedModel: compactModel,
			};
		}

		const originalTokens = estimateMessagesTokens(messages);
		const compactedContent = `[Previous conversation summary]\n\n${summary}\n\n[End of summary - conversation continues below]`;
		const compactedTokens = estimateMessagesTokens([
			{ role: 'user', content: compactedContent },
			{ role: 'assistant', content: 'I understand the context from the previous conversation. I\'ll continue from where we left off.' },
		]);
		if (compactedTokens >= originalTokens * 0.9) {
			console.warn(`[AgentEngine] compact did not reduce tokens sufficiently (${compactedTokens} >= ${Math.floor(originalTokens * 0.9)}), keeping original`);
			return {
				compactedMessages: messages,
				summary: '',
				state: { ...state, consecutiveFailures: state.consecutiveFailures + 1 },
				usedModel: compactModel,
			};
		}

		const compactedMessages: NormalizedMessageParam[] = [
			{ role: 'user', content: compactedContent },
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
			usedModel: compactModel,
		};
	} catch (err: any) {
		if (err?.status === 403 || err?.status === 404) {
			markCompactModelUnavailable(options.unavailableKey);
		}
		return {
			compactedMessages: messages,
			summary: '',
			state: {
				...state,
				consecutiveFailures: state.consecutiveFailures + 1,
			},
			usedModel: compactModel,
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
				const binaryPlaceholder = getBinaryToolResultPlaceholder(block.content);
				if (binaryPlaceholder) {
					return {
						...block,
						content: binaryPlaceholder,
					};
				}
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

function getBinaryToolResultPlaceholder(content: string): string | undefined {
	const trimmed = content.trim();
	if (!trimmed) {
		return undefined;
	}
	if (/^data:[^;\s]+;base64,[A-Za-z0-9+/_=-]{256,}$/i.test(trimmed)) {
		return `[Large binary tool result omitted: data URI, ${content.length} chars]`;
	}
	const hasBase64AlphabetSignal = /[A-Z0-9+/_=-]/.test(trimmed);
	const isPlainLowercaseRun = /^[a-z]+$/.test(trimmed);
	const isSingleRepeatedChar = new Set(trimmed).size === 1;
	if (trimmed.length >= 4096 && /^[A-Za-z0-9+/_=-]+$/.test(trimmed) && trimmed.length % 4 === 0 && hasBase64AlphabetSignal && !isPlainLowercaseRun && !isSingleRepeatedChar) {
		return `[Large binary tool result omitted: base64 payload, ${content.length} chars]`;
	}
	const controlChars = content.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g)?.length ?? 0;
	if (controlChars >= 8 || controlChars / Math.max(1, content.length) > 0.01) {
		return `[Large binary tool result omitted: binary payload, ${content.length} chars]`;
	}
	return undefined;
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
