# Manual Interface Testing Report

- Date: 2026-10-30
- Change: impact-graph (DIS-89)
- Step: 9 Backend: Manual Interface Testing

## Interface
No CLI command or HTTP route calls `impact` yet (DIS-90 and DIS-95). It was exercised in Git Bash through a throwaway `tsx` script kept in the session scratchpad (never committed, deleted afterwards) that opens the Postgres store on the local database `codemind` (acme-shop and task-api loaded; `npm run cli -- projects` lists both, so `npm run db:seed` was not needed) and calls `impact`.

## Commands executed
- `npm run cli -- projects` (acme-shop `a794456d-...`, task-api `fba8e26b-...`)
- `npx tsx --import=./scripts/load-env.mjs --tsconfig packages/cli/tsconfig.run.json <scratchpad>/impact-manual.mts`
- `docker exec codemind-postgres-1 psql -U codemind -d codemind -tA -c "select count(*) ..."` before and after

## Success path (compact output; `@n` is `hops`, `~` is `heuristic`)
- `cambiar los descuentos de DiscountService`, `maxHops` 1:
  - direct: `DiscountApplied@0, DiscountService@0, RecordDiscountAudit@0, PriceCalculator@1, app/Providers/AppServiceProvider.php@1, app/Providers/EventServiceProvider.php@1`
  - indirect: (empty)
  - tests: `DiscountServiceTest, PriceCalculatorTest`
- `maxHops` 2 (and without `maxHops`, identical): same direct; indirect `CheckoutController@2~, OrderController@2~, RecalculateTotals@2~, SendOrderConfirmation@2~`; tests `DiscountServiceTest, OrderPricingTest, PriceCalculatorTest`
- `maxHops` 3: indirect adds `GET /orders/{order}@3~, OrderObserver@3~, POST /checkout@3~`
- Literal text `cambiar el cálculo de descuentos`, 2 hops: direct `PriceCalculator@0, RecalculateTotals@0, app/Providers/AppServiceProvider.php@1, CheckoutController@1~, OrderController@1~, OrderObserver@1~, SendOrderConfirmation@1~`; indirect two routes; `DiscountService` is not in the report (the lexical limit, design D7)

These match the seed scenarios of the spec (they say "holds"): `DiscountService` at 0 and `PriceCalculator` at 1 `exact`, the four callers at 2 `heuristic`, the three tests, and `OrderObserver` only with 3 hops. `DiscountApplied` and `RecordDiscountAudit` at 0 are the accepted over-reach of the prefix `disco` (design Risks).

## Error cases
- `maxHops` 4: `InvalidImpactRequest field=maxHops: Invalid impact request: maxHops`
- `change` of 4 characters: `InvalidImpactRequest field=change: Invalid impact request: change` (the value is absent from the message)
- random UUID: `ProjectNotFound: Project not found: <uuid>`
- `not-a-uuid`: `ProjectNotFound: Project not found: not-a-uuid`
- `cómo se gestionan los reembolsos`: `{"status":"unknown","reason":"no-anchor"}`

## Data state
- Counts before: project 2, symbol 185, edge 270, query_log 0. After: 2, 185, 270, 0. `impact` writes nothing.
- The scratchpad script was deleted; `git status` shows only the change's files; `node scripts/dev-processes.mjs stop` reported no process left.

## PowerShell check for the author (task 9.6)
None is needed: the change touches neither the CLI nor `docs/DEMO.md`. Design Follow-ups E9 (destination C) records it.

## End-to-End Testing (task 9.7)
Not applicable: the change reaches no user interface.

## Outcome
- Status: PASS
- Blocking issues: none
