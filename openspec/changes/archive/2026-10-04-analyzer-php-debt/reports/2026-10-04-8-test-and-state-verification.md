# Test and State Verification Report

- Date: 2026-10-04
- Change: analyzer-php-debt
- Step: 8 — Backend: Run Tests and Verify Data State

## Commands executed

- Baseline (task 0.4): `npx vitest run`, `git status --porcelain fixtures/acme-shop`,
  `git ls-files -s fixtures/acme-shop | sha1sum`, `npm run lint:architecture`
- `npx vitest run tests/unit/analyzers/php` (twice)
- `npx vitest run`
- `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- `npx eslint packages/analyzers/php/src tests/unit/analyzers/php packages/core/src/ports`
- `npx stryker run`
- `git diff --stat origin/feature/entrega-2-CRN -- packages/core`, `git diff --stat origin/feature/entrega-2-CRN -- tests`
- Forced failures: scratchpad `force.mjs` with `mutations-1.json`, `mutations-2.json`, `mutations-3.json`

## Test results

- Baseline (before any change): 23 files passed, 7 skipped; 304 tests passed, 99 skipped (455).
  `lint:architecture`: 0 errors, 4 `no-orphans` warnings.
- Targeted tests: `tests/unit/analyzers/php` 161 passed, 0 failed (10 files), identical on both runs.
- Required suite: `npx vitest run` 24 files passed, 7 skipped; 308 tests passed, 99 skipped (459).
  +4 tests: "Duplicate input paths keep the first", "Symbols that start on one line are ordered by span,
  then name", and the two tests of the new `parser-load.spec.ts`.
- Gates: `lint` 0 errors (1 pre-existing warning, `no-empty-object-type` in `LlmPort.ts`); `typecheck`
  clean; `lint:architecture` 0 errors, same 4 warnings, with the new `analyzers-no-io` rule;
  `docs:coverage` clean; targeted `eslint` clean apart from that same pre-existing warning.
- Mutation: Stryker (mutates `packages/core/src/**` only) 95.07 % ≥ `MIN_MUTATION_SCORE=70`. Core has no
  code change (JSDoc only), so the score cannot move because of this change; it differs from DIS-98's
  94.87 % only through timeouts.
- `packages/core`: `git diff --stat` shows only `src/ports/AnalyzerPort.ts` (14+, 8−), every changed
  line a comment line (checked by filtering the diff for non-comment lines: none).
- Runtime: full suite 71 s.
- Notes: no flaky behaviour; no retries.

### Forced failures

Each mutation was applied by `force.mjs` (literal anchors, skipped unless each matches exactly once),
then the file was restored from memory and checked by SHA-256. `git diff -- packages | sha1sum` was the
same before and after each batch.

| Id | Mutation | Result |
|---|---|---|
| a | parse `input.files` instead of the deduplicated inputs | "Duplicate input paths keep the first" fails |
| b | lower-case the paths in the seen set | same scenario fails |
| c | dedupe only `.php` inputs | same scenario fails |
| d | drop the `endLine` comparison of `bySymbolOrder` | "Symbols that start on one line are ordered by span, then name" fails |
| e | drop the `name` comparison of `bySymbolOrder` | same scenario fails |
| f | `diagnosticFor` returns `row + 2` | "A syntax error does not stop the analysis" fails (the old assertions would not have caught it) |
| g | `describeFile` gets an extra leading newline (loc 2) | that scenario fails on `loc`, with 3 other `loc` tests (4 failed) |
| h | `import 'node:fs'` in `symbols.ts` | `error analyzers-no-io: … → fs` |
| i | `import { readFileSync } from 'fs'` | `error analyzers-no-io: … → fs` |
| j | `import 'node:child_process'` | `error analyzers-no-io: … → child_process` |
| k | `spanOf` starts at the declaration's `name` child | "Symbol spans include modifiers and attributes" fails: `expected [ …(2) ] to deeply equal [ ObjectContaining{…}, …(1) ]` (closes task 5.6 of `analyzer-port-and-php-structure`) |
| l | `import 'node:worker_threads'` | `error analyzers-no-io: … → worker_threads` |

RED observed before GREEN for the two behaviour scenarios: "Duplicate input paths keep the first"
(`expected [ [ 'README.md', 1 ], …(5) ] to deeply equal [ [ 'README.md', 1 ], …(2) ]`) and "A failed
parser load does not poison later calls" (second call rejected with the cached
`Error: grammar load failed`; the first call rejecting proves the `vi.mock` is hit).

## Data state verification

- Pre-test baseline:
  - `git status --porcelain fixtures/acme-shop`: empty
  - `git ls-files -s fixtures/acme-shop | sha1sum`: `167c762e26cdc3ad7b71484c19aa6135dc6c2a8d`
  - Database: no DB entity impacted (the analyzer has no persistence)
- Post-test validation:
  - `git status --porcelain fixtures/acme-shop`: empty
  - checksum: `167c762e26cdc3ad7b71484c19aa6135dc6c2a8d`
- State restored: Yes (nothing to restore)
- Restoration actions: none

## End-to-end testing (task 10.1)

Not applicable: the change adds no route, CLI command or web change; no user workflow reaches the
analyzer yet.

## CI

PR #20 (https://github.com/DisTinta/AI4Devs-finalproject/pull/20). Run CI 37193003777 (https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/37193003777): `quality` success, 31/31 test files and 462/462 tests, none skipped (the database-backed tests run in CI); `parser-load.spec.ts` ran its 2 tests; the dependency rule step ran with `analyzers-no-io`: 0 errors, the same 4 warnings. Frontend run 37193003765 success.

## UI evidence (if applicable)

- (none: the change has no browser UI)

## Outcome

- Status: PASS
- Blocking issues: none

## Addendum — review fixes and author decisions (2026-10-04, tasks §12)

- Extra cases from the reviews (design D10): a discarded doc duplicate yields no edge; `./`, `\` and a
  leading space make distinct paths; reversed acme-shop input gives an equal result. Option A extends
  the same-line scenario with siblings (`d` 5–6 before `c` 5–5). `analyzers-no-io` adds `vm`, `wasi`,
  `inspector`, `sqlite`.
- `tests/unit/analyzers/php`: 164 passed (10 files). `lint:architecture` 0 errors, same 4 warnings;
  `typecheck`, `docs:coverage` clean; `openspec validate --strict` valid; `packages/core` diff still
  only comment lines of `AnalyzerPort.ts` (16+, 10−); fixture checksum unchanged.
- `.dependency-cruiser.cjs` had been saved with CRLF (whole-file diff); restored to LF, diff now only
  the rule.

| Id | Mutation | Result |
|---|---|---|
| m | `docMentionEdges(input.files, …)` | "a discarded duplicate contributes no edge…" fails |
| n | seen-set key `path.trim()` | "paths that differ by ./, separator or whitespace…" fails |
| o | seen-set key strips `./` and maps `\` to `/` | same case fails |
| p | `files` not sorted | "the order of the inputs does not affect the result" fails, with 2 more (3 of 19) |
| d (re-run) | drop the `endLine` comparison, extended scenario | the same-line scenario fails |
| q | `import 'node:vm'` in `symbols.ts` | `error analyzers-no-io: … → vm` |

Each restored; `git diff -- packages | sha1sum` identical before and after each batch.
