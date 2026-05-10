#!/usr/bin/env node
import fs from 'node:fs';

const MATRIX = 'docs/upgrade/script-migration-matrix.112.json';
const VALID_STATUSES = new Set([
  'migrated',
  'dry-run-blocked',
  'static-checked',
  'blocked-workflow-migration',
  'blocked-reference-guard',
  'blocked-release-side-effect',
]);

try {
  const matrix = JSON.parse(fs.readFileSync(MATRIX, 'utf8'));
  const failures = [];
  for (const entry of matrix.entries) {
    if (!VALID_STATUSES.has(entry.status)) {
      failures.push(`${entry.path}: invalid status ${entry.status}`);
    }
    if (['vscode-mutating', 'artifact-producing'].includes(entry.scriptScope) && !entry.referenceGuard && entry.status !== 'blocked-workflow-migration') {
      failures.push(`${entry.path}: missing reference guard and not recorded as workflow blocker`);
    }
    if (entry.scriptScope === 'release-side-effect' && !entry.dryRunGuard) {
      failures.push(`${entry.path}: missing dry-run guard`);
    }
  }
  if (failures.length > 0) {
    throw new Error(`Script matrix check failed\n${failures.slice(0, 100).join('\n')}`);
  }
  console.log(`validated script matrix ${MATRIX}`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
