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
import { ISecretStorageService } from '../../../../../platform/secrets/common/secrets.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import type { ApiType } from './providers/providerTypes.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Key prefix for storing API keys in ISecretStorageService.
 * Full key format: `director-code.apiKey.<provider>`
 */
export const SECRET_KEY_PREFIX = 'director-code.apiKey';

/**
 * Supported provider names.
 */
export const SUPPORTED_PROVIDERS = ['anthropic', 'openai', 'gemini'] as const;
export type ProviderName = typeof SUPPORTED_PROVIDERS[number];

/**
 * Provider display names for UI.
 */
export const PROVIDER_DISPLAY_NAMES: Record<ProviderName, string> = {
	anthropic: 'Anthropic (Claude)',
	openai: 'OpenAI (GPT-4, o3)',
	gemini: 'Google (Gemini)',
};

/**
 * Default API base URLs per provider.
 */
export const PROVIDER_DEFAULT_URLS: Record<ProviderName, string> = {
	anthropic: 'https://api.anthropic.com',
	openai: 'https://api.openai.com',
	gemini: 'https://generativelanguage.googleapis.com',
};

/**
 * Map provider name to ApiType.
 */
export function providerToApiType(provider: ProviderName): ApiType {
	switch (provider) {
		case 'anthropic': return 'anthropic-messages';
		case 'openai': return 'openai-completions';
		case 'gemini': return 'gemini-generative';
	}
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

// ============================================================================
// IApiKeyService Interface
// ============================================================================

export const IApiKeyService = createDecorator<IApiKeyService>('directorCodeApiKeyService');

export interface IApiKeyService {
	readonly _serviceBrand: undefined;

	/**
	 * Fired when an API key changes (set or deleted).
	 * The event payload is the provider name.
	 */
	readonly onDidChangeApiKey: Event<string>;

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
	 * Test the connection for a provider using the given API key.
	 * Makes a minimal API request to verify the key is valid.
	 */
	testConnection(provider: ProviderName, apiKey: string, baseURL?: string): Promise<IConnectionTestResult>;
}

// ============================================================================
// ApiKeyService Implementation
// ============================================================================

export class ApiKeyService extends Disposable implements IApiKeyService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeApiKey = this._register(new Emitter<string>());
	readonly onDidChangeApiKey: Event<string> = this._onDidChangeApiKey.event;

	constructor(
		@ISecretStorageService private readonly secretService: ISecretStorageService,
	) {
		super();

		// Forward relevant secret change events
		this._register(this.secretService.onDidChangeSecret((key) => {
			if (key.startsWith(SECRET_KEY_PREFIX + '.')) {
				const provider = key.slice(SECRET_KEY_PREFIX.length + 1);
				this._onDidChangeApiKey.fire(provider);
			}
		}));
	}

	private _secretKey(provider: ProviderName): string {
		return `${SECRET_KEY_PREFIX}.${provider}`;
	}

	async getApiKey(provider: ProviderName): Promise<string | undefined> {
		return this.secretService.get(this._secretKey(provider));
	}

	async setApiKey(provider: ProviderName, key: string): Promise<void> {
		await this.secretService.set(this._secretKey(provider), key);
		// Note: onDidChangeSecret will fire from the secret service,
		// which we relay via _onDidChangeApiKey
	}

	async deleteApiKey(provider: ProviderName): Promise<void> {
		await this.secretService.delete(this._secretKey(provider));
	}

	async hasApiKey(provider: ProviderName): Promise<boolean> {
		const key = await this.getApiKey(provider);
		return key !== undefined && key.length > 0;
	}

	async testConnection(provider: ProviderName, apiKey: string, baseURL?: string): Promise<IConnectionTestResult> {
		const startTime = Date.now();
		try {
			const result = await this._doTestConnection(provider, apiKey, baseURL);
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
	 */
	private async _doTestConnection(provider: ProviderName, apiKey: string, baseURL?: string): Promise<IConnectionTestResult> {
		switch (provider) {
			case 'anthropic':
				return this._testAnthropic(apiKey, baseURL);
			case 'openai':
				return this._testOpenAI(apiKey, baseURL);
			case 'gemini':
				return this._testGemini(apiKey, baseURL);
		}
	}

	private async _testAnthropic(apiKey: string, baseURL?: string): Promise<IConnectionTestResult> {
		const url = `${baseURL || PROVIDER_DEFAULT_URLS.anthropic}/v1/messages`;
		const model = 'claude-haiku-4-5';
		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': apiKey,
				'anthropic-version': '2023-06-01',
			},
			body: JSON.stringify({
				model,
				max_tokens: 1,
				messages: [{ role: 'user', content: 'hi' }],
			}),
		});

		if (!response.ok) {
			const body = await response.text();
			return { success: false, error: `HTTP ${response.status}: ${body.slice(0, 200)}` };
		}
		return { success: true, model };
	}

	private async _testOpenAI(apiKey: string, baseURL?: string): Promise<IConnectionTestResult> {
		const url = `${baseURL || PROVIDER_DEFAULT_URLS.openai}/v1/chat/completions`;
		const model = 'gpt-4o-mini';
		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				model,
				max_tokens: 1,
				messages: [{ role: 'user', content: 'hi' }],
			}),
		});

		if (!response.ok) {
			const body = await response.text();
			return { success: false, error: `HTTP ${response.status}: ${body.slice(0, 200)}` };
		}
		return { success: true, model };
	}

	private async _testGemini(apiKey: string, baseURL?: string): Promise<IConnectionTestResult> {
		const model = 'gemini-2.5-flash';
		const base = baseURL || PROVIDER_DEFAULT_URLS.gemini;
		const url = `${base}/v1beta/models/${model}:generateContent?key=${apiKey}`;
		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				contents: [{ parts: [{ text: 'hi' }] }],
				generationConfig: { maxOutputTokens: 1 },
			}),
		});

		if (!response.ok) {
			const body = await response.text();
			return { success: false, error: `HTTP ${response.status}: ${body.slice(0, 200)}` };
		}
		return { success: true, model };
	}
}
