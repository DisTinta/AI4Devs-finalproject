# Test and State Verification Report

- Date: 2026-10-18
- Change: project-picker (DIS-60)
- Step: 10 — Manual Interface Testing (and 11 — End-to-End Testing)

Run by the agent in the autonomous run of Entrega 2 (ADR `20261016-autonomous-workflow-run-entrega-2`),
Windows 11, Node v24.11.1, Vite 5.4.21, headless Chromium (patchright, through the browser-automation
skill). The API was the real `packages/api` server against the local seeded Postgres
(`codemind-postgres-1`), with the variables of the local `.env` exported into its process only (never
printed).

## Commands executed

- `node <scratchpad>/qlog-count.mjs` (prints only `count(*)` of `query_log`) and `npm run cli -- projects`
  (10.1)
- `npx tsx --tsconfig packages/api/tsconfig.run.json packages/api/src/server.ts` (the API, process 1;
  without watch, so stopping it stops it)
- `npm -w packages/web run dev` (Vite on `5173`, process 2; not the root `npm run dev`, which would stop
  Vite when the API stops)
- `curl -i http://localhost:5173/health`
- `node <browser-automation>/browser.mjs http://localhost:5173/ --script qa-up.mjs` (10.2)
- `Stop-Process` on the owner of port `3000` (10.3), then
  `node <browser-automation>/browser.mjs http://localhost:5173/ --session dis60 --script qa-down.mjs`
- the API started again, then `node <browser-automation>/browser.mjs --session dis60 --script qa-retry.mjs`
  (same page, keyboard only) and `--session dis60 --close`
- `node <browser-automation>/browser.mjs http://localhost:5173/ --script qa-keys.mjs` (10.4)
- `Stop-Process` on the owners of ports `3000` and `5173`, and the `query_log` count again (10.5)

The scripts live in the session scratchpad and are not committed.

## Test results

### 10.1 — Preconditions

- Postgres container `codemind-postgres-1` up (healthy). `DATABASE_URL` exported from the local `.env`.
- `npm run cli -- projects` → `acme-shop  a794456d-6d1b-5b55-a360-13fec83dc7bc  php/laravel  174 nodes ·
  170 edges  2024-05-06T09:31:00.000Z sample`: acme-shop is stored, so `npm run db:seed` did not run.
- `query_log` count before: **3**.

### 10.2 — API up

- `curl -i http://localhost:5173/health` → `HTTP/1.1 200 OK`, `application/json`, `{"status":"ok"}`.
- Browser at `http://localhost:5173/` (reloaded with a request listener attached): `h1` «Elige un proyecto
  para explorar»; the article «acme-shop» reads «PHP / Laravel», «53 ficheros», «121 símbolos», «170
  aristas», «32 commits», «indexado», «listo», «Explorar proyecto»; 0 elements with role `alert`; the link
  targets `/p/a794456d-6d1b-5b55-a360-13fec83dc7bc`; `<html lang="es">`, title `CODEMIND`; focus on `BODY`
  (the first check does not move it, D25).
- Network: `GET /`, `GET /health`, `GET /health` and no other API request. The first `/health` shows as
  `net::ERR_ABORTED`: `StrictMode` mounts the page twice in development and the first check is aborted
  (design D8); the alert did not flash, which is the evidence of the hook's "ignore an aborted check" guard
  that the tests (without `StrictMode`) cannot kill (step 9 report, mutation survivors).
- Console errors: 0.
- Screenshot: [`2026-10-18-10-api-up.png`](./2026-10-18-10-api-up.png).

### 10.3 — API stopped, then retried

- Only the API process stopped (port `3000` no longer listening); Vite kept serving.
- Reload of `/`: the alert reads «⚠ La API de CODEMIND no está disponible. Puedes ver los proyectos, pero no
  preguntar hasta que vuelva. Arráncala con make up y pulsa Reintentar.» with the button «Reintentar».
  Children of `main`, in order: `H1`, `P` (subtitle), `DIV[alert]`, `UL` (the cards), `HR`, `P`, `P`, `P`
  (the indexing hint): the alert sits between the subtitle and the card. The card shows «indexado» and no
  «listo». Focus on `BODY`.
- Console: two `Failed to load resource: … 500` (the proxy's empty `500` for `/health`, one per mount of
  `StrictMode`; the first request also shows as aborted). Expected: the API is down.
- Screenshot: [`2026-10-18-10-api-down.png`](./2026-10-18-10-api-down.png).
- The API started again (`curl http://127.0.0.1:3000/health` → `{"status":"ok"}`). On the same page, one
  `Tab` from the top focused `BUTTON Reintentar` (the first focusable element of `main`), `Enter`: the
  alert disappeared (0 alerts), the card shows «listo», and `document.activeElement` is the `H1` «Elige un
  proyecto para explorar» (D17). Console errors: 0; failed requests: 0.
- Screenshot: [`2026-10-18-10-retry.png`](./2026-10-18-10-retry.png) (the browser's default focus ring
  around the heading shows where the focus went).

### 10.4 — Keyboard, focus and the other routes

- From the top of `/`, one `Tab` focused the link «Explorar proyecto acme-shop→» (accessible text with the
  `sr-only` name); `:focus-visible` true, outline `solid 2px rgb(25, 113, 194)` (`#1971c2`).
  Screenshot: [`2026-10-18-10-link-focused.png`](./2026-10-18-10-link-focused.png).
- `Enter` → `http://localhost:5173/p/a794456d-6d1b-5b55-a360-13fec83dc7bc`; `main` reads «Consulta del
  proyecto», «Esta pantalla está en construcción.», `a794456d-6d1b-5b55-a360-13fec83dc7bc`. The page's
  pending `/health` showed as `net::ERR_ABORTED` when leaving `/` (the cancellation of "Leaving Screen 1
  cancels a pending check").
- `http://localhost:5173/no-existe` → `h1` «Página no encontrada» and the link «Volver a la selección de
  proyecto» (route table unchanged for it, now through the shared `BackToPickerLink`).
- Console errors: 0.

### 10.5 — State restored

- Both processes stopped (ports `3000` and `5173` no longer listening).
- `query_log` count after: **3** (unchanged; the screen only calls `GET /health`, which writes nothing).
- `db:seed` did not run, so there is nothing to remove.

### 11 — End-to-end

There is no Playwright suite yet (DIS-75). The browser runs of 10.2–10.4 are the end-to-end evidence of the
workflow "open Screen 1 → see the API status → retry → enter a project with the keyboard": covered by steps
10.2–10.4; no Playwright suite in this change.

### Wireframe comparison (informal; the formal one is `/show-spec-working`)

The page follows `images/pantalla-1-seleccion.svg`: header, centred `h1` and subtitle, the 280 px card with
the top stripe, icon and name, «PHP / Laravel», the separator, the 2×2 counts, the «✓ indexado» and «listo»
badges, the full-width primary button, the dashed separator, «+ Indexar mi propio repositorio» and the
requirements line. Deviations, all recorded in `design.md`: one card (D3), no versions (D4), the seed's
counts (D2), the alert (D9), the command line and the new requirements text (D14, D16), the darker button
and text colours (D7, D14), no footer annotation (D14).

## Data state verification

- Pre-test baseline:
  - `query_log` count: 3
  - Projects: acme-shop stored (sample)
- Post-test validation:
  - `query_log` count: 3
  - Projects: unchanged (no write path exercised)
- State restored: Yes
- Restoration actions: API and Vite processes stopped; nothing else to restore.

## UI evidence (if applicable)

- [`./2026-10-18-10-api-up.png`](./2026-10-18-10-api-up.png) — Screen 1 with the API up: card with
  «indexado» and «listo».
- [`./2026-10-18-10-api-down.png`](./2026-10-18-10-api-down.png) — Screen 1 with the API stopped: the alert
  between the subtitle and the card, no «listo».
- [`./2026-10-18-10-retry.png`](./2026-10-18-10-retry.png) — after «Reintentar» with the API back: no alert,
  «listo», focus on the heading.
- [`./2026-10-18-10-link-focused.png`](./2026-10-18-10-link-focused.png) — the «Explorar proyecto» link
  focused by keyboard, with its visible outline.

## Outcome

- Status: PASS
- Blocking issues: none
