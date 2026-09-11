#!/usr/bin/env bash
# PostToolUse (Edit|Write) on tasks.md — mechanically enforces
# docs/openspec-tasks-mandatory-steps.md. Without this, the document is a recommendation.
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

INPUT=$(cat)
FILE=$(field "$INPUT" '.tool_input.file_path')
case "$FILE" in
  */tasks.md) : ;;
  *) exit 0 ;;
esac
[[ -f "$FILE" ]] || exit 0

PROBLEMS=""
BODY=$(cat "$FILE")

# 1. Step 0 must create the branch, and it must be the first one.
FIRST_SECTION=$(printf '%s' "$BODY" | grep -m1 '^## ' || true)
if ! printf '%s' "$FIRST_SECTION" | grep -qiE '^## 0\.'; then
  PROBLEMS+="The first heading of tasks.md must be '## 0. ...' with the branch creation. Found: ${FIRST_SECTION:-none}."$'\n'
elif ! printf '%s' "$FIRST_SECTION" | grep -qiE 'branch|rama'; then
  PROBLEMS+="Step 0 exists but does not mention creating the work branch."$'\n'
fi

# 1b. Configured branch prefix (BRANCH_PREFIX, e.g. feature/).
if [[ -n "$BRANCH_PREFIX" ]]; then
  if ! printf '%s' "$BODY" | grep -qF "$BRANCH_PREFIX"; then
    PROBLEMS+="No task mentions the branch prefix '${BRANCH_PREFIX}' defined in .claude/sdd-harness.env (BRANCH_PREFIX). Step 0 must create a branch with that prefix."$'\n'
  fi
fi

# 2. The mandatory verification steps (EN + ES).
missing=""
printf '%s' "$BODY" | grep -qiE '^## .*(Review and Update Existing Tests|Existing Tests|Revisar.*(tests|pruebas)|Tests existentes)' \
  || missing+="  - Review and Update Existing Tests"$'\n'
printf '%s' "$BODY" | grep -qiE '^## .*(Run Tests|Verify Data State|Verify Database State|Ejecutar (tests|pruebas)|Verificar.*(datos|estado|base))' \
  || missing+="  - Run Tests and Verify Data State"$'\n'
printf '%s' "$BODY" | grep -qiE '^## .*(Manual .*Testing|Manual Interface|Prueba(s)? manual|Verificación manual)' \
  || missing+="  - Manual Interface Testing (AGENT MUST EXECUTE)"$'\n'
printf '%s' "$BODY" | grep -qiE '^## .*(Documentation|Documentación)' \
  || missing+="  - Update Technical Documentation"$'\n'
if [[ -n "$missing" ]]; then
  PROBLEMS+="Mandatory steps missing in tasks.md (see docs/openspec-tasks-mandatory-steps.md):"$'\n'"$missing"
fi

# 3. Tagging.
printf '%s' "$BODY" | grep -q '(MANDATORY' || \
  PROBLEMS+="No step carries the (MANDATORY) tag. The mandatory steps must be marked."$'\n'
if printf '%s' "$BODY" | grep -qiE '^## .*(Manual|manual)' && ! printf '%s' "$BODY" | grep -q 'AGENT MUST EXECUTE'; then
  PROBLEMS+="The manual verification step must explicitly declare 'AGENT MUST EXECUTE'."$'\n'
fi

# 4. State restoration in operations that mutate data.
#    Case-sensitive and scoped to mutating HTTP methods and explicit SQL DML:
#    so it does not fire on "create branch" or "Update Technical Documentation",
#    which were false positives with the previous generic heuristic.
if printf '%s' "$BODY" | grep -qE '\b(POST|PUT|PATCH|DELETE|INSERT|UPDATE|TRUNCATE|DROP)\b' && \
   ! printf '%s' "$BODY" | grep -qiE 'restor|revert|restaur|deshacer'; then
  PROBLEMS+="There are tasks that mutate data and none mentions restoring the state after verification."$'\n'
fi

# 5. Subtask numbering.
if ! printf '%s' "$BODY" | grep -qE '^- \[[ x]\] [0-9]+\.[0-9]+'; then
  PROBLEMS+="Subtasks must use hierarchical numbering: '- [ ] N.M description'."$'\n'
fi

if [[ -n "$PROBLEMS" ]]; then
  block "tasks.md does not meet the mandatory steps. Fix it before implementing:"$'\n'"$PROBLEMS"
fi
exit 0
