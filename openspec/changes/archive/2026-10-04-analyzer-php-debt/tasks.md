## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Set DIS-96 to In Progress in Linear right away, before anything else, with a short comment in Spanish (change name `analyzer-php-debt` and branch)
- [x] 0.2 Create (or confirm) feature branch `feature/DIS-96-analyzer-php-debt` from the delivery branch `origin/feature/entrega-2-CRN` (DIS-98 already merged there, PR #19; see `docs/project-context.md` → Branch and ticket conventions), carrying the `openspec/changes/analyzer-php-debt/` planning files. Leave the branch upstream unset so a push never targets the delivery branch
- [x] 0.3 Verify branch creation and current branch status (`git status`, `git branch --show-current`)
- [x] 0.4 Baseline: run `npx vitest run` once, green, and record the totals for the step 8 report; record `git status --porcelain fixtures/acme-shop` (must be empty) and `git ls-files -s fixtures/acme-shop | sha1sum` (expected `167c762e26cdc3ad7b71484c19aa6135dc6c2a8d`); run `npm run lint:architecture` and record its errors/warnings
  - Baseline 2026-10-04: `npx vitest run` 23 files passed, 7 skipped; 304 tests passed, 99 skipped (455). `git status --porcelain fixtures/acme-shop` empty; checksum `167c762e26cdc3ad7b71484c19aa6135dc6c2a8d`. `lint:architecture`: 0 errors, 4 `no-orphans` warnings (typescript analyzer and llm adapter, src and dist). Branch has no upstream. DIS-96 In Progress with a Spanish comment.

## 1. Analyzer: duplicate input paths (TDD, design D1)

- [x] 1.1 RED only: write "Duplicate input paths keep the first" in `tests/unit/analyzers/php/structure.spec.ts` with the six inputs verbatim (compare `diagnostics` as a set; assert no entry has `line`; wrap in a graph and call `validateGraph`). Run `npx vitest run tests/unit/analyzers/php/structure.spec.ts` and record the failure message; everything else green
  - RED seen: `expected [ [ 'README.md', 1 ], …(5) ] to deeply equal [ [ 'README.md', 1 ], …(2) ]` (six `GraphFile`s instead of three); the other 14 tests of the file green.
- [x] 1.2 GREEN: in `php-analyzer.ts`, deduplicate `input.files` first (`Set` of paths, first in input order kept, one `duplicate path "<path>"; kept the first` diagnostic per discarded input, no `line`), and make `describeFile`, the `.php` filter and `docMentionEdges` read the deduplicated list only. Scenario green; `npx vitest run tests/unit/analyzers/php` green
  - GREEN: `uniqueInputs` in `php-analyzer.ts` runs first; `describeFile`, the `.php` filter and `docMentionEdges` read its result only (no `input.files` left after it). `tests/unit/analyzers/php` 158/158.
- [x] 1.3 Forced failures (scratchpad backup, literal-anchor node script, restore checked with `Get-FileHash`): (a) dedupe after parsing instead of before → a `duplicate symbol` diagnostic or a second `GraphFile` appears and the scenario fails; (b) normalise paths to lower case → `app/a.php` is lost and the scenario fails; (c) dedupe only `.php` inputs → the `README.md` clause fails. Record results for the step 8 report
  - Forced failures (2026-10-04), scratchpad `force.mjs` + `mutations-1.json` (literal anchors, skipped unless each matches exactly once; restore checked by SHA-256; `git diff -- packages | sha1sum` `bea5548f…` before and after). (a) parse `input.files` instead of the deduplicated list → the scenario fails; (b) lower-case paths in the seen set → fails; (c) dedupe only `.php` inputs → fails. Each 1 failed / 14 passed.
- [x] 1.4 Port JSDoc (design D9), comment lines only, in `packages/core/src/ports/AnalyzerPort.ts`: (a) `AnalyzerInput.files` → "order does not affect the result, except that when several inputs share a path only the first is analysed"; (b) `AnalysisResult.files` → "One `GraphFile` per distinct input path, ordered by `path`"; (c) `AnalysisResult.diagnostics`, `AnalyzerDiagnostic` and `AnalyzerPort.analyze` → add "one per input discarded as a duplicate path (no `line`)". Run `npm run typecheck` and `npm run docs:coverage`; confirm `git diff origin/feature/entrega-2-CRN -- packages/core` touches only comment lines of that file
  - JSDoc updated in `AnalyzerPort.ts` (`AnalyzerInput.files`, `AnalyzerDiagnostic`, `AnalysisResult.files`, `AnalysisResult.diagnostics`, `AnalyzerPort.analyze`). `git diff -- packages/core`: only comment lines of that file. `npm run typecheck` and `npm run docs:coverage` clean. A first attempt with a `node -e` script aborted before writing (the shell expanded the backticks of the JSDoc); redone with literal edits.

## 2. Analyzer: rejected parser load is not cached (TDD, design D2–D3)

- [x] 2.1 RED only: create `tests/unit/analyzers/php/parser-load.spec.ts` with "A failed parser load does not poison later calls" (`vi.mock` of `../../../../packages/analyzers/php/src/parser`, `loadPhpParser` a `vi.fn` delegating to the real one by default; a `beforeEach` calls `vi.mocked(loadPhpParser).mockReset()` and then `.mockImplementation(realLoadPhpParser)`, with `realLoadPhpParser` taken from `importOriginal` (design D3); the test creates its own `createPhpAnalyzer()` and queues its own `mockRejectedValueOnce`; assert first call rejects with that error, second resolves with `class Ghost`, mock called twice). Run it and confirm it fails because the second call rejects (proof that the mock is hit); record the message
  - RED seen: the second `analyze` rejected with the cached `Error: grammar load failed` (1 failed). The first call rejecting proves the mock is hit (`./parser.js` in `php-analyzer.ts` and the extensionless test path resolve to one module). `realLoadPhpParser` is captured from `importOriginal` inside the `vi.mock` factory through `vi.hoisted`.
- [x] 2.2 GREEN: reset `parserPromise` on rejection in `getParser` (design D2), and update the JSDoc of `loadPhpParser` in `parser.ts`: drop "call this at most once per instance"; say `createPhpAnalyzer` memoises the promise per instance and forgets it when it rejects. The new test green; `npx vitest run tests/unit/analyzers/php` green
  - GREEN: `getParser` forgets the promise in a `.catch` that rethrows; `loadPhpParser` JSDoc no longer says "call this at most once per instance". `tests/unit/analyzers/php` 159/159 (10 files).
- [x] 2.3 Extra case (not a spec scenario) in `parser-load.spec.ts`: starting from the same `beforeEach` (`mockReset()` then `.mockImplementation(realLoadPhpParser)`), with its own `createPhpAnalyzer()` and its own `mockRejectedValueOnce`, two concurrent first calls started before awaiting and read with `Promise.allSettled` while the load rejects → both `rejected` and the mock was called once; a third call succeeds (mock called twice). Green on first run expected; record it
  - Extra case "shares one failed load between concurrent calls and loads again on the next call": green on first run (both `rejected`, mock called once; third call resolves, mock called twice). `parser-load.spec.ts` 2/2.

## 3. Analyzer: same-line symbol order (design D5)

- [x] 3.1 Confirm with the project's parser (scratch script in the scratchpad, deleted afterwards) that `<?php function z() { function a() {}\n}` yields `function z` 1–2 and `function a` 1–1; record in design.md Context if it differs, and stop to ask if it does
  - Confirmed with the real analyzer (`npx tsx -e`, nothing written to the repo): `function z 1-2`, `function a 1-1`, `function a2 3-3`, `function b 3-3`, no diagnostic. Matches design Context; nothing to record.
- [x] 3.2 Write "Symbols that start on one line are ordered by span, then name" in `structure.spec.ts` with the content verbatim (exact list, in order). Expected green on first run (the order already exists); record it
  - "Symbols that start on one line are ordered by span, then name" in `structure.spec.ts` (describe "analysis contract"): green on first run, as expected.
- [x] 3.3 Forced failures on `bySymbolOrder`: (d) remove the `endLine` comparison → the scenario fails (`a` before `z`); (e) remove the `name` comparison → the scenario fails (`b` before `a2`). Restore, hash check, record
  - Forced failures (scratchpad `mutations-2.json`, `git diff -- packages | sha1sum` `cdc06524…` before and after): (d) no `endLine` comparison → the scenario fails; (e) no `name` comparison → the scenario fails. Each 1 failed / 15 passed.

## 4. Analyzer: exact syntax-error assertions (design D6)

- [x] 4.1 Update in place, strengthening only, "A syntax error does not stop the analysis" in `structure.spec.ts`: `loc` 1 instead of `toBeDefined()`, and diagnostic `line` 1. Expected green on first run; record it
  - `loc` is now `toBe(1)` and the diagnostic is matched with `line: 1`; nothing removed. Green on first run.
- [x] 4.2 Forced failures: (f) `diagnosticFor` returns `startPosition.row + 2` → the scenario fails on `line`; (g) `php-analyzer.ts` passes `describeFile` the content with an extra leading newline → the scenario fails on `loc`. Restore, hash check, record
  - Forced failures: (f) `diagnosticFor` returns `row + 2` → only "A syntax error does not stop the analysis" fails (the old assertions would not have caught it); (g) `describeFile` given an extra leading newline → that scenario fails on `loc`, with "The acme-shop files are classified", "The analyzer reads only the content it receives" and "Duplicate input paths keep the first" (4 failed).

## 5. Architecture: `analyzers-no-io` rule (design D4)

- [x] 5.1 Add the `analyzers-no-io` rule to `.dependency-cruiser.cjs` as in design D4 (pattern `^(node:)?(fs|net|tls|dgram|dns|http|https|http2|child_process|worker_threads|cluster|vm|wasi|inspector|sqlite)(/|$)`; `vm`, `wasi`, `inspector`, `sqlite` added by author decision, design D10). Run `npm run lint:architecture`: no new error or warning against the 0.4 baseline
  - `analyzers-no-io` added to `.dependency-cruiser.cjs` (pattern of design D4; its comment names the `fetch`/`createRequire` gap). `npm run lint:architecture`: 0 errors, same 4 `no-orphans` warnings as the 0.4 baseline.
- [x] 5.2 Forced failures: (h) add `import 'node:fs';` to `packages/analyzers/php/src/symbols.ts` → `lint:architecture` reports `analyzers-no-io`; (i) same with `import { readFileSync } from 'fs';`; (j) same with `import 'node:child_process';`; (l) same with `import 'node:worker_threads';`; (q) same with `import 'node:vm';` (added with the author decision of D10, run in 12.4). Restore after each, hash check, record
  - Forced failures (scratchpad `mutations-3.json`, `git diff -- packages | sha1sum` `cdc06524…` before and after): (h) `import 'node:fs'` → `error analyzers-no-io: packages/analyzers/php/src/symbols.ts → fs` (dependency-cruiser reports `node:fs` as `fs`); (i) `import { readFileSync } from 'fs'` → same error; (j) `import 'node:child_process'` → `→ child_process`; (l) `import 'node:worker_threads'` → `→ worker_threads`. Each: 1 error, 4 warnings, exit 1.

## 6. Process: observed RED of "Symbol spans include modifiers and attributes" (design D7)

- [x] 6.1 Forced failure (k): `spanOf` in `symbols.ts` starts at the declaration's `name` child → run the scenario, record the failure message (closes task 5.6 of `analyzer-port-and-php-structure`), restore, hash check. No code change remains
  - Forced failure (k): `spanOf` starting at the declaration's `name` child → "Symbol spans include modifiers and attributes" fails with `AssertionError: expected [ …(2) ] to deeply equal [ ObjectContaining{…}, …(1) ]`; restored (SHA-256 checked). RED observed: closes task 5.6 of `analyzer-port-and-php-structure`. No code change remains.

## 7. Backend: Review and Update Existing Tests (MANDATORY)

- [x] 7.1 Review the in-place update of "A syntax error does not stop the analysis" against the delta: only stronger assertions, nothing removed (diff against `origin/feature/entrega-2-CRN`)
  - Diff against `origin/feature/entrega-2-CRN`: the only removed lines are `expect(broken?.loc).toBeDefined()` and `toMatchObject({ path: 'app/Broken.php' })`, replaced by `toBe(1)` and `toMatchObject({ path: 'app/Broken.php', line: 1 })`. Nothing weakened.
- [x] 7.2 Identify any other test that passes duplicate paths or relies on `files.length === input.files.length`; confirm with `git diff --stat origin/feature/entrega-2-CRN -- tests` that only `structure.spec.ts` changed plus the new `parser-load.spec.ts`
  - No test passes one path twice or compares `files.length` with the input length (grep over `tests/`). `git diff --stat origin/feature/entrega-2-CRN -- tests`: only `structure.spec.ts` (50 insertions, 2 deletions), plus the new untracked `parser-load.spec.ts`.
- [x] 7.3 Confirm every `#### Scenario:` of `openspec/changes/analyzer-php-debt/specs/code-analysis/spec.md` (6) maps 1:1 to a test with exactly the same name (grep `it('<title>'` in `tests/`). The two copied unchanged ("The acme-shop analysis is a valid deterministic graph", "The analyzer reads only the content it receives") keep their existing tests unchanged and green
  - Script over the delta: the 6 `#### Scenario:` titles are each found as `it('<title>'` in exactly one test file; the two copied unchanged keep their existing tests.

## 8. Backend: Run Tests and Verify Data State (MANDATORY)

- [x] 8.1 Capture the pre-test baseline: `git status --porcelain fixtures/acme-shop` (empty), `git ls-files -s fixtures/acme-shop | sha1sum`. The change has no database state; record "no DB entity impacted"
  - `git status --porcelain fixtures/acme-shop` empty; checksum `167c762e…`; no DB entity impacted.
- [x] 8.2 Run the targeted tests: `npx vitest run tests/unit/analyzers/php`, twice, to check for flakiness
  - `tests/unit/analyzers/php` twice: 161/161 both runs (10 files).
- [x] 8.3 Run the required broader suite and gates: `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`, `npx stryker run` (core only: confirm score ≥ `MIN_MUTATION_SCORE=70`); confirm with `git diff origin/feature/entrega-2-CRN -- packages/core` that only `AnalyzerPort.ts` changed, and only comment lines
  - `npx vitest run` 308 passed, 99 skipped (24 files + 7 skipped); lint 0 errors (same pre-existing warning); typecheck, `docs:coverage` clean; `lint:architecture` 0 errors, same 4 warnings; Stryker 95.07 %; `git diff origin/feature/entrega-2-CRN -- packages/core`: only `AnalyzerPort.ts`, only comment lines.
- [x] 8.4 Verify the post-test state matches the baseline (same checksum, `git status --porcelain fixtures/acme-shop` empty). Restore and document if not
  - Same checksum, `git status --porcelain fixtures/acme-shop` empty; nothing to restore.
- [x] 8.5 Create the report `openspec/changes/analyzer-php-debt/reports/YYYY-MM-DD-8-test-and-state-verification.md` from the template in `docs/openspec-tasks-mandatory-steps.md` §6, including the baseline of 0.4 and the forced failures (a)–(l)
  - Report: `reports/2026-10-04-8-test-and-state-verification.md` (baseline of 0.4, forced failures (a)–(l), REDs; CI link pending push).
- [x] 8.6 Mark complete only after the tests pass and the report exists

## 9. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [x] 9.1 Note the current state (8.1 indicators). The interface is `createPhpAnalyzer().analyze()` (no HTTP route or CLI command exists for it)
  - Checksum `167c762e…` noted; interface is `createPhpAnalyzer().analyze()`.
- [x] 9.2 Exercise the success path: a scratch script in the scratchpad (not in the repo), run with `npx tsx`, that analyses `fixtures/acme-shop` (skipping `.git`) and prints the counts of files, symbols, edges and diagnostics; confirm they match a run on `origin/feature/entrega-2-CRN` behaviour (53 files, diagnostics `[]`)
  - acme-shop: 53 files, 121 symbols, 169 edges, diagnostics `[]`, unresolved `[]`, `validateGraph` `[]`.
- [x] 9.3 Mutating operations: none (the analyzer writes nothing). Confirm with the 8.1 checksum after the script ran
  - None; checksum unchanged after the script.
- [x] 9.4 Exercise the error cases from the same script: the duplicate-path input of the scenario plus the whole acme-shop input passed twice (expect 53 files and 53 `duplicate path` diagnostics); a syntax-error file; print each result
  - acme-shop passed twice → 53 files and 53 `duplicate path` diagnostics (none with `line`), files/symbols/edges identical to one run; scenario input → 3 files, `class A` + `class Lower`, 3 diagnostics; syntax error → `loc` 1, `line` 1; reversed input → result equal.
- [x] 9.5 Document every command and output in `openspec/changes/analyzer-php-debt/reports/YYYY-MM-DD-9-manual-interface-testing.md`. Delete the scratch script
  - Report: `reports/2026-10-04-9-manual-interface-testing.md`. The script `manual.mts` stays in the session scratchpad (outside the repo): the repository's PreToolUse hook blocks `rm`.
- [x] 9.6 Verify the state matches the pre-test state (8.1 indicators)
  - Checksum `167c762e…` and empty `git status --porcelain fixtures/acme-shop` after the run.

## 10. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 10.1 Confirm no user interface or user workflow is affected (no route, no CLI, no web change). Record "not applicable", with that reason, in the step 8 report
  - Recorded as not applicable in the step 8 report: no route, CLI or web change.
- [x] 10.2 After pushing (switch `gh` to the DisTinta account first, back to Cristina-JumpMath afterwards), confirm in the PR's CI run that `parser-load.spec.ts` ran and was not skipped, and that `lint:architecture` ran with the new rule. Link the run in the step 8 report
  - Pushed with DisTinta and switched back. PR #20; run CI 37193003777: `quality` success, 31/31 files and 462/462 tests, none skipped; `parser-load.spec.ts` ran (2 tests); dependency rule 0 errors with `analyzers-no-io`. Frontend 37193003765 success. Linked in the step 8 report.

## 11. Update Technical Documentation (MANDATORY)

- [x] 11.1 Add to the gotchas of `docs/project-context.md`: the PHP analyzer keeps the first input of a repeated path (exact comparison, `duplicate path` diagnostic, discarded before parsing); a failed grammar load is retried on the next call; `analyzers-no-io` forbids `fs`/network/`child_process`/`worker_threads`/`cluster` in `packages/analyzers/**` (global `fetch` and `createRequire` are outside what the rule can see)
  - New gotcha bullet (DIS-96) in `docs/project-context.md`: first input of a repeated path kept (exact comparison, `duplicate path` diagnostic, discarded before parsing, any kind of file, stated in the `AnalyzerPort` JSDoc), failed grammar load retried, `analyzers-no-io` modules and its `fetch`/`createRequire` gap, and the `vi.mock` reset pattern of `parser-load.spec.ts`.
- [x] 11.2 In the archived design of `analyzer-port-and-php-structure`, leave *Follow-ups* as they are (archive is history); the closure is recorded in DIS-96 and in this change's reports
  - Archived design of `analyzer-port-and-php-structure` left untouched; closure recorded in this change's reports and on DIS-96.
- [x] 11.3 No ADR (design D8); confirm nothing in the implementation contradicted that
  - No ADR: the code stays in the PHP analyzer and the existing rule file, and core changes JSDoc only (design D8–D9). Nothing contradicted that.
- [x] 11.4 Run `/update-docs` and confirm the docs gate passes (`npm run docs:coverage`). Add the relevant AI prompts to `prompts.md` per `docs/project-context.md` → prompts.md rules, with its Índice entry in the same edit
  - `/update-docs`: data model, API spec (TypeDoc into git-ignored `docs/api`), dependencies and ADRs unaffected; `docs/project-context.md` (gotcha) and `docs/backend-standards.md` §2 (`analyzers-no-io` next to `analyzers-are-siblings`) updated. `docs:coverage` clean. `prompts.md` §26 (3 prompts) + Índice entry 26.
- [x] 11.5 Linear (Spanish): tick the DIS-96 checklist items in a comment (never edit an `[original]` block); leave a comment on DIS-85 saying the analyzer now diagnoses duplicate paths (keeps the first) and that the use case should still not pass them
  - Comment on DIS-96 (Spanish) with the six checklist items ticked and their tests, left as a new comment (the description, `[original]` included, untouched); comment on DIS-85 (Spanish): the analyzer keeps the first of a repeated path with a `duplicate path` diagnostic, and the use case should still not pass duplicates.
- [x] 11.6 Prepare the PR description (`/pr-describe`) against `feature/entrega-2-CRN`, in Spanish, leaving the Why for the author. After verification, set DIS-96 to In Review in Linear with a comment in Spanish linking the PR and the change
  - `reports/pr-description.md` (Spanish, Why left for the author, 6-row traceability) used for PR #20 against `feature/entrega-2-CRN`. DIS-96 set to In Review with a Spanish comment linking the PR and the change.

## 12. Fixes after `/show-spec-working`, `/verify-against-spec` and `/adversarial-review` (2026-10-04, before the PR)

- [x] 12.1 Evidence first: `/show-spec-working` against the real analyzer, all six scenarios, the parser retry with a real load failure (grammar `.wasm` renamed and restored, SHA-256 checked) (`reports/2026-10-04-show-spec-working.md`, `ALL CHECKS PASS`, fixture checksum unchanged)
- [x] 12.2 Test-only fixes, no rule change (design D10). Extra cases in `structure.spec.ts`, describe "analysis contract boundary cases": "a discarded duplicate contributes no edge, although its content alone would", "paths that differ by ./, separator or whitespace are distinct inputs", "the order of the inputs does not affect the result". Forced failures (m) `docMentionEdges(input.files, …)`, (n) trimmed seen-set key, (o) `./` and `\` normalised key, (p) `files` not sorted → each fails its case (1, 1, 1, 3 of 19); restored, `git diff -- packages | sha1sum` unchanged
  - First run of the normalisation case failed on my own new test: the input `app/A.php ` (trailing space) does not end in `.php`, so the spec rightly skips parsing it; the input became ` app/A.php` (leading space). No code changed.
- [x] 12.3 Docs-only fixes (design D10): `.dependency-cruiser.cjs` back to LF (diff now only the rule); rule comment and `docs/project-context.md` gotcha no longer claim Ghost coverage of `fetch`/`createRequire` and name `vm`, `wasi`, `inspector`, `sqlite`; `docs/backend-standards.md` added to the proposal's Impact
- [x] 12.4 Author decisions of 2026-10-04 (design D10), applied in one pass:
  - (1) Option A: the "Analysis contract" ordering now reads "then `endLine` descending (so an enclosing symbol precedes the symbols it contains), then `name`" (spec, `AnalysisResult.symbols` JSDoc, design D5); the scenario "Symbols that start on one line are ordered by span, then name" gains the siblings `function c() {} function d() {\n}` on lines 5–6 (`d` 5–6 before `c` 5–5). Test updated first, green on first run (behaviour unchanged); forced failure (d) re-run on the extended scenario: `expected [ [ 'function', 'a', 1, 1 ], …(5) ] to deeply equal [ [ 'function', 'z', 1, 2 ], …(5) ]`.
  - (2) Concurrent calls stay an extra test (2.3); design D2 says why (design detail, not contract).
  - (3) `analyzers-no-io` adds `vm`, `wasi`, `inspector`, `sqlite` (rule, design D4, tasks 5.1/5.2); forced failure (q) `import 'node:vm'` → `error analyzers-no-io: packages/analyzers/php/src/symbols.ts → vm`; restored, `git diff -- packages | sha1sum` unchanged. Rule comment, Risks and the `docs/project-context.md` gotcha name only global `fetch` and `createRequire` as gaps.
  - (4) Risks line reworded with the author's text.
  - (5) Linear (Spanish): comment on DIS-96 (ordering wording changes, behaviour does not); hand-off comments on DIS-85 and DIS-30 (TypeScript analyzer structure). Unescaped path in the diagnostic recorded as known debt in D10.
