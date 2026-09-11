---
name: pr-describe
description: Use when asked to write the pull request description or prepare the PR. Produces every section except the business rationale, which it deliberately leaves for the human.
author: sdd-harness-kit
version: 1.0.0
allowed-tools: Read Grep Glob Bash(git *)
---

## Branch commits
!`git log origin/main..HEAD --oneline`

## Changed files
!`git diff origin/main...HEAD --name-only`

## Instructions

Write the description following `.github/pull_request_template.md`.

### What changes?
One to three sentences, derived from the diff and the commits.

### Why?
Leave literally this line and **do not fill it in**:

    <!-- filled in by the human: the business rationale is not yours to generate -->

### How to test it?
Numbered steps, runnable exactly as written, with this project's real commands.

### Traceability
Table `Scenario in the specification → file:line of the test that covers it`. No empty rows. If a
scenario has no test, that is a finding: report it instead of leaving the row blank.

### Decisions / trade-offs
Only if you can ground them in `design.md` or an existing ADR. If you cannot, omit the section. Do not
invent justifications.

### Origin
Suggest the label: `human`, `human+copilot`, `agent` or `agent+human-review`. This exists to measure
quality by origin, not to assign blame.

## Rules

- Do not push and do not open the pull request: deliver the text.
- The "Why?" section is delivered empty and marked. If you fill it in, the output is invalid.
