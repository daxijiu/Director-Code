/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Agent Engine Contribution
 *
 * Registers the Director Code Agent, Language Model Provider,
 * Settings Editor, and API Key Service with VS Code's systems.
 */

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../../common/contributions.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { IChatAgentService } from '../../common/participants/chatAgents.js';
import type { IChatAgentData } from '../../common/participants/chatAgents.js';
import { ChatAgentLocation, ChatModeKind } from '../../common/constants.js';
import { DirectorCodeAgent } from './directorCodeAgent.js';
import { DirectorCodeModelProvider } from './directorCodeModelProvider.js';
import { ILanguageModelsService } from '../../common/languageModels.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { IEditorPaneRegistry, EditorPaneDescriptor } from '../../../../browser/editor.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../../common/editor.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { localize, localize2 } from '../../../../../nls.js';
import {
	DirectorCodeSettingsEditor,
	DirectorCodeSettingsEditorInput,
	DirectorCodeSettingsEditorInputSerializer,
} from './directorCodeSettingsEditor.js';
import { IApiKeyService, ApiKeyService } from '../../common/agentEngine/apiKeyService.js';

// ============================================================================
// Service Registration
// ============================================================================

registerSingleton(IApiKeyService, ApiKeyService, InstantiationType.Delayed);

// ============================================================================
// Configuration Registration
// ============================================================================

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

configurationRegistry.registerConfiguration({
	id: 'directorCode',
	title: 'Director Code AI',
	type: 'object',
	properties: {
		'directorCode.ai.provider': {
			type: 'string',
			enum: ['anthropic', 'openai', 'gemini'],
			enumDescriptions: [
				'Anthropic (Claude)',
				'OpenAI (GPT-4, o3)',
				'Google (Gemini)',
			],
			default: 'anthropic',
			description: 'The LLM provider to use for Director Code Agent.',
		},
		'directorCode.ai.model': {
			type: 'string',
			default: 'claude-sonnet-4-6',
			description: 'The model ID to use (e.g., claude-sonnet-4-6, gpt-4o, gemini-2.5-pro).',
		},
		'directorCode.ai.baseURL': {
			type: 'string',
			default: '',
			description: 'Custom API base URL. Leave empty for default. Useful for proxies or compatible APIs (e.g., DeepSeek).',
		},
		'directorCode.ai.maxTurns': {
			type: 'number',
			default: 25,
			minimum: 1,
			maximum: 100,
			description: 'Maximum number of agentic turns (LLM calls) per request.',
		},
		'directorCode.ai.maxTokens': {
			type: 'number',
			default: 8192,
			minimum: 256,
			maximum: 100000,
			description: 'Maximum output tokens per LLM call.',
		},
	},
});

// ============================================================================
// Editor Registration
// ============================================================================

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		DirectorCodeSettingsEditor,
		DirectorCodeSettingsEditor.ID,
		localize('directorCodeSettingsEditor', "Director Code Settings Editor"),
	),
	[
		new SyncDescriptor(DirectorCodeSettingsEditorInput),
	],
);

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory)
	.registerEditorSerializer(DirectorCodeSettingsEditorInput.ID, DirectorCodeSettingsEditorInputSerializer);

// ============================================================================
// Commands
// ============================================================================

const OPEN_SETTINGS_COMMAND_ID = 'director-code.openSettings';

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: OPEN_SETTINGS_COMMAND_ID,
			title: localize2('directorCode.openSettings', "Director Code: Open Settings"),
			category: localize2('directorCode', "Director Code"),
			f1: true,
		});
	}
	async run(accessor: ServicesAccessor) {
		const editorService = accessor.get(IEditorService);
		return editorService.openEditor(
			new DirectorCodeSettingsEditorInput(),
			{ pinned: true },
		);
	}
});

// ============================================================================
// Agent + Model Provider Registration
// ============================================================================

const AGENT_ID = 'director-code';
const EXTENSION_ID = new ExtensionIdentifier('director-code.agent');
const VENDOR = 'director-code';

class DirectorCodeAgentContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.directorCodeAgent';

	constructor(
		@IChatAgentService agentService: IChatAgentService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService _configService: IConfigurationService,
		@ILanguageModelsService languageModelsService: ILanguageModelsService,
	) {
		super();

		// Register the Director Code Agent
		const agentData: IChatAgentData = {
			id: AGENT_ID,
			name: 'Director Code',
			fullName: 'Director Code AI Agent',
			description: 'AI coding agent powered by your own API keys (Anthropic, OpenAI, Gemini)',
			extensionId: EXTENSION_ID,
			extensionVersion: '0.1.0',
			extensionPublisherId: 'director-code',
			extensionDisplayName: 'Director Code',
			publisherDisplayName: 'Director Code',
			isDynamic: true,
			isCore: true,
			metadata: {
				helpTextPrefix: 'Director Code Agent — use your own LLM API keys for AI coding assistance.',
			},
			slashCommands: [],
			locations: [ChatAgentLocation.Panel, ChatAgentLocation.Editor, ChatAgentLocation.Terminal],
			modes: [ChatModeKind.Agent],
			disambiguation: [{
				category: 'coding',
				description: 'AI coding assistant with tool use',
				examples: ['help me write code', 'fix this bug', 'refactor this function'],
			}],
			capabilities: {
				supportsFileAttachments: true,
				supportsToolAttachments: true,
			},
		};

		const agentImpl = instantiationService.createInstance(DirectorCodeAgent);
		this._register(agentService.registerDynamicAgent(agentData, agentImpl));

		// Register the Language Model Provider
		// Step 1: Register vendor descriptor (required before registerLanguageModelProvider)
		// The _vendors Map must contain our vendor or registerLanguageModelProvider throws.
		languageModelsService.deltaLanguageModelChatProviderDescriptors(
			[{ vendor: VENDOR, displayName: 'Director Code' }],
			[],
		);
		this._register(toDisposable(() => {
			languageModelsService.deltaLanguageModelChatProviderDescriptors(
				[],
				[{ vendor: VENDOR, displayName: 'Director Code' }],
			);
		}));

		// Step 2: Register provider (now safe — vendor is known)
		const modelProvider = instantiationService.createInstance(DirectorCodeModelProvider);
		this._register(languageModelsService.registerLanguageModelProvider(VENDOR, modelProvider));
	}
}

registerWorkbenchContribution2(
	DirectorCodeAgentContribution.ID,
	DirectorCodeAgentContribution,
	WorkbenchPhase.AfterRestored,
);
