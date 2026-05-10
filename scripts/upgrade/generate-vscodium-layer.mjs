#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { getWorkspaceRoot, run, toPosix, writeJson } from './reference-manifest-lib.mjs';

const PROFILE = '112-stable-win32-x64-client';
const VSCODIUM_CACHE = '.cache/upstreams/vscodium/1.112.01907';
const LAYER_PATH = 'docs/upgrade/vscodium-layer.112.json';
const REPORT_PATH = `docs/upgrade/reports/${PROFILE}/vscodium-layer-report.json`;

function main() {
  const root = getWorkspaceRoot();
  const cacheRoot = path.join(root, VSCODIUM_CACHE);
  if (!fs.existsSync(cacheRoot)) {
    throw new Error(`Missing clean VSCodium cache: ${VSCODIUM_CACHE}`);
  }

  const head = run('git', ['-C', cacheRoot, 'rev-parse', 'HEAD']).trim();
  const status = run('git', ['-C', cacheRoot, 'status', '--short', '--untracked-files=no']).trim();
  if (status) {
    throw new Error(`VSCodium cache is dirty:\n${status}`);
  }

  const patches = listFiles(path.join(cacheRoot, 'patches'))
    .filter((filePath) => /\.patch(\.yet|\.no)?$/i.test(filePath))
    .map((absolutePath) => {
      const relative = toPosix(path.relative(cacheRoot, absolutePath));
      return {
        path: relative,
        sha256: sha256File(absolutePath),
        status: statusFromPatchPath(relative),
        layer: 'vscodium',
        stage: stageFromPatchPath(relative),
        platforms: platformsFromPatchPath(relative),
        arches: archesFromPatchPath(relative),
        qualities: qualitiesFromPatchPath(relative),
        targets: targetsFromPatchPath(relative),
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path));

  const overlays = [
    'src/stable',
    'src/insider',
    'npmrc',
    'LICENSE',
    'announcements-builtin.json',
    'announcements-extra.json',
  ].filter((relative) => fs.existsSync(path.join(cacheRoot, relative)))
    .map((relative) => ({
      path: relative,
      sha256: treeHash(path.join(cacheRoot, relative)),
      layer: 'vscodium',
      stage: 'overlay',
    }));

  const productInputs = ['product.json']
    .filter((relative) => fs.existsSync(path.join(cacheRoot, relative)))
    .map((relative) => ({
      path: relative,
      sha256: sha256File(path.join(cacheRoot, relative)),
      layer: 'vscodium',
      stage: 'product',
    }));

  const layer = {
    schemaVersion: 1,
    profile: PROFILE,
    layer: 'vscodium',
    status: 'metadata-captured',
    generatedAt: new Date().toISOString(),
    upstream: {
      remote: 'https://github.com/VSCodium/vscodium.git',
      tag: '1.112.01907',
      commit: head,
      cachePath: VSCODIUM_CACHE,
      cleanStatus: status ? 'dirty' : 'clean',
    },
    vscodeBase: {
      tag: '1.112.0',
      commit: '07ff9d6178ede9a1bd12ad3399074d726ebe6e43',
    },
    transformPolicy: {
      source: 'clean-vscodium-tag',
      note: 'Transform metadata is captured from the clean VSCodium tag. Applying the transform into a VS Code tree is handled by materialize/replay batches and must not read current repo patches as Layer 1 source.',
    },
    transforms: {
      patches,
      overlays,
      productInputs,
    },
  };

  writeJson(path.join(root, LAYER_PATH), layer);
  writeJson(path.join(root, REPORT_PATH), {
    schemaVersion: 1,
    profile: PROFILE,
    phase: 'P1',
    batch: 'layer',
    status: 'passed',
    generatedAt: layer.generatedAt,
    checks: {
      cleanVscodiumCache: 'passed',
      transformManifestCaptured: 'passed',
      currentRepoPatchesNotUsedForLayer1: 'passed',
    },
    upstream: layer.upstream,
    transformCounts: {
      patches: patches.length,
      overlays: overlays.length,
      productInputs: productInputs.length,
    },
    layerManifest: LAYER_PATH,
  });

  writeJson(path.join(cacheRoot, 'upstream-cache-manifest.json'), {
    schemaVersion: 1,
    remote: 'https://github.com/VSCodium/vscodium.git',
    tag: '1.112.01907',
    commit: head,
    archiveSha256: treeHash(cacheRoot),
    fetchedAt: new Date().toISOString(),
    cleanStatus: 'clean',
  });

  console.log(`Generated ${LAYER_PATH}`);
}

function listFiles(root) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFiles(absolute));
    } else {
      out.push(absolute);
    }
  }
  return out;
}

function statusFromPatchPath(relative) {
  if (relative.endsWith('.patch.no')) return 'archived';
  if (relative.endsWith('.patch.yet')) return 'deferred';
  return 'enabled';
}

function stageFromPatchPath(relative) {
  if (relative.includes('/helper/')) return 'helper';
  if (relative.includes('/client/')) return 'client';
  if (relative.includes('/reh/')) return 'reh';
  if (relative.includes('/windows/')) return 'platform';
  if (relative.includes('/linux/')) return 'platform';
  if (relative.includes('/osx/')) return 'platform';
  if (relative.includes('/alpine/')) return 'platform';
  return 'source';
}

function platformsFromPatchPath(relative) {
  if (relative.includes('/windows/')) return ['win32'];
  if (relative.includes('/linux/')) return ['linux'];
  if (relative.includes('/osx/')) return ['darwin'];
  if (relative.includes('/alpine/')) return ['alpine'];
  return ['all'];
}

function archesFromPatchPath(relative) {
  for (const arch of ['x64', 'arm64', 'armhf', 'ppc64le', 'riscv64', 'loong64', 's390x']) {
    if (relative.includes(`/${arch}/`) || relative.includes(`-${arch}`)) {
      return [arch];
    }
  }
  return ['all'];
}

function qualitiesFromPatchPath(relative) {
  if (relative.includes('/insider/')) return ['insider'];
  return ['stable', 'insider'];
}

function targetsFromPatchPath(relative) {
  if (relative.includes('/client/')) return ['client'];
  if (relative.includes('/reh/')) return ['reh'];
  if (relative.includes('/cli')) return ['cli'];
  return ['client', 'cli', 'reh', 'reh-web'];
}

function sha256File(filePath) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function treeHash(root) {
  const stat = fs.lstatSync(root);
  if (!stat.isDirectory()) {
    return sha256File(root);
  }

  const hash = createHash('sha256');
  for (const absolute of listFiles(root).sort()) {
    if (absolute.includes(`${path.sep}.git${path.sep}`)) continue;
    hash.update(toPosix(path.relative(root, absolute)));
    hash.update('\0');
    hash.update(fs.readFileSync(absolute));
    hash.update('\0');
  }
  return hash.digest('hex');
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
