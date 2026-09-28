## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create feature branch `feature/DIS-12-schema-history-claims` from the delivery branch `feature/entrega-2-CRN` (see `docs/project-context.md` → Branch and ticket conventions)
- [x] 0.2 Verify branch creation and current branch status (`git status`, `git branch --show-current`)
- [x] 0.3 Start the local stack with `docker compose up -d`, confirm Postgres is healthy, and note the shared DB state (`pgmigrations` rows: expected `0001_graph-l1` only)
- [x] 0.4 Set DIS-12 to In Progress in Linear (done late, 2026-09-28, after implementation; progress comment in Spanish added and the DIS-11 rollback note answered)

## 1. Store adapter: `commit` and `file_commit` tables (TDD)

- [x] 1.1 Create `tests/integration/store/history-claims-constraints.spec.ts` per `design.md` D4: `beforeAll` → `migrateUp` on the shared DB (never roll back), `withRollback` / `unique` / SQLSTATE helpers from `support.ts`, and local insert helpers for project, file, commit (unique `sha` per test); update the header comment of `graph-schema-constraints.spec.ts` that says it is the only file migrating the shared DB, so it names both files
- [x] 1.2 RED — add tests for scenarios "Duplicate sha within a project is rejected", "Same sha in two projects is accepted", "Deleting a project deletes its commits", "Duplicate file and commit pair is rejected", "File-commit pointing to a missing commit is rejected", "File-commit pointing to a missing file is rejected", "Deleting a file deletes its file-commit rows", "Deleting a commit deletes its file-commit rows"; run only this file and see them fail
- [x] 1.3 GREEN — create `packages/adapters/store-postgres/migrations/0002_history-claims.up.sql` / `.down.sql` with tables `commit` and `file_commit` per the spec's column contract and the names of `design.md` D2 (composite `file_commit_pkey`, `commit_project_sha_key`, every FK `ON DELETE CASCADE` per D3); down drops in reverse order without `IF EXISTS`; do not edit `0001`; run `npm run db:migrate` on the shared DB (and `db:rollback` + `db:migrate` after each later edit of `0002`); run the file green

## 2. Store adapter: `claim` table and the fact/inference constraints (TDD)

- [x] 2.1 RED — add tests for scenarios "Fact from the inferred layer is rejected" and "Inferred claim without provenance is rejected" (assert `code: '23514'` **and** `constraint: 'fact_only_from_l1'` / `'l2_requires_provenance'`, per D4), "Fact from the observed layer without provenance is accepted", "Inference from the inferred layer with provenance is accepted", "Invalid claim type is rejected", "Confidence at the bounds is accepted", "Confidence outside 0..1 is rejected", "Deleting a project deletes its claims"; see them fail
- [x] 2.2 GREEN — extend `0002` (up and down) with enums `claim_layer`, `claim_type`, `claim_status` and table `claim` per the column contract, with `fact_only_from_l1` and `l2_requires_provenance` verbatim from `readme.md` §3.2 and `claim_confidence_range`; roll back and re-apply the shared DB; run the file green
- [x] 2.3 Prove the DoD tests can fail: temporarily drop `fact_only_from_l1` from the up section (roll back + migrate), observe the first test fail, restore the constraint and re-apply; record the observation for the step 8 report

## 3. Store adapter: `evidence` table (TDD)

- [x] 3.1 RED — add tests for scenarios "Invalid evidence span is rejected", "Non-positive evidence start line is rejected", "Evidence without verification is rejected", "Deleting a claim deletes its evidence", "Deleting a cited file deletes the evidence but keeps the claim"; see them fail
- [x] 3.2 GREEN — extend `0002` with enum `evidence_verification` and table `evidence` (`evidence_start_line_positive`, `evidence_span_valid`, both FKs cascading per D3); roll back and re-apply; run the file green

## 4. Store adapter: `query_log` and `cache_entry` tables (TDD)

- [x] 4.1 RED — add tests for scenarios "Planned drift capability is accepted", "Unknown capability is rejected", "Deleting a project deletes its query log", "Cache entry without a normalized question is rejected", "Deleting a project deletes its cache entries", and "Defaults apply on a minimal claim, query log and cache entry"; see them fail
- [x] 4.2 GREEN — extend `0002` with enum `query_capability` (`explain`, `impact`, `drift`) and tables `query_log` (`cost_usd numeric(10,6)`, `cache_hit` default `false`) and `cache_entry` (`question_embedding vector(1536)`, `hit_count` default `0`, no unique key, no vector index); roll back and re-apply; run the file green
- [x] 4.3 REFACTOR — review `0002` for naming consistency with D2 and exact up/down symmetry (down drops `cache_entry`, `query_log`, `evidence`, `claim`, `file_commit`, `commit`, then the five enum types; never the `vector` extension); run the file green

## 5. Store adapter: Migration lifecycle (TDD)

- [x] 5.1 In `migrations.spec.ts`, split the expected columns and enums into `L1_*` (unchanged) and `HISTORY_*` (transcribed by hand from the spec's "History, claim, usage and cache column contract" table and D2's enum labels), and add a helper that filters a snapshot by a table set (D4)
- [x] 5.2 Update the tests for the modified scenarios "Migrate an empty database" (exactly the ten tables), "Roll back the L1 graph migration" (migrate + one rollback to reach "only L1 applied", then a second rollback → L1 tables and enums gone), "Roll back both migrations leaves an empty schema" (new; two rollbacks → no table, no enum, `vector` kept) and "Apply, roll back and apply again" (identity + both contracts); keep "Migrated schema matches the column contract" scoped to the four L1 tables; run and confirm green against `0001` + `0002`
- [x] 5.3 Add tests for "Migrated schema matches the history, claim, usage and cache column contract" (including `file_commit` PK `(file_id, commit_id)` and `id` PK elsewhere) and "Roll back only the latest migration" (one rollback → L1 contract and L1 enums intact, no `0002` table or enum, `appliedMigrations` = `['0001_graph-l1']`)
- [x] 5.4 Prove "Roll back only the latest migration" can fail: temporarily set `count: Infinity` on down in `migrate.ts`, run the test and observe the failure, then restore `count: 1` (the check requested on Linear DIS-12); record it for the step 8 report
- [x] 5.5 Add `migrateSharedDatabase()` to `tests/integration/store/support.ts` (retry `migrateUp` only on node-pg-migrate's "Another migration is already running" lock error, short pause, time cap under the 60 s `beforeAll` timeout; rethrow anything else) and call it from the `beforeAll` of both constraints files, per the correction in `design.md` D4
- [x] 5.6 Run both store files and the lifecycle file together (`npx vitest run tests/integration/store`) twice to confirm no parallel flakiness between the two files that migrate the shared DB

## 6. Backend: Review and Update Existing Tests (MANDATORY)

- [x] 6.1 Identify existing tests affected by `0002` (`migrations.spec.ts` lifecycle tests updated in step 5; `graph-schema-constraints.spec.ts` header comment from 1.1); confirm no other test assumes a single migration or four tables
- [x] 6.2 Confirm no assertion was weakened (every former L1 assertion still exists, scoped to the L1 tables) and that every `#### Scenario:` in `specs/graph-schema/spec.md` of this change has a test (34 scenarios)

## 7. Backend: Run Tests and Verify Data State (MANDATORY)

- [x] 7.1 Capture pre-test baseline: tables in `public`, rows in `pgmigrations`, databases on the server (to detect leftover throwaway DBs), row counts of the ten tables in the shared DB
- [x] 7.2 Run targeted tests: `npx vitest run tests/integration/store`
- [x] 7.3 Run the required broader suite and gates: `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`; reproduce the CI step `npm run db:migrate && npm run db:rollback && npm run db:migrate`
- [x] 7.4 Verify post-test state matches the baseline (shared DB with `0001` + `0002`, no leftover throwaway databases, no test rows); restore and document if not
- [x] 7.5 Create the report `openspec/changes/schema-history-claims/reports/YYYY-MM-DD-7-test-and-state-verification.md` using the template in `docs/openspec-tasks-mandatory-steps.md` §6, including the forced failures of 2.3 and 5.4
- [x] 7.6 Mark complete only after tests pass and the report exists

## 8. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [x] 8.1 Ensure Postgres is running and note the current migration state (`pgmigrations` rows)
- [x] 8.2 Exercise the success path: `npm run db:migrate`; verify exit code 0 and the ten tables via a `pg_tables` query
- [x] 8.3 Exercise the mutating operation `npm run db:rollback` once; verify exit 0, the six new tables gone and the four L1 tables present, `pgmigrations` with only `0001_graph-l1`; restore with `npm run db:migrate`
- [x] 8.4 Exercise the constraints directly: insert a `claim` with `type = 'FACT'`, `layer = 'L2'` and one with `layer = 'L2'`, `provenance` null inside a transaction that is rolled back; record the error code and constraint name of each; also `db:migrate` with `DATABASE_URL` unset (non-zero exit, message names `DATABASE_URL`)
- [x] 8.5 Document every command and output in `openspec/changes/schema-history-claims/reports/YYYY-MM-DD-8-manual-interface-testing.md`
- [x] 8.6 Verify the data state matches the pre-test state (same `pgmigrations` rows, no test rows left)

## 9. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 9.1 Confirm no user interface or user workflow is affected (the `db:*` scripts are covered in step 8); record "not applicable" with that reason in the step 7 report

## 10. Update Technical Documentation (MANDATORY)

- [x] 10.1 Update `readme.md` §3.1 diagram (cascades on the new FKs, evidence span check) and §3.2 (one line on the cascade rule of D3 and on `evidence` losing citations when a file is deleted), per `design.md` D5
- [x] 10.2 Update `docs/project-context.md`: two migrations exist, `db:rollback` reverts one per call, two test files migrate the shared DB through `migrateSharedDatabase()`, and replace "Concurrent runs rely on node-pg-migrate's default advisory lock; untested" with the verified fact (default lock mode `'fail'`: a concurrent run exits with "Another migration is already running")
- [x] 10.3 ADR: none planned (`design.md` D5); write one via `/adr-new` only if the author asks at review
- [x] 10.4 Run `/update-docs` and confirm the docs gate passes; add the relevant AI prompt to `prompts.md` per `docs/project-context.md` → prompts.md rules
- [ ] 10.5 Prepare the PR description (`/pr-describe`); after verification, set DIS-12 to In Review in Linear with a comment in Spanish linking the PR, and resolve the DIS-11 note on DIS-12 (rollback reverts only the latest migration) by citing the test of 5.3/5.4
