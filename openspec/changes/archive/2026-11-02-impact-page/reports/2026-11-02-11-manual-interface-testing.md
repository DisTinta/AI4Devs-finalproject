# Step 11 — manual interface testing (impact-page, DIS-14)

*Agent's text (autonomous run, apply step, 2026-11-02).* Nothing is left for the author.

## Setup

- Windows 11, Google Chrome 156.0.8078.74 driven headless with `playwright-core` 1.49.1 installed in the session scratchpad (outside
  the repository: no dependency was added). The Playwright MCP server of the project was not available to this step, so the browser
  was driven by that script; it does the same actions a person does (typing, Enter, Tab, arrow keys) and reads the real DOM.
- 11.1 Preconditions: local Postgres up (Docker container `codemind-postgres-1`, healthy), acme-shop and task-api loaded
  (`npm run cli -- projects` lists both as `sample`; `db:seed` not needed), evaluation mode (no `LLM_*`). `query_log` rows with
  capability `impact`: 0 at 2026-11-02 16:29:41 UTC (the table was empty).
- 11.2 `npm run up` (API on 3000, web on 5173), both answered `200` on `/health` and `/`.

## 11.2 Paths and the Q2 report

| Check | Result |
|---|---|
| `/` | level-1 heading «Elige un proyecto para explorar» |
| `/p/a794456d-6d1b-5b55-a360-13fec83dc7bc` | «acme-shop» |
| `/no-existe` | «Página no encontrada» |
| `/p/a794456d-6d1b-5b55-a360-13fec83dc7bc/impact` | «acme-shop», one field «Cambio» |
| `/` → «Explorar proyecto» → «Analizar el impacto de un cambio» | arrives at `/p/<id>/impact` |

Send «cambiar los descuentos de DiscountService» with «Saltos del grafo» at 2 (screenshot `2026-11-02-11-report-q2.png`): 6 direct,
4 indirect, 3 tests, `README.md · al día`, `app/Services/ShippingService.php · co-cambia 100 % · PR #24, #33, #55 · [git]`, «Riesgo
alto» with the rationale of `docs/DEMO.md` «Paso 4»; the fourth direct entry reads «PriceCalculator · app/Services/PriceCalculator.php
· 1 salto · exacta · [grafo]» and the fifth «app/Providers/AppServiceProvider.php · 1 salto · exacta · [grafo]»; the status region
holds «Informe de impacto recibido.». It matches «Paso 4».

«Saltos del grafo» changed with the arrow keys only (ArrowUp to 1, ArrowDown twice to 3), sending with Enter on «Analizar» each time:

| Hops | Directo | Indirecto | Tests | Documentación | Historial |
|---|---|---|---|---|---|
| 1 | 6 | 0 («Sin elementos») | 2 | 1 | 1 |
| 2 | 6 | 4 | 3 | 1 | 1 |
| 3 | 6 | 7 | 3 | 1 | 1 |

`query_log` (capability `impact`): each answered send added exactly one row (0 → 1 after hops 2, then +1 after hops 1, +1 after hops
3), and the unknown send added one more (+1). Invalid sends («hola») and the `404` added none.

## 11.3 States from the real API

- «mejorar el rendimiento general» → «Sin ancla en el grafo», the sentence and «Motivo: no-anchor»; status «Sin ancla en el grafo.»
  (screenshot `2026-11-02-11-unknown.png`); one `query_log` row added.
- «hola» sent twice without editing: the `role="alert"` node of the second send is a different element from the first.
- `/p/0b5c7f2e-1d3a-4e6b-8f90-1a2b3c4d5e6f/impact` with the API up, sending «cambiar los descuentos de DiscountService» → alert
  «No se ha podido obtener la respuesta.», «La API no tiene este proyecto: vuelve a la selección de proyecto o indéxalo con la CLI.»,
  «Código: PROJECT_NOT_FOUND.»; no row added.
- `POST …/impact` intercepted in the browser with the `429` `RATE_LIMITED` body: «No se ha podido obtener la respuesta.», «Demasiadas
  peticiones seguidas a la API.», «Espera 30 s y vuelve a preguntar.», «Código: RATE_LIMITED.» (screenshot
  `2026-11-02-11-rate-limit.png`).
- Everything stopped and only the web started (`npm -w packages/web run dev`): sending shows «No se ha podido obtener la respuesta.»
  and «La API de CODEMIND no responde.», status region empty (screenshot `2026-11-02-11-api-down.png`).

## 11.4 Keyboard, focus and contrast

- With the Q2 report shown and the focus removed from the field, Tab visits the list «Saltos del grafo», the button «Analizar» and the
  link «Volver a las preguntas»; the report holds no focusable element (0 links, buttons or tab stops inside its sections). Shift+Tab
  from the page start goes back through the same controls. The full order including the back link and the field is also pinned by
  the RTL test "The tab order of Screen 3 skips the report".
- Every control shows its focus outline: `solid 2px rgb(25, 113, 194)` on the list, the button, the link and the field; `solid 2px
  rgb(255, 255, 255)` on the «←» link on the dark bar (screenshot `2026-11-02-11-focus.png`).
- Screen 2: after seven Tab presses the focus is on «Analizar el impacto de un cambio» with `solid 2px rgb(25, 113, 194)`; the link
  is inside the 1280×800 viewport on the initial Screen 2, and so is «Volver a las preguntas» on the initial Screen 3.
- Contrast computed from the rendered colours (WCAG formula; the browser's inspector gives the same figure):

| Element | Text / background | Ratio |
|---|---|---|
| Section headings | `#212529` on `#ffffff` | 15.43 |
| File `<code>` spans, legend, deterministic line | `#495057` on `#ffffff` | 8.18 |
| Origin tag «[grafo]» / «[git]» | `#1971c2` on `#e7f5ff` | 4.52 |
| Risk `HIGH` heading and rationale | `#5c3d00` on `#fff9db` | 9.34 |
| Navigation link | `#1971c2` on `#ffffff` | 5.02 |

All are at least 4.5:1. The pairs for `MEDIUM`/`LOW` risk, «Sin elementos», the unknown state and the stale document use the same
theme tokens covered by `theme.test.ts`.
- 320 px wide: `scrollWidth` 320 = `clientWidth` 320 (no horizontal scroll), long paths wrap (screenshot
  `2026-11-02-11-narrow-320.png`).

## 11.5 State restored

`node scripts/dev-processes.mjs stop` run after each phase and `list` shows nothing running. The 6 `query_log` rows created
during the run (all with `created_at` after the 11.1 timestamp) were deleted and the table is back to 0 rows, as in 11.1.
`db:seed` did not run, so there is nothing to remove from it.

## 12.1 End-to-end

Covered by steps 11.2–11.4; no Playwright suite in this change (DIS-75 owns it, design → Follow-ups P6). The workflow «open Screen
1 → open acme-shop → follow the impact link → send a change → read the report → change hops → unknown → errors → back to the
questions» was run in a real browser, and the `query_log` counts above show the stored state matches what the interface showed: one
`impact` row per answered or unknown send, none per invalid send or error.
