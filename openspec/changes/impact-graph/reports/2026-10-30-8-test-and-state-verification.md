# Test and State Verification Report

- Date: 2026-10-30
- Change: impact-graph (DIS-89)
- Step: 8 Backend: Run Tests and Verify Data State

## Commands executed
- `npx vitest run tests/unit/context tests/unit/store tests/integration/context` (baseline, with `DATABASE_URL` pointing at the empty database `codemind_it`)
- `npx vitest run tests/unit/impact tests/integration/impact`
- `npx vitest run --project dom --project seed-build --project node` (with `DATABASE_URL` on `codemind_it`)
- `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`, `npm run verify`
- `npx stryker run --mutate "packages/core/src/impact/**/*.ts"` (twice; the second run after three tests were added)
- `docker exec codemind-postgres-1 psql ... select count(*)` over `project`, `symbol`, `edge`, `query_log`
- `node scripts/dev-processes.mjs stop`

## Test results
- Baseline (0.4): 14 files, 140 tests passed (137 passed and 3 skipped without a database).
- Targeted tests: `tests/unit/impact` 4 files, 35 tests passed; `tests/integration/impact` 1 file, 2 tests passed.
- Required suite: 195 files, 2034 tests passed, 0 failed, 0 skipped.
- Gates: lint clean; typecheck clean; `lint:architecture` 0 errors (one pre-existing `no-orphans` warning for a `packages/web/dist` asset); `docs:coverage` clean; `npm run verify` 6 of 6 golden answers match, without `seed:build` (design P4).
- Mutation (Stryker, score of the `impact/` files): `impact.ts` 100.00, `impact-request.ts` 83.72, `relevance.ts` 78.95, `reverse-walk.ts` 69.85, directory 77.48 (≥ `MIN_MUTATION_SCORE` 70); global score 92.88 (break threshold 80). Surviving mutants and why they are accepted: `design.md` → Follow-ups A3 (destination D). Three red-first tests were added after the first run (the tests of an indirect component and of a test are not looked for; a node of the anchor's file seeds nothing; a class of another file is not taken).
- Notes: TDD order. The request, anchor and acme-shop subset tests (`impact-request.spec.ts`, `impact.spec.ts`) were red before the code existed. The small-graph tests (`components.spec.ts`, `relevance.spec.ts`) and the integration spec were written after the first version of the walk and were green at their first run (Follow-ups A2). The integration run used the second database `codemind_it` because the local `codemind` holds the loaded seed (A1).

## Scenario map (task 7.2)
22 scenarios, each with exactly one test of the same name (checked with `grep -F` over `tests/unit/impact` and `tests/integration/impact`): 20 in `tests/unit/impact/` (`impact-request.spec.ts` 2, `impact.spec.ts` 9, `components.spec.ts` 6, `relevance.spec.ts` 3) and 2 in `tests/integration/impact/acme-shop.spec.ts`. No scenario without a test, none with two.

## Existing tests (task 7.1)
`grep -rn "impact" tests` and `npm run typecheck`: no existing test changed. The extraction of `containsAnyTerm` from `context/rank.ts` into `context/lexical-match.ts` kept `rankCandidates` and `tests/unit/context` green with no edit.

## Data state verification
- Pre-test baseline (0.4), local database `codemind`:
  - `SELECT count(*) FROM project`: 2
  - `SELECT count(*) FROM symbol`: 185
  - `SELECT count(*) FROM edge`: 270
  - `SELECT count(*) FROM query_log`: 0
  - `seeds/graph-dump.sql` header: `analyzer-fingerprint: sha256:153d943e...fc44f`, `contract-fingerprint: sha256:e94eef96...3fb392f`
- Post-test validation:
  - counts: 2, 185, 270, 0 (unchanged)
  - fingerprint header lines unchanged; `git status --porcelain seeds packages/web fixtures` empty; no `.stryker-tmp/` left
- State restored: Yes (nothing to restore; `impact` writes nothing and the integration spec rolls back)
- Restoration actions: none. The auxiliary database `codemind_it` was created for the integration runs and holds no committed project.

## Privacy check (task 10.4, `/privacy-ethics-check` over the diff)
`change` is user text. It is never logged (`impact` has no logger), never copied into an error (`InvalidImpactRequest` holds only the field name; the test "An invalid change is rejected before any read" asserts the message does not contain the value), and is used only as search terms for the local store through `anchor()`. No dependency was added, no personal data or fixture with real emails, no network call, no secret. Outcome: nothing to fix.

## Readme check (task 10.2)
`readme.md` §4 `/impact` was left as it is. Nothing in it contradicts the core report: the example entries carry `symbol`, `origin`, `resolution` and `hops`; the core report adds `file` per entry and `hops` on `direct`, which a projection (DIS-95) may drop.

## Outcome
- Status: PASS
- Blocking issues: none
