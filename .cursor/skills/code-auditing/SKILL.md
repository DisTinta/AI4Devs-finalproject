---
name: code-auditing
description: Use when asked to audit the codebase, find dead code, assess technical debt, or review quality beyond a single diff. Produces a prioritised report over a whole module or project.
author: sdd-harness-kit
version: 1.0.0
argument-hint: [path or module to audit]
context: fork
agent: Explore
allowed-tools: Read Grep Glob Bash(grep *) Bash(git *)
effort: high
---

## Project configuration
!`grep -vE '^\s*#|^\s*$' .claude/sdd-harness.env`

## Instructions

Audit `$ARGUMENTS`. If empty, audit the business layer declared in `PATH_BUSINESS`.

**Always verify a finding in the code before reporting it.** A tool's output is a hypothesis, not a
finding.

### Phase 1 — Map

List the modules in scope, their size, and their inbound dependencies. Anything nothing depends on is a
candidate for phase 4.

### Phase 2 — Layer compliance

Check the architecture rules from `docs/backend-standards.md` mechanically, file by file. Report each
violation with its path.

### Phase 3 — Duplication and drift

- The same logic implemented more than once, and whether the copies have already diverged.
- Two names for the same concept, which is how a domain model rots.
- Validation repeated instead of centralised.

### Phase 4 — Dead code

For each candidate: is it referenced anywhere, including tests, configuration and strings? Check the
history — code added and never called since is different from code that lost its last caller last month.
Report with the evidence that it is unreachable, never on suspicion alone.

### Phase 5 — Test quality

- Modules with no tests at all.
- Tests that assert nothing meaningful, or that would pass against a broken implementation.
- Tests coupled to implementation details, which are the first to break on any refactor.

### Phase 6 — Report

```
## Audit: <scope>

### Summary
<three sentences: overall state, the single biggest risk, the cheapest high-value fix>

### Findings
| Priority | Area | Finding | Evidence | Suggested action |
|---|---|---|---|---|

Priority is one of: Critical, High, Medium, Low, Quick Win.

### Quick wins
<changes worth less than an hour each, listed so they can be done today>

### Not assessed
<what you could not check, and why>
```

Do not modify any file. Do not open a change. The output is the report.
