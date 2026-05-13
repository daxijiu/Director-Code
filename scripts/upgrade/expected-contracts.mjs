#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { getWorkspaceRoot, sha256File, toPosix, writeJson } from './reference-manifest-lib.mjs';

const PROFILE_INDEX = 'docs/upgrade/profiles/index.json';

function main() {
  const root = getWorkspaceRoot();
  const args = parseArgs(process.argv.slice(2));
  const profile = loadProfile(root, args.profile);
  const contracts = contractInputs(root, profile);
  const results = [];
  const failures = [];

  for (const contract of contracts) {
    if (!fs.existsSync(contract.sourceAbsolute)) {
      failures.push(`${contract.key}: missing source ${contract.source}`);
      results.push({ ...contractResult(root, contract), status: 'missing-source' });
      continue;
    }

    if (args.write) {
      fs.mkdirSync(path.dirname(contract.expectedAbsolute), { recursive: true });
      fs.copyFileSync(contract.sourceAbsolute, contract.expectedAbsolute);
      results.push({ ...contractResult(root, contract), status: 'captured', sha256: sha256File(contract.expectedAbsolute) });
      continue;
    }

    if (!fs.existsSync(contract.expectedAbsolute)) {
      failures.push(`${contract.key}: missing expected ${contract.expected}`);
      results.push({ ...contractResult(root, contract), status: 'missing-expected' });
      continue;
    }

    const sourceSha = sha256File(contract.sourceAbsolute);
    const expectedSha = sha256File(contract.expectedAbsolute);
    const passed = sourceSha === expectedSha;
    if (!passed) {
      failures.push(`${contract.key}: expected drift source=${sourceSha} expected=${expectedSha}`);
    }
    results.push({ ...contractResult(root, contract), status: passed ? 'passed' : 'failed', sourceSha, expectedSha });
  }

  const report = {
    schemaVersion: 1,
    profile: profile.profile,
    phase: profile.validationMode === 'canonical-replay' ? 'P2' : 'P1',
    batch: 'expected-contracts',
    status: failures.length === 0 ? 'passed' : 'failed',
    generatedAt: new Date().toISOString(),
    mode: args.write ? 'write' : 'validate',
    checks: Object.fromEntries(results.map((result) => [result.key, result.status])),
    contracts: results,
    failures,
  };

  writeReport(root, profile, report);
  if (failures.length > 0) {
    throw new Error(`Expected contract validation failed for ${profile.profile}\n${failures.join('\n')}`);
  }

  console.log(args.write
    ? `captured expected contracts for ${profile.profile}`
    : `expected contracts match for ${profile.profile}`);
}

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--profile') out.profile = argv[++index];
    else if (arg === '--write') out.write = true;
    else throw new Error(`Unknown expected-contracts argument: ${arg}`);
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

function contractInputs(root, profile) {
  const directorSource = profile.artifactPaths?.directorSource;
  const vscodiumSource = path.join('.cache', 'upstreams', 'vscodium', profile.upstreams.vscodium.tag);
  const expected = profile.expectedPaths || {};
  return [
    ['product', path.join(directorSource, 'product.json'), expected.product],
    ['package', path.join(directorSource, 'package.json'), expected.package],
    ['serverManifest', path.join(directorSource, 'resources', 'server', 'manifest.json'), expected.serverManifest],
    ['announcementsBuiltin', path.join(vscodiumSource, 'announcements-builtin.json'), expected.announcementsBuiltin],
    ['announcementsExtra', path.join(vscodiumSource, 'announcements-extra.json'), expected.announcementsExtra],
  ].map(([key, source, expectedPath]) => {
    if (!expectedPath) {
      throw new Error(`Profile ${profile.profile} expectedPaths missing ${key}`);
    }
    return {
      key,
      source: toPosix(source),
      expected: toPosix(expectedPath),
      sourceAbsolute: path.join(root, source),
      expectedAbsolute: path.join(root, expectedPath),
    };
  });
}

function contractResult(root, contract) {
  return {
    key: contract.key,
    source: toPosix(path.relative(root, contract.sourceAbsolute)),
    expected: toPosix(path.relative(root, contract.expectedAbsolute)),
  };
}

function writeReport(root, profile, report) {
  if (profile.artifactPaths?.generatedReports) {
    writeJson(path.join(root, profile.artifactPaths.generatedReports, 'expected-contracts-report.json'), report);
  }
  if (profile.artifactPaths?.committedReports) {
    writeJson(path.join(root, profile.artifactPaths.committedReports, 'expected-contracts-report.json'), report);
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
