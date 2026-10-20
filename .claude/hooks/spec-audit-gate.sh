#!/usr/bin/env bash
# PreToolUse (Edit|Write) — spec audit gate. No code and no test is written for an OpenSpec
# change until the spec-auditor subagent has reviewed its artifacts and its findings were
# resolved (docs/base-standards.md §7.1). The evidence is the audit report the main session
# saves in openspec/changes/<change>/reports/<YYYY-MM-DD>-spec-audit.md.
#
# Only edits under PATH_SOURCE or PATH_TESTS are gated: openspec/, docs/ and the rest stay free,
# so the audit report and the artifact fixes can always be written.
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

# Manual switch in sdd-harness.env: "0" turns the gate off.
[[ "$KIT_SPEC_AUDIT_GATE" == "0" ]] && exit 0

INPUT=$(cat)
hook_input_init "$INPUT"
FILE=$(field "$INPUT" '.tool_input.file_path')
[[ -n "$FILE" ]] || exit 0
FILE="${FILE//\\//}"

under "$FILE" "$PATH_SOURCE" || under "$FILE" "$PATH_TESTS" || exit 0

CHANGES_DIR="$PROJECT_DIR/openspec/changes"
[[ -d "$CHANGES_DIR" ]] || exit 0

ACTIVE=()
for dir in "$CHANGES_DIR"/*/; do
  [[ -d "$dir" ]] || continue
  name="$(basename "$dir")"
  [[ "$name" == "archive" ]] && continue
  ACTIVE+=("$name")
done
[[ ${#ACTIVE[@]} -gt 0 ]] || exit 0

# The change of this branch: the active change whose name closes the branch name
# (feature/DIS-38-claims-and-typing → claims-and-typing); the longest one wins. With no match and
# exactly one active change, that one. Otherwise the change cannot be told: let the edit pass.
BRANCH="$(git -C "$PROJECT_DIR" branch --show-current 2>/dev/null || true)"
CHANGE=""
for name in "${ACTIVE[@]}"; do
  case "$BRANCH" in
    "$name"|*/"$name"|*-"$name")
      [[ ${#name} -gt ${#CHANGE} ]] && CHANGE="$name" ;;
  esac
done
if [[ -z "$CHANGE" && ${#ACTIVE[@]} -eq 1 ]]; then
  CHANGE="${ACTIVE[0]}"
fi
[[ -n "$CHANGE" ]] || exit 0

compgen -G "$CHANGES_DIR/$CHANGE/reports/*spec-audit*.md" >/dev/null && exit 0

deny "Spec audit gate: the OpenSpec change '${CHANGE}' has no spec audit report, so no code or test is written for it yet (docs/base-standards.md §7.1).

Before the apply:
1. Run the spec-auditor subagent over openspec/changes/${CHANGE}/ (proposal, design, specs, tasks).
2. Save its full report as openspec/changes/${CHANGE}/reports/<YYYY-MM-DD>-spec-audit.md, closing
   with a section that says how each finding was resolved.
3. Fix the artifacts it flags (rule 7 / opsx:update). A finding that needs a product decision goes
   to the author; do not decide it alone.
Then retry this edit. Turning the gate off (KIT_SPEC_AUDIT_GATE=\"0\" in .claude/sdd-harness.env)
is the author's call, made by hand."
