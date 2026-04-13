/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import {
	DEFAULT_RETRY_CONFIG,
	formatApiError,
	getRetryDelay,
	isAuthError,
	isPromptTooLongError,
	isRateLimitError,
	isRetryableError,
	withRetry,
} from '../../../common/agentEngine/retry.js';
import type { RetryConfig } from '../../../common/agentEngine/retry.js';

suite('AgentEngine - Retry', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	// ---------------------------------------------------------------
	// DEFAULT_RETRY_CONFIG
	// ---------------------------------------------------------------
	suite('DEFAULT_RETRY_CONFIG', () => {
		test('has sensible defaults', () => {
			assert.strictEqual(DEFAULT_RETRY_CONFIG.maxRetries, 3);
			assert.strictEqual(DEFAULT_RETRY_CONFIG.baseDelayMs, 2000);
			assert.strictEqual(DEFAULT_RETRY_CONFIG.maxDelayMs, 30000);
			assert.ok(DEFAULT_RETRY_CONFIG.retryableStatusCodes.includes(429));
			assert.ok(DEFAULT_RETRY_CONFIG.retryableStatusCodes.includes(529));
		});
	});

	// ---------------------------------------------------------------
	// isRetryableError
	// ---------------------------------------------------------------
	suite('isRetryableError', () => {
		test('returns true for retryable status codes', () => {
			for (const code of [429, 500, 502, 503, 529]) {
				assert.strictEqual(isRetryableError({ status: code }), true, `status ${code} should be retryable`);
			}
		});

		test('returns false for non-retryable status codes', () => {
			for (const code of [400, 401, 403, 404, 422]) {
				assert.strictEqual(isRetryableError({ status: code }), false, `status ${code} should NOT be retryable`);
			}
		});

		test('returns true for network errors', () => {
			assert.strictEqual(isRetryableError({ code: 'ECONNRESET' }), true);
			assert.strictEqual(isRetryableError({ code: 'ETIMEDOUT' }), true);
			assert.strictEqual(isRetryableError({ code: 'ECONNREFUSED' }), true);
		});

		test('returns false for unknown network errors', () => {
			assert.strictEqual(isRetryableError({ code: 'ENOTFOUND' }), false);
		});

		test('returns true for overloaded_error type', () => {
			assert.strictEqual(isRetryableError({ error: { type: 'overloaded_error' } }), true);
		});

		test('returns false for null/undefined', () => {
			assert.strictEqual(isRetryableError(null), false);
			assert.strictEqual(isRetryableError(undefined), false);
		});

		test('respects custom config', () => {
			const config: RetryConfig = { ...DEFAULT_RETRY_CONFIG, retryableStatusCodes: [418] };
			assert.strictEqual(isRetryableError({ status: 418 }, config), true);
			assert.strictEqual(isRetryableError({ status: 429 }, config), false);
		});
	});

	// ---------------------------------------------------------------
	// isPromptTooLongError
	// ---------------------------------------------------------------
	suite('isPromptTooLongError', () => {
		test('returns true for prompt too long message', () => {
			assert.strictEqual(isPromptTooLongError({
				status: 400,
				error: { error: { message: 'prompt is too long for this model' } },
			}), true);
		});

		test('returns true for max_tokens message', () => {
			assert.strictEqual(isPromptTooLongError({
				status: 400,
				message: 'max_tokens exceeded',
			}), true);
		});

		test('returns true for context length message', () => {
			assert.strictEqual(isPromptTooLongError({
				status: 400,
				error: { error: { message: 'This model maximum context length is 128000' } },
			}), true);
		});

		test('returns false for other 400 errors', () => {
			assert.strictEqual(isPromptTooLongError({
				status: 400,
				message: 'invalid_request_error',
			}), false);
		});

		test('returns false for non-400 status', () => {
			assert.strictEqual(isPromptTooLongError({
				status: 500,
				message: 'prompt is too long',
			}), false);
		});
	});

	// ---------------------------------------------------------------
	// isAuthError / isRateLimitError
	// ---------------------------------------------------------------
	suite('isAuthError', () => {
		test('returns true for 401 and 403', () => {
			assert.strictEqual(isAuthError({ status: 401 }), true);
			assert.strictEqual(isAuthError({ status: 403 }), true);
		});

		test('returns false for other status codes', () => {
			assert.strictEqual(isAuthError({ status: 400 }), false);
			assert.strictEqual(isAuthError({ status: 429 }), false);
		});
	});

	suite('isRateLimitError', () => {
		test('returns true for 429', () => {
			assert.strictEqual(isRateLimitError({ status: 429 }), true);
		});

		test('returns false for other status codes', () => {
			assert.strictEqual(isRateLimitError({ status: 500 }), false);
		});
	});

	// ---------------------------------------------------------------
	// getRetryDelay
	// ---------------------------------------------------------------
	suite('getRetryDelay', () => {
		test('exponentially increases delay', () => {
			// With jitter disabled (deterministic check on base)
			const config: RetryConfig = { ...DEFAULT_RETRY_CONFIG, baseDelayMs: 1000, maxDelayMs: 60000 };

			// Run multiple samples, check within expected range
			for (let attempt = 0; attempt < 4; attempt++) {
				const baseExpected = 1000 * Math.pow(2, attempt);
				const minExpected = baseExpected * 0.75; // -25% jitter
				const maxExpected = baseExpected * 1.25; // +25% jitter

				const delay = getRetryDelay(attempt, config);
				assert.ok(delay >= minExpected, `attempt ${attempt}: delay ${delay} should be >= ${minExpected}`);
				assert.ok(delay <= Math.min(maxExpected, config.maxDelayMs), `attempt ${attempt}: delay ${delay} should be <= min(${maxExpected}, ${config.maxDelayMs})`);
			}
		});

		test('caps at maxDelayMs', () => {
			const config: RetryConfig = { ...DEFAULT_RETRY_CONFIG, baseDelayMs: 10000, maxDelayMs: 15000 };
			// attempt 2: 10000 * 4 = 40000, but capped at 15000
			const delay = getRetryDelay(2, config);
			assert.ok(delay <= config.maxDelayMs, `delay ${delay} should not exceed ${config.maxDelayMs}`);
		});
	});

	// ---------------------------------------------------------------
	// withRetry
	// ---------------------------------------------------------------
	suite('withRetry', () => {
		const fastConfig: RetryConfig = { maxRetries: 2, baseDelayMs: 10, maxDelayMs: 50, retryableStatusCodes: [429, 500] };

		test('returns value on first success', async () => {
			const result = await withRetry(() => Promise.resolve(42), fastConfig);
			assert.strictEqual(result, 42);
		});

		test('retries on retryable error and eventually succeeds', async () => {
			let callCount = 0;
			const result = await withRetry(async () => {
				callCount++;
				if (callCount < 3) { throw { status: 500 }; }
				return 'ok';
			}, fastConfig);

			assert.strictEqual(result, 'ok');
			assert.strictEqual(callCount, 3);
		});

		test('throws non-retryable error immediately', async () => {
			let callCount = 0;
			await assert.rejects(async () => {
				await withRetry(async () => {
					callCount++;
					throw { status: 401 };
				}, fastConfig);
			});
			assert.strictEqual(callCount, 1);
		});

		test('throws after exhausting retries', async () => {
			let callCount = 0;
			await assert.rejects(async () => {
				await withRetry(async () => {
					callCount++;
					throw { status: 500 };
				}, fastConfig);
			});
			// initial + 2 retries = 3
			assert.strictEqual(callCount, 3);
		});

		test('respects abort signal', async () => {
			const controller = new AbortController();
			controller.abort();

			await assert.rejects(
				() => withRetry(() => Promise.resolve(1), fastConfig, controller.signal),
				(err: any) => err.message === 'Aborted',
			);
		});
	});

	// ---------------------------------------------------------------
	// formatApiError
	// ---------------------------------------------------------------
	suite('formatApiError', () => {
		test('formats auth error', () => {
			assert.ok(formatApiError({ status: 401 }).includes('Authentication'));
		});

		test('formats rate limit error', () => {
			assert.ok(formatApiError({ status: 429 }).includes('Rate limit'));
		});

		test('formats overloaded error', () => {
			assert.ok(formatApiError({ status: 529 }).includes('overloaded'));
		});

		test('formats prompt too long error', () => {
			const msg = formatApiError({ status: 400, message: 'prompt is too long' });
			assert.ok(msg.includes('Prompt too long'));
		});

		test('formats generic error with message', () => {
			const msg = formatApiError({ status: 422, message: 'something went wrong' });
			assert.ok(msg.includes('something went wrong'));
		});
	});
});
