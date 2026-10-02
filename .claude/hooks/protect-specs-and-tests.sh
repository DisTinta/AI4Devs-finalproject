#!/usr/bin/env bash
# PreToolUse (Edit|Write) — protects the artifacts the agent must not rewrite:
#   1. The OpenSpec specs, which are input to the flow, not output.
#   2. The existing tests, which are the signed specification.
#   3. The already-versioned migrations.
#   4. The environment files.
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

INPUT=$(cat)
FILE=$(field "$INPUT" '.tool_input.file_path')
[[ -n "$FILE" ]] || exit 0
# Normalize slashes for Windows (Git Bash): the case patterns below match on '/'.
FILE="${FILE//\\//}"

# Path traversal.
case "$FILE" in
  *..*) deny "Path with '..' rejected: ${FILE}" ;;
esac

# 1. openspec/: the distinction that matters is CREATE versus REWRITE.
#    Creating the artifacts of a proposal is the normal flow (propose phase).
#    Rewriting an artifact that already exists can be legitimate —rule 7 of
#    base-standards.md requires updating the specification BEFORE touching code when
#    a change arrives— or it can be the agent making the spec fit what it already
#    implemented. Only a human can tell those two cases apart, so we ask.
case "$FILE" in
  */openspec/*|openspec/*)
    case "$FILE" in
      */tasks.md) : ;;                 # marking tasks completed
      */reports/*) : ;;                # mandatory verification reports
      */openspec/templates/*) : ;;     # kit templates
      *)
        if [[ -f "$FILE" ]]; then
          ask "You are about to REWRITE a specification artifact that already exists (${FILE}).

This is normal and frequent when working with the fluid OpenSpec flow: /opsx:apply fixes an
artifact and moves on, /opsx:sync dumps a delta onto the main spec. It is not an alarm on its own.

Legitimate: a scope change arrived, or the design turned out to be wrong, and you are updating the
specification BEFORE (or while) touching the code — rule 7 of docs/base-standards.md.

Illegitimate: you are adjusting the specification to fit code you already wrote without
the design having changed. That reverses the flow direction and leaves the change unreviewed.

Confirm if it is the first case."
        fi
        ;;
    esac
    ;;
esac

# 1b. The docs/ doctrine is replaced by the kit on update: editing it per project
#     means losing the change on the next update.
case "$FILE" in
  */docs/base-standards.md|docs/base-standards.md|\
  */docs/documentation-standards.md|docs/documentation-standards.md|\
  */docs/openspec-tasks-mandatory-steps.md|docs/openspec-tasks-mandatory-steps.md)
    ask "You are about to edit kit doctrine (${FILE}). The kit replaces it on update, so the change would be lost. What is specific to this project goes in docs/project-context.md or docs/backend-standards.md. Confirm only if you really want to diverge from the kit."
    ;;
esac

# 2. Tests: creating a new one is free; modifying an existing one requires confirmation.
if under "$FILE" "$PATH_TESTS" && [[ -f "$FILE" ]]; then
  ask "You are about to MODIFY an existing test (${FILE}). Tests are the project's signed specification: confirm that this change is intentional and not a shortcut to make the suite green."
fi

# 3. Migrations already versioned in git.
if [[ -n "$PATH_MIGRATIONS" ]] && under "$FILE" "$PATH_MIGRATIONS" && [[ -f "$FILE" ]]; then
  if git -C "$PROJECT_DIR" ls-files --error-unmatch "$FILE" >/dev/null 2>&1; then
    ask "You are modifying an already-versioned migration (${FILE}). The correct approach is to create a new migration. Confirm if you really want to edit it."
  fi
fi

# 4. Environment and secrets.
#    The kit contract is asked about (not denied): it goes BEFORE the *.env pattern,
#    which would otherwise capture it first and leave the confirmation branch dead.
case "$FILE" in
  */.claude/sdd-harness.env|.claude/sdd-harness.env)
    ask "You are about to modify the SDD Harness Kit configuration. Confirm the change." ;;
  *.env|*.env.*|*/.env|.env)
    deny "Environment files are not edited from the agent: ${FILE}" ;;
esac

exit 0
