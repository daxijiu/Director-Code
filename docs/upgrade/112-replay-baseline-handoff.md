# 112 Replay Baseline Handoff

This handoff is for the next agent/operator taking over P1 on branch
`refactor/112-replay-baseline`.

## Current State

- Work only on `refactor/112-replay-baseline`. Do not modify `master`.
- P1 scope is `stable / win32 / x64 / client`.
- Do not start P2/P3 upgrade work.
- The old `vscode/` active source has been removed from tracking. If a local
  `vscode/` directory exists, treat it as a read-only reference snapshot.
- The pushed implementation commit before this handoff is:
  `53878e50 Apply P1 replay layers and equivalence`.
- P1 source replay currently passes strict equivalence:
  `10039` expected reference files, `0` missing, `0` changed, `0` extra.

## Important Files

- Plan: `docs/upgrade/112-replay-baseline-plan.md`
- Profile: `docs/upgrade/profiles/112-stable-win32-x64-client.json`
- Frozen manifest: `docs/upgrade/112-reference-manifest.json`
- Reference overlays: `docs/upgrade/reference-overlays.112.json`
- VSCodium aggregate patch: `patches/replay/001-vscodium-layer.112.patch`
- Director aggregate delta: `patches/replay/002-director-delta.112.patch`
- Patch series: `patches/series.112.json`
- Materialize script: `scripts/upgrade/materialize-vscode.sh`
- Main implementation: `scripts/upgrade/materialize-vscode.mjs`
- Committed reports:
  `docs/upgrade/reports/112-stable-win32-x64-client/`

## What Changed In The Last P1 Batch

The current replay path is:

1. Copy clean VS Code `1.112.0` into `vscode.generated/layers/vscode/vscode`.
2. Apply `patches/replay/001-vscodium-layer.112.patch` to create the VSCodium layer.
3. Apply `patches/replay/002-director-delta.112.patch` to create the Director layer.
4. Restore `72` raw-sensitive files from `docs/upgrade/reference-overlays.112.json`.
5. Compare the generated Director tree against `docs/upgrade/112-reference-manifest.json`.

The overlay manifest exists for two reasons:

- `cli/vscode-openssl-prebuilt-0.0.11.tgz` is a 71 MB reference binary and is
  deliberately kept out of the Director delta patch.
- `71` text files have mixed/raw line endings in the frozen reference. Git patch
  application normalizes them, so materialize restores exact reference bytes at
  the end before raw hash equivalence.

## Fresh Checkout Verification

Use a full clone, not a shallow clone, because `reference-overlays.112.json` can
restore overlay bytes from historical commit `6ff8ee0581d938f458c2af0b6b902adc554db4fd`
when local `vscode/` is absent.

```bash
git clone --branch refactor/112-replay-baseline https://github.com/daxijiu/Director-Code.git Director-Code-112-check
cd Director-Code-112-check
git status --short --branch
node scripts/upgrade/validate-all.mjs
bash scripts/upgrade/materialize-vscode.sh --profile docs/upgrade/profiles/112-stable-win32-x64-client.json --target vscode.generated --up-to-layer director --force
```

Expected result:

- `validate-all.mjs` prints `all upgrade JSON validators passed`.
- `materialize-vscode.sh` exits `0`.
- `docs/upgrade/reports/112-stable-win32-x64-client/materialize-report.json`
  has `status: "passed"`.
- Its `checks.sourceEquivalence` is `passed`.
- Its `equivalence` block has `expectedFiles: 10039`, `missingCount: 0`,
  `changedCount: 0`, and `extraCount: 0`.

If the clone is shallow and overlay restore fails, run:

```bash
git fetch --unshallow
```

then rerun the materialize command.

## Local Reference Verification

`--verify-reference` and `check-reference-drift.mjs` require a physical local
`vscode/` reference directory. A fresh checkout normally does not have that
directory because `vscode/` is ignored and no longer tracked.

Use this stricter mode only in a workspace where the frozen local reference is
present:

```bash
node scripts/upgrade/check-reference-drift.mjs
bash scripts/upgrade/materialize-vscode.sh --profile docs/upgrade/profiles/112-stable-win32-x64-client.json --target vscode.generated --up-to-layer director --force --verify-reference
```

Expected result:

- Reference drift check passes by content.
- Materialize passes with `referenceOverlayApplication: "passed"` and
  `sourceEquivalence: "passed"`.

## Validation Checklist For Future Batches

Run these before committing P1 follow-up work:

```bash
node scripts/upgrade/validate-all.mjs
node scripts/upgrade/check-reference-drift.mjs
bash scripts/upgrade/materialize-vscode.sh --profile docs/upgrade/profiles/112-stable-win32-x64-client.json --target vscode.generated --up-to-layer director --force --verify-reference
git diff --check
```

If the workspace does not have local `vscode/`, skip `check-reference-drift.mjs`
and omit `--verify-reference`; rely on full-clone overlay restore plus the
materialize report's source equivalence result.

## Boundaries And Gotchas

- Do not write into `vscode/`. It is reference-only.
- Do not use old root-level build/prepare scripts against `vscode/`.
- Use `vscode.generated/` as the generated workspace.
- `patches/replay/*.patch` is marked binary in `.gitattributes` on purpose.
  These files are aggregate replay payloads and contain upstream whitespace that
  must not be cleaned.
- `scripts/upgrade/check-workflows.mjs` and materialize commands may refresh
  committed report timestamps. If a report is refreshed, inspect the diff and
  commit it only when it represents the batch being recorded.
- `--install-deps` and `--build-artifact` are still not executed by the current
  source-equivalence batch. They are recorded as later P1 build/artifact work,
  not as P2/P3 upgrade work.

## Current Reports To Trust

All reports in `docs/upgrade/reports/112-stable-win32-x64-client/` are currently
`passed`:

- `freeze-report.json`
- `schema-inventory-report.json`
- `vscodium-layer-report.json`
- `materialize-report.json`
- `replay-equivalence-report.json`
- `script-artifact-report.json`
- `workflow-docs-report.json`

The most important proof is `replay-equivalence-report.json`:

- `aggregateReplayPatches: "passed"`
- `referenceOverlayApplication: "passed"`
- `sourceEquivalence: "passed"`
- `restoredCount: 72`
- `expectedFiles: 10039`
- `changedCount: 0`
- `missingCount: 0`
- `extraCount: 0`
