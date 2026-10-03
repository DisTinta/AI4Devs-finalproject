## Context

DIS-52 left the PHP analyzer with one pass for calls: `collectCalls` (`calls.ts`) records raw
`CallFact`s per method body, and `buildCallEdges` (`edges.ts`) resolves each one through
`resolveClassName` / `resolveTarget`, the per-declaration method index (`indexMethods` + `methodKey`)
and `indexTypeKinds`, emitting an `exact` edge only when the target method is declared in the target
type. Every other call hits `if (!target) continue;` and is dropped. Closures, arrow functions and
anonymous classes are opaque to `collectCalls` (D1 of DIS-52), so the bindings of
`AppServiceProvider::register` produce no fact at all.

Constraints that shape this change:

- `sortUniqueEdges` (`packages/core/src/knowledge/edge-order.ts`) deduplicates by `(kind, source,
  target)` and ignores `resolution`; `packages/core` must not change (`git diff` empty).
- `Illuminate\Support\Facades\Facade` and `Illuminate\Support\ServiceProvider` are never in the input
  (no `vendor/`), so they are absent from the FQN table and can only be recognised by name.
- Facts are collected while the Tree-sitter tree is alive (`analyzeOne`, before `tree.delete()`), and
  a file with a syntax error contributes nothing (`hasError` gate) — the same must hold for the new
  facts.

## Goals / Non-Goals

**Goals:**

- `heuristic` `calls` for facades (through the providers' binding table) and for `__call` /
  `__callStatic` declared in the receiving class, exactly as in the spec requirement "Laravel heuristic
  calls".
- An explicit `exact`-over-`heuristic` precedence that does not depend on emission order.
- Reuse the existing name resolution, method index and type-kind index; no parallel resolver.

**Non-Goals:**

- Edges from provider closures (signed non-goal: the table is a lookup only).
- Implicit bindings: an accessor `X::class` with no table entry resolves nothing (signed non-goal).
- The unresolved-sites counter, Eloquent, string routes, jobs and events (DIS-63).
- Any change to `packages/core`, the schema or the `AnalyzerPort` signature.

## Decisions

### D1 — Split the `own` call form into `this` and `self`

`CallForm` today has `own` for `$this->m()`, `self::m()` and `new self()`. Rule 2 (`__call`) applies to
`$this->m()` only, so `own` becomes two forms: `this` (`$this->m()`) and `self` (`self::m()`,
`new self()`). `buildCallEdges` treats both exactly as `own` was treated (target in the caller's own
declaration, D8 of DIS-52), so no `exact` edge changes. *Alternative:* a boolean `viaThis` on the fact —
rejected, a second axis on top of `form` makes the switch in `buildCallEdges` harder to read.

### D2 — Two per-file collectors under `laravel/`

- `laravel/container.ts` → `collectBindings(root)`: for every class declaration, the raw names of its
  `extends` clause are already in `PhpFileFacts.types`; the collector only walks the body of a method
  named `register` and records each `member_call_expression` whose object is `$this->app` and whose
  name is `bind`, `singleton` or `scoped`, with exactly two arguments. It returns raw
  `BindingFact { providerType, providerTypeLine, key, rawConcrete }`, where `key` is
  `{ kind: 'string', value }` (single- or double-quoted literal with no interpolation, content taken
  as written) or `{ kind: 'class', raw }` (`X::class`), and `rawConcrete` is the raw `X` of `X::class`,
  of an arrow function whose body is `new X(...)`, or of an anonymous function whose body is a single
  `return new X(...)`. Any other argument shape yields no fact. The collector reads into the closure
  **only** to take that class name; it never produces a `CallFact` (signed non-goal).
- `laravel/facades.ts` → `collectFacadeAccessors(root)`: for every class declaration that declares
  `getFacadeAccessor` with a body of exactly one `return` statement of a string literal or `X::class`,
  a raw `FacadeAccessorFact { type, typeLine, key }`.

Both run in `analyzeOne` next to `collectCalls`, and are placed with `path` like routes and calls.
Whether the class actually extends `Facade` / `ServiceProvider` is decided at resolution time (D4),
not by the collector, so the collectors stay purely syntactic like `collectCalls`.

### D3 — Key normalisation

A key is a plain string: a `string` key is its literal content; a `class` key is the fully-qualified
name given by `resolveClassName(raw, facts)` of the file it is written in (provider file for bindings,
facade file for accessors). So `'pricing'` matches `'pricing'`, and `Rates::class` in a provider
matches `\App\Services\Rates::class` or `Rates::class` (same FQN) in a facade. A literal is compared
as written, without escape decoding: `'App\\Services\\Rates'` does not match `Rates::class` (accepted
false negative, see Risks).

### D4 — Resolution: `laravel/facades.ts` and `laravel/magic-call.ts`, called from `edges.ts`

`buildPhpEdges` builds, after the existing indexes:

- **Binding table** (`buildBindingTable`, in `laravel/container.ts`): for each placed `BindingFact`
  whose file has `namespaces <= 1`, whose provider type is a class whose first `extends` name resolves
  (`resolveClassName`) to exactly `Illuminate\Support\ServiceProvider`, and whose `rawConcrete`
  resolves (`resolveTarget`) to a symbol of kind `class` (`indexTypeKinds`), add the concrete class
  declaration under the normalised key. A key whose set holds two or more distinct declarations is
  ambiguous.
- **Facade index** (`indexFacades`, in `laravel/facades.ts`): type declaration → normalised key, for
  each accessor fact of a kept class whose first `extends` name resolves to exactly
  `Illuminate\Support\Facades\Facade`. A class extending `Facade` but without a usable accessor is
  still a facade class (it is excluded from `__callStatic`), with no key.

Then `buildHeuristicCallEdges` walks the same placed `CallFact`s as `buildCallEdges` (same caller and
duplicate-caller checks) and, for a call with no `exact` target:

1. `static` form, target type a facade class → key → table entry with exactly one class `C` →
   `methods.get(methodKey(C, m))` → edge, else nothing (`resolveFacadeCall`, `laravel/facades.ts`).
2. `static` form, target type a non-facade class → `methodKey(X, '__callStatic')` (`resolveMagicCall`,
   `laravel/magic-call.ts`).
3. `property` form whose target type is a class, or `this` form (caller's own declaration, which must
   be a class) → `methodKey(T, '__call')` (`resolveMagicCall`).
4. `new`, `self`: nothing.

Only declarations in the type itself count, because `methodKey` is per declaration: an inherited
`__call` / `__callStatic` / `getFacadeAccessor` is never found.

### D5 — Explicit `exact` precedence

`buildPhpEdges` computes all `exact` edges first, then builds a `Set` of
`kind\0source\0target` keys from them (same endpoint identity as `sortUniqueEdges`: file, name,
startLine), and `buildHeuristicCallEdges` drops any candidate whose key is in that set. Heuristic
candidates are also deduplicated among themselves through the same set. The result therefore never
holds a `heuristic` edge shadowed by an `exact` one, whatever order the edges are pushed or sorted in.
*Alternative rejected (audit 2026-10-03):* emitting heuristics after the exact edges and relying on the
stable sort of `sortUniqueEdges` keeping the first — correct today, but an implicit coupling to a core
function's tie-breaking that a later edit could break silently. The scenario "An exact edge takes
precedence over a heuristic one" guards it.

### D6 — Tests

- New `tests/unit/analyzers/php/laravel/heuristic-calls.spec.ts`, template `calls.spec.ts` (`file()`,
  `symbolOf`, `callsFrom`, `readFixtureFiles` over acme-shop in `beforeAll`), with a
  `heuristicCall(source, target)` helper next to an `exactCall` one; one `it` per ADDED scenario, named
  exactly like it.
- New `tests/unit/analyzers/php/laravel/container.spec.ts`: unit cases of `collectBindings` +
  `buildBindingTable` (not spec scenarios), so the table goes RED → GREEN on its own before any facade
  edge exists.
- `calls.spec.ts`: the three MODIFIED scenarios of "Declared-type calls" are updated in place (47 →
  filter on `resolution === 'exact'`; heuristic sites → "no `exact` edge" for sites 7–9; `Odd::run` →
  one `exact` plus one `heuristic`) **as the first step of the first heuristic task (3.1)**, because
  the `__call` / `__callStatic` edges break the old wording of all three. No other assertion changes.

### D7 — No ADR

The decisions are local to `packages/analyzers/php`, cheap to revert and already recorded in the spec
and here. The signed scope decisions (closures, implicit bindings) live in the proposal and Linear.

## Risks / Trade-offs

- **Grammar shapes are assumed, not yet checked**: `X::class` as `class_constant_access_expression`,
  string literals (`string` / `encapsed_string` with `string_content`), `arrow_function` body field,
  `anonymous_function` body with a single `return_statement`, `arguments` → `argument` wrappers. Task
  1.1 checks them with the project's parser before any test; differences go into this section.
  *Checked 2026-10-03:* all as assumed. Details that fix the collector: `$this->app->bind(...)` is a
  `member_call_expression` whose `object` is a `member_access_expression` (`$this`, name `app`);
  arguments are `arguments` → `argument` → expression; `X::class` is a
  `class_constant_access_expression` with two unnamed-field children, the class name (`name` /
  `qualified_name`) and the `name` `class`; `'k'` is `string`, `"k"` is `encapsed_string`, both with a
  single `string_content` child when plain — an interpolated string has extra children
  (`variable_name`, `{`), so a key is accepted only when its sole named child is one `string_content`
  (which also rejects escapes and the empty string); `arrow_function` and `anonymous_function` have a
  `body` field (an expression, resp. a `compound_statement`). The probe script was deleted after use.
- **Escaped string keys** (`'App\\Services\\Rates'`) do not match a `::class` key → false negative,
  never a wrong edge. Accepted; none in the fixture.
- **Other registration styles are missed** (`app()->bind`, `App::bind`, `$this->app['x'] = …`, bindings
  in `boot()`, `$bindings`/`$singletons` properties) → false negatives. Explicit non-goal of the
  proposal (audit 2026-10-03).
- **`__call` targets are coarse**: every undeclared method of `CarrierGateway` lands on
  `CarrierGateway::__call`. That is the only symbol that exists, and the edge is `heuristic`.
- **acme-shop count (6 `heuristic`) depends on `OrderPricingTest::test_final_price_applies_discount_before_tax`**
  being a method symbol and `tests/Feature/OrderPricingTest.php` having one namespace — true today;
  checked by the acme-shop scenario.
- **Mutation gate** covers `packages/core/src/**` only; this change adds no core logic, so the score is
  unchanged. The forced failures of the tasks stand in for mutation on the analyzer.
