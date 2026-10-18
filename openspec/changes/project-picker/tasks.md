## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 First action of the apply: confirm DIS-60 is In Progress in Linear (set it if not), with a short comment in Spanish naming the change `project-picker` and the branch `feature/DIS-60-project-picker`
- [x] 0.2 Feature branch `feature/DIS-60-project-picker` (`BRANCH_PREFIX=feature/`, `docs/project-context.md` → Branch and ticket conventions), created from `feature/entrega-2-CRN` before `/opsx:propose`; confirm `git merge-base --is-ancestor origin/feature/entrega-2-CRN HEAD` and that `openspec/changes/project-picker/` is on it. `git fetch`; if `origin/feature/entrega-2-CRN` moved, rebase before any code (never force-push a published branch)
- [x] 0.3 Verify the current branch (`git branch --show-current`) and `git status`; the local changes under `.claude/` are never staged
- [x] 0.4 Baseline for the step 9 report: run `npx vitest run` once, green, and record files, tests and duration; run `npm run build -w packages/web` and record the size of `packages/web/dist/assets/*`; record that the code tasks touch no database (step 10 captures its own state)

## 1. How a project is written (TDD, design D4, D5) — `project-picker` → "How a project is written on its card"

Every test of this change follows Arrange-Act-Assert with the three blocks commented (frontend-standards §4) and is named exactly as its scenario.

- [x] 1.1 RED: create `packages/web/src/components/project-display.test.ts` (Node environment) with "Language and framework labels" (the four pairs of the scenario → label and icon, `undefined` icon for `go`). See it fail (module missing)
- [x] 1.2 GREEN: `packages/web/src/components/project-display.ts` with `stackLabel(language, framework)`, `languageIcon(language)` and their label tables; TSDoc on every export; parameters typed as `string` and `string | null` (the constant's literal types are assignable)
- [x] 1.3 RED → GREEN: "Counts in singular, in plural and with grouped digits" (`formatCount(n, singular, plural)`; assert the U+00A0 separators by code point, e.g. `'1 840 aristas'`, never by a visually similar space; no `Intl`, D5)

## 2. Cards on Screen 1 (TDD, design D2, D3, D6, D7, D12, D20) — `project-picker` → "Sample-project cards without HTTP"

- [x] 2.1 RED: create `packages/web/src/pages/ProjectPickerPage.test.tsx` with "Screen 1 shows the sample projects without waiting for the API" (the real `routes` in `createMemoryRouter` at `/`; `vi.stubGlobal('fetch', …)` recording and never answering; `getByRole('list', { name: 'Proyectos de muestra' })`, `getAllByRole('article')`, `getByRole('article', { name: 'acme-shop' })`, `within(article)` for the `h2`, the label, the four count `listitem`s in order, «indexado» and `getByRole('link', { name: 'Explorar proyecto acme-shop' })` with `href` `/p/a794456d-6d1b-5b55-a360-13fec83dc7bc`; every icon (🐘 📁 🔷 ↔ 📝 ✓ →) inside an element with `aria-hidden="true"`; the badge «comprobando…» (U+2026); the main landmark's order h1 → subtitle → list; no `alert`, no «listo», no «Reintentar»; exactly one recorded request, `GET /health` — the URL argument and the method of its init). See it fail
- [x] 2.2 GREEN: `packages/web/src/components/ProjectCard.tsx` (props interface: one project of the constant, its position for the stripe, and the API status for the badge slot; D3, D4, D6, D7, D23, theme tokens only), `packages/web/src/pages/ProjectPickerPage.tsx` (`PageFrame`, `h1` with `tabIndex={-1}`, subtitle, the `ul` of cards) and the minimal `packages/web/src/pages/useApiHealth.ts` the test needs (one `getHealth({ signal })` on mount, aborted on unmount, D8); in `packages/web/src/router.tsx`, `/` → `ProjectPickerPage`. TSDoc on every export
- [x] 2.3 In `packages/web/src/router.test.tsx`, remove only the test "The root path shows the Screen 1 placeholder" (its scenario left the spec and moved to 2.1, design D12, D15); no other line of that file changes. Record the removal with its reason in the step 9 report
- [x] 2.4 RED → GREEN: "The project link is reached and followed with the keyboard" (`userEvent.setup()`, `user.tab()` until `document.activeElement` is the link — assert it got there by Tab —, then `user.keyboard('{Enter}')`; the Screen 2 placeholder `h1` and the id are rendered)

## 3. API status (TDD, design D8, D9, D17, D18) — `project-picker` → "API status on Screen 1"

- [x] 3.1 RED → GREEN: "An available API adds the «listo» badge" (`fetch` answering `new Response('{"status":"ok"}', { status: 200 })`; `findByText('listo')` inside the article; no «comprobando…», no `alert`, no «Reintentar»; `document.activeElement` is `document.body`, D25). Badge row per D6
- [x] 3.2 RED → GREEN: "An unavailable API shows the alert and keeps the cards" (the four runs of the scenario in one test, each with its own recording double, render and cleanup via `unmount()`; the alert's position checked with `compareDocumentPosition` against the subtitle and the list; no «listo» nor «comprobando…»; exactly one recorded request per run, after the alert is shown). Create `packages/web/src/components/ErrorBanner.tsx` (props interface; role `alert`, `warning-*` tokens, ⚠ `aria-hidden`, the text of the spec with `make up` in `<code>`, a `type="button"` «Reintentar» styled per D24 whose label is «Reintentando…» while a retry is pending; TSDoc)
- [x] 3.3 RED → GREEN: "A health check that never answers shows the alert after its time limit" (fake timers per D18: `vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })` before rendering, `await act(() => vi.advanceTimersByTimeAsync(4999))`, `queryByRole('alert')` null and «comprobando…» shown, then 1 ms more and `getByRole('alert')` with no «comprobando…», then 60 000 ms more and still one recorded request; the double rejects with its signal's reason on abort; `vi.useRealTimers()` in `afterEach`)
- [x] 3.4 RED → GREEN: "Retrying after the API comes back removes the alert" (first `fetch` rejects with a `TypeError`, await the alert; then a recording double answering `ok`; `user.click` «Reintentar»; exactly one recorded `GET /health`; alert and button gone; «listo» shown; `document.activeElement` is the `h1`). Implement `retry()` and the focus effect of D17
- [x] 3.5 RED → GREEN: "Pressing again while a retry is pending sends no request" (three `user.click`s on a never-answering double; one request; the alert is present; its button's name is «Reintentando…» and it is `document.activeElement`; the guard is a ref, D17)
- [x] 3.6 RED → GREEN: "A failed retry keeps the alert" (one more request; alert text unchanged; the button's name is «Reintentar» again and it keeps the focus; no «listo»)
- [x] 3.7 RED → GREEN: "Leaving Screen 1 cancels a pending check" (the double records each request's `init.signal`; `user.click` the project link; that signal is `aborted`; the Screen 2 `h1` is rendered; no `alert`)

## 4. Indexing hint (TDD, design D14, D16) — `project-picker` → "Indexing a repository of one's own is a hint, not a control"

- [x] 4.1 RED → GREEN: "The indexing hint is text, not a control" (texts after the list, by `compareDocumentPosition`; the command inside a `code` element; `queryAllByRole('link')` and `queryAllByRole('button')` have no name matching `/Indexar/`). Add the `hr` with `border-dashed`, the accent `p`, the `code` and the requirements line to `ProjectPickerPage`

## 5. App error screen (TDD, design D11, D21) — `project-picker` → "App error screen"; `web-foundation` → "Routes and screens of the web client"

- [x] 5.1 RED: create `packages/web/src/pages/RouteErrorPage.test.tsx` with "A route that fails to render shows the app's error screen" (a table `[{ ...routes[0], children: [...(routes[0].children ?? []), { path: '/test-only-boom', element: <Boom /> }] }]` where `Boom` throws `new Error('boom')`; memory router at `/test-only-boom`; `console.error` spied with an empty implementation for this test only and restored in `afterEach`, D21; banner, `h1` «Algo ha fallado», the line, the link to `/`, no text `boom`). See it fail (today `routes[0]` is the `/` route and React Router's default screen shows)
- [x] 5.2 GREEN: `packages/web/src/pages/RouteErrorPage.tsx` (`PageFrame`, `h1`, the line, the `NotFoundPage` link style; no `useRouteError()` output); `packages/web/src/router.tsx`: one pathless root route `{ errorElement: <RouteErrorPage />, children: [ '/', '/p/:projectId', '*' ] }`; update the TSDoc of `routes`. Run `npx vitest run packages/web/src/router.test.tsx`: the remaining route tests pass unchanged

## 6. Accessibility (TDD, design D13) — `project-picker` → "Accessibility of Screen 1 and of the error screen"

- [x] 6.1 RED → GREEN: create `tests/a11y/project-picker.a11y.test.tsx` with "Screen 1 has no axe violations with the API available or unavailable" (`lang="es"`, `document.title = 'CODEMIND'`; `fetch` answering `ok` → await «listo» → `axe.run(document)`; unmount; `fetch` rejecting → await the alert → `axe.run(document)`; both `violations` equal `[]`, failing rule ids printed on failure) and "The error screen has no axe violations" (the table of 5.1, `console.error` spied as in D21). Observe the first one fail once by giving the `ErrorBanner` button no text locally (axe rule `button-name`; not committed) and record it in the step 9 report
- [x] 6.2 `npm run test:a11y` runs both files and passes; `npm run typecheck` green (the `.tsx` is compiled by `tests/a11y/tsconfig.json`)

## 7. Review and Update Existing Tests (MANDATORY)

- [x] 7.1 Identify the tests affected: `grep -rn "PendingScreen\|Screen 1 placeholder\|routes\b" packages/web/src tests/a11y`, every type error of `npm run typecheck`, and the tests that render `/` without stubbing `fetch` (D19: "An unknown path shows the not-found screen and leads back", "Rendered output does not leak between tests", "The three routes have no axe violations")
- [x] 7.2 Edit no existing test except the removal of 2.3 (its scenario left the spec); confirm the three D19 tests pass unedited and record in the step 9 report any `act(...)` warning they print (not silenced). If one of them fails, the fix goes in the production code, never in the test
- [x] 7.3 Confirm each `#### Scenario:` of `specs/project-picker/spec.md` and `specs/web-foundation/spec.md` maps 1:1 to a test with exactly the same name (grep each title in `packages/web/src/` and `tests/`), except those validated by command or by hand: "The cards show the seed's figures" (7.4, 9.2) and "The development server serves the three paths" (10.2–10.4, 14.2)
- [x] 7.4 Confirm the coherence test `tests/unit/seed/sample-projects-coherence.spec.ts` is untouched (`git diff --stat` empty for it) and passes

## 8. Refactor

- [x] 8.1 With the suite green, refactor `packages/web/src/**` and `tests/a11y/project-picker.a11y.test.tsx` for naming and duplication only (no behaviour change, no test edits), including the shared link component of `NotFoundPage` and `RouteErrorPage` if it pays off (design D11); `npx vitest run packages/web tests/a11y tests/unit/web` stays green; `theme.test.ts` still passes (no `text-stripe*`, `#4dabf7` or `#74c0fc` outside `index.css`)

## 9. Run Tests and Verify Data State (MANDATORY)

- [x] 9.1 Capture the pre-test baseline: the 0.4 totals, duration and bundle size
- [x] 9.2 Run the targeted tests: `npx vitest run packages/web tests/a11y tests/unit/web tests/unit/seed/sample-projects-coherence.spec.ts` and `npm run test:a11y` (the coherence run is the evidence of "The cards show the seed's figures"; also check that `ProjectCard.tsx` and `ProjectPickerPage.tsx` take every id, name and count from `SAMPLE_PROJECTS`, with no literal copy of them)
- [x] 9.3 Run the required broader suite and gates: `npx vitest run` (duration against 0.4), `npx vitest run --exclude 'tests/integration/**'` (the `frontend.yml` step), `npm run lint`, `npm run typecheck`, `npm run lint:architecture` (the `no-orphans` warning of `sample-projects.ts` is gone), `npm run docs:coverage`, `npm run build -w packages/web` (bundle size against 0.4)
- [x] 9.4 Mutation testing: `packages/web/**` is not in Stryker's `mutate` and its tests are excluded (DIS-58 D25); no dependency or Vitest/Stryker config changes (D22). Record that `npm run test:mutation` is not affected and is left to the CI `mutation` job (its `business` filter matches `tests/**` only through the new a11y file, run there incrementally)
- [x] 9.5 Run `/privacy-ethics-check` over the diff (no personal data, no user input, no `dangerouslySetInnerHTML`, no `VITE_*` in `dist`; no new dependency, D22) and record the result
- [x] 9.6 Verify the post-test state: no database touched; no `.stryker-tmp/`; `packages/web/dist` not staged (gitignored); restore and document if not
- [x] 9.7 Create `openspec/changes/project-picker/reports/YYYY-MM-DD-9-test-and-state-verification.md` from the template of `docs/openspec-tasks-mandatory-steps.md` §6: baseline and after (totals, duration, bundle size), the removed test (2.3), the RED evidence (including 6.1), the D19 warnings if any, the mutation note (9.4) and the privacy check (9.5)
- [x] 9.8 Mark complete only after the tests pass and the report exists

## 10. Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [ ] 10.1 Preconditions: local Postgres up (`docker compose up -d`), `DATABASE_URL` exported, acme-shop stored (`npm run cli -- projects`; `npm run db:seed` only if it is missing, recorded). The screen only calls `GET /health`, which writes nothing; record `count(*)` of `query_log` so 10.5 can prove nothing changed
- [ ] 10.2 Start the API and the web as two separate processes (`npm -w packages/api run dev`, `npm -w packages/web run dev`; not the root `npm run dev`, which would stop Vite when 10.3 stops the API). With the browser-automation skill open `http://localhost:5173/`: the card, «indexado» and «listo», no alert, no console error; the network log shows `GET /health` (twice in `dev` because of `StrictMode`, D8) and no other API request; screenshot `reports/YYYY-MM-DD-10-api-up.png`
- [ ] 10.3 Stop only the API process; reload `/`: the alert appears between the subtitle and the card, the card has no «listo»; screenshot `…-10-api-down.png`. Start the API again, press «Reintentar» (keyboard: Tab to it, Enter): the alert disappears, «listo» appears, the focus is on the `h1`; screenshot `…-10-retry.png`
- [ ] 10.4 Keyboard and focus: from the top of `/`, Tab to «Explorar proyecto», check the focus outline is visible (screenshot `…-10-link-focused.png`), Enter → `/p/a794456d-6d1b-5b55-a360-13fec83dc7bc`; open `/no-existe` and confirm the not-found screen (route table unchanged for it)
- [ ] 10.5 Restore the state: stop both processes; re-check `count(*)` of `query_log` equals 10.1; remove what `db:seed` added in 10.1 if it ran
- [ ] 10.6 Document every command, observation and screenshot in `openspec/changes/project-picker/reports/YYYY-MM-DD-10-manual-interface-testing.md` (screenshots next to it; OS user name masked in paths)

## 11. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 11.1 There is no Playwright suite yet (DIS-75): the browser runs of 10.2–10.4 are the end-to-end evidence of the workflow "open Screen 1 → see the API status → retry → enter a project with the keyboard"; record "covered by steps 10.2–10.4; no Playwright suite in this change" in the step 10 report

## 12. Update Technical Documentation (MANDATORY)

- [ ] 12.1 `docs/project-context.md`: the web section (Screen 1 on `/` from `SAMPLE_PROJECTS`, the health check in an effect and not a loader — so the `Request` workaround of `jsdom-setup.ts` still holds —, the root route's `errorElement`, and that a test rendering `/` should stub `fetch`, D19)
- [ ] 12.2 `docs/DEMO.md`: replace the note "The web has no screens yet" with what Screen 1 shows (with the API up and down); `docs/frontend-standards.md` only if a rule changed (record "no change" otherwise)
- [ ] 12.3 Run `/update-docs` and confirm the docs gate passes. Add the relevant AI prompts of this change to `prompts.md` per `docs/project-context.md` → prompts.md rules, with its Índice entry in the same edit
- [ ] 12.4 The `[enhanced]` description of DIS-60 in Linear already holds D15–D25 (added while resolving the spec audit); add there, in Spanish and never inside `[original]`, every decision taken during the apply (design "taken while implementing")

## 13. Pull request

- [ ] 13.1 Prepare the PR description (`/pr-describe`, in Spanish) against `feature/entrega-2-CRN`, with the Why marked as the agent's decision (DIS-60 `[enhanced]` D1–D14 and design D15–D22), the wireframe deviations (D3, D4, D9, D14, D16) and the bundle size before and after
- [ ] 13.2 Commit by explicit paths only (nothing under `.claude/`), English messages ending with the co-author line; push with `git -c credential.helper='!gh auth git-credential' push` on the DisTinta account (autonomous run: it stays active)
- [ ] 13.3 Open the pull request against `feature/entrega-2-CRN` (title and body in Spanish); set DIS-60 to In Review in Linear with a Spanish comment linking the PR and the change
- [ ] 13.4 Confirm the PR's CI is green (`quality`, `Frontend` with `test:a11y` running the new file, `secrets`, `verify`); link the run in an addendum to the step 9 report

## 14. Pre-merge Review (MANDATORY - AGENT MUST EXECUTE)

- [ ] 14.1 Precondition: the pull request of 13.3 is open
- [ ] 14.2 Run `/show-spec-working`: screenshots of the running `/` (API up and API down) next to `images/pantalla-1-seleccion.svg` rendered as an image, and of the error screen if reachable by hand; may reuse step 10 evidence. Report `openspec/changes/project-picker/reports/YYYY-MM-DD-show-spec-working.md`, screenshots next to it
- [ ] 14.3 Run `/verify-against-spec`; report `openspec/changes/project-picker/reports/YYYY-MM-DD-verify-against-spec.md`
- [ ] 14.4 Run `/adversarial-review`; report `openspec/changes/project-picker/reports/YYYY-MM-DD-adversarial-review.md`
- [ ] 14.5 Fix every finding in this change (behaviour changes via TDD) and give each one an A/B/C/D destination in `design.md` → Follow-ups; re-run the verification each fix invalidates and add an addendum to the affected report
- [ ] 14.6 Commit the fixes to the same pull request; re-run a check whose findings led to non-trivial fixes until it returns no Blocker or Major
- [ ] 14.7 `/opsx:archive`, and commit the archive to the same pull request (no test-file edits in that commit); merge only after the archive commit and with CI green (autonomous-run ADR)
