# Test and State Verification Report

- Date: 2026-10-26
- Change: `answer-language`
- Step: 6. Run Tests and Verify Data State (with the baseline of 0.4 and the golden rebuild of finding A1)
- Text written by the agent in an autonomous run (no author present).

## Commands executed

- `npx vitest run` with `DATABASE_URL` pointing at `codemind_test` (baseline, before any change)
- `npm run verify` and `npm run db:seed` (baseline and after the golden rebuild)
- `npx vitest run tests/unit/explain/question-language.spec.ts tests/unit/explain/prompt-language.spec.ts tests/unit/explain/explain-language.spec.ts` (red, then green)
- `npx vitest run tests/unit/explain tests/unit/api tests/unit/cli`
- `npx vitest run` with `DATABASE_URL` pointing at `codemind_test` (after the change)
- `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- `npm run test:mutation`
- `npm run cache:build` (finding A1), `npm run db:seed`, `npm run verify`, `npx vitest run tests/unit/seed tests/unit/cache tests/unit/docs`

## Test results

- Baseline (task 0.4), before any change: 2017 passed, 1 failed, 0 skipped (193 files). The one failure is
  `tests/harness/guard-round2.spec.ts` "A path to kit configuration is recognised in any spelling", a
  test of the kit hooks that timed out at its 240 s limit on this machine; it passed in the run after the
  change (same machine, no relation to `explain`).
- Red step (tasks 2.1, 3.1, 4.1): 15 tests failed for the right reasons (`detectLanguage is not a function`,
  the missing system message, the missing event).
- Targeted: `tests/unit/explain`, `tests/unit/api`, `tests/unit/cli`: 38 files, 502 tests passed.
- Required suite after the change: 196 files, 2035 passed, 0 failed, 0 skipped (412 s). The three new
  spec files add 24 tests; later two tests were added to the rule's spec (13 in it now).
- Lint, typecheck, `lint:architecture` (0 errors; the 3 warnings were there before), `docs:coverage`: clean.
- Mutation (`npm run test:mutation`): overall 95.88 (threshold 80). `question-language.ts` 86.61,
  `prompt.ts` 98.15, `explain.ts` 95.13. Survivors of `question-language.ts`: the loop bounds of
  `stripEdges` and `split(/\s+/)` against `split(/\s/)` are equivalent mutants (an out-of-range index or an
  empty token counts for nothing); three tests were added afterwards for the others (the text after a
  backtick pair, a capital first letter, capitals inside a word). The suite was not run through Stryker
  again after those three tests.
- Existing tests: none changed (task 5.1). The scenarios of the delta map to tests of the same name (5.2).
- `/privacy-ethics-check` over the diff (task 6.5): the event carries only `type` and `expected`; a test
  checks the serialised event holds no part of the question or the answer; the new module returns a code
  and never the text; nothing is logged by core; no personal data, auth, upload or third-party API is
  touched (the live measurement sends repository code of the synthetic sample to a local model only);
  the golden file holds only model answers over the synthetic sample (its safety test passes).
- No dependency installed: no npm package check needed.

## Data state verification

- Pre-test baseline (task 0.4, the author's `codemind` database, before the reseed):
  - `claim`: 0; `query_log`: 3; `cache_entry`: 3 rows, `sum(hit_count)` 0.
  - `npm run verify` exited 1 on the unchanged base: Q3's golden evidence differed from the database's
    (2 evidences expected, 1 found): the database had been seeded before the current golden file.
- A first `npm run db:seed` fixed it (`verify` exit 0: 3 of 3 golden answers match) and removed the 3
  `query_log` rows of the baseline (from earlier work of the author; nothing else of acme-shop).
  Afterwards: `claim` 0, `query_log` 0, `cache_entry` 3,0.
- Finding A1: after the change `npm run verify` failed with `FINGERPRINT_MISMATCH` (`reason: golden`),
  because `prompt.ts` is an answer fingerprint input. `npm run cache:build` (CPU Ollama, 16384 context)
  regenerated the three golden answers (Q1 570 s, Q3 268 s, Q4 86 s on the second attempt; the first one was
  `no-evidence`), the agent added its review to each (`docs/golden-review/2026-10-acme-shop-golden-review-dis-104.md`),
  and `npm run db:seed` then `npm run verify` exited 0 (3 of 3).
- Post-test validation: the live runs of the measurement write `claim`, `evidence`, `cache_entry` and
  `query_log` rows; the final reseed (task 8.3) and its counts are in the step 8 report.
- State restored: see the step 8 report.

## UI evidence (if applicable)

- (none: the change has no browser UI)

## Decisions recorded here

- ADR not warranted (design D7): local to `explain` in core, reversible by reverting one module and two call
  sites, one event type, no dependency or cross-module contract.
- Finding A1 and its decision are in `design.md` → Follow-ups (A1 to A4) and in a comment of DIS-104.

## Outcome

- Status: PASS
- Blocking issues: none

## Addendum: CI of the PR (task 12.2, 2026-10-27)

- PR #68, head `b287a78`: workflow `CI`, run
  [40422354715](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/40422354715), `success`
  (it waited queued for a runner; the earlier run 40422316168 was cancelled by the newer push), and
  `Frontend` run 40422354744 `success`.
- The review fixes (design Follow-ups V1-V6) are a new head of PR #68; its CI runs are on the PR's
  checks. Local run before that push: `npx vitest run` with the test database, 196 files and 2037 tests
  passed; `npm run lint`, `npm run typecheck`, `npm run docs:coverage` exit 0; `npm run lint:architecture`
  0 errors (3 warnings).
