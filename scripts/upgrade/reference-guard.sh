#!/usr/bin/env bash

reference_guard_repo_root() {
  if [[ -n "${WORKSPACE_ROOT:-}" ]]; then
    (cd "${WORKSPACE_ROOT}" && pwd -P)
    return
  fi

  local guard_dir
  guard_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
  if [[ -d "${guard_dir}/.git" || -f "${guard_dir}/.gitignore" ]]; then
    printf '%s\n' "${guard_dir}"
    return
  fi

  git rev-parse --show-toplevel 2>/dev/null
}

reference_guard_resolve() {
  local target="$1"
  local base suffix

  if [[ -z "${target}" ]]; then
    return 1
  fi

  if [[ -e "${target}" ]]; then
    if [[ -d "${target}" ]]; then
      (cd "${target}" && pwd -P)
    else
      base="$(cd "$(dirname "${target}")" && pwd -P)"
      printf '%s/%s\n' "${base}" "$(basename "${target}")"
    fi
    return
  fi

  base="${target}"
  suffix=""
  while [[ ! -e "${base}" && "${base}" != "." && "${base}" != "/" ]]; do
    suffix="/$(basename "${base}")${suffix}"
    base="$(dirname "${base}")"
  done

  if [[ -d "${base}" ]]; then
    printf '%s%s\n' "$(cd "${base}" && pwd -P)" "${suffix}"
  else
    printf '%s\n' "${target}"
  fi
}

reference_guard_normalize() {
  local value
  value="$(printf '%s' "$1" | sed 's#\\#/#g; s#//*#/#g')"

  case "$(uname -s 2>/dev/null || printf '%s' "${OS:-}")" in
    MINGW* | MSYS* | CYGWIN* | Windows_NT)
      printf '%s\n' "${value}" | tr '[:upper:]' '[:lower:]'
      ;;
    *)
      printf '%s\n' "${value}"
      ;;
  esac
}

reference_guard_json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

reference_guard_write_override_marker() {
  local root="$1"
  local target="$2"
  local entrypoint="$3"
  local marker_dir="${root}/.cache/reference/112"
  local marker="${marker_dir}/reference-write-override.jsonl"

  mkdir -p "${marker_dir}"
  printf '{"time":"%s","entrypoint":"%s","target":"%s","reason":"ALLOW_LEGACY_REFERENCE_WRITE"}\n' \
    "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
    "$(reference_guard_json_escape "${entrypoint}")" \
    "$(reference_guard_json_escape "${target}")" >> "${marker}"
}

reference_guard_assert_not_reference() {
  local target="$1"
  local entrypoint="${2:-${BASH_SOURCE[1]:-${BASH_SOURCE[0]}}}"
  local root reference resolved normalized_reference normalized_resolved

  root="$(reference_guard_repo_root)"
  target="${target:-${VSCODE_DIR:-${root}/vscode}}"
  reference="$(reference_guard_resolve "${root}/vscode")"
  resolved="$(reference_guard_resolve "${target}")"
  normalized_reference="$(reference_guard_normalize "${reference}")"
  normalized_resolved="$(reference_guard_normalize "${resolved}")"

  if [[ "${normalized_resolved}" == "${normalized_reference}" || "${normalized_resolved}" == "${normalized_reference}/"* ]]; then
    if [[ "${ALLOW_LEGACY_REFERENCE_WRITE:-}" == "1" && "${CI:-}" != "true" && "${GITHUB_ACTIONS:-}" != "true" ]]; then
      reference_guard_write_override_marker "${root}" "${resolved}" "${entrypoint}"
      echo "WARNING: ALLOW_LEGACY_REFERENCE_WRITE=1 used for ${entrypoint}; reference drift check will fail until re-freeze." >&2
      return 0
    fi

    {
      echo "Refusing to write frozen reference: ${resolved}"
      echo "Entrypoint: ${entrypoint}"
      echo "Use vscode.generated/layers/director/vscode for active work, or run the P1 materialize flow first."
    } >&2
    return 64
  fi
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  reference_guard_assert_not_reference "${1:-${VSCODE_DIR:-vscode}}" "scripts/upgrade/reference-guard.sh"
fi
