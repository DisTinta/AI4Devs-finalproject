## What changes?

Replaces the `db:migrate` / `db:rollback` placeholders with a real node-pg-migrate runner
(`packages/adapters/store-postgres/src/migrate.ts`, plain SQL `.up.sql` / `.down.sql`) and adds the
first migration with the L1 graph tables `project`, `file`, `symbol` and `edge`. Integration tests
under `tests/integration/store/` (35 tests) cover all 27 scenarios of the `graph-schema` delta spec (OpenSpec
change `schema-graph-l1`, Linear DIS-11 / CM-HU-01.1).

## Why?

Codemind still has no real store schema: `db:migrate` / `db:rollback` are stubs that exit 0, so
CI’s apply → roll back → apply step proves nothing. Every later M1 slice (history/claim tables in
DIS-12, indexes/triggers in DIS-13, the integration harness in DIS-22, and the `StorePort`
adapter) needs a reversible migration runner and the four L1 graph tables (`project`, `file`,
`symbol`, `edge`) with integrity enforced by PostgreSQL, not by application hope. This PR is
DIS-11 / CM-HU-01.1: the first concrete piece of the knowledge graph on disk.

## How to test it?

1. `docker compose up -d` and wait until the `postgres` container is healthy.
2. `npm ci`
3. Point at the local database (compose defaults):
   `export DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind`
   (PowerShell: `$env:DATABASE_URL = 'postgres://codemind:codemind@localhost:5432/codemind'`).
4. `npm run db:migrate && npm run db:rollback && npm run db:migrate` — the same sequence as CI;
   each step exits 0 and the last leaves `project`, `file`, `symbol`, `edge` in `public`.
5. `npx vitest run tests/integration/store` — 35 passed. Without `DATABASE_URL` locally, the DB
   suites are skipped with a warning; in CI (`CI` set) they fail instead.
6. `npm run lint && npm run typecheck && npm run lint:architecture && npm run docs:coverage`.
   CI emulation without a database: with `CI=1` and `DATABASE_URL` unset,
   `npx vitest run --exclude 'tests/integration/**'` exits 0. Plain `npx vitest run` fails by design
   (D5).
7. Error path: unset `DATABASE_URL` and run `npm run db:migrate` — non-zero exit, message names
   `DATABASE_URL`.

Evidence from the agent's run: `openspec/changes/schema-graph-l1/reports/2026-09-28-8-test-and-state-verification.md`
and `2026-09-28-9-manual-interface-testing.md`.

## Decisions / trade-offs

- **Migration tool — node-pg-migrate 9, SQL migrations** (`design.md` D1,
  `docs/adr/20260928-node-pg-migrate-sql-migrations.md`). Dependency justification, as
  `docs/project-context.md` requires:
  - `node-pg-migrate` ^9.0.0 (runtime, `@codemind/adapter-store-postgres`): PostgreSQL-only
    migration runner with a `pgmigrations` bookkeeping table, advisory lock and a single transaction
    per run when `singleTransaction: true` is passed, as `migrate.ts` does (a failing migration
    leaves no partial changes). Chosen over a hand-written runner
    (ordering/locking/bookkeeping would be our code to test) and postgrator (less adopted). Requires
    Node ≥ 20.11; CI uses Node 20.
  - `pg` ^8.23.0 (runtime): the PostgreSQL driver node-pg-migrate needs as a peer dependency; also
    used by the integration tests. The `StorePort` adapter will reuse it.
  - `@types/pg` ^8.23.1 (dev): typings for `pg`, which ships none.
- **Edge endpoints — two nullable FK pairs + `CHECK (num_nonnulls(...) = 1)`** (`design.md` D3,
  `docs/adr/20260928-edge-endpoints-as-fk-pairs.md`). Deviates from `readme.md` §3.1
  (`source_id` / `target_id`), which is updated. Rejected: polymorphic id without FK, synthetic
  per-file symbol.
  - **Note for DIS-13:** the traversal indexes `EDGE(project_id, source_id, kind)` /
    `EDGE(project_id, target_id, kind)` must be redefined over `source_symbol_id` /
    `source_file_id` / `target_symbol_id` / `target_file_id`; `source_id` / `target_id` no longer
    exist. This PR creates no secondary or vector index.
  - Accepted L1 risk: the database does not check that an edge's endpoints belong to
    `edge.project_id`; the writers own that consistency.
- **Rollback spec adjusted after implementation (`016def8`).** The rollback requirement first said
  the down migration removes "every table, type and extension". It now says the down migration
  removes every table and enum type the migration created, but **not** the `vector` extension:
  DIS-12/13 share that extension, and the up section only creates it `IF NOT EXISTS`, so dropping
  it on rollback would break any later migration that relies on it. The test assertion changed
  in the same commit (`toContain('vector')`). The four tables and six enum types are still fully
  reverted, with no `IF EXISTS`, so rolling back a half-present schema fails loudly.
- **Adversarial-review follow-ups closed in this PR:** three more constraint tests (target side of
  "both", source side of "neither", `weight = -0.1`), each shown to fail when its `CHECK` is
  loosened. A whitespace-only `DATABASE_URL` now counts as unset. Rollback with nothing applied is
  pinned as a no-op that exits 0.
- **Known limit for DIS-13:** `tests/integration/store/schema-snapshot.ts` compares columns,
  constraints, enums and extensions only. It does **not** capture indexes, triggers, functions,
  sequences or views. That is enough for migration 0001, which has none. DIS-13 must extend the
  helper (at least `pg_indexes.indexdef` and `pg_trigger`) before reusing it to prove its own
  migration is reversible.
- **CI: DB integration specs run only in the `quality` job, which has Postgres.** The Frontend
  job's test step runs `npx vitest run --exclude 'tests/integration/**'`. Stryker uses
  `vitest.stryker.config.ts`, which excludes `tests/integration/**`, and the mutation step's
  "any test file?" guard in `ci.yml` ignores `tests/integration`. Without these changes, both jobs
  would fail: they run with `CI=true` and no `DATABASE_URL`, so `support.ts` throws on import
  (design D5). D5 itself is unchanged. Until `packages/core` has its first unit test, the mutation
  step keeps skipping, as it did before this PR.
- **`make up` loads `.env`.** The Makefile includes and exports `.env` when it exists, so
  `cp .env.example .env && make up` gets `DATABASE_URL`. `migrate.ts` has no default: plain
  `npm run db:*` without the variable still fails clearly, as the spec requires. `readme.md` now
  marks `DATABASE_URL` as required for the `db:*` scripts.
- **Runner entry point:** the CLI check compares `realpathSync` paths, and folds case on win32.
  Before, running the runner through a symlink or junction exited 0 without migrating. This is
  tested.
- **Single transaction per run, made explicit.** `singleTransaction` defaults to `true` only in
  node-pg-migrate's CLI. The programmatic `runner()` left it `undefined` and committed each
  migration on its own. `migrate.ts` now passes `singleTransaction: true`, and the test "A failing
  later migration leaves no partial changes" (valid 0001 + broken 0002) proves that nothing is
  left applied.
- **Tests are type-checked.** No tsconfig covered `tests/`, so the IDE flagged `TS1479` (under
  Node16 the root package makes the tests CommonJS). `tests/tsconfig.json` uses Vitest's
  resolution (`ESNext` / `Bundler`), and `npm run typecheck` now includes it.
- **Accepted, L1:** the schema allows self-loop edges (source = target) and duplicate edges (same
  endpoints, `kind` and `extractor`), because `edge` has no UNIQUE constraint. The writers own
  deduplication; a later story adds a constraint if needed.
- **Accepted, out of scope:** `edge.extractor` accepts whitespace-only values, and `node_count`,
  `edge_count` and `loc` accept negative numbers (both match the spec). No test covers concurrent
  migrate runs; they rely on node-pg-migrate's default advisory lock.
- **Test isolation without the DIS-22 harness** (`design.md` D5): lifecycle tests run the real npm
  scripts against a throwaway database per test; constraint tests use `BEGIN` / `ROLLBACK` with
  per-test unique values on the shared database, which only that file migrates.
- **Separate chore commit:** `CMD_STATIC_FILE` is now empty in `.claude/sdd-harness.env` (per-file
  `tsc` ignored `tsconfig.base.json` and failed on every test importing `vitest`); the type gate is
  `npm run typecheck`. Documented in `docs/project-context.md`.

## Traceability

| Scenario in the specification | Test that covers it |
|---|---|
| Migrate an empty database | `tests/integration/store/migrations.spec.ts:163` |
| Migrate an up-to-date database | `tests/integration/store/migrations.spec.ts:191` |
| Roll back the L1 graph migration | `tests/integration/store/migrations.spec.ts:222` |
| Apply, roll back and apply again | `tests/integration/store/migrations.spec.ts:239` |
| DATABASE_URL is missing on migrate | `tests/integration/store/migrations.spec.ts:85` (unset), `:108` (blank) |
| DATABASE_URL is missing on rollback | `tests/integration/store/migrations.spec.ts:96` |
| Migrated schema matches the column contract | `tests/integration/store/migrations.spec.ts:174` |
| Defaults apply on a minimal insert | `tests/integration/store/graph-schema-constraints.spec.ts:87` |
| Duplicate project name is rejected | `tests/integration/store/graph-schema-constraints.spec.ts:110` |
| Unknown language is rejected | `tests/integration/store/graph-schema-constraints.spec.ts:119` |
| Duplicate path within a project is rejected | `tests/integration/store/graph-schema-constraints.spec.ts:132` |
| Same path in two projects is accepted | `tests/integration/store/graph-schema-constraints.spec.ts:142` |
| Deleting a project deletes its files | `tests/integration/store/graph-schema-constraints.spec.ts:152` |
| Invalid span is rejected | `tests/integration/store/graph-schema-constraints.spec.ts:165` |
| Non-positive start line is rejected | `tests/integration/store/graph-schema-constraints.spec.ts:184` |
| Deleting a file deletes its symbols | `tests/integration/store/graph-schema-constraints.spec.ts:192` |
| Edge without resolution is rejected | `tests/integration/store/graph-schema-constraints.spec.ts:205` |
| Empty extractor is rejected | `tests/integration/store/graph-schema-constraints.spec.ts:221` |
| Endpoint with both a symbol and a file is rejected | `tests/integration/store/graph-schema-constraints.spec.ts:237` (source side), `:266` (target side) |
| Endpoint with neither a symbol nor a file is rejected | `tests/integration/store/graph-schema-constraints.spec.ts:253` (target side), `:282` (source side) |
| Endpoint pointing to a missing row is rejected | `tests/integration/store/graph-schema-constraints.spec.ts:293` |
| File-to-symbol edge is accepted | `tests/integration/store/graph-schema-constraints.spec.ts:304` |
| Weight at the bounds is accepted | `tests/integration/store/graph-schema-constraints.spec.ts:321` |
| Weight outside 0..1 is rejected | `tests/integration/store/graph-schema-constraints.spec.ts:334` (`1.5`), `:350` (`-0.1`) |
| Deleting a symbol deletes its edges | `tests/integration/store/graph-schema-constraints.spec.ts:366` |
| Deleting a file deletes its edges | `tests/integration/store/graph-schema-constraints.spec.ts:387` |
| Deleting a project deletes its edges even when the endpoints survive | `tests/integration/store/graph-schema-constraints.spec.ts:411` |

## Origin

agent+human-review

🤖 Generated with [Claude Code](https://claude.com/claude-code)
