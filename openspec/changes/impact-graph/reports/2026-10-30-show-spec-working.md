# Show spec working: impact-graph (DIS-89)

- Date: 2026-10-30
- Change: impact-graph, PR #90
- Step: 12.3 (`/show-spec-working`, review step of the autonomous run)

## Interface

No CLI command or HTTP route calls `impact` yet (DIS-90 and DIS-95), so the real interface is the
core use case over the real Postgres adapter. It was exercised in Git Bash through a throwaway `tsx`
script in the session scratchpad (never committed, deleted afterwards) that opens
`createPostgresStore({ pool })` on the local database `codemind` (acme-shop and task-api loaded from
`seeds/graph-dump.sql`) and calls `impact(store, request)`:

```
npx tsx --import=./scripts/load-env.mjs --tsconfig packages/cli/tsconfig.run.json <scratchpad>/impact-show.mts
```

The 20 unit scenarios over the in-memory double and the 2 integration scenarios over the seed were
also run (`npx vitest run tests/unit/impact tests/integration/impact`, the integration file on the
auxiliary database `codemind_it`, design A1): 5 files, 38 tests passed, none skipped.

## Demonstrated

`Q2` is `cambiar los descuentos de DiscountService` in the acme-shop project. `@n` is `hops`, `~` is
`heuristic`.

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| Q2 is reproduced over the seed | Q2, `maxHops` 2 | `answered`; `DiscountService@0`, `PriceCalculator@1` exact; the four callers `@2~`; tests `DiscountServiceTest`, `OrderPricingTest`, `PriceCalculatorTest`; no `OrderObserver`; every origin `graph` | yes | run `maxHops 2` |
| A dependant three hops away needs three hops | Q2, `maxHops` 3 | `OrderObserver@3~` in `indirect` | yes | run `maxHops 3` |
| Only dependants within the hop limit are reported | Q2, `maxHops` 1 | `indirect` empty, `PriceCalculator@1` | yes (on the seed too) | run `maxHops 1` |
| Tests come from the walk and from the classes of direct components | Q2, `maxHops` 1 | tests exactly `DiscountServiceTest`, `PriceCalculatorTest` | yes (on the seed too) | run `maxHops 1` |
| The hop count defaults to two | Q2 without `maxHops` | equal to the `maxHops` 2 report (`JSON.stringify` equality) | yes | `default equals maxHops 2: true` |
| The literal Q2 text does not anchor the discount service | `cambiar el cálculo de descuentos`, 2 | `PriceCalculator@0`, no `DiscountService` | yes | run `literal Q2` |
| A change that anchors nothing answers no-anchor | `cómo se gestionan los reembolsos` | `{"status":"unknown","reason":"no-anchor"}` | yes | run `no anchor` |
| An out-of-range hop count is rejected before any read | `maxHops` 4, 0, 1.5 | `InvalidImpactRequest` `maxHops` each time | yes | runs `maxHops 4/0/1.5` |
| An invalid change is rejected before any read | 4 chars, 501 chars, only spaces, with U+0000 | `InvalidImpactRequest` `change`; the message is `Invalid impact request: change`, without the value | yes | runs `change ...` |
| Impact in an unknown project fails | random well-formed UUID; `not-a-uuid` | `ProjectNotFound` both | yes | runs `unknown project`, `malformed project` |
| (extra) unknown field | `extra: 1` | `InvalidImpactRequest` `request` | yes (requirement text) | run `unknown field` |

The small-graph scenarios (component, file node, own file, relevance, file-to-file tests) need graphs
the seed does not hold; they are demonstrated by their unit tests over the in-memory double, all
green.

## Evidence

```
maxHops 1: status=answered origins=graph
  direct: DiscountApplied@0, DiscountService@0, RecordDiscountAudit@0, PriceCalculator@1, app/Providers/AppServiceProvider.php@1, app/Providers/EventServiceProvider.php@1
  indirect: (empty)
  tests: DiscountServiceTest, PriceCalculatorTest
maxHops 2: status=answered origins=graph
  direct: DiscountApplied@0, DiscountService@0, RecordDiscountAudit@0, PriceCalculator@1, app/Providers/AppServiceProvider.php@1, app/Providers/EventServiceProvider.php@1
  indirect: CheckoutController@2~, OrderController@2~, RecalculateTotals@2~, SendOrderConfirmation@2~
  tests: DiscountServiceTest, OrderPricingTest, PriceCalculatorTest
no maxHops: status=answered origins=graph
  (identical to maxHops 2)
default equals maxHops 2: true
maxHops 3: status=answered origins=graph
  direct: DiscountApplied@0, DiscountService@0, RecordDiscountAudit@0, PriceCalculator@1, app/Providers/AppServiceProvider.php@1, app/Providers/EventServiceProvider.php@1
  indirect: CheckoutController@2~, OrderController@2~, RecalculateTotals@2~, SendOrderConfirmation@2~, GET /orders/{order}@3~, OrderObserver@3~, POST /checkout@3~
  tests: DiscountServiceTest, OrderPricingTest, PriceCalculatorTest
literal Q2: status=answered origins=graph
  direct: PriceCalculator@0, RecalculateTotals@0, app/Providers/AppServiceProvider.php@1, CheckoutController@1~, OrderController@1~, OrderObserver@1~, SendOrderConfirmation@1~
  indirect: GET /orders/{order}@2~, POST /checkout@2~
  tests: PriceCalculatorTest, OrderPricingTest
no anchor: {"status":"unknown","reason":"no-anchor"}
only tests: status=answered origins=graph
  direct: DiscountApplied@0, DiscountService@1, app/Listeners/RecordDiscountAudit.php@1, app/Providers/EventServiceProvider.php@1
  indirect: PriceCalculator@2
  tests: DiscountServiceTest
maxHops 4: InvalidImpactRequest field=maxHops: Invalid impact request: maxHops
maxHops 0: InvalidImpactRequest field=maxHops: Invalid impact request: maxHops
maxHops 1.5: InvalidImpactRequest field=maxHops: Invalid impact request: maxHops
change 4 chars: InvalidImpactRequest field=change: Invalid impact request: change
change 501 chars: InvalidImpactRequest field=change: Invalid impact request: change
change only spaces: InvalidImpactRequest field=change: Invalid impact request: change
change with NUL: InvalidImpactRequest field=change: Invalid impact request: change
unknown field: InvalidImpactRequest field=request: Invalid impact request: request
unknown project: ProjectNotFound: Project not found: 00000000-0000-4000-8000-000000000000
malformed project: ProjectNotFound: Project not found: not-a-uuid
```

Note on `only tests` (`tocar applies`): the scenario "A change that anchors only tests answers
no-anchor" is stated over the acme-shop **subset**, where `applies` names only the test method. On
the full seed the 5-character prefix `appli` also anchors `DiscountApplied`, so the answer is
`answered`. That is the accepted over-reach of the lexical anchor (design Risks, D7), not a
deviation: the unit test over the subset is green.

No screenshot: the change has no user interface.

## State

- Before: `project` 2, `symbol` 185, `edge` 270, `query_log` 0 (database `codemind`); `codemind_it`
  holds 0 projects.
- After: `project` 2, `symbol` 185, `edge` 270, `query_log` 0; `codemind_it` 0 projects (the
  integration spec runs in a reverted transaction).
- Restored: yes, nothing to restore (`impact` only reads). The scratchpad script was deleted.

## Not demonstrated

- Nothing through a CLI or HTTP interface: none exists yet (DIS-90, DIS-95).
- The small-graph scenarios only through their unit tests (the seed holds no such graph).

## Handoff

The change is demonstrably working: every seed scenario and every error scenario matches its `THEN`
over the real Postgres adapter, and no file was left at the repository root.
