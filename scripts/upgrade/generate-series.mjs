#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { getWorkspaceRoot, writeJson } from './reference-manifest-lib.mjs';

const PROFILE_INDEX = 'docs/upgrade/profiles/index.json';

function main() {
  const root = getWorkspaceRoot();
  const args = parseArgs(process.argv.slice(2));
  const profilePath = resolveProfilePath(root, args.profile);
  const profile = readJson(root, profilePath);
  const seriesPath = profile.replayInputs?.patchSeries;
  if (!seriesPath) {
    throw new Error(`Profile ${profile.profile} is missing replayInputs.patchSeries`);
  }

  const patchPlan = plannedReplayPatches(profile);
  const patches = patchPlan.map((planned, index) => seriesEntry(root, profile, planned, index + 1));
  const generatedAt = new Date().toISOString();
  const series = {
    schemaVersion: 1,
    profile: profile.profile,
    generatedAt,
    policy: {
      source: 'profile replayInputs',
      materializeRule: 'materialize consumes only patches listed by this profile-scoped series',
      missingPlannedPatchRule: 'planned Director semantic patches may be deferred until ported; enabled patches must exist and match sha256',
    },
    patches,
  };

  writeJson(path.join(root, seriesPath), series);
  console.log(`Generated ${seriesPath} with ${patches.length} patch entries`);
}

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--profile') out.profile = argv[++index];
    else throw new Error(`Unknown generate-series argument: ${arg}`);
  }
  return out;
}

function resolveProfilePath(root, requestedProfile) {
  const indexPath = path.join(root, PROFILE_INDEX);
  if (!fs.existsSync(indexPath)) {
    if (requestedProfile) return requestedProfile;
    throw new Error(`Missing profile index: ${PROFILE_INDEX}`);
  }
  const profileIndex = readJson(root, PROFILE_INDEX);
  const profileId = requestedProfile || profileIndex.activeProfile;
  const entry = (profileIndex.profiles || []).find((candidate) => candidate.profile === profileId || candidate.path === profileId);
  if (entry) return entry.path;
  if (requestedProfile && fs.existsSync(path.join(root, requestedProfile))) return requestedProfile;
  throw new Error(`Profile not found in ${PROFILE_INDEX}: ${profileId}`);
}

function plannedReplayPatches(profile) {
  return [
    {
      path: profile.replayInputs?.vscodiumLayerPatch,
      layer: 'vscodium',
      stage: 'aggregate-replay',
      required: true,
    },
    ...(profile.replayInputs?.directorDeltaPatches || []).map((patchPath) => ({
      path: patchPath,
      layer: 'director',
      stage: directorStageFromPath(patchPath),
      required: false,
    })),
  ].filter((entry) => entry.path);
}

function seriesEntry(root, profile, planned, order) {
  const absolute = path.join(root, planned.path);
  const exists = fs.existsSync(absolute);
  const status = exists ? 'enabled' : 'deferred';
  return {
    path: planned.path,
    sha256: exists ? sha256File(absolute) : 'pending',
    enabled: status === 'enabled',
    status,
    layer: planned.layer,
    stage: planned.stage,
    platforms: [profile.platform],
    arches: [profile.arch],
    qualities: [profile.quality],
    targets: [profile.buildTarget],
    order,
    placeholders: [],
    note: exists ? undefined : 'planned patch; deferred until ported',
  };
}

function directorStageFromPath(patchPath) {
  const base = path.basename(patchPath, '.patch').replace(/^\d+-director-/, '');
  if (base.includes('tool-layer')) return 'tool-layer';
  if (base.includes('chat-editing')) return 'chat-editing';
  if (base.includes('edit-tools')) return 'edit-tools';
  if (base.includes('branding')) return 'branding';
  if (base.includes('product')) return 'product-build-release';
  if (base.includes('agent-engine')) return 'agent-engine';
  if (base.includes('chat')) return 'chat-built-in-mode';
  if (base.includes('text')) return 'text-polish';
  return 'director-delta';
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
