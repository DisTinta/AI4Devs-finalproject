# Test and State Verification Report

- Date: 2026-09-28
- Change: schema-history-claims
- Step: 7 — Backend: Run Tests and Verify Data State

All commands ran with `DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind` against the
local `docker compose` Postgres (`pgvector/pgvector:pg16`, healthy), on branch
`feature/DIS-12-schema-history-claims`.

## Commands executed

- Baseline / post-state: a `pg` script listing `pgmigrations` rows, tables in `public`, row counts
  of the ten tables and the databases on the server
- `npx vitest run tests/integration/store` (targeted)
- `npx vitest run` (required suite)
- `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- `npm run db:migrate && npm run db:rollback && npm run db:migrate` (the CI migration step)
- Before this step (tasks 5.5–5.6): `npm run db:rollback` on the shared DB so `0002` was pending,
  then `npx vitest run tests/integration/store` three times in a row

## Test results

- Targeted tests: 65 passed, 0 failed, 0 skipped (3 files: `migrations.spec.ts` 14,
  `graph-schema-constraints.spec.ts` 24, `history-claims-constraints.spec.ts` 27)
- Required suite: 65 passed, 0 failed, 0 skipped (the store files are the only test files today)
- Runtime: ~39 s per run
- Gates: lint exit 0 (4 warnings, `no-empty-interface` in `packages/core/src/ports/*`), typecheck
  exit 0, lint:architecture exit 0 (8 `no-orphans` warnings in the stub analyzer/adapter packages),
  docs:coverage exit 0. The same warnings appear on the base commit with this change stashed: none
  comes from this change.
- CI migration step: exit 0 (`No migrations to run!` → `0002_history-claims (DOWN)` →
  `0002_history-claims (UP)`): rollback reverts only `0002`.
- Scenario coverage: each of the 34 `#### Scenario:` titles of the delta spec matches exactly one
  test title.
- Notes:
  - **Flakiness found and fixed (task 5.5).** With two files migrating the shared DB in parallel,
    one `beforeAll` failed per run with `Another migration is already running. Advisory lock mode
    is set to 'fail'.` node-pg-migrate 9's default lock mode is `'fail'`, not `'wait'` as
    `design.md` D4 had assumed. Fixed with the test-only `migrateSharedDatabase()` retry helper
    (author decision, D4 corrected). Afterwards: 3 × 65/65, the first run with `0002` pending, so
    one file really applied it while the other retried.
  - **Forced failure, task 2.3.** Without `fact_only_from_l1` in the up section,
    "Fact from the inferred layer is rejected" failed with
    `promise resolved "'<uuid>'" instead of rejecting`. Constraint restored, file re-applied:
    16/16 at that point.
  - **Forced failure, task 5.4.** With `count: Infinity` on down in `migrate.ts`,
    "Roll back only the latest migration" failed with
    `expected [] to deeply equal [ 'edge', 'file', 'project', 'symbol' ]`. Restored `count: 1`;
    `git diff` of `migrate.ts` empty.
- End-to-end testing (step 9): not applicable. The change adds no user interface and no user
  workflow; the only interfaces are the `db:*` scripts, exercised in step 8.

## Data state verification

- Pre-test baseline:
  - `pgmigrations`: `0001_graph-l1`, `0002_history-claims`
  - Tables in `public`: `cache_entry`, `claim`, `commit`, `edge`, `evidence`, `file`,
    `file_commit`, `pgmigrations`, `project`, `query_log`, `symbol`
  - Row counts of the ten schema tables: all 0
  - Databases: `codemind`, `postgres`, `template0`, `template1` (no throwaway DB)
- Post-test validation:
  - Byte-identical to the baseline (same migrations, tables, zero rows, no leftover
    `codemind_migrations_*` database)
- State restored: Yes (nothing to restore)
- Restoration actions: none

## UI evidence (if applicable)

- (none: the change has no browser UI)

## Outcome

- Status: PASS
- Blocking issues: none
