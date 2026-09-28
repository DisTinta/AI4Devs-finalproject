## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create feature branch `feature/DIS-13-schema-indexes-stale` from the delivery branch `feature/entrega-2-CRN` (see `docs/project-context.md` → Branch and ticket conventions)
- [x] 0.2 Verify branch creation and current branch status (`git status`, `git branch --show-current`)
- [x] 0.3 Set DIS-13 to In Progress in Linear right away, with a short comment in Spanish (change name and branch)
- [x] 0.4 Start the local stack with `docker compose up -d`, confirm Postgres is healthy, and note the shared DB state (`pgmigrations`: `0001_graph-l1`, `0002_history-claims`; `SELECT extversion FROM pg_extension WHERE extname = 'vector'` ≥ 0.5)

## 1. Test tooling: `snapshotSchema` captures indexes, triggers and functions

- [x] 1.1 Extend `tests/integration/store/schema-snapshot.ts` per `design.md` D6. Add ordered `indexes` (`pg_indexes.indexdef`), `triggers` (`pg_trigger`, `NOT tgisinternal`, `pg_get_triggerdef`) and `functions` (`pg_proc`, `public`, excluding extension-owned via `pg_depend.deptype = 'e'`), all excluding `pgmigrations`. Add TSDoc on the new fields
- [x] 1.2 Run the existing store suite (`npx vitest run tests/integration/store`) against `0001` + `0002`. Confirm it is still green, and that a fresh migrated snapshot reports 0 functions and 0 triggers (the 118 pgvector functions are excluded)

## 2. Store adapter: query and vector indexes (TDD)

- [x] 2.1 In `migrations.spec.ts`, add the hand-written index contract, transcribed from the spec table "Query and vector indexes": table, key columns in order, method, opclass, normalised predicate. Add a helper that reads the same shape from `pg_index` / `pg_class` / `pg_am` / `pg_opclass` / `pg_get_expr(indpred, indrelid)` (D6)
- [x] 2.2 RED: add tests for the scenarios "Migrated schema has the query and vector indexes" and "Every cascading foreign key is indexed" (generic over `pg_constraint` `confdeltype = 'c'` vs `pg_index.indkey[0]`), against a throwaway DB. Run them and see them fail
- [x] 2.3 GREEN: create `packages/adapters/store-postgres/migrations/0003_indexes-stale.up.sql` / `.down.sql` with the 17 indexes of `design.md` D2, the HNSW ones with `vector_cosine_ops` and default parameters. The down section drops them in reverse order, without `IF EXISTS`. Do not edit `0001` or `0002`. Apply to the shared DB with `npm run db:migrate` (use `db:rollback` + `db:migrate` after each later edit of `0003`). Run the tests green
- [x] 2.4 Non-normative check (D3): on the shared DB, run `EXPLAIN` for `DELETE FROM edge WHERE source_symbol_id = $1` (prepared statement, generic plan) and confirm `edge_source_symbol_kind_idx` is usable. Record the plan for the step 7 report. If it is not usable, stop and report (design issue)

## 3. Store adapter: stale invalidation trigger (TDD)

- [x] 3.1 Create `tests/integration/store/indexes-stale.spec.ts`. `beforeAll` calls `migrateSharedDatabase()`, each test runs in `withRollback`, values are unique per test. Local helpers insert project, file (with an optional `content_hash`), claim (with an optional `status` and a past `updated_at`) and evidence
- [x] 3.2 RED: add tests for "Changing a file's content hash marks the claims that cite it stale", "Claims citing only other files stay current", "Updating other columns of a file leaves its claims current", "Writing the same content hash again leaves claims current", "Setting a first content hash marks the claims that cite it stale", "A claim already stale is not touched" and "A claim citing several files becomes stale when one of them changes". See them fail
- [x] 3.3 GREEN: extend `0003` (up and down) with the function `mark_claims_stale_on_content_change()` (`CREATE FUNCTION`, not `OR REPLACE`) and the trigger `file_content_hash_marks_claims_stale`, exactly as `design.md` D5. The down section drops the trigger, then the function, then the indexes. Roll back and re-apply the shared DB. Run the file green
- [x] 3.4 Prove the trigger's rules can fail:
  - remove the `WHEN` guard → "Writing the same content hash again leaves claims current" fails;
  - remove `status = 'current'` → "A claim already stale is not touched" fails.

  Restore with `git checkout`, then roll back and re-apply. Record both for the step 7 report
- [x] 3.5 REFACTOR: review `0003` for naming consistency with D2 and exact up/down symmetry, with the suite green

## 4. Store adapter: migration lifecycle for three migrations (TDD)

- [x] 4.1 In `migrations.spec.ts`, add `migrateUpTo(url, ids)` (copies the named migration files to a temp dir and calls `migrateUp`, D7). Add a helper that rolls back until `pgmigrations` is empty and returns the number of calls
- [x] 4.2 Update the modified scenarios:
  - "Roll back only the latest migration": one rollback. The snapshot **equals** the reference snapshot of `0001` + `0002`, and `appliedMigrations` = `['0001_graph-l1', '0002_history-claims']`.
  - "Roll back the L1 graph migration": reach "only L1" with two rollbacks.
  - "Roll back both migrations leaves an empty schema": from the `0001` + `0002` state, two rollbacks.
  - "Apply, roll back and apply again" (both tests): the full-cycle test rolls back until empty. The identity now includes indexes, triggers and functions.
- [x] 4.3 Add the test for the new scenario "Roll back every migration leaves an empty schema". One rollback per applied migration; afterwards no table, enum, index, trigger or function remains, `pgmigrations` is empty, and `vector` is kept
- [x] 4.4 Prove the lifecycle catches leftovers:
  - omit one `DROP INDEX` from the `0003` down section → "Roll back only the latest migration" fails;
  - omit `DROP FUNCTION` → a lifecycle test fails.

  Restore with `git checkout`. Record both for the step 7 report
- [x] 4.5 Run `npx vitest run tests/integration/store` twice, to confirm no parallel flakiness now that three files migrate the shared DB

## 5. Backend: Review and Update Existing Tests (MANDATORY)

- [x] 5.1 Identify the existing tests affected by `0003`: the lifecycle tests of `migrations.spec.ts` (step 4), and every snapshot equality, which now includes indexes, triggers and functions. Confirm the constraints files need no change
- [x] 5.2 Confirm no assertion was weakened. Confirm every `#### Scenario:` in `specs/graph-schema/spec.md` of this change has a test (14 scenarios)

- [x] 5.3 After `/verify-against-spec` (2026-09-28): drop `OF content_hash` from the trigger (the `WHEN` guard alone decides) and pin `SET search_path = public` on the function in `0003`. In the spec, set `updated_at` to the transaction time (`now()`) and require exactly the listed secondary indexes. Re-run the store suite and the trigger forced failures (report 6 addendum)

## 6. Backend: Run Tests and Verify Data State (MANDATORY)

- [x] 6.1 Capture the pre-test baseline:
  - `pgmigrations` rows;
  - tables, indexes and triggers in `public`;
  - row counts of the ten tables;
  - the databases on the server.
- [x] 6.2 Run the targeted tests: `npx vitest run tests/integration/store`
- [x] 6.3 Run the required broader suite and gates: `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`. Reproduce the CI step `npm run db:migrate && npm run db:rollback && npm run db:migrate`. Run lint again after the last file is written
- [x] 6.4 Verify the post-test state matches the baseline: shared DB with three migrations, no leftover throwaway DBs, no test rows. Restore and document if not
- [x] 6.5 Create the report `openspec/changes/schema-indexes-stale/reports/YYYY-MM-DD-6-test-and-state-verification.md` from the template in `docs/openspec-tasks-mandatory-steps.md` §6. Include the forced failures of 3.4 and 4.4 and the `EXPLAIN` of 2.4
- [x] 6.6 Mark complete only after the tests pass and the report exists

## 7. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [x] 7.1 Ensure Postgres is running and note the current migration state
- [x] 7.2 Exercise the success path: `npm run db:migrate`. Verify exit 0 and the 17 indexes via `pg_indexes`, the trigger via `pg_trigger` and the function via `pg_proc`
- [x] 7.3 Exercise the mutating operation `npm run db:rollback` once. Verify exit 0, that the indexes, trigger and function of `0003` are gone, the ten tables remain, and `pgmigrations` = `0001`, `0002`. Restore with `npm run db:migrate`
- [x] 7.4 Exercise the trigger directly inside a transaction that is rolled back:
  - insert a project, a file with a hash, a claim and its evidence;
  - update the hash;
  - read `status` and `updated_at`.

  Also run `db:migrate` with `DATABASE_URL` unset (non-zero exit, message names `DATABASE_URL`)
- [x] 7.5 Document every command and output in `openspec/changes/schema-indexes-stale/reports/YYYY-MM-DD-7-manual-interface-testing.md`
- [x] 7.6 Verify the data state matches the pre-test state: same `pgmigrations` rows, no test rows left

## 8. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 8.1 Confirm no user interface or user workflow is affected (the `db:*` scripts are covered in step 7). Record "not applicable", with that reason, in the step 6 report

## 9. Update Technical Documentation (MANDATORY)

- [x] 9.1 Update `readme.md` §3.2, per `design.md` D8:
  - the Índices block lists the real 17 indexes, with one line on D3 and D4;
  - CLAIM gets the trigger. Rewrite the current sentence "`updated_at` no se actualiza solo (no hay trigger), lo fija quien escribe" (§3.2, CLAIM): the invalidation trigger now sets `updated_at = now()` when a claim goes from `current` to `stale`, and the writers remain its other owner;
  - remove the "Pendiente (DIS-13)" note and the "Obsoleto desde DIS-11" note in Ticket 3.
- [x] 9.2 Update `docs/project-context.md`:
  - three migrations;
  - `snapshotSchema` now captures indexes, triggers and non-extension functions (rewrite that gotcha);
  - three files migrate the shared DB.
- [x] 9.3 ADR: none planned (`design.md` D8). Write one via `/adr-new` only if the author asks at review
- [x] 9.4 Run `/update-docs` and confirm the docs gate passes. Add the relevant AI prompts to `prompts.md` per `docs/project-context.md` → prompts.md rules
- [x] 9.5 Prepare the PR description (`/pr-describe`) against `feature/entrega-2-CRN`. After verification, set DIS-13 to In Review in Linear, with a comment in Spanish linking the PR (2026-09-28: PR https://github.com/DisTinta/AI4Devs-finalproject/pull/7 opened as `DisTinta`; DIS-13 In Review with the PR link and a comment in Spanish)
