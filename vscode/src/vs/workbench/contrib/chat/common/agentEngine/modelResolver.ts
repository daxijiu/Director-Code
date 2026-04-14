/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Model Resolver Service
 *
 * Resolves available model lists for each provider using a three-layer fallback:
 *   Layer 1: Provider API (GET /v1/models for OpenAI/Gemini, skip for Anthropic)
 *   Layer 2: CDN JSON (configurable URL, updated more frequently than releases)
 *   Layer 3: Static MODEL_CATALOG (built-in, always available offline)
 *
 * Includes in-memory caching with TTL to avoid excessive API calls.
 */

import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import type { ProviderName } from './apiKeyService.js';
import { MODEL_CATALOG, getModelsForProvider, type IModelDefinition } from './modelCatalog.js';
import type { ApiType } from './providers/providerTypes.js';

// ============================================================================
// Constants
// ============================================================================

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const FETCH_TIMEOUT_MS = 5_000;

const CDN_MODEL_LIST_URL = 'https://raw.githubusercontent.com/daxijiu/Director-Code/master/model-catalog.json';

// ============================================================================
// Types
// ============================================================================

/**
 * A resolved model entry from any layer.
 * Extends IModelDefinition with source metadata.
 */
export interface IResolvedModel extends IModelDefinition {
	readonly source: 'api' | 'cdn' | 'static';
}

/**
 * CDN model list JSON format.
 */
export interface ICDNModelList {
	readonly version: number;
	readonly models: readonly ICDNModelEntry[];
}

export interface ICDNModelEntry {
	readonly id: string;
	readonly name: string;
	readonly provider: ProviderName;
	readonly family?: string;
	readonly apiType: ApiType;
	readonly maxInputTokens?: number;
	readonly maxOutputTokens?: number;
}

interface CacheEntry {
	models: IResolvedModel[];
	timestamp: number;
}

// ============================================================================
// IModelResolverService Interface
// ============================================================================

export const IModelResolverService = createDecorator<IModelResolverService>('directorCodeModelResolverService');

export interface IModelResolverService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeModels: Event<ProviderName>;

	/**
	 * Resolve models for a provider using the three-layer fallback.
	 * Uses cache if fresh enough.
	 */
	resolveModels(provider: ProviderName, apiKey?: string, baseURL?: string): Promise<IResolvedModel[]>;

	/**
	 * Force refresh models for a provider (bypasses cache).
	 */
	refreshModels(provider: ProviderName, apiKey?: string, baseURL?: string): Promise<IResolvedModel[]>;

	/**
	 * Clear all cached model lists.
	 */
	clearCache(): void;
}

// ============================================================================
// ModelResolverService Implementation
// ============================================================================

export class ModelResolverService extends Disposable implements IModelResolverService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeModels = this._register(new Emitter<ProviderName>());
	readonly onDidChangeModels: Event<ProviderName> = this._onDidChangeModels.event;

	private readonly _cache = new Map<string, CacheEntry>();

	// ========================================================================
	// Public API
	// ========================================================================

	async resolveModels(provider: ProviderName, apiKey?: string, baseURL?: string): Promise<IResolvedModel[]> {
		const cacheKey = this._cacheKey(provider, baseURL);
		const cached = this._cache.get(cacheKey);
		if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
			return cached.models;
		}

		return this._resolveAndCache(provider, apiKey, baseURL, cacheKey);
	}

	async refreshModels(provider: ProviderName, apiKey?: string, baseURL?: string): Promise<IResolvedModel[]> {
		const cacheKey = this._cacheKey(provider, baseURL);
		this._cache.delete(cacheKey);
		const result = await this._resolveAndCache(provider, apiKey, baseURL, cacheKey);
		this._onDidChangeModels.fire(provider);
		return result;
	}

	clearCache(): void {
		this._cache.clear();
	}

	// ========================================================================
	// Three-Layer Fallback
	// ========================================================================

	private async _resolveAndCache(
		provider: ProviderName,
		apiKey: string | undefined,
		baseURL: string | undefined,
		cacheKey: string,
	): Promise<IResolvedModel[]> {
		// Layer 1: Provider API
		if (apiKey) {
			const apiModels = await this._fetchFromProviderAPI(provider, apiKey, baseURL);
			if (apiModels.length > 0) {
				this._cache.set(cacheKey, { models: apiModels, timestamp: Date.now() });
				return apiModels;
			}
		}

		// Layer 2: CDN JSON
		const cdnModels = await this._fetchFromCDN(provider);
		if (cdnModels.length > 0) {
			this._cache.set(cacheKey, { models: cdnModels, timestamp: Date.now() });
			return cdnModels;
		}

		// Layer 3: Static MODEL_CATALOG
		const staticModels = this._getStaticModels(provider);
		this._cache.set(cacheKey, { models: staticModels, timestamp: Date.now() });
		return staticModels;
	}

	// ========================================================================
	// Layer 1: Provider API
	// ========================================================================

	private async _fetchFromProviderAPI(
		provider: ProviderName,
		apiKey: string,
		baseURL?: string,
	): Promise<IResolvedModel[]> {
		try {
			switch (provider) {
				case 'openai':
				case 'openai-compatible':
					return await this._fetchOpenAIModels(apiKey, baseURL);
				case 'gemini':
					return await this._fetchGeminiModels(apiKey, baseURL);
				case 'anthropic':
				case 'anthropic-compatible':
					return [];
			}
		} catch {
			return [];
		}
	}

	private async _fetchOpenAIModels(apiKey: string, baseURL?: string): Promise<IResolvedModel[]> {
		const base = (baseURL || 'https://api.openai.com/v1').replace(/\/$/, '');
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

		try {
			const response = await fetch(`${base}/models`, {
				headers: { 'Authorization': `Bearer ${apiKey}` },
				signal: controller.signal,
			});

			if (!response.ok) { return []; }

			const data = await response.json() as { data?: Array<{ id: string; owned_by?: string }> };
			if (!data.data || !Array.isArray(data.data)) { return []; }

			return data.data
				.filter(m => this._isRelevantOpenAIModel(m.id))
				.map(m => this._openAIModelToResolved(m.id, baseURL));
		} finally {
			clearTimeout(timeout);
		}
	}

	private async _fetchGeminiModels(apiKey: string, baseURL?: string): Promise<IResolvedModel[]> {
		const base = (baseURL || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

		try {
			const response = await fetch(`${base}/v1beta/models?key=${apiKey}`, {
				signal: controller.signal,
			});

			if (!response.ok) { return []; }

			const data = await response.json() as { models?: Array<{ name: string; displayName?: string; inputTokenLimit?: number; outputTokenLimit?: number }> };
			if (!data.models || !Array.isArray(data.models)) { return []; }

			return data.models
				.filter(m => this._isRelevantGeminiModel(m.name))
				.map(m => this._geminiModelToResolved(m));
		} finally {
			clearTimeout(timeout);
		}
	}

	// ========================================================================
	// Layer 2: CDN JSON
	// ========================================================================

	private async _fetchFromCDN(provider: ProviderName): Promise<IResolvedModel[]> {
		try {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

			try {
				const response = await fetch(CDN_MODEL_LIST_URL, {
					signal: controller.signal,
				});

				if (!response.ok) { return []; }

				const data = await response.json() as ICDNModelList;
				if (!data.models || !Array.isArray(data.models)) { return []; }

				return data.models
					.filter(m => m.provider === provider)
					.map(m => ({
						id: m.id,
						name: m.name,
						provider: m.provider,
						family: m.family || 'unknown',
						apiType: m.apiType,
						maxInputTokens: m.maxInputTokens || 128_000,
						maxOutputTokens: m.maxOutputTokens || 8_192,
						source: 'cdn' as const,
					}));
			} finally {
				clearTimeout(timeout);
			}
		} catch {
			return [];
		}
	}

	// ========================================================================
	// Layer 3: Static MODEL_CATALOG
	// ========================================================================

	private _getStaticModels(provider: ProviderName): IResolvedModel[] {
		return getModelsForProvider(provider).map(m => ({
			...m,
			source: 'static' as const,
		}));
	}

	// ========================================================================
	// Helpers
	// ========================================================================

	private _cacheKey(provider: ProviderName, baseURL?: string): string {
		return `${provider}:${baseURL || 'default'}`;
	}

	private _isRelevantOpenAIModel(id: string): boolean {
		const prefixes = ['gpt-', 'o1', 'o3', 'o4'];
		return prefixes.some(p => id.startsWith(p));
	}

	private _openAIModelToResolved(id: string, baseURL?: string): IResolvedModel {
		const existing = MODEL_CATALOG.find(m => m.id === id);
		if (existing) {
			return { ...existing, source: 'api' as const };
		}

		const isCompatible = !!baseURL;
		return {
			id,
			name: id,
			provider: isCompatible ? 'openai-compatible' : 'openai',
			family: id.startsWith('o') ? 'o-series' : 'gpt-4',
			apiType: 'openai-completions',
			maxInputTokens: 128_000,
			maxOutputTokens: 16_384,
			source: 'api' as const,
		};
	}

	private _isRelevantGeminiModel(name: string): boolean {
		return name.includes('gemini');
	}

	private _geminiModelToResolved(model: { name: string; displayName?: string; inputTokenLimit?: number; outputTokenLimit?: number }): IResolvedModel {
		const id = model.name.replace('models/', '');
		const existing = MODEL_CATALOG.find(m => m.id === id);
		if (existing) {
			return { ...existing, source: 'api' as const };
		}

		return {
			id,
			name: model.displayName || id,
			provider: 'gemini',
			family: id.includes('2.5') ? 'gemini-2' : 'gemini',
			apiType: 'gemini-generative',
			maxInputTokens: model.inputTokenLimit || 1_000_000,
			maxOutputTokens: model.outputTokenLimit || 65_536,
			source: 'api' as const,
		};
	}
}
