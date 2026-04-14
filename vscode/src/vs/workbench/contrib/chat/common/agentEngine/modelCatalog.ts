/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Model Catalog
 *
 * Defines the built-in model catalog for all supported LLM providers.
 * This is shared between directorCodeModelProvider (browser) and
 * providerSettingsWidget (browser). Placed in common/ so that
 * tests can import it without CSS dependencies.
 */

import type { ProviderName } from './apiKeyService.js';
import type { ApiType } from './providers/providerTypes.js';

// ============================================================================
// Model Definitions
// ============================================================================

export interface IModelEntry {
	readonly id: string;
	readonly name: string;
	readonly provider: ProviderName;
}

export interface IModelDefinition extends IModelEntry {
	readonly family: string;
	readonly apiType: ApiType;
	readonly maxInputTokens: number;
	readonly maxOutputTokens: number;
}

/**
 * Built-in model catalog. Full definitions with token limits.
 */
export const MODEL_CATALOG: readonly IModelDefinition[] = [
	// Anthropic
	{ id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', family: 'claude-4', apiType: 'anthropic-messages', provider: 'anthropic', maxInputTokens: 200_000, maxOutputTokens: 8_192 },
	{ id: 'claude-opus-4-6', name: 'Claude Opus 4.6', family: 'claude-4', apiType: 'anthropic-messages', provider: 'anthropic', maxInputTokens: 200_000, maxOutputTokens: 8_192 },
	{ id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', family: 'claude-4', apiType: 'anthropic-messages', provider: 'anthropic', maxInputTokens: 200_000, maxOutputTokens: 8_192 },
	// OpenAI
	{ id: 'gpt-4o', name: 'GPT-4o', family: 'gpt-4', apiType: 'openai-completions', provider: 'openai', maxInputTokens: 128_000, maxOutputTokens: 16_384 },
	{ id: 'gpt-4o-mini', name: 'GPT-4o Mini', family: 'gpt-4', apiType: 'openai-completions', provider: 'openai', maxInputTokens: 128_000, maxOutputTokens: 16_384 },
	{ id: 'o3', name: 'o3', family: 'o-series', apiType: 'openai-completions', provider: 'openai', maxInputTokens: 200_000, maxOutputTokens: 100_000 },
	{ id: 'o3-mini', name: 'o3-mini', family: 'o-series', apiType: 'openai-completions', provider: 'openai', maxInputTokens: 200_000, maxOutputTokens: 100_000 },
	// Gemini
	{ id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', family: 'gemini-2', apiType: 'gemini-generative', provider: 'gemini', maxInputTokens: 1_000_000, maxOutputTokens: 65_536 },
	{ id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', family: 'gemini-2', apiType: 'gemini-generative', provider: 'gemini', maxInputTokens: 1_000_000, maxOutputTokens: 65_536 },
	// OpenAI-compatible presets (shown under openai-compatible provider)
	{ id: 'deepseek-chat', name: 'DeepSeek Chat (V3)', family: 'deepseek', apiType: 'openai-completions', provider: 'openai-compatible', maxInputTokens: 128_000, maxOutputTokens: 8_192 },
	{ id: 'deepseek-reasoner', name: 'DeepSeek Reasoner (R1)', family: 'deepseek', apiType: 'openai-completions', provider: 'openai-compatible', maxInputTokens: 128_000, maxOutputTokens: 8_192 },
	{ id: 'qwen-plus', name: 'Qwen Plus', family: 'qwen', apiType: 'openai-completions', provider: 'openai-compatible', maxInputTokens: 131_072, maxOutputTokens: 8_192 },
	{ id: 'moonshot-v1-auto', name: 'Moonshot v1 Auto', family: 'moonshot', apiType: 'openai-completions', provider: 'openai-compatible', maxInputTokens: 128_000, maxOutputTokens: 4_096 },
];

/**
 * Get models for a specific provider. For compatible providers, returns
 * the built-in presets (users can also type custom model IDs).
 */
export function getModelsForProvider(provider: ProviderName): readonly IModelDefinition[] {
	return MODEL_CATALOG.filter(m => m.provider === provider);
}

/**
 * Get default model ID for a provider.
 */
export function getDefaultModel(provider: ProviderName): string {
	const models = getModelsForProvider(provider);
	return models.length > 0 ? models[0].id : '';
}

/**
 * Find a model definition by ID (searches all providers).
 */
export function findModelById(id: string): IModelDefinition | undefined {
	return MODEL_CATALOG.find(m => m.id === id);
}

/**
 * Whether a provider supports user-typed custom model IDs
 * (in addition to the built-in preset list).
 */
export function providerSupportsCustomModels(provider: ProviderName): boolean {
	return provider === 'openai-compatible' || provider === 'anthropic-compatible';
}
