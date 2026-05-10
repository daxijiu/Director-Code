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

  if (manifest.referenceFilesHash !== current.referenceFilesHash) {
    throw new Error(
      `Reference drift detected: manifest=${manifest.referenceFilesHash} current=${current.referenceFilesHash}`,
    );
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

  console.log(`Reference drift check passed: ${current.referenceFilesHash}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
