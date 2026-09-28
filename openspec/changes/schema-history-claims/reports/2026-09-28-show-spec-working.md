# Show spec working — schema-history-claims

- Date: 2026-09-28
- Change: schema-history-claims (DIS-12)
- Branch exercised: `feature/DIS-12-schema-history-claims`, working tree (not yet committed)
- System: local `docker compose` Postgres (`pgvector/pgvector:pg16`, healthy), shared DB
  `postgres://codemind:codemind@localhost:5432/codemind`
- Interfaces: the root npm scripts `db:migrate` / `db:rollback`, and the database itself (SQL
  issued by a `pg` client, the way the future writers — CM-HU-03, 09, 11, 13 — will write). No
  browser UI: Playwright not applicable.
- Driver: [`2026-09-28-demo.mjs`](./2026-09-28-demo.mjs), independent of the Vitest suite.
  - Part A runs the real `npm run db:*` scripts against three throwaway databases.
  - Part B issues SQL on the shared DB, each scenario inside its own `BEGIN` … `ROLLBACK`.
  - Both column contracts are checked against tables **parsed live from the spec markdown**: the
    change's delta for the six new tables, `openspec/specs/graph-schema/spec.md` for L1. They are
    not checked against the tests' hand transcription.
  - Full verbatim output: [`2026-09-28-demo-output.txt`](./2026-09-28-demo-output.txt).
- Command: `DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind node openspec/changes/schema-history-claims/reports/2026-09-28-demo.mjs`
  → exit 0, `SUMMARY: 34 scenarios exercised, 34 match the spec, 0 do not`.

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| Migrate an empty database | `npm run db:migrate` on an empty throwaway DB | exit 0; `0001` UP, `0002` UP; exactly the ten tables | yes | log [A1] |
| Migrated schema matches the history, claim, usage and cache column contract | catalog query vs spec table | 49 spec rows, 49 columns, 0 mismatches; 5 enums with spec labels; `file_commit` PK `(file_id, commit_id)`, `id` elsewhere | yes | log [A2] |
| Migrate an up-to-date database | `npm run db:migrate` again | exit 0, `No migrations to run!`, schema and `pgmigrations` unchanged | yes | log [A3] |
| Roll back only the latest migration | `npm run db:rollback` once | exit 0, `0002` DOWN only; tables `edge, file, project, symbol`, the 6 L1 enums, L1 contract 0 mismatches; `pgmigrations` = `0001_graph-l1` | yes | log [A4] |
| Roll back the L1 graph migration | from "only L1 applied", `npm run db:rollback` | exit 0, `0001` DOWN; no table, no enum | yes | log [A5] |
| Roll back both migrations leaves an empty schema | migrate + two rollbacks, fresh DB | exits 0/0; no table, no enum; `vector` kept | yes | log [A6] |
| Apply, roll back and apply again | migrate → rollback → migrate, fresh DB | exits 0/0/0; second snapshot == first; both contracts 0 mismatches | yes | log [A7] |
| Defaults apply on a minimal claim, query log and cache entry | INSERTs with required columns only | generated ids; `status: current`; `cache_hit: false`; `hit_count: 0`; timestamps set | yes | log [B1] |
| Duplicate sha within a project is rejected | two INSERTs same `(project_id, sha)` | `23505` `commit_project_sha_key` | yes | log [B2] |
| Same sha in two projects is accepted | same `sha`, two projects | accepted | yes | log [B3] |
| Deleting a project deletes its commits | DELETE project with 2 commits | commits after: 0 | yes | log [B4] |
| Duplicate file and commit pair is rejected | same pair twice | `23505` `file_commit_pkey` | yes | log [B5] |
| File-commit pointing to a missing commit is rejected | random `commit_id` | `23503` `file_commit_commit_id_fkey` | yes | log [B6] |
| File-commit pointing to a missing file is rejected | random `file_id` | `23503` `file_commit_file_id_fkey` | yes | log [B7] |
| Deleting a file deletes its file-commit rows | DELETE file | `file_commit` 0, commit still 1 | yes | log [B8] |
| Deleting a commit deletes its file-commit rows | DELETE commit | `file_commit` 0, file still 1 | yes | log [B9] |
| **Fact from the inferred layer is rejected** (DoD) | `FACT` + `L2` + provenance | `23514` **`fact_only_from_l1`** | yes | log [B10] |
| **Inferred claim without provenance is rejected** (DoD) | `INFERENCE` + `L2`, provenance NULL | `23514` **`l2_requires_provenance`** | yes | log [B11] |
| Fact from the observed layer without provenance is accepted | `FACT` + `L1`, provenance NULL | accepted | yes | log [B12] |
| Inference from the inferred layer with provenance is accepted | `INFERENCE` + `L2` + provenance | accepted | yes | log [B13] |
| Invalid claim type is rejected | `type = 'GUESS'` | `22P02` invalid input value for enum `claim_type` | yes | log [B14] |
| Confidence at the bounds is accepted | `confidence` 0 and 1 | both accepted | yes | log [B15] |
| Confidence outside 0..1 is rejected | `confidence = 1.5` | `23514` `claim_confidence_range` | yes | log [B16] |
| Deleting a project deletes its claims | DELETE project with 2 claims | claims after: 0 | yes | log [B17] |
| Invalid evidence span is rejected | `start_line 10`, `end_line 9` | `23514` `evidence_span_valid` | yes | log [B18] |
| Non-positive evidence start line is rejected | `start_line 0` | `23514` `evidence_start_line_positive` | yes | log [B19] |
| Evidence without verification is rejected | `verification` NULL | `23502` not-null on `verification` | yes | log [B20] |
| Deleting a claim deletes its evidence | DELETE claim with 2 evidence rows | evidence after: 0 | yes | log [B21] |
| Deleting a cited file deletes the evidence but keeps the claim | DELETE cited file | evidence 0, claim still 1 | yes | log [B22] |
| Planned drift capability is accepted | `capability = 'drift'` | accepted | yes | log [B23] |
| Unknown capability is rejected | `capability = 'summarise'` | `22P02` invalid input value for enum `query_capability` | yes | log [B24] |
| Deleting a project deletes its query log | DELETE project with 2 rows | query_log after: 0 | yes | log [B25] |
| Cache entry without a normalized question is rejected | `question_normalized` NULL | `23502` not-null on `question_normalized` | yes | log [B26] |
| Deleting a project deletes its cache entries | DELETE project with 2 entries | cache_entry after: 0 | yes | log [B27] |

## Evidence

Verbatim excerpts. The complete run is in [`2026-09-28-demo-output.txt`](./2026-09-28-demo-output.txt).

```text
[A1] Migrate an empty database   (throwaway codemind_demo_756958f8…)
    $ DATABASE_URL=<throwaway> npm run db:migrate
      | ### MIGRATION 0001_graph-l1 (UP) ###
      | ### MIGRATION 0002_history-claims (UP) ###
      exit=0
    tables after: cache_entry, claim, commit, edge, evidence, file, file_commit, project, query_log, symbol
[A2] spec rows parsed: 49; catalog columns in the six tables: 49; mismatches: (none)
[A3]  | No migrations to run!   exit=0
    pgmigrations: 0001_graph-l1, 0002_history-claims; schema unchanged: true
[A4]  | ### MIGRATION 0002_history-claims (DOWN) ###   exit=0
    tables: edge, file, project, symbol; enums: edge_kind, edge_resolution, file_kind, project_framework, project_language, symbol_kind; pgmigrations: 0001_graph-l1
    L1 contract after rollback: 37 rows, mismatches: (none)
[A5]  | ### MIGRATION 0001_graph-l1 (DOWN) ###   exit=0
    tables: (none); enums: (none); pgmigrations: (none)
[A6] tables: (none); enums: (none); extensions: vector
[A7] second == first: true; L1 contract mismatches: (none); history contract mismatches: (none)

[B10] Fact from the inferred layer is rejected
      REJECTED 23514 [fact_only_from_l1]: new row for relation "claim" violates check constraint "fact_only_from_l1"
[B11] Inferred claim without provenance is rejected
      REJECTED 23514 [l2_requires_provenance]: new row for relation "claim" violates check constraint "l2_requires_provenance"
[B14] REJECTED 22P02: invalid input value for enum claim_type: "GUESS"
[B16] REJECTED 23514 [claim_confidence_range]: new row for relation "claim" violates check constraint "claim_confidence_range"
[B18] REJECTED 23514 [evidence_span_valid]: new row for relation "evidence" violates check constraint "evidence_span_valid"
[B20] REJECTED 23502: null value in column "verification" of relation "evidence" violates not-null constraint
[B22] DELETE file → evidence: 0; claim still there: 1

SUMMARY: 34 scenarios exercised, 34 match the spec, 0 do not
```

**First run was a driver bug, not a system bug.** The first run reported 3 mismatches (A2, A4, A7).
The cause was that the spec writes the alias `timestamptz`, while `format_type()` prints the
canonical `timestamp with time zone`, which is the same PostgreSQL type. The driver now maps the
alias (`TYPE_ALIASES`) and the re-run passes 34/34. The output file holds the passing re-run.

No screenshots: the change has no browser UI.

## State

- Before: `pgmigrations` = `0001_graph-l1, 0002_history-claims`. The ten schema tables have 0 rows
  each. Databases on the server: `codemind, postgres, template0, template1`.
- After: identical (`STATE RESTORED (identical): true`).
- Restored: yes.
  - Part B rows were never committed: each scenario ran in its own `BEGIN` … `ROLLBACK`.
  - The three throwaway databases (`codemind_demo_*`) were dropped in `finally`; none is left on
    the server.

## Not demonstrated

- None of the 34 scenarios of the delta spec.
- Out of the delta and not re-run here:
  - The unchanged `DATABASE_URL`-missing scenarios.
  - The L1 table scenarios.
  - These are still covered by the green suite (65/65, report 7) and the DIS-11 demonstration.

## Handoff

The change is **demonstrably working**. Every scenario of the delta spec was exercised against the
real scripts and the real database, and the outcome matched its THEN exactly. That includes the
DoD: both fact/inference violations were rejected by the database and named their constraint. The
shared database is back to its prior state, and no screenshot or other file was left at the
repository root.
