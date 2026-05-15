# Commercial/Name Grep Report 116

Date: 2026-05-15

Status: passed

Gate: Phase 5 declarative product and commercial audit.

Allowlist: `docs/upgrade/director-commercial-name-allowlist.116.md`

## Scope

Scanned generated Director source after Phase 5 edits:

- `product.json`, `package.json`, `resources/server/manifest.json`
- `build/win32/code.iss`
- `build/gulpfile.vscode.ts`, `build/gulpfile.vscode.win32.ts`
- `src/vs/workbench/contrib/chat/browser/**/*.ts`
- `src/vs/workbench/contrib/chat/common/**/*.ts`
- `src/vs/workbench/contrib/extensions/common/searchExtensionsTool.ts`
- `src/vs/workbench/contrib/extensions/browser/**/*.ts`

Excluded by policy: upstream cache, `docs/expired`, historical migration docs, generated artifacts outside the materialized source tree, test fixtures, and unscoped internal source areas.

## Keywords

- `Copilot`
- `GitHub Copilot`
- `Microsoft`
- `Visual Studio Code`
- `VS Code`

## Commands

```powershell
rg -n "Copilot|GitHub Copilot|Microsoft|Visual Studio Code|VS Code" `
  vscode.generated\layers\director\vscode\product.json `
  vscode.generated\layers\director\vscode\package.json `
  vscode.generated\layers\director\vscode\resources\server\manifest.json `
  vscode.generated\layers\director\vscode\build\win32\code.iss `
  vscode.generated\layers\director\vscode\build\gulpfile.vscode.ts `
  vscode.generated\layers\director\vscode\build\gulpfile.vscode.win32.ts

rg -n "GitHub Copilot|Copilot Free|Copilot Pro|Upgrade to GitHub Copilot|using Copilot|try Copilot|Trusted by Microsoft|Microsoft online service|Visual Studio Code|VS Code|code\.visualstudio\.com/docs/copilot|aka\.ms/github-copilot" `
  vscode.generated\layers\director\vscode\src\vs\workbench\contrib\chat\browser `
  vscode.generated\layers\director\vscode\src\vs\workbench\contrib\chat\common `
  -g "*.ts"

rg -n "Microsoft online service|Trusted by Microsoft|GitHub Copilot functionality|Copilot|GitHub Copilot|Microsoft|Visual Studio Code|VS Code" `
  vscode.generated\layers\director\vscode\src\vs\workbench\contrib\extensions\common\searchExtensionsTool.ts `
  vscode.generated\layers\director\vscode\src\vs\workbench\contrib\extensions\browser `
  -g "*.ts"
```

## Fixes Applied

| Area | Result |
| --- | --- |
| Product default links | Replaced default documentation, release notes, keyboard shortcuts, tips, feature request, videos, and social URLs with Director-owned URLs in `product.json`, product overrides, and owned-key allowlist. |
| Package metadata | Replaced package repository and bug URLs with the Director-Code repository and issue tracker. |
| Installer copy | Replaced the administrator warning's `VS Code` product reference with `Director-Code`. |
| Packaged resource metadata | Replaced Windows resource `CompanyName` and `LegalCopyright` from Microsoft strings to Director-Code Contributors. |
| Chat setup/status/model picker | Replaced reachable Copilot upgrade, quota, sign-in, model picker, permissions, agent session, MCP/customization, and terminal safety links with Director wording or Director docs. |
| Extension gallery wording | Replaced extension update settings that said updates come from a Microsoft online service with configured extension gallery wording. Replaced Copilot extension-unification status copy with generic compatible AI wording. |
| Tool registry | Exposed `extensions` as a read-only direct-reuse tool for Ask/Edit/Agent after the product/gallery wording gate passed; `installExtensions` remains hidden. |
| Comment cleanup | Removed remaining product-specific Copilot documentation URLs and Copilot Free subscription comments from touched chat sources to keep future grep audits low-noise. |

## Validation Summary

Latest scoped scan after clean materialization and Phase 5 cleanup:

| Check | Result |
| --- | ---: |
| Product/build scoped allowlisted hits | `29` |
| Chat forbidden commercial hits | `0` |
| Extensions forbidden commercial hits | `0` |
| Chat/extensions scoped allowlisted hits | `729` |

## Remaining Hits

| Group | Representative hits | Allowlist | Decision |
| --- | --- | --- | --- |
| OSS source headers | `Copyright (c) Microsoft Corporation` | `OSS-001`, `EXT-002` | Allowed attribution. |
| Product extension metadata | Built-in extension publisher `Microsoft`, extension IDs under `ms-vscode.*`, `GitHub.*`, `Microsoft.foundry-local-chat` | `EXT-001` | Allowed extension identity compatibility. |
| Product keymap compatibility | `onboardingKeymaps[0].label = "VS Code"` | `COMPAT-002` | Allowed keymap family label. |
| Windows namespaces | `Microsoft\Windows`, `Microsoft\Internet Explorer`, `Microsoft.VSCodeInsiders` | `WIN-001` | Allowed Windows/compat namespace. |
| Internal VS Code API/protocol comments | `VS Code core`, `vscode://`, `vscode` tool-set, schema, URI, and comment wording | `COMPAT-001` | Allowed internal compatibility. |
| Imported hook/agent format diagnostics | `GitHub Copilot` in custom-agent/hook compatibility diagnostics and comments | `HOOK-001` | Allowed because Director still imports those compatible formats. |
| Legacy chat username sentinel | `COPILOT_USERNAME = 'GitHub Copilot'` | `SENTINEL-001` | Allowed internal sentinel used to avoid showing the legacy username. |
| Package dependencies | `@microsoft/*`, `@vscode/*`, build scripts with `vscode` names | `PKG-001` | Allowed build/dependency metadata. |

## Gate Result

- User-visible scoped unexplained hits: `0`
- Allowlisted hit groups: `8`
- Product/gallery/marketplace wording policy: `passed`
- `extensions` tool exposure condition: `passed`; read-only search allowed, install mutation remains hidden.

This gate is now required for every subsequent wave in `docs/upgrade/director-thin-layer-refactor-plan-v2.md`.
