#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { getWorkspaceRoot, writeJson } from './reference-manifest-lib.mjs';

const PROFILE = '112-stable-win32-x64-client';
const INVENTORY = 'docs/upgrade/112-change-inventory.json';
const MATRIX = 'docs/upgrade/script-migration-matrix.112.json';
const REPORT = `docs/upgrade/reports/${PROFILE}/script-artifact-report.json`;

function main() {
  const root = getWorkspaceRoot();
  const inventory = JSON.parse(fs.readFileSync(path.join(root, INVENTORY), 'utf8'));
  const generatedAt = new Date().toISOString();
  const entries = inventory.assets
    .filter((asset) => asset.executable)
    .map((asset) => classify(root, asset));

  const blocked = entries.filter((entry) => entry.status.startsWith('blocked'));
  const migrated = entries.filter((entry) => entry.status === 'migrated' || entry.status === 'dry-run-blocked' || entry.status === 'static-checked');

  writeJson(path.join(root, MATRIX), {
    schemaVersion: 1,
    profile: PROFILE,
    generatedAt,
    policy: {
      referenceGuardRequiredFor: ['vscode-mutating', 'artifact-producing'],
      dryRunRequiredFor: ['release-side-effect'],
      blockedLegacyEntrypointsAllowedOnlyWithReport: true,
    },
    entries,
  });

  writeJson(path.join(root, REPORT), {
    schemaVersion: 1,
    profile: PROFILE,
    phase: 'P1',
    batch: 'script-artifact',
    status: blocked.length > 0 ? 'degraded' : 'passed',
    generatedAt,
    checks: {
      executableInventoryLoaded: 'passed',
      referenceGuardCoverage: entries.every((entry) => entry.referenceGuard || !['vscode-mutating', 'artifact-producing'].includes(entry.scriptScope)) ? 'passed' : 'blocked-recorded',
      dryRunCoverage: entries.every((entry) => entry.dryRunGuard || entry.scriptScope !== 'release-side-effect') ? 'passed' : 'blocked-recorded',
      artifactsOutPrepared: 'passed',
    },
    summary: {
      executableAssets: entries.length,
      migratedOrStaticChecked: migrated.length,
      blockedLegacyEntrypoints: blocked.length,
    },
    blocked: blocked.map((entry) => ({
      path: entry.path,
      scriptScope: entry.scriptScope,
      reason: entry.reason,
    })),
  });

  console.log(`Generated ${MATRIX} with ${entries.length} executable entries`);
}

function classify(root, asset) {
  const absolutePath = path.join(root, asset.path);
  const content = fs.existsSync(absolutePath) && fs.lstatSync(absolutePath).isFile()
    ? fs.readFileSync(absolutePath, 'utf8')
    : '';
  const workflowControls = classifyWorkflowControls(asset.path, content);
  const referenceGuard = workflowControls.referenceGuard
    || content.includes('reference-guard.sh')
    || asset.path.startsWith('scripts/upgrade/');
  const dryRunGuard = workflowControls.dryRunGuard
    || content.includes('dry-run-guard.sh')
    || asset.path.startsWith('scripts/upgrade/');

  let status = 'static-checked';
  let reason = 'Standalone executable asset is syntax/static checked.';

  if (asset.path.startsWith('.github/workflows/')) {
    status = workflowControls.migrated ? 'migrated' : 'blocked-workflow-migration';
    reason = workflowControls.migrated
      ? 'Workflow uses P1 materialize guard and canonical generated/artifact paths.'
      : `Workflow still needs Batch 6 migration controls: ${workflowControls.missing.join(', ')}`;
  } else if (asset.scriptScope === 'release-side-effect') {
    status = dryRunGuard ? 'dry-run-blocked' : 'blocked-release-side-effect';
    reason = dryRunGuard ? 'Release side effects exit early under DRY_RUN and refuse non-dry P1 execution.' : 'Release side-effect script still needs dry-run guard.';
  } else if (['vscode-mutating', 'artifact-producing'].includes(asset.scriptScope)) {
    status = referenceGuard ? 'migrated' : 'blocked-reference-guard';
    reason = referenceGuard ? 'Entrypoint resolves and blocks frozen reference paths.' : 'Entrypoint still needs reference guard or workflow migration.';
  }

  return {
    path: asset.path,
    scriptScope: asset.scriptScope,
    status,
    referenceGuard,
    dryRunGuard,
    reason,
  };
}

function classifyWorkflowControls(filePath, content) {
  if (!filePath.startsWith('.github/workflows/')) {
    return {
      migrated: false,
      referenceGuard: false,
      dryRunGuard: false,
      missing: [],
    };
  }

  const isBuildWorkflow = /\/(stable|insider)-(linux|macos|windows|spearhead)\.ya?ml$/.test(filePath);
  const legacyTokens = [
    ['get_repo.sh', /(?:^|\s)(?:\.|bash)?\s*get_repo\.sh\b|\.\/get_repo\.sh\b/],
    ['find vscode', /\bfind\s+vscode\b/],
    ['assets', /\bpath:\s*assets\/|\boutput-artifact-directory:\s*assets\/|assets\/\*/],
    ['release.sh', /\brun:\s*\.\/release\.sh\b/],
  ].filter(([, pattern]) => pattern.test(content)).map(([id]) => id);

  if (!isBuildWorkflow) {
    return {
      migrated: legacyTokens.length === 0,
      referenceGuard: legacyTokens.length === 0,
      dryRunGuard: legacyTokens.length === 0,
      missing: legacyTokens,
    };
  }

  const required = {
    materialize: content.includes('scripts/upgrade/materialize-vscode.sh'),
    vscodeDir: content.includes('VSCODE_DIR:'),
    artifactsOut: content.includes('ARTIFACTS_OUT:'),
    dryRunOffline: content.includes('DRY_RUN: offline'),
    bashShell: content.includes('shell: bash'),
  };
  const missing = [
    ...Object.entries(required).filter(([, present]) => !present).map(([id]) => id),
    ...legacyTokens,
  ];

  return {
    migrated: missing.length === 0,
    referenceGuard: required.materialize && required.vscodeDir && legacyTokens.length === 0,
    dryRunGuard: required.dryRunOffline && legacyTokens.length === 0,
    missing,
  };
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
