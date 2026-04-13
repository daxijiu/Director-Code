/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AnthropicProvider } from '../../../common/agentEngine/providers/anthropicProvider.js';
import type { CreateMessageParams, StreamEvent } from '../../../common/agentEngine/providers/providerTypes.js';

// ============================================================================
// Test Helpers
// ============================================================================

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

function makeAnthropicResponse(overrides?: Partial<{
	content: any[];
	stop_reason: string;
	usage: any;
}>) {
	return {
		id: "msg_test",
		type: "message",
		role: "assistant",
		content: overrides?.content ?? [{ type: "text", text: "Hello!" }],
		stop_reason: overrides?.stop_reason ?? "end_turn",
		usage: overrides?.usage ?? {
			input_tokens: 10,
			output_tokens: 20,
		},
	};
}

function makeDefaultParams(overrides?: Partial<CreateMessageParams>): CreateMessageParams {
	return {
		model: "claude-sonnet-4-6",
		maxTokens: 1024,
		system: "You are helpful.",
		messages: [{ role: "user", content: "Hi" }],
		...overrides,
	};
}

async function collectStreamEvents(gen: AsyncGenerator<StreamEvent>): Promise<StreamEvent[]> {
	const events: StreamEvent[] = [];
	for await (const event of gen) {
		events.push(event);
	}
	return events;
}

suite("AgentEngine - AnthropicProvider", () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	let originalFetch: typeof globalThis.fetch;
	let mockFetchFn: (url: string | URL | Request, init?: RequestInit) => Promise<Response>;

	setup(() => {
		originalFetch = globalThis.fetch;
	});

	teardown(() => {
		globalThis.fetch = originalFetch;
	});

	function mockFetch(responseFn: (url: string, init: RequestInit) => Response | Promise<Response>) {
		mockFetchFn = (url: string | URL | Request, init?: RequestInit) => {
			return Promise.resolve(responseFn(String(url), init || {}));
		};
		globalThis.fetch = mockFetchFn as typeof fetch;
	}

	// ---------------------------------------------------------------
	// Constructor
	// ---------------------------------------------------------------
	suite("constructor", () => {
		test("sets apiType to anthropic-messages", () => {
			const provider = new AnthropicProvider({ apiKey: "test-key" });
			assert.strictEqual(provider.apiType, "anthropic-messages");
		});
	});

	// ---------------------------------------------------------------
	// createMessage - Non-streaming
	// ---------------------------------------------------------------
	suite("createMessage", () => {

		test("sends correct request to /v1/messages", async () => {
			let capturedUrl = "";
			let capturedBody: any = null;
			let capturedHeaders: any = null;

			mockFetch((url, init) => {
				capturedUrl = url;
				capturedBody = JSON.parse(init.body as string);
				capturedHeaders = init.headers;
				return new Response(JSON.stringify(makeAnthropicResponse()), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			});

			const provider = new AnthropicProvider({ apiKey: "sk-ant-test" });
			await provider.createMessage(makeDefaultParams());

			assert.strictEqual(capturedUrl, "https://api.anthropic.com/v1/messages");
			assert.strictEqual(capturedBody.model, "claude-sonnet-4-6");
			assert.strictEqual(capturedBody.max_tokens, 1024);
			assert.strictEqual(capturedBody.system, "You are helpful.");
			assert.strictEqual(capturedHeaders["x-api-key"], "sk-ant-test");
			assert.strictEqual(capturedHeaders["anthropic-version"], "2023-06-01");
		});

		test("uses custom baseURL", async () => {
			let capturedUrl = "";

			mockFetch((url) => {
				capturedUrl = url;
				return new Response(JSON.stringify(makeAnthropicResponse()), { status: 200 });
			});

			const provider = new AnthropicProvider({
				apiKey: "key",
				baseURL: "https://custom.proxy.com/",
			});
			await provider.createMessage(makeDefaultParams());

			assert.ok(capturedUrl.startsWith("https://custom.proxy.com/v1/messages"));
		});

		test("returns text content correctly", async () => {
			mockFetch(() => new Response(JSON.stringify(makeAnthropicResponse({
				content: [{ type: "text", text: "Hello world" }],
			})), { status: 200 }));

			const provider = new AnthropicProvider({ apiKey: "key" });
			const result = await provider.createMessage(makeDefaultParams());

			assert.strictEqual(result.content.length, 1);
			assert.strictEqual(result.content[0].type, "text");
			assert.strictEqual((result.content[0] as any).text, "Hello world");
		});

		test("returns tool_use content correctly", async () => {
			mockFetch(() => new Response(JSON.stringify(makeAnthropicResponse({
				content: [
					{ type: "text", text: "Let me search." },
					{ type: "tool_use", id: "tool_1", name: "search", input: { query: "test" } },
				],
				stop_reason: "tool_use",
			})), { status: 200 }));

			const provider = new AnthropicProvider({ apiKey: "key" });
			const result = await provider.createMessage(makeDefaultParams());

			assert.strictEqual(result.content.length, 2);
			assert.strictEqual(result.content[0].type, "text");
			assert.strictEqual(result.content[1].type, "tool_use");
			const toolUse = result.content[1] as any;
			assert.strictEqual(toolUse.id, "tool_1");
			assert.strictEqual(toolUse.name, "search");
			assert.deepStrictEqual(toolUse.input, { query: "test" });
			assert.strictEqual(result.stopReason, "tool_use");
		});

		test("maps usage including cache tokens", async () => {
			mockFetch(() => new Response(JSON.stringify(makeAnthropicResponse({
				usage: {
					input_tokens: 100,
					output_tokens: 50,
					cache_creation_input_tokens: 80,
					cache_read_input_tokens: 20,
				},
			})), { status: 200 }));

			const provider = new AnthropicProvider({ apiKey: "key" });
			const result = await provider.createMessage(makeDefaultParams());

			assert.strictEqual(result.usage.input_tokens, 100);
			assert.strictEqual(result.usage.output_tokens, 50);
			assert.strictEqual(result.usage.cache_creation_input_tokens, 80);
			assert.strictEqual(result.usage.cache_read_input_tokens, 20);
		});

		test("filters out thinking blocks from response content", async () => {
			mockFetch(() => new Response(JSON.stringify(makeAnthropicResponse({
				content: [
					{ type: "thinking", thinking: "Let me think..." },
					{ type: "text", text: "Here is my answer" },
				],
			})), { status: 200 }));

			const provider = new AnthropicProvider({ apiKey: "key" });
			const result = await provider.createMessage(makeDefaultParams());

			assert.strictEqual(result.content.length, 1);
			assert.strictEqual(result.content[0].type, "text");
		});

		test("returns empty text when content is empty", async () => {
			mockFetch(() => new Response(JSON.stringify(makeAnthropicResponse({
				content: [],
			})), { status: 200 }));

			const provider = new AnthropicProvider({ apiKey: "key" });
			const result = await provider.createMessage(makeDefaultParams());

			assert.strictEqual(result.content.length, 1);
			assert.strictEqual(result.content[0].type, "text");
			assert.strictEqual((result.content[0] as any).text, "");
		});

		test("sends thinking parameter when configured", async () => {
			let capturedBody: any = null;

			mockFetch((_url, init) => {
				capturedBody = JSON.parse(init.body as string);
				return new Response(JSON.stringify(makeAnthropicResponse()), { status: 200 });
			});

			const provider = new AnthropicProvider({ apiKey: "key" });
			await provider.createMessage(makeDefaultParams({
				thinking: { type: "enabled", budget_tokens: 5000 },
			}));

			assert.deepStrictEqual(capturedBody.thinking, {
				type: "enabled",
				budget_tokens: 5000,
			});
		});

		test("sends tools when provided", async () => {
			let capturedBody: any = null;

			mockFetch((_url, init) => {
				capturedBody = JSON.parse(init.body as string);
				return new Response(JSON.stringify(makeAnthropicResponse()), { status: 200 });
			});

			const provider = new AnthropicProvider({ apiKey: "key" });
			await provider.createMessage(makeDefaultParams({
				tools: [{
					name: "search",
					description: "Search the web",
					input_schema: { type: "object", properties: { query: { type: "string" } } },
				}],
			}));

			assert.strictEqual(capturedBody.tools.length, 1);
			assert.strictEqual(capturedBody.tools[0].name, "search");
		});

		test("throws error with .status on HTTP error", async () => {
			mockFetch(() => new Response("Rate limited", { status: 429, statusText: "Too Many Requests" }));

			const provider = new AnthropicProvider({ apiKey: "key" });
			try {
				await provider.createMessage(makeDefaultParams());
				assert.fail("Should have thrown");
			} catch (err: any) {
				assert.strictEqual(err.status, 429);
				assert.ok(err.message.includes("429"));
			}
		});

		test("defaults stop_reason to end_turn when null", async () => {
			mockFetch(() => new Response(JSON.stringify(makeAnthropicResponse({
				stop_reason: null as any,
			})), { status: 200 }));

			const provider = new AnthropicProvider({ apiKey: "key" });
			const result = await provider.createMessage(makeDefaultParams());

			assert.strictEqual(result.stopReason, "end_turn");
		});
	});

	// ---------------------------------------------------------------
	// createMessageStream - Streaming
	// ---------------------------------------------------------------
	suite("createMessageStream", () => {

		test("yields text events from content_block_delta", async () => {
			const sseLines = [
				"data: " + JSON.stringify({ type: "message_start", message: makeAnthropicResponse({ content: [] }) }),
				"data: " + JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
				"data: " + JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "Hello" } }),
				"data: " + JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: " world" } }),
				"data: " + JSON.stringify({ type: "content_block_stop", index: 0 }),
				"data: " + JSON.stringify({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 5 } }),
				"data: " + JSON.stringify({ type: "message_stop" }),
			];

			mockFetch(() => new Response(createSSEStream(sseLines), { status: 200 }));

			const provider = new AnthropicProvider({ apiKey: "key" });
			const events = await collectStreamEvents(provider.createMessageStream!(makeDefaultParams()));

			const textEvents = events.filter(e => e.type === "text");
			assert.strictEqual(textEvents.length, 2);
			assert.strictEqual((textEvents[0] as any).text, "Hello");
			assert.strictEqual((textEvents[1] as any).text, " world");
		});

		test("yields tool_use_start and tool_input_delta for tool calls", async () => {
			const sseLines = [
				"data: " + JSON.stringify({ type: "message_start", message: makeAnthropicResponse({ content: [] }) }),
				"data: " + JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tool_1", name: "search" } }),
				"data: " + JSON.stringify({ type: "content_block_delta", delta: { type: "input_json_delta", partial_json: "{\"query\":" } }),
				"data: " + JSON.stringify({ type: "content_block_delta", delta: { type: "input_json_delta", partial_json: "\"test\"}" } }),
				"data: " + JSON.stringify({ type: "content_block_stop", index: 0 }),
				"data: " + JSON.stringify({ type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 10 } }),
				"data: " + JSON.stringify({ type: "message_stop" }),
			];

			mockFetch(() => new Response(createSSEStream(sseLines), { status: 200 }));

			const provider = new AnthropicProvider({ apiKey: "key" });
			const events = await collectStreamEvents(provider.createMessageStream!(makeDefaultParams()));

			const toolStart = events.find(e => e.type === "tool_use_start") as any;
			assert.ok(toolStart);
			assert.strictEqual(toolStart.id, "tool_1");
			assert.strictEqual(toolStart.name, "search");

			const toolDeltas = events.filter(e => e.type === "tool_input_delta") as any[];
			assert.strictEqual(toolDeltas.length, 2);
			assert.strictEqual(toolDeltas[0].json, "{\"query\":");
		});

		test("yields thinking events", async () => {
			const sseLines = [
				"data: " + JSON.stringify({ type: "message_start", message: makeAnthropicResponse({ content: [] }) }),
				"data: " + JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } }),
				"data: " + JSON.stringify({ type: "content_block_delta", delta: { type: "thinking_delta", thinking: "Let me reason..." } }),
				"data: " + JSON.stringify({ type: "content_block_stop", index: 0 }),
				"data: " + JSON.stringify({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 15 } }),
				"data: " + JSON.stringify({ type: "message_stop" }),
			];

			mockFetch(() => new Response(createSSEStream(sseLines), { status: 200 }));

			const provider = new AnthropicProvider({ apiKey: "key" });
			const events = await collectStreamEvents(provider.createMessageStream!(makeDefaultParams()));

			const thinkingEvents = events.filter(e => e.type === "thinking") as any[];
			assert.strictEqual(thinkingEvents.length, 1);
			assert.strictEqual(thinkingEvents[0].thinking, "Let me reason...");
		});

		test("yields message_complete with usage at end", async () => {
			const sseLines = [
				"data: " + JSON.stringify({
					type: "message_start",
					message: {
						...makeAnthropicResponse({ content: [] }),
						usage: { input_tokens: 50, output_tokens: 0, cache_creation_input_tokens: 30, cache_read_input_tokens: 10 },
					},
				}),
				"data: " + JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "Hi" } }),
				"data: " + JSON.stringify({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 25 } }),
				"data: " + JSON.stringify({ type: "message_stop" }),
			];

			mockFetch(() => new Response(createSSEStream(sseLines), { status: 200 }));

			const provider = new AnthropicProvider({ apiKey: "key" });
			const events = await collectStreamEvents(provider.createMessageStream!(makeDefaultParams()));

			const complete = events.find(e => e.type === "message_complete") as any;
			assert.ok(complete);
			assert.strictEqual(complete.stopReason, "end_turn");
			assert.strictEqual(complete.usage.input_tokens, 50);
			assert.strictEqual(complete.usage.output_tokens, 25);
			assert.strictEqual(complete.usage.cache_creation_input_tokens, 30);
			assert.strictEqual(complete.usage.cache_read_input_tokens, 10);
		});

		test("throws error with .status on HTTP error", async () => {
			mockFetch(() => new Response("Server Error", { status: 500, statusText: "Internal Server Error" }));

			const provider = new AnthropicProvider({ apiKey: "key" });
			try {
				const gen = provider.createMessageStream!(makeDefaultParams());
				await gen.next();
				assert.fail("Should have thrown");
			} catch (err: any) {
				assert.strictEqual(err.status, 500);
				assert.ok(err.message.includes("500"));
			}
		});

		test("sets stream: true in request body", async () => {
			let capturedBody: any = null;

			const sseLines = [
				"data: " + JSON.stringify({ type: "message_start", message: makeAnthropicResponse({ content: [] }) }),
				"data: " + JSON.stringify({ type: "message_stop" }),
			];

			mockFetch((_url, init) => {
				capturedBody = JSON.parse(init.body as string);
				return new Response(createSSEStream(sseLines), { status: 200 });
			});

			const provider = new AnthropicProvider({ apiKey: "key" });
			await collectStreamEvents(provider.createMessageStream!(makeDefaultParams()));

			assert.strictEqual(capturedBody.stream, true);
		});

		test("handles malformed SSE data gracefully", async () => {
			const sseLines = [
				"data: " + JSON.stringify({ type: "message_start", message: makeAnthropicResponse({ content: [] }) }),
				"data: not-valid-json",
				"data: " + JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "OK" } }),
				"data: " + JSON.stringify({ type: "message_stop" }),
			];

			mockFetch(() => new Response(createSSEStream(sseLines), { status: 200 }));

			const provider = new AnthropicProvider({ apiKey: "key" });
			const events = await collectStreamEvents(provider.createMessageStream!(makeDefaultParams()));

			// Should still get the valid text event and message_complete
			const textEvents = events.filter(e => e.type === "text");
			assert.strictEqual(textEvents.length, 1);
			assert.ok(events.some(e => e.type === "message_complete"));
		});
	});
});
