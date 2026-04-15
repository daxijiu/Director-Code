/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Tool Bridge
 *
 * Bridges VS Code's ILanguageModelToolsService with the Agent Engine's
 * IToolExecutor interface. Allows the agentic loop to invoke VS Code's
 * built-in tools, extension tools, and MCP tools.
 */

import { generateUuid } from '../../../../../base/common/uuid.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { URI } from '../../../../../base/common/uri.js';
import type { IToolExecutor } from '../../common/agentEngine/agentEngine.js';
import type { AgentToolDefinition } from '../../common/agentEngine/agentEngineTypes.js';
import type {
	ILanguageModelToolsService,
	IToolData,
	IToolInvocation,
	CountTokensCallback,
} from '../../common/tools/languageModelToolsService.js';
import type { ILanguageModelChatMetadata } from '../../common/languageModels.js';

const TOOL_TIMEOUT_MS = 120_000; // 2 minutes max per tool invocation

// ============================================================================
// Tool Discovery: VS Code tools → AgentToolDefinition[]
// ============================================================================

/**
 * Convert available VS Code tools into AgentToolDefinition[] for the Agent Engine.
 *
 * @param toolsService - The VS Code tool registry
 * @param model - Optional model metadata for filtering tools by model compatibility
 */
export function getAgentToolDefinitions(
	toolsService: ILanguageModelToolsService,
	model?: ILanguageModelChatMetadata,
): AgentToolDefinition[] {
	const tools: AgentToolDefinition[] = [];

	for (const toolData of toolsService.getTools(model)) {
		const definition: AgentToolDefinition = {
			name: toolData.toolReferenceName || toolData.id,
			description: toolData.modelDescription || toolData.displayName,
			inputSchema: toolData.inputSchema
				? {
					type: 'object' as const,
					properties: (toolData.inputSchema as any).properties || {},
					required: (toolData.inputSchema as any).required,
				}
				: {
					type: 'object' as const,
					properties: {},
				},
			isReadOnly: isToolReadOnly(toolData),
		};
		tools.push(definition);
	}

	return tools;
}

/**
 * Determine if a tool is read-only based on its tags and tool set membership.
 */
function isToolReadOnly(toolData: IToolData): boolean {
	if (toolData.tags?.includes('readonly')) {
		return true;
	}
	return false;
}

// ============================================================================
// VSCodeToolBridge: IToolExecutor implementation
// ============================================================================

/**
 * Bridges the Agent Engine's tool execution interface with VS Code's
 * ILanguageModelToolsService.
 *
 * The Agent Engine calls `invokeTool(name, input)` and gets a string result.
 * This bridge translates that into VS Code's full tool invocation pipeline
 * (lookup, prepare, confirm, execute).
 *
 * Includes timeout protection (120s) to prevent infinite hangs when
 * the tool confirmation UI doesn't render or the tool blocks indefinitely.
 */
export class VSCodeToolBridge implements IToolExecutor {
	private readonly toolNameToId = new Map<string, string>();
	private readonly readOnlyTools = new Set<string>();

	constructor(
		private readonly toolsService: ILanguageModelToolsService,
		private readonly sessionResource: URI,
		private readonly requestId: string,
		private readonly token: CancellationToken,
		model?: ILanguageModelChatMetadata,
	) {
		for (const toolData of toolsService.getTools(model)) {
			const name = toolData.toolReferenceName || toolData.id;
			this.toolNameToId.set(name, toolData.id);
			if (isToolReadOnly(toolData)) {
				this.readOnlyTools.add(name);
			}
		}
	}

	async invokeTool(name: string, input: unknown): Promise<string> {
		const toolId = this.toolNameToId.get(name);
		if (!toolId) {
			throw new Error(`Tool not found: ${name}`);
		}

		const invocation: IToolInvocation = {
			callId: generateUuid(),
			toolId,
			parameters: (typeof input === 'object' && input !== null) ? input as Record<string, any> : {},
			context: {
				sessionResource: this.sessionResource,
			} as any,
			chatRequestId: this.requestId,
		};

		const countTokens: CountTokensCallback = async (_input: string) => {
			return Math.ceil(_input.length / 4);
		};

		try {
			const result = await this.invokeWithTimeout(invocation, countTokens, name);
			return this.resultToString(result);
		} catch (err: any) {
			if (isCancellationError(err)) {
				return `[Tool '${name}' was cancelled] The tool confirmation was denied or the request was cancelled. If this was unexpected, try enabling auto-approve in the Chat panel's mode picker (select "Agent" mode with auto-approve).`;
			}
			throw err;
		}
	}

	isReadOnlyTool(name: string): boolean {
		return this.readOnlyTools.has(name);
	}

	// ========================================================================
	// Timeout wrapper
	// ========================================================================

	private invokeWithTimeout(
		invocation: IToolInvocation,
		countTokens: CountTokensCallback,
		toolName: string,
	): Promise<{ content: Array<any>; toolResultError?: string | boolean }> {
		return new Promise((resolve, reject) => {
			let settled = false;

			const timer = setTimeout(() => {
				if (!settled) {
					settled = true;
					reject(new Error(
						`Tool '${toolName}' timed out after ${TOOL_TIMEOUT_MS / 1000}s. ` +
						`This usually means the tool is waiting for user confirmation that didn't render. ` +
						`Try enabling auto-approve in the Chat panel's mode picker.`
					));
				}
			}, TOOL_TIMEOUT_MS);

			this.toolsService.invokeTool(invocation, countTokens, this.token)
				.then(result => {
					if (!settled) {
						settled = true;
						clearTimeout(timer);
						resolve(result as any);
					}
				})
				.catch(err => {
					if (!settled) {
						settled = true;
						clearTimeout(timer);
						reject(err);
					}
				});
		});
	}

	// ========================================================================
	// Helpers
	// ========================================================================

	private resultToString(result: { content: Array<any>; toolResultError?: string | boolean }): string {
		if (result.toolResultError) {
			const errMsg = typeof result.toolResultError === 'string'
				? result.toolResultError
				: 'Tool execution failed';
			throw new Error(errMsg);
		}

		const parts: string[] = [];
		for (const part of result.content) {
			if (part.kind === 'text' && part.value) {
				parts.push(part.value);
			} else if (part.kind === 'data' && part.value) {
				try {
					parts.push(JSON.stringify(part.value));
				} catch {
					parts.push('[data]');
				}
			}
		}

		return parts.join('\n') || 'Tool completed with no output.';
	}
}
