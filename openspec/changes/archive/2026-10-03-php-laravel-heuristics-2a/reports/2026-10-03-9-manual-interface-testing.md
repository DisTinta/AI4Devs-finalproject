# Manual Interface Testing Report

- Date: 2026-10-03
- Change: php-laravel-heuristics-2a
- Step: 9 — Backend: Manual Interface Testing

## Interface

The `AnalyzerPort` implementation `createPhpAnalyzer()` (`packages/analyzers/php/src/index.ts`),
called directly as `analyze({ files })`. No HTTP route, CLI command or UI exposes it yet.

## Environment and state before

- `git status --porcelain fixtures/acme-shop`: empty
- `git ls-files -s fixtures/acme-shop | sha1sum`: `167c762e26cdc3ad7b71484c19aa6135dc6c2a8d`
- No database or service involved.

## Commands executed

- `npx tsx <scratchpad>/manual.mts` — a scratch script (not committed, deleted afterwards) that walks
  `fixtures/acme-shop` read-only (skipping `.git`), calls `analyze`, prints the route symbols, the
  counts by kind and resolution, every `heuristic` `calls` edge, the 12 sites of the Table 2 batch of
  `fixtures/README.md`, and five inline error cases.

## Success path (acme-shop)

```
files=53 symbols=121 edges=163 diagnostics=0
route symbols:
  routes/api.php GET /orders 12-12 | Route::get('/orders', [OrderController::class, 'index'])->name('orders.index')
  routes/api.php GET /orders/{order} 13-13 | Route::get('/orders/{order}', [OrderController::class, 'show'])->name('orders.show')
  routes/web.php POST /checkout 13-15 | Route::post('/checkout', 'App\Http\Controllers\CheckoutController@store') ->middleware('cart.not_empty') ->name('checkout.store')
counts by kind/resolution: {"calls/heuristic":11,"calls/exact":47,"describes/heuristic":15,"extends/exact":7,"imports/exact":79,"tested_by/exact":4}
heuristic calls:
  app/Http/Controllers/CheckoutController.php#CheckoutController::store -> app/Services/PriceCalculator.php#PriceCalculator::compute
  app/Http/Controllers/OrderController.php#OrderController::show -> app/Services/PriceCalculator.php#PriceCalculator::compute
  app/Jobs/RecalculateTotals.php#RecalculateTotals::handle -> app/Services/PriceCalculator.php#PriceCalculator::compute
  app/Listeners/SendOrderConfirmation.php#SendOrderConfirmation::handle -> app/Services/PriceCalculator.php#PriceCalculator::compute
  app/Observers/OrderObserver.php#OrderObserver::created -> app/Jobs/RecalculateTotals.php#RecalculateTotals::handle
  app/Observers/OrderObserver.php#OrderObserver::created -> app/Listeners/SendOrderConfirmation.php#SendOrderConfirmation::handle
  app/Observers/OrderObserver.php#OrderObserver::updated -> app/Jobs/RecalculateTotals.php#RecalculateTotals::handle
  app/Services/DiscountService.php#DiscountService::discountFor -> app/Listeners/RecordDiscountAudit.php#RecordDiscountAudit::handle
  app/Services/ShippingService.php#ShippingService::shippingFor -> app/Services/CarrierGateway.php#CarrierGateway::__call
  routes/web.php#POST /checkout -> app/Http/Controllers/CheckoutController.php#CheckoutController::store
  tests/Feature/OrderPricingTest.php#OrderPricingTest::test_final_price_applies_discount_before_tax -> app/Services/PriceCalculator.php#PriceCalculator::compute
Table 2 batch sites:
  site 1: PriceCalculator::compute -> DiscountService::discountFor: exact
  site 2: PriceCalculator::compute -> TaxService::taxFor: exact
  site 3: PriceCalculator::compute -> ShippingService::shippingFor: exact
  site 4: PriceCalculator::compute -> Order::getSubtotalAttribute: ABSENT
  site 5: DiscountService::discountFor -> CouponValidator::percentFor: exact
  site 6: DiscountService::discountFor -> RecordDiscountAudit::handle: heuristic
  site 7: ShippingService::shippingFor -> CarrierGateway::__call: heuristic
  site 8: OrderController::show -> PriceCalculator::compute: heuristic
  site 9: CheckoutController::store -> PriceCalculator::compute: heuristic
  site 10: OrderObserver::created -> RecalculateTotals::handle: heuristic
  site 11: GET /orders/{order} -> OrderController::show: exact
  site 12: POST /checkout -> CheckoutController::store: heuristic
```

Checked by hand against `fixtures/README.md` sites 1–12: 1, 2, 3, 5 and 11 `exact`; 6, 7, 8, 9, 10
and 12 `heuristic` (7 → `CarrierGateway::__call`); 4 absent, as planned (Eloquent is DIS-98). Totals:
47 `exact` + 11 `heuristic` `calls`, as in the delta spec.

## Mutating operations

None: the analyzer writes nothing.

## Error cases

```
string action outside the input / escaped / two @: symbols=[GET /a] calls=[] diagnostics=0
job without handle: symbols=[] calls=[] diagnostics=0
Dispatchable only on the parent: symbols=[] calls=[] diagnostics=0
event without listener: symbols=[] calls=[] diagnostics=0
$listen on a non-event provider: symbols=[] calls=[] diagnostics=0
```

Every case yields no `calls` edge and no diagnostic. In the routes case only `GET /a` becomes a route
(its class is outside the input); the escaped (`'App\\Ghost@run'`) and two-`@` actions produce none.

## State after

- `git status --porcelain fixtures/acme-shop`: empty
- `git ls-files -s fixtures/acme-shop | sha1sum`: `167c762e26cdc3ad7b71484c19aa6135dc6c2a8d` (unchanged)
- Scratch script deleted.

## Outcome

- Status: PASS
- Blocking issues: none
