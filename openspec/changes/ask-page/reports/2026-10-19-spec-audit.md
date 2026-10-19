APPROVED

# Spec audit — ask-page (DIS-65)

- Date: 2026-10-19
- Auditor: the spec-auditor checklist (`.claude/agents/spec-auditor.md`, eleven points), executed by the
  step agent of the autonomous run (ADR `20261016-autonomous-workflow-run-entrega-2`). This step has no
  subagent tool, so the auditor's instructions were run in this context, read-only on the artifacts until
  the report was written; the corrections were then applied through `/opsx:update`.
- Verdict per run: run 1 CHANGES REQUIRED; run 2 APPROVED (no blocking finding; its three improvable
  findings were folded before the apply). Final verdict: APPROVED.

## Run 1

CHANGES REQUIRED

**Inputs read:** `proposal.md`, `design.md`, `specs/ask-page/spec.md`, `specs/web-foundation/spec.md`,
`specs/project-picker/spec.md`, `tasks.md` (commit `14eb8e4`); DIS-65 and its parent DIS-62 in Linear
(DIS-65 has no comments with scope; its Enhanced description holds D1–D14);
`docs/project-context.md`, `docs/frontend-standards.md`, `docs/openspec-tasks-mandatory-steps.md`;
`openspec/specs/web-foundation/spec.md`, `openspec/specs/project-picker/spec.md`,
`openspec/specs/http-ask/spec.md` (question limits, `429` codes); ADR
`20261016-autonomous-workflow-run-entrega-2` (branch `feature/DIS-101-readme-entrega-2`); code:
`packages/web/src/{router.tsx,router.test.tsx,index.css,theme.test.ts}`,
`packages/web/src/components/{PageFrame,AppHeader,PendingScreen,ErrorBanner,BackToPickerLink,project-display}.ts(x)`,
`packages/web/src/pages/{ProjectPickerPage.tsx,ProjectPickerPage.test.tsx,useApiHealth.ts}`,
`packages/web/src/services/api-client.ts`, `packages/web/src/data/sample-projects.ts`,
`packages/api/src/schemas/ask.ts`, `tests/a11y/{smoke,project-picker}.a11y.test.tsx`,
`tests/unit/seed/{sample-projects,golden}-coherence.spec.ts`, `seeds/cache/acme-shop.json`,
`packages/cli/src/cache/demo-questions.ts`; wireframe `images/pantalla-2-consulta.svg`.

### Questions for the author

None blocking. Every open point is decided as lead engineer (autonomous-run ADR) and recorded in the
Enhanced description of DIS-65.

### 1. Scope against the ticket

Clean. Everything follows from DIS-65 (D1–D14 of its Enhanced description) or refines it: D15 (delta
shape forced by OpenSpec), D16 (dead `PendingScreen`), D17 (two `project-picker` scenarios that named
the placeholder), D18–D28 (how, not what). The provisional notice (D10) is the minimum that
frontend-standards §2 requires; the final states stay in DIS-66. No widening to the parent's usage panel.

### 2. Inherited acceptance criteria (DIS-62)

Covered for the part DIS-65 owns: statements with type and verification badges (icon + text + colour) →
"Answer with typed and verified statements"; evidence with file and range, expandable by mouse and
keyboard with the exact excerpt → "Expandable evidence"; tab order question → answer → evidence →
"The tab order follows question, suggestions and evidence"; axe → "Screen 2 has no axe violations…".
`confidence`, the usage panel, the final `UNKNOWN`/`llm-required`/`429` states are DIS-66 (D9, D10),
consistent with the Non-goals of DIS-65. No disagreement between parent and sub-issue.

### 3. Missing scenarios

- **F1 (blocking).** "Question box": «The mark and the message SHALL go away … or sends a valid
  question» — the only way to send a valid question without changing the text is a suggested question,
  and no scenario covers it. Correction: a second run in "Changing an invalid question clears the mark":
  after «hola», pressing a suggested question removes the mark and the message and sends one request.
- **F2 (blocking).** "Pending question": «The page SHALL NOT set a time limit of its own» has no
  scenario. Correction: new scenario "A pending question has no time limit of its own" (fake timers:
  120 000 ms later the status is still shown, one request, its signal not aborted).
- **F3 (blocking).** "Answer…": «no other markup is interpreted and every text is rendered as text» (the
  injection guarantee of frontend-standards §3) has no scenario. Correction: new scenario "Markup in an
  answer is shown as text".
- **F4 (blocking).** "Answer…": «omitted when it cites none» — `evidenceIds` is an unbounded array in
  `packages/api/src/schemas/ask.ts` (`z.array(z.string())`), so an empty list is possible and
  untested. Correction: in "Every combination of type and verification is labelled" the fourth
  statement cites no evidence and its item holds no «Evidencia:».
- **F5 (blocking).** "Expandable evidence": «repeated evidence included» has no scenario (Q4 of the
  golden file cites the same range twice). Correction: new scenario "Repeated evidence is listed as
  received".
- **F6 (blocking).** "Pending question": «whatever it showed before (an answer with its evidence, or a
  notice) SHALL be removed» — only the answer case is covered. Correction: a second run in "A new question
  replaces what was shown" starting from the provisional alert.
- **F7 (blocking).** The colours of the statements and badges ("Answer…" table and the
  `INFERENCE`/`FACT` drawing) are MUST clauses that no scenario checks; jsdom computes no styles.
  Correction: a scenario "Statement colours follow the wireframe" validated in the manual interface test
  and `/show-spec-working` with screenshots (as "The development server serves the three paths"), and
  the exact tokens fixed in design D8/D19.

### 4. Ambiguity

Clean: no "fast", "easy", "secure", "efficient", "many", "appropriate" or "robust" in the artifacts.

### 5. Open decisions

- **F8 (improvable).** Task 3.3 says "remove only the test … and its now unused helper if any" but also
  "no other line of that file changes": once the test goes, `recordRequests`, `mainBlocks` and
  `PROJECT_ID` of `router.test.tsx` are unused and `npm run lint` fails on them. Correction: name them in
  the task as removed with the test (they belong only to it).

### 6. Contradictions inside the change

Clean. Proposal, design and specs agree on the bar (D3), the validation (D4, D18), the suggestions (D5),
the notice (D10) and the deltas (D12, D15, D17).

### 7. Contradictions with the project

Clean. The `web-foundation` requirement "Accessibility gate on the real routes" still holds (the gate is
not edited and scans the real Screen 2). The question limits match `http-ask` (5 to 500 code points;
`z.string().min/max` of Zod 4 counts code points, checked: `'😀😀😀'` fails `min(5)`). Colours stay in
the pairs of `theme.test.ts` (D19). frontend-standards §2 (explicit states) and §3 (no unescaped user
input, four responsibilities) are honoured.

### 8. Contrast with the real code

Clean, with two notes already handled: `PageFrame` hard-codes `AppHeader` (`PageFrame.tsx:17-22`), hence
the optional `banner` prop of D3; `PendingScreen` is only imported by `router.tsx:3` (D16). The smoke
gate waits for `findByRole('heading', { level: 1 })` (`smoke.a11y.test.tsx:40`), which the `h1` in the
banner satisfies.

### 9. Task size

- **F9 (improvable).** Task 3.2 creates `PageFrame`'s prop, `ProjectBar`, `QueryBox`,
  `SuggestedQuestions`, `AskPage`, the router change and the deletion of `PendingScreen` in one step.
  Correction: split it into the frame part (prop, bar, router, deletion) and the main-content part (box,
  suggestions, page composition).
- **F10 (improvable).** Task 5.2's wording («accessible description via
  `toHaveAccessibleDescription`-free check») is unclear. Correction: "the element named by the field's
  `aria-describedby` has role `alert` and the message text".

### 10. Mandatory steps

Clean: step 0 is the branch; "Review and Update Existing Tests", "Run Tests and Verify Data State",
"Manual Interface Testing (AGENT MUST EXECUTE)", "End-to-End Testing", "Update Technical Documentation"
and "Pre-merge Review" (last) are present and labelled; the manual step restores `query_log` and
`hit_count`.
- **F11 (improvable).** Step 12.1 does not record the `claim` count, which an `/ask` may change on a live
  answer. Correction: record and re-check it (expected unchanged in evaluation mode).

### 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| Screen 2 frame and project bar | Screen 2 opens on a sample project without any request | 3.1, 3.2 |
| | A project outside the sample constant is shown by its id | 3.4 |
| Question box | A written question is sent trimmed | 5.1 |
| | An invalid question is not sent | 5.2 |
| | Changing an invalid question clears the mark | 5.3 |
| Suggested questions | A suggested question is sent at once | 5.4 |
| | The suggested questions are the golden questions | 2.1, 2.2 |
| Pending question | Sending again while a question is pending sends no request | 5.5 |
| | A new question replaces what was shown | 5.6 |
| | Leaving the page aborts the pending question | 5.7 |
| | *(no time limit — F2)* | **hole** |
| Answer with typed and verified statements | An answered question shows the answer, its statements and its evidence | 6.1 |
| | Every combination of type and verification is labelled | 6.2 |
| | *(markup as text — F3; colours — F7)* | **hole** |
| Expandable evidence | Evidence expands and collapses with a pointer | 7.1 |
| | Evidence expands with the keyboard, one item at a time | 7.2 |
| | *(repeated evidence — F5)* | **hole** |
| How a question, an answer and an evidence location are written | Question length is counted in code points after trimming | 1.1, 1.2 |
| | Back-quoted fragments are shown as code | 1.3 |
| | Evidence locations name the file and its lines | 1.4 |
| Provisional notice for what is not an answer | An UNKNOWN shows the provisional status | 8.1 |
| | An API error shows the provisional alert with its code | 8.2 |
| | An unavailable API shows the provisional alert | 8.3 |
| Accessibility of Screen 2 | Screen 2 has no axe violations in any of its states | 9.2 |
| | The tab order follows question, suggestions and evidence | 9.1 |
| web-foundation: Paths of the web client and their screens | An unknown path shows the not-found screen and leads back | existing test, 10.1 |
| | The development server serves the three paths | 12.2–12.4, 15.2 |
| project-picker: Sample-project cards without HTTP | The project link is reached and followed with the keyboard | 4.1 |
| project-picker: API status on Screen 1 | Leaving Screen 1 cancels a pending check | 4.1 |

The holes are the scenarios F2, F3, F5 and F7 ask for.

### Corrections to apply

- `specs/ask-page/spec.md`: F1 (second run of "Changing an invalid question clears the mark"), F2 (new
  scenario under "Pending question"), F3 (new scenario under "Answer…"), F4 (fourth statement without
  evidence), F5 (new scenario under "Expandable evidence"), F6 (second run of "A new question replaces
  what was shown"), F7 (new scenario "Statement colours follow the wireframe").
- `design.md`: D8/D19 name the exact token per badge and item (F7); a line on the decisions taken in the
  audit.
- `tasks.md`: tasks for F2, F3, F5, F7; F1, F4 and F6 in the existing tasks 5.3, 6.2 and 5.6; F8 in 3.3;
  F9 split of 3.2; F10 wording of 5.2; F11 in 12.1 and 12.5; 10.2 lists the new manual scenario.
- Linear DIS-65 Enhanced: the decisions D15–D28 of the propose and the audit outcome (in Spanish, outside
  `[original]`).

### Resolution of run 1

All corrections applied through `/opsx:update` (decisions as lead engineer, autonomous-run ADR):

| # | Resolution |
|---|---|
| F1 | `specs/ask-page/spec.md` → "Changing an invalid question clears the mark" has a second run with a suggested question (one request, mark gone); task 5.3 |
| F2 | New scenario "A pending question has no time limit of its own"; design D30 (fake timers); task 5.8 |
| F3 | New scenario "Markup in an answer is shown as text"; design D29; task 6.3 (with a local negative control) |
| F4 | "Every combination of type and verification is labelled": the fourth statement cites no evidence and shows no «Evidencia:»; task 6.2 |
| F5 | New scenario "Repeated evidence is listed as received"; task 7.3 (keys are the evidence ids) |
| F6 | "A new question replaces what was shown": second run from the provisional alert; task 5.6 |
| F7 | New scenario "Statement colours follow the wireframe", validated by hand; design D19 holds the token table; tasks 10.2 and 12.3 |
| F8 | Task 3.4 names `recordRequests`, `mainBlocks` and `PROJECT_ID` as removed with the test |
| F9 | Task 3.2 split into 3.2 (frame part) and 3.3 (main part); later tasks renumbered |
| F10 | Task 5.2 reworded |
| F11 | Tasks 12.1 and 12.5 record and re-check the `claim` count |

## Run 2

APPROVED

**Inputs read:** the revised `proposal.md`, `design.md`, the three deltas and `tasks.md`; the same
project and code inputs as run 1. `openspec validate ask-page --strict` passes.

### Questions for the author

None.

### The eleven points

1. Scope against the ticket — clean (the new scenarios refine requirements already in scope).
2. Inherited acceptance criteria — clean, as in run 1.
3. Missing scenarios — clean: every MUST clause of the seven `ask-page` requirements has a scenario; the
   colours are covered by the manual scenario (F7).
4. Ambiguity — clean (no listed word in the artifacts).
5. Open decisions — clean: lengths, texts, order, keys, focus, time limit and colours are fixed.
6. Contradictions inside the change — clean.
7. Contradictions with the project — clean.
8. Contrast with the real code — clean.
9. Task size — clean after the split of F9.
10. Mandatory steps — clean, with three improvable wording findings:
    - **G1 (improvable).** Task 0.4 said "step 10 captures its own state"; the manual step is 12.
      Folded: "step 12".
    - **G2 (improvable).** Task 4.1 said both tests "failed before 3.2"; they fail after 3.2 removes the
      placeholder. Folded: "fail after 3.2 for the expected reason … before their assertions change".
    - **G3 (improvable).** Task 12.4 said "send Q-like text". Folded: "write «¿Cómo se validan los
      cupones?» in the field and press Enter".
11. Traceability — no hole:

| Requirement | New scenario of run 1 | Task |
|---|---|---|
| Question box | "Changing an invalid question clears the mark" (second run) | 5.3 |
| Pending question | "A new question replaces what was shown" (second run) | 5.6 |
| Pending question | "A pending question has no time limit of its own" | 5.8 |
| Answer with typed and verified statements | "Every combination…" (no evidence) | 6.2 |
| Answer with typed and verified statements | "Markup in an answer is shown as text" | 6.3 |
| Answer with typed and verified statements | "Statement colours follow the wireframe" | 10.2, 12.3, 15.2 |
| Expandable evidence | "Repeated evidence is listed as received" | 7.3 |

The rows of run 1's table keep their tasks (3.2 → 3.2/3.3, 3.3 → 3.4, 3.4 → 3.5 after the split).

### Corrections to apply

- `tasks.md`: G1, G2, G3 (applied).
- Linear DIS-65 Enhanced: D15–D30 and the audit outcome (applied, in Spanish, outside `[original]`).

## Addendum — pre-merge review (2026-10-19)

`/adversarial-review` (task 15.4) took the step 11 mutation survivor of `AskPage`'s `if (pending) return`
in `onSubmit` to the spec. `/opsx:update` revised `specs/ask-page/spec.md` → "Pending question":

- the requirement now says that a send while a question is pending changes nothing «whether or not the
  field holds a valid question: no invalid mark and no message either» (before, "Question box" and
  "Pending question" could be read as conflicting for an invalid text sent while pending);
- new scenario "An invalid send while a question is pending changes nothing", with its test of the same
  name in `packages/web/src/pages/AskPage.test.tsx` (task 15.5.3), RED observed with the guard removed
  locally (`expected 'true' to be null`, the field's `aria-invalid`).

Re-check of the affected audit points: open decisions, contradictions inside the change and traceability
are clean (`openspec validate ask-page --strict` passes; the new scenario maps 1:1 to its test). No other
requirement changed; D37 and D38 (excerpts and long words wrap) are presentation and touch no scenario.
