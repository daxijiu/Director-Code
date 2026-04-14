/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Agent Engine Type Definitions
 *
 * Core types for the Agent Engine, ported from open-agent-sdk-typescript.
 * These types define the internal message protocol, tool interfaces,
 * configuration, and streaming event types.
 */

import type { LLMProvider, NormalizedContentBlock, TokenUsage } from './providers/providerTypes.js';

// --------------------------------------------------------------------------
// Content Block Types
// --------------------------------------------------------------------------

export type ContentBlock =
	| { readonly type: 'text'; readonly text: string }
	| { readonly type: 'tool_use'; readonly id: string; readonly name: string; readonly input: any }
	| { readonly type: 'thinking'; readonly thinking: string };

// --------------------------------------------------------------------------
// Tool Types
// --------------------------------------------------------------------------

export interface AgentToolDefinition {
	readonly name: string;
	readonly description: string;
	readonly inputSchema: {
		readonly type: 'object';
		readonly properties: Record<string, any>;
		readonly required?: readonly string[];
	};
	/** Whether this tool only reads data (can be run concurrently). */
	readonly isReadOnly?: boolean;
}

export interface ToolResult {
	readonly type: 'tool_result';
	readonly tool_use_id: string;
	readonly content: string;
	readonly is_error?: boolean;
}

export interface ToolUseBlock {
	readonly type: 'tool_use';
	readonly id: string;
	readonly name: string;
	readonly input: any;
}

// --------------------------------------------------------------------------
// Permission Types
// --------------------------------------------------------------------------

export type PermissionBehavior = 'allow' | 'deny';

export interface CanUseToolResult {
	readonly behavior: PermissionBehavior;
	readonly updatedInput?: unknown;
	readonly message?: string;
}

export type CanUseToolFn = (
	toolName: string,
	input: unknown,
) => Promise<CanUseToolResult>;

// --------------------------------------------------------------------------
// Hook Types
// --------------------------------------------------------------------------

export type AgentHookEvent =
	| 'PreToolUse'
	| 'PostToolUse'
	| 'PostToolUseFailure'
	| 'PreCompact'
	| 'PostCompact';

export interface AgentHookContext {
	readonly toolName?: string;
	readonly toolInput?: unknown;
	readonly toolResult?: string;
	readonly error?: Error;
}

export interface AgentHookResult {
	readonly behavior?: PermissionBehavior;
}

export type AgentHookFn = (event: AgentHookEvent, context: AgentHookContext) => Promise<AgentHookResult | void>;

export interface IAgentHookRegistry {
	register(event: AgentHookEvent, hook: AgentHookFn): void;
	execute(event: AgentHookEvent, context: AgentHookContext): Promise<AgentHookResult[]>;
}

// --------------------------------------------------------------------------
// Agent Engine Configuration
// --------------------------------------------------------------------------

export interface AgentEngineConfig {
	readonly cwd: string;
	readonly model: string;
	readonly provider: LLMProvider;
	readonly tools: AgentToolDefinition[];
	readonly systemPrompt?: string;
	readonly appendSystemPrompt?: string;
	readonly maxTurns: number;
	readonly maxBudgetUsd?: number;
	readonly maxTokens: number;
	/** Override context window size for auto-compact. 0 = use model default. */
	readonly maxInputTokens?: number;
	readonly thinking?: { readonly type: string; readonly budget_tokens?: number };
	readonly canUseTool?: CanUseToolFn;
	readonly abortSignal?: AbortSignal;
	readonly hookRegistry?: IAgentHookRegistry;
}

// --------------------------------------------------------------------------
// Agent Engine Events (streaming output)
// --------------------------------------------------------------------------

export type AgentEvent =
	| AgentAssistantEvent
	| AgentTextDeltaEvent
	| AgentThinkingDeltaEvent
	| AgentToolUseEvent
	| AgentToolResultEvent
	| AgentSystemEvent
	| AgentResultEvent;

export interface AgentAssistantEvent {
	readonly type: 'assistant';
	readonly message: {
		readonly role: 'assistant';
		readonly content: ContentBlock[];
	};
}

/** Streaming text chunk — emitted as LLM generates text tokens. */
export interface AgentTextDeltaEvent {
	readonly type: 'text_delta';
	readonly text: string;
}

/** Streaming thinking chunk — emitted as LLM generates thinking tokens. */
export interface AgentThinkingDeltaEvent {
	readonly type: 'thinking_delta';
	readonly thinking: string;
}

export interface AgentToolUseEvent {
	readonly type: 'tool_use';
	readonly id: string;
	readonly name: string;
	readonly input: any;
}

export interface AgentToolResultEvent {
	readonly type: 'tool_result';
	readonly tool_use_id: string;
	readonly tool_name: string;
	readonly content: string;
	readonly is_error?: boolean;
}

export interface AgentSystemEvent {
	readonly type: 'system';
	readonly subtype: 'init' | 'compact_boundary' | 'status';
	readonly model?: string;
	readonly tools?: string[];
	readonly message?: string;
}

export interface AgentResultEvent {
	readonly type: 'result';
	readonly subtype: 'success' | 'error' | 'error_max_turns' | 'error_max_budget_usd';
	readonly usage: TokenUsage;
	readonly cost: number;
	readonly numTurns: number;
	readonly error?: string;
}

// --------------------------------------------------------------------------
// Auto-Compact State
// --------------------------------------------------------------------------

export interface AutoCompactState {
	compacted: boolean;
	turnCounter: number;
	consecutiveFailures: number;
}

// --------------------------------------------------------------------------
// Mutable message param (internal use in engine)
// --------------------------------------------------------------------------

export interface MutableMessageParam {
	role: 'user' | 'assistant';
	content: string | NormalizedContentBlock[];
}
