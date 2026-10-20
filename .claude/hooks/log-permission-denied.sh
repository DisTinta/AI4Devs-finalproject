#!/usr/bin/env bash
# PermissionDenied — in an autonomous run, appends every denial to .claude/autonomous-denials.log
# (one JSON line, secrets redacted) for the run's final report (openspec change
# autonomous-run-switch, design D10). Ignored by git. It never blocks: it always exits 0.
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

INPUT=$(cat)
autonomous_run || exit 0
has_jq || exit 0

LINE=$(printf '%s' "$INPUT" | jq -c --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '
  { ts: $ts, tool_name: .tool_name, reason: .reason, tool_input: .tool_input }
  + (if .classifier_verdict then { classifier_verdict: .classifier_verdict } else {} end)' 2>/dev/null) || exit 0
LINE=$(printf '%s' "$LINE" | sed -E "s#${SECRET_PATTERNS}#[REDACTED]#g" 2>/dev/null) || exit 0

{ printf '%s\n' "$LINE" >> "$PROJECT_DIR/.claude/autonomous-denials.log"; } 2>/dev/null || true
exit 0
