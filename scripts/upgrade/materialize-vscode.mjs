#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { getWorkspaceRoot, run, runMaybe, toPosix, writeJson } from './reference-manifest-lib.mjs';

const PROFILE_ID = '112-stable-win32-x64-client';
const REPORT_DIR = `artifacts/generated/${PROFILE_ID}`;
const COMMITTED_REPORT_DIR = `docs/upgrade/reports/${PROFILE_ID}`;
const REFERENCE_MANIFEST = 'docs/upgrade/112-reference-manifest.json';
const PATCH_SERIES = 'patches/series.112.json';
const VSCODIUM_LAYER_PATCH = 'patches/replay/001-vscodium-layer.112.patch';
const DIRECTOR_DELTA_PATCH = 'patches/replay/002-director-delta.112.patch';
const REFERENCE_OVERLAYS = 'docs/upgrade/reference-overlays.112.json';

function main() {
  const root = getWorkspaceRoot();
  const args = parseArgs(process.argv.slice(2));
  const profilePath = args.profile || 'docs/upgrade/profiles/112-stable-win32-x64-client.json';
  const profile = JSON.parse(fs.readFileSync(path.join(root, profilePath), 'utf8'));
  const target = args.target || 'vscode.generated';

  validateArgs(profile, target, args);
  if (args.freshCache) {
    freshCache(root);
  }
  if (args.force) {
    safeDelete(root, target);
  }

  fs.mkdirSync(path.join(root, target, 'layers'), { recursive: true });
  const upstreams = ensureUpstreams(root, profile);
  const checkpoints = [];

  const vscodeLayer = path.join(root, target, 'layers', 'vscode', 'vscode');
  materializeCleanLayer(upstreams.vscode.path, vscodeLayer);
  checkpoints.push(checkpoint(root, 'vscode', vscodeLayer));
  const applications = [];
  let overlayResult = { status: 'not-requested', overlays: [] };
  let equivalence = { status: 'not-requested' };

  if (['vscodium', 'director'].includes(args.upToLayer)) {
    const vscodiumLayer = path.join(root, target, 'layers', 'vscodium', 'vscode');
    copyTree(vscodeLayer, vscodiumLayer);
    applications.push(applyReplayPatch(root, vscodiumLayer, VSCODIUM_LAYER_PATCH, 'vscodium'));
    checkpoints.push(checkpoint(root, 'vscodium', vscodiumLayer));
  }

  if (args.upToLayer === 'director') {
    const directorLayer = path.join(root, target, 'layers', 'director', 'vscode');
    const vscodiumLayer = path.join(root, target, 'layers', 'vscodium', 'vscode');
    copyTree(vscodiumLayer, directorLayer);
    applications.push(applyReplayPatch(root, directorLayer, DIRECTOR_DELTA_PATCH, 'director'));
    overlayResult = restoreReferenceOverlays(root, directorLayer, args.verifyReference);
    checkpoints.push(checkpoint(root, 'director', directorLayer));
    equivalence = compareReferenceEquivalence(root, directorLayer);
  }

  const report = {
    schemaVersion: 1,
    profile: PROFILE_ID,
    phase: 'P1',
    batch: 'layer',
    status: reportStatus(args, equivalence, overlayResult),
    generatedAt: new Date().toISOString(),
    command: process.argv.slice(2),
    target,
    upToLayer: args.upToLayer,
    upstreams,
    replayInputs: {
      referenceManifest: REFERENCE_MANIFEST,
      patchSeries: PATCH_SERIES,
      vscodiumLayerPatch: VSCODIUM_LAYER_PATCH,
      directorDeltaPatch: DIRECTOR_DELTA_PATCH,
      referenceOverlays: REFERENCE_OVERLAYS,
    },
    applications,
    referenceOverlays: overlayResult,
    equivalence,
    checkpoints,
    checks: {
      targetPolicy: 'passed',
      cleanVscodeMaterialized: 'passed',
      cleanVscodiumCache: upstreams.vscodium.cleanStatus === 'clean' ? 'passed' : 'failed',
      vscodiumTransformApplication: ['vscodium', 'director'].includes(args.upToLayer) ? 'passed' : 'not-requested',
      directorDeltaApplication: args.upToLayer === 'director' ? 'passed' : 'not-requested',
      referenceOverlayApplication: args.upToLayer === 'director' ? overlayResult.status : 'not-requested',
      sourceEquivalence: args.upToLayer === 'director' ? equivalence.status : 'not-requested',
      installDeps: args.installDeps ? 'blocked-until-p1-build-batch' : 'not-requested',
      buildArtifact: args.buildArtifact ? 'blocked-until-p1-build-batch' : 'not-requested',
    },
    blockers: materializeBlockers(args, overlayResult, equivalence),
  };

  writeJson(path.join(root, REPORT_DIR, 'materialize-report.json'), report);
  writeJson(path.join(root, COMMITTED_REPORT_DIR, 'materialize-report.json'), report);
  if (args.upToLayer === 'director') {
    writeReplayEquivalenceReport(root, report);
  }
  console.log(`materialize report: ${REPORT_DIR}/materialize-report.json`);

  if (args.verifyReference) {
    const result = runMaybe('node', ['scripts/upgrade/check-reference-drift.mjs'], { cwd: root });
    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || 'reference verification failed');
    }
    if (overlayResult.status !== 'passed' || equivalence.status !== 'passed') {
      throw new Error(`source equivalence failed: overlays=${overlayResult.status}, equivalence=${equivalence.status}`);
    }
  }
}

function parseArgs(argv) {
  const out = { upToLayer: 'director' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--profile') out.profile = argv[++index];
    else if (arg === '--target') out.target = argv[++index];
    else if (arg === '--up-to-layer') out.upToLayer = argv[++index];
    else if (arg === '--install-deps') out.installDeps = true;
    else if (arg === '--build-artifact') out.buildArtifact = true;
    else if (arg === '--fresh-cache') out.freshCache = true;
    else if (arg === '--force') out.force = true;
    else if (arg === '--verify-reference') out.verifyReference = true;
    else if (arg === '--allow-nondefault-target-force') out.allowNondefaultTargetForce = true;
    else throw new Error(`Unknown materialize argument: ${arg}`);
  }
  return out;
}

function validateArgs(profile, target, args) {
  if (profile.profile !== PROFILE_ID) {
    throw new Error(`P1 only supports profile ${PROFILE_ID}`);
  }
  if (target !== 'vscode.generated') {
    if (args.force && !args.allowNondefaultTargetForce) {
      throw new Error('--force with non-default target requires --allow-nondefault-target-force');
    }
  }
  if (!['vscode', 'vscodium', 'director'].includes(args.upToLayer)) {
    throw new Error(`Unsupported --up-to-layer: ${args.upToLayer}`);
  }
}

function freshCache(root) {
  for (const relative of ['.cache/upstreams']) {
    const absolute = path.join(root, relative);
    if (fs.existsSync(absolute)) {
      run('bash', ['scripts/upgrade/safe-delete.sh', relative], { cwd: root });
    }
  }
}

function safeDelete(root, relative) {
  run('bash', ['scripts/upgrade/safe-delete.sh', relative], { cwd: root });
}

function ensureUpstreams(root, profile) {
  return {
    vscode: ensureGitCache(root, 'vscode', profile.upstreams.vscode),
    vscodium: ensureGitCache(root, 'vscodium', profile.upstreams.vscodium),
  };
}

function ensureGitCache(root, name, upstream) {
  const cachePath = path.join(root, '.cache', 'upstreams', name, upstream.tag);
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  if (!fs.existsSync(path.join(cachePath, '.git'))) {
    run('git', ['-c', 'core.autocrlf=false', 'clone', '--filter=blob:none', '--depth', '1', '--branch', upstream.tag, upstream.remote, toPosix(cachePath)], { cwd: root });
  }
  run('git', ['-C', cachePath, 'config', 'core.autocrlf', 'false'], { cwd: root });
  run('git', ['-C', cachePath, 'checkout', '--detach', upstream.commit], { cwd: root });
  const status = run('git', ['-C', cachePath, 'status', '--short', '--untracked-files=no'], { cwd: root }).trim();
  const commit = run('git', ['-C', cachePath, 'rev-parse', 'HEAD'], { cwd: root }).trim();
  const manifest = {
    schemaVersion: 1,
    remote: upstream.remote,
    tag: upstream.tag,
    commit,
    archiveSha256: gitTreeHash(cachePath),
    fetchedAt: new Date().toISOString(),
    cleanStatus: status ? 'dirty' : 'clean',
  };
  writeJson(path.join(cachePath, 'upstream-cache-manifest.json'), manifest);
  return {
    path: toPosix(path.relative(root, cachePath)),
    remote: upstream.remote,
    tag: upstream.tag,
    commit,
    cleanStatus: manifest.cleanStatus,
    treeHash: manifest.archiveSha256,
  };
}

function materializeCleanLayer(source, destination) {
  copyTree(source, destination);
}

function applyReplayPatch(root, layerPath, patchRelative, expectedLayer) {
  const seriesEntry = findSeriesEntry(root, patchRelative);
  if (seriesEntry.layer !== expectedLayer) {
    throw new Error(`${patchRelative} is recorded as layer=${seriesEntry.layer}, expected ${expectedLayer}`);
  }
  if (seriesEntry.status !== 'enabled') {
    throw new Error(`${patchRelative} must be enabled in ${PATCH_SERIES}`);
  }

  const patchPath = path.join(root, patchRelative);
  if (!fs.existsSync(patchPath)) {
    throw new Error(`Missing replay patch: ${patchRelative}`);
  }

  run('git', ['-C', layerPath, 'init', '-q'], { cwd: root });
  run('git', ['-C', layerPath, 'config', 'core.autocrlf', 'false'], { cwd: root });
  try {
    run('git', ['-C', layerPath, 'apply', '--binary', '--whitespace=nowarn', patchPath], { cwd: root });
  } finally {
    fs.rmSync(path.join(layerPath, '.git'), { recursive: true, force: true });
  }

  return {
    layer: expectedLayer,
    patch: patchRelative,
    size: fs.statSync(patchPath).size,
    sha256: sha256File(patchPath),
    status: 'passed',
  };
}

function findSeriesEntry(root, patchRelative) {
  const seriesPath = path.join(root, PATCH_SERIES);
  if (!fs.existsSync(seriesPath)) {
    throw new Error(`Missing patch series: ${PATCH_SERIES}`);
  }
  const series = JSON.parse(fs.readFileSync(seriesPath, 'utf8'));
  const entry = series.patches.find((candidate) => candidate.path === patchRelative);
  if (!entry) {
    throw new Error(`${patchRelative} is not recorded in ${PATCH_SERIES}`);
  }
  return entry;
}

function restoreReferenceOverlays(root, layerPath, verifyReference) {
  const overlaysPath = path.join(root, REFERENCE_OVERLAYS);
  if (!fs.existsSync(overlaysPath)) {
    if (verifyReference) {
      throw new Error(`Missing reference overlay manifest: ${REFERENCE_OVERLAYS}`);
    }
    return { status: 'reference-overlays-unavailable', overlays: [] };
  }

  const manifest = JSON.parse(fs.readFileSync(overlaysPath, 'utf8'));
  const restored = [];
  const unavailable = [];
  for (const overlay of manifest.overlays) {
    const buffer = readReferenceOverlay(root, overlay);
    if (!buffer) {
      unavailable.push(overlay.path);
      continue;
    }
    const actualSha = sha256Buffer(buffer);
    if (actualSha !== overlay.rawSha256) {
      throw new Error(`Reference overlay hash mismatch for ${overlay.path}: ${actualSha} != ${overlay.rawSha256}`);
    }
    const destination = path.join(layerPath, ...overlay.path.split('/'));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, buffer);
    if (overlay.mode === '100755') {
      try { fs.chmodSync(destination, 0o755); } catch {}
    }
    restored.push({
      path: overlay.path,
      reason: overlay.reason,
      size: buffer.length,
      rawSha256: overlay.rawSha256,
    });
  }

  if (unavailable.length > 0 && verifyReference) {
    throw new Error(`Reference overlays unavailable: ${unavailable.slice(0, 20).join(', ')}`);
  }

  return {
    status: unavailable.length === 0 ? 'passed' : 'reference-overlays-unavailable',
    manifest: REFERENCE_OVERLAYS,
    restoredCount: restored.length,
    unavailableCount: unavailable.length,
    overlays: restored,
    unavailable,
  };
}

function readReferenceOverlay(root, overlay) {
  const localReference = path.join(root, 'vscode', ...overlay.path.split('/'));
  if (fs.existsSync(localReference)) {
    return fs.readFileSync(localReference);
  }

  for (const source of overlay.sources || []) {
    if (source.type !== 'outer-commit') {
      continue;
    }
    const result = spawnSync('git', ['show', `${source.commit}:${source.gitPath}`], {
      cwd: root,
      encoding: 'buffer',
      maxBuffer: Math.max(256 * 1024 * 1024, overlay.size * 2),
    });
    if (result.status === 0 && sha256Buffer(result.stdout) === overlay.rawSha256) {
      return result.stdout;
    }
  }

  return undefined;
}

function compareReferenceEquivalence(root, layerPath) {
  const manifestPath = path.join(root, REFERENCE_MANIFEST);
  if (!fs.existsSync(manifestPath)) {
    return { status: 'reference-manifest-unavailable' };
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const expected = new Map(
    manifest.files
      .filter((entry) => entry.equivalenceScope === 'p1-strict')
      .map((entry) => [entry.path, entry]),
  );
  const missing = [];
  const changed = [];
  const actual = [];
  collectFiles(layerPath, actual);

  for (const [relative, file] of expected) {
    const absolutePath = path.join(layerPath, ...relative.split('/'));
    if (!fs.existsSync(absolutePath)) {
      missing.push(relative);
      continue;
    }
    const actualSha = sha256File(absolutePath);
    if (actualSha !== file.rawSha256) {
      changed.push({
        path: relative,
        expected: file.rawSha256,
        actual: actualSha,
      });
    }
  }

  const extra = actual
    .map((filePath) => toPosix(path.relative(layerPath, filePath)))
    .filter((relative) => !expected.has(relative));

  return {
    status: missing.length === 0 && changed.length === 0 && extra.length === 0 ? 'passed' : 'failed',
    referenceManifest: REFERENCE_MANIFEST,
    expectedFiles: expected.size,
    checkedFiles: actual.length,
    missingCount: missing.length,
    changedCount: changed.length,
    extraCount: extra.length,
    missing: missing.slice(0, 50),
    changed: changed.slice(0, 50),
    extra: extra.slice(0, 50),
  };
}

function reportStatus(args, equivalence, overlayResult) {
  if (args.upToLayer !== 'director') {
    return 'passed';
  }
  if (equivalence.status === 'passed' && overlayResult.status === 'passed') {
    return 'passed';
  }
  return args.verifyReference ? 'failed' : 'degraded';
}

function materializeBlockers(args, overlayResult, equivalence) {
  const blockers = [];
  if (args.installDeps || args.buildArtifact) {
    blockers.push({
      id: 'deps-build-artifact-stage',
      status: 'recorded',
      detail: 'P1 source replay is now materialized. Dependency installation and artifact build remain gated to the later P1 build/artifact batch and are not executed by this source-equivalence batch.',
    });
  }
  if (args.upToLayer === 'director' && overlayResult.status !== 'passed') {
    blockers.push({
      id: 'reference-overlays',
      status: overlayResult.status,
      detail: 'Raw-sensitive reference overlays require the frozen local reference/archive. Without it, fresh clones can run replay self-checks but cannot prove strict raw equivalence.',
    });
  }
  if (args.upToLayer === 'director' && equivalence.status !== 'passed') {
    blockers.push({
      id: 'source-equivalence',
      status: equivalence.status,
      detail: 'Generated Director source does not yet match the frozen reference manifest at raw hash level.',
    });
  }
  return blockers;
}

function writeReplayEquivalenceReport(root, materializeReport) {
  const series = JSON.parse(fs.readFileSync(path.join(root, PATCH_SERIES), 'utf8'));
  const patches = series.patches || [];
  writeJson(path.join(root, COMMITTED_REPORT_DIR, 'replay-equivalence-report.json'), {
    schemaVersion: 1,
    profile: PROFILE_ID,
    phase: 'P1',
    batch: 'replay-equivalence',
    status: materializeReport.status,
    generatedAt: materializeReport.generatedAt,
    checks: {
      patchSeriesValidation: 'passed',
      aggregateReplayPatches: patches.some((entry) => entry.path === VSCODIUM_LAYER_PATCH)
        && patches.some((entry) => entry.path === DIRECTOR_DELTA_PATCH) ? 'passed' : 'failed',
      referenceOverlayApplication: materializeReport.referenceOverlays.status,
      productExpected: 'captured',
      sourceEquivalence: materializeReport.equivalence.status,
    },
    inputs: materializeReport.replayInputs,
    patchSeries: {
      count: patches.length,
      enabled: patches.filter((entry) => entry.status === 'enabled').length,
      deferred: patches.filter((entry) => entry.status === 'deferred').length,
      archived: patches.filter((entry) => entry.status === 'archived').length,
      vscodiumLayer: patches.filter((entry) => entry.layer === 'vscodium').length,
      directorLayer: patches.filter((entry) => entry.layer === 'director').length,
      aggregateReplay: patches.filter((entry) => entry.path.startsWith('patches/replay/')).length,
    },
    referenceOverlays: {
      manifest: REFERENCE_OVERLAYS,
      restoredCount: materializeReport.referenceOverlays.restoredCount,
      unavailableCount: materializeReport.referenceOverlays.unavailableCount,
    },
    sourceEquivalence: materializeReport.equivalence,
    blockers: materializeReport.blockers,
  });
}

function copyTree(source, destination) {
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, {
    recursive: true,
    verbatimSymlinks: true,
    filter: (sourcePath) => !sourcePath.includes(`${path.sep}.git${path.sep}`)
      && !sourcePath.endsWith(`${path.sep}.git`)
      && path.basename(sourcePath) !== 'upstream-cache-manifest.json',
  });
}

function checkpoint(root, name, layerPath) {
  return {
    name,
    path: toPosix(path.relative(root, layerPath)),
    fileManifestHash: gitTreeHash(layerPath),
  };
}

function gitTreeHash(directory) {
  if (!fs.existsSync(directory)) return 'missing';
  const files = [];
  collectFiles(directory, files);
  const digest = createHash('sha256');
  for (const file of files.sort()) {
    digest.update(toPosix(path.relative(directory, file)));
    digest.update('\0');
    digest.update(fs.readFileSync(file));
    digest.update('\0');
  }
  return digest.digest('hex');
}

function sha256Buffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function sha256File(filePath) {
  return sha256Buffer(fs.readFileSync(filePath));
}

function collectFiles(root, out) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'upstream-cache-manifest.json') continue;
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) collectFiles(absolute, out);
    else out.push(absolute);
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
