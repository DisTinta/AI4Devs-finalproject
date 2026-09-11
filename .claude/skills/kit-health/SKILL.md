---
name: kit-health
description: Use when the user asks to check kit health, run the doctor, diagnose broken hooks/skills, missing OpenSpec, empty project-context, sync drift, jq issues, or BRANCH_PREFIX problems; or when skills do not appear in the slash menu after install. Runs the kit doctor and reports cracks with fixes.
author: sdd-harness-kit
version: 1.1.0
argument-hint: [optional path to the project root]
allowed-tools: Read Grep Glob Bash(*)
---

## Project configuration
!`grep -vE '^\s*#|^\s*$' .claude/sdd-harness.env`

## Instructions

Diagnose the SDD Harness Kit installation in `$ARGUMENTS` or the current repo root. **Read-only by
default:** report cracks and the exact fix command; only mutate if the user asks you to repair.

### Step 1 — Run the doctor

Prefer the packaged doctor (idempotent, machine-readable):

```bash
# from the project root (after kit install)
bash .claude/doctor.sh
# Windows PowerShell alternative, if present:
# pwsh -File .claude/doctor.ps1
```

If `.claude/doctor.sh` is missing, look for `doctor.sh` / `scripts/doctor.sh` at the repo root, or
re-run install from the kit so the doctor is copied. **If no doctor script exists**, perform Step 2
manually and state that the doctor binary/script is absent (itself a crack in a complete install).

Capture exit code and full output. Do not summarise away failed checks.

### Step 2 — Crack catalogue (verify each)

Whether the doctor ran or not, ensure the report covers these cracks:

| Crack | How to detect | Typical fix |
|---|---|---|
| **jq missing** | `command -v jq` fails; hooks no-op | Install jq (`winget install jqlang.jq` on Windows; apt/brew elsewhere). Hooks degrade safely but guards are off. |
| **Hooks not executable / no bash** | `.claude/hooks/*.sh` present but bash missing (Windows without Git Bash) | Install Git for Windows; run hooks via `bash`. |
| **Sync divergent** | `.claude/skills/*` is a 22-byte text stub, broken symlink, or copy that differs from `ai-specs/skills/*` | `bash .claude/sync-artifacts.sh` or `pwsh -File .claude/sync-artifacts.ps1`. Never edit only the copy. |
| **OpenSpec skills reported as KEEP** | Sync lists `openspec-*` under `.claude/skills` / `.cursor/skills` with tag `KEEP` | Healthy after `openspec init`. Not a crack. **Never delete them** — they are `/opsx:*`. |
| **True orphan (not `openspec-*`)** | Sync `ORPHAN` / `HUÉRFANO` for a name that is not `openspec-*` | Leftover kit copy or a skill edited only under `.claude/skills`. Human decides; do not auto-delete. |
| **Skills missing from slash menu** | Canonical skill in `ai-specs/skills/<name>/SKILL.md` but no reference under `.claude/skills` / `.cursor/skills` | Sync artifacts; restart the agent session. |
| **`project-context` empty / placeholders** | `docs/project-context.md` missing, or still contains `{{...}}` | Complete via human edit or prompt P0. Highest leverage crack. |
| **OpenSpec not initialised** | No `openspec/` with `changes/` / `specs/` (or init never run) | `openspec init` **after** kit install. Then apply `ai-specs/templates/openspec/config.yaml.tpl` → `openspec/config.yaml`. |
| **`openspec/config.yaml` absent / unwired** | Init done but config does not point at `docs/` + `ai-specs/` | Copy/adapt the kit template. |
| **`BRANCH_PREFIX` mismatch** | `.claude/sdd-harness.env` has `BRANCH_PREFIX` that does not match team branches; `validate-tasks` step 0 fails | Align env with real prefix (default `feature/`) and document it in `project-context`. |
| **`CMD_TEST` broken** | Command in `sdd-harness.env` fails when run manually | Fix the command; Stop hook otherwise blocks every coding turn. |
| **MCP configs missing** | No `.mcp.json` or `.cursor/mcp.json` | Re-run the kit installer. Context7 (and Playwright unless `--no-frontend`) should be declared. Doctor warns; it does not fail. |
| **MCP servers disabled in the IDE** | Config files exist but tools never appear | Enable the project MCP in Cursor / Claude Code (first-run permission). Optional: `CONTEXT7_API_KEY` in the environment, never in the JSON. |
| **Doctrina pointers broken** | `CLAUDE.md` / `AGENTS.md` do not resolve to `docs/base-standards.md` | Restore symlink or `@docs/base-standards.md` import. |
| **Doctor / kit version unknown** | No `VERSION` in kit source; project missing expected files | Re-install or sync from `sdd-harness-kit`. |

### Step 3 — Report format

```
## Kit health: <project root>

### Doctor
- Command: <ran | missing>
- Exit: <code>
- Summary: <one paragraph>

### Cracks
| Severity | Crack | Evidence | Fix |
|---|---|---|---|

Severity: Critical (kit unsafe / silent), High (major feature off), Medium, Low.

### Healthy
<checks that passed — brief list>

### Next actions (ordered)
1. <highest leverage fix>
2. …
```

### Red flags

**Never:**

- Rewrite `docs/base-standards.md` to "fix" a local preference.
- Run `/init` as a remedy (it overwrites doctrine through the memory files).
- Overwrite a divergent skill copy without showing the diff (see `/sync-agent-artifacts`).
- Delete `openspec-*` skills that are not in `ai-specs` (OpenSpec native `/opsx:*`; sync tags them `KEEP`).
- Claim PASS if jq is missing — call it degraded, not healthy.

**Always:**

- Run the doctor when present before free-form grepping.
- Separate *detection* from *repair*.
- Point Windows users at copy-mode + sync when symlinks are unavailable.
