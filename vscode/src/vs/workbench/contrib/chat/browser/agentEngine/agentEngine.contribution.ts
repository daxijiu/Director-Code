/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Agent Engine Contribution
 *
 * Registers the Director Code Agent and Language Model Provider
 * with VS Code's Chat system during workbench startup.
 */

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../../common/contributions.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { IChatAgentService } from '../../common/participants/chatAgents.js';
import type { IChatAgentData } from '../../common/participants/chatAgents.js';
import { ChatAgentLocation, ChatModeKind } from '../../common/constants.js';
import { DirectorCodeAgent } from './directorCodeAgent.js';

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
// Agent Registration
// ============================================================================

const AGENT_ID = 'director-code';
const EXTENSION_ID = new ExtensionIdentifier('director-code.agent');

class DirectorCodeAgentContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.directorCodeAgent';

	constructor(
		@IChatAgentService agentService: IChatAgentService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService _configService: IConfigurationService,
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

		// Note: Language Model Provider registration will be added in Week 4-5
		// when the Settings UI is ready. For now, the agent uses the
		// provider directly without going through VS Code's model selection.
	}
}

registerWorkbenchContribution2(
	DirectorCodeAgentContribution.ID,
	DirectorCodeAgentContribution,
	WorkbenchPhase.AfterRestored,
);
