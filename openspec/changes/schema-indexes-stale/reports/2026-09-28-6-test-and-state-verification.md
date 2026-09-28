# Test and State Verification Report

- Date: 2026-09-28
- Change: schema-indexes-stale
- Step: 6 — Backend: Run Tests and Verify Data State

All commands ran against the local `docker compose` Postgres (`pgvector/pgvector:pg16`, healthy,
pgvector 0.8.6), with `DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind`, on branch
`feature/DIS-13-schema-indexes-stale`.

## Commands executed

- Baseline and post-state: a `pg` script that lists:
  - the `pgmigrations` rows;
  - the tables in `public` and the row count of each;
  - the number of indexes;
  - the user triggers;
  - the databases on the server.
- `npx vitest run tests/integration/store` (targeted; also run twice in task 4.5).
- `npx vitest run` (the required suite).
- The gates: `npm run lint`, `npm run typecheck`, `npm run lint:architecture` and
  `npm run docs:coverage`.
- The CI migration step: `npm run db:migrate && npm run db:rollback && npm run db:migrate`.
- Task 2.4: `EXPLAIN` of the generic plan of the four endpoint cascade deletes.
- Tasks 3.4 and 4.4: runs with a deliberately broken `0003`, restored afterwards.

## Test results

- Targeted tests: 77 passed, 0 failed, 0 skipped, across 4 files:
  - `migrations.spec.ts`: 18;
  - `graph-schema-constraints.spec.ts`: 24;
  - `history-claims-constraints.spec.ts`: 28;
  - `indexes-stale.spec.ts`: 7.
- Required suite: 77 passed, 0 failed, 0 skipped. The store files are the only test files today.
- Runtime: about 63 s per run. Task 4.5 ran the store folder twice in a row: 77/77 both times, and
  the three files that migrate the shared DB did not interfere with each other.
- Gates:
  - `lint`: exit 0, with the 4 existing `no-empty-object-type` warnings in `packages/core/src/ports/*`;
  - `typecheck`: exit 0;
  - `lint:architecture`: exit 0, with the 8 existing `no-orphans` warnings;
  - `docs:coverage`: exit 0.

  None of these warnings comes from this change.
- CI migration step: exit 0. It printed `No migrations to run!`, then
  `0003_indexes-stale (DOWN)`, then `0003_indexes-stale (UP)`, so the rollback reverts only `0003`.
- Scenario coverage: each of the 14 `#### Scenario:` titles of the delta spec matches one test.
- `snapshotSchema` (task 1.2):
  - on `0001` + `0002`, it reports 13 indexes (10 primary keys and 3 unique constraints),
    0 triggers and 0 functions: the 118 pgvector functions in `public` are excluded as
    extension-owned;
  - after `0003`, it reports 30 indexes, 1 trigger and 1 function.
- **EXPLAIN (task 2.4).** Setup: `enable_seqscan = off`, `plan_cache_mode = force_generic_plan`,
  inside a transaction that was rolled back. Each of the four cascade-shaped deletes
  `DELETE FROM edge WHERE <endpoint> = $1` uses its partial index:

  ```text
  Index Scan using edge_source_symbol_kind_idx on edge   Index Cond: (source_symbol_id = $1)
  Index Scan using edge_source_file_kind_idx on edge     Index Cond: (source_file_id = $1)
  Index Scan using edge_target_symbol_kind_idx on edge   Index Cond: (target_symbol_id = $1)
  Index Scan using edge_target_file_kind_idx on edge     Index Cond: (target_file_id = $1)
  ```

  The planner proves `col = $1 ⇒ col IS NOT NULL`, so the partial indexes serve the FK cascade, as
  `design.md` D3 assumed. The tables are empty, so this shows the indexes can be used; it does not
  measure speed.
- **Forced failures.** Each broken file was restored from a scratch backup (`cmp` identical). The
  migration is still untracked, so `git checkout` could not restore it. The shared DB was rolled
  back and re-applied after each break.
  - 3.4 A. Removing the trigger's `WHEN` guard made "Writing the same content hash again leaves
    claims current" fail: `expected { status: 'stale', … } to deeply equal { status: 'current', … }`.
  - 3.4 B. Replacing `WHERE status = 'current'` with `WHERE true` made "A claim already stale is
    not touched" fail: `updated_at` moved. The trigger file went back to 7/7 after both.
  - 4.4 C. Omitting `DROP INDEX evidence_file_id_idx;` from the down section made two tests fail:
    - "Roll back only the latest migration", because the snapshot differed from the `0001` +
      `0002` reference;
    - "Apply, roll back and apply again", because re-creating the leftover index failed.
  - 4.4 D. Omitting `DROP FUNCTION mark_claims_stale_on_content_change();` made four tests fail:
    "Roll back only the latest migration", "Roll back every migration leaves an empty schema", and
    both "apply, roll back, apply" tests. The function survives even a full rollback, and
    `CREATE FUNCTION` without `OR REPLACE` fails when it is re-applied. `migrations.spec.ts` went
    back to 18/18 after both.
- End-to-end testing (step 8): not applicable. The change adds no user interface and no user
  workflow. The only interfaces are the `db:*` scripts, exercised in step 7.

## Data state verification

- Pre-test baseline:
  - `pgmigrations`: `0001_graph-l1`, `0002_history-claims`, `0003_indexes-stale`
  - Tables in `public` (excluding `pgmigrations`): the ten schema tables, 0 rows each
  - Indexes in `public` (excluding `pgmigrations`): 30
  - User triggers: `file_content_hash_marks_claims_stale`
  - Databases: `codemind`, `postgres`, `template0`, `template1`, with no throwaway DB left
- Post-test validation: byte-identical to the baseline
- State restored: Yes. There was nothing to restore.
- Restoration actions: none

## UI evidence (if applicable)

- (none: the change has no browser UI)

## Outcome

- Status: PASS
- Blocking issues: none
