# 120 Agents Window Wave 3 Open Decisions Research

Date: 2026-05-20

Status: research note. This records read-only subagent findings for two previously open decisions in the Wave 3 execution plan.

## Summary

Two open decisions were reviewed:

1. Whether replay ownership should broad-prefix `src/vs/sessions/**` or `src/vs/platform/agentHost/**`.
2. Whether custom auth headers require immediate SecretStorage migration for Claude AgentHost v1.

Conclusion:

- Do not broad-own the upstream sessions or AgentHost trees.
- Use exact allowlists for existing upstream files.
- Use narrow prefixes only for bounded Director adapter islands.
- Custom headers are a pre-existing Director Provider Registry capability and risk, not a new Claude Agent problem.
- Claude AgentHost v1 should reuse VS Code's local proxy shape. The AgentHost/SDK gets only the local proxy URL plus opaque session bearer/nonce; Director-owned proxy code resolves provider URL, key, headers, and model inside the Director boundary.
- Full Provider Registry hardening for sensitive custom headers should be tracked separately. It should not block the Claude bridge as long as raw headers/secrets do not cross into AgentHost.

## Path Ownership

Recommended classification strategy:

- Keep existing replay stages:
  - `004-director-agent-engine.120-insider.patch`
  - `005-director-chat-built-in-mode.120-insider.patch`
- Do not add a new Wave 3 patch stage.
- Do not broad-prefix `src/vs/sessions/**`.
- Do not broad-prefix `src/vs/platform/agentHost/**`.
- Add exact allowlists for upstream files that are actually touched.
- Add narrow prefixes only for Director-owned adapter islands:
  - `src/vs/platform/agentHost/node/claude/**` into `004`
  - possible `src/vs/platform/agentHost/node/director/**` into `004`
  - possible `src/vs/sessions/contrib/directorSessions/**` into `005`

Reason:

- `src/vs/sessions/**` mixes account UI, setup flow, Copilot provider, AgentHost provider, remote/tunnel provider, session services, customization, and tests.
- `src/vs/platform/agentHost/**` mixes common protocol, runtime, Electron starter, Claude adapter, shared CAPI code, mock/test code, and unrelated AgentHost machinery.
- The minimum implementation is a bridge/adaptation project. It does not justify making either whole subtree Director-owned.

Likely exact `005` paths:

- `src/vs/sessions/contrib/copilotChatSessions/browser/copilotChatSessionsProvider.ts`
- `src/vs/sessions/contrib/accountMenu/browser/account.contribution.ts`
- `src/vs/sessions/browser/sessionsSetUpService.ts`
- `src/vs/sessions/contrib/agentHost/browser/baseAgentHostSessionsProvider.ts`
- `src/vs/sessions/contrib/agentHost/browser/localAgentHostSessionsProvider.ts`
- `src/vs/sessions/contrib/agentHost/browser/localAgentHost.contribution.ts`
- selected `src/vs/sessions/services/sessions/**` files only if the Director session facade needs them

Likely exact `004` paths:

- `src/vs/platform/agentHost/node/agentHostMain.ts`
- `src/vs/platform/agentHost/node/agentHostServerMain.ts`
- `src/vs/platform/agentHost/node/agentService.ts`
- `src/vs/platform/agentHost/node/agentSideEffects.ts`
- `src/vs/platform/agentHost/common/agentService.ts`
- `src/vs/platform/agentHost/electron-main/electronAgentHostStarter.ts`
- `src/vs/platform/agentHost/node/shared/copilotApiService.ts` only if it remains touched; prefer replacing usage rather than expanding it

## Claude Proxy Shape

VS Code's Claude AgentHost path is:

```text
Claude SDK / Claude Code
  -> local Anthropic-compatible proxy on 127.0.0.1
  -> upstream backend
```

In upstream VS Code 120, the upstream backend is Copilot/CAPI:

- Claude SDK receives `ANTHROPIC_BASE_URL` pointed at the local proxy.
- Claude SDK receives `ANTHROPIC_AUTH_TOKEN` as an opaque nonce/session token for the local proxy.
- Proxy inbound looks like Anthropic Messages API.
- Proxy outbound currently calls `ICopilotApiService.models()` and `ICopilotApiService.messages()`.
- `ICopilotApiService` uses GitHub/Copilot tokens and CAPI.

Director should keep the local proxy shape and replace only the backend side:

```text
Claude SDK / Claude Code
  -> Director local proxy
  -> Director Provider Registry selected Anthropic/Anthropic-compatible provider
```

Minimum implementation:

- Restore/land production Claude AgentHost registration.
- Reuse `ClaudeAgent`, `ClaudeAgentSdkService`, session lifecycle, event rendering, and permission UI where possible.
- Replace `ICopilotApiService` usage with Director-owned Anthropic Messages transport/proxy.
- Keep SDK path behavior aligned with VS Code: user-installed/configured Claude Code SDK path enables the option.
- Register session-bound provider snapshots in the proxy, keyed by session id/provider/model.
- Keep SDK-visible model id separate from Director routing id.

## Custom Headers

Custom headers are not introduced by Claude AgentHost.

Current Director Provider Registry already has:

- `headers` on provider instances.
- Provider Settings UI for custom headers.
- Runtime paths that pass `providerInstance.headers` to normal Director chat/model providers.
- Provider implementations that merge extra headers into request headers.

Risk:

- Current headers are stored in `directorCodeProviders.json`, not SecretStorage.
- Current normalization trims headers but does not classify or reject sensitive names.
- Current merge order can let custom headers override built-in auth/version headers.

Wave 3 v1 decision:

- Do not block Claude AgentHost on full Provider Registry custom-header migration.
- Do not pass raw custom headers into AgentHost.
- Do not place headers in root state, model `_meta`, session config, session index, JSONL logs, output channels, or reports.
- Let the Director-owned proxy resolve provider `baseURL`, auth, and headers inside the Director boundary and perform outbound requests.

Follow-up hardening:

- Decide whether sensitive header names should be rejected in Provider Settings, moved to per-provider-instance SecretStorage, or both.
- Prevent custom headers from overriding core auth/version headers unless explicitly intended and tested.

## Customization And History Parity

Customization should use VS Code/main IDE parity as baseline:

- Do not hide built-in/internal skills solely because they are internal.
- VS Code-exposed built-in skills and sessions skills should remain visible.
- Director-specific customization sources should be visible consistently in both main IDE and Agents Window.

Claude Code history should also follow VS Code behavior:

- Claude SDK `listSessions()` / session info is the source for Claude Code history catalog.
- Director should not copy Claude history into an independent truth source.
- Director can still apply UI projection, dedupe, provider/auth routing, and branding.

Historical transcript restore:

- Current Claude code lists sessions but returns no messages for restore.
- Segment 4 must implement real transcript reconstruction before claiming history restore parity.
- Likely implementation is to replace `ClaudeAgent.getSessionMessages()` by reading SDK transcript/JSONL history and mapping it into AgentHost `Turn[]` using the same event/progress mapping shape as live sessions.
