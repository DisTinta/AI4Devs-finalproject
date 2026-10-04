# Test and State Verification Report

- Date: 2026-10-04
- Change: analyzer-port-edges-tsdoc
- Step: 3. Backend: Run Tests and Verify Data State (MANDATORY)

## Commands executed

- `npx vitest run` (baseline, task 0.4)
- `npx vitest run tests/unit/analyzers/php`
- `npx vitest run`
- `npm run lint`
- `npm run typecheck`
- `npm run lint:architecture`
- `npm run docs:coverage`
- `npx stryker run` (baseline in 0.4; gate in 3.3, run twice; once more on the base file, see Notes)
- `git diff origin/feature/entrega-2-CRN --stat -- packages`, `git diff --stat origin/feature/entrega-2-CRN -- tests`
- `git status --porcelain fixtures/acme-shop`, `git ls-files -s fixtures/acme-shop | sha1sum`

## Test results

- Baseline (0.4): `npx vitest run` 24 files passed, 7 skipped; 311 tests passed, 99 skipped (462).
- Targeted tests: `tests/unit/analyzers/php` 164 passed, 0 failed, 0 skipped (10 files).
- Required suite: 311 passed, 0 failed, 99 skipped (24 files passed, 7 skipped), same totals as the
  baseline. The 99 skipped are the database-backed suites that skip without a database, as on the base.
- Runtime: about 53 s for the full suite.
- Gates:
  - `npm run lint`: 0 errors, 1 warning (pre-existing `@typescript-eslint/no-empty-object-type`).
  - `npm run typecheck`: exit 0.
  - `npm run lint:architecture`: 0 errors, 4 `no-orphans` warnings, same as the baseline.
  - `npm run docs:coverage`: no warning.
  - `npx stryker run` (core): 93.89 % (472 killed, 4 timeout, 30 survived, 1 no coverage; 507
    mutants), ≥ `MIN_MUTATION_SCORE=70`.
- Diff: `git diff origin/feature/entrega-2-CRN --stat -- packages` → only
  `packages/core/src/ports/AnalyzerPort.ts` (9 insertions, 5 deletions), every changed line a ` *` comment
  line; `git diff --stat origin/feature/entrega-2-CRN -- tests` empty.
- Notes (Stryker): the 0.4 baseline gave 95.07 % (469 killed, 13 timeout, 24 survived, 1 no coverage;
  507 mutants) while `typecheck`, `lint` and TypeDoc ran at the same time. With nothing else running, the
  gate gave 93.89 % twice, and so did a run on the base version of `AnalyzerPort.ts` (file copied to the
  scratchpad, base content restored, Stryker run, edit copied back; SHA-1
  `29959adba64e8d04c92f75ec9d8367ddb9563092` before and after). Same mutant count, same score with and
  without the change: the difference is timeouts under load (Stryker counts a timeout as detected),
  not this change, which moves no code line. The comparable baseline is 93.89 %.
- `prettier --check packages/core/src/ports/AnalyzerPort.ts` warns before and after the edit (the
  repository has no Prettier config, so it applies default double quotes); not a project gate and not
  introduced here.

## Re-run after the review fixes (tasks §7, design D4–D5)

After the two TSDoc wording fixes: `npm run typecheck` exit 0; `npm run lint` 0 errors (same warning);
`npm run docs:coverage` clean; `npx vitest run` 311 passed, 99 skipped (24 files + 7 skipped), same as
the baseline; `tests/unit/analyzers/php` 164/164; `git diff origin/feature/entrega-2-CRN --stat --
packages` → only `AnalyzerPort.ts` (11 insertions, 5 deletions), every changed line a ` *` comment
line; fixture checksum `167c762e…` unchanged. Stryker not re-run: the fixes touch comment lines only,
and the gate run above already showed the same score with and without the comment change.

## Data state verification

- No DB entity impacted (the change touches a comment only).
- Pre-test baseline:
  - `git status --porcelain fixtures/acme-shop`: empty
  - `git ls-files -s fixtures/acme-shop | sha1sum`: `167c762e26cdc3ad7b71484c19aa6135dc6c2a8d`
- Post-test validation:
  - `git status --porcelain fixtures/acme-shop`: empty
  - `git ls-files -s fixtures/acme-shop | sha1sum`: `167c762e26cdc3ad7b71484c19aa6135dc6c2a8d`
- State restored: not needed (unchanged)
- Restoration actions: none

## End-to-end testing (step 5)

- Not applicable: no route, CLI or web change; no user workflow is affected.
- CI (task 5.2): PR [#21](https://github.com/DisTinta/AI4Devs-finalproject/pull/21), commit `2f677da`.
  Run [CI 37196812322](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/37196812322):
  `quality` success, 31/31 test files and 462/462 tests passed (the database-backed suites run in CI),
  dependency rule 0 errors / 4 warnings, Stryker 94.87 % (≥ 70; same 507 mutants, timeout count varies
  by machine as noted above). Run
  [Frontend 37196812321](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/37196812321):
  success.

## UI evidence (if applicable)

- (none: the change has no browser UI)

## Outcome

- Status: PASS
- Blocking issues: none
