/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * OAuth 2.0 Service
 *
 * Implements the OAuth 2.0 Authorization Code flow with PKCE for
 * Anthropic and OpenAI. Handles:
 *   - PKCE code_verifier / code_challenge generation
 *   - Browser-based authorization redirect
 *   - Authorization code → token exchange
 *   - Token storage in ISecretStorageService
 *   - Automatic token refresh before expiry
 *   - Integration with IApiKeyService auth resolution
 *
 * Reference: sub-projects/free-code/ oauth.ts + jwtUtils.ts
 */

import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ISecretStorageService } from '../../../../../platform/secrets/common/secrets.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';

// ============================================================================
// Constants
// ============================================================================

const OAUTH_TOKEN_PREFIX = 'director-code.oauth';
const OAUTH_STATE_PREFIX = 'director-code.oauthState';

const REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 min before expiry

// ============================================================================
// Types
// ============================================================================

export type OAuthProviderName = 'anthropic' | 'openai';

export interface IOAuthConfig {
	readonly provider: OAuthProviderName;
	readonly clientId: string;
	readonly authorizationEndpoint: string;
	readonly tokenEndpoint: string;
	readonly scopes: string[];
	readonly redirectUri: string;
}

export interface IOAuthTokens {
	readonly accessToken: string;
	readonly refreshToken?: string;
	readonly expiresAt?: number;
	readonly tokenType?: string;
	readonly scope?: string;
}

export interface IOAuthState {
	readonly provider: OAuthProviderName;
	readonly codeVerifier: string;
	readonly state: string;
	readonly timestamp: number;
}

export interface IOAuthFlowResult {
	readonly authorizationUrl: string;
	readonly state: string;
}

// ============================================================================
// Default OAuth Configurations
// ============================================================================

const OAUTH_CONFIGS: Record<OAuthProviderName, IOAuthConfig> = {
	anthropic: {
		provider: 'anthropic',
		clientId: '', // Must be configured by the user or via settings
		authorizationEndpoint: 'https://console.anthropic.com/oauth/authorize',
		tokenEndpoint: 'https://console.anthropic.com/oauth/token',
		scopes: ['api:read', 'api:write'],
		redirectUri: 'vscode://director-code/auth/callback',
	},
	openai: {
		provider: 'openai',
		clientId: '',
		authorizationEndpoint: 'https://auth0.openai.com/authorize',
		tokenEndpoint: 'https://auth0.openai.com/oauth/token',
		scopes: ['openid', 'profile'],
		redirectUri: 'vscode://director-code/auth/callback',
	},
};

/**
 * Get the default OAuth configuration for a provider.
 */
export function getOAuthConfig(provider: OAuthProviderName): IOAuthConfig {
	return OAUTH_CONFIGS[provider];
}

// ============================================================================
// PKCE Helpers
// ============================================================================

/**
 * Generate a cryptographically random code verifier (43-128 chars, RFC 7636).
 */
export function generateCodeVerifier(length: number = 64): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
	const array = new Uint8Array(length);
	crypto.getRandomValues(array);
	return Array.from(array, byte => chars[byte % chars.length]).join('');
}

/**
 * Generate a code_challenge from a code_verifier using S256 (SHA-256).
 * Returns a base64url-encoded string.
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(verifier);
	const hash = await crypto.subtle.digest('SHA-256', data);
	return base64UrlEncode(new Uint8Array(hash));
}

/**
 * Generate a random state parameter for CSRF protection.
 */
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

// ============================================================================
// IOAuthService Interface
// ============================================================================

export const IOAuthService = createDecorator<IOAuthService>('directorCodeOAuthService');

export interface IOAuthService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeAuth: Event<OAuthProviderName>;

	/**
	 * Start the OAuth authorization flow for a provider.
	 * Returns the authorization URL to open in the browser
	 * and the state parameter for verification.
	 *
	 * @param clientId Override the default client ID
	 */
	startOAuthFlow(provider: OAuthProviderName, clientId?: string): Promise<IOAuthFlowResult>;

	/**
	 * Handle the OAuth callback after user authorizes.
	 * Exchanges the authorization code for tokens.
	 */
	handleCallback(code: string, state: string): Promise<IOAuthTokens>;

	/**
	 * Get the current access token for a provider.
	 * Automatically refreshes if expired.
	 * Returns undefined if not authenticated.
	 */
	getAccessToken(provider: OAuthProviderName): Promise<string | undefined>;

	/**
	 * Check if the user is authenticated via OAuth for a provider.
	 */
	isAuthenticated(provider: OAuthProviderName): Promise<boolean>;

	/**
	 * Log out from a provider (clear tokens).
	 */
	logout(provider: OAuthProviderName): Promise<void>;

	/**
	 * Get stored tokens for a provider (for inspection/debugging).
	 */
	getTokens(provider: OAuthProviderName): Promise<IOAuthTokens | undefined>;
}

// ============================================================================
// OAuthService Implementation
// ============================================================================

export class OAuthService extends Disposable implements IOAuthService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeAuth = this._register(new Emitter<OAuthProviderName>());
	readonly onDidChangeAuth: Event<OAuthProviderName> = this._onDidChangeAuth.event;

	private readonly _refreshTimers = new Map<string, ReturnType<typeof setTimeout>>();

	constructor(
		@ISecretStorageService private readonly secretService: ISecretStorageService,
	) {
		super();
	}

	override dispose(): void {
		for (const timer of this._refreshTimers.values()) {
			clearTimeout(timer);
		}
		this._refreshTimers.clear();
		super.dispose();
	}

	// ========================================================================
	// OAuth Flow
	// ========================================================================

	async startOAuthFlow(provider: OAuthProviderName, clientId?: string): Promise<IOAuthFlowResult> {
		const config = getOAuthConfig(provider);
		const effectiveClientId = clientId || config.clientId;

		if (!effectiveClientId) {
			throw new Error(`OAuth client ID not configured for ${provider}. Set it in Director Code settings.`);
		}

		const codeVerifier = generateCodeVerifier();
		const codeChallenge = await generateCodeChallenge(codeVerifier);
		const state = generateState();

		// Store flow state for callback verification
		const flowState: IOAuthState = {
			provider,
			codeVerifier,
			state,
			timestamp: Date.now(),
		};
		await this.secretService.set(
			`${OAUTH_STATE_PREFIX}.${state}`,
			JSON.stringify(flowState),
		);

		// Build authorization URL
		const params = new URLSearchParams({
			response_type: 'code',
			client_id: effectiveClientId,
			redirect_uri: config.redirectUri,
			scope: config.scopes.join(' '),
			state,
			code_challenge: codeChallenge,
			code_challenge_method: 'S256',
		});

		const authorizationUrl = `${config.authorizationEndpoint}?${params.toString()}`;

		return { authorizationUrl, state };
	}

	async handleCallback(code: string, state: string): Promise<IOAuthTokens> {
		// Retrieve and verify flow state
		const stateJson = await this.secretService.get(`${OAUTH_STATE_PREFIX}.${state}`);
		if (!stateJson) {
			throw new Error('Invalid or expired OAuth state. Please restart the login flow.');
		}

		let flowState: IOAuthState;
		try {
			flowState = JSON.parse(stateJson) as IOAuthState;
		} catch {
			throw new Error('Corrupted OAuth state data.');
		}

		// Clean up state
		await this.secretService.delete(`${OAUTH_STATE_PREFIX}.${state}`);

		// Check state age (15 min max)
		if (Date.now() - flowState.timestamp > 15 * 60 * 1000) {
			throw new Error('OAuth state expired. Please restart the login flow.');
		}

		// Exchange code for tokens
		const config = getOAuthConfig(flowState.provider);
		const tokens = await this._exchangeCodeForTokens(
			config,
			code,
			flowState.codeVerifier,
		);

		// Store tokens
		await this._storeTokens(flowState.provider, tokens);

		// Schedule refresh
		this._scheduleRefresh(flowState.provider, tokens);

		this._onDidChangeAuth.fire(flowState.provider);

		return tokens;
	}

	// ========================================================================
	// Token Access
	// ========================================================================

	async getAccessToken(provider: OAuthProviderName): Promise<string | undefined> {
		const tokens = await this.getTokens(provider);
		if (!tokens) {
			return undefined;
		}

		// Check if token is expired
		if (tokens.expiresAt && Date.now() >= tokens.expiresAt - REFRESH_BUFFER_MS) {
			if (tokens.refreshToken) {
				try {
					const refreshed = await this._refreshAccessToken(provider, tokens.refreshToken);
					return refreshed.accessToken;
				} catch {
					// Refresh failed — clear tokens
					await this.logout(provider);
					return undefined;
				}
			}
			// No refresh token and expired
			await this.logout(provider);
			return undefined;
		}

		return tokens.accessToken;
	}

	async isAuthenticated(provider: OAuthProviderName): Promise<boolean> {
		const token = await this.getAccessToken(provider);
		return token !== undefined;
	}

	async logout(provider: OAuthProviderName): Promise<void> {
		await this.secretService.delete(this._tokenKey(provider));

		const timer = this._refreshTimers.get(provider);
		if (timer) {
			clearTimeout(timer);
			this._refreshTimers.delete(provider);
		}

		this._onDidChangeAuth.fire(provider);
	}

	async getTokens(provider: OAuthProviderName): Promise<IOAuthTokens | undefined> {
		const json = await this.secretService.get(this._tokenKey(provider));
		if (!json) {
			return undefined;
		}
		try {
			return JSON.parse(json) as IOAuthTokens;
		} catch {
			return undefined;
		}
	}

	// ========================================================================
	// Token Exchange
	// ========================================================================

	private async _exchangeCodeForTokens(
		config: IOAuthConfig,
		code: string,
		codeVerifier: string,
	): Promise<IOAuthTokens> {
		const body = new URLSearchParams({
			grant_type: 'authorization_code',
			code,
			redirect_uri: config.redirectUri,
			client_id: config.clientId,
			code_verifier: codeVerifier,
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

		return {
			accessToken: data.access_token,
			refreshToken: data.refresh_token,
			expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
			tokenType: data.token_type,
			scope: data.scope,
		};
	}

	// ========================================================================
	// Token Refresh
	// ========================================================================

	private async _refreshAccessToken(
		provider: OAuthProviderName,
		refreshToken: string,
	): Promise<IOAuthTokens> {
		const config = getOAuthConfig(provider);

		const body = new URLSearchParams({
			grant_type: 'refresh_token',
			refresh_token: refreshToken,
			client_id: config.clientId,
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
			refreshToken: data.refresh_token || refreshToken,
			expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
			tokenType: data.token_type,
			scope: data.scope,
		};

		await this._storeTokens(provider, tokens);
		this._scheduleRefresh(provider, tokens);
		this._onDidChangeAuth.fire(provider);

		return tokens;
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
				if (tokens.refreshToken) {
					await this._refreshAccessToken(provider, tokens.refreshToken);
				}
			} catch {
				// Refresh failed silently — getAccessToken will handle on next call
			}
		}, delay);

		this._refreshTimers.set(provider, timer);
	}

	// ========================================================================
	// Storage Helpers
	// ========================================================================

	private _tokenKey(provider: OAuthProviderName): string {
		return `${OAUTH_TOKEN_PREFIX}.${provider}`;
	}

	private async _storeTokens(provider: OAuthProviderName, tokens: IOAuthTokens): Promise<void> {
		await this.secretService.set(this._tokenKey(provider), JSON.stringify(tokens));
	}
}
