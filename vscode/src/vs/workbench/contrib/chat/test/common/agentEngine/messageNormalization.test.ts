/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { requestToUserMessage, historyToNormalizedMessages } from '../../../browser/agentEngine/messageNormalization.js';
import type { IChatAgentHistoryEntry, IChatAgentRequest } from '../../../common/participants/chatAgents.js';
import { IChatToolInvocation } from '../../../common/chatService/chatService.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ChatAgentLocation } from '../../../common/constants.js';

suite("AgentEngine - MessageNormalization", () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function makeRequest(message: string): IChatAgentRequest {
		return {
			sessionResource: URI.parse("file:///test"),
			requestId: "req_1",
			agentId: "director-code",
			message,
			variables: { variables: [] } as any,
			location: ChatAgentLocation.Chat,
		} as IChatAgentRequest;
	}

	function makeHistoryEntry(userMsg: string, assistantResp: string): IChatAgentHistoryEntry {
		return {
			request: makeRequest(userMsg),
			response: [{
				kind: 'markdownContent',
				content: { value: assistantResp },
			}] as any,
			result: {},
		};
	}

	// ---------------------------------------------------------------
	// requestToUserMessage
	// ---------------------------------------------------------------
	suite("requestToUserMessage", () => {

		test("extracts message from request", () => {
			const request = makeRequest("Hello world");
			assert.strictEqual(requestToUserMessage(request), "Hello world");
		});

		test("returns empty string for empty message", () => {
			const request = makeRequest("");
			assert.strictEqual(requestToUserMessage(request), "");
		});
	});

	// ---------------------------------------------------------------
	// historyToNormalizedMessages
	// ---------------------------------------------------------------
	suite("historyToNormalizedMessages", () => {

		test("converts single history entry to user+assistant messages", () => {
			const history = [makeHistoryEntry("Hi", "Hello!")];
			const messages = historyToNormalizedMessages(history);

			assert.strictEqual(messages.length, 2);
			assert.strictEqual(messages[0].role, "user");
			assert.strictEqual(messages[0].content, "Hi");
			assert.strictEqual(messages[1].role, "assistant");
			assert.strictEqual(messages[1].content, "Hello!");
		});

		test("converts multiple history entries", () => {
			const history = [
				makeHistoryEntry("First question", "First answer"),
				makeHistoryEntry("Second question", "Second answer"),
			];
			const messages = historyToNormalizedMessages(history);

			assert.strictEqual(messages.length, 4);
			assert.strictEqual(messages[0].role, "user");
			assert.strictEqual(messages[0].content, "First question");
			assert.strictEqual(messages[1].role, "assistant");
			assert.strictEqual(messages[1].content, "First answer");
			assert.strictEqual(messages[2].role, "user");
			assert.strictEqual(messages[2].content, "Second question");
			assert.strictEqual(messages[3].role, "assistant");
			assert.strictEqual(messages[3].content, "Second answer");
		});

		test("returns empty array for empty history", () => {
			const messages = historyToNormalizedMessages([]);
			assert.strictEqual(messages.length, 0);
		});

		test("handles history with empty assistant response", () => {
			const history: IChatAgentHistoryEntry[] = [{
				request: makeRequest("Question"),
				response: [] as any,
				result: {},
			}];
			const messages = historyToNormalizedMessages(history);

			// Only user message, no assistant message (empty response)
			assert.strictEqual(messages.length, 1);
			assert.strictEqual(messages[0].role, "user");
		});

		test("reconstructs tool_use and tool_result from aligned rich responses", () => {
			const history = [makeHistoryEntry("Find docs", "Plain fallback")];
			const toolState = {
				type: IChatToolInvocation.StateKind.Completed,
				parameters: { query: "docs" },
				resultDetails: { input: "{}", output: [{ type: "embed", value: "Found 3 docs", isText: true }] },
				contentForModel: [{ kind: "text", value: "Found 3 docs" }],
			};
			const richResponses = [[
				{ kind: "markdownContent", content: { value: "Searching..." } },
				{
					kind: "toolInvocation",
					toolCallId: "tool_1",
					toolId: "search",
					state: { read: () => toolState, get: () => toolState },
				},
			]] as any;

			const messages = historyToNormalizedMessages(history, richResponses);

			assert.strictEqual(messages.length, 3);
			assert.strictEqual(messages[0].content, "Find docs");
			assert.deepStrictEqual(messages[1].content, [
				{ type: "text", text: "Searching..." },
				{ type: "tool_use", id: "tool_1", name: "search", input: { query: "docs" } },
			]);
			assert.deepStrictEqual(messages[2].content, [
				{ type: "tool_result", tool_use_id: "tool_1", content: "Found 3 docs", is_error: undefined },
			]);
		});

		test("warns and falls back to plain text when rich response length mismatches history", () => {
			const history = [makeHistoryEntry("Question", "Plain answer")];
			let warning = "";
			const originalWarn = console.warn;
			console.warn = (value?: unknown) => { warning = String(value); };
			try {
				const messages = historyToNormalizedMessages(history, [] as any);
				assert.ok(warning.includes("rich response history length mismatch"));
				assert.strictEqual(messages.length, 2);
				assert.strictEqual(messages[1].content, "Plain answer");
			} finally {
				console.warn = originalWarn;
			}
		});

		test("uses _note fallback when tool arguments cannot be restored", () => {
			const history = [makeHistoryEntry("Run tool", "Plain fallback")];
			const toolState = {
				type: IChatToolInvocation.StateKind.Completed,
				parameters: undefined,
				resultDetails: { input: "{}", output: [{ type: "embed", value: "Done", isText: true }] },
				contentForModel: [{ kind: "text", value: "Done" }],
			};
			const richResponses = [[{
				kind: "toolInvocation",
				toolCallId: "tool_1",
				toolId: "unknownTool",
				state: { read: () => toolState, get: () => toolState },
			}]] as any;

			const messages = historyToNormalizedMessages(history, richResponses);
			assert.deepStrictEqual((messages[1].content as any[])[0].input, { _note: "arguments not available" });
		});

		test("truncates large tool results with head and tail", () => {
			const longResult = `${"a".repeat(3000)} middle ${"z".repeat(3000)}`;
			const history = [makeHistoryEntry("Run tool", "Plain fallback")];
			const toolState = {
				type: IChatToolInvocation.StateKind.Completed,
				parameters: { ok: true },
				resultDetails: { input: "{}", output: [{ type: "embed", value: longResult, isText: true }] },
				contentForModel: [{ kind: "text", value: longResult }],
			};
			const richResponses = [[{
				kind: "toolInvocation",
				toolCallId: "tool_1",
				toolId: "read",
				state: { read: () => toolState, get: () => toolState },
			}]] as any;

			const messages = historyToNormalizedMessages(history, richResponses);
			const result = ((messages[2].content as any[])[0].content as string);
			assert.ok(result.includes("...(truncated)..."));
			assert.ok(result.startsWith("aaa"));
			assert.ok(result.endsWith("zzz"));
		});

		test("replaces binary-looking tool results with placeholder", () => {
			const binaryLike = "a".repeat(600);
			const history = [makeHistoryEntry("Run tool", "Plain fallback")];
			const toolState = {
				type: IChatToolInvocation.StateKind.Completed,
				parameters: { ok: true },
				resultDetails: { input: "{}", output: [{ type: "embed", value: binaryLike, isText: true }] },
				contentForModel: [{ kind: "text", value: binaryLike }],
			};
			const richResponses = [[{
				kind: "toolInvocation",
				toolCallId: "tool_1",
				toolId: "read",
				state: { read: () => toolState, get: () => toolState },
			}]] as any;

			const messages = historyToNormalizedMessages(history, richResponses);
			const result = ((messages[2].content as any[])[0].content as string);
			assert.ok(result.includes("[Binary data: application/octet-stream"));
		});

		test("filters thinking and incomplete tool invocations from replay", () => {
			const history = [makeHistoryEntry("Question", "Plain fallback")];
			const completedState = {
				type: IChatToolInvocation.StateKind.Completed,
				parameters: { path: "a.txt" },
				resultDetails: { input: "{}", output: [{ type: "embed", value: "File text", isText: true }] },
				contentForModel: [{ kind: "text", value: "File text" }],
			};
			const executingState = {
				type: IChatToolInvocation.StateKind.Executing,
				parameters: { path: "b.txt" },
			};
			const richResponses = [[
				{ kind: "thinking", value: "hidden reasoning" },
				{
					kind: "toolInvocation",
					toolCallId: "tool_complete",
					toolId: "read",
					state: { read: () => completedState, get: () => completedState },
				},
				{
					kind: "toolInvocation",
					toolCallId: "tool_incomplete",
					toolId: "write",
					state: { read: () => executingState, get: () => executingState },
				},
			]] as any;

			const messages = historyToNormalizedMessages(history, richResponses);
			assert.strictEqual(messages.length, 3);
			assert.deepStrictEqual((messages[1].content as any[]).map(block => block.id), ["tool_complete"]);
			assert.deepStrictEqual((messages[2].content as any[]).map(block => block.tool_use_id), ["tool_complete"]);
		});
	});
});
