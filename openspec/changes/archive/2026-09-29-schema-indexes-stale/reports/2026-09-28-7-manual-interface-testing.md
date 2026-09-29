# Manual Interface Testing Report

- Date: 2026-09-28
- Change: schema-indexes-stale
- Step: 7 — Backend: Manual Interface Testing

The change touches two interfaces:

- the `npm run db:migrate` / `npm run db:rollback` scripts, which now apply three migrations;
- the trigger that marks claims `stale` when a file's `content_hash` changes. It is reached with
  plain SQL, exactly as a writer (CM-HU-02.2, 05b) will reach it.

Every command ran with `DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind`
(local `docker compose` Postgres, healthy), except where the variable is shown unset. The object
state was read with a small `pg` script over `pg_indexes`, `pg_trigger`, `pg_proc` and
`pgmigrations`. Its "secondary indexes" list excludes the indexes behind primary keys and unique
constraints; its "functions" list excludes the ones pgvector installs.

## 7.1 — Initial state

```text
secondary indexes (17): cache_entry_project_id_idx, cache_entry_question_embedding_hnsw_idx, claim_project_id_idx, claim_stale_idx, edge_project_id_idx, edge_source_file_kind_idx, edge_source_symbol_kind_idx, edge_target_file_kind_idx, edge_target_symbol_kind_idx, evidence_claim_id_idx, evidence_file_id_idx, file_commit_commit_id_idx, file_embedding_hnsw_idx, file_project_content_hash_idx, query_log_project_id_idx, symbol_embedding_hnsw_idx, symbol_file_id_idx
triggers: file_content_hash_marks_claims_stale
functions: mark_claims_stale_on_content_change
tables: 10 | pgmigrations: 0001_graph-l1, 0002_history-claims, 0003_indexes-stale
```

## 7.2 — Success path: `npm run db:migrate`

```text
$ npm run db:migrate
No migrations to run!
exit 0
(state identical to 7.1: 17 secondary indexes, 1 trigger, 1 function, 10 tables, 3 migrations)
```

The database was already up to date, so the command exited 0 and changed nothing. The restore in
7.3 shows `0003` being applied from a pending state.

## 7.3 — Mutating operation: `npm run db:rollback`, then restore

```text
$ npm run db:rollback
### MIGRATION 0003_indexes-stale (DOWN) ###
exit 0
secondary indexes (0):
triggers: (none)
functions: (none)
tables: 10 | pgmigrations: 0001_graph-l1, 0002_history-claims

$ npm run db:migrate          # restore
### MIGRATION 0003_indexes-stale (UP) ###
exit 0
(17 secondary indexes, 1 trigger, 1 function, 10 tables, 3 migrations: as in 7.1)
```

One rollback reverts only `0003`:

- all 17 secondary indexes, the trigger and the function are gone;
- the ten tables stay;
- `pgmigrations` keeps `0001` and `0002`.

`db:migrate` then restored the initial state.

## 7.4 — The trigger, and the error case

Everything below ran inside one transaction that was then rolled back (`BEGIN` … `ROLLBACK`). The
data was:

- a throwaway project `manual-dis13`;
- a file `app/Services/PriceCalculator.php` with `content_hash = 'sha256:aaa'`;
- an L1 claim with `updated_at` set to `2000-01-01`;
- one evidence row that cites the file.

```text
before: status=current updated_at=2000-01-01T00:00:00.000Z
after UPDATE file SET content_hash = 'sha256:aaa' (same value): status=current updated_at=2000-01-01T00:00:00.000Z
after UPDATE file SET content_hash = 'sha256:bbb': status=stale updated_at=2026-09-28T18:33:01.621Z
rows left in project named manual-dis13: 0
```

Writing the same hash again leaves the claim `current`, with `updated_at` untouched. A different
hash turns it `stale` and moves `updated_at` to the transaction time. Nothing survived the
rollback.

Error case:

```text
$ env -u DATABASE_URL npm run db:migrate
DATABASE_URL is not set: point it at the PostgreSQL database to migrate or roll back.
exit 1
```

## 7.6 — Final state

This is identical to 7.1: 17 secondary indexes, the trigger, the function, ten tables and
`pgmigrations` = `0001`, `0002`, `0003`. No test row is left, because the trigger probe was rolled
back and the count check returned 0.

## Outcome

- Status: PASS
- Blocking issues: none
