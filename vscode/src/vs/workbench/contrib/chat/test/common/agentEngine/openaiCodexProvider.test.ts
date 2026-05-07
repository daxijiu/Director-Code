/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { OpenAICodexProvider } from '../../../common/agentEngine/providers/openaiCodexProvider.js';
import type { CreateMessageParams, StreamEvent } from '../../../common/agentEngine/providers/providerTypes.js';

function encodeBase64Url(value: object): string {
	return Buffer.from(JSON.stringify(value), 'utf8')
		.toString('base64')
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}

function makeJwt(accountId = 'acct-test'): string {
	return [
		encodeBase64Url({ alg: 'none', typ: 'JWT' }),
		encodeBase64Url({ 'https://api.openai.com/auth': { chatgpt_account_id: accountId } }),
		'signature',
	].join('.');
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

function makeDefaultParams(overrides?: Partial<CreateMessageParams>): CreateMessageParams {
	return {
		model: "gpt-5.2-codex",
		maxTokens: 1024,
		system: "Reply briefly.",
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

suite("AgentEngine - OpenAICodexProvider", () => {

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

	test("sets apiType to openai-codex", () => {
		const provider = new OpenAICodexProvider({ auth: { kind: 'bearer', accessToken: makeJwt() } });
		assert.strictEqual(provider.apiType, "openai-codex");
	});

	test("sends responses requests to chatgpt Codex backend with OAuth headers", async () => {
		let capturedUrl = "";
		let capturedBody: any = undefined;
		let capturedHeaders: any = undefined;

		mockFetch((url, init) => {
			capturedUrl = url;
			capturedBody = JSON.parse(init.body as string);
			capturedHeaders = init.headers;
			return new Response(JSON.stringify({
				status: "completed",
				output: [{ type: "message", content: [{ type: "output_text", text: "OK" }] }],
				usage: { input_tokens: 3, output_tokens: 1 },
			}), { status: 200 });
		});

		const provider = new OpenAICodexProvider({ auth: { kind: 'bearer', accessToken: makeJwt("acct-123") } });
		const result = await provider.createMessage(makeDefaultParams());

		assert.strictEqual(capturedUrl, "https://chatgpt.com/backend-api/codex/responses");
		assert.ok(!capturedUrl.includes("api.openai.com"));
		assert.strictEqual(capturedHeaders["Authorization"].startsWith("Bearer "), true);
		assert.strictEqual(capturedHeaders["OpenAI-Beta"], "responses=experimental");
		assert.strictEqual(capturedHeaders["originator"], "director-code");
		assert.strictEqual(capturedHeaders["chatgpt-account-id"], "acct-123");
		assert.strictEqual(capturedBody.model, "gpt-5.2-codex");
		assert.strictEqual(capturedBody.store, false);
		assert.strictEqual(capturedBody.instructions, "Reply briefly.");
		assert.deepStrictEqual(capturedBody.input, [{ role: "user", content: "Hi" }]);
		assert.strictEqual(capturedBody.max_tokens, undefined);
		assert.strictEqual(capturedBody.max_output_tokens, undefined);
		assert.strictEqual(result.content[0].type, "text");
		assert.strictEqual((result.content[0] as any).text, "OK");
	});

	test("converts normalized tools and function call history to Responses input", async () => {
		let capturedBody: any = undefined;

		mockFetch((_url, init) => {
			capturedBody = JSON.parse(init.body as string);
			return new Response(JSON.stringify({
				status: "completed",
				output: [{ type: "message", content: [{ type: "output_text", text: "Done" }] }],
				usage: { input_tokens: 1, output_tokens: 1 },
			}), { status: 200 });
		});

		const provider = new OpenAICodexProvider({ auth: { kind: 'bearer', accessToken: makeJwt() } });
		await provider.createMessage(makeDefaultParams({
			messages: [
				{
					role: "assistant",
					content: [
						{ type: "text", text: "Searching" },
						{ type: "tool_use", id: "toolu.1", name: "search", input: { q: "test" } },
					],
				},
				{
					role: "user",
					content: [
						{ type: "tool_result", tool_use_id: "toolu.1", content: "Result" },
					],
				},
			],
			tools: [{
				name: "search",
				description: "Search",
				input_schema: { type: "object", properties: { q: { type: "string" } } },
			}],
		}));

		assert.deepStrictEqual(capturedBody.input, [
			{ role: "assistant", content: "Searching" },
			{ type: "function_call", call_id: "call_toolu_1", name: "search", arguments: "{\"q\":\"test\"}" },
			{ type: "function_call_output", call_id: "call_toolu_1", output: "Result" },
		]);
		assert.deepStrictEqual(capturedBody.tools, [{
			type: "function",
			name: "search",
			description: "Search",
			parameters: { type: "object", properties: { q: { type: "string" } } },
			strict: false,
		}]);
	});

	test("parses non-streaming function calls and usage", async () => {
		mockFetch(() => new Response(JSON.stringify({
			status: "completed",
			output: [{
				type: "function_call",
				id: "fc_1",
				call_id: "call_1",
				name: "search",
				arguments: "{\"q\":\"hello\"}",
			}],
			usage: { input_tokens: 10, output_tokens: 5, input_tokens_details: { cached_tokens: 2 } },
		}), { status: 200 }));

		const provider = new OpenAICodexProvider({ auth: { kind: 'bearer', accessToken: makeJwt() } });
		const result = await provider.createMessage(makeDefaultParams());

		assert.strictEqual(result.stopReason, "tool_use");
		assert.strictEqual(result.usage.input_tokens, 10);
		assert.strictEqual(result.usage.output_tokens, 5);
		assert.strictEqual(result.usage.cache_read_input_tokens, 2);
		assert.deepStrictEqual(result.content[0], {
			type: "tool_use",
			id: "call_1",
			name: "search",
			input: { q: "hello" },
		});
	});

	test("streams output_text deltas and completion usage", async () => {
		let capturedHeaders: any = undefined;
		let capturedBody: any = undefined;
		const sseLines = [
			"data: " + JSON.stringify({ type: "response.output_text.delta", delta: "O" }),
			"data: " + JSON.stringify({ type: "response.output_text.delta", delta: "K" }),
			"data: " + JSON.stringify({
				type: "response.completed",
				response: { status: "completed", output: [], usage: { input_tokens: 4, output_tokens: 2 } },
			}),
		];

		mockFetch((_url, init) => {
			capturedHeaders = init.headers;
			capturedBody = JSON.parse(init.body as string);
			return new Response(createSSEStream(sseLines), { status: 200 });
		});

		const provider = new OpenAICodexProvider({ auth: { kind: 'bearer', accessToken: makeJwt() } });
		const events = await collectStreamEvents(provider.createMessageStream(makeDefaultParams()));

		assert.strictEqual(capturedHeaders["Accept"], "text/event-stream");
		assert.strictEqual(capturedBody.stream, true);
		assert.deepStrictEqual(events.filter(e => e.type === "text"), [
			{ type: "text", text: "O" },
			{ type: "text", text: "K" },
		]);
		const complete = events.find(e => e.type === "message_complete") as any;
		assert.strictEqual(complete.usage.input_tokens, 4);
		assert.strictEqual(complete.usage.output_tokens, 2);
	});

	test("streams completed function calls when backend sends output_item.done", async () => {
		const sseLines = [
			"data: " + JSON.stringify({
				type: "response.output_item.done",
				item: {
					type: "function_call",
					id: "fc_1",
					call_id: "call_1",
					name: "search",
					arguments: "{\"q\":\"hello\"}",
				},
			}),
			"data: " + JSON.stringify({
				type: "response.completed",
				response: { status: "completed", output: [], usage: { input_tokens: 4, output_tokens: 2 } },
			}),
		];

		mockFetch(() => new Response(createSSEStream(sseLines), { status: 200 }));

		const provider = new OpenAICodexProvider({ auth: { kind: 'bearer', accessToken: makeJwt() } });
		const events = await collectStreamEvents(provider.createMessageStream(makeDefaultParams()));

		assert.deepStrictEqual(events.slice(0, 2), [
			{ type: "tool_use_start", id: "call_1", name: "search", index: undefined },
			{ type: "tool_input_delta", json: "{\"q\":\"hello\"}", index: undefined },
		]);
		assert.ok(events.some(e => e.type === "message_complete"));
	});

	test("rejects API-key auth before sending a Codex request", async () => {
		let fetchCalled = false;
		mockFetch(() => {
			fetchCalled = true;
			return new Response("", { status: 500 });
		});

		const provider = new OpenAICodexProvider({ auth: { kind: 'api-key', value: "sk-test" } });
		await assert.rejects(
			() => provider.createMessage(makeDefaultParams()),
			/OpenAI Codex transport requires an OAuth bearer token/,
		);
		assert.strictEqual(fetchCalled, false);
	});
});
