---
name: architecture-audit
description: Use when asked to audit domain design, hexagonal boundaries, SOLID/CUPID, or to choose a Fowler refactor mode before a large change. Read-only architecture report; does not implement.
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

Audit the architecture of `$ARGUMENTS`. If empty, audit `PATH_BUSINESS` (and the nearest transport /
persistence adapters it touches).

Read `docs/backend-standards.md` and `docs/base-standards.md` first. This project's layer rules outrank
generic advice. **Verify every finding in the code.** Do not implement refactors in this skill.

### Phase 1 — Change mode (Fowler / blast radius)

If the user described a change, classify the operating mode and say why:

| Mode | When |
|---|---|
| Manual IDE | One file, blast radius you can hold in your head |
| HITL assisted | Small multi-hunk edit; human reviews each step |
| Agentic | Multi-file mechanical refactor **with** tests as the success criterion |

State whether the change is safe to delegate yet (tests exist, public contracts stable, success
criterion articulable). If not, say what must happen first.

### Phase 2 — Domain (DDD signal)

- Which types look **rich** (behaviour with the data) vs **anaemic** (data bags + giant services)?
- Ubiquitous language drift: two names for one concept, or one name for two.
- Aggregates / transaction boundaries that leak across modules.

### Phase 3 — Boundaries (ports and adapters)

- Places where the domain or business layer depends directly on the HTTP framework, ORM, or a vendor
  SDK.
- For each, name the port that should exist and where the adapter would live per `LAYER_ORDER` /
  backend-standards.
- Controllers / routes that talk to persistence without going through the business layer.

### Phase 4 — SOLID and CUPID (agent-hostile first)

Prioritise violations that make the next agent turn worse:

- God classes / files with multiple reasons to change
- Premature DRY that merged different business rules
- Unpredictable side effects in "simple" helpers
- Non-idiomatic patterns for this stack
- Interfaces that lie about their real dependencies

### Output

```
## Architecture audit

### Scope
...

### Change mode recommendation
...

### Findings
| Severity | File:line | Axis (DDD / Boundary / SOLID-CUPID) | Finding | Why it confuses an agent |

Severity: Blocker, Major, Minor, Question.

### Suggested next steps (no implementation)
1. ...
```

## Guardrails

- Do not write or edit production code in this turn.
- Do not praise to balance criticism.
- If the module is too large, narrow to the worst three findings and say what you skipped.
