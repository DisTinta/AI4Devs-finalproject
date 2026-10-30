# Manual Interface Testing Report

- Date: 2026-10-30
- Change: impact-risk-cli
- Step: 9. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

Agent's text (autonomous run). Everything ran in Git Bash from the repository root, against the local
dev database `codemind` (acme-shop and task-api loaded from the seed), with `DATABASE_URL` set to the
documented local URL of `.env.example` (user name and password masked in no output: none was printed).
The user name of the operating system does not appear in any command below.

## Baseline (9.1)

- `npm run cli -- projects` lists `acme-shop` (174 nodes, 170 edges) and `task-api` (102 nodes, 100 edges); `db:seed` was not needed.
- Timestamp of the baseline: `2026-10-30T18:11:05Z`.
- `query_log`: 0 rows in total (no capability).
- `project` 2, `symbol` 185, `edge` 270.

## Success path (9.2)

All with `npm run cli --silent -- impact …`; every exit code is `0`.

1. `impact acme-shop "cambiar los descuentos de DiscountService"`: `DIRECTO` lists `DiscountApplied`, `DiscountService`, `RecordDiscountAudit` (0 saltos), `PriceCalculator`, `app/Providers/AppServiceProvider.php`, `app/Providers/EventServiceProvider.php` (1 salto, all `exact`); `INDIRECTO` lists `CheckoutController`, `OrderController`, `RecalculateTotals`, `SendOrderConfirmation` (2 saltos, `heuristic`); `TESTS` lists `DiscountServiceTest`, `OrderPricingTest`, `PriceCalculatorTest`; last lines `RIESGO HIGH` and `10 ficheros afectados, 3 tests que cubren el cambio, 4 elementos directos sin test, 0 elementos directos con cadena solo heurística.` This is the rationale of the spec scenario over the seed.
2. Same change with `--max-hops 1`: `INDIRECTO` is `(ninguno)`, tests `DiscountServiceTest` and `PriceCalculatorTest`, `RIESGO HIGH`, `6 ficheros afectados, 2 tests que cubren el cambio, 4 elementos directos sin test, 0 elementos directos con cadena solo heurística.`
3. Same change with `--max-hops 3`: three more indirect entries at 3 saltos (`GET /orders/{order}`, `OrderObserver`, `POST /checkout`), `RIESGO HIGH`, `13 ficheros afectados, 3 tests …`.
4. `impact acme-shop "cambiar el cálculo de descuentos"`: the literal text does not anchor `DiscountService` (lexical limit); it anchors `PriceCalculator` and `RecalculateTotals`; `RIESGO HIGH`, `9 ficheros afectados, 2 tests que cubren el cambio, 6 elementos directos sin test, 4 elementos directos con cadena solo heurística.`
5. `impact task-api "cambiar buildPage"`: anchors `buildPage`, `buildApp` and `BuildAppOptions`; 5 tests; `RIESGO HIGH`, `9 ficheros afectados, 5 tests que cubren el cambio, 6 elementos directos sin test, 0 elementos directos con cadena solo heurística.`

Each output matches the `cli-impact` spec (sections, `[grafo]`, `salto`/`saltos`, a file component printed once, the level as the code).

## Error cases (9.3)

| Command | stdout | stderr | Exit |
|---|---|---|---|
| `impact acme-shop "cambiar algo" --max-hops 4` | empty | `{"error":{"code":"INVALID_IMPACT_REQUEST","message":"invalid impact request","details":{"field":"maxHops"}}}` | 2 |
| `impact acme-shop "abcd"` | empty | same code, `"field":"change"` | 2 |
| `impact no-existe "cambiar algo"` | empty | `{"error":{"code":"PROJECT_NOT_FOUND","message":"project not found","details":{}}}` | 1 |
| `impact acme-shop "cómo se gestionan los reembolsos"` | `UNKNOWN (no-anchor)` | empty | 0 |
| `DATABASE_URL= npm run cli -- impact acme-shop "cambiar algo"` | empty | `{"error":{"code":"MISSING_CONFIG","message":"DATABASE_URL is not set","details":{"variable":"DATABASE_URL"}}}` | 1 |
| `impact acme-shop` | empty | `{"error":{"code":"USAGE","message":"missing argument","details":{}}}` | 2 |
| `npm run cli -- --help` | lists `impact <project> <change>` once | empty | 0 |

## Mutating effect (9.4)

- Reports returned in step 9: 6 (three for the first change, the literal-text change, the `task-api` change and the no-anchor change). `query_log` then held 6 rows, all `capability = impact`, `cost_usd` 0, latencies 21 to 82 ms. The failed calls (invalid request, unknown project, missing configuration, usage) wrote no row.
- Restored with `DELETE FROM query_log WHERE capability = 'impact' AND created_at >= '2026-10-30T18:11:05Z'` (6 rows). Afterwards `query_log` 0 rows; `project` 2, `symbol` 185, `edge` 270, as in the baseline.
- `git status` shows no stray file; `node scripts/dev-processes.mjs stop` found no process left.

## Notes

- 9.6: the PowerShell check of the `docs/DEMO.md` Paso 4 command, with its captures, stays with the author (design Follow-ups E9, destination C). The agent ran the same commands in Git Bash, as above.
- 9.7: end-to-end testing is not applicable: the change reaches no browser interface.

## Outcome

- Status: PASS
- Blocking issues: none
