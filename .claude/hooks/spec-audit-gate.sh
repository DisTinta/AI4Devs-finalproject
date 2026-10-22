#!/usr/bin/env bash
# PreToolUse (Edit|Write) — spec audit gate. No code and no test is written for an OpenSpec
# change until the spec-auditor subagent has reviewed its artifacts and its findings were
# resolved (docs/base-standards.md §7.1). The evidence is the audit report the main session
# saves in openspec/changes/<change>/reports/<YYYY-MM-DD>-spec-audit.md.
#
# Only edits under PATH_SOURCE or PATH_TESTS are gated: openspec/, docs/ and the rest stay free,
# so the audit report and the artifact fixes can always be written.
#
# In an unattended run (openspec change autonomous-run-switch, design D9) the latest verdict must be
# APPROVED, the gate applies whatever KIT_SPEC_AUDIT_GATE says, and a branch whose active change
# cannot be told is denied: the auditor's APPROVED replaces the human plan gate.
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

INPUT=$(cat)
hook_input_init "$INPUT"
fail_closed

if ! unattended; then
  # Manual switch in sdd-harness.env: "0" turns the gate off.
  [[ "$KIT_SPEC_AUDIT_GATE" == "0" ]] && done_ok
fi

field_v "$INPUT" '.tool_input.file_path'   # no jq or subshell on the plain path (lib.sh json_str)
FILE="$FIELD_VAL"
[[ -n "$FILE" ]] || done_ok
slashes_v "$FILE"; FILE="$SLASHED"   # lib.sh: stays fast on a long path

if unattended; then
  path_too_long "$FILE" && \
    deny "Spec audit gate (unattended run): the path is over 4 KiB, too long to check against PATH_SOURCE and PATH_TESTS in time, so it is not edited."
  # Canonical spelling (lib.sh rel_path_v), case-insensitive on Windows.
  rel_path_v "$FILE"
  under_ci "$REL_PATH" "$PATH_SOURCE" || under_ci "$REL_PATH" "$PATH_TESTS" || done_ok
else
  under "$FILE" "$PATH_SOURCE" || under "$FILE" "$PATH_TESTS" || done_ok
fi

CHANGE=$(active_change)
if [[ -z "$CHANGE" ]]; then
  if unattended; then
    deny "Spec audit gate (unattended run): branch $(current_branch) has no determinable active OpenSpec change, so no code or test is written. Run the propose and the spec audit first (docs/base-standards.md §7.1)."
  fi
  done_ok
fi

if unattended; then
  VERDICT=$(latest_verdict "$CHANGE")
  [[ "$VERDICT" == "APPROVED" ]] && done_ok
  if [[ "$VERDICT" == "CHANGES REQUIRED" ]]; then
    deny "Spec audit gate (unattended run): the latest spec audit of '${CHANGE}' is CHANGES REQUIRED, so the ticket stops cleanly here. The author applies or approves the fixes; no code is written until the verdict is APPROVED."
  fi
  # A report exists but holds no readable verdict line (none, or only inside fenced code blocks).
  if [[ -n "$VERDICT" ]]; then
    deny "Spec audit gate (unattended run): the spec audit report of '${CHANGE}' has no APPROVED verdict (no line that is exactly APPROVED or CHANGES REQUIRED outside a code block), so no code or test is written. Finish the spec audit with its verdict line first (docs/base-standards.md §7.1)."
  fi
fi

compgen -G "$PROJECT_DIR/openspec/changes/$CHANGE/reports/*spec-audit*.md" >/dev/null && done_ok

deny "Spec audit gate: the OpenSpec change '${CHANGE}' has no spec audit report, so no code or test is written for it yet (docs/base-standards.md §7.1).

Before the apply:
1. Run the spec-auditor subagent over openspec/changes/${CHANGE}/ (proposal, design, specs, tasks).
2. Save its full report as openspec/changes/${CHANGE}/reports/<YYYY-MM-DD>-spec-audit.md, closing
   with a section that says how each finding was resolved.
3. Fix the artifacts it flags (rule 7 / opsx:update). A finding that needs a product decision goes
   to the author; do not decide it alone.
Then retry this edit. Turning the gate off (KIT_SPEC_AUDIT_GATE=\"0\" in .claude/sdd-harness.env)
is the author's call, made by hand."
