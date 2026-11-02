# Show spec working — impact-page (DIS-14)

*Agent's text (autonomous run, review step, 2026-11-02).* Nothing is left for the author.

## Setup

- Windows 11; branch `feature/dis-14-impact-page` at `d9fc9d2` (PR #98); Docker container `codemind-postgres-1` healthy with
  acme-shop loaded; evaluation mode (no `LLM_*`).
- `npm run dev` (API on 3000 and web on 5173, the two processes of `npm run up` without its `docker compose` and `npm install`
  stages, which were already satisfied): `curl http://localhost:5173/` → `200`; `curl http://localhost:3000/health` →
  `200 {"status":"ok"}`.
- Browser: Google Chrome 156.0.8078.74 headless, driven by a `playwright-core` 1.49.1 script in the session scratchpad (no repository
  dependency; the Playwright MCP server is not available to this step, design → Follow-ups P16). The script types, presses Enter,
  Tab and the arrow keys, and reads the real DOM.

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| web-foundation "The development server serves the three paths" | open `/`, `/p/<acme-shop>`, `/no-existe` | h1 «Elige un proyecto para explorar», «acme-shop», «Página no encontrada» | yes | log below |
| web-foundation "The development server serves Screen 3" | open `/p/<acme-shop>/impact` | h1 «acme-shop», field «Cambio» | yes | log below |
| impact-page "Screen 3 opens on a sample project without any request" | open Screen 3, watch `POST …/impact` | 0 requests, list at «2», status empty, «Volver a las preguntas» → `/p/<acme-shop>` | yes | log below |
| ask-page "Screen 2 links to the impact screen of its project" | `/` → «Explorar proyecto» → «Analizar el impacto de un cambio» | arrives at `/p/<acme-shop>/impact` | yes | log below |
| impact-page "A valid change is sent trimmed with the selected hops" | type «  cambiar los descuentos de DiscountService  », Enter | body `{"change":"cambiar los descuentos de DiscountService","maxHops":2}`; field keeps the untrimmed text | yes | `2026-11-02-show-report-q2.png` |
| impact-page "The answered report shows its five sections, its origins and its risk" (real API) | same send | 6 direct (4th «PriceCalculator · app/Services/PriceCalculator.php · 1 salto · exacta · [grafo]», 5th «app/Providers/AppServiceProvider.php · 1 salto · exacta · [grafo]»), 4 indirect «2 saltos · heurística», 3 tests, «README.md · al día», «app/Services/ShippingService.php · co-cambia 100 % · PR #24, #33, #55 · [git]», «Riesgo alto» + rationale, legend, deterministic line; status «Informe de impacto recibido.» | yes, equal to `docs/DEMO.md` «Paso 4» | `2026-11-02-show-report-q2.png` |
| impact-page "The walkthrough step 4 runs in a real browser" (hops with arrow keys) | focus the list, ArrowUp → 1, send; ArrowDown ×2 → 3, send | hops 1: body `maxHops":1`, 6 / «Sin elementos» / 2 / 1 / 1; hops 3: body `maxHops":3`, 6 / 7 / 3 / 1 / 1 | yes | log below |
| impact-page "An unknown report says the change anchors nothing" (real API) | send «mejorar el rendimiento general» | «Sin ancla en el grafo», the sentence, «Motivo: no-anchor»; status «Sin ancla en el grafo.» | yes | `2026-11-02-show-unknown.png` |
| impact-page "An invalid change is not sent" | «hola», Enter, Enter again without editing | alert «Describe el cambio en 5 a 500 caracteres.», a new alert node on the second Enter, `aria-invalid="true"`, 0 requests, status unchanged | yes | `2026-11-02-show-invalid.png` |
| impact-page "Another project's Screen 3 starts empty" | open `/p/0b5c7f2e-…/impact` after a report | h1 is the id, 0 level-2 headings | yes | log below |
| impact-page "A rate limit, an API error and an unavailable API are alerted" — `404` (real API) | send on `/p/0b5c7f2e-…/impact` | «No se ha podido obtener la respuesta.», «La API no tiene este proyecto: …», «Código: PROJECT_NOT_FOUND.» | yes | log below |
| same scenario — `429` (intercepted in the browser) | `POST **/impact` fulfilled with the spec's `429` body | «No se ha podido obtener la respuesta.», «Demasiadas peticiones seguidas a la API.», «Espera 30 s y vuelve a preguntar.», «Código: RATE_LIMITED.» | yes | `2026-11-02-show-rate-limit.png` |
| impact-page "An empty section, a stale document and a history entry without pull requests" + "Every risk level is written in words" + "Texts of the API in the report are shown as text" (intercepted `200`) | answers with `indirect`/`tests` empty, a stale doc, `prs: []`, risk `MEDIUM` then `LOW`, rationale «<b>texto</b> de la API» | «Sin elementos», «docs/pricing.md · ⚠ desactualizada desde el commit 0123456», «co-cambia 80 % · sin PR · [git]», «Riesgo medio» / «Riesgo bajo», rationale shown literally, 0 `<b>` elements in `main` | yes | `2026-11-02-show-stale-medium.png` |
| impact-page "Leaving the page aborts the pending report" | request held by the browser, then «Volver a las preguntas» | the request failed (aborted), Screen 2 shown, 0 alerts | yes | log below |
| impact-page "Accessibility of Screen 3": focus outline and contrast | Tab through Screen 3 with the report shown | each control `outline solid 2px`; contrast: risk `MEDIUM`/`LOW` heading 14.63, rationale 7.76, stale document 9.34, «Sin elementos» 8.18 (step 11 measured the rest: 15.43, 8.18, 4.52, 9.34, 5.02) | yes (all ≥ 4.5:1) | `2026-11-02-show-focus.png` |
| same — 320 px wide | send at a 320 px viewport | `scrollWidth` 320 = `clientWidth` 320 | yes | `2026-11-02-show-narrow-320.png` |

**Wireframe comparison.** `images/pantalla-3-impacto.svg` rendered as `2026-11-02-show-wireframe.png`, next to
`2026-11-02-show-report-q2.png`. Same section order (Directo, Indirecto, Tests, Documentación, Historial, then the risk) and
the same origin tags per line («[grafo]» / «[git]», as text); the legend sits below the report instead of in a side box. The
known departures are recorded in `design.md` → Follow-ups: no «Uso de esta consulta» panel (E6, `/impact` makes no model call),
no impact graph (proposal Non-goals), no icon in the origin tag (P9), and documents without an origin tag (P2).

## Evidence

Script output (verbatim, long lines abridged with «…» only inside the report sections already quoted above):

```
browser: "156.0.8078.74"
query_log impact rows before: 0
h1 per path: {"/":"Elige un proyecto para explorar","/p/a794456d-6d1b-5b55-a360-13fec83dc7bc":"acme-shop","/no-existe":"Página no encontrada","/p/a794456d-6d1b-5b55-a360-13fec83dc7bc/impact":"acme-shop"}
opening Screen 3: {"requests":0,"hops":"2","status":"","navTarget":"/p/a794456d-6d1b-5b55-a360-13fec83dc7bc"}
after Screen 2 link: "http://localhost:5173/p/a794456d-6d1b-5b55-a360-13fec83dc7bc/impact"
request body: "{\"change\":\"cambiar los descuentos de DiscountService\",\"maxHops\":2}"
field keeps text: "  cambiar los descuentos de DiscountService  "
Q2 sections: {"Directo":[…6 entries…],"Indirecto":[…4 entries «2 saltos · heurística · [grafo]»…],"Tests":[…3 entries…],"Documentación":["README.md · al día"],"Historial":["app/Services/ShippingService.php · co-cambia 100 % · PR #24, #33, #55 · [git]"],"Riesgo alto":"Riesgo alto10 ficheros afectados, 3 tests que cubren el cambio, 4 elementos directos sin test, 0 elementos directos con cadena solo heurística."}
Q2 status: "Informe de impacto recibido."
Q2 tail: ["Origen: [grafo] análisis estático determinista · [git] señal histórica de co-cambio","Informe determinista: sin llamada al modelo de lenguaje."]
rows after Q2: 1
hops 1: {"body":"{\"change\":\"cambiar los descuentos de DiscountService\",\"maxHops\":1}","counts":{"Directo":6,"Indirecto":"IndirectoSin elementos","Tests":2,"Documentación":1,"Historial":1,…}}
hops 3: {"body":"{\"change\":\"cambiar los descuentos de DiscountService\",\"maxHops\":3}","counts":{"Directo":6,"Indirecto":7,"Tests":3,"Documentación":1,"Historial":1,…}}
unknown: {"text":"○Sin ancla en el grafoEl cambio no nombra ningún símbolo ni fichero que CODEMIND encuentre en el grafo de este proyecto, así que no hay nada desde lo que calcular el impacto. Nombra una clase o un fichero, por ejemplo DiscountService.Motivo: no-anchor","status":"Sin ancla en el grafo."}
invalid: {"alert":"Describe el cambio en 5 a 500 caracteres.","newNode":true,"ariaInvalid":"true","requestsSent":0,"status":"Sin ancla en el grafo."}
other project: {"h1":"0b5c7f2e-1d3a-4e6b-8f90-1a2b3c4d5e6f","h2":0}
404 alert: ["No se ha podido obtener la respuesta.","La API no tiene este proyecto: vuelve a la selección de proyecto o indéxalo con la CLI.","Código: PROJECT_NOT_FOUND."]
429 alert: ["No se ha podido obtener la respuesta.","Demasiadas peticiones seguidas a la API.","Espera 30 s y vuelve a preguntar.","Código: RATE_LIMITED."]
synthetic MEDIUM: {"sections":{…,"Indirecto":"IndirectoSin elementos","Tests":"TestsSin elementos","Documentación":["docs/pricing.md · ⚠ desactualizada desde el commit 0123456"],"Historial":["app/Services/ShippingService.php · co-cambia 80 % · sin PR · [git]"],"Riesgo medio":"Riesgo medio<b>texto</b> de la API"},"bTags":0,"riskHeading":{"fg":"rgb(33, 37, 41)","bg":"rgb(248, 249, 250)","ratio":14.63},"riskText":{"fg":"rgb(73, 80, 87)","bg":"rgb(248, 249, 250)","ratio":7.76},"stale":{"fg":"rgb(92, 61, 0)","bg":"rgb(255, 249, 219)","ratio":9.34},"empty":{"fg":"rgb(73, 80, 87)","bg":"rgb(255, 255, 255)","ratio":8.18}}
synthetic LOW: {… same as MEDIUM, heading "Riesgo bajo" …}
leaving while pending: {"aborted":true,"alerts":0,"url":"http://localhost:5173/p/a794456d-6d1b-5b55-a360-13fec83dc7bc"}
tab order from body: ["SELECT:Saltos del grafo outline solid 2px","BUTTON:Analizar outline solid 2px","A:Volver a las preguntas outline solid 2px","BODY:… outline none","A:Volver a la selección de proyecto outline solid 2px"]
320px: {"scrollWidth":320,"clientWidth":320}
query_log impact rows created: 6
```

API errors probed directly (the UI never sends them, design D11):

```
curl -X POST …/a794456d-…/impact -d '{"change":"x","maxHops":2}'  → 400 VALIDATION_ERROR (change too_small)
curl -X POST …/a794456d-…/impact -d '{"change":"cambiar los descuentos de DiscountService","maxHops":9}' → 400 VALIDATION_ERROR (maxHops too_big)
```

The tab walk starts after `blur()` of the field, so Chrome's sequential focus starting point is the field and the first Tab
goes to the list; the cycle then leaves the page (BODY) and comes back to the back link. The full order from the document
body (back link, field, list, button, nav link) is pinned by the RTL test "The tab order of Screen 3 skips the report";
nothing inside the report took the focus.

Screenshots (all next to this report): `./2026-11-02-show-wireframe.png`, `./2026-11-02-show-report-q2.png`,
`./2026-11-02-show-unknown.png`, `./2026-11-02-show-invalid.png`, `./2026-11-02-show-rate-limit.png`,
`./2026-11-02-show-stale-medium.png`, `./2026-11-02-show-focus.png`, `./2026-11-02-show-narrow-320.png`. The step 11 screenshots
(`./2026-11-02-11-*.png`, including `./2026-11-02-11-api-down.png` with the API stopped) remain valid: no code changed since.

## State

- Before: `query_log` 0 rows in total (2026-11-02T16:49:14Z), 0 with capability `impact`.
- After the run: 6 `impact` rows (Q2, hops 1, hops 3, unknown, the tab-walk Q2 and the 320 px Q2; the invalid sends, the `404`
  and the intercepted answers added none), consistent with one row per answered or unknown send.
- Restored: yes. `delete from query_log where created_at > '2026-11-02T16:49:14Z'` → `DELETE 6`; `select count(*) from
  query_log` → 0. `node scripts/dev-processes.mjs stop` → «stopped 3 process trees».

## Not demonstrated

- A real `500 INTERNAL` and a real `INVALID_IMPACT_REQUEST` through the page: the UI cannot produce them (local validation, list
  limited to 1–3); they are covered by the RTL scenario "A rate limit, an API error and an unavailable API are alerted" and the
  unavailable API was shown with the API stopped in step 11 (`./2026-11-02-11-api-down.png`).

## Handoff

The change is demonstrably working: every browser-observable scenario of `impact-page`, the Screen 2 link of `ask-page` and the
two development-server scenarios of `web-foundation` were exercised against the running system with the outputs above, the
database is back to its initial state, and no screenshot was left at the repository root.
