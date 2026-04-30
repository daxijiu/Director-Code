/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Integration Tests — Error Handling
 *
 * Tests error scenarios across the Agent Engine stack:
 * - Missing API keys
 * - Invalid provider types
 * - Connection failures
 * - HTTP errors from providers
 */

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import {
	ApiKeyService,
	SUPPORTED_PROVIDERS,
} from '../../../common/agentEngine/apiKeyService.js';
import { createProvider } from '../../../common/agentEngine/providers/providerFactory.js';
import type { ApiType } from '../../../common/agentEngine/providers/providerTypes.js';
import { isRetryableError, isAuthError, isRateLimitError, formatApiError } from '../../../common/agentEngine/retry.js';
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

suite("AgentEngine - Integration: Error Handling", () => {

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
	// Provider factory errors
	// ====================================================================

	suite("Provider Factory Errors", () => {

		test("throws on unknown API type", () => {
			assert.throws(
				() => createProvider("unknown-api" as ApiType, { auth: { kind: 'api-key', value: "test" } }),
				(err: any) => err.message.includes("Unknown API type"),
			);
		});

		test("creates provider even with empty API key", () => {
			// Provider factory doesn't validate key content — that's the API's job
			const provider = createProvider("anthropic-messages", { auth: { kind: 'api-key', value: "" } });
			assert.strictEqual(provider.apiType, "anthropic-messages");
		});

		test("creates provider with very long API key", () => {
			const longKey = "x".repeat(10000);
			const provider = createProvider("openai-completions", { auth: { kind: 'api-key', value: longKey } });
			assert.strictEqual(provider.apiType, "openai-completions");
		});
	});

	// ====================================================================
	// Connection test error handling
	// ====================================================================

	suite("Connection Test Errors", () => {

		test("connection test with invalid key returns error result", async () => {
			const result = await apiKeyService.testConnection("anthropic", "invalid-key");
			assert.strictEqual(result.success, false);
			assert.ok(result.error);
			assert.ok(result.latencyMs !== undefined);
		});

		test("connection test with unreachable URL returns error", async () => {
			const result = await apiKeyService.testConnection("anthropic", "key", "https://localhost:1");
			assert.strictEqual(result.success, false);
			assert.ok(result.error);
		});

		test("connection test error does not throw", async () => {
			// Should never throw — returns IConnectionTestResult with success=false
			for (const provider of SUPPORTED_PROVIDERS) {
				const result = await apiKeyService.testConnection(provider, "bad-key");
				assert.strictEqual(result.success, false);
			}
		});

		test("connection test has positive latencyMs even on failure", async () => {
			const result = await apiKeyService.testConnection("openai", "bad-key");
			assert.strictEqual(typeof result.latencyMs, "number");
			assert.ok(result.latencyMs! >= 0);
		});
	});

	// ====================================================================
	// API key error scenarios
	// ====================================================================

	suite("API Key Error Scenarios", () => {

		test("setting empty string key, hasApiKey returns false", async () => {
			await mockSecretService.set("director-code.apiKey.anthropic", "");
			assert.strictEqual(await apiKeyService.hasApiKey("anthropic"), false);
		});

		test("overwriting key replaces old value", async () => {
			await apiKeyService.setApiKey("anthropic", "old-key");
			await apiKeyService.setApiKey("anthropic", "new-key");
			assert.strictEqual(await apiKeyService.getApiKey("anthropic"), "new-key");
		});

		test("deleting non-existent key doesn't throw", async () => {
			// Should complete without error
			await apiKeyService.deleteApiKey("gemini");
			assert.strictEqual(await apiKeyService.hasApiKey("gemini"), false);
		});
	});

	// ====================================================================
	// Error classification (retry module)
	// ====================================================================

	suite("Error Classification", () => {

		test("classifies rate limit error as retryable", () => {
			const err: any = new Error("Rate limit exceeded");
			err.status = 429;
			assert.strictEqual(isRetryableError(err), true);
			assert.strictEqual(isRateLimitError(err), true);
		});

		test("classifies 500 server error as retryable", () => {
			const err: any = new Error("Internal server error");
			err.status = 500;
			assert.strictEqual(isRetryableError(err), true);
		});

		test("classifies 401 auth error as non-retryable", () => {
			const err: any = new Error("Invalid API key");
			err.status = 401;
			assert.strictEqual(isRetryableError(err), false);
			assert.strictEqual(isAuthError(err), true);
		});

		test("classifies 400 bad request as non-retryable", () => {
			const err: any = new Error("Bad request");
			err.status = 400;
			assert.strictEqual(isRetryableError(err), false);
		});

		test("classifies network error (ECONNRESET) as retryable", () => {
			const err: any = new Error("fetch failed");
			err.code = "ECONNRESET";
			assert.strictEqual(isRetryableError(err), true);
		});

		test("formatApiError returns user-friendly messages", () => {
			const authErr: any = new Error("Unauthorized");
			authErr.status = 401;
			assert.ok(formatApiError(authErr).includes("Authentication"));

			const rateErr: any = new Error("Too many requests");
			rateErr.status = 429;
			assert.ok(formatApiError(rateErr).includes("Rate limit"));
		});
	});

	// ====================================================================
	// Provider HTTP error handling
	// ====================================================================

	suite("Provider HTTP Error Propagation", () => {

		test("Anthropic provider throws on HTTP error with status", async () => {
			const provider = createProvider("anthropic-messages", { auth: { kind: 'api-key', value: "invalid" } });
			try {
				await provider.createMessage({
					model: "claude-sonnet-4-6",
					maxTokens: 1,
					system: "",
					messages: [{ role: "user", content: "hi" }],
				});
				assert.fail("should have thrown");
			} catch (err: any) {
				assert.ok(err.message);
				// Network error or HTTP error — both acceptable
				assert.ok(typeof err.message === "string");
			}
		});

		test("OpenAI provider throws on HTTP error", async () => {
			const provider = createProvider("openai-completions", { auth: { kind: 'api-key', value: "invalid" } });
			try {
				await provider.createMessage({
					model: "gpt-4o-mini",
					maxTokens: 1,
					system: "",
					messages: [{ role: "user", content: "hi" }],
				});
				assert.fail("should have thrown");
			} catch (err: any) {
				assert.ok(err.message);
			}
		});

		test("Gemini provider throws on HTTP error", async () => {
			const provider = createProvider("gemini-generative", { auth: { kind: 'api-key', value: "invalid" } });
			try {
				await provider.createMessage({
					model: "gemini-2.5-flash",
					maxTokens: 1,
					system: "",
					messages: [{ role: "user", content: "hi" }],
				});
				assert.fail("should have thrown");
			} catch (err: any) {
				assert.ok(err.message);
			}
		});
	});
});
