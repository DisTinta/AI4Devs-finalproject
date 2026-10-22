#!/usr/bin/env bash
# PreToolUse (Bash) — security invariants that are not delegated to a prompt.
# What lives in AGENTS.md is interpreted by the model; this is executed by code.
#
# The line is parsed like the shell does (shell-words.mjs, openspec change autonomous-run-switch,
# design D6): rules about a command decide on its words, so a commit message or a grep pattern is
# not a command, while quoted paths and flags, substitutions and interpreter text still count.
# A few rules keep matching the raw text, as before. A line the parser cannot read is matched raw
# with the switch "0", and denied in an unattended run.
#
# Cost (adversarial review 2026-10-21): one node process reads the hook input, parses the line and
# matches every raw-text rule on every interpreter text; the hook starts no jq or grep per rule. A
# line too costly to check, or a check that runs too long, is denied in an unattended run before the
# hook timeout (30 s) could let it through.
set -uo pipefail
# The hook's directory without a dirname process; invoke.cjs may pass a Windows path (backslashes).
HOOK_PATH="${BASH_SOURCE[0]//\\//}"
HOOK_DIR="${HOOK_PATH%/*}"
[[ "$HOOK_DIR" != "$HOOK_PATH" ]] || HOOK_DIR=.
source "$HOOK_DIR/lib.sh"

INPUT=$(cat)
hook_input_init "$INPUT"
# Without jq no field of the input can be read: no decision, as before (an autonomous run already
# denied in hook_input_init).
has_jq || done_ok
# In an autonomous run the hook fails closed from here on; a Cursor background agent once the
# input is read below.
autonomous_run && fail_closed

# Raw-text rules (POSIX EREs). shell-words.mjs matches them like grep -qE: scope "any" on every
# interpreter text (and the whole line when it cannot be parsed), scope "whole" on the line, ignoring
# case. Several EREs in one rule must all match one text.
RM_RAW='rm[[:space:]]+(-[a-zA-Z]*[rf][a-zA-Z]*[[:space:]]+)+'
PUSH_FORCE_RAW='git[[:space:]]+push.*(--force([^-]|$)|-f([[:space:]]|$))'
DISCARD_RAW='git[[:space:]]+(reset[[:space:]]+--hard|clean[[:space:]]+-[a-z]*f|filter-branch)'
INSTALL_RAW='(^|[[:space:]])(npm|pnpm|yarn|bun)[[:space:]]+(i|add|install)[[:space:]]+[^-]|(^|[[:space:]])(composer|pip|pip3|gem|cargo|go)[[:space:]]+(require|install|add|get)[[:space:]]+[^-]'
CONTRACT_RAW='(sed|perl)[[:space:]]+[^|;&]*-i|>|(^|[[:space:]|;&])(tee|mv|cp|truncate|dd)[[:space:]]'
DESTROY_RAW='mkfs|dd[[:space:]]+if=|:\(\)\{.*\};:'
CHMOD_RAW='chmod[[:space:]]+(-R[[:space:]]+)?777'
PROD_RAW='(APP_ENV|NODE_ENV|RAILS_ENV)=production|--env[[:space:]]*=?[[:space:]]*prod(uction)?|kubectl[[:space:]].*(-n|--namespace)[[:space:]]*prod'
T=$'\t'
RAW_RULES=(
  "rm${T}any${T}${RM_RAW}"
  "push${T}any${T}${PUSH_FORCE_RAW}"
  "discard${T}any${T}${DISCARD_RAW}"
  "install${T}any${T}${INSTALL_RAW}"
  "contract${T}any${T}sdd-harness\.env${T}${CONTRACT_RAW}"
  "destroy_line${T}whole${T}${DESTROY_RAW}"
  "chmod_line${T}whole${T}${CHMOD_RAW}"
  "prod_line${T}whole${T}${PROD_RAW}"
  "install_line${T}whole${T}${INSTALL_RAW}"
  "env_line${T}whole${T}sdd-harness\.env"
  "contract_line${T}whole${T}${CONTRACT_RAW}"
)
# 7. The stack-specific pattern of sdd-harness.env, with case (grep reads it when node cannot).
[[ -z "$GUARD_DANGEROUS_CMD" ]] || RAW_RULES+=("stack_line${T}line${T}${GUARD_DANGEROUS_CMD}")
RAW_ARGS=()
for r in "${RAW_RULES[@]}"; do RAW_ARGS+=(--raw "$r"); done

# Every fact the rules need, from one node process (shell-words.mjs --hook-input prints shell
# assignments, single-quoted, ending with SW_DONE=1).
P_OK=false P_ERROR='' P_PIPE=false P_SCRATCH=false P_RM=false P_PUSH=false P_DISCARD=false
P_CONTRACT=false P_KIT='' P_WHOLE='' P_REVERT='' P_FORCED=false P_BYPASS=false P_BASE=false
P_PROTECTION=false P_INSTALLS=0 P_INST_INTERP=0 P_COMMANDS=0 P_MANAGER='' P_REGISTRY=false
P_NPMCONFIG=false P_PACKAGES='' P_RUNNERS=0 P_KIT_NAMED='' P_KIT_INTERP='' P_ALIAS='' P_COSTLY=''
COMMAND='' CWD='' SCRATCHPAD='' P_BACKGROUND=''
OUT=$(timeout 5 node "$HOOK_DIR/shell-words.mjs" --hook-input --project "$PROJECT_DIR" \
  --base "$AUTONOMOUS_MERGE_BASE" "${RAW_ARGS[@]}" <<<"$INPUT" 2>/dev/null) || OUT=''
if [[ "$OUT" == *$'\n'SW_DONE=1 ]]; then
  eval "$OUT"
else
  # The parser failed, timed out or printed something unreadable: read the input with jq and match
  # the raw rules on the whole line with grep, as before the parser.
  COMMAND=$(field "$INPUT" '.tool_input.command')
  P_BACKGROUND=$(field "$INPUT" '.is_background_agent')
  P_OK=false P_ERROR='parser failure'
fi
# Unattended mode (lib.sh `unattended`), from the switch and the input field read above, so it is
# looked up once without another jq process.
UNATT=false
if autonomous_run || [[ "$P_BACKGROUND" == "true" ]]; then UNATT=true; fail_closed; fi
[[ -n "$COMMAND" ]] || done_ok
PARSED="$P_OK"

# A rule's raw match. Falls back to grep on the whole line when the node process gave no answer for it.
raw() { # raw <name>
  local var="R_${1^^}" re
  case "${!var:-}" in
    true) return 0 ;;
    false) return 1 ;;
  esac
  for re in "${RAW_RULES[@]}"; do
    [[ "${re%%"$T"*}" == "$1" ]] || continue
    local rest="${re#*"$T"}" scope="${re#*"$T"}"
    scope="${scope%%"$T"*}"
    rest="${rest#*"$T"}"
    local flags=-qE
    [[ "$scope" != whole ]] || flags=-qiE
    while :; do
      printf '%s' "$COMMAND" | grep $flags -- "${rest%%"$T"*}" || return 1
      [[ "$rest" == *"$T"* ]] || return 0
      rest="${rest#*"$T"}"
    done
  done
  return 1
}

# Elapsed-time guard: in an unattended run a check that has taken this long is denied before the
# hook timeout (30 s) could end it and let the call through.
over_budget() { [[ "$UNATT" == true ]] && (( SECONDS >= ${1:-20} )); }
too_costly() {
  deny "Unattended run: this command line is too costly to check ($1), so it is denied. Split it into shorter commands, and write long scripts to a file with the editing tools first."
}

if [[ "$PARSED" != "true" ]] && [[ "$UNATT" == true ]]; then
  deny "Unattended run: this command line cannot be read reliably (${P_ERROR:-parser failure}). Rewrite it as plain simple commands (no process substitution, \$'…', arithmetic, case or functions)."
fi
if [[ "$UNATT" == true ]]; then
  [[ -z "$P_COSTLY" ]] || too_costly "$P_COSTLY"
  ! over_budget 20 || too_costly "the check took ${SECONDS} s"
fi

# In an unattended run a rule that fired only on interpreter text may be a false positive (a heredoc
# that writes prose mentioning a command): the agent is told how to write such text instead.
raw_hint() {
  [[ "$1" != "true" && "$PARSED" == "true" && "$UNATT" == true ]] || return 0
  printf '%s' " The match comes from text handed to an interpreter (a heredoc, -c or -e), which the guard has read only by pattern: if it is text and not a command, write the file with the editing tools instead."
}

# A pipe into a shell runs the previous commands' output, which cannot be read: today's raw match
# applies, and an unattended run refuses it.
if [[ "$P_PIPE" == "true" ]] && [[ "$UNATT" == true ]]; then
  deny "Unattended run: a pipe into a shell runs text the guard cannot read, so write the commands directly instead of piping them into bash/sh/zsh."
fi

# 0. Removals inside the session scratchpad: no decision, the normal permission flow applies.
[[ "$P_SCRATCH" == "true" ]] && done_ok

# 1. Mass deletions and device destruction.
#    The interpreter-text hint goes only with a match found in interpreter text, never with a parsed
#    command or a whole-line raw rule (mkfs, dd if=, the fork bomb).
if [[ "$P_RM" == "true" ]] || raw destroy_line; then
  deny "Destructive command blocked by repository policy: ${COMMAND}"
fi
if raw rm; then
  deny "Destructive command blocked by repository policy: ${COMMAND}$(raw_hint false)"
fi

# 2. Wide-open permissions.
if raw chmod_line; then
  deny "chmod 777 blocked: it opens the file to any user on the system."
fi

# 3. History rewriting and force push. A forced push to the base also names the merge gate.
if [[ "$P_PUSH" == "true" ]] || raw push; then
  GATE=''
  autonomous_run && [[ "$P_BASE" == "true" ]] && \
    GATE=" In an autonomous run the base branch (${AUTONOMOUS_MERGE_BASE}) only changes through the merge gate (gh pr merge)."
  deny "git push --force is forbidden. A force push is done by a human or not at all.${GATE}$(raw_hint "$P_PUSH")"
fi
if [[ "$P_DISCARD" == "true" ]] || raw discard; then
  ask "This command irreversibly discards local work. Confirm manually." \
    "Use git restore -- <paths> or git stash push -- <paths> on explicit paths instead.$(raw_hint "$P_DISCARD")"
fi

# 4. Production.
if raw prod_line; then
  deny "Operations against production from the agent are not allowed."
fi

# 6. The kit contract (and its switches) is changed by a human, never by a shell write from the
#    agent. Reading it stays free: only a write whose target is sdd-harness.env counts.
if [[ "$P_CONTRACT" == "true" ]] || \
   { [[ "$PARSED" != "true" ]] && raw env_line && raw contract_line; } || raw contract; then
  deny "sdd-harness.env is edited by hand, not from the agent's shell."
fi

# 8. Autonomous run: the kit configuration, the local switch and the base branch stay untouched
#    (design D5).
if autonomous_run && [[ "$PARSED" == "true" ]]; then
  [[ -z "$P_KIT" ]] || deny "Autonomous run: .claude/, .cursor/ and the autonomous profile are not modified by the agent (${P_KIT}). Paths that cannot be resolved (variables, unknown directory) count too: use literal paths."
  [[ -z "$P_KIT_INTERP" ]] || deny "Autonomous run: interpreter text (python -c, node -e, a heredoc, eval…) that names .claude/, .cursor/, sdd-harness.env or the autonomous profile is denied: the guard cannot tell what it does with them (${P_KIT_INTERP}). Read those files with the reading tools."
  [[ -z "$P_KIT_NAMED" ]] || deny "Autonomous run: .claude/, .cursor/ and the autonomous profile are not modified by the agent (${P_KIT_NAMED}). Only read-only commands (cat, grep, ls, find without actions, git diff/log/show/status…) and the kit's own scripts may name them."
  [[ -z "$P_ALIAS" ]] || deny "Autonomous run: gh and git aliases are not defined or removed by the agent (${P_ALIAS}): an alias can hide a merge from the merge gate (gh pr merge). Run the command itself."
  [[ -z "$P_WHOLE" ]] || deny "Autonomous run: whole-tree or glob staging is not allowed (${P_WHOLE}). Stage explicit paths: git add <paths>."
  [[ -z "$P_REVERT" ]] || deny "Autonomous run: a revert without explicit paths could also revert the local switch (${P_REVERT}). Use git stash push -- <paths> or git restore -- <paths>."
  [[ "$P_FORCED" != "true" ]] || deny "Autonomous run: a forced checkout or switch discards local changes, the switch included."
  [[ "$P_BYPASS" != "true" ]] || deny "Autonomous run: permission bypass flags are not allowed."
  [[ "$P_BASE" != "true" ]] || deny "Autonomous run: the base branch (${AUTONOMOUS_MERGE_BASE}) only changes through the merge gate (gh pr merge). No direct push, local merge or commit on it."
  [[ "$P_PROTECTION" != "true" ]] || deny "Autonomous run: the branch protection is not modified by the agent; only the merge gate (gh pr merge) changes the base."
fi

# 5. Dependency installation. Outside an unattended run it asks, as before. In an unattended run the
#    package is vetted automatically (vet-package.mjs, design D3); the allow is emitted last, after
#    every other rule.
ALLOW_INSTALL=""
if { [[ "$PARSED" == "true" ]] && [[ "$P_INSTALLS" != "0" ]]; } || \
   { [[ "$PARSED" != "true" ]] && raw install_line; } || raw install; then
  if [[ "$UNATT" != true ]]; then
    ask "You are about to install a dependency. First verify in the official registry that the package exists and is the correct one: this is the slopsquatting vector."
  fi
  [[ "$P_INSTALLS" != "0" && "$P_INST_INTERP" == "0" ]] || \
    deny "Unattended run: an install inside a substitution or interpreter text cannot be vetted. Run it as a plain command."
  [[ "$P_COMMANDS" == "1" ]] || \
    deny "Unattended run: an install must be the only command of the line, so the vetting covers everything that runs."
  case "$P_MANAGER" in
    npm|pnpm|yarn|bun) : ;;
    *) deny "Unattended run: installs through ${P_MANAGER} cannot be vetted automatically; only npm, pnpm, yarn and bun." ;;
  esac
  [[ "$P_REGISTRY" != "true" ]] || deny "Unattended run: --registry / --userconfig would install from a registry the vetting does not read."
  [[ "$P_NPMCONFIG" != "true" ]] || deny "Unattended run: npm_config_* assignments could point npm at another registry."
  # The vetting may take up to 10 s: start it only with room left before the hook timeout.
  ! over_budget 15 || too_costly "the check took ${SECONDS} s before the package vetting"
  # shellcheck disable=SC2086
  VET=$(timeout 10 node "$HOOK_DIR/vet-package.mjs" "$P_MANAGER" $P_PACKAGES 2>/dev/null) || VET=''
  VET_OK=$(printf '%s' "$VET" | jq -r 'if has("ok") then .ok else "unreadable" end' 2>/dev/null || echo unreadable)
  case "$VET_OK" in
    true) ALLOW_INSTALL="vetted: ${P_PACKAGES}" ;;
    false) deny "Unattended run: the package vetting failed: $(printf '%s' "$VET" | jq -r '.failures | join("; ")')" ;;
    *) deny "Unattended run: the package vetting gave no readable result, so the install is denied." ;;
  esac
fi

# Package runners that would download code (npx/npm exec without a local binary, dlx, bunx).
if [[ "$UNATT" == true ]] && [[ "$P_RUNNERS" != "0" ]]; then
  deny "Unattended run: this command downloads and runs a package without vetting. Install it with a pinned version first, or run a locally installed binary."
fi

# 7. Additional stack-specific pattern, defined in sdd-harness.env (always on the raw text).
if [[ -n "$GUARD_DANGEROUS_CMD" ]] && raw stack_line; then
  ask "This command is destructive for this project's stack (${STACK}). Confirm manually." \
    "This needs a human: stop the ticket cleanly and leave it In Review."
fi

[[ -n "$ALLOW_INSTALL" ]] && allow "$ALLOW_INSTALL"
done_ok
