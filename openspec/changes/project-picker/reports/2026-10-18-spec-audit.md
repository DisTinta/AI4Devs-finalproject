APPROVED

# Spec audit — project-picker (DIS-60)

- Date: 2026-10-18
- Auditor: the spec-auditor checklist (`ai-specs/agents/spec-auditor.md`, eleven points), executed by the
  step agent of the autonomous run (ADR `20261016-autonomous-workflow-run-entrega-2`). This step had no
  subagent tool, so the auditor's instructions were run in this context, read-only on the artifacts
  until the report was written; the corrections were then applied through `/opsx:update`.
- Verdict per run: run 1 CHANGES REQUIRED; run 2 APPROVED (no blocking finding; its three improvable
  findings were folded before the apply). Final verdict: APPROVED.

## Run 1

CHANGES REQUIRED

**Inputs read:** `proposal.md`, `design.md`, `specs/project-picker/spec.md`,
`specs/web-foundation/spec.md`, `tasks.md`; DIS-60 and its parent DIS-51 in Linear, with the two
comments of DIS-60 (the DIS-58 follow-up #5 note on `errorElement`, the DIS-92 note on the constant and
the coherence test; DIS-51 has none relevant); `docs/project-context.md`, `docs/frontend-standards.md`,
`docs/backend-standards.md`, `docs/openspec-tasks-mandatory-steps.md`; `openspec/specs/web-foundation/spec.md`,
`openspec/specs/seed-build/spec.md` ("Sample-project constant"); ADR
`20261016-autonomous-workflow-run-entrega-2` (branch `feature/DIS-101-readme-entrega-2`); code:
`packages/web/src/{router.tsx,router.test.tsx,main.tsx,index.css,theme.test.ts}`,
`packages/web/src/components/*`, `packages/web/src/pages/NotFoundPage.tsx`,
`packages/web/src/services/api-client.ts`, `packages/web/src/data/sample-projects.ts`,
`tests/a11y/smoke.a11y.test.tsx`, `tests/unit/seed/sample-projects-coherence.spec.ts`; wireframe
`images/pantalla-1-seleccion.svg`; archived `openspec/changes/archive/2026-10-18-web-foundation/design.md`.

### Questions for the author

None blocking. Every open point below is decided as lead engineer (autonomous-run ADR) and recorded in
the Enhanced description of DIS-60.

### 1. Scope against the ticket

Clean. Everything follows from the DIS-60 Enhanced description (D1–D14) or refines it: D15 (delta
shape forced by OpenSpec), D16 (Git in the requirements line, from readme §1.4), D17–D22 (how, not
what). The error screen is in scope by the inherited DIS-58 follow-up #5 comment. No widening to the
parent's whole story (no Screen 2, no services layer work). The «comprobando…» and «Reintentando…»
states added by finding F1 follow from `docs/frontend-standards.md` §2 and §5, not from new product
scope.

### 2. Inherited acceptance criteria (DIS-51)

All covered: cards with name, language/framework, the four counts, «indexado» and a keyboard link to
`/p/{id}` without HTTP ("Screen 1 shows the sample projects…", "The project link is reached and followed
with the keyboard"); API down with alert and retry ("An unavailable API…", the three retry scenarios);
coherence test ("The cards show the seed's figures", reusing the DIS-92 test, D10); axe with no
violations and every control named (the two accessibility scenarios plus the existing gate); component
test with `getByRole` and the non-interactive «+ Indexar…» text ("The indexing hint is text, not a
control"). No disagreement between parent and sub-issue (the parent's "retirar marcas *target*" and
`/impact` items were closed in DIS-58).

### 3. Missing scenarios

- **F3 (blocking).** "The page SHALL NOT retry on its own" has no scenario: no THEN counts the requests
  after the alert appears. Correction: "An unavailable API shows the alert and keeps the cards" asserts
  exactly one request per run; "A health check that never answers…" asserts that 60 000 ms after the
  alert the double still recorded one request.
- **F5 (improvable).** The icons hidden from assistive technology (requirement "How a project is
  written on its card") are not asserted anywhere. Correction: the cards scenario asserts that each
  icon of the card (🐘, 📁, 🔷, ↔, 📝, ✓, →) is inside an element hidden from assistive technology.

### 4. Ambiguity

Clean: no "fast", "easy", "secure", "efficient", "many", "appropriate" or "robust" in any artifact
(grep over the change).

### 5. Open decisions

- **F2 (blocking).** The colours of the «Reintentar» button and of the `make up` code inside the alert
  are not fixed, and only the pairs of the `web-foundation` theme table are allowed (a button in
  `accent` on `warning-soft`, for instance, is no listed pair). Correction: design D9/D24 fixes the
  button as the primary button (`bg-accent text-on-accent`, white on `#1971c2`, listed) and the code as
  inheriting `warning-ink` on `warning-soft` (listed).
- **F4 (improvable).** Where the focus goes when the *first* check succeeds is not stated (only the
  retry moves it). A test will pin it. Correction: the spec says the first check never moves the focus
  and "An available API adds the «listo» badge" asserts the focus stays on the document body.

### 6. Contradictions inside the change

- **F6 (improvable).** `proposal.md` → Impact says the test of the retired scenario is "replaced";
  design D12 and task 2.3 remove it and move its checks to `ProjectPickerPage.test.tsx`. Correction:
  the proposal says "removed; its checks move to …".
- **F9 (improvable).** Task 7.3 validates "The development server serves the three paths" in "10.4,
  14.4"; 14.4 is the adversarial review. Correction: "10.2–10.4, 14.2".
- **F11 (improvable).** `design.md` says D15–D22 were added to the Linear Enhanced description, but
  they were not yet. Correction: add D15–D25 to the Enhanced description now; task 12.4 only adds
  decisions taken during the apply.

### 7. Contradictions with the project

- **F1 (blocking).** `docs/frontend-standards.md` §2: "Loading and error states are explicit and
  rendered, never silent", and §5 lists the loading state in the DoD. The change renders nothing while
  the first health check is pending (up to 5 s) and nothing while a retry is pending. Correction: while
  the first check is pending each card shows the badge «comprobando…» in the place of «listo» (same
  slot, no layout shift; `text-ink-muted` on `bg-canvas`, a listed pair); while a retry is pending the
  alert's button reads «Reintentando…» (it keeps the focus, presses are ignored) and reads «Reintentar»
  again if the retry fails. Spec requirement and scenarios, design D6, D9, D17 (new D23) and tasks 2.1,
  3.1, 3.5, 3.6 updated.
- No contradiction with `openspec/specs/web-foundation/spec.md`: the delta replaces the route
  requirement (D15) and keeps the accessibility gate's requirement intact; the theme table is respected
  once F2 is fixed. No ADR bears on the change. `docs/project-context.md`'s rule on loaders is honoured
  (D8: no loader).

### 8. Contrast with the real code

- **F7 (improvable).** D19 says the real `fetch` rejects under jsdom because the URL is relative. Also
  true, but `docs/project-context.md` → Testing records the main reason: under jsdom the `AbortSignal`
  is jsdom's while `fetch` is Node's, and Node's `fetch` rejects it. Correction: D19 names both.
- **F8 (improvable).** `PageFrame`'s `main` is `text-center` (`packages/web/src/components/PageFrame.tsx:21`);
  the wireframe's card content is left-aligned. Correction: D3 gives the article `text-left`.
- **F10 (improvable).** `RouteErrorPage` would duplicate the link markup and classes of
  `packages/web/src/pages/NotFoundPage.tsx:13-19`. Correction: D11 allows the refactor step 8.1 to
  extract one shared link component used by both pages, without behaviour change and without test
  edits.
- Checked and clean: `routes[0].children` exists once the root route is added; a pathless route without
  `element` renders its `Outlet` in React Router 7; `getHealth` rejects with the caller's reason on its
  own abort (`api-client.ts`, `send`), so the hook can tell its own abort apart; a `503` in the error
  format is an `ApiError` and `{"status":"down"}` an `ApiUnavailableError`, both "unavailable" for the
  page (D8).

### 9. Task size

Clean. The largest tasks (2.2: card, page, minimal hook and route; 3.2: four runs and `ErrorBanner`)
fit one turn each.

### 10. Mandatory steps

Clean. Step 0 is the branch; "Review and Update Existing Tests", "Run Tests and Verify Data State" (with
report path and naming), "Manual Interface Testing" and "End-to-End Testing" (both "AGENT MUST
EXECUTE"), "Update Technical Documentation" and "Pre-merge Review" (last; the three checks in order,
fixes on the same PR, archive commit before merge) are present and labelled. The only mutating task
(10.1 `db:seed` if needed) has its restoration in 10.5.

### 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| Sample-project cards without HTTP | Screen 1 shows the sample projects without waiting for the API | 2.1, 2.2 |
| Sample-project cards without HTTP | The project link is reached and followed with the keyboard | 2.4 |
| How a project is written on its card | Language and framework labels | 1.1, 1.2 |
| How a project is written on its card | Counts in singular, in plural and with grouped digits | 1.3 |
| API status on Screen 1 | An available API adds the «listo» badge | 3.1 |
| API status on Screen 1 | An unavailable API shows the alert and keeps the cards | 3.2 |
| API status on Screen 1 | A health check that never answers shows the alert after its time limit | 3.3 |
| API status on Screen 1 | Retrying after the API comes back removes the alert | 3.4 |
| API status on Screen 1 | Pressing again while a retry is pending sends no request | 3.5 |
| API status on Screen 1 | A failed retry keeps the alert | 3.6 |
| API status on Screen 1 | Leaving Screen 1 cancels a pending check | 3.7 |
| Indexing a repository of one's own is a hint, not a control | The indexing hint is text, not a control | 4.1 |
| App error screen | A route that fails to render shows the app's error screen | 5.1, 5.2 |
| Accessibility of Screen 1 and of the error screen | Screen 1 has no axe violations with the API available or unavailable | 6.1, 6.2 |
| Accessibility of Screen 1 and of the error screen | The error screen has no axe violations | 6.1, 6.2 |
| Card figures are the seed's | The cards show the seed's figures | 7.4, 9.2 (by command) |
| (web-foundation) Routes and screens of the web client | A project path shows the Screen 2 placeholder with its id | existing test, kept (5.2, 7.2) |
| (web-foundation) Routes and screens of the web client | An unknown path shows the not-found screen and leads back | existing test, kept (5.2, 7.2) |
| (web-foundation) Routes and screens of the web client | The development server serves the three paths | 10.2–10.4, 14.2 (by hand; F9) |
| (web-foundation) Component test environment | Rendered output does not leak between tests | existing test, kept (7.2) |

No empty row.

### Corrections to apply

- `specs/project-picker/spec.md`: F1 (requirement "API status on Screen 1": «comprobando…» and
  «Reintentando…»; scenarios "Screen 1 shows…", "An available API…", "An unavailable API…", "Pressing
  again…", "A failed retry…"), F3 (request counts), F4 (first check keeps the focus), F5 (icons hidden).
- `design.md`: F1 (D6, D9, D17, new D23), F2 (D9, new D24), F4 (new D25), F7 (D19), F8 (D3), F10 (D11),
  F11 (decisions header).
- `tasks.md`: F1/F3/F4/F5 (2.1, 3.1, 3.2, 3.3, 3.5, 3.6), F9 (7.3), F11 (12.4), F10 (8.1).
- `proposal.md`: F6 (Impact), F1 (What Changes).
- Linear DIS-60, Enhanced description (Spanish, outside `[original]`): decisions D15–D25.

### Resolution of run 1

| # | Severity | Resolution |
|---|---|---|
| F1 | blocking | Applied: «comprobando…» badge during the first check, «Reintentando…» button during a retry (spec, design D6/D9/D17/D23, tasks 2.1, 3.1, 3.5, 3.6, proposal) |
| F2 | blocking | Applied: design D9 and D24 fix the button (`bg-accent text-on-accent rounded-button`, `focus-visible` outline) and the code colours (inherited `warning-ink` on `warning-soft`) |
| F3 | blocking | Applied: one request per run in "An unavailable API…"; one request 60 000 ms after the alert in "A health check that never answers…" (spec, tasks 3.2, 3.3) |
| F4 | improvable | Applied: the first check never moves the focus (spec requirement and "An available API…"; design D25; task 3.1) |
| F5 | improvable | Applied: icons asserted inside `aria-hidden` elements in the cards scenario (spec; task 2.1) |
| F6 | improvable | Applied: proposal Impact says "removed; its checks move to `ProjectPickerPage.test.tsx`" |
| F7 | improvable | Applied: D19 names both reasons |
| F8 | improvable | Applied: D3, `text-left` on the article |
| F9 | improvable | Applied: task 7.3 cites 10.2–10.4 and 14.2 |
| F10 | improvable | Applied: D11 and task 8.1 allow extracting a shared link component |
| F11 | improvable | Applied: D15–D25 added to the DIS-60 Enhanced description; task 12.4 reworded |

## Run 2

APPROVED

**Inputs read again:** the whole change after the run 1 corrections (commit `cda055a`): `proposal.md`,
`design.md` (D1–D25), both delta specs, `tasks.md`; DIS-60 in Linear with the new "Decisiones D15–D25"
section of the Enhanced description (outside `[original]`); `docs/frontend-standards.md` §2–§5 and the
`web-foundation` theme table again for the new badge and button colours.

### Questions for the author

None.

### The eleven points

1. **Scope** — clean. D23–D25 come from the project's frontend standards and the run 1 findings; no new
   product scope.
2. **Inherited acceptance criteria** — clean; unchanged coverage (run 1, point 2).
3. **Missing scenarios** — **G1 (improvable).** The cards scenario now asserts that ✓ and → are hidden
   from assistive technology, but no requirement says so (the requirement only names the language and
   count icons). Correction: the cards requirement states that ✓ and → are decorative and hidden.
4. **Ambiguity** — clean (grep repeated: none of the seven words).
5. **Open decisions** — clean. The «comprobando…» badge colour (`text-ink-muted` on `bg-canvas`,
   `#495057` on `#f8f9fa`), the button colours (white on `#1971c2`) and the code colours (`#5c3d00` on
   `#fff9db`) are all listed pairs of the theme table; the ellipsis code point (U+2026) and where the
   focus goes in every outcome are fixed.
6. **Contradictions inside the change** — **G2 (improvable).** "A health check that never answers…"
   now counts requests in its THEN, but its GIVEN described a double that only "never answers".
   Correction: the double "records every request and never answers".
7. **Contradictions with the project** — clean. F1 resolved the frontend-standards §2/§5 conflict; the
   new colours respect the theme table; no loader (project-context's `Request` workaround holds).
8. **Contrast with the real code** — clean. `getHealth` keeps one request per call (no internal retry,
   `api-client.ts` `send`), so the request counts of F3 are reachable; a label change on a focused
   `button` keeps the focus in React (same element, re-rendered text).
9. **Task size** — clean.
10. **Mandatory steps** — clean (unchanged since run 1). **G3 (improvable)**, found while checking the
    RED evidence of task 6.1: one of its two suggested probes (removing the list's `aria-label`) would
    not make axe fail (an unnamed `ul` is no violation), so it could not prove the test bites.
    Correction: keep only the probe that triggers `button-name`.
11. **Traceability** — the table of run 1 still holds; every scenario of both deltas has its task and
    no row is empty. The scenarios changed by run 1 map to the tasks updated with them (2.1, 3.1, 3.2,
    3.3, 3.5, 3.6).

### Resolution of run 2

| # | Severity | Resolution |
|---|---|---|
| G1 | improvable | Applied: cards requirement says ✓ and → are decorative and hidden from assistive technology |
| G2 | improvable | Applied: the time-limit scenario's double records every request |
| G3 | improvable | Applied: task 6.1 proves the a11y test with the `button-name` probe only |

No blocking finding remains: the apply may start.

## Addendum — spec edits of the pre-merge review (2026-10-18)

Edits made through `/opsx:update` (run inline in the autonomous run's pre-merge step) to fix findings of
task 14; agent's decisions D32–D33 in `design.md`. `npx openspec validate project-picker --strict` → valid
after the edits.

| Finding | Requirement / scenario | Edit |
|---|---|---|
| Adversarial 1 | "API status on Screen 1" (requirement text) | After a successful retry the focus moves to the level-1 heading "unless the person moved the focus to another element while the retry was pending: then the focus stays where the person put it" (D32) |
| Adversarial 1 | new scenario "A successful retry leaves the focus where the person moved it" | Retry pending on a double whose answer the test releases; Tab to «Explorar proyecto acme-shop»; release → one request, no alert, «listo», focus still on the link |
| Verify V2 / adversarial 2 | new scenario "A check the page cancels itself changes nothing on the screen" | The routes inside `StrictMode` with a never-answering double: two requests, the first aborted and the second not, «comprobando…» shown, no alert (D33) |
| Verify V1 / adversarial 3 | "An unavailable API shows the alert and keeps the cards" (THEN) | Adds "the focus is still on the document body" (the requirement already said so; the scenario now states it) |

Traceability: each new or edited scenario maps 1:1 to a test of the same name in
`packages/web/src/pages/ProjectPickerPage.test.tsx` (tasks 14.5.1–14.5.3). No requirement was removed and
no other scenario changed.
