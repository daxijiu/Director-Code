# Director Commercial/Name Grep Allowlist 116

Date: 2026-05-15

Status: active

Scope: 116 stable win32 x64 client commercial/name grep gate.

This allowlist is only for scoped grep hits that are required for OSS attribution, VS Code API/protocol compatibility, Windows OS namespaces, extension identity compatibility, or imported file-format diagnostics. User-visible commercial entry points must be fixed instead of added here.

## Allowed Hits

| ID | Allowed pattern or location | Visibility | Reason | Cleanup condition |
| --- | --- | --- | --- | --- |
| `OSS-001` | `Copyright (c) Microsoft Corporation` headers in upstream files | Source/package attribution | Required upstream MIT attribution. Not product branding or commercial flow. | Never remove unless upstream headers change legally. |
| `OSS-002` | `product.json.serverLicenseUrl` pointing at `github.com/microsoft/vscode` | About/license metadata | Server-side VS Code OSS license attribution. | Replace only if Director ships a complete mirrored license page. |
| `PKG-001` | `@microsoft/*`, `@vscode/*`, `vscode-*`, build script names, dependency names in `package.json` | Build metadata | Third-party package and internal build names. Not displayed as Director product identity. | Revisit only when dependency is removed or renamed upstream. |
| `WIN-001` | Windows paths under `Microsoft\Windows`, `Microsoft\Internet Explorer\Quick Launch`, and `Microsoft.VSCodeInsiders` AppX detection | Installer implementation | Windows registry/AppX namespace or compatibility detection, not Microsoft service branding. | Revisit if installer code is replaced. |
| `COMPAT-001` | Internal `vscode` schemes, IDs, comments, APIs, `VS Code core`, `VS Code format`, and tool-set compatibility wording | Internal/developer diagnostics | Required VS Code API, URI, schema, and compatibility language. | Revisit only for user-facing product copy. |
| `COMPAT-002` | `product.json.onboardingKeymaps[0].id = "vscode"` and label `VS Code` | Onboarding compatibility choice | Names the default VS Code keymap family, not the Director product. | Revisit only if Director introduces a distinct keymap preset. |
| `EXT-001` | Built-in extension publisher/repository metadata such as `Microsoft`, `GitHub`, `ms-vscode.*`, `GitHub.*`, and `Microsoft.foundry-local-chat` | Extension metadata | Extension identity and publisher attribution must match gallery IDs for compatibility. | Revisit when replacing bundled extensions. |
| `EXT-002` | Extension source copyright headers | Source/package attribution | Upstream extension workbench code attribution. | Never remove unless upstream headers change legally. |
| `HOOK-001` | Prompt syntax diagnostics/comments for GitHub Copilot custom-agent or Copilot CLI hook compatibility | Target-specific compatibility diagnostics | Director still parses compatible imported agent/hook formats. These strings are diagnostics for that source format, not a packaged Copilot runtime or subscription CTA. | Revisit if Director removes imported Copilot-format support. |
| `SENTINEL-001` | `COPILOT_USERNAME = 'GitHub Copilot'` in `chatListRenderer.ts` | Internal sentinel | Used to hide the legacy upstream username if such a response appears. Changing it would risk showing the legacy name. | Revisit if upstream response identity is fully Director-owned. |

## Not Allowed

- User-facing upgrade, subscription, sign-in, or quota copy that promotes GitHub Copilot.
- Default product, release notes, keyboard shortcut, tips, update, marketplace, or issue links pointing to Microsoft/VS Code when a Director-owned URL exists.
- Installer messages or packaged resource metadata naming VS Code or Microsoft as the Director product owner.
