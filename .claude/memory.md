# Director-Code Memory

This file is the chronological working memory for the project. Keep durable project overview, goals, and direction in `AGENTS.md` and `CLAUDE.md`; keep detailed state, phase facts, package hashes, and handoff notes here.

## 2026-05-18 runInTerminal Sync Regression And execution_subagent

- Fixed the 120 Insider `runInTerminal` consecutive sync regression in replay-backed form.
- Root cause: tool terminal input tracking listened to PTY `onData`, so shell output/prompt bytes were misclassified as manual user input; Basic/None shell integration then sent `Ctrl+C` / `Ctrl+U` before the next sync command.
- `runInTerminalTool.ts` now listens to `onDidInputData` and ignores tool-originated `sendText(...)` through a per-terminal suppression guard. Basic/None strategies receive the guarded terminal instance for command sends and control sends.
- Added regression coverage for PTY `onData` not setting `receivedUserInput`, real `onDidInputData` still setting it, guarded tool-owned sends, and consecutive Basic/None sync commands returning non-empty output without unintended control characters.
- Added Director-owned `execution_subagent`, exposed only in Agent mode. It uses request-scoped parent context, only exposes internal `runInTerminal`, requires sync mode plus explicit `1..120000` ms timeout, rejects multiple terminal calls in one inner turn, passes `subAgentInvocationId`, and reads structured terminal metadata for timeout/background/input-needed decisions.
- `VSCodeToolBridge` now has a structured result path that preserves `toolMetadata`, `toolResultMessage`, `toolResultDetails`, and rendered text while keeping the old string-return path for the generic Agent loop.
- Timeout ownership is explicit in the Director tool registry: `runInTerminal` is `stage-aware-terminal`; `execution_subagent`, `runTask`, `createAndRunTask`, and `getTaskOutput` are `tool-owned`; dedicated user confirmation/question tools are `user-interaction-owned`.
- `scripts/upgrade/generate-director-patches.mjs` now classifies terminal-tool runtime/test paths into `007-director-tool-layer` instead of broad branding, and keeps chat common tool-service stage signal changes in `004-director-agent-engine`.
- `scripts/upgrade/canonical-manifest.mjs` excludes generated TypeScript build info and extension package outputs (`*.tsbuildinfo`, extension `dist`, extension `notebook-out`, and markdown preview generated JS) so build/test artifacts do not pollute canonical manifests.
- Targeted validation passed: `compile-check-ts-native`, Director tool bridge / execution_subagent / tool registry tests, replay `validate-series`, product override validation, expected contracts, and canonical manifest write+validate.
- Full package validation passed with `scripts/build-director-120-insider.ps1` (no `-SkipReplay`), producing:
  - `artifacts/out/insider/win32-x64/system-setup/Director-CodeSetup-x64-1.120.0.exe`, sha256 `65EEA3E1DFE278502BECE976022E4C9218AF9687F85893385C9141800639D31D`
  - `artifacts/out/insider/win32-x64/user-setup/Director-CodeUserSetup-x64-1.120.0.exe`, sha256 `0006FC3EA7A96151501959ABBA90566B34BE5FBEE5F5A855289EB66B2C165B1A`

## 2026-05-19 runInTerminal Follow-Up Fix

- Follow-up manual smoke found two uncovered runtime paths after commit `7fd7caab7f276494df9f404965c8a7e0bd2ad302`: direct `runInTerminal` could still show `^C`, and `execution_subagent` failed with `Stream must be set to true`.
- `execution_subagent` now uses the provider streaming path (`createMessageStream`) for its internal loop when available, aggregating streamed text/tool-call deltas into the normalized response blocks. This matches the main Agent loop and avoids OpenAI Codex/OAuth backends rejecting non-streaming `/responses` calls.
- Rich shell integration now handles stale idle prompt input by clearing the line with `Ctrl+U` and sending the command via `sendText`, instead of delegating to `runCommand` and letting it inject `Ctrl+C` at an idle prompt.
- Added focused regression coverage: `executionSubagent.test.ts` verifies the inner loop does not call non-streaming `createMessage` and still invokes `runInTerminal`; `richExecuteStrategy.test.ts` verifies stale prompt input does not send `Ctrl+C` and still returns command output.
- Updated `generate-director-patches.mjs` so Rich execute strategy runtime/test paths land in `007-director-tool-layer` instead of broad branding.
- Validation passed: `compile-check-ts-native`, `gulp compile-client`, browser tests for `executionSubagent.test.ts` and `richExecuteStrategy.test.ts`, plus replay `validate-series`, product override validation, expected contracts, and canonical manifest write+validate.

## 2026-05-17 Worker D Final Review Fixes

- Worker D fixed the final review items without committing or pushing: `validate-all.mjs --all-profiles` now fails fast when the active profile's generated tree is missing or product/package hashes do not match expected contracts, while non-active canonical profiles may still skip generated-tree deep checks with an explicit skipped summary.
- `.gitignore` now ignores `artifacts/` by default after confirming no tracked files exist under `artifacts/`, matching the project rule that local artifacts should not be accidentally committed.

## 2026-05-17 Worker A Validation Toolchain Fix

- Worker A observed branch `120-replay-baseline`; pre-fix dirty state only had untracked `artifacts/`.
- Task scope: make ordinary `expected-contracts.mjs` and `canonical-manifest.mjs` validation read-only by default, make report refresh opt-in via `--write` / `--write-report`, and clarify/fix `validate-all.mjs --all-profiles` so it traverses all profiles instead of active-only validation.
- Implementation is pending commit: `validate-all --all-profiles` now validates legacy profile artifacts, canonical profile series/product-overrides/allowlists/reports, and only runs generated-tree expected/canonical drift checks for profiles matching the current materialized `vscode.generated` tree.

## 2026-05-17 120 Review/Fix Memory Sync

- Worker D observed branch `120-replay-baseline`; pre-sync dirty state included untracked `artifacts/`, then other worker updates to `AGENTS.md` / `CLAUDE.md` Build And Package plus untracked `scripts/build-director-120-insider.ps1` and `.cmd`.
- `AGENTS.md` and `CLAUDE.md` now document the 120 Insider build entry points `scripts/build-director-120-insider.ps1` and `.cmd`, defaulting to `docs/upgrade/profiles/120-insider-win32-x64-client.json`; the older 116 scripts remain legacy/stable fallback.
- 120 review/fix notes to carry forward: canonical manifest drift must be treated as a reviewed source/build-output signal and cleared by regenerating or clean-materializing before final canonical validation; `validate-all` should be profile-driven for the active 120 profile rather than retaining 116-only report paths; runtime provider hardening belongs in Director-owned provider/model/auth code and replay patches, not generated-tree-only edits.
- Worker D only performed documentation/memory synchronization and light validation. The follow-up validation/provider hardening is pushed in commit `504deb1a06098d97f6c3271bb46c415139f8a9bb` (`fix: harden 120 replay validation and provider registry`).

## 2026-05-17 Documentation Split

- Current checkout path observed during this cleanup: `E:\Projects\Director-Code-batch\Director-Code-112-check`.
- Current branch observed during this cleanup: `120-replay-baseline`.
- `git status --short` showed only untracked `artifacts/` before edits.
- `docs/upgrade/profiles/index.json` still names `116-stable-win32-x64-client` as the active profile. Treat branch names and exploratory reports as signals, not canonical profile switches.
- `CLAUDE.md` and `AGENTS.md` were rewritten as the same project guide: overview, goals, direction, replay source rules, stage ownership, and standing work rules.
- The older guide content mixed durable project rules with phase memory and included corrupted text in several sections. The durable rules were consolidated into the two guide files; historical facts were moved or summarized here.

## 2026-05-17 Upcoming Upstream 120 Upgrade

- User stated the next immediate direction is to update upstream to version 120.
- Treat the current `120-replay-baseline` branch as aligned with that upcoming 120 upgrade effort, but still verify the active profile/control-plane state before making changes.
- Before coding 120-specific changes, inspect or create the 120 profile/series/reports as needed and make sure replay validation, expected contracts, product overrides, and canonical manifests are updated for the new upstream baseline.
- Do not assume the current 116 active profile has already been switched to 120 just because this branch exists; make the profile/control-plane transition explicit.

## 2026-05-17 Active 120 Insider Upgrade Plan

- Current active work is the 120 Insider upgrade. The detailed handoff and decisions are in `docs/upgrade/120-insider-upgrade-plan.md`.
- The 120 Insider upgrade is now replay-materialized through the Director layer, with expected contracts and canonical manifest captured.
- `docs/upgrade/profiles/index.json` now makes `120-insider-win32-x64-client` the active profile.
- `patches/series.120-insider.json` enables `001` through `009`; details and validation history are in the plan file.
- User decisions are captured in the plan file: keep Director Provider/Model UI, use 120 native Claude AgentHost with Director-owned policy/proxy/routing, map Plan Mode to 120 review UI while keeping `.director/plans`, and preserve user-visible Director branding.
- Immediate next step after this upgrade baseline is Phase 2 Wave 3 Claude AgentHost SDK integration or a 120 dependency/build/package pass, depending on user priority.

## 2026-05-16 Phase 2 Wave 2 Provider Registry Completed And Packaged

- Phase 2 Wave 2 Provider / Model Registry + UI is implemented, replay-backed, packaged, and pushed as part of follow-up commit `504deb1a06098d97f6c3271bb46c415139f8a9bb`.
- Director Provider Registry is the canonical source for provider instances and persists profile data in `directorCodeProviders.json`.
- VS Code `chatLanguageModels.json` is only a projected provider-group bridge.
- Model ids exposed to VS Code use `director-code/<providerInstanceId>/<modelId>`, allowing multiple instances of the same provider or compatible endpoint.
- Director Agent and Director language model provider resolve model/default/auth through provider instances, including SecretStorage API keys, env var API key references, OpenAI/Anthropic OAuth, base URL, custom headers, manual model lists, and legacy global-config lazy migration.
- Legacy `directorCode.ai.provider/model/baseURL/authVariant` is now a lazy migration/read-only fallback. The Provider Manager UI no longer uses the old single global provider path as its normal write path.
- VS Code Models Management remains reused with a thin Director hook for Manage/Add actions and a Director entitlement bypass for the `director-code` vendor.
- Replay assets updated: `patches/replay/004-director-agent-engine.116.patch`, `patches/replay/005-director-chat-built-in-mode.116.patch`, `patches/series.116.json`, `director-patches-report.json`, and `docs/upgrade/116-phase2-waves-plan.md`.
- New report/script:
  - `docs/upgrade/reports/116-stable-win32-x64-client/phase2-wave2-provider-registry-report.md`
  - `scripts/smoke/director-provider-oauth-smoke.ps1`
- Validation passed after clean replay materialization:
  - `node scripts/upgrade/validate-series.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `node scripts/upgrade/validate-product-overrides.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `node scripts/upgrade/expected-contracts.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `npm run compile-check-ts-native`
  - `npm run transpile-client`
  - provider registry/model/auth/api-key node tests
  - API-key browser DOM test
  - full package build with `scripts/build-director-116.ps1` without `-SkipReplay`
- Packaged artifacts:
  - `artifacts/out/stable/win32-x64/system-setup/Director-CodeSetup-x64-1.116.0.exe` sha256 `E600290AF3AFD9B2AA758DD2894160FA0C6AD8258DC802AC0E88B6C781FA72E2`
  - `artifacts/out/stable/win32-x64/user-setup/Director-CodeUserSetup-x64-1.116.0.exe` sha256 `DE2EB15C35827716B115F83F747A58B7C4141D82BFC8EC7978155166DF57289D`
- Manual API/OAuth smoke was intentionally deferred until after package/push. Use `scripts/smoke/director-provider-oauth-smoke.ps1` with a temp user data dir.
- Next wave: Phase 2 Wave 3 Claude AgentHost SDK Adapter unless the user chooses to manually smoke Wave 2 first.

## 2026-05-16 Director Architecture Boundary Accepted

- User accepted the architecture direction: `Director-owned core + thin VS Code bridge + replayed brand/product layer`.
- Current implementation is structurally acceptable because core runtime logic is concentrated mostly under `src/vs/workbench/contrib/directorCode/**`.
- Branding/product edits touch many files but are shallow and should not be confused with deep VS Code logic fork risk.
- Future behavior should default to Director-owned modules or future Director-owned built-in extensions.
- Upstream VS Code directories should keep only thin registration hooks, model/chat/tool adapters, command/menu wiring, and compatibility shims.
- Copilot is the reference shape: deep UX integration with product logic mostly in an extension-like island plus privileged workbench/API entry points.
- Provider/Model Registry, provider instances, secret/OAuth policy, provider manager UI, and model visibility state are Director-owned.
- Claude SDK, ACP, and Codex adapters should be plugin-like or adapter-like islands.
- When an upstream VS Code surface needs a change, prefer a small hook into Director-owned services over embedding Director business logic directly in upstream files.

## 2026-05-16 Phase 2 Wave 1 Plan Mode Completed And Packaged

- Phase 2 Wave 1 Plan Mode is implemented, replay-landed, committed, pushed, and packaged.
- Commit: `1940758b` (`feat: add director plan mode wave 1`) on `refactor/112-replay-baseline`.
- Plan Mode is a Director Agent/session state, not a new top-level `ChatModeKind`.
- Default remains full Agent mode; users enter/exit Plan from the Chat input secondary UI.
- Plan drafts are written by host code to workspace-local `.director/plans/*.md` with YAML frontmatter, short readable ids, stable sections, and host-managed statuses.
- Plan completion requires the Plan-only `director_present_plan` tool.
- The host rejects invalid schema, unknown fields, and `planMarkdown` containing frontmatter/status/path/cwd/root/write-target metadata. One Plan-only correction attempt is allowed.
- Review flow is Director-owned minimal Chat UI with Execute / Reject / Revise.
- Execute sends a new same-session Agent request with approved plan context and only exits Plan once that request is sent or queued-then-sent.
- Revise keeps planning and feeds user feedback back into the Plan flow.
- Plan tool allowlist: read context tools, `fetch`, and `director_present_plan` only. Edit, terminal/task, extension, subagent, and mutation tools are hidden from Plan.
- Replay assets updated: `patches/replay/004-director-agent-engine.116.patch`, `patches/replay/007-director-tool-layer.116.patch`, `patches/series.116.json`, `director-patches-report.json`, `materialize-report.json`, `expected-contracts-report.json`, and `docs/upgrade/116-phase2-waves-plan.md`.
- Validation passed:
  - `node scripts/upgrade/validate-series.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `node scripts/upgrade/validate-product-overrides.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `node scripts/upgrade/expected-contracts.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - clean materialize with `bash scripts/upgrade/materialize-vscode.sh --profile docs/upgrade/profiles/116-stable-win32-x64-client.json --target vscode.generated --up-to-layer director --force`
  - clean generated tree dependency restore with `npm ci`, passing on retry after a transient Windows native dependency file lock
  - `npm run compile-check-ts-native`
  - `npm run transpile-client`
  - `npm run test-browser -- --grep Director` (`100 passing`; upstream browser runner logged known long-referrer warnings)
  - full package build with `scripts/build-director-116.ps1` without `-SkipReplay`
- Installer artifacts:
  - `artifacts/out/stable/win32-x64/system-setup/Director-CodeSetup-x64-1.116.0.exe` sha256 `21155405981C5BADED22883A7962101195C3AFABCAFA60EA1F85D642796E40B2`
  - `artifacts/out/stable/win32-x64/user-setup/Director-CodeUserSetup-x64-1.116.0.exe` sha256 `4DEC8AC60533F5E2979B059863872A0D20AB67F27F7D9657959400C6D0A0DD64`
- Interactive installer/manual smoke was not run automatically to avoid modifying the user's installed app/profile.

## 2026-05-15 Phase 6 Replay Consolidation And Next-Version Dry Run

- Phase 6 replay consolidation completed for the 116 profile.
- `patches/series.116.json` has no `010` stage, no temporary local patch entry, and enabled Director semantic stages remain `002` through `009`.
- Full 116 validation passed from a clean replayed Director tree:
  - clean materialize
  - `validate-series`
  - `validate-product-overrides`
  - `canonical-manifest`
  - `expected-contracts`
  - `npm ci` after retrying a transient Windows native dependency file lock
  - `npm run compile-check-ts-native`
  - `npm run gulp -- transpile-client-esbuild`
  - focused browser tests for Director tool registry, read-only workspace tools, Chat Editing adapter, edit tools, and chat mode routing (`23 passing`)
  - commercial/name grep gate passed
- Next-version dry-run report added at `docs/upgrade/reports/117-stable-win32-x64-client/thin-layer-upgrade-dry-run-report.md`.
- Dry-run blocked before target materialization: VS Code `1.117.0` exists, but upstream VSCodium returned no matching `1.117*`, `1.118*`, `1.119*`, or `1.120*` stable tags. No 117 release profile or series was added.
- `artifacts/` remained untracked and must not be committed by default.

## 2026-05-15 Phase 5 Commercial/Name Grep Gate

- Phase 5 commercial/name grep gate and product/gallery/marketplace audit was implemented and replay-landed.
- Product default links, package repository/bugs metadata, Windows installer/admin copy, Windows resource metadata, chat setup/status/model-picker/customization copy, extension gallery wording, and safety/docs links now use Director-owned wording or Director-owned URLs unless explicitly allowlisted for OSS attribution or compatibility.
- Added:
  - `docs/upgrade/director-commercial-name-allowlist.116.md`
  - `docs/upgrade/reports/116-stable-win32-x64-client/commercial-name-grep-report.md`
- `extensions` is exposed as a read-only direct-reuse tool in Ask/Edit/Agent after the gate; `installExtensions` remains hidden as a mutation.
- Remaining product-specific Copilot documentation URLs and Copilot Free subscription comments were removed from touched chat sources to reduce future grep noise.
- Validation passed: clean materialize, replay/product/canonical/expected validation, `npm ci`, `compile-check-ts-native`, `transpile-client-esbuild`, Director tool registry node tests, and commercial/name grep gate.

## 2026-05-15 Phase 4 Edit Tools Internal Refactor

- Phase 4 edit tools internal refactor was implemented and replay-landed.
- Moved `directorChatEditingAdapter.ts` into `src/vs/workbench/contrib/directorCode/common/agentEngine/editing/`.
- Moved `directorEditTools.ts` into `src/vs/workbench/contrib/directorCode/common/agentEngine/editTools/`.
- Moved Chat Editing adapter and edit-tool tests into `src/vs/workbench/contrib/directorCode/test/common/agentEngine/`.
- `src/vs/workbench/contrib/chat/browser/agentEngine/editTools/directorEditTools.contribution.ts` remains a thin upstream chat registration hook.
- Model-facing edit names are unchanged: `apply_patch`, `createFile`, `createDirectory`, `replace_string_in_file`, and `multi_replace_string_in_file`.
- `scripts/upgrade/generate-director-patches.mjs` classifies the moved Director-owned editing/editTools paths into stages `008` and `009`.
- Clean replay validation passed, including canonical manifest, replay/product/expected validation, compile/transpile, and node tests (`21 passing`).

## 2026-05-15 Phase 3 Fetch/GitHub Facade Cutover

- Phase 3 `fetch`/`githubRepo` facade cutover was implemented and replay-landed.
- Model-facing `vscode_fetchWebPage_internal` changed to `fetch`, backed by VS Code URL/file fetch implementation and its approval behavior.
- `fetch` schema requires `urls` and accepts optional `query` only as caller intent text; it does not imply Copilot-style web search.
- Model-facing `github_repo` changed to `githubRepo`.
- The implementation remains Director-owned minimal read-only repository context and returns controlled unsupported output for remote indexed GitHub search.
- Legacy fetch/GitHub names are no longer model-facing; remaining raw ids are internal details or negative test assertions.

## 2026-05-14 Phase 6 Package Regression Pass

- Phase 6 non-destructive package/regression pass completed.
- `scripts/build-director-116.ps1` was run without `-SkipReplay`; it materialized from replay, installed dependencies, ran compile/core/min/package tasks, and produced both installers.
- Installer artifacts:
  - `artifacts/out/stable/win32-x64/system-setup/Director-CodeSetup-x64-1.116.0.exe` sha256 `DAF13D81BC9580443DC52BB3E700839983EAAB8649138733AD2B0208C793ACBB`
  - `artifacts/out/stable/win32-x64/user-setup/Director-CodeUserSetup-x64-1.116.0.exe` sha256 `A96A9259DFC943B7D53912F0C8A888C886E239EA72A99974D674D5BC44748764`
- `%APPDATA%\Director-Code\clp` was cleared before runtime smoke.
- Loose-build launch smoke used a temp profile under `artifacts/phase6-smoke`, observed expected Electron process tree, then terminated only processes for that temp profile.
- Replay/product validators passed after package build.
- Post-build canonical check drifted because build outputs add extension `dist/` files; clean materialize was rerun and canonical manifest validation then passed.
- Interactive installer/manual smoke was not run automatically to avoid modifying the user's installed app/profile.

## 2026-05-14 Phase 5 Ask/Edit/Inline Mode Routing

- Phase 5 Ask/Edit/Inline mode routing completed, replay-backed, clean-materialized, validated, and ready for commit/push.
- Runtime routing maps Ask/Edit/Agent/EditorInline through `directorChatModeRouting.ts`.
- Ask uses read-only Q&A policy.
- Edit uses reviewable edit tools.
- Agent remains the full autonomous harness.
- Inline exposes no model-callable tools.
- Inline uses selected editor context plus `DirectorChatEditingAdapter.emitInlineTextEdit()` to emit a real `textEdit` for inline requests.
- Replay ownership:
  - mode routing source in `004-director-agent-engine.116.patch`
  - Agent Customizations settings bridge in `005-director-chat-built-in-mode.116.patch`
  - inline edit adapter changes in `008-director-chat-editing.116.patch`
  - edit tool test compatibility updates in `009-director-edit-tools.116.patch`
- Report: `docs/upgrade/reports/116-stable-win32-x64-client/mode-routing-report.md`.
- Validation completed: clean materialize, `npm ci` after clearing stale Windows native build processes, `compile-check-ts-native`, `transpile-client-esbuild`, Director browser tests (`21 passing`), inline controller smoke (`2 passing`), replay validators, and canonical manifest validation.

## Durable 116 Facts To Remember

- 116 blank Workbench root cause: incomplete `defaultChatAgent.provider` override. VS Code 116 reads `defaultChatAgent.provider.enterprise.id`, so Director must keep the full provider object shape, with empty-string fields when disabling provider metadata.
- This fix belongs in `003-director-product-build-release.116.patch`, expected product JSON, and `validate-product-overrides.mjs`; do not fix only generated `product.json`.
- 116 NLS corruption was tied to language-pack/cache state and product metadata. Use Director-specific data folders and clear `%APPDATA%\Director-Code\clp` when needed for smoke.
- Build entry points are `scripts/build-director-116.ps1` and `scripts/build-director-116.cmd`.
- `-SkipReplay` is only for quick local debugging, never release candidate/package acceptance.
- Manual installer smoke is intentionally deferred unless the user explicitly asks, because it mutates the user's installed app/profile.
- `artifacts/` is usually untracked and should not be committed by default.

## Next Direction

- If continuing Phase 2 after Wave 2, default next wave is Wave 3 Claude AgentHost SDK Integration.
- Before coding Wave 3, use local VS Code main/Copilot/AgentHost evidence and the existing `docs/upgrade/116-phase2-waves-plan.md` direction.
- Wave 3 product goal: reuse VS Code main/Copilot Claude AgentHost shape where practical, while routing provider/model/auth/proxy/policy through Director-owned services.
- Claude SDK v1 main path should use a Director-owned Anthropic-compatible local proxy backed by Provider Registry, SecretStorage/OAuth, model selection, and Director policy.
- Do not expose non-`anthropicMessages` providers to Claude Agent picker in Wave 3 v1.
- ACP remains a later generic external-agent protocol wave.
- Codex remains a later dedicated decision wave.

## Standing Reminders

- Start every work session by checking the current branch and `git status --short`.
- Keep generated-tree changes temporary until replay-landed.
- Prefer minimal VS Code upstream hooks over embedded Director business logic.
- Do not revert user changes or unrelated dirty files.
- Keep `CLAUDE.md` and `AGENTS.md` identical.
