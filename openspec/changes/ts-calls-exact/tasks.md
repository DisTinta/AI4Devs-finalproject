## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Feature branch `feature/dis-31-ts-calls-exact` (`BRANCH_PREFIX=feature/`), created from `final-project-CRN` before `/opsx:propose`; confirm `git merge-base --is-ancestor origin/final-project-CRN HEAD` and that `openspec/changes/ts-calls-exact/` is on it. `git fetch`; if `origin/final-project-CRN` moved, merge it before any code (never force-push a published branch). Every commit scope is `DIS-31`
- [x] 0.2 Confirm DIS-31 is In Progress in Linear, with a short comment in Spanish naming the change `ts-calls-exact` and the branch
- [x] 0.3 Verify the current branch and `git status`; nothing under `.claude/` or `.cursor/` is ever staged (explicit paths only)
- [x] 0.4 Baseline: `npx vitest run` once (integration database as `docs/TESTING.md` says) and record the totals; record `git diff --stat final-project-CRN -- packages/core` (empty) and the output of `npm run lint:architecture`; then `node scripts/dev-processes.mjs stop`

## 1. Shared declaration → symbol map (REFACTOR with the suite green; design D2)

- [x] 1.1 `npx vitest run tests/unit/analyzers/typescript` green before touching anything (the safety net: `structure.spec.ts`, `edges.spec.ts`, `compiler-load.spec.ts`, none of them modified)
- [x] 1.2 `packages/analyzers/typescript/src/symbols.ts`: `extractSymbols` records the declaration node of each symbol it produces (optional sink; names still computed only here). `ts-analyzer.ts` builds, after `keepFirst`, the map from node to `SymbolRef` of the kept symbols and passes it to `buildTypeScriptEdges`; `edges.ts` drops its private `kept` / `keyOf` / `refOf` / `emitted` and uses the map for the heritage endpoints. TSDoc citing DIS-31 and design D2
- [x] 1.3 `npx vitest run tests/unit/analyzers/typescript` still green with no test changed; `npm run typecheck`, `npm run lint`

## 2. Calls (TDD; spec "TypeScript calls", design D1, D3, D4, D5, D6)

- [x] 2.1 RED: create `tests/unit/analyzers/typescript/calls.spec.ts` (task-api input built as in `edges.spec.ts`: `readFixtureFiles(TASK_API, ['.git', 'node_modules'])` without `package-lock.json`; `beforeAll` analyses it once) with the scenarios "The calls of task-api", "What the compiler cannot resolve has no calls edge", "Compiler-resolved call forms", "An overloaded call targets the implementation", "Abstract and interface methods are targets themselves", "A call with a type error keeps its compiler-resolved target", "A callee typed by a function's type is not that function", "Only a constructor declared in the class itself is a target", "Callbacks belong to their symbol and nested symbols keep their own calls", "Only references passed as arguments are calls", "Call sites outside a function or method symbol, and targets that are not symbols, have no edge", "A file with a syntax error neither originates nor receives calls" and "A dropped duplicate declaration is neither source nor target of a call"; one `it` per scenario, named exactly after it; see them fail (no `calls` edge yet)
- [x] 2.2a GREEN, walk and call expressions: `packages/analyzers/typescript/src/calls.ts` with `buildTypeScriptCalls(ts, built, parsed, symbolOf)`, wired into `ts-analyzer.ts` before `sortUniqueEdges`: one walk per parsed file carrying the source (boundaries of design D3; decorators and `isSkippedDeclaration` subtrees not entered; tagged templates are not call sites), call expressions resolved with `getResolvedSignature` (design D4: overload signature → declaration with a body, abstract and interface method signatures as themselves, union / intersection member names → no edge with the owners grouped by class or interface symbol so a merged interface counts as one (SA12), callee identity: an identifier or property-access callee must name the resolved declaration and any other callee gives no edge (SA11), no declaration → no edge), edges of design D5. Green: "An overloaded call targets the implementation", "Abstract and interface methods are targets themselves", "A call with a type error keeps its compiler-resolved target", "A callee typed by a function's type is not that function", "Callbacks belong to their symbol and nested symbols keep their own calls", "Call sites outside a function or method symbol, and targets that are not symbols, have no edge", "A file with a syntax error neither originates nor receives calls" and "A dropped duplicate declaration is neither source nor target of a call"; `npx vitest run tests/unit/analyzers/typescript`
- [x] 2.2b GREEN, constructors: `new X(...)` targets only a constructor declared in `X` itself (overloaded constructors → the one with a body), `super(...)` only one declared in the direct base; `new` on an expression that does not resolve to a class declaration and `super(...)` on a non-class base give no edge (design D4, E3, P2). Green: "Only a constructor declared in the class itself is a target" and "Compiler-resolved call forms"; `npx vitest run tests/unit/analyzers/typescript`
- [x] 2.2c GREEN, references: an identifier or property access written directly as an argument of a call or `new` targets the one declaration of its symbol (aliases followed) present in the map (design D4, E5, P4). Green: "Only references passed as arguments are calls", "The calls of task-api" and "What the compiler cannot resolve has no calls edge"; TSDoc citing DIS-31 and the design decisions on every new function; `npx vitest run tests/unit/analyzers/typescript`
- [x] 2.3 REFACTOR with the suite green; `npm run typecheck`, `npm run lint`, `npm run lint:architecture`

## 3. Fixture oracle (enrich decisions E1, E2)

- [x] 3.1 `fixtures/README.md`, task-api first batch: rows 7 and 10 say "no edge" in *Expected* with the reason (7: receiver `request.server` typed by `fastify`, outside the analyzer input; 10: `Array.prototype.includes`, standard library, outside the input); row 3 names the two edges of the chain (`TaskService::update` → `TaskService::get` → `TaskNotFoundError::constructor`); the sentence "Every task-api site is `exact` by construction" becomes exactly "Every edge emitted for task-api is `exact` by construction; sites 7 and 10 have no edge because their target is outside the analyzer input — that contrast with acme-shop is the whole point of Table 2." The fixture's code is not touched (`git status --short fixtures/task-api` empty)

## 4. Review and Update Existing Tests (MANDATORY)

- [x] 4.1 No existing test is changed by this change (design D6): review that `tests/unit/analyzers/typescript/structure.spec.ts` (in particular "The task-api analysis is a valid deterministic graph", which now also covers the `calls` edges), `tests/unit/analyzers/typescript/edges.spec.ts` (in particular "The structural edges of task-api", whose loop requires every non-`describes` edge to be `exact` with extractor `ts-compiler`, and "A dropped duplicate declaration is neither source nor target of an edge", the guard of the refactor of step 1) and `tests/unit/analyzers/typescript/compiler-load.spec.ts` pass unchanged, as do the PHP analyzer tests (`tests/unit/analyzers/php/`) after the "Analysis contract" wording change; if one fails, fix the code, not the test
- [x] 4.2 Every `#### Scenario:` of the delta maps to a test of the same name: the 13 new scenarios of "TypeScript calls" (2.1); the scenarios of the MODIFIED "Analysis contract" are copied unchanged and keep their existing tests

## 5. Run Tests and Verify Data State (MANDATORY)

- [x] 5.1 Targeted: `npx vitest run tests/unit/analyzers`
- [x] 5.2 Broader: `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- [x] 5.3 DoD of DIS-31: `git diff --stat final-project-CRN -- packages/core` is empty; `git status --short fixtures/task-api` is empty (fixture code untouched, PH-22); no `calls` edge is `heuristic` (scenario "The calls of task-api")
- [x] 5.4 `npm run verify` exits `0` (the seed and answer fingerprints do not include the TypeScript analyzer; a mismatch is a finding)
- [x] 5.5 No dependency is added, so no `npm install` and no `npm audit` run; `/privacy-ethics-check` over the diff (no personal data, no I/O, no network)
- [x] 5.6 `node scripts/dev-processes.mjs stop`; report `openspec/changes/ts-calls-exact/reports/YYYY-MM-DD-5-test-and-state-verification.md` (template of `docs/openspec-tasks-mandatory-steps.md` §6, with the outputs of 5.3 and the analysis time of task-api before and after)

## 6. Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [x] 6.1 The change adds no HTTP endpoint, CLI command or job: its interface is `createTypeScriptAnalyzer().analyze`. Exercise it directly in Git Bash with a throwaway script in the scratchpad run with `npx tsx --tsconfig packages/cli/tsconfig.run.json <script>` from the repository root, over the 38 tracked files of `fixtures/task-api` (list from `git -C fixtures/task-api ls-files`): print every `calls` edge as `source → target` and the count of edges by kind and resolution, and compare them with the batch table of `fixtures/README.md` (8 sites present, sites 7 and 10 absent)
- [x] 6.2 Error cases through the same script: a `.ts` file with a syntax error that calls a function of another file, and a call to a package function (`import { z } from 'zod'`); verify that the call resolves, the diagnostics, and that neither produces a `calls` edge
- [x] 6.3 No state to restore (no database, fixture read-only): confirm `git status --short fixtures/` is empty; `node scripts/dev-processes.mjs stop`
- [x] 6.4 Report `openspec/changes/ts-calls-exact/reports/YYYY-MM-DD-6-manual-interface-testing.md` with the script, the commands and the outputs

## 7. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 7.1 Not applicable: no user interface reaches the analyzer until DIS-32 wires it into the CLI; state it in the step 6 report

## 8. Update Technical Documentation (MANDATORY)

- [x] 8.1 `docs/project-context.md`, "The TypeScript analyzer": replace "There are no `calls` yet (DIS-31)" with what the analyzer emits (symbol → symbol `calls`, `exact`, `ts-compiler`; compiler-resolved signatures, overloads → implementation, constructors only when declared in the class itself, references passed as arguments, callbacks belong to the enclosing symbol) and what it does not (receivers typed by packages, standard library, module-level code, accessors, property initializers); the gotcha that batch sites 7 and 10 of task-api have no edge by design
- [x] 8.2 TSDoc on the new and changed functions of `packages/analyzers/typescript/src/`; `npm run docs:coverage` green
- [x] 8.3 `/update-docs`: the docs gate passes; `prompts.md` gains the DIS-31 prompts with its Índice entry in the same edit
- [x] 8.4 ADR not warranted (design D7): record it in the step 5 report

## 9. Pull request preparation

- [x] 9.1 `/pr-describe` in Spanish against `final-project-CRN`: the Why marked as the agent's text, the empty `git diff --stat final-project-CRN -- packages/core` output, the 8 + 2 reading of the DoD (design Follow-ups E2, SA1), stating that the author reviews it after the merge (ADR 20261020, Consequences), existing tests unchanged

## 10. Pre-merge Review (MANDATORY - AGENT MUST EXECUTE)

- [ ] 10.1 Open the PR against `final-project-CRN`; DIS-31 to In Review with a Spanish comment linking it
- [ ] 10.2 CI green (wait with `Monitor` until no check is pending); link the run in an addendum to the step 5 report
- [x] 10.3 `/show-spec-working` (may reuse the step 6 evidence) → `reports/YYYY-MM-DD-show-spec-working.md`
- [x] 10.4 `/verify-against-spec` (inline mode) → `reports/YYYY-MM-DD-verify-against-spec.md`
- [x] 10.5 `/adversarial-review` (inline mode) → `reports/YYYY-MM-DD-adversarial-review.md`
- [x] 10.6 Fix every finding in this change (TDD for behaviour), each with an A/B/C/D destination in `design.md` → Follow-ups; re-run what each fix invalidates; commit to the same PR; re-run a check whose findings led to non-trivial fixes until no Blocker or Major
- [ ] 10.7 `/opsx:archive`, commit it to the same PR; merge (`gh pr merge <n> --merge`, through the merge gate) only after the archive commit and with CI green
