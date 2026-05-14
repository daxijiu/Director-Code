# 116 Director Reviewable Edit Tools Report

Date: 2026-05-14

Status: Phase 4 implementation in progress; generated-tree tests passed before clean replay validation.

## Tools

Phase 4 adds these Director-owned model-facing tools:

- `apply_patch`
- `create_file`
- `create_directory`
- `replace_string_in_file`
- `multi_replace_string_in_file`

They are allowed only in Edit and Agent registry policy. Ask and Inline do not receive model-callable edit tools in v1.

## Review Path

Text/file tools call `DirectorChatEditingAdapter.emitSingleFileTextEdit(...)`, so edits are emitted as `textEdit` start/progress/done parts bound by `chatSessionResource` and `chatRequestId`.

`create_directory` uses the Phase 3 Director-owned directory review transaction:

1. Resolve and validate the target inside the workspace.
2. Reject existing target paths.
3. Emit chat progress with accept/reject command buttons.
4. Keep the filesystem unchanged while pending.
5. Create the folder through `IFileService.createFolder` only after accept.
6. Resolve reject/cancel as no-op filesystem outcomes.

## Conservative Behavior

- Workspace targets outside the open workspace are rejected.
- Binary and large text files are rejected for text replacement tools.
- `replace_string_in_file` rejects ambiguous matches unless `replaceAll` is explicit.
- `multi_replace_string_in_file` rejects overlapping replacement ranges.
- `create_file` rejects duplicate targets unless `overwrite` is explicitly true.
- `apply_patch` supports conservative unified diff hunks, rejects mismatched hunks, rejects deletion in v1, and emits reviewable edits rather than writing files directly.

## Validation

- `npm run compile-check-ts-native`
- `npm run gulp -- transpile-client-esbuild`
- `node test/unit/node/index.js --run src/vs/workbench/contrib/chat/test/common/agentEngine/directorToolRegistry.test.ts --run src/vs/workbench/contrib/chat/test/common/agentEngine/directorReadOnlyTools.test.ts --run src/vs/workbench/contrib/chat/test/common/agentEngine/directorChatEditingAdapter.test.ts --run src/vs/workbench/contrib/chat/test/common/agentEngine/directorEditTools.test.ts`
