#!/usr/bin/env bash
# PreToolUse (Bash) — security invariants that are not delegated to a prompt.
# What lives in AGENTS.md is interpreted by the model; this is executed by code.
#
# The line is parsed like the shell does (shell-words.mjs, openspec change autonomous-run-switch,
# design D6): rules about a command decide on its words, so a commit message or a grep pattern is
# not a command, while quoted paths and flags, substitutions and interpreter text still count.
# A few rules keep matching the raw text, as before. A line the parser cannot read is matched raw
# with the switch "0", and denied in an unattended run.
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

INPUT=$(cat)
hook_input_init "$INPUT"
fail_closed
COMMAND=$(field "$INPUT" '.tool_input.command')
[[ -n "$COMMAND" ]] || done_ok
CWD=$(field "$INPUT" '.cwd')
SCRATCHPAD=$(field "$INPUT" '.scratchpad_dir')

PARSE=$(parse_command "$COMMAND" "${CWD:-$PROJECT_DIR}" "$SCRATCHPAD")
# Every fact the rules need, read in one jq call (each jq start costs time on Windows).
P_OK=false P_ERROR='' P_PIPE=false P_SCRATCH=false P_RM=false P_PUSH=false P_DISCARD=false
P_CONTRACT=false P_KIT='' P_WHOLE='' P_REVERT='' P_FORCED=false P_BYPASS=false P_BASE=false
P_PROTECTION=false P_INSTALLS=0 P_INST_INTERP=0 P_COMMANDS=0 P_MANAGER='' P_REGISTRY=false
P_NPMCONFIG=false P_PACKAGES='' P_RUNNERS=0 P_RAW=''
eval "$(printf '%s' "$PARSE" | jq -r '
  (.facts // {}) as $f |
  @sh "P_OK=\(.ok) P_ERROR=\(.error // "") P_PIPE=\(.pipeIntoShell // false)",
  @sh "P_SCRATCH=\($f.scratchpadOnly // false) P_RM=\($f.rmRecursive // false) P_PUSH=\($f.gitForcePush // false) P_DISCARD=\($f.gitDiscard // false)",
  @sh "P_CONTRACT=\($f.kitContractWrite // false) P_KIT=\(($f.kitConfig // []) | join(", ")) P_WHOLE=\(($f.wholeTree // []) | join(", ")) P_REVERT=\(($f.pathlessRevert // []) | join(", "))",
  @sh "P_FORCED=\($f.forcedSwitch // false) P_BYPASS=\($f.bypassFlags // false) P_BASE=\($f.pushToBase // false) P_PROTECTION=\($f.protectionApi // false)",
  @sh "P_INSTALLS=\(($f.installs // []) | length) P_INST_INTERP=\([($f.installs // [])[] | select(.inInterp)] | length) P_COMMANDS=\((.commands // []) | length)",
  @sh "P_MANAGER=\(($f.installs // [])[0].manager // "") P_REGISTRY=\(($f.installs // [])[0].registry // false) P_NPMCONFIG=\(($f.installs // [])[0].npmConfig // false)",
  @sh "P_PACKAGES=\((($f.installs // [])[0].packages // []) | join(" ")) P_RUNNERS=\([($f.runners // [])[] | select(.downloads)] | length)",
  @sh "P_RAW=\([(.rawInterpreterText // [])[] | @base64] | join(" "))"
' 2>/dev/null)"
PARSED="$P_OK"

if [[ "$PARSED" != "true" ]] && unattended; then
  deny "Unattended run: this command line cannot be read reliably (${P_ERROR:-parser failure}). Rewrite it as plain simple commands (no process substitution, \$'…', arithmetic, case or functions)."
fi

# Raw text the rules still match: the whole line when it cannot be parsed, plus every piece of text
# handed to an interpreter (shell-words.mjs → rawInterpreterText).
RAW_TEXTS=()
[[ "$PARSED" == "true" ]] || RAW_TEXTS+=("$COMMAND")
for t in $P_RAW; do RAW_TEXTS+=("$(printf '%s' "$t" | base64 -d 2>/dev/null)"); done
raw_any() { local t; for t in "${RAW_TEXTS[@]}"; do printf '%s' "$t" | grep -qE "$1" && return 0; done; return 1; }
raw_whole() { printf '%s' "$COMMAND" | grep -qiE "$1"; }
# In an unattended run a rule that fired only on interpreter text may be a false positive (a heredoc
# that writes prose mentioning a command): the agent is told how to write such text instead.
raw_hint() {
  [[ "$1" != "true" && "$PARSED" == "true" ]] && unattended || return 0
  printf '%s' " The match comes from text handed to an interpreter (a heredoc, -c or -e), which the guard reads only by pattern: if it is text and not a command, write the file with the editing tools instead."
}

RM_RAW='rm[[:space:]]+(-[a-zA-Z]*[rf][a-zA-Z]*[[:space:]]+)+'
PUSH_FORCE_RAW='git[[:space:]]+push.*(--force([^-]|$)|-f([[:space:]]|$))'
DISCARD_RAW='git[[:space:]]+(reset[[:space:]]+--hard|clean[[:space:]]+-[a-z]*f|filter-branch)'
INSTALL_RAW='(^|[[:space:]])(npm|pnpm|yarn|bun)[[:space:]]+(i|add|install)[[:space:]]+[^-]|(^|[[:space:]])(composer|pip|pip3|gem|cargo|go)[[:space:]]+(require|install|add|get)[[:space:]]+[^-]'
CONTRACT_RAW='(sed|perl)[[:space:]]+[^|;&]*-i|>|(^|[[:space:]|;&])(tee|mv|cp|truncate|dd)[[:space:]]'

# A pipe into a shell runs the previous commands' output, which cannot be read: today's raw match
# applies, and an unattended run refuses it.
if [[ "$P_PIPE" == "true" ]] && unattended; then
  deny "Unattended run: a pipe into a shell runs text the guard cannot read, so write the commands directly instead of piping them into bash/sh/zsh."
fi

# 0. Removals inside the session scratchpad: no decision, the normal permission flow applies.
[[ "$P_SCRATCH" == "true" ]] && done_ok

# 1. Mass deletions and device destruction.
if [[ "$P_RM" == "true" ]] || raw_any "$RM_RAW" || raw_whole 'mkfs|dd[[:space:]]+if=|:\(\)\{.*\};:'; then
  deny "Destructive command blocked by repository policy: ${COMMAND}$(raw_hint "$P_RM")"
fi

# 2. Wide-open permissions.
if raw_whole 'chmod[[:space:]]+(-R[[:space:]]+)?777'; then
  deny "chmod 777 blocked: it opens the file to any user on the system."
fi

# 3. History rewriting and force push.
if [[ "$P_PUSH" == "true" ]] || raw_any "$PUSH_FORCE_RAW"; then
  deny "git push --force is forbidden. A force push is done by a human or not at all.$(raw_hint "$P_PUSH")"
fi
if [[ "$P_DISCARD" == "true" ]] || raw_any "$DISCARD_RAW"; then
  ask "This command irreversibly discards local work. Confirm manually." \
    "Use git restore -- <paths> or git stash push -- <paths> on explicit paths instead.$(raw_hint "$P_DISCARD")"
fi

# 4. Production.
if raw_whole '(APP_ENV|NODE_ENV|RAILS_ENV)=production|--env[[:space:]]*=?[[:space:]]*prod(uction)?|kubectl[[:space:]].*(-n|--namespace)[[:space:]]*prod'; then
  deny "Operations against production from the agent are not allowed."
fi

# 6. The kit contract (and its switches) is changed by a human, never by a shell write from the
#    agent. Reading it stays free: only a write whose target is sdd-harness.env counts.
if [[ "$P_CONTRACT" == "true" ]] || \
   { [[ "$PARSED" != "true" ]] && raw_whole 'sdd-harness\.env' && raw_whole "$CONTRACT_RAW"; }; then
  deny "sdd-harness.env is edited by hand, not from the agent's shell."
fi

# 8. Autonomous run: the kit configuration, the local switch and the base branch stay untouched
#    (design D5).
if autonomous_run && [[ "$PARSED" == "true" ]]; then
  [[ -z "$P_KIT" ]] || deny "Autonomous run: .claude/, .cursor/ and the autonomous profile are not modified by the agent (${P_KIT}). Paths that cannot be resolved (variables, unknown directory) count too: use literal paths."
  [[ -z "$P_WHOLE" ]] || deny "Autonomous run: whole-tree or glob staging is not allowed (${P_WHOLE}). Stage explicit paths: git add <paths>."
  [[ -z "$P_REVERT" ]] || deny "Autonomous run: a revert without explicit paths could also revert the local switch (${P_REVERT}). Use git stash push -- <paths> or git restore -- <paths>."
  [[ "$P_FORCED" != "true" ]] || deny "Autonomous run: a forced checkout or switch discards local changes, the switch included."
  [[ "$P_BYPASS" != "true" ]] || deny "Autonomous run: permission bypass flags are not allowed."
  [[ "$P_BASE" != "true" ]] || deny "Autonomous run: the base branch (${AUTONOMOUS_MERGE_BASE}) only changes through the merge gate (gh pr merge). No direct push, local merge or commit on it."
  [[ "$P_PROTECTION" != "true" ]] || deny "Autonomous run: the branch protection is not modified by the agent."
fi

# 5. Dependency installation. Outside an unattended run it asks, as before. In an unattended run the
#    package is vetted automatically (vet-package.mjs, design D3); the allow is emitted last, after
#    every other rule.
ALLOW_INSTALL=""
if { [[ "$PARSED" == "true" ]] && [[ "$P_INSTALLS" != "0" ]]; } || \
   { [[ "$PARSED" != "true" ]] && raw_whole "$INSTALL_RAW"; } || raw_any "$INSTALL_RAW"; then
  if ! unattended; then
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
  # shellcheck disable=SC2086
  VET=$(timeout 10 node "$(dirname "${BASH_SOURCE[0]}")/vet-package.mjs" "$P_MANAGER" $P_PACKAGES 2>/dev/null) || VET=''
  VET_OK=$(printf '%s' "$VET" | jq -r 'if has("ok") then .ok else "unreadable" end' 2>/dev/null || echo unreadable)
  case "$VET_OK" in
    true) ALLOW_INSTALL="vetted: ${P_PACKAGES}" ;;
    false) deny "Unattended run: the package vetting failed: $(printf '%s' "$VET" | jq -r '.failures | join("; ")')" ;;
    *) deny "Unattended run: the package vetting gave no readable result, so the install is denied." ;;
  esac
fi

# Package runners that would download code (npx/npm exec without a local binary, dlx, bunx).
if unattended && [[ "$P_RUNNERS" != "0" ]]; then
  deny "Unattended run: this command downloads and runs a package without vetting. Install it with a pinned version first, or run a locally installed binary."
fi

# 7. Additional stack-specific pattern, defined in sdd-harness.env (always on the raw text).
if [[ -n "$GUARD_DANGEROUS_CMD" ]] && printf '%s' "$COMMAND" | grep -qE "$GUARD_DANGEROUS_CMD"; then
  ask "This command is destructive for this project's stack (${STACK}). Confirm manually."
fi

[[ -n "$ALLOW_INSTALL" ]] && allow "$ALLOW_INSTALL"
done_ok
