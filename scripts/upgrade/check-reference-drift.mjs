#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  MANIFEST_PATH,
  REFERENCE_WRITE_MARKER,
  collectReference,
  getWorkspaceRoot,
  sha256File,
} from './reference-manifest-lib.mjs';

function main() {
  const root = getWorkspaceRoot();
  const manifestPath = path.join(root, MANIFEST_PATH);
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing reference manifest: ${MANIFEST_PATH}`);
  }

  const markerPath = path.join(root, REFERENCE_WRITE_MARKER);
  if (fs.existsSync(markerPath)) {
    throw new Error(
      `Legacy reference write override marker exists at ${REFERENCE_WRITE_MARKER}; re-freeze the reference before proceeding.`,
    );
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const current = collectReference(root);
  let contentFallback = false;

  if (manifest.referenceFilesHash !== current.referenceFilesHash) {
    const contentFailures = compareReferenceContent(manifest, current);
    if (contentFailures.length > 0) {
      throw new Error(
        `Reference drift detected: manifest=${manifest.referenceFilesHash} current=${current.referenceFilesHash}\n`
        + contentFailures.slice(0, 50).join('\n'),
      );
    }
    contentFallback = true;
  }

  if (manifest.archive?.path) {
    const archivePath = path.join(root, manifest.archive.path);
    if (fs.existsSync(archivePath)) {
      const archiveHash = sha256File(archivePath);
      if (archiveHash !== manifest.archive.sha256) {
        throw new Error(`Reference archive hash drift: manifest=${manifest.archive.sha256} current=${archiveHash}`);
      }
    }
  }

  if (contentFallback) {
    console.log(`Reference drift check passed by content: ${current.referenceFilesHash}`);
  } else {
    console.log(`Reference drift check passed: ${current.referenceFilesHash}`);
  }
}

function compareReferenceContent(manifest, current) {
  const failures = [];
  const manifestFiles = new Map((manifest.files || []).map((entry) => [entry.path, entry]));
  const currentFiles = new Map((current.files || []).map((entry) => [entry.path, entry]));
  const manifestDeleted = new Set((manifest.deleted || []).map((entry) => entry.path));
  const currentDeleted = new Set((current.deleted || []).map((entry) => entry.path));

  for (const manifestPath of manifestFiles.keys()) {
    const currentEntry = currentFiles.get(manifestPath);
    if (!currentEntry) {
      failures.push(`${manifestPath}: missing from current reference`);
      continue;
    }

    const manifestEntry = manifestFiles.get(manifestPath);
    for (const key of ['kind', 'mode', 'rawSha256', 'normalizedSha256']) {
      if (manifestEntry[key] !== currentEntry[key]) {
        failures.push(`${manifestPath}: ${key} drift manifest=${manifestEntry[key]} current=${currentEntry[key]}`);
      }
    }
  }

  for (const currentPath of currentFiles.keys()) {
    if (!manifestFiles.has(currentPath)) {
      failures.push(`${currentPath}: extra current reference file`);
    }
  }

  for (const manifestPath of manifestDeleted) {
    if (!currentDeleted.has(manifestPath)) {
      failures.push(`${manifestPath}: missing current deleted marker`);
    }
  }

  for (const currentPath of currentDeleted) {
    if (!manifestDeleted.has(currentPath)) {
      failures.push(`${currentPath}: extra current deleted marker`);
    }
  }

  return failures;
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
