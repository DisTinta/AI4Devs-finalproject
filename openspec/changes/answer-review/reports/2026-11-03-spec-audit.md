CHANGES REQUIRED

**Questions for the author:** none. The parent DIS-53 still describes the review of the 40 answers as "trabajo humano de la autora". The sub-issue's `[original]` block records the author's later decision (2026-10-27) to hand the review to independent reviewer agents, and proposal.md says this decision prevails. Because the author recorded it herself, no scope question is left open (see 2-I1 for the ticket note).

Audit of `openspec/changes/answer-review` (DIS-82, parent DIS-53). First audit, 2026-11-03. Inputs read:
- the change: proposal, design, both deltas, tasks
- the tickets: DIS-82 and DIS-53, with their comments
- the project: `docs/base-standards.md`, `docs/openspec-tasks-mandatory-steps.md`, `docs/AUTONOMOUS-RUN.md` §2 and §10, `docs/project-context.md` (DIS-80/81 entries), `docs/backend-standards.md` (nothing about scripts), `openspec/specs/context-measurement/spec.md`
- the code and data: `scripts/annotation-agreement.mjs` and its `.d.mts`, `scripts/measure-graph.mjs` (`formatAgreement`), `scripts/measure-context.mjs` exports, `tests/unit/docs/context-savings.spec.ts`, `readme.md` §2.6, `docs/measurements/context-savings.md` § Limitaciones, `docs/measurements/context/answers/*.json` (structure and evidence paths only), `questions.json`
- ADRs: none in `docs/adr/` bears on this change.

## 1. Scope against the ticket

Clean. Everything in the change follows from the DIS-82 DoD, its procedure, the author's blindness note or the reality map:
- the criterion file
- the panel
- `verdicts.csv` linked to the criterion
- agreement as a percent and as Cohen's kappa
- the frozen report
- the Table 1 cell, the verdict lines and the limitations
- the MODIFIED "Measurement report" requirement
- the rewrite of the Linear description so the reviewers stay blind

The docs updates (`docs/project-context.md`, `prompts.md`) are the project's mandatory documentation steps. The change does not widen to the parent's Table 2 or to `measure-graph`.

## 2. Inherited acceptance criteria

- **2-B1 (blocking).** DIS-82 AC3 says "Una resolución con un id de más o de menos sale con código 1 sin escribir nada". The scenario "A missing or extra resolution fails the merge" checks only that the merge "fails ... and writes no file", and the two CLI scenarios cover usage errors (exit 2) and `agreement` (exit 1). No scenario pins exit code `1` for `merge`. **Fix:** in spec `answer-review` → "Answer review CLI", add the scenario "A failed merge writes no verdicts file": WHEN `merge` runs and the resolution misses a disagreement or answers an agreed answer, THEN it exits `1`, prints the project and question on stderr, and `verdicts.csv` is not written. Add the name to task 1.1 (18 cases) and to the totals in task 7.2 (28).
- All other inherited criteria have a requirement and a scenario: DIS-82 AC1, AC2, AC4, AC5 and DoD bullets 1–3; DIS-53 AC3, as far as Table 1 is concerned ("sin (pendiente)" becomes "no cell reads `pendiente de DIS-82`"; the limitations wording is updated).
- **2-I1 (improvable).** DIS-53 still says "la revisión de 40 respuestas son trabajo humano de la autora" and "la columna «correctas» la rellena la autora". For DIS-80 a comment on DIS-53 recorded that the sub-issue prevails. Do the same for DIS-82 (see the Linear corrections).

## 3. Missing scenarios

- **3-I1 (improvable).** The "Review output validation" requirement says a resolution has "no `reviewer` and no `model` field", and DIS-80 rejects such a field. No scenario covers a resolution that carries either field. Add it to the WHEN and THEN of "An incomplete review output is rejected".
- **3-I2 (improvable).** "Frozen verdicts and review report" says "The report SHALL NOT say `revisión humana` or `a mano`" for the whole report. The scenario "The report states the method, the agreement and every disagreement" checks only `## Método`. Make the scenario check the whole report.
- Every other MUST has a scenario.

## 4. Ambiguity

Clean. A case-insensitive search of every artifact for "fast", "easy", "secure", "efficient", "many", "appropriate" and "robust" finds nothing.

## 5. Open decisions

- **5-B1 (blocking).** The `hashes` command on a missing or unreadable frozen file is undefined. The CLI requirement gives exit `1` only "when validation or the merge fails". DIS-80 exits `1` with `<path>: the file cannot be read`, but this spec does not say so, and manual test 9.1 runs on a scratchpad copy where this case can happen. **Fix:** in the "Answer review CLI" requirement, add: "`hashes` SHALL exit `1`, naming each unreadable file on stderr and printing no hash line, when a frozen file cannot be read". Also add this case to the scenario "hashes prints the eight files in order", or to a new scenario that tasks 1.1 and 7.2 count.
- **5-B2 (blocking).** The criterion has no rule for claims about files the reviewers may not read. The Panel criterion says "An `evidence` excerpt is a pointer, not proof: check what is claimed in the fixture file itself". But 12 of the 134 `evidence` entries in the two answer files point to `tests/`, `docs/` or `README` paths of the fixtures, and P2 and the allowlist forbid all of them. Some statements also make claims about what a test file shows. Each reviewer would decide alone whether such a claim is "unsupported" (`partial`) or out of scope. That produces disagreements caused by the rules rather than by the code, and the criterion must be fixed before any judgement (D8). **Fix:** add a criterion bullet in tasks.md → Panel → **Criterion**: "A claim about the content of a fixture file outside the allowlist (its `tests/`, `docs/` or `README.md`) is judged only by the behaviour it states, against the application code; the file itself is not read, and a claim that states only what such a file says, with no behaviour checkable in the application code, counts as a claim without support in the code." Add the same rule to the `## Lo que no cuenta` / `## Veredictos` content required by spec "Correctness criterion", so that task 2.1 carries it into `criterion.md`.
- **5-B3 (blocking).** The report table cells are not fixed, and the docs test will pin them. "Frozen verdicts and review report" fixes the headers of `## Resultados` (`| Repositorio | Correctas | Parciales | Incorrectas |`) and `## Desacuerdos` (`| Repositorio | Pregunta | Revisor 1 | Revisor 2 | Resolución |`), but not the cell contents. Three choices are open:
  - whether «Repositorio» is `` `acme-shop` `` or "`acme-shop` (PHP/Laravel)", as in Table 1
  - whether «Pregunta» is `Q05` or the question text
  - whether the verdict cells are the English values (`correct`) or Spanish words ("correcta")

  The scenario says «Resolución» "equals the `resolved` verdict of `verdicts.csv`", which implies English values but does not state it. **Fix:** add to the requirement: "«Repositorio» is the fixture name in backticks (`` `acme-shop` ``), «Pregunta» is the `questionId` (`Q05`), and the verdict cells are the English values of `verdicts.csv` (`correct`, `partial`, `incorrect`) in backticks; the counts are plain integers."
- **5-I1 (improvable).** Number rendering is decided only by reference. "`no trailing ,0`" with the examples `0,857` and `92,5 %` does not say whether kappa 0.85 is written `0,85` or `0,850`, or whether kappa 1 is written `1` or `1,000`. Design P7 settles it indirectly through `formatAgreement` (`String(value).replace('.', ',')`, `scripts/measure-graph.mjs:329`). State it in the "Published Table 1" delta: "each number is written as its shortest decimal form with a decimal comma (`1`, `0,85`, `-0,111`)".
- **5-I2 (improvable).** In the "Review output validation" requirement, `reviewer` "is `1` or `2`" does not say a JSON number (the Panel format shows `<1|2>` unquoted), and `date` is only "a non-empty string" while the Panel format fixes `YYYY-MM-DD`. State "a JSON number" and either validate the date format or say explicitly that it is not validated.
- **5-I3 (improvable).** AC1 expects the outputs in `questionId` order, but the spec lists no order rejection, so an out-of-order output is accepted by omission. Add to "Review output validation": "the order of `answers` is not checked; agreement and merge use the order of the answer files".
- **5-I4 (improvable).** Task 4.3 stops the ticket on a rejected reviewer output, and the spec forbids completing or correcting it. Neither says whether a reviewer may be re-run from scratch. Record the choice in design (for example P11: "a rejected output stops the ticket; a fresh re-run of that reviewer is the author's call", destination D).

## 6. Contradictions inside the change

Clean. The following agree:
- the proposal, design and spec on the output shapes, the allowlists, the commit order (P9 against procedure step 4), the CLI and the eight frozen files
- the README line format in the "Published Table 1" delta and DIS-82 AC4
- P2's narrowing of "ficheros bajo `fixtures/<fixture>/`" from the ticket, which is explicit and declared to prevail ("this group prevails")

Minor wording (improvable, 6-I1): the spec says the `## Concordancia` lines use "the format of the requirement 'Published Table 1'", which includes the leading `- ` and the verdict counts. Say whether the report lines keep the `- ` prefix (the README ones do, as `projectLine` does).

## 7. Contradictions with the project

- Clean on the substance. The agent merging (task 13.7), writing the "why" and editing a named existing test are covered by `docs/AUTONOMOUS-RUN.md` §2 (rules 4, 8 and 9, and Pre-merge point 5). Spanish documents follow the precedent of `docs/measurements/annotation-agreement.md` and `readme.md`. The MODIFIED "Published Table 1" and "Measurement report" blocks reproduce the main spec (`openspec/specs/context-measurement/spec.md` lines 472–548) in full, with only the DIS-82 parts changed. Nothing is lost.
- **7-I1 (improvable).** `docs/AUTONOMOUS-RUN.md` §2, rule 8 (the agent writes the "why" and marks it as its own). The first paragraph of proposal.md "## Why" is not marked as agent's text; only the second paragraph is. Mark it.

## 8. Contrast with the real code

- The design's claims match the code:
  - `cohenKappa`, `roundRatio`, `sha256` and `checkFreeze` are exported and typed (`scripts/annotation-agreement.mjs:274, 288, 439, 452`; `.d.mts:106–124`).
  - `checkFreeze` parses any `## Hashes SHA-256` table, as P7 says.
  - The citation regex is not exported and is `.php|.ts` only (`:82`), as P4 says.
  - `csvRow` / the field writer of `scripts/measure-context.mjs` is not exported (`:681–695`), as P6 says.
  - `formatAgreement` uses the decimal-comma rule (`scripts/measure-graph.mjs:329–342`).
  - The existing test to change is the one at `tests/unit/docs/context-savings.spec.ts:102–115`.
- **8-I1 (improvable).** D10 says "no se toca un script congelado de DIS-80", but `scripts/annotation-agreement.mjs` is not in its hash table (`FROZEN_FILES`, `:39–47`). Only the data files are frozen. The new script will also re-implement non-exported helpers almost verbatim: `isObject`, `isDirectory`, `fixtureLines`, `sourceProblem`, `loadJson`, `fail` and `parseArguments` (`:93–157`, `:484–503`, `:605–623`), roughly 120 lines. Either correct D10's reason to "not modified, to keep DIS-80's merged code and tests untouched" and record the duplication as accepted (destination D), or export `fixtureLines` / `sourceProblem` / `parseArguments` from the DIS-80 script. Its tests would stay unchanged.
- Blindness was spot-checked with the P1 pattern: no hit in `tasks.md`, `docs/base-standards.md`, `fixtures/**` (without `node_modules`), `answers/*.json` or `questions.json`. The hits are in `context-savings.*`, `raw/`, `readme.md` and the current DIS-82 description, which are all forbidden or scheduled for the scrub in task 3.1. `docs/AUTONOMOUS-RUN.md:527` is the generic `ollama` line that P1 accepts for the resolver.

## 9. Task size

- **9-I1 (improvable).** Tasks 1.1 (17 tests) and 1.2 (a script of about 500 lines with 7 exports and the CLI) are the largest. They mirror DIS-80, which fitted, so they are acceptable. Splitting them into three red-green pairs (validation; agreement and merge; CLI and hashes) would lower the risk of one oversized turn.
- Every other task fits one turn.

## 10. Mandatory steps

Clean:
- Step 0 is first and checks the branch `feature/dis-82-answer-review` (prefix `feature/`, ticket id).
- The steps are numbered 0–13 in sequence.
- The sections "Review and Update Existing Tests (MANDATORY)", "Run Tests and Verify Data State (MANDATORY)" (baseline 0.4, post-state 8.3, report path 8.5), "Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)" (success path, error cases, restoration in 9.3, report 9.4), "End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)" (justified N/A) and "Update Technical Documentation (MANDATORY)" are present.
- Pre-merge Review is last, with the three checks in order, fixes on the same PR, and the archive commit before the merge. The merge goes through the gate, as `docs/AUTONOMOUS-RUN.md` §2 allows.
- Every command exists (`package.json` scripts and `scripts/dev-processes.mjs`).

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| Correctness criterion | The criterion defines the verdicts and names no model | 2.1, 2.2, 6.1 |
| Review output validation | A complete review output is accepted | 1.1, 1.2 |
| | An incomplete review output is rejected | 1.1, 1.2, 9.2 |
| | A verdict outside the three values is rejected | 1.1, 1.2 |
| | A reason without a valid citation is rejected | 1.1, 1.2, 9.2 |
| | A declared forbidden source is rejected | 1.1, 1.2, 9.2 |
| | A sourcesRead entry that is a directory or a glob is rejected | 1.1, 1.2 |
| | A resolution with a source outside the resolver allowlist is rejected | 1.1, 1.2 |
| Review agreement measures | Percent agreement and Cohen's kappa per project | 1.1, 1.2, 4.3 |
| | Kappa is undefined when the expected agreement is 1 | 1.1, 1.2 |
| Deterministic merge into the verdicts | Agreed answers take the common verdict | 1.1, 1.2, 5.1 |
| | Disagreements take the resolution | 1.1, 1.2, 5.1 |
| | A missing or extra resolution fails the merge | 1.1, 1.2, 9.2 |
| | The merge is deterministic | 1.1, 1.2, 5.2 |
| | A CSV field with a comma, a quote and a line break is quoted | 1.1, 1.2 |
| Answer review CLI | An unknown command is a usage error | 1.1, 1.2, 9.2 |
| | A rejected review output writes no agreement file | 1.1, 1.2, 9.2 |
| | hashes prints the eight files in order | 1.1, 1.2, 9.1 |
| | (missing: merge exit 1, see 2-B1; hashes on an unreadable file, see 5-B1) | — |
| Frozen verdicts and review report | The recorded hashes match the frozen files | 6.1, 6.2, 6.4, 8.3 |
| | A changed review file fails the freeze check | 6.1 |
| | The report states the method, the agreement and every disagreement | 6.1, 6.2 |
| Published Table 1 (MODIFIED) | The README Table 1 agrees with the measurement | 6.1 (existing test edited), 7.1 |
| | A negative savings is explained | 7.1 (unchanged) |
| | The README limitations and verifier row are current | 7.1 (unchanged) |
| | The Correctas column agrees with the verdicts | 6.1, 6.3 |
| Measurement report (MODIFIED) | The report agrees with the measurement | 7.1 (unchanged) |
| | The measurement report links the answer review | 6.1, 6.3 |

The table has no hole for any existing scenario. Its only empty row is the CLI scenario that the requirement implies but the spec does not write (2-B1 and 5-B1). It is counted as blocking there, not twice.

## Corrections to apply

### `openspec/changes/answer-review/specs/answer-review/spec.md`
1. **"Review output validation":**
   - After "`reviewer` is `1` or `2`", insert "(a JSON number)".
   - After "`model` and `date` are non-empty strings", add "(`date` in the form `YYYY-MM-DD`)", or say that it is not validated.
   - Add the sentence: "The order of `answers` is not checked; agreement and merge use the order of the answer files."
   - Add the rejection "a resolution holding a `reviewer` or `model` field" to the rejection list. (3-I1, 5-I2, 5-I3)
2. **Scenario "An incomplete review output is rejected":** add to the WHEN "or is a resolution holding a `reviewer` or `model` field", and to the THEN "or forbidden field". (3-I1)
3. **"Answer review CLI":**
   - Add the sentence: "`hashes` SHALL exit `1`, naming each unreadable frozen file on stderr and printing no hash line, when a frozen file cannot be read."
   - Add the scenario "A failed merge writes no verdicts file". WHEN `merge` runs and the resolution misses a disagreement or answers an agreed answer, THEN it exits `1`, prints the project and question on stderr, and `verdicts.csv` is not written.
   - Extend "hashes prints the eight files in order" with: "and with one frozen file missing it exits `1` naming it and prints no hash". (2-B1, 5-B1)
4. **"Frozen verdicts and review report":**
   - Add the sentence: "In both tables «Repositorio» is the fixture name in backticks (`` `acme-shop` ``); in `## Desacuerdos` «Pregunta» is the `questionId` (`Q05`) and «Revisor 1», «Revisor 2» and «Resolución» are the English verdict values in backticks (`` `correct` ``, `` `partial` ``, `` `incorrect` ``); counts are plain integers; the `## Concordancia` lines are the README lines including their leading `- `."
   - In the third scenario, change "`## Método` holds the freeze sentence and does not say `revisión humana` nor `a mano`" to "`## Método` holds the freeze sentence, the report does not say `revisión humana` nor `a mano` anywhere". (5-B3, 6-I1, 3-I2)
5. **"Correctness criterion":** require that `## Veredictos` states the rule for claims about fixture files outside the reviewer allowlist (the text of tasks correction 1). (5-B2)

### `openspec/changes/answer-review/specs/context-measurement/spec.md`
6. **"Published Table 1":** after "written with a decimal comma and no trailing `,0`", add "(the shortest decimal form of the number: `1`, `0,85`, `-0,111`, `92,5`)". (5-I1)

### `openspec/changes/answer-review/tasks.md`
1. **Panel → Criterion:** add the bullet: "A claim about the content of a fixture file outside the allowlist (its `tests/`, `docs/` or `README.md`) is judged only by the behaviour it states, against the application code; that file is not read, and a claim that only states what such a file says, with no behaviour checkable in the application code, counts as a claim without support in the code." (5-B2)
2. **Task 1.1:** add the names "A failed merge writes no verdicts file" and any new hashes scenario. Update the count (17 → 18 or 19). (2-B1, 5-B1)
3. **Task 7.2:** update the totals to match (27 → 28 or 29).
4. **Optional:** split 1.1 and 1.2 into three red-green pairs: validation; agreement and merge; CLI and hashes. (9-I1)

### `openspec/changes/answer-review/design.md`
1. **D10 summary:** replace the "frozen script" reason with "not modified, to keep DIS-80's merged code and tests untouched". Then either record the duplicated helpers (`isObject`, `isDirectory`, `fixtureLines`, `sourceProblem`, `loadJson`, `fail`, `parseArguments`) as accepted, as a Follow-ups row with destination D, or export them from `scripts/annotation-agreement.mjs`. (8-I1)
2. **New P11:** "A rejected reviewer output stops the ticket; whether to re-run that reviewer in a fresh context is the author's call." Add a Follow-ups row with destination D. (5-I4)
3. **New decision on rendering, or an extension of P7:** numbers are written in their shortest decimal form with a decimal comma (`String(value).replace('.', ',')`). (5-I1)
4. **Follow-ups:** add one row per finding of this audit with its destination.

### `openspec/changes/answer-review/proposal.md`
1. **"## Why":** mark the first paragraph as the agent's text, for example by prefixing "*Texto del agente (ejecución autónoma, 2026-11-03).*". (7-I1)

### Linear
- **DIS-53, new comment in Spanish** (do not edit the description): "*(Comentario del agente, desde DIS-82, auditoría de spec, ejecución autónoma, 2026-11-03.)* Por decisión de la autora registrada en el bloque [original] de DIS-82 (2026-10-27), la revisión de la corrección de las 40 respuestas de la Tabla 1 la hacen dos agentes revisores independientes de modelos distintos, con un tercer agente que resuelve solo los desacuerdos y congelación por SHA-256; no es trabajo de la autora. Donde este ticket dice «la columna «correctas» la rellena la autora», «el CSV revisado por la autora» o «la revisión de 40 respuestas son trabajo humano de la autora», prevalece DIS-82. La descripción de este ticket no se ha editado." (2-I1)
- **DIS-82:** no change to `[original]`. The rewrite of `[reality-map]` and `[enhanced]` in task 3.1 should also carry the new criterion bullet for files outside the allowlist (5-B2). The Panel group prevails anyway, but this keeps the description reviewers read consistent with it.

## Resolution of run 1

*Agent's text (correction round 1, autonomous run, 2026-11-03).* The run asked no question of the
author, so no decision was needed on one. Every finding was applied; none was rejected. `openspec
validate answer-review --strict` passes after the edits, and the blindness pattern of design P1 finds
nothing in `tasks.md`.

| Finding | Resolution |
|---|---|
| 2-B1 | Fixed. New scenario "A failed merge writes no verdicts file" in spec `answer-review` → "Answer review CLI"; named in task 1.5; totals updated in task 7.2 (19 script tests, 29 in total). |
| 2-I1 | Fixed. Spanish comment posted on DIS-53 stating that DIS-82 prevails on who reviews the 40 answers; the DIS-53 description was not edited. |
| 3-I1 | Fixed. "Review output validation" rejects a resolution holding `reviewer` or `model`; the scenario "An incomplete review output is rejected" covers it in its WHEN and THEN. |
| 3-I2 | Fixed. The report scenario checks that the whole report, not only `## Método`, avoids `revisión humana` and `a mano`. |
| 5-B1 | Fixed. "Answer review CLI" says `hashes` exits `1` with `<path>: the file cannot be read` and no hash line; new scenario "hashes fails on a missing frozen file" (task 1.5) and a manual case in task 9.2. |
| 5-B2 | Fixed. Criterion bullet for claims about fixture files outside the allowlist added to the Panel group; the spec "Correctness criterion" requires it under `## Veredictos` and its scenario checks it; task 3.1 carries it into the rewritten DIS-82 description; design P13. |
| 5-B3 | Fixed. "Frozen verdicts and review report" fixes the cell formats (fixture name in backticks, `questionId`, English verdict values in backticks, plain integer counts); the scenario checks them; design P14. |
| 5-I1 | Fixed. "Published Table 1" states the shortest decimal form with a decimal comma (`1`, `0,85`, `-0,111`, `92,5`); design P7 extended. |
| 5-I2 | Fixed. `reviewer` is a JSON number; `date` is validated for the form `YYYY-MM-DD` only (the calendar date is not checked); the rejection scenario includes the string `"1"` and a malformed date. |
| 5-I3 | Fixed. "Review output validation" says the order of `answers` is not checked and agreement and merge use the order of the answer files. |
| 5-I4 | Decided by the agent. Design P12: a rejected output stops the ticket with no re-run inside the run (a re-run would let the panel repeat until it passes); a later run restarts the panel from scratch. Destination D; task 4.3 cites P12. |
| 6-I1 | Fixed. The `## Concordancia` lines are the README lines including their leading `- `. |
| 7-I1 | Fixed. The first paragraph of proposal "## Why" is marked as the agent's text. |
| 8-I1 | Decided by the agent. D10's reason corrected to "not modified, to keep DIS-80's merged code and tests untouched"; the re-implemented helpers are accepted as design P11, destination D (exporting them would edit another ticket's merged script). |
| 9-I1 | Fixed. Task 1 is split into three red-green pairs (validation 1.1–1.2, agreement and merge 1.3–1.4, CLI and hashes 1.5–1.6) and a refactor 1.7. |

Every decision has a row in design.md → Follow-ups (P11–P14 and the "Audit" rows); none has
destination C.

---

## Run 2 (2026-11-03)

APPROVED

**Questions for the author:** none. The scope conflict with the parent was settled in run 1: DIS-53 says the review is the author's work, and DIS-82 `[original]` records the author's decision of 2026-10-27 to hand it to agents. A comment on DIS-53 now says DIS-82 prevails. The agent's decisions P11–P14 answer earlier findings and contradict neither the ticket nor the project.

Audit of `openspec/changes/answer-review` (DIS-82, parent DIS-53), run 2, 2026-11-03. I judged the change as it stands after correction round 1.

Inputs read:
- **The change:** proposal, design, both deltas, tasks, and the run 1 report with its resolution.
- **The tickets:** DIS-82 (description and its 4 comments) and DIS-53 (description and its 2 comments), through Linear.
- **The project:** `docs/base-standards.md`, `docs/AUTONOMOUS-RUN.md` (the `panel` and `ollama` rows).
- **The code:**
  - `.claude/workflows/autonomous-sdd.js` (`runPanel`, `COMMON`, `context`)
  - `scripts/annotation-agreement.mjs` (exports)
  - `tests/unit/docs/context-savings.spec.ts`
- **Fixture layout:** `fixtures/*/tests/**`.
- **Blindness check:** I ran the P1 pattern over the allowlist.

## 1. Scope against the ticket

Clean. Every artifact follows from the DIS-82 DoD, its procedure, the blindness note in `[original]` or the reality map. The run 1 additions do not widen the scope: P11–P14, the two new CLI scenarios, the criterion rule for files outside the allowlist, and the fixed report cell formats. The change does not touch Table 2, `measure-graph` or `fixtures/annotations/`.

## 2. Inherited acceptance criteria

Clean.
- **AC1:** "Review agreement measures" and its two scenarios. The AC's "en orden de `questionId`" is relaxed by P14 / 5-I3: order is not checked, and agreement and merge follow the answer files. This is an acceptable agent decision; it rejects nothing the AC accepts.
- **AC2:** "A declared forbidden source is rejected", the directory/glob scenario, "A reason without a valid citation is rejected", "An incomplete review output is rejected" (missing `model`, missing or extra `questionId`) and "A rejected review output writes no agreement file" (exit `1`).
- **AC3:** the merge scenarios, plus "A failed merge writes no verdicts file" (exit `1`).
- **AC4:** "The Correctas column agrees with the verdicts", together with the MODIFIED existing test.
- **AC5:** "The recorded hashes match the frozen files", "A changed review file fails the freeze check", "hashes prints the eight files in order" and "An unknown command is a usage error".
- **DoD:** the criterion is linked from every CSV row (`criterion` column). Each verdict cites `file:line`. Agreement is published next to Table 1.
- **DIS-53 AC3**, as far as Table 1 goes: no cell reads `pendiente de DIS-82`, and the limitations wording is updated.

## 3. Missing scenarios

Clean. Every MUST clause now has a scenario: the resolution with `reviewer`/`model`, the whole-report wording check, `hashes` on a missing file, and `merge` exit `1`.

## 4. Ambiguity

Clean. A case-insensitive search of proposal, design, both deltas and tasks finds none of "fast", "easy", "secure", "efficient", "many", "appropriate" or "robust".

## 5. Open decisions

No blocking open decision is left.

- **5-I1 (improvable): the citation rule accepts files the reviewers may not read.**
  - **What the spec says:** "Review output validation" counts a citation as valid when `<path>` "names an existing file" of the fixture with a `.php`, `.ts` or `.json` ending.
  - **What that accepts:** `tests/Feature/CheckoutTest.php`, `tests/unit/task.service.test.ts` (both exist: `fixtures/acme-shop/tests/**`, `fixtures/task-api/tests/**`) and any `node_modules/**/*.json` under `fixtures/task-api/`.
  - **The conflict:** the Panel criterion and P2/P13 forbid reading those files ("that file is not read"). A reason whose only citation is a test file passes validation, although it shows a forbidden read.
  - **Severity:** the behaviour is determinate (so not blocking) and follows the DIS-80 precedent. But it weakens D5.
  - **Fix:** restrict a valid citation to the reviewer allowlist of that fixture. Extend the scenario "A reason without a valid citation is rejected" with "a file under the fixture's `tests/`". The test count does not change.

## 6. Contradictions inside the change

- **6-I1 (improvable): P9 and task 8.3 disagree on the `git log` evidence.**
  - Design P9 gives `git log --format='%h %s' -- <path>`. Task 8.3 gives `git log --format='%h %ad %s' --date=iso -- <path>`.
  - P9 says it goes in the step 8 report; task 8.3 says "recorded in the report" without naming which.
  - **Fix:** align P9 with task 8.3 (the format with the date) and name the target in 8.3: "recorded in the step 8 report (task 8.5)". Neither report is in the hash table, so either target is safe after the freeze commit of task 6.4.
- **6-I2 (improvable): stale numbering in design.md.** "## Decisions" says "P1–P10 are taken in this proposal", and the "## Follow-ups" intro says "(P1–P10)". The design now runs to P14. **Fix:** "P1–P14 (P11–P14 from the spec audit, correction round 1)".

Everything else agrees across the proposal, the design and both deltas:
- the output shapes and allowlists
- the eight frozen files and their order
- the CLI exit codes
- the commit order
- the README line format and its decimal rule
- the report cell formats

## 7. Contradictions with the project

Clean.
- `docs/base-standards.md`: Spanish documents are allowed by the project's precedent. Tasks name the one existing test that changes (rule 4 territory, explicit).
- `docs/AUTONOMOUS-RUN.md`: the agent merges and writes the "why" (marked as its own), as §2 and the `panel` row (line 529) allow.
- The MODIFIED blocks keep the main spec's content and change only the DIS-82 parts.
- No ADR bears on the change.

## 8. Contrast with the real code

Every design claim checks out against the code:
- **Exports:** `cohenKappa`, `roundRatio`, `sha256` and `checkFreeze` are exported (`scripts/annotation-agreement.mjs:274, 288, 439, 452`).
- **The test that changes:** "The README Table 1 agrees with the measurement" (`tests/unit/docs/context-savings.spec.ts:102–115`) pins `'pendiente de DIS-82'` at line 109. That is the only edit needed.
- **The test that stays:** "The report agrees with the measurement" (`:151–170`) checks only that `## Limitaciones` is not empty. It survives the §Limitaciones edit unchanged.
- **The README limitations test:** it (`:127–144`) does not depend on the DIS-82 wording.
- **Workflow blindness:**
  - The panelist prompt (`.claude/workflows/autonomous-sdd.js:146–147`) carries the author's note only, with no model name.
  - The resolver's step prompt (`COMMON`, `:62–74`) holds no generator model name, but it points to `docs/AUTONOMOUS-RUN.md` §6. This is why that file is on the resolver allowlist, as P1 accepts.
  - The P1 pattern finds nothing in `tasks.md`, `docs/base-standards.md`, `fixtures/**` (outside `node_modules`), `questions.json` or `answers/*.json`.
  - The only hits left are in the DIS-82 `[reality-map]` / `[enhanced]` sections (the DIS-81 link slug and the field names). Task 3.1 scrubs them before the panel, and task 3.2 checks the result.
- **8-I1 (improvable):** task 6.1 says of `tests/unit/docs/context-savings.spec.ts` that "its other two tests are not edited", and design P8 says "The other two tests of that file are unchanged". The file has seven tests (`:28, 42, 46, 102, 117, 127, 151`); "two" counts only the other tests of `describe('Published Table 1')`. **Fix:** "the other six tests of that file are not edited". Task 7.1 already says this correctly.

## 9. Task size

Clean. Task 1 is now three red-green pairs (7, 7 and 5 tests) plus a refactor. Every other task fits one turn.

## 10. Mandatory steps

Clean.
- Step 0 creates and checks the branch `feature/dis-82-answer-review` and records the baseline (0.4).
- Steps 7–11 are present and labelled MANDATORY:
  - post-state check in 8.3 and report in 8.5
  - manual CLI tests on a scratchpad copy in 9.1–9.2, restoration in 9.3, report in 9.4
  - E2E marked N/A with a reason in 10.1
  - documentation in step 11
- Pre-merge review (13) runs last. The archive commit comes before the merge.

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| Correctness criterion | The criterion defines the verdicts and names no model | 2.1, 2.2, 6.1 |
| Review output validation | A complete review output is accepted | 1.1, 1.2 |
| | An incomplete review output is rejected | 1.1, 1.2, 9.2 |
| | A verdict outside the three values is rejected | 1.1, 1.2 |
| | A reason without a valid citation is rejected | 1.1, 1.2, 9.2 |
| | A declared forbidden source is rejected | 1.1, 1.2, 9.2 |
| | A sourcesRead entry that is a directory or a glob is rejected | 1.1, 1.2 |
| | A resolution with a source outside the resolver allowlist is rejected | 1.1, 1.2 |
| Review agreement measures | Percent agreement and Cohen's kappa per project | 1.3, 1.4, 4.3 |
| | Kappa is undefined when the expected agreement is 1 | 1.3, 1.4 |
| Deterministic merge into the verdicts | Agreed answers take the common verdict | 1.3, 1.4, 5.1 |
| | Disagreements take the resolution | 1.3, 1.4, 5.1 |
| | A missing or extra resolution fails the merge | 1.3, 1.4, 9.2 |
| | The merge is deterministic | 1.3, 1.4, 5.2 |
| | A CSV field with a comma, a quote and a line break is quoted | 1.3, 1.4 |
| Answer review CLI | An unknown command is a usage error | 1.5, 1.6, 9.2 |
| | A rejected review output writes no agreement file | 1.5, 1.6, 9.2 |
| | hashes prints the eight files in order | 1.5, 1.6, 9.1 |
| | A failed merge writes no verdicts file | 1.5, 1.6, 9.2 |
| | hashes fails on a missing frozen file | 1.5, 1.6, 9.2 |
| Frozen verdicts and review report | The recorded hashes match the frozen files | 6.1, 6.2, 6.4, 8.3 |
| | A changed review file fails the freeze check | 6.1 |
| | The report states the method, the agreement and every disagreement | 6.1, 6.2 |
| Published Table 1 (MODIFIED) | The README Table 1 agrees with the measurement | 6.1 (existing test edited), 7.1 |
| | A negative savings is explained | 7.1 (unchanged) |
| | The README limitations and verifier row are current | 7.1 (unchanged) |
| Measurement report (MODIFIED) | The report agrees with the measurement | 7.1 (unchanged) |
| | The measurement report links the answer review | 6.1, 6.3 |

No empty row. There are 29 scenarios, which matches task 7.2: 19 in the script test, 6 in the new docs test and 4 existing.

## Corrections to apply

All improvable. None blocks the apply.

### `openspec/changes/answer-review/specs/answer-review/spec.md`
1. **"Review output validation" (5-I1):**
   - Replace "is relative to the root of the answer's fixture (`fixtures/acme-shop/` or `fixtures/task-api/`) and names an existing file of it" with "is relative to the root of the answer's fixture (`fixtures/acme-shop/` or `fixtures/task-api/`) and names an existing file of it that is in the reviewer allowlist (under one of that fixture's allowed prefixes, or one of its allowed files)".
   - In the scenario "A reason without a valid citation is rejected", extend the WHEN to: "…a file of the other fixture, a file under the fixture's `tests/`, line 0 or a line beyond the end of the file".

### `openspec/changes/answer-review/tasks.md`
1. **Panel → Output format (5-I1):** change "must name an existing `.php`, `.ts` or `.json` file of the answer's fixture" to "must name an existing `.php`, `.ts` or `.json` file of the answer's fixture from the allowlist (never its `tests/` or `node_modules/`)".
2. **Task 6.1 (8-I1):** change "its other two tests are not edited" to "its other six tests are not edited".
3. **Task 8.3 (6-I1):** change "recorded in the report" to "recorded in the step 8 report (task 8.5)".

### `openspec/changes/answer-review/design.md`
1. **"## Decisions" intro and "## Follow-ups" intro (6-I2):** replace "P1–P10" with "P1–P14 (P11–P14 from the spec audit, correction round 1)".
2. **P8 (8-I1):** change "The other two tests of that file are unchanged" to "The other six tests of that file are unchanged".
3. **P9 (6-I1):** change the format to `git log --format='%h %ad %s' --date=iso -- <path>` and say "recorded in the step 8 report".
4. **Follow-ups:** add rows "Audit run 2 5-I1", "6-I1", "6-I2" and "8-I1", each with destination **A** (this change).

### Linear
- **DIS-82:** add a Spanish comment summarising run 2, for example: "*(Texto del agente, auditoría de spec, ronda 2, ejecución autónoma, 2026-11-03.)* Veredicto APPROVED, sin hallazgos bloqueantes. Cuatro mejoras aplicadas a los artefactos del cambio: las citas válidas se limitan a los ficheros permitidos del fixture (nunca `tests/` ni `node_modules/`), se alinea el formato de `git log` de P9 con la tarea 8.3, se actualiza la numeración P1–P14 y se corrige el número de tests no editados de `context-savings.spec.ts`."
  - If 5-I1 is applied, the rewritten `[enhanced]` section of task 3.1 should state the same citation restriction.
  - `[original]` is not touched.
  - **DIS-53:** no change.
