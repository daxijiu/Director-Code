#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { getWorkspaceRoot, run, runMaybe, toPosix, writeJson } from './reference-manifest-lib.mjs';

const PROFILE_ID = '116-stable-win32-x64-client';
const ESTIMATOR_ID = '112-to-116';
const ESTIMATOR_ROOT = `.cache/upgrade-estimator/${ESTIMATOR_ID}`;
const REPORT_PATH = `docs/upgrade/reports/${PROFILE_ID}/upgrade-estimator-report.json`;
const VSCODE_116_CACHE = '.cache/upstreams/vscode/1.116.0';
const VSCODIUM_116_CACHE = '.cache/upstreams/vscodium/1.116.02821';
const DIRECTOR_DELTA_112 = 'patches/replay/002-director-delta.112.patch';

const TARGETS = {
  vscode: {
    remote: 'https://github.com/microsoft/vscode.git',
    tag: '1.116.0',
    commit: '560a9dba96f961efea7b1612916f89e5d5d4d679',
  },
  vscodium: {
    remote: 'https://github.com/VSCodium/vscodium.git',
    tag: '1.116.02821',
    commit: 'f4d12efa852f25f6e055ac0b4c79f57a882af4e7',
  },
};

const VSCODIUM_PLACEHOLDERS = {
  '!!APP_NAME!!': 'VSCodium',
  '!!APP_NAME_LC!!': 'vscodium',
  '!!ASSETS_REPOSITORY!!': 'VSCodium/vscodium',
  '!!BINARY_NAME!!': 'codium',
  '!!GH_REPO_PATH!!': 'VSCodium/vscodium',
  '!!GLOBAL_DIRNAME!!': 'vscodium',
  '!!ORG_NAME!!': 'VSCodium',
  '!!RELEASE_VERSION!!': '1.116.02821',
  '!!TUNNEL_APP_NAME!!': 'codium-tunnel',
};

function main() {
  const root = getWorkspaceRoot();
  assertCache(root, VSCODE_116_CACHE, TARGETS.vscode);
  assertCache(root, VSCODIUM_116_CACHE, TARGETS.vscodium);
  safeDelete(root, ESTIMATOR_ROOT);

  const vscodeLayer = path.join(root, ESTIMATOR_ROOT, 'layers', 'vscode', 'vscode');
  const vscodiumLayer = path.join(root, ESTIMATOR_ROOT, 'layers', 'vscodium', 'vscode');
  copyTree(path.join(root, VSCODE_116_CACHE), vscodeLayer);
  copyTree(vscodeLayer, vscodiumLayer);

  const vscodiumResult = materializeVscodium116(root, vscodiumLayer);
  const directorDeltaResult = checkDirectorDelta(root, vscodiumLayer);
  const summary = summarizeUpgrade(vscodiumResult, directorDeltaResult);
  const reportStatus = vscodiumResult.status === 'passed' && directorDeltaResult.status === 'passed'
    ? 'passed'
    : vscodiumResult.status === 'passed' ? 'degraded' : 'failed';
  const report = {
    schemaVersion: 1,
    profile: PROFILE_ID,
    phase: 'P2',
    batch: 'upgrade-estimator',
    status: reportStatus,
    generatedAt: new Date().toISOString(),
    scope: {
      from: '112-stable-win32-x64-client',
      to: PROFILE_ID,
      platform: 'win32',
      arch: 'x64',
      target: 'client',
    },
    upstreams: TARGETS,
    cachePaths: {
      vscode: VSCODE_116_CACHE,
      vscodium: VSCODIUM_116_CACHE,
      estimatorRoot: ESTIMATOR_ROOT,
    },
    checks: {
      cleanVscode116Cache: 'passed',
      cleanVscodium116Cache: 'passed',
      vscodium116LayerApplication: vscodiumResult.status,
      director112DeltaOnVscodium116: directorDeltaResult.status,
    },
    summary,
    vscodiumLayer: vscodiumResult,
    directorDelta: directorDeltaResult,
  };

  writeJson(path.join(root, REPORT_PATH), report);
  console.log(`upgrade estimator report: ${REPORT_PATH}`);
  if (report.status !== 'passed') {
    process.exitCode = 2;
  }
}

function assertCache(root, relative, upstream) {
  const cachePath = path.join(root, relative);
  if (!fs.existsSync(path.join(cachePath, '.git'))) {
    throw new Error(`Missing upstream cache: ${relative}`);
  }
  run('git', ['-C', cachePath, 'config', 'core.autocrlf', 'false'], { cwd: root });
  const head = run('git', ['-C', cachePath, 'rev-parse', 'HEAD'], { cwd: root }).trim();
  if (head !== upstream.commit) {
    throw new Error(`${relative} is at ${head}, expected ${upstream.commit}`);
  }
}

function safeDelete(root, relative) {
  if (fs.existsSync(path.join(root, relative))) {
    run('bash', ['scripts/upgrade/safe-delete.sh', relative], { cwd: root });
  }
}

function materializeVscodium116(root, layerPath) {
  const vscodiumRoot = path.join(root, VSCODIUM_116_CACHE);
  copyContents(path.join(vscodiumRoot, 'src', 'stable'), layerPath);
  fs.copyFileSync(path.join(vscodiumRoot, 'LICENSE'), path.join(layerPath, 'LICENSE.txt'));
  fs.rmSync(path.join(layerPath, 'extensions', 'copilot'), { recursive: true, force: true });

  const patchPaths = [
    ...listPatchFiles(path.join(vscodiumRoot, 'patches')),
    ...listPatchFiles(path.join(vscodiumRoot, 'patches', 'windows')),
    ...listPatchFiles(path.join(vscodiumRoot, 'patches', 'user')),
  ];
  const applied = [];
  const failures = [];
  withTemporaryGit(root, layerPath, () => {
    for (const patchPath of patchPaths) {
      const preparedPatch = preparePatch(root, patchPath, VSCODIUM_PLACEHOLDERS);
      const result = runMaybe('git', ['-C', layerPath, 'apply', '--ignore-whitespace', preparedPatch], { cwd: root });
      const relative = toPosix(path.relative(vscodiumRoot, patchPath));
      if (result.status === 0) {
        applied.push({
          path: relative,
          sha256: sha256File(patchPath),
        });
        continue;
      }
      failures.push({
        path: relative,
        sha256: sha256File(patchPath),
        stderr: trimLines(result.stderr || result.stdout),
      });
      break;
    }
  });

  return {
    status: failures.length === 0 ? 'passed' : 'failed',
    layerPath: toPosix(path.relative(root, layerPath)),
    appliedCount: applied.length,
    failedCount: failures.length,
    applied,
    failures,
    fileManifestHash: failures.length === 0 ? treeHash(layerPath) : 'not-complete',
  };
}

function checkDirectorDelta(root, layerPath) {
  const patchPath = path.join(root, DIRECTOR_DELTA_112);
  const result = withTemporaryGit(root, layerPath, () => runMaybe(
    'git',
    ['-C', layerPath, 'apply', '--check', '--binary', '--whitespace=nowarn', patchPath],
    { cwd: root },
  ));
  const output = result.stderr || result.stdout || '';
  return {
    status: result.status === 0 ? 'passed' : 'failed',
    patch: DIRECTOR_DELTA_112,
    sha256: sha256File(patchPath),
    failedPaths: parseFailedPatchPaths(output),
    stderr: trimLines(output, 120),
  };
}

function withTemporaryGit(root, layerPath, callback) {
  run('git', ['-C', layerPath, 'init', '-q'], { cwd: root });
  run('git', ['-C', layerPath, 'config', 'core.autocrlf', 'false'], { cwd: root });
  try {
    return callback();
  } finally {
    fs.rmSync(path.join(layerPath, '.git'), { recursive: true, force: true });
  }
}

function preparePatch(root, patchPath, replacements) {
  let content = fs.readFileSync(patchPath, 'utf8');
  for (const [token, value] of Object.entries(replacements)) {
    content = content.split(token).join(value);
  }
  const relative = toPosix(path.relative(path.join(root, VSCODIUM_116_CACHE), patchPath));
  const prepared = path.join(root, ESTIMATOR_ROOT, 'prepared-patches', relative);
  fs.mkdirSync(path.dirname(prepared), { recursive: true });
  fs.writeFileSync(prepared, content, 'utf8');
  return prepared;
}

function listPatchFiles(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.patch'))
    .map((entry) => path.join(directory, entry.name))
    .sort((left, right) => path.basename(left).localeCompare(path.basename(right)));
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

function copyContents(source, destination) {
  if (!fs.existsSync(source)) {
    return;
  }
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    fs.cpSync(path.join(source, entry.name), path.join(destination, entry.name), {
      recursive: true,
      verbatimSymlinks: true,
      force: true,
    });
  }
}

function parseFailedPatchPaths(output) {
  const paths = new Set();
  for (const line of output.split(/\r?\n/)) {
    const failed = line.match(/^error: patch failed: ([^:]+):\d+/);
    const notApply = line.match(/^error: ([^:]+): patch does not apply/);
    const noFile = line.match(/^error: ([^:]+): No such file or directory/);
    const match = failed || notApply || noFile;
    if (match) {
      paths.add(toPosix(match[1]));
    }
  }
  return [...paths].sort();
}

function summarizeUpgrade(vscodiumResult, directorDeltaResult) {
  const failedPaths = directorDeltaResult.failedPaths || [];
  return {
    vscodiumAppliedPatchCount: vscodiumResult.appliedCount,
    vscodiumFailedPatchCount: vscodiumResult.failedCount,
    directorFailedPathCount: failedPaths.length,
    directorFailedPathGroups: groupFailedPaths(failedPaths),
    nextActions: failedPaths.length === 0
      ? ['Generate 116 replay patches and run full materialization.']
      : ['Port Director delta conflicts to a 116 replay patch before full materialization.'],
  };
}

function groupFailedPaths(paths) {
  const groups = {
    build: 0,
    chat: 0,
    extensions: 0,
    productPackage: 0,
    terminal: 0,
    other: 0,
  };
  for (const filePath of paths) {
    if (filePath.startsWith('build/')) groups.build += 1;
    else if (filePath === 'package.json' || filePath.startsWith('product') || filePath.startsWith('resources/server/')) {
      groups.productPackage += 1;
    } else if (filePath.includes('/terminal')) groups.terminal += 1;
    else if (filePath.includes('/contrib/chat/')) groups.chat += 1;
    else if (filePath.includes('/contrib/extensions/')) groups.extensions += 1;
    else groups.other += 1;
  }
  return groups;
}

function trimLines(value, maxLines = 40) {
  const lines = value.trim().split(/\r?\n/).filter(Boolean);
  return lines.slice(0, maxLines);
}

function treeHash(root) {
  const files = [];
  collectFiles(root, files);
  const digest = createHash('sha256');
  for (const file of files.sort()) {
    digest.update(toPosix(path.relative(root, file)));
    digest.update('\0');
    digest.update(fs.readFileSync(file));
    digest.update('\0');
  }
  return digest.digest('hex');
}

function collectFiles(root, out) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) collectFiles(absolute, out);
    else out.push(absolute);
  }
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
