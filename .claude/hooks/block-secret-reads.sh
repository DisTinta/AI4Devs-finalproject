#!/usr/bin/env bash
# PreToolUse (Read|Grep|Glob) — prevents the agent from reading secret files into the context, also
# through the search tools (Grep: path and glob; Glob: path and pattern). Cursor runs it on
# beforeReadFile and on preToolUse for Grep, with the same decisions (design D11).
# Complements block-secrets.sh (which only looks at the user's prompt).
#
# Cost (verify report 2026-10-22): the plain case runs no jq and forks no subshell. json_str reads
# every key that can carry a path or a glob, wherever it sits in the input; only when one of them
# looks like a secret, or the input cannot be read without jq, does one jq call read the exact fields
# and decide.
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

INPUT=$(cat)
hook_input_init "$INPUT"
fail_closed

REASON="looks like a secrets or credentials file. Do not load .env, private keys or credentials.json into the model's context. Use shell environment variables or a secret manager. If you need the SHAPE of the config, ask the human for a redacted example."

# check TOOL FILE TARGET PATTERN: sets HIT to the denial reason when the call reaches a secret.
HIT=""
check() {
  case "$1" in
    Read|read|"")
      if [[ -n "$2" ]] && is_secret_path "$2"; then HIT="Read blocked: $2 ${REASON}"; return 0; fi ;;
    Grep|Glob)
      if [[ -n "$3" ]] && { is_secret_path "$3" || is_secret_dir "$3"; }; then HIT="$1 blocked: $3 ${REASON}"; return 0; fi
      if [[ -n "$4" ]] && glob_reaches_secret "$4"; then
        HIT="$1 blocked: the pattern $4 reaches files that look like secrets or credentials (.env, secrets/, credentials…). Narrow it to the files you need; example env files (.env.example, .env.sample) stay readable."
        return 0
      fi ;;
  esac
  return 1
}

# Fast path: every key that can carry the path or the glob of a call, read by json_str. The call is
# free when none of their values reaches a secret. Grep's own pattern is a content regex, not a glob.
fast_free() {
  local tool="" key k
  has_jq || return 1
  json_str tool_name "$INPUT"; case $? in 0) tool="$JSON_STR" ;; 2) return 1 ;; esac
  case "$tool" in
    Read|read|"") set -- file_path path target_file ;;
    Grep) set -- path target_directory glob include_pattern include ;;
    Glob) set -- path target_directory pattern glob_pattern glob ;;
    *) return 0 ;;
  esac
  for key in "$@"; do
    json_str "$key" "$INPUT"; k=$?
    (( k == 2 )) && return 1
    (( k == 1 )) && continue
    case "$tool:$key" in
      Grep:glob|Grep:include*|Glob:pattern|Glob:glob*) check "$tool" "" "" "$JSON_STR" && return 1 ;;
      Grep:*|Glob:*) check "$tool" "" "$JSON_STR" "" && return 1 ;;
      *) check "$tool" "$JSON_STR" "" "" && return 1 ;;
    esac
  done
  return 0
}
fast_free && done_ok

# Exact fields, one jq call (Claude Code and Cursor keys alike; field() in lib.sh maps the same ones).
has_jq || done_ok
OUT=$(printf '%s' "$INPUT" | jq -j '
  [ (.tool_name // (if .hook_event_name == "beforeReadFile" then "Read" else "" end)),
    (.tool_input.file_path // .tool_input.path // .tool_input.target_file // .file_path // ""),
    (.tool_input.path // .tool_input.target_directory // ""),
    (if .tool_name == "Grep" then (.tool_input.glob // .tool_input.include_pattern // .tool_input.include // "")
     else (.tool_input.pattern // .tool_input.glob_pattern // .tool_input.glob // "") end) ]
  | map(if type == "string" then . else tostring end) | join("\u001f")' 2>/dev/null) || OUT=""
SEP=$'\x1f'
TOOL="${OUT%%"$SEP"*}"; OUT="${OUT#*"$SEP"}"
FILE="${OUT%%"$SEP"*}"; OUT="${OUT#*"$SEP"}"
TARGET="${OUT%%"$SEP"*}"; PATTERN="${OUT#*"$SEP"}"
[[ -n "$TOOL$FILE$TARGET$PATTERN" ]] || done_ok

check "$TOOL" "$FILE" "$TARGET" "$PATTERN" && deny "$HIT"
done_ok
