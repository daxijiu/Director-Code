/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { OAuthLoginController } from '../../../common/agentEngine/oauthLoginController.js';
import {
	type IOAuthLoginPayload,
	type IOAuthPollResult,
	type IOAuthService,
	type IOAuthStatus,
	type IOAuthStoredTokens,
	type IOAuthTokens,
	type OAuthProviderName,
} from '../../../common/agentEngine/oauthService.js';

class MockOAuthService implements IOAuthService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeAuth = new Emitter<OAuthProviderName>();
	readonly onDidChangeAuth: Event<OAuthProviderName> = this._onDidChangeAuth.event;

	status: IOAuthStatus = {
		loggedIn: false,
		source: 'oauth',
		sourceLabel: 'mock OAuth',
	};

	startPayload: IOAuthLoginPayload = {
		flow: 'pkce_manual',
		sessionId: 'session-1',
		expiresIn: 900,
		authUrl: 'https://example.com/auth',
	};

	pollResults: IOAuthPollResult[] = [];

	async startLogin(_provider: OAuthProviderName): Promise<IOAuthLoginPayload> {
		return this.startPayload;
	}

	async submitManualCode(_provider: OAuthProviderName, _sessionId: string, _code: string): Promise<IOAuthTokens> {
		return {
			accessToken: 'access-token',
			refreshToken: 'refresh-token',
			authVariant: 'default',
		};
	}

	async pollLogin(_provider: OAuthProviderName, _sessionId: string): Promise<IOAuthPollResult> {
		return this.pollResults.shift() ?? { status: 'pending' };
	}

	async getStatus(_provider: OAuthProviderName): Promise<IOAuthStatus> {
		return this.status;
	}

	async getTokens(_provider: OAuthProviderName): Promise<IOAuthStoredTokens | undefined> {
		return undefined;
	}

	async logout(provider: OAuthProviderName): Promise<void> {
		this.status = {
			loggedIn: false,
			source: 'oauth',
			sourceLabel: 'mock OAuth',
		};
		this._onDidChangeAuth.fire(provider);
	}

	async handleCallback(_code: string, _state: string): Promise<IOAuthTokens> {
		throw new Error('deprecated');
	}

	dispose(): void {
		this._onDidChangeAuth.dispose();
	}
}

suite('AgentEngine - OAuthLoginController (B1-7)', () => {
	const disposables = new DisposableStore();
	let service: MockOAuthService;

	setup(() => {
		service = new MockOAuthService();
		disposables.add({ dispose: () => service.dispose() });
	});

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('refreshStatus maps logged-out provider to starting phase', async () => {
		const controller = disposables.add(new OAuthLoginController('anthropic', service));

		await controller.refreshStatus();

		assert.strictEqual(controller.state.phase, 'starting');
		assert.strictEqual(controller.state.loggedIn, false);
	});

	test('refreshStatus maps logged-in provider to approved phase', async () => {
		service.status = {
			loggedIn: true,
			source: 'oauth',
			sourceLabel: 'Anthropic OAuth',
			flow: 'pkce_manual',
			authVariant: 'default',
			hasRefreshToken: true,
		};
		const controller = disposables.add(new OAuthLoginController('anthropic', service));

		await controller.refreshStatus();

		assert.strictEqual(controller.state.phase, 'approved');
		assert.strictEqual(controller.state.loggedIn, true);
		assert.strictEqual(controller.state.sourceLabel, 'Anthropic OAuth');
	});

	test('start exposes Anthropic PKCE auth URL and waits for pasted code', async () => {
		const controller = disposables.add(new OAuthLoginController('anthropic', service));

		await controller.start();

		assert.strictEqual(controller.state.phase, 'awaiting_user');
		assert.strictEqual(controller.state.flow, 'pkce_manual');
		assert.strictEqual(controller.state.sessionId, 'session-1');
		assert.strictEqual(controller.state.authUrl, 'https://example.com/auth');
	});

	test('submitManualCode advances Anthropic flow to approved', async () => {
		const controller = disposables.add(new OAuthLoginController('anthropic', service));
		await controller.start();

		await controller.submitManualCode('auth-code#state');

		assert.strictEqual(controller.state.phase, 'approved');
		assert.strictEqual(controller.state.loggedIn, true);
		assert.strictEqual(controller.state.tokens?.accessToken, 'access-token');
	});

	test('start exposes OpenAI Codex device code payload', async () => {
		service.startPayload = {
			flow: 'device_code',
			sessionId: 'openai-session',
			expiresIn: 900,
			verificationUrl: 'https://auth.openai.com/codex/device',
			userCode: 'ABCD-1234',
		};
		const controller = disposables.add(new OAuthLoginController('openai', service, 60_000));

		await controller.start();

		assert.strictEqual(controller.state.phase, 'awaiting_user');
		assert.strictEqual(controller.state.flow, 'device_code');
		assert.strictEqual(controller.state.verificationUrl, 'https://auth.openai.com/codex/device');
		assert.strictEqual(controller.state.userCode, 'ABCD-1234');
	});

	test('pollOnce keeps OpenAI flow awaiting user while pending', async () => {
		service.startPayload = {
			flow: 'device_code',
			sessionId: 'openai-session',
			expiresIn: 900,
			verificationUrl: 'https://auth.openai.com/codex/device',
			userCode: 'ABCD-1234',
		};
		service.pollResults = [{ status: 'pending' }];
		const controller = disposables.add(new OAuthLoginController('openai', service, 60_000));
		await controller.start();

		await controller.pollOnce();

		assert.strictEqual(controller.state.phase, 'awaiting_user');
		assert.strictEqual(controller.state.loggedIn, false);
	});

	test('pollOnce advances OpenAI flow to approved', async () => {
		service.startPayload = {
			flow: 'device_code',
			sessionId: 'openai-session',
			expiresIn: 900,
			verificationUrl: 'https://auth.openai.com/codex/device',
			userCode: 'ABCD-1234',
		};
		service.pollResults = [{
			status: 'approved',
			tokens: {
				accessToken: 'openai-access',
				refreshToken: 'openai-refresh',
				authVariant: 'openai-codex',
			},
		}];
		const controller = disposables.add(new OAuthLoginController('openai', service, 60_000));
		await controller.start();

		await controller.pollOnce();

		assert.strictEqual(controller.state.phase, 'approved');
		assert.strictEqual(controller.state.loggedIn, true);
		assert.strictEqual(controller.state.sourceLabel, 'OpenAI (ChatGPT/Codex OAuth)');
		assert.strictEqual(controller.state.tokens?.authVariant, 'openai-codex');
	});

	test('logout returns controller to starting phase', async () => {
		service.status = {
			loggedIn: true,
			source: 'oauth',
			sourceLabel: 'Anthropic OAuth',
		};
		const controller = disposables.add(new OAuthLoginController('anthropic', service));
		await controller.refreshStatus();

		await controller.logout();

		assert.strictEqual(controller.state.phase, 'starting');
		assert.strictEqual(controller.state.loggedIn, false);
	});
});
