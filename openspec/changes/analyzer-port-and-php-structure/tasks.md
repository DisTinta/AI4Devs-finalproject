## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Set DIS-47 to In Progress in Linear right away, with a short comment in Spanish (change name `analyzer-port-and-php-structure` and branch)
- [x] 0.2 Create feature branch `feature/DIS-47-analyzer-port-and-php-structure` from the delivery branch `feature/entrega-2-CRN` (see `docs/project-context.md` → Branch and ticket conventions), carrying the untracked `openspec/changes/analyzer-port-and-php-structure/` planning files with it
- [x] 0.3 Verify branch creation and current branch status (`git status`, `git branch --show-current`)
- [x] 0.4 Baseline: run `npx vitest run` once, green, and record the totals for the step 8 report; record `git status --porcelain fixtures` (must be empty) and the count of tracked files under `fixtures/acme-shop` (`git ls-files fixtures/acme-shop | wc -l` = 53)

## 1. Build wiring and dependency (design D4)

- [x] 1.1 Confirm on the registry that `web-tree-sitter` and `tree-sitter-php` exist, are MIT and that the `tree-sitter-php` tarball contains `tree-sitter-php.wasm` (`npm view`, `npm pack --dry-run` in the scratchpad). Install both in the analyzer with `npm install -w packages/analyzers/php web-tree-sitter tree-sitter-php` (caret ranges); add `references: [{ "path": "../../core" }]` to `packages/analyzers/php/tsconfig.json` like `packages/adapters/git/tsconfig.json`. Run `npm ci` from a clean `node_modules` and confirm no native compilation ran (no `node-gyp rebuild` / MSVC output). Run `npm run typecheck` and `npm run lint:architecture` green
- [x] 1.2 Smoke parse (design D4 risk): a scratch script in the scratchpad, run with `npx tsx`, loads `tree-sitter-php.wasm` through `web-tree-sitter` and prints the root node type and `hasError` for `fixtures/acme-shop/app/Services/PriceCalculator.php`. If loading fails on ABI, apply the D4 mitigation (pin `web-tree-sitter`, then native fallback) and record the concrete failure for the ADR. Delete the script

## 2. Core: `AnalyzerPort` contract (design D1)

- [x] 2.1 Replace the stub in `packages/core/src/ports/AnalyzerPort.ts` with `SourceFile`, `AnalyzerInput`, `AnalyzerDiagnostic`, `AnalysisResult` and `AnalyzerPort.analyze` per D1, following `GitPort.ts`: TSDoc on every type and field, stating path format (`/`), ordering, `edges` empty in this capability, no I/O over the analysed repository, and that parse failures are `diagnostics`, never a rejection. Export all types from `ports/index.ts`. Run `npm run typecheck`

## 3. Core: file kind and line count (TDD, design D2)

- [x] 3.1 RED: create `tests/unit/knowledge/file-kind.spec.ts` (template: `tests/unit/knowledge/validate-graph.spec.ts`) with "Paths are classified by the canonical rule", "Line count of a file" and "A described file has no contentHash or redacted", plus boundary cases (`a/__tests__/x.ts`, `src/x.spec.ts` → `test`; `src/docs.ts` → `source`; `.github/ci.yml`, `vite.config.ts` → `config`; `docs/x.json` → `doc`, first match wins). Run and see it fail
- [x] 3.2 GREEN: create `packages/core/src/knowledge/file-kind.ts` with `fileKindOf`, `countLines` and `describeFile`; export from `knowledge/index.ts`. Run 3.1 green
- [x] 3.3 REFACTOR with the suite green (naming, TSDoc on every export). Run `npx stryker run` and record the mutation score of `file-kind.ts` (threshold `MIN_MUTATION_SCORE=70`); add tests for surviving mutants that reflect spec rules
- [x] 3.4 Adversarial review boundary cases (design D2: directory-segment checks exclude the file name): `bin/test`, `test` and `docs` → `source`. RED seen, then GREEN (`f93171c`)

## 4. Analyzer: parser and file listing (TDD, design D5, D6, D7)

- [x] 4.1 Create `tests/unit/analyzers/php/structure.spec.ts` scaffolding: a helper that walks `fixtures/acme-shop` with `node:fs` (skipping `.git`, paths relative with `/`, read-only) and returns `SourceFile[]`; one analyzer from `createPhpAnalyzer()` shared in `beforeAll`; inline `SourceFile` factories for E4/E5. Read the grammar's `node-types.json` and confirm the node and field names listed in design D5 (record any difference in design D5)
- [x] 4.2 RED → GREEN: test "The acme-shop files are classified". Implement `parser.ts` (`loadPhpParser`, memoised per analyzer) and `php-analyzer.ts` (`describeFile` per input, `edges: []`, sort per D6); `index.ts` re-exports `createPhpAnalyzer`
- [x] 4.3 RED → GREEN: test "The analyzer reads only the content it receives" (a `SourceFile` whose path does not exist on disk)

## 5. Analyzer: symbols (TDD, design D3, D5)

- [x] 5.1 RED → GREEN: test "PriceCalculator symbols have exact spans" (exact list of kind/name/start/end, `compute` signature). Implement `symbols.ts` for `class_declaration` and `method_declaration` with spans and signatures; parse only `.php` paths; `tree.delete()` in a `finally`
- [x] 5.2 RED → GREEN: test "Every named class of acme-shop is listed" (35 named classes, each in its file; no symbol for non-`.php` paths including `artisan`). The expected list is built in the test by scanning the fixture for `class Name` declarations, excluding anonymous `new class` expressions and traits — not hardcoded as 35 paths
- [x] 5.3 RED → GREEN: test "Interfaces and top-level functions are listed, enums are not" (inline contents). Implement `interface_declaration`, `function_definition` outside a type, and skipping `enum_declaration` with its subtree
- [x] 5.4 RED → GREEN: test "A trait is encoded as a class". Implement `trait_declaration` → `class` with the `trait …` signature
- [x] 5.5 RED → GREEN: test "Anonymous classes yield only their methods" (5 migrations, 0 `class`, 10 bare `up`/`down`, closures produce nothing). Implement `anonymous_class` and closure / arrow-function handling
- [x] 5.6 Test "Symbol spans include modifiers and attributes" (inline `app/Base.php`, `app/Model.php`). Added after the implementation: RED was not observed, the implementation already satisfied it (process debt, `7154923`)
- [x] 5.7 Adversarial review nesting cases: a method of an anonymous class inside a named class keeps its bare name; a function declared inside a method body produces no symbol. RED seen, then GREEN (`8d04415`)

## 6. Analyzer: diagnostics and contract validity (TDD, design D1, D6)

- [x] 6.1 RED → GREEN: test "A syntax error does not stop the analysis" (inline `app/Broken.php` + `app/Ok.php`). Implement `hasError` → one diagnostic (`line` of the first error or missing node), no symbols for that file
- [x] 6.2 RED → GREEN: test "The acme-shop analysis is a valid deterministic graph" (two runs `toEqual`, ordering, `edges` `[]`, `validateGraph()` returns `[]` on `{ files, symbols, edges, commits: [], fileCommits: [] }`)
- [x] 6.3 Prove the key tests can fail, restoring from a scratch copy and confirming with `cmp` each time: include the doc comment in the span → "PriceCalculator symbols have exact spans" fails; keep symbols of a file with `hasError` → "A syntax error does not stop the analysis" fails; drop the final sort and reverse the input → "The acme-shop analysis is a valid deterministic graph" fails. Record the three results for the step 8 report
- [x] 6.4 REFACTOR with the suite green: `web-tree-sitter` imported only by `parser.ts`, no other analyzer imported, TSDoc on every export
- [x] 6.5 Update the TSDoc of `AnalyzerDiagnostic`, `AnalysisResult.diagnostics` and `AnalyzerPort.analyze` per design D9: diagnostics cover parse failures and dropped duplicate symbols, a file may have several. No type changes. Run `npm run typecheck`
- [x] 6.6 RED → GREEN: test "Duplicate symbols are dropped with a diagnostic" (inline `app/Dup.php`). Implement keep-first per file in `php-analyzer.ts` over `extractSymbols`' output, before the D6 sort; one diagnostic per dropped symbol; no invented names
- [x] 6.7 Re-run "The acme-shop analysis is a valid deterministic graph" and "Anonymous classes yield only their methods": `validateGraph` returns `[]` and the migrations keep their 10 `up`/`down` with no diagnostic

## 7. Backend: Review and Update Existing Tests (MANDATORY)

- [x] 7.1 Identify tests affected by the change: anything relying on `AnalyzerPort` being empty or on `@codemind/analyzer-php` exporting nothing. Confirm with `git diff --stat feature/entrega-2-CRN -- tests` that only the two new spec files changed
- [ ] 7.2 Update affected tests without weakening their assertions. Confirm the 14 `#### Scenario:` of `specs/code-analysis/spec.md` map 1:1 to tests with exactly the same name (grep each title in `tests/`; no scenario without a test, no scenario with two), and that every SHALL requirement has at least one of them. Mapping: 3.1 (3), 4.2 (1), 4.3 (1), 5.1–5.6 (6), 6.1 (1), 6.2 (1), 6.6 (1)

## 8. Backend: Run Tests and Verify Data State (MANDATORY)

- [x] 8.1 Capture the pre-test baseline: `git status --porcelain fixtures` (empty), checksum of the tracked acme-shop files (`git ls-files -s fixtures/acme-shop | sha1sum`). The change has no database state; record "no DB entity impacted"
- [x] 8.2 Run the targeted tests: `npx vitest run tests/unit/knowledge/file-kind.spec.ts tests/unit/analyzers/php`, twice, to check for flakiness
- [x] 8.3 Run the required broader suite and gates: `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`, `npx stryker run`. Reproduce the no-database run with `npx vitest run --exclude 'tests/integration/**'` and no `DATABASE_URL`: the new unit tests run, no import error
- [x] 8.4 Verify the post-test state matches the baseline (same checksum, `git status --porcelain fixtures` empty: no test modified a fixture). Restore and document if not
- [x] 8.5 Create the report `openspec/changes/analyzer-port-and-php-structure/reports/YYYY-MM-DD-8-test-and-state-verification.md` from the template in `docs/openspec-tasks-mandatory-steps.md` §6. Include the dependency checks of 1.1–1.2, the forced failures of 6.3 and the mutation score of 3.3
- [x] 8.6 Mark complete only after the tests pass and the report exists

## 9. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [x] 9.1 Note the current state (8.1 indicators). The interface is the `AnalyzerPort` implementation `createPhpAnalyzer()` (no HTTP route, no CLI command exists for it)
- [x] 9.2 Exercise the success path: a scratch script in the scratchpad (not in the repo), run with `npx tsx`, that reads `fixtures/acme-shop` (skipping `.git`), calls `analyze`, and prints file counts per kind, symbol counts per kind, the symbols of `PriceCalculator.php` and `CreatesApplication.php`, and `diagnostics`. Verify against the spec scenarios and `fixtures/README.md`
- [x] 9.3 Mutating operations: none (the analyzer writes nothing). Confirm with the 8.1 checksum after the script ran
- [x] 9.4 Exercise the error cases from the same script: a broken PHP file, an empty file, a non-PHP file with PHP-looking content (`artisan`), a file path that does not exist on disk. Print each result and diagnostic
- [x] 9.5 Document every command and output in `openspec/changes/analyzer-port-and-php-structure/reports/YYYY-MM-DD-9-manual-interface-testing.md`. Delete the scratch script
- [x] 9.6 Verify the state matches the pre-test state (8.1 indicators)

## 10. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 10.1 Confirm no user interface or user workflow is affected (no route, no CLI, no web change). Record "not applicable", with that reason, in the step 8 report
- [ ] 10.2 After pushing (switch `gh` to the DisTinta account first, back to Cristina-JumpMath afterwards), confirm in the PR's CI run that `npm ci` installed without native build steps and that `structure.spec.ts` and `file-kind.spec.ts` ran and were not skipped. Link the run in the step 8 report

## 11. Update Technical Documentation (MANDATORY)

- [x] 11.1 Add the PH-22 exception to `docs/project-context.md` §Testing next to the line "Test data comes from `fixtures/`…": fixtures are the analyzer's input, no test modifies them, expectations are built with factories. Also record the analyzer (`createPhpAnalyzer`, no I/O over the repository) and the gotcha that a walk over a fixture must skip its rebuilt `.git`
- [x] 11.2 Add to `docs/backend-standards.md` §1, like the `simple-git` entry: "Tree-sitter via WASM (`web-tree-sitter` + `tree-sitter-php`'s WASM grammar) only inside `packages/analyzers/php`, behind `AnalyzerPort`"
- [x] 11.3 ADR via `/adr-new` (design D8): `docs/adr/<date>-php-parser-web-tree-sitter.md`, transcribing the author's "ADR D4 — razonamiento de la autora" from DIS-47 (wording may be adjusted, content not), plus the trait → `class` encoding and any concrete finding of 1.1–1.2
- [x] 11.4 Run `/update-docs` and confirm the docs gate passes (`npm run docs:coverage`). Add the relevant AI prompts to `prompts.md` per `docs/project-context.md` → prompts.md rules, with its Índice entry in the same edit
- [x] 11.5 Leave a Linear comment in Spanish on DIS-49 (edges) and DIS-54 (TypeScript spike): the `AnalyzerPort` shape, `describeFile` in core, the trait and anonymous-class encodings, and that `edges` is the slot DIS-49 fills
- [x] 11.6 Prepare the PR description (`/pr-describe`) against `feature/entrega-2-CRN`, keeping the author's Why. After verification, set DIS-47 to In Review in Linear (not Done: it closes only after DIS-54 confirms the contract), with a comment in Spanish linking the PR and the change
