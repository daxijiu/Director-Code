#!/usr/bin/env bash

set -ex

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || (cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P))"
. "${REPO_ROOT}/scripts/upgrade/reference-guard.sh"
reference_guard_assert_not_reference "${VSCODE_DIR:-${REPO_ROOT}/vscode}" "${BASH_SOURCE[0]}" || exit $?

# Add Windows SDK to path
SDK='/C/Program Files (x86)/Windows Kits/10/bin/10.0.26100.0/x64'
export PATH="${SDK}:${PATH}"

APPX_NAME="${BINARY_NAME//-/_}"

makeappx pack /d "../../../VSCode-win32-${VSCODE_ARCH}/appx/manifest" /p "../../../VSCode-win32-${VSCODE_ARCH}/appx/${APPX_NAME}_${VSCODE_ARCH}.appx" /nv

# Remove the raw manifest folder
rm -rf "../../../VSCode-win32-${VSCODE_ARCH}/appx/manifest"
