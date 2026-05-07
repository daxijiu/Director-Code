/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Provider-specific OAuth widget for Director Code settings.
 *
 * This is the B1-7 reusable UI shell around OAuthLoginController. Final editor
 * orchestration and richer auth summary remain owned by C2.
 */

import './media/directorCodeSettings.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IOAuthService, type OAuthProviderName } from '../../common/agentEngine/oauthService.js';
import { OAuthLoginController, type IOAuthLoginControllerState } from '../../common/agentEngine/oauthLoginController.js';

const $ = DOM.$;

type OAuthProviderRow = {
	readonly provider: OAuthProviderName;
	readonly controller: OAuthLoginController;
	readonly row: HTMLElement;
	readonly statusBadge: HTMLElement;
	readonly primaryButton: HTMLButtonElement;
	readonly refreshButton: HTMLButtonElement;
	readonly detail: HTMLElement;
	readonly detailDisposables: DisposableStore;
};

const OAUTH_PROVIDERS: readonly OAuthProviderName[] = ['anthropic', 'openai'];

const PROVIDER_LABELS: Record<OAuthProviderName, string> = {
	anthropic: 'Anthropic (Claude OAuth)',
	openai: 'OpenAI (ChatGPT/Codex OAuth)',
};

export class OAuthWidget extends Disposable {
	readonly element: HTMLElement;

	private readonly rows = new Map<OAuthProviderName, OAuthProviderRow>();

	constructor(
		@IOAuthService private readonly oauthService: IOAuthService,
	) {
		super();

		this.element = $('.director-code-oauth-widget');
		this.create(this.element);

		this._register(this.oauthService.onDidChangeAuth(provider => {
			const row = this.rows.get(provider);
			if (row) {
				row.controller.refreshStatus();
			}
		}));
	}

	private create(parent: HTMLElement): void {
		const header = DOM.append(parent, $('.dc-section-header'));
		header.textContent = localize('oauthWidget.title', 'Subscription & Login');

		const subtitle = DOM.append(parent, $('.dc-section-subtitle'));
		subtitle.textContent = localize(
			'oauthWidget.subtitle',
			'Sign in with supported providers. API key connection tests remain separate from OAuth login status.',
		);

		const container = DOM.append(parent, $('.dc-oauth-container'));
		for (const provider of OAUTH_PROVIDERS) {
			this.createProviderRow(container, provider);
		}
	}

	private createProviderRow(parent: HTMLElement, provider: OAuthProviderName): void {
		const controller = this._register(new OAuthLoginController(provider, this.oauthService));
		const row = DOM.append(parent, $('.dc-provider-row.dc-oauth-row'));

		const labelRow = DOM.append(row, $('.dc-provider-label-row'));
		const label = DOM.append(labelRow, $('.dc-provider-label'));
		label.textContent = PROVIDER_LABELS[provider];

		const statusBadge = DOM.append(labelRow, $('.dc-status-badge.dc-status-not-set'));
		statusBadge.textContent = localize('oauthWidget.notSignedIn', 'Not signed in');

		const detail = DOM.append(row, $('.dc-oauth-detail'));
		const actionRow = DOM.append(row, $('.dc-action-row'));

		const primaryButton = DOM.append(actionRow, $<HTMLButtonElement>('button.dc-btn.dc-btn-primary'));
		primaryButton.type = 'button';
		primaryButton.textContent = localize('oauthWidget.signIn', 'Sign In');

		const refreshButton = DOM.append(actionRow, $<HTMLButtonElement>('button.dc-btn.dc-btn-secondary'));
		refreshButton.type = 'button';
		refreshButton.textContent = localize('oauthWidget.refreshStatus', 'Refresh Status');
		const detailDisposables = this._register(new DisposableStore());

		const rowData: OAuthProviderRow = {
			provider,
			controller,
			row,
			statusBadge,
			primaryButton,
			refreshButton,
			detail,
			detailDisposables,
		};
		this.rows.set(provider, rowData);

		this._register(controller.onDidChangeState(state => this.renderRow(rowData, state)));
		this._register(DOM.addDisposableListener(primaryButton, 'click', () => this.handlePrimary(rowData)));
		this._register(DOM.addDisposableListener(refreshButton, 'click', () => this.handleRefresh(rowData)));

		this.renderRow(rowData, controller.state);
		controller.refreshStatus();
	}

	private async handlePrimary(row: OAuthProviderRow): Promise<void> {
		if (row.controller.state.phase === 'approved') {
			await row.controller.logout();
			return;
		}
		await row.controller.start();
	}

	private async handleRefresh(row: OAuthProviderRow): Promise<void> {
		const state = row.controller.state;
		if (state.flow === 'device_code' && state.sessionId && state.phase !== 'approved') {
			await row.controller.pollOnce();
			return;
		}
		await row.controller.refreshStatus();
	}

	private renderRow(row: OAuthProviderRow, state: IOAuthLoginControllerState): void {
		this.renderStatus(row, state);
		this.renderActions(row, state);
		this.renderDetail(row, state);
	}

	private renderStatus(row: OAuthProviderRow, state: IOAuthLoginControllerState): void {
		row.statusBadge.classList.remove('dc-status-set', 'dc-status-not-set', 'dc-status-error', 'dc-status-progress');

		switch (state.phase) {
			case 'approved':
				row.statusBadge.textContent = localize('oauthWidget.signedIn', 'Signed in');
				row.statusBadge.classList.add('dc-status-set');
				break;
			case 'error':
				row.statusBadge.textContent = localize('oauthWidget.error', 'Error');
				row.statusBadge.classList.add('dc-status-error');
				break;
			case 'starting':
				row.statusBadge.textContent = localize('oauthWidget.notSignedIn', 'Not signed in');
				row.statusBadge.classList.add('dc-status-not-set');
				break;
			default:
				row.statusBadge.textContent = this.phaseLabel(state);
				row.statusBadge.classList.add('dc-status-progress');
				break;
		}
	}

	private renderActions(row: OAuthProviderRow, state: IOAuthLoginControllerState): void {
		const busy = state.phase === 'starting' && Boolean(state.sessionId)
			|| state.phase === 'submitting'
			|| state.phase === 'polling';

		row.primaryButton.disabled = busy;
		row.refreshButton.disabled = state.phase === 'starting' && !state.sessionId;

		if (state.phase === 'approved') {
			row.primaryButton.textContent = localize('oauthWidget.logout', 'Logout');
			row.primaryButton.classList.remove('dc-btn-primary');
			row.primaryButton.classList.add('dc-btn-danger');
		} else {
			row.primaryButton.textContent = busy
				? this.phaseLabel(state)
				: localize('oauthWidget.signIn', 'Sign In');
			row.primaryButton.classList.remove('dc-btn-danger');
			row.primaryButton.classList.add('dc-btn-primary');
		}

		row.refreshButton.textContent = state.flow === 'device_code' && state.sessionId && state.phase !== 'approved'
			? localize('oauthWidget.checkNow', 'Check Now')
			: localize('oauthWidget.refreshStatus', 'Refresh Status');
	}

	private renderDetail(row: OAuthProviderRow, state: IOAuthLoginControllerState): void {
		row.detailDisposables.clear();
		DOM.clearNode(row.detail);

		if (state.phase === 'approved') {
			row.detail.textContent = localize('oauthWidget.loggedInDetail', 'Logged in with {0}.', state.sourceLabel || PROVIDER_LABELS[row.provider]);
			row.detail.classList.remove('dc-test-error');
			row.detail.classList.add('dc-test-success');
			return;
		}

		row.detail.classList.remove('dc-test-success', 'dc-test-error');

		if (state.phase === 'error') {
			row.detail.textContent = state.error || localize('oauthWidget.loginFailed', 'Login failed.');
			row.detail.classList.add('dc-test-error');
			return;
		}

		if (state.phase === 'submitting' || state.phase === 'polling') {
			row.detail.textContent = this.phaseLabel(state);
			return;
		}

		if (state.flow === 'pkce_manual' && state.authUrl) {
			this.renderPkceDetail(row, state);
			return;
		}

		if (state.flow === 'device_code' && state.verificationUrl && state.userCode) {
			this.renderDeviceCodeDetail(row, state);
			return;
		}

		row.detail.textContent = localize('oauthWidget.notStartedDetail', 'Not signed in.');
	}

	private renderPkceDetail(row: OAuthProviderRow, state: IOAuthLoginControllerState): void {
		const link = this.createExternalLink(state.authUrl!, localize('oauthWidget.openAuthPage', 'Open authorization page'));
		row.detail.appendChild(link);

		const codeRow = DOM.append(row.detail, $('.dc-oauth-code-row'));
		const input = DOM.append(codeRow, $<HTMLInputElement>('input.dc-form-input.dc-oauth-code-input'));
		input.type = 'text';
		input.placeholder = localize('oauthWidget.codePlaceholder', 'Paste authorization code');
		input.autocomplete = 'off';

		const submit = DOM.append(codeRow, $<HTMLButtonElement>('button.dc-btn.dc-btn-primary'));
		submit.type = 'button';
		submit.textContent = localize('oauthWidget.submitCode', 'Submit Code');
		row.detailDisposables.add(DOM.addDisposableListener(submit, 'click', () => row.controller.submitManualCode(input.value)));
		row.detailDisposables.add(DOM.addDisposableListener(input, 'keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter') {
				row.controller.submitManualCode(input.value);
			}
		}));
	}

	private renderDeviceCodeDetail(row: OAuthProviderRow, state: IOAuthLoginControllerState): void {
		const link = this.createExternalLink(state.verificationUrl!, state.verificationUrl!);
		row.detail.appendChild(link);

		const code = DOM.append(row.detail, $('.dc-oauth-user-code'));
		code.textContent = state.userCode!;

		const hint = DOM.append(row.detail, $('.dc-form-hint'));
		hint.textContent = localize('oauthWidget.deviceHint', 'Enter this code in the browser. Director Code will keep checking this session.');
	}

	private createExternalLink(url: string, label: string): HTMLAnchorElement {
		const link = document.createElement('a');
		link.className = 'dc-oauth-link';
		link.href = url;
		link.target = '_blank';
		link.rel = 'noopener noreferrer';
		link.textContent = label;
		return link;
	}

	private phaseLabel(state: IOAuthLoginControllerState): string {
		switch (state.phase) {
			case 'starting':
				return localize('oauthWidget.phaseStarting', 'Starting...');
			case 'awaiting_user':
				return localize('oauthWidget.phaseAwaitingUser', 'Awaiting authorization');
			case 'submitting':
				return localize('oauthWidget.phaseSubmitting', 'Submitting...');
			case 'polling':
				return localize('oauthWidget.phasePolling', 'Checking...');
			case 'approved':
				return localize('oauthWidget.phaseApproved', 'Signed in');
			case 'error':
				return localize('oauthWidget.phaseError', 'Error');
		}
	}
}
