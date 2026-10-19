CHANGES REQUIRED

# Spec audit — ask-page-states (DIS-66)

- Date: 2026-10-19
- Auditor: the spec-auditor checklist (`ai-specs/agents/spec-auditor.md`, eleven points), executed by the
  step agent of the autonomous run (ADR `20261016-autonomous-workflow-run-entrega-2`). This step has no
  subagent tool, so the auditor's instructions were run in this context, read-only on the artifacts until
  the report was written; the corrections were then applied through `/opsx:update`.
- Verdict per run: see each run below; the final verdict is the first line of this file once the last
  run is written.

## Run 1

CHANGES REQUIRED

**Inputs read:** `proposal.md`, `design.md`, `specs/ask-page/spec.md`, `tasks.md` (commit `b8eb3e9`);
DIS-66 and its parent DIS-62 in Linear, with DIS-66's only comment (the DIS-65 handover on the
re-announcement of the invalid-question message); `docs/project-context.md` (Commands → web, Screen 2;
prompts.md rules), `docs/frontend-standards.md` («How test:a11y is wired»),
`docs/openspec-tasks-mandatory-steps.md`; `openspec/specs/ask-page/spec.md`; ADR
`20261016-autonomous-workflow-run-entrega-2` (branch `feature/DIS-101-readme-entrega-2`); code:
`packages/web/src/pages/{AskPage.tsx,useAsk.ts,AskPage.test.tsx}`,
`packages/web/src/components/{AskFallbackNotice,QueryBox,AnswerView,project-display,answer-display}.ts(x)`,
`packages/web/src/services/api-client.ts`, `packages/web/src/{index.css,theme.test.ts}`,
`tests/a11y/ask-page.a11y.test.tsx`, `packages/api/src/{schemas/ask.ts,routes/ask.ts,plugins/error-handler.ts,plugins/rate-limit.ts}`;
wireframe `images/pantalla-2-consulta.svg`.

**Questions for the author:** none left open. The one disagreement between parent and sub-issue (F6) is
decided by the lead engineer under the autonomous-run ADR and recorded in Linear.

### 1. Scope against the ticket

Clean for the requirements: every requirement follows from the DIS-66 Enhanced acceptance criteria and
decisions D1–D16. Three refinements go beyond the Enhanced text and must be recorded there (F7,
improvable): every alert starts with the generic line and every API-error alert ends with its code, `429`
included (design D17); a general sentence for an `UNKNOWN` reason the page does not know (D23); a
rate-limit wait of 1 or more instead of "≥ 0" (D26).

### 2. Inherited acceptance criteria

Parent DIS-62 AC: confidence and usage panel (tokens, cost, latency, `savingsPct`, cache indicator) →
"Usage panel" ✓; `UNKNOWN` own state with its reason → "UNKNOWN states" ✓; `llm-required` notice distinct
from `no-anchor`, derived from `reason` → ✓; keyboard pass, visible focus, tab order → "Accessibility of
Screen 2" ✓; axe clean → ✓.

- **F6 (improvable; question resolved by the lead engineer).** The parent says that for a `429` the
  notice indicates "que la caché sigue disponible". The API rate limit is a global `onRequest` hook
  (`packages/api/src/plugins/rate-limit.ts:29-38`) that runs before the cache lookup, so under
  `RATE_LIMITED` a cached question is rejected too; only `BUDGET_EXHAUSTED` keeps the cache
  (`routes/ask.ts:53`, `cacheOnly: true`). The sub-issue's D9 is right; saying the cache is available
  under a rate limit would be false. Decision: keep D9, record the disagreement and its resolution in the
  DIS-66 Enhanced description.

### 3. Missing scenarios

- **F2 (blocking).** "UNKNOWN states" says "Every text of the API is rendered as text" and "Error,
  rate-limit and budget notices" renders the API's `code`; no scenario feeds markup through either path
  (only the answer has "Markup in an answer is shown as text"). Correction: add the scenario "Texts of the
  API in a state are shown as text" (an `llm-required` whose `message` is «<img src=x
  onerror=alert(1)>»), and a fifth run to "An API error names its code" with an unknown code «<i>X</i>»
  shown as «Código: <i>X</i>.» and no `i` element; tasks for both.
- **F5 (improvable).** "Screen reader announcements of Screen 2" says "no element of the result area
  other than the alerts has a live role"; the scenarios only pin "exactly one status". Correction: word
  the clause as what the scenarios check — the `UNKNOWN` states and the usage panel have no role `status`
  nor `alert` (already asserted by "exactly one element has role `status`" and the "no element with role
  `alert`" of the `UNKNOWN` scenarios).

### 4. Ambiguity

- **F4 (improvable).** "The usage panel and the states follow the wireframe": «one light band», «wraps on
  a narrow screen». Correction: «one band in the canvas colour», «wraps at 320 px wide without clipping»,
  and add «the heading «Uso» is not visible». No other occurrence of the checklist words.

### 5. Open decisions

- **F3 (improvable).** «< $0.001» when the amount "rounds to 0.000": the rounding is not named.
  Correction: design D3 — the amount's three-decimal form (`toFixed(3)`) is «0.000». Negative amounts:
  not a decision to take, the core never produces them (`costUsd` sums non-negative prices).
- The rest is fixed: figure formats (spec table, D3, D25, D28), reset time and wait forms (D26, D27), the
  case choice by code (D17), the status texts per state (spec), the alert lines and their order (spec
  table), the fallback reason (D23), the source of the tab-stop list (D31).

### 6. Contradictions inside the change

Clean between proposal, design and spec. The design and the task list disagree with themselves on
ordering — see F1.

### 7. Contradictions with the project

Clean. The delta keeps the "never colour alone" rule of DIS-65, the theme pairs of `theme.test.ts`, and
`docs/project-context.md` → Screen 2 is updated by task 14.1.

### 8. Contrast with the real code

- **F8 (improvable).** D22 puts `announcementOf(state: AskState)` in `components/notice-display.ts`, and
  task 6.2 gives it `alertLinesOf(failure: AskFailure)`: a component module would import types from
  `pages/useAsk.ts` (the inverse of the page → component direction of frontend-standards §2–§3;
  `AskFallbackNotice.tsx:2` does it today, and it is being deleted). Correction: `notice-display.ts`
  declares and exports the failure type (`AskFailure`), `useAsk.ts` imports it from there; the status text
  of a state is a local pure function of `AskPage.tsx` (the page owns the region, D22).

### 9. Task size

- **F1 (blocking).** The order of steps 3–6 breaks existing tests before their edit is planned, and one
  RED cannot be observed: (a) 3.3 adds the persistent status region, so "An answered question shows the
  answer, its statements and its evidence" fails on `queryByRole('status')` at 3.3 while its edit is
  planned in 4.1, where the new assertion would already pass (no RED); (b) the three provisional tests
  fail at 3.3 too ("An UNKNOWN shows the provisional status" finds two `status` elements; "An API error
  shows the provisional alert with its code" expects no `status`), but they are only deleted at 6.6.
  Correction: step 3 deletes the tests of the removed requirement first (the component stays until 6.6),
  then edits the two status assertions of the changed scenarios (frame and answer) and sees both fail
  before 3.3's GREEN; the deletion of the "no 0.71 / no Confianza" assertions moves after the panel's
  GREEN, where their failure is the RED evidence.
- Every other task fits one agent turn.

### 10. Mandatory steps

Clean: step 0 is the branch; steps 10–15 present and labelled; 12.6 restores `query_log` and `hit_count`;
13 records the absence of a Playwright suite; 15 is the pre-merge review with archive before merge.

### 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| Screen 2 frame and project bar | Screen 2 opens on a sample project without any request | 3.1, 3.3 |
| | A project outside the sample constant is shown by its id | existing test, 10.1 |
| Question box | A written question is sent trimmed | existing test, 10.1 |
| | An invalid question is not sent | existing test, 10.1 |
| | Changing an invalid question clears the mark | existing test, 10.1 |
| | Sending the same invalid question again announces the message again | 8.1, 8.2 |
| Pending question | (five scenarios) | existing tests, 10.1 |
| Answer with typed and verified statements | An answered question shows the answer, its statements and its evidence | 4.1 (F1) |
| | Every combination… / Markup in an answer… | existing tests, 10.1 |
| | Statement colours follow the wireframe | 12.2 (manual) |
| Accessibility of Screen 2 | Screen 2 has no axe violations in any of its states | 9.2 |
| | The tab order follows question, suggestions and evidence | existing test, 10.1 |
| | The result states add no tab stop | 9.1 |
| | The focus is visible on every control | 12.5 (manual), 15.2 |
| Usage panel | An answer from the model shows its usage panel | 4.2, 4.3 |
| | A cache hit shows its usage panel | 4.4 |
| | No saving is not shown as a saving | 4.5 |
| | The usage panel and the states follow the wireframe | 12.2–12.4 (manual), 15.2 |
| How usage figures and notice details are written | Confidence… / Tokens… / Cost… / Latency… / Savings… | 1.1–1.6 |
| | The budget reset time is written in UTC / The wait of a rate limit… | 2.1–2.3 |
| UNKNOWN states | (four scenarios) | 5.1–5.5 |
| | *(F2: texts of the API as text)* | **missing** |
| Error, rate-limit and budget notices | (four scenarios) | 6.1–6.5 |
| Screen reader announcements of Screen 2 | The status region announces every outcome | 7.1 |
| | The pending text is not read twice | 3.2, 3.3 |
| Provisional notice (REMOVED) | — | 6.6 (F1: deletion moves to step 3) |

The F2 row is empty: blocking until the scenario and its task exist.

### Corrections to apply

- `specs/ask-page/spec.md`: F2 (new scenario in "UNKNOWN states"; fifth run in "An API error names its
  code"); F4 (manual scenario wording); F5 (announcement clause).
- `design.md`: F3 (D3 rounding); F8 (D19/D22 module ownership, new decision); F1 (D24 order).
- `tasks.md`: F1 (reorder steps 3, 4 and 6.6); F2 (tasks for the new scenario and run); F8 (6.2 and 3.3
  wording).
- Linear DIS-66, Enhanced description (Spanish, outside `[original]`): F6 resolution, F7 refinements and
  the decisions taken while proposing (D17–D31 and the audit's).

### Resolution of run 1

- F1 — tasks reordered: 3.1 deletes the provisional tests; 3.2–3.3 edit the two status assertions (RED);
  4.3 removes the confidence assertions after the panel's GREEN; 6.6 deletes only the component. Design
  D24 updated.
- F2 — scenario "Texts of the API in a state are shown as text" added to "UNKNOWN states"; fifth run
  (`500` with code «<i>X</i>») added to "An API error names its code"; tasks 5.6 and 6.4 cover them.
- F3 — design D3 names the rounding (`toFixed(3)` gives «0.000»).
- F4 — manual scenario reworded (canvas band, 320 px, hidden «Uso»).
- F5 — announcement clause reworded.
- F6 — D9 kept; recorded in DIS-66 Enhanced as a lead-engineer decision with the code reference.
- F7 — D17, D23, D26 and the other propose decisions recorded in DIS-66 Enhanced.
- F8 — new design D32: `notice-display.ts` owns `AskFailure`; `useAsk.ts` imports it; the status text is
  a local function of `AskPage.tsx` (D22 updated).
