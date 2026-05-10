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
import { DEFAULT_AUTH_VARIANT, OPENAI_CODEX_AUTH_VARIANT, type ApiType, type AuthVariantName, type ProviderCapabilities } from './providers/providerTypes.js';

// ============================================================================
// Model Definitions
// ============================================================================

export interface IModelEntry {
	readonly id: string;
	readonly name: string;
	readonly provider: ProviderName;
}

export interface IModelPricing {
	readonly input: number;
	readonly output: number;
}

export interface IModelDefinition extends IModelEntry {
	readonly family: string;
	readonly apiType: ApiType;
	readonly maxInputTokens: number;
	readonly maxOutputTokens: number;
	/**
	 * False means the model was discovered at runtime but the catalog has no
	 * reliable context/pricing metadata for it. Consumers should avoid showing
	 * precise-looking limits or prices in that case.
	 */
	readonly metadataKnown?: boolean;
	readonly pricing?: IModelPricing;
	readonly compactRank?: number;
	readonly capabilities?: ProviderCapabilities;
}

export const FALLBACK_MODEL_PRICING: IModelPricing = {
	input: 3 / 1_000_000,
	output: 15 / 1_000_000,
};

/**
 * Built-in model catalog. Full definitions with token limits.
 */
export const MODEL_CATALOG: readonly IModelDefinition[] = [
	// Anthropic
	{ id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', family: 'claude-4', apiType: 'anthropic-messages', provider: 'anthropic', maxInputTokens: 200_000, maxOutputTokens: 8_192, pricing: { input: 3 / 1_000_000, output: 15 / 1_000_000 } },
	{ id: 'claude-opus-4-6', name: 'Claude Opus 4.6', family: 'claude-4', apiType: 'anthropic-messages', provider: 'anthropic', maxInputTokens: 200_000, maxOutputTokens: 8_192, pricing: { input: 15 / 1_000_000, output: 75 / 1_000_000 } },
	{ id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', family: 'claude-4', apiType: 'anthropic-messages', provider: 'anthropic', maxInputTokens: 200_000, maxOutputTokens: 8_192, pricing: { input: 0.8 / 1_000_000, output: 4 / 1_000_000 }, compactRank: 1 },
	// OpenAI
	{ id: 'gpt-4o', name: 'GPT-4o', family: 'gpt-4', apiType: 'openai-completions', provider: 'openai', maxInputTokens: 128_000, maxOutputTokens: 16_384, pricing: { input: 2.5 / 1_000_000, output: 10 / 1_000_000 } },
	{ id: 'gpt-4o-mini', name: 'GPT-4o Mini', family: 'gpt-4', apiType: 'openai-completions', provider: 'openai', maxInputTokens: 128_000, maxOutputTokens: 16_384, pricing: { input: 0.15 / 1_000_000, output: 0.6 / 1_000_000 }, compactRank: 1 },
	{ id: 'o3', name: 'o3', family: 'o-series', apiType: 'openai-completions', provider: 'openai', maxInputTokens: 200_000, maxOutputTokens: 100_000, pricing: { input: 10 / 1_000_000, output: 40 / 1_000_000 } },
	{ id: 'o3-mini', name: 'o3-mini', family: 'o-series', apiType: 'openai-completions', provider: 'openai', maxInputTokens: 200_000, maxOutputTokens: 100_000, pricing: { input: 1.1 / 1_000_000, output: 4.4 / 1_000_000 }, compactRank: 2 },
	// Gemini
	{ id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', family: 'gemini-2', apiType: 'gemini-generative', provider: 'gemini', maxInputTokens: 1_000_000, maxOutputTokens: 65_536, pricing: { input: 1.25 / 1_000_000, output: 10 / 1_000_000 } },
	{ id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', family: 'gemini-2', apiType: 'gemini-generative', provider: 'gemini', maxInputTokens: 1_000_000, maxOutputTokens: 65_536, pricing: { input: 0.15 / 1_000_000, output: 0.6 / 1_000_000 }, compactRank: 1 },
	// OpenAI-compatible presets (shown under openai-compatible provider)
	{ id: 'deepseek-chat', name: 'DeepSeek Chat (V3)', family: 'deepseek', apiType: 'openai-completions', provider: 'openai-compatible', maxInputTokens: 128_000, maxOutputTokens: 8_192, pricing: { input: 0.27 / 1_000_000, output: 1.1 / 1_000_000 } },
	{ id: 'deepseek-reasoner', name: 'DeepSeek Reasoner (R1)', family: 'deepseek', apiType: 'openai-completions', provider: 'openai-compatible', maxInputTokens: 128_000, maxOutputTokens: 8_192, pricing: { input: 0.55 / 1_000_000, output: 2.19 / 1_000_000 } },
	{ id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', family: 'deepseek', apiType: 'openai-completions', provider: 'openai-compatible', maxInputTokens: 1_000_000, maxOutputTokens: 384_000, pricing: { input: 0.14 / 1_000_000, output: 0.28 / 1_000_000 }, capabilities: { thinking: true, reasoningEcho: { field: 'reasoning_content', includeEmpty: true } } },
	{ id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', family: 'deepseek', apiType: 'openai-completions', provider: 'openai-compatible', maxInputTokens: 1_000_000, maxOutputTokens: 384_000, pricing: { input: 1.74 / 1_000_000, output: 3.48 / 1_000_000 }, capabilities: { thinking: true, reasoningEcho: { field: 'reasoning_content', includeEmpty: true } } },
	{ id: 'qwen-plus', name: 'Qwen Plus', family: 'qwen', apiType: 'openai-completions', provider: 'openai-compatible', maxInputTokens: 131_072, maxOutputTokens: 8_192 },
	{ id: 'moonshot-v1-auto', name: 'Moonshot v1 Auto', family: 'moonshot', apiType: 'openai-completions', provider: 'openai-compatible', maxInputTokens: 128_000, maxOutputTokens: 4_096 },
];

export const DEFAULT_OPENAI_CODEX_MODEL = 'gpt-5.2-codex';

export const OPENAI_CODEX_MODEL_CATALOG: readonly IModelDefinition[] = [
	{ id: 'gpt-5.5', name: 'GPT-5.5', family: 'openai-codex', apiType: 'openai-codex', provider: 'openai', maxInputTokens: 272_000, maxOutputTokens: 64_000 },
	{ id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', family: 'openai-codex', apiType: 'openai-codex', provider: 'openai', maxInputTokens: 272_000, maxOutputTokens: 64_000, compactRank: 3 },
	{ id: 'gpt-5.4', name: 'GPT-5.4', family: 'openai-codex', apiType: 'openai-codex', provider: 'openai', maxInputTokens: 272_000, maxOutputTokens: 64_000 },
	{ id: 'gpt-5.3-codex', name: 'GPT-5.3 Codex', family: 'openai-codex', apiType: 'openai-codex', provider: 'openai', maxInputTokens: 272_000, maxOutputTokens: 64_000 },
	{ id: 'gpt-5.3-codex-spark', name: 'GPT-5.3 Codex Spark', family: 'openai-codex', apiType: 'openai-codex', provider: 'openai', maxInputTokens: 272_000, maxOutputTokens: 64_000, compactRank: 1 },
	{ id: 'gpt-5.2-codex', name: 'GPT-5.2 Codex', family: 'openai-codex', apiType: 'openai-codex', provider: 'openai', maxInputTokens: 272_000, maxOutputTokens: 64_000 },
	{ id: 'gpt-5.1-codex-max', name: 'GPT-5.1 Codex Max', family: 'openai-codex', apiType: 'openai-codex', provider: 'openai', maxInputTokens: 272_000, maxOutputTokens: 64_000 },
	{ id: 'gpt-5.1-codex-mini', name: 'GPT-5.1 Codex Mini', family: 'openai-codex', apiType: 'openai-codex', provider: 'openai', maxInputTokens: 272_000, maxOutputTokens: 64_000, compactRank: 2 },
];

/**
 * Get models for a specific provider. For compatible providers, returns
 * the built-in presets (users can also type custom model IDs).
 */
export function getModelsForProvider(provider: ProviderName): readonly IModelDefinition[] {
	return MODEL_CATALOG.filter(m => m.provider === provider);
}

export function getOpenAICodexModels(): readonly IModelDefinition[] {
	return OPENAI_CODEX_MODEL_CATALOG;
}

export function getModelsForProviderAndAuthVariant(provider: ProviderName, authVariant: AuthVariantName = DEFAULT_AUTH_VARIANT): readonly IModelDefinition[] {
	if (provider === 'openai' && authVariant === OPENAI_CODEX_AUTH_VARIANT) {
		return getOpenAICodexModels();
	}
	return getModelsForProvider(provider);
}

/**
 * Get default model ID for a provider.
 */
export function getDefaultModel(provider: ProviderName): string {
	const models = getModelsForProvider(provider);
	return models.length > 0 ? models[0].id : '';
}

export function getDefaultModelForAuthVariant(provider: ProviderName, authVariant: AuthVariantName = DEFAULT_AUTH_VARIANT): string {
	if (provider === 'openai' && authVariant === OPENAI_CODEX_AUTH_VARIANT) {
		return DEFAULT_OPENAI_CODEX_MODEL;
	}
	const models = getModelsForProviderAndAuthVariant(provider, authVariant);
	return models.length > 0 ? models[0].id : '';
}

/**
 * Find a model definition by ID (searches all providers).
 */
export function findModelById(id: string): IModelDefinition | undefined {
	return MODEL_CATALOG.find(m => m.id === id) ?? OPENAI_CODEX_MODEL_CATALOG.find(m => m.id === id);
}

export function findModelByIdForProvider(provider: ProviderName, id: string): IModelDefinition | undefined {
	return getModelsForProvider(provider).find(m => m.id === id);
}

export function getCatalogCapabilitiesForModel(provider: ProviderName, modelId: string, apiType: ApiType): ProviderCapabilities | undefined {
	const providerScoped = findModelByIdForProvider(provider, modelId)?.capabilities;
	if (providerScoped) {
		return providerScoped;
	}
	const normalizedModelId = modelId.toLowerCase();
	if (
		apiType === 'openai-completions'
		&& (normalizedModelId === 'deepseek-v4-flash' || normalizedModelId === 'deepseek-v4-pro')
	) {
		return { thinking: true, reasoningEcho: { field: 'reasoning_content', includeEmpty: true } };
	}
	return undefined;
}

export function isOpenAICodexModel(id: string): boolean {
	return OPENAI_CODEX_MODEL_CATALOG.some(m => m.id === id);
}

export function getKnownContextWindowSize(modelId: string): number | undefined {
	const exact = findModelById(modelId);
	if (exact?.metadataKnown === false) {
		return undefined;
	}
	if (exact?.maxInputTokens) {
		return exact.maxInputTokens;
	}

	const partial = [...MODEL_CATALOG, ...OPENAI_CODEX_MODEL_CATALOG]
		.filter(m => m.metadataKnown !== false && !!m.maxInputTokens)
		.sort((a, b) => b.id.length - a.id.length)
		.find(m => modelId.includes(m.id));
	return partial?.maxInputTokens;
}

export function getModelPricing(modelId: string): IModelPricing | undefined {
	const exact = findModelById(modelId);
	if (exact?.metadataKnown === false) {
		return undefined;
	}
	if (exact?.pricing) {
		return exact.pricing;
	}

	const partial = [...MODEL_CATALOG, ...OPENAI_CODEX_MODEL_CATALOG]
		.filter(m => m.metadataKnown !== false && !!m.pricing)
		.sort((a, b) => b.id.length - a.id.length)
		.find(m => modelId.includes(m.id));
	return partial?.pricing;
}

export function getProviderDefaultCompactModel(provider: ProviderName, authVariant: AuthVariantName = DEFAULT_AUTH_VARIANT): string | undefined {
	if (provider === 'openai' && authVariant === OPENAI_CODEX_AUTH_VARIANT) {
		return undefined;
	}
	switch (provider) {
		case 'anthropic':
			return 'claude-haiku-4-5';
		case 'openai':
			return 'gpt-4o-mini';
		case 'gemini':
			return 'gemini-2.5-flash';
		case 'openai-compatible':
		case 'anthropic-compatible':
			return undefined;
	}
}

export function getCompactRank(model: Pick<IModelDefinition, 'id' | 'compactRank'>): number {
	if (typeof model.compactRank === 'number') {
		return model.compactRank;
	}
	const id = model.id.toLowerCase();
	if (id.includes('spark')) { return 10; }
	if (id.includes('mini')) { return 20; }
	if (id.includes('haiku')) { return 30; }
	if (id.includes('flash')) { return 40; }
	return 10_000;
}

/**
 * Whether a provider supports user-typed custom model IDs
 * (in addition to the built-in preset list).
 */
export function providerSupportsCustomModels(provider: ProviderName): boolean {
	return provider === 'openai-compatible' || provider === 'anthropic-compatible';
}
