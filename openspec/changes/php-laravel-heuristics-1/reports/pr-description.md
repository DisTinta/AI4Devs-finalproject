## What changes?

The PHP analyzer now emits `heuristic` `calls` edges (`php-treesitter-laravel`) for calls that the
declared-type rule leaves without an edge, in two cases:

- **Facade.** `F::m()` on a class that directly extends `Illuminate\Support\Facades\Facade`. The
  analyzer follows the key returned by its own `getFacadeAccessor()` through a binding table to `C::m`,
  where `C` is the single class bound to that key. The table is built only from
  `$this->app->bind|singleton|scoped` calls in `register()` of service providers.
- **`__call` / `__callStatic`.** A call to a method the class does not declare goes to the `__call` /
  `__callStatic` declared in the receiving class itself (`laravel/{container,facades,magic-call}.ts`,
  `buildHeuristicCallEdges` in `edges.ts`).

When a `heuristic` edge would share kind, source and target with an `exact` one, it is dropped
explicitly. In acme-shop this gives 6 `heuristic` `calls`: sites 7–9 of the batch plus three other
`Pricing::compute` callers. The 47 `exact` ones are unchanged, and `packages/core` has no diff.

Change: `openspec/changes/php-laravel-heuristics-1/` · Ticket: [DIS-61](https://linear.app/distinta-ai4devs/issue/DIS-61/cm-hu-04b1-facades-bindings-del-contenedor-call)

## Why?

<!-- filled in by the human: the business rationale is not yours to generate -->

## How to test it?

1. `npx vitest run tests/unit/analyzers/php`: 82 tests green. New files:
   `laravel/heuristic-calls.spec.ts` (18 tests) and `laravel/container.spec.ts` (14 tests).
2. `npx vitest run`: full suite green, 229 passed and 99 skipped. The skipped ones are the DB
   integration specs, which need `DATABASE_URL`, as before.
3. `npm run lint && npm run typecheck && npm run lint:architecture && npm run docs:coverage`: all
   green. The only warnings are the ones that were already there: the `LlmPort.ts` empty interface and
   the 4 `no-orphans` stubs.
4. `npx stryker run`: 93.89 % for `packages/core/src` (threshold 70 %). Stryker only mutates core, and
   core has no diff in this PR.
5. `npx vitest run --exclude 'tests/integration/**'` with no `DATABASE_URL`: 203 passed.
6. Checked against the batch of `fixtures/README.md`:
   - sites 1, 2, 3, 5 and 11 are `exact`;
   - sites 7, 8 and 9 are `heuristic`, with site 7 landing on `CarrierGateway::__call`;
   - sites 4, 6, 10 and 12 have no edge (they belong to DIS-63).

   Details in `openspec/changes/php-laravel-heuristics-1/reports/2026-10-03-8-manual-interface-testing.md`.

## Decisions / trade-offs

- **Explicit `exact` precedence (design D5).** `sortUniqueEdges` deduplicates without looking at
  `resolution`. Relying on emitting the heuristics last and on the stable sort would couple the result
  to how a core function breaks ties. Instead, `appendUnshadowed` filters each heuristic candidate
  against the identities of the `exact` edges.
- **The binding table is a lookup only.** Provider closures stay opaque and originate no edge. A key
  with no binding, including an accessor `X::class`, resolves nothing: Laravel's autowiring is not
  imitated. Both are non-goals signed by the author in the proposal.
- **Only `$this->app->bind|singleton|scoped` in `register()` counts.** `app()->bind`, `App::bind`,
  `boot()` and `$bindings` are left out. This is a proposal non-goal: those forms produce false
  negatives, never a guessed edge.
- **`own` split into `this` and `self` (design D1).** Only `$this->m()` can fall back to `__call`.
  Both forms keep resolving alike for `exact` edges.
- No ADR (design D7): the decisions are local to `packages/analyzers/php` and cheap to revert.

**Known debt, left on purpose:**

- The JSDoc of `AnalysisResult.edges` (`packages/core/src/ports/AnalyzerPort.ts:45-47`) does not list
  Laravel `heuristic` `calls`. The port is language-agnostic and core stays without diff by decision;
  the rule is documented in `docs/project-context.md` and in the spec.
- `fixtures/README.md:267` names site 7's target `CarrierGateway::flatRateFor`. That is the conceptual
  call site; the graph points to `CarrierGateway::__call`, because `flatRateFor` has no symbol. The
  fixtures are read-only (PH-22).

## Traceability

| Scenario in the specification | Test that covers it |
|---|---|
| The Laravel call sites of acme-shop are heuristic calls | `tests/unit/analyzers/php/laravel/heuristic-calls.spec.ts:136` |
| A facade without a binding or outside the input has no edge | `tests/unit/analyzers/php/laravel/heuristic-calls.spec.ts:68` |
| A closure binding resolves a facade and originates no edge | `tests/unit/analyzers/php/laravel/heuristic-calls.spec.ts:76` |
| An ambiguous binding key resolves no facade | `tests/unit/analyzers/php/laravel/heuristic-calls.spec.ts:89` |
| __call and __callStatic of the receiving class | `tests/unit/analyzers/php/laravel/heuristic-calls.spec.ts:218` |
| An exact edge takes precedence over a heuristic one | `tests/unit/analyzers/php/laravel/heuristic-calls.spec.ts:118` |
| A provider with a syntax error contributes no binding | `tests/unit/analyzers/php/laravel/heuristic-calls.spec.ts:108` |
| The acme-shop analysis is a valid deterministic graph | `tests/unit/analyzers/php/structure.spec.ts:247` |
| The analyzer reads only the content it receives | `tests/unit/analyzers/php/structure.spec.ts:270` |
| The constructor-injected services of acme-shop are exact calls | `tests/unit/analyzers/php/calls.spec.ts:300` |
| The heuristic call sites of acme-shop have no exact edge | `tests/unit/analyzers/php/calls.spec.ts:334` |
| Instantiation, static and own-type calls | `tests/unit/analyzers/php/calls.spec.ts:51` |
| A call through an interface-typed property targets the interface method | `tests/unit/analyzers/php/calls.spec.ts:71` |
| Receivers without a usable declared type produce no edge | `tests/unit/analyzers/php/calls.spec.ts:87` |
| Calls inside a type or function declared in a method body produce no edge | `tests/unit/analyzers/php/calls.spec.ts:216` |
| Traits are never targets and only classes are instantiated | `tests/unit/analyzers/php/calls.spec.ts:233` |
| Static, intersection-typed, local, variable and magic receivers produce no edge | `tests/unit/analyzers/php/calls.spec.ts:261` |
| A file with a syntax error originates no call edge | `tests/unit/analyzers/php/calls.spec.ts:287` |

## Origin

`agent+human-review`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
