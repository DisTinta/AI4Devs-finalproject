# Test and State Verification Report

- Date: 2026-10-18
- Change: project-picker (DIS-60)
- Step: 9 — Run tests and verify data state (tasks 0.4, 9.1–9.8)

## Commands executed

- `npx vitest run` (baseline 0.4, before any code; and again after the change)
- `npm run build -w packages/web` (baseline 0.4 and after)
- `npx vitest run packages/web tests/a11y tests/unit/web tests/unit/seed/sample-projects-coherence.spec.ts`
- `npm run test:a11y`
- `npx vitest run --exclude 'tests/integration/**'` (the `frontend.yml` step)
- `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- A one-off targeted Stryker run over the new web files (configuration kept outside the repository, see
  "Mutation testing")
- `git diff --stat origin/feature/entrega-2-CRN -- tests/unit/seed/sample-projects-coherence.spec.ts`
- `/privacy-ethics-check` over the diff

## Test results

| | Baseline (0.4, `HEAD` = `63b96cd`) | After (`1f7cddb`) |
|---|---|---|
| `npx vitest run` — files | 143 (123 passed, 20 skipped) | 147 (127 passed, 20 skipped) |
| `npx vitest run` — tests | 1 626 (1 353 passed, 221 skipped) | 1 640 (1 367 passed, 221 skipped) |
| `npx vitest run` — duration | 69.94 s | 68.90 s |
| `vite build` — JS | 236.70 kB (gzip 77.35 kB) | 244.48 kB (gzip 80.07 kB) |
| `vite build` — CSS | 7.54 kB (gzip 2.37 kB) | 10.53 kB (gzip 3.06 kB) |
| `vite build` — `index.html` | 0.39 kB | 0.39 kB |

- Targeted tests: 11 files, 41 tests passed, 0 failed, 0 skipped (5.0 s). `npm run test:a11y`: 2 files, 4
  tests passed.
- Required suite: 0 failed. The skipped ones are the integration specs gated on `DATABASE_URL` and the Git
  maintenance-version cases, as in the baseline. `npx vitest run --exclude 'tests/integration/**'`: 115
  files, 1 276 tests passed.
- New tests (+15): `project-display.test.ts` 2, `ProjectPickerPage.test.tsx` 10, `RouteErrorPage.test.tsx`
  1, `tests/a11y/project-picker.a11y.test.tsx` 2. Removed test (−1): see below. Net +14, matching the
  totals.
- Gates: `lint` clean; `typecheck` clean (the a11y `.tsx` compiled by `tests/a11y/tsconfig.json`);
  `docs:coverage` clean (every new export has TSDoc); `lint:architecture` 0 errors, and the `no-orphans`
  warning of `packages/web/src/data/sample-projects.ts` is gone (the page imports the constant). The three
  warnings left are not of this change: `packages/analyzers/typescript/{src,dist}/index.*` (existing) and
  a local `packages/web/dist/assets/*.js` produced by the baseline build (gitignored, not in CI).
- Bundle: +7.8 kB JS (+2.7 kB gzip) and +3.0 kB CSS (+0.7 kB gzip) for the page, the card, the alert, the
  error screen and their Tailwind classes. No dependency added.

### Removed test (task 2.3)

`packages/web/src/router.test.tsx` → "The root path shows the Screen 1 placeholder" was removed, and no
other line of that file changed. Its scenario left the spec (delta of `web-foundation`, REMOVED + ADDED,
design D12, D15) and its checks moved to `project-picker` → "Screen 1 shows the sample projects without
waiting for the API". After task 2.2 it failed as expected (the main landmark now held the card instead of
«Esta pantalla está en construcción.»): a specified behaviour change, not a fix to make the suite green.

### RED evidence (TDD per scenario)

The TDD subagents (`tdd-test-writer`, `tdd-implementer`, `tdd-refactorer`) cannot be started from this
unattended step (no Task tool in it), so each phase was run inline with the same contract: one failing
test, the minimum code, then the refactor with the suite green.

| Task | Scenario | Failure observed before the code |
|---|---|---|
| 1.1 | Language and framework labels | `Failed to load url ./project-display` (module missing) |
| 1.3 | Counts in singular, in plural and with grouped digits | `formatCount is not a function` |
| 2.1 | Screen 1 shows the sample projects without waiting for the API | `Unable to find an element with the text: Repositorios precargados · sin registro · sin instalación` (placeholder on `/`) |
| 3.1 | An available API adds the «listo» badge | `Unable to find an element with the text: listo` |
| 3.2 | An unavailable API shows the alert and keeps the cards | `Unable to find role="alert"` |
| 3.4 | Retrying after the API comes back removes the alert | `Unable to find an element with the text: listo` (retry was a no-op) |
| 4.1 | The indexing hint is text, not a control | `Unable to find an element with the text: + Indexar mi propio repositorio` |
| 5.1 | A route that fails to render shows the app's error screen | `expected 'Elige un proyecto para explorar' to be 'Algo ha fallado'` (`routes[0]` was the `/` route) |

Tests that passed as soon as they were written, because the code of an earlier task already held the
behaviour, were shown to fail with a temporary change of the production code, reverted at once and never
committed:

| Task | Scenario | Temporary change | Failure |
|---|---|---|---|
| 2.4 | The project link is reached and followed with the keyboard | `tabIndex={-1}` on the card link | `expected false to be true` (focus never reached the link) |
| 3.3 | A health check that never answers shows the alert after its time limit | `timeoutMs: 10_000` in `useApiHealth` | `expected { alert: false, checking: true } to deeply equal { alert: true, checking: false }` |
| 3.5 | Pressing again while a retry is pending sends no request | retry guard removed | `expected [ …(3) ] to have a length of 1 but got 3` |
| 3.6 | A failed retry keeps the alert | `retrying` kept `true` after a failure | `Unable to find an accessible element with the role "button" and name "Reintentar"` |
| 3.7 | Leaving Screen 1 cancels a pending check | no abort in the effect cleanup | `expected false to be true` (`signal.aborted`) |
| 6.1 | Screen 1 has no axe violations with the API available or unavailable | text of the `ErrorBanner` button removed | `withApiUnavailable: + "button-name: Buttons must have discernible text"` |

### Existing tests that render `/` without stubbing `fetch` (design D19, tasks 7.1–7.2)

"An unknown path shows the not-found screen and leads back", "Rendered output does not leak between tests"
and "The three routes have no axe violations" pass unedited. They print no `act(...)` warning. Scanning
Screen 1, axe prints `Error: Not implemented: HTMLCanvasElement.prototype.getContext (without installing the
canvas npm package)` to stderr (three times in `smoke.a11y.test.tsx`, twice in
`project-picker.a11y.test.tsx`): the card's emoji make axe probe an icon ligature with a canvas, which jsdom
lacks. axe carries on and reports zero violations; the noise is recorded, not silenced (no new dependency,
D22, and no change to `jsdom-setup.ts`, design non-goal).

### Scenario ↔ test mapping (task 7.3)

Every `#### Scenario:` of `specs/project-picker/spec.md` and `specs/web-foundation/spec.md` is the exact
name of one test, except "The cards show the seed's figures" (validated by the coherence command below and
by the first Screen 1 scenario) and "The development server serves the three paths" (manual, step 10).
The error-screen test is written with double quotes so its name, which holds an apostrophe, is greppable
verbatim.

### Constant ↔ seed (tasks 7.4, 9.2)

`tests/unit/seed/sample-projects-coherence.spec.ts` is untouched (`git diff --stat` empty) and passes: it is
the evidence of "The cards show the seed's figures". `ProjectCard.tsx` and `ProjectPickerPage.tsx` hold no
id, name or count: `grep -nE "53|121|170|32|a794456d|acme-shop"` over both files finds nothing; every figure
comes from `SAMPLE_PROJECTS`.

### Mutation testing (task 9.4)

`packages/web/**` is not in Stryker's `mutate` and its tests are excluded from `vitest.stryker.config.ts`
(DIS-58 D25); this change touches neither file nor any dependency (D22). `npm run test:mutation` is not
affected and stays with the CI `mutation` job.

The autonomous run asks for a targeted mutation score of at least 80, so a one-off run was made with a
configuration outside the repository (`mutate`: the eight new or changed web files; tests: the web and
a11y tests; `incremental: false`, so the local incremental file was not touched). Result: **84.46 %**
(125 killed, 20 survived, 3 without coverage), above the break threshold of 80. Per file:
`project-display.ts`, `ErrorBanner.tsx`, `RouteErrorPage.tsx`, `BackToPickerLink.tsx` 100 %;
`ProjectPickerPage.tsx` 90 %; `useApiHealth.ts` 77.78 %; `router.tsx` 75 %; `ProjectCard.tsx` 71.43 %.
The survivors are not observable through the specified behaviour:

- `ProjectCard.tsx`: the singular nouns (the constant has no count of 1; the singular is covered by
  `formatCount`'s own scenario), the top stripe's colour (decoration, `aria-hidden`, not queried by role),
  and the branch for a language without icon (the constant only holds PHP).
- `useApiHealth.ts`: the initial `retrying` value and the dependency arrays (equivalent: the state is
  overwritten before any reader sees it), and the "ignore an aborted check" guard. That guard only shows
  under `StrictMode`'s double mount in development (the first, aborted check would flash the alert); the
  tests mount without `StrictMode`, so the manual run of step 10 is its evidence.
- `ProjectPickerPage.tsx`: `status === 'available'` → `true` in the focus effect (equivalent: the effect runs
  only when the status changes, and after a retry it only changes to `available`) and the optional chaining
  on the heading ref.
- `router.tsx`: the path `'/'` → `''` (equivalent for a top-level child) and the uncovered
  `createAppRouter` / Screen 2 default id (the browser entry point, covered in step 10).

No `.stryker-tmp/` was left behind; the temporary configuration was moved out of the working tree.

### Privacy / ethics check (task 9.5)

`/privacy-ethics-check` over `git diff origin/feature/entrega-2-CRN..HEAD`: **PASS**. The page renders only
the versioned constant (synthetic sample project, no personal data), has no user input, no
`dangerouslySetInnerHTML`, no storage, no logging; the only request is the existing same-origin
`GET /health`. No e-mail, token, `Authorization` header or `VITE_*` variable in the diff or in
`packages/web/dist`. No dependency added (no install ran; the dependency vetting of the autonomous run does
not apply). The error screen never shows the error's message or stack.

## Data state verification

- Pre-test baseline:
  - Database: the code tasks touch none (no Postgres call in the web tests; the integration specs skip
    without `DATABASE_URL`, as in the baseline). Step 10 captures its own `query_log` count.
  - Working tree: only the author's local edits under `.claude/` (never staged).
- Post-test validation:
  - No `.stryker-tmp/` directory; `reports/stryker-incremental.json` not touched (`incremental: false`).
  - `packages/web/dist` rebuilt by `npm run build -w packages/web`; gitignored, not staged.
  - `git status`: only the `.claude/` edits besides the committed change.
- State restored: Yes (nothing to restore).
- Restoration actions: the one-off Stryker configuration files were moved to the session scratchpad.

## UI evidence (if applicable)

- None in this step; the browser screenshots belong to the manual interface test (step 10).

## Outcome

- Status: PASS
- Blocking issues: none

## Addendum — pre-merge review fixes (2026-10-18, task 14.5)

- Two new tests in `packages/web/src/pages/ProjectPickerPage.test.tsx` ("A successful retry leaves the focus
  where the person moved it", RED then GREEN; "A check the page cancels itself changes nothing on the
  screen", proven by removing the abort guard) and one assertion added to "An unavailable API shows the
  alert and keeps the cards" (its scenario's THEN now names the focus), all from spec edits recorded in
  the spec-audit addendum. No existing test of an earlier change was edited.
- The mutation survivor "ignore an aborted check" of `useApiHealth.ts` (listed above as observable only
  under `StrictMode`) is now killed by the `StrictMode` test (design D33).
- `npx vitest run`: 147 files (127 passed, 20 skipped), 1 642 tests (1 369 passed, 221 skipped), 69.97 s.
  Targeted run: 11 files, 43 tests passed. `npm run test:a11y`: 2 files, 4 tests passed. `lint`,
  `typecheck`, `docs:coverage` clean; `lint:architecture` 0 errors (the same three warnings).
