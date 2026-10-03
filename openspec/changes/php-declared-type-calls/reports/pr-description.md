## What changes?

The PHP analyzer now emits `calls` edges (`exact`, `php-treesitter-laravel`) for calls inside method
bodies when the receiver's type is declared in the code. That covers a typed property of the caller's
own type (`$this->p->m()`), `X::m()`, `new X()` / `new self()` → `__construct`, and `$this->m()` /
`self::m()`. The target must be a method declared in that type itself (`calls.ts`, `buildCallEdges` in
`edges.ts`). Anything resolved at run time gets no edge: facades, container closures, `__call`,
inherited methods, typed parameters, `static::`, `new static`. `AnalyzerPort` is unchanged apart from
its `edges` JSDoc.

Change: `openspec/changes/php-declared-type-calls/` · Ticket: [DIS-52](https://linear.app/distinta-ai4devs/issue/DIS-52/cm-hu-04a3-llamadas-exact-por-tipo-declarado-constructor-propiedades)

## Why?

El grafo ya sabía qué importa, hereda o enruta un proyecto PHP, pero no seguía las llamadas dentro de los métodos. Sin eso, CODEMIND no puede responder con hechos a la pregunta de referencia de acme-shop (cómo se compone el precio) ni trazar impacto por `calls` exactas. Esta entrega cierra ese hueco solo cuando el tipo del receptor está declarado en el código; lo que Laravel resuelve en tiempo de ejecución (facades, contenedor, `__call`, etc.) queda sin arista hasta CM-HU-04b.

## How to test it?

1. `npx vitest run tests/unit/analyzers/php` — 48 tests green, 19 of them in the new `calls.spec.ts`.
2. `npx vitest run` — full suite green: 195 passed, 99 skipped (the skipped ones are the DB
   integration specs without `DATABASE_URL`, as before).
3. `npm run lint && npm run typecheck && npm run lint:architecture && npm run docs:coverage` — all
   green, with only the warnings that were already there (`LlmPort.ts` empty interface, 4
   `no-orphans` stubs).
4. `npx stryker run` — 94.08 % for `packages/core/src` (threshold 70 %). Stryker only mutates core,
   and the only core change here is a JSDoc.
5. `npx vitest run --exclude 'tests/integration/**'` with no `DATABASE_URL` — 169 passed.
6. Against the Table 2 seed of `fixtures/README.md`: sites 1, 2, 3, 5 and 11 are `exact`; sites 4, 6,
   7, 8, 9, 10 and 12 have no edge. The details are in
   `openspec/changes/php-declared-type-calls/reports/2026-10-03-6-manual-interface-testing.md`.

## Decisions / trade-offs

- **The target must be declared in the type itself** (design D2). There is no inheritance walk and no
  `__call` / `__callStatic` fallback. That keeps the Laravel traps (the `Pricing` facade,
  `CarrierGateway::flatRateFor`, `RecalculateTotals::dispatch`) without an edge, so none of them can
  come out `exact`. They are left for CM-HU-04b (DIS-61) to add as `heuristic`.
- **No edge from closures, arrow functions or anonymous classes** (design D1, author decision). The
  bindings in `AppServiceProvider::register` run later, through the container, so an edge from
  `register` would overstate what happens.
- **`new self` yes, `new static` no** (design, signed audit decision 2026-10-03). `self` is statically
  bound; `static` is late-bound, like `static::m()`, which is also out of scope.
- **"Exact" assumes no override** (design, Risks). A call through a typed property points at the
  declared type's method, even if a subclass could be injected at run time. This is the same
  convention as the task-api baseline (site 9).
- **One method index shared with route edges** (design D3). It replaces the linear `symbols.find`
  in `buildRouteEdges` without changing route behaviour.
- **Fixes after `/verify-against-spec`** (design D7, audit decision, same PR). Each one was
  reproduced first by a test that failed:
  - A named class or function declared inside a method body is now opaque. Before, its calls were
    attributed to the outer method, and `$this->x()` produced a false `exact` edge against the
    outer type.
  - A trait is never a target, in any form.
  - `new` targets a class only, never an interface or a trait.
  - Static properties are not typed receivers.
  - The spec gains 3 scenarios covering these cases, plus intersection types, `__callStatic`,
    variable names, plain functions and locals.
- **The route test in `edges.spec.ts` filters `calls` by source `routes/api.php` on purpose.** It
  used to assert that all `calls` of acme-shop were exactly the two route edges. Method bodies now
  produce `calls` too, so it checks the route edges only, still with exact equality. The
  method-body edges are covered by `calls.spec.ts`.
- No ADR (design D6): the change stays inside the analyzer, adds to it, and is cheap to revert.

## Traceability

| Scenario in the specification | Test that covers it |
|---|---|
| Analysis contract → The acme-shop analysis is a valid deterministic graph | `tests/unit/analyzers/php/structure.spec.ts:247` |
| Analysis contract → The analyzer reads only the content it receives | `tests/unit/analyzers/php/structure.spec.ts:270` |
| Declared-type calls → The constructor-injected services of acme-shop are exact calls | `tests/unit/analyzers/php/calls.spec.ts:254` |
| Declared-type calls → The heuristic call sites of acme-shop have no exact edge | `tests/unit/analyzers/php/calls.spec.ts:282` |
| Declared-type calls → Instantiation, static and own-type calls | `tests/unit/analyzers/php/calls.spec.ts:50` |
| Declared-type calls → A call through an interface-typed property targets the interface method | `tests/unit/analyzers/php/calls.spec.ts:70` |
| Declared-type calls → Receivers without a usable declared type produce no edge | `tests/unit/analyzers/php/calls.spec.ts:86` |
| Declared-type calls → Calls inside a type or function declared in a method body produce no edge | `tests/unit/analyzers/php/calls.spec.ts:179` |
| Declared-type calls → Traits are never targets and only classes are instantiated | `tests/unit/analyzers/php/calls.spec.ts:196` |
| Declared-type calls → Static, intersection-typed, local, variable and magic receivers produce no edge | `tests/unit/analyzers/php/calls.spec.ts:224` |
| Declared-type calls → A file with a syntax error originates no call edge | `tests/unit/analyzers/php/calls.spec.ts:241` |

Three forced failures, each restored and checked with `cmp`, show the key tests can fail. The details
are in the step 5 report.

## Origin

agent+human-review

🤖 Generated with [Claude Code](https://claude.com/claude-code)
