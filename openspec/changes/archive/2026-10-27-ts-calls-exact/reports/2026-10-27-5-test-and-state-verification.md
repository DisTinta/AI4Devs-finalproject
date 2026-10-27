# Test and State Verification Report

- Date: 2026-10-27
- Change: ts-calls-exact
- Step: 5. Run Tests and Verify Data State (agent's report, autonomous run)

## Commands executed
- `npx vitest run` (baseline, before any change, without `DATABASE_URL`)
- `npx vitest run tests/unit/analyzers/typescript` (green before the refactor, after it, and after `calls.ts`)
- `npx vitest run tests/unit/analyzers/typescript/calls.spec.ts` (RED: 9 failed, 4 passed)
- `npm run typecheck`, `npm run lint`, `npm run lint:architecture`, `npm run docs:coverage`
- `npm run verify`
- `DATABASE_URL=postgresql://codemind:codemind@localhost:5432/codemind_test npx vitest run`
- `git diff --stat final-project-CRN -- packages/core`, `git status --short fixtures/task-api`
- `node scripts/dev-processes.mjs stop`

## Test results
- Baseline (no database): 181 files passed, 20 skipped; 1811 tests passed, 221 skipped.
- RED of `calls.spec.ts`: 13 tests, 9 failed (the positive scenarios), 4 passed (the scenarios that expect no edge, which hold trivially before the implementation).
- Targeted `tests/unit/analyzers/typescript`: 4 files, 47 tests passed (34 before, plus the 13 new ones), no existing test changed.
- Required suite with the integration database: 202 files, 2097 tests passed, 0 failed, 375 s.
- Notes: an earlier run of the whole suite with the database reported 2 failed tests in 2 files, none of them in the analyzers (the output was cut and not captured); the identical re-run, with output captured to a file, passed in full. Treated as a flaky run under load, not as a regression.
- `npm run lint:architecture`: 0 errors, 1 pre-existing warning (`no-orphans` on the built `packages/web/dist` asset).
- `npm run verify`: exit 0, "acme-shop: 3/3 golden answers match".

## Data state verification
- Pre-test baseline:
  - `git diff --stat final-project-CRN -- packages/core`: empty
  - `git status --short fixtures/task-api`: empty
  - Analysis time of the 38 task-api files (5 warm runs, ms): 75 74 84 68 53 without the calls walk
- Post-test validation:
  - `git diff --stat final-project-CRN -- packages/core`: empty
  - `git status --short fixtures/task-api`: empty (only `fixtures/README.md` changed, task 3.1)
  - No `calls` edge is `heuristic`: scenario "The calls of task-api" and the counts of the manual run (`calls/exact` 37)
  - Analysis time with the calls walk (5 warm runs, ms): 205 123 99 96 87. Median 99 against 74, about 1.3 times; mean about 1.7 times. Below the 2x threshold of design Risks (the first run of the series is a warm-up outlier).
- State restored: Yes (no database or fixture state is written)
- Restoration actions: none

## Dependencies and privacy
- No dependency added: no `npm install`, no `npm audit`.
- Privacy and ethics check over the diff: the change reads only the content it is given, holds no personal data, opens no network connection and does no I/O.

## ADR
- Not warranted (design D7): the decisions are local to one package, are reverted by deleting `calls.ts` and follow the precedents DIS-52 and DIS-30 E3.

## UI evidence (if applicable)
- (none: the change has no browser UI)

## Outcome
- Status: PASS
- Blocking issues: none
