/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Provider-specific OAuth login state machine.
 *
 * B1-7 keeps this logic separate from the Settings editor DOM so C2 can reuse
 * the same phase contract without inventing a second login flow.
 */

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import {
	type IOAuthLoginPayload,
	type IOAuthPollResult,
	type IOAuthService,
	type IOAuthStatus,
	type IOAuthTokens,
	type OAuthProviderName,
} from './oauthService.js';

export type OAuthLoginPhase = 'starting' | 'awaiting_user' | 'submitting' | 'polling' | 'approved' | 'error';

export interface IOAuthLoginControllerState {
	readonly provider: OAuthProviderName;
	readonly phase: OAuthLoginPhase;
	readonly loggedIn: boolean;
	readonly flow?: IOAuthLoginPayload['flow'];
	readonly sessionId?: string;
	readonly authUrl?: string;
	readonly verificationUrl?: string;
	readonly userCode?: string;
	readonly expiresAt?: number;
	readonly sourceLabel?: string;
	readonly tokens?: IOAuthTokens;
	readonly error?: string;
}

const DEFAULT_POLL_INTERVAL_MS = 5_000;

export class OAuthLoginController extends Disposable {
	private readonly _onDidChangeState = this._register(new Emitter<IOAuthLoginControllerState>());
	readonly onDidChangeState: Event<IOAuthLoginControllerState> = this._onDidChangeState.event;

	private _state: IOAuthLoginControllerState;
	private _pollTimer: ReturnType<typeof setTimeout> | undefined;

	constructor(
		private readonly provider: OAuthProviderName,
		private readonly oauthService: IOAuthService,
		private readonly pollIntervalMs: number = DEFAULT_POLL_INTERVAL_MS,
	) {
		super();
		this._state = {
			provider,
			phase: 'starting',
			loggedIn: false,
		};
	}

	override dispose(): void {
		this._clearPollTimer();
		super.dispose();
	}

	get state(): IOAuthLoginControllerState {
		return this._state;
	}

	async refreshStatus(): Promise<void> {
		this._clearPollTimer();
		try {
			this._applyStatus(await this.oauthService.getStatus(this.provider));
		} catch (err: any) {
			this._setState({
				phase: 'error',
				loggedIn: false,
				error: err?.message || String(err),
			});
		}
	}

	async start(): Promise<void> {
		this._clearPollTimer();
		this._setState({
			phase: 'starting',
			loggedIn: false,
			flow: undefined,
			sessionId: undefined,
			authUrl: undefined,
			verificationUrl: undefined,
			userCode: undefined,
			expiresAt: undefined,
			sourceLabel: undefined,
			tokens: undefined,
			error: undefined,
		});

		try {
			const payload = await this.oauthService.startLogin(this.provider);
			const expiresAt = Date.now() + payload.expiresIn * 1000;
			this._setState({
				phase: 'awaiting_user',
				loggedIn: false,
				flow: payload.flow,
				sessionId: payload.sessionId,
				authUrl: payload.authUrl,
				verificationUrl: payload.verificationUrl,
				userCode: payload.userCode,
				expiresAt,
				error: undefined,
			});

			if (payload.flow === 'device_code') {
				this._schedulePoll();
			}
		} catch (err: any) {
			this._setState({
				phase: 'error',
				loggedIn: false,
				error: err?.message || String(err),
			});
		}
	}

	async submitManualCode(code: string): Promise<void> {
		const sessionId = this._state.sessionId;
		if (!sessionId) {
			this._setState({
				phase: 'error',
				loggedIn: false,
				error: 'No active OAuth session. Start login again.',
			});
			return;
		}

		const trimmed = code.trim();
		if (!trimmed) {
			this._setState({
				phase: 'error',
				loggedIn: false,
				error: 'Authorization code is required.',
			});
			return;
		}

		this._clearPollTimer();
		this._setState({ phase: 'submitting', loggedIn: false, error: undefined });
		try {
			const tokens = await this.oauthService.submitManualCode(this.provider, sessionId, trimmed);
			this._setState({
				phase: 'approved',
				loggedIn: true,
				tokens,
				sourceLabel: this._approvedSourceLabel(),
				error: undefined,
			});
		} catch (err: any) {
			this._setState({
				phase: 'error',
				loggedIn: false,
				error: err?.message || String(err),
			});
		}
	}

	async pollOnce(): Promise<void> {
		const sessionId = this._state.sessionId;
		if (!sessionId) {
			await this.refreshStatus();
			return;
		}

		this._clearPollTimer();
		this._setState({ phase: 'polling', loggedIn: false, error: undefined });
		try {
			const result = await this.oauthService.pollLogin(this.provider, sessionId);
			this._applyPollResult(result);
		} catch (err: any) {
			this._setState({
				phase: 'error',
				loggedIn: false,
				error: err?.message || String(err),
			});
		}
	}

	async logout(): Promise<void> {
		this._clearPollTimer();
		try {
			await this.oauthService.logout(this.provider);
			this._setState({
				phase: 'starting',
				loggedIn: false,
				flow: undefined,
				sessionId: undefined,
				authUrl: undefined,
				verificationUrl: undefined,
				userCode: undefined,
				expiresAt: undefined,
				sourceLabel: undefined,
				tokens: undefined,
				error: undefined,
			});
		} catch (err: any) {
			this._setState({
				phase: 'error',
				loggedIn: false,
				error: err?.message || String(err),
			});
		}
	}

	private _applyStatus(status: IOAuthStatus): void {
		if (status.loggedIn) {
			this._setState({
				phase: 'approved',
				loggedIn: true,
				flow: status.flow,
				expiresAt: status.expiresAt,
				sourceLabel: status.sourceLabel,
				error: undefined,
			});
			return;
		}

		this._setState({
			phase: 'starting',
			loggedIn: false,
			flow: status.flow,
			expiresAt: status.expiresAt,
			sourceLabel: status.sourceLabel,
			error: undefined,
		});
	}

	private _applyPollResult(result: IOAuthPollResult): void {
		switch (result.status) {
			case 'pending':
				this._setState({ phase: 'awaiting_user', loggedIn: false, error: undefined });
				this._schedulePoll();
				break;
			case 'approved':
				this._setState({
					phase: 'approved',
					loggedIn: true,
					tokens: result.tokens,
					sourceLabel: this._approvedSourceLabel(),
					error: undefined,
				});
				break;
			case 'expired':
				this._setState({
					phase: 'error',
					loggedIn: false,
					error: 'OAuth login expired. Start login again.',
				});
				break;
			case 'error':
				this._setState({
					phase: 'error',
					loggedIn: false,
					error: result.error || 'OAuth login failed.',
				});
				break;
		}
	}

	private _approvedSourceLabel(): string {
		return this.provider === 'openai'
			? 'OpenAI (ChatGPT/Codex OAuth)'
			: `${this.provider} OAuth`;
	}

	private _schedulePoll(): void {
		this._clearPollTimer();
		this._pollTimer = setTimeout(() => {
			this._pollTimer = undefined;
			this.pollOnce();
		}, this.pollIntervalMs);
	}

	private _clearPollTimer(): void {
		if (this._pollTimer) {
			clearTimeout(this._pollTimer);
			this._pollTimer = undefined;
		}
	}

	private _setState(patch: Partial<IOAuthLoginControllerState>): void {
		this._state = {
			...this._state,
			...patch,
			provider: this.provider,
		};
		this._onDidChangeState.fire(this._state);
	}
}
