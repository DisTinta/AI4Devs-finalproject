## What changes?

This PR adds the integration harness in `tests/integration/helpers/`:

- `db.ts`:
  - the only `DATABASE_URL` gate (skip locally, fail in CI);
  - `connect()` and `migrateSharedDatabase()`;
  - `useTransactionPerTest()`. It gives every test its own transaction, which is always rolled
    back. The test fails if that transaction was committed or ended early (checked by xid).
- `factories.ts`: synthetic, unique-per-call factories for `project`, `file`, `symbol` and `edge`.

`tests/integration/store/support.ts` now delegates to it, and its exports stay unchanged. The
existing store specs are not edited. This is OpenSpec change `test-db-isolation` (Linear DIS-22 /
CM-HU-02.1).

## Why?

- `docs/project-context.md` → Testing states that isolation is minimal until DIS-22. Constraint
  specs run in `BEGIN`/`ROLLBACK` through `withRollback`. Each file hand-rolls its own
  `insertProject` / `insertFile` / `insertSymbol` / `insertEdge`.
- The next stories write to the store: DIS-23 (`StorePort` writes), DIS-24 (reads), DIS-35 (Git
  history) and later ones. Each needs the same three things:
  - a connection to `DATABASE_URL`;
  - a transaction per test that is always reverted;
  - valid L1 rows to build on.
- The parent story CM-HU-02 has an acceptance criterion for this: "a test that inserts rows is
  reverted when it ends, and the next test starts on a clean database".
- PH-23 (planning §2): the per-test-transaction tests must not assume an empty database shared
  with `db:seed`.

This change is sub-issue **DIS-22** (`CM-HU-02.1`, parent DIS-15 / `CM-HU-02`). It is blocked by
DIS-11 (done) and blocks DIS-23.

## How to test it?

1. `docker compose up -d`, and wait until `docker compose ps` shows Postgres `healthy`.
2. `export DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind`, then `npm run db:migrate`.
3. `npx vitest run tests/integration/helpers tests/integration/store` → 6 files, 103 passed.
4. `npx vitest run tests/integration/helpers/harness.spec.ts --reporter=verbose` → 18 passed.
5. `env -u DATABASE_URL -u CI npx vitest run tests/integration/helpers`:
   - it prints the warning `DATABASE_URL is not set — skipping database integration tests`;
   - `harness.spec.ts` is skipped;
   - exit 0.
6. `env -u DATABASE_URL CI=true npx vitest run tests/integration/helpers` → fails with
   `DATABASE_URL must be set in CI`.
7. `npm run lint && npm run typecheck && npm run lint:architecture` → 0 errors.
8. `docker compose exec -T postgres psql -U codemind -d codemind -c "select count(*) from project"`
   → the same value as before step 3. No test rows are left.
9. In this PR's CI run (`CI` → `Tests`), `tests/integration/helpers/harness.spec.ts` is listed as
   passed, not skipped.

## Decisions / trade-offs

- **Commit detection by transaction id** (`design.md` D3):
  - The xid is taken at `BEGIN` and compared at the end with `pg_current_xact_id_if_assigned()`.
  - It catches `COMMIT`, `ROLLBACK`, and `COMMIT` + `BEGIN`. A `SAVEPOINT` passes.
  - Rejected: a `SET LOCAL` marker, which a later `BEGIN` could fake, and the `pg` "no
    transaction in progress" notice, which misses `COMMIT` + `BEGIN`.
- **An aborted transaction (`25P02`) counts as still open** (D3, found during apply). Without
  this, every harness test asserting a SQL error would fail.
  - Documented limit: `COMMIT` + `BEGIN` followed by a failed statement is not detected.
- **The adapter's `COMMIT` vs the test transaction** (Risks):
  - DIS-22 guarantees only an injectable transactional client, `db()`.
  - `SAVEPOINT` or an injected executor in `saveGraph` belong to DIS-23, where this is noted
    in Linear.
- **Hook order** (Risks, author decision A): Vitest 1.6.1 defaults to `sequence.hooks =
  'parallel'`, so cleanup goes in the test body, never in an `afterEach` that uses `db()`.
  `vitest.config.ts` is unchanged.
- **The gate test runs one harness spec and one store spec in a child Vitest** (D7). Both reach
  the same gate. Running all of `helpers/` and `store/` was rejected as slower, for no extra
  coverage.
- **`withRollback` does not get the commit check** (D6). The existing specs keep their exact
  behaviour, and are not migrated (non-goal).
- **Factories use snake_case column keys, and `createEdge` takes XOR endpoints** (D4), mirroring
  `edge_source_exactly_one` / `edge_target_exactly_one` at compile time.

## Traceability

| Scenario in the specification | Test that covers it |
|---|---|
| Database tests are skipped locally without a database | `tests/integration/helpers/gate.spec.ts:13` |
| Database tests fail in CI without a database | `tests/integration/helpers/gate.spec.ts:25` |
| Database tests run when a database is configured | Recorded check, by author decision (the spec says so): the suite itself, locally and in CI (run 36542843056, `harness.spec.ts` ✓, none skipped) |
| The shared database is migrated before the first test | `tests/integration/helpers/harness.spec.ts:31` |
| The test client is unavailable outside a running test | `tests/integration/helpers/harness.spec.ts:216` |
| A test reads back the row it wrote | `tests/integration/helpers/harness.spec.ts:40` |
| Rows are invisible to other connections while the test runs | `tests/integration/helpers/harness.spec.ts:49` |
| Rows are gone after the test ends | `tests/integration/helpers/harness.spec.ts:54` + `:58` (write, then check, in order) |
| The transaction is reverted when the test body throws | `tests/integration/helpers/harness.spec.ts:67` (through the lifecycle functions the hook calls, as the spec states) |
| Committing the harness transaction is reported | `tests/integration/helpers/harness.spec.ts:84` |
| Rolling back the harness transaction is reported | `tests/integration/helpers/harness.spec.ts:90` |
| Committing and opening a new transaction is reported | `tests/integration/helpers/harness.spec.ts:96` |
| An untouched harness transaction passes the check | `tests/integration/helpers/harness.spec.ts:104` |
| A savepoint inside the harness transaction passes the check | `tests/integration/helpers/harness.spec.ts:111` |
| An aborted harness transaction passes the check | `tests/integration/helpers/harness.spec.ts:120` |
| Each factory creates a row with defaults | `tests/integration/helpers/harness.spec.ts:132` |
| Default unique values never collide | `tests/integration/helpers/harness.spec.ts:156` |
| Overridden columns are stored | `tests/integration/helpers/harness.spec.ts:165` |
| Default values are synthetic | `tests/integration/helpers/harness.spec.ts:176` |
| An edge can connect files as well as symbols | `tests/integration/helpers/harness.spec.ts:186` |
| Existing store specs pass unchanged | The store suite runs: 83/83. The "unchanged" half is a recorded check on the diff, by author decision (the spec says so): `git diff --stat feature/entrega-2-CRN -- tests/integration/store` lists only `support.ts` |

Two scenarios are recorded checks, not tests. The author accepted this after `/verify-against-spec`,
and the spec states it. All 21 scenarios were also exercised independently by the demo driver:
`reports/2026-09-29-show-spec-working.md`, 21/21.

## Origin

agent+human-review

🤖 Generated with [Claude Code](https://claude.com/claude-code)
