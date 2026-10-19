# Manual Interface Testing Report

- Date: 2026-10-19
- Change: ask-page (DIS-65)
- Step: 12 — Manual Interface Testing (and 13 — End-to-End Testing)

Run by the agent in the autonomous run of Entrega 2 (ADR `20261016-autonomous-workflow-run-entrega-2`),
Windows 11, headless Chromium (patchright, through the browser-automation skill). The API was the real
`packages/api` server against the local seeded Postgres (`codemind-postgres-1`), with the variables of the
local `.env` exported into its process only (never printed) and every `LLM_*` variable unset, so the API
ran in evaluation mode: the three golden questions are answered from the answer cache and any other
question gets `UNKNOWN` `llm-required`.

## Commands executed

- `docker compose ps` (Postgres healthy) and `npm run cli -- projects` (12.1)
- `node <scratchpad>/dbstate.mjs snapshot` (prints only the `count(*)` of `query_log` and `claim` and the
  `hit_count` of each `cache_entry`; keeps `hit_count` and `last_hit_at` for the restore)
- the API, process 1: `.env` exported, `LLM_*` unset, then
  `npx tsx --tsconfig packages/api/tsconfig.run.json packages/api/src/server.ts` (no watch)
- the web, process 2: `npm -w packages/web run dev` (Vite on `5173`)
- `node <browser-automation>/browser.mjs http://localhost:5173/p/a794456d-6d1b-5b55-a360-13fec83dc7bc
  --script qa-empty.mjs` (12.2), `--script qa-answer.mjs` and `--script qa-more.mjs` (12.3)
- `Stop-Process` on the owner of port `3000` only, then `--script qa-down.mjs` (12.4); the API started
  again, then `node <browser-automation>/browser.mjs http://localhost:5173/p/0b5c7f2e-1d3a-4e6b-8f90-1a2b3c4d5e6f
  --script qa-other.mjs` (12.4)
- after the visual fixes of design D34, `qa-empty.mjs`, `qa-answer.mjs` and `qa-more.mjs` again (the
  screenshots below are from this second pass)
- `Stop-Process` on the owners of ports `3000` and `5173`; `dbstate.mjs check`, `restore`, `check` (12.5)

The scripts live in the session scratchpad and are not committed.

## Test results

### 12.1 — Preconditions

- Postgres container `codemind-postgres-1` up (healthy). `DATABASE_URL` exported from the local `.env`;
  no `LLM_*` in the API's environment.
- `npm run cli -- projects` → `acme-shop  a794456d-6d1b-5b55-a360-13fec83dc7bc  php/laravel  174 nodes ·
  170 edges  2024-05-06T09:31:00.000Z sample`: acme-shop and its golden answers are stored, so
  `npm run db:seed` did not run.
- Baseline: `query_log` **3** rows, `claim` **0** rows; `cache_entry` of acme-shop: «como se calcula el
  precio final de un pedido» 0, «como se validan los cupones» 0, «que hace orderobserver al crear un
  pedido» 0 hits.

### 12.2 — Screen 2 before any question

- `h1` «acme-shop» inside the dark banner, with «←» (accessible name «Volver a la selección de
  proyecto») and «PHP / Laravel · 170 aristas»; no «CODEMIND» header.
- Field placeholder «Pregunta sobre el código de acme-shop»; «Prueba:» and the three golden questions in
  order; no element with role `status` or `alert`; `<html lang="es">`, title `CODEMIND`.
- Network: only the document and Vite's modules; **no request to `/api` nor `/health`** on load.
- Console errors: 0.
- Screenshot: [`2026-10-19-12-empty.png`](./2026-10-19-12-empty.png).

### 12.3 — Questions in evaluation mode

- Q1 pressed: one `POST /api/projects/a794456d-6d1b-5b55-a360-13fec83dc7bc/ask` with body
  `{"question":"¿Cómo se calcula el precio final de un pedido?"}`; «Buscando evidencia…» shown as `status`,
  then the golden answer: `compute()` and `PriceCalculator` in `code` (`rgb(25, 113, 194)`, `accent`), four
  statements — two «● HECHO · ✓ verificado» and two «⚠ INFERIDO · ○ sin verificar» — each with «Evidencia:
  ev-N», and four evidence buttons, all collapsed.
- Keyboard: from the pressed suggestion, three `Tab` reached «ev-1 · app/Services/PriceCalculator.php:16-44»
  (`:focus-visible` true), `Enter` expanded it (`aria-expanded="true"`, «▾»). The `pre` text is **exactly**
  the `excerpt` of Q1's first evidence in `seeds/cache/acme-shop.json` (compared by script, lines 16–44).
- Colours (spec "Statement colours follow the wireframe", design D19, computed styles):

  | Element | Text | Background | Border |
  |---|---|---|---|
  | `FACT` item | `rgb(33, 37, 41)` ink | `rgb(255, 255, 255)` surface | left 4px `rgb(30, 111, 49)` success |
  | `INFERENCE` item | `rgb(92, 61, 0)` warning-ink | `rgb(255, 249, 219)` warning-soft | 1px `rgb(255, 212, 59)` warning-border |
  | «● HECHO», «✓ verificado» | `rgb(30, 111, 49)` success | `rgb(211, 249, 216)` success-soft | — |
  | «⚠ INFERIDO» | `rgb(92, 61, 0)` warning-ink | `rgb(255, 249, 219)` warning-soft | 1px warning-border (D34) |
  | «○ sin verificar» | `rgb(73, 80, 87)` ink-muted | `rgb(248, 249, 250)` canvas | — |

  Screenshot: [`2026-10-19-12-answer-expanded.png`](./2026-10-19-12-answer-expanded.png).
- Q3: one `INFERENCE`/`cited` statement citing `ev-1 · app/Services/CouponValidator.php:14-39`.
- Q4: two `FACT`/`entailed` statements and the repeated range shown twice, «ev-1 ·
  app/Observers/OrderObserver.php:14-28» and «ev-2 · app/Observers/OrderObserver.php:14-28».
  Screenshot: [`2026-10-19-12-q4-repeated.png`](./2026-10-19-12-q4-repeated.png).
- Free question «¿Dónde se registran los eventos de pedido?» + Enter: `status` «Sin respuesta verificada
  (motivo: llm-required).», no `alert`. Screenshot: [`2026-10-19-12-unknown.png`](./2026-10-19-12-unknown.png).
- «hola» + Enter: the field gets `aria-invalid="true"`, its description and the only `alert` read «Escribe
  una pregunta de 5 a 500 caracteres.», the focus stays on the field, the previous status stays, and **no
  new request** was recorded. Screenshot: [`2026-10-19-12-invalid.png`](./2026-10-19-12-invalid.png).
- Console errors: 0; failed requests: 0.

### 12.4 — API stopped, an unknown project and the other screens

- Only the API stopped (port `3000` no longer listening). Q3 pressed: the `alert` reads «⚠ No se ha podido
  obtener la respuesta. La API de CODEMIND no responde.», no button inside it, no «Respuesta», focus on the
  pressed button. Console: one `500` (the proxy's empty answer, expected with the API down). Screenshot:
  [`2026-10-19-12-api-down.png`](./2026-10-19-12-api-down.png).
- API started again. `/p/0b5c7f2e-1d3a-4e6b-8f90-1a2b3c4d5e6f`: `h1` is the id, no label nor count, no
  suggestions, placeholder «Pregunta sobre el código del proyecto»; «¿Cómo se validan los cupones?» + Enter
  → `alert` «No se ha podido obtener la respuesta. Código: PROJECT_NOT_FOUND.» (the API's `404`). Screenshot:
  [`2026-10-19-12-unknown-project.png`](./2026-10-19-12-unknown-project.png).
- `/` → «Elige un proyecto para explorar» under the CODEMIND header; `/no-existe` → «Página no encontrada»
  under the CODEMIND header (the screens of the paths table are unchanged).
- Screen 2 again: one `Tab` focuses the back link, outline `solid 2px rgb(255, 255, 255)` (D20); `Enter`
  → «Elige un proyecto para explorar». Screenshot:
  [`2026-10-19-12-back-focused.png`](./2026-10-19-12-back-focused.png). The `/health` of Screen 1 shows as
  `net::ERR_ABORTED` when the run ends (the page's own cancellation).

### Fixes made after the first browser pass (design D34)

The first pass showed three visual defects, fixed in commit `style(DIS-65): …` and re-checked in the second
pass: «Prueba:» wrapped onto its own line above the suggestions; the «⚠ INFERIDO» badge had the same
`warning-soft` background as the inference box and no visible edge; and the invalid message was
`warning-ink` on `surface`, a pair the theme test does not check. The tests stayed green (63 web and a11y
tests).

### 12.5 — State restored

- Both processes stopped (ports `3000` and `5173` no longer listening).
- Before the restore: `query_log` 11 (8 rows created by the run: Q1, Q3, Q4 and the free question, each
  sent twice across the two passes; the `404` and the API-down request wrote none), `claim` 0, each
  acme-shop `cache_entry` 2 hits.
- `dbstate.mjs restore`: deleted the 8 `query_log` rows created after the 12.1 timestamp and reset
  `hit_count` and `last_hit_at` of the 3 touched cache entries to their 12.1 values.
- After: `query_log` 3, `claim` 0 (untouched, as expected in evaluation mode), hits 0 / 0 / 0, no
  `query_log` row newer than the 12.1 timestamp.

### 13 — End-to-end

There is no Playwright suite yet (DIS-75): the browser runs of 12.2–12.4 are the end-to-end evidence of the
workflow "open Screen 2 → press a suggestion → read the answer → expand an evidence with the keyboard → go
back": covered by steps 12.2–12.4; no Playwright suite in this change.

### Accessibility negative control (task 9.2)

`tests/a11y/ask-page.a11y.test.tsx` passed on its first run. Removing only the back link's `aria-label`
(locally, not committed) left axe green: the visible «←» is a discernible link name. Removing the
`aria-label` **and** hiding the arrow with `aria-hidden` made the test fail with `link-name: Links must have
discernible text` in the five states, which proves the scan runs over Screen 2. The removal of the name
alone is caught by "Screen 2 opens on a sample project without any request" (design D36).

## Data state verification

- Pre-test baseline: `query_log` 3; `claim` 0; acme-shop cache hits 0 / 0 / 0; acme-shop stored (sample).
- Post-test validation: `query_log` 3; `claim` 0; hits 0 / 0 / 0.
- State restored: Yes
- Restoration actions: API and Vite stopped; 8 `query_log` rows deleted; `hit_count` and `last_hit_at` of 3
  cache entries reset; `db:seed` did not run.

## UI evidence

Screenshots next to this report: `2026-10-19-12-empty.png`, `2026-10-19-12-answer-expanded.png`,
`2026-10-19-12-q4-repeated.png`, `2026-10-19-12-unknown.png`, `2026-10-19-12-invalid.png`,
`2026-10-19-12-api-down.png`, `2026-10-19-12-unknown-project.png`, `2026-10-19-12-back-focused.png`.
