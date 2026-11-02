# Test and State Verification Report

- Date: 2026-11-02
- Change: http-impact
- Step: 5. Backend: Run Tests and Verify Data State (with 4.1, 4.2, 5.5 and 7.1)

*Agent's text (autonomous run, apply step).*

## Commands executed
- `git fetch origin` and `git merge-base --is-ancestor origin/final-project-CRN HEAD` (the base had not moved: the branch contains it)
- `npx vitest run tests/unit/api tests/integration/api tests/unit/impact tests/integration/impact` (baseline before the code, and after)
- `npx vitest run --project dom --project seed-build --project node`
- `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`, `npm run verify`
- `npx stryker run --mutate "packages/api/src/routes/impact.ts,packages/api/src/schemas/impact.ts"` and, to rule out stale incremental results after the new boundary tests, the same with `--force`
- `node scripts/dev-processes.mjs stop` after every run

The database-backed specs ran with `DATABASE_URL` pointing at the documented `codemind_test` database
(`docs/TESTING.md`), because the development database `codemind` holds the two committed seed projects
that the run refuses (`assertNoCommittedProjects`) and that step 6 needs. The URL was given on the
command line, the `.env` file was never read.

## Test results
- Baseline (before any code): targeted 23 files, 207 passed, 0 failed, 0 skipped.
- Targeted tests after the change: 25 files, 228 passed, 0 failed, 0 skipped (207 + 19 in `tests/unit/api/impact.spec.ts` + 2 in `tests/integration/api/impact.spec.ts`).
- Required suite (`--project dom --project seed-build --project node`): 203 files, 2150 passed, 0 failed, 0 skipped, 325.77 s.
- `npm run lint`: clean. `npm run typecheck`: clean. `npm run lint:architecture`: 0 errors (1 existing warning: `no-orphans` on a built web asset). `npm run docs:coverage`: no undocumented symbol. `npm run verify`: acme-shop 3/3 and task-api 3/3 golden answers match.
- Mutation (`routes/impact.ts` + `schemas/impact.ts`): the first run left 7 survivors (a copied `prs`, the `?? []` of the events, the two messages of the custom rules and the `HIGH` literal); each got a red-first-style boundary test (describe `impact route boundaries`). With `--force`: 53 of 53 mutants killed in `routes/impact.ts` and 38 of 38 in `schemas/impact.ts`, so 100 % over the two files (the break is 80, `MIN_MUTATION_SCORE` 70). The run-wide score Stryker prints, 93.21, includes the files reused from the incremental cache. No survivor is accepted, so nothing is recorded as an equivalent mutant.
- Notes: no flaky test, no retry. The 4.1 prediction held: no existing test changed (`tests/unit/api/health-docs.spec.ts`, `app.spec.ts` and `route-errors.spec.ts` pass untouched after step 2).

## Scenario map (task 4.2)

Every scenario of `specs/http-impact/spec.md` has an `it` of the same name.

| Requirement | Scenario | Test file |
|---|---|---|
| Impact request validation | An invalid change answers VALIDATION_ERROR without a store call | unit |
| Impact request validation | A change at the length bounds is accepted | unit |
| Impact request validation | An invalid hop limit or an extra key answers VALIDATION_ERROR | unit |
| Impact request validation | A malformed project id answers VALIDATION_ERROR on impact | unit |
| Impact request validation | The hop limit is forwarded only when sent | unit |
| Impact project resolution | An unknown project answers PROJECT_NOT_FOUND on impact | unit |
| Impact project resolution | An upper-case project id resolves the same project on impact | integration |
| Impact answered response | Q2 answers only the public fields over the seed | integration |
| Impact answered response | An answered report over the in-memory subset makes no model call | unit |
| Impact answered response | Fields the use case adds are not sent | unit |
| Impact unknown response | A change without search terms answers unknown | unit |
| Impact unknown response | An unknown report with events sends no events | unit |
| Impact error answers | Domain errors of the impact use case map to their answers | unit |
| Impact error answers | Another error on impact answers INTERNAL | unit |
| Impact error answers | The impact route is rate limited | unit |
| Impact events | A report's query_not_logged event is logged | unit |
| Impact in the OpenAPI document | The document lists impact with its parameter, body and responses | unit |

Extra tests below the scenarios (mutation survivors and the stored-id forwarding): "forwards the stored
project's id, not the id as sent in the path", "sends the pull requests of a history entry and each risk
level", "logs nothing for a report without events", "names what is wrong with a blank change or one
holding U+0000".

TDD record: the 1.1 scenario failed with `404` before the route existed, the bounds and hop-forwarding
scenarios failed with the minimal route's `501`, and the remaining scenarios passed once the full route
existed (they pin behaviour the route of 2.2 introduces together with the scenario of 2.1; the red
evidence of the step is the 404 and the two 501 failures).

## Data state verification
- Pre-test baseline (development database `codemind`, task 0.4):
  - `SELECT count(*) FROM project`: 2
  - `query_log` by capability: `impact`, 4 rows, max `created_at` 2026-11-02 12:24:52.940859+00
- Post-test validation:
  - `project`: 2; `query_log`: `impact`, 4 rows, same max `created_at` (the integration specs roll back and ran on `codemind_test`)
  - `.stryker-tmp/`: absent
- State restored: Yes
- Restoration actions: none needed

## Privacy and ethics check (task 5.5)
- No received value (change text, project id) in an error body: asserted by the scenarios on validation, `404` and `500` (`not.toContain` of the text, the id, the error message and `10.0.0.5`).
- The change text only in `query_log`: the log scenario asserts no log line contains `SENTINEL-change-7b2c`; events carry a code only.
- No database id in the body: the integration scenario asserts no UUID in the `200` body; `toPublicReport` builds each entry field by field.
- No model call, no new dependency, no personal data stored: no concern found.

## End-to-end (task 7.1)
Not applicable: `packages/web` is untouched; the HTTP interface is exercised in step 6.

## UI evidence
- none (no browser UI)

## Outcome
- Status: PASS
- Blocking issues: none
