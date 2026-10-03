# Manual Interface Testing Report

- Date: 2026-10-03
- Change: php-declarative-edges
- Step: 10 — Manual Interface Testing

## Interface

`AnalyzerPort` implementation `createPhpAnalyzer()` (`packages/analyzers/php/src/php-analyzer.ts`).
There is no HTTP route or CLI command for it; it is exercised directly via `analyzer.analyze({ files })`.

## 10.1 Pre-test state

Same indicators as the step 9 report's pre-test baseline:
- `git status --porcelain fixtures`: empty
- `git ls-files -s fixtures/acme-shop | sha1sum`: `167c762e26cdc3ad7b71484c19aa6135dc6c2a8d`

## 10.2 Success path

Scratch script (`manual-interface-test.mjs`, in the scratchpad, not committed), run with
`npx tsx <path>`: reads `fixtures/acme-shop` (skipping `.git`), calls `analyze`, and prints edge
counts per kind/resolution, the `route` symbols, the edges of `routes/api.php`, the `tested_by`
edges and the `describes` edges.

Command: `npx tsx "<scratchpad>/manual-interface-test.mjs"`

Output (success-path section):

```
=== 10.2 Success path: fixtures/acme-shop ===
Edge counts per kind/resolution:
  calls / exact: 2
  describes / heuristic: 15
  extends / exact: 7
  imports / exact: 79
  tested_by / exact: 4
Total edges: 107

route symbols:
  routes/api.php :: GET /orders (lines 12-12) :: Route::get('/orders', [OrderController::class, 'index'])->name('orders.index')
  routes/api.php :: GET /orders/{order} (lines 13-13) :: Route::get('/orders/{order}', [OrderController::class, 'show'])->name('orders.show')

edges of routes/api.php (site 11 of fixtures/README.md):
  GET /orders --calls(exact)--> OrderController::index (app/Http/Controllers/OrderController.php)
  GET /orders/{order} --calls(exact)--> OrderController::show (app/Http/Controllers/OrderController.php)
  routes/api.php --imports(exact)--> OrderController (app/Http/Controllers/OrderController.php)

tested_by edges:
  DiscountService -> DiscountServiceTest (exact)
  PriceCalculator -> PriceCalculatorTest (exact)
  ShippingService -> ShippingServiceTest (exact)
  TaxService -> TaxServiceTest (exact)

describes edges:
  README.md -> Pricing (heuristic, doc-mention)
  README.md -> Coupon (heuristic, doc-mention)
  README.md -> Customer (heuristic, doc-mention)
  README.md -> Order (heuristic, doc-mention)
  README.md -> OrderLine (heuristic, doc-mention)
  README.md -> Product (heuristic, doc-mention)
  README.md -> CarrierGateway (heuristic, doc-mention)
  README.md -> CouponValidator (heuristic, doc-mention)
  README.md -> DiscountService (heuristic, doc-mention)
  README.md -> PriceCalculator (heuristic, doc-mention)
  README.md -> PriceCalculator::compute (heuristic, doc-mention)
  README.md -> ShippingService (heuristic, doc-mention)
  README.md -> TaxService (heuristic, doc-mention)
  README.md -> Money (heuristic, doc-mention)
  README.md -> CreatesApplication (heuristic, doc-mention)
```

Verified against the spec scenarios: 7 `extends`, 79 `imports`, 4 `tested_by`, exactly the 15
`describes` targets of "The acme-shop README describes the symbols it names in code", and site 11 of
`fixtures/README.md` (`routes/api.php` → `OrderController::show`, `exact`, array action) present as
`GET /orders/{order}` → `OrderController::show`.

## 10.3 Mutating operations

None: the analyzer reads its input and returns a result, writing nothing. Confirmed by re-checking
the 10.1 checksum after the script ran:

- `git status --porcelain fixtures`: empty (unchanged)
- `git ls-files -s fixtures/acme-shop | sha1sum`: `167c762e26cdc3ad7b71484c19aa6135dc6c2a8d` (unchanged)

## 10.4 Error cases

Output (error-case section):

```
=== 10.4 Error cases ===

[1] Broken PHP file importing a project class:
  diagnostics: [{"path":"app/Broken.php","message":"syntax error","line":1}]
  edges from/about app/Broken.php: []

[2] Route to a missing controller:
  symbols: [{"kind":"route","name":"POST /ghost"}]
  edges: []

[3] Doc naming an ambiguous short name:
  describes edges (expect none, ambiguous): []

[4] File with two namespace declarations:
  symbols in app/Two.php: ["X","Z"]
  edges originating from app/Two.php (expect none): []
```

1. A broken PHP file that imports a project class (`app/Broken.php`, `use App\Ok;` + syntax error):
   one diagnostic, no edge originates from it — the broken file contributes no fact.
2. A route to an action outside the input (`[Ghost::class, 'run']`, `Ghost` not in the input): the
   `route` symbol is still emitted (`POST /ghost`), but `edges` is empty — no `calls` edge to a target
   that was never resolved.
3. A doc naming an ambiguous short name (`Line` declared twice, in two namespaces): no `describes`
   edge — a name held by more than one symbol never matches.
4. A file declaring two namespaces (`app/Two.php`): both `X` and `Z` still appear as symbols, but no
   edge originates from the file — its facts are discarded (design D2).

## 10.5 Documentation

This report documents every command and its output (above). The scratch script was deleted after use.

## 10.6 Post-test state

Same as 10.1 / 10.3: `git status --porcelain fixtures` empty, checksum
`167c762e26cdc3ad7b71484c19aa6135dc6c2a8d`, unchanged throughout.
