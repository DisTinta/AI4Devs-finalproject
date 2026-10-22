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
#
# The path facts come from one node process (paths.mjs, lib.sh path_facts), linear in the length of
# the path. When paths.mjs gives no answer, an unattended run denies, and with the switch "0" jq and
# the bash checks of lib.sh give the same facts.
set -uo pipefail
# The hook's directory without a dirname process; invoke.cjs may pass a Windows path (backslashes).
HOOK_PATH="${BASH_SOURCE[0]//\\//}"
HOOK_DIR="${HOOK_PATH%/*}"
[[ "$HOOK_DIR" != "$HOOK_PATH" ]] || HOOK_DIR=.
source "$HOOK_DIR/lib.sh"

# paths.mjs reads the input from stdin (lib.sh path_facts).
hook_input_init ""
# An autonomous run fails closed from here on; a Cursor background agent once the input is read.
autonomous_run && fail_closed
path_facts edit
fail_closed
if [[ "$PATHS_READ" != true ]]; then
  unattended && deny "Spec audit gate (unattended run): ${PATHS_UNCHECKED}."
  edit_facts_fallback
fi

if ! unattended; then
  # Manual switch in sdd-harness.env: "0" turns the gate off.
  [[ "$KIT_SPEC_AUDIT_GATE" == "0" ]] && done_ok
fi

FILE="$PF_FILE"
[[ -n "$FILE" ]] || done_ok

if unattended; then
  # Counted in bytes on the path as written (paths.mjs): any longer path is too long to check.
  [[ "$PF_TOO_LONG" == 1 ]] && \
    deny "Spec audit gate (unattended run): the path is over 4 KiB, too long to check against PATH_SOURCE and PATH_TESTS in time, so it is not edited."
  # Canonical spelling (paths.mjs), case-insensitive on Windows.
  under_ci "$PF_REL" "$PATH_SOURCE" || under_ci "$PF_REL" "$PATH_TESTS" || done_ok
else
  [[ "$PF_UNDER_SOURCE" == 1 || "$PF_UNDER_TESTS" == 1 ]] || done_ok
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
