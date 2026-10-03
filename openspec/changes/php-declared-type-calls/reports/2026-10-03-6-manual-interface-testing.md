# Manual Interface Testing Report

- Date: 2026-10-03
- Change: php-declared-type-calls (DIS-52)
- Step: 6 — Backend: Manual Interface Testing

## Interface exercised

`createPhpAnalyzer().analyze({ files })` — the `AnalyzerPort` implementation. There is no HTTP route
or CLI command for it yet (indexing CLI is DIS-85/CM-HU-05a.3).

## State before

- `git status --porcelain fixtures`: empty
- `git ls-files -s fixtures/acme-shop | sha1sum`: `167c762e26cdc3ad7b71484c19aa6135dc6c2a8d`
- No database entity involved.

## Commands executed

- Scratch script `manual-calls.mts` in the session scratchpad (not in the repo), reading the 53 files
  of `fixtures/acme-shop` (`.git` skipped) and calling `analyze`:
  `npx tsx <scratchpad>/manual-calls.mts`
- The script was deleted after the run.

## Success path — acme-shop

```
files=53 symbols=120 edges=152
per kind/resolution: { 'calls/exact': 47, 'describes/heuristic': 15, 'extends/exact': 7,
                       'imports/exact': 79, 'tested_by/exact': 4 }
```

`calls` edges by source (abridged to the sources that matter for `fixtures/README.md`):

```
PriceCalculator::compute     -> DiscountService::discountFor, ShippingService::shippingFor, TaxService::taxFor
PriceCalculator::taxableBase -> DiscountService::discountFor
DiscountService::discountFor -> DiscountApplied::__construct, CouponValidator::percentFor,
                                DiscountService::loyaltyPercent, DiscountService::volumeBonus, Money::zero
ShippingService::shippingFor -> Money::fromCents, Money::fromFloat, Money::zero
OrderObserver::created       -> OrderPlaced::__construct
GET /orders                  -> OrderController::index
GET /orders/{order}          -> OrderController::show
```

Other sources: `Money::{add,fromCents,fromFloat,percentage,subtract,zero}` → `Money::__construct`
(`new self`), `Money::{add,subtract,isGreaterThan}` → `Money::assertSameCurrency`,
`StoreOrderRequest::lines` → `StoreOrderRequest::validated` (declared override in the same class),
`Order::getSubtotalAttribute` / `OrderLine::lineTotal` / `Product::price` → `Money` statics,
`CouponValidator::isRedeemable` → `CouponValidator::percentFor`, and the unit tests' `new X(...)` /
`Money::*` / own helpers (`DiscountServiceTest::orderWith`). All `exact`.

Check against the Table 2 seed of `fixtures/README.md`:

| Site | Expected | Observed |
|---|---|---|
| 1 `compute` → `discountFor` | exact | exact ✔ |
| 2 `compute` → `taxFor` | exact | exact ✔ |
| 3 `compute` → `shippingFor` | exact | exact ✔ |
| 4 `compute` → `Order::$subtotal` | heuristic | no edge ✔ (out of scope here) |
| 5 `discountFor` → `percentFor` | exact | exact ✔ |
| 6 `discountFor` → listeners | heuristic | no edge ✔ |
| 7 `shippingFor` → `CarrierGateway::flatRateFor` | heuristic | no edge, no `__call` ✔ |
| 8 `OrderController::show` → `compute` | heuristic | no edge ✔ |
| 9 `CheckoutController::store` → `compute` | heuristic | no edge ✔ |
| 10 `OrderObserver::created` → `RecalculateTotals::handle` | heuristic | no edge ✔ |
| 11 `routes/api.php` → `OrderController::show` | exact | exact ✔ (DIS-49) |
| 12 `routes/web.php` → `CheckoutController::store` | heuristic | no edge ✔ |

`AppServiceProvider::register` originates no `calls` (its `new X` are inside arrow functions);
`ShippingServiceTest`'s `new CarrierGateway()` gives no edge (no `__construct` declared).

## Mutating operations

None: the analyzer writes nothing.

## Error cases

```
broken file calling a project class: calls=[] diagnostics=[{"path":"app/Broken.php","message":"syntax error","line":1}]
call through a nullable property:    calls=[] diagnostics=[]
method only inherited from a parent: calls=[] diagnostics=[]
__call-handled method:               calls=[] diagnostics=[]
```

## State after

- `git status --porcelain fixtures`: empty
- `git ls-files -s fixtures/acme-shop | sha1sum`: `167c762e26cdc3ad7b71484c19aa6135dc6c2a8d` (unchanged)

## Outcome

- Status: PASS
- Blocking issues: none
