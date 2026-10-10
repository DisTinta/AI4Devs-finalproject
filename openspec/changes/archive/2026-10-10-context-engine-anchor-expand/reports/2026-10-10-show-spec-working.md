# Show Spec Working

- Date: 2026-10-10
- Change: context-engine-anchor-expand (DIS-27, PR #33)

The Context Engine has no CLI or HTTP entry point yet (DIS-39), so its real interface is the public
API of `@codemind/core` (`questionTerms`, `anchor`, `expand`) over the real store adapter
(`createPostgresStore`) and `StorePort.neighbors`. Every scenario below was run against the local
Postgres with the real acme-shop seed loaded (`npm run db:seed`), by a throwaway `tsx` script in the
session scratchpad (never in the repository, deleted afterwards). The script wrapped the store to
count `findSymbols` / `neighbors` calls and the client to count SQL statements. `DATABASE_URL` was
exported from `.env` in a subshell, without printing it. Step 12's manual report
(`2026-10-10-12-manual-interface-testing.md`) holds the full node lists of the same run shape.

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| The terms of a question include the prefixes of long tokens | `questionTerms('¿Cómo se calcula el precio final de un pedido?')` | `calcula, calcu, precio, preci, final, pedido, pedid` | yes | line 2 |
| Diacritics do not change the terms | `questionTerms('cupón')`, `questionTerms('cupon')` | `["cupon"]` both | yes | line 3 |
| A question is anchored on the symbols its words name | `anchor(store, acme, Q1)` | includes `PriceCalculator::compute`, `PriceCalculator` (11 symbols) | yes | line 4 |
| A prefix anchors a Spanish verb on an English identifier | `anchor(store, acme, '¿Cómo se validan los cupones?')` | includes `CouponValidator` | yes | line 5 |
| A question without terms anchors nothing and does not search | `anchor(store, acme, '¿Qué es el de un?')` | `[]`, 0 searches | yes | line 6 |
| A question whose terms match nothing anchors nothing | `anchor(store, acme, '¿Dónde vive el ornitorrinco?')` | `[]` (3 searches) | yes | line 7 |
| Anchoring in an unknown project fails | `anchor` with a random UUID and `not-a-uuid` | `ProjectNotFound` both | yes | line 8 |
| The anchor expands to its tests, docs, callers and callees | `expand(store, acme, [PriceCalculator, compute], 2)` | 39 nodes, the six required at distance 1, no seed, no `docs/pricing.md`, 1 traversal | yes | line 9 |
| An anchor reaches the files co-changed with its own file | `expand(store, acme, [DiscountService], 2)` (anchor from `findSymbols`) | `file:app/Services/ShippingService.php@1`; `DiscountService.php` absent | yes | line 10 |
| The expansion never leaves the project | second project `acme-shop-copy-demo` saved with the acme-shop subset; expand in acme-shop at 3 hops | 57 nodes, 0 belong to the copy | yes | line 11 |
| An invalid hop count is rejected | `expand(…, 0)`, `expand(…, 4)` | `InvalidStoreQuery(hops)` both | yes | line 12 |
| An empty anchor expands to nothing without traversing | `expand(store, acme, [], 2)` | `[]`, 0 traversals | yes | line 13 |
| Edges are followed from source to target only | `neighbors(compute, 1)` with no direction and with `'out'` | identical, callees only | yes | line 14 |
| Incoming edges are followed with direction in | `neighbors(compute, 1, ['describes'], 'in' / 'out')` | `in` = `file:README.md@1`; `out` = `[]` | yes | line 15 |
| Edges are followed both ways with direction both | `neighbors(file ShippingService.php, 1, ['co_changed'], 'both' / 'out')` | `both` = `file:app/Services/DiscountService.php@1`; `out` = `[]` | yes | line 16 |
| The traversal is one statement | `neighbors([compute, its file], 3, _, dir)` for each direction, counting statements | `out=1 in=1 both=1` | yes | line 17 |
| A symbol result carries the id of its file | `findSymbols('DiscountService')`, traversal reaching `DiscountService::discountFor`, then the file id as seed | same file id in both, equal to the file row; seed reaches `ShippingService.php@1` | yes | line 18 |
| An invalid traversal direction is rejected before querying | `neighbors(…, 'sideways')` | `InvalidStoreQuery(direction)`, 0 statements | yes | line 19 |

The seed's `co_changed` edge goes from `DiscountService.php` to `ShippingService.php`, so on the real
data the `both` scenario is shown from `ShippingService.php` (its target): `out` finds nothing and
`both` finds `DiscountService.php`, which is the scenario's shape with real files.

## Evidence

Script output, verbatim (numbered by line for the table):

```
 1 acme-shop project a794456d-6d1b-5b55-a360-13fec83dc7bc
 2 PASS | The terms of a question include the prefixes of long tokens | ["calcula","calcu","precio","preci","final","pedido","pedid"]
 3 PASS | Diacritics do not change the terms | ["cupon"] / ["cupon"]
 4 PASS | A question is anchored on the symbols its words name | RecalculateTotals, RecalculateTotals::__construct, RecalculateTotals::handle, PriceCalculator, PriceCalculator::__construct, PriceCalculator::compute, PriceCalculator::taxableBase, PriceCalculatorTest, PriceCalculatorTest::tearDown, PriceCalculatorTest::test_discount_is_applied_before_tax, OrderPricingTest::test_final_price_applies_discount_before_tax
 5 PASS | A prefix anchors a Spanish verb on an English identifier | StoreOrderRequest::validated, CouponValidator, CouponValidator::percentFor, CouponValidator::isRedeemable
 6 PASS | A question without terms anchors nothing and does not search | anchor=[] searches=0
 7 PASS | A question whose terms match nothing anchors nothing | anchor=[] searches=3
 8 PASS | Anchoring in an unknown project fails | ProjectNotFound / ProjectNotFound
 9 PASS | The anchor expands to its tests, docs, callers and callees | 39 nodes; missing=[]; forbidden present=[]; traversals=1
10 PASS | An anchor reaches the files co-changed with its own file | fileId=e550ad1b-a1c7-5c89-b13f-6fd19f308451 (app/Services/DiscountService.php); ShippingService.php@1=true
11 PASS | The expansion never leaves the project | 57 nodes at 3 hops; nodes of the copy project: 0
12 PASS | An invalid hop count is rejected | InvalidStoreQuery(hops) / InvalidStoreQuery(hops)
13 PASS | An empty anchor expands to nothing without traversing | result=[] traversals=0
14 PASS | Edges are followed from source to target only | default=out: Order::getSubtotalAttribute@1, DiscountService::discountFor@1, ShippingService::shippingFor@1, TaxService::taxFor@1
15 PASS | Incoming edges are followed with direction in | in=["file:README.md@1"] out=[]
16 PASS | Edges are followed both ways with direction both | both=["file:app/Services/DiscountService.php@1"] out=[]
17 PASS | The traversal is one statement | out=1 in=1 both=1
18 PASS | A symbol result carries the id of its file | search fileId=e550ad1b-a1c7-5c89-b13f-6fd19f308451; traversal fileId=e550ad1b-a1c7-5c89-b13f-6fd19f308451; from file: ["file:app/Services/ShippingService.php@1"]
19 PASS | An invalid traversal direction is rejected before querying | InvalidStoreQuery(direction); statements sent=0
20 cleanup: deleted copy project rows=1
21
22 18/18 scenarios matched
```

A first attempt failed before the isolation scenario with `SAVEPOINT can only be used in transaction
blocks`: the demo had written the copy project through a store in `{ transaction }` mode on a client
with no open transaction, which that mode requires (documented behaviour, not a defect). Nothing was
written; the rerun writes the copy through a `{ pool }` store.

No screenshots: the change has no browser UI.

## State

- Before: `project 0, file 0, symbol 0, edge 0, query_log 0`.
- During: `npm run db:seed` → `project 1, file 53, symbol 121, edge 170, commit 32, file_commit 59`;
  the copy project for the isolation scenario was created and deleted by the script (`rows=1`).
- After: `DELETE FROM project WHERE id = 'a794456d-…' AND is_sample` (1 row, cascades) →
  `project 0, file 0, symbol 0, edge 0, commit 0, file_commit 0, query_log 0`.
- Restored: yes.

## Not demonstrated

The unchanged `graph-store` scenarios copied into the MODIFIED requirements (symbol search ordering,
wildcards, cycles, hop limit, minimum distance, crossing files and symbols, file seed, kinds, seeds,
unknown seeds, unknown project, reindex validity, the other invalid arguments, the cost-sum instant)
were not re-demonstrated by hand: their behaviour is unchanged by this change and their Postgres
integration tests run green (`tests/integration/store/graph-read.spec.ts`, 33/33).

## Handoff

The change is demonstrably working: the 12 `context-engine` scenarios and the 6 new or changed
`graph-store` scenarios match their `THEN` exactly against the real store and the real seed, and the
database is back to its pre-test state. No screenshot or other file was left at the repository root.
