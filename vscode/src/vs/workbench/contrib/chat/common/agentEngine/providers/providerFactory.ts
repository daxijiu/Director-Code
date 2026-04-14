/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Provider Factory
 *
 * Creates LLMProvider instances based on ApiType.
 * Single entry point for provider construction.
 */

import type { ApiType, LLMProvider, ProviderOptions } from './providerTypes.js';
import { AnthropicProvider } from './anthropicProvider.js';
import { OpenAIProvider } from './openaiProvider.js';
import { GeminiProvider } from './geminiProvider.js';

/**
 * Create an LLM provider for the given API type.
 *
 * @param apiType - The type of API to use
 * @param opts - Provider options (API key, base URL, optional capabilities)
 * @returns A configured LLMProvider instance
 *
 * @example
 * ```typescript
 * const provider = createProvider('anthropic-messages', { apiKey: 'sk-ant-...' });
 * const response = await provider.createMessage({ ... });
 * ```
 */
export function createProvider(apiType: ApiType, opts: ProviderOptions): LLMProvider {
	switch (apiType) {
		case 'anthropic-messages':
			return new AnthropicProvider(opts);
		case 'openai-completions':
			return new OpenAIProvider(opts);
		case 'gemini-generative':
			return new GeminiProvider(opts);
		default: {
			// Exhaustiveness check — compile error if a new ApiType is added without a case
			const _exhaustive: never = apiType;
			throw new Error(`Unknown API type: ${_exhaustive}`);
		}
	}
}

// Re-export for convenience
export { AnthropicProvider } from './anthropicProvider.js';
export { OpenAIProvider } from './openaiProvider.js';
export { GeminiProvider } from './geminiProvider.js';
export { AbstractDirectorCodeProvider, getDefaultCapabilities } from './abstractProvider.js';
export type {
	ApiType,
	LLMProvider,
	ProviderOptions,
	ProviderCapabilities,
	ProviderConfig,
	CreateMessageParams,
	CreateMessageResponse,
	StreamEvent,
	TokenUsage,
	NormalizedMessageParam,
	NormalizedContentBlock,
	NormalizedTool,
	NormalizedResponseBlock,
} from './providerTypes.js';
