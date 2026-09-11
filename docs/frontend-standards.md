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
- **Tailwind** for styling. Configuration lives in CSS, not in a JavaScript config file.
  _(target; not yet a dependency — the app currently uses inline styles. Remove this note when installed.)_
- **Vitest** (installed) + **React Testing Library** — component tests.
  _(React Testing Library and jsdom are targets; not yet dependencies — remove this note when installed.)_
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

### Wiring `test:a11y`

The installer copies `tests/a11y/smoke.example.tsx` if that path does not already exist. It is a
scaffold, not a test: Vitest will not discover it, and the kit never edits `package.json`.

To turn the frontend CI job into a real gate:

1. `npm i -D axe-core vitest @testing-library/react jsdom` (skip packages you already have).
2. Rename the scaffold to `tests/a11y/smoke.a11y.test.tsx`.
3. Add this script to `package.json`:

```json
"test:a11y": "vitest run tests/a11y"
```

4. Replace `ExampleSurface` in that file with a real page or component from this app.

Do not add a no-op script that always exits 0. `frontend.yml` runs `npm run test:a11y` only when that
script exists; otherwise it logs a warning and continues. A green run on the kit placeholder is
wiring, not coverage.

## 5. Definition of done for a frontend change

- Loading, empty, error and success states all implemented and visually checked.
- Keyboard navigation works for anything interactive; no new WCAG 2.2 AA regressions on touched UI.
- `test:a11y` is clean for the surfaces changed (or gaps are explicit non-goals in the change).
- If the change touches a route, hero, or LCP-critical assets, note the expected CWV impact (or attach
  a before/after measurement).
- The change was exercised in a real browser, by the agent, before the task was marked complete.
