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
import { IAuthStateService, normalizeAuthVariantForProvider } from '../../common/agentEngine/authStateService.js';
import { IModelResolverService } from '../../common/agentEngine/modelResolver.js';
import { getModelsForProviderAndAuthVariant, getDefaultModelForAuthVariant, providerSupportsCustomModels } from '../../common/agentEngine/modelCatalog.js';
import { PendingConfigurationWrites } from '../../common/agentEngine/settingsWriteQueue.js';
import { DEFAULT_AUTH_VARIANT, OPENAI_CODEX_AUTH_VARIANT, type AuthVariantName } from '../../common/agentEngine/providers/providerTypes.js';

const $ = DOM.$;

// ============================================================================
// Configuration keys (must match agentEngine.contribution.ts)
// ============================================================================

const CONFIG_PROVIDER = 'directorCode.ai.provider';
const CONFIG_MODEL = 'directorCode.ai.model';
const CONFIG_BASE_URL = 'directorCode.ai.baseURL';
const CONFIG_AUTH_VARIANT = 'directorCode.ai.authVariant';
const CONFIG_COMPACT_MODEL = 'directorCode.ai.compactModel';
const CONFIG_MAX_TURNS = 'directorCode.ai.maxTurns';
const CONFIG_MAX_TOKENS = 'directorCode.ai.maxTokens';
const CONFIG_MAX_INPUT_TOKENS = 'directorCode.ai.maxInputTokens';
const CONFIG_DEBOUNCE_DELAY_MS = 500;

// ============================================================================
// ProviderSettingsWidget
// ============================================================================

export class ProviderSettingsWidget extends Disposable {

	private readonly _onDidChangeContentHeight = this._register(new Emitter<number>());
	readonly onDidChangeContentHeight = this._onDidChangeContentHeight.event;

	readonly element: HTMLElement;

	private providerSelect!: HTMLSelectElement;
	private authVariantRow!: HTMLElement;
	private authVariantSelect!: HTMLSelectElement;
	private modelSelect!: HTMLSelectElement;
	private modelCustomInput!: HTMLInputElement;
	private modelCustomRow!: HTMLElement;
	private compactModelInput!: HTMLInputElement;
	private baseURLInput!: HTMLInputElement;
	private baseURLRow!: HTMLElement;
	private baseURLHint!: HTMLElement;
	private refreshModelsBtn!: HTMLButtonElement;
	private refreshModelsResult!: HTMLElement;
	private maxTurnsInput!: HTMLInputElement;
	private maxTokensInput!: HTMLInputElement;
	private maxInputTokensInput!: HTMLInputElement;

	private _updating = false;
	private readonly pendingWrites: PendingConfigurationWrites;
	private authRefreshGeneration = 0;

	constructor(
		@IConfigurationService private readonly configService: IConfigurationService,
		@IAuthStateService private readonly authStateService: IAuthStateService,
		@IModelResolverService private readonly modelResolverService: IModelResolverService,
	) {
		super();
		this.pendingWrites = new PendingConfigurationWrites((key, value) => this.writeConfigNow(key, value), CONFIG_DEBOUNCE_DELAY_MS);

		this.element = $('.director-code-provider-settings-widget');
		this.create(this.element);
		this.loadFromConfig();

		// Listen for external config changes
		this._register(this.configService.onDidChangeConfiguration(e => {
			if (!this._updating && (
				e.affectsConfiguration(CONFIG_PROVIDER) ||
				e.affectsConfiguration(CONFIG_MODEL) ||
				e.affectsConfiguration(CONFIG_BASE_URL) ||
				e.affectsConfiguration(CONFIG_AUTH_VARIANT) ||
				e.affectsConfiguration(CONFIG_COMPACT_MODEL) ||
				e.affectsConfiguration(CONFIG_MAX_TURNS) ||
				e.affectsConfiguration(CONFIG_MAX_TOKENS) ||
				e.affectsConfiguration(CONFIG_MAX_INPUT_TOKENS)
			)) {
				this.loadFromConfig();
			}
		}));

		this._register(this.authStateService.onDidChangeAuthState(provider => {
			if (provider === this.getCurrentProvider()) {
				void this.refreshAuthBoundUI();
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

		this.authVariantRow = DOM.append(form, $('.dc-form-row'));
		const authVariantLabel = DOM.append(this.authVariantRow, $<HTMLLabelElement>('label.dc-form-label'));
		authVariantLabel.textContent = localize('providerSettings.authMethod', 'Authentication');
		this.authVariantSelect = DOM.append(this.authVariantRow, $<HTMLSelectElement>('select.dc-form-select'));
		this.appendOption(this.authVariantSelect, DEFAULT_AUTH_VARIANT, localize('providerSettings.authDefault', 'API Key / OpenAI API'));
		this.appendOption(this.authVariantSelect, OPENAI_CODEX_AUTH_VARIANT, localize('providerSettings.authOpenAICodex', 'OpenAI (ChatGPT/Codex OAuth)'));
		const authVariantHint = DOM.append(this.authVariantRow, $('.dc-form-hint'));
		authVariantHint.textContent = localize('providerSettings.authHint', 'OAuth is only available for supported providers and is resolved separately from API keys.');

		// Model select (populated dynamically from catalog)
		this.modelSelect = this.createSelectRow(
			form,
			localize('providerSettings.model', 'Model'),
			[],
		);

		const refreshRow = DOM.append(form, $('.dc-action-row.dc-model-refresh-row'));
		this.refreshModelsBtn = DOM.append(refreshRow, $<HTMLButtonElement>('button.dc-btn.dc-btn-secondary'));
		this.refreshModelsBtn.type = 'button';
		this.refreshModelsBtn.textContent = localize('providerSettings.refreshModels', 'Refresh Models');
		this.refreshModelsResult = DOM.append(refreshRow, $('.dc-test-result'));

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

		this.compactModelInput = this.createInputRow(
			form,
			localize('providerSettings.compactModel', 'Compact Model'),
			localize('providerSettings.compactModelPlaceholder', 'Blank = provider default small model'),
			'text',
		);

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
		this._register(DOM.addDisposableListener(this.authVariantSelect, 'change', () => {
			this.onAuthVariantChanged();
		}));
		this._register(DOM.addDisposableListener(this.modelSelect, 'change', () => {
			const value = this.modelSelect.value;
			if (!value) {
				return;
			}
			this.queueConfigWrite(CONFIG_MODEL, value);
			if (this.modelCustomInput) {
				this.modelCustomInput.value = value;
			}
		}));
		this._register(DOM.addDisposableListener(this.refreshModelsBtn, 'click', () => {
			void this.refreshModels();
		}));
		this._register(DOM.addDisposableListener(this.modelCustomInput, 'input', () => {
			const value = this.modelCustomInput.value.trim();
			if (value) {
				this.queueConfigWrite(CONFIG_MODEL, value);
			}
		}));
		this._register(DOM.addDisposableListener(this.compactModelInput, 'input', () => {
			this.queueConfigWrite(CONFIG_COMPACT_MODEL, this.compactModelInput.value.trim());
		}));
		this._register(DOM.addDisposableListener(this.baseURLInput, 'input', () => {
			this.queueConfigWrite(CONFIG_BASE_URL, this.baseURLInput.value);
		}));
		this._register(DOM.addDisposableListener(this.maxTurnsInput, 'input', () => {
			const val = parseInt(this.maxTurnsInput.value, 10);
			if (!isNaN(val) && val >= 1 && val <= 100) {
				this.queueConfigWrite(CONFIG_MAX_TURNS, val);
			}
		}));
		this._register(DOM.addDisposableListener(this.maxTokensInput, 'input', () => {
			const val = parseInt(this.maxTokensInput.value, 10);
			if (!isNaN(val) && val >= 256 && val <= 100000) {
				this.queueConfigWrite(CONFIG_MAX_TOKENS, val);
			}
		}));
		this._register(DOM.addDisposableListener(this.maxInputTokensInput, 'input', () => {
			const val = parseInt(this.maxInputTokensInput.value, 10);
			if (!isNaN(val) && val >= 0 && val <= 2000000) {
				this.queueConfigWrite(CONFIG_MAX_INPUT_TOKENS, val);
			}
		}));
	}

	// ====================================================================
	// Config <-> UI Sync
	// ====================================================================

	private loadFromConfig(): void {
		const provider = (this.configService.getValue<string>(CONFIG_PROVIDER) || 'anthropic') as ProviderName;
		const authVariant = normalizeAuthVariantForProvider(provider, this.configService.getValue<string>(CONFIG_AUTH_VARIANT));
		const model = this.configService.getValue<string>(CONFIG_MODEL) || getDefaultModelForAuthVariant(provider, authVariant) || 'claude-sonnet-4-6';
		const compactModel = this.configService.getValue<string>(CONFIG_COMPACT_MODEL) || '';
		const baseURL = this.configService.getValue<string>(CONFIG_BASE_URL) || '';
		const maxTurns = this.configService.getValue<number>(CONFIG_MAX_TURNS) || 25;
		const maxTokens = this.configService.getValue<number>(CONFIG_MAX_TOKENS) || 8192;
		const maxInputTokens = this.configService.getValue<number>(CONFIG_MAX_INPUT_TOKENS) || 0;

		this.providerSelect.value = provider;
		this.authVariantSelect.value = authVariant;
		this.populateModelSelect(provider, authVariant);
		this.modelSelect.value = model;
		this.modelCustomInput.value = model;
		this.compactModelInput.value = compactModel;
		this.baseURLInput.value = baseURL;
		this.maxTurnsInput.value = String(maxTurns);
		this.maxTokensInput.value = String(maxTokens);
		this.maxInputTokensInput.value = String(maxInputTokens);

		this.updateProviderUI(provider);
		void this.refreshAuthBoundUI();

		const height = this.element.offsetHeight || 300;
		this._onDidChangeContentHeight.fire(height);
	}

	private onProviderChanged(): void {
		const provider = this.providerSelect.value as ProviderName;
		const authVariant = normalizeAuthVariantForProvider(provider, this.authVariantSelect.value);
		this.authVariantSelect.value = authVariant;
		this.populateModelSelect(provider, authVariant);

		const defaultModel = getDefaultModelForAuthVariant(provider, authVariant);
		const existingModel = this.configService.getValue<string>(CONFIG_MODEL) || this.modelCustomInput.value.trim();
		const nextModel = defaultModel || existingModel || '';
		this.modelSelect.value = nextModel;
		this.modelCustomInput.value = nextModel;

		this.updateProviderUI(provider);

		this.queueConfigWrite(CONFIG_PROVIDER, provider);
		this.queueConfigWrite(CONFIG_AUTH_VARIANT, authVariant);
		if (nextModel) {
			this.queueConfigWrite(CONFIG_MODEL, nextModel);
		}
		void this.refreshAuthBoundUI();
	}

	private onAuthVariantChanged(): void {
		const provider = this.getCurrentProvider();
		const authVariant = normalizeAuthVariantForProvider(provider, this.authVariantSelect.value);
		this.authVariantSelect.value = authVariant;
		this.populateModelSelect(provider, authVariant);

		const defaultModel = getDefaultModelForAuthVariant(provider, authVariant);
		if (defaultModel) {
			this.modelSelect.value = defaultModel;
			this.modelCustomInput.value = defaultModel;
			this.queueConfigWrite(CONFIG_MODEL, defaultModel);
		}
		this.queueConfigWrite(CONFIG_AUTH_VARIANT, authVariant);
		this.updateProviderUI(provider);
		void this.refreshAuthBoundUI();
	}

	private updateProviderUI(provider: ProviderName): void {
		const supportsCustom = providerSupportsCustomModels(provider);
		const requiresURL = providerRequiresBaseURL(provider);

		// Show/hide custom model input
		this.modelCustomRow.style.display = supportsCustom ? '' : 'none';
		this.authVariantRow.style.display = provider === 'openai' ? '' : 'none';
		this.baseURLInput.disabled = false;

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

	private populateModelSelect(provider: ProviderName, authVariant: AuthVariantName): void {
		// Clear existing options
		while (this.modelSelect.options.length > 0) {
			this.modelSelect.remove(0);
		}

		const models = getModelsForProviderAndAuthVariant(provider, authVariant);
		for (const model of models) {
			this.appendOption(this.modelSelect, model.id, model.name);
		}
	}

	async flushPendingWrites(): Promise<void> {
		await this.pendingWrites.flush();
	}

	override dispose(): void {
		this.pendingWrites.dispose(true);
		super.dispose();
	}

	private queueConfigWrite(key: string, value: string | number): void {
		this.pendingWrites.queue(key, value);
	}

	private async writeConfigNow(key: string, value: unknown): Promise<void> {
		this._updating = true;
		try {
			await this.configService.updateValue(key, value, ConfigurationTarget.USER);
		} finally {
			this._updating = false;
		}
	}

	private async refreshModels(): Promise<void> {
		await this.flushPendingWrites();
		const provider = this.getCurrentProvider();
		const authVariant = this.getCurrentAuthVariant();
		const model = this.getCurrentModel(provider, authVariant);
		const baseURL = this.configService.getValue<string>(CONFIG_BASE_URL) || undefined;

		this.refreshModelsBtn.disabled = true;
		this.refreshModelsResult.textContent = localize('providerSettings.refreshingModels', 'Refreshing...');
		this.refreshModelsResult.classList.remove('dc-test-success', 'dc-test-error');

		try {
			const authState = await this.authStateService.resolveAuth(provider, model, authVariant, baseURL);
			const credential = authState.accessToken || authState.apiKey;
			const models = await this.modelResolverService.refreshModels(provider, credential, authState.baseURL || baseURL, authState.identityKey, authState.authVariant);
			this.populateModelSelect(provider, authVariant);
			this.modelSelect.value = model;
			this.refreshModelsResult.classList.add('dc-test-success');
			this.refreshModelsResult.textContent = localize('providerSettings.refreshModelsSuccess', 'Refreshed {0} models', models.length);
		} catch (err: any) {
			this.refreshModelsResult.classList.add('dc-test-error');
			this.refreshModelsResult.textContent = localize('providerSettings.refreshModelsFailed', 'Failed: {0}', err?.message || String(err));
		} finally {
			this.refreshModelsBtn.disabled = false;
		}
	}

	private async refreshAuthBoundUI(): Promise<void> {
		const generation = ++this.authRefreshGeneration;
		const provider = this.getCurrentProvider();
		const authVariant = this.getCurrentAuthVariant();
		const model = this.getCurrentModel(provider, authVariant);
		const baseURL = this.configService.getValue<string>(CONFIG_BASE_URL) || undefined;
		const authState = await this.authStateService.resolveAuth(provider, model, authVariant, baseURL);
		if (generation !== this.authRefreshGeneration) {
			return;
		}

		const oauthActive = authState.source === 'oauth';
		this.baseURLInput.disabled = oauthActive;
		if (oauthActive) {
			this.baseURLHint.textContent = authState.metadata?.sourceLabel === 'OpenAI (ChatGPT/Codex OAuth)'
				? localize('providerSettings.baseURLOpenAICodexInactive', 'OpenAI Codex OAuth uses the ChatGPT Codex backend. Base URL applies only to the API-key path.')
				: localize('providerSettings.baseURLOAuthInactive', 'OAuth is active for this provider. Base URL applies only to the API-key path.');
		} else {
			this.updateProviderUI(provider);
		}
	}

	private getCurrentProvider(): ProviderName {
		return (this.providerSelect.value || this.configService.getValue<string>(CONFIG_PROVIDER) || 'anthropic') as ProviderName;
	}

	private getCurrentAuthVariant(): AuthVariantName {
		return normalizeAuthVariantForProvider(this.getCurrentProvider(), this.authVariantSelect.value || this.configService.getValue<string>(CONFIG_AUTH_VARIANT));
	}

	private getCurrentModel(provider: ProviderName, authVariant: AuthVariantName): string {
		return this.modelCustomInput.value.trim()
			|| this.modelSelect.value
			|| this.configService.getValue<string>(CONFIG_MODEL)
			|| getDefaultModelForAuthVariant(provider, authVariant)
			|| '';
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
			this.appendOption(select, opt.value, opt.label);
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

	private appendOption(select: HTMLSelectElement, value: string, label: string): void {
		const option = document.createElement('option');
		option.value = value;
		option.textContent = label;
		select.appendChild(option);
	}
}
