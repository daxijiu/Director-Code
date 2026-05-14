# 116 Director Chat Editing Contract Report

Date: 2026-05-14

Status: Phase 3 contract probe implemented in replay stage `008-director-chat-editing.116.patch`.

## Panel Chat Edit Response Contract

Director panel edit tools must bind to both:

- `chatSessionResource`
- `chatRequestId`

The Phase 3 adapter intentionally rejects missing or unknown `chatRequestId` values and does not fall back to `model.getRequests().at(-1)`.

For a reviewable single-file text edit, Director emits these response parts through `ChatModel.acceptResponseProgress(request, part)`:

1. Optional `markdownContent` containing the edit explanation.
2. `codeblockUri` with `isEdit: true`, which lets `ChatModel` create an undo stop.
3. `textEdit` with an empty `edits` array to signal edit start.
4. `textEdit` with concrete `TextEdit[]` progress.
5. `textEdit` with an empty `edits` array and `done: true` to close the stream.

In VS Code 116, `ChatModel` merges `textEdit` progress into `textEditGroup` response parts. `ChatEditingService` observes `textEditGroup`, skips only `isExternalEdit`, starts `session.startStreamingEdits(...)`, pushes new edit batches, and completes the stream when `done` is set.

## Internal Probe

The synthetic single-file edit probe is implemented as `DirectorInternalSingleFileEditProbe` in:

- `src/vs/workbench/contrib/chat/common/agentEngine/editing/directorChatEditingAdapter.ts`

It is not registered as a language model tool, command, setting, menu item, or user-visible chat tool. It exists only as an internal contract probe and test harness for Phase 4 edit tools.

The compact model-loop result shape is:

```text
edit_result: success
path: <workspace-relative-path>
edits: <count>
review: Chat Editing UI
```

Errors use:

```text
edit_result: error
reason: <controlled-reason>
```

## Directory Creation Contract

VS Code 116 exposes `workspaceEdit` response parts as `IChatWorkspaceEdit`, but the native Chat Editing implementation currently handles file deletion only:

- `oldResource && !newResource` starts a deletion entry.
- file creation, rename, and directory creation are not rendered by `ChatEditingSession.applyWorkspaceEdit(...)` in this version.

Phase 4 `create_directory` must therefore use a Director-owned review transaction for v1:

1. Resolve and validate the target directory inside the workspace.
2. Create a pending transaction keyed by session, request, and operation id.
3. Emit chat progress describing the pending directory creation plus internal accept/reject command buttons.
4. Do not call `mkdir` before accept.
5. On accept, revalidate the target and create the folder through `IFileService.createFolder`.
6. On reject or transaction disposal, perform no filesystem mutation.
7. Return the compact model-loop result after the transaction reaches accept/reject/error.

This keeps `create_directory` reviewable even though the native 116 Chat Editing UI does not provide a directory-only diff entry.

## EditorInline Note

Panel Chat Editing is not sufficient for EditorInline. Phase 5 must add a separate inline binding that maps selected editor context to concrete edits through the inline session path. The current Phase 3 work documents the panel contract and leaves the non-tool EditorInline protocol as a Phase 5 prerequisite.

## Validation

- `npm run compile-check-ts-native`
- `npm run gulp -- transpile-client-esbuild`
- `node test/unit/node/index.js --run src/vs/workbench/contrib/chat/test/common/agentEngine/directorChatEditingAdapter.test.ts`
