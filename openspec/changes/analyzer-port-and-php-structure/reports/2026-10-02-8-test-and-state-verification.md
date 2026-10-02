# Test and State Verification Report

- Date: 2026-10-02
- Change: analyzer-port-and-php-structure
- Step: 8 — Run Tests and Verify Data State

## Dependency checks (tasks 1.1–1.2)

- `npm view web-tree-sitter name version license` → `web-tree-sitter 0.27.0`, MIT.
- `npm view tree-sitter-php name version license` → `tree-sitter-php 0.24.2`, MIT.
- `npm pack tree-sitter-php --dry-run` (scratchpad) → tarball contains `tree-sitter-php.wasm` (1.1MB)
  and `tree-sitter-php_only.wasm` (1.0MB).
- `npm install -w packages/analyzers/php web-tree-sitter tree-sitter-php` → caret ranges recorded in
  `packages/analyzers/php/package.json`.
- `npm ci` from a clean `node_modules` → no `node-gyp rebuild` / MSVC output; `tree-sitter-php`'s
  `node-gyp-build` install script and `esbuild`'s postinstall were both skipped by the repo's
  `allowScripts` policy (native binding never built, consistent with design D4's WASM-only path).
- `npm run typecheck` and `npm run lint:architecture` → both green after the dependency install.
- Smoke parse (scratch script, deleted after use): `Parser.init()` + `Language.load(tree-sitter-php.wasm)`
  then `parser.parse()` on `fixtures/acme-shop/app/Services/PriceCalculator.php` → `rootNode.type`
  `program`, `rootNode.hasError` `false`. No ABI mismatch; the D4 native fallback was not needed.

## Forced failures (task 6.3)

Each bug was introduced, the single named test was run to confirm the failure, then the file was
restored from a scratchpad backup and the restoration confirmed with `cmp`.

1. **Doc comment folded into a span** (`symbols.ts`, `spanOf` extended to a preceding `comment`
   sibling) → `PriceCalculator symbols have exact spans` failed: `PriceCalculator::taxableBase`
   reported `startLine: 37` (the docblock line) instead of `38`. Restored; `cmp` confirmed identical
   to the backup.
2. **Symbols kept for a file with `hasError`** (`php-analyzer.ts`, `analyzeOne` always calling
   `extractSymbols` instead of only on the non-error branch) → `A syntax error does not stop the
   analysis` failed: `result.symbols.some(file === 'app/Broken.php')` was `true` instead of `false`.
   Restored; `cmp` confirmed identical to the backup.
3. **Final sort dropped, input reversed** (`php-analyzer.ts`, both `.sort(byPath)` and
   `symbols.sort(bySymbolOrder)` commented out; the test's second `analyze` call fed the fixture
   files in reverse order) → `The acme-shop analysis is a valid deterministic graph` failed:
   `second` no longer equalled the first run (symbols and files came back in reversed order).
   Restored (`php-analyzer.ts` and `structure.spec.ts`); `cmp` confirmed both identical to their
   backups.

## Mutation score (task 3.3)

- `npx stryker run --mutate "packages/core/src/knowledge/file-kind.ts"` → **95.89 %** (70 killed, 2
  survived, 1 no-coverage), well above the `MIN_MUTATION_SCORE=70` threshold. The two remaining
  survivors (`content.endsWith('\n')` → `content.endsWith("")`, and the matching extension-default
  case) are equivalent mutants given the current `countLines`/`isConfig` implementation: for every
  input the mutated branch produces the same observable split length, so no test can distinguish
  them without changing the implementation.
- Full `npx stryker run` (whole of `packages/core/src`, task 8.3) → **92.98 %** overall
  (`file-kind.ts` 95.89 %, all other files at or above their pre-change scores). No regression.

## Commands executed

- `npx vitest run tests/unit/knowledge/file-kind.spec.ts tests/unit/analyzers/php` (×2, flakiness check)
- `npx vitest run`
- `npm run lint`
- `npm run typecheck`
- `npm run lint:architecture`
- `npm run docs:coverage`
- `npx stryker run`
- `npx vitest run --exclude 'tests/integration/**'` (no `DATABASE_URL`)
- `git status --porcelain fixtures`
- `git ls-files -s fixtures/acme-shop | sha1sum`

## Test results

- Targeted tests (×2): 23 passed, 0 failed, 0 skipped both times (`file-kind.spec.ts` 14,
  `structure.spec.ts` 9).
- Full suite (`npx vitest run`): 124 passed, 99 skipped (no `DATABASE_URL`), 0 failed — 13 test files
  passed, 7 skipped. One run hit a transient `EPERM` deleting `fixtures/task-api/.git` during the
  shared fixture rebuild (Windows file-lock race, unrelated to this change — nothing in this change
  touches the git fixtures or history code); a re-run passed cleanly, and the full suite passed again
  immediately after.
- `npm run lint`: 0 errors, 1 pre-existing warning (`LlmPort.ts` empty interface, unrelated to this
  change).
- `npm run typecheck`: clean.
- `npm run lint:architecture`: 0 errors, 4 pre-existing `no-orphans` warnings (empty stub packages).
- `npm run docs:coverage`: clean (every new export carries TSDoc).
- `npx stryker run`: 92.98 % overall, see above.
- No-database run (`--exclude 'tests/integration/**'`, no `DATABASE_URL`): 9 test files, 98 passed,
  including both new spec files — no import error.
- Baseline (task 0.4, before any change): 101 passed, 99 skipped, 11 files passed / 7 skipped (18
  total). Post-change: 124 passed (+23, exactly the new tests), 99 skipped, 13 files passed / 7
  skipped (20 total, +2 new spec files). No existing test's outcome changed.
- Runtime: full suite ~28–32 s per run.
- Notes: no flaky test in the new suites across repeated runs; the one `EPERM` was on the pre-existing
  git-history fixture rebuild, reproduced once and not on any subsequent run.

## Data state verification

- Pre-test baseline:
  - `git status --porcelain fixtures`: empty
  - `git ls-files -s fixtures/acme-shop | sha1sum`: `167c762e26cdc3ad7b71484c19aa6135dc6c2a8d`
  - Tracked files under `fixtures/acme-shop`: 53
  - Database: no DB entity impacted (this change adds no migration, no store call)
- Post-test validation:
  - `git status --porcelain fixtures`: empty (unchanged)
  - `git ls-files -s fixtures/acme-shop | sha1sum`: `167c762e26cdc3ad7b71484c19aa6135dc6c2a8d` (unchanged)
- State restored: Yes (nothing to restore — the fixture was never mutated; the three deliberate bugs
  of task 6.3 were restored from scratchpad backups and confirmed with `cmp`, as detailed above)
- Restoration actions: none needed beyond the 6.3 proof-and-restore cycle already described

## UI evidence (if applicable)

- (none — this change has no browser UI; see task 10.1)

## CI evidence (task 10.2)

PR [#13](https://github.com/DisTinta/AI4Devs-finalproject/pull/13) against `feature/entrega-2-CRN`.
`quality` run: https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/37032703808 — passed.
`npm ci` installed clean (`added 530 packages ... in 12s`, no native build step, no `node-gyp rebuild`
/ MSVC output in the log). Both `tests/unit/analyzers/php/structure.spec.ts` (9 tests) and
`tests/unit/knowledge/file-kind.spec.ts` (14 tests) ran and passed — not skipped. `frontend` run:
https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/37032703759 — passed.

## End-to-end testing (task 10.1)

Not applicable: this change adds no user interface, no HTTP route and no CLI command. The interface
is `createPhpAnalyzer()`, exercised directly in the Manual Interface Testing report (step 9). There is
no user workflow to drive end to end.

## Adversarial review fixes (2026-10-02, second pass)

The adversarial review returned FAIL (two blockers, two majors). Fixes, each RED seen before GREEN
except where noted:

- `fileKindOf` checked the file name as a directory segment (`bin/test`, `test`, `docs` misclassified)
  → `f93171c`, task 3.4.
- Method of an anonymous class nested in a named class got the outer prefix (`Foo::run`); a function
  declared inside a method was emitted → `8d04415`, task 5.7.
- Duplicate symbols on (file, name, startLine) broke graph validation → author decision design D9,
  `19a156c` (planning), `600106e` (code), tasks 6.5–6.7.
- Scenario "Symbol spans include modifiers and attributes" committed on its own (`7154923`, task 5.6).
  **RED was not observed** for it: it was added after the implementation, which already satisfied it.
  Recorded as process debt.

Re-run of the gates after the fixes:

- Targeted tests (×2): 29 passed, 0 failed, 0 skipped both times (`file-kind.spec.ts` 16,
  `structure.spec.ts` 13).
- Full suite (`npx vitest run`): 130 passed, 99 skipped (no `DATABASE_URL`), 0 failed — 13 files
  passed, 7 skipped. +6 tests over the first pass, exactly the added ones; no existing test changed.
- `npm run lint`: 0 errors, the same pre-existing `LlmPort.ts` warning. `npm run typecheck`: clean.
  `npm run lint:architecture`: 0 errors, the same 4 pre-existing `no-orphans` warnings.
  `npm run docs:coverage`: clean.
- `npx stryker run`: **93.02 %** overall; `file-kind.ts` **96.00 %** (72 killed, 3 survived, all
  equivalent: the `name.includes('.')` / `''` extension default on line 24 and the
  `content.endsWith('\n')` branch on line 52, unchanged by the fixes).
- Scenario mapping (task 7.2): the 14 `#### Scenario:` titles each match exactly one `it(...)` in
  `tests/`.
- Fixture state before and after: `git status --porcelain fixtures` empty, `git ls-files -s
  fixtures/acme-shop | sha1sum` = `167c762e26cdc3ad7b71484c19aa6135dc6c2a8d`, unchanged.
- CI evidence for the new tests (task 10.2), head `804f223`: `CI` run
  https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/37038796913 — passed; `npm ci`
  installed clean (`added 530 packages ... in 9s`, no native build step); `structure.spec.ts` (13
  tests) and `file-kind.spec.ts` (16 tests) ran and passed, not skipped. `Frontend` run
  https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/37038796880 — passed.

## Outcome

- Status: PASS
- Blocking issues: none
