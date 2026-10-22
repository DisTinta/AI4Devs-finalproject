#!/usr/bin/env bash
# PreToolUse (Read|Grep|Glob) — prevents the agent from reading secret files into the context, also
# through the search tools (Grep: path and glob; Glob: path and pattern).
# Complements block-secrets.sh (which only looks at the user's prompt).
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

INPUT=$(cat)
hook_input_init "$INPUT"
fail_closed
TOOL=$(field "$INPUT" '.tool_name')

REASON="looks like a secrets or credentials file. Do not load .env, private keys or credentials.json into the model's context. Use shell environment variables or a secret manager. If you need the SHAPE of the config, ask the human for a redacted example."

case "$TOOL" in
  Read|read|"")
    FILE=$(field "$INPUT" '.tool_input.file_path')
    [[ -n "$FILE" ]] || FILE=$(field "$INPUT" '.tool_input.path')
    [[ -n "$FILE" ]] || done_ok
    if is_secret_path "$FILE"; then
      deny "Read blocked: ${FILE} ${REASON}"
    fi
    ;;
  Grep|Glob)
    TARGET=$(field "$INPUT" '.tool_input.path')
    if [[ "$TOOL" == "Grep" ]]; then
      PATTERN=$(field "$INPUT" '.tool_input.glob')
    else
      PATTERN=$(field "$INPUT" '.tool_input.pattern')
    fi
    if [[ -n "$TARGET" ]] && { is_secret_path "$TARGET" || is_secret_dir "$TARGET"; }; then
      deny "${TOOL} blocked: ${TARGET} ${REASON}"
    fi
    if [[ -n "$PATTERN" ]] && glob_reaches_secret "$PATTERN"; then
      deny "${TOOL} blocked: the pattern ${PATTERN} reaches files that look like secrets or credentials (.env, secrets/, credentials…). Narrow it to the files you need; example env files (.env.example, .env.sample) stay readable."
    fi
    ;;
esac

done_ok
