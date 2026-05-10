#!/usr/bin/env node
import fs from 'node:fs';
import { run } from './reference-manifest-lib.mjs';

const PROFILE = 'docs/upgrade/profiles/112-stable-win32-x64-client.json';
const SCHEMA = 'docs/upgrade/schemas/profile.schema.json';
const PLATFORM_BY_OS = {
  windows: 'win32',
  osx: 'darwin',
  linux: 'linux',
};

function main() {
  run('node', ['scripts/upgrade/validate-json.mjs', SCHEMA, PROFILE]);
  const profile = JSON.parse(fs.readFileSync(PROFILE, 'utf8'));

  if (PLATFORM_BY_OS[profile.osName] !== profile.platform) {
    throw new Error(`Profile platform mismatch: osName=${profile.osName} platform=${profile.platform}`);
  }
  if (profile.VSCODE_QUALITY !== profile.quality) {
    throw new Error('Profile VSCODE_QUALITY must match quality');
  }
  if (profile.OS_NAME !== profile.osName) {
    throw new Error('Profile OS_NAME must match osName');
  }
  if (profile.VSCODE_ARCH !== profile.arch) {
    throw new Error('Profile VSCODE_ARCH must match arch');
  }
  if (profile.profile !== '112-stable-win32-x64-client') {
    throw new Error(`Unexpected profile id: ${profile.profile}`);
  }
  if (!profile.canonicalCommand.includes('--target vscode.generated')) {
    throw new Error('Profile canonicalCommand must target vscode.generated');
  }

  console.log(`validated profile ${PROFILE}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
