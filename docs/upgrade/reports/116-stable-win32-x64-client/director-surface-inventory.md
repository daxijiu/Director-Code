# Director Surface Inventory

Date: 2026-05-15

Profile: `116-stable-win32-x64-client`

Status: Phase 5 commercial/name grep gate and read-only extension search exposure wave

Source plan: `docs/upgrade/director-thin-layer-refactor-plan-v2.md`

## Baseline

- Current branch: `refactor/112-replay-baseline`
- Baseline commit when this wave started: `e290c012 Clarify thin-layer plan gates`
- Phase 2 wave 1 started after commit: `22792213 Add thin-layer surface inventory`
- Phase 2 wave 2 started after commit: `454b4f0d Move agent engine types into directorCode`
- Phase 2 wave 3 started after commit: `9da34b04 Move provider auth modules into directorCode`
- Phase 2 wave 4 started after commit: `7bd45f2b Move agent runtime modules into directorCode`
- Phase 3 direct-reuse wave 1 started after commit: `633217b3 Accept tool facade research gate`
- Phase 3 read/search/context facade cutover started after commit: `3ca931ce Expose browser and Mermaid direct-reuse tools`
- Phase 3 read/search/context tool module extraction started after commit: `806fe3f1 Cut over read context tool facades`
- Phase 3 create facade cutover started after commit: `cdaf76ec Move read context tools into directorCode`
- Phase 3 fetch/GitHub facade cutover started after commit: `122685ce Cut over create tool facades`
- Phase 4 edit tools internal refactor started after commit: `4c6d2bbc Cut over fetch and GitHub tool facades`
- Phase 5 commercial/name grep gate started after commit: `85e39cb8 Move edit tools into directorCode`
- Release source of truth remains replay/profile/expected-contracts/canonical manifest, not `vscode.generated`.
- Active profile: `docs/upgrade/profiles/116-stable-win32-x64-client.json`
- Canonical manifest: `docs/upgrade/manifests/116-stable-win32-x64-client.canonical.json`
- Accepted tool strategy source: `docs/upgrade/reports/116-stable-win32-x64-client/tool-source-and-strategy-analysis.html`
- Earlier comparison report retained for reference: `docs/upgrade/reports/116-stable-win32-x64-client/tool-parity-analysis.html`

## Current Reports

| Report | Purpose |
| --- | --- |
| `prepare-parity-report.json` | Phase 0/prepare parity status. |
| `vscodium-layer-report.json` | VSCodium layer materialization/audit status. |
| `upgrade-estimator-report.json` | Upgrade estimator output for the 116 profile. |
| `director-patches-report.json` | Current Director replay patch inventory. |
| `expected-contracts-report.json` | Expected contract validation output. |
| `materialize-report.json` | Materialization output for the active profile. |
| `tool-migration-report.md` | Current Director tool registry/migration status. |
| `tool-facade-research.md` | Accepted Phase 3 hard-gate research report for 48-tool facade/direct-reuse disposition. |
| `chat-editing-contract-report.md` | Chat Editing contract analysis and Phase 3 implementation notes. |
| `edit-tools-report.md` | Reviewable edit tools implementation report. |
| `mode-routing-report.md` | Ask/Edit/Agent/Inline routing report. |
| `commercial-name-grep-report.md` | Phase 5 product/gallery/marketplace commercial-name grep gate report. |
| `docs/upgrade/director-commercial-name-allowlist.116.md` | Phase 5 allowlist for legal attribution, OSS compatibility, package metadata, extension identity, Windows namespaces, and internal VS Code API/protocol names. |
| `package-regression-report.md` | Phase 6 package/regression status and installer hashes. |
| `tool-source-and-strategy-analysis.html` | Accepted 48-tool source/strategy report for the thin-layer plan. |
| `tool-parity-analysis.html` | Earlier broad parity analysis retained as reference only. |

## Package Baseline

The current package baseline is recorded in `package-regression-report.md`.

| Artifact | Size | SHA-256 |
| --- | ---: | --- |
| `artifacts/out/stable/win32-x64/system-setup/Director-CodeSetup-x64-1.116.0.exe` | 162327831 | `DAF13D81BC9580443DC52BB3E700839983EAAB8649138733AD2B0208C793ACBB` |
| `artifacts/out/stable/win32-x64/user-setup/Director-CodeUserSetup-x64-1.116.0.exe` | 162328197 | `A96A9259DFC943B7D53912F0C8A888C886E239EA72A99974D674D5BC44748764` |

The package smoke was non-destructive. It used temporary data under `artifacts/phase6-smoke` and did not install the generated installers.

## Untracked Generated Artifacts

`artifacts/` is intentionally untracked and must not be committed by default.

Summary-only inventory:

| Path | Purpose | Commit policy |
| --- | --- | --- |
| `artifacts/generated/116-stable-win32-x64-client/` | Generated copies of replay/materialize/contract reports. | Do not commit unless explicitly promoted to `docs/upgrade/reports`. |
| `artifacts/logs/` | Build logs and process marker files from package/regression runs. | Do not commit. |
| `artifacts/out/stable/win32-x64/` | System/user installer outputs listed above. | Do not commit by default; hashes are recorded in docs. |
| `artifacts/phase6-smoke/` | Temporary packaged runtime smoke user data/extensions directories. | Do not commit. |

No full artifact file list is maintained by this plan.

## Replay Patch Inventory

Source: `docs/upgrade/reports/116-stable-win32-x64-client/director-patches-report.json`.

| Stage | Patch | Files | Bytes | SHA-256 | Surface classification |
| --- | --- | ---: | ---: | --- | --- |
| `branding` | `patches/replay/002-director-branding.116.patch` | 106 | 177506 | `2831c1129a58f83fbdd26331251878be4f89555ca8cc9b786adbe7ae6fd9c7ca` | `declarative product config` plus user-visible text/resource replacement. |
| `product-build-release` | `patches/replay/003-director-product-build-release.116.patch` | 7 | 20173 | `49c16023a461a799d04ac9a716f04158c5bbb8b2d2dc420d1ad659a51050b73b` | `declarative product config`. |
| `agent-engine` | `patches/replay/004-director-agent-engine.116.patch` | 81 | 871404 | `7e630ed6504fb86ffb771a27df6772b59d36e4f3092d54884205b88ef4b8f0da` | Mix of `Director-owned logic` and `must-touch upstream hook`. |
| `chat-built-in-mode` | `patches/replay/005-director-chat-built-in-mode.116.patch` | 34 | 87118 | `7516ac38ad601db2bb529a29440a96ad17d28a6dcdd818f52cbe09571ec78f45` | Mix of `declarative product config` and `must-touch upstream hook`. |
| `text-polish` | `patches/replay/006-director-text-polish.116.patch` | 6 | 16980 | `85c5cc08ef981379d7b09f3b53885aba649428f28c2cdc5ee5ae86bddcc77a9b` | `declarative product config` / user-visible text polish. |
| `tool-layer` | `patches/replay/007-director-tool-layer.116.patch` | 5 | 79219 | `b9600c1cc66db5d69185f17ce2c9af9b9749a27f0e20354a11d9549c485ec91d` | `Director-owned logic`. |
| `chat-editing` | `patches/replay/008-director-chat-editing.116.patch` | 2 | 21321 | `c6278007133640563dabcb0d3439d3cc91eb403528942807df99af72ef418b3b` | `Director-owned logic`. |
| `edit-tools` | `patches/replay/009-director-edit-tools.116.patch` | 3 | 45326 | `9e1d2be7be60aa045abb2fbed620c28c61b6bf68ff9997395c65b9e2bad3c84c` | `Director-owned logic`. |

Total current Director changed file count: `244`.

## Director-Owned Logic Surface

These files are Director business logic. Agent Engine common/browser code, tool registry/read-only tools, Chat Editing adapter, and reviewable edit tools now live under `src/vs/workbench/contrib/directorCode/`; remaining chat-path files are thin contribution hooks or upstream integration points.

| Current path group | Stage | Planned semantic stage | Notes |
| --- | --- | --- | --- |
| `src/vs/workbench/contrib/directorCode/common/agentEngine/editing/directorChatEditingAdapter.ts` | `008-director-chat-editing.116.patch` | `008-director-chat-editing.116.patch` | Phase 4 moved the shared reviewable Chat Editing adapter out of the upstream chat tree. It still imports upstream chat service/model types as integration contracts only. |
| `src/vs/workbench/contrib/directorCode/common/agentEngine/editTools/directorEditTools.ts` | `009-director-edit-tools.116.patch` | `009-director-edit-tools.116.patch` | Phase 4 moved the Director-owned reviewable edit primitive implementations out of the upstream chat tree while preserving model-facing names and review behavior. |
| `src/vs/workbench/contrib/directorCode/common/agentEngine/agentEngineTypes.ts` | `004-director-agent-engine.116.patch` | `004-director-agent-engine.116.patch` | Phase 2 wave 1 moved the shared Agent Engine protocol/types out of the upstream chat tree. Phase 2 wave 2 removed its temporary back-reference to chat-path provider types. |
| `src/vs/workbench/contrib/directorCode/common/agentEngine/{apiKeyService,authStateService,fetchUtils,geminiAuth,modelCatalog,modelResolver,oauthLoginController,oauthService,settingsWriteQueue}.ts` and `providers/*` | `004-director-agent-engine.116.patch` | `004-director-agent-engine.116.patch` | Phase 2 wave 2 moved the provider/BYOK/OAuth/model resolver/settings group into Director-owned common code. Browser, common, and tests now import this group through `directorCode/common/agentEngine`. |
| `src/vs/workbench/contrib/directorCode/common/agentEngine/{agentEngine,builtInModeUtil,compact,directorChatModeRouting,retry,tokens}.ts` | `004-director-agent-engine.116.patch` | `004-director-agent-engine.116.patch` | Phase 2 wave 3 moved the remaining Agent loop/runtime helpers into Director-owned common code. `directorChatModeRouting` explicitly imports upstream chat mode/request types and the Director-owned registry in the same module. |
| `src/vs/workbench/contrib/directorCode/common/agentEngine/{directorReadOnlyTools,directorToolRegistry}.ts` | `007-director-tool-layer.116.patch` | `007-director-tool-layer.116.patch` | Phase 3 follow-up moved the read/search/context tool implementation and registry out of the upstream chat tree after the facade cutover. The patch generator explicitly keeps these `directorCode/` files in the tool-layer semantic stage. The registry still imports upstream `IToolData`/tool service types as integration contracts only. |
| `src/vs/workbench/contrib/directorCode/browser/agentEngine/*` | `004-director-agent-engine.116.patch` | `004-director-agent-engine.116.patch` | Phase 2 wave 4 moved the browser Agent contribution, Director Agent registration, settings UI, widgets, message normalization, progress bridge, tool bridge, provider UI, and settings CSS into Director-owned browser code. Phase 3 wave 1 extends `toolBridge.ts` so Director can inject non-bypassable pre-tool approval while still directly invoking VS Code core browser tools. |
| `src/vs/workbench/contrib/chat/browser/agentEngine/directorReadOnlyTools.contribution.ts` | `007-director-tool-layer.116.patch` | `007-director-tool-layer.116.patch` | Director read-only tool contribution. Phase 3 wave 2 keeps contribution placement but exposes the updated read/search/context facade tool names. |
| `src/vs/workbench/contrib/chat/browser/agentEngine/editTools/directorEditTools.contribution.ts` | `009-director-edit-tools.116.patch` | `009-director-edit-tools.116.patch` | Thin registration hook for Director edit tools. It imports the Director-owned implementation from `directorCode/`. |
| `src/vs/workbench/contrib/chat/test/**/agentEngine/*` and `src/vs/workbench/contrib/directorCode/test/**/agentEngine/*` | `004`, `007`, `008`, `009` | Same semantic stage as implementation | Tests for Director-owned agent/tool/edit behavior. Phase 4 moved Chat Editing adapter and edit-tool tests into `directorCode/test`. |

## Current Upstream Chat/Agent Touches

The following files are existing upstream chat/agent files touched by Director. Each touch must remain a thin hook, product compatibility adjustment, or documented commercial/product text change after Phase 2.

| File | Stage | Classification | Hook reason |
| --- | --- | --- | --- |
| `src/vs/workbench/contrib/chat/browser/chat.contribution.ts` | `004` | `must-touch upstream hook` | Imports Director Agent contribution and keeps a small MCP wording replacement. Long-term target is import/registration glue only. |
| `src/vs/workbench/contrib/chat/browser/tools/languageModelToolsService.ts` | `004` | `must-touch upstream hook` | Resolves tool invocation and confirmation context by `chatRequestId` instead of only using the last request. This is a request-binding safety hook. |
| `src/vs/workbench/contrib/chat/common/participants/chatAgents.ts` | `004` | `must-touch upstream hook` | Makes dynamic agent re-registration/disposal safe for Director hot registration and context-key refresh. |
| `src/vs/workbench/contrib/chat/browser/actions/chatActions.ts` | `005` | `declarative product config` plus thin hook | Allows Director settings command URL handling and changes inline-suggestions availability gating away from Copilot setup state. |
| `src/vs/workbench/contrib/chat/browser/actions/chatGettingStarted.ts` | `005` | `declarative product config` | Replaces setup/getting-started commercial copy with Director wording. |
| `src/vs/workbench/contrib/chat/browser/actions/chatLanguageModelActions.ts` | `005` | `declarative product config` | Replaces trusted-provider and commercial model action wording with Director-compatible copy. |
| `src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/syncedCustomizationBundler.ts` | `005` | `declarative product config` | Replaces synced customization product identity with Director-Code wording. |
| `src/vs/workbench/contrib/chat/browser/agentSessions/agentSessions.ts` | `005` | `declarative product config` | Director default agent/product identity behavior for Agent Sessions. |
| `src/vs/workbench/contrib/chat/browser/agentSessions/experiments/agentTitleBarStatusWidget.ts` | `005` | `declarative product config` | Director status/title-bar wording and commercial-flow gating. |
| `src/vs/workbench/contrib/chat/browser/aiCustomization/aiCustomizationDebugPanel.ts` | `005` | `declarative product config` | Director Agent Customizations debug wording and product identity. |
| `src/vs/workbench/contrib/chat/browser/aiCustomization/aiCustomizationListWidget.ts` | `005` | `declarative product config` | Replaces custom agents/skills/instructions/hooks/prompts documentation links with Director-owned documentation. |
| `src/vs/workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditor.ts` | `005` | `must-touch upstream hook` | Bridges Agent Customizations UI to Director settings and product identity. |
| `src/vs/workbench/contrib/chat/browser/aiCustomization/aiCustomizationWorkspaceService.ts` | `005` | `declarative product config` | Director Agent Customizations behavior/copy. |
| `src/vs/workbench/contrib/chat/browser/aiCustomization/mcpListWidget.ts` | `005` | `declarative product config` | Replaces managed/built-in/extension MCP wording and docs links with Director wording. |
| `src/vs/workbench/contrib/chat/browser/aiCustomization/media/aiCustomizationManagement.css` | `005` | `declarative product config` | Styling support for Director Agent Customizations entry. |
| `src/vs/workbench/contrib/chat/browser/aiCustomization/pluginListWidget.ts` | `005` | `declarative product config` | Replaces Agent Customizations plugin docs links with Director-owned documentation. |
| `src/vs/workbench/contrib/chat/browser/chatEditing/chatEditingExplanationModelManager.ts` | `005` | `must-touch upstream hook` | Selects Director auxiliary language model instead of hard-coded Copilot fast model for edit explanations. |
| `src/vs/workbench/contrib/chat/browser/chatSetup/chatSetupContributions.ts` | `005` | `declarative product config` | Director chat setup contribution visibility/copy. |
| `src/vs/workbench/contrib/chat/browser/chatSetup/chatSetupController.ts` | `005` | `declarative product config` | Director chat setup flow gating. |
| `src/vs/workbench/contrib/chat/browser/chatSetup/chatSetupGrowthSession.ts` | `005` | `declarative product config` | Removes/replaces Copilot growth/session commercial flow. |
| `src/vs/workbench/contrib/chat/browser/chatSetup/chatSetupProviders.ts` | `005` | `declarative product config` plus tool policy | Rewords setup/new workspace descriptions to Director; `new` remains hidden from Director Agent by registry policy. |
| `src/vs/workbench/contrib/chat/browser/chatSetup/chatSetupRunner.ts` | `005` | `declarative product config` | Director setup runner behavior/copy. |
| `src/vs/workbench/contrib/chat/browser/chatStatus/chatStatusDashboard.ts` | `005` | `declarative product config` | Director chat status dashboard wording and product gating. |
| `src/vs/workbench/contrib/chat/browser/chatStatus/chatStatusEntry.ts` | `005` | `declarative product config` | Director chat status entry wording and product gating. |
| `src/vs/workbench/contrib/chat/browser/widget/chatContentParts/chatQuotaExceededPart.ts` | `005` | `declarative product config` | Removes Copilot subscription/quota language from user-visible chat output. |
| `src/vs/workbench/contrib/chat/browser/widget/chatContentParts/chatThinkingContentPart.ts` | `005` | `declarative product config` | Director wording/status display in thinking content. |
| `src/vs/workbench/contrib/chat/browser/widget/chatContentParts/toolInvocationParts/chatTerminalToolConfirmationSubPart.ts` | `005` | `declarative product config` | Replaces terminal tool safety documentation link with Director-owned documentation. |
| `src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts` | `005` | `declarative product config` plus mode hook | Director mode/setup behavior in chat widget. |
| `src/vs/workbench/contrib/chat/browser/widget/input/chatModelPicker.ts` | `005` | `must-touch upstream hook` | Shows unavailable models as Director configuration actions instead of Copilot upgrade/admin commercial actions. |
| `src/vs/workbench/contrib/chat/browser/widget/input/chatStatusWidget.ts` | `005` | `declarative product config` | Director status widget wording and setup state. |
| `src/vs/workbench/contrib/chat/browser/widget/input/modelPickerActionItem.ts` | `005` | `declarative product config` | Director model picker entry behavior/copy. |
| `src/vs/workbench/contrib/chat/browser/widget/input/permissionPickerActionItem.ts` | `005` | `declarative product config` | Replaces permission picker product wording and learn-more link with Director-owned wording/docs. |
| `src/vs/workbench/contrib/chat/browser/widget/input/sessionTargetPickerActionItem.ts` | `005` | `declarative product config` | Replaces session target picker learn-more link with Director-owned documentation. |
| `src/vs/workbench/contrib/chat/browser/widgetHosts/chatQuick.ts` | `005` | `declarative product config` | Director quick chat setup/status behavior. |
| `src/vs/workbench/contrib/chat/common/aiCustomizationWorkspaceService.ts` | `005` | `declarative product config` | Director Agent Customizations data/copy. |
| `src/vs/workbench/contrib/chat/common/model/chatSessionStore.ts` | `005` | `declarative product config` | Replaces chat session serialization issue text and issue URL with Director project wording. |
| `src/vs/workbench/contrib/chat/common/promptSyntax/hookCompatibility.ts` | `006` | `declarative product config` | Replaces user-visible hook compatibility labels/comments with standard JSON hook wording while keeping imported format compatibility. |
| `src/vs/workbench/contrib/chat/common/promptSyntax/hookSchema.ts` | `006` | `declarative product config` | Replaces hook schema product description with standard hook configuration wording. |
| `src/vs/workbench/contrib/chat/common/promptSyntax/hookTypes.ts` | `006` | `declarative product config` | Removes product-specific documentation URLs from hook lifecycle comments while preserving compatibility target names. |
| `src/vs/workbench/contrib/chat/common/promptSyntax/languageProviders/promptValidator.ts` | `006` | `declarative product config` | Replaces VS Code/Copilot-facing prompt validation wording with Director/VSCodium wording. |

Associated tests touched by Director:

| File | Stage | Reason |
| --- | --- | --- |
| `src/vs/workbench/contrib/chat/test/browser/tools/languageModelToolsService.test.ts` | `004` | Tests request-bound tool invocation/confirmation behavior. |
| `src/vs/workbench/contrib/chat/test/common/participants/chatAgents.test.ts` | `004` | Tests dynamic agent re-registration/disposal behavior. |
| `src/vs/workbench/contrib/chat/test/browser/widget/input/chatModelPicker.test.ts` | `005` | Tests Director model picker/configure behavior. |

## Replay Path Classification For `directorCode/`

New `src/vs/workbench/contrib/directorCode/` files must land in the existing semantic stages:

| Director domain | Replay patch |
| --- | --- |
| Agent loop, message normalization, progress bridge, model provider, BYOK, settings | `004-director-agent-engine.116.patch` |
| Chat built-in mode, Agent Customizations bridge, commercial-flow gating | `005-director-chat-built-in-mode.116.patch` |
| Tool registry, direct-reuse allowlist, Director-owned tool facades | `007-director-tool-layer.116.patch` |
| Chat Editing adapter and shared reviewable edit protocol | `008-director-chat-editing.116.patch` |
| Director-owned reviewable edit tools | `009-director-edit-tools.116.patch` |

No final `010` stage is allowed in the canonical replay series.

## Phase Notes

- Phase 2 wave 1 completed: `agentEngineTypes.ts` now lives under `src/vs/workbench/contrib/directorCode/common/agentEngine/`, and all Agent Engine/browser/test imports were updated to the new path.
- Phase 2 wave 2 completed: provider/BYOK/OAuth/model resolver/settings code now lives under `src/vs/workbench/contrib/directorCode/common/agentEngine/`, including `providers/*`.
- Phase 2 wave 3 completed: Agent loop/runtime helpers now live under `src/vs/workbench/contrib/directorCode/common/agentEngine/`; the patch changed `002`, `004`, and `005` because `builtInModeUtil` is imported by branding and chat built-in-mode files.
- Phase 2 wave 4 completed: browser Agent contribution/UI code now lives under `src/vs/workbench/contrib/directorCode/browser/agentEngine/`; upstream `chat.contribution.ts` only imports the Director contribution.
- Phase 2 Agent Engine extraction is complete for common/runtime/provider/browser UI code. Remaining chat-path Director business logic is intentionally the Phase 3/4 tool/edit surface.
- Phase 3 hard-gate report has been accepted at `docs/upgrade/reports/116-stable-win32-x64-client/tool-facade-research.md`; tool facade and allowlist implementation may now proceed in the accepted waves.
- Phase 3 direct-reuse wave 1 is implemented and replay-landed: `clickElement`, `dragElement`, `handleDialog`, `hoverElement`, `navigatePage`, `openBrowserPage`, `readPage`, `runPlaywrightCode`, `screenshotPage`, `typeInPage`, and `renderMermaidDiagram` are Agent allowlisted through registry policy. Browser mutation/interaction tools and conservative page read/screenshot access get Director-injected `preToolUseResult: ask` in `toolBridge.ts`; global VS Code auto-approve does not bypass this Director bridge path.
- Phase 3 read/search/context facade wave 2 is implemented and replay-landed: `read_file`, `list_dir`, `file_search`, `grep_search`, `get_errors`, `get_changed_files`, and `view_image` were removed as model-facing names and replaced by `readFile`, `listDirectory`, `fileSearch`, `textSearch`, `problems`, `changes`, and `viewImage`. Implementations remain Director-owned and workspace guarded. The temporary GitHub legacy exception from that wave is resolved by the later fetch/GitHub facade cutover.
- Phase 3 read/search/context tool module extraction is implemented and replay-landed: `directorReadOnlyTools.ts` and `directorToolRegistry.ts` now live under `src/vs/workbench/contrib/directorCode/common/agentEngine/`. `src/vs/workbench/contrib/chat/browser/agentEngine/directorReadOnlyTools.contribution.ts` remains as the thin upstream chat registration hook.
- Phase 3 create facade cutover is implemented and replay-landed: `create_file` and `create_directory` were removed as model-facing names and replaced by `createFile` and `createDirectory`. The implementations remain Director-owned reviewable edit primitives; `apply_patch`, `replace_string_in_file`, and `multi_replace_string_in_file` intentionally keep their Director-only names.
- Phase 3 fetch/GitHub facade cutover is implemented and replay-landed: `vscode_fetchWebPage_internal` is no longer model-facing and is exposed as `fetch`, backed by the same VS Code URL/file fetch implementation and approval flow. `github_repo` is no longer model-facing and is exposed as `githubRepo`; it keeps Director's limited read-only repo context and returns controlled unsupported output for remote indexed search.
- Phase 4 edit tools internal refactor is implemented and replay-landed: `directorChatEditingAdapter.ts`, `directorEditTools.ts`, and their tests now live under `src/vs/workbench/contrib/directorCode/`. `src/vs/workbench/contrib/chat/browser/agentEngine/editTools/directorEditTools.contribution.ts` remains as the thin registration hook.
- Phase 5 commercial/name grep gate is implemented: product default links, package repository/bugs metadata, Windows installer/resource metadata, chat setup/status/model-picker/customization copy, extension gallery wording, and safety/docs links now route to Director-owned wording or URLs unless explicitly allowlisted for OSS attribution or compatibility. The gate report is `commercial-name-grep-report.md`.
- Phase 5 read-only extension search exposure is implemented: `extensions` now appears in Ask/Edit/Agent through the Director registry after the product/gallery wording gate; `installExtensions` remains hidden as a mutation.
- Commercial/name grep is now a required gate for every subsequent wave. User-visible scoped unexplained hits must stay at `0`; allowlisted hits require an allowlist reason.
- `languageModelToolsService.ts` and `chatAgents.ts` are true upstream service hooks. They need careful extraction boundaries, not wholesale movement.
- No Phase 3 fetch/GitHub temporary legacy exception remains model-facing after this wave.
- `artifacts/` must remain untracked.
