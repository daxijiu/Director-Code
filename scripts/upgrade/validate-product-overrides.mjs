#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { getWorkspaceRoot, run } from './reference-manifest-lib.mjs';

const PROFILE_INDEX = 'docs/upgrade/profiles/index.json';
const OWNED_KEYS_SCHEMA = 'docs/upgrade/schemas/product-owned-keys.schema.json';
const OVERRIDE_SCHEMA = 'docs/upgrade/schemas/product-override.schema.json';

function main() {
  const root = getWorkspaceRoot();
  const args = parseArgs(process.argv.slice(2));
  const profile = loadProfile(root, args.profile);

  if (profile.validationMode !== 'canonical-replay') {
    console.log(`product override validation skipped for ${profile.profile} (${profile.validationMode})`);
    return;
  }

  run('node', ['scripts/upgrade/validate-json.mjs', OWNED_KEYS_SCHEMA, profile.productOwnedKeysPath], { cwd: root });
  run('node', ['scripts/upgrade/validate-json.mjs', OVERRIDE_SCHEMA, profile.productOverridePath], { cwd: root });

  const owned = readJson(root, profile.productOwnedKeysPath);
  const override = readJson(root, profile.productOverridePath);
  const failures = [];

  if (owned.profile !== profile.profile) {
    failures.push(`owned keys profile mismatch: ${owned.profile} !== ${profile.profile}`);
  }
  if (override.profile !== profile.profile) {
    failures.push(`override profile mismatch: ${override.profile} !== ${profile.profile}`);
  }
  const ownedKeys = new Set();
  for (const key of owned.keys) {
    if (ownedKeys.has(key)) {
      failures.push(`duplicate owned product key: ${key}`);
    }
    ownedKeys.add(key);
  }
  for (const key of Object.keys(override.set)) {
    if (!ownedKeys.has(key)) {
      failures.push(`override key is not declared as Director-owned: ${key}`);
    }
  }
  validateDefaultChatAgentContract(override.set.defaultChatAgent, failures);

  if (failures.length > 0) {
    throw new Error(`Product override validation failed for ${profile.profile}\n${failures.join('\n')}`);
  }

  console.log(`validated product override ${profile.productOverridePath}`);
}

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--profile') out.profile = argv[++index];
    else throw new Error(`Unknown validate-product-overrides argument: ${arg}`);
  }
  return out;
}

function loadProfile(root, requestedProfile) {
  const profileIndex = readJson(root, PROFILE_INDEX);
  const profileId = requestedProfile || profileIndex.activeProfile;
  const entry = profileIndex.profiles.find((candidate) => candidate.profile === profileId || candidate.path === profileId);
  if (!entry) {
    throw new Error(`Profile not found in ${PROFILE_INDEX}: ${profileId}`);
  }
  return readJson(root, entry.path);
}

function readJson(root, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function validateDefaultChatAgentContract(defaultChatAgent, failures) {
  if (defaultChatAgent === undefined) {
    return;
  }
  if (!defaultChatAgent || typeof defaultChatAgent !== 'object' || Array.isArray(defaultChatAgent)) {
    failures.push('defaultChatAgent must be an object when overridden');
    return;
  }

  const requiredStrings = [
    'extensionId',
    'chatExtensionId',
    'chatExtensionOutputId',
    'chatExtensionOutputExtensionStateCommand',
    'documentationUrl',
    'skusDocumentationUrl',
    'publicCodeMatchesUrl',
    'termsStatementUrl',
    'privacyStatementUrl',
    'manageSettingsUrl',
    'managePlanUrl',
    'manageOverageUrl',
    'upgradePlanUrl',
    'signUpUrl',
    'providerExtensionId',
    'providerUriSetting',
    'entitlementUrl',
    'entitlementSignupLimitedUrl',
    'tokenEntitlementUrl',
    'mcpRegistryDataUrl',
    'chatQuotaExceededContext',
    'completionsQuotaExceededContext',
    'walkthroughCommand',
    'completionsMenuCommand',
    'completionsRefreshTokenCommand',
    'chatRefreshTokenCommand',
    'generateCommitMessageCommand',
    'resolveMergeConflictsCommand',
    'completionsAdvancedSetting',
    'completionsEnablementSetting',
    'nextEditSuggestionsSetting',
  ];

  for (const key of requiredStrings) {
    if (typeof defaultChatAgent[key] !== 'string') {
      failures.push(`defaultChatAgent.${key} must be a string`);
    }
  }
  if (!Array.isArray(defaultChatAgent.providerScopes)) {
    failures.push('defaultChatAgent.providerScopes must be an array');
  }
  validateProviderMap(defaultChatAgent.provider, failures);
}

function validateProviderMap(provider, failures) {
  if (!provider || typeof provider !== 'object' || Array.isArray(provider)) {
    failures.push('defaultChatAgent.provider must be an object');
    return;
  }

  for (const key of ['default', 'enterprise', 'google', 'apple']) {
    const entry = provider[key];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      failures.push(`defaultChatAgent.provider.${key} must be an object`);
      continue;
    }
    if (typeof entry.id !== 'string') {
      failures.push(`defaultChatAgent.provider.${key}.id must be a string`);
    }
    if (typeof entry.name !== 'string') {
      failures.push(`defaultChatAgent.provider.${key}.name must be a string`);
    }
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
