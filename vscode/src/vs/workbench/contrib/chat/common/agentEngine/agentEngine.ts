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

import { generateUuid } from '../../../../../../base/common/uuid.js';
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
	NormalizedContentBlock,
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

		while (turnsRemaining > 0) {
			if (this.config.abortSignal?.aborted) { break; }

			// Check budget
			if (this.config.maxBudgetUsd && this.totalCost >= this.config.maxBudgetUsd) {
				budgetExceeded = true;
				break;
			}

			// Auto-compact if context is too large
			if (shouldAutoCompact(this.messages as any[], this.config.model, this.compactState)) {
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
			};

			let streamingUsed = false;
			try {
				if (this.provider.createMessageStream) {
					// Streaming path: yield text/thinking deltas inline
					streamingUsed = true;
					const contentBlocks: NormalizedContentBlock[] = [];
					let currentTextBlock: { type: 'text'; text: string } | undefined;
					let currentToolId: string | undefined;
					let currentToolName: string | undefined;
					let currentToolInput = '';
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

							case 'tool_use_start':
								if (currentTextBlock) {
									contentBlocks.push(currentTextBlock);
									currentTextBlock = undefined;
								}
								currentToolId = event.id;
								currentToolName = event.name;
								currentToolInput = '';
								break;

							case 'tool_input_delta':
								currentToolInput += event.json;
								break;

							case 'tool_call_delta':
								if (event.id && !currentToolId) { currentToolId = event.id; }
								if (event.name && !currentToolName) { currentToolName = event.name; }
								if (event.arguments) { currentToolInput += event.arguments; }
								break;

							case 'message_complete':
								streamUsage = event.usage;
								streamStopReason = event.stopReason;
								break;
						}
					}

					// Finalize remaining blocks
					if (currentTextBlock) { contentBlocks.push(currentTextBlock); }
					if (currentToolId && currentToolName) {
						let parsedInput: any = {};
						try { if (currentToolInput) { parsedInput = JSON.parse(currentToolInput); } }
						catch { parsedInput = { raw: currentToolInput }; }
						contentBlocks.push({
							type: 'tool_use',
							id: currentToolId,
							name: currentToolName,
							input: parsedInput,
						});
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

			// Add assistant message to conversation
			this.messages.push({ role: 'assistant', content: response.content as any });

			// Yield assistant message
			yield {
				type: 'assistant',
				message: {
					role: 'assistant',
					content: response.content as any,
				},
			};

			// Handle max_output_tokens recovery
			if (response.stopReason === 'max_tokens' && maxOutputRecoveryAttempts < MAX_OUTPUT_RECOVERY) {
				maxOutputRecoveryAttempts++;
				this.messages.push({ role: 'user', content: 'Please continue from where you left off.' });
				continue;
			}

			// Check for tool use
			const toolUseBlocks = response.content.filter(
				(block): block is ToolUseBlock => block.type === 'tool_use',
			);

			if (toolUseBlocks.length === 0) {
				break; // No tool calls — agent is done
			}

			// Reset max_output recovery counter on successful tool use
			maxOutputRecoveryAttempts = 0;

			// Yield tool_use events so the UI shows "Using tool: X" before execution
			for (const block of toolUseBlocks) {
				yield {
					type: 'tool_use',
					id: block.id,
					name: block.name,
					input: block.input,
				} as AgentEvent;
			}

			// Execute tools (concurrent read-only, serial mutations)
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

			// After tool execution, always continue the loop so the LLM
			// can see the tool results and decide what to do next.
		}

		// Yield final result
		const endSubtype = budgetExceeded
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

		// Partition into read-only (concurrent) and mutation (serial)
		const readOnly: ToolUseBlock[] = [];
		const mutations: ToolUseBlock[] = [];

		for (const block of toolUseBlocks) {
			if (this.toolExecutor.isReadOnlyTool(block.name)) {
				readOnly.push(block);
			} else {
				mutations.push(block);
			}
		}

		const results: (ToolResult & { tool_name?: string })[] = [];

		// Execute read-only tools concurrently (batched)
		for (let i = 0; i < readOnly.length; i += MAX_CONCURRENCY) {
			const batch = readOnly.slice(i, i + MAX_CONCURRENCY);
			const batchResults = await Promise.all(
				batch.map((block) => this.executeSingleTool(block)),
			);
			results.push(...batchResults);
		}

		// Execute mutation tools sequentially
		for (const block of mutations) {
			const result = await this.executeSingleTool(block);
			results.push(result);
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
