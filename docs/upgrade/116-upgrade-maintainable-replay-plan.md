# P2: 116 Upgrade And Maintainable Replay Plan

Date: 2026-05-12

Phase: P2

Active profile: `116-stable-win32-x64-client`

## Summary

VS Code/VSCodium 116 and later releases no longer use a physical reference directory. The source of truth is the replay output produced from clean upstream inputs, Director semantic patches, expected contract files, and a canonical generated manifest.

The 112 baseline remains as a legacy proof that the replay directory structure is valid. It is not the model for future physical-reference verification.

Default versions:

- VS Code: `1.116.0`
- VSCodium: `1.116.02821`
- Director-Code: `1.116.0`
- `BUILD_SOURCEVERSION`: derived from the VSCodium release version
- Default chat agent: `director-code.agent`
- Default chat extension id: empty string

## Key Architecture Changes

- Add `docs/upgrade/profiles/index.json` with one `activeProfile`. Avoid storing `active` inside individual profiles so multiple active profiles cannot drift.
- Extend profile validation to require explicit replay, report, allowlist, product override, owned product key, and canonical manifest paths for canonical replay profiles.
- Use canonical manifests for 116 and later:
  - First generation must be explicit.
  - Normal validation reads the canonical manifest and must not rewrite it.
  - The manifest records replayed Director tree paths, hashes, modes, symlinks, and case-collision state.
- Keep 112 reference manifest and reference overlays only for legacy validation.
- Make patch series profile-specific. A series must not require every patch-like file under `patches/`, because 112 and 116 patch files will coexist.

## Implementation Changes

- Parameterize upgrade tooling so `materialize`, `generate-series`, `generate-vscodium-layer`, `validate-*`, `check-workflows`, and `generate-change-inventory` read profile/index data instead of hardcoding 112.
- Rebuild the VSCodium layer generator around source mutations from `prepare_vscode.sh`: stable source overlay, license copy, Copilot extension removal, product JSON setpath/merge, placeholder expansion, VSCodium patches, package/server manifest edits, announcements, telemetry cleanup, and Electron copyright text.
- Skip dependency install and build in source replay, but keep a prepare parity report so upstream source mutation changes are detected.
- Prevent `.bak`, probe, cache, and prepare temporary files from entering patches, expected files, reports, or manifests.
- Replace implicit full `product.json` merge with a declarative Director product override and an owned-key allowlist. Unowned product fields follow upstream.
- Split Director 116 delta into ordered semantic groups: branding, product/build release, agent engine, chat built-in mode, and text polish.

## Runtime Porting Rules

- Keep Director `agentEngine` and wire it into the 116 chat contribution entry points.
- In Director built-in mode, bypass Copilot install, setup, sign-in, quota, upgrade, TOS, and growth UI paths.
- Reuse neutral upstream 116 implementations such as `ModelsManagementEditor`.
- Replace all `copilot-fast` fallback selections that support Director-owned UI behavior, including thinking title and editing explanation generation, with Director auxiliary model selection.
- Keep the 116 Agent Host subsystem. Guard user-visible Copilot commercial flows only.
- Drop the old `outputMonitor` fallback model patch because 116 moved that logic upstream.
- Keep only required terminal/config/search/prompt validator branding changes.

## Test Plan

- Clean VS Code 116 can generate the VSCodium 116 layer.
- VSCodium 116 can generate the Director 116 layer.
- The 116 patch series applies in order with `git apply --check`.
- Product/package/server manifest/announcement expected files strictly match generated Director output.
- Director output strictly matches the 116 canonical manifest.
- The final tree contains no untracked `.bak`, probe, cache, or temporary prepare files.
- Series validation is profile-scoped and does not mix 112 and 116 patch files.
- Product overrides only touch owned keys.
- Prepare parity report proves covered VSCodium source mutations.
- Chat setup does not install Copilot, model picker shows settings/configure instead of upgrade, and thinking/editing explanation generation no longer depends on `copilot-fast`.
- Agent engine, chat model picker, terminal tests, and at least one TypeScript compile/build smoke are run or explicitly reported as blocked.

## Post-Implementation Findings

- Runtime blank UI was caused by an incomplete Director `defaultChatAgent.provider` override. VS Code 116 reads `defaultChatAgent.provider.enterprise.id` during workbench startup, so Director product overrides must keep the full provider object shape even when provider ids are intentionally empty.
- `validate-product-overrides.mjs` must validate the semantic `defaultChatAgent` contract, not only JSON shape, so future upstream product contract expansion fails before runtime.
- On this Windows environment, Inno Setup 6.4.1 can fail at final `SetupIconFile` resource update with `EndUpdateResource failed (5)`. The build keeps the installer icon by pre-patching Inno's `SetupLdr.e32` with `rcedit`, then passing `SkipSetupIconFile=true` so `code.iss` avoids the failing final icon update path.
- The repeatable build entry point is `scripts/build-director-116.cmd` or `scripts/build-director-116.ps1`. By default it materializes the Director source from the active 116 replay profile, installs dependencies only when needed, runs compile/core/minified build tasks, builds both installers, copies them to `artifacts/out/stable/win32-x64`, and prints SHA-256 hashes.
- Director settings UI code was present, but some 116 chat entry points opened `defaultChatAgent.manageSettingsUrl` as a plain URI. Because Director uses `command:director-code.openSettings`, those entries must pass `{ allowCommands: true }`. The command title is `Director Code: Open Settings` and is also exposed under the Preferences menu.
- Tool count parity with official VS Code is not expected while Director remains based on the VSCodium layer. VS Code 1.116.0 contributes 37 tools from `extensions/copilot/package.json`; VSCodium 1.116.02821 removes `extensions/copilot` via `patches/51-ext-copilot-remove-it.patch`, and the Director layer intentionally inherits that removal. Director should still wait for delayed built-in/native tool registrations before snapshotting tools for an agent request.

## Assumptions

- Future upgrades will not have physical reference directories.
- Correctness for 116 and later comes from repeatable replay, expected contracts, targeted tests, and compile/build smoke.
- 112 reference/equivalence remains available only as a legacy regression check.
- Maintainability and upstream decoupling take priority over quickest manual conflict resolution.
