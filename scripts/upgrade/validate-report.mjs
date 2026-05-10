#!/usr/bin/env node
import { run } from './reference-manifest-lib.mjs';

const SCHEMA = 'docs/upgrade/schemas/report.schema.json';
const reports = [
  'docs/upgrade/reports/112-stable-win32-x64-client/freeze-report.json',
  'docs/upgrade/reports/112-stable-win32-x64-client/schema-inventory-report.json',
  'docs/upgrade/reports/112-stable-win32-x64-client/vscodium-layer-report.json',
  'docs/upgrade/reports/112-stable-win32-x64-client/materialize-report.json',
  'docs/upgrade/reports/112-stable-win32-x64-client/replay-equivalence-report.json',
];

function main() {
  for (const report of reports) {
    run('node', ['scripts/upgrade/validate-json.mjs', SCHEMA, report]);
  }
  console.log(`validated ${reports.length} reports`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
