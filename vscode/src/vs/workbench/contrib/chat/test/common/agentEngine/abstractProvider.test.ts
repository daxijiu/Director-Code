/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AbstractDirectorCodeProvider, getDefaultCapabilities } from '../../../common/agentEngine/providers/abstractProvider.js';
import { AnthropicProvider } from '../../../common/agentEngine/providers/anthropicProvider.js';
import { OpenAIProvider } from '../../../common/agentEngine/providers/openaiProvider.js';
import { GeminiProvider } from '../../../common/agentEngine/providers/geminiProvider.js';
import type { CreateMessageParams, CreateMessageResponse, StreamEvent, ApiType, ProviderCapabilities } from '../../../common/agentEngine/providers/providerTypes.js';

// ============================================================================
// Concrete subclass for testing abstract base
// ============================================================================

class TestProvider extends AbstractDirectorCodeProvider {
	readonly apiType = 'openai-completions' as const;

	protected getApiType(): ApiType { return 'openai-completions'; }
	protected getDefaultBaseURL(): string { return 'https://test.api.com'; }
	protected getProviderName(): string { return 'Test'; }

	async createMessage(_params: CreateMessageParams): Promise<CreateMessageResponse> {
		return { content: [{ type: 'text', text: 'test' }], stopReason: 'end_turn', usage: { input_tokens: 0, output_tokens: 0 } };
	}

	async *createMessageStream(_params: CreateMessageParams): AsyncGenerator<StreamEvent> {
		yield { type: 'text', text: 'test' };
	}

	exposeFetchWithErrorHandling(url: string, init: RequestInit): Promise<Response> {
		return this.fetchWithErrorHandling(url, init);
	}

	async *exposeReadSSELines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
		yield* this.readSSELines(body);
	}

	exposeParseSSEData<T>(data: string): T | undefined {
		return this.parseSSEData<T>(data);
	}

	get exposedApiKey(): string { return this.apiKey; }
	get exposedBaseURL(): string { return this.baseURL; }
}

function createSSEStream(lines: string[]): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	return new ReadableStream({
		start(controller) {
			for (const line of lines) {
				controller.enqueue(encoder.encode(line + "\n"));
			}
			controller.close();
		},
	});
}

suite("AgentEngine - AbstractDirectorCodeProvider", () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	let originalFetch: typeof globalThis.fetch;

	setup(() => {
		originalFetch = globalThis.fetch;
	});

	teardown(() => {
		globalThis.fetch = originalFetch;
	});

	// ---------------------------------------------------------------
	// Constructor & Properties
	// ---------------------------------------------------------------
	suite("constructor", () => {
		test("uses default baseURL when none provided", () => {
			const p = new TestProvider({ apiKey: "key" });
			assert.strictEqual(p.exposedBaseURL, "https://test.api.com");
		});

		test("uses custom baseURL with trailing slash stripped", () => {
			const p = new TestProvider({ apiKey: "key", baseURL: "https://custom.com/" });
			assert.strictEqual(p.exposedBaseURL, "https://custom.com");
		});

		test("stores apiKey from options", () => {
			const p = new TestProvider({ apiKey: "sk-test-123" });
			assert.strictEqual(p.exposedApiKey, "sk-test-123");
		});

		test("uses default capabilities when none provided", () => {
			const p = new TestProvider({ apiKey: "key" });
			assert.strictEqual(p.capabilities.toolCalling, true);
			assert.strictEqual(p.capabilities.streaming, true);
		});

		test("uses custom capabilities when provided", () => {
			const custom: ProviderCapabilities = { vision: false, toolCalling: false, streaming: true };
			const p = new TestProvider({ apiKey: "key", capabilities: custom });
			assert.strictEqual(p.capabilities.vision, false);
			assert.strictEqual(p.capabilities.toolCalling, false);
			assert.strictEqual(p.capabilities.streaming, true);
		});
	});

	// ---------------------------------------------------------------
	// Inheritance verification
	// ---------------------------------------------------------------
	suite("inheritance", () => {
		test("AnthropicProvider extends AbstractDirectorCodeProvider", () => {
			const p = new AnthropicProvider({ apiKey: "key" });
			assert.ok(p instanceof AbstractDirectorCodeProvider);
			assert.strictEqual(p.apiType, "anthropic-messages");
		});

		test("OpenAIProvider extends AbstractDirectorCodeProvider", () => {
			const p = new OpenAIProvider({ apiKey: "key" });
			assert.ok(p instanceof AbstractDirectorCodeProvider);
			assert.strictEqual(p.apiType, "openai-completions");
		});

		test("GeminiProvider extends AbstractDirectorCodeProvider", () => {
			const p = new GeminiProvider({ apiKey: "key" });
			assert.ok(p instanceof AbstractDirectorCodeProvider);
			assert.strictEqual(p.apiType, "gemini-generative");
		});

		test("all providers expose capabilities", () => {
			const anthropic = new AnthropicProvider({ apiKey: "key" });
			const openai = new OpenAIProvider({ apiKey: "key" });
			const gemini = new GeminiProvider({ apiKey: "key" });

			assert.ok(anthropic.capabilities);
			assert.ok(openai.capabilities);
			assert.ok(gemini.capabilities);

			assert.strictEqual(anthropic.capabilities.thinking, true);
			assert.strictEqual(openai.capabilities.thinking, false);
			assert.strictEqual(gemini.capabilities.thinking, true);
		});

		test("capabilities can be overridden per instance", () => {
			const p = new AnthropicProvider({
				apiKey: "key",
				capabilities: { vision: false, toolCalling: true, streaming: true },
			});
			assert.strictEqual(p.capabilities.vision, false);
			assert.strictEqual(p.capabilities.toolCalling, true);
		});
	});

	// ---------------------------------------------------------------
	// getDefaultCapabilities
	// ---------------------------------------------------------------
	suite("getDefaultCapabilities", () => {
		test("returns correct defaults for anthropic-messages", () => {
			const caps = getDefaultCapabilities("anthropic-messages");
			assert.strictEqual(caps.vision, true);
			assert.strictEqual(caps.toolCalling, true);
			assert.strictEqual(caps.streaming, true);
			assert.strictEqual(caps.thinking, true);
			assert.strictEqual(caps.agentMode, true);
		});

		test("returns correct defaults for openai-completions", () => {
			const caps = getDefaultCapabilities("openai-completions");
			assert.strictEqual(caps.thinking, false);
			assert.strictEqual(caps.toolCalling, true);
		});

		test("returns correct defaults for gemini-generative", () => {
			const caps = getDefaultCapabilities("gemini-generative");
			assert.strictEqual(caps.thinking, true);
			assert.strictEqual(caps.toolCalling, true);
		});
	});

	// ---------------------------------------------------------------
	// fetchWithErrorHandling
	// ---------------------------------------------------------------
	suite("fetchWithErrorHandling", () => {
		test("returns response on success", async () => {
			globalThis.fetch = (() => Promise.resolve(new Response("ok", { status: 200 }))) as any;

			const p = new TestProvider({ apiKey: "key" });
			const resp = await p.exposeFetchWithErrorHandling("https://api.test.com/v1", {});
			assert.strictEqual(resp.status, 200);
		});

		test("throws error with .status on HTTP error", async () => {
			globalThis.fetch = (() => Promise.resolve(new Response("Rate limited", { status: 429, statusText: "Too Many Requests" }))) as any;

			const p = new TestProvider({ apiKey: "key" });
			try {
				await p.exposeFetchWithErrorHandling("https://api.test.com/v1", {});
				assert.fail("Should have thrown");
			} catch (err: any) {
				assert.strictEqual(err.status, 429);
				assert.ok(err.message.includes("Test API error"));
				assert.ok(err.message.includes("429"));
				assert.ok(err.message.includes("Rate limited"));
			}
		});

		test("includes provider name in error message", async () => {
			globalThis.fetch = (() => Promise.resolve(new Response("err", { status: 500, statusText: "Server Error" }))) as any;

			const p = new TestProvider({ apiKey: "key" });
			try {
				await p.exposeFetchWithErrorHandling("https://api.test.com/v1", {});
				assert.fail("Should have thrown");
			} catch (err: any) {
				assert.ok(err.message.startsWith("Test API error:"));
			}
		});

		test("handles empty error body gracefully", async () => {
			const response = new Response(null, { status: 503, statusText: "Service Unavailable" });
			globalThis.fetch = (() => Promise.resolve(response)) as any;

			const p = new TestProvider({ apiKey: "key" });
			try {
				await p.exposeFetchWithErrorHandling("https://api.test.com/v1", {});
				assert.fail("Should have thrown");
			} catch (err: any) {
				assert.strictEqual(err.status, 503);
			}
		});
	});

	// ---------------------------------------------------------------
	// readSSELines
	// ---------------------------------------------------------------
	suite("readSSELines", () => {
		test("yields data lines from SSE stream", async () => {
			const stream = createSSEStream([
				"data: hello",
				"data: world",
			]);

			const p = new TestProvider({ apiKey: "key" });
			const lines: string[] = [];
			for await (const line of p.exposeReadSSELines(stream)) {
				lines.push(line);
			}

			assert.deepStrictEqual(lines, ["hello", "world"]);
		});

		test("skips non-data lines", async () => {
			const stream = createSSEStream([
				": comment",
				"event: update",
				"data: payload",
				"id: 123",
			]);

			const p = new TestProvider({ apiKey: "key" });
			const lines: string[] = [];
			for await (const line of p.exposeReadSSELines(stream)) {
				lines.push(line);
			}

			assert.deepStrictEqual(lines, ["payload"]);
		});

		test("skips empty data lines", async () => {
			const stream = createSSEStream([
				"data: ",
				"data: valid",
			]);

			const p = new TestProvider({ apiKey: "key" });
			const lines: string[] = [];
			for await (const line of p.exposeReadSSELines(stream)) {
				lines.push(line);
			}

			assert.deepStrictEqual(lines, ["valid"]);
		});

		test("handles chunked data across reads", async () => {
			const encoder = new TextEncoder();
			const stream = new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(encoder.encode("data: hel"));
					controller.enqueue(encoder.encode("lo\ndata: world\n"));
					controller.close();
				},
			});

			const p = new TestProvider({ apiKey: "key" });
			const lines: string[] = [];
			for await (const line of p.exposeReadSSELines(stream)) {
				lines.push(line);
			}

			assert.deepStrictEqual(lines, ["hello", "world"]);
		});

		test("handles empty stream", async () => {
			const stream = new ReadableStream<Uint8Array>({
				start(controller) { controller.close(); },
			});

			const p = new TestProvider({ apiKey: "key" });
			const lines: string[] = [];
			for await (const line of p.exposeReadSSELines(stream)) {
				lines.push(line);
			}

			assert.strictEqual(lines.length, 0);
		});
	});

	// ---------------------------------------------------------------
	// parseSSEData
	// ---------------------------------------------------------------
	suite("parseSSEData", () => {
		test("parses valid JSON", () => {
			const p = new TestProvider({ apiKey: "key" });
			const result = p.exposeParseSSEData<{ type: string }>("{ \"type\": \"test\" }");
			assert.deepStrictEqual(result, { type: "test" });
		});

		test("returns undefined for invalid JSON", () => {
			const p = new TestProvider({ apiKey: "key" });
			const result = p.exposeParseSSEData("not-json");
			assert.strictEqual(result, undefined);
		});

		test("returns undefined for empty string", () => {
			const p = new TestProvider({ apiKey: "key" });
			const result = p.exposeParseSSEData("");
			assert.strictEqual(result, undefined);
		});

		test("parses nested objects", () => {
			const p = new TestProvider({ apiKey: "key" });
			const result = p.exposeParseSSEData<any>("{ \"a\": { \"b\": [1, 2] } }");
			assert.deepStrictEqual(result, { a: { b: [1, 2] } });
		});
	});
});
