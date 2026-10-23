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
# path looks broken, we fall back to git toplevel or PWD. Sets PROJECT_DIR without a subshell (every
# hook pays for a fork on Windows).
_project_root() {
  local d="${1:-}"
  d="${d//\\//}"
  if [[ -n "$d" && -d "$d/.claude/hooks" ]]; then
    PROJECT_DIR="$d"
    return
  fi
  if [[ "$d" =~ ^[A-Za-z]:[^/] ]]; then
    d=""
  fi
  if [[ -z "$d" ]]; then
    d="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
  fi
  PROJECT_DIR="${d//\\//}"
}
PROJECT_DIR=""
_project_root "${CLAUDE_PROJECT_DIR:-}"
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
KIT_PROTECT_SPECS="1"
KIT_SPEC_AUDIT_GATE="1"
# Autonomous run (openspec change autonomous-run-switch, design D1). "1" = unattended and autonomous:
# no hook asks, the agent may merge through the merge gate, the doctrine relaxations of the ADR apply.
KIT_AUTONOMOUS_RUN="0"
AUTONOMOUS_MERGE_BASE=""
KIT_SECRET_ALLOWLIST=""

# Loads KEY="value" or KEY=value without executing the file as shell.
# Rejects lines with command substitution, backticks or $(...).
# The file is read in one $(<file) and split in bash: the read builtin takes one system call per
# byte on Windows, about 70 ms on every hook for this file.
load_env_safe() {
  local file="$1" line key val text
  [[ -f "$file" ]] || return 0
  { text=$(<"$file"); } 2>/dev/null || return 0
  text+=$'\n'
  while [[ -n "$text" ]]; do
    line="${text%%$'\n'*}"; text="${text#*$'\n'}"
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
      KIT_SKIP_STOP_TESTS|KIT_ALLOW_WIP|KIT_PROTECT_SPECS|KIT_SPEC_AUDIT_GATE|\
      KIT_AUTONOMOUS_RUN|AUTONOMOUS_MERGE_BASE|KIT_SECRET_ALLOWLIST)
        printf -v "$key" '%s' "$val"
        ;;
    esac
  done
}

load_env_safe "$ENV_FILE"

# jq is the only external dependency. Without it, the hooks disable themselves
# instead of failing on every turn.
has_jq() { command -v jq >/dev/null 2>&1; }

# Client of the hook: "claude" (default) or "cursor" (invoke.cjs --client cursor, design D11).
KIT_HOOK_CLIENT="${KIT_HOOK_CLIENT:-claude}"
cursor_client() { [[ "$KIT_HOOK_CLIENT" == "cursor" ]]; }
LAST_INPUT=""

# Reads the JSON from stdin and returns a field. Usage: field "$INPUT" '.tool_name'
# Under Cursor the Claude Code field names are mapped to Cursor's (design D11), so the hooks keep
# one code path.
field() {
  has_jq || { printf ''; return 0; }
  local q="$2"
  [[ -n "$1" ]] && LAST_INPUT="$1"
  if cursor_client; then
    case "$q" in
      .tool_input.command) q='(.tool_input.command // .command)' ;;
      .tool_input.file_path) q='(.tool_input.file_path // .tool_input.path // .tool_input.target_file // .file_path)' ;;
      .tool_input.path) q='(.tool_input.path // .tool_input.target_file // .file_path)' ;;
      .tool_name) q='(.tool_name // (if .hook_event_name == "beforeReadFile" then "Read" else empty end))' ;;
      .source) q='(.source // (if .hook_event_name == "sessionStart" then "startup" else empty end))' ;;
      .stop_hook_active) q='(if (.loop_count // 0) > 0 then "true" else empty end)' ;;
    esac
  fi
  printf '%s' "$1" | jq -r "$q // empty" 2>/dev/null || printf ''
}

# Cursor event of the current hook (empty under Claude Code).
cursor_event() {
  cursor_client || return 0
  if [[ "${PATHS_READ:-}" == true ]]; then printf '%s' "$PF_EVENT"; return 0; fi
  printf '%s' "${HOOK_INPUT:-$LAST_INPUT}" | jq -r '.hook_event_name // empty' 2>/dev/null
}

cursor_permission() { # cursor_permission <allow|deny|ask> "<reason>"
  jq -nc --arg p "$1" --arg r "$2" 'if $r == "" then {permission:$p} else {permission:$p,user_message:$r,agent_message:$r} end'
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

# ── Modes (design D1, D2) ─────────────────────────────────────────────────────
# Unattended mode: the switch is "1", or Cursor reports a background agent. No hook asks.
# Autonomous run: the switch is "1" only. Merge, relaxations and kit-configuration protections.
HOOK_INPUT=""

# Every decision hook calls it right after reading stdin. In an unattended run a missing jq denies
# (exit 2) instead of letting every protection fall silent.
hook_input_init() {
  HOOK_INPUT="$1"; _UNATTENDED=""
  if [[ "$KIT_AUTONOMOUS_RUN" == "1" ]] && ! has_jq; then
    printf 'jq is required in an unattended run (KIT_AUTONOMOUS_RUN="1"); install it or set the switch to "0".\n' >&2
    exit 2
  fi
}

# Hooks that take no tool decision (prompt, session start, post-edit, stop) only keep the input, so
# the emitters can tell the Cursor event (design D11).
remember_input() { HOOK_INPUT="$1"; _UNATTENDED=""; }

autonomous_run() { [[ "$KIT_AUTONOMOUS_RUN" == "1" ]]; }

# The background-agent answer is computed once per input. jq only runs when the input names
# is_background_agent or holds a \u escape (which could spell the key): otherwise jq could not find it.
_UNATTENDED=""
unattended() {
  autonomous_run && return 0
  # Already answered (path_facts sets it from paths.mjs, which read the input).
  [[ -n "$_UNATTENDED" ]] && { [[ "$_UNATTENDED" == 1 ]]; return; }
  [[ -n "$HOOK_INPUT" ]] || return 1
  if [[ -z "$_UNATTENDED" ]]; then
    _UNATTENDED=0
    if [[ "$HOOK_INPUT" == *is_background_agent* || "$HOOK_INPUT" == *'\u'* ]]; then
      [[ "$(field "$HOOK_INPUT" '.is_background_agent')" == "true" ]] && _UNATTENDED=1
    fi
  fi
  [[ "$_UNATTENDED" == 1 ]]
}

# ── Path and secret facts (design D8, D9) ────────────────────────────────────
# The file-tool hooks (block-secret-reads, protect-specs-and-tests, spec-audit-gate) read every path
# fact they decide on from one node process per call, paths.mjs: bash's own string operations grow
# quadratically with the length of a path (long backslash runs, many segments, non-ASCII names: 60 000
# 'é' took over 20 s), and a hook past its timeout lets the call through undecided. paths.mjs prints
# shell assignments ending with PF_SENTINEL set to a per-call nonce; the facts count only when
# evaluating the output sets it. PATHS_READ says whether they were read: when not, the hooks deny in
# an unattended run and, with the switch "0", fall back to jq and the bash checks below.
# The hook reads its stdin once, into HOOK_INPUT, before paths.mjs runs: whatever paths.mjs does with
# the input, the fallback still has it. Up to 2048 characters come through the read builtin (one
# system call per byte on Windows, but no process); a longer input (an Edit or a Write with its
# text) adds one cat for the rest. paths.mjs gets the input as a here-string.
# paths.mjs is bounded from outside its process (review rounds 6, 7): it runs in a process
# substitution and the hook waits at most PATHS_TIMEOUT seconds in all (read -t) for its whole
# answer, then kills it; it is killed on every other path too, so it never outlives the hook. A node
# that hangs before arming its own 4.5 s watchdog, that is stuck in a blocking file-system call or
# that stalls mid-answer costs no more than that, and costs no `timeout` process on a short answer.
# The first line is the byte length of the facts: up to 8 KiB they are read by the read builtin,
# beyond that by one head -c under timeout.
# MSYS argument conversion is off: the values reach node as written.
_LIB_DIR="${BASH_SOURCE[0]//\\//}"
if [[ "$_LIB_DIR" == */* ]]; then _LIB_DIR="${_LIB_DIR%/*}"; else _LIB_DIR=.; fi
PATHS_READ=false
PATHS_TIMEOUT=5
pf_defaults() {
  PF_BACKGROUND='' PF_EVENT='' PF_TOOL='' PF_HIT='' PF_SHOWN='' PF_FILE='' PF_DOTDOT=0 PF_ENV=''
  PF_TOO_LONG=0 PF_OPENSPEC=0 PF_DOCTRINE=0 PF_UNDER_TESTS=0 PF_UNDER_SOURCE=0 PF_UNDER_MIG=0
  PF_REL='' PF_NORM='' PF_UNSURE=0 PF_ALIAS_CONFIG=0 PF_BAD_INPUT=0 PF_SENTINEL=''
}
pf_defaults

# path_facts read|edit: reads the hook input (stdin) into HOOK_INPUT and its facts through paths.mjs;
# call it after hook_input_init "". With the facts read, the unattended answer and the Cursor event
# come from them too (no jq call). Without them (paths.mjs failed, timed out or printed something
# unreadable), HOOK_INPUT still holds the whole input for the fallback.
path_facts() {
  local nonce="pf${RANDOM}${RANDOM}${RANDOM}$$" out="" len="" fd pid t0 rem
  pf_defaults
  PATHS_READ=false
  HOOK_INPUT=""
  IFS= read -r -N 2048 -d '' HOOK_INPUT || true
  (( ${#HOOK_INPUT} < 2048 )) || HOOK_INPUT+=$(cat)
  t0=${EPOCHREALTIME//[!0-9]/}
  # exec: the process substitution's pid is node's own, so the kill below reaches it.
  exec {fd}< <(MSYS2_ARG_CONV_EXCL='*' MSYS_NO_PATHCONV=1 exec node "$_LIB_DIR/paths.mjs" --mode "$1" --nonce "$nonce" \
    --project "$PROJECT_DIR" --autonomous "$KIT_AUTONOMOUS_RUN" --tests "$PATH_TESTS" \
    --source "$PATH_SOURCE" --migrations "$PATH_MIGRATIONS" 2>/dev/null <<<"$HOOK_INPUT")
  pid=$!
  # The whole answer shares one PATHS_TIMEOUT budget (review round 7): the first line, then exactly
  # the announced number of bytes in what remains of it (read -N in the C locale counts bytes; a
  # long answer through one head -c under timeout). A process that stalls mid-answer, or keeps its
  # output open after it, costs no more than the budget.
  if IFS= read -r -t "$PATHS_TIMEOUT" -u "$fd" len && [[ "$len" =~ ^[0-9]+$ ]]; then
    rem=$(( PATHS_TIMEOUT * 1000000 - (${EPOCHREALTIME//[!0-9]/} - t0) ))
    if (( rem > 0 )); then
      printf -v rem '%d.%06d' $(( rem / 1000000 )) $(( rem % 1000000 ))
      if (( len <= 8192 )); then
        LC_ALL=C IFS= read -r -N "$len" -t "$rem" -u "$fd" out || out=""
      else
        out=$(timeout "$rem" head -c "$len" <&"$fd" 2>/dev/null) || out=""
      fi
    fi
  fi
  # Killed on every path (answer read, timed out or unreadable): it never outlives the hook.
  kill "$pid" 2>/dev/null
  exec {fd}<&-
  if [[ -n "$out" ]] && eval "$out" 2>/dev/null && [[ "$PF_SENTINEL" == "$nonce" ]]; then
    PATHS_READ=true
    _UNATTENDED=0
    [[ "$PF_BACKGROUND" == true ]] && _UNATTENDED=1
    return 0
  fi
  _UNATTENDED=""
  pf_defaults
  return 0
}

# The reason of an unattended denial when paths.mjs gave no facts.
PATHS_UNCHECKED="the path check (paths.mjs) failed, timed out or gave an unreadable answer, so the call is denied"
# The reason of an unattended denial when the hook input is not a JSON object (review round 7).
PATHS_BAD_INPUT="the hook input could not be parsed (empty, truncated or not a JSON object), so the call is denied"

# The edit facts without paths.mjs: jq reads the file and the bash checks below classify it, as the
# edit hooks did before paths.mjs. Only used with the switch "0" outside a background agent (an
# unattended run has already denied), so the canonical path is not needed.
edit_facts_fallback() {
  local lc
  pf_defaults
  PF_FILE=$(field "$HOOK_INPUT" '.tool_input.file_path')
  [[ -n "$PF_FILE" ]] || return 0
  slashes_v "$PF_FILE"; PF_FILE="$SLASHED"
  # A drive-relative path (C:tests/x) stays as written, as paths.mjs leaves it with the switch "0".
  [[ "$PF_FILE" == *..* ]] && PF_DOTDOT=1
  lc="${PF_FILE,,}"
  if [[ "$lc" == *:* ]]; then
    no_streams_v "$lc"
    [[ "$NO_STREAMS" != "$lc" ]] && _env_edit_fact "$NO_STREAMS"
  fi
  [[ -n "$PF_ENV" ]] || _env_edit_fact "$lc"
  case "$PF_FILE" in
    */openspec/*|openspec/*)
      case "$PF_FILE" in */tasks.md|*/reports/*|*/openspec/templates/*) ;; *) PF_OPENSPEC=1 ;; esac ;;
  esac
  case "$PF_FILE" in
    */docs/base-standards.md|docs/base-standards.md|\
    */docs/documentation-standards.md|docs/documentation-standards.md|\
    */docs/openspec-tasks-mandatory-steps.md|docs/openspec-tasks-mandatory-steps.md) PF_DOCTRINE=1 ;;
  esac
  under "$PF_FILE" "$PATH_TESTS" && PF_UNDER_TESTS=1
  under "$PF_FILE" "$PATH_SOURCE" && PF_UNDER_SOURCE=1
  under "$PF_FILE" "$PATH_MIGRATIONS" && PF_UNDER_MIG=1
  return 0
}

# Environment-file verdict of one lower-case path form, in PF_ENV: contract (the kit contract is
# asked about), deny, or nothing. Example files pass, except inside a secret location (design D8).
_env_edit_fact() {
  local lc="$1" example=0
  case "$lc" in *.env.example|*.env.sample) example=1 ;; esac
  case "$lc" in */secrets/*|*/.secrets/*|secrets/*|.secrets/*) example=0 ;; esac
  [[ "$example" == "0" ]] || return 0
  case "$lc" in
    */.claude/sdd-harness.env|.claude/sdd-harness.env) PF_ENV=contract; return 0 ;;
    *.env.example|*.env.sample) PF_ENV=deny; return 0 ;;
  esac
  is_env_file "${lc##*/}" && PF_ENV=deny
  return 0
}

# Fail-closed in an unattended run (design D21): a crash or an unexpected exit before a decision
# denies (exit 2) instead of letting the call through. Every emitter and done_ok mark the decision.
HOOK_DECIDED=0
fail_closed() {
  unattended || return 0
  trap '[[ "$HOOK_DECIDED" == 1 ]] || { printf "sdd-harness: the hook failed before deciding (unattended run): denied.\n" >&2; exit 2; }' EXIT
}
done_ok() { HOOK_DECIDED=1; exit 0; }

# Parses a command line with shell-words.mjs (design D6). Prints its JSON, or {"ok":false} when the
# parser fails, times out or prints something unreadable.
parse_command() {
  local out
  out=$(printf '%s' "$1" | timeout 5 node "$(dirname "${BASH_SOURCE[0]}")/shell-words.mjs" \
    --cwd "${2:-$PROJECT_DIR}" --project "$PROJECT_DIR" --scratchpad "${3:-}" \
    --base "$AUTONOMOUS_MERGE_BASE" 2>/dev/null) || out=''
  if [[ -z "$out" ]] || ! printf '%s' "$out" | jq -e 'type == "object" and has("ok")' >/dev/null 2>&1; then
    out='{"ok":false,"error":"parser failure"}'
  fi
  printf '%s' "$out"
}

# ── Decision emitters ────────────────────────────────────────────────────────
# Each emitter writes Claude Code's JSON, or Cursor's when invoke.cjs ran with --client cursor
# (design D11).
# A reason over 4 KiB (a reason that quotes a very long path) keeps its first and last 1500
# characters, in SHORT_REASON: jq gets it as an argument, and Windows caps a command line at 32 767
# characters, so the full text would make jq fail and the decision vanish (review round 4).
SHORT_REASON=""
short_reason_v() {
  SHORT_REASON="$1"
  (( ${#1} <= 4096 )) || SHORT_REASON="${1:0:1500} […] ${1: -1500}"
}

deny() {
  HOOK_DECIDED=1
  has_jq || { printf '%s\n' "$1" >&2; exit 2; }
  local ok=0
  short_reason_v "$1"
  if cursor_client; then
    cursor_permission deny "$SHORT_REASON" || ok=1
  else
    jq -nc --arg r "$SHORT_REASON" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}' || ok=1
  fi
  # In an unattended run a broken jq must not turn a deny into a silent pass (design D21).
  if [[ "$ok" != "0" ]] && unattended; then printf '%s\n' "$SHORT_REASON" >&2; exit 2; fi
  exit 0
}

allow() {
  HOOK_DECIDED=1
  has_jq || exit 0
  if cursor_client; then
    cursor_permission allow "${1:-}"
  else
    jq -nc --arg r "${1:-}" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"allow",permissionDecisionReason:$r}}'
  fi
  exit 0
}

# ask "<reason>" ["<alternative>"]. In an unattended run nobody can answer, so it denies (design D2).
# Cursor's tool-use and file-read events do not enforce "ask": outside an unattended run they get
# "allow" with the confirmation text, so the agent states it to the person (spec exception).
ask() {
  if unattended; then
    local msg="$1"$'\n\n'"Unattended run (KIT_AUTONOMOUS_RUN or a background agent): no human can confirm."
    [[ -n "${2:-}" ]] && msg+=" ${2}"
    deny "$msg"
  fi
  HOOK_DECIDED=1
  has_jq || exit 0
  short_reason_v "$1"
  if cursor_client; then
    case "$(cursor_event)" in
      preToolUse|beforeReadFile) cursor_permission allow "Needs the person's confirmation: $SHORT_REASON" ;;
      *) cursor_permission ask "$SHORT_REASON" ;;
    esac
  else
    jq -nc --arg r "$SHORT_REASON" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"ask",permissionDecisionReason:$r}}'
  fi
  exit 0
}

block() {
  HOOK_DECIDED=1
  has_jq || { printf '%s\n' "$1" >&2; exit 2; }
  if cursor_client; then
    # Cursor: a stop that would block becomes a follow-up; afterFileEdit is observational.
    if [[ "$(cursor_event)" == "stop" ]]; then
      jq -nc --arg r "$1" '{followup_message:$r}'
    else
      printf '%s\n' "$1" >&2
    fi
    exit 0
  fi
  jq -nc --arg r "$1" '{decision:"block",reason:$r}'
  exit 0
}

block_prompt() {
  HOOK_DECIDED=1
  has_jq || { printf '%s\n' "$1" >&2; exit 2; }
  if cursor_client; then
    jq -nc --arg r "$1" '{continue:false,user_message:$r}'
    exit 0
  fi
  jq -nc --arg r "$1" '{decision:"block",reason:$r,hookSpecificOutput:{hookEventName:"UserPromptSubmit",suppressOriginalPrompt:true}}'
  exit 0
}

# Stop does not accept additionalContext (Claude Code validates the JSON and fails the hook).
# systemMessage is shown to the user without blocking the turn from closing.
# Cursor: a green stop gives no output (a follow-up would start a new turn every time).
notify() {
  HOOK_DECIDED=1
  cursor_client && exit 0
  has_jq || { printf '%s\n' "$1" >&2; exit 0; }
  jq -nc --arg m "$1" '{systemMessage:$m}'
  exit 0
}

inject() {
  HOOK_DECIDED=1
  has_jq || exit 0
  if cursor_client; then
    if [[ "$1" == "SessionStart" ]]; then
      jq -nc --arg c "$2" '{additional_context:$c}'
    else
      printf '%s\n' "$2" >&2
    fi
    exit 0
  fi
  # Stop: see notify(). SessionStart / PostToolUse do use additionalContext.
  if [[ "$1" == "Stop" ]]; then
    jq -nc --arg m "$2" '{systemMessage:$m}'
  else
    jq -nc --arg e "$1" --arg c "$2" '{hookSpecificOutput:{hookEventName:$e,additionalContext:$c}}'
  fi
  exit 0
}

# ── Secrets (design D10) ─────────────────────────────────────────────────────
# Shared by block-secrets.sh (prompt scan) and log-permission-denied.sh (redaction).
SECRET_PATTERNS='(sk-ant-[A-Za-z0-9_-]{20,}'
SECRET_PATTERNS+='|sk-[a-zA-Z0-9]{40,}'
SECRET_PATTERNS+='|ghp_[a-zA-Z0-9]{36}'
SECRET_PATTERNS+='|github_pat_[A-Za-z0-9_]{50,}'
SECRET_PATTERNS+='|gho_[a-zA-Z0-9]{36}'
SECRET_PATTERNS+='|xox[baprs]-[A-Za-z0-9-]{10,}'
SECRET_PATTERNS+='|AKIA[0-9A-Z]{16}'
SECRET_PATTERNS+='|AIza[0-9A-Za-z_-]{35}'
SECRET_PATTERNS+='|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}'
SECRET_PATTERNS+='|-----BEGIN [A-Z ]*PRIVATE KEY-----'
SECRET_PATTERNS+='|(APP_KEY|SECRET_KEY|DB_PASSWORD|API_SECRET)[[:space:]]*=[[:space:]]*[^[:space:]]{8,})'

# Removes the text matching KIT_SECRET_ALLOWLIST. The allowlist is ignored (the text comes back
# unchanged) when awk rejects it, or when it matches the canonical sample ghp_ + 36 'a', since it
# would switch the scan off. The regex reaches awk through ENVIRON, not -v, so awk does not process
# its backslash escapes: the ERE runs as written (\. stays a literal dot).
strip_allowlisted() {
  local text="$1" sample out
  [[ -n "$KIT_SECRET_ALLOWLIST" ]] || { printf '%s' "$text"; return 0; }
  sample="ghp_$(printf 'a%.0s' {1..36})"
  if ! printf 'x' | KIT_ALLOW_RE="$KIT_SECRET_ALLOWLIST" awk '{ gsub(ENVIRON["KIT_ALLOW_RE"], "") }' >/dev/null 2>&1; then
    printf '%s' "$text"; return 0
  fi
  if printf '%s' "$sample" | KIT_ALLOW_RE="$KIT_SECRET_ALLOWLIST" awk '{ exit (match($0, ENVIRON["KIT_ALLOW_RE"]) ? 0 : 1) }' 2>/dev/null; then
    printf '%s' "$text"; return 0
  fi
  out=$(printf '%s' "$text" | KIT_ALLOW_RE="$KIT_SECRET_ALLOWLIST" awk '{ gsub(ENVIRON["KIT_ALLOW_RE"], ""); print }' 2>/dev/null) || out="$text"
  printf '%s' "$out"
}

# ── Change, paths and verdicts (design D5, D9) ───────────────────────────────

# The branch's active OpenSpec change: the active change whose name closes the branch name
# (feature/DIS-38-claims-and-typing → claims-and-typing); the longest one wins. With no match and
# exactly one active change, that one. Prints nothing when it cannot be told (no openspec/changes,
# no active change, or several and none matches).
active_change() {
  local changes_dir="$PROJECT_DIR/openspec/changes" dir name branch change="" active=()
  [[ -d "$changes_dir" ]] || return 0
  for dir in "$changes_dir"/*/; do
    [[ -d "$dir" ]] || continue
    name="${dir%/}"; name="${name##*/}"
    [[ "$name" == "archive" ]] && continue
    active+=("$name")
  done
  [[ ${#active[@]} -gt 0 ]] || return 0
  branch="$(git -C "$PROJECT_DIR" branch --show-current 2>/dev/null || true)"
  for name in "${active[@]}"; do
    case "$branch" in
      "$name"|*/"$name"|*-"$name")
        [[ ${#name} -gt ${#change} ]] && change="$name" ;;
    esac
  done
  if [[ -z "$change" && ${#active[@]} -eq 1 ]]; then
    change="${active[0]}"
  fi
  printf '%s' "$change"
}

current_branch() { git -C "$PROJECT_DIR" branch --show-current 2>/dev/null || true; }

# ── Path normalisation (design D9 «Paths»; adversarial review 2026-10-21) ────
# Windows (Git Bash, MSYS, Cygwin): paths compare case-insensitively.
_KIT_WIN=""
kit_windows() {
  if [[ -z "$_KIT_WIN" ]]; then
    _KIT_WIN=0
    case "${OSTYPE:-}" in
      msys*|cygwin*) _KIT_WIN=1 ;;
      *) case "$(uname -s 2>/dev/null)" in MINGW*|MSYS*|CYGWIN*) _KIT_WIN=1 ;; esac ;;
    esac
  fi
  [[ "$_KIT_WIN" == 1 ]]
}

# Forward-slash form of a path, in SLASHED. Bash's ${p//\\//} grows quadratically with the number of
# backslashes (60 KB of them took seconds), so a path over 4 KiB that holds one goes through tr
# instead, which also squeezes repeated separators after a leading pair (\\?\, \\host\ stay).
# The last long input and its answer are kept, so one hook forks tr once per path.
SLASHED=""; _SLASH_IN=""; _SLASH_OUT=""
slashes_v() {
  local lead=""
  if (( ${#1} <= 4096 )) || [[ "$1" != *'\'* ]]; then SLASHED="${1//\\//}"; return 0; fi
  if [[ "$1" == "$_SLASH_IN" ]]; then SLASHED="$_SLASH_OUT"; return 0; fi
  [[ "${1:0:2}" == [\\/][\\/] ]] && lead="//"
  SLASHED="$lead$(printf '%s' "${1:${#lead}}" | tr -s '\\/' '/')"
  _SLASH_IN="$1"; _SLASH_OUT="$SLASHED"
}


# The lexical and canonical forms of a path (\\?\, admin shares, cygdrive, '~', '.', '//', the real
# location of a link, the on-disk case on Windows) and the repository-relative path are computed by
# paths.mjs (lexicalPath, normPath, relPath) and reach the hooks as PF_REL and PF_NORM.

# Whether a path lies under a configured folder (any segment, like under()), case-insensitively on
# Windows. Used on canonical paths in unattended mode.
under_ci() {
  local file="${1//\\//}" dir="${2//\\//}" r=1 had=0
  dir="${dir#./}"; dir="${dir%/}"
  [[ -n "$dir" ]] || return 1
  shopt -q nocasematch && had=1
  kit_windows && shopt -s nocasematch
  case "$file" in "$dir"|"$dir"/*|*/"$dir"|*/"$dir"/*) r=0 ;; esac
  [[ "$had" == 1 ]] || shopt -u nocasematch
  return "$r"
}

# Kit configuration (design D5): .claude/ or .cursor/ relative to the working tree that holds the
# path, or anything inside CLAUDE_CONFIG_DIR. Shares shell-words.mjs's implementation.
# Fails closed: when node crashes, times out or prints anything but true/false, the path counts as
# kit configuration and KIT_CONFIG_UNCHECKED says why (it is only called in an autonomous run).
KIT_CONFIG_UNCHECKED=""
is_kit_config() {
  local out
  KIT_CONFIG_UNCHECKED=""
  out=$(timeout 5 node "$(dirname "${BASH_SOURCE[0]}")/shell-words.mjs" --kit-path "$1" --project "$PROJECT_DIR" 2>/dev/null) || out=''
  out="${out%$'\n'}"; out="${out%$'\r'}"
  case "$out" in
    true) return 0 ;;
    false) return 1 ;;
    *) KIT_CONFIG_UNCHECKED="the kit-configuration check (shell-words.mjs) failed, timed out or gave an unreadable answer"
       return 0 ;;
  esac
}

# Latest spec-audit verdict of a change: the last line, across reports/*spec-audit*.md in name order,
# that is APPROVED or CHANGES REQUIRED once a trailing \r and whitespace are removed; lines inside
# fenced code blocks are ignored. Prints nothing when there is no report.
latest_verdict() {
  local reports=("$PROJECT_DIR/openspec/changes/$1/reports/"*spec-audit*.md) f v last=""
  [[ -e "${reports[0]}" ]] || return 0
  for f in "${reports[@]}"; do
    v=$(awk '
      { sub(/\r$/, ""); sub(/[[:space:]]+$/, "") }
      /^[[:space:]]*(```|~~~)/ { fence = !fence; next }
      !fence && ($0 == "APPROVED" || $0 == "CHANGES REQUIRED") { verdict = $0 }
      END { print verdict }
    ' "$f" 2>/dev/null)
    [[ -n "$v" ]] && last="$v"
  done
  printf '%s' "${last:-NONE}"
}

# Whether a repository-relative path existed at the merge base of HEAD with
# origin/AUTONOMOUS_MERGE_BASE (or the local base when the remote-tracking branch is missing).
# Prints yes, no, or unknown (no merge base).
existed_at_merge_base() {
  local base mb=""
  if [[ -n "$AUTONOMOUS_MERGE_BASE" ]]; then
    for base in "origin/$AUTONOMOUS_MERGE_BASE" "$AUTONOMOUS_MERGE_BASE"; do
      mb=$(git -C "$PROJECT_DIR" merge-base HEAD "$base" 2>/dev/null) && break
      mb=""
    done
  fi
  if [[ -z "$mb" ]]; then printf 'unknown'; return 0; fi
  if git -C "$PROJECT_DIR" cat-file -e "$mb:$1" 2>/dev/null; then printf 'yes'; else printf 'no'; fi
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

# Source-code extensions: a name such as config.env.ts or app.env.d.ts is code, not an environment
# file (R3-6).
# sh and md are not among them: .env.sh and .env.md stay secrets (author decision, review round 4).
ENV_SOURCE_EXTENSIONS=' ts tsx js jsx mjs cjs mts cts py rb go java kt rs php cs '

# The secret and environment-file checks below are the bash copy of paths.mjs (isEnvFile,
# noStreams, isSecretPath, isSecretDir, globReachesSecret): the hooks use them only when paths.mjs
# gives no answer and the switch is "0". A change to one copy goes to the other.

# Is a lower-case basename an environment file? .env, .env.<suffix>, <name>.env or
# <name>.env.<suffix>, except a .example / .sample suffix or a source-code last extension.
is_env_file() {
  case "$1" in
    *.env.example|*.env.sample) return 1 ;;
    .env|*.env) return 0 ;;
    .env.*|*.env.*) [[ "$ENV_SOURCE_EXTENSIONS" != *" ${1##*.} "* ]] ;;
    *) return 1 ;;
  esac
}

# A slash-form, lower-case path without its Windows alternate data streams, in NO_STREAMS: in every
# segment, the text from a ':' on is dropped (.env::$data, .env:$data and .env:notes name .env;
# secrets::$index_allocation names the folder), except a drive letter (c:, //?/c:).
NO_STREAMS=""
no_streams_v() {
  local p="$1" drive="" pre rest
  # Prefix tests and substrings only: a regex or a literal ${p#…} costs up to a second on 60 KB.
  if [[ "$p" == //[?.]/[a-z]:* ]]; then drive="${p:0:6}"; p="${p:6}"
  elif [[ "$p" == [a-z]:* ]]; then drive="${p:0:2}"; p="${p:2}"; fi
  while [[ "$p" == *:* ]]; do
    pre="${p%%:*}"; rest="${p#*:}"
    if [[ "$rest" == */* ]]; then p="$pre/${rest#*/}"; else p="$pre"; fi
  done
  NO_STREAMS="$drive$p"
}

# Does the path look like a secrets / environment file? Names compare in any letter case (R3-3);
# environment files as is_env_file says. A path is judged as written and, when it names an alternate
# data stream, as the file the stream belongs to (review round 4): either form can make it a secret.
is_secret_path() {
  local file
  slashes_v "$1"; file="${SLASHED,,}"
  _is_secret_name "$file" && return 0
  # A drive-relative path (c:secrets/x) is also judged without its drive.
  [[ "$file" == [a-z]:* && "${file:2:1}" != / ]] && _is_secret_name "${file:2}" && return 0
  if [[ "$file" == *:* ]]; then
    no_streams_v "$file"
    [[ "$NO_STREAMS" != "$file" ]] && _is_secret_name "$NO_STREAMS" && return 0
  fi
  return 1
}

_is_secret_name() {
  local file="$1" base
  # The kit contract is NOT a secret: the doctrine, the SessionStart banner and
  # several subagents require reading it. It is excepted BEFORE the *.env pattern so
  # that a Read on it is not denied. It only holds STACK/CMD_*/PATH_*/BRANCH_PREFIX.
  case "$file" in
    */.claude/sdd-harness.env|.claude/sdd-harness.env|sdd-harness.env) return 1 ;;
  esac
  # Example env files hold no secrets and can be read, except inside a secret location, which wins
  # (openspec change autonomous-run-switch, design D8).
  case "$file" in
    */secrets/*|*/.secrets/*|secrets/*|.secrets/*) return 0 ;;
  esac
  base="${file##*/}"
  is_env_file "$base" && return 0
  case "$base" in
    *.env.example|*.env.sample) return 1 ;;
    credentials.*|id_rsa|id_ed25519|.npmrc|.pypirc|google-services.json|service-account*.json)
      return 0 ;;
  esac
  return 1
}

# Is the path a secret location itself (a search tool rooted there reaches every file in it)?
is_secret_dir() {
  local dir
  slashes_v "$1"; dir="${SLASHED,,}"
  if [[ "$dir" == *:* ]]; then no_streams_v "$dir"; dir="$NO_STREAMS"; fi
  [[ "$dir" == [a-z]:* && "${dir:2:1}" != / ]] && dir="${dir:2}"
  # One trailing '/' off by substring: on a 60 KB string bash's ${dir%/} (a literal, non-glob
  # pattern) took a second.
  [[ "$dir" == */ ]] && dir="${dir:0:${#dir}-1}"
  case "${dir##*/}" in
    secrets|.secrets) return 0 ;;
  esac
  return 1
}

# Does a search-tool glob (Grep's glob, Glob's pattern) reach a secret file (R3-3, R3-6)? In any
# letter case, it does when the pattern is itself a secret path or a secret location, or when one of
# its components can match a secret name below in a way that NAMES it: at least 3 of the name's
# marked characters ('d') come from literal characters or [...] classes of the glob, or the name's
# leading dot does. ? and [...] stand for any character they allow, so ?env.prod, [.]env.prod and
# .e?v.local are caught; * and ? alone name nothing, so *, **/*.ts and **/*.json stay free. A * that
# opens a component stands for at least one character other than a dot: *.env.ts names x.env.ts
# files, not .env.ts. A component ending in env.example / env.sample does not count for .env.<suffix>.
# {a,b} counts as either alternative; unbalanced braces or more than 64 alternatives count as reaching.
# paths.mjs (globReachesSecret) runs this check on every Grep and Glob call; this bash copy is the
# fallback with the switch "0" when paths.mjs gives no answer. In a name, '*' stands for any text.
SECRET_NAME_TEMPLATES=(
  '.env|dddd' '.env.*|dddd--' '*.env|-dddd' '*.env.*|-dddd--' 'credentials.*|ddddddddddd--'
  'id_rsa|dddddd' 'id_ed25519|dddddddddd' '.npmrc|dddddd' '.pypirc|ddddddd'
  'google-services.json|ddddddddddddddd-----' 'service-account*.json|ddddddddddddddd------'
  'secrets|ddddddd' '.secrets|dddddddd'
)
SECRET_DIR_TEMPLATES=('secrets|ddddddd' '.secrets|dddddddd')

# Tokens of one glob component, in GT: '*', '?', D (the leading *'s first character: not a dot),
# L<char>, C<chars> (a class), N<chars> (a negated class). GT_LITS holds the literal characters and
# GT_CLASS is 1 when there is a class.
GT=(); GT_LITS=""; GT_CLASS=0
_glob_tokens() {
  local s="$1" n=${#1} i=0 j ch set neg a b k hex c
  GT=(); GT_LITS=""; GT_CLASS=0
  while (( i < n )); do
    ch="${s:i:1}"
    case "$ch" in
      '*')
        if (( ${#GT[@]} == 0 )); then GT=(D '*')
        elif [[ "${GT[${#GT[@]}-1]}" != '*' ]]; then GT+=('*'); fi
        i=$(( i + 1 )) ;;
      '?') GT+=('?'); i=$(( i + 1 )) ;;
      '[')
        j=$(( i + 1 )); neg=0; set=""
        if [[ "${s:j:1}" == '!' || "${s:j:1}" == '^' ]]; then neg=1; j=$(( j + 1 )); fi
        if [[ "${s:j:1}" == ']' ]]; then set+=']'; j=$(( j + 1 )); fi
        while (( j < n )) && [[ "${s:j:1}" != ']' ]]; do
          a="${s:j:1}"
          if [[ "${s:j+1:1}" == '-' ]] && (( j + 2 < n )) && [[ "${s:j+2:1}" != ']' ]]; then
            b="${s:j+2:1}"
            printf -v a '%d' "'$a"; printf -v b '%d' "'$b"
            (( b <= 126 )) || b=126
            for (( k = a; k <= b; k++ )); do printf -v hex '%x' "$k"; printf -v c "\\x$hex"; set+="$c"; done
            j=$(( j + 3 ))
          else
            set+="$a"; j=$(( j + 1 ))
          fi
        done
        if (( j >= n )); then
          GT+=("L["); GT_LITS+='['; i=$(( i + 1 ))
        else
          if (( neg )); then GT+=("N$set"); else GT+=("C$set"); fi
          GT_CLASS=1; i=$(( j + 1 ))
        fi ;;
      *) GT+=("L$ch"); GT_LITS+="$ch"; i=$(( i + 1 )) ;;
    esac
  done
}

# Whether the component in GT can match the name $1 (marks $2) while naming it (see above): a search
# over (glob token, name position, marked characters credited up to 3), state = (i*64+j)*4+k.
_glob_meets() {
  local tt="$1" mk="$2" ng=${#GT[@]} nt=${#1} s i j k kk g t
  local -a todo=(0) seen=()
  while (( ${#todo[@]} )); do
    s=${todo[${#todo[@]}-1]}; unset "todo[${#todo[@]}-1]"
    [[ -z "${seen[s]:-}" ]] || continue
    seen[s]=1
    k=$(( s % 4 )); j=$(( (s / 4) % 64 )); i=$(( s / 256 ))
    (( i == ng && j == nt && k == 3 )) && return 0
    g="${GT[i]:-}"; t="${tt:j:1}"
    if (( i < ng )) && [[ "$g" == '*' ]]; then
      todo+=( $(( ((i + 1) * 64 + j) * 4 + k )) )
      (( j < nt )) && todo+=( $(( (i * 64 + j + 1) * 4 + k )) )
    fi
    if (( j < nt )) && [[ "$t" == '*' ]]; then
      todo+=( $(( (i * 64 + j + 1) * 4 + k )) )
      (( i < ng )) && [[ "$g" != '*' ]] && todo+=( $(( ((i + 1) * 64 + j) * 4 + k )) )
    fi
    if (( i < ng && j < nt )) && [[ "$g" != '*' && "$t" != '*' ]]; then
      case "$g" in
        '?') ;;
        D) [[ "$t" != '.' ]] || continue ;;
        L*) [[ "${g:1}" == "$t" ]] || continue ;;
        C*) [[ "${g:1}" == *"$t"* ]] || continue ;;
        N*) [[ "${g:1}" != *"$t"* ]] || continue ;;
      esac
      kk=$k
      if [[ "$g" == [LCN]* ]]; then
        if (( j == 0 )) && [[ "$t" == '.' ]]; then kk=3
        elif [[ "${mk:j:1}" == d ]] && (( kk < 3 )); then kk=$(( kk + 1 )); fi
      fi
      todo+=( $(( ((i + 1) * 64 + j + 1) * 4 + kk )) )
    fi
  done
  return 1
}

# _glob_could_name NAME MARKS COMPONENT (tokens already in GT): a cheap count of the literal
# characters the name could credit skips the search for most components.
_glob_could_name() {
  local tt="$1" mk="$2" comp="$3" d="" i n=0 ext
  if [[ "$tt" == '.env.*' || "$tt" == '*.env.*' ]]; then
    [[ "$comp" == *env.example || "$comp" == *env.sample ]] && return 1
    # A literal source-code last extension (*.env.ts) names code, not an environment file.
    ext="${comp##*.}"
    [[ "$comp" == *.* && "$ext" != *[\*\?\[\]]* && "$ENV_SOURCE_EXTENSIONS" == *" $ext "* ]] && return 1
  fi
  if [[ "$GT_CLASS" == 0 ]] && ! [[ "$tt" == .* && "${GT[0]:-}" == 'L.' ]]; then
    for (( i = 0; i < ${#tt}; i++ )); do [[ "${mk:i:1}" == d ]] && d+="${tt:i:1}"; done
    for (( i = 0; i < ${#GT_LITS}; i++ )); do [[ "$d" == *"${GT_LITS:i:1}"* ]] && n=$(( n + 1 )); done
    (( n >= 3 )) || return 1
  fi
  _glob_meets "$tt" "$mk"
}

# The {a,b} alternatives of a glob, in GLOB_ALTS. Returns 1 on unbalanced braces or more than 64.
GLOB_ALTS=()
_glob_alts() {
  local -a todo=("$1")
  local p i ch depth open close body part pre post
  GLOB_ALTS=()
  while (( ${#todo[@]} )); do
    p="${todo[${#todo[@]}-1]}"; unset "todo[${#todo[@]}-1]"
    if [[ "$p" != *'{'* && "$p" != *'}'* ]]; then
      GLOB_ALTS+=("$p")
    else
      open=-1; close=-1; depth=0
      for (( i = 0; i < ${#p}; i++ )); do
        ch="${p:i:1}"
        if [[ "$ch" == '{' ]]; then
          (( depth == 0 )) && open=$i
          depth=$(( depth + 1 ))
        elif [[ "$ch" == '}' ]]; then
          (( depth > 0 )) || return 1
          depth=$(( depth - 1 ))
          if (( depth == 0 )); then close=$i; break; fi
        fi
      done
      (( close >= 0 )) || return 1
      pre="${p:0:open}"; body="${p:open+1:close-open-1}"; post="${p:close+1}"
      depth=0; part=""
      for (( i = 0; i < ${#body}; i++ )); do
        ch="${body:i:1}"
        case "$ch" in
          '{') depth=$(( depth + 1 )); part+="$ch" ;;
          '}') depth=$(( depth - 1 )); part+="$ch" ;;
          ',') if (( depth == 0 )); then todo+=("$pre$part$post"); part=""; else part+="$ch"; fi ;;
          *) part+="$ch" ;;
        esac
      done
      todo+=("$pre$part$post")
    fi
    (( ${#GLOB_ALTS[@]} + ${#todo[@]} <= 64 )) || return 1
  done
  return 0
}

glob_reaches_secret() {
  local pat alt rest comp last tpl
  [[ -n "$1" ]] || return 1
  slashes_v "$1"; pat="${SLASHED,,}"
  # Past 4 KiB (with separators squeezed) the component search below would outrun the hook's
  # timeout: such a glob counts as reaching (review round 4).
  (( ${#pat} <= 4096 )) || return 0
  if [[ "$pat" == *'{'* || "$pat" == *'}'* ]]; then
    _glob_alts "$pat" || return 0
  else
    GLOB_ALTS=("$pat")
  fi
  for alt in "${GLOB_ALTS[@]}"; do
    { is_secret_path "$alt" || is_secret_dir "$alt"; } && return 0
    rest="$alt"
    while [[ -n "$rest" ]]; do
      comp="${rest%%/*}"
      if [[ "$rest" == */* ]]; then rest="${rest#*/}"; last=0; else rest=""; last=1; fi
      # A literal component is judged by is_secret_path above; one made only of * names nothing.
      [[ "$comp" == *[\*\?\[]* ]] || continue
      [[ -n "${comp//\*/}" ]] || continue
      _glob_tokens "$comp"
      if (( last )); then
        for tpl in "${SECRET_NAME_TEMPLATES[@]}"; do _glob_could_name "${tpl%%|*}" "${tpl#*|}" "$comp" && return 0; done
      else
        for tpl in "${SECRET_DIR_TEMPLATES[@]}"; do _glob_could_name "${tpl%%|*}" "${tpl#*|}" "$comp" && return 0; done
      fi
    done
  done
  return 1
}
