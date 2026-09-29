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

## Addendum — re-run after `/verify-against-spec` (2026-09-28)

The author approved four fixes. Two change `0003`, two change only the spec:

1. The trigger is now `AFTER UPDATE ON file … WHEN (OLD.content_hash IS DISTINCT FROM
   NEW.content_hash)`, without `OF content_hash`. A `BEFORE` trigger that rewrote the hash in an
   `UPDATE` not naming the column can no longer skip invalidation.
2. Spec: `updated_at` is set to the **transaction time (`now()`)**, not to "the current time".
3. The function has `SET search_path = public`. The catalog confirms `proconfig =
   {search_path=public}`.
4. Spec: "exactly the secondary indexes below, and no other". The index contract test already
   asserted the exact set.

`0003` was rolled back on the shared DB, edited and re-applied.

- **A first apply attempt failed with `syntax error at or near "$"`.** The cause was the edit
  script: JavaScript's `String.replace` turns `$$` in the replacement text into `$`, so the
  function body lost its dollar-quote delimiter. The migration's single transaction left nothing
  applied (`pgmigrations` stayed `0001`, `0002`). Fixed, then applied.
- `npx vitest run tests/integration/store` → 4 files, **77 passed**, 0 failed, 0 skipped.
- **Trigger forced failures, re-run.** `0003` was restored from a scratch copy (`cmp` identical)
  and the shared DB re-applied after each break:
  - A. The `WHEN` guard removed. **Two** tests now fail: "Updating other columns of a file leaves
    its claims current" and "Writing the same content hash again leaves claims current". Without
    `OF content_hash`, the guard is the only thing that tells a hash change apart from any other
    update.
  - B. `status = 'current'` removed. "A claim already stale is not touched" fails, because
    `updated_at` moved.
- After restoring: 77/77. The demo driver passes 14/14 (`14 scenarios exercised, 14 match the
  spec`), and the shared DB state is identical before and after.

## Addendum 2 — re-run after `/adversarial-review` (2026-09-28)

The review gave **FAIL**: no Blocker, one Major. The Major was that the reason for commit `7dc275f`
(dropping `OF content_hash`) had no test, so putting `OF content_hash` back left all 7 trigger
tests green. The author approved the following:

- **Two new scenarios, each with a test** in `indexes-stale.spec.ts`. The spec now has 16
  scenarios.
  - "A content hash rewritten by another trigger still marks the claims that cite it stale". The
    test creates a throwaway `BEFORE UPDATE` trigger inside its own transaction; the trigger
    rewrites `NEW.content_hash` of that one file. The test then runs `UPDATE file SET loc = 42`.
  - "Invalidation works whatever the session's search_path". The test runs
    `SET LOCAL search_path = pg_catalog`, then a schema-qualified `UPDATE public.file …`.

  The requirement text now says that invalidation depends only on the old and new hash, not on
  which columns the `UPDATE` names, and not on the session's `search_path`.
- **Forced failures.** Each was restored with `git checkout` (`git diff` clean), and the shared DB
  was rolled back and re-applied:
  - E. `AFTER UPDATE OF content_hash ON file` reintroduced: "A content hash rewritten by another
    trigger…" fails with `expected 'current' to be 'stale'`. The other 8 still pass, which proves
    the gap the review found was real.
  - F. `SET search_path = public` removed: "Invalidation works whatever the session's search_path"
    fails with `error: relation "claim" does not exist`.
- **Lifecycle tests** (`migrations.spec.ts`):
  - The full-cycle test asserts the literal list `0001_graph-l1`, `0002_history-claims`,
    `0003_indexes-stale` before the rollback and after the re-apply.
  - `rollbackAll` now has an upper bound (one call per known migration) and asserts that each
    `db:rollback` reverts exactly one migration. A rollback that exits 0 without reverting anything
    fails at once instead of looping to the timeout.
- **Index helper** (`schema-snapshot.ts`):
  - The SQL now has an `ORDER BY`, and the sort breaks ties on the predicate.
  - The predicate normaliser strips every cast (`::character varying`, `::"MyType"`,
    `::text[]`), checked on sample predicates.
  - The limits of `unindexedCascadingForeignKeys` are documented: composite FKs are checked on
    their first column, and any leading index counts.
- **`design.md` Risks:** two new entries, cross-project invalidation through cross-project
  evidence, and deadlocks between concurrent re-indexes. Both are also noted on Linear DIS-23 and
  DIS-10.
- **Spec edits after implementation** ("transaction time", "exactly these secondary indexes"):
  the author approved them explicitly before they were made (2026-09-28).

Results:

- `npx vitest run tests/integration/store`: 4 files, **79 passed**, 0 failed, 0 skipped (63 s).
- Demo driver: `16 scenarios exercised, 16 match the spec, 0 do not`, and the state was restored
  identical.
- Shared DB afterwards:
  - user triggers: `file_content_hash_marks_claims_stale` only;
  - non-extension functions: `mark_claims_stale_on_content_change` only, so no helper trigger or
    function survived;
  - `pgmigrations`: `0001`, `0002`, `0003`.

## Addendum 3 — re-run after the second `/adversarial-review` (2026-09-28)

The review gave PASS WITH GAPS, with one Major: nothing pinned the trigger's link between a claim
and its own evidence (`e.claim_id = claim.id`). With the link dropped, any change to a cited file
would stale every `current` claim in the database. All 9 trigger tests stayed green, because in
"Claims citing only other files…" no claim cited the changed file B. The author approved these
changes:

- **"Claims citing only other files stay current" is reinforced.** A second claim now cites file B.
  The test asserts that the claim on A stays `current` with `updated_at` unchanged, and that the
  claim on B turns `stale`.
- **`SET search_path = public, pg_temp`.** When `pg_temp` is not listed, PostgreSQL searches it
  *first* for tables. Listing it last stops a session temporary table from shadowing `claim` or
  `evidence`. The catalog confirms `proconfig = {"search_path=public, pg_temp"}`.
- **Two new scenarios, 18 in total:**
  - "Clearing a content hash marks the claims that cite it stale": `h → NULL` counts as a change.
    The author accepted this on purpose.
  - "A session temporary table named claim does not intercept invalidation".
- **`updated_at` is asserted exactly equal to the transaction's `now()`** in the first trigger
  test.
- **The `BEFORE`-trigger test runs on its own throwaway database.** Its `CREATE TRIGGER … ON file`
  no longer locks the shared `file` table for the parallel constraint files.
- **`secondaryIndexShapes`** now excludes only indexes that back `p`, `u` or `x` constraints. An
  FK's `conindid` points at the referenced unique index, so FKs no longer count.

**Forced failures.** Each broken file was restored from a scratch copy (`cmp` identical), because
`0003` had uncommitted edits. The shared DB was rolled back and re-applied after each break.

- G. `e.claim_id = claim.id` removed. "Claims citing only other files stay current" fails with
  `expected { status: 'stale', … } to deeply equal { status: 'current', … }`. The other 10 pass.
- H. `search_path = public` without `pg_temp`. "A session temporary table named claim does not
  intercept invalidation" fails with `expected 'current' to be 'stale'`: the trigger updated the
  temp table, not the real one.
- E, re-run after moving the `BEFORE` test to a throwaway DB. `OF content_hash` reintroduced:
  "A content hash rewritten by another trigger…" still fails with `expected 'current' to be
  'stale'`.

**Results:**

- `npx vitest run tests/integration/store`, twice in a row: 4 files, **81 passed**, 0 failed,
  0 skipped (about 63–65 s).
- lint and typecheck: exit 0.
- Demo driver: `18 scenarios exercised, 18 match the spec, 0 do not`, and the state was restored
  identical.
- Shared DB afterwards:
  - user triggers: `file_content_hash_marks_claims_stale` only;
  - non-extension functions: `mark_claims_stale_on_content_change` only;
  - no leftover throwaway database;
  - `pgmigrations`: `0001`, `0002`, `0003`.

## Addendum 4 — re-run after the third `/adversarial-review` (2026-09-29)

The review verdict was PASS WITH GAPS: no Blockers, no Majors, and 6 Minors, fixed here (task 5.6).
Two Questions were left out on purpose:

- dropping `file (project_id, content_hash)` is a product decision, because `readme.md` §3.2 asks
  for it;
- dropping `status` from `claim_stale_idx` is cosmetic, and the spec table fixes it.

**Trigger `EXPLAIN` (non-normative, `design.md` D5).**

- Setup: on the shared DB, inside `BEGIN … ROLLBACK`, 1 project, 2 000 files, 20 000 claims (10 %
  `stale`) and 20 000 evidence rows (10 per file), then `ANALYZE` of the three tables.
- Method: `SET LOCAL plan_cache_mode = force_generic_plan`, then the function's `UPDATE` as a
  prepared statement with `$1` for `NEW.id`, run with `EXPLAIN ANALYZE`.

```text
Update on claim
  ->  Nested Loop  (actual rows=10 loops=1)
        ->  HashAggregate  Group Key: e.claim_id
              ->  Index Scan using evidence_file_id_idx on evidence e  Index Cond: (file_id = $1)
        ->  Index Scan using claim_pkey on claim  (loops=10)  Index Cond: (id = e.claim_id)
              Filter: (status = 'current'::claim_status)
```

The planner turns the `EXISTS` into a semi-join that starts from `evidence`. It never scans
`claim`. The `UPDATE … FROM evidence` form gives the same index path, so the function is left
unchanged and no index is added.

**Changes.**

- `indexes-stale.spec.ts`:
  - `updated_at = now()` is now compared in SQL, at microsecond precision (`updatedAtIsNow`);
  - new scenario and test: "One statement that changes several files marks every claim citing them
    stale". The test updates two files with `WHERE id = ANY($1)`: the claim citing A and B, and
    the one citing B, go `stale` with `updated_at = now()`, and the claim citing C is untouched.
- `schema-snapshot.ts` → `secondaryIndexShapes`:
  - now reports `unique` (`indisunique`);
  - keeps key columns (`indnkeyatts`) separate from `included`;
  - lists btree opclasses whenever one is not the default (`opcdefault`).
- `migrations.spec.ts`: the expected shapes gain `unique: false` and `included: []`.
- Spec: the "Query and vector indexes" requirement and its scenario now say that no index is
  unique, none has `INCLUDE` columns, and btree ones use the default opclass. There are now 19
  scenarios.
- `design.md`:
  - D5 records the `EXPLAIN` and the one-schema (`public`) assumption;
  - a new non-goal covers the claim left `current` with no evidence after its cited file is
    deleted (owner DIS-23).
- `tasks.md`: 3.4 and 4.4 now say how the files were actually restored (from a scratch copy, `cmp`
  identical).

**Forced failures.** Each broken file was restored from a scratch copy (`cmp` identical). The
index breaks run on the throwaway DB of the index test. For the trigger breaks, the shared DB was
rolled back and re-applied before and after each one.

- I. `CREATE UNIQUE INDEX evidence_claim_id_idx`: "Migrated schema has the query and vector
  indexes" fails with `- "unique": false` / `+ "unique": true`.
- J. `edge (source_file_id) INCLUDE (kind)`: the same test fails on `included`. The old helper
  returned `[source_file_id, kind]` as key columns, and passed.
- K. `file (project_id, content_hash text_pattern_ops)`: the same test fails with
  `- "opclasses": null` / `+ ["uuid_ops", "text_pattern_ops"]`.
- L. `updated_at = clock_timestamp()` in the function: 2 tests fail, "Changing a file's content
  hash marks the claims that cite it stale" and "One statement that changes several files…". Both
  fail with `expected false to be true`. The other 10 pass.
- M. `updated_at = statement_timestamp()`: the same 2 fail, and 10 pass.

The multi-row test adds coverage but pins no rule of its own. No mutation of the function was
found that it catches and the single-row tests miss, so it has no forced failure.

**Results:**

- `npx vitest run tests/integration/store`: 4 files, **82 passed**, 0 failed, 0 skipped (about
  68 s).
- `npm run typecheck`: exit 0.
- `npm run lint`: 0 errors. It still shows 4 warnings (`no-empty-object-type` in
  `packages/core/src/ports/*`), and those were already there before these edits.
- The demo driver (`2026-09-28-demo.mjs`) now exercises the multi-row scenario (B9). It also
  exits 1 when a `#### Scenario:` of the delta spec is not exercised by name. The re-run gives
  `19 scenarios exercised, 19 match the spec, 0 do not` and `COVERAGE: 19 … 0 missing`, and the
  state was restored identical. Renaming B9 makes it fail with `1 missing` (exit 1).

## Addendum 5 — re-run after the fourth `/adversarial-review` (2026-09-29)

The review verdict was PASS WITH GAPS: no Blockers, no Majors, 3 Minors and 2 Questions. The author
chose to fix these three (task 5.7):

- **Minors 1–2.** `readme.md` §3.2 ("Invalidación en la base de datos") and the trigger comment in
  `0003` now say that clearing `content_hash` to `NULL` also marks claims `stale`. Only comments
  change: the function and trigger SQL are identical, and so is `pg_get_functiondef`.
- **Upsert (Question 1).** New scenario and test: "An upsert that changes a file's content hash
  marks the claims that cite it stale". The test runs `INSERT … ON CONFLICT (project_id, path) DO
  UPDATE SET content_hash = EXCLUDED.content_hash`. It checks that the `file` id is the same, that
  there is 1 file row and the hash is `h2`, and that the claim is `stale` with `updated_at = now()`.
  - It passed on its first run. It is a characterisation test: an `AFTER UPDATE` row trigger
    already fires on the `DO UPDATE` path.
  - To see it fail with no code change, run it with `PGOPTIONS="-c session_replication_role=replica"`,
    which turns off ordinary triggers for the session. It then fails with `expected 'current' to be
    'stale'`, while the file-row assertions still pass.

The author left these out:

- **Minor 3.** `unindexedCascadingForeignKeys` accepts any index that has the FK first: invalid,
  partial with any predicate, or any access method. The limit is kept and noted on DIS-13, to be
  tightened (`indisvalid`, btree, a predicate that is empty or the FK's `IS NOT NULL`) by the ticket
  that adds the next FK.
- **Question 2.** "Clearing a hash marks claims stale" was accepted on purpose by the author after
  the second adversarial review (D5). It is stated in the PR.

**Results:**

- `npx vitest run tests/integration/store`: 4 files, **83 passed**, 0 failed, 0 skipped.
- Demo: `20 scenarios exercised, 20 match the spec, 0 do not` and `COVERAGE: 20 … 0 missing`. The
  state was restored identical.
- `npm run lint`: 0 errors. The 4 warnings in `packages/core/src/ports/*` were already there.
- `npm run typecheck`: exit 0.
- Shared DB afterwards:
  - `pgmigrations`: `0001`, `0002`, `0003`;
  - 0 `project` rows;
  - no leftover throwaway database.
