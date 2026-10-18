# Show Spec Working — project-picker (DIS-60)

- Date: 2026-10-18
- Change: project-picker (DIS-60), task 14.2
- Run by the agent in the autonomous run of Entrega 2 (ADR `20261016-autonomous-workflow-run-entrega-2`),
  in its own context, in a session other than the one that implemented the change. Windows 11, Vite
  5.4.21, headless Chromium (patchright, through the browser-automation skill; the Playwright MCP server
  was not used).
- Branch `feature/DIS-60-project-picker` at `9d9e1f1`. The pull request (task 13.3) is not open yet: in
  this autonomous run the pre-merge reviews run before the pull request is opened (agent's decision,
  recorded in the DIS-60 `[enhanced]` description), so task 14.1 stays open until 13.3.

The real API (`packages/api`) ran against the local seeded Postgres (`codemind-postgres-1`, healthy;
acme-shop stored), with a `DATABASE_URL` built from the defaults of `docker-compose.yml`. The API and the
web ran as two processes, so stopping the API left Vite serving:

- `npx tsx --tsconfig packages/api/tsconfig.run.json packages/api/src/server.ts` (no watch)
- `npm -w packages/web run dev` (Vite on `5173`)

The scripts (`ssw-*.mjs`) live in the session scratchpad and are not committed. Paths below mask the
scratchpad and the skill folder as `<scratchpad>` and `<browser-automation>`.

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| Screen 1 shows the sample projects without waiting for the API (live, API up) | `/` | banner «CODEMIND» + tagline; `main` children `H1`, `P`, `UL(Proyectos de muestra)`, `HR`, `P`×3; article «acme-shop» with `h2`, «PHP / Laravel», «53 ficheros», «121 símbolos», «170 aristas», «32 commits», «indexado», link «Explorar proyecto acme-shop» → `/p/a794456d-…`; the seven icons inside `aria-hidden` elements; only `/health` requested | yes (the live run has an API, so «comprobando…» gives way to «listo»; the pending state is shown in the time-limit row) | `./2026-10-18-ssw-api-up.png`, output A |
| An available API adds the «listo» badge | `/` with the API up | «indexado» and «listo», no «comprobando…», 0 alerts, 0 buttons «Reintentar», focus on `BODY` | yes | `./2026-10-18-ssw-api-up.png`, output A |
| An unavailable API shows the alert and keeps the cards | API process stopped, reload `/` (Vite's proxy answers `500`, empty body) | alert between `P` (subtitle) and `UL`; text of the spec, `make up` in `<code>`, `button type=button` «Reintentar»; card and link kept, no «listo» nor «comprobando…»; focus on `BODY`; no new `/health` 3 s later | yes | `./2026-10-18-ssw-api-down.png`, output B |
| Retrying after the API comes back removes the alert (keyboard) | API started again; one `Tab` (focus on «Reintentar»), `Enter` | one `GET /health`; 0 alerts, 0 buttons; «listo»; focus on `H1` «Elige un proyecto para explorar» | yes | `./2026-10-18-ssw-retry.png`, output C |
| A health check that never answers shows the alert after its time limit | `/health` intercepted by the browser and never answered; reload | at +4 s: no alert, «comprobando…»; the request was aborted at +4 995 ms after it was sent and the alert was shown, without «comprobando…» nor «listo»; no request in the next 6 s | yes | output D |
| Pressing again while a retry is pending sends no request | same interception; `Tab`, `Enter`, `Enter`, `Enter` | one request; alert kept; button «Reintentando…» focused | yes | `./2026-10-18-ssw-retrying.png`, output D |
| A failed retry keeps the alert | the pending retry above reaches its 5 s limit | alert text unchanged; button «Reintentar» again, still focused; no «listo» | yes | output D |
| Leaving Screen 1 cancels a pending check | same interception; reload, `Tab` to «Explorar proyecto acme-shop», `Enter` | `/health` `net::ERR_ABORTED` at the click; URL `/p/a794456d-…`, `h1` «Consulta del proyecto», 0 alerts 6 s later | yes | output D |
| The indexing hint is text, not a control | `/` | after the list: «+ Indexar mi propio repositorio», the command in `<code>`, the requirements line; no link or button whose name holds «Indexar» | yes | output A, aria snapshot |
| A route that fails to render shows the app's error screen (by hand) | temporary route `/ssw-boom` whose element throws `boom` (added to `router.tsx` for this run only and restored at once: `git diff --stat packages/web/src/router.tsx` empty); open it, `Tab`, `Enter` | banner; «Algo ha fallado», the line of the spec, link «Volver a la selección de proyecto» → `/`; no text `boom`; the link leads to Screen 1 | yes | `./2026-10-18-ssw-error-screen.png`, output E |
| The development server serves the three paths | `/`, `/p/a794456d-6d1b-5b55-a360-13fec83dc7bc`, `/no-existe` | each renders its screen of the route table | yes | `./2026-10-18-ssw-api-up.png`, `./2026-10-18-ssw-project.png`, `./2026-10-18-ssw-not-found.png`, output A |
| Wireframe comparison | `images/pantalla-1-seleccion.svg` rendered as an image next to the running page | see "Comparison with the wireframe" | yes, with the recorded deviations | `./2026-10-18-ssw-wireframe-1.png`, `./2026-10-18-ssw-api-up.png` |

"Language and framework labels", "Counts in singular, in plural and with grouped digits", the two axe
scenarios and "The cards show the seed's figures" are unit, axe or command checks; they ran green again
before this run (`npx vitest run packages/web tests/a11y tests/unit/web
tests/unit/seed/sample-projects-coherence.spec.ts`: 11 files, 41 tests passed) and are not repeated against
the live servers. Live, the card reads «53 ficheros», «121 símbolos», «170 aristas», «32 commits», the
constant's figures.

## Comparison with the wireframe (`images/pantalla-1-seleccion.svg`)

| Element | Wireframe | Running page (`/`) | Verdict |
|---|---|---|---|
| Header, frame, font | dark band, «CODEMIND», tagline; white container | same (DIS-58) | match |
| Heading and subtitle | «Elige un proyecto para explorar», «Repositorios precargados · sin registro · sin instalación», centred | same texts, centred; subtitle in `#6c757d` | match (subtitle colour darkened, D14) |
| Cards | acme-shop and task-api side by side | acme-shop only, centred | intended deviation (D3) |
| Card stripe, icon, name | 6 px light-blue stripe, 🐘, bold name | `rgb(77, 171, 247)` stripe, 🐘, bold «acme-shop» | match |
| Stack line | «PHP 8.2 / Laravel 11» | «PHP / Laravel» | intended deviation (D4) |
| Counts | 2×2 grid 📁 🔷 ↔ 📝, «47 ficheros», «312 símbolos», «1 840 aristas», «62 commits» | same grid and icons, the seed's 53/121/170/32 | intended deviation (D2) |
| Badges | «✓ indexado» green, «listo» blue | same | match |
| Button | full-width «Explorar proyecto →» in `#4dabf7` | full-width link in `rgb(25, 113, 194)` | intended deviation (D7, contrast) |
| API-down alert | not drawn | warning alert between subtitle and cards | intended deviation (D9) |
| Indexing hint | dashed separator, «+ Indexar mi propio repositorio», «Requiere Docker · PHP 8.2+ o Node 20+» | dashed separator, same text in `#1971c2`, the command in `<code>`, «Desde la terminal · requiere Docker, Node 20+ y Git 2.45.1+ · por ahora solo PHP» | intended deviation (D14, D16) |
| Footer annotation | «PANTALLA 1 — Selección de proyecto» | absent | intended deviation (D14) |

## Evidence

Output A — `node <browser-automation>/browser.mjs http://localhost:5173/ --script <scratchpad>/ssw-up.mjs`
(API up), then `--script ssw-names.mjs` (accessible names as Chromium computes them):

```
main.children: H1, P, UL(Proyectos de muestra), HR, P, P, P
h1: Elige un proyecto para explorar; subtitle: Repositorios precargados · sin registro · sin instalación
article (aria-labelledby → h2); counts: 📁53 ficheros, 🔷121 símbolos, ↔170 aristas, 📝32 commits
linkHref: /p/a794456d-6d1b-5b55-a360-13fec83dc7bc; aria-hidden: "", 🐘, 📁, 🔷, ↔, 📝, ✓, →
alerts: 0; active: BODY; lang: es; title: CODEMIND; card width 288 px; link background rgb(25, 113, 194)
hint: "+ Indexar mi propio repositorio" | "npm run cli -- index <carpeta> --name <nombre> --language php"
      | "Desde la terminal · requiere Docker, Node 20+ y Git 2.45.1+ · por ahora solo PHP"; controls named /Indexar/: []
/p/a794456d-…: "Consulta del proyecto / Esta pantalla está en construcción. / a794456d-6d1b-5b55-a360-13fec83dc7bc"
/no-existe: "Página no encontrada / Volver a la selección de proyecto" (href "/")
requests: GET /, GET /health, GET /health, GET /p/a794456d-…, GET /no-existe (document loads)
failed: /health net::ERR_ABORTED (StrictMode's first check, design D8); console errors: 0
getByRole: article "acme-shop" 1, list "Proyectos de muestra" 1, link "Explorar proyecto acme-shop" 1, heading 2 "acme-shop" 1
aria snapshot of main: heading "Elige un proyecto para explorar" [level=1] / paragraph / list "Proyectos de muestra"
  / listitem / article "acme-shop" / heading "acme-shop" [level=2] / paragraph: PHP / Laravel / list (4 listitems)
  / text: indexado listo / link "Explorar proyecto acme-shop" / separator / paragraph / paragraph > code / paragraph
```

Output B — `Stop-Process` on the owner of port `3000` (port no longer listening), then
`browser.mjs http://localhost:5173/ --session ssw60 --script ssw-down.mjs`:

```
main.children: H1, P, DIV[alert], UL, HR, P, P, P
alertText: ⚠ La API de CODEMIND no está disponible. Puedes ver los proyectos, pero no preguntar hasta que vuelva.
           Arráncala con make up y pulsa Reintentar. | Reintentar
alertCode: make up; button type: button; alert colours rgb(92, 61, 0) on rgb(255, 249, 219), border rgb(255, 212, 59)
article: … indexado, Explorar proyecto (no listo, no comprobando…); active: BODY
/health requests: 2 (StrictMode), still 2 three seconds later; console: two "Failed to load resource … 500" (the proxy, API down)
viewport 320 px: document scrollWidth 305 = viewport without scrollbar (no horizontal scroll); article 8.5–296.5 inside main 1–304
```

Output C — API started again (`curl http://127.0.0.1:3000/health` → `{"status":"ok"}`), then
`browser.mjs --session ssw60 --script ssw-retry.mjs` on the same page:

```
before: alerts 1, active BODY; Tab → focused "BUTTON Reintentar"; Enter
requests: GET /health (one); after: alerts 0, buttons 0, active "H1 Elige un proyecto para explorar"
```

Output D — `browser.mjs --session ssw60 --script ssw-hang.mjs`, with `page.route('**/health', () => {})`
(the request reaches the browser's network layer and is never answered; the page's own 5 s limit aborts it):

```
at +4 s: alerts 0, comprobando… shown; alert shown at +5 840 ms after the reload
/health log: request +348 ms, failed +352 ms (StrictMode's first), request +353 ms, failed +5 348 ms (time limit)
after the alert: comprobando… false, listo false; no request in the next 6 s (2 in total)
Tab, Enter, Enter, Enter → requests during the retry: 1; button "Reintentando…", focused: true, alerts 1
retry reaches its limit: request +11 880 ms, failed +16 877 ms; button "Reintentar", focused: true, text unchanged, listo false
leave: reload, Tab → "Explorar proyecto acme-shop→", Enter → request +273 ms, failed +366 ms (aborted at the click);
       url /p/a794456d-6d1b-5b55-a360-13fec83dc7bc, h1 "Consulta del proyecto", alerts 0 six seconds later
```

Output E — temporary route (restored at once), `browser.mjs http://localhost:5173/ssw-boom --script ssw-boom.mjs`:

```
banner: CODEMIND / Comprensión de repositorios con evidencia verificable
main: Algo ha fallado / La pantalla no se ha podido mostrar. Recarga la página o vuelve a la selección de proyecto.
      / Volver a la selección de proyecto (href "/"); text "boom": false
Tab, Enter → http://localhost:5173/ (Screen 1)
```

The browser driver (patchright) does not report the page's console messages, so the `console.error` React
Router writes for the caught error was not observed live; its development build logs it
(`node_modules/react-router/dist/development/chunk-OB3PAWPO.mjs:6243`, "React Router caught the following
error during render"), which is what design "Risks" relies on.

Screenshots (all under this folder):

- [`./2026-10-18-ssw-wireframe-1.png`](./2026-10-18-ssw-wireframe-1.png) — the wireframe, rendered.
- [`./2026-10-18-ssw-api-up.png`](./2026-10-18-ssw-api-up.png) — Screen 1, API up.
- [`./2026-10-18-ssw-api-down.png`](./2026-10-18-ssw-api-down.png) — Screen 1, API stopped.
- [`./2026-10-18-ssw-narrow-320.png`](./2026-10-18-ssw-narrow-320.png) — Screen 1, API stopped, 320 px wide.
- [`./2026-10-18-ssw-retry.png`](./2026-10-18-ssw-retry.png) — after «Reintentar» with the API back.
- [`./2026-10-18-ssw-retrying.png`](./2026-10-18-ssw-retrying.png) — a pending retry, «Reintentando…» focused.
- [`./2026-10-18-ssw-error-screen.png`](./2026-10-18-ssw-error-screen.png) — the app's error screen.
- [`./2026-10-18-ssw-project.png`](./2026-10-18-ssw-project.png), [`./2026-10-18-ssw-not-found.png`](./2026-10-18-ssw-not-found.png) — the other two paths.

## Findings

| # | Severity | Finding |
|---|---|---|
| S1 | Minor | At 320 px the alert keeps «Reintentar» beside the text, so the message wraps in a column about 110 px wide (`./2026-10-18-ssw-narrow-320.png`). Readable and no horizontal scroll (WCAG 1.4.10 holds), but cramped |

Destination in `design.md` → Follow-ups.

## State

- Before: `select count(*) from query_log` → 3; `npm run cli -- projects` → acme-shop stored (sample).
- After: `query_log` → 3; projects unchanged; ports `3000` and `5173` no longer listening; browser session
  `ssw60` closed; `packages/web/src/router.tsx` identical to `HEAD`.
- Restored: yes (only `GET /health` was called, which writes nothing; the temporary route was removed).

## Not demonstrated

- Nothing of the spec. The pending first check under a live API is too short to see (it is shown under
  the interception of output D); the axe and unit scenarios are covered by the suite, not by the browser.

## Handoff

The change is demonstrably working: every browser-observable scenario of `project-picker` and the three
paths of `web-foundation` behave as the spec says against the real API and the real development server,
including the error screen reached by hand. One Minor layout finding (S1). No screenshot was left at the
repository root (`git status --short` shows only the reports folder and the author's `.claude/` edits).

## Addendum — after the fixes (2026-10-18)

Vite started again (`npm -w packages/web run dev`), no API process (so the page shows the alert), then
`browser.mjs http://localhost:5173/ --script <scratchpad>/ssw-fix.mjs`:

```
320 px: scrollWidth 320 = viewport; message box 220 px wide; button below the message: true
1 280 px: button on the message's row: true (message 566 px wide)
/health intercepted, answer held: Tab → "Reintentar", Enter, Tab → "Explorar proyecto acme-shop→";
answer released (200 {"status":"ok"}) → alerts 0, «listo», focus on "A Explorar proyecto acme-shop→"
```

- S1 fixed (design D34): [`./2026-10-18-ssw-narrow-320-fixed.png`](./2026-10-18-ssw-narrow-320-fixed.png).
- The new scenario "A successful retry leaves the focus where the person moved it" behaves live as the
  spec says (design D32). "A check the page cancels itself changes nothing on the screen" is what output A
  and output D already showed in development: the first `/health` aborted by `StrictMode` and no alert.
- Vite stopped afterwards (port `5173` no longer listening); no API was started, so `query_log` is
  unchanged.
