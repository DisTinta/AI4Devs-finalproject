# Test and State Verification Report

- Date: 2026-10-30
- Change: pool-transaction-release
- Step: 6. Backend: Run Tests and Verify Data State (agent's text, autonomous run)

## Commands executed
- `npm run db:migrate` (no migrations to run)
- `DATABASE_URL=postgresql://codemind:codemind@localhost:5432/codemind npx vitest run tests/unit/store tests/integration/store tests/integration/api` (baseline, after step 1-2, and final). `DATABASE_URL` is given on the command line because the shell of the run has no `.env` loaded for Vitest; without it the integration tests are skipped (a first baseline without it showed 61 passed, 156 skipped, and was discarded)
- `npx vitest run tests/unit/store/open-store-transaction-errors.spec.ts tests/integration/store/open-store.spec.ts`
- `npx vitest run --project dom --project seed-build --project node`
- `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- `npx stryker run --mutate packages/adapters/store-postgres/src/transaction.ts`
- `node scripts/dev-processes.mjs stop`

## Test results
- Baseline (before any change), `tests/unit/store tests/integration/store tests/integration/api`: 21 files, 269 passed, 0 failed, 0 skipped.
- Task 1.3, old-code check (the code of 1.2: release without argument, no listener): the two integration `it`s of step 2 both FAIL, only through an uncaught `error` event of the borrowed client (`terminating connection due to administrator command`, SQLSTATE `57P01`, and `Connection terminated unexpectedly`) reported by Vitest as uncaught exceptions, as design D5 predicted (`pg-pool` already discards a non-queryable client on release). Destroy-versus-return is proven only by the stub-pool unit tests. On the final code both pass.
- Targeted after the change: `open-store-transaction-errors.spec.ts` (6 `it`s: the five scenarios plus one for the store bound to the connection, added after Stryker showed a survivor) and `open-store.spec.ts` (4 existing + 2 new): 14 passed at first, 15 with the extra `it`.
- Required suite (`tests/unit/store tests/integration/store tests/integration/api`): 22 files, 276 passed, 0 failed.
- Broader suite (`--project dom --project seed-build --project node`): 186 files, 1983 passed, 0 failed.
- `npm run lint`: clean. `npm run typecheck`: clean. `npm run lint:architecture`: 0 errors (1 pre-existing orphan warning on `packages/web/dist`). `npm run docs:coverage`: no warnings.
- Stryker on `transaction.ts` (informational, design X3): 95.24 % at first (one survivor, the `{ transaction: client }` literal of `createPostgresStore`), 100 % after the unit `it` "The work receives a store bound to the borrowed connection". `stryker.config.json` is not changed. The run mutates the whole configured `mutate` list too; its total is above the 80 break threshold (93.78 at first run).
- Notes: one run of the required suite failed in "Every connection is released after a run" (an existing `it`, not edited) with `expected 2 to be 3` on `projectCount()`: another test file, running in parallel, created a project between its two counts. The two new `it`s first carried the same global `projectCount()` baseline and failed the same way; the check was a defect of the test itself (task 1.3 allows fixing those) and was removed from them, because `projectIds(name)` empty is the scenario's actual assertion. The existing `it`s are untouched. This parallel-run fragility of the existing `it` is pre-existing and recorded here as destination D.

## Data state verification
- Pre-test baseline:
  - `SELECT count(*) FROM project`: 2
  - sessions with `application_name LIKE 'codemind-tx%'`: 0
- Post-test validation:
  - `project` count: 2 (after deleting `dis-110-manual` of step 7)
  - `codemind-tx%` sessions: 0
  - `.stryker-tmp/`: not present
- State restored: Yes
- Restoration actions: none needed beyond the step 7 cleanup
- Seed fingerprint inputs: `git diff --stat origin/final-project-CRN -- packages/adapters/store-postgres/src/export-seed.ts packages/adapters/store-postgres/src/load-seed.ts seed` is empty, so no golden round (R6).

## Existing tests changed (task 5.1)
- Only `tests/integration/store/open-store.spec.ts`, which gained the two `it`s and the helper `terminateSessions`. Its seven existing `it`s and helpers were not edited.
- Scenario coverage (5.2): the four existing scenarios and the two terminated-connection scenarios are in `open-store.spec.ts`; the five stub-pool scenarios are in `open-store-transaction-errors.spec.ts` with the same names.

## Privacy check (task 4.1)
- The failed-commit error is `new Error('the transaction could not be committed')` with no cause; the unit `it` for the failed commit asserts that message, stack and own properties hold neither `s3cret`, `db.internal`, the commit text nor the text of `R`, and the integration `it` asserts no `terminat`, `57P01` or `administrator command`. No log line was added.
- Browser UI: not applicable beyond step 7 (`packages/web` untouched), task 8.1.

## UI evidence (if applicable)
- (none: the change has no browser UI)

## Outcome
- Status: PASS
- Blocking issues: none for this step. Task 3 (the `## Purpose` of `explain`) was denied by a hook, see the PR description and the Linear comment.
