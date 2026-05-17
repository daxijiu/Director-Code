#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
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
  const validationPlan = mode === 'legacy'
    ? { validations: legacyValidations, skippedProfiles: [] }
    : mode === 'all-profiles'
      ? buildAllProfileValidations(root)
      : { validations: buildActiveValidations(root, args), skippedProfiles: [] };

  for (const [command, args] of validationPlan.validations) {
    run(command, args, { cwd: root });
  }
  if (validationPlan.skippedProfiles.length > 0) {
    console.log(`${mode} upgrade validators passed with skips: ${validationPlan.skippedProfiles.join(', ')}`);
  } else {
    console.log(`${mode} upgrade validators passed`);
  }
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

  if (profile.validationMode !== 'canonical-replay') {
    throw new Error(`Active validate-all mode requires a canonical-replay profile; got ${profile.profile} (${profile.validationMode})`);
  }

  return buildCanonicalReplayValidations(root, profileArg, profile, {
    includeGeneratedTreeChecks: true,
    includeProfileValidation: true,
  });
}

function buildAllProfileValidations(root) {
  const index = readJson(root, PROFILE_INDEX);
  const validations = [['node', ['scripts/upgrade/validate-profile.mjs', '--all-profiles']]];
  const skippedProfiles = [];
  let includeScriptMatrix = true;

  for (const entry of index.profiles) {
    const profile = readJson(root, entry.path);
    if (profile.validationMode === 'legacy-reference') {
      validations.push(...buildLegacyProfileValidations(root, profile, { includeScriptMatrix, skippedProfiles }));
      includeScriptMatrix = false;
      continue;
    }

    if (profile.validationMode === 'canonical-replay') {
      const generatedTreeCheck = generatedTreeExpectedContractStatus(root, profile);
      const isActiveProfile = profile.profile === index.activeProfile;
      if (!generatedTreeCheck.matches && isActiveProfile) {
        throw new Error(`Active generated-tree validation failed for ${profile.profile}; current ${profile.artifactPaths?.directorSource || 'director source'} does not match or is missing expected product/package contracts:\n${generatedTreeCheck.reasons.join('\n')}`);
      }
      if (!generatedTreeCheck.matches) {
        skippedProfiles.push(`${profile.profile} (generated-tree: ${generatedTreeCheck.summary})`);
        console.log(`generated-tree validation skipped for non-active profile ${profile.profile}; ${generatedTreeCheck.summary}`);
      }
      validations.push(...buildCanonicalReplayValidations(root, entry.path, profile, {
        includeGeneratedTreeChecks: generatedTreeCheck.matches,
        includeProfileValidation: false,
        skippedProfiles,
      }));
      continue;
    }

    throw new Error(`Unsupported validationMode for ${profile.profile}: ${profile.validationMode}`);
  }

  return { validations, skippedProfiles };
}

function buildLegacyProfileValidations(root, profile, options) {
  const validations = [];
  if (profile.profile === LEGACY_112_PROFILE && profile.legacyReferenceManifestPath) {
    validations.push(['node', ['scripts/upgrade/validate-reference-manifest.mjs']]);
  }
  if (profile.replayInputs?.patchSeries) {
    validations.push(['node', ['scripts/upgrade/validate-series.mjs', '--profile', profile.profile]]);
  }
  if (options.includeScriptMatrix) {
    validations.push(['node', ['scripts/upgrade/check-script-matrix.mjs']]);
  }
  if (profile.allowlistPaths?.depsSourceMutation) {
    validations.push(['node', ['scripts/upgrade/validate-json.mjs', DEPS_ALLOWLIST_SCHEMA, profile.allowlistPaths.depsSourceMutation]]);
  }
  for (const reportPath of jsonReportPaths(root, profile, {
    requireDeclaredReports: false,
    skippedProfiles: options.skippedProfiles,
  })) {
    validations.push(['node', ['scripts/upgrade/validate-json.mjs', REPORT_SCHEMA, reportPath]]);
  }
  return validations;
}

function buildCanonicalReplayValidations(root, profileArg, profile, options) {
  const validations = options.includeProfileValidation
    ? [['node', ['scripts/upgrade/validate-profile.mjs', '--profile', profileArg]]]
    : [];

  validations.push(
    ['node', ['scripts/upgrade/validate-series.mjs', '--profile', profileArg]],
    ['node', ['scripts/upgrade/validate-product-overrides.mjs', '--profile', profileArg]],
  );

  if (profile.allowlistPaths?.depsSourceMutation) {
    validations.push(['node', ['scripts/upgrade/validate-json.mjs', DEPS_ALLOWLIST_SCHEMA, profile.allowlistPaths.depsSourceMutation]]);
  }

  if (options.includeGeneratedTreeChecks) {
    validations.push(
      ['node', ['scripts/upgrade/expected-contracts.mjs', '--profile', profileArg]],
      ['node', ['scripts/upgrade/canonical-manifest.mjs', '--profile', profileArg]],
    );
  }

  for (const reportPath of jsonReportPaths(root, profile, {
    requireDeclaredReports: options.includeProfileValidation,
    skippedProfiles: options.skippedProfiles,
  })) {
    validations.push(['node', ['scripts/upgrade/validate-json.mjs', REPORT_SCHEMA, reportPath]]);
  }

  return validations;
}

function generatedTreeExpectedContractStatus(root, profile) {
  const directorSource = profile.artifactPaths?.directorSource;
  const expected = profile.expectedPaths || {};
  const reasons = [];
  if (!directorSource || !expected.product || !expected.package) {
    if (!directorSource) reasons.push('missing profile artifactPaths.directorSource');
    if (!expected.product) reasons.push('missing profile expectedPaths.product');
    if (!expected.package) reasons.push('missing profile expectedPaths.package');
    return {
      matches: false,
      reasons,
      summary: reasons.join('; '),
    };
  }

  const pairs = [
    ['product.json', path.join(directorSource, 'product.json'), expected.product],
    ['package.json', path.join(directorSource, 'package.json'), expected.package],
  ];
  for (const [label, sourcePath, expectedPath] of pairs) {
    const sourceAbsolute = path.join(root, sourcePath);
    const expectedAbsolute = path.join(root, expectedPath);
    if (!fs.existsSync(sourceAbsolute)) {
      reasons.push(`source missing: ${sourcePath}`);
      continue;
    }
    if (!fs.existsSync(expectedAbsolute)) {
      reasons.push(`expected missing: ${expectedPath}`);
      continue;
    }
    const sourceHash = sha256File(sourceAbsolute);
    const expectedHash = sha256File(expectedAbsolute);
    if (sourceHash !== expectedHash) {
      reasons.push(`${label} hash mismatch: ${sourcePath} (${sourceHash}) != ${expectedPath} (${expectedHash})`);
    }
  }
  return {
    matches: reasons.length === 0,
    reasons,
    summary: reasons.length === 0 ? 'matches expected product/package contracts' : reasons.join('; '),
  };
}

function resolveProfileEntry(index, requestedProfile) {
  const profileId = requestedProfile || index.activeProfile;
  const entry = index.profiles.find((candidate) => candidate.profile === profileId || candidate.path === profileId);
  if (!entry) {
    throw new Error(`Profile not found in ${PROFILE_INDEX}: ${profileId}`);
  }
  return entry;
}

function jsonReportPaths(root, profile, options = {}) {
  const reportPaths = new Set(Object.values(profile.reportPaths || {})
    .filter((reportPath) => typeof reportPath === 'string' && reportPath.endsWith('.json')));
  if (profile.artifactPaths?.committedReports) {
    const reportRoot = path.join(root, profile.artifactPaths.committedReports);
    if (fs.existsSync(reportRoot)) {
      for (const entry of fs.readdirSync(reportRoot, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith('.json')) {
          reportPaths.add(toPosix(path.join(profile.artifactPaths.committedReports, entry.name)));
        }
      }
    }
  }

  const missing = [...reportPaths].filter((reportPath) => !fs.existsSync(path.join(root, reportPath)));
  if (missing.length > 0) {
    if (options.requireDeclaredReports) {
      throw new Error(`Profile ${profile.profile} reportPaths point to missing report(s):\n${missing.join('\n')}`);
    }
    console.log(`report JSON validation skipped missing report(s) for ${profile.profile}:\n${missing.join('\n')}`);
    options.skippedProfiles?.push(`${profile.profile} (reports: missing ${missing.join(', ')})`);
  }
  return [...reportPaths].filter((reportPath) => fs.existsSync(path.join(root, reportPath))).sort();
}

function readJson(root, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function sha256File(filePath) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function toPosix(value) {
  return value.replace(/\\/g, '/');
}
