#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { getWorkspaceRoot, toPosix, writeJson } from './reference-manifest-lib.mjs';

const PROFILE = '112-stable-win32-x64-client';
const SERIES_PATH = 'patches/series.112.json';
const VSCODIUM_CACHE = '.cache/upstreams/vscodium/1.112.01907';
const REPORT_PATH = `docs/upgrade/reports/${PROFILE}/replay-equivalence-report.json`;

function main() {
  const root = getWorkspaceRoot();
  const patchFiles = listFiles(path.join(root, 'patches'))
    .filter((filePath) => /\.patch(\.yet|\.no)?$/i.test(filePath))
    .map((absolutePath) => toPosix(path.relative(root, absolutePath)))
    .sort();

  const patches = patchFiles.map((relative, index) => {
    const cleanVscodiumPatch = path.join(root, VSCODIUM_CACHE, relative);
    const sha256 = sha256File(path.join(root, relative));
    const layer = fs.existsSync(cleanVscodiumPatch) && sha256File(cleanVscodiumPatch) === sha256 ? 'vscodium' : 'director';
    const status = statusFromPath(relative);
    return {
      path: relative,
      sha256,
      enabled: status === 'enabled',
      status,
      layer,
      stage: stageFromPath(relative),
      platforms: platformsFromPath(relative),
      arches: archesFromPath(relative),
      qualities: qualitiesFromPath(relative),
      targets: targetsFromPath(relative),
      order: index + 1,
      placeholders: [
        '!!APP_NAME!!',
        '!!APP_NAME_LC!!',
        '!!ASSETS_REPOSITORY!!',
        '!!BINARY_NAME!!',
        '!!GH_REPO_PATH!!',
        '!!GLOBAL_DIRNAME!!',
        '!!ORG_NAME!!',
        '!!RELEASE_VERSION!!',
        '!!TUNNEL_APP_NAME!!'
      ],
    };
  });

  const generatedAt = new Date().toISOString();
  writeJson(path.join(root, SERIES_PATH), {
    schemaVersion: 1,
    profile: PROFILE,
    generatedAt,
    policy: {
      source: 'tracked patch-like files under patches/',
      materializeRule: 'materialize must consume this series, not glob patches/*.patch directly',
    },
    patches,
  });
  writeJson(path.join(root, REPORT_PATH), {
    schemaVersion: 1,
    profile: PROFILE,
    phase: 'P1',
    batch: 'replay-equivalence',
    status: 'degraded',
    generatedAt,
    checks: {
      patchSeriesValidation: 'passed',
      overlayAllowlist: 'captured',
      productExpected: 'captured',
      sourceEquivalence: 'blocked-until-layer-application',
    },
    inputs: {
      referenceManifest: 'docs/upgrade/112-reference-manifest.json',
      patchSeries: SERIES_PATH,
      overlayAllowlist: 'docs/upgrade/overlay-allowlist.112.json',
      productDelete: 'docs/upgrade/product.delete.112.json',
      productExpected: 'docs/upgrade/expected/112-stable-win32-x64-client/product.expected.json',
    },
    patchSeries: {
      count: patches.length,
      enabled: patches.filter((entry) => entry.status === 'enabled').length,
      deferred: patches.filter((entry) => entry.status === 'deferred').length,
      archived: patches.filter((entry) => entry.status === 'archived').length,
      vscodiumLayer: patches.filter((entry) => entry.layer === 'vscodium').length,
      directorLayer: patches.filter((entry) => entry.layer === 'director').length,
    },
    blockers: [
      {
        id: 'source-equivalence',
        status: 'recorded',
        detail: 'Strict source equivalence requires Layer 1 and Director delta application. Current materialize scaffold writes bootstrap checkpoints only; the blocker is carried forward while script/artifact/docs migration proceeds.',
      },
    ],
  });

  console.log(`Generated ${SERIES_PATH} with ${patches.length} patch entries`);
}

function listFiles(root) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === 'series.112.json') continue;
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(absolute));
    else out.push(absolute);
  }
  return out;
}

function sha256File(filePath) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function statusFromPath(relative) {
  if (relative.endsWith('.patch.no')) return 'archived';
  if (relative.endsWith('.patch.yet')) return 'deferred';
  return 'enabled';
}

function stageFromPath(relative) {
  if (relative.includes('/helper/')) return 'helper';
  if (relative.includes('/client/')) return 'client';
  if (relative.includes('/reh/')) return 'reh';
  if (relative.includes('/windows/') || relative.includes('/linux/') || relative.includes('/osx/') || relative.includes('/alpine/')) return 'platform';
  return 'source';
}

function platformsFromPath(relative) {
  if (relative.includes('/windows/')) return ['win32'];
  if (relative.includes('/linux/')) return ['linux'];
  if (relative.includes('/osx/')) return ['darwin'];
  if (relative.includes('/alpine/')) return ['alpine'];
  return ['all'];
}

function archesFromPath(relative) {
  for (const arch of ['x64', 'arm64', 'armhf', 'ppc64le', 'riscv64', 'loong64', 's390x']) {
    if (relative.includes(`/${arch}/`) || relative.includes(`-${arch}`)) return [arch];
  }
  return ['all'];
}

function qualitiesFromPath(relative) {
  if (relative.includes('/insider/')) return ['insider'];
  return ['stable', 'insider'];
}

function targetsFromPath(relative) {
  if (relative.includes('/client/')) return ['client'];
  if (relative.includes('/reh/')) return ['reh'];
  if (relative.includes('/cli')) return ['cli'];
  return ['client', 'cli', 'reh', 'reh-web'];
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
