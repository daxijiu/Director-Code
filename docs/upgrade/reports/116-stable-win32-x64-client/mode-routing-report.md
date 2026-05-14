# 116 Director Mode Routing Report

Profile: `116-stable-win32-x64-client`

Phase: 5 Ask/Edit/Inline mode routing gate

## Summary

Director now registers the panel participant for Ask, Edit, and Agent. Runtime requests are mapped through `directorChatModeRouting.ts` so the tool bridge and model loop use the correct policy for each request instead of always behaving as Agent mode.

EditorInline is treated as a separate inline edit path. It receives selected editor context from `locationData`, asks the model for replacement text only, parses the final response, and emits a real inline `textEdit` through the shared `DirectorChatEditingAdapter`. Inline exposes no model-callable tools in v1.

## Effective Tool Policy

| Request mode | Effective tools |
|---|---|
| Ask | Read-only context only: `read_file`, `list_dir`, `file_search`, `grep_search`, `get_errors`, `get_changed_files`, `view_image`, `github_repo`, plus reviewed read helpers such as `usages` and `vscode_fetchWebPage_internal`. |
| Edit | Ask read-only set plus reviewable edit tools: `apply_patch`, `create_file`, `create_directory`, `replace_string_in_file`, and `multi_replace_string_in_file`. |
| Agent | Full reviewed Director registry, including Agent-only terminal/task/confirmation/todo/subagent tools and the reviewable edit tools. |
| Inline | No model-callable tools. Inline edits use selected editor context plus the non-tool inline edit protocol. |

## Implementation Notes

- Ask receives mode-specific prompt guardrails and bounded turns. It does not start an editing session.
- Edit receives mode-specific prompt guardrails and can use the reviewable edit tools backed by Chat Editing progress.
- Agent remains the full autonomous Director harness.
- Inline suppresses normal markdown streaming, accumulates model text, parses replacement text, and emits a `textEdit` bound to the exact inline chat request.
- Mode instructions from VS Code are appended to the system prompt; attached context variables are summarized into the user message without duplicating mode instructions.
- Agent Customizations integration is present: the Director Code section opens `director-code.openSettings`, and the Director model provider exposes the same management command.

## Replay Ownership

- `004-director-agent-engine.116.patch`: mode routing, Agent participant mode registration, request plumbing, prompt shaping, context normalization, and mode routing tests.
- `005-director-chat-built-in-mode.116.patch`: Agent Customizations Director Code bridge and settings management command wiring.
- `008-director-chat-editing.116.patch`: inline replacement parser and inline `textEdit` emission adapter.
- `009-director-edit-tools.116.patch`: browser-compatible edit tool test assertions touched during Phase 5.

## Validation

- Clean replay materialize: `bash scripts/upgrade/materialize-vscode.sh --profile docs/upgrade/profiles/116-stable-win32-x64-client.json --target vscode.generated --up-to-layer director --force`
- Dependency restore after clean materialize: `npm ci`
- TypeScript: `npm run compile-check-ts-native`
- Transpile: `npm run gulp -- transpile-client-esbuild`
- Director browser tests: `npm run test-browser-no-install -- --grep "Director (Tool Registry|Read-Only Workspace Tools|Chat Editing Adapter|Edit Tools|Chat Mode Routing)"` (`21 passing`)
- Inline request parity smoke: `npm run test-browser-no-install -- --grep "hover mode sendRequest"` (`2 passing`)
- Replay validators: `validate-series`, `validate-product-overrides`, `expected-contracts`
- Canonical manifest: write and validate with `canonical-manifest.mjs`

Note: the first `npm ci` after clean materialize hit a Windows native build file lock in a stale `node-gyp`/`MSBuild`/`link` process. After terminating those stale build processes, the retry passed.
