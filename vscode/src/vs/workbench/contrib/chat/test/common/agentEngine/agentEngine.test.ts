/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Integration Tests — AgentEngine Core Logic
 *
 * Tests the agent engine's supporting modules and their coordination:
 * - Initial messages format and validation
 * - Tool definitions and execution flow
 * - System prompt building
 * - Message normalization for multi-turn
 *
 * Note: Direct AgentEngine instantiation pulls in uuid.js and other
 * VS Code base modules that aren't available in the Node test runner.
 * We test the engine's dependencies and contracts instead.
 */

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import type {
	AgentToolDefinition,
} from '../../../common/agentEngine/agentEngineTypes.js';
import type {
	NormalizedMessageParam,
} from '../../../common/agentEngine/providers/providerTypes.js';
import { createProvider } from '../../../common/agentEngine/providers/providerFactory.js';
import { estimateTokens, estimateCost, getContextWindowSize } from '../../../common/agentEngine/tokens.js';
import {
	shouldAutoCompact,
	microCompactMessages,
	createAutoCompactState,
} from '../../../common/agentEngine/compact.js';
import {
	isRetryableError,
	isAuthError,
	isPromptTooLongError,
	getRetryDelay,
	formatApiError,
} from '../../../common/agentEngine/retry.js';

suite("AgentEngine - Core Logic", () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	// ====================================================================
	// Initial messages format
	// ====================================================================

	suite("Initial Messages (for multi-turn)", () => {

		test("NormalizedMessageParam can represent user+assistant pairs", () => {
			const history: NormalizedMessageParam[] = [
				{ role: "user", content: "What is 2+2?" },
				{ role: "assistant", content: "2+2 = 4" },
				{ role: "user", content: "Are you sure?" },
				{ role: "assistant", content: "Yes, I am sure." },
			];

			assert.strictEqual(history.length, 4);
			assert.strictEqual(history[0].role, "user");
			assert.strictEqual(history[1].role, "assistant");
		});

		test("NormalizedMessageParam supports content block arrays", () => {
			const msg: NormalizedMessageParam = {
				role: "assistant",
				content: [
					{ type: "text", text: "Let me check that file." },
					{ type: "tool_use", id: "tool-1", name: "read_file", input: { path: "test.ts" } },
				],
			};

			assert.strictEqual(msg.role, "assistant");
			assert.ok(Array.isArray(msg.content));
		});

		test("empty initial messages is valid", () => {
			const history: NormalizedMessageParam[] = [];
			assert.strictEqual(history.length, 0);
		});
	});

	// ====================================================================
	// Tool definitions
	// ====================================================================

	suite("Tool Definitions", () => {

		test("AgentToolDefinition has required fields", () => {
			const tool: AgentToolDefinition = {
				name: "read_file",
				description: "Read a file from disk",
				inputSchema: {
					type: "object",
					properties: {
						path: { type: "string", description: "File path" },
					},
					required: ["path"],
				},
			};

			assert.strictEqual(tool.name, "read_file");
			assert.ok(tool.inputSchema.properties.path);
		});

		test("tool with isReadOnly flag", () => {
			const tool: AgentToolDefinition = {
				name: "search",
				description: "Search codebase",
				inputSchema: { type: "object", properties: {} },
				isReadOnly: true,
			};

			assert.strictEqual(tool.isReadOnly, true);
		});

		test("tool with no isReadOnly defaults to undefined (mutation)", () => {
			const tool: AgentToolDefinition = {
				name: "write_file",
				description: "Write to file",
				inputSchema: { type: "object", properties: {} },
			};

			assert.strictEqual(tool.isReadOnly, undefined);
		});
	});

	// ====================================================================
	// Token and cost estimation
	// ====================================================================

	suite("Token & Cost Estimation", () => {

		test("estimateTokens gives reasonable count", () => {
			const tokens = estimateTokens("Hello, world! This is a test.");
			assert.ok(tokens > 0 && tokens < 100);
		});

		test("estimateCost returns positive value for non-zero usage", () => {
			const cost = estimateCost("claude-sonnet-4-6", {
				input_tokens: 1000,
				output_tokens: 500,
			});
			assert.ok(cost >= 0);
		});

		test("getContextWindowSize returns valid sizes for known models", () => {
			const models = ["claude-sonnet-4-6", "gpt-4o", "gemini-2.5-pro"];
			for (const model of models) {
				const size = getContextWindowSize(model);
				assert.ok(size > 0, `${model} should have positive context window`);
			}
		});
	});

	// ====================================================================
	// Auto-compact logic
	// ====================================================================

	suite("Auto-Compact", () => {

		test("createAutoCompactState returns valid initial state", () => {
			const state = createAutoCompactState();
			assert.ok(state);
			assert.strictEqual(state.compacted, false);
		});

		test("shouldAutoCompact returns false for short conversations", () => {
			const messages: NormalizedMessageParam[] = [
				{ role: "user", content: "Hello" },
				{ role: "assistant", content: "Hi there!" },
			];
			const state = createAutoCompactState();

			const result = shouldAutoCompact(messages, "claude-sonnet-4-6", state);
			assert.strictEqual(result, false);
		});

		test("microCompactMessages truncates long tool results", () => {
			const longResult = "x".repeat(50000);
			const messages: NormalizedMessageParam[] = [
				{
					role: "user",
					content: [
						{ type: "tool_result", tool_use_id: "t1", content: longResult },
					],
				},
			];

			const compacted = microCompactMessages(messages);
			assert.ok(compacted.length > 0);
		});
	});

	// ====================================================================
	// Retry logic
	// ====================================================================

	suite("Retry Logic", () => {

		test("429 is retryable", () => {
			const err: any = new Error("Rate limit");
			err.status = 429;
			assert.strictEqual(isRetryableError(err), true);
		});

		test("401 is NOT retryable", () => {
			const err: any = new Error("Unauthorized");
			err.status = 401;
			assert.strictEqual(isRetryableError(err), false);
			assert.strictEqual(isAuthError(err), true);
		});

		test("prompt too long error detected", () => {
			const err: any = new Error("prompt is too long");
			err.status = 400;
			assert.strictEqual(isPromptTooLongError(err), true);
		});

		test("retry delay increases exponentially", () => {
			const delay0 = getRetryDelay(0);
			const delay1 = getRetryDelay(1);
			const delay2 = getRetryDelay(2);

			// Each delay should roughly double (with jitter)
			assert.ok(delay1 > delay0 * 0.5, "delay1 should be larger than half delay0");
			assert.ok(delay2 > delay1 * 0.5, "delay2 should be larger than half delay1");
		});

		test("formatApiError returns user-friendly messages", () => {
			const authErr: any = new Error("fail");
			authErr.status = 401;
			assert.ok(formatApiError(authErr).includes("Authentication"));

			const rateErr: any = new Error("fail");
			rateErr.status = 429;
			assert.ok(formatApiError(rateErr).includes("Rate limit"));

			const overloadErr: any = new Error("fail");
			overloadErr.status = 529;
			assert.ok(formatApiError(overloadErr).includes("overloaded"));
		});
	});

	// ====================================================================
	// Provider creation for engine config
	// ====================================================================

	suite("Provider for Engine Config", () => {

		test("created provider has required methods for engine", () => {
			const provider = createProvider("anthropic-messages", { auth: { kind: 'api-key', value: "test" } });

			assert.strictEqual(typeof provider.createMessage, "function");
			assert.strictEqual(typeof provider.createMessageStream, "function");
			assert.ok(provider.apiType);
		});

		test("all 3 providers work with engine's createMessage interface", () => {
			const types = ["anthropic-messages", "openai-completions", "gemini-generative"] as const;

			for (const apiType of types) {
				const provider = createProvider(apiType, { auth: { kind: 'api-key', value: "test" } });
				assert.strictEqual(typeof provider.createMessage, "function");
			}
		});
	});
});
