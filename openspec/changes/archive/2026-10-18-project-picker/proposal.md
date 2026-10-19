## Why

The web client has a router, a typed API client, a theme and an accessibility gate (DIS-58,
`web-foundation`), but `/` still shows the placeholder «Esta pantalla está en construcción.». Whoever
opens `http://localhost:5173` after `make up` cannot see the sample projects nor reach one, and gets no
signal when the API is stopped, so the first screen of the demo (readme §1.3, wireframe
`images/pantalla-1-seleccion.svg`) does not exist yet. DIS-60 (CM-HU-15a.2, parent DIS-51) builds it
now: its two blockers (DIS-58 and DIS-92, the generated `SAMPLE_PROJECTS` constant) are closed, and
DIS-65 (Screen 2) starts from the link this screen provides.

## What Changes

- **Screen 1 on `/`** (replaces the placeholder): the level-1 heading «Elige un proyecto para
  explorar», the subtitle «Repositorios precargados · sin registro · sin instalación» and one card per
  project of the versioned sample-project constant, painted on the first render without any HTTP
  request. Each card shows the project's name, language/framework, four counts (files, symbols, edges,
  commits), the «indexado» badge and a keyboard-reachable link «Explorar proyecto» to `/p/{id}`.
- **API status**: the page checks `GET /health` once when it mounts. When the API answers, each card
  also shows the «listo» badge; when it does not (any failure, error answer or time-out), an alert
  «La API de CODEMIND no está disponible…» with a «Reintentar» button appears between the subtitle and
  the cards. While the first check runs, each card shows «comprobando…»; retrying sends one new check
  (the button reads «Reintentando…» meanwhile); a success removes the alert and moves focus to the
  heading (unless the person moved it meanwhile). The page never retries on its own.
- **«+ Indexar mi propio repositorio»**: the wireframe's text, below a dashed separator, as a
  non-interactive paragraph followed by the CLI command and a requirements line that matches today's
  indexer (no PHP needed, only PHP repositories for now).
- **App error screen**: a Spanish error screen («Algo ha fallado», with a link back to `/`) replaces
  React Router's default English one when a route fails to render (follow-up #5 of DIS-58).
- **Accessibility**: a new axe test scans `/` with the API up, with the API down (alert visible) and the
  error screen; the existing gate keeps scanning the real routes unchanged.
- **Coherence constant ↔ seed**: no new test. `tests/unit/seed/sample-projects-coherence.spec.ts`
  (DIS-92) already fails when the constant and `seeds/graph-dump.sql` diverge; this change relies on it.
- Deviations from the wireframe (one card while task-api does not exist, no language versions, the real
  counts, the alert the wireframe does not draw, the requirements line, the button colour) are recorded
  as decisions in `design.md` and in the Enhanced description of DIS-60.

## Capabilities

### New Capabilities

- `project-picker`: Screen 1 of the web client — the sample-project cards from the versioned
  constant, the API-unavailable alert with its retry, the non-interactive «Indexar mi propio
  repositorio» hint, the app's error screen, and their accessibility checks.

### Modified Capabilities

- `web-foundation`: requirement "Routes of the web client" is replaced (REMOVED + ADDED, design D15) by
  "Routes and screens of the web client": `/` now shows Screen 1 (the `project-picker` capability)
  instead of a placeholder, only `/p/{projectId}` remains a request-free placeholder, and every route is
  wrapped by the app's error screen; the scenario "The root path shows the Screen 1 placeholder" is
  retired. Requirement "Component test environment" is MODIFIED: its leak scenario renders Screen 1
  instead of the Screen 1 placeholder (wording only; same assertion).

## Impact

- Code: `packages/web/src/router.tsx` (root route with `errorElement`, `/` → `ProjectPickerPage`); new
  `packages/web/src/pages/{ProjectPickerPage,RouteErrorPage}.tsx`, `packages/web/src/pages/useApiHealth.ts`,
  `packages/web/src/components/{ProjectCard,ErrorBanner}.tsx` and
  `packages/web/src/components/project-display.ts`. No change to the API client, the theme tokens, the
  constant, the seed generator, the API or the backend packages.
- Tests: new `packages/web/src/pages/ProjectPickerPage.test.tsx`,
  `packages/web/src/pages/RouteErrorPage.test.tsx`, `packages/web/src/components/project-display.test.ts`,
  `tests/a11y/project-picker.a11y.test.tsx`. In `packages/web/src/router.test.tsx` only the test of the
  retired scenario "The root path shows the Screen 1 placeholder" is removed; its checks move to
  `ProjectPickerPage.test.tsx` under the `project-picker` scenarios; no other existing test is edited.
- Dependencies: none (react-router 7, Tailwind 4, RTL, user-event, axe-core and jsdom are installed).
- Docs: `docs/project-context.md` (web section), `docs/DEMO.md` (the "web has no screens yet" note),
  `docs/frontend-standards.md` if the page structure rule changes, `prompts.md` (section + Índice).
- Privacy/security: none. The page renders only the versioned constant (no personal data, no user
  input, no `dangerouslySetInnerHTML`, no `VITE_*` variable); the health check is the existing
  same-origin `GET /health`.
- Performance: the cards never wait for the network (LCP does not depend on the API); the «listo» badge
  appears in the existing badge row without shifting the layout.

## Non-goals

- No HTTP project listing nor `GET /api/projects` (rejected, PH-01): a project indexed with the CLI does
  not appear on this screen.
- No indexing form or active control in the web (gate question 2).
- No real Screen 2 (DIS-65): navigation ends at the link to `/p/{id}`.
- No task-api card (CM-HU-18, Entrega 3) and no change to the constant or its generator (DIS-92).
- No automatic retry or periodic polling of the health check; no global state.
