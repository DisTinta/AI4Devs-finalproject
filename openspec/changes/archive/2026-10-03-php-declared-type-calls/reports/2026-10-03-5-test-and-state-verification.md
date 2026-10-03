# Test and State Verification Report

- Date: 2026-10-03
- Change: php-declared-type-calls (DIS-52)
- Step: 5 — Backend: Run Tests and Verify Data State

## Commands executed
- `npx vitest run` (baseline, task 0.4, before any code change)
- `npx vitest run tests/unit/analyzers/php` (twice)
- `npx vitest run`
- `npm run lint`
- `npm run typecheck`
- `npm run lint:architecture`
- `npm run docs:coverage`
- `env -u DATABASE_URL npx vitest run --exclude 'tests/integration/**'`
- `npx stryker run`
- `git status --porcelain fixtures`, `git ls-files -s fixtures/acme-shop | sha1sum` (before and after)

## Test results
- Baseline (before the change): 16 files passed, 7 skipped; 176 tests passed, 99 skipped; 30.11s.
- Targeted tests (`tests/unit/analyzers/php`), run twice: 45 passed, 0 failed both times (2.22s,
  2.27s). No flakiness. New: `calls.spec.ts` (16 tests).
- Required suite: 17 files passed, 7 skipped; 192 tests passed, 0 failed, 99 skipped; 28.72s. The 7
  skipped files are the integration specs that need `DATABASE_URL`, skipped the same way in the
  baseline.
- No-database run: 13 files, 166 tests passed.
- `npm run lint`: 0 errors, 1 warning, the same as before the change
  (`packages/core/src/ports/LlmPort.ts`, an empty-interface stub not touched here).
- `npm run typecheck`: clean.
- `npm run lint:architecture`: 0 errors, the same 4 `no-orphans` warnings as before the change (the
  stubs `analyzers/typescript` and `adapters/llm`).
- `npm run docs:coverage`: clean.
- Mutation (`npx stryker run`, mutates `packages/core/src/**` only): 94.08%, above
  `MIN_MUTATION_SCORE=70`. This change touches only a JSDoc in core, so it adds no mutants. The new
  analyzer code is outside Stryker's scope; its tests are shown able to fail by the forced failures
  below.
- Notes: tests 2.2–2.7 went green on first run because 2.1's implementation already covered every
  form. They had no separate RED; the forced failures below and those of `tasks.md` 10.3 stand in for it.

### Forced failures (task 3.5)
Each file was backed up to the scratchpad, mutated, run, restored, and checked byte-identical with
`cmp`:
1. `edges.ts`: fallback to `Type::__call` when the method is missing → "The heuristic call sites of
   acme-shop have no exact edge" failed (`ShippingService::shippingFor` → `CarrierGateway::__call`).
2. `calls.ts`: `?Clock` accepted as a usable property type → "Receivers without a usable declared
   type produce no edge" failed.
3. `calls.ts`: walk descends into `arrow_function` → "The heuristic call sites of acme-shop have no
   exact edge" failed (`AppServiceProvider::register`), and so did "Receivers without a usable
   declared type produce no edge".

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

## End-to-end testing (step 7)
Not applicable: the change adds no route, CLI command or web screen. The interface is the in-process
`AnalyzerPort`, exercised in the step 6 report.

### CI evidence (task 7.2)
- PR #15 (https://github.com/DisTinta/AI4Devs-finalproject/pull/15), commit `449837d`.
- `quality`: pass in 2m16s,
  https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/37112509888. The log shows
  `✓ tests/unit/analyzers/php/calls.spec.ts (16 tests)`, run and not skipped. All 24 test files pass
  (CI has a database, so the integration specs run too), and `calls.spec.ts` is picked up by the
  "Mutation testing on critical paths" step.
- `frontend`: pass, https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/37112509965.

## UI evidence (if applicable)
- (none: the change has no browser UI)

## Outcome
- Status: PASS
- Blocking issues: none
