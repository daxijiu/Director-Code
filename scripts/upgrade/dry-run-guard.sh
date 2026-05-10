#!/usr/bin/env bash

dry_run_value() {
  printf '%s' "${DRY_RUN:-}"
}

dry_run_is_enabled() {
  [[ -n "${DRY_RUN:-}" && "${DRY_RUN:-}" != "0" && "${DRY_RUN:-}" != "false" ]]
}

dry_run_is_offline() {
  [[ "${DRY_RUN:-}" == "offline" ]]
}

dry_run_exit_if_requested() {
  local entrypoint="${1:-script}"
  if dry_run_is_enabled; then
    echo "DRY_RUN=${DRY_RUN}: ${entrypoint} side effects are blocked in P1; exiting before network/write/upload actions."
    exit 0
  fi
}

dry_run_require_for_side_effect() {
  local entrypoint="${1:-script}"
  if ! dry_run_is_enabled; then
    echo "Refusing ${entrypoint}: P1 requires DRY_RUN=1 or DRY_RUN=offline for release/update/upload/external side-effect scripts." >&2
    exit 65
  fi
}
