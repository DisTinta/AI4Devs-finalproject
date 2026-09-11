#!/usr/bin/env bash
# PreToolUse (Read) — prevents the agent from reading secret files into the context.
# Complements block-secrets.sh (which only looks at the user's prompt).
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

INPUT=$(cat)
TOOL=$(field "$INPUT" '.tool_name')
FILE=$(field "$INPUT" '.tool_input.file_path')
[[ -n "$FILE" ]] || FILE=$(field "$INPUT" '.tool_input.path')
[[ -n "$FILE" ]] || exit 0

case "$TOOL" in
  Read|read|"") : ;;
  *) exit 0 ;;
esac

if is_secret_path "$FILE"; then
  deny "Read blocked: ${FILE} looks like a secrets or credentials file. Do not load .env, private keys or credentials.json into the model's context. Use shell environment variables or a secret manager. If you need the SHAPE of the config, ask the human for a redacted example."
fi

exit 0
