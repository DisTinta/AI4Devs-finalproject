# Show spec working — impact-risk-cli (DIS-90)

- Date: 2026-10-30
- Change: impact-risk-cli, PR #91, branch `feature/dis-90-impact-risk-cli` at `dc55062`
- Step: 12.3 (review step of the autonomous run)

Agent's text (autonomous run, `docs/AUTONOMOUS-RUN.md` §6). Every command ran in Git Bash from the
repository root, through the real entry point (`npm run cli --silent -- impact …`, which is
`packages/cli/src/index.ts` under `tsx`), against the local dev database `codemind` (acme-shop and
task-api loaded from the seed, Docker container `codemind-postgres-1`). `DATABASE_URL` was the local URL
of `.env.example`; no output printed it. The integration suites ran against `codemind_test` (empty, as
`docs/TESTING.md` requires).

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| cli-impact: Q2 over the seed is printed with its risk | `impact acme-shop "cambiar los descuentos de DiscountService"` | exit 0, stderr empty, the four required lines, `RIESGO HIGH` and the Q2 rationale | yes | E1 |
| impact: Q2 over the seed is high risk | same run | `10 ficheros afectados, 3 tests que cubren el cambio, 4 elementos directos sin test, 0 elementos directos con cadena solo heurística.` | yes, verbatim | E1 |
| impact: An impact call over the seed writes its row | the runs of E1–E3 | one `impact` row per returned report, `cost_usd` 0, latency 30–93 ms; no row for a failed run | yes | E5 |
| cli-impact: Impact receives … the hop count (real path) | same change with `--max-hops 1` | `INDIRECTO (ninguno)`, two tests, `RIESGO HIGH`, `6 ficheros afectados, 2 tests…` | yes | E2 |
| cli-impact: A change without anchor answers no-anchor on the command line | `impact acme-shop "cómo se gestionan los reembolsos"` | stdout `UNKNOWN (no-anchor)`, exit 0 | yes | E3 |
| cli-impact: Impact usage errors never quote the arguments | 4 runs (missing, extra, `-SENTINEL-impact-4b2c`, `--max-hops` without value) | exit 2, one `USAGE` line each, no argument quoted | yes | E4 |
| cli-impact: An invalid impact request is rejected before any connection | `--max-hops 4`, `0`, `2.5`, `x`; change `SNTL`; change `"   "` | exit 2, `INVALID_IMPACT_REQUEST`, `field` `maxHops` ×4 and `change` ×2; `SNTL` not echoed | yes | E4 |
| cli-impact: Only the exact name resolves the impact project | `no-existe`, `ACME-SHOP`, `" acme-shop"`, acme-shop's id | exit 1, `PROJECT_NOT_FOUND`, message `project not found` | yes | E4, E6 |
| cli-impact: Impact help and version print without reading the environment | `impact --help`, `impact -V` | exit 0, help or `0.0.1` on stdout, stderr empty | yes (env reads proved by the unit test) | E4 |
| cli-impact: The global help lists impact once | `npm run cli -- --help` | `impact <project> <change>` counted once | yes | E4 |
| cli-impact: A missing database URL fails before any connection | `DATABASE_URL="   "` | exit 1, `MISSING_CONFIG`, `details.variable` `DATABASE_URL` | yes | E4 |
| cli-impact: An unreachable database fails without leaking the URL | `DATABASE_URL=postgres://u:s3cret@127.0.0.1:1/db` | exit 1, `DATABASE_UNAVAILABLE`, `cannot connect to the database`, no URL | yes | E4 |
| cli-impact: The model configuration is not read | `LLM_BASE_URL=ftp://x`, `LLM_API_KEY=<sentinel>` | exit 0, 0 occurrences of either value in stdout or stderr | yes | E4 |
| cli-impact: The impact connections are closed after a run | `pg_stat_activity` after every run | 0 sessions `codemind-impact` | yes | E5 |
| All scenarios with a database | `npx vitest run tests/integration/impact tests/integration/cli/impact-command.spec.ts` on `codemind_test` | 2 files, 10 tests passed | yes | E7 |

## Evidence

E1 — `npm run cli --silent -- impact acme-shop "cambiar los descuentos de DiscountService"`:

```
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

RIESGO HIGH
10 ficheros afectados, 3 tests que cubren el cambio, 4 elementos directos sin test, 0 elementos directos con cadena solo heurística.
exit=0
```

E2 — the same change with `--max-hops 1`: the same `DIRECTO`, `INDIRECTO` `  (ninguno)`, `TESTS`
`DiscountServiceTest` and `PriceCalculatorTest`, `RIESGO HIGH`,
`6 ficheros afectados, 2 tests que cubren el cambio, 4 elementos directos sin test, 0 elementos directos con cadena solo heurística.`, exit 0.

E3 — `impact acme-shop "cómo se gestionan los reembolsos"`: stdout `UNKNOWN (no-anchor)`, exit 0.

E4 — error paths (stdout empty in every failing run):

| Arguments / environment | stderr | Exit |
|---|---|---|
| `impact acme-shop` | `{"error":{"code":"USAGE","message":"missing argument","details":{}}}` | 2 |
| `impact acme-shop "cambiar algo" extra` | `{"error":{"code":"USAGE","message":"too many arguments","details":{}}}` | 2 |
| `impact acme-shop -SENTINEL-impact-4b2c` | `{"error":{"code":"USAGE","message":"unknown option","details":{}}}` | 2 |
| `impact acme-shop "cambiar algo" --max-hops` | `{"error":{"code":"USAGE","message":"missing option value","details":{}}}` | 2 |
| `--max-hops 4` / `0` / `2.5` / `x` | `{"error":{"code":"INVALID_IMPACT_REQUEST","message":"invalid impact request","details":{"field":"maxHops"}}}` | 2 |
| `impact acme-shop "SNTL"` / `"   "` | same code, `"details":{"field":"change"}` | 2 |
| `impact no-existe …` / `ACME-SHOP` / `" acme-shop"` | `{"error":{"code":"PROJECT_NOT_FOUND","message":"project not found","details":{}}}` | 1 |
| `impact --help` | stdout `Usage: codemind impact [options] <project> <change>` … `--max-hops <n>  hops to follow, 1 to 3 (default 2)`; stderr empty | 0 |
| `impact -V` | stdout `0.0.1`; stderr empty | 0 |
| `--help` (global), lines with `impact <project> <change>` | `1` | 0 |
| `DATABASE_URL="   "` | `{"error":{"code":"MISSING_CONFIG","message":"DATABASE_URL is not set","details":{"variable":"DATABASE_URL"}}}` | 1 |
| `DATABASE_URL=postgres://u:s3cret@127.0.0.1:1/db` | `{"error":{"code":"DATABASE_UNAVAILABLE","message":"cannot connect to the database","details":{}}}` | 1 |
| `LLM_BASE_URL=ftp://x`, `LLM_API_KEY=<sentinel>` | exit 0; occurrences of either value in the output: `0` | 0 |

Unset `DATABASE_URL` cannot be shown through `npm run cli`: `scripts/load-env.mjs` fills it from
`.env`, as for every command. The unit test "A missing database URL fails before any connection"
covers the unset case on `runImpactCommand`.

E5 — after the runs: `query_log` held 5 rows `capability = impact` (the five returned reports: E1, E2,
E3, the Q2 run with `DATABASE_URL` unset, which the env loader filled from `.env`, and the
model-configuration run), `cost_usd` sum `0.000000`, latency
`30`–`93` ms, two distinct questions; the 18 failing runs wrote none.
`SELECT count(*) FROM pg_stat_activity WHERE application_name='codemind-impact'` → `0`.

E6 — `impact a794456d-6d1b-5b55-a360-13fec83dc7bc "cambiar algo"` (acme-shop's id as the name) →
`PROJECT_NOT_FOUND`, exit 1.

E7 — `DATABASE_URL=…/codemind_test npx vitest run tests/integration/impact tests/integration/cli/impact-command.spec.ts`
→ `Test Files 2 passed (2)`, `Tests 10 passed (10)`.

No screenshots: the change has no browser interface.

## State

- Before (`2026-10-30T18:50:05Z`, database `codemind`): `query_log` 0 rows (0 `impact`), `project` 2,
  `symbol` 185, `edge` 270.
- After the runs: `query_log` 5 rows, all `impact`.
- Restored: yes — `DELETE FROM query_log WHERE capability = 'impact' AND created_at >= '2026-10-30T18:50:05Z'`
  (`DELETE 5`); then `query_log` 0, `project` 2, `symbol` 185, `edge` 270, as before.

## Not demonstrated

- `DATABASE_URL` unset through `npm run cli` (see E4: the env loader fills it); covered by the unit test.
- The scenarios that need a store or use-case double (events on stderr, `INTERNAL`, `ProjectNotFound`
  thrown by the use case, control characters in a report) cannot be produced from the seed; they are
  covered by `tests/unit/cli/impact-command.spec.ts`.
- The PowerShell captures of `docs/DEMO.md` Paso 4 stay with the author (design Follow-ups E9, A7).

## Handoff

The change is demonstrably working through the real CLI against the real database: the report, the
risk and its rationale, `UNKNOWN`, every error path and the `query_log` row match the specs. No
screenshot or file was left at the repository root.
