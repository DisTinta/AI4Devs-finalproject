#!/usr/bin/env bash
# UserPromptSubmit — prevents a credential from entering the model's context.
# Cross-cutting requirement: never secrets or PII in the agent's context.
# Text matching KIT_SECRET_ALLOWLIST (known test sentinels) is ignored before scanning; an invalid or
# too wide allowlist is ignored (openspec change autonomous-run-switch, design D10).
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

INPUT=$(cat)
remember_input "$INPUT"
PROMPT=$(field "$INPUT" '.prompt')
[[ -n "$PROMPT" ]] || exit 0

SCANNED=$(strip_allowlisted "$PROMPT")

if printf '%s' "$SCANNED" | grep -qE "$SECRET_PATTERNS"; then
  block_prompt "A possible token, private key or password was detected in the prompt. Do not share credentials with the assistant: use environment variables or an MCP server. If this is a false positive, rephrase without pasting the value."
fi

exit 0
