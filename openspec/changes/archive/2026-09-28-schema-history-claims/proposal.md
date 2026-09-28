## Why

The L1 graph tables exist since DIS-11, but nothing can yet store Git history, typed claims with
their evidence, per-query usage or the answer cache. Every later slice needs them: co-change
weights come from `file_commit` (CM-HU-03), the explain use case persists `claim`/`evidence`
(CM-HU-09), the daily budget reads `query_log` (CM-HU-07.2) and the cache lives in `cache_entry`
(CM-HU-13). Above all, the product's central promise — an inference is never presented as a fact —
must be enforced by the database, not only by code (`readme.md` §3.2, CLAIM). This change is
sub-issue **DIS-12** (`CM-HU-01.2`, parent DIS-5 / `CM-HU-01`).

## What Changes

- Second migration `0002` in `packages/adapters/store-postgres/migrations/` (up + down) creating the
  six remaining tables of `readme.md` §3.1: `commit`, `file_commit` (composite primary key),
  `claim`, `evidence`, `query_log`, `cache_entry`, and the enum types they use. The `capability`
  enum of `query_log` already includes `drift` (planned F6, `readme.md` §2.2), so adding F6 later
  needs no enum migration.
- The two constraints that protect the fact/inference distinction, named as in `readme.md` §3.2:
  `fact_only_from_l1` (`type = 'FACT'` requires `layer = 'L1'`) and `l2_requires_provenance`
  (`layer = 'L2'` requires non-null `provenance`), plus `confidence` limited to 0..1.
- **Decisions taken by the author for this change** (not stated in `readme.md` §3.1):
  - Every new foreign key uses `ON DELETE CASCADE` (the `project_id` of `commit`, `claim`,
    `query_log`, `cache_entry`; both keys of `file_commit`; `evidence.claim_id` and
    `evidence.file_id`), consistent with the L1 tables: deleting a project or a file removes what
    hangs from it. A claim can be left without evidence when its cited file is deleted.
  - `evidence` gets the same span checks as `symbol` (`start_line > 0`, `end_line >= start_line`).
    No other value checks (counters, tokens and cost accept negatives, as accepted in DIS-11).
  - `cache_entry` has no unique key on `(project_id, question_normalized)`; CM-HU-13 decides it.
  - The audit timestamps `claim.created_at`, `claim.updated_at`, `query_log.created_at` and
    `cache_entry.created_at` are `NOT NULL DEFAULT now()`. §3.1 marks them neither `not null` nor
    with a default; the convention is taken from the L1 `project.created_at` (DIS-11).
- Integration tests: the negative tests of the ticket's DoD (`FACT` + `L2` and `L2` without
  `provenance` rejected by the database), table and cascade tests, the column contract of the six
  tables, and the lifecycle test asked for on DIS-11: with `0001` + `0002` applied, one
  `db:rollback` reverts only `0002`, keeping the L1 tables and leaving `pgmigrations` with only
  `0001_graph-l1`.
- The existing lifecycle tests of `migrations.spec.ts` that assume `0001` is the only migration are
  updated (the requirement "Roll back the latest migration" and the table list of "Apply pending
  migrations" change accordingly).

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `graph-schema`: adds the history, claim, usage and cache tables with their column contract, the
  `fact_only_from_l1` / `l2_requires_provenance` constraints and the cascades; changes the table
  list after migrating an empty database, and the rollback requirement now distinguishes reverting
  the latest migration from reverting all of them.

## Impact

- **Code:** new `packages/adapters/store-postgres/migrations/0002_*.up.sql` / `.down.sql`. No change
  to `migrate.ts`, `package.json` scripts or dependencies. `0001` is not edited (already applied on
  the base branch, `docs/project-context.md`). SQL stays inside `store-postgres`.
- **Tests:** `tests/integration/store/migrations.spec.ts` (updated lifecycle expectations, new
  column contract), a new constraints spec for the six tables, reusing the helpers of
  `tests/integration/store/support.ts` and `schema-snapshot.ts`.
- **CI:** the existing "apply → roll back → apply" step now applies two migrations and rolls back
  only `0002`; no workflow edit.
- **Docs:** `readme.md` §3.1/§3.2 (cascades and evidence span, which §3.1 does not show),
  `docs/project-context.md` if a new gotcha appears.
- **Privacy:** `commit` stores the author only as `author_hash` (pseudonymised; there is no column
  for a name or an e-mail) — the hashing itself belongs to CM-HU-03. `commit.message`,
  `query_log.question` and `cache_entry.response` store free text that can contain personal data
  (a name in a commit message, a question typed by a user); this change only creates the columns,
  and the writers (CM-HU-03, CM-HU-11, CM-HU-13) own what they put there. Tests use synthetic
  values only.

## Non-goals

- The `stale` invalidation trigger on `content_hash`, the partial `stale` index, the traversal
  indexes and the HNSW indexes (DIS-13). `cache_entry.question_embedding` exists as
  `vector(1536)` but gets no vector index.
- Automatic maintenance of `claim.updated_at` (no trigger); writers set it.
- Validating the content of `provenance`: `l2_requires_provenance` rejects SQL NULL only; a JSON
  null (`'null'::jsonb`) or any JSON shape is accepted here; CM-HU-09 validates provenance with Zod
  before insert.
- The verification breakdown columns of `query_log` (`verify_*`, CM-HU-11.2).
- `StorePort` methods, TypeScript row types or any writer/reader for these tables (CM-HU-02, 03,
  09, 11, 13).
- Pseudonymisation of authors and the salt (CM-HU-03).
- A unique key on `cache_entry` and value checks on counters, tokens or cost.
- Checking that `evidence.file_id` belongs to the claim's project, or that `file_commit` joins a
  file and a commit of the same project (same accepted risk as the L1 edge endpoints).
