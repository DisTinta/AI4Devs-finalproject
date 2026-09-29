## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Set DIS-22 to In Progress in Linear right away, with a short comment in Spanish (change name `test-db-isolation` and branch)
- [x] 0.2 Create feature branch `feature/DIS-22-test-db-isolation` from the delivery branch `feature/entrega-2-CRN` (see `docs/project-context.md` → Branch and ticket conventions)
- [x] 0.3 Verify branch creation and current branch status (`git status`, `git branch --show-current`)
- [x] 0.4 Start the local stack with `docker compose up -d`, confirm Postgres is healthy, and apply migrations with `npm run db:migrate` (`DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind`). Note the shared DB state: `pgmigrations` = `0001`–`0003`, and the row counts of `project`, `file`, `symbol` and `edge`
- [x] 0.5 Run `npx vitest run tests/integration/store` once, green, as the pre-change baseline. Record the totals for the step 6 report

## 1. Test harness: single gate and connection (`helpers/db.ts`)

- [x] 1.1 Create `tests/integration/helpers/db.ts` per `design.md` D1/D2:
  - `databaseUrl`, and the top-level CI `throw` / local `console.warn`, with the logic moved from `support.ts` and the messages generalised to "database integration tests" (D2);
  - `describeWithDatabase`;
  - `connect()`;
  - `migrateSharedDatabase()` and its retry constants, moved unchanged.

  Add TSDoc on every export
- [x] 1.2 Refactor `tests/integration/store/support.ts` per D1/D6:
  - drop its own `DATABASE_URL` read, gate and `migrateSharedDatabase`;
  - re-export `databaseUrl`, `describeWithDatabase` and `migrateSharedDatabase` from `../helpers/db`;
  - `withRollback` opens its client through `connect()`, with no other behaviour change;
  - all other exports untouched.

  Do not edit any other file under `tests/integration/store/`
- [x] 1.3 Run `npx vitest run tests/integration/store` and `npm run typecheck`. Confirm the totals equal the 0.5 baseline (scenario "Existing store specs pass unchanged", first half)

## 2. Test harness: per-test transaction and commit check (TDD)

- [x] 2.1 RED: create `tests/integration/helpers/harness.spec.ts`, with `describeWithDatabase` + `useTransactionPerTest()`. Add tests for:
  - "A test reads back the row it wrote";
  - "Rows are invisible to other connections while the test runs";
  - "Rows are gone after the test ends" (two consecutive tests, D5, with the "no `.concurrent`" comment).

  The rows are inserted with plain SQL for now. Run and see them fail (the hook does not exist yet)
- [x] 2.2 GREEN: in `db.ts`, add `beginTestTransaction()`, `endTestTransaction()` and `useTransactionPerTest()` per D3 (`pg_current_xact_id()` at `BEGIN`, compare with `pg_current_xact_id_if_assigned()` at the end, `ROLLBACK` + `end()` in `finally`, `db()` throws outside a test). Run 2.1 green
- [x] 2.3 RED → GREEN: add tests for these scenarios. They call `begin`/`endTestTransaction` directly (D5). Make them pass:
  - "The transaction is reverted when the test body throws";
  - "Committing the harness transaction is reported" (commit a transaction that wrote nothing);
  - "Rolling back the harness transaction is reported";
  - "Committing and opening a new transaction is reported" (`COMMIT` + `BEGIN`, no writes);
  - "An untouched harness transaction passes the check";
  - "An aborted harness transaction passes the check" (added during apply: `25P02` handling, D3).
- [x] 2.4 Prove the commit check can fail:
  - temporarily make `endTestTransaction` skip the xid comparison → "Committing the harness transaction is reported" fails;
  - temporarily drop the `ROLLBACK` in `finally` on the throw path → "The transaction is reverted when the test body throws" fails.

  Restore from a scratch copy, confirm it is identical with `cmp`, and record both for the step 6 report
- [x] 2.5 Re-confirm the effective `sequence.hooks` for the installed Vitest (1.6.1 → `'parallel'`, per the `design.md` risk). Write the TSDoc note on `useTransactionPerTest()` to match (clean up in the test body). This task does not reopen the design

## 3. Test harness: L1 factories (TDD)

- [x] 3.1 RED: in `harness.spec.ts`, add tests for:
  - "Each factory creates a row with defaults";
  - "Default unique values never collide";
  - "Overridden columns are stored";
  - "Default values are synthetic";
  - "An edge can connect files as well as symbols".

  Run and see them fail
- [x] 3.2 GREEN: create `tests/integration/helpers/factories.ts` per D4:
  - `unique()`, moved from `support.ts`, which now re-exports it;
  - typed row interfaces;
  - `createProject` / `createFile` / `createSymbol` / `createEdge`, with the default table, snake_case overrides, parameterised `INSERT … RETURNING *`, and synthetic values only. `createEdge` takes `source` / `target` as the XOR `EdgeEndpoint` (symbol XOR file), and its `overrides` exclude the four endpoint columns (D4).

  Switch the 2.x tests from plain SQL to `createProject`. Run the file green
- [x] 3.3 Run `npm run lint`. If a naming rule rejects the snake_case keys, disable it for `factories.ts` only, with a comment (D4 risk)
- [x] 3.4 REFACTOR: review `db.ts` / `factories.ts` for naming, TSDoc and duplication, with the suite green

## 4. Test harness: gate scenarios (TDD)

- [x] 4.1 RED → GREEN: create `tests/integration/helpers/gate.spec.ts` per D7. With `runCommand`, run a child `npx vitest run tests/integration/helpers/harness.spec.ts tests/integration/store/graph-schema-constraints.spec.ts`:
  - with `DATABASE_URL` and `CI` removed: exit 0, the warning present, the tests skipped;
  - with `DATABASE_URL` removed and `CI: 'true'`: non-zero exit, the output says `DATABASE_URL` must be set in CI.

  60 s test timeout. These are the scenarios "Database tests are skipped locally without a database" and "Database tests fail in CI without a database"
- [x] 4.2 Prove the gate test can fail: temporarily make `describeWithDatabase` always `describe` → the local scenario fails. Restore with `cmp` and record it for the step 6 report
- [x] 4.3 Scenario "Database tests run when a database is configured": run `npx vitest run tests/integration/helpers` with `DATABASE_URL` set and confirm 0 skipped in `harness.spec.ts`

## 5. Backend: Review and Update Existing Tests (MANDATORY)

- [x] 5.1 Confirm `git diff --stat feature/entrega-2-CRN -- tests/integration/store` shows only `support.ts` (scenario "Existing store specs pass unchanged", second half). The constraint and migration specs are not edited (non-goal)
- [x] 5.2 Confirm no assertion was weakened. Confirm every `#### Scenario:` in `specs/test-db-isolation/spec.md` has a test or a recorded check (18 scenarios)

## 6. Backend: Run Tests and Verify Data State (MANDATORY)

- [x] 6.1 Capture the pre-test baseline:
  - `pgmigrations` rows;
  - the row counts of `project`, `file`, `symbol` and `edge`;
  - `SELECT count(*) FROM project WHERE name LIKE 'project-%'` (factory leftovers);
  - the databases on the server.
- [x] 6.2 Run the targeted tests: `npx vitest run tests/integration/helpers tests/integration/store`, twice, to check for parallel flakiness
- [x] 6.3 Run the required broader suite and gates: `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`. Reproduce the Frontend exclusion with `npx vitest run --exclude 'tests/integration/**'`, with `CI=true` and no `DATABASE_URL`: no import error. Run lint again after the last file is written
- [x] 6.4 Verify the post-test state matches the baseline: the same counts and no factory leftovers. Restore and document if not
- [x] 6.5 Create the report `openspec/changes/test-db-isolation/reports/YYYY-MM-DD-6-test-and-state-verification.md` from the template in `docs/openspec-tasks-mandatory-steps.md` §6. Include the forced failures of 2.4 and 4.2
- [x] 6.6 Mark complete only after the tests pass and the report exists

## 7. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [x] 7.1 Ensure Postgres is running and note the current data state (6.1 indicators). The interface is the harness API used from a spec, plus the `npx vitest run` entry point
- [x] 7.2 Exercise the success path: run `npx vitest run tests/integration/helpers/harness.spec.ts --reporter=verbose`. Verify exit 0 and that every test is listed as passed
- [x] 7.3 Exercise the mutating path: write a scratch spec in the scratchpad (not in the repo) that uses `useTransactionPerTest()` and runs `COMMIT` on `db()` without writing rows. Run it, and verify it fails with the "committed or ended early" message. Delete the scratch file. Confirm the counts are unchanged
- [x] 7.4 Exercise the error cases:
  - `npx vitest run tests/integration/helpers` without `DATABASE_URL` (skipped, warning);
  - the same with `CI=true` (non-zero exit, message).
- [x] 7.5 Document every command and output in `openspec/changes/test-db-isolation/reports/YYYY-MM-DD-7-manual-interface-testing.md`
- [x] 7.6 Verify the data state matches the pre-test state: the same counts and no factory rows left

## 8. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 8.1 Confirm no user interface or user workflow is affected: this is test tooling only. Record "not applicable", with that reason, in the step 6 report
- [ ] 8.2 After pushing, confirm in the PR's CI run (`ci.yml` → `Tests`) that `tests/integration/helpers/harness.spec.ts` ran and was not skipped (DoD "CI lo ejecuta"). Link the run in the step 6 report

## 9. Update Technical Documentation (MANDATORY)

- [x] 9.1 Update `docs/project-context.md` → Testing:
  - replace "Isolation is minimal until DIS-22 …" with the harness: `helpers/db.ts`, `useTransactionPerTest()`, the factories, and new suites under `tests/integration/`;
  - add the gotcha that code under test must not `COMMIT` on `db()` (the test fails), and that nesting is DIS-23's concern;
  - note that `support.ts` now delegates the gate to `helpers/db.ts`.
- [x] 9.2 Update `docs/TESTING.md` if it describes integration setup
- [x] 9.3 ADR: none planned (test tooling, easy to revert). Write one via `/adr-new` only if the author asks at review
- [x] 9.4 Run `/update-docs` and confirm the docs gate passes. Add the relevant AI prompts to `prompts.md` per `docs/project-context.md` → prompts.md rules
- [x] 9.5 Leave a Linear comment in Spanish on DIS-23 describing the adapter `COMMIT` vs harness transaction risk: DIS-22 only guarantees an injectable transactional client; `SAVEPOINT` / an injected executor in `saveGraph` belong to DIS-23
- [ ] 9.6 Prepare the PR description (`/pr-describe`) against `feature/entrega-2-CRN`. After verification, set DIS-22 to In Review in Linear, with a comment in Spanish linking the PR
