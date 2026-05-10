#!/usr/bin/env bash
# shellcheck disable=SC1091

set -e

WORKSPACE_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd -P)"
. "${WORKSPACE_ROOT}/scripts/upgrade/reference-guard.sh"
reference_guard_assert_not_reference "${VSCODE_DIR:-${WORKSPACE_ROOT}/vscode.generated/layers/director/vscode}" "${BASH_SOURCE[0]}" || exit $?
VSCODE_QUALITY="${VSCODE_QUALITY:-stable}"
VSCODE_PLATFORM="${VSCODE_PLATFORM:-${OS_NAME:-win32}}"
if [[ "${VSCODE_PLATFORM}" == "windows" ]]; then
  VSCODE_PLATFORM="win32"
elif [[ "${VSCODE_PLATFORM}" == "osx" ]]; then
  VSCODE_PLATFORM="darwin"
fi
VSCODE_ARCH="${VSCODE_ARCH:-x64}"
ARTIFACTS_OUT="${ARTIFACTS_OUT:-${WORKSPACE_ROOT}/artifacts/out/${VSCODE_QUALITY}/${VSCODE_PLATFORM}-${VSCODE_ARCH}}"
SOURCE_OUT="${ARTIFACTS_OUT}/source"
CHECKSUM_OUT="${ARTIFACTS_OUT}/checksums"

npm install -g checksum

sum_file() {
  if [[ -f "${1}" ]]; then
    echo "Calculating checksum for ${1}"
    checksum -a sha256 "${1}" > "${1}".sha256
    checksum "${1}" > "${1}".sha1
  fi
}

mkdir -p "${SOURCE_OUT}" "${CHECKSUM_OUT}"

git archive --format tar.gz --output="${SOURCE_OUT}/${APP_NAME}-${RELEASE_VERSION}-src.tar.gz" HEAD
git archive --format zip --output="${SOURCE_OUT}/${APP_NAME}-${RELEASE_VERSION}-src.zip" HEAD

if [[ "${VSCODE_QUALITY}" == "insider" ]]; then
  COMMIT_ID=$( git rev-parse HEAD )

  jsonTmp=$( jq -n --arg 'tag' "${RELEASE_VERSION}" --arg 'id' "${BUILD_SOURCEVERSION}" --arg 'commit' "${COMMIT_ID}" '{ "tag": $tag, "id": $id, "commit": $commit }' )
  echo "${jsonTmp}" > "${SOURCE_OUT}/buildinfo.json" && unset jsonTmp
fi

cd "${SOURCE_OUT}"

for FILE in *; do
  if [[ -f "${FILE}" ]]; then
    sum_file "${FILE}"
    cp "${FILE}.sha256" "${CHECKSUM_OUT}/${FILE}.sha256"
    cp "${FILE}.sha1" "${CHECKSUM_OUT}/${FILE}.sha1"
  fi
done

cd ..
