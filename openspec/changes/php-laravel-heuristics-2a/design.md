## Context

See proposal.md (Why) and the delta spec for the rules. Current state after DIS-61:

- `collectRoutes` (`routes.ts`) accepts only `[X::class, 'm']` actions and emits each `route` symbol
  with `endLine: line` (`routes.ts:109`), i.e. the first line of the statement, although the spec says
  "span: the lines of the statement". `buildRouteEdges` (`edges.ts`) always emits `exact`.
- `collectCalls` (`calls.ts`) records `member_call_expression`, `scoped_call_expression` and
  `object_creation_expression` only; a `function_call_expression` (`event(...)`) is never a fact.
  `resolveCalls` resolves each fact once and feeds both `buildCallEdges` (`exact`) and
  `buildHeuristicCallEdges` (facade, `__call`, `__callStatic`), whose output goes through
  `appendUnshadowed` (the explicit `exact` precedence, D5 of DIS-61).
- `PhpTypeFact` (`names.ts`) has `extends` / `implements` raw names but not the traits a class uses in
  its body. The Laravel collectors (`laravel/container.ts`, `laravel/facades.ts`) share
  `LARAVEL_WALK_STOP` and `firstDeclarationOnly`, and `directlyExtends` checks a parent FQN by name
  (Laravel's classes are never in the input).
- `packages/core` must not change (criterion of CM-HU-04b; author decision D1 on DIS-63).

Grammar, checked on 2026-10-03 with the project's parser (scratch script in the scratchpad, deleted):

- `'App\Http\Controllers\CheckoutController@store'` is a `string` with a **single** `string_content`
  child holding the backslashes as written; so is `"App\X@run"` (`encapsed_string`). The existing
  `nonInterpolatedTextOf` (`routes.ts`) accepts both.
- `'A\\B@m'` (an escaped backslash) is `string_content` + `escape_sequence` + `string_content`, so
  `nonInterpolatedTextOf` rejects it: no route symbol, as the spec says.
- `\event(new P())` is a `function_call_expression` whose `function` is a `qualified_name` (`\` +
  `name`); `event(new P())` has a `name`.
- `use Dispatchable;` / `use A, B;` in a class body are `use_declaration` nodes whose named children are
  the trait names (`name` / `qualified_name`).
- `protected $listen = [P::class => [N::class]];` is a `property_declaration` → `property_element` →
  `variable_name` (`listen`) + `array_creation_expression`; each element is an
  `array_element_initializer` with two named children (key, value) when it has `=>`.
- *Re-checked in task 1.1:* the array of `$listen` is the `default_value` field of `property_element`
  (its `name` field is the `variable_name`); a static property has a `static_modifier` child, as in
  `typedPropertiesOf`. `function_call_expression` has fields `function` (`name` `event`, or
  `qualified_name` whose text is `\event`; `Foo\event` is a `qualified_name` with text `Foo\event`) and
  `arguments`. A named argument is an `argument` with a `name` field. A `use A, B { … }` trait use has
  `name` children `A`, `B` and a `use_list` child, which is not a trait name.

## Goals / Non-Goals

**Goals:**

- String routes, job dispatch and event dispatch as in the delta spec, reusing the name resolution,
  method index, type-kind index, `directlyExtends`, the Laravel walk rules and `appendUnshadowed`.
- Fix the route span for every route, array actions included.

**Non-Goals:**

- Eloquent attributes and the unresolved-sites report (DIS-98). Nothing here records "unresolved"
  sites; D6 keeps the seams DIS-98 needs.
- Any change to `packages/core`, the schema or the `AnalyzerPort` signature.

## Decisions

### D1 — String actions in `collectRoutes`, tagged by form

`actionOf` gains a second branch: a node accepted by `nonInterpolatedTextOf` whose text has exactly
one `@`, non-empty parts, and no leading `\` yields `{ form: 'string', rawClass: C, method: m }`; the
array branch yields `{ form: 'array', … }`. `RouteFact` gets `form: 'array' | 'string'`. The `route`
symbol is built the same way for both, with `endLine = statement.endPosition.row + 1`.

*Alternative rejected:* a separate `collectStringRoutes` — it would duplicate the verb, URI, import and
top-level checks, which are identical.

### D2 — Route edges split by form

`buildRouteEdges` returns `{ exact, heuristic }`:

- array: as today (`resolveTarget(resolveClassName(raw, fact), fqnTable)`, then `methodKey`), into
  `exact`;
- string: `resolveTarget(C, fqnTable)` with `C` used **verbatim** as the FQN (never
  `resolveClassName`, which would apply imports and the file namespace), the target must be of kind
  `class` (`indexTypeKinds`), then `methodKey(target, m)`, into `heuristic`.

`buildPhpEdges` pushes `exact` with the other exact edges and adds `heuristic` to the batch passed to
`appendUnshadowed`, so the D5 invariant (no `heuristic` shadowed by an `exact` with the same identity)
holds for routes too. Route symbols are unique per statement, so no shadowing is expected; the filter
is kept for uniformity, not need.

### D3 — `PhpTypeFact.uses`

`typeFactOf` (`names.ts`) records, for a `class_declaration`, the raw names of every `use_declaration`
child of its `declaration_list` (both `use A;` and `use A, B;`; a conflict-resolution block
`use A { … }` still contributes `A`). Interfaces have none; traits are recorded but never used (a
trait is never `X`). Resolution happens at edge time with `resolveClassName(raw, facts)` of the
class's file, like `extends`.

### D4 — Job dispatch: `laravel/jobs.ts`, a branch of `buildHeuristicCallEdges`

`resolveJobDispatch(method, typeFact, facts, declared)` returns `declared('handle')` when `method` is
one of the five dispatch names and some `uses` entry resolves to
`Illuminate\Foundation\Bus\Dispatchable` (string comparison, like `directlyExtends`). In
`buildHeuristicCallEdges`, for a `static` call:

1. facade class → `resolveFacadeCall` (unchanged; a facade never reaches 2 or 3);
2. otherwise `resolveJobDispatch(...) ?? resolveMagicCall(...)`.

So rule 4 wins over `__callStatic` when it applies, and a `Dispatchable` class without `handle` still
falls back to `__callStatic` if it declares one. The `PhpTypeFact` of the target type is found in
`factsByPath.get(targetType.file).types` by name and start line (the identity `indexTypeKinds`
already uses). Only the type's own `uses` count: a parent's trait is never looked up.

### D5 — Event dispatch: a new call form and a separate pass

- `calls.ts`: `targetOf` recognises a `function_call_expression` whose function is the `name` `event`
  or the `qualified_name` `\event`, whose first argument is positional (no `name` field) and is an
  `object_creation_expression` of a class name other than `self` / `static` / `parent`. It yields
  `{ form: 'event', rawClass: E, method: '' }`. Same placement walk, so closures, arrow functions,
  anonymous classes and nested declarations stay opaque.
- `buildCallEdges` skips the `event` form (it has no exact meaning; `new E(...)` inside it is already
  an `instantiation` fact of its own, as today: `DiscountService::discountFor` →
  `DiscountApplied::__construct` stays `exact`). `buildHeuristicCallEdges` skips it too.
- `laravel/events.ts`:
  - `collectListeners(root)`: per file, the same walk as `collectBindings` (`LARAVEL_WALK_STOP`,
    `firstDeclarationOnly`, never entering a class body beyond its members), reading the non-static
    `property_declaration` whose element is `$listen` with an array default, into raw
    `ListenFact { providerType, providerTypeLine, rawEvent, rawListeners }` per `E::class => [L::class, …]`
    element; any other element shape is skipped.
  - `buildListenerMap(facts, factsByPath, classOf)`: keeps a fact only when its file has one namespace
    and the provider `directlyExtends` `Illuminate\Foundation\Support\Providers\EventServiceProvider`;
    resolves `E` and each `L` with `classOf` (class of the input, never interface or trait); dedupes
    listeners per event.
  - `resolveEventDispatch(event, listenerMap, handleOf)`: the declared `handle` of each listener of
    `event`.
- `edges.ts`: `buildEventEdges(resolved, methods, listenerMap)`: for each resolved `event` call whose
  target type is a class, one `heuristic` edge per handle `resolveEventDispatch` returns. *Placement
  changed during task 5.2:* the builder lives in `edges.ts`, not `events.ts`, because it takes the
  module-private `ResolvedCall`; only the resolver is in `events.ts` (as `resolveFacadeCall` is in
  `facades.ts`).
- `php-analyzer.ts` collects `ListenFact`s in `analyzeOne` next to bindings and accessors (only for
  files without syntax errors), and `LaravelFacts` gains `listeners`.

*Alternative rejected:* resolving `event()` inside `buildHeuristicCallEdges` — that function's first
step is "skip if the method is declared", which has no meaning for a function call, and an event fans
out to several targets.

### D6 — Seams for DIS-98

Each resolver (`resolveFacadeCall`, `resolveJobDispatch`, the listener lookup, the string-route
lookup) returns `undefined` / an empty list when a recognised pattern has no target. DIS-98 will
record those as unresolved sites; this change adds no counter, no new type in `index.ts` and no field
on the result.

### D7 — Tests

- `tests/unit/analyzers/php/laravel/string-routes.spec.ts` (new, template `edges.spec.ts` route
  block): scenarios "The string route of acme-shop is a heuristic call", "A multi-line array-action
  route spans its whole statement", "Malformed string actions produce no route".
- `tests/unit/analyzers/php/laravel/jobs-events.spec.ts` (new, template `heuristic-calls.spec.ts`):
  "Jobs and events reach their handlers", "Only Dispatchable jobs and EventServiceProvider listeners
  are followed", plus extra cases (not scenarios).
- "Symbol extraction" is MODIFIED only in its `route` bullet (array- or string-action form); its
  scenarios are unchanged, so their tests in `structure.spec.ts` stay as they are.
- Tests come before code: task 3.1a only edits and writes tests and confirms which are RED; 3.1b
  implements the string routes.
- MODIFIED scenarios updated in place, each when its test first turns RED: `structure.spec.ts`
  ("The acme-shop files are classified"), `edges.spec.ts` ("The API routes of acme-shop point at their
  controller actions": the `routes/web.php` assertions move to the new string-route scenario),
  `calls.spec.ts` ("The heuristic call sites of acme-shop have no exact edge"),
  `laravel/heuristic-calls.spec.ts` ("The Laravel call sites of acme-shop are heuristic calls": 6 → 11).
  No other assertion changes.

### D8 — No ADR

Local to `packages/analyzers/php`, cheap to revert, recorded in the spec and here.

### D9 — How the spec evolved after `/verify-against-spec` (author decision 2026-10-03, tasks §12)

The review found one ambiguity and three behaviours the spec did not state. The author accepted the
four recommendations as given:

1. **(A) `$listen` is read per entry.** The spec said that elements of another form "add nothing",
   without saying whether an invalid entry discards its whole element. The code already kept the valid
   `L::class` entries; the spec now says so, because Laravel accepts mixed lists and `L1` in
   `[L1::class, 'App\L2']` is a real listener, so keeping it invents no edge. All-or-nothing was
   rejected: it only adds false negatives. Spec only. A new unit case pins it, and forced failure (h)
   (all-or-nothing) proves that case can fail.
2. **(B) Routes in a multi-namespace file.** The route symbol is kept and no route `calls` edge is
   emitted, of either form. A string action is never resolved through the file's names, so "PHP name
   resolution" did not cover it; "Array-action routes" now states it, consistently with every other
   edge of such a file. Spec only. The existing string-routes extra case already asserts it.
3. **(C) Classes in a top-level function body.** The Laravel collectors did not stop at
   `function_definition`, so a provider, facade or event provider declared inside a function was read
   and produced invented edges. This came from DIS-61's walk. Such a class only exists once the function
   runs, so it is no static registration. Code fixed: `function_definition` added to
   `LARAVEL_WALK_STOP` (see D10), with three cases shown RED first. Spec text extended.
4. **(D) Trait use and rule 4.** The base "PHP name resolution" said that trait use "SHALL NOT take part
   in resolution", which rule 4 contradicts. It is now MODIFIED in the delta with the single exception
   of rule 4. Its two scenarios are unchanged. Spec only.

### D10 — Function bodies stop the Laravel walk

`LARAVEL_WALK_STOP` now holds `function_definition` as well. The three collectors (`collectBindings`,
`collectFacadeAccessors`, `collectListeners`) share it, so they agree. `collectCalls` is unchanged:
"Declared-type calls" only excludes types and functions declared *in a method body*. A class declared
in a top-level function still gets symbols, and its own method calls can still be `exact`, as before.

## Risks / Trade-offs

- [String `<C>` is never resolved through `use`] → a short string action (`'CheckoutController@store'`
  with a `RouteServiceProvider` namespace prefix) gets a route symbol and no edge: a false negative,
  never a wrong edge. Explicit non-goal.
- [Escaped strings rejected] → `'App\\Http\\…@store'` (doubled backslashes) produces no route symbol.
  Accepted false negative (same rule as binding keys in DIS-61); not in the fixture.
- [`event` is matched by name] → a project function named `event` in its own namespace would be
  treated as Laravel's helper. The edge is `heuristic` and still needs a matching `$listen` entry.
- [Only `$listen` of a direct `EventServiceProvider` child] → listeners registered in `boot()`,
  discovered automatically or declared with attributes are missed: false negatives, non-goal.
- [Changing the route `endLine` touches every route symbol] → `routes/api.php` routes are one-liners,
  so their spans (12–12, 13–13) do not change; the multi-line scenario pins the new behaviour.
- [acme-shop count 11 depends on `OrderObserver` being kept with one namespace and on
  `EventServiceProvider` directly extending the aliased `EventServiceProvider`] → checked by the
  acme-shop scenario.
- [Mutation gate covers `packages/core/src/**` only] → unchanged score; forced failures in tasks stand
  in for mutation on the analyzer.
