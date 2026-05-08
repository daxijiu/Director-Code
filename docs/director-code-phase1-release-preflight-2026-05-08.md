# Phase 1 Release Preflight

Date: 2026-05-08

Scope: release-gate follow-up for GitHub Pages URLs, clean startup smoke, final test-core equivalent coverage, and PR/release notes.

## Code and Content Updates

- `product.json` now points all Phase 1 release URL fields at the approved GitHub Pages paths:
  - top-level `privacyStatementUrl` -> `https://daxijiu.github.io/Director-Code/privacy/`
  - `defaultChatAgent.termsStatementUrl` -> `https://daxijiu.github.io/Director-Code/terms/`
  - `defaultChatAgent.privacyStatementUrl` -> `https://daxijiu.github.io/Director-Code/privacy/`
  - `defaultChatAgent.publicCodeMatchesUrl` -> `https://daxijiu.github.io/Director-Code/public-code/`
- Added static local Pages content:
  - `docs/terms/index.html`
  - `docs/privacy/index.html`
  - `docs/public-code/index.html`
- Added `.github/workflows/pages.yml` to deploy only the three public Pages directories via GitHub Actions.

## GitHub Pages Probe

Probe command:

```powershell
$urls = @(
  'https://daxijiu.github.io/Director-Code/terms/',
  'https://daxijiu.github.io/Director-Code/privacy/',
  'https://daxijiu.github.io/Director-Code/public-code/'
)
foreach ($url in $urls) { Invoke-WebRequest -Uri $url -UseBasicParsing -MaximumRedirection 5 -TimeoutSec 30 }
```

Current remote result before Pages deployment:

| URL | HTTP status | Result |
| --- | ---: | --- |
| `https://daxijiu.github.io/Director-Code/terms/` | 404 | Blocked until Pages deploys |
| `https://daxijiu.github.io/Director-Code/privacy/` | 404 | Blocked until Pages deploys |
| `https://daxijiu.github.io/Director-Code/public-code/` | 404 | Blocked until Pages deploys |

Conclusion: code-side URL configuration and local page content are ready, but the external release gate remains blocked until GitHub Pages serves these URLs with HTTP 200 and non-empty content.

## Clean Startup Smoke

Artifact checked:

- `VSCode-win32-x64/Director-Code.exe`
- Artifact timestamp: 2026-04-15
- Embedded app commit: `07ff9d6178ede9a1bd12ad3399074d726ebe6e43`

Important limitation: this artifact is stale and does not include the current Phase 1 B/C/D commits or the Pages URL changes from this preflight. A fresh RC build must repeat this smoke before external release.

Clean launch command shape:

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
Start-Process .\VSCode-win32-x64\Director-Code.exe `
  -ArgumentList @(
    '--user-data-dir', $cleanUserData,
    '--extensions-dir', $cleanExtensions,
    '--disable-gpu',
    '--disable-extensions',
    '--skip-welcome',
    '--no-sandbox'
  ) `
  -WindowStyle Hidden `
  -PassThru
```

Result:

| Check | Result |
| --- | --- |
| Clean `--user-data-dir` used | Passed |
| Clean `--extensions-dir` used | Passed |
| `ELECTRON_RUN_AS_NODE` cleared for GUI launch | Passed |
| Process alive after 20s | Passed, 8 `Director-Code` processes observed |
| `clp` cache in clean user-data dir | Not present |
| Log files created | 21 |
| Visual white-screen screenshot | Not captured in hidden launch |

Observed log notes:

- `remoteTunnelService.log`: `spawn ...\bin\director-code-tunnel.exe ENOENT`.
- `main.log`: renderer gone was logged during forced cleanup after the smoke window.

Conclusion: the existing stale artifact can start in a clean isolated environment after clearing `ELECTRON_RUN_AS_NODE`, but final RC acceptance still requires a fresh build and a visual startup check.

## Test-Core Equivalent

Commands and results:

| Command | Result |
| --- | --- |
| `npm run gulp -- transpile-client-esbuild` | Passed, 0 compile errors |
| `npm run test-node -- --runGlob "vs/workbench/contrib/chat/test/common/agentEngine/**/*.test.js"` | Passed, 598 tests |
| `npm run test-browser-no-install -- --browser chromium-msedge --sequential --runGlob "{vs/workbench/contrib/chat/test/browser/agentEngine/apiKeysWidget.test.js,vs/workbench/contrib/chat/test/browser/widget/input/chatModelPicker.test.js,vs/workbench/contrib/terminalContrib/chatAgentTools/test/browser/outputMonitor.test.js}"` | Passed, 72 tests |
| `node --check dev/smoke-gemini-header-auth.mjs; node --check dev/smoke-anthropic-oauth.mjs; node --check dev/smoke-openai-codex-oauth.mjs` | Passed |
| product/page local assertion script | Passed |

Browser-test note: `npx playwright install chromium` failed with TLS `ECONNRESET`, so the browser test was rerun successfully through the installed Edge channel (`chromium-msedge`).

## Manual Smoke Records

- Anthropic OAuth: token exchange succeeded. Messages API was reached with the OAuth token and returned structured HTTP 429, proving auth reached the API.
- OpenAI OAuth/Codex: token exchange succeeded. `chatgpt.com/backend-api/codex/models` returned HTTP 200. Codex Responses endpoint returned non-auth HTTP 400. `api.openai.com` returned HTTP 429. Verdict remains to keep OpenAI OAuth on the independent `openai-codex` transport path.
- Gemini D1: `generateContent` and `models.list` both returned HTTP 200 with the API key supplied only via `x-goog-api-key`.

Detailed Gemini evidence is recorded in `docs/director-code-gemini-header-auth-smoke-D1.md`.

## Release Notes Draft

Phase 1 B/C/D closure now includes:

- Unified auth state and OpenAI Codex transport wiring.
- Model resolver cache isolation by provider/base/auth identity/auth variant.
- Rich chat history replay preservation.
- Provider protocol hardening for OpenAI, Anthropic, Gemini, and compatible APIs.
- Settings auth state integration and key input hardening.
- Resource lifecycle cleanup and shared fetch helper coverage.
- Gemini header-auth default path with query-key fallback setting.
- Settings editor lifecycle audit record.
- Product URL release configuration and GitHub Pages content/workflow scaffolding.

## Remaining External-Release Blockers

1. Rotate the exposed Gemini key outside the repository.
2. Let the GitHub Pages workflow deploy, or enable Pages for the repository if GitHub reports it is not configured.
3. Re-probe all four product URL fields after deployment and confirm HTTP 200 plus non-empty, non-404 content.
4. Produce a fresh RC build from the current commit and rerun clean startup with visual no-white-screen verification.
5. Review the first public Terms, Privacy, and Public Code pages before announcing an external release.
