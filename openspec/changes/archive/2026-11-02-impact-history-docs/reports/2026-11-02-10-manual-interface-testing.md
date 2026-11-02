# Manual Interface Testing Report

- Date: 2026-11-02
- Change: impact-history-docs
- Step: 10. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

*Agent's text: written by the agent of the autonomous run (`docs/AUTONOMOUS-RUN.md` §6), without the author. Every command ran in Git Bash against the local `codemind` database (Postgres in Docker), which holds the seed; the OS user name does not appear in any output.*

## Commands executed

Start (task 10.1): `npm run cli -- projects` lists `acme-shop` and `task-api`. `query_log` before: `impact` 2, at 2026-11-02T11:11:03Z.

### Success path (task 10.2)

`npm run cli -- impact acme-shop "cambiar los descuentos de DiscountService"` → exit `0`:

```text
DIRECTO
  DiscountApplied  app/Events/DiscountApplied.php  0 saltos  exact  [grafo]
  DiscountService  app/Services/DiscountService.php  0 saltos  exact  [grafo]
  RecordDiscountAudit  app/Listeners/RecordDiscountAudit.php  0 saltos  exact  [grafo]
  PriceCalculator  app/Services/PriceCalculator.php  1 salto  exact  [grafo]
  app/Providers/AppServiceProvider.php  1 salto  exact  [grafo]
  app/Providers/EventServiceProvider.php  1 salto  exact  [grafo]

INDIRECTO
  CheckoutController  app/Http/Controllers/CheckoutController.php  2 saltos  heuristic  [grafo]
  OrderController  app/Http/Controllers/OrderController.php  2 saltos  heuristic  [grafo]
  RecalculateTotals  app/Jobs/RecalculateTotals.php  2 saltos  heuristic  [grafo]
  SendOrderConfirmation  app/Listeners/SendOrderConfirmation.php  2 saltos  heuristic  [grafo]

TESTS
  DiscountServiceTest  tests/Unit/DiscountServiceTest.php  [grafo]
  OrderPricingTest  tests/Feature/OrderPricingTest.php  [grafo]
  PriceCalculatorTest  tests/Unit/PriceCalculatorTest.php  [grafo]

DOCUMENTACIÓN
  README.md  al día

HISTORIAL
  app/Services/ShippingService.php  co-cambia 100 %  PR #24, #33, #55  [git]

RIESGO HIGH
10 ficheros afectados, 3 tests que cubren el cambio, 4 elementos directos sin test, 0 elementos directos con cadena solo heurística.
```

As the specs expect: `README.md  al día`, the `ShippingService.php` line with `[git]` and the DIS-90 rationale.

`… impact acme-shop "cambiar los descuentos de DiscountService" --max-hops 1` → exit `0`; `DOCUMENTACIÓN` and `HISTORIAL` the same two lines; `RIESGO HIGH`, `6 ficheros afectados, 2 tests que cubren el cambio, 4 elementos directos sin test, 0 elementos directos con cadena solo heurística.`

`… impact acme-shop "cambiar el cálculo de descuentos"` (the literal Q2 text, design R1-QA2) → exit `0`; `DOCUMENTACIÓN` `  README.md  al día`, `HISTORIAL` `  (ninguno)` (the anchor is `PriceCalculator`, whose file has no `co_changed` edge); `RIESGO HIGH`, `9 ficheros afectados, 2 tests que cubren el cambio, 6 elementos directos sin test, 4 elementos directos con cadena solo heurística.`

`… impact task-api "cambiar TaskService"` → exit `0`; `HISTORIAL` exactly `  src/schemas/task.schema.ts  co-cambia 75 %  PR #15, #31, #40  [git]` as design R2-5c says; `DOCUMENTACIÓN` `  README.md  al día` (not fixed by the spec, design Follow-ups A5); `RIESGO HIGH`, `15 ficheros afectados, 4 tests que cubren el cambio, 9 elementos directos sin test, 0 elementos directos con cadena solo heurística.`

### Stale path by hand (task 10.3)

Inserted (committed), through `docker exec … psql`, one commit of acme-shop with sha `eeee…eeee` (40 `e`) dated 2024-05-10T12:00:00Z and its `file_commit` row to `app/Services/PriceCalculator.php`. The Q2 command → exit `0`:

```text
DOCUMENTACIÓN
  README.md  desactualizado desde eeeeeee

HISTORIAL
  app/Services/ShippingService.php  co-cambia 100 %  PR #24, #33, #55  [git]

RIESGO HIGH
10 ficheros afectados, 3 tests que cubren el cambio, 4 elementos directos sin test, 0 elementos directos con cadena solo heurística, 1 documento desalineado.
```

Then deleted exactly that `file_commit` row and that `commit` row (`DELETE 1` each). The level is `HIGH`, not `MEDIUM`, because Q2 has four direct components without a test: a stale document never lowers or raises a `HIGH`; the rationale ends as the spec says.

### Error cases (task 10.4)

- `… impact acme-shop "cambiar los descuentos de DiscountService" --max-hops 4` → exit `2`: `{"error":{"code":"INVALID_IMPACT_REQUEST","message":"invalid impact request","details":{"field":"maxHops"}}}`
- `… impact no-existe "cambiar algo"` → exit `1`: `{"error":{"code":"PROJECT_NOT_FOUND","message":"project not found","details":{}}}`
- `… impact acme-shop "cómo se gestionan los reembolsos"` → exit `0`: `UNKNOWN (no-anchor)`, no `DOCUMENTACIÓN`.

### Mutating effect (task 10.5)

Six calls returned a report (five answered, one `UNKNOWN`) and wrote six `query_log` rows with `capability = 'impact'`. Deleted with `DELETE FROM query_log WHERE capability = 'impact' AND created_at >= '2026-11-02T11:11:00Z'` (`DELETE 6`). Counts after: `project` 2, `commit` 60, `file_commit` 102, `edge` 270, `impact` 2, as in the baseline. `git status` shows no stray file; `node scripts/dev-processes.mjs stop` reports no process.

## PowerShell (task 10.6)

The `docs/DEMO.md` Paso 4 captures in a new PowerShell terminal are left to the author (design Follow-ups E7, destination C). The agent ran the same commands in Git Bash, above.

## End-to-End Testing (task 10.8)

Not applicable: the change reaches no browser interface (the CLI is exercised above).

## Outcome
- Status: PASS
- Blocking issues: none
