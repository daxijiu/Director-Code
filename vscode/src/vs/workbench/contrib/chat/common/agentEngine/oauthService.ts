/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * OAuth 2.0 Service — Provider-Specific Flow Contracts
 *
 * Each provider uses its own OAuth flow:
 *   - anthropic: PKCE + manual code paste (pkce_manual)
 *   - openai:    device code flow (device_code)
 *
 * Flow surface:
 *   startLogin(provider) → IOAuthLoginPayload
 *   submitManualCode(provider, sessionId, code) → IOAuthTokens   [pkce_manual only]
 *   pollLogin(provider, sessionId) → IOAuthPollResult             [device_code only]
 *   getStatus(provider) → IOAuthStatus
 *   logout(provider)
 *
 * Reference: sub-projects/free-code/ oauth.ts + jwtUtils.ts
 *            Hermes web_server.py / anthropic_adapter.py / auth.py
 */

import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ISecretStorageService } from '../../../../../platform/secrets/common/secrets.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { type FlowKind } from './providers/providerTypes.js';

// ============================================================================
// Constants
// ============================================================================

const OAUTH_TOKEN_PREFIX = 'director-code.oauth';
const OAUTH_SESSION_PREFIX = 'director-code.oauthSession';
const OAUTH_ACTIVE_SESSION_PREFIX = 'director-code.oauthActiveSession';

const REFRESH_BUFFER_MS = 5 * 60 * 1000;
const PKCE_SESSION_TTL_MS = 15 * 60 * 1000;
const DEFAULT_DEVICE_CODE_INTERVAL_S = 5;

// ============================================================================
// Types
// ============================================================================

export type OAuthProviderName = 'anthropic' | 'openai';

/** OAuth-specific subset of FlowKind (excludes 'api-key'). */
export type OAuthFlowKind = Exclude<FlowKind, 'api-key'>;

export interface IOAuthProviderConfig {
	readonly provider: OAuthProviderName;
	readonly flowKind: OAuthFlowKind;
	readonly clientId: string;
	readonly authorizationEndpoint?: string;
	readonly tokenEndpoint: string;
	readonly deviceAuthorizationEndpoint?: string;
	readonly scopes: string[];
}

export interface IOAuthLoginPayload {
	readonly flow: OAuthFlowKind;
	readonly sessionId: string;
	readonly expiresIn: number;
	readonly authUrl?: string;
	readonly verificationUrl?: string;
	readonly userCode?: string;
}

export interface IOAuthPollResult {
	readonly status: 'pending' | 'approved' | 'expired' | 'error';
	readonly tokens?: IOAuthTokens;
	readonly error?: string;
}

export interface IOAuthStatus {
	readonly loggedIn: boolean;
	readonly source: 'oauth';
	readonly sourceLabel: string;
	readonly flow?: OAuthFlowKind;
	readonly expiresAt?: number;
	readonly hasRefreshToken?: boolean;
}

export interface IOAuthSession {
	readonly provider: OAuthProviderName;
	readonly flowKind: OAuthFlowKind;
	readonly sessionId: string;
	readonly clientId: string;
	readonly createdAt: number;
	readonly expiresAt: number;
	readonly codeVerifier?: string;
	readonly state?: string;
	readonly deviceCode?: string;
	readonly interval?: number;
}

export interface IOAuthTokens {
	readonly accessToken: string;
	readonly refreshToken?: string;
	readonly expiresAt?: number;
	readonly tokenType?: string;
	readonly scope?: string;
}

export interface IOAuthStoredTokens extends IOAuthTokens {
	readonly clientId: string;
	readonly flowKind: OAuthFlowKind;
}

// ============================================================================
// Provider Configurations (Hermes-style fixed public clientIds)
// ============================================================================

const OAUTH_PROVIDER_CONFIGS: Record<OAuthProviderName, IOAuthProviderConfig> = {
	anthropic: {
		provider: 'anthropic',
		flowKind: 'pkce_manual',
		clientId: 'dc-anthropic-public-client',
		authorizationEndpoint: 'https://console.anthropic.com/oauth/authorize',
		tokenEndpoint: 'https://console.anthropic.com/oauth/token',
		scopes: ['api:read', 'api:write'],
	},
	openai: {
		provider: 'openai',
		flowKind: 'device_code',
		clientId: 'dc-openai-public-client',
		deviceAuthorizationEndpoint: 'https://auth.openai.com/device/code',
		tokenEndpoint: 'https://auth.openai.com/oauth/token',
		scopes: ['openid', 'profile'],
	},
};

export function getOAuthProviderConfig(provider: OAuthProviderName): IOAuthProviderConfig {
	return OAUTH_PROVIDER_CONFIGS[provider];
}

// ============================================================================
// PKCE Helpers
// ============================================================================

export function generateCodeVerifier(length: number = 64): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
	const array = new Uint8Array(length);
	crypto.getRandomValues(array);
	return Array.from(array, byte => chars[byte % chars.length]).join('');
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(verifier);
	const hash = await crypto.subtle.digest('SHA-256', data);
	return base64UrlEncode(new Uint8Array(hash));
}

export function generateState(): string {
	const array = new Uint8Array(32);
	crypto.getRandomValues(array);
	return base64UrlEncode(array);
}

function base64UrlEncode(buffer: Uint8Array): string {
	let binary = '';
	for (const byte of buffer) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary)
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}

function generateSessionId(): string {
	const array = new Uint8Array(16);
	crypto.getRandomValues(array);
	return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

// ============================================================================
// IOAuthService Interface
// ============================================================================

export const IOAuthService = createDecorator<IOAuthService>('directorCodeOAuthService');

export interface IOAuthService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeAuth: Event<OAuthProviderName>;

	startLogin(provider: OAuthProviderName): Promise<IOAuthLoginPayload>;
	submitManualCode(provider: OAuthProviderName, sessionId: string, code: string): Promise<IOAuthTokens>;
	pollLogin(provider: OAuthProviderName, sessionId: string): Promise<IOAuthPollResult>;
	getStatus(provider: OAuthProviderName): Promise<IOAuthStatus>;
	logout(provider: OAuthProviderName): Promise<void>;

	/** @deprecated Reserved for URI-callback-based provider expansion. Do not call directly. */
	handleCallback(code: string, state: string): Promise<IOAuthTokens>;
}

// ============================================================================
// OAuthService Implementation
// ============================================================================

export class OAuthService extends Disposable implements IOAuthService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeAuth = this._register(new Emitter<OAuthProviderName>());
	readonly onDidChangeAuth: Event<OAuthProviderName> = this._onDidChangeAuth.event;

	private readonly _refreshTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private readonly _loginLocks = new Map<OAuthProviderName, string>();

	constructor(
		@ISecretStorageService private readonly secretService: ISecretStorageService,
	) {
		super();
		this._cleanupExpiredSessions();
	}

	override dispose(): void {
		for (const timer of this._refreshTimers.values()) {
			clearTimeout(timer);
		}
		this._refreshTimers.clear();
		this._loginLocks.clear();
		super.dispose();
	}

	// ========================================================================
	// Login Flow
	// ========================================================================

	async startLogin(provider: OAuthProviderName): Promise<IOAuthLoginPayload> {
		const existingSessionId = this._loginLocks.get(provider)
			?? await this._getActiveSessionId(provider);

		if (existingSessionId) {
			const session = await this._getSession(existingSessionId);
			if (session && Date.now() < session.expiresAt) {
				throw new Error(
					`Login already in progress for ${provider}. ` +
					`Session ${existingSessionId} active until ${new Date(session.expiresAt).toISOString()}.`
				);
			}
			await this._deleteSession(existingSessionId);
			await this.secretService.delete(this._activeSessionKey(provider));
			this._loginLocks.delete(provider);
		}

		await this._cleanupExpiredSessions();

		const config = OAUTH_PROVIDER_CONFIGS[provider];
		const sessionId = generateSessionId();

		if (config.flowKind === 'pkce_manual') {
			return this._startPkceManualFlow(config, sessionId);
		} else if (config.flowKind === 'device_code') {
			return this._startDeviceCodeFlow(config, sessionId);
		}

		throw new Error(`Unsupported OAuth flow kind: ${config.flowKind}`);
	}

	private async _startPkceManualFlow(
		config: IOAuthProviderConfig,
		sessionId: string,
	): Promise<IOAuthLoginPayload> {
		if (!config.authorizationEndpoint) {
			throw new Error(`Authorization endpoint not configured for ${config.provider}`);
		}

		const codeVerifier = generateCodeVerifier();
		const codeChallenge = await generateCodeChallenge(codeVerifier);
		const state = generateState();

		const session: IOAuthSession = {
			provider: config.provider,
			flowKind: 'pkce_manual',
			sessionId,
			clientId: config.clientId,
			createdAt: Date.now(),
			expiresAt: Date.now() + PKCE_SESSION_TTL_MS,
			codeVerifier,
			state,
		};
		await this._storeSession(session);
		await this.secretService.set(this._activeSessionKey(config.provider), sessionId);
		this._loginLocks.set(config.provider, sessionId);

		const params = new URLSearchParams({
			response_type: 'code',
			client_id: config.clientId,
			scope: config.scopes.join(' '),
			state,
			code_challenge: codeChallenge,
			code_challenge_method: 'S256',
		});

		const authUrl = `${config.authorizationEndpoint}?${params.toString()}`;

		return {
			flow: 'pkce_manual',
			sessionId,
			expiresIn: Math.floor(PKCE_SESSION_TTL_MS / 1000),
			authUrl,
		};
	}

	private async _startDeviceCodeFlow(
		config: IOAuthProviderConfig,
		sessionId: string,
	): Promise<IOAuthLoginPayload> {
		if (!config.deviceAuthorizationEndpoint) {
			throw new Error(`Device authorization endpoint not configured for ${config.provider}`);
		}

		const body = new URLSearchParams({
			client_id: config.clientId,
			scope: config.scopes.join(' '),
		});

		const response = await fetch(config.deviceAuthorizationEndpoint, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: body.toString(),
		});

		if (!response.ok) {
			const errText = await response.text().catch(() => '');
			throw new Error(`Device authorization failed: ${response.status} ${errText.slice(0, 200)}`);
		}

		const data = await response.json() as {
			device_code: string;
			user_code: string;
			verification_uri: string;
			verification_uri_complete?: string;
			expires_in: number;
			interval?: number;
		};

		const expiresInMs = data.expires_in * 1000;
		const interval = data.interval ?? DEFAULT_DEVICE_CODE_INTERVAL_S;

		const session: IOAuthSession = {
			provider: config.provider,
			flowKind: 'device_code',
			sessionId,
			clientId: config.clientId,
			createdAt: Date.now(),
			expiresAt: Date.now() + expiresInMs,
			deviceCode: data.device_code,
			interval,
		};
		await this._storeSession(session);
		await this.secretService.set(this._activeSessionKey(config.provider), sessionId);
		this._loginLocks.set(config.provider, sessionId);

		return {
			flow: 'device_code',
			sessionId,
			expiresIn: data.expires_in,
			verificationUrl: data.verification_uri_complete ?? data.verification_uri,
			userCode: data.user_code,
		};
	}

	// ========================================================================
	// Manual Code Submission (pkce_manual only)
	// ========================================================================

	async submitManualCode(
		provider: OAuthProviderName,
		sessionId: string,
		code: string,
	): Promise<IOAuthTokens> {
		const session = await this._getSession(sessionId);
		if (!session) {
			throw new Error(`No active session found: ${sessionId}`);
		}
		if (session.provider !== provider) {
			throw new Error(`Session ${sessionId} belongs to ${session.provider}, not ${provider}`);
		}
		if (session.flowKind !== 'pkce_manual') {
			throw new Error(`submitManualCode only supports pkce_manual flow, got ${session.flowKind}`);
		}
		if (Date.now() >= session.expiresAt) {
			await this._cleanupSession(session);
			throw new Error('Session expired. Please restart the login flow.');
		}
		if (!session.codeVerifier) {
			throw new Error('Session missing code verifier.');
		}

		const config = OAUTH_PROVIDER_CONFIGS[provider];
		const body = new URLSearchParams({
			grant_type: 'authorization_code',
			code,
			client_id: config.clientId,
			code_verifier: session.codeVerifier,
		});

		const response = await fetch(config.tokenEndpoint, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: body.toString(),
		});

		if (!response.ok) {
			const errBody = await response.text().catch(() => '');
			throw new Error(`Token exchange failed: ${response.status} ${errBody.slice(0, 200)}`);
		}

		const data = await response.json() as {
			access_token: string;
			refresh_token?: string;
			expires_in?: number;
			token_type?: string;
			scope?: string;
		};

		const tokens: IOAuthTokens = {
			accessToken: data.access_token,
			refreshToken: data.refresh_token,
			expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
			tokenType: data.token_type,
			scope: data.scope,
		};

		await this._storeTokens(provider, tokens, config.clientId, config.flowKind);
		await this._cleanupSession(session);
		this._scheduleRefresh(provider, tokens);
		this._onDidChangeAuth.fire(provider);

		return tokens;
	}

	// ========================================================================
	// Device Code Polling (device_code only)
	// ========================================================================

	async pollLogin(
		provider: OAuthProviderName,
		sessionId: string,
	): Promise<IOAuthPollResult> {
		const session = await this._getSession(sessionId);
		if (!session) {
			return { status: 'error', error: `No active session found: ${sessionId}` };
		}
		if (session.provider !== provider) {
			return { status: 'error', error: `Session ${sessionId} belongs to ${session.provider}, not ${provider}` };
		}
		if (session.flowKind !== 'device_code') {
			return { status: 'error', error: `pollLogin only supports device_code flow, got ${session.flowKind}` };
		}
		if (Date.now() >= session.expiresAt) {
			await this._cleanupSession(session);
			return { status: 'expired' };
		}
		if (!session.deviceCode) {
			return { status: 'error', error: 'Session missing device code.' };
		}

		const config = OAUTH_PROVIDER_CONFIGS[provider];
		const body = new URLSearchParams({
			grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
			device_code: session.deviceCode,
			client_id: config.clientId,
		});

		let response: Response;
		try {
			response = await fetch(config.tokenEndpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: body.toString(),
			});
		} catch (err: any) {
			return { status: 'error', error: `Network error: ${err.message}` };
		}

		if (response.ok) {
			const data = await response.json() as {
				access_token: string;
				refresh_token?: string;
				expires_in?: number;
				token_type?: string;
				scope?: string;
			};

			const tokens: IOAuthTokens = {
				accessToken: data.access_token,
				refreshToken: data.refresh_token,
				expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
				tokenType: data.token_type,
				scope: data.scope,
			};

			await this._storeTokens(provider, tokens, config.clientId, config.flowKind);
			await this._cleanupSession(session);
			this._scheduleRefresh(provider, tokens);
			this._onDidChangeAuth.fire(provider);

			return { status: 'approved', tokens };
		}

		let errorBody: any;
		try {
			errorBody = await response.json();
		} catch {
			return { status: 'error', error: `Token endpoint error: ${response.status}` };
		}

		const error = errorBody?.error;
		if (error === 'authorization_pending') {
			return { status: 'pending' };
		}
		if (error === 'slow_down') {
			const updatedSession: IOAuthSession = {
				...session,
				interval: (session.interval ?? DEFAULT_DEVICE_CODE_INTERVAL_S) + 5,
			};
			await this._storeSession(updatedSession);
			return { status: 'pending' };
		}
		if (error === 'expired_token') {
			await this._cleanupSession(session);
			return { status: 'expired' };
		}

		await this._cleanupSession(session);
		return {
			status: 'error',
			error: errorBody?.error_description ?? error ?? `Token endpoint error: ${response.status}`,
		};
	}

	// ========================================================================
	// Status & Logout
	// ========================================================================

	async getStatus(provider: OAuthProviderName): Promise<IOAuthStatus> {
		const stored = await this._getStoredTokens(provider);
		if (!stored) {
			return { loggedIn: false, source: 'oauth', sourceLabel: `${provider} OAuth` };
		}

		const isExpired = stored.expiresAt !== undefined && Date.now() >= stored.expiresAt;
		const hasRefreshToken = stored.refreshToken !== undefined;

		if (isExpired && !hasRefreshToken) {
			return {
				loggedIn: false,
				source: 'oauth',
				sourceLabel: `${provider} OAuth`,
				flow: stored.flowKind,
			};
		}

		return {
			loggedIn: true,
			source: 'oauth',
			sourceLabel: `${provider} OAuth`,
			flow: stored.flowKind,
			expiresAt: stored.expiresAt,
			hasRefreshToken,
		};
	}

	async logout(provider: OAuthProviderName): Promise<void> {
		await this.secretService.delete(this._tokenKey(provider));

		const activeSessionId = this._loginLocks.get(provider)
			?? await this._getActiveSessionId(provider);
		if (activeSessionId) {
			await this._deleteSession(activeSessionId);
			await this.secretService.delete(this._activeSessionKey(provider));
			this._loginLocks.delete(provider);
		}

		const timer = this._refreshTimers.get(provider);
		if (timer) {
			clearTimeout(timer);
			this._refreshTimers.delete(provider);
		}

		this._onDidChangeAuth.fire(provider);
	}

	// ========================================================================
	// Deprecated: handleCallback
	// ========================================================================

	/**
	 * @deprecated Reserved for URI-callback-based provider expansion. Do not call directly.
	 * Use startLogin() + submitManualCode() for PKCE manual flow,
	 * or startLogin() + pollLogin() for device code flow.
	 */
	async handleCallback(_code: string, _state: string): Promise<IOAuthTokens> {
		throw new Error(
			'handleCallback is deprecated. Use startLogin() + submitManualCode() for PKCE manual flow, ' +
			'or startLogin() + pollLogin() for device code flow.'
		);
	}

	// ========================================================================
	// Token Refresh (internal)
	// ========================================================================

	private async _refreshAccessToken(
		provider: OAuthProviderName,
		stored: IOAuthStoredTokens,
	): Promise<void> {
		if (!stored.refreshToken) {
			return;
		}

		const config = OAUTH_PROVIDER_CONFIGS[provider];
		const body = new URLSearchParams({
			grant_type: 'refresh_token',
			refresh_token: stored.refreshToken,
			client_id: stored.clientId || config.clientId,
		});

		const response = await fetch(config.tokenEndpoint, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: body.toString(),
		});

		if (!response.ok) {
			throw new Error(`Token refresh failed: ${response.status}`);
		}

		const data = await response.json() as {
			access_token: string;
			refresh_token?: string;
			expires_in?: number;
			token_type?: string;
			scope?: string;
		};

		const tokens: IOAuthTokens = {
			accessToken: data.access_token,
			refreshToken: data.refresh_token || stored.refreshToken,
			expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
			tokenType: data.token_type,
			scope: data.scope,
		};

		await this._storeTokens(provider, tokens, stored.clientId, stored.flowKind);
		this._scheduleRefresh(provider, tokens);
		this._onDidChangeAuth.fire(provider);
	}

	private _scheduleRefresh(provider: OAuthProviderName, tokens: IOAuthTokens): void {
		const existing = this._refreshTimers.get(provider);
		if (existing) {
			clearTimeout(existing);
		}

		if (!tokens.expiresAt || !tokens.refreshToken) {
			return;
		}

		const delay = Math.max(0, tokens.expiresAt - Date.now() - REFRESH_BUFFER_MS);
		const timer = setTimeout(async () => {
			try {
				const stored = await this._getStoredTokens(provider);
				if (stored?.refreshToken) {
					await this._refreshAccessToken(provider, stored);
				}
			} catch {
				// Refresh failed silently — getStatus will reflect on next call
			}
		}, delay);

		this._refreshTimers.set(provider, timer);
	}

	// ========================================================================
	// Session Storage
	// ========================================================================

	private _sessionKey(sessionId: string): string {
		return `${OAUTH_SESSION_PREFIX}.${sessionId}`;
	}

	private _activeSessionKey(provider: OAuthProviderName): string {
		return `${OAUTH_ACTIVE_SESSION_PREFIX}.${provider}`;
	}

	private async _getActiveSessionId(provider: OAuthProviderName): Promise<string | undefined> {
		return this.secretService.get(this._activeSessionKey(provider));
	}

	private async _storeSession(session: IOAuthSession): Promise<void> {
		await this.secretService.set(this._sessionKey(session.sessionId), JSON.stringify(session));
	}

	private async _getSession(sessionId: string): Promise<IOAuthSession | undefined> {
		const json = await this.secretService.get(this._sessionKey(sessionId));
		if (!json) {
			return undefined;
		}
		try {
			return JSON.parse(json) as IOAuthSession;
		} catch {
			return undefined;
		}
	}

	private async _deleteSession(sessionId: string): Promise<void> {
		await this.secretService.delete(this._sessionKey(sessionId));
	}

	private async _cleanupSession(session: IOAuthSession): Promise<void> {
		await this._deleteSession(session.sessionId);
		await this.secretService.delete(this._activeSessionKey(session.provider));
		if (this._loginLocks.get(session.provider) === session.sessionId) {
			this._loginLocks.delete(session.provider);
		}
	}

	private async _cleanupExpiredSessions(): Promise<void> {
		const providers: OAuthProviderName[] = ['anthropic', 'openai'];
		for (const provider of providers) {
			const sessionId = this._loginLocks.get(provider)
				?? await this._getActiveSessionId(provider);
			if (!sessionId) {
				continue;
			}
			const session = await this._getSession(sessionId);
			if (!session || Date.now() >= session.expiresAt) {
				await this._deleteSession(sessionId);
				await this.secretService.delete(this._activeSessionKey(provider));
				this._loginLocks.delete(provider);
			} else {
				this._loginLocks.set(provider, sessionId);
			}
		}
	}

	// ========================================================================
	// Token Storage
	// ========================================================================

	private _tokenKey(provider: OAuthProviderName): string {
		return `${OAUTH_TOKEN_PREFIX}.${provider}`;
	}

	private async _storeTokens(
		provider: OAuthProviderName,
		tokens: IOAuthTokens,
		clientId: string,
		flowKind: OAuthFlowKind,
	): Promise<void> {
		const stored: IOAuthStoredTokens = { ...tokens, clientId, flowKind };
		await this.secretService.set(this._tokenKey(provider), JSON.stringify(stored));
	}

	private async _getStoredTokens(provider: OAuthProviderName): Promise<IOAuthStoredTokens | undefined> {
		const json = await this.secretService.get(this._tokenKey(provider));
		if (!json) {
			return undefined;
		}
		try {
			return JSON.parse(json) as IOAuthStoredTokens;
		} catch {
			return undefined;
		}
	}
}
