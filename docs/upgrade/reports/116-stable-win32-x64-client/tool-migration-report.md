# 116 Director Tool Migration Report

Profile: `116-stable-win32-x64-client`

Phase: 1 tool registry and mode policy gate; Phase 2 read-only workspace tools and GitHub v1 gate

This report is intentionally stable and sanitized. It contains no API keys, tokens, user paths, volatile timestamps, or machine-local runtime state.

## Source

The Phase 1 registry was built from the current Director 116 raw tool registrations before Director registry filtering, plus the fixed scope in `docs/upgrade/116-inline-mermaid-runtime-regression-fix-plan.md`. Phase 2 adds Director-owned read-only workspace tools and keeps GitHub v1 intentionally small and controlled.

The runtime-effective lists for Ask/Edit/Agent/Inline are revalidated later after Phase 5 mode routing is wired. Phase 1 verifies the registry-computed lists and makes the Director Agent path consume those lists.

## Registry-Computed Allowlists

### Ask

Read-only only:

- `file_search`
- `get_changed_files`
- `get_errors`
- `github_repo`
- `grep_search`
- `list_dir`
- `read_file`
- `usages`
- `view_image`
- `vscode_fetchWebPage_internal`

Ask excludes edit, create/delete, terminal, task, shell, workspace mutation, and MCP/user/extension mutation tools by default.

### Edit

Read/search context only until the Phase 3/4 reviewable edit contract exists:

- `file_search`
- `get_changed_files`
- `get_errors`
- `github_repo`
- `grep_search`
- `list_dir`
- `read_file`
- `usages`
- `view_image`

### Agent

Existing Agent behavior preserved through reviewed registry entries:

- `askQuestions`
- `artifactRules`
- `artifacts`
- `createAndRunTask`
- `file_search`
- `get_changed_files`
- `get_errors`
- `getTaskOutput`
- `getTerminalOutput`
- `github_repo`
- `grep_search`
- `killTerminal`
- `list_dir`
- `read_file`
- `runInTerminal`
- `runSubagent`
- `runTask`
- `sendToTerminal`
- `task_complete`
- `terminalLastCommand`
- `terminalSelection`
- `todo`
- `usages`
- `view_image`
- `vscode_fetchWebPage_internal`
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
| `vscode_fetchWebPage_internal` |  | `vscode_fetchWebPage_internal` | read | Ask, Agent | keep | Read-only fetch remains guarded by backing confirmation policy. |
| `vscode_listCodeUsages` | `usages` | `usages` | read | Ask, Edit, Agent | keep | Code usage lookup is safe read/search context. |
| `director_read_file` | `read_file` | `read_file` | read | Ask, Edit, Agent | keep | Director-owned workspace text-file reader. Rejects external paths, rejects binary content, supports line ranges, and truncates large output. |
| `director_list_dir` | `list_dir` | `list_dir` | read | Ask, Edit, Agent | keep | Director-owned workspace directory listing. Rejects external paths and caps sorted results. |
| `director_file_search` | `file_search` | `file_search` | read | Ask, Edit, Agent | keep | Director-owned filename search backed by VS Code search service and scoped to workspace folders. |
| `director_grep_search` | `grep_search` | `grep_search` | read | Ask, Edit, Agent | keep | Director-owned text search backed by VS Code search service and scoped to workspace folders. |
| `director_get_errors` | `get_errors` | `get_errors` | read | Ask, Edit, Agent | keep | Director-owned diagnostics reader backed by VS Code marker service. Does not run builds. |
| `director_get_changed_files` | `get_changed_files` | `get_changed_files` | read | Ask, Edit, Agent | keep | Director-owned SCM reader backed by VS Code SCM resource groups. Returns controlled unavailable text if no SCM provider exists. |
| `director_view_image` | `view_image` | `view_image` | read | Ask, Edit, Agent | keep | Director-owned image inspection. Returns metadata and an image data part where the bridge/model can consume it, with textual fallback. |
| `director_github_repo` | `github_repo` | `github_repo` | read | Ask, Edit, Agent | keep | Director-owned minimal GitHub repo context. Infers sanitized GitHub remotes or accepts owner/repo; remote indexed search and PR/issue mutation are not supported in v1. |
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
| `vscode_renameSymbol` | `rename` | `rename` | write | none | defer | Direct rename must wait for Phase 3/4 reviewable edit contract. |
| `vscode_editFile_internal` |  | `vscode_editFile_internal` | write | none | hide | Internal edit tool depends on editing-session/last-request behavior and must not sit beside Director-native reviewable edit tools. |
| `setup_tools_createNewWorkspace` | `new` | `new` | write | none | defer | Workspace scaffolding is mutation and needs a reviewed policy. |
| `setArtifacts` | `artifacts` | `artifacts` | coordination | Agent | keep | Session artifact surfacing remains available to Agent. |
| `setArtifactRules` | `artifactRules` | `artifactRules` | coordination | Agent | keep | Session artifact rule updates remain available to Agent. |
| `vscode_resolveDebugEventDetails_internal` | `resolveDebugEventDetails` | `resolveDebugEventDetails` | read | none | defer | Debug details need a separate runtime policy review. |
| `vscode_searchExtensions_internal` | `extensions` | `extensions` | read | none | defer | Extension marketplace search is outside the Phase 1/2 coding-context gate. |
| `vscode_installExtensions` | `installExtensions` | `installExtensions` | write | none | hide | Extension installation is a product/workspace mutation and is not exposed by default. |

Unreviewed raw tools from extension, MCP, user, browser automation, or future VS Code contributions are hidden from Director's model-facing tool list until a Director registry entry assigns a disposition and mode policy.

## Implementation Checkpoints

- Central registry: `src/vs/workbench/contrib/chat/common/agentEngine/directorToolRegistry.ts`
- Read-only tools: `src/vs/workbench/contrib/chat/common/agentEngine/directorReadOnlyTools.ts`
- Read-only tool registration: `src/vs/workbench/contrib/chat/browser/agentEngine/directorReadOnlyTools.contribution.ts`
- Agent definitions and invocation mapping consume registry-filtered tools in `src/vs/workbench/contrib/chat/browser/agentEngine/toolBridge.ts`
- Director Agent requests pass the Agent mode policy explicitly in `src/vs/workbench/contrib/chat/browser/agentEngine/directorCodeAgent.ts`
- Regression tests: `src/vs/workbench/contrib/chat/test/common/agentEngine/directorToolRegistry.test.ts` and `src/vs/workbench/contrib/chat/test/common/agentEngine/directorReadOnlyTools.test.ts`

## Phase 1-2 Validation

- `npm run compile-check-ts-native`
- `npm run gulp -- transpile-client-esbuild`
- `node test/unit/node/index.js --run src/vs/workbench/contrib/chat/test/common/agentEngine/directorToolRegistry.test.ts --run src/vs/workbench/contrib/chat/test/common/agentEngine/directorReadOnlyTools.test.ts`
