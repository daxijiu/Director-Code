/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { timeout } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ApiKeysWidget } from '../../../browser/agentEngine/apiKeysWidget.js';
import {
	SUPPORTED_PROVIDERS,
	type IApiKeyChangeEvent,
	type IApiKeyService,
	type IConnectionTestResult,
	type IModelConfig,
	type IResolvedProviderOptions,
	type ProviderName,
} from '../../../common/agentEngine/apiKeyService.js';
import {
	IAuthStateService,
	type IResolvedAuthState,
} from '../../../common/agentEngine/authStateService.js';
import { DEFAULT_AUTH_VARIANT, type AuthVariantName } from '../../../common/agentEngine/providers/providerTypes.js';

class MockApiKeyService extends Disposable implements IApiKeyService {
	declare readonly _serviceBrand: undefined;

	private readonly store = new Map<string, string>();
	private readonly _onDidChangeApiKey = this._register(new Emitter<IApiKeyChangeEvent>());
	readonly onDidChangeApiKey: Event<IApiKeyChangeEvent> = this._onDidChangeApiKey.event;

	async getApiKey(provider: ProviderName): Promise<string | undefined> {
		return this.store.get(provider);
	}

	async setApiKey(provider: ProviderName, key: string): Promise<void> {
		this.store.set(provider, key);
		this._onDidChangeApiKey.fire({ provider, scope: 'provider', changeKind: 'set', secretKey: `mock.${provider}` });
	}

	async deleteApiKey(provider: ProviderName): Promise<void> {
		this.store.delete(provider);
		this._onDidChangeApiKey.fire({ provider, scope: 'provider', changeKind: 'delete', secretKey: `mock.${provider}` });
	}

	async hasApiKey(provider: ProviderName): Promise<boolean> {
		return this.store.has(provider);
	}

	async testConnection(_provider: ProviderName, _apiKey: string, _baseURL?: string, model?: string): Promise<IConnectionTestResult> {
		return { success: true, model: model ?? 'mock-model', latencyMs: 1 };
	}

	async getModelApiKey(provider: ProviderName, _modelId: string): Promise<string | undefined> {
		return this.getApiKey(provider);
	}

	async setModelApiKey(_provider: ProviderName, _modelId: string, _key: string): Promise<void> { }

	async deleteModelApiKey(_provider: ProviderName, _modelId: string): Promise<void> { }

	async hasModelApiKey(_provider: ProviderName, _modelId: string): Promise<boolean> {
		return false;
	}

	async getModelConfig(_provider: ProviderName, _modelId: string): Promise<IModelConfig | undefined> {
		return undefined;
	}

	async setModelConfig(_provider: ProviderName, _modelId: string, _config: IModelConfig): Promise<void> { }

	async deleteModelConfig(_provider: ProviderName, _modelId: string): Promise<void> { }

	async resolveProviderOptions(_provider: ProviderName, _modelId: string, _globalBaseURL?: string): Promise<IResolvedProviderOptions | undefined> {
		return undefined;
	}
}

class MockAuthStateService extends Disposable implements IAuthStateService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeAuthState = this._register(new Emitter<ProviderName>());
	readonly onDidChangeAuthState: Event<ProviderName> = this._onDidChangeAuthState.event;

	constructor(private readonly apiKeyService: IApiKeyService) {
		super();
		this._register(this.apiKeyService.onDidChangeApiKey(event => this._onDidChangeAuthState.fire(event.provider)));
	}

	async resolveAuth(provider: ProviderName, model: string, authVariant: AuthVariantName = DEFAULT_AUTH_VARIANT, globalBaseURL?: string): Promise<IResolvedAuthState> {
		const apiKey = await this.apiKeyService.getApiKey(provider);
		if (apiKey) {
			return {
				source: 'provider-key',
				provider,
				model,
				authVariant,
				apiKey,
				auth: { kind: 'api-key', value: apiKey },
				baseURL: globalBaseURL,
				identityKey: `mock:${provider}:provider-key`,
			};
		}

		return {
			source: 'missing',
			provider,
			model,
			authVariant,
			identityKey: `mock:${provider}:missing`,
			metadata: { reason: `No API key configured for ${provider}.` },
		};
	}
}

suite('AgentEngine - ApiKeysWidget (DOM)', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const provider = SUPPORTED_PROVIDERS[0];

	function createWidget(): { widget: ApiKeysWidget; apiKeyService: MockApiKeyService } {
		const apiKeyService = store.add(new MockApiKeyService());
		const authStateService = store.add(new MockAuthStateService(apiKeyService));
		const configService = new TestConfigurationService({
			'directorCode.ai.provider': provider,
			'directorCode.ai.model': 'mock-model',
			'directorCode.ai.authVariant': DEFAULT_AUTH_VARIANT,
		});
		const widget = store.add(new ApiKeysWidget(apiKeyService, configService, authStateService));
		mainWindow.document.body.appendChild(widget.element);
		store.add({ dispose: () => widget.element.remove() });
		return { widget, apiKeyService };
	}

	function firstRow(widget: ApiKeysWidget): HTMLElement {
		const row = widget.element.querySelector('.dc-provider-row');
		assert.ok(row instanceof HTMLElement);
		return row;
	}

	function rowInput(row: HTMLElement): HTMLInputElement {
		const input = row.querySelector('.dc-api-key-input');
		assert.ok(input instanceof HTMLInputElement);
		return input;
	}

	function saveButton(row: HTMLElement): HTMLButtonElement {
		const button = row.querySelector('button.dc-btn-primary');
		assert.ok(button instanceof HTMLButtonElement);
		return button;
	}

	function deleteButton(row: HTMLElement): HTMLButtonElement {
		const button = row.querySelector('button.dc-btn-danger');
		assert.ok(button instanceof HTMLButtonElement);
		return button;
	}

	async function flushAsyncListeners(): Promise<void> {
		await Promise.resolve();
		await timeout(0);
		await Promise.resolve();
	}

	test('creates password input with autofill suppression attributes', async () => {
		const { widget } = createWidget();
		await widget.render();

		const input = rowInput(firstRow(widget));
		assert.strictEqual(input.type, 'password');
		assert.strictEqual(input.autocomplete, 'new-password');
		assert.strictEqual(input.getAttribute('autocomplete'), 'new-password');
		assert.strictEqual(input.getAttribute('autocapitalize'), 'off');
		assert.strictEqual(input.getAttribute('autocorrect'), 'off');
		assert.strictEqual(input.getAttribute('data-1p-ignore'), 'true');
		assert.strictEqual(input.getAttribute('data-form-type'), 'other');
		assert.strictEqual(input.getAttribute('data-lpignore'), 'true');
		assert.strictEqual(input.spellcheck, false);
	});

	test('rebuilds input on render without keeping plaintext value', async () => {
		const { widget } = createWidget();
		await widget.render();

		const row = firstRow(widget);
		const input = rowInput(row);
		input.value = 'sk-visible-in-dom';

		await widget.render();

		const rebuilt = rowInput(row);
		assert.notStrictEqual(rebuilt, input);
		assert.strictEqual(rebuilt.value, '');
		assert.strictEqual(rebuilt.type, 'password');
		assert.strictEqual(rebuilt.getAttribute('autocomplete'), 'new-password');
	});

	test('rebuilds input after save and delete actions', async () => {
		const { widget, apiKeyService } = createWidget();
		await widget.render();

		const row = firstRow(widget);
		const initialInput = rowInput(row);
		initialInput.value = 'sk-save-test';
		saveButton(row).click();
		await flushAsyncListeners();

		const afterSaveInput = rowInput(row);
		assert.notStrictEqual(afterSaveInput, initialInput);
		assert.strictEqual(afterSaveInput.value, '');
		assert.strictEqual(await apiKeyService.getApiKey(provider), 'sk-save-test');

		afterSaveInput.value = 'sk-delete-plaintext';
		deleteButton(row).click();
		await flushAsyncListeners();

		const afterDeleteInput = rowInput(row);
		assert.notStrictEqual(afterDeleteInput, afterSaveInput);
		assert.strictEqual(afterDeleteInput.value, '');
		assert.strictEqual(await apiKeyService.hasApiKey(provider), false);
	});

	test('reattaches Enter key save listener after input rebuild', async () => {
		const { widget, apiKeyService } = createWidget();
		await widget.render();

		const row = firstRow(widget);
		const beforeRenderInput = rowInput(row);
		beforeRenderInput.value = 'sk-rendered-away';
		await widget.render();

		const rebuilt = rowInput(row);
		rebuilt.value = 'sk-enter-test';
		rebuilt.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		await flushAsyncListeners();

		const afterEnterSave = rowInput(row);
		assert.notStrictEqual(afterEnterSave, rebuilt);
		assert.strictEqual(afterEnterSave.value, '');
		assert.strictEqual(await apiKeyService.getApiKey(provider), 'sk-enter-test');
	});
});
