#!/usr/bin/env bash
# Stop — the turn does not close with the suite in the red.
# Escape: KIT_SKIP_STOP_TESTS=1 or KIT_ALLOW_WIP=1 in sdd-harness.env
# (only for local spikes; don't use this in the delivery flow).
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

INPUT=$(cat)
[[ "$(field "$INPUT" '.stop_hook_active')" == "true" ]] && exit 0
[[ "${KIT_SKIP_STOP_TESTS}" == "1" ]] && exit 0
[[ "${KIT_ALLOW_WIP}" == "1" ]] && exit 0
[[ -n "$CMD_TEST" ]] || exit 0

WATCH=""
for d in "$PATH_SOURCE" "$PATH_TESTS"; do
  [[ -n "$d" && -e "$PROJECT_DIR/$d" ]] && WATCH+=" $d"
done
[[ -n "$WATCH" ]] || exit 0
# shellcheck disable=SC2086
git -C "$PROJECT_DIR" diff --quiet HEAD -- $WATCH 2>/dev/null && exit 0

if OUT=$(run_cmd "$CMD_TEST" 2>&1); then
  notify "Suite is green. Before considering the task closed: mark the completed tasks in tasks.md, check whether the decision warrants an ADR in ${PATH_ADR} and confirm the API documentation is still up to date. If you touch personal data or auth, run /privacy-ethics-check."
  exit 0
fi

block "The test suite fails. You cannot close the turn yet. Output of \`${CMD_TEST}\`:"$'\n'"$(printf '%s' "$OUT" | tail -30)"$'\n\nIf you are in a local spike and need to leave partway, set KIT_ALLOW_WIP=1 in .claude/sdd-harness.env (remove it before the PR).'
