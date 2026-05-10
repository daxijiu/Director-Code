#!/usr/bin/env bash

safe_delete_repo_root() {
  local root
  root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  if [[ -n "${root}" ]]; then
    (cd "${root}" && pwd -P)
  else
    (cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)
  fi
}

safe_delete_resolve() {
  local target="$1"
  if [[ -e "${target}" ]]; then
    if [[ -d "${target}" ]]; then
      (cd "${target}" && pwd -P)
    else
      printf '%s/%s\n' "$(cd "$(dirname "${target}")" && pwd -P)" "$(basename "${target}")"
    fi
  else
    printf '%s/%s\n' "$(pwd -P)" "${target}"
  fi
}

safe_delete_normalize() {
  printf '%s' "$1" | sed 's#\\#/#g; s#//*#/#g' | tr '[:upper:]' '[:lower:]'
}

safe_delete_path() {
  local target="$1"
  local root resolved normalized_root normalized_resolved allowed=0
  root="$(safe_delete_repo_root)"

  if [[ -z "${target}" || "${target}" == "." || "${target}" == "/" || "${target}" == *"*"* ]]; then
    echo "safe-delete refused unsafe target: ${target}" >&2
    return 64
  fi

  resolved="$(safe_delete_resolve "${target}")"
  normalized_root="$(safe_delete_normalize "${root}")"
  normalized_resolved="$(safe_delete_normalize "${resolved}")"

  case "${normalized_resolved}" in
    "${normalized_root}/vscode.generated" | "${normalized_root}/vscode.generated/"*) allowed=1 ;;
    "${normalized_root}/artifacts/generated" | "${normalized_root}/artifacts/generated/"*) allowed=1 ;;
    "${normalized_root}/artifacts/out" | "${normalized_root}/artifacts/out/"*) allowed=1 ;;
    "${normalized_root}/.cache/upstreams" | "${normalized_root}/.cache/upstreams/"*) allowed=1 ;;
    "${normalized_root}/.cache/tools" | "${normalized_root}/.cache/tools/"*) allowed=1 ;;
    "${normalized_root}/.cache/upgrade-estimator" | "${normalized_root}/.cache/upgrade-estimator/"*) allowed=1 ;;
  esac

  if [[ "${allowed}" != "1" ]]; then
    echo "safe-delete refused path outside allowlist: ${resolved}" >&2
    return 64
  fi

  if [[ -e "${resolved}" ]]; then
    rm -rf -- "${resolved}"
  fi
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  safe_delete_path "$1"
fi
