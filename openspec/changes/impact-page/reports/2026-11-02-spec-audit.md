CHANGES REQUIRED

**Questions for the author.** The parent and the sub-issue disagree on two points. The auditor does not resolve them; the main session records them in the change and in the ticket.

- **Q1 — Origin tag "texto + icono".** The parent DIS-8 AC 1 asks for an origin tag on every element "texto + icono, no solo color". The sub-issue DIS-14 AC 1 asks only for the text «[grafo]» / «[git]». The change has text only, with no icon, and gives documents no tag at all (P2). Options:
  - (a) Accept text only, and record it as a departure from DIS-8 like E6 and E7.
  - (b) Add a decorative `aria-hidden` icon next to each tag. This needs a requirement clause and a scenario assertion.
- **Q2 — "400 por `maxHops` fuera de rango … `code` traducido a mensaje legible".** The parent asks for a readable message for each code. The change reuses `alertLinesOf` unchanged. For `INVALID_IMPACT_REQUEST`, `VALIDATION_ERROR` and `INTERNAL` it shows only «No se ha podido obtener la respuesta.» + «Código: X.», with no readable sentence for the code. The sub-issue AC 4 accepts `alertLinesOf`. The UI cannot send an out-of-range `maxHops`, because the `<select>` offers only 1–3. Options:
  - (a) Accept, and record it as a departure from DIS-8.
  - (b) Add a case line for `INVALID_IMPACT_REQUEST` / `VALIDATION_ERROR`. This edits `notice-display.ts` and Screen 2's spec.

---

## 1. Scope against the ticket

The scope is clean. Everything in the proposal, the deltas and the tasks follows from DIS-14 (its DoD, its enhanced ACs 1–5 and decisions D1–D8):

- The Screen 2 link is required by AC 5.
- The `PageFrame` `nav` prop and the `projectHeadingOf` move (D14) are minimal enabling refactors.
- The legend comes from the wireframe; the deterministic line comes from D6.

Nothing widens the change to the parent's whole story.

**Improvable — I1. The change departs from the sub-issue's technical context, and the departure is not recorded.** The `[enhanced]` → «Contexto técnico» section of DIS-14 says:
- `router.test.tsx` covers the new route. Task 9.1 instead lists `router.test.tsx` as untouched.
- `/p/<id>/impact` is added to `SCANNED_PATHS` of `tests/a11y/smoke.a11y.test.tsx`. Design D16 instead keeps that file unedited and adds a separate test.

Neither departure is in `design.md` → Follow-ups. See also point 7.

## 2. Inherited acceptance criteria

The DIS-14 DoD is "Recorrido §1.3 paso 4 reproducible en navegador; cada estado con test RTL; `test:a11y` limpio", plus enhanced ACs 1–5.

| AC | Requirement → scenario | Status |
|---|---|---|
| Sub AC1 (Q2 report, body with `maxHops` 2, order, tags, risk, status) | Change box → "A valid change is sent trimmed…"; Answered report → "The answered report shows its five sections…" | covered |
| Sub AC2 (stale, empty section, `sin PR`, `maxHops` 1/3) | "An empty section, a stale document…"; "A valid change is sent…" runs 2–3 | covered, but keyboard operation is not really tested (B2) |
| Sub AC3 (`unknown`) | "An unknown report says the change anchors nothing" | covered |
| Sub AC4 (invalid change, 429/404/400/500/unavailable, no previous report) | "An invalid change is not sent"; "A rate limit, an API error…"; "A failure removes the report…" | covered |
| Sub AC5 (pending, abort, links, ProjectBar, axe in 8 states, real browser) | Pending report scenarios; frame scenarios; ask-page "Screen 2 links…"; "Screen 3 has no axe violations…"; "The walkthrough step 4…" | covered |
| Parent: tag "texto + icono" | — | **Q1** |
| Parent: "más tokens y coste" | departure recorded (E6) | ok |
| Parent: reuse `ErrorBanner` | departure recorded (E7) | ok |
| Parent: 400 `maxHops` → readable message | generic alert only | **Q2** |
| Parent: `maxHops` control "operable por teclado con etiqueta" | label covered; keyboard only claimed | see B2 |

No inherited AC is missing a requirement. Two are questions for the author.

## 3. Missing scenarios

- **Blocking — B4. The re-announcement MUST has no scenario that can fail.**
  - The rule: Change box: "each invalid send SHALL insert that alert as a new element, so assistive technology announces it again".
  - The problem: "An invalid change is not sent" changes the field's text between every send. Changing the text already removes the alert (same requirement: "The mark and the message SHALL go away as soon as the person changes the field's text"), so each send mounts a fresh alert whether or not the send-counter key exists.
  - The result: task 4.3's `not.toBe` assertion passes even without the counter, so it proves nothing about the behaviour it names.
  - Correction: add a step to the scenario in which the person presses Enter twice on the same invalid text («hola»), without editing the field, and the second alert is a different element from the first.
- **Improvable — I2.** Impact-page "Screen 3 frame and navigation": "Going to another project's Screen 3 SHALL start from an empty Screen 3" has no scenario.
- **Improvable — I3.** "Answered report" says "does not move the focus", and "Error alerts" says "the alert SHALL add no tab stop". No scenario asserts either.
  - Add "the focus is on the field" to "The answered report shows…" and to "A rate limit, an API error…".
  - Add a run with an alert to "The tab order of Screen 3 skips the report".
- **Improvable — I4.** Ask-page "Link to the impact screen": "following it SHALL abort a pending question" has no scenario.
  - The mechanism is the existing unmount abort.
  - Add a WHEN step "while a question is pending" and a THEN "the request signal is aborted and no alert is shown".
- **Improvable — I5.** "Cancellation by the caller" (MODIFIED) now covers `impact`. Only the pending-abort case has an impact scenario. The body-read and already-aborted cases do not.
  - Acceptable because `impact()` goes through the same `send`. If so, say that in the requirement text; otherwise add `impact` to "An already-aborted signal sends no request".
- **Improvable — I6.** Task 2.3 adds `riskHeading` under the unit scenario "Hops, resolution, document and history are written in Spanish", but that scenario does not mention risk levels.
  - Either add «Riesgo alto/medio/bajo» to the scenario's WHEN/THEN, or drop `riskHeading` from task 2.3, since "Every risk level is written in words" covers it at page level.

## 4. Ambiguity

None of the target words (fast, easy, secure, efficient, many, appropriate, robust) appears.

- **Improvable — I7.** `design.md` D11 says the alert lines "read acceptably for a report". This is a judgement, not a criterion.
  - Replace with: "The alert's first line stays «No se ha podido obtener la respuesta.» and the rate-limit line keeps «vuelve a preguntar»; both are accepted wording for Screen 3 (P3)".

## 5. Open decisions

- **Blocking — B3. The colour pairs of the new texts are not fixed, and nothing automated checks them.**
  - Design D9 fixes the risk block's pairs. D8 says only "theme pairs only" for `OriginTag`. Nothing fixes the pairs of:
    - the code-styled file spans;
    - «Sin elementos»;
    - the legend;
    - the deterministic line;
    - the history and document lines;
    - texts inside the `bg-canvas` risk block for MEDIUM/LOW.
  - `docs/frontend-standards.md` → «How `test:a11y` is wired» states that axe in jsdom cannot judge contrast. `theme.test.ts` only checks the pairs in the `web-foundation` table.
  - The table allows `#6c757d` (`text-ink-subtle`) "only on white". `text-ink-subtle` on `bg-canvas` is about 4.4:1 and would fail WCAG AA without any test noticing.
  - Correction:
    - In design D8/D15, name the exact text/background utility pair of each new element, using only rows of the `web-foundation` table. Never `text-ink-subtle` on `bg-canvas`.
    - Add to "Answered report" a clause: "every text of the report SHALL use a text/background pair of `web-foundation` → "Theme colours and minimum contrast"".
    - Add a manual check of it to task 11.4.
- **Blocking — B5. Two formats are left to the implementer.**
  - (a) How the parts of an entry are separated. The requirement lists symbol, file, hops, resolution and tag, but not the separator or the spacing. The `li`'s text is what a screen reader reads: without separators it becomes «DiscountServiceapp/Services/DiscountService.php0 saltosexacta[grafo]». Correction: fix the separator in "How a change and the entries of a report are written" (for example parts separated by « · », or by a space with the file in `<code>`), and assert one full `li` `textContent` in "The answered report shows…".
  - (b) Encoding of the project id in the link targets. Task 3.6 says Screen 2's link uses `/p/<encoded id>/impact`. The spec says only `/p/{projectId}/impact`, and Screen 3's «Volver a las preguntas» encoding is unspecified. Correction: in both requirements, state "with the `projectId` percent-encoded as one path segment", as the client does.
- **Improvable — I8.** The space before «%» is a normal space in design D6, but the requirement does not say so. A test will pin it, and `project-display.ts` uses U+00A0 for digit groups. Write "(U+0020)" in the requirement.

## 6. Contradictions inside the change

- **Blocking — B1. The RED of task 8.2 cannot happen.**
  - Task 8.2 asks to "see the stale-document scan fail once with the document text set locally to a non-theme light grey (axe `color-contrast`)".
  - axe in jsdom computes no styles and cannot report `color-contrast` (`docs/frontend-standards.md` → «How `test:a11y` is wired»: "axe in jsdom computes no styles, so it cannot judge colour contrast"). The step either never goes red or gets faked.
  - Correction: use a RED that jsdom axe does detect. For example, render the `<select>` without its `<label>` locally (rules `select-name` / `label`), or give the decorative ⚠ an `<img>` without `alt` (`image-alt`). Record it, and do not commit it.
- **Blocking — B2. "With the keyboard" cannot be tested the way the task says.**
  - The scenario "A valid change is sent trimmed with the selected hops" (run 2) says the person "selects «1» with the keyboard".
  - Task 4.1 implements it with `user.selectOptions`, which is not keyboard operation.
  - jsdom does not change a native `<select>` on arrow keys, and frontend-standards says "Keyboard operation and visible focus are checked by hand in a real browser". The test name would claim something the test does not check.
  - Correction:
    - Reword run 2 to "selects «1» in the list «Saltos del grafo»".
    - Move keyboard operation to the manual scenario "The walkthrough step 4 runs in a real browser". Add to its WHEN "changes «Saltos del grafo» to 1 and to 3 with the arrow keys only and sends", and to its THEN "the section counts change accordingly".
    - Task 11.4 already does this; reference that scenario there.
- **Improvable — I9.** The proposal writes `impact(projectId, body, { signal })`. The `web-foundation` ADDED requirement writes `impact(projectId, body)` and refers to cancellation only indirectly. Align the requirement text: "`impact(projectId, body, options)` where `options.signal` is the caller's signal".

## 7. Contradictions with the project

- **Improvable — I10. The gate test is not extended, contrary to the standards.**
  - `docs/frontend-standards.md` → «How `test:a11y` is wired» says: "A screen that replaces a placeholder on one of these routes is scanned without editing the test; a new route needs its path added." Here, `smoke.a11y.test.tsx` is not edited.
  - D16 justifies this with "OpenSpec cannot rename a scenario inside a MODIFIED requirement". That claim is unverified: a MODIFIED block replaces the whole requirement, scenarios included.
  - Correction, either one:
    - (a) Check the claim with `openspec validate impact-page --strict` on a draft that renames the scenario to "The four routes have no axe violations". If it is valid, add the path to `SCANNED_PATHS` as the standard says.
    - (b) Keep the design, but record it in `design.md` → Follow-ups as a departure from frontend-standards and from the DIS-14 technical context (I1). Task 13.3 must then rewrite the sentence "a new route needs its path added", not only add the new file.
- **Improvable — I11.** The ask-page main spec, "Accessibility of Screen 2", lists Screen 2's tab stops and controls and requires a visible focus on every control. The manual scenario "The focus is visible on every control" names those controls.
  - The new link «Analizar el impacto de un cambio» becomes the last tab stop and a new control. No delta extends that list, and no manual step checks the link's focus outline on Screen 2.
  - Correction: in the ask-page ADDED requirement add "the link SHALL show a visible focus indicator". In task 11.4, check it on Screen 2 too.
- **Improvable — I12.** `docs/frontend-standards.md` §2 says "Service layer: one module per resource". Design D1 keeps `impact()` in `api-client.ts`. There is a precedent (`ask()`) and a reason (the private `send`), but D1 should name the standard it departs from.
- No contradiction found with the `http-impact` contract, the ADRs (merge through the gate matches `docs/adr/20261020-kit-autonomous-mode.md`) or the base branch `final-project-CRN` (`docs/project-context.md` → Branch and ticket conventions).

## 8. Contrast with the real code

- The design matches the code:
  - `send`, `ask()` and `encodeURIComponent` (`packages/web/src/services/api-client.ts:267-361`);
  - `ProjectQueryRoute` keyed by id (`packages/web/src/router.tsx:13-16`);
  - `PageFrame` renders only `banner` and `<main>` (`packages/web/src/components/PageFrame.tsx:22-28`), so a new `nav` prop is needed;
  - `projectHeading` is private in `AskPage.tsx:34-44`;
  - `alertLinesOf` behaves as D11 says (`packages/web/src/components/notice-display.ts:99-140`);
  - the D9 tokens exist in `packages/web/src/index.css:17-33`;
  - the Zod schemas match the hand types D1 lists (`packages/api/src/schemas/impact.ts:22-122`).
- D3's analysis holds:
  - `AskPage.test.tsx:698-728` tabs only eight times;
  - "The result states add no tab stop" filters only the main landmark;
  - so a `nav` after `<main>` leaves the existing tests green.
- **Improvable — I13.** D14 changes `projectHeadingOf` to return `{ title, detail? }`, dropping `placeholder`. `AskPage` must then rebuild «Pregunta sobre el código de <name>» from `detail !== undefined`. Also, `project-display.ts`'s module TSDoc (lines 1-6) describes "how a sample project is written on its card", and the new function imports `SAMPLE_PROJECTS`. Correction:
  - Say in D14 how `AskPage` derives the placeholder.
  - Update the module TSDoc in task 3.1.
- No duplicated abstraction. `ImpactUnknownState` copying `UnknownState`'s structure is justified (D10).

## 9. Task size

- **Improvable — I14.** Task 6.2 creates four components (`OriginTag`, `ImpactSection`, `RiskBanner`, `ImpactReport`) and wires the page. Split it into 6.2a `OriginTag` + `ImpactSection`, and 6.2b `RiskBanner` + `ImpactReport` + page wiring.
- **Improvable — I14.** Task 11.3 bundles five browser checks: unknown, double invalid, 429 interception, API down, and PROJECT_NOT_FOUND. Split it in two: the states from the real API, and the intercepted/stopped API.
- The other tasks fit in one turn.

## 10. Mandatory steps

- Present, labelled and in order:
  - Step 0 heading;
  - 9 Review and Update Existing Tests (MANDATORY);
  - 10 Run Tests and Verify Data State (MANDATORY), with the report path;
  - 11 Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE), with restoration of `query_log` and of `db:seed` in 11.5;
  - 12 End-to-End (MANDATORY if applicable - AGENT MUST EXECUTE);
  - 13 Documentation (MANDATORY);
  - 14 Pre-merge Review last, with the three checks in order, fixes on the same PR, and the archive commit before the merge.
- **Improvable — I15.** Step 0's first item (0.1) is the Linear status, not the branch. Put the branch verification as 0.1 and Linear as 0.2.
- **Improvable — I16.** Step 12 relies on step 11 but does not check persistence ("what the interface shows matches what is stored", `docs/openspec-tasks-mandatory-steps.md` §3 End-to-End item 4). Correction: in 11.2, record that each answered or unknown send through the page added exactly one `query_log` row with capability `impact`. Then 11.5 removes them.
- **Improvable — I17.** Follow-ups P6 (B, DIS-75) and P7 (B, DIS-77) need "a Spanish Linear comment on that ticket" (`docs/project-context.md` → Tracking deferred findings, row B). No task does it. Add it to 13.5.
- **Improvable — I18.** Task 9.2's list of manual scenarios leaves out "The development server serves the three paths" (unchanged, manual). Add it.

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| impact-page: Screen 3 frame and navigation | Screen 3 opens on a sample project without any request | 3.2, 3.3 |
| | Screen 3 of a project outside the sample constant is shown by its id and leads back | 3.4 |
| impact-page: Change box | A valid change is sent trimmed with the selected hops | 4.1, 4.2 (B2) |
| | An invalid change is not sent | 4.3 (B4) |
| | Changing an invalid change clears the mark | 4.4 |
| impact-page: Pending report | Sending again while a report is pending sends no request | 5.1 |
| | A new change replaces the report that was shown | 6.3 |
| | Leaving the page aborts the pending report | 5.2 |
| impact-page: Answered report | The answered report shows its five sections, its origins and its risk | 6.1, 6.2 |
| | An empty section, a stale document and a history entry without pull requests | 6.4 |
| | Texts of the API in the report are shown as text | 6.5 |
| impact-page: Risk | Every risk level is written in words | 6.6 |
| impact-page: How a change and the entries are written | Change length is counted in code points after trimming | 2.1, 2.2 |
| | Hops, resolution, document and history are written in Spanish | 2.3 |
| impact-page: Unknown report | An unknown report says the change anchors nothing | 7.1 |
| impact-page: Error alerts | A rate limit, an API error and an unavailable API are alerted | 7.2 |
| | A failure removes the report that was shown | 7.3 |
| impact-page: Screen reader announcements | The status region announces every outcome | 7.4 |
| impact-page: Accessibility of Screen 3 | Screen 3 has no axe violations in any of its states | 8.2 (B1) |
| | The tab order of Screen 3 skips the report | 8.1 |
| | The walkthrough step 4 runs in a real browser | 11.2–11.4, 14.2 |
| ask-page: Link to the impact screen | Screen 2 links to the impact screen of its project | 3.5, 3.6 |
| web-foundation: Paths (MODIFIED) | An unknown path shows the not-found screen and leads back | existing test, 9.1 |
| | The development server serves the three paths | 11.2 |
| | The development server serves Screen 3 | 11.2, 14.2 |
| web-foundation: Cancellation by the caller (MODIFIED) | four existing scenarios | existing tests, 9.1; the impact case is in 1.5 |
| web-foundation: API types follow the API's schemas (MODIFIED) | A drift between the client types and the API schemas fails the type check | 1.6 |
| | The web does not import the API or the backend | 10.3 (probe) |
| web-foundation: Accessibility gate (MODIFIED) | The three routes have no axe violations | existing test, 9.1 |
| | The impact route has no axe violations | 8.3 |
| | The negative control proves axe runs | existing test |
| | The gate runs in CI instead of warning | existing test, 8.4 |
| web-foundation: Asking for the impact through the API client (ADDED) | An impact report is resolved as received | 1.1, 1.2 |
| | An unknown impact is resolved as received | 1.3 |
| | Impact failures become API or unavailable-API errors | 1.4 |
| | Aborting a pending impact request cancels it, and it has no time limit | 1.5 |

No row is empty. B1, B2 and B4 mark rows whose task cannot prove its scenario as written.

---

## Corrections to apply

### `specs/impact-page/spec.md`

1. **Change box → "A valid change is sent trimmed with the selected hops"** (B2):
   - Replace «selects «1» with the keyboard and presses Enter in the field in the second» with «selects «1» in the list «Saltos del grafo» and presses Enter in the field in the second».
2. **Change box → "An invalid change is not sent"** (B4):
   - In WHEN, after «then «cambiar\u0000descuentos» (with the character U+0000)», add «, then presses Enter again without changing the field».
   - Make THEN state that after that last Enter "exactly one element with role `alert` holds the message and it is a different element from the one shown before that Enter".
3. **"How a change and the entries of a report are written"** (B5a, I8):
   - Add the separator between the parts of an entry. Suggested: «the parts of an entry are separated by « · » (U+00B7 with a space on each side), the origin tag last».
   - Write «co-cambia <n> %» with "a space (U+0020) before «%»".
   - In "The answered report shows…" THEN, assert the full `textContent` of the fourth «Directo» entry, for example «PriceCalculator · app/Services/PriceCalculator.php · 1 salto · exacta · [grafo]».
4. **"Screen 3 frame and navigation"** (B5b): «leads to `/p/{projectId}`» → «leads to `/p/{projectId}` with the `projectId` percent-encoded as one path segment».
5. **"Answered report"** (B3): add the sentence «Every text of the report SHALL use a text/background pair of `web-foundation` → "Theme colours and minimum contrast"; tertiary text (`#6c757d`) only on white.»
6. **"Accessibility of Screen 3" → "The walkthrough step 4 runs in a real browser"** (B2):
   - WHEN: add «changes «Saltos del grafo» to 1 and then to 3 with the arrow keys only and sends each time».
   - THEN: add «the list changes value with the arrow keys and each send shows its report».
   - THEN: add «every text of the report uses a contrast pair of the theme table (checked with the browser's contrast inspector)».
7. **I3:**
   - Add «and the focus is on the field» to the THEN of "The answered report shows…".
   - Add «and the focus is on the field» to the THEN of "A rate limit, an API error and an unavailable API are alerted".
8. **I2:** add a scenario "Another project's Screen 3 starts empty":
   - Given Screen 3 of acme-shop showing the Q2 report;
   - When the path becomes `/p/0b5c7f2e-1d3a-4e6b-8f90-1a2b3c4d5e6f/impact`;
   - Then no level-2 heading is shown, the field «Cambio» is empty, «Saltos del grafo» shows «2», and the status region is empty.
9. **I6:** in "Hops, resolution, document and history are written in Spanish", add to WHEN «the risk levels `HIGH`, `MEDIUM` and `LOW`» and to THEN ««Riesgo alto», «Riesgo medio», «Riesgo bajo»».

### `specs/ask-page/spec.md`

1. **"Link to the impact screen"** (B5b, I11): add «with the `projectId` percent-encoded as one path segment» and «The link SHALL show a visible focus indicator when it receives the focus from the keyboard».
2. **I4:** add a scenario "Following the impact link aborts a pending question":
   - Given `fetch` records the signal and rejects with its reason on abort;
   - When the person presses «¿Cómo se calcula el precio final de un pedido?» and then the link;
   - Then the signal is aborted, the field «Cambio» is shown, and no alert is shown.

### `specs/web-foundation/spec.md`

1. **I9:** in the ADDED requirement, change `impact(projectId, body)` to `impact(projectId, body, options)` «where `options.signal` is the caller's signal».
2. **I5:** in "Cancellation by the caller", either add `impact` to "An already-aborted signal sends no request" ("then `impact` is called with it"), or add the sentence «`impact` shares the request path of `ask`; its pending abort is covered by "Aborting a pending impact request cancels it, and it has no time limit"».

### `design.md`

1. **D8 / D15** (B3): one line per element with its utility pair:
   - `OriginTag`;
   - file `<code>` spans;
   - «Sin elementos»;
   - legend;
   - deterministic line;
   - document and history lines;
   - risk rationale.

   Use only rows of the `web-foundation` table. Write explicitly "never `text-ink-subtle` on `bg-canvas`".
2. **D6** (B5a, I8): the entry separator and «normal space U+0020 before «%»», matching the spec.
3. **D11** (I7): replace "read acceptably for a report" with the wording given in point 4.
4. **D14** (I13): say how `AskPage` derives its placeholder from `{ title, detail? }`, and that the module TSDoc of `project-display.ts` is widened.
5. **D16** (I10): verify the "cannot rename a scenario" claim with `openspec validate` and add the path to `SCANNED_PATHS`. Otherwise keep the claim, and add the departures to Follow-ups (see 6).
6. **D1** (I12): name the departure from frontend-standards §2 "one module per resource".
7. **Follow-ups**, new rows:
   - **P8 (D).** `tests/a11y/smoke.a11y.test.tsx` and `router.test.tsx` are not edited, against the DIS-14 technical context and the frontend-standards sentence "a new route needs its path added"; the sentence is rewritten in 13.3. Use this row only if 5 keeps the design.
   - **P9.** Origin tag without an icon. Departure from DIS-8; awaits Q1.
   - **P10.** Generic alert for `INVALID_IMPACT_REQUEST` / `VALIDATION_ERROR`. Departure from DIS-8; awaits Q2.

### `tasks.md`

1. **4.1** (B2): replace «`user.selectOptions` for the keyboard choice» with «`user.selectOptions` (keyboard operation of the list is validated in 11.4, scenario "The walkthrough step 4 runs in a real browser")».
2. **4.3** (B4): «keep the alert after each send and assert `not.toBe`; the last step presses Enter twice on the same text with no edit in between. As RED, remove the counter `key` locally (not committed) and see that last assertion fail; record it».
3. **8.2** (B1): replace the colour-contrast RED with «As its RED, render the `<select>` without its `<label>` locally (axe `select-name`/`label`; not committed) and see the scan before any send fail; record it in the step 10 report».
4. **6.2** (I14): split into 6.2a (`OriginTag`, `ImpactSection`) and 6.2b (`RiskBanner`, `ImpactReport`, page wiring).
5. **11.3** (I14): split into 11.3a (unknown, double invalid send, PROJECT_NOT_FOUND) and 11.3b (intercepted 429, API stopped).
6. **11.4** (B2, B3, I11):
   - add «the select operated with the arrow keys only, at 1 and 3, the report counts recorded»;
   - add «contrast of each new text pair checked with the browser inspector (≥ 4.5:1)»;
   - add «the Screen 2 link «Analizar el impacto de un cambio» shows its focus outline».
7. **11.2** (I16): «after each send through the page, `query_log` has exactly one more row with capability `impact`; record the counts».
8. **0.1 / 0.2** (I15): swap them, so that the branch verification is 0.1.
9. **9.2** (I18): add "The development server serves the three paths" to the manual exceptions.
10. **3.1** (I13): «update the module TSDoc of `project-display.ts`».
11. **13.3** (I10): rewrite «a new route needs its path added» in `docs/frontend-standards.md` to match the chosen design.
12. **13.5** (I17): «add a Spanish comment on DIS-75 (P6) and on DIS-77 (P7) as destination B, each linking this change».

### Linear

DIS-14: a comment in Spanish. The `[original]` block is not touched; decisions go in `[enhanced]` → «Decisiones del agente» as agent's text.

> *Texto del agente (auditoría de spec, 2026-11-02).* Resultado: CHANGES REQUIRED, 5 hallazgos bloqueantes. (1) El RED de contraste de color con axe no es posible en jsdom; se sustituye por un control sin etiqueta. (2) La selección de «Saltos del grafo» con teclado no se puede probar en RTL; pasa al recorrido en navegador real. (3) Se fijan los pares de color de cada texto nuevo del informe. (4) El escenario de la alerta repetida no comprobaba el reenvío sin editar el campo. (5) Se fijan el separador de las partes de cada entrada y la codificación del id en los enlaces. Desviaciones respecto a DIS-8 pendientes de decisión: la etiqueta de origen sin icono y el mensaje genérico para `INVALID_IMPACT_REQUEST`. Desviaciones respecto al contexto técnico de esta issue: no se edita `smoke.a11y.test.tsx` ni `router.test.tsx` (salvo que se compruebe que OpenSpec permite renombrar el escenario).

DIS-75: comment in Spanish.

> *Texto del agente.* Desde `impact-page` (DIS-14), destino B: el E2E de la Pantalla 3 (`/p/<id>/impact`, informe Q2, `unknown`, errores) queda fuera de DIS-14 y puede añadirse a la suite de Playwright de esta issue.

DIS-77: comment in Spanish.

> *Texto del agente.* Desde `impact-page` (DIS-14), destino B: `packages/web` sigue fuera del `mutate` de Stryker y de `docs:coverage`; los nuevos `impact-display.ts`, `useImpact.ts` y componentes de la Pantalla 3 entran en el alcance de la puerta de mutación y cobertura de esta issue.

---

## Resolution of run 1

*Agent's text (correction round 1, 2026-11-02, autonomous run, `docs/AUTONOMOUS-RUN.md` §6).* Every
blocking and improvable finding was applied to the change artifacts; the two questions for the author were
decided by the agent as lead engineer and recorded in `design.md` → Follow-ups. `openspec validate
impact-page --strict` passes after the edits.

### Questions for the author

| Finding | Resolution |
|---|---|
| Q1 — origin tag «texto + icono» | Decided by the agent: option (a), text only. DIS-14 AC 1 asks for the text; the text already avoids colour alone; an icon widens scope with no accessibility gain. Recorded as a departure from DIS-8 in design D8 and Follow-ups P9 (D), and listed for the PR in task 14.1. |
| Q2 — readable message for `INVALID_IMPACT_REQUEST` / `VALIDATION_ERROR` | Decided by the agent: option (a), generic alert through `alertLinesOf` unchanged. The UI cannot produce an out-of-range `maxHops` nor an invalid change, and DIS-14 AC 4 accepts `alertLinesOf`. Recorded in design D11 and Follow-ups P10 (D), listed for the PR in task 14.1. |

### Blocking findings

| Finding | Resolution |
|---|---|
| B1 — RED of task 8.2 impossible in jsdom | Fixed. Task 8.2's RED is now the `<select>` rendered without its `<label>` (axe `select-name` / `label`). Contrast is fixed per element in design D15 and checked by hand in 11.4 (Follow-ups P12, A). |
| B2 — "with the keyboard" not testable in RTL | Fixed. Run 2 of "A valid change is sent trimmed with the selected hops" now says «selects «1» in the list «Saltos del grafo»». Keyboard operation moved to "The walkthrough step 4 runs in a real browser" (arrow keys at 1 and 3, counts change). Tasks 4.1 and 11.4 reference that scenario (Follow-ups P13, A). |
| B3 — colour pairs of the new texts not fixed | Fixed. Design D15 gains a table with the text/background utilities and the `web-foundation` row of every new element, stating "never `text-ink-subtle` on `bg-canvas`". "Answered report" gains the clause on theme pairs. "The walkthrough step 4…" and task 11.4 add the manual contrast check. |
| B4 — re-announcement MUST had no failing scenario | Fixed. "An invalid change is not sent" ends with Enter pressed again on the unchanged text, and its THEN requires a different alert element after it. Task 4.3's RED removes the counter `key` and sees that assertion fail. |
| B5a — entry separator unspecified | Fixed. "How a change and the entries of a report are written" fixes « · » (U+00B7 with spaces), tag last. "The answered report shows…" asserts the exact `textContent` of the fourth and fifth «Directo» entries. Design D6 and task 2.3 match. |
| B5b — encoding of the project id in links | Fixed. "Screen 3 frame and navigation" and ask-page "Link to the impact screen" say "with the `projectId` percent-encoded as one path segment". Tasks 3.4 and 3.6 name `encodeURIComponent`. |

### Improvable findings

| Finding | Resolution |
|---|---|
| I1 — departures from the DIS-14 technical context not recorded | Fixed together with I10. Recorded in Follow-ups P8 (D) and design D16. |
| I2 — "another project starts empty" without scenario | Fixed. New scenario "Another project's Screen 3 starts empty", task 3.4b. |
| I3 — focus and tab stop not asserted | Fixed. "The answered report shows…" and "A rate limit, an API error…" assert the focus on the field. "The tab order of Screen 3 skips the report" gains a run with the unavailable-API alert (task 8.1). |
| I4 — abort of a pending question by the link without scenario | Fixed. New ask-page scenario "Following the impact link aborts a pending question", task 3.7. |
| I5 — cancellation cases of `impact` | Fixed with the second option: "Cancellation by the caller" states that `impact` shares the `send` path of `ask`, and names the scenario that covers its pending abort. |
| I6 — `riskHeading` outside its unit scenario | Fixed. "Hops, resolution, document and history are written in Spanish" adds the three risk levels, and the requirement names the risk headings. |
| I7 — "read acceptably" in D11 | Fixed with the suggested wording, which points to P3. |
| I8 — space before «%» | Fixed. The requirement, the unit scenario and design D6 say U+0020, and task 2.3 asserts it by code point. |
| I9 — `impact()` signature | Fixed. The ADDED requirement, the proposal and task 1.2 write `impact(projectId, body, options)` with `options.signal`. |
| I10 — gate test not extended | Decided by the agent after checking option (a). A draft renaming the scenario to "The four routes have no axe violations" fails `openspec validate impact-page --strict`: «MODIFIED … omits scenario(s) the current spec still has … archive refuses to drop them». The D16 claim therefore holds, and option (a) is not viable as worded. The change takes option (b) and goes further: "The impact route has no axe violations" becomes a new `it` appended to `tests/a11y/smoke.a11y.test.tsx`, so the gate file scans all four routes. `SCANNED_PATHS` and `router.test.tsx` stay unchanged. Recorded in design D16 and Follow-ups P8 (D). Task 13.3 rewrites the frontend-standards sentence. The web-foundation requirement text, the proposal and tasks 8.3 and 9.1 are aligned. |
| I11 — Screen 2 link focus | Fixed. The ask-page requirement requires a visible focus indicator on the link, and task 11.4 checks it on Screen 2. |
| I12 — D1 vs "one module per resource" | Fixed. D1 names the departure, recorded as Follow-ups P11 (D). |
| I13 — placeholder derivation and module TSDoc | Fixed. D14 says how `AskPage` derives its placeholder from `detail`, and widens the module TSDoc. Task 3.1 includes both. |
| I14 — task 6.2 too large | Fixed. Split into 6.2a (`OriginTag`, `ImpactSection`) and 6.2b (`RiskBanner`, `ImpactReport`, wiring). |
| I14 — task 11.3 too large | Fixed. Split into 11.3a (real API: unknown, double invalid send, PROJECT_NOT_FOUND) and 11.3b (intercepted 429, API stopped). |
| I15 — Step 0 order | Fixed. 0.1 is the branch verification and 0.2 the Linear status. |
| I16 — persistence not checked | Fixed. Task 11.2 checks one more `query_log` row with capability `impact` per answered or unknown send, and 12.1 records it. 11.5 already restores the state. |
| I17 — destination-B comments on DIS-75 and DIS-77 | Fixed. Task 13.5 adds the Spanish comments on DIS-75 (P6) and DIS-77 (P7). |
| I18 — 9.2 manual exceptions | Fixed. "The development server serves the three paths" is added to the manual exceptions. |

---

## Run 2 (2026-11-02)

APPROVED

**Questions for the author.** None open. In run 1 the agent decided Q1 (origin tag as text only, P9) and Q2 (generic alert for `INVALID_IMPACT_REQUEST` / `VALIDATION_ERROR` / `INTERNAL`, P10), both marked as the agent's text. Both decisions agree with DIS-14 AC 1 and AC 4. They are recorded as departures from DIS-8 in `design.md` → Follow-ups and listed for the PR in task 14.1. Neither contradicts the ticket or the project, so they are accepted.

*Audit run 2 (2026-11-02).*

**Inputs read:**
- every artifact of `openspec/changes/impact-page/`;
- DIS-14 and its three comments, and the parent DIS-8 (Linear);
- `docs/base-standards.md` and `docs/openspec-tasks-mandatory-steps.md`;
- the main specs `web-foundation`, `ask-page`, `http-impact` and `impact`;
- `docs/frontend-standards.md` → «How `test:a11y` is wired»;
- the code the design builds on.

The run-1 report and its resolution section were used as context.

---

## 1. Scope against the ticket

Clean. Everything follows from the DIS-14 DoD, its enhanced ACs 1–5 and decisions D1–D8:

- **Code:** the route, the client call, the components, the Screen 2 link (AC 5), the `PageFrame` `nav` prop and the `projectHeadingOf` move (minimal refactors that make the screen possible).
- **Process steps:** the docs (named in the ticket's technical context) and `prompts.md` and `project-context.md` (required by the project's workflow).

Nothing widens the change to DIS-8 as a whole. The departures from the DIS-14 technical context (`router.test.tsx`, `SCANNED_PATHS`) are now recorded in P8 with the `openspec validate` evidence.

## 2. Inherited acceptance criteria

| AC | Requirement → scenario | Status |
|---|---|---|
| DIS-14 AC1 | Change box → "A valid change is sent trimmed with the selected hops"; Answered report → "The answered report shows its five sections, its origins and its risk" | covered |
| DIS-14 AC2 | "An empty section, a stale document and a history entry without pull requests"; hops 1/3 in "A valid change is sent…"; keyboard operation in "The walkthrough step 4 runs in a real browser" | covered |
| DIS-14 AC3 | "An unknown report says the change anchors nothing" | covered |
| DIS-14 AC4 | "An invalid change is not sent"; "A rate limit, an API error and an unavailable API are alerted"; "A failure removes the report that was shown" | covered |
| DIS-14 AC5 | Pending report (three scenarios); frame scenarios; ask-page "Screen 2 links…" and "Following the impact link aborts…"; axe in 8 states; real-browser walkthrough | covered |
| DIS-8: tag «texto + icono» | text only | departure P9 (D), accepted |
| DIS-8: tokens and cost | no `usage` in the API | departure E6, accepted |
| DIS-8: reuse `ErrorBanner` | `AskErrorNotice` | departure E7, accepted |
| DIS-8: 400 `maxHops` as a readable message | generic alert | departure P10 (D), accepted |
| DIS-8: `maxHops` keyboard-operable and labelled | label in RTL, keyboard by hand (P13) | covered |

No inherited AC is missing a requirement.

## 3. Missing scenarios

- **Improvable — I1. A page-level time limit could be added without any test failing.**
  - The rule: "Pending report" says "The page SHALL NOT set a time limit of its own."
  - What covers it: only the client scenario "Aborting a pending impact request cancels it, and it has no time limit". It pins `impact()`, not `useImpact`.
  - The gap: a timer added in the hook or the page would pass every test.
  - Correction, either one:
    - Add to "Sending again while a report is pending sends no request" (or a new scenario): "after the clock advances 60 000 ms the text «Calculando impacto…» is still shown and there is no element with role `alert`".
    - Or state in the requirement that it is covered by the client scenario and that `useImpact` arms no timer, and accept the gap.
- **Improvable — I2. "Unknown report … add no tab stop" has no scenario.**
  - "The tab order of Screen 3 skips the report" has two runs: the Q2 report and the unavailable-API alert.
  - Correction: add a third run "showing the unknown state of «mejorar el rendimiento general»". Task 8.1 then says "three runs".

## 4. Ambiguity

Clean. Searching the change for the target words (fast, easy, secure, efficient, many, appropriate, robust) and for "acceptably" finds only `"too many requests"`, which is a literal API message inside a JSON body. The run-1 phrase "read acceptably" is gone from D11.

## 5. Open decisions

No blocking open decision. The run-1 blockers B3 (colour pairs, design D15 table) and B5 (separator « · » with an exact `textContent`, `projectId` percent-encoded as one path segment) are fixed in the requirement, the scenario and the design.

- **Improvable — I3. "The element the person used last" is not named.**
  - Where: "A valid change is sent trimmed with the selected hops", THEN, "the focus is on the element the person used last". A test will pin this.
  - Correction: name the element per run: "on the button «Analizar» in the first run and on the field «Cambio» in the second and third".
- **Improvable — I4. The field's placeholder is not fixed.**
  - D14 removes `placeholder` from the shared shape. D13 gives visible labels, but neither says whether the field «Cambio» has a placeholder or what it says. The wireframe `images/pantalla-3-impacto.svg` may show one.
  - Correction: add one sentence to D13, either "the field has no placeholder" or the exact text.

## 6. Contradictions inside the change

Clean. Proposal, design, specs and tasks agree on:
- the signature `impact(projectId, body, options)`;
- the four gate paths with a separate `it`;
- `SCANNED_PATHS` keeping three paths;
- the eight axe states;
- the wording of every label;
- the status texts;
- the reuse of `alertLinesOf`.

Two notes:
- Design Goals ("every existing requirement and test of Screen 2 unchanged except …") and D14 ("no Screen 2 test changes") read as being about the refactor. Two tests are still appended to `AskPage.test.tsx`, and tasks 3.5, 3.7 and 9.1 say so explicitly. Not a contradiction.
- **Improvable — I5. Task 11.1 and task 11.2 disagree on which sends write a row.**
  - Task 11.1 says "every answered `/impact` writes an `impact` row".
  - Task 11.2 counts a row per answered *or unknown* send, which is right: `openspec/specs/impact/spec.md` → "A no-anchor call writes one impact row".
  - Correction: align 11.1 to "every answered or unknown `/impact` writes an `impact` row".

## 7. Contradictions with the project

Clean.

- `web-foundation` (MODIFIED):
  - Every scenario of the four main-spec requirements is kept by name (`openspec/specs/web-foundation/spec.md:29-44, 172-221, 301-319`).
  - The only edits are additive wording (the explicit three paths, the second negative control, "every client call").
- `ask-page`: the ADDED requirement keeps "Accessibility of Screen 2" (`openspec/specs/ask-page/spec.md:667-720`) intact, because the link is the last tab stop. "The tab order follows question, suggestions and evidence" presses Tab only eight times, and "The result states add no tab stop" filters only the main landmark.
- `http-impact`: the 5–500 code-point rule (`openspec/specs/http-impact/spec.md:21`) matches `validChange`.
- `docs/frontend-standards.md:74`: the departure from "a new route needs its path added" is recorded (P8), and task 13.3 rewrites the sentence. §2 "one module per resource" is recorded (P11).
- Branch base `final-project-CRN`, merge through the gate, and Spanish for PRs and Linear match `docs/project-context.md` and `docs/base-standards.md` §2.

## 8. Contrast with the real code

The design matches the code:

- `PageFrame` renders only the banner and `<main>`, so the new optional `nav` prop is needed (`packages/web/src/components/PageFrame.tsx:22-28`).
- `ProjectQueryRoute` keyed by `projectId` is the template for `ProjectImpactRoute` (`packages/web/src/router.tsx:13-16`).
- `projectHeading` is private, with `placeholder` in its shape, which D14 replaces with `detail !== undefined` (`packages/web/src/pages/AskPage.tsx:24-44`).
- The `role="status"` paragraph comes after `ResultArea`, the pattern of D17 (`AskPage.tsx:164-167`).
- `alertLinesOf` and `caseLinesOf` give exactly the lines the error scenario expects: `RATE_LIMITED`, `PROJECT_NOT_FOUND`, the default `[]` for `INVALID_IMPACT_REQUEST` and `INTERNAL`, and the unavailable case (`packages/web/src/components/notice-display.ts:96-140`).
- Every token of the D15 table exists (`packages/web/src/index.css:17-33`).
- The hand-declared types of D1 match the Zod schemas (`packages/api/src/schemas/impact.ts:22-122`):
  - `ImpactDoc` is a union of stale and not-stale;
  - `ImpactTest` has `symbol`, `file` and `origin`;
  - `ImpactHistory` has `prs: number[]`.
- The gate file has a `describe('Accessibility gate on the real routes')`, so task 8.3 can append its `it` there (`tests/a11y/smoke.a11y.test.tsx:15, 22-53`).
- No existing web test enumerates every link or every landmark of the document, so a `nav` after `<main>` breaks none of them (grep of `getAllByRole('link'` / `navigation` in `packages/web/src` and `tests/a11y`).
- **Improvable — I6. Task 11.3a's PROJECT_NOT_FOUND check does not name the change it sends.**
  - Task 11.3a says "open `/p/0b5c7f2e-…/impact` with the API up and send a change → «Código: PROJECT_NOT_FOUND.»".
  - The impact use case answers `unknown`/`no-anchor` with no error for a change without search terms in a project that does not exist (`openspec/specs/impact/spec.md:521-525`; `ProjectNotFound` only "whenever `change` has at least one search term", line 56-57).
  - Correction: name the change, «cambiar los descuentos de DiscountService».

No abstraction is duplicated. `ImpactUnknownState` and `useImpact` copy their templates on purpose (D10, design Non-Goals).

## 9. Task size

Clean. The run-1 splits (6.2a/6.2b, 11.3a/11.3b) are in place. Task 3.3 is the largest code task (frame `nav`, page shell, first `ChangeBox`, route), but each piece is a few lines over an existing template, and it fits one turn. Task 11.2 is a long browser pass but a single flow.

## 10. Mandatory steps

Clean.

- Step 0 is first, and 0.1 is the branch.
- Steps 9, 10, 11, 12, 13 and 14 are present, labelled `(MANDATORY)` / `AGENT MUST EXECUTE` as required.
- Step 10 names the report path with the template.
- Step 11 captures the `query_log` baseline (11.1) and restores it (11.5), including `db:seed`.
- Step 12 records persistence through the `query_log` counts.
- Step 14 is last: the three checks in order, fixes on the same PR, the archive commit before the merge through the gate.
- `scripts/dev-processes.mjs stop` closes 10.6 and 11.5.
- Every command named exists in the root `package.json`: `test:a11y`, `typecheck`, `lint`, `lint:architecture`, `docs:coverage`, `up`, `db:seed`, `cli`.

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| impact-page: Screen 3 frame and navigation | Screen 3 opens on a sample project without any request | 3.2, 3.3 |
| | Screen 3 of a project outside the sample constant is shown by its id and leads back | 3.4 |
| | Another project's Screen 3 starts empty | 3.4b |
| impact-page: Change box | A valid change is sent trimmed with the selected hops | 4.1, 4.2 |
| | An invalid change is not sent | 4.3 |
| | Changing an invalid change clears the mark | 4.4 |
| impact-page: Pending report | Sending again while a report is pending sends no request | 5.1 |
| | A new change replaces the report that was shown | 6.3 |
| | Leaving the page aborts the pending report | 5.2 |
| impact-page: Answered report | The answered report shows its five sections, its origins and its risk | 6.1, 6.2a, 6.2b |
| | An empty section, a stale document and a history entry without pull requests | 6.4 |
| | Texts of the API in the report are shown as text | 6.5 |
| impact-page: Risk | Every risk level is written in words | 6.6 |
| impact-page: How a change and the entries of a report are written | Change length is counted in code points after trimming | 2.1, 2.2 |
| | Hops, resolution, document and history are written in Spanish | 2.3 |
| impact-page: Unknown report | An unknown report says the change anchors nothing | 7.1 |
| impact-page: Error alerts | A rate limit, an API error and an unavailable API are alerted | 7.2 |
| | A failure removes the report that was shown | 7.3 |
| impact-page: Screen reader announcements of Screen 3 | The status region announces every outcome | 7.4 |
| impact-page: Accessibility of Screen 3 | Screen 3 has no axe violations in any of its states | 8.2 |
| | The tab order of Screen 3 skips the report | 8.1 |
| | The walkthrough step 4 runs in a real browser | 11.2, 11.3a, 11.3b, 11.4, 14.2 |
| ask-page: Link to the impact screen | Screen 2 links to the impact screen of its project | 3.5, 3.6 |
| | Following the impact link aborts a pending question | 3.7 |
| web-foundation: Paths (MODIFIED) | An unknown path shows the not-found screen and leads back | existing test, 9.1 |
| | The development server serves the three paths | 11.2 |
| | The development server serves Screen 3 | 11.2, 14.2 |
| web-foundation: Cancellation by the caller (MODIFIED) | Aborting a pending question cancels the request | existing test, 9.1 |
| | Aborting a pending health check cancels the request | existing test, 9.1 |
| | Aborting while the body is read rejects with the caller's reason | existing test, 9.1 |
| | An already-aborted signal sends no request | existing test, 9.1 |
| web-foundation: API types follow the API's schemas (MODIFIED) | A drift between the client types and the API schemas fails the type check | 1.6 |
| | The web does not import the API or the backend | 10.3 (probe) |
| web-foundation: Accessibility gate on the real routes (MODIFIED) | The three routes have no axe violations | existing test, 9.1 |
| | The impact route has no axe violations | 8.3 |
| | The negative control proves axe runs | existing test, 9.1 |
| | The gate runs in CI instead of warning | existing test, 8.4 |
| web-foundation: Asking for the impact of a change through the API client (ADDED) | An impact report is resolved as received | 1.1, 1.2 |
| | An unknown impact is resolved as received | 1.3 |
| | Impact failures become API or unavailable-API errors | 1.4 |
| | Aborting a pending impact request cancels it, and it has no time limit | 1.5 |

No row is empty. Every run-1 blocker (B1, B2, B4) now has a task whose RED can actually fail:
- 8.2 uses an unlabelled `<select>`, a rule axe detects in jsdom;
- keyboard operation is checked in 11.4;
- 4.3 presses Enter twice on unchanged text, and the counter `key` is removed as its RED.

---

## Corrections to apply

All six are improvable and none blocks the apply. They can be applied in one pass before task 1.1, or recorded as destination D in `design.md` → Follow-ups.

### `specs/impact-page/spec.md`

1. **I1 — Pending report.** Add a scenario, or extend "Sending again while a report is pending sends no request":
   - GIVEN: "`fetch` replaced by a double that never answers, and a clock that the test advances".
   - WHEN: "the person sends «cambiar los descuentos de DiscountService» and the clock advances 60 000 ms".
   - THEN: "the text «Calculando impacto…» is still shown, the only element with role `status` holds «Calculando impacto…», and there is no element with role `alert`".
2. **I2 — Accessibility of Screen 3 → "The tab order of Screen 3 skips the report".**
   - GIVEN: change «in two runs» to «in three runs: showing the Q2 report, showing the alert of a `fetch` that rejects with a `TypeError`, and showing the unknown state of `{"status":"unknown","reason":"no-anchor"}`».
   - THEN: «in each run».
3. **I3 — Change box → "A valid change is sent trimmed with the selected hops", THEN.** Replace «the focus is on the element the person used last» with «the focus is on the button «Analizar» in the first run and on the field «Cambio» in the second and third».

### `design.md`

4. **I4 — D13.** Add one sentence: «The field «Cambio» has no placeholder (the visible label names it)», or the exact placeholder text, so the implementer does not choose it.

### `tasks.md`

5. **I5 — 11.1.** Change «every answered `/impact` writes an `impact` row» to «every answered or unknown `/impact` writes an `impact` row (`impact` → "A no-anchor call writes one impact row")».
6. **I6 — 11.3a.** Change «send a change → «Código: PROJECT_NOT_FOUND.»» to «send «cambiar los descuentos de DiscountService» (a change with search terms; one without them answers `unknown` for a missing project) → «Código: PROJECT_NOT_FOUND.»».
7. **I1, I2.** If the scenarios above are added:
   - 5.1 (or a new 5.3): "RED → GREEN with fake timers; it may pass at once: then see it fail by adding a local 30 s timeout in `useImpact`, not committed, and record it".
   - 8.1: "three runs".

### Linear

DIS-14: one comment in Spanish. The `[original]` block is not touched.

> *Texto del agente (auditoría de spec, ronda 2, 2026-11-02).* Resultado: APPROVED, 0 hallazgos bloqueantes. Los cinco bloqueantes de la ronda 1 están corregidos y las decisiones P8–P13 se aceptan; no contradicen el ticket ni el proyecto. Quedan seis mejoras no bloqueantes, que se aplican en los artefactos del cambio antes de la tarea 1.1:
> 1. Un escenario de página que compruebe que no hay límite de tiempo propio.
> 2. Una tercera pasada del orden de tabulación con el estado `unknown`.
> 3. Nombrar el elemento con foco en cada pasada de «A valid change is sent…».
> 4. Fijar si el campo «Cambio» lleva placeholder.
> 5. En la tarea 11.1, también el `unknown` escribe una fila `impact` en `query_log`.
> 6. En la tarea 11.3a, enviar un cambio con términos de búsqueda para obtener `PROJECT_NOT_FOUND`.
