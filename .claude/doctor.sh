#!/usr/bin/env bash
# doctor.sh — checks that the SDD Harness Kit is healthy in the target project.
# Usage (from the root of the ALREADY installed project):
#   bash .claude/../  → better: copy/run from the kit:
#   /path/to/kit/doctor.sh --dest .
#   ./doctor.sh                 # if you are in the project and doctor is on PATH via the kit
set -euo pipefail

DEST="${1:-.}"
if [[ "${1:-}" == "--dest" ]]; then DEST="${2:?}"; fi
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
HOOKS=(session-context block-secrets block-secret-reads block-dangerous-bash docs-gate protect-specs-and-tests post-edit-quality validate-tasks verify-tests lib)
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
  if grep -qE '\$\(|`' "$DEST/.claude/sdd-harness.env"; then
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

printf '\nSummary: %s failures, %s warnings\n' "$FAILS" "$WARNS"
if [[ "$FAILS" -gt 0 ]]; then exit 1; fi
exit 0
