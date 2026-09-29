# Manual Interface Testing Report

- Date: 2026-09-29
- Change: test-db-isolation
- Step: 7 — Backend: Manual Interface Testing

The interface is the harness API, used from a spec (`useTransactionPerTest()`, `db()`, the
factories), plus its `npx vitest run` entry point. Database:
`postgres://codemind:codemind@localhost:5432/codemind` (compose, healthy).

## 7.1 Environment and state

- Postgres `codemind-postgres-1` was up (healthy).
- `pgmigrations`: `0001_graph-l1`, `0002_history-claims`, `0003_indexes-stale`.
- `project`/`file`/`symbol`/`edge` counts: 0/0/0/0.

## 7.2 Success path

`NO_COLOR=1 npx vitest run tests/integration/helpers/harness.spec.ts --reporter=verbose`

- It reported 15 ✓, `Test Files 1 passed (1)`, `Tests 15 passed (15)`, exit 0.
- Those are the 4 isolation tests, the 6 end-of-test check tests and the 5 factory tests.

## 7.3 Mutating path: code under test commits `db()`

This used a scratch spec outside the repo, `<scratchpad>/manual/commit-on-db.spec.ts`. It
imports `describeWithDatabase` and `useTransactionPerTest` from `tests/integration/helpers/db`,
and its only test runs `await db().query('COMMIT')`, with no writes.

`NO_COLOR=1 npx vitest run --root <scratchpad>/manual`

```
FAIL  commit-on-db.spec.ts > manual: code under test commits the harness transaction > commits db() without writing
Error: Harness transaction was committed or ended early (opened as 8139, now none); rows written by this test may have persisted.
Test Files  1 failed (1)
Tests  1 failed (1)
exit 1
```

- The scratch spec was deleted afterwards with `rm`.
- Vite left its cache, `<scratchpad>/manual/.vite/vitest/results.json`, in the session scratchpad
  only. It is not in the repo.
- Counts after the run: 0/0/0/0, unchanged.

## 7.4 Error cases

- `env -u DATABASE_URL -u CI NO_COLOR=1 npx vitest run tests/integration/helpers`:
  - It printed
    `WARNING: DATABASE_URL is not set — skipping database integration tests that need PostgreSQL. Run \`docker compose up -d\` and export DATABASE_URL to run them.`
  - It reported `Test Files 1 passed | 1 skipped (2)` and `Tests 2 passed | 15 skipped (17)`, exit 0.
  - The 2 passing tests are `gate.spec.ts`, which needs no database; `harness.spec.ts` is skipped.
- `env -u DATABASE_URL CI=true NO_COLOR=1 npx vitest run tests/integration/helpers`:
  - It failed with
    `Error: DATABASE_URL must be set in CI: the database integration tests cannot be skipped there.`
    (exit 1).
  - As designed, a no-Postgres job must exclude `tests/integration/**`.

## 7.6 Final state

- `pgmigrations`: the same three migrations.
- Counts: 0/0/0/0, which matches the pre-test state. No factory rows are left.
