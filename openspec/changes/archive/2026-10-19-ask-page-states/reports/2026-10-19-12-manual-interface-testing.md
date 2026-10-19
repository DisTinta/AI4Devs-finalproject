# Manual Interface Testing Report

- Date: 2026-10-19
- Change: ask-page-states (DIS-66)
- Step: 12 — Manual Interface Testing (and 13 — End-to-End Testing)

Run by the agent in the autonomous run of Entrega 2 (ADR `20261016-autonomous-workflow-run-entrega-2`),
Windows 11, headless Chromium (patchright, through the browser-automation skill). The API was the real
`packages/api` server against the local seeded Postgres (`codemind-postgres-1`), started from a small
launcher that loads the local `.env` with `node --env-file` (values never printed) and deletes every
`LLM_*` variable before spawning the server, so the API ran in evaluation mode: the golden questions are
answered from the answer cache and any other question with anchors gets `UNKNOWN` `llm-required`.

## Commands executed

- `docker ps` (Postgres `codemind-postgres-1` healthy); `node --env-file=.env --import tsx
  packages/cli/src/index.ts projects` (12.1)
- `node --env-file=.env <scratchpad>/dbstate.mjs snapshot` (prints only the `count(*)` of `query_log` and
  `claim` and the `hit_count` of each acme-shop `cache_entry`; keeps `hit_count`, `last_hit_at` and the
  database clock for the restore)
- the API, process 1: `node --env-file=.env <scratchpad>/api-eval.mjs` (unsets `LLM_*`, then
  `npx tsx --tsconfig packages/api/tsconfig.run.json packages/api/src/server.ts`, no watch)
- the web, process 2: `npm -w packages/web run dev` (Vite on `5173`)
- `node <browser-automation>/browser.mjs http://localhost:5173/p/a794456d-6d1b-5b55-a360-13fec83dc7bc
  --wait h1 --script <scratchpad>/qa-answer.mjs` (12.2), `--script qa-states.mjs` (12.3), `--script
  qa-alerts.mjs` (12.4: `page.route` on `**/ask` for the two `429` bodies of the spec, then
  `/p/0b5c7f2e-1d3a-4e6b-8f90-1a2b3c4d5e6f` against the real API), `--script qa-focus.mjs` (12.5)
- `Stop-Process` on the owner of port `3000` only, then `--script qa-down.mjs` (12.4)
- `Stop-Process` on the owner of port `5173`; `dbstate.mjs check`, `restore`, `check` (12.6)

The scripts live in the session scratchpad and are not committed.

## Test results

### 12.1 — Preconditions

- Postgres container up (healthy); `DATABASE_URL` present in the local `.env`; no `LLM_*` in the API's
  environment.
- `projects` → `acme-shop  a794456d-6d1b-5b55-a360-13fec83dc7bc  php/laravel  174 nodes · 170 edges
  2024-05-06T09:31:00.000Z sample`: acme-shop and its golden answers are stored, so `npm run db:seed` did
  not run.
- Baseline: `query_log` **3** rows, `claim` **0** rows; acme-shop `cache_entry.hit_count`: «como se calcula
  el precio final de un pedido» 0, «como se validan los cupones» 0, «que hace orderobserver al crear un
  pedido» 0.

### 12.2 — Readme §1.3 walkthrough, steps 1 and 2: answer and usage panel

- Status region on open: empty. Q1 pressed: exactly one `POST
  /api/projects/a794456d-6d1b-5b55-a360-13fec83dc7bc/ask` with `{"question":"¿Cómo se calcula el precio
  final de un pedido?"}`; then the golden answer (four statements, four evidence buttons) and the region
  «Uso»; status region «Respuesta recibida.».
- Region text: «Confianza 0.78 · 0 tokens · $0 · 87 ms», «ahorro 100 % vs bruto», «caché ✓», «7 123 tokens
  sin selección de contexto → 0 con CODEMIND» — a cache hit, as design D15 expects in evaluation mode. The
  `h2` «Uso» has no visible box (`sr-only`).
- Keyboard: three `Tab` from the pressed suggestion reached `ev-1` (`:focus-visible` true), `Enter`
  expanded it (`aria-expanded="true"`).
- Colours (computed styles; design D5, D6, D30):

  | Element | Text | Background | Border |
  |---|---|---|---|
  | usage band | `rgb(73, 80, 87)` ink-muted | `rgb(248, 249, 250)` canvas | — |
  | confidence figure «0.78» | `rgb(33, 37, 41)` ink, bold | — | — |
  | « · » separators | `rgb(73, 80, 87)` ink-muted (hidden from AT) | — | — |
  | «ahorro 100 % vs bruto» | `rgb(30, 111, 49)` success | `rgb(211, 249, 216)` success-soft | — (`nowrap`) |
  | «caché ✓» | `rgb(25, 113, 194)` accent | `rgb(231, 245, 255)` accent-soft | — (`nowrap`) |
  | baseline line | `rgb(73, 80, 87)` ink-muted | canvas | — |

  The wireframe's green and blue badges and the light band after the evidence match; the baseline line is
  darker than the wireframe's `#adb5bd` (D6). Screenshot:
  [`2026-10-19-12-answer-usage.png`](./2026-10-19-12-answer-usage.png).

### 12.3 — Steps 3 and 5: no anchor, a free question, Q1 again, «hola» twice

- «¿Por qué existe legacy_ref?» gave `no-anchor` (no other question was needed): «○ Sin respuesta
  verificada», the `no-anchor` sentence and «Motivo: no-anchor»; box `ink-muted` on `canvas` with a 1px
  `border` (`rgb(222, 226, 230)`), heading `ink`; status region «Sin respuesta verificada.»; focus still
  on the field. Screenshot: [`2026-10-19-12-no-anchor.png`](./2026-10-19-12-no-anchor.png).
- «¿Qué hace OrderService?» → the configuration notice «Hace falta un modelo de lenguaje», the evaluation
  paragraph with `LLM_*` in `code`, «Las preguntas sugeridas siguen respondiendo desde la caché.» and
  «Mensaje de la API: evaluation mode (cache-only): set LLM_* to enable free-form asks»; text and `code`
  `rgb(25, 113, 194)` accent on `rgb(231, 245, 255)` accent-soft; status region «Hace falta un modelo de
  lenguaje.». Screenshot: [`2026-10-19-12-llm-required.png`](./2026-10-19-12-llm-required.png).
- Q1 typed literally and sent → «caché ✓», «$0», «0 tokens», «ahorro 100 % vs bruto»; status region
  «Respuesta recibida.». Screenshot: [`2026-10-19-12-q1-repeated.png`](./2026-10-19-12-q1-repeated.png).
- «hola» + Enter, then Enter again: the first alert node was disconnected and a new one inserted (one
  `alert`, the field's `aria-describedby` resolves to it, text «Escribe una pregunta de 5 a 500
  caracteres.»); the status region kept «Respuesta recibida.». Accessibility tree of the form after the
  first send: `textbox "Pregunta" [invalid]`, `button "Preguntar"`, `alert: Escribe una pregunta de 5 a 500
  caracteres.`.

### 12.4 — The alerts

All in `rgb(92, 61, 0)` warning-ink on `rgb(255, 249, 219)` warning-soft with a 1px `rgb(255, 212, 59)`
warning-border; status region empty; no button; the focus stays where it was.

- `429` `BUDGET_EXHAUSTED` (intercepted, body of the spec): «No se ha podido obtener la respuesta.», «Se ha
  agotado el presupuesto diario del modelo de lenguaje.», «Las preguntas que ya están en caché siguen
  respondiendo, sin coste.», «El presupuesto se renueva el 2026-10-20 a las 00:00 UTC.», «Código:
  BUDGET_EXHAUSTED.». Screenshot: [`2026-10-19-12-budget.png`](./2026-10-19-12-budget.png).
- `429` `RATE_LIMITED` (intercepted): «No se ha podido obtener la respuesta.», «Demasiadas peticiones
  seguidas a la API.», «Espera 42 s y vuelve a preguntar.», «Código: RATE_LIMITED.». Screenshot:
  [`2026-10-19-12-rate-limit.png`](./2026-10-19-12-rate-limit.png).
- `/p/0b5c7f2e-1d3a-4e6b-8f90-1a2b3c4d5e6f` with the real API: «La API no tiene este proyecto: vuelve a la
  selección de proyecto o indéxalo con la CLI.», «Código: PROJECT_NOT_FOUND.». Screenshot:
  [`2026-10-19-12-project-not-found.png`](./2026-10-19-12-project-not-found.png).
- API stopped (the Vite proxy answers `500` with an empty body), Q3 pressed: «No se ha podido obtener la
  respuesta.», «La API de CODEMIND no responde.»; the status region is empty and has no visible box.
  Screenshot: [`2026-10-19-12-api-down.png`](./2026-10-19-12-api-down.png).
- The only console errors are Chromium's own «Failed to load resource» lines for the `429`, `404` and
  `500` responses the step provoked.

### 12.5 — Keyboard and focus pass ("The focus is visible on every control")

With the Q1 answer shown, twelve `Tab` and four `Shift+Tab`: the focus cycled through the suggestions, the
four evidence buttons, the document, the back link, the field, «Preguntar» and the suggestions again, and
back. Every control had `:focus-visible` and a `solid 2px` outline (`rgb(25, 113, 194)` accent; white on
the dark banner for «←»); no focused element was inside the usage section. Screenshot:
[`2026-10-19-12-focus.png`](./2026-10-19-12-focus.png).

At 320 px wide: `scrollWidth` 320 (no horizontal scroll); the usage region ends at x = 287; the two badges
keep one line each (20 px high) and wrap as whole units under the figures; «45 ms» wraps to its own line
after «$0 ·», nothing is clipped. Screenshot: [`2026-10-19-12-narrow-320.png`](./2026-10-19-12-narrow-320.png).

Status region text after each outcome (read from the DOM in 12.2–12.4): empty on open, «Respuesta
recibida.», «Sin respuesta verificada.», «Hace falta un modelo de lenguaje.», «Respuesta recibida.», and
empty with every alert; never visible (`sr-only`, zero-size box).

### 13 — End-to-end

Covered by steps 12.2–12.5 (open Screen 2 → press a suggestion → read the answer and its usage → expand an
evidence → ask without anchors → ask a free question → repeat Q1 → API down); no Playwright suite in this
change (DIS-75).

### Accessibility negative control (task 9.3) and limits

- Negative control: the usage `section` named by a missing id, and the usage `section` without
  `aria-labelledby`: `npm run test:a11y` failed both times on `Unable to find role="region" and name
  "Uso"` (the named-region check); reverted, not committed. A non-theme colour cannot be observed by axe in
  jsdom (design D35); colours were checked here, in the browser.
- Screen readers: NVDA/JAWS are not available in this run. The announcements are pinned by DOM tests (one
  persistent `status` element, its text sequence, a new `alert` element per invalid send) and inspected
  here in Chromium's DOM and accessibility tree; real screen-reader timing is not verified (design →
  Risks).

## Data state verification

- Pre-test baseline: `query_log` 3, `claim` 0, acme-shop `hit_count` 0 / 0 / 0.
- Post-test, before restore: `query_log` 8 (+5: the five `/ask` calls that reached the API), `claim` 0,
  `hit_count` of «como se calcula el precio final de un pedido» 3 (the three Q1 cache hits).
- Restore: deleted the 5 `query_log` rows created after the snapshot's database clock; reset `hit_count`
  and `last_hit_at` of the acme-shop cache entries to their snapshot values.
- Post-restore check: `query_log` 3, `claim` 0 (untouched, evaluation mode), `hit_count` 0 / 0 / 0.
- State restored: Yes. `db:seed` did not run, so nothing to remove. Both processes stopped (no listener
  on `3000` nor `5173`).

## UI evidence

- [`2026-10-19-12-answer-usage.png`](./2026-10-19-12-answer-usage.png) — answer, `ev-1` expanded, usage panel (cache hit)
- [`2026-10-19-12-no-anchor.png`](./2026-10-19-12-no-anchor.png) — `UNKNOWN` `no-anchor`
- [`2026-10-19-12-llm-required.png`](./2026-10-19-12-llm-required.png) — configuration notice
- [`2026-10-19-12-q1-repeated.png`](./2026-10-19-12-q1-repeated.png) — Q1 typed again, cache hit
- [`2026-10-19-12-budget.png`](./2026-10-19-12-budget.png), [`2026-10-19-12-rate-limit.png`](./2026-10-19-12-rate-limit.png) — the two `429` alerts
- [`2026-10-19-12-project-not-found.png`](./2026-10-19-12-project-not-found.png) — `PROJECT_NOT_FOUND`
- [`2026-10-19-12-api-down.png`](./2026-10-19-12-api-down.png) — API stopped
- [`2026-10-19-12-focus.png`](./2026-10-19-12-focus.png), [`2026-10-19-12-narrow-320.png`](./2026-10-19-12-narrow-320.png) — focus pass and 320 px

## Outcome

- Status: PASS
- Blocking issues: none.
