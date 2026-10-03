# Manual Interface Testing Report

- Date: 2026-10-03
- Change: php-laravel-heuristics-1
- Step: 8 — Manual Interface Testing (agent executed)

## Interface

`createPhpAnalyzer()` (`AnalyzerPort`), driven directly. No HTTP route or CLI command exposes it yet.

## State before

- `git status --porcelain fixtures`: empty
- `git ls-files -s fixtures/acme-shop | sha1sum`: `167c762e26cdc3ad7b71484c19aa6135dc6c2a8d`
- No database state involved.

## Commands executed

- `npx tsx <scratchpad>/manual.mts` (scratch script outside the repository, deleted after use). It reads
  `fixtures/acme-shop` with `readFixtureFiles`, calls `analyze`, prints edge counts per kind/resolution,
  the `heuristic` `calls`, the 12 sites of `fixtures/README.md`, then analyses inline inputs for the
  error cases.

## Output — success path (acme-shop)

```
edge counts by kind/resolution: {"calls/heuristic":6,"calls/exact":47,"describes/heuristic":15,"extends/exact":7,"imports/exact":79,"tested_by/exact":4}
heuristic calls:
  CheckoutController::store -> PriceCalculator::compute
  OrderController::show -> PriceCalculator::compute
  RecalculateTotals::handle -> PriceCalculator::compute
  SendOrderConfirmation::handle -> PriceCalculator::compute
  ShippingService::shippingFor -> CarrierGateway::__call
  OrderPricingTest::test_final_price_applies_discount_before_tax -> PriceCalculator::compute
batch sites:
  1 exact
  2 exact
  3 exact
  5 exact
  7 heuristic
  8 heuristic
  9 heuristic
 10 absent
 11 exact
  4 (compute -> Order.php): 0
  6 (discountFor -> app/Listeners): 0
 12 (routes/web.php calls): 0
  AppServiceProvider::register calls: []
```

Checked by hand against `fixtures/README.md` (batch of 12): sites 1, 2, 3, 5 and 11 `exact`; 7, 8 and 9
`heuristic` (site 7 lands on `CarrierGateway::__call`, the only symbol, since `flatRateFor` is not
declared); 4, 6, 10 and 12 still absent (DIS-63). `AppServiceProvider::register` originates no `calls`
(signed non-goal). The 47 `exact` `calls` are unchanged.

## Output — error and edge cases

```
binding present: Client::run -> ["Rates::quote (heuristic)"]; diagnostics []
facade key without binding: Client::run -> []; diagnostics []
ambiguous key: Client::run -> []; diagnostics []
broken provider: Client::run -> []; diagnostics [{"path":"app/Providers/P.php","message":"syntax error","line":1}]
provider closure: P::register -> []; diagnostics []
inherited __call: U::run -> []; diagnostics []
```

All match the spec: no binding, ambiguous key and broken provider give no edge (the broken provider is
reported as a diagnostic, as before); a binding closure originates no edge; an inherited `__call` is not a
target.

## Mutating operations

None: the analyzer writes nothing.

## State after

- `git status --porcelain fixtures`: empty
- `git ls-files -s fixtures/acme-shop | sha1sum`: `167c762e26cdc3ad7b71484c19aa6135dc6c2a8d` (unchanged)
- State restored: not needed.

## Outcome

- Status: PASS
- Blocking issues: none
