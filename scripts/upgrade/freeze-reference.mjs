#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { once } from 'node:events';
import zlib from 'node:zlib';
import {
  CACHE_REFERENCE_DIR,
  EXPECTED_DIR,
  MANIFEST_PATH,
  PROFILE_ID,
  REFERENCE_DIR,
  REPORT_DIR,
  assertNoCaseCollisions,
  assertSnapshotUnchanged,
  collectReference,
  getWorkspaceRoot,
  rel,
  run,
  runMaybe,
  sha256Buffer,
  sha256File,
  toPosix,
  writeJson,
} from './reference-manifest-lib.mjs';

const REQUIRED_BRANCH = 'refactor/112-replay-baseline';

async function main() {
  const root = getWorkspaceRoot();
  const branch = run('git', ['branch', '--show-current'], { cwd: root }).trim();
  if (branch !== REQUIRED_BRANCH) {
    throw new Error(`Refusing to freeze on ${branch || '(detached)'}; expected ${REQUIRED_BRANCH}`);
  }

  const outerCommit = run('git', ['rev-parse', 'HEAD'], { cwd: root }).trim();
  const outerReferenceStatus = run('git', ['status', '--short', '--', REFERENCE_DIR], { cwd: root })
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);

  const innerHead = run('git', ['-C', REFERENCE_DIR, 'rev-parse', 'HEAD'], { cwd: root }).trim();
  const innerBranch = run('git', ['-C', REFERENCE_DIR, 'branch', '--show-current'], { cwd: root }).trim();
  const innerStatusShort = run('git', ['-C', REFERENCE_DIR, 'status', '--short', '--branch'], { cwd: root })
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);

  const before = collectReference(root);
  assertNoCaseCollisions(before);

  const archive = await createReferenceArchive(root, before.files);
  const expected = captureExpectedFiles(root);
  const after = collectReference(root);
  assertSnapshotUnchanged(before, after);

  const generatedAt = new Date().toISOString();
  const manifest = {
    schemaVersion: 1,
    profile: PROFILE_ID,
    phase: 'P1',
    batch: 'freeze',
    generatedAt,
    referenceRoot: REFERENCE_DIR,
    outer: {
      branch,
      commit: outerCommit,
      referenceStatus: outerReferenceStatus,
    },
    inner: {
      branch: innerBranch,
      head: innerHead,
      status: innerStatusShort,
    },
    environmentAllowlist: [
      'APP_NAME',
      'BINARY_NAME',
      'BUILD_SOURCEVERSION',
      'OS_NAME',
      'RELEASE_VERSION',
      'VSCODE_ARCH',
      'VSCODE_QUALITY',
    ],
    archive,
    counts: before.counts,
    audits: before.audits,
    referenceFilesHash: before.referenceFilesHash,
    caseInsensitivePathCollisions: before.caseCollisions,
    deleted: before.deleted,
    files: before.files,
  };

  const manifestPath = path.join(root, MANIFEST_PATH);
  writeJson(manifestPath, manifest);
  const manifestHash = sha256File(manifestPath);

  const hygiene = runHygieneScan(root, [MANIFEST_PATH, ...expected.map((entry) => entry.path)]);
  const report = {
    schemaVersion: 1,
    profile: PROFILE_ID,
    phase: 'P1',
    batch: 'freeze',
    status: 'passed',
    generatedAt,
    manifest: {
      path: MANIFEST_PATH,
      sha256: manifestHash,
      referenceFilesHash: before.referenceFilesHash,
    },
    archive,
    expected,
    checks: {
      archiveCreated: 'passed',
      referenceDriftDuringFreeze: 'passed',
      caseInsensitivePathCollisions: 'passed',
      hygiene: hygiene.status,
    },
    hygiene,
  };

  writeJson(path.join(root, REPORT_DIR, 'freeze-report.json'), report);

  console.log(`Reference manifest: ${MANIFEST_PATH}`);
  console.log(`Reference archive: ${archive.path}`);
  console.log(`Reference files hash: ${before.referenceFilesHash}`);
}

async function createReferenceArchive(root, files) {
  const cacheDir = path.join(root, CACHE_REFERENCE_DIR);
  fs.mkdirSync(cacheDir, { recursive: true });

  const fileListPath = path.join(cacheDir, 'vscode-reference-filelist.txt');
  const fileList = files.map((entry) => entry.path).sort();
  fs.writeFileSync(fileListPath, fileList.join('\n'), 'utf8');

  let archivePath = path.join(cacheDir, 'vscode-reference.tar.zst');
  let format = 'tar.zst';
  let command = 'node scripts/upgrade/freeze-reference.mjs internal-tar | zstd';
  const zstdResult = runMaybe('zstd', ['--version'], { cwd: root });

  if (zstdResult.status === 0) {
    archivePath = path.join(cacheDir, 'vscode-reference.tar.gz');
    format = 'tar.gz';
    command = 'node scripts/upgrade/freeze-reference.mjs internal-tar-gzip';
    await writeTarGzArchive(root, archivePath, files);
  } else {
    archivePath = path.join(cacheDir, 'vscode-reference.tar.gz');
    format = 'tar.gz';
    command = 'node scripts/upgrade/freeze-reference.mjs internal-tar-gzip';
    await writeTarGzArchive(root, archivePath, files);
  }

  return {
    path: rel(root, archivePath),
    format,
    sha256: sha256File(archivePath),
    fileListPath: rel(root, fileListPath),
    fileListSha256: sha256Buffer(Buffer.from(fileList.join('\n'), 'utf8')),
    fileCount: fileList.length,
    command,
    tools: {
      tar: 'scripts/upgrade/freeze-reference.mjs node tar writer',
      zstd: zstdResult.status === 0 ? 'available; gzip fallback used by node writer' : 'unavailable; used gzip fallback',
      gzip: `node ${process.version} zlib`,
    },
  };
}

async function writeTarGzArchive(root, archivePath, files) {
  const output = fs.createWriteStream(archivePath);
  const gzip = zlib.createGzip({ level: 9 });
  gzip.pipe(output);

  let index = 0;
  for (const entry of files) {
    await writeTarEntry(gzip, root, entry, index);
    index += 1;
  }

  await writeStream(gzip, Buffer.alloc(1024));
  gzip.end();
  await once(output, 'finish');
}

async function writeTarEntry(stream, root, entry, index) {
  const absolutePath = path.join(root, REFERENCE_DIR, entry.path);
  const symlink = entry.kind === 'symlink';
  const body = symlink ? Buffer.alloc(0) : fs.readFileSync(absolutePath);
  const linkPath = symlink ? toPosix(fs.readlinkSync(absolutePath)) : '';
  const pax = {
    path: entry.path,
    mtime: '0',
  };

  if (symlink) {
    pax.linkpath = linkPath;
  }

  const paxData = Buffer.from(Object.entries(pax).map(([key, value]) => paxRecord(key, value)).join(''), 'utf8');
  await writeStream(stream, tarHeader(`PaxHeaders/${String(index).padStart(6, '0')}`, {
    mode: '100644',
    size: paxData.length,
    type: 'x',
    mtime: 0,
  }));
  await writePadded(stream, paxData);

  await writeStream(stream, tarHeader(`reference/${String(index).padStart(6, '0')}`, {
    mode: entry.mode,
    size: body.length,
    type: symlink ? '2' : '0',
    linkName: symlink ? linkPath.slice(0, 100) : '',
    mtime: 0,
  }));

  if (!symlink) {
    await writePadded(stream, body);
  }
}

function paxRecord(key, value) {
  const payload = `${key}=${value}\n`;
  let length = Buffer.byteLength(payload, 'utf8') + 3;
  while (true) {
    const record = `${length} ${payload}`;
    const actual = Buffer.byteLength(record, 'utf8');
    if (actual === length) {
      return record;
    }
    length = actual;
  }
}

function tarHeader(name, options) {
  const header = Buffer.alloc(512, 0);
  writeString(header, 0, 100, name);
  writeOctal(header, 100, 8, parseInt(String(options.mode).slice(-4), 8) || 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, options.size || 0);
  writeOctal(header, 136, 12, options.mtime || 0);
  header.fill(0x20, 148, 156);
  header[156] = options.type.charCodeAt(0);
  writeString(header, 157, 100, options.linkName || '');
  writeString(header, 257, 6, 'ustar');
  writeString(header, 263, 2, '00');
  writeString(header, 265, 32, 'codex');
  writeString(header, 297, 32, 'codex');

  let checksum = 0;
  for (const byte of header) {
    checksum += byte;
  }

  const checksumText = checksum.toString(8).padStart(6, '0');
  writeString(header, 148, 6, checksumText);
  header[154] = 0;
  header[155] = 0x20;

  return header;
}

function writeString(buffer, offset, length, value) {
  const bytes = Buffer.from(value, 'utf8');
  bytes.copy(buffer, offset, 0, Math.min(bytes.length, length));
}

function writeOctal(buffer, offset, length, value) {
  const text = value.toString(8).padStart(length - 1, '0');
  writeString(buffer, offset, length - 1, text);
  buffer[offset + length - 1] = 0;
}

async function writePadded(stream, buffer) {
  await writeStream(stream, buffer);
  const remainder = buffer.length % 512;
  if (remainder !== 0) {
    await writeStream(stream, Buffer.alloc(512 - remainder));
  }
}

async function writeStream(stream, buffer) {
  if (!stream.write(buffer)) {
    await once(stream, 'drain');
  }
}

function captureExpectedFiles(root) {
  const expectedDir = path.join(root, EXPECTED_DIR);
  fs.mkdirSync(expectedDir, { recursive: true });

  const copies = [
    ['vscode/product.json', 'product.expected.json'],
    ['vscode/package.json', 'package.expected.json'],
    ['vscode/resources/server/manifest.json', 'server-manifest.expected.json'],
    ['announcements-builtin.json', 'announcements-builtin.expected.json'],
    ['announcements-extra.json', 'announcements-extra.expected.json'],
  ];
  const copied = [];

  for (const [source, destination] of copies) {
    const sourcePath = path.join(root, source);
    if (!fs.existsSync(sourcePath)) {
      continue;
    }

    const destinationPath = path.join(expectedDir, destination);
    fs.copyFileSync(sourcePath, destinationPath);
    copied.push({
      source,
      path: rel(root, destinationPath),
      sha256: sha256File(destinationPath),
    });
  }

  return copied;
}

function runHygieneScan(root, relativePaths) {
  const rootToken = toPosix(root).toLocaleLowerCase('en-US');
  const findings = [];
  const secretPatterns = [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/,
    /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
  ];
  const windowsPath = /(?<![A-Za-z])[A-Za-z]:\\[^\s"']+/;

  for (const relativePath of relativePaths) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) {
      continue;
    }

    const content = fs.readFileSync(absolutePath, 'utf8');
    const lower = toPosix(content).toLocaleLowerCase('en-US');
    if (lower.includes(rootToken)) {
      findings.push({ path: relativePath, type: 'absolute-workspace-path' });
    }
    if (windowsPath.test(content)) {
      findings.push({ path: relativePath, type: 'windows-absolute-path' });
    }
    for (const pattern of secretPatterns) {
      if (pattern.test(content)) {
        findings.push({ path: relativePath, type: 'secret-pattern', pattern: String(pattern) });
      }
    }
  }

  if (findings.length > 0) {
    throw new Error(`Hygiene scan failed: ${JSON.stringify(findings.slice(0, 20))}`);
  }

  return {
    status: 'passed',
    scannedFiles: relativePaths.length,
    findings,
  };
}

try {
  await main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
