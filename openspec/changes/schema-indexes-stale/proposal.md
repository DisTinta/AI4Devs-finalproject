## Why

The ten tables exist since DIS-11/DIS-12, but the schema has no secondary index, no vector index
and no invalidation. Two problems follow.

**Graph traversal and cascades scan whole tables.** PostgreSQL does not index foreign-key columns:
- traversal by endpoint reads all of `edge`;
- deleting a project or a file cascades through `edge`, `symbol`, `evidence`, `claim`, `query_log`
  and `cache_entry` with a sequential scan per table.

**A claim stays `current` after the code it cites has changed.** `readme.md` §3.2 promises that
`status = 'stale'` marks claims whose evidence changed, so that the lazy re-inference (CM-HU-09.4)
can find them. Nothing sets it today.

This change is sub-issue **DIS-13** (`CM-HU-01.3`, parent DIS-5 / `CM-HU-01`). It closes the M1
schema: DIS-10 (incremental re-index) and DIS-23 (`StorePort` writes) are blocked by it.

## What Changes

- Third migration `0003` in `packages/adapters/store-postgres/migrations/` (up and down). It
  creates no table, column or enum; `0001` and `0002` are not edited.
- **Indexes from `readme.md` §3.2**, adapted where the schema changed:
  - `file (project_id, content_hash)`.
  - `file_commit (commit_id)`.
  - The partial index `claim (project_id, status) WHERE status = 'stale'`.
  - HNSW indexes with `vector_cosine_ops` on `file.embedding`, `symbol.embedding` and
    `cache_entry.question_embedding`.
- **Traversal indexes on `edge` (author decision).** §3.2 specifies `EDGE(project_id, source_id,
  kind)` and `EDGE(project_id, target_id, kind)`. Those columns no longer exist: DIS-11 split each
  endpoint into two nullable FKs. Instead, there is one partial index per endpoint column:
  - `(source_symbol_id, kind) WHERE source_symbol_id IS NOT NULL`, and the same for
    `source_file_id`, `target_symbol_id` and `target_file_id`.
  - An endpoint id is already unique across projects, so a leading `project_id` would filter
    nothing more.
  - Each index also serves the delete cascade from `symbol` or `file`.
  - `readme.md` §3.2 is updated, and its "Pendiente (DIS-13)" note is closed.
- **Indexes on every cascading FK that has none (author decision).** This covers the notes left by
  DIS-11 and DIS-12, plus three more that nothing asked for:
  - From the DIS-11 and DIS-12 notes: `edge (project_id)`, `symbol (file_id)`,
    `evidence (claim_id)` and `evidence (file_id)`.
  - Added: `claim (project_id)`, `query_log (project_id)` and `cache_entry (project_id)`.
  - Not needed: FKs that already lead a primary key or unique constraint (`file`, `commit`,
    `file_commit.file_id`).
- **Invalidation trigger.** When a file's `content_hash` changes (`IS DISTINCT FROM`, which
  includes a first hash set on a `NULL`), every `current` claim that has evidence citing that file
  becomes `stale` in the same statement. Claims already `stale` are not touched.
  - **Author decision:** the trigger also sets `claim.updated_at = now()` on the claims it
    changes.
  - The trigger never turns a claim back to `current`: recomputing claims is CM-HU-09.4.
- **Test tooling.** `snapshotSchema` (`tests/integration/store/schema-snapshot.ts`) learns to
  capture indexes, triggers and functions, as the DIS-11 note on DIS-13 requires. Without that,
  the reversibility tests would pass with a down section that leaves an index or the trigger
  behind.
- **The migration lifecycle tests are updated for a third migration.** With `0003` present, one
  `db:rollback` reverts only `0003`, so the rollback requirement's scenarios change.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `graph-schema`, in four ways:
  - **Added:** the query and vector index requirement and the `content_hash` invalidation
    requirement.
  - **Changed:** "Roll back the latest migration", for three migrations.
  - **Changed:** "Migrations are reversible and reproducible", because the identity now includes
    indexes, triggers and functions.

## Impact

- **Code:**
  - New `packages/adapters/store-postgres/migrations/0003_*.up.sql` / `.down.sql`, which contain
    the index DDL, one PL/pgSQL function and one trigger.
  - `migrate.ts`, the npm scripts and the dependencies are unchanged.
  - The SQL stays inside `store-postgres`.
- **Tests** (all in `tests/integration/store/`):
  - `schema-snapshot.ts` captures more of the schema.
  - `migrations.spec.ts`: lifecycle expectations updated for three migrations.
  - A new spec file for the indexes and the trigger.
- **CI:** the "apply → roll back → apply" step now rolls back `0003` only; no workflow edit.
- **Docs:**
  - `readme.md` §3.2: the index list over the real columns, the extra FK indexes and the trigger.
  - `docs/project-context.md`: the gotcha that `snapshotSchema` does not capture indexes or
    triggers is closed, and the notes on how many migrations exist are updated.
- **Privacy:** none. The change adds no column and stores no new data.

## Non-goals

- The lazy recomputation of `stale` claims (CM-HU-09.4) and any code that reads or writes claims.
- Invalidation on file deletion. The cascade already removes the evidence (DIS-12 D3); a claim
  left without evidence is CM-HU-09/10's concern.
- Invalidation from a change in an `evidence` span or in `symbol` rows. Only `file.content_hash`
  triggers `stale`, as `readme.md` §3.2 states.
- The recursive N-hop traversal query and the "2 hops over 100 000 edges < 200 ms" target of
  Ticket 3 (CM-HU-02.3). This change creates the indexes that query will use, but does not measure
  it.
- HNSW tuning (`m`, `ef_construction`, `ef_search`): pgvector defaults.
- Indexes for query patterns that do not exist yet. For example, `query_log (created_at)` for the
  daily budget (CM-HU-07.2) is left to that story.
- `CREATE INDEX CONCURRENTLY`. No production data exists, and a concurrent index cannot run
  inside the migration's single transaction.
