/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { OpenAIProvider } from '../../../common/agentEngine/providers/openaiProvider.js';
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

function makeOpenAIResponse(overrides?: Partial<{
	content: string | null;
	tool_calls: any[];
	finish_reason: string;
	usage: any;
}>) {
	return {
		id: "chatcmpl-test",
		choices: [{
			index: 0,
			message: {
				role: "assistant",
				content: overrides?.content !== undefined ? overrides.content : "Hello!",
				tool_calls: overrides?.tool_calls,
			},
			finish_reason: overrides?.finish_reason ?? "stop",
		}],
		usage: overrides?.usage ?? {
			prompt_tokens: 10,
			completion_tokens: 20,
			total_tokens: 30,
		},
	};
}

function makeDefaultParams(overrides?: Partial<CreateMessageParams>): CreateMessageParams {
	return {
		model: "gpt-4o",
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

suite("AgentEngine - OpenAIProvider", () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	let originalFetch: typeof globalThis.fetch;

	setup(() => {
		originalFetch = globalThis.fetch;
	});

	teardown(() => {
		globalThis.fetch = originalFetch;
	});

	function mockFetch(responseFn: (url: string, init: RequestInit) => Response | Promise<Response>) {
		globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
			return Promise.resolve(responseFn(String(url), init || {}));
		}) as typeof fetch;
	}

	// ---------------------------------------------------------------
	// Constructor
	// ---------------------------------------------------------------
	suite("constructor", () => {
		test("sets apiType to openai-completions", () => {
			const provider = new OpenAIProvider({ apiKey: "test-key" });
			assert.strictEqual(provider.apiType, "openai-completions");
		});
	});

	// ---------------------------------------------------------------
	// createMessage - Non-streaming
	// ---------------------------------------------------------------
	suite("createMessage", () => {

		test("sends correct request to /chat/completions", async () => {
			let capturedUrl = "";
			let capturedBody: any = null;
			let capturedHeaders: any = null;

			mockFetch((url, init) => {
				capturedUrl = url;
				capturedBody = JSON.parse(init.body as string);
				capturedHeaders = init.headers;
				return new Response(JSON.stringify(makeOpenAIResponse()), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			});

			const provider = new OpenAIProvider({ apiKey: "sk-test" });
			await provider.createMessage(makeDefaultParams());

			assert.strictEqual(capturedUrl, "https://api.openai.com/v1/chat/completions");
			assert.strictEqual(capturedBody.model, "gpt-4o");
			assert.strictEqual(capturedBody.max_tokens, 1024);
			assert.strictEqual((capturedHeaders as any)["Authorization"], "Bearer sk-test");
		});

		test("uses custom baseURL (e.g. DeepSeek)", async () => {
			let capturedUrl = "";

			mockFetch((url) => {
				capturedUrl = url;
				return new Response(JSON.stringify(makeOpenAIResponse()), { status: 200 });
			});

			const provider = new OpenAIProvider({
				apiKey: "key",
				baseURL: "https://api.deepseek.com/v1/",
			});
			await provider.createMessage(makeDefaultParams());

			assert.ok(capturedUrl.startsWith("https://api.deepseek.com/v1/chat/completions"));
		});

		test("converts system prompt to system message", async () => {
			let capturedBody: any = null;

			mockFetch((_url, init) => {
				capturedBody = JSON.parse(init.body as string);
				return new Response(JSON.stringify(makeOpenAIResponse()), { status: 200 });
			});

			const provider = new OpenAIProvider({ apiKey: "key" });
			await provider.createMessage(makeDefaultParams({ system: "Be concise." }));

			assert.strictEqual(capturedBody.messages[0].role, "system");
			assert.strictEqual(capturedBody.messages[0].content, "Be concise.");
		});

		test("converts tool_result blocks to tool role messages", async () => {
			let capturedBody: any = null;

			mockFetch((_url, init) => {
				capturedBody = JSON.parse(init.body as string);
				return new Response(JSON.stringify(makeOpenAIResponse()), { status: 200 });
			});

			const provider = new OpenAIProvider({ apiKey: "key" });
			await provider.createMessage(makeDefaultParams({
				messages: [
					{
						role: "assistant",
						content: [
							{ type: "tool_use", id: "call_1", name: "search", input: { q: "test" } },
						],
					},
					{
						role: "user",
						content: [
							{ type: "tool_result", tool_use_id: "call_1", content: "Result here" },
						],
					},
				],
			}));

			// After system message: assistant with tool_calls, then tool message
			const toolMsg = capturedBody.messages.find((m: any) => m.role === "tool");
			assert.ok(toolMsg, "should have a tool role message");
			assert.strictEqual(toolMsg.tool_call_id, "call_1");
			assert.strictEqual(toolMsg.content, "Result here");
		});

		test("converts assistant tool_use blocks to tool_calls", async () => {
			let capturedBody: any = null;

			mockFetch((_url, init) => {
				capturedBody = JSON.parse(init.body as string);
				return new Response(JSON.stringify(makeOpenAIResponse()), { status: 200 });
			});

			const provider = new OpenAIProvider({ apiKey: "key" });
			await provider.createMessage(makeDefaultParams({
				messages: [
					{
						role: "assistant",
						content: [
							{ type: "text", text: "Let me search" },
							{ type: "tool_use", id: "call_1", name: "search", input: { q: "test" } },
						],
					},
				],
			}));

			// Find assistant message
			const assistantMsg = capturedBody.messages.find((m: any) => m.role === "assistant");
			assert.ok(assistantMsg);
			assert.strictEqual(assistantMsg.content, "Let me search");
			assert.strictEqual(assistantMsg.tool_calls.length, 1);
			assert.strictEqual(assistantMsg.tool_calls[0].id, "call_1");
			assert.strictEqual(assistantMsg.tool_calls[0].function.name, "search");
		});

		test("maps finish_reason correctly", async () => {
			// stop → end_turn
			mockFetch(() => new Response(JSON.stringify(makeOpenAIResponse({ finish_reason: "stop" })), { status: 200 }));
			const provider = new OpenAIProvider({ apiKey: "key" });

			let result = await provider.createMessage(makeDefaultParams());
			assert.strictEqual(result.stopReason, "end_turn");

			// length → max_tokens
			mockFetch(() => new Response(JSON.stringify(makeOpenAIResponse({ finish_reason: "length" })), { status: 200 }));
			result = await provider.createMessage(makeDefaultParams());
			assert.strictEqual(result.stopReason, "max_tokens");

			// tool_calls → tool_use
			mockFetch(() => new Response(JSON.stringify(makeOpenAIResponse({
				finish_reason: "tool_calls",
				tool_calls: [{ id: "c1", type: "function", function: { name: "f", arguments: "{}" } }],
			})), { status: 200 }));
			result = await provider.createMessage(makeDefaultParams());
			assert.strictEqual(result.stopReason, "tool_use");
		});

		test("maps usage tokens correctly", async () => {
			mockFetch(() => new Response(JSON.stringify(makeOpenAIResponse({
				usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
			})), { status: 200 }));

			const provider = new OpenAIProvider({ apiKey: "key" });
			const result = await provider.createMessage(makeDefaultParams());

			assert.strictEqual(result.usage.input_tokens, 100);
			assert.strictEqual(result.usage.output_tokens, 50);
		});

		test("parses tool call arguments as JSON", async () => {
			mockFetch(() => new Response(JSON.stringify(makeOpenAIResponse({
				content: null,
				finish_reason: "tool_calls",
				tool_calls: [{
					id: "call_1",
					type: "function",
					function: { name: "search", arguments: "{\"query\":\"hello\"}" },
				}],
			})), { status: 200 }));

			const provider = new OpenAIProvider({ apiKey: "key" });
			const result = await provider.createMessage(makeDefaultParams());

			const toolUse = result.content.find(c => c.type === "tool_use") as any;
			assert.ok(toolUse);
			assert.deepStrictEqual(toolUse.input, { query: "hello" });
		});

		test("handles empty choices array", async () => {
			mockFetch(() => new Response(JSON.stringify({ id: "test", choices: [], usage: { prompt_tokens: 0, completion_tokens: 0 } }), { status: 200 }));

			const provider = new OpenAIProvider({ apiKey: "key" });
			const result = await provider.createMessage(makeDefaultParams());

			assert.strictEqual(result.content.length, 1);
			assert.strictEqual(result.content[0].type, "text");
			assert.strictEqual((result.content[0] as any).text, "");
		});

		test("throws error with .status on HTTP error", async () => {
			mockFetch(() => new Response("Rate limited", { status: 429, statusText: "Too Many Requests" }));

			const provider = new OpenAIProvider({ apiKey: "key" });
			try {
				await provider.createMessage(makeDefaultParams());
				assert.fail("Should have thrown");
			} catch (err: any) {
				assert.strictEqual(err.status, 429);
				assert.ok(err.message.includes("429"));
			}
		});

		test("sends tools in OpenAI function format", async () => {
			let capturedBody: any = null;

			mockFetch((_url, init) => {
				capturedBody = JSON.parse(init.body as string);
				return new Response(JSON.stringify(makeOpenAIResponse()), { status: 200 });
			});

			const provider = new OpenAIProvider({ apiKey: "key" });
			await provider.createMessage(makeDefaultParams({
				tools: [{
					name: "search",
					description: "Search the web",
					input_schema: { type: "object", properties: { query: { type: "string" } } },
				}],
			}));

			assert.strictEqual(capturedBody.tools[0].type, "function");
			assert.strictEqual(capturedBody.tools[0].function.name, "search");
			assert.strictEqual(capturedBody.tools[0].function.description, "Search the web");
		});
	});

	// ---------------------------------------------------------------
	// createMessageStream - Streaming
	// ---------------------------------------------------------------
	suite("createMessageStream", () => {

		test("parses SSE text content deltas", async () => {
			const sseLines = [
				"data: " + JSON.stringify({ id: "c1", choices: [{ index: 0, delta: { content: "Hello" }, finish_reason: null }] }),
				"data: " + JSON.stringify({ id: "c1", choices: [{ index: 0, delta: { content: " world" }, finish_reason: null }] }),
				"data: " + JSON.stringify({ id: "c1", choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5 } }),
				"data: [DONE]",
			];

			mockFetch(() => new Response(createSSEStream(sseLines), { status: 200 }));

			const provider = new OpenAIProvider({ apiKey: "key" });
			const events = await collectStreamEvents(provider.createMessageStream!(makeDefaultParams()));

			const textEvents = events.filter(e => e.type === "text") as any[];
			assert.strictEqual(textEvents.length, 2);
			assert.strictEqual(textEvents[0].text, "Hello");
			assert.strictEqual(textEvents[1].text, " world");
		});

		test("parses SSE tool_call deltas", async () => {
			const sseLines = [
				"data: " + JSON.stringify({ id: "c1", choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "search", arguments: "" } }] }, finish_reason: null }] }),
				"data: " + JSON.stringify({ id: "c1", choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: "{\"q\":" } }] }, finish_reason: null }] }),
				"data: " + JSON.stringify({ id: "c1", choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: "\"test\"}" } }] }, finish_reason: null }] }),
				"data: " + JSON.stringify({ id: "c1", choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }], usage: { prompt_tokens: 10, completion_tokens: 20 } }),
				"data: [DONE]",
			];

			mockFetch(() => new Response(createSSEStream(sseLines), { status: 200 }));

			const provider = new OpenAIProvider({ apiKey: "key" });
			const events = await collectStreamEvents(provider.createMessageStream!(makeDefaultParams()));

			const toolDeltas = events.filter(e => e.type === "tool_call_delta") as any[];
			assert.strictEqual(toolDeltas.length, 3);
			assert.strictEqual(toolDeltas[0].id, "call_1");
			assert.strictEqual(toolDeltas[0].name, "search");
			assert.strictEqual(toolDeltas[1].arguments, "{\"q\":");
		});

		test("handles data: [DONE] termination", async () => {
			const sseLines = [
				"data: " + JSON.stringify({ id: "c1", choices: [{ index: 0, delta: { content: "Hi" }, finish_reason: null }] }),
				"data: " + JSON.stringify({ id: "c1", choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 5, completion_tokens: 1 } }),
				"data: [DONE]",
			];

			mockFetch(() => new Response(createSSEStream(sseLines), { status: 200 }));

			const provider = new OpenAIProvider({ apiKey: "key" });
			const events = await collectStreamEvents(provider.createMessageStream!(makeDefaultParams()));

			const complete = events.find(e => e.type === "message_complete") as any;
			assert.ok(complete);
			assert.strictEqual(complete.stopReason, "end_turn");
		});

		test("captures usage from stream", async () => {
			const sseLines = [
				"data: " + JSON.stringify({ id: "c1", choices: [{ index: 0, delta: { content: "OK" }, finish_reason: null }] }),
				"data: " + JSON.stringify({ id: "c1", choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 } }),
				"data: [DONE]",
			];

			mockFetch(() => new Response(createSSEStream(sseLines), { status: 200 }));

			const provider = new OpenAIProvider({ apiKey: "key" });
			const events = await collectStreamEvents(provider.createMessageStream!(makeDefaultParams()));

			const complete = events.find(e => e.type === "message_complete") as any;
			assert.strictEqual(complete.usage.input_tokens, 100);
			assert.strictEqual(complete.usage.output_tokens, 50);
		});

		test("yields message_complete even without [DONE]", async () => {
			const sseLines = [
				"data: " + JSON.stringify({ id: "c1", choices: [{ index: 0, delta: { content: "Hi" }, finish_reason: "stop" }] }),
				// No [DONE] — stream just closes
			];

			mockFetch(() => new Response(createSSEStream(sseLines), { status: 200 }));

			const provider = new OpenAIProvider({ apiKey: "key" });
			const events = await collectStreamEvents(provider.createMessageStream!(makeDefaultParams()));

			assert.ok(events.some(e => e.type === "message_complete"));
		});

		test("throws error with .status on HTTP error", async () => {
			mockFetch(() => new Response("Server Error", { status: 500, statusText: "Internal Server Error" }));

			const provider = new OpenAIProvider({ apiKey: "key" });
			try {
				const gen = provider.createMessageStream!(makeDefaultParams());
				await gen.next();
				assert.fail("Should have thrown");
			} catch (err: any) {
				assert.strictEqual(err.status, 500);
			}
		});

		test("sends stream: true and stream_options", async () => {
			let capturedBody: any = null;

			const sseLines = ["data: [DONE]"];
			mockFetch((_url, init) => {
				capturedBody = JSON.parse(init.body as string);
				return new Response(createSSEStream(sseLines), { status: 200 });
			});

			const provider = new OpenAIProvider({ apiKey: "key" });
			await collectStreamEvents(provider.createMessageStream!(makeDefaultParams()));

			assert.strictEqual(capturedBody.stream, true);
			assert.deepStrictEqual(capturedBody.stream_options, { include_usage: true });
		});
	});

	// ---------------------------------------------------------------
	// Message conversion edge cases
	// ---------------------------------------------------------------
	suite("message conversion edge cases", () => {

		test("handles string content messages", async () => {
			let capturedBody: any = null;

			mockFetch((_url, init) => {
				capturedBody = JSON.parse(init.body as string);
				return new Response(JSON.stringify(makeOpenAIResponse()), { status: 200 });
			});

			const provider = new OpenAIProvider({ apiKey: "key" });
			await provider.createMessage(makeDefaultParams({
				messages: [
					{ role: "user", content: "Hello" },
					{ role: "assistant", content: "Hi there" },
				],
			}));

			// system + user + assistant
			assert.strictEqual(capturedBody.messages[1].role, "user");
			assert.strictEqual(capturedBody.messages[1].content, "Hello");
			assert.strictEqual(capturedBody.messages[2].role, "assistant");
			assert.strictEqual(capturedBody.messages[2].content, "Hi there");
		});

		test("handles multiple tool_results in single user message", async () => {
			let capturedBody: any = null;

			mockFetch((_url, init) => {
				capturedBody = JSON.parse(init.body as string);
				return new Response(JSON.stringify(makeOpenAIResponse()), { status: 200 });
			});

			const provider = new OpenAIProvider({ apiKey: "key" });
			await provider.createMessage(makeDefaultParams({
				messages: [{
					role: "user",
					content: [
						{ type: "tool_result", tool_use_id: "c1", content: "Result 1" },
						{ type: "tool_result", tool_use_id: "c2", content: "Result 2" },
					],
				}],
			}));

			const toolMsgs = capturedBody.messages.filter((m: any) => m.role === "tool");
			assert.strictEqual(toolMsgs.length, 2);
			assert.strictEqual(toolMsgs[0].tool_call_id, "c1");
			assert.strictEqual(toolMsgs[1].tool_call_id, "c2");
		});
	});
});
