/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Director Code Settings Editor
 *
 * A lightweight EditorPane that provides a unified settings UI for
 * configuring LLM providers, models, and API keys.
 */

import './media/directorCodeSettings.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Dimension } from '../../../../../base/browser/dom.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { EditorPane } from '../../../../browser/parts/editor/editorPane.js';
import { IEditorOpenContext, IEditorSerializer, IUntypedEditorInput } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { localize } from '../../../../../nls.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ProviderSettingsWidget } from './providerSettingsWidget.js';
import { ApiKeysWidget } from './apiKeysWidget.js';
import { OAuthWidget } from './oauthWidget.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { PROVIDER_DISPLAY_NAMES, type ProviderName } from '../../common/agentEngine/apiKeyService.js';
import { IAuthStateService, normalizeAuthVariantForProvider } from '../../common/agentEngine/authStateService.js';
import { getDefaultModelForAuthVariant } from '../../common/agentEngine/modelCatalog.js';
import { type AuthVariantName } from '../../common/agentEngine/providers/providerTypes.js';

const $ = DOM.$;

const CONFIG_PROVIDER = 'directorCode.ai.provider';
const CONFIG_MODEL = 'directorCode.ai.model';
const CONFIG_BASE_URL = 'directorCode.ai.baseURL';
const CONFIG_AUTH_VARIANT = 'directorCode.ai.authVariant';

// ============================================================================
// Editor Icon
// ============================================================================

const DirectorCodeSettingsIcon = ThemeIcon.modify(Codicon.settingsGear, 'spin');

// ============================================================================
// DirectorCodeSettingsEditorInput
// ============================================================================

export class DirectorCodeSettingsEditorInput extends EditorInput {
	static readonly ID: string = 'workbench.input.directorCodeSettings';

	readonly resource = undefined;

	constructor() {
		super();
	}

	override get typeId(): string {
		return DirectorCodeSettingsEditorInput.ID;
	}

	override getName(): string {
		return localize('directorCodeSettings', "Director Code Settings");
	}

	override getIcon(): ThemeIcon {
		return DirectorCodeSettingsIcon;
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		return super.matches(otherInput) || otherInput instanceof DirectorCodeSettingsEditorInput;
	}

	override async resolve(): Promise<null> {
		return null;
	}
}

// ============================================================================
// DirectorCodeSettingsEditorInputSerializer
// ============================================================================

export class DirectorCodeSettingsEditorInputSerializer implements IEditorSerializer {
	canSerialize(_editorInput: EditorInput): boolean {
		return true;
	}

	serialize(_input: DirectorCodeSettingsEditorInput): string | undefined {
		return '';
	}

	deserialize(instantiationService: IInstantiationService, _serializedEditor: string): DirectorCodeSettingsEditorInput | undefined {
		return instantiationService.createInstance(DirectorCodeSettingsEditorInput);
	}
}

// ============================================================================
// DirectorCodeSettingsEditor
// ============================================================================

export class DirectorCodeSettingsEditor extends EditorPane {
	static readonly ID: string = 'workbench.editor.directorCodeSettings';

	private readonly editorDisposables = this._register(new DisposableStore());
	private dimension: Dimension | undefined;
	private bodyContainer: HTMLElement | undefined;
	private providerSettingsWidget: ProviderSettingsWidget | undefined;
	private apiKeysWidget: ApiKeysWidget | undefined;
	private oauthWidget: OAuthWidget | undefined;
	private statusBar: DirectorCodeStatusBar | undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super(DirectorCodeSettingsEditor.ID, group, telemetryService, themeService, storageService);
	}

	protected override createEditor(parent: HTMLElement): void {
		void this.flushPendingWrites();
		this.editorDisposables.clear();

		this.bodyContainer = DOM.append(parent, $('.director-code-settings-editor'));

		// Title
		const title = DOM.append(this.bodyContainer, $('.dc-editor-title'));
		title.textContent = localize('directorCode.settings.title', 'Director Code AI Settings');

		const titleDesc = DOM.append(this.bodyContainer, $('.dc-editor-title-desc'));
		titleDesc.textContent = localize('directorCode.settings.desc', 'Configure your LLM provider, model, and API keys for the AI coding agent.');

		// Status Bar — quick summary of current config status
		this.statusBar = this.editorDisposables.add(
			this.instantiationService.createInstance(DirectorCodeStatusBar)
		);
		this.bodyContainer.appendChild(this.statusBar.element);

		// Separator
		DOM.append(this.bodyContainer, $('.dc-separator'));

		// Provider Settings Widget
		this.providerSettingsWidget = this.editorDisposables.add(
			this.instantiationService.createInstance(ProviderSettingsWidget)
		);
		this.bodyContainer.appendChild(this.providerSettingsWidget.element);

		// Separator
		DOM.append(this.bodyContainer, $('.dc-separator'));

		// API Keys Widget
		this.apiKeysWidget = this.editorDisposables.add(
			this.instantiationService.createInstance(ApiKeysWidget)
		);
		this.apiKeysWidget.setBeforeTestFlush(() => this.flushPendingWrites());
		this.bodyContainer.appendChild(this.apiKeysWidget.element);

		// Separator
		DOM.append(this.bodyContainer, $('.dc-separator'));

		// OAuth / Subscription widget (B1-7 state machine shell)
		this.oauthWidget = this.editorDisposables.add(
			this.instantiationService.createInstance(OAuthWidget)
		);
		this.oauthWidget.setBeforeOAuthActionFlush(() => this.flushPendingWrites());
		this.oauthWidget.setActiveProvider(this.getCurrentProvider());
		this.bodyContainer.appendChild(this.oauthWidget.element);

		this.editorDisposables.add(this.instantiationService.invokeFunction(accessor => {
			const configService = accessor.get(IConfigurationService);
			return configService.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration(CONFIG_PROVIDER)) {
					this.oauthWidget?.setActiveProvider(this.getCurrentProvider());
				}
			});
		}));
	}

	override async setInput(
		input: EditorInput,
		options: IEditorOptions | undefined,
		context: IEditorOpenContext,
		token: CancellationToken,
	): Promise<void> {
		await super.setInput(input, options, context, token);
		if (this.dimension) {
			this.layout(this.dimension);
		}
	}

	override layout(dimension: Dimension): void {
		this.dimension = dimension;
		if (this.bodyContainer) {
			this.bodyContainer.style.height = `${dimension.height}px`;
		}
	}

	override focus(): void {
		super.focus();
	}

	async flushPendingWrites(): Promise<void> {
		await this.providerSettingsWidget?.flushPendingWrites();
	}

	override dispose(): void {
		void this.flushPendingWrites();
		super.dispose();
	}

	private getCurrentProvider(): ProviderName {
		const configService = this.instantiationService.invokeFunction(accessor => accessor.get(IConfigurationService));
		return (configService.getValue<string>(CONFIG_PROVIDER) || 'anthropic') as ProviderName;
	}
}

// ============================================================================
// Helper: Disposable wrapper
// ============================================================================

// Not needed — both widgets already extend Disposable

// ============================================================================
// Status Bar Widget — quick summary of current config
// ============================================================================

class DirectorCodeStatusBar extends Disposable {
	readonly element: HTMLElement;
	private providerValue!: HTMLElement;
	private modelValue!: HTMLElement;
	private authValue!: HTMLElement;
	private readyValue!: HTMLElement;
	private refreshGeneration = 0;

	constructor(
		@IConfigurationService private readonly configService: IConfigurationService,
		@IAuthStateService private readonly authStateService: IAuthStateService,
	) {
		super();
		this.element = $('.dc-status-bar');
		this.create();
		this.refresh();

		this._register(this.configService.onDidChangeConfiguration(e => {
			if (
				e.affectsConfiguration(CONFIG_PROVIDER) ||
				e.affectsConfiguration(CONFIG_MODEL) ||
				e.affectsConfiguration(CONFIG_BASE_URL) ||
				e.affectsConfiguration(CONFIG_AUTH_VARIANT)
			) {
				this.refresh();
			}
		}));

		this._register(this.authStateService.onDidChangeAuthState(() => this.refresh()));
	}

	private create(): void {
		// Provider
		const providerItem = DOM.append(this.element, $('.dc-status-bar-item'));
		DOM.append(providerItem, $('.dc-status-bar-label')).textContent = 'Provider:';
		this.providerValue = DOM.append(providerItem, $('.dc-status-bar-value'));

		// Model
		const modelItem = DOM.append(this.element, $('.dc-status-bar-item'));
		DOM.append(modelItem, $('.dc-status-bar-label')).textContent = 'Model:';
		this.modelValue = DOM.append(modelItem, $('.dc-status-bar-value'));

		// Auth method
		const authItem = DOM.append(this.element, $('.dc-status-bar-item'));
		DOM.append(authItem, $('.dc-status-bar-label')).textContent = 'Auth:';
		this.authValue = DOM.append(authItem, $('.dc-status-bar-value'));

		// Ready state
		const readyItem = DOM.append(this.element, $('.dc-status-bar-item'));
		DOM.append(readyItem, $('.dc-status-bar-label')).textContent = 'Status:';
		this.readyValue = DOM.append(readyItem, $('.dc-status-bar-value'));
	}

	private async refresh(): Promise<void> {
		const generation = ++this.refreshGeneration;
		const provider = (this.configService.getValue<string>(CONFIG_PROVIDER) || 'anthropic') as ProviderName;
		const authVariant = normalizeAuthVariantForProvider(provider, this.configService.getValue<string>(CONFIG_AUTH_VARIANT) as AuthVariantName | undefined);
		const model = this.configService.getValue<string>(CONFIG_MODEL) || getDefaultModelForAuthVariant(provider, authVariant);
		const baseURL = this.configService.getValue<string>(CONFIG_BASE_URL) || undefined;
		const authState = await this.authStateService.resolveAuth(provider, model, authVariant, baseURL);
		if (generation !== this.refreshGeneration) {
			return;
		}

		this.providerValue.textContent = PROVIDER_DISPLAY_NAMES[provider] || provider;
		this.modelValue.textContent = model;

		this.authValue.textContent = this.authMethodLabel(authState.source, authState.metadata?.sourceLabel);

		this.readyValue.classList.remove('dc-ready', 'dc-not-ready');
		if (authState.source === 'oauth') {
			this.readyValue.textContent = 'Logged in';
			this.readyValue.classList.add('dc-ready');
		} else if (authState.source === 'provider-key' || authState.source === 'per-model-key') {
			this.readyValue.textContent = 'Ready';
			this.readyValue.classList.add('dc-ready');
		} else {
			this.readyValue.textContent = 'Needs config';
			this.readyValue.classList.add('dc-not-ready');
		}
	}

	private authMethodLabel(source: string, sourceLabel: string | undefined): string {
		switch (source) {
			case 'oauth':
				return sourceLabel || 'OAuth';
			case 'per-model-key':
				return 'Per-model API key';
			case 'provider-key':
				return 'API key';
			default:
				return 'Missing';
		}
	}
}
