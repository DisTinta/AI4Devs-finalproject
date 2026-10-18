# Verify Against Spec — project-picker (DIS-60)

- Date: 2026-10-18
- Change: project-picker (DIS-60), task 14.3
- Compared: `specs/project-picker/spec.md` and `specs/web-foundation/spec.md` (as delivered at `63b96cd`,
  unchanged since) and the DIS-60 DoD against the code of `feature/DIS-60-project-picker` at `9d9e1f1`
  (`git diff origin/feature/entrega-2-CRN...HEAD`). Run in the agent's own context in the autonomous run
  (ADR `20261016-autonomous-workflow-run-entrega-2`), in a session other than the one that implemented it.
- `npx openspec validate project-picker --strict` → valid.

## 1. Requirements implemented correctly

| Requirement | Code | Proof |
|---|---|---|
| Sample-project cards without HTTP | `packages/web/src/pages/ProjectPickerPage.tsx:35-52` (`PageFrame`, `h1`, subtitle, alert slot, `ul aria-label="Proyectos de muestra"` mapping `SAMPLE_PROJECTS`); `components/ProjectCard.tsx:53-92` (article `aria-labelledby` its `h2`, stack line, four-count `ul`, «indexado» with ✓ `aria-hidden`, `Link` to `/p/${encodeURIComponent(id)}` with `sr-only` name and → `aria-hidden`) | `ProjectPickerPage.test.tsx:102` and `:152`; live in `2026-10-18-show-spec-working.md` (Chromium computes the same names) |
| How a project is written on its card | `components/project-display.ts:39-42` (`stackLabel`, `ReadonlyMap` labels, `null` framework), `:50-52` (`languageIcon`), `:62-64` and `:75-77` (`groupDigits` with U+00A0, `formatCount` singular only for 1); icons in `aria-hidden` spans (`ProjectCard.tsx:61-63`, `:71`) | `components/project-display.test.ts:16`, `:34` (code points asserted) |
| API status on Screen 1 | `pages/useApiHealth.ts:34-62` (one `getHealth({ signal })` on mount, any non-abort rejection → `unavailable`, abort on unmount, ref guard, `retrying`); `ProjectPickerPage.tsx:22-27` (focus to `h1` only after a successful retry), `:40-45` (alert between subtitle and list); `components/ErrorBanner.tsx:23-36` (role `alert`, text, `type="button"`, «Reintentar»/«Reintentando…»); `ProjectCard.tsx:31-39` (badge «comprobando…»/«listo»/none) | `ProjectPickerPage.test.tsx:175`, `:193`, `:247`, `:273`, `:296`, `:314`, `:336` |
| Indexing a repository of one's own is a hint, not a control | `ProjectPickerPage.tsx:53-62` (`hr` dashed, `p`, `code`, requirements `p`; no control) | `ProjectPickerPage.test.tsx:355` |
| App error screen | `router.tsx:21-30` (pathless root with `errorElement`); `pages/RouteErrorPage.tsx:12-22` (no `useRouteError()`); `components/BackToPickerLink.tsx` | `RouteErrorPage.test.tsx:28`; live by hand in the show-spec-working report |
| Accessibility of Screen 1 and of the error screen | — | `tests/a11y/project-picker.a11y.test.tsx:99`, `:120`, in `npm run test:a11y` (root script runs `tests/a11y`) |
| Card figures are the seed's | no figure in `ProjectCard.tsx` / `ProjectPickerPage.tsx` (step 9 grep) | `tests/unit/seed/sample-projects-coherence.spec.ts:12` untouched and green |
| Routes and screens of the web client (`web-foundation`) | `router.tsx:21-30`; Screen 2 placeholder and not-found unchanged; error screen wraps every route | `router.test.tsx:42`, `:58`; "The development server serves the three paths" live (step 10 and show-spec-working) |
| Component test environment (`web-foundation`, MODIFIED wording) | unchanged | `router.test.tsx:86` |

DIS-60 DoD: cards from the constant without HTTP, the API-down notice, the coherence test green, a11y in
`npm run test:a11y`; all met.

## 2. Requirements missing or partial

- **V1 — partial evidence.** "API status on Screen 1": «the first check SHALL NOT move the focus, whatever
  its outcome». Only the `available` outcome asserts it (`ProjectPickerPage.test.tsx:190`); no test
  checks the focus after a first check that fails. A page that focused the alert's button when the first
  check fails would pass the suite.
- **V2 — partial evidence.** "API status on Screen 1": «When the check fails for any reason other than the
  page itself cancelling it … the page SHALL show an alert», and «that cancellation SHALL change nothing on
  the screen». The "ignore an aborted check" guard (`useApiHealth.ts:38`) is never exercised by a test
  that can see its effect: "Leaving Screen 1 cancels a pending check" unmounts the page, so a missing guard
  changes nothing visible. The step 9 report lists it as a mutation survivor whose only evidence is the
  manual `StrictMode` run of step 10.

Nothing in the spec is absent from the code.

## 3. Unspecified behaviour

All of it is deliberate and already recorded as a decision; none is new scope:

- `h1 tabIndex={-1}` (`ProjectPickerPage.tsx:36`): the means of the specified focus move (D9).
- The top stripe and its alternation by position (`ProjectCard.tsx:57`), `aria-hidden` (D3).
- The decorative ⚠ of the alert (`ErrorBanner.tsx:27`), `aria-hidden` (D9).
- `encodeURIComponent` on the project id in the link (`ProjectCard.tsx:84`): the spec says `/p/<id>`; the
  ids are UUIDs, so the result is identical; it keeps the link a single path segment for any future id
  (same rule as the API client's `ask`, DIS-58).
- `BackToPickerLink` shared by the not-found and error screens (D27; no behaviour change).

Checks asked by the skill:

- Dependencies: none imported that is not in a manifest (`react`, `react-router`, `axe-core`,
  `@testing-library/*` are installed since DIS-58; no `package.json` change in the diff).
- Authorisation: none required by the spec; none performed.
- Response fields: the page reads only `GET /health` through `getHealth`; no field beyond the spec.
- Weaker tests: see V1 and V2. "Pressing again while a retry is pending sends no request" presses three
  times with `user.click` (each awaited), which is what the scenario states; it does not prove the
  same-tick case of D17, which the spec does not require.

## Scenario → test → state

| Scenario | Test | State |
|---|---|---|
| Screen 1 shows the sample projects without waiting for the API | `ProjectPickerPage.test.tsx:102` | green |
| The project link is reached and followed with the keyboard | `ProjectPickerPage.test.tsx:152` | green |
| Language and framework labels | `project-display.test.ts:16` | green |
| Counts in singular, in plural and with grouped digits | `project-display.test.ts:34` | green |
| An available API adds the «listo» badge | `ProjectPickerPage.test.tsx:175` | green |
| An unavailable API shows the alert and keeps the cards | `ProjectPickerPage.test.tsx:193` | green (V1) |
| A health check that never answers shows the alert after its time limit | `ProjectPickerPage.test.tsx:247` | green |
| Retrying after the API comes back removes the alert | `ProjectPickerPage.test.tsx:273` | green |
| Pressing again while a retry is pending sends no request | `ProjectPickerPage.test.tsx:296` | green |
| A failed retry keeps the alert | `ProjectPickerPage.test.tsx:314` | green |
| Leaving Screen 1 cancels a pending check | `ProjectPickerPage.test.tsx:336` | green (V2) |
| The indexing hint is text, not a control | `ProjectPickerPage.test.tsx:355` | green |
| A route that fails to render shows the app's error screen | `RouteErrorPage.test.tsx:28` | green |
| Screen 1 has no axe violations with the API available or unavailable | `tests/a11y/project-picker.a11y.test.tsx:99` | green |
| The error screen has no axe violations | `tests/a11y/project-picker.a11y.test.tsx:120` | green |
| The cards show the seed's figures | command: `tests/unit/seed/sample-projects-coherence.spec.ts:12` + the first scenario | green |
| A project path shows the Screen 2 placeholder with its id | `router.test.tsx:42` | green |
| An unknown path shows the not-found screen and leads back | `router.test.tsx:58` | green |
| The development server serves the three paths | manual: step 10, show-spec-working | green (live) |
| Rendered output does not leak between tests | `router.test.tsx:86` | green |

Run: `npx vitest run packages/web tests/a11y tests/unit/web tests/unit/seed/sample-projects-coherence.spec.ts`
→ 11 files, 41 tests passed.

Destinations of V1 and V2 in `design.md` → Follow-ups. No fix is made in this report.

## Addendum — after the fixes (2026-10-18)

- **V1 — fixed.** The scenario "An unavailable API shows the alert and keeps the cards" states that the
  focus is still on the document body, and its test asserts it in the four runs
  (`ProjectPickerPage.test.tsx`, `focusOnBody`); focusing the `h1` when the check fails (temporary,
  reverted) makes it fail.
- **V2 — fixed.** New scenario and test "A check the page cancels itself changes nothing on the screen"
  (routes inside `StrictMode`); removing the guard of `useApiHealth.ts` (temporary, reverted) makes it fail.
- New requirement text and scenario "A successful retry leaves the focus where the person moved it"
  (adversarial finding 1): implemented in `ProjectPickerPage.tsx` (focus effect, D32), RED then GREEN.

| Scenario | Test | State |
|---|---|---|
| A successful retry leaves the focus where the person moved it | `ProjectPickerPage.test.tsx`, test of the same name | green |
| A check the page cancels itself changes nothing on the screen | `ProjectPickerPage.test.tsx`, test of the same name | green |
| An unavailable API shows the alert and keeps the cards (now with the focus) | `ProjectPickerPage.test.tsx`, test of the same name | green |

Re-run of the three blocks over the fixed code: block 1 gains the two scenarios above; block 2 is empty;
block 3 is unchanged (the `div` that wraps the ⚠ and the message is layout, D34). Targeted run: 11 files,
43 tests passed.
