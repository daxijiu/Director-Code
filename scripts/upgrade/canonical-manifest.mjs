#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { getWorkspaceRoot, toPosix, writeJson, run } from './reference-manifest-lib.mjs';

const PROFILE_INDEX = 'docs/upgrade/profiles/index.json';
const MANIFEST_SCHEMA = 'docs/upgrade/schemas/canonical-manifest.schema.json';

function main() {
  const root = getWorkspaceRoot();
  const args = parseArgs(process.argv.slice(2));
  const profile = loadProfile(root, args.profile);
  if (profile.validationMode !== 'canonical-replay') {
    throw new Error(`Canonical manifests are only supported for canonical-replay profiles: ${profile.profile}`);
  }

  const sourceRoot = args.source || profile.artifactPaths.directorSource;
  const sourceAbsolute = path.join(root, sourceRoot);
  if (!fs.existsSync(sourceAbsolute)) {
    throw new Error(`Canonical source root does not exist: ${sourceRoot}`);
  }

  const manifest = buildManifest(profile, sourceRoot, sourceAbsolute);
  const manifestPath = args.output || profile.canonicalManifestPath;

  if (args.write) {
    writeJson(path.join(root, manifestPath), manifest);
    run('node', ['scripts/upgrade/validate-json.mjs', MANIFEST_SCHEMA, manifestPath], { cwd: root });
    writeReport(root, profile, manifest, manifestPath, 'write', []);
    console.log(`wrote canonical manifest ${manifestPath}`);
    return;
  }

  if (!fs.existsSync(path.join(root, manifestPath))) {
    throw new Error(`Missing canonical manifest: ${manifestPath}. Re-run with --write after reviewing the generated tree.`);
  }
  run('node', ['scripts/upgrade/validate-json.mjs', MANIFEST_SCHEMA, manifestPath], { cwd: root });
  const expected = JSON.parse(fs.readFileSync(path.join(root, manifestPath), 'utf8'));
  const failures = compareManifest(expected, manifest);
  writeReport(root, profile, manifest, manifestPath, 'validate', failures);
  if (failures.length > 0) {
    throw new Error(`Canonical manifest drift for ${profile.profile}\n${failures.slice(0, 100).join('\n')}`);
  }
  console.log(`canonical manifest matches ${manifestPath}`);
}

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--profile') out.profile = argv[++index];
    else if (arg === '--source') out.source = argv[++index];
    else if (arg === '--output') out.output = argv[++index];
    else if (arg === '--write') out.write = true;
    else throw new Error(`Unknown canonical-manifest argument: ${arg}`);
  }
  return out;
}

function loadProfile(root, requestedProfile) {
  const index = JSON.parse(fs.readFileSync(path.join(root, PROFILE_INDEX), 'utf8'));
  const profileId = requestedProfile || index.activeProfile;
  const entry = index.profiles.find((candidate) => candidate.profile === profileId || candidate.path === profileId);
  if (!entry) {
    throw new Error(`Profile not found in ${PROFILE_INDEX}: ${profileId}`);
  }
  return JSON.parse(fs.readFileSync(path.join(root, entry.path), 'utf8'));
}

function buildManifest(profile, sourceRoot, sourceAbsolute) {
  const files = [];
  collectEntries(sourceAbsolute, sourceAbsolute, files);
  files.sort((left, right) => left.path.localeCompare(right.path));
  return {
    schemaVersion: 1,
    profile: profile.profile,
    sourceRoot,
    generatedAt: new Date().toISOString(),
    treeHash: treeHash(files),
    caseInsensitivePathCollisions: caseInsensitivePathCollisions(files),
    files,
  };
}

function collectEntries(root, current, out) {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name);
    const relative = toPosix(path.relative(root, absolute));
    if (shouldExcludeSourceEntry(entry.name, relative)) continue;
    if (entry.isDirectory()) {
      collectEntries(root, absolute, out);
    } else if (entry.isSymbolicLink()) {
      out.push({
        path: relative,
        sha256: sha256Buffer(Buffer.from(fs.readlinkSync(absolute))),
        mode: fs.lstatSync(absolute).mode,
        type: 'symlink',
        linkTarget: fs.readlinkSync(absolute),
      });
    } else if (entry.isFile()) {
      out.push({
        path: relative,
        sha256: sha256File(absolute),
        mode: fs.statSync(absolute).mode,
        type: 'file',
      });
    }
  }
}

function treeHash(files) {
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file.path);
    hash.update('\0');
    hash.update(file.sha256);
    hash.update('\0');
    hash.update(String(file.mode));
    hash.update('\0');
    hash.update(file.type);
    hash.update('\0');
    hash.update(file.linkTarget || '');
    hash.update('\0');
  }
  return hash.digest('hex');
}

function caseInsensitivePathCollisions(files) {
  const seen = new Map();
  const collisions = [];
  for (const file of files) {
    const key = file.path.toLowerCase();
    if (seen.has(key) && seen.get(key) !== file.path) {
      collisions.push([seen.get(key), file.path]);
    } else {
      seen.set(key, file.path);
    }
  }
  return collisions;
}

function compareManifest(expected, actual) {
  const failures = [];
  if (expected.profile !== actual.profile) failures.push(`profile mismatch expected=${expected.profile} actual=${actual.profile}`);
  if (expected.sourceRoot !== actual.sourceRoot) failures.push(`sourceRoot mismatch expected=${expected.sourceRoot} actual=${actual.sourceRoot}`);
  if (expected.treeHash !== actual.treeHash) failures.push(`treeHash mismatch expected=${expected.treeHash} actual=${actual.treeHash}`);
  if (JSON.stringify(expected.caseInsensitivePathCollisions || []) !== JSON.stringify(actual.caseInsensitivePathCollisions || [])) {
    failures.push('caseInsensitivePathCollisions mismatch');
  }

  const expectedFiles = new Map((expected.files || []).map((entry) => [entry.path, entry]));
  const actualFiles = new Map((actual.files || []).map((entry) => [entry.path, entry]));
  for (const [filePath, expectedEntry] of expectedFiles) {
    const actualEntry = actualFiles.get(filePath);
    if (!actualEntry) {
      failures.push(`${filePath}: missing`);
      continue;
    }
    for (const key of ['sha256', 'mode', 'type', 'linkTarget']) {
      if ((expectedEntry[key] || '') !== (actualEntry[key] || '')) {
        failures.push(`${filePath}: ${key} mismatch expected=${expectedEntry[key]} actual=${actualEntry[key]}`);
      }
    }
  }
  for (const filePath of actualFiles.keys()) {
    if (!expectedFiles.has(filePath)) {
      failures.push(`${filePath}: extra`);
    }
  }
  return failures;
}

function writeReport(root, profile, manifest, manifestPath, mode, failures) {
  const report = {
    schemaVersion: 1,
    profile: profile.profile,
    phase: profile.validationMode === 'canonical-replay' ? 'P2' : 'P1',
    batch: 'canonical-manifest',
    status: failures.length === 0 ? 'passed' : 'failed',
    generatedAt: new Date().toISOString(),
    mode,
    manifest: toPosix(manifestPath),
    sourceRoot: manifest.sourceRoot,
    treeHash: manifest.treeHash,
    fileCount: manifest.files.length,
    caseInsensitivePathCollisions: manifest.caseInsensitivePathCollisions,
    checks: {
      schema: 'passed',
      manifestMatch: failures.length === 0 ? 'passed' : 'failed',
    },
    failures,
  };

  const reportPaths = new Set();
  if (profile.reportPaths?.canonicalManifest) reportPaths.add(profile.reportPaths.canonicalManifest);
  if (profile.artifactPaths?.generatedReports) {
    reportPaths.add(path.join(profile.artifactPaths.generatedReports, 'canonical-manifest-report.json'));
  }
  if (profile.artifactPaths?.committedReports) {
    reportPaths.add(path.join(profile.artifactPaths.committedReports, 'canonical-manifest-report.json'));
  }
  for (const reportPath of reportPaths) {
    writeJson(path.join(root, reportPath), report);
  }
}

function sha256File(filePath) {
  return sha256Buffer(fs.readFileSync(filePath));
}

function sha256Buffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function shouldExcludeSourceEntry(baseName, relativePath) {
  if (!relativePath) return false;
  return baseName === '.git'
    || baseName === 'upstream-cache-manifest.json'
    || baseName === 'node_modules'
    || baseName === '.build'
    || baseName === '.cache'
    || baseName === 'out'
    || baseName === 'out-build'
    || baseName === 'out-editor-src'
    || baseName === 'out-editor-build'
    || baseName === 'out-vscode'
    || baseName === 'out-vscode-min'
    || baseName === 'out-vscode-reh'
    || baseName === 'out-vscode-reh-min'
    || baseName === 'out-vscode-reh-web'
    || baseName === 'out-vscode-reh-web-min'
    || relativePath === 'src/vs/base/browser/ui/codicons/codicon/codicon.ttf'
    || baseName === '.eslintcache';
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
