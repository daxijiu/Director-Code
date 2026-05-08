import { spawnSync } from 'node:child_process';

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const baseURL = (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

if (!apiKey) {
	console.error('Set GEMINI_API_KEY or GOOGLE_API_KEY to run the D1 Gemini header-auth smoke test.');
	process.exit(2);
}

function describeFetchFailure(error) {
	const cause = error?.cause;
	const details = [
		error?.name ? `${error.name}: ${error.message}` : String(error),
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

async function request(method, url, headers = {}, body) {
	const transport = process.env.GEMINI_SMOKE_TRANSPORT || 'auto';
	if (transport === 'powershell') {
		return requestViaPowerShell(method, url, headers, body);
	}

	try {
		const response = await fetch(url, {
			method,
			headers,
			body,
		});
		const text = await response.text();
		return { response, status: response.status, text };
	} catch (error) {
		if (transport !== 'auto' || process.platform !== 'win32') {
			throw new Error(`Node fetch failed: ${describeFetchFailure(error)}`);
		}

		console.warn(`Node fetch failed (${describeFetchFailure(error)}). Falling back to PowerShell transport...`);
		return requestViaPowerShell(method, url, headers, body);
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
try {
  $resp = Invoke-WebRequest @params
  $out = @{
    ok = $true
    status = [int]$resp.StatusCode
    body = [string]$resp.Content
    contentType = [string]$resp.Headers["Content-Type"]
    cacheControl = [string]$resp.Headers["Cache-Control"]
  }
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
	return {
		status: parsed.status ?? 0,
		text: parsed.body ?? '',
		powershellHeaders: {
			'content-type': parsed.contentType ?? null,
			'cache-control': parsed.cacheControl ?? null,
		},
	};
}

async function call(label, url, init) {
	const result = await request(init.method || 'GET', url, {
		'x-goog-api-key': apiKey,
		...(init.headers || {}),
	}, init.body);
	const body = result.text;
	const headerSample = result.response ? {
		'content-type': result.response.headers.get('content-type'),
		'cache-control': result.response.headers.get('cache-control'),
	} : (result.powershellHeaders || {
		'content-type': null,
		'cache-control': null,
	});
	console.log(`\n${label}`);
	console.log(`HTTP ${result.status}`);
	console.log(JSON.stringify(headerSample));
	console.log(body.slice(0, 200));
	if (result.status < 200 || result.status >= 300) {
		throw new Error(`${label} failed with HTTP ${result.status}`);
	}
}

await call(
	'generateContent header auth',
	`${baseURL}/v1beta/models/${model}:generateContent`,
	{
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			contents: [{ parts: [{ text: 'hi' }] }],
			generationConfig: { maxOutputTokens: 1 },
		}),
	},
);

await call(
	'models.list header auth',
	`${baseURL}/v1beta/models`,
	{ method: 'GET' },
);

console.log('\nD1 Gemini header-auth smoke passed. API key was supplied only via x-goog-api-key header.');
