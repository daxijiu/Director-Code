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
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../../base/common/event.js';
import * as DOM from '../../../../../base/browser/dom.js';
import { localize } from '../../../../../nls.js';
import { IApiKeyService, SUPPORTED_PROVIDERS, PROVIDER_DISPLAY_NAMES, type ProviderName, type IConnectionTestResult } from '../../common/agentEngine/apiKeyService.js';

const $ = DOM.$;

// ============================================================================
// ApiKeysWidget
// ============================================================================

export class ApiKeysWidget extends Disposable {

	private readonly _onDidChangeContentHeight = this._register(new Emitter<number>());
	readonly onDidChangeContentHeight = this._onDidChangeContentHeight.event;

	readonly element: HTMLElement;
	private container!: HTMLElement;
	private readonly providerRows = new Map<ProviderName, IProviderRowElements>();

	constructor(
		@IApiKeyService private readonly apiKeyService: IApiKeyService,
	) {
		super();

		this.element = $('.director-code-api-keys-widget');
		this.create(this.element);
		this.render();

		// Re-render when keys change (from external updates)
		this._register(this.apiKeyService.onDidChangeApiKey(() => this.render()));
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

		const input = DOM.append(inputRow, $<HTMLInputElement>('input.dc-api-key-input'));
		input.type = 'password';
		input.placeholder = localize('apiKeys.placeholder', 'Enter API key...');
		input.autocomplete = 'off';
		input.spellcheck = false;

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
			row, statusBadge, input, saveBtn, testBtn, deleteBtn, testResult,
		};
		this.providerRows.set(provider, elements);

		// Event handlers
		this._register(DOM.addDisposableListener(saveBtn, 'click', () => this.handleSave(provider)));
		this._register(DOM.addDisposableListener(testBtn, 'click', () => this.handleTest(provider)));
		this._register(DOM.addDisposableListener(deleteBtn, 'click', () => this.handleDelete(provider)));
		this._register(DOM.addDisposableListener(input, 'keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter') {
				this.handleSave(provider);
			}
		}));
	}

	/**
	 * Refresh the status of all provider rows.
	 */
	async render(): Promise<void> {
		for (const provider of SUPPORTED_PROVIDERS) {
			const elements = this.providerRows.get(provider);
			if (!elements) {
				continue;
			}

			const hasKey = await this.apiKeyService.hasApiKey(provider);

			// Update status badge
			elements.statusBadge.classList.remove('dc-status-set', 'dc-status-not-set');
			if (hasKey) {
				elements.statusBadge.textContent = localize('apiKeys.configured', 'Configured');
				elements.statusBadge.classList.add('dc-status-set');
			} else {
				elements.statusBadge.textContent = localize('apiKeys.notConfigured', 'Not configured');
				elements.statusBadge.classList.add('dc-status-not-set');
			}

			// Update button states
			elements.testBtn.disabled = !hasKey;
			elements.deleteBtn.disabled = !hasKey;

			// Clear input (don't show existing keys for security)
			elements.input.value = '';
			elements.testResult.textContent = '';
			elements.testResult.classList.remove('dc-test-success', 'dc-test-error');
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

		elements.saveBtn.disabled = true;
		elements.saveBtn.textContent = localize('apiKeys.saving', 'Saving...');

		try {
			await this.apiKeyService.setApiKey(provider, value);
			elements.input.value = '';
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

		elements.testBtn.disabled = true;
		elements.testBtn.textContent = localize('apiKeys.testing', 'Testing...');
		elements.testResult.textContent = '';
		elements.testResult.classList.remove('dc-test-success', 'dc-test-error');

		try {
			const apiKey = await this.apiKeyService.getApiKey(provider);
			if (!apiKey) {
				this.showTestResult(elements, { success: false, error: 'No API key stored' });
				return;
			}

			const result = await this.apiKeyService.testConnection(provider, apiKey);
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
}

// ============================================================================
// Internal Types
// ============================================================================

interface IProviderRowElements {
	readonly row: HTMLElement;
	readonly statusBadge: HTMLElement;
	readonly input: HTMLInputElement;
	readonly saveBtn: HTMLButtonElement;
	readonly testBtn: HTMLButtonElement;
	readonly deleteBtn: HTMLButtonElement;
	readonly testResult: HTMLElement;
}
