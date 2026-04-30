/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { GeminiProvider } from '../../../common/agentEngine/providers/geminiProvider.js';
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

function makeGeminiResponse(overrides?: Partial<{
	parts: any[];
	finishReason: string;
	usageMetadata: any;
}>) {
	return {
		candidates: [{
			content: {
				role: "model",
				parts: overrides?.parts ?? [{ text: "Hello!" }],
			},
			finishReason: overrides?.finishReason ?? "STOP",
		}],
		usageMetadata: overrides?.usageMetadata ?? {
			promptTokenCount: 10,
			candidatesTokenCount: 20,
			totalTokenCount: 30,
		},
	};
}

function makeDefaultParams(overrides?: Partial<CreateMessageParams>): CreateMessageParams {
	return {
		model: "gemini-2.5-pro",
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

suite("AgentEngine - GeminiProvider", () => {

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
		test("sets apiType to gemini-generative", () => {
			const provider = new GeminiProvider({ auth: { kind: 'api-key', value: "test-key" } });
			assert.strictEqual(provider.apiType, "gemini-generative");
		});
	});

	// ---------------------------------------------------------------
	// createMessage - Non-streaming
	// ---------------------------------------------------------------
	suite("createMessage", () => {

		test("sends correct request to generateContent endpoint", async () => {
			let capturedUrl = "";
			let capturedBody: any = null;

			mockFetch((url, init) => {
				capturedUrl = url;
				capturedBody = JSON.parse(init.body as string);
				return new Response(JSON.stringify(makeGeminiResponse()), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			});

			const provider = new GeminiProvider({ auth: { kind: 'api-key', value: "gemini-key" } });
			await provider.createMessage(makeDefaultParams());

			assert.ok(capturedUrl.includes("/v1beta/models/gemini-2.5-pro:generateContent"));
			assert.ok(capturedUrl.includes("key=gemini-key"));
			assert.ok(capturedBody.contents);
			assert.strictEqual(capturedBody.generationConfig.maxOutputTokens, 1024);
		});

		test("uses custom baseURL", async () => {
			let capturedUrl = "";

			mockFetch((url) => {
				capturedUrl = url;
				return new Response(JSON.stringify(makeGeminiResponse()), { status: 200 });
			});

			const provider = new GeminiProvider({
				auth: { kind: 'api-key', value: "key" },
				baseURL: "https://custom.endpoint.com/",
			});
			await provider.createMessage(makeDefaultParams());

			assert.ok(capturedUrl.startsWith("https://custom.endpoint.com/v1beta/models/"));
		});

		test("sets systemInstruction from system param", async () => {
			let capturedBody: any = null;

			mockFetch((_url, init) => {
				capturedBody = JSON.parse(init.body as string);
				return new Response(JSON.stringify(makeGeminiResponse()), { status: 200 });
			});

			const provider = new GeminiProvider({ auth: { kind: 'api-key', value: "key" } });
			await provider.createMessage(makeDefaultParams({ system: "Be precise." }));

			assert.ok(capturedBody.systemInstruction);
			assert.strictEqual(capturedBody.systemInstruction.parts[0].text, "Be precise.");
		});

		test("converts user→user, assistant→model roles", async () => {
			let capturedBody: any = null;

			mockFetch((_url, init) => {
				capturedBody = JSON.parse(init.body as string);
				return new Response(JSON.stringify(makeGeminiResponse()), { status: 200 });
			});

			const provider = new GeminiProvider({ auth: { kind: 'api-key', value: "key" } });
			await provider.createMessage(makeDefaultParams({
				messages: [
					{ role: "user", content: "Hello" },
					{ role: "assistant", content: "Hi there" },
					{ role: "user", content: "Question" },
				],
			}));

			assert.strictEqual(capturedBody.contents[0].role, "user");
			assert.strictEqual(capturedBody.contents[1].role, "model");
			assert.strictEqual(capturedBody.contents[2].role, "user");
		});

		test("converts tool_use to functionCall", async () => {
			let capturedBody: any = null;

			mockFetch((_url, init) => {
				capturedBody = JSON.parse(init.body as string);
				return new Response(JSON.stringify(makeGeminiResponse()), { status: 200 });
			});

			const provider = new GeminiProvider({ auth: { kind: 'api-key', value: "key" } });
			await provider.createMessage(makeDefaultParams({
				messages: [{
					role: "assistant",
					content: [
						{ type: "tool_use", id: "call_1", name: "search", input: { query: "test" } },
					],
				}],
			}));

			const modelContent = capturedBody.contents[0];
			assert.strictEqual(modelContent.role, "model");
			const fcPart = modelContent.parts.find((p: any) => p.functionCall);
			assert.ok(fcPart);
			assert.strictEqual(fcPart.functionCall.name, "search");
			assert.deepStrictEqual(fcPart.functionCall.args, { query: "test" });
		});

		test("converts tool_result to functionResponse with looked-up name", async () => {
			let capturedBody: any = null;

			mockFetch((_url, init) => {
				capturedBody = JSON.parse(init.body as string);
				return new Response(JSON.stringify(makeGeminiResponse()), { status: 200 });
			});

			const provider = new GeminiProvider({ auth: { kind: 'api-key', value: "key" } });
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
							{ type: "tool_result", tool_use_id: "call_1", content: "Found results" },
						],
					},
				],
			}));

			// Second content should have functionResponse
			const userContent = capturedBody.contents[1];
			const frPart = userContent.parts.find((p: any) => p.functionResponse);
			assert.ok(frPart, "should have functionResponse part");
			assert.strictEqual(frPart.functionResponse.name, "search");
			assert.strictEqual(frPart.functionResponse.response.result, "Found results");
		});

		test("returns text content correctly", async () => {
			mockFetch(() => new Response(JSON.stringify(makeGeminiResponse({
				parts: [{ text: "Hello world" }],
			})), { status: 200 }));

			const provider = new GeminiProvider({ auth: { kind: 'api-key', value: "key" } });
			const result = await provider.createMessage(makeDefaultParams());

			assert.strictEqual(result.content.length, 1);
			assert.strictEqual(result.content[0].type, "text");
			assert.strictEqual((result.content[0] as any).text, "Hello world");
		});

		test("returns functionCall as tool_use with generated id", async () => {
			mockFetch(() => new Response(JSON.stringify(makeGeminiResponse({
				parts: [{ functionCall: { name: "search", args: { q: "test" } } }],
				finishReason: "FUNCTION_CALL",
			})), { status: 200 }));

			const provider = new GeminiProvider({ auth: { kind: 'api-key', value: "key" } });
			const result = await provider.createMessage(makeDefaultParams());

			const toolUse = result.content.find(c => c.type === "tool_use") as any;
			assert.ok(toolUse);
			assert.strictEqual(toolUse.name, "search");
			assert.deepStrictEqual(toolUse.input, { q: "test" });
			assert.ok(toolUse.id.startsWith("gemini_call_"));
			assert.strictEqual(result.stopReason, "tool_use");
		});

		test("maps finishReason correctly", async () => {
			// STOP → end_turn
			mockFetch(() => new Response(JSON.stringify(makeGeminiResponse({ finishReason: "STOP" })), { status: 200 }));
			const provider = new GeminiProvider({ auth: { kind: 'api-key', value: "key" } });

			let result = await provider.createMessage(makeDefaultParams());
			assert.strictEqual(result.stopReason, "end_turn");

			// MAX_TOKENS → max_tokens
			mockFetch(() => new Response(JSON.stringify(makeGeminiResponse({ finishReason: "MAX_TOKENS" })), { status: 200 }));
			result = await provider.createMessage(makeDefaultParams());
			assert.strictEqual(result.stopReason, "max_tokens");

			// SAFETY → content_filter
			mockFetch(() => new Response(JSON.stringify(makeGeminiResponse({ finishReason: "SAFETY" })), { status: 200 }));
			result = await provider.createMessage(makeDefaultParams());
			assert.strictEqual(result.stopReason, "content_filter");
		});

		test("maps usageMetadata to TokenUsage", async () => {
			mockFetch(() => new Response(JSON.stringify(makeGeminiResponse({
				usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50, totalTokenCount: 150 },
			})), { status: 200 }));

			const provider = new GeminiProvider({ auth: { kind: 'api-key', value: "key" } });
			const result = await provider.createMessage(makeDefaultParams());

			assert.strictEqual(result.usage.input_tokens, 100);
			assert.strictEqual(result.usage.output_tokens, 50);
		});

		test("handles empty candidates", async () => {
			mockFetch(() => new Response(JSON.stringify({ candidates: [] }), { status: 200 }));

			const provider = new GeminiProvider({ auth: { kind: 'api-key', value: "key" } });
			const result = await provider.createMessage(makeDefaultParams());

			assert.strictEqual(result.content.length, 1);
			assert.strictEqual(result.content[0].type, "text");
			assert.strictEqual((result.content[0] as any).text, "");
		});

		test("throws error with .status on HTTP error", async () => {
			mockFetch(() => new Response("Forbidden", { status: 403, statusText: "Forbidden" }));

			const provider = new GeminiProvider({ auth: { kind: 'api-key', value: "key" } });
			try {
				await provider.createMessage(makeDefaultParams());
				assert.fail("Should have thrown");
			} catch (err: any) {
				assert.strictEqual(err.status, 403);
				assert.ok(err.message.includes("403"));
			}
		});

		test("throws error on API-level error in response body", async () => {
			mockFetch(() => new Response(JSON.stringify({
				error: { code: 400, status: "INVALID_ARGUMENT", message: "Bad model name" },
			}), { status: 200 }));

			const provider = new GeminiProvider({ auth: { kind: 'api-key', value: "key" } });
			try {
				await provider.createMessage(makeDefaultParams());
				assert.fail("Should have thrown");
			} catch (err: any) {
				assert.strictEqual(err.status, 400);
				assert.ok(err.message.includes("Bad model name"));
			}
		});

		test("sends tools as functionDeclarations", async () => {
			let capturedBody: any = null;

			mockFetch((_url, init) => {
				capturedBody = JSON.parse(init.body as string);
				return new Response(JSON.stringify(makeGeminiResponse()), { status: 200 });
			});

			const provider = new GeminiProvider({ auth: { kind: 'api-key', value: "key" } });
			await provider.createMessage(makeDefaultParams({
				tools: [{
					name: "search",
					description: "Search the web",
					input_schema: { type: "object", properties: { query: { type: "string" } } },
				}],
			}));

			assert.ok(capturedBody.tools[0].functionDeclarations);
			assert.strictEqual(capturedBody.tools[0].functionDeclarations[0].name, "search");
		});

		test("sends thinking config for Gemini 2.5", async () => {
			let capturedBody: any = null;

			mockFetch((_url, init) => {
				capturedBody = JSON.parse(init.body as string);
				return new Response(JSON.stringify(makeGeminiResponse()), { status: 200 });
			});

			const provider = new GeminiProvider({ auth: { kind: 'api-key', value: "key" } });
			await provider.createMessage(makeDefaultParams({
				thinking: { type: "enabled", budget_tokens: 5000 },
			}));

			assert.deepStrictEqual(capturedBody.generationConfig.thinkingConfig, {
				thinkingBudget: 5000,
			});
		});
	});

	// ---------------------------------------------------------------
	// createMessageStream - Streaming
	// ---------------------------------------------------------------
	suite("createMessageStream", () => {

		test("uses streamGenerateContent endpoint with alt=sse", async () => {
			let capturedUrl = "";

			const sseLines = [
				"data: " + JSON.stringify(makeGeminiResponse()),
			];

			mockFetch((url) => {
				capturedUrl = url;
				return new Response(createSSEStream(sseLines), { status: 200 });
			});

			const provider = new GeminiProvider({ auth: { kind: 'api-key', value: "key" } });
			await collectStreamEvents(provider.createMessageStream!(makeDefaultParams()));

			assert.ok(capturedUrl.includes(":streamGenerateContent"));
			assert.ok(capturedUrl.includes("alt=sse"));
		});

		test("yields text events", async () => {
			const sseLines = [
				"data: " + JSON.stringify(makeGeminiResponse({ parts: [{ text: "Hello" }] })),
				"data: " + JSON.stringify(makeGeminiResponse({ parts: [{ text: " world" }] })),
			];

			mockFetch(() => new Response(createSSEStream(sseLines), { status: 200 }));

			const provider = new GeminiProvider({ auth: { kind: 'api-key', value: "key" } });
			const events = await collectStreamEvents(provider.createMessageStream!(makeDefaultParams()));

			const textEvents = events.filter(e => e.type === "text") as any[];
			assert.strictEqual(textEvents.length, 2);
			assert.strictEqual(textEvents[0].text, "Hello");
			assert.strictEqual(textEvents[1].text, " world");
		});

		test("yields thinking events for thought parts", async () => {
			const sseLines = [
				"data: " + JSON.stringify(makeGeminiResponse({
					parts: [{ text: "Let me reason...", thought: true }],
				})),
				"data: " + JSON.stringify(makeGeminiResponse({
					parts: [{ text: "Answer here" }],
				})),
			];

			mockFetch(() => new Response(createSSEStream(sseLines), { status: 200 }));

			const provider = new GeminiProvider({ auth: { kind: 'api-key', value: "key" } });
			const events = await collectStreamEvents(provider.createMessageStream!(makeDefaultParams()));

			const thinkingEvents = events.filter(e => e.type === "thinking") as any[];
			assert.strictEqual(thinkingEvents.length, 1);
			assert.strictEqual(thinkingEvents[0].thinking, "Let me reason...");

			const textEvents = events.filter(e => e.type === "text") as any[];
			assert.strictEqual(textEvents.length, 1);
			assert.strictEqual(textEvents[0].text, "Answer here");
		});

		test("yields tool_use_start + tool_input_delta for functionCall", async () => {
			const sseLines = [
				"data: " + JSON.stringify(makeGeminiResponse({
					parts: [{ functionCall: { name: "search", args: { q: "test" } } }],
					finishReason: "FUNCTION_CALL",
				})),
			];

			mockFetch(() => new Response(createSSEStream(sseLines), { status: 200 }));

			const provider = new GeminiProvider({ auth: { kind: 'api-key', value: "key" } });
			const events = await collectStreamEvents(provider.createMessageStream!(makeDefaultParams()));

			const toolStart = events.find(e => e.type === "tool_use_start") as any;
			assert.ok(toolStart);
			assert.strictEqual(toolStart.name, "search");
			assert.ok(toolStart.id.startsWith("gemini_call_"));

			const toolDelta = events.find(e => e.type === "tool_input_delta") as any;
			assert.ok(toolDelta);
			assert.strictEqual(toolDelta.json, "{\"q\":\"test\"}");
		});

		test("yields message_complete with usage from final chunk", async () => {
			const sseLines = [
				"data: " + JSON.stringify({
					candidates: [{ content: { role: "model", parts: [{ text: "Hi" }] }, finishReason: "STOP" }],
					usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 25 },
				}),
			];

			mockFetch(() => new Response(createSSEStream(sseLines), { status: 200 }));

			const provider = new GeminiProvider({ auth: { kind: 'api-key', value: "key" } });
			const events = await collectStreamEvents(provider.createMessageStream!(makeDefaultParams()));

			const complete = events.find(e => e.type === "message_complete") as any;
			assert.ok(complete);
			assert.strictEqual(complete.stopReason, "end_turn");
			assert.strictEqual(complete.usage.input_tokens, 50);
			assert.strictEqual(complete.usage.output_tokens, 25);
		});

		test("throws error with .status on HTTP error", async () => {
			mockFetch(() => new Response("Server Error", { status: 500, statusText: "Internal Server Error" }));

			const provider = new GeminiProvider({ auth: { kind: 'api-key', value: "key" } });
			try {
				const gen = provider.createMessageStream!(makeDefaultParams());
				await gen.next();
				assert.fail("Should have thrown");
			} catch (err: any) {
				assert.strictEqual(err.status, 500);
			}
		});

		test("handles malformed SSE data gracefully", async () => {
			const sseLines = [
				"data: not-valid-json",
				"data: " + JSON.stringify(makeGeminiResponse({ parts: [{ text: "OK" }] })),
			];

			mockFetch(() => new Response(createSSEStream(sseLines), { status: 200 }));

			const provider = new GeminiProvider({ auth: { kind: 'api-key', value: "key" } });
			const events = await collectStreamEvents(provider.createMessageStream!(makeDefaultParams()));

			const textEvents = events.filter(e => e.type === "text");
			assert.strictEqual(textEvents.length, 1);
			assert.ok(events.some(e => e.type === "message_complete"));
		});
	});

	// ---------------------------------------------------------------
	// Message conversion edge cases
	// ---------------------------------------------------------------
	suite("message conversion edge cases", () => {

		test("converts thinking blocks to thought parts", async () => {
			let capturedBody: any = null;

			mockFetch((_url, init) => {
				capturedBody = JSON.parse(init.body as string);
				return new Response(JSON.stringify(makeGeminiResponse()), { status: 200 });
			});

			const provider = new GeminiProvider({ auth: { kind: 'api-key', value: "key" } });
			await provider.createMessage(makeDefaultParams({
				messages: [{
					role: "assistant",
					content: [
						{ type: "thinking", thinking: "Let me think..." },
						{ type: "text", text: "Answer" },
					],
				}],
			}));

			const modelContent = capturedBody.contents[0];
			const thoughtPart = modelContent.parts.find((p: any) => p.thought === true);
			assert.ok(thoughtPart);
			assert.strictEqual(thoughtPart.text, "Let me think...");
		});

		test("skips empty text blocks", async () => {
			let capturedBody: any = null;

			mockFetch((_url, init) => {
				capturedBody = JSON.parse(init.body as string);
				return new Response(JSON.stringify(makeGeminiResponse()), { status: 200 });
			});

			const provider = new GeminiProvider({ auth: { kind: 'api-key', value: "key" } });
			await provider.createMessage(makeDefaultParams({
				messages: [{
					role: "user",
					content: [
						{ type: "text", text: "" },
						{ type: "text", text: "Real content" },
					],
				}],
			}));

			const userContent = capturedBody.contents[0];
			assert.strictEqual(userContent.parts.length, 1);
			assert.strictEqual(userContent.parts[0].text, "Real content");
		});

		test("handles string content as text part", async () => {
			let capturedBody: any = null;

			mockFetch((_url, init) => {
				capturedBody = JSON.parse(init.body as string);
				return new Response(JSON.stringify(makeGeminiResponse()), { status: 200 });
			});

			const provider = new GeminiProvider({ auth: { kind: 'api-key', value: "key" } });
			await provider.createMessage(makeDefaultParams({
				messages: [{ role: "user", content: "Simple string" }],
			}));

			assert.strictEqual(capturedBody.contents[0].parts[0].text, "Simple string");
		});
	});
});
