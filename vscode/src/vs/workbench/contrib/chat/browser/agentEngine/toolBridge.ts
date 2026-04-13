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
	// Tools without mutation tags are treated as mutations by default (safer)
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
		// Build lookup maps from available tools
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
			// Simple estimation: ~4 chars per token
			return Math.ceil(_input.length / 4);
		};

		const result = await this.toolsService.invokeTool(invocation, countTokens, this.token);

		// Convert IToolResult → string for the Agent Engine
		return this.resultToString(result);
	}

	isReadOnlyTool(name: string): boolean {
		return this.readOnlyTools.has(name);
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
				// Serialize data parts as JSON
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
