# Manual Interface Testing Report

- Date: 2026-10-04
- Change: php-laravel-heuristics-2b
- Step: 9 — Backend: Manual Interface Testing
- Interface: `createPhpAnalyzer().analyze({ files })` (the `AnalyzerPort` implementation of the PHP
  analyzer; no HTTP route or CLI command exists for it).

## Environment and state
- No service to start: the analyzer is an in-process library.
- Pre-test state: `git ls-files -s fixtures/acme-shop | sha1sum` = `167c762e26cdc3ad7b71484c19aa6135dc6c2a8d`.

## Command
`npx tsx <scratchpad>/manual.mts` (scratch script outside the repository, deleted after the run). It
reads the 53 tracked files of `fixtures/acme-shop` (skipping `.git`), calls `analyze`, and prints
the `heuristic` `calls` edges, the Table 2 batch sites, `unresolved`, and four error inputs.

## Success path — acme-shop

```
== acme-shop: 53 files; calls exact=47 heuristic=17
== heuristic calls (edges order):
  app/Http/Controllers/CheckoutController.php#CheckoutController::store -> app/Services/PriceCalculator.php#PriceCalculator::compute
  app/Http/Controllers/OrderController.php#OrderController::show -> app/Models/Order.php#Order::getSubtotalAttribute
  app/Http/Controllers/OrderController.php#OrderController::show -> app/Services/PriceCalculator.php#PriceCalculator::compute
  app/Jobs/RecalculateTotals.php#RecalculateTotals::handle -> app/Services/PriceCalculator.php#PriceCalculator::compute
  app/Listeners/SendOrderConfirmation.php#SendOrderConfirmation::handle -> app/Services/PriceCalculator.php#PriceCalculator::compute
  app/Models/Order.php#Order::getSubtotalAttribute -> app/Models/Order.php#Order::lines
  app/Models/Order.php#Order::lineCount -> app/Models/Order.php#Order::lines
  app/Observers/OrderObserver.php#OrderObserver::created -> app/Jobs/RecalculateTotals.php#RecalculateTotals::handle
  app/Observers/OrderObserver.php#OrderObserver::created -> app/Listeners/SendOrderConfirmation.php#SendOrderConfirmation::handle
  app/Observers/OrderObserver.php#OrderObserver::updated -> app/Jobs/RecalculateTotals.php#RecalculateTotals::handle
  app/Services/DiscountService.php#DiscountService::discountFor -> app/Listeners/RecordDiscountAudit.php#RecordDiscountAudit::handle
  app/Services/DiscountService.php#DiscountService::loyaltyPercent -> app/Models/Order.php#Order::customer
  app/Services/PriceCalculator.php#PriceCalculator::compute -> app/Models/Order.php#Order::getSubtotalAttribute
  app/Services/PriceCalculator.php#PriceCalculator::taxableBase -> app/Models/Order.php#Order::getSubtotalAttribute
  app/Services/ShippingService.php#ShippingService::shippingFor -> app/Services/CarrierGateway.php#CarrierGateway::__call
  routes/web.php#POST /checkout -> app/Http/Controllers/CheckoutController.php#CheckoutController::store
  tests/Feature/OrderPricingTest.php#OrderPricingTest::test_final_price_applies_discount_before_tax -> app/Services/PriceCalculator.php#PriceCalculator::compute
== Table 2 batch sites:
  site 1: PriceCalculator::compute -> DiscountService::discountFor: exact
  site 2: PriceCalculator::compute -> TaxService::taxFor: exact
  site 3: PriceCalculator::compute -> ShippingService::shippingFor: exact
  site 4: PriceCalculator::compute -> Order::getSubtotalAttribute: heuristic
  site 5: DiscountService::discountFor -> CouponValidator::percentFor: exact
  site 6: DiscountService::discountFor -> RecordDiscountAudit::handle: heuristic
  site 7: ShippingService::shippingFor -> CarrierGateway::__call: heuristic
  site 8: OrderController::show -> PriceCalculator::compute: heuristic
  site 9: CheckoutController::store -> PriceCalculator::compute: heuristic
  site 10: OrderObserver::created -> RecalculateTotals::handle: heuristic
  site 11: GET /orders/{order} -> OrderController::show: exact
  site 12: POST /checkout -> CheckoutController::store: heuristic
== acme-shop unresolved: []
```

Checked by hand against `fixtures/README.md`: sites 1, 2, 3, 5 and 11 are `exact`; 4, 6, 7, 8, 9, 10
and 12 are `heuristic`. Site 4 is new and lands on `Order::getSubtotalAttribute`. There are 47 `exact`
and 17 `heuristic` `calls`, and `unresolved` is empty.

## Mutating operations
None: the analyzer writes nothing. The fixture checksum after the run is unchanged (below).

## Error cases

```
== AC3 synthetic input
  calls: ["Emitter::run -> Work::handle (heuristic)","Emitter::run -> Notify::handle (heuristic)"]
  unresolved: ["app/Emitter.php:1 Emitter::run event-no-listener","app/Emitter.php:1 Emitter::run facade-unresolved","app/Emitter.php:1 Emitter::run job-no-handle","routes/web.php:2 GET /a route-action-missing"]
  diagnostics: []
== model read through a nullable parameter, a column and a write
  calls: []
  unresolved: []
  diagnostics: []
== facade with an ambiguous key
  calls: []
  unresolved: ["app/C.php:1 C::run facade-unresolved"]
  diagnostics: []
== route to a class outside the input
  calls: []
  unresolved: ["routes/api.php:3 GET /g route-action-missing"]
  diagnostics: []
```

- The AC3 input gives exactly the four sites of "Unresolved Laravel sites are reported", in order, with
  lines 1 and 2.
- `?Post $n->author`, the column `body` and the write `$p->author = 1` give no edge, and they are not
  sites either: a column is no recognised Laravel pattern.
- An ambiguous binding key gives no edge and one `facade-unresolved` site.
- A route to a class outside the input keeps its route symbol, with no edge and one
  `route-action-missing` site.
- No error case raised an exception or a diagnostic.

## Post-test state
- `git status --porcelain fixtures/acme-shop`: empty.
- `git ls-files -s fixtures/acme-shop | sha1sum`: `167c762e26cdc3ad7b71484c19aa6135dc6c2a8d` (same as before).

## Outcome
- Status: PASS
