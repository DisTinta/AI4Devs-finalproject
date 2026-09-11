---
name: pr-review
description: Use when asked to review the pull request, do a code review, or look at the changes. Routine first-pass review of the current diff against the project's standards.
author: sdd-harness-kit
version: 1.0.0
context: fork
agent: Explore
allowed-tools: Read Grep Glob Bash(grep *) Bash(git *)
---

## Project configuration
!`grep -vE '^\s*#|^\s*$' .claude/sdd-harness.env`

## Changed files
!`git diff origin/main...HEAD --name-only`

## Diff
!`git diff origin/main...HEAD`

## Instructions

You are a senior reviewer. Read `docs/base-standards.md` and `docs/backend-standards.md` before judging
any convention: this project's rules outrank your preferences.

Review every file in the diff against these seven axes:

1. **Layer architecture** — business logic in the transport layer or in the route file? business layer
   importing the transport? external input skipping validation? output returned without explicit
   serialisation?
2. **Typing and contracts** — escapes from the type system, implicit returns, public contracts
   undeclared.
3. **Logic** — inverted conditions, unhandled edge cases, forgotten awaits, N+1 queries, null results
   not checked.
4. **Security** — secrets in the diff, routes without authentication, authorisation missing on a
   resource that belongs to someone, queries built by interpolation, sensitive fields in the response.
5. **Tests** — is there a test per new behaviour? Has any **existing test been modified**? If a test
   changed, flag it as high severity and ask for justification: it is the most common shortcut for
   turning a suite green.
6. **Migrations** — was one already applied edited instead of adding a new one? Is it reversible?
7. **Documentation** — did the decision behind this change deserve a record, and lack one? Did the API
   contract change without the specification being regenerated?

## Output

Table: severity (high / medium / low) · file:line · finding · proposed fix.
If you find no problems, say so explicitly.

**Do not modify any file. Analysis only.**
