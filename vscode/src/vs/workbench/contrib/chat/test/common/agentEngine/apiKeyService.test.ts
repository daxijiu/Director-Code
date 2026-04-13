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
	SUPPORTED_PROVIDERS,
	PROVIDER_DISPLAY_NAMES,
	PROVIDER_DEFAULT_URLS,
	providerToApiType,
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

		test("SUPPORTED_PROVIDERS has 3 providers", () => {
			assert.strictEqual(SUPPORTED_PROVIDERS.length, 3);
			assert.ok(SUPPORTED_PROVIDERS.includes("anthropic"));
			assert.ok(SUPPORTED_PROVIDERS.includes("openai"));
			assert.ok(SUPPORTED_PROVIDERS.includes("gemini"));
		});

		test("PROVIDER_DISPLAY_NAMES has entries for all providers", () => {
			for (const provider of SUPPORTED_PROVIDERS) {
				assert.ok(PROVIDER_DISPLAY_NAMES[provider], "missing display name for " + provider);
				assert.ok(PROVIDER_DISPLAY_NAMES[provider].length > 0);
			}
		});

		test("PROVIDER_DEFAULT_URLS has entries for all providers", () => {
			for (const provider of SUPPORTED_PROVIDERS) {
				assert.ok(PROVIDER_DEFAULT_URLS[provider], "missing default URL for " + provider);
				assert.ok(PROVIDER_DEFAULT_URLS[provider].startsWith("https://"));
			}
		});

		test("providerToApiType maps correctly", () => {
			assert.strictEqual(providerToApiType("anthropic"), "anthropic-messages");
			assert.strictEqual(providerToApiType("openai"), "openai-completions");
			assert.strictEqual(providerToApiType("gemini"), "gemini-generative");
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
			// Should fail but use the custom URL
			const result = await apiKeyService.testConnection("anthropic", "key", "https://localhost:1");
			assert.strictEqual(result.success, false);
			assert.ok(result.error);
		});
	});
});
