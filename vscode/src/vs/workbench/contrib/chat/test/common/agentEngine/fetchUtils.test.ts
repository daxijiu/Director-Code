/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import {
	FetchHttpError,
	FetchJsonParseError,
	FetchTimeoutError,
	fetchJsonWithTimeout,
	fetchWithTimeout,
	getResponseErrorMessage,
} from '../../../common/agentEngine/fetchUtils.js';

suite('AgentEngine - fetchUtils', () => {
	let originalFetch: typeof globalThis.fetch;

	setup(() => {
		originalFetch = globalThis.fetch;
	});

	teardown(() => {
		globalThis.fetch = originalFetch;
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('fetchWithTimeout aborts requests after the configured timeout', async () => {
		globalThis.fetch = ((_url: string | URL | Request, init?: RequestInit) => {
			return new Promise<Response>((_resolve, reject) => {
				init?.signal?.addEventListener('abort', () => {
					const err = new Error('aborted');
					err.name = 'AbortError';
					reject(err);
				});
			});
		}) as any;

		await assert.rejects(
			() => fetchWithTimeout('https://example.test/slow', {}, { timeoutMs: 1 }),
			(err: any) => err instanceof FetchTimeoutError && err.timeoutMs === 1,
		);
	});

	test('fetchWithTimeout forwards caller cancellation without rewriting it as timeout', async () => {
		const controller = new AbortController();
		globalThis.fetch = ((_url: string | URL | Request, init?: RequestInit) => {
			return new Promise<Response>((_resolve, reject) => {
				init?.signal?.addEventListener('abort', () => {
					const err = new Error('caller aborted');
					err.name = 'AbortError';
					reject(err);
				});
			});
		}) as any;

		const pending = fetchWithTimeout('https://example.test/cancel', { signal: controller.signal }, { timeoutMs: 10_000 });
		controller.abort();

		await assert.rejects(
			() => pending,
			(err: any) => err.name === 'AbortError' && !(err instanceof FetchTimeoutError),
		);
	});

	test('fetchJsonWithTimeout parses successful JSON responses', async () => {
		globalThis.fetch = (() => Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }))) as any;

		const result = await fetchJsonWithTimeout<{ ok: boolean }>('https://example.test/json');

		assert.strictEqual(result.data.ok, true);
		assert.strictEqual(result.response.status, 200);
	});

	test('fetchJsonWithTimeout reports malformed JSON with a body snippet', async () => {
		globalThis.fetch = (() => Promise.resolve(new Response('not-json', { status: 200 }))) as any;

		await assert.rejects(
			() => fetchJsonWithTimeout('https://example.test/bad-json'),
			(err: any) => err instanceof FetchJsonParseError && err.bodySnippet === 'not-json',
		);
	});

	test('fetchJsonWithTimeout reports non-2xx responses with consistent HTTP format', async () => {
		globalThis.fetch = (() => Promise.resolve(new Response('rate limited', { status: 429, statusText: 'Too Many Requests' }))) as any;

		await assert.rejects(
			() => fetchJsonWithTimeout('https://example.test/rate-limit'),
			(err: any) => err instanceof FetchHttpError
				&& err.status === 429
				&& err.bodySnippet === 'rate limited'
				&& err.message === 'HTTP 429: rate limited',
		);
	});

	test('getResponseErrorMessage matches helper HTTP error format', async () => {
		const message = await getResponseErrorMessage(new Response('server exploded', { status: 500 }));

		assert.strictEqual(message, 'HTTP 500: server exploded');
	});
});
