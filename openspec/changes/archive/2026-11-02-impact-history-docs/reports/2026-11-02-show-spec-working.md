# Show spec working: impact-history-docs

- Date: 2026-11-02
- Change: impact-history-docs (DIS-94), PR #94
- Step: 13.3 `/show-spec-working`

*Agent's text: written by the agent of the autonomous run (`docs/AUTONOMOUS-RUN.md` §6), without the author.
Every command ran in Git Bash against the local `codemind` database (Postgres in Docker, `codemind-postgres-1`
healthy), which holds the seed. The run did not reuse the step 10 evidence: each command below was run again
in this step. The OS user name does not appear in any output.*

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| impact "Q2 history over the seed" | `impact acme-shop "cambiar los descuentos de DiscountService"` | `HISTORIAL` holds only `app/Services/ShippingService.php  co-cambia 100 %  PR #24, #33, #55  [git]` | yes | E1 |
| impact "Q2 documentation over the seed is current" | same command | `DOCUMENTACIÓN` holds only `README.md  al día` | yes | E1 |
| cli-impact "Q2 over the seed is printed with its risk" | same command | the `DIRECTO`, `INDIRECTO`, `TESTS`, `DOCUMENTACIÓN`, `HISTORIAL` and `RIESGO HIGH` sections in that order, the DIS-90 rationale unchanged, exit 0, one more `query_log` row | yes | E1, State |
| impact "A later change to the price calculator makes the readme stale" | committed commit `ffff…ffff` of 2024-05-10 touching `PriceCalculator.php`, then the Q2 command | `README.md  desactualizado desde fffffff`; `RIESGO HIGH`; rationale ends `, 1 documento desalineado.` | yes | E2 |
| impact "A document touched with or after its code is not stale" (equal date) | the same commit moved to README's latest date (2024-05-06 09:31 UTC) | `README.md  al día` | yes | E3 |
| impact "Related documentation" (undated commits are ignored) | the same commit with `committed_at` NULL | `README.md  al día` | yes | E3 |
| task-api history (design R2-5c) | `impact task-api "cambiar TaskService"` | `HISTORIAL` exactly `src/schemas/task.schema.ts  co-cambia 75 %  PR #15, #31, #40  [git]` | yes | E4 |
| cli-impact errors (unchanged) | `--max-hops 4`; unknown project | exit 2 `INVALID_IMPACT_REQUEST`; exit 1 `PROJECT_NOT_FOUND`; neither wrote a row | yes | E5 |
| impact "An unknown report has neither documents nor history" | `impact acme-shop "cómo se gestionan los reembolsos"` | `UNKNOWN (no-anchor)`, no `DOCUMENTACIÓN` nor `HISTORIAL` | yes | E5 |
| graph-store reads, impact unit scenarios | `npx vitest run` over the impact, CLI, store and explain specs; the Postgres specs against `codemind_test` | 191 passed (unit, 68 skipped without a database); 71 passed (integration, with the database) | yes | E6 |

## Evidence

E1. `npm run --silent cli -- impact acme-shop "cambiar los descuentos de DiscountService"` → `exit=0`:

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

E2. Inserted through `docker exec codemind-postgres-1 psql`: one `commit` of acme-shop (`a794456d-…`) with sha
`ffffffffffffffffffffffffffffffffffffffff`, `committed_at` `2024-05-10T12:00:00Z`, and its `file_commit` row to
`app/Services/PriceCalculator.php` (`INSERT 0 1` each). The Q2 command, from `DOCUMENTACIÓN` on → `exit=0`:

```text
DOCUMENTACIÓN
  README.md  desactualizado desde fffffff

HISTORIAL
  app/Services/ShippingService.php  co-cambia 100 %  PR #24, #33, #55  [git]

RIESGO HIGH
10 ficheros afectados, 3 tests que cubren el cambio, 4 elementos directos sin test, 0 elementos directos con cadena solo heurística, 1 documento desalineado.
```

E3. Hostile input on the same row. `UPDATE commit SET committed_at = <README.md's latest commit date>` returned
`2024-05-06 09:31:00+00`; the Q2 command printed `README.md  al día` (a commit at the same instant is not strictly
later). `UPDATE commit SET committed_at = NULL`; the Q2 command printed `README.md  al día` (an undated commit is
ignored). Then `DELETE FROM file_commit …` and `DELETE FROM commit …` (`DELETE 1` each).

E4. `npm run --silent cli -- impact task-api "cambiar TaskService"`, from `DOCUMENTACIÓN` on → `exit=0`:

```text
DOCUMENTACIÓN
  README.md  al día

HISTORIAL
  src/schemas/task.schema.ts  co-cambia 75 %  PR #15, #31, #40  [git]

RIESGO HIGH
15 ficheros afectados, 4 tests que cubren el cambio, 9 elementos directos sin test, 0 elementos directos con cadena solo heurística.
```

E5. Error cases:

```text
$ npm run --silent cli -- impact acme-shop "cambiar los descuentos de DiscountService" --max-hops 4
{"error":{"code":"INVALID_IMPACT_REQUEST","message":"invalid impact request","details":{"field":"maxHops"}}}
exit=2
$ npm run --silent cli -- impact no-existe "cambiar algo"
{"error":{"code":"PROJECT_NOT_FOUND","message":"project not found","details":{}}}
exit=1
$ npm run --silent cli -- impact acme-shop "cómo se gestionan los reembolsos"
UNKNOWN (no-anchor)
exit=0
```

E6. Tests:

- `npx vitest run tests/unit/impact tests/integration/impact tests/unit/cli/impact-command.spec.ts tests/integration/cli/impact-command.spec.ts tests/unit/store/in-memory-store.spec.ts tests/integration/store/graph-read.spec.ts tests/unit/explain/explain.spec.ts` → `Test Files 12 passed | 2 skipped (14)`, `Tests 191 passed | 68 skipped (259)` (no `DATABASE_URL`).
- The same Postgres specs with the test database (`DATABASE_URL=…/codemind_test npx vitest run tests/integration/impact tests/integration/cli/impact-command.spec.ts tests/integration/store/graph-read.spec.ts`) → `Test Files 3 passed (3)`, `Tests 71 passed (71)`. The first attempt against the `codemind` database was refused by the harness (`The test database holds 2 committed projects`), as `docs/TESTING.md` says; nothing ran.
- CI of PR #94 before this step: `frontend`, `mutation`, `quality`, `scope`, `secrets` and `verify` pass.

No screenshot: the change has no browser interface.

## State

- Before (2026-11-02 11:39:27 UTC): `project` 2, `commit` 60, `file_commit` 102, `edge` 270, `query_log` `impact` 2.
- During: `query_log` `impact` 8: six calls returned a report (Q2, task-api, stale, equal date, undated, unknown); the two error calls wrote none.
- After: the inserted `commit` and `file_commit` rows deleted (`DELETE 1` each);
  `DELETE FROM query_log WHERE capability = 'impact' AND created_at >= '2026-11-02T11:39:27Z'` → `DELETE 6`.
  Counts again: `project` 2, `commit` 60, `file_commit` 102, `edge` 270, `impact` 2.
- Restored: yes.

## Not demonstrated

- The `docs/DEMO.md` Paso 4 captures in a new PowerShell terminal: the author's (design Follow-ups E7, destination C).
- No browser interface: not applicable.

## Handoff

The change is demonstrably working: every scenario exercised through the CLI and the database matches its `THEN`,
including the stale path, its two boundaries (same instant, no date) and the error cases. No screenshot or other
file was left at the repository root.
