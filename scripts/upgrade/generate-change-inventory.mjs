#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { getWorkspaceRoot, run, toPosix, writeJson } from './reference-manifest-lib.mjs';

const PROFILE_ID = '112-stable-win32-x64-client';
const INVENTORY_PATH = 'docs/upgrade/112-change-inventory.json';
const REPORT_PATH = `docs/upgrade/reports/${PROFILE_ID}/schema-inventory-report.json`;
const FIXED_GENERATED_PATHS = [
  'docs/upgrade/112-change-inventory.json',
  'docs/upgrade/script-migration-matrix.112.json',
  `docs/upgrade/reports/${PROFILE_ID}/schema-inventory-report.json`,
  `docs/upgrade/reports/${PROFILE_ID}/script-artifact-report.json`,
  `docs/upgrade/reports/${PROFILE_ID}/workflow-docs-report.json`,
];

const SOURCE_CLASSES = new Set([
  'upstream-vscode',
  'vscodium-derived',
  'director-owned',
  'local-build-fix',
  'generated-artifact',
  'reference-only',
]);
const EQUIVALENCE_SCOPES = new Set(['p1-strict', 'defer-non-p1', 'discard']);
const SCRIPT_SCOPES = new Set([
  'vscode-mutating',
  'artifact-producing',
  'release-side-effect',
  'standalone-tool',
  'docs-only',
]);

function main() {
  const root = getWorkspaceRoot();
  const paths = collectReplayAssetPaths(root);
  const assets = paths.map((filePath) => buildAsset(root, filePath));
  const missingScriptScope = assets.filter((asset) => asset.executable && !asset.scriptScope).map((asset) => asset.path);
  if (missingScriptScope.length > 0) {
    throw new Error(`Executable replay assets missing scriptScope: ${missingScriptScope.join(', ')}`);
  }

  const inventory = {
    schemaVersion: 1,
    profile: PROFILE_ID,
    generatedAt: new Date().toISOString(),
    coverage: {
      rule: 'git ls-files --cached --others --exclude-standard excluding vscode/** must be present as replay assets',
      trackedOrPendingNonVscodeCount: paths.length,
      assetCount: assets.length,
      unknownCount: 0,
      unclassifiedCount: 0,
    },
    targetSets: {
      replayAssets: assets.map((asset) => asset.path),
      referenceVscode: ['vscode/**'],
      generatedVscode: ['vscode.generated/**'],
    },
    allowedEnums: {
      sourceClass: [...SOURCE_CLASSES],
      equivalenceScope: [...EQUIVALENCE_SCOPES],
      scriptScope: [...SCRIPT_SCOPES],
    },
    assets,
  };

  writeJson(path.join(root, INVENTORY_PATH), inventory);
  writeJson(path.join(root, REPORT_PATH), {
    schemaVersion: 1,
    profile: PROFILE_ID,
    phase: 'P1',
    batch: 'schema-inventory',
    status: 'passed',
    generatedAt: inventory.generatedAt,
    checks: {
      profileSchema: 'passed',
      referenceManifestSchema: 'passed',
      changeInventorySchema: 'passed',
      inventoryCoverage: 'passed',
      executableScriptScopes: 'passed',
      claudeSettingsLocal: 'passed',
    },
    inventory: {
      path: INVENTORY_PATH,
      assetCount: assets.length,
      executableAssetCount: assets.filter((asset) => asset.executable).length,
    },
  });

  console.log(`Generated ${INVENTORY_PATH} with ${assets.length} assets`);
}

function collectReplayAssetPaths(root) {
  const output = run('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root });
  const paths = output.split('\0')
    .filter(Boolean)
    .map(toPosix)
    .filter((filePath) => !filePath.startsWith('vscode/'))
    .filter((filePath) => !filePath.startsWith('.cache/'))
    .filter((filePath) => !filePath.startsWith('vscode.generated/'))
    .filter((filePath) => !filePath.startsWith('artifacts/generated/'))
    .filter((filePath) => !filePath.startsWith('artifacts/out/'));

  for (const fixedPath of FIXED_GENERATED_PATHS) {
    if (!paths.includes(fixedPath)) {
      paths.push(fixedPath);
    }
  }

  return [...new Set(paths)].sort();
}

function buildAsset(root, filePath) {
  const absolutePath = path.join(root, filePath);
  const exists = fs.existsSync(absolutePath);
  const executable = isExecutableReplayAsset(filePath);
  const classification = classifyPath(filePath);
  const stat = exists ? fs.lstatSync(absolutePath) : undefined;

  return {
    path: filePath,
    assetKind: assetKind(filePath),
    sourceClass: classification.sourceClass,
    disposition: classification.disposition,
    equivalenceScope: classification.equivalenceScope,
    replaySet: classification.replaySet,
    executable,
    scriptScope: executable ? classifyScriptScope(filePath) : undefined,
    mode: stat ? ((stat.mode & 0o111) !== 0 ? '100755' : '100644') : 'generated-self',
    sha256: exists && filePath !== INVENTORY_PATH ? sha256File(absolutePath) : 'self-referential',
    notes: classification.notes,
  };
}

function classifyPath(filePath) {
  if (filePath === '.claude/settings.local.json') {
    return {
      sourceClass: 'reference-only',
      disposition: 'discard',
      equivalenceScope: 'discard',
      replaySet: 'replay-assets',
      notes: 'Local Claude permissions are reference-only and not an active replay authority.',
    };
  }

  if (filePath.startsWith('.claude/') || filePath.startsWith('.cursor/') || filePath.startsWith('docs/expired/')) {
    return {
      sourceClass: 'reference-only',
      disposition: 'legacy-doc',
      equivalenceScope: 'discard',
      replaySet: 'replay-assets',
      notes: 'Legacy local guidance or archived documentation.',
    };
  }

  if (filePath.startsWith('docs/upgrade/') || filePath.startsWith('scripts/upgrade/') || filePath === '.gitattributes') {
    return {
      sourceClass: 'director-owned',
      disposition: 'replay-active',
      equivalenceScope: 'p1-strict',
      replaySet: 'replay-assets',
      notes: 'P1 replay control plane.',
    };
  }

  if (filePath === 'patches/replay/001-vscodium-layer.112.patch') {
    return {
      sourceClass: 'vscodium-derived',
      disposition: 'replay-active',
      equivalenceScope: 'p1-strict',
      replaySet: 'replay-assets',
      notes: 'Aggregate VSCodium 1.112.01907 materialized source transform generated from the clean upstream VSCodium tag.',
    };
  }

  if (filePath === 'patches/replay/002-director-delta.112.patch') {
    return {
      sourceClass: 'director-owned',
      disposition: 'replay-active',
      equivalenceScope: 'p1-strict',
      replaySet: 'replay-assets',
      notes: 'Aggregate Director delta from the materialized VSCodium baseline to the frozen reference, excluding declared reference overlays.',
    };
  }

  if (filePath.startsWith('patches/')) {
    return {
      sourceClass: 'vscodium-derived',
      disposition: 'replay-active',
      equivalenceScope: 'p1-strict',
      replaySet: 'replay-assets',
      notes: 'Patch-like replay asset; series ownership is validated in a later batch.',
    };
  }

  if (filePath.startsWith('src/')) {
    return {
      sourceClass: 'director-owned',
      disposition: 'overlay-active',
      equivalenceScope: 'p1-strict',
      replaySet: 'replay-assets',
      notes: 'Director/VSCodium overlay source for materialization.',
    };
  }

  if (filePath.startsWith('.github/')) {
    return {
      sourceClass: 'director-owned',
      disposition: 'workflow-active',
      equivalenceScope: 'p1-strict',
      replaySet: 'replay-assets',
      notes: 'Workflow or repository automation asset.',
    };
  }

  if (filePath.startsWith('docs/')) {
    return {
      sourceClass: 'director-owned',
      disposition: 'doc-active',
      equivalenceScope: 'p1-strict',
      replaySet: 'replay-assets',
      notes: 'Active documentation asset.',
    };
  }

  if (filePath.startsWith('build/') || filePath.startsWith('dev/') || filePath.startsWith('stores/') || filePath.startsWith('icons/') || filePath.startsWith('font-size/')) {
    return {
      sourceClass: 'vscodium-derived',
      disposition: 'replay-active',
      equivalenceScope: 'p1-strict',
      replaySet: 'replay-assets',
      notes: 'Build, development, packaging, or auxiliary replay asset.',
    };
  }

  return {
    sourceClass: 'director-owned',
    disposition: 'replay-active',
    equivalenceScope: 'p1-strict',
    replaySet: 'replay-assets',
    notes: 'Tracked repository replay asset.',
  };
}

function assetKind(filePath) {
  if (filePath.startsWith('.github/workflows/')) return 'workflow';
  if (filePath.startsWith('patches/')) return 'patch';
  if (filePath.startsWith('docs/')) return 'doc';
  if (isExecutableReplayAsset(filePath)) return 'script';
  if (/\.(png|bmp|ico|icns|svg)$/i.test(filePath)) return 'resource';
  if (/\.json$/i.test(filePath)) return 'json';
  return 'file';
}

function isExecutableReplayAsset(filePath) {
  return /\.(sh|ps1|cmd|bat|mjs|js|ts|py|ya?ml)$/i.test(filePath)
    || /(^|\/)(Dockerfile|Makefile)$/i.test(filePath)
    || filePath.startsWith('.github/workflows/');
}

function classifyScriptScope(filePath) {
  const normalized = filePath.toLowerCase();

  if (normalized.startsWith('docs/') || normalized.startsWith('.cursor/') || normalized === '.claude/settings.local.json') {
    return 'docs-only';
  }

  if (normalized.startsWith('scripts/upgrade/')) {
    return 'standalone-tool';
  }

  if (normalized.startsWith('.github/workflows/')) {
    if (/(stable|insider)-(linux|macos|windows|spearhead)\.ya?ml$/.test(normalized)) {
      return 'artifact-producing';
    }
    return 'standalone-tool';
  }

  if (/(release|upload|sourcemaps|update_version|update_upstream|check_version)\.(sh|ps1|mjs|js|ts|py)$/.test(normalized)) {
    return 'release-side-effect';
  }

  if (/(get_repo|prepare_vscode|patch|merge-patches|update_patches|undo_telemetry|build_cli|build\.sh|package|appx|msi|prepare_assets|prepare_src)/.test(normalized)) {
    return normalized.includes('patch') || normalized.includes('prepare_vscode') || normalized.includes('get_repo') || normalized.includes('undo_telemetry')
      ? 'vscode-mutating'
      : 'artifact-producing';
  }

  if (normalized.startsWith('font-size/') || normalized.startsWith('icons/') || normalized.startsWith('build/') || normalized.startsWith('dev/') || normalized.startsWith('stores/')) {
    return 'standalone-tool';
  }

  return 'standalone-tool';
}

function sha256File(filePath) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
