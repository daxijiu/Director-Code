/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Retry Logic with Exponential Backoff
 *
 * Handles API retries for rate limits, overloaded servers,
 * and transient failures.
 *
 * Ported from open-agent-sdk-typescript/src/utils/retry.ts
 */

// [Director-Code] A2: sleep that can be cancelled by AbortSignal
function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
	if (signal?.aborted) {
		return Promise.reject(new Error('Aborted'));
	}
	return new Promise<void>((resolve, reject) => {
		const timer = setTimeout(resolve, ms);
		if (signal) {
			const onAbort = () => {
				clearTimeout(timer);
				reject(new Error('Aborted'));
			};
			signal.addEventListener('abort', onAbort, { once: true });
		}
	});
}

// --------------------------------------------------------------------------
// Configuration
// --------------------------------------------------------------------------

export interface RetryConfig {
	readonly maxRetries: number;
	readonly baseDelayMs: number;
	readonly maxDelayMs: number;
	readonly retryableStatusCodes: readonly number[];
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
	maxRetries: 3,
	baseDelayMs: 2000,
	maxDelayMs: 30000,
	retryableStatusCodes: [429, 500, 502, 503, 529],
};

// --------------------------------------------------------------------------
// Error Classification
// --------------------------------------------------------------------------

export function isRetryableError(err: any, config: RetryConfig = DEFAULT_RETRY_CONFIG): boolean {
	if (err?.status && config.retryableStatusCodes.includes(err.status)) {
		return true;
	}
	// Network errors
	if (err?.code === 'ECONNRESET' || err?.code === 'ETIMEDOUT' || err?.code === 'ECONNREFUSED') {
		return true;
	}
	// API overloaded
	if (err?.error?.type === 'overloaded_error') {
		return true;
	}
	return false;
}

export function isPromptTooLongError(err: any): boolean {
	if (err?.status === 400) {
		const message = err?.error?.error?.message || err?.message || '';
		return message.includes('prompt is too long') ||
			message.includes('max_tokens') ||
			message.includes('context length');
	}
	return false;
}

export function isAuthError(err: any): boolean {
	return err?.status === 401 || err?.status === 403;
}

export function isRateLimitError(err: any): boolean {
	return err?.status === 429;
}

// --------------------------------------------------------------------------
// Retry Delay
// --------------------------------------------------------------------------

export function getRetryDelay(attempt: number, config: RetryConfig = DEFAULT_RETRY_CONFIG): number {
	const delay = config.baseDelayMs * Math.pow(2, attempt);
	// Add jitter (±25%)
	const jitter = delay * 0.25 * (Math.random() * 2 - 1);
	return Math.min(delay + jitter, config.maxDelayMs);
}

// --------------------------------------------------------------------------
// Retry Execution
// --------------------------------------------------------------------------

export async function withRetry<T>(
	fn: () => Promise<T>,
	config: RetryConfig = DEFAULT_RETRY_CONFIG,
	abortSignal?: AbortSignal,
): Promise<T> {
	let lastError: any;

	for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
		if (abortSignal?.aborted) {
			throw new Error('Aborted');
		}

		try {
			return await fn();
		} catch (err: any) {
			lastError = err;

			if (!isRetryableError(err, config)) {
				throw err;
			}

			if (attempt === config.maxRetries) {
				throw err;
			}

			// [Director-Code] A2: cancellable sleep during retry backoff
			const delay = getRetryDelay(attempt, config);
			await abortableSleep(delay, abortSignal);
		}
	}

	throw lastError;
}

// --------------------------------------------------------------------------
// Error Formatting
// --------------------------------------------------------------------------

export function formatApiError(err: any): string {
	if (isAuthError(err)) {
		return 'Authentication failed. Check your API key.';
	}
	if (isRateLimitError(err)) {
		return 'Rate limit exceeded. Please retry after a short wait.';
	}
	if (err?.status === 529) {
		return 'API overloaded. Please retry later.';
	}
	if (isPromptTooLongError(err)) {
		return 'Prompt too long. Auto-compacting conversation...';
	}
	return `API error: ${err.message || err}`;
}
