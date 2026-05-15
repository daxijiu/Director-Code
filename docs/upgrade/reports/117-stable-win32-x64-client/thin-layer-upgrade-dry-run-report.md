# 117 Thin-Layer Upgrade Dry-Run Report

Date: 2026-05-15

Status: blocked by missing VSCodium target tag

Baseline profile: `116-stable-win32-x64-client`

Target profile candidate: `117-stable-win32-x64-client`

## Summary

Phase 6 full 116 validation passed from a clean replayed Director tree. The next-version dry-run could not create a valid three-layer target profile because VS Code has a `1.117.0` tag, but VSCodium does not currently publish a matching `1.117*`, `1.118*`, `1.119*`, or `1.120*` stable tag in the upstream tag query.

No release profile was added. No 117 replay series was added. The dry-run remains blocked until a matching VSCodium stable tag exists or a separate product decision accepts a VS Code-only dry-run profile.

## Upstream Checks

```powershell
git ls-remote --tags https://github.com/microsoft/vscode.git refs/tags/1.117.0 refs/tags/1.118.0 refs/tags/1.119.0 refs/tags/1.120.0
git ls-remote --tags https://github.com/VSCodium/vscodium.git "refs/tags/1.117*" "refs/tags/1.118*" "refs/tags/1.119*" "refs/tags/1.120*"
```

Results:

| Upstream | Query | Result |
| --- | --- | --- |
| VS Code | `refs/tags/1.117.0` | Found: `10c8e557c8b9f9ed0a87f61f1c9a44bde731c409` |
| VS Code | `refs/tags/1.118.0` | Found: `9b8ae15a8cf95b9bce1b590b42954530f440e816` |
| VS Code | `refs/tags/1.119.0` | Found: `8b640eef5a6c6089c029249d48efa5c99adf7d51` |
| VS Code | `refs/tags/1.120.0` | Found: `0958016b2af9f09bb4257e0df4a95e2f90590f9f` |
| VSCodium | `refs/tags/1.117*`, `1.118*`, `1.119*`, `1.120*` | No refs returned |

## 116 Pre-Dry-Run Validation

Passed:

- `bash scripts/upgrade/materialize-vscode.sh --profile docs/upgrade/profiles/116-stable-win32-x64-client.json --target vscode.generated --up-to-layer director --force`
- `node scripts/upgrade/validate-series.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
- `node scripts/upgrade/validate-product-overrides.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
- `node scripts/upgrade/canonical-manifest.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
- `node scripts/upgrade/expected-contracts.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
- `npm ci` in `vscode.generated/layers/director/vscode` passed on retry after a transient Windows native dependency file lock.
- `npm run compile-check-ts-native`
- `npm run gulp -- transpile-client-esbuild`
- `npm run test-browser-no-install -- --grep "Director (Tool Registry|Read-Only Workspace Tools|Chat Editing Adapter|Edit Tools|Chat Mode Routing)"` (`23 passing`; known long-referrer warnings were logged by the upstream browser-test runner)

Commercial/name grep gate after clean replay:

| Check | Result |
| --- | ---: |
| Product/build scoped allowlisted hits | `29` |
| Chat forbidden commercial hits | `0` |
| Extensions forbidden commercial hits | `0` |
| Chat/extensions scoped allowlisted hits | `729` |

## Replay Consolidation Check

Passed:

- `patches/series.116.json` contains no `010` stage.
- `patches/series.116.json` contains no temporary local patch entry.
- Enabled Director semantic stages remain `002` through `009`.
- `artifacts/` remains untracked and is not part of the release source of truth.

## Skipped Target Steps

| Step | Status | Reason |
| --- | --- | --- |
| Create `117-stable-win32-x64-client` release profile | Skipped | No matching VSCodium `1.117*` stable tag exists. |
| Generate 117 VSCodium layer patch | Skipped | Requires a matching VSCodium target tag. |
| Apply Director replay patches to 117 three-layer tree | Skipped | Requires a valid VSCodium layer. |
| Run 117 replay/product/expected-contract validators | Skipped | No 117 dry-run profile or materialized target tree exists. |
| Compare conflict files and hunks | Skipped | Conflict set is unavailable until the target VSCodium layer can be generated. |

## Follow-Up

When a VSCodium `1.117*` or later stable tag appears, create a dry-run-only target profile, keep it out of the release series, generate the target VSCodium layer, apply the existing `002` through `009` Director patches, then record conflict files, conflict hunks, chat/tool/model/provider conflicts, and product-field manual decisions in this report.
