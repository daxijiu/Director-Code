/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import {
	ApiKeyService,
	SECRET_KEY_PREFIX,
	MODEL_KEY_PREFIX,
	MODEL_CONFIG_PREFIX,
	SUPPORTED_PROVIDERS,
	PROVIDER_DISPLAY_NAMES,
	PROVIDER_DEFAULT_URLS,
	providerToApiType,
	type ProviderName,
	type IModelConfig,
} from '../../../common/agentEngine/apiKeyService.js';
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

suite("AgentEngine - ApiKeyService", () => {

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
	// Constants
	// ====================================================================

	suite("Constants", () => {

		test("SECRET_KEY_PREFIX is correct", () => {
			assert.strictEqual(SECRET_KEY_PREFIX, "director-code.apiKey");
		});

		test("SUPPORTED_PROVIDERS has 5 providers", () => {
			assert.strictEqual(SUPPORTED_PROVIDERS.length, 5);
			assert.ok(SUPPORTED_PROVIDERS.includes("anthropic"));
			assert.ok(SUPPORTED_PROVIDERS.includes("openai"));
			assert.ok(SUPPORTED_PROVIDERS.includes("gemini"));
			assert.ok(SUPPORTED_PROVIDERS.includes("openai-compatible"));
			assert.ok(SUPPORTED_PROVIDERS.includes("anthropic-compatible"));
		});

		test("PROVIDER_DISPLAY_NAMES has entries for all providers", () => {
			for (const provider of SUPPORTED_PROVIDERS) {
				assert.ok(PROVIDER_DISPLAY_NAMES[provider], "missing display name for " + provider);
				assert.ok(PROVIDER_DISPLAY_NAMES[provider].length > 0);
			}
		});

		test("PROVIDER_DEFAULT_URLS has entries for built-in providers", () => {
			const builtIn: ProviderName[] = ['anthropic', 'openai', 'gemini'];
			for (const provider of builtIn) {
				assert.ok(PROVIDER_DEFAULT_URLS[provider], "missing default URL for " + provider);
				assert.ok(PROVIDER_DEFAULT_URLS[provider].startsWith("https://"));
			}
		});

		test("compatible providers have empty default URLs", () => {
			assert.strictEqual(PROVIDER_DEFAULT_URLS['openai-compatible'], "");
			assert.strictEqual(PROVIDER_DEFAULT_URLS['anthropic-compatible'], "");
		});

		test("providerToApiType maps correctly", () => {
			assert.strictEqual(providerToApiType("anthropic"), "anthropic-messages");
			assert.strictEqual(providerToApiType("openai"), "openai-completions");
			assert.strictEqual(providerToApiType("gemini"), "gemini-generative");
			assert.strictEqual(providerToApiType("openai-compatible"), "openai-completions");
			assert.strictEqual(providerToApiType("anthropic-compatible"), "anthropic-messages");
		});
	});

	// ====================================================================
	// getApiKey / setApiKey / deleteApiKey / hasApiKey
	// ====================================================================

	suite("Key CRUD Operations", () => {

		test("getApiKey returns undefined when no key is set", async () => {
			const key = await apiKeyService.getApiKey("anthropic");
			assert.strictEqual(key, undefined);
		});

		test("setApiKey stores and getApiKey retrieves", async () => {
			await apiKeyService.setApiKey("anthropic", "sk-ant-test-key");
			const key = await apiKeyService.getApiKey("anthropic");
			assert.strictEqual(key, "sk-ant-test-key");
		});

		test("setApiKey uses correct secret key format", async () => {
			await apiKeyService.setApiKey("openai", "sk-openai-test");
			// Verify through mock that it was stored with the prefix
			const raw = await mockSecretService.get("director-code.apiKey.openai");
			assert.strictEqual(raw, "sk-openai-test");
		});

		test("deleteApiKey removes the key", async () => {
			await apiKeyService.setApiKey("gemini", "gemini-key");
			assert.strictEqual(await apiKeyService.hasApiKey("gemini"), true);

			await apiKeyService.deleteApiKey("gemini");
			const key = await apiKeyService.getApiKey("gemini");
			assert.strictEqual(key, undefined);
		});

		test("hasApiKey returns false when no key is set", async () => {
			assert.strictEqual(await apiKeyService.hasApiKey("anthropic"), false);
		});

		test("hasApiKey returns true when key is set", async () => {
			await apiKeyService.setApiKey("anthropic", "some-key");
			assert.strictEqual(await apiKeyService.hasApiKey("anthropic"), true);
		});

		test("hasApiKey returns false for empty string", async () => {
			await mockSecretService.set("director-code.apiKey.anthropic", "");
			assert.strictEqual(await apiKeyService.hasApiKey("anthropic"), false);
		});

		test("keys for different providers are independent", async () => {
			await apiKeyService.setApiKey("anthropic", "ant-key");
			await apiKeyService.setApiKey("openai", "oai-key");

			assert.strictEqual(await apiKeyService.getApiKey("anthropic"), "ant-key");
			assert.strictEqual(await apiKeyService.getApiKey("openai"), "oai-key");
			assert.strictEqual(await apiKeyService.hasApiKey("gemini"), false);
		});

		test("setApiKey overwrites existing key", async () => {
			await apiKeyService.setApiKey("anthropic", "old-key");
			await apiKeyService.setApiKey("anthropic", "new-key");
			assert.strictEqual(await apiKeyService.getApiKey("anthropic"), "new-key");
		});
	});

	// ====================================================================
	// onDidChangeApiKey
	// ====================================================================

	suite("Change Events", () => {

		test("fires event when key is set", async () => {
			const events: string[] = [];
			disposables.add(apiKeyService.onDidChangeApiKey(provider => events.push(provider)));

			await apiKeyService.setApiKey("anthropic", "test-key");
			assert.strictEqual(events.length, 1);
			assert.strictEqual(events[0], "anthropic");
		});

		test("fires event when key is deleted", async () => {
			await apiKeyService.setApiKey("openai", "key");

			const events: string[] = [];
			disposables.add(apiKeyService.onDidChangeApiKey(provider => events.push(provider)));

			await apiKeyService.deleteApiKey("openai");
			assert.strictEqual(events.length, 1);
			assert.strictEqual(events[0], "openai");
		});

		test("does not fire for unrelated secret changes", async () => {
			const events: string[] = [];
			disposables.add(apiKeyService.onDidChangeApiKey(provider => events.push(provider)));

			// Set a secret with a different prefix
			await mockSecretService.set("some-other-service.key", "value");
			assert.strictEqual(events.length, 0);
		});

		test("fires separate events for different providers", async () => {
			const events: string[] = [];
			disposables.add(apiKeyService.onDidChangeApiKey(provider => events.push(provider)));

			await apiKeyService.setApiKey("anthropic", "key1");
			await apiKeyService.setApiKey("openai", "key2");

			assert.strictEqual(events.length, 2);
			assert.strictEqual(events[0], "anthropic");
			assert.strictEqual(events[1], "openai");
		});
	});

	// ====================================================================
	// testConnection (unit tests — no actual network calls)
	// ====================================================================

	suite("testConnection", () => {

		test("returns error for anthropic with invalid key (network error)", async () => {
			// This will try to fetch and fail because there's no actual server
			const result = await apiKeyService.testConnection("anthropic", "invalid-key");
			assert.strictEqual(result.success, false);
			assert.ok(result.error);
			assert.ok(typeof result.latencyMs === "number");
			assert.ok(result.latencyMs >= 0);
		});

		test("returns error for openai with invalid key (network error)", async () => {
			const result = await apiKeyService.testConnection("openai", "invalid-key");
			assert.strictEqual(result.success, false);
			assert.ok(result.error);
		});

		test("returns error for gemini with invalid key (network error)", async () => {
			const result = await apiKeyService.testConnection("gemini", "invalid-key");
			assert.strictEqual(result.success, false);
			assert.ok(result.error);
		});

		test("testConnection includes latencyMs on error", async () => {
			const result = await apiKeyService.testConnection("anthropic", "bad-key");
			assert.strictEqual(typeof result.latencyMs, "number");
			assert.ok(result.latencyMs! >= 0);
		});

		test("testConnection with custom baseURL", async () => {
			const result = await apiKeyService.testConnection("anthropic", "key", "https://localhost:1");
			assert.strictEqual(result.success, false);
			assert.ok(result.error);
		});

		test("testConnection with custom model parameter", async () => {
			const result = await apiKeyService.testConnection("openai", "key", "https://localhost:1", "deepseek-chat");
			assert.strictEqual(result.success, false);
			assert.ok(result.error);
		});

		test("testConnection with baseURL and model for all providers", async () => {
			for (const provider of SUPPORTED_PROVIDERS) {
				const result = await apiKeyService.testConnection(provider, "key", "https://localhost:1", "test-model");
				assert.strictEqual(result.success, false);
				assert.ok(result.error, "expected error for " + provider);
			}
		});
	});

	// ====================================================================
	// Per-Model API Key Management
	// ====================================================================

	suite("Per-Model API Key", () => {

		test("getModelApiKey falls back to provider-level key", async () => {
			await apiKeyService.setApiKey("anthropic", "provider-key");
			const key = await apiKeyService.getModelApiKey("anthropic", "claude-sonnet-4-6");
			assert.strictEqual(key, "provider-key");
		});

		test("getModelApiKey returns per-model key when set", async () => {
			await apiKeyService.setApiKey("anthropic", "provider-key");
			await apiKeyService.setModelApiKey("anthropic", "claude-sonnet-4-6", "model-key");
			const key = await apiKeyService.getModelApiKey("anthropic", "claude-sonnet-4-6");
			assert.strictEqual(key, "model-key");
		});

		test("getModelApiKey returns undefined when no key at any level", async () => {
			const key = await apiKeyService.getModelApiKey("openai", "gpt-4o");
			assert.strictEqual(key, undefined);
		});

		test("setModelApiKey stores with correct key format", async () => {
			await apiKeyService.setModelApiKey("openai", "gpt-4o", "model-specific-key");
			const raw = await mockSecretService.get("director-code.modelKey.openai.gpt-4o");
			assert.strictEqual(raw, "model-specific-key");
		});

		test("deleteModelApiKey reverts to provider-level key", async () => {
			await apiKeyService.setApiKey("anthropic", "provider-key");
			await apiKeyService.setModelApiKey("anthropic", "claude-sonnet-4-6", "model-key");
			assert.strictEqual(await apiKeyService.getModelApiKey("anthropic", "claude-sonnet-4-6"), "model-key");

			await apiKeyService.deleteModelApiKey("anthropic", "claude-sonnet-4-6");
			assert.strictEqual(await apiKeyService.getModelApiKey("anthropic", "claude-sonnet-4-6"), "provider-key");
		});

		test("hasModelApiKey returns true only for per-model key", async () => {
			await apiKeyService.setApiKey("anthropic", "provider-key");
			assert.strictEqual(await apiKeyService.hasModelApiKey("anthropic", "claude-sonnet-4-6"), false);

			await apiKeyService.setModelApiKey("anthropic", "claude-sonnet-4-6", "model-key");
			assert.strictEqual(await apiKeyService.hasModelApiKey("anthropic", "claude-sonnet-4-6"), true);
		});

		test("per-model keys are independent across models", async () => {
			await apiKeyService.setModelApiKey("openai", "gpt-4o", "key-4o");
			await apiKeyService.setModelApiKey("openai", "o3", "key-o3");

			assert.strictEqual(await apiKeyService.getModelApiKey("openai", "gpt-4o"), "key-4o");
			assert.strictEqual(await apiKeyService.getModelApiKey("openai", "o3"), "key-o3");
		});

		test("per-model keys are independent across providers", async () => {
			await apiKeyService.setModelApiKey("anthropic", "claude-sonnet-4-6", "ant-key");
			await apiKeyService.setModelApiKey("openai", "claude-sonnet-4-6", "oai-key");

			assert.strictEqual(await apiKeyService.getModelApiKey("anthropic", "claude-sonnet-4-6"), "ant-key");
			assert.strictEqual(await apiKeyService.getModelApiKey("openai", "claude-sonnet-4-6"), "oai-key");
		});

		test("change events fire for per-model key changes", async () => {
			const events: string[] = [];
			disposables.add(apiKeyService.onDidChangeApiKey(e => events.push(e)));

			await apiKeyService.setModelApiKey("openai", "gpt-4o", "key");
			assert.ok(events.length > 0);
		});
	});

	// ====================================================================
	// Per-Model Configuration
	// ====================================================================

	suite("Per-Model Configuration", () => {

		test("getModelConfig returns undefined when not set", async () => {
			const config = await apiKeyService.getModelConfig("anthropic", "claude-sonnet-4-6");
			assert.strictEqual(config, undefined);
		});

		test("setModelConfig and getModelConfig round-trip", async () => {
			const config: IModelConfig = {
				baseURL: "https://custom.proxy.com",
				capabilities: { vision: true, toolCalling: true },
			};
			await apiKeyService.setModelConfig("openai", "gpt-4o", config);
			const retrieved = await apiKeyService.getModelConfig("openai", "gpt-4o");
			assert.deepStrictEqual(retrieved, config);
		});

		test("deleteModelConfig removes the config", async () => {
			await apiKeyService.setModelConfig("anthropic", "claude-sonnet-4-6", { baseURL: "https://test.com" });
			assert.ok(await apiKeyService.getModelConfig("anthropic", "claude-sonnet-4-6"));

			await apiKeyService.deleteModelConfig("anthropic", "claude-sonnet-4-6");
			assert.strictEqual(await apiKeyService.getModelConfig("anthropic", "claude-sonnet-4-6"), undefined);
		});

		test("model configs are independent across models", async () => {
			await apiKeyService.setModelConfig("openai", "gpt-4o", { baseURL: "https://a.com" });
			await apiKeyService.setModelConfig("openai", "o3", { baseURL: "https://b.com" });

			const a = await apiKeyService.getModelConfig("openai", "gpt-4o");
			const b = await apiKeyService.getModelConfig("openai", "o3");
			assert.strictEqual(a?.baseURL, "https://a.com");
			assert.strictEqual(b?.baseURL, "https://b.com");
		});

		test("config stored as JSON in secret service", async () => {
			const config: IModelConfig = { baseURL: "https://test.com" };
			await apiKeyService.setModelConfig("gemini", "gemini-2.5-pro", config);

			const raw = await mockSecretService.get("director-code.modelConfig.gemini.gemini-2.5-pro");
			assert.ok(raw);
			assert.deepStrictEqual(JSON.parse(raw!), config);
		});

		test("handles malformed JSON gracefully", async () => {
			await mockSecretService.set("director-code.modelConfig.openai.gpt-4o", "not-json");
			const config = await apiKeyService.getModelConfig("openai", "gpt-4o");
			assert.strictEqual(config, undefined);
		});

		test("capabilities can be stored per-model", async () => {
			await apiKeyService.setModelConfig("anthropic", "claude-sonnet-4-6", {
				capabilities: { vision: false, thinking: true, toolCalling: true, streaming: true },
			});
			const config = await apiKeyService.getModelConfig("anthropic", "claude-sonnet-4-6");
			assert.strictEqual(config?.capabilities?.vision, false);
			assert.strictEqual(config?.capabilities?.thinking, true);
		});
	});

	// ====================================================================
	// Resolved Provider Options (three-level fallback)
	// ====================================================================

	suite("resolveProviderOptions", () => {

		test("returns undefined when no API key at any level", async () => {
			const result = await apiKeyService.resolveProviderOptions("anthropic", "claude-sonnet-4-6");
			assert.strictEqual(result, undefined);
		});

		test("uses provider-level API key when no per-model key", async () => {
			await apiKeyService.setApiKey("anthropic", "provider-key");
			const result = await apiKeyService.resolveProviderOptions("anthropic", "claude-sonnet-4-6");
			assert.ok(result);
			assert.strictEqual(result!.auth.value, "provider-key");
		});

		test("uses per-model API key when set", async () => {
			await apiKeyService.setApiKey("anthropic", "provider-key");
			await apiKeyService.setModelApiKey("anthropic", "claude-sonnet-4-6", "model-key");
			const result = await apiKeyService.resolveProviderOptions("anthropic", "claude-sonnet-4-6");
			assert.ok(result);
			assert.strictEqual(result!.auth.value, "model-key");
		});

		test("uses per-model baseURL over global", async () => {
			await apiKeyService.setApiKey("openai", "key");
			await apiKeyService.setModelConfig("openai", "gpt-4o", { baseURL: "https://model-proxy.com" });
			const result = await apiKeyService.resolveProviderOptions("openai", "gpt-4o", "https://global.com");
			assert.strictEqual(result!.baseURL, "https://model-proxy.com");
		});

		test("uses global baseURL when no per-model config", async () => {
			await apiKeyService.setApiKey("openai", "key");
			const result = await apiKeyService.resolveProviderOptions("openai", "gpt-4o", "https://global.com");
			assert.strictEqual(result!.baseURL, "https://global.com");
		});

		test("baseURL is undefined when nothing set", async () => {
			await apiKeyService.setApiKey("anthropic", "key");
			const result = await apiKeyService.resolveProviderOptions("anthropic", "claude-sonnet-4-6");
			assert.strictEqual(result!.baseURL, undefined);
		});

		test("includes per-model capabilities", async () => {
			await apiKeyService.setApiKey("anthropic", "key");
			await apiKeyService.setModelConfig("anthropic", "claude-sonnet-4-6", {
				capabilities: { vision: false },
			});
			const result = await apiKeyService.resolveProviderOptions("anthropic", "claude-sonnet-4-6");
			assert.strictEqual(result!.capabilities?.vision, false);
		});

		test("capabilities undefined when no per-model config", async () => {
			await apiKeyService.setApiKey("anthropic", "key");
			const result = await apiKeyService.resolveProviderOptions("anthropic", "claude-sonnet-4-6");
			assert.strictEqual(result!.capabilities, undefined);
		});

		test("full resolution with all levels populated", async () => {
			await apiKeyService.setApiKey("openai", "provider-key");
			await apiKeyService.setModelApiKey("openai", "gpt-4o", "model-key");
			await apiKeyService.setModelConfig("openai", "gpt-4o", {
				baseURL: "https://proxy.com/v1",
				capabilities: { vision: true, thinking: false },
			});

			const result = await apiKeyService.resolveProviderOptions("openai", "gpt-4o", "https://global.com");
			assert.strictEqual(result!.auth.value, "model-key");
			assert.strictEqual(result!.baseURL, "https://proxy.com/v1");
			assert.strictEqual(result!.capabilities?.vision, true);
			assert.strictEqual(result!.capabilities?.thinking, false);
		});
	});

	// ====================================================================
	// Constants (new)
	// ====================================================================

	suite("New Constants", () => {
		test("MODEL_KEY_PREFIX is correct", () => {
			assert.strictEqual(MODEL_KEY_PREFIX, "director-code.modelKey");
		});

		test("MODEL_CONFIG_PREFIX is correct", () => {
			assert.strictEqual(MODEL_CONFIG_PREFIX, "director-code.modelConfig");
		});
	});
});
