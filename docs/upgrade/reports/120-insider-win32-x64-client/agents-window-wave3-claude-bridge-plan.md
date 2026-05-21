# 120 Agents Window + Wave 3 Claude AgentHost Bridge Plan

Date: 2026-05-19

Status: research synthesis. This document consolidates read-only subagent investigation. No implementation changes were made for this report.

## Executive Conclusion

The 120 Agents Window must be kept. It is an important cross-workspace session-management surface, and its shape is aligned with the Phase 2 Wave 3 direction.

The correct implementation direction is:

- Reuse VS Code 120's Agents Window, AgentHost shell, Claude session UI, session listing, provisional-to-materialized session flow, and permission/event-rendering bridge.
- Do not reuse the upstream Copilot/CAPI provider backend as-is.
- Connect Claude AgentHost to Director-owned provider, model, auth, proxy, session, customization, and tool policy.
- Treat this as a controlled bridge/adaptation project, not a full rewrite of `vs/sessions`.

This expands Wave 3 from "connect Claude AgentHost to Director Provider Registry" into "connect the 120 `vs/sessions` app to Director's canonical session, provider, auth, model, customization, and agent policy."

## Product Decisions

1. The Agents Window is required and should remain available.
2. Claude Agent behavior should follow the VS Code 120 model for this phase: Claude Code / Claude Agent SDK owns actual tool execution, while VS Code/Director hosts the UI, session model, permission prompts, status, and event rendering.
3. Claude Agent is an external agent, not a normal Director LLM chat agent. It should not be forced through the standard Director LLM tool registry in the first implementation.
4. Provider selection, model visibility, auth, routing, account state, and session policy must still be Director-owned.
5. Main IDE and Agents Window must present consistent Director providers, agents, sessions, model choices, customization sources, and account/auth state.

## Current Architecture Facts

### Agents Window Is Separate

The button registered in the workbench opens a separate `vs/sessions` application over `agent-sessions.code-workspace`.

Important paths:

- `vscode.generated/layers/director/vscode/src/vs/workbench/contrib/chat/electron-browser/agentSessions/agentSessionsActions.ts`
- `vscode.generated/layers/director/vscode/src/vs/platform/windows/electron-main/windowsMainService.ts`
- `vscode.generated/layers/director/vscode/src/vs/sessions/electron-browser/sessions.main.ts`
- `vscode.generated/layers/director/vscode/src/vs/platform/environment/common/environmentService.ts`

Implication:

- The Agents Window is not the same window as the main IDE chat panel.
- It has its own workspace context, provider graph, account widget, customization service, and session management service.
- The main IDE chat work does not automatically apply there.

### VS Code Uses Bridged Session Systems

The Agents Window does not have one single unified session source.

Relevant layers:

- `ISessionsProvider` in `src/vs/sessions/services/sessions/common/sessionsProvider.ts`
- `ISessionsProvidersService` in `src/vs/sessions/services/sessions/browser/sessionsProvidersService.ts`
- `ISessionsManagementService` in `src/vs/sessions/services/sessions/browser/sessionsManagementService.ts`
- `IChatSessionsService` in `src/vs/workbench/contrib/chat/browser/chatSessions/chatSessions.contribution.ts`
- AgentHost persistence in `src/vs/platform/agentHost/node/agentService.ts`

Observed behavior:

- `ISessionsManagementService.getSessions()` aggregates all registered `ISessionsProvider`s and deduplicates by optional `deduplicationKey`.
- `IChatSessionsService` separately owns chat-session types, item controllers, content providers, and extension activation.
- AgentHost providers persist and list sessions through their own backend state.

This explains why Claude Agent history can appear while built-in Copilot-style history may not. Claude can be listed directly from AgentHost `listSessions()`, while default Copilot-shaped sessions depend on the extension/workbench chat-session item path.

### Claude AgentHost Behavior Is Reusable, But Not Its Backend

The Claude implementation exists under:

- `vscode.generated/layers/director/vscode/src/vs/platform/agentHost/node/claude/claudeAgent.ts`
- `vscode.generated/layers/director/vscode/src/vs/platform/agentHost/node/claude/claudeAgentSdkService.ts`
- `vscode.generated/layers/director/vscode/src/vs/platform/agentHost/node/claude/claudeProxyService.ts`
- `vscode.generated/layers/director/vscode/src/vs/platform/agentHost/node/shared/copilotApiService.ts`

Useful upstream behavior:

- Provisional sessions are created before SDK startup.
- Sessions materialize on first message.
- AgentHost session persistence and restore are handled by `AgentService` and `SessionDataService`.
- `listSessions()` can surface Claude Code / Claude SDK sessions, including external Claude CLI history.
- VS Code/AgentHost mediates permission UI, session policy, and event rendering.
- Claude SDK built-in tools execute through the SDK/subprocess, not through normal VS Code language-model tool execution.

Do not reuse directly:

- Current Claude code is GitHub Copilot/CAPI oriented.
- It authenticates through Copilot token services.
- It discovers models from CAPI.
- `ClaudeProxyService` expects the upstream Copilot-shaped auth/proxy path.
- In this checkout, production AgentHost startup does not appear to register `ClaudeAgent`; launcher/settings support exists, but the actual production `registerProvider(ClaudeAgent)` path is missing or incomplete.

### Director Already Has The Required Canonical Inputs

Director-owned systems already exist for the main IDE path:

- Provider Registry: `src/vs/workbench/contrib/directorCode/common/agentEngine/providerRegistry.ts`
- Model projection: `providerGroupProjection.ts` and `directorCodeModelProvider.ts`
- Auth state and secrets: `authStateService.ts`, `apiKeyService.ts`, `oauthService.ts`
- Provider settings UI: `providerSettingsWidget.ts`
- Default Director chat agent: `agentEngine.contribution.ts` and `directorCodeAgent.ts`
- Tool policy: `directorToolRegistry.ts`

Reusable capabilities:

- Provider instances and default model selection.
- Stable Director model IDs such as `director-code/<instance>/<model>`.
- Provider kind, auth kind, base URL, custom headers, enabled state, model visibility, and model capabilities.
- API-key, env-var, provider-instance, per-model, and OAuth auth resolution.
- Ask/Edit/Agent/Plan mode state and Director tool policy.

Missing bridge:

- AgentHost and `vs/sessions` do not currently consume the Director Provider Registry, Director auth state, or Director session policy.
- Non-local AgentHost sessions require model metadata targeted to the relevant chat session type.
- AgentHost runs across a process boundary and cannot directly import workbench-only auth/secret services without an explicit IPC/config/proxy boundary.

## Proposed Architecture

### Director Sessions Bridge

Create a Director-owned bridge/policy boundary used by both the main IDE chat surface and the Agents Window.

Responsibilities:

- Expose canonical session identity and session kind.
- Expose Director-approved provider/model availability.
- Expose auth status and sign-in/setup actions.
- Expose default agent and default model.
- Expose customization source policy.
- Expose tool policy for local Director sessions and external AgentHost sessions.
- Filter upstream provider/session types before they become user-visible.

This bridge should be Director-owned. `vs/sessions` should remain mostly a consumer/adapted UI surface.

### Director AgentHost Provider

Add or adapt a Director-owned `IAgent` provider for AgentHost.

Responsibilities:

- Publish `AgentInfo` from Director policy.
- Publish model choices derived from the Director Provider Registry.
- Map AgentHost model picker IDs back to `director-code/<instance>/<model>`.
- Create AgentHost sessions with Director-owned auth/proxy/runtime setup.
- Register Claude Agent only when a Director-approved Anthropic or Anthropic-compatible provider is enabled and authenticated.
- Keep agent kind fixed at session creation.

For Claude v1:

- Use Claude SDK / Claude Code execution semantics.
- Replace Copilot token/CAPI auth with Director `resolveInstanceAuth()` and registry metadata.
- Replace or wrap `ClaudeProxyService` with a Director auth/proxy path.
- Allow Claude-native tools with VS Code/Director permission UI mediation.
- Do not attempt full Director tool mediation in v1 unless explicitly required later.

### Agents Window Provider Facade

Keep the existing `vs/sessions` provider/UI machinery, but make the visible surface Director-filtered.

Responsibilities:

- Hide or rename upstream `default-copilot` labels/types behind Director branding or a compatibility facade.
- Let `local-agent-host` and `BaseAgentHostSessionsProvider` continue handling session listing and UI mechanics where useful.
- Prevent raw Claude/Codex/ACP/local AgentHost exposure unless Director policy allows it.
- Ensure session picker defaults to Director's agent/provider choices.
- Ensure account/sign-in/status opens Director provider settings/OAuth/API-key flows.

Compatibility caution:

- Do not casually rename or remove existing provider IDs if stored session resources depend on them.
- Prefer a compatibility facade or policy wrapper first.

### Shared Director Session Index

The main IDE and Agents Window should not rely on the synthetic Agents workspace seeing the original IDE window's `IChatService.getHistorySessionItems()`.

Add a shared Director session index/event model that can:

- Record Director session identity, kind, provider, model, workspace, status, and timestamps.
- Map main IDE local chat sessions and AgentHost sessions into a common list.
- Keep Agents Window and main IDE session views consistent.
- Preserve compatibility with AgentHost `AgentSession.uri(provider, id)` and existing session resource schemes.

## Required Fix Areas

| Area | Required outcome |
| --- | --- |
| Session list | Main IDE and Agents Window show the same Director-approved sessions. |
| Provider list | Provider availability comes from Director Provider Registry. |
| Model picker | Model choices come from Director-visible models and target the active session type. |
| Claude Agent | Claude is registered only through Director-approved provider/auth/model state. |
| Account/status | Replace upstream GitHub/Copilot entitlement UI with Director auth/provider status. |
| Customizations | Align with the main IDE / VS Code Agents Window behavior. Built-in/internal skills exposed by VS Code should remain visible unless Director intentionally diverges with a tested policy. |
| Tools | Claude v1 can use SDK-native tools, but permission UI/policy must be Director-controlled. |
| Replay | All durable changes land through the 120 replay control plane. |

## Stage Ownership

### `004-director-agent-engine.120-insider.patch`

Use for:

- AgentHost provider registration.
- Director AgentHost provider/adapter.
- Claude auth/proxy/model routing.
- Director Provider Registry bridge into AgentHost.
- Session backend integration.
- Process-boundary auth/proxy handles.

### `005-director-chat-built-in-mode.120-insider.patch`

Use for:

- `vs/sessions` UI integration.
- Agents Window account/status/sign-in replacement.
- Session picker/default agent behavior.
- Provider/type visibility in the Agents Window.
- Setup flow and product-facing state.

### `007-director-tool-layer.120-insider.patch`

Use only if:

- AgentHost client-tool allowlists must be derived from `directorToolRegistry`.
- Agents Window or AgentHost tool visibility needs shared Director mode-policy enforcement.

### `003-director-product-build-release.120-insider.patch`

Use only if:

- Product JSON or packaged defaults change.
- Build/package/config defaults for AgentHost, Claude, or Agents Window need canonical control.

### Replay Control Plane

If new paths under `src/vs/platform/agentHost/node/claude/**`, broader `src/vs/platform/agentHost/**`, or broader `src/vs/sessions/**` become Director-owned, update:

- `scripts/upgrade/generate-director-patches.mjs`
- `patches/series.120-insider.json`
- active profile metadata if stage/path ownership changes
- expected contracts/canonical manifests/reports if tracked outputs change

## Suggested Implementation Phases

### Phase A: Policy Inventory And Gating

Goal: stop uncontrolled upstream exposure while keeping the window available.

Tasks:

- Identify all visible provider/session type sources in the Agents Window.
- Add Director policy checks around `default-copilot`, `local-agent-host`, Claude, Codex, ACP, and local session types.
- Replace broken account/sign-in actions with Director provider settings entry points.
- Keep existing session mechanics intact.

Expected result:

- Agents Window opens.
- It no longer shows broken Copilot/GitHub account state.
- It no longer exposes unapproved Claude or internal session types.

### Phase B: Director Provider Registry Bridge

Goal: make AgentHost and Agents Window consume Director provider/model state.

Tasks:

- Add a Director AgentHost provider/adapter.
- Publish `AgentInfo.models` from Provider Registry visible models.
- Map selected AgentHost model IDs to Director model identifiers.
- Feed auth status from Director auth state.
- Add process-boundary handling for resolved auth/proxy state.

Expected result:

- Agents Window model/provider choices match the main IDE.
- Claude becomes available only when a Director-approved Anthropic-compatible provider is configured.

### Phase C: Claude AgentHost Runtime

Goal: make Claude Agent work through Director-owned provider/auth/proxy while reusing SDK-native behavior.

Tasks:

- Wire production AgentHost provider registration for Claude through Director policy.
- Replace Copilot/CAPI model discovery with Director registry/model state.
- Replace Copilot token auth with Director `resolveInstanceAuth()` and registry metadata.
- Replace or wrap `ClaudeProxyService` with Director proxy/routing.
- Keep SDK-native tools and permission UI bridge for v1.

Expected result:

- Claude Agent sessions create, materialize, list, and restore through AgentHost.
- Claude uses Director-configured providers and auth.
- The UI behavior remains close to upstream VS Code 120.

### Phase D: Shared Session Index

Goal: make IDE and Agents Window session lists consistent.

Tasks:

- Define Director session identity across local chat, Director Agent, Plan, and AgentHost external agents.
- Persist enough metadata for both views.
- Add event propagation so both surfaces update consistently.
- Preserve compatibility with AgentHost resources and existing chat-session item controllers.

Expected result:

- Sessions are not empty or divergent simply because the user is in a separate `agent-sessions.code-workspace`.
- Main IDE and Agents Window agree on which Director sessions exist.

### Phase E: Customization And Tool Policy Alignment

Goal: prevent capability leakage and align user experience.

Tasks:

- Align Agents Window customization sources with the main IDE / VS Code behavior.
- Preserve VS Code-exposed built-in/internal skills, extension skills, and local/user/plugin roots unless Director intentionally diverges.
- Ensure Director-specific customization sources appear consistently across the main IDE and Agents Window.
- Keep Claude customization behavior aligned with VS Code except for Director-owned Provider/Auth/UI routing.
- Route AgentHost client-tool visibility through Director policy if VS Code tools are exposed.

Expected result:

- Agents Window customization is explainable because it matches the equivalent VS Code surface and Director main IDE behavior.
- Built-in/internal skills exposed by VS Code remain visible; any difference is intentional and covered by parity tests.
- Tool and customization behavior is consistent.

## Key Risks

| Risk | Why it matters | Mitigation |
| --- | --- | --- |
| Provider ID migration | Stored sessions may depend on upstream IDs like `default-copilot` or `agent-host-*`. | Use a facade/wrapper before renaming resources. |
| Auth boundary | AgentHost cannot directly use workbench-only secret/OAuth services. | Use explicit IPC/config/proxy handles; avoid raw secret leakage. |
| Tool policy bypass | Claude SDK tools can act outside Director tool registry. | Accept SDK-native tools for v1 but keep permission UI/session policy under Director control. |
| Customization leakage | `vs/sessions` has separate skills and roots. | Add Director source policy and explicit allow/deny rules. |
| Session divergence | Main IDE and Agents Window have different service graphs. | Add shared Director session index/event model. |
| Replay drift | Generated-tree fixes can be lost. | Update stage/path classification before generating final replay patches. |

## Current Open Decisions

1. Claude v1 tool model: use SDK-native tools with Director/VS Code permission UI for v1.
2. Session index source of truth: introduce a Director session index consumed by both surfaces, while AgentHost remains source of truth for native AgentHost sessions.
3. Provider facade strategy: wrap `default-copilot`/`local-agent-host` for compatibility before considering provider-id migration.
4. Customization scope: use VS Code/main IDE parity as baseline; preserve built-in/internal skills exposed by VS Code.
5. Auth bridge: use a short-lived local proxy/session handle. Do not pass resolved raw auth config into AgentHost.

## Recommended Next Step

Open Phase 2 Wave 3 as a combined effort:

`Director Sessions Bridge + Claude AgentHost Provider`

The first implementation slice should keep the Agents Window visible but remove broken upstream account/status behavior and uncontrolled provider exposure. Then wire the Director Provider Registry into AgentHost and Claude runtime before broadening session sync and customization alignment.
