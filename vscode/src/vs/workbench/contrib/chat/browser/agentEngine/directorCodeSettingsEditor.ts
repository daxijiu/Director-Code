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
import { IEditorOpenContext, EditorInput } from '../../../../common/editor.js';
import { IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorSerializer } from '../../../../common/editor.js';
import { IUntypedEditorInput } from '../../../../../platform/editor/common/editor.js';
import { localize } from '../../../../../nls.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ProviderSettingsWidget } from './providerSettingsWidget.js';
import { ApiKeysWidget } from './apiKeysWidget.js';

const $ = DOM.$;

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

	serialize(_input: DirectorCodeSettingsEditorInput): string {
		return '';
	}

	deserialize(instantiationService: IInstantiationService): DirectorCodeSettingsEditorInput {
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
		this.editorDisposables.clear();

		this.bodyContainer = DOM.append(parent, $('.director-code-settings-editor'));

		// Title
		const title = DOM.append(this.bodyContainer, $('.dc-editor-title'));
		title.textContent = localize('directorCode.settings.title', 'Director Code AI Settings');

		const titleDesc = DOM.append(this.bodyContainer, $('.dc-editor-title-desc'));
		titleDesc.textContent = localize('directorCode.settings.desc', 'Configure your LLM provider, model, and API keys for the AI coding agent.');

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
		this.bodyContainer.appendChild(this.apiKeysWidget.element);
	}

	override async setInput(
		input: DirectorCodeSettingsEditorInput,
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
}

// ============================================================================
// Helper: Disposable wrapper
// ============================================================================

// Not needed — both widgets already extend Disposable
