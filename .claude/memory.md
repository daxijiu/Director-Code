# Memory - 项目状态与上下文

## 2026-05-16 latest memory: Director architecture boundary principle accepted
- Current checkout: `E:\Projects\Director-Code-batch\Director-Code-112-check`; branch `refactor/112-replay-baseline`.
- User accepted the architecture direction: Director should be treated as `Director-owned core + thin VS Code bridge + replayed brand/product layer`.
- Current implementation is considered structurally OK: core runtime logic is already concentrated mostly under `src/vs/workbench/contrib/directorCode/**`; the many branding/product touched files are shallow and should not be confused with deep VS Code logic fork risk.
- Future work should default new behavior into Director-owned modules or future Director-owned built-in extensions. Upstream VS Code directories should keep only thin registration hooks, model/chat/tool surface adapters, command/menu wiring, and small compatibility shims.
- Copilot is the reference shape: deeply integrated UX, but product logic mostly lives in an extension-like island plus privileged workbench/API entry points. Director should keep moving toward that shape.
- Wave 2 Provider/Model Registry + UI must follow this rule: Director Provider Registry, provider instances, secret/OAuth policy, provider manager UI, and model visibility state are Director-owned; VS Code Models Management / Model Picker should be reused through provider-group metadata and minimal hooks.
- Claude SDK, ACP, and Codex adapters should be plugin-like or adapter-like islands. Workbench changes should stay limited to session registration, permissions/tool policy, UI entry points, and bridge plumbing.
- When an upstream VS Code surface needs changes, prefer a small hook into Director-owned services over embedding Director business logic directly in upstream files.

## 2026-05-16 latest memory: Phase 2 Wave 1 Plan Mode completed and packaged
- Current checkout: `E:\Projects\Director-Code-batch\Director-Code-112-check`; branch `refactor/112-replay-baseline`.
- Phase 2 Wave 1 Plan Mode is implemented, replay-landed, committed, pushed, and packaged. Commit: `1940758b` (`feat: add director plan mode wave 1`).
- Plan Mode is a Director Agent/session state, not a top-level `ChatModeKind`. The default remains full Agent mode; users enter/exit Plan from the Chat input secondary UI.
- Plan drafts are written by host code to workspace-local `.director/plans/*.md` with YAML frontmatter, short readable ids, stable sections, and host-managed statuses.
- Plan completion requires the Plan-only `director_present_plan` tool. Invalid schema, unknown fields, and `planMarkdown` containing frontmatter/status/path/cwd/root/write-target metadata are rejected and trigger at most one correction attempt.
- Review flow is Director-owned minimal Chat UI with Execute / Reject / Revise. Execute sends a new same-session Agent request with approved plan context and only exits Plan once that request is sent or queued-then-sent. Revise keeps planning and feeds user feedback back into the Plan flow.
- Plan tool allowlist: read context tools, `fetch`, and `director_present_plan` only. Edit, terminal/task, extension, subagent, and mutation tools are hidden from Plan.
- Replay assets updated: `patches/replay/004-director-agent-engine.116.patch`, `patches/replay/007-director-tool-layer.116.patch`, `patches/series.116.json`, `director-patches-report.json`, `materialize-report.json`, `expected-contracts-report.json`, and `docs/upgrade/116-phase2-waves-plan.md`.
- Validation passed:
  - `node scripts/upgrade/validate-series.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `node scripts/upgrade/validate-product-overrides.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `node scripts/upgrade/expected-contracts.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - clean materialize with `bash scripts/upgrade/materialize-vscode.sh --profile docs/upgrade/profiles/116-stable-win32-x64-client.json --target vscode.generated --up-to-layer director --force`
  - clean generated tree dependency restore with `npm ci` passed on retry after a transient Windows native dependency file lock.
  - `npm run compile-check-ts-native`
  - `npm run transpile-client`
  - `npm run test-browser -- --grep Director` (`100 passing`; upstream browser runner logged known long-referrer warnings)
  - full package build with `scripts/build-director-116.ps1` without `-SkipReplay`
- Installer artifacts:
  - `artifacts/out/stable/win32-x64/system-setup/Director-CodeSetup-x64-1.116.0.exe` sha256 `21155405981C5BADED22883A7962101195C3AFABCAFA60EA1F85D642796E40B2`
  - `artifacts/out/stable/win32-x64/user-setup/Director-CodeUserSetup-x64-1.116.0.exe` sha256 `4DEC8AC60533F5E2979B059863872A0D20AB67F27F7D9657959400C6D0A0DD64`
- Interactive installer/manual smoke was not run automatically to avoid modifying the user's installed app/profile.
- Next wave: Phase 2 Wave 2 Provider / Model Registry + UI. Before code, refresh or add the Provider/Model UI research report with local OpenCode and local VS Code main evidence, then settle the minimum VS Code 116 model-management backport/adaptation surface.
- Note: after the Wave 1 push, `docs/upgrade/116-phase2-waves-plan.md` has separate uncommitted Wave 2 plan refinements in the working tree; do not accidentally mix or revert them without user intent.

## 2026-05-15 latest memory: Phase 6 replay consolidation completed; next-version dry-run blocked by upstream availability
- Current checkout: `E:\Projects\Director-Code-batch\Director-Code-112-check`; branch `refactor/112-replay-baseline`.
- Active plan: `docs/upgrade/director-thin-layer-refactor-plan-v2.md`.
- Phase 6 replay consolidation is complete for the 116 profile.
- Final replay consolidation status: `patches/series.116.json` has no `010` stage, no temporary local patch entry, and enabled Director semantic stages remain `002` through `009`.
- Full 116 validation passed from a clean replayed Director tree:
  - `bash scripts/upgrade/materialize-vscode.sh --profile docs/upgrade/profiles/116-stable-win32-x64-client.json --target vscode.generated --up-to-layer director --force`
  - `node scripts/upgrade/validate-series.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `node scripts/upgrade/validate-product-overrides.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `node scripts/upgrade/canonical-manifest.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `node scripts/upgrade/expected-contracts.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - clean generated tree dependency restore with `npm ci` passed on retry after a transient Windows native dependency file lock.
  - `npm run compile-check-ts-native`
  - `npm run gulp -- transpile-client-esbuild`
  - `npm run test-browser-no-install -- --grep "Director (Tool Registry|Read-Only Workspace Tools|Chat Editing Adapter|Edit Tools|Chat Mode Routing)"` (`23 passing`; upstream browser runner logged known long-referrer warnings)
  - commercial/name grep gate after clean replay: product/build scoped allowlisted hits `29`, chat forbidden commercial hits `0`, extensions forbidden commercial hits `0`, chat/extensions scoped allowlisted hits `729`
- Canonical manifest and materialize report were corrected to match the clean replay output for the final Phase 5 follow-up edits.
- Next-version dry-run report added at `docs/upgrade/reports/117-stable-win32-x64-client/thin-layer-upgrade-dry-run-report.md`.
- Dry-run status: blocked before target materialization. VS Code `1.117.0` exists (`10c8e557c8b9f9ed0a87f61f1c9a44bde731c409`), but upstream VSCodium returned no `1.117*`, `1.118*`, `1.119*`, or `1.120*` stable tags. No 117 release profile or series was added.
- `artifacts/` remains untracked and must not be committed by default.
- Remaining external follow-up: when VSCodium publishes a matching 1.117+ stable tag, create a dry-run-only target profile and run the documented 117 materialization/conflict comparison.

## 2026-05-15 latest memory: Phase 5 commercial/name grep gate completed
- Current checkout: `E:\Projects\Director-Code-batch\Director-Code-112-check`; branch `refactor/112-replay-baseline`.
- Active plan: `docs/upgrade/director-thin-layer-refactor-plan-v2.md`.
- Phase 5 commercial/name grep gate and product/gallery/marketplace audit is implemented and replay-landed.
- Product default links, package repository/bugs metadata, Windows installer/admin copy, Windows resource metadata, chat setup/status/model-picker/customization copy, extension gallery wording, and safety/docs links now use Director-owned wording or Director-owned URLs unless explicitly allowlisted for OSS attribution or compatibility.
- Added `docs/upgrade/director-commercial-name-allowlist.116.md` and `docs/upgrade/reports/116-stable-win32-x64-client/commercial-name-grep-report.md`.
- `extensions` is now exposed as a read-only direct-reuse tool in Ask/Edit/Agent after the commercial/name gate; `installExtensions` remains hidden as a mutation.
- Removed remaining product-specific Copilot documentation URLs and Copilot Free subscription comments from touched chat sources to reduce future grep noise.
- Replay assets updated: `patches/replay/002-director-branding.116.patch`, `003`, `004`, `005`, `006`, `007`, `patches/series.116.json`, canonical manifest, expected contracts, product overrides/owned keys, director patch/materialize/contract reports, `tool-migration-report.md`, and `director-surface-inventory.md`.
- Validation passed:
  - `bash scripts/upgrade/materialize-vscode.sh --profile docs/upgrade/profiles/116-stable-win32-x64-client.json --target vscode.generated --up-to-layer director --force`
  - `node scripts/upgrade/validate-series.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `node scripts/upgrade/validate-product-overrides.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `node scripts/upgrade/canonical-manifest.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `node scripts/upgrade/expected-contracts.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - clean generated tree dependency restore with `npm ci`
  - `npm run compile-check-ts-native`
  - `npm run gulp -- transpile-client-esbuild`
  - `npm run test-node -- --run src/vs/workbench/contrib/chat/test/common/agentEngine/directorToolRegistry.test.ts` (`9 passing`)
  - commercial/name grep gate: product/build scoped allowlisted hits `29`, chat forbidden commercial hits `0`, extensions forbidden commercial hits `0`, chat/extensions scoped allowlisted hits `729`
- `artifacts/` remains untracked and must not be committed by default.
- Next wave: Phase 6 final clean replay/regression dry-run from the thin-layer plan; keep the commercial/name grep gate blocking for every subsequent wave.

## 2026-05-15 latest memory: Phase 4 edit tools internal refactor completed
- Current checkout: `E:\Projects\Director-Code-batch\Director-Code-112-check`; branch `refactor/112-replay-baseline`.
- Active plan: `docs/upgrade/director-thin-layer-refactor-plan-v2.md`.
- Phase 4 edit tools internal refactor is implemented and replay-landed.
- Moved `directorChatEditingAdapter.ts` from `src/vs/workbench/contrib/chat/common/agentEngine/editing/` to `src/vs/workbench/contrib/directorCode/common/agentEngine/editing/`.
- Moved `directorEditTools.ts` from `src/vs/workbench/contrib/chat/common/agentEngine/editTools/` to `src/vs/workbench/contrib/directorCode/common/agentEngine/editTools/`.
- Moved Chat Editing adapter and edit-tool tests into `src/vs/workbench/contrib/directorCode/test/common/agentEngine/`.
- `src/vs/workbench/contrib/chat/browser/agentEngine/editTools/directorEditTools.contribution.ts` remains as the thin upstream chat registration hook and imports the Director-owned implementation.
- Model-facing edit names are unchanged: `apply_patch`, `createFile`, `createDirectory`, `replace_string_in_file`, and `multi_replace_string_in_file`.
- `scripts/upgrade/generate-director-patches.mjs` now classifies moved `directorCode/common/agentEngine/editing/*` as `008` and `directorCode/common/agentEngine/editTools/*` as `009`, preserving the existing semantic replay stages.
- Replay assets updated: `patches/replay/004-director-agent-engine.116.patch`, `patches/replay/008-director-chat-editing.116.patch`, `patches/replay/009-director-edit-tools.116.patch`, `patches/series.116.json`, canonical manifest, director patch/materialize/contract reports, `chat-editing-contract-report.md`, `edit-tools-report.md`, `mode-routing-report.md`, `tool-migration-report.md`, and `director-surface-inventory.md`.
- Clean replay validation passed:
  - `bash scripts/upgrade/materialize-vscode.sh --profile docs/upgrade/profiles/116-stable-win32-x64-client.json --target vscode.generated --up-to-layer director --force`
  - `node scripts/upgrade/canonical-manifest.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json --write`
  - `node scripts/upgrade/canonical-manifest.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `node scripts/upgrade/validate-series.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `node scripts/upgrade/validate-product-overrides.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `node scripts/upgrade/expected-contracts.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - clean generated tree dependency restore with `npm ci`; first attempt hit Windows native rebuild file locks and the retry passed.
  - `npm run compile-check-ts-native`
  - `npm run gulp -- transpile-client-esbuild`
  - `npm run test-node -- --run src/vs/workbench/contrib/directorCode/test/common/agentEngine/directorChatEditingAdapter.test.ts --run src/vs/workbench/contrib/directorCode/test/common/agentEngine/directorEditTools.test.ts --run src/vs/workbench/contrib/chat/test/common/agentEngine/directorToolRegistry.test.ts` (`21 passing`)
- `artifacts/` remains untracked and must not be committed by default.
- Next wave: Phase 5 commercial/name grep gate and product/gallery/marketplace audit; keep `extensions` hidden unless that gate passes and product policy is documented.

## 2026-05-15 latest memory: Phase 3 fetch/GitHub facade cutover completed
- Current checkout: `E:\Projects\Director-Code-batch\Director-Code-112-check`; branch `refactor/112-replay-baseline`.
- Active plan: `docs/upgrade/director-thin-layer-refactor-plan-v2.md`.
- Phase 3 `fetch`/`githubRepo` facade cutover is implemented and replay-landed.
- Model-facing `vscode_fetchWebPage_internal` changed to `fetch`, backed by the existing VS Code URL/file fetch implementation and its pre/post approval behavior. The `fetch` schema requires `urls` and accepts optional `query` only as caller intent text; it does not imply Copilot-style web search.
- Model-facing `github_repo` changed to `githubRepo`. The implementation remains Director-owned minimal read-only repository context and returns controlled unsupported output for remote indexed GitHub search.
- The old fetch/GitHub legacy names are no longer model-facing; remaining raw ids are internal implementation details or negative test assertions.
- Replay assets updated: `patches/replay/007-director-tool-layer.116.patch`, `patches/series.116.json`, canonical manifest, director patch/materialize/contract reports, `tool-migration-report.md`, `mode-routing-report.md`, and `director-surface-inventory.md`.
- Clean replay validation passed:
  - `bash scripts/upgrade/materialize-vscode.sh --profile docs/upgrade/profiles/116-stable-win32-x64-client.json --target vscode.generated --up-to-layer director --force`
  - `node scripts/upgrade/canonical-manifest.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json --write`
  - `node scripts/upgrade/canonical-manifest.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `node scripts/upgrade/validate-series.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `node scripts/upgrade/validate-product-overrides.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `node scripts/upgrade/expected-contracts.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - clean generated tree dependency restore with `npm ci`
  - `npm run compile-check-ts-native`
  - `npm run gulp -- transpile-client-esbuild`
  - `npm run test-node -- --run src/vs/workbench/contrib/chat/test/common/agentEngine/directorToolRegistry.test.ts --run src/vs/workbench/contrib/chat/test/common/agentEngine/directorReadOnlyTools.test.ts` (`17 passing`)
- `artifacts/` remains untracked and must not be committed by default.
- Next wave: continue Phase 3/5 remaining final-tool disposition work from the plan, especially hidden `extensions` preparation and product/gallery/marketplace grep gate before any model-facing exposure.

## 2026-05-15 latest memory: Phase 3 create tool facade cutover completed
- Current checkout: `E:\Projects\Director-Code-batch\Director-Code-112-check`; branch `refactor/112-replay-baseline`.
- Active plan: `docs/upgrade/director-thin-layer-refactor-plan-v2.md`.
- Phase 3 `createFile`/`createDirectory` facade cutover is implemented and replay-landed.
- Model-facing edit tool names changed from `create_file` and `create_directory` to `createFile` and `createDirectory`.
- The old snake_case create tool names are no longer in the Director registry/model-facing tests. Internal raw ids `director_create_file` and `director_create_directory` remain implementation details.
- Schemas now use `createFile.filePath` plus `content`, and `createDirectory.dirPath`. Implementations keep a defensive internal fallback for old `path` payloads but do not expose old model names.
- `apply_patch`, `replace_string_in_file`, and `multi_replace_string_in_file` remain Director-only model-facing names by plan.
- Replay assets updated: `patches/replay/007-director-tool-layer.116.patch`, `patches/replay/009-director-edit-tools.116.patch`, `patches/series.116.json`, canonical manifest, director patch/materialize/contract reports, `tool-migration-report.md`, `mode-routing-report.md`, and `director-surface-inventory.md`.
- Clean replay validation passed:
  - `node scripts/upgrade/canonical-manifest.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `node scripts/upgrade/validate-series.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `node scripts/upgrade/validate-product-overrides.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `node scripts/upgrade/expected-contracts.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - clean generated tree dependency restore with `npm ci`
  - `npm run compile-check-ts-native`
  - `npm run gulp -- transpile-client-esbuild`
  - `npm run test-node -- --run src/vs/workbench/contrib/chat/test/common/agentEngine/directorToolRegistry.test.ts --run src/vs/workbench/contrib/chat/test/common/agentEngine/directorEditTools.test.ts` (`14 passing`)
- `artifacts/` remains untracked and must not be committed by default.
- Next wave: Phase 3 fetch/GitHub facade handling; re-review the `github_repo` temporary legacy exception and fetch naming boundary.

## 2026-05-15 latest memory: Phase 3 read/search/context tool module extraction completed
- Current checkout: `E:\Projects\Director-Code-batch\Director-Code-112-check`; branch `refactor/112-replay-baseline`.
- Active plan: `docs/upgrade/director-thin-layer-refactor-plan-v2.md`.
- Phase 3 read/search/context tool module extraction is implemented and replay-landed.
- `directorReadOnlyTools.ts` and `directorToolRegistry.ts` moved from `src/vs/workbench/contrib/chat/common/agentEngine/` to `src/vs/workbench/contrib/directorCode/common/agentEngine/`.
- `src/vs/workbench/contrib/chat/browser/agentEngine/directorReadOnlyTools.contribution.ts` remains as the thin upstream chat registration hook and imports the Director-owned implementation.
- Director Agent code, tool bridge, mode routing, and tests now import the registry/read-only tools through `directorCode/common/agentEngine`.
- Replay assets updated: `patches/replay/004-director-agent-engine.116.patch`, `patches/replay/007-director-tool-layer.116.patch`, `patches/series.116.json`, canonical manifest, director patch/materialize/contract reports, `tool-migration-report.md`, and `director-surface-inventory.md`.
- `scripts/upgrade/generate-director-patches.mjs` now classifies the moved `directorCode/common/agentEngine/directorReadOnlyTools.ts` and `directorToolRegistry.ts` as `tool-layer`, preserving the plan's semantic replay stage.
- Clean replay validation passed:
  - `node scripts/upgrade/validate-series.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `node scripts/upgrade/validate-product-overrides.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `node scripts/upgrade/expected-contracts.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `bash scripts/upgrade/materialize-vscode.sh --profile docs/upgrade/profiles/116-stable-win32-x64-client.json --target vscode.generated --up-to-layer director --force`
  - `node scripts/upgrade/canonical-manifest.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json --write`
  - `node scripts/upgrade/canonical-manifest.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - clean generated tree required `npm ci`; first attempt hit a Windows native rebuild file lock and passed after stopping stale `MSBuild`/`link` processes.
  - `npm run compile-check-ts-native`
  - `npm run gulp -- transpile-client-esbuild`
  - `npm run test-node -- --run src/vs/workbench/contrib/chat/test/common/agentEngine/directorToolRegistry.test.ts --run src/vs/workbench/contrib/chat/test/common/agentEngine/directorReadOnlyTools.test.ts --run src/vs/workbench/contrib/chat/test/common/agentEngine/directorChatModeRouting.test.ts` (`20 passing`)
- `artifacts/` remains untracked and must not be committed by default.
- Next wave: Phase 3 `createFile`/`createDirectory` facade cutover from `create_file`/`create_directory`; keep `apply_patch`, `replace_string_in_file`, and `multi_replace_string_in_file` unchanged.

## 2026-05-15 latest memory: Phase 3 read/search/context facade cutover wave completed
- Current checkout: `E:\Projects\Director-Code-batch\Director-Code-112-check`; branch `refactor/112-replay-baseline`.
- Active plan: `docs/upgrade/director-thin-layer-refactor-plan-v2.md`.
- Phase 3 read/search/context facade wave is implemented and replay-landed.
- Model-facing read/search/context tool names changed from `read_file`, `list_dir`, `file_search`, `grep_search`, `get_errors`, `get_changed_files`, and `view_image` to `readFile`, `listDirectory`, `fileSearch`, `textSearch`, `problems`, `changes`, and `viewImage`.
- Old snake_case names for those seven tools are no longer in the Director registry/model-facing tests. Internal `director_*` tool ids remain as implementation details.
- The implementations remain Director-owned and workspace guarded. Schema/behavior updates include `readFile.filePath`, `viewImage.filePath`, `textSearch.isRegexp/includePattern/excludePattern/includeIgnoredFiles`, `problems.filePaths`, and `changes.repositoryPath/sourceControlState`.
- `github_repo` remains the only temporary legacy exception and must be re-reviewed in the next relevant Phase 3 wave.
- Replay assets updated: `patches/replay/004-director-agent-engine.116.patch`, `patches/replay/007-director-tool-layer.116.patch`, `patches/series.116.json`, canonical manifest, director patch/materialize/contract reports, `tool-migration-report.md`, `mode-routing-report.md`, and `director-surface-inventory.md`.
- Clean replay validation passed:
  - `node scripts/upgrade/validate-series.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `node scripts/upgrade/validate-product-overrides.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `node scripts/upgrade/expected-contracts.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `bash scripts/upgrade/materialize-vscode.sh --profile docs/upgrade/profiles/116-stable-win32-x64-client.json --target vscode.generated --up-to-layer director --force`
  - `node scripts/upgrade/canonical-manifest.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json --write`
  - `node scripts/upgrade/canonical-manifest.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - clean generated tree required `npm ci`.
  - `npm run compile-check-ts-native`
  - `npm run gulp -- transpile-client-esbuild`
  - `npm run test-node -- --run src/vs/workbench/contrib/chat/test/common/agentEngine/directorToolRegistry.test.ts --run src/vs/workbench/contrib/chat/test/common/agentEngine/directorReadOnlyTools.test.ts --run src/vs/workbench/contrib/chat/test/common/agentEngine/agentEngine.test.ts --run src/vs/workbench/contrib/chat/test/common/agentEngine/endToEnd.test.ts` (`87 passing`)
- `artifacts/` remains untracked and must not be committed by default.
- Next wave: continue Phase 3 with the remaining accepted facade/direct-reuse work, starting with `createFile`/`createDirectory` or fetch/GitHub facade handling according to the plan.

## 2026-05-15 latest memory: Phase 3 direct-reuse tool allowlist wave 1 completed
- Current checkout: `E:\Projects\Director-Code-batch\Director-Code-112-check`; branch `refactor/112-replay-baseline`.
- Active plan: `docs/upgrade/director-thin-layer-refactor-plan-v2.md`.
- Phase 3 direct-reuse wave 1 implemented and replay-landed.
- Agent allowlist additions: VS Code core browser tools `clickElement`, `dragElement`, `handleDialog`, `hoverElement`, `navigatePage`, `openBrowserPage`, `readPage`, `runPlaywrightCode`, `screenshotPage`, `typeInPage`, plus retained extension tool `renderMermaidDiagram`.
- `extensions` remains hidden until Phase 5 product/gallery/marketplace wording policy and commercial/name grep gate.
- Director bridge now injects `preToolUseResult: ask` for browser mutation/interaction tools and conservative page read/screenshot access, so global VS Code auto-approve does not bypass Director policy on this path.
- Replay assets updated: `patches/replay/004-director-agent-engine.116.patch`, `patches/replay/007-director-tool-layer.116.patch`, `patches/series.116.json`, canonical manifest, director patch/materialize/contract reports, `tool-migration-report.md`, and `director-surface-inventory.md`.
- Clean replay validation passed:
  - `node scripts/upgrade/validate-series.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `node scripts/upgrade/validate-product-overrides.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `node scripts/upgrade/expected-contracts.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `bash scripts/upgrade/materialize-vscode.sh --profile docs/upgrade/profiles/116-stable-win32-x64-client.json --target vscode.generated --up-to-layer director --force`
  - `node scripts/upgrade/canonical-manifest.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json --write`
  - `node scripts/upgrade/canonical-manifest.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - clean generated tree required `npm ci`; first attempts hit Windows native rebuild file locks, succeeded after stopping stale `node-gyp`/`MSBuild`/`link` processes.
  - `npm run compile-check-ts-native`
  - `npm run gulp -- transpile-client-esbuild`
  - `npm run test-node -- --run src/vs/workbench/contrib/chat/test/common/agentEngine/directorToolRegistry.test.ts` (`9 passing`)
  - `npm run test-browser-no-install -- --grep "Director VSCodeToolBridge"` (`3 passing`; browser runner emitted known long-referrer warnings)
- `artifacts/` remains untracked and must not be committed by default.
- Next wave: Phase 3 read/search/context facade cutover (`readFile`, `listDirectory`, `fileSearch`, `textSearch`, `problems`, `changes`, `viewImage`) with old snake_case names removed in the same wave.

## 2026-05-15 latest memory: Phase 3 tool facade research accepted
- Current checkout: `E:\Projects\Director-Code-batch\Director-Code-112-check`; branch `refactor/112-replay-baseline`.
- Active plan: `docs/upgrade/director-thin-layer-refactor-plan-v2.md`.
- User accepted the Phase 3 tool facade research report after reviewing the Chinese HTML version.
- `docs/upgrade/reports/116-stable-win32-x64-client/tool-facade-research.md` status changed to `accepted`.
- Chinese confirmation companion: `docs/upgrade/reports/116-stable-win32-x64-client/tool-facade-research.zh.html`.
- `director-surface-inventory.md` now records the accepted hard gate.
- Next wave: start Phase 3 implementation with direct-reuse registry/allowlist for VS Code core browser tools and retained `renderMermaidDiagram`, while keeping `extensions` hidden until Phase 5.
- `artifacts/` remains untracked and must not be committed by default.

## 2026-05-14 latest memory: Phase 3 tool facade research pending review
- Current checkout: `E:\Projects\Director-Code-batch\Director-Code-112-check`; branch `refactor/112-replay-baseline`.
- Active plan: `docs/upgrade/director-thin-layer-refactor-plan-v2.md`.
- Phase 3 hard-gate research report produced: `docs/upgrade/reports/116-stable-win32-x64-client/tool-facade-research.md`.
- Report status is `pending-review`; do not implement tool facade cutovers, direct-reuse allowlist changes, browser tool exposure, or model-facing tool renames until the user explicitly accepts the report and the status is changed to `accepted`.
- The report has one final disposition table covering all 48 VS Code UI tools. Local self-check confirmed all 48 expected tool names are present.
- Documentation validation passed: `git diff --check`, `node scripts/upgrade/validate-series.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`, and the 48-tool/status self-check.
- The report keeps `apply_patch`, `replace_string_in_file`, and `multi_replace_string_in_file` unchanged and outside Copilot `editFiles` parity.
- The report proposes direct reuse for VS Code core browser tools and `renderMermaidDiagram`, Director facade cutover for read/search/create/fetch/githubRepo tools, and `defer-hidden` for notebook/memory/newWorkspace/runCommand/vscodeAPI/codebase/searchResults/githubTextSearch-class tools.
- `director-surface-inventory.md` was updated to list `tool-facade-research.md` as a current report and record the pending-review hard gate.
- `artifacts/` remains untracked and must not be committed by default.
- Next step: wait for explicit user acceptance of `tool-facade-research.md`. After acceptance, update its status to `accepted`, commit that status change, then start Phase 3 implementation waves.

## 2026-05-14 latest memory: thin-layer Phase 2 wave 4 completed
- Current checkout: `E:\Projects\Director-Code-batch\Director-Code-112-check`; branch `refactor/112-replay-baseline`.
- Active plan: `docs/upgrade/director-thin-layer-refactor-plan-v2.md`.
- Phase 2 module extraction wave 4 completed: browser Agent contribution/UI code moved from `src/vs/workbench/contrib/chat/browser/agentEngine/` to `src/vs/workbench/contrib/directorCode/browser/agentEngine/`.
- Moved files: `agentEngine.contribution.ts`, `apiKeysWidget.ts`, `auxiliaryModelSelection.ts`, `directorCodeAgent.ts`, `directorCodeModelProvider.ts`, `directorCodeSettingsEditor.ts`, `messageNormalization.ts`, `oauthWidget.ts`, `progressBridge.ts`, `providerSettingsWidget.ts`, `toolBridge.ts`, and `media/directorCodeSettings.css`.
- `src/vs/workbench/contrib/chat/browser/agentEngine/` now only retains `directorReadOnlyTools.contribution.ts` and `editTools/directorEditTools.contribution.ts`, which are intentionally deferred to the Phase 3/4 tool/edit waves.
- `chat.contribution.ts`, chat built-in-mode files, and Agent Engine tests now import browser Agent code through `directorCode/browser/agentEngine`.
- Replay assets updated: `patches/replay/004-director-agent-engine.116.patch`, `patches/replay/005-director-chat-built-in-mode.116.patch`, `patches/series.116.json`, canonical manifest, director patch/materialize/contract reports, and `director-surface-inventory.md`.
- Clean replay validation passed:
  - `node scripts/upgrade/validate-series.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `node scripts/upgrade/validate-product-overrides.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `node scripts/upgrade/expected-contracts.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `bash scripts/upgrade/materialize-vscode.sh --profile docs/upgrade/profiles/116-stable-win32-x64-client.json --target vscode.generated --up-to-layer director --force`
  - `node scripts/upgrade/canonical-manifest.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json --write`
  - `node scripts/upgrade/canonical-manifest.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - clean generated tree required `npm ci`; the first run hit a Windows native-module lock and succeeded after stopping the stale `node-gyp`/`MSBuild` processes and rerunning.
  - `npm run compile-check-ts-native`, `npm run compile`, targeted node Agent browser/common tests passed with `115 passing`, and targeted browser `apiKeysWidget` + `chatModelPicker` tests passed with `45 passing`.
- `artifacts/` remains untracked and must not be committed by default.
- Next wave: Phase 3 hard gate. Produce `docs/upgrade/reports/116-stable-win32-x64-client/tool-facade-research.md` with `Status: pending-review` and wait for explicit user acceptance before any tool facade/allowlist implementation.

## 2026-05-14 latest memory: thin-layer Phase 2 wave 3 completed
- Current checkout: `E:\Projects\Director-Code-batch\Director-Code-112-check`; branch `refactor/112-replay-baseline`.
- Active plan: `docs/upgrade/director-thin-layer-refactor-plan-v2.md`.
- Phase 2 module extraction wave 3 completed: Agent loop/runtime common code moved from `src/vs/workbench/contrib/chat/common/agentEngine/` to `src/vs/workbench/contrib/directorCode/common/agentEngine/`.
- Moved files: `agentEngine.ts`, `builtInModeUtil.ts`, `compact.ts`, `directorChatModeRouting.ts`, `retry.ts`, and `tokens.ts`.
- `src/vs/workbench/contrib/chat/common/agentEngine/` now only retains read-only tool registry/implementation plus edit/editing subdirs. `directorChatModeRouting.ts` intentionally imports upstream chat mode/request types and the still chat-path `directorToolRegistry` hook.
- Replay assets updated: `patches/replay/002-director-branding.116.patch`, `patches/replay/004-director-agent-engine.116.patch`, `patches/replay/005-director-chat-built-in-mode.116.patch`, `patches/series.116.json`, canonical manifest, director patch/materialize/contract reports, and `director-surface-inventory.md`.
- Clean replay validation passed:
  - `bash scripts/upgrade/materialize-vscode.sh --profile docs/upgrade/profiles/116-stable-win32-x64-client.json --target vscode.generated --up-to-layer director --force`
  - `node scripts/upgrade/canonical-manifest.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json --write`
  - `node scripts/upgrade/canonical-manifest.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `node scripts/upgrade/validate-series.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `node scripts/upgrade/validate-product-overrides.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `node scripts/upgrade/expected-contracts.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - clean generated tree required `npm ci`, then `npm run compile-check-ts-native`, `npm run compile`, targeted common runtime node tests passed with `172 passing`, `errorHandling.test.ts` passed separately with `20 passing` after a transient timeout in the combined run, and `chatModelPicker` browser test passed with `41 passing`.
- `artifacts/` remains untracked and must not be committed by default.
- Next wave: move remaining `src/vs/workbench/contrib/chat/browser/agentEngine/` browser Agent contribution/UI files into `src/vs/workbench/contrib/directorCode/browser/agentEngine/`, leaving `chat.contribution.ts` as the thin registration hook and keeping tool/edit files for Phase 3/4.

## 2026-05-14 latest memory: thin-layer Phase 2 wave 2 completed
- Current checkout: `E:\Projects\Director-Code-batch\Director-Code-112-check`; branch `refactor/112-replay-baseline`.
- Active plan: `docs/upgrade/director-thin-layer-refactor-plan-v2.md`.
- Phase 2 module extraction wave 2 completed: provider/BYOK/OAuth/model resolver/settings common code moved from `src/vs/workbench/contrib/chat/common/agentEngine/` to `src/vs/workbench/contrib/directorCode/common/agentEngine/`.
- Moved files: `apiKeyService.ts`, `authStateService.ts`, `fetchUtils.ts`, `geminiAuth.ts`, `modelCatalog.ts`, `modelResolver.ts`, `oauthLoginController.ts`, `oauthService.ts`, `settingsWriteQueue.ts`, and `providers/*`.
- `agentEngineTypes.ts` now imports provider types locally from `./providers/providerTypes.js`; browser/common/test code imports the moved group through `directorCode/common/agentEngine`.
- Replay assets updated: `patches/replay/004-director-agent-engine.116.patch`, `patches/series.116.json`, `docs/upgrade/manifests/116-stable-win32-x64-client.canonical.json`, `director-patches-report.json`, `materialize-report.json`, and `director-surface-inventory.md`.
- Clean replay validation passed:
  - `bash scripts/upgrade/materialize-vscode.sh --profile docs/upgrade/profiles/116-stable-win32-x64-client.json --target vscode.generated --up-to-layer director --force`
  - `node scripts/upgrade/canonical-manifest.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json --write`
  - `node scripts/upgrade/canonical-manifest.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `node scripts/upgrade/validate-series.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `node scripts/upgrade/validate-product-overrides.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `node scripts/upgrade/expected-contracts.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - clean generated tree required `npm ci`, then `npm run compile-check-ts-native`, `npm run compile`, targeted provider/auth/model node tests passed with `435 passing`, and `apiKeysWidget` browser test passed with `4 passing`.
- `artifacts/` remains untracked and must not be committed by default.
- Next wave: continue Phase 2 by moving the remaining Agent loop/runtime/browser UI pieces into `directorCode`, while leaving upstream chat contribution/service files as thin hooks.

## 2026-05-14 latest memory: thin-layer Phase 2 wave 1 completed
- Current checkout: `E:\Projects\Director-Code-batch\Director-Code-112-check`; branch `refactor/112-replay-baseline`.
- Active plan: `docs/upgrade/director-thin-layer-refactor-plan-v2.md`.
- Phase 2 module extraction wave 1 completed: `agentEngineTypes.ts` moved from `src/vs/workbench/contrib/chat/common/agentEngine/` to `src/vs/workbench/contrib/directorCode/common/agentEngine/`.
- All Agent Engine/browser/test imports now reference the new `directorCode/common/agentEngine/agentEngineTypes.js` path. The moved type file temporarily imports `providerTypes.js` from the remaining chat-path provider implementation; move providers/BYOK as a coherent next wave.
- Replay assets updated: `patches/replay/004-director-agent-engine.116.patch`, `patches/replay/007-director-tool-layer.116.patch`, `patches/series.116.json`, `docs/upgrade/manifests/116-stable-win32-x64-client.canonical.json`, `director-patches-report.json`, `materialize-report.json`, and `director-surface-inventory.md`.
- Clean replay validation passed:
  - `bash scripts/upgrade/materialize-vscode.sh --profile docs/upgrade/profiles/116-stable-win32-x64-client.json --target vscode.generated --up-to-layer director --force`
  - `node scripts/upgrade/canonical-manifest.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json --write`
  - `node scripts/upgrade/canonical-manifest.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `node scripts/upgrade/validate-series.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `node scripts/upgrade/validate-product-overrides.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `node scripts/upgrade/expected-contracts.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - clean generated tree required `npm ci` after materialize, then `npm run compile-check-ts-native`, `npm run compile`, and targeted `npm run test-node -- --run ...agentEngine.test.ts --run ...progressBridge.test.ts --run ...compact.test.ts` passed with `61 passing`.
- `artifacts/` remains untracked and must not be committed by default.
- Next wave: Phase 2 provider/BYOK/settings extraction into `src/vs/workbench/contrib/directorCode/`, preserving existing semantic patch stages and leaving upstream chat files as thin hooks.

## 2026-05-14 latest memory: thin-layer Phase 1 inventory completed
- Current checkout: `E:\Projects\Director-Code-batch\Director-Code-112-check`; branch `refactor/112-replay-baseline`.
- Active plan: `docs/upgrade/director-thin-layer-refactor-plan-v2.md`.
- Phase 1 Baseline And Surface Inventory completed.
- New report: `docs/upgrade/reports/116-stable-win32-x64-client/director-surface-inventory.md`.
- The report records the current 116 baseline, accepted tool strategy report, package regression installer hashes, untracked `artifacts/` summary-only inventory, replay patch inventory, current Director-owned logic under chat paths, current upstream chat/agent hook files, and `directorCode/` replay stage mapping.
- Current upstream chat/agent hook files that need careful Phase 2 handling include `chat.contribution.ts`, `languageModelToolsService.ts`, `chatAgents.ts`, chat setup/status/model picker files, Agent Customizations bridge files, and prompt validator wording.
- Phase 1 validation passed:
  - `node scripts/upgrade/validate-series.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `node scripts/upgrade/validate-product-overrides.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `node scripts/upgrade/expected-contracts.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
- No code/replay patch changes were made in Phase 1. `artifacts/` remains untracked and must not be committed by default.
- Next wave: Phase 2 Director Module Extraction. Start by moving Director-owned agent harness/provider/BYOK/message normalization/progress/mode/settings/editing-adapter code toward `src/vs/workbench/contrib/directorCode/` in small groups while keeping upstream chat files as thin hooks.

## 2026-05-14 latest memory: thin-layer plan hardening accepted
- Current checkout: `E:\Projects\Director-Code-batch\Director-Code-112-check`; branch `refactor/112-replay-baseline`.
- Active plan remains `docs/upgrade/director-thin-layer-refactor-plan-v2.md`.
- Latest plan hardening clarifies browser tool safety: browser mutation/interaction tools require Director-level pre-approval that global auto-approve settings cannot bypass.
- `readPage` and `screenshotPage` require domain/session approval unless they operate on the current user-opened Director browser session.
- `runPlaywrightCode` audit is limited to the tool invocation result/chat transcript by default; no separate persistent log is added unless a future policy requires it.
- `tool-facade-research.md` must carry `Status: pending-review` and be changed to `Status: accepted` after explicit user approval before Phase 3 implementation starts.
- `extensions` may only get hidden Phase 3 research/registry preparation; model-facing exposure waits for Phase 5 product/gallery/marketplace wording policy and commercial/name grep gate approval.
- Phase 1 artifact inventory is summary-only: record top-level purpose, key installer hashes when relevant, and non-commit policy; do not produce or commit full generated artifact file lists.
- Validation order is fixed: run full 116 validation after the refactor, run it again before the 117/next-version dry-run, then run target profile validators after the dry-run.
- `artifacts/` remains untracked and must not be committed by default.

## 2026-05-14 latest memory: thin-layer refactor planning wave accepted
- Current checkout: `E:\Projects\Director-Code-batch\Director-Code-112-check`; branch `refactor/112-replay-baseline`.
- Active plan: `docs/upgrade/director-thin-layer-refactor-plan-v2.md`.
- Deprecated plan retained for history: `docs/upgrade/director-thin-layer-refactor-plan.md`.
- Accepted tool strategy report: `docs/upgrade/reports/116-stable-win32-x64-client/tool-source-and-strategy-analysis.html`.
- Prior broad comparison report retained for reference: `docs/upgrade/reports/116-stable-win32-x64-client/tool-parity-analysis.html`.
- The v2 plan keeps replay/profile/canonical manifest as release truth, keeps VSCodium as the lower layer, and moves Director-owned business logic toward `src/vs/workbench/contrib/directorCode/` while leaving upstream chat/agent files as thin hooks.
- Tool governance is source-based rather than full Copilot parity. VS Code core tools are reused directly where possible; Copilot extension metadata is only a static reference for model-facing names/schemas when Director owns the implementation.
- `tool-facade-research.md` is now a hard gate before Phase 3 tool code changes; it must be accepted before any tool facade cutover, browser exposure, direct-reuse allowlist change, or model-facing rename.
- The plan includes a final 48-tool disposition table. `renderMermaidDiagram` is a direct allowlist of the retained Mermaid extension. Browser tools are direct VS Code core reuse with Director registry policy, pre-approval for mutation/interaction, and `runPlaywrightCode` audit requirements.
- `createFile`/`createDirectory` migration and snake_case cutover belong to Phase 3. Phase 4 only keeps `apply_patch`, `replace_string_in_file`, and `multi_replace_string_in_file` as Director-owned edit primitives; `editFiles` remains hidden.
- `fetch` only promises current Director URL/file fetch capability. `githubRepo` only promises limited Director repo context and must explicitly reject/limit Copilot-style remote indexed search. `githubTextSearch` remains hidden until runtime source/id/schema evidence exists.
- `extensions` is a Phase 3 direct-reuse candidate but cannot be exposed until product/gallery/marketplace wording policy is documented and the commercial/name grep gate passes.
- Execution protocol: every completed wave updates `.claude/memory.md`, commits, pushes, and then continues. This planning package is treated as the first completed planning wave after documentation self-check.
- `artifacts/` remains untracked and must not be committed by default.

## 2026-05-14 latest memory: 116 package regression Phase 6 automated pass
- Current checkout: `E:\Projects\Director-Code-batch\Director-Code-112-check`; branch `refactor/112-replay-baseline`.
- Phase 6 package/regression automated pass completed after Phase 5 commit `788fe9d7 Add 116 Director mode routing and inline edits` was pushed.
- Build command: `.\scripts\build-director-116.ps1` without `-SkipReplay`.
- Build script completed materialize, dependency install, TypeScript compile check, core CI build, minified win32-x64 build, Inno updater metadata, system installer, and user installer.
- Installer outputs:
  - `artifacts/out/stable/win32-x64/system-setup/Director-CodeSetup-x64-1.116.0.exe`
    - size `162327831`
    - sha256 `DAF13D81BC9580443DC52BB3E700839983EAAB8649138733AD2B0208C793ACBB`
  - `artifacts/out/stable/win32-x64/user-setup/Director-CodeUserSetup-x64-1.116.0.exe`
    - size `162328197`
    - sha256 `A96A9259DFC943B7D53912F0C8A888C886E239EA72A99974D674D5BC44748764`
- Runtime smoke:
  - Cleared `%APPDATA%\Director-Code\clp`.
  - Checked packaged `product.json` keeps full `defaultChatAgent.provider` object shape with `default.id = director-code` and empty enterprise/google/apple ids preserved.
  - Launched loose build `vscode.generated/layers/director/VSCode-win32-x64/Director-Code.exe` with temp user-data/extensions under `artifacts/phase6-smoke`; observed 7 Director-Code Electron processes; terminated only processes matching that temp profile.
- Replay validation after package build:
  - `validate-series` passed.
  - `validate-product-overrides` passed.
  - `expected-contracts` passed.
  - Build-output canonical drift was expected because extension `dist/` files are generated by packaging, not canonical source.
  - Clean `materialize-vscode.sh --force` was rerun after package smoke, and `canonical-manifest.mjs` passed.
- Interactive installer/manual smoke was not run automatically to avoid changing the user's installed app/profile. The installer artifacts are ready for user acceptance.
- `artifacts/` remains untracked and must not be committed by default; it contains the installer outputs and temp smoke profile.

## 2026-05-14 latest memory: 116 mode routing Phase 5 completed
- Current checkout: `E:\Projects\Director-Code-batch\Director-Code-112-check`; branch `refactor/112-replay-baseline`.
- `docs/upgrade/116-inline-mermaid-runtime-regression-fix-plan.md` Phase 5 Ask/Edit/Inline mode routing is implemented, replay-landed, clean-materialized, and validated.
- Director now registers Ask/Edit/Agent panel modes. Runtime routing uses `directorChatModeRouting.ts`: Ask is read-only Q&A, Edit uses reviewable edit tools, Agent remains full autonomous mode, and EditorInline maps to Inline even if the UI sends Ask/Edit mode metadata.
- Inline v1 uses selected editor context from `locationData`, asks for replacement text only, parses fenced/plain/`<replacement>` responses, and emits a real `textEdit` with `DirectorChatEditingAdapter.emitInlineTextEdit()`. Inline has no model-callable tools.
- Attached context variables are summarized into the user message in `messageNormalization.ts`; VS Code mode instructions are appended to the system prompt without duplication.
- Agent Customizations integration is present: the Director Code section opens `director-code.openSettings`, and the Director model provider descriptor uses the same management command.
- Phase 5 replay ownership note: mode routing and agent request plumbing are in `004-director-agent-engine.116.patch`; the settings/customizations bridge remains in `005-director-chat-built-in-mode.116.patch`; inline edit adapter changes are in `008-director-chat-editing.116.patch`; test compatibility updates are in `009-director-edit-tools.116.patch`.
- Phase 5 reports/docs updated:
  - `docs/upgrade/reports/116-stable-win32-x64-client/mode-routing-report.md`
  - `docs/upgrade/reports/116-stable-win32-x64-client/tool-migration-report.md`
  - `docs/upgrade/116-agent-customizations-director-settings-plan.md`
- Validation completed from clean replay:
  - `bash scripts/upgrade/materialize-vscode.sh --profile docs/upgrade/profiles/116-stable-win32-x64-client.json --target vscode.generated --up-to-layer director --force`
  - `npm ci` after clearing stale Windows native `node-gyp` / `MSBuild` / `link` processes from a file-lock failure
  - `npm run compile-check-ts-native`
  - `npm run gulp -- transpile-client-esbuild`
  - `npm run test-browser-no-install -- --grep "Director (Tool Registry|Read-Only Workspace Tools|Chat Editing Adapter|Edit Tools|Chat Mode Routing)"` -> `21 passing`
  - `npm run test-browser-no-install -- --grep "hover mode sendRequest"` -> `2 passing`
  - `validate-series`, `validate-product-overrides`, `expected-contracts`
  - canonical manifest write and validation
- `artifacts/` remains untracked build/validation output and must not be committed by default. `node_modules` must not be committed.
- Next wave: Phase 6 package/regression. Run `scripts/build-director-116.ps1` or `.cmd` without `-SkipReplay`, clear `%APPDATA%\Director-Code\clp` before packaged runtime smoke, then record package/manual-smoke status.


## 2026-05-14 最新记忆：116 reviewable edit tools Phase 4 已完成

- 当前 checkout: `E:\Projects\Director-Code-batch\Director-Code-112-check`，当前分支 `refactor/112-replay-baseline`。
- `docs/upgrade/116-inline-mermaid-runtime-regression-fix-plan.md` 的 Phase 4 Reviewable Edit Tools gate 已完成、replay-land、clean replay 验证通过。
- Phase 4 新增 replay stage：`patches/replay/009-director-edit-tools.116.patch`；active profile、`patches/series.116.json`、canonical manifest、director patch report 和 generator classification 已同步。
- Phase 4 同时更新了既有 replay stages：
  - `004-director-agent-engine.116.patch`：新增 edit tools contribution import hook。
  - `007-director-tool-layer.116.patch`：registry 允许 reviewable edit tools 在 Edit/Agent，Ask/Inline 仍禁用；registry 测试补齐。
  - `008-director-chat-editing.116.patch`：`DirectorChatEditingAdapter` 增加可复用 workspace target 解析和 directory review command progress。
- 新增 Director-owned model-facing tools：
  - `apply_patch`
  - `create_file`
  - `create_directory`
  - `replace_string_in_file`
  - `multi_replace_string_in_file`
- 核心实现：
  - `src/vs/workbench/contrib/chat/common/agentEngine/editTools/directorEditTools.ts`
  - `src/vs/workbench/contrib/chat/browser/agentEngine/editTools/directorEditTools.contribution.ts`
  - `src/vs/workbench/contrib/chat/test/common/agentEngine/directorEditTools.test.ts`
- 行为边界：
  - 所有文本/文件编辑工具都通过 Phase 3 `DirectorChatEditingAdapter.emitSingleFileTextEdit()` 发 reviewable `textEdit` start/progress/done，不直接写文件。
  - `apply_patch` v1 支持保守 unified diff hunks，hunk 不匹配返回 controlled error，v1 不支持 delete。
  - `create_file` 默认拒绝重复文件，除非显式 `overwrite: true`。
  - `replace_string_in_file` 默认要求唯一匹配；多重匹配需要 `replaceAll: true`。
  - `multi_replace_string_in_file` 拒绝重叠 replacement ranges。
  - `create_directory` 走 Director-owned pending transaction + accept/reject chat command buttons；accept 前不调用 `mkdir`，reject/cancel 不修改文件系统。
- Phase 4 报告：
  - `docs/upgrade/reports/116-stable-win32-x64-client/edit-tools-report.md`
  - `docs/upgrade/reports/116-stable-win32-x64-client/tool-migration-report.md` 已更新 Phase 1-4 allowlists 和 migration table。
- Phase 4 已通过验证：
  - `node scripts/upgrade/validate-series.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `node scripts/upgrade/validate-product-overrides.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `node scripts/upgrade/expected-contracts.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - clean `bash scripts/upgrade/materialize-vscode.sh --profile docs/upgrade/profiles/116-stable-win32-x64-client.json --target vscode.generated --up-to-layer director --force`
  - clean replay 后第一次 `npm ci` 因 Windows native rebuild 文件锁失败；清理残留 `node-gyp` / `MSBuild` / compiler 进程后重试通过。
  - `npm run compile-check-ts-native`
  - `npm run gulp -- transpile-client-esbuild`
  - targeted tests：`directorToolRegistry.test.ts` + `directorReadOnlyTools.test.ts` + `directorChatEditingAdapter.test.ts` + `directorEditTools.test.ts`，共 `25 passing`
  - `node scripts/upgrade/canonical-manifest.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
- 下一波从 Phase 5 Ask/Edit/Inline mode gate 开始：Ask/Edit/Agent runtime routing、Inline 非 tool 编辑协议、Director settings / Agent Customizations 入口收口。Inline 仍不得暴露 model-callable edit tools。
- `artifacts/` 仍是未跟踪构建/验证产物，不要默认提交；`node_modules` 不要提交。

## 2026-05-14 最新记忆：116 Chat Editing contract Phase 3 已完成

- 当前 checkout: `E:\Projects\Director-Code-batch\Director-Code-112-check`，当前分支 `refactor/112-replay-baseline`。
- `docs/upgrade/116-inline-mermaid-runtime-regression-fix-plan.md` 的 Phase 3 Chat Editing contract gate 已完成、replay-land、clean replay 验证通过。
- Phase 3 新增 replay stage：`patches/replay/008-director-chat-editing.116.patch`；active profile、`patches/series.116.json`、canonical manifest、director patch report 和 generator classification 已同步。
- 核心实现：`src/vs/workbench/contrib/chat/common/agentEngine/editing/directorChatEditingAdapter.ts`。
  - `DirectorChatEditingAdapter` 只通过 `chatSessionResource` + `chatRequestId` 解析目标 chat request；缺失或找不到 request 会返回 controlled error，不回退到 `getRequests().at(-1)`。
  - 单文件文本编辑 response parts 顺序为：可选 `markdownContent` explanation、`codeblockUri` with `isEdit: true`、`textEdit` start、`textEdit` progress、`textEdit` done。
  - VS Code 116 会把 `textEdit` progress 合并成 `textEditGroup`，由 `ChatEditingService` 观察并启动 reviewable Chat Editing UI diff。
  - `DirectorInternalSingleFileEditProbe` 仅是内部 probe/测试 harness，没有注册成 model-visible tool、command、settings、menu 或 chat tool。
  - `formatDirectorChatEditToolResult()` 为后续 Phase 4 edit tools 提供 compact success/error text result。
- 契约报告：`docs/upgrade/reports/116-stable-win32-x64-client/chat-editing-contract-report.md`。
  - 明确记录 116 panel Chat Editing 的 `textEdit` -> `textEditGroup` -> `ChatEditingService.startStreamingEdits()` 路径。
  - 明确记录 `workspaceEdit` 在 116 的原生实现只处理 file deletion；directory creation 不能原生生成目录 diff。
  - Phase 4 `create_directory` 必须走 Director-owned review transaction：先生成 pending transaction + accept/reject chat command buttons，accept 后再 `IFileService.createFolder`，reject/no-op，不做静默 mkdir。
  - EditorInline 仍需 Phase 5 单独实现 inline session binding；panel Chat Editing contract 不能替代 inline。
- Phase 3 已通过验证：
  - `node scripts/upgrade/validate-series.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `node scripts/upgrade/validate-product-overrides.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `node scripts/upgrade/expected-contracts.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - clean `bash scripts/upgrade/materialize-vscode.sh --profile docs/upgrade/profiles/116-stable-win32-x64-client.json --target vscode.generated --up-to-layer director --force`
  - clean replay 后 `npm ci`
  - `npm run compile-check-ts-native`
  - `npm run gulp -- transpile-client-esbuild`
  - targeted tests：`directorToolRegistry.test.ts` + `directorReadOnlyTools.test.ts` + `directorChatEditingAdapter.test.ts`，共 `19 passing`
  - `node scripts/upgrade/canonical-manifest.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
- 下一波从 Phase 4 reviewable edit tools 开始：`apply_patch`、`create_file`、`create_directory`、`replace_string_in_file`、`multi_replace_string_in_file`。不要暴露任何不能复用 Phase 3 reviewable contract 的写入/编辑工具。
- `artifacts/` 仍是未跟踪构建/验证产物，不要默认提交；clean materialize 后 generated tree 仍需 `npm ci` 才能跑编译和测试。

## 2026-05-14 最新记忆：116 read-only tools Phase 2 已完成

- 当前 checkout: `E:\Projects\Director-Code-batch\Director-Code-112-check`，当前分支 `refactor/112-replay-baseline`。
- `docs/upgrade/116-inline-mermaid-runtime-regression-fix-plan.md` 的 Phase 2 read-only workspace tools / GitHub v1 gate 已完成、replay-land、测试通过。
- Phase 2 新增 Director-owned model-facing 工具：`read_file`、`list_dir`、`file_search`、`grep_search`、`get_errors`、`get_changed_files`、`view_image`、`github_repo`。
- 核心落点：
  - `src/vs/workbench/contrib/chat/common/agentEngine/directorReadOnlyTools.ts`：8 个 read-only 工具实现和 tool data。
  - `src/vs/workbench/contrib/chat/browser/agentEngine/directorReadOnlyTools.contribution.ts`：注册工具到 `ILanguageModelToolsService` 和 read tool set。
  - `src/vs/workbench/contrib/chat/browser/agentEngine/agentEngine.contribution.ts`：仅增加注册 contribution 的 import hook。
  - `src/vs/workbench/contrib/chat/common/agentEngine/directorToolRegistry.ts`：将 8 个工具纳入 Ask/Edit/Agent read allowlist，Inline 仍无工具。
  - `src/vs/workbench/contrib/chat/test/common/agentEngine/directorReadOnlyTools.test.ts` 与 `directorToolRegistry.test.ts`：覆盖工具声明、workspace path rejection、读取/列目录、search query、diagnostics、SCM、image data、GitHub sanitized remote/fallback 和 allowlist。
- 安全/范围口径：
  - `read_file` / `list_dir` / `view_image` 只接受当前 workspace 内路径；workspace 外路径直接拒绝，不做隐式外部读取。
  - 文本读取有 byte cap 和 binary rejection；目录/search/diagnostics/SCM 输出有 result cap。
  - `file_search` / `grep_search` 走 VS Code search service；`get_errors` 走 marker service；`get_changed_files` 走 SCM resource groups，不直接 shell `git status`。
  - `github_repo` v1 只做 owner/repo 或 workspace `.git/config` GitHub remote 推断，输出 sanitized URL；remote indexed search、PR/issue mutation、Copilot parity 均返回 controlled not-supported/fallback。
- Replay/control-plane 落点：
  - `patches/replay/007-director-tool-layer.116.patch` 更新为包含 Phase 1 registry 和 Phase 2 read-only tools。
  - `patches/replay/004-director-agent-engine.116.patch` 仅包含注册 hook 的小改动。
  - 同步更新 `patches/series.116.json`、`docs/upgrade/manifests/116-stable-win32-x64-client.canonical.json`、116 reports、`tool-migration-report.md`、`scripts/upgrade/generate-director-patches.mjs` 分类。
- Phase 2 已通过 clean replay 验证：`validate-series`、`validate-product-overrides`、`expected-contracts`、clean `materialize-vscode`、canonical manifest validation、`npm run compile-check-ts-native`、`npm run gulp -- transpile-client-esbuild`、targeted tests `14 passing`。
- clean materialize 后仍需 `npm ci` 恢复依赖才能在 generated tree 跑编译/测试；不要提交 `node_modules`。当前未跟踪 `artifacts/` 仍是构建/验证产物，不要默认纳入 Git。
- 下一波从 Phase 3 开始：Chat Editing contract、reviewable edit progress、shared edit adapter、`create_directory` review transaction。不要在 Phase 3 reviewable edit contract 之前暴露 write/edit/create/delete 工具。

## 2026-05-14 最新记忆：116 tool registry Phase 1 已完成

- 当前 checkout: `E:\Projects\Director-Code-batch\Director-Code-112-check`，当前分支 `refactor/112-replay-baseline`。
- 用户已在 Phase 0 packaged-build acceptance 后明确要求继续后续阶段；`docs/upgrade/116-inline-mermaid-runtime-regression-fix-plan.md` 的 Phase 1 tool registry / mode policy gate 已完成、replay-land、测试通过。
- Phase 1 核心落点：
  - 新增 `src/vs/workbench/contrib/chat/common/agentEngine/directorToolRegistry.ts`，集中维护 Director 工具的 model-facing name、内部 tool id、schema、read/write/execute 分类、允许模式、确认策略和迁移处置。
  - `src/vs/workbench/contrib/chat/browser/agentEngine/toolBridge.ts` 改为消费 registry-filtered allowlist，不再直接把未审查的 `toolsService.getTools()` 全量暴露给模型。
  - `src/vs/workbench/contrib/chat/browser/agentEngine/directorCodeAgent.ts` 明确以 `DirectorToolMode.Agent` 初始化工具 bridge 和模型工具定义。
  - 新增 `src/vs/workbench/contrib/chat/test/common/agentEngine/directorToolRegistry.test.ts`，覆盖 Ask 无写/执行工具、Agent 保留 terminal/task 工具、内部 edit/rename/new workspace 隐藏或 defer、unknown snapshot 标记。
- Phase 1 迁移报告：`docs/upgrade/reports/116-stable-win32-x64-client/tool-migration-report.md`。报告记录 raw/current tool 迁移表和 Ask/Edit/Agent/Inline computed allowlists；内容应保持 deterministic、sanitized，不包含 token、绝对用户路径或 volatile timestamp。
- Replay/control-plane 落点：
  - 新增 `patches/replay/007-director-tool-layer.116.patch`。
  - 更新 `patches/replay/004-director-agent-engine.116.patch` 以承载 agent bridge 调用点变化。
  - 更新 `docs/upgrade/profiles/116-stable-win32-x64-client.json`、`patches/series.116.json`、`docs/upgrade/manifests/116-stable-win32-x64-client.canonical.json` 和 116 reports。
  - 更新 `scripts/upgrade/generate-director-patches.mjs` / `scripts/upgrade/generate-series.mjs`：known stages 与 profile-enabled stages 分离，新增 `tool-layer`、`chat-editing`、`edit-tools` exact stage 解析和 path classification；known-but-disabled stage 会明确失败，不静默丢文件。
- Phase 1 已通过验证：`npm run compile-check-ts-native`、`npm run gulp -- transpile-client-esbuild`、`node test/unit/node/index.js --run src/vs/workbench/contrib/chat/test/common/agentEngine/directorToolRegistry.test.ts`、`validate-series`、`validate-product-overrides`、`expected-contracts`、clean `materialize-vscode`、canonical manifest validation。
- clean materialize 后生成目录的 `node_modules` 曾被移除并已通过 `npm ci` 恢复；不要把依赖目录纳入提交。当前未跟踪 `artifacts/` 仍是构建/验证产物，不要默认纳入 Git。
- Phase 2 read-only workspace tools 和 GitHub v1 gate 已完成；后续从 Phase 3 Chat Editing contract 开始。

## 2026-05-14 最新记忆：116 Mermaid runtime Phase 0 已完成

- 当前 checkout 仍是 `E:\Projects\Director-Code-batch\Director-Code-112-check`，当前分支 `refactor/112-replay-baseline`。
- `docs/upgrade/116-inline-mermaid-runtime-regression-fix-plan.md` 的 Phase 0 runtime hotfix 已按用户要求实施、replay-land、完整打包，并由用户实际验证通过。
- 已推送提交：`ce2ed24a Fix 116 Mermaid language model runtime regression` 到 `origin/refactor/112-replay-baseline`。
- Phase 0 修复内容：
  - `isProposedApiEnabled()` 恢复为精确检查 `extension.enabledApiProposals.includes(proposal)`，不再“声明任意 proposal 就放行全部 proposal”。
  - `ExtHostLanguageModelTools.getTools()` 的工具 API object shape 使用 `chatParticipantAdditions` gating，不再误用 `chatParticipantPrivate`。
  - `ExtHostLanguageModels.getLanguageModelByIdentifier()` / `selectLanguageModels()` 增加缺失模型恢复保护：恢复只尝试一次、失败后记录、重复 warning 去重、恢复异常返回 unavailable，不再递归刷日志。
  - `vscode.mermaid-chat-features` 只声明 `chatOutputRenderer` 时不会收到 `chatParticipantAdditions` 行为，也不会因为 Mermaid 工具 DTO 的 `modelId` 附带 `options.model` 触发 LanguageModelProxy 缺失模型风暴。
- 新增回归测试：`src/vs/workbench/api/test/common/extHostLanguageModelRuntime.test.ts`，覆盖 exact proposal gating、Mermaid-like extension 不获 chatParticipantAdditions、缺失模型恢复不递归、恢复异常 bounded、`selectLanguageModels()` 不递归恢复。目标 browser test 为 5 passing。
- Replay 落点：`patches/replay/004-director-agent-engine.116.patch`；同时更新了 `patches/series.116.json`、`docs/upgrade/manifests/116-stable-win32-x64-client.canonical.json`、`docs/upgrade/reports/116-stable-win32-x64-client/*` 和 `scripts/upgrade/generate-director-patches.mjs` 的 runtime path 分类。
- 已通过验证：`validate-series`、`validate-product-overrides`、`expected-contracts`、clean `materialize-vscode`、canonical manifest validation、`compile-check-ts-native`、`transpile-client-esbuild`、targeted browser test。
- 完整安装包已用 `.\scripts\build-director-116.ps1` 构建，未用 `-SkipReplay`。输出：
  - `artifacts/out/stable/win32-x64/system-setup/Director-CodeSetup-x64-1.116.0.exe`
  - `artifacts/out/stable/win32-x64/user-setup/Director-CodeUserSetup-x64-1.116.0.exe`
- 用户已确认安装包实际测试通过。Phase 0 视为完成；用户随后已明确要求进入后续阶段，Phase 1 tool registry / mode policy gate 也已完成。后续继续从 Phase 2 开始。
- 当前工作区仍可能有未跟踪 `artifacts/` 安装包产物；这些产物不要默认纳入 Git。

## 2026-05-13 当前最高优先级记忆

- 当前 checkout: `E:\Projects\Director-Code-batch\Director-Code-112-check`。
- 当前主线已进入 116 replay/P2 工作：从 VS Code `1.116.0` + VSCodium `1.116.02821` 生成 Director Code 116，并在此基础上继续修复 runtime、chat modes、tools 和 packaging。
- 112 物理参考验证已经完成。116 及后续升级不会再有物理参考目录，正确性来源是 replay、expected contracts、targeted tests、compile/build smoke 和用户 packaged-build 手动验证。
- 最重要的源码规则：`vscode.generated/layers/director/vscode` 只是 materialized 调试/验证工作区，可以临时直接改；任何要保留的 Director 修改最终必须落到 `patches/replay/*.116.patch`、`patches/series.116.json`、active profile、expected/report/manifest 或 generator classification 中。不能只改生成后的源码树就算完成。
- 当前 116 profile: `docs/upgrade/profiles/116-stable-win32-x64-client.json`。
- 当前 repeatable build 入口: `scripts/build-director-116.ps1` 和 `scripts/build-director-116.cmd`。`-SkipReplay` 只用于快速调试，不可作为 release candidate 验收路径。
- 当前 116 patch stages:
  - `001-vscodium-layer.116.patch`: VSCodium aggregate layer。
  - `002-director-branding.116.patch`: 品牌/资源/文本/产品体验漂移。
  - `003-director-product-build-release.116.patch`: product/package/server manifest、gulp、Windows installer、release/build wiring。
  - `004-director-agent-engine.116.patch`: Director agent harness、model/tool bridge、agent engine、language-model/tool service integration、MCP agent paths。
  - `005-director-chat-built-in-mode.116.patch`: built-in chat mode、Copilot commercial-flow bypass、chat setup/status/model picker/agent session UI。
  - `006-director-text-polish.116.patch`: 小范围文本/prompt polish。
- 当前新增 stage：`007-director-tool-layer.116.patch` 已用于 Phase 1。计划中的后续 stages：`008-director-chat-editing.116.patch`，必要时 `009-director-edit-tools.116.patch`。
- 116 空白 Workbench 修复已经 replay 化：根因是 `defaultChatAgent.provider` 覆盖不完整，VS Code 116 启动读 `provider.enterprise.id`；修复保留完整 provider object shape，落在 `003-director-product-build-release.116.patch`、expected product JSON 和 `validate-product-overrides.mjs`。后续 product/default-agent 修改必须保留这个 contract。
- Director settings 入口要并入 VS Code 116 的 Agent Customizations 界面，计划文件是 `docs/upgrade/116-agent-customizations-director-settings-plan.md`。
- 当前大优化计划是 `docs/upgrade/116-inline-mermaid-runtime-regression-fix-plan.md`：覆盖 Mermaid runtime、inline chat、Ask/Edit/Agent mode routing、Chat Editing UI、工具层复刻、GitHub v1 read-only repo context。
- GitHub tooling 本轮只承诺 Director 自有只读 repo context/search，不承诺 Copilot remote-index 等价。成熟 Git/GitHub 工具后续单独迭代。
- `create_directory` 是本轮必须实现的 edit tool；如果 VS Code 116 原生 Chat Editing UI 不能表达目录创建，允许 Director-owned accept/reject transaction，但必须可 review/reject。

## 项目基本信息
- **项目名**: Director-Code（开源 VS Code fork）
- **状态**: Phase 1 + 1.5 + 1.5+ 的代码与测试基线已形成历史基础；当前 checkout 的工作重心是 **P2/116 replay upgrade 与 116 runtime/chat/tool 优化**。旧 `docs/director-code-remediation-plan-v2.md` 仍是 Phase 1 收口历史上下文，但当前执行以 116 replay 文档和当前计划为准。
- **目标**: 替换内置 Copilot AI Agent，支持用户自配 LLM + OAuth 登录
- **当前工作目录**: `E:\Projects\Director-Code-batch\Director-Code-112-check`
- **当前 active workspace**: `vscode.generated/layers/director/vscode`，仅作生成后调试/验证工作区
- **canonical source**: 116 replay control plane，包括 profile、series、`patches/replay/*.116.patch`、expected/reports/manifests 和 `scripts/upgrade/`
- **测试**: 479+ 个全部通过（A 批次新增测试后 486+，B1-2 后 432 个 agentEngine 测试全通过）
- **Git**: 每次工作必须以实际 `git status --short` 和当前分支为准，不要从旧记忆推断分支状态

## Phase 1 收口修复进度（Batch A 完成 2026-04-30）

### Batch A: P0 安全边界与状态一致性 ✅ 全部完成
- **A1** ✅ `languageModelToolsService.ts` — `_resolveRequest()` helper 统一 request 绑定，替换 3 处 `.at(-1)`
- **A4a** ✅ `mcpSamplingService.ts` — `.has()` 改 `.get()===true`，Not Now 不再误判为已允许
- **A4b** ✅ `agentEngine.contribution.ts` — 删除 `_enableToolAutoApprove()`，回归 VS Code permissionLevel 机制
- **A3** ✅ `agentEngine.ts` — pendingTools Map 多工具聚合、JSON 重试、max_tokens 续写改进、compact 成功判定、slot 保序、thinking 过滤
- **A2** ✅ `agentEngine.ts` + `retry.ts` + `toolBridge.ts` + `directorCodeAgent.ts` — abortSignal 传递、try-finally + lastCompleteTurnEnd、cancellable sleep、CancellationToken 监听、cancelled 终态

### Batch B 进度（P1 认证链、模型链、历史上下文链与产品元数据）
- **B4-1** ✅ 根 `product.json` 整块新增 `defaultChatAgent`（30+ 字段）+ 4 个顶层字段 + `prepare_vscode.sh` stable 补 `dataFolderName` + L47/L49 三源对称兜底
- **B4-2** ✅ `builtInModeUtil.ts` 新建 + `chatSetupContributions.ts` setup 命令族 guard + growth session skip + checkExtensionInstallation guard
- **B4-3** ✅ `mainThreadLanguageModelTools.ts` isBuiltinTool 与 contribution 侧 proposal fallback 对齐
- **B4-4** ✅ `chatStatusEntry.ts` / `chatStatusDashboard.ts` / `chatStatusWidget.ts` / `chatUsageWidget.ts` / `chatQuotaExceededPart.ts` / `chatManagementEditor.ts` / `chatManagementEditorInput.ts` — status/quota/management UI guards (neutral icon+label, skip upgrade/quota/sign-in sections)
- **B4-5** ✅ chatGettingStarted + chatWidget + chatQuick + agentSessionsWelcome + chatSetupRunner 欢迎页/disclaimer guard
- **B4-6** ✅ agentSessions provider 描述替换 + agentTitleBarStatusWidget 状态 guard
- **B4-7** ✅ 全仓 grep 扫尾验证通过（残留均为 guard 保护的上游 rebase 友好型代码）
- **B4-core 完成** ✅ B4-0 ~ B4-7 全部就绪；下一步进入 B1+B2 并行
- **B1-0** ✅ 命名冻结：`AuthVariantName`/`FlowKind`/`ProviderAuth` 类型定义集中在 `providerTypes.ts`
- **B1-1** ✅ auth 契约升级：`ProviderOptions.apiKey` → `ProviderAuth` 显式结构；abstractProvider + 三家 Provider + apiKeyService + directorCodeAgent + directorCodeModelProvider + 12 个测试文件（116 处替换）全部对齐
- **B1-2** ✅ `oauthService.ts` 完全重写：统一 callback 模型 → provider-specific flow contracts（`pkce_manual` + `device_code`）；新接口 `startLogin/submitManualCode/pollLogin/getStatus/logout`；`handleCallback` 标记 `@deprecated` 并 throw；session 单飞锁 + TTL 清理 + `IOAuthStoredTokens`（含 `clientId`/`flowKind`）；63 个测试全通过
- **B1-3** ✅ IOAuthService + IModelResolverService 注册到 `agentEngine.contribution.ts` DI 容器
- **B1-4** ✅ Anthropic PKCE 真实端点 smoke 通过：`dev/smoke-anthropic-oauth.mjs` 完成浏览器授权 + token exchange，拿到 access/refresh token；Messages API 使用 OAuth bearer token 返回结构化 `429 rate_limit_error`（非 401），证明认证链与 Anthropic API 入口可用；自动化验证：transpile 0 errors，`oauthService.test.ts` + `anthropicProvider.test.ts` 共 84 tests passing
- **B1-5** ✅ OpenAI transport spike 结论冻结：`dev/smoke-openai-codex-oauth.mjs` 真实 deviceauth 登录 + token exchange 成功；`chatgpt.com/backend-api/codex/models` 返回 200 且可列出 Codex 模型；`chatgpt.com/backend-api/codex/responses` 返回 400（非 401/403，已到达 Codex 后端）；`api.openai.com/v1/chat/completions` 对照返回 429。后续 OpenAI OAuth 固定走独立 `authVariant=openai-codex` + `chatgpt.com/backend-api/codex` transport，不复用 `openai-completions`
- **B1-6** ✅ OpenAI deviceauth 登录与状态链完成：`oauthService.ts` 的 OpenAI 占位标准 device_code 已替换为 Hermes/Codex `deviceauth/usercode` + `deviceauth/token` + `oauth/token` 二段交换；token/status 持久化 `authVariant=openai-codex`，配置 schema 新增 `directorCode.ai.authVariant`；验证：`oauthService.test.ts` 65 passing，`transpile-client-esbuild` 0 errors
- **B1-7** ✅ OAuth widget/controller 状态机内核完成：新增 `oauthLoginController.ts`（phase 固定为 `starting / awaiting_user / submitting / polling / approved / error`）与 `oauthWidget.ts`；Settings 底部 `Subscription & Login` 已从 Coming Soon 替换为 Anthropic PKCE code 提交 + OpenAI `OpenAI (ChatGPT/Codex OAuth)` device-code / user_code / polling 入口；API key Test Connection 与 OAuth Refresh/Check Now 分离；验证：`oauthLoginController.test.ts` + `oauthService.test.ts` 共 73 passing，`transpile-client-esbuild` 0 errors
- **B1-8** ✅ AuthStateService 统一认证状态完成：新增 `authStateService.ts` + `IAuthStateService.resolveAuth(provider, model, authVariant)`，聚合 OAuth / per-model key / provider key / missing 四类状态；Agent 与标准 Chat `sendChatRequest()` 已切到统一 auth 入口，`resolveProviderOptions()` 仅保留 deprecated stub/旧测试；`ModelResolver` 缓存桶新增 `authIdentityKey + authVariant` 维度，`openai-codex` 暂返回空列表并禁止误打 `api.openai.com`；验证：`transpile-client-esbuild` 0 errors，agentEngine 单测 528 passing
- **B1-9 / B2 / 原A5 / B3** ⏳ 待实施；当前下一步为 B1-9：接 OpenAI Codex backend transport，使 `authVariant=openai-codex` 的已登录 token 走 `chatgpt.com/backend-api/codex` 专用路径，不复用 `openai-completions`

## 权威文档位置

当前 116/P2 执行优先看 `docs/upgrade/` 下的 replay 与修复计划：

| 文档 | 内容 |
|------|------|
| `docs/upgrade/116-upgrade-maintainable-replay-plan.md` | 116 可维护 replay 升级计划、post-implementation findings、build entry point |
| `docs/upgrade/116-inline-mermaid-runtime-regression-fix-plan.md` | Mermaid runtime、inline chat、Ask/Edit/Agent routing、Chat Editing UI、工具层优化计划 |
| `docs/upgrade/116-agent-customizations-director-settings-plan.md` | 将 Director settings 入口接入 VS Code 116 Agent Customizations 的计划 |
| `docs/upgrade/112-replay-baseline-handoff.md` | 112 replay baseline 历史交接与验证方式 |

`.cursor/` 文档是 Phase 1/ACP/CLI 的历史和后续路线背景，不再是当前 116 replay upgrade 的唯一执行权威：

| 文档 | 内容 |
|------|------|
| `.cursor/plan-01-roadmap.md` | 总体路线图、架构设计、选型总表、里程碑 |
| `.cursor/plan-02-agent-core.md` | Agent 核心改造：三方选型矩阵、AgentEngine 设计、移植文件清单 |
| `.cursor/plan-03-provider-settings.md` | Provider 与设置：双层架构、流式 Provider、密钥管理 |
| `.cursor/plan-04-phase2-acp.md` | Phase 2 ACP：协议层设计、参考 MCP+vscode-acp |
| `.cursor/plan-05-phase3-cli.md` | Phase 3 CLI：适配器框架、输出解析、外部编辑集成 |

## 历史实施路线

```
Phase 1: Agent 核心 + Provider 替换 ✅ 完成 (Week 1-10, 358 测试)
Phase 1.5: 细节优化 ✅ 完成 (品牌修复 + Test Connection + 5 Provider + Settings UI 入口)

Phase 1.5+: OAuth + Provider 增强 ✅ 完成
  ✅ 阶段 1: Provider 基类抽象重构 (AbstractDirectorCodeProvider + ProviderCapabilities)
  ✅ 阶段 2: Per-Model 独立配置 (IModelConfig + resolveProviderOptions 三级 fallback)
  ✅ 阶段 3: 模型列表三层 Fallback (ModelResolverService: API → CDN → 静态)
  ✅ 阶段 4: OAuth 2.0 (OAuthService: PKCE + Token 存储/刷新 + Anthropic/OpenAI 配置)

Phase 2: ACP 协议扩展 (6-8 周，需在 Phase 1 收口门槛满足后默认开启 / 对外发布)
Phase 3: CLI 包装器 (4-5 周)
```

## 核心设计决策（必须记住）

1. **Agent 循环基于 open-agent-sdk QueryEngine（~400行）**，不用 copilot-chat ToolCallingLoop（1882行），因为后者强依赖 GitHub 基础设施
2. **消息格式内部用 Anthropic 格式**（NormalizedMessageParam），各 Provider 负责格式转换
3. **工具不重新实现**，通过 ToolBridge 桥接 VS Code 现有的 ILanguageModelToolsService（9 内置 + MCP）
4. **Agent 通过 registerDynamicAgent 注册**为 Chat Participant，不修改现有 Agent 注册体系
5. **Provider 全部使用 native fetch**，不引入 @anthropic-ai/sdk 等外部 npm 依赖（避免影响 VS Code 构建系统）
6. **密钥通过 IApiKeyService → ISecretStorageService 存储**，键名: `director-code.apiKey.<provider>`
7. **`vendor === 'copilot'` 在 languageModels.ts:631 硬编码为默认**，新 vendor 需处理此逻辑
8. **Phase 1 为 Phase 2 ACP 预留扩展点**：统一的 registerDynamicAgent + IChatProgress 输出
9. **Model Catalog 统一定义**在 `common/agentEngine/modelCatalog.ts`，消除重复
10. **IApiKeyService 作为 singleton 注册**，Agent 和 ModelProvider 都通过它读取密钥
11. **OAuth 路线已拍板为 Hermes-style provider-specific OAuth**：不做 BYO `clientId`；`anthropic` 用内置 public `clientId` + PKCE 手动粘 code，`openai` 用内置 public `clientId` + device code / 官方 public flow；Settings 按 provider 渲染登录 UI，不暴露通用 `clientId` 输入；OpenAI 的用户侧 OAuth 入口文案固定为 `OpenAI (ChatGPT/Codex OAuth)`

## 当前进度汇总

### 代码统计

| 阶段 | 生产代码 | 测试代码 | 测试数 |
|------|---------|---------|--------|
| Week 1: Engine 核心 | ~1,330 行 | ~670 行 | (在 chat/test 目录) |
| Week 2: Provider 层 | ~1,100 行 | ~1,200 行 | 73 |
| Week 3: 浏览器集成 | ~870 行 | ~270 行 | 17 |
| Week 4: Settings UI | ~1,030 行 | ~470 行 | 49 |
| Week 5: 集成测试 + Bug fix | ~15 行 | ~850 行 | 65 |
| Week 6: 端到端补全 | ~50 行 | ~250 行 | 20 |
| Week 7: E2E 实测 + UI | ~120 行 | ~470 行 | 45 |
| Week 8: 流式输出 | ~140 行 | ~100 行 | 9 |
| Week 9: 发布准备 | ~30 行 | ~60 行 | 2 |
| Week 10+: 细节优化 | ~120 行 | ~100 行 | 80 (新增) |
| Phase 1.5+ 阶段1: Provider 基类重构 | ~160 行 | ~230 行 | 27 (新增) |
| Phase 1.5+ 阶段2: Per-Model 配置 | ~120 行 | ~220 行 | 28 (新增) |
| Phase 1.5+ 阶段3: ModelResolver 三层 Fallback | ~280 行 | ~290 行 | 31 (新增) |
| Phase 1.5+ 阶段4: OAuth 2.0 服务 | ~310 行 | ~340 行 | 39 (新增) |
| **合计** | **~5,675 行** | **~5,520 行** | **479 (全通过)** |

### 已实现的文件清单

```
vscode/src/vs/workbench/contrib/chat/

common/agentEngine/                          # Engine 核心 (Week 1)
├── agentEngine.ts                           # 508 行 — Agentic 主循环
├── agentEngineTypes.ts                      # 189 行 — 类型定义
├── retry.ts                                 # 137 行 — 指数退避重试
├── tokens.ts                                # 141 行 — Token/成本计算
├── compact.ts                               # 198 行 — 上下文压缩
├── apiKeyService.ts                         # ~320 行 — API Key 管理服务 + Per-Model 配置 (Week 4 + Phase 1.5+)
├── modelCatalog.ts                          # ~80 行 — 统一模型目录 (Week 4 新增)
├── modelResolver.ts                         # ~280 行 — 三层 Fallback 模型解析器 [Phase 1.5+ 新增]
├── oauthService.ts                          # ~310 行 — OAuth 2.0 PKCE + Token 刷新 [Phase 1.5+ 新增]
└── providers/                               # Provider 层 (Week 2 + Phase 1.5+ 重构)
    ├── providerTypes.ts                     # ~140 行 — 接口 + 类型 + ProviderCapabilities
    ├── abstractProvider.ts                  # ~160 行 — 基类 (HTTP/SSE/capabilities) [Phase 1.5+ 新增]
    ├── anthropicProvider.ts                 # ~250 行 — Anthropic (extends AbstractDirectorCodeProvider)
    ├── openaiProvider.ts                    # ~330 行 — OpenAI (extends AbstractDirectorCodeProvider)
    ├── geminiProvider.ts                    # ~340 行 — Gemini (extends AbstractDirectorCodeProvider)
    └── providerFactory.ts                   # ~65 行 — 工厂 + re-export

browser/agentEngine/                         # 浏览器集成 (Week 3 + Week 4)
├── agentEngine.contribution.ts              # ~175 行 — 注册入口 (Week 4 大幅扩展)
├── directorCodeAgent.ts                     # ~180 行 — IChatAgentImplementation (Week 4 重构用 IApiKeyService)
├── directorCodeModelProvider.ts             # ~200 行 — ILanguageModelChatProvider (Week 4 重构用 modelCatalog)
├── toolBridge.ts                            # ~150 行 — IToolExecutor 桥接
├── progressBridge.ts                        # ~130 行 — AgentEvent → IChatProgress
├── messageNormalization.ts                  # ~85 行 — 消息格式转换
├── apiKeysWidget.ts                         # ~250 行 — API Key 管理 Widget (Week 4 新增)
├── providerSettingsWidget.ts                # ~200 行 — Provider 设置 Widget (Week 4 新增)
├── directorCodeSettingsEditor.ts            # ~180 行 — 设置 Editor + Input + Serializer (Week 4 新增)
└── media/
    └── directorCodeSettings.css             # ~230 行 — 设置页面样式 (Week 4 新增)

test/common/agentEngine/                     # 测试文件 (204 个测试)
├── retry.test.ts                            # Week 1 旧测试
├── tokens.test.ts                           # Week 1 旧测试
├── compact.test.ts                          # Week 1 旧测试
├── anthropicProvider.test.ts                # 19 测试 — 请求/响应/SSE/thinking/cache
├── openaiProvider.test.ts                   # 21 测试 — 格式转换/SSE/tool_calls
├── geminiProvider.test.ts                   # 26 测试 — functionCall/Response/thinking
├── providerFactory.test.ts                  # 6 测试 — 工厂路由/穷尽检查
├── progressBridge.test.ts                   # 11 测试 — 事件→进度转换
├── messageNormalization.test.ts             # 6 测试 — 消息双向转换
├── apiKeyService.test.ts                    # 24 测试 — CRUD/事件/连接测试 (Week 4)
├── apiKeysWidget.test.ts                    # 11 测试 — Service 集成逻辑 (Week 4)
├── providerSettingsWidget.test.ts           # 17 测试 — Model Catalog 逻辑 (Week 4)
├── agentRegistration.test.ts                # 12 测试 — 注册流集成测试 (Week 5 新增)
├── errorHandling.test.ts                    # 17 测试 — 错误处理集成测试 (Week 5 新增)
├── configFlow.test.ts                       # 17 测试 — 配置流集成测试 (Week 5 新增)
├── directorCodeModelProvider.test.ts        # 19 测试 — ModelProvider 逻辑测试 (Week 5 新增)
├── endToEnd.test.ts                         # 45 测试 — E2E 集成测试 (Week 7 新增)
├── abstractProvider.test.ts                 # 27 测试 — 基类/继承/SSE/capabilities [Phase 1.5+ 新增]
├── modelResolver.test.ts                    # 31 测试 — 三层 Fallback/缓存/事件 [Phase 1.5+ 新增]
└── oauthService.test.ts                     # 39 测试 — PKCE/授权流/Token/刷新/登出 [Phase 1.5+ 新增]
```

### Week 4 新增功能

1. **IApiKeyService** — 统一 API Key 管理服务
   - `getApiKey/setApiKey/deleteApiKey/hasApiKey`
   - `testConnection` — 最小请求验证 key 有效性
   - `onDidChangeApiKey` — 变更事件
   - 已注册为 singleton: `registerSingleton(IApiKeyService, ApiKeyService)`

2. **Settings Editor** — `DirectorCodeSettingsEditor`
   - Command: `director-code.openSettings` (F1 → "Director Code: Open Settings")
   - 上半部: Provider/Model/BaseURL/MaxTurns/MaxTokens 配置
   - 下半部: 三个 Provider 的 API Key 输入/测试/删除
   - 注册为 EditorPane + EditorSerializer

3. **Language Model Provider** — `DirectorCodeModelProvider` 已注册
   - `registerLanguageModelProvider('director-code', modelProvider)`
   - 模型出现在 VS Code 的 Chat 面板模型选择器中

4. **Model Catalog** — 统一到 `common/agentEngine/modelCatalog.ts`
   - 消除了 directorCodeModelProvider 和 providerSettingsWidget 的重复定义
   - 提供 `getModelsForProvider/getDefaultModel/findModelById` 工具函数

### Week 5 新增功能

1. **Vendor 注册修复** — `deltaLanguageModelChatProviderDescriptors` 在 `registerLanguageModelProvider` 之前调用
   - 修复了 `UNKNOWN vendor` 异常
   - 添加了 dispose 时反注册 vendor 的清理逻辑
   - 模型现在正确出现在 Chat 面板的 "Other Models" 区域

2. **集成测试** — 4 个新测试文件，65 个新测试
   - `agentRegistration.test.ts` — API Key → Provider → Model 完整流
   - `errorHandling.test.ts` — 错误分类、连接失败、HTTP 错误传播
   - `configFlow.test.ts` — Provider 切换、Base URL、多 Provider 独立性
   - `directorCodeModelProvider.test.ts` — 模型元数据、Token 估算、模型族

### 配置项（已注册）

| 配置键 | 默认值 | 说明 |
|--------|--------|------|
| `directorCode.ai.provider` | `anthropic` | LLM 提供商 (5 种: anthropic/openai/gemini/openai-compatible/anthropic-compatible) |
| `directorCode.ai.model` | `claude-sonnet-4-6` | 模型 ID（支持自定义输入） |
| `directorCode.ai.baseURL` | `""` | 自定义 API 地址（compatible provider 必填） |
| `directorCode.ai.maxTurns` | `25` | 每次请求最大 agentic 轮数 |
| `directorCode.ai.maxTokens` | `8192` | 每次 LLM 调用最大输出 token |
| `directorCode.ai.maxInputTokens` | `0` | 上下文窗口大小（0=使用模型默认） |

### 模型目录（内置 14 个，5 Provider）

| 模型 | Provider | ApiType |
|------|----------|---------|
| claude-sonnet-4-6, claude-opus-4-6, claude-haiku-4-5 | Anthropic | anthropic-messages |
| gpt-4o, gpt-4o-mini, o3, o3-mini | OpenAI | openai-completions |
| gemini-2.5-pro, gemini-2.5-flash | Gemini | gemini-generative |
| deepseek-chat, deepseek-reasoner, qwen-plus, moonshot-v1-auto | OpenAI Compatible | openai-completions |
| (用户自定义模型 ID) | Anthropic Compatible | anthropic-messages |

## 构建与测试命令

```bash
# 编译（快速 transpile，~14s，推荐）
cd vscode && npm run gulp -- transpile-client-esbuild

# 运行指定测试文件
node test/unit/node/index.js --run "src/vs/workbench/contrib/chat/test/common/agentEngine/apiKeyService.test.ts"

# 运行全部 AgentEngine 测试（276 个，~5s）
node test/unit/node/index.js \
  --run "src/vs/workbench/contrib/chat/test/common/agentEngine/apiKeyService.test.ts" \
  --run "src/vs/workbench/contrib/chat/test/common/agentEngine/apiKeysWidget.test.ts" \
  --run "src/vs/workbench/contrib/chat/test/common/agentEngine/providerSettingsWidget.test.ts" \
  --run "src/vs/workbench/contrib/chat/test/common/agentEngine/anthropicProvider.test.ts" \
  --run "src/vs/workbench/contrib/chat/test/common/agentEngine/openaiProvider.test.ts" \
  --run "src/vs/workbench/contrib/chat/test/common/agentEngine/geminiProvider.test.ts" \
  --run "src/vs/workbench/contrib/chat/test/common/agentEngine/providerFactory.test.ts" \
  --run "src/vs/workbench/contrib/chat/test/common/agentEngine/progressBridge.test.ts" \
  --run "src/vs/workbench/contrib/chat/test/common/agentEngine/messageNormalization.test.ts" \
  --run "src/vs/workbench/contrib/chat/test/common/agentEngine/agentRegistration.test.ts" \
  --run "src/vs/workbench/contrib/chat/test/common/agentEngine/errorHandling.test.ts" \
  --run "src/vs/workbench/contrib/chat/test/common/agentEngine/configFlow.test.ts" \
  --run "src/vs/workbench/contrib/chat/test/common/agentEngine/directorCodeModelProvider.test.ts" \
  --run "src/vs/workbench/contrib/chat/test/common/agentEngine/agentEngine.test.ts" \
  --run "src/vs/workbench/contrib/chat/test/common/agentEngine/endToEnd.test.ts"
```

### Week 6 新增功能

1. **对话历史注入** — AgentEngine 构造函数新增 `initialMessages` 参数
   - `previousMessages` 现在正确传递给 engine
   - 多轮对话可以保持上下文

2. **工作目录修复** — `cwd` 从 `IWorkspaceContextService` 获取真实路径
   - 不再硬编码 `'.'`
   - 文件操作工具现在使用正确的工作区根路径

3. **ProgressBridge 防御性改进** — 处理 `content` 为 string 类型的情况

4. **AgentEngine 核心逻辑测试** — 20 个新测试
   - 初始消息格式、工具定义、Token 估算、Auto-Compact、重试逻辑

## 下一步计划：Phase 1d Week 9-10

### Week 8 完成总结

1. **流式输出改造** — AgentEngine 核心突破
   - 新增 `AgentTextDeltaEvent` / `AgentThinkingDeltaEvent` 事件类型
   - AgentEngine.submitMessage() 现在优先使用 `createMessageStream()`
   - 文本/思考 token 实时 yield 到 UI（用户不再等待完整响应）
   - 错误时自动回退到阻塞式 `createMessage()` + withRetry
   - 流式消费中累积完整 content blocks 用于工具检测

2. **ProgressBridge 扩展** — 处理 text_delta → markdownContent, thinking_delta → thinking
3. **9 个新测试** — 覆盖流式 delta 事件转换、混合流式序列模拟
4. **临时分析文件清理** — 删除 23 个根目录临时分析文档

5. **DeepSeek 实测验证通过** — 真实 API 端到端
   - Model Catalog 新增 deepseek-chat, deepseek-reasoner
   - OpenAI Provider 支持 `reasoning_content`（R1 思考链）
   - 非流式: 6.5s / 流式: 首 token 1.1s → **UX 大幅提升**
   - thinking + text 内容块正确分离

### Week 9: Phase 1 发布准备

1. **🔴 关键 Bug 修复**: 多工具流式响应丢失
   - 当 LLM 在一次回复中调用多个工具时，只有最后一个工具被保留
   - 重构为 finalize-before-start 模式：每个新 tool_use_start 先保存前一个工具
   - 新增 `finalizeToolBlock()` helper 方法

2. **发布审计通过**:
   - ✅ 构建系统: agentEngine 文件自动包含在 VS Code 构建中
   - ✅ 注册链路: chat.contribution.ts → agentEngine.contribution.ts → AfterRestored 阶段加载
   - ✅ 多工具流式 Bug 已修复并测试覆盖

### Week 10: Phase 1 收尾

1. **README.md 完全重写** — 从 VSCodium 旧内容替换为 Director-Code 完整介绍
   - 项目定位、功能特性、快速开始指南
   - 10 个支持模型列表（含 DeepSeek 使用示例）
   - 项目结构、开发指南、测试覆盖率
   - Roadmap (Phase 1 Done → Phase 2/3 Planned)

### 发布后修复 (2026-04-14)

1. **Chat Panel 不显示** — 三处联动修复
   - `chat.contribution.ts`: `chat.disableAIFeatures` 默认值恢复为 `false`
   - `agentEngine.contribution.ts`: Director-Code Agent 设为 `isDefault: true`
   - `chatAgents.ts`: `registerDynamicAgent()` 添加 `_updateContextKeys()` 调用
   - 根因: disable-copilot.patch 的 AND 条件 + 缺少 context key 更新

2. **默认中文语言** — `src/main.ts` argv.json 模板添加 `"locale": "zh-cn"`
   - 首次启动自动生成含 locale 设置的 argv.json
   - 语言包通过 VS Code 内置机制从 Open VSX 自动下载

3. **安装包生成** — 构建命令: `npm run gulp -- "vscode-win32-x64-user-setup"`
   - 使用 Inno Setup 生成 setup.exe
   - 输出: `.build/win32-x64/user-setup/DirectorCodeSetup-1.112.0.exe`
   - 注意: 需要 GitHub 网络通畅（Electron 下载）

## Phase 1 完成总结

### 关键指标
- **生产代码**: ~4,685 行
- **测试代码**: ~4,340 行
- **测试数量**: 278 个（全部通过）
- **支持模型**: 10 个（3 Provider + DeepSeek 兼容）
- **真实 API 验证**: DeepSeek Reasoner (R1) 流式 + 思考链

### Phase 1 交付物
1. Agent Engine — 基于 open-agent-sdk 的 Agentic 循环 + 流式输出
2. 3 个 LLM Provider — Anthropic/OpenAI/Gemini + DeepSeek 兼容
3. 工具桥接 — VS Code 9 内置工具 + MCP 工具
4. Settings UI — Provider/Model/API Key 配置界面
5. 模型选择器 — Chat 面板模型列表 + picker 联动
6. 流式输出 — text_delta/thinking_delta 实时传输
7. 错误恢复 — retry/compact/prompt-too-long 自动恢复
8. 成本追踪 — 17 模型定价 + 实时 Token 计费

### 全量编译验证

**最新品牌构建 (2026-04-14)**:
1. `prepare_vscode.sh` — 品牌 + patches 全部应用（Director-Code 品牌 + telemetry 去除 + disable-copilot + open-vsx gallery）
2. `compile-build-without-mangling` — 0 errors (严格 TS 编译)
3. `compile-extension-media` — 0 errors
4. `compile-extensions-build` — 0 errors
5. `minify-vscode` — 完成
6. `vscode-win32-x64-min-ci` — 完成

**构建产物**: `VSCode-win32-x64/Director-Code.exe` — 800MB
**品牌**: 完整 Director-Code 品牌（nameShort/nameLong/applicationName/win32DirName 全部正确）
**AgentEngine**: 已包含在 workbench.desktop.main.js minified bundle 中

**构建流程（可复现）**:
```bash
# 0. 环境准备（只需做一次）
# GITHUB_TOKEN 已通过 setx 永久保存到 Windows 用户环境变量
# 新终端自动生效，5000 次/小时 GitHub API 限额
# （token 值不记录在代码仓库中，通过 setx GITHUB_TOKEN "ghp_xxx" 设置）

# 1. 品牌 + patches（需设置环境变量）
export APP_NAME="Director-Code" ASSETS_REPOSITORY="daxijiu/Director-Code" BINARY_NAME="director-code" GH_REPO_PATH="daxijiu/Director-Code" ORG_NAME="Director-Code" VSCODE_QUALITY="stable" RELEASE_VERSION="1.112.0" OS_NAME="windows" CI_BUILD="no" DISABLE_UPDATE="no"
bash prepare_vscode.sh

# 2. 在 vscode/ 子目录中恢复 AgentEngine 文件（如果是 stash/branch）
cd vscode

# 3. 编译
npm run gulp -- compile-build-without-mangling
npm run gulp -- compile-extension-media
npm run gulp -- compile-extensions-build
npm run gulp -- minify-vscode

# 4. 打包（需设置 ELECTRON_CACHE_OVERRIDE，见下方说明）
export ELECTRON_CACHE_OVERRIDE="/e/Projects/Director-Code/.electron-cache"
npm run gulp -- "vscode-win32-x64-min-ci"

# 5. 生成安装包
npm run gulp -- "vscode-win32-x64-inno-updater"
npm run gulp -- "vscode-win32-x64-user-setup"    # 用户级安装包
npm run gulp -- "vscode-win32-x64-system-setup"  # 系统级安装包
```

**注意**: 
- `prepare_vscode.sh` 会执行 `npm ci`（重装依赖），耗时较长
- GitHub API 有 rate limit (60/hour)，builtInExtensions 下载可能失败，需设置 GITHUB_TOKEN
- VisualElementsManifest.xml 源模板已修复为 Director-Code

### ⚠️ Node.js 网络问题（公司内网必读）

**根因**: 公司网络（腾讯内网）安全软件拦截 Node.js 的 OpenSSL TLS 握手，但允许 Windows 原生 TLS（curl/PowerShell/浏览器/git schannel）。表现为 Node.js 访问 GitHub 时报 `Client network socket disconnected before secure TLS connection was established`。

**影响**: 
- `npm install` / `npm ci` 可能失败
- `vscode-win32-x64-min-ci` 打包步骤下载 Electron 失败
- `compile-extensions-build` 下载 builtInExtensions 失败

**解决方案 — Electron 本地缓存**:
1. 用 PowerShell 预下载 Electron（走 Windows 原生 TLS）:
   ```powershell
   Invoke-WebRequest -Uri "https://github.com/electron/electron/releases/download/v39.8.0/electron-v39.8.0-win32-x64.zip" -OutFile "E:\Projects\Director-Code\.electron-cache\electron-v39.8.0-win32-x64.zip" -UseBasicParsing
   ```
2. 已 patch `node_modules/@vscode/gulp-electron/src/download.js`，添加 `ELECTRON_CACHE_OVERRIDE` 环境变量支持
3. 构建时设置: `export ELECTRON_CACHE_OVERRIDE="/e/Projects/Director-Code/.electron-cache"`
4. Patch 逻辑: download() 函数开头检查 `ELECTRON_CACHE_OVERRIDE` 目录下是否有匹配的 zip 文件，有则直接返回本地路径

**解决方案 — builtInExtensions 下载失败**:
- 直接跳过 `compile-extensions-build` 步骤（不运行即可，不影响 minify 和打包）
- ⚠️ **绝对不要用 Python json.dump 重写 product.json**！会改变 JSON 格式导致 NLS 消息映射错乱
- 这 3 个 debug 扩展（js-debug 等）非核心功能，缺失不影响 Agent

### ⚠️ 构建后必做清理（避免 NLS 缓存污染）

每次构建新版本后，**必须清理 NLS 缓存**，否则旧缓存的消息数量与新代码不匹配会导致白屏（`NLS MISSING` 错误）：

```powershell
# 构建完成后执行
Remove-Item -Recurse -Force "$env:APPDATA\Director-Code\clp" -ErrorAction SilentlyContinue
```

**根因**: VS Code 会将中文 NLS 消息缓存到 `%APPDATA%\Director-Code\clp\` 目录。新构建如果新增了 NLS 字符串（如我们的 Phase 1.5+ 代码），缓存的旧版本消息条数不够，运行时索引越界导致白屏崩溃。清理后首次启动会重新生成缓存。

### Phase 1 细节优化 (2026-04-14)

1. **Test Connection 修复** — 修复了使用自定义 baseURL 时 Test Connection 失败的 Bug
   - `apiKeysWidget` 现在从配置读取 `baseURL` 和 `model` 传给 `testConnection`
   - `_testOpenAI` URL 拼接对齐 `OpenAIProvider`（避免 `/v1` 重复）
   - `testConnection` 接口扩展支持 `model` 参数

2. **品牌残留清理** — 修复更新报错和 VSCodium 残留
   - 移除 `product.json` 中指向 VSCodium 的 `updateUrl`（禁用自动更新）
   - `VisualElementsManifest.xml` ShortDisplayName → Director-Code
   - `prepare_vscode.sh` 不再注入 VSCodium updateUrl
   - Linux `.desktop` / `.appdata.xml` 文案更新为 Director-Code

3. **Settings UI 入口增强**
   - Chat 面板齿轮菜单新增 "Director Code AI Settings" 入口
   - 设置面板新增 "Director Code AI" 顶级分类（与"聊天"同级）
   - 包含 Provider/Advanced 两个子分类

4. **Provider 体系重构** — 从 3 Provider 扩展到 5 Provider
   - 新增 `openai-compatible`（DeepSeek, Groq, Together AI, Moonshot, Qwen...）
   - 新增 `anthropic-compatible`（兼容 Anthropic API 的第三方服务）
   - 模型目录更新：14 个内置模型（含 o3-mini, qwen-plus, moonshot）
   - 支持用户自定义模型 ID 输入（compatible provider 显示文本输入框）
   - `directorCodeModelProvider` 支持自定义模型的 Chat 面板展示

5. **上下文长度配置** — 新增 `directorCode.ai.maxInputTokens`
   - 0 = 使用模型默认上下文窗口
   - 非零值覆盖 auto-compact 触发阈值

6. **OAuth/订阅预留** — 接口设计 + UI 占位
   - `AuthMethod` 类型：`'api-key' | 'oauth' | 'none'`
   - Settings Editor 底部 "Subscription & Login" 占位区域
   - 完整 OAuth 流程留到后续实现

**测试**: 358 个全部通过（从 278 增加到 358，+80 个）

### 当前阶段: OAuth + Provider 增强

**参考项目分析已完成**，关键参考来源：
- **vscode-copilot-chat**: BYOK 体系 (8 vendor、Provider 基类 `AbstractLanguageModelChatProvider`、per-model SecretStorage `copilot-byok-${provider}-${modelId}-api-key`、CDN 模型列表 `fetchKnownModelList`)
- **free-code**: OAuth 2.0 完整流程 (`oauth.ts` 含 Anthropic + OpenAI 配置、`jwtUtils.ts` Token 刷新调度器、`auth.ts` 7 种认证源)

**四阶段实施计划与进度：**
1. **Provider 基类抽象** ✅ 完成 — `AbstractDirectorCodeProvider` 基类，3 个 Provider 改为继承，`ProviderCapabilities` + `ProviderConfig` 类型，公共 HTTP 错误处理 + SSE 基础设施，27 个新测试
2. **Per-Model 配置** ✅ 完成 — `IModelConfig` 类型 + `IResolvedProviderOptions`，per-model API Key/baseURL/capabilities，三级 fallback (`resolveProviderOptions`)，Agent 已切换到 per-model 解析，28 个新测试
3. **模型列表三层 Fallback** ✅ 完成 — `ModelResolverService`: Provider API (OpenAI/Gemini GET models) → CDN JSON → 静态 `MODEL_CATALOG`，内存缓存 + TTL，31 个新测试
4. **OAuth 2.0** ✅ 完成 — `OAuthService`: PKCE 授权流 (S256)，Anthropic + OpenAI 配置，Token 存储/刷新/登出，state 验证 + 15min 过期，39 个新测试

**收口决策更新（2026-04-17）**：
- 不再继续推进 “BYO `clientId` + 统一 callback OAuth” 路线
- 收口计划已改为 **Hermes-style provider-specific OAuth**：
  - `anthropic`：PKCE + 手动粘 code
  - `openai`：device code / 官方 public flow
  - `gemini` / compatible providers：继续 API key only
- `directorCodeSettingsEditor.ts` 后续要从 `Coming Soon` 占位改为 provider-specific 登录 UI，不新增面向终端用户的通用 `clientId` 输入
- OpenAI 的用户侧 OAuth 入口文案固定为 `OpenAI (ChatGPT/Codex OAuth)`，避免与 `api.openai.com` 的 API-key 路径混淆
- `docs/director-code-remediation-plan-v2.md` 的 B1/C2 已补齐 Hermes 参考实现路径（`web_server.py` / `OAuthLoginModal.tsx` / `anthropic_adapter.py` / `auth.py` / `auth_commands.py`）和 Director-Code 对照映射，后续执行无需依赖当前聊天上下文
- 新增两条执行提醒：① OpenAI OAuth 参考实际上是 `openai-codex`/ChatGPT transport，不能把 device-code token 直接塞进现有 `api.openai.com` provider；② Settings 里的 API key `testConnection()` 与 OAuth 状态检查必须分开，UI 要同时订阅 `onDidChangeApiKey` 和 `onDidChangeAuth`
- `docs/director-code-remediation-plan-v2.md` 的 `B1` 现已进一步拆成文件级执行 checklist（B1-0 ~ B1-9），后续实现可按 checklist 顺序推进，不必再从聊天记录反推实施顺序
- `docs/director-code-remediation-plan-v2.md` 的 `B2` 现也已拆成文件级执行 checklist（B2-0 ~ B2-8），重点冻结 cache 维度（`provider + normalizedBaseURL + authIdentityKey + authVariant`）、resolver 签名扩展、OpenAI OAuth/codex 独立 bucket，以及标准 Chat / Agent 共用同一模型解析口径
- `docs/director-code-remediation-plan-v2.md` 的 `原 A5` 现也已拆成文件级执行 checklist（A5-0 ~ A5-9），重点是把 `directorCodeModelProvider.ts` 从“直接读 `MODEL_CATALOG` + `getApiKey()`”迁到与 Agent 通路一致的 `resolveProviderOptions()` + `ModelResolver` + `authVariant` 口径
- `docs/director-code-remediation-plan-v2.md` 的 `C2` 现也已拆成文件级执行 checklist（C2-0 ~ C2-9），重点是把 Settings/UI 从“API key-only 页面 + OAuth 占位”升级成同时消费 `IConfigurationService` / `IApiKeyService` / `IOAuthService` 的真实状态页，并把 API key 测试与 OAuth 状态检查彻底分开
- `docs/director-code-remediation-plan-v2.md` 的 `C1` 现也已拆成 `C1a/C1b` 文件级执行 checklist，重点是：`abstractProvider.ts` 统一承接 SSE 尾包 flush / buffer 保护 / URL helper，`openaiProvider.ts` 收口 vision / `max_completion_tokens` / `stream_options.include_usage`，`geminiProvider.ts` 收口稳定 tool id 与 error chunk 处理，`apiKeyService.testConnection()` 与真实 provider URL 规则保持一致
- `docs/director-code-remediation-plan-v2.md` 的 `B3` 现也已拆成文件级执行 checklist（B3-0 ~ B3-8），重点是：`directorCodeAgent.ts` 注入 `IChatService` 获取 `richResponses`，`messageNormalization.ts` 从纯文本回放升级成 `history + richResponses` 的结构化回放，`progressBridge.ts` 处理非流式正文补偿，`directorCodeModelProvider.ts` 保留 image / tool 相关的最小 rich 语义
- `docs/director-code-remediation-plan-v2.md` 的 `C4` 现也已拆成文件级执行 checklist（C4-0 ~ C4-10），重点是：统一 `tokens.ts` / `compact.ts` / `modelCatalog.ts` / `modelResolver.ts` 的数据边界，给 compact 增加成功判定和专用模型选择链，处理 unknown metadata / binary tool_result / auxiliary model fallback，并移除用户可见辅助功能对 `copilot-fast` 的假设
- `docs/director-code-remediation-plan-v2.md` 的 `C3` 现也已拆成文件级执行 checklist（C3-0 ~ C3-6），重点是：`directorCodeModelProvider.ts` 纳入 `Disposable`，`registerDynamicAgent()` 支持重复 ID 热重载安全重注册，`mcpAddContextContribution.ts` 的 capability 显隐链收口，以及 `mcpLanguageModelToolContribution.ts` 的 `resource_link` 图片读取失败语义从“空成功”改为显式错误/回退
- `docs/director-code-remediation-plan-v2.md` 的 `C5` 现也已拆成文件级执行 checklist（C5-0 ~ C5-6），重点是：`prepare_vscode.sh` 建立统一 `cleanup + trap` 框架，失败路径恢复 `.npmrc` / 清理 `.bak`，并给 `build.sh` / 构建入口增加 `DIRECTOR_CODE_SKIP_EXTENSIONS_BUILD=1` 分支
- `docs/director-code-remediation-plan-v2.md` 的 `B4` 现也已拆成文件级执行 checklist（B4-0 ~ B4-8），重点是：先统一根 `product.json` 与 `prepare_vscode.sh` 的产品元数据真相，再收口 setup 命令族、builtin tool/source 判定、状态类 UI、disclaimer/getting started、Agent Sessions/model picker 边缘触点，最后用全仓 grep + 手动 smoke 做品牌/去 Copilot 化闭环验证
- `docs/director-code-remediation-plan-v2.md` 的 `A1~A4` 现也已补成文件级执行 checklist：`A1` 统一 request 绑定解析；`A2` 统一取消契约、toolBridge 取消、retry 可取消 sleep；`A3` 收口多工具流式聚合、JSON 重试、`max_tokens` 截断和保序；`A4` 收口 MCP Sampling 的 `Not Now` 语义并删除 `_enableToolAutoApprove`
- `docs/director-code-remediation-plan-v2.md` 的 `D1~D4` 现也已拆成文件级执行 checklist：`D1` 统一 Gemini key 的 header/query 开关与兼容性验证；`D2` 收口密钥输入的 autofill 与 DOM 停留时间；`D3` 抽服务层通用 fetch helper；`D4` 审计 `DirectorCodeSettingsEditor.ts` 的生命周期与重入边界
- 已做一轮最终交叉一致性审查：补平了 `B1` vs `C2` 的 OAuth widget/controller 归属、`B4` vs `C4` 的 model picker/CTA 归属、`OpenAI (GPT-4, o3)`（API key 区域） vs `OpenAI (ChatGPT/Codex OAuth)`（OAuth 区域）的文案边界，并把 `C3/C4/D3/D4` 回归项补进文末总测试清单
- 交叉审查后的最终收口结论：① OpenAI OAuth 内部 transport/authVariant 命名固定为 `openai-codex`，不再保留 `openai-chatgpt` / `openai-oauth` 备选名；② `getProviderAuthMethod()` 纯 helper 直接删除，不再保留“二选一”口径；③ `directorCode.ai.compactModel` 必须同时落到配置注册和 Settings UI，不能只存在于 `compact.ts` 内部逻辑
- 用户已追加拍板：fixed public `clientId` 来源选择 **C**，当前轮次直接复刻 Hermes 的 public `clientId` / flow 实现，不再把“项目自注册 app”作为前置
- 用户已追加拍板：OpenAI OAuth fallback 选择 **B**，允许先完成其他明确项后再回收 `B1-5/B1-6`，但若最终 transport / smoke 不稳定，则继续阻塞 Phase 1 对外发布
- `.cursor/plan-04-phase2-acp.md` 的 Gemini CLI 示例包名已修正为 `@google/gemini-cli@latest`
- 最新复审又补齐了 `B1-core` vs `B1-ship` 的口径：Phase 1 对外发布门槛要求 **B1-ship**，即必须包含 OpenAI `B1-5~B1-9` 与 codex backend smoke，不能只完成 Anthropic + 注入链
- 最新复审补齐了三条容易返工的边界：① `B2-1` 起依赖 `authIdentityKey` / `authVariant` 的实现必须晚于 `B1-2/B1-3` 最小输出；② `B1-7` 只产出 OAuth widget/controller 内核，`C2-4` 负责最终 editor 编排；③ `C4-8` 在 `chatModelPicker` 等文件上只能补逻辑/降级，不得回改 `B4` 已定的产品级 CTA/文案
- `.cursor/plan-04-phase2-acp.md` 的 Phase 1 示例 agent id 已从 `director-code-agent` 对齐为代码真实值 `director-code`
- 最新复审又补了 4 个收口点：① `B1` 的“实现顺序”与 `B1-0~B1-9` checklist 已对齐，并明确 checklist 为唯一执行顺序；② `authVariant` 残留旧词 `chatgpt-codex` 已统一到 `openai-codex`；③ 测试清单已显式标明 `D3/D4` 为非发布门禁；④ `plan-04-phase2-acp.md` 顶部已补充“默认开启 / 对外发布级实现仍需满足 remediation 的 `B4 + B1-ship`”

### 工具调用卡住修复 (2026-04-15)

**根因**: `createAndRunTask` 等需要确认的工具，VS Code 的 `invokeTool` 会等待 `awaitConfirmation`，但确认 UI 对动态注册的 Agent 不渲染，导致无限卡住。

**修复**:
1. **Auto-approve**: `agentEngine.contribution.ts` 初始化时自动设置 `chat.tools.global.autoApprove = true`（用户未显式配置时）
2. **Timeout 兜底**: `toolBridge.ts` 添加 120 秒超时，防止工具永久挂起
3. **CancellationError 处理**: 捕获 CancellationError 返回友好错误信息而非让 Agent 崩溃

### 竞品 Review 报告更新 (2026-04-15)

- 当前总报告: `docs/director-code-review by GPT5.4-2026-04-15.md`
- 说明: 旧报告 `docs/director-code-review-report-2026-04-15.md` 已被其他 agent 改动，不再作为本轮整理后的权威版本
- 新总报告已合并前序广审、第一轮分模块深审、第二轮分模块深审全部内容
- 当前结论聚焦于三层脱节：`状态机层`、`协议层`、`配置层`

### 全量 Review 完成 (2026-04-15)

- 本轮从 Phase 1 启动开始，对 Director-Code 改造面与直接耦合代码完成了独立全量复审
- 当前权威总报告: `docs/director-code-full-review-by-GPT5.4-2026-04-15.md`
- 报告累计记录 `57` 个问题：`10` 个严重、`28` 个高、`19` 个中
- 最高优先级风险集中在四条链路：MCP sampling / tool auto-approve 安全边界、`chatRequestId` / request 绑定错位、OAuth `clientId` / state 生命周期不一致、`product.defaultChatAgent` 与 `dataFolderName` 仍残留 Copilot / `.vscode-oss` 元数据
- 下一阶段如果进入 Phase 2 ACP，建议先按报告中的高优先级顺序做收口修复，再继续扩展接入面

### 后续: Phase 2 ACP 协议扩展
- 参考 MCP 模式 + vscode-acp 实现
- 每个外部 ACP Agent 通过 registerDynamicAgent 注册
- 详细计划见 `.cursor/plan-04-phase2-acp.md`

### 116 NLS 文字错乱热修复 (2026-05-15)

**根因**: 1.116 包仍使用 `.vscode-oss` 作为 `dataFolderName`，并且默认 `argv.json` 模板强制 `"locale": "zh-cn"`；本机旧缓存 `%APPDATA%\Director-Code\languagepacks.json` 指向 1.110 的中文语言包，导致 1.116 NLS key 与旧翻译索引错位，界面文字显示成不相关内容。

**修复**:
1. `dataFolderName` 改为 `.director-code`，隔离 VSCodium/Code OSS 的用户扩展目录。
2. 移除 `src/main.ts` 默认 `argv.json` 的 `"locale": "zh-cn"` 写入，新用户不再默认加载中文语言包。
3. `resolveNLSConfiguration()` 增加 Director 扩展根目录约束，拒绝加载当前 Director 扩展目录之外的语言包翻译文件，避免旧 `.vscode-oss` 语言包污染。

**验证**:
- `validate-series`
- `validate-product-overrides`
- `compile-check-ts-native`
- `canonical-manifest --write` 后复跑通过
- `expected-contracts`
- `scripts/build-director-116.ps1 -SkipReplay`

**打包产物**:
- `artifacts/out/stable/win32-x64/system-setup/Director-CodeSetup-x64-1.116.0.exe`
  - sha256: `134A8073E0F76184B56E4C8E1989D0F77F565201FF67872D47C1D4BE289BD6FA`
- `artifacts/out/stable/win32-x64/user-setup/Director-CodeUserSetup-x64-1.116.0.exe`
  - sha256: `53AB41750F9751C9CDE9FA8272BC728D74EE597A32EE9DB2D0DD4D4C2C0CDA11`

### 116 安装/legacy 残留收口 (2026-05-15)

**结论**:
- Windows installer AppId/GUID 已从 VSCodium GUID 切换为 Director 专用 GUID；旧内部包可能需要手动卸载旧身份，但后续不会再与 VSCodium 安装/升级/卸载身份冲突。
- Inno `UpdatingVisualStudioCode` 文案已在 13 个 installer i18n 文件中统一覆盖为 `Updating Director-Code...`；`.isl` 文件按 binary diff 生成 replay patch，避免非 UTF-8 语言文件在 replay 时损坏。
- `utils.sh` legacy 默认值已改为 Director-Code / `director-code` / `daxijiu/Director-Code`，防止绕过 116 profile 的旧脚本路径产出 VSCodium/codium 元数据。
- 用户已手动确认新 NLS 修复包安装 smoke 后 UI 文案不再错乱；本轮未重复做人工安装。

**验证**:
- `node scripts/upgrade/validate-series.mjs --profile 116-stable-win32-x64-client`
- `node scripts/upgrade/validate-product-overrides.mjs --profile 116-stable-win32-x64-client`
- `node scripts/upgrade/materialize-vscode.mjs --profile 116-stable-win32-x64-client --target vscode.generated --up-to-layer director --force`
- `node scripts/upgrade/canonical-manifest.mjs --profile 116-stable-win32-x64-client`
- `node scripts/upgrade/expected-contracts.mjs --profile 116-stable-win32-x64-client`

## 编码规范提醒

- 所有 import 以 `.js` 结尾
- 接口属性用 `readonly`
- 文件头用 `Director-Code Contributors` 版权
- **Bash 命令只用双引号，禁止单引号**（Git Bash 兼容性）
- 优先用 Glob/Grep/Read 工具代替 find/grep/cat
- **每个模块写完必须写测试并运行通过**
- 测试框架: Mocha TDD (`suite`/`test`)，assert 模块，`ensureNoDisposablesAreLeakedInTestSuite()`
- 路径深度: browser/agentEngine/ 到 base/ = `../../../../../base/common/`
- 路径深度: common/agentEngine/ 到 base/ = `../../../../../../base/common/`（6 级）
