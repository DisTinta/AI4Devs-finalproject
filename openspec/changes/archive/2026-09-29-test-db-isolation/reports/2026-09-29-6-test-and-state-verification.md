# Test and State Verification Report

- Date: 2026-09-29
- Change: test-db-isolation
- Step: 6 — Backend: Run Tests and Verify Data State

All commands ran locally against the compose Postgres (`pgvector/pgvector:pg16`) with
`DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind`, unless noted.

## Commands executed

- `docker compose up -d` (container healthy) and `npm run db:migrate` → `No migrations to run!`
- Baseline before any change (0.5): `npx vitest run tests/integration/store`
- After the `support.ts` refactor (1.3): `npm run typecheck` and
  `npx vitest run tests/integration/store`
- Targeted, twice: `npx vitest run tests/integration/helpers tests/integration/store`
- Broader suite and gates:
  - `npx vitest run`
  - `npm run lint`
  - `npm run typecheck`
  - `npm run lint:architecture`
  - `npm run docs:coverage`
- Frontend-workflow exclusion:
  `env -u DATABASE_URL CI=true npx vitest run --exclude 'tests/integration/**'`
- State probes (`psql` in the container):
  - `pgmigrations` names;
  - the counts of `project`, `file`, `symbol` and `edge`;
  - `count(*) FROM project WHERE name LIKE 'project-%'`;
  - `pg_database` names.

## Test results

- Baseline before the change: 4 files, **83 passed**. The same after the `support.ts` refactor:
  83 passed, typecheck OK.
- Targeted, run 1: 6 files, **100 passed**, 0 failed, 0 skipped, 68.5 s.
- Targeted, run 2: 6 files, **100 passed**, 62.7 s. There was no flakiness across the two runs.
- Required suite `npx vitest run`: 6 files, **100 passed**. That is 83 store tests, plus 15 in
  `harness.spec.ts` and 2 in `gate.spec.ts`.
- **Refresh at head `54e1dc8`**, after `/verify-against-spec` (task 5.3) and `/adversarial-review`
  (task 5.4): `npx vitest run` passes 6 files, **106 tests**. That is 83 store tests, plus 21 in
  `harness.spec.ts` and 2 in `gate.spec.ts`. Lint 0 errors, typecheck OK, architecture 0 errors.
- **Refresh after the second `/adversarial-review`** (task 5.5): `npx vitest run` passes 6 files,
  **107 tests** (22 in `harness.spec.ts`). Lint 0 errors, typecheck OK, architecture 0 errors,
  `openspec validate --strict` valid. The demo driver ran 25/25.
- **Concurrency guard, scratch check (no scenario test, by author decision).** A scratch
  `describe.concurrent` spec, outside the repo, has two `useTransactionPerTest()` tests that each
  run `pg_sleep(0.3)` on `db()`.
  - With the first guard (`if (current) throw`), both passed: they shared one client and leaked a
    transaction.
  - With the synchronous per-test slot: `Tests 1 failed | 1 passed (2)`, with
    `useTransactionPerTest() does not support concurrent tests: …`.
  - Afterwards, 0 `idle in transaction` sessions on `codemind`.
- `npm run lint`: 0 errors, 4 warnings. All four are the pre-existing
  `no-empty-object-type` warnings in `packages/core/src/ports/*`, not touched by this change.
- `npm run typecheck`: OK.
- `npm run lint:architecture`: 0 errors, 8 warnings. They are pre-existing: dependency-cruiser
  excludes `tests/`, and this change touches nothing under `packages/`.
- `npm run docs:coverage`: exit 0.
- Frontend exclusion with `CI=true` and no `DATABASE_URL`: `No test files found, exiting with code 0`.
  There is no import error: every harness file sits under `tests/integration/`.

### Forced failures (the checks can fail)

| # | Temporary edit in `tests/integration/helpers/db.ts` | Result |
|---|---|---|
| A (2.4) | Skip the xid comparison in `endTestTransaction` | 3 failed: "Committing … reported", "Rolling back … reported", "Committing and opening a new transaction is reported" |
| B (2.4) | `ROLLBACK` → `COMMIT` in `endTestTransaction` | 3 failed: "Rows are gone after the test ends (checks)", "The transaction is reverted when the test body throws", "An untouched harness transaction passes the check" |
| G (4.2) | `describeWithDatabase = describe` (gate removed) | "Database tests are skipped locally without a database" failed |
| F1 (5.4) | Remove `beforeAll(migrateSharedDatabase, 60_000)` from `useTransactionPerTest` | "The shared database is migrated before the first test" failed (the child's first test on the fresh database: `1 failed`) |
| F2 (5.4) | `firstError ??= error` → `firstError = error` (the rollback error wins) | "A failing check query is reported as itself" failed |
| F3 (5.4, in `factories.ts`) | `definedOnly` returns the overrides unfiltered | "Overrides set to undefined keep the factory default" failed |
| F4 (5.5) | The opt-in's `afterEach` runs `ROLLBACK` + `end()` without `endTestTransaction` | "A test that commits the test client fails" failed (the child: `Tests 1 passed (1)`) |
| F5 (5.6) | `DB_OUTSIDE_TEST_MESSAGE` loses its "Set up data in the test body or in a beforeEach of a nested describe" part | "The test client is unavailable outside a running test" failed |

After each one, the file was restored from a scratchpad copy, and `cmp` confirmed it identical.
After F1, 0 `codemind_migrations_*` databases were left.

- **Deviation in B.** Task 2.4 planned to "drop the `ROLLBACK`". But `client.end()` then aborts
  the open transaction anyway, so that edit is masked and proves nothing. `ROLLBACK` → `COMMIT`
  is the edit that really persists rows.
- **B left 5 committed `project` rows**, all with a factory name and `root_path = '/repos/sample'`.
  They were deleted with
  `DELETE FROM project WHERE root_path = '/repos/sample' AND name ~ '^project-[0-9a-f-]{36}$'`
  (DELETE 5).

### Findings during apply

- **Aborted transaction (D3, spec scenario added).** A test whose statement fails on purpose
  leaves the harness transaction aborted. The end-of-test check query then fails with `25P02`,
  and the harness failed a correct test. `endTestTransaction` now treats `25P02` as "still the
  same, open transaction". This is covered by the new scenario "An aborted harness transaction
  passes the check".
  - Documented limit: `COMMIT` + `BEGIN` followed by a failed statement is not detected.
- **Vitest 1.x skip counting (gate).** Without `DATABASE_URL`, the child run reports
  `Test Files 2 skipped (2)` and `Tests 15 skipped (39)`. Vitest counts as skipped only the tests
  of suites that `describe.skip` marks explicitly; the 24 constraint tests are listed as not run.
  So `gate.spec.ts` asserts at file level: 2 files skipped, no `passed`, no `failed`, exit 0.
  The child also runs with `NO_COLOR=1`, so the summary lines match as plain text.

### Scenario coverage (25 in `specs/test-db-isolation/spec.md`, after task 5.5)

- 23 have a test named after them, in `harness.spec.ts` (22 tests; "Rows are gone after the test
  ends" is a pair of tests) and `gate.spec.ts` (2).
- The first version of this report counted 18 scenarios. `/verify-against-spec` added 3
  (task 5.3), the first `/adversarial-review` added 3 more (task 5.4), and the second added 1
  (task 5.5).
- "Database tests run when a database is configured": a recorded check (4.3).
  `npx vitest run tests/integration/helpers` with `DATABASE_URL`: 2 files, 17 passed, 0 skipped.
- "Existing store specs pass unchanged": a recorded check (1.3 + 5.1). 83/83 passed, and
  `git diff --stat feature/entrega-2-CRN -- tests/integration/store` lists only `support.ts`.

## Data state verification

- Pre-test baseline:
  - `pgmigrations`: `0001_graph-l1`, `0002_history-claims`, `0003_indexes-stale`
  - `project`/`file`/`symbol`/`edge` counts: 0/0/0/0
  - Factory-named projects: 0
  - Databases: `codemind`, `postgres`, `template0`, `template1`
- Post-test validation, after both targeted runs and the full suite: identical. The same three
  migrations, 0/0/0/0, 0 factory-named projects, the same four databases.
- State restored: Yes.
- Restoration actions: the 5 rows committed by forced failure B were deleted (above). No other
  restoration was needed.

## UI evidence (if applicable)

- None: the change has no browser UI.

## End-to-end (step 8.1)

- Not applicable. This is test tooling only, and it changes no user interface or user workflow.

## CI (step 8.2)

- PR https://github.com/DisTinta/AI4Devs-finalproject/pull/8. The CI run is
  https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/36542843056 (job `quality`,
  pass, 1m19s).
- In its `Tests` step, `tests/integration/helpers/harness.spec.ts` shows ✓ with 15 tests (none
  skipped), and `tests/integration/helpers/gate.spec.ts` ✓ with 2 tests, out of `Test Files 6
  passed (6)`.
- This meets the DoD "CI lo ejecuta".
- **At head `54e1dc8`** (task 5.4), CI run
  https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/36550844924 (job `quality`, pass,
  1m18s):
  - `✓ tests/integration/helpers/harness.spec.ts (21 tests)`
  - `✓ tests/integration/helpers/gate.spec.ts (2 tests)`
  - `Tests 106 passed (106)`
- The intermediate head `5d206ac` passed in run 36546124218.
- **At head `3bd4d15`** (task 5.5), CI run
  https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/36553556701 (job `quality`, pass,
  1m17s): `harness.spec.ts` ✓ 22 tests, `gate.spec.ts` ✓ 2 tests, `Tests 107 passed (107)`.
- **At head `95cf399`** (task 5.6, the final pass), CI run
  https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/36555079035 (job `quality`, pass,
  1m16s).

## Outcome

- Status: PASS, locally and in CI (PR #8).
- Blocking issues: none.
