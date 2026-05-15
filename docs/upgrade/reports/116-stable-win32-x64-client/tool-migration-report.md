# 116 Director Tool Migration Report

Profile: `116-stable-win32-x64-client`

Phase: 1 tool registry and mode policy gate; Phase 2 read-only workspace tools and GitHub v1 gate; Phase 3 direct-reuse browser/Mermaid allowlist wave plus read/search/context/create/fetch/GitHub facade cutovers; Phase 4 reviewable edit tools gate; Phase 5 runtime mode routing plus commercial/name grep gate and read-only extension search exposure

This report is intentionally stable and sanitized. It contains no API keys, tokens, user paths, volatile timestamps, or machine-local runtime state.

## Source

The Phase 1 registry was built from the current Director 116 raw tool registrations before Director registry filtering, plus the fixed scope in `docs/upgrade/116-inline-mermaid-runtime-regression-fix-plan.md`. Phase 2 adds Director-owned read-only workspace tools and keeps GitHub v1 intentionally small and controlled. Thin-layer Phase 3 now directly reuses VS Code core browser tools and the retained Mermaid extension tool through Director registry policy, and cuts over the Director read/search/context/create/fetch/GitHub facades to VS Code/Copilot `toolReferenceName` spellings without keeping old snake_case model-facing aliases. Phase 4 adds Director-owned reviewable edit tools built on the Phase 3 Chat Editing contract. Phase 5 passes the product/gallery/marketplace commercial-name gate and exposes the VS Code core `extensions` search tool as read-only context in Ask/Edit/Agent; extension installation remains hidden.

The runtime-effective lists for Ask/Edit/Agent/Inline were revalidated after Phase 5 mode routing was wired. The Director bridge now chooses the registry-filtered list per request mode, while EditorInline intentionally receives no model-callable tools.

## Registry-Computed Allowlists

### Ask

Read-only only:

- `changes`
- `extensions`
- `fetch`
- `fileSearch`
- `githubRepo`
- `listDirectory`
- `problems`
- `readFile`
- `textSearch`
- `usages`
- `viewImage`

Ask excludes edit, create/delete, terminal, task, shell, workspace mutation, and MCP/user/extension mutation tools by default.

### Edit

Read/search context plus reviewable edit tools:

- `apply_patch`
- `changes`
- `createDirectory`
- `createFile`
- `extensions`
- `fileSearch`
- `githubRepo`
- `listDirectory`
- `multi_replace_string_in_file`
- `problems`
- `readFile`
- `replace_string_in_file`
- `textSearch`
- `usages`
- `viewImage`

### Agent

Existing Agent behavior preserved through reviewed registry entries:

- `askQuestions`
- `apply_patch`
- `artifactRules`
- `artifacts`
- `clickElement`
- `createAndRunTask`
- `createDirectory`
- `createFile`
- `dragElement`
- `changes`
- `extensions`
- `fetch`
- `fileSearch`
- `getTaskOutput`
- `getTerminalOutput`
- `githubRepo`
- `handleDialog`
- `hoverElement`
- `killTerminal`
- `listDirectory`
- `multi_replace_string_in_file`
- `navigatePage`
- `openBrowserPage`
- `problems`
- `readFile`
- `readPage`
- `renderMermaidDiagram`
- `replace_string_in_file`
- `runInTerminal`
- `runPlaywrightCode`
- `runSubagent`
- `runTask`
- `screenshotPage`
- `sendToTerminal`
- `task_complete`
- `terminalLastCommand`
- `terminalSelection`
- `textSearch`
- `todo`
- `typeInPage`
- `usages`
- `viewImage`
- `vscode_get_confirmation`
- `vscode_get_confirmation_with_options`
- `vscode_get_modified_files_confirmation`
- `vscode_get_terminal_confirmation`

### Inline

No model-callable tools in v1. Inline must use selected editor context and the later shared edit adapter.

## Migration Table

| Raw tool id | Raw reference | Model-facing name | Access | Modes | Disposition | Reason |
|---|---|---|---|---|---|---|
| `vscode_askQuestions` | `askQuestions` | `askQuestions` | confirmation | Agent | keep | User-question helper remains available only to Agent. |
| `vscode_get_confirmation` |  | `vscode_get_confirmation` | confirmation | Agent | keep | Preserves existing generic confirmation behavior. |
| `vscode_get_confirmation_with_options` |  | `vscode_get_confirmation_with_options` | confirmation | Agent | keep | Preserves option-based confirmation behavior. |
| `vscode_get_modified_files_confirmation` |  | `vscode_get_modified_files_confirmation` | confirmation | Agent | keep | Kept until reviewable edit tools replace direct mutation paths. |
| `manage_todo_list` | `todo` | `todo` | coordination | Agent | keep | Director planning state remains available to Agent. |
| `task_complete` |  | `task_complete` | coordination | Agent | keep | Director completion signaling remains available to Agent. |
| `runSubagent` | `runSubagent` | `runSubagent` | execute | Agent | keep | Subagent orchestration is Agent-only. |
| `vscode_fetchWebPage_internal` |  | `fetch` | read | Ask, Agent | keep | Reuses VS Code core URL/file fetch under the VS Code/Copilot `fetch` name. Schema requires `urls` and accepts optional `query` only as caller intent text; Director does not imply or perform Copilot-style web search. Existing pre/post approval behavior is preserved. |
| `vscode_listCodeUsages` | `usages` | `usages` | read | Ask, Edit, Agent | keep | Code usage lookup is safe read/search context. |
| `director_read_file` | `readFile` | `readFile` | read | Ask, Edit, Agent | keep | Director-owned workspace text-file reader exposed with the VS Code/Copilot name. Schema uses `filePath`, rejects external paths and binary content, supports line ranges, and truncates large output. |
| `director_list_dir` | `listDirectory` | `listDirectory` | read | Ask, Edit, Agent | keep | Director-owned workspace directory listing exposed with the VS Code/Copilot name. Rejects external paths and caps sorted results. |
| `director_file_search` | `fileSearch` | `fileSearch` | read | Ask, Edit, Agent | keep | Director-owned filename search exposed with the VS Code/Copilot name, backed by VS Code search service, and scoped to workspace folders. |
| `director_grep_search` | `textSearch` | `textSearch` | read | Ask, Edit, Agent | keep | Director-owned text search exposed with the VS Code/Copilot name, backed by VS Code search service, scoped to workspace folders, and accepting `isRegexp`, `includePattern`, `excludePattern`, and `includeIgnoredFiles`. |
| `director_get_errors` | `problems` | `problems` | read | Ask, Edit, Agent | keep | Director-owned diagnostics reader exposed with the VS Code/Copilot name. Supports `filePaths`, uses VS Code marker service, and does not run builds. |
| `director_get_changed_files` | `changes` | `changes` | read | Ask, Edit, Agent | keep | Director-owned SCM reader exposed with the VS Code/Copilot name. Supports `repositoryPath` and `sourceControlState`, uses VS Code SCM resource groups, and returns controlled unavailable text if no SCM provider exists. |
| `director_view_image` | `viewImage` | `viewImage` | read | Ask, Edit, Agent | keep | Director-owned image inspection exposed with the VS Code/Copilot name. Schema uses `filePath` and returns metadata plus an image data part where the bridge/model can consume it, with textual fallback. |
| `director_github_repo` | `githubRepo` | `githubRepo` | read | Ask, Edit, Agent | keep | Director-owned minimal GitHub repo context exposed with the VS Code/Copilot name. Infers sanitized GitHub remotes or accepts owner/repo; remote indexed search and PR/issue mutation are not supported in v1 and return controlled limited output. |
| `director_apply_patch` | `apply_patch` | `apply_patch` | write | Edit, Agent | keep | Director-owned unified diff application. Emits reviewable `textEdit` progress and returns controlled patch-conflict errors. |
| `director_create_file` | `createFile` | `createFile` | write | Edit, Agent | keep | Director-owned file creation exposed with the VS Code/Copilot name. Schema uses `filePath` and `content`; the old `create_file` model-facing name is removed. Rejects duplicate files unless overwrite is explicit and emits reviewable `textEdit` progress. |
| `director_create_directory` | `createDirectory` | `createDirectory` | write | Edit, Agent | keep | Director-owned directory creation review transaction exposed with the VS Code/Copilot name. Schema uses `dirPath`; the old `create_directory` model-facing name is removed. Emits accept/reject chat commands and does not create the folder until accept. |
| `director_replace_string_in_file` | `replace_string_in_file` | `replace_string_in_file` | write | Edit, Agent | keep | Director-owned exact string replacement. Rejects ambiguous matches unless replaceAll is explicit and emits reviewable `textEdit` progress. |
| `director_multi_replace_string_in_file` | `multi_replace_string_in_file` | `multi_replace_string_in_file` | write | Edit, Agent | keep | Director-owned multi-string replacement. Rejects overlapping replacements and emits reviewable `textEdit` progress. |
| `run_in_terminal` | `runInTerminal` | `runInTerminal` | execute | Agent | keep | Terminal execution remains Agent-only. |
| `send_to_terminal` | `sendToTerminal` | `sendToTerminal` | execute | Agent | keep | Terminal input routing remains Agent-only. |
| `get_terminal_output` | `getTerminalOutput` | `getTerminalOutput` | read | Agent | keep | Terminal context remains Agent-only for Ask v1. |
| `kill_terminal` | `killTerminal` | `killTerminal` | execute | Agent | keep | Terminal cleanup remains Agent-only. |
| `terminal_selection` | `terminalSelection` | `terminalSelection` | read | Agent | keep | Terminal context remains Agent-only for Ask v1. |
| `terminal_last_command` | `terminalLastCommand` | `terminalLastCommand` | read | Agent | keep | Terminal context remains Agent-only for Ask v1. |
| `vscode_get_terminal_confirmation` |  | `vscode_get_terminal_confirmation` | confirmation | Agent | keep | Required by existing terminal confirmation flow. |
| `run_task` | `runTask` | `runTask` | execute | Agent | keep | Task execution remains Agent-only. |
| `create_and_run_task` | `createAndRunTask` | `createAndRunTask` | execute | Agent | keep | Task creation/execution remains Agent-only. |
| `get_task_output` | `getTaskOutput` | `getTaskOutput` | read | Agent | keep | Task output context remains Agent-only. |
| `open_browser_page` | `openBrowserPage` | `openBrowserPage` | execute | Agent | keep | Directly reuses the VS Code core browser open tool. Director injects pre-tool approval through the bridge so global auto-approve cannot bypass it. |
| `read_page` | `readPage` | `readPage` | read | Agent | keep | Directly reuses the VS Code core page reader. Phase 3 conservatively injects Director session/page approval before invocation. |
| `screenshot_page` | `screenshotPage` | `screenshotPage` | read | Agent | keep | Directly reuses the VS Code core screenshot tool. Phase 3 conservatively injects Director session/page approval before invocation. |
| `navigate_page` | `navigatePage` | `navigatePage` | execute | Agent | keep | Directly reuses the VS Code core navigation tool with Director pre-approval and upstream network filtering. |
| `click_element` | `clickElement` | `clickElement` | execute | Agent | keep | Directly reuses the VS Code core click tool. Director pre-approval is injected before invocation. |
| `drag_element` | `dragElement` | `dragElement` | execute | Agent | keep | Directly reuses the VS Code core drag tool. Director pre-approval is injected before invocation. |
| `hover_element` | `hoverElement` | `hoverElement` | execute | Agent | keep | Directly reuses the VS Code core hover tool. It remains Agent-only and registry-gated, with no extra mutation approval in this wave. |
| `type_in_page` | `typeInPage` | `typeInPage` | execute | Agent | keep | Directly reuses the VS Code core typing/key tool. Director pre-approval is injected for input/submission risk. |
| `run_playwright_code` | `runPlaywrightCode` | `runPlaywrightCode` | execute | Agent | keep | Directly reuses the VS Code core Playwright runner. Director pre-approval is injected; upstream result details already carry submitted code and result summary. |
| `handle_dialog` | `handleDialog` | `handleDialog` | execute | Agent | keep | Directly reuses the VS Code core dialog handler. Director pre-approval is injected for modal and file-selection risk. |
| `vscode_renameSymbol` | `rename` | `rename` | write | none | defer | Direct rename must wait for Phase 3/4 reviewable edit contract. |
| `vscode_editFile_internal` |  | `vscode_editFile_internal` | write | none | hide | Internal edit tool depends on editing-session/last-request behavior and must not sit beside Director-native reviewable edit tools. |
| `setup_tools_createNewWorkspace` | `new` | `new` | write | none | defer | Workspace scaffolding is mutation and needs a reviewed policy. |
| `setArtifacts` | `artifacts` | `artifacts` | coordination | Agent | keep | Session artifact surfacing remains available to Agent. |
| `setArtifactRules` | `artifactRules` | `artifactRules` | coordination | Agent | keep | Session artifact rule updates remain available to Agent. |
| `vscode_resolveDebugEventDetails_internal` | `resolveDebugEventDetails` | `resolveDebugEventDetails` | read | none | defer | Debug details need a separate runtime policy review. |
| `vscode_searchExtensions_internal` | `extensions` | `extensions` | read | Ask, Edit, Agent | keep | Read-only OpenVSX extension search is exposed after the Phase 5 product/gallery wording policy and commercial/name grep gate. It does not install extensions. |
| `vscode_installExtensions` | `installExtensions` | `installExtensions` | write | none | hide | Extension installation is a product/workspace mutation and is not exposed by default. |
| `renderMermaidDiagram` | `renderMermaidDiagram` | `renderMermaidDiagram` | read | Agent | keep | Directly reuses the retained `extensions/mermaid-chat-features` language model tool. Director does not reimplement Mermaid rendering. |

Unreviewed raw tools from extension, MCP, user, browser automation, or future VS Code contributions are hidden from Director's model-facing tool list until a Director registry entry assigns a disposition and mode policy. Extension installation remains hidden; read-only extension search is exposed only after the Phase 5 commercial/name grep gate.

## Implementation Checkpoints

- Central registry: `src/vs/workbench/contrib/directorCode/common/agentEngine/directorToolRegistry.ts`
- Read-only tools: `src/vs/workbench/contrib/directorCode/common/agentEngine/directorReadOnlyTools.ts`
- Read-only tool registration hook: `src/vs/workbench/contrib/chat/browser/agentEngine/directorReadOnlyTools.contribution.ts`
- Chat Editing adapter: `src/vs/workbench/contrib/directorCode/common/agentEngine/editing/directorChatEditingAdapter.ts`
- Reviewable edit tools: `src/vs/workbench/contrib/directorCode/common/agentEngine/editTools/directorEditTools.ts`
- Reviewable edit tool registration: `src/vs/workbench/contrib/chat/browser/agentEngine/editTools/directorEditTools.contribution.ts`
- Agent definitions and invocation mapping consume registry-filtered tools in `src/vs/workbench/contrib/directorCode/browser/agentEngine/toolBridge.ts`
- Director Agent requests pass the Agent mode policy explicitly in `src/vs/workbench/contrib/directorCode/browser/agentEngine/directorCodeAgent.ts`
- Regression tests: `src/vs/workbench/contrib/chat/test/common/agentEngine/directorToolRegistry.test.ts`, `src/vs/workbench/contrib/chat/test/common/agentEngine/directorReadOnlyTools.test.ts`, `src/vs/workbench/contrib/directorCode/test/common/agentEngine/directorChatEditingAdapter.test.ts`, `src/vs/workbench/contrib/directorCode/test/common/agentEngine/directorEditTools.test.ts`, and `src/vs/workbench/contrib/chat/test/browser/agentEngine/toolBridge.test.ts`

## Phase 1-5 Validation

- `npm run compile-check-ts-native`
- `npm run gulp -- transpile-client-esbuild`
- `npm run test-node -- --run src/vs/workbench/contrib/chat/test/common/agentEngine/directorToolRegistry.test.ts` (`9 passing`; includes Phase 5 `extensions` Ask/Edit/Agent exposure and retained Agent-only `renderMermaidDiagram`)
- `npm run test-node -- --run src/vs/workbench/contrib/chat/test/common/agentEngine/directorToolRegistry.test.ts --run src/vs/workbench/contrib/chat/test/common/agentEngine/directorReadOnlyTools.test.ts` (`17 passing`)
- `npm run test-node -- --run src/vs/workbench/contrib/directorCode/test/common/agentEngine/directorChatEditingAdapter.test.ts --run src/vs/workbench/contrib/directorCode/test/common/agentEngine/directorEditTools.test.ts --run src/vs/workbench/contrib/chat/test/common/agentEngine/directorToolRegistry.test.ts` (`21 passing`)
- `npm run test-node -- --run src/vs/workbench/contrib/chat/test/common/agentEngine/directorToolRegistry.test.ts --run src/vs/workbench/contrib/chat/test/common/agentEngine/directorReadOnlyTools.test.ts --run src/vs/workbench/contrib/chat/test/common/agentEngine/agentEngine.test.ts --run src/vs/workbench/contrib/chat/test/common/agentEngine/endToEnd.test.ts` (`87 passing`)
- `npm run test-browser-no-install -- --grep "Director VSCodeToolBridge"` (`3 passing`; upstream browser-test runner also logs known long-referrer warnings)
- `npm run test-browser-no-install -- --grep "Director (Tool Registry|Read-Only Workspace Tools|Chat Editing Adapter|Edit Tools|Chat Mode Routing)"` (`21 passing`)
- `npm run test-browser-no-install -- --grep "hover mode sendRequest"` (`2 passing`)
- `node scripts/upgrade/validate-series.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
- `node scripts/upgrade/validate-product-overrides.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
- `node scripts/upgrade/expected-contracts.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`
- `node scripts/upgrade/canonical-manifest.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json`

See also `docs/upgrade/reports/116-stable-win32-x64-client/mode-routing-report.md`.
