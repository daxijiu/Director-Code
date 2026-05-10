#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { getWorkspaceRoot, run, toPosix } from './reference-manifest-lib.mjs';

const SERIES = 'patches/series.112.json';
const SCHEMA = 'docs/upgrade/schemas/series.schema.json';
const STATUSES = new Set(['enabled', 'disabled', 'deferred', 'archived']);

function main() {
  const root = getWorkspaceRoot();
  run('node', ['scripts/upgrade/validate-json.mjs', SCHEMA, SERIES], { cwd: root });
  const series = JSON.parse(fs.readFileSync(path.join(root, SERIES), 'utf8'));
  const expected = listPatchFiles(path.join(root, 'patches')).map((filePath) => toPosix(path.relative(root, filePath))).sort();
  const actual = series.patches.map((entry) => entry.path).sort();
  const failures = [];

  for (const filePath of expected) {
    if (!actual.includes(filePath)) failures.push(`Patch-like file missing from series: ${filePath}`);
  }
  for (const filePath of actual) {
    if (!expected.includes(filePath)) failures.push(`Series references missing patch-like file: ${filePath}`);
  }

  const orders = new Map();
  for (const entry of series.patches) {
    for (const key of ['path', 'sha256', 'enabled', 'status', 'layer', 'stage', 'platforms', 'arches', 'qualities', 'targets', 'order', 'placeholders']) {
      if (!(key in entry)) failures.push(`${entry.path || '(unknown)'} missing ${key}`);
    }
    if (!STATUSES.has(entry.status)) failures.push(`${entry.path}: invalid status ${entry.status}`);
    if (entry.enabled !== (entry.status === 'enabled')) failures.push(`${entry.path}: enabled must match status=enabled`);
    if (orders.has(entry.order)) failures.push(`Duplicate patch order ${entry.order}: ${orders.get(entry.order)} and ${entry.path}`);
    orders.set(entry.order, entry.path);
  }

  if (failures.length > 0) {
    throw new Error(`Series validation failed\n${failures.slice(0, 100).join('\n')}`);
  }

  console.log(`validated patch series ${SERIES}`);
}

function listPatchFiles(root) {
  const out = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === 'series.112.json') continue;
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...listPatchFiles(absolute));
    else if (/\.patch(\.yet|\.no)?$/i.test(entry.name)) out.push(absolute);
  }
  return out;
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
