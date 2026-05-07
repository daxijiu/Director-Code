const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const baseURL = (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

if (!apiKey) {
	console.error('Set GEMINI_API_KEY or GOOGLE_API_KEY to run the D1 Gemini header-auth smoke test.');
	process.exit(2);
}

async function call(label, url, init) {
	const response = await fetch(url, {
		...init,
		headers: {
			'x-goog-api-key': apiKey,
			...(init.headers || {}),
		},
	});
	const body = await response.text();
	const headerSample = {
		'content-type': response.headers.get('content-type'),
		'cache-control': response.headers.get('cache-control'),
	};
	console.log(`\n${label}`);
	console.log(`HTTP ${response.status}`);
	console.log(JSON.stringify(headerSample));
	console.log(body.slice(0, 200));
	if (!response.ok) {
		throw new Error(`${label} failed with HTTP ${response.status}`);
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
