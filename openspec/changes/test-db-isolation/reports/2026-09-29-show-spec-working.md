# Show Spec Working — test-db-isolation

- Date: 2026-09-29
- Change: test-db-isolation (Linear DIS-22 / CM-HU-02.1)
- Commit under test: `feature/DIS-22-test-db-isolation` (PR #8), re-run after the `/verify-against-spec` pass (task 5.3). The first run, on `609320f`, was 18/18 against the 18-scenario spec
- System: compose Postgres `pgvector/pgvector:pg16` (healthy),
  `DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind`

## How it was exercised

The harness is test tooling, so its real interface is:

- the `npx vitest run` entry point;
- the public helpers of `tests/integration/helpers/`: `useTransactionPerTest()` / `db()`,
  `beginTestTransaction()` / `endTestTransaction()`, `connect()` and the factories.

The driver [`2026-09-29-demo.ts`](./2026-09-29-demo.ts) exercises them **independently of the
repo's own specs**:

- It spawns child Vitest runs for the gate.
- It writes throwaway specs in a temp dir that use `useTransactionPerTest()`, and reads their
  results back from a separate connection.
- It calls the lifecycle and factory helpers directly.
- It runs `tsc` on the `createEdge` XOR.

The harness imports Vitest, which cannot be loaded through `tsx` in this CommonJS root package, so
the driver itself runs inside Vitest with its own config,
[`2026-09-29-demo.vitest.config.ts`](./2026-09-29-demo.vitest.config.ts). The file is not a
`*.spec`/`*.test`: `npx vitest run` still collects exactly 6 files (checked below).

```
DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind npx vitest run \
  --config openspec/changes/test-db-isolation/reports/2026-09-29-demo.vitest.config.ts
```

Result: `✓ openspec/changes/test-db-isolation/reports/2026-09-29-demo.ts (1 test) 102931ms`,
`Test Files 1 passed (1)`. Full transcript: [`2026-09-29-demo-output.txt`](./2026-09-29-demo-output.txt).

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| Database tests are skipped locally without a database | Child `vitest run harness.spec.ts graph-schema-constraints.spec.ts`, with `DATABASE_URL` and `CI` unset | exit 0; `Test Files 2 skipped (2)`; the WARNING is printed; no passed or failed | Yes | transcript |
| Database tests fail in CI without a database | The same child, with `DATABASE_URL` unset and `CI=true` | exit 1; `DATABASE_URL must be set in CI: …` | Yes | transcript |
| Database tests run when a database is configured | Child `vitest run harness.spec.ts`, with `DATABASE_URL` set | exit 0; `Tests 18 passed (18)`, none skipped | Yes | transcript |
| The shared database is migrated before the first test | Temp spec with no migration step; its first test reads `pgmigrations` | `0001_graph-l1, 0002_history-claims, 0003_indexes-stale`, which equals the migration files | Yes | transcript |
| The test client is unavailable outside a running test | Temp spec calls `db()` in `beforeAll` | `db() is only available while a harness test is running.` | Yes | transcript |
| A test reads back the row it wrote | Temp spec, `useTransactionPerTest()` + `createProject({ root_path: '/repos/demo' })`, then `SELECT` through `db()` | one row with the same id and `/repos/demo` | Yes | transcript |
| Rows are invisible to other connections while the test runs | Temp spec: `connect()` counts the id during the test | `count(*) = 0` | Yes | transcript |
| Rows are gone after the test ends | Driver counts the 3 ids the child wrote, after the child exits | `0, 0, 0` | Yes | transcript |
| The transaction is reverted when the test body throws | `beginTestTransaction()`, `createProject`, throw, `endTestTransaction()` in `catch` | `count(*) = 0` | Yes | transcript |
| Committing the harness transaction is reported | Temp spec: `db().query('COMMIT')` under the hook | child exit 1; `Harness transaction was committed or ended early (opened as 8161, now none)…` | Yes | transcript |
| Rolling back the harness transaction is reported | `ROLLBACK` on the client, then `endTestTransaction()` | throws `… (opened as 8162, now none) …` | Yes | transcript |
| Committing and opening a new transaction is reported | `COMMIT`, `BEGIN`, `pg_current_xact_id()`, end | throws `… (opened as 8163, now 8164) …` | Yes | transcript |
| An untouched harness transaction passes the check | Write a project, then end (no savepoint) | no error; `count(*) = 0` afterwards | Yes | transcript |
| A savepoint inside the harness transaction passes the check | Write a project, `SAVEPOINT` + `RELEASE`, end | no error; `count(*) = 0` afterwards | Yes | transcript |
| An aborted harness transaction passes the check | Write a project, `SELECT 1 / 0` (22012), end | no error; `count(*) = 0` afterwards | Yes | transcript |
| Each factory creates a row with defaults | project → file → 2 symbols → symbol edge | all 5 readable back (`1, 1, 1, 1, 1`); edge `calls/exact/test-factory` | Yes | transcript |
| Default unique values never collide | 2 projects, 2 files in the same project | distinct names and distinct paths | Yes | transcript |
| Overridden columns are stored | `language: 'php'`, `is_sample: true`, symbol `kind: 'class'` | `[{"language":"php","is_sample":true,"kind":"class"}]` | Yes | transcript |
| Default values are synthetic | Defaults of project, file and symbol | `/repos/sample`, `project-<uuid>`, `src/file-<uuid>.ts`, `handle` | Yes | transcript |
| An edge can connect files as well as symbols | `createEdge` with `{ file_id }` endpoints, kind `imports` | both file ids set, both symbol ids `null` | Yes | transcript |
| Existing store specs pass unchanged | `vitest run tests/integration/store` + `git diff --stat feature/entrega-2-CRN -- tests/integration/store` | `Tests 83 passed (83)`; only `support.ts` changed | Yes | transcript |

Extra, not a scenario (design D4, the `createEdge` XOR). `tsc --strict` on a temp file:

- `source: { symbol_id }` → exit 0;
- `source: { symbol_id, file_id }` → exit 2,
  `error TS2322: Type '{ symbol_id: string; file_id: string; }' is not assignable to type 'EdgeEndpoint'`.

**21/21 scenarios demonstrated.**

## Evidence

The full verbatim transcript is [`2026-09-29-demo-output.txt`](./2026-09-29-demo-output.txt).
The key lines:

```
$ env -u DATABASE_URL -u CI npx vitest run tests/integration/helpers/harness.spec.ts tests/integration/store/graph-schema-constraints.spec.ts
PASS  Database tests are skipped locally without a database
      observed: exit 0; Test Files  2 skipped (2) | Tests  15 skipped (39) | WARNING: DATABASE_URL is not set — skipping database integration tests that need PostgreSQL. Run `docker compose up -d` and export DATABASE_URL to run them.
$ env -u DATABASE_URL CI=true …
PASS  Database tests fail in CI without a database
      observed: exit 1; Test Files  2 failed (2) | Tests  no tests | Error: DATABASE_URL must be set in CI: the database integration tests cannot be skipped there.
$ npx vitest run --root <tmp>   (hook.spec.ts: COMMIT on db())
PASS  Committing the harness transaction is reported
      observed: exit 1; → Harness transaction was committed or ended early (opened as 8161, now none); rows written by this test may have persisted.
PASS  Committing and opening a new transaction is reported
      observed: Harness transaction was committed or ended early (opened as 8163, now 8164); rows written by this test may have persisted.
PASS  An aborted harness transaction passes the check
      observed: failed statement SQLSTATE 22012; end error = null; count(*) afterwards = 0
21/21 scenarios demonstrated
```

The repo suite does not collect the driver:

```
$ DATABASE_URL=… NO_COLOR=1 npx vitest run
 ✓ tests/integration/helpers/harness.spec.ts  (18 tests)
 ✓ tests/integration/store/indexes-stale.spec.ts  (13 tests)
 ✓ tests/integration/store/graph-schema-constraints.spec.ts  (24 tests)
 ✓ tests/integration/store/history-claims-constraints.spec.ts  (28 tests)
 ✓ tests/integration/helpers/gate.spec.ts  (2 tests)
 ✓ tests/integration/store/migrations.spec.ts  (18 tests)
 Test Files  6 passed (6)
      Tests  103 passed (103)
```

`npm run lint`: 0 errors. The 4 warnings are pre-existing, in `packages/core/src/ports/*`; there
are none in the driver.

## State

- Before:
  - `pgmigrations`: `0001_graph-l1`, `0002_history-claims`, `0003_indexes-stale`
  - `project`/`file`/`symbol`/`edge`: 0/0/0/0
  - databases: `codemind`, `postgres`, `template0`, `template1`
- After the demo, and again after the full suite: identical. The same three migrations, 0/0/0/0,
  the same four databases.
- Restored: yes, and no action was needed.
  - Every write ran in a harness transaction that was rolled back. The only commits (the
    `COMMIT` scenarios) wrote nothing.
  - The driver's temp dir (`%TEMP%/test-db-isolation-demo-*`) is removed in `finally`: 0 left.

## Not demonstrated

- Nothing from the spec.
- The CI side of the DoD ("CI lo ejecuta") is shown in the PR #8 run 36542843056, not here: see
  report 6.

## Handoff

**Demonstrably working.** All 21 scenarios of `specs/test-db-isolation/spec.md` behave exactly as
their `THEN`s say, through the real interface and outside the repo's own specs, and the data
state was unchanged.

No screenshot or other file was written at the repository root. The change has no UI, so there
are no screenshots.
