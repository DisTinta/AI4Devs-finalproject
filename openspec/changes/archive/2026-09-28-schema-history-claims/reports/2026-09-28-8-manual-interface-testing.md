# Manual Interface Testing Report

- Date: 2026-09-28
- Change: schema-history-claims
- Step: 8 — Backend: Manual Interface Testing

Interfaces touched by the change: the `npm run db:migrate` / `npm run db:rollback` scripts (now two
migrations) and the database constraints that the future writers will hit. All commands ran with
`DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind` (local `docker compose`
Postgres, healthy) unless stated. Table and migration state was read with a small `pg` script
(`pg_tables` of `public` + `pgmigrations`).

## 8.1 — Initial state

```text
tables: cache_entry, claim, commit, edge, evidence, file, file_commit, pgmigrations, project, query_log, symbol
pgmigrations: 0001_graph-l1, 0002_history-claims
```

## 8.2 — Success path: `npm run db:migrate`

```text
$ npm run db:migrate
No migrations to run!
exit 0
tables: (the same eleven)
pgmigrations: 0001_graph-l1, 0002_history-claims
```

Up-to-date database: exit 0, nothing changed. Applying `0002` on top of `0001` from pending was
exercised just below (restore) and in task 5.6.

## 8.3 — Mutating operation: `npm run db:rollback`, then restore

```text
$ npm run db:rollback
> Migrating files:
> - 0002_history-claims
### MIGRATION 0002_history-claims (DOWN) ###
exit 0
tables: edge, file, pgmigrations, project, symbol
pgmigrations: 0001_graph-l1

$ npm run db:migrate          # restore
### MIGRATION 0002_history-claims (UP) ###
exit 0
tables: cache_entry, claim, commit, edge, evidence, file, file_commit, pgmigrations, project, query_log, symbol
pgmigrations: 0001_graph-l1, 0002_history-claims
```

One rollback reverts only `0002`: the six new tables go, the four L1 tables stay, `pgmigrations`
keeps only `0001_graph-l1`. Restored with `db:migrate`.

## 8.4 — Constraints and error cases

Claims inserted inside `BEGIN` … `ROLLBACK` (one `SAVEPOINT` per attempt) on a throwaway
`project` row named `manual-dis12`:

```text
FACT + L2 (+provenance)          -> REJECTED 23514 fact_only_from_l1 | new row for relation "claim" violates check constraint "fact_only_from_l1"
INFERENCE + L2, provenance NULL  -> REJECTED 23514 l2_requires_provenance | new row for relation "claim" violates check constraint "l2_requires_provenance"
FACT + L1, provenance NULL       -> ACCEPTED
rows left in project named manual-dis12: 0
```

Error cases of the scripts:

```text
$ env -u DATABASE_URL npm run db:migrate
DATABASE_URL is not set: point it at the PostgreSQL database to migrate or roll back.
exit 1

$ DATABASE_URL=postgres://codemind:codemind@127.0.0.1:5999/codemind npm run db:migrate
could not connect to postgres: Error: connect ECONNREFUSED 127.0.0.1:5999
    ... (errno, code, syscall, address, port)
Migration up failed: connect ECONNREFUSED 127.0.0.1:5999
exit 1
```

The unreachable-host output contains no user name or password (`grep -ci "codemind:codemind\|password"`
→ 0): only address and port.

## 8.6 — Final state

```text
tables: cache_entry, claim, commit, edge, evidence, file, file_commit, pgmigrations, project, query_log, symbol
pgmigrations: 0001_graph-l1, 0002_history-claims
```

Same as 8.1; no test row left (the constraint probes were rolled back and the count check returned 0).

## Outcome

- Status: PASS
- Blocking issues: none
