#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { getWorkspaceRoot, run } from './reference-manifest-lib.mjs';

const PROFILE_INDEX = 'docs/upgrade/profiles/index.json';
const DEPS_ALLOWLIST_SCHEMA = 'docs/upgrade/schemas/deps-source-mutation-allowlist.schema.json';
const REPORT_SCHEMA = 'docs/upgrade/schemas/report.schema.json';
const LEGACY_112_PROFILE = '112-stable-win32-x64-client';

const legacyValidations = [
  ['node', ['scripts/upgrade/validate-profile.mjs', '--profile', LEGACY_112_PROFILE]],
  ['node', ['scripts/upgrade/validate-reference-manifest.mjs']],
  ['node', ['scripts/upgrade/validate-series.mjs', '--profile', LEGACY_112_PROFILE]],
  ['node', ['scripts/upgrade/check-script-matrix.mjs']],
  ['node', ['scripts/upgrade/validate-json.mjs', 'docs/upgrade/schemas/deps-source-mutation-allowlist.schema.json', 'docs/upgrade/deps-source-mutation-allowlist.112.json']],
  ['node', ['scripts/upgrade/validate-report.mjs']],
];

try {
  const root = getWorkspaceRoot();
  const args = parseArgs(process.argv.slice(2));
  const { mode } = args;
  const validations = mode === 'legacy'
    ? legacyValidations
    : buildActiveValidations(root, args);

  for (const [command, args] of validations) {
    run(command, args, { cwd: root });
  }
  console.log(`${mode} upgrade validators passed`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

function parseArgs(argv) {
  const out = { mode: 'active' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--legacy') out.mode = 'legacy';
    else if (arg === '--all-profiles') out.mode = 'all-profiles';
    else if (arg === '--profile') out.profile = argv[++index];
    else throw new Error(`Unknown validate-all argument: ${arg}`);
  }
  return out;
}

function buildActiveValidations(root, args) {
  const index = readJson(root, PROFILE_INDEX);
  const entry = resolveProfileEntry(index, args.profile);
  const profile = readJson(root, entry.path);
  const profileArg = entry.path;

  const validations = args.mode === 'all-profiles'
    ? [['node', ['scripts/upgrade/validate-profile.mjs', '--all-profiles']]]
    : [['node', ['scripts/upgrade/validate-profile.mjs', '--profile', profileArg]]];

  if (profile.validationMode !== 'canonical-replay') {
    throw new Error(`Active validate-all mode requires a canonical-replay profile; got ${profile.profile} (${profile.validationMode})`);
  }

  validations.push(
    ['node', ['scripts/upgrade/validate-series.mjs', '--profile', profileArg]],
    ['node', ['scripts/upgrade/validate-product-overrides.mjs', '--profile', profileArg]],
  );

  if (profile.allowlistPaths?.depsSourceMutation) {
    validations.push(['node', ['scripts/upgrade/validate-json.mjs', DEPS_ALLOWLIST_SCHEMA, profile.allowlistPaths.depsSourceMutation]]);
  }

  validations.push(
    ['node', ['scripts/upgrade/expected-contracts.mjs', '--profile', profileArg]],
    ['node', ['scripts/upgrade/canonical-manifest.mjs', '--profile', profileArg]],
  );

  for (const reportPath of jsonReportPaths(root, profile)) {
    validations.push(['node', ['scripts/upgrade/validate-json.mjs', REPORT_SCHEMA, reportPath]]);
  }

  return validations;
}

function resolveProfileEntry(index, requestedProfile) {
  const profileId = requestedProfile || index.activeProfile;
  const entry = index.profiles.find((candidate) => candidate.profile === profileId || candidate.path === profileId);
  if (!entry) {
    throw new Error(`Profile not found in ${PROFILE_INDEX}: ${profileId}`);
  }
  return entry;
}

function jsonReportPaths(root, profile) {
  const reportPaths = Object.values(profile.reportPaths || {})
    .filter((reportPath) => typeof reportPath === 'string' && reportPath.endsWith('.json'));
  const missing = reportPaths.filter((reportPath) => !fs.existsSync(path.join(root, reportPath)));
  if (missing.length > 0) {
    throw new Error(`Profile ${profile.profile} reportPaths point to missing report(s):\n${missing.join('\n')}`);
  }
  return reportPaths;
}

function readJson(root, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}
