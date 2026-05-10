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
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { AgentEngine } from '../../common/agentEngine/agentEngine.js';
import type { AgentEngineConfig } from '../../common/agentEngine/agentEngineTypes.js';
import { providerToApiType, type ProviderName } from '../../common/agentEngine/apiKeyService.js';
import { IAuthStateService, normalizeAuthVariantForProvider, type IResolvedAuthState } from '../../common/agentEngine/authStateService.js';
import { CONFIG_GEMINI_KEY_IN_URL } from '../../common/agentEngine/geminiAuth.js';
import { createProvider } from '../../common/agentEngine/providers/providerFactory.js';
import { OPENAI_CODEX_AUTH_VARIANT, type AuthVariantName } from '../../common/agentEngine/providers/providerTypes.js';
import { findModelById, getDefaultModelForAuthVariant, isOpenAICodexModel } from '../../common/agentEngine/modelCatalog.js';
import { IModelResolverService, normalizeModelResolverBaseURL } from '../../common/agentEngine/modelResolver.js';
import { createCompactModelAvailabilityKey, resolveCompactModel } from '../../common/agentEngine/compact.js';
import type {
	IChatAgentImplementation,
	IChatAgentRequest,
	IChatAgentResult,
	IChatAgentHistoryEntry,
} from '../../common/participants/chatAgents.js';
import { IChatService, type IChatFollowup, type IChatProgress } from '../../common/chatService/chatService.js';
import type { IChatProgressResponseContent } from '../../common/model/chatModel.js';
import { ILanguageModelToolsService } from '../../common/tools/languageModelToolsService.js';
import { agentEventToProgress } from './progressBridge.js';
import { requestToUserMessage, historyToNormalizedMessages } from './messageNormalization.js';
import { VSCodeToolBridge, getAgentToolDefinitions } from './toolBridge.js';
import type { NormalizedMessageParam } from '../../common/agentEngine/providers/providerTypes.js';

// ============================================================================
// Configuration keys
// ============================================================================

const CONFIG_PROVIDER = 'directorCode.ai.provider';
const CONFIG_MODEL = 'directorCode.ai.model';
const CONFIG_BASE_URL = 'directorCode.ai.baseURL';
const CONFIG_AUTH_VARIANT = 'directorCode.ai.authVariant';
const CONFIG_COMPACT_MODEL = 'directorCode.ai.compactModel';
const CONFIG_MAX_TURNS = 'directorCode.ai.maxTurns';
const CONFIG_MAX_TOKENS = 'directorCode.ai.maxTokens';
const CONFIG_MAX_INPUT_TOKENS = 'directorCode.ai.maxInputTokens';
const MAX_REPLAY_SNAPSHOTS = 16;
const MAX_REPLAY_MESSAGES = 200;

interface ReplaySnapshot {
	readonly messages: NormalizedMessageParam[];
	lastUpdated: number;
	readonly provider: ProviderName;
	readonly model: string;
	readonly apiType: AgentEngineConfig['provider']['apiType'];
}

// ============================================================================
// DirectorCodeAgent
// ============================================================================

function missingAuthMessage(authState: IResolvedAuthState): string {
	if (authState.authVariant === OPENAI_CODEX_AUTH_VARIANT) {
		return 'No OpenAI Codex OAuth login found. Sign in under Director Code Settings > Subscription & Login.';
	}
	return `No API key configured for provider "${authState.provider}". Please set your API key in Director Code settings (Ctrl+Shift+P -> "Director Code: Open Settings").`;
}

function modelForAuthVariant(provider: ProviderName, modelId: string, authVariant: AuthVariantName): string {
	if (provider === 'openai' && authVariant === OPENAI_CODEX_AUTH_VARIANT && !isOpenAICodexModel(modelId)) {
		return getDefaultModelForAuthVariant(provider, OPENAI_CODEX_AUTH_VARIANT);
	}
	return modelId || getDefaultModelForAuthVariant(provider, authVariant);
}

export class DirectorCodeAgent extends Disposable implements IChatAgentImplementation {

	private readonly _replaySnapshots = new Map<string, ReplaySnapshot>();
	private _chatServiceHooksRegistered = false;

	constructor(
		@IConfigurationService private readonly configService: IConfigurationService,
		@IAuthStateService private readonly authStateService: IAuthStateService,
		@ILanguageModelToolsService private readonly toolsService: ILanguageModelToolsService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IModelResolverService private readonly modelResolverService: IModelResolverService,
	) {
		super();
	}

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
			let configuredAuthVariant = (this.configService.getValue<string>(CONFIG_AUTH_VARIANT) || 'default') as AuthVariantName;
			const configuredCompactModel = this.configService.getValue<string>(CONFIG_COMPACT_MODEL) || '';
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
					if (modelDef.apiType === 'openai-codex') {
						configuredAuthVariant = OPENAI_CODEX_AUTH_VARIANT;
					}
				}
			}

			// 2. Resolve auth state via the unified API-key/OAuth facade
			const provider = providerName as ProviderName;
			const authVariant = normalizeAuthVariantForProvider(provider, configuredAuthVariant);
			modelId = modelForAuthVariant(provider, modelId, authVariant);
			const resolved = await this.authStateService.resolveAuth(provider, modelId, authVariant, baseURL);
			if (resolved.source === 'missing' || !resolved.auth) {
				return {
					errorDetails: {
						message: missingAuthMessage(resolved),
					},
					timings: { totalElapsed: Date.now() - startTime },
				};
			}

			const availableModels = await this.modelResolverService.resolveModels(
				provider,
				resolved.accessToken ?? resolved.apiKey,
				resolved.baseURL ?? baseURL,
				resolved.identityKey,
				resolved.authVariant,
			);
			const normalizedBaseURL = normalizeModelResolverBaseURL(provider, resolved.baseURL ?? baseURL, resolved.authVariant);
			const compactModelResolution = resolveCompactModel({
				provider,
				authVariant: resolved.authVariant,
				mainModel: modelId,
				configuredCompactModel,
				availableModels,
				availabilityKeyForModel: compactModelId => createCompactModelAvailabilityKey(provider, normalizedBaseURL, resolved.identityKey, resolved.authVariant, compactModelId),
			});

			// 3. Create LLM provider with resolved options
			const apiType = provider === 'openai' && resolved.authVariant === OPENAI_CODEX_AUTH_VARIANT
				? 'openai-codex'
				: providerToApiType(provider);
			const llmProvider = createProvider(apiType, {
				auth: resolved.auth,
				baseURL: resolved.baseURL,
				capabilities: resolved.capabilities,
				geminiKeyInUrl: this.configService.getValue<boolean>(CONFIG_GEMINI_KEY_IN_URL) === true,
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
			const richResponses = this.getRichResponses(request, history.length);
			const historyMessages = historyToNormalizedMessages(history, richResponses, {
				preserveThinking: apiType === 'openai-completions',
			});
			const replaySnapshot = this.getReplaySnapshot(request.sessionResource);
			const previousMessages = this.shouldUseReplaySnapshot(historyMessages, history, richResponses, replaySnapshot, provider, modelId, apiType)
				? replaySnapshot!.messages
				: historyMessages;

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
				compactModel: compactModelResolution.model,
				compactModelUnavailableKey: compactModelResolution.unavailableKey,
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
				this.pushReplaySnapshot(request.sessionResource, engine.getMessages(), provider, modelId, apiType);
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

	private getRichResponses(request: IChatAgentRequest, historyLength: number): ReadonlyArray<ReadonlyArray<IChatProgressResponseContent>> | undefined {
		if (historyLength === 0) {
			return [];
		}

		const chatService = this.getChatService();
		if (!chatService) {
			return undefined;
		}
		this.ensureChatServiceHooks(chatService);

		const session = chatService.getSession(request.sessionResource);
		if (!session) {
			return undefined;
		}

		const completedRequests = session.getRequests()
			.filter(candidate => candidate.id !== request.requestId && !!candidate.response)
			.slice(-historyLength);

		return completedRequests.map(candidate => candidate.response!.entireResponse.value);
	}

	private getChatService(): IChatService | undefined {
		try {
			return this.instantiationService.invokeFunction(accessor => accessor.get(IChatService));
		} catch {
			return undefined;
		}
	}

	private ensureChatServiceHooks(chatService: IChatService): void {
		if (this._chatServiceHooksRegistered) {
			return;
		}
		this._chatServiceHooksRegistered = true;
		this._register(chatService.onDidDisposeSession(event => {
			for (const resource of event.sessionResource) {
				this._replaySnapshots.delete(this.sessionKey(resource));
			}
		}));
	}

	private shouldUseReplaySnapshot(
		historyMessages: NormalizedMessageParam[],
		history: IChatAgentHistoryEntry[],
		richResponses: ReadonlyArray<ReadonlyArray<IChatProgressResponseContent>> | undefined,
		replaySnapshot: ReplaySnapshot | undefined,
		provider: ProviderName,
		model: string,
		apiType: AgentEngineConfig['provider']['apiType'],
	): boolean {
		if (!replaySnapshot || history.length === 0) {
			return false;
		}
		if (replaySnapshot.provider !== provider || replaySnapshot.model !== model || replaySnapshot.apiType !== apiType) {
			return false;
		}
		if (!richResponses || richResponses.length !== history.length) {
			return true;
		}
		const richHasToolInvocations = richResponses.some(response => response.some(part => part.kind === 'toolInvocation' || part.kind === 'toolInvocationSerialized'));
		return !richHasToolInvocations && replaySnapshot.messages.length > historyMessages.length;
	}

	private getReplaySnapshot(sessionResource: IChatAgentRequest['sessionResource']): ReplaySnapshot | undefined {
		const key = this.sessionKey(sessionResource);
		const snapshot = this._replaySnapshots.get(key);
		if (snapshot) {
			snapshot.lastUpdated = Date.now();
		}
		return snapshot;
	}

	private pushReplaySnapshot(
		sessionResource: IChatAgentRequest['sessionResource'],
		messages: NormalizedMessageParam[],
		provider: ProviderName,
		model: string,
		apiType: AgentEngineConfig['provider']['apiType'],
	): void {
		if (messages.length === 0) {
			return;
		}

		const key = this.sessionKey(sessionResource);
		if (!this._replaySnapshots.has(key) && this._replaySnapshots.size >= MAX_REPLAY_SNAPSHOTS) {
			let oldestKey: string | undefined;
			let oldestTime = Number.POSITIVE_INFINITY;
			for (const [candidateKey, snapshot] of this._replaySnapshots) {
				if (snapshot.lastUpdated < oldestTime) {
					oldestTime = snapshot.lastUpdated;
					oldestKey = candidateKey;
				}
			}
			if (oldestKey) {
				this._replaySnapshots.delete(oldestKey);
			}
		}

		this._replaySnapshots.set(key, {
			messages: this.trimReplayMessages(messages),
			lastUpdated: Date.now(),
			provider,
			model,
			apiType,
		});
	}

	private trimReplayMessages(messages: readonly NormalizedMessageParam[]): NormalizedMessageParam[] {
		if (messages.length <= MAX_REPLAY_MESSAGES) {
			return [...messages];
		}

		const firstUserMessage = messages.find(message => message.role === 'user');
		const recent = messages.slice(-(MAX_REPLAY_MESSAGES - 1));
		if (firstUserMessage && !recent.includes(firstUserMessage)) {
			return [firstUserMessage, ...recent];
		}
		return messages.slice(-MAX_REPLAY_MESSAGES);
	}

	private sessionKey(sessionResource: IChatAgentRequest['sessionResource']): string {
		return sessionResource.toString();
	}
}
