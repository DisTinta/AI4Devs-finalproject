## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create feature branch `feature/DIS-11-schema-graph-l1` from the delivery branch `feature/entrega-2-CRN` (see `docs/project-context.md` → Branch and ticket conventions)
- [x] 0.2 Verify branch creation and current branch status (`git status`, `git branch --show-current`)
- [x] 0.3 Start the local stack with `docker compose up -d` and confirm Postgres is healthy

## 1. Store adapter: Dependencies

- [x] 1.1 Check current node-pg-migrate docs via context7 (ESM/Node 20 support, SQL file layout, `runner()` options) and settle the Open Question of `design.md` D1
- [x] 1.2 Add `node-pg-migrate` and `pg` (plus `@types/pg` if needed) to `packages/adapters/store-postgres/package.json` with a pinned major; run `npm install`; confirm `npm ls node-pg-migrate pg` resolves

## 2. Store adapter: Runner CLI guard (TDD)

- [x] 2.1 RED — in `tests/integration/store/migrations.spec.ts`, write the tests for scenarios "DATABASE_URL is missing on migrate" and "DATABASE_URL is missing on rollback" (spawn `npm run db:migrate` / `npm run db:rollback` without `DATABASE_URL`; expect non-zero exit and `DATABASE_URL` in stderr); include the CI-fails / local-skips guard of `design.md` D5; run it and see it fail (placeholder exits 0)
- [x] 2.2 GREEN — create `packages/adapters/store-postgres/src/migrate.ts` (`migrateUp`, `migrateDown`, CLI `up`|`down`, `DATABASE_URL` check, migrations dir resolved from module location) with TSDoc on exports; replace `db:migrate` / `db:rollback` in root `package.json` with the `tsx` commands of D2; run the test green
- [x] 2.3 REFACTOR — tidy the runner with the suite green; `npm run typecheck` and `npm run lint` pass

## 3. Store adapter: `project` and `file` tables (TDD)

- [x] 3.1 Create `tests/integration/store/graph-schema-constraints.spec.ts` scaffolding per `design.md` D5: `beforeAll` → `migrateUp` on the shared DB (never roll back from this file), one `pg` client per test wrapped in `BEGIN` / `ROLLBACK` (rollback also in `finally`), SQLSTATE assertion helper, and a test-data helper that makes every `project.name` / `file.path` unique per test (`randomUUID()` suffix) so parallel files and open transactions never collide on unique constraints
- [x] 3.2 RED — add tests for scenarios "Defaults apply on a minimal insert", "Duplicate project name is rejected", "Unknown language is rejected", "Duplicate path within a project is rejected", "Same path in two projects is accepted", "Deleting a project deletes its files"; run and see them fail
- [x] 3.3 GREEN — create the first migration in `packages/adapters/store-postgres/migrations/` with `CREATE EXTENSION IF NOT EXISTS vector`, enums `project_language`, `project_framework`, `file_kind`, tables `project` and `file` with exactly the columns, types, nullability and defaults of the spec's "L1 column contract" and the names of `design.md` D4, and the matching down section; run `npm run db:rollback` / `npm run db:migrate` as needed so the shared DB reflects the edited (not yet merged) migration; run the tests green

## 4. Store adapter: `symbol` table (TDD)

- [x] 4.1 RED — add tests for scenarios "Invalid span is rejected", "Non-positive start line is rejected", "Deleting a file deletes its symbols"; see them fail
- [x] 4.2 GREEN — extend the same migration (up and down) with enum `symbol_kind` and table `symbol` per the column contract (named span CHECKs, `signature text NULL`, `embedding vector(1536) NULL`); roll back and re-apply locally; run the tests green

## 5. Store adapter: `edge` table (TDD)

- [x] 5.1 RED — add tests (unique test data per 3.1) for scenarios "Edge without resolution is rejected", "Empty extractor is rejected", "Endpoint with both a symbol and a file is rejected", "Endpoint with neither a symbol nor a file is rejected", "Endpoint pointing to a missing row is rejected", "File-to-symbol edge is accepted", "Weight at the bounds is accepted", "Weight outside 0..1 is rejected", "Deleting a symbol deletes its edges", "Deleting a file deletes its edges", "Deleting a project deletes its edges even when the endpoints survive" (edge with `project_id` = project A over two files of project B; delete A; edge gone, B's files remain); see them fail
- [x] 5.2 GREEN — extend the migration with enums `edge_kind`, `edge_resolution` and table `edge` per the column contract, using the two FK pairs and `num_nonnulls` CHECKs of `design.md` D3, `edge.project_id` `NOT NULL ON DELETE CASCADE`, `edge_extractor_not_empty` and `edge_weight_range` (bounds inclusive); no cross-project CHECK (accepted risk in the spec); down section drops in reverse order (`edge`, `symbol`, `file`, `project`, then the six enum types) and keeps the shared `vector` extension; roll back and re-apply locally; run the tests green
- [x] 5.3 REFACTOR — review the migration SQL for naming consistency and exact up/down symmetry with the suite green

## 6. Store adapter: Migration lifecycle (TDD)

- [x] 6.1 In `migrations.spec.ts`, add the throwaway-database helper (uniquely named DB created through the `pg` client in `beforeAll`, dropped in `afterAll`; never touches the shared DB's schema, per `design.md` D5), the schema snapshot helper, and the expected column list transcribed by hand from the spec's "L1 column contract" table
- [x] 6.2 RED — write tests for scenarios "Migrate an empty database", "Migrated schema matches the column contract", "Migrate an up-to-date database", "Roll back the L1 graph migration", "Apply, roll back and apply again" (identity of both snapshots **and** the second snapshot against the expected column list), all driving the real `npm run db:migrate` / `db:rollback` against the throwaway DB. If a test passes on first run, prove it can fail by temporarily breaking the down section (e.g. omit one `DROP TYPE`), observe the failure, then restore
- [x] 6.3 GREEN — fix whatever the lifecycle tests expose in the runner or the migration; run `migrations.spec.ts` green, then run both store spec files together (`npx vitest run tests/integration/store`) twice to confirm no parallel flakiness
- [x] 6.4 Partial-failure atomicity is a non-normative note in the spec (requirement "Fail clearly without a connection string"), guaranteed by node-pg-migrate's single transaction (`design.md` D1). Corrected 2026-09-28: the programmatic `runner()` does not default `singleTransaction` to `true` (only the CLI does), so `migrate.ts` passes it explicitly, and the lifecycle test "A failing later migration leaves no partial changes" (valid 0001 + broken 0002 → `pgmigrations` empty, no L1 table) proves it; recorded in the step 8 report

## 7. Backend: Review and Update Existing Tests (MANDATORY)

- [x] 7.1 Identify existing tests affected by the change (currently `tests/` holds only `.gitkeep` and `tests/a11y/smoke.example.tsx`); confirm none depend on the `db:*` placeholders
- [x] 7.2 Update any affected test without weakening its assertions; confirm every `#### Scenario:` in `specs/graph-schema/spec.md` has a test (27 scenarios)

## 8. Backend: Run Tests and Verify Data State (MANDATORY)

- [x] 8.1 Capture pre-test baseline: list of tables in `public`, rows in `pgmigrations`, list of databases on the server (to detect leftover throwaway DBs)
- [x] 8.2 Run targeted tests: `npx vitest run tests/integration/store`
- [x] 8.3 Run the required broader suite and gates: `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`; reproduce the CI step `npm run db:migrate && npm run db:rollback && npm run db:migrate` (reproduced locally by emulating CI, including the no-database Frontend and Stryker steps; see report 8)
- [x] 8.4 Verify post-test state matches the baseline (shared DB migrated, no leftover throwaway databases, no test rows); restore and document if not
- [x] 8.5 Create the report `openspec/changes/schema-graph-l1/reports/YYYY-MM-DD-8-test-and-state-verification.md` using the template in `docs/openspec-tasks-mandatory-steps.md` §6
- [x] 8.6 Mark complete only after tests pass and the report exists

## 9. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [x] 9.1 Ensure Postgres is running (`docker compose up -d`) and note the current migration state (`pgmigrations` rows)
- [x] 9.2 Exercise the success path: `npm run db:migrate` on the local DB; verify exit code 0 and the four tables with `\dt` equivalent query
- [x] 9.3 Exercise the mutating operation `npm run db:rollback`; verify exit 0 and tables gone; then restore with `npm run db:migrate`
- [x] 9.4 Exercise the error cases: `db:migrate` and `db:rollback` with `DATABASE_URL` unset, and with an unreachable host; verify non-zero exit and a clear message (no credentials printed)
- [x] 9.5 Document every command and output in `openspec/changes/schema-graph-l1/reports/YYYY-MM-DD-9-manual-interface-testing.md`
- [x] 9.6 Verify the data state matches the pre-test state (DB migrated, same `pgmigrations` rows)

## 10. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 10.1 Confirm no user interface or user workflow is affected (CLI `db:*` scripts are covered in step 9); record "not applicable" with that reason in the step 8 report

## 11. Update Technical Documentation (MANDATORY)

- [x] 11.1 Update `readme.md` §3.1 diagram and §3.2 EDGE description for the two FK pairs of `design.md` D3, and note in §3.2 that endpoints are not required to share the edge's project (accepted L1 risk)
- [x] 11.2 Update `docs/project-context.md`: `db:migrate` / `db:rollback` are real (only `db:seed`, `seed:build`, `verify` remain placeholders), how to run migrations locally, the skip-locally / fail-in-CI rule for integration tests, and the gotchas section that calls the migration step a no-op
- [x] 11.3 Write an ADR in `docs/adr/` (via `/adr-new`) for the edge endpoint model (D3) and the choice of node-pg-migrate (D1)
- [x] 11.4 Run `/update-docs` and confirm the docs gate passes; add the relevant AI prompt to `prompts.md` per `docs/project-context.md` → prompts.md rules
- [x] 11.5 Prepare the PR description (`/pr-describe`) including the dependency justification; after verification, set DIS-11 to In Review in Linear with a comment linking this change (2026-09-28: PR https://github.com/DisTinta/AI4Devs-finalproject/pull/4 opened as `DisTinta` after the earlier 403; DIS-11 In Review, comment with the PR link added)
- [x] 11.6 Leave a comment on Linear DIS-13 (and a line in the PR description) stating that the traversal indexes must be redefined over `source_symbol_id` / `source_file_id` / `target_symbol_id` / `target_file_id`, not `source_id` / `target_id`, which do not exist after this change
