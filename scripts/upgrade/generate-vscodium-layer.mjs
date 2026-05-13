#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { getWorkspaceRoot, run, runMaybe, toPosix, writeJson } from './reference-manifest-lib.mjs';

const PROFILE_INDEX = 'docs/upgrade/profiles/index.json';
const DEFAULT_WORK_ROOT = '.cache/upgrade-estimator/vscodium-layer';

function main() {
  const root = getWorkspaceRoot();
  const args = parseArgs(process.argv.slice(2));
  const profilePath = resolveProfilePath(root, args.profile);
  const profile = readJson(root, profilePath);
  const workRoot = path.join(root, args.workRoot || DEFAULT_WORK_ROOT, profile.profile);
  const vscodeCache = path.join(root, '.cache', 'upstreams', 'vscode', profile.upstreams.vscode.tag);
  const vscodiumCache = path.join(root, '.cache', 'upstreams', 'vscodium', profile.upstreams.vscodium.tag);

  assertCache(root, vscodeCache, profile.upstreams.vscode);
  assertCache(root, vscodiumCache, profile.upstreams.vscodium);
  safeDelete(root, toPosix(path.relative(root, workRoot)));

  const vscodeLayer = path.join(workRoot, 'layers', 'vscode', 'vscode');
  const vscodiumLayer = path.join(workRoot, 'layers', 'vscodium', 'vscode');
  copyTree(vscodeCache, vscodeLayer);
  copyTree(vscodeLayer, vscodiumLayer);

  const layerResult = materializeVscodiumLayer(root, profile, vscodiumCache, vscodiumLayer, workRoot);
  const patchResult = args.writePatch
    ? writeLayerPatch(root, profile, vscodeLayer, vscodiumLayer, workRoot)
    : { status: 'not-requested' };

  const generatedAt = new Date().toISOString();
  const layerManifestPath = profile.replayInputs?.vscodiumLayerManifest || `docs/upgrade/vscodium-layer.${profile.directorVersion}.json`;
  const reportPath = profile.reportPaths?.vscodiumLayer || path.join(profile.artifactPaths?.committedReports || `docs/upgrade/reports/${profile.profile}`, 'vscodium-layer-report.json');
  const prepareParityPath = profile.replayInputs?.prepareParityReport || profile.reportPaths?.prepareParity;
  const status = layerResult.status === 'passed' && (patchResult.status === 'passed' || patchResult.status === 'not-requested') ? 'passed' : 'failed';

  const layerManifest = {
    schemaVersion: 1,
    profile: profile.profile,
    layer: 'vscodium',
    status,
    generatedAt,
    upstream: {
      remote: profile.upstreams.vscodium.remote,
      tag: profile.upstreams.vscodium.tag,
      commit: profile.upstreams.vscodium.commit,
      cachePath: toPosix(path.relative(root, vscodiumCache)),
      cleanStatus: 'clean',
    },
    vscodeBase: {
      tag: profile.upstreams.vscode.tag,
      commit: profile.upstreams.vscode.commit,
    },
    transformPolicy: {
      source: 'clean-vscodium-tag',
      dependencyInstall: 'skipped',
      temporaryFiles: 'excluded',
      note: 'Layer 1 replays VSCodium source mutations from clean upstream inputs. npm install and artifact build are intentionally outside this source replay batch.',
    },
    transforms: layerResult.transforms,
    patch: patchResult,
  };

  writeJson(path.join(root, layerManifestPath), layerManifest);
  writeJson(path.join(root, reportPath), {
    schemaVersion: 1,
    profile: profile.profile,
    phase: profile.validationMode === 'legacy-reference' ? 'P1' : 'P2',
    batch: 'vscodium-layer',
    status,
    generatedAt,
    checks: {
      cleanVscodeCache: 'passed',
      cleanVscodiumCache: 'passed',
      sourceMutationReplay: layerResult.status,
      temporaryFilesExcluded: layerResult.temporaryFiles.length === 0 ? 'passed' : 'failed',
      patchGenerated: patchResult.status,
    },
    upstream: layerManifest.upstream,
    layerManifest: layerManifestPath,
    patch: patchResult,
    transformCounts: layerResult.transformCounts,
    temporaryFiles: layerResult.temporaryFiles,
  });

  if (prepareParityPath) {
    writeJson(path.join(root, prepareParityPath), {
      schemaVersion: 1,
      profile: profile.profile,
      phase: profile.validationMode === 'legacy-reference' ? 'P1' : 'P2',
      batch: 'prepare-parity',
      status: layerResult.status,
      generatedAt,
      checks: {
        overlayCopy: layerResult.checks.overlayCopy,
        licenseCopy: layerResult.checks.licenseCopy,
        copilotRemoval: layerResult.checks.copilotRemoval,
        productMutation: layerResult.checks.productMutation,
        vscodiumPatchApplication: layerResult.checks.vscodiumPatchApplication,
        packageMutation: layerResult.checks.packageMutation,
        serverManifestMutation: layerResult.checks.serverManifestMutation,
        announcementsMutation: layerResult.checks.announcementsMutation,
        telemetryMutation: layerResult.checks.telemetryMutation,
        electronCopyrightMutation: layerResult.checks.electronCopyrightMutation,
        platformMutation: layerResult.checks.platformMutation,
      },
      source: 'VSCodium prepare_vscode.sh source mutations, excluding dependency install/build',
      skipped: ['node build/npm/preinstall.ts', 'npm ci'],
      transforms: layerResult.transforms,
    });
  }

  console.log(`Generated ${layerManifestPath}`);
}

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--profile') out.profile = argv[++index];
    else if (arg === '--work-root') out.workRoot = argv[++index];
    else if (arg === '--write-patch') out.writePatch = true;
    else throw new Error(`Unknown generate-vscodium-layer argument: ${arg}`);
  }
  return out;
}

function resolveProfilePath(root, requestedProfile) {
  const indexPath = path.join(root, PROFILE_INDEX);
  if (!fs.existsSync(indexPath)) {
    if (requestedProfile) return requestedProfile;
    throw new Error(`Missing profile index: ${PROFILE_INDEX}`);
  }
  const profileIndex = readJson(root, PROFILE_INDEX);
  const profileId = requestedProfile || profileIndex.activeProfile;
  const entry = (profileIndex.profiles || []).find((candidate) => candidate.profile === profileId || candidate.path === profileId);
  if (entry) return entry.path;
  if (requestedProfile && fs.existsSync(path.join(root, requestedProfile))) return requestedProfile;
  throw new Error(`Profile not found in ${PROFILE_INDEX}: ${profileId}`);
}

function materializeVscodiumLayer(root, profile, vscodiumRoot, layerPath, workRoot) {
  const transforms = {
    overlays: [],
    patches: [],
    productInputs: [],
    sourceMutations: [],
  };
  const checks = {};

  const overlay = path.join(vscodiumRoot, 'src', profile.quality === 'insider' ? 'insider' : 'stable');
  copyContents(overlay, layerPath);
  transforms.overlays.push({
    path: toPosix(path.relative(vscodiumRoot, overlay)),
    sha256: treeHash(overlay),
    stage: 'overlay',
  });
  checks.overlayCopy = 'passed';

  fs.copyFileSync(path.join(vscodiumRoot, 'LICENSE'), path.join(layerPath, 'LICENSE.txt'));
  transforms.overlays.push({
    path: 'LICENSE',
    destination: 'LICENSE.txt',
    sha256: sha256File(path.join(vscodiumRoot, 'LICENSE')),
    stage: 'license',
  });
  checks.licenseCopy = 'passed';

  fs.rmSync(path.join(layerPath, 'extensions', 'copilot'), { recursive: true, force: true });
  transforms.sourceMutations.push({ id: 'remove-copilot-extension', status: 'passed' });
  checks.copilotRemoval = fs.existsSync(path.join(layerPath, 'extensions', 'copilot')) ? 'failed' : 'passed';

  mutateProductJson(profile, vscodiumRoot, layerPath, transforms);
  checks.productMutation = 'passed';

  const patchResult = applyVscodiumPatches(root, profile, vscodiumRoot, layerPath, workRoot);
  transforms.patches = patchResult.applied;
  checks.vscodiumPatchApplication = patchResult.status;

  mutatePackageJson(profile, layerPath, transforms);
  checks.packageMutation = 'passed';

  mutateServerManifest(profile, layerPath, transforms);
  checks.serverManifestMutation = 'passed';

  mutateAnnouncements(vscodiumRoot, layerPath, transforms);
  checks.announcementsMutation = 'passed';

  const telemetryMutation = undoTelemetry(layerPath);
  transforms.sourceMutations.push(telemetryMutation);
  checks.telemetryMutation = 'passed';

  mutateElectron(layerPath, transforms);
  checks.electronCopyrightMutation = 'passed';

  const platformMutation = mutatePlatform(profile, layerPath);
  transforms.sourceMutations.push(platformMutation);
  checks.platformMutation = platformMutation.status;

  const temporaryFiles = findTemporaryFiles(layerPath);
  return {
    status: patchResult.status === 'passed' && temporaryFiles.length === 0 ? 'passed' : 'failed',
    checks,
    transforms,
    transformCounts: {
      overlays: transforms.overlays.length,
      patches: transforms.patches.length,
      productInputs: transforms.productInputs.length,
      sourceMutations: transforms.sourceMutations.length,
    },
    temporaryFiles,
    fileManifestHash: treeHash(layerPath),
  };
}

function mutateProductJson(profile, vscodiumRoot, layerPath, transforms) {
  const productPath = path.join(layerPath, 'product.json');
  const product = readJsonAbsolute(productPath);
  const stable = profile.quality !== 'insider';

  setPath(product, 'checksumFailMoreInfoUrl', 'https://go.microsoft.com/fwlink/?LinkId=828886');
  setPath(product, 'documentationUrl', 'https://go.microsoft.com/fwlink/?LinkID=533484#vscode');
  setPath(product, 'extensionsGallery', {
    serviceUrl: 'https://open-vsx.org/vscode/gallery',
    itemUrl: 'https://open-vsx.org/vscode/item',
    latestUrlTemplate: 'https://open-vsx.org/vscode/gallery/{publisher}/{name}/latest',
    controlUrl: 'https://raw.githubusercontent.com/EclipseFdn/publish-extensions/refs/heads/master/extension-control/extensions.json',
  });
  setPath(product, 'introductoryVideosUrl', 'https://go.microsoft.com/fwlink/?linkid=832146');
  setPath(product, 'keyboardShortcutsUrlLinux', 'https://go.microsoft.com/fwlink/?linkid=832144');
  setPath(product, 'keyboardShortcutsUrlMac', 'https://go.microsoft.com/fwlink/?linkid=832143');
  setPath(product, 'keyboardShortcutsUrlWin', 'https://go.microsoft.com/fwlink/?linkid=832145');
  setPath(product, 'licenseUrl', 'https://github.com/VSCodium/vscodium/blob/master/LICENSE');
  setPath(product, 'linkProtectionTrustedDomains', ['https://open-vsx.org']);
  setPath(product, 'releaseNotesUrl', 'https://go.microsoft.com/fwlink/?LinkID=533483#vscode');
  setPath(product, 'reportIssueUrl', 'https://github.com/VSCodium/vscodium/issues/new');
  setPath(product, 'requestFeatureUrl', 'https://go.microsoft.com/fwlink/?LinkID=533482');
  setPath(product, 'tipsAndTricksUrl', 'https://go.microsoft.com/fwlink/?linkid=852118');
  setPath(product, 'twitterUrl', 'https://go.microsoft.com/fwlink/?LinkID=533687');
  setPath(product, 'updateUrl', 'https://raw.githubusercontent.com/VSCodium/versions/refs/heads/master');
  setPath(product, 'downloadUrl', stable ? 'https://github.com/VSCodium/vscodium/releases' : 'https://github.com/VSCodium/vscodium-insiders/releases');

  if (stable) {
    Object.assign(product, {
      nameShort: 'VSCodium',
      nameLong: 'VSCodium',
      applicationName: 'codium',
      linuxIconName: 'vscodium',
      quality: 'stable',
      urlProtocol: 'vscodium',
      serverApplicationName: 'codium-server',
      serverDataFolderName: '.vscodium-server',
      darwinBundleIdentifier: 'com.vscodium',
      win32AppUserModelId: 'VSCodium.VSCodium',
      win32DirName: 'VSCodium',
      win32MutexName: 'vscodium',
      win32NameVersion: 'VSCodium',
      win32RegValueName: 'VSCodium',
      win32ShellNameShort: 'VSCodium',
      win32AppId: '{{763CBF88-25C6-4B10-952F-326AE657F16B}',
      win32x64AppId: '{{88DA3577-054F-4CA1-8122-7D820494CFFB}',
      win32arm64AppId: '{{67DEE444-3D04-4258-B92A-BC1F0FF2CAE4}',
      win32UserAppId: '{{0FD05EB4-651E-4E78-A062-515204B47A3A}',
      win32x64UserAppId: '{{2E1F05D1-C245-4562-81EE-28188DB6FD17}',
      win32arm64UserAppId: '{{57FD70A5-1B8D-4875-9F40-C5553F094828}',
      tunnelApplicationName: 'codium-tunnel',
      win32TunnelServiceMutex: 'vscodium-tunnelservice',
      win32TunnelMutex: 'vscodium-tunnel',
    });
    setPath(product, 'win32ContextMenu.x64.clsid', 'D910D5E6-B277-4F4A-BDC5-759A34EEE25D');
    setPath(product, 'win32ContextMenu.arm64.clsid', '4852FC55-4A84-4EA1-9C86-D53BE3DF83C0');
  } else {
    Object.assign(product, {
      nameShort: 'VSCodium - Insiders',
      nameLong: 'VSCodium - Insiders',
      applicationName: 'codium-insiders',
      dataFolderName: '.vscodium-insiders',
      linuxIconName: 'vscodium-insiders',
      quality: 'insider',
      urlProtocol: 'vscodium-insiders',
      serverApplicationName: 'codium-server-insiders',
      serverDataFolderName: '.vscodium-server-insiders',
      darwinBundleIdentifier: 'com.vscodium.VSCodiumInsiders',
      win32AppUserModelId: 'VSCodium.VSCodiumInsiders',
      win32DirName: 'VSCodium Insiders',
      win32MutexName: 'vscodiuminsiders',
      win32NameVersion: 'VSCodium Insiders',
      win32RegValueName: 'VSCodiumInsiders',
      win32ShellNameShort: 'VSCodium Insiders',
      win32AppId: '{{EF35BB36-FA7E-4BB9-B7DA-D1E09F2DA9C9}',
      win32x64AppId: '{{B2E0DDB2-120E-4D34-9F7E-8C688FF839A2}',
      win32arm64AppId: '{{44721278-64C6-4513-BC45-D48E07830599}',
      win32UserAppId: '{{ED2E5618-3E7E-4888-BF3C-A6CCC84F586F}',
      win32x64UserAppId: '{{20F79D0D-A9AC-4220-9A81-CE675FFB6B41}',
      win32arm64UserAppId: '{{2E362F92-14EA-455A-9ABD-3E656BBBFE71}',
      tunnelApplicationName: 'codium-insiders-tunnel',
      win32TunnelServiceMutex: 'vscodiuminsiders-tunnelservice',
      win32TunnelMutex: 'vscodiuminsiders-tunnel',
    });
    setPath(product, 'win32ContextMenu.x64.clsid', '90AAD229-85FD-43A3-B82D-8598A88829CF');
    setPath(product, 'win32ContextMenu.arm64.clsid', '7544C31C-BDBF-4DDF-B15E-F73A46D6723D');
  }
  setPath(product, 'tunnelApplicationConfig', {});

  const overlay = readJsonAbsolute(path.join(vscodiumRoot, 'product.json'));
  const merged = deepMerge(product, overlay);
  writeJson(productPath, merged);
  transforms.productInputs.push({
    path: 'product.json',
    sha256: sha256File(path.join(vscodiumRoot, 'product.json')),
    stage: 'product-merge',
  });
  transforms.sourceMutations.push({ id: 'product-json', status: 'passed' });
}

function applyVscodiumPatches(root, profile, vscodiumRoot, layerPath, workRoot) {
  const patchPaths = vscodiumPatchPaths(vscodiumRoot, profile);
  const applied = [];
  const failures = [];
  withTemporaryGit(root, layerPath, () => {
    for (const patchPath of patchPaths) {
      const preparedPatch = preparePatch(vscodiumRoot, patchPath, workRoot, vscodiumPlaceholders(profile));
      const result = runMaybe('git', ['-C', layerPath, 'apply', '--ignore-whitespace', preparedPatch], { cwd: root });
      const relative = toPosix(path.relative(vscodiumRoot, patchPath));
      if (result.status === 0) {
        applied.push({
          path: relative,
          sha256: sha256File(patchPath),
          status: statusFromPatchPath(relative),
          layer: 'vscodium',
          stage: stageFromPatchPath(relative),
          platforms: platformsFromPatchPath(relative),
          arches: archesFromPatchPath(relative),
          qualities: qualitiesFromPatchPath(relative),
          targets: targetsFromPatchPath(relative),
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

  if (failures.length > 0) {
    throw new Error(`VSCodium patch failed: ${failures[0].path}\n${failures[0].stderr.join('\n')}`);
  }
  return { status: 'passed', applied, failures };
}

function mutatePackageJson(profile, layerPath, transforms) {
  const packagePath = path.join(layerPath, 'package.json');
  const packageJson = readJsonAbsolute(packagePath);
  packageJson.version = profile.releaseVersion.replace(/-insider$/, '');
  writeJson(packagePath, packageJson);
  replaceInFile(packagePath, /Microsoft Corporation/g, 'VSCodium');
  transforms.sourceMutations.push({ id: 'package-json', status: 'passed' });
}

function mutateServerManifest(profile, layerPath, transforms) {
  const manifestPath = path.join(layerPath, 'resources', 'server', 'manifest.json');
  const manifest = readJsonAbsolute(manifestPath);
  const name = profile.quality === 'insider' ? 'VSCodium - Insiders' : 'VSCodium';
  manifest.name = name;
  manifest.short_name = name;
  writeJson(manifestPath, manifest);
  transforms.sourceMutations.push({ id: 'server-manifest', status: 'passed' });
}

function mutateAnnouncements(vscodiumRoot, layerPath, transforms) {
  const sourcePath = path.join(vscodiumRoot, 'announcements-builtin.json');
  const targetPath = path.join(layerPath, 'src', 'vs', 'workbench', 'contrib', 'welcomeGettingStarted', 'browser', 'gettingStarted.ts');
  if (!fs.existsSync(sourcePath) || !fs.existsSync(targetPath)) {
    transforms.sourceMutations.push({ id: 'announcements', status: 'not-applicable' });
    return;
  }
  const announcements = fs.readFileSync(sourcePath, 'utf8').replace(/\r?\n/g, '');
  replaceInFile(targetPath, /\[\/\* BUILTIN_ANNOUNCEMENTS \*\/\]/g, announcements);
  transforms.sourceMutations.push({
    id: 'announcements',
    status: 'passed',
    source: 'announcements-builtin.json',
    sha256: sha256File(sourcePath),
  });
}

function undoTelemetry(layerPath) {
  const changed = [];
  for (const filePath of listFiles(layerPath)) {
    if (filePath.includes(`${path.sep}.git${path.sep}`)) continue;
    const buffer = fs.readFileSync(filePath);
    if (buffer.includes(0)) continue;
    const before = buffer.toString('utf8');
    if (!before.includes('.data.microsoft.com')) continue;
    const after = before.replace(/\/\/[^/]+\.data\.microsoft\.com/g, '//0.0.0.0');
    if (after !== before) {
      fs.writeFileSync(filePath, after, 'utf8');
      changed.push(toPosix(path.relative(layerPath, filePath)));
    }
  }
  return {
    id: 'undo-telemetry',
    status: 'passed',
    changedCount: changed.length,
    samples: changed.slice(0, 50),
  };
}

function mutateElectron(layerPath, transforms) {
  const electronPath = path.join(layerPath, 'build', 'lib', 'electron.ts');
  replaceInFile(electronPath, /Microsoft Corporation/g, 'VSCodium');
  replaceInFile(electronPath, /([0-9]) Microsoft/g, '$1 VSCodium');
  transforms.sourceMutations.push({ id: 'electron-copyright', status: 'passed' });
}

function mutatePlatform(profile, layerPath) {
  if (profile.osName !== 'windows') {
    return { id: `${profile.osName}-platform-mutation`, status: 'not-applicable' };
  }
  const issPath = path.join(layerPath, 'build', 'win32', 'code.iss');
  replaceInFile(issPath, /https:\/\/code\.visualstudio\.com/g, 'https://vscodium.com');
  replaceInFile(issPath, /Microsoft Corporation/g, 'VSCodium');
  return { id: 'windows-code-iss', status: 'passed' };
}

function writeLayerPatch(root, profile, vscodeLayer, vscodiumLayer, workRoot) {
  const patchRelative = profile.replayInputs?.vscodiumLayerPatch;
  if (!patchRelative) {
    throw new Error(`Profile ${profile.profile} is missing replayInputs.vscodiumLayerPatch`);
  }

  const diffRepo = path.join(workRoot, 'diff-repo');
  copyTree(vscodeLayer, diffRepo);
  run('git', ['-C', diffRepo, 'init', '-q'], { cwd: root });
  run('git', ['-C', diffRepo, 'config', 'core.autocrlf', 'false'], { cwd: root });
  run('git', ['-C', diffRepo, 'config', 'user.email', 'upgrade@example.invalid'], { cwd: root });
  run('git', ['-C', diffRepo, 'config', 'user.name', 'upgrade-bot'], { cwd: root });
  run('git', ['-C', diffRepo, 'add', '-A'], { cwd: root });
  run('git', ['-C', diffRepo, 'commit', '-qm', 'clean-vscode'], { cwd: root });
  replaceTree(diffRepo, vscodiumLayer);
  run('git', ['-C', diffRepo, 'add', '-A'], { cwd: root });
  const patch = run('git', ['-C', diffRepo, 'diff', '--cached', '--binary', '--full-index', 'HEAD'], { cwd: root });
  const patchPath = path.join(root, patchRelative);
  fs.mkdirSync(path.dirname(patchPath), { recursive: true });
  fs.writeFileSync(patchPath, patch, 'utf8');
  return {
    status: patch.length > 0 ? 'passed' : 'failed',
    path: patchRelative,
    size: Buffer.byteLength(patch),
    sha256: sha256File(patchPath),
  };
}

function vscodiumPatchPaths(vscodiumRoot, profile) {
  const paths = [
    ...listPatchFiles(path.join(vscodiumRoot, 'patches')),
  ];
  if (profile.quality === 'insider') {
    paths.push(...listPatchFiles(path.join(vscodiumRoot, 'patches', 'insider')));
  }
  if (profile.osName && fs.existsSync(path.join(vscodiumRoot, 'patches', profile.osName))) {
    paths.push(...listPatchFiles(path.join(vscodiumRoot, 'patches', profile.osName)));
  }
  paths.push(...listPatchFiles(path.join(vscodiumRoot, 'patches', 'user')));
  return paths;
}

function vscodiumPlaceholders(profile) {
  return {
    '!!APP_NAME!!': profile.quality === 'insider' ? 'VSCodium - Insiders' : 'VSCodium',
    '!!APP_NAME_LC!!': profile.quality === 'insider' ? 'vscodium-insiders' : 'vscodium',
    '!!ASSETS_REPOSITORY!!': profile.quality === 'insider' ? 'VSCodium/vscodium-insiders' : 'VSCodium/vscodium',
    '!!BINARY_NAME!!': profile.quality === 'insider' ? 'codium-insiders' : 'codium',
    '!!GH_REPO_PATH!!': profile.quality === 'insider' ? 'VSCodium/vscodium-insiders' : 'VSCodium/vscodium',
    '!!GLOBAL_DIRNAME!!': profile.quality === 'insider' ? 'vscodium-insiders' : 'vscodium',
    '!!ORG_NAME!!': 'VSCodium',
    '!!RELEASE_VERSION!!': profile.releaseVersion,
    '!!TUNNEL_APP_NAME!!': profile.quality === 'insider' ? 'codium-insiders-tunnel' : 'codium-tunnel',
  };
}

function preparePatch(vscodiumRoot, patchPath, workRoot, replacements) {
  let content = fs.readFileSync(patchPath, 'utf8');
  for (const [token, value] of Object.entries(replacements)) {
    content = content.split(token).join(value);
  }
  const relative = toPosix(path.relative(vscodiumRoot, patchPath));
  const prepared = path.join(workRoot, 'prepared-patches', relative);
  fs.mkdirSync(path.dirname(prepared), { recursive: true });
  fs.writeFileSync(prepared, content, 'utf8');
  return prepared;
}

function assertCache(root, cachePath, upstream) {
  if (!fs.existsSync(path.join(cachePath, '.git'))) {
    throw new Error(`Missing upstream cache: ${toPosix(path.relative(root, cachePath))}`);
  }
  run('git', ['-C', cachePath, 'config', 'core.autocrlf', 'false'], { cwd: root });
  const head = run('git', ['-C', cachePath, 'rev-parse', 'HEAD'], { cwd: root }).trim();
  if (head !== upstream.commit) {
    throw new Error(`${toPosix(path.relative(root, cachePath))} is at ${head}, expected ${upstream.commit}`);
  }
  const status = run('git', ['-C', cachePath, 'status', '--short', '--untracked-files=no'], { cwd: root }).trim();
  if (status) {
    throw new Error(`${toPosix(path.relative(root, cachePath))} is dirty:\n${status}`);
  }
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

function safeDelete(root, relative) {
  if (relative && fs.existsSync(path.join(root, relative))) {
    run('bash', ['scripts/upgrade/safe-delete.sh', relative], { cwd: root });
  }
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
  if (!fs.existsSync(source)) return;
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    fs.cpSync(path.join(source, entry.name), path.join(destination, entry.name), {
      recursive: true,
      verbatimSymlinks: true,
      force: true,
    });
  }
}

function replaceTree(destination, source) {
  for (const entry of fs.readdirSync(destination, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    fs.rmSync(path.join(destination, entry.name), { recursive: true, force: true });
  }
  copyContents(source, destination);
}

function listFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const out = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(absolute));
    else out.push(absolute);
  }
  return out;
}

function listPatchFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.patch'))
    .map((entry) => path.join(directory, entry.name))
    .sort((left, right) => path.basename(left).localeCompare(path.basename(right)));
}

function findTemporaryFiles(layerPath) {
  return listFiles(layerPath)
    .map((filePath) => toPosix(path.relative(layerPath, filePath)))
    .filter((relative) => /(^|\/)([^/]+\.bak|.*\.probe|.*\.tmp|.*\.temp)$/i.test(relative))
    .sort();
}

function setPath(object, dottedPath, value) {
  const parts = dottedPath.split('.');
  let current = object;
  for (const part of parts.slice(0, -1)) {
    if (!current[part] || typeof current[part] !== 'object' || Array.isArray(current[part])) {
      current[part] = {};
    }
    current = current[part];
  }
  current[parts.at(-1)] = value;
}

function deepMerge(base, overlay) {
  if (Array.isArray(base) || Array.isArray(overlay) || !isObject(base) || !isObject(overlay)) {
    return overlay === undefined ? base : overlay;
  }
  const merged = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    merged[key] = key in merged ? deepMerge(merged[key], value) : value;
  }
  return merged;
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function replaceInFile(filePath, pattern, replacement) {
  if (!fs.existsSync(filePath)) return;
  const before = fs.readFileSync(filePath, 'utf8');
  const after = before.replace(pattern, replacement);
  if (after !== before) {
    fs.writeFileSync(filePath, after, 'utf8');
  }
}

function readJson(root, relativePath) {
  return readJsonAbsolute(path.join(root, relativePath));
}

function readJsonAbsolute(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sha256File(filePath) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function treeHash(root) {
  const stat = fs.lstatSync(root);
  if (!stat.isDirectory()) {
    return sha256File(root);
  }
  const digest = createHash('sha256');
  for (const file of listFiles(root).sort()) {
    if (file.includes(`${path.sep}.git${path.sep}`)) continue;
    digest.update(toPosix(path.relative(root, file)));
    digest.update('\0');
    digest.update(fs.readFileSync(file));
    digest.update('\0');
  }
  return digest.digest('hex');
}

function trimLines(value, maxLines = 40) {
  return value.trim().split(/\r?\n/).filter(Boolean).slice(0, maxLines);
}

function statusFromPatchPath(relative) {
  if (relative.endsWith('.patch.no')) return 'archived';
  if (relative.endsWith('.patch.yet')) return 'deferred';
  return 'enabled';
}

function stageFromPatchPath(relative) {
  if (relative.includes('/helper/')) return 'helper';
  if (relative.includes('/client/')) return 'client';
  if (relative.includes('/reh/')) return 'reh';
  if (relative.includes('/windows/')) return 'platform';
  if (relative.includes('/linux/')) return 'platform';
  if (relative.includes('/osx/')) return 'platform';
  if (relative.includes('/alpine/')) return 'platform';
  return 'source';
}

function platformsFromPatchPath(relative) {
  if (relative.includes('/windows/')) return ['win32'];
  if (relative.includes('/linux/')) return ['linux'];
  if (relative.includes('/osx/')) return ['darwin'];
  if (relative.includes('/alpine/')) return ['alpine'];
  return ['all'];
}

function archesFromPatchPath(relative) {
  for (const arch of ['x64', 'arm64', 'armhf', 'ppc64le', 'riscv64', 'loong64', 's390x']) {
    if (relative.includes(`/${arch}/`) || relative.includes(`-${arch}`)) return [arch];
  }
  return ['all'];
}

function qualitiesFromPatchPath(relative) {
  if (relative.includes('/insider/')) return ['insider'];
  return ['stable', 'insider'];
}

function targetsFromPatchPath(relative) {
  if (relative.includes('/client/')) return ['client'];
  if (relative.includes('/reh/')) return ['reh'];
  if (relative.includes('/cli')) return ['cli'];
  return ['client', 'cli', 'reh', 'reh-web'];
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
