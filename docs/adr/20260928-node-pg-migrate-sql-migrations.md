# node-pg-migrate with plain SQL migrations

## Status
Accepted

## Context and problem
Until DIS-11, `npm run db:migrate` / `db:rollback` were placeholders that exited 0, so CI's
"apply → roll back → apply" step proved nothing. The schema (`readme.md` §3) is specified in SQL and
the next slices add CHECKs, partial and HNSW indexes and triggers (DIS-12, DIS-13) that must be
reviewable as SQL. `docs/backend-standards.md` requires every migration to be reversible and tested.
The project uses no ORM or query builder, and a new dependency must be justified. Decided by the
author while planning DIS-11 (`openspec/changes/schema-graph-l1/design.md` D1).

## Options considered
* node-pg-migrate, with migrations written in SQL rather than its JS DSL.
* A hand-written runner over `pg`.
* postgrator.

## Decision
We choose **node-pg-migrate 9 with SQL migrations** because:
* It is PostgreSQL-only and maintained, keeps applied state in a `pgmigrations` table, takes an
  advisory lock and runs pending migrations in a single transaction by default, so a migration that
  fails part-way leaves no partial changes.
* With a hand-written runner, ordering, locking and bookkeeping would be our own code to test;
  postgrator is lighter but less adopted.
* SQL files (the `sql` loader grouping `NNNN_name.up.sql` + `NNNN_name.down.sql`) keep the schema
  reviewable as the SQL the readme specifies; the marker-based single file is the tool's
  `legacySql` loader.

## Consequences
* New runtime dependencies in `@codemind/adapter-store-postgres`: `node-pg-migrate` (^9, requires
  Node ≥ 20.11; CI uses Node 20) and `pg` (^8); `@types/pg` as a dev dependency.
* The runner (`packages/adapters/store-postgres/src/migrate.ts`, run with `tsx`) must never disable
  `singleTransaction`.
* Rollback reverts one migration per call; every migration ships its `.down.sql`.
* Applied migrations are never edited on the base branch; changes go in a new numbered pair.
