#!/usr/bin/env node
/*
 * Manual OpenAI Codex OAuth transport spike harness for Director-Code B1-5.
 *
 * Usage:
 *   node dev/smoke-openai-codex-oauth.mjs
 *
 * Optional:
 *   OPENAI_CODEX_ACCESS_TOKEN="<token>" node dev/smoke-openai-codex-oauth.mjs
 *   OPENAI_CODEX_SMOKE_TRANSPORT=powershell node dev/smoke-openai-codex-oauth.mjs
 *   OPENAI_CODEX_MODEL="gpt-5.2-codex" node dev/smoke-openai-codex-oauth.mjs
 *   OPENAI_CODEX_API_MODEL="gpt-4o-mini" node dev/smoke-openai-codex-oauth.mjs
 *   OPENAI_CODEX_SKIP_API_OPENAI=1 node dev/smoke-openai-codex-oauth.mjs
 *   OPENAI_CODEX_SKIP_CODEX_MODELS=1 node dev/smoke-openai-codex-oauth.mjs
 *   OPENAI_CODEX_SKIP_CODEX_RESPONSES=1 node dev/smoke-openai-codex-oauth.mjs
 *
 * This uses the Hermes-observed Codex deviceauth flow. It is not the standard
 * OAuth device-code grant. The script does not persist tokens and only prints
 * redacted token metadata.
 */

import { spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const ISSUER = 'https://auth.openai.com';
const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const DEVICE_USER_CODE_URL = `${ISSUER}/api/accounts/deviceauth/usercode`;
const DEVICE_TOKEN_URL = `${ISSUER}/api/accounts/deviceauth/token`;
const TOKEN_URL = `${ISSUER}/oauth/token`;
const DEVICE_REDIRECT_URI = `${ISSUER}/deviceauth/callback`;
const VERIFICATION_URL = `${ISSUER}/codex/device`;
const API_OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';
const CODEX_MODELS_URL = 'https://chatgpt.com/backend-api/codex/models?client_version=1.0.0';
const CODEX_RESPONSES_URL = 'https://chatgpt.com/backend-api/codex/responses';
const DEFAULT_CODEX_MODEL = 'gpt-5.2-codex';
const DEFAULT_API_MODEL = 'gpt-4o-mini';
const DEFAULT_POLL_TIMEOUT_SECONDS = 15 * 60;
const DEFAULT_REQUEST_TIMEOUT_SECONDS = 60;

function redact(value) {
	if (!value) {
		return '<missing>';
	}
	if (value.length <= 12) {
		return `${value.slice(0, 3)}...`;
	}
	return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function parseMaybeJson(text) {
	try {
		return JSON.parse(text);
	} catch {
		return { raw: text };
	}
}

function previewData(data, limit = 1500) {
	const text = data && typeof data.raw === 'string'
		? data.raw
		: JSON.stringify(data, null, 2);
	return (text || '').slice(0, limit);
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

function decodeBase64Url(value) {
	const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
	const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
	return Buffer.from(padded, 'base64').toString('utf8');
}

function decodeJwtPayload(token) {
	const parts = token.split('.');
	if (parts.length !== 3) {
		return undefined;
	}
	try {
		return JSON.parse(decodeBase64Url(parts[1]));
	} catch {
		return undefined;
	}
}

function extractAccountId(token) {
	const payload = decodeJwtPayload(token);
	const authClaim = payload?.['https://api.openai.com/auth'];
	return typeof authClaim?.chatgpt_account_id === 'string'
		? authClaim.chatgpt_account_id
		: undefined;
}

async function request(method, url, { headers = {}, body } = {}) {
	const transport = process.env.OPENAI_CODEX_SMOKE_TRANSPORT || 'auto';
	if (transport === 'powershell') {
		return requestViaPowerShell(method, url, headers, body);
	}

	const controller = new AbortController();
	const timeoutSeconds = Number(process.env.OPENAI_CODEX_REQUEST_TIMEOUT_SECONDS || DEFAULT_REQUEST_TIMEOUT_SECONDS);
	const timeout = setTimeout(() => controller.abort(), Math.max(1, timeoutSeconds) * 1000);

	try {
		const response = await fetch(url, {
			method,
			headers,
			body,
			signal: controller.signal,
		});
		const text = await response.text();
		return { status: response.status, data: parseMaybeJson(text), text };
	} catch (error) {
		if (transport !== 'auto' || process.platform !== 'win32') {
			throw new Error(`Node fetch failed: ${describeFetchFailure(error)}`);
		}

		console.warn(`Node fetch failed (${describeFetchFailure(error)}). Falling back to PowerShell transport...`);
		return requestViaPowerShell(method, url, headers, body);
	} finally {
		clearTimeout(timeout);
	}
}

function requestViaPowerShell(method, url, headers = {}, body) {
	const psScript = `
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$raw = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:DIRECTOR_CODE_SMOKE_PAYLOAD))
$payload = $raw | ConvertFrom-Json
$headers = @{}
if ($payload.headers) {
  foreach ($p in $payload.headers.PSObject.Properties) {
    $headers[$p.Name] = [string]$p.Value
  }
}
$contentType = $null
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
  TimeoutSec = 60
  UseBasicParsing = $true
}
if ($null -ne $payload.body) {
  $params.Body = [string]$payload.body
}
if ($contentType) {
  $params.ContentType = $contentType
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
$out | ConvertTo-Json -Compress -Depth 5
`;

	const payload = JSON.stringify({ method, url, headers, body });
	const result = spawnSync('powershell.exe', [
		'-NoProfile',
		'-NonInteractive',
		'-ExecutionPolicy',
		'Bypass',
		'-Command',
		psScript,
	], {
		env: {
			...process.env,
			DIRECTOR_CODE_SMOKE_PAYLOAD: Buffer.from(payload, 'utf8').toString('base64'),
		},
		encoding: 'utf8',
		maxBuffer: 1024 * 1024 * 5,
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

async function postJson(url, body, headers = {}) {
	return request('POST', url, {
		headers: {
			'Content-Type': 'application/json',
			...headers,
		},
		body: JSON.stringify(body),
	});
}

async function postForm(url, form, headers = {}) {
	return request('POST', url, {
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			...headers,
		},
		body: form.toString(),
	});
}

async function getJson(url, headers = {}) {
	return request('GET', url, { headers });
}

async function requestDeviceCode() {
	const result = await postJson(DEVICE_USER_CODE_URL, { client_id: CLIENT_ID });
	if (result.status < 200 || result.status >= 300) {
		throw new Error(`Device code request failed: HTTP ${result.status} ${previewData(result.data, 500)}`);
	}

	const userCode = result.data?.user_code;
	const deviceAuthId = result.data?.device_auth_id;
	const interval = Math.max(3, Number(result.data?.interval || 5));
	if (!userCode || !deviceAuthId) {
		throw new Error(`Device code response missing user_code/device_auth_id: ${previewData(result.data, 500)}`);
	}

	return { userCode, deviceAuthId, interval };
}

async function pollDeviceAuth({ userCode, deviceAuthId, interval }) {
	const timeoutSeconds = Number(process.env.OPENAI_CODEX_POLL_TIMEOUT_SECONDS || DEFAULT_POLL_TIMEOUT_SECONDS);
	const deadline = Date.now() + Math.max(30, timeoutSeconds) * 1000;
	let attempts = 0;

	while (Date.now() < deadline) {
		await sleep(interval * 1000);
		attempts += 1;
		process.stdout.write(attempts % 12 === 0 ? '.\n' : '.');

		const result = await postJson(DEVICE_TOKEN_URL, {
			device_auth_id: deviceAuthId,
			user_code: userCode,
		});

		if (result.status === 200) {
			process.stdout.write('\n');
			const authorizationCode = result.data?.authorization_code;
			const codeVerifier = result.data?.code_verifier;
			if (!authorizationCode || !codeVerifier) {
				throw new Error(`Device auth response missing authorization_code/code_verifier: ${previewData(result.data, 500)}`);
			}
			return { authorizationCode, codeVerifier };
		}

		if (result.status === 403 || result.status === 404) {
			continue;
		}

		throw new Error(`Device auth polling failed: HTTP ${result.status} ${previewData(result.data, 500)}`);
	}

	throw new Error(`Device auth timed out after ${timeoutSeconds} seconds.`);
}

async function exchangeAuthorizationCode({ authorizationCode, codeVerifier }) {
	const form = new URLSearchParams({
		grant_type: 'authorization_code',
		code: authorizationCode,
		redirect_uri: DEVICE_REDIRECT_URI,
		client_id: CLIENT_ID,
		code_verifier: codeVerifier,
	});

	const result = await postForm(TOKEN_URL, form);
	if (result.status < 200 || result.status >= 300) {
		throw new Error(`Token exchange failed: HTTP ${result.status} ${previewData(result.data, 500)}`);
	}
	if (!result.data?.access_token) {
		throw new Error(`Token exchange response did not include access_token: ${previewData(result.data, 500)}`);
	}

	return result.data;
}

async function loginWithDeviceAuth() {
	const device = await requestDeviceCode();

	console.log('\nOpen this URL in your browser, sign in, then enter the code.\n');
	console.log(VERIFICATION_URL);
	console.log(`\nUser code: ${device.userCode}`);
	console.log('\nWaiting for sign-in approval...');

	const code = await pollDeviceAuth(device);
	return exchangeAuthorizationCode(code);
}

function printTokenMetadata(tokens, accessToken) {
	const accountId = extractAccountId(accessToken);
	console.log('\nToken exchange succeeded.');
	console.log(`access_token: ${redact(accessToken)}`);
	console.log(`refresh_token: ${redact(tokens?.refresh_token)}`);
	console.log(`expires_in: ${tokens?.expires_in ?? '<missing>'}`);
	console.log(`scope: ${tokens?.scope ?? '<missing>'}`);
	console.log(`chatgpt_account_id: ${accountId ? redact(accountId) : '<not found in JWT>'}`);
	return accountId;
}

async function smokeApiOpenAI(accessToken) {
	if (process.env.OPENAI_CODEX_SKIP_API_OPENAI === '1') {
		console.log('\nSkipping api.openai.com smoke because OPENAI_CODEX_SKIP_API_OPENAI=1.');
		return undefined;
	}

	const model = process.env.OPENAI_CODEX_API_MODEL || DEFAULT_API_MODEL;
	console.log(`\nCalling current OpenAI provider endpoint (${API_OPENAI_CHAT_COMPLETIONS_URL}) with model ${model}...`);
	const result = await postJson(API_OPENAI_CHAT_COMPLETIONS_URL, {
		model,
		max_tokens: 8,
		messages: [{ role: 'user', content: 'Reply with OK.' }],
	}, {
		Authorization: `Bearer ${accessToken}`,
	});

	console.log(`api.openai.com chat/completions HTTP status: ${result.status}`);
	console.log(previewData(result.data));
	return result;
}

async function smokeCodexModels(accessToken) {
	if (process.env.OPENAI_CODEX_SKIP_CODEX_MODELS === '1') {
		console.log('\nSkipping Codex models smoke because OPENAI_CODEX_SKIP_CODEX_MODELS=1.');
		return undefined;
	}

	console.log(`\nCalling Codex models endpoint (${CODEX_MODELS_URL})...`);
	const result = await getJson(CODEX_MODELS_URL, {
		Authorization: `Bearer ${accessToken}`,
	});

	console.log(`Codex models HTTP status: ${result.status}`);
	console.log(previewData(result.data));
	return result;
}

async function smokeCodexResponses(accessToken, accountId) {
	if (process.env.OPENAI_CODEX_SKIP_CODEX_RESPONSES === '1') {
		console.log('\nSkipping Codex responses smoke because OPENAI_CODEX_SKIP_CODEX_RESPONSES=1.');
		return undefined;
	}

	const model = process.env.OPENAI_CODEX_MODEL || DEFAULT_CODEX_MODEL;
	const headers = {
		Accept: 'text/event-stream',
		Authorization: `Bearer ${accessToken}`,
		'OpenAI-Beta': 'responses=experimental',
		originator: process.env.OPENAI_CODEX_ORIGINATOR || 'director-code',
	};
	if (accountId) {
		headers['chatgpt-account-id'] = accountId;
	}

	console.log(`\nCalling Codex Responses endpoint (${CODEX_RESPONSES_URL}) with model ${model}...`);
	const result = await postJson(CODEX_RESPONSES_URL, {
		model,
		store: false,
		stream: true,
		instructions: 'Reply with OK.',
		input: [{ role: 'user', content: 'Reply with OK.' }],
		tool_choice: 'auto',
		parallel_tool_calls: true,
	}, headers);

	console.log(`Codex responses HTTP status: ${result.status}`);
	console.log(previewData(result.data));
	return result;
}

function isAuthRejected(result) {
	return result?.status === 401 || result?.status === 403;
}

function reachedEndpoint(result) {
	return Boolean(result && result.status > 0 && !isAuthRejected(result));
}

function printVerdict({ apiOpenAI, codexModels, codexResponses }) {
	const codexReached = reachedEndpoint(codexResponses) || reachedEndpoint(codexModels);

	console.log('\nTransport verdict:');
	if (isAuthRejected(apiOpenAI) && codexReached) {
		console.log('- Current openaiProvider target rejected the Codex OAuth token.');
		console.log('- Codex backend returned a non-auth response. Freeze OpenAI OAuth as authVariant=openai-codex and target chatgpt.com/backend-api/codex.');
		return true;
	}
	if (apiOpenAI && apiOpenAI.status >= 200 && apiOpenAI.status < 300) {
		console.log('- api.openai.com accepted the OAuth token. Inspect this before deciding whether a separate transport is still required.');
		return codexReached;
	}
	if (codexReached) {
		console.log(`- Codex backend returned a non-auth response, while api.openai.com status was ${apiOpenAI?.status ?? 'skipped'}.`);
		console.log('- Default next step: keep OpenAI OAuth on the independent openai-codex transport path.');
		return true;
	}

	console.log('- Codex backend was not proven reachable with this token in this run.');
	console.log('- Do not connect OpenAI OAuth UI until B1-5 has a clear endpoint/authVariant result.');
	return false;
}

async function main() {
	const envToken = process.env.OPENAI_CODEX_ACCESS_TOKEN?.trim();
	const tokens = envToken
		? { access_token: envToken }
		: await loginWithDeviceAuth();

	const accessToken = tokens.access_token;
	const accountId = printTokenMetadata(tokens, accessToken);

	const apiOpenAI = await smokeApiOpenAI(accessToken);
	const codexModels = await smokeCodexModels(accessToken);
	const codexResponses = await smokeCodexResponses(accessToken, accountId);
	const ok = printVerdict({ apiOpenAI, codexModels, codexResponses });

	if (!ok) {
		process.exitCode = 1;
	}
}

main().catch(err => {
	console.error(`\nSmoke failed: ${err?.message ?? err}`);
	process.exitCode = 1;
});
