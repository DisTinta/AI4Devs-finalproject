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
