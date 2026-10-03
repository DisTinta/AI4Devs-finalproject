## Why

The PHP analyzer (DIS-47, DIS-49) emits the relations the code declares, but no edge yet follows a
call inside a method body: the graph cannot say that `PriceCalculator::compute` calls
`DiscountService::discountFor`, `TaxService::taxFor` and `ShippingService::shippingFor`, which is the
backbone of the acme-shop reference question (Q1) and of impact analysis (Q2). This is DIS-52
(CM-HU-04a.3), the third slice of the PHP/Laravel analyzer CM-HU-04a (DIS-37): calls whose receiver
type is declared in the code, so they can be marked `exact`. Everything Laravel resolves at run time
stays without an edge until CM-HU-04b (DIS-61, DIS-63).

## What Changes

- **Declared-type `calls` edges**, `resolution: 'exact'`, `extractor: 'php-treesitter-laravel'`, from
  the named method symbol (`Class::m`) that lexically contains the call — outside any closure or arrow
  function — to a method symbol `X::m` **declared in class or interface `X` itself**, where `X`
  resolves through the existing "PHP name resolution" to exactly one symbol of the input. Four forms:
  - **(a) typed property**: `$this->p->m(...)`, `p` declared in the caller's class (promoted in
    `__construct` or declared as a property) with a single named type — not nullable, union or
    intersection;
  - **(b) explicit static**: `X::m(...)`;
  - **(c) instantiation**: `new X(...)` → `X::__construct`, and `new self(...)` → the caller type's
    own `__construct`; no edge when that type does not declare it;
  - **(d) own class**: `$this->m(...)` / `self::m(...)` → the caller class's `m`.
- Any other call produces **no edge**; nothing `heuristic` in this change. In acme-shop this yields
  sites 1, 2, 3 and 5 of `fixtures/README.md` as `exact`, keeps the two route `calls` of DIS-49 (site
  11) as a regression, and leaves the heuristic sites 4, 6, 7, 8, 9, 10 and 12 without an edge — in
  particular no fallback to `CarrierGateway::__call` and no edge through the `Pricing` facade.
- `AnalyzerPort` signature unchanged; only the `edges` JSDoc mentions the new `calls`.

## Non-goals

- `heuristic` edges: facades, container bindings, `__call`, Eloquent attributes, jobs, events
  (DIS-61, DIS-63); the unresolved-sites counter (DIS-63).
- Typed parameters and local variables (`$order->lineCount()` with `Order $order` gets no edge).
- Inherited methods (`m` declared only in a parent of `X`), `parent::`, `static::`, `?->`,
  `new static`, `new $var`, `$cls::m()`, PHPDoc `@var`, properties typed `self`/`static`.
- Calls inside closures or arrow functions (e.g. the bindings in `AppServiceProvider::register`),
  calls at file top level (other than DIS-49 routes), calls inside anonymous classes.
- Table 2 measurement (CM-HU-22), persistence (DIS-85), TypeScript analyzer (DIS-30). No schema enum
  change, no migration, no new dependency. Never executes or installs anything from the analysed
  repository (PH-19). Fixtures are not modified (PH-22).

## Privacy and logging impact

None: fictitious fixture source only, no identities, no logging. The analyzer keeps reading only the
content it receives.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `code-analysis`: the analysis contract lists a new requirement among those that produce `edges`;
  new requirement "Declared-type calls".

## Impact

- Code: `packages/analyzers/php/src/` — `calls.ts` (new: per-file call facts), `edges.ts`
  (`buildCallEdges`, a method index shared with `buildRouteEdges`), `php-analyzer.ts` (collect call
  facts while the tree is alive). `packages/core/src/ports/AnalyzerPort.ts`: JSDoc only.
- Tests: `tests/unit/analyzers/php/calls.spec.ts` (new); `tests/unit/analyzers/php/edges.spec.ts`
  route test narrowed to `calls` edges whose source is in `routes/api.php` (it asserts exactly two
  `calls` today and would break). Fixtures read-only (PH-22).
- Mutation: Stryker mutates `packages/core/src/**` only; this change adds no core logic, so the
  mutation gate is unaffected (recorded, not skipped).
- Architecture: `core-no-infra`, `analyzers-are-siblings` stay green.
- Docs: `docs/project-context.md` gotcha on PHP edges extended with declared-type `calls`; TypeDoc of
  new exports; `prompts.md`.
- Unblocks DIS-85 (index use case) and DIS-61 (facades/bindings/`__call`).
