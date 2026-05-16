# 120 Insider Upgrade Conflict Probe

Date: 2026-05-16

## Scope

Probe the next upstream landing target from the current Director 116 replay baseline:

- VS Code upstream: `microsoft/vscode` tag `1.120.0`, commit `0958016b2af9f09bb4257e0df4a95e2f90590f9f`
- VSCodium upstream: `VSCodium/vscodium` branch `insider`, cached locally as `insider-120`, commit `02577422eac2aa0b5e646bef6ee3e96e952bc8cf`
- VSCodium insider metadata: `.cache/upstreams/vscodium/insider-120/upstream/insider.json` points to VS Code `1.120.0` and the same VS Code commit above.

Local caches created:

- `.cache/upstreams/vscode/1.120.0`
- `.cache/upstreams/vscodium/insider-120`

Generated probe artifacts:

- `artifacts/generated/120-insider-win32-x64-client-probe/vscodium-layer-report.json`
- `artifacts/generated/120-insider-win32-x64-client-probe/vscodium-layer.120-insider.json`
- `artifacts/generated/120-insider-win32-x64-client-probe/director-replay-probe-report.json`

This is a conflict probe only. It does not introduce a canonical 120 profile or 120 replay series.

## VSCodium Layer Result

The VSCodium 120 insider layer materialized cleanly from clean upstream inputs.

- Status: passed
- VSCodium patches applied: 45
- Overlays applied: 2
- Source mutations applied: 8
- Temporary files: 0

Interpretation: the base `VS Code 120 + VSCodium insider 120` source layer is viable. The 116 aggregate VSCodium patch should not be carried forward directly; regenerate a 120 aggregate layer patch from VSCodium insider inputs instead.

## Director Replay Probe Result

Method: sequentially applied the existing 116 Director replay patches `002` through `009` onto the generated VSCodium 120 insider layer using `git apply --reject --binary --whitespace=nowarn`. Successful hunks were left applied so later Director stages could expose follow-on conflicts.

Summary:

- Director patches probed: 8
- Cleanly applied patches: 3
- Partially applied patches with rejects: 5
- Total reject files: 125
- Total reject hunks: 216
- Changed files including rejects in the probe worktree: 200

Stage breakdown:

| Stage | Result | Reject files | Reject hunks | Notes |
| --- | ---: | ---: | ---: | --- |
| `002-director-branding.116.patch` | partial | 98 | 156 | Mostly shallow branding/text drift across extensions, welcome/getting-started, terminal strings, and extension management surfaces. |
| `003-director-product-build-release.116.patch` | partial | 6 | 8 | Product/package/build/server manifest shape changed and must be re-based for 120/insider. |
| `004-director-agent-engine.116.patch` | partial | 3 | 6 | Director-owned engine files mostly apply; conflicts are upstream hook files: `chat.contribution.ts`, `languageModelToolsService.ts`, `mcpServersView.ts`. |
| `005-director-chat-built-in-mode.116.patch` | partial | 15 | 35 | Main runtime/UI conflict area: chat setup/status/model picker/agent sessions/provider UI. |
| `006-director-text-polish.116.patch` | partial | 3 | 11 | Text polish drift, including terminal configuration and prompt validation. |
| `007-director-tool-layer.116.patch` | passed | 0 | 0 | Director-owned tool layer applies cleanly after partial 004. |
| `008-director-chat-editing.116.patch` | passed | 0 | 0 | Director-owned chat editing contract applies cleanly. |
| `009-director-edit-tools.116.patch` | passed | 0 | 0 | Director-owned reviewable edit tools apply cleanly. |

Reject groups:

| Group | Reject files |
| --- | ---: |
| Branding/extensions/other shallow text | 86 |
| Chat upstream surface | 18 |
| Platform/services | 11 |
| Product/build/branding manifests | 7 |
| Model/tool/MCP surface | 3 |

## Runtime Architecture Signals

The 120 upstream has expanded the same areas Director already treats as privileged bridge surfaces:

- `src/vs/platform/agentHost/node/claude/**` is new compared with the older 116 shape and includes Claude SDK/session/proxy/tool-display code.
- VS Code 120 `package.json` now includes `@anthropic-ai/sdk`, `@anthropic-ai/claude-agent-sdk`, newer `@github/copilot-sdk`, and `@vscode/copilot-api`.
- `src/vs/workbench/contrib/chat/browser/planReviewFeedback/**` is present in 120 and should be reviewed against Director Plan Mode review UI before porting.
- Chat setup/status/model picker/agent session files moved enough that Director's built-in mode and provider UI hooks need a deliberate 120 backport rather than raw patch carry-forward.

## Risk Assessment

Upgrade conflict level: medium-high by raw reject count, but medium by architecture risk if the boundary principle is kept.

Why:

- VSCodium 120 layer is clean.
- Director-owned core additions are mostly portable; the deepest Director-owned tool/editing stages apply cleanly.
- The largest reject count is branding/product/text drift, which is noisy but shallow.
- The important manual work is concentrated in a small number of upstream bridge files under chat/model/tool/setup surfaces.
- VS Code 120 now has more native agent/Claude/session infrastructure, which may reduce some custom Director adapter burden but increases the need to avoid duplicating upstream agent-host concepts.

Recommended next step:

1. Create a temporary `120-insider-win32-x64-client` profile and regenerate a proper `001-vscodium-layer.120.patch` from the clean VSCodium insider inputs.
2. Port Director stages in this order: `003` product/build contracts, then `004`/`005` chat/model bridge hooks, then replay the clean `007`-`009` Director-owned stages.
3. Before committing to implementation, compare VS Code 120 `planReviewFeedback`, `agentHost/node/claude`, and provider/model picker surfaces against the existing Director Plan Mode and Wave 2/3 provider/Claude work, because 120 upstream may have already absorbed some of the integration shape.
