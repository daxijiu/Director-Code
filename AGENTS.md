# Director-Code Project Guide

This file is intentionally identical to the companion root guide (`AGENTS.md` / `CLAUDE.md`). Keep the two files in sync.
Detailed historical state belongs in `.claude/memory.md`; this file is the durable project overview, goals, and direction.

## Project Summary

Director-Code is a replay-backed VS Code/VSCodium derivative focused on a deeply integrated AI coding experience.

The long-term source of truth is the replay control plane, not the generated VS Code tree. The generated tree is a debugging, validation, and packaging workspace only.

The durable architecture direction is:

`Director-owned core + thin VS Code bridge + replayed brand/product layer`

Director should feel deeply integrated, similar in shape to Copilot inside VS Code, while keeping Director product/runtime logic in Director-owned modules or adapter islands.

## Current Program

- Current mainline work is P2: upgrade the replay baseline from VS Code/VSCodium 112 to 116, then continue fixing and expanding the Director-Code runtime on that replay-backed baseline.
- The active canonical profile is `docs/upgrade/profiles/116-stable-win32-x64-client.json`.
- The active profile index is `docs/upgrade/profiles/index.json`; do not infer a new active profile from the branch name alone.
- The old 112 physical reference validation is complete. For 116 and later, correctness comes from replay validation, expected contracts, targeted tests, compile/build smoke, and packaged/manual verification.
- `vscode.generated/layers/director/vscode` is not the long-term source of truth.

## Goals

- Keep Director-Code easy to upgrade across VS Code baselines by concentrating runtime behavior in Director-owned code.
- Preserve a high-quality AI coding workflow: Ask, Edit, Agent, Inline, Plan, provider/model management, reviewable edits, read-only context tools, and external agent adapters.
- Build toward a provider/agent ecosystem where model providers, secrets, OAuth, model visibility, permissions, session policy, and agent adapters are Director-owned.
- Reuse VS Code model management, chat UI, agent/session surfaces, and workbench integration points through minimal hooks and bridges.
- Keep Windows packaging, branding, product metadata, and installer outputs reproducible from replay-backed inputs.

## Architecture Direction

- New Director behavior should default into `src/vs/workbench/contrib/directorCode/**` or a future Director-owned built-in extension.
- VS Code upstream directories should hold only registration hooks, model/chat/tool surface adapters, command/menu wiring, and small compatibility shims.
- When an upstream VS Code surface must change, prefer a small hook into a Director-owned service over embedding Director business logic directly in upstream files.
- Branding/product edits may touch many files but are shallow; upgrade risk should be judged by where runtime logic lives, not by touched file count alone.
- Provider/model work must keep the Director Provider Registry, secret/OAuth policy, provider manager UI, provider instances, model visibility state, and default-model logic Director-owned.
- External agent adapters such as Claude SDK, ACP, and Codex should be plugin-like or adapter-like islands. Workbench changes for them should stay limited to session registration, permissions/tool policy, UI entry points, and bridge plumbing.
- Wave 3 Claude AgentHost integration may place a Director-owned Claude adapter island under AgentHost-related platform paths when that is the cleanest way to reuse VS Code main/Copilot shape, but provider registry, proxy, auth, diagnostics, model routing, and policy remain Director-owned.

## Canonical Inputs

Current 116 canonical inputs include:

- `docs/upgrade/profiles/116-stable-win32-x64-client.json`
- `patches/series.116.json`
- `patches/replay/*.116.patch`
- `docs/upgrade/product-overrides/116-stable-win32-x64-client.json`
- `docs/upgrade/expected/116-stable-win32-x64-client/*.json`
- `docs/upgrade/reports/116-stable-win32-x64-client/*.json`
- `docs/upgrade/manifests/116-stable-win32-x64-client.canonical.json`
- `scripts/upgrade/` materialize, patch generation, and validation scripts

Generated validation workspace:

```text
vscode.generated/layers/director/vscode
```

## Replay Landing Rule

All durable Director changes must land through replay:

1. It is fine to first edit `vscode.generated/layers/director/vscode` for debugging and local validation.
2. After the behavior is validated, convert the diff into the appropriate Director replay patch or replay control file.
3. If a new patch stage is truly needed, update `patches/series.116.json`, the active profile, and `scripts/upgrade/generate-director-patches.mjs` stage/path classification.
4. If a change affects product/package/server manifests, expected contracts, product overrides, canonical manifests, or reports, update those canonical files too.
5. Before finishing a phase, bugfix, or release candidate, run profile-scoped replay validation. Do not accept a generated-tree-only fix as complete.

Recommended baseline checks:

```powershell
node scripts/upgrade/validate-series.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json
node scripts/upgrade/validate-product-overrides.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json
node scripts/upgrade/expected-contracts.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json
```

For release candidates or phase closeout, clean-materialize from upstream inputs:

```bash
bash scripts/upgrade/materialize-vscode.sh \
  --profile docs/upgrade/profiles/116-stable-win32-x64-client.json \
  --target vscode.generated \
  --up-to-layer director \
  --force
```

## 116 Patch Stage Ownership

Current 116 replay stages:

1. `001-vscodium-layer.116.patch`: VSCodium aggregate layer, not Director-owned.
2. `002-director-branding.116.patch`: branding, resources, copy, product experience drift.
3. `003-director-product-build-release.116.patch`: product/package/server manifests, gulp, Windows installer, release/build wiring.
4. `004-director-agent-engine.116.patch`: Director agent harness, model/tool bridge, agent engine, language-model/tool service integration, MCP-related agent paths.
5. `005-director-chat-built-in-mode.116.patch`: built-in chat mode, Copilot commercial-flow bypass, chat setup/status/model picker/agent session UI entry points.
6. `006-director-text-polish.116.patch`: narrow copy and prompt polish.
7. `007-director-tool-layer.116.patch`: Director tool registry, mode policy, migration report/test layer, read-only workspace/GitHub context tools.
8. `008-director-chat-editing.116.patch`: Director Chat Editing contract, reviewable text edit progress adapter, internal single-file edit probe, request/session binding tests.
9. `009-director-edit-tools.116.patch`: Director reviewable edit tools: `apply_patch`, `create_file`, `create_directory`, `replace_string_in_file`, `multi_replace_string_in_file`.

Prefer using existing stage ownership for follow-up work. Do not add empty or casual stages.

## Current Feature State

- Phase 2 Wave 1 Plan Mode is complete, replay-backed, packaged, committed, and pushed.
- Phase 2 Wave 2 Provider / Model Registry + UI is implemented, replay-backed, packaged, and ready for commit/push per memory.
- Plan Mode is Director Agent/session state, not a new top-level `ChatModeKind`.
- Plan drafts are written to workspace-local `.director/plans/*.md` by Director-owned host code.
- Plan completion goes through the Plan-only `director_present_plan` tool.
- Provider Registry is the canonical source for provider instances and persists profile data in `directorCodeProviders.json`.
- VS Code `chatLanguageModels.json` is only a projected provider-group bridge.
- Earlier 116 runtime gates are complete and replay-backed: Ask/Edit/Inline mode routing, read-only tool layer, Chat Editing contract, and reviewable edit tools.
- Next planned wave is Phase 2 Wave 3 Claude AgentHost SDK integration, unless the user chooses to run manual Wave 2 API/OAuth smoke first.

## Important 116 Facts

- A prior 116 blank Workbench issue came from an incomplete `defaultChatAgent.provider` override. VS Code 116 reads `defaultChatAgent.provider.enterprise.id`, so Director must preserve the full provider object shape even when disabling provider fields.
- That fix belongs in `003-director-product-build-release.116.patch`, expected product JSON, and `validate-product-overrides.mjs`; do not fix it only in generated `product.json`.
- `%APPDATA%\Director-Code\clp` may need clearing before packaged runtime smoke when cached language-pack/NLS or CLP state interferes with a fresh build.
- Interactive installer/manual smoke is intentionally not run automatically unless the user asks, because it can modify the user's installed app/profile.
- `artifacts/` is untracked by default and should not be committed unless the user explicitly asks for release artifacts to be tracked.

## Build And Package

Preferred build entry points:

```powershell
.\scripts\build-director-116.ps1
```

```cmd
.\scripts\build-director-116.cmd
```

Use `-SkipReplay` only for quick local debugging. Do not use it for release candidate or package acceptance.

## Standing Work Rules

- At the start of each work session, check the current branch and `git status --short`.
- Preserve user changes. Do not revert unrelated dirty work.
- Prefer `rg` / `rg --files` for searches.
- Many project documents contain Chinese text. Read and write Markdown/docs with UTF-8 encoding, and avoid tools or shell defaults that may reinterpret text through a legacy Windows code page.
- Keep final changes replay-backed when they affect Director runtime/product behavior.
- Keep generated-tree experiments temporary unless they are converted back into replay.
- Keep `CLAUDE.md` and `AGENTS.md` identical; put chronological detail in `.claude/memory.md`.
