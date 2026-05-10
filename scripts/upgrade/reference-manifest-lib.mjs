import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const PROFILE_ID = '112-stable-win32-x64-client';
export const REFERENCE_DIR = 'vscode';
export const MANIFEST_PATH = 'docs/upgrade/112-reference-manifest.json';
export const EXPECTED_DIR = `docs/upgrade/expected/${PROFILE_ID}`;
export const REPORT_DIR = `docs/upgrade/reports/${PROFILE_ID}`;
export const CACHE_REFERENCE_DIR = '.cache/reference/112';
export const REFERENCE_WRITE_MARKER = `${CACHE_REFERENCE_DIR}/reference-write-override.jsonl`;

const MAX_BUFFER = 256 * 1024 * 1024;

export function toPosix(value) {
  return value.replace(/\\/g, '/');
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: MAX_BUFFER,
    ...options,
  });

  if (result.status !== 0) {
    const rendered = [command, ...args].join(' ');
    throw new Error(
      `Command failed (${result.status}): ${rendered}\n${result.stderr || result.stdout || ''}`,
    );
  }

  return result.stdout;
}

export function runMaybe(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: MAX_BUFFER,
    ...options,
  });
}

export function getWorkspaceRoot() {
  return toPosix(run('git', ['rev-parse', '--show-toplevel']).trim());
}

export function splitNul(output) {
  if (!output) {
    return [];
  }

  return output.split('\0').filter(Boolean).map(toPosix);
}

export function gitList(root, args) {
  return splitNul(run('git', args, { cwd: root }));
}

export function sha256Buffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function sha256File(filePath) {
  return sha256Buffer(fs.readFileSync(filePath));
}

export function stableJson(value) {
  return JSON.stringify(sortObject(value));
}

export function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function sortObject(value) {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortObject(value[key])]),
  );
}

function normalizedContent(buffer) {
  if (buffer.includes(0)) {
    return buffer;
  }

  const bytes = [];
  for (let index = 0; index < buffer.length; index += 1) {
    const current = buffer[index];
    const next = buffer[index + 1];
    if (current === 13 && next === 10) {
      continue;
    }
    bytes.push(current);
  }

  return Buffer.from(bytes);
}

function parseLsFilesStage(output, stripPrefix = '') {
  const modes = new Map();

  for (const record of output.split('\0').filter(Boolean)) {
    const tab = record.indexOf('\t');
    if (tab === -1) {
      continue;
    }

    const meta = record.slice(0, tab).split(/\s+/);
    let filePath = toPosix(record.slice(tab + 1));
    if (stripPrefix && filePath.startsWith(stripPrefix)) {
      filePath = filePath.slice(stripPrefix.length);
    }
    modes.set(filePath, meta[0]);
  }

  return modes;
}

function parsePorcelainStatus(output) {
  const records = output.split('\0').filter(Boolean);
  const statuses = new Map();

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const xy = record.slice(0, 2);
    const filePath = toPosix(record.slice(3));
    const status = { xy };

    if (xy.includes('R') || xy.includes('C')) {
      status.oldPath = toPosix(records[index + 1] || '');
      index += 1;
    }

    statuses.set(filePath, status);
  }

  return statuses;
}

function fileModeFromStat(stat, symlink) {
  if (symlink) {
    return '120000';
  }

  return (stat.mode & 0o111) !== 0 ? '100755' : '100644';
}

function readReferenceBytes(root, relativePath, symlink) {
  const absolutePath = path.join(root, REFERENCE_DIR, relativePath);
  if (symlink) {
    return Buffer.from(toPosix(fs.readlinkSync(absolutePath)), 'utf8');
  }

  return fs.readFileSync(absolutePath);
}

export function hashReferenceSnapshot(entries, deleted = []) {
  const compact = {
    deleted: deleted.map((entry) => ({
      path: entry.path,
      provenance: entry.provenance,
      status: entry.innerStatus,
    })),
    files: entries.map((entry) => ({
      path: entry.path,
      kind: entry.kind,
      mode: entry.mode,
      rawSha256: entry.rawSha256,
      normalizedSha256: entry.normalizedSha256,
      provenance: entry.provenance,
    })),
  };

  return sha256Buffer(Buffer.from(stableJson(compact), 'utf8'));
}

export function collectReference(root) {
  const referenceRoot = path.join(root, REFERENCE_DIR);
  if (!fs.existsSync(referenceRoot)) {
    throw new Error(`Reference directory is missing: ${REFERENCE_DIR}`);
  }

  const outerTrackedFull = gitList(root, ['ls-files', '-z', REFERENCE_DIR]);
  const outerTracked = new Set(
    outerTrackedFull
      .filter((filePath) => filePath.startsWith(`${REFERENCE_DIR}/`))
      .map((filePath) => filePath.slice(REFERENCE_DIR.length + 1)),
  );
  const innerTracked = new Set(gitList(root, ['-C', REFERENCE_DIR, 'ls-files', '-z']));
  const innerUntracked = new Set(
    gitList(root, ['-C', REFERENCE_DIR, 'ls-files', '-z', '--others', '--exclude-standard']),
  );
  const innerIgnored = new Set(
    gitList(root, ['-C', REFERENCE_DIR, 'ls-files', '-z', '--others', '-i', '--exclude-standard']),
  );

  const outerModes = parseLsFilesStage(
    run('git', ['ls-files', '-s', '-z', REFERENCE_DIR], { cwd: root }),
    `${REFERENCE_DIR}/`,
  );
  const innerModes = parseLsFilesStage(
    run('git', ['-C', REFERENCE_DIR, 'ls-files', '-s', '-z'], { cwd: root }),
  );
  const innerStatus = parsePorcelainStatus(
    run('git', ['-C', REFERENCE_DIR, 'status', '--porcelain=v1', '-z', '-uall'], { cwd: root }),
  );

  const union = new Set([...outerTracked, ...innerTracked, ...innerUntracked]);
  const files = [];
  const deleted = [];

  for (const relativePath of [...union].sort()) {
    const absolutePath = path.join(referenceRoot, relativePath);
    const provenance = {
      outerTracked: outerTracked.has(relativePath),
      innerTracked: innerTracked.has(relativePath),
      innerUntracked: innerUntracked.has(relativePath),
      innerIgnored: innerIgnored.has(relativePath),
      outerOnly: outerTracked.has(relativePath) && !innerTracked.has(relativePath) && !innerUntracked.has(relativePath),
    };
    const status = innerStatus.get(relativePath)?.xy || '';

    if (!fs.existsSync(absolutePath)) {
      deleted.push({
        path: relativePath,
        sourceClass: 'reference-only',
        equivalenceScope: 'p1-strict',
        provenance,
        innerStatus: status || 'missing',
        archive: false,
      });
      continue;
    }

    const stat = fs.lstatSync(absolutePath);
    if (stat.isDirectory()) {
      continue;
    }

    const symlink = stat.isSymbolicLink();
    const rawBytes = readReferenceBytes(root, relativePath, symlink);
    const normalizedBytes = normalizedContent(rawBytes);
    const mode = innerModes.get(relativePath) || outerModes.get(relativePath) || fileModeFromStat(stat, symlink);

    files.push({
      path: relativePath,
      kind: symlink ? 'symlink' : 'file',
      size: rawBytes.length,
      mode,
      rawSha256: sha256Buffer(rawBytes),
      normalizedSha256: sha256Buffer(normalizedBytes),
      sourceClass: 'reference-only',
      equivalenceScope: 'p1-strict',
      provenance,
      innerStatus: status,
      archive: true,
    });
  }

  const ignoredUntracked = [...innerIgnored].sort();
  const caseCollisions = collectCaseCollisions(files.map((entry) => entry.path));

  return {
    files,
    deleted,
    caseCollisions,
    counts: {
      outerTracked: outerTracked.size,
      innerTracked: innerTracked.size,
      innerUntracked: innerUntracked.size,
      innerIgnored: innerIgnored.size,
      archivedFiles: files.length,
      deleted: deleted.length,
    },
    audits: {
      ignoredUntracked: {
        count: ignoredUntracked.length,
        listSha256: sha256Buffer(Buffer.from(`${ignoredUntracked.join('\n')}\n`, 'utf8')),
        samples: ignoredUntracked.slice(0, 50),
      },
    },
    referenceFilesHash: hashReferenceSnapshot(files, deleted),
  };
}

function collectCaseCollisions(paths) {
  const byLowercase = new Map();
  for (const filePath of paths) {
    const lower = filePath.toLocaleLowerCase('en-US');
    const group = byLowercase.get(lower) || [];
    group.push(filePath);
    byLowercase.set(lower, group);
  }

  return [...byLowercase.values()]
    .filter((group) => new Set(group).size > 1)
    .map((group) => [...new Set(group)].sort());
}

export function assertNoCaseCollisions(snapshot) {
  if (snapshot.caseCollisions.length > 0) {
    throw new Error(`Case-insensitive path collisions found: ${JSON.stringify(snapshot.caseCollisions.slice(0, 10))}`);
  }
}

export function assertSnapshotUnchanged(before, after) {
  if (before.referenceFilesHash !== after.referenceFilesHash) {
    throw new Error(
      `Reference drift during freeze: ${before.referenceFilesHash} -> ${after.referenceFilesHash}`,
    );
  }
}

export function rel(root, filePath) {
  return toPosix(path.relative(root, filePath));
}
