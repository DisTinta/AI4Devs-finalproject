# Test and State Verification Report

- Date: 2026-09-28
- Change: schema-graph-l1
- Step: 8 — Backend: Run Tests and Verify Data State

## Commands executed

All with `DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind` (local `docker compose`
Postgres, `pgvector/pgvector:pg16`, compose default credentials).

- `npx vitest run tests/integration/store` (targeted; run twice in a row for parallel flakiness)
- `npx vitest run` (full suite)
- `npm run lint`
- `npm run typecheck`
- `npm run lint:architecture`
- `npm run docs:coverage`
- `npm run db:migrate && npm run db:rollback && npm run db:migrate` (CI step reproduced)
- `npx stryker run` (CI mutation step now activates because test files exist)

## Test results

- Targeted tests: 27 passed, 0 failed, 0 skipped (two consecutive runs, both 27/27)
- Required suite: 2 files, 27 passed, 0 failed, 0 skipped; runtime ≈ 19 s
- Gates: lint exit 0 (0 errors, 4 pre-existing warnings on empty ports); typecheck exit 0;
  lint:architecture exit 0 (0 errors, 8 pre-existing `no-orphans` warnings on stub packages);
  docs:coverage exit 0 with no warnings; CI migrate → rollback → migrate exit 0
- Stryker: exit 0; `packages/core/src` has no mutants yet, score `n/a` (not caused by this change)
- Scenario coverage: 27 `#### Scenario:` in `specs/graph-schema/spec.md`, each matched by a test
  with the identical title (checked mechanically)
- TDD evidence: every RED step observed failing before GREEN (2.1: placeholders exited 0; 3.2 / 4.1 /
  5.1: `42P01 undefined_table`). Lifecycle tests (6.2) passed on first run, so they were proven able
  to fail: removing `DROP TYPE IF EXISTS edge_resolution` from the down file failed "Roll back the L1
  graph migration" and "Apply, roll back and apply again"; changing `file.redacted` default to
  `true` failed "Migrated schema matches the column contract" and "Apply, roll back and apply
  again". Both files restored byte-identical (verified with `diff`).
- Partial-failure atomicity (task 6.4): `migrate.ts` does not pass `singleTransaction`, so
  node-pg-migrate's default `true` applies; a comment in `migrate.ts` forbids disabling it.
- End-to-end (step 10): not applicable — the change adds no user interface or user workflow; the
  `db:*` CLI scripts are exercised in step 9.
- Notes: no flaky tests, no retries.

## Data state verification

- Pre-test baseline (before any migration, task 3.2):
  - `public` tables: none
  - databases: `codemind`, `postgres`, `template0`, `template1`
- Post-test validation (after full suite, CI sequence and Stryker):
  - `public` tables: `edge`, `file`, `pgmigrations`, `project`, `symbol` (intended: migrated)
  - `pgmigrations`: `0001_graph-l1`
  - rows in `project` / `file` / `symbol` / `edge`: 0 / 0 / 0 / 0
  - databases: `codemind`, `postgres`, `template0`, `template1` (no leftover throwaway DB)
- State restored: Yes (the only intended difference from the baseline is the applied migration)
- Restoration actions: none needed

## UI evidence (if applicable)

- (none — the change has no browser UI)

## Outcome

- Status: PASS
- Blocking issues: none
