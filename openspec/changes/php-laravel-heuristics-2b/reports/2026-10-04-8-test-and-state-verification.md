# Test and State Verification Report

- Date: 2026-10-04
- Change: php-laravel-heuristics-2b
- Step: 8 — Backend: Run Tests and Verify Data State

## Commands executed
- `npx vitest run` (baseline, task 0.4, before any change)
- `git status --porcelain fixtures/acme-shop`; `git ls-files -s fixtures/acme-shop | sha1sum` (before and after)
- `npx vitest run tests/unit/analyzers/php` (twice)
- `npx vitest run`
- `npm run lint`
- `npm run typecheck`
- `npm run lint:architecture`
- `npm run docs:coverage`
- `npx eslint packages/analyzers/php/src tests/unit/analyzers/php`
- `npx stryker run`
- `git diff --stat origin/feature/entrega-2-CRN -- packages/core`
- Forced failures (task 6.2): scratchpad `force.mjs` + `mutations.json`, with `npx vitest run tests/unit/analyzers/php` per mutation

## Test results
- Baseline (before the change): 21 files passed, 7 skipped; 273 tests passed, 99 skipped (424).
- Targeted tests (`tests/unit/analyzers/php`), two runs: 9 files, 149 passed, 0 failed, both runs identical (no flakiness).
- Required suite (`npx vitest run`): 23 files passed, 7 skipped; 296 passed, 0 failed, 99 skipped (447). +23 tests: 11 in `laravel/eloquent.spec.ts`, 12 in `laravel/unresolved.spec.ts`.
- Lint: 0 errors, 1 pre-existing warning (`@typescript-eslint/no-empty-object-type` in `LlmPort.ts`, unchanged).
- Typecheck: clean. `lint:architecture`: 0 errors, the same 4 `no-orphans` warnings (stubs). `docs:coverage`: clean.
- Stryker (core only, `packages/core/src/**`): 94.87 % (471 killed, 10 timed out, 25 survived), above `MIN_MUTATION_SCORE=70`. `packages/core` has no diff, so its mutants are the same as in DIS-97 (93.89 %); the difference comes from timeouts, which count as detected and vary with machine load.
- `git diff --stat origin/feature/entrega-2-CRN -- packages/core`: empty.
- Runtime: full suite ~53 s; Stryker 2 min 35 s.
- Notes — forced failures (task 6.2), each restored and checked by SHA-256; `git diff -- packages | sha1sum` identical before and after the runs (`064fbec4…`):
  1. (a) `?T` parameters accepted → first run **survived** (149/149): the scenario's `$n->author` shares its target with `$p->author->name`. Extra case strengthened (`?Post $n` alone) → it fails (1/149).
  2. (a2) `= null` parameters accepted → "a nullable, null-default or variadic parameter is no receiver" fails (1).
  3. (b) assignment LHS as read → "compound and reference assignments, variable and computed names read nothing" fails (1).
  4. (c) `a` before `get…Attribute` → "the accessor wins over a method with the attribute name" fails (1).
  5. (d) `directlyExtends(Model)` dropped → the Eloquent scenario and two extra cases fail (3).
  6. (e) typed parameters for method calls → "Receivers without a usable declared type produce no edge", "The constructor-injected services of acme-shop are exact calls", the Eloquent scenario and the acme-shop acceptance test fail (4).
  7. (f) Eloquent edges as `exact` → six tests fail, both acme-shop scenarios included (6).
  8. (g) `job-no-handle` recorded although `__callStatic` resolves → its extra case fails (1).
  9. (h) deduplication dropped → "The unresolved report is deterministic and without duplicates" fails (1).
  10. (i) `reason` sorted before `line` → no planned test caught it; extra case "the sites of one method are ordered by line before reason" added → it fails (1).
  11. (j) multi-namespace routes reported → "a routes file with two namespace declarations reports nothing" fails (1).
- After the review fixes (tasks §12, same day): `tests/unit/analyzers/php` 157/157 twice; `npx vitest run` 23 files passed, 7 skipped, 304 passed, 99 skipped (455); lint 0 errors (same warning); typecheck, `lint:architecture` (same 4 warnings), `docs:coverage` clean; `openspec validate --strict` valid; the 25 delta scenarios map 1:1 to tests; acme-shop still 47 `exact` + 17 `heuristic`, `unresolved` `[]`; `packages/core` diff empty. Further forced failures, each restored (`git diff -- packages | sha1sum` identical before and after):
  12. (k) plain `=` not excluded and (l) `?->` read → "a plain assignment target and a nullsafe access read nothing, each alone" fails (1 each).
  13. (m) no `source.name` comparison → "sites of two methods on one line are ordered by source name" fails (1).
  14. (n) string route to an interface → that case and a string-routes extra case fail (2).
  15. (o) `++`/`--` as reads → "Writes never read an Eloquent attribute; isset and indirect modification do" fails (1).
  16. (p) destructuring key as target and (q) foreach iterable as target → "a destructuring key and the iterated expression of a foreach are reads" fails (1 each).
  17. (r) no self-target check → "a read whose target is the caller method itself yields no edge" fails (1).
  18. (s) inherited `handle` counted → the inherited-methods case fails (1); (t) facade resolving without `m` → five facade tests fail.
  19. (u) `PhpAnalyzer.analyze` not returning an `AnalysisResult` → `npm run typecheck`: `error TS2430: Interface 'PhpAnalyzer' incorrectly extends interface 'AnalyzerPort'`.
- Stryker was not re-run after §12: `packages/core` is still untouched, so its mutants and score (94.87 %) are unaffected.
- End-to-end testing (step 10.1): **not applicable**. The change adds no HTTP route, CLI command or web screen; the only interface is `createPhpAnalyzer().analyze()`, exercised in step 9.
- CI (step 10.2): pending push; to be linked here.

## Data state verification
- No DB entity impacted: the analyzer reads content in memory and writes nothing.
- Pre-test baseline:
  - `git status --porcelain fixtures/acme-shop`: empty
  - `git ls-files -s fixtures/acme-shop | sha1sum`: `167c762e26cdc3ad7b71484c19aa6135dc6c2a8d`
- Post-test validation:
  - `git status --porcelain fixtures/acme-shop`: empty
  - `git ls-files -s fixtures/acme-shop | sha1sum`: `167c762e26cdc3ad7b71484c19aa6135dc6c2a8d`
- State restored: Yes (nothing changed)
- Restoration actions: none; every forced-failure mutation was restored by the script and verified by hash.

## UI evidence (if applicable)
- (none: the change has no browser UI)

## Outcome
- Status: PASS
- Blocking issues: none
