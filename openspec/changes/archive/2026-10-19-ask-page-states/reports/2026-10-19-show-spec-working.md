# Show Spec Working — ask-page-states (DIS-66)

- Date: 2026-10-19
- Task: 15.2 (pre-merge review, autonomous run of Entrega 2, ADR `20261016-autonomous-workflow-run-entrega-2`)
- Environment: Windows 11, headless Chromium (patchright, browser-automation skill; the Playwright MCP is
  disabled in this run). The real `packages/api` server against the local seeded Postgres
  (`codemind-postgres-1`) in evaluation mode (every `LLM_*` removed from its environment by the launcher),
  and the Vite dev server of `packages/web` on `5173` (its proxy forwards `/api` to `3000`).
- Visual reference: `images/pantalla-2-consulta.svg` (readme §1.3), rendered as
  [`2026-10-19-ssw-wireframe-2.png`](./2026-10-19-ssw-wireframe-2.png). The wireframe only draws an answer
  with its usage strip; the `UNKNOWN` states and the alerts have no wireframe and are checked against the
  colours of the spec and design D30.

Fresh run, independent of the step 12 run (new screenshots, prefix `2026-10-19-ssw-`). The states the
real API cannot produce in evaluation mode (an answer from the model, a negative saving, a future reason,
the API's message as markup, the two `429`s) were produced by intercepting `POST …/ask` in the browser
(`page.route`) with the bodies of the spec; everything else hit the real API.

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| Screen 2 opens on a sample project without any request | open `/p/a794456d-…` | one `status` element, empty; 0 API requests | yes | script `open` |
| An answered question shows … (status «Respuesta recibida.») + The usage panel and the states follow the wireframe (answer) | press Q1, real API (cache hit) | answer, 4 evidence, region «Uso» after «Evidencia»; status «Respuesta recibida.»; focus on Q1 | yes | `ssw-answer-cache-hit.png` |
| A cache hit shows its usage panel | same | «Confianza 0.78 · 0 tokens · $0 · 67 ms», «ahorro 100 % vs bruto», «caché ✓», «7 123 tokens sin selección de contexto → 0 con CODEMIND»; no «sin caché»; 1 U+00A0 (7 123); « · » hidden; 0 controls | yes | `ssw-answer-cache-hit.png` |
| An answer from the model shows its usage panel | Q2 with the spec's body intercepted | «Confianza 0.71 · 4 812 tokens · $0.014 · 2.1 s», «ahorro 88 % vs bruto», «sin caché», «41 200 tokens sin selección de contexto → 4 000 con CODEMIND»; 3 U+00A0; « · » hidden; 0 controls; after «Evidencia» | yes | `ssw-answer-model.png` |
| No saving is not shown as a saving | Q2 intercepted, `savingsPct -24.9` | «sin ahorro vs bruto», no «ahorro -», no «%» | yes | script `negative` |
| An UNKNOWN without anchors explains that there is no evidence | «¿Por qué existe legacy_ref?», real API | «○ Sin respuesta verificada», the `no-anchor` sentence, «Motivo: no-anchor»; no region «Uso», no alert; focus on the field; status «Sin respuesta verificada.» | yes | `ssw-no-anchor.png` |
| Every other reason without evidence has its own sentence (`a-future-reason`) | Q2 intercepted | the general sentence and «Motivo: a-future-reason», muted colours | yes | script `futureReason` |
| An UNKNOWN that needs a language model shows the configuration notice | «¿Qué hace OrderService?», real API | heading, paragraph with `code` «LLM_*», suggestions line, «Mensaje de la API: evaluation mode (cache-only): set LLM_* to enable free-form asks»; accent pair; focus on the field; status «Hace falta un modelo de lenguaje.» | yes | `ssw-llm-required.png` |
| Texts of the API in a state are shown as text | `message` «<img src=x onerror=alert(1)>» intercepted | «Mensaje de la API: <img src=x onerror=alert(1)>» as text; 0 `img` in `main`; no page error | yes | script `markup` |
| Q1 again, literally (readme §1.3 step 5) | type Q1 + Enter, real API | «caché ✓», «$0», «0 tokens»; status «Respuesta recibida.» | yes | script `q1Again` |
| Sending the same invalid question again announces the message again | «hola» + Enter twice | 1 alert, a new node (the first one disconnected), the field's description resolves to it; status unchanged | yes | script `hola` |
| An exhausted budget says the cached questions still answer | `429 BUDGET_EXHAUSTED` intercepted | the 5 lines in order; warning pair; status empty; no button; focus on Q2 | yes | `ssw-budget.png` |
| A rate limit says how long to wait | `429 RATE_LIMITED` intercepted | the 4 lines with «Espera 42 s…»; no «caché»; focus on Q2 | yes | `ssw-rate-limit.png` |
| An API error names its code (`PROJECT_NOT_FOUND`) | `/p/0b5c7f2e-…`, real API `404` | «No se ha podido obtener la respuesta.», the project sentence, «Código: PROJECT_NOT_FOUND.» | yes | `ssw-project-not-found.png` |
| An unavailable API says so | API process stopped, Q2 (the Vite proxy answers `500` with an empty body) | exactly «No se ha podido obtener la respuesta.» and «La API de CODEMIND no responde.»; status empty and 1×1 px (`sr-only`); focus on Q2 | yes | `ssw-api-down.png` |
| The focus is visible on every control | Tab ×10, Shift+Tab ×3 with a real answer | every control `:focus-visible`, `solid 2px` outline; nothing focused inside «Uso» | yes | `ssw-focus.png` |
| The usage panel and the states follow the wireframe (320 px) | viewport 320 | `scrollWidth` 320; region ends at x = 287; both badges one line (20 px); nothing clipped | yes | `ssw-narrow-320.png` |
| The status region announces every outcome | across the run | one `status` throughout: «» → «Respuesta recibida.» → «Sin respuesta verificada.» → «Hace falta un modelo de lenguaje.» → «Respuesta recibida.» → «» with each alert; never visible | yes | script `status` fields |

## Evidence

Commands (scripts in the session scratchpad, not committed):

```
docker ps                                   -> codemind-postgres-1 Up 3 days (healthy)
node --env-file=.env <scratchpad>/dbstate.mjs snapshot
node --env-file=.env <scratchpad>/api-eval.mjs          # API, LLM_* removed, listening on 127.0.0.1:3000
npm -w packages/web run dev                              # Vite 5.4.21 on 5173
node <browser-automation>/browser.mjs http://localhost:5173/p/a794456d-6d1b-5b55-a360-13fec83dc7bc \
  --wait h1 --script <scratchpad>/ssw66-up.mjs --timeout 60000
Stop-Process <owner of 3000 only>
node <browser-automation>/browser.mjs http://localhost:5173/p/a794456d-6d1b-5b55-a360-13fec83dc7bc \
  --wait h1 --script <scratchpad>/ssw66-down.mjs
node <browser-automation>/browser.mjs file:///<scratchpad>/wire2.html --script <scratchpad>/ssw66-wire.mjs
Stop-Process <owner of 5173>
node --env-file=.env <scratchpad>/dbstate.mjs check; ... restore
```

Requests recorded by the page (12 `POST`, bodies verbatim; the intercepted ones never reached the API):

```
POST /api/projects/a794456d-6d1b-5b55-a360-13fec83dc7bc/ask {"question":"¿Cómo se calcula el precio final de un pedido?"}
POST /api/projects/a794456d-6d1b-5b55-a360-13fec83dc7bc/ask {"question":"¿Por qué existe legacy_ref?"}
POST /api/projects/a794456d-6d1b-5b55-a360-13fec83dc7bc/ask {"question":"¿Qué hace OrderService?"}
POST /api/projects/a794456d-6d1b-5b55-a360-13fec83dc7bc/ask {"question":"¿Cómo se calcula el precio final de un pedido?"}
POST …/ask {"question":"¿Cómo se validan los cupones?"}   x2  (intercepted: model answer, savings -24.9)
POST …/ask {"question":"¿Qué hace OrderService?"}          (intercepted: markup message)
POST …/ask {"question":"¿Cómo se validan los cupones?"}   x3  (intercepted: future reason, 429 budget, 429 rate limit)
POST /api/projects/a794456d-6d1b-5b55-a360-13fec83dc7bc/ask {"question":"¿Cómo se calcula el precio final de un pedido?"}
POST /api/projects/0b5c7f2e-1d3a-4e6b-8f90-1a2b3c4d5e6f/ask {"question":"¿Qué hace OrderService?"}
```

Page errors: none. Console: only Chromium's «Failed to load resource» for the provoked `429`, `404` and
`500` responses.

Colours (computed styles):

| Element | Text | Background | Border |
|---|---|---|---|
| usage band | — | `rgb(248, 249, 250)` canvas | — |
| «ahorro … % vs bruto» | `rgb(30, 111, 49)` success | `rgb(211, 249, 216)` success-soft | — |
| «caché ✓» | `rgb(25, 113, 194)` accent | `rgb(231, 245, 255)` accent-soft | — |
| «sin caché» | `rgb(73, 80, 87)` ink-muted | `rgb(248, 249, 250)` canvas | border |
| `UnknownState` | `rgb(73, 80, 87)` ink-muted | canvas | `1px rgb(222, 226, 230)` |
| `LlmRequiredNotice` | `rgb(25, 113, 194)` accent | `rgb(231, 245, 255)` accent-soft | none |
| alerts | `rgb(92, 61, 0)` warning-ink | `rgb(255, 249, 219)` warning-soft | `1px rgb(255, 212, 59)` |

Tab sequence with the Q1 answer (from the last pressed suggestion): «¿Cómo se validan los cupones?», «¿Qué
hace OrderObserver…», `ev-1`…`ev-4`, the document, «Volver a la selección de proyecto», the field,
«Preguntar»; Shift+Tab: the field, the back link, `ev-4`. Every entry `fv=true`, `solid 2px`, `inUso=false`.

### Against the wireframe

Side by side, [`2026-10-19-ssw-wireframe-2.png`](./2026-10-19-ssw-wireframe-2.png) and
[`2026-10-19-ssw-answer-model.png`](./2026-10-19-ssw-answer-model.png) (the same figures as the wireframe):
one light band after the evidence, separated by a rule; «Confianza **0.71** · 4 812 tokens · $0.014 · 2.1 s»
on one line followed by the green «ahorro 88 % vs bruto» badge; the baseline line under them; no visible
title. Deviations, all recorded in design.md: the baseline line ends «→ 4 000» (input only, D2) where the
wireframe repeats 4 812; the badge reads «sin caché» in muted colours on a miss (D5; the wireframe only
draws «caché ✓», shown in [`2026-10-19-ssw-answer-cache-hit.png`](./2026-10-19-ssw-answer-cache-hit.png));
the baseline line is `ink-muted`, darker than the wireframe's `#adb5bd` (D6); the section is named «Uso»
for assistive technology only (D6).

Screenshots (all under this folder):

- [`2026-10-19-ssw-wireframe-2.png`](./2026-10-19-ssw-wireframe-2.png) — the wireframe, rendered
- [`2026-10-19-ssw-answer-cache-hit.png`](./2026-10-19-ssw-answer-cache-hit.png) — Q1 from the real API, `ev-1` expanded
- [`2026-10-19-ssw-answer-model.png`](./2026-10-19-ssw-answer-model.png) — an answer from the model (intercepted)
- [`2026-10-19-ssw-no-anchor.png`](./2026-10-19-ssw-no-anchor.png) — `UNKNOWN` `no-anchor`
- [`2026-10-19-ssw-llm-required.png`](./2026-10-19-ssw-llm-required.png) — configuration notice
- [`2026-10-19-ssw-budget.png`](./2026-10-19-ssw-budget.png), [`2026-10-19-ssw-rate-limit.png`](./2026-10-19-ssw-rate-limit.png) — the two `429`s
- [`2026-10-19-ssw-project-not-found.png`](./2026-10-19-ssw-project-not-found.png) — `PROJECT_NOT_FOUND`
- [`2026-10-19-ssw-api-down.png`](./2026-10-19-ssw-api-down.png) — API stopped
- [`2026-10-19-ssw-focus.png`](./2026-10-19-ssw-focus.png), [`2026-10-19-ssw-narrow-320.png`](./2026-10-19-ssw-narrow-320.png) — focus pass and 320 px

## State

- Before: `query_log` 3 rows, `claim` 0 rows, acme-shop `cache_entry.hit_count` 0 / 0 / 0.
- After (before restore): `query_log` 8 (+5: the five asks that reached the API for acme-shop; the
  `PROJECT_NOT_FOUND` ask writes no row), `claim` 0, `hit_count` of «como se calcula el precio final de un
  pedido» 3.
- Restored: yes — deleted the 5 `query_log` rows created after the snapshot's database clock and reset
  `hit_count`/`last_hit_at` of the acme-shop cache entries; re-check: `query_log` 3, `claim` 0, `hit_count`
  0 / 0 / 0. Both processes stopped (no listener on `3000` nor `5173`).

## Not demonstrated

- The `UNKNOWN` reasons `over-budget`, `invalid-model-output`, `no-evidence`, `broken-evidence`, the
  `503`s and the `500 INTERNAL` / «<i>X</i>» codes were not driven in the browser: they go through the same
  components as the demonstrated `a-future-reason` and `PROJECT_NOT_FOUND`, and are pinned by the RTL
  scenarios and the axe scans (step 11 report).
- Real screen-reader speech (NVDA/JAWS not available): the status region's text sequence and the new
  alert node were inspected in the DOM (design → Risks).

## Handoff

The change is demonstrably working: every browser-visible scenario of the delta was exercised against the
running web client and the real API (or an intercepted body of the spec where evaluation mode cannot
produce it), and each result matches its `THEN`. No screenshot was left at the repository root.
