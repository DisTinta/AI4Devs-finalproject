# Show Spec Working — web-foundation (DIS-58)

- Date: 2026-10-18
- Change: web-foundation (DIS-58), task 15.4
- Run by the agent in the autonomous run of Entrega 2 (ADR `20261016-autonomous-workflow-run-entrega-2`),
  Windows 11, Vite 5.4.21, headless Chromium (patchright, browser-automation skill; the Playwright MCP
  server was not used).

Unlike step 10 (design D31), this run started the **real API against the local seeded Postgres**
(`docker compose` service `codemind-postgres-1`, healthy; acme-shop stored), with the `DATABASE_URL` built
from the defaults of `docker-compose.yml`, so the acme-shop `ask` reaches the `200 UNKNOWN` the task 10.2
expected. The API and the web ran as two processes (design D15): `npm -w packages/api run dev` and
`npm -w packages/web run dev`.

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| The development server serves the three paths | browser opens `http://localhost:5173/`, `/p/a794456d-6d1b-5b55-a360-13fec83dc7bc`, `/no-existe` | each renders its `h1`, banner and main of the spec table; 0 failed requests, 0 console errors, 0 API requests | yes | `./2026-10-18-ssw-root.png`, `./2026-10-18-ssw-project.png`, `./2026-10-18-ssw-not-found.png` |
| The root path shows the Screen 1 placeholder (live) | `/` | main = «Elige un proyecto para explorar» + «Esta pantalla está en construcción.»; no request to `/api` or `/health` | yes | browser output below |
| A project path shows the Screen 2 placeholder with its id (live) | `/p/a794456d-…` | main = heading, line, `a794456d-6d1b-5b55-a360-13fec83dc7bc`; no API request | yes | browser output below |
| An unknown path shows the not-found screen and leads back (live, keyboard) | `/no-existe`, `Tab` to the link, `Enter` | link focused, `:focus-visible`, outline `2px solid rgb(25, 113, 194)`; URL `/`, `h1` «Elige un proyecto para explorar» | yes | browser output below |
| The health check reaches the API through the development server | `GET http://localhost:5173/health` with the API up, then stopped | up: `200` `{"status":"ok"}`; down: `500` `text/plain`, empty body (not the API's JSON); `getHealth()` from the page rejects `ApiUnavailableError`, `status` 500, cause `SyntaxError` | yes | proxy and browser output below |
| Asking a question through the API client (live) | `ask('a794456d-…', { question: '¿Qué hace OrderObserver?' })` from the page | resolves the API body unchanged: `UNKNOWN` / `llm-required` (evaluation mode) | yes | browser output below |
| The error format becomes an API error (live) | `ask` with a random UUID; `ask` with `{}` | `ApiError` `404 PROJECT_NOT_FOUND` `details {}`; `ApiError` `400 VALIDATION_ERROR`; neither is `ApiUnavailableError` | yes | browser output below |
| Aborting a pending question cancels the request (live) | `ask` with a caller signal aborted at once | rejects `AbortError`, neither error class | yes | browser output below |
| Theme from the wireframe (D15 bounded comparison) | computed styles of `/`, screenshot next to the wireframe | see "Comparison with the wireframe" | yes | `./2026-10-18-ssw-wireframe-1.png`, `./2026-10-18-ssw-root.png` |

The remaining scenarios (time limits, invalid limit, the ten unavailable-API failures, body-read abort,
contract test, architecture rule, theme test, a11y gate, DOM cleanup) are unit, type-level or command
checks; they ran green in the step 9 report and are not repeated against the live servers.

## Comparison with the wireframe (`images/pantalla-1-seleccion.svg`)

Bounded by design D15 to what this change sets; the project cards, the subtitle «Repositorios
precargados · …» and «+ Indexar mi propio repositorio» are DIS-60's.

| Element | Wireframe | Running page (`/`) | Verdict |
|---|---|---|---|
| Header | dark band `#212529`, «CODEMIND» bold, letter-spaced, white; tagline grey below | `rgb(33, 37, 41)`, «CODEMIND» `font-bold tracking-widest` white, tagline `#adb5bd` | match |
| Container | white card, radius 8, light border, on the page background | `rgb(255, 255, 255)`, radius `8px`, `border-border`, body `rgb(248, 249, 250)` | match |
| Font | `'Segoe UI', system-ui, sans-serif` | `"Segoe UI", system-ui, sans-serif` | match |
| Heading | «Elige un proyecto para explorar», centred, `#495057`, weight 600 | same text, centred, `text-ink-muted` (`#495057`), `font-semibold` | match |
| Line under the heading | subtitle `#868e96` (DIS-60 content) | «Esta pantalla está en construcción.» in `#6c757d` (D4: `#868e96` is 3.32:1 on white, darkened) | intended deviation (D4, D16) |
| Link colour | `#4dabf7` (button / link) | `#1971c2` on the not-found link (D4: `#4dabf7` is 2.48:1) | intended deviation (D4) |
| Browser chrome, cards, footer annotation | present | absent | out of scope (D5, D15, DIS-60) |

## Evidence

Proxy calls with the API up (`node <scratchpad>/proxy-calls.mjs`, requests to `http://localhost:5173`):

```
GET /health
  -> 200 application/json; charset=utf-8
  {"status":"ok"}
POST /api/projects/a794456d-6d1b-5b55-a360-13fec83dc7bc/ask {"question":"¿Qué hace OrderObserver?"}
  -> 200 application/json; charset=utf-8
  {"answer":"UNKNOWN","reason":"llm-required","message":"evaluation mode (cache-only): set LLM_* to enable free-form asks","statements":[],"evidence":[]}
POST /api/projects/3f0c6a52-9d1e-4b7a-8c2f-5e6d7a8b9c0d/ask {"question":"¿Qué hace OrderObserver?"}
  -> 404 application/json; charset=utf-8
  {"error":{"code":"PROJECT_NOT_FOUND","message":"project not found","details":{}}}
POST /api/projects/a794456d-6d1b-5b55-a360-13fec83dc7bc/ask {}
  -> 400 application/json; charset=utf-8
  {"error":{"code":"VALIDATION_ERROR","message":"invalid request","details":{"issues":[{"path":["question"],"code":"invalid_type","message":"Invalid input: expected string, received undefined"}]}}}
```

Browser run (`node <browser-automation>/browser.mjs http://localhost:5173/ --script <scratchpad>/ssw-routes.mjs`),
abridged JSON:

```
"/":          h1 "Elige un proyecto para explorar" (1 h1), banner "CODEMIND / Comprensión de repositorios con evidencia verificable",
              main "Elige un proyecto para explorar / Esta pantalla está en construcción.", lang "es", title "CODEMIND",
              failedRequests [], apiRequests []
"/p/a794…":   h1 "Consulta del proyecto" (1 h1), main "… / Esta pantalla está en construcción. / a794456d-6d1b-5b55-a360-13fec83dc7bc",
              failedRequests [], apiRequests []
"/no-existe": h1 "Página no encontrada" (1 h1), main "Página no encontrada / Volver a la selección de proyecto",
              failedRequests [], apiRequests []
keyboard:     focused "Volver a la selección de proyecto", focusVisible true, outline "2px solid rgb(25, 113, 194)",
              urlAfterEnter "http://localhost:5173/", h1After "Elige un proyecto para explorar"
computed:     bodyBg rgb(248, 249, 250), bodyFont "Segoe UI", system-ui, sans-serif, headerBg rgb(33, 37, 41),
              frameBg rgb(255, 255, 255), frameRadius 8px
client:       health resolved {status: "ok"}
              askAcme resolved {answer: "UNKNOWN", reason: "llm-required", …, statements: [], evidence: []}
              askUnknownProject ApiError, isApiError true, isUnavailable false, status 404, code PROJECT_NOT_FOUND, details {}
              askInvalid ApiError, status 400, code VALIDATION_ERROR
              askAborted AbortError, isApiError false, isUnavailable false
```

The browser logged two `Failed to load resource` errors, one per deliberate `404`/`400` `ask` call of the
client check; the three route loads logged none.

API stopped (only the API process; Vite kept running):

```
curl -si http://localhost:5173/        -> HTTP/1.1 200 OK
curl -si http://localhost:5173/health  -> HTTP/1.1 500 Internal Server Error, Content-Type: text/plain, empty body
getHealth() from the page (qa-down.mjs) -> {"rejected":"ApiUnavailableError","isApiUnavailableError":true,"status":500,"cause":"SyntaxError: Unexpected end of JSON input"}
```

Screenshots (viewport 1280 × 800, full page):

- `./2026-10-18-ssw-root.png` — `/`
- `./2026-10-18-ssw-project.png` — `/p/a794456d-6d1b-5b55-a360-13fec83dc7bc`
- `./2026-10-18-ssw-not-found.png` — `/no-existe`
- `./2026-10-18-ssw-wireframe-1.png` — `images/pantalla-1-seleccion.svg` rendered in the same browser, for
  the side-by-side comparison above

## State

- Before (`psql` in the Postgres container): `query_log` `count 0`, `max(created_at)` `NULL`; acme-shop
  `claim` `count 0`, `max(created_at)` `NULL`; acme-shop `cache_entry` `7b776098-…` `0`/`NULL`,
  `cf7c9451-…` `0`/`NULL`, `9397d8d5-…` `0`/`NULL`.
- After: `query_log` `count 3` (`e7e01438-84e8-4001-abe6-99820ca3e4fc`, `0d0514f9-839e-4d6e-b6a8-a6d3424dc7f5`,
  `fcba978b-9cf6-4021-b67d-f8391b82152e`, acme-shop, written by the three acme-shop `ask` calls of this
  run); `claim` and `cache_entry` unchanged (evaluation mode saves no claim and touches no cache entry).
- Restored: **no**. The deletion of the three `query_log` rows was denied by the session's permissions
  in this autonomous run. They are local development log rows of the three asks listed above; the
  `claim` and `cache_entry` indicators match the "Before" values. Both processes are stopped (ports
  `3000` and `5173` free).

## Not demonstrated

- Nothing of this change's live scenarios. The project cards and the Screen 2 layout
  (`images/pantalla-2-consulta.svg`) belong to DIS-60/65 and are not part of this change.

## Handoff

The change is **demonstrably working**: the three routes render as specified in the running dev server,
the keyboard path back works with a visible focus, the client reaches the real API through the proxy and
classifies its success, error and stopped-API answers as the spec says, and the theme matches the
wireframe within the D4 contrast deviations. No screenshot was written at the repository root; all are
in `openspec/changes/web-foundation/reports/`.

## Addendum — pre-merge fixes re-checked (2026-10-18)

- `/p/` + 200 × `x` after the `break-all` fix of the adversarial review (finding 4): the id paragraph
  wraps inside the frame (`scrollWidth` 702 = `clientWidth` 702, frame 766 px, `word-break: break-all`),
  0 console errors, 0 failed requests. Screenshot `./2026-10-18-ssw-long-id.png`.
- The other fixes (time-limit bound, CI step, spec wording of the proxy) do not change what the running
  page shows; they are covered by the unit test, the PR's CI run (task 15.3) and the spec.
