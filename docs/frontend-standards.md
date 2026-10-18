---
description: Frontend development standards for React — component architecture, service layer, state, accessibility and testing.
globs: ["packages/web/**/*.{jsx,tsx,css}"]
alwaysApply: true
---

# Frontend Standards — React

## 1. Technology stack

- **React** with function components and hooks. No class components in new code.
- **TypeScript** for anything new. Existing JavaScript files may stay as they are.
- **Vite** — build tooling and dev server.
- **Tailwind** for styling. Configuration lives in CSS, not in a JavaScript config file
  (`packages/web/src/index.css`: `@import "tailwindcss"` + `@theme` with the wireframe tokens).
- **Vitest** + **React Testing Library** (+ `user-event`) on **jsdom** — component tests.
- **React Router** (data mode) — the route table in `packages/web/src/router.tsx`.
- **Playwright** — end-to-end, for critical flows only.
  _(target; not yet a dependency — remove this note when installed.)_
- Accessibility automation via the project script **`test:a11y`** (axe-core or equivalent).

## 2. Architecture

All frontend code lives under `packages/web/src/`; the folders below are relative to it.

- **Service layer** in `services/`: one module per resource, exporting async functions that map to
  endpoints. Components never build a request URL by hand.
- **Components** in `components/`: presentation separated from business logic. Props typed with an
  interface.
- **Pages** in `pages/`: composition and data loading. A page orchestrates; it does not implement.
- **State**: local with hooks. Do not introduce a global state library until two unrelated pages
  genuinely need the same mutable state. Server state does not belong in global client state.
- Loading and error states are explicit and rendered, never silent.
- **Evidence states are explicit UI states**, like loading and error. The product distinguishes what
  is **observed** from what is **inferred**, renders the supporting **citations**, and shows an
  explicit **"insufficient evidence"** state instead of a plausible-looking answer (mirrors
  `backend-standards.md` §3).

## 3. Hard rules

- Every value that crosses the network boundary is typed. The API response type is declared once, in
  the service module, and derived from the API specification where possible.
- Never interpolate user input into markup that bypasses escaping.
- Never keep a token in local storage if a cookie-based session is available.
- A component that fetches, transforms, renders and handles errors is four components.
- Accessible queries in tests (`getByRole`, `getByLabelText`), never test IDs as the first choice: if
  the accessible query is hard to write, the markup has an accessibility problem.
- No secrets in frontend environment variables. Anything shipped to the browser is public.
- Target **WCAG 2.2 AA**: contrast at least 4.5:1 for normal text, full keyboard operation with a
  visible focus, labelled controls, and landmarks. Automated axe checks catch a fraction of issues;
  they do not replace a keyboard pass (and a screen-reader pass on critical journeys).
- Do not ask the agent to "optimise performance" without a measurement. Core Web Vitals targets:
  **LCP < 2.5s**, **INP < 200ms**, **CLS < 0.1**. Measure, change one thing, re-measure.

## 4. Testing

- Component tests for behaviour a user can observe: what is rendered, what happens on interaction,
  what appears on error.
- Mock at the network boundary, not at the module boundary: the component under test should not know
  it is being tested.
- End-to-end only for critical journeys: authentication, the main creation flow, payment. Everything
  else is cheaper and more stable one level down.
- Arrange-Act-Assert, the three blocks separated and commented.
- Run `npm run test:a11y` (or the project's equivalent) on UI touched by the change before calling
  the work done.

### How `test:a11y` is wired

- `npm run test:a11y` = `vitest run tests/a11y`; the file is `tests/a11y/smoke.a11y.test.tsx` (jsdom,
  type-checked by `tests/a11y/tsconfig.json`, which extends the web's).
- It renders the **real route table** (`routes` of `packages/web/src/router.tsx`) in a memory router at
  `/`, `/p/<acme-shop id>` and an unknown path, inside a document with `lang="es"` and a title, and runs
  `axe.run(document)` on each: any violation fails. A screen that replaces a placeholder on one of these
  routes is scanned without editing the test; a new route needs its path added.
- A negative control (an image without `alt`) proves axe really runs in that environment.
- axe in jsdom computes no styles, so it cannot judge colour contrast: the theme test
  (`packages/web/src/theme.test.ts`) checks every text/background pair of the `@theme` tokens at 4.5:1.
  Keyboard operation and visible focus are checked by hand in a real browser.
- `.github/workflows/frontend.yml` runs the script in its `Accessibility (test:a11y)` step. Do not add a
  no-op script that always exits 0: a green run must mean the routes were scanned.

## 5. Definition of done for a frontend change

- Loading, empty, error and success states all implemented and visually checked.
- Keyboard navigation works for anything interactive; no new WCAG 2.2 AA regressions on touched UI.
- `test:a11y` is clean for the surfaces changed (or gaps are explicit non-goals in the change).
- If the change touches a route, hero, or LCP-critical assets, note the expected CWV impact (or attach
  a before/after measurement).
- The change was exercised in a real browser, by the agent, before the task was marked complete.
