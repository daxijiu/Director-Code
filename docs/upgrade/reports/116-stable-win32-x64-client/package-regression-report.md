# 116 Director Package Regression Report

Profile: `116-stable-win32-x64-client`

Phase: 6 package and regression gate

## Build

Command:

```powershell
.\scripts\build-director-116.ps1
```

The build was run without `-SkipReplay`. The script completed replay materialization, dependency install, TypeScript compile check, core CI build, minified win32-x64 build, Inno updater metadata, system installer build, and user installer build.

## Installer Artifacts

| Artifact | Size | SHA-256 |
|---|---:|---|
| `artifacts/out/stable/win32-x64/system-setup/Director-CodeSetup-x64-1.116.0.exe` | 162327831 | `DAF13D81BC9580443DC52BB3E700839983EAAB8649138733AD2B0208C793ACBB` |
| `artifacts/out/stable/win32-x64/user-setup/Director-CodeUserSetup-x64-1.116.0.exe` | 162328197 | `A96A9259DFC943B7D53912F0C8A888C886E239EA72A99974D674D5BC44748764` |

## Non-Destructive Runtime Smoke

- Cleared `%APPDATA%\Director-Code\clp` before smoke.
- Verified packaged `resources/app/product.json` keeps the full VS Code 116 `defaultChatAgent.provider` object shape, including `default.id = director-code` and empty-string provider fields for inactive provider slots.
- Launched the loose build `vscode.generated/layers/director/VSCode-win32-x64/Director-Code.exe` with temporary `--user-data-dir` and `--extensions-dir` under `artifacts/phase6-smoke`.
- Observed the expected Electron process tree for that temporary profile: main process plus GPU, network, renderer, and node utility processes.
- Terminated only processes whose command line matched the temporary smoke profile.

## Replay And Contract Validation

- `node scripts/upgrade/validate-series.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
- `node scripts/upgrade/validate-product-overrides.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
- `node scripts/upgrade/expected-contracts.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
- Post-build canonical validation initially drifted because packaging generated extension `dist/` files inside the materialized tree. These are build outputs, not canonical replay source.
- A clean post-build materialize was run:

```bash
bash scripts/upgrade/materialize-vscode.sh --profile docs/upgrade/profiles/116-stable-win32-x64-client.json --target vscode.generated --up-to-layer director --force
```

- `node scripts/upgrade/canonical-manifest.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json` then passed.

## Remaining Manual Acceptance

The installer files were not silently installed automatically, to avoid mutating the user's installed Director Code application, shell integration, registry state, or active profile. User-side installer/manual acceptance remains required before calling this a fully manually accepted release candidate.
