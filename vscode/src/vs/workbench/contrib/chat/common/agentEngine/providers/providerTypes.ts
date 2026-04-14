/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * LLM Provider Abstraction Types
 *
 * Defines a provider interface that normalizes API differences between
 * Anthropic Messages API and OpenAI Chat Completions API.
 *
 * Internally the Agent Engine uses Anthropic-like message format as the
 * canonical representation. Providers convert to/from their native API format.
 *
 * Ported from open-agent-sdk-typescript/src/providers/types.ts
 */

// --------------------------------------------------------------------------
// API Type
// --------------------------------------------------------------------------

export type ApiType = 'anthropic-messages' | 'openai-completions' | 'gemini-generative';

// --------------------------------------------------------------------------
// Normalized Request
// --------------------------------------------------------------------------

export interface CreateMessageParams {
	readonly model: string;
	readonly maxTokens: number;
	readonly system: string;
	readonly messages: readonly NormalizedMessageParam[];
	readonly tools?: readonly NormalizedTool[];
	readonly thinking?: { readonly type: string; readonly budget_tokens?: number };
	readonly abortSignal?: AbortSignal;
}

/**
 * Common options for constructing an LLM provider.
 */
export interface ProviderOptions {
	readonly apiKey: string;
	readonly baseURL?: string;
}

/**
 * Capabilities that a provider/model combination supports.
 * Used by the agent engine to decide which features to enable.
 */
export interface ProviderCapabilities {
	readonly vision?: boolean;
	readonly toolCalling?: boolean;
	readonly streaming?: boolean;
	readonly thinking?: boolean;
	readonly agentMode?: boolean;
}

/**
 * Extended provider configuration including capabilities override.
 */
export interface ProviderConfig extends ProviderOptions {
	readonly capabilities?: ProviderCapabilities;
}

/**
 * Normalized message format (Anthropic-like).
 * This is the internal representation used throughout the Agent Engine.
 */
export interface NormalizedMessageParam {
	readonly role: 'user' | 'assistant';
	readonly content: string | NormalizedContentBlock[];
}

export type NormalizedContentBlock =
	| { readonly type: 'text'; readonly text: string }
	| { readonly type: 'tool_use'; readonly id: string; readonly name: string; readonly input: any }
	| { readonly type: 'tool_result'; readonly tool_use_id: string; readonly content: string; readonly is_error?: boolean }
	| { readonly type: 'image'; readonly source: any }
	| { readonly type: 'thinking'; readonly thinking: string };

export interface NormalizedTool {
	readonly name: string;
	readonly description: string;
	readonly input_schema: {
		readonly type: 'object';
		readonly properties: Record<string, any>;
		readonly required?: readonly string[];
	};
}

// --------------------------------------------------------------------------
// Normalized Response
// --------------------------------------------------------------------------

export interface CreateMessageResponse {
	readonly content: NormalizedResponseBlock[];
	readonly stopReason: 'end_turn' | 'max_tokens' | 'tool_use' | string;
	readonly usage: TokenUsage;
}

export type NormalizedResponseBlock =
	| { readonly type: 'text'; readonly text: string }
	| { readonly type: 'tool_use'; readonly id: string; readonly name: string; readonly input: any }
	| { readonly type: 'thinking'; readonly thinking: string };

// --------------------------------------------------------------------------
// Token Usage
// --------------------------------------------------------------------------

export interface TokenUsage {
	readonly input_tokens: number;
	readonly output_tokens: number;
	readonly cache_creation_input_tokens?: number;
	readonly cache_read_input_tokens?: number;
}

// --------------------------------------------------------------------------
// Stream Events (for streaming providers)
// --------------------------------------------------------------------------

export type StreamEvent =
	| { readonly type: 'text'; readonly text: string }
	| { readonly type: 'tool_use_start'; readonly id: string; readonly name: string }
	| { readonly type: 'tool_input_delta'; readonly json: string }
	| { readonly type: 'tool_call_delta'; readonly index: number; readonly id?: string; readonly name?: string; readonly arguments?: string }
	| { readonly type: 'thinking'; readonly thinking: string }
	| { readonly type: 'message_complete'; readonly usage: TokenUsage; readonly stopReason: string };

// --------------------------------------------------------------------------
// Provider Interface
// --------------------------------------------------------------------------

export interface LLMProvider {
	/** The API type this provider implements. */
	readonly apiType: ApiType;

	/** Send a message and get a complete response (used for compact, etc.). */
	createMessage(params: CreateMessageParams): Promise<CreateMessageResponse>;

	/** Send a message and stream the response (used for main request path). */
	createMessageStream?(params: CreateMessageParams): AsyncGenerator<StreamEvent>;
}
