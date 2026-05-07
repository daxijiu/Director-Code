/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Abstract base class for all Director-Code LLM providers.
 *
 * Extracts common patterns shared across Anthropic, OpenAI, and Gemini:
 *   - Constructor with apiKey + baseURL + capabilities
 *   - HTTP request with unified error handling
 *   - SSE stream line reader
 *   - Provider metadata (name, default capabilities)
 *
 * Subclasses implement the API-specific request building, response parsing,
 * and SSE event interpretation.
 */

import type {
	ApiType,
	LLMProvider,
	CreateMessageParams,
	CreateMessageResponse,
	StreamEvent,
	ProviderConfig,
	ProviderCapabilities,
	ProviderAuth,
} from './providerTypes.js';

// ============================================================================
// Default capabilities per API type
// ============================================================================

const DEFAULT_CAPABILITIES: Record<ApiType, ProviderCapabilities> = {
	'anthropic-messages': {
		vision: true,
		toolCalling: true,
		streaming: true,
		thinking: true,
		agentMode: true,
	},
	'openai-completions': {
		vision: true,
		toolCalling: true,
		streaming: true,
		thinking: false,
		agentMode: true,
	},
	'openai-codex': {
		vision: false,
		toolCalling: true,
		streaming: true,
		thinking: true,
		agentMode: true,
	},
	'gemini-generative': {
		vision: true,
		toolCalling: true,
		streaming: true,
		thinking: true,
		agentMode: true,
	},
};

const MAX_SSE_BUFFER_SIZE = 1024 * 1024;

export function buildProviderUrl(baseURL: string, path: string): string {
	const base = baseURL.replace(/\/+$/, '');
	const normalizedPath = path.startsWith('/') ? path : `/${path}`;
	if (base.endsWith('/v1') && normalizedPath.startsWith('/v1/')) {
		return `${base}${normalizedPath.slice('/v1'.length)}`;
	}
	if (base.endsWith('/v1') && normalizedPath === '/v1') {
		return base;
	}
	return `${base}${normalizedPath}`;
}

/**
 * Get default capabilities for a given API type.
 */
export function getDefaultCapabilities(apiType: ApiType): ProviderCapabilities {
	return DEFAULT_CAPABILITIES[apiType] ?? {
		toolCalling: true,
		streaming: true,
		agentMode: true,
	};
}

// ============================================================================
// Abstract Provider Base
// ============================================================================

export abstract class AbstractDirectorCodeProvider implements LLMProvider {
	abstract readonly apiType: ApiType;

	readonly capabilities: ProviderCapabilities;
	protected readonly auth: ProviderAuth;
	protected readonly baseURL: string;

	constructor(opts: ProviderConfig) {
		this.auth = opts.auth;
		this.baseURL = (opts.baseURL || this.getDefaultBaseURL()).replace(/\/$/, '');
		this.capabilities = opts.capabilities ?? getDefaultCapabilities(this.getApiType());
	}

	/** Extract the credential string for HTTP headers, regardless of auth kind. */
	protected getAuthValue(): string {
		return this.auth.kind === 'api-key' ? this.auth.value : this.auth.accessToken;
	}

	/**
	 * The API type this provider implements.
	 * Called during constructor (before apiType field is set).
	 */
	protected abstract getApiType(): ApiType;

	/** Default base URL when none is provided. */
	protected abstract getDefaultBaseURL(): string;

	/** Human-readable provider name for error messages. */
	protected abstract getProviderName(): string;

	abstract createMessage(params: CreateMessageParams): Promise<CreateMessageResponse>;
	abstract createMessageStream(params: CreateMessageParams): AsyncGenerator<StreamEvent>;

	// ========================================================================
	// Common HTTP helpers
	// ========================================================================

	/**
	 * Execute a fetch request and throw a structured error on non-OK response.
	 * The thrown error has a `.status` property for retry logic.
	 */
	protected async fetchWithErrorHandling(url: string, init: RequestInit): Promise<Response> {
		const response = await fetch(url, init);
		if (!response.ok) {
			const errBody = await response.text().catch(() => '');
			const err: any = new Error(
				`${this.getProviderName()} API error: ${response.status} ${response.statusText}: ${errBody}`,
			);
			err.status = response.status;
			throw err;
		}
		return response;
	}

	protected buildUrl(path: string, baseURL: string = this.baseURL): string {
		return buildProviderUrl(baseURL, path);
	}

	// ========================================================================
	// Common SSE stream infrastructure
	// ========================================================================

	/**
	 * Low-level SSE line reader. Yields each `data: <payload>` line as a raw
	 * string. Handles buffering of incomplete lines and skips non-data lines.
	 *
	 * Subclasses build on top of this to parse provider-specific JSON events.
	 */
	protected async *readSSELines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
		const reader = body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					buffer += decoder.decode();
					break;
				}

				buffer += decoder.decode(value, { stream: true });
				if (buffer.length > MAX_SSE_BUFFER_SIZE) {
					console.warn(`[Director-Code] SSE buffer exceeded ${MAX_SSE_BUFFER_SIZE} bytes; truncating buffered data.`);
					const tailSize = MAX_SSE_BUFFER_SIZE - 'data: '.length;
					buffer = buffer.includes('data:')
						? `data: ${buffer.slice(-tailSize)}`
						: buffer.slice(-MAX_SSE_BUFFER_SIZE);
				}

				const lines = buffer.split('\n');
				buffer = lines.pop()!;

				yield* this.extractSSEDataLines(lines);
			}

			if (buffer.trim()) {
				yield* this.extractSSEDataLines([buffer]);
			}
		} finally {
			reader.releaseLock();
		}
	}

	private *extractSSEDataLines(lines: string[]): Generator<string> {
		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed.startsWith('data:')) { continue; }
			const data = trimmed.slice('data:'.length).trim();
			if (!data) { continue; }
			yield data;
		}
	}

	/**
	 * Parse an SSE line as JSON, returning undefined on parse failure.
	 * Subclasses use this to safely parse each SSE data line.
	 */
	protected parseSSEData<T>(data: string): T | undefined {
		try {
			return JSON.parse(data) as T;
		} catch {
			return undefined;
		}
	}
}
