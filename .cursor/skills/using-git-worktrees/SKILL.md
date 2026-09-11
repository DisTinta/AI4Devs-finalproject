---
name: using-git-worktrees
description: Use when work must happen in isolation from the current checkout — a parallel change, a risky experiment, or several agents working at once — or when the user mentions worktrees.
author: sdd-harness-kit
version: 1.0.0
argument-hint: [branch or change name]
allowed-tools: Read Glob Bash(git worktree *) Bash(git status *) Bash(git branch *) Bash(ls *)
---

## Current state
- Branch: !`git branch --show-current`
- Uncommitted: !`git status --short`
- Existing worktrees: !`git worktree list`

## Instructions

A worktree is a second checkout of the same repository on a different branch. Two agents in two
worktrees do not overwrite each other. Two agents in one checkout do.

### Step 0 — Detect before creating

Check whether a worktree already exists for this branch. If it does, use it. Creating a second one for
the same branch is not possible and the error is confusing.

### Step 1 — Ask for consent

Creating a worktree adds a directory and consumes disk. **Ask before creating it**, stating where it
will go and how much it will roughly cost.

### Step 2 — Create

```bash
git worktree add .worktrees/<name> -b <branch>
```

Convention: all worktrees under `.worktrees/`, which must be in `.gitignore`. One directory per branch,
named after the branch.

### Step 3 — Set it up

A fresh worktree has no dependencies installed and no local environment file. Before working in it:
install dependencies, copy the environment file if the project needs one, and run the migrations if it
has its own database. Report what you did, because the next agent will need the same.

### Step 4 — Work

Everything in the worktree is normal git. The only rule that changes: **do not switch branches inside a
worktree.** One worktree, one branch. Switching defeats the purpose and confuses every other agent.

### Step 5 — Clean up

Before removing anything, verify there is no unsaved work:

```bash
git -C .worktrees/<name> status --porcelain
```

If that returns anything, **stop and report it**. Then:

```bash
git worktree remove .worktrees/<name>
git branch -d <branch>
```

Use `-d`, not `-D`. If `-d` refuses, the branch has unmerged commits and you were about to destroy them.

## Red flags

**Never:**
- Remove a worktree with uncommitted changes
- Use `git branch -D` to force past a refusal
- Switch branches inside a worktree
- Create a worktree without consent
- Retry a failed removal destructively

**Always:**
- Check `git status --porcelain` before any removal
- Keep worktrees under a single ignored directory
- Report the setup steps you ran, so they can be repeated
- Leave `git worktree list` consistent with what is on disk
