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
KIT_PROTECT_SPECS="1"
KIT_SPEC_AUDIT_GATE="1"
# Autonomous run (openspec change autonomous-run-switch, design D1). "1" = unattended and autonomous:
# no hook asks, the agent may merge through the merge gate, the doctrine relaxations of the ADR apply.
KIT_AUTONOMOUS_RUN="0"
AUTONOMOUS_MERGE_BASE=""
KIT_SECRET_ALLOWLIST=""

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
      KIT_SKIP_STOP_TESTS|KIT_ALLOW_WIP|KIT_PROTECT_SPECS|KIT_SPEC_AUDIT_GATE|\
      KIT_AUTONOMOUS_RUN|AUTONOMOUS_MERGE_BASE|KIT_SECRET_ALLOWLIST)
        printf -v "$key" '%s' "$val"
        ;;
    esac
  done < "$file"
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
  HOOK_INPUT="$1"
  if [[ "$KIT_AUTONOMOUS_RUN" == "1" ]] && ! has_jq; then
    printf 'jq is required in an unattended run (KIT_AUTONOMOUS_RUN="1"); install it or set the switch to "0".\n' >&2
    exit 2
  fi
}

# Hooks that take no tool decision (prompt, session start, post-edit, stop) only keep the input, so
# the emitters can tell the Cursor event (design D11).
remember_input() { HOOK_INPUT="$1"; }

autonomous_run() { [[ "$KIT_AUTONOMOUS_RUN" == "1" ]]; }

unattended() {
  autonomous_run && return 0
  [[ -n "$HOOK_INPUT" ]] && [[ "$(field "$HOOK_INPUT" '.is_background_agent')" == "true" ]]
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
deny() {
  HOOK_DECIDED=1
  has_jq || { printf '%s\n' "$1" >&2; exit 2; }
  local ok=0
  if cursor_client; then
    cursor_permission deny "$1" || ok=1
  else
    jq -nc --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}' || ok=1
  fi
  # In an unattended run a broken jq must not turn a deny into a silent pass (design D21).
  if [[ "$ok" != "0" ]] && unattended; then printf '%s\n' "$1" >&2; exit 2; fi
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
  if cursor_client; then
    case "$(cursor_event)" in
      preToolUse|beforeReadFile) cursor_permission allow "Needs the person's confirmation: $1" ;;
      *) cursor_permission ask "$1" ;;
    esac
  else
    jq -nc --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"ask",permissionDecisionReason:$r}}'
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
    name="$(basename "$dir")"
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

# Normalises a path (slashes, /c/… drive form) and strips PROJECT_DIR/, case-insensitively on
# Windows. Prints the repository-relative path, or the normalised absolute one when outside.
rel_path() {
  local p="${1//\\//}" root="${PROJECT_DIR//\\//}"
  [[ "$p" =~ ^/([a-zA-Z])/(.*)$ ]] && p="${BASH_REMATCH[1]^^}:/${BASH_REMATCH[2]}"
  [[ "$root" =~ ^/([a-zA-Z])/(.*)$ ]] && root="${BASH_REMATCH[1]^^}:/${BASH_REMATCH[2]}"
  [[ "$p" =~ ^([a-z]):(.*)$ ]] && p="${BASH_REMATCH[1]^^}:${BASH_REMATCH[2]}"
  [[ "$root" =~ ^([a-z]):(.*)$ ]] && root="${BASH_REMATCH[1]^^}:${BASH_REMATCH[2]}"
  if [[ "${p,,}" == "${root,,}/"* ]]; then
    printf '%s' "${p:$(( ${#root} + 1 ))}"
  else
    printf '%s' "$p"
  fi
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

# Does the path look like a secrets / environment file?
is_secret_path() {
  local file="${1//\\//}"
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
  case "$file" in
    *.env.example|*.env.sample) return 1 ;;
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
