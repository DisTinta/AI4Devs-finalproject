## Why

After DIS-61 the PHP analyzer resolves facades and `__call`, but three more Laravel conventions still
leave holes in the acme-shop graph: the string route `'App\Http\Controllers\CheckoutController@store'`
in `routes/web.php` produces no route symbol at all, `RecalculateTotals::dispatch()` never reaches
`RecalculateTotals::handle`, and `event(new DiscountApplied(...))` / `event(new OrderPlaced(...))` never
reach the listeners declared in `EventServiceProvider::$listen`. Impact analysis of the checkout and
pricing code therefore misses an entry point, a queued job and two listeners. This is DIS-97
(CM-HU-04b.2a), the first half of DIS-63 (CM-HU-04b.2, split by the author on 2026-10-03), under
CM-HU-04b (DIS-55): sites 6, 10 and 12 of the Table 2 batch, as `heuristic` edges — visible to impact,
never presented as fact.

## What Changes

- **String routes** (R6): `Route::<verb>('<uri>', '<C>@<m>')`, optionally chained, with a plain string
  literal holding exactly one `@`, non-empty `<C>` and `<m>`, and `<C>` not starting with `\`, produces
  a `route` symbol `<VERB> <uri>` like an array-action route. `<C>` is taken as a literal
  fully-qualified name (no `use` lookup, no `RouteServiceProvider` namespace prefix). When it is a class
  of the input declaring `<m>`, a `calls` edge from the route to `C::m`, **`heuristic`**. Array-action
  routes keep `exact`.
- **Route span**: every `route` symbol spans all the lines of its statement (the spec already says so;
  the code used the first line only, unnoticed because the `api.php` routes are one-liners).
- **Jobs** (R7, `heuristic`): `X::dispatch|dispatchSync|dispatchIf|dispatchUnless|dispatchAfterResponse(...)`
  where `X` is a class of the input that uses, in its own body, a trait resolving to
  `Illuminate\Foundation\Bus\Dispatchable`, does not declare that method and declares `handle` →
  `X::handle`.
- **Events** (R8, `heuristic`): `event(new E(...))` / `\event(new E(...))`, with `E` a class of the
  input → one edge to `L::handle` for each listener `L` of `E` in the `$listen` property of a class that
  directly extends `Illuminate\Foundation\Support\Providers\EventServiceProvider`.
- In acme-shop: sites 6, 10 and 12 become `heuristic`, plus two more callers (`OrderObserver::created`
  → `SendOrderConfirmation::handle`, `OrderObserver::updated` → `RecalculateTotals::handle`): 11
  `heuristic` `calls` in total (6 + 5); the 47 `exact` `calls` are unchanged.
- **BREAKING (spec)**: the scenarios that asserted `routes/web.php` has no symbol and originates no edge
  now expect the `route` `POST /checkout`; "functions SHALL produce no edge" gets an exception for
  `event(...)`; the acme-shop total of `heuristic` edges goes from 6 to 11.

## Non-goals

- **Eloquent attributes and the unresolved-sites report**: DIS-98 (CM-HU-04b.2b), blocked by this
  change.
- `Event::dispatch`, `E::dispatch()` on events, `Event::listen` in `boot()`, listener auto-discovery,
  `#[AsEventListener]`, `$subscribe`.
- `dispatch(new J)`, `Bus::dispatch`, job chains and batches; a `Dispatchable` trait only inherited
  from a parent class.
- `RouteServiceProvider` namespace prefix, relative string actions, `Route::resource` / `controller` /
  groups, invokable `'C'` actions without `@`; string actions with an escape sequence (`'A\\B@m'`) or
  interpolation.
- Table 2 measurement (DIS-79/80).
- No change to `packages/core` (`git diff` empty, criterion of CM-HU-04b), no schema or migration, no
  new dependency. Never executes or boots anything from the analysed repository (PH-19). The analyzer
  input `fixtures/acme-shop` is not modified (PH-22).

## Privacy and logging impact

None: fictitious fixture source only, no identities, no logging. The analyzer keeps reading only the
content it receives.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `code-analysis`: "File classification" (acme-shop scenario: `routes/web.php` now has one `route`
  symbol); "Symbol extraction" (the `route` bullet now reads "one `route` symbol per route statement
  (array- or string-action form)"; no scenario changes); "Array-action routes" (string actions, multi-line span, array → `exact` / string →
  `heuristic`); "Laravel heuristic calls" (rules 4 and 5 for jobs and events, the `event` function
  exception, acme-shop total 6 → 11); "Declared-type calls" (scenario "The heuristic call sites of
  acme-shop have no exact edge": sites 6, 10 and 12 now have a `heuristic` edge, so it asserts the
  absence of `exact` ones there); "PHP name resolution" (after `/verify-against-spec`: trait use still
takes no part in resolution, except for rule 4, which resolves trait names to recognise
`Dispatchable`; scenarios unchanged). "Analysis contract" is unchanged: it already lists "Array-action
  routes" and "Laravel heuristic calls" among the requirements that produce `edges`.

## Impact

- Code: `packages/analyzers/php/src/` — `routes.ts` (string action, `RouteFact.form`, statement span),
  `names.ts` (`PhpTypeFact.uses`: trait names used in a class body), `calls.ts` (form `event`), new
  `laravel/jobs.ts` and `laravel/events.ts` (`$listen` collector and listener resolution), `edges.ts`
  (route edges split by form; jobs and events in the heuristic pass, through `appendUnshadowed`),
  `php-analyzer.ts` (collect `$listen` facts while the tree is alive). `packages/core`: no diff.
- Tests: new `tests/unit/analyzers/php/laravel/{string-routes,jobs-events}.spec.ts`; existing
  assertions about `routes/web.php` (`structure.spec.ts:34`, `edges.spec.ts:236-237`,
  `calls.spec.ts:361`) and the total of 6 in `laravel/heuristic-calls.spec.ts` change with the delta.
- Mutation: Stryker mutates `packages/core/src/**` only; no core logic is added, so the gate is
  unaffected (recorded, not skipped).
- Docs: `fixtures/README.md:267` (site 7 resolves to `CarrierGateway::__call`, inherited from DIS-61;
  a documentation file outside the analyzer input); `docs/project-context.md` PHP-edges gotcha;
  TypeDoc of new exports; `prompts.md`.
- Unblocks DIS-98 (CM-HU-04b.2b).
