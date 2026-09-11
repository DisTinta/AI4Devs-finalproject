#!/usr/bin/env bash
# PreToolUse (Bash) filtered on git commit — the documentation gate from
# docs/documentation-standards.md: don't commit code that leaves the documentation lying.
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

INPUT=$(cat)
COMMAND=$(field "$INPUT" '.tool_input.command')
printf '%s' "$COMMAND" | grep -qE 'git[[:space:]]+commit' || exit 0

cd "$PROJECT_DIR" 2>/dev/null || exit 0

# What is staged for commit.
STAGED=$(git diff --cached --name-only 2>/dev/null || true)
[[ -n "$STAGED" ]] || exit 0

touches_source=0
touches_docs=0
touches_schema=0
touches_contract=0

while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  is_source "$f" && touches_source=1
  case "$f" in
    docs/*|*.md) touches_docs=1 ;;
  esac
  [[ -n "$PATH_MIGRATIONS" ]] && under "$f" "$PATH_MIGRATIONS" && touches_schema=1
  [[ -n "$PATH_HTTP" ]] && under "$f" "$PATH_HTTP" && touches_contract=1
done <<< "$STAGED"

REASONS=""
if [[ $touches_schema -eq 1 && $touches_docs -eq 0 ]]; then
  REASONS+="  - The data schema changes and no documentation is updated."$'\n'
fi
if [[ $touches_contract -eq 1 && $touches_docs -eq 0 ]]; then
  REASONS+="  - The interface layer changes and the API contract is not regenerated or updated."$'\n'
fi

if [[ -n "$REASONS" ]]; then
  ask "Documentation gate (docs/documentation-standards.md):
${REASONS}
Run the /update-docs skill before committing, or confirm the documentation was already up to date."
fi

exit 0
