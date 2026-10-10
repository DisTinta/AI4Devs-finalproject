# Manual Interface Testing Report

- Date: 2026-10-10
- Change: context-engine-anchor-expand
- Step: 12. Backend: Manual Interface Testing

No CLI or HTTP entry point uses the Context Engine yet (DIS-39), so it was exercised through a
throwaway `tsx` script in the session scratchpad (never in the repository, deleted afterwards) that
built `createPostgresStore({ pool })` on the local database and called `anchor`, `expand` and
`StorePort.neighbors` against the real acme-shop seed. `DATABASE_URL` was exported from `.env` in a
subshell, without printing it.

## Commands executed

- `export DATABASE_URL="$(. ./.env >/dev/null 2>&1; printf %s "$DATABASE_URL")"`
- `node <scratchpad>/counts.cjs` — row counts before (`project, file, symbol, edge, query_log` all 0)
- `npm run db:seed` — `1 project loaded · acme-shop php/laravel 174 nodes · 170 edges`
- `npx tsx --tsconfig packages/cli/tsconfig.run.json <scratchpad>/manual.mts`
- `node <scratchpad>/restore.cjs` — deletes the sample project `db:seed` loaded, counts before/after
- `rm <scratchpad>/manual.ts <scratchpad>/manual.mts`; `git status --short` (no stray file)

## 12.2 Success path (real seed)

```
anchor Q1 (11): RecalculateTotals, RecalculateTotals::__construct, RecalculateTotals::handle, PriceCalculator,
  PriceCalculator::__construct, PriceCalculator::compute, PriceCalculator::taxableBase, PriceCalculatorTest,
  PriceCalculatorTest::tearDown, PriceCalculatorTest::test_discount_is_applied_before_tax,
  OrderPricingTest::test_final_price_applies_discount_before_tax
anchor coupons (4): StoreOrderRequest::validated, CouponValidator, CouponValidator::percentFor, CouponValidator::isRedeemable
expand PriceCalculator + compute @2 (39 nodes):
  file file:README.md@1
  symbol CheckoutController::store@1
  symbol OrderController::show@1
  symbol RecalculateTotals::handle@1
  symbol SendOrderConfirmation::handle@1
  symbol Order::getSubtotalAttribute@1
  symbol DiscountService::discountFor@1
  symbol ShippingService::shippingFor@1
  symbol TaxService::taxFor@1
  symbol OrderPricingTest::test_final_price_applies_discount_before_tax@1
  symbol PriceCalculatorTest@1
  … 28 nodes at distance 2 (symbols described by README.md, the services' classes, Money, routes …)
expected at distance 1 present: true
seeds absent: true
expand DiscountService @2 (17 nodes): ShippingService.php@1=true DiscountService.php absent=true
```

Q1 anchors `PriceCalculator` and `PriceCalculator::compute` as the scenario requires; the prefix
`calcu` also anchors `RecalculateTotals` (expected recall noise, design Risks — DIS-28 ranks it).
«¿Cómo se validan los cupones?» anchors `CouponValidator` through `valid`, plus
`StoreOrderRequest::validated`. The co-change expansion reaches `app/Services/ShippingService.php` at
distance 1 through the file seed, on the real seed as in the unit scenario.

## 12.3 Directions from `PriceCalculator::compute` at 1 hop

```
out:  Order::getSubtotalAttribute@1, DiscountService::discountFor@1, ShippingService::shippingFor@1, TaxService::taxFor@1
in:   file:README.md@1, CheckoutController::store@1, OrderController::show@1, RecalculateTotals::handle@1,
      SendOrderConfirmation::handle@1, OrderPricingTest::test_final_price_applies_discount_before_tax@1
both: file:README.md@1, CheckoutController::store@1, OrderController::show@1, RecalculateTotals::handle@1,
      SendOrderConfirmation::handle@1, Order::getSubtotalAttribute@1, DiscountService::discountFor@1,
      ShippingService::shippingFor@1, TaxService::taxFor@1, OrderPricingTest::test_final_price_applies_discount_before_tax@1
```

`out` shows only callees; `in` adds the callers and `README.md`; `both` is their union, in the
spec's order (files first, then path, start line, name).

## 12.4 Error cases

```
anchor unknown project -> ProjectNotFound: Project not found: 150c530c-f18e-4076-bac8-fe9e9db11185
anchor not-a-uuid -> ProjectNotFound: Project not found: not-a-uuid
expand hops 4 -> InvalidStoreQuery (argument hops): Invalid store query: hops must be an integer from 1 to 3 (got 4)
neighbors direction sideways -> InvalidStoreQuery (argument direction): Invalid store query: direction must be one of out, in, both (got sideways)
anchor stopwords only -> resolved []
```

## Data state verification

- Pre-test baseline: `project 0, file 0, symbol 0, edge 0, query_log 0`
- After `db:seed`: `project 1, file 53, symbol 121, edge 170, commit 32, file_commit 59, query_log 0`
- The script only reads.
- Restoration: `DELETE FROM project WHERE id = 'a794456d-…' AND is_sample` (1 row; the schema
  cascades files, symbols, edges, commits and file–commit links).
- Post-restoration: `project 0, file 0, symbol 0, edge 0, commit 0, file_commit 0, query_log 0`
- State restored: Yes

## Outcome

- Status: PASS
- Blocking issues: none
