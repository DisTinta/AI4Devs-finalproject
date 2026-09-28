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

## Addendum — re-run after `/verify-against-spec` (2026-09-28)

The audit found that "Apply, roll back and apply again" had become weaker than its scenario. One
rollback now reverts only `0002`, so `0001`'s own down-then-up never took part in the identity
comparison. Changes made:

- **New test** "Apply, roll back and apply again (full cycle through 0001)"
  (`migrations.spec.ts`). It runs migrate → two rollbacks (`pgmigrations` empty) → migrate, then
  checks:
  - the second snapshot equals the first;
  - both column contracts;
  - the ten tables and all eleven enums;
  - `pgmigrations` = `0001_graph-l1, 0002_history-claims`.

  The single-rollback test stays: it covers "reverts only `0002`".
- **Forced failure.** With `DROP TYPE edge_resolution;` removed from `0001_graph-l1.down.sql`, the
  new test fails while the single-rollback test still passes: that gap was real. `0001` was
  restored with `git checkout` (`git status` clean for the file).
- **Spec and readme text only:**
  - `l2_requires_provenance` rejects SQL `NULL` only.
  - Provenance validation will be done by CM-HU-09.
  - A claim without evidence is a note for CM-HU-09/10, not a rule of this schema.

  No behaviour change.

Commands and results:

- `npx vitest run tests/integration/store` → 3 files, **66 passed**, 0 failed, 0 skipped
  (45.5 s). The scenario "Apply, roll back and apply again" is now covered by two tests.
- `npm run lint` → 0 errors (the same 4 pre-existing warnings); `npm run typecheck` → exit 0;
  `openspec validate schema-history-claims --strict` → valid.
- Data state before/after: byte-identical. `pgmigrations` = `0001_graph-l1, 0002_history-claims`;
  0 rows in the ten tables; databases `codemind, postgres, template0, template1`.

## Addendum 2 — re-run after `/adversarial-review` (2026-09-28)

The review gave PASS WITH GAPS: one Major and several Minors. Changes approved by the author:

- **New scenario and test** "Single-line evidence span is accepted" (`start_line = end_line = 10`).
  The spec required `end_line >= start_line`, but nothing tested the boundary.
- **A `-0.1` insert inside "Confidence outside 0..1 is rejected"** (no new scenario). It runs in
  its own transaction, because the `1.5` rejection aborts the first one.
- **Forced failure.** In the shared DB, `0002` was rolled back and re-applied with
  `evidence_span_valid CHECK (end_line > start_line)` and
  `claim_confidence_range CHECK (confidence <= 1)`. Both tests failed:
  - single-line → `promise rejected … instead of resolving`;
  - confidence → `promise resolved '<uuid>' instead of rejecting`.

  The file was restored with `git checkout` (`git status` clean) and `0002` rolled back and
  re-applied.
- **`design.md` Risks**, documentation only:
  - the cascade risk when a re-index deletes and re-inserts `file` rows;
  - negative counters, tokens and cost, empty required text, and the `numeric(10,6)` ceiling,
    all left to the writers.
- **Linear:** comments on DIS-23 (CM-HU-02.2) and DIS-85 (CM-HU-05a.2).
- **Demo driver:** now covers 35 scenarios.

Commands and results:

- `npx vitest run tests/integration/store` → 3 files, **67 passed**, 0 failed, 0 skipped
  (45.8 s).
- Demo driver → `35 scenarios exercised, 35 match the spec, 0 do not`, state restored identical.
- Data state after the run: `pgmigrations` = `0001_graph-l1, 0002_history-claims`, 0 rows in the
  ten tables, no leftover throwaway database.
