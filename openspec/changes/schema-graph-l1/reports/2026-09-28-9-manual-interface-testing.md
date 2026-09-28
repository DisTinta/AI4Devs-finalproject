# Manual Interface Testing Report

- Date: 2026-09-28
- Change: schema-graph-l1
- Step: 9 — Backend: Manual Interface Testing (executed by the agent)
- Interface: root npm scripts `db:migrate` / `db:rollback` (runner
  `packages/adapters/store-postgres/src/migrate.ts`)
- Environment: local `docker compose` Postgres (`pgvector/pgvector:pg16`, healthy),
  `DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind` unless stated otherwise

## Commands and responses

| # | Command | Exit | Output (relevant lines) | `public` tables after |
|---|---|---|---|---|
| 9.1 | (state query) | — | — | `edge, file, pgmigrations, project, symbol` |
| 9.2 | `npm run db:migrate` (already up to date) | 0 | `No migrations to run!` | unchanged |
| 9.3 | `npm run db:rollback` | 0 | `### MIGRATION 0001_graph-l1 (DOWN) ###` | `pgmigrations` only |
| 9.3 | `npm run db:migrate` (restore) | 0 | `### MIGRATION 0001_graph-l1 (UP) ###` | `edge, file, pgmigrations, project, symbol` |
| 9.4 | `npm run db:migrate` with `DATABASE_URL` unset | 1 | `DATABASE_URL is not set: point it at the PostgreSQL database to migrate.` | — |
| 9.4 | `npm run db:rollback` with `DATABASE_URL` unset | 1 | same message | — |
| 9.4 | `npm run db:migrate` against `127.0.0.1:5999` (nothing listening), URL with a dummy password | 1 | `Could not connect to postgres: Error: connect ECONNREFUSED 127.0.0.1:5999` / `Migration up failed: connect ECONNREFUSED 127.0.0.1:5999` | — |
| 9.4 | `tsx .../migrate.ts sideways` | 2 | `Usage: migrate.ts up\|down` | — |

- Credentials: the dummy password in the unreachable-host URL appears 0 times in the output
  (checked with `grep -c`). The runner never prints `DATABASE_URL`.

## Data state

- Pre-test: shared DB migrated (`pgmigrations` = `0001_graph-l1`), 0 rows in the four tables.
- Mutating operation: rollback removed the four tables and the migration record; restored with
  `db:migrate`.
- Post-test: identical to pre-test — tables `edge, file, pgmigrations, project, symbol`,
  migration `0001_graph-l1` applied, 0 rows.

## Outcome

- Status: PASS
- Observations: node-pg-migrate also logs its own `Could not connect to postgres` line on connection
  errors (no credentials in it). The missing-URL message says "to migrate" for rollback too; wording
  is acceptable and matches the spec (non-zero exit, message names `DATABASE_URL`).
