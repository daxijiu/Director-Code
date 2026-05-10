#!/usr/bin/env node
import fs from 'node:fs';
import { run } from './reference-manifest-lib.mjs';

const MANIFEST = 'docs/upgrade/112-reference-manifest.json';
const SCHEMA = 'docs/upgrade/schemas/reference-manifest.schema.json';
const SOURCE_CLASSES = new Set(['upstream-vscode', 'vscodium-derived', 'director-owned', 'local-build-fix', 'generated-artifact', 'reference-only']);
const EQUIVALENCE_SCOPES = new Set(['p1-strict', 'defer-non-p1', 'discard']);

function main() {
  run('node', ['scripts/upgrade/validate-json.mjs', SCHEMA, MANIFEST]);
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const failures = [];

  for (const [index, file] of manifest.files.entries()) {
    if (!file.path || !file.rawSha256 || !file.normalizedSha256 || !file.mode) {
      failures.push(`files[${index}] missing path/hash/mode`);
    }
    if (!SOURCE_CLASSES.has(file.sourceClass)) {
      failures.push(`${file.path}: bad sourceClass ${file.sourceClass}`);
    }
    if (!EQUIVALENCE_SCOPES.has(file.equivalenceScope)) {
      failures.push(`${file.path}: bad equivalenceScope ${file.equivalenceScope}`);
    }
  }

  for (const [index, file] of manifest.deleted.entries()) {
    if (!file.path) {
      failures.push(`deleted[${index}] missing path`);
    }
    if (!SOURCE_CLASSES.has(file.sourceClass)) {
      failures.push(`${file.path}: bad sourceClass ${file.sourceClass}`);
    }
    if (!EQUIVALENCE_SCOPES.has(file.equivalenceScope)) {
      failures.push(`${file.path}: bad equivalenceScope ${file.equivalenceScope}`);
    }
  }

  if (manifest.caseInsensitivePathCollisions?.length) {
    failures.push('caseInsensitivePathCollisions must be empty');
  }
  if (manifest.referenceRoot !== 'vscode') {
    failures.push('referenceRoot must be vscode');
  }

  if (failures.length > 0) {
    throw new Error(`Reference manifest semantic validation failed\n${failures.slice(0, 50).join('\n')}`);
  }

  console.log(`validated reference manifest ${MANIFEST}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
