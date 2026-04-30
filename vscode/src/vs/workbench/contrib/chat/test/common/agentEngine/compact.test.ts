/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import {
	compactConversation,
	createAutoCompactState,
	microCompactMessages,
	shouldAutoCompact,
} from '../../../common/agentEngine/compact.js';
import type { LLMProvider, CreateMessageParams, CreateMessageResponse } from '../../../common/agentEngine/providers/providerTypes.js';
import type { AutoCompactState } from '../../../common/agentEngine/agentEngineTypes.js';

// --------------------------------------------------------------------------
// Mock LLMProvider
// --------------------------------------------------------------------------

function createMockProvider(summaryText: string = 'This is a summary.'): LLMProvider {
	return {
		apiType: 'anthropic-messages',
		createMessage: async (_params: CreateMessageParams): Promise<CreateMessageResponse> => ({
			content: [{ type: 'text', text: summaryText }],
			stopReason: 'end_turn',
			usage: { input_tokens: 100, output_tokens: 50 },
		}),
	};
}

function createFailingProvider(): LLMProvider {
	return {
		apiType: 'anthropic-messages',
		createMessage: async (): Promise<CreateMessageResponse> => {
			throw new Error('LLM call failed');
		},
	};
}

suite('AgentEngine - Compact', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	// ---------------------------------------------------------------
	// createAutoCompactState
	// ---------------------------------------------------------------
	suite('createAutoCompactState', () => {
		test('returns fresh state', () => {
			const state = createAutoCompactState();
			assert.strictEqual(state.compacted, false);
			assert.strictEqual(state.turnCounter, 0);
			assert.strictEqual(state.consecutiveFailures, 0);
		});
	});

	// ---------------------------------------------------------------
	// shouldAutoCompact
	// ---------------------------------------------------------------
	suite('shouldAutoCompact', () => {
		test('returns false when messages are small', () => {
			const state = createAutoCompactState();
			const messages = [{ role: 'user', content: 'hello' }];
			assert.strictEqual(shouldAutoCompact(messages, 'claude-sonnet-4-5', state), false);
		});

		test('returns true when messages exceed threshold', () => {
			const state = createAutoCompactState();
			// claude-sonnet-4-5 context window = 200000, threshold = 200000 - 13000 = 187000 tokens
			// 4 chars per token, so we need 187000 * 4 = 748000 chars
			const bigContent = 'x'.repeat(800_000);
			const messages = [{ role: 'user', content: bigContent }];
			assert.strictEqual(shouldAutoCompact(messages, 'claude-sonnet-4-5', state), true);
		});

		test('returns false after 3 consecutive failures', () => {
			const state: AutoCompactState = {
				compacted: false,
				turnCounter: 5,
				consecutiveFailures: 3,
			};
			const bigContent = 'x'.repeat(800_000);
			const messages = [{ role: 'user', content: bigContent }];
			assert.strictEqual(shouldAutoCompact(messages, 'claude-sonnet-4-5', state), false);
		});

		test('still works with 2 consecutive failures', () => {
			const state: AutoCompactState = {
				compacted: false,
				turnCounter: 5,
				consecutiveFailures: 2,
			};
			const bigContent = 'x'.repeat(800_000);
			const messages = [{ role: 'user', content: bigContent }];
			assert.strictEqual(shouldAutoCompact(messages, 'claude-sonnet-4-5', state), true);
		});
	});

	// ---------------------------------------------------------------
	// compactConversation
	// ---------------------------------------------------------------
	suite('compactConversation', () => {
		test('produces compacted messages with summary', async () => {
			const provider = createMockProvider('Summary of conversation.');
			const state = createAutoCompactState();
			// [Director-Code] A3: original messages must be larger than compacted result for success
			const longContent = 'x'.repeat(2000);
			const messages = [
				{ role: 'user', content: longContent },
				{ role: 'assistant', content: longContent },
			];

			const result = await compactConversation(provider, 'claude-sonnet-4-5', messages, state);

			assert.strictEqual(result.summary, 'Summary of conversation.');
			assert.strictEqual(result.compactedMessages.length, 2);
			assert.strictEqual(result.compactedMessages[0].role, 'user');
			assert.ok((result.compactedMessages[0].content as string).includes('Summary of conversation.'));
			assert.strictEqual(result.compactedMessages[1].role, 'assistant');
			assert.strictEqual(result.state.compacted, true);
			assert.strictEqual(result.state.consecutiveFailures, 0);
		});

		test('returns original messages on failure', async () => {
			const provider = createFailingProvider();
			const state = createAutoCompactState();
			const messages = [
				{ role: 'user', content: 'Hello' },
			];

			const result = await compactConversation(provider, 'claude-sonnet-4-5', messages as any, state);

			assert.strictEqual(result.compactedMessages, messages);
			assert.strictEqual(result.summary, '');
			assert.strictEqual(result.state.consecutiveFailures, 1);
		});

		test('increments consecutive failures on repeated failures', async () => {
			const provider = createFailingProvider();
			const state: AutoCompactState = {
				compacted: false,
				turnCounter: 5,
				consecutiveFailures: 2,
			};
			const messages = [{ role: 'user', content: 'Hello' }];

			const result = await compactConversation(provider, 'claude-sonnet-4-5', messages as any, state);
			assert.strictEqual(result.state.consecutiveFailures, 3);
		});

		test('strips images before compacting', async () => {
			let capturedMessages: any = null;
			const provider: LLMProvider = {
				apiType: 'anthropic-messages',
				createMessage: async (params: CreateMessageParams): Promise<CreateMessageResponse> => {
					capturedMessages = params.messages;
					return {
						content: [{ type: 'text', text: 'summary' }],
						stopReason: 'end_turn',
						usage: { input_tokens: 10, output_tokens: 5 },
					};
				},
			};
			const state = createAutoCompactState();
			const messages = [
				{
					role: 'user',
					content: [
						{ type: 'text', text: 'Look at this image' },
						{ type: 'image', source: { data: 'base64data...' } },
					],
				},
			];

			await compactConversation(provider, 'claude-sonnet-4-5', messages, state);

			// The prompt sent to LLM should not contain the word "base64data"
			assert.ok(capturedMessages);
			const promptContent = JSON.stringify(capturedMessages);
			assert.ok(!promptContent.includes('base64data'), 'images should be stripped from compaction prompt');
		});
	});

	// ---------------------------------------------------------------
	// microCompactMessages
	// ---------------------------------------------------------------
	suite('microCompactMessages', () => {
		test('does not modify short messages', () => {
			const messages = [
				{ role: 'user', content: 'hello' },
				{ role: 'assistant', content: 'hi' },
			];
			const result = microCompactMessages(messages);
			assert.deepStrictEqual(result, messages);
		});

		test('truncates large tool_result content', () => {
			const longContent = 'a'.repeat(100_000);
			const messages = [
				{
					role: 'user',
					content: [
						{ type: 'tool_result', tool_use_id: '1', content: longContent },
					],
				},
			];

			const result = microCompactMessages(messages, 50_000);
			const resultContent = result[0].content[0].content;

			assert.ok(resultContent.length < longContent.length, 'content should be truncated');
			assert.ok(resultContent.includes('...(truncated)...'), 'should contain truncation marker');
		});

		test('preserves tool_result content under limit', () => {
			const shortContent = 'a'.repeat(100);
			const messages = [
				{
					role: 'user',
					content: [
						{ type: 'tool_result', tool_use_id: '1', content: shortContent },
					],
				},
			];

			const result = microCompactMessages(messages, 50_000);
			assert.strictEqual(result[0].content[0].content, shortContent);
		});

		test('does not truncate non-tool_result blocks', () => {
			const longText = 'b'.repeat(100_000);
			const messages = [
				{
					role: 'assistant',
					content: [
						{ type: 'text', text: longText },
					],
				},
			];

			const result = microCompactMessages(messages, 50_000);
			assert.strictEqual(result[0].content[0].text, longText);
		});

		test('handles messages with string content', () => {
			const messages = [{ role: 'user', content: 'just a string' }];
			const result = microCompactMessages(messages);
			assert.deepStrictEqual(result, messages);
		});

		test('handles mixed content blocks', () => {
			const longContent = 'c'.repeat(100_000);
			const messages = [
				{
					role: 'user',
					content: [
						{ type: 'text', text: 'normal text' },
						{ type: 'tool_result', tool_use_id: '1', content: longContent },
						{ type: 'tool_result', tool_use_id: '2', content: 'short' },
					],
				},
			];

			const result = microCompactMessages(messages, 50_000);
			assert.strictEqual(result[0].content[0].text, 'normal text');
			assert.ok(result[0].content[1].content.includes('...(truncated)...'));
			assert.strictEqual(result[0].content[2].content, 'short');
		});

		test('uses default maxToolResultChars of 50000', () => {
			const content60k = 'd'.repeat(60_000);
			const messages = [
				{
					role: 'user',
					content: [
						{ type: 'tool_result', tool_use_id: '1', content: content60k },
					],
				},
			];

			const result = microCompactMessages(messages); // default 50000
			assert.ok(result[0].content[0].content.includes('...(truncated)...'));
		});
	});
});
