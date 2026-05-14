#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { getWorkspaceRoot, run, toPosix, writeJson } from './reference-manifest-lib.mjs';

const PROFILE_INDEX = 'docs/upgrade/profiles/index.json';
const STAGES = [
  'branding',
  'product-build-release',
  'agent-engine',
  'chat-built-in-mode',
  'text-polish',
];

function main() {
  const root = getWorkspaceRoot();
  const args = parseArgs(process.argv.slice(2));
  const profile = loadProfile(root, args.profile);
  const sourceVscodium = args.sourceVscodium || path.join(profile.artifactPaths.generatedRoot, 'layers', 'vscodium', 'vscode');
  const sourceDirector = args.sourceDirector || profile.artifactPaths.directorSource;
  const vscodiumAbsolute = path.join(root, sourceVscodium);
  const directorAbsolute = path.join(root, sourceDirector);

  assertDirectory(vscodiumAbsolute, sourceVscodium);
  assertDirectory(directorAbsolute, sourceDirector);

  const stageToPatch = patchMap(profile);
  const worktree = path.join(root, '.cache', 'upgrade-estimator', 'director-patch-diff', profile.profile);

  createDiffWorktree(vscodiumAbsolute, directorAbsolute, worktree);
  const changed = stagedChangedFiles(worktree);
  const classified = classifyChangedFiles(changed);
  fs.mkdirSync(path.join(root, 'patches', 'replay'), { recursive: true });

  const patches = [];
  for (const stage of STAGES) {
    const patchPath = stageToPatch.get(stage);
    if (!patchPath) {
      throw new Error(`Profile ${profile.profile} is missing Director patch for stage ${stage}`);
    }

    const files = (classified.get(stage) || []).sort();
    if (files.length === 0) {
      throw new Error(`Stage ${stage} has no changed files; refusing to generate an empty patch`);
    }

    const patchAbsolute = path.join(root, patchPath);
    const diff = stagedDiff(worktree, stage, files);
    if (!diff.trim()) {
      throw new Error(`Stage ${stage} generated an empty git diff`);
    }
    fs.mkdirSync(path.dirname(patchAbsolute), { recursive: true });
    fs.writeFileSync(patchAbsolute, diff, 'utf8');
    patches.push({
      stage,
      path: patchPath,
      files,
      fileCount: files.length,
      size: fs.statSync(patchAbsolute).size,
      sha256: sha256File(patchAbsolute),
    });
  }

  const report = {
    schemaVersion: 1,
    profile: profile.profile,
    phase: profile.validationMode === 'canonical-replay' ? 'P2' : 'P1',
    batch: 'director-patches',
    status: 'passed',
    generatedAt: new Date().toISOString(),
    sources: {
      vscodium: toPosix(sourceVscodium),
      director: toPosix(sourceDirector),
    },
    checks: {
      changedFilesClassified: 'passed',
      patchesGenerated: 'passed',
    },
    changedFileCount: changed.length,
    patches,
  };
  const generatedReport = profile.artifactPaths?.generatedReports
    ? path.join(root, profile.artifactPaths.generatedReports, 'director-patches-report.json')
    : undefined;
  const committedReport = profile.artifactPaths?.committedReports
    ? path.join(root, profile.artifactPaths.committedReports, 'director-patches-report.json')
    : undefined;
  if (generatedReport) writeJson(generatedReport, report);
  if (committedReport) writeJson(committedReport, report);

  console.log(`Generated ${patches.length} Director patches from ${changed.length} changed files`);
  for (const patch of patches) {
    console.log(`${patch.stage}: ${patch.path} (${patch.fileCount} files, ${patch.sha256})`);
  }
}

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--profile') out.profile = argv[++index];
    else if (arg === '--source-vscodium') out.sourceVscodium = argv[++index];
    else if (arg === '--source-director') out.sourceDirector = argv[++index];
    else throw new Error(`Unknown generate-director-patches argument: ${arg}`);
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

function patchMap(profile) {
  const out = new Map();
  for (const patch of profile.replayInputs?.directorDeltaPatches || []) {
    if (patch.includes('branding')) out.set('branding', patch);
    else if (patch.includes('product-build-release')) out.set('product-build-release', patch);
    else if (patch.includes('agent-engine')) out.set('agent-engine', patch);
    else if (patch.includes('chat-built-in-mode')) out.set('chat-built-in-mode', patch);
    else if (patch.includes('text-polish')) out.set('text-polish', patch);
  }
  return out;
}

function assertDirectory(absolute, label) {
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isDirectory()) {
    throw new Error(`Directory does not exist: ${label}`);
  }
}

function classifyChangedFiles(changed) {
  const out = new Map(STAGES.map((stage) => [stage, []]));
  const unclassified = [];

  for (const entry of changed) {
    const stage = classifyPath(entry.path);
    if (!stage) {
      unclassified.push(`${entry.status}\t${entry.path}`);
      continue;
    }
    out.get(stage).push(entry.path);
  }

  if (unclassified.length > 0) {
    throw new Error(`Unclassified Director changed files:\n${unclassified.join('\n')}`);
  }

  return out;
}

function stagedChangedFiles(worktree) {
  const output = run('git', ['-C', worktree, 'diff', '--cached', '--name-status', '-z']);
  const parts = output.split('\0').filter(Boolean);
  const changed = [];

  for (let index = 0; index < parts.length;) {
    const status = parts[index++];
    if (!status) continue;
    if (status.startsWith('R') || status.startsWith('C')) {
      index += 1;
    }
    const filePath = parts[index++];
    if (filePath) {
      changed.push({ status: status[0], path: toPosix(filePath) });
    }
  }

  return changed.sort((left, right) => left.path.localeCompare(right.path));
}

function classifyPath(filePath) {
  if (isProductBuildRelease(filePath)) return 'product-build-release';
  if (isTextPolish(filePath)) return 'text-polish';
  if (isAgentEngine(filePath)) return 'agent-engine';
  if (isChatBuiltInMode(filePath)) return 'chat-built-in-mode';
  if (isBranding(filePath)) return 'branding';
  return undefined;
}

function isProductBuildRelease(filePath) {
  return [
    'product.json',
    'package.json',
    'resources/server/manifest.json',
    'build/gulpfile.reh.ts',
    'build/gulpfile.vscode.ts',
    'build/gulpfile.vscode.win32.ts',
    'build/win32/code.iss',
  ].includes(filePath);
}

function isTextPolish(filePath) {
  return [
    'src/vs/workbench/contrib/chat/common/promptSyntax/languageProviders/promptValidator.ts',
    'src/vs/workbench/contrib/extensions/common/searchExtensionsTool.ts',
    'src/vs/workbench/contrib/terminal/common/terminalConfiguration.ts',
  ].includes(filePath);
}

function isAgentEngine(filePath) {
  if (filePath.includes('/agentEngine/')) return true;
  if (filePath.startsWith('src/vs/workbench/contrib/mcp/')) return true;
  return [
    'src/vs/workbench/api/browser/mainThreadLanguageModelTools.ts',
    'src/vs/workbench/contrib/chat/browser/chat.contribution.ts',
    'src/vs/workbench/contrib/chat/browser/tools/languageModelToolsService.ts',
    'src/vs/workbench/contrib/chat/common/participants/chatAgents.ts',
    'src/vs/workbench/contrib/chat/test/browser/tools/languageModelToolsService.test.ts',
    'src/vs/workbench/contrib/chat/test/common/participants/chatAgents.test.ts',
  ].includes(filePath);
}

function isChatBuiltInMode(filePath) {
  if (filePath.startsWith('src/vs/workbench/contrib/chat/browser/aiCustomization/')) return true;
  if (filePath.startsWith('src/vs/workbench/contrib/chat/browser/chatSetup/')) return true;
  if (filePath.startsWith('src/vs/workbench/contrib/chat/browser/chatStatus/')) return true;
  if (filePath.startsWith('src/vs/workbench/contrib/chat/browser/agentSessions/')) return true;
  return [
    'src/vs/workbench/contrib/chat/common/aiCustomizationWorkspaceService.ts',
    'src/vs/workbench/contrib/chat/browser/actions/chatActions.ts',
    'src/vs/workbench/contrib/chat/browser/actions/chatGettingStarted.ts',
    'src/vs/workbench/contrib/chat/browser/chatEditing/chatEditingExplanationModelManager.ts',
    'src/vs/workbench/contrib/chat/browser/widget/chatContentParts/chatQuotaExceededPart.ts',
    'src/vs/workbench/contrib/chat/browser/widget/chatContentParts/chatThinkingContentPart.ts',
    'src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts',
    'src/vs/workbench/contrib/chat/browser/widget/input/chatModelPicker.ts',
    'src/vs/workbench/contrib/chat/browser/widget/input/chatStatusWidget.ts',
    'src/vs/workbench/contrib/chat/browser/widget/input/modelPickerActionItem.ts',
    'src/vs/workbench/contrib/chat/browser/widgetHosts/chatQuick.ts',
    'src/vs/workbench/contrib/chat/test/browser/widget/input/chatModelPicker.test.ts',
  ].includes(filePath);
}

function isBranding(filePath) {
  if (filePath === 'LICENSE.rtf') return true;
  if (filePath.startsWith('extensions/')) return true;
  if (filePath.startsWith('resources/linux/')) return true;
  if (filePath.startsWith('resources/win32/')) return true;
  if (filePath.startsWith('build/lib/')) return true;
  if (filePath.startsWith('src/vs/workbench/contrib/extensions/')) return true;
  if (filePath.startsWith('src/vs/workbench/contrib/issue/')) return true;
  if (filePath.startsWith('src/vs/workbench/contrib/localization/')) return true;
  if (filePath.startsWith('src/vs/workbench/contrib/preferences/')) return true;
  if (filePath.startsWith('src/vs/workbench/contrib/tasks/')) return true;
  if (filePath.startsWith('src/vs/workbench/contrib/terminal/')) return true;
  if (filePath.startsWith('src/vs/workbench/contrib/terminalContrib/')) return true;
  if (filePath.startsWith('src/vs/workbench/contrib/welcomeAgentSessions/')) return true;
  if (filePath.startsWith('src/vs/workbench/contrib/welcomeGettingStarted/')) return true;
  if (filePath.startsWith('src/vs/workbench/contrib/welcomeWalkthrough/')) return true;
  if (filePath.startsWith('src/vs/workbench/contrib/workspace/')) return true;
  if (filePath.startsWith('src/vs/workbench/services/')) return true;
  return [
    'src/main.ts',
    'src/vs/code/electron-main/app.ts',
    'src/vs/editor/contrib/toggleTabFocusMode/browser/toggleTabFocusMode.ts',
    'src/vs/platform/contextkey/common/contextkeys.ts',
    'src/vs/platform/extensionManagement/node/extensionManagementService.ts',
    'src/vs/platform/extensions/common/extensionValidator.ts',
    'src/vs/platform/externalTerminal/node/externalTerminalService.ts',
    'src/vs/platform/terminal/common/terminalPlatformConfiguration.ts',
    'src/vs/platform/update/common/update.config.contribution.ts',
    'src/vs/platform/update/electron-main/abstractUpdateService.ts',
    'src/vs/server/node/server.cli.ts',
    'src/vs/workbench/api/browser/mainThreadAuthentication.ts',
    'src/vs/workbench/api/browser/viewsExtensionPoint.ts',
    'src/vs/workbench/api/common/extHostApiCommands.ts',
    'src/vs/workbench/api/common/extHostCommands.ts',
    'src/vs/workbench/api/test/browser/extHostNotebook.test.ts',
    'src/vs/workbench/browser/actions/developerActions.ts',
    'src/vs/workbench/browser/actions/helpActions.ts',
    'src/vs/workbench/browser/web.factory.ts',
    'src/vs/workbench/browser/workbench.contribution.ts',
    'src/vs/workbench/common/contextkeys.ts',
    'src/vs/workbench/contrib/debug/browser/debugAdapterManager.ts',
    'src/vs/workbench/contrib/externalUriOpener/common/configuration.ts',
    'src/vs/workbench/contrib/update/browser/update.ts',
    'src/vs/workbench/contrib/url/browser/trustedDomainsFileSystemProvider.ts',
    'src/vs/workbench/electron-browser/desktop.contribution.ts',
  ].includes(filePath);
}

function createDiffWorktree(vscodiumRoot, directorRoot, worktree) {
  fs.rmSync(worktree, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(worktree), { recursive: true });
  copyTree(vscodiumRoot, worktree);
  run('git', ['-C', worktree, 'init', '-q']);
  run('git', ['-C', worktree, 'config', 'core.autocrlf', 'false']);
  run('git', ['-C', worktree, 'config', 'core.safecrlf', 'false']);
  run('git', ['-C', worktree, 'config', 'user.email', 'director-upgrade@example.invalid']);
  run('git', ['-C', worktree, 'config', 'user.name', 'Director Upgrade Tool']);
  run('git', ['-C', worktree, 'add', '-A']);
  run('git', ['-C', worktree, 'commit', '-q', '-m', 'vscodium baseline']);

  for (const entry of fs.readdirSync(worktree, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    fs.rmSync(path.join(worktree, entry.name), { recursive: true, force: true });
  }
  copyTree(directorRoot, worktree);
  run('git', ['-C', worktree, 'add', '-A']);
}

function copyTree(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  fs.cpSync(source, destination, {
    recursive: true,
    verbatimSymlinks: true,
    filter: (sourcePath) => {
      const relative = toPosix(path.relative(source, sourcePath));
      return !shouldExcludeSourceEntry(path.basename(sourcePath), relative);
    },
  });
}

function stagedDiff(worktree, stage, files) {
  return run('git', [
    '-C',
    worktree,
    'diff',
    '--cached',
    '--binary',
    '--full-index',
    '--',
    ...files,
  ]);
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
