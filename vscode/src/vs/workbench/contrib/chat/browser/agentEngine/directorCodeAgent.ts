/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Director Code Agent
 *
 * Implements IChatAgentImplementation to integrate the Agent Engine
 * into VS Code's Chat system. When the user sends a message to this
 * agent, it runs the full agentic loop (LLM → tools → LLM → ...)
 * and streams progress back to the Chat UI.
 */

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { AgentEngine } from '../../common/agentEngine/agentEngine.js';
import type { AgentEngineConfig } from '../../common/agentEngine/agentEngineTypes.js';
import { IApiKeyService, providerToApiType, type ProviderName } from '../../common/agentEngine/apiKeyService.js';
import { createProvider } from '../../common/agentEngine/providers/providerFactory.js';
import type {
	IChatAgentImplementation,
	IChatAgentRequest,
	IChatAgentResult,
	IChatAgentHistoryEntry,
} from '../../common/participants/chatAgents.js';
import type { IChatProgress } from '../../common/chatService/chatService.js';
import { ILanguageModelToolsService } from '../../common/tools/languageModelToolsService.js';
import { agentEventToProgress } from './progressBridge.js';
import { requestToUserMessage, historyToNormalizedMessages } from './messageNormalization.js';
import { VSCodeToolBridge, getAgentToolDefinitions } from './toolBridge.js';

// ============================================================================
// Configuration keys
// ============================================================================

const CONFIG_PROVIDER = 'directorCode.ai.provider';
const CONFIG_MODEL = 'directorCode.ai.model';
const CONFIG_BASE_URL = 'directorCode.ai.baseURL';
const CONFIG_MAX_TURNS = 'directorCode.ai.maxTurns';
const CONFIG_MAX_TOKENS = 'directorCode.ai.maxTokens';

// ============================================================================
// DirectorCodeAgent
// ============================================================================

export class DirectorCodeAgent implements IChatAgentImplementation {

	constructor(
		@IConfigurationService private readonly configService: IConfigurationService,
		@IApiKeyService private readonly apiKeyService: IApiKeyService,
		@ILanguageModelToolsService private readonly toolsService: ILanguageModelToolsService,
	) { }

	async invoke(
		request: IChatAgentRequest,
		progress: (parts: IChatProgress[]) => void,
		history: IChatAgentHistoryEntry[],
		token: CancellationToken,
	): Promise<IChatAgentResult> {
		const startTime = Date.now();

		try {
			// 1. Read configuration
			const providerName = this.configService.getValue<string>(CONFIG_PROVIDER) || 'anthropic';
			const modelId = this.configService.getValue<string>(CONFIG_MODEL) || 'claude-sonnet-4-6';
			const baseURL = this.configService.getValue<string>(CONFIG_BASE_URL) || undefined;
			const maxTurns = this.configService.getValue<number>(CONFIG_MAX_TURNS) || 25;
			const maxTokens = this.configService.getValue<number>(CONFIG_MAX_TOKENS) || 8192;

			// 2. Retrieve API key via ApiKeyService
			const apiKey = await this.apiKeyService.getApiKey(providerName as ProviderName);
			if (!apiKey) {
				return {
					errorDetails: {
						message: `No API key configured for provider "${providerName}". Please set your API key in Director Code settings (Ctrl+Shift+P → "Director Code: Open Settings").`,
					},
					timings: { totalElapsed: Date.now() - startTime },
				};
			}

			// 3. Create LLM provider
			const apiType = providerToApiType(providerName as ProviderName);
			const provider = createProvider(apiType, {
				apiKey,
				baseURL,
			});

			// 4. Set up tool bridge
			const toolBridge = new VSCodeToolBridge(
				this.toolsService,
				request.sessionResource,
				request.requestId,
				token,
			);
			const toolDefinitions = getAgentToolDefinitions(this.toolsService);

			// 5. Convert history to normalized messages
			const previousMessages = historyToNormalizedMessages(history);

			// 6. Create AbortSignal from CancellationToken
			const abortController = new AbortController();
			const cancelListener = token.onCancellationRequested(() => {
				abortController.abort();
			});

			// 7. Create Agent Engine
			const config: AgentEngineConfig = {
				cwd: '.', // TODO: get workspace folder
				model: modelId,
				provider,
				tools: toolDefinitions,
				maxTurns,
				maxTokens,
				abortSignal: abortController.signal,
			};
			const engine = new AgentEngine(config, toolBridge);

			// 8. Pre-populate conversation history
			// The engine manages its own message array, so we need to set
			// the previous messages before running the loop.
			// For now, we include history context in the user message.
			const userMessage = requestToUserMessage(request);

			try {
				// 9. Run the agentic loop
				let firstProgressSent = false;
				let firstProgressTime: number | undefined;

				for await (const event of engine.submitMessage(userMessage)) {
					if (token.isCancellationRequested) {
						break;
					}

					const progressParts = agentEventToProgress(event);
					if (progressParts.length > 0) {
						if (!firstProgressSent) {
							firstProgressTime = Date.now() - startTime;
							firstProgressSent = true;
						}
						progress(progressParts);
					}

					// Handle final result event
					if (event.type === 'result') {
						const resultEvent = event as any;
						if (resultEvent.subtype === 'error') {
							return {
								errorDetails: {
									message: resultEvent.error || 'Agent encountered an error',
								},
								timings: {
									firstProgress: firstProgressTime,
									totalElapsed: Date.now() - startTime,
								},
								metadata: {
									usage: resultEvent.usage,
									cost: resultEvent.cost,
									numTurns: resultEvent.numTurns,
								},
							};
						}

						return {
							timings: {
								firstProgress: firstProgressTime,
								totalElapsed: Date.now() - startTime,
							},
							metadata: {
								usage: resultEvent.usage,
								cost: resultEvent.cost,
								numTurns: resultEvent.numTurns,
								subtype: resultEvent.subtype,
							},
						};
					}
				}
			} finally {
				cancelListener.dispose();
			}

			// If we exited the loop without a result event (e.g., cancellation)
			return {
				timings: { totalElapsed: Date.now() - startTime },
			};

		} catch (err: any) {
			return {
				errorDetails: {
					message: `Agent error: ${err.message || String(err)}`,
				},
				timings: { totalElapsed: Date.now() - startTime },
			};
		}
	}
}
