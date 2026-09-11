---
name: tdd-refactor
description: Use after tdd-green, or when the user says "now refactor", "clean this up" or "improve the design". Improves design with the suite green, without changing behaviour and without touching the tests.
author: sdd-harness-kit
version: 1.0.0
argument-hint: [file or module to refactor]
allowed-tools: Read Grep Glob Edit Bash(grep *)
effort: high
---

## Project configuration
!`grep -vE '^\s*#|^\s*$' .claude/sdd-harness.env`

## Instructions

We are in the REFACTOR phase. **The suite must be green before you start.** Run it and confirm. If
anything is red there is nothing to refactor: there is something to fix, and that is a different job.

Read `docs/backend-standards.md` before deciding what "better" means here. Better means closer to this
project's conventions, not closer to your preferences.

### Procedure

1. Run the suite. Confirm green.
2. Read `$ARGUMENTS` (or the files just changed) and produce a short ordered list of candidate
   refactors, with the reason for each. Show it before touching anything.
3. Apply **one refactor at a time**, running the suite after each.
4. Leave static analysis and the linter clean.
5. Report what you changed, what you deliberately left alone, and why.

### What is worth refactoring, in order

1. Layer violations: logic in the wrong layer, transport leaking into the business layer.
2. Duplication that has already diverged — note which copy is correct before merging them.
3. Names that lie, because the code moved on and the name did not.
4. A function you cannot name without using "and".
5. A domain concept passed around as a raw string, so nothing can validate it.
6. Code that cannot be tested without touching the outside world.

Do not refactor for symmetry or because a file is long. A long file is not a problem; a file with two
reasons to change is.

## Prohibitions

- **Observable behaviour must not change.** Same contracts, same responses, same side effects.
- **Do not touch the tests. Not one.** If a refactor needs a test changed, the behaviour changed and it
  is not a refactor: stop and report it. This is the rule that makes the phase safe.
- Coverage must not drop.
- Do not mix in feature work or a bug fix, even a one-line one you spotted on the way. Report it: a
  refactor commit that also fixes a bug cannot be reverted cleanly.
- Do not add dependencies. Do not rename anything public without flagging it as a contract change.
- If the code is clean enough, **say so and change nothing.** Churn on a green suite is pure risk.
