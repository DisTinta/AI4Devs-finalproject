---
name: migration-review
description: Use when asked to review pending migrations, check Expand-Contract safety, or before applying schema changes to a shared environment. Read-only audit of migration SQL and rollback.
author: sdd-harness-kit
version: 1.0.0
argument-hint: [migration path(s) or empty for diff vs main under PATH_MIGRATIONS]
context: fork
agent: Explore
allowed-tools: Read Grep Glob Bash(grep *) Bash(git *)
---

## Project configuration
!`grep -vE '^\s*#|^\s*$' .claude/sdd-harness.env`

## Instructions

Review pending database migrations. **Do not write or edit migrations.** Analysis only.

### Scope

1. If `$ARGUMENTS` names files or directories, review those.
2. Otherwise review new or changed files under `PATH_MIGRATIONS` versus `origin/main` (or `main` /
   `master` if that remote ref is missing).
3. Read `docs/backend-standards.md` § Persistence before judging Expand-Contract.

### Checklist (every migration in scope)

Flag each of the following when present, with severity and a safer alternative:

| Risk | What to look for |
|---|---|
| Destructive drop | `DROP COLUMN`, `DROP TABLE`, `dropColumn`, `drop`, removing an enum value still in use |
| Unique on existing data | `UNIQUE` / unique index on a column that may already contain duplicates or nulls |
| Truncating type change | `ALTER TYPE`, narrowing string/int, non-castable type swaps |
| Fake rename | Rename implemented as drop-and-add (data loss) instead of expand + backfill + contract |
| Missing rollback | No working `down` / reverse migration, or reverse that cannot restore data |
| Incomplete Expand-Contract | Contract step in the same change as Expand; readers still on the old column while it is dropped |
| Blocking DDL | Indexes or constraints on large tables without a non-blocking / concurrent strategy the stack supports |

Also note: backfill that scans the whole table without batching or `statement_timeout` awareness.

### Output

```
## Migration review

### Findings
| Severity | File | Finding | Safer alternative |
|---|---|---|---|

Severity is one of: Blocker, Major, Minor, Question.

### Expand-Contract status
For each schema change: which phase it is (Expand / Backfill / Migrate reads / Contract), and whether
a later migration is still required.

### Verdict
PASS — no Blockers and no Majors
PASS WITH GAPS — no Blockers; listed gaps must be tracked before shared deploy
FAIL — at least one Blocker
```

## Guardrails

- Cite file and line (or migration step) for every finding.
- Do not invent SQL that is not in the migration files.
- If `PATH_MIGRATIONS` is empty or the path does not exist, say so and stop.
- An empty findings table is valid; state what you checked.
