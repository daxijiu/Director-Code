/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Integration Tests — Agent Registration Flow
 *
 * Tests the complete registration and coordination between:
 * - ApiKeyService (secret storage)
 * - ProviderFactory (LLM provider instantiation)
 * - ModelCatalog (model definitions)
 * - Configuration flow
 */

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import {
	ApiKeyService,
	SUPPORTED_PROVIDERS,
	providerToApiType,
} from '../../../common/agentEngine/apiKeyService.js';
import { createProvider } from '../../../common/agentEngine/providers/providerFactory.js';
import { MODEL_CATALOG, getModelsForProvider, getDefaultModel, findModelById } from '../../../common/agentEngine/modelCatalog.js';
import type { ISecretStorageService, ISecretStorageProvider } from '../../../../../../platform/secrets/common/secrets.js';

// ============================================================================
// Mock ISecretStorageService
// ============================================================================

class MockSecretStorageService implements ISecretStorageService {
	declare readonly _serviceBrand: undefined;

	private readonly _store = new Map<string, string>();
	private readonly _onDidChangeSecret = new Emitter<string>();
	readonly onDidChangeSecret: Event<string> = this._onDidChangeSecret.event;
	readonly type: ISecretStorageProvider['type'] = 'in-memory';

	async get(key: string): Promise<string | undefined> {
		return this._store.get(key);
	}

	async set(key: string, value: string): Promise<void> {
		this._store.set(key, value);
		this._onDidChangeSecret.fire(key);
	}

	async delete(key: string): Promise<void> {
		this._store.delete(key);
		this._onDidChangeSecret.fire(key);
	}

	async keys(): Promise<string[]> {
		return Array.from(this._store.keys());
	}

	dispose(): void {
		this._onDidChangeSecret.dispose();
	}
}

suite("AgentEngine - Integration: Agent Registration Flow", () => {

	const disposables = new DisposableStore();
	let mockSecretService: MockSecretStorageService;
	let apiKeyService: ApiKeyService;

	setup(() => {
		mockSecretService = new MockSecretStorageService();
		apiKeyService = new ApiKeyService(mockSecretService as any);
		disposables.add(apiKeyService);
	});

	teardown(() => {
		disposables.clear();
		mockSecretService.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	// ====================================================================
	// Full registration flow: API Key → Provider → Model
	// ====================================================================

	suite("API Key → Provider → Model flow", () => {

		test("can set API key and create provider for Anthropic", async () => {
			await apiKeyService.setApiKey("anthropic", "sk-ant-test-key");
			const key = await apiKeyService.getApiKey("anthropic");
			assert.ok(key);

			const apiType = providerToApiType("anthropic");
			const provider = createProvider(apiType, { apiKey: key! });
			assert.strictEqual(provider.apiType, "anthropic-messages");
		});

		test("can set API key and create provider for OpenAI", async () => {
			await apiKeyService.setApiKey("openai", "sk-openai-test");
			const key = await apiKeyService.getApiKey("openai");
			assert.ok(key);

			const provider = createProvider(providerToApiType("openai"), { apiKey: key! });
			assert.strictEqual(provider.apiType, "openai-completions");
		});

		test("can set API key and create provider for Gemini", async () => {
			await apiKeyService.setApiKey("gemini", "gemini-test-key");
			const key = await apiKeyService.getApiKey("gemini");
			assert.ok(key);

			const provider = createProvider(providerToApiType("gemini"), { apiKey: key! });
			assert.strictEqual(provider.apiType, "gemini-generative");
		});

		test("complete flow for all providers", async () => {
			const builtInProviders = SUPPORTED_PROVIDERS.filter(p => p !== 'anthropic-compatible');
			for (const providerName of builtInProviders) {
				// 1. Set API key
				await apiKeyService.setApiKey(providerName, `test-key-${providerName}`);
				assert.strictEqual(await apiKeyService.hasApiKey(providerName), true);

				// 2. Get models for provider
				const models = getModelsForProvider(providerName);
				assert.ok(models.length > 0, `no models for ${providerName}`);

				// 3. Get default model
				const defaultModelId = getDefaultModel(providerName);
				const defaultModel = findModelById(defaultModelId);
				assert.ok(defaultModel, `default model not found for ${providerName}`);
				assert.strictEqual(defaultModel!.provider, providerName);

				// 4. Create provider
				const key = await apiKeyService.getApiKey(providerName);
				const provider = createProvider(defaultModel!.apiType, { apiKey: key! });
				assert.strictEqual(provider.apiType, defaultModel!.apiType);
			}
		});
	});

	// ====================================================================
	// Event propagation
	// ====================================================================

	suite("Event propagation", () => {

		test("API key change fires event that can trigger provider refresh", async () => {
			const changedProviders: string[] = [];
			disposables.add(apiKeyService.onDidChangeApiKey(p => changedProviders.push(p)));

			await apiKeyService.setApiKey("anthropic", "key1");
			await apiKeyService.setApiKey("openai", "key2");
			await apiKeyService.deleteApiKey("anthropic");

			assert.deepStrictEqual(changedProviders, ["anthropic", "openai", "anthropic"]);
		});

		test("changing API key doesn't affect other providers", async () => {
			await apiKeyService.setApiKey("anthropic", "ant-key");
			await apiKeyService.setApiKey("openai", "oai-key");

			// Delete anthropic key
			await apiKeyService.deleteApiKey("anthropic");

			// OpenAI key should be unaffected
			assert.strictEqual(await apiKeyService.hasApiKey("anthropic"), false);
			assert.strictEqual(await apiKeyService.hasApiKey("openai"), true);
			assert.strictEqual(await apiKeyService.getApiKey("openai"), "oai-key");
		});
	});

	// ====================================================================
	// Model catalog + provider factory coordination
	// ====================================================================

	suite("ModelCatalog + ProviderFactory coordination", () => {

		test("every model in catalog has valid apiType for factory", () => {
			for (const model of MODEL_CATALOG) {
				// Should not throw
				const provider = createProvider(model.apiType, { apiKey: "test" });
				assert.strictEqual(provider.apiType, model.apiType);
			}
		});

		test("providerToApiType matches model catalog entries", () => {
			for (const providerName of SUPPORTED_PROVIDERS) {
				const apiType = providerToApiType(providerName);
				const models = getModelsForProvider(providerName);

				for (const model of models) {
					assert.strictEqual(model.apiType, apiType,
						`model ${model.id} has apiType ${model.apiType} but providerToApiType returns ${apiType}`);
				}
			}
		});

		test("all models can create providers with custom baseURL", () => {
			for (const model of MODEL_CATALOG) {
				const provider = createProvider(model.apiType, {
					apiKey: "test",
					baseURL: "https://custom.proxy.example.com",
				});
				assert.strictEqual(provider.apiType, model.apiType);
			}
		});
	});

	// ====================================================================
	// Missing API key path
	// ====================================================================

	suite("Missing API key error path", () => {

		test("hasApiKey returns false for all providers initially", async () => {
			for (const p of SUPPORTED_PROVIDERS) {
				assert.strictEqual(await apiKeyService.hasApiKey(p), false);
			}
		});

		test("getApiKey returns undefined for unconfigured providers", async () => {
			for (const p of SUPPORTED_PROVIDERS) {
				assert.strictEqual(await apiKeyService.getApiKey(p), undefined);
			}
		});

		test("can still create provider models list without API key", () => {
			// Model catalog is static for built-in providers
			const builtIn = ['anthropic', 'openai', 'gemini'] as const;
			for (const p of builtIn) {
				const models = getModelsForProvider(p);
				assert.ok(models.length > 0);
			}
			// Compatible providers may have presets or empty list
			const compat = getModelsForProvider('openai-compatible');
			assert.ok(compat.length >= 0);
		});
	});
});
