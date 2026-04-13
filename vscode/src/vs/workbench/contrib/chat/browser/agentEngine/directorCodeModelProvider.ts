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
import { ISecretStorageService } from '../../../../../platform/secrets/common/secrets.js';
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
import type { ApiType, NormalizedMessageParam } from '../../common/agentEngine/providers/providerTypes.js';
import { createProvider } from '../../common/agentEngine/providers/providerFactory.js';
import { estimateTokens, getContextWindowSize } from '../../common/agentEngine/tokens.js';
import { ChatAgentLocation } from '../../common/constants.js';

// ============================================================================
// Configuration
// ============================================================================

const VENDOR = 'director-code';
const CONFIG_PROVIDER = 'directorCode.ai.provider';
const CONFIG_MODEL = 'directorCode.ai.model';
const CONFIG_BASE_URL = 'directorCode.ai.baseURL';
const SECRET_KEY_PREFIX = 'director-code.apiKey';

const EXTENSION_ID = new ExtensionIdentifier('director-code.agent');

// ============================================================================
// Model Definitions
// ============================================================================

interface ModelDefinition {
	id: string;
	name: string;
	family: string;
	apiType: ApiType;
	providerName: string;
	maxInputTokens: number;
	maxOutputTokens: number;
}

/** Built-in model catalog. Users can select from these. */
const MODEL_CATALOG: ModelDefinition[] = [
	// Anthropic
	{ id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', family: 'claude-4', apiType: 'anthropic-messages', providerName: 'anthropic', maxInputTokens: 200_000, maxOutputTokens: 8_192 },
	{ id: 'claude-opus-4-6', name: 'Claude Opus 4.6', family: 'claude-4', apiType: 'anthropic-messages', providerName: 'anthropic', maxInputTokens: 200_000, maxOutputTokens: 8_192 },
	{ id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', family: 'claude-4', apiType: 'anthropic-messages', providerName: 'anthropic', maxInputTokens: 200_000, maxOutputTokens: 8_192 },
	// OpenAI
	{ id: 'gpt-4o', name: 'GPT-4o', family: 'gpt-4', apiType: 'openai-completions', providerName: 'openai', maxInputTokens: 128_000, maxOutputTokens: 4_096 },
	{ id: 'gpt-4o-mini', name: 'GPT-4o Mini', family: 'gpt-4', apiType: 'openai-completions', providerName: 'openai', maxInputTokens: 128_000, maxOutputTokens: 4_096 },
	{ id: 'o3', name: 'o3', family: 'o-series', apiType: 'openai-completions', providerName: 'openai', maxInputTokens: 200_000, maxOutputTokens: 100_000 },
	// Gemini
	{ id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', family: 'gemini-2', apiType: 'gemini-generative', providerName: 'gemini', maxInputTokens: 1_000_000, maxOutputTokens: 8_192 },
	{ id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', family: 'gemini-2', apiType: 'gemini-generative', providerName: 'gemini', maxInputTokens: 1_000_000, maxOutputTokens: 8_192 },
];

// ============================================================================
// DirectorCodeModelProvider
// ============================================================================

export class DirectorCodeModelProvider implements ILanguageModelChatProvider {

	private readonly _onDidChange = new Emitter<void>();
	readonly onDidChange: Event<void> = this._onDidChange.event;

	constructor(
		@IConfigurationService private readonly configService: IConfigurationService,
		@ISecretStorageService private readonly secretService: ISecretStorageService,
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

		// Filter models by the configured provider
		const models = MODEL_CATALOG.filter(m => m.providerName === providerName);

		return models.map(m => ({
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
					[ChatAgentLocation.Panel]: false,
				},
				isUserSelectable: true,
				capabilities: {
					vision: true,
					toolCalling: true,
					agentMode: true,
				},
			} satisfies ILanguageModelChatMetadata,
		}));
	}

	async sendChatRequest(
		modelId: string,
		messages: IChatMessage[],
		_from: ExtensionIdentifier | undefined,
		_options: { [name: string]: unknown },
		token: CancellationToken,
	): Promise<ILanguageModelChatResponse> {
		// 1. Find model definition
		const shortId = modelId.replace(`${VENDOR}/`, '');
		const modelDef = MODEL_CATALOG.find(m => m.id === shortId);
		if (!modelDef) {
			throw new Error(`Unknown model: ${modelId}`);
		}

		// 2. Get API key
		const apiKey = await this.secretService.get(`${SECRET_KEY_PREFIX}.${modelDef.providerName}`);
		if (!apiKey) {
			throw new Error(`No API key configured for ${modelDef.providerName}`);
		}

		// 3. Create provider
		const baseURL = this.configService.getValue<string>(CONFIG_BASE_URL) || undefined;
		const provider = createProvider(modelDef.apiType, { apiKey, baseURL });

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
						maxTokens: modelDef.maxOutputTokens,
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
					// Non-streaming fallback
					const response = await provider.createMessage({
						model: shortId,
						maxTokens: modelDef.maxOutputTokens,
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
			content: msg.content?.value || '',
		}));
	}

	private chatMessageToText(message: IChatMessage): string {
		return message.content?.value || '';
	}

	private createAbortSignal(token: CancellationToken): AbortSignal {
		const controller = new AbortController();
		token.onCancellationRequested(() => controller.abort());
		return controller.signal;
	}
}
