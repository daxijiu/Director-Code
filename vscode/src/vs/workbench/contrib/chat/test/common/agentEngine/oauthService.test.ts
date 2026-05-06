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
	getOAuthProviderConfig,
	type IOAuthTokens,
	type IOAuthSession,
	type OAuthProviderName,
	type IOAuthStoredTokens,
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

	getStore(): Map<string, string> { return this._store; }

	dispose(): void {
		this._onDidChangeSecret.dispose();
	}
}

// ============================================================================
// Test Helpers
// ============================================================================

function makeDeviceCodeResponse(overrides: Record<string, any> = {}): object {
	return {
		device_code: 'dc-test-device-code',
		user_code: 'ABCD-1234',
		verification_uri: 'https://auth.openai.com/device',
		verification_uri_complete: 'https://auth.openai.com/device?user_code=ABCD-1234',
		expires_in: 600,
		interval: 5,
		...overrides,
	};
}

function makeTokenResponse(overrides: Record<string, any> = {}): object {
	return {
		access_token: 'at-test-token',
		refresh_token: 'rt-test-token',
		expires_in: 3600,
		token_type: 'Bearer',
		scope: 'api:read api:write',
		...overrides,
	};
}

function jsonResponse(body: object, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

suite("AgentEngine - OAuthService (B1-2)", () => {

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
	// Provider Configuration
	// ---------------------------------------------------------------
	suite("Provider Configuration", () => {

		test("anthropic config uses pkce_manual flow", () => {
			const config = getOAuthProviderConfig("anthropic");
			assert.strictEqual(config.provider, "anthropic");
			assert.strictEqual(config.flowKind, "pkce_manual");
			assert.ok(config.authorizationEndpoint!.includes("claude.ai"));
			assert.ok(config.tokenEndpoint.includes("anthropic"));
			assert.ok(config.scopes.length > 0);
			assert.ok(config.clientId.length > 0);
		});

		test("openai config uses device_code flow", () => {
			const config = getOAuthProviderConfig("openai");
			assert.strictEqual(config.provider, "openai");
			assert.strictEqual(config.flowKind, "device_code");
			assert.ok(config.deviceAuthorizationEndpoint!.includes("openai"));
			assert.ok(config.tokenEndpoint.includes("openai"));
			assert.ok(config.scopes.length > 0);
			assert.ok(config.clientId.length > 0);
		});

		test("OAUTH_CAPABLE_PROVIDERS includes anthropic and openai", () => {
			assert.ok(OAUTH_CAPABLE_PROVIDERS.includes("anthropic"));
			assert.ok(OAUTH_CAPABLE_PROVIDERS.includes("openai"));
		});
	});

	// ---------------------------------------------------------------
	// startLogin — pkce_manual (anthropic)
	// ---------------------------------------------------------------
	suite("startLogin — pkce_manual", () => {

		test("returns pkce_manual payload with authUrl", async () => {
			const payload = await oauthService.startLogin("anthropic");

			assert.strictEqual(payload.flow, "pkce_manual");
			assert.ok(payload.sessionId.length > 0);
			assert.strictEqual(payload.expiresIn, 900);
			assert.ok(payload.authUrl!.includes("claude.ai/oauth/authorize"));
			assert.ok(payload.authUrl!.includes("code=true"));
			assert.ok(payload.authUrl!.includes("code_challenge_method=S256"));
			assert.ok(payload.authUrl!.includes("response_type=code"));
			assert.ok(payload.authUrl!.includes("redirect_uri=https%3A%2F%2Fconsole.anthropic.com%2Foauth%2Fcode%2Fcallback"));
			assert.strictEqual(payload.verificationUrl, undefined);
			assert.strictEqual(payload.userCode, undefined);
		});

		test("stores session in secret service", async () => {
			const payload = await oauthService.startLogin("anthropic");
			const sessionJson = await mockSecretService.get(`director-code.oauthSession.${payload.sessionId}`);
			assert.ok(sessionJson);

			const session = JSON.parse(sessionJson!) as IOAuthSession;
			assert.strictEqual(session.provider, "anthropic");
			assert.strictEqual(session.flowKind, "pkce_manual");
			assert.ok(session.codeVerifier!.length > 0);
			assert.ok(session.state!.length > 0);
		});

		test("stores active session reference", async () => {
			const payload = await oauthService.startLogin("anthropic");
			const activeId = await mockSecretService.get("director-code.oauthActiveSession.anthropic");
			assert.strictEqual(activeId, payload.sessionId);
		});

		test("different flows produce different session IDs", async () => {
			const a = await oauthService.startLogin("anthropic");
			// Clean up lock so second startLogin succeeds
			const sessionJson = await mockSecretService.get(`director-code.oauthSession.${a.sessionId}`);
			const session = JSON.parse(sessionJson!) as IOAuthSession;
			const expiredSession = { ...session, expiresAt: Date.now() - 1000 };
			await mockSecretService.set(`director-code.oauthSession.${a.sessionId}`, JSON.stringify(expiredSession));

			const b = await oauthService.startLogin("anthropic");
			assert.notStrictEqual(a.sessionId, b.sessionId);
		});

		test("rejects concurrent login for same provider", async () => {
			await oauthService.startLogin("anthropic");

			try {
				await oauthService.startLogin("anthropic");
				assert.fail("Should have thrown");
			} catch (err: any) {
				assert.ok(err.message.includes("Login already in progress"));
			}
		});

		test("allows concurrent login for different providers", async () => {
			globalThis.fetch = (() => Promise.resolve(jsonResponse(makeDeviceCodeResponse()))) as any;

			const anthropicPayload = await oauthService.startLogin("anthropic");
			const openaiPayload = await oauthService.startLogin("openai");

			assert.strictEqual(anthropicPayload.flow, "pkce_manual");
			assert.strictEqual(openaiPayload.flow, "device_code");
		});
	});

	// ---------------------------------------------------------------
	// startLogin — device_code (openai)
	// ---------------------------------------------------------------
	suite("startLogin — device_code", () => {

		test("returns device_code payload with verification URL and user code", async () => {
			globalThis.fetch = (() => Promise.resolve(jsonResponse(makeDeviceCodeResponse()))) as any;

			const payload = await oauthService.startLogin("openai");

			assert.strictEqual(payload.flow, "device_code");
			assert.ok(payload.sessionId.length > 0);
			assert.strictEqual(payload.expiresIn, 600);
			assert.strictEqual(payload.verificationUrl, "https://auth.openai.com/device?user_code=ABCD-1234");
			assert.strictEqual(payload.userCode, "ABCD-1234");
			assert.strictEqual(payload.authUrl, undefined);
		});

		test("uses verification_uri when verification_uri_complete is absent", async () => {
			globalThis.fetch = (() => Promise.resolve(jsonResponse(
				makeDeviceCodeResponse({ verification_uri_complete: undefined })
			))) as any;

			const payload = await oauthService.startLogin("openai");
			assert.strictEqual(payload.verificationUrl, "https://auth.openai.com/device");
		});

		test("stores device code session", async () => {
			globalThis.fetch = (() => Promise.resolve(jsonResponse(makeDeviceCodeResponse()))) as any;

			const payload = await oauthService.startLogin("openai");
			const sessionJson = await mockSecretService.get(`director-code.oauthSession.${payload.sessionId}`);
			assert.ok(sessionJson);

			const session = JSON.parse(sessionJson!) as IOAuthSession;
			assert.strictEqual(session.provider, "openai");
			assert.strictEqual(session.flowKind, "device_code");
			assert.strictEqual(session.deviceCode, "dc-test-device-code");
			assert.strictEqual(session.interval, 5);
		});

		test("throws on device authorization failure", async () => {
			globalThis.fetch = (() => Promise.resolve(new Response("Error", { status: 500 }))) as any;

			try {
				await oauthService.startLogin("openai");
				assert.fail("Should have thrown");
			} catch (err: any) {
				assert.ok(err.message.includes("Device authorization failed"));
			}
		});
	});

	// ---------------------------------------------------------------
	// submitManualCode
	// ---------------------------------------------------------------
	suite("submitManualCode", () => {

		async function setupPkceSession(): Promise<string> {
			const payload = await oauthService.startLogin("anthropic");
			return payload.sessionId;
		}

		test("exchanges code for tokens successfully", async () => {
			const sessionId = await setupPkceSession();

			globalThis.fetch = (() => Promise.resolve(jsonResponse(makeTokenResponse()))) as any;

			const tokens = await oauthService.submitManualCode("anthropic", sessionId, "auth-code-123");
			assert.strictEqual(tokens.accessToken, "at-test-token");
			assert.strictEqual(tokens.refreshToken, "rt-test-token");
			assert.ok(tokens.expiresAt! > Date.now());
		});

		test("stores tokens with clientId and flowKind", async () => {
			const sessionId = await setupPkceSession();
			globalThis.fetch = (() => Promise.resolve(jsonResponse(makeTokenResponse()))) as any;

			await oauthService.submitManualCode("anthropic", sessionId, "code");

			const storedJson = await mockSecretService.get("director-code.oauth.anthropic");
			assert.ok(storedJson);
			const stored = JSON.parse(storedJson!) as IOAuthStoredTokens;
			assert.strictEqual(stored.clientId, "9d1c250a-e61b-44d9-88ed-5944d1962f5e");
			assert.strictEqual(stored.flowKind, "pkce_manual");
			assert.strictEqual(stored.accessToken, "at-test-token");
		});

		test("exchanges manual code with Anthropic JSON body and callback state", async () => {
			const sessionId = await setupPkceSession();
			let capturedInit: RequestInit | undefined;
			globalThis.fetch = ((_url, init) => {
				capturedInit = init;
				return Promise.resolve(jsonResponse(makeTokenResponse()));
			}) as any;

			await oauthService.submitManualCode("anthropic", sessionId, "auth-code-123#callback-state");

			assert.strictEqual((capturedInit!.headers as Record<string, string>)["Content-Type"], "application/json");
			const body = JSON.parse(capturedInit!.body as string);
			assert.strictEqual(body.grant_type, "authorization_code");
			assert.strictEqual(body.code, "auth-code-123");
			assert.strictEqual(body.state, "callback-state");
			assert.strictEqual(body.client_id, "9d1c250a-e61b-44d9-88ed-5944d1962f5e");
			assert.strictEqual(body.redirect_uri, "https://console.anthropic.com/oauth/code/callback");
			assert.ok(body.code_verifier);
		});

		test("fires onDidChangeAuth after successful exchange", async () => {
			const sessionId = await setupPkceSession();
			globalThis.fetch = (() => Promise.resolve(jsonResponse(makeTokenResponse()))) as any;

			const events: string[] = [];
			disposables.add(oauthService.onDidChangeAuth(p => events.push(p)));

			await oauthService.submitManualCode("anthropic", sessionId, "code");
			assert.ok(events.includes("anthropic"));
		});

		test("cleans up session after exchange", async () => {
			const sessionId = await setupPkceSession();
			globalThis.fetch = (() => Promise.resolve(jsonResponse(makeTokenResponse()))) as any;

			await oauthService.submitManualCode("anthropic", sessionId, "code");

			const remaining = await mockSecretService.get(`director-code.oauthSession.${sessionId}`);
			assert.strictEqual(remaining, undefined);
			const activeId = await mockSecretService.get("director-code.oauthActiveSession.anthropic");
			assert.strictEqual(activeId, undefined);
		});

		test("releases lock after exchange — allows new login", async () => {
			const sessionId = await setupPkceSession();
			globalThis.fetch = (() => Promise.resolve(jsonResponse(makeTokenResponse()))) as any;

			await oauthService.submitManualCode("anthropic", sessionId, "code");

			const newPayload = await oauthService.startLogin("anthropic");
			assert.ok(newPayload.sessionId.length > 0);
		});

		test("throws for unknown session", async () => {
			try {
				await oauthService.submitManualCode("anthropic", "nonexistent", "code");
				assert.fail("Should have thrown");
			} catch (err: any) {
				assert.ok(err.message.includes("No active session"));
			}
		});

		test("throws for provider mismatch", async () => {
			const sessionId = await setupPkceSession();
			try {
				await oauthService.submitManualCode("openai", sessionId, "code");
				assert.fail("Should have thrown");
			} catch (err: any) {
				assert.ok(err.message.includes("belongs to anthropic"));
			}
		});

		test("throws for wrong flow kind", async () => {
			globalThis.fetch = (() => Promise.resolve(jsonResponse(makeDeviceCodeResponse()))) as any;
			const openaiPayload = await oauthService.startLogin("openai");

			try {
				await oauthService.submitManualCode("openai", openaiPayload.sessionId, "code");
				assert.fail("Should have thrown");
			} catch (err: any) {
				assert.ok(err.message.includes("pkce_manual"));
			}
		});

		test("throws for expired session", async () => {
			const sessionId = await setupPkceSession();

			const sessionJson = await mockSecretService.get(`director-code.oauthSession.${sessionId}`);
			const session = JSON.parse(sessionJson!) as IOAuthSession;
			const expiredSession = { ...session, expiresAt: Date.now() - 1000 };
			await mockSecretService.set(`director-code.oauthSession.${sessionId}`, JSON.stringify(expiredSession));

			try {
				await oauthService.submitManualCode("anthropic", sessionId, "code");
				assert.fail("Should have thrown");
			} catch (err: any) {
				assert.ok(err.message.includes("expired"));
			}
		});

		test("throws on token exchange failure", async () => {
			const sessionId = await setupPkceSession();
			globalThis.fetch = (() => Promise.resolve(new Response("Error", { status: 400 }))) as any;

			try {
				await oauthService.submitManualCode("anthropic", sessionId, "bad-code");
				assert.fail("Should have thrown");
			} catch (err: any) {
				assert.ok(err.message.includes("Token exchange failed"));
			}
		});
	});

	// ---------------------------------------------------------------
	// pollLogin
	// ---------------------------------------------------------------
	suite("pollLogin", () => {

		async function setupDeviceSession(): Promise<string> {
			globalThis.fetch = (() => Promise.resolve(jsonResponse(makeDeviceCodeResponse()))) as any;
			const payload = await oauthService.startLogin("openai");
			return payload.sessionId;
		}

		test("returns pending when authorization_pending", async () => {
			const sessionId = await setupDeviceSession();
			globalThis.fetch = (() => Promise.resolve(jsonResponse(
				{ error: 'authorization_pending' }, 400
			))) as any;

			const result = await oauthService.pollLogin("openai", sessionId);
			assert.strictEqual(result.status, "pending");
		});

		test("returns approved with tokens when user authorizes", async () => {
			const sessionId = await setupDeviceSession();
			globalThis.fetch = (() => Promise.resolve(jsonResponse(makeTokenResponse()))) as any;

			const result = await oauthService.pollLogin("openai", sessionId);
			assert.strictEqual(result.status, "approved");
			assert.ok(result.tokens);
			assert.strictEqual(result.tokens!.accessToken, "at-test-token");
		});

		test("stores tokens on approval", async () => {
			const sessionId = await setupDeviceSession();
			globalThis.fetch = (() => Promise.resolve(jsonResponse(makeTokenResponse()))) as any;

			await oauthService.pollLogin("openai", sessionId);

			const stored = await mockSecretService.get("director-code.oauth.openai");
			assert.ok(stored);
			const parsed = JSON.parse(stored!) as IOAuthStoredTokens;
			assert.strictEqual(parsed.accessToken, "at-test-token");
			assert.strictEqual(parsed.clientId, "dc-openai-public-client");
			assert.strictEqual(parsed.flowKind, "device_code");
		});

		test("fires onDidChangeAuth on approval", async () => {
			const sessionId = await setupDeviceSession();
			globalThis.fetch = (() => Promise.resolve(jsonResponse(makeTokenResponse()))) as any;

			const events: string[] = [];
			disposables.add(oauthService.onDidChangeAuth(p => events.push(p)));

			await oauthService.pollLogin("openai", sessionId);
			assert.ok(events.includes("openai"));
		});

		test("cleans up session on approval", async () => {
			const sessionId = await setupDeviceSession();
			globalThis.fetch = (() => Promise.resolve(jsonResponse(makeTokenResponse()))) as any;

			await oauthService.pollLogin("openai", sessionId);

			const remaining = await mockSecretService.get(`director-code.oauthSession.${sessionId}`);
			assert.strictEqual(remaining, undefined);
		});

		test("returns expired for expired session", async () => {
			const sessionId = await setupDeviceSession();

			const sessionJson = await mockSecretService.get(`director-code.oauthSession.${sessionId}`);
			const session = JSON.parse(sessionJson!) as IOAuthSession;
			const expiredSession = { ...session, expiresAt: Date.now() - 1000 };
			await mockSecretService.set(`director-code.oauthSession.${sessionId}`, JSON.stringify(expiredSession));

			const result = await oauthService.pollLogin("openai", sessionId);
			assert.strictEqual(result.status, "expired");
		});

		test("returns expired for expired_token error", async () => {
			const sessionId = await setupDeviceSession();
			globalThis.fetch = (() => Promise.resolve(jsonResponse(
				{ error: 'expired_token' }, 400
			))) as any;

			const result = await oauthService.pollLogin("openai", sessionId);
			assert.strictEqual(result.status, "expired");
		});

		test("handles slow_down by increasing interval", async () => {
			const sessionId = await setupDeviceSession();
			globalThis.fetch = (() => Promise.resolve(jsonResponse(
				{ error: 'slow_down' }, 400
			))) as any;

			const result = await oauthService.pollLogin("openai", sessionId);
			assert.strictEqual(result.status, "pending");

			const sessionJson = await mockSecretService.get(`director-code.oauthSession.${sessionId}`);
			const session = JSON.parse(sessionJson!) as IOAuthSession;
			assert.strictEqual(session.interval, 10);
		});

		test("returns error for unknown session", async () => {
			const result = await oauthService.pollLogin("openai", "nonexistent");
			assert.strictEqual(result.status, "error");
			assert.ok(result.error!.includes("No active session"));
		});

		test("returns error for provider mismatch", async () => {
			const sessionId = await setupDeviceSession();
			const result = await oauthService.pollLogin("anthropic", sessionId);
			assert.strictEqual(result.status, "error");
			assert.ok(result.error!.includes("belongs to openai"));
		});

		test("returns error for wrong flow kind", async () => {
			const anthropicPayload = await oauthService.startLogin("anthropic");
			const result = await oauthService.pollLogin("anthropic", anthropicPayload.sessionId);
			assert.strictEqual(result.status, "error");
			assert.ok(result.error!.includes("device_code"));
		});

		test("returns error on unexpected server error", async () => {
			const sessionId = await setupDeviceSession();
			globalThis.fetch = (() => Promise.resolve(jsonResponse(
				{ error: 'server_error', error_description: 'Internal server error' }, 500
			))) as any;

			const result = await oauthService.pollLogin("openai", sessionId);
			assert.strictEqual(result.status, "error");
			assert.ok(result.error!.includes("Internal server error"));
		});

		test("returns error on network failure", async () => {
			const sessionId = await setupDeviceSession();
			globalThis.fetch = (() => Promise.reject(new Error("Network unreachable"))) as any;

			const result = await oauthService.pollLogin("openai", sessionId);
			assert.strictEqual(result.status, "error");
			assert.ok(result.error!.includes("Network"));
		});
	});

	// ---------------------------------------------------------------
	// getStatus
	// ---------------------------------------------------------------
	suite("getStatus", () => {

		test("returns loggedIn: false when no tokens stored", async () => {
			const status = await oauthService.getStatus("anthropic");
			assert.strictEqual(status.loggedIn, false);
			assert.strictEqual(status.source, "oauth");
			assert.ok(status.sourceLabel.includes("anthropic"));
		});

		test("returns loggedIn: true with valid tokens", async () => {
			const stored: IOAuthStoredTokens = {
				accessToken: "valid-token",
				refreshToken: "rt",
				expiresAt: Date.now() + 3600000,
				clientId: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
				flowKind: "pkce_manual",
			};
			await mockSecretService.set("director-code.oauth.anthropic", JSON.stringify(stored));

			const status = await oauthService.getStatus("anthropic");
			assert.strictEqual(status.loggedIn, true);
			assert.strictEqual(status.flow, "pkce_manual");
			assert.strictEqual(status.hasRefreshToken, true);
			assert.ok(status.expiresAt! > Date.now());
		});

		test("returns loggedIn: false for expired token without refresh", async () => {
			const stored: IOAuthStoredTokens = {
				accessToken: "expired-token",
				expiresAt: Date.now() - 1000,
				clientId: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
				flowKind: "pkce_manual",
			};
			await mockSecretService.set("director-code.oauth.anthropic", JSON.stringify(stored));

			const status = await oauthService.getStatus("anthropic");
			assert.strictEqual(status.loggedIn, false);
			assert.strictEqual(status.flow, "pkce_manual");
		});

		test("returns loggedIn: true for expired token with refresh", async () => {
			const stored: IOAuthStoredTokens = {
				accessToken: "expired-token",
				refreshToken: "rt-can-refresh",
				expiresAt: Date.now() - 1000,
				clientId: "dc-openai-public-client",
				flowKind: "device_code",
			};
			await mockSecretService.set("director-code.oauth.openai", JSON.stringify(stored));

			const status = await oauthService.getStatus("openai");
			assert.strictEqual(status.loggedIn, true);
			assert.strictEqual(status.flow, "device_code");
			assert.strictEqual(status.hasRefreshToken, true);
		});

		test("returns loggedIn: true for token without expiresAt", async () => {
			const stored: IOAuthStoredTokens = {
				accessToken: "no-expiry",
				clientId: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
				flowKind: "pkce_manual",
			};
			await mockSecretService.set("director-code.oauth.anthropic", JSON.stringify(stored));

			const status = await oauthService.getStatus("anthropic");
			assert.strictEqual(status.loggedIn, true);
		});

		test("providers are independent", async () => {
			const stored: IOAuthStoredTokens = {
				accessToken: "token",
				expiresAt: Date.now() + 3600000,
				clientId: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
				flowKind: "pkce_manual",
			};
			await mockSecretService.set("director-code.oauth.anthropic", JSON.stringify(stored));

			const anthropicStatus = await oauthService.getStatus("anthropic");
			const openaiStatus = await oauthService.getStatus("openai");
			assert.strictEqual(anthropicStatus.loggedIn, true);
			assert.strictEqual(openaiStatus.loggedIn, false);
		});

		test("returns undefined for malformed stored data", async () => {
			await mockSecretService.set("director-code.oauth.openai", "not-json");
			const status = await oauthService.getStatus("openai");
			assert.strictEqual(status.loggedIn, false);
		});
	});

	// ---------------------------------------------------------------
	// logout
	// ---------------------------------------------------------------
	suite("logout", () => {

		test("clears stored tokens", async () => {
			const stored: IOAuthStoredTokens = {
				accessToken: "token",
				clientId: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
				flowKind: "pkce_manual",
			};
			await mockSecretService.set("director-code.oauth.anthropic", JSON.stringify(stored));

			await oauthService.logout("anthropic");

			const status = await oauthService.getStatus("anthropic");
			assert.strictEqual(status.loggedIn, false);
		});

		test("cancels active login session", async () => {
			const payload = await oauthService.startLogin("anthropic");

			await oauthService.logout("anthropic");

			const session = await mockSecretService.get(`director-code.oauthSession.${payload.sessionId}`);
			assert.strictEqual(session, undefined);
			const activeId = await mockSecretService.get("director-code.oauthActiveSession.anthropic");
			assert.strictEqual(activeId, undefined);
		});

		test("fires onDidChangeAuth", async () => {
			const events: string[] = [];
			disposables.add(oauthService.onDidChangeAuth(p => events.push(p)));

			await oauthService.logout("anthropic");
			assert.ok(events.includes("anthropic"));
		});

		test("allows new login after logout", async () => {
			await oauthService.startLogin("anthropic");
			await oauthService.logout("anthropic");

			const newPayload = await oauthService.startLogin("anthropic");
			assert.ok(newPayload.sessionId.length > 0);
		});

		test("is safe to call when not authenticated", async () => {
			await oauthService.logout("anthropic");
			const status = await oauthService.getStatus("anthropic");
			assert.strictEqual(status.loggedIn, false);
		});

		test("does not affect other providers", async () => {
			const anthropicStored: IOAuthStoredTokens = {
				accessToken: "a-token",
				clientId: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
				flowKind: "pkce_manual",
			};
			const openaiStored: IOAuthStoredTokens = {
				accessToken: "o-token",
				clientId: "dc-openai-public-client",
				flowKind: "device_code",
			};
			await mockSecretService.set("director-code.oauth.anthropic", JSON.stringify(anthropicStored));
			await mockSecretService.set("director-code.oauth.openai", JSON.stringify(openaiStored));

			await oauthService.logout("anthropic");

			const anthropicStatus = await oauthService.getStatus("anthropic");
			const openaiStatus = await oauthService.getStatus("openai");
			assert.strictEqual(anthropicStatus.loggedIn, false);
			assert.strictEqual(openaiStatus.loggedIn, true);
		});
	});

	// ---------------------------------------------------------------
	// handleCallback (deprecated)
	// ---------------------------------------------------------------
	suite("handleCallback (deprecated)", () => {

		test("throws with deprecation message", async () => {
			try {
				await oauthService.handleCallback("code", "state");
				assert.fail("Should have thrown");
			} catch (err: any) {
				assert.ok(err.message.includes("deprecated"));
				assert.ok(err.message.includes("startLogin"));
			}
		});
	});

	// ---------------------------------------------------------------
	// Session Cleanup
	// ---------------------------------------------------------------
	suite("Session Cleanup", () => {

		test("expired session lock is released on next startLogin", async () => {
			const payload = await oauthService.startLogin("anthropic");

			const sessionJson = await mockSecretService.get(`director-code.oauthSession.${payload.sessionId}`);
			const session = JSON.parse(sessionJson!) as IOAuthSession;
			const expiredSession = { ...session, expiresAt: Date.now() - 1000 };
			await mockSecretService.set(`director-code.oauthSession.${payload.sessionId}`, JSON.stringify(expiredSession));

			const newPayload = await oauthService.startLogin("anthropic");
			assert.ok(newPayload.sessionId.length > 0);
			assert.notStrictEqual(newPayload.sessionId, payload.sessionId);
		});

		test("expired session is cleaned up from secret storage", async () => {
			const payload = await oauthService.startLogin("anthropic");
			const sessionKey = `director-code.oauthSession.${payload.sessionId}`;

			const sessionJson = await mockSecretService.get(sessionKey);
			const session = JSON.parse(sessionJson!) as IOAuthSession;
			const expiredSession = { ...session, expiresAt: Date.now() - 1000 };
			await mockSecretService.set(sessionKey, JSON.stringify(expiredSession));

			await oauthService.startLogin("anthropic");

			const old = await mockSecretService.get(sessionKey);
			assert.strictEqual(old, undefined);
		});
	});

	// ---------------------------------------------------------------
	// End-to-End Flows
	// ---------------------------------------------------------------
	suite("End-to-End Flows", () => {

		test("full pkce_manual flow: startLogin → submitManualCode → getStatus", async () => {
			const payload = await oauthService.startLogin("anthropic");
			assert.strictEqual(payload.flow, "pkce_manual");

			globalThis.fetch = (() => Promise.resolve(jsonResponse(makeTokenResponse()))) as any;

			const tokens = await oauthService.submitManualCode("anthropic", payload.sessionId, "auth-code");
			assert.ok(tokens.accessToken);

			const status = await oauthService.getStatus("anthropic");
			assert.strictEqual(status.loggedIn, true);
			assert.strictEqual(status.flow, "pkce_manual");
		});

		test("full device_code flow: startLogin → poll pending → poll approved → getStatus", async () => {
			globalThis.fetch = (() => Promise.resolve(jsonResponse(makeDeviceCodeResponse()))) as any;
			const payload = await oauthService.startLogin("openai");
			assert.strictEqual(payload.flow, "device_code");

			globalThis.fetch = (() => Promise.resolve(jsonResponse(
				{ error: 'authorization_pending' }, 400
			))) as any;
			const pending = await oauthService.pollLogin("openai", payload.sessionId);
			assert.strictEqual(pending.status, "pending");

			globalThis.fetch = (() => Promise.resolve(jsonResponse(makeTokenResponse()))) as any;
			const approved = await oauthService.pollLogin("openai", payload.sessionId);
			assert.strictEqual(approved.status, "approved");
			assert.ok(approved.tokens!.accessToken);

			const status = await oauthService.getStatus("openai");
			assert.strictEqual(status.loggedIn, true);
			assert.strictEqual(status.flow, "device_code");
		});

		test("login → logout → getStatus returns logged out", async () => {
			const payload = await oauthService.startLogin("anthropic");
			globalThis.fetch = (() => Promise.resolve(jsonResponse(makeTokenResponse()))) as any;
			await oauthService.submitManualCode("anthropic", payload.sessionId, "code");

			const before = await oauthService.getStatus("anthropic");
			assert.strictEqual(before.loggedIn, true);

			await oauthService.logout("anthropic");

			const after = await oauthService.getStatus("anthropic");
			assert.strictEqual(after.loggedIn, false);
		});
	});
});
