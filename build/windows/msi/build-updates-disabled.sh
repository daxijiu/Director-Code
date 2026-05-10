#!/usr/bin/env bash

set -ex

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || (cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P))"
. "${REPO_ROOT}/scripts/upgrade/reference-guard.sh"
reference_guard_assert_not_reference "${VSCODE_DIR:-${REPO_ROOT}/vscode}" "${BASH_SOURCE[0]}" || exit $?

CALLER_DIR=$( pwd )

cd "$( dirname "${BASH_SOURCE[0]}" )"

SCRIPT_DIR=$( pwd )

cd "../../../VSCode-win32-${VSCODE_ARCH}/resources/app"

jsonTmp=$( jq "del(.updateUrl)" product.json )
echo "${jsonTmp}" > product.json && unset jsonTmp

cd "${SCRIPT_DIR}"

./build.sh "updates-disabled"

cd "${CALLER_DIR}"
