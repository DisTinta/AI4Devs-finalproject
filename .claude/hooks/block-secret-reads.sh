#!/usr/bin/env bash
# PreToolUse (Read|Grep|Glob) — prevents the agent from reading secret files into the context, also
# through the search tools (Grep: path and glob; Glob: path and pattern). Cursor runs it on
# beforeReadFile and on preToolUse for Grep, with the same decisions (design D11).
# Complements block-secrets.sh (which only looks at the user's prompt).
#
# Cost: one node process (paths.mjs, lib.sh path_facts) reads the input and classifies the path, the
# search root and the glob, in time linear in their length; bash only maps its answer to a decision.
# When paths.mjs gives no answer, an unattended run denies, and with the switch "0" one jq call reads
# the fields and the bash checks of lib.sh decide, as before paths.mjs.
set -uo pipefail
# The hook's directory without a dirname process; invoke.cjs may pass a Windows path (backslashes).
HOOK_PATH="${BASH_SOURCE[0]//\\//}"
HOOK_DIR="${HOOK_PATH%/*}"
[[ "$HOOK_DIR" != "$HOOK_PATH" ]] || HOOK_DIR=.
source "$HOOK_DIR/lib.sh"

# paths.mjs reads the input from stdin (lib.sh path_facts).
hook_input_init ""
# An autonomous run fails closed from here on; a Cursor background agent once the input is read.
autonomous_run && fail_closed
path_facts read
fail_closed

REASON="looks like a secrets or credentials file. Do not load .env, private keys or credentials.json into the model's context. Use shell environment variables or a secret manager. If you need the SHAPE of the config, ask the human for a redacted example."

# Fallback check TOOL FILE TARGET PATTERN (bash, lib.sh): sets PF_HIT and PF_SHOWN like paths.mjs.
check() {
  case "$1" in
    Read|read|"")
      if [[ -n "$2" ]] && is_secret_path "$2"; then PF_HIT=file; PF_SHOWN="$2"; return 0; fi ;;
    Grep|Glob)
      if [[ -n "$3" ]] && { is_secret_path "$3" || is_secret_dir "$3"; }; then PF_HIT=target; PF_SHOWN="$3"; return 0; fi
      if [[ -n "$4" ]] && glob_reaches_secret "$4"; then PF_HIT=pattern; PF_SHOWN="$4"; return 0; fi ;;
  esac
  return 1
}

# The fields as jq reads them (Claude Code and Cursor keys alike; field() in lib.sh maps the same ones).
read_facts_fallback() {
  local FIELDS OUT SEP V TOOL="" FILE="" TARGET="" PATTERN="" INPUT="$HOOK_INPUT"
  has_jq || return 0
  FIELDS='[ (.tool_name // (if .hook_event_name == "beforeReadFile" then "Read" else "" end)),
    (.tool_input.file_path // .tool_input.path // .tool_input.target_file // .file_path // ""),
    (.tool_input.path // .tool_input.target_directory // ""),
    (if .tool_name == "Grep" then (.tool_input.glob // .tool_input.include_pattern // .tool_input.include // "")
     else (.tool_input.pattern // .tool_input.glob_pattern // .tool_input.glob // "") end) ]
  | map(if type == "string" then . else tostring end)'
  SEP=$'\x1f'
  if (( ${#INPUT} <= 16384 )); then
    OUT=$(printf '%s' "$INPUT" | jq -j "$FIELDS"' | join("\u001f")' 2>/dev/null) || OUT=""
    if [[ -n "$OUT" ]]; then
      TOOL="${OUT%%"$SEP"*}"; OUT="${OUT#*"$SEP"}"
      FILE="${OUT%%"$SEP"*}"; OUT="${OUT#*"$SEP"}"
      TARGET="${OUT%%"$SEP"*}"; PATTERN="${OUT#*"$SEP"}"
    fi
  else
    # A long input: one jq call prints the tool, a separator and the one path the check reads.
    OUT=$(printf '%s' "$INPUT" | jq -j "$FIELDS"' | if (.[0] == "Read" or .[0] == "read" or .[0] == "") then .[0] + "\u001f" + .[1]
      elif (.[0] == "Grep" or .[0] == "Glob") then .[0] + "\u001f" + .[2] else .[0] end' 2>/dev/null) || OUT=""
    TOOL="${OUT%%"$SEP"*}"
    V=""; [[ "$OUT" == "$TOOL" ]] || V="${OUT:$(( ${#TOOL} + 1 ))}"
    case "$TOOL" in
      Read|read|"") FILE="$V" ;;
      Grep|Glob)
        TARGET="$V"
        PATTERN=$(printf '%s' "$INPUT" | jq -j "$FIELDS | .[3]" 2>/dev/null) || PATTERN="" ;;
    esac
  fi
  PF_TOOL="$TOOL"
  check "$TOOL" "$FILE" "$TARGET" "$PATTERN"
  return 0
}

if [[ "$PATHS_READ" != true ]]; then
  unattended && deny "Unattended run: ${PATHS_UNCHECKED}."
  read_facts_fallback
fi

case "$PF_HIT" in
  file) deny "Read blocked: ${PF_SHOWN} ${REASON}" ;;
  target) deny "${PF_TOOL} blocked: ${PF_SHOWN} ${REASON}" ;;
  pattern) deny "${PF_TOOL} blocked: the pattern ${PF_SHOWN} reaches files that look like secrets or credentials (.env, secrets/, credentials…). Narrow it to the files you need; example env files (.env.example, .env.sample) stay readable." ;;
esac
done_ok
