/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ModelResolverService } from '../../../common/agentEngine/modelResolver.js';
import { getModelsForProvider } from '../../../common/agentEngine/modelCatalog.js';

suite("AgentEngine - ModelResolverService", () => {

	const disposables = new DisposableStore();
	let resolver: ModelResolverService;
	let originalFetch: typeof globalThis.fetch;

	setup(() => {
		originalFetch = globalThis.fetch;
		resolver = new ModelResolverService();
		disposables.add(resolver);
	});

	teardown(() => {
		disposables.clear();
		globalThis.fetch = originalFetch;
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function mockFetch(handler: (url: string) => Response | Promise<Response>) {
		globalThis.fetch = ((url: string | URL | Request, _init?: RequestInit) => {
			return Promise.resolve(handler(String(url)));
		}) as any;
	}

	function mockFetchFailAll() {
		globalThis.fetch = (() => Promise.reject(new Error("Network error"))) as any;
	}

	// ---------------------------------------------------------------
	// Layer 3: Static fallback (always works)
	// ---------------------------------------------------------------
	suite("Static fallback (Layer 3)", () => {

		test("returns static models for anthropic when all layers fail", async () => {
			mockFetchFailAll();
			const models = await resolver.resolveModels("anthropic");
			assert.ok(models.length > 0);
			assert.ok(models.every(m => m.source === "static"));
			assert.ok(models.every(m => m.provider === "anthropic"));
		});

		test("returns static models for openai when no API key", async () => {
			mockFetchFailAll();
			const models = await resolver.resolveModels("openai");
			const expected = getModelsForProvider("openai");
			assert.strictEqual(models.length, expected.length);
		});

		test("returns static models for gemini when no API key", async () => {
			mockFetchFailAll();
			const models = await resolver.resolveModels("gemini");
			assert.ok(models.length > 0);
		});

		test("returns empty for anthropic-compatible (no static models)", async () => {
			mockFetchFailAll();
			const models = await resolver.resolveModels("anthropic-compatible");
			assert.strictEqual(models.length, 0);
		});

		test("returns preset models for openai-compatible", async () => {
			mockFetchFailAll();
			const models = await resolver.resolveModels("openai-compatible");
			assert.ok(models.length > 0);
			assert.ok(models.some(m => m.id === "deepseek-chat"));
		});

		test("static models have correct source tag", async () => {
			mockFetchFailAll();
			const models = await resolver.resolveModels("anthropic");
			for (const m of models) {
				assert.strictEqual(m.source, "static");
			}
		});

		test("static models preserve all IModelDefinition fields", async () => {
			mockFetchFailAll();
			const models = await resolver.resolveModels("anthropic");
			for (const m of models) {
				assert.ok(m.id);
				assert.ok(m.name);
				assert.ok(m.provider);
				assert.ok(m.family);
				assert.ok(m.apiType);
				assert.ok(m.maxInputTokens > 0);
				assert.ok(m.maxOutputTokens > 0);
			}
		});
	});

	// ---------------------------------------------------------------
	// Layer 1: Provider API
	// ---------------------------------------------------------------
	suite("Provider API (Layer 1)", () => {

		test("fetches OpenAI models from /models endpoint", async () => {
			mockFetch((url) => {
				if (url.includes("/models")) {
					return new Response(JSON.stringify({
						data: [
							{ id: "gpt-4o", owned_by: "openai" },
							{ id: "gpt-4o-mini", owned_by: "openai" },
							{ id: "dall-e-3", owned_by: "openai" },
						],
					}), { status: 200 });
				}
				return new Response("", { status: 404 });
			});

			const models = await resolver.resolveModels("openai", "test-key");
			assert.ok(models.length >= 2);
			assert.ok(models.some(m => m.id === "gpt-4o"));
			assert.ok(models.every(m => m.source === "api"));
			assert.ok(!models.some(m => m.id === "dall-e-3"));
		});

		test("filters out non-GPT/o-series models", async () => {
			mockFetch(() => new Response(JSON.stringify({
				data: [
					{ id: "gpt-4o", owned_by: "openai" },
					{ id: "text-embedding-ada-002", owned_by: "openai" },
					{ id: "whisper-1", owned_by: "openai" },
				],
			}), { status: 200 }));

			const models = await resolver.resolveModels("openai", "key");
			assert.strictEqual(models.length, 1);
			assert.strictEqual(models[0].id, "gpt-4o");
		});

		test("enriches known models from static catalog", async () => {
			mockFetch(() => new Response(JSON.stringify({
				data: [{ id: "gpt-4o", owned_by: "openai" }],
			}), { status: 200 }));

			const models = await resolver.resolveModels("openai", "key");
			const gpt4o = models.find(m => m.id === "gpt-4o")!;
			assert.ok(gpt4o);
			assert.strictEqual(gpt4o.family, "gpt-4");
			assert.strictEqual(gpt4o.maxInputTokens, 128_000);
		});

		test("creates generic entry for unknown API models", async () => {
			mockFetch(() => new Response(JSON.stringify({
				data: [{ id: "gpt-5-turbo", owned_by: "openai" }],
			}), { status: 200 }));

			const models = await resolver.resolveModels("openai", "key");
			const newModel = models.find(m => m.id === "gpt-5-turbo");
			assert.ok(newModel);
			assert.strictEqual(newModel!.source, "api");
			assert.strictEqual(newModel!.name, "gpt-5-turbo");
		});

		test("fetches Gemini models from /v1beta/models endpoint", async () => {
			mockFetch((url) => {
				if (url.includes("/v1beta/models")) {
					return new Response(JSON.stringify({
						models: [
							{ name: "models/gemini-2.5-pro", displayName: "Gemini 2.5 Pro", inputTokenLimit: 1000000, outputTokenLimit: 65536 },
							{ name: "models/gemini-2.5-flash", displayName: "Gemini 2.5 Flash" },
						],
					}), { status: 200 });
				}
				return new Response("", { status: 404 });
			});

			const models = await resolver.resolveModels("gemini", "key");
			assert.ok(models.length >= 2);
			assert.ok(models.some(m => m.id === "gemini-2.5-pro"));
		});

		test("skips API layer for Anthropic (no models endpoint)", async () => {
			mockFetch(() => {
				return new Response("", { status: 404 });
			});

			const models = await resolver.resolveModels("anthropic", "key");
			assert.ok(models.length > 0);
			assert.ok(models.every(m => m.source === "cdn" || m.source === "static"));
		});

		test("falls through to static when API returns error", async () => {
			mockFetch(() => new Response("Unauthorized", { status: 401 }));

			const models = await resolver.resolveModels("openai", "bad-key");
			assert.ok(models.length > 0);
			assert.ok(models.every(m => m.source === "static"));
		});

		test("falls through when API returns empty data", async () => {
			mockFetch(() => new Response(JSON.stringify({ data: [] }), { status: 200 }));

			const models = await resolver.resolveModels("openai", "key");
			assert.ok(models.length > 0);
		});
	});

	// ---------------------------------------------------------------
	// Layer 2: CDN JSON
	// ---------------------------------------------------------------
	suite("CDN JSON (Layer 2)", () => {

		test("fetches models from CDN when API unavailable", async () => {
			mockFetch((url) => {
				if (url.includes("model-catalog.json")) {
					return new Response(JSON.stringify({
						version: 1,
						models: [
							{ id: "claude-sonnet-5-0", name: "Claude Sonnet 5.0", provider: "anthropic", apiType: "anthropic-messages", family: "claude-5", maxInputTokens: 300000, maxOutputTokens: 16384 },
							{ id: "gpt-5", name: "GPT-5", provider: "openai", apiType: "openai-completions" },
						],
					}), { status: 200 });
				}
				return new Response("Not found", { status: 404 });
			});

			const models = await resolver.resolveModels("anthropic", "key");
			assert.strictEqual(models.length, 1);
			assert.strictEqual(models[0].id, "claude-sonnet-5-0");
			assert.strictEqual(models[0].source, "cdn");
			assert.strictEqual(models[0].maxInputTokens, 300000);
		});

		test("CDN models filtered by provider", async () => {
			mockFetch((url) => {
				if (url.includes("model-catalog.json")) {
					return new Response(JSON.stringify({
						version: 1,
						models: [
							{ id: "model-a", name: "A", provider: "anthropic", apiType: "anthropic-messages" },
							{ id: "model-b", name: "B", provider: "openai", apiType: "openai-completions" },
						],
					}), { status: 200 });
				}
				return new Response("", { status: 404 });
			});

			const anthropicModels = await resolver.resolveModels("anthropic");
			assert.ok(anthropicModels.every(m => m.provider === "anthropic"));
		});

		test("falls through to static when CDN fails", async () => {
			mockFetchFailAll();

			const models = await resolver.resolveModels("openai");
			assert.ok(models.length > 0);
			assert.ok(models.every(m => m.source === "static"));
		});

		test("CDN models have default values for missing fields", async () => {
			mockFetch((url) => {
				if (url.includes("model-catalog.json")) {
					return new Response(JSON.stringify({
						version: 1,
						models: [{ id: "test-model", name: "Test", provider: "openai", apiType: "openai-completions" }],
					}), { status: 200 });
				}
				return new Response("", { status: 404 });
			});

			const models = await resolver.resolveModels("openai");
			const m = models.find(m2 => m2.id === "test-model");
			assert.ok(m);
			assert.strictEqual(m!.family, "unknown");
			assert.strictEqual(m!.maxInputTokens, 128_000);
			assert.strictEqual(m!.maxOutputTokens, 8_192);
		});
	});

	// ---------------------------------------------------------------
	// Caching
	// ---------------------------------------------------------------
	suite("Caching", () => {

		test("second call uses cache (no fetch)", async () => {
			let fetchCount = 0;
			mockFetch(() => {
				fetchCount++;
				return new Response("", { status: 404 });
			});

			await resolver.resolveModels("anthropic");
			const fetchCountAfterFirst = fetchCount;

			await resolver.resolveModels("anthropic");
			assert.strictEqual(fetchCount, fetchCountAfterFirst);
		});

		test("different providers have separate caches", async () => {
			mockFetchFailAll();

			const anthropic = await resolver.resolveModels("anthropic");
			const openai = await resolver.resolveModels("openai");

			assert.ok(anthropic.every(m => m.provider === "anthropic"));
			assert.ok(openai.every(m => m.provider === "openai"));
		});

		test("refreshModels bypasses cache", async () => {
			let fetchCount = 0;
			mockFetch(() => {
				fetchCount++;
				return new Response("", { status: 404 });
			});

			await resolver.resolveModels("anthropic");
			const afterFirst = fetchCount;

			await resolver.refreshModels("anthropic");
			assert.ok(fetchCount > afterFirst);
		});

		test("clearCache invalidates all entries", async () => {
			mockFetchFailAll();

			await resolver.resolveModels("anthropic");
			await resolver.resolveModels("openai");

			resolver.clearCache();

			let fetchCount = 0;
			mockFetch(() => {
				fetchCount++;
				return new Response("", { status: 404 });
			});

			await resolver.resolveModels("anthropic");
			assert.ok(fetchCount > 0);
		});

		test("different baseURLs have separate caches", async () => {
			mockFetch(() => new Response(JSON.stringify({
				data: [{ id: "gpt-4o" }],
			}), { status: 200 }));

			const a = await resolver.resolveModels("openai", "key", "https://api-a.com/v1");
			const b = await resolver.resolveModels("openai", "key", "https://api-b.com/v1");

			assert.ok(a.length > 0);
			assert.ok(b.length > 0);
		});
	});

	// ---------------------------------------------------------------
	// Events
	// ---------------------------------------------------------------
	suite("Events", () => {

		test("refreshModels fires onDidChangeModels", async () => {
			mockFetchFailAll();

			const events: string[] = [];
			disposables.add(resolver.onDidChangeModels(p => events.push(p)));

			await resolver.refreshModels("anthropic");
			assert.ok(events.includes("anthropic"));
		});

		test("resolveModels does NOT fire event", async () => {
			mockFetchFailAll();

			const events: string[] = [];
			disposables.add(resolver.onDidChangeModels(p => events.push(p)));

			await resolver.resolveModels("openai");
			assert.strictEqual(events.length, 0);
		});
	});

	// ---------------------------------------------------------------
	// Edge cases
	// ---------------------------------------------------------------
	suite("Edge cases", () => {

		test("handles malformed API response gracefully", async () => {
			mockFetch(() => new Response("not-json", { status: 200 }));

			const models = await resolver.resolveModels("openai", "key");
			assert.ok(models.length > 0);
		});

		test("handles null data in API response", async () => {
			mockFetch(() => new Response(JSON.stringify({ data: null }), { status: 200 }));

			const models = await resolver.resolveModels("openai", "key");
			assert.ok(models.length > 0);
		});

		test("handles CDN with malformed JSON", async () => {
			mockFetch((url) => {
				if (url.includes("model-catalog.json")) {
					return new Response("invalid", { status: 200 });
				}
				return new Response("", { status: 404 });
			});

			const models = await resolver.resolveModels("anthropic");
			assert.ok(models.length > 0);
			assert.ok(models.every(m => m.source === "static"));
		});

		test("MODEL_CATALOG coverage for all built-in providers", () => {
			for (const provider of ["anthropic", "openai", "gemini", "openai-compatible"] as const) {
				const models = getModelsForProvider(provider);
				assert.ok(models.length > 0, `${provider} should have models in static catalog`);
			}
		});
	});
});
