/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const DEFAULT_FETCH_TIMEOUT_MS = 15_000;
const DEFAULT_ERROR_BODY_LIMIT = 200;

export interface IFetchWithTimeoutOptions {
	readonly timeoutMs?: number;
}

export interface IFetchJsonResult<T> {
	readonly response: Response;
	readonly data: T;
}

export class FetchTimeoutError extends Error {
	readonly timeoutMs: number;

	constructor(timeoutMs: number) {
		super(`Fetch timed out after ${timeoutMs}ms`);
		this.name = 'FetchTimeoutError';
		this.timeoutMs = timeoutMs;
	}
}

export class FetchHttpError extends Error {
	readonly status: number;
	readonly statusText: string;
	readonly bodySnippet: string;

	constructor(response: Response, bodySnippet: string) {
		super(formatHttpErrorMessage(response.status, bodySnippet));
		this.name = 'FetchHttpError';
		this.status = response.status;
		this.statusText = response.statusText;
		this.bodySnippet = bodySnippet;
	}
}

export class FetchJsonParseError extends Error {
	readonly bodySnippet: string;

	constructor(bodySnippet: string) {
		super(`Failed to parse JSON response: ${bodySnippet}`);
		this.name = 'FetchJsonParseError';
		this.bodySnippet = bodySnippet;
	}
}

export async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, options: IFetchWithTimeoutOptions = {}): Promise<Response> {
	const timeoutMs = Math.max(0, options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS);
	const controller = new AbortController();
	const upstreamSignal = init.signal;
	let didTimeout = false;

	const abortFromUpstream = () => controller.abort();
	if (upstreamSignal?.aborted) {
		abortFromUpstream();
	} else {
		upstreamSignal?.addEventListener('abort', abortFromUpstream, { once: true });
	}

	const timer = setTimeout(() => {
		didTimeout = true;
		controller.abort();
	}, timeoutMs);

	const { signal: _signal, ...fetchInit } = init;
	try {
		return await fetch(input, { ...fetchInit, signal: controller.signal });
	} catch (err) {
		if (didTimeout) {
			throw new FetchTimeoutError(timeoutMs);
		}
		throw err;
	} finally {
		clearTimeout(timer);
		upstreamSignal?.removeEventListener('abort', abortFromUpstream);
	}
}

export async function fetchJsonWithTimeout<T>(input: RequestInfo | URL, init: RequestInit = {}, options: IFetchWithTimeoutOptions = {}): Promise<IFetchJsonResult<T>> {
	const response = await fetchWithTimeout(input, init, options);
	if (!response.ok) {
		throw new FetchHttpError(response, await readResponseSnippet(response));
	}

	const body = await response.text();
	try {
		return { response, data: JSON.parse(body) as T };
	} catch {
		throw new FetchJsonParseError(limitBodySnippet(body));
	}
}

export async function getResponseErrorMessage(response: Response, limit = DEFAULT_ERROR_BODY_LIMIT): Promise<string> {
	return formatHttpErrorMessage(response.status, await readResponseSnippet(response, limit));
}

function formatHttpErrorMessage(status: number, bodySnippet: string): string {
	return `HTTP ${status}: ${bodySnippet}`;
}

async function readResponseSnippet(response: Response, limit = DEFAULT_ERROR_BODY_LIMIT): Promise<string> {
	const body = await response.text().catch(() => '');
	return limitBodySnippet(body, limit);
}

function limitBodySnippet(body: string, limit = DEFAULT_ERROR_BODY_LIMIT): string {
	return body.slice(0, limit);
}
