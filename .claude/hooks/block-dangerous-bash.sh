#!/usr/bin/env bash
# PreToolUse (Bash) — security invariants that are not delegated to a prompt.
# What lives in AGENTS.md is interpreted by the model; this is executed by code.
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

INPUT=$(cat)
COMMAND=$(field "$INPUT" '.tool_input.command')
[[ -n "$COMMAND" ]] || exit 0

# 1. Mass deletions and device destruction.
if printf '%s' "$COMMAND" | grep -qE 'rm[[:space:]]+(-[a-zA-Z]*[rf][a-zA-Z]*[[:space:]]+)+|mkfs|dd[[:space:]]+if=|:\(\)\{.*\};:'; then
  deny "Destructive command blocked by repository policy: ${COMMAND}"
fi

# 2. Wide-open permissions.
if printf '%s' "$COMMAND" | grep -qE 'chmod[[:space:]]+(-R[[:space:]]+)?777'; then
  deny "chmod 777 blocked: it opens the file to any user on the system."
fi

# 3. History rewriting and force push.
if printf '%s' "$COMMAND" | grep -qE 'git[[:space:]]+push.*(--force([^-]|$)|-f([[:space:]]|$))'; then
  deny "git push --force is forbidden. A force push is done by a human or not at all."
fi
if printf '%s' "$COMMAND" | grep -qE 'git[[:space:]]+(reset[[:space:]]+--hard|clean[[:space:]]+-[a-z]*f|filter-branch)'; then
  ask "This command irreversibly discards local work. Confirm manually."
fi

# 4. Production.
if printf '%s' "$COMMAND" | grep -qiE '(APP_ENV|NODE_ENV|RAILS_ENV)=production|--env[[:space:]]*=?[[:space:]]*prod(uction)?|kubectl[[:space:]].*(-n|--namespace)[[:space:]]*prod'; then
  deny "Operations against production from the agent are not allowed."
fi

# 5. Dependency installation: allowed, but with a warning.
#    19.7% of the packages LLMs recommend do not exist (slopsquatting).
if printf '%s' "$COMMAND" | grep -qE '(^|[[:space:]])(npm|pnpm|yarn|bun)[[:space:]]+(i|add|install)[[:space:]]+[^-]|(^|[[:space:]])(composer|pip|pip3|gem|cargo|go)[[:space:]]+(require|install|add|get)[[:space:]]+[^-]'; then
  ask "You are about to install a dependency. First verify in the official registry that the package exists and is the correct one: this is the slopsquatting vector."
fi

# 6. Additional stack-specific pattern, defined in sdd-harness.env.
if [[ -n "$GUARD_DANGEROUS_CMD" ]] && printf '%s' "$COMMAND" | grep -qE "$GUARD_DANGEROUS_CMD"; then
  ask "This command is destructive for this project's stack (${STACK}). Confirm manually."
fi

exit 0
