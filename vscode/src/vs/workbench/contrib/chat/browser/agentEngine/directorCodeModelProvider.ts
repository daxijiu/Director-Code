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
import type { NormalizedMessageParam } from '../../common/agentEngine/providers/providerTypes.js';
import { createProvider } from '../../common/agentEngine/providers/providerFactory.js';
import { estimateTokens } from '../../common/agentEngine/tokens.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { IApiKeyService, providerToApiType, type ProviderName } from '../../common/agentEngine/apiKeyService.js';
import { MODEL_CATALOG, findModelById } from '../../common/agentEngine/modelCatalog.js';

// ============================================================================
// Configuration
// ============================================================================

const VENDOR = 'director-code';
const CONFIG_PROVIDER = 'directorCode.ai.provider';
const CONFIG_MODEL = 'directorCode.ai.model';
const CONFIG_BASE_URL = 'directorCode.ai.baseURL';

const EXTENSION_ID = new ExtensionIdentifier('director-code.agent');

// ============================================================================
// DirectorCodeModelProvider
// ============================================================================

export class DirectorCodeModelProvider implements ILanguageModelChatProvider {

	private readonly _onDidChange = new Emitter<void>();
	readonly onDidChange: Event<void> = this._onDidChange.event;

	constructor(
		@IConfigurationService private readonly configService: IConfigurationService,
		@IApiKeyService private readonly apiKeyService: IApiKeyService,
	) {
		// Listen for configuration changes to refresh model list
		this.configService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(CONFIG_PROVIDER) || e.affectsConfiguration(CONFIG_MODEL)) {
				this._onDidChange.fire();
			}
		});
	}

	async provideLanguageModelChatInfo(
		_options: ILanguageModelChatInfoOptions,
		_token: CancellationToken,
	): Promise<ILanguageModelChatMetadataAndIdentifier[]> {
		const providerName = this.configService.getValue<string>(CONFIG_PROVIDER) || 'anthropic';
		const configuredModel = this.configService.getValue<string>(CONFIG_MODEL) || '';

		// Filter catalog models by the configured provider
		const catalogModels = MODEL_CATALOG.filter(m => m.provider === providerName);

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
				capabilities: {
					vision: true,
					toolCalling: true,
					agentMode: true,
				},
				modelPickerCategory: undefined,
			} satisfies ILanguageModelChatMetadata,
		}));

		// If the user typed a custom model ID not in the catalog, include it
		if (configuredModel && !catalogModels.some(m => m.id === configuredModel)) {
			results.push({
				identifier: `${VENDOR}/${configuredModel}`,
				metadata: {
					extension: EXTENSION_ID,
					name: configuredModel,
					id: `${VENDOR}/${configuredModel}`,
					vendor: VENDOR,
					version: '1.0',
					family: 'custom',
					maxInputTokens: 128_000,
					maxOutputTokens: 8_192,
					isDefaultForLocation: {
						[ChatAgentLocation.Chat]: false,
					},
					isUserSelectable: true,
					capabilities: {
						vision: true,
						toolCalling: true,
						agentMode: true,
					},
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
		const shortId = modelId.replace(`${VENDOR}/`, '');
		const modelDef = findModelById(shortId);
		const providerName = (this.configService.getValue<string>(CONFIG_PROVIDER) || 'anthropic') as ProviderName;
		const effectiveProvider = modelDef?.provider ?? providerName;
		const apiType = modelDef?.apiType ?? providerToApiType(providerName);
		const maxOutputTokens = modelDef?.maxOutputTokens ?? 8_192;

		// 2. Get API key
		const apiKey = await this.apiKeyService.getApiKey(effectiveProvider as ProviderName);
		if (!apiKey) {
			throw new Error(`No API key configured for ${effectiveProvider}`);
		}

		// 3. Create provider with explicit auth structure
		const baseURL = this.configService.getValue<string>(CONFIG_BASE_URL) || undefined;
		const provider = createProvider(apiType, { auth: { kind: 'api-key', value: apiKey }, baseURL }); // [Director-Code] B1-1

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
