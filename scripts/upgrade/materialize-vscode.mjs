#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { getWorkspaceRoot, run, runMaybe, toPosix, writeJson } from './reference-manifest-lib.mjs';

const PROFILE_ID = '112-stable-win32-x64-client';
const REPORT_DIR = `artifacts/generated/${PROFILE_ID}`;

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

  if (['vscodium', 'director'].includes(args.upToLayer)) {
    const vscodiumLayer = path.join(root, target, 'layers', 'vscodium', 'vscode');
    copyTree(vscodeLayer, vscodiumLayer);
    checkpoints.push(checkpoint(root, 'vscodium-bootstrap', vscodiumLayer));
  }

  if (args.upToLayer === 'director') {
    const directorLayer = path.join(root, target, 'layers', 'director', 'vscode');
    const vscodiumLayer = path.join(root, target, 'layers', 'vscodium', 'vscode');
    copyTree(vscodiumLayer, directorLayer);
    checkpoints.push(checkpoint(root, 'director-bootstrap', directorLayer));
  }

  const report = {
    schemaVersion: 1,
    profile: PROFILE_ID,
    phase: 'P1',
    batch: 'layer',
    status: 'degraded',
    generatedAt: new Date().toISOString(),
    command: process.argv.slice(2),
    target,
    upToLayer: args.upToLayer,
    upstreams,
    checkpoints,
    checks: {
      targetPolicy: 'passed',
      cleanVscodeMaterialized: 'passed',
      cleanVscodiumCache: upstreams.vscodium.cleanStatus === 'clean' ? 'passed' : 'failed',
      vscodiumTransformApplication: 'blocked',
      directorDeltaApplication: args.upToLayer === 'director' ? 'blocked' : 'not-requested',
      installDeps: args.installDeps ? 'blocked-until-replay-equivalence' : 'not-requested',
      buildArtifact: args.buildArtifact ? 'blocked-until-replay-equivalence' : 'not-requested',
    },
    blockers: [
      {
        id: 'layer1-transform-application',
        status: 'recorded',
        detail: 'Clean VSCodium tag metadata is captured in docs/upgrade/vscodium-layer.112.json. Applying that transform into VS Code is completed by replay equivalence batches; this scaffolding does not consume current repo patches as Layer 1 source.',
      },
    ],
  };

  writeJson(path.join(root, REPORT_DIR, 'materialize-report.json'), report);
  writeJson(path.join(root, 'docs/upgrade/reports/112-stable-win32-x64-client/materialize-report.json'), report);
  console.log(`materialize report: ${REPORT_DIR}/materialize-report.json`);

  if (args.verifyReference) {
    const result = runMaybe('node', ['scripts/upgrade/check-reference-drift.mjs'], { cwd: root });
    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || 'reference verification failed');
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

function copyTree(source, destination) {
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, {
    recursive: true,
    verbatimSymlinks: true,
    filter: (sourcePath) => !sourcePath.includes(`${path.sep}.git${path.sep}`) && !sourcePath.endsWith(`${path.sep}.git`),
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
