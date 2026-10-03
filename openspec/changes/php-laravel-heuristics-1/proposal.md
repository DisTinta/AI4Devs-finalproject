## Why

The PHP analyzer now emits `exact` `calls` only when the receiver type is declared (DIS-52), so every
call Laravel resolves at run time is invisible: nothing in the graph says that `OrderController::show`
or `CheckoutController::store` reach `PriceCalculator::compute` through the `Pricing` facade, or that
`ShippingService::shippingFor` lands in `CarrierGateway::__call`. Impact analysis of the pricing code
(acme-shop Q2) therefore misses its controllers, listener and job. This is DIS-61 (CM-HU-04b.1), the
first slice of CM-HU-04b (DIS-55): facades resolved through the providers' container bindings, and
`__call`/`__callStatic` declared in the receiving class, as `heuristic` edges — visible to impact, never
presented as fact.

## What Changes

- **Facade `calls`** (`heuristic`, `php-treesitter-laravel`): `F::m(...)` where `F` directly extends
  `Illuminate\Support\Facades\Facade`, does not declare `m`, and declares `getFacadeAccessor()` returning
  a string literal or `X::class`; the key is looked up in a **binding table** and, when it has exactly
  one concrete class `C` of the input that declares `m`, the edge goes to `C::m`. No binding, an
  ambiguous key, or `m` missing in `C` → no edge.
- **Binding table** built from `$this->app->bind|singleton|scoped(KEY, CONCRETE)` in `register()` of a
  class that directly extends `Illuminate\Support\ServiceProvider` (KEY: string literal or `X::class`;
  CONCRETE: `X::class`, or a closure/arrow function returning `new X(...)`). It is only a lookup for
  facades: it originates no edge.
- **`__call` / `__callStatic` fallback** (`heuristic`): `$this->p->m(...)` or `$this->m(...)` on a class
  `T` that does not declare `m` but declares `__call` → `T::__call`; `X::m(...)` on a non-facade class `X`
  that does not declare `m` but declares `__callStatic` → `X::__callStatic`.
- **`exact` precedence**: a `heuristic` edge is never emitted when an `exact` one with the same `kind`,
  source and target exists.
- In acme-shop: sites 7, 8 and 9 of `fixtures/README.md` become `heuristic` (site 7 targets
  `CarrierGateway::__call`, since `flatRateFor` has no symbol), plus three other `Pricing::compute`
  callers: 6 `heuristic` `calls` in total; the 47 `exact` `calls` are unchanged.
- **BREAKING (spec)**: three scenarios of "Declared-type calls" asserted the absence of *any* edge, or a
  total of 47 `calls`; they now speak of `exact` edges only.

## Non-goals

Signed by the author on 2026-10-03:

- **Closures of provider bindings originate no edge.** The `new X()` inside the closures/arrow functions
  of `AppServiceProvider::register` stay opaque (D1 of DIS-52): no `register` → `X::__construct`, neither
  `exact` nor `heuristic`. Fixture trap 2 counts as covered through sites 8 and 9 (facade + binding).
- **A facade whose accessor is `X::class` with no registered binding gets no edge.** One rule: accessor
  → lookup in the providers' table → entry and method declared → `heuristic`; otherwise zero edges. A
  FQN or `::class` is never an implicit binding, even though Laravel autowires it at run time.
- The unresolved-sites counter (DIS-63, CM-HU-04b.2); Eloquent attributes, `Controller@method` routes,
  jobs (`dispatch()` → `handle()`), events (`$listen` → listeners) (DIS-63).

- **Only `$this->app->bind|singleton|scoped(...)` inside `register()` feeds the binding table.**
  `app()->bind(...)`, `App::bind(...)`, bindings written in `boot()`, and the `$bindings` /
  `$singletons` provider properties are out of scope: they add nothing to the table (false negatives,
  never a guessed edge).

Also out of scope:

- `app('x')`, `resolve()`, `$app->make()`, `App::make()`; facades through an intermediate base class;
  inherited `__call`/`__callStatic`; `self::m()`/`static::m()` to `__callStatic`; PHPDoc `@method`
  (no symbol); `vendor/`; Table 2 measurement (CM-HU-22).
- No change to `packages/core`, no schema or migration (`heuristic` already in `edge_resolution`), no new
  dependency. Never executes or boots anything from the analysed repository (PH-19). Fixtures are not
  modified (PH-22).

## Privacy and logging impact

None: fictitious fixture source only, no identities, no logging. The analyzer keeps reading only the
content it receives.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `code-analysis`: new requirement "Laravel heuristic calls"; "Analysis contract" lists it among the
  requirements that produce `edges`; "Declared-type calls" scenarios "The constructor-injected services
  of acme-shop are exact calls", "The heuristic call sites of acme-shop have no exact edge" and "Static,
  intersection-typed, local, variable and magic receivers produce no edge" are narrowed to `exact`
  edges.

## Impact

- Code: `packages/analyzers/php/src/` — new `laravel/container.ts` (binding facts), `laravel/facades.ts`
  (facade accessor facts and resolution), `laravel/magic-call.ts` (`__call`/`__callStatic` fallback);
  `calls.ts` (distinguish `$this->m()` from `self::m()`), `edges.ts` (heuristic pass after the exact
  one, with explicit `exact` precedence), `php-analyzer.ts` (collect the new facts while the tree is
  alive). `packages/core`: no diff.
- Tests: `tests/unit/analyzers/php/laravel/heuristic-calls.spec.ts` (new, spec scenarios);
  `tests/unit/analyzers/php/laravel/container.spec.ts` (new, unit cases of the binding table);
  `calls.spec.ts` (three scenarios narrowed to `exact`, updated at the first heuristic task).
- Mutation: Stryker mutates `packages/core/src/**` only; no core logic is added, so the gate is
  unaffected (recorded, not skipped).
- Docs: `docs/project-context.md` PHP-edges gotcha (heuristic `calls`, closures still without edge);
  TypeDoc of new exports; `prompts.md`.
- Unblocks DIS-63 (CM-HU-04b.2).
