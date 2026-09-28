## Context

See `proposal.md` — Why. Current state that shapes the approach:

- DIS-11 left one migration, `packages/adapters/store-postgres/migrations/0001_graph-l1.{up,down}.sql`,
  applied by `src/migrate.ts` (node-pg-migrate 9, `sql` loader, `singleTransaction: true`,
  `count: 1` on down). `0001` is merged into the delivery branch and MUST NOT be edited
  (`docs/project-context.md`: create a new migration instead).
- `tests/integration/store/migrations.spec.ts` drives the real `npm run db:migrate` /
  `db:rollback` against a throwaway database per test and assumes `0001` is the only migration:
  "Migrate an empty database" expects exactly the four L1 tables, the column-contract test compares
  the whole column list against the L1 list, and "Roll back the L1 graph migration" expects an empty
  schema after one rollback. All three break as soon as `0002` exists.
- `tests/integration/store/graph-schema-constraints.spec.ts` migrates the shared `DATABASE_URL`
  database in `beforeAll` and runs each test in `BEGIN`/`ROLLBACK` with per-test unique values
  (helpers in `support.ts`). `schema-snapshot.ts` captures columns, constraints, enums and
  extensions, not indexes or triggers (enough here: this change creates neither).
- Linear DIS-12 carries a request from DIS-11: prove that `db:rollback` reverts only the latest
  migration, which could not be distinguished from "revert all" with a single migration.

## Goals / Non-Goals

**Goals:**

- One new migration whose up and down sections are exact inverses and leave `0001` untouched.
- A lifecycle test that fails if `db:rollback` ever reverts more than one migration.
- The DoD negative tests assert the constraint **name**, not only the SQLSTATE, so they fail if the
  rejection comes from some other constraint.

**Non-Goals:**

- Changes to `migrate.ts`, the npm scripts or the test helpers' behaviour beyond what the new
  assertions need.
- Capturing indexes or triggers in `snapshotSchema` (DIS-13 needs it; not this change).

## Decisions

### D1 — One migration `0002_history-claims`, `0001` untouched

Files `0002_history-claims.up.sql` / `0002_history-claims.down.sql` next to `0001`. All six tables
go in one migration because the ticket is one unit of review and they have no value apart (claims
without evidence, a log without its capability enum). Alternative rejected: one migration per
table — six rollback steps for one ticket and a longer lifecycle test, with no benefit.

Up order (dependency order): enum types, then `commit`, `file_commit`, `claim`, `evidence`,
`query_log`, `cache_entry`. Down order: the tables in reverse, then the five enum types. As in
`0001`, drops use no `IF EXISTS` (a half-present schema must fail loudly) and the down section does
not touch the `vector` extension, which `0001` owns as shared infrastructure. `0002` does not
repeat `CREATE EXTENSION`: it only runs after `0001`.

### D2 — Names

The spec fixes columns, types, nullability, defaults and the two readme-named constraints. The rest
is fixed here so tests and later migrations (DIS-13, CM-HU-11.2) can reference it:

- Enum types: `claim_layer` (`L1`, `L2`), `claim_type` (`FACT`, `INFERENCE`, `UNKNOWN`),
  `claim_status` (`current`, `stale`), `evidence_verification` (`none`, `cited`, `entailed`,
  `broken`), `query_capability` (`explain`, `impact`, `drift`). Label order as listed.
- Primary keys `<table>_pkey` (`uuid DEFAULT gen_random_uuid()`, as D4 of DIS-11), except
  `file_commit_pkey PRIMARY KEY (file_id, commit_id)`.
- Foreign keys `<table>_<column>_fkey`: `commit_project_id_fkey`, `file_commit_file_id_fkey`,
  `file_commit_commit_id_fkey`, `claim_project_id_fkey`, `evidence_claim_id_fkey`,
  `evidence_file_id_fkey`, `query_log_project_id_fkey`, `cache_entry_project_id_fkey`.
- Unique: `commit_project_sha_key UNIQUE (project_id, sha)`.
- Checks: `fact_only_from_l1 CHECK (type <> 'FACT' OR layer = 'L1')` and
  `l2_requires_provenance CHECK (layer <> 'L2' OR provenance IS NOT NULL)`, verbatim from
  `readme.md` §3.2; `claim_confidence_range CHECK (confidence BETWEEN 0 AND 1)` (accepts NULL and
  both bounds, like `edge_weight_range`); `evidence_start_line_positive CHECK (start_line > 0)` and
  `evidence_span_valid CHECK (end_line >= start_line)`, mirroring `symbol`.
- `cost_usd numeric(10,6)`; `confidence double precision` (same type as `edge.weight`).
- Table and column names are the readme's: `commit`, `type` and `object` are non-reserved keywords
  in PostgreSQL and need no quoting. If the first `db:migrate` proves otherwise, quote them in the
  migration and record it here.

### D3 — Every new foreign key cascades (author decision)

Chosen by the author on 2026-09-28. `readme.md` §3.1 only marks `evidence.claim_id`; applying
cascade to all new FKs keeps one rule across the schema (L1 already cascades everywhere): deleting a
project removes its commits, claims, query log and cache; deleting a file (a re-index that drops it)
removes its `file_commit` rows and the evidence that cites it; deleting a commit removes its
`file_commit` rows.

Alternatives rejected: literal readme (only `evidence.claim_id` cascades; deleting a project with
history fails until cleaned by hand), and mixed (RESTRICT on `evidence.file_id`, so a cited file
cannot be deleted). Consequence accepted: a claim can survive with fewer or no evidence rows after
its file is deleted. CM-HU-09 (typing) and CM-HU-10 (verification) treat a claim without evidence as
unsupported; no database rule for it here. The readme diagram is updated to show the cascades.

### D4 — Tests

- **Lifecycle (`migrations.spec.ts`, updated):**
  - Split the expected column list into `L1_COLUMNS` (existing, unchanged) and
    `HISTORY_COLUMNS`, transcribed by hand from the new contract table; same for enums
    (`L1_ENUMS`, `HISTORY_ENUMS`). A helper filters the snapshot by table set, so each contract
    scenario checks its own tables and the "exactly the tables" scenario checks the union.
  - "Migrated schema matches the column contract" (L1) keeps its assertions over the four L1
    tables; a new test covers "Migrated schema matches the history, claim, usage and cache column
    contract", including the composite primary key of `file_commit`.
  - New "Roll back only the latest migration": migrate, one rollback, then assert the L1 contract
    and L1 enums still hold, no table or enum of `0002` remains, and `appliedMigrations` equals
    `['0001_graph-l1']`. To prove it can fail, the implementer temporarily changes `count: 1` to
    `count: Infinity` in `migrate.ts`, observes the failure, and restores it (the check DIS-11
    could not make).
  - "Roll back the L1 graph migration" keeps its DIS-11 wording (OpenSpec does not let a MODIFIED
    block drop or rename an existing scenario). Its precondition "only the L1 graph migration is
    applied" is reached by migrate + one rollback; the test then runs a second rollback and asserts
    the L1 tables and enums are gone.
  - New "Roll back both migrations leaves an empty schema": migrate + two rollbacks → no table, no
    enum, `vector` kept. It overlaps the previous test on purpose; the two scenarios state
    different contracts (reverting L1 when it is alone vs. the full stack).
  - "Apply, roll back and apply again" keeps its identity assertion and checks both contracts.
  - "A failing later migration leaves no partial changes" is unchanged (it copies only `0001` and
    adds its own broken `0002` in a temp dir).
- **Constraints (new `tests/integration/store/history-claims-constraints.spec.ts`):** same pattern
  as `graph-schema-constraints.spec.ts` (`withRollback`, `unique`, SQLSTATE). Its own small insert
  helpers for project/file (duplicated from the L1 file rather than refactoring a file this change
  does not own; extracting shared factories is DIS-22). The two DoD scenarios assert
  `rejects.toMatchObject({ code: '23514', constraint: 'fact_only_from_l1' })` (and
  `l2_requires_provenance`), using the `constraint` field of the `pg` error. Keeping it in a
  separate file keeps each file under ~450 lines and mirrors the two migrations.
- **Shared-database migration from two files.** Until now only `graph-schema-constraints.spec.ts`
  migrated the shared database. The new file also migrates it in `beforeAll`. Vitest runs the files
  in parallel, so two runners may start together.
  **Correction (2026-09-28, found in task 5.5):** node-pg-migrate 9 does not wait for its advisory
  lock by default: `advisoryLockMode` defaults to `'fail'` (`pg_try_advisory_lock`), so the second
  runner throws "Another migration is already running. Advisory lock mode is set to 'fail'." and
  its whole file fails. Chosen fix (author decision): a test-only helper
  `migrateSharedDatabase()` in `tests/integration/store/support.ts` that calls `migrateUp` and
  retries only on that lock error, with a short pause and a time cap below the `beforeAll` timeout;
  any other error is rethrown at once. Both constraints files call it instead of `migrateUp`.
  `migrate.ts` is not changed (switching the product to `advisoryLockMode: 'wait'` was rejected:
  it changes `db:migrate` behaviour outside this spec). Neither file ever rolls back. The comment
  "the only file that migrates the shared database" in the L1 file is updated to name both.
- Rejections use SQLSTATE codes already in `SQLSTATE` (`23505`, `23502`, `23514`, `23503`,
  `22P02`); no new code needed.

### D5 — Documentation

`readme.md` §3.1 diagram gains the cascades on the new FKs and the evidence span check; §3.2 EVIDENCE
and the table descriptions get one line each on the cascade rule (D3). `docs/project-context.md`:
the migrations bullet says there are two migrations and rollback reverts one per call. No ADR: the
cascade policy is local to this schema and is reverted with one new migration; the author may ask
for one at review.

## Risks / Trade-offs

- [`l2_requires_provenance` accepts a JSON `null` (`'null'::jsonb`) and any JSON shape] → The
  constraint is the readme's verbatim; it rejects SQL `NULL` only. The writer (CM-HU-09) validates
  the provenance shape (model, prompt hash, input evidence, timestamp) with Zod before inserting.
  Accepted; tighten in a later migration if a writer ever stores `null`.
- [Cascading `evidence.file_id` silently removes citations when a file is deleted] → Accepted by the
  author (D3). A deleted file cannot support anything; CM-HU-09/10 must treat a claim without
  evidence as unsupported.
- [No cross-project checks on `file_commit` and `evidence`] → Same accepted L1 risk as edge
  endpoints; the writers own it. Stated as non-requirements in the spec.
- [Existing lifecycle tests change] → They are rewritten, not weakened: every assertion they had
  still exists, scoped to the L1 tables, and the rollback test gains the `pgmigrations` check. The
  `protect-specs-and-tests` hook will ask before editing `migrations.spec.ts`; that edit is expected
  in this change (task list, step "Review and Update Existing Tests").
- [Concurrent `npm run db:migrate` runs fail instead of waiting] → node-pg-migrate's default lock
  mode is `'fail'`. The tests work around it with a retry helper (D4); the product keeps the
  fail-fast behaviour, and `docs/project-context.md` replaces its "untested" note with this fact.
- [`claim.updated_at` is not maintained by the database] → Default `now()` on insert only; no
  trigger in this change. Writers set it on update.
- [Shared local DB already has `0001`] → `migrateUp` in the constraints `beforeAll` (or
  `npm run db:migrate`) applies `0002`; rolling back once returns the shared DB to the DIS-11 state.

## Migration Plan

- Local: `docker compose up -d`, `npm run db:migrate` (applies `0002` on top of `0001`). Rollback:
  `npm run db:rollback` reverts `0002` only.
- CI: the existing `db:migrate && db:rollback && db:migrate` step now applies two migrations,
  reverts `0002` and re-applies it; no workflow edit.
- No production data; nothing to back up or backfill.
