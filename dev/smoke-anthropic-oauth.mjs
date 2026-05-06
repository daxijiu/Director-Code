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
 *   ANTHROPIC_SMOKE_TRANSPORT=powershell node dev/smoke-anthropic-oauth.mjs
 *   ANTHROPIC_SKIP_MESSAGE=1 node dev/smoke-anthropic-oauth.mjs
 *
 * The script does not persist tokens and only prints redacted token metadata.
 * On Windows it automatically falls back to PowerShell transport if Node fetch
 * is blocked before TLS connection setup.
 */

import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
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

function describeFetchFailure(error) {
	const cause = error?.cause;
	const details = [
		`${error?.name ?? 'Error'}: ${error?.message ?? String(error)}`,
		cause?.code ? `cause.code=${cause.code}` : undefined,
		cause?.host ? `cause.host=${cause.host}` : undefined,
		cause?.port ? `cause.port=${cause.port}` : undefined,
		cause?.message ? `cause.message=${cause.message}` : undefined,
	].filter(Boolean);
	return details.join('; ');
}

function parseMaybeJson(text) {
	try {
		return JSON.parse(text);
	} catch {
		return { raw: text };
	}
}

async function postJson(url, body, headers = {}) {
	const transport = process.env.ANTHROPIC_SMOKE_TRANSPORT || 'auto';
	if (transport === 'powershell') {
		return postJsonViaPowerShell(url, body, headers);
	}

	try {
		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				...headers,
			},
			body: JSON.stringify(body),
		});
		const text = await response.text();
		return { status: response.status, data: parseMaybeJson(text), text };
	} catch (error) {
		if (transport !== 'auto' || process.platform !== 'win32') {
			throw new Error(`Node fetch failed: ${describeFetchFailure(error)}`);
		}

		console.warn(`Node fetch failed (${describeFetchFailure(error)}). Falling back to PowerShell transport...`);
		return postJsonViaPowerShell(url, body, headers);
	}
}

function postJsonViaPowerShell(url, body, headers = {}) {
	const psScript = `
$ErrorActionPreference = "Stop"
$raw = [Console]::In.ReadToEnd()
$payload = $raw | ConvertFrom-Json
$headers = @{}
if ($payload.headers) {
  foreach ($p in $payload.headers.PSObject.Properties) {
    $headers[$p.Name] = [string]$p.Value
  }
}
$contentType = "application/json"
if ($headers.ContainsKey("Content-Type")) {
  $contentType = $headers["Content-Type"]
  $headers.Remove("Content-Type")
}
$userAgent = $null
if ($headers.ContainsKey("User-Agent")) {
  $userAgent = $headers["User-Agent"]
  $headers.Remove("User-Agent")
}
$params = @{
  Uri = [string]$payload.url
  Method = [string]$payload.method
  Headers = $headers
  Body = [string]$payload.body
  TimeoutSec = 30
  ContentType = $contentType
}
if ($userAgent) {
  $params.UserAgent = $userAgent
}
try {
  $resp = Invoke-WebRequest @params
  $out = @{ ok = $true; status = [int]$resp.StatusCode; body = [string]$resp.Content }
} catch {
  $status = 0
  $responseBody = [string]$_.Exception.Message
  if ($_.Exception.Response) {
    try { $status = [int]$_.Exception.Response.StatusCode } catch {}
    try {
      $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
      $responseBody = $reader.ReadToEnd()
      $reader.Dispose()
    } catch {}
  }
  $out = @{ ok = $true; status = $status; body = $responseBody; error = [string]$_.Exception.Message }
}
$out | ConvertTo-Json -Compress -Depth 4
`;

	const payload = JSON.stringify({
		url,
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			...headers,
		},
		body: JSON.stringify(body),
	});
	const result = spawnSync('powershell.exe', [
		'-NoProfile',
		'-NonInteractive',
		'-ExecutionPolicy',
		'Bypass',
		'-Command',
		psScript,
	], {
		input: payload,
		encoding: 'utf8',
		maxBuffer: 1024 * 1024,
	});

	if (result.error) {
		throw new Error(`PowerShell transport failed to start: ${result.error.message}`);
	}
	if (result.status !== 0) {
		throw new Error(`PowerShell transport failed: ${result.stderr || result.stdout}`);
	}

	const parsed = parseMaybeJson(result.stdout.trim());
	const text = parsed.body ?? '';
	return {
		status: parsed.status ?? 0,
		data: parseMaybeJson(text),
		text,
	};
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
	const result = await postJson(TOKEN_URL, {
		grant_type: 'authorization_code',
		client_id: CLIENT_ID,
		code,
		state: state || verifier,
		redirect_uri: REDIRECT_URI,
		code_verifier: verifier,
	}, {
			'User-Agent': USER_AGENT,
	});

	if (result.status < 200 || result.status >= 300) {
		throw new Error(`Token exchange failed: HTTP ${result.status} ${JSON.stringify(result.data).slice(0, 500)}`);
	}
	if (!result.data.access_token) {
		throw new Error(`Token exchange response did not include access_token: ${JSON.stringify(result.data).slice(0, 500)}`);
	}
	return result.data;
}

async function smokeMessage(accessToken) {
	const model = process.env.ANTHROPIC_SMOKE_MODEL || DEFAULT_MODEL;
	const result = await postJson('https://api.anthropic.com/v1/messages', {
		model,
		max_tokens: 16,
		messages: [{ role: 'user', content: 'Reply with OK.' }],
	}, {
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
	});

	console.log(`Messages smoke HTTP status: ${result.status}`);
	console.log(JSON.stringify(result.data, null, 2).slice(0, 1000));

	if (result.status === 401) {
		throw new Error('Messages smoke returned 401; OAuth token is not accepted by Anthropic Messages API.');
	}
	if (result.status < 200 || result.status >= 300) {
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
