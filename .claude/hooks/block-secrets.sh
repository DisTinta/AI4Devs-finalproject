#!/usr/bin/env bash
# UserPromptSubmit — prevents a credential from entering the model's context.
# Cross-cutting requirement: never secrets or PII in the agent's context.
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

INPUT=$(cat)
PROMPT=$(field "$INPUT" '.prompt')
[[ -n "$PROMPT" ]] || exit 0

PATTERNS='(sk-ant-[A-Za-z0-9_-]{20,}'
PATTERNS+='|sk-[a-zA-Z0-9]{40,}'
PATTERNS+='|ghp_[a-zA-Z0-9]{36}'
PATTERNS+='|github_pat_[A-Za-z0-9_]{50,}'
PATTERNS+='|gho_[a-zA-Z0-9]{36}'
PATTERNS+='|xox[baprs]-[A-Za-z0-9-]{10,}'
PATTERNS+='|AKIA[0-9A-Z]{16}'
PATTERNS+='|AIza[0-9A-Za-z_-]{35}'
PATTERNS+='|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}'
PATTERNS+='|-----BEGIN [A-Z ]*PRIVATE KEY-----'
PATTERNS+='|(APP_KEY|SECRET_KEY|DB_PASSWORD|API_SECRET)[[:space:]]*=[[:space:]]*[^[:space:]]{8,})'

if printf '%s' "$PROMPT" | grep -qE "$PATTERNS"; then
  block_prompt "A possible token, private key or password was detected in the prompt. Do not share credentials with the assistant: use environment variables or an MCP server. If this is a false positive, rephrase without pasting the value."
fi

exit 0
