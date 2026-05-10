# Gemini Header Auth Smoke (D1)

Date: 2026-05-08

Command:

```powershell
node dev/smoke-gemini-header-auth.mjs
```

Environment:

- `GEMINI_API_KEY` was set locally.
- API key was supplied by the smoke script only through the `x-goog-api-key` header.
- Node fetch hit `ECONNRESET` before TLS handshake and automatically fell back to PowerShell transport.

Results:

| Endpoint | Auth placement | HTTP status | Result |
| --- | --- | --- | --- |
| `POST /v1beta/models/gemini-2.5-flash:generateContent` | `x-goog-api-key` header | 200 | Passed |
| `GET /v1beta/models` | `x-goog-api-key` header | 200 | Passed |

Representative output:

```text
generateContent header auth
HTTP 200
{"content-type":"application/json; charset=UTF-8","cache-control":""}

models.list header auth
HTTP 200
{"content-type":"application/json; charset=UTF-8","cache-control":""}

D1 Gemini header-auth smoke passed. API key was supplied only via x-goog-api-key header.
```

Conclusion:

D1's required real-endpoint header-auth compatibility check passed for both Gemini endpoints.
