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
import { SUPPORTED_PROVIDERS, PROVIDER_DISPLAY_NAMES, type ProviderName } from '../../common/agentEngine/apiKeyService.js';
import { getModelsForProvider, getDefaultModel } from '../../common/agentEngine/modelCatalog.js';

const $ = DOM.$;

// ============================================================================
// Configuration keys (must match agentEngine.contribution.ts)
// ============================================================================

const CONFIG_PROVIDER = 'directorCode.ai.provider';
const CONFIG_MODEL = 'directorCode.ai.model';
const CONFIG_BASE_URL = 'directorCode.ai.baseURL';
const CONFIG_MAX_TURNS = 'directorCode.ai.maxTurns';
const CONFIG_MAX_TOKENS = 'directorCode.ai.maxTokens';

// ============================================================================
// ProviderSettingsWidget
// ============================================================================

export class ProviderSettingsWidget extends Disposable {

	private readonly _onDidChangeContentHeight = this._register(new Emitter<number>());
	readonly onDidChangeContentHeight = this._onDidChangeContentHeight.event;

	readonly element: HTMLElement;

	private providerSelect!: HTMLSelectElement;
	private modelSelect!: HTMLSelectElement;
	private baseURLInput!: HTMLInputElement;
	private maxTurnsInput!: HTMLInputElement;
	private maxTokensInput!: HTMLInputElement;

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
				e.affectsConfiguration(CONFIG_MAX_TOKENS)
			)) {
				this.loadFromConfig();
			}
		}));
	}

	private create(parent: HTMLElement): void {
		// Section header
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

		// Model select (populated dynamically)
		this.modelSelect = this.createSelectRow(
			form,
			localize('providerSettings.model', 'Model'),
			[],
		);

		// Base URL
		this.baseURLInput = this.createInputRow(
			form,
			localize('providerSettings.baseURL', 'Base URL (optional)'),
			localize('providerSettings.baseURLPlaceholder', 'Leave empty for default. Use for proxies or compatible APIs.'),
		);

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

		// Event handlers
		this._register(DOM.addDisposableListener(this.providerSelect, 'change', () => {
			this.onProviderChanged();
		}));
		this._register(DOM.addDisposableListener(this.modelSelect, 'change', () => {
			this.saveToConfig(CONFIG_MODEL, this.modelSelect.value);
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

		this.providerSelect.value = provider;
		this.populateModelSelect(provider);
		this.modelSelect.value = model;
		this.baseURLInput.value = baseURL;
		this.maxTurnsInput.value = String(maxTurns);
		this.maxTokensInput.value = String(maxTokens);

		const height = this.element.offsetHeight || 300;
		this._onDidChangeContentHeight.fire(height);
	}

	private onProviderChanged(): void {
		const provider = this.providerSelect.value as ProviderName;
		this.populateModelSelect(provider);

		// Auto-select first model of new provider
		const defaultModel = getDefaultModel(provider);
		this.modelSelect.value = defaultModel;

		// Save both provider and model
		this._updating = true;
		try {
			this.configService.updateValue(CONFIG_PROVIDER, provider, ConfigurationTarget.USER);
			this.configService.updateValue(CONFIG_MODEL, defaultModel, ConfigurationTarget.USER);
		} finally {
			this._updating = false;
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
