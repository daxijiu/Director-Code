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
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IApiKeyService, type IApiKeyChangeEvent, type ProviderName } from './apiKeyService.js';
import { MODEL_CATALOG, getModelsForProvider, getOpenAICodexModels, type IModelDefinition } from './modelCatalog.js';
import { IOAuthService } from './oauthService.js';
import { DEFAULT_AUTH_VARIANT, OPENAI_CODEX_AUTH_VARIANT, type ApiType, type AuthVariantName } from './providers/providerTypes.js';
import { buildGeminiAuthenticatedRequest, CONFIG_GEMINI_KEY_IN_URL } from './geminiAuth.js';
import { fetchJsonWithTimeout } from './fetchUtils.js';

// ============================================================================
// Constants
// ============================================================================

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const FETCH_TIMEOUT_MS = 5_000;
const MAX_PROVIDER_CACHE_BUCKETS = 8;

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

export function getDefaultModelResolverBaseURL(provider: ProviderName, authVariant: AuthVariantName): string {
	if (provider === 'openai' && authVariant === OPENAI_CODEX_AUTH_VARIANT) {
		return 'https://chatgpt.com/backend-api/codex';
	}
	switch (provider) {
		case 'anthropic':
			return 'https://api.anthropic.com';
		case 'openai':
			return 'https://api.openai.com/v1';
		case 'gemini':
			return 'https://generativelanguage.googleapis.com';
		case 'openai-compatible':
		case 'anthropic-compatible':
			return '';
	}
}

export function normalizeModelResolverBaseURL(provider: ProviderName, baseURL: string | undefined, authVariant: AuthVariantName = DEFAULT_AUTH_VARIANT): string | undefined {
	const base = (baseURL || getDefaultModelResolverBaseURL(provider, authVariant)).trim().replace(/\/+$/, '');
	if (!base) {
		return undefined;
	}

	if (provider === 'openai' && authVariant === OPENAI_CODEX_AUTH_VARIANT) {
		return base;
	}

	if (provider === 'openai' || provider === 'openai-compatible') {
		return base.endsWith('/v1') ? base : `${base}/v1`;
	}

	if (provider === 'anthropic' || provider === 'anthropic-compatible') {
		return base.replace(/\/v1$/, '');
	}

	return base;
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
	resolveModels(provider: ProviderName, apiKey?: string, baseURL?: string, authIdentityKey?: string, authVariant?: AuthVariantName): Promise<IResolvedModel[]>;

	/**
	 * Force refresh models for a provider (bypasses cache).
	 */
	refreshModels(provider: ProviderName, apiKey?: string, baseURL?: string, authIdentityKey?: string, authVariant?: AuthVariantName): Promise<IResolvedModel[]>;

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
	private readonly _inFlight = new Map<string, Promise<IResolvedModel[]>>();

	constructor(
		@IApiKeyService apiKeyService?: IApiKeyService,
		@IOAuthService oauthService?: IOAuthService,
		@IConfigurationService private readonly configurationService?: IConfigurationService,
	) {
		super();

		if (apiKeyService) {
			this._register(apiKeyService.onDidChangeApiKey(event => {
				const provider = this._providerFromApiKeyEvent(event);
				if (provider) {
					this._deleteProviderBuckets(provider);
					this._onDidChangeModels.fire(provider);
				}
			}));
		}

		if (oauthService) {
			this._register(oauthService.onDidChangeAuth(provider => {
				this._deleteProviderBuckets(provider);
				this._onDidChangeModels.fire(provider);
			}));
		}
	}

	// ========================================================================
	// Public API
	// ========================================================================

	async resolveModels(provider: ProviderName, apiKey?: string, baseURL?: string, authIdentityKey?: string, authVariant: AuthVariantName = DEFAULT_AUTH_VARIANT): Promise<IResolvedModel[]> {
		const normalizedBaseURL = this._normalizeBaseURLForCache(provider, baseURL, authVariant);
		const cacheKey = this._cacheKey(provider, normalizedBaseURL, authIdentityKey, authVariant);
		const cached = this._cache.get(cacheKey);
		if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
			return cached.models;
		}

		const inFlight = this._inFlight.get(cacheKey);
		if (inFlight) {
			return inFlight;
		}

		const promise = this._resolveAndCache(provider, apiKey, normalizedBaseURL, authVariant, cacheKey)
			.finally(() => this._inFlight.delete(cacheKey));
		this._inFlight.set(cacheKey, promise);
		return promise;
	}

	async refreshModels(provider: ProviderName, apiKey?: string, baseURL?: string, authIdentityKey?: string, authVariant: AuthVariantName = DEFAULT_AUTH_VARIANT): Promise<IResolvedModel[]> {
		const normalizedBaseURL = this._normalizeBaseURLForCache(provider, baseURL, authVariant);
		const cacheKey = this._cacheKey(provider, normalizedBaseURL, authIdentityKey, authVariant);
		this._deleteProviderBuckets(provider);
		const result = await this._resolveAndCache(provider, apiKey, normalizedBaseURL, authVariant, cacheKey);
		this._onDidChangeModels.fire(provider);
		return result;
	}

	clearCache(): void {
		this._cache.clear();
		this._inFlight.clear();
	}

	// ========================================================================
	// Three-Layer Fallback
	// ========================================================================

	private async _resolveAndCache(
		provider: ProviderName,
		apiKey: string | undefined,
		baseURL: string | undefined,
		authVariant: AuthVariantName,
		cacheKey: string,
	): Promise<IResolvedModel[]> {
		if (provider === 'openai' && authVariant === OPENAI_CODEX_AUTH_VARIANT) {
			if (apiKey) {
				try {
					const apiModels = await this._fetchOpenAICodexModels(apiKey, baseURL);
					if (apiModels.length > 0) {
						this._setCache(provider, cacheKey, apiModels);
						return apiModels;
					}
				} catch {
					// Fall back to the static Codex allowlist.
				}
			}

			const models = this._getOpenAICodexStaticModels();
			this._setCache(provider, cacheKey, models);
			return models;
		}

		// Layer 1: Provider API
		if (apiKey) {
			const apiModels = await this._fetchFromProviderAPI(provider, apiKey, baseURL);
			if (apiModels.length > 0) {
				this._setCache(provider, cacheKey, apiModels);
				return apiModels;
			}
		}

		// Layer 2: CDN JSON
		const cdnModels = await this._fetchFromCDN(provider);
		if (cdnModels.length > 0) {
			this._setCache(provider, cacheKey, cdnModels);
			return cdnModels;
		}

		// Layer 3: Static MODEL_CATALOG
		const staticModels = this._getStaticModels(provider);
		this._setCache(provider, cacheKey, staticModels);
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
					return await this._fetchOpenAIModels(apiKey, baseURL, 'openai');
				case 'openai-compatible':
					return await this._fetchOpenAIModels(apiKey, baseURL, 'openai-compatible');
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

	private async _fetchOpenAIModels(apiKey: string, baseURL: string | undefined, providerType: 'openai' | 'openai-compatible'): Promise<IResolvedModel[]> {
		const base = (baseURL || 'https://api.openai.com/v1').replace(/\/$/, '');

		const { data } = await fetchJsonWithTimeout<{ data?: Array<{ id: string; owned_by?: string }> }>(`${base}/models`, {
			headers: { 'Authorization': `Bearer ${apiKey}` },
		}, { timeoutMs: FETCH_TIMEOUT_MS });
		if (!data.data || !Array.isArray(data.data)) { return []; }

		return data.data
			.filter(m => this._isRelevantOpenAIModel(m.id, providerType))
			.map(m => this._openAIModelToResolved(m.id, providerType));
	}

	private async _fetchOpenAICodexModels(accessToken: string, baseURL?: string): Promise<IResolvedModel[]> {
		const base = (baseURL || 'https://chatgpt.com/backend-api/codex').replace(/\/$/, '');

		const { data } = await fetchJsonWithTimeout<{
			models?: Array<{
				slug?: string;
				display_name?: string;
				visibility?: string;
				supported_in_api?: boolean;
				context_window?: number;
				max_context_window?: number;
				priority?: number;
			}>;
		}>(`${base}/models?client_version=1.0.0`, {
			headers: { 'Authorization': `Bearer ${accessToken}` },
		}, { timeoutMs: FETCH_TIMEOUT_MS });
		if (!data.models || !Array.isArray(data.models)) { return []; }

		const sortable = data.models
			.filter(m => typeof m.slug === 'string' && m.slug.trim().length > 0)
			.filter(m => m.supported_in_api !== false)
			.filter(m => !['hide', 'hidden'].includes((m.visibility ?? '').trim().toLowerCase()))
			.map(m => ({ model: m, priority: typeof m.priority === 'number' ? m.priority : 10_000 }));

		sortable.sort((a, b) => a.priority - b.priority || a.model.slug!.localeCompare(b.model.slug!));
		return sortable.map(({ model }) => this._openAICodexModelToResolved(model));
	}

	private async _fetchGeminiModels(apiKey: string, baseURL?: string): Promise<IResolvedModel[]> {
		const base = (baseURL || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
		const request = buildGeminiAuthenticatedRequest(
			`${base}/v1beta/models`,
			apiKey,
			this._useGeminiKeyInUrl(),
		);
		const { data } = await fetchJsonWithTimeout<{ models?: Array<{ name: string; displayName?: string; inputTokenLimit?: number; outputTokenLimit?: number; supportedGenerationMethods?: string[] }> }>(request.url, {
			headers: request.headers,
		}, { timeoutMs: FETCH_TIMEOUT_MS });
		if (!data.models || !Array.isArray(data.models)) { return []; }

		return data.models
			.filter(m => this._isRelevantGeminiModel(m.name, m.supportedGenerationMethods))
			.map(m => this._geminiModelToResolved(m));
	}

	private _useGeminiKeyInUrl(): boolean {
		return this.configurationService?.getValue<boolean>(CONFIG_GEMINI_KEY_IN_URL) === true;
	}

	// ========================================================================
	// Layer 2: CDN JSON
	// ========================================================================

	private async _fetchFromCDN(provider: ProviderName): Promise<IResolvedModel[]> {
		try {
			const { data } = await fetchJsonWithTimeout<ICDNModelList>(CDN_MODEL_LIST_URL, {}, { timeoutMs: FETCH_TIMEOUT_MS });
			if (!data.models || !Array.isArray(data.models)) { return []; }

			return data.models
				.filter(m => m.provider === provider)
				.map(m => ({
					id: m.id,
					name: m.name,
					provider: m.provider,
					family: m.family || 'unknown',
					apiType: m.apiType,
					maxInputTokens: m.maxInputTokens || 0,
					maxOutputTokens: m.maxOutputTokens || 0,
					metadataKnown: !!(m.maxInputTokens && m.maxOutputTokens),
					source: 'cdn' as const,
				}));
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

	private _getOpenAICodexStaticModels(): IResolvedModel[] {
		return getOpenAICodexModels().map(m => ({
			...m,
			source: 'static' as const,
		}));
	}

	// ========================================================================
	// Helpers
	// ========================================================================

	private _cacheKey(provider: ProviderName, normalizedBaseURL: string | undefined, authIdentityKey?: string, authVariant: AuthVariantName = DEFAULT_AUTH_VARIANT): string {
		return `${provider}:${normalizedBaseURL || 'default'}:${authIdentityKey || 'no-key'}:${authVariant}`;
	}

	private _normalizeBaseURLForCache(provider: ProviderName, baseURL: string | undefined, authVariant: AuthVariantName): string | undefined {
		return normalizeModelResolverBaseURL(provider, baseURL, authVariant);
	}

	private _deleteProviderBuckets(provider: ProviderName): void {
		const prefix = `${provider}:`;
		for (const key of this._cache.keys()) {
			if (key.startsWith(prefix)) {
				this._cache.delete(key);
			}
		}
		for (const key of this._inFlight.keys()) {
			if (key.startsWith(prefix)) {
				this._inFlight.delete(key);
			}
		}
	}

	private _setCache(provider: ProviderName, cacheKey: string, models: IResolvedModel[]): void {
		this._cache.set(cacheKey, { models, timestamp: Date.now() });

		const prefix = `${provider}:`;
		const providerEntries = Array.from(this._cache.entries())
			.filter(([key]) => key.startsWith(prefix));
		if (providerEntries.length <= MAX_PROVIDER_CACHE_BUCKETS) {
			return;
		}

		providerEntries
			.sort((a, b) => a[1].timestamp - b[1].timestamp)
			.slice(0, providerEntries.length - MAX_PROVIDER_CACHE_BUCKETS)
			.forEach(([key]) => this._cache.delete(key));
	}

	private _providerFromApiKeyEvent(event: IApiKeyChangeEvent): ProviderName | undefined {
		return event.provider;
	}

	private _isRelevantOpenAIModel(id: string, providerType: 'openai' | 'openai-compatible'): boolean {
		const lower = id.toLowerCase();
		if (providerType === 'openai-compatible') {
			return !lower.includes('embed');
		}

		if (['embed', 'moderation', 'tts', 'whisper', 'dall-e'].some(excluded => lower.includes(excluded))) {
			return false;
		}
		return /^(gpt-|o1|o3|o4|chatgpt-)/.test(id);
	}

	private _openAIModelToResolved(id: string, providerType: 'openai' | 'openai-compatible'): IResolvedModel {
		const existing = MODEL_CATALOG.find(m => m.id === id);
		if (existing) {
			return { ...existing, provider: providerType, source: 'api' as const };
		}

		return {
			id,
			name: id,
			provider: providerType,
			family: 'unknown',
			apiType: 'openai-completions',
			maxInputTokens: 0,
			maxOutputTokens: 0,
			metadataKnown: false,
			source: 'api' as const,
		};
	}

	private _openAICodexModelToResolved(model: {
		slug?: string;
		display_name?: string;
		context_window?: number;
		max_context_window?: number;
	}): IResolvedModel {
		const id = model.slug!.trim();
		const existing = getOpenAICodexModels().find(m => m.id === id);
		if (existing) {
			return { ...existing, source: 'api' as const };
		}

		return {
			id,
			name: model.display_name || id,
			provider: 'openai',
			family: 'openai-codex',
			apiType: 'openai-codex',
			maxInputTokens: model.max_context_window || model.context_window || 0,
			maxOutputTokens: 0,
			metadataKnown: !!(model.max_context_window || model.context_window),
			source: 'api' as const,
		};
	}

	private _isRelevantGeminiModel(name: string, supportedGenerationMethods?: readonly string[]): boolean {
		return name.includes('gemini') && !!supportedGenerationMethods?.includes('generateContent');
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
			family: 'unknown',
			apiType: 'gemini-generative',
			maxInputTokens: model.inputTokenLimit || 0,
			maxOutputTokens: model.outputTokenLimit || 0,
			metadataKnown: !!(model.inputTokenLimit && model.outputTokenLimit),
			source: 'api' as const,
		};
	}
}
