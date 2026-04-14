/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Integration Tests — Configuration Flow
 *
 * Tests configuration-driven behavior:
 * - Provider switching → model list updates
 * - Model catalog consistency
 * - Base URL propagation
 * - Multi-provider API key independence
 */

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import {
	ApiKeyService,
	SUPPORTED_PROVIDERS,
	PROVIDER_DISPLAY_NAMES,
	PROVIDER_DEFAULT_URLS,
	providerToApiType,
} from '../../../common/agentEngine/apiKeyService.js';
import { createProvider } from '../../../common/agentEngine/providers/providerFactory.js';
import {
	MODEL_CATALOG,
	getModelsForProvider,
	getDefaultModel,
	findModelById,
} from '../../../common/agentEngine/modelCatalog.js';
import type { ISecretStorageService, ISecretStorageProvider } from '../../../../../../platform/secrets/common/secrets.js';

// ============================================================================
// Mock
// ============================================================================

class MockSecretStorageService implements ISecretStorageService {
	declare readonly _serviceBrand: undefined;
	private readonly _store = new Map<string, string>();
	private readonly _onDidChangeSecret = new Emitter<string>();
	readonly onDidChangeSecret: Event<string> = this._onDidChangeSecret.event;
	readonly type: ISecretStorageProvider['type'] = 'in-memory';

	async get(key: string): Promise<string | undefined> { return this._store.get(key); }
	async set(key: string, value: string): Promise<void> { this._store.set(key, value); this._onDidChangeSecret.fire(key); }
	async delete(key: string): Promise<void> { this._store.delete(key); this._onDidChangeSecret.fire(key); }
	async keys(): Promise<string[]> { return Array.from(this._store.keys()); }
	dispose(): void { this._onDidChangeSecret.dispose(); }
}

suite("AgentEngine - Integration: Configuration Flow", () => {

	const disposables = new DisposableStore();
	let apiKeyService: ApiKeyService;
	let mockSecretService: MockSecretStorageService;

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
	// Provider switching → model list updates
	// ====================================================================

	suite("Provider Switching", () => {

		test("switching provider changes available models", () => {
			const anthropicModels = getModelsForProvider("anthropic");
			const openaiModels = getModelsForProvider("openai");

			assert.ok(anthropicModels.length > 0);
			assert.ok(openaiModels.length > 0);

			// No overlap
			const anthropicIds = new Set(anthropicModels.map(m => m.id));
			for (const m of openaiModels) {
				assert.ok(!anthropicIds.has(m.id), `model ${m.id} shouldn't overlap`);
			}
		});

		test("switching provider updates default model", () => {
			assert.strictEqual(getDefaultModel("anthropic"), "claude-sonnet-4-6");
			assert.strictEqual(getDefaultModel("openai"), "gpt-4o");
			assert.strictEqual(getDefaultModel("gemini"), "gemini-2.5-pro");
		});

		test("each provider's models have correct apiType", () => {
			for (const provider of SUPPORTED_PROVIDERS) {
				const expectedApiType = providerToApiType(provider);
				const models = getModelsForProvider(provider);
				for (const model of models) {
					assert.strictEqual(model.apiType, expectedApiType,
						`${model.id} should have apiType ${expectedApiType}`);
				}
			}
		});

		test("provider switch creates correct LLM provider instance", () => {
			const providersWithDefaults = SUPPORTED_PROVIDERS.filter(p => getDefaultModel(p) !== '');
			for (const providerName of providersWithDefaults) {
				const defaultModel = findModelById(getDefaultModel(providerName));
				assert.ok(defaultModel);
				const provider = createProvider(defaultModel!.apiType, { apiKey: "test" });
				assert.strictEqual(provider.apiType, providerToApiType(providerName));
			}
		});
	});

	// ====================================================================
	// Base URL propagation
	// ====================================================================

	suite("Base URL Propagation", () => {

		test("providers accept custom base URL", () => {
			for (const providerName of SUPPORTED_PROVIDERS) {
				const apiType = providerToApiType(providerName);
				const provider = createProvider(apiType, {
					apiKey: "test",
					baseURL: "https://proxy.example.com",
				});
				assert.strictEqual(provider.apiType, apiType);
			}
		});

		test("providers work without base URL (default)", () => {
			for (const providerName of SUPPORTED_PROVIDERS) {
				const apiType = providerToApiType(providerName);
				const provider = createProvider(apiType, { apiKey: "test" });
				assert.strictEqual(provider.apiType, apiType);
			}
		});

		test("built-in providers have default URLs defined", () => {
			const builtIn: readonly string[] = ['anthropic', 'openai', 'gemini'];
			for (const provider of builtIn) {
				assert.ok(PROVIDER_DEFAULT_URLS[provider as keyof typeof PROVIDER_DEFAULT_URLS]);
				assert.ok(PROVIDER_DEFAULT_URLS[provider as keyof typeof PROVIDER_DEFAULT_URLS].startsWith("https://"));
			}
		});
	});

	// ====================================================================
	// Multi-provider API key independence
	// ====================================================================

	suite("Multi-Provider API Key Independence", () => {

		test("setting one provider key doesn't affect others", async () => {
			await apiKeyService.setApiKey("anthropic", "ant-key");

			assert.strictEqual(await apiKeyService.hasApiKey("anthropic"), true);
			assert.strictEqual(await apiKeyService.hasApiKey("openai"), false);
			assert.strictEqual(await apiKeyService.hasApiKey("gemini"), false);
		});

		test("can set keys for all providers simultaneously", async () => {
			for (const p of SUPPORTED_PROVIDERS) {
				await apiKeyService.setApiKey(p, `key-${p}`);
			}
			for (const p of SUPPORTED_PROVIDERS) {
				assert.strictEqual(await apiKeyService.hasApiKey(p), true);
			}
		});

		test("deleting one key preserves others", async () => {
			await apiKeyService.setApiKey("anthropic", "ant-key");
			await apiKeyService.setApiKey("openai", "oai-key");
			await apiKeyService.setApiKey("gemini", "gem-key");

			await apiKeyService.deleteApiKey("openai");

			assert.strictEqual(await apiKeyService.hasApiKey("anthropic"), true);
			assert.strictEqual(await apiKeyService.hasApiKey("openai"), false);
			assert.strictEqual(await apiKeyService.hasApiKey("gemini"), true);
		});

		test("change events fire per-provider", async () => {
			const events: string[] = [];
			disposables.add(apiKeyService.onDidChangeApiKey(p => events.push(p)));

			await apiKeyService.setApiKey("anthropic", "key1");
			await apiKeyService.setApiKey("openai", "key2");
			await apiKeyService.setApiKey("gemini", "key3");

			assert.strictEqual(events.length, 3);
			assert.deepStrictEqual(events, ["anthropic", "openai", "gemini"]);
		});
	});

	// ====================================================================
	// Model catalog consistency
	// ====================================================================

	suite("Model Catalog Consistency", () => {

		test("every model's provider matches its apiType mapping", () => {
			for (const model of MODEL_CATALOG) {
				const expectedApiType = providerToApiType(model.provider);
				assert.strictEqual(model.apiType, expectedApiType,
					`model ${model.id}: expected ${expectedApiType}, got ${model.apiType}`);
			}
		});

		test("findModelById returns correct model", () => {
			for (const model of MODEL_CATALOG) {
				const found = findModelById(model.id);
				assert.ok(found);
				assert.strictEqual(found!.id, model.id);
				assert.strictEqual(found!.provider, model.provider);
			}
		});

		test("findModelById returns undefined for unknown model", () => {
			assert.strictEqual(findModelById("nonexistent-model"), undefined);
		});

		test("model token limits are reasonable", () => {
			for (const model of MODEL_CATALOG) {
				assert.ok(model.maxInputTokens >= 1000, `${model.id} maxInputTokens too small`);
				assert.ok(model.maxOutputTokens >= 1000, `${model.id} maxOutputTokens too small`);
				assert.ok(model.maxInputTokens > model.maxOutputTokens || model.id === "o3",
					`${model.id} maxInputTokens should usually exceed maxOutputTokens`);
			}
		});

		test("display names are provided for all providers", () => {
			for (const p of SUPPORTED_PROVIDERS) {
				assert.ok(PROVIDER_DISPLAY_NAMES[p]);
				assert.ok(PROVIDER_DISPLAY_NAMES[p].length > 0);
			}
		});
	});
});
