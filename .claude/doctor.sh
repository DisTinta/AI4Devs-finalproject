#!/usr/bin/env bash
# doctor.sh — checks that the SDD Harness Kit is healthy in the target project.
# Usage (from the root of the ALREADY installed project):
#   bash .claude/../  → better: copy/run from the kit:
#   /path/to/kit/doctor.sh --dest .
#   ./doctor.sh                 # if you are in the project and doctor is on PATH via the kit
set -euo pipefail

#   ./doctor.sh --autonomous --config-dir ~/.claude-autonomo   # preflight of an autonomous run (D13)
# Flags may come in any order; a bare positional directory is the destination.
DEST="."; AUTONOMOUS=0; CONFIG_DIR="${CLAUDE_CONFIG_DIR:-}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dest) DEST="${2:?--dest needs a directory}"; shift 2 ;;
    --autonomous) AUTONOMOUS=1; shift ;;
    --config-dir) CONFIG_DIR="${2:?--config-dir needs a directory}"; shift 2 ;;
    -*) printf 'doctor.sh: unknown option %s\n' "$1" >&2; exit 2 ;;
    *) DEST="$1"; shift ;;
  esac
done
DEST="$(cd "$DEST" && pwd)"

C_OK=$'\033[0;32m'; C_WARN=$'\033[0;33m'; C_ERR=$'\033[0;31m'; C_OFF=$'\033[0m'
FAILS=0; WARNS=0
ok()   { printf '  %sOK%s  %s\n' "$C_OK" "$C_OFF" "$*"; }
warn() { printf '  %sWARN%s %s\n' "$C_WARN" "$C_OFF" "$*"; WARNS=$((WARNS+1)); }
fail() { printf '  %sFAIL%s %s\n' "$C_ERR" "$C_OFF" "$*"; FAILS=$((FAILS+1)); }

printf '\nSDD Harness Kit doctor — %s\n\n' "$DEST"

# Doctrine and context
[[ -f "$DEST/docs/base-standards.md" ]] && ok "docs/base-standards.md" || fail "missing docs/base-standards.md"
[[ -f "$DEST/docs/project-context.md" ]] && ok "docs/project-context.md" || fail "missing docs/project-context.md"
if [[ -f "$DEST/docs/project-context.md" ]] && grep -q '{{' "$DEST/docs/project-context.md"; then
  warn "docs/project-context.md still has unfilled {{...}} placeholders"
fi
[[ -f "$DEST/.claude/sdd-harness.env" ]] && ok ".claude/sdd-harness.env" || fail "missing .claude/sdd-harness.env"

# Multi-agent memory
for f in CLAUDE.md AGENTS.md; do
  if [[ -e "$DEST/$f" ]]; then ok "$f present"
  else warn "missing $f (pointer to docs/base-standards.md)"; fi
done

# Skills / agents
[[ -d "$DEST/ai-specs/skills" ]] && ok "ai-specs/skills" || fail "missing ai-specs/skills"
[[ -d "$DEST/ai-specs/agents" ]] && ok "ai-specs/agents" || fail "missing ai-specs/agents"
SKILL_N=$(find "$DEST/ai-specs/skills" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')
ok "canonical skills: $SKILL_N"

# Sync health: is .claude/skills a symlink or a copy?
if [[ -L "$DEST/.claude/skills/enrich-us" ]] || [[ -L "$DEST/.claude/skills" ]]; then
  ok "sync: symlinks detected in .claude/skills"
elif [[ -d "$DEST/.claude/skills" ]]; then
  warn "sync: COPY mode (no symlinks). Edit only ai-specs/ and run sync-artifacts after changes"
else
  fail "missing .claude/skills — run bash .claude/sync-artifacts.sh"
fi

# Hooks
HOOKS=(session-context block-secrets block-secret-reads block-dangerous-bash docs-gate protect-specs-and-tests spec-audit-gate post-edit-quality validate-tasks verify-tests autonomous-merge-gate log-permission-denied lib)
for h in "${HOOKS[@]}"; do
  if [[ -f "$DEST/.claude/hooks/${h}.sh" ]]; then ok "hook $h"
  else fail "missing hook ${h}.sh"; fi
done
[[ -f "$DEST/.claude/hooks/invoke.cjs" ]] && ok "hook invoke.cjs" || fail "missing hook invoke.cjs"
[[ -f "$DEST/.claude/settings.json" ]] && ok "settings.json" || fail "missing .claude/settings.json"
if [[ -f "$DEST/.claude/settings.json" ]] && grep -q 'block-secret-reads' "$DEST/.claude/settings.json"; then
  ok "settings registers block-secret-reads"
else
  warn "settings.json does not reference block-secret-reads (old kit?)"
fi
if [[ -f "$DEST/.claude/settings.json" ]] && grep -q 'invoke.cjs' "$DEST/.claude/settings.json"; then
  ok "settings launches hooks via invoke.cjs"
else
  warn "settings.json does not use invoke.cjs (on Windows bash may be WSL)"
fi

# Tooling
command -v jq >/dev/null && ok "jq installed" || warn "jq NOT installed — the hooks disable themselves"
command -v bash >/dev/null && ok "bash available" || fail "bash not available"
command -v git >/dev/null && ok "git available" || warn "git not available"
command -v openspec >/dev/null && ok "openspec CLI" || warn "openspec is not on PATH (npm i -g @fission-ai/openspec)"

# OpenSpec
if [[ -d "$DEST/openspec" ]]; then ok "openspec/ present"
else warn "openspec/ not initialized — run: openspec init"; fi
if [[ -f "$DEST/openspec/config.yaml" ]] || [[ -f "$DEST/openspec/config.yml" ]]; then
  ok "openspec config present"
else
  warn "missing openspec/config.yaml — use ai-specs/templates/openspec/config.yaml.tpl as a guide"
fi

# MCP (recommended, non-blocking)
if [[ -f "$DEST/.mcp.json" ]]; then
  ok ".mcp.json (Claude Code)"
  grep -q '"context7"' "$DEST/.mcp.json" && ok "MCP context7 in .mcp.json" || warn ".mcp.json does not declare context7"
  if grep -q '"playwright"' "$DEST/.mcp.json"; then
    ok "MCP playwright in .mcp.json"
  else
    warn "MCP playwright not in .mcp.json (normal with --no-frontend)"
  fi
else
  warn "missing .mcp.json — the kit installer copies it; without it Context7/Playwright do not load in Claude Code"
fi
if [[ -f "$DEST/.cursor/mcp.json" ]]; then
  ok ".cursor/mcp.json (Cursor)"
  grep -q '"context7"' "$DEST/.cursor/mcp.json" && ok "MCP context7 in .cursor/mcp.json" || warn ".cursor/mcp.json does not declare context7"
else
  warn "missing .cursor/mcp.json — the kit installer copies it; without it Context7/Playwright do not load in Cursor"
fi

# BRANCH_PREFIX
if [[ -f "$DEST/.claude/sdd-harness.env" ]]; then
  if grep -q '^BRANCH_PREFIX=' "$DEST/.claude/sdd-harness.env"; then ok "BRANCH_PREFIX defined"
  else warn "BRANCH_PREFIX is not in sdd-harness.env (validate-tasks will not be able to enforce it)"; fi
  # Comments are skipped by the safe loader, so only assignment lines count.
  if grep -vE '^[[:space:]]*#' "$DEST/.claude/sdd-harness.env" | grep -qE '\$\(|`'; then
    fail "sdd-harness.env contains command substitution — the safe loader ignores it; clean up the file"
  fi
fi

# Regression H1: the kit contract must be readable by the agent. If is_secret_path
# caught it, block-secret-reads would deny the Read and subagents could not read commands/paths.
if [[ -f "$DEST/.claude/hooks/lib.sh" ]]; then
  if grep -q 'sdd-harness\.env) return 1' "$DEST/.claude/hooks/lib.sh"; then
    ok "is_secret_path exempts .claude/sdd-harness.env (subagents can read the contract)"
  else
    fail "is_secret_path does NOT exempt .claude/sdd-harness.env: block-secret-reads will treat it as a secret and subagents will not be able to read the contract. Update lib.sh."
  fi
fi

# Autonomous preflight (openspec change autonomous-run-switch, design D13). Read-only.
env_value() { # the value of KEY in sdd-harness.env, quotes stripped; empty when absent
  local f="$DEST/.claude/sdd-harness.env"
  [[ -f "$f" ]] || return 0
  grep -E "^$1=" "$f" | tail -n 1 | sed -E "s/^$1=//; s/^\"(.*)\"\$/\\1/; s/^'(.*)'\$/\\1/" | tr -d '\r'
}

if [[ "$AUTONOMOUS" == "1" ]]; then
  printf '\nAutonomous run preflight\n\n'
  SETTINGS="$DEST/.claude/settings.json"
  BASE="$(env_value AUTONOMOUS_MERGE_BASE)"

  # Switch and configuration
  [[ "$(env_value KIT_AUTONOMOUS_RUN)" == "1" ]] && ok 'KIT_AUTONOMOUS_RUN="1"' \
    || fail 'KIT_AUTONOMOUS_RUN is not "1" in .claude/sdd-harness.env (the author sets it by hand)'
  [[ -n "$BASE" ]] && ok "AUTONOMOUS_MERGE_BASE=$BASE" || fail "AUTONOMOUS_MERGE_BASE is empty: the merge gate denies every merge"
  for key in KIT_SPEC_AUDIT_GATE KIT_PROTECT_SPECS; do
    if [[ "$(env_value "$key")" == "0" ]]; then warn "$key=\"0\": unattended mode applies its rules anyway"; fi
  done

  # Tools
  HAVE_JQ=0
  if command -v jq >/dev/null; then HAVE_JQ=1; ok "jq installed"
  else fail "jq NOT installed: in an unattended run every guarded hook denies"; fi
  ok "bash found ($BASH)"

  # Ask rules (they force a prompt even in auto mode)
  ask_rules() { # file → FAIL per permissions.ask rule
    local file="$1" rules
    [[ -f "$file" && "$HAVE_JQ" == "1" ]] || return 0
    rules="$(jq -r '(.permissions.ask // [])[]' "$file" 2>/dev/null | tr -d '\r')"
    if [[ -n "$rules" ]]; then
      while IFS= read -r rule; do fail "permissions.ask rule $rule in $file: it waits for a human"; done <<<"$rules"
    else
      ok "no permissions.ask in $file"
    fi
  }
  if [[ -z "$CONFIG_DIR" ]]; then
    fail "no autonomous profile: pass --config-dir or set CLAUDE_CONFIG_DIR"
  elif [[ ! -d "$CONFIG_DIR" ]]; then
    fail "autonomous profile $CONFIG_DIR (CLAUDE_CONFIG_DIR) does not exist"
  else
    ok "autonomous profile $CONFIG_DIR"
    ask_rules "$CONFIG_DIR/settings.json"
  fi
  ask_rules "$SETTINGS"
  ask_rules "$DEST/.claude/settings.local.json"

  # Secret allowlist: too wide when it matches the canonical token sample (D10)
  ALLOW="$(env_value KIT_SECRET_ALLOWLIST)"
  if [[ -n "$ALLOW" ]] && printf 'ghp_%s' "$(printf 'a%.0s' {1..36})" | awk -v re="$ALLOW" '{ exit (match($0, re) ? 0 : 1) }' 2>/dev/null; then
    warn "KIT_SECRET_ALLOWLIST matches a GitHub token sample: block-secrets ignores it"
  fi

  # Merge authorisation in the profile's effective auto-mode configuration
  if [[ -n "$CONFIG_DIR" && -n "$BASE" ]] && command -v claude >/dev/null; then
    AUTO="$(CLAUDE_CONFIG_DIR="$CONFIG_DIR" claude auto-mode config 2>/dev/null || true)"
    if grep -q 'gh pr merge' <<<"$AUTO" && grep -qF "$BASE" <<<"$AUTO"; then
      ok "auto-mode merge authorisation names $BASE"
    else
      fail "no auto-mode merge authorisation for $BASE in the profile (see ai-specs/templates/autonomous/)"
    fi
  else
    fail "cannot read the auto-mode merge authorisation (needs the profile, AUTONOMOUS_MERGE_BASE and the claude CLI)"
  fi

  # Hooks
  for h in block-secret-reads block-secrets autonomous-merge-gate log-permission-denied; do
    if [[ -f "$SETTINGS" ]] && grep -q "$h" "$SETTINGS"; then ok "settings registers $h"
    else fail "settings.json does not register $h"; fi
  done
  if [[ -f "$SETTINGS" ]] && grep -qF '"Read(.env)"' "$SETTINGS"; then ok "settings denies reading .env"
  else fail "settings.json has no Read(.env) deny rule"; fi
  registered_hooks() { grep -oE '\.claude/hooks/[A-Za-z0-9_.-]+\.(sh|mjs|cjs)' "$1" | sort -u; }
  if [[ -f "$SETTINGS" ]]; then
    while IFS= read -r h; do
      if [[ -n "$h" && ! -f "$DEST/$h" ]]; then fail "settings.json registers $h, which does not exist"; fi
    done < <(registered_hooks "$SETTINGS")
  fi
  for m in vet-package.mjs shell-words.mjs; do
    [[ -f "$DEST/.claude/hooks/$m" ]] && ok "hook helper $m" || fail "missing .claude/hooks/$m"
  done
  if [[ -f "$DEST/.cursor/hooks.json" ]]; then
    ok ".cursor/hooks.json"
    while IFS= read -r h; do
      if [[ -n "$h" && ! -f "$DEST/$h" ]]; then fail ".cursor/hooks.json runs $h, which does not exist"; fi
    done < <(registered_hooks "$DEST/.cursor/hooks.json")
  else
    fail "missing .cursor/hooks.json: Cursor runs none of the kit hooks"
  fi

  # GitHub
  if command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then
    ok "gh authenticated"
    if [[ -n "$BASE" && "$HAVE_JQ" == "1" ]]; then
      RUN="$(gh run list --branch "$BASE" --limit 1 --json status,conclusion 2>/dev/null \
        | jq -r '.[0] // empty | "\(.status)/\(.conclusion)"' 2>/dev/null | tr -d '\r')"
      [[ "$RUN" == "completed/success" ]] && ok "latest CI run on $BASE succeeded" \
        || fail "latest CI run on $BASE is not completed and successful (${RUN:-none})"
      PROT="$(gh api "repos/{owner}/{repo}/branches/$BASE/protection" 2>/dev/null || true)"
      # On an error gh still prints the body: "Branch not protected", or "Not Found" when the active
      # account lacks admin access to the repository.
      PROT_ERR="$(jq -r '.message? // empty' 2>/dev/null <<<"$PROT" | tr -d '\r')"
      if [[ -n "$PROT_ERR" && "$PROT_ERR" != "Branch not protected" ]]; then
        fail "cannot read the protection of $BASE ($PROT_ERR): the active gh account needs admin access to the repository (gh auth switch)"
      elif [[ -n "$PROT" && -z "$PROT_ERR" ]] && jq -e . >/dev/null 2>&1 <<<"$PROT"; then
        jq -e '.required_pull_request_reviews != null' >/dev/null <<<"$PROT" \
          && ok "$BASE requires a pull request" || fail "$BASE is protected but does not require a pull request"
        jq -e '((.required_status_checks.contexts // []) | length) > 0' >/dev/null <<<"$PROT" \
          && ok "$BASE requires CI checks" || fail "$BASE does not require CI checks"
        jq -e '.enforce_admins.enabled == true' >/dev/null <<<"$PROT" \
          && ok "$BASE protection applies to administrators" \
          || fail "$BASE protection does not apply to administrators (enforce_admins): the owner's token bypasses it"
      else
        RULES="$(gh api "repos/{owner}/{repo}/rules/branches/$BASE" 2>/dev/null || true)"
        if [[ -n "$RULES" ]] && jq -e 'type == "array"
              and any(.[]; .type == "pull_request") and any(.[]; .type == "required_status_checks")' >/dev/null 2>&1 <<<"$RULES"; then
          ok "$BASE protected by rulesets (check in GitHub that the bypass list is empty)"
        else
          fail "$BASE is not protected on GitHub (a pull request and CI checks must be required)"
        fi
      fi
    fi
  else
    fail "gh is not installed or not authenticated (gh auth status)"
  fi

  # Local services (warnings only)
  if command -v docker >/dev/null && docker compose ps >/dev/null 2>&1; then ok "docker compose reachable"
  else warn "docker compose not reachable: tests that need the local database will fail"; fi
fi

printf '\nSummary: %s failures, %s warnings\n' "$FAILS" "$WARNS"
if [[ "$FAILS" -gt 0 ]]; then exit 1; fi
exit 0
