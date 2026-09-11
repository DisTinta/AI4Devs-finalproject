---
name: sync-agent-artifacts
description: Use after creating, renaming or moving a skill or agent in ai-specs, or when a skill does not appear in the slash menu, or when the user asks to sync agent artifacts. Rebuilds the references from .claude and .cursor to the canonical source.
author: sdd-harness-kit
version: 1.1.0
allowed-tools: Read Glob Bash(ls *) Bash(bash .claude/sync-artifacts.sh*) Bash(git status *)
---

## Canonical source
!`ls -1 ai-specs/skills 2>/dev/null`
!`ls -1 ai-specs/agents 2>/dev/null`

## Current references
!`ls -la .claude/skills`

## Instructions

`ai-specs/` is the canonical source. `.claude/skills`, `.claude/agents`, `.cursor/skills` and
`.cursor/agents` reference it — as symlinks where the platform allows, as synchronised copies where it
does not (Windows without developer mode).

**Analyse before changing anything.**

### Step 1 — Diagnose

For each entry under `ai-specs/skills` and `ai-specs/agents`, determine what exists at each of the four
reference paths:

| State | Meaning |
|---|---|
| Working symlink | Correct, nothing to do |
| Broken symlink | Target moved or renamed |
| Text file containing a relative path | A symlink was checked out on a platform without symlink support. **This is why skills do not load on Windows** |
| Real copy, identical to the source | Correct in copy mode |
| Real copy, different from the source | Drift: someone edited the copy instead of the canonical file |
| Missing | Never linked |
| Present in the references, name matches `openspec-*`, absent from `ai-specs` | **KEEP:** native OpenSpec skill from `openspec init` (`/opsx:*`). Not kit-owned. Leave it. |
| Present in the references, any other name, absent from `ai-specs` | Orphan: the kit source was deleted or renamed. The human decides whether to delete. |

Report the table before acting. Sync labels these `KEEP` and `ORPHAN` / `HUÉRFANO`; `KEEP` is not a
failure.

### Step 2 — Report conflicts, do not resolve them silently

If you find a **real copy that differs from the source**, stop and show the difference. Someone's work
lives in that file. The human decides which version wins — moving the edit into `ai-specs` is usually
right, but that is not your call.

### Step 3 — Apply the minimal safe fix

Run `bash .claude/sync-artifacts.sh` (or `.claude/sync-artifacts.ps1` on Windows). It is idempotent: it
recreates missing references, repairs broken ones, and refreshes copies that are stale relative to the
source. It does **not** delete `KEEP` or `ORPHAN` entries.

### Step 4 — Verify

Re-list the references and confirm every canonical artifact resolves from both tool directories. Report
what changed and any remaining blocker. `KEEP` lines after `openspec init` are healthy.

## Red flags

**Never:**
- Delete a real directory containing work that is not in `ai-specs`
- Delete `openspec-*` skills that are not in `ai-specs` — they are OpenSpec's `/opsx:*` commands, not leftover kit copies
- Treat a `KEEP` line as an orphan to clean up
- Overwrite a divergent copy without showing the difference first
- Create a reference to a target that does not exist
- Leave a rename half-applied: the source moved and the references still point at the old name

**Always:**
- Diagnose the full picture before the first mutation
- Treat `ai-specs` as the single source of truth **for kit artifacts**; OpenSpec owns `openspec-*` guests
- Leave the tree in a state where every skill loads in both tools
- Report what you could not fix, and exactly what is needed to fix it
