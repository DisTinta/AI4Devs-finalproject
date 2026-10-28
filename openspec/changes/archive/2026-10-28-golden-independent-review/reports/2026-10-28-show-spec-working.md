# Show spec working: golden-independent-review (DIS-33, PR #79)

Agent's text (autonomous run, review step). Git Bash, branch `feature/dis-33-golden-independent-review`,
Docker Postgres `codemind-postgres-1` up and healthy, no `LLM_*` (evaluation mode).

The change has no production behaviour: its interfaces are the versioned data (panel input, panel
outputs, signatures, report), checked by `tests/unit/seed/golden-reviews.spec.ts`, and the
evaluation-mode demo that serves the golden answers (`ask`, `verify`), which must keep working with
the signed files.

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| The panel input projects the golden answers without their verification | `npx vitest run tests/unit/seed tests/unit/cache` | 13 files, 54 tests passed | yes | below |
| Each panelist output judges every item under the criterion | same run (`golden-reviews.spec.ts`) | passed over the committed outputs, unedited | yes | below |
| The resolution answers exactly the disagreements | same run | passed: `items: []`, no disagreement | yes | below |
| Invalid panel outputs are rejected (error scenario) | same run | 13 invalid copies and one resolution rejected, each naming its rule | yes | below |
| Every golden answer judged correct or partial carries both panel signatures | same run | passed: task-api Q1, Q2, Q3 and acme-shop Q3 signed `agent:claude-opus-5-5`, `agent:claude-sonnet-5-5`, 2026-10-28 | yes | below |
| A golden answer judged incorrect carries no signature | same run (assertion tightened in this step: `## Pending` names exactly the incorrect items) | passed: acme-shop Q1, Q4 unsigned, `## Pending` lists DIS-108, DIS-109 | yes | below |
| The report's verdicts and agreement match the panel files | same run | passed: `100.0%`, `1.000`, `0 of 7` | yes | below |
| The report states its criterion, panel and limitations | same run | passed | yes | below |
| The report's criterion is the Panel group's criterion | same run | passed (active tasks path) | yes | below |
| The criterion precedes the input and nothing in the record is rewritten | git history (step 8 report, task 8.3) | `538ae91` ancestor of `4adb0be`; one commit per panel file | yes | step 8 report |
| Signatures change nothing `verify` reads | `npm run db:seed`, `npm run verify` | `2 projects loaded`; `acme-shop: 3/3`, `task-api: 3/3`, exit 0 | yes | below |
| Demo serves the golden answers from the cache | three `ask` calls of task 9.1, plus the acme-shop price question | exit 0 each; golden text; `UNKNOWN (no-anchor)` for authentication | yes | below |

## Evidence

```
$ npx vitest run tests/unit/seed tests/unit/cache
 Test Files  13 passed (13)
      Tests  54 passed (54)

$ npx vitest run tests/unit/seed/golden-reviews.spec.ts      (after the Pending assertion)
 Test Files  1 passed (1)
      Tests  9 passed (9)

$ npm run db:seed
2 projects loaded
  acme-shop  php/laravel  174 nodes · 170 edges
  task-api  typescript/fastify  102 nodes · 100 edges

$ npm run verify
✓ task-api Q2 ¿Qué hace buildPage con los resultados paginados?
✓ task-api Q3 ¿Qué transiciones de estado son válidas?
acme-shop: 3/3 golden answers match
task-api: 3/3 golden answers match
verify exit=0

$ npm run cli -- ask task-api "¿Qué hace buildPage con los resultados paginados?"     (exit 0)
La función buildPage convierte los resultados paginados en un objeto Page.
statements:
1. [FACT] La función buildPage toma cuatro parámetros: items, total, page y pageSize.
   evidence: src/domain/pagination.ts:13-21
2. [FACT] La función buildPage devuelve un objeto Page con las propiedades items, total, page, pageSize y pageCount.
   evidence: src/domain/pagination.ts:13-21

$ npm run cli -- ask acme-shop "¿Cómo se validan los cupones?"     (exit 0)
El proceso de validación de cupones en el código base está centralizado en el método `CouponValidator::percentFor()` ...
1. [INFERENCE] El método CouponValidator::percentFor() verifica la validad de un cupón.
2. [FACT] La clase DiscountService utiliza los descuentos, incluyendo los cupones, en su método discountFor().

$ npm run cli -- ask task-api "¿Cómo se autentican los usuarios?"
UNKNOWN (no-anchor)

$ npm run cli -- ask acme-shop "¿Cómo se calcula el precio final de un pedido?"     (exit 0)
... 6. [FACT] El resultado final del cálculo del precio se obtiene sumando el subtotal, los descuentos, los impuestos y los costos de envío (E4).
```

The last call shows the answer the panel judged `incorrect` (acme-shop Q1, FACT S6 false against
`fixtures/acme-shop/app/Services/PriceCalculator.php:29`). It is still served, unsigned, as design D5
plans; it also showed that `docs/DEMO.md` called this answer "revisada", which this step corrects
(adversarial review, finding M1).

## State

- Before: `claim` 0, `cache_entry` 6 (after `npm run db:seed`, the six golden answers).
- After the four `ask` calls: `claim` 0, `cache_entry` 6 (`docker exec codemind-postgres-1 psql ... select count(*)`).
- Restored: yes, nothing to restore (the calls read the cache only). No file under `seeds/` or
  `fixtures/` changed by the runs.

## Not demonstrated

- PowerShell: no command of the guide changes; nothing planned (design P1).
- Web UI: `reviews` is not displayed (task 10.1, not applicable).

## Handoff

The change is demonstrably working: the committed panel files pass every validator unedited, the
signatures and the report match them, and the demo and `verify` behave as before. No screenshot was
taken, and none is left at the repository root. `node scripts/dev-processes.mjs stop` is run at the
end of the step.
