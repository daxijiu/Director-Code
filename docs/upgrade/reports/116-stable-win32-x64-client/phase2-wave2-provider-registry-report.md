# Phase 2 Wave 2 Provider Registry Report

Date: 2026-05-16

## Final Implementation

- Added a Director-owned provider registry persisted as profile data in `directorCodeProviders.json`.
- Registry is now the source of truth for provider instances, model lists, default provider/model, auth kind, auth variant, base URL, and API key source.
- Legacy `directorCode.ai.provider`, `directorCode.ai.model`, `directorCode.ai.baseURL`, and `directorCode.ai.authVariant` are read only for first-run migration into the registry.
- The VS Code `chatLanguageModels.json` provider-group layer is now treated as a projection. Director syncs enabled provider instances into `ILanguageModelsProviderGroup` entries with `directorProviderInstanceId`.
- Director model identifiers now use `director-code/<providerInstanceId>/<modelId>` so multiple instances of the same provider can coexist.
- The Director Agent and Director `ILanguageModelChatProvider` now resolve credentials and models through provider instances.
- Provider Manager in Director Code Settings now manages provider instances directly, including manual model lists, default model selection, SecretStorage keys, and environment-variable API key references.
- VS Code Models Management now bypasses Copilot entitlement gating for the Director vendor and routes Manage/Add actions to Director Provider Manager.

## Provider Scope

- Native API-key providers: Anthropic, OpenAI, Gemini.
- OAuth providers in v1: OpenAI and Anthropic, one account per provider kind.
- Compatible providers: OpenAI-compatible and Anthropic-compatible, with multiple user-created provider instances and manual model lists.
- OpenAI-compatible discovery remains best effort through the existing model resolver; manual model entry is the supported baseline.

## Manual Test Coverage Deferred To User

The following require real API keys or OAuth accounts and are prepared as post-package manual smoke steps:

- OpenAI API key provider instance.
- OpenAI OAuth/Codex provider instance.
- Anthropic API key provider instance.
- OpenAI-compatible provider instance with custom base URL and manual models.
- Environment-variable API key source.

Use `scripts/smoke/director-provider-oauth-smoke.ps1` after the packaged build is installed or launched.

## Automated Validation

- Clean replay materialize with `bash scripts/upgrade/materialize-vscode.sh --profile docs/upgrade/profiles/116-stable-win32-x64-client.json --target vscode.generated --up-to-layer director --force`
- `node scripts/upgrade/canonical-manifest.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json --write`
- `node scripts/upgrade/canonical-manifest.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
- `node scripts/upgrade/validate-series.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
- `node scripts/upgrade/validate-product-overrides.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
- `node scripts/upgrade/expected-contracts.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
- `npm run compile-check-ts-native`
- `npm run transpile-client`
- `node test/unit/node/index.js --run src/vs/workbench/contrib/chat/test/common/agentEngine/providerRegistry.test.ts`
- `node test/unit/node/index.js --run src/vs/workbench/contrib/chat/test/common/agentEngine/directorCodeModelProvider.test.ts`
- `node test/unit/node/index.js --run src/vs/workbench/contrib/chat/test/common/agentEngine/authStateService.test.ts`
- `node test/unit/node/index.js --run src/vs/workbench/contrib/chat/test/common/agentEngine/apiKeysWidget.test.ts`
- `node test/unit/browser/index.js --run src/vs/workbench/contrib/chat/test/browser/agentEngine/apiKeysWidget.test.ts --browser chromium`
- `scripts/build-director-116.ps1` without `-SkipReplay`

## Package Artifacts

| Artifact | Size | SHA-256 |
|---|---:|---|
| `artifacts/out/stable/win32-x64/system-setup/Director-CodeSetup-x64-1.116.0.exe` | 162382332 | `E600290AF3AFD9B2AA758DD2894160FA0C6AD8258DC802AC0E88B6C781FA72E2` |
| `artifacts/out/stable/win32-x64/user-setup/Director-CodeUserSetup-x64-1.116.0.exe` | 162382660 | `DE2EB15C35827716B115F83F747A58B7C4141D82BFC8EC7978155166DF57289D` |

Build note: Windows native dependency rebuilds must use Python 3.11 in this environment (`npm_config_python=C:\Python311\python.exe`); Python 3.14 caused `node-gyp` permission failures during VS solution generation.
