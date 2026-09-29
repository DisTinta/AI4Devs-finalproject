## Context

See `proposal.md` → Why. Current state that shapes the approach:

- `tests/integration/store/support.ts` holds everything DB-related today. On import it reads
  `DATABASE_URL`. If it is missing, it throws when `CI` is set, and otherwise warns and exports
  `describeWithDatabase = describe.skip`. It also exports `migrateSharedDatabase()` (retries on
  node-pg-migrate's "Another migration is already running") and `withRollback(work)` (own
  `Client`, `BEGIN` … `ROLLBACK`).
- Three constraint specs migrate the shared DB in `beforeAll` and run each test in
  `withRollback`, with per-test unique values. Each spec hand-rolls `insertProject` /
  `insertFile` / `insertSymbol` / `insertEdge`. `migrations.spec.ts` works on throwaway
  databases.
- Vitest runs files in parallel (separate workers) and the tests inside a file sequentially. CI
  (`ci.yml` → `Tests`) runs `npx vitest run` with `DATABASE_URL` pointing at the `test` database
  of the `pgvector/pgvector:pg16` service.
- The Frontend workflow and `vitest.stryker.config.ts` exclude `tests/integration/**`. Anything
  that imports the gate must live there.
- `tests/tsconfig.json` type-checks every `tests/**/*.ts`. `.dependency-cruiser.cjs` excludes
  `tests/`, so tests may import `pg` and `packages/adapters/store-postgres/src/migrate` directly,
  as `support.ts` already does.

## Goals / Non-Goals

**Goals:**

- One module owns `DATABASE_URL`, the gate and the connection. `support.ts` delegates to it.
- A per-test transaction that DIS-23+ specs opt into with one call. It fails the test when the
  transaction was committed or ended under it.
- Factories whose defaults are valid against `0001`–`0003` and never collide.

**Non-Goals:**

- Adding the commit check to `withRollback`. Its behaviour stays exactly as it is (see D6).
- Resolving nested transactions now. The harness does not emulate nesting, does not intercept
  `BEGIN`/`COMMIT`, and adds no `SAVEPOINT` logic. That belongs to `saveGraph` in DIS-23 (see
  Risks).
- Migrating the existing store specs (`graph-schema-constraints`, `history-claims-constraints`,
  `indexes-stale`, `migrations`) to the hook or the factories.

## Decisions

### D1 — Module layout

```
tests/integration/helpers/
  db.ts               databaseUrl, gate, connect(), migrateSharedDatabase(),
                      beginTestTransaction() / endTestTransaction(), useTransactionPerTest()
  factories.ts        unique(), createProject/File/Symbol/Edge + row types
  harness.spec.ts     example + isolation + commit-check + factory scenarios
  gate.spec.ts        the two "no DATABASE_URL" scenarios, run in a child Vitest
tests/integration/store/support.ts
                      re-exports databaseUrl, describeWithDatabase, migrateSharedDatabase (db.ts)
                      and unique (factories.ts); keeps runCommand, runNpmScript, repoRoot,
                      CHILD_TIMEOUT_MS, withRollback, expectSqlState, SQLSTATE
```

`migrateSharedDatabase` and its retry constants move to `db.ts` unchanged.

- The alternative was to leave it in `support.ts` and have `db.ts` import it. That would make the
  new API depend on the legacy store module. The dependency must point the other way.

`unique` moves to `factories.ts`, its only new consumer, and `support.ts` re-exports it.

### D2 — Gate lives only in `db.ts`

The `throw` (CI) and the `console.warn` (local) run at the top level of `db.ts`, with the same
logic as in `support.ts` today.

The messages are generalised from "store integration tests" to "database integration tests",
because they now cover the harness specs too:

- CI: `DATABASE_URL must be set in CI: the database integration tests cannot be skipped there.`
- Local: `WARNING: DATABASE_URL is not set — skipping database integration tests that need PostgreSQL. …`,
  with the same `docker compose up -d` hint.

- `support.ts` no longer contains either. It imports `db.ts`, so the gate still fires on import
  for the existing specs.
- Vitest isolates modules per file, so there is still one warning per file that imports it, as
  today. This satisfies "use this same gate, not a copy".

`connect()` returns a connected `pg` `Client` for `databaseUrl`. It is the single place that
builds a client from the URL. `withRollback` uses it too.

### D3 — Transaction lifecycle and the commit check

The lifecycle is split into two plain async functions. This lets the "body throws" and "committed"
scenarios be tested directly, without a test that fails on purpose.

- `beginTestTransaction()` → `connect()`, `BEGIN`, then
  `SELECT pg_current_xact_id()::text AS xid`. Forcing a transaction id at the start gives a value
  to compare against. It returns `{ client, xid }`.
- `endTestTransaction(tx)`:
  1. Reads `SELECT pg_current_xact_id_if_assigned()::text`.
  2. Always runs `ROLLBACK`, then `client.end()`, inside `finally`.
  3. If the value read in step 1 is not the stored `xid`, it throws
     `Error('Harness transaction was committed or ended early (…); rows written by this test may have persisted.')`.
     A `NULL` value means the code under test ran `COMMIT` or `ROLLBACK`, and the session is now
     in autocommit. A different id means it ran `COMMIT` + `BEGIN`.

  A `SAVEPOINT` keeps the same top-level id, so savepoints pass the check.

  An **aborted** transaction also passes. After a failed statement, which is what a test that
  asserts a constraint error produces, every query fails with SQLSTATE `25P02`, so step 1 cannot
  read the id.
  - `25P02` means the session is still inside the transaction block, so it counts as the same
    transaction. Any other error is rethrown.
  - This was found during apply: without it, every harness test asserting a SQL error would fail.
  - Limit: `COMMIT` + `BEGIN` followed by a failed statement looks the same, and is not detected.
- `useTransactionPerTest()` is called inside a `describe`:
  - it registers `beforeAll(migrateSharedDatabase, 60_000)`, because a harness test cannot run
    without the schema, and the migration is idempotent and lock-retried;
  - it registers `beforeEach` → `beginTestTransaction()` and `afterEach` → `endTestTransaction()`;
  - it returns `db(): Client`, which throws if it is called outside a running test.

  An error thrown in `afterEach` fails that test in Vitest, which is how the commit check becomes
  a test failure.

Alternatives considered:

- `SET LOCAL` marker plus a `current_setting` check. It is lost on commit too, but a later
  `BEGIN` + `SET LOCAL` by the code under test could fake it. The xid cannot be faked.
- Detecting the `pg` "there is no transaction in progress" notice on `ROLLBACK`. This misses
  `COMMIT` + `BEGIN`, and a notice listener is easy to lose.
- Pool-based client. Nothing gains from it: one client per test, and files are few.

`pg_current_xact_id*` exists since PostgreSQL 13, and the service is pg16. The deprecated
`txid_*` names are not used.

### D4 — Factories

- Signature: `createX(client, required, overrides?) → Promise<XRow>`.
  - `required` holds the parent ids only: `createFile(client, { project_id })` and
    `createSymbol(client, { file_id })`.
  - `createProject(client, overrides?)` has no parent.
  - `createEdge(client, { project_id, source, target }, overrides?)` types each endpoint as an
    explicit XOR, mirroring `edge_source_exactly_one` / `edge_target_exactly_one` in
    `0001_graph-l1.up.sql`:

    ```ts
    type EdgeEndpoint =
      | { symbol_id: string; file_id?: never }
      | { file_id: string; symbol_id?: never };
    ```

    The factory maps `source` to `source_symbol_id` / `source_file_id` (the other one `NULL`), and
    `target` the same way. A call with both ids or neither is a compile error, not a runtime
    `23514`.
  - The four endpoint columns are therefore **not** in `createEdge`'s `overrides` type. A mixed
    source and target (symbol → file) works, because each endpoint is chosen on its own.
- Overrides and rows use the **column names** (snake_case). They mirror the table and the
  `RETURNING *` row exactly, with no mapping layer to keep in sync.
- Row interfaces are typed per table. Enums are string-literal unions matching `0001`. `vector`
  columns are `string | null`, because `pg` returns them as text. Timestamps are `Date`.
- Defaults:

  | Table | Defaults |
  |---|---|
  | `project` | `name = unique('project')`, `root_path = '/repos/sample'`, `language = 'typescript'` |
  | `file` | `path = unique('src/file') + '.ts'`, `kind = 'source'` |
  | `symbol` | `name = 'handle'`, `kind = 'method'`, `start_line = 1`, `end_line = 5` |
  | `edge` | `kind = 'calls'`, `resolution = 'exact'`, `extractor = 'test-factory'`; the endpoints come from `required` |

  All values are synthetic. The randomness in `unique()` makes the factories safe against
  parallel files and a loaded seed (PH-23).
- The `INSERT` is built from the merged object's keys. The keys are restricted at compile time to
  the row type's columns (`Partial<Omit<XRow, 'id'>>`), and the values go as parameters (`$n`).
  The column names are never user input.
- There is no graph builder or `createGraph`: that would anticipate DIS-23's `saveGraph` shape.

### D5 — Example spec and "rows are gone after the test ends"

`harness.spec.ts` uses `describeWithDatabase` + `useTransactionPerTest()`.

- The "gone after" scenario is two consecutive tests. The first writes a project and stores its
  id in a file-scoped variable. The second looks the id up through a separate `connect()` client
  and expects zero rows. If the first test did not record an id, the second fails with a clear
  message.
- This relies on Vitest running the tests of a file in order. That is the default; the file must
  not use `.concurrent`, and a comment will say so.
- The alternative, an `afterAll` check, would report the failure against no test.

"Body throws" and the commit-check scenarios call `beginTestTransaction` / `endTestTransaction`
directly, on their own transaction, not the hook's. There are four commit-check scenarios:
`COMMIT`, `ROLLBACK`, `COMMIT` + `BEGIN`, and untouched.

- The `COMMIT` and `COMMIT` + `BEGIN` scenarios commit a transaction that **wrote nothing**, so
  nothing persists even though they commit.

### D6 — `withRollback` unchanged

`withRollback` only swaps `new Client(...)` + `connect()` for `connect()`. It does not get the
commit check.

- Adding the check would change the behaviour of the three existing specs. It would be harmless
  today, but it breaks the "keep their API and behaviour" requirement and is out of scope.
- New specs use the hook.

### D7 — Gate scenarios run in a child Vitest

`gate.spec.ts` uses `runCommand` to run
`npx vitest run tests/integration/helpers/harness.spec.ts tests/integration/store/graph-schema-constraints.spec.ts`.

- One harness spec and one store spec are enough. They prove that both paths go through the same
  gate: `harness.spec.ts` imports `db.ts` directly, and `graph-schema-constraints.spec.ts` gets it
  through `support.ts`.
- Spawning all of `helpers/` + `store/` was rejected: it is slower, and it adds nothing, because
  the gate is a single implementation.

The runs use these env overrides:

- local: `DATABASE_URL` and `CI` removed. On GitHub runners `CI=true`, so it must be removed
  explicitly;
- CI: `DATABASE_URL` removed, `CI: 'true'`.

It asserts on the exit code and on the combined stdout/stderr text (the warning, the CI error, and
skipped counts). `--reporter=json` is not used: module-level console output is not part of the
JSON. This file does not use `describeWithDatabase` (it needs no DB itself), but it lives under
`tests/integration/` so the no-Postgres jobs keep excluding it. Each child stays under
`CHILD_TIMEOUT_MS` (45 s), and the tests get a 60 s timeout, like `migrations.spec.ts`.

## Risks / Trade-offs

- **Adapter `COMMIT` vs the test's transaction.** DIS-23's `saveGraph` will open its own
  transaction. On a client already in the harness transaction, its `BEGIN` is a warning and its
  `COMMIT` commits the harness transaction, so the test's rows persist. The D3 check then fails
  the test, which is the intended loud failure, not a fix.
  → **DIS-22 guarantees only an injectable transactional client:** `db()`, a `pg` `Client` inside
  an open transaction that the harness owns. The adapter cooperates in DIS-23, for example with
  `SAVEPOINT` when it receives a client already in a transaction, or by taking an injected
  executor. This goes in the DIS-23 Linear comment at hand-off, and in `project-context.md`.
- **The order of tests inside a file** (D5). → A comment in the file, and the second test fails
  with a clear message if the first did not run.
- **Hook order with the user's own `afterEach`.** The installed Vitest is 1.6.1, and its runtime
  default is `sequence.hooks = 'parallel'`: `cli-api` does
  `resolved.sequence.hooks ?? (… = "parallel")`, and the TSDoc says `@default 'parallel'`. The
  `'stack'` default (after-hooks in LIFO order) arrived in Vitest 2.0. The repo sets no
  `sequence` option.
  - With `'parallel'`, a spec's own `afterEach` that uses `db()` runs concurrently with the
    harness `ROLLBACK`, whatever the registration order.
  - → **Decision (author, A):** keep the Vitest default. The `db.ts` TSDoc says: clean up in the
    test body, never in an `afterEach` that uses `db()`.
  - `vitest.config.ts` gets no `sequence` option, in line with the non-goal on its settings.
- **Snake_case keys vs a camelCase lint rule.** → Check `eslint.config.mjs` during
  implementation. If a naming rule objects, disable it for `factories.ts` only, with a comment.
- **The child-Vitest gate tests are slow** (two spawns, a few seconds each). → Accepted. They are
  the only way to observe a module-level `throw` / `warn`.

## Migration Plan

Tests only; nothing is deployed. Rollback = revert the commit. The existing store specs are the
regression net (the spec scenario "Existing store specs pass unchanged").
