#!/usr/bin/env node
import fs from 'node:fs';
import { run, toPosix } from './reference-manifest-lib.mjs';

const INVENTORY = 'docs/upgrade/112-change-inventory.json';
const SCHEMA = 'docs/upgrade/schemas/change-inventory.schema.json';
const REPORT = 'docs/upgrade/reports/112-stable-win32-x64-client/schema-inventory-report.json';
const FIXED_GENERATED_PATHS = [
  INVENTORY,
  'docs/upgrade/script-migration-matrix.112.json',
  REPORT,
  'docs/upgrade/reports/112-stable-win32-x64-client/script-artifact-report.json',
];
const SOURCE_CLASSES = new Set(['upstream-vscode', 'vscodium-derived', 'director-owned', 'local-build-fix', 'generated-artifact', 'reference-only']);
const EQUIVALENCE_SCOPES = new Set(['p1-strict', 'defer-non-p1', 'discard']);
const SCRIPT_SCOPES = new Set(['vscode-mutating', 'artifact-producing', 'release-side-effect', 'standalone-tool', 'docs-only']);

function main() {
  run('node', ['scripts/upgrade/validate-json.mjs', SCHEMA, INVENTORY]);
  const inventory = JSON.parse(fs.readFileSync(INVENTORY, 'utf8'));
  const assetsByPath = new Map(inventory.assets.map((asset) => [asset.path, asset]));
  const expectedPaths = collectExpectedPaths();
  const failures = [];

  for (const expectedPath of expectedPaths) {
    if (!assetsByPath.has(expectedPath)) {
      failures.push(`Missing inventory asset: ${expectedPath}`);
    }
  }

  for (const asset of inventory.assets) {
    if (asset.sourceClass === 'unknown' || !SOURCE_CLASSES.has(asset.sourceClass)) {
      failures.push(`${asset.path}: invalid sourceClass ${asset.sourceClass}`);
    }
    if (asset.equivalenceScope === 'unclassified' || !EQUIVALENCE_SCOPES.has(asset.equivalenceScope)) {
      failures.push(`${asset.path}: invalid equivalenceScope ${asset.equivalenceScope}`);
    }
    if (asset.executable && !SCRIPT_SCOPES.has(asset.scriptScope)) {
      failures.push(`${asset.path}: executable asset missing valid scriptScope`);
    }
  }

  const claudeSettings = assetsByPath.get('.claude/settings.local.json');
  if (!claudeSettings || !['discard', 'reference-only', 'legacy-doc'].includes(claudeSettings.disposition)) {
    failures.push('.claude/settings.local.json must be discard or reference-only/legacy');
  }
  if (claudeSettings && claudeSettings.equivalenceScope !== 'discard') {
    failures.push('.claude/settings.local.json must not be active equivalence scope');
  }

  if (failures.length > 0) {
    throw new Error(`Change inventory validation failed\n${failures.slice(0, 100).join('\n')}`);
  }

  console.log(`validated change inventory ${INVENTORY}`);
}

function collectExpectedPaths() {
  const output = run('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z']);
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

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
