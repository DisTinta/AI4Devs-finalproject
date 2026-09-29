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

<!-- filled in by the human: the business rationale is not yours to generate -->

## How to test it?

1. `docker compose up -d`, and wait until `docker compose ps` shows Postgres `healthy`.
2. `export DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind`, then `npm run db:migrate`.
3. `npx vitest run tests/integration/helpers tests/integration/store` → 6 files, 100 passed.
4. `npx vitest run tests/integration/helpers/harness.spec.ts --reporter=verbose` → 15 passed.
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
| Database tests run when a database is configured | **No dedicated test.** Recorded check: `npx vitest run tests/integration/helpers` with `DATABASE_URL` → 17 passed, 0 skipped (report 6, task 4.3). CI step 9 above |
| A test reads back the row it wrote | `tests/integration/helpers/harness.spec.ts:29` |
| Rows are invisible to other connections while the test runs | `tests/integration/helpers/harness.spec.ts:38` |
| Rows are gone after the test ends | `tests/integration/helpers/harness.spec.ts:43` + `:47` (write, then check, in order) |
| The transaction is reverted when the test body throws | `tests/integration/helpers/harness.spec.ts:56` |
| Committing the harness transaction is reported | `tests/integration/helpers/harness.spec.ts:73` |
| Rolling back the harness transaction is reported | `tests/integration/helpers/harness.spec.ts:79` |
| Committing and opening a new transaction is reported | `tests/integration/helpers/harness.spec.ts:85` |
| An untouched harness transaction passes the check | `tests/integration/helpers/harness.spec.ts:93` |
| An aborted harness transaction passes the check | `tests/integration/helpers/harness.spec.ts:102` |
| Each factory creates a row with defaults | `tests/integration/helpers/harness.spec.ts:114` |
| Default unique values never collide | `tests/integration/helpers/harness.spec.ts:138` |
| Overridden columns are stored | `tests/integration/helpers/harness.spec.ts:147` |
| Default values are synthetic | `tests/integration/helpers/harness.spec.ts:158` |
| An edge can connect files as well as symbols | `tests/integration/helpers/harness.spec.ts:168` |
| Existing store specs pass unchanged | **No dedicated test.** The existing store suite passes, 83/83, and `git diff --stat feature/entrega-2-CRN -- tests/integration/store` lists only `support.ts` (report 6, tasks 1.3 and 5.1) |

**Findings:** two scenarios are covered by recorded checks, not by a test of their own. The
first is a positive run of the suite itself. The second is a property of the diff.

## Origin

agent+human-review

🤖 Generated with [Claude Code](https://claude.com/claude-code)
