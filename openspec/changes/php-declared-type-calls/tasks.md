## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Set DIS-52 to In Progress in Linear right away, with a short comment in Spanish (change name `php-declared-type-calls` and branch)
- [x] 0.2 Create feature branch `feature/DIS-52-php-declared-type-calls` from the delivery branch `origin/feature/entrega-2-CRN` (DIS-49 already merged there, PR #14; see `docs/project-context.md` → Branch and ticket conventions), carrying the untracked `openspec/changes/php-declared-type-calls/` planning files with it
- [x] 0.3 Verify branch creation and current branch status (`git status`, `git branch --show-current`)
- [x] 0.4 Baseline: run `npx vitest run` once, green, and record the totals for the step 7 report; record `git status --porcelain fixtures` (must be empty) and `git ls-files -s fixtures/acme-shop | sha1sum`
  - Baseline (2026-10-03): 16 test files passed, 7 skipped (23 total); 176 tests passed, 99 skipped (327 total); 30.11s. `git status --porcelain fixtures` empty. `git ls-files -s fixtures/acme-shop | sha1sum` = `167c762e26cdc3ad7b71484c19aa6135dc6c2a8d`.

## 1. Analyzer: grammar check and test scaffolding

- [x] 1.1 Confirm with inline samples parsed by the project's parser (scratch script in the scratchpad, not committed) the node shapes assumed in design D1: `$this->p->m()` (`member_call_expression` → `member_access_expression`), `$this->m()`, `self::m()` / `parent::m()` / `static::m()` (`relative_scope` text), `X::m()`, `new X()` / `new self()` / `new static()` (class child of `object_creation_expression`), `property_declaration` / `property_promotion_parameter` `type` field for `Clock`, `?Clock`, `Clock|int`, no type; `arrow_function` / `anonymous_function`. Record any difference in design.md
  - One difference, recorded in design.md (Risks, "Checked 2026-10-03"): `new self()` / `new static()` / `new parent()` carry a plain `name` (text `self`/`static`/`parent`), not a `relative_scope`. The probe script was deleted after use.
- [x] 1.2 Create `tests/unit/analyzers/php/calls.spec.ts` scaffolding (template: `tests/unit/analyzers/php/edges.spec.ts`): `createPhpAnalyzer()` over acme-shop in `beforeAll` with `readFixtureFiles`, `acmeSymbol`, inline `file()` factory, spec reference comment

## 2. Analyzer: declared-type calls (TDD, design D1–D4)

- [x] 2.1 RED → GREEN: test "Instantiation, static and own-type calls" (inline `Clock` + `Job`, exactly four `calls` `exact` from `Job::run`, including `new self()` → `Job::__construct`; `new static()` adds none). Implement `packages/analyzers/php/src/calls.ts` (`collectCalls`, `CallFact`), its call in `analyzeOne` of `php-analyzer.ts` (before `tree.delete()`, discarded for multi-namespace files), `indexMethods` and `buildCallEdges` in `edges.ts`, wired into `buildPhpEdges`
  - RED seen (`expected [] to deeply equal [ … 4 edges ]`), then GREEN. `collectCalls(root)` takes no `path`/facts (placed and filtered by namespace count in `buildCallEdges`, as for routes). The implementation covers every form at once, so 2.2–2.7 went green on their first run: no separate RED for them; that they can fail is proven by the forced failures of 3.5.
- [x] 2.2 RED → GREEN: test "A call through an interface-typed property targets the interface method" (inline `Rates` + `Quote`)
- [x] 2.3 RED → GREEN: test "Receivers without a usable declared type produce no edge" (inline `Clock`, `Plain`, `Bad`: nullable, union, untyped, undeclared property, typed parameter, undeclared own method, vendor static, undeclared static, `new` without `__construct`, arrow function)
- [x] 2.4 Extra cases in the same spec (not spec scenarios): `parent::m()` and `static::m()` give no edge; `new self()` in a class that does not declare `__construct` gives no edge; `new static()` gives no edge even when `__construct` is declared; `$this->p?->m()` gives no edge; a call inside an `anonymous_function` gives no edge; a nested call `$this->a->f($this->b->g())` gives two edges; a declared (non-promoted) typed property works like a promoted one; a file with two `namespace` declarations originates no call edge
  - Also added: a call inside an anonymous class gives no edge; a method only inherited from a parent (`$this->`, `self::`, `X::`) is not a target.
- [x] 2.5 RED → GREEN: test "A file with a syntax error originates no call edge" (inline `Clock` + `Broken`; graph validation of the wrapped result returns no error)
- [x] 2.6 RED → GREEN: test "The constructor-injected services of acme-shop are exact calls" (the 10 listed edges, `exact`, `php-treesitter-laravel`; both `routes/api.php` `calls` still present). The scenario asserts containment; the extra `Money::*` → `Money::__construct` edges from `new self(...)` are expected and not asserted, unless implementation shows the scenario must state them (then update spec and test in this change)
  - The scenario lists 9 method-body edges plus the 2 route edges (11 in total; "10" above was a miscount). Asserted with `toContainEqual`; `Money` edges not asserted, no spec change needed.
- [x] 2.7 RED → GREEN: test "The heuristic call sites of acme-shop have no exact edge" (sites 4, 6, 7, 8, 9, 10, 12; `CarrierGateway::__call` never a target; `AppServiceProvider::register` and `routes/web.php` originate no `calls`)

## 3. Analyzer: route edges on the shared index and contract (design D3, D5)

- [x] 3.1 Narrow the route test "The API routes of acme-shop point at their controller actions" in `edges.spec.ts` to `calls` edges whose source file is `routes/api.php`, keeping exact equality with the two expected edges. Run it green
- [x] 3.2 REFACTOR: `buildRouteEdges` uses `indexMethods` instead of `symbols.find`. Run `npx vitest run tests/unit/analyzers/php` green with no assertion changed
  - Done together with 2.1 (D3: the index is shared from the start). 3.1 was applied right after 2.1 because the old route test broke as predicted (47 `calls` vs 2).
- [x] 3.3 RED → GREEN: re-run the test "The acme-shop analysis is a valid deterministic graph" in `structure.spec.ts` against the MODIFIED requirement (now with call edges: still ordered, unique, `validateGraph` returns `[]`); update its wording/reference only if needed, never weakening an assertion
  - Green unchanged: its assertions (ordered, unique, `validateGraph` `[]`) hold with the call edges; no edit needed.
- [x] 3.4 Update the TSDoc of `AnalysisResult.edges` in `packages/core/src/ports/AnalyzerPort.ts` to mention declared-type `calls`. No type changes. Run `npm run typecheck`
- [x] 3.5 Prove the key tests can fail, restoring from a scratch copy and confirming with `cmp` each time: fall back to `__call` when the method is missing → "The heuristic call sites of acme-shop have no exact edge" fails; accept `optional_type` as a usable property type → "Receivers without a usable declared type produce no edge" fails; descend into `arrow_function` → "The heuristic call sites of acme-shop have no exact edge" fails (`AppServiceProvider::register`). Record the three results for the step 7 report
  - Forced failures (2026-10-03), each file backed up to the scratchpad, mutated, run, then restored and confirmed byte-identical with `cmp`:
    1. `edges.ts` `buildCallEdges`: target `?? methods.get(…::__call)` → "The heuristic call sites of acme-shop have no exact edge" failed (`ShippingService::shippingFor` → `CarrierGateway::__call`). A first `sed` attempt silently did not apply (its check grepped the TSDoc); redone with a node script and verified.
    2. `calls.ts` `namedTypeOf` unwraps `optional_type` → "Receivers without a usable declared type produce no edge" failed.
    3. `calls.ts` `arrow_function` removed from the opaque set → "The heuristic call sites of acme-shop have no exact edge" failed (`AppServiceProvider::register`), and "Receivers without a usable declared type produce no edge" too.
- [x] 3.6 REFACTOR with the suite green: TSDoc on every export, no import of another analyzer, `web-tree-sitter` still imported only by `parser.ts`; `npm run lint:architecture` and `npm run docs:coverage` green
  - `web-tree-sitter` only in `parser.ts`; no other analyzer imported. `lint:architecture`: 0 errors, the same 4 `no-orphans` warnings as before the change (stubs `analyzers/typescript`, `adapters/llm`). `docs:coverage` clean. `npm run typecheck` and eslint on the touched files clean.

## 4. Backend: Review and Update Existing Tests (MANDATORY)

- [x] 4.1 Identify tests affected by the change: any assertion on the full set of `calls` edges or on total edge counts (`edges.spec.ts` route test, `structure.spec.ts` contract test). Confirm with `git diff --stat origin/feature/entrega-2-CRN -- tests` that only the expected files changed (`edges.spec.ts`, possibly `structure.spec.ts`, new `calls.spec.ts`)
  - `git diff --stat`: only `edges.spec.ts` (2 insertions, 1 deletion: the source filter plus a comment); untracked: only `calls.spec.ts`. `structure.spec.ts` untouched (no total edge count asserted there).
- [x] 4.2 Update affected tests without weakening their assertions. Confirm that every `#### Scenario:` of `openspec/changes/php-declared-type-calls/specs/code-analysis/spec.md` (2 of the MODIFIED "Analysis contract", 6 ADDED of "Declared-type calls") maps 1:1 to a test with exactly the same name (grep each title in `tests/`; no scenario without a test, no scenario with two)
  - The route test keeps exact equality with its two edges, now scoped to `routes/api.php` sources (not weakened: its subject is route edges). All 8 scenario titles match exactly one `it('…'` each.

## 5. Backend: Run Tests and Verify Data State (MANDATORY)

- [x] 5.1 Capture the pre-test baseline: `git status --porcelain fixtures` (empty), `git ls-files -s fixtures/acme-shop | sha1sum`. The change has no database state; record "no DB entity impacted"
- [x] 5.2 Run the targeted tests: `npx vitest run tests/unit/analyzers/php`, twice, to check for flakiness
- [x] 5.3 Run the required broader suite and gates: `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`, `npx stryker run` (core only: confirm the score is unchanged and ≥ `MIN_MUTATION_SCORE=70`). Reproduce the no-database run with `npx vitest run --exclude 'tests/integration/**'` and no `DATABASE_URL`
- [x] 5.4 Verify the post-test state matches the baseline (same checksum, `git status --porcelain fixtures` empty: no test modified a fixture). Restore and document if not
- [x] 5.5 Create the report `openspec/changes/php-declared-type-calls/reports/YYYY-MM-DD-5-test-and-state-verification.md` from the template in `docs/openspec-tasks-mandatory-steps.md` §6. Include the baseline of 0.4 and the forced failures of 3.5
- [x] 5.6 Mark complete only after the tests pass and the report exists

## 6. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [x] 6.1 Note the current state (5.1 indicators). The interface is the `AnalyzerPort` implementation `createPhpAnalyzer()` (no HTTP route or CLI command exists for it)
- [x] 6.2 Exercise the success path: a scratch script in the scratchpad (not in the repo), run with `npx tsx`, that reads `fixtures/acme-shop` (skipping `.git`), calls `analyze`, and prints all `calls` edges grouped by source, plus edge counts per kind and resolution. Check by hand against sites 1–12 of `fixtures/README.md`: 1, 2, 3, 5, 11 present and `exact`; 4, 6, 7, 8, 9, 10, 12 absent
- [x] 6.3 Mutating operations: none (the analyzer writes nothing). Confirm with the 5.1 checksum after the script ran
- [x] 6.4 Exercise the error cases from the same script: a broken file calling a project class, a call through a nullable property, a method only inherited from a parent, a `__call`-handled method. Print each result
- [x] 6.5 Document every command and output in `openspec/changes/php-declared-type-calls/reports/YYYY-MM-DD-6-manual-interface-testing.md`. Delete the scratch script
- [x] 6.6 Verify the state matches the pre-test state (5.1 indicators)

## 7. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 7.1 Confirm no user interface or user workflow is affected (no route, no CLI, no web change). Record "not applicable", with that reason, in the step 5 report
- [x] 7.2 After pushing (switch `gh` to the DisTinta account first, back to Cristina-JumpMath afterwards), confirm in the PR's CI run that `calls.spec.ts` ran and was not skipped. Link the run in the step 5 report
  - PR #15, `quality` (run 37112509888) and `frontend` passed; `calls.spec.ts` ran 16 tests, 24/24 test files passed. Linked in the step 5 report "CI evidence (task 7.2)".

## 8. Update Technical Documentation (MANDATORY)

- [x] 8.1 Extend the PHP-edges gotcha in `docs/project-context.md`: declared-type `calls` (`exact`, forms (a)–(d), target declared in the type itself, no closures, no `__call` fallback, typed parameters/locals and inherited methods out of scope until CM-HU-04b)
- [x] 8.2 No ADR (design D6); confirm nothing in the implementation contradicted that
- [x] 8.3 Run `/update-docs` and confirm the docs gate passes (`npm run docs:coverage`). Add the relevant AI prompts to `prompts.md` per `docs/project-context.md` → prompts.md rules, with its Índice entry in the same edit
  - `/update-docs`: gotcha added to `docs/project-context.md` (8.1); nothing else stale (checked data model, API spec, dependencies, `backend-standards.md`, ADRs, `fixtures/README.md`; planning docs in `docs/ai-sessions/` are history). `docs:coverage` clean. `prompts.md` §22 (3 literal prompts) + Índice entry 22.
- [x] 8.4 Leave a Linear comment in Spanish on DIS-61 (facades/bindings/`__call`): declared-type `calls` are in; `__call`, facades and closures were deliberately left without an edge for it to cover as `heuristic`
- [x] 8.5 Prepare the PR description (`/pr-describe`) against `feature/entrega-2-CRN`, keeping the author's Why. After verification, set DIS-52 to In Review in Linear with a comment in Spanish linking the PR and the change
  - PR #15 opened with the author's Why verbatim (`reports/pr-description.md`). DIS-52 → In Review with a comment linking the PR and the change.
