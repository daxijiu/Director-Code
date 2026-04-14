/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { requestToUserMessage, historyToNormalizedMessages } from '../../../browser/agentEngine/messageNormalization.js';
import type { IChatAgentHistoryEntry, IChatAgentRequest } from '../../../common/participants/chatAgents.js';
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
	});
});
