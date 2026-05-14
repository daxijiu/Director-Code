# Director Surface Inventory

Date: 2026-05-14

Profile: `116-stable-win32-x64-client`

Status: Phase 2 module extraction wave 4

Source plan: `docs/upgrade/director-thin-layer-refactor-plan-v2.md`

## Baseline

- Current branch: `refactor/112-replay-baseline`
- Baseline commit when this wave started: `e290c012 Clarify thin-layer plan gates`
- Phase 2 wave 1 started after commit: `22792213 Add thin-layer surface inventory`
- Phase 2 wave 2 started after commit: `454b4f0d Move agent engine types into directorCode`
- Phase 2 wave 3 started after commit: `9da34b04 Move provider auth modules into directorCode`
- Phase 2 wave 4 started after commit: `7bd45f2b Move agent runtime modules into directorCode`
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
| `tool-facade-research.md` | Phase 3 hard-gate research report for 48-tool facade/direct-reuse disposition. Status is `pending-review` until explicitly accepted. |
| `chat-editing-contract-report.md` | Chat Editing contract analysis and Phase 3 implementation notes. |
| `edit-tools-report.md` | Reviewable edit tools implementation report. |
| `mode-routing-report.md` | Ask/Edit/Agent/Inline routing report. |
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
| `branding` | `patches/replay/002-director-branding.116.patch` | 106 | 175187 | `1ea3bb542ab1bf4997017bd68b2df2000921d9b46a81fbbf04c4e2d66cac5909` | `declarative product config` plus user-visible text/resource replacement. |
| `product-build-release` | `patches/replay/003-director-product-build-release.116.patch` | 7 | 17420 | `f8a8ef9e9227401c1261f1ca2a6faaa8ce8db9d7a6b80863848bae196e6137a1` | `declarative product config`. |
| `agent-engine` | `patches/replay/004-director-agent-engine.116.patch` | 80 | 859908 | `615d232fa74460d32b783aaae10f29808be44b7869837fe2d9d01a43849e50bc` | Mix of `Director-owned logic` and `must-touch upstream hook`. |
| `chat-built-in-mode` | `patches/replay/005-director-chat-built-in-mode.116.patch` | 24 | 58915 | `d900858ce4b5b9f68cef83f731ef98b4824e9db1372b1cdfee1de93f44f18753` | Mix of `declarative product config` and `must-touch upstream hook`. |
| `text-polish` | `patches/replay/006-director-text-polish.116.patch` | 3 | 13099 | `9955b9a6e8fb2462aa3be9a806e22c423f2111847f54e056f36dfe6ed0b18141` | `declarative product config` / user-visible text polish. |
| `tool-layer` | `patches/replay/007-director-tool-layer.116.patch` | 5 | 65900 | `ab9b8d4395a20e1ba5c5d718c2b90d827b761be207ce706abf2155d2de53e400` | `Director-owned logic`. |
| `chat-editing` | `patches/replay/008-director-chat-editing.116.patch` | 2 | 21221 | `1c49de79e6faa1f7ded7b10ec7d8b6ad7c7be4da05ab0aedf2c8dab91c4b72e9` | `Director-owned logic`. |
| `edit-tools` | `patches/replay/009-director-edit-tools.116.patch` | 3 | 45110 | `094d248c40996cf246124287b469f7b80bb6a7e6d6a4b2e5484ac1f1d8b5b2db` | `Director-owned logic`. |

Total current Director changed file count: `230`.

## Director-Owned Logic Surface

These files are Director business logic. Agent Engine common/browser code now lives under `src/vs/workbench/contrib/directorCode/`; tool/edit-layer code remains intentionally deferred to Phase 3/4 according to the active plan.

| Current path group | Stage | Planned semantic stage | Notes |
| --- | --- | --- | --- |
| `src/vs/workbench/contrib/chat/common/agentEngine/{directorReadOnlyTools,directorToolRegistry}.ts` and edit/editing subdirs | `007`, `008`, `009` | Same semantic stage as implementation | Remaining chat-path common code is now tool/edit-layer implementation and registry code. Phase 3/4 own its next migration/cutover decisions. |
| `src/vs/workbench/contrib/directorCode/common/agentEngine/agentEngineTypes.ts` | `004-director-agent-engine.116.patch` | `004-director-agent-engine.116.patch` | Phase 2 wave 1 moved the shared Agent Engine protocol/types out of the upstream chat tree. Phase 2 wave 2 removed its temporary back-reference to chat-path provider types. |
| `src/vs/workbench/contrib/directorCode/common/agentEngine/{apiKeyService,authStateService,fetchUtils,geminiAuth,modelCatalog,modelResolver,oauthLoginController,oauthService,settingsWriteQueue}.ts` and `providers/*` | `004-director-agent-engine.116.patch` | `004-director-agent-engine.116.patch` | Phase 2 wave 2 moved the provider/BYOK/OAuth/model resolver/settings group into Director-owned common code. Browser, common, and tests now import this group through `directorCode/common/agentEngine`. |
| `src/vs/workbench/contrib/directorCode/common/agentEngine/{agentEngine,builtInModeUtil,compact,directorChatModeRouting,retry,tokens}.ts` | `004-director-agent-engine.116.patch` | `004-director-agent-engine.116.patch` | Phase 2 wave 3 moved the remaining Agent loop/runtime helpers into Director-owned common code. `directorChatModeRouting` explicitly imports upstream chat mode/request types and the still chat-path `directorToolRegistry` hook. |
| `src/vs/workbench/contrib/directorCode/browser/agentEngine/*` | `004-director-agent-engine.116.patch` | `004-director-agent-engine.116.patch` | Phase 2 wave 4 moved the browser Agent contribution, Director Agent registration, settings UI, widgets, message normalization, progress bridge, tool bridge, provider UI, and settings CSS into Director-owned browser code. |
| `src/vs/workbench/contrib/chat/browser/agentEngine/directorReadOnlyTools.contribution.ts` | `007-director-tool-layer.116.patch` | `007-director-tool-layer.116.patch` | Director read-only tool contribution. Phase 3 owns further facade/name cutover. |
| `src/vs/workbench/contrib/chat/common/agentEngine/directorReadOnlyTools.ts` | `007-director-tool-layer.116.patch` | `007-director-tool-layer.116.patch` | Director read/search/context implementations. |
| `src/vs/workbench/contrib/chat/common/agentEngine/directorToolRegistry.ts` | `007-director-tool-layer.116.patch` | `007-director-tool-layer.116.patch` | Director registry, mode allowlist, backing classification, and confirmation policy. |
| `src/vs/workbench/contrib/chat/common/agentEngine/editing/directorChatEditingAdapter.ts` | `008-director-chat-editing.116.patch` | `008-director-chat-editing.116.patch` | Shared reviewable Chat Editing adapter. |
| `src/vs/workbench/contrib/chat/browser/agentEngine/editTools/directorEditTools.contribution.ts` | `009-director-edit-tools.116.patch` | `009-director-edit-tools.116.patch` | Director edit tool contribution. |
| `src/vs/workbench/contrib/chat/common/agentEngine/editTools/directorEditTools.ts` | `009-director-edit-tools.116.patch` | `009-director-edit-tools.116.patch` | Director-owned reviewable edit primitive implementations. |
| `src/vs/workbench/contrib/chat/test/**/agentEngine/*` | `004`, `007`, `008`, `009` | Same semantic stage as implementation | Tests for Director-owned agent/tool/edit behavior. |

## Current Upstream Chat/Agent Touches

The following files are existing upstream chat/agent files touched by Director. Each touch must remain a thin hook, product compatibility adjustment, or documented commercial/product text change after Phase 2.

| File | Stage | Classification | Hook reason |
| --- | --- | --- | --- |
| `src/vs/workbench/contrib/chat/browser/chat.contribution.ts` | `004` | `must-touch upstream hook` | Imports Director Agent contribution and keeps a small MCP wording replacement. Long-term target is import/registration glue only. |
| `src/vs/workbench/contrib/chat/browser/tools/languageModelToolsService.ts` | `004` | `must-touch upstream hook` | Resolves tool invocation and confirmation context by `chatRequestId` instead of only using the last request. This is a request-binding safety hook. |
| `src/vs/workbench/contrib/chat/common/participants/chatAgents.ts` | `004` | `must-touch upstream hook` | Makes dynamic agent re-registration/disposal safe for Director hot registration and context-key refresh. |
| `src/vs/workbench/contrib/chat/browser/actions/chatActions.ts` | `005` | `declarative product config` plus thin hook | Allows Director settings command URL handling and changes inline-suggestions availability gating away from Copilot setup state. |
| `src/vs/workbench/contrib/chat/browser/actions/chatGettingStarted.ts` | `005` | `declarative product config` | Replaces setup/getting-started commercial copy with Director wording. |
| `src/vs/workbench/contrib/chat/browser/agentSessions/agentSessions.ts` | `005` | `declarative product config` | Director default agent/product identity behavior for Agent Sessions. |
| `src/vs/workbench/contrib/chat/browser/agentSessions/experiments/agentTitleBarStatusWidget.ts` | `005` | `declarative product config` | Director status/title-bar wording and commercial-flow gating. |
| `src/vs/workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditor.ts` | `005` | `must-touch upstream hook` | Bridges Agent Customizations UI to Director settings and product identity. |
| `src/vs/workbench/contrib/chat/browser/aiCustomization/aiCustomizationWorkspaceService.ts` | `005` | `declarative product config` | Director Agent Customizations behavior/copy. |
| `src/vs/workbench/contrib/chat/browser/aiCustomization/media/aiCustomizationManagement.css` | `005` | `declarative product config` | Styling support for Director Agent Customizations entry. |
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
| `src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts` | `005` | `declarative product config` plus mode hook | Director mode/setup behavior in chat widget. |
| `src/vs/workbench/contrib/chat/browser/widget/input/chatModelPicker.ts` | `005` | `must-touch upstream hook` | Shows unavailable models as Director configuration actions instead of Copilot upgrade/admin commercial actions. |
| `src/vs/workbench/contrib/chat/browser/widget/input/chatStatusWidget.ts` | `005` | `declarative product config` | Director status widget wording and setup state. |
| `src/vs/workbench/contrib/chat/browser/widget/input/modelPickerActionItem.ts` | `005` | `declarative product config` | Director model picker entry behavior/copy. |
| `src/vs/workbench/contrib/chat/browser/widgetHosts/chatQuick.ts` | `005` | `declarative product config` | Director quick chat setup/status behavior. |
| `src/vs/workbench/contrib/chat/common/aiCustomizationWorkspaceService.ts` | `005` | `declarative product config` | Director Agent Customizations data/copy. |
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

## Phase 2 Readiness Notes

- Phase 2 wave 1 completed: `agentEngineTypes.ts` now lives under `src/vs/workbench/contrib/directorCode/common/agentEngine/`, and all Agent Engine/browser/test imports were updated to the new path.
- Phase 2 wave 2 completed: provider/BYOK/OAuth/model resolver/settings code now lives under `src/vs/workbench/contrib/directorCode/common/agentEngine/`, including `providers/*`.
- Phase 2 wave 3 completed: Agent loop/runtime helpers now live under `src/vs/workbench/contrib/directorCode/common/agentEngine/`; the patch changed `002`, `004`, and `005` because `builtInModeUtil` is imported by branding and chat built-in-mode files.
- Phase 2 wave 4 completed: browser Agent contribution/UI code now lives under `src/vs/workbench/contrib/directorCode/browser/agentEngine/`; upstream `chat.contribution.ts` only imports the Director contribution.
- Phase 2 Agent Engine extraction is complete for common/runtime/provider/browser UI code. Remaining chat-path Director business logic is intentionally the Phase 3/4 tool/edit surface.
- Phase 3 hard-gate report has been produced at `docs/upgrade/reports/116-stable-win32-x64-client/tool-facade-research.md` with `Status: pending-review`; no tool facade or allowlist implementation may start until it is explicitly accepted.
- `languageModelToolsService.ts` and `chatAgents.ts` are true upstream service hooks. They need careful extraction boundaries, not wholesale movement.
- Phase 3 owns tool implementation moves that also require model-facing name cutover, including `createFile` and `createDirectory`.
- `artifacts/` must remain untracked.
