/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import {
	OAuthService,
	generateCodeVerifier,
	generateCodeChallenge,
	generateState,
	getOAuthConfig,
	type IOAuthTokens,
	type OAuthProviderName,
} from '../../../common/agentEngine/oauthService.js';
import { OAUTH_CAPABLE_PROVIDERS } from '../../../common/agentEngine/apiKeyService.js';
import type { ISecretStorageService, ISecretStorageProvider } from '../../../../../../platform/secrets/common/secrets.js';

// ============================================================================
// Mock ISecretStorageService
// ============================================================================

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

	async keys(): Promise<string[]> {
		return Array.from(this._store.keys());
	}

	getStore(): Map<string, string> { return this._store; }

	dispose(): void {
		this._onDidChangeSecret.dispose();
	}
}

suite("AgentEngine - OAuthService", () => {

	const disposables = new DisposableStore();
	let mockSecretService: MockSecretStorageService;
	let oauthService: OAuthService;
	let originalFetch: typeof globalThis.fetch;

	setup(() => {
		originalFetch = globalThis.fetch;
		mockSecretService = new MockSecretStorageService();
		oauthService = new OAuthService(mockSecretService as any);
		disposables.add(oauthService);
	});

	teardown(() => {
		disposables.clear();
		mockSecretService.dispose();
		globalThis.fetch = originalFetch;
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	// ---------------------------------------------------------------
	// PKCE Helpers
	// ---------------------------------------------------------------
	suite("PKCE Helpers", () => {

		test("generateCodeVerifier produces string of correct length", () => {
			const verifier = generateCodeVerifier(64);
			assert.strictEqual(verifier.length, 64);
		});

		test("generateCodeVerifier uses only allowed characters", () => {
			const verifier = generateCodeVerifier(128);
			const allowed = /^[A-Za-z0-9\-._~]+$/;
			assert.ok(allowed.test(verifier), "verifier contains invalid characters");
		});

		test("generateCodeVerifier produces unique values", () => {
			const a = generateCodeVerifier();
			const b = generateCodeVerifier();
			assert.notStrictEqual(a, b);
		});

		test("generateCodeChallenge produces base64url string", async () => {
			const verifier = generateCodeVerifier();
			const challenge = await generateCodeChallenge(verifier);
			assert.ok(challenge.length > 0);
			assert.ok(!challenge.includes('+'), "should not contain +");
			assert.ok(!challenge.includes('/'), "should not contain /");
			assert.ok(!challenge.includes('='), "should not contain =");
		});

		test("generateCodeChallenge is deterministic for same input", async () => {
			const verifier = "test-verifier-12345";
			const a = await generateCodeChallenge(verifier);
			const b = await generateCodeChallenge(verifier);
			assert.strictEqual(a, b);
		});

		test("generateCodeChallenge differs for different inputs", async () => {
			const a = await generateCodeChallenge("verifier-a");
			const b = await generateCodeChallenge("verifier-b");
			assert.notStrictEqual(a, b);
		});

		test("generateState produces unique values", () => {
			const a = generateState();
			const b = generateState();
			assert.notStrictEqual(a, b);
			assert.ok(a.length > 20);
		});
	});

	// ---------------------------------------------------------------
	// OAuth Configuration
	// ---------------------------------------------------------------
	suite("OAuth Configuration", () => {

		test("getOAuthConfig returns config for anthropic", () => {
			const config = getOAuthConfig("anthropic");
			assert.strictEqual(config.provider, "anthropic");
			assert.ok(config.authorizationEndpoint.includes("anthropic"));
			assert.ok(config.tokenEndpoint.includes("anthropic"));
			assert.ok(config.scopes.length > 0);
			assert.ok(config.redirectUri.includes("director-code"));
		});

		test("getOAuthConfig returns config for openai", () => {
			const config = getOAuthConfig("openai");
			assert.strictEqual(config.provider, "openai");
			assert.ok(config.authorizationEndpoint.includes("openai"));
			assert.ok(config.scopes.length > 0);
		});

		test("OAUTH_CAPABLE_PROVIDERS includes anthropic and openai", () => {
			assert.ok(OAUTH_CAPABLE_PROVIDERS.includes("anthropic"));
			assert.ok(OAUTH_CAPABLE_PROVIDERS.includes("openai"));
		});

		test("both configs use PKCE redirect URI scheme", () => {
			for (const provider of ["anthropic", "openai"] as OAuthProviderName[]) {
				const config = getOAuthConfig(provider);
				assert.ok(config.redirectUri.startsWith("vscode://"));
			}
		});
	});

	// ---------------------------------------------------------------
	// startOAuthFlow
	// ---------------------------------------------------------------
	suite("startOAuthFlow", () => {

		test("throws error when no client ID configured", async () => {
			try {
				await oauthService.startOAuthFlow("anthropic");
				assert.fail("Should have thrown");
			} catch (err: any) {
				assert.ok(err.message.includes("client ID"));
			}
		});

		test("returns authorization URL with correct parameters", async () => {
			const result = await oauthService.startOAuthFlow("anthropic", "test-client-id");
			const url = new URL(result.authorizationUrl);

			assert.strictEqual(url.searchParams.get("response_type"), "code");
			assert.strictEqual(url.searchParams.get("client_id"), "test-client-id");
			assert.strictEqual(url.searchParams.get("code_challenge_method"), "S256");
			assert.ok(url.searchParams.get("code_challenge"));
			assert.ok(url.searchParams.get("state"));
			assert.ok(url.searchParams.get("redirect_uri"));
		});

		test("stores flow state in secret service", async () => {
			const result = await oauthService.startOAuthFlow("openai", "client-123");
			const stateKey = `director-code.oauthState.${result.state}`;
			const stored = await mockSecretService.get(stateKey);
			assert.ok(stored);

			const parsed = JSON.parse(stored!);
			assert.strictEqual(parsed.provider, "openai");
			assert.ok(parsed.codeVerifier);
			assert.strictEqual(parsed.state, result.state);
		});

		test("different flows produce different states", async () => {
			const a = await oauthService.startOAuthFlow("anthropic", "id");
			const b = await oauthService.startOAuthFlow("anthropic", "id");
			assert.notStrictEqual(a.state, b.state);
		});
	});

	// ---------------------------------------------------------------
	// handleCallback
	// ---------------------------------------------------------------
	suite("handleCallback", () => {

		test("throws error for invalid state", async () => {
			try {
				await oauthService.handleCallback("code", "invalid-state");
				assert.fail("Should have thrown");
			} catch (err: any) {
				assert.ok(err.message.includes("Invalid"));
			}
		});

		test("throws error for expired state", async () => {
			const state = "expired-state";
			const flowState = {
				provider: "anthropic",
				codeVerifier: "verifier",
				state,
				timestamp: Date.now() - 20 * 60 * 1000, // 20 min ago
			};
			await mockSecretService.set(`director-code.oauthState.${state}`, JSON.stringify(flowState));

			try {
				await oauthService.handleCallback("code", state);
				assert.fail("Should have thrown");
			} catch (err: any) {
				assert.ok(err.message.includes("expired"));
			}
		});

		test("exchanges code for tokens on success", async () => {
			// Set up flow state
			const state = "valid-state";
			const flowState = {
				provider: "anthropic",
				codeVerifier: "test-verifier",
				state,
				timestamp: Date.now(),
			};
			await mockSecretService.set(`director-code.oauthState.${state}`, JSON.stringify(flowState));

			// Mock token endpoint
			globalThis.fetch = ((_url: string | URL | Request, _init?: RequestInit) => {
				return Promise.resolve(new Response(JSON.stringify({
					access_token: "at-123",
					refresh_token: "rt-456",
					expires_in: 3600,
					token_type: "Bearer",
				}), { status: 200 }));
			}) as any;

			const tokens = await oauthService.handleCallback("auth-code", state);
			assert.strictEqual(tokens.accessToken, "at-123");
			assert.strictEqual(tokens.refreshToken, "rt-456");
			assert.ok(tokens.expiresAt! > Date.now());
		});

		test("stores tokens in secret service after exchange", async () => {
			const state = "store-state";
			await mockSecretService.set(`director-code.oauthState.${state}`, JSON.stringify({
				provider: "openai",
				codeVerifier: "verifier",
				state,
				timestamp: Date.now(),
			}));

			globalThis.fetch = (() => Promise.resolve(new Response(JSON.stringify({
				access_token: "stored-token",
				expires_in: 7200,
			}), { status: 200 }))) as any;

			await oauthService.handleCallback("code", state);

			const stored = await mockSecretService.get("director-code.oauth.openai");
			assert.ok(stored);
			const parsed = JSON.parse(stored!);
			assert.strictEqual(parsed.accessToken, "stored-token");
		});

		test("fires onDidChangeAuth event after successful callback", async () => {
			const state = "event-state";
			await mockSecretService.set(`director-code.oauthState.${state}`, JSON.stringify({
				provider: "anthropic",
				codeVerifier: "verifier",
				state,
				timestamp: Date.now(),
			}));

			globalThis.fetch = (() => Promise.resolve(new Response(JSON.stringify({
				access_token: "token",
			}), { status: 200 }))) as any;

			const events: string[] = [];
			disposables.add(oauthService.onDidChangeAuth(p => events.push(p)));

			await oauthService.handleCallback("code", state);
			assert.ok(events.includes("anthropic"));
		});

		test("cleans up state after callback", async () => {
			const state = "cleanup-state";
			await mockSecretService.set(`director-code.oauthState.${state}`, JSON.stringify({
				provider: "anthropic",
				codeVerifier: "verifier",
				state,
				timestamp: Date.now(),
			}));

			globalThis.fetch = (() => Promise.resolve(new Response(JSON.stringify({
				access_token: "token",
			}), { status: 200 }))) as any;

			await oauthService.handleCallback("code", state);

			const remaining = await mockSecretService.get(`director-code.oauthState.${state}`);
			assert.strictEqual(remaining, undefined);
		});
	});

	// ---------------------------------------------------------------
	// Token Access
	// ---------------------------------------------------------------
	suite("Token Access", () => {

		test("getAccessToken returns undefined when not authenticated", async () => {
			const token = await oauthService.getAccessToken("anthropic");
			assert.strictEqual(token, undefined);
		});

		test("getAccessToken returns token when stored and not expired", async () => {
			const tokens: IOAuthTokens = {
				accessToken: "valid-token",
				expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour from now
			};
			await mockSecretService.set("director-code.oauth.anthropic", JSON.stringify(tokens));

			const token = await oauthService.getAccessToken("anthropic");
			assert.strictEqual(token, "valid-token");
		});

		test("getAccessToken returns token without expiresAt (no expiry)", async () => {
			const tokens: IOAuthTokens = { accessToken: "no-expiry-token" };
			await mockSecretService.set("director-code.oauth.openai", JSON.stringify(tokens));

			const token = await oauthService.getAccessToken("openai");
			assert.strictEqual(token, "no-expiry-token");
		});

		test("isAuthenticated returns false when no tokens", async () => {
			assert.strictEqual(await oauthService.isAuthenticated("anthropic"), false);
		});

		test("isAuthenticated returns true when valid tokens exist", async () => {
			await mockSecretService.set("director-code.oauth.anthropic", JSON.stringify({
				accessToken: "token",
				expiresAt: Date.now() + 3600000,
			}));
			assert.strictEqual(await oauthService.isAuthenticated("anthropic"), true);
		});

		test("getTokens returns stored tokens", async () => {
			const tokens: IOAuthTokens = {
				accessToken: "at",
				refreshToken: "rt",
				expiresAt: 99999999999,
				tokenType: "Bearer",
				scope: "api:read",
			};
			await mockSecretService.set("director-code.oauth.anthropic", JSON.stringify(tokens));

			const result = await oauthService.getTokens("anthropic");
			assert.deepStrictEqual(result, tokens);
		});

		test("getTokens returns undefined for malformed JSON", async () => {
			await mockSecretService.set("director-code.oauth.openai", "not-json");
			const result = await oauthService.getTokens("openai");
			assert.strictEqual(result, undefined);
		});
	});

	// ---------------------------------------------------------------
	// Logout
	// ---------------------------------------------------------------
	suite("Logout", () => {

		test("logout clears tokens", async () => {
			await mockSecretService.set("director-code.oauth.anthropic", JSON.stringify({
				accessToken: "token",
			}));

			await oauthService.logout("anthropic");

			const tokens = await oauthService.getTokens("anthropic");
			assert.strictEqual(tokens, undefined);
		});

		test("logout fires onDidChangeAuth", async () => {
			await mockSecretService.set("director-code.oauth.anthropic", JSON.stringify({
				accessToken: "token",
			}));

			const events: string[] = [];
			disposables.add(oauthService.onDidChangeAuth(p => events.push(p)));

			await oauthService.logout("anthropic");
			assert.ok(events.includes("anthropic"));
		});

		test("isAuthenticated returns false after logout", async () => {
			await mockSecretService.set("director-code.oauth.openai", JSON.stringify({
				accessToken: "token",
				expiresAt: Date.now() + 3600000,
			}));
			assert.strictEqual(await oauthService.isAuthenticated("openai"), true);

			await oauthService.logout("openai");
			assert.strictEqual(await oauthService.isAuthenticated("openai"), false);
		});

		test("logout is safe to call when not authenticated", async () => {
			await oauthService.logout("anthropic");
			assert.strictEqual(await oauthService.isAuthenticated("anthropic"), false);
		});
	});

	// ---------------------------------------------------------------
	// Token Refresh
	// ---------------------------------------------------------------
	suite("Token Refresh", () => {

		test("getAccessToken triggers refresh when token near expiry", async () => {
			const tokens: IOAuthTokens = {
				accessToken: "old-token",
				refreshToken: "rt-123",
				expiresAt: Date.now() + 60 * 1000, // Expires in 1 min (within 5 min buffer)
			};
			await mockSecretService.set("director-code.oauth.anthropic", JSON.stringify(tokens));

			globalThis.fetch = (() => Promise.resolve(new Response(JSON.stringify({
				access_token: "refreshed-token",
				refresh_token: "new-rt",
				expires_in: 3600,
			}), { status: 200 }))) as any;

			const token = await oauthService.getAccessToken("anthropic");
			assert.strictEqual(token, "refreshed-token");
		});

		test("getAccessToken clears tokens when refresh fails and no refresh token", async () => {
			const tokens: IOAuthTokens = {
				accessToken: "expired-token",
				expiresAt: Date.now() - 1000, // Already expired
			};
			await mockSecretService.set("director-code.oauth.openai", JSON.stringify(tokens));

			const token = await oauthService.getAccessToken("openai");
			assert.strictEqual(token, undefined);
			assert.strictEqual(await oauthService.isAuthenticated("openai"), false);
		});

		test("refresh preserves old refresh_token when new one not provided", async () => {
			const state = "refresh-state";
			await mockSecretService.set(`director-code.oauthState.${state}`, JSON.stringify({
				provider: "anthropic",
				codeVerifier: "v",
				state,
				timestamp: Date.now(),
			}));

			// Initial token exchange
			globalThis.fetch = (() => Promise.resolve(new Response(JSON.stringify({
				access_token: "at",
				refresh_token: "original-rt",
				expires_in: 1,
			}), { status: 200 }))) as any;

			await oauthService.handleCallback("code", state);

			const tokens = await oauthService.getTokens("anthropic");
			assert.strictEqual(tokens?.refreshToken, "original-rt");
		});
	});

	// ---------------------------------------------------------------
	// Edge Cases
	// ---------------------------------------------------------------
	suite("Edge Cases", () => {

		test("tokens for different providers are independent", async () => {
			await mockSecretService.set("director-code.oauth.anthropic", JSON.stringify({
				accessToken: "anthropic-token",
				expiresAt: Date.now() + 3600000,
			}));

			assert.strictEqual(await oauthService.isAuthenticated("anthropic"), true);
			assert.strictEqual(await oauthService.isAuthenticated("openai"), false);
		});

		test("handleCallback throws on token exchange failure", async () => {
			const state = "fail-state";
			await mockSecretService.set(`director-code.oauthState.${state}`, JSON.stringify({
				provider: "anthropic",
				codeVerifier: "v",
				state,
				timestamp: Date.now(),
			}));

			globalThis.fetch = (() => Promise.resolve(new Response("Error", { status: 400 }))) as any;

			try {
				await oauthService.handleCallback("code", state);
				assert.fail("Should have thrown");
			} catch (err: any) {
				assert.ok(err.message.includes("Token exchange failed"));
			}
		});

		test("corrupted stored state is handled", async () => {
			await mockSecretService.set("director-code.oauthState.bad", "not-json");

			try {
				await oauthService.handleCallback("code", "bad");
				assert.fail("Should have thrown");
			} catch (err: any) {
				assert.ok(err.message.includes("Corrupted"));
			}
		});
	});
});
