## Why

After DIS-97 the PHP analyzer follows facades, `__call`, string routes, jobs and events, but the
Eloquent attributes and relations that Laravel reads as properties are still invisible: `$order->subtotal`
in `PriceCalculator::compute` (site 4 of the Table 2 batch) never reaches `Order::getSubtotalAttribute`,
and `$this->lines` / `$order->customer` never reach the relation methods. Impact analysis of the pricing
code therefore misses the accessor that sums the order. On top of that, when the analyzer recognises a
Laravel pattern but cannot resolve it (a facade with no binding, an event with no listener, a job with
no `handle`, a route whose action is not in the input), nothing says so: the incompleteness of the PHP
graph is hidden instead of measured. This is DIS-98 (CM-HU-04b.2b), the second half of DIS-63
(CM-HU-04b.2, split by the author on 2026-10-03), under CM-HU-04b (DIS-55).

## What Changes

- **Eloquent attributes** (R5, `heuristic`): a *read* `$r->a` (not an assignment target, not `?->`,
  not a method call) whose receiver is `$this` inside a model class `M`, `$this->p` with `p` a typed
  property of type `M`, or a parameter of the caller method declared with a single named type `M`
  (not nullable, not a union) → `M::get{Studly(a)}Attribute` if `M` declares it, else `M::a` if `M`
  declares it, else nothing (a column). `M` directly extends `Illuminate\Database\Eloquent\Model`. In a
  chain only the link with a typed receiver counts; the type of a read is never inferred.
- **Deliberate asymmetry** (author decision D5): typed parameters are used for R5 reads **only**;
  `$order->lineCount()` (a call on a parameter) still yields no edge, so the 47 `exact` `calls` do not
  change.
- In acme-shop: site 4 becomes `heuristic`, plus five more reads (6 new edges): **17** `heuristic`
  `calls` (11 + 6) and still **47** `exact`.
- **Unresolved-sites report** (author decisions D1 = A and D4): `createPhpAnalyzer().analyze()` returns
  a `PhpAnalysisResult` — the `AnalysisResult` plus `unresolved: UnresolvedSite[]`, each
  `{ path, line, source, reason }` with `reason` one of `facade-unresolved`, `event-no-listener`,
  `job-no-handle`, `route-action-missing`. Only Laravel patterns the analyzer recognises and cannot
  resolve are listed; columns, types outside the input and undeclared methods without `__call` are not.
  Sorted, deduplicated, deterministic. acme-shop yields `[]`; the mechanism is shown on a synthetic
  input.
- **BREAKING (spec)**: "parameters … SHALL produce no edge" gets an exception for R5 reads; the
  acme-shop total of `heuristic` edges goes from 11 to 17; the clause "no `calls` edge from
  `PriceCalculator::compute` to `app/Models/Order.php`" narrows to "no `exact` edge".

## Non-goals

- Method calls on parameters or local variables (`$order->lineCount()`): another user story.
- Inferring the return type of a relation (no second link in a chain), mutators `set…Attribute`,
  `$casts`, columns read from migrations, inherited relations, Laravel 9+ `Attribute` accessors named
  in camelCase (`couponCode()` for `coupon_code`).
- Tracking a parameter's type through the method body: after a reassignment or a `catch` variable of the
  same name, a read keeps the declared type (accepted false positive, stated in the spec; author
  decision 2026-10-04).
- `unresolved` in `AnalyzerPort` / `AnalysisResult` (D1 = A): if `measure-graph` ever needs it in the
  port, it is promoted in a separate change.
- Counting as unresolved: undeclared methods without `__call`, Eloquent columns, types outside the
  input (D4).
- Table 2 measurement (DIS-79/80).
- No change to `packages/core` (`git diff` empty, criterion of CM-HU-04b), no schema or migration, no
  new dependency. Never executes anything from the analysed repository (PH-19). The analyzer input
  `fixtures/acme-shop` is not modified (PH-22).

## Privacy and logging impact

None: fictitious fixture source only, no identities, no logging. The report carries repository paths,
line numbers and symbol names of the analysed code, the same data `symbols` already carries.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `code-analysis`: "Laravel heuristic calls" (rule 6, Eloquent attributes; the parameter exception for
  reads; acme-shop total 11 → 17; new scenario for columns, writes, nullable, `?->` and non-model
  receivers); "Declared-type calls" (scenario "The heuristic call sites of acme-shop have no exact
  edge": site 4 now has a `heuristic` edge, so it asserts the absence of an `exact` one); new
  requirement "PHP unresolved report" (synthetic input, acme-shop empty, determinism). "Analysis
  contract" is unchanged: the report is an extra field of the PHP analyzer's result only.

## Impact

- Code: `packages/analyzers/php/src/` — `calls.ts` (read form, parameter types, call line),
  new `laravel/eloquent.ts` (model check, Studly, target lookup), new `laravel/unresolved.ts` (report
  types, ordering, deduplication), `edges.ts` (attribute edges in the heuristic batch; unresolved sites
  collected from the same resolvers), `php-analyzer.ts` (`createPhpAnalyzer()` returns `PhpAnalyzer`,
  whose `analyze` resolves to `PhpAnalysisResult`), `index.ts` (exports `PhpAnalyzer`,
  `PhpAnalysisResult`, `UnresolvedSite`, `UnresolvedReason`). `packages/core`: no diff.
- Tests: new `tests/unit/analyzers/php/laravel/{eloquent,unresolved}.spec.ts`; the acme-shop total in
  `laravel/heuristic-calls.spec.ts` (11 → 17) and the site-4 clause in `calls.spec.ts` change with the
  delta.
- Mutation: Stryker mutates `packages/core/src/**` only; no core logic is added (recorded, not
  skipped).
- Docs: `docs/project-context.md` PHP-edges gotcha (17 `heuristic`, R5, report in the adapter);
  TypeDoc of new exports; `prompts.md`.
- Unblocks DIS-79, DIS-80 and DIS-91.
