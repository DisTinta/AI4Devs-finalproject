#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# lib.sh — common utilities for the SDD Harness Kit hooks.
#
# Every hook `source`s this file. Here lives:
#   · the SAFE loading of .claude/sdd-harness.env (only KEY=value, no shell eval)
#   · run_cmd: runs CMD_* without `eval` (array + bash -c with argv)
#   · the decision emitters in the JSON format Claude Code expects
#   · the safe degradations when jq is missing or configuration is missing
#
# Principle: a hook must never break the session. When in doubt, exit with 0.
# ─────────────────────────────────────────────────────────────────────────────

# Project root. On Windows, Claude Code may pass CLAUDE_PROJECT_DIR with
# backslashes that bash interprets as escapes (C:\laragon → C:laragon). If the
# path looks broken, we fall back to git toplevel or PWD.
_project_root() {
  local d="${1:-}"
  d="${d//\\//}"
  if [[ -n "$d" && -d "$d/.claude/hooks" ]]; then
    printf '%s' "$d"
    return
  fi
  if [[ "$d" =~ ^[A-Za-z]:[^/] ]]; then
    d=""
  fi
  if [[ -z "$d" ]]; then
    d="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
  fi
  d="${d//\\//}"
  printf '%s' "$d"
}
PROJECT_DIR="$(_project_root "${CLAUDE_PROJECT_DIR:-}")"
export CLAUDE_PROJECT_DIR="$PROJECT_DIR"
ENV_FILE="$PROJECT_DIR/.claude/sdd-harness.env"

# Default values: the kit works even if the project configures nothing.
STACK="not configured"
CMD_TEST=""; CMD_TEST_FILTER=""; CMD_LINT=""; CMD_FORMAT_FILE=""
CMD_STATIC_FILE=""; CMD_STATIC=""; CMD_MUTATION=""; CMD_DOCS_COVERAGE=""
CMD_DEV=""; CMD_MIGRATE=""
SOURCE_EXTENSIONS=""; PATH_SOURCE=""; PATH_TESTS=""; PATH_BUSINESS=""
PATH_HTTP=""; PATH_MIGRATIONS=""; PATH_ADR="docs/adr"
GUARD_HTTP_IN_BUSINESS=""; GUARD_DB_IN_HTTP=""; GUARD_DANGEROUS_CMD=""
LAYER_ORDER=""; MIN_MUTATION_SCORE="70"
BRANCH_PREFIX="feature/"
# Escape hatches (documented in docs/es/CONFIG.md / docs/es/GUIA-PASO-A-PASO.md)
KIT_SKIP_STOP_TESTS="0"
KIT_ALLOW_WIP="0"

# Loads KEY="value" or KEY=value without executing the file as shell.
# Rejects lines with command substitution, backticks or $(...).
load_env_safe() {
  local file="$1" line key val
  [[ -f "$file" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ -z "${line//[[:space:]]/}" ]] && continue
    if [[ "$line" =~ \$\(|\`|\$\{ ]]; then
      printf 'sdd-harness: dangerous line ignored in sdd-harness.env (possible command substitution)\n' >&2
      continue
    fi
    if [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=[[:space:]]*\"(.*)\"[[:space:]]*$ ]]; then
      key="${BASH_REMATCH[1]}"; val="${BASH_REMATCH[2]}"
    elif [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=[[:space:]]*\'(.*)\'[[:space:]]*$ ]]; then
      key="${BASH_REMATCH[1]}"; val="${BASH_REMATCH[2]}"
    elif [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=[[:space:]]*([^#[:space:]].*)$ ]]; then
      key="${BASH_REMATCH[1]}"; val="${BASH_REMATCH[2]}"
      val="${val%"${val##*[![:space:]]}"}"
    else
      continue
    fi
    case "$key" in
      STACK|CMD_TEST|CMD_TEST_FILTER|CMD_LINT|CMD_FORMAT_FILE|CMD_STATIC_FILE|CMD_STATIC|\
      CMD_MUTATION|CMD_DOCS_COVERAGE|CMD_DEV|CMD_MIGRATE|SOURCE_EXTENSIONS|PATH_SOURCE|\
      PATH_TESTS|PATH_BUSINESS|PATH_HTTP|PATH_MIGRATIONS|PATH_ADR|GUARD_HTTP_IN_BUSINESS|\
      GUARD_DB_IN_HTTP|GUARD_DANGEROUS_CMD|LAYER_ORDER|MIN_MUTATION_SCORE|BRANCH_PREFIX|\
      KIT_SKIP_STOP_TESTS|KIT_ALLOW_WIP)
        printf -v "$key" '%s' "$val"
        ;;
    esac
  done < "$file"
}

load_env_safe "$ENV_FILE"

# jq is the only external dependency. Without it, the hooks disable themselves
# instead of failing on every turn.
has_jq() { command -v jq >/dev/null 2>&1; }

# Reads the JSON from stdin and returns a field. Usage: field "$INPUT" '.tool_name'
field() {
  has_jq || { printf ''; return 0; }
  printf '%s' "$1" | jq -r "$2 // empty" 2>/dev/null || printf ''
}

# Runs a command configured in sdd-harness.env WITHOUT eval.
# Usage: run_cmd "$CMD_TEST"
#        run_cmd "$CMD_FORMAT_FILE" "$FILE"
# The CMD_* value is interpreted as a simple shell line (spaces = argv).
# Extra arguments are passed as "$1", "$2"... to the process via positional args.
run_cmd() {
  local cmdline="$1"; shift || true
  [[ -n "$cmdline" ]] || return 0
  # shellcheck disable=SC2086
  ( cd "$PROJECT_DIR" && bash -c -- "$cmdline \"\$@\"" _ "$@" )
}

# ── Decision emitters ────────────────────────────────────────────────────────
deny() {
  has_jq || { printf '%s\n' "$1" >&2; exit 2; }
  jq -nc --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
}

ask() {
  has_jq || exit 0
  jq -nc --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"ask",permissionDecisionReason:$r}}'
  exit 0
}

block() {
  has_jq || { printf '%s\n' "$1" >&2; exit 2; }
  jq -nc --arg r "$1" '{decision:"block",reason:$r}'
  exit 0
}

block_prompt() {
  has_jq || { printf '%s\n' "$1" >&2; exit 2; }
  jq -nc --arg r "$1" '{decision:"block",reason:$r,hookSpecificOutput:{hookEventName:"UserPromptSubmit",suppressOriginalPrompt:true}}'
  exit 0
}

# Stop does not accept additionalContext (Claude Code validates the JSON and fails the hook).
# systemMessage is shown to the user without blocking the turn from closing.
notify() {
  has_jq || { printf '%s\n' "$1" >&2; exit 0; }
  jq -nc --arg m "$1" '{systemMessage:$m}'
  exit 0
}

inject() {
  has_jq || exit 0
  # Stop: see notify(). SessionStart / PostToolUse do use additionalContext.
  if [[ "$1" == "Stop" ]]; then
    jq -nc --arg m "$2" '{systemMessage:$m}'
  else
    jq -nc --arg e "$1" --arg c "$2" '{hookSpecificOutput:{hookEventName:$e,additionalContext:$c}}'
  fi
  exit 0
}

# ── Utilities ────────────────────────────────────────────────────────────────
under() {
  local file="$1" dir="$2"
  [[ -n "$dir" ]] || return 1
  # Normalize slashes for Windows (Git Bash).
  file="${file//\\//}"
  dir="${dir//\\//}"
  case "$file" in
    "$dir"|"$dir"/*|*/"$dir"|*/"$dir"/*) return 0 ;;
    *) return 1 ;;
  esac
}

SPANISH_WORDS='\b(que|para|con|los|las|una|del|por|como|pero|cuando|donde|desde|hasta|sobre|entre|porque|si no|además|también|según|función|usuario|usuarios|fecha|nombre|error de|no encontrado|obligatorio|debe|deben|siguiente|siguientes)\b'

is_source() {
  local file="$1" ext
  [[ -n "$SOURCE_EXTENSIONS" ]] || return 1
  for ext in $SOURCE_EXTENSIONS; do
    [[ "$file" == *."$ext" ]] && return 0
  done
  return 1
}

# Does the path look like a secrets / environment file?
is_secret_path() {
  local file="${1//\\//}"
  # The kit contract is NOT a secret: the doctrine, the SessionStart banner and
  # several subagents require reading it. It is excepted BEFORE the *.env pattern so
  # that a Read on it is not denied. It only holds STACK/CMD_*/PATH_*/BRANCH_PREFIX.
  case "$file" in
    */.claude/sdd-harness.env|.claude/sdd-harness.env|sdd-harness.env) return 1 ;;
  esac
  case "$file" in
    *.env|*.env.*|*/.env|.env|*/.env.*|\
    */secrets/*|*/.secrets/*|*/credentials.json|*/credentials.*|\
    */id_rsa|*/id_ed25519|*/.npmrc|*/.pypirc|\
    */google-services.json|*/service-account*.json)
      return 0 ;;
  esac
  return 1
}
