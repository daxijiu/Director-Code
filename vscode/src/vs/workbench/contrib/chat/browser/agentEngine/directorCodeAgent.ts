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
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { AgentEngine } from '../../common/agentEngine/agentEngine.js';
import type { AgentEngineConfig } from '../../common/agentEngine/agentEngineTypes.js';
import { providerToApiType, type ProviderName } from '../../common/agentEngine/apiKeyService.js';
import { IAuthStateService, normalizeAuthVariantForProvider, type IResolvedAuthState } from '../../common/agentEngine/authStateService.js';
import { createProvider } from '../../common/agentEngine/providers/providerFactory.js';
import { OPENAI_CODEX_AUTH_VARIANT, type AuthVariantName } from '../../common/agentEngine/providers/providerTypes.js';
import { findModelById } from '../../common/agentEngine/modelCatalog.js';
import type {
	IChatAgentImplementation,
	IChatAgentRequest,
	IChatAgentResult,
	IChatAgentHistoryEntry,
} from '../../common/participants/chatAgents.js';
import type { IChatFollowup, IChatProgress } from '../../common/chatService/chatService.js';
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
const CONFIG_AUTH_VARIANT = 'directorCode.ai.authVariant';
const CONFIG_MAX_TURNS = 'directorCode.ai.maxTurns';
const CONFIG_MAX_TOKENS = 'directorCode.ai.maxTokens';
const CONFIG_MAX_INPUT_TOKENS = 'directorCode.ai.maxInputTokens';

// ============================================================================
// DirectorCodeAgent
// ============================================================================

function missingAuthMessage(authState: IResolvedAuthState): string {
	if (authState.authVariant === OPENAI_CODEX_AUTH_VARIANT) {
		return 'No OpenAI Codex OAuth login found. Sign in under Director Code Settings > Subscription & Login.';
	}
	return `No API key configured for provider "${authState.provider}". Please set your API key in Director Code settings (Ctrl+Shift+P -> "Director Code: Open Settings").`;
}

function codexTransportPendingMessage(): string {
	return 'OpenAI Codex OAuth login is available, but the Codex backend transport is not wired yet. Continue with B1-9, or switch directorCode.ai.authVariant back to "default" to use an API key transport.';
}

export class DirectorCodeAgent implements IChatAgentImplementation {

	constructor(
		@IConfigurationService private readonly configService: IConfigurationService,
		@IAuthStateService private readonly authStateService: IAuthStateService,
		@ILanguageModelToolsService private readonly toolsService: ILanguageModelToolsService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
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
			let providerName = this.configService.getValue<string>(CONFIG_PROVIDER) || 'anthropic';
			let modelId = this.configService.getValue<string>(CONFIG_MODEL) || 'claude-sonnet-4-6';
			const baseURL = this.configService.getValue<string>(CONFIG_BASE_URL) || undefined;
			const configuredAuthVariant = (this.configService.getValue<string>(CONFIG_AUTH_VARIANT) || 'default') as AuthVariantName;
			const maxTurns = this.configService.getValue<number>(CONFIG_MAX_TURNS) || 25;
			const maxTokens = this.configService.getValue<number>(CONFIG_MAX_TOKENS) || 8192;
			const maxInputTokens = this.configService.getValue<number>(CONFIG_MAX_INPUT_TOKENS) || 0;

			// 1b. Override model if user selected one from the Chat UI model picker
			if (request.userSelectedModelId) {
				// userSelectedModelId format: "director-code/claude-sonnet-4-6"
				const shortId = request.userSelectedModelId.replace('director-code/', '');
				const modelDef = findModelById(shortId);
				if (modelDef) {
					modelId = modelDef.id;
					providerName = modelDef.provider;
				}
			}

			// 2. Resolve auth state via the unified API-key/OAuth facade
			const provider = providerName as ProviderName;
			const authVariant = normalizeAuthVariantForProvider(provider, configuredAuthVariant);
			const resolved = await this.authStateService.resolveAuth(provider, modelId, authVariant, baseURL);
			if (resolved.source === 'missing' || !resolved.auth) {
				return {
					errorDetails: {
						message: missingAuthMessage(resolved),
					},
					timings: { totalElapsed: Date.now() - startTime },
				};
			}
			if (resolved.source === 'oauth' && resolved.authVariant === OPENAI_CODEX_AUTH_VARIANT) {
				return {
					errorDetails: {
						message: codexTransportPendingMessage(),
					},
					timings: { totalElapsed: Date.now() - startTime },
				};
			}

			// 3. Create LLM provider with resolved options
			const apiType = providerToApiType(provider);
			const llmProvider = createProvider(apiType, {
				auth: resolved.auth,
				baseURL: resolved.baseURL,
				capabilities: resolved.capabilities,
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

			// 7. Resolve workspace folder for cwd
			const workspace = this.workspaceService.getWorkspace();
			const cwd = workspace.folders.length > 0
				? workspace.folders[0].uri.fsPath
				: '.';

			// 8. Create Agent Engine with conversation history
			const config: AgentEngineConfig = {
				cwd,
				model: modelId,
				provider: llmProvider,
				tools: toolDefinitions,
				maxTurns,
				maxTokens,
				maxInputTokens: maxInputTokens > 0 ? maxInputTokens : undefined,
				abortSignal: abortController.signal,
			};
			const engine = new AgentEngine(config, toolBridge, previousMessages);

			// 9. Run the agentic loop
			const userMessage = requestToUserMessage(request);

			try {
				// 10. Run the agentic loop
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

			// [Director-Code] A2: explicit cancelled metadata — no errorDetails (avoids red error UI)
			return {
				metadata: { subtype: 'cancelled' },
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

	async provideFollowups(
		_request: IChatAgentRequest,
		result: IChatAgentResult,
		_history: IChatAgentHistoryEntry[],
		_token: CancellationToken,
	): Promise<IChatFollowup[]> {
		// If there was an error related to missing auth, suggest opening settings
		if (result.errorDetails?.message?.includes('No API key') || result.errorDetails?.message?.includes('No OpenAI Codex OAuth')) {
			return [{
				kind: 'reply',
				message: 'Open Director Code settings to configure authentication',
				agentId: 'director-code',
				title: 'Open Settings',
			}];
		}

		// If the agent completed with max turns, suggest continuing
		if (result.metadata?.subtype === 'error_max_turns') {
			return [{
				kind: 'reply',
				message: 'Please continue where you left off.',
				agentId: 'director-code',
				title: 'Continue',
			}];
		}

		return [];
	}
}
