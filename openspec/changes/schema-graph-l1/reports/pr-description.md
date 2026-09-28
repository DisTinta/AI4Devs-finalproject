## What changes?

Replaces the `db:migrate` / `db:rollback` placeholders with a real node-pg-migrate runner
(`packages/adapters/store-postgres/src/migrate.ts`, plain SQL `.up.sql` / `.down.sql`) and adds the
first migration with the L1 graph tables `project`, `file`, `symbol` and `edge`. Integration tests
under `tests/integration/store/` cover all 27 scenarios of the `graph-schema` delta spec (OpenSpec
change `schema-graph-l1`, Linear DIS-11 / CM-HU-01.1).

## Why?

<!-- filled in by the human: the business rationale is not yours to generate -->

## How to test it?

1. `docker compose up -d` and wait until the `postgres` container is healthy.
2. `npm ci`
3. Point at the local database (compose defaults):
   `export DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind`
   (PowerShell: `$env:DATABASE_URL = 'postgres://codemind:codemind@localhost:5432/codemind'`).
4. `npm run db:migrate && npm run db:rollback && npm run db:migrate` — the same sequence as CI;
   each step exits 0 and the last leaves `project`, `file`, `symbol`, `edge` in `public`.
5. `npx vitest run tests/integration/store` — 27 passed. Without `DATABASE_URL` locally, the DB
   suites are skipped with a warning; in CI (`CI` set) they fail instead.
6. `npm run lint && npm run typecheck && npm run lint:architecture && npm run docs:coverage`.
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
    per run (a failing migration leaves no partial changes). Chosen over a hand-written runner
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
- **Test isolation without the DIS-22 harness** (`design.md` D5): lifecycle tests run the real npm
  scripts against a throwaway database per test; constraint tests use `BEGIN` / `ROLLBACK` with
  per-test unique values on the shared database, which only that file migrates.
- **Separate chore commit:** `CMD_STATIC_FILE` is now empty in `.claude/sdd-harness.env` (per-file
  `tsc` ignored `tsconfig.base.json` and failed on every test importing `vitest`); the type gate is
  `npm run typecheck`. Documented in `docs/project-context.md`.

## Traceability

| Scenario in the specification | Test that covers it |
|---|---|
| Migrate an empty database | `tests/integration/store/migrations.spec.ts:120` |
| Migrate an up-to-date database | `tests/integration/store/migrations.spec.ts:143` |
| Roll back the L1 graph migration | `tests/integration/store/migrations.spec.ts:157` |
| Apply, roll back and apply again | `tests/integration/store/migrations.spec.ts:173` |
| DATABASE_URL is missing on migrate | `tests/integration/store/migrations.spec.ts:81` |
| DATABASE_URL is missing on rollback | `tests/integration/store/migrations.spec.ts:92` |
| Migrated schema matches the column contract | `tests/integration/store/migrations.spec.ts:131` |
| Defaults apply on a minimal insert | `tests/integration/store/graph-schema-constraints.spec.ts:87` |
| Duplicate project name is rejected | `tests/integration/store/graph-schema-constraints.spec.ts:110` |
| Unknown language is rejected | `tests/integration/store/graph-schema-constraints.spec.ts:119` |
| Duplicate path within a project is rejected | `tests/integration/store/graph-schema-constraints.spec.ts:132` |
| Same path in two projects is accepted | `tests/integration/store/graph-schema-constraints.spec.ts:142` |
| Deleting a project deletes its files | `tests/integration/store/graph-schema-constraints.spec.ts:152` |
| Invalid span is rejected | `tests/integration/store/graph-schema-constraints.spec.ts:165` |
| Non-positive start line is rejected | `tests/integration/store/graph-schema-constraints.spec.ts:173` |
| Deleting a file deletes its symbols | `tests/integration/store/graph-schema-constraints.spec.ts:181` |
| Edge without resolution is rejected | `tests/integration/store/graph-schema-constraints.spec.ts:194` |
| Empty extractor is rejected | `tests/integration/store/graph-schema-constraints.spec.ts:210` |
| Endpoint with both a symbol and a file is rejected | `tests/integration/store/graph-schema-constraints.spec.ts:226` |
| Endpoint with neither a symbol nor a file is rejected | `tests/integration/store/graph-schema-constraints.spec.ts:242` |
| Endpoint pointing to a missing row is rejected | `tests/integration/store/graph-schema-constraints.spec.ts:253` |
| File-to-symbol edge is accepted | `tests/integration/store/graph-schema-constraints.spec.ts:264` |
| Weight at the bounds is accepted | `tests/integration/store/graph-schema-constraints.spec.ts:281` |
| Weight outside 0..1 is rejected | `tests/integration/store/graph-schema-constraints.spec.ts:294` |
| Deleting a symbol deletes its edges | `tests/integration/store/graph-schema-constraints.spec.ts:310` |
| Deleting a file deletes its edges | `tests/integration/store/graph-schema-constraints.spec.ts:325` |
| Deleting a project deletes its edges even when the endpoints survive | `tests/integration/store/graph-schema-constraints.spec.ts:342` |

## Origin

agent+human-review

🤖 Generated with [Claude Code](https://claude.com/claude-code)
