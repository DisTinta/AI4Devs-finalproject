## Why

<!-- Business why: to be written by the author (base-standards rule 8). Facts that frame it: -->

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

## What Changes

- **New helpers module `tests/integration/helpers/db.ts`**, the new API for DIS-23 onwards:
  - The only place that reads `DATABASE_URL`.
  - The only "no `DATABASE_URL` → skip locally, fail in CI" gate (`describeWithDatabase`).
  - `migrateSharedDatabase()`, moved here unchanged.
  - A connection helper.
  - A per-test transaction hook. It registers `beforeEach` (connect + `BEGIN`) and `afterEach`
    (`ROLLBACK` + disconnect), and gives the test the client of its open transaction.
  - The `afterEach` fails the test if the harness transaction is no longer open when it ends,
    for example because the code under test ran `COMMIT` on it. Without this, the rows would
    survive and no one would know.
- **New `tests/integration/helpers/factories.ts`**: minimal factories for the four L1 tables
  (`project`, `file`, `symbol`, `edge`).
  - Each one inserts one valid row through a given client, with per-call unique defaults, and
    returns it.
  - Any column can be overridden.
  - No domain logic, no graph building.
- **Two specs in `tests/integration/helpers/`**:
  - `harness.spec.ts` is the example and the isolation spec:
    - it writes a row through the factories and reads it back;
    - it proves the row is invisible to other connections while the test runs, and absent after
      it;
    - it proves the committed-or-ended transaction guard and the factory defaults.
  - `gate.spec.ts` runs a child Vitest without `DATABASE_URL`. It proves that the single gate
    skips locally and fails in CI.

  CI already runs both: the `Tests` step runs `npx vitest run` with `DATABASE_URL`. No workflow
  edit.
- **`tests/integration/store/support.ts` gets thinner.** It takes `databaseUrl`, the gate and
  `migrateSharedDatabase` from `helpers/db.ts` and re-exports them. It keeps its public API
  unchanged for the current specs:
  - `withRollback`, `describeWithDatabase`, `migrateSharedDatabase`, `SQLSTATE`, `expectSqlState`,
    `unique`, `runCommand`, `runNpmScript`, `repoRoot`, `databaseUrl`, `CHILD_TIMEOUT_MS`.
  - `withRollback` opens its client through the helpers' connection helper.

## Capabilities

### New Capabilities

- `test-db-isolation`: the database integration harness contract. It covers:
  - the single `DATABASE_URL` gate;
  - one reverted transaction per test;
  - failing loudly when that transaction is committed or ended early;
  - valid L1 rows from factories.

### Modified Capabilities

<!-- none: graph-schema requirements are unchanged -->

## Impact

- **Code:** none in `packages/`. Nothing changes in the migrations, the adapters, `migrate.ts`, the
  npm scripts or the dependencies (`pg` and `vitest` are already root devDependencies).
- **Tests:**
  - New: `tests/integration/helpers/{db.ts,factories.ts}` and the two specs `harness.spec.ts`
    and `gate.spec.ts`.
  - `tests/integration/store/support.ts` refactored with the same exports. The gate messages say
    "database integration tests" instead of "store integration tests".
  - The four existing store specs must stay green with no edit.
- **CI:** no workflow edit. Both new specs sit under `tests/integration/`, so the Frontend
  workflow and Stryker (`vitest.stryker.config.ts`) keep excluding them.
- **Docs:**
  - `docs/project-context.md` → Testing: replace "Isolation is minimal until DIS-22" with the
    harness usage, and state the committed-transaction rule for code under test.
  - `docs/TESTING.md` if it covers integration setup.
- **Privacy:** none. The factories use synthetic values only (no real names, emails or paths).

## Non-goals

- Migrating `graph-schema-constraints.spec.ts`, `history-claims-constraints.spec.ts`,
  `indexes-stale.spec.ts` or `migrations.spec.ts` to the new hook or factories. They keep
  `withRollback` and their local insert helpers. They are not edited.
- Any domain query or `StorePort` method (DIS-23 / DIS-24). The factories are plain `INSERT`s for
  tests, not a store API.
- Letting code under test that manages its own transactions (`saveGraph` in DIS-23) run inside the
  harness transaction, for example with savepoints or an injectable executor. This harness
  detects a commit and fails; how the adapter cooperates is DIS-23's design.
- Factories for the history and claim tables (`commit`, `file_commit`, `claim`, `evidence`,
  `query_log`, `cache_entry`). Each is added by the story that first needs it.
- Testcontainers or a database per test file: the harness uses the Postgres of
  `docker-compose.yml` locally and the `ci.yml` service in CI.
- The separate `verify` database or job for `db:seed` (PH-23 → CM-HU-14.1). This change only makes
  sure the harness does not assume an empty database.
- Parallelism settings in `vitest.config.ts`.
