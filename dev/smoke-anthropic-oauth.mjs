#!/usr/bin/env node
/*
 * Manual Anthropic OAuth smoke harness for Director-Code B1-4.
 *
 * Usage:
 *   node dev/smoke-anthropic-oauth.mjs
 *
 * Optional:
 *   ANTHROPIC_OAUTH_CODE="<code>#<state>" node dev/smoke-anthropic-oauth.mjs
 *   ANTHROPIC_SMOKE_MODEL="claude-sonnet-4-6" node dev/smoke-anthropic-oauth.mjs
 *   ANTHROPIC_SKIP_MESSAGE=1 node dev/smoke-anthropic-oauth.mjs
 *
 * The script does not persist tokens and only prints redacted token metadata.
 */

import { createHash, randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const AUTHORIZE_URL = 'https://claude.ai/oauth/authorize';
const TOKEN_URL = 'https://console.anthropic.com/v1/oauth/token';
const REDIRECT_URI = 'https://console.anthropic.com/oauth/code/callback';
const SCOPES = ['org:create_api_key', 'user:profile', 'user:inference'];
const USER_AGENT = 'claude-cli/2.1.74 (external, cli)';
const DEFAULT_MODEL = 'claude-sonnet-4-6';

function base64Url(buffer) {
	return Buffer.from(buffer)
		.toString('base64')
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}

function makeVerifier() {
	return base64Url(randomBytes(32));
}

function makeChallenge(verifier) {
	return base64Url(createHash('sha256').update(verifier).digest());
}

function parseCallbackCode(raw) {
	const [code, state] = raw.trim().split('#', 2);
	return { code: code?.trim() ?? '', state: state?.trim() };
}

function redact(value) {
	if (!value) {
		return '<missing>';
	}
	if (value.length <= 12) {
		return `${value.slice(0, 3)}...`;
	}
	return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

async function readAuthorizationCode() {
	if (process.env.ANTHROPIC_OAUTH_CODE) {
		return process.env.ANTHROPIC_OAUTH_CODE;
	}
	const rl = createInterface({ input, output });
	try {
		return await rl.question('Paste authorization code shown by Anthropic: ');
	} finally {
		rl.close();
	}
}

async function exchangeCode({ code, state, verifier }) {
	const response = await fetch(TOKEN_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'User-Agent': USER_AGENT,
		},
		body: JSON.stringify({
			grant_type: 'authorization_code',
			client_id: CLIENT_ID,
			code,
			state: state || verifier,
			redirect_uri: REDIRECT_URI,
			code_verifier: verifier,
		}),
	});

	const text = await response.text();
	let data;
	try {
		data = JSON.parse(text);
	} catch {
		data = { raw: text };
	}

	if (!response.ok) {
		throw new Error(`Token exchange failed: HTTP ${response.status} ${JSON.stringify(data).slice(0, 500)}`);
	}
	if (!data.access_token) {
		throw new Error(`Token exchange response did not include access_token: ${JSON.stringify(data).slice(0, 500)}`);
	}
	return data;
}

async function smokeMessage(accessToken) {
	const model = process.env.ANTHROPIC_SMOKE_MODEL || DEFAULT_MODEL;
	const response = await fetch('https://api.anthropic.com/v1/messages', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'anthropic-version': '2023-06-01',
			'anthropic-beta': [
				'interleaved-thinking-2025-05-14',
				'fine-grained-tool-streaming-2025-05-14',
				'claude-code-20250219',
				'oauth-2025-04-20',
			].join(','),
			'Authorization': `Bearer ${accessToken}`,
			'user-agent': USER_AGENT,
			'x-app': 'cli',
		},
		body: JSON.stringify({
			model,
			max_tokens: 16,
			messages: [{ role: 'user', content: 'Reply with OK.' }],
		}),
	});

	const text = await response.text();
	let data;
	try {
		data = JSON.parse(text);
	} catch {
		data = { raw: text };
	}

	console.log(`Messages smoke HTTP status: ${response.status}`);
	console.log(JSON.stringify(data, null, 2).slice(0, 1000));

	if (response.status === 401) {
		throw new Error('Messages smoke returned 401; OAuth token is not accepted by Anthropic Messages API.');
	}
	if (!response.ok) {
		console.warn('Messages smoke returned a structured non-2xx response. This still proves token auth reached the API; inspect the response above.');
	}
}

async function main() {
	const verifier = makeVerifier();
	const challenge = makeChallenge(verifier);
	const authUrl = new URL(AUTHORIZE_URL);
	authUrl.searchParams.set('code', 'true');
	authUrl.searchParams.set('client_id', CLIENT_ID);
	authUrl.searchParams.set('response_type', 'code');
	authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
	authUrl.searchParams.set('scope', SCOPES.join(' '));
	authUrl.searchParams.set('code_challenge', challenge);
	authUrl.searchParams.set('code_challenge_method', 'S256');
	authUrl.searchParams.set('state', verifier);

	console.log('\nOpen this URL in your browser, authorize, then paste the displayed code.\n');
	console.log(authUrl.toString());
	console.log('');

	const rawCode = await readAuthorizationCode();
	const parsed = parseCallbackCode(rawCode);
	if (!parsed.code) {
		throw new Error('No authorization code provided.');
	}

	const tokens = await exchangeCode({ ...parsed, verifier });
	console.log('\nToken exchange succeeded.');
	console.log(`access_token: ${redact(tokens.access_token)}`);
	console.log(`refresh_token: ${redact(tokens.refresh_token)}`);
	console.log(`expires_in: ${tokens.expires_in ?? '<missing>'}`);
	console.log(`scope: ${tokens.scope ?? '<missing>'}`);

	if (process.env.ANTHROPIC_SKIP_MESSAGE === '1') {
		console.log('\nSkipping Messages API smoke because ANTHROPIC_SKIP_MESSAGE=1.');
		return;
	}

	console.log('\nCalling Anthropic Messages API with the OAuth access token...');
	await smokeMessage(tokens.access_token);
}

main().catch(err => {
	console.error(`\nSmoke failed: ${err?.message ?? err}`);
	process.exitCode = 1;
});
