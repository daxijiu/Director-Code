/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Token Estimation & Cost Tracking
 *
 * Provides rough UTF-8 byte-based token estimation and model cost tracking.
 *
 * Ported from open-agent-sdk-typescript/src/utils/tokens.ts
 */

import type { TokenUsage } from './providers/providerTypes.js';
import {
	FALLBACK_MODEL_PRICING,
	MODEL_CATALOG,
	OPENAI_CODEX_MODEL_CATALOG,
	getKnownContextWindowSize,
	getModelPricing,
} from './modelCatalog.js';

// --------------------------------------------------------------------------
// Token Estimation
// --------------------------------------------------------------------------

/**
 * Rough token estimation: ~3.5 UTF-8 bytes per token.
 */
export function estimateTokens(text: string): number {
	if (!text) {
		return 0;
	}
	return Math.ceil(new TextEncoder().encode(text).length / 3.5);
}

/**
 * Estimate tokens for a message array.
 */
export function estimateMessagesTokens(
	messages: Array<{ role: string; content: any }>,
): number {
	let total = 0;
	for (const msg of messages) {
		if (typeof msg.content === 'string') {
			total += estimateTokens(msg.content);
		} else if (Array.isArray(msg.content)) {
			for (const block of msg.content) {
				if ('text' in block && typeof block.text === 'string') {
					total += estimateTokens(block.text);
				} else if ('content' in block && typeof block.content === 'string') {
					total += estimateTokens(block.content);
				} else {
					// tool_use, image, etc - rough estimate
					total += estimateTokens(JSON.stringify(block));
				}
			}
		}
	}
	return total;
}

// --------------------------------------------------------------------------
// Context Window Sizes
// --------------------------------------------------------------------------

export function getContextWindowSize(model: string): number {
	const normalized = model.toLowerCase();

	// Anthropic
	if (normalized.includes('opus-4') && normalized.includes('1m')) { return 1_000_000; }

	const known = getKnownContextWindowSize(model);
	if (known) {
		return known;
	}

	if (normalized.includes('claude')) { return 200_000; }

	// OpenAI
	if (normalized.includes('gpt-4-1')) { return 1_000_000; }
	if (normalized.includes('gpt-3.5')) { return 16_385; }
	if (normalized.includes('o1')) { return 200_000; }
	if (normalized.includes('o3')) { return 200_000; }
	if (normalized.includes('o4')) { return 200_000; }
	if (normalized.includes('gpt-4') || normalized.includes('gpt-5') || normalized.includes('chatgpt-')) { return 128_000; }

	// DeepSeek
	if (normalized.includes('deepseek')) { return 128_000; }

	// Gemini
	if (normalized.includes('gemini')) { return 1_000_000; }

	// Default
	return 200_000;
}

/**
 * Auto-compact buffer: trigger compaction when within this many tokens of the limit.
 */
export const AUTOCOMPACT_BUFFER_TOKENS = 13_000;

export function getAutoCompactThreshold(model: string): number {
	return getContextWindowSize(model) - AUTOCOMPACT_BUFFER_TOKENS;
}

// --------------------------------------------------------------------------
// Model Pricing (USD per token)
// --------------------------------------------------------------------------

export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
	...Object.fromEntries(
		[...MODEL_CATALOG, ...OPENAI_CODEX_MODEL_CATALOG]
			.filter(model => !!model.pricing)
			.map(model => [model.id, model.pricing!]),
	),
};

// --------------------------------------------------------------------------
// Cost Estimation
// --------------------------------------------------------------------------

export function estimateCost(
	model: string,
	usage: TokenUsage,
): number {
	const pricing = getModelPricing(model) ?? FALLBACK_MODEL_PRICING;

	return usage.input_tokens * pricing.input + usage.output_tokens * pricing.output;
}
