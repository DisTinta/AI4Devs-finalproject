## Adversarial review

- Date: 2026-10-18
- Change: project-picker (DIS-60), task 14.4
- Scope: `git diff origin/feature/entrega-2-CRN...HEAD` at `9d9e1f1` (31 files) plus the change artifacts and
  the two reports before this one (`2026-10-18-show-spec-working.md`, `2026-10-18-verify-against-spec.md`).
  Run in a session other than the one that implemented the change, in the agent's own context (autonomous
  run, ADR `20261016-autonomous-workflow-run-entrega-2`).
- Security reviewer: not run. The diff adds no HTTP input, no rate limit, no secret and no personal data:
  the page renders the versioned constant and calls the existing same-origin `GET /health` with no
  parameter (privacy check of the step 9 report: PASS).

### What was checked

1. **Spec and task alignment.** Every requirement has scenarios and every scenario a test with its exact
   name, or a command/manual check named in task 7.3 (table in the verify-against-spec report). Tasks 0–12
   marked `[x]` have their evidence in the step 9 report (RED runs, the six mutation-proven tests, the
   removed test, mutation 84.46 %, privacy) and the step 10 report (four screenshots, `query_log` 3 → 3).
   History: `git log origin/feature/entrega-2-CRN..9d9e1f1 -- openspec/changes/project-picker/specs` shows
   only the propose commit and the two spec-audit commits, all before the first code commit, so the spec
   was not edited to match the code (the edits of this review are recorded below and in the spec-audit
   addendum). Unspecified code: only the recorded decisions of verify-against-spec block 3.
2. **Hostile input**, read in `useApiHealth.ts`, `ProjectPickerPage.tsx`, `ProjectCard.tsx`,
   `project-display.ts`, `router.tsx`:
   - Health answers: `TypeError`, `500` empty, `503` error format, `200 {"status":"down"}`, time limit,
     `RangeError` → all `unavailable` (any rejection but the hook's own abort); tested.
   - Same request twice: a second press while a check is pending is a no-op (ref guard); tested.
   - Two at once: `StrictMode` mounts the page twice in development, so two checks start and the first is
     aborted; the guard that makes an aborted check change nothing had **no test that can see it**
     (finding 2).
   - Focus: the first check never moves it, but only the success case was asserted (finding 3); a
     successful retry moved the focus to the `h1` **even when the person had moved it elsewhere** while the
     retry was pending (finding 1).
   - Unmount during a retry: the cleanup aborts `pending.current`, which is the retry's controller; the
     aborted check settles nothing.
   - Counts: `0`, `1`, `999`, `1840`, `1234567` tested; negative or fractional counts cannot come from the
     generated constant (`seed-build` counts `INSERT`s).
   - Identifiers: unknown language/framework written as is; `constructor` cannot reach
     `Object.prototype` (`ReadonlyMap`, D26); `framework: null` → language only.
   - Project ids in the link: `encodeURIComponent`, one path segment.
   - Long project names: a name with no break opportunity longer than about 26 characters would be
     clipped by the 288 px card (finding 6).
   - An empty constant: an empty, named list and no message (finding 7).
   - Narrow screens: at 320 px the alert's text column was about 110 px wide (finding 4, from
     show-spec-working S1).
3. **Blast radius.** `routes` gained a pathless root: its consumers are `main.tsx` (browser router),
   `router.test.tsx` and `tests/a11y/smoke.a11y.test.tsx`; both test files pass unedited except the removed
   test of the retired scenario (D12). Tests that render `/` without stubbing `fetch` now trigger one
   `/health` that rejects under jsdom; none asserts the alert's absence and no `act(...)` warning is
   printed (step 9 report). No migration, no data written, no API or dependency change; the bundle grows
   +7.8 kB JS and +3.0 kB CSS.
4. **Evidence quality.** The tests assert behaviour through roles, names and the `fetch` double at the
   network boundary, never the `api-client` module. The most important test is "An unavailable API shows
   the alert and keeps the cards": a hook that treated an `ApiError` (`503`) or a `200 {"status":"down"}`
   as available, or that mapped only `TypeError` to unavailable, fails it, because each of the four runs
   must show the alert. Existing tests modified: only the removal of "The root path shows the Screen 1
   placeholder", justified by the REMOVED + ADDED delta (D12, D15).

### Findings

| Severity | File:line | Finding | Why it matters |
|---|---|---|---|
| Minor | `packages/web/src/pages/ProjectPickerPage.tsx:23-27` | A successful retry moves the focus to the `h1` whatever element has it: a person who pressed «Reintentar» and then tabbed to «Explorar proyecto» loses the focus when the check resolves | Focus taken away from where the person put it (keyboard and screen-reader users); the reason for moving it (the focused button disappears) does not hold then |
| Minor | `packages/web/src/pages/useApiHealth.ts:38` | The "ignore an aborted check" guard is never exercised by a test that can observe it (verify V2); removing it leaves the suite green | In development (`StrictMode`) the alert would appear with the API up: the first check is aborted and would settle `unavailable` |
| Minor | `packages/web/src/pages/ProjectPickerPage.test.tsx:193-245` | "the first check SHALL NOT move the focus, whatever its outcome" is asserted only for the success case (verify V1) | A page that focused the alert when the first check fails would pass |
| Minor | `packages/web/src/components/ErrorBanner.tsx:23-36` | At 320 px «Reintentar» stays beside the message, which wraps in a column about 110 px wide (show-spec-working S1) | Cramped and hard to read on a phone, though WCAG 1.4.10 holds |
| Minor | `packages/web/src/router.test.tsx:41` | The `describe` still reads «Routes of the web client», the requirement this change removed (now «Routes and screens of the web client») | Traceability is by scenario name, which is exact; the label is stale |
| Question | `packages/web/src/components/ProjectCard.tsx:59-66` | A project name with no break opportunity longer than the card's width would be clipped | Names come from the versioned seed (acme-shop today, task-api with CM-HU-18) |
| Question | `packages/web/src/pages/ProjectPickerPage.tsx:46-52` | With an empty constant the page shows an empty list and no message | The `seed-build` spec always writes acme-shop; the constant cannot be empty while the seed has a project |

### Verdict

PASS WITH GAPS — no Blockers and no Majors. Every gap has a destination (below and in `design.md` →
Follow-ups); the four fixable Minors are fixed in this change (addendum).

### Recommended next steps before archiving

1. Fix findings 1–4 in this change (findings 1–3 by TDD with spec edits through `/opsx:update`, finding 4 as
   a layout change checked in the browser), re-run the targeted suite and the gates, and record the result
   here and in the spec-audit and show-spec-working reports.
2. Findings 5–7: **D** (accepted), recorded in `design.md` → Follow-ups with their reasons; no Linear issue.
3. Open the pull request (task 13), confirm CI green, then `/opsx:archive` and merge.

## Addendum — fixes (2026-10-18)

| # | Destination | What was done | Evidence |
|---|---|---|---|
| 1 | **A** | Spec "API status on Screen 1": the focus moves to the `h1` after a successful retry unless the person moved it while the retry was pending. New scenario "A successful retry leaves the focus where the person moved it". `ProjectPickerPage` moves the focus only when it was lost (`document.activeElement` is `body` or `null`), design D32 | RED: `expected <h1 tabindex="-1" …> to be <a …>`; GREEN after the change; live: `Tab`, `Enter`, `Tab` to the link, answer released → «listo», focus on the link (show-spec-working addendum) |
| 2 | **A** | New scenario "A check the page cancels itself changes nothing on the screen": the routes inside `StrictMode`, two requests, the first aborted, «comprobando…» shown, no alert (design D33) | Passed at once (the behaviour existed); removing the guard temporarily makes it fail with `Unable to find an element with the text: comprobando…` (reverted) |
| 3 | **A** | Scenario "An unavailable API shows the alert and keeps the cards" now states that the focus is still on the document body, and its test asserts it in the four runs | Passed at once; focusing the `h1` when the check fails (temporary) makes it fail with `focusOnBody: false` in every run (reverted) |
| 4 | **A** | `ErrorBanner`: the ⚠ and the message share a box of at least 12rem and the alert wraps, so on a narrow screen the button goes below the message; same row on desktop (design D34) | Browser: at 320 px the message is 220 px wide and the button below it, `scrollWidth` 320; at 1 280 px same row (`./2026-10-18-ssw-narrow-320-fixed.png`) |
| 5 | **D** | Accepted: task 2.3 limits `router.test.tsx` to the removal of the retired test, and the traced names (scenario ↔ test) are exact | — |
| 6 | **D** | Accepted: the names come from the versioned seed, regenerated by `npm run seed:build` and reviewed in its pull request with a screenshot of Screen 1 | — |
| 7 | **D** | Accepted: `seed-build` guarantees at least acme-shop in the constant | — |

After the fixes: `npx vitest run packages/web tests/a11y tests/unit/web
tests/unit/seed/sample-projects-coherence.spec.ts` → 11 files, 43 tests passed (+2 new tests); `npm run lint`,
`npm run typecheck`, `npm run docs:coverage` clean; `npm run test:a11y` → 2 files, 4 tests passed.

Re-run of this review over the fixes: the three code changes are local (`ProjectPickerPage.tsx` focus effect,
`ErrorBanner.tsx` classes and one wrapper `div`) and the alert's text content and order are unchanged (the
"A failed retry keeps the alert" test compares it verbatim and passes). No new Blocker or Major.
