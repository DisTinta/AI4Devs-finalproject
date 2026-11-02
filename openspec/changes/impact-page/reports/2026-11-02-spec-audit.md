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
