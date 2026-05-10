#!/usr/bin/env bash

set -e

WORKSPACE_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd -P)"
VSCODE_QUALITY="${VSCODE_QUALITY:-stable}"
VSCODE_PLATFORM="${VSCODE_PLATFORM:-${OS_NAME:-win32}}"
if [[ "${VSCODE_PLATFORM}" == "windows" ]]; then
  VSCODE_PLATFORM="win32"
elif [[ "${VSCODE_PLATFORM}" == "osx" ]]; then
  VSCODE_PLATFORM="darwin"
fi
VSCODE_ARCH="${VSCODE_ARCH:-x64}"
ARTIFACTS_OUT="${ARTIFACTS_OUT:-${WORKSPACE_ROOT}/artifacts/out/${VSCODE_QUALITY}/${VSCODE_PLATFORM}-${VSCODE_ARCH}}"
CHECKSUM_OUT="${ARTIFACTS_OUT}/checksums"
LEGACY_ASSETS_DIR="${LEGACY_ASSETS_DIR:-assets}"

npm install -g checksum

sum_file() {
  if [[ -f "${1}" ]]; then
    echo "Calculating checksum for ${1}"
    checksum -a sha256 "${1}" > "${1}".sha256
    checksum "${1}" > "${1}".sha1
  fi
}

mkdir -p "${CHECKSUM_OUT}"

cd "${LEGACY_ASSETS_DIR}"

for FILE in *; do
  if [[ -f "${FILE}" ]]; then
    sum_file "${FILE}"
    cp "${FILE}.sha256" "${CHECKSUM_OUT}/${FILE}.sha256"
    cp "${FILE}.sha1" "${CHECKSUM_OUT}/${FILE}.sha1"
  fi
done

cd ..
