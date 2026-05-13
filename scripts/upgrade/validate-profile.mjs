#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { getWorkspaceRoot, run } from './reference-manifest-lib.mjs';

const PROFILE_INDEX = 'docs/upgrade/profiles/index.json';
const PROFILE_INDEX_SCHEMA = 'docs/upgrade/schemas/profile-index.schema.json';
const PROFILE_SCHEMA = 'docs/upgrade/schemas/profile.schema.json';
const PLATFORM_BY_OS = {
  windows: 'win32',
  osx: 'darwin',
  linux: 'linux',
};

function main() {
  const root = getWorkspaceRoot();
  const args = parseArgs(process.argv.slice(2));
  run('node', ['scripts/upgrade/validate-json.mjs', PROFILE_INDEX_SCHEMA, PROFILE_INDEX], { cwd: root });
  const index = readJson(root, PROFILE_INDEX);
  validateIndex(root, index);

  const profiles = profilesToValidate(index, args);
  for (const entry of profiles) {
    validateProfile(root, entry.path, entry.validationMode, args);
  }

  console.log(`validated ${profiles.length} upgrade profile(s)`);
}

function parseArgs(argv) {
  const out = { mode: 'active' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--profile') out.profile = argv[++index];
    else if (arg === '--all-profiles') out.mode = 'all';
    else if (arg === '--require-generated') out.requireGenerated = true;
    else throw new Error(`Unknown validate-profile argument: ${arg}`);
  }
  return out;
}

function profilesToValidate(index, args) {
  if (args.profile) {
    const entry = index.profiles.find((candidate) => candidate.profile === args.profile || candidate.path === args.profile);
    if (!entry) {
      throw new Error(`Profile not found in ${PROFILE_INDEX}: ${args.profile}`);
    }
    return [entry];
  }

  if (args.mode === 'all') {
    return index.profiles;
  }

  const active = index.profiles.find((entry) => entry.profile === index.activeProfile);
  if (!active) {
    throw new Error(`activeProfile ${index.activeProfile} is not listed in ${PROFILE_INDEX}`);
  }
  return [active];
}

function validateIndex(root, index) {
  const seen = new Set();
  for (const entry of index.profiles) {
    if (seen.has(entry.profile)) {
      throw new Error(`Duplicate profile in ${PROFILE_INDEX}: ${entry.profile}`);
    }
    seen.add(entry.profile);
    if (!fs.existsSync(path.join(root, entry.path))) {
      throw new Error(`Profile listed in ${PROFILE_INDEX} does not exist: ${entry.path}`);
    }
  }
}

function validateProfile(root, profilePath, expectedValidationMode, args) {
  run('node', ['scripts/upgrade/validate-json.mjs', PROFILE_SCHEMA, profilePath], { cwd: root });
  const profile = readJson(root, profilePath);

  const failures = [];
  if (profile.validationMode !== expectedValidationMode) {
    failures.push(`validationMode mismatch: index=${expectedValidationMode} profile=${profile.validationMode}`);
  }
  if (PLATFORM_BY_OS[profile.osName] !== profile.platform) {
    failures.push(`platform mismatch: osName=${profile.osName} platform=${profile.platform}`);
  }
  if (profile.VSCODE_QUALITY !== profile.quality) {
    failures.push('VSCODE_QUALITY must match quality');
  }
  if (profile.OS_NAME !== profile.osName) {
    failures.push('OS_NAME must match osName');
  }
  if (profile.VSCODE_ARCH !== profile.arch) {
    failures.push('VSCODE_ARCH must match arch');
  }
  if (!profile.canonicalCommand.includes('--target vscode.generated')) {
    failures.push('canonicalCommand must target vscode.generated');
  }

  if (profile.validationMode === 'legacy-reference') {
    requireString(profile, 'directorVersion', failures);
    requireString(profile, 'legacyReferenceManifestPath', failures);
    requireObject(profile, 'replayInputs', failures);
    requireObject(profile, 'allowlistPaths', failures);
  } else if (profile.validationMode === 'canonical-replay') {
    validateCanonicalReplayProfile(root, profile, args, failures);
  } else {
    failures.push(`unsupported validationMode ${profile.validationMode}`);
  }

  if (failures.length > 0) {
    throw new Error(`Profile validation failed for ${profilePath}\n${failures.slice(0, 100).join('\n')}`);
  }

  console.log(`validated profile ${profilePath}`);
}

function validateCanonicalReplayProfile(root, profile, args, failures) {
  for (const key of ['directorVersion', 'canonicalManifestPath', 'productOverridePath', 'productOwnedKeysPath']) {
    requireString(profile, key, failures);
  }
  for (const key of ['replayInputs', 'expectedPaths', 'reportPaths', 'allowlistPaths', 'artifactPaths']) {
    requireObject(profile, key, failures);
  }
  for (const key of ['patchSeries', 'vscodiumLayerPatch', 'directorDeltaPatches', 'vscodiumLayerManifest', 'prepareParityReport']) {
    if (!(key in profile.replayInputs)) {
      failures.push(`replayInputs missing ${key}`);
    }
  }
  if (!Array.isArray(profile.replayInputs?.directorDeltaPatches) || profile.replayInputs.directorDeltaPatches.length === 0) {
    failures.push('replayInputs.directorDeltaPatches must be a non-empty array');
  }
  for (const key of ['product', 'package', 'serverManifest', 'announcementsBuiltin', 'announcementsExtra']) {
    if (!(key in profile.expectedPaths)) {
      failures.push(`expectedPaths missing ${key}`);
    }
  }
  for (const key of ['depsSourceMutation', 'overlay', 'productDelete']) {
    if (!(key in profile.allowlistPaths)) {
      failures.push(`allowlistPaths missing ${key}`);
    }
  }
  for (const relativePath of [
    profile.productOverridePath,
    profile.productOwnedKeysPath,
    ...Object.values(profile.allowlistPaths || {}),
  ]) {
    if (relativePath && !fs.existsSync(path.join(root, relativePath))) {
      failures.push(`required config file does not exist: ${relativePath}`);
    }
  }
  if (args.requireGenerated) {
    const generatedPaths = [
      profile.canonicalManifestPath,
      profile.replayInputs.patchSeries,
      profile.replayInputs.vscodiumLayerPatch,
      profile.replayInputs.vscodiumLayerManifest,
      ...profile.replayInputs.directorDeltaPatches,
      ...Object.values(profile.expectedPaths || {}),
    ];
    for (const relativePath of generatedPaths) {
      if (relativePath && !fs.existsSync(path.join(root, relativePath))) {
        failures.push(`required generated file does not exist: ${relativePath}`);
      }
    }
  }
}

function requireString(object, key, failures) {
  if (typeof object[key] !== 'string' || object[key].length === 0) {
    failures.push(`${key} must be a non-empty string`);
  }
}

function requireObject(object, key, failures) {
  if (!object[key] || typeof object[key] !== 'object' || Array.isArray(object[key])) {
    failures.push(`${key} must be an object`);
  }
}

function readJson(root, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
