## Why

Codemind has no database schema yet: `npm run db:migrate` and `npm run db:rollback` are placeholders
that print "pending Ticket 3" and exit 0, so CI's "apply → roll back → apply" step proves nothing.
Every later slice of M1 (history/claim tables in DIS-12, the integration harness in DIS-22, the
`StorePort` adapter) needs a real, reversible migration runner and the four L1 graph tables
(`project`, `file`, `symbol`, `edge`) to build on. This change is sub-issue **DIS-11**
(`CM-HU-01.1`, parent DIS-5 / `CM-HU-01`).

## What Changes

- Adopt **node-pg-migrate** as the SQL migration tool (plus the `pg` driver) in
  `@codemind/adapter-store-postgres`; justification recorded in `design.md` and repeated in the PR,
  as `docs/project-context.md` requires for new dependencies.
- Add a migration runner in `packages/adapters/store-postgres` that reads `DATABASE_URL` and
  applies or reverts SQL migrations from `packages/adapters/store-postgres/migrations`
  (`PATH_MIGRATIONS` in `.claude/sdd-harness.env`).
- Replace the `db:migrate` / `db:rollback` placeholders in the root `package.json` with calls to that
  runner. `db:seed`, `seed:build` and `verify` stay placeholders.
- First migration: enable the `vector` extension, create the enums used by the L1 tables and the
  tables `project`, `file`, `symbol`, `edge` as described in `readme.md` §3.1, with its down
  section dropping every table and enum it created (the shared `vector` extension stays).
- **Deviation from `readme.md` §3.1 (decided by the author):** `edge` does not use a single
  `source_id` / `target_id` pair. Each endpoint becomes two nullable foreign keys
  (`source_symbol_id` / `source_file_id`, `target_symbol_id` / `target_file_id`) with a `CHECK` that
  exactly one is set per endpoint, so referential integrity and `on delete cascade` are enforced by
  the database. The §3.1 diagram is updated in the same change, and DIS-13's traversal indexes
  (specified over `source_id` / `target_id`) will have to be defined over the four new columns.
- Integration test that runs apply → rollback → apply against the Postgres from
  `docker-compose.yml` / CI and asserts the schema is identical after re-application.

## Capabilities

### New Capabilities

- `graph-schema`: versioned, reversible PostgreSQL schema for the L1 knowledge graph (`project`,
  `file`, `symbol`, `edge`) and the `db:migrate` / `db:rollback` commands that apply and revert it.
  Later sub-issues (DIS-12, DIS-13) extend this same capability with the remaining tables, indexes
  and triggers.

### Modified Capabilities

<!-- none: openspec/specs/ is empty -->

## Impact

- **Code:** `packages/adapters/store-postgres/` (new `migrations/` folder, runner module, package
  dependencies), root `package.json` scripts. SQL stays inside `store-postgres`
  (`.dependency-cruiser.cjs` rule `api-no-sql`); `packages/core` is untouched.
- **Dependencies:** `node-pg-migrate`, `pg` (runtime, `store-postgres` workspace). `@types/pg` if
  the installed `pg` lacks typings.
- **CI:** the existing "Migrations (apply and roll back)" step stops being a no-op; the Tests step now
  runs a real integration test against the CI Postgres service.
- **Docs:** `readme.md` §3.1 diagram (`edge` endpoints), `docs/project-context.md` (commands and
  gotchas that call `db:migrate` / `db:rollback` placeholders).
- **Privacy:** no personal data. The four tables hold repository structure only (paths, symbol
  names, hashes). `commit.author_hash` pseudonymisation belongs to DIS-12.

## Non-goals

- Tables `commit`, `file_commit`, `claim`, `evidence`, `query_log`, `cache_entry` and the
  `fact_only_from_l1` / `l2_requires_provenance` constraints (DIS-12).
- A database check that an edge's endpoints belong to the edge's `project_id`: accepted L1 risk,
  consistency is owned by the writers (analyzer adapters).
- Traversal indexes, the partial `stale` index, HNSW indexes and the `content_hash` invalidation
  trigger (DIS-13). The `vector(1536)` columns exist, but no vector index is created.
- `StorePort` implementation or any domain query (CM-HU-02).
- Test-database isolation, per-test transactions and factories (DIS-22).
- `db:seed`, `seed:build`, `seeds/graph-dump.sql`.
