/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import {
	SUPPORTED_PROVIDERS,
	PROVIDER_DISPLAY_NAMES,
	PROVIDER_DEFAULT_URLS,
	type ProviderName,
	type IApiKeyService,
	type IConnectionTestResult,
} from '../../../common/agentEngine/apiKeyService.js';

/**
 * Tests for ApiKeysWidget supporting types and logic.
 *
 * Note: The widget itself requires a DOM environment (browser), so here
 * we test the underlying service integration and data structures.
 * Full DOM tests would run in the browser test runner.
 */

// ============================================================================
// Mock IApiKeyService
// ============================================================================

class MockApiKeyService implements IApiKeyService {
	declare readonly _serviceBrand: undefined;

	private readonly _store = new Map<string, string>();
	private readonly _onDidChangeApiKey = new Emitter<string>();
	readonly onDidChangeApiKey: Event<string> = this._onDidChangeApiKey.event;

	async getApiKey(provider: ProviderName): Promise<string | undefined> {
		return this._store.get(provider);
	}

	async setApiKey(provider: ProviderName, key: string): Promise<void> {
		this._store.set(provider, key);
		this._onDidChangeApiKey.fire(provider);
	}

	async deleteApiKey(provider: ProviderName): Promise<void> {
		this._store.delete(provider);
		this._onDidChangeApiKey.fire(provider);
	}

	async hasApiKey(provider: ProviderName): Promise<boolean> {
		const key = this._store.get(provider);
		return key !== undefined && key.length > 0;
	}

	async testConnection(provider: ProviderName, _apiKey: string, _baseURL?: string): Promise<IConnectionTestResult> {
		// Mock always succeeds
		return { success: true, model: "mock-model", latencyMs: 42 };
	}

	dispose(): void {
		this._onDidChangeApiKey.dispose();
	}
}

suite("AgentEngine - ApiKeysWidget (Logic)", () => {

	const disposables = new DisposableStore();
	let mockService: MockApiKeyService;

	setup(() => {
		mockService = new MockApiKeyService();
		disposables.add({ dispose: () => mockService.dispose() });
	});

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	// ====================================================================
	// Provider metadata validation
	// ====================================================================

	suite("Provider Metadata", () => {

		test("all providers have display names", () => {
			for (const p of SUPPORTED_PROVIDERS) {
				assert.ok(PROVIDER_DISPLAY_NAMES[p].length > 0, "missing display name for " + p);
			}
		});

		test("all providers have default URLs", () => {
			for (const p of SUPPORTED_PROVIDERS) {
				assert.ok(PROVIDER_DEFAULT_URLS[p].startsWith("https://"), "bad URL for " + p);
			}
		});

		test("display names are user-friendly", () => {
			assert.ok(PROVIDER_DISPLAY_NAMES.anthropic.includes("Anthropic"));
			assert.ok(PROVIDER_DISPLAY_NAMES.openai.includes("OpenAI"));
			assert.ok(PROVIDER_DISPLAY_NAMES.gemini.includes("Gemini"));
		});
	});

	// ====================================================================
	// Mock service integration (widget would use these)
	// ====================================================================

	suite("Service Integration", () => {

		test("widget can check all providers for key status", async () => {
			await mockService.setApiKey("anthropic", "sk-ant-key");

			const statuses: Record<string, boolean> = {};
			for (const p of SUPPORTED_PROVIDERS) {
				statuses[p] = await mockService.hasApiKey(p);
			}

			assert.strictEqual(statuses.anthropic, true);
			assert.strictEqual(statuses.openai, false);
			assert.strictEqual(statuses.gemini, false);
		});

		test("widget receives change events", async () => {
			const events: string[] = [];
			disposables.add(mockService.onDidChangeApiKey(p => events.push(p)));

			await mockService.setApiKey("openai", "key");
			await mockService.deleteApiKey("openai");

			assert.strictEqual(events.length, 2);
			assert.strictEqual(events[0], "openai");
			assert.strictEqual(events[1], "openai");
		});

		test("widget can test connection", async () => {
			const result = await mockService.testConnection("anthropic", "key");
			assert.strictEqual(result.success, true);
			assert.strictEqual(result.model, "mock-model");
			assert.strictEqual(result.latencyMs, 42);
		});

		test("save flow: set key then verify", async () => {
			await mockService.setApiKey("gemini", "gemini-api-key");
			assert.strictEqual(await mockService.hasApiKey("gemini"), true);
			assert.strictEqual(await mockService.getApiKey("gemini"), "gemini-api-key");
		});

		test("delete flow: set then delete then verify", async () => {
			await mockService.setApiKey("anthropic", "key");
			assert.strictEqual(await mockService.hasApiKey("anthropic"), true);

			await mockService.deleteApiKey("anthropic");
			assert.strictEqual(await mockService.hasApiKey("anthropic"), false);
		});
	});

	// ====================================================================
	// Connection test result format
	// ====================================================================

	suite("Connection Test Results", () => {

		test("success result has model and latency", async () => {
			const result = await mockService.testConnection("anthropic", "key");
			assert.strictEqual(result.success, true);
			assert.ok(result.model);
			assert.ok(typeof result.latencyMs === "number");
		});

		test("IConnectionTestResult structure matches widget expectations", () => {
			// Verify the type shape
			const successResult: IConnectionTestResult = {
				success: true,
				model: "claude-sonnet-4-6",
				latencyMs: 100,
			};
			assert.strictEqual(successResult.success, true);
			assert.strictEqual(successResult.error, undefined);

			const errorResult: IConnectionTestResult = {
				success: false,
				error: "Invalid API key",
				latencyMs: 50,
			};
			assert.strictEqual(errorResult.success, false);
			assert.ok(errorResult.error);
		});
	});
});
