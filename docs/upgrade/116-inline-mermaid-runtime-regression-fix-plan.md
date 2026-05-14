# 116 Chat Modes, Agent Editing UI, Inline Editing, And Mermaid Runtime Optimization Plan

Date: 2026-05-13

Phase: P2 follow-up

Status: Phase 0 implemented, replay-landed, packaged, manually accepted, and pushed. Phase 1+ remains planned and must not start until explicitly requested.

Execution decisions added on 2026-05-13:

- Phase 0 is an independent runtime hotfix. Complete and replay-land Phase 0 first, then produce a build for user manual acceptance before starting Phase 1 or later feature work.
- Director tool model-facing names must use Copilot-compatible names as the primary names wherever a Copilot-compatible capability exists. Director-specific ids are internal implementation details or compatibility aliases, not the main model vocabulary.

Execution progress added on 2026-05-14:

- Phase 0 runtime hotfix is complete and accepted by user packaged-build testing.
- Commit `ce2ed24a` (`Fix 116 Mermaid language model runtime regression`) is pushed to `origin/refactor/112-replay-baseline`.
- The fix restores exact proposed API gating in `isProposedApiEnabled()`, so `vscode.mermaid-chat-features` keeps `chatOutputRenderer` without receiving `chatParticipantAdditions`.
- `ExtHostLanguageModelTools.getTools()` now gates tool source/full-reference API shape on `chatParticipantAdditions`, not `chatParticipantPrivate`.
- Missing model recovery in `ExtHostLanguageModels` is bounded: it does not recurse through `selectLanguageModels()`, records failed recoveries, deduplicates repeated warnings, and returns unavailable when recovery fails.
- Regression coverage is in `src/vs/workbench/api/test/common/extHostLanguageModelRuntime.test.ts` and is included in `004-director-agent-engine.116.patch`.
- Replay assets updated: `patches/replay/004-director-agent-engine.116.patch`, `patches/series.116.json`, `docs/upgrade/manifests/116-stable-win32-x64-client.canonical.json`, and related generated reports.
- Validation completed: `validate-series`, `validate-product-overrides`, `expected-contracts`, clean `materialize-vscode`, canonical manifest validation, `compile-check-ts-native`, `transpile-client-esbuild`, and targeted browser tests (`5 passing`).
- Full package build completed with `scripts/build-director-116.ps1`; installers were produced under `artifacts/out/stable/win32-x64/` and accepted by user manual testing.
- Do not proceed to Phase 1 tool registry/mode policy work unless the user explicitly requests the next phase.

## Summary

This plan started as a runtime regression fix plan for three Director Code 116 issues:

1. Inline chat accepts input but does not produce a useful response.
2. `renderMermaidDiagram` times out, with no visible confirmation dialog in the tested run.
3. After attempting `renderMermaidDiagram`, the client becomes slow and CPU/memory usage remains abnormal.

The scope is now broader. The inline issue is not just a small bug in one code path; it exposes that Director currently has only one full agent-mode harness while VS Code 116 expects distinct chat mode behavior for Ask, Edit, Agent, and EditorInline. This document is therefore an optimization plan for Director's chat-mode integration:

- Keep the Mermaid runtime fix as the immediate stability item.
- Add a Director Ask profile that matches VS Code 116 Ask-mode expectations without exposing write/execute tools by default.
- Add a Director-owned, capability-level compatible tool layer for workspace read/search/edit, diagnostics, SCM, image, and minimal GitHub repository context.
- Add Agent-mode Chat Editing UI parity so file edits made by the full Director harness appear as reviewable VS Code chat edits.
- Add a Director Edit profile as a constrained edit-first mode built on the same edit infrastructure.
- Use the same edit-response adapter to unblock inline chat instead of treating inline as a plain markdown agent response.

Execution order is intentionally strict: the Mermaid/runtime stability fix is not bundled with the broader tool, mode-routing, GitHub, or Chat Editing work. Later phases may be investigated in read-only form, but implementation starts only after the standalone Phase 0 hotfix has passed packaged-build manual acceptance.

Notebook support and the `@vscode` participant are explicitly out of scope for this iteration.

There is no physical reference directory for this phase. Behavior decisions should be made from the current generated 116 Director tree, upstream VS Code 116/Copilot source in the local checkout, runtime logs, and targeted behavior tests. The long-term reproducible source of truth remains the 116 replay assets.

## Investigation Evidence

- The user-provided path under `AppData\Roaming\Code\logs` belongs to Microsoft VS Code, not the current Director Code build.
- The relevant Director logs are under `C:\Users\drchizhang\AppData\Roaming\Director-Code\logs`.
- `20260513T153400\window1\exthost\exthost.log` contains 19,242 lines in roughly 10 seconds before extension host termination.
- The extension host log repeatedly reports:
  - `[LanguageModelProxy](vscode.mermaid-chat-features) Could not find model 'director-code/deepseek-chat' in local cache. Trying to resolve model again.`
  - Equivalent warnings for `director-code/deepseek-v4-pro` and `director-code/deepseek-v4-flash`.
- Warning counts in that log are approximately:
  - `director-code/deepseek-chat`: 6414
  - `director-code/deepseek-v4-pro`: 6414
  - `director-code/deepseek-v4-flash`: 6413
- Current user settings include `"chat.tools.global.autoApprove": true`.
- The Mermaid extension declares only `enabledApiProposals: ["chatOutputRenderer"]`.
- The Mermaid tool implementation only registers `renderMermaidDiagram`, reads `markup` and `title`, and returns a `LanguageModelToolResult` with Mermaid output details. It does not call a language model directly.
- `isProposedApiEnabled()` currently returns `true` for every proposal whenever an extension declares any proposed API.
- `extHostLanguageModelTools` attaches `options.model` when `chatParticipantAdditions` is considered enabled and the tool DTO has `modelId`.
- `extHostLanguageModels.getLanguageModelByIdentifier()` tries to recover missing local models by calling `selectLanguageModels()`.
- `selectLanguageModels()` maps returned model identifiers back into `getLanguageModelByIdentifier()`, which can recursively re-enter the missing-model recovery path.
- Director's agent is registered for `Chat`, `EditorInline`, and `Terminal`, but only in `ChatModeKind.Agent`.
- Inline chat 116 starts EditorInline sessions in Ask/Edit-oriented flow, and the inline session service disables tools with `canUseTools: false`.
- Director's current response bridge mainly emits markdown/progress/thinking parts. It does not provide a dedicated Agent/Edit/Inline `textEdit` response path that guarantees VS Code Chat Editing UI integration.
- Copilot 116 contributes a broad language-model tool layer from the Copilot extension, including file read/list/search, edit, diagnostics, SCM, test, image, and GitHub repository tools.
- The current Director tree has strong VS Code core tools for terminal/tasks, confirmation, todo, subagent, fetch, usages, rename, setup/new, and the internal VS Code edit tool, but does not provide Copilot-equivalent stable model-facing tools such as `read_file`, `list_dir`, `file_search`, `grep_search`, `apply_patch`, `create_file`, `get_errors`, `get_changed_files`, or `github_repo`.
- Because Director/VSCodium does not ship Copilot as the active harness, these missing tools must be implemented or wrapped as Director-owned tools rather than relying on Copilot extension registrations.

## Upstream Copilot Ask/Edit/Agent Review

### Ask mode

Copilot registers `github.copilot.default` as the default panel participant for `modes: ["ask"]`.

Ask has two runtime paths:

1. Normal Ask falls back to `Intent.Unknown` and `PanelChatBasePrompt`. This is a lightweight programming Q&A path with history, custom instructions, current document context, variables, attachments, and markdown output. It is not the full autonomous agent loop.
2. Experimental AskAgent switches to `Intent.AskAgent` only when the relevant experiment is enabled, the selected model supports tool calling, and `chat.agent.enabled` is true. This path reuses `AgentIntentInvocation`, but with `codesearchMode: true` and a restricted tool list: only tools tagged `vscode_codesearch` plus tools explicitly referenced by the user.

Director implication:

- Ask mode should not be implemented by blindly exposing the current full Director agent loop.
- Director needs a separate Ask profile or request mode that defaults to Q&A and permits only read/search/codebase-style tools.
- Ask mode should not expose edit, terminal, workspace mutation, or execution tools unless the user explicitly moves to Agent/Edit or references a reviewed tool.

### Edit mode

Copilot registers `github.copilot.editingSession` as the default panel participant for `modes: ["edit"]`.

Edit mode is not just agent mode with a different label. It uses `EditCodeIntent` and an editing-session pipeline:

1. `EditCodePrompt` asks the model to group changes by file and output code blocks with file paths.
2. `EditCodeStep` tracks the working set and prior edit steps.
3. `processResponse()` parses model markdown/code blocks.
4. `CodeMapperService` maps those code blocks to concrete `TextEdit` or notebook edits.
5. The response stream emits `textEdit(uri, edits)` and `textEdit(uri, true)`.
6. VS Code's `ChatEditingService` observes `textEditGroup` response parts and creates the accept/reject editing UI.

Director implication:

- Registering Director for `ChatModeKind.Edit` is necessary but not sufficient.
- The Edit path must produce VS Code edit progress, not only markdown/progress/tool messages.
- A Director edit adapter should be shared by panel Edit mode and EditorInline support where possible.
- Full Copilot code mapper reuse may be too Copilot-endpoint-specific, but the architecture is reusable: working-set prompt, parse model edit response, map to concrete edits, stream `textEdit` parts.

### Agent mode contrast

Copilot's Agent mode uses `AgentIntent`, which extends the edit infrastructure but disables codeblock-as-edit processing and instead relies on broad tool calling. This matches Director's current full agent harness more closely than Ask/Edit do.

Director implication:

- Current Director agent remains the right base for `ChatModeKind.Agent`.
- Agent should remain the top-level autonomous harness, but it should still support VS Code Chat Editing UI whenever it edits files.
- Ask/Edit should be mode-specific profiles layered around the same model/auth/provider infrastructure, not duplicate provider stacks.
- Edit mode should be treated as a constrained subset of Agent's editing capability, not as a competing harness.
- Agent file mutation tools should emit VS Code edit progress (`textEditGroup`/`workspaceEdit`) instead of only returning textual tool results.
- The model/provider/tool-loop core must remain Director-owned; the reusable upstream concept is the edit-stream/UI contract, not Copilot's endpoint-bound harness.

### Agent editing UI parity

Agent mode should be an upper-level replacement for Edit mode in user capability: it can search, reason, run safe tools, and then edit. However, when it edits files, the user experience should still be the VS Code Chat Editing UI with diffs and accept/reject controls.

This requires a Director-owned edit tool protocol:

1. The model calls Director edit tools such as apply-patch, replace/range-edit, create-file, or delete-file.
2. Those tools apply changes through VS Code chat edit progress APIs rather than silently mutating files or only reporting markdown.
3. The chat response accumulates `textEditGroup` or `workspaceEdit` parts.
4. `ChatEditingService` observes those parts and creates the normal review UI.
5. The tool result sent back to the model is still a compact textual success/error summary, so the harness can continue the multi-step loop.

Director implication:

- Agent should not be forced through the Edit-mode codeblock parser for every change.
- Agent's edit tools must become the canonical path for workspace mutations.
- Any existing direct file mutation tool that cannot emit chat edit progress should be excluded from Agent by default or wrapped before being exposed.
- Once Agent editing parity is stable, Edit mode and Inline can reuse the same adapter with stricter request shaping.

### Inline relation

Inline chat is related to Edit mode because both must end in editor edits. It is still a separate integration point because EditorInline requests carry editor selection and inline-session constraints, and tools are disabled by default in that flow.

Director implication:

- Fixing inline by adding `ChatModeKind.Ask` to the existing agent is not enough.
- Inline needs an adapter that converts the model response into `textEdit` progress for the selected editor range.
- The preferred implementation is a shared Director edit-response adapter used by both panel Edit and inline chat.

## Current Root Cause Assessment

### Mermaid timeout and UI slowdown

The most likely root cause is not the Mermaid renderer itself. The failure chain is:

1. Mermaid declares `chatOutputRenderer`.
2. Director's current `isProposedApiEnabled()` treats this as permission for every proposed API.
3. The Mermaid tool is incorrectly treated as having `chatParticipantAdditions`.
4. Tool invocation attaches `options.model` for the Mermaid extension.
5. The extension host cannot resolve `director-code/...` model identifiers from its local cache.
6. Missing-model recovery recursively calls model selection and model lookup.
7. The extension host produces thousands of warnings, consumes CPU/memory, and eventually terminates or destabilizes the workbench.

The generic Director tool timeout message says the tool may be waiting for a confirmation UI that did not render. In this specific run, logs support model-resolution recursion more strongly than confirmation UI loss.

### Confirmation dialog

This is not proven as a standalone UI rendering bug yet.

With `"chat.tools.global.autoApprove": true`, `renderMermaidDiagram` may execute without a confirmation dialog by design. The Mermaid tool also has no custom `prepareInvocation` confirmation. A confirmation-specific bug should be tested only after the model-resolution recursion is fixed, and with global auto-approve disabled or Mermaid explicitly marked ineligible for auto-approval.

### Inline chat

Inline chat appears blocked by a 116 mode/response mismatch:

1. Inline chat defaults to Ask/Edit style behavior.
2. Director's default agent is Agent-mode only.
3. Inline sessions disable tools.
4. Director's existing agent response path is oriented around markdown/progress/tool output, not inline `textEdit` progress.

The correct fix is to define Director's Ask/Edit/Inline support explicitly and wire the required response adapters. A mode-list-only change would make routing look better but still leave the response semantics wrong.

### Agent editing UI gap

Director Agent currently has the right high-level harness shape for `ChatModeKind.Agent`, but it does not yet guarantee that file changes flow through VS Code's chat editing model. The tool bridge can invoke VS Code tools and confirmation UI, but the Director agent layer still needs an explicit editing contract:

1. Editing tools exposed to the model must be classified separately from generic mutation tools.
2. Editing tools must emit `textEdit`/`workspaceEdit` progress bound to the current chat request.
3. Agent responses must preserve tool progress so `ChatEditingService` can build modified-file entries.
4. Non-edit mutation tools should remain visible as tool invocations, not as edit sessions.

This is a product behavior gap, not a provider/auth/harness gap. The core Director harness remains the source of truth.

### Copilot tool parity gap

VS Code 116 Copilot gets much of its practical agent capability from a tool layer that is contributed by the Copilot extension. Director currently sees the VS Code core tools, but it does not automatically inherit Copilot's contributed tool implementations. That explains why the current Director build exposes far fewer tools than VS Code with Copilot.

The useful parity target is capability-level compatibility, not copying Copilot file-by-file:

1. Workspace context: read files, list directories, search files, search text, read a project structure summary, and optionally semantic/codebase search.
2. Reviewable editing: apply patches, create files/directories, replace strings or ranges, and route edits through VS Code Chat Editing UI where applicable.
3. IDE state: read diagnostics/problems, SCM changed files, workspace symbols, and test failure context.
4. Runtime support: keep the existing Director terminal/task tools as the execution path.
5. Media/web/repository context: view local images, fetch web pages, and query GitHub repositories.
6. Deferred areas: notebook tools, broad VS Code command execution, extension installation, memory, and agent-switching remain lower priority unless product scope changes.

GitHub is not out of scope, but mature Git/GitHub tooling is not a blocker for this batch. Director v1 should expose a Director-owned read-only repository context capability that can identify workspace GitHub remotes, use authentication when available, and return controlled auth/permission/not-supported results. Remote indexed search, richer branch/commit intelligence, and PR/issue workflows remain later Git/GitHub iterations.

## Non-Goals

- Do not restore physical-reference based validation for 116.
- Do not implement notebook chat/editing in this batch.
- Do not implement the `@vscode` participant in this batch.
- Do not special-case Mermaid by deleting or disabling the upstream Mermaid extension unless a later test proves the renderer itself is faulty.
- Do not make all proposed APIs available to all extensions.
- Do not hide the Mermaid issue by increasing tool timeouts.
- Do not claim confirmation UI is broken until tested without global auto-approve and after the model recursion is fixed.
- Do not implement inline chat by only changing the agent's mode list if no inline text edit path exists.
- Do not expose mutation, terminal, or execution tools in Ask mode by default.
- Do not replace the Director Agent harness with Copilot's harness.
- Do not treat all mutation tools as edit tools. Only tools that can produce reviewable VS Code edit progress should feed Chat Editing UI.
- Do not promise Copilot remote-index parity for `github_repo` in v1. Implement Director's own minimal read-only GitHub repository context first, with controlled fallback behavior for search until a mature Git/GitHub iteration is planned.
- Do not start Phase 1 or later feature implementation before the standalone Phase 0 hotfix has been replay-landed, built, and manually accepted by the user.

## Phased Implementation Plan

This plan is staged by dependency order. Later phases should not be considered complete until the previous phase's acceptance gate is met, though read-only code investigation can continue in parallel.

### Replay Landing Rules

The materialized Director tree is a generated development and test workspace, not the long-term source of truth.

- Development may happen in `vscode.generated/layers/director/vscode` for fast edit/compile/debug loops.
- Fast local validation may use `scripts/build-director-116.ps1 -SkipReplay ...` so in-progress generated-tree edits are not overwritten.
- Before a phase is considered complete, the change must be landed back into the 116 replay assets:
  - `patches/replay/*.116.patch`
  - `patches/series.116.json`
  - `docs/upgrade/profiles/116-stable-win32-x64-client.json` if new patch files are added
  - generated and committed reports/manifests when their expected content changes
- Canonical manifest/report updates can be batched near the end of a phase to avoid churn, but the release candidate is not complete until canonical replay validation matches the final Director tree.
- Final validation must run from clean upstream inputs through replay materialization, not only from a hand-edited generated tree.
- Any new source path must be classified by the Director patch generator or explicitly handled by a new stage. Otherwise `generate-director-patches.mjs` can fail with unclassified changed files.
- The previous 116 blank-workbench fix is a replay-owned baseline, not a generated-tree-only edit. It is part of the product/build stage: `003-director-product-build-release.116.patch` keeps the complete `defaultChatAgent.provider` object shape in `product.json`, including empty-but-present provider ids such as `enterprise.id`, because VS Code 116 reads that shape during workbench startup. Any later settings, chat mode, or product override change must preserve this semantic contract in the patch, expected product JSON, and product override validation.

### Replay Stage Ownership

Current 116 stages are:

1. `001-vscodium-layer.116.patch`: VSCodium aggregate layer, not Director-owned.
2. `002-director-branding.116.patch`: branding/resources/text/product-experience drift.
3. `003-director-product-build-release.116.patch`: product, package, server manifest, gulp, Windows installer, release/build wiring.
4. `004-director-agent-engine.116.patch`: Director agent harness, model/tool bridge, agent engine, language-model/tool service integration, MCP-related agent paths.
5. `005-director-chat-built-in-mode.116.patch`: built-in chat mode, Copilot commercial-flow bypasses, chat setup/status/model picker/agent session UI entry points.
6. `006-director-text-polish.116.patch`: small text/prompt polish.

Planned stage ownership for this optimization:

- Phase 0 runtime proposed-API/model-recursion fixes:
  - Primary owner: update existing `004-director-agent-engine.116.patch`.
  - Rationale: fixes are in extension host language model/tool plumbing and Director model/tool bridge behavior.
- Phase 1 tool registry and mode policy:
  - Preferred owner: new `007-director-tool-layer.116.patch` if it introduces a central registry or new tool-policy modules.
  - Acceptable exception: small bridge-only adjustments can stay in `004-director-agent-engine.116.patch`.
- Phase 2 read-only workspace tools:
  - Preferred owner: new `007-director-tool-layer.116.patch`.
  - Mature Git/GitHub internals remain intentionally deferred to a later dedicated iteration. Phase 2 may expose only minimal read-only repo/SCM context and controlled fallback results.
- Phase 3 Chat Editing contract:
  - Preferred owner: new `008-director-chat-editing.116.patch`.
  - If the change is only bridge plumbing, a small portion may touch `004-director-agent-engine.116.patch`, but the edit contract itself should stay in the new stage.
  - The panel/Agent edit contract is the Phase 3 hard gate. The EditorInline response contract spike is a hard prerequisite for Phase 5 and may complete during Phase 3 or in parallel before Phase 5 starts.
  - Director-owned review transaction infrastructure for `create_directory`, if needed, belongs to `008-director-chat-editing.116.patch` by default.
- Phase 4 reviewable edit tools:
  - Preferred owner: new `008-director-chat-editing.116.patch` if tightly coupled to the edit contract, or new `009-director-edit-tools.116.patch` if the tool implementations are large enough to stand alone.
- Phase 5 Ask/Edit/Inline mode routing and settings/customizations regression:
  - Primary owner: update existing `005-director-chat-built-in-mode.116.patch` for chat UI/mode entry points.
  - Agent Customizations bridge work from `docs/upgrade/116-agent-customizations-director-settings-plan.md` also belongs to `005-director-chat-built-in-mode.116.patch` unless implementation proves it needs a separate UI stage.
  - If substantial inline/edit adapter code is shared with the edit contract, keep that shared adapter in `008-director-chat-editing.116.patch` and leave routing hooks in `005`.
- Phase 6 build/package regression:
  - Usually no source patch unless build/product contracts change.
  - If build/profile/installer behavior changes, use `003-director-product-build-release.116.patch` plus profile/expected-file updates.
  - If product-level chat/default-agent metadata changes, keep the blank-workbench `defaultChatAgent.provider` contract in `003` rather than patching only the materialized source tree.

If a phase adds new patch files, update `docs/upgrade/profiles/116-stable-win32-x64-client.json`, `patches/series.116.json`, and the generator classification rules before treating the phase as complete.

### Replay Stage Enablement Gate

This gate must be handled before broad feature implementation starts if Phase 1 or later introduces new replay patch stages.

Scope:

- Update `scripts/upgrade/generate-director-patches.mjs` before using new stages:
  - separate known stage definitions from profile-enabled stage emission, or derive the emitted stage list from the active profile
  - do not make planned-but-unused stages mandatory merely because they are known to the generator
  - add planned stages such as `tool-layer`, `chat-editing`, and optionally `edit-tools` to the known stage definitions
  - add those same stage names to the patch-path mapping logic so `007`/`008`/`009` profile entries resolve to the intended stage
  - add path classification rules for new Director tool, registry, edit contract, and edit tool files
  - keep Phase 0 runtime files classified into `agent-engine` unless a dedicated runtime stage is explicitly created
  - classify Agent Customizations bridge files under `chat-built-in-mode`/`005-director-chat-built-in-mode.116.patch`, including:
    - `src/vs/workbench/contrib/chat/browser/aiCustomization/`
    - `src/vs/workbench/contrib/chat/common/aiCustomizationWorkspaceService.ts`
- Update `scripts/upgrade/generate-series.mjs` before using new stages:
  - map `007-director-tool-layer.116.patch` to `tool-layer`
  - map `008-director-chat-editing.116.patch` to `chat-editing`
  - map `009-director-edit-tools.116.patch` to `edit-tools`
  - prefer exact known stage slugs before broad substring checks such as `chat`, so `chat-editing` is not misclassified as `chat-built-in-mode`
- If Phase 0 touches extension-host runtime files, classify the touched paths into `004-director-agent-engine.116.patch`, including these likely paths when modified:
  - `src/vs/workbench/services/extensions/common/extensions.ts`
  - `src/vs/workbench/api/common/extHostLanguageModelTools.ts`
  - `src/vs/workbench/api/common/extHostLanguageModels.ts`
- When a new stage is actually used, add the patch file to:
  - `docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `patches/series.116.json`
- Do not generate empty enabled stages. If a planned stage has no files yet, keep it out of the profile/series until the phase produces real source changes.
- If a changed file is classified into a stage that is not enabled by the active profile, fail with an actionable message telling the implementer to add the corresponding patch entry or choose an existing stage. Do not silently drop classified files.

Acceptance gate:

- `generate-director-patches.mjs` can classify all touched Director files without `Unclassified Director changed files`.
- `generate-director-patches.mjs` resolves every enabled Director patch stage in the profile, including newly introduced `007`/`008`/`009` stages.
- Planned-but-unused known stages do not require empty patch files or profile/series entries.
- A changed file classified to a known-but-not-enabled stage fails clearly instead of being dropped from replay.
- `generate-series.mjs` emits the intended stage names for `tool-layer`, `chat-editing`, and `edit-tools` instead of falling back to `director-delta` or an older broad stage.
- Existing stages 002-006 still generate normally after classification changes.
- Newly used stages generate non-empty patches and are present in both the profile and `patches/series.116.json`.
- `node scripts/upgrade/validate-series.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json` passes after patch/profile/series updates.
- A clean replay materialization applies the full enabled patch list without relying on hand-edited `vscode.generated` contents.

### Phase 0: Runtime Stability Gate

Phase 0 is a standalone hotfix gate. It must be completed, replay-landed, packaged or otherwise handed to the user for manual acceptance, and explicitly accepted before Phase 1 or later implementation begins.

Scope:

- Restore precise proposed API gating:
  - `isProposedApiEnabled()` must check whether the requested proposal exists in `extension.enabledApiProposals`.
  - Any Director-owned proposed API exception must be explicit and narrow.
  - `vscode.mermaid-chat-features` should keep `chatOutputRenderer` but not receive `chatParticipantAdditions`.
  - Audit `extHostLanguageModelTools` call sites while restoring this gate. In particular, `getTools()` must not use `chatParticipantPrivate` as the proxy for `chatParticipantAdditions`; tool API-object shape and `options.model` attachment must be gated by the exact proposal being used.
- Add language model proxy recursion protection:
  - Guard `getLanguageModelByIdentifier()` and `selectLanguageModels()` against re-entering the same missing-model recovery path.
  - After one failed recovery attempt, return a controlled unavailable result or controlled error instead of recursively selecting again.
  - Rate-limit or de-duplicate repeated warnings for the same extension/model pair.
- Add targeted regression coverage or an equivalent minimal validation script:
  - proposal gating returns true only for the requested proposal and false for unrelated proposals
  - an extension that declares only `chatOutputRenderer` does not receive `chatParticipantAdditions` behavior
  - missing model recovery is bounded and cannot recurse through `selectLanguageModels()` indefinitely
- Re-test Mermaid after the runtime fixes.

Acceptance gate:

- `renderMermaidDiagram` completes without tool timeout.
- Mermaid invocation does not attach `options.model` to the Mermaid extension.
- Extension host logs do not show repeated `LanguageModelProxy` warnings for `vscode.mermaid-chat-features`.
- CPU and memory idle after Mermaid rendering is a user-owned manual check on the packaged build. Agent-side Phase 0 validation focuses on completing without timeout, eliminating the warning storm, and avoiding extension-host instability.
- Confirmation behavior is verified with global auto-approve both enabled and disabled.
- Targeted proposed-API and missing-model-recursion regression coverage passes, or the exact reason it cannot be automated is recorded before the hotfix is handed to the user.
- The resulting changes are captured in the correct 116 replay patch stage, normally `004-director-agent-engine.116.patch`.
- Any touched extension-host runtime paths are covered by the generator classification rules for `agent-engine`, or the plan explicitly records a different runtime stage before patch generation.
- Build smoke passes after the runtime changes.
- The user manually accepts the Phase 0 build/runtime behavior before Phase 1 implementation starts.

### Phase 1: Tool Registry And Mode Policy Gate

Scope:

- Introduce a central Director tool registry with these fields for every Director-owned tool:
  - stable model-facing name
  - internal VS Code tool id or Director tool id
  - description and JSON schema
  - read-only/write/execute classification
  - allowed chat modes
  - confirmation/auto-approval policy
  - backing VS Code service or Director implementation
  - required model/result capabilities, such as image input support or a textual fallback for image tools
- Use Copilot-compatible model-facing names as primary names wherever a Copilot-compatible capability exists. Director-specific names may exist as internal ids or aliases, but the model-facing vocabulary must use names such as `read_file`, `grep_search`, and `github_repo` as the primary names.
- Make the Director agent/tool bridge consume the registry for the actual model-facing tool list. It must not expose unreviewed tools by directly forwarding all `toolsService.getTools()` results.
- Create an explicit migration table for every currently visible Director/VS Code core tool before the registry becomes authoritative:
  - `keep`: expose unchanged in the allowed modes
  - `wrap`: keep the backing implementation but expose through a Director schema/name/policy wrapper
  - `rename`: expose under a Copilot-compatible model-facing name while preserving any internal id needed by VS Code
  - `hide`: remove from the model-facing list because it is unsafe, duplicated, obsolete, or mode-inappropriate
  - `defer`: intentionally leave out of v1 with a reason and later owner
- Build the migration table from observed runtime data, not memory:
  - dump the current raw Director/VS Code tool list before registry filtering
  - dump the registry-computed allowlist per mode after registry filtering
  - compare both lists and record every tool's disposition
  - keep the table in `docs/upgrade/reports/116-stable-win32-x64-client/tool-migration-report.md`
  - keep the report stable and sanitized: no API keys, tokens, user absolute paths, machine-specific temporary paths, volatile timestamps, or secret-derived model/provider state
- The migration table must cover at least the currently useful Director/VS Code core tools already observed in 116: terminal, task, confirmation, todo, subagent, fetch, usages, rename, setup/new workspace, and the internal VS Code edit tool.
- The internal VS Code edit tool must be explicitly marked `hide`, `wrap`, or `defer` before Phase 4 starts. It must not remain exposed beside Director-native reviewable edit tools unless it is wrapped by the same edit contract and policy.
- Fix the mode policy for v1:
  - Ask: Q&A plus reviewed read-only tools only.
  - Edit: read/search context plus reviewable edit tools only.
  - Agent: read/search/edit/diagnostics/SCM/GitHub plus terminal/task tools.
  - Inline: no tools initially; inline should use selected editor context and the edit adapter.
- Ask v1 allows these read-only categories when available:
  - file/directory read
  - workspace file/text search
  - diagnostics/problems
  - SCM changed files
  - GitHub repository context and controlled search fallback
  - image view only if the selected model can consume image results or a textual fallback is available
- Ask v1 does not allow edit, create/delete, terminal, task, shell, workspace mutation, or MCP mutation tools by default.
- Add a diagnostic dump/log path for the registry-computed tool allowlist per mode. Runtime effective tool lists are validated later after Ask/Edit/Inline routing is wired, but Agent requests should already use the registry-filtered list in this phase.

Acceptance gate:

- Registry-computed allowlists can be inspected for Ask, Edit, Agent, and Inline without requiring full runtime mode routing yet.
- The computed Ask allowlist contains no write/execute tools.
- The computed Agent allowlist preserves existing terminal/task tools.
- The migration table records the disposition for each existing useful tool, so the registry rollout does not accidentally remove fetch/usages/rename/setup/todo/subagent/confirmation behavior.
- Raw tool list, registry-computed allowlists, and migration table are captured in `docs/upgrade/reports/116-stable-win32-x64-client/tool-migration-report.md` before Phase 2 starts.
- The tool migration report is deterministic enough for review and does not contain secrets or machine-local paths.
- Tool schema, description, mode policy, and confirmation policy are centralized rather than scattered across the agent bridge.
- A real Director Agent request uses the registry-filtered tool list rather than an unfiltered tool service enumeration.
- New files are classified into `007-director-tool-layer.116.patch` or an explicitly chosen existing stage.
- A build smoke or typecheck catches registry/schema wiring errors.

### Phase 2: Read-Only Workspace Tools And GitHub V1 Gate

Scope:

- Implement Director-owned read-only workspace tools first:
  - `read_file`
  - `list_dir`
  - `file_search`
  - `grep_search`
  - `get_errors`
  - `get_changed_files` as minimal read-only SCM state, or a controlled not-supported result if the low-risk Git API path is not ready
  - `view_image`
  - `github_repo` as minimal read-only repository context, or a controlled auth/permission/not-supported result if mature search is not ready
- Implement secondary read-only tools if the backing services are straightforward after the first set:
  - `read_project_structure`
  - `search_workspace_symbols`
  - `test_search`
  - `test_failure`
- Use VS Code services instead of shell commands where possible:
  - file/workspace services for file reads and directory listing
  - search services for file/text search
  - marker services for diagnostics
  - SCM/Git extension APIs for changed files only where the API path is straightforward and low-risk
  - authentication and GitHub extension utilities for GitHub auth/repo parsing where available
- Add safety limits and controlled failure behavior:
  - workspace-relative and absolute path normalization
  - external path confirmation or rejection
  - binary detection
  - large file truncation
  - max result counts
  - cancellation and timeout handling
  - ignored/excluded file behavior documented in each tool
- Define GitHub v1 as non-blocking read-only repository context plus controlled search fallback:
  - `repo` may be inferred from a workspace GitHub remote or passed explicitly as `owner/repo` or a GitHub URL.
  - `query` searches repository context only when a local or API-backed implementation path is available.
  - Use VS Code GitHub authentication when available.
  - If auth, permissions, repository access, or remote search support is missing, return a controlled tool result explaining the limitation.
  - Keep v1 intentionally small and reliable. It may ship with repo identification, authentication status, basic metadata, and controlled search/fallback behavior rather than mature Copilot-like repository intelligence.
  - Do not implement PR/issue mutation or Copilot remote-index equivalence in v1.
  - Full Git/GitHub parity work must not block the runtime, tool registry, Ask/Edit/Agent routing, or reviewable edit phases.

Acceptance gate:

- Agent can call `read_file`, `list_dir`, `file_search`, `grep_search`, `get_errors`, `get_changed_files`, `view_image`, and `github_repo` by stable model-facing names.
- Ask can call only the approved read-only subset and still cannot edit files or execute commands.
- `read_file` handles normal text, large files, binary files, missing files, and external paths predictably.
- Search tools respect workspace roots and VS Code search/exclude behavior or clearly document any intentional difference.
- `get_errors` returns current Problems/markers for a test workspace.
- `get_changed_files` returns staged, unstaged, untracked, and merge-conflict state where the chosen API supports it; otherwise it returns a clear controlled not-supported result and is tracked for the later Git iteration.
- `github_repo` works for basic repository identification/auth status when available, or returns a clear controlled auth/permission/not-supported result. Mature remote indexing/search is explicitly outside this phase.
- Existing Agent terminal/task tool invocation still works.
- Read-only tool changes are captured in `007-director-tool-layer.116.patch` unless a later Git/GitHub decision assigns a narrower stage.

### Phase 3: Chat Editing Contract Gate

Scope:

- Implement a Director-owned edit contract before exposing edit tools:
  - target path/URI resolution
  - edit intent and explanation
  - edit start/progress/done response parts
  - binding to the current chat session and request id
  - compact textual tool result returned to the model loop
- Remove last-request binding from edit paths that are kept or wrapped. Any Director edit tool, wrapped VS Code edit tool, or reused edit helper must resolve the target request by `chatRequestId` and `chatSessionResource` where available; it must not rely on `getRequests().at(-1)` as the production binding mechanism.
- Start with a spike/probe using a synthetic internal single-file edit tool before implementing production edit tools:
  - confirm which VS Code 116 response parts must be emitted (`textEdit`, `textEditGroup`, `workspaceEdit`, or current equivalent)
  - confirm how `ChatEditingService` observes those parts and creates accept/reject entries
  - confirm the correct `chatSessionResource` and `chatRequestId` binding path
  - keep the probe internal or remove it after the contract is proven
- Include a reviewable directory-creation probe in the edit contract spike:
  - confirm whether VS Code 116 Chat Editing UI can represent directory creation as a `WorkspaceEdit` resource operation or equivalent reviewable operation
  - if a directory-only operation is not natively rendered by Chat Editing UI, define a Director-owned review transaction that shows the operation in chat progress, performs `mkdir` only on accept or rolls it back on reject, and still reports a compact tool result to the model
  - `create_directory` is mandatory for this iteration and must not be deferred because the native UI path is inconvenient
- Add an EditorInline response contract spike before Phase 5:
  - confirm which response parts or inline-session APIs produce an actual edit in `EditorInline`
  - confirm selected-range/current-editor binding
  - confirm how inline accept/reject or direct application is surfaced in VS Code 116
  - document any difference between panel Chat Editing UI and inline edit application
  - this spike is not required to block Phase 4 edit-tool implementation, but Phase 5 cannot pass until it is complete
- Define the non-tool EditorInline edit protocol before Phase 5:
  - shape the prompt around selected editor context and expected edit intent
  - parse the model response into concrete `TextEdit` operations or the VS Code 116 inline-edit equivalent
  - bind edits to the active inline session, selected range, and current editor URI
  - apply or stream edits through the inline session path, not through model-callable edit tools
  - return concise user-visible failure output if the response cannot be mapped, while still treating that as a blocker for final Phase 5 acceptance
- Prefer Director-native edit/apply-patch tools that emit VS Code Chat Editing UI progress directly. Reuse upstream VS Code services where helpful, but do not depend on Copilot endpoints.
- Ensure every reviewable edit can produce `textEditGroup` or `workspaceEdit` response parts observed by `ChatEditingService`.
- Ensure the shared edit adapter has separate bindings for panel chat requests and EditorInline requests; do not assume the panel `ChatEditingService` path alone fixes inline.
- Keep non-reviewable mutation tools out of Agent/Edit until wrapped.
- Add a minimal internal validation path for a single-file edit through the new contract before implementing the full edit tool set.

Acceptance gate:

- A controlled single-file edit creates a reviewable Chat Editing UI diff.
- Accept applies the change.
- Reject leaves or restores the original file content.
- The exact VS Code 116 response parts and request-binding path are documented before production edit tools are added.
- The exact review/reject mechanism for directory creation is documented before Phase 4 begins.
- The exact EditorInline response/edit binding path is documented before Phase 5 mode routing is considered complete; this is a Phase 5 prerequisite, not a blocker for Phase 4.
- The non-tool EditorInline edit protocol is documented and has a single-range edit validation before Phase 5 mode routing is considered complete; this is a Phase 5 prerequisite, not a blocker for Phase 4.
- The edit progress is attached to the correct chat request.
- Edit progress for production tools is bound by `chatRequestId`/session, not by the last request in the session.
- The Director agent loop receives a compact success/error result and can continue after the edit.
- Direct file mutation paths are not exposed as Agent/Edit tools by default.
- The synthetic edit probe is removed or kept behind an internal-only path before release. It must not appear in the model-visible tool registry, command palette, settings UI, or user-facing chat tool list.
- Edit contract changes are captured in `008-director-chat-editing.116.patch` or a documented bridge exception in `004`.

### Phase 4: Reviewable Edit Tools Gate

Scope:

- Implement edit-capable tools on top of the Phase 3 contract:
  - `apply_patch`
  - `create_file`
  - `create_directory`
  - `replace_string_in_file`
  - `multi_replace_string_in_file`
- Keep tool behavior conservative:
  - edits must resolve inside an allowed workspace path unless explicitly confirmed
  - patch conflicts return controlled errors
  - duplicate file creation returns a controlled error or requires explicit overwrite behavior
  - directory creation is mandatory and must be reviewable/rejectable through the Phase 3 directory-creation mechanism
  - large or binary targets are rejected unless a later design explicitly supports them
  - no silent direct writes outside Chat Editing UI for Agent/Edit
- Reclassify the tools:
  - Ask: unavailable
  - Edit: available if reviewable
  - Agent: available if reviewable
  - Inline: unavailable as model-callable tools in v1; EditorInline still must use the shared edit adapter to produce a real editor edit without exposing tool calls to the inline model flow

Acceptance gate:

- Agent can complete a full loop: search, read, edit, show diff, accept/reject.
- Edit tools always produce reviewable output. For text/file edits this should be VS Code Chat Editing UI output; for `create_directory`, a documented Director-owned accept/reject transaction is acceptable when VS Code 116 does not natively render directory creation as Chat Editing UI.
- Reject works for each edit tool.
- `create_directory` creates the target directory only after accept or removes/restores it on reject according to the documented Phase 3 mechanism.
- Tool failures are visible to the model as structured, concise errors.
- Existing read-only and terminal tools remain available in the correct modes.
- Edit tool implementations are captured in `008-director-chat-editing.116.patch` or `009-director-edit-tools.116.patch`, depending on final size and cohesion.

### Phase 5: Ask/Edit/Inline Mode Gate

Scope:

- Register or select Director participants/profiles for supported modes:
  - Ask uses Q&A prompt shaping and the read-only tool subset.
  - Agent remains the full Director autonomous harness.
  - Edit uses the shared edit adapter and reviewable edit tools.
  - EditorInline uses selected editor context and the shared edit adapter.
- Ask should use current file, selection, attachments, workspace folder, custom instructions, and history, but it should not start an editing session.
- Edit should prefer explicit working-set files and conservative range/full-file mapping before any broader autonomous discovery.
- Inline should never silently no-op. During development, a controlled fallback message or route to panel Edit is acceptable only as an intermediate diagnostic state.
- Phase 5 final acceptance requires EditorInline to produce a real editor edit for the selected range/current editor context. A fallback-only inline path is a release blocker and cannot satisfy the final Phase 5 gate.
- Inline does not expose model-callable tools in v1; it must obtain edits through selected editor context plus the non-tool EditorInline edit protocol and shared edit adapter verified in Phase 3.
- Preserve the Director settings entry and Agent Customizations integration while wiring modes. The active owner for that UI work is `docs/upgrade/116-agent-customizations-director-settings-plan.md`; Phase 5 should not be considered complete until that plan is implemented.
- Validate runtime effective tool lists after routing is wired, not only the registry-computed allowlists from Phase 1.

Acceptance gate:

- Chat panel Ask/Edit/Agent all route to Director.
- Ask answers code questions and can use read-only tools without exposing mutation tools.
- Edit produces Chat Editing UI diffs.
- Inline produces an editor edit for the selected range/current editor context. Any controlled fallback observed during diagnostics must be resolved before Phase 5 passes.
- Runtime effective tool lists match the Phase 1 policy for Ask, Edit, Agent, and Inline.
- Director settings entry and Agent Customizations integration are present, with the implementation tracked through `docs/upgrade/116-agent-customizations-director-settings-plan.md`.
- Routing/UI changes are captured in `005-director-chat-built-in-mode.116.patch`; shared edit adapter code remains in the edit-stage patch.
- Switching between Ask/Edit/Agent does not regress the existing Director Agent loop.

### Phase 6: Package And Regression Gate

Scope:

- Build the installable package using the repeatable 116 build script:
  - preferred PowerShell entry: `.\scripts\build-director-116.ps1`
  - cmd wrapper: `.\scripts\build-director-116.cmd`
  - default profile: `docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - default target: `vscode.generated`
  - release-candidate/package validation must not use `-SkipReplay`; `-SkipReplay` is only for fast local development against an already materialized tree
- Install and launch a clean Director Code build.
- Clear stale Director Code NLS cache before runtime smoke to avoid false blank-workbench failures from old localized message caches:
  - `Remove-Item -Recurse -Force "$env:APPDATA\Director-Code\clp" -ErrorAction SilentlyContinue`
- Use a clean or explicitly documented user-data/profile state for packaged smoke. Do not rely on stale user settings such as prior `chat.tools.global.autoApprove` values when validating confirmation behavior.
- Run manual smoke tests across runtime stability, mode routing, tools, editing UI, inline, and GitHub v1.
- Verify the Director settings entry and Agent Customizations integration remain present.
- Run the validation plan from `docs/upgrade/116-agent-customizations-director-settings-plan.md`, including opening Agent Customizations from the Agent view, confirming the Director Code entry, opening Director Code Settings from that entry, and checking the model provider management path.
- Run replay validation from clean upstream inputs:
  - `node scripts/upgrade/validate-series.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - `bash scripts/upgrade/materialize-vscode.sh --profile docs/upgrade/profiles/116-stable-win32-x64-client.json --target vscode.generated --up-to-layer director --force`
  - `node scripts/upgrade/canonical-manifest.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
  - If canonical manifest drift is expected after reviewed source changes, regenerate it with `node scripts/upgrade/canonical-manifest.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json --write` and then rerun validation.

Acceptance gate:

- Installable package builds successfully through `scripts/build-director-116.ps1` or `scripts/build-director-116.cmd`.
- The expected installer artifacts are produced under `artifacts/out/stable/win32-x64`:
  - `system-setup/Director-CodeSetup-x64-<version>.exe`
  - `user-setup/Director-CodeUserSetup-x64-<version>.exe`
- SHA-256 hashes are printed by the build script for copied installer artifacts.
- New install launches with visible UI.
- The product/default-agent contract remains replay-backed: `defaultChatAgent.provider` keeps the full VS Code 116 object shape in the generated product, the expected product JSON, and the product override validator.
- Director settings UI entry exists.
- Agent Customizations integration exists through `docs/upgrade/116-agent-customizations-director-settings-plan.md`; if it is not implemented, this package is not considered a complete release candidate.
- The Agent Customizations validation plan in `docs/upgrade/116-agent-customizations-director-settings-plan.md` passes.
- Mermaid renders without timeout. CPU/memory idle after rendering is covered by the user's packaged-build manual check.
- Ask/Edit/Agent route to Director.
- Inline produces a real editor edit, not only a fallback/no-op response.
- Phase 2 read-only tools and GitHub v1 are visible and behave according to policy.
- Agent edit tools produce accept/reject UI.
- Existing terminal/task tools still work in Agent mode.
- Every existing tool marked `keep` or `wrap` in the Phase 1 migration table is smoke-verified according to its policy, including visibility in allowed modes and absence from disallowed modes.
- Every existing tool marked `hide` or `defer` in the Phase 1 migration table is absent from the model-facing tool list, with the reason recorded in the migration artifact.
- A clean replay materialization from upstream inputs includes all completed changes without relying on hand-edited `vscode.generated` contents.
- Patch series validation passes, or the exact blocker is recorded before packaging is considered incomplete.
- Canonical replay validation passes against the final Director tree, or the exact blocker is recorded before packaging is considered incomplete.

## Phase Gate Checklist

- Replay Stage Enablement Gate passes before Phase 1 or later creates new patch stages.
- Phase 0 passes before broader chat/tool work begins.
- The user manually accepts the standalone Phase 0 runtime hotfix build before Phase 1 or later implementation begins.
- Phase 1 passes before implementing more tools.
- Phase 2 read-only tools pass before exposing edit tools.
- Phase 3 edit contract passes before implementing `apply_patch`/create/replace tools.
- Phase 4 edit tools pass before treating Agent editing parity as complete.
- Phase 5 mode routing passes before packaging a release candidate.
- Phase 6 package/regression passes before considering the 116 upgrade iteration complete.
- No phase is complete until generated-tree edits have been converted into replay assets and verified by a clean materialize run.

## Files To Review During Implementation

Replay tooling files:

- `scripts/upgrade/generate-director-patches.mjs`
- `scripts/upgrade/generate-series.mjs`
- `scripts/upgrade/validate-series.mjs`
- `scripts/upgrade/materialize-vscode.mjs`
- `scripts/upgrade/materialize-vscode.sh`
- `scripts/upgrade/canonical-manifest.mjs`
- `docs/upgrade/profiles/116-stable-win32-x64-client.json`
- `patches/series.116.json`

Director runtime files:

- `vscode.generated/layers/director/vscode/src/vs/workbench/services/extensions/common/extensions.ts`
- `vscode.generated/layers/director/vscode/src/vs/workbench/api/common/extHostLanguageModelTools.ts`
- `vscode.generated/layers/director/vscode/src/vs/workbench/api/common/extHostLanguageModels.ts`
- `vscode.generated/layers/director/vscode/src/vs/workbench/contrib/chat/browser/tools/languageModelToolsService.ts`
- `vscode.generated/layers/director/vscode/src/vs/workbench/contrib/chat/browser/agentEngine/agentEngine.contribution.ts`
- `vscode.generated/layers/director/vscode/src/vs/workbench/contrib/chat/browser/agentEngine/directorCodeAgent.ts`
- `vscode.generated/layers/director/vscode/src/vs/workbench/contrib/chat/browser/agentEngine/directorCodeModelProvider.ts`
- `vscode.generated/layers/director/vscode/src/vs/workbench/contrib/chat/browser/agentEngine/progressBridge.ts`
- `vscode.generated/layers/director/vscode/src/vs/workbench/contrib/chat/browser/agentEngine/toolBridge.ts`
- `vscode.generated/layers/director/vscode/src/vs/workbench/contrib/chat/browser/aiCustomization/`
- `vscode.generated/layers/director/vscode/src/vs/workbench/contrib/chat/common/aiCustomizationWorkspaceService.ts`
- `vscode.generated/layers/director/vscode/src/vs/workbench/contrib/chat/common/tools/builtinTools/`
- `vscode.generated/layers/director/vscode/src/vs/workbench/services/search/common/search.ts`
- `vscode.generated/layers/director/vscode/src/vs/platform/markers/common/markers.ts`
- `vscode.generated/layers/director/vscode/src/vs/workbench/contrib/scm/common/scm.ts`
- `vscode.generated/layers/director/vscode/extensions/git/src/api/api1.ts`
- `vscode.generated/layers/director/vscode/extensions/git/src/api/git.d.ts`
- `vscode.generated/layers/director/vscode/extensions/github/src/auth.ts`
- `vscode.generated/layers/director/vscode/extensions/github/src/util.ts`
- `vscode.generated/layers/director/vscode/extensions/github/src/commands.ts`
- `vscode.generated/layers/director/vscode/extensions/github-authentication/src/common/utils.ts`
- `vscode.generated/layers/director/vscode/src/vs/workbench/contrib/inlineChat/browser/inlineChatController.ts`
- `vscode.generated/layers/director/vscode/src/vs/workbench/contrib/inlineChat/browser/inlineChatSessionServiceImpl.ts`
- `vscode.generated/layers/director/vscode/extensions/mermaid-chat-features/src/chatOutputRenderer.ts`

Upstream VS Code/Copilot reference files:

- `vscode.generated/layers/vscode/vscode/extensions/copilot/src/extension/conversation/vscode-node/chatParticipants.ts`
- `vscode.generated/layers/vscode/vscode/extensions/copilot/src/extension/intents/node/askAgentIntent.ts`
- `vscode.generated/layers/vscode/vscode/extensions/copilot/src/extension/intents/node/unknownIntent.ts`
- `vscode.generated/layers/vscode/vscode/extensions/copilot/src/extension/intents/node/agentIntent.ts`
- `vscode.generated/layers/vscode/vscode/extensions/copilot/src/extension/intents/node/editCodeIntent.ts`
- `vscode.generated/layers/vscode/vscode/extensions/copilot/src/extension/tools/common/toolNames.ts`
- `vscode.generated/layers/vscode/vscode/extensions/copilot/src/extension/tools/node/allTools.ts`
- `vscode.generated/layers/vscode/vscode/extensions/copilot/src/extension/tools/node/readFileTool.tsx`
- `vscode.generated/layers/vscode/vscode/extensions/copilot/src/extension/tools/node/listDirTool.tsx`
- `vscode.generated/layers/vscode/vscode/extensions/copilot/src/extension/tools/node/findFilesTool.tsx`
- `vscode.generated/layers/vscode/vscode/extensions/copilot/src/extension/tools/node/findTextInFilesTool.tsx`
- `vscode.generated/layers/vscode/vscode/extensions/copilot/src/extension/tools/node/getErrorsTool.tsx`
- `vscode.generated/layers/vscode/vscode/extensions/copilot/src/extension/tools/node/viewImageTool.tsx`
- `vscode.generated/layers/vscode/vscode/extensions/copilot/src/extension/tools/node/readProjectStructureTool.ts`
- `vscode.generated/layers/vscode/vscode/extensions/copilot/src/extension/tools/node/searchWorkspaceSymbolsTool.tsx`
- `vscode.generated/layers/vscode/vscode/extensions/copilot/src/extension/tools/node/findTestsFilesTool.tsx`
- `vscode.generated/layers/vscode/vscode/extensions/copilot/src/extension/tools/node/applyPatchTool.tsx`
- `vscode.generated/layers/vscode/vscode/extensions/copilot/src/extension/tools/node/createFileTool.tsx`
- `vscode.generated/layers/vscode/vscode/extensions/copilot/src/extension/tools/node/createDirectoryTool.tsx`
- `vscode.generated/layers/vscode/vscode/extensions/copilot/src/extension/tools/node/replaceStringTool.tsx`
- `vscode.generated/layers/vscode/vscode/extensions/copilot/src/extension/tools/node/multiReplaceStringTool.tsx`
- `vscode.generated/layers/vscode/vscode/extensions/copilot/src/extension/tools/node/scmChangesTool.ts`
- `vscode.generated/layers/vscode/vscode/extensions/copilot/src/extension/tools/node/githubRepoTool.tsx`
- `vscode.generated/layers/vscode/vscode/extensions/copilot/src/extension/prompts/node/panel/panelChatBasePrompt.tsx`
- `vscode.generated/layers/vscode/vscode/extensions/copilot/src/extension/prompts/node/panel/editCodePrompt.tsx`
- `vscode.generated/layers/vscode/vscode/extensions/copilot/src/extension/intents/node/editCodeStep.ts`
- `vscode.generated/layers/vscode/vscode/extensions/copilot/src/extension/prompts/node/codeMapper/codeMapperService.ts`
- `vscode.generated/layers/vscode/vscode/src/vs/workbench/contrib/chat/common/participants/chatAgents.ts`
- `vscode.generated/layers/vscode/vscode/src/vs/workbench/contrib/chat/common/model/chatModel.ts`
- `vscode.generated/layers/vscode/vscode/src/vs/workbench/contrib/chat/browser/chatEditing/chatEditingServiceImpl.ts`
- `vscode.generated/layers/vscode/vscode/src/vs/workbench/contrib/chat/common/tools/builtinTools/editFileTool.ts`

## Fixed Decisions

- Ask v1 is Q&A plus reviewed read-only tools. It may use file/directory read, workspace search, diagnostics, SCM, GitHub repository context with controlled search fallback, and image view when safe. It must not expose edit, terminal, task, shell, workspace mutation, or MCP mutation tools by default.
- Director tool model-facing names must use Copilot-compatible names as the primary names wherever a Copilot-compatible capability exists. Director-specific ids can remain internal implementation details or compatibility aliases.
- GitHub v1 is a deliberately small, non-blocking read-only repository context capability. It should infer repos from workspace GitHub remotes or accept explicit `owner/repo`/GitHub URL input, use VS Code GitHub authentication when available, and return controlled errors for auth/permission/not-supported states. It may ship with repo identification, auth status, basic metadata, and controlled search/fallback behavior. It should not promise Copilot remote-index parity, and mature Git/GitHub tooling remains a later iteration.
- Agent/Edit editing should use Director-native reviewable edit tools that emit VS Code Chat Editing UI progress directly. Upstream VS Code services can be reused, but Copilot endpoints should not be a dependency.
- Director Edit v1 should start with conservative selected/current-file and explicit-working-set edits. A richer code-block-to-edit mapper can be added after basic edit streaming is stable.
- Inline v1 must not silently no-op. Final Phase 5/6 acceptance requires a real editor edit through the EditorInline edit binding path; a controlled fallback is acceptable only as an interim blocker while implementation is still in progress.
- Missing model recovery should stop after a bounded attempt and return a controlled unavailable result or controlled error. It must not recurse or spam logs.
- Phase 0 runtime changes stay in `004-director-agent-engine.116.patch` by default; the generator classification rules must be expanded for any touched extension-host runtime paths.
- New `007`/`008`/`009` stages are only introduced when they contain real source changes and are fully wired into generator/profile/series validation.
- Known replay stages and profile-enabled replay stages must stay separate in generator logic, so planned-but-unused stages do not force empty patch files.
- Agent Customizations bridge files are owned by `005-director-chat-built-in-mode.116.patch` by default.

## Remaining Follow-Ups

- Mermaid auto-approval policy should be decided after Phase 0 confirms whether confirmation UI is actually involved when global auto-approve is disabled.
- Mature Git/GitHub tooling should be treated as a later dedicated iteration after a better reference implementation is available. This includes richer repository search/indexing, PR/issue workflows, branch/commit intelligence, and more advanced git-related tools.
- GitHub v1 may later grow a richer remote search/index backend, but that is outside the first acceptance gate.
- Notebook tools, broad VS Code command execution, extension installation, memory, and agent-switching remain deferred unless product scope changes.
