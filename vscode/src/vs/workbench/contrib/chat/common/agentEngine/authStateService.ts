/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unified authentication state for Director Code providers.
 *
 * This is the single production entry point for deciding whether a request
 * should use an API key, OAuth bearer token, or report missing credentials.
 */

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IApiKeyService, providerToApiType, resolveConfiguredProviderCapabilities, type IApiKeyChangeEvent, type ProviderName } from './apiKeyService.js';
import { IOAuthService, type OAuthProviderName } from './oauthService.js';
import type { ProviderAuth, ProviderCapabilities } from './providers/providerTypes.js';
import { DEFAULT_AUTH_VARIANT, OPENAI_CODEX_AUTH_VARIANT, type AuthVariantName } from './providers/providerTypes.js';

// ============================================================================
// Types
// ============================================================================

export type AuthStateSource = 'oauth' | 'per-model-key' | 'provider-key' | 'missing';

export interface IResolvedAuthStateMetadata {
	readonly sourceLabel?: string;
	readonly expiresAt?: number;
	readonly hasRefreshToken?: boolean;
	readonly reason?: string;
}

export interface IResolvedAuthState {
	readonly source: AuthStateSource;
	readonly provider: ProviderName;
	readonly model: string;
	readonly authVariant: AuthVariantName;
	readonly apiKey?: string;
	readonly accessToken?: string;
	readonly refreshToken?: string;
	readonly auth?: ProviderAuth;
	readonly baseURL?: string;
	readonly capabilities?: ProviderCapabilities;
	readonly identityKey?: string;
	readonly metadata?: IResolvedAuthStateMetadata;
}

export const IAuthStateService = createDecorator<IAuthStateService>('directorCodeAuthStateService');

export interface IAuthStateService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeAuthState: Event<ProviderName>;

	resolveAuth(provider: ProviderName, model: string, authVariant: AuthVariantName, globalBaseURL?: string): Promise<IResolvedAuthState>;
}

// ============================================================================
// Helpers
// ============================================================================

export function normalizeAuthVariantForProvider(provider: ProviderName, authVariant: AuthVariantName | string | undefined): AuthVariantName {
	if (provider === 'openai' && authVariant === OPENAI_CODEX_AUTH_VARIANT) {
		return OPENAI_CODEX_AUTH_VARIANT;
	}
	return DEFAULT_AUTH_VARIANT;
}

export function isApiKeyAuthState(state: IResolvedAuthState): boolean {
	return state.source === 'per-model-key' || state.source === 'provider-key';
}

function providerFromApiKeyEvent(event: IApiKeyChangeEvent): ProviderName | undefined {
	return event.provider;
}

async function sha256Prefix(value: string): Promise<string> {
	const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
	return Array.from(new Uint8Array(hash))
		.map(byte => byte.toString(16).padStart(2, '0'))
		.join('')
		.slice(0, 16);
}

function isOAuthProvider(provider: ProviderName): provider is OAuthProviderName {
	return provider === 'anthropic' || provider === 'openai';
}

// ============================================================================
// AuthStateService Implementation
// ============================================================================

export class AuthStateService extends Disposable implements IAuthStateService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeAuthState = this._register(new Emitter<ProviderName>());
	readonly onDidChangeAuthState: Event<ProviderName> = this._onDidChangeAuthState.event;

	constructor(
		@IApiKeyService private readonly apiKeyService: IApiKeyService,
		@IOAuthService private readonly oauthService: IOAuthService,
	) {
		super();

		this._register(this.apiKeyService.onDidChangeApiKey(event => {
			const provider = providerFromApiKeyEvent(event);
			if (provider) {
				this._onDidChangeAuthState.fire(provider);
			}
		}));

		this._register(this.oauthService.onDidChangeAuth(provider => {
			this._onDidChangeAuthState.fire(provider);
		}));
	}

	async resolveAuth(
		provider: ProviderName,
		model: string,
		authVariant: AuthVariantName,
		globalBaseURL?: string,
	): Promise<IResolvedAuthState> {
		if (provider !== 'openai' && authVariant !== DEFAULT_AUTH_VARIANT) {
			return this._missing(provider, model, DEFAULT_AUTH_VARIANT, `Auth variant "${authVariant}" is only supported for OpenAI.`);
		}

		if (isOAuthProvider(provider)) {
			const oauthState = await this._tryResolveOAuth(provider, model, authVariant);
			if (oauthState) {
				return oauthState;
			}
			if (provider === 'openai' && authVariant === OPENAI_CODEX_AUTH_VARIANT) {
				return this._missing(provider, model, OPENAI_CODEX_AUTH_VARIANT, 'No OpenAI Codex OAuth login found.');
			}
		}

		return this._resolveApiKey(provider, model, DEFAULT_AUTH_VARIANT, globalBaseURL);
	}

	private async _resolveApiKey(
		provider: ProviderName,
		model: string,
		authVariant: AuthVariantName,
		globalBaseURL?: string,
	): Promise<IResolvedAuthState> {
		const [apiKey, hasPerModelKey, modelConfig] = await Promise.all([
			this.apiKeyService.getModelApiKey(provider, model),
			this.apiKeyService.hasModelApiKey(provider, model),
			this.apiKeyService.getModelConfig(provider, model),
		]);

		if (!apiKey) {
			return this._missing(provider, model, authVariant, `No API key configured for ${provider}.`);
		}

		const source: AuthStateSource = hasPerModelKey ? 'per-model-key' : 'provider-key';
		const baseURL = modelConfig?.baseURL || globalBaseURL || undefined;
		const capabilities = resolveConfiguredProviderCapabilities(provider, model, modelConfig);
		const identityScope = hasPerModelKey ? model : 'provider';
		const auth: ProviderAuth = { kind: 'api-key', value: apiKey };
		const keyHash = await sha256Prefix(apiKey);

		return {
			source,
			provider,
			model,
			authVariant,
			apiKey,
			auth,
			baseURL,
			capabilities,
			identityKey: `api-key:${provider}:${identityScope}:${keyHash}`,
			metadata: {
				sourceLabel: hasPerModelKey ? `${provider} per-model API key` : `${provider} API key`,
			},
		};
	}

	private async _tryResolveOAuth(
		provider: OAuthProviderName,
		model: string,
		authVariant: AuthVariantName,
	): Promise<IResolvedAuthState | undefined> {
		const [status, tokens] = await Promise.all([
			this.oauthService.getStatus(provider),
			this.oauthService.getTokens(provider),
		]);

		if (!status.loggedIn) {
			return undefined;
		}

		if (!tokens?.accessToken) {
			return undefined;
		}

		const tokenAuthVariant = tokens.authVariant ?? status.authVariant ?? DEFAULT_AUTH_VARIANT;
		if (tokenAuthVariant !== authVariant) {
			return undefined;
		}

		const auth: ProviderAuth = {
			kind: 'bearer',
			accessToken: tokens.accessToken,
			refreshToken: tokens.refreshToken,
			clientId: tokens.clientId,
		};

		return {
			source: 'oauth',
			provider,
			model,
			authVariant,
			accessToken: tokens.accessToken,
			refreshToken: tokens.refreshToken,
			auth,
			capabilities: resolveConfiguredProviderCapabilities(
				provider,
				model,
				undefined,
				provider === 'openai' && authVariant === OPENAI_CODEX_AUTH_VARIANT
					? 'openai-codex'
					: providerToApiType(provider),
			),
			identityKey: tokens.authIdentityKey ?? `oauth:${provider}:${authVariant}:token:${await sha256Prefix(tokens.refreshToken || tokens.accessToken)}`,
			metadata: {
				sourceLabel: status.sourceLabel,
				expiresAt: tokens.expiresAt ?? status.expiresAt,
				hasRefreshToken: !!tokens.refreshToken,
			},
		};
	}

	private _missing(
		provider: ProviderName,
		model: string,
		authVariant: AuthVariantName,
		reason: string,
	): IResolvedAuthState {
		return {
			source: 'missing',
			provider,
			model,
			authVariant,
			identityKey: `missing:${provider}:${authVariant}`,
			metadata: { reason },
		};
	}
}
