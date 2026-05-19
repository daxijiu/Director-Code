# 120 runInTerminal Execution Subagent Fix Plan

Date: 2026-05-18

Profile: `docs/upgrade/profiles/120-insider-win32-x64-client.json`

Status: Implemented and replay-backed. Focused validation, profile validation, packaging, memory update, commit, and remote push are closeout requirements for this fix.

## Summary

Consecutive `runInTerminal` sync calls can be interrupted or return empty output when they reuse the same foreground terminal. The source bug is that VS Code core terminal output (`onData`) is currently treated as user keyboard input. That can falsely set `receivedUserInput`, causing Basic/None shell integration strategies to send control characters before the next command.

The fix should now be implemented as a one-step hardening pass instead of a temporary prompt-only workaround:

1. Fix the source listener bug and add the regression test.
2. Add a Director-owned `execution_subagent` wrapper now.
3. Preserve terminal `toolMetadata` through a structured Director tool path.
4. Make timeout policy execution-aware so terminal/tool background metadata is not preempted by Director's generic 120s bridge timeout.

This still does not mean `execution_subagent` replaces the listener fix. The wrapper ultimately calls core terminal execution, so the bad listener must be fixed first or in the same patch.

## Implementation Notes

Implemented in the generated tree before replay regeneration:

- `runInTerminalTool.ts` now listens to `onDidInputData` instead of PTY `onData` for user input tracking.
- Tool-owned `sendText(...)` calls are guarded with a per-tool-terminal suppression depth so command sends and Basic/None control sends do not count as manual user input.
- Basic/None strategies receive a guarded terminal instance through `ActiveTerminalExecution`, covering command send plus `Ctrl+C` / `Ctrl+U` paths without changing Rich shell integration behavior.
- `VSCodeToolBridge` now has a structured result path that preserves `toolMetadata`, `toolResultMessage`, `toolResultDetails`, and rendered text.
- Direct sync `runInTerminal` calls are runtime-validated for a finite numeric timeout in `1..120000` before core terminal execution.
- Director tool registry now carries explicit timeout categories:
  - `stage-aware-terminal` for `runInTerminal`;
  - `tool-owned` for `execution_subagent`, `runTask`, `createAndRunTask`, and `getTaskOutput`;
  - `user-interaction-owned` for dedicated confirmation/question tools.
- `execution_subagent` is Director-owned, Agent-only, request-scoped by `chatRequestId`, exposes only internal `runInTerminal`, enforces sync + timeout, rejects multi-terminal-call turns before execution, passes `subAgentInvocationId`, and preserves terminal metadata for timeout/background/input-needed decisions.
- Parent Agent guidance is appended only in Agent mode and prefers `execution_subagent` for most terminal/task execution.

2026-05-19 follow-up after manual smoke:

- `execution_subagent` must use the streaming provider path for its internal loop when `createMessageStream` is available. OpenAI Codex/OAuth backends can reject non-streaming `/responses` calls with `Stream must be set to true`, so a passing implementation cannot call `createMessage(...)` first and retry after that error.
- Rich shell integration is also in scope. A stale non-empty `promptInputModel.value` at an idle prompt must not cause `Ctrl+C` before the next `runInTerminal` command. The accepted behavior is to clear the stale prompt line with `Ctrl+U`, run the command, and return non-empty output.
- The replay classifier must keep all terminal execute strategy runtime/test paths used by this fix in `007-director-tool-layer`.

Initial validation already passed before replay closeout:

- `npm run compile-check-ts-native`
- `npm run test-browser-no-install -- --browser chromium --sequential --run src/vs/workbench/contrib/directorCode/test/browser/agentEngine/toolBridge.test.ts --run src/vs/workbench/contrib/chat/test/browser/agentEngine/executionSubagent.test.ts --run src/vs/workbench/contrib/chat/test/common/agentEngine/directorToolRegistry.test.ts`

The electron-browser `runInTerminalTool.test.ts` was not directly runnable in the existing generated tree because `.build/electron` was not prepared. The regression coverage is still replayed in that test file and should be exercised by the full Electron test harness or package smoke when that harness is prepared.

## Current Evidence

- Core terminal tool reference name is `runInTerminal`, not `run_in_terminal`.
- Director currently exposes the core terminal tool by the same model-facing name, `runInTerminal`.
- Copilot prompts use `run_in_terminal` because Copilot has its own tool-name enum and contribution-name mapping. Director should not copy that spelling unless it deliberately adds a compatible alias.
- `runInTerminalTool.ts` currently tracks input through `toolTerminal.instance.onData(...)`.
- `onData` is PTY output, not user keyboard input.
- `onDidInputData` is the terminal input-side event that should replace PTY output listening, but it can also be fired by tool-owned `sendText(...)`; the implementation must guard input origin.
- `BasicExecuteStrategy` and `NoneExecuteStrategy` consume `receivedUserInput` and may send `Ctrl+C` (`\x03`) or `Ctrl+U` (`\x15`) before the next command.
- Current `VSCodeToolBridge.invokeTool()` stringifies tool results through `resultToString()` and discards `toolMetadata`.
- Copilot's execution subagent does not flatten tool results before checking background/timeout state; it reads metadata from structured tool results.
- Copilot's `execution_subagent` gets parent request context through Copilot's own tool registry/input resolution path, not through plain VS Code core `IToolInvocation.context` alone.

Relevant paths:

- `vscode.generated/layers/director/vscode/src/vs/workbench/contrib/terminalContrib/chatAgentTools/browser/tools/runInTerminalTool.ts`
- `vscode.generated/layers/director/vscode/src/vs/workbench/contrib/terminalContrib/chatAgentTools/browser/executeStrategy/basicExecuteStrategy.ts`
- `vscode.generated/layers/director/vscode/src/vs/workbench/contrib/terminalContrib/chatAgentTools/browser/executeStrategy/noneExecuteStrategy.ts`
- `vscode.generated/layers/director/vscode/src/vs/workbench/contrib/directorCode/browser/agentEngine/toolBridge.ts`
- `vscode.generated/layers/vscode/vscode/extensions/copilot/src/extension/prompts/node/agent/defaultAgentInstructions.tsx`
- `vscode.generated/layers/vscode/vscode/extensions/copilot/src/extension/prompts/node/agent/executionSubagentPrompt.tsx`
- `vscode.generated/layers/vscode/vscode/extensions/copilot/src/extension/prompt/node/executionSubagentToolCallingLoop.ts`
- `vscode.generated/layers/vscode/vscode/extensions/copilot/src/extension/tools/node/executionSubagentTool.ts`

## Root Cause Model

The failure sequence is:

1. First sync command completes in a reused foreground tool terminal.
2. Post-completion PTY output or prompt bytes arrive through `onData`.
3. `runInTerminalTool` treats those bytes as user input and sets `receivedUserInput = true`.
4. The next sync command starts in the same tool terminal.
5. `BasicExecuteStrategy` or `NoneExecuteStrategy` believes the user touched the terminal.
6. The strategy sends interrupt or clear-line control characters.
7. The second command can appear interrupted, return empty captured output, or show misleading `^C`-style behavior.

Task tools can look healthier because they use VS Code task lifecycle/output monitoring rather than the same direct foreground terminal reuse path.

## Why Copilot Usually Looks Normal

Copilot's behavior does not prove core `runInTerminal` is correct. Copilot often avoids the risky shape through `execution_subagent`:

- parent Agent prefers `execution_subagent` for most execution tasks;
- direct terminal use is reserved for rare full-output single-command cases;
- terminal calls are serialized;
- internal calls must use sync mode;
- internal calls must include timeout;
- background, timeout, and input-needed states are preserved through metadata.

This is an orchestration layer, not a source-level fix. Director should copy the behavior shape, not Copilot product code.

Copilot implementation details that inform this plan:

- Copilot stores the full prompt context in `ExecutionSubagentTool.resolveInput(...)` and later reads it from `_inputContext` during `invoke(...)`.
- Copilot can choose a dedicated execution-subagent model or agentic proxy through experiment settings, but falls back to the parent Agent endpoint. It specifically falls back to the parent endpoint for PowerShell when the proxy model is not trained for it.
- Copilot's default execution-subagent tool-call limit is `10`.
- Copilot's timeout enforcement is mostly prompt-level: internal terminal calls must include `timeout`, with `30000` for short commands and `120000` for builds/tests. There is no obvious runtime positive-timeout validation in the Copilot wrapper.
- Copilot prevents further terminal calls after timeout/background/input-needed by returning no tools to the subagent and nudging it to produce the final answer.
- Copilot does not appear to runtime-reject parallel `execution_subagent` invocations; it relies mostly on prompt guidance and supports trace handling for parallel subagents.
- Copilot logs/traces tool arguments and results with truncation and warns that debug logs may contain file or terminal output.
- Copilot's `execution_subagent.prepareInvocation(...)` only returns a user-visible invocation message. It does not add a separate VS Code core `toolSpecificData.kind === "subagent"` UI payload from the extension tool implementation.
- Copilot links the parent execution-subagent call and nested terminal calls with a stable `subAgentInvocationId`, a capturing token, and parent-result `toolMetadata`; it also sets a parent `toolResultMessage`.
- Copilot streams nested tool/edit parts from the subagent loop back to the parent stream. Those child parts carry `subAgentInvocationId`; the VS Code chat renderer then groups them under the same subagent container.
- Copilot's grouping therefore is not caused by parent `toolMetadata` alone. The parent metadata is useful for logs/final result linkage, while the visible nested terminal UI depends on forwarding child tool parts with `subAgentInvocationId`.
- Copilot's execution loop does not collapse internal terminal results to string before control decisions. It invokes tools through a structured path, records `ToolResultMetadata`, and then reads `toolMetadata` from the structured result to detect terminal id, timeout, background, and input-needed states.
- Copilot does not require a new bespoke UI surface for `execution_subagent`. It relies on existing chat tool/subagent grouping behavior.
- Copilot does not have Director's generic 120s `VSCodeToolBridge` wrapper, so Director's timeout categories are a Director-owned bridge policy rather than a Copilot behavior to copy verbatim.

Director choices where this plan is stricter than Copilot:

- Runtime-reject invalid direct sync `runInTerminal` timeout instead of relying on prompt only.
- Runtime-reject concurrent `execution_subagent` calls for the same parent `chatRequestId` in Phase 1.
- Keep Director telemetry conservative by default and avoid logging full command/output.

## Tool Naming Decision

Use Director's actual exposed names:

- Parent-facing wrapper: `execution_subagent`.
- Direct terminal tool in Director: `runInTerminal`.
- Internal execution subagent terminal tool: `runInTerminal`.

Do not write Director prompts with `run_in_terminal` unless a deliberate alias is added and tested.

Clarification: `run_in_terminal` already appears in the Director registry as an internal VS Code tool id mapping for the `runInTerminal` model-facing entry. That is not a model-callable alias. In this document, "alias" means an additional model-callable name, not an `internalToolIds` entry.

Do not present core `runSubagent` as equivalent to `execution_subagent`. `runSubagent` is generic delegation. `execution_subagent` is a constrained terminal-execution wrapper with terminal-specific timeout/background handling.

## P0 Prompt Risk Avoidance

Do not add the old Phase 1 temporary guidance by setting `getDirectorModeSystemPrompt(DirectorToolMode.Agent)`.

Reason: in the current Agent Engine, setting `config.systemPrompt` can replace the normal default Agent prompt/tool context instead of merely appending terminal guidance. That risks dropping core Agent instructions, cwd context, and available-tool guidance.

Safe prompt landing rules:

- Add parent Agent execution guidance through an append-only prompt path.
- If no append-only hook exists, add one deliberately, for example a Director-owned `getDirectorModeAppendSystemPrompt(...)` path.
- Merge with existing `request.modeInstructions?.content` rather than replacing it.
- Add a test that proves default Agent prompt content still exists after execution guidance is enabled.

## Phase 1: One-Step Hardening

Goal: fix the source bug and land Director's safe execution wrapper in the same implementation phase.

### 1. Source Listener Fix

Change `_registerInputListener()` in `runInTerminalTool.ts` from output listening to real input listening, but do not treat every `onDidInputData` event as manual user input.

Important nuance: `ITerminalInstance.sendText(...)` can also fire `onDidInputData` internally. A plain `onData -> onDidInputData` replacement is therefore not sufficient. The fix must distinguish tool-originated sends from user-originated input.

```ts
private _registerInputListener(toolTerminal: IToolTerminal): void {
	const disposable = toolTerminal.instance.onDidInputData(data => {
		if (toolTerminal.isIgnoringToolInitiatedInputData?.()) {
			return;
		}
		if (!telemetryIgnoredSequences.includes(data)) {
			toolTerminal.receivedUserInput = data.length > 0;
		}
	});
	Event.once(toolTerminal.instance.onDisposed)(() => disposable.dispose());
}
```

Implementation requirements:

- Keep `telemetryIgnoredSequences` initially for minimal behavior drift.
- Add a small terminal-input-origin guard for tool-owned `sendText(...)` calls. This can be a per-tool-terminal suppression counter/token, a guarded send helper, or an equivalent wrapper, but it must cover the command send and the internal control sends used by Basic/None strategies (`\x03`, `\x15`).
- Do not leave Basic/None execute strategies with direct tool-owned `instance.sendText(...)` calls that can set `receivedUserInput` through `onDidInputData`. Either pass a guarded send helper/origin tracker into the strategies or centralize the suppression around the terminal instance used by the strategies.
- Clear the suppression guard in `finally` so cancellation, timeout, rejected sends, and thrown errors cannot leave future real user input ignored.
- Ensure terminal result paths that return without normal success cleanup (`timeout`, `inputNeeded`, `continueInBackground`, cancellation/error) do not leave stale tool-originated `receivedUserInput = true` behind.
- Real manual typing into the terminal while no tool-owned suppression is active must still set `receivedUserInput`.

### 2. Regression Tests

Add targeted terminal-tool regression coverage.

Required cases:

- PTY output emitted through `onData` must not set `receivedUserInput`.
- Real user input emitted through `onDidInputData` should still set `receivedUserInput`.
- Tool-originated `sendText(...)` events emitted through `onDidInputData` must not set `receivedUserInput`.
- Tool-originated Basic/None control sends (`\x03`, `\x15`) must not set or leave `receivedUserInput`.
- Force `ShellIntegrationQuality.Basic` as one required path.
- Force `ShellIntegrationQuality.None` as a second required path. This bug affects both Basic and None strategies, so Phase 1 is not accepted unless both paths are covered or there is a documented harness limitation with an equivalent targeted substitute.
- Do not rely on `ShellIntegrationQuality.Rich` as the primary path; Rich does not consume `receivedUserInput` in the same way.
- Run two consecutive foreground `mode: "sync"` terminal commands in the same session.
- Fire post-command `onData` bytes after command 1 and before command 2.
- Fire tool-originated `onDidInputData` bytes for command 1's own `sendText(...)` path and verify they are ignored.
- Cover success, timeout, `inputNeeded`, and `continueInBackground` return paths so stale tool-originated input state cannot leak into the next command.
- Assert command 2 does not send `Ctrl+C` (`\x03`) or `Ctrl+U` (`\x15`).
- Assert command 2 returns non-empty captured output.

Likely test file:

- `vscode.generated/layers/director/vscode/src/vs/workbench/contrib/terminalContrib/chatAgentTools/test/electron-browser/runInTerminalTool.test.ts`

### 3. Structured Tool Result Path

Current `VSCodeToolBridge.invokeTool()` returns only a string. That is fine for old generic Agent tool usage, but it is not enough for `execution_subagent`.

Add a structured invocation path, for example:

```ts
interface DirectorStructuredToolResult {
	text: string;
	content: Array<any>;
	toolResultError?: string | boolean;
	toolResultMessage?: unknown;
	toolResultDetails?: unknown;
	toolMetadata?: unknown;
}
```

Required behavior:

- Keep existing `invokeTool(name, input): Promise<string>` for compatibility.
- Add `invokeToolStructured(...)` or an equivalent Director-owned path that returns metadata.
- The structured invocation path should accept options, not only `name` and `input`, for example:

```ts
interface DirectorStructuredToolOptions {
	readonly subAgentInvocationId?: string;
	readonly requirePositiveSyncTimeout?: boolean;
	readonly timeoutPolicy?: 'generic-bridge' | 'stage-aware-terminal' | 'user-interaction-owned';
}
```

- Preserve at least:
  - `toolMetadata`;
  - `toolResultMessage`;
  - `toolResultDetails`;
  - original content parts;
  - text rendering used by the current Agent loop.
- Ensure `execution_subagent` uses the structured path, not the string-only path.
- Phase 1 implementation decision: `execution_subagent` should use a dedicated terminal-only structured loop that invokes `VSCodeToolBridge.invokeToolStructured(...)` directly. Do not implement it by simply instantiating the current generic `AgentEngine` with `IToolExecutor.invokeTool(...)`, because that interface returns only `Promise<string>` and cannot carry terminal `toolMetadata`.
- If future implementation wants to reuse the generic `AgentEngine` for the internal execution loop, it must first extend `IToolExecutor`, `ToolResult`, and the emitted tool-result events to carry structured metadata without breaking the existing string-return compatibility path. That is not the default Phase 1 path.
- The internal execution loop may render text results back to the model, but terminal lifecycle decisions must read structured metadata out-of-band, similar to Copilot's `ToolResultMetadata` path.
- Pass `subAgentInvocationId` through to the underlying `IToolInvocation` when provided.
- Put terminal sync-timeout validation in a shared bridge helper used by both `invokeTool(...)` and `invokeToolStructured(...)`.
- Resolve terminal execution mode with the same semantics as core `runInTerminal`: `mode ?? (isBackground ? "async" : "sync")`.
- When the target tool is `runInTerminal` and the resolved mode is `"sync"`, reject missing, zero, negative, non-numeric, or `>120000` timeout before invoking the core terminal tool. This validation must cover explicit `mode: "sync"`, missing `mode`, legacy `isBackground: false`, the legacy string-return path, and the new structured path.
- Do not use an ambiguous `timeoutPolicy: "none"` mode. If the bridge timeout is bypassed, the option must say which lifecycle owns the wait.

Model-facing terminal schema and description:

- Prefer a Director registry/schema override for the model-facing `runInTerminal` definition instead of broadly changing core terminal tool copy.
- Do not hand-write a partial replacement schema. Director's registry path currently treats `entry.inputSchema` as a full replacement for the upstream `toolData.inputSchema`, so a partial override could accidentally drop core properties such as `command`, `explanation`, `goal`, `mode`, `isBackground`, sandbox-related fields, or future upstream fields.
- Implement this as a clone/merge or schema-transform helper: start from the core `runInTerminal` schema, then tighten timeout-related schema/description where Director needs stricter model-facing guidance.
- The Director-exposed `runInTerminal` description must tell the model that sync calls require `timeout` in the inclusive range `1..120000`, with `30000` for short commands and `120000` for builds/tests.
- The Director-exposed schema should make the sync timeout requirement hard to miss. If JSON Schema cannot express the legacy `mode` / `isBackground` relationship cleanly, keep the bridge runtime validation as the authority and add explicit schema/description tests.
- Do not leave model-facing guidance that says sync `runInTerminal` may omit timeout or use `timeout=0`.

Copilot reference:

- Copilot calls `vscode.lm.invokeTool(...)` and keeps the returned result object.
- Its execution subagent loop reads `toolMetadata.timedOut`, `toolMetadata.timeoutMs`, `toolMetadata.inputNeeded`, and terminal id.
- Its final `execution_subagent` result attaches its own `toolMetadata` with `subAgentInvocationId`.

Director should implement the same metadata semantics in Director-owned code.

### 4. Director-Owned execution_subagent

Add a Director-owned tool named `execution_subagent`.

Registration shape:

- Register a real Director-owned internal tool with `ILanguageModelToolsService`.
- Use an internal id such as `director_execution_subagent`.
- Use `toolReferenceName` / model-facing name `execution_subagent`.
- Add a Director tool registry entry with backing `director`.
- Do not implement it only as an AgentEngine-local pseudo tool, because `VSCodeToolBridge` discovers callable tools from `ILanguageModelToolsService`.
- Add a Director-owned contribution file that registers both tool data and implementation through `ILanguageModelToolsService.registerTool(...)`, following the existing Director-owned tool contribution pattern.
- Add discovery/registry tests proving `execution_subagent` is model-callable in Agent mode and hidden from Ask, Edit, Inline, and Plan modes.

Parent context source:

- Do not assume plain `IToolInvocation.context` is sufficient to run an internal Agent loop.
- Add a Director-owned execution subagent context service, or equivalent request-scoped context holder.
- `DirectorCodeAgent` should populate this service at the start of each parent request keyed primarily by `chatRequestId`.
- Treat `sessionResource` as secondary scope/context only. Do not key the live parent context by `sessionResource` alone, because two requests in the same chat session could otherwise cross-talk.
- If `chatRequestId` is unavailable for an `execution_subagent` invocation, fail closed with a clear tool error rather than falling back to session-only lookup.
- The context should provide the data needed by the execution subagent:
  - parent provider and model;
  - cwd / workspace folder;
  - session resource and request id;
  - current Director mode;
  - available tool metadata or a way to create a filtered bridge exposing only `runInTerminal`;
  - cancellation/abort signal;
  - max token/turn settings needed for the inner loop.
- The context must be cleared when the parent request completes, fails, or is cancelled.
- If `execution_subagent` is invoked without a matching parent context, return a clear tool error instead of trying to run with partial defaults.

Internal model and budget policy:

- Phase 1 should reuse the parent Agent's current provider/model.
- Do not introduce Copilot-style agentic proxy or a dedicated execution model in Phase 1.
- Set a small fixed internal turn/tool-call limit first: `5`.
- Keep the limit configurable later, but do not make configuration plumbing a blocker for Phase 1.
- If the parent model/provider cannot support the internal terminal-only loop, return a clear tool error; do not silently fall back to another provider.

Parent-facing schema:

- `query`: execution task or command goal.
- `description`: short user-visible description.
- Both fields are required.
- Reject unknown top-level properties with `additionalProperties: false`.
- Keep both fields short enough for an internal execution prompt. Phase 1 can use a conservative length cap rather than passing arbitrary nested objects into the subagent.
- Do not accept command output, terminal transcript, secrets, provider credentials, or arbitrary metadata through this schema.

Internal behavior:

- Create a stable `subAgentInvocationId`.
- Run a small execution-focused, terminal-only structured loop. Do not route internal terminal calls through the current generic `AgentEngine` string-only tool executor.
- Expose only `runInTerminal` internally.
- Pass `subAgentInvocationId` into internal `runInTerminal` invocations.
- Forward internal `runInTerminal` tool progress/results to the parent chat surface by invoking the core tool through `languageModelToolsService` with the parent `sessionResource`, parent `chatRequestId`, and the stable `subAgentInvocationId`. This must create real terminal `ChatToolInvocation` parts, not plain `progressMessage` entries from `agentEventToProgress(...)`.
- Treat parent-result `toolMetadata.subAgentInvocationId` as final-result/log linkage only. It is not enough by itself to produce Copilot-style nested terminal grouping in the UI.
- If the parent chat request/progress surface is unavailable, the wrapper may still return the compact final summary, but the normal Agent-mode path must have real terminal tool invocation forwarding wired and tested before claiming Phase 1 nested grouping parity.
- Do not bypass the normal terminal confirmation / pre-approval path. The wrapper constrains terminal execution; it does not grant extra permission.
- If the internal model emits more than one `runInTerminal` call in the same assistant turn, Phase 1 must reject that inner turn with a clear synthetic tool error and execute none of those terminal commands. The internal prompt still tells the model one call per turn, but Director enforces the safety boundary at runtime.
- Stop exposing tools after a timeout/background/input-needed terminal result.
- Return a compact summary to the parent Agent.
- Because the execution subagent intentionally exposes only `runInTerminal`, it must not try to recover from timeout/background/input-needed by calling `getTerminalOutput`, `sendToTerminal`, or other terminal lifecycle helpers internally.
- If a command times out, moves to background, or needs input, the compact summary must include the terminal id, the status, relevant output excerpt, and clear next-step guidance for the parent Agent/user. This compensates for `runInTerminal` suppressing normal terminal notifications when `subAgentInvocationId` is present.
- Reject a second concurrent `execution_subagent` invocation for the same parent `chatRequestId` while one is still running. Do not queue in Phase 1; a clear tool error is easier to reason about and test.
- Release the running marker in `finally` so success, failure, cancellation, and unexpected exceptions all clear the concurrency guard.
- If the wrapper-level watchdog fires, abort the internal execution loop through its `AbortController` / cancellation path, clear the request-scoped context, and clear the running marker.
- If an internal terminal command has already started when the wrapper watchdog fires, do not send extra `Ctrl+C` from the wrapper. Let the terminal tool's own timeout/background metadata resolve command state so the wrapper does not reintroduce the interruption class of bug.
- Attach wrapper-level `toolMetadata` containing:
  - `query`;
  - `description`;
  - `subAgentInvocationId`;
  - `agentName: "execution"`;
  - any background command summaries needed for the user-visible result or debug-only diagnostics, respecting the privacy boundary below.

Internal prompt rules:

```text
You are Director Code's execution subagent. Your job is to run terminal commands for one execution-focused task and return a compact result.

When calling runInTerminal, you MUST follow these rules:
- Always use mode="sync".
- Always include timeout in milliseconds.
- Use timeout=30000 for short commands.
- Use timeout=120000 for builds and test suites.
- Do not exceed timeout=120000. Commands that run longer should move to terminal timeout/background handling and be summarized with terminal id/status.
- Call runInTerminal at most once per turn. Do not call it in parallel.
- If a command may prompt for confirmation, use non-interactive flags such as --yes or -y when appropriate.
- Prefer focused output.

When finished, return a compact final answer:
- List each command that was run.
- State whether it succeeded, failed, timed out, moved to background, or needed input.
- Include only the relevant output excerpts needed by the parent Agent.
- If more work is needed, say exactly what remains.
```

### 5. Parent Agent Prompt Guidance

Add prompt guidance only through the safe append-only path described above.

Scope:

- Apply this execution guidance only to Agent mode.
- Do not append this guidance to Ask, Edit, Inline, or Plan mode prompts.
- Keep Plan Mode's `director_present_plan` contract isolated from terminal-execution guidance.

Parent Agent prompt text should use actual Director tool names:

```text
For most execution tasks and terminal commands, use execution_subagent to run commands and get the relevant portions of the output.
Use runInTerminal only in rare cases when the entire output of a single command is needed without summarization or truncation.
When directly calling runInTerminal in sync mode, always include timeout in milliseconds from 1 to 120000. Use 30000 for short commands and 120000 for builds/tests. Do not omit timeout and do not use timeout=0.
Use mode="async" only for servers, watchers, dev daemons, or other commands that should keep running while you continue other work.
Do not call execution_subagent multiple times in parallel. Invoke one execution subagent and wait for its response before starting another execution task.
Do not call runInTerminal multiple times in parallel. Run one command and wait for output before running the next command.
Use runTask or createAndRunTask when the request is better represented as a VS Code task and the expected task lifecycle is appropriate for the current timeout behavior.
```

This replaces the old temporary guidance plan. Do not keep contradictory prompt text that says Phase 1 lacks `execution_subagent`.

### 6. Timeout Strategy

Keep Director's generic 120s timeout for ordinary tools:

- read-only context tools;
- edit tools;
- extension/MCP tools without their own execution lifecycle;
- execute/browser/task tools that are not currently waiting for explicit user input and have not moved into a more specific lifecycle policy.

For terminal execution tools, do not let the bridge-level 120s timeout preempt structured terminal state after command execution has actually started:

- `execution_subagent`;
- `runInTerminal`;

Important nuance:

- `execution_subagent` must enforce positive timeout for every internal sync `runInTerminal` call.
- Direct parent `runInTerminal` should be rare. For direct sync calls, require an explicit positive timeout before exempting from the bridge-level timeout.
- The bridge timeout owner should be stage-aware:
  - before any user-waiting state or tool-owned execution state, the generic bridge watchdog is active;
  - while the invocation is explicitly waiting for user input/confirmation, the generic bridge watchdog is suspended and the user-interaction UI owns the wait;
  - after user approval, preparation resumes under the bridge watchdog until terminal execution actually starts;
  - once terminal execution starts, the terminal tool's own `timeout` parameter owns command execution and the bridge watchdog must not preempt its structured metadata.
- User-waiting state must cover all explicit user participation points in the tool pipeline:
  - pre-execution confirmation via `awaitConfirmation(...)`;
  - editable tool input / raw input confirmation flows, including `toolSpecificData.kind === "input"`;
  - dialog fallback confirmation paths used when there is no chat request surface;
  - post-execution approval via `awaitPostConfirmation(...)`;
  - dedicated user-interaction tools such as `askQuestions` and `vscode_get_confirmation*`.
- The bridge cannot infer these boundaries from the existing whole-call `toolsService.invokeTool(...)` promise. Phase 1 must add narrow Director-owned stage signals or equivalent hooks for user-waiting state and post-confirmation/pre-invoke execution state.
- Do not use the existing `onDidInvokeTool` event as the terminal execution boundary. It fires before prepare/confirmation and is too early for terminal timeout ownership.
- The terminal execution stage signal must not fire when confirmation is denied, skipped, prepare fails, or the tool returns before `tool.impl.invoke(...)`. In those cases the bridge returns the proper user-denied/prepare-failed result or stays bridge-guarded until completion/cancellation.
- The user-waiting and terminal-execution stage signals must remain Director-internal mechanisms, not new public extension APIs. They should carry only minimal state such as `callId`, `toolId`, `chatRequestId`, and a stage enum; they must not carry terminal command text or output.
- If these stage signals cannot be implemented cleanly in Phase 1, the timeout policy is not complete. Do not silently ship a partial exemption that still times out explicit user interaction or preempts terminal metadata.
- Bridge timeout must cancel the underlying tool invocation, not only reject the bridge promise. Use a per-invocation linked `CancellationTokenSource` or equivalent cancellation handle so a bridge timeout cancels pending confirmation/prepare work and does not leave a hidden tool invocation running.
- The cancellation handle must be linked to the parent request token and disposed in `finally`. Preserve the distinction between user/parent cancellation, bridge infrastructure timeout, and terminal-owned command timeout in the returned error/metadata.
- The bridge timeout and the stage signals can race. The implementation must define single-winner transitions: if bridge timeout fires first, later stage signals are ignored; if user-waiting fires first, the bridge timer is suspended until the user decision; if terminal-execution fires first, the bridge timer/listener is cleared and terminal-owned timeout takes over.
- Do not silently rewrite missing terminal timeouts in this bug fix.
- Return a clear tool error for invalid direct sync calls with missing, zero, negative, or non-numeric timeout. Do not invoke the core terminal tool in that case.
- Validate timeout as a finite JavaScript number. Reject `NaN`, `Infinity`, string values such as `"30000"`, objects, arrays, and other non-number values instead of coercing them.
- Return a clear tool error for direct sync timeout values above `120000`, with guidance to use async/background semantics, an appropriate task flow, or a narrower command. Do not automatically rewrite an oversized sync call into async/task execution.
- Async `runInTerminal` keeps its existing semantics; the positive-timeout requirement applies to sync execution.
- Phase 1 sets a conservative maximum sync timeout policy to avoid an effectively unbounded direct terminal wait:
  - direct sync `runInTerminal`: maximum `120000` ms / 2 minutes, matching Copilot's build/test guidance;
  - internal `execution_subagent` defaults: `30000` ms for short commands, `120000` ms for builds/tests;
  - internal installs or large builds still use `120000` ms; if they exceed that, preserve terminal timeout/background metadata instead of surfacing a generic bridge timeout;
  - longer-running processes should use async/background semantics or tasks instead of longer sync terminal execution.
- `execution_subagent` also needs a wrapper-level watchdog for the inner model loop. A terminal command timeout does not protect the model-only planning or summarization turns. Initial policy:
  - model-only subagent turn before/after terminal execution: `120000` ms;
  - while an internal terminal command is active: requested terminal timeout plus `60000` ms grace;
  - report wrapper watchdog expiry as infrastructure timeout, separately from terminal command timeout.
- Direct sync `runInTerminal` also needs a terminal-owned infrastructure failsafe once terminal execution starts:
  - the failsafe must not fire before the requested terminal timeout;
  - initial value: requested terminal timeout plus `60000` ms grace;
  - if it fires, report an infrastructure timeout distinct from terminal command timeout;
  - cancel the linked invocation token if possible, but do not send an extra `Ctrl+C` / `Ctrl+U` from the bridge;
  - this failsafe is only for broken/lost terminal lifecycle resolution and must not replace normal `toolMetadata.timedOut` / background metadata.

Core terminal timeout semantics to preserve:

- If `runInTerminal` reaches its own timeout, it should return partial output plus terminal id/background metadata.
- `toolMetadata.timedOut = true` and `toolMetadata.timeoutMs` must be visible to `execution_subagent`.
- Timeout should be summarized as background state, not converted to a generic failed tool invocation.

Task tools:

- Phase 1 exempts `runTask`, `createAndRunTask`, and `getTaskOutput` from the generic Director bridge 120s timeout by assigning them the explicit `tool-owned` timeout category.
- Rationale: task tools have their own VS Code task/output lifecycle and can legitimately exceed 120s, similar to terminal execution.
- Phase 2 still reviews their detailed lifecycle/status semantics, but the outer bridge must not reject them first while the task layer may still be running and collecting output.

Terminal lifecycle helpers:

- Do not automatically exempt `sendToTerminal`, `getTerminalOutput`, or `killTerminal` in Phase 1.
- Keep their existing bridge timeout unless a targeted review proves a helper has its own bounded lifecycle and clear status reporting.
- If a helper exemption is needed, prefer a short helper-specific timeout over an unbounded wait.

User-interaction timeout policy:

- Current Director bridge has a hard-coded no-bridge-timeout exception for `askQuestions`.
- Phase 1 should replace the string-only special case with an explicit `user-interaction-owned` timeout category.
- Add an explicit `timeoutCategory` field to `DirectorToolRegistryEntry`; this is the source of truth for bridge timeout policy.
- `getDirectorToolAllowlist(...)` surfaces each tool's timeout category to `VSCodeToolBridge`. `VSCodeToolBridge` consumes that policy instead of maintaining an expanding bridge-local string set.
- Do not derive whole-tool `user-interaction-owned` from `access`, `confirmationPolicy`, or any generic pre-approval flag. The category must be assigned explicitly per dedicated interaction tool.
- Dedicated user-interaction / confirmation tools must be exempt from the generic bridge timeout for the whole invocation:
  - `askQuestions`, because it waits for question-carousel user answers;
  - `vscode_get_confirmation`;
  - `vscode_get_confirmation_with_options`;
  - `vscode_get_modified_files_confirmation`;
  - `vscode_get_terminal_confirmation`.
- Any future dedicated tool whose primary purpose is to wait for user input, confirmation, option selection, or review approval must be assigned this category before it is exposed to the model.
- This is not the same as every tool that has a generic pre-approval prompt. Many execute/edit/browser tools request approval before running but still have their own execution lifecycle after approval.
- Do not put all `pre-approval`, `director-pre-approval`, or `director-session-approval` tools into the whole-tool `user-interaction-owned` category.
- Instead, non-interaction tools that enter an explicit waiting-for-user state should suspend the bridge watchdog only for that waiting interval, then resume the appropriate lifecycle owner after the user decision.
- Tools such as `runInTerminal`, edit tools, browser execute tools, and task tools should therefore be stage-aware rather than globally user-interaction-owned, unless a targeted review proves the whole tool invocation is user-owned from start to finish.

Subagent UI policy:

- A separate custom UI surface is not required for Phase 1. Director should follow Copilot's minimal shape:
  - parent invocation message;
  - parent `toolResultMessage`;
  - parent `toolMetadata.subAgentInvocationId` for result/log linkage;
  - real child `runInTerminal` terminal tool invocation parts carrying the same `subAgentInvocationId` for visible nested grouping.
- Do not describe Phase 1 as nested-subagent UI parity unless the internal terminal tool calls create real `ChatToolInvocation` parts on the parent chat request with `subAgentInvocationId`.
- Do not rely on `agentEventToProgress(...)` / `progressMessage` conversion for nested terminal UI. That path is acceptable for generic status text, but not for terminal tool grouping.
- VS Code core also has native subagent rendering keyed by `toolSpecificData.kind === "subagent"` on the parent tool invocation. Director can choose to use that later for a richer collapsible subagent UI, but that is a UI/product decision rather than a correctness prerequisite for the terminal sync regression.
- Do not require `execution_subagent.prepareToolInvocation(...)` to set `toolSpecificData: { kind: "subagent", ... }` in Phase 1.
- If Director later chooses the richer native subagent UI, `execution_subagent.prepareToolInvocation(...)` should set `toolSpecificData: { kind: "subagent", description, agentName: "execution", modelName? }` and add UI/serialization tests.

### 7. Replay Landing

Generated-tree edits are only for debugging. Durable changes must be replay-backed.

Expected replay placement:

- `runInTerminalTool.ts` listener fix and terminal tests: `patches/replay/007-director-tool-layer.120-insider.patch`.
- Director structured bridge and `execution_subagent` implementation: mostly `patches/replay/004-director-agent-engine.120-insider.patch`.
- Director tool registry/mode policy exposure: `patches/replay/007-director-tool-layer.120-insider.patch` if the existing classifier owns that path.
- User-waiting and post-confirmation / pre-invoke stage signal changes in `src/vs/workbench/contrib/chat/browser/tools/languageModelToolsService.ts` and related tests should land in `patches/replay/004-director-agent-engine.120-insider.patch`.
- `VSCodeToolBridge` structured result, shared timeout validation, and linked cancellation changes in `src/vs/workbench/contrib/directorCode/browser/agentEngine/toolBridge.ts` should land in `patches/replay/004-director-agent-engine.120-insider.patch`.
- New Director-owned `execution_subagent` implementation/context/contribution files should live under Director-owned `directorCode/**` or existing Director `chat/browser/agentEngine/**` adapter paths and land in `004-director-agent-engine`, unless the registry-only exposure change belongs in `007-director-tool-layer`.
- Narrow prompt copy only: keep with the owning implementation patch unless it is purely copy polish.

Classifier requirement:

Current `scripts/upgrade/generate-director-patches.mjs` can classify broad `src/vs/workbench/contrib/terminalContrib/**` paths as branding. Add a narrow classifier exception before the broad branding rule so these exact runtime/test paths land in the tool layer:

- `src/vs/workbench/contrib/terminalContrib/chatAgentTools/browser/tools/runInTerminalTool.ts`
- `src/vs/workbench/contrib/terminalContrib/chatAgentTools/test/electron-browser/runInTerminalTool.test.ts`
- any directly related execute-strategy test or fixture file needed by the regression.

Do not let this runtime fix land in `002-director-branding.120-insider.patch`.

Replay acceptance check:

- After generating replay patches, inspect the produced patch diff and confirm `runInTerminalTool.ts` and the terminal regression test landed in `007-director-tool-layer.120-insider.patch`.
- Confirm the Director structured bridge / execution subagent implementation landed in the intended Director-owned agent/tool-layer patch, not branding.

### 8. Validation

Targeted tests:

- terminal listener regression;
- Basic shell integration no false `Ctrl+C` / `Ctrl+U`;
- None shell integration no false `Ctrl+C` / `Ctrl+U`;
- structured bridge preserves `toolMetadata`;
- `execution_subagent` internal terminal loop reads structured result metadata directly and never depends on the string rendering of a terminal tool result for timeout/background/input-needed control decisions;
- terminal sync-timeout validation covers both `invokeTool(...)` and `invokeToolStructured(...)`;
- terminal sync-timeout validation uses resolved execution mode, covering explicit `mode: "sync"`, missing `mode`, and legacy `isBackground: false`;
- Director-exposed `runInTerminal` schema/description no longer tells models that sync calls may omit timeout or use `timeout=0`;
- Director-exposed `runInTerminal` schema is produced by merging/transforming the core schema, and still includes required core properties such as `command`, `explanation`, `goal`, and execution-mode fields;
- `execution_subagent` exposes only `runInTerminal`;
- `execution_subagent` is registered through `ILanguageModelToolsService` and appears only in Agent mode discovery;
- `execution_subagent` input schema requires `query` and `description`, rejects unknown properties, and does not accept arbitrary nested metadata;
- `execution_subagent` Phase 1 UI follows the minimal Copilot-style shape: invocation message, `toolResultMessage`, parent `toolMetadata.subAgentInvocationId`, and real child terminal `ChatToolInvocation` parts carrying the same `subAgentInvocationId`, without requiring a new custom UI surface;
- internal `runInTerminal` tool-use/tool-result progress emitted by `execution_subagent` reaches the parent chat request as real terminal tool invocation progress and is grouped under the execution subagent by `subAgentInvocationId`;
- a multi-call inner assistant turn with more than one `runInTerminal` call is rejected before any terminal command starts;
- `execution_subagent` rejects or handles missing internal timeout;
- direct sync `runInTerminal` rejects missing, zero, negative, or non-numeric timeout before invoking core terminal execution;
- direct sync `runInTerminal` rejects non-finite or non-number timeout values such as `Infinity`, `NaN`, `"30000"`, objects, or arrays before invoking core terminal execution;
- direct sync `runInTerminal` rejects timeout values above the Phase 1 maximum of `120000` ms;
- `onDidInputData`-based input tracking ignores tool-originated `sendText(...)` events while still detecting real manual typing;
- tool-originated `sendText(...)` suppression is cleared on success, cancellation, timeout, `inputNeeded`, `continueInBackground`, and thrown errors;
- non-interactive prepare/start hangs are still protected by a short bridge watchdog;
- explicit user-waiting state suspends the bridge watchdog until the user answers, cancels, or denies;
- user-waiting timeout suspension covers pre-confirmation, editable input/raw-input confirmation, dialog fallback confirmation, and post-execution approval;
- the bridge timeout switches to tool-owned terminal timeout only after an explicit post-confirmation/pre-invoke terminal-execution stage signal;
- the timeout boundary is not implemented by reusing `onDidInvokeTool`;
- confirmation denied/skipped and prepare-failure paths do not emit the post-confirmation/pre-invoke stage signal and do not switch to tool-owned timeout;
- bridge timeout versus user-waiting/pre-invoke stage-signal races have deterministic single-winner behavior, and listeners/timers are cleaned up in all orders;
- user-waiting and post-confirmation/pre-invoke stage signals are Director-internal and do not expose command/output data;
- bridge timeout cancels the underlying tool invocation through a token linked to the parent request, preserves user-cancel versus timeout semantics, and disposes the cancellation handle;
- direct sync `runInTerminal` terminal-owned execution has an infrastructure failsafe of requested timeout plus grace, and that failsafe reports infra timeout without sending extra terminal interrupts;
- `execution_subagent` wrapper-level watchdog reports infrastructure timeout separately from terminal timeout;
- wrapper watchdog aborts the internal execution loop and clears context/running markers without sending extra terminal `Ctrl+C`;
- internal `runInTerminal` calls through `execution_subagent` still go through normal terminal confirmation / pre-approval;
- internal `execution_subagent` tool discovery exposes only `runInTerminal`, including after timeout/background/input-needed states where it should expose no further tools;
- concurrent `execution_subagent` calls in the same parent `chatRequestId` are rejected clearly;
- the execution-subagent running marker is cleared on success, failure, cancellation, and thrown errors;
- the request-scoped execution-subagent context is cleared on parent success, parent failure, parent cancellation, tool error, and wrapper watchdog expiry;
- invoking `execution_subagent` without request-scoped parent context returns a clear tool error;
- timed-out terminal command becomes background summary, not generic bridge timeout;
- parent prompt append path preserves default Agent prompt;
- execution prompt guidance is appended only in Agent mode, not Ask/Edit/Inline/Plan;
- terminal lifecycle helpers are not exempted from the bridge timeout unless their own bounded lifecycle is reviewed and tested;
- task tools are exempted from bridge 120s only if task lifecycle tests/review prove bounded behavior; otherwise task timeout behavior remains unchanged in Phase 1;
- pure user-interaction tools use the `user-interaction-owned` timeout category: `askQuestions`, `vscode_get_confirmation`, `vscode_get_confirmation_with_options`, `vscode_get_modified_files_confirmation`, and `vscode_get_terminal_confirmation`;
- `user-interaction-owned` is assigned by an explicit `timeoutCategory` on `DirectorToolRegistryEntry`, not inferred from `access`, `confirmationPolicy`, or pre-approval behavior;
- generic pre-approval tools are not automatically classified as whole-tool `user-interaction-owned`;
- generic pre-approval tools that actually enter an explicit waiting-for-user state suspend the bridge watchdog only for that waiting interval.

Replay/profile validation:

```powershell
node scripts/upgrade/validate-series.mjs --profile docs/upgrade/profiles/120-insider-win32-x64-client.json
node scripts/upgrade/validate-product-overrides.mjs --profile docs/upgrade/profiles/120-insider-win32-x64-client.json
node scripts/upgrade/expected-contracts.mjs --profile docs/upgrade/profiles/120-insider-win32-x64-client.json
node scripts/upgrade/canonical-manifest.mjs --profile docs/upgrade/profiles/120-insider-win32-x64-client.json
```

Manual Windows smoke:

1. Run a short direct sync terminal command with an explicit positive timeout and verify non-empty output.
2. Immediately run a second direct sync terminal command with an explicit positive timeout in the same Agent session and verify no `^C`, no empty output, and no aborted prompt.
3. Try direct sync `runInTerminal` without timeout, with omitted `mode`, with legacy `isBackground=false`, with `timeout=0`, and with `timeout>120000`; verify each invalid sync shape is rejected before core terminal execution.
4. Simulate tool-originated `sendText(...)` firing `onDidInputData` and verify it does not poison the next command.
5. Cover timeout/inputNeeded/background direct terminal paths and verify tool-originated input suppression does not leak into the next command.
6. Run through `execution_subagent` for a short command and verify compact summary.
7. Run through `execution_subagent` for a command with a deliberately short timeout and verify background/terminal id summary.
8. Trigger or mock terminal pre-confirmation, editable/raw-input confirmation, and post-execution approval paths; verify the bridge watchdog is suspended only while the invocation is explicitly waiting for the user.
9. Trigger or mock bridge timeout during non-interactive prepare/start work and verify the underlying tool invocation is cancelled, not only hidden behind a rejected bridge promise.
10. Trigger or mock direct terminal-owned infrastructure failsafe expiry and verify it reports infra timeout without sending extra `Ctrl+C` / `Ctrl+U`.
11. Trigger or mock wrapper watchdog expiry and verify the internal execution loop is aborted, context/running markers are cleared, and no extra terminal `Ctrl+C` is sent by the wrapper.
12. Verify direct `runInTerminal` remains available for rare raw full-output cases.
13. Verify `execution_subagent` does not expose `getTerminalOutput`, `sendToTerminal`, `killTerminal`, or task tools internally.
14. Verify timeout/background/input-needed execution-subagent summaries include terminal id, status, and relevant output excerpt.

## Phase 2: Follow-Up Stabilization

Phase 2 is no longer "add execution_subagent"; that belongs in Phase 1 now. Phase 2 should be cleanup and hardening after the one-step fix lands.

The purpose is to make the Phase 1 behavior observable, less ambiguous, and easier to carry across future VS Code baselines.

### 1. Tool Naming Stabilization

Default decision:

- Keep Director's canonical terminal tool name as `runInTerminal`.
- Do not add a `run_in_terminal` compatibility alias by default.
- Keep `execution_subagent` as the Director-owned wrapper name.

Only revisit this if there is evidence that one or more supported providers repeatedly call Copilot's `run_in_terminal` spelling despite Director prompt/tool schemas exposing `runInTerminal`.

If an alias is later added, it must include:

- explicit registry mapping from `run_in_terminal` to the same underlying tool id as `runInTerminal`;
- prompt/schema tests proving both names do not appear in contradictory ways;
- telemetry distinguishing canonical usage from alias fallback usage;
- replay placement in the tool registry/policy patch, not branding.

### 2. Terminal Execution Telemetry And Logging

Add lightweight observability around terminal execution paths:

- count direct parent Agent `runInTerminal` calls;
- count `execution_subagent` calls;
- count internal `execution_subagent -> runInTerminal` calls;
- record whether a terminal call completed, timed out, needed input, moved to background, or failed before execution;
- record whether a direct sync `runInTerminal` call omitted timeout or used timeout `0`;
- Count invalid direct sync attempts that are rejected by Director before core terminal execution. Missing, zero, non-numeric, and oversized timeouts should remain observable even though they do not become successful tool invocations.
- record whether a provider attempted unknown terminal-like names such as `run_in_terminal`.

Privacy boundary:

- Do not record full terminal command strings by default.
- Do not record terminal output by default.
- Prefer status/category fields, timeout buckets, tool names, and boolean flags.
- Any debug-only log that includes command/output must be clearly marked as potentially containing project content or secrets and must stay out of normal telemetry.

The goal is not analytics polish. The goal is to answer practical questions:

- Is direct terminal usage now rare?
- Are models still trying parallel direct terminal calls?
- Are timeouts commonly missing or too short?
- Is a compatibility alias actually needed?

### 3. Per-Category Timeout Policy

Convert the Phase 1 timeout decision into an explicit policy table.

Proposed categories:

| Category | Examples | Timeout owner | Phase 2 decision |
| --- | --- | --- | --- |
| Ordinary context/read tools | workspace reads, search-like tools, small registry tools | Director bridge | Keep generic 120s guard unless tool declares otherwise |
| Edit tools | `apply_patch`, create/replace edit tools | Director bridge plus tool logic | Keep generic 120s guard unless a tool has its own bounded lifecycle |
| Pure user-interaction tools | `askQuestions`, `vscode_get_confirmation`, `vscode_get_confirmation_with_options`, `vscode_get_modified_files_confirmation`, `vscode_get_terminal_confirmation` | User interaction / confirmation UI | Exempt from generic bridge timeout; do not broaden this to all pre-approval tools as whole-tool policy |
| Direct terminal execution | `runInTerminal` | bridge guard before user-waiting, user interaction while waiting, then terminal tool `timeout` parameter after execution starts | Do not preempt started sync execution with bridge 120s; require explicit positive timeout and reject values above `120000` ms |
| Execution wrapper | `execution_subagent` | wrapper watchdog plus internal terminal timeout | Assign `tool-owned`; do not let parent bridge 120s preempt long internal terminal execution |
| Terminal lifecycle helpers | `sendToTerminal`, `getTerminalOutput`, `killTerminal` | helper/tool-specific lifecycle | Keep bridge timeout unless review proves bounded lifecycle; prefer short helper-specific timeout if exemption is needed |
| Task tools | `runTask`, `createAndRunTask`, `getTaskOutput` | VS Code task/output monitor lifecycle | Assign `tool-owned` in Phase 1; review detailed lifecycle/status semantics in Phase 2 |
| Extension/MCP tools | contributed extension tools, MCP tools | Director bridge by default | Keep generic 120s unless tool metadata/config declares a better policy |

Phase 2 should document this in code near the bridge timeout policy, not only in this upgrade note.

### 4. Task Tool Lifecycle Review

Task tools do not necessarily need the same metadata shape as `runInTerminal`, but Director should not hide their lifecycle state behind a generic bridge timeout.

Review and test:

- `runTask`;
- `createAndRunTask`;
- `getTaskOutput`.

Questions to settle:

- When a task is still running, what does the Agent receive?
- When task output is incomplete, is that explicit?
- When the task output monitor reaches its own timeout/input-needed state, is that visible to the Agent?
- Does exempting task tools from the bridge 120s create any unbounded wait path?
- Should Director add a small structured wrapper for task lifecycle state, similar in spirit to terminal metadata but not necessarily identical?

Deliverable:

- either a short code comment/test proving current task semantics are sufficient;
- or a follow-up patch preserving task lifecycle state in Director's structured result path.

### 5. Upgrade Carry Strategy

On the next VS Code baseline upgrade:

- check whether upstream changed `_registerInputListener()` from `onData` to `onDidInputData`;
- if upstream fixed it, remove or shrink Director's carried core delta;
- if upstream still uses `onData`, keep the Director patch and keep the regression test;
- re-run the Basic/None shell integration regression tests after replay;
- verify `generate-director-patches.mjs` still classifies terminal-tool runtime/test paths into the intended tool-layer patch.

The regression test should remain valuable even if the source delta disappears, because it protects Director from replay/classifier drift.

### 6. Phase 2 Acceptance Signals

Phase 2 is complete when:

- tool naming is documented and tests enforce Director's canonical `runInTerminal` spelling;
- telemetry/logging can distinguish direct terminal use from `execution_subagent` use;
- missing/zero terminal timeouts are observable;
- timeout policy is explicit per tool category;
- task tools have either verified lifecycle semantics or a structured-result follow-up patch;
- next-upgrade instructions explain whether the core listener patch should be carried or dropped.

## Out Of Scope

- Copying Copilot extension source into Director.
- Treating VS Code core `runSubagent` as a substitute for `execution_subagent`.
- Changing provider/OAuth behavior.
- Migrating old terminal sessions.
- Replacing VS Code task tools.
- Broad terminal UI refactors unrelated to this sync regression.

## Acceptance Criteria

Phase 1 is acceptable when:

- Consecutive sync `runInTerminal` calls no longer send unintended `Ctrl+C` or `Ctrl+U`.
- Basic and None shell integration regression tests both prove the second sync command returns non-empty output.
- `onDidInputData` replaces output-based input tracking, with an origin guard so tool-owned `sendText(...)` events do not count as manual user input.
- Tool-originated input suppression is cleaned up across success, cancellation, timeout, `inputNeeded`, `continueInBackground`, and thrown-error paths.
- `execution_subagent` exists as a Director-owned wrapper.
- `execution_subagent` is registered through `ILanguageModelToolsService` and exposed only in Agent mode.
- Parent Agent guidance prefers `execution_subagent` for most execution tasks, and this guidance is appended only in Agent mode.
- Phase 1 `execution_subagent` UI uses the minimal Copilot-style shape and does not require a new custom UI surface or native `toolSpecificData.kind === "subagent"` parent payload.
- Internal `runInTerminal` tool progress/results are forwarded to the parent chat request as real terminal tool invocation progress with the same `subAgentInvocationId`, so visible nested terminal grouping does not depend on parent `toolMetadata` alone.
- Internal subagent terminal calls use actual Director tool name `runInTerminal`.
- Internal subagent calls are serialized, sync, and timeout-bounded.
- Internal subagent implementation uses a dedicated terminal-only structured loop; it does not use the current string-only `IToolExecutor.invokeTool(...)` path for terminal lifecycle decisions.
- If an internal assistant turn emits multiple `runInTerminal` calls, Director rejects the turn before executing any of those commands.
- Internal subagent tool discovery exposes only `runInTerminal`, and exposes no further tools after timeout/background/input-needed terminal state.
- Concurrent `execution_subagent` calls in one parent `chatRequestId` are rejected clearly.
- Direct sync `runInTerminal` calls without a positive timeout are rejected before core terminal execution on both bridge invocation paths, using core-compatible resolved execution mode.
- Direct sync `runInTerminal` timeout validation rejects non-finite and non-number values without coercion.
- Direct sync `runInTerminal` calls above `120000` ms are rejected before core terminal execution with clear async/task guidance in the error text; Director does not automatically rewrite the tool call into async or task execution.
- Director-exposed `runInTerminal` schema/description and Agent prompt guidance agree that sync calls require `timeout` from `1..120000`, with Copilot-aligned defaults of `30000` for short commands and `120000` for builds/tests.
- `execution_subagent` can retrieve request-scoped parent context by `chatRequestId`, and fails clearly if that context is missing.
- `execution_subagent` reuses the parent provider/model in Phase 1 and uses a fixed small inner turn limit.
- The `execution_subagent` concurrency marker is cleared in all completion paths.
- The request-scoped `execution_subagent` context is cleared in all parent completion paths: success, tool error, model error, cancellation, and watchdog expiry.
- Wrapper watchdog cancellation aborts the internal execution loop and clears context/running markers without sending extra terminal interrupts.
- `execution_subagent` does not bypass normal terminal confirmation / pre-approval for internal terminal calls.
- Terminal `toolMetadata` is preserved through the execution-subagent path.
- Terminal timeout/background/input-needed state is summarized accurately.
- Terminal timeout/background/input-needed summaries include enough terminal id/status context for the parent Agent/user to continue without relying on suppressed subagent terminal notifications.
- Ordinary non-execution tools still keep Director's generic 120s safety guard.
- Pure user-interaction tools use the explicit `user-interaction-owned` timeout category: `askQuestions`, `vscode_get_confirmation`, `vscode_get_confirmation_with_options`, `vscode_get_modified_files_confirmation`, and `vscode_get_terminal_confirmation`.
- The `user-interaction-owned` category is sourced from explicit `DirectorToolRegistryEntry.timeoutCategory` metadata, not inferred from generic confirmation or pre-approval fields.
- Generic pre-approval tools are not automatically exempted from the bridge watchdog for the whole invocation merely because they may request approval before execution.
- Generic pre-approval tools that enter an explicit waiting-for-user state suspend the bridge watchdog only for that waiting interval.
- User-waiting suspension covers pre-confirmation, editable/raw-input confirmation, dialog fallback confirmation, and post-execution approval.
- Started terminal execution is not preempted by the generic bridge timeout before its own lifecycle metadata can return, while non-interactive preparation remains guarded and confirmation/user input is user-owned.
- The timeout boundary is not based on the existing `onDidInvokeTool` event; confirmation denied/skipped and prepare failure paths do not switch to tool-owned timeout.
- Bridge timeout versus stage-signal races are deterministic and clean up timers/listeners in all completion orders.
- Bridge timeout cancellation cancels the underlying tool invocation through a token linked to the parent request rather than only rejecting the bridge promise, and the cancellation handle is disposed in all completion paths.
- Direct sync `runInTerminal` has a post-start infrastructure failsafe of requested timeout plus grace that reports infra timeout separately and does not send extra terminal interrupts.
- `execution_subagent` wrapper infrastructure timeout is distinct from terminal command timeout.
- Terminal lifecycle helpers keep the existing bridge timeout unless reviewed and tested separately.
- Task tools are assigned the explicit `tool-owned` timeout category in Phase 1 so their own VS Code task lifecycle is not preempted by the bridge's generic 120s timeout.
- Replay patch output is inspected and terminal runtime/test changes land in `007-director-tool-layer.120-insider.patch`.
- All runtime changes are replay-backed and validation is clean for the active 120 profile.

Phase 2 is acceptable when:

- Tool naming is documented and tests enforce Director's canonical `runInTerminal` spelling.
- Telemetry/logging can distinguish direct parent terminal calls, `execution_subagent` calls, and internal subagent terminal calls.
- Missing or zero terminal timeouts are observable.
- Full command/output logging is either absent from normal telemetry or explicitly debug-only with clear warnings.
- Timeout policy is documented per tool category.
- Task tools have either verified lifecycle semantics or a structured-result follow-up patch.
- Upgrade notes clearly say whether the core listener delta should still be carried.
