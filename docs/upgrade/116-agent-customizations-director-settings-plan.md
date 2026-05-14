# 116 Agent Customizations Director Settings Integration Plan

Date: 2026-05-13

Phase: P2 follow-up

Status: implemented, replay-backed, and validated as part of the 116 Phase 5 mode routing gate.

Execution progress added on 2026-05-14:

- `AICustomizationManagementSection.DirectorCode` is included in the Agent Customizations management section list.
- The Agent Customizations editor renders a Director Code section with an action that executes `director-code.openSettings`.
- The Director language model provider descriptor advertises `managementCommand: 'director-code.openSettings'`.
- Existing Director settings entry points remain unchanged; credentials and OAuth state still stay in the existing Director settings/secrets path.
- Replay ownership remains shallow: the Agent Customizations bridge is captured in `005-director-chat-built-in-mode.116.patch`, while Phase 5 mode-routing source changes are captured in their existing agent/editing stages.
- Validation was covered by the Phase 5 clean replay gate: TypeScript compile, esbuild transpile, targeted Director browser tests, inline request parity smoke, replay validators, and canonical manifest validation.

## Summary

VS Code 1.116 adds an Agent window title-bar gear action named `Open Customizations`. It opens the `Agent Customizations` editor through `aiCustomization.openManagementEditor`.

Director Code should use this upstream entry point as a discoverable place for agent-related configuration, but the first implementation should keep Director Code runtime settings as an independent editor. The integration should add a small, durable bridge from `Agent Customizations` to the existing `Director Code Settings` editor and wire Director's language model provider management command to the same settings command.

This keeps the UX coherent without mixing API keys, OAuth state, and provider configuration into upstream AI customization files.

## Current Upstream Behavior

- Chat view title gear:
  - File: `src/vs/workbench/contrib/chat/browser/actions/chatActions.ts`
  - Command: `AICustomizationManagementCommands.OpenEditor`
  - User-facing title: `Open Customizations`
- Customizations editor:
  - Input title: `Agent Customizations`
  - Editor id: `workbench.editor.aiCustomizationManagement`
  - Primary responsibilities: agents, skills, instructions, prompts, hooks, MCP servers, plugins, and optional model management.
- Active management sections currently include:
  - `agents`
  - `skills`
  - `instructions`
  - `prompts`
  - `hooks`
  - `mcpServers`
  - `plugins`
- `models` exists in the section enum and editor implementation, but it is not currently enabled in the core `managementSections` list.

## Current Director Behavior

- Director settings command:
  - Command: `director-code.openSettings`
  - Editor input: `DirectorCodeSettingsEditorInput`
  - Editor title: `Director Code Settings`
- Director settings own runtime configuration:
  - provider selection
  - model selection
  - API key management
  - OpenAI Codex OAuth login
  - base URL and auth variant handling
  - runtime limits and model resolver behavior
- Secrets and credentials must remain in the existing secure storage path. They must not be written into workspace or user customization files.

## Decision

Implement a bridge, not a merge.

The first code change should:

1. Keep `director-code.openSettings` and all existing external entry points.
2. Add a Director Code entry inside `Agent Customizations`.
3. Make that entry open the existing `Director Code Settings` editor.
4. Set Director's language model provider `managementCommand` to `director-code.openSettings`.
5. Avoid embedding or duplicating the full settings UI inside the upstream customizations editor in this batch.

## Non-Goals

- Do not move API keys or OAuth state into AI customization storage.
- Do not remove the command palette or Preferences menu entry for Director settings.
- Do not enable the upstream `Models` section just to expose Director settings.
- Do not replace the existing `DirectorCodeSettingsEditor` in this batch.
- Do not depend on Copilot-specific setup, entitlement, quota, or install flows.

## Implementation Plan

### Step 1: Add a Director Code entry in Agent Customizations

Preferred implementation:

- Add a lightweight `Director Code` section or panel to `Agent Customizations`.
- The section should explain through concise labels only that it manages provider, authentication, and model runtime settings.
- The primary action should execute `director-code.openSettings`.
- The existing settings editor should open pinned, matching the current command behavior.

Expected touched areas:

- `src/vs/workbench/contrib/chat/common/aiCustomizationWorkspaceService.ts`
- `src/vs/workbench/contrib/chat/browser/aiCustomization/aiCustomizationWorkspaceService.ts`
- `src/vs/workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditor.ts`
- `src/vs/workbench/contrib/chat/browser/aiCustomization/media/aiCustomizationManagement.css`

Fallback if the section addition is too invasive:

- Add a Director Code settings card to the Agent Customizations welcome page.
- Keep the card independent from upstream prompt/customization list logic.
- Still route to `director-code.openSettings`.

### Step 2: Wire Director model provider management

Update the Director language model vendor registration so the provider advertises:

- vendor: `director-code`
- display name: `Director Code`
- management command: `director-code.openSettings`

Expected touched area:

- `src/vs/workbench/contrib/chat/browser/agentEngine/agentEngine.contribution.ts`

Reason:

- Upstream `ChatModelsWidget` renders a provider management gear only when a vendor exposes a `managementCommand`.
- If upstream later enables the `Models` section, Director's provider can be managed from there without another custom patch.
- This is also useful for existing model picker and model management surfaces that rely on language model provider metadata.

### Step 3: Keep existing settings entry points

Verify these continue to work:

- Command palette: `Director Code: Open Settings`
- Preferences menu entry
- Chat setup/configure links that execute `director-code.openSettings`
- `defaultChatAgent.manageSettingsUrl` command URI paths that already require `allowCommands: true`

This is a hard requirement because `Agent Customizations` can be hidden by upstream AI customization disablement settings.

### Step 4: Guard against scope and storage leaks

The integration must preserve this boundary:

- AI customization files: agents, skills, prompts, instructions, hooks, MCP, plugins.
- Director settings: provider, auth, model resolver, API keys, OAuth, runtime options.

Do not pass API keys, token state, or OAuth identity into:

- prompt files
- workspace customization files
- debug reports
- customization list item descriptions
- telemetry events

### Step 5: Keep upstream upgrade cost low

Prefer the smallest stable integration points:

- command bridge
- provider `managementCommand`
- small UI section or welcome card

Avoid large edits inside:

- `AICustomizationListWidget`
- prompt storage logic
- harness provider APIs
- external customization provider logic
- editor save/dirty semantics

The AI customization subsystem is new in 1.116 and likely to continue changing. Director patches here should stay shallow and easy to rebase.

## Validation Plan

Run after implementation:

- TypeScript compile for the workbench tree.
- Existing upgrade validators:
  - `node scripts/upgrade/validate-all.mjs`
- Clean materialize for the active 116 profile if the canonical replay patch set changes.
- UI smoke:
  - open Agent view
  - hover/click `Open Customizations`
  - confirm `Agent Customizations` opens
  - confirm Director Code entry is visible
  - click Director Code entry/action
  - confirm `Director Code Settings` opens
  - confirm provider/auth controls still read and write existing configuration/secret storage
- Regression smoke:
  - command palette still opens `Director Code: Open Settings`
  - Preferences menu entry still opens the same editor
  - model picker configure/manage path opens Director settings

## Risks

- `Agent Customizations` can be disabled by upstream settings such as `disableAICustomizations` or `workbench.disableAICustomizations`. Director settings must remain reachable elsewhere.
- The upstream customizations editor has its own layout, section state, telemetry, dirty/save logic, and harness context keys. Embedding Director settings directly would couple Director to those internals.
- The upstream Models section contains VS Code/Copilot-oriented wording and links. Enabling it without review could expose an inconsistent Director Code UX.
- `managementCommand` is marked deprecated upstream, but it is still the mechanism used by current model management UI for provider gear actions. Use it as a compatibility bridge, not as the only settings path.
- A new sidebar section touches upstream AI customization files. Keep the diff small and isolate Director-specific code so future upstream merges are straightforward.

## Open Decisions

No user decision is required before the first implementation batch.

Implementation default:

- Add the Director entry inside `Agent Customizations`.
- Route to the existing Director settings editor.
- Wire `managementCommand`.
- Do not enable full upstream `Models` section unless a later review explicitly approves it.
