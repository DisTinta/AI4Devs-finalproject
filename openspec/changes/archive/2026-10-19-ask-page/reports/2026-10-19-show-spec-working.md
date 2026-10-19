# Show Spec Working — ask-page (DIS-65)

- Date: 2026-10-19
- Change: ask-page (DIS-65), task 15.2
- Run by the agent in the autonomous run of Entrega 2 (ADR `20261016-autonomous-workflow-run-entrega-2`),
  in its own context. Windows 11, Vite on `5173`, headless Chromium (patchright, through the
  browser-automation skill; the Playwright MCP server was not used).
- Branch `feature/DIS-65-ask-page` at `c3ae597` plus the fix of finding S1 (below). The pull request
  (task 15.1) is not open yet: in this autonomous run the pre-merge reviews run before the pull request is
  opened, as in DIS-60.

The real API (`packages/api`) ran against the local seeded Postgres (`codemind-postgres-1`, healthy;
acme-shop and its golden answers stored), with the local `.env` exported into its process only (never
printed) and every `LLM_*` variable unset, so it ran in evaluation mode: the three golden questions are
answered from the answer cache and any other question gets `UNKNOWN` `llm-required`. Two processes:

- `npx tsx --tsconfig packages/api/tsconfig.run.json packages/api/src/server.ts` (no watch)
- `npm -w packages/web run dev`

The scripts (`ssw65-*.mjs`, `dbstate.mjs`) live in the session scratchpad and are not committed. Paths
below mask them as `<scratchpad>` and `<browser-automation>`.

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| Screen 2 opens on a sample project without any request | open `/p/a794456d-6d1b-5b55-a360-13fec83dc7bc` | banner «←», «acme-shop», «PHP / Laravel · 170 aristas», no «CODEMIND»; field, «→», «Prueba:» and the three golden questions in order; 0 `status`/`alert`; **0 requests** to `/api` or `/health` | yes | `./2026-10-19-ssw-empty.png`, output A |
| A suggested question is sent at once | press «¿Cómo se calcula el precio final de un pedido?» | one `POST /api/projects/a794456d-…/ask` with body `{"question":"¿Cómo se calcula el precio final de un pedido?"}`; `status` «Buscando evidencia…» while pending | yes | output A |
| An answered question shows the answer, its statements and its evidence (live golden answer) | same press, wait for «Respuesta» | `h2` «Respuesta» and «Evidencia» (upper-cased by CSS only); answer paragraph with `compute()` and `PriceCalculator` in `code`; four ordered statements: two «● HECHO · ✓ verificado», two «⚠ INFERIDO · ○ sin verificar», each with «Evidencia: ev-N»; no «0.71», no «Confianza» | yes | `./2026-10-19-ssw-answer-expanded.png`, output A |
| Statement colours follow the wireframe | same screen | green stripe on facts, yellow box and border on inferences, green «HECHO»/«verificado», yellow-brown «INFERIDO», grey «sin verificar» (the computed colours of the step 12 table) | yes | `./2026-10-19-ssw-answer-expanded.png` |
| Evidence expands with the keyboard | three `Tab` from the pressed suggestion reach «▸ev-1 · app/Services/PriceCalculator.php:16-44»; `Enter` | `aria-expanded="true"`, «▾», a 29-line `pre`; the other three stay `false` | yes | output A |
| An UNKNOWN shows the provisional status | type «¿Dónde se registran los eventos de pedido?» + Enter | `status` «Sin respuesta verificada (motivo: llm-required).»; 0 `alert`; 0 `h2` | yes | `./2026-10-19-ssw-unknown.png`, output A |
| An invalid question is not sent | «hola» + Enter | `alert` «Escribe una pregunta de 5 a 500 caracteres.», `aria-invalid="true"`, **0 new requests** | yes | `./2026-10-19-ssw-invalid.png`, output A |
| A project outside the sample constant is shown by its id; an API error shows the provisional alert with its code | open `/p/0b5c7f2e-1d3a-4e6b-8f90-1a2b3c4d5e6f`, «¿Cómo se validan los cupones?» + Enter | `h1` is the id; 0 groups (no suggestions); `alert` «⚠ No se ha podido obtener la respuesta. Código: PROJECT_NOT_FOUND.» (the API's `404`) | yes (the `429` code goes through the same branch, covered by its component test) | `./2026-10-19-ssw-unknown-project.png`, output A |
| Leaving the page | open Screen 2, click «Volver a la selección de proyecto» | `h1` «Elige un proyecto para explorar» | yes | output A |
| An unavailable API shows the provisional alert | API process stopped (port `3000` closed), press «¿Cómo se validan los cupones?» | `alert` «⚠ No se ha podido obtener la respuesta. La API de CODEMIND no responde.»; no button in it; focus on the pressed button; Vite's proxy answers `500` (the one console error, expected) | yes | `./2026-10-19-ssw-api-down.png`, output B |
| The development server serves the three paths | `/`, `/p/<id>`, `/p/<unknown id>` | each renders its screen (`/no-existe` checked in step 12.4) | yes | output A |
| Screen 2 at 320 px with every evidence expanded, axe in a real browser | viewport 320 and 960 px; each golden question; every evidence expanded; `axe-core` run in Chromium (it computes layout, unlike jsdom) | **before the fix: `scrollable-region-focusable` at 320 px** (finding S1); after it: 0 violations in the six runs, no horizontally scrolling `pre`, document width equal to the viewport | yes after the fix | `./2026-10-19-ssw-narrow-320.png`, `./2026-10-19-ssw-narrow-320-fixed.png`, outputs C and D |
| Wireframe comparison | `images/pantalla-2-consulta.svg` rendered as an image next to the running page | see "Comparison with the wireframe" | yes, with the recorded deviations | `./2026-10-19-ssw-wireframe-2.png`, `./2026-10-19-ssw-answer-expanded.png` |

The pure scenarios ("How a question, an answer and an evidence location are written"), the coherence
test, the double-send, time-limit, abort and replacement scenarios and the jsdom axe gate are unit or
component checks: `npx vitest run packages/web tests/a11y tests/unit/seed` ran green after the fix (16
files, 68 tests).

## Comparison with the wireframe (`images/pantalla-2-consulta.svg`)

| Element | Wireframe | Running page | Verdict |
|---|---|---|---|
| Frame | one white rounded card, dark project bar on top | same | match |
| Project bar | «← acme-shop │ PHP/Laravel · 1 840 aristas», ⟳ on the right | «← acme-shop │ PHP / Laravel · 170 aristas», no ⟳ | intended deviation (D3: the seed's figure, no indexing from the web) |
| Question box | one-line field holding Q1, light-blue «→» | one-line field, placeholder «Pregunta sobre el código de acme-shop», then the sent question; «→» in `accent` | intended deviation (D4: placeholder, contrast) |
| Suggestions | «Prueba:» + three pills: «¿Cómo se validan los cupones?», «¿Qué hace OrderObserver?», «¿Por qué existe legacy_ref?» | «Prueba:» + the three golden questions as pills, wrapping beside the label | intended deviation (D5, D34) |
| RESPUESTA | upper-case grey heading, divider, paragraph with `PriceCalculator::compute()` in italic accent | same heading and divider; code fragments in accent **monospace** | deviation not recorded before → S3 |
| Statements | numbered lines with a green stripe and «✓ verificado» **on the right**; one separate yellow box «⚠ … INFERIDO» at the end | ordered list, each statement in place; green stripe on facts, yellow box per inference; badges «HECHO»/«INFERIDO» + «verificado»/«sin verificar» **under** the text, then «Evidencia: ev-N» | type and verification badges, inferences in place: intended (D8); badges under the text: not recorded before → S2 |
| EVIDENCIA | heading, one bordered row per evidence «▸ path:range» in sans-serif, «entailed» badge on the right, a PR row | heading, one bordered button per evidence «▸ ev-N · path:range» in **monospace**, no badge, no PR row | badge and PR row: intended (D11); id prefix: spec; monospace: not recorded before → S3 |
| Usage strip | «Confianza 0.71 · 4 812 tokens · $0.014 · 2.1 s», savings, cache | not shown | intended (D9, DIS-66) |
| Provisional notices | not drawn | warning `alert` or muted `status` in the result area | intended (D10) |

## Findings

| # | Severity | Finding | Fix |
|---|---|---|---|
| S1 | Major | At 320 px an expanded excerpt whose lines are wider than the card was a horizontally scrolling `pre` with no focusable content: axe `scrollable-region-focusable` (serious; WCAG 2.1.1), so a keyboard user could not scroll to the end of a line. The jsdom gate cannot see it (no layout) | fixed in this change: the `pre` wraps its lines (`whitespace-pre-wrap`, `overflow-wrap: break-word`) instead of scrolling, so it is never a scroll region and adds no tab stop; its text content is unchanged (the expand scenarios stay green). Re-run: 0 violations at 320 and 960 px with every evidence of the three golden answers expanded (design D37) |
| S2 | Minor | The statement badges sit under the text, not on the right as in the wireframe; not written down as a deviation | recorded as a deviation in design D37: under the text the badges never collide with a long statement and the layout is the same at 320 px |
| S3 | Minor | Code fragments and evidence locations are monospace (wireframe: italic accent and sans-serif); not written down as a deviation | recorded in design D37: monospace marks code without relying on colour alone, and a location is code (a path and a line range) |

## Evidence

Output A — `node <browser-automation>/browser.mjs http://localhost:5173/ --script <scratchpad>/ssw65-up.mjs`
(abridged; the full JSON was read in the run):

```
emptyRequests: 0, statusOrAlert: 0, pending: "Buscando evidencia…"
focused: "▸ev-1 · app/Services/PriceCalculator.php:16-44"
h2: [["Respuesta","uppercase"],["Evidencia","uppercase"]]
items: ["El método compute() en la clase PriceCalculator es el encargado de calcular el precio final de un pedido. | ● | HECHO | ✓ | verificado | Evidencia: ev-1",
        "Primero se aplica el descuento al subtotal. | ● | HECHO | ✓ | verificado | Evidencia: ev-2",
        "Luego se calcula el impuesto sobre el valor descontado. | ⚠ | INFERIDO | ○ | sin verificar | Evidencia: ev-3",
        "Finalmente se suman el impuesto y el envío al valor descontado para obtener el precio final. | ⚠ | INFERIDO | ○ | sin verificar | Evidencia: ev-4"]
evidence: [["▾ev-1 · app/Services/PriceCalculator.php:16-44","true"],["▸ev-2 · …","false"],["▸ev-3 · …","false"],["▸ev-4 · …","false"]]
pre: 29 lines; "0.71" or "Confianza" on the page: false
unknown: {status: "Sin respuesta verificada (motivo: llm-required).", alerts: 0, h2: 0}
invalid: {alert: "Escribe una pregunta de 5 a 500 caracteres.", ariaInvalid: "true", newRequests: 0}
notFound: {h1: "0b5c7f2e-1d3a-4e6b-8f90-1a2b3c4d5e6f", alert: "⚠ No se ha podido obtener la respuesta. Código: PROJECT_NOT_FOUND.", groups: 0}
back: "Elige un proyecto para explorar"
api: POST /api/projects/a794456d-…/ask {"question":"¿Cómo se calcula el precio final de un pedido?"}
     POST /api/projects/a794456d-…/ask {"question":"¿Dónde se registran los eventos de pedido?"}
     POST /api/projects/0b5c7f2e-…/ask {"question":"¿Cómo se validan los cupones?"}
     GET /health (twice: Screen 1 after the back link)
console errors: 1 (the 404 of PROJECT_NOT_FOUND, expected)
```

Output B — API stopped, `--script <scratchpad>/ssw65-down.mjs`:

```
{"alert": "⚠ No se ha podido obtener la respuesta. La API de CODEMIND no responde.", "buttons": 0, "focus": true}
console: one 500 from Vite's proxy (expected with the API down)
```

Output C — 320 px, before the fix (`ssw65-narrow.mjs`, Q4 with `ev-1` expanded; then `ssw65-axe.mjs`, Q1
with `ev-1` expanded, axe-core evaluated in the page):

```
{"docScroll": 320, "vw": 320, "pre": {"sw": 499, "cw": 252, "ox": "auto"}, "wide": []}
320: violations ["scrollable-region-focusable: 1"], pre tabindex null, pre scrolls true
960: violations [], pre scrolls false
```

Output D — after the fix (`ssw65-axe2.mjs`: 320 and 960 px × the three golden questions, every evidence
expanded):

```
each of the six runs: violations [], scrolling pre 0, white-space "pre-wrap", overflow-wrap "break-word",
document width = viewport width
```

Screenshots next to this report: `2026-10-19-ssw-wireframe-2.png`, `2026-10-19-ssw-empty.png`,
`2026-10-19-ssw-answer-expanded.png`, `2026-10-19-ssw-unknown.png`, `2026-10-19-ssw-invalid.png`,
`2026-10-19-ssw-unknown-project.png`, `2026-10-19-ssw-api-down.png`, `2026-10-19-ssw-narrow-320.png`,
`2026-10-19-ssw-narrow-320-fixed.png`.

## State

- Before each of the two live runs: `query_log` 3 rows, `claim` 0, acme-shop cache hits 0 / 0 / 0.
- After the first run: `query_log` 5, Q1 hits 1; after the second: `query_log` 13, hits 5 / 2 / 3.
- Restored: yes. `node <scratchpad>/dbstate.mjs restore` after each run deleted the `query_log` rows
  newer than its snapshot (2, then 10) and reset `hit_count` and `last_hit_at` of the touched cache
  entries; `check` then gave `query_log` 3, `claim` 0, hits 0 / 0 / 0 and no newer row. Both processes
  stopped (ports `3000` and `5173` closed).

## Not demonstrated

- The `429` `BUDGET_EXHAUSTED` alert against the live API: forcing it needs an exhausted LLM budget,
  which evaluation mode never reaches. It shares the `ApiError` branch with the live `PROJECT_NOT_FOUND`
  above and has its own component test.
- Screen readers announcing the status and the alert (design D25, DIS-66).

## Handoff

The change is **demonstrably working** against the real API and database: every live scenario matched its
`THEN`; the one accessibility defect that only real layout shows (S1) was fixed in this change and
re-checked in the browser; and the wireframe deviations are all recorded (D3–D11, D34, D37). No screenshot
was left at the repository root (`git status --short` shows none outside this folder).
