---
name: commit
description: Use when the user says "commit", "create a commit" or similar. Stages and commits the current changes as atomic conventional commits, after checking the documentation gate. Resolves the ticket id (branch, arguments, or by asking) and uses it as the conventional-commit scope.
author: sdd-harness-kit
version: 1.1.0
argument-hint: [optional TICKET-ID, and/or paths to limit the commit]
disable-model-invocation: true
allowed-tools: Bash(git add *) Bash(git commit *) Bash(git status *) Bash(git diff *) Read Grep Glob
---

## Current state
- Status: !`git status --short`
- Diff: !`git diff HEAD`
- Branch: !`git branch --show-current`

## Doctrine
`docs/base-standards.md` — Git branches and commit messages. Ticket in the commit **scope**, not
guessed.

A ticket id matches `[A-Z][A-Z0-9]+-[0-9]+` (e.g. `KAN-184`, `AI4-42`).

## Instructions

### Step 1 — Paths

In `$ARGUMENTS`, a token that matches a ticket id is **not** a path. Remaining tokens are paths: if
they are present, limit the commit to those changes. If a path argument matches nothing, **report it
and do not commit**.

### Step 2 — Documentation gate

Before committing, check whether this change invalidated any documentation
(`docs/documentation-standards.md` requires this). If it did, say so and offer to run `update-docs`
first. Do not commit a change that leaves the documentation describing a system that no longer exists.

### Step 3 — Atomicity

Inspect the changes. If the diff mixes unrelated areas, **propose separate atomic commits** with
selective staging and ask for confirmation before executing anything. A single large commit makes review
impossible, and review is the point.

### Step 4 — Ticket id (ask; do not guess)

Resolve **one** ticket id before writing the message:

1. If `$ARGUMENTS` contains a ticket-shaped token, use it.
2. Else take the first ticket-shaped token in the current branch name
   (`feature/KAN-184-filter-listing` → `KAN-184`; `feature/KAN-184` → `KAN-184`).
   **Propose it and wait for confirmation.**
3. Else **ask**: `Is there a ticket id for this commit? (e.g. KAN-184). Reply with the id, or 'none'.`
4. **Do not commit** until the human answers. Do not invent an id. A slug or a trailing number
   (`feature/filter-listing`, `feature/filter-listing-123`) is not a ticket.

### Step 5 — Message

Conventional commits: `type(scope): description`.

- Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`
- Scope: the ticket id if there is one (`feat(KAN-184): add listing filter by state`). If none, the
  capability or layer (`feat(listing): add filter by state`)
- First line: 72 characters maximum, imperative present tense (`add`, not `added`)
- **In English**, per `docs/base-standards.md` §2
- If the change needs explaining, add a body after a blank line that explains the *why*, not the what
- Do not put the ticket in the body instead of the scope. Do not use capability as scope when a
  ticket exists.

### Step 6 — Execute and confirm

`git add <paths> && git commit -m "<message>"`, then confirm the commit was created.

## Prohibitions

- **Never `git push`.** The push is the human's decision.
- Never `git push --force`, under any circumstances, even if asked in passing.
- Never `git commit --amend` on a commit that is already pushed.
- Never stage `.env` or any file matching a secret pattern, even if the user asks.
- Never invent a ticket id.
- Never commit before Step 4 is resolved.
