# Phase 2 Wave 3 Claude AgentHost SDK Integration Research

Date: 2026-05-16
Status: research complete, implementation not started
Workspace branch: `refactor/112-replay-baseline`

## Scope From The Wave Plan

Wave 3 is the dedicated Claude Code integration wave. The plan calls for a TypeScript `@anthropic-ai/claude-agent-sdk` integration through VS Code AgentHost / Agent Sessions into Director native Chat, with prompt streaming, cancel/interrupt, permission callback, Claude `permissionMode: "plan"`, basic session resume, Claude tool/edit progress mapping, VS Code-style external edit/checkpoint/revert presentation, and Claude Plan / `ExitPlanMode` mapped into Director Plan approval.

The plan also sets clear boundaries:

- Claude Code should not be forced through ACP.
- Claude Code should not be placed in the LLM Provider Registry.
- Python Claude SDK is behavior reference only.
- The TypeScript SDK must be isolated behind a narrow Director-owned adapter because the SDK API is moving quickly.

## Local References Inspected

- `E:/Projects/sub-projects/claude-agent-sdk-typescript`
  - Local branch `main`, local HEAD/tag `v0.3.142`.
  - This checkout contains README, examples, scripts, and changelog rather than full `src/` implementation.
  - Changelog is the strongest local evidence for current TypeScript SDK API shape.

- `E:/Projects/sub-projects/claude-agent-sdk-python`
  - Local branch `main`, local HEAD/tag `v0.2.82`.
  - Useful for behavior parity around `query()`, session store, resume, and cancellation, but not a runtime dependency for Director.

- `E:/Projects/sub-projects/vscode`
  - Local VS Code main branch HEAD `d7c94368f4d`.
  - Contains a full platform AgentHost Claude implementation under `src/vs/platform/agentHost/node/claude/**`.
  - Root `package.json` pins `@anthropic-ai/claude-agent-sdk` `0.2.128`; `extensions/copilot/package.json` pins `0.2.112`.

- `E:/Projects/sub-projects/vscode-copilot-chat`
  - Contains extension-side Claude Code session implementation patterns, especially proxy/auth/session lifecycle.
  - Useful as historical/extension reference, but not the right ownership shape for Director 116.

- `E:/Projects/sub-projects/Claudable`
  - Uses `@anthropic-ai/claude-agent-sdk` `^0.2.68`.
  - Confirms the simple app-builder path: SDK `query()`, local Claude Code CLI auth, `resume`, model setting, streaming event handling.
  - It uses `permissionMode: 'bypassPermissions'`, which is explicitly not acceptable for Director v1 because Director must preserve review/permission boundaries.

- NPM package tarballs inspected locally:
  - `@anthropic-ai/claude-agent-sdk@0.3.142`
  - `@anthropic-ai/claude-agent-sdk@0.2.128`
  - `@anthropic-ai/claude-agent-sdk-win32-x64@0.3.142`
  - These tarballs provide the concrete SDK launch behavior that is not present in the local TypeScript SDK source checkout.

- Current Director 116 generated tree:
  - `vscode.generated/layers/director/vscode/src/vs/workbench/contrib/directorCode/**`
  - `vscode.generated/layers/director/vscode/src/vs/workbench/contrib/chat/browser/agentSessions/**`
  - There is no `src/vs/platform/agentHost/node/claude/**` implementation in the generated Director 116 tree.
  - There is no direct `@anthropic-ai/claude-agent-sdk` package dependency in the generated Director 116 package.

## Key Findings

### 1. TypeScript SDK API Is Already Past Older Session APIs

The local TypeScript SDK changelog says `v0.3.142` removes the older v2 session API and directs users to `query()`, with an `AsyncIterable<SDKUserMessage>` for multi-turn sessions and `options.resume` for continuation.

That matters for Wave 3 because any new Director adapter should be designed around:

- `query()`
- `startup()` / `WarmQuery` if we want pre-warm behavior
- `options.resume`
- `sessionStore` only if we need host-side transcript mirroring
- `canUseTool`
- `permissionMode`
- `AbortController`
- stream event mapping

Do not build new Director code around removed `unstable_v2_*` APIs or older `SDKSession` shapes.

### 2. "Local Claude Code Installed" Means A Runnable Claude Binary, Not Necessarily A Global CLI

The SDK package launch path is important because it changes the install requirement.

For `@anthropic-ai/claude-agent-sdk@0.3.142`, `sdk.mjs` resolves the Claude Code executable in this order:

1. Use `options.pathToClaudeCodeExecutable` if provided.
2. Otherwise resolve the platform optional dependency, for example `@anthropic-ai/claude-agent-sdk-win32-x64/claude.exe`.
3. Otherwise fall back to a package-local JS CLI path if present.
4. Otherwise fail with an error telling the user to reinstall the SDK with optional dependencies or provide `pathToClaudeCodeExecutable`.

The `@anthropic-ai/claude-agent-sdk-win32-x64@0.3.142` tarball contains a native `claude.exe` around 228 MB unpacked, with a tarball around 72 MB. The older `@anthropic-ai/claude-agent-sdk@0.2.128` used by VS Code main has the same optional native package shape.

So the precise requirement is:

- A global `claude` command is not strictly required when the SDK optional platform dependency is installed correctly.
- A runnable Claude Code binary is required, either from the SDK optional dependency or from an explicit `pathToClaudeCodeExecutable`.
- If a product requires the user to point at a local SDK package, as VS Code main currently does, then that local SDK package must include its platform optional dependency unless a separate binary path is supplied.
- Authentication is a separate concern from binary discovery: the SDK can use local Claude Code auth/env, or a host product can provide an Anthropic-compatible proxy through `ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN`.

The SDK starts the process with stream JSON arguments:

- `--output-format stream-json`
- `--verbose`
- `--input-format stream-json`
- `--permission-prompt-tool stdio` when `canUseTool` is supplied

It also supports `--resume`, `--session-id`, `--permission-mode`, `--allowedTools`, `--disallowedTools`, `--tools`, `--mcp-config`, `--setting-sources`, `--include-hook-events`, `--include-partial-messages`, `--add-dir`, and plugin directories. It sets `CLAUDE_CODE_ENTRYPOINT=sdk-ts`, `CLAUDE_AGENT_SDK_VERSION`, and deletes `NODE_OPTIONS` before spawn.

Director implication: if we bundle the SDK, package size and optional native dependency handling become release concerns. If we do not bundle it, we need VS Code-style diagnostics for missing SDK path, missing optional native binary, and missing explicit executable path.

### 3. VS Code Main Is The Primary Implementation Reference

VS Code main's Claude implementation is the closest target shape for Wave 3. The intent is to replicate the Claude-specific architecture, runtime behavior, and switching UI as the default implementation shape, while replacing Microsoft/Copilot provider, auth, proxy, entitlement, and model-routing boundaries with Director-owned provider/auth policy.

The main reference modules are:

- `claudeAgent.ts`
- `claudeAgentSession.ts`
- `claudeAgentSdkService.ts`
- `claudeMaterializer.ts`
- `claudeSdkPipeline.ts`
- `claudeSdkMessageRouter.ts`
- `claudeMapSessionEvents.ts`
- `claudeCanUseTool.ts`
- `claudeFileEditObserver.ts`
- `claudeProxyService.ts`

The pieces to copy/adapt conceptually are:

- Lazy SDK loading through a small service.
- One SDK query pipeline per live session.
- Async prompt queue / iterable for multi-turn interaction.
- `AbortController` as the primary cancellation primitive.
- A narrow message router that converts SDK stream events to workbench progress.
- `canUseTool` as the central UI/permission bridge.
- `ExitPlanMode` handled as a special interactive tool.
- File edit observation treated separately from generic tool call progress.
- Claude-native permission/tool semantics as the first reference point.

The parts that should remain Director-owned or replaced are:

- GitHub Copilot CAPI proxy and entitlement flow.
- Copilot auth/bearer nonce machinery.
- Microsoft account/default-account assumptions.
- VS Code main's exact provider registration/auth source if it conflicts with Director Provider architecture.

The working implementation stance is: replicate VS Code's Claude agent/session/pipeline/permission/tool behavior and UI mental model as much as practical, but keep the Provider, authentication source, proxy, packaging decision, and workbench entry ownership in Director.

The replication boundary is:

- Replicate or closely adapt: Claude session lifecycle, session entry, session-kind immutability, status/config display, Approvals / permission mode switching, Plan Only entry, SDK loading, SDK materializer/options, prompt queue, streaming/thinking/tool-call display, cancellation, resume, `canUseTool`, interactive tools, `ExitPlanMode`, file edit observer, and external edit/review presentation.
- Replace: Copilot CAPI, GitHub/Microsoft auth, Copilot entitlement/subscription gates, Copilot model routing, Copilot proxy auth nonce implementation, and product-specific upgrade/sign-in UI.
- Keep Director-owned: Provider Registry, secrets/OAuth, selected provider/model, Anthropic-compatible local proxy, diagnostics, and the thin entry wiring from VS Code surfaces into Director-owned code.

Additional VS Code main details:

- `chat.agentHost.enabled` gates AgentHost in non-stable builds.
- `chat.agentHost.claudeAgent.path` points to an absolute local `@anthropic-ai/claude-agent-sdk` package path.
- `VSCODE_AGENT_HOST_CLAUDE_SDK_PATH` carries that SDK path into the agent host process.
- The comment says this is experimental and local-testing-only because the SDK is intended to be delivered through extension packaging later.
- `agentHostMain.ts` registers `ClaudeAgent` only when the SDK path env var exists.
- `claudeAgentSdkService.ts` dynamically imports the SDK from that package path.
- `claudeMaterializer.ts` builds SDK options with `startup()`, `allowDangerouslySkipPermissions: true`, `canUseTool`, `disallowedTools: ['WebSearch']`, `includePartialMessages: true`, `enableFileCheckpointing: true`, `settingSources: ['user', 'project', 'local']`, and `systemPrompt: { type: 'preset', preset: 'claude_code' }`.
- VS Code strips inherited `ANTHROPIC_API_KEY`, most `VSCODE_*`, most `ELECTRON_*`, and `NODE_OPTIONS`, then explicitly sets the Claude proxy env and ripgrep path.
- VS Code's Claude provider/auth path is GitHub Copilot protected resource plus a local proxy service. Director should copy the mechanism shape only, not the product identity.

### 4. Copilot Extension Confirms The Proxy, Queue, Permission, And Edit-Tracking Pattern

The Copilot extension implementation is the strongest reference for extension-shaped Claude behavior.

Important pieces:

- `claudeCodeSdkService.ts` imports `@anthropic-ai/claude-agent-sdk` directly because the extension owns that dependency.
- `ClaudeCodeSession` owns one `Query`, one request queue, one `AbortController`, current model/effort/permission mode, settings change tracking, and restart-on-resume behavior.
- `ClaudeLanguageModelServer` exposes a local Anthropic-compatible `/v1/messages` server and proxies requests through Copilot model routing.
- SDK options set `ANTHROPIC_BASE_URL` to that local server and `ANTHROPIC_AUTH_TOKEN` to a nonce/session id.
- `ExternalEditTracker` uses VS Code's `stream.externalEdit(...)` to represent edits made by the external agent.
- Permission handlers cover bash confirmation, user questions, edit auto-approval in `acceptEdits`/`bypassPermissions`, and `ExitPlanMode` review.
- `ExitPlanMode` can approve, approve-and-auto-edit, approve-and-bypass, or reject with feedback; the result can include SDK `updatedPermissions` such as `setMode`.
- Plan files are tracked from `~/.claude/plans/*.md` by session id.

Director implication: the Director version should replicate the proxy pattern with Director Provider Registry credentials instead of Copilot credentials, and replicate the permission/edit/plan flow with Director UI surfaces instead of the Copilot extension's exact services.

### 5. Director 116 Already Has AgentHost, But Not The Claude Provider

The generated Director 116 tree already has the right upstream landing zone for a Claude Code-style external agent:

- `src/vs/platform/agentHost/**`
- `src/vs/workbench/contrib/chat/browser/agentSessions/**`
- `AgentHostContribution` registration in Chat contribution
- AgentHost session state/protocol/progress/editing infrastructure
- `src/vs/platform/agentHost/node/copilot/**`

The missing piece is specifically the VS Code main Claude backend:

- no `src/vs/platform/agentHost/node/claude/**`
- no Claude SDK dependency or loader
- no Claude provider registration in `agentHostMain.ts`
- no Director-owned Claude proxy service

This means Wave 3 should not build a parallel AgentHost inside `directorCode/**`. The better target is to reuse the 116 AgentHost / Agent Sessions / protocol / UI surfaces directly and backport/adapt VS Code main's Claude provider/backend into that existing framework.

The compile spike before implementation should answer one question: can VS Code main's Claude provider modules be backported into 116 with a bounded set of type/service shims? If yes, backport. If the Claude provider depends on a large 121-only AgentHost protocol delta, then an upstream upgrade can become the prerequisite instead of force-fitting a large shim.

Director-owned logic still stays owned by Director:

- Provider Registry
- secrets/OAuth
- selected provider/model
- Claude local proxy
- product diagnostics

But the runtime shell should be upstream AgentHost where practical, not a new Director-only chat harness.

### 6. CodePilot Supports Runtime Re-resolution, But Director Should Not Copy It For Wave 3

The local CodePilot reference allows a looser model than VS Code: its `chat_sessions` table stores `model`, `provider_id`, and `sdk_session_id`, and the chat route re-resolves runtime/provider/model for each request. When provider/model changes, CodePilot clears `sdk_session_id` so the next Claude Code SDK turn starts fresh, then uses DB transcript fallback context to preserve apparent continuity. That makes a single UI conversation able to move between its native AI SDK loop and Claude Code SDK, but it is not a single immutable external-agent session.

Director Wave 3 should intentionally follow VS Code instead: Agent kind is a creation-time property of the AgentHost session. The UI should lock or hide agent-engine switching after the session is created. Users who want to move between Director Agent and Claude Agent should start a new session, or later use an explicit handoff/fork flow that makes the context boundary visible.

### 7. Provider/Auth Should Be Director-Owned

There are two viable auth/provider launch modes:

1. Direct local Claude Code auth/env.
   - This is the simplest app-builder path and is what Claudable assumes.
   - It depends on the user's local Claude Code auth/profile or env.
   - It is useful as a debug/fallback path and for early smoke tests.

2. Director-owned Anthropic-compatible proxy.
   - This mirrors VS Code main and Copilot extension architecture.
   - The SDK talks to `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN`.
   - Director's proxy routes the request through Director Provider Registry, selected provider instance, selected model, secrets/OAuth, and policy.
   - This avoids importing Copilot CAPI, entitlement, Microsoft account, or GitHub account assumptions.

Recommendation: use option 2 as the product-aligned target because the user-facing Provider/Auth layer must be Director-owned. Keep option 1 as a debug/escape hatch if it is cheap, clearly labeled, and covered by diagnostics.

This still does not mean Claude Code belongs inside the LLM Provider Registry as a provider. Claude Code remains an External Agent. The Provider Registry supplies model/auth/proxy backing for that external agent when Director chooses to run it through a Director-owned proxy.

Provider support should be staged by protocol compatibility while keeping the local proxy shape in v1:

- Wave 3 v1: ship the Director-owned Anthropic-compatible proxy facade and backend adapter interface, but register only an `AnthropicPassthroughBackend` for Anthropic official API key/OAuth and Anthropic-compatible providers that already speak Claude Messages API semantics.
- Later: OpenAI / OpenAI-compatible providers through an Anthropic Messages to OpenAI Chat Completions translation backend.
- Later: ChatGPT/Codex `/responses` providers through a separate Anthropic Messages to Responses translation backend if the future Codex/Claude product path needs it.

OpenAI-compatible translation is not impossible, but it is not a small switch. It needs message/content-block conversion, tool-call/tool-result mapping, streaming event conversion, thinking/reasoning downgrade or mapping, error/cancel/rate-limit translation, and capability gating so unsuitable models do not run the Claude Code harness.

This creates a hard Wave 2 prerequisite for Wave 3: Director Provider Registry must expose an `anthropicMessages`-capable provider/model selection path before Claude proxy implementation starts. The minimum contract is provider instance id, selected model id, API key/OAuth secret lookup, request/stream/error/cancel semantics, and redaction-safe diagnostics. The Claude Agent provider picker must hide non-`anthropicMessages` providers in v1 even if the proxy backend interface already has placeholders for future translators.

Proxy compatibility should be verified against the SDK's actual requests. V1 must cover at least `/v1/messages` plus compatible `/messages`, SSE/streaming, `tool_use` / `tool_result`, thinking passthrough or downgrade, abort/cancel propagation, Anthropic error response shape, and secret/token redaction in all logs.

### 8. Permission And Tool Behavior Should Follow VS Code First

The Wave 3 implementation should not force Claude Code into Director's existing LLM tool registry. Claude Code is an External Agent, so its tools and permissions can follow the VS Code Claude reference path instead of Director Ask/Edit/Agent tool mode policy.

This changes the initial implementation bias:

- Prefer VS Code main's `canUseTool` flow and tool confirmation model.
- Treat Claude built-in tools (`Read`, `Glob`, `Grep`, `Bash`, `Edit`, `Write`, `AskUserQuestion`, `ExitPlanMode`, etc.) as Claude session tools, not Director model-callable tools.
- Map Claude permission prompts into Director/Chat UI, but do not require a one-to-one match with Director-owned `directorToolRegistry` policies.
- Use VS Code's file edit observer / completed tool call mapping as the first reference for edit display and review behavior.
- Keep Director Provider/Auth/packaging boundaries independent from VS Code's Copilot proxy.

The remaining safety requirement is product-level, not registry-level: the user must be able to see and control sensitive actions. Wave 3 can satisfy that by adapting VS Code's Claude permission and file-edit UX rather than by forcing every Claude action through existing Director edit tools.

If implementation discovers that Claude SDK applies edits before a review surface can be shown, use the VS Code-style checkpoint/file-edit observer path and document the exact accept/revert semantics in tests.

## Recommended Director V1 Architecture

Reuse the upstream AgentHost framework already present in Director 116, and add a Claude provider/backend shaped after VS Code main.

This is a deliberate exception to the default "new behavior under `directorCode/**`" rule. The Claude runtime shell belongs in AgentHost so Director can reuse upstream session state, progress, editing, and approvals infrastructure. The exception is limited to a Director-owned AgentHost adapter island; provider registry, secret/OAuth policy, model routing, proxy behavior, and diagnostics remain Director-owned.

Suggested placement:

- `src/vs/platform/agentHost/node/claude/**`
  - Backport/adapt VS Code main's Claude provider modules.
  - Own Claude SDK loading, materializer/options, session pipeline, message routing, permission bridge, Plan bridge, and file edit observer.

- `src/vs/platform/agentHost/common/**`
  - Add only the Claude-specific config keys and schema metadata needed by Agent Sessions.

- `src/vs/workbench/contrib/chat/browser/agentSessions/**`
  - Reuse existing session UI/protocol surfaces.
  - Add only thin entry/config wiring where 116 is missing a Claude provider path.

- Director-owned provider/proxy surface
  - Add a `DirectorClaudeProxyServer` or equivalent Director-owned service that speaks Anthropic-compatible `/v1/messages` and compatible `/messages` to the SDK and routes internally through Director Provider Registry.
  - Make the SDK's product path go through this local proxy in v1; direct local Claude auth/env remains only a debug/fallback escape hatch if retained.
  - Add a narrow proxy backend interface, but register only the Anthropic/Anthropic-compatible passthrough backend at runtime for v1.
  - Keep Copilot CAPI, entitlement, GitHub/Microsoft auth, and Copilot model routing out of Director.

The adapter should preserve VS Code's internal separation where practical:

- SDK loading service.
- Session materializer/config builder.
- Prompt queue/pipeline.
- SDK message router.
- Session event mapper.
- Permission bridge.
- File edit observer.
- Local Anthropic-compatible proxy.

## Proposed Runtime Flow

1. User starts a Director Claude session from a Director-owned entry point.
2. AgentHost creates or resumes a Claude AgentHost session.
3. The session is marked as Claude Agent kind for its lifetime; Director Agent / ACP / Codex engine switches are disabled for that session, while Claude-local permission mode and allowed provider/model settings remain mutable where VS Code permits them.
4. The Claude provider loads the TypeScript SDK through a narrow SDK service.
5. The session starts `query()` or `startup().query()` with:
   - `cwd` set to the workspace root,
   - `ANTHROPIC_BASE_URL` / proxy auth pointing at the Director-owned Anthropic-compatible local proxy backed by Director Provider Registry,
   - Claude/VS Code-style `permissionMode`,
   - `canUseTool` callback,
   - `AbortController`,
   - stderr logging into a Director/Chat output channel.
6. SDK stream messages are mapped into AgentHost session actions and Director Chat progress through the existing AgentHost adapter path.
7. `ExitPlanMode` is intercepted and routed into a Director-branded Plan review surface.
8. On approve, Claude continues in the same SDK session and the permission mode is updated according to the selected action.
9. Tool permission and edit events follow the VS Code Claude reference flow, adapted to Director UI surfaces.
10. Session id is recorded for basic resume using `options.resume`.

## Plan Mode Mapping

Claude `permissionMode: "plan"` should be driven by the Claude AgentHost session config/input state, matching VS Code/Copilot. Director Plan state is not the source of truth for Claude sessions; Director Plan services are reused only for review/file policy where useful.

`ExitPlanMode` should follow VS Code/Copilot semantics: approval lets the same Claude SDK session continue. Depending on the selected action, the host either keeps the current permission mode or updates the session permission mode to `acceptEdits` / `bypassPermissions`.

Director can reuse the visual shape and file-writing policy of Director Plan review, but the execution target is no longer open: a Claude-owned Plan approve continues in the Claude session. If a future product wants "approve plan only and hand off to Director Agent", that should be a separate explicit action, not the default approve behavior.

Wave 3 should implement a `DirectorClaudePlanBridge` that extracts the Claude plan body from `ExitPlanMode` input, validates it with the same metadata restrictions as `director_present_plan` where applicable, links the Claude/VS Code plan file for review, and returns a Claude SDK `PermissionResult` compatible with VS Code/Copilot behavior. The review UI must only open or display host-validated plan URIs, not arbitrary paths supplied by tool input. If Director mirrors the plan into `.director/plans/*.md`, that mirror is an audit/review artifact only; the Claude session's execution truth remains the Claude plan file/session state.

## Permission And Tool Mapping

Use VS Code main's Claude permission design as the baseline.

Initial mapping direction:

- `canUseTool` is the host/user interaction bridge, matching VS Code's shape.
- SDK `permissionMode` owns auto allow/deny behavior where applicable.
- `AskUserQuestion` should map to a Director Chat question surface, following VS Code's interactive tool path.
- `ExitPlanMode` should map to Director Plan review, following VS Code's special-case interactive tool handling.
- `Bash`, `Edit`, `Write`, and other mutating tools should be permission-gated through the Claude session permission surface, not forced through Director's LLM tool policy.
- File edit display/review should start from VS Code's `claudeFileEditObserver`, `externalEdit`, checkpoint, and completed-tool-call mapping. Do not force Claude edits into Director's normal `textEdit` pre-review contract.
- Tools/plugins/hooks/subagents can remain staged, but the reason should be implementation size, not a requirement to align with Director tool registry.

## Dependency Decision

Local evidence shows version spread:

- Claudable: `^0.2.68`
- VS Code extension-side reference: `0.2.112`
- VS Code main root: `0.2.128`
- Local TypeScript SDK reference: `v0.3.142`

Recommendation:

1. Do not use a loose semver range.
2. Pin an exact SDK version.
3. Prototype against the newest local API shape (`query()`, `startup()`, no v2 session API).
4. Add adapter tests with mock SDK bindings so future SDK upgrades touch one adapter layer.

Packaging choice still needs a decision:

- Product path: Director should carry a pinned SDK loader/dependency so ordinary users do not have to configure an SDK package path.
- Runtime binary path: auto-discover an installed Claude Code executable, or use a bundled/platform SDK binary if Director later chooses to ship one.
- Escape hatch: expose `pathToClaudeCodeExecutable` for advanced/manual installs.
- Developer fallback: allow a VS Code-main-style SDK package path for local testing only.

The install detail matters:

- Bundling the SDK normally also means including the platform optional native binary package, unless packaging deliberately externalizes it.
- On Windows x64, the inspected `@anthropic-ai/claude-agent-sdk-win32-x64@0.3.142` binary is around 228 MB unpacked and around 72 MB as a tarball.
- Requiring a user SDK path follows VS Code main's current dev implementation, but it is not the right normal product UX for Director.
- Requiring only a global `claude` command is less reproducible than a pinned SDK loader, but it matches the user expectation that installing Claude Code makes the integration available. Support it through auto-discovery plus `pathToClaudeCodeExecutable`.

Recommendation: do not make SDK package path a normal user setting. Use a pinned SDK loader/dependency in Director, auto-discover the installed Claude Code executable, expose `pathToClaudeCodeExecutable` as the user-facing override, and keep SDK package path as a developer/debug fallback only. Revisit bundling the native binary after package-size/license/update smoke.

Executable discovery order should be deterministic:

1. Explicit `pathToClaudeCodeExecutable` setting or environment override.
2. Director-bundled or pinned SDK optional platform binary, if available.
3. `claude` found on the user's PATH.
4. Known Claude Code install locations recorded by the compile/package spike.
5. Clear diagnostic with no silent fallback.

PATH lookup must be validated against the user shell environment available to VS Code/Electron, not only the process launch environment. Every hit should be probed for executability and version/health before the session starts.

## Replay Patch Ownership

- `004-director-agent-engine.116.patch`: Claude AgentHost provider/backend, SDK service, session pipeline, message mapper, permission bridge, file edit observer, Plan bridge, and Director-owned Claude local proxy runtime.
- `005-director-chat-built-in-mode.116.patch`: Agent Sessions / Chat UI entry points, Claude session config / Approvals / Plan Only UI wiring, and Director-branded review surface hooks.
- `003-director-product-build-release.116.patch`: SDK/package dependency, optional native binary packaging, product/package/server manifest, and installer wiring if touched.
- Wave 2 Provider Registry patch/report: `anthropicMessages` provider capability, secret/OAuth/model-selection contract, and provider diagnostics.
- `scripts/upgrade/generate-director-patches.mjs`: classify new `src/vs/platform/agentHost/node/claude/**` files and required common/schema shims into the intended replay stage so regenerated patches stay stable.
- If compile spike proves a new patch stage is unavoidable, update `patches/series.116.json`, the active profile, and patch-generation classification in the same wave.

## Implementation Slices

1. Compile spike: backport/adapt VS Code main `platform/agentHost/node/claude/**` into 116 and measure missing 121 AgentHost/API surface.
2. Add Claude provider registration and Agent Sessions entry using existing 116 AgentHost framework.
3. Add pinned SDK loader plus diagnostics for missing SDK, missing executable, invalid `pathToClaudeCodeExecutable`, and GUI/user-shell PATH mismatch.
4. Add Director-owned Anthropic-compatible proxy facade, backend adapter interface, and v1 `AnthropicPassthroughBackend` backed by Provider Registry credentials.
5. Filter the Claude Agent provider/model picker to `anthropicMessages` capable provider instances only; keep OpenAI-compatible, OpenAI Chat Completions, ChatGPT/Codex `/responses`, and Gemini hidden until translator backends are implemented and registered.
6. Lock Agent kind after session creation in UI and session state: Claude Agent sessions cannot switch to Director Agent/ACP/Codex in-place, and Director Agent sessions cannot switch to Claude in-place.
7. Add single-turn prompt streaming with text/thinking/result mapping through AgentHost session actions.
8. Add cancellation via `AbortController`.
9. Add basic session resume using SDK session id and `options.resume`.
10. Add `canUseTool` bridge modeled on VS Code Claude permissions.
11. Add `ExitPlanMode` to Director Plan review mapping, with approve continuing the same Claude session.
12. Add file-edit observer/external-edit/checkpoint integration based on VS Code's Claude implementation.
13. Add packaged smoke for SDK binary discovery, Director proxy auth, cancellation, Plan review, and mutation permission handling.

## Validation Plan

Minimum implementation validation:

- Director unit tests for SDK loader failure/success.
- Compile spike report deciding backport-vs-upstream-upgrade.
- Message mapper tests for text, thinking, tool start/delta/result, and final usage/result.
- Session-kind tests proving a Claude session cannot switch to Director Agent in-place and a Director Agent session cannot switch to Claude Agent in-place; UI should offer new-session or future handoff/fork instead.
- Permission bridge tests for allow/read, deny/mutation, abort while waiting, and `ExitPlanMode`.
- Plan bridge tests proving approve continues the same Claude session and updates permission mode as expected.
- Edit bridge tests proving file writes are represented through explicit VS Code-style external edit/checkpoint/revert semantics.
- Proxy tests for Anthropic/Anthropic-compatible passthrough success, auth failure, model missing, rate limit, cancellation, redaction, and non-`anthropicMessages` provider hiding.
- `compile-check-ts-native`.
- `transpile-client`.
- Director browser tests affected by Chat progress / Plan UI.
- Replay validators:
  - `validate-series`
  - `validate-product-overrides`
  - `expected-contracts`

Release-candidate validation:

- clean materialize from replay,
- packaged Windows build,
- manual smoke with installed Claude Code auto-discovery,
- manual smoke with `pathToClaudeCodeExecutable` override,
- proxy-backed smoke through Director Provider Registry credentials,
- optional local Claude Code auth smoke if kept as a debug/fallback path,
- cancellation smoke,
- Plan approve/reject/revise smoke,
- mutation denial/review smoke.

## Open Decisions Before Code

1. Exact SDK version to pin.
2. Whether Director bundles the native Claude binary in release builds or relies on installed Claude Code auto-discovery.
3. Which VS Code Claude permission/tool slices are copied in v1 versus staged.
4. Whether local Claude Code auth is kept as debug/fallback once the Director-owned proxy path exists.
5. Whether OpenAI-compatible and ChatGPT/Codex `/responses` translator backends become Wave 3.x or wait for a later provider wave; they are explicitly outside Wave 3 v1 runtime registration.

UI entry is no longer an open architecture question for v1: default to the VS Code Agent Sessions / `claude-code` vocabulary and behavior, with any Director-branded action acting only as a thin launcher for the same AgentHost Claude session.

## Recommendation

Proceed with a Claude SDK integration through the existing AgentHost / Agent Sessions framework, not ACP and not a Claude entry inside the LLM Provider Registry. Backport/adapt VS Code main's Claude provider/backend where 116 supports it, and use VS Code/Copilot as the behavioral reference for session lifecycle, immutable agent session kind, SDK pipeline, message routing, permissions, tools, Plan handling, and file edit observation. Replace the Copilot provider/auth/proxy layer with a Director-owned Provider Registry backed Anthropic-compatible proxy. Wave 3 v1 should already ship the proxy facade and backend interface, but should register only the Anthropic/Anthropic-compatible passthrough backend; local Claude Code auth/env stays only as a debug or fallback path if needed.
