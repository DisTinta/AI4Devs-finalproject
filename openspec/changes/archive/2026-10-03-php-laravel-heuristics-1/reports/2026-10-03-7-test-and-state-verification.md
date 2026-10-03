# Test and State Verification Report

- Date: 2026-10-03
- Change: php-laravel-heuristics-1 (DIS-61)
- Step: 7 — Backend: Run Tests and Verify Data State

## Commands executed
- `npx vitest run` (baseline, task 0.4, before any code change)
- `npx vitest run tests/unit/analyzers/php` (twice)
- `npx vitest run`
- `env -u DATABASE_URL npx vitest run --exclude 'tests/integration/**'`
- `npm run lint`
- `npm run typecheck`
- `npm run lint:architecture`
- `npm run docs:coverage`
- `npx eslint packages/analyzers/php/src tests/unit/analyzers/php`
- `npx stryker run`
- `git diff --stat origin/feature/entrega-2-CRN -- packages/core`
- `git status --porcelain fixtures`, `git ls-files -s fixtures/acme-shop | sha1sum` (before and after)

## Test results
- Baseline (before the change): 17 files passed, 7 skipped; 197 tests passed, 99 skipped; 28.66s.
- Targeted tests (`tests/unit/analyzers/php`), run twice: 5 files, 82 passed, 0 failed both times
  (2.43s, 2.44s). No flakiness. New: `laravel/heuristic-calls.spec.ts` (18 tests: 7 scenarios + 11
  extra cases) and `laravel/container.spec.ts` (14 unit cases of the binding table).
- Required suite: 19 files passed, 7 skipped; 229 tests passed, 0 failed, 99 skipped; 28.04s. The 7
  skipped files are the integration specs that need `DATABASE_URL`, skipped the same way in the
  baseline. Delta vs baseline: +2 files, +32 tests, no test lost.
- No-database run: 15 files, 203 tests passed.
- `npm run lint`: 0 errors, 1 warning, the same as before the change
  (`packages/core/src/ports/LlmPort.ts`, an empty-interface stub not touched here).
- `npm run typecheck`: clean. `npx eslint` on the touched analyzer and test files: clean.
- `npm run lint:architecture`: 0 errors, the same 4 `no-orphans` warnings as before the change (the
  stubs `analyzers/typescript` and `adapters/llm`). `web-tree-sitter` still imported only by
  `parser.ts`; no other analyzer imported.
- `npm run docs:coverage`: clean.
- `git diff --stat origin/feature/entrega-2-CRN -- packages/core`: empty (core untouched).
- Mutation (`npx stryker run`, mutates `packages/core/src/**` only): 93.89% total, 94.07% of covered
  code, above `MIN_MUTATION_SCORE=70` (DIS-52 recorded 94.08%). Since `packages/core` has no diff, this
  change adds and removes no mutant; the 0.01-point gap cannot come from it and is run-to-run variance
  (4 mutants ended in timeout). The new analyzer code is outside Stryker's scope; its tests are shown
  able to fail by the forced failures below.
- Notes: several tests went green on their first run because an earlier task had already implemented
  the rule (3.2 extras; 4.3–4.5; 4.1's cases, whose implementation was written before the test — only
  a "module not found" RED was seen). The forced failures below stand in for their RED.

### Forced failures (task 5.3)
Each file was backed up to the scratchpad, mutated by a script whose anchor must match exactly once,
run against `tests/unit/analyzers/php`, then restored with `cp`:
1. (a) `edges.ts`: heuristics pushed first with `edges.unshift(...)`, no exact-key filter → "An exact
   edge takes precedence over a heuristic one" failed.
2. (b) `container.ts` `concreteFor`: an ambiguous key resolves to its first concrete → "An ambiguous
   binding key resolves no facade" and the container case "two providers binding a key to different
   classes leave it ambiguous" failed.
3. (c) `edges.ts`: every referenced class FQN registered as an implicit binding of itself → "an
   accessor X::class with no binding gives no edge" failed.
4. (d) `calls.ts`: arrow functions no longer opaque → "The Laravel call sites of acme-shop are heuristic
   calls", both acme-shop scenarios of `calls.spec.ts`, "Receivers without a usable declared type
   produce no edge" and the arrow-function extra case failed (5 tests).
5. (e) `container.ts` `plainStringOf`: interpolated strings accepted as keys → container case "an
   interpolated, escaped or empty string key adds nothing" failed.
6. (f) `magic-call.ts`: `self::m()` falls back to `__call` → first run: **no test failed** (the extra
   case's class declared only `__callStatic`). The case was strengthened to declare both magic
   methods; re-run → "self::, static:: and parent:: calls never fall back to __call or __callStatic"
   failed.

Restore check: in the first batch the `fc.exe /b` call was rewritten by Git Bash to `B:/` and compared
nothing. Restoration was verified instead by `grep -c` of each original anchor (present once) and of
each mutation (absent), with the targeted suite green afterwards; the script was fixed to `fc.exe //b`,
and the (f) re-run was confirmed with equal `Get-FileHash` and `fc.exe /b` "no se han encontrado
diferencias".

### Spec corrections found by the tests (tasks 5.1, 5.2)
- "An exact edge takes precedence over a heuristic one": its class `Mixed` does not parse (`mixed` is a
  reserved type name in PHP 8); renamed `Both` (`app/Both.php`) in spec and test.
- "The Laravel call sites of acme-shop are heuristic calls": "no edge has a symbol of
  `app/Facades/Pricing.php` as target" was false — five files `use App\Facades\Pricing`, so `imports`
  edges rightly target it. Narrowed to "no `calls` edge".

## Data state verification
- Pre-test baseline:
  - `git status --porcelain fixtures`: empty
  - `git ls-files -s fixtures/acme-shop | sha1sum`: `167c762e26cdc3ad7b71484c19aa6135dc6c2a8d`
  - Database: no DB entity impacted (the analyzer does no I/O over the analysed repository and
    persists nothing)
- Post-test validation:
  - `git status --porcelain fixtures`: empty
  - `git ls-files -s fixtures/acme-shop | sha1sum`: `167c762e26cdc3ad7b71484c19aa6135dc6c2a8d`
- State restored: Yes (nothing to restore)
- Restoration actions: none

## End-to-end testing (step 9)
Not applicable: the change adds no route, CLI command or web screen. The interface is the in-process
`AnalyzerPort`, exercised in the step 8 report.

### CI evidence (task 9.2)
- PR #16 (https://github.com/DisTinta/AI4Devs-finalproject/pull/16).
- First run, commit `3bd3266`: `quality` **failed**
  (https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/37129859924). "The
  constructor-injected services of acme-shop are exact calls" reported `symbol not found:
  … DiscountService::volumeBonus`. Cause: a pre-existing race. `simple-git-history.spec.ts` rebuilt
  the real fixtures' `.git` in place, rewriting tracked files with older snapshots while the analyzer
  specs read them in parallel. Fixed in this PR (tasks.md §11) by building the histories in temp copies.
- Second run, commit `2d3f46a`: `quality` pass in 3m39s
  (https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/37130600572). 26/26 test files and
  380/380 tests pass (CI has a database, so the integration specs run too). The log shows
  `✓ tests/unit/analyzers/php/laravel/heuristic-calls.spec.ts (18 tests)`,
  `✓ …/laravel/container.spec.ts (14 tests)`, `✓ …/php/calls.spec.ts (21 tests)` and
  `✓ tests/integration/git/simple-git-history.spec.ts (19 tests)`: all ran, none skipped. `frontend`
  pass (https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/37130600564).

## UI evidence (if applicable)
- (none: the change has no browser UI)

## Outcome
- Status: PASS
- Blocking issues: none
