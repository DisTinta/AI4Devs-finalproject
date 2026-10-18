# Test and State Verification Report

- Date: 2026-10-18
- Change: web-foundation (DIS-58)
- Step: 10 — Manual Interface Testing (and 11 — End-to-End Testing)

Run by the agent in the autonomous run of Entrega 2 (ADR `20261016-autonomous-workflow-run-entrega-2`),
Windows 11, Node v24.11.1, Vite 5.4.21, headless Chromium (patchright).

## Deviation from tasks 10.1, 10.2 and 10.5 (agent decision)

The agent could not read the local database credentials in this run (the session's permissions do
not let it read `.env`), so it did not start the API against the seeded Postgres. Instead the API was
the **real Fastify app of `packages/api`** (`buildApp`, its routes, schemas, error format and rate
limit) with the doubles of its unit tests (`tests/unit/api/support.ts` → `defaultDeps()`: an empty
in-memory store and an evaluation-mode model), listening on `127.0.0.1:3000` from a script in the
session scratchpad (not committed). What this step proves — the Vite proxy forwards `/api` and
`/health` to that address, the API's answers reach the page unchanged, and a stopped API becomes
`ApiUnavailableError` — does not depend on the store. Two consequences:

- The acme-shop `ask` answers `404 PROJECT_NOT_FOUND` (the in-memory store is empty) instead of the
  `200 UNKNOWN` of the seeded database; the `404` of a random UUID and the `400 VALIDATION_ERROR` of `{}`
  are as the task expects.
- No database was touched, so 10.1's capture and 10.5's restoration have nothing to do (below).

`/show-spec-working` (task 15.4) may repeat 10.2 against the seeded database when the credentials are
available.

## Commands executed

- `npx tsx --tsconfig tests/tsconfig.json <scratchpad>/serve-api-doubles.ts` (the API, process 1)
- `npm -w packages/web run dev` (Vite on `5173`, process 2; not the root `npm run dev`, which would stop
  Vite when the API stops)
- `node <scratchpad>/proxy-calls.mjs` (four requests through `http://localhost:5173`; `node` rather than
  `curl` because Git Bash's `curl` mangles the accents of the question)
- `curl -i http://localhost:5173/health`, `curl -i http://localhost:5173/`
- `node <browser-automation>/browser.mjs http://localhost:5173/ --script qa-routes.mjs` (10.4) and
  `--script qa-down.mjs` (10.3)
- `Stop-Process` on the owner of port `3000` (10.3), then of port `5173` (10.5)

## Test results

### 10.2 — API up, through the proxy

| Request (to `http://localhost:5173`) | Status | Body |
|---|---|---|
| `GET /health` | `200` `application/json` | `{"status":"ok"}` |
| `POST /api/projects/a794456d-6d1b-5b55-a360-13fec83dc7bc/ask` `{"question":"¿Qué hace OrderObserver?"}` | `404` | `{"error":{"code":"PROJECT_NOT_FOUND","message":"project not found","details":{}}}` (empty in-memory store, see Deviation) |
| `POST /api/projects/3f0c6a52-9d1e-4b7a-8c2f-5e6d7a8b9c0d/ask` (random UUID) | `404` | `{"error":{"code":"PROJECT_NOT_FOUND","message":"project not found","details":{}}}` |
| `POST /api/projects/a794456d-…/ask` `{}` | `400` | `{"error":{"code":"VALIDATION_ERROR","message":"invalid request","details":{"issues":[{"path":["question"],"code":"invalid_type","message":"Invalid input: expected string, received undefined"}]}}}` |

From the running page, `import('/src/services/api-client.ts')` then `getHealth()` resolved
`{ "status": "ok" }`.

### 10.3 — API stopped, Vite up

- `curl http://127.0.0.1:3000/health` → no answer (connection refused).
- `curl -i http://localhost:5173/` → `HTTP/1.1 200 OK` (Vite still serves the page).
- `curl -i http://localhost:5173/health` → `HTTP/1.1 500 Internal Server Error`, `Content-Type:
  text/plain`, **empty body** (the proxy's error; not the API's JSON).
- From the page, `getHealth()` rejected with `{ "rejected": "ApiUnavailableError",
  "isApiUnavailableError": true, "status": 500, "cause": "SyntaxError: Unexpected end of JSON input" }`
  — the spec's empty-`500` case. The browser logged the expected `Failed to load resource: … 500` for
  that one request.

### 10.4 — The three paths in a headless browser

| Path | `h1` | Banner | Main landmark | Console errors | Failed requests |
|---|---|---|---|---|---|
| `/` | Elige un proyecto para explorar | CODEMIND / Comprensión de repositorios con evidencia verificable | heading, «Esta pantalla está en construcción.» | 0 | 0 |
| `/p/a794456d-6d1b-5b55-a360-13fec83dc7bc` | Consulta del proyecto | same | heading, «Esta pantalla está en construcción.», `a794456d-6d1b-5b55-a360-13fec83dc7bc` | 0 | 0 |
| `/no-existe` | Página no encontrada | same | heading, link «Volver a la selección de proyecto» | 0 | 0 |

`<html lang="es">` and title `CODEMIND` on all three. Computed styles: body background
`rgb(248, 249, 250)` (`#f8f9fa`), body font `"Segoe UI", system-ui, sans-serif`, header background
`rgb(33, 37, 41)` (`#212529`) — the wireframe values.

Keyboard: on `/no-existe`, `Tab` reached the link (`document.activeElement` = `A` «Volver a la selección
de proyecto», `:focus-visible` true, outline `2px solid rgb(25, 113, 194)` = `#1971c2`); `Enter` led to
`http://localhost:5173/` with `h1` «Elige un proyecto para explorar».

### 11 — End to end

Covered by step 10.4; no Playwright suite in this change (placeholders only; Playwright is DIS-75).

## Data state verification

- Pre-test baseline: the API ran on an in-memory store; no database connection was opened.
- Post-test validation: both processes stopped (no listener on `3000` nor `5173`).
- State restored: Yes (nothing to restore).
- Restoration actions: none; `db:seed` did not run.

## UI evidence

- `./2026-10-18-10-root.png` — `/`: dark header with «CODEMIND» and the tagline, white container on the
  page background, the Screen 1 heading and the placeholder line.
- `./2026-10-18-10-project.png` — `/p/a794456d-6d1b-5b55-a360-13fec83dc7bc`: the Screen 2 placeholder
  with the project id.
- `./2026-10-18-10-not-found.png` — `/no-existe`: «Página no encontrada» and the link back.
- `./2026-10-18-10-not-found-link-focused.png` — the same page with the link focused from the keyboard
  (visible `#1971c2` outline).

## Outcome

- Status: PASS (with the deviation above: API on in-memory doubles, not the seeded database)
- Blocking issues: none
