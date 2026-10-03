# Test and State Verification Report

- Date: 2026-10-03
- Change: php-laravel-heuristics-2a
- Step: 8 — Backend: Run Tests and Verify Data State

## Commands executed

- `npx vitest run` (baseline, task 0.4, before any change)
- `npx vitest run tests/unit/analyzers/php` (twice)
- `npx vitest run`
- `npm run lint`
- `npm run typecheck`
- `npm run lint:architecture`
- `npm run docs:coverage`
- `npx eslint packages/analyzers/php/src tests/unit/analyzers/php`
- `npx stryker run` (twice, see notes)
- `git diff --stat origin/feature/entrega-2-CRN -- packages/core`
- `git status --porcelain fixtures/acme-shop`, `git ls-files -s fixtures/acme-shop | sha1sum`

## Test results

- Baseline (0.4): 19 files passed, 7 skipped; 235 tests passed, 99 skipped (386).
- Targeted tests (`tests/unit/analyzers/php`): 7 files, 116 passed, 0 failed, 0 skipped — run twice,
  identical (2.44 s and 2.38 s); no flaky behaviour.
- Required suite (`npx vitest run`): 21 files passed, 7 skipped; 263 passed, 0 failed, 99 skipped
  (414); 56 s. The 99 skipped are the database blocks without `DATABASE_URL`, as in the baseline. The
  28 new tests are the 8 of `laravel/string-routes.spec.ts` and the 20 of `laravel/jobs-events.spec.ts`.
- `npm run lint`: 0 errors, 1 warning, pre-existing and outside this change
  (`packages/core/src/ports/LlmPort.ts`, `@typescript-eslint/no-empty-object-type`).
- `npm run typecheck`: clean. `npx eslint` on the changed analyzer and tests: clean.
- `npm run lint:architecture`: 0 errors, the same 4 `no-orphans` warnings as before (stubs
  `analyzers/typescript`, `adapters/llm`).
- `npm run docs:coverage`: clean.
- Mutation (`npx stryker run`, mutates `packages/core/src/**` only): **93.89 %** total, 94.07 % of
  covered code (472 killed, 30 timed out, 4 survived, 1 no coverage) — identical to the score DIS-61
  recorded, and above `MIN_MUTATION_SCORE=70`. A first run gave 95.07 %, because it shared the machine
  with the step 9 script: 24 mutants timed out instead of surviving or being killed, and timeouts count
  as detected. The second run, alone, reproduced 93.89 %. `packages/core` has no diff
  (`git diff --stat origin/feature/entrega-2-CRN -- packages/core` empty), so no core logic was added.
- Forced failures (task 6.2), each restored and checked with `Get-FileHash`:
  1. (a) string `<C>` through `resolveClassName` → 1 test failed (the `use` import extra case).
  2. (b) string-route edges as `exact` → 5 failed (string-route scenario, FQN extra case, acceptance
     test, two `calls.spec.ts` acme-shop scenarios).
  3. (c) `endLine = line` → 2 failed (multi-line array route, string route of acme-shop).
  4. (d) no `Dispatchable` check → 2 failed ("Only Dispatchable jobs …", foreign-trait extra case).
  5. (e) no `directlyExtends` check on the event provider → 2 failed ("Only Dispatchable jobs …",
     listener-map unit case).
  6. (f) arrow functions not opaque → 7 failed; the event rule was guarded only after adding the extra
     case with a real listener (see `tasks.md` 6.2).
  7. (g) empty string-action parts accepted → 1 failed ("Malformed string actions produce no route").
- Notes: no retries; no flaky test.

## Data state verification

- Pre-test baseline:
  - `git status --porcelain fixtures/acme-shop`: empty
  - `git ls-files -s fixtures/acme-shop | sha1sum`: `167c762e26cdc3ad7b71484c19aa6135dc6c2a8d`
  - Database: no DB entity impacted (the analyzer has no persistence).
- Post-test validation:
  - `git status --porcelain fixtures/acme-shop`: empty
  - `git ls-files -s fixtures/acme-shop | sha1sum`: `167c762e26cdc3ad7b71484c19aa6135dc6c2a8d`
  - No `.stryker-tmp/` left behind.
- State restored: Yes (nothing was mutated).
- Restoration actions: none needed. The only file changed under `fixtures/` is `fixtures/README.md`
  (task 11.2), a documentation file outside the analyzer input.

## End-to-end testing (step 10.1)

Not applicable: the change adds no route, CLI command or web screen; the only interface is
`createPhpAnalyzer()`, exercised in the step 9 report. CI evidence (10.2) is pending until the branch is
pushed.

## UI evidence (if applicable)

- (none: the change has no browser UI)

## Outcome

- Status: PASS
- Blocking issues: none
