#!/usr/bin/env bash
# PostToolUse (Edit|Write) — formats, analyzes and checks the architecture
# guards of the just-written file. The file is ALREADY on disk: this
# hook only returns feedback to the agent so it can fix things before continuing.
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

INPUT=$(cat)
FILE=$(field "$INPUT" '.tool_input.file_path')
[[ -n "$FILE" ]] || exit 0
[[ -f "$FILE" ]] || exit 0
is_source "$FILE" || exit 0

PROBLEMS=""
NOTES=""

# 1. Formatting: applied silently (no eval).
if [[ -n "$CMD_FORMAT_FILE" ]]; then
  run_cmd "$CMD_FORMAT_FILE" "$FILE" >/dev/null 2>&1 || true
fi

# 2. Static analysis on the touched file.
if [[ -n "$CMD_STATIC_FILE" ]]; then
  if ! OUT=$(run_cmd "$CMD_STATIC_FILE" "$FILE" 2>&1); then
    PROBLEMS+="Static analysis with errors:"$'\n'"$(printf '%s' "$OUT" | head -20)"$'\n\n'
  fi
fi

# 3. Architecture guards: the business layer does not know about the transport.
if [[ -n "$GUARD_HTTP_IN_BUSINESS" ]] && under "$FILE" "$PATH_BUSINESS"; then
  if grep -qE "$GUARD_HTTP_IN_BUSINESS" "$FILE" 2>/dev/null; then
    PROBLEMS+="Layer violation: ${FILE} is in ${PATH_BUSINESS} and knows about HTTP. The business layer receives already-validated data and returns domain entities; it neither imports the request nor emits status codes. See docs/backend-standards.md and docs/project-context.md."$'\n\n'
  fi
fi

# 4. Architecture guards: the HTTP layer does not query the database.
if [[ -n "$GUARD_DB_IN_HTTP" ]] && under "$FILE" "$PATH_HTTP"; then
  if grep -qE "$GUARD_DB_IN_HTTP" "$FILE" 2>/dev/null; then
    PROBLEMS+="Possible layer violation: ${FILE} is in ${PATH_HTTP} and appears to query the database or use the request without validating it. Queries live in ${PATH_BUSINESS}. See docs/backend-standards.md."$'\n\n'
  fi
fi

# 5. English-only (docs/base-standards.md §2). Warning, not a block.
if [[ -n "$SPANISH_WORDS" ]]; then
  MATCHES=$(grep -oiE "$SPANISH_WORDS" "$FILE" 2>/dev/null | tr 'A-Z' 'a-z' | sort -u || true)
  COUNT=$(printf '%s' "$MATCHES" | grep -c . 2>/dev/null) || COUNT=0
  HITS=$(printf '%s' "$MATCHES" | head -5 | paste -sd ', ' -)
  if [[ "${COUNT:-0}" -ge 2 ]]; then
    NOTES+="Possible Spanish text in ${FILE} (${HITS}). base-standards.md §2 requires English in every technical artifact: code, comments, error messages and logs. If this is a false positive, ignore it."$'\n'
  fi
fi

if [[ -n "$PROBLEMS" ]]; then
  block "Fix this before continuing:"$'\n'"$PROBLEMS$NOTES"
fi
if [[ -n "$NOTES" ]]; then
  inject "PostToolUse" "$NOTES"
fi
exit 0
