/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import {
	AUTOCOMPACT_BUFFER_TOKENS,
	estimateCost,
	estimateMessagesTokens,
	estimateTokens,
	getAutoCompactThreshold,
	getContextWindowSize,
	MODEL_PRICING,
} from '../../../common/agentEngine/tokens.js';

suite('AgentEngine - Tokens', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	// ---------------------------------------------------------------
	// estimateTokens
	// ---------------------------------------------------------------
	suite('estimateTokens', () => {
		test('estimates 4 chars per token', () => {
			assert.strictEqual(estimateTokens(''), 0);
			assert.strictEqual(estimateTokens('abcd'), 1);
			assert.strictEqual(estimateTokens('abcdefgh'), 2);
		});

		test('rounds up partial tokens', () => {
			assert.strictEqual(estimateTokens('ab'), 1);    // ceil(2/4) = 1
			assert.strictEqual(estimateTokens('abcde'), 2); // ceil(5/4) = 2
		});

		test('handles long text', () => {
			const text = 'x'.repeat(4000);
			assert.strictEqual(estimateTokens(text), 1000);
		});
	});

	// ---------------------------------------------------------------
	// estimateMessagesTokens
	// ---------------------------------------------------------------
	suite('estimateMessagesTokens', () => {
		test('handles string content', () => {
			const messages = [
				{ role: 'user', content: 'abcdefgh' },     // 2 tokens
				{ role: 'assistant', content: 'abcd' },     // 1 token
			];
			assert.strictEqual(estimateMessagesTokens(messages), 3);
		});

		test('handles array content with text blocks', () => {
			const messages = [
				{
					role: 'user',
					content: [
						{ type: 'text', text: 'abcdefgh' },     // 2 tokens
						{ type: 'text', text: 'abcd' },         // 1 token
					],
				},
			];
			assert.strictEqual(estimateMessagesTokens(messages), 3);
		});

		test('handles tool_result content blocks', () => {
			const messages = [
				{
					role: 'user',
					content: [
						{ type: 'tool_result', tool_use_id: '1', content: 'abcdefgh' },  // 2 tokens via "content" path
					],
				},
			];
			assert.strictEqual(estimateMessagesTokens(messages), 2);
		});

		test('handles tool_use blocks via JSON.stringify fallback', () => {
			const messages = [
				{
					role: 'assistant',
					content: [
						{ type: 'tool_use', id: '1', name: 'test', input: {} },
					],
				},
			];
			const result = estimateMessagesTokens(messages);
			assert.ok(result > 0, 'should estimate some tokens for tool_use blocks');
		});

		test('handles empty messages', () => {
			assert.strictEqual(estimateMessagesTokens([]), 0);
		});

		test('handles mixed content', () => {
			const messages = [
				{ role: 'user', content: 'abcd' },                                   // 1
				{
					role: 'assistant', content: [
						{ type: 'text', text: 'abcdefgh' },                              // 2
					]
				},
				{ role: 'user', content: [{ type: 'tool_result', tool_use_id: '1', content: 'abcd' }] }, // 1
			];
			assert.strictEqual(estimateMessagesTokens(messages), 4);
		});
	});

	// ---------------------------------------------------------------
	// getContextWindowSize
	// ---------------------------------------------------------------
	suite('getContextWindowSize', () => {
		test('returns correct size for Anthropic models', () => {
			assert.strictEqual(getContextWindowSize('claude-opus-4-6-1m'), 1_000_000);
			assert.strictEqual(getContextWindowSize('claude-opus-4-6'), 200_000);
			assert.strictEqual(getContextWindowSize('claude-sonnet-4-5'), 200_000);
			assert.strictEqual(getContextWindowSize('claude-haiku-4-5'), 200_000);
			assert.strictEqual(getContextWindowSize('claude-3-5-sonnet'), 200_000);
		});

		test('returns correct size for OpenAI models', () => {
			assert.strictEqual(getContextWindowSize('gpt-4o'), 128_000);
			assert.strictEqual(getContextWindowSize('gpt-4-turbo'), 128_000);
			assert.strictEqual(getContextWindowSize('gpt-4-1'), 1_000_000);
			assert.strictEqual(getContextWindowSize('gpt-3.5-turbo'), 16_385);
			assert.strictEqual(getContextWindowSize('o1-preview'), 200_000);
			assert.strictEqual(getContextWindowSize('o3-mini'), 200_000);
			assert.strictEqual(getContextWindowSize('o4-mini'), 200_000);
		});

		test('returns correct size for DeepSeek models', () => {
			assert.strictEqual(getContextWindowSize('deepseek-chat'), 128_000);
			assert.strictEqual(getContextWindowSize('deepseek-reasoner'), 128_000);
		});

		test('returns correct size for Gemini models', () => {
			assert.strictEqual(getContextWindowSize('gemini-2.5-pro'), 1_000_000);
			assert.strictEqual(getContextWindowSize('gemini-2.5-flash'), 1_000_000);
		});

		test('returns default for unknown models', () => {
			assert.strictEqual(getContextWindowSize('some-unknown-model'), 200_000);
		});
	});

	// ---------------------------------------------------------------
	// getAutoCompactThreshold
	// ---------------------------------------------------------------
	suite('getAutoCompactThreshold', () => {
		test('is context window minus buffer', () => {
			const model = 'claude-sonnet-4-5';
			const expected = 200_000 - AUTOCOMPACT_BUFFER_TOKENS;
			assert.strictEqual(getAutoCompactThreshold(model), expected);
		});

		test('AUTOCOMPACT_BUFFER_TOKENS is 13000', () => {
			assert.strictEqual(AUTOCOMPACT_BUFFER_TOKENS, 13_000);
		});
	});

	// ---------------------------------------------------------------
	// MODEL_PRICING
	// ---------------------------------------------------------------
	suite('MODEL_PRICING', () => {
		test('contains Anthropic models', () => {
			assert.ok('claude-opus-4-6' in MODEL_PRICING);
			assert.ok('claude-sonnet-4-6' in MODEL_PRICING);
			assert.ok('claude-haiku-4-5' in MODEL_PRICING);
		});

		test('contains OpenAI models', () => {
			assert.ok('gpt-4o' in MODEL_PRICING);
			assert.ok('gpt-4o-mini' in MODEL_PRICING);
			assert.ok('o1' in MODEL_PRICING);
		});

		test('contains DeepSeek models', () => {
			assert.ok('deepseek-chat' in MODEL_PRICING);
			assert.ok('deepseek-reasoner' in MODEL_PRICING);
		});

		test('contains Gemini models', () => {
			assert.ok('gemini-2.5-pro' in MODEL_PRICING);
			assert.ok('gemini-2.5-flash' in MODEL_PRICING);
		});

		test('all prices have input and output', () => {
			for (const [model, pricing] of Object.entries(MODEL_PRICING)) {
				assert.ok(typeof pricing.input === 'number', `${model} missing input price`);
				assert.ok(typeof pricing.output === 'number', `${model} missing output price`);
				assert.ok(pricing.input > 0, `${model} input price should be > 0`);
				assert.ok(pricing.output > 0, `${model} output price should be > 0`);
				assert.ok(pricing.output >= pricing.input, `${model} output should be >= input`);
			}
		});
	});

	// ---------------------------------------------------------------
	// estimateCost
	// ---------------------------------------------------------------
	suite('estimateCost', () => {
		test('calculates cost for known model', () => {
			const cost = estimateCost('claude-sonnet-4-6', { input_tokens: 1000, output_tokens: 500 });
			// sonnet: $3/M input, $15/M output
			const expected = 1000 * (3 / 1_000_000) + 500 * (15 / 1_000_000);
			assert.ok(Math.abs(cost - expected) < 1e-10, `cost ${cost} should equal ${expected}`);
		});

		test('calculates cost for model with partial match', () => {
			// "claude-sonnet-4-6-20250101" should match "claude-sonnet-4-6"
			const cost = estimateCost('claude-sonnet-4-6-20250101', { input_tokens: 1000, output_tokens: 500 });
			assert.ok(cost > 0);
		});

		test('uses fallback pricing for unknown model', () => {
			const cost = estimateCost('unknown-model-xyz', { input_tokens: 1_000_000, output_tokens: 1_000_000 });
			// fallback: $3/M input, $15/M output
			const expected = 1_000_000 * (3 / 1_000_000) + 1_000_000 * (15 / 1_000_000);
			assert.ok(Math.abs(cost - expected) < 1e-10);
		});

		test('returns 0 for zero tokens', () => {
			assert.strictEqual(estimateCost('gpt-4o', { input_tokens: 0, output_tokens: 0 }), 0);
		});

		test('ignores cache tokens in cost', () => {
			const cost = estimateCost('claude-sonnet-4-6', {
				input_tokens: 1000,
				output_tokens: 500,
				cache_creation_input_tokens: 5000,
				cache_read_input_tokens: 3000,
			});
			// Should only use input_tokens and output_tokens
			const expected = 1000 * (3 / 1_000_000) + 500 * (15 / 1_000_000);
			assert.ok(Math.abs(cost - expected) < 1e-10);
		});
	});
});
