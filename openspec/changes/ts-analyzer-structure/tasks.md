## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [ ] 0.1 Feature branch `feature/dis-30-ts-analyzer-structure` (`BRANCH_PREFIX=feature/`), created from `final-project-CRN` before `/opsx:propose`; confirm `git merge-base --is-ancestor origin/final-project-CRN HEAD` and that `openspec/changes/ts-analyzer-structure/` is on it. `git fetch`; if `origin/final-project-CRN` moved, merge it before any code (never force-push a published branch). The branch name is lowercase `dis-30` because the autonomous workflow created it and it is already pushed (design Follow-ups A7); every commit scope is still `DIS-30`
- [ ] 0.2 Confirm DIS-30 is In Progress in Linear, with a short comment in Spanish naming the change `ts-analyzer-structure` and the branch
- [ ] 0.3 Verify the current branch and `git status`; nothing under `.claude/` or `.cursor/` is ever staged (explicit paths only)
- [ ] 0.4 Baseline: `npx vitest run` once (integration database as `docs/TESTING.md` says) and record the totals; record `git diff --stat final-project-CRN -- packages/core` (empty) and the output of `npm run lint:architecture`; then `node scripts/dev-processes.mjs stop`

## 1. Package setup (design D1, D6)

- [ ] 1.1 `node scripts/dev-processes.mjs stop`, then add `"typescript": "^5.5.0"` to `dependencies` of `packages/analyzers/typescript/package.json` (edit tool) and run `npm install` at the root; then `npm audit --audit-level=high` and compare with the baseline of `final-project-CRN`: a new high or critical finding stops the ticket
- [ ] 1.2 `packages/analyzers/typescript/tsconfig.json`: add `"references": [{ "path": "../../core" }]` (as `packages/analyzers/php/tsconfig.json`); `npm run typecheck` green with the stub still in place

## 2. Input, compiler options and compiler load (TDD; spec "TypeScript analysis input", design D2, D3, D6, D7, D8)

- [ ] 2.1 RED: create `tests/unit/analyzers/typescript/structure.spec.ts` (input built as design D8: `readFixtureFiles(TASK_API, ['.git', 'node_modules'])` without `package-lock.json`; `beforeAll` analyses task-api once) with the scenarios "The task-api files are classified", "The task-api analysis is a valid deterministic graph", "A TypeScript file is analysed from its content only", "Duplicate TypeScript input paths keep the first", "Files that are not TypeScript are not parsed", "A non-canonical TypeScript path is not parsed", "Names outside the input resolve to nothing" (symbols and diagnostics part), and the symbols, `files` and diagnostics part of the four `tsconfig.json` scenarios "Compiler options come from the input tsconfig" (`diagnostics` empty), "An unreadable tsconfig falls back to the default options" (`tsconfig.json` of kind `config`, one diagnostic with `line` 1), "A tsconfig whose root is not an object falls back to the default options" (one diagnostic with `line` 1) and "The tsconfig never selects files or loads declarations" (`class FooCheck`, `diagnostics` empty), so that 2.2 has a RED test for every `tsconfig.json` rule it implements (design Follow-ups A14); see them fail (module has no export). One `it` per scenario, named exactly after it; a scenario whose edge part comes later (4.1) gets its edge assertions added to this same `it`
- [ ] 2.2 GREEN: `packages/analyzers/typescript/src/shared.ts` (copied `uniqueInputs`, `keepFirst`, `bySymbolOrder`, `byPath`, design D7), `program.ts` (`loadTypeScript`, canonical-path check, options from the input `tsconfig.json` read only when there is a TypeScript file, with the error / non-object-root / non-object-`compilerOptions` rules of design D2, in-memory host, `ts.createProgram`, syntactic diagnostics), `ts-analyzer.ts` (`createTypeScriptAnalyzer`, composition of design D6 with a class-only symbol walk enough for these scenarios) and `index.ts` (exports `createTypeScriptAnalyzer`, `TS_COMPILER_EXTRACTOR`); TSDoc citing DIS-30 and the design decisions; `npx vitest run tests/unit/analyzers/typescript` green
- [ ] 2.3 RED then GREEN: create `tests/unit/analyzers/typescript/compiler-load.spec.ts` with "A failed compiler load does not poison later calls" (`vi.mock` of `program.ts` delegating to the real `loadTypeScript`, as `tests/unit/analyzers/php/parser-load.spec.ts`), including the input with no TypeScript file (`README.md`, an unparsable `tsconfig.json` and the non-canonical `./src/a.ts`) that never calls the loader and has exactly the `non-canonical path "./src/a.ts"; not parsed` diagnostic (design D6, Follow-ups A9); make it pass in `ts-analyzer.ts`, which calls the `loadTypeScript` imported from `program.ts` so the mock applies
- [ ] 2.4 REFACTOR with the suite green; `npm run typecheck`, `npm run lint`, `npm run lint:architecture`

## 3. Symbols (TDD; spec "TypeScript symbol extraction" and "TypeScript syntax errors", design D4)

- [ ] 3.1 RED: add to `structure.spec.ts` the scenarios "The task-api errors and repository have exact spans", "Every class, interface and function of task-api is listed", "task-api files without such declarations have no symbols", "Private members and comma-separated signatures are named exactly", "Anonymous and expression classes yield only their methods", "Only the implementation of an overload is a symbol", "TypeScript spans include decorators and modifiers, not JSDoc", "Variables, types, accessors and ambient declarations are not symbols", "Duplicate TypeScript symbols are dropped with a diagnostic", "A TypeScript syntax error does not stop the analysis" (symbols and diagnostics part) and "Type errors are not diagnostics" (symbols and diagnostics part); see them fail
- [ ] 3.2 GREEN: `packages/analyzers/typescript/src/symbols.ts` (walk, names, spans, signatures, skipped subtrees of design D4) wired into `ts-analyzer.ts`; `npx vitest run tests/unit/analyzers/typescript` green
- [ ] 3.3 REFACTOR with the suite green; `npm run typecheck`, `npm run lint`

## 4. Edges (TDD; spec "TypeScript code relation edges" and "TypeScript test coverage edges", design D5)

- [ ] 4.1 RED: create `tests/unit/analyzers/typescript/edges.spec.ts` with "The structural edges of task-api", "Inheritance follows aliases and namespace imports", "A merged declaration is not an inheritance target", "Every import form is one file edge", "Self-imports and CommonJS forms produce no edge", "Type arguments are followed, other heritage expressions are not", "The unit tests of task-api cover their files", "A test file that does not import its subject has no edge", "The base name and the import pick the subject", "A subject with a syntax error has no tested_by edge"; add to `structure.spec.ts` the edge parts of "Compiler options come from the input tsconfig", "An unreadable tsconfig falls back to the default options", "A tsconfig whose root is not an object falls back to the default options", "The tsconfig never selects files or loads declarations" (`imports` and `tested_by`, no `extends`), "Names outside the input resolve to nothing" (`edges` empty), "A TypeScript syntax error does not stop the analysis" (no edge from `src/broken.ts`, `imports` from `src/user.ts`) and "Type errors are not diagnostics" (`imports` from `src/t.ts` to `src/dep.ts`); see them fail. The edge parts of a scenario already created in 2.1 or 3.1 are new assertions in its existing `it`: never a second `it` with the same name, never a removed assertion
- [ ] 4.2 GREEN: `packages/analyzers/typescript/src/edges.ts` (`imports` with `ts.resolveModuleName`, heritage with the `TypeChecker`, alias following and a target matched by file, start line and name, `tested_by` from the `imports` edges with a subject parsed without a syntax error, constant `TS_COMPILER_EXTRACTOR`) wired into `ts-analyzer.ts` with `docMentionEdges` and `sortUniqueEdges`; `npx vitest run tests/unit/analyzers/typescript` green
- [ ] 4.3 REFACTOR with the suite green; `npm run typecheck`, `npm run lint`, `npm run lint:architecture`

## 5. Review and Update Existing Tests (MANDATORY)

- [ ] 5.1 No existing test is changed by this change: the analyzer is new and not wired into the CLI, `packages/core` is untouched, and the seed fingerprint does not read `packages/analyzers/typescript` (`packages/cli/src/seed/fingerprint.ts`). Review that the PHP analyzer tests (`tests/unit/analyzers/php/structure.spec.ts`, `edges.spec.ts`, `calls.spec.ts`, `parser-load.spec.ts`, `tests/unit/analyzers/php/laravel/`) and the core graph tests (`tests/unit/knowledge/`) still pass unchanged after the "Analysis contract", "Symbol extraction", "Code relation edges" and "Test coverage edges" wording changes of the delta (in particular the "Code relation" and "Test coverage" scenarios of `tests/unit/analyzers/php/edges.spec.ts`, whose requirements are now scoped to the PHP analyzer); if one fails, fix the code, not the test
- [ ] 5.2 Every `#### Scenario:` of the delta maps to a test of the same name: the 33 new TypeScript scenarios (2.1, 2.3, 3.1, 4.1); the scenarios copied unchanged into the MODIFIED "Analysis contract", "Symbol extraction", "Code relation edges" and "Test coverage edges" keep their existing PHP tests

## 6. Run Tests and Verify Data State (MANDATORY)

- [ ] 6.1 Targeted: `npx vitest run tests/unit/analyzers`
- [ ] 6.2 Broader: `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- [ ] 6.3 DoD of DIS-30: `git diff --stat final-project-CRN -- packages/core` is empty; `git status --short fixtures/` is empty (fixture untouched, PH-22)
- [ ] 6.4 `npm run verify` exits `0` (the seed and answer fingerprints do not include the new package; a mismatch is a finding)
- [ ] 6.5 `/privacy-ethics-check` over the diff (new dependency `typescript`: Microsoft, Apache-2.0, already a root devDependency; no personal data, no I/O)
- [ ] 6.6 `node scripts/dev-processes.mjs stop`; report `openspec/changes/ts-analyzer-structure/reports/YYYY-MM-DD-6-test-and-state-verification.md` (template of `docs/openspec-tasks-mandatory-steps.md` §6, with the `npm audit` result of 1.1 and the outputs of 6.3)

## 7. Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [ ] 7.1 The change adds no HTTP endpoint, CLI command or job: its interface is `createTypeScriptAnalyzer().analyze`. Exercise it directly with a throwaway script in the scratchpad run with `npx tsx --tsconfig packages/cli/tsconfig.run.json <script>` from the repository root (so `@codemind/core` resolves to its sources, not to a stale or missing `dist/`), over the 38 tracked files of `fixtures/task-api` (list from `git -C fixtures/task-api ls-files`): print the counts of files by kind, symbols by kind and edges by kind and resolution, the symbols of `src/domain/errors.ts` and the `tested_by` edges, and compare them with the spec
- [ ] 7.2 Error cases through the same script: a `.ts` file with a syntax error, an unparsable `tsconfig.json` and a duplicate path; verify the diagnostics and that the call resolves
- [ ] 7.3 No state to restore (no database, fixture read-only): confirm `git status --short fixtures/` is empty; `node scripts/dev-processes.mjs stop`
- [ ] 7.4 Report `openspec/changes/ts-analyzer-structure/reports/YYYY-MM-DD-7-manual-interface-testing.md` with the script, the commands and the outputs

## 8. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 8.1 Not applicable: no user interface reaches the analyzer until DIS-32 wires it into the CLI; state it in the step 7 report

## 9. Update Technical Documentation (MANDATORY)

- [ ] 9.1 `docs/project-context.md`: the TypeScript analyzer (what it emits and does not, extractor `ts-compiler`, file → file `imports` / `tested_by`, `tsconfig.json` from the input, no lib), and the gotcha of design D8 (walk task-api without `node_modules/` and `package-lock.json`); the PH-22 entry names the TypeScript analyzer too; the project-references sentence (today "`adapters/git`, `adapters/llm` and `analyzers/php` have a project reference to core") adds `analyzers/typescript`, and the passage that calls the analyzer packages empty stubs no longer says so of the TypeScript analyzer
- [ ] 9.2 TSDoc on every export of `packages/analyzers/typescript/src/index.ts`; `npm run docs:coverage` green
- [ ] 9.3 `/update-docs`: the docs gate passes; `prompts.md` gains the DIS-30 prompts with its Índice entry in the same edit
- [ ] 9.4 ADR not warranted (design D10): record it in the step 6 report

## 10. Pull request preparation

- [ ] 10.1 `/pr-describe` in Spanish against `final-project-CRN`: the Why marked as the agent's text, the empty `git diff --stat final-project-CRN -- packages/core` output, the dependency added and its `npm audit` result, existing tests unchanged

## 11. Pre-merge Review (MANDATORY - AGENT MUST EXECUTE)

- [ ] 11.1 Open the PR against `final-project-CRN`; DIS-30 to In Review with a Spanish comment linking it
- [ ] 11.2 CI green (wait with `Monitor` until no check is pending); link the run in an addendum to the step 6 report
- [ ] 11.3 `/show-spec-working` (may reuse the step 7 evidence) → `reports/YYYY-MM-DD-show-spec-working.md`
- [ ] 11.4 `/verify-against-spec` (inline mode) → `reports/YYYY-MM-DD-verify-against-spec.md`
- [ ] 11.5 `/adversarial-review` (inline mode) → `reports/YYYY-MM-DD-adversarial-review.md`
- [ ] 11.6 Fix every finding in this change (TDD for behaviour), each with an A/B/C/D destination in `design.md` → Follow-ups; re-run what each fix invalidates; commit to the same PR; re-run a check whose findings led to non-trivial fixes until no Blocker or Major
- [ ] 11.7 `/opsx:archive`, commit it to the same PR; merge (`gh pr merge <n> --merge`, through the merge gate) only after the archive commit and with CI green
