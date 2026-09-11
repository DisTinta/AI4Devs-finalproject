---
name: openspec-implement
description: Use when the user says "implement the change", refers to openspec/changes/, or names a change id. Walks an OpenSpec change task by task in TDD, enforcing the mandatory verification steps and the traceability between scenarios and tests.
author: sdd-harness-kit
version: 1.0.0
argument-hint: [change-id]
allowed-tools: Read Grep Glob Edit Write Bash(grep *) Bash(ls *) Bash(git status *) Bash(git diff *) Bash(git checkout *) Bash(git branch *) mcp__context7__resolve-library-id mcp__context7__query-docs
effort: high
---

## Project configuration
!`grep -vE '^\s*#|^\s*$' .claude/sdd-harness.env`

## Active changes
!`ls -1 openspec/changes`

Ignore the `archive` directory if present.

## Repository state
- Branch: !`git branch --show-current`
- Uncommitted: !`git status --short`

## Instructions

You are implementing change `$ARGUMENTS`. If the argument is empty and exactly one change is active,
use it. If several are active, ask which one.

### Step 1 — Read the whole proposal

Read ALL of these, in this order, without exception:

1. `openspec/changes/$ARGUMENTS/proposal.md` — the why and the scope
2. `openspec/changes/$ARGUMENTS/design.md` — the technical decisions already made
3. `openspec/changes/$ARGUMENTS/specs/**/*.md` — requirements and scenarios. This is the contract
4. `openspec/changes/$ARGUMENTS/tasks.md` — the checklist to execute

Then read `docs/base-standards.md`, `docs/project-context.md`, `docs/backend-standards.md` and
`docs/openspec-tasks-mandatory-steps.md`.

### Step 2 — Verify the task list is compliant

Before writing any code, check `tasks.md` against the checklist in
`docs/openspec-tasks-mandatory-steps.md`. In particular: Step 0 creates the feature branch, the
mandatory verification steps are present and labelled, and mutating operations include state
restoration. If the list is not compliant, fix the list first and say so.

### Step 3 — Map scenarios to tests

Produce this table before writing code:

| Requirement | Scenario | Test file | Test name |
|---|---|---|---|

Every `#### Scenario:` in the delta spec gets exactly one row. If a scenario cannot be translated into
a verifiable test, **stop and ask**: the specification has a hole, and implementing over a hole is how
unreviewed behaviour reaches production.

### Step 4 — Execute task by task, in TDD

For each task in `tasks.md`, in order:

1. **Red** — write the test and run it with the project's filter command. Confirm it fails, and that it
   fails for the right reason. A test failing on a syntax error measures nothing. For a complex task,
   delegate to the `tdd-test-writer` subagent.
2. **Green** — implement the minimum, following the layer order. Subagent: `tdd-implementer`.
   When the code calls a library or framework API that is not defined in this repository, query
   Context7 for the current docs first. Do not invent APIs. Do not wait for the user to type
   "use context7".
3. **Refactor** — only with the suite green, and without touching a single test. Subagent:
   `tdd-refactorer`. The three phases run in separate contexts on purpose: the reasoning that produced
   the test must not colour the implementation, and the shortcuts taken to reach green must not colour
   the design pass.
4. Leave static analysis and the linter clean.
5. Mark the task `- [x]`.

### Step 5 — Execute the verification steps yourself

The mandatory verification steps are not documentation: they are work. Run them. Exercise every
interface the change touches, restore any state you mutated, and write the report under
`openspec/changes/$ARGUMENTS/reports/`. Never ask the user to run them for you.

### Step 6 — Close

Run the full suite. Report the final traceability table with the state of each scenario, the files
created or modified, and any deviation from `design.md`.

## Prohibitions

- **Do not freelance a spec change.** If mid-implementation you find the design was wrong or the
  scope needs to move, do not patch code around a stale spec and do not silently rewrite the spec to
  match what you already built. **Stop, say what changed and why, and update `proposal.md`,
  `design.md` or `specs/**/*.md` first** — this is Rule 7 of `docs/base-standards.md`, and it is the
  same thing native OpenSpec's `/opsx:apply` does when it "fixes the artifact, then continues". Only
  after the artifact reflects the new reality do you resume coding.
- Outside of that case, the files you touch under `openspec/` are `tasks.md` (marking tasks `[x]`) and
  `reports/` (the mandatory verification reports). Specs are input to be followed, not a target to be
  reverse-engineered from the code.
- **NEVER modify an existing test to make the suite pass.**
- If you need to deviate from `specs/` or `design.md` for a reason other than the above, **stop and
  ask**. Do not improvise architecture.
- Do not add dependencies without asking.
- Do not commit or push. That is the human's decision.
