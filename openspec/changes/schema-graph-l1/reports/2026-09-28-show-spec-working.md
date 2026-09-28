# Show spec working — schema-graph-l1

- Date: 2026-09-28
- Change: schema-graph-l1 (DIS-11)
- Commit exercised: `f794c97` on `feature/DIS-11-schema-graph-l1`
- System: local `docker compose` Postgres (`pgvector/pgvector:pg16`, healthy), shared DB
  `postgres://codemind:codemind@localhost:5432/codemind`
- Interfaces: the root npm scripts `db:migrate` / `db:rollback`, and the database itself (SQL
  issued by a `pg` client, the same way the future store adapter and analyzers will write). No
  browser UI: Playwright not applicable.
- Driver: [`2026-09-28-demo.mjs`](./2026-09-28-demo.mjs), independent of the Vitest suite. The
  column contract is checked against the table **parsed live from `specs/graph-schema/spec.md`**, not
  against the test's hand transcription. Full verbatim output:
  [`2026-09-28-demo-output.log`](./2026-09-28-demo-output.log).

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| Migrate an empty database | `npm run db:migrate` on empty throwaway DB | exit 0; tables `(none)` → `edge, file, project, symbol` | yes | log [A1] |
| Migrated schema matches the column contract | catalog query after migrate vs spec table | 37 spec rows, 37 columns, 0 mismatches; 6 enums with spec values | yes | log [A2] |
| Migrate an up-to-date database | `npm run db:migrate` again | exit 0, `No migrations to run!`, schema unchanged `true` | yes | log [A3] |
| Roll back the L1 graph migration | `npm run db:rollback` | exit 0; tables `(none)`, enums `{}`, extensions `[]` | yes | log [A4] |
| Apply, roll back and apply again | migrate → rollback → migrate | all exit 0; `second == first: true`; contract mismatches none | yes | log [A5] |
| DATABASE_URL is missing on migrate | `npm run db:migrate`, var unset | exit 1, `DATABASE_URL is not set: …` | yes | log [A6] |
| DATABASE_URL is missing on rollback | `npm run db:rollback`, var unset | exit 1, same message | yes | log [A7] |
| Defaults apply on a minimal insert | INSERT project/file with required columns only | generated uuids, `is_sample:false`, counts `0`, `created_at` set, `redacted:false` | yes | log [B1] |
| Duplicate project name is rejected | two INSERTs same `name` | `23505` `project_name_key` | yes | log [B2] |
| Unknown language is rejected | INSERT `language='python'` | `22P02` invalid input value for enum `project_language` | yes | log [B3] |
| Duplicate path within a project is rejected | two INSERTs same `(project_id, path)` | `23505` `file_project_path_key` | yes | log [B4] |
| Same path in two projects is accepted | same path, two projects | both OK | yes | log [B5] |
| Deleting a project deletes its files | DELETE project, count file | `files_left: 0` | yes | log [B6] |
| Invalid span is rejected | symbol `10..9` | `23514` `symbol_span_valid` | yes | log [B7] |
| Non-positive start line is rejected | symbol `start_line=0` | `23514` `symbol_start_line_positive` | yes | log [B8] |
| Deleting a file deletes its symbols | DELETE file, count symbol | `symbols_left: 0` | yes | log [B9] |
| Edge without resolution is rejected | edge `resolution=NULL` | `23502` not-null on `resolution` | yes | log [B10] |
| Empty extractor is rejected | edge `extractor=''` | `23514` `edge_extractor_not_empty` | yes | log [B11] |
| Endpoint with both a symbol and a file is rejected | source symbol + source file | `23514` `edge_source_exactly_one` | yes | log [B12] |
| Endpoint with neither a symbol nor a file is rejected | no target | `23514` `edge_target_exactly_one` | yes | log [B13] |
| Endpoint pointing to a missing row is rejected | random `source_symbol_id` | `23503` `edge_source_symbol_id_fkey` | yes | log [B14] |
| File-to-symbol edge is accepted | file → symbol, `describes`, `heuristic` | OK, id returned | yes | log [B15] |
| Weight at the bounds is accepted | `weight=0` and `weight=1` | both OK | yes | log [B16] |
| Weight outside 0..1 is rejected | `weight=1.5` | `23514` `edge_weight_range` | yes | log [B17] |
| Deleting a symbol deletes its edges | DELETE target symbol, count edge | `edges_left: 0` | yes | log [B18] |
| Deleting a file deletes its edges | DELETE source file, count edge | `edges_left: 0` | yes | log [B19] |
| Deleting a project deletes its edges even when the endpoints survive | edge of project A over project B files; DELETE A | `edges_left: 0`, `project_b_files_left: 2` | yes | log [B20] |

27 of 27 scenarios of `specs/graph-schema/spec.md` demonstrated.

## Evidence

Verbatim excerpts (full output in [`2026-09-28-demo-output.log`](./2026-09-28-demo-output.log)):

```text
[A1] Migrate an empty database
    tables before: (none)
    $ DATABASE_URL=<throwaway> npm run db:migrate
      | > Migrating files:
      | > - 0001_graph-l1
      | ### MIGRATION 0001_graph-l1 (UP) ###
      exit=0
    tables after: edge, file, project, symbol

[A2] Migrated schema matches the column contract (parsed from spec.md)
    spec rows: 37 · actual columns: 37 · mismatches: none

[A3] Migrate an up-to-date database
    $ DATABASE_URL=<throwaway> npm run db:migrate
      | No migrations to run!
      exit=0
    schema unchanged: true

[A4] Roll back the L1 graph migration
    $ DATABASE_URL=<throwaway> npm run db:rollback
      | ### MIGRATION 0001_graph-l1 (DOWN) ###
      exit=0
    tables: (none) · enums: {} · extensions: []

[A5] Apply, roll back and apply again
    second == first: true · contract mismatches: none

[A6] DATABASE_URL is missing on migrate
    $ (DATABASE_URL unset) npm run db:migrate
      | DATABASE_URL is not set: point it at the PostgreSQL database to migrate.
      exit=1

[A7] DATABASE_URL is missing on rollback
    $ (DATABASE_URL unset) npm run db:rollback
      | DATABASE_URL is not set: point it at the PostgreSQL database to migrate.
      exit=1

[B3 Unknown language is rejected]
      -> REJECTED sqlstate=22P02: invalid input value for enum project_language: "python"
[B10 Edge without resolution is rejected]
      -> REJECTED sqlstate=23502: null value in column "resolution" of relation "edge" violates not-null constraint
[B11 Empty extractor is rejected]
      -> REJECTED sqlstate=23514 constraint=edge_extractor_not_empty: new row for relation "edge" violates check constraint "edge_extractor_not_empty"
[B12 Endpoint with both a symbol and a file is rejected]
      -> REJECTED sqlstate=23514 constraint=edge_source_exactly_one: new row for relation "edge" violates check constraint "edge_source_exactly_one"
[B14 Endpoint pointing to a missing row is rejected]
      -> REJECTED sqlstate=23503 constraint=edge_source_symbol_id_fkey: insert or update on table "edge" violates foreign key constraint "edge_source_symbol_id_fkey"
[B20 Deleting a project deletes its edges even when the endpoints survive]
    SELECT (SELECT count(*) FROM edge WHERE id = $1) AS edges_left, (SELECT count(*) FROM file WHERE id IN ($2, $3)) AS project_b_files_left
      -> OK [{"edges_left":"0","project_b_files_left":"2"}]
```

Constraints present after migration (from [A2]), 19 in total, including:
`edge_source_exactly_one CHECK ((num_nonnulls(source_symbol_id, source_file_id) = 1))`,
`edge_weight_range CHECK (((weight >= (0)::double precision) AND (weight <= (1)::double precision)))`,
`edge_project_id_fkey FOREIGN KEY (project_id) REFERENCES project(id) ON DELETE CASCADE`.

No screenshots: the change has no browser UI.

## State

- Before: databases `codemind, postgres, template0, template1`; `public` tables
  `edge, file, pgmigrations, project, symbol`; `pgmigrations` = `0001_graph-l1`; rows
  project/file/symbol/edge = 0/0/0/0.
- After: identical — same databases, same tables, `pgmigrations` = `0001_graph-l1`, rows 0/0/0/0.
- Restored: yes. Lifecycle scenarios ran on throwaway database
  `codemind_demo_e955c6d269b54eedb55319f56a10bde8`, created and dropped through the `pg` client (log
  confirms `dropped throwaway database …`). Every table scenario ran in its own transaction ended with
  `ROLLBACK`, so no row was committed.

## Not demonstrated

- None of the 27 scenarios.
- Out of scope by design: partial-failure atomicity is a non-normative note in the spec (guaranteed by
  node-pg-migrate's `singleTransaction`), not a scenario; it was not exercised by injecting a broken
  migration.

## Handoff

**The change is demonstrably working.** All 27 scenarios were exercised against the running system
through its real interfaces, each matching its `THEN` exactly, and the data state was restored to the
baseline. No screenshot or other evidence file was written at the repository root.
