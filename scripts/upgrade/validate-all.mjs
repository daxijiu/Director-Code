#!/usr/bin/env node
import { run } from './reference-manifest-lib.mjs';

const validations = [
  ['node', ['scripts/upgrade/validate-profile.mjs']],
  ['node', ['scripts/upgrade/validate-reference-manifest.mjs']],
  ['node', ['scripts/upgrade/validate-change-inventory.mjs']],
  ['node', ['scripts/upgrade/validate-series.mjs']],
  ['node', ['scripts/upgrade/validate-json.mjs', 'docs/upgrade/schemas/deps-source-mutation-allowlist.schema.json', 'docs/upgrade/deps-source-mutation-allowlist.112.json']],
  ['node', ['scripts/upgrade/validate-report.mjs']],
];

try {
  for (const [command, args] of validations) {
    run(command, args);
  }
  console.log('all upgrade JSON validators passed');
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
