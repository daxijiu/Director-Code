/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * API Key Management Service
 *
 * Encapsulates ISecretStorageService operations for LLM API keys.
 * Provides a unified interface for storing, retrieving, and testing
 * API keys for different LLM providers (Anthropic, OpenAI, Gemini).
 */

import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ISecretStorageService } from '../../../../../platform/secrets/common/secrets.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import type { ApiType, ProviderCapabilities } from './providers/providerTypes.js';
import { buildProviderUrl } from './providers/abstractProvider.js';
import { buildGeminiAuthenticatedRequest, CONFIG_GEMINI_KEY_IN_URL } from './geminiAuth.js';
import { fetchWithTimeout, getResponseErrorMessage } from './fetchUtils.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Key prefix for storing API keys in ISecretStorageService.
 * Provider-level: `director-code.apiKey.<provider>`
 * Model-level:    `director-code.modelKey.<provider>.<modelId>`
 */
export const SECRET_KEY_PREFIX = 'director-code.apiKey';
export const MODEL_KEY_PREFIX = 'director-code.modelKey';
export const MODEL_CONFIG_PREFIX = 'director-code.modelConfig';
export const TEST_CONNECTION_TIMEOUT_MS = 15_000;

/**
 * Built-in provider names (always available).
 */
export const BUILTIN_PROVIDERS = ['anthropic', 'openai', 'gemini'] as const;

/**
 * Extended provider names including compatibility modes.
 */
export const SUPPORTED_PROVIDERS = ['anthropic', 'openai', 'gemini', 'openai-compatible', 'anthropic-compatible'] as const;
export type ProviderName = typeof SUPPORTED_PROVIDERS[number];

/**
 * Provider display names for UI.
 */
export const PROVIDER_DISPLAY_NAMES: Record<ProviderName, string> = {
	'anthropic': 'Anthropic (Claude)',
	'openai': 'OpenAI (GPT-4, o3)',
	'gemini': 'Google (Gemini)',
	'openai-compatible': 'OpenAI Compatible (DeepSeek, Groq, Together AI, ...)',
	'anthropic-compatible': 'Anthropic Compatible',
};

/**
 * Default API base URLs per provider.
 * Compatible providers have empty defaults — user must set a base URL.
 */
export const PROVIDER_DEFAULT_URLS: Record<ProviderName, string> = {
	'anthropic': 'https://api.anthropic.com',
	'openai': 'https://api.openai.com',
	'gemini': 'https://generativelanguage.googleapis.com',
	'openai-compatible': '',
	'anthropic-compatible': '',
};

/**
 * Map provider name to ApiType.
 */
export function providerToApiType(provider: ProviderName): ApiType {
	switch (provider) {
		case 'anthropic': return 'anthropic-messages';
		case 'anthropic-compatible': return 'anthropic-messages';
		case 'openai': return 'openai-completions';
		case 'openai-compatible': return 'openai-completions';
		case 'gemini': return 'gemini-generative';
	}
}

/**
 * Whether this provider requires a user-provided base URL.
 */
export function providerRequiresBaseURL(provider: ProviderName): boolean {
	return provider === 'openai-compatible' || provider === 'anthropic-compatible';
}

/**
 * Providers that support OAuth 2.0 login.
 */
export const OAUTH_CAPABLE_PROVIDERS: readonly ProviderName[] = ['anthropic', 'openai'];

export function parseApiKeySecretKey(secretKey: string, changeKind: ApiKeyChangeKind): IApiKeyChangeEvent | undefined {
	if (secretKey.startsWith(SECRET_KEY_PREFIX + '.')) {
		const suffix = secretKey.slice(SECRET_KEY_PREFIX.length + 1);
		const provider = SUPPORTED_PROVIDERS.find(candidate => candidate === suffix);
		return provider ? { provider, scope: 'provider', changeKind, secretKey } : undefined;
	}

	if (secretKey.startsWith(MODEL_KEY_PREFIX + '.')) {
		return parseProviderModelSecretKey(secretKey, MODEL_KEY_PREFIX, 'model', changeKind);
	}

	if (secretKey.startsWith(MODEL_CONFIG_PREFIX + '.')) {
		return parseProviderModelSecretKey(secretKey, MODEL_CONFIG_PREFIX, 'model-config', changeKind);
	}

	return undefined;
}

function parseProviderModelSecretKey(
	secretKey: string,
	prefix: string,
	scope: 'model' | 'model-config',
	changeKind: ApiKeyChangeKind,
): IApiKeyChangeEvent | undefined {
	const suffix = secretKey.slice(prefix.length + 1);
	const provider = SUPPORTED_PROVIDERS.find(candidate => suffix === candidate || suffix.startsWith(`${candidate}.`));
	if (!provider) {
		return undefined;
	}
	const modelId = suffix === provider ? undefined : suffix.slice(provider.length + 1);
	return { provider, scope, changeKind, modelId, secretKey };
}

// ============================================================================
// Connection Test Result
// ============================================================================

export interface IConnectionTestResult {
	readonly success: boolean;
	readonly error?: string;
	readonly model?: string;
	readonly latencyMs?: number;
}

export type ApiKeyChangeScope = 'provider' | 'model' | 'model-config';
export type ApiKeyChangeKind = 'set' | 'delete' | 'changed';

export interface IApiKeyChangeEvent {
	readonly provider: ProviderName;
	readonly scope: ApiKeyChangeScope;
	readonly changeKind: ApiKeyChangeKind;
	readonly modelId?: string;
	readonly secretKey: string;
}

// ============================================================================
// Per-Model Configuration
// ============================================================================

/**
 * Per-model configuration that can override provider-level defaults.
 * Stored as JSON in ISecretStorageService.
 */
export interface IModelConfig {
	readonly baseURL?: string;
	readonly capabilities?: ProviderCapabilities;
}

/**
 * Fully resolved provider options for creating an LLM provider instance.
 * Result of the three-level fallback resolution.
 */
export interface IResolvedProviderOptions {
	readonly auth: import('./providers/providerTypes.js').ProviderAuth;
	readonly baseURL?: string;
	readonly capabilities?: ProviderCapabilities;
}

// ============================================================================
// IApiKeyService Interface
// ============================================================================

export const IApiKeyService = createDecorator<IApiKeyService>('directorCodeApiKeyService');

export interface IApiKeyService {
	readonly _serviceBrand: undefined;

	/**
	 * Fired when an API key or per-model configuration changes.
	 */
	readonly onDidChangeApiKey: Event<IApiKeyChangeEvent>;

	/**
	 * Get the stored API key for a provider.
	 */
	getApiKey(provider: ProviderName): Promise<string | undefined>;

	/**
	 * Store an API key for a provider.
	 */
	setApiKey(provider: ProviderName, key: string): Promise<void>;

	/**
	 * Delete the API key for a provider.
	 */
	deleteApiKey(provider: ProviderName): Promise<void>;

	/**
	 * Check if an API key is configured for a provider.
	 */
	hasApiKey(provider: ProviderName): Promise<boolean>;

	/**
	 * Test the API-key connection for a provider using the given API key.
	 * OAuth health/status checks intentionally go through IOAuthService/IAuthStateService.
	 * Makes a minimal API request to verify the key is valid.
	 * @param baseURL Custom API base URL (must match provider's expectations)
	 * @param model Model ID to use for the test request (defaults to a cheap built-in model)
	 */
	testConnection(provider: ProviderName, apiKey: string, baseURL?: string, model?: string): Promise<IConnectionTestResult>;

	// ========================================================================
	// Per-Model API Key Management
	// ========================================================================

	/**
	 * Get API key for a specific model.
	 * Falls back to provider-level key if no per-model key is set.
	 */
	getModelApiKey(provider: ProviderName, modelId: string): Promise<string | undefined>;

	/**
	 * Set a per-model API key (overrides the provider-level key for this model).
	 */
	setModelApiKey(provider: ProviderName, modelId: string, key: string): Promise<void>;

	/**
	 * Delete the per-model API key (reverts to provider-level key).
	 */
	deleteModelApiKey(provider: ProviderName, modelId: string): Promise<void>;

	/**
	 * Check if a per-model API key is set (not the fallback).
	 */
	hasModelApiKey(provider: ProviderName, modelId: string): Promise<boolean>;

	// ========================================================================
	// Per-Model Configuration
	// ========================================================================

	/**
	 * Get per-model configuration (baseURL, capabilities).
	 */
	getModelConfig(provider: ProviderName, modelId: string): Promise<IModelConfig | undefined>;

	/**
	 * Set per-model configuration.
	 */
	setModelConfig(provider: ProviderName, modelId: string, config: IModelConfig): Promise<void>;

	/**
	 * Delete per-model configuration.
	 */
	deleteModelConfig(provider: ProviderName, modelId: string): Promise<void>;

	// ========================================================================
	// Resolved Options (three-level fallback)
	// ========================================================================

	/**
	 * Resolve full provider options for a given provider + model.
	 * Applies three-level fallback:
	 *   API Key: per-model → per-provider → undefined
	 *   Base URL: per-model config → globalBaseURL param → provider default
	 *   Capabilities: per-model config → model catalog → provider defaults
	 *
	 * @param globalBaseURL The base URL from global settings (directorCode.ai.baseURL)
	 * @deprecated Production paths must use IAuthStateService.resolveAuth(provider, model, authVariant).
	 */
	resolveProviderOptions(provider: ProviderName, modelId: string, globalBaseURL?: string): Promise<IResolvedProviderOptions | undefined>;
}

// ============================================================================
// ApiKeyService Implementation
// ============================================================================

export class ApiKeyService extends Disposable implements IApiKeyService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeApiKey = this._register(new Emitter<IApiKeyChangeEvent>());
	readonly onDidChangeApiKey: Event<IApiKeyChangeEvent> = this._onDidChangeApiKey.event;
	private readonly pendingSecretEvents = new Map<string, IApiKeyChangeEvent>();

	constructor(
		@ISecretStorageService private readonly secretService: ISecretStorageService,
		@IConfigurationService private readonly configurationService?: IConfigurationService,
	) {
		super();

		this._register(this.secretService.onDidChangeSecret((key) => {
			const pending = this.pendingSecretEvents.get(key);
			if (pending) {
				this.pendingSecretEvents.delete(key);
				this._onDidChangeApiKey.fire(pending);
				return;
			}

			const parsed = parseApiKeySecretKey(key, 'changed');
			if (parsed) {
				this._onDidChangeApiKey.fire(parsed);
			}
		}));
	}

	private _secretKey(provider: ProviderName): string {
		return `${SECRET_KEY_PREFIX}.${provider}`;
	}

	private _modelSecretKey(provider: ProviderName, modelId: string): string {
		return `${MODEL_KEY_PREFIX}.${provider}.${modelId}`;
	}

	private _modelConfigKey(provider: ProviderName, modelId: string): string {
		return `${MODEL_CONFIG_PREFIX}.${provider}.${modelId}`;
	}

	async getApiKey(provider: ProviderName): Promise<string | undefined> {
		return this.secretService.get(this._secretKey(provider));
	}

	async setApiKey(provider: ProviderName, key: string): Promise<void> {
		const secretKey = this._secretKey(provider);
		this.pendingSecretEvents.set(secretKey, { provider, scope: 'provider', changeKind: 'set', secretKey });
		await this.secretService.set(secretKey, key);
		// Note: onDidChangeSecret will fire from the secret service,
		// which we relay via _onDidChangeApiKey
	}

	async deleteApiKey(provider: ProviderName): Promise<void> {
		const secretKey = this._secretKey(provider);
		this.pendingSecretEvents.set(secretKey, { provider, scope: 'provider', changeKind: 'delete', secretKey });
		await this.secretService.delete(secretKey);
	}

	async hasApiKey(provider: ProviderName): Promise<boolean> {
		const key = await this.getApiKey(provider);
		return key !== undefined && key.length > 0;
	}

	async testConnection(provider: ProviderName, apiKey: string, baseURL?: string, model?: string): Promise<IConnectionTestResult> {
		const startTime = Date.now();
		try {
			const result = await this._doTestConnection(provider, apiKey, baseURL, model);
			return {
				...result,
				latencyMs: Date.now() - startTime,
			};
		} catch (err: any) {
			return {
				success: false,
				error: err.message || String(err),
				latencyMs: Date.now() - startTime,
			};
		}
	}

	/**
	 * Perform the actual connection test for each provider.
	 * Uses a minimal API request (max_tokens: 1) to verify the key.
	 *
	 * URL construction mirrors the real Provider classes to avoid
	 * mismatches when a custom baseURL is in use (e.g. DeepSeek).
	 */
	private async _doTestConnection(provider: ProviderName, apiKey: string, baseURL?: string, model?: string): Promise<IConnectionTestResult> {
		switch (provider) {
			case 'anthropic':
			case 'anthropic-compatible':
				return this._testAnthropic(apiKey, baseURL, model);
			case 'openai':
			case 'openai-compatible':
				return this._testOpenAI(apiKey, baseURL, model);
			case 'gemini':
				return this._testGemini(apiKey, baseURL, model);
		}
	}

	private async _testAnthropic(apiKey: string, baseURL?: string, model?: string): Promise<IConnectionTestResult> {
		// Matches AnthropicProvider: baseURL defaults to 'https://api.anthropic.com', path = /v1/messages
		const base = (baseURL || 'https://api.anthropic.com').replace(/\/$/, '');
		const testModel = model || 'claude-haiku-4-5';
		const response = await fetchWithTimeout(buildProviderUrl(base, '/v1/messages'), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': apiKey,
				'anthropic-version': '2023-06-01',
			},
			body: JSON.stringify({
				model: testModel,
				max_tokens: 1,
				messages: [{ role: 'user', content: 'hi' }],
			}),
		}, { timeoutMs: TEST_CONNECTION_TIMEOUT_MS });

		if (!response.ok) {
			return { success: false, error: await getResponseErrorMessage(response) };
		}
		return { success: true, model: testModel };
	}

	private async _testOpenAI(apiKey: string, baseURL?: string, model?: string): Promise<IConnectionTestResult> {
		// Matches OpenAIProvider: baseURL defaults to 'https://api.openai.com/v1', path = /chat/completions
		const base = (baseURL || 'https://api.openai.com/v1').replace(/\/$/, '');
		const testModel = model || 'gpt-4o-mini';
		const body: Record<string, any> = {
			model: testModel,
			messages: [{ role: 'user', content: 'hi' }],
		};
		if (/^o(?:1|3|4)(?:-|$)/.test(testModel)) {
			body.max_completion_tokens = 1;
		} else {
			body.max_tokens = 1;
		}
		const response = await fetchWithTimeout(buildProviderUrl(base, '/chat/completions'), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${apiKey}`,
			},
			body: JSON.stringify(body),
		}, { timeoutMs: TEST_CONNECTION_TIMEOUT_MS });

		if (!response.ok) {
			return { success: false, error: await getResponseErrorMessage(response) };
		}
		return { success: true, model: testModel };
	}

	private async _testGemini(apiKey: string, baseURL?: string, model?: string): Promise<IConnectionTestResult> {
		const base = (baseURL || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
		const testModel = model || 'gemini-2.5-flash';
		const request = buildGeminiAuthenticatedRequest(
			`${base}/v1beta/models/${testModel}:generateContent`,
			apiKey,
			this._useGeminiKeyInUrl(),
		);
		const response = await fetchWithTimeout(request.url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				...request.headers,
			},
			body: JSON.stringify({
				contents: [{ parts: [{ text: 'hi' }] }],
				generationConfig: { maxOutputTokens: 1 },
			}),
		}, { timeoutMs: TEST_CONNECTION_TIMEOUT_MS });

		if (!response.ok) {
			return { success: false, error: await getResponseErrorMessage(response) };
		}
		return { success: true, model: testModel };
	}

	private _useGeminiKeyInUrl(): boolean {
		return this.configurationService?.getValue<boolean>(CONFIG_GEMINI_KEY_IN_URL) === true;
	}

	// ========================================================================
	// Per-Model API Key Management
	// ========================================================================

	async getModelApiKey(provider: ProviderName, modelId: string): Promise<string | undefined> {
		const modelKey = await this.secretService.get(this._modelSecretKey(provider, modelId));
		if (modelKey && modelKey.length > 0) {
			return modelKey;
		}
		return this.getApiKey(provider);
	}

	async setModelApiKey(provider: ProviderName, modelId: string, key: string): Promise<void> {
		const secretKey = this._modelSecretKey(provider, modelId);
		this.pendingSecretEvents.set(secretKey, { provider, scope: 'model', changeKind: 'set', modelId, secretKey });
		await this.secretService.set(secretKey, key);
	}

	async deleteModelApiKey(provider: ProviderName, modelId: string): Promise<void> {
		const secretKey = this._modelSecretKey(provider, modelId);
		this.pendingSecretEvents.set(secretKey, { provider, scope: 'model', changeKind: 'delete', modelId, secretKey });
		await this.secretService.delete(secretKey);
	}

	async hasModelApiKey(provider: ProviderName, modelId: string): Promise<boolean> {
		const key = await this.secretService.get(this._modelSecretKey(provider, modelId));
		return key !== undefined && key.length > 0;
	}

	// ========================================================================
	// Per-Model Configuration
	// ========================================================================

	async getModelConfig(provider: ProviderName, modelId: string): Promise<IModelConfig | undefined> {
		const json = await this.secretService.get(this._modelConfigKey(provider, modelId));
		if (!json) {
			return undefined;
		}
		try {
			return JSON.parse(json) as IModelConfig;
		} catch {
			return undefined;
		}
	}

	async setModelConfig(provider: ProviderName, modelId: string, config: IModelConfig): Promise<void> {
		const secretKey = this._modelConfigKey(provider, modelId);
		this.pendingSecretEvents.set(secretKey, { provider, scope: 'model-config', changeKind: 'set', modelId, secretKey });
		await this.secretService.set(secretKey, JSON.stringify(config));
	}

	async deleteModelConfig(provider: ProviderName, modelId: string): Promise<void> {
		const secretKey = this._modelConfigKey(provider, modelId);
		this.pendingSecretEvents.set(secretKey, { provider, scope: 'model-config', changeKind: 'delete', modelId, secretKey });
		await this.secretService.delete(secretKey);
	}

	// ========================================================================
	// Resolved Options (three-level fallback)
	// ========================================================================

	/** @deprecated Production paths must use IAuthStateService.resolveAuth(provider, model, authVariant). */
	async resolveProviderOptions(provider: ProviderName, modelId: string, globalBaseURL?: string): Promise<IResolvedProviderOptions | undefined> {
		const apiKey = await this.getModelApiKey(provider, modelId);
		if (!apiKey) {
			return undefined;
		}

		const modelConfig = await this.getModelConfig(provider, modelId);

		const baseURL = modelConfig?.baseURL || globalBaseURL || undefined;
		const capabilities = modelConfig?.capabilities || undefined;

		// [Director-Code] B1-1: wrap API key in explicit auth structure
		return { auth: { kind: 'api-key', value: apiKey }, baseURL, capabilities };
	}
}
