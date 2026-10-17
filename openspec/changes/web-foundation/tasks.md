## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [ ] 0.1 First action of the apply: confirm DIS-58 is In Progress in Linear (set it if not), with a short comment in Spanish naming the change `web-foundation` and the branch `feature/DIS-58-web-scaffolding`
- [ ] 0.2 Feature branch `feature/DIS-58-web-scaffolding` (`BRANCH_PREFIX=feature/`, `docs/project-context.md` → Branch and ticket conventions), created from `feature/entrega-2-CRN` before `/opsx:propose`; confirm `git merge-base --is-ancestor origin/feature/entrega-2-CRN HEAD` and that `openspec/changes/web-foundation/` is on it. `git fetch`; if `origin/feature/entrega-2-CRN` moved, rebase before any code (never force-push a published branch)
- [ ] 0.3 Verify the current branch (`git branch --show-current`) and `git status`; `.claude/sdd-harness.env` and `.claude/settings.json` carry local changes that are never staged
- [ ] 0.4 Baseline: run `npx vitest run` once, green, and record the totals (files, tests, duration) for the step 10 report; record that this change touches no database (no data indicator to capture beyond "no DB access")

## 1. Dependencies and tooling (design D3, D6, D7, D14, D17, D18, D23, D25)

- [ ] 1.1 `npm install -w packages/web react-router@^7` and `npm install -w packages/web -D tailwindcss@^4 @tailwindcss/vite@^4`; `npm install -D jsdom@^26 @testing-library/react@^16 @testing-library/dom@^10 @testing-library/user-event@^14 axe-core@^4` at the root. Check the resolved versions match D14 (react-router 7.x, not 8) and that `package-lock.json` lists the Linux binary of `@tailwindcss/oxide` (optional dependency)
- [ ] 1.2 `vitest.config.ts`: `esbuild: { jsx: 'automatic' }` (D23); `test.environmentMatchGlobs` `[['packages/web/**/*.test.tsx', 'jsdom'], ['tests/a11y/**', 'jsdom']]` (D17); `test.setupFiles: ['tests/support/dom-cleanup.ts']`. Create `tests/support/dom-cleanup.ts` (D18: `afterEach` that, only when `typeof document !== 'undefined'`, imports `@testing-library/react` dynamically and calls `cleanup()`), with a header comment naming design D18
- [ ] 1.3 `vitest.stryker.config.ts`: add `packages/web/**`, `tests/a11y/**` and `tests/unit/web/**` to `exclude`, with a comment naming design D25
- [ ] 1.4 `npx vitest run` stays green with the same totals as 0.4 (the setup file changes no Node test); `npm run typecheck` green

## 2. Theme from the wireframes (TDD, design D4, D5, D12, D24) — `web-foundation` → "Theme colours and minimum contrast"

- [ ] 2.1 RED: create `packages/web/src/theme.test.ts` with "A token changed to a low-contrast value fails the theme test" (imports `contrastRatio`/`meetsAA` from `./theme-contrast`; `#4dabf7` on `#ffffff` → about 2.48 and failing; black on white → 21). See it fail (module missing)
- [ ] 2.2 GREEN: `packages/web/src/theme-contrast.ts` (WCAG 2.2 relative luminance and ratio, `meetsAA(ratio) = ratio >= 4.5`), with TSDoc
- [ ] 2.3 RED: add "Every declared text pair meets 4.5:1" to `theme.test.ts` (reads `./index.css?raw`, extracts `--color-*` from `@theme`, checks each pair of the spec table by token name resolves to the spec's value and meets 4.5:1). See it fail (no `index.css`). Add `packages/web/src/vite-env.d.ts` (`/// <reference types="vite/client" />`). If Vitest 1.6 does not return the raw text for `?raw`, switch to `readFileSync` and record it in the step 10 report (D24)
- [ ] 2.4 GREEN: create `packages/web/src/index.css`: `@import "tailwindcss";`, `@theme` with every token of D4 and `--font-sans`, `--radius-card`, `--radius-button` (D5), and `@layer base` setting `body` to `font-sans bg-canvas text-ink`. 2.1 and 2.3 green
- [ ] 2.5 `packages/web/vite.config.ts`: add `@tailwindcss/vite` to `plugins` (before `react()`); `npm run build -w packages/web` succeeds and the emitted CSS contains the `--color-accent` value `#1971c2`

## 3. Same-origin proxy (TDD, design D8, D22) — `web-foundation` → "Same-origin access to the API in local development"

- [ ] 3.1 RED: create `tests/unit/web/vite-config.spec.ts` with "Both servers forward the API paths" (imports the default export of `packages/web/vite.config.ts` by relative path; asserts `server.proxy` and `preview.proxy` map `/api` and `/health` to `http://127.0.0.1:3000`). See it fail
- [ ] 3.2 GREEN: in `packages/web/vite.config.ts`, one `apiProxy` table used by `server.proxy` and `preview.proxy`, with a comment naming design D8 (API without CORS, `127.0.0.1` not `localhost`). `npm run typecheck` green (the spec is type-checked by `tests/tsconfig.json`)

## 4. API client (TDD, design D9, D10, D19, D20) — `web-foundation` → "Health check through the API client", "Asking a question through the API client", "API errors", "Unavailable API", "Cancellation by the caller"

- [ ] 4.1 RED: create `packages/web/src/services/api-client.test.ts` (Node environment, D17) with "A healthy API resolves the health check" (`fetch` replaced with `vi.stubGlobal` by a recording double; `vi.unstubAllGlobals()` in `afterEach`). See it fail
- [ ] 4.2 GREEN: `packages/web/src/services/api-client.ts`: the types `HealthResponse`, `AskRequest`, `AskAnswered`, `AskUnknown`, `AskResponse`, `ApiErrorBody` written by hand (D10), `ApiError`, `ApiUnavailableError`, `getHealth` and the shared request/parse helper; TSDoc on every export; no import from `packages/api`
- [ ] 4.3 RED → GREEN, one at a time: "An answered question is resolved as received", "An UNKNOWN is resolved as received", "The project id is encoded as one path segment" (`ask` with `encodeURIComponent`, `content-type: application/json`, body `JSON.stringify(body)`)
- [ ] 4.4 RED → GREEN: "The error format becomes an API error" (the three answers of the scenario; `instanceof ApiError`, not `ApiUnavailableError`)
- [ ] 4.5 RED → GREEN: "Failures that are not the API's answer become unavailable-API errors" (the five answers of the scenario; `cause` set; the first one's `cause` is the same `TypeError`)
- [ ] 4.6 RED → GREEN: "A hanging API makes the health check time out" (`vi.useFakeTimers()`, `vi.advanceTimersByTimeAsync(4999)` then `(1)`; the double never resolves and rejects on its signal's abort; the request signal is aborted; D20 `AbortController` + `setTimeout`, timer and listener cleared in `finally`)
- [ ] 4.7 RED → GREEN: "Aborting a pending question cancels the request" (the caller's abort rejects with the caller's `signal.reason`, name `AbortError`, neither error class)
- [ ] 4.8 RED → GREEN: create `tests/unit/web/api-contract.spec.ts` with "A drift between the client types and the API schemas fails the type check": `import type` by relative path from `packages/web/src/services/api-client` and `packages/api/src/schemas/{ask,common}` (D19); `expectTypeOf<…>().toEqualTypeOf<…>()` for health (`z.infer<typeof healthResponseSchema>`), ask body (`AskBody`), ask response (`AskResponse`) and error body (`ErrorBody`); the negative control under `// @ts-expect-error`. RED = run `npm run typecheck` before the client types are complete or with one field renamed, and record the TS error in the step 10 report; GREEN = `npm run typecheck` passes

## 5. Routes and screens (TDD, design D2, D16) — `web-foundation` → "Routes of the web client", "Component test environment"

- [ ] 5.1 RED: create `packages/web/src/router.test.tsx` with "The root path shows the Screen 1 placeholder" (`createMemoryRouter(routes, { initialEntries: ['/'] })` + `RouterProvider`; `findByRole('heading', { level: 1, name: … })`, `getByRole('banner')`, `getByRole('main')`). See it fail
- [ ] 5.2 GREEN: `packages/web/src/components/AppHeader.tsx` (banner, «CODEMIND», tagline; theme tokens), `packages/web/src/components/PendingScreen.tsx` (props interface: heading, optional detail; `AppHeader` + `main` with the `h1` and «Esta pantalla está en construcción.»), `packages/web/src/router.tsx` (`routes` table and `createAppRouter()`); TSDoc on every export
- [ ] 5.3 RED → GREEN: "A project path shows the Screen 2 placeholder with its id" (`useParams` in the route element)
- [ ] 5.4 RED → GREEN: "An unknown path shows the not-found screen and leads back" (`packages/web/src/pages/NotFoundPage.tsx` with `AppHeader`, `h1` «Página no encontrada» and a router `Link` «Volver a la selección de proyecto» to `/`; `userEvent.setup()` + `user.click`)
- [ ] 5.5 RED → GREEN: "Rendered output does not leak between tests" (two tests in `router.test.tsx`, the second asserts `getAllByRole('heading', { level: 1 })` has length 1); if it passes at once (D18 already in place), record it as a characterisation test in the step 10 report, and prove the guard once by commenting the setup file out locally (not committed) and seeing it fail
- [ ] 5.6 `packages/web/src/main.tsx`: import `./index.css`, mount `<RouterProvider router={createAppRouter()} />` in `StrictMode`; delete `packages/web/src/App.tsx` (`git rm`); `npm run typecheck`, `npm run lint` and `npm run build -w packages/web` green

## 6. Accessibility gate (TDD, design D7, D11, D21) — `web-foundation` → "Accessibility gate on the real routes"

- [ ] 6.1 `git mv tests/a11y/smoke.example.tsx tests/a11y/smoke.a11y.test.tsx` and create `tests/a11y/tsconfig.json` (extends `../../packages/web/tsconfig.json`, `include: ["**/*.ts", "**/*.tsx"]`); add `&& tsc -p tests/a11y/tsconfig.json` to the root `typecheck` script and `"test:a11y": "vitest run tests/a11y"` to the root scripts
- [ ] 6.2 RED: rewrite the renamed file (no `ExampleSurface`, no kit warning) with "The negative control proves axe runs" (an `<img src="x.png">` without `alt` rendered in the document; `axe.run(document)` reports `image-alt`); then "The three routes have no axe violations" (`lang="es"`, `document.title = 'CODEMIND'`, routes in a memory router at `/`, `/p/${SAMPLE_PROJECTS[0].id}` and `/ruta-que-no-existe`, await the `h1`, `axe.run(document)` → `violations` equal `[]`, the failing rule ids printed on failure). Observe the failure first (for example by running before 5.2 is merged in the file, or by temporarily removing the `main` landmark locally, not committed) and record it
- [ ] 6.3 GREEN: `npm run test:a11y` passes; `npm run typecheck` green
- [ ] 6.4 "The gate runs in CI instead of warning": confirm locally that `npm run | grep ' test:a11y'` matches (the condition `frontend.yml` uses); the CI half is collected in 15.3

## 7. Review and Update Existing Tests (MANDATORY)

- [ ] 7.1 Identify the tests affected by the change: `grep -rn "smoke.example\|App.tsx\|from './App" tests/ packages/web/`, plus every type error `npm run typecheck` reports and every test whose environment changed (none expected outside `packages/web/**/*.test.tsx` and `tests/a11y/**`)
- [ ] 7.2 Update only tests whose contract this change modified (the kit scaffold is replaced, not edited to pass; no other existing test may be edited), without weakening any assertion; list every edited existing test with the reason in the step 10 report, or record "none"
- [ ] 7.3 Confirm each `#### Scenario:` of `specs/web-foundation/spec.md` maps 1:1 to a test with exactly the same name (grep each title in `packages/web/src/` and `tests/`), except the three validated by hand ("The development server serves the three paths", "The health check reaches the API through the development server", the CI half of "The gate runs in CI instead of warning"), which map to steps 11, 15.3 and `/show-spec-working`

## 8. Refactor

- [ ] 8.1 With the suite green, refactor `packages/web/src/**` and `tests/a11y/**` for naming and duplication only (no behaviour change, no test edits); `npx vitest run packages/web tests/a11y tests/unit/web` stays green

## 9. Update Technical Documentation (MANDATORY)

- [ ] 9.1 `docs/frontend-standards.md` §1: remove the Tailwind and RTL + jsdom *target* notes (keep Playwright's); §4: "Wiring `test:a11y`" becomes how it is wired (file, script, the three routes, the negative control, axe in jsdom cannot judge contrast → theme test) (D13). `docs/backend-standards.md`: keep its Playwright note
- [ ] 9.2 `docs/TESTING.md` (Accessibility row: real gate, file, what it scans) and `docs/DEPLOYMENT.md` (`Frontend` row: `test:a11y` runs, no warning)
- [ ] 9.3 `docs/project-context.md`: Commands (`npm run test:a11y`; the web `dev`/`preview` proxy of `/api` and `/health` to `127.0.0.1:3000` and that changing the API `PORT` means changing it; `npm run build -w packages/web`) and Testing (jsdom only for `packages/web/**/*.test.tsx` and `tests/a11y/**`, the cleanup setup file, where web tests live, the contract test, Stryker excludes the web tests)
- [ ] 9.4 Run `/update-docs` and confirm the docs gate passes. Add the relevant AI prompts of this change to `prompts.md` per `docs/project-context.md` → prompts.md rules, with its Índice entry in the same edit

## 10. Run Tests and Verify Data State (MANDATORY)

- [ ] 10.1 Capture the pre-test baseline: the 0.4 totals
- [ ] 10.2 Run the targeted tests: `npx vitest run packages/web tests/a11y tests/unit/web` and `npm run test:a11y`
- [ ] 10.3 Run the required broader suite and gates: `npx vitest run`, `npx vitest run --exclude 'tests/integration/**'` (the `frontend.yml` step), `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`, `npm run build -w packages/web`
- [ ] 10.4 Mutation testing does not apply (`packages/web` is not in Stryker's `mutate`; D25 excludes the web tests from its run): record it; run `npm run test:mutation` once to prove the Stryker run still starts and keeps its score with the new exclusions and setup file
- [ ] 10.5 Run `/privacy-ethics-check` over the diff (no personal data; no `VITE_*` variable or secret in the bundle — grep the `dist` output for `VITE_` and `127.0.0.1:3000`; no `dangerouslySetInnerHTML`; the new dependencies are well-known packages, versions checked in 1.1); record the result
- [ ] 10.6 Verify the post-test state: no database was touched; no `.stryker-tmp/` left; `packages/web/dist` not staged (gitignored). Restore and document if not
- [ ] 10.7 Create `openspec/changes/web-foundation/reports/YYYY-MM-DD-10-test-and-state-verification.md` from the template of `docs/openspec-tasks-mandatory-steps.md` §6, with the baseline, the characterisation tests (5.5), the RED evidence of 4.8 and 6.2, the edited existing tests (7.2), the mutation note (10.4) and the privacy check (10.5)
- [ ] 10.8 Mark complete only after the tests pass and the report exists

## 11. Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [ ] 11.1 Preconditions: local Postgres up with the seed loaded (`docker compose up -d`, `npm run db:migrate`, `npm run db:seed` only if acme-shop is not stored; record whether it ran); `DATABASE_URL` exported
- [ ] 11.2 Start `npm run dev` (root: API + web). `curl -i http://localhost:5173/health` → `200` `{"status":"ok"}` through the proxy; `curl -i -X POST http://localhost:5173/api/projects/a794456d-6d1b-5b55-a360-13fec83dc7bc/ask -H 'content-type: application/json' -d '{"question":"¿Qué hace OrderObserver?"}'` → the API's answer (evaluation mode: `200` `UNKNOWN`/`llm-required` or a cached answer); a random UUID → `404` `PROJECT_NOT_FOUND` through the proxy
- [ ] 11.3 Stop only the API: `curl -i http://localhost:5173/health` → the proxy's error (record status and body: not the API's JSON); in the browser console of the running page call the client's health check (or a temporary dev-only snippet, not committed) and record that it rejects with `ApiUnavailableError`
- [ ] 11.4 Open `/`, `/p/a794456d-6d1b-5b55-a360-13fec83dc7bc` and `/no-existe` in a headless browser (browser-automation skill): each shows its `h1`, no console error, no failed request; follow the «Volver a la selección de proyecto» link with the keyboard (Tab to it, Enter) and confirm the focus is visible and the URL becomes `/`
- [ ] 11.5 Restore the state: stop both servers; delete every `query_log` row created by 11.2 (record `count(*)` and `max(created_at)` of `query_log` before 11.2 and compare after); remove the projects `db:seed` added in 11.1 if it ran
- [ ] 11.6 Document every command, status, body and screenshot in `openspec/changes/web-foundation/reports/YYYY-MM-DD-11-manual-interface-testing.md` (screenshots saved next to it; mask the OS user name in paths)

## 12. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 12.1 The change reaches a UI but contains no user workflow yet (placeholders only; Playwright is DIS-75): the browser run of 11.4 is the end-to-end evidence; record "covered by step 11.4; no Playwright suite in this change" in the step 10 report

## 13. Pull request preparation

- [ ] 13.1 Prepare the PR description (`/pr-describe`, in Spanish) against `feature/entrega-2-CRN`, with the Why marked as the agent's decision (DIS-58 `[enhanced]` D1–D16 and design D17–D25), the dependency table of D14 and the contrast deviations of D4

## 14. Commit and push

- [ ] 14.1 Commit by explicit paths only (never `.claude/sdd-harness.env` nor `.claude/settings.json`), English messages ending with the co-author line; push with the DisTinta account and switch back to Cristina-JumpMath in the same command

## 15. Pre-merge Review (MANDATORY - AGENT MUST EXECUTE)

- [ ] 15.1 Open the pull request against `feature/entrega-2-CRN` (authorised by the autonomous-run ADR; `gh` on the DisTinta account, back to Cristina-JumpMath afterwards)
- [ ] 15.2 Set DIS-58 to In Review in Linear with a comment in Spanish linking the PR and the change
- [ ] 15.3 Confirm in the PR's CI run that the `Frontend` job ran `test:a11y` without the "not defined" warning and the new test files ran and passed in `quality`; link the run in an addendum to the step 10 report
- [ ] 15.4 Run `/show-spec-working` (D15: screenshots of `/` and an unknown path next to `images/pantalla-1-seleccion.svg`, the proxy with the API up and down; may reuse step 11 evidence); report `openspec/changes/web-foundation/reports/YYYY-MM-DD-show-spec-working.md`, screenshots next to it
- [ ] 15.5 Run `/verify-against-spec`; report `openspec/changes/web-foundation/reports/YYYY-MM-DD-verify-against-spec.md`
- [ ] 15.6 Run `/adversarial-review`; report `openspec/changes/web-foundation/reports/YYYY-MM-DD-adversarial-review.md`
- [ ] 15.7 Fix every finding in this change (behaviour changes via TDD) and give each one an A/B/C/D destination in `design.md` → Follow-ups; re-run the verification each fix invalidates and add an addendum to the affected report
- [ ] 15.8 Commit the fixes to the same pull request; re-run a check whose findings led to non-trivial fixes until it returns no Blocker or Major
- [ ] 15.9 `/opsx:archive`, and commit the archive to the same pull request; merge only after the archive commit and with CI green (autonomous-run ADR)
