---
name: update-docs
description: Use before any commit or push, and when the user asks to document a change or asks which documentation is now stale. Finds and updates the documentation the change invalidated.
author: sdd-harness-kit
version: 1.0.0
allowed-tools: Read Grep Glob Edit Write Bash(git diff *) Bash(git status *)
---

## Changed files
!`git diff HEAD --name-only`

## Instructions

Follow `docs/documentation-standards.md`.

### Step 1 — Identify what the change invalidated

Read the diff and map it to documentation:

| If the change touched | Then update |
|---|---|
| The data model or a migration | The data model document |
| A public contract or endpoint | The API specification — regenerate it, do not hand-edit |
| Dependencies, installation or setup | The relevant standards file and the project context |
| A non-obvious behaviour or a new trap | The gotchas section of `docs/project-context.md` |
| A non-trivial, hard-to-reverse decision | An ADR (use the `adr-new` skill, which will also tell you if it is not warranted) |
| A convention the team now follows | The corresponding standards file |

### Step 2 — Apply the generation rule

**What can be generated must be generated.** If the API specification comes from the code, regenerate it
rather than editing it: a hand-edited generated file has a desynchronisation window, and that window is
where an agent reads something false and produces confident, broken code.

Only hand-write what cannot be generated: the *why*.

### Step 3 — Verify, do not assume

Documentation must describe the **real behaviour**, not the code's intent. Where they might differ, run
the thing and check. Code can have bugs; documentation that faithfully describes a bug is still wrong.

### Step 4 — Report

List which files you updated and what changed in each. If you concluded nothing needed updating, say so
explicitly and name what you checked — that is a finding, not an absence of work.

All documentation is written in English, including code comments.
