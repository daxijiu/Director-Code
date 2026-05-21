# 120 Insider Agents Window Investigation

Date: 2026-05-19

Status: read-only investigation. No source or replay files were changed for this report.

## Scope

This report records the investigation of the new VS Code 120 Agents Window entry point exposed in the Director 120 Insider build.

User-observed symptoms:

- A new entry point/button appears with the hover text `Open in Agents Window`.
- The opened window still shows account/sign-in status UI, including `Account`, `Sign In`, and `Agents is signed out`, but those actions do not work in the Director build.
- The Agents Window session list is empty and does not match the main IDE chat/session list.
- The Agents Window customization surface appears independent from the main IDE customization surface, including skills/instructions not visible elsewhere.
- The Agents Window agent chat UI does not default to the Director agent and can expose Claude Agent.

## Primary Conclusion

The Agents Window is not a mirror of the normal workbench Chat/Agent panel. In VS Code 120 it is a separate top-level `vs/sessions` application layer opened against a special synthetic workspace.

The current Director 120 replay baseline has Directorized the main workbench chat/agent path, but this new `vs/sessions` surface still contains upstream account, Copilot, session-provider, customization, and AgentHost assumptions. The observed bugs are therefore a surface-integration gap, not just a broken button or stale label.

Product decision update:

- The Agents Window is an important cross-workspace session-management experience and should be kept.
- The fix direction is not to hide or remove the surface, but to bring it under the same Director session, provider, model, agent, auth, and customization policy as the main IDE chat/agent surface.
- The work should be treated as an adaptation/bridge of already-existing Director systems into the new 120 `vs/sessions` layer, with targeted suppression of upstream Copilot/Claude defaults where they bypass Director policy.

## Entry Point And Window Creation

The standard workbench registers the entry point in:

- `vscode.generated/layers/director/vscode/src/vs/workbench/contrib/chat/electron-browser/agentSessions/agentSessionsActions.ts`

Important signals:

- `OpenWorkspaceInAgentsWindowAction` registers `workbench.action.openWorkspaceInAgentsWindow`.
- The title/menu contribution is attached to chat/title-bar surfaces.
- The custom title-bar widget uses the hover/ARIA label `Open in Agents Window`.
- The action calls `INativeHostService.openAgentsWindow(...)`.

The main process opens the window in:

- `vscode.generated/layers/director/vscode/src/vs/platform/windows/electron-main/windowsMainService.ts`

Important signals:

- `openAgentsWindow()` calls `ensureAgentsWindow(...)`.
- `ensureAgentsWindow()` creates or reuses `agent-sessions.code-workspace`.
- The window is opened as a new window with `forceNewWindow: true` and `noRecentEntry: true`.
- If a folder was passed from the original workspace, the main process sends it to the Agents Window through `vscode:selectAgentsFolder`.

The special workspace path comes from:

- `vscode.generated/layers/director/vscode/src/vs/platform/environment/common/environmentService.ts`

It resolves to `appSettingsHome/agent-sessions.code-workspace`.

## Independent Sessions Application Layer

The Agents Window application lives under:

- `vscode.generated/layers/director/vscode/src/vs/sessions/`

The local README describes this as an `Agentic Window` layer distinct from `vs/workbench`. It can import workbench services, but the workbench side is not supposed to import sessions.

The renderer setup is in:

- `vscode.generated/layers/director/vscode/src/vs/sessions/electron-browser/sessions.main.ts`

Important signal:

- The Sessions Window installs `SessionsWorkspaceContextService` using `environmentService.agentSessionsWorkspace`.

That means the window has its own workspace context. It is not running inside the same workspace context as the original IDE window.

## Session List Mismatch

The main workbench agent-session model is wired through:

- `vscode.generated/layers/director/vscode/src/vs/workbench/contrib/chat/browser/agentSessions/agentSessionsService.ts`
- `vscode.generated/layers/director/vscode/src/vs/workbench/contrib/chat/browser/agentSessions/agentSessionsModel.ts`
- `vscode.generated/layers/director/vscode/src/vs/workbench/contrib/chat/browser/agentSessions/localAgentSessionsController.ts`

Important signals:

- `AgentSessionsService` resolves registered chat-session item providers.
- `LocalAgentsSessionsController` registers a local session provider against the current window's `IChatService`.
- Local session items come from `chatService.getLiveSessionItems()` and `chatService.getHistorySessionItems()`.

Because the Agents Window runs in its own synthetic workspace and its own service graph, it does not automatically see the live/history chat models from the already open main IDE window.

Interpretation:

- An empty session list in the Agents Window is expected with the current architecture.
- Syncing it with the normal IDE chat list would require explicit cross-window/session persistence or a Director-owned sessions provider. It will not fall out of the existing main workbench chat integration automatically.

## Provider And Session Source Split

Follow-up investigation found that VS Code 120 does not use one unified session source for the Agents Window.

There are at least three related layers:

1. `vs/sessions` window-level providers implement `ISessionsProvider`.
2. Workbench chat session types and chat content are managed by `IChatSessionsService`.
3. AgentHost-backed providers maintain their own persistent session metadata and expose it through `AgentService.listSessions()`.

Important files:

- `vscode.generated/layers/director/vscode/src/vs/sessions/services/sessions/common/sessionsProvider.ts`
- `vscode.generated/layers/director/vscode/src/vs/sessions/services/sessions/browser/sessionsProvidersService.ts`
- `vscode.generated/layers/director/vscode/src/vs/sessions/services/sessions/browser/sessionsManagementService.ts`
- `vscode.generated/layers/director/vscode/src/vs/workbench/contrib/chat/browser/chatSessions/chatSessions.contribution.ts`
- `vscode.generated/layers/director/vscode/src/vs/platform/agentHost/node/agentService.ts`

Important signals:

- `ISessionsProvider` owns session listing, workspace resolution, session creation, model selection, archive/delete, and send operations for a provider.
- `ISessionsProvidersService` only registers and returns providers. It does not impose Director policy.
- `ISessionsManagementService.getSessions()` gathers sessions from every registered `ISessionsProvider` and deduplicates by optional `deduplicationKey`.
- `IChatSessionsService` separately owns chat-session item controllers, content providers, customizations providers, and extension activation through `onChatSession:<type>`.
- AgentHost persists and restores its own sessions through provider `listSessions()`, per-session metadata, and state-manager overlays.

Interpretation:

- VS Code 120 intentionally has multiple similar-looking session systems that are bridged, not inherently synchronized.
- The Agents Window list is a provider aggregation view. It does not automatically mean "show the same sessions as the main IDE chat view".
- A provider can have history in Agents Window if its provider source can list persisted sessions. Another provider can appear empty if its underlying chat/session item source does not expose history in that window.

## Why Claude History Can Appear When Copilot History Does Not

The user-observed behavior that Claude Agent sessions can appear while built-in Copilot sessions do not is consistent with the current code.

Default Copilot-shaped provider:

- `vscode.generated/layers/director/vscode/src/vs/sessions/contrib/copilotChatSessions/browser/copilotChatSessionsProvider.ts`

Important signals:

- `CopilotChatSessionsProvider` registers as provider id `default-copilot` with label `Copilot Chat`.
- It exposes `CopilotCLISessionType`, `CopilotCloudSessionType`, optional `LocalSessionType`, and optional `ClaudeCodeSessionType`.
- Its cache is refreshed from `agentSessionsService.model.sessions`.
- That model is populated by `IChatSessionsService.getChatSessionItems(...)` through registered chat-session item controllers.

Local AgentHost provider:

- `vscode.generated/layers/director/vscode/src/vs/sessions/contrib/agentHost/browser/localAgentHostSessionsProvider.ts`
- `vscode.generated/layers/director/vscode/src/vs/sessions/contrib/agentHost/browser/baseAgentHostSessionsProvider.ts`
- `vscode.generated/layers/director/vscode/src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostChatContribution.ts`

Important signals:

- `LocalAgentHostSessionsProvider` registers provider id `local-agent-host` when `chat.agentHost.enabled` is true.
- It synchronizes session types from AgentHost `rootState`.
- It eagerly refreshes after authentication settles.
- `BaseAgentHostSessionsProvider._refreshSessions()` calls `connection.listSessions()`.
- The local AgentHost path registers dynamic chat session types such as `agent-host-${agent.provider}`.

AgentHost backend:

- `vscode.generated/layers/director/vscode/src/vs/platform/agentHost/node/agentService.ts`
- `vscode.generated/layers/director/vscode/src/vs/platform/agentHost/node/agentHostStateManager.ts`

Important signals:

- `AgentService.listSessions()` calls every registered backend agent provider's `listSessions()`.
- It overlays persisted per-session metadata such as custom title, read/archive status, done state, diffs, live status, activity, and model.
- Restored sessions can be rehydrated from provider metadata plus per-session database state.

Interpretation:

- Claude history can appear because the AgentHost provider can list persisted AgentHost sessions directly.
- Built-in Copilot-shaped history may not appear if the corresponding extension-backed or workbench chat-session provider does not expose items into this window's `IChatSessionsService` graph.
- The visible list is therefore provider-dependent, not a single shared "all chat history" list.

## Director Consistency Requirement

For Director, the intended product behavior should be stricter than upstream VS Code's loose provider aggregation.

Required consistency principles:

- The main IDE chat/agent surface and the Agents Window should share the same Director session identity model.
- Provider availability, default provider, model visibility, and model selection should come from the Director Provider Registry.
- Agent visibility should come from Director policy, not from whichever upstream provider or local SDK happens to register first.
- Claude, Codex, ACP, local AgentHost, and future external adapters should only appear after passing Director-owned provider, auth, model, and permission policy.
- Account/sign-in/status UI should reflect Director provider/auth state, not upstream GitHub/Copilot entitlement.
- Customization and skills should use a Director-approved source policy so internal/session-only skills do not leak unexpectedly.

This is not a full rewrite. Most required capabilities already exist elsewhere in Director:

- Director Provider Registry and projected model/provider state already exist for the main IDE path.
- Director has replay-backed chat mode, Agent mode, Plan mode, provider/model management, tool policy, and read-only/edit tool layers.
- The missing work is the bridge from those Director-owned systems into the 120 `vs/sessions` application layer and its provider APIs.

Workload assessment:

- The work is controllable if scoped as a bridge/adaptation project.
- It is larger than label cleanup because `vs/sessions` has separate provider, session, account, customization, and AgentHost paths.
- It should avoid reimplementing all of `vs/sessions`; instead, Director should own the policy and canonical data sources, then adapt them into the `ISessionsProvider` and `IChatSessionsService` contracts used by this window.

## Account And Sign-In Residue

The account/status UI is owned by the Sessions Window:

- `vscode.generated/layers/director/vscode/src/vs/sessions/browser/accountTitleBarState.ts`
- `vscode.generated/layers/director/vscode/src/vs/sessions/contrib/accountMenu/browser/account.contribution.ts`
- `vscode.generated/layers/director/vscode/src/vs/sessions/browser/sessionsSetUpService.ts`

Important signals:

- Account resolution uses `IDefaultAccountService.getDefaultAccount()`.
- It falls back to GitHub authentication sessions.
- The status calculation still has Copilot-style entitlement states.
- `Agents is signed out` is produced by the Sessions account/status path.
- `workbench.action.agenticSignIn` calls `defaultAccountService.signIn()`.
- The setup service still triggers chat setup/sign-in flows tied to `defaultChatAgent` and upstream account assumptions.

Interpretation:

- These controls are not wired to the Director Provider Registry, Director secrets/OAuth policy, or Director default provider selection.
- In a Director build where upstream Copilot/GitHub commercial sign-in flow has been removed or bypassed, these actions can be visible but ineffective.
- This is a real product bug if the Agents Window remains exposed.

## Customizations And Skills Mismatch

The Sessions Window has its own customization model documented in:

- `vscode.generated/layers/director/vscode/src/vs/sessions/AI_CUSTOMIZATIONS.md`

Related implementation includes:

- `vscode.generated/layers/director/vscode/src/vs/sessions/contrib/chat/browser/promptsService.ts`
- `vscode.generated/layers/director/vscode/src/vs/workbench/contrib/chat/browser/aiCustomization/promptsServiceCustomizationItemProvider.ts`
- `vscode.generated/layers/director/vscode/src/vs/workbench/contrib/chat/browser/chat.contribution.ts`

Important signals:

- The Sessions Window overrides prompts/customization behavior through an agentic prompts service.
- It has sessions-specific built-in skills and harness behavior.
- It treats session/agent customization sources differently from the normal workbench chat surface.
- Some normal workbench customization discovery is explicitly suppressed or changed when `isSessionsWindow` is true.

Interpretation:

- The different skills/instructions view is not accidental UI drift. It comes from a separate sessions customization stack.
- If Director keeps this window, it needs an explicit policy for which built-in, local, user, plugin, Claude, and Director customization sources should be visible.

## Agent And Claude Exposure

The Sessions provider and agent type path includes:

- `vscode.generated/layers/director/vscode/src/vs/sessions/SESSIONS_PROVIDER.md`
- `vscode.generated/layers/director/vscode/src/vs/sessions/contrib/copilotChatSessions/browser/copilotChatSessions.contribution.ts`
- `vscode.generated/layers/director/vscode/src/vs/sessions/contrib/copilotChatSessions/browser/copilotChatSessionsProvider.ts`
- `vscode.generated/layers/director/vscode/src/vs/workbench/contrib/chat/browser/agentSessions/agentSessions.ts`
- `vscode.generated/layers/director/vscode/src/vs/sessions/contrib/agentHost/browser/localAgentHost.contribution.ts`
- `vscode.generated/layers/director/vscode/src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostChatContribution.ts`
- `vscode.generated/layers/director/vscode/src/vs/platform/agentHost/common/agentService.ts`

Important signals:

- `sessions.github.copilot.multiChatSessions` defaults to enabled.
- `sessions.chat.claudeAgent.enabled` defaults to enabled.
- The sessions provider includes Copilot CLI, Copilot Cloud, local agent, and Claude session types depending on configuration and AgentHost state.
- The AgentHost contribution registers session types from AgentHost `rootState`.
- Claude SDK/path support is controlled by AgentHost configuration and environment.

Interpretation:

- Claude being visible in the Agents Window is consistent with the current 120 Sessions/AgentHost code path.
- Director text patches have adjusted some labels/descriptions, but this path is not yet fully routed through the Director Provider Registry, Director model visibility, Director default agent logic, or Director auth/proxy policy.
- The normal IDE default Director agent replacement does not automatically replace the Sessions Window provider/session-type picker.

## Bug Classification

| Issue | Severity | Current interpretation |
| --- | --- | --- |
| Broken account/sign-in/status menu | P1 | Upstream Sessions account/Copilot entitlement UI is exposed without Director auth wiring. |
| Empty session list | P1 | Sessions Window uses a synthetic workspace and separate session provider graph; main IDE chat sessions are not synchronized. |
| Claude Agent exposure | P1 | Claude/session types can be exposed by upstream 120 Sessions/AgentHost defaults before Director policy is applied. |
| Customization/skills mismatch | P2 | Sessions Window has independent customization discovery and built-in skills. This needs a Director visibility policy. |
| `Open in Agents Window` visible before integration is complete | P1 | The entry point exposes an incomplete upstream surface to users. |

## Remediation Options

### Option A: Keep the Agents Window and Directorize it

This is the selected product direction. The Agents Window is important and should remain available, but it must be brought under Director-owned state and policy before being considered complete.

Expected work:

- Add or adapt a Director-owned sessions provider for `vs/sessions`.
- Bridge main IDE Director sessions into the Agents Window through a shared Director session identity/storage/event model.
- Route provider/model availability through the Director Provider Registry.
- Make the default visible agent match the main IDE Director Agent.
- Replace or suppress upstream account/sign-in status with Director auth/provider status.
- Gate Claude, Codex, ACP, local AgentHost, and remote agents through Director policy.
- Align customization and skills discovery with the main Director-approved customization model.

Likely replay stage:

- `004-director-agent-engine.120-insider.patch` for AgentHost bridge, provider policy, auth/proxy/model routing, and session backend integration.
- `005-director-chat-built-in-mode.120-insider.patch` for Sessions Window UI, setup, default agent, menu behavior, and product-facing state.
- `007-director-tool-layer.120-insider.patch` only if Agents Window tool visibility or mode-policy enforcement must be adapted there.
- `003-director-product-build-release.120-insider.patch` only if product/config defaults or packaged-product settings need to change.

### Option B: Temporary product gating if integration slips

This is not the preferred product outcome, but remains a fallback if a release candidate must be cut before the integration is ready.

Expected work:

- Keep the entry hidden only while incomplete.
- Avoid shipping broken account/sign-in, stale Copilot, or uncontrolled Claude exposure.
- Leave the integration work tracked as a blocker before fully exposing the surface.

Likely replay stages:

- `005-director-chat-built-in-mode.120-insider.patch` for entry point visibility or feature gating.
- Product/config defaults may belong in `003-director-product-build-release.120-insider.patch` if a product-level flag is introduced or changed.

## Recommended Next Step

Treat this as a blocker-class 120 surface audit item before exposing the 120 Agents Window to users.

Recommended immediate decision:

1. Keep the Agents Window as a required Director experience.
2. Open a dedicated integration task for the 120 `vs/sessions` layer instead of patching individual labels.
3. Reuse existing Director systems where possible: Provider Registry, model visibility, session state, auth policy, tool policy, Plan/Agent mode, and customization policy.
4. Add only the bridges/adapters needed for the Sessions Window contracts.

Do not accept a generated-tree-only fix. Any durable behavior change must be replay-backed through the 120 profile and validated with the profile-scoped replay checks.
