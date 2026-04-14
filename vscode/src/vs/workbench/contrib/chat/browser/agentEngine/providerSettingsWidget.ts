/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Provider Settings Widget
 *
 * UI widget for configuring the LLM provider, model, base URL,
 * and advanced parameters (max turns, max tokens).
 * Reads and writes to IConfigurationService directly.
 */

import './media/directorCodeSettings.css';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../../base/common/event.js';
import * as DOM from '../../../../../base/browser/dom.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { SUPPORTED_PROVIDERS, PROVIDER_DISPLAY_NAMES, providerRequiresBaseURL, type ProviderName } from '../../common/agentEngine/apiKeyService.js';
import { getModelsForProvider, getDefaultModel, providerSupportsCustomModels } from '../../common/agentEngine/modelCatalog.js';

const $ = DOM.$;

// ============================================================================
// Configuration keys (must match agentEngine.contribution.ts)
// ============================================================================

const CONFIG_PROVIDER = 'directorCode.ai.provider';
const CONFIG_MODEL = 'directorCode.ai.model';
const CONFIG_BASE_URL = 'directorCode.ai.baseURL';
const CONFIG_MAX_TURNS = 'directorCode.ai.maxTurns';
const CONFIG_MAX_TOKENS = 'directorCode.ai.maxTokens';
const CONFIG_MAX_INPUT_TOKENS = 'directorCode.ai.maxInputTokens';

// ============================================================================
// ProviderSettingsWidget
// ============================================================================

export class ProviderSettingsWidget extends Disposable {

	private readonly _onDidChangeContentHeight = this._register(new Emitter<number>());
	readonly onDidChangeContentHeight = this._onDidChangeContentHeight.event;

	readonly element: HTMLElement;

	private providerSelect!: HTMLSelectElement;
	private modelSelect!: HTMLSelectElement;
	private modelCustomInput!: HTMLInputElement;
	private modelCustomRow!: HTMLElement;
	private baseURLInput!: HTMLInputElement;
	private baseURLRow!: HTMLElement;
	private baseURLHint!: HTMLElement;
	private maxTurnsInput!: HTMLInputElement;
	private maxTokensInput!: HTMLInputElement;
	private maxInputTokensInput!: HTMLInputElement;

	private _updating = false;

	constructor(
		@IConfigurationService private readonly configService: IConfigurationService,
	) {
		super();

		this.element = $('.director-code-provider-settings-widget');
		this.create(this.element);
		this.loadFromConfig();

		// Listen for external config changes
		this._register(this.configService.onDidChangeConfiguration(e => {
			if (!this._updating && (
				e.affectsConfiguration(CONFIG_PROVIDER) ||
				e.affectsConfiguration(CONFIG_MODEL) ||
				e.affectsConfiguration(CONFIG_BASE_URL) ||
				e.affectsConfiguration(CONFIG_MAX_TURNS) ||
				e.affectsConfiguration(CONFIG_MAX_TOKENS) ||
				e.affectsConfiguration(CONFIG_MAX_INPUT_TOKENS)
			)) {
				this.loadFromConfig();
			}
		}));
	}

	private create(parent: HTMLElement): void {
		const header = DOM.append(parent, $('.dc-section-header'));
		header.textContent = localize('providerSettings.title', 'Provider Configuration');

		const subtitle = DOM.append(parent, $('.dc-section-subtitle'));
		subtitle.textContent = localize('providerSettings.subtitle', 'Select the LLM provider and model for the AI agent.');

		const form = DOM.append(parent, $('.dc-settings-form'));

		// Provider select
		this.providerSelect = this.createSelectRow(
			form,
			localize('providerSettings.provider', 'Provider'),
			SUPPORTED_PROVIDERS.map(p => ({ value: p, label: PROVIDER_DISPLAY_NAMES[p] })),
		);

		// Model select (populated dynamically from catalog)
		this.modelSelect = this.createSelectRow(
			form,
			localize('providerSettings.model', 'Model'),
			[],
		);

		// Custom model input (shown for compatible providers)
		this.modelCustomRow = DOM.append(form, $('.dc-form-row'));
		const customModelLabel = DOM.append(this.modelCustomRow, $<HTMLLabelElement>('label.dc-form-label'));
		customModelLabel.textContent = localize('providerSettings.customModel', 'Custom Model ID');
		this.modelCustomInput = DOM.append(this.modelCustomRow, $<HTMLInputElement>('input.dc-form-input'));
		this.modelCustomInput.type = 'text';
		this.modelCustomInput.placeholder = localize('providerSettings.customModelPlaceholder', 'Type a model ID (e.g. deepseek-chat, llama-3.1-70b)');
		this.modelCustomInput.autocomplete = 'off';
		const customModelHint = DOM.append(this.modelCustomRow, $('.dc-form-hint'));
		customModelHint.textContent = localize('providerSettings.customModelHint', 'Select a preset above or type any model ID your API endpoint supports.');

		// Base URL
		this.baseURLRow = DOM.append(form, $('.dc-form-row'));
		const baseURLLabel = DOM.append(this.baseURLRow, $<HTMLLabelElement>('label.dc-form-label'));
		baseURLLabel.textContent = localize('providerSettings.baseURL', 'Base URL');
		this.baseURLInput = DOM.append(this.baseURLRow, $<HTMLInputElement>('input.dc-form-input'));
		this.baseURLInput.type = 'text';
		this.baseURLInput.placeholder = localize('providerSettings.baseURLPlaceholder', 'Leave empty for default. Use for proxies or compatible APIs.');
		this.baseURLInput.autocomplete = 'off';
		this.baseURLHint = DOM.append(this.baseURLRow, $('.dc-form-hint'));

		// Max Turns
		this.maxTurnsInput = this.createInputRow(
			form,
			localize('providerSettings.maxTurns', 'Max Turns'),
			'25',
			'number',
		);
		this.maxTurnsInput.min = '1';
		this.maxTurnsInput.max = '100';

		// Max Tokens
		this.maxTokensInput = this.createInputRow(
			form,
			localize('providerSettings.maxTokens', 'Max Output Tokens'),
			'8192',
			'number',
		);
		this.maxTokensInput.min = '256';
		this.maxTokensInput.max = '100000';

		// Max Input Tokens (context length)
		this.maxInputTokensInput = this.createInputRow(
			form,
			localize('providerSettings.maxInputTokens', 'Context Window (Max Input Tokens)'),
			localize('providerSettings.maxInputTokensPlaceholder', '0 = use model default'),
			'number',
		);
		this.maxInputTokensInput.min = '0';
		this.maxInputTokensInput.max = '2000000';

		// Event handlers
		this._register(DOM.addDisposableListener(this.providerSelect, 'change', () => {
			this.onProviderChanged();
		}));
		this._register(DOM.addDisposableListener(this.modelSelect, 'change', () => {
			const value = this.modelSelect.value;
			this.saveToConfig(CONFIG_MODEL, value);
			if (this.modelCustomInput) {
				this.modelCustomInput.value = value;
			}
		}));
		this._register(DOM.addDisposableListener(this.modelCustomInput, 'change', () => {
			const value = this.modelCustomInput.value.trim();
			if (value) {
				this.saveToConfig(CONFIG_MODEL, value);
			}
		}));
		this._register(DOM.addDisposableListener(this.baseURLInput, 'change', () => {
			this.saveToConfig(CONFIG_BASE_URL, this.baseURLInput.value);
		}));
		this._register(DOM.addDisposableListener(this.maxTurnsInput, 'change', () => {
			const val = parseInt(this.maxTurnsInput.value, 10);
			if (!isNaN(val) && val >= 1 && val <= 100) {
				this.saveToConfig(CONFIG_MAX_TURNS, val);
			}
		}));
		this._register(DOM.addDisposableListener(this.maxTokensInput, 'change', () => {
			const val = parseInt(this.maxTokensInput.value, 10);
			if (!isNaN(val) && val >= 256 && val <= 100000) {
				this.saveToConfig(CONFIG_MAX_TOKENS, val);
			}
		}));
		this._register(DOM.addDisposableListener(this.maxInputTokensInput, 'change', () => {
			const val = parseInt(this.maxInputTokensInput.value, 10);
			if (!isNaN(val) && val >= 0 && val <= 2000000) {
				this.saveToConfig(CONFIG_MAX_INPUT_TOKENS, val);
			}
		}));
	}

	// ====================================================================
	// Config <-> UI Sync
	// ====================================================================

	private loadFromConfig(): void {
		const provider = (this.configService.getValue<string>(CONFIG_PROVIDER) || 'anthropic') as ProviderName;
		const model = this.configService.getValue<string>(CONFIG_MODEL) || 'claude-sonnet-4-6';
		const baseURL = this.configService.getValue<string>(CONFIG_BASE_URL) || '';
		const maxTurns = this.configService.getValue<number>(CONFIG_MAX_TURNS) || 25;
		const maxTokens = this.configService.getValue<number>(CONFIG_MAX_TOKENS) || 8192;
		const maxInputTokens = this.configService.getValue<number>(CONFIG_MAX_INPUT_TOKENS) || 0;

		this.providerSelect.value = provider;
		this.populateModelSelect(provider);
		this.modelSelect.value = model;
		this.modelCustomInput.value = model;
		this.baseURLInput.value = baseURL;
		this.maxTurnsInput.value = String(maxTurns);
		this.maxTokensInput.value = String(maxTokens);
		this.maxInputTokensInput.value = String(maxInputTokens);

		this.updateProviderUI(provider);

		const height = this.element.offsetHeight || 300;
		this._onDidChangeContentHeight.fire(height);
	}

	private onProviderChanged(): void {
		const provider = this.providerSelect.value as ProviderName;
		this.populateModelSelect(provider);

		const defaultModel = getDefaultModel(provider);
		this.modelSelect.value = defaultModel;
		this.modelCustomInput.value = defaultModel;

		this.updateProviderUI(provider);

		this._updating = true;
		try {
			this.configService.updateValue(CONFIG_PROVIDER, provider, ConfigurationTarget.USER);
			this.configService.updateValue(CONFIG_MODEL, defaultModel, ConfigurationTarget.USER);
		} finally {
			this._updating = false;
		}
	}

	private updateProviderUI(provider: ProviderName): void {
		const supportsCustom = providerSupportsCustomModels(provider);
		const requiresURL = providerRequiresBaseURL(provider);

		// Show/hide custom model input
		this.modelCustomRow.style.display = supportsCustom ? '' : 'none';

		// Update base URL hint
		if (requiresURL) {
			this.baseURLHint.textContent = localize('providerSettings.baseURLRequired',
				'Required. Enter the API base URL for your provider (e.g. https://api.deepseek.com).');
			this.baseURLInput.placeholder = localize('providerSettings.baseURLRequiredPlaceholder',
				'https://api.your-provider.com');
		} else {
			this.baseURLHint.textContent = localize('providerSettings.baseURLOptional',
				'Optional. Leave empty to use the official API endpoint.');
			this.baseURLInput.placeholder = localize('providerSettings.baseURLOptionalPlaceholder',
				'Leave empty for default');
		}
	}

	private populateModelSelect(provider: ProviderName): void {
		// Clear existing options
		while (this.modelSelect.options.length > 0) {
			this.modelSelect.remove(0);
		}

		const models = getModelsForProvider(provider);
		for (const model of models) {
			const option = document.createElement('option');
			option.value = model.id;
			option.textContent = model.name;
			this.modelSelect.appendChild(option);
		}
	}

	private saveToConfig(key: string, value: string | number): void {
		this._updating = true;
		try {
			this.configService.updateValue(key, value, ConfigurationTarget.USER);
		} finally {
			this._updating = false;
		}
	}

	// ====================================================================
	// DOM Helpers
	// ====================================================================

	private createSelectRow(parent: HTMLElement, labelText: string, options: { value: string; label: string }[]): HTMLSelectElement {
		const row = DOM.append(parent, $('.dc-form-row'));

		const label = DOM.append(row, $<HTMLLabelElement>('label.dc-form-label'));
		label.textContent = labelText;

		const select = DOM.append(row, $<HTMLSelectElement>('select.dc-form-select'));
		for (const opt of options) {
			const option = document.createElement('option');
			option.value = opt.value;
			option.textContent = opt.label;
			select.appendChild(option);
		}

		return select;
	}

	private createInputRow(parent: HTMLElement, labelText: string, placeholder: string, type: string = 'text'): HTMLInputElement {
		const row = DOM.append(parent, $('.dc-form-row'));

		const label = DOM.append(row, $<HTMLLabelElement>('label.dc-form-label'));
		label.textContent = labelText;

		const input = DOM.append(row, $<HTMLInputElement>('input.dc-form-input'));
		input.type = type;
		input.placeholder = placeholder;
		input.autocomplete = 'off';

		return input;
	}
}
