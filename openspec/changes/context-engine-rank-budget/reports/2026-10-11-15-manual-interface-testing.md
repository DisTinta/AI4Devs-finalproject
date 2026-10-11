# Manual Interface Testing Report

- Date: 2026-10-11
- Change: context-engine-rank-budget
- Step: 15. Backend: Manual Interface Testing

No CLI or HTTP entry point uses the Context Engine yet (DIS-39), so it was exercised with a throwaway
script, `tmp/manual-pack.mts` (`tmp/` is gitignored; deleted afterwards), run with
`npx tsx --tsconfig packages/cli/tsconfig.run.json tmp/manual-pack.mts <repo root>`. It used the real
adapters: `createPostgresStore({ pool })` on the local database and the git source tree (through
`gitSourceTreeWith` with a counting launcher), with `workspaceRoot` = the absolute repository root.
OS user name masked as `<user>`.

## Environment and data state

- Local database before the step: `project` 0, `file` 0, `symbol` 0, `edge` 0, `query_log` 0.
- `DATABASE_URL=… npm run db:seed` → `1 project loaded`, `acme-shop php/laravel 174 nodes · 170 edges`;
  counts 1, 53, 121, 170, 0.
- `fixtures/acme-shop/.git` `HEAD` = `4f028db4…` = the seed's `indexed_commit`; the seed's
  `root_path` is the relative `fixtures/acme-shop`, resolved against `workspaceRoot`.

## Success path

`¿Cómo se calcula el precio final de un pedido?`, budget 8000:

```
status=ok tokens=4330 baselineTokens=7123 tokenBudget=8000 omitted=0 estimator=chars-div-4
  anchor    d=0 test   tests/Unit/PriceCalculatorTest.php:21-57 PriceCalculatorTest tokens=332
  anchor    d=0 test   tests/Feature/OrderPricingTest.php:31-51 OrderPricingTest::test_final_price_applies_discount_before_tax tokens=243
  anchor    d=0 source app/Jobs/RecalculateTotals.php:20-39 RecalculateTotals tokens=110
  anchor    d=0 source app/Services/PriceCalculator.php:16-44 PriceCalculator tokens=229
  heuristic d=2 source app/Services/DiscountService.php:21-66 DiscountService tokens=332
  heuristic d=2 source app/Services/ShippingService.php:16-35 ShippingService tokens=141
  heuristic d=2 source app/Services/TaxService.php:18-28 TaxService tokens=85
  …  (34 spans in all; README.md:1-43 as a whole-file span, origin heuristic, d=1)
  time=8510 ms, git processes (ls-tree + cat-file)=58
```

- `app/Services/PriceCalculator.php` appears once, lines 16–44; `PriceCalculator::compute` has no span
  of its own; `RecalculateTotals::handle` is held by the anchored class span `RecalculateTotals`.
- Saving shown by the pack: 4330 tokens sent against 7123 for the whole redacted files.

Same question, budget 1000: `status=ok tokens=999 baselineTokens=1639 omitted=42`; the four anchor
spans plus `TaxService` (85 tokens). Never over the budget.

`¿Cómo se validan los cupones?`, budget 8000: `status=ok tokens=2745 baselineTokens=4422 omitted=0`,
anchored on `CouponValidator` and `StoreOrderRequest::validated`.

`neighbors` of `PriceCalculator::compute` at 2 hops, `both`: every result carries `resolution` and
the symbols carry `fileKind`, for example `DiscountService::discountFor (source)` `exact` at d=1,
`OrderPricingTest::test_final_price_applies_discount_before_tax (test)` `heuristic` at d=1,
`README.md (doc)` `heuristic` at d=1, `DiscountApplied::__construct` `exact` at d=2.

## Error cases

```
no anchor: status=empty reason=no-anchor tokens=0 baselineTokens=0 tokenBudget=8000 omitted=0 estimator=chars-div-4
tokenBudget 999: RangeError message=tokenBudget must be an integer from 1000 to 32000
workspaceRoot repo: RangeError message=workspaceRoot must be an absolute path
hops 4: InvalidStoreQuery code=INVALID_STORE_QUERY argument=hops message=Invalid store query: hops must be an integer from 1 to 3 (got 4)
unknown project: ProjectNotFound code=PROJECT_NOT_FOUND message=Project not found: 00000000-0000-4000-8000-000000000000
readFileAt missing path: SourceUnavailable code=SOURCE_UNAVAILABLE reason=missing message=Source unavailable: missing: app/Nope.php
```

No message carries file content.

## Observations for the author (not failures against the spec)

1. **A replacing span takes the container's origin and distance.** At hops 2, the class
   `DiscountService` (d=2, heuristic) contains `DiscountService::discountFor` (d=1, exact), which was
   included first; the class replaces it in the method's place, as the spec says, but the span then
   reports `heuristic d=2` and the pack spends 332 tokens on the whole class. Both follow design D8
   and decision 7; whether the replacing span should keep the best origin and distance of what it
   replaces is a product question for the pre-merge review.
2. **Latency.** One pack read 29 distinct files: 58 counted git processes (`ls-tree` + `cat-file`
   per file) plus the per-call repository checks, about 8.5 s on this Windows machine. Within the
   design's bound (a few processes per distinct file, D5 risk), but slow for an interactive question;
   checking the root once per pack or batching reads is the declared later optimisation.

## Restoration

- `DELETE FROM project WHERE is_sample AND name = 'acme-shop'` (cascade) → 1 row; counts back to 0,
  0, 0, 0, 0, the state before the step. `fixtures/` untouched (`git status --porcelain fixtures`
  empty). `tmp/manual-pack.mts` deleted; `git status` shows no stray file of this step.

## Outcome

- Status: PASS
- Blocking issues: none
