CHANGES REQUIRED

Spec audit of `openspec/changes/golden-independent-review` (Linear DIS-33, parent DIS-20). First audit, 2026-10-28.

**Inputs read.** `proposal.md`, `design.md`, `specs/golden-answers/spec.md`, `tasks.md`. DIS-33 (description `[original]`, `[reality-map]`, `[enhanced]` and its 5 comments), the parent DIS-20 and its 1 comment. `docs/base-standards.md`, `docs/openspec-tasks-mandatory-steps.md`, `docs/project-context.md` (l. 1204–1206), `docs/AUTONOMOUS-RUN.md` (l. 132), `openspec/specs/golden-answers/spec.md`, `packages/cli/src/cache/golden-file.ts`, `scripts/annotation-agreement.mjs`, `seeds/cache/*.json`, `.claude/workflows/autonomous-sdd.js` (`runPanel`, l. 143–155).

## Questions for the author

- **Q-A (AC 4 / DoD / R9 against D5).** The DoD of DIS-33 says "Las incorrectas se regeneran o se retiran". The enhanced AC 4 and R9 add that no versioned golden may keep a final verdict of `incorrect`, and that `golden-reviews.spec.ts` fails if one does. Design D5 changes this: an `incorrect` golden stays served, without signatures, and a successor ticket created in task 6.5 handles it. Two options: (a) accept that this DoD bullet moves to a successor ticket and say so in the ticket; or (b) keep retirement in this change by adding a conditional retirement group to `tasks.md`. Option (b) can name its targets ahead of time because the set is closed: `GOLDEN_PROJECTS`, the main-spec requirement "Golden questions", `fixtures/README.md`, `tests/unit/seed/golden-questions.spec.ts`, `tests/unit/seed/suggested-questions-coherence.spec.ts`, `packages/web/src/pages/AskPage.test.tsx`. This is a scope decision, so I am not settling it here.
- **Q-B (DoD wording "el veredicto").** The DoD says each golden carries in its `review` the signature "y el veredicto". R3/D3 keeps the verdict out of `reviews` because the schema is strict, and puts it in the report and the panel files. Do you accept that "el veredicto" is met by the report, joined to the entry by the test?
- **Q-C (scope widening).** Three things in this change go beyond the author's `[original]` ticket. (1) The three acme-shop golden answers: these come from an agent decision (DIS-32 E7), not from the original task-api title and DoD. (2) Two panelists plus a resolver, where the original asks for one reviewer. (3) The TSDoc edit of `golden-file.ts`. Please confirm all three are in scope.

## 1. Scope against the ticket

- **Improvable.** The scope additions listed in Q-C are justified in the `[enhanced]` part and in DIS-33 comment 8ae2c817 (E7). However, they are agent text, not the author's. They are listed so the human can cut them. Everything else in the proposal, specs and tasks follows from the sub-issue. Nothing widens to DIS-20's user story about the TypeScript analyzer.
- **Note.** Task 6.5 creates new Linear issues. Under §7.1 the change itself may plan a destination-B follow-up, but here it is used to carry a DoD bullet out of the change (see Q-A).

## 2. Inherited acceptance criteria

DIS-20's own criteria (analyzer, empty core diff, secret redaction, seed, type errors) are not inherited by DIS-33's DoD. Only the sub-issue's DoD and its enhanced AC 1–5 bind this change.

- **B1 — blocking. AC 1 has no requirement and no scenario.** AC 1 requires that the criterion is committed before the input and is not changed afterwards. Tasks 1.2 and 8.3 and design D9 implement it. The delta, however, has no SHALL for: the order of the two commits, the criterion staying unchanged, the `## Criterion` text equalling the Criterion block of the Panel group, or panel files staying unedited after their commit. The last one is a SHALL in "Panel outputs…" with no scenario. Correction: add a requirement plus scenarios (see Corrections, spec.md §R-new). The verbatim-equality part is checked by a test. The git order and immutability parts are explicitly verified in the step 8 report (D9 gives the reason: shallow clones). Update task 7.2 accordingly.
- **B2 — blocking (pending Q-A). AC 4 is contradicted.** AC 4 and R9 ("ninguna entrada con veredicto final `incorrect`") have no requirement. The delta requirement "Signatures of the reviewed golden answers" specifies the opposite: the entry stays, unsigned, and is listed under `## Pending`. Under option (a), Q-A must be answered and recorded in the ticket, and the design Follow-ups must mark the DoD bullet as moved, with the author's decision. Under option (b), add a requirement "An incorrect golden answer is retired" with a scenario, plus the conditional tasks.
- **B3 — blocking. AC 3 pins `agent:claude-opus-5-5` and `agent:claude-sonnet-5-5`; the spec does not.** The spec only says `agent:<model of panelist N>`, where `model` is "the panelist's model id, non-empty" and is free text written by the panelist. A panelist could write `opus`, `Claude Opus 5.5` or `claude-opus-5-5`, and the signature would follow. That breaks AC 3 and the DIS-34 precedent (`docs/project-context.md` l. 1204: `agent:claude-opus-5-5`). Correction: the spec requires `model` to match `^claude-[a-z]+-[0-9]+(-[0-9]+)*$`, and the Panel group tells each panelist to write its exact model id (`claude-opus-5-5` for panelist 1, `claude-sonnet-5-5` for panelist 2). Otherwise the ticket's AC 3 must be amended.
- **B4 — blocking. AC 5 is only partly covered.** AC 5 requires `## Panel` to state the models and the allowed and forbidden sources, and `## Limitations` to state two specific points. The requirement "Golden review report" only requires the `## Panel` heading. Its second scenario checks neither the content of `## Panel` nor that of `## Limitations`. Correction: see Corrections, spec.md "Golden review report".
- AC 2 is covered: `overtyped` is a documented refinement (D4) and the Panel group says it prevails. AC 3's "`verify` prints 3/3" has no delta scenario, but it is existing behaviour guarded by the main spec and verified in task 8.4. That is improvable only: name it in the "Signatures" requirement as "and nothing `verify` reads changes".

## 3. Missing scenarios

- **B5 — blocking. The rejection path of the panel-output validation has no scenario.** The requirement "Panel outputs of the golden review" has several MUST rules: verdict equal to the derived one, `sourcesRead` with no forbidden source and no directory or glob, one judgement per statement, a valid citation per statement and per `notes`, distinct models other than the generator. D7 makes rejection the trigger that stops the ticket. Yet both scenarios only assert that the real files are accepted. A validator that accepts everything passes them, and task 5.1 ("RED/GREEN") can never be seen red. That conflicts with base-standards §1 (TDD: see it fail). Correction: add the scenario "Invalid panel outputs are rejected", built in the test from a copy of a valid output, one defect at a time, and change 5.1 into a RED step (synthetic invalid cases fail first) followed by GREEN.
- The resolution's `sourcesRead` is required by the spec but no scenario checks it (folded into B6).
- `## Limitations` content (folded into B4).
- Clean otherwise: the input projection, signatures (correct/partial and incorrect) and report figures each have a scenario.

## 4. Ambiguity

- **Improvable.** `tasks.md` 6.3: "how many items went to the resolver". Replace with "`Resolved by the resolver: <k> of 7`" so the line is parseable.
- **Improvable.** `tasks.md` Panel group, Criterion: "Loose wording that is not false is noted, not an error". "Loose" is not measurable. Replace with "A statement that is true against the code but imprecise (for example it lists a route twice) is judged `true` and the imprecision is noted in `notes`".
- No occurrence of fast, easy, secure, efficient, appropriate or robust.

## 5. Open decisions

- **B6 — blocking. `sourcesRead` validation is undecided, and the change contradicts itself on it.** There are four problems.
  - The spec says each entry is "the repository-relative path of every file read". The Panel group allows the literal `linear:DIS-33/description`, which is not a path.
  - The spec says "none of them a forbidden source of the Panel group". The Panel group defines forbidden as "everything not in the allowlist", so the check is an allowlist check. Task 5.1, however, lists a denylist subset (`fixtures/README.md`, `seeds/`, `packages/`, …).
  - The resolver has a wider allowlist (the two panelist outputs, `docs/AUTONOMOUS-RUN.md`), but the spec has no resolver allowlist and no scenario checks the resolution's `sourcesRead`.
  - Whether the fixture exclusions (`README.md`, `docs/**`, `node_modules/**`) are checked is not stated.

  Correction: the spec fixes an allowlist check for both roles. Panelists: the exact files plus the prefixes `fixtures/task-api/` and `fixtures/acme-shop/` minus their `README.md`, `docs/` and `node_modules/`, plus the literal `linear:DIS-33/description`. Resolver: the panelist allowlist plus the two panelist outputs and `docs/AUTONOMOUS-RUN.md`. Task 5.1 then cites "the allowlist of the spec", not a denylist. This mirrors the precedent `scripts/annotation-agreement.mjs` l. 62–79.
- **B7 — blocking. Citation grammar and output strictness are undefined, and a test will pin both.**
  - (a) Citation: which characters a path may contain and which extensions; whether a line range (`:15-31`, the shape the input's evidence uses) is valid; how citations are extracted from the free-text `notes` and `justification`. The DIS-80 regex accepts only `.php|.ts` (`scripts/annotation-agreement.mjs` l. 82); acme-shop has `.blade.php`, `.json` and `.md` files.
  - (b) Strictness: whether extra keys in an output, an item, a statement judgement or a resolution item are rejected. A rejection stops the ticket under D7, so the panelists must know.

  Correction: state in the spec and the Panel group: "a citation is `fixtures/<project>/<path>:<line>`, matched by `/fixtures\/(task-api|acme-shop)\/([A-Za-z0-9_.\/-]+):([0-9]+)/g`; ranges are not citations (cite the first line); every object has exactly the keys listed, and any other key rejects the output".
- **B8 — blocking. The report's rendering is undecided, and the test parses it.** The spec does not fix:
  - whether verdict cells are bare `correct` or backticked;
  - whether `Percent agreement` is compared as text (`100.0%` versus `100%`) or as a number;
  - whether `Cohen's kappa` is text with three decimals (`0.500` versus `0.5`) or a number;
  - the position of `## Pending` in the section order (task 6.3 puts it before `## Limitations`; the spec says only "plus");
  - the content of a `## Pending` line (project, id, successor ticket id format);
  - the content of the `Errors` cell (e.g. `none`, or `S2 unverifiable; S4 overtyped`).

  Correction: see Corrections, spec.md "Golden review report".

## 6. Contradictions inside the change

- The `sourcesRead` contradictions between spec and Panel group and between spec and task 5.1 are counted under B6.
- **Improvable.** The Panel group's "Agreement measure" says the figures are "computed after this group (task 6.2)". Task 6.2 is the signatures; the report's agreement is written in task 6.3. Change it to "task 6.3".
- **Improvable.** Delta scenario "The panel input projects…" forbids the keys `status`, `excerpt`, `confidence` and `verification` as bare words in the file text. Task 2.1 forbids `"status"` with quotes but `excerpt`, `confidence` and `verification` bare. The current statement texts do not contain these words (checked with grep on `seeds/cache`). Still, a bare-word check can fire on answer text, for example a Q3 statement mentioning the `status` field. Align both to quoted keys followed by a colon (`"excerpt":`, `"status":`, …) plus `sha256:`.
- **Improvable.** D5 risk "An `incorrect` golden stays served by the demo" contradicts R9 in the Follow-ups table, where R9 is described as "Delta … signatures, report" without its "no `incorrect` entry" clause. Resolve it with Q-A.

## 7. Contradictions with the project

- `docs/project-context.md` l. 1204–1206 ("the author signs a sample") is contradicted by design, and task 11.2 updates it. That is correct.
- The agent merging in task 13.7 is allowed by `docs/adr/20261020-kit-autonomous-mode.md` (l. 43) and `docs/AUTONOMOUS-RUN.md` l. 247.
- The agent-written PR "why" in task 12.1 is the documented exception in `docs/AUTONOMOUS-RUN.md` l. 132.
- The delta only ADDs requirements. It does not contradict "Golden file format" (l. 385–413) or "Partial regeneration" (l. 348–361) of `openspec/specs/golden-answers/spec.md`. Clean.

## 8. Contrast with the real code

- `packages/cli/src/cache/golden-file.ts` l. 75–83: `reviews` is a strict `{by, date}` object with `by` non-empty and `date` a calendar day. The signatures fit, and D3 is consistent. Task 9.2 rightly relies on `tests/unit/cache/golden-file.spec.ts`.
- `seeds/cache/task-api.json` l. 28–30 and 80–87: statements carry `evidenceIds` that reference `evidence[].id`. Evidence `path` is relative to the fixture root (`src/routes/tasks.routes.ts`). The projection of D6 is feasible.
- **Improvable (pattern detection).** The test will reimplement logic that already exists, unexported, in `scripts/annotation-agreement.mjs`:
  - `fixtureLines` (l. 121–136: last line = number of lines, a final LF not counting);
  - `sourceProblem` (l. 147–157: glob, directory and allowlist);
  - `roundRatio` (l. 274–278: half away from zero with integer arithmetic).

  Only `cohenKappa` is exported. Either state in D8 that the duplication is accepted (no script change in scope) and copy the exact line-count rule, or export the helpers. With the first option, the percent must use the same integer rounding as `roundRatio` so that the result stays consistent with DIS-80.
- `.claude/workflows/autonomous-sdd.js` l. 145: panelists are told to "Read the ticket (Linear MCP)". The allowlist limits this to the description, which is consistent.

## 9. Task size

- **Improvable.** Task 6.1 bundles four tests, including a Markdown-table parser and agreement recomputation. Split it into 6.1a (signatures, two its) and 6.1b (report, two its).
- Task 5.1 becomes RED (synthetic invalid outputs) followed by GREEN once B5 is applied.
- Every other task fits in one agent turn.

## 10. Mandatory steps

Clean:
- Step 0 is the branch (0.1).
- Present and labelled: "Review and Update Existing Tests (MANDATORY)" (7), "Run Tests and Verify Data State (MANDATORY)" with the report path (8.6), "Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)" (9), E2E marked not applicable (10.1), "Update Technical Documentation (MANDATORY)" (11), and Pre-merge Review last (13, archive before merge).
- State restoration: 9.3 (claim and `cache_entry` counts) and `dev-processes stop` after every step that starts services.

Minor: task 7.2 must be updated once B1 and B5 add scenarios.

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| Blind panel input of the golden review | The panel input projects the golden answers without their verification | 2.1, 2.2, 2.3 |
| Panel outputs of the golden review | Each panelist output judges every item under the criterion | 4.1, 4.2, 4.3, 5.1 |
| Panel outputs of the golden review | The resolution answers exactly the disagreements | 4.4, 5.1 |
| Panel outputs of the golden review | **(missing) Invalid panel outputs are rejected** — B5 | **hole** (5.1 once corrected) |
| Signatures of the reviewed golden answers | Every golden answer judged correct or partial carries both panel signatures | 6.1, 6.2 |
| Signatures of the reviewed golden answers | A golden answer judged incorrect carries no signature | 6.1, 6.2, 6.3, 6.5 |
| Golden review report | The report's verdicts and agreement match the panel files | 6.1, 6.3 |
| Golden review report | The report states its criterion, panel and limitations | 1.1, 6.1, 6.3 |
| **(missing) Criterion first and immutable panel record** — AC 1, B1 | **(missing)** | **hole** (1.1, 1.2, 8.3 exist without a requirement) |
| **(missing / pending Q-A) Incorrect golden retired** — AC 4, R9, B2 | **(missing)** | **hole** |

Three rows are empty, and each is blocking (B1, B2, B5).

## Corrections to apply

### `specs/golden-answers/spec.md`

1. **New requirement (B1)**, after "Golden review report":
   > ### Requirement: Criterion first and immutable panel record
   > The `## Criterion` section of `docs/golden-review/2026-10-task-api-golden-review.md` SHALL equal, line for line, the **Criterion** block of the Panel group of this change's `tasks.md`. The commit that creates the report with that section SHALL be an ancestor of the commit that creates `docs/golden-review/panel/2026-10-golden-review-input.json`; no later commit SHALL change the `## Criterion` section; and the panel outputs and the resolution SHALL each be changed by exactly one commit, the one that creates it.
   > #### Scenario: The report's criterion is the Panel group's criterion
   > - **GIVEN** the report and `tasks.md` — **WHEN** both criterion texts are extracted — **THEN** they are equal (test).
   > #### Scenario: The criterion precedes the input and nothing in the record is rewritten
   > - **GIVEN** the branch history — **WHEN** `git merge-base --is-ancestor`, `git log -p` over the report and `git log --format=%H` over `docs/golden-review/panel` run — **THEN** the order holds, no later commit touches `## Criterion`, and each panel file has one commit (verified and recorded in the step 8 report; no test, design D9).
2. **"Panel outputs of the golden review" (B3, B6, B7):**
   - Replace "`model` the panelist's model id, non-empty" with "`model` the panelist's model id matching `^claude-[a-z]+-[0-9]+(-[0-9]+)*$` (`claude-opus-5-5` for panelist 1, `claude-sonnet-5-5` for panelist 2 in this run)".
   - Replace the `sourcesRead` clause with "`sourcesRead` lists every source read, one entry per file: a repository-relative file path or the literal `linear:DIS-33/description`; no directory, no glob; every entry in the allowlist of its role. Panelists: `openspec/changes/golden-independent-review/tasks.md`, `docs/golden-review/2026-10-task-api-golden-review.md`, `docs/golden-review/panel/2026-10-golden-review-input.json`, `docs/base-standards.md`, `linear:DIS-33/description`, and any file under `fixtures/task-api/` or `fixtures/acme-shop/` except `<fixture>/README.md`, `<fixture>/docs/**` and `<fixture>/node_modules/**`. Resolver: the panelist allowlist plus the two panelist outputs and `docs/AUTONOMOUS-RUN.md`. The resolution's `sourcesRead` SHALL follow the resolver allowlist."
   - Add: "A citation is a match of `/fixtures\/(task-api|acme-shop)\/([A-Za-z0-9_.\/-]+):([0-9]+)/g` in a `cites` entry, a `notes` or a `justification`; it is valid when the project is the item's, the file exists and the line is between 1 and the file's number of lines (a final LF is not a line). Line ranges are not citations. Every object of an output SHALL have exactly the keys listed; any other key rejects the output."
   - **Add the scenario (B5):** "#### Scenario: Invalid panel outputs are rejected — **GIVEN** a valid panelist output and, one at a time, copies with a `verdict` different from the derived one, a `sourcesRead` entry outside the allowlist, a directory, a glob, a missing statement judgement, a statement with no valid citation, a `notes` with no valid citation, the generator's model, an extra key; and a resolution answering an agreed item — **WHEN** each is checked — **THEN** the valid one is accepted and each copy is rejected with a message naming the rule."
3. **"Golden review report" (B4, B8):**
   - Replace the section list with "`## Criterion`, `## Panel`, `## Verdicts`, `## Agreement`, `## Pending` (only when some final verdict is `incorrect`) and `## Limitations`, in this order".
   - Add: "`## Panel` SHALL name both panelists' `model` and `date`, the resolver, and list the allowed and forbidden sources of the Panel group. Verdict cells SHALL hold the bare lowercase verdict (no backticks). The `Errors` cell SHALL be `none` or a `; `-separated list `S<n> <judgement>` of the item's statements judged other than `true`, from the final verdict's source (the panelists' judgements when they agree, panelist 1's when the resolver decided). The figures are written as `Percent agreement: <x.y>%` (exactly one decimal, e.g. `100.0%`) and `Cohen's kappa: <k.kkk>` (exactly three decimals, e.g. `0.500`, or `undefined`), compared as text with the recomputed values. Each `## Pending` line is `- <project> <id>: DIS-<n>`. `## Limitations` SHALL contain the sentences that two models of one family are not independent reviewers in the sense of two people, that the generator is a local 7B model, that `sourcesRead` is self-declared and that the criterion was written by an agent that had read the golden answers."
   - Extend the second scenario's THEN: "`## Panel` names both models and the allowed and forbidden sources; `## Limitations` contains the four points above".
4. **Scenario "The panel input projects…":** replace the forbidden-key list with "none of the keys `"excerpt":`, `"verification":`, `"status":`, `"confidence":`, `"fileId":`, `"evidenceIds":` nor any `sha256:` value".
5. **B2:** after Q-A, either keep the "Signatures" requirement and the ticket amended (option a), or add "Requirement: An incorrect golden answer is retired" with a scenario (option b).

### `design.md`

- **D1/D7:** add that `model` is the exact model id (`claude-opus-5-5`, `claude-sonnet-5-5`), aligned with AC 3 and DIS-34.
- **D2:** state the allowlist check of `sourcesRead` for both roles (B6), as in the spec.
- **D5:** record the author's answer to Q-A. Until then it stays an open question; the line "None open" under Open Questions is false while Q-A is pending.
- **D8:** "percent rounded with the integer rule of `roundRatio` (`scripts/annotation-agreement.mjs` l. 274), copied in the test; the line-count rule of `fixtureLines` (l. 121) likewise; duplication accepted because the script is out of scope", or export the helpers.
- **D9:** reference the new requirement "Criterion first and immutable panel record".
- **Follow-ups:** add rows SA-1…SA-8 (this audit) with their destination. Correct R9's description to its full ticket text.

### `tasks.md`

- **Panel group:**
  - Criterion: replace "Loose wording that is not false is noted, not an error" as in point 4.
  - Output format: add the exact `model` value per panelist, the citation regex, "ranges are not citations", "exactly these keys".
  - Allowed sources: state that `sourcesRead` entries are checked against this allowlist.
  - Agreement measure: "task 6.2" → "task 6.3".
- **2.1:** forbidden keys in quoted form, as in the spec.
- **5.1:** split into 5.1 RED ("Invalid panel outputs are rejected" with synthetic copies; see it fail) and 5.2 GREEN (the validator plus the two acceptance its over the real files). The forbidden-path check becomes "the allowlist of the spec for each role, including the resolution's `sourcesRead`".
- **6.1:** split into 6.1a (signature its) and 6.1b (report its, including "The report's criterion is the Panel group's criterion").
- **6.3:** write `## Pending` before `## Limitations`. Write `Resolved by the resolver: <k> of 7`. Use the exact formats of the spec.
- **7.2:** recount the scenarios (8 with tests, plus 1 verified in the step 8 report).
- **8.3:** cite the new requirement.

### `proposal.md`

- "What Changes → Incorrect answers": align with the author's answer to Q-A.
- "Report": add the `## Pending` position and the exact figure formats.

### Linear DIS-33 (never the `[original]` block; in Spanish)

Comment:
> **Auditoría de spec (texto del agente, 2026-10-28): CHANGES REQUIRED, 8 bloqueantes.** Preguntas para la autora: (Q-A) el DoD dice «las incorrectas se regeneran o se retiran» y el AC 4/R9 dice que no puede quedar ninguna golden `incorrect`; el diseño D5 la deja sin firmar y la pasa a un ticket de seguimiento. ¿Se acepta que ese punto del DoD salga de este ticket, o se planifica aquí la retirada condicionada (los ficheros y tests afectados son conocidos)? (Q-B) ¿El «veredicto» del DoD se da por cumplido en el informe y no en `reviews` (R3)? (Q-C) ¿Se confirman en el alcance las tres golden de acme-shop, los dos panelistas con resolutor y el TSDoc de `golden-file.ts`? Correcciones en curso en el change: requisito de orden e inmutabilidad del criterio (AC 1), identificador exacto del modelo en la firma (AC 3), contenido de `## Panel` y `## Limitations` (AC 5), escenario de rechazo de salidas inválidas, lista permitida de `sourcesRead`, gramática de las citas y formato exacto del informe.

Enhanced part (`[enhanced]` → AC 3): once B3 is applied, add "el `model` de cada salida del panel es el identificador exacto (`claude-opus-5-5`, `claude-sonnet-5-5`)". In AC 4, record the author's decision on Q-A when it arrives.

## Resolution of run 1

Correction round 1, 2026-10-28. *Agent's text: decided and applied as lead engineer in an autonomous run, without the author.* Every decision is also in `design.md` → Follow-ups (rows SA-Q-A … SA-9) and in a Spanish comment on DIS-33. `openspec validate golden-independent-review --strict` passes after the edits.

### Questions for the author

- **Q-A — decided by the agent: option (a).** The DoD bullet «las incorrectas se regeneran o se retiran» moves to the successor ticket of D5 (destination B, created in task 6.6 only if an item is `incorrect`). Reason: least scope; a conditional retirement group would change `GOLDEN_PROJECTS`, the main spec and three existing tests for a case that probably never happens. Recorded in D5, in the proposal and in the "Signatures" requirement ("stays in its file, not retired by this change"). In Linear, the `[enhanced]` AC 4 and R9 are amended (agent's text; the `[original]` block is untouched).
- **Q-B — decided by the agent: accepted.** The DoD's «y el veredicto» is met by the report's `## Verdicts` table, joined to each golden entry by project and id in the test (D3). Row SA-Q-B.
- **Q-C — decided by the agent: all three confirmed in scope.** The acme-shop golden answers are served by the demo and lost their reviews in DIS-32 E7; two panelists plus a resolver give the agreement measure; the TSDoc edit is documentation only. Row SA-Q-C.

### Blocking findings

- **B1 — fixed.** New requirement "Criterion first and immutable panel record" with the scenarios "The report's criterion is the Panel group's criterion" (test, task 6.2) and "The criterion precedes the input and nothing in the record is rewritten" (verified in the step 8 report, task 8.3, D9). Task 7.2 recounted: 10 scenarios, 9 with tests, 1 in the step 8 report. (Run 1 counted "8 with tests"; the delta has 9 test scenarios after B1 and B5.)
- **B2 — fixed through Q-A (option a).** The "Signatures" requirement states that an `incorrect` entry stays, unsigned, listed in `## Pending`; D5 and R9 in the Follow-ups carry the decision; the ticket's AC 4 is amended.
- **B3 — fixed.** `model` must match `^claude-[a-z]+-[0-9]+(-[0-9]+)*$`; the Panel group names `claude-opus-5-5` (panelist 1) and `claude-sonnet-5-5` (panelist 2); D1 updated; the ticket's AC 3 gains the exact ids. The test checks the pattern, not the literal ids, so a correct but differently versioned id does not stop the ticket.
- **B4 — fixed.** "Golden review report" requires the content of `## Panel` (both models and dates, the resolver, allowed and forbidden sources) and the four points of `## Limitations`; the second scenario's THEN checks them.
- **B5 — fixed.** Scenario "Invalid panel outputs are rejected" added (synthetic valid output plus one copy per defect, and a resolution answering an agreed item). Task 5.1 is now RED (see it fail), 5.2 GREEN.
- **B6 — fixed.** The spec fixes an allowlist check per role, by path string, including the literal `linear:DIS-33/description` and the resolver's wider list; the resolution scenario checks its `sourcesRead`. D2 and the Panel group updated; task 5.2 cites the spec's allowlist, not a denylist.
- **B7 — fixed.** Citation pattern `/fixtures\/(task-api|acme-shop)\/([A-Za-z0-9_.\/-]+):([0-9]+)/g`, any extension, in `cites`, `notes` and `justification`; the line-count rule of `fixtureLines`. Decided by the agent on one detail: the suggested wording "ranges are not citations" cannot be enforced by that pattern, which matches `path:15` inside `path:15-31`; the spec and the Panel group therefore say a range is read as a citation of its first line and tell panelists to cite single lines. Exact keys in every object; an extra or missing key rejects the output.
- **B8 — fixed.** Section order with `## Pending` before `## Limitations`; bare lowercase verdict cells; `Errors` cell `none` or `S<n> <judgement>` joined by `; `; `Percent agreement: <x.y>%`, `Cohen's kappa: <k.kkk>` or `undefined`, `Resolved by the resolver: <k> of 7`, compared as text; `## Pending` lines `- <project> <id>: DIS-<n>`. Decided by the agent on one detail: the suggested error source ("the panelists' judgements when they agree") is ambiguous when the verdicts agree but the statement judgements differ, so the error source is panelist 1 when its verdict equals the final one, otherwise panelist 2 when its verdict does, otherwise panelist 1.

### Improvable findings and notes

- §1 scope additions — decided by the agent (Q-C): kept.
- §1 note on task 6.5 (now 6.6) — resolved through Q-A: the successor ticket is the planned destination B of D5.
- §2 "nothing `verify` reads changes" — fixed in the "Signatures" requirement.
- §4 `Resolved by the resolver: <k> of 7` — fixed (spec, task 6.4). "Loose wording" — fixed with the measurable rule in the Criterion.
- §6 "task 6.2" in the Agreement measure — fixed; after the split of task 6.1 the report is written in task 6.4, so it now says "task 6.4". Quoted forbidden keys — fixed in the spec scenario and task 2.1. D5 risk versus R9 — fixed: R9's row in the Follow-ups carries its full ticket text and the moved clause.
- §8 helper duplication — decided by the agent: accepted, recorded in D8 (copy of `roundRatio` and the `fixtureLines` line rule; the script is out of scope).
- §9 task 6.1 split — fixed as tasks 6.1 (signatures) and 6.2 (report and criterion); later tasks renumbered 6.3–6.7 and their references updated. Task 5.1 split — fixed (B5).
- §10 task 7.2 — fixed (B1).

---

## Run 2 (2026-10-28)

CHANGES REQUIRED

Spec audit of `openspec/changes/golden-independent-review` (Linear DIS-33, parent DIS-20), run 2, 2026-10-28. This run judges the change as it stands after correction round 1.

**Inputs read.**
- The change: `proposal.md`, `design.md`, `specs/golden-answers/spec.md`, `tasks.md`, and `reports/2026-10-28-spec-audit.md` (run 1 and its resolution).
- Linear: DIS-33 (description `[original]`, `[reality-map]` and `[enhanced]` as amended in correction 1, plus its 6 comments) and the parent DIS-20.
- Project docs: `docs/base-standards.md`, `docs/openspec-tasks-mandatory-steps.md`, `docs/project-context.md` (l. 554–583 and l. 1204–1206), `docs/AUTONOMOUS-RUN.md` (§2, §6) and `openspec/specs/golden-answers/spec.md`.
- Code: `scripts/annotation-agreement.mjs` (l. 61–157, 274–303), `packages/cli/src/cache/golden-file.ts`, `packages/cli/src/cache/answer-fingerprint.ts`, `seeds/cache/*.json` and `.claude/workflows/autonomous-sdd.js` (`runPanel` l. 143–155, `apply-prepare`/`apply-finish` l. 189–194).

## Questions for the author

None. The agent answered Q-A, Q-B and Q-C of run 1 as lead engineer (design Follow-ups SA-Q-A … SA-Q-C, and the amended `[enhanced]` AC 3, AC 4 and R9). Those answers contradict neither the amended ticket nor the project, so this run accepts them.

## 1. Scope against the ticket

Clean. Everything follows from DIS-33, and the scope additions (acme-shop goldens, two panelists plus a resolver, the TSDoc) were confirmed in SA-Q-C. Nothing widens the change to DIS-20's analyzer story. The non-goals are explicit in the proposal and the design.

## 2. Inherited acceptance criteria

The DIS-20 criteria (analyzer, empty core diff, redaction, seed, type errors) are not part of DIS-33's DoD. DIS-33's own DoD and its amended AC 1–5 are each covered:

- **AC 1** → requirement "Criterion first and immutable panel record".
- **AC 2** → "Panel outputs of the golden review". `overtyped` is a refinement, and the Panel group says it prevails.
- **AC 3** → "Signatures of the reviewed golden answers".
- **AC 4** (amended) → "A golden answer judged incorrect carries no signature" plus `## Pending`.
- **AC 5** → "Golden review report".
- **DoD «y el veredicto»** → met by the `## Verdicts` table (SA-Q-B).

- **Improvable (I3), AC 3 literals.** The amended AC 3 pins `agent:claude-opus-5-5` and `agent:claude-sonnet-5-5`. The test checks only the pattern `^claude-[a-z]+-[0-9]+(-[0-9]+)*$`; that was a deliberate decision of round 1 (B3). Two consequences follow:
  - A panelist whose real id differs would sign with a valid id that is not the AC 3 literal, and nothing would record the difference.
  - The Panel group's wording ("your exact model id: claude-opus-5-5 for panelist 1, claude-sonnet-5-5 for panelist 2") tells a panelist both to write its real id and to write a fixed literal. Those conflict if the two differ.

  Correction: see Corrections → tasks.md Panel group and 8.3.

## 3. Missing scenarios

Clean. Every MUST clause of the four ADDED requirements plus "Criterion first…" is exercised by a scenario:
- input projection;
- acceptance and rejection of panel outputs;
- resolution = disagreements;
- signatures, both correct/partial and incorrect;
- report figures;
- report sections and limitations;
- criterion equality;
- git order (step 8 report).

## 4. Ambiguity

Clean. A search of `proposal.md`, `design.md`, `spec.md` and `tasks.md` finds no fast, easy, secure, efficient, many, appropriate or robust.

## 5. Open decisions

- **B2 — blocking. The boundaries of the "Criterion block" are undefined, and the section that depends on them can never be edited.** Three facts combine:
  - The spec requires the report's `## Criterion` to "equal, line for line, the **Criterion** block of the Panel group". It does not say where that block starts and ends. Is the bold lead-in line `**Criterion** (judge against the fixture code at this commit; the golden answers are in Spanish):` part of it? Are blank lines? Does the block end at `**Output format.**`?
  - Task 1.1 writes `## Criterion` in `apply-prepare`. The test that pins the comparison (task 6.2) is written later, by a different agent (`apply-finish`, `autonomous-sdd.js` l. 190–194).
  - No later commit may change `## Criterion` (same requirement, design D9).

  So if 1.1 copies a slightly different extent (the lead-in line, an intro sentence), the mismatch is unrecoverable: the test cannot go green without editing an immutable section, and the ticket stops. Correction: define the block and the section explicitly in the spec, in task 1.1 and in task 6.2 (see Corrections).
- **Improvable (I1). No precedence between statement judgements.** A `FACT` can be contradicted by the code *and* cite lines that do not back it. It can also be true only by inference *and* cite the wrong lines. The derived verdict depends on which judgement the panelist picks: `false` on a `FACT` gives `incorrect`, while `unverifiable` or `overtyped` gives `partial`. The criterion becomes immutable at task 1.2, so fix the precedence now. Add to the Criterion block: "When more than one judgement applies, use the first that applies in this order: `false`, `unverifiable`, `overtyped`, `true`."
- **Improvable (I2). Citation of an `unverifiable` statement whose cited file or lines do not exist.** The rule "every statement carries at least one valid citation" still applies, but the Panel group does not say what to cite. A rejected output stops the ticket (D7). Add: "for an `unverifiable` statement whose cited file or lines do not exist, cite the fixture line that shows the code the statement is about, or line 1 of the cited file if the file exists."
- **Improvable (I4). `sourcesRead` edge cases.**
  - The spec says "the check is by path string", but "never a directory" cannot be decided from the string alone. `fixtures/task-api/src` with no trailing slash passes the prefix check.
  - A `..` segment (`fixtures/task-api/../../seeds/cache/task-api.json`) also passes the prefix check.
  - The DIS-80 precedent handles both (`scripts/annotation-agreement.mjs` l. 151 checks the filesystem for directories; l. 154 rejects `..`).

  Correction: state "an entry is a directory when it ends in `/` or names an existing directory; an entry with a `..` segment is outside the allowlist; entries are not checked for existence (see B1)".
- **Improvable (I7). How the test recognises the content of `## Panel` and `## Limitations` is not pinned.** The report is written in 6.4, after the test (6.2), and only `## Criterion` is immutable, so the risk is low. Still, pin it:
  - `## Panel` contains every exact entry of the panelist allowlist, the two prefixes, `fixtures/README.md` and `seeds/`.
  - `## Limitations` contains four fixed sentences (see Corrections).
- **Improvable (I8). The `Errors` cell can contradict the final verdict.** When the resolver picks a verdict neither panelist gave (e.g. p1 `correct`, p2 `incorrect`, final `partial`), the error source is panelist 1, whose cell may read `none` beside a `partial`. This is deterministic, so it is acceptable. Add one line to `## Limitations` or to the table note: "when the final verdict comes from the resolver and matches neither panelist, `Errors` shows panelist 1's judgements."
- **Improvable (I10). Table safety.** A `|` inside a Justification cell breaks the `## Verdicts` parser. Add "no `|` in any cell" to the spec and to task 6.4.

## 6. Contradictions inside the change

- **Improvable (I5). Task 6.4 versus task 6.6.**
  - Task 6.4 ends "`npx vitest run tests/unit/seed/golden-reviews.spec.ts` green". It also says the `## Pending` lines `- <project> <id>: DIS-<n>` are "filled in task 6.6".
  - The test of task 6.1 checks those lines.
  - So if any item is `incorrect`, 6.4 cannot be green before 6.6 has created the issue.

  Correction: move the issue creation before the report (new order: 6.3 data, 6.4 successor issues if any, 6.5 report, 6.6 refactor), or make 6.4's green conditional on 6.6.
- **Improvable (I9).** Task 6.1 says "See them fail". When no item is `incorrect`, "A golden answer judged incorrect carries no signature" may pass at once, because its synthetic part only needs the helper. Say "the first fails; the second may already pass (record it)", as 6.2 already does.
- **Improvable (I11).** The spec requires every resolution item to carry "at least one valid citation in its `cites` or its `justification`". The Panel group states that rule for statements and `notes` only. Add it to the resolution sentence of the Output format, because a rejection stops the ticket.
- Otherwise clean: proposal, design D1–D9 and the spec agree on the paths, the shapes, the derivation, the agreement formats and the order of the sections.

## 7. Contradictions with the project

- **Improvable (I6). Task 6.6 and the destination model.** Task 6.6 creates new Linear issues and labels them destination **B**. `docs/project-context.md` l. 565 defines B as "A later sub-issue **already** owns it". It also says (l. 583) "humans confirm Linear creates/comments before the agent opens issues", and the autonomous exceptions table in `docs/AUTONOMOUS-RUN.md` §2 does not relax that rule. This is conditional (it only runs if an item is `incorrect`), it is an agent decision (SA-Q-A) and it is recorded in the ticket's amended AC 4, so it is not blocking. Still, label it honestly in D5, in Follow-ups R5/D5 and in task 6.6: "B (successor issue created by the agent in the autonomous run; the author confirms it at review)". Also list it in the PR's remaining-gaps table (task 12.1).
- The agent merging (13.7) and writing the PR's "why" (12.1) are allowed by `docs/AUTONOMOUS-RUN.md` §2. Clean.
- The delta only ADDs requirements and does not touch "Golden file format" or "Partial regeneration" of `openspec/specs/golden-answers/spec.md`. However, the new requirements name "this change's `tasks.md`" and "the Panel group of `tasks.md`". Once `/opsx:archive` syncs them into the main spec, those references no longer resolve (folded into B1).

## 8. Contrast with the real code

- **B1 — blocking. The criterion test breaks at `/opsx:archive`, before the merge.**
  - The spec requirement "Criterion first and immutable panel record" and the test of task 6.2 read `openspec/changes/golden-independent-review/tasks.md`.
  - Task 13.7 runs `/opsx:archive` *before* the merge. That moves the file to `openspec/changes/archive/<date>-golden-independent-review/tasks.md`, the shape of `openspec/changes/archive/2026-10-28-callsite-annotations/`.
  - From then on "The report's criterion is the Panel group's criterion" fails on the PR's archive commit, and on every later CI run of `final-project-CRN`, whichever ticket triggers it.
  - No existing test reads a change's `tasks.md` from disk: a grep of `tests/` finds the DIS-80 precedent only as an allowlist *string* (`tests/unit/scripts/annotation-agreement.spec.ts` l. 348). This change would be the first.
  - The same risk applies to the validator if it checked that `sourcesRead` entries exist, since `openspec/changes/golden-independent-review/tasks.md` is a panelist allowlist entry.

  Correction:
  - (a) The test resolves the tasks file as the active path when it exists, otherwise as the single match of `openspec/changes/archive/*-golden-independent-review/tasks.md`, and fails with a message if there are none or more than one.
  - (b) The spec says so, and names that path instead of "this change's `tasks.md`", so the main spec stays meaningful after the sync.
  - (c) The spec states that `sourcesRead` entries are checked by string only, never for existence.
  - (d) Task 13.7 re-runs `npx vitest run tests/unit/seed/golden-reviews.spec.ts` after the archive commit.
  - (e) The report writes repository paths as code, not as Markdown links (a link to the change's `tasks.md` would break after the archive).
- Checked against the code, consistent:
  - `cohenKappa` is the only helper exported by `scripts/annotation-agreement.mjs` (l. 288). It already rounds to three decimals and returns `null` only when expected agreement is 1, which matches D8's "`undefined` when it is `null`"; rendering with `toFixed(3)` gives `<k.kkk>`.
  - `roundRatio` (l. 274) and `fixtureLines` (l. 121) are where D8 says they are, and the duplication is accepted.
  - `golden-file.ts` l. 75–83: `reviews` is strict `{by, date}` with a calendar date, so the signatures fit (D3).
  - `answer-fingerprint.ts` l. 13–27: neither `seeds/cache/` nor `golden-file.ts` is a fingerprint input, so `verify` keeps 3/3.
  - No existing test asserts on the real seeds' `reviews` (grep `reviews` in `tests/`). Task 7.1 is correct.
  - `runPanel` (l. 145–154) matches the Panel group: the panelists return their files, `panel-record` writes them, and `panel-resolve` is Opus.

## 9. Task size

Clean. 5.2 (validator plus two `it`s over real files) and 6.2 (table parser plus three `it`s) are the largest tasks, but each fits in one agent turn after the run-1 split.

## 10. Mandatory steps

Clean:
- Step 0 is the branch (0.1).
- Each mandatory group is present with its label: 7 (MANDATORY), 8 (MANDATORY, report path in 8.6), 9 (MANDATORY - AGENT MUST EXECUTE, report 9.4), 10 (MANDATORY if applicable - AGENT MUST EXECUTE, marked not applicable), 11 (MANDATORY).
- 13 (MANDATORY - AGENT MUST EXECUTE) is last, with the three checks in order and the archive before the merge.
- State restoration is covered: 9.3 records the counts and git status, and `dev-processes stop` follows every step that starts processes.
- Every scenario maps to a task (7.2: 10 scenarios, 9 tests plus 1 in the step 8 report; recount correct).

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| Blind panel input of the golden review | The panel input projects the golden answers without their verification | 2.1, 2.2, 2.3 |
| Panel outputs of the golden review | Each panelist output judges every item under the criterion | 4.1, 4.2, 4.3, 5.2 |
| Panel outputs of the golden review | The resolution answers exactly the disagreements | 4.4, 5.2 |
| Panel outputs of the golden review | Invalid panel outputs are rejected | 5.1, 5.2 |
| Signatures of the reviewed golden answers | Every golden answer judged correct or partial carries both panel signatures | 6.1, 6.3 |
| Signatures of the reviewed golden answers | A golden answer judged incorrect carries no signature | 6.1, 6.3, 6.4, 6.6 |
| Golden review report | The report's verdicts and agreement match the panel files | 6.2, 6.4 |
| Golden review report | The report states its criterion, panel and limitations | 1.1, 6.2, 6.4 |
| Criterion first and immutable panel record | The report's criterion is the Panel group's criterion | 1.1, 6.2 (breaks after 13.7 — B1) |
| Criterion first and immutable panel record | The criterion precedes the input and nothing in the record is rewritten | 1.2, 2.3, 4.3, 4.4, 8.3 |

No empty row. The ninth row is filled but defective until B1 is fixed.

## Corrections to apply

### `specs/golden-answers/spec.md`

1. **"Criterion first and immutable panel record" (B1, B2).** Replace the first sentence with:
   > The `## Criterion` section of `docs/golden-review/2026-10-task-api-golden-review.md` SHALL consist of exactly the lines of the Criterion block of the Panel group of the change's tasks file, and no other non-blank line. The Criterion block is the bullet lines (each starting with `- `) that follow the line starting with `**Criterion**` up to the next blank line, excluding that bold lead-in line. The change's tasks file is `openspec/changes/golden-independent-review/tasks.md` while the change is active, and the single `openspec/changes/archive/*-golden-independent-review/tasks.md` once it is archived.

   Scenario "The report's criterion is the Panel group's criterion", replace GIVEN, WHEN and THEN:
   > **GIVEN** the report and the change's tasks file, active or archived **WHEN** the non-blank lines of `## Criterion` and the Criterion block are extracted **THEN** they are equal, and the test fails naming the paths it tried when no tasks file, or more than one, is found
2. **"Panel outputs of the golden review" → Allowlists (B1, I4).** Append:
   > The check is by path string only: an entry is never checked for existence. An entry is a directory when it ends in `/` or names an existing directory. An entry with a `..` segment is outside every allowlist.
3. **"Golden review report" (I7, I8, I10).** Add the following:
   - > `## Panel` SHALL contain each exact entry of the panelist allowlist, the prefixes `fixtures/task-api/` and `fixtures/acme-shop/`, and the forbidden paths `fixtures/README.md` and `seeds/`. Repository paths are written as code, never as Markdown links.
   - Replace the `## Limitations` sentence with:
     > `## Limitations` SHALL contain these four lines verbatim: `- Two models of one family are not independent reviewers in the sense of two people.`, `- The generator is a local 7B model (qwen2.5-coder).`, `- sourcesRead is self-declared.`, `- The criterion was written by an agent that had read the golden answers.`
   - > No cell of the `## Verdicts` table SHALL contain `|`. When the final verdict matches neither panelist, the `Errors` cell shows panelist 1's judgements.

### `tasks.md`

- **Panel group → Criterion block (I1, I2).** Edit before task 1.1 runs: the block becomes immutable at 1.2.
  - Add the bullet: "- When more than one judgement applies to a statement, use the first that applies in this order: `false`, `unverifiable`, `overtyped`, `true`."
  - Add to the Output format: "For an `unverifiable` statement whose cited file or lines do not exist, cite the fixture line that shows the code the statement is about, or line 1 of the cited file if the file exists."
- **Panel group → Output format (I3, I11).**
  - Replace the `model` placeholder with "<your exact model id as your own system states it; expected claude-opus-5-5 for panelist 1 and claude-sonnet-5-5 for panelist 2; if yours differs, write yours>".
  - Add to the resolution sentence: "each resolution item carries at least one valid citation in `cites` or `justification`".
- **1.1 (B2).** Add: "`## Criterion` holds exactly the bullet lines of the Criterion block (without the bold `**Criterion**` lead-in line), nothing else. Paths are written as code, not links."
- **5.2 (B1, I4).** Add: "sourcesRead entries are checked by string, never for existence. A trailing `/` or an existing directory is a directory. A `..` segment is outside the allowlist."
- **6.1 (I9).** Replace "See them fail" with "See the first fail; the second may already pass when no item is `incorrect` (record it)".
- **6.2 (B1, B2).** The criterion `it` resolves the tasks file as in the spec (active path, else the single archived match) and compares the non-blank lines of `## Criterion` with the bullet lines of the Criterion block.
- **6.4/6.6 order (I5).** Move the successor-issue task before the report task, and renumber.
- **6.6 (I6).** Replace "(destination B, agent's text)" with "(destination B: successor issue created by the agent in the autonomous run, to be confirmed by the author at review; agent's text)". Task 12.1 lists it among the remaining gaps.
- **8.3 (I3).** Add: "record whether the two signatures equal `agent:claude-opus-5-5` and `agent:claude-sonnet-5-5` of AC 3; if not, record the real ids and add a Follow-ups row".
- **13.7 (B1).** After the archive commit, and before the merge, run `npx vitest run tests/unit/seed/golden-reviews.spec.ts` green.

### `design.md`

- **D9:** add that the criterion test reads the tasks file at its active or archived path, so that it survives `/opsx:archive` and the main-spec sync (B1). Name the block boundaries (B2).
- **D2:** add "entries are checked by string, never for existence; `..` is rejected; a trailing `/` or an existing directory is a directory" (I4, B1).
- **D4:** add the judgement precedence `false` > `unverifiable` > `overtyped` > `true` (I1).
- **D5 / Follow-ups R5/D5:** relabel destination B as in task 6.6 (I6).
- **Follow-ups:** add rows SA2-B1, SA2-B2 and SA2-I1 … SA2-I11 for this run, each with destination A.

### `proposal.md`

- **Impact:** add "the criterion test reads the change's tasks file at its active or archived path".

### Linear DIS-33 (Spanish; the `[original]` block is never touched)

Comment:
> **Auditoría de spec, ejecución 2 (texto del agente, 2026-10-28): CHANGES REQUIRED, 2 bloqueantes.** (B1) El test que compara `## Criterion` con el bloque del grupo Panel lee `openspec/changes/golden-independent-review/tasks.md`, que `/opsx:archive` (tarea 13.7, antes del merge) mueve a `openspec/changes/archive/…`: el test fallaría desde el commit de archivo y en todas las CI posteriores de la base. Corrección: el test busca el `tasks.md` activo o el archivado, `sourcesRead` se comprueba solo como texto y la spec nombra la ruta. (B2) No está definido dónde empieza y acaba el «bloque Criterion»; como `## Criterion` no se puede cambiar después del commit 1.2, un desajuste no tendría arreglo. Corrección: el bloque son las líneas de viñeta tras la línea `**Criterion**` hasta la siguiente línea en blanco. Mejoras: precedencia de juicios (`false` > `unverifiable` > `overtyped`), qué citar en un statement inverificable, `..` y directorios en `sourcesRead`, orden de las tareas 6.4/6.6, etiqueta del destino B del ticket sucesor y registro de si las firmas coinciden con los identificadores del AC 3.

---

## Resolution of run 2

Correction round 2, 2026-10-28. *Agent's text: decided and applied as lead engineer in an autonomous run, without the author.* Run 2 asked no question for the author. Every decision is also in `design.md` → Follow-ups (rows SA2-B1 … SA2-I11, destination A) and in a Spanish comment on DIS-33. `openspec validate golden-independent-review --strict` passes after the edits.

### Blocking findings

- **B1 — fixed.** The "Criterion first and immutable panel record" requirement now names the change's tasks file as `openspec/changes/golden-independent-review/tasks.md` while active and the single `openspec/changes/archive/*-golden-independent-review/tasks.md` once archived; its test scenario resolves either and fails naming the paths tried when there is none or more than one (task 6.2). The Allowlists say entries are checked by string only, never for existence (spec, D2, task 5.2). The report writes repository paths as code, never as links (spec, tasks 1.1 and 6.5). Task 13.7 re-runs `golden-reviews.spec.ts` after the archive commit. D9 and the proposal's Impact record it. The other references to "the Panel group of `tasks.md`" in the spec now say "the change's tasks file".
- **B2 — fixed, with one detail decided by the agent.** The Criterion block is the non-blank lines between the line starting with `**Criterion**` and the line starting with `**Output format.**`, both excluded, each a `- ` bullet; `## Criterion` holds exactly those lines and no other non-blank line (spec, D9, tasks 1.1 and 6.2). The suggested wording "up to the next blank line" was not taken literally: in `tasks.md` a blank line follows the lead-in line, so that rule would select nothing; the end marker is the `**Output format.**` line instead.

### Improvable findings

- **I1 — fixed.** The Criterion block gains the bullet on judgement precedence (`false`, `unverifiable`, `overtyped`, `true`); D4 records it. The block is still editable: task 1.2 has not run.
- **I2 — fixed.** The Output format says what to cite for an `unverifiable` statement whose cited file or lines do not exist.
- **I3 — fixed.** The `model` placeholder asks for the exact id as the panelist's own system states it, with the expected ids; the spec and D1 follow; task 8.3 records whether the signatures equal the AC 3 literals and, if not, the real ids and a Follow-ups row.
- **I4 — fixed.** A trailing `/` or an existing directory is a directory; a `..` segment is outside every allowlist; the rejection scenario and task 5.1 add both copies (an existing directory without slash, a `..` entry).
- **I5 — fixed.** New order: 6.3 data, 6.4 successor issues (only if an item is `incorrect`), 6.5 report, 6.6 refactor, 6.7 commit; the Agreement measure now points at task 6.5.
- **I6 — fixed.** Destination B relabelled in D5, the R5/D5 row and task 6.4 as a successor issue created by the agent in the autonomous run, to be confirmed by the author at review; task 12.1 lists it in the PR's remaining gaps.
- **I7 — fixed.** `## Panel` must contain every exact panelist allowlist entry, both fixture prefixes, `fixtures/README.md` and `seeds/`; `## Limitations` holds four fixed lines verbatim (spec, both report scenarios' wording, tasks 1.1, 6.2, 6.5).
- **I8 — decided by the agent.** The spec rule states that when the final verdict matches neither panelist, `Errors` shows panelist 1's judgements; no fifth line is added to `## Limitations`, which stays at the four fixed lines the test checks.
- **I9 — fixed.** Task 6.1: the first test fails; the second may already pass when no item is `incorrect` (recorded).
- **I10 — fixed.** No pipe character in any `## Verdicts` cell (spec, scenario, tasks 6.2 and 6.5).
- **I11 — fixed.** The resolution sentence of the Output format requires at least one valid citation in `cites` or `justification` per resolution item.
- **§7 main-spec references — fixed through B1.**

---

## Run 3 (2026-10-28)

APPROVED

Spec audit of `openspec/changes/golden-independent-review` (Linear DIS-33, parent DIS-20), run 3, 2026-10-28. This run judges the change as it stands after correction round 2.

**Inputs read.**
- The change: `proposal.md`, `design.md`, `specs/golden-answers/spec.md`, `tasks.md`, plus `reports/2026-10-28-spec-audit.md` (runs 1 and 2 and their resolutions).
- Linear: DIS-33 (description `[original]`, `[reality-map]` and `[enhanced]` as amended in correction rounds 1 and 2, and its 7 comments) and the parent DIS-20.
- Project docs: `docs/base-standards.md`, `docs/openspec-tasks-mandatory-steps.md`, `docs/project-context.md` (l. 207–215, 1185–1209), `docs/AUTONOMOUS-RUN.md` §6, and `openspec/specs/golden-answers/spec.md` (requirement list, l. 348–373, 469–493).
- Code: `.claude/workflows/autonomous-sdd.js` (l. 43–60, 62–73, 143–155, 189–194), `scripts/annotation-agreement.mjs` (l. 115–299 and its exports), `scripts/annotation-agreement.d.mts`, `tests/unit/scripts/annotation-agreement.spec.ts` (imports), `seeds/cache/task-api.json` (l. 1–140), the questions and `evidenceIds` of both golden files, and the tree of `docs/golden-review/` and `fixtures/*/`.

## Questions for the author

None. The agent's earlier answers (SA-Q-A, SA-Q-B, SA-Q-C; the round-2 decisions on B2 and I8) contradict neither the amended ticket nor the project, so this run accepts them.

## 1. Scope against the ticket

Clean. Everything follows from DIS-33 as amended:
- The acme-shop golden answers, two panelists plus a resolver, and the TSDoc edit were confirmed in SA-Q-C.
- The successor ticket of D5 is created only if an item is `incorrect` (destination B, labelled as created by the agent).

Nothing widens the change to DIS-20's analyzer story. The non-goals are explicit in the proposal and the design.

## 2. Inherited acceptance criteria

DIS-20's criteria (analyzer, empty core diff, redaction, seed, `verify` Q1–Q4) are not inherited by DIS-33's DoD. Each of DIS-33's amended AC 1–5 has a requirement and a scenario:
- **AC 1** → "Criterion first and immutable panel record". Two scenarios: one a test, one verified in the step 8 report.
- **AC 2** → "Panel outputs of the golden review". Three scenarios. `overtyped` is a refinement the Panel group says prevails.
- **AC 3** → "Signatures of the reviewed golden answers". The pattern is checked by the test. Task 8.3 records whether the ids are the AC 3 literals. The `verify` 3/3 output is covered by the requirement text and task 8.4.
- **AC 4** (amended) → "A golden answer judged incorrect carries no signature", plus `## Pending`.
- **AC 5** → "Golden review report". See improvable I5 for the `n = 7` and "indicative" parts.
- **DoD «y el veredicto»** → the `## Verdicts` table, joined to each entry in the test (SA-Q-B).

## 3. Missing scenarios

- **Improvable (I5).**
  - "Golden review report" requires `## Agreement` to state `n = 7` and the word `indicative` for the kappa (AC 5 asks for both). Neither scenario's THEN checks them.
  - "Panel outputs…" requires the resolution's `resolver` to match the model pattern and its `date` to be a real day. The scenario "The resolution answers exactly the disagreements" checks only that a `resolver` exists.

  Correction: see Corrections → spec.md.
- Otherwise clean. Every MUST clause of the five requirements is exercised.

## 4. Ambiguity

Clean. A search of `proposal.md`, `design.md`, `spec.md` and `tasks.md` finds none of fast, easy, secure, efficient, many, appropriate or robust. "Several" appears once, in design D5, in a rationale followed by an explicit list of tests; it pins nothing.

## 5. Open decisions

No blocking open decision: every format, limit, ordering and name a test pins is fixed. Four improvable points remain. Two of them touch the Criterion block, which becomes immutable at task 1.2. Task 1.1 has not run, so fix those two now or not at all.

- **Improvable (I1). Statements that cite several evidence entries, and compound statements.** Real items hit this:
  - task-api Q1 S3 cites 5 evidence entries and Q1 S4 cites 6. Each entry backs one part of the statement (one controller method per route).
  - The `unverifiable` bullet says "a cited evidence entry does not exist (file or lines) or **its** lines do not back the statement". Read per entry, together with the precedence rule, any single entry that backs only its part makes the statement `unverifiable`. Read jointly, the statement is `true`. The two readings give `partial` versus `correct`.
  - Likewise, a statement with one true part and one contradicted part (Q1 S1: "un controlador del tipo 'taskRoutes'") is not clearly `false`.

  The resolver absorbs the disagreement, but the agreement figure then measures an ambiguity in the criterion rather than in the answers. Correction: add one bullet to the Criterion block (see Corrections).
- **Improvable (I2). The planted secret in the panel outputs.**
  - Panelists may read `fixtures/task-api/src/config/env.ts`.
  - Nothing tells them not to quote its value in `notes` or `cites`.
  - The outputs are committed and can never be edited (D7).
  - CI's gitleaks allows the value by exact match (`docs/project-context.md` l. 207–215), so it would not catch it.

  The proposal's Impact says the secret "does not leave the fixture", but that holds only for the input and the report. Correction: add a rule to the Output format, and have the validator reject `/AKIA[A-Z0-9]{16}/` in an output (a rejection stops the ticket, as for any other defect).
- **Improvable (I6). `sourcesRead` and files the harness loads.**
  - `CLAUDE.md` and the memory files are loaded into every agent's context automatically. A conscientious panelist may list `CLAUDE.md`, which is outside the allowlist and would reject the output.
  - Nothing requires `sourcesRead` to be non-empty, or to include the fixture files the output cites.

  Correction: the Panel group says "files loaded automatically by the harness (`CLAUDE.md`, memory) are not listed". Optionally, the validator requires every file named by a valid citation to appear in `sourcesRead`.
- **Improvable (I7). Task 4.3** says "write both outputs exactly as returned (two-space JSON, LF, final newline)". If a panelist returns content that is not two-space JSON, the recording agent must either reformat it (which arguably edits it) or break the stated format. Correction: "write the content exactly as returned; only line endings are normalised to LF and a final newline is added; nothing else is reformatted (no test checks the indentation of the outputs)".

## 6. Contradictions inside the change

- **Improvable (I3). D5 versus D7 on stopping the ticket.**
  - D5 rejects the alternative "stopping the ticket" because it is "not a clean-stop condition of the run contract".
  - D7 and task 5.2 plan exactly such a stop when the test rejects a panel output.
  - The `docs/AUTONOMOUS-RUN.md` §6 list of clean stops does not name a rejected panel output either.

  Correction: reword D5's reason as "stopping would leave an expected outcome (an `incorrect` verdict) without a path", and state in D7 that a rejected output is a ticket-specific clean stop: return `ok=false` with the failing check; the author decides.
- Otherwise clean. The proposal, D1–D9, the spec and the Panel group agree on:
  - paths, shapes and strictness;
  - the citation grammar, the derivation and the precedence;
  - the allowlists, the section order and the formats;
  - the task order 6.3–6.7.

## 7. Contradictions with the project

Clean:
- **`docs/project-context.md` l. 1204–1206** ("the author signs a sample") is updated by task 11.2.
- **Main spec "Partial regeneration"** (l. 358–361: a regenerated entry has empty `reviews`) agrees with D5 and task 11.2.
- **Main spec "The versioned golden file is coherent"** (l. 469–477: canonical render, no `AKIA`) is kept by task 6.3.
- **Requirement names.** The four ADDED requirements plus "Criterion first…" duplicate no requirement name of the main spec.
- **Merge and PR text.** The agent merging (13.7) and writing the PR's "why" (12.1) are covered by `docs/AUTONOMOUS-RUN.md` §2/§6.
- **Spanish PR.** The project exception in base-standards §2 covers it.

## 8. Contrast with the real code

- **Improvable (I4).**
  - D8 says "Only `cohenKappa` is exported by the script". In fact `scripts/annotation-agreement.mjs` also exports `validateOutput` (l. 212), `agreement` (l. 360), `mergeAnnotations` (l. 404), `sha256` (l. 439), `checkFreeze` (l. 452) and `runAnnotationAgreement` (l. 634). The claim D8 needs is narrower: `roundRatio` (l. 274) and `fixtureLines` (l. 121) are not exported, and `validateOutput` is bound to the DIS-80 `sites` shape. Reword.
  - `fixtureLines` also rejects a path with a `..` segment or a leading `/` (l. 122). The spec's citation regex `[A-Za-z0-9_.\/-]+` admits `..`, so `fixtures/task-api/../acme-shop/x.php:3` escapes the fixture. The spec's "names an existing file inside that fixture" implies the rejection; state it explicitly, since the test copies the rule.
- **Improvable (I8). The citation check is pinned to today's fixture lines.**
  - The coherence test validates the immutable panel files against the fixture files at HEAD.
  - A later ticket that shortens a cited fixture file would make this test fail on its branch.
  - That failure is arguably right, since the review would be stale, but it is not documented.

  Correction: state in D7 and in the project-context line of task 11.2 that a fixture change that breaks a panel citation invalidates the review and needs a new panel, as a regenerated entry does.
- Consistent with the code:
  - `cohenKappa` is declared in `scripts/annotation-agreement.d.mts` l. 106, so the TypeScript test typechecks, like `tests/unit/scripts/annotation-agreement.spec.ts` l. 8–16.
  - Every golden statement has at least one `evidenceIds` entry, so no input statement has empty `evidence`.
  - The golden question texts match task 9.1.
  - `docs/golden-review/2026-10-task-api-golden-review.md` does not exist yet.
  - `fixtures/task-api/README.md` and `fixtures/acme-shop/README.md` exist, and neither fixture has a `docs/` directory, so the exclusions are harmless.
  - `runPanel` (l. 143–155) matches the Panel group: panelists return files, `panel-record` writes them, `panel-resolve` (Opus) always writes the resolution.
  - The Panel group's "Resolver and its step contract" paragraph neutralises the COMMON prompt's instructions to record decisions in Linear and `design.md`.
  - The Criterion block (tasks.md l. 32–37) lies between the unique line starting with `**Criterion**` (l. 30) and the unique line starting with `**Output format.**` (l. 39), and every one of its lines starts with `- `. The extraction rule selects exactly six bullets.

## 9. Task size

Clean. The largest tasks are 5.2 (validator plus two `it`s), 6.2 (table parser plus three `it`s) and 6.5 (the report). Each fits in one agent turn.

## 10. Mandatory steps

Clean:
- Step 0 is the branch (0.1–0.4).
- Each mandatory group is present and labelled:
  - 7 Review and Update Existing Tests (MANDATORY);
  - 8 Run Tests and Verify Data State (MANDATORY), report path in 8.6;
  - 9 Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE), report in 9.4;
  - 10 End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE), marked not applicable;
  - 11 Update Technical Documentation (MANDATORY);
  - 13 Pre-merge Review (MANDATORY - AGENT MUST EXECUTE), last, with the three checks in order and the archive commit before the merge.
- State restoration: 9.3 records counts and `git status`; `dev-processes stop` follows every step that starts processes.
- Task 7.2 recount is correct: 10 scenarios, 9 with tests plus 1 in the step 8 report.

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| Blind panel input of the golden review | The panel input projects the golden answers without their verification | 2.1, 2.2, 2.3 |
| Panel outputs of the golden review | Each panelist output judges every item under the criterion | 4.1, 4.2, 4.3, 5.2 |
| Panel outputs of the golden review | The resolution answers exactly the disagreements | 4.4, 5.2 |
| Panel outputs of the golden review | Invalid panel outputs are rejected | 5.1, 5.2 |
| Signatures of the reviewed golden answers | Every golden answer judged correct or partial carries both panel signatures | 6.1, 6.3 |
| Signatures of the reviewed golden answers | A golden answer judged incorrect carries no signature | 6.1, 6.3, 6.4, 6.5 |
| Golden review report | The report's verdicts and agreement match the panel files | 6.2, 6.5 |
| Golden review report | The report states its criterion, panel and limitations | 1.1, 6.2, 6.5 |
| Criterion first and immutable panel record | The report's criterion is the Panel group's criterion | 1.1, 1.2, 6.2, 13.7 |
| Criterion first and immutable panel record | The criterion precedes the input and nothing in the record is rewritten | 1.2, 2.3, 4.3, 4.4, 8.3 |

No empty row.

## Corrections to apply

All corrections are improvable. None blocks the apply. I1 and I2 touch the Panel group and should be applied before task 1.1 runs, because the Criterion block becomes immutable at task 1.2.

### `tasks.md`

- **Panel group → Criterion block (I1).** Add the bullet before task 1.1 runs:
  > - A statement is backed when the lines of all the evidence entries it cites, taken together, show everything it claims; it is `unverifiable` when some claimed part is shown by none of them, or when a cited entry does not exist. A statement with any part contradicted by the code is `false`.
- **Panel group → Output format (I2, I6).** Add:
  > Never quote a secret value from the fixture (cite its line instead); an output containing `AKIA` followed by 16 upper-case letters or digits is rejected. Files loaded automatically by the harness (`CLAUDE.md`, memory files) are not read by you and are not listed in `sourcesRead`.
- **4.3 (I7).** Replace "write both outputs exactly as returned (two-space JSON, LF, final newline)" with:
  > write both outputs with the content exactly as returned; only line endings are normalised to LF and a final newline is added; nothing else is reformatted
- **5.1 / 5.2 (I2).** Add a copy containing an `AKIA…` value to the rejection cases, and the matching check to the validator.

### `specs/golden-answers/spec.md`

- **"Panel outputs of the golden review" → Citations (I4).** Append: "A path with a `..` segment is not inside the fixture."
- **"Panel outputs of the golden review" (I2).** Add: "No output SHALL match `/AKIA[A-Z0-9]{16}/`." Add "an `AKIA` value" to the copies of the scenario "Invalid panel outputs are rejected".
- **Scenario "The resolution answers exactly the disagreements" (I5).** THEN: replace "the resolution has a `resolver`" with "the resolution has a `resolver` matching the model pattern and a real `date`".
- **Scenario "The report's verdicts and agreement match the panel files" (I5).** THEN: add "`## Agreement` contains `n = 7` and the word `indicative`". Update task 6.2 to match.

### `design.md`

- **D5 (I3).** Replace "stopping the ticket (not a clean-stop condition of the run contract)" with "stopping the ticket (an `incorrect` verdict is an expected outcome and must have a path that finishes the change)".
- **D7 (I3, I8).** Add the following:
  > A rejected output is a ticket-specific clean stop: the step returns `ok=false` with the failing check and the author decides. A later fixture change that breaks a panel citation invalidates the review and needs a new panel, like a regenerated entry.
- **D8 (I4).** Replace "Only `cohenKappa` is exported by the script" with:
  > `roundRatio` and `fixtureLines` are not exported, and the exported `validateOutput` is bound to the DIS-80 `sites` shape; the test imports only `cohenKappa`.

  Also add that `fixtureLines`' rejection of `..` and of a leading `/` is copied.
- **Follow-ups.** Add rows SA3-I1 … SA3-I8 with destination A.

### `proposal.md`

- **Impact (I2).** "The panel input copies no `excerpt`, so the planted secret … does not leave the fixture" → "The panel input copies no `excerpt`, and neither the panel outputs nor the report may quote the planted secret of `fixtures/task-api/src/config/env.ts`".

### Task 11.2 (`docs/project-context.md` text it will write) (I8)

- Add: "a fixture change that breaks a citation of the panel files invalidates the review and needs a new panel".

### Linear DIS-33 (Spanish; the `[original]` block is never touched)

Comment:
> **Auditoría de spec, ejecución 3 (texto del agente, 2026-10-28): APPROVED, 0 bloqueantes.** Mejoras recomendadas antes de la tarea 1.1, porque el bloque Criterion queda inmutable en la 1.2:
> - (I1) Cómo se juzga un statement que cita varias evidencias o que es en parte falso.
> - (I2) Las salidas del panel no deben citar el secreto plantado de `env.ts`, y el validador las rechaza si lo hacen.
> - (I6) `CLAUDE.md` y la memoria no se listan en `sourcesRead`.
>
> Otras mejoras:
> - (I3) Coherencia entre D5 y D7 sobre la parada del ticket.
> - (I4) Corregir en D8 qué exporta `scripts/annotation-agreement.mjs`, y que un `..` no vale en una cita.
> - (I5) Los escenarios comprueban `n = 7`, «indicative» y el `resolver` y la fecha de la resolución.
> - (I7) La tarea 4.3 no reformatea las salidas.
> - (I8) Un cambio posterior del fixture que rompa una cita exige un panel nuevo.
