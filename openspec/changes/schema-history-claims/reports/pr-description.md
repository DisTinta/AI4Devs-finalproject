## What changes?

Adds migration `0002_history-claims` with the six remaining tables of `readme.md` §3.1: `commit`,
`file_commit` (composite PK), `claim`, `evidence`, `query_log` and `cache_entry`. The database now
enforces the fact/inference distinction through `fact_only_from_l1` and `l2_requires_provenance`.
Integration tests cover all 34 scenarios of the `graph-schema` delta. The delta lives in OpenSpec
change `schema-history-claims` (Linear DIS-12 / CM-HU-01.2).

## Why?

Git history, typed claims with evidence, per-query usage and the answer cache all need somewhere to
live, and every later slice depends on these tables:

- co-change weights come from `file_commit` (CM-HU-03);
- `explain` persists `claim` / `evidence` (CM-HU-09);
- the daily budget reads `query_log` (CM-HU-07.2);
- the cache lives in `cache_entry` (CM-HU-13).

The product's central promise is that an inference is never presented as a fact. That promise is
now enforced by PostgreSQL, not only by application code (`readme.md` §3.2). DIS-12's DoD: an
integration test shows that `FACT` + `L2`, and `L2` without `provenance`, fail in the database.

## How to test it?

1. `docker compose up -d` and wait until the `postgres` container is healthy.
2. `npm ci`
3. Export `DATABASE_URL`:
   - bash: `export DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind`
   - PowerShell: `$env:DATABASE_URL = 'postgres://codemind:codemind@localhost:5432/codemind'`
4. `npm run db:migrate && npm run db:rollback && npm run db:migrate` (the CI sequence).
   - Every step exits 0.
   - The rollback reverts **only** `0002_history-claims`.
   - The final state has ten tables in `public`.
5. `npx vitest run tests/integration/store` → 65 passed (3 files).
6. `npm run lint && npm run typecheck && npm run lint:architecture && npm run docs:coverage`.
   All exit 0. The pre-existing warnings are unchanged.
7. Independent demonstration of every scenario against the real scripts and database:
   `node openspec/changes/schema-history-claims/reports/2026-09-28-demo.mjs`
   → `34 scenarios exercised, 34 match the spec`.

Evidence from the agent's run, in `openspec/changes/schema-history-claims/reports/`:

- `2026-09-28-7-test-and-state-verification.md`
- `2026-09-28-8-manual-interface-testing.md`
- `2026-09-28-show-spec-working.md`

## Decisions / trade-offs

Author decisions (`design.md` D3, `proposal.md`), none of which is spelled out in `readme.md` §3.1:

- **Every new FK is `ON DELETE CASCADE`.** This keeps one rule across the schema, as the L1 tables
  already do. As a result, deleting a file deletes the evidence that cites it, and a claim can be
  left without evidence (CM-HU-09/10 must treat such a claim as unsupported).
  - Rejected: the literal readme (only `evidence.claim_id` cascades, so deleting a project that has
    history fails).
  - Rejected: `RESTRICT` on `evidence.file_id`.
- **Evidence span checks mirror `symbol`** (`start_line > 0`, `end_line >= start_line`). No value
  checks on counters, tokens or cost.
- **No unique key on `cache_entry (project_id, question_normalized)`.** CM-HU-13 decides it.
- **Audit `*_at` columns are `NOT NULL DEFAULT now()`**, following the precedent of L1
  `project.created_at`. `claim.updated_at` is not maintained by a trigger; the writers set it.
- **The `query_capability` enum already includes `drift`** (F6, planned), so shipping F6 needs no
  enum migration.

Other points:

- **node-pg-migrate's advisory lock fails instead of waiting.** This was found during apply and
  corrects `design.md` D4. In v9, `advisoryLockMode` defaults to `'fail'`. With two test files
  migrating the shared DB in parallel, one `beforeAll` failed on every run with
  "Another migration is already running". Fixed with the test-only helper
  `migrateSharedDatabase()` (`tests/integration/store/support.ts`), which retries on that error
  only. `db:migrate` is unchanged; switching it to `'wait'` was rejected because it changes product
  behaviour. After the fix: 3 × 65/65, the first run with `0002` pending.
  `docs/project-context.md` now states this as verified behaviour; it used to say "untested".
- **DIS-11 follow-up (rollback reverts one migration).** The new test "Roll back only the latest
  migration" fails when `migrate.ts` uses `count: Infinity` on down. That was checked by breaking
  the code on purpose and then restoring it.
- **The DoD tests can fail.** They assert the constraint **name**, not only SQLSTATE `23514`, and
  removing `fact_only_from_l1` makes the first one fail.
- **Spec note.** OpenSpec does not let a MODIFIED requirement rename or drop an archived scenario.
  So "Roll back the L1 graph migration" keeps its DIS-11 wording, and "Roll back both migrations
  leaves an empty schema" is added next to it.
- **Accepted risks:**
  - `l2_requires_provenance` rejects SQL `NULL` only: a JSON `null` or any JSON shape passes.
    CM-HU-09 validates provenance with Zod.
  - No same-project check on `file_commit` or `evidence` (the same accepted risk as the L1 edge
    endpoints).
- **Out of scope (DIS-13):**
  - the `stale` trigger, traversal/partial/HNSW indexes;
  - `snapshotSchema` still captures no indexes or triggers, which is enough here because `0002`
    creates none.
- **Privacy:** `commit` stores the author only as `author_hash`; there is no name or e-mail column.
  The free-text columns (`commit.message`, `query_log.question`, `cache_entry.response`) are only
  created here, and the writers own their content. Tests use synthetic values only.

## Traceability

| Scenario in the specification | Test that covers it |
|---|---|
| Migrate an empty database | `migrations.spec.ts` › "Migrate an empty database" |
| Migrate an up-to-date database | `migrations.spec.ts` › "Migrate an up-to-date database" |
| Roll back only the latest migration | `migrations.spec.ts` › "Roll back only the latest migration" |
| Roll back the L1 graph migration | `migrations.spec.ts` › "Roll back the L1 graph migration" |
| Roll back both migrations leaves an empty schema | `migrations.spec.ts` › "Roll back both migrations leaves an empty schema" |
| Apply, roll back and apply again | `migrations.spec.ts` › "Apply, roll back and apply again" |
| Migrated schema matches the history, claim, usage and cache column contract | `migrations.spec.ts` › "Migrated schema matches the history, claim, usage and cache column contract" |
| Defaults apply on a minimal claim, query log and cache entry | `history-claims-constraints.spec.ts` › "Defaults apply on a minimal claim, query log and cache entry" |
| Duplicate sha within a project is rejected | `history-claims-constraints.spec.ts` › "Duplicate sha within a project is rejected" |
| Same sha in two projects is accepted | `history-claims-constraints.spec.ts` › "Same sha in two projects is accepted" |
| Deleting a project deletes its commits | `history-claims-constraints.spec.ts` › "Deleting a project deletes its commits" |
| Duplicate file and commit pair is rejected | `history-claims-constraints.spec.ts` › "Duplicate file and commit pair is rejected" |
| File-commit pointing to a missing commit is rejected | `history-claims-constraints.spec.ts` › "File-commit pointing to a missing commit is rejected" |
| File-commit pointing to a missing file is rejected | `history-claims-constraints.spec.ts` › "File-commit pointing to a missing file is rejected" |
| Deleting a file deletes its file-commit rows | `history-claims-constraints.spec.ts` › "Deleting a file deletes its file-commit rows" |
| Deleting a commit deletes its file-commit rows | `history-claims-constraints.spec.ts` › "Deleting a commit deletes its file-commit rows" |
| Fact from the inferred layer is rejected | `history-claims-constraints.spec.ts` › "Fact from the inferred layer is rejected" |
| Inferred claim without provenance is rejected | `history-claims-constraints.spec.ts` › "Inferred claim without provenance is rejected" |
| Fact from the observed layer without provenance is accepted | `history-claims-constraints.spec.ts` › "Fact from the observed layer without provenance is accepted" |
| Inference from the inferred layer with provenance is accepted | `history-claims-constraints.spec.ts` › "Inference from the inferred layer with provenance is accepted" |
| Invalid claim type is rejected | `history-claims-constraints.spec.ts` › "Invalid claim type is rejected" |
| Confidence at the bounds is accepted | `history-claims-constraints.spec.ts` › "Confidence at the bounds is accepted" |
| Confidence outside 0..1 is rejected | `history-claims-constraints.spec.ts` › "Confidence outside 0..1 is rejected" |
| Deleting a project deletes its claims | `history-claims-constraints.spec.ts` › "Deleting a project deletes its claims" |
| Invalid evidence span is rejected | `history-claims-constraints.spec.ts` › "Invalid evidence span is rejected" |
| Non-positive evidence start line is rejected | `history-claims-constraints.spec.ts` › "Non-positive evidence start line is rejected" |
| Evidence without verification is rejected | `history-claims-constraints.spec.ts` › "Evidence without verification is rejected" |
| Deleting a claim deletes its evidence | `history-claims-constraints.spec.ts` › "Deleting a claim deletes its evidence" |
| Deleting a cited file deletes the evidence but keeps the claim | `history-claims-constraints.spec.ts` › "Deleting a cited file deletes the evidence but keeps the claim" |
| Planned drift capability is accepted | `history-claims-constraints.spec.ts` › "Planned drift capability is accepted" |
| Unknown capability is rejected | `history-claims-constraints.spec.ts` › "Unknown capability is rejected" |
| Deleting a project deletes its query log | `history-claims-constraints.spec.ts` › "Deleting a project deletes its query log" |
| Cache entry without a normalized question is rejected | `history-claims-constraints.spec.ts` › "Cache entry without a normalized question is rejected" |
| Deleting a project deletes its cache entries | `history-claims-constraints.spec.ts` › "Deleting a project deletes its cache entries" |

## Origin

agent+human-review

🤖 Generated with [Claude Code](https://claude.com/claude-code)
