# Build Script Analysis: `./dev/build.sh` vs Manual Gulp Commands

## Overview
The `./dev/build.sh` script is a high-level orchestrator that manages the entire VSCodium build process. It chains together several lower-level scripts with proper environment setup and sequencing.

## Script Hierarchy

```
dev/build.sh (orchestrator)
├── get_repo.sh (clone vscode repo)
├── version.sh (determine build versions)
├── build.sh (main build logic - calls prepare_vscode.sh + gulp tasks)
│   ├── prepare_vscode.sh (setup vscode directory)
│   └── [gulp tasks]
└── prepare_assets.sh (create installers/packages)
```

## Key Differences from Manual Gulp Commands

### 1. **Environment Variables Setup**

The script sets comprehensive variables BEFORE anything runs:

```bash
export NODE_OPTIONS="--max-old-space-size=8192"      # Prevents OOM errors
export VSCODE_SKIP_NODE_VERSION_CHECK="yes"          # Works with any Node version
export ELECTRON_SKIP_BINARY_DOWNLOAD=1               # Skips Electron binary download
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1            # Skips Playwright download
```

**Why this matters**: Manual commands likely missed `NODE_OPTIONS`, causing memory issues.

### 2. **Electron Download Handling**

The script uses:
```bash
export ELECTRON_SKIP_BINARY_DOWNLOAD=1
```

This tells npm to SKIP downloading Electron during `npm ci`. The actual Electron binary is obtained later during the gulp build phase, not during npm install.

**Comparison to manual approach**:
- Manual: Probably relied on default behavior (trying to download Electron, hitting network issues)
- Script: Explicitly skips it during npm install, builds it properly during gulp tasks

### 3. **npm Dependencies Installation**

The script has sophisticated retry logic:
```bash
for i in {1..5}; do
  if [[ "${CI_BUILD}" != "no" && "${OS_NAME}" == "osx" ]]; then
    CXX=clang++ npm ci && break  # Use clang++ on macOS CI
  else
    npm ci && break
  fi
  
  if [[ $i == 5 ]]; then
    echo "Npm install failed too many times" >&2
    exit 1
  fi
  
  sleep $(( 15 * (i + 1)))  # Exponential backoff: 30s, 60s, 90s, 120s, 150s
done
```

**Why this helps**: Network timeouts are handled gracefully with exponential backoff.

### 4. **Custom npmrc Configuration**

The script swaps in a custom `.npmrc`:
```bash
mv .npmrc .npmrc.bak
cp ../npmrc .npmrc  # Applies custom config
npm ci
mv .npmrc.bak .npmrc  # Restores original
```

**The custom npmrc includes**:
```
build_from_source="true"        # Build native modules from source
legacy-peer-deps="true"         # Allow legacy peer dependencies
timeout=180000                  # 3-minute timeout for npm operations
```

**Why this helps**: 
- Ensures native modules compile correctly
- Allows peer dependency mismatches
- Longer timeout prevents premature timeout failures (default is 120s)

### 5. **prepare_vscode.sh - Critical Preprocessing**

This script does CRITICAL setup before any gulp tasks run:

#### a) **Copies quality-specific patches**:
```bash
cp -rp src/insider/* vscode/   # or src/stable/*
```

#### b) **Applies all patches**:
```bash
for file in ../patches/*.patch; do
  apply_patch "${file}"
done
```
Patches are applied to fix build issues specific to Director-Code fork.

#### c) **Skips binary downloads during npm install**:
```bash
export ELECTRON_SKIP_BINARY_DOWNLOAD=1
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
```

#### d) **Modifies product.json**:
Replaces Microsoft URLs/branding with Director-Code equivalents:
```bash
setpath "product" "extensionsGallery" \
  '{"serviceUrl": "https://open-vsx.org/vscode/gallery", ...}'
```

This is **critical** - uses open-vsx instead of Microsoft's gallery!

#### e) **Handles Node.js TLS issue implicitly**:
The timeout and retry logic in npm ci handles the TLS/connection issues.

### 6. **Gulp Task Execution Order**

The script runs gulp tasks in a specific, proven order:

```bash
npm run monaco-compile-check              # Validation
npm run valid-layers-check                # Validation
npm run gulp compile-build-without-mangling
npm run gulp compile-extension-media
npm run gulp compile-extensions-build
npm run gulp minify-vscode
npm run gulp vscode-${OS_NAME}-${ARCH}-min-ci
# Platform-specific tasks...
npm run gulp minify-vscode-reh            # Remote Execution Host
npm run gulp vscode-reh-${OS_NAME}-${ARCH}-min-ci
```

**Validation tasks first** - this catches issues early!

### 7. **Installer Generation (Windows)**

The script calls `prepare_assets.sh` which generates setup.exe:

```bash
npm run gulp "vscode-win32-${VSCODE_ARCH}-system-setup"
npm run gulp "vscode-win32-${VSCODE_ARCH}-user-setup"

# For x64/ia32:
. ../build/windows/msi/build.sh  # Generates MSI
```

**Manual approach**: Probably didn't call this, so no installer was generated.

### 8. **builtInExtensions Download Issue**

The script doesn't explicitly handle this, but it's solved by:
1. **prepare_vscode.sh modifies product.json** to use open-vsx
2. **The patches** may include fixes for extension download issues
3. **The timeout config** in npmrc allows longer waits

The extensions are fetched during gulp tasks, and the longer timeout (180s) prevents premature failure.

### 9. **Version Management**

The script uses `version.sh` to:
- Fetch latest VSCode version from MS update API
- Cache version info in `dev/build.env`
- Allow reproducible builds by reusing cached versions

### 10. **Cleanup and Reset**

```bash
if [[ "${SKIP_SOURCE}" != "no" ]]; then
  cd vscode
  git reset -q --hard HEAD
  # Remove VSCODIUM HELPER commits
  while [[ -n "$( git log -1 | grep "VSCODIUM HELPER" )" ]]; do
    git reset -q --hard HEAD~
  done
  rm -rf .build out*  # Clean build artifacts
fi
```

This ensures a clean build state.

## Summary: Why the Script Works

| Issue | Manual Approach | Script Approach |
|-------|-----------------|-----------------|
| Memory errors | No NODE_OPTIONS | Sets `--max-old-space-size=8192` |
| Electron download fails | Default behavior | Skip during npm, let gulp handle it |
| npm timeout | Default 120s | 180s timeout in npmrc |
| Network failures | No retry | 5x retry with exponential backoff |
| Extension gallery | Microsoft's service | Modified to open-vsx in product.json |
| Gulp tasks order | Unknown/random | Specific validated sequence |
| Installer generation | Not called | Explicitly called in prepare_assets.sh |
| Native module compilation | May fail | `build_from_source=true` in npmrc |
| Peer dependency conflicts | Fails | `legacy-peer-deps=true` allows them |

## Reproduction for Manual Commands

If running gulp manually, you must:

1. **Set environment variables first**:
```bash
export NODE_OPTIONS="--max-old-space-size=8192"
export VSCODE_SKIP_NODE_VERSION_CHECK="yes"
export ELECTRON_SKIP_BINARY_DOWNLOAD=1
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
```

2. **Use the custom npmrc**:
```bash
cp npmrc vscode/.npmrc
cd vscode
npm ci  # with 180s timeout
```

3. **Run prepare_vscode.sh first**:
```bash
. prepare_vscode.sh
```

4. **Run gulp tasks in order**:
```bash
npm run gulp compile-build-without-mangling
npm run gulp compile-extension-media
npm run gulp compile-extensions-build
npm run gulp minify-vscode
npm run gulp vscode-win32-x64-min-ci
```

5. **Call prepare_assets.sh for installers**:
```bash
. prepare_assets.sh
```
