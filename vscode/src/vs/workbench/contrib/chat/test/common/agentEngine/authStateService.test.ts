/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import type { ISecretStorageProvider, ISecretStorageService } from '../../../../../../platform/secrets/common/secrets.js';
import { ApiKeyService } from '../../../common/agentEngine/apiKeyService.js';
import { AuthStateService } from '../../../common/agentEngine/authStateService.js';
import {
	type IOAuthLoginPayload,
	type IOAuthPollResult,
	type IOAuthService,
	type IOAuthStatus,
	type IOAuthStoredTokens,
	type IOAuthTokens,
	type OAuthProviderName,
} from '../../../common/agentEngine/oauthService.js';
import { DEFAULT_AUTH_VARIANT, OPENAI_CODEX_AUTH_VARIANT } from '../../../common/agentEngine/providers/providerTypes.js';

class MockSecretStorageService implements ISecretStorageService {
	declare readonly _serviceBrand: undefined;

	private readonly _store = new Map<string, string>();
	private readonly _onDidChangeSecret = new Emitter<string>();
	readonly onDidChangeSecret: Event<string> = this._onDidChangeSecret.event;
	readonly type: ISecretStorageProvider['type'] = 'in-memory';

	async get(key: string): Promise<string | undefined> {
		return this._store.get(key);
	}

	async set(key: string, value: string): Promise<void> {
		this._store.set(key, value);
		this._onDidChangeSecret.fire(key);
	}

	async delete(key: string): Promise<void> {
		this._store.delete(key);
		this._onDidChangeSecret.fire(key);
	}

	dispose(): void {
		this._onDidChangeSecret.dispose();
	}
}

class MockOAuthService implements IOAuthService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeAuth = new Emitter<OAuthProviderName>();
	readonly onDidChangeAuth: Event<OAuthProviderName> = this._onDidChangeAuth.event;

	statusByProvider = new Map<OAuthProviderName, IOAuthStatus>();
	tokensByProvider = new Map<OAuthProviderName, IOAuthStoredTokens>();

	async startLogin(_provider: OAuthProviderName): Promise<IOAuthLoginPayload> {
		throw new Error('not implemented');
	}

	async submitManualCode(_provider: OAuthProviderName, _sessionId: string, _code: string): Promise<IOAuthTokens> {
		throw new Error('not implemented');
	}

	async pollLogin(_provider: OAuthProviderName, _sessionId: string): Promise<IOAuthPollResult> {
		throw new Error('not implemented');
	}

	async getStatus(provider: OAuthProviderName): Promise<IOAuthStatus> {
		return this.statusByProvider.get(provider) ?? {
			loggedIn: false,
			source: 'oauth',
			sourceLabel: `${provider} OAuth`,
		};
	}

	async getTokens(provider: OAuthProviderName): Promise<IOAuthStoredTokens | undefined> {
		return this.tokensByProvider.get(provider);
	}

	async logout(provider: OAuthProviderName): Promise<void> {
		this.statusByProvider.delete(provider);
		this.tokensByProvider.delete(provider);
		this._onDidChangeAuth.fire(provider);
	}

	async handleCallback(_code: string, _state: string): Promise<IOAuthTokens> {
		throw new Error('deprecated');
	}

	fireAuth(provider: OAuthProviderName): void {
		this._onDidChangeAuth.fire(provider);
	}

	dispose(): void {
		this._onDidChangeAuth.dispose();
	}
}

suite('AgentEngine - AuthStateService (B1-8)', () => {
	const disposables = new DisposableStore();
	let secretService: MockSecretStorageService;
	let apiKeyService: ApiKeyService;
	let oauthService: MockOAuthService;
	let authStateService: AuthStateService;

	setup(() => {
		secretService = new MockSecretStorageService();
		apiKeyService = new ApiKeyService(secretService as any);
		oauthService = new MockOAuthService();
		authStateService = new AuthStateService(apiKeyService, oauthService);

		disposables.add(apiKeyService);
		disposables.add(authStateService);
		disposables.add({ dispose: () => oauthService.dispose() });
	});

	teardown(() => {
		disposables.clear();
		secretService.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('resolves provider-level API key auth', async () => {
		await apiKeyService.setApiKey('anthropic', 'provider-key');

		const state = await authStateService.resolveAuth('anthropic', 'claude-sonnet-4-6', DEFAULT_AUTH_VARIANT);

		assert.strictEqual(state.source, 'provider-key');
		assert.strictEqual(state.authVariant, DEFAULT_AUTH_VARIANT);
		assert.strictEqual(state.apiKey, 'provider-key');
		assert.deepStrictEqual(state.auth, { kind: 'api-key', value: 'provider-key' });
		assert.ok(state.identityKey?.includes('provider'));
	});

	test('prefers matching OAuth state over API keys', async () => {
		await apiKeyService.setApiKey('anthropic', 'provider-key');
		const tokens: IOAuthStoredTokens = {
			accessToken: 'anthropic-access-token',
			refreshToken: 'anthropic-refresh-token',
			expiresAt: Date.now() + 3600_000,
			clientId: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
			flowKind: 'pkce_manual',
			authVariant: DEFAULT_AUTH_VARIANT,
		};
		oauthService.tokensByProvider.set('anthropic', tokens);
		oauthService.statusByProvider.set('anthropic', {
			loggedIn: true,
			source: 'oauth',
			sourceLabel: 'anthropic OAuth',
			flow: 'pkce_manual',
			authVariant: DEFAULT_AUTH_VARIANT,
			expiresAt: tokens.expiresAt,
			hasRefreshToken: true,
		});

		const state = await authStateService.resolveAuth('anthropic', 'claude-sonnet-4-6', DEFAULT_AUTH_VARIANT);

		assert.strictEqual(state.source, 'oauth');
		assert.strictEqual(state.apiKey, undefined);
		assert.strictEqual(state.accessToken, 'anthropic-access-token');
		assert.deepStrictEqual(state.auth, {
			kind: 'bearer',
			accessToken: 'anthropic-access-token',
			refreshToken: 'anthropic-refresh-token',
			clientId: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
		});
	});

	test('resolves per-model API key and model config', async () => {
		await apiKeyService.setApiKey('openai', 'provider-key');
		await apiKeyService.setModelApiKey('openai', 'gpt-4o', 'model-key');
		await apiKeyService.setModelConfig('openai', 'gpt-4o', {
			baseURL: 'https://proxy.example/v1',
			capabilities: { vision: false, toolCalling: true },
		});

		const state = await authStateService.resolveAuth('openai', 'gpt-4o', DEFAULT_AUTH_VARIANT, 'https://global.example/v1');

		assert.strictEqual(state.source, 'per-model-key');
		assert.strictEqual(state.apiKey, 'model-key');
		assert.strictEqual(state.baseURL, 'https://proxy.example/v1');
		assert.strictEqual(state.capabilities?.vision, false);
		assert.ok(state.identityKey?.includes('gpt-4o'));
	});

	test('falls back to global baseURL when no model config is set', async () => {
		await apiKeyService.setApiKey('openai', 'provider-key');

		const state = await authStateService.resolveAuth('openai', 'gpt-4o', DEFAULT_AUTH_VARIANT, 'https://global.example/v1');

		assert.strictEqual(state.source, 'provider-key');
		assert.strictEqual(state.baseURL, 'https://global.example/v1');
	});

	test('returns missing when API key is unavailable', async () => {
		const state = await authStateService.resolveAuth('gemini', 'gemini-2.5-pro', DEFAULT_AUTH_VARIANT);

		assert.strictEqual(state.source, 'missing');
		assert.strictEqual(state.auth, undefined);
		assert.ok(state.metadata?.reason?.includes('No API key'));
	});

	test('resolves OpenAI Codex OAuth tokens by authVariant', async () => {
		const tokens: IOAuthStoredTokens = {
			accessToken: 'codex-access-token',
			refreshToken: 'codex-refresh-token',
			expiresAt: Date.now() + 3600_000,
			clientId: 'app_EMoamEEZ73f0CkXaXp7hrann',
			flowKind: 'device_code',
			authVariant: OPENAI_CODEX_AUTH_VARIANT,
		};
		oauthService.tokensByProvider.set('openai', tokens);
		oauthService.statusByProvider.set('openai', {
			loggedIn: true,
			source: 'oauth',
			sourceLabel: 'OpenAI (ChatGPT/Codex OAuth)',
			flow: 'device_code',
			authVariant: OPENAI_CODEX_AUTH_VARIANT,
			expiresAt: tokens.expiresAt,
			hasRefreshToken: true,
		});

		const state = await authStateService.resolveAuth('openai', 'gpt-5.5', OPENAI_CODEX_AUTH_VARIANT);

		assert.strictEqual(state.source, 'oauth');
		assert.strictEqual(state.authVariant, OPENAI_CODEX_AUTH_VARIANT);
		assert.strictEqual(state.accessToken, 'codex-access-token');
		assert.deepStrictEqual(state.auth, {
			kind: 'bearer',
			accessToken: 'codex-access-token',
			refreshToken: 'codex-refresh-token',
			clientId: 'app_EMoamEEZ73f0CkXaXp7hrann',
		});
		assert.ok(state.identityKey?.includes(OPENAI_CODEX_AUTH_VARIANT));
	});

	test('does not use OpenAI OAuth when default authVariant is requested', async () => {
		oauthService.statusByProvider.set('openai', {
			loggedIn: true,
			source: 'oauth',
			sourceLabel: 'OpenAI (ChatGPT/Codex OAuth)',
			authVariant: OPENAI_CODEX_AUTH_VARIANT,
		});

		const state = await authStateService.resolveAuth('openai', 'gpt-4o', DEFAULT_AUTH_VARIANT);

		assert.strictEqual(state.source, 'missing');
		assert.strictEqual(state.authVariant, DEFAULT_AUTH_VARIANT);
		assert.ok(state.metadata?.reason?.includes('No API key'));
	});

	test('returns missing for OpenAI Codex OAuth when not logged in', async () => {
		const state = await authStateService.resolveAuth('openai', 'gpt-5.5', OPENAI_CODEX_AUTH_VARIANT);

		assert.strictEqual(state.source, 'missing');
		assert.strictEqual(state.authVariant, OPENAI_CODEX_AUTH_VARIANT);
		assert.ok(state.metadata?.reason?.includes('No OpenAI Codex OAuth login'));
	});

	test('rejects non-OpenAI openai-codex authVariant', async () => {
		const state = await authStateService.resolveAuth('anthropic', 'claude-sonnet-4-6', OPENAI_CODEX_AUTH_VARIANT);

		assert.strictEqual(state.source, 'missing');
		assert.strictEqual(state.authVariant, DEFAULT_AUTH_VARIANT);
		assert.ok(state.metadata?.reason?.includes('only supported for OpenAI'));
	});

	test('aggregates API key and OAuth change events', async () => {
		const events: string[] = [];
		disposables.add(authStateService.onDidChangeAuthState(provider => events.push(provider)));

		await apiKeyService.setApiKey('anthropic', 'provider-key');
		await apiKeyService.setModelApiKey('openai', 'gpt-4o', 'model-key');
		oauthService.fireAuth('openai');

		assert.deepStrictEqual(events, ['anthropic', 'openai', 'openai']);
	});
});
