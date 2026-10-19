# Test and State Verification Report

- Date: 2026-10-19
- Change: ask-page-states (DIS-66)
- Step: 11 — Run Tests and Verify Data State (with 10 — Review and Update Existing Tests)

Run by the agent in the autonomous run of Entrega 2 (ADR `20261016-autonomous-workflow-run-entrega-2`),
Windows 11, Node v24, branch `feature/DIS-66-usage-panel-states`. The TDD triad (test writer → implementer
→ refactorer) ran inline with the same contract: this step could not start the TDD subagents.

## Commands executed

- `npx vitest run` (0.4 baseline at `55d908f`, and again at the end)
- `npm run build -w packages/web` (0.4 baseline, and again at the end)
- `npx vitest run <file>` per scenario, RED then GREEN (sections 1–9 of `tasks.md`)
- `npx vitest run packages/web tests/a11y` and `npm run test:a11y` (11.2)
- `npx vitest run --exclude 'tests/integration/**'`, `npm run lint`, `npm run typecheck`,
  `npm run lint:architecture`, `npm run docs:coverage` (11.3)
- `npx stryker run <temporary config>`: a targeted, local-only mutation run over the ten new or changed
  web files, then a second run over `notice-display.ts` and `useAsk.ts` after the fixes below (11.4; the
  config files were moved to the session scratchpad afterwards and are not committed)
- `/privacy-ethics-check` over `git diff origin/feature/entrega-2-CRN...HEAD` (11.5)
- `grep -rn "AskFallbackNotice\|Sin respuesta verificada (motivo\|queryByRole('status')\|Confianza"
  packages/web/src tests`, `git diff --stat origin/feature/entrega-2-CRN -- <guarded tests>` (10.1), and a
  grep of each `#### Scenario:` title of the main and delta `ask-page` specs in `packages/web/src` and
  `tests` (10.2)

## Test results

| | Baseline (0.4, `55d908f`) | After |
|---|---|---|
| Test files (`npx vitest run`) | 151 (131 passed, 20 skipped) | 153 (133 passed, 20 skipped) |
| Tests | 1 667 (1 394 passed, 221 skipped) | 1 688 (1 415 passed, 221 skipped) |
| Duration (Vitest) | 73.29 s | 74.35 s (final run; 84.07 s on a run before the 11.4 test, with the machine loaded) |
| `npx vitest run --exclude 'tests/integration/**'` | — | 121 files, 1 323 passed |
| `npm run test:a11y` | 3 files, 5 tests | 3 files, 5 tests passed (gate and Screen 1 file unedited; Screen 2 file scans 10 states) |
| `index-*.js` | 252.97 kB (gzip 82.47 kB) | 258.84 kB (gzip 84.44 kB) |
| `index-*.css` | 11.98 kB (gzip 3.37 kB) | 12.81 kB (gzip 3.52 kB) |

- +2 test files (`usage-display.test.ts`, `notice-display.test.ts`); +24 new tests (5 + 3 Node, 16 RTL),
  −3 deleted tests (3.1): +21 net, with the calendar test of 11.4.
- Targeted (11.2): `packages/web` + `tests/a11y`, 84 tests passed (85 with the 11.4 test).
- `npm run lint`, `npm run typecheck` (including `tests/a11y/tsconfig.json`) and `npm run docs:coverage`:
  clean (the web is not a TypeDoc entry point; every new export has TSDoc anyway).
- `npm run lint:architecture`: 0 errors, the same 3 `no-orphans` warnings as before the change (the
  gitignored `packages/web/dist` bundle of a local build and `packages/analyzers/typescript`); none from
  the new files. `AskFallbackNotice.tsx` was deleted with its import (6.6), so it does not become an orphan.
- Bundle: +5.9 kB raw / +2.0 kB gzip of JavaScript and +0.8 kB of CSS for the panel, the three states and
  the alert (no dependency added).

### Existing tests changed (specified changes, D24)

- **Deleted (3.1):** `packages/web/src/pages/AskPage.test.tsx` → the `describe('Provisional notice for
  what is not an answer')` block: "An UNKNOWN shows the provisional status", "An API error shows the
  provisional alert with its code", "An unavailable API shows the provisional alert", with the constants
  only they used (`UNKNOWN_NOTICE`, `FAILED`, `UNAVAILABLE`, `BUDGET_EXHAUSTED`). Their requirement is
  REMOVED by the delta; their behaviour is now covered by "An UNKNOWN without anchors explains that there
  is no evidence", "An exhausted budget says the cached questions still answer" and "An unavailable API
  says so". `FAILED` is declared again, further down, for the new error tests.
- **One assertion changed (3.2):** "Screen 2 opens on a sample project without any request":
  `queryByRole('status')` null → the only `status` element's text is `''`. RED: `Unable to find an
  accessible element with the role "status"`.
- **One assertion changed, two removed (3.2, 4.3):** "An answered question shows the answer, its
  statements and its evidence": `queryByRole('status')` null → the only `status` element holds
  «Respuesta recibida.» (RED: `Unable to find an accessible element with the role "status"`); after the
  usage panel's GREEN it failed on `expected '←acme-shop… Confianza 0.71…' not to contain '0.71'` (its
  RED), and the two assertions `not.toContain('0.71')` and `not.toContain('Confianza')` were removed.
- **Waits changed and states added (5.3, 9.2):** `tests/a11y/ask-page.a11y.test.tsx` → "Screen 2 has no
  axe violations in any of its states". RED of 5.3: `Unable to find an element with the text: Sin
  respuesta verificada (motivo: no-anchor).`; the pending wait became `findByText('Buscando evidencia…',
  { selector: '[aria-hidden="true"]' })` (D36) and the `UNKNOWN` wait the heading «Sin respuesta
  verificada». 9.2 added the wait for the region «Uso» and five states (cache hit, `llm-required`,
  `RATE_LIMITED`, `LLM_UNAVAILABLE`, `TypeError`); RED in design D35 (below).
- **Untouched and green (10.1):** `tests/a11y/smoke.a11y.test.tsx`, `tests/a11y/project-picker.a11y.test.tsx`,
  `packages/web/src/theme.test.ts`, `project-display.test.ts`, `answer-display.test.ts`,
  `api-client.test.ts`, `tests/unit/web/api-contract.spec.ts`, `tests/unit/seed/*` (`git diff --stat`
  empty). The only other `queryByRole('status')` left is in "A new question replaces what was shown",
  unchanged and green (it reads «Buscando evidencia…» from the region).

### Scenario ↔ test traceability (10.2)

All 52 `#### Scenario:` titles of the main and delta `ask-page` specs map to exactly one test with the same
name, except the three removed provisional scenarios and the three manual ones ("Statement colours follow
the wireframe", "The focus is visible on every control", "The usage panel and the states follow the
wireframe"; step 12 report). One extra Node test, "A reset time is read only from a whole ISO date-time
that exists on the calendar", pins the «denotes a real instant» clause of the requirement "How usage
figures and notice details are written" (design D34; added in 11.4).

### RED evidence

- 1.1 and 2.1 module missing; 1.3–1.6 and 2.3 `<writer> is not a function`.
- 3.3 `expected [ Text{ …(1) } ] to have a length of 2 but got 1`.
- 4.1 `Unable to find role="region" and name "Uso"`. 4.4 and 4.5 passed on their first run (4.2 built
  them); negative controls: the ✓ without `aria-hidden` (`expected null not to be null`) and
  `savingsBadge` with `rounded !== 0` («ahorro -24.9 % vs bruto» shown).
- 5.1 `Unable to find role="heading" and name "Sin respuesta verificada"`; 5.5 `… "Hace falta un modelo
  de lenguaje"`. 5.4, 5.6 and 5.7 passed on their first run; negative controls: the `no-evidence` entry
  removed from the table, `hasSuggestions || true` (`expected <p class="mt-1"></p> to be null`), and the
  message through `dangerouslySetInnerHTML` (`Unable to find an element with the text: Mensaje de la API:
  <img src=x onerror=alert(1)>`).
- 6.1 the provisional alert had two lines (`expected [ { lines: [ …(2) ] … } ] to deeply equal …`). 6.3,
  6.4 and 6.5 passed after 6.2; negative controls: the `RATE_LIMITED` case renamed, the
  `SOURCE_UNAVAILABLE` case renamed, and a code line appended to the unavailable API (three lines instead
  of two).
- 7.1 passed on its first run; negative control: the status `p` keyed by `state.status` (a new element
  per state) → `expected [ '', '', '', '', '', '' ] to deeply equal [ '', 'Respuesta recibida.', … ]`.
- 8.1 `expected <p id=":r1:" role="alert" …> not to be <p id=":r1:" role="alert" …>` (same node).
- 9.1 passed on its first run; negative control: `tabIndex={0}` on the usage section adds a stop.
- 9.2: a non-theme light grey (class and inline style) did **not** fail axe: jsdom computes no styles,
  so `color-contrast` is incomplete, never a violation (design D35). The new `llm-required` scan was seen
  failing with `role="list"` on a paragraph of the notice → `aria-required-children`. 9.3 negative
  control: see the step 12 report.

All negative controls were local edits, reverted before any commit (checked with `git status`).

### Mutation testing (11.4)

`packages/web/**` is not in Stryker's `mutate` list and `vitest.stryker.config.ts` excludes the web and a11y
tests (DIS-58 design D25); this change edits neither, so `npm run test:mutation` and the CI `mutation` job
behave as before (its `business` filter runs it, through `tests/**`, for the changed a11y file).

To meet the workflow's "targeted mutation ≥ 80" a local-only run mutated the ten new or changed web files
with `usage-display.test.ts`, `notice-display.test.ts`, `project-display.test.ts` and `AskPage.test.tsx`
(`incremental: false`, temporary configs in the scratchpad):

| File | First run | After the fixes |
|---|---|---|
| `AskErrorNotice.tsx`, `LlmRequiredNotice.tsx`, `UnknownState.tsx`, `QueryBox.tsx`, `project-display.ts` | 100 % | — |
| `usage-display.ts` | 95.74 % | — |
| `AskPage.tsx` | 92.63 % | — |
| `notice-display.ts` | 83.67 % (24 survived) | **93.88 %** (9 survived) |
| `useAsk.ts` | 78.26 % | 78.05 % (one equivalent mutant removed with its code) |
| `UsagePanel.tsx` | 33.33 % (4 class-name mutants of 6) | — |
| **All files** | **88.16 %** (350 killed, 46 survived, 1 no coverage) | **92.09 %** (361 killed, 30 survived, 1 no coverage, recomputed with the second run) |

Fixes from the first run (commit `test(DIS-66): pin the calendar check of the reset time`):

- The calendar check of `resetTimeOf` (design D34) and the `^`/`$` anchors and optional seconds of its
  pattern survived: the scenario only reaches them through «2026-13-45». A Node test now pins
  «2026-10-20T00:00Z», 1 January and 31 December 23:59 (written) and 30 February, `T24:00`, month 00 and a
  leading or trailing character (not read).
- `useAsk`'s `message === undefined ? … : …` was equivalent (an absent `message` is `undefined` either way):
  simplified to one object.

Survivors left, by kind:

- **Class names (6):** the Tailwind classes of the badges and the empty `MUTED_BADGE`; jsdom computes no
  styles, the colours are checked in the browser (step 12 report, colour table).
- **Equivalent at the screen (≈14):** the remaining `isCalendarDate` conjunct swaps (`Date.parse` already
  rejects a month above 12 or below 1, and the day check alone catches the rest); `typeof value ===
  'string'`/`'number'` before a check that already rejects anything else; `costUsd > 0` (0 returns
  earlier, a negative cost never arrives); `kind: 'api'` (the alert only tells `unavailable` apart); the
  `case 'idle'`/`'failed'` labels of `announcementOf` (both return `''`); `count + 1` → `count - 1` (any
  change of the key remounts); the placeholder and «arista» strings of the project heading (DIS-65).
- **Guards the tests cannot reach (≈9, DIS-65's):** the hook's own-abort check, its pending ref (the page
  already ignores sends while pending), the initial `{ status: 'idle' }`, the effect and callback
  dependency lists.

### Privacy / ethics check (11.5)

Verdict **PASS**. No new request and no new data: the page still sends only `{ question }` to the
same-origin API. The API's `message`, `code` and `details` are rendered as React text (`dangerouslySetInnerHTML`
appears nowhere in `packages/web/src`); `retryAfterSeconds` and `resetsAt` are shown only with the
expected type and form; nothing is stored in the browser; no `VITE_*` in `dist`; no dependency or
lockfile change (D16). Fixtures are synthetic (no e-mails, tokens or real people); the diff greps for
e-mail shapes, `Authorization`, `Bearer`, secret words and `console.*` found only numeric test data and
the `fetch` doubles. Not assessed: none.

## Data state verification

- Pre-test baseline: the unit, component and a11y tests touch no database; no `.stryker-tmp/`.
- Post-test validation: no database touched by those tests; no `.stryker-tmp/` left by the targeted runs;
  `packages/web/dist` is gitignored and not staged; the temporary Stryker and Vitest configs were moved to
  the session scratchpad.
- State restored: Yes (nothing to restore for this step; the manual test's database restore is in the step
  12 report).
- Restoration actions: none.

## UI evidence

None for this step (see `2026-10-19-12-manual-interface-testing.md`).

## Outcome

- Status: PASS
- Blocking issues: none.

## Addendum — CI run (2026-10-19, PR #57)

Pull request [DisTinta/AI4Devs-finalproject#57](https://github.com/DisTinta/AI4Devs-finalproject/pull/57)
(`feature/DIS-66-usage-panel-states` → `feature/entrega-2-CRN`), run
[39241245016](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/39241245016) and
[39241245071](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/39241245071).

- `scope`, `secrets`, `verify`, `quality`, `mutation`, `frontend` (with `test:a11y`): all green on the
  first attempt. No fix attempt was needed.
- Final state: all checks green — `scope`, `secrets`, `verify`, `quality`, `mutation`, `frontend`.
