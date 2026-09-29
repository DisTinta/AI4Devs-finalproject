## What changes?

Adds migration `0003_indexes-stale`. It creates 17 secondary indexes:

- traversal indexes on `edge`, one partial index per endpoint column;
- an index on every cascading FK that has none;
- the `file` / `file_commit` / partial `stale` indexes of `readme.md` §3.2;
- HNSW cosine indexes on the three embedding columns.

It also adds a trigger. When a file's `content_hash` changes, the trigger marks `stale` the claims
that cite it. `snapshotSchema` now captures indexes, triggers and functions, so the lifecycle
tests catch anything a down section leaves behind. Integration tests cover all 20 scenarios of the
`graph-schema` delta, from OpenSpec change `schema-indexes-stale` (Linear DIS-13 / CM-HU-01.3).

## Why?

Three problems remained in the schema:

- **Graph traversal and every delete cascade scanned whole tables.** PostgreSQL does not index
  foreign keys. Deleting a project or a file walked `edge`, `symbol`, `evidence`, `claim`,
  `query_log` and `cache_entry` sequentially.
- **A claim stayed `current` after the code it cites had changed.** `readme.md` §3.2 promises that
  `stale` marks those claims, so that the lazy re-inference (CM-HU-09.4) can find them, but nothing
  set it.
- **Semantic search had no vector index.**

This PR closes the M1 schema. DIS-10 (incremental re-index) and DIS-23 (`StorePort` writes) were
blocked by it. DIS-13's DoD: changing `content_hash` leaves `stale` the claims that cite the file,
and the indexes are present in `pg_indexes`.

## How to test it?

1. `docker compose up -d` and wait until the `postgres` container is healthy.
2. `npm ci`
3. `export DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind`
   (PowerShell: `$env:DATABASE_URL = 'postgres://codemind:codemind@localhost:5432/codemind'`).
4. `npm run db:migrate && npm run db:rollback && npm run db:migrate`, the CI sequence.
   - Every step exits 0.
   - The rollback reverts **only** `0003_indexes-stale`.
   - The final state has 17 secondary indexes, the trigger `file_content_hash_marks_claims_stale`
     and the function `mark_claims_stale_on_content_change`.
5. `npx vitest run tests/integration/store` → 83 passed (4 files).
6. `npm run lint && npm run typecheck && npm run lint:architecture && npm run docs:coverage`: all
   exit 0, and the existing warnings are unchanged.
7. Independent demonstration against the real scripts and database:
   `node openspec/changes/schema-indexes-stale/reports/2026-09-28-demo.mjs`
   → `20 scenarios exercised, 20 match the spec` and `COVERAGE: 20 scenarios in the spec, 20
   exercised, 0 missing`.

Evidence from the agent's run, in `openspec/changes/schema-indexes-stale/reports/`:

- `2026-09-28-6-test-and-state-verification.md` (with the `EXPLAIN` check and the forced failures);
- `2026-09-28-7-manual-interface-testing.md`;
- `2026-09-28-show-spec-working.md`.

## Decisions / trade-offs

The author took three decisions, recorded in `design.md`:

- **D3: traversal indexes lead with the endpoint, not `project_id`.** There is one partial index
  per endpoint column, `(<endpoint>, kind) WHERE <endpoint> IS NOT NULL`.
  - An endpoint id already belongs to one project, so a leading `project_id` narrows nothing.
  - An index that leads with the endpoint also serves the FK cascade. `EXPLAIN` of the generic plan
    `DELETE FROM edge WHERE <endpoint> = $1` uses each partial index.
  - This replaces the `EDGE(project_id, source_id, kind)` of `readme.md` §3.2: those columns stopped
    existing in DIS-11. The readme is updated.
  - Rejected: `project_id` first, which needs 8 indexes on `edge`.
- **D4: an index on every cascading FK** that no primary key or unique constraint already leads.
  That covers the notes left by DIS-11 and DIS-12, plus `claim`, `query_log` and
  `cache_entry.project_id`. The scenario "Every cascading foreign key is indexed" checks this
  generically, so a future FK without an index fails it.
- **D5: the trigger also sets `updated_at = now()`**, the transaction time, on the claims it turns
  `current` → `stale`. Claims already `stale` are not touched. Nothing is ever turned back to
  `current`; that is CM-HU-09.4.

Fixes after `/verify-against-spec`, commit `7dc275f`:

- **The trigger is `AFTER UPDATE ON file`, not `UPDATE OF content_hash`.** Only the `WHEN
  (OLD.content_hash IS DISTINCT FROM NEW.content_hash)` guard decides, so a hash rewritten by a
  `BEFORE` trigger cannot skip invalidation.
- **The function pins `SET search_path`** (`public`, and later `public, pg_temp`).
- **The spec now says "transaction time (`now()`)" and "exactly the listed secondary indexes".**

Fixes after `/adversarial-review` (it returned FAIL, with one Major):

- **The Major: nothing guarded the `7dc275f` change.** Reintroducing `OF content_hash` left all 7
  trigger tests green. The fix is a new scenario, "A content hash rewritten by another trigger still
  marks the claims that cite it stale". Its test creates a throwaway `BEFORE UPDATE` trigger inside
  its own transaction, then runs `UPDATE file SET loc = 42`. With `OF content_hash` put back, that
  test fails (`expected 'current' to be 'stale'`).
- **`search_path`.** New scenario, "Invalidation works whatever the session's search_path": a
  `pg_catalog`-only session updates `public.file`. With `SET search_path` removed, that test fails
  (`relation "claim" does not exist`).
- **Lifecycle tests:** the full-cycle test asserts the literal three-migration list. `rollbackAll`
  is bounded and asserts that each call reverts exactly one migration.
- **Index helper:** its order is deterministic (`ORDER BY` plus a tie-break on the predicate), and
  the cast normaliser handles multi-word, quoted and array types.
- **`design.md` Risks, two new entries:**
  - invalidation can cross projects through cross-project evidence (accepted DIS-12 risk);
  - concurrent re-indexes can deadlock on shared claims.

  Both are also noted on DIS-23 and DIS-10.
- **Spec edits after implementation** ("transaction time", "exactly these secondary indexes"): the
  author approved them explicitly.

Fixes after the second `/adversarial-review` (it returned PASS WITH GAPS, with one Major):

- **The Major: the claim ↔ its-own-evidence link was untested.** Dropping `e.claim_id = claim.id`
  would stale every claim in the database on each change. "Claims citing only other files stay
  current" now has a claim on B too. With the link dropped, that test fails.
- **`SET search_path = public, pg_temp`.** `pg_temp` is listed last because PostgreSQL searches
  it first when it is not listed. New scenario: "A session temporary table named claim does not
  intercept invalidation". Without `pg_temp`, it fails.
- **New scenario "Clearing a content hash marks the claims that cite it stale"** (`h → NULL`,
  accepted on purpose).
- **`updated_at` asserted equal to the transaction's `now()`.**
- **The `BEFORE`-trigger test runs on a throwaway DB**, so there is no table lock on the shared
  `file`.
- **`secondaryIndexShapes`** filters by `contype IN ('p','u','x')`.
- **Forced failures:**
  - G (the link dropped) fails "Claims citing only other files…";
  - H (`pg_temp` dropped) fails the temp-table scenario;
  - E (`OF content_hash` put back) still fails after the `BEFORE` test moved to a throwaway DB.

Fixes after the third `/adversarial-review` (PASS WITH GAPS, no Blockers, no Majors, 6 Minors):

- **The trigger's `UPDATE claim` does not scan `claim`.** A generic-plan `EXPLAIN ANALYZE` was
  run on 2 000 files and 20 000 claims, and the plan starts from `evidence_file_id_idx`, then
  looks up `claim_pkey`. The SQL was not rewritten and no index was added.
- **`updated_at = now()` is compared in SQL**, at microsecond precision. `clock_timestamp()` and
  `statement_timestamp()` now fail (L, M).
- **New scenario "One statement that changes several files marks every claim citing them
  stale"**, tested with `UPDATE file … WHERE id = ANY($1)`.
- **`secondaryIndexShapes` sees `unique`, `INCLUDE` columns and non-default btree opclasses.**
  The spec now says none of the indexes is unique or has `INCLUDE` columns. Forced failures I, J
  and K each fail the index test.
- **`design.md`:**
  - D5 records the one-schema (`public`) assumption;
  - a new non-goal: a claim left `current` with no evidence after its only cited file is deleted
    (DIS-23).
- **Left out on purpose:**
  - dropping `file (project_id, content_hash)` is a product decision, from `readme.md`;
  - dropping `status` from `claim_stale_idx` is cosmetic.

Fixes after the fourth `/adversarial-review` (PASS WITH GAPS, no Blockers, no Majors):

- **Clearing a hash (`h → NULL`) marks the citing claims `stale`.** The author accepted this on
  purpose after the second adversarial review (`design.md` D5). `readme.md` §3.2 and the trigger
  comment now say it too, for the writers of DIS-23.
- **New scenario "An upsert that changes a file's content hash marks the claims that cite it
  stale".** It covers `INSERT … ON CONFLICT (project_id, path) DO UPDATE`, the path the
  re-indexer is expected to use. The demo covers it too (20/20).
- **Left out on purpose:** `unindexedCascadingForeignKeys` still accepts any index with the FK
  first. Tightening it is noted on DIS-13, for the ticket that adds the next FK.

Fixes after the fifth `/adversarial-review` (PASS WITH GAPS, 1 Major):

- **The Major: an invalidation can be lost.** The trigger only sees `evidence` visible to the
  statement that changes the hash. It misses two cases:
  - evidence that a concurrent transaction has not committed yet (the FK's `FOR KEY SHARE` and the
    update's `FOR NO KEY UPDATE` do not conflict);
  - evidence inferred from the old content and written after the change.

  DIS-13 adds no column, so this is documented, not fixed. The spec states the limit, `design.md`
  records the risk, and `readme.md` §3.2 states the writers' rule: lock the file with
  `SELECT … FOR UPDATE` and re-check its hash before inserting evidence, or record the cited hash
  on `evidence` in a later migration. Noted on DIS-23 and DIS-10. There is no race test, because
  it would depend on timing.
- **`secondaryIndexShapes` sees expression keys** (reported as `expr:…`). Before, they were
  dropped silently, so `edge (project_id, (source_file_id IS NULL))` passed as
  `edge (project_id)`.
- **This description's verify steps** now show 83 tests and 20 scenarios.

Evidence quality:

- **`snapshotSchema` now captures indexes, triggers and functions.** It excludes the 118 functions
  pgvector installs in `public`.
- **"Roll back only the latest migration" compares the full snapshot** with a reference database
  migrated with `0001` + `0002` only. A full rollback would drop a leftover index along with its
  table and hide it; this comparison does not.
- **Forced failures were shown and then restored:**
  - without the `WHEN` guard → 2 trigger tests fail;
  - without `status = 'current'` → "A claim already stale is not touched" fails;
  - a missing `DROP INDEX` in the down section → 2 lifecycle tests fail;
  - a missing `DROP FUNCTION` → 4 lifecycle tests fail. The function is created without `OR
    REPLACE` on purpose, so a leftover fails loudly.

Known limits:

- **Invalidation is coarse.** Any hash change invalidates every claim citing that file, even when
  the cited span did not change. This is by design (`readme.md` §3.2).
- **HNSW makes writes slower.** Its parameters are pgvector's defaults.
- **A re-index that deletes and re-inserts `file` rows bypasses the trigger.** The cascade removes
  the evidence first, so there is nothing left to invalidate. This is already on DIS-23, DIS-85
  and DIS-10.
- **No latency measurement.** The "2 hops over 100 000 edges < 200 ms" target belongs to CM-HU-02.3.

**Privacy:** none. The change adds no column and stores no new data.

## Traceability

| Scenario in the specification | Test that covers it |
|---|---|
| Roll back only the latest migration | `migrations.spec.ts` › "Roll back only the latest migration" |
| Roll back the L1 graph migration | `migrations.spec.ts` › "Roll back the L1 graph migration" |
| Roll back both migrations leaves an empty schema | `migrations.spec.ts` › "Roll back both migrations leaves an empty schema" |
| Roll back every migration leaves an empty schema | `migrations.spec.ts` › "Roll back every migration leaves an empty schema" |
| Apply, roll back and apply again | `migrations.spec.ts` › "Apply, roll back and apply again" and "Apply, roll back and apply again (full cycle through 0001)" |
| Migrated schema has the query and vector indexes | `migrations.spec.ts` › "Migrated schema has the query and vector indexes" |
| Every cascading foreign key is indexed | `migrations.spec.ts` › "Every cascading foreign key is indexed" |
| Changing a file's content hash marks the claims that cite it stale | `indexes-stale.spec.ts` › "Changing a file's content hash marks the claims that cite it stale" |
| Claims citing only other files stay current | `indexes-stale.spec.ts` › "Claims citing only other files stay current" |
| Updating other columns of a file leaves its claims current | `indexes-stale.spec.ts` › "Updating other columns of a file leaves its claims current" |
| Writing the same content hash again leaves claims current | `indexes-stale.spec.ts` › "Writing the same content hash again leaves claims current" |
| Setting a first content hash marks the claims that cite it stale | `indexes-stale.spec.ts` › "Setting a first content hash marks the claims that cite it stale" |
| Clearing a content hash marks the claims that cite it stale | `indexes-stale.spec.ts` › "Clearing a content hash marks the claims that cite it stale" |
| A claim already stale is not touched | `indexes-stale.spec.ts` › "A claim already stale is not touched" |
| A claim citing several files becomes stale when one of them changes | `indexes-stale.spec.ts` › "A claim citing several files becomes stale when one of them changes" |
| A content hash rewritten by another trigger still marks the claims that cite it stale | `indexes-stale.spec.ts` › "A content hash rewritten by another trigger still marks the claims that cite it stale" |
| Invalidation works whatever the session's search_path | `indexes-stale.spec.ts` › "Invalidation works whatever the session's search_path" |
| A session temporary table named claim does not intercept invalidation | `indexes-stale.spec.ts` › "A session temporary table named claim does not intercept invalidation" |

## Origin

agent+human-review

🤖 Generated with [Claude Code](https://claude.com/claude-code)
