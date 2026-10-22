#!/usr/bin/env bash
# PreToolUse (Edit|Write) — protects the artifacts the agent must not rewrite:
#   1. The OpenSpec specs, which are input to the flow, not output.
#   2. The existing tests, which are the signed specification.
#   3. The already-versioned migrations.
#   4. The environment files.
# In an unattended run nobody can answer a confirmation, so the cases that ask are decided by the
# table of openspec change autonomous-run-switch (design D5, D9) instead.
#
# The path facts come from one node process (paths.mjs, lib.sh path_facts), linear in the length of
# the path; bash keeps the decision table. When paths.mjs gives no answer, an unattended run denies,
# and with the switch "0" jq and the bash checks of lib.sh give the same facts.
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
  unattended && deny "Unattended run: ${PATHS_UNCHECKED}."
  edit_facts_fallback
fi
# The edited path with '/' separators (backslashes converted).
FILE="$PF_FILE"
[[ -n "$FILE" ]] || done_ok

# Path traversal.
[[ "$PF_DOTDOT" == 1 ]] && deny "Path with '..' rejected: ${FILE}"

# Environment and secrets — always on, whatever KIT_PROTECT_SPECS says (PF_ENV).
#    Example files (.env.example, .env.sample) hold no secrets and can be edited, except inside a
#    secret location, where the location wins (design D8).
#    The kit contract is asked about (not denied): it is told apart BEFORE the *.env names,
#    which would otherwise capture it first and leave the confirmation branch dead.
#    Names compare in any letter case (R3-3). The path is judged as written and, when it names a
#    Windows alternate data stream (.env::$DATA, .env:notes), as the file the stream belongs to.
#    Environment file names as lib.sh is_env_file says: config.env.ts is code, prod.env.local is not.
case "$PF_ENV" in
  contract)
    ask "You are about to modify the SDD Harness Kit configuration. Confirm the change." \
      "The contract is edited by hand by the author; stop and report what needs changing." ;;
  deny)
    deny "Environment files are not edited from the agent: ${FILE}" ;;
esac

# Unattended run (design D9): decided here, before the KIT_PROTECT_SPECS switch, so an unattended
# run never inherits a disabled protection.
if unattended; then
  # Counted in bytes on the path as written (paths.mjs): any longer path is too long to check.
  [[ "$PF_TOO_LONG" == 1 ]] && \
    deny "Unattended run: the path is over 4 KiB, too long to check against the protected paths in time, so it is not edited."
  # Canonical spelling (paths.mjs): \\?\, admin shares, cygdrive, '~', '.', '//', the real location
  # of a link, and on Windows the on-disk case; the patterns below match case-insensitively on Windows.
  REL="$PF_REL"; FILE_N="$PF_NORM"
  kit_windows && shopt -s nocasematch

  # Kit configuration (autonomous run only, design D5).
  if autonomous_run && is_kit_config "$FILE_N"; then
    [[ -z "$KIT_CONFIG_UNCHECKED" ]] || \
      deny "Autonomous run: ${REL} could not be checked against the kit configuration (${KIT_CONFIG_UNCHECKED}), so it is treated as kit configuration and not modified."
    deny "Autonomous run: .claude/, .cursor/ and the autonomous profile are not modified by the agent (${REL})."
  fi

  # Free paths, matched on whole repository-relative segments: openspec/changes/<change>/tasks.md,
  # openspec/changes/<change>/reports/… (also under archive/<change>/) and openspec/templates/….
  case "$REL" in
    openspec/templates/*) done_ok ;;
    openspec/changes/*)
      REST="${REL#openspec/changes/}"
      [[ "$REST" == archive/*/* ]] && REST="${REST#archive/}"
      if [[ "$REST" == ?*/* ]]; then
        REST="${REST#*/}"
        [[ "$REST" == "tasks.md" || "$REST" == reports/?* ]] && done_ok
      fi
      ;;
  esac

  IN_REPO=1
  [[ "$REL" == /* || "$REL" =~ ^[A-Za-z]: ]] && IN_REPO=0

  case "$REL" in
    openspec/*)
      [[ -f "$FILE_N" ]] || done_ok   # creating an artifact is the normal propose flow
      CHANGE=$(active_change)
      [[ -n "$CHANGE" ]] || deny "Unattended run: the branch's active OpenSpec change cannot be determined (branch $(current_branch)), so existing artifacts are not rewritten. Name the branch after the change, or keep one active change."
      VERDICT=$(latest_verdict "$CHANGE")
      case "$REL" in
        "openspec/changes/$CHANGE/"*)
          autonomous_run || deny "Unattended run without KIT_AUTONOMOUS_RUN=\"1\": existing artifacts of the change are not rewritten."
          if [[ -z "$VERDICT" || "$VERDICT" == "APPROVED" ]]; then
            allow "Active change ${CHANGE}: no spec audit yet (propose) or latest verdict APPROVED."
          fi
          deny "Unattended run: the spec audit has not approved the change ${CHANGE} (latest verdict: ${VERDICT}). The ticket must stop cleanly; the author applies or approves the fixes."
          ;;
        openspec/specs/*/spec.md)
          CAP="${REL#openspec/specs/}"; CAP="${CAP%/spec.md}"
          if autonomous_run && [[ -d "$PROJECT_DIR/openspec/changes/$CHANGE/specs/$CAP" ]] && [[ "$VERDICT" == "APPROVED" ]]; then
            allow "Main spec ${CAP}: the approved active change ${CHANGE} has a delta for it."
          fi
          deny "Unattended run: the main spec ${CAP} is only synced from an approved delta of the active change (${CHANGE})."
          ;;
        *)
          deny "Unattended run: ${REL} is not an artifact of the active change (${CHANGE})."
          ;;
      esac
      ;;
    docs/base-standards.md|docs/documentation-standards.md|docs/openspec-tasks-mandatory-steps.md)
      deny "Unattended run: kit doctrine (${REL}) is not edited; project-specific rules go in docs/project-context.md."
      ;;
  esac

  # A file outside the repository is not under PATH_TESTS or PATH_MIGRATIONS (paths are compared
  # relative to the repository root): no decision, like every other file outside the repository.
  [[ "$IN_REPO" == "1" ]] || done_ok

  # Existing tests: allowed only when planned in tasks.md or created by the branch (Q2, design D9).
  if under_ci "$REL" "$PATH_TESTS" && [[ -f "$FILE_N" ]]; then
    autonomous_run || deny "Unattended run without KIT_AUTONOMOUS_RUN=\"1\": existing tests are not modified."
    CHANGE=$(active_change)
    [[ -n "$CHANGE" ]] || deny "Unattended run: the branch's active OpenSpec change cannot be determined (branch $(current_branch)), so existing tests are not modified."
    TASKS="$PROJECT_DIR/openspec/changes/$CHANGE/tasks.md"
    ESCAPED=$(printf '%s' "$REL" | sed 's/[][\.*^$()+?{}|\/]/\\&/g')
    if [[ -f "$TASKS" ]] && tr -d '\r' < "$TASKS" | grep -qE "(^|[[:space:]\`\"'(])${ESCAPED}(\$|[[:space:]\`\"'),;])"; then
      allow "Existing test ${REL} is planned in ${CHANGE}/tasks.md."
    fi
    [[ "$(existed_at_merge_base "$REL")" == "no" ]] && allow "Test ${REL} was created by this branch."
    deny "Unattended run: ${REL} is an existing test that tasks.md of ${CHANGE} does not name. Record the test change in tasks.md together with the requirement that changes it (rule 7), then edit it."
  fi

  # Versioned migrations.
  if [[ -n "$PATH_MIGRATIONS" ]] && under_ci "$REL" "$PATH_MIGRATIONS" && [[ -f "$FILE_N" ]] && \
     git -C "$PROJECT_DIR" ls-files --error-unmatch -- "$REL" >/dev/null 2>&1; then
    deny "Unattended run: ${REL} is an already-versioned migration. Create a new migration instead."
  fi
  done_ok
fi

# Manual switch in sdd-harness.env: "0" turns off the confirmations below.
[[ "$KIT_PROTECT_SPECS" == "0" ]] && done_ok

# 1. openspec/: the distinction that matters is CREATE versus REWRITE.
#    Creating the artifacts of a proposal is the normal flow (propose phase).
#    Rewriting an artifact that already exists can be legitimate —rule 7 of
#    base-standards.md requires updating the specification BEFORE touching code when
#    a change arrives— or it can be the agent making the spec fit what it already
#    implemented. Only a human can tell those two cases apart, so we ask.
#    PF_OPENSPEC: under openspec/, except tasks.md (marking tasks completed), reports/ (mandatory
#    verification reports) and openspec/templates/ (kit templates).
if [[ "$PF_OPENSPEC" == 1 && -f "$FILE" ]]; then
          ask "You are about to REWRITE a specification artifact that already exists (${FILE}).

This is normal and frequent when working with the fluid OpenSpec flow: /opsx:apply fixes an
artifact and moves on, /opsx:sync dumps a delta onto the main spec. It is not an alarm on its own.

Legitimate: a scope change arrived, or the design turned out to be wrong, and you are updating the
specification BEFORE (or while) touching the code — rule 7 of docs/base-standards.md.

Illegitimate: you are adjusting the specification to fit code you already wrote without
the design having changed. That reverses the flow direction and leaves the change unreviewed.

Confirm if it is the first case."
fi

# 1b. The docs/ doctrine is replaced by the kit on update: editing it per project
#     means losing the change on the next update.
if [[ "$PF_DOCTRINE" == 1 ]]; then
    ask "You are about to edit kit doctrine (${FILE}). The kit replaces it on update, so the change would be lost. What is specific to this project goes in docs/project-context.md or docs/backend-standards.md. Confirm only if you really want to diverge from the kit."
fi

# 2. Tests: creating a new one is free; modifying an existing one requires confirmation.
if [[ "$PF_UNDER_TESTS" == 1 && -f "$FILE" ]]; then
  ask "You are about to MODIFY an existing test (${FILE}). Tests are the project's signed specification: confirm that this change is intentional and not a shortcut to make the suite green."
fi

# 3. Migrations already versioned in git.
if [[ -n "$PATH_MIGRATIONS" && "$PF_UNDER_MIG" == 1 && -f "$FILE" ]]; then
  if git -C "$PROJECT_DIR" ls-files --error-unmatch "$FILE" >/dev/null 2>&1; then
    ask "You are modifying an already-versioned migration (${FILE}). The correct approach is to create a new migration. Confirm if you really want to edit it."
  fi
fi

done_ok
