/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * API Keys Widget
 *
 * UI widget that displays API key management controls for each LLM provider.
 * Allows users to set, test, and delete API keys via the Settings Editor.
 */

import './media/directorCodeSettings.css';
import { Disposable, MutableDisposable, type IDisposable } from '../../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../../base/common/event.js';
import * as DOM from '../../../../../base/browser/dom.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IApiKeyService, SUPPORTED_PROVIDERS, PROVIDER_DISPLAY_NAMES, type ProviderName, type IConnectionTestResult } from '../../common/agentEngine/apiKeyService.js';
import { IAuthStateService, normalizeAuthVariantForProvider, type IResolvedAuthState } from '../../common/agentEngine/authStateService.js';
import { getDefaultModelForAuthVariant } from '../../common/agentEngine/modelCatalog.js';
import { DEFAULT_AUTH_VARIANT, OPENAI_CODEX_AUTH_VARIANT, type AuthVariantName } from '../../common/agentEngine/providers/providerTypes.js';

const $ = DOM.$;

const CONFIG_PROVIDER = 'directorCode.ai.provider';
const CONFIG_MODEL = 'directorCode.ai.model';
const CONFIG_BASE_URL = 'directorCode.ai.baseURL';
const CONFIG_AUTH_VARIANT = 'directorCode.ai.authVariant';

// ============================================================================
// ApiKeysWidget
// ============================================================================

export class ApiKeysWidget extends Disposable {

	private readonly _onDidChangeContentHeight = this._register(new Emitter<number>());
	readonly onDidChangeContentHeight = this._onDidChangeContentHeight.event;

	readonly element: HTMLElement;
	private container!: HTMLElement;
	private readonly providerRows = new Map<ProviderName, IProviderRowElements>();
	private beforeTestFlush: (() => Promise<void>) | undefined;
	private renderGeneration = 0;
	private inputGeneration = 0;

	constructor(
		@IApiKeyService private readonly apiKeyService: IApiKeyService,
		@IConfigurationService private readonly configService: IConfigurationService,
		@IAuthStateService private readonly authStateService: IAuthStateService,
	) {
		super();

		this.element = $('.director-code-api-keys-widget');
		this.create(this.element);
		this.render();

		// Re-render when keys change (from external updates)
		this._register(this.apiKeyService.onDidChangeApiKey(() => this.render()));
		this._register(this.authStateService.onDidChangeAuthState(() => this.render()));
		this._register(this.configService.onDidChangeConfiguration(e => {
			if (
				e.affectsConfiguration(CONFIG_PROVIDER) ||
				e.affectsConfiguration(CONFIG_MODEL) ||
				e.affectsConfiguration(CONFIG_BASE_URL) ||
				e.affectsConfiguration(CONFIG_AUTH_VARIANT)
			) {
				this.render();
			}
		}));
	}

	setBeforeTestFlush(flush: () => Promise<void>): void {
		this.beforeTestFlush = flush;
	}

	private create(parent: HTMLElement): void {
		// Section title
		const header = DOM.append(parent, $('.dc-section-header'));
		header.textContent = localize('apiKeys.title', 'API Keys');

		const subtitle = DOM.append(parent, $('.dc-section-subtitle'));
		subtitle.textContent = localize('apiKeys.subtitle', 'Configure API keys for LLM providers. Keys are stored securely in your system credential store.');

		// Provider rows container
		this.container = DOM.append(parent, $('.dc-api-keys-container'));

		// Create a row for each provider
		for (const provider of SUPPORTED_PROVIDERS) {
			this.createProviderRow(this.container, provider);
		}
	}

	private createProviderRow(parent: HTMLElement, provider: ProviderName): void {
		const row = DOM.append(parent, $('.dc-provider-row'));

		// Provider label + status
		const labelRow = DOM.append(row, $('.dc-provider-label-row'));
		const label = DOM.append(labelRow, $('.dc-provider-label'));
		label.textContent = PROVIDER_DISPLAY_NAMES[provider];

		const statusBadge = DOM.append(labelRow, $('.dc-status-badge'));
		statusBadge.textContent = localize('apiKeys.notSet', 'Not configured');
		statusBadge.classList.add('dc-status-not-set');

		// Input row: password input + save button
		const inputRow = DOM.append(row, $('.dc-input-row'));

		const inputKeydown = this._register(new MutableDisposable<IDisposable>());
		const input = this.createApiKeyInput(provider, inputKeydown);
		DOM.append(inputRow, input);

		const saveBtn = DOM.append(inputRow, $<HTMLButtonElement>('button.dc-btn.dc-btn-primary'));
		saveBtn.textContent = localize('apiKeys.save', 'Save');
		saveBtn.type = 'button';

		// Action row: test + delete buttons + test result
		const actionRow = DOM.append(row, $('.dc-action-row'));

		const testBtn = DOM.append(actionRow, $<HTMLButtonElement>('button.dc-btn.dc-btn-secondary'));
		testBtn.textContent = localize('apiKeys.test', 'Test Connection');
		testBtn.type = 'button';

		const deleteBtn = DOM.append(actionRow, $<HTMLButtonElement>('button.dc-btn.dc-btn-danger'));
		deleteBtn.textContent = localize('apiKeys.delete', 'Delete');
		deleteBtn.type = 'button';

		const testResult = DOM.append(actionRow, $('.dc-test-result'));

		// Store references
		const elements: IProviderRowElements = {
			row, statusBadge, input, inputKeydown, saveBtn, testBtn, deleteBtn, testResult,
		};
		this.providerRows.set(provider, elements);

		// Event handlers
		this._register(DOM.addDisposableListener(saveBtn, 'click', () => this.handleSave(provider)));
		this._register(DOM.addDisposableListener(testBtn, 'click', () => this.handleTest(provider)));
		this._register(DOM.addDisposableListener(deleteBtn, 'click', () => this.handleDelete(provider)));
	}

	private createApiKeyInput(provider: ProviderName, inputKeydown: MutableDisposable<IDisposable>): HTMLInputElement {
		const input = $<HTMLInputElement>('input.dc-api-key-input');
		input.type = 'password';
		input.name = `director-code-${provider}-api-key-${++this.inputGeneration}`;
		input.placeholder = localize('apiKeys.placeholder', 'Enter API key...');
		input.autocomplete = 'new-password';
		input.setAttribute('autocomplete', 'new-password');
		input.setAttribute('autocapitalize', 'off');
		input.setAttribute('autocorrect', 'off');
		input.setAttribute('data-1p-ignore', 'true');
		input.setAttribute('data-form-type', 'other');
		input.setAttribute('data-lpignore', 'true');
		input.spellcheck = false;

		inputKeydown.value = DOM.addDisposableListener(input, 'keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter') {
				this.handleSave(provider);
			}
		});

		return input;
	}

	private rebuildApiKeyInput(provider: ProviderName, elements: IProviderRowElements, disabled = elements.input.disabled): void {
		const nextInput = this.createApiKeyInput(provider, elements.inputKeydown);
		nextInput.disabled = disabled;
		elements.input.replaceWith(nextInput);
		elements.input = nextInput;
	}

	/**
	 * Refresh the status of all provider rows.
	 */
	async render(): Promise<void> {
		const generation = ++this.renderGeneration;
		for (const provider of SUPPORTED_PROVIDERS) {
			const elements = this.providerRows.get(provider);
			if (!elements) {
				continue;
			}

			const [authState, hasProviderKey] = await Promise.all([
				this.resolveProviderAuthState(provider),
				this.apiKeyService.hasApiKey(provider),
			]);
			if (generation !== this.renderGeneration) {
				return;
			}

			// Update status badge
			elements.statusBadge.classList.remove('dc-status-set', 'dc-status-not-set', 'dc-status-progress', 'dc-status-error');
			elements.input.disabled = false;
			elements.saveBtn.disabled = false;
			elements.testResult.textContent = '';
			elements.testResult.classList.remove('dc-test-success', 'dc-test-error');

			if (authState.source === 'oauth') {
				elements.statusBadge.textContent = localize('apiKeys.oauthActive', 'OAuth active');
				elements.statusBadge.classList.add('dc-status-set');
				elements.input.disabled = true;
				elements.saveBtn.disabled = true;
				elements.testBtn.disabled = true;
				elements.deleteBtn.disabled = !hasProviderKey;
				elements.testResult.textContent = localize('apiKeys.oauthActiveDetail', '{0} is active. API key controls are not used for the current auth path.', authState.metadata?.sourceLabel || 'OAuth');
			} else if (authState.source === 'per-model-key') {
				elements.statusBadge.textContent = localize('apiKeys.perModelConfigured', 'Per-model key');
				elements.statusBadge.classList.add('dc-status-set');
				elements.testBtn.disabled = !authState.apiKey;
				elements.deleteBtn.disabled = !hasProviderKey;
			} else if (authState.source === 'provider-key') {
				elements.statusBadge.textContent = localize('apiKeys.providerConfigured', 'Provider key');
				elements.statusBadge.classList.add('dc-status-set');
				elements.testBtn.disabled = !authState.apiKey;
				elements.deleteBtn.disabled = !hasProviderKey;
			} else {
				if (provider === 'openai' && authState.authVariant === OPENAI_CODEX_AUTH_VARIANT && hasProviderKey) {
					elements.statusBadge.textContent = localize('apiKeys.apiKeyInactive', 'API key saved');
					elements.statusBadge.classList.add('dc-status-progress');
					elements.testResult.textContent = localize('apiKeys.openAICodexNeedsOAuth', 'OpenAI (ChatGPT/Codex OAuth) is selected; the saved API key belongs to the default API-key path.');
				} else {
					elements.statusBadge.textContent = localize('apiKeys.notConfigured', 'Not configured');
					elements.statusBadge.classList.add('dc-status-not-set');
				}
				elements.testBtn.disabled = true;
				elements.deleteBtn.disabled = !hasProviderKey;
			}

			if (authState.source !== 'oauth' && authState.source !== 'missing') {
				elements.testResult.textContent = authState.source === 'per-model-key'
					? localize('apiKeys.perModelDetail', 'Testing uses the key configured for this model.')
					: '';
			}

			if (authState.source !== 'oauth' && !(provider === 'openai' && authState.authVariant === OPENAI_CODEX_AUTH_VARIANT && hasProviderKey) && authState.source === 'missing') {
				elements.statusBadge.classList.add('dc-status-not-set');
			}

			// Rebuild input so browser autofill state and plaintext DOM value are discarded.
			this.rebuildApiKeyInput(provider, elements);
		}

		// Emit height change
		const height = this.element.offsetHeight || 400;
		this._onDidChangeContentHeight.fire(height);
	}

	// ====================================================================
	// Event Handlers
	// ====================================================================

	private async handleSave(provider: ProviderName): Promise<void> {
		const elements = this.providerRows.get(provider);
		if (!elements) {
			return;
		}

		const value = elements.input.value.trim();
		if (!value) {
			return;
		}
		this.rebuildApiKeyInput(provider, elements);

		elements.saveBtn.disabled = true;
		elements.saveBtn.textContent = localize('apiKeys.saving', 'Saving...');

		try {
			await this.apiKeyService.setApiKey(provider, value);
			// render() will be triggered by onDidChangeApiKey
		} finally {
			elements.saveBtn.disabled = false;
			elements.saveBtn.textContent = localize('apiKeys.save', 'Save');
		}
	}

	private async handleTest(provider: ProviderName): Promise<void> {
		const elements = this.providerRows.get(provider);
		if (!elements) {
			return;
		}

		await this.beforeTestFlush?.();

		elements.testBtn.disabled = true;
		elements.testBtn.textContent = localize('apiKeys.testing', 'Testing...');
		elements.testResult.textContent = '';
		elements.testResult.classList.remove('dc-test-success', 'dc-test-error');

		try {
			const authState = await this.resolveProviderAuthState(provider);
			if (authState.source === 'oauth') {
				this.showTestResult(elements, {
					success: false,
					error: localize('apiKeys.testOAuthActive', '{0} is active. API key Test Connection is not used for this auth path.', authState.metadata?.sourceLabel || 'OAuth'),
				});
				return;
			}

			if (!authState.apiKey) {
				this.showTestResult(elements, { success: false, error: authState.metadata?.reason || 'No API key stored' });
				return;
			}

			const result = await this.apiKeyService.testConnection(provider, authState.apiKey, authState.baseURL, authState.model);
			this.showTestResult(elements, result);
		} finally {
			elements.testBtn.disabled = false;
			elements.testBtn.textContent = localize('apiKeys.test', 'Test Connection');
		}
	}

	private async handleDelete(provider: ProviderName): Promise<void> {
		const elements = this.providerRows.get(provider);
		if (!elements) {
			return;
		}

		elements.deleteBtn.disabled = true;
		this.rebuildApiKeyInput(provider, elements);
		try {
			await this.apiKeyService.deleteApiKey(provider);
			// render() will be triggered by onDidChangeApiKey
		} finally {
			elements.deleteBtn.disabled = false;
		}
	}

	private showTestResult(elements: IProviderRowElements, result: IConnectionTestResult): void {
		elements.testResult.classList.remove('dc-test-success', 'dc-test-error');

		if (result.success) {
			elements.testResult.classList.add('dc-test-success');
			const latencyText = result.latencyMs ? ` (${result.latencyMs}ms)` : '';
			elements.testResult.textContent = localize('apiKeys.testSuccess', 'Connection successful{0}', latencyText);
		} else {
			elements.testResult.classList.add('dc-test-error');
			elements.testResult.textContent = localize('apiKeys.testFailed', 'Failed: {0}', result.error || 'Unknown error');
		}
	}

	private async resolveProviderAuthState(provider: ProviderName): Promise<IResolvedAuthState> {
		const configuredProvider = (this.configService.getValue<string>(CONFIG_PROVIDER) || 'anthropic') as ProviderName;
		const configuredAuthVariant = this.configService.getValue<string>(CONFIG_AUTH_VARIANT) as AuthVariantName | undefined;
		const authVariant = provider === configuredProvider
			? normalizeAuthVariantForProvider(provider, configuredAuthVariant)
			: DEFAULT_AUTH_VARIANT;
		const model = provider === configuredProvider
			? this.configService.getValue<string>(CONFIG_MODEL) || getDefaultModelForAuthVariant(provider, authVariant)
			: getDefaultModelForAuthVariant(provider, authVariant);
		const baseURL = provider === configuredProvider
			? this.configService.getValue<string>(CONFIG_BASE_URL) || undefined
			: undefined;
		return this.authStateService.resolveAuth(provider, model, authVariant, baseURL);
	}
}

// ============================================================================
// Internal Types
// ============================================================================

interface IProviderRowElements {
	readonly row: HTMLElement;
	readonly statusBadge: HTMLElement;
	input: HTMLInputElement;
	readonly inputKeydown: MutableDisposable<IDisposable>;
	readonly saveBtn: HTMLButtonElement;
	readonly testBtn: HTMLButtonElement;
	readonly deleteBtn: HTMLButtonElement;
	readonly testResult: HTMLElement;
}
