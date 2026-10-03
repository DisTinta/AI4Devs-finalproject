## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Set DIS-49 to In Progress in Linear right away, with a short comment in Spanish (change name `php-declarative-edges` and branch)
- [x] 0.2 Create feature branch `feature/DIS-49-php-declarative-edges` from the delivery branch `origin/feature/entrega-2-CRN` (DIS-47 is already merged there, PR #13; see `docs/project-context.md` → Branch and ticket conventions), carrying the untracked `openspec/changes/php-declarative-edges/` planning files with it
- [x] 0.3 Verify branch creation and current branch status (`git status`, `git branch --show-current`)
- [x] 0.4 Baseline: run `npx vitest run` once, green, and record the totals for the step 9 report; record `git status --porcelain fixtures` (must be empty) and `git ls-files -s fixtures/acme-shop | sha1sum`
  - Baseline (2026-10-03): 13 test files passed, 7 skipped (20 total); 131 tests passed, 99 skipped (282 total); 31.65s. `git status --porcelain fixtures` empty. `git ls-files -s fixtures/acme-shop | sha1sum` = `167c762e26cdc3ad7b71484c19aa6135dc6c2a8d`.

## 1. Core: edge order and uniqueness (TDD, design D6)

- [x] 1.1 RED: create `tests/unit/knowledge/edge-order.spec.ts` (template: `tests/unit/knowledge/co-change.spec.ts`) with cases for `compareEdges` (kind first; file endpoint before symbol endpoints of the same path; then name, then start line; UTF-16 order, `Zeta` before `alpha`) and `sortUniqueEdges` (later duplicate of kind+source+target dropped, input not mutated). Run and see it fail
- [x] 1.2 GREEN: create `packages/core/src/knowledge/edge-order.ts` with `compareEdges` and `sortUniqueEdges`; export from `knowledge/index.ts`. Run 1.1 green
- [x] 1.3 REFACTOR with the suite green (TSDoc on every export, no `localeCompare`). Run `npm run typecheck`

## 2. Core: documentation mention edges (TDD, design D5)

- [x] 2.1 RED: create `tests/unit/knowledge/doc-mentions.spec.ts` with the test "Prose and ambiguous names produce no describes edge" (inline doc and symbols, exactly the two edges to `Order` and `Total::sum`, `heuristic`, extractor `doc-mention`). Run and see it fail
- [x] 2.2 GREEN: create `packages/core/src/knowledge/doc-mentions.ts` with `DOC_MENTION_EXTRACTOR` and `docMentionEdges(files, symbols)` per design D5 (only `doc` files by `fileKindOf`; closed fenced blocks and inline spans; one constant identifier pattern plus `A::b` pairs; name index without `route` symbols; ambiguous names skipped; one edge per doc and symbol). Export from `knowledge/index.ts`. Run 2.1 green
- [x] 2.3 Add mutation-oriented cases to the same spec (not spec scenarios): a non-`doc` file is ignored; an unclosed fence produces nothing after it; a backtick pair across two lines is not a span; a `route` symbol name never matches; a name repeated in one doc gives one edge; `Class::method` text also mentions `Class`. RED → GREEN for any that fails
- [x] 2.4 REFACTOR with the suite green. Run `npx stryker run` and record the mutation score of `doc-mentions.ts` and `edge-order.ts` (threshold `MIN_MUTATION_SCORE=70`); add tests for surviving mutants that reflect spec rules
  - Mutation score (2026-10-03, `npx stryker run --mutate "packages/core/src/knowledge/doc-mentions.ts,packages/core/src/knowledge/edge-order.ts"`): `doc-mentions.ts` 96.77% (89 killed, 1 timeout, 3 survived), `edge-order.ts` 94.64% (53 killed, 3 survived); both well above `MIN_MUTATION_SCORE=70`. The 6 remaining survivors are equivalent mutants (e.g. `aIsFile && bIsFile` vs `||` after the preceding guard already forces both equal; re-`set`ting a `Map` entry with an identical value; a dedup-key tag string that cannot collide given the differing array shapes) or Stryker's seeded-placeholder-array mutants that no realistic symbol name can trigger; none reflect an untested spec rule.

## 3. Analyzer: test scaffolding and grammar check

- [x] 3.1 Move `readFixtureFiles` from `tests/unit/analyzers/php/structure.spec.ts` to `tests/support/read-fixture-files.ts` (same behaviour: read-only, `.git` skipped, `/` paths) and import it from `structure.spec.ts`. Run `npx vitest run tests/unit/analyzers/php` green with no assertion changed
- [x] 3.2 Create `tests/unit/analyzers/php/edges.spec.ts` scaffolding: one `createPhpAnalyzer()` shared in `beforeAll` over acme-shop, inline `SourceFile` factories. Confirm in the grammar's `node-types.json` (in `node_modules/tree-sitter-php`) the node and field names assumed in design D2–D4 (`namespace_definition`, `namespace_use_declaration`, `namespace_use_group`, `base_clause`, `class_interface_clause`, `scoped_call_expression`, `member_call_expression`, `class_constant_access_expression`, `array_creation_expression`, `named_type`, `object_creation_expression`, `use_declaration`); record any difference in design.md
  - Grammar confirmed by parsing inline samples (not committed); all node/field names match. Two
    implementation nuances recorded in design.md (`use function`/`use const`'s anonymous `type`
    field; `encapsed_string` used for both interpolated and non-interpolated double-quoted strings).

## 4. Analyzer: name resolution and code edges (TDD, design D1, D2, D7)

- [x] 4.1 RED → GREEN: test "Inheritance and imports of acme-shop" (exactly 7 `extends`, 0 `implements`, exactly 79 `imports`, the `routes/api.php` and `PriceCalculatorTest.php` imports, `exact` and `php-treesitter-laravel` on all). Implement `names.ts` (facts per file, `resolveClassName`, `resolveTarget`), `edges.ts` (`buildPhpEdges` for `imports`, `extends`, `implements`), `PHP_EXTRACTOR`, and the composition in `php-analyzer.ts` ending in `sortUniqueEdges`
- [x] 4.2 RED → GREEN: test "Names resolve by fully-qualified name, never by short name" (`PriceCalculatorTest` has no `extends`; no vendor target; trait use produces no `imports`)
- [x] 4.3 RED → GREEN: test "Aliases, group imports and ambiguous names" (inline: `implements` via `as` and group import; no `extends` to an FQN held by two symbols). Also cover, as extra cases in the same file, a file with two `namespace` declarations (no name-based edge) and `use function` (ignored)
- [x] 4.4 RED → GREEN: test "A file with a syntax error originates no edge" (inline `app/Broken.php` + `app/Ok.php`)

## 5. Analyzer: array-action routes (TDD, design D3)

- [x] 5.1 RED → GREEN: test "The API routes of acme-shop point at their controller actions" (two `route` symbols with spans 12–12 and 13–13, `calls` `exact` to `OrderController::index` and `OrderController::show`; nothing from `routes/web.php`). Implement `routes.ts` (top-level statements only, chained calls unwrapped, six verbs, non-interpolated strings, `X::class` array) and the `calls` resolution in `edges.ts`
- [x] 5.2 RED → GREEN: test "A route to an action outside the input has no edge" (inline `POST /ghost`, exact signature, `edges` empty)
- [x] 5.3 Extra cases in the same spec: a route inside `Route::prefix('/x')->group(function () { … })` produces no symbol; `Route` imported from another namespace produces no symbol; an interpolated URI (`"/o/$id"`) produces no symbol
  - Also updated `structure.spec.ts`'s "The acme-shop files are classified" (task 7.2's MODIFIED
    scenario) now, to keep the suite green: `routes/api.php` now has its two `route` symbols.

## 6. Analyzer: `tested_by` and `describes` wiring (TDD, design D4, D5, D7)

- [x] 6.1 RED → GREEN: test "The unit tests of acme-shop cover their classes" (exactly 4 `tested_by`, `exact`; none to `CheckoutTest` or `OrderPricingTest`). Implement reference collection in the facts and `tested_by` in `edges.ts`
- [x] 6.2 RED → GREEN: test "A test class that does not reference its subject has no edge" (inline `FooTest`)
- [x] 6.3 RED → GREEN: test "The acme-shop README describes the symbols it names in code" (exactly the 15 targets from `README.md`, all `heuristic`; nothing from `docs/pricing.md`). Wire `docMentionEdges(input.files, symbols)` into `php-analyzer.ts`
  - `docMentionEdges` was already wired in at task 4.1 (needed for `sortUniqueEdges` composition then); this task's test is the first one that actually exercises it through the PHP analyzer.
  - Found and fixed a latent bug while writing 4.3: `namesOf`/`rawNameOf` stripped the leading `\` from `extends`/`implements` clause text before `resolveClassName` could see it, so a fully-qualified name (`extends \App\One\Dup`) could never take the "already fully qualified" branch. Fixed in `names.ts` (`namesOf` now keeps the raw node text) and `routes.ts` (route action class name likewise); added a dedicated passing case ("a leading-backslash fully-qualified name resolves when it is unambiguous") since the existing ambiguous-name scenario happened to pass either way.

## 7. Contract: MODIFIED scenarios and JSDoc (design D7, D8)

- [x] 7.1 RED → GREEN: update the test "The acme-shop analysis is a valid deterministic graph" in `structure.spec.ts` to the MODIFIED scenario (`edges` non-empty, ordered by `compareEdges`, no duplicate kind+source+target, `validateGraph` returns `[]`)
- [x] 7.2 RED → GREEN: update the test "The acme-shop files are classified" to the MODIFIED scenario (`routes/web.php` and `config/app.php` without symbols; `routes/api.php` only its two `route` symbols)
- [x] 7.3 Update the TSDoc of `AnalysisResult.edges` in `packages/core/src/ports/AnalyzerPort.ts` (no longer always empty; ordered by `compareEdges`; endpoints always in the result). No type changes. Run `npm run typecheck`
- [x] 7.4 Prove the key tests can fail, restoring from a scratch copy and confirming with `cmp` each time: resolve `extends` by short name → "Names resolve by fully-qualified name, never by short name" fails; count prose tokens in `doc-mentions.ts` → "The acme-shop README describes the symbols it names in code" fails; drop `sortUniqueEdges` and reverse the input → "The acme-shop analysis is a valid deterministic graph" fails. Record the three results for the step 9 report
  - 7.1/7.2 were already applied earlier (section 5) to keep the suite green as each edge kind landed; re-verified now against the exact MODIFIED scenario wording.
  - Forced failures (2026-10-03), each file backed up to the scratchpad, mutated, run, confirmed as
    the one test failing for the named reason, then restored and diffed byte-identical with `cmp`:
    1. `names.ts` `resolveClassName` → `lastSegment(raw)` + `edges.ts` `buildFqnTable` keyed by short
       name: "Names resolve by fully-qualified name, never by short name" failed — `PriceCalculatorTest`
       wrongly got an `extends` edge to `tests/TestCase.php`'s `TestCase`. Restored, `cmp` identical.
    2. `doc-mentions.ts`: `codeText = file.content` (skip `codeRegionsOf`) → "The acme-shop README
       describes the symbols it names in code" failed — `docs/pricing.md` wrongly got a `describes`
       edge from its prose. Restored, `cmp` identical.
    3. `php-analyzer.ts`: edges built without `sortUniqueEdges`, `.reverse()`d instead → "The acme-shop
       analysis is a valid deterministic graph" failed — `edges` no longer `kind`/source/target-ordered
       and `tested_by` edges before `imports` edges. Restored, `cmp` identical.
- [x] 7.5 REFACTOR with the suite green: `web-tree-sitter` still imported only by `parser.ts`, no other analyzer imported, TSDoc on every export, `npm run lint:architecture` green
  - Verified: `web-tree-sitter` imported only by `parser.ts`; `npm run lint:architecture` 0 errors;
    `npm run docs:coverage` (TypeDoc `--validation.notDocumented`) clean.

## 8. Backend: Review and Update Existing Tests (MANDATORY)

- [x] 8.1 Identify tests affected by the change: anything asserting `edges: []` or no symbols in `routes/api.php` (`structure.spec.ts`). Confirm with `git diff --stat origin/feature/entrega-2-CRN -- tests` that only the expected files changed (two MODIFIED tests, the moved helper, three new spec files)
  - `git diff --stat` (tracked) shows only `structure.spec.ts` (13 insertions, 25 deletions); `git status
    --porcelain` confirms the untracked new files are exactly the expected 4: `tests/support/read-fixture-files.ts` (moved helper) and the 3 new spec files (`edges.spec.ts`, `doc-mentions.spec.ts`, `edge-order.spec.ts`). No other test file touched.
- [x] 8.2 Update affected tests without weakening their assertions. Confirm that every `#### Scenario:` of `openspec/changes/php-declarative-edges/specs/code-analysis/spec.md` (14 kept from the main spec, 2 of them modified, plus 10 new) maps 1:1 to a test with exactly the same name (grep each title in `tests/`; no scenario without a test, no scenario with two), and that every SHALL requirement has at least one of them
  - Verified: all 23 `#### Scenario:` titles each match exactly one `it(...)` across `tests/unit/analyzers` and `tests/unit/knowledge`. All 8 `### Requirement:` sections (Analysis contract, File classification, Symbol extraction, PHP name resolution, Code relation edges, Array-action routes, Test coverage edges, Documentation mention edges) have at least one scenario, each covered.

## 9. Backend: Run Tests and Verify Data State (MANDATORY)

- [x] 9.1 Capture the pre-test baseline: `git status --porcelain fixtures` (empty), `git ls-files -s fixtures/acme-shop | sha1sum`. The change has no database state; record "no DB entity impacted"
- [x] 9.2 Run the targeted tests: `npx vitest run tests/unit/knowledge/edge-order.spec.ts tests/unit/knowledge/doc-mentions.spec.ts tests/unit/analyzers/php`, twice, to check for flakiness
- [x] 9.3 Run the required broader suite and gates: `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`, `npx stryker run`. Reproduce the no-database run with `npx vitest run --exclude 'tests/integration/**'` and no `DATABASE_URL`
- [x] 9.4 Verify the post-test state matches the baseline (same checksum, `git status --porcelain fixtures` empty: no test modified a fixture). Restore and document if not
- [x] 9.5 Create the report `openspec/changes/php-declarative-edges/reports/YYYY-MM-DD-9-test-and-state-verification.md` from the template in `docs/openspec-tasks-mandatory-steps.md` §6. Include the forced failures of 7.4 and the mutation scores of 2.4
- [x] 9.6 Mark complete only after the tests pass and the report exists

## 10. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [x] 10.1 Note the current state (9.1 indicators). The interface is the `AnalyzerPort` implementation `createPhpAnalyzer()` (no HTTP route or CLI command exists for it)
- [x] 10.2 Exercise the success path: a scratch script in the scratchpad (not in the repo), run with `npx tsx`, that reads `fixtures/acme-shop` (skipping `.git`), calls `analyze`, and prints edge counts per kind and resolution, the `route` symbols, the edges of `routes/api.php`, the `tested_by` edges and the `describes` edges. Verify against the spec scenarios and site 11 of `fixtures/README.md`
- [x] 10.3 Mutating operations: none (the analyzer writes nothing). Confirm with the 9.1 checksum after the script ran
- [x] 10.4 Exercise the error cases from the same script: a broken PHP file importing a project class, a route to a missing controller, a doc naming an ambiguous short name, a file with two namespaces. Print each result
- [x] 10.5 Document every command and output in `openspec/changes/php-declarative-edges/reports/YYYY-MM-DD-10-manual-interface-testing.md`. Delete the scratch script
- [x] 10.6 Verify the state matches the pre-test state (9.1 indicators)

## 11. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 11.1 Confirm no user interface or user workflow is affected (no route, no CLI, no web change). Record "not applicable", with that reason, in the step 9 report
- [x] 11.2 After pushing (switch `gh` to the DisTinta account first, back to Cristina-JumpMath afterwards), confirm in the PR's CI run that `edges.spec.ts`, `doc-mentions.spec.ts` and `edge-order.spec.ts` ran and were not skipped. Link the run in the step 9 report
  - PR #14, `quality` and `frontend` both passed; all 3 new spec files ran (45 tests) and were picked up by the mutation step. See step 9 report "CI evidence (task 11.2)".

## 12. Update Technical Documentation (MANDATORY)

- [x] 12.1 Add a gotcha to `docs/project-context.md`: the PHP analyzer now emits `imports`/`extends`/`implements`/route `calls`/`tested_by` (`exact`, `php-treesitter-laravel`) and `describes` (`heuristic`, `doc-mention`, code spans only); names resolve by fully-qualified name, case-sensitive, no vendor targets; `docs/pricing.md` has no `describes` edge (DIS-94 re-anchors); `compareEdges`/`sortUniqueEdges` and `docMentionEdges` live in core for DIS-30
- [x] 12.2 No ADR (design D9); confirm nothing in the implementation contradicted that
- [x] 12.3 Run `/update-docs` and confirm the docs gate passes (`npm run docs:coverage`). Add the relevant AI prompts to `prompts.md` per `docs/project-context.md` → prompts.md rules, with its Índice entry in the same edit
- [x] 12.4 Leave a Linear comment in Spanish on DIS-30 (TypeScript analyzer): `docMentionEdges`, `DOC_MENTION_EXTRACTOR` and `sortUniqueEdges` in core, to reuse without touching core
- [x] 12.5 Prepare the PR description (`/pr-describe`) against `feature/entrega-2-CRN`, keeping the author's Why. After verification, set DIS-49 to In Review in Linear with a comment in Spanish linking the PR and the change
  - PR #14 opened (Why left blank, marked, for the human). DIS-49 → In Review, comment posted linking the PR and summarizing verification.
