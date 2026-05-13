#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { getWorkspaceRoot, run } from './reference-manifest-lib.mjs';

const PROFILE_INDEX = 'docs/upgrade/profiles/index.json';
const SCHEMA = 'docs/upgrade/schemas/series.schema.json';
const STATUSES = new Set(['enabled', 'disabled', 'deferred', 'archived']);

function main() {
  const root = getWorkspaceRoot();
  const args = parseArgs(process.argv.slice(2));
  const profile = loadProfile(root, args.profile);
  const seriesPath = profile.replayInputs?.patchSeries;
  if (!seriesPath) {
    throw new Error(`Profile ${profile.profile} does not declare replayInputs.patchSeries`);
  }
  if (!fs.existsSync(path.join(root, seriesPath))) {
    throw new Error(`Missing patch series for ${profile.profile}: ${seriesPath}`);
  }

  run('node', ['scripts/upgrade/validate-json.mjs', SCHEMA, seriesPath], { cwd: root });
  const series = readJson(root, seriesPath);
  const failures = [];

  if (series.profile !== profile.profile) {
    failures.push(`series profile mismatch: series=${series.profile} profile=${profile.profile}`);
  }

  const orders = new Map();
  const paths = new Set();
  for (const entry of series.patches) {
    if (paths.has(entry.path)) failures.push(`duplicate patch path: ${entry.path}`);
    paths.add(entry.path);
    if (!STATUSES.has(entry.status)) failures.push(`${entry.path}: invalid status ${entry.status}`);
    if (entry.enabled !== (entry.status === 'enabled')) failures.push(`${entry.path}: enabled must match status=enabled`);
    if (orders.has(entry.order)) failures.push(`duplicate patch order ${entry.order}: ${orders.get(entry.order)} and ${entry.path}`);
    orders.set(entry.order, entry.path);

    const absolute = path.join(root, entry.path);
    if (!fs.existsSync(absolute)) {
      if (entry.status !== 'deferred') {
        failures.push(`${entry.path}: patch file does not exist`);
      }
      continue;
    }
    const actualSha = sha256File(absolute);
    if (profile.validationMode === 'canonical-replay' && entry.status === 'enabled' && actualSha !== entry.sha256) {
      failures.push(`${entry.path}: sha256 mismatch series=${entry.sha256} actual=${actualSha}`);
    }
  }

  for (const replayPatch of expectedReplayPatches(profile)) {
    if (!paths.has(replayPatch)) {
      failures.push(`series missing profile replay patch: ${replayPatch}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Series validation failed for ${seriesPath}\n${failures.slice(0, 100).join('\n')}`);
  }

  console.log(`validated patch series ${seriesPath}`);
}

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--profile') out.profile = argv[++index];
    else throw new Error(`Unknown validate-series argument: ${arg}`);
  }
  return out;
}

function loadProfile(root, requestedProfile) {
  const profileIndex = readJson(root, PROFILE_INDEX);
  const profileId = requestedProfile || profileIndex.activeProfile;
  const entry = profileIndex.profiles.find((candidate) => candidate.profile === profileId || candidate.path === profileId);
  if (!entry) {
    throw new Error(`Profile not found in ${PROFILE_INDEX}: ${profileId}`);
  }
  return readJson(root, entry.path);
}

function expectedReplayPatches(profile) {
  return [
    profile.replayInputs?.vscodiumLayerPatch,
    ...(profile.replayInputs?.directorDeltaPatches || []),
  ].filter(Boolean);
}

function readJson(root, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function sha256File(filePath) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
