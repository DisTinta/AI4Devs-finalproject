## Why

`packages/web` is today a placeholder: `App.tsx` renders «pending — Entrega 2/3» with inline styles,
there is no router, no styling system, no API client and no component test tooling. `frontend.yml`
prints a warning instead of running `test:a11y` because the root `package.json` has no such script, and
`tests/a11y/smoke.example.tsx` is the kit scaffold that Vitest never discovers. The three web screens of
Entrega 2 (DIS-60 project picker, DIS-65 ask page, DIS-66 usage and error states) all need the same base:
styles taken from the wireframes of `readme.md` §1.3, the routes `/` and `/p/{id}`, one typed client of
the API with a defined error model, and an accessibility gate that fails CI for real. Building it inside
the first screen would make every later screen re-derive it from code.

This is DIS-58 (CM-HU-15a.1), the scaffolding sub-issue of CM-HU-15a (DIS-51). Its user story: "Como
persona que desarrolla las pantallas de la web de CODEMIND (DIS-60, DIS-65, DIS-66), quiero un andamiaje
con estilos base tomados de los wireframes, rutas, un cliente tipado de la API y una puerta de
accesibilidad real en CI, para construir cada pantalla sin rehacer la base y sin que un fallo de
accesibilidad o un cambio de contrato de la API pase desapercibido." The DoD of the ticket: `npm run
test:a11y` and an example RTL test pass in `frontend.yml`, and the *target* notes are removed from the
standards.

The decisions D1–D16 were taken by the agent as lead engineer in the autonomous run of Entrega 2 (ADR
`20261016-autonomous-workflow-run-entrega-2`) and recorded in the DIS-58 `[enhanced]` description on
2026-10-17; the author reviews them afterwards. `design.md` carries them and the refinements made while
proposing.

## What Changes

- **Styles from the wireframes.** Tailwind 4 through `@tailwindcss/vite`, configured in CSS
  (`packages/web/src/index.css`: `@import "tailwindcss"` + `@theme`) with the palette, font family and
  radii of `images/pantalla-1-seleccion.svg` and `images/pantalla-2-consulta.svg`. Text/background
  pairs of the wireframe under 4.5:1 are darkened (WCAG 2.2 AA); a test reads `index.css` and fails if
  any listed pair drops under 4.5:1.
- **Routes.** `react-router` 7 in data mode: an exported `routes` table (`/`, `/p/:projectId`, `*`) and
  `createAppRouter()`. `/` and `/p/:projectId` render a `PendingScreen` placeholder (dark header
  «CODEMIND», the wireframe tagline, the line «Esta pantalla está en construcción.») until DIS-60/DIS-65 replace it; `*` renders
  `NotFoundPage` («Página no encontrada», link «Volver a la selección de proyecto»). `main.tsx` mounts
  `RouterProvider`; `App.tsx` is removed.
- **Typed API client.** `packages/web/src/services/api-client.ts`: the response types of `GET /health`
  and `POST /api/projects/{projectId}/ask` declared once, `getHealth()` (5 000 ms default timeout) and
  `ask()` (no default timeout, caller's `AbortSignal`), relative URLs only, and two error classes:
  `ApiError` (the API answered in its error format) and `ApiUnavailableError` (network down, timeout or a
  response that is not the API's). A type-level contract test makes `npm run typecheck` fail when these
  types drift from the Zod schemas of `packages/api`.
- **Same origin through the Vite proxy.** `vite.config.ts` forwards `/api` and `/health` to
  `http://127.0.0.1:3000` in `dev` and `preview` (the API has no CORS; `readme.md` §1.4).
- **Component test tooling.** jsdom, React Testing Library and `user-event` in the root
  `devDependencies` (where Vitest lives); `vitest.config.ts` runs `*.test.tsx` files of `packages/web`
  and the files of `tests/a11y` in jsdom, the rest stays in Node; the DOM is emptied after every jsdom
  test, and route navigation works under jsdom.
- **Architecture guard.** A dependency-cruiser rule forbids `packages/web` from importing the API or any
  backend package.
- **Real accessibility gate.** The scaffold is renamed to `tests/a11y/smoke.a11y.test.tsx`, which
  renders the real `routes` at `/`, `/p/<acme-shop id>` and an unknown path and expects no `axe-core`
  violation, plus a negative control proving axe really runs. Root script `"test:a11y": "vitest run
  tests/a11y"`; `frontend.yml` runs it without the warning.
- **Standards and docs.** The Tailwind and RTL + jsdom *target* notes leave `docs/frontend-standards.md`
  (the Playwright one stays: Playwright is not installed here); §4 describes how `test:a11y` is wired.
  `docs/TESTING.md`, `docs/DEPLOYMENT.md` and `docs/project-context.md` stop saying `test:a11y` does not
  exist; `prompts.md` gets the section of this change and its Índice entry.

Non-goals (DIS-58 `[enhanced]` §4): any real screen (`ProjectPickerPage` is DIS-60, `AskPage` and its
components DIS-65, usage and error states DIS-66); the `/p/:projectId/impact` route and impact types (no
impact API in Entrega 2); Playwright and end-to-end tests (DIS-75); `eslint-plugin-jsx-a11y`,
`eslint-plugin-react-hooks`; a global state or server-state library; any change to `packages/api` (no
CORS, no route); deploying the web beyond local (closed decision 1); a base-URL environment variable.

## Capabilities

### New Capabilities

- `web-foundation`: the base of the web client — the routes and their placeholder and not-found
  screens, the typed API client and its error model (`ApiError` / `ApiUnavailableError`, health-check
  timeout, cancellation), the same-origin proxy to the API, the theme tokens and their minimum contrast,
  and the accessibility gate `test:a11y` over the real routes.

### Modified Capabilities

None. `api-foundation` and `http-ask` are consumed as they are (their error format and routes); no
requirement of theirs changes.

## Impact

- **Code:** `packages/web/src/` — new `index.css`, `theme-contrast.ts`, `router.tsx`,
  `services/api-client.ts`, `pages/NotFoundPage.tsx`, `components/AppHeader.tsx`,
  `components/PendingScreen.tsx` and co-located tests (`router.test.tsx`, `services/api-client.test.ts`,
  `theme.test.ts`); `main.tsx` changes; `App.tsx` removed; `packages/web/vite.config.ts` gains the
  Tailwind plugin and the proxy. `tests/a11y/smoke.example.tsx` becomes `tests/a11y/smoke.a11y.test.tsx`
  with its own `tests/a11y/tsconfig.json`; new `tests/unit/web/api-contract.spec.ts`,
  `tests/unit/web/vite-config.spec.ts` and `tests/support/jsdom-setup.ts` (DOM cleanup and the router's
  `Request` workaround under jsdom). No change in `packages/core`, `packages/api`, `packages/cli` nor the
  adapters.
- **Dependencies (each justified in `design.md`, D14):** `packages/web` gains `react-router ^7`
  (runtime), `tailwindcss ^4` and `@tailwindcss/vite ^4` (build); the root `devDependencies` gain
  `jsdom ^26`, `@testing-library/react ^16`, `@testing-library/dom ^10`, `@testing-library/user-event
  ^14` and `axe-core ^4`. `package-lock.json` is regenerated with `npm install` (CI runs `npm ci`).
- **Config and CI:** root `package.json` gains the `test:a11y` script and `typecheck` checks
  `tests/a11y/tsconfig.json`; `vitest.config.ts` gains the per-path environment, the JSX transform and the
  setup file. `frontend.yml`'s `test:a11y` step runs the script once it exists; its paths filter gains
  `packages/web/**` and `tests/unit/web/**` so a change to a `.ts` file of the web runs the job (D27).
  `.dependency-cruiser.cjs` gains the rule `web-no-backend` (D28). The `quality` job of `ci.yml` runs the
  jsdom tests too (it runs the whole suite). Stryker's `mutate` is unchanged (`packages/web` is not in
  it); `vitest.stryker.config.ts` excludes the web tests, which can kill no mutant (D25).
- **Privacy / security:** no personal data. The web ships no `VITE_*` variable and no secret; React
  escapes every rendered text (no `dangerouslySetInnerHTML`); API error messages are shown as the API
  wrote them (fixed strings, `api-foundation`). The proxy only exists in the local Vite servers; no
  header or CORS is added to the API.
