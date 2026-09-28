## Context

See `proposal.md` — Why. Current state that shapes the approach:

- **Existing migrations.** `0001_graph-l1` and `0002_history-claims` are merged into the delivery
  branch and MUST NOT be edited. They create no secondary index. The only indexes today back
  primary keys and unique constraints. `0001` owns the `vector` extension, and the local image has
  pgvector 0.8.6, so HNSW is available (it needs 0.5 or later).
- **Migration runner.** `migrate.ts` runs every pending migration in one transaction
  (`singleTransaction: true`) and reverts one per `db:rollback` (`count: 1`). node-pg-migrate's
  advisory lock fails fast. The constraints test files therefore migrate the shared database
  through `migrateSharedDatabase()`, which retries on that error.
- **`snapshotSchema`** captures columns, constraints, enums and extensions only. The DIS-11 note on
  DIS-13 says it must learn indexes and triggers before it can prove this migration is reversible.
  The extension installs 118 functions of its own in `public`, which the snapshot must not compare.
- **Lifecycle tests.** `migrations.spec.ts` assumes two migrations:
  - "Roll back only the latest migration" expects only the L1 tables after one rollback.
  - "Roll back the L1 graph migration" reaches "only L1 applied" with one rollback.
  - The full-cycle test rolls back twice.

  All three break once `0003` exists.
- **Linear notes for DIS-13.**
  - From DIS-11: traversal indexes over the four endpoint columns, indexes on the cascading FKs,
    and the `snapshotSchema` limit.
  - From DIS-12: `evidence (claim_id)` and `evidence (file_id)`.

## Goals / Non-Goals

**Goals:**

- One migration, `0003`, that creates and drops exactly the 17 indexes of the spec table, one
  function and one trigger, with exact up/down symmetry.
- A leftover index, trigger or function in the down section makes a lifecycle test fail.
- Each rule of the trigger (the `WHEN` guard and the `current` filter) is pinned by a test that
  fails when the rule is removed.

**Non-Goals:**

- Measuring query plans or latency (CM-HU-02.3).
- Changing `migrate.ts`, the npm scripts or the helpers' behaviour beyond the snapshot.

## Decisions

### D1 — One migration `0003_indexes-stale`

The migration is `0003_indexes-stale.up.sql` / `.down.sql`. The indexes, the function and the
trigger form one unit of review and have no value apart: the trigger's lookup depends on
`evidence (file_id)`.

- **Up order:** btree indexes, then the HNSW indexes, then the function, then the trigger.
- **Down order:** the reverse, with no `IF EXISTS`, as in `0001` and `0002`.
- **No `OR REPLACE`.** The function is created with `CREATE FUNCTION`. A function left behind by a
  broken down section then makes the next `db:migrate` fail loudly instead of silently replacing
  it.
- **No `CREATE INDEX CONCURRENTLY`.** It cannot run inside the migration's single transaction, and
  there is no production data.

### D2 — Names

The spec fixes table, key columns, method, operator class and predicate. The names are fixed here
so that tests, the down section and later migrations can reference them.

| Index | Definition |
|---|---|
| `edge_source_symbol_kind_idx` | `ON edge (source_symbol_id, kind) WHERE source_symbol_id IS NOT NULL` |
| `edge_source_file_kind_idx` | `ON edge (source_file_id, kind) WHERE source_file_id IS NOT NULL` |
| `edge_target_symbol_kind_idx` | `ON edge (target_symbol_id, kind) WHERE target_symbol_id IS NOT NULL` |
| `edge_target_file_kind_idx` | `ON edge (target_file_id, kind) WHERE target_file_id IS NOT NULL` |
| `edge_project_id_idx` | `ON edge (project_id)` |
| `symbol_file_id_idx` | `ON symbol (file_id)` |
| `file_project_content_hash_idx` | `ON file (project_id, content_hash)` |
| `file_commit_commit_id_idx` | `ON file_commit (commit_id)` |
| `claim_stale_idx` | `ON claim (project_id, status) WHERE status = 'stale'` |
| `claim_project_id_idx` | `ON claim (project_id)` |
| `evidence_claim_id_idx` | `ON evidence (claim_id)` |
| `evidence_file_id_idx` | `ON evidence (file_id)` |
| `query_log_project_id_idx` | `ON query_log (project_id)` |
| `cache_entry_project_id_idx` | `ON cache_entry (project_id)` |
| `file_embedding_hnsw_idx` | `ON file USING hnsw (embedding vector_cosine_ops)` |
| `symbol_embedding_hnsw_idx` | `ON symbol USING hnsw (embedding vector_cosine_ops)` |
| `cache_entry_question_embedding_hnsw_idx` | `ON cache_entry USING hnsw (question_embedding vector_cosine_ops)` |

- Function: `mark_claims_stale_on_content_change()`, `LANGUAGE plpgsql`, `RETURNS trigger`.
- Trigger: `file_content_hash_marks_claims_stale` on `file`.
- HNSW parameters stay at pgvector's defaults (`m = 16`, `ef_construction = 64`).

### D3 — Traversal indexes lead with the endpoint, not `project_id` (author decision)

Chosen by the author on 2026-09-28. `readme.md` §3.2 specified `EDGE(project_id, source_id,
kind)`. Each endpoint is now two nullable columns, and each column gets a partial index
`(<endpoint>, kind) WHERE <endpoint> IS NOT NULL`. There are two reasons:

1. An endpoint id belongs to one project, so a leading `project_id` narrows nothing.
2. An index that leads with the endpoint also serves the FK cascade (`DELETE … WHERE
   source_symbol_id = $1`). One leading with `project_id` would not.

The partial predicate keeps each index to the rows that use that column, which is about half of
`edge` per endpoint side. The planner can use a partial index for `col = $1` because a strict
equality implies `col IS NOT NULL`. That is checked once with `EXPLAIN` during apply
(non-normative).

`edge (project_id)` is added separately for the project cascade.

Alternative rejected: `project_id` first, adapted literally from the readme. It needs four more
FK-only indexes, eight in total on `edge`, for no traversal benefit.

### D4 — Indexes on every cascading FK (author decision)

Chosen by the author on 2026-09-28. The indexes cover:

- the notes left by DIS-11 (`edge.*`, `symbol.file_id`) and DIS-12 (`evidence.*`);
- `claim.project_id`, `query_log.project_id` and `cache_entry.project_id`.

FKs that already lead a primary key or unique constraint need no extra index:

- `file.project_id`, via `file_project_path_key`;
- `commit.project_id`, via `commit_project_sha_key`;
- `file_commit.file_id`, via `file_commit_pkey`.

The spec scenario "Every cascading foreign key is indexed" checks the property generically, so a
future FK without an index fails it.

`claim_stale_idx` does not replace `claim_project_id_idx`. It only holds `stale` rows, so a
project cascade could not use it for `current` claims.

### D5 — Trigger semantics

```sql
CREATE FUNCTION mark_claims_stale_on_content_change() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE claim
     SET status = 'stale', updated_at = now()
   WHERE status = 'current'
     AND EXISTS (SELECT 1 FROM evidence e WHERE e.claim_id = claim.id AND e.file_id = NEW.id);
  RETURN NULL;
END;
$$;

CREATE TRIGGER file_content_hash_marks_claims_stale
  AFTER UPDATE ON file
  FOR EACH ROW
  WHEN (OLD.content_hash IS DISTINCT FROM NEW.content_hash)
  EXECUTE FUNCTION mark_claims_stale_on_content_change();
```

- **`AFTER … FOR EACH ROW`.** The trigger writes another table and never changes the `file` row.
  A single `UPDATE` that changes several files fires once per changed row.
- **`AFTER UPDATE` with a `WHEN` guard, not `UPDATE OF content_hash`.** Corrected
  2026-09-28, after `/verify-against-spec`. A column-specific trigger fires only when
  `content_hash` is in the `SET` list. A `BEFORE` trigger that rewrote `NEW.content_hash` during
  an update that does not name the column would then change the hash without invalidating
  anything, while the spec says "when the `content_hash` … changes". So the trigger fires on every
  `UPDATE` of `file`, and `WHEN (OLD.content_hash IS DISTINCT FROM NEW.content_hash)` alone
  decides. That guard drops same-value writes and treats `NULL → h` as a change. Its cost is one
  comparison per updated `file` row.
- **`SET search_path = public`.** Added 2026-09-28, after `/verify-against-spec`. The function
  names `claim` and `evidence` without a schema. Pinning its `search_path` makes their resolution
  independent of the caller's session. It stays `SECURITY INVOKER`: the role that updates `file`
  also needs `UPDATE` on `claim` and `SELECT` on `evidence`, which the single application role
  has.
- **`status = 'current'`.** This leaves `stale` claims and their `updated_at` untouched, as the
  spec requires. It also keeps a claim's `updated_at` from moving on every edit of an
  already-stale file.
- **`updated_at = now()` (author decision; the spec says "transaction time").** `now()` is the
  transaction start time. `clock_timestamp()` was rejected, for consistency with the column
  defaults. The tests
  therefore set `updated_at` to a past value first and assert it moved.
- **The lookup** goes through `evidence_file_id_idx`, then the claim primary key.
- **No `INSERT` or `DELETE` trigger.**
  - A new file has no evidence yet, so there is nothing to mark on insert.
  - Deleting a file cascades away its evidence (DIS-12 D3).

### D6 — `snapshotSchema` captures indexes, triggers and functions

`tests/integration/store/schema-snapshot.ts` gains three ordered lists. They cover the `public`
schema and exclude `pgmigrations`:

- **`indexes`:** `(table, name, definition)` from `pg_indexes` (`indexdef`). This includes the
  indexes behind primary keys and unique constraints, so a change there is visible too.
- **`triggers`:** `(table, name, definition)` from `pg_trigger` with `NOT tgisinternal`
  (`pg_get_triggerdef`). Internal triggers are the ones behind FK constraints, which constraints
  already cover.
- **`functions`:** `(name, definition)` from `pg_proc` (`pg_get_functiondef`). Functions owned by
  an extension (`pg_depend.deptype = 'e'`) are excluded: pgvector installs 118 of them in
  `public`, and they are not this schema's.

Every snapshot comparison the tests already make, and every snapshot equality, now also covers
these objects. The index contract of the spec is checked separately against a hand-written list
built from `pg_index`, `pg_class`, `pg_am` and `pg_opclass`:

- key columns in order;
- access method;
- operator class, for HNSW;
- predicate, normalised through `pg_get_expr(indpred, indrelid)`.

Comparing `indexdef` text would tie the test to PostgreSQL's formatting.

### D7 — Tests

- **Lifecycle (`migrations.spec.ts`, updated):**
  - A helper `migrateUpTo(url, ids)` applies a subset of the migrations. It copies the named
    files to a temp dir and calls `migrateUp(url, dir)`, as the partial-failure test already does.
    It builds a **reference schema** for "only `0001` + `0002` applied".
  - "Roll back only the latest migration" asserts the snapshot after one rollback **equals** the
    reference snapshot, including indexes, triggers and functions. It also asserts
    `appliedMigrations` = `['0001_graph-l1', '0002_history-claims']`. A down section that leaves
    an index behind fails here, even though a full rollback would drop that index along with its
    table.
  - "Roll back the L1 graph migration" reaches "only L1 applied" with two rollbacks.
  - "Roll back both migrations leaves an empty schema" starts from the reference state (migrate,
    then one rollback) and rolls back twice.
  - New "Roll back every migration leaves an empty schema": migrate, then roll back once per
    applied migration. Then no table, enum, index, trigger or function remains, `pgmigrations` is
    empty, and `vector` is kept.
  - Both "apply, roll back, apply" tests keep their names. The full-cycle one rolls back until
    `pgmigrations` is empty (three calls), instead of a fixed two.
  - New "Migrated schema has the query and vector indexes" (contract list) and "Every cascading
    foreign key is indexed" (generic query over `pg_constraint` with `confdeltype = 'c'` and
    `pg_index.indkey[0]`), both against a throwaway database.
- **Trigger (new `tests/integration/store/indexes-stale.spec.ts`):**
  - Same pattern as the other constraints files: `migrateSharedDatabase()` in `beforeAll`, each
    test in `withRollback`, values unique per test.
  - It covers the seven scenarios of "Stale invalidation on content change". A trigger fires
    inside the test's own transaction, so `BEGIN`/`ROLLBACK` still isolates it.
  - Three files now migrate the shared database. The retry helper already handles that.
- **Forced failures (tasks):**
  - Omit one `DROP INDEX` from the down section: "Roll back only the latest migration" fails.
  - Omit `DROP FUNCTION`: the lifecycle tests fail, either on the snapshot or on the non-`OR
    REPLACE` re-create.
  - Remove the `WHEN` guard: "Writing the same content hash again leaves claims current" fails.
  - Remove `status = 'current'`: "A claim already stale is not touched" fails, because
    `updated_at` moves.

### D8 — Documentation

- **`readme.md` §3.2 → Índices:**
  - The SQL block shows the real 17 indexes.
  - A line explains D3.
  - The "Pendiente (DIS-13)" note is removed, as is the "Obsoleto desde DIS-11" note in Ticket 3.
- **`readme.md` §3.2 → CLAIM:** a line on the trigger (what fires it, `updated_at`, never back to
  `current`).
- **`docs/project-context.md`:**
  - The `snapshotSchema` gotcha is rewritten, because the helper now captures indexes, triggers
  and non-extension functions.
  - The migrations bullet lists three migrations.
- **ADR:** none. The index shape is local to this schema, and a new migration reverts it.

## Risks / Trade-offs

- **[Partial endpoint indexes not used by the cascade]** The planner should prove `col = $1 ⇒ col
  IS NOT NULL`. This is checked with `EXPLAIN` on a cascade-shaped query during apply. If the
  planner does not use the index, the fix is to drop the predicate (full indexes), which is a
  later migration.
- **[HNSW makes writes slower]** Every insert or update of an embedding maintains a graph, which
  matters for the bulk indexing of CM-HU-05a/08. Accepted: semantic search needs it, and
  `readme.md` §3.2 asks for it. If bulk loads become too slow, the indexer can drop and re-create
  the vector indexes around a full index.
- **[Coarse invalidation]** Any change to a file's hash marks every claim citing that file as
  `stale`, even when the cited span did not change. This is by design (`readme.md` §3.2), and
  CM-HU-09.4 recomputes lazily.
- **[A delete-and-reinsert re-index bypasses the trigger]** Deleting a `file` row removes its
  evidence (cascade) and fires no invalidation. This is already recorded on DIS-23, DIS-85 and
  DIS-10: writers must update files in place.
- **[`updated_at` now has two writers]** The writers set it, and the trigger sets it on
  invalidation. The two uses do not conflict, and the readme records both.
- **[Existing lifecycle tests change again]** They are rewritten, not weakened. "Roll back only
  the latest migration" becomes stricter: it compares the full snapshot with a reference, not a
  table list. The `protect-specs-and-tests` hook will ask before these edits, and that is expected.
- **[`snapshotSchema` output grows]** The added output is small: 17 secondary index
  definitions, plus the 13 behind the 10 primary keys and 3 unique constraints, one function and
  one trigger. Snapshot equality failures become longer to read. That is acceptable.

## Migration Plan

- **Local:** `npm run db:migrate` applies `0003` on top of `0002`. `npm run db:rollback` reverts
  only `0003`.
- **CI:** the existing `db:migrate && db:rollback && db:migrate` step now reverts and re-applies
  `0003`. No workflow edit is needed.
- **Data:** none exists in production, and there is nothing to backfill. On a database that
  already has claims, `0003` does not mark anything `stale` retroactively: it only reacts to
  future hash changes.
