## Adversarial review

*Agent's text (autonomous run, review step, 2026-11-02), `adversarial-review` in its Inline mode.* Reviewed in a step separate
from the apply step: the artifacts of `openspec/changes/impact-page/`, the diff `origin/final-project-CRN...HEAD` (43 files,
PR #98 at `d9fc9d2`), the two browser reports and the verify-against-spec report. Every finding below was checked in the code or
by running it.

### What was checked

1. **Spec and task alignment.** Every requirement of the three deltas has a scenario and every automatic scenario a test with
   its exact name (grep of each `#### Scenario:` title; table in `2026-11-02-verify-against-spec.md`). Tasks 0–13 are `[x]` and
   their evidence exists (step 10 and step 11 reports, Linear comments of 13.5). History of the spec: see finding 3.
2. **Hostile input**, per entry point:
   - Change field: empty, only spaces, 4 and 501 code points, 500 `a`, 250 astral characters, U+0000 → `validChange`
     (`packages/web/src/components/impact-display.ts:25-30`) and its unit test cover the boundaries on both sides; an invalid send
     sends nothing (`ImpactPage.test.tsx:304`), checked again in the browser (0 requests).
   - Same request twice / two at once: the page returns while `pending` (`ImpactPage.tsx:93-95`) and the hook holds the
     controller in a ref (`useImpact.ts:66-68`), so two presses in one tick send one request.
   - Right type, wrong meaning: `maxHops` outside 1–3 cannot be chosen (native `<select>` with three options); the API rejects
     `maxHops: 9` with `400 VALIDATION_ERROR` (probed with `curl`), which the page would show as «Código: VALIDATION_ERROR.».
   - A subject who owns nothing: a project id the API does not have → `404 PROJECT_NOT_FOUND` alert (real API, browser report);
     an id with `/` or `?` is percent-encoded in the API URL (`api-client.test.ts:457`) and in both navigation links.
   - API text with markup: rendered as text, no `img` or `b` element (`ImpactPage.test.tsx:548`, and in the browser).
3. **Blast radius.** `PageFrame`'s new `nav` prop is optional: Screen 1, the not-found screen and the error screen pass none and
   render as before (their tests and the gate are unchanged and green). `AskPage` gains a last tab stop after `<main>`, which the
   `ask-page` delta specifies; every existing Screen 2 test passes unedited. `projectHeadingOf` moved into `project-display.ts`,
   which now imports `data/sample-projects.ts`; that module imports nothing back (no cycle). The web writes no data; the API's
   `query_log` gets one `impact` row per answered or unknown send and none per invalid send or error (counted in both browser
   runs, then restored to 0). No migration. No change to `packages/api`, `packages/core` or the adapters.
4. **Evidence quality.**
   - The tests assert behaviour through the DOM a person and a screen reader see (roles, names, text content, focus), not the
     implementation.
   - Mutation tried for this review: in `ImpactReport.tsx` `componentEntry`, the resolution written before the hops. "The answered
     report shows its five sections, its origins and its risk" fails («Expected … 0 saltos · exacta · [grafo]», «Received … exacta
     · 0 saltos · [grafo]»). Reverted.
   - Second mutation: the `controller.signal.aborted` guard of `settle` removed in `useImpact.ts`. All 20 tests of
     `ImpactPage.test.tsx` and `impact-page.a11y.test.tsx` still pass (finding 2). Reverted.
   - Existing tests modified: `packages/web/src/services/api-client.test.ts` (import line and appended tests),
     `tests/unit/web/api-contract.spec.ts` (two comparisons and a second negative control added),
     `packages/web/src/pages/AskPage.test.tsx` (two tests appended), `tests/a11y/smoke.a11y.test.tsx` (one test appended, header
     comment). All four are named by tasks 1.1, 1.6, 3.5, 3.7 and 8.3 and no existing assertion was removed or weakened
     (`git diff` of each file shows additions only, besides the import line and the comment). Justified.

### Findings

| Severity | File:line | Finding | Why it matters |
|---|---|---|---|
| Minor | `readme.md:185` | The sentence still said `docs/DEMO.md` «recorre las dos pantallas en Recorrido por la web», but that section now walks Screens 1, 2 and 3 (`docs/DEMO.md:660` already says «Las tres pantallas»). | A reader of §1.3 is told Screen 3 is not in the browser walkthrough. **Fixed in this PR** («las tres pantallas»). |
| Minor | `packages/web/src/pages/useImpact.ts:73-75` | The `controller.signal.aborted` guard of `settle` is not killed by any test: removing it leaves the 20 tests of Screen 3 green. | The controller is aborted only on unmount, and React 18 ignores a state update on an unmounted component, so the mutant is equivalent: no person or test can observe it. The guard is the same defensive pattern as `useAsk` (DIS-66). `packages/web` is outside Stryker's `mutate`, and DIS-77 owns bringing it in; this mutant will show there as equivalent. |
| Minor | `packages/web/src/components/RiskBanner.tsx:27-32` | No automated test asserts that `HIGH` uses the warning pair and `MEDIUM`/`LOW` the neutral canvas pair. | The level is always in the heading text (tested), so colour is not the only carrier; axe in jsdom cannot compute colours. The pairs were measured in a real browser for the three levels (9.34, 14.63, 7.76; both browser reports) and the tokens are pinned by `theme.test.ts`. |
| Minor | `openspec/changes/impact-page/design.md` Follow-ups P15 | The components, hook and page of task groups 4 to 8 were written before their tests (RED was not observed first). | Process debt of the apply step, already recorded: each guarding test was seen failing with a local mutation and reverted (step 10 report). The two mutations of this review add evidence that the report tests are sensitive. |
| Question | `openspec/changes/impact-page/specs/impact-page/spec.md` (commit `d9fc9d2`) | The delta spec changed in the implementation commit: one scenario added ("A pending report has no time limit of its own"), a third run added to the tab-order scenario, and «the focus is on the element the person used last» made explicit per run. | Checked: these are the improvements I1–I3 of spec-audit run 2 (`APPROVED`), recorded in design → Follow-ups P14. Each one makes a scenario stricter or adds one; none relaxes a scenario to fit the code. No action. |

### Verdict

PASS WITH GAPS — no Blockers and no Majors. The one Minor that was a defect (the stale `readme.md` sentence) is fixed in this
PR; the other Minors and the Question are tracked below.

Deferred findings and their destination (`docs/project-context.md` → *Tracking deferred findings*; recorded in `design.md` →
Follow-ups P17–P20, agent's text):

| Finding | Destination |
|---|---|
| `readme.md:185` stale sentence | A — fixed in this change (P17) |
| Equivalent mutant in `useImpact`'s `settle` guard | B — DIS-77 (mutation and coverage gate of `packages/web`, already the destination of P7) (P18) |
| Risk colours by level not asserted automatically | D — accepted: text carries the level, contrast measured in a real browser (P19) |
| Tests after code in groups 4–8; spec tightened in the implementation commit | D — accepted process record, already P14/P15 (P20) |

### Recommended next steps before archiving

1. Commit the `readme.md` fix and the three review reports with their screenshots to PR #98, and wait for CI to be green.
2. Add the hand-off of P18 to the existing DIS-77 comment thread (agent's text) and a review comment on DIS-14.
3. Task 14.7: the `## Purpose` of `openspec/specs/web-foundation/spec.md` («its routes and the screens shown before the real ones
   exist») and of `openspec/specs/ask-page/spec.md` (Screen 2 only) need no wording change for Screen 3: the first already speaks
   of the client's routes in general and the second describes Screen 2, whose new link is a requirement, not a purpose change.
4. `/opsx:archive`, then merge through the gate.
