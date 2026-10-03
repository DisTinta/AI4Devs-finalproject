## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Set DIS-61 to In Progress in Linear right away, before anything else, with a short comment in Spanish (change name `php-laravel-heuristics-1` and branch)
- [x] 0.2 Create feature branch `feature/DIS-61-php-laravel-heuristics-1` from the delivery branch `origin/feature/entrega-2-CRN` (DIS-52 already merged there, PR #15; see `docs/project-context.md` → Branch and ticket conventions), carrying the untracked `openspec/changes/php-laravel-heuristics-1/` planning files with it
- [x] 0.3 Verify branch creation and current branch status (`git status`, `git branch --show-current`)
- [x] 0.4 Baseline: run `npx vitest run` once, green, and record the totals for the step 7 report; record `git status --porcelain fixtures` (must be empty) and `git ls-files -s fixtures/acme-shop | sha1sum`

## 1. Analyzer: grammar check and test scaffolding

- [x] 1.1 Confirm with inline samples parsed by the project's parser (scratch script in the scratchpad, not committed) the node shapes assumed in design D2 and Risks: `$this->app->bind('k', X::class)` (`member_call_expression`, `arguments`/`argument`), `X::class` (`class_constant_access_expression`), single- and double-quoted strings (`string` / `encapsed_string`, `string_content`, interpolation), `fn ($app) => new X()` (`arrow_function` body), `function () { return new X(); }` (`anonymous_function` body, `return_statement`), `protected static function getFacadeAccessor(): string { return 'k'; }`. Record any difference in design.md (Risks) and delete the script
- [x] 1.2 Create `tests/unit/analyzers/php/laravel/heuristic-calls.spec.ts` scaffolding (`container.spec.ts` is created in 4.1) (template: `tests/unit/analyzers/php/calls.spec.ts`): `createPhpAnalyzer()` over acme-shop in `beforeAll` with `readFixtureFiles`, `file()`, `symbolOf`, `callsFrom`, `exactCall` / `heuristicCall` helpers, spec reference comment, PH-22 note

## 2. Analyzer: `this` / `self` split (design D1, REFACTOR with the suite green)

- [x] 2.1 Split `CallForm` `own` into `this` (`$this->m()`) and `self` (`self::m()`, `new self()`) in `packages/analyzers/php/src/calls.ts`; `buildCallEdges` treats both as the old `own`. Run `npx vitest run tests/unit/analyzers/php` green with no assertion changed (acme-shop still 47 `calls`)

## 3. Analyzer: `__call` / `__callStatic` (TDD, design D4 rules 2–3)

- [x] 3.1 RED → GREEN, first touch of existing tests (design D6): before any production code, update in `tests/unit/analyzers/php/calls.spec.ts` the three MODIFIED scenarios of "Declared-type calls", without weakening their assertions — "The constructor-injected services of acme-shop are exact calls" (exactly 47 `calls` with `resolution` `exact`), "The heuristic call sites of acme-shop have no exact edge" (sites 7–9: no `exact` edge; sites 4, 6, 10, `AppServiceProvider::register` and `routes/web.php`: still no `calls` edge at all), "Static, intersection-typed, local, variable and magic receivers produce no edge" (one `exact` to `Clock::__construct`, one `heuristic` to `Magic::__callStatic`, nothing else). Run them: the `Odd` one is RED, the other two stay green. Then write the test "__call and __callStatic of the receiving class" (inline `Magic`, `Plain`, `Child`, `User`) and see it RED. Implement `packages/analyzers/php/src/laravel/magic-call.ts` (`resolveMagicCall`) and `buildHeuristicCallEdges` in `edges.ts`, wired into `buildPhpEdges` after every `exact` edge, with the exact-key filter of design D5 from the start. Run `npx vitest run tests/unit/analyzers/php` green (the old `toHaveLength(47)` would have failed here: `ShippingService::shippingFor` → `CarrierGateway::__call` is the 48th `calls`)
- [x] 3.2 Extra cases in the same spec (not spec scenarios): a trait declaring `__call` is never a target; `self::m()` / `static::m()` / `parent::m()` on a class with `__callStatic` give no edge; `$this->p?->m()` gives no edge; a `__call` call inside an arrow function gives no edge; a file with two `namespace` declarations originates no heuristic edge; an interface-typed property whose interface declares `__call` gives no edge

## 4. Analyzer: binding table and facades (TDD, design D2–D4 rule 1)

  - RED seen: the three MODIFIED tests updated first (`Odd` RED: `expected [ 1 edge ] to deeply equal [ 2 ]`; the other two green), then the scenario RED (`expected [ 1 ] to deeply equal [ 3 ]`). GREEN: `npx vitest run tests/unit/analyzers/php` 51/51. `buildCallEdges` now takes calls pre-resolved by a shared `resolveCalls` (same caller and target checks), so the exact and heuristic passes cannot drift apart.
  - 3.2: all six extra cases green on their first run (the rules they guard were already in place); their ability to fail is covered by 5.3.
- [x] 4.1 RED → GREEN, binding table only: create `tests/unit/analyzers/php/laravel/container.spec.ts` (unit cases, not spec scenarios) over `collectBindings` + `buildBindingTable` with inline files parsed by the project's parser: `bind('k', X::class)`, `singleton('k', fn ($app) => new X())`, `scoped(X::class, function () { return new X(); })` each give one entry (`X::class` key normalised to its FQN, design D3); two providers binding `'k'` to different classes leave `'k'` ambiguous; a provider whose parent is not `ServiceProvider`, a binding in `boot()`, `app()->bind(...)`, `App::bind(...)`, a `$bindings` property, a concrete resolving to an interface, and a double-quoted key with interpolation add nothing (proposal non-goal); a provider file with a syntax error adds nothing. See them RED, then implement `packages/analyzers/php/src/laravel/container.ts` and its collection in `analyzeOne` of `php-analyzer.ts` (before `tree.delete()`, only for files without syntax errors). No edge is produced yet
  - Deviation: `container.ts` was written before `container.spec.ts`, so the only RED seen was "Failed to load url …/laravel/container" with the module moved aside to the scratchpad; restored, 14/14 green on the first run. The ability of these cases to fail is proven by forced failure (b) of 5.3 and by a mutation of `plainStringOf` recorded there. The collection in `analyzeOne` was wired together with 4.2 (the table had no consumer before it).
- [x] 4.2 RED → GREEN, facade index, edges and wiring: test "A facade without a binding or outside the input has no edge" (inline `Rates`, `RatesFacade`, `Ghost`, `RatesProvider`, `Client`). Implement `laravel/facades.ts` (`collectFacadeAccessors`, `indexFacades`, `resolveFacadeCall`), its collection in `analyzeOne`, the binding table and facade index built in `buildPhpEdges`, and the facade branch of `buildHeuristicCallEdges` (a facade class never falls to `__callStatic`)
  - RED seen (`expected [] to deeply equal [ 1 edge ]`), then GREEN (72/72). `buildPhpEdges` takes a fifth, required `LaravelFacts` argument (`bindings`, `accessors`), filled in `analyzeOne`.
- [x] 4.3 RED → GREEN: test "A closure binding resolves a facade and originates no edge" (`singleton` with an arrow function; `RatesProvider::register` source of no `calls`)
- [x] 4.4 RED → GREEN: test "An ambiguous binding key resolves no facade" (`OtherProvider` binds `'rates'` to `OtherRates`)
- [x] 4.5 RED → GREEN: test "A provider with a syntax error contributes no binding"
  - 4.3–4.5 green on their first run: 4.2 already implemented every binding form. Their ability to fail is covered by 5.3 (b) and (d).
- [x] 4.6 Extra cases in `heuristic-calls.spec.ts` (not spec scenarios): accessor `X::class` matching a binding keyed `X::class` resolves; accessor `X::class` with **no** binding gives no edge (signed non-goal, the only case for that form); a facade whose parent is a repo-local base class gives no edge; a facade whose `getFacadeAccessor` is only inherited gives no edge
  - Also added: a facade class never falls back to its own `__callStatic`.

## 5. Analyzer: `exact` precedence and acme-shop (design D5)

- [x] 5.1 RED → GREEN: test "An exact edge takes precedence over a heuristic one" (inline `Both`, renamed from `Mixed`). The precedence is the explicit `Set` of exact keys of design D5, not emission order
  - Spec fix found by the test: `class Mixed` does not parse (`mixed` is a reserved type name in PHP 8), so `Mixed::run` had no symbol. The scenario's class is now `Both` (`app/Both.php`), in spec and test. Then green (the D5 filter was already in place since 3.1; its failure is shown in 5.3 (a)).
- [x] 5.2 RED → GREEN: test "The Laravel call sites of acme-shop are heuristic calls" (6 `heuristic` edges listed, exactly 6; no `calls` target in `app/Facades/Pricing.php`; `OrderController::index` and `AppServiceProvider::register` source of no `calls`; `validateGraph` returns `[]`)
  - Spec fix found by the test: "no edge has a symbol of `app/Facades/Pricing.php` as target" was false — the `imports` edges of the five files that `use App\Facades\Pricing` target it, rightly. The THEN now reads "no `calls` edge …". The six `heuristic` edges matched exactly, in `edges` order. `npx vitest run tests/unit/analyzers/php` 82/82.
- [x] 5.3 Prove the key tests can fail, backing each file up to the scratchpad, mutating it with a node script whose anchor must match, restoring it and confirming it is byte-identical each time with `fc.exe /b <backup> <file>` (or comparing `Get-FileHash` of both in PowerShell; `cmp` is not used on this win32 setup): (a) drop the exact-key filter of D5 and push heuristics before exact edges → "An exact edge takes precedence over a heuristic one" fails; (b) treat a key with two concretes as resolved to the first → "An ambiguous binding key resolves no facade" fails; (c) fall back to the accessor's own class when a `::class` key has no binding → the 4.6 no-binding case fails; (d) let the collector descend into binding closures for `CallFact`s → "A closure binding resolves a facade and originates no edge" fails. Record the results for the step 7 report
  - Forced failures (2026-10-03), scratchpad scripts `mutate.mjs` (anchor must match exactly once) + `force.sh` (backup, mutate, `npx vitest run tests/unit/analyzers/php`, restore with `cp`):
    1. (a) `edges.ts`: `appendUnshadowed(...)` → `edges.unshift(...heuristics)` → "An exact edge takes precedence over a heuristic one" failed (1/82).
    2. (b) `container.ts` `concreteFor`: `length === 1` → `>= 1` → "An ambiguous binding key resolves no facade" and the container case "two providers binding a key to different classes leave it ambiguous" failed (2/82).
    3. (c) `edges.ts`: every referenced class FQN added as an implicit binding of itself → "an accessor X::class with no binding gives no edge" failed (1/82).
    4. (d) `calls.ts`: `arrow_function` removed from the opaque set → "The Laravel call sites of acme-shop are heuristic calls" (`AppServiceProvider::register` got edges), the two acme-shop scenarios of `calls.spec.ts`, "Receivers without a usable declared type produce no edge" and the arrow-function extra case failed (5/82). As expected, not "A closure binding resolves a facade and originates no edge": `Rates` declares no `__construct`, so `new Rates()` yields no edge even when the closure is walked; the acme-shop scenario is the one that guards it.
    5. (e) `container.ts` `plainStringOf`: interpolation no longer rejected → container case "an interpolated, escaped or empty string key adds nothing" failed (1/82).
    6. (f) `magic-call.ts`: `self` also falls back to `__call` → at first **no test failed**: the extra case declared only `__callStatic`. Strengthened to declare both magic methods; re-run → "self::, static:: and parent:: calls never fall back to __call or __callStatic" failed (1/82).
  - Restore check: the first `force.sh` run called `fc.exe /b`, which Git Bash rewrote to `B:/` (no comparison done). Verified instead that each original anchor is present once and each mutation absent (`grep -c`), with the suite green; the script was fixed to `fc.exe //b`, and (f) re-run was confirmed with `Get-FileHash` equal and `fc.exe /b` "no se han encontrado diferencias".
- [x] 5.4 REFACTOR with the suite green: TSDoc on every export, `web-tree-sitter` still imported only by `parser.ts`, no import of another analyzer; `npm run lint:architecture` and `npm run docs:coverage` green
  - `web-tree-sitter` only in `parser.ts`; no other analyzer imported. `lint:architecture`: 0 errors, the same 4 `no-orphans` warnings as before (stubs `analyzers/typescript`, `adapters/llm`). `docs:coverage` clean. `npx eslint packages/analyzers/php/src tests/unit/analyzers/php` clean.

## 6. Backend: Review and Update Existing Tests (MANDATORY)

- [x] 6.1 Review (already updated in 3.1) the three MODIFIED scenarios of `tests/unit/analyzers/php/calls.spec.ts` against the final delta spec: wording, exact counts and that no assertion was weakened (diff against `origin/feature/entrega-2-CRN`)
- [x] 6.2 Identify any other test asserting the full set of `calls` edges or total edge counts (`edges.spec.ts`, `structure.spec.ts`); confirm with `git diff --stat origin/feature/entrega-2-CRN -- tests` that only the expected files changed
- [x] 6.3 Confirm that every `#### Scenario:` of `openspec/changes/php-laravel-heuristics-1/specs/code-analysis/spec.md` (7 ADDED, 2 of "Analysis contract", 9 of "Declared-type calls") maps 1:1 to a test with exactly the same name (grep each title in `tests/`)

## 7. Backend: Run Tests and Verify Data State (MANDATORY)

- [x] 7.1 Capture the pre-test baseline: `git status --porcelain fixtures` (empty), `git ls-files -s fixtures/acme-shop | sha1sum`. The change has no database state; record "no DB entity impacted"
- [x] 7.2 Run the targeted tests: `npx vitest run tests/unit/analyzers/php`, twice, to check for flakiness
- [x] 7.3 Run the required broader suite and gates: `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`, `npx stryker run` (core only: confirm the score is unchanged and ≥ `MIN_MUTATION_SCORE=70`); confirm `git diff --stat origin/feature/entrega-2-CRN -- packages/core` is empty
- [x] 7.4 Verify the post-test state matches the baseline (same checksum, `git status --porcelain fixtures` empty). Restore and document if not
- [x] 7.5 Create the report `openspec/changes/php-laravel-heuristics-1/reports/YYYY-MM-DD-7-test-and-state-verification.md` from the template in `docs/openspec-tasks-mandatory-steps.md` §6, including the baseline of 0.4 and the forced failures of 5.3
- [x] 7.6 Mark complete only after the tests pass and the report exists

## 8. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [x] 8.1 Note the current state (7.1 indicators). The interface is the `AnalyzerPort` implementation `createPhpAnalyzer()` (no HTTP route or CLI command exists for it)
- [x] 8.2 Exercise the success path: a scratch script in the scratchpad (not in the repo), run with `npx tsx`, that reads `fixtures/acme-shop` (skipping `.git`), calls `analyze`, and prints all `calls` edges grouped by source and resolution, plus counts per kind and resolution. Check by hand against sites 1–12 of `fixtures/README.md`: 1, 2, 3, 5, 11 `exact`; 7, 8, 9 `heuristic` (7 → `CarrierGateway::__call`); 4, 6, 10, 12 absent
- [x] 8.3 Mutating operations: none (the analyzer writes nothing). Confirm with the 7.1 checksum after the script ran
- [x] 8.4 Exercise the error cases from the same script: a facade whose key has no binding, an ambiguous key, a broken provider, an inherited `__call`, a provider closure. Print each result
- [x] 8.5 Document every command and output in `openspec/changes/php-laravel-heuristics-1/reports/YYYY-MM-DD-8-manual-interface-testing.md`. Delete the scratch script
- [x] 8.6 Verify the state matches the pre-test state (7.1 indicators)

## 9. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 9.1 Confirm no user interface or user workflow is affected (no route, no CLI, no web change). Record "not applicable", with that reason, in the step 7 report
- [ ] 9.2 After pushing (switch `gh` to the DisTinta account first, back to Cristina-JumpMath afterwards), confirm in the PR's CI run that `heuristic-calls.spec.ts` ran and was not skipped. Link the run in the step 7 report

## 10. Update Technical Documentation (MANDATORY)

- [x] 10.1 Update the PHP-edges gotcha in `docs/project-context.md`: `heuristic` `calls` for facades (binding table from `register()`, no implicit binding) and `__call`/`__callStatic` declared in the receiving class; provider closures still without edge; `exact` precedence; acme-shop yields 47 `exact` + 6 `heuristic` `calls`
- [x] 10.2 No ADR (design D7); confirm nothing in the implementation contradicted that
- [x] 10.3 Run `/update-docs` and confirm the docs gate passes (`npm run docs:coverage`). Add the relevant AI prompts to `prompts.md` per `docs/project-context.md` → prompts.md rules, with its Índice entry in the same edit
- [x] 10.4 Leave a Linear comment in Spanish on DIS-63 (CM-HU-04b.2): facades, bindings and `__call` are in as `heuristic`; Eloquent, string routes, jobs, events and the unresolved counter remain for it
  - 10.1: the gotcha now has two bullets: the `exact` rules, and a new one for the `heuristic` rules, the binding table, the non-goals and the 47 + 6 counts. 10.2: no ADR; nothing in the implementation contradicted D7. 10.3: `/update-docs` found nothing else stale (data model, API spec, dependencies, standards and ADRs unaffected; `docs/ai-sessions/` is history). It flagged two items for the author, not edited because of signed constraints: the JSDoc of `AnalysisResult.edges` (`packages/core/src/ports/AnalyzerPort.ts:45-47`) does not list Laravel `heuristic` `calls` (core must stay without diff), and `fixtures/README.md:267` names site 7's target `CarrierGateway::flatRateFor` while the edge lands on `CarrierGateway::__call` (fixtures read-only, PH-22). `docs:coverage` clean. `prompts.md` §23 (3 literal prompts) + Índice entry 23. 10.4: comment left on DIS-63.
- [ ] 10.5 Prepare the PR description (`/pr-describe`) against `feature/entrega-2-CRN`, leaving the Why for the author. After verification, set DIS-61 to In Review in Linear with a comment in Spanish linking the PR and the change
