#!/usr/bin/env bash
# SessionStart — injects the real repository state when the session starts.
# Prevents the agent from asking what it can read, and from assuming it if it doesn't ask.
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

INPUT=$(cat)
SOURCE=$(field "$INPUT" '.source')
[[ "$SOURCE" == "startup" || "$SOURCE" == "resume" ]] || exit 0

BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
LAST_COMMIT=$(git log -1 --oneline 2>/dev/null || echo "no commits")
DIRTY=$(git status --short 2>/dev/null | wc -l | tr -d ' ')

ACTIVE_CHANGES="none"
PENDING_TASKS="0"
if [[ -d "$PROJECT_DIR/openspec/changes" ]]; then
  FOUND=$(find "$PROJECT_DIR/openspec/changes" -maxdepth 1 -mindepth 1 -type d \
    -not -name archive 2>/dev/null | sed 's#.*/##' | paste -sd ', ' - || true)
  [[ -n "$FOUND" ]] && ACTIVE_CHANGES="$FOUND"
  PENDING_TASKS=$(grep -rh '^- \[ \]' "$PROJECT_DIR/openspec/changes" \
    --include='tasks.md' 2>/dev/null | wc -l | tr -d ' ')
fi

PROTECT_WARNING=""
[[ "$KIT_PROTECT_SPECS" == "0" ]] && \
  PROTECT_WARNING="⚠ protect-specs: OFF (sdd-harness.env, KIT_PROTECT_SPECS=\"0\"). Existing specs, tests and migrations can be rewritten without confirmation.
"

CONTEXT="${PROTECT_WARNING}Repository state
- Configured stack: ${STACK}
- Branch: ${BRANCH} (expected prefix: ${BRANCH_PREFIX})
- Last commit: ${LAST_COMMIT}
- Uncommitted modified files: ${DIRTY}
- Active OpenSpec changes: ${ACTIVE_CHANGES}
- Pending tasks in active changes: ${PENDING_TASKS}

Project commands
- Tests: ${CMD_TEST:-not configured}
- Lint: ${CMD_LINT:-not configured}
- Static analysis: ${CMD_STATIC:-not configured}

Project context (read it; don't make it up — in Claude Code only CLAUDE.md is auto-loaded)
- docs/project-context.md — gotchas, real commands, conventions
- docs/backend-standards.md / docs/frontend-standards.md — stack layers
- .claude/sdd-harness.env — command and path contract (BRANCH_PREFIX, PATH_*)
- docs/openspec-tasks-mandatory-steps.md — READ IT before creating or editing any tasks.md; its
  mandatory steps are enforced by the validate-tasks hook (it will block you if they are missing)
- docs/documentation-standards.md — documentation gate before committing (docs-gate hook)

Workflow reminders
- TDD: the test is written and seen to fail before the implementation.
- Layer order: ${LAYER_ORDER:-see docs/backend-standards.md}.
- Business logic lives in ${PATH_BUSINESS:-the layer indicated in project-context}.
- OpenSpec: CREATING artifacts in propose/sync is normal. REWRITING existing specs
  to fit a code shortcut is forbidden (rule 7 / protect-specs).
  Marking tasks in tasks.md and writing reports/ is always free.
- Secrets: never paste tokens or read .env into the context. Use /privacy-ethics-check
  if the unit touches PII, auth or logging of personal data.
- MCP: Context7 for library docs (don't wait for someone to tell you «use context7»).
  Playwright MCP to demonstrate a real UI in /show-spec-working. If a server
  is disabled, say so and continue."

inject "SessionStart" "$CONTEXT"
