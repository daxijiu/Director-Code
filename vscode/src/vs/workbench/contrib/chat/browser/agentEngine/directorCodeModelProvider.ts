/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Director Code Model Provider
 *
 * Implements ILanguageModelChatProvider to expose configured LLM models
 * in VS Code's model selection UI. This allows users to select models
 * from Anthropic, OpenAI, or Gemini providers in the Chat panel.
 */

import { Emitter, Event } from '../../../../../base/common/event.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import type {
	ILanguageModelChatProvider,
	ILanguageModelChatMetadata,
	ILanguageModelChatMetadataAndIdentifier,
	ILanguageModelChatInfoOptions,
	ILanguageModelChatResponse,
	IChatMessage,
	IChatResponsePart,
} from '../../common/languageModels.js';
import { AsyncIterableSource } from '../../../../../base/common/async.js';
import { createProvider } from '../../common/agentEngine/providers/providerFactory.js';
import { estimateTokens } from '../../common/agentEngine/tokens.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { providerToApiType, type ProviderName } from '../../common/agentEngine/apiKeyService.js';
import { IAuthStateService, normalizeAuthVariantForProvider, type IResolvedAuthState } from '../../common/agentEngine/authStateService.js';
import { IModelResolverService } from '../../common/agentEngine/modelResolver.js';
import { OPENAI_CODEX_AUTH_VARIANT, type AuthVariantName, type NormalizedMessageParam } from '../../common/agentEngine/providers/providerTypes.js';
import {
	findModelById,
	getDefaultModelForAuthVariant,
	isOpenAICodexModel,
} from '../../common/agentEngine/modelCatalog.js';

// ============================================================================
// Configuration
// ============================================================================

const VENDOR = 'director-code';
const CONFIG_PROVIDER = 'directorCode.ai.provider';
const CONFIG_MODEL = 'directorCode.ai.model';
const CONFIG_BASE_URL = 'directorCode.ai.baseURL';
const CONFIG_AUTH_VARIANT = 'directorCode.ai.authVariant';

const EXTENSION_ID = new ExtensionIdentifier('director-code.agent');

// ============================================================================
// DirectorCodeModelProvider
// ============================================================================

function missingAuthError(authState: IResolvedAuthState): Error {
	if (authState.authVariant === OPENAI_CODEX_AUTH_VARIANT) {
		return new Error('No OpenAI Codex OAuth login found. Sign in under Director Code Settings > Subscription & Login.');
	}
	return new Error(`No API key configured for ${authState.provider}`);
}

function modelForAuthVariant(provider: ProviderName, modelId: string, authVariant: AuthVariantName): string {
	if (provider === 'openai' && authVariant === OPENAI_CODEX_AUTH_VARIANT && !isOpenAICodexModel(modelId)) {
		return getDefaultModelForAuthVariant(provider, OPENAI_CODEX_AUTH_VARIANT);
	}
	return modelId || getDefaultModelForAuthVariant(provider, authVariant);
}

function capabilitiesForAuthVariant(authVariant: AuthVariantName): ILanguageModelChatMetadata['capabilities'] {
	return {
		vision: authVariant !== OPENAI_CODEX_AUTH_VARIANT,
		toolCalling: true,
		agentMode: true,
	};
}

export class DirectorCodeModelProvider implements ILanguageModelChatProvider {

	private readonly _onDidChange = new Emitter<void>();
	readonly onDidChange: Event<void> = this._onDidChange.event;

	constructor(
		@IConfigurationService private readonly configService: IConfigurationService,
		@IAuthStateService private readonly authStateService: IAuthStateService,
		@IModelResolverService private readonly modelResolverService: IModelResolverService,
	) {
		// Listen for configuration changes to refresh model list
		this.configService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(CONFIG_PROVIDER) || e.affectsConfiguration(CONFIG_MODEL) || e.affectsConfiguration(CONFIG_BASE_URL) || e.affectsConfiguration(CONFIG_AUTH_VARIANT)) {
				this._onDidChange.fire();
			}
		});
		this.authStateService.onDidChangeAuthState(() => this._onDidChange.fire());
		this.modelResolverService.onDidChangeModels(() => this._onDidChange.fire());
	}

	async provideLanguageModelChatInfo(
		_options: ILanguageModelChatInfoOptions,
		_token: CancellationToken,
	): Promise<ILanguageModelChatMetadataAndIdentifier[]> {
		const providerName = (this.configService.getValue<string>(CONFIG_PROVIDER) || 'anthropic') as ProviderName;
		const configuredModel = this.configService.getValue<string>(CONFIG_MODEL) || '';
		const baseURL = this.configService.getValue<string>(CONFIG_BASE_URL) || undefined;
		const configuredAuthVariant = (this.configService.getValue<string>(CONFIG_AUTH_VARIANT) || 'default') as AuthVariantName;
		const authVariant = normalizeAuthVariantForProvider(providerName, configuredAuthVariant);
		const effectiveModel = modelForAuthVariant(providerName, configuredModel, authVariant);
		const authState = await this.authStateService.resolveAuth(providerName, effectiveModel, authVariant, baseURL);

		const catalogModels = await this.modelResolverService.resolveModels(
			providerName,
			authState.accessToken ?? authState.apiKey,
			authState.baseURL ?? baseURL,
			authState.identityKey,
			authState.authVariant,
		);

		const results: ILanguageModelChatMetadataAndIdentifier[] = catalogModels.map(m => ({
			identifier: `${VENDOR}/${m.id}`,
			metadata: {
				extension: EXTENSION_ID,
				name: m.name,
				id: `${VENDOR}/${m.id}`,
				vendor: VENDOR,
				version: '1.0',
				family: m.family,
				maxInputTokens: m.maxInputTokens,
				maxOutputTokens: m.maxOutputTokens,
				isDefaultForLocation: {
					[ChatAgentLocation.Chat]: false,
				},
				isUserSelectable: true,
				capabilities: capabilitiesForAuthVariant(authVariant),
				modelPickerCategory: undefined,
			} satisfies ILanguageModelChatMetadata,
		}));

		// If the user typed a custom model ID not in the catalog, include it
		const customModelId = authVariant === OPENAI_CODEX_AUTH_VARIANT ? effectiveModel : configuredModel;
		if (customModelId && !catalogModels.some(m => m.id === customModelId)) {
			results.push({
				identifier: `${VENDOR}/${customModelId}`,
				metadata: {
					extension: EXTENSION_ID,
					name: customModelId,
					id: `${VENDOR}/${customModelId}`,
					vendor: VENDOR,
					version: '1.0',
					family: 'custom',
					maxInputTokens: 128_000,
					maxOutputTokens: 8_192,
					isDefaultForLocation: {
						[ChatAgentLocation.Chat]: false,
					},
					isUserSelectable: true,
					capabilities: capabilitiesForAuthVariant(authVariant),
					modelPickerCategory: undefined,
				} satisfies ILanguageModelChatMetadata,
			});
		}

		return results;
	}

	async sendChatRequest(
		modelId: string,
		messages: IChatMessage[],
		_from: ExtensionIdentifier | undefined,
		_options: { [name: string]: unknown },
		token: CancellationToken,
	): Promise<ILanguageModelChatResponse> {
		// 1. Resolve model — catalog hit or custom model from config
		let shortId = modelId.replace(`${VENDOR}/`, '');
		let modelDef = findModelById(shortId);
		const providerName = (this.configService.getValue<string>(CONFIG_PROVIDER) || 'anthropic') as ProviderName;
		const effectiveProvider = (modelDef?.provider ?? providerName) as ProviderName;

		// 2. Resolve auth state through the same facade used by the Agent path
		const baseURL = this.configService.getValue<string>(CONFIG_BASE_URL) || undefined;
		let configuredAuthVariant = (this.configService.getValue<string>(CONFIG_AUTH_VARIANT) || 'default') as AuthVariantName;
		if (modelDef?.apiType === 'openai-codex') {
			configuredAuthVariant = OPENAI_CODEX_AUTH_VARIANT;
		}
		const authVariant = normalizeAuthVariantForProvider(effectiveProvider, configuredAuthVariant);
		shortId = modelForAuthVariant(effectiveProvider, shortId, authVariant);
		modelDef = findModelById(shortId);
		const apiType = effectiveProvider === 'openai' && authVariant === OPENAI_CODEX_AUTH_VARIANT
			? 'openai-codex'
			: modelDef?.apiType ?? providerToApiType(effectiveProvider);
		const maxOutputTokens = modelDef?.maxOutputTokens ?? 8_192;
		const authState = await this.authStateService.resolveAuth(effectiveProvider, shortId, authVariant, baseURL);
		if (authState.source === 'missing' || !authState.auth) {
			throw missingAuthError(authState);
		}

		// 3. Create provider with resolved auth/base/capabilities
		const provider = createProvider(apiType, {
			auth: authState.auth,
			baseURL: authState.baseURL,
			capabilities: authState.capabilities,
		});

		// 4. Convert VS Code messages → normalized format
		const normalizedMessages = this.convertMessages(messages);

		// 5. Create streaming response
		const stream = new AsyncIterableSource<IChatResponsePart>();
		const resultDeferred = new DeferredPromise<any>();

		// 6. Run in background
		(async () => {
			try {
				if (provider.createMessageStream) {
					for await (const event of provider.createMessageStream({
						model: shortId,
						maxTokens: maxOutputTokens,
						system: '',
						messages: normalizedMessages,
						abortSignal: this.createAbortSignal(token),
					})) {
						if (token.isCancellationRequested) { break; }

						if (event.type === 'text') {
							stream.emitOne({ type: 'text', value: event.text });
						} else if (event.type === 'thinking') {
							stream.emitOne({ type: 'thinking', value: event.thinking });
						}
					}
				} else {
					const response = await provider.createMessage({
						model: shortId,
						maxTokens: maxOutputTokens,
						system: '',
						messages: normalizedMessages,
					});
					for (const block of response.content) {
						if (block.type === 'text') {
							stream.emitOne({ type: 'text', value: block.text });
						}
					}
				}
				stream.resolve();
				resultDeferred.complete(undefined);
			} catch (err) {
				stream.reject(err as Error);
				resultDeferred.error(err as Error);
			}
		})();

		return {
			stream: stream.asyncIterable,
			result: resultDeferred.p,
		};
	}

	async provideTokenCount(
		_modelId: string,
		message: string | IChatMessage,
		_token: CancellationToken,
	): Promise<number> {
		const text = typeof message === 'string'
			? message
			: this.chatMessageToText(message);
		return estimateTokens(text);
	}

	// ========================================================================
	// Helpers
	// ========================================================================

	private convertMessages(messages: IChatMessage[]): NormalizedMessageParam[] {
		return messages.map(msg => ({
			role: msg.role === 1 ? 'assistant' : 'user', // ChatMessageRole enum: 1 = Assistant
			content: this.chatMessageToText(msg),
		}));
	}

	private chatMessageToText(message: IChatMessage): string {
		return message.content
			.filter((part): part is { type: 'text'; value: string } => part.type === 'text')
			.map(part => part.value)
			.join('') || '';
	}

	private createAbortSignal(token: CancellationToken): AbortSignal {
		const controller = new AbortController();
		token.onCancellationRequested(() => controller.abort());
		return controller.signal;
	}
}
