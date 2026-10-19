# Test and State Verification Report

- Date: 2026-10-19
- Change: ask-page (DIS-65)
- Step: 11 — Run Tests and Verify Data State (with 10 — Review and Update Existing Tests)

Run by the agent in the autonomous run of Entrega 2 (ADR `20261016-autonomous-workflow-run-entrega-2`),
Windows 11, Node v24, branch `feature/DIS-65-ask-page`. The TDD triad (test writer → implementer →
refactorer) ran inline with the same contract: this step could not start the TDD subagents.

## Commands executed

- `npx vitest run` (0.4 baseline at `fd3d5ae`, and again at the end)
- `npm run build -w packages/web` (0.4 baseline, and again at the end)
- `npx vitest run <file>` per scenario, RED then GREEN (sections 1–9 of `tasks.md`)
- `npx vitest run packages/web tests/a11y tests/unit/web tests/unit/seed` and `npm run test:a11y` (11.2)
- `npx vitest run --exclude 'tests/integration/**'`, `npm run lint`, `npm run typecheck`,
  `npm run lint:architecture`, `npm run docs:coverage` (11.3)
- `npx stryker run <scratchpad config>`: a targeted, local-only mutation run over the new web files (11.4;
  the config files were moved to the session scratchpad afterwards and are not committed)
- `/privacy-ethics-check` over `git diff origin/feature/entrega-2-CRN...HEAD` (11.5)
- `grep -rn "PendingScreen\|Consulta del proyecto\|Screen 2" packages/web/src tests`, `git diff --stat
  origin/feature/entrega-2-CRN -- <guarded tests>` (10.1), and a grep of each `#### Scenario:` title in
  `packages/web/src` and `tests` (10.2)

## Test results

| | Baseline (0.4, `fd3d5ae`) | After |
|---|---|---|
| Test files (`npx vitest run`) | 147 (127 passed, 20 skipped) | 151 (131 passed, 20 skipped) |
| Tests | 1 642 (1 369 passed, 221 skipped) | 1 666 (1 393 passed, 221 skipped) |
| Duration (Vitest) | 67.88 s | 68.38 s |
| `npx vitest run --exclude 'tests/integration/**'` | — | 119 files, 1 302 passed |
| `npm run test:a11y` | 2 files | 3 files, 5 tests passed (gate unedited) |
| `index-*.js` | 244.63 kB (gzip 80.11 kB) | 252.94 kB (gzip 82.45 kB) |
| `index-*.css` | 10.58 kB (gzip 3.08 kB) | 11.93 kB (gzip 3.36 kB) |

- +4 test files (`answer-display.test.ts`, `AskPage.test.tsx`, `suggested-questions-coherence.spec.ts`,
  `ask-page.a11y.test.tsx`), +25 tests, −1 removed test (3.4): +24 net.
- Targeted (11.2): 18 files, 70 tests passed.
- `npm run lint`, `npm run typecheck` (including `tests/a11y/tsconfig.json`) and `npm run docs:coverage`:
  clean.
- `npm run lint:architecture`: 0 errors, the same 3 `no-orphans` warnings as before the change (the
  gitignored `packages/web/dist` bundle of a local build and `packages/analyzers/typescript`); none from
  the new files. `PendingScreen.tsx` was deleted with its import (design D16), so it does not become an
  orphan.
- Bundle: +8.3 kB raw / +2.3 kB gzip of JavaScript for the whole Screen 2 (no dependency added).

### Existing tests changed (specified changes, not fixes)

- **Removed (3.4):** `packages/web/src/router.test.tsx` → "A project path shows the Screen 2 placeholder
  with its id", with the helpers only it used (`PROJECT_ID`, `recordRequests`, `mainBlocks`). Its scenario
  left the spec (web-foundation delta, design D12, D15). No other line of the file changed.
- **Two assertions changed (4.1):** `packages/web/src/pages/ProjectPickerPage.test.tsx` → "The project link
  is reached and followed with the keyboard" (level-1 heading «acme-shop» and the textbox «Pregunta»
  instead of «Consulta del proyecto» and the id text) and "Leaving Screen 1 cancels a pending check"
  (level-1 heading «acme-shop»). Both failed after 3.2 for the expected reason — `Unable to find role="heading"
  and name "Consulta del proyecto"` — and passed after; their THEN lines are MODIFIED by the project-picker
  delta (design D17).
- **Untouched and green (10.1):** `tests/a11y/smoke.a11y.test.tsx`, `tests/a11y/project-picker.a11y.test.tsx`,
  `packages/web/src/theme.test.ts`, `tests/unit/seed/sample-projects-coherence.spec.ts` (`git diff --stat`
  empty for all four).

### Scenario ↔ test traceability (10.2)

Every `#### Scenario:` of the three delta specs maps to exactly one test with the same name, except
"Statement colours follow the wireframe" and "The development server serves the three paths", validated in
the browser (step 12 report) and in `/show-spec-working`.

### RED evidence

- 1.1 module missing; 1.3 and 1.4 `splitCode is not a function`, `evidenceLocation is not a function`; 2.1
  module missing.
- 3.1 no link «Volver a la selección de proyecto» (the placeholder was still rendered).
- 3.5 passed on its first run (3.2/3.3 already render the bar with only the id); negative control: giving
  a non-sample project a label makes it fail.
- 5.1 `expected [] to have a length of 1` (no send path yet). 5.2, 5.3 and 5.7 passed on their first run
  once 5.1 landed the hook and the check together; negative controls: dropping the invalid mark and its
  clearing makes 5.2 and 5.3 fail; removing the unmount abort makes 5.7 fail.
- 5.4 and 5.5 `Unable to find role "status"`. 5.8 first timed out (see design D35, `fireEvent`); negative
  control: a 60 s abort timer in `useAsk` makes it fail.
- 5.6 passed on its first run (the pending state already replaces the result); negative control: not
  setting the pending state makes it fail.
- 6.1–6.3 `Unable to find role="heading" and name "Respuesta"`. 6.3 negative control (task 6.3, local, not
  committed): the answer paragraph through `dangerouslySetInnerHTML` fails: the paragraph's text is «Usa negrita y `x`.» (the markup was interpreted) instead of «Usa <b>negrita</b> y <i>x</i>.».
- 7.1–7.3 `aria-expanded` was `null` (no toggle yet).
- 8.1 `Unable to find an element with the text: Sin respuesta verificada (motivo: no-anchor).`; 8.2 and 8.3
  `Unable to find role="alert"`.
- 9.1 passed on its first run (document order); negative control: `tabIndex={1}` on the evidence buttons
  makes it fail. 9.2: see the step 12 report (design D36).

### Mutation testing (11.4)

`packages/web/**` is not in Stryker's `mutate` list and `vitest.stryker.config.ts` excludes the web and a11y
tests (DIS-58 design D25); this change edits neither, so `npm run test:mutation` and the CI `mutation` job
behave as before (its `business` filter runs it, through `tests/**`, for the new coherence and a11y files).

To meet the workflow's "targeted mutation ≥ 80" a local-only run mutated the 14 new or changed web files
with the three test files that cover them (`incremental: false`, temporary configs in the scratchpad):

| File | Score |
|---|---|
| `answer-display.ts` | 92.75 % |
| `suggested-questions.ts` | 80.00 % |
| `AskPage.tsx` | 92.31 % |
| `useAsk.ts` | 71.43 % |
| `AskFallbackNotice.tsx`, `EvidenceList.tsx`, `QueryBox.tsx`, `SuggestedQuestions.tsx` | 100 % |
| `CodeText.tsx` | 85.71 % |
| `EvidenceItem.tsx`, `ProjectBar.tsx` | 75.00 % |
| `StatementBadge.tsx` | 73.68 % |
| `AnswerView.tsx` | 66.67 % |
| `router.tsx` | 58.33 % |
| **All files** | **84.29 %** (228 killed, 8 timed out, 39 survived, 5 no coverage) |

Survivors, by kind:

- **Class names (12):** emptied Tailwind classes of the statement boxes, badges and code fragments. jsdom
  computes no styles; the colours are checked in the browser (step 12 report, colour table).
- **Equivalent at the screen (9):** `answer-display.ts` `plain !== ''` guards (an empty text fragment
  renders nothing) and `<= text.length`; the hook's initial `{ status: 'idle' }`; the `[projectId]`
  dependency of `send` (the page is keyed by the project, D21); the `unavailable` failure object (the notice
  only tells `api` apart); `SAMPLE_PROJECTS.find` always true (one sample project); the decorative ▸/▾.
- **Guards the tests cannot reach (5):** the hook's own-abort check (visible only under `StrictMode`, as in
  DIS-60), the hook's pending ref (the page already ignores sends while `pending`), the empty `projectId`
  default and `createAppRouter` (only `main.tsx` uses it).
- **To take to the pre-merge review:** `AskPage` `onSubmit`'s `if (pending) return` survives. Without it,
  pressing Enter with an invalid text while a question is pending would show the invalid message, which the
  requirement "Pending question" forbids («change nothing on the screen»); the scenario "Sending again while
  a question is pending sends no request" only presses Enter with the valid question in the field. The fix
  is a spec scenario plus its test, which belongs to the review step (spec edits go through
  `/opsx:update`).
- `send` returned an unused `boolean` (its mutant survived): removed in `refactor(DIS-65): …` (10.3).

### Privacy / ethics check (11.5)

Verdict **PASS**. The page sends only the question the person types to the same-origin API (`POST
/api/projects/{id}/ask`, body `{ question }`); nothing is stored in the browser (no `localStorage`,
`sessionStorage` or cookie); the answer, the statements and the excerpts are rendered as React text
(`dangerouslySetInnerHTML` appears only inside React DOM in the bundle); no `VITE_*` in `dist`; no
dependency or lockfile change (D14); fixtures and test data are synthetic (no emails, tokens or real
people). The diff greps for e-mail shapes, `Authorization`, `Bearer`, secret prefixes and `console.*` found
nothing. Not assessed: none.

## Data state verification

- Pre-test baseline: the unit, component and a11y tests touch no database; no `.stryker-tmp/`.
- Post-test validation: no database touched by those tests; no `.stryker-tmp/` left by the targeted run;
  `packages/web/dist` is gitignored and not staged; the targeted Stryker configs and JSON report were moved
  to the session scratchpad.
- State restored: Yes (nothing to restore for this step; the manual test's database restore is in the step
  12 report)
- Restoration actions: none

## UI evidence

None for this step (see `2026-10-19-12-manual-interface-testing.md`).

## Outcome

- Status: PASS
- Blocking issues: none. One candidate finding for the pre-merge review (the invalid-while-pending send,
  above).
