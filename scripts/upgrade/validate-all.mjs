#!/usr/bin/env node
import { run } from './reference-manifest-lib.mjs';

const mode = process.argv.includes('--legacy')
  ? 'legacy'
  : process.argv.includes('--all-profiles')
    ? 'all-profiles'
    : 'active';

const activeValidations = [
  ['node', ['scripts/upgrade/validate-profile.mjs']],
  ['node', ['scripts/upgrade/validate-series.mjs']],
  ['node', ['scripts/upgrade/validate-product-overrides.mjs']],
  ['node', ['scripts/upgrade/validate-json.mjs', 'docs/upgrade/schemas/deps-source-mutation-allowlist.schema.json', 'docs/upgrade/deps-source-mutation-allowlist.116.json']],
  ['node', ['scripts/upgrade/validate-json.mjs', 'docs/upgrade/schemas/report.schema.json', 'docs/upgrade/reports/116-stable-win32-x64-client/upgrade-estimator-report.json']],
  ['node', ['scripts/upgrade/validate-json.mjs', 'docs/upgrade/schemas/report.schema.json', 'docs/upgrade/reports/116-stable-win32-x64-client/vscodium-layer-report.json']],
  ['node', ['scripts/upgrade/validate-json.mjs', 'docs/upgrade/schemas/report.schema.json', 'docs/upgrade/reports/116-stable-win32-x64-client/prepare-parity-report.json']],
  ['node', ['scripts/upgrade/validate-json.mjs', 'docs/upgrade/schemas/report.schema.json', 'docs/upgrade/reports/116-stable-win32-x64-client/materialize-report.json']],
  ['node', ['scripts/upgrade/expected-contracts.mjs']],
  ['node', ['scripts/upgrade/canonical-manifest.mjs']],
  ['node', ['scripts/upgrade/validate-json.mjs', 'docs/upgrade/schemas/report.schema.json', 'docs/upgrade/reports/116-stable-win32-x64-client/expected-contracts-report.json']],
];

const allProfileValidations = [
  ['node', ['scripts/upgrade/validate-profile.mjs', '--all-profiles']],
  ...activeValidations.slice(1),
];

const legacyValidations = [
  ['node', ['scripts/upgrade/validate-profile.mjs', '--profile', '112-stable-win32-x64-client']],
  ['node', ['scripts/upgrade/validate-reference-manifest.mjs']],
  ['node', ['scripts/upgrade/validate-series.mjs', '--profile', '112-stable-win32-x64-client']],
  ['node', ['scripts/upgrade/check-script-matrix.mjs']],
  ['node', ['scripts/upgrade/validate-json.mjs', 'docs/upgrade/schemas/deps-source-mutation-allowlist.schema.json', 'docs/upgrade/deps-source-mutation-allowlist.112.json']],
  ['node', ['scripts/upgrade/validate-report.mjs']],
];

const validations = mode === 'legacy'
  ? legacyValidations
  : mode === 'all-profiles'
    ? allProfileValidations
    : activeValidations;

try {
  for (const [command, args] of validations) {
    run(command, args);
  }
  console.log(`${mode} upgrade validators passed`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
