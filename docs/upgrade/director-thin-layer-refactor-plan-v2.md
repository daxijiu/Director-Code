# Director-Code Thin Layer Refactor Plan v2

Date: 2026-05-14

Status: active plan

Supersedes: `docs/upgrade/director-thin-layer-refactor-plan.md`

## Summary

This plan reduces future VS Code/VSCodium upgrade cost by making Director a thinner layer over upstream.

The release source of truth remains `profile + replay patches + expected contracts + canonical manifest`. We do not switch to a pure VS Code fork. The main change is structural: move Director-owned business logic into a dedicated `directorCode/` module and leave upstream chat/agent files as thin hooks.

Tool parity is intentionally source-based, not full Copilot parity. This plan preserves Director's current model-facing capabilities, directly reuses VS Code core tools where possible, and uses clean Copilot metadata only as a static naming/schema reference where Director must keep its own implementation. Reviewable edit tools remain Director-owned and are not part of Copilot `editFiles` parity in this plan.

## Key Decisions

- Keep the three-layer source model: clean VS Code -> VSCodium layer -> Director layer.
- Keep `vscode.generated` as a generated debug/build tree, not long-term source truth.
- Do not add a final `010` refactor patch. The final canonical replay must write refactor results back into the existing semantic stages.
- Move Director-owned logic to `src/vs/workbench/contrib/directorCode/`.
- Leave upstream chat/agent files with only registration, import hooks, bridge calls, and compatibility glue.
- Use clean VS Code Copilot metadata only as a static reference for Copilot-extension-backed facade names and schemas. Do not restore, depend on, or package the Copilot extension runtime.
- Accepted tool strategy source: `docs/upgrade/reports/116-stable-win32-x64-client/tool-source-and-strategy-analysis.html` (`file:///E:/Projects/Director-Code-batch/Director-Code-112-check/docs/upgrade/reports/116-stable-win32-x64-client/tool-source-and-strategy-analysis.html`).
- Follow the accepted report's source classification:
  - VS Code core tools are direct-reuse candidates. This includes `runSubagent`, terminal/task tools, `todo`, `askQuestions`, browser tools, extension search, and `renderMermaidDiagram`.
  - Copilot extension tools are not runtime dependencies. If Director has the capability, keep the Director implementation and only align model-facing names/schemas where useful.
  - Copilot-only service or high-risk mutation tools remain deferred unless a separate product/security plan accepts them.
- Keep reviewable edit tools Director-owned. This plan does not implement Copilot edit tool parity and does not make `editFiles` model-callable.
- Preserve current Director tool capabilities unless a later explicit product decision removes them. In particular, `create_file` and `create_directory` remain available until their `createFile` and `createDirectory` facade cutover is implemented.
- Keep VSCodium as the lower layer; audit and isolate it, but do not rewrite it in this refactor.

## Execution Protocol

- Execute the plan in independently testable waves. A code/replay wave is complete only after its docs/reports, replay patches, per-wave validation commands, and targeted tests pass.
- Per-wave validation means replay validators plus the targeted tests for files touched in that wave. The full Test Plan is required in Phase 6 and before any release handoff.
- After each completed wave, update `.claude/memory.md`, commit the completed wave, push it to the remote, and then continue to the next wave.
- Do not create or maintain a root `CLAUDE.md` for this plan unless the repository later introduces one. The current memory file is `.claude/memory.md`.
- Do not commit a wave with failing tests or unresolved replay validation failures.
- Before Phase 5, the commercial/name grep gate blocks only waves that touch user-visible product identity, packaged output, installer metadata, gallery/marketplace behavior, chat setup/status/model picker, or other user-reachable branded text. After Phase 5, the commercial/name grep gate blocks every wave.
- This planning package is a completed planning wave once this document is updated, `.claude/memory.md` records the accepted plan, and the documentation self-check passes.

## Implementation Phases

### 1. Baseline And Surface Inventory

- Record the current 116 baseline: Phase 0-6 reports, package regression status, installer hashes, accepted tool strategy report, and current untracked generated artifacts.
- Produce `docs/upgrade/reports/116-stable-win32-x64-client/director-surface-inventory.md`.
- Classify current Director patch surface into:
  - `must-touch upstream hook`
  - `Director-owned logic`
  - `declarative product config`
  - `defer/remove`
- `director-surface-inventory.md` must list every current upstream chat/agent file touched by Director and the exact hook reason for that touch.
- Update replay path classification so new `directorCode/` files land in the existing semantic stages:
  - Agent loop, message normalization, progress bridge, model provider, BYOK, settings: `004-director-agent-engine.116.patch`
  - Chat built-in mode, Agent Customizations bridge, commercial-flow gating: `005-director-chat-built-in-mode.116.patch`
  - Tool registry, direct-reuse allowlist, and Director-owned tool facades: `007-director-tool-layer.116.patch`
  - Chat Editing adapter and shared reviewable edit protocol: `008-director-chat-editing.116.patch`
  - Director-owned reviewable edit tools: `009-director-edit-tools.116.patch`

### 2. Director Module Extraction

- Create the `src/vs/workbench/contrib/directorCode/` module structure for Director-owned common, browser, and test code.
- Move Director-owned agent harness, provider/BYOK, message normalization, progress bridge, mode routing, settings, and editing adapter logic into `directorCode/` in small verified groups.
- Keep upstream chat/agent files as thin hooks only. They may register, import, bridge, or pass context/product compatibility data, but must not contain Director provider, prompt, schema, retry, streaming, tool policy, or edit policy logic.
- Do not move Director-owned tool implementations in this phase if it would require a separate facade rename pass. Tool implementations and model-facing name cutovers are handled in Phase 3 to avoid double churn.
- Phase 2 completion requires `director-surface-inventory.md` to explain every remaining upstream chat/agent hook. Unexplained upstream chat/agent business logic blocks the phase.
- After each group, regenerate the existing semantic replay patch, update ownership reports, and run targeted tests.

### 3. Tool Facade And Name Cutover

- Produce `docs/upgrade/reports/116-stable-win32-x64-client/tool-facade-research.md` before Phase 3 code changes.
- `tool-facade-research.md` is a hard gate. It must be reviewed and accepted before any tool facade cutover, direct-reuse allowlist change, browser tool exposure, or model-facing tool rename is implemented.
- Use the accepted source report as the required starting point:
  - `docs/upgrade/reports/116-stable-win32-x64-client/tool-source-and-strategy-analysis.html`
- Use one table. Each row must include:
  - VS Code UI name
  - upstream model-facing name or `toolReferenceName`
  - upstream source class from the accepted report
  - upstream schema summary
  - current Director tool
  - accepted input schema
  - ignored/rejected fields
  - return format strategy
  - safety and mode policy
  - final status
- Tool metadata source priority:
  - Accepted source report: `docs/upgrade/reports/116-stable-win32-x64-client/tool-source-and-strategy-analysis.html`
  - VS Code core or retained extension source files for direct-reuse tools
  - `vscode.generated/layers/vscode/vscode/extensions/copilot/package.json` for Copilot-extension-backed facade names and schemas
  - `.cache/upstreams/vscode/<tag>/extensions/copilot/package.json` if the clean VS Code layer is not materialized
- Director facade cutover scope:
  - `readFile`
  - `listDirectory`
  - `fileSearch`
  - `textSearch`
  - `problems`
  - `changes`
  - `viewImage`
  - `createFile`
  - `createDirectory`
  - `fetch`
  - `githubRepo`
- Direct-reuse allowlist scope:
  - Keep `runSubagent`, terminal/task tools, `todo`, and `askQuestions` directly backed by VS Code core.
  - Add `renderMermaidDiagram` to the Director Agent direct-reuse allowlist by reusing the retained `extensions/mermaid-chat-features` tool. Do not reimplement it.
  - Directly reuse VS Code core browser tools. The research report must document the accepted safety, confirmation, and mode policy for browser interaction tools, but their implementation source remains VS Code core.
  - Enable Director Agent access to VS Code core browser tools by default through Director registry policy and confirmation controls. `workbench.browser.enableChatTools` must not be the only safety boundary.
  - Browser mutation/interaction tools require pre-approval: `clickElement`, `dragElement`, `handleDialog`, `navigatePage`, `openBrowserPage`, `runPlaywrightCode`, and `typeInPage`. `runPlaywrightCode` must also record the submitted code and a result summary in the tool result/audit path.
  - `extensions` remains in Phase 3 direct-reuse scope, but it cannot be exposed until the product/gallery/marketplace wording and commercial policy are documented and pass the commercial/name grep gate.
- Valid final statuses:
  - `direct-reuse-allowlist`
  - `director-facade-cutover`
  - `defer-hidden`
- For tools with `director-facade-cutover`, move their registry/implementation into `directorCode/` and switch the model-facing name to the Copilot `toolReferenceName` in the same wave.
- `createFile` and `createDirectory` belong to Phase 3. Their Director-owned implementations move to `directorCode/` and cut over from `create_file` and `create_directory` in the same wave.
- `fetch` facade cutover only promises Director's current URL/file fetch capability. Do not imply Copilot web-search behavior.
- `githubRepo` facade cutover only promises Director's current limited read-only repository context. It must return a controlled limited/unsupported result for Copilot-style remote indexed search unless a future Director-owned GitHub provider is implemented.
- For tools with `direct-reuse-allowlist`, keep the VS Code core or retained extension implementation and only add/update Director registry policy.
- Once a tool is cut over to a new model-facing name, remove the old model-facing snake_case name in the same wave. Do not maintain dual model-facing names as a compatibility period.
- If `tool-facade-research.md` finds a blocker for a planned cutover, update this plan before implementation instead of using an open-ended compatibility status.
- Director-owned edit primitive names are not affected by this phase.
- `githubTextSearch` is source-unknown in local VS Code 116, Director source, and the Copilot package. Do not implement it until a runtime raw tool snapshot identifies its source/id/schema.

#### 48-Tool Final Disposition

| VS Code UI tool | Final status | Director decision |
| --- | --- | --- |
| `runSubagent` | `direct-reuse-allowlist` | Reuse VS Code core implementation. |
| `clickElement` | `direct-reuse-allowlist` | Reuse VS Code core browser implementation; require pre-approval. |
| `dragElement` | `direct-reuse-allowlist` | Reuse VS Code core browser implementation; require pre-approval. |
| `handleDialog` | `direct-reuse-allowlist` | Reuse VS Code core browser implementation; require pre-approval and dialog outcome visibility. |
| `hoverElement` | `direct-reuse-allowlist` | Reuse VS Code core browser implementation. |
| `navigatePage` | `direct-reuse-allowlist` | Reuse VS Code core browser implementation; require pre-approval and navigation/network policy. |
| `openBrowserPage` | `direct-reuse-allowlist` | Reuse VS Code core browser implementation; require pre-approval. |
| `readPage` | `direct-reuse-allowlist` | Reuse VS Code core browser implementation; do not map it to `fetch`. |
| `runPlaywrightCode` | `direct-reuse-allowlist` | Reuse VS Code core browser implementation; require pre-approval and record submitted code plus result summary. |
| `screenshotPage` | `direct-reuse-allowlist` | Reuse VS Code core browser implementation. |
| `typeInPage` | `direct-reuse-allowlist` | Reuse VS Code core browser implementation with pre-approval for input/submission risk. |
| `createDirectory` | `director-facade-cutover` | Keep Director-owned implementation; cut over from `create_directory` in Phase 3. |
| `createFile` | `director-facade-cutover` | Keep Director-owned reviewable implementation; cut over from `create_file` in Phase 3. |
| `createJupyterNotebook` | `defer-hidden` | Do not implement in this plan; requires separate Notebook creation contract. |
| `editFiles` | `defer-hidden` | Do not expose; Director keeps its own reviewable edit primitives. |
| `editNotebook` | `defer-hidden` | Do not implement in this plan; requires separate Notebook edit contract. |
| `createAndRunTask` | `direct-reuse-allowlist` | Reuse VS Code core terminal/task implementation. |
| `getTerminalOutput` | `direct-reuse-allowlist` | Reuse VS Code core terminal implementation. |
| `killTerminal` | `direct-reuse-allowlist` | Reuse VS Code core terminal implementation with existing confirmation policy. |
| `runInTerminal` | `direct-reuse-allowlist` | Reuse VS Code core terminal implementation with existing sandbox/confirmation policy. |
| `runNotebookCell` | `defer-hidden` | Do not implement in this plan; requires separate Notebook execution policy. |
| `sendToTerminal` | `direct-reuse-allowlist` | Reuse VS Code core terminal implementation with existing confirmation policy. |
| `getNotebookSummary` | `defer-hidden` | Do not implement in this plan; handle with any future Notebook wave. |
| `problems` | `director-facade-cutover` | Keep Director marker-service implementation; cut over from current errors tool. |
| `readFile` | `director-facade-cutover` | Keep Director workspace-guarded implementation; cut over from current read tool. |
| `terminalLastCommand` | `direct-reuse-allowlist` | Reuse VS Code core terminal implementation. |
| `terminalSelection` | `direct-reuse-allowlist` | Reuse VS Code core terminal implementation. |
| `viewImage` | `director-facade-cutover` | Keep Director workspace-scoped implementation; cut over from current image tool. |
| `changes` | `director-facade-cutover` | Keep Director SCM implementation; cut over from current changed-files tool. |
| `codebase` | `defer-hidden` | Do not implement until Director has its own semantic index/provider. |
| `fileSearch` | `director-facade-cutover` | Keep Director VS Code search-service implementation; cut over from current file search tool. |
| `listDirectory` | `director-facade-cutover` | Keep Director workspace-guarded implementation; cut over from current directory tool. |
| `searchResults` | `defer-hidden` | Do not implement in this plan; existing `textSearch`/`fileSearch` cover primary need. |
| `textSearch` | `director-facade-cutover` | Keep Director VS Code search-service implementation; cut over from current grep/text search tool. |
| `todo` | `direct-reuse-allowlist` | Reuse VS Code core todo implementation. |
| `askQuestions` | `direct-reuse-allowlist` | Reuse VS Code core ask-questions implementation. |
| `extensions` | `direct-reuse-allowlist` | Reuse VS Code core extension search implementation only after product/gallery/marketplace wording policy is documented and passes the commercial/name grep gate. |
| `getProjectSetupInfo` | `defer-hidden` | Do not implement in this plan; evaluate with any future workspace setup wave. |
| `installExtension` | `defer-hidden` | Do not expose in this plan; extension install mutation needs separate product/security policy. |
| `memory` | `defer-hidden` | Do not implement Copilot memory semantics; future memory must be Director-owned. |
| `newWorkspace` | `defer-hidden` | Do not implement in this plan; future scaffolding must be Director-owned. |
| `resolveMemoryFileUri` | `defer-hidden` | Do not implement without a Director-owned memory feature. |
| `runCommand` | `defer-hidden` | Do not expose generic VS Code command execution without a command allowlist plan. |
| `vscodeAPI` | `defer-hidden` | Do not implement in this plan; future docs/static search can be Director-owned. |
| `fetch` | `director-facade-cutover` | Keep Director/current core URL/file fetch capability; do not imply Copilot web-search behavior. |
| `githubRepo` | `director-facade-cutover` | Keep Director limited repo context; tool description and tests must state that Copilot-style remote indexed search is not supported. |
| `githubTextSearch` | `defer-hidden` | Do not implement until runtime raw tool snapshot identifies source/id/schema. |
| `renderMermaidDiagram` | `direct-reuse-allowlist` | Reuse retained Mermaid extension tool and add Director registry allowlist entry. |

### 4. Director-Owned Edit Tools Internal Refactor

- Preserve the Director-owned write/edit implementations:
  - `apply_patch`
  - `replace_string_in_file`
  - `multi_replace_string_in_file`
- Do not implement Copilot edit tool parity in this plan.
- Do not expose `editFiles` as a model-callable tool.
- Move internal edit tool implementation and tests into `directorCode/` while preserving the existing reviewable Chat Editing contract.
- `create_file` and `create_directory` are not part of Phase 4. Their implementation move and model-facing cutover are completed in Phase 3.

### 5. Declarative Product And Commercial Audit

- Keep product identity, installer metadata, gallery/update links, default links, and `defaultChatAgent` behavior in product overrides, owned-key allowlists, expected contracts, and minimal stable hooks.
- User-visible Microsoft/GitHub/Copilot commercial entry points must not remain unless explicitly documented.
- Internal compatibility names are not grep-gate failures by themselves.
- Maintain `docs/upgrade/director-commercial-name-allowlist.116.md`.
- Produce `docs/upgrade/reports/116-stable-win32-x64-client/commercial-name-grep-report.md`.
- The first version may be a manual report rather than a script. It must list scan paths, keywords, commands, hit summaries, allowlist references, and unexplained hit count.
- The commercial/name grep gate is blocking. User-visible scoped unexplained hit count must be `0`; every allowlisted hit must include a reason.
- Before Phase 5, run this gate only for waves that touch scoped user-visible product/commercial surfaces. After Phase 5, run it for every wave.
- Default keywords:
  - `Copilot`
  - `GitHub Copilot`
  - `Microsoft`
  - `Visual Studio Code`
  - `VS Code`
- The grep gate covers user-visible paths and packaged output: product/package/server manifests, installer metadata, menus/settings/UI strings, welcome/getting-started, chat setup/status/model picker, and similar user-reachable surfaces.
- Do not scan upstream cache, `docs/expired`, internal source symbols, test fixtures, or historical migration docs by default.

### 6. Replay Consolidation And Upgrade Dry Run

- Ensure final canonical replay has no `010` refactor stage and no temporary local patch in `patches/series.116.json`.
- Run a dry-run against 117 stable or the next available upstream version.
- Prefer an existing target profile. If none exists, create a dry-run-only profile and do not include it in release series.
- Produce `docs/upgrade/reports/<target-profile>/thin-layer-upgrade-dry-run-report.md`.
- Compare conflict files, conflict hunks, chat/tool/model/provider conflicts, and product-field manual decisions against the current 116 baseline.
- If conflicts still scatter across upstream chat files, continue module extraction before considering any fork-shape change.

## Test Plan

- Per-wave minimum:
  - Run replay validators for every code/replay wave.
  - Run the targeted tests for the code paths touched by the wave.
  - Run the commercial/name grep gate only when required by the Execution Protocol before Phase 5, and always after Phase 5.
Full validation, required in Phase 6 and before release handoff:

- Replay validators:
  ```powershell
  node scripts/upgrade/validate-series.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json
  node scripts/upgrade/validate-product-overrides.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json
  node scripts/upgrade/expected-contracts.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json
  ```
- Clean materialize:
  ```bash
  bash scripts/upgrade/materialize-vscode.sh \
    --profile docs/upgrade/profiles/116-stable-win32-x64-client.json \
    --target vscode.generated \
    --up-to-layer director \
    --force
  ```
- Compile/build/test from materialized Director source:
  ```powershell
  Push-Location vscode.generated\layers\director\vscode
  npm run compile-check-ts-native
  npm run gulp -- transpile-client-esbuild
  npm run test-browser-no-install -- --grep "Director (Tool Registry|Read-Only Workspace Tools|Chat Editing Adapter|Edit Tools|Chat Mode Routing)"
  Pop-Location
  ```
- Canonical manifest validation:
  ```powershell
  node scripts/upgrade/canonical-manifest.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json
  ```
- Tool facade tests must cover model-facing names, schema adapters, mode allowlists, current capability preservation, browser direct-reuse policy, removal of old names for the cutover tools, and `editFiles` not being model-callable.
- Browser tool tests must prove Director registry policy controls exposure even when VS Code browser tool settings are enabled, and mutation/interaction tools require pre-approval.
- `githubRepo` tests must prove remote indexed search returns the controlled limited/unsupported behavior unless a future Director-owned GitHub provider exists.
- `renderMermaidDiagram` tests must prove it is a direct allowlist of the retained Mermaid extension tool, not a Director reimplementation.
- Product audit tests must include `defaultChatAgent` provider shape, commercial grep report, and packaged `product.json` smoke.

## Assumptions

- Release truth remains replay/profile/canonical, not the generated tree.
- The first tool facade wave covers Director's existing read/search/context tools plus current file/directory creation capabilities.
- Edit tools remain Director-owned and out of Copilot parity scope.
- `githubTextSearch` is not assumed to be a Copilot or VS Code core tool until runtime evidence proves its source.
- Browser tools are reused from VS Code core rather than reimplemented.
- Browser tools are enabled for Director Agent through Director registry policy and pre-approval controls.
- VSCodium remains the lower layer.
- A pure VS Code fork is not part of this plan.
