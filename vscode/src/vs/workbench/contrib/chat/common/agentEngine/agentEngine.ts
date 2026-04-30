/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * AgentEngine - Core agentic loop
 *
 * Manages the full conversation lifecycle:
 * 1. Take user prompt
 * 2. Build system prompt with context
 * 3. Call LLM API with tools (via provider abstraction)
 * 4. Stream response
 * 5. Execute tool calls (concurrent for read-only, serial for mutations)
 * 6. Send results back, repeat until done
 * 7. Auto-compact when context exceeds threshold
 * 8. Retry with exponential backoff on transient errors
 *
 * Ported from open-agent-sdk-typescript/src/engine.ts
 * Adapted for VS Code integration: uses AgentEvent instead of SDKMessage,
 * delegates tool execution to ToolBridge, generates UUIDs via VS Code API.
 */

import { generateUuid } from '../../../../../base/common/uuid.js';
import type {
	AgentEngineConfig,
	AgentEvent,
	AgentToolDefinition,
	AutoCompactState,
	MutableMessageParam,
	ToolResult,
	ToolUseBlock,
} from './agentEngineTypes.js';
import type {
	CreateMessageResponse,
	LLMProvider,
	NormalizedMessageParam,
	NormalizedTool,
	NormalizedResponseBlock,
	TokenUsage,
	CreateMessageParams,
} from './providers/providerTypes.js';
import { estimateCost } from './tokens.js';
import {
	shouldAutoCompact,
	compactConversation,
	microCompactMessages,
	createAutoCompactState,
} from './compact.js';
import { withRetry, isPromptTooLongError } from './retry.js';

// ============================================================================
// Tool format conversion
// ============================================================================

function toProviderTool(tool: AgentToolDefinition): NormalizedTool {
	return {
		name: tool.name,
		description: tool.description,
		input_schema: tool.inputSchema,
	};
}

// [Director-Code] A3: resolve tool index for multi-tool streaming aggregation
function resolveToolIndex(event: { index?: number }, pendingTools: Map<number, unknown>): number {
	if (typeof event.index === 'number') {
		return event.index;
	}
	if (pendingTools.size <= 1) {
		return pendingTools.size === 0 ? 0 : [...pendingTools.keys()][0];
	}
	throw new Error('Missing tool index in multi-tool response');
}

// ============================================================================
// System Prompt Builder
// ============================================================================

function buildSystemPrompt(config: AgentEngineConfig): string {
	if (config.systemPrompt) {
		const base = config.systemPrompt;
		return config.appendSystemPrompt
			? base + '\n\n' + config.appendSystemPrompt
			: base;
	}

	const parts: string[] = [];

	parts.push(
		'You are an expert AI coding assistant with access to tools. Your goal is to help the user accomplish their coding tasks efficiently and correctly.',
		'',
		'## Guidelines',
		'- Use tools proactively when they would help you understand the codebase or accomplish the task.',
		'- Read files before modifying them to understand the existing code.',
		'- Explain your reasoning briefly before taking actions.',
		'- If a tool call fails, analyze the error and try a different approach.',
		'- When writing code, follow the existing code style and conventions in the project.',
		'- Be concise in your responses — focus on what matters.',
	);

	// Working directory
	parts.push(`\n## Working Directory\n${config.cwd}`);

	// List available tools
	if (config.tools.length > 0) {
		parts.push('\n## Available Tools\n');
		for (const tool of config.tools) {
			parts.push(`- **${tool.name}**: ${tool.description}`);
		}
	}

	if (config.appendSystemPrompt) {
		parts.push('\n' + config.appendSystemPrompt);
	}

	return parts.join('\n');
}

// ============================================================================
// AgentEngine
// ============================================================================

export interface IToolExecutor {
	/**
	 * Execute a tool by name with given input.
	 * Returns the tool result as a string.
	 */
	invokeTool(name: string, input: unknown): Promise<string>;

	/**
	 * Check if a tool is read-only (can run concurrently).
	 */
	isReadOnlyTool(name: string): boolean;
}

export class AgentEngine {
	private readonly provider: LLMProvider;
	private messages: MutableMessageParam[] = [];
	private totalUsage: { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number } = { input_tokens: 0, output_tokens: 0 };
	private totalCost = 0;
	private turnCount = 0;
	private compactState: AutoCompactState;
	private readonly sessionId: string;
	private apiTimeMs = 0;
	private _jsonRetryCount: Map<string, number> | undefined; // [Director-Code] A3: per-tool JSON retry tracking

	constructor(
		private readonly config: AgentEngineConfig,
		private readonly toolExecutor?: IToolExecutor,
		initialMessages?: readonly NormalizedMessageParam[],
	) {
		this.provider = config.provider;
		this.compactState = createAutoCompactState();
		this.sessionId = generateUuid();

		// Pre-populate conversation history (e.g., from previous chat turns)
		if (initialMessages && initialMessages.length > 0) {
			this.messages = initialMessages.map(m => ({ role: m.role, content: m.content } as MutableMessageParam));
		}
	}

	/**
	 * Submit a user message and run the agentic loop.
	 * Yields AgentEvent as the agent works.
	 */
	async *submitMessage(userMessage: string): AsyncGenerator<AgentEvent> {
		// Add user message
		this.messages.push({ role: 'user', content: userMessage });

		// Build tool definitions for provider
		const tools = this.config.tools.map(toProviderTool);

		// Build system prompt
		const systemPrompt = buildSystemPrompt(this.config);

		// Emit init system message
		yield {
			type: 'system',
			subtype: 'init',
			model: this.config.model,
			tools: this.config.tools.map(t => t.name),
		};

		// Agentic loop
		let turnsRemaining = this.config.maxTurns;
		let budgetExceeded = false;
		let maxOutputRecoveryAttempts = 0;
		const MAX_OUTPUT_RECOVERY = 3;

		// [Director-Code] A2: track last complete checkpoint for cancellation cleanup
		let lastCompleteTurnEnd = this.messages.length;

		try {
		while (turnsRemaining > 0) {
			if (this.config.abortSignal?.aborted) { break; }

			// Check budget
			if (this.config.maxBudgetUsd && this.totalCost >= this.config.maxBudgetUsd) {
				budgetExceeded = true;
				break;
			}

			// Auto-compact if context is too large
			if (shouldAutoCompact(this.messages as any[], this.config.model, this.compactState, this.config.maxInputTokens)) {
				if (this.config.hookRegistry) {
					await this.config.hookRegistry.execute('PreCompact', { toolName: 'compact' });
				}
				try {
					const result = await compactConversation(
						this.provider,
						this.config.model,
						this.messages as any[],
						this.compactState,
					);
					this.messages = result.compactedMessages as MutableMessageParam[];
					this.compactState = result.state;

					yield { type: 'system', subtype: 'compact_boundary', message: 'Conversation compacted' };

					if (this.config.hookRegistry) {
						await this.config.hookRegistry.execute('PostCompact', { toolName: 'compact' });
					}
				} catch {
					// Continue with uncompacted messages
				}
			}

			// Micro-compact: truncate large tool results
			const apiMessages = microCompactMessages(this.messages as any[]) as NormalizedMessageParam[];

			this.turnCount++;
			turnsRemaining--;

			// Make API call — streaming first, blocking fallback on retry
			let response: CreateMessageResponse;
			const apiStart = performance.now();
			const requestParams: CreateMessageParams = {
				model: this.config.model,
				maxTokens: this.config.maxTokens,
				system: systemPrompt,
				messages: apiMessages,
				tools: tools.length > 0 ? tools : undefined,
				thinking:
					this.config.thinking?.type === 'enabled' && this.config.thinking.budget_tokens
						? { type: 'enabled', budget_tokens: this.config.thinking.budget_tokens }
						: undefined,
				abortSignal: this.config.abortSignal, // [Director-Code] A2: pass signal to provider fetch
			};

			let streamingUsed = false;
			try {
				if (this.provider.createMessageStream) {
					// [Director-Code] A3: streaming path with index-based multi-tool aggregation
					streamingUsed = true;
					const contentBlocks: NormalizedResponseBlock[] = [];
					let currentTextBlock: { type: 'text'; text: string } | undefined;
					const pendingTools = new Map<number, { id: string; name: string; input: string }>();
					let streamUsage: TokenUsage = { input_tokens: 0, output_tokens: 0 };
					let streamStopReason = 'end_turn';

					for await (const event of this.provider.createMessageStream(requestParams)) {
						if (this.config.abortSignal?.aborted) { break; }

						switch (event.type) {
							case 'text':
								if (!currentTextBlock) {
									currentTextBlock = { type: 'text', text: '' };
								}
								currentTextBlock.text += event.text;
								yield { type: 'text_delta', text: event.text } as AgentEvent;
								break;

							case 'thinking':
								yield { type: 'thinking_delta', thinking: event.thinking } as AgentEvent;
								break;

							case 'tool_use_start': {
								if (currentTextBlock) {
									contentBlocks.push(currentTextBlock);
									currentTextBlock = undefined;
								}
								const idx = resolveToolIndex(event, pendingTools);
								pendingTools.set(idx, { id: event.id, name: event.name, input: '' });
								break;
							}

							case 'tool_input_delta': {
								const idx = resolveToolIndex(event, pendingTools);
								const tool = pendingTools.get(idx);
								if (tool) { tool.input += event.json; }
								break;
							}

							case 'tool_call_delta': {
								const idx = resolveToolIndex(event, pendingTools);
								const tool = pendingTools.get(idx) ?? { id: '', name: '', input: '' };
								if (event.id && !tool.id) { tool.id = event.id; }
								if (event.name && !tool.name) { tool.name = event.name; }
								if (event.arguments) { tool.input += event.arguments; }
								pendingTools.set(idx, tool);
								break;
							}

							case 'message_complete':
								streamUsage = event.usage;
								streamStopReason = event.stopReason;
								break;
						}
					}

					// Finalize remaining blocks
					if (currentTextBlock) { contentBlocks.push(currentTextBlock); }
					for (const [, tool] of pendingTools) {
						contentBlocks.push(this.finalizeToolBlock(tool));
					}

					response = { content: contentBlocks, stopReason: streamStopReason, usage: streamUsage };
				} else {
					// Non-streaming fallback
					response = await withRetry(
						async () => this.provider.createMessage(requestParams),
						undefined,
						this.config.abortSignal,
					);
				}
			} catch (err: any) {
				// On streaming error, try non-streaming retry
				if (streamingUsed) {
					try {
						response = await withRetry(
							async () => this.provider.createMessage(requestParams),
							undefined,
							this.config.abortSignal,
						);
					} catch (retryErr: any) {
						// Handle prompt-too-long by compacting
						if (isPromptTooLongError(retryErr) && !this.compactState.compacted) {
							try {
								const result = await compactConversation(
									this.provider,
									this.config.model,
									this.messages as any[],
									this.compactState,
								);
								this.messages = result.compactedMessages as MutableMessageParam[];
								this.compactState = result.state;
								turnsRemaining++;
								this.turnCount--;
								continue;
							} catch { /* Can't compact */ }
						}

						yield {
							type: 'result',
							subtype: 'error',
							usage: this.totalUsage,
							cost: this.totalCost,
							numTurns: this.turnCount,
							error: retryErr.message || String(retryErr),
						};
						return;
					}
				} else {
					// Handle prompt-too-long by compacting
					if (isPromptTooLongError(err) && !this.compactState.compacted) {
						try {
							const result = await compactConversation(
								this.provider,
								this.config.model,
								this.messages as any[],
								this.compactState,
							);
							this.messages = result.compactedMessages as MutableMessageParam[];
							this.compactState = result.state;
							turnsRemaining++;
							this.turnCount--;
							continue;
						} catch { /* Can't compact */ }
					}

					yield {
						type: 'result',
						subtype: 'error',
						usage: this.totalUsage,
						cost: this.totalCost,
						numTurns: this.turnCount,
						error: err.message || String(err),
					};
					return;
				}
			}

			// Track API timing
			this.apiTimeMs += performance.now() - apiStart;

			// Track usage
			this.trackUsage(response.usage);

			// Yield assistant message (full content including thinking for UI display)
			yield {
				type: 'assistant',
				message: {
					role: 'assistant',
					content: response.content as any,
				},
			};

			// [Director-Code] A3: improved max_tokens handling — distinguish tool truncation from text continuation
			if (response.stopReason === 'max_tokens' && maxOutputRecoveryAttempts < MAX_OUTPUT_RECOVERY) {
				const hasIncompleteTool = response.content.some((b: any) => b.type === 'tool_use' && b._jsonParseError);
				maxOutputRecoveryAttempts++;
				if (hasIncompleteTool) {
					const cleanContent = response.content.filter((b: any) => !(b.type === 'tool_use' && b._jsonParseError));
					this.messages.push({ role: 'assistant', content: cleanContent as any });
					this.messages.push({ role: 'user', content: 'Your previous response was truncated in the middle of a tool call JSON. Please re-output the complete tool call(s).' });
				} else {
					this.messages.push({ role: 'user', content: 'Please continue from where you left off.' });
				}
				continue;
			}

			// Check for tool use
			const toolUseBlocks = response.content.filter(
				(block): block is ToolUseBlock => block.type === 'tool_use',
			);

			// [Director-Code] A3: JSON parse error → tool_result is_error for model retry
			const MAX_JSON_RETRIES = 2;
			const jsonErrorBlocks = toolUseBlocks.filter((b: any) => b._jsonParseError);
			if (jsonErrorBlocks.length > 0) {
				const retryKey = jsonErrorBlocks.map(b => b.name).sort().join(',');
				this._jsonRetryCount = this._jsonRetryCount || new Map<string, number>();
				const count = this._jsonRetryCount.get(retryKey) || 0;

				if (count < MAX_JSON_RETRIES) {
					this._jsonRetryCount.set(retryKey, count + 1);
					const errorResults = jsonErrorBlocks.map((b: any) => ({
						type: 'tool_result' as const,
						tool_use_id: b.id,
						content: `JSON parse error in tool call '${b.name}': ${b._jsonParseError}. Please retry with valid JSON.`,
						is_error: true,
					}));
					this.messages.push({ role: 'assistant', content: response.content as any });
					this.messages.push({ role: 'user', content: errorResults });
					continue;
				}
				// Exhausted retries — skip these tools and continue
				const skipResults = jsonErrorBlocks.map((b: any) => ({
					type: 'tool_result' as const,
					tool_use_id: b.id,
					content: `Tool '${b.name}' failed after ${MAX_JSON_RETRIES + 1} attempts due to invalid JSON. Skip this tool and continue.`,
					is_error: true,
				}));
				this.messages.push({ role: 'assistant', content: response.content as any });
				this.messages.push({ role: 'user', content: skipResults });
				continue;
			}

			if (toolUseBlocks.length === 0) {
				// No tool calls — add assistant message (filtered) and exit loop
				const finalContent = response.content.filter((b: any) => b.type !== 'thinking');
				this.messages.push({ role: 'assistant', content: finalContent as any });
				break;
			}

			// Reset max_output recovery counter and JSON retry counter on successful tool use
			maxOutputRecoveryAttempts = 0;
			this._jsonRetryCount = undefined;

			// Yield tool_use events so the UI shows "Using tool: X" before execution
			for (const block of toolUseBlocks) {
				yield {
					type: 'tool_use',
					id: block.id,
					name: block.name,
					input: block.input,
				} as AgentEvent;
			}

			// Execute tools (concurrent read-only, serial mutations) with order preservation
			const toolResults = await this.executeTools(toolUseBlocks);

			// Yield tool results
			for (const result of toolResults) {
				yield {
					type: 'tool_result',
					tool_use_id: result.tool_use_id,
					tool_name: result.tool_name || '',
					content: typeof result.content === 'string' ? result.content : JSON.stringify(result.content),
					is_error: result.is_error,
				};
			}

			// [Director-Code] A3: filter out thinking blocks before pushing to history
			const contentForHistory = response.content.filter((b: any) => b.type !== 'thinking');

			// Add assistant message (without thinking) to conversation
			this.messages.push({ role: 'assistant', content: contentForHistory as any });

			// Add tool results to conversation
			this.messages.push({
				role: 'user',
				content: toolResults.map((r) => ({
					type: 'tool_result' as const,
					tool_use_id: r.tool_use_id,
					content: typeof r.content === 'string' ? r.content : JSON.stringify(r.content),
					is_error: r.is_error,
				})),
			});

			// [Director-Code] A2: advance checkpoint after complete tool round-trip
			if (!this.config.abortSignal?.aborted) {
				lastCompleteTurnEnd = this.messages.length;
			}

			// After tool execution, always continue the loop so the LLM
			// can see the tool results and decide what to do next.
		}
		} finally {
			// [Director-Code] A2: on cancellation, truncate incomplete history to last checkpoint
			if (this.config.abortSignal?.aborted && this.messages.length > lastCompleteTurnEnd) {
				this.messages.length = lastCompleteTurnEnd;
			}
		}

		// Yield final result
		const endSubtype = this.config.abortSignal?.aborted
			? 'cancelled'
			: budgetExceeded
				? 'error_max_budget_usd'
				: turnsRemaining <= 0
					? 'error_max_turns'
					: 'success';

		yield {
			type: 'result',
			subtype: endSubtype as any,
			usage: this.totalUsage,
			cost: this.totalCost,
			numTurns: this.turnCount,
		};
	}

	// ========================================================================
	// Streaming Helpers
	// ========================================================================

	// [Director-Code] A3: JSON parse error now tagged for downstream retry logic
	private finalizeToolBlock(tool: { id: string; name: string; input: string }): NormalizedResponseBlock {
		let parsedInput: any = {};
		let parseError: string | undefined;
		try {
			if (tool.input) { parsedInput = JSON.parse(tool.input); }
		} catch (err: any) {
			parseError = err.message || 'Invalid JSON';
			parsedInput = {};
		}
		const block: any = {
			type: 'tool_use',
			id: tool.id,
			name: tool.name,
			input: parsedInput,
		};
		if (parseError) {
			block._jsonParseError = parseError;
			block._rawInput = tool.input;
		}
		return block;
	}

	// ========================================================================
	// Tool Execution
	// ========================================================================

	private async executeTools(
		toolUseBlocks: ToolUseBlock[],
	): Promise<(ToolResult & { tool_name?: string })[]> {
		if (!this.toolExecutor) {
			// No tool executor — return errors for all tools
			return toolUseBlocks.map((block) => ({
				type: 'tool_result' as const,
				tool_use_id: block.id,
				content: `Error: No tool executor configured for "${block.name}"`,
				is_error: true,
				tool_name: block.name,
			}));
		}

		const MAX_CONCURRENCY = 10;

		// [Director-Code] A3: slot-based order preservation — results written back to original positions
		const results = new Array<ToolResult & { tool_name?: string }>(toolUseBlocks.length);

		// Partition into read-only (concurrent) and mutation (serial), preserving original indices
		const readOnlyIndices: number[] = [];
		const mutationIndices: number[] = [];

		for (let i = 0; i < toolUseBlocks.length; i++) {
			if (this.toolExecutor.isReadOnlyTool(toolUseBlocks[i].name)) {
				readOnlyIndices.push(i);
			} else {
				mutationIndices.push(i);
			}
		}

		// Execute read-only tools concurrently (batched), write back to original slots
		for (let i = 0; i < readOnlyIndices.length; i += MAX_CONCURRENCY) {
			const batchIndices = readOnlyIndices.slice(i, i + MAX_CONCURRENCY);
			const batchResults = await Promise.all(
				batchIndices.map((idx) => this.executeSingleTool(toolUseBlocks[idx])),
			);
			for (let j = 0; j < batchIndices.length; j++) {
				results[batchIndices[j]] = batchResults[j];
			}
		}

		// Execute mutation tools sequentially, write back to original slots
		for (const idx of mutationIndices) {
			results[idx] = await this.executeSingleTool(toolUseBlocks[idx]);
		}

		return results;
	}

	private async executeSingleTool(
		block: ToolUseBlock,
	): Promise<ToolResult & { tool_name?: string }> {
		// Check permissions via hook
		if (this.config.hookRegistry) {
			try {
				const hookResults = await this.config.hookRegistry.execute('PreToolUse', {
					toolName: block.name,
					toolInput: block.input,
				});
				if (hookResults.some((r: any) => r.behavior === 'deny')) {
					return {
						type: 'tool_result',
						tool_use_id: block.id,
						content: `Permission denied for tool "${block.name}"`,
						is_error: true,
						tool_name: block.name,
					};
				}
			} catch {
				// Hook errors are non-fatal
			}
		}

		// Check permissions via canUseTool
		if (this.config.canUseTool) {
			try {
				const permission = await this.config.canUseTool(block.name, block.input);
				if (permission.behavior === 'deny') {
					return {
						type: 'tool_result',
						tool_use_id: block.id,
						content: permission.message || `Permission denied for tool "${block.name}"`,
						is_error: true,
						tool_name: block.name,
					};
				}
			} catch (err: any) {
				return {
					type: 'tool_result',
					tool_use_id: block.id,
					content: `Permission check error: ${err.message}`,
					is_error: true,
					tool_name: block.name,
				};
			}
		}

		// Execute via ToolExecutor
		try {
			const result = await this.toolExecutor!.invokeTool(block.name, block.input);

			// Hook: PostToolUse
			if (this.config.hookRegistry) {
				await this.config.hookRegistry.execute('PostToolUse', {
					toolName: block.name,
					toolInput: block.input,
				}).catch(() => { /* non-fatal */ });
			}

			return {
				type: 'tool_result',
				tool_use_id: block.id,
				content: result,
				tool_name: block.name,
			};
		} catch (err: any) {
			// Hook: PostToolUseFailure
			if (this.config.hookRegistry) {
				await this.config.hookRegistry.execute('PostToolUseFailure', {
					toolName: block.name,
					toolInput: block.input,
				}).catch(() => { /* non-fatal */ });
			}

			return {
				type: 'tool_result',
				tool_use_id: block.id,
				content: `Tool execution error: ${err.message}`,
				is_error: true,
				tool_name: block.name,
			};
		}
	}

	// ========================================================================
	// Usage Tracking
	// ========================================================================

	private trackUsage(usage: TokenUsage): void {
		this.totalUsage.input_tokens += usage.input_tokens;
		this.totalUsage.output_tokens += usage.output_tokens;
		if (usage.cache_creation_input_tokens) {
			this.totalUsage.cache_creation_input_tokens =
				(this.totalUsage.cache_creation_input_tokens || 0) + usage.cache_creation_input_tokens;
		}
		if (usage.cache_read_input_tokens) {
			this.totalUsage.cache_read_input_tokens =
				(this.totalUsage.cache_read_input_tokens || 0) + usage.cache_read_input_tokens;
		}
		this.totalCost += estimateCost(this.config.model, usage);
	}

	// ========================================================================
	// State Accessors
	// ========================================================================

	getMessages(): NormalizedMessageParam[] {
		return [...this.messages];
	}

	getUsage(): TokenUsage {
		return { ...this.totalUsage };
	}

	getCost(): number {
		return this.totalCost;
	}

	getSessionId(): string {
		return this.sessionId;
	}
}
