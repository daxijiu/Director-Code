# 120 Insider Upgrade Plan

Date: 2026-05-17

Branch: `120-replay-baseline`

Status: 120 profile infrastructure plus `003`, `004`, `005`, Phase E Plan Review UI adaptation, and `007`-`009` tool/editing stages are ported; active profile is still 116 until full 120 Director materialize passes.

## Purpose

This document is the handoff plan for upgrading Director-Code from the current 116 replay baseline to VS Code/VSCodium 120 Insider.

It records:

- The 116 -> 120 conflict research.
- Product and architecture decisions already made by the user.
- The exact current repository state.
- The intended implementation order for future windows.
- Validation commands and guardrails.

The key constraint remains unchanged: durable Director changes must land through replay, not as generated-tree-only fixes.

## Current Upstream Target

The formal 120 profile is:

```text
docs/upgrade/profiles/120-insider-win32-x64-client.json
```

Current upstream inputs:

- VS Code: `1.120.0`, commit `0958016b2af9f09bb4257e0df4a95e2f90590f9f`
- VSCodium: local cache `insider-120`, current HEAD `82fad9417eb473df07c9c398fef01023be4e036d`
- VSCodium `upstream/insider.json` points to VS Code `1.120.0`, commit `0958016b2af9f09bb4257e0df4a95e2f90590f9f`

Note: the first conflict probe used VSCodium commit `02577422eac2aa0b5e646bef6ee3e96e952bc8cf`. The formal 120 profile was later aligned to the current local cache HEAD `82fad9417eb473df07c9c398fef01023be4e036d`, because the user stated the current upstream versions are already present under `.cache/upstreams`.

## Current Completed State

Completed in this branch:

- Created formal profile: `docs/upgrade/profiles/120-insider-win32-x64-client.json`
- Registered the 120 profile in `docs/upgrade/profiles/index.json`
- Kept `activeProfile` unchanged as `116-stable-win32-x64-client`
- Generated VSCodium aggregate replay patch: `patches/replay/001-vscodium-layer.120-insider.patch`
- Ported product/build/release replay stage: `patches/replay/003-director-product-build-release.120-insider.patch`
- Ported agent engine / Claude / MCP replay stage: `patches/replay/004-director-agent-engine.120-insider.patch`
- Ported chat built-in mode / provider UI shielding replay stage: `patches/replay/005-director-chat-built-in-mode.120-insider.patch`
- Amended `004-director-agent-engine.120-insider.patch` for Phase E Plan Mode -> 120 review UI adaptation.
- Ported tool/editing replay stages:
  - `patches/replay/007-director-tool-layer.120-insider.patch`
  - `patches/replay/008-director-chat-editing.120-insider.patch`
  - `patches/replay/009-director-edit-tools.120-insider.patch`
- Generated 120 series file: `patches/series.120-insider.json`
- Generated VSCodium layer manifest: `docs/upgrade/vscodium-layer.120-insider.json`
- Added 120 product override, owned-key, delete, overlay, and deps mutation files
- Generated/updated 120 reports under `docs/upgrade/reports/120-insider-win32-x64-client/`
- Added HTML conflict report: `docs/upgrade/reports/120-insider-win32-x64-client/upgrade-conflict-report.html`

Current 120 series state:

- `001-vscodium-layer.120-insider.patch`: `enabled`
- `002-director-branding.120-insider.patch`: `deferred`
- `003-director-product-build-release.120-insider.patch`: `enabled`
- `004-director-agent-engine.120-insider.patch`: `enabled`
- `005-director-chat-built-in-mode.120-insider.patch`: `enabled`
- `006-director-text-polish.120-insider.patch`: `deferred`
- `007-director-tool-layer.120-insider.patch`: `enabled`
- `008-director-chat-editing.120-insider.patch`: `enabled`
- `009-director-edit-tools.120-insider.patch`: `enabled`

Validation already run and passed:

```powershell
node scripts/upgrade/validate-profile.mjs --profile 120-insider-win32-x64-client
node scripts/upgrade/validate-series.mjs --profile 120-insider-win32-x64-client
node scripts/upgrade/validate-product-overrides.mjs --profile 120-insider-win32-x64-client
node scripts/upgrade/materialize-vscode.mjs --profile docs/upgrade/profiles/120-insider-win32-x64-client.json --target .cache/upgrade-estimator/materialize-120-insider --up-to-layer vscodium --force --allow-nondefault-target-force
```

The last command proves the formal 120 `001` VSCodium layer can replay to the VSCodium layer. It intentionally did not materialize the Director layer.

## User Decisions

### 1. Formal 120 Profile

Decision:

- Create a formal `120-insider-win32-x64-client` profile.
- Do not switch `docs/upgrade/profiles/index.json` `activeProfile` yet.
- Switch active profile only after 120 replay can materialize to the Director layer and key validation passes.

Plain-language interpretation:

- The 120 profile is now a named upgrade route that scripts can run explicitly.
- The repository default remains 116, so normal profile-less commands still target the known-good baseline.
- All 120 work should pass `--profile docs/upgrade/profiles/120-insider-win32-x64-client.json` or `--profile 120-insider-win32-x64-client`.

### 2. Provider / Model UI

Decision:

- Keep the current Director Provider/Model UI as the preferred product shape.
- Shield or bypass VS Code 120's corresponding provider/model UI where it conflicts.
- Director Provider Registry remains the canonical source of provider instances, secrets/OAuth policy, model visibility, defaults, and selected model state.

Implication:

- Do not replace Director's provider manager with 120 `chatManagement/chatModelsWidget`.
- When porting `005`, treat 120 chat/model UI as upstream surface to bridge or suppress, not as the new product owner.

### 3. Claude AgentHost

Decision:

- Use VS Code 120 native Claude AgentHost shape as the base.
- Wrap it with Director-owned policy/proxy/routing.

Director must own:

- Provider Registry integration
- Anthropic/Anthropic-compatible provider selection
- Secret/OAuth policy
- Local proxy / auth injection
- Model routing
- Diagnostics
- Permission policy

Implication:

- Prefer reusing 120 `src/vs/platform/agentHost/node/claude/**` session/proxy/tool-display/session-event shape.
- Do not carry a separate 116-era custom Claude adapter if 120 already provides the correct AgentHost skeleton.

### 4. Plan Mode UI

Decision:

- Map Director Plan Mode to the 120 review UI.
- Keep Director Plan state, Plan-only tool policy, and `.director/plans/*.md` persistence.

Implication:

- Director `director_present_plan` should map into 120 `ChatPlanReviewData` / `ChatPlanReviewPart` where feasible.
- Director remains owner of:
  - Plan session state
  - Plan-only tool restrictions
  - Plan file transaction and `.director/plans/*.md`
  - Approved-plan execution handoff
- Avoid maintaining two unrelated plan review experiences.

### 5. Branding

Decision:

- Preserve complete user-visible Director branding and product experience.
- Test fixtures and low-value internal text may use allowlists to reduce upgrade noise.

Implication:

- Do not spend early migration time manually resolving every branding reject.
- Restore user-visible product names, setup/status text, extension-visible text, installer/package/product metadata, and first-run/welcome surfaces.
- Allow low-value fixture-only or internal-only text to be explicitly documented in allowlists.

## Research Findings From Conflict Probe

Conflict probe source:

```text
artifacts/generated/120-insider-win32-x64-client-probe/director-replay-probe-report.json
docs/upgrade/reports/120-insider-win32-x64-client/upgrade-conflict-report.html
```

Probe method:

- Generate VS Code 120 + VSCodium 120 Insider layer.
- Sequentially apply existing 116 Director patches `002` through `009` using `git apply --reject --binary --whitespace=nowarn`.
- Leave successful hunks applied to expose follow-on conflicts.

Overall result:

- VSCodium 120 Insider layer was viable.
- 8 Director patches probed.
- 3 patches applied cleanly.
- 5 patches partially applied with rejects.
- Total reject files: 125.
- Total reject hunks: 216.

Stage summary:

| Stage | Result | Reject files | Reject hunks | Meaning |
| --- | ---: | ---: | ---: | --- |
| `002-director-branding.116.patch` | partial | 98 | 156 | Mostly shallow branding/text drift. Large count, lower architecture risk. |
| `003-director-product-build-release.116.patch` | partial | 6 | 8 | Product/package/build/server manifest changes. High priority. |
| `004-director-agent-engine.116.patch` | partial | 3 | 6 | Director-owned engine mostly portable; conflicts are upstream bridge files. |
| `005-director-chat-built-in-mode.116.patch` | partial | 15 | 35 | Main chat/provider/model/session UI conflict area. |
| `006-director-text-polish.116.patch` | partial | 3 | 11 | Prompt/terminal/search copy drift. |
| `007-director-tool-layer.116.patch` | passed | 0 | 0 | Read-only tool registry is portable. |
| `008-director-chat-editing.116.patch` | passed | 0 | 0 | Chat Editing adapter is portable. |
| `009-director-edit-tools.116.patch` | passed | 0 | 0 | Reviewable edit tools are portable. |

High-value upstream 120 changes:

- `src/vs/platform/agentHost/node/claude/**` exists and contains Claude SDK/session/proxy/tool-display related code.
- `package.json` includes:
  - `@anthropic-ai/sdk`
  - `@anthropic-ai/claude-agent-sdk`
  - newer `@github/copilot-sdk`
  - `@vscode/copilot-api`
- 120 includes plan review infrastructure:
  - `vscode_reviewPlan`
  - `ReviewPlanTool`
  - `ChatPlanReviewData`
  - `ChatPlanReviewPart`
  - `planReviewFeedback`
- Chat setup/status/model picker/agent session files changed enough that 116 patch hunks must be manually ported.

Risk interpretation:

- Raw reject count is medium-high.
- Architecture risk is manageable if Director-owned boundaries are preserved.
- Branding/text conflict volume should not drive the migration order.
- The functional risk is concentrated in `003`, `004`, and `005`.

## Patch Ownership For 120

Use the same semantic stage model unless a truly necessary new stage appears:

1. `001-vscodium-layer.120-insider.patch`
   - VSCodium aggregate layer.
   - Already generated and enabled.

2. `002-director-branding.120-insider.patch`
   - Branding, resources, copy, product experience drift.
   - Defer until functional runtime patches are stable.

3. `003-director-product-build-release.120-insider.patch`
   - Product/package/server manifests, gulp, Windows installer, release/build wiring.
   - Next immediate stage to port.

4. `004-director-agent-engine.120-insider.patch`
   - Director agent harness, model/tool bridge, AgentHost/Claude/MCP related engine paths.
   - Should absorb 120 Claude AgentHost wrapper work where it is runtime/backend oriented.

5. `005-director-chat-built-in-mode.120-insider.patch`
   - Built-in chat mode, commercial-flow bypass, chat setup/status/model picker/provider UI/session UI entry points.
   - Should handle shielding 120 provider/model UI while preserving Director UI.

6. `006-director-text-polish.120-insider.patch`
   - Narrow copy/prompt polish.
   - Defer until functional surfaces compile.

7. `007-director-tool-layer.120-insider.patch`
   - Director read-only tool registry and mode policy.
   - Existing 116 patch applied cleanly in probe; port after `004/005` hooks settle.

8. `008-director-chat-editing.120-insider.patch`
   - Director Chat Editing contract and adapter.
   - Existing 116 patch applied cleanly in probe.

9. `009-director-edit-tools.120-insider.patch`
   - Reviewable edit tools.
   - Existing 116 patch applied cleanly in probe.

## Execution Plan

## Stage Completion Gate

Each stage below is a separate delivery unit. Do not roll multiple unresolved stages together.

Before starting the next stage, the current stage must complete this gate:

1. Implement the stage through replay-backed files, not generated-tree-only edits.
2. Run the stage-appropriate tests and validations. At minimum, run the profile-scoped validators relevant to the changed files; for runtime changes, also run focused compile/tests.
3. Do a self-review after tests pass. Review the diff for accidental upstream overwrites, lost Director behavior, wrong patch ownership, missing expected-contract updates, and unrelated churn.
4. Update this plan file with a completion note for that stage, including the key files changed and validation commands that passed.
5. Commit and push the completed stage to the remote branch.
6. Only then start the next stage.

If tests fail, or self-review finds a questionable conflict resolution, stop and fix that stage first. Do not move on by carrying known-bad or unreviewed work into the next stage.

### Phase A: Preserve Current Known State

Goal: keep 116 stable while 120 is still incomplete.

Rules:

- Do not change `activeProfile` away from `116-stable-win32-x64-client`.
- Do not update the default build scripts to target 120 yet.
- All 120 commands must pass the 120 profile explicitly.
- Treat `vscode.generated/layers/director/vscode` as a debugging workspace only.

Current status: complete.

Completion record:

- 2026-05-17: Completed 120 profile infrastructure and VSCodium layer replay setup. `activeProfile` remains `116-stable-win32-x64-client`.
- Validation passed:
  - `node scripts/upgrade/validate-profile.mjs --profile 120-insider-win32-x64-client`
  - `node scripts/upgrade/validate-series.mjs --profile 120-insider-win32-x64-client`
  - `node scripts/upgrade/validate-product-overrides.mjs --profile 120-insider-win32-x64-client`
  - `node scripts/upgrade/materialize-vscode.mjs --profile docs/upgrade/profiles/120-insider-win32-x64-client.json --target .cache/upgrade-estimator/materialize-120-insider --up-to-layer vscodium --force --allow-nondefault-target-force`
- Self-review status: profile is registered but not active; `series.120-insider.json` enables only `001`; Director `002-009` remain deferred.
- Push status: pushed to `origin/120-replay-baseline` in commit `bd81f12e` (`chore: add 120 insider replay profile`).

### Stage Completion Log

Append future completed stages here after tests and self-review pass, then commit and push before moving on.

| Stage | Status | Completed | Validation | Self-review | Push |
| --- | --- | --- | --- | --- | --- |
| Phase A: 120 profile + VSCodium layer | complete | 2026-05-17 | passed, commands listed above | passed | pushed: `bd81f12e` |
| Phase B: `003` product/build/release | complete | 2026-05-17 | passed: profile, series, product overrides, independent `001+003` scratch apply/json check, diff self-check | passed: 120 `quality`, `sharedDataFolderName`, full `defaultChatAgent.provider`, Director build/install metadata | pushed: `38ac3e71` |
| Phase C: `004` agent engine / Claude / MCP | complete | 2026-05-17 | passed: profile, series, product overrides, independent `001+003+004` scratch apply/bridge assertions, diff self-check | passed: 3 rejects manually resolved; request-bound auto-approval preserved; Claude wrapper follow-up recorded | pushed: `31a4e9e6` |
| Phase D: `005` chat/provider/model UI | complete | 2026-05-17 | passed: profile, series, product overrides, independent `001+003+004+005` scratch apply/bridge assertions, diff/grep self-check | passed: 120 provider/model UI shielded; commercial setup/status paths routed to Director settings; obsolete 116 paths not blindly ported | pushed: `73ce4e21` |
| Phase E: Plan Mode to 120 review UI | complete | 2026-05-17 | passed: profile, series, product overrides, independent `001+003+004+005` scratch apply/Plan Review assertions, diff self-check | passed: `director_present_plan` remains Director-owned; 120 review UI is an adapter; `.director/plans` persistence remains source of truth | pushed: `eca254a7` |
| Phase F: `007`-`009` tool/editing stages | complete | 2026-05-17 | passed: profile, series, product overrides, independent `001+003+004+005+007+008+009` scratch apply/tool assertions, diff/grep self-check | passed: read-only tool registry, Plan-only policy, Chat Editing adapter, and reviewable edit tools remain Director-owned | pushed: `fcd37328` |
| Phase G: `002`/`006` branding/text polish | complete | 2026-05-17 | passed: profile, series, product overrides, full `001-009` scratch materialize to Director layer, branding/text grep assertions; `expected-contracts` still fails because Phase H expected JSON files do not exist yet | passed: visible Director-Code branding restored; Copilot commercial flow text removed/guarded; remaining Copilot mentions are compatibility target/CLI names | pushed: `1039b40e` |
| Phase H: expected contracts/canonical/full materialize | complete | 2026-05-17 | passed: profile, series, product overrides, expected contracts, canonical manifest, clean full materialize to `vscode.generated`, materialize report target/product-shape assertions, commercial grep, no reject files, diff check | passed: `005` follow-up removed model-picker Copilot upgrade hover text; 120 expected/canonical/report outputs captured; active profile switched to 120 after Director materialize passed | pushed: `938dd858` |

### Phase B: Port Product / Build / Release (`003`)

Goal: create `patches/replay/003-director-product-build-release.120-insider.patch`.

Primary inputs:

- 120 VSCodium layer from formal profile
- Existing `003-director-product-build-release.116.patch`
- `product.json`
- `package.json`
- `resources/server/manifest.json`
- `build/gulpfile.reh.ts`
- `build/gulpfile.vscode.ts`
- `build/gulpfile.vscode.win32.ts`
- `build/win32/code.iss`
- `docs/upgrade/product-overrides/120-insider-win32-x64-client.json`
- `docs/upgrade/product-owned-keys.120-insider.json`

Required review points:

- Preserve full `defaultChatAgent.provider` object shape, including `enterprise.id`, `google.id`, and `apple.id`.
- Confirm 120 product fields that are new since 116.
- Decide whether new upstream product keys are Director-owned or upstream-owned.
- Keep Director branding and product metadata user-visible.
- Keep VSCodium/Director gallery/update/telemetry policy consistent with current product policy.
- Confirm new 120 dependencies, especially Anthropic/Claude SDK dependencies, are not removed accidentally.
- Confirm Windows installer ids, mutexes, app ids, and shell names.
- Confirm server manifest remains Director-branded where required.

Recommended implementation method:

1. Materialize 120 up to VSCodium into a scratch target.
2. Create a temporary Director worktree from that layer.
3. Manually port only product/build/release changes.
4. Generate `003` from VSCodium vs Director diff using `generate-director-patches.mjs` or a stage-scoped equivalent.
5. Regenerate `series.120-insider.json`.
6. Validate profile, series, product overrides.

Acceptance:

- `003` exists and is enabled in `series.120-insider.json`.
- `001 + 003` can replay on a scratch target.
- Product override validation passes.
- No generated-tree-only product fix remains.

Completion note, 2026-05-17:

- Created `patches/replay/003-director-product-build-release.120-insider.patch` from a 120 VSCodium scratch layer.
- Updated 120 product override ownership for `sharedDataFolderName`.
- Regenerated `patches/series.120-insider.json`; `003` is now enabled with a real sha256.
- Validation passed:
  - `node scripts/upgrade/validate-profile.mjs --profile 120-insider-win32-x64-client`
  - `node scripts/upgrade/validate-series.mjs --profile 120-insider-win32-x64-client`
  - `node scripts/upgrade/validate-product-overrides.mjs --profile 120-insider-win32-x64-client`
  - Independent scratch replay of `003` on the 120 VSCodium layer, followed by JSON parsing and assertions for `sharedDataFolderName`, `quality: insider`, and complete `defaultChatAgent.provider` shape.
- Self-review passed:
  - `git diff --check` found no whitespace errors in the stage files.
  - `rg "^\\+.*(1\\.116|116-stable|VSCodium|vscodium|GitHub\\.copilot|github\\.copilot)" patches/replay/003-director-product-build-release.120-insider.patch` found no newly added old-version, VSCodium, or Copilot strings.
  - Patch ownership is limited to product/package/server manifest, gulp, and Windows installer release wiring.

### Phase C: Port Agent Engine / Claude / MCP (`004`)

Goal: create `004-director-agent-engine.120-insider.patch`.

Conflict paths from probe:

- `src/vs/workbench/contrib/chat/browser/chat.contribution.ts`
- `src/vs/workbench/contrib/chat/browser/tools/languageModelToolsService.ts`
- `src/vs/workbench/contrib/mcp/browser/mcpServersView.ts`

120-specific review targets:

- `src/vs/platform/agentHost/node/claude/**`
- `src/vs/platform/agentHost/common/claudeModelConfig.ts`
- `src/vs/platform/agentHost/common/claudeSessionConfigKeys.ts`
- AgentHost protocol/session tests around Claude
- MCP sampling/resource/tool integration

Design direction:

- Reuse 120 native Claude AgentHost skeleton.
- Wrap with Director-owned provider/auth/proxy/routing/policy.
- Keep Director-owned services under `src/vs/workbench/contrib/directorCode/**` unless 120 AgentHost placement is clearly better for adapter island code.
- Keep upstream bridge files thin.

Do not:

- Reintroduce Copilot entitlement/CAPI assumptions.
- Let Claude SDK read final provider secrets directly.
- Duplicate AgentHost session concepts in parallel Director-only code if 120 already provides the shape.

Acceptance:

- Director agent engine compiles against 120 chat/tool/AgentHost interfaces.
- Claude AgentHost wrapper plan is represented in code or in a concrete follow-up TODO if not fully implemented in this stage.
- MCP view/tool bridge behavior is preserved.

Completion note, 2026-05-17:

- Created `patches/replay/004-director-agent-engine.120-insider.patch` from a 120 VSCodium + `003` scratch layer.
- Raw 116 `004` replay failed only in three bridge files:
  - `src/vs/workbench/contrib/chat/browser/chat.contribution.ts`
  - `src/vs/workbench/contrib/chat/browser/tools/languageModelToolsService.ts`
  - `src/vs/workbench/contrib/mcp/browser/mcpServersView.ts`
- Manual conflict decisions:
  - Kept Director AI enabled by default through `ChatConfiguration.AIDisabled: false`.
  - Preserved Director request-bound tool permission behavior by porting `_isSessionInAutoApproveLevel` to resolve the stamped request by `chatRequestId` on 120's helper path.
  - Kept user-visible MCP wording Director-branded where this stage already touched MCP bridge behavior.
- Validation passed:
  - `node scripts/upgrade/validate-profile.mjs --profile 120-insider-win32-x64-client`
  - `node scripts/upgrade/validate-series.mjs --profile 120-insider-win32-x64-client`
  - `node scripts/upgrade/validate-product-overrides.mjs --profile 120-insider-win32-x64-client`
  - Independent scratch replay of `003` and `004` on the 120 VSCodium layer, followed by checks for reject files, `git diff --check`, required Director engine files, and the 120 `chatRequestId` auto-approval helper.
- Self-review passed:
  - `git diff --check` found no whitespace errors in the stage files.
  - `rg "^\\+.*(1\\.116|116-stable|VSCodium|vscodium|GitHub\\.copilot|github\\.copilot)" patches/replay/004-director-agent-engine.120-insider.patch` found no newly added old-version, VSCodium, or Copilot extension identifiers.
  - Patch ownership is limited to Director agent engine files, thin chat/tool/MCP/shared-process bridges, and corresponding tests.
- Compile limitation:
  - `npm run compile-check-ts-native` was attempted in the scratch tree using existing generated-tree dependencies and did not pass.
  - The failures are expected at this partial stage: the available dependencies are still from the 116 generated tree and are missing 120 AgentHost packages/types such as `@anthropic-ai/*`, `@github/copilot-sdk`, and `chrome-remote-interface`; `004` also references Director tool/editing files that are intentionally introduced by later `007`-`009` stages.
  - Full TypeScript compile remains a Phase H gate after `007`-`009` are enabled and the 120 dependency install/build environment is materialized.
- Concrete Claude AgentHost follow-up:
  - Create a small Director adapter island such as `src/vs/platform/agentHost/node/directorClaude/**`.
  - Reuse native 120 `ClaudeAgent`, `ClaudeProxyService`, session event mapping, prompt/tool display, and session config shapes where possible.
  - Route provider secrets, model selection, proxy policy, diagnostics, and auth through Director-owned services under `src/vs/workbench/contrib/directorCode/**`.
  - Do not route Director Claude through `ICopilotApiService`, `GITHUB_COPILOT_PROTECTED_RESOURCE`, or GitHub Copilot entitlement/CAPI token assumptions.

### Phase D: Port Chat Built-in Mode / Provider UI Shielding (`005`)

Goal: create `005-director-chat-built-in-mode.120-insider.patch`.

Conflict paths from probe:

- `src/vs/workbench/contrib/chat/browser/agentSessions/agentSessions.ts`
- `src/vs/workbench/contrib/chat/browser/agentSessions/experiments/agentTitleBarStatusWidget.ts`
- `src/vs/workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditor.ts`
- `src/vs/workbench/contrib/chat/browser/aiCustomization/mcpListWidget.ts`
- `src/vs/workbench/contrib/chat/browser/chatManagement/chatModelsWidget.ts`
- `src/vs/workbench/contrib/chat/browser/chatSetup/chatSetupContributions.ts`
- `src/vs/workbench/contrib/chat/browser/chatSetup/chatSetupProviders.ts`
- `src/vs/workbench/contrib/chat/browser/chatSetup/chatSetupRunner.ts`
- `src/vs/workbench/contrib/chat/browser/chatStatus/chatStatusDashboard.ts`
- `src/vs/workbench/contrib/chat/browser/chatStatus/chatStatusEntry.ts`
- `src/vs/workbench/contrib/chat/browser/widget/chatContentParts/chatQuotaExceededPart.ts`
- `src/vs/workbench/contrib/chat/browser/widget/input/chatModelPicker.ts`
- `src/vs/workbench/contrib/chat/browser/widget/input/modelPickerActionItem.ts`
- `src/vs/workbench/contrib/chat/browser/widget/input/permissionPickerActionItem.ts`
- `src/vs/workbench/contrib/chat/test/browser/widget/input/chatModelPicker.test.ts`

User decision to enforce:

- Keep Director Provider/Model UI.
- Shield 120 provider/model UI where it conflicts.
- Director Provider Registry is the fact source.

Required review points:

- Chat setup should not push user into Copilot commercial setup.
- Chat status should be Director-branded and Director-policy-aware.
- Model picker should route to Director model/provider state.
- Permission picker should align with Director mode/tool policy.
- Agent session UI should respect Agent kind/session locking and future Claude session behavior.
- Quota/TOS/upgrade flows should not expose Copilot subscription semantics.

Acceptance:

- Director UI remains the primary provider/model management experience.
- 120 UI additions are suppressed, bridged, or made Director-aware.
- Existing Wave 2 provider/model registry assumptions remain valid.

Completion note, 2026-05-17:

- Created `patches/replay/005-director-chat-built-in-mode.120-insider.patch` from a 120 VSCodium + `003` + `004` scratch layer.
- Regenerated `patches/series.120-insider.json`; `005` is now enabled with a real sha256.
- Manual conflict decisions:
  - Preserved Director Provider/Model UI as the primary experience.
  - Routed 120 `MANAGE_CHAT_COMMAND_ID` to `director-code.openSettings` in Director built-in mode so the upstream Models Management editor does not become the product owner.
  - Kept 120 model picker grouping but made unavailable-model actions Director-neutral and pointed configuration to Director settings.
  - Kept `ChatSetup.run` from launching Copilot setup in Director built-in mode.
  - Hid or bypassed Copilot upgrade/additional-spend/setup paths in chat status, quota, anonymous-rate-limit, quick-chat, and welcome/TOS surfaces touched by this stage.
  - Did not blindly port obsolete 116 hunks for removed or radically changed 120 files such as `chatStatusWidget.ts` and `modelPickerActionItem.ts`.
- Validation passed:
  - `node scripts/upgrade/validate-profile.mjs --profile 120-insider-win32-x64-client`
  - `node scripts/upgrade/validate-series.mjs --profile 120-insider-win32-x64-client`
  - `node scripts/upgrade/validate-product-overrides.mjs --profile 120-insider-win32-x64-client`
  - Independent scratch replay of `003`, `004`, and `005` on the 120 VSCodium layer, followed by checks for reject files, `git diff --check`, Director model-picker/setup/provider-management assertions, `MANAGE_CHAT_COMMAND_ID` Director routing, and anonymous-rate-limit Director wording.
- Self-review passed:
  - `git diff --check` found no whitespace errors in the stage files.
  - `rg "^\\+.*(1\\.116|116-stable|VSCodium|VSCodium - Insiders|GitHub\\.copilot|github\\.copilot|Upgrade to GitHub Copilot|Manage GitHub|Copilot uses your configured|code.visualstudio.com/docs/copilot/agents/agent-tools|free account gets 50 premium|By continuing with .* Copilot)" patches/replay/005-director-chat-built-in-mode.120-insider.patch` found no newly added old-version, VSCodium, Copilot extension id, or Copilot commercial-flow strings.
  - Patch ownership is limited to chat built-in mode, setup/status/model-picker/provider UI shielding, AI customization visibility, and corresponding focused tests.
- Materialize note:
  - `node scripts/upgrade/materialize-vscode.mjs --profile docs/upgrade/profiles/120-insider-win32-x64-client.json --target .cache/upgrade-estimator/phase-d-materialize-check --up-to-layer director --force --allow-nondefault-target-force` currently stops before applying Director stages because the script requires the deferred `002` patch to be enabled. This is expected until Phase G enables branding/text stages; Phase D was therefore validated through an independent scratch replay of the enabled stages.
- Compile limitation:
  - Full TypeScript compile remains a Phase H gate after `007`-`009`, 120 dependencies, expected contracts, and full materialize are ready.

### Phase E: Plan Mode To 120 Review UI

Goal: map Director Plan Mode to 120 plan review UI without losing Director Plan ownership.

120 upstream surfaces:

- `src/vs/workbench/contrib/chat/common/tools/builtinTools/reviewPlanTool.ts`
- `src/vs/workbench/contrib/chat/common/model/chatProgressTypes/chatPlanReviewData.ts`
- `src/vs/workbench/contrib/chat/browser/widget/chatContentParts/chatPlanReviewPart.ts`
- `src/vs/workbench/contrib/chat/browser/planReviewFeedback/**`

Director-owned invariants:

- Plan state remains Director session state.
- Plan file persistence remains `.director/plans/*.md`.
- Plan file write must go through Plan-only `director_present_plan`.
- General edit tools must not be exposed in Plan-only mode.
- Approved plan execution must create a new Agent turn/request with approved plan context.

Implementation options to evaluate:

- Adapt `director_present_plan` output into `ChatPlanReviewData`.
- Reuse `ChatPlanReviewPart` for approve/reject/feedback UI.
- Use 120 `planReviewFeedback` editor feedback where compatible.
- Keep `vscode_reviewPlan` as upstream reference; do not blindly replace Director tool semantics.

Acceptance:

- No duplicate plan review UI.
- `.director/plans/*.md` remains authoritative for Director plan persistence.
- Plan review action nonce/session safety remains intact.

Completion note, 2026-05-17:

- Implemented Phase E by amending `patches/replay/004-director-agent-engine.120-insider.patch`; no new replay stage was added.
- Kept `director_present_plan` as the only model-visible Director Plan completion tool.
- Kept `DirectorPlanModeService` as owner of Plan state, nonce/session checks, `.director/plans/*.md` writes, approval/rejection/revision state transitions, and execution prompt generation.
- Added a Director-owned 120 review adapter in `DirectorCodeAgent`:
  - creates `ChatPlanReviewData` from the active `DirectorPlanRecord`;
  - keeps the Plan request pending with `raceCancellation(reviewData.completion.p, token)`;
  - maps Reject to `rejectPlan`;
  - maps Submit Feedback to `beginRevision` and queues a new Plan revision request;
  - maps Execute to `approvePlanForExecution` and queues a new Agent execution request.
- Added `createDirectorPlanReviewContent(plan)` so the 120 widget shows the plan body without YAML frontmatter and without using the plan file as the executable source.
- Deliberately did not pass `planUri` into the 120 review widget in this phase. This keeps inline plan-file editing disabled until Director has an explicit validate/reconcile path for edited plan file content.
- Validation passed:
  - `node scripts/upgrade/validate-profile.mjs --profile 120-insider-win32-x64-client`
  - `node scripts/upgrade/validate-series.mjs --profile 120-insider-win32-x64-client`
  - `node scripts/upgrade/validate-product-overrides.mjs --profile 120-insider-win32-x64-client`
  - Independent scratch replay of `003`, updated `004`, and `005` on the 120 VSCodium layer, followed by checks for reject files, `git diff --check`, `ChatPlanReviewData`, `raceCancellation(reviewData.completion.p, token)`, execution/revision prompt queueing, `createDirectorPlanReviewContent`, and the Phase D model-management shield.
- Self-review passed:
  - `git diff --check` found no whitespace errors in `patches/replay/004-director-agent-engine.120-insider.patch` or `patches/series.120-insider.json`.
  - `rg` confirmed the patch did not expose `vscode_reviewPlan` as the Director Plan tool and did not enable `planUri`/inline edit reconciliation prematurely.
  - Patch ownership remains in `004`: Director Plan state/tool/agent flow and a focused Plan Mode test.
- Test runner limitation:
  - The available 120 scratch trees and repository root do not have `node_modules`, so `npm run test-node -- --grep "Director Plan Mode"` could not be run in this environment without a dependency install.
  - The focused unit assertion was added to `src/vs/workbench/contrib/chat/test/common/agentEngine/directorPlanMode.test.ts`; running the VS Code node test runner remains a Phase H/dependency-environment gate.

### Phase F: Clean Tool / Editing Stages (`007`-`009`)

Goal: port cleanly-applying Director-owned stages after upstream bridge hooks are stable.

Reason:

- Probe showed these 116 patches apply cleanly against 120 after partial earlier stages.
- They are mostly Director-owned and should remain low risk.

Acceptance:

- Read-only tool registry tests pass or compile.
- Chat Editing adapter tests pass or compile.
- Reviewable edit tool tests pass or compile.
- Tool permission/mode policy remains consistent with Plan, Agent, and future Claude sessions.

Completion note, 2026-05-17:

- Created the 120 tool/editing replay patches from a 120 VSCodium + `003` + Phase E `004` + `005` scratch layer:
  - `patches/replay/007-director-tool-layer.120-insider.patch`
  - `patches/replay/008-director-chat-editing.120-insider.patch`
  - `patches/replay/009-director-edit-tools.120-insider.patch`
- Regenerated `patches/series.120-insider.json`; `007`, `008`, and `009` are now enabled with real sha256 values.
- Validation passed:
  - `node scripts/upgrade/validate-profile.mjs --profile 120-insider-win32-x64-client`
  - `node scripts/upgrade/validate-series.mjs --profile 120-insider-win32-x64-client`
  - `node scripts/upgrade/validate-product-overrides.mjs --profile 120-insider-win32-x64-client`
  - Independent scratch replay of `003`, Phase E `004`, `005`, `007`, `008`, and `009` on the 120 VSCodium layer, followed by checks for reject files, `git diff --check`, `DirectorToolMode.Plan`, `PLAN_ONLY`, `DirectorChatEditingAdapter`, `directorEditTools.contribution.ts`, `apply_patch`, `replace_string_in_file`, `multi_replace_string_in_file`, `directorEditTools.test.ts`, and the Phase E `ChatPlanReviewData` adapter.
- Self-review passed:
  - `git diff --check` found no whitespace errors in `patches/replay/007-director-tool-layer.120-insider.patch`, `008`, `009`, or `patches/series.120-insider.json`.
  - `git apply --numstat` shows patch ownership is limited to Director read-only tools/registry/tests, Director Chat Editing adapter/tests, and Director reviewable edit tools/registration/tests.
  - `rg "^\\+.*(1\\.116|116-stable|VSCodium|vscodium|GitHub\\.copilot|github\\.copilot|vscode_reviewPlan|Upgrade to GitHub Copilot|Manage GitHub)" patches/replay/007-director-tool-layer.120-insider.patch patches/replay/008-director-chat-editing.120-insider.patch patches/replay/009-director-edit-tools.120-insider.patch` found no newly added old-version, VSCodium, Copilot extension id, or unrelated commercial-flow strings.
- Test runner limitation:
  - The available 120 scratch trees and repository root do not have `node_modules`, so focused VS Code unit tests for these files could not be executed without a dependency install.
  - The replay/apply assertions confirm the expected test files are present and wired for the later Phase H dependency/build gate.

### Phase G: Branding / Text Polish (`002`, `006`)

Goal: restore user-visible Director branding and copy after runtime port is stable.

Reason:

- `002` has the largest reject count, but most are shallow text drift.
- Solving it first would slow down functional migration.

User decision:

- Preserve user-visible Director branding.
- Allow test fixtures and low-value internal text to be allowlisted.

Recommended method:

- Reapply branding rules by category.
- Regenerate grep report for commercial names.
- Add explicit allowlist entries for accepted leftovers.
- Avoid hand-resolving low-value fixture drift unless a test requires it.

Acceptance:

- Product-visible surfaces say Director-Code.
- Installer/package/product metadata say Director-Code.
- Copilot commercial flows are not user-facing.
- Residual upstream commercial names are documented and justified.

Completion note, 2026-05-17:

- Created the 120 branding/text-polish replay patches from current 120 sources instead of blindly replaying the 116 patches:
  - `patches/replay/002-director-branding.120-insider.patch`
  - `patches/replay/006-director-text-polish.120-insider.patch`
- Regenerated `patches/series.120-insider.json`; `002` and `006` are now enabled with real sha256 values.
- Validation passed:
  - `node scripts/upgrade/validate-profile.mjs --profile 120-insider-win32-x64-client`
  - `node scripts/upgrade/validate-series.mjs --profile 120-insider-win32-x64-client`
  - `node scripts/upgrade/validate-product-overrides.mjs --profile 120-insider-win32-x64-client`
  - Full scratch materialize to Director layer using enabled `001-009` patches passed, with no `.rej` files and no `git diff --check` errors in the materialized tree.
  - Branding assertions confirmed Director-Code text in server CLI, Windows update strings, extension unification messaging, welcome/onboarding disclaimers, extension search, hook schema, and terminal settings.
- Self-review passed:
  - `git diff --check -- patches/replay/002-director-branding.120-insider.patch patches/replay/006-director-text-polish.120-insider.patch patches/series.120-insider.json` found no whitespace errors.
  - `rg` checks found no VSCodium/VS Code leftovers in the selected user-visible Phase G files.
  - Copilot commercial-flow leftovers were removed or guarded. Remaining Copilot matches are compatibility target/CLI names, not Director product-flow text.
- Known Phase H gate:
  - `node scripts/upgrade/expected-contracts.mjs --profile 120-insider-win32-x64-client` still fails because `docs/upgrade/expected/120-insider-win32-x64-client/*.expected.json` files have not been captured yet. This is the first Phase H task.

### Phase H: Expected Contracts, Canonical Manifest, Full Materialize

Goal: switch from partial replay to full 120 Director replay.

Required outputs:

- 120 expected product/package/server/announcement files
- 120 canonical manifest
- 120 materialize report
- 120 expected contracts report
- Updated `series.120-insider.json` with enabled Director patches and correct sha256 values

Validation:

```powershell
node scripts/upgrade/validate-profile.mjs --profile 120-insider-win32-x64-client
node scripts/upgrade/validate-series.mjs --profile 120-insider-win32-x64-client
node scripts/upgrade/validate-product-overrides.mjs --profile 120-insider-win32-x64-client
node scripts/upgrade/expected-contracts.mjs --profile docs/upgrade/profiles/120-insider-win32-x64-client.json
```

Full materialize, once Director stages are ready:

```bash
bash scripts/upgrade/materialize-vscode.sh \
  --profile docs/upgrade/profiles/120-insider-win32-x64-client.json \
  --target vscode.generated \
  --up-to-layer director \
  --force
```

Completion note, 2026-05-17:

- Ran clean full materialize to `vscode.generated/layers/director/vscode` with enabled `001-009` patches.
- Captured and validated 120 expected contracts:
  - `docs/upgrade/expected/120-insider-win32-x64-client/product.expected.json`
  - `docs/upgrade/expected/120-insider-win32-x64-client/package.expected.json`
  - `docs/upgrade/expected/120-insider-win32-x64-client/server-manifest.expected.json`
  - `docs/upgrade/expected/120-insider-win32-x64-client/announcements-builtin.expected.json`
  - `docs/upgrade/expected/120-insider-win32-x64-client/announcements-extra.expected.json`
- Captured and validated `docs/upgrade/manifests/120-insider-win32-x64-client.canonical.json`.
- Wrote 120 materialize, expected-contracts, and canonical-manifest reports under `docs/upgrade/reports/120-insider-win32-x64-client/`.
- Amended `patches/replay/005-director-chat-built-in-mode.120-insider.patch` to remove remaining model-picker GitHub Copilot upgrade hover text and route that fallback text to Director settings.
- Regenerated `patches/series.120-insider.json`; the `005` sha256 now reflects the follow-up commercial-flow fix.
- Switched `docs/upgrade/profiles/index.json` `activeProfile` from `116-stable-win32-x64-client` to `120-insider-win32-x64-client` after Director-layer materialize passed.
- Updated `AGENTS.md`, `CLAUDE.md`, and `.claude/memory.md` so new windows see 120 as the current canonical baseline.
- Validation passed:
  - `node scripts/upgrade/validate-profile.mjs --profile 120-insider-win32-x64-client`
  - `node scripts/upgrade/validate-series.mjs --profile 120-insider-win32-x64-client`
  - `node scripts/upgrade/validate-product-overrides.mjs --profile 120-insider-win32-x64-client`
  - `node scripts/upgrade/expected-contracts.mjs --profile 120-insider-win32-x64-client`
  - `node scripts/upgrade/canonical-manifest.mjs --profile 120-insider-win32-x64-client`
  - `node scripts/upgrade/materialize-vscode.mjs --profile docs/upgrade/profiles/120-insider-win32-x64-client.json --target vscode.generated --up-to-layer director --force`
- Self-review passed:
  - Materialize report status is `passed`, target is `vscode.generated`, and layer is `director`.
  - Generated `product.json` preserves the full `defaultChatAgent.provider.{default,enterprise,google,apple}.{id,name}` object shape.
  - Commercial/name grep over chat/extensions/welcome surfaces found no `Upgrade to GitHub Copilot`, `GitHub Copilot Chat extension`, `All GitHub Copilot functionality`, `Try GitHub Copilot`, `Manage GitHub`, `VSCodium - Insiders`, or `VSCodium` hits.
  - `git diff --check` found no whitespace errors and `rg --files -g '*.rej' vscode.generated/layers/director/vscode` found no reject files.
- Test/build limitation:
  - This workspace has no `node_modules` in the repo root or generated tree, and there is not yet a 120-specific package script. TypeScript compile, unit/browser tests, and package build remain the next dependency/build pass, not part of this replay-canonical closeout.

## Guardrails

Do not:

- Resolve conflicts by blindly taking upstream or current side.
- Revert user changes or unrelated dirty files.
- Treat generated-tree-only fixes as complete.
- Switch active profile before Director layer materializes successfully.
- Delete 116 replay inputs while 120 is incomplete.
- Let Copilot entitlement/subscription/auth assumptions leak into Director product flow.
- Replace Director Provider UI with 120 upstream UI contrary to the user decision.
- Bypass `defaultChatAgent.provider` shape validation.

Do:

- Review each conflict by module/function.
- Prefer Director-owned core plus thin upstream bridge.
- Keep Director provider/agent policy in Director-owned modules.
- Keep upstream files limited to registration hooks, adapters, and compatibility shims.
- Regenerate series after patch contents change.
- Run profile-scoped validations after every stage.
- Record accepted leftovers in reports/allowlists.

## Immediate Next Step

After Phase H is committed and pushed, the next work should be either a 120 dependency/build/package pass or Phase 2 Wave 3 Claude AgentHost SDK integration.

The next window should:

1. Confirm branch/status.
2. Confirm `docs/upgrade/profiles/index.json` still points to `120-insider-win32-x64-client`.
3. If doing build/package work, install 120 generated-tree dependencies and run compile/test/package gates from the materialized `vscode.generated/layers/director/vscode` tree.
4. If doing Wave 3, start from 120 native Claude AgentHost and keep provider/auth/proxy/routing policy Director-owned.

Suggested first commands:

```powershell
git branch --show-current
git status --short
node scripts/upgrade/validate-profile.mjs --profile 120-insider-win32-x64-client
node scripts/upgrade/validate-series.mjs --profile 120-insider-win32-x64-client
node scripts/upgrade/validate-product-overrides.mjs --profile 120-insider-win32-x64-client
```

## Current Dirty Worktree Snapshot

As of 2026-05-17 after Phase H push, only the untracked `artifacts/` directory should remain.

Do not clean or revert `artifacts/` unless explicitly asked.
