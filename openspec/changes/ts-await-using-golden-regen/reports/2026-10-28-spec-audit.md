CHANGES REQUIRED

**Questions for the author**

- Q1 (scope, not blocking): the author's instruction says "regenera las golden de task-api". The change regenerates **both** golden files (six answers) because the analyzer fingerprint is shared (`packages/cli/src/seed/fingerprint.ts:30-41`, E3/D3). The reason holds technically. Please confirm two things: (a) the widening, and (b) that the new answers for acme-shop Q1 and Q4 can resolve DIS-108 and DIS-109 inside this change (E7/D9, destination B).

**Ticket context.** DIS-107 has no parent (`parentId: null`). The sub-issue alone bounds the change. I read its `[original]`, `[reality-map]` and `[enhanced]` parts (AC 1–5, E1–E10) and its three comments.

---

## 1. Scope against the ticket

Clean. Every artifact follows from DIS-107:
- the fix (AC1, E1);
- the seed and golden regeneration (AC3, E3, E4);
- the second panel round with the retargeted coherence test (AC4, E5, E6);
- the signatures and pending tickets (AC5, E7, E8);
- the docs named in "Contexto técnico".

The only widening is acme-shop. The ticket already records it (E3), and it is raised as Q1 above. Manual task 11.1 (index a scratch repository) checks the fix through the real CLI. It is verification, not invented scope.

## 2. Inherited acceptance criteria

There is no parent, so no criteria are inherited. The sub-issue's own AC are covered:
- AC1 → code-analysis "Other variable forms are not function symbols".
- AC2 → the unchanged scenario "Module-level const functions are function symbols", plus task 10.2.
- AC3 → existing main-spec requirements: golden-answers "The versioned golden file is coherent", the `verify` fingerprint rule, and ADR `docs/adr/20261017-stale-fingerprint-fails-verify.md`. Tasks 3.1–3.3, 10.4 and 15.2 (CI `verify` job) cover it. No new scenario is needed.
- AC4 → the five golden-answers requirements of the delta.
- AC5 → "Signatures of the reviewed golden answers".

AC4 says "dos panelistas ciegos". See finding B1, which breaks that blindness.

## 3. Missing scenarios

- **I3 (improvable).** golden-answers, "Signatures of the reviewed golden answers": the MUST clause "against the regenerated version committed before the panel input, nothing but `reviews` SHALL change in it" has no scenario. Only task 10.3 checks it (`git diff <3.4> -- seeds/cache`). Correction: add it to the THEN clause of "The criterion precedes the input and nothing in the record is rewritten" (see Corrections).

Everything else is covered. In code-analysis, the new `using` / `await using` clause is covered by the extended scenario. The DIS-33 criterion equality is covered by "The report's criterion is the Panel group's criterion". The immutability of the DIS-33 files is covered by the git scenario.

## 4. Ambiguity

Clean. None of "fast", "easy", "secure", "efficient", "many", "appropriate" or "robust" appears in proposal, design, deltas or tasks.

## 5. Open decisions

- **B1 (blocking): the panel is not blind, because the allowed `tasks.md` names the previous verdicts.**
  - The panelist allowlist contains the whole file `openspec/changes/ts-await-using-golden-regen/tasks.md` (golden-answers delta, "Allowlists"; Panel group "Allowed sources"). A panelist has to open the whole file to find the Panel group.
  - Outside that group, the file states the previous round's outcome:
    - task 0.4: "task-api Q1–Q3 and acme-shop Q3 signed by DIS-33, acme-shop Q1 and Q4 empty";
    - task 8.3: "acme-shop Q1 `incorrect` → DIS-108; acme-shop Q4 `incorrect` → DIS-109".
  - D6 forbids every Linear description for exactly this reason ("the description of DIS-107 names the previous verdicts"). The change then leaks the same information through a file it allows.
  - The implementer is left to decide alone whether to show the panel this text. As written, the panel sees it, which contradicts AC4 ("ciegos") and D6.
  - Correction:
    - Remove every per-item verdict, signature state and pending-ticket mapping from `tasks.md` outside the Panel group. `design.md` D9 already holds the mapping, and panelists may not read it.
    - Add a check to task 5.1.
    - Add one sentence to D6.
    - Exact texts are in Corrections.

- **B2 (blocking): `docs/DEMO.md` quotes the golden answers that this change regenerates, and the change does not say what happens to those quotes.**
  - `docs/DEMO.md:536-560` (Paso 6) is a verbatim transcript of `npm run cli -- ask task-api "¿Qué hace buildPage con los resultados paginados?"`, including the current golden answer "La función buildPage convierte los resultados paginados en un objeto Page." and its two statements.
  - Line 24 (capture table) and line 635 ("0.71 con las respuestas golden de DIS-104") give figures that depend on the golden answers, as do the `demo:ask` counts of pasos 1 and 5 (lines 303–331, 440+).
  - Task 13.2 touches only "around line 293". Design Follow-ups E9 says "no guide command or screenshot changes". After the regeneration, Paso 6 will silently disagree with what task 11.2 prints.
  - The DIS-104 precedent recaptured these outputs (DEMO.md:24). Here the implementer must choose alone between recapturing, adding a dated note, or leaving the guide stale.
  - Correction: decide it in task 13.2 and E9 (exact text in Corrections):
    - recapture Paso 6 in Git Bash from task 11.2;
    - add a dated note for the `demo:ask` figures of pasos 1 and 5 and for the web confidence value, as line 292 already does for DIS-32;
    - web screenshots stay destination C.

- **I4 (improvable): the verify model of the regeneration is not fixed.**
  - `generatedWith.verifyModel` comes from `LLM_MODEL_VERIFY`, falling back to `LLM_MODEL` (`packages/adapters/llm/src/config.ts:90`).
  - Task 3.2 sets only `LLM_MODEL`. Task 3.3 checks only `generatedWith.model`.
  - If a local `.env` defines `LLM_MODEL_VERIFY`, the regenerated files would record another verify model without anyone noticing. The current files have `"verifyModel": "qwen2.5-coder"`.
  - Correction: in task 3.2, set `LLM_MODEL_VERIFY=qwen2.5-coder` explicitly; in task 3.3, check `generatedWith.verifyModel` is `qwen2.5-coder`.

- **I5 (improvable): task 11.1 omits `ALLOWED_REPOS_DIR`.**
  - `codemind index` only indexes inside `ALLOWED_REPOS_DIR`, and indexing is disabled when it is empty (`docs/project-context.md:595`; `packages/cli/src/commands/index-repository.ts:91`).
  - Task 11.1 indexes "a scratchpad git repository" but does not say how that path becomes allowed. That invites an edit of `.env`.
  - Correction: "run the command with `ALLOWED_REPOS_DIR=<scratchpad directory>` set for that command only (never edit `.env`)".

## 6. Contradictions inside the change

- **I1 (improvable): two names for one report.** The delta scenario "The criterion precedes the input and nothing in the record is rewritten" and design D7 and D10 all say the git checks are "recorded in the step 8 report". In `tasks.md`, the checks are task 10.3 and the report is `reports/YYYY-MM-DD-10-test-and-state-verification.md` (task 10.6). Step 8 is "record the agreement, sign and freeze". Correction: replace "step 8 report" with "step 10 report" in all three places.
- **I2 (improvable): the end of the D8 red window points to wrong or missing tasks.**
  - Design D8 says the red window lasts "Between the preparation commit and task 7.5". There is no task 7.5; the window closes in task 8.5 (and 7.1 for the two panel-output `it`s).
  - Task 4.2 says the `it`s "fail until task 7", but the signatures and report `it`s only pass at 8.5.
  - Correction: D8 → "task 8.5"; 4.2 → "until task 7.1 (panel outputs, resolution) and task 8.5 (signatures, report)".
- **E9 against the actual docs:** see B2.
- **D6 against `tasks.md` 0.4 and 8.3:** see B1.

## 7. Contradictions with the project

Clean on the main specs and ADRs:
- **code-analysis.** The delta MODIFIES "TypeScript symbol extraction" as a whole block. It keeps all 12 scenarios of `openspec/specs/code-analysis/spec.md:1188-1384`, changes only the bullet, the "Every other variable" sentence and the `src/v.ts` scenario, and loses nothing.
- **golden-answers.** The delta rewrites the five review requirements of `openspec/specs/golden-answers/spec.md:494-734` for the DIS-107 round. It consistently drops `linear:DIS-33/description`, keeps the DIS-33 files as history, and adds the criterion-equality clause. No other main spec names the DIS-33 round files.
- **ADR `docs/adr/20261017-stale-fingerprint-fails-verify.md`** (fail on a stale fingerprint, regenerate locally, regenerated entries come back with empty `reviews` and need a new review). The change follows it exactly.
- **Agent merge in task 15.7.** This is allowed through `autonomous-merge-gate` (`docs/adr/20261020-kit-autonomous-mode.md:42`, `docs/AUTONOMOUS-RUN.md:247`).

- **I6 (improvable): stale TSDoc.** `packages/cli/src/cache/golden-file.ts:9` and `:27` say the reviews are filled by "the independent agent panel of DIS-33" and are "the two panel signatures of DIS-33". After this change the signatures come from the DIS-107 round. That file is in neither the analyzer fingerprint (`fingerprint.ts:30-51`) nor the answer fingerprint (`answer-fingerprint.ts:13-27`), so editing its TSDoc is safe. Task 10.3 already allows "doc-only edits of task 13". Correction: add it to task 13.3.

## 8. Contrast with the real code

Clean:
- **The fix.** `packages/analyzers/typescript/src/symbols.ts:100` is the only `NodeFlags` use under `packages/` and the only `isVariableStatement` branch of the analyzer. D1's condition `(list.flags & ts.NodeFlags.BlockScoped) === ts.NodeFlags.Const` matches TypeScript 5.9 (BlockScoped = Let|Const|Using = 7; AwaitUsing = 6). No other code path duplicates the const-function rule.
- **The test.** "Other variable forms are not function symbols" exists at `tests/unit/analyzers/typescript/structure.spec.ts:376-387` and already asserts `diagnostics` is empty, as D2 says. The `src/v.ts` content ends at line 11, so the appended lines are 12 and 13, as the delta states.
- **No fixture uses `using`.** I found no `using` or `await using` declaration under `fixtures/**/*.ts`, so the expectation that the graph rows stay unchanged holds.
- **`sample-projects.ts`.** `packages/web/src/data/sample-projects.ts` carries no fingerprint, so "expected unchanged" holds.
- **`cache:build --project <name>` (the D3 rerun)** regenerates the whole project, which is allowed with a new fingerprint (`openspec/specs/golden-answers/spec.md:18-21`).
- **Retargeting `tests/unit/seed/golden-reviews.spec.ts`.** Every constant D7 names exists: `INPUT_PATH` l.11, `PANELIST_PATHS` l.171, `RESOLUTION_PATH` l.172, `PANELIST_FILES` l.187-193 (with `linear:DIS-33/description` at l.192), `RESOLVER_FILES` l.194, synthetic `sourcesRead` l.373 and l.419, `REPORT_PATH` l.472, tasks-file resolution l.599-626, forbidden-path check l.698.
- **The DIS-33 tasks file.** `openspec/changes/archive/2026-10-28-golden-independent-review/tasks.md` exists, and its Criterion block (l.30-37) equals line for line the one copied into this change's Panel group.

## 9. Task size

Clean. The ~1 h `cache:build` (task 3.2) is planned as a detached process with a log polled in later foreground calls (D11), so no single tool call outlives its limit. Task 4.1 (retargeting a ~700-line test through its constants) and task 10.3 (a list of git checks) are large but mechanical, and each fits one turn. Group 6 is run by separate agents outside the apply.

## 10. Mandatory steps

Clean:
- **Step 0** is the branch `feature/dis-107-ts-await-using-golden-regen` and comes first.
- **Labels and order.** "Review and Update Existing Tests (MANDATORY)" (9), "Run Tests and Verify Data State (MANDATORY)" (10, report path and pattern named in 10.6), "Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)" (11), "End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)" (12, justified as not applicable), "Update Technical Documentation (MANDATORY)" (13), and "Pre-merge Review (MANDATORY - AGENT MUST EXECUTE)" last (15), with the three checks in order, fixes on the same PR and the archive commit before the merge.
- **State restoration.** 11.1 deletes the scratch project and directory; 11.4 restores counts and runs `dev-processes stop`.

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| code-analysis: TypeScript symbol extraction | Other variable forms are not function symbols | 2.1, 2.2, 2.4 |
| 〃 | Module-level const functions are function symbols (unchanged, AC2) | 2.2, 10.1 |
| 〃 | the other 10 unchanged scenarios | 2.2, 9.2, 10.1 |
| golden-answers: Blind panel input | The panel input projects the golden answers without their verification | 4.1, 4.2, 4.3 |
| golden-answers: Panel outputs | Each panelist output judges every item under the criterion | 6.1, 6.2, 6.3, 7.1 |
| 〃 | The resolution answers exactly the disagreements | 6.4, 7.1 |
| 〃 | Invalid panel outputs are rejected | 4.1, 4.2 |
| golden-answers: Signatures | Every golden answer judged correct or partial carries both panel signatures | 8.1, 8.2, 8.7 |
| 〃 | A golden answer judged incorrect carries no signature | 8.1, 8.3, 8.5 |
| golden-answers: Golden review report | The report's verdicts and agreement match the panel files | 8.1, 8.5 |
| 〃 | The report states its criterion, panel and limitations | 1.1, 8.1, 8.5 |
| golden-answers: Criterion first and immutable record | The report's criterion is the Panel group's criterion | 1.1, 1.2, 4.1, 4.2 |
| 〃 | The criterion precedes the input and nothing in the record is rewritten | 1.2, 3.4, 4.3, 10.3 |

The table has no empty row. The only uncovered clause is the one in I3 (a MUST without a scenario, though task 10.3 implements it).

---

## Corrections to apply

### `openspec/changes/ts-await-using-golden-regen/tasks.md`

- **0.4 (B1).** Replace "the `reviews` of each golden entry (task-api Q1–Q3 and acme-shop Q3 signed by DIS-33, acme-shop Q1 and Q4 empty)" with "the `reviews` of each golden entry (written to the step 10 report only, never to this file)".
- **5.1 (B1).** Append: "and that no line of this `tasks.md` outside the Panel group names the verdict, the signature state or the pending ticket of a specific item of any round (the per-item mapping lives only in `design.md` → D9, which panelists may not read)".
- **8.3 (B1).** Replace the first two sentences with: "Pending tickets: for each `incorrect` item, the existing ticket that `design.md` → D9 names for that entry, or, when D9 names none, one new Linear issue per item (Spanish, «Regenerar o retirar la golden <proyecto> <id> y revisarla de nuevo», related to DIS-107, naming `docs/golden-review/2026-10-golden-review-dis-107.md`), named in `design.md` → Follow-ups (destination B: successor issue created by the agent, to be confirmed by the author; agent's text). For each existing ticket D9 names whose item is now `correct` or `partial`, a Spanish comment on that ticket says DIS-107 resolves it and the author confirms and closes it (destination B, row in Follow-ups)." Keep the last sentence ("If no item is `incorrect`…").
- **3.2 (I4).** After "`LLM_MODEL=qwen2.5-coder`" add "and `LLM_MODEL_VERIFY=qwen2.5-coder` (set for the command, overriding any `.env` value)".
- **3.3 (I4).** After "`generatedWith.model` `qwen2.5-coder`" add "and `generatedWith.verifyModel` `qwen2.5-coder`".
- **4.2 (I2).** Replace "fail until task 7 (design D8: record it, no PR exists yet)" with "fail until task 7.1 (panel outputs, resolution) and task 8.5 (signatures, report) (design D8: record it, no PR exists yet)".
- **11.1 (I5).** After "run `npm run cli -- index <that path> …`" add "with `ALLOWED_REPOS_DIR` set to the scratchpad directory for that command only (never edit `.env`)".
- **13.2 (B2).** Replace with: "`docs/DEMO.md`: (a) around line 293, the paragraph on acme-shop `Q1` says what the DIS-107 round decided for the regenerated answer (verdict, signed or pending with its ticket); (b) Paso 6 (around lines 536–560): replace the `ask task-api "¿Qué hace buildPage con los resultados paginados?"` transcript with the Git Bash output recorded in task 11.2; (c) the capture table row at line 24, the `demo:ask` figures of pasos 1 and 5 and the confidence value at line 635: add one dated sentence saying they are from the DIS-104 capture and that the golden answers were regenerated in DIS-107 after it (as line 292 does for DIS-32), or recapture them in Git Bash if the API is up; no web screenshot is retaken (design Follow-ups E9, destination C)".
- **13.3 (I6).** Append: "TSDoc of `GoldenReview` and `GoldenEntry.reviews` in `packages/cli/src/cache/golden-file.ts` (l. 9, 27): the signatures come from the current panel round (DIS-107), no behaviour change (the file feeds no fingerprint)".

### `openspec/changes/ts-await-using-golden-regen/design.md`

- **D6 (B1).** Append: "The per-item verdicts of the previous round and their pending tickets are written only in this design (Context, D9), never in `tasks.md` outside the Panel group, because a panelist reads the whole `tasks.md`."
- **D7 (I1).** Replace "checked by `git diff` in the step 8 report (D10)" with "checked by `git diff` in the step 10 report (D10)".
- **D8 (I2).** Replace "Between the preparation commit and task 7.5" with "Between the preparation commit and task 8.5 (task 7.1 for the panel-output `it`s)".
- **D10 (I1).** Replace "verified with git in the step 8 report" with "verified with git in the step 10 report (task 10.3)".
- **Follow-ups, row E9 (B2).** Replace with: "| E9 | No PowerShell check is planned. The guide transcripts that quote the regenerated answers are updated in task 13.2 (Paso 6 recaptured in Git Bash; dated note for the `demo:ask` figures and the web confidence); a web screenshot, if it has to be retaken, is left to the author | **A** (transcripts) / **C** (screenshots, author, only if needed) |".
- **Follow-ups.** Add rows: "| I4 | `LLM_MODEL_VERIFY=qwen2.5-coder` set for `cache:build`, `generatedWith.verifyModel` checked | **A** |" and "| I6 | TSDoc of `golden-file.ts` names the current round | **A** |".

### `openspec/changes/ts-await-using-golden-regen/proposal.md`

- **What Changes → Docs (B2, I6).** Replace with: "**Docs.** `fixtures/README.md`, `docs/DEMO.md` (the acme-shop Q1 paragraph, the Paso 6 transcript and a dated note on the figures captured before the regeneration), `readme.md`, `docs/project-context.md` and the TSDoc of `packages/cli/src/cache/golden-file.ts` name the current round and its verdicts."

### `openspec/changes/ts-await-using-golden-regen/specs/golden-answers/spec.md`

- **Scenario "The criterion precedes the input and nothing in the record is rewritten" (I1, I3).**
  - In WHEN, add "and `git diff` of `seeds/cache/` from the regeneration commit".
  - In THEN, before "(verified and recorded…", add ", and that diff touches only `reviews`".
  - Replace "in the step 8 report" with "in the step 10 report".

### Linear DIS-107 (Spanish comment; the `[original]` block is not edited)

> Texto del agente (auditoría de la spec, ts-await-using-golden-regen). Correcciones antes del apply: (1) `tasks.md` deja de nombrar fuera del grupo Panel los veredictos y tickets pendientes de la ronda DIS-33 (tareas 0.4 y 8.3), porque los panelistas leen el fichero entero; la correspondencia queda solo en `design.md` → D9. (2) E9 se corrige: `docs/DEMO.md` cita literalmente la golden task-api Q2 (paso 6) y cifras de `demo:ask` y de confianza que dependen de las golden; el paso 6 se recaptura en Git Bash y el resto lleva una nota fechada; las capturas de la web, si hicieran falta, quedan para la autora (destino C). (3) `cache:build` fija también `LLM_MODEL_VERIFY=qwen2.5-coder`. Pregunta para la autora: confirmar que se regeneran también las golden de acme-shop (huella compartida, E3) y que DIS-108/DIS-109 pueden resolverse en este cambio si salen `correct`/`partial`.

---

## Resolution of run 1

*Agent's text: correction round 1 of an autonomous run (docs/AUTONOMOUS-RUN.md §6), decided as lead engineer without the author.* `openspec validate ts-await-using-golden-regen --strict` passes after the edits.

| Finding | Resolution | Where |
|---|---|---|
| Q1 (question for the author) | Decided by the agent: (a) both golden files are regenerated, because the analyzer fingerprint is shared and AC3 cannot be met otherwise; (b) the regenerated acme-shop Q1 and Q4 go through the same panel and, if judged `correct` or `partial`, are signed here, with a Spanish comment on their existing tickets for the author to confirm and close (the agent closes no ticket) | `design.md` → Follow-ups, row "Audit 1 Q1" (A / B) |
| B1 (blocking) | Fixed as proposed: task 0.4 no longer states per-item signatures; task 8.3 refers to the ticket that D9 names per entry instead of naming items and tickets; task 5.1 checks that no line outside the Panel group names a per-item verdict, signature state or pending ticket; D6 gains the sentence on where that mapping lives | `tasks.md` 0.4, 5.1, 8.3; `design.md` D6; Follow-ups "Audit 1 B1" |
| B2 (blocking) | Fixed as proposed: task 13.2 now covers the acme-shop Q1 paragraph, the Paso 6 transcript (recaptured in Git Bash from task 11.2) and a dated note (or a Git Bash recapture) for the figures of line 24, pasos 1 and 5 and line 635; web screenshots stay with the author only if needed | `tasks.md` 13.2; `design.md` Follow-ups E9 (A / C); `proposal.md` Docs |
| I1 (improvable) | Fixed: "step 8 report" replaced by "step 10 report" in the spec scenario, D7, D10 and the D10 Follow-ups row | spec golden-answers; `design.md` D7, D10 |
| I2 (improvable) | Fixed: D8 window ends at task 8.5 (7.1 for the panel-output `it`s); task 4.2 names 7.1 and 8.5 | `design.md` D8; `tasks.md` 4.2 |
| I3 (improvable) | Fixed: the scenario "The criterion precedes the input and nothing in the record is rewritten" adds `git diff` of `seeds/cache/` from the regeneration commit to WHEN and "touches only `reviews`" to THEN; D10 names it | spec golden-answers; `design.md` D10 |
| I4 (improvable) | Fixed: task 3.2 sets `LLM_MODEL_VERIFY=qwen2.5-coder` for the command; task 3.3 checks `generatedWith.verifyModel` | `tasks.md` 3.2, 3.3; Follow-ups I4 |
| I5 (improvable) | Fixed: task 11.1 sets `ALLOWED_REPOS_DIR` to the scratchpad directory for that command only, never editing `.env` | `tasks.md` 11.1 |
| I6 (improvable) | Fixed: task 13.3 updates the TSDoc of `GoldenReview` and `GoldenEntry.reviews` in `packages/cli/src/cache/golden-file.ts` (covered by the "doc-only edits of task 13" allowance of task 10.3) | `tasks.md` 13.3; `proposal.md` Docs; Follow-ups I6 |
| Linear comment | Posted on DIS-107 in Spanish with the decisions of this round | Linear DIS-107 |

---

## Run 2 (2026-10-28)

APPROVED

**Questions for the author**

None new. Run 1 had one question, Q1: regenerate both golden files, and let DIS-108/DIS-109 be resolved here. The agent answered it as lead engineer (`design.md` → Follow-ups, row "Audit 1 Q1"). That answer is acceptable: it repeats the ticket's own E3 and E7 and contradicts neither the ticket nor the project.

**Ticket context.** DIS-107 has no parent (`parentId: null`, checked again in this run). I read its `[original]`, `[reality-map]` and `[enhanced]` parts (AC 1–5, E1–E10) and its four comments, including the run-1 resolution comment.

**Run 2 summary.** All run-1 corrections are in place: B1, B2 and I1–I6. Three new improvable findings are below (R2-I1 to R2-I3). None of them blocks.

---

## 1. Scope against the ticket

Clean.
- Every artifact follows from DIS-107: AC1–AC5, E1–E10 and the docs named in "Contexto técnico".
- The ticket records the acme-shop widening in E3. The agent answered it in Follow-ups, row "Audit 1 Q1".
- The TSDoc edit of `packages/cli/src/cache/golden-file.ts` (task 13.3) and the DEMO.md transcripts (task 13.2) are documentation of this change's own effects. They are not invented scope.

## 2. Inherited acceptance criteria

There is no parent, so no criteria are inherited. The sub-issue's own criteria are all covered:
- AC1 → code-analysis "Other variable forms are not function symbols" (tasks 2.1–2.4).
- AC2 → the unchanged "Module-level const functions are function symbols", plus the full suite (tasks 2.2, 10.2).
- AC3 → the main-spec requirement "The versioned golden file is coherent" and the `verify` rule (tasks 3.1–3.4, 10.4, 15.2).
- AC4 → the five golden-answers requirements of the delta. Blindness is now protected by D6 and the check in task 5.1.
- AC5 → "Signatures of the reviewed golden answers".

## 3. Missing scenarios

Clean.
- Run-1 I3 is fixed: the `reviews`-only diff of `seeds/cache/` is now in the THEN of "The criterion precedes the input and nothing in the record is rewritten".
- Every MUST clause of both deltas is covered by a scenario.

## 4. Ambiguity

Clean. None of "fast", "easy", "secure", "efficient", "many", "appropriate" or "robust" appears in the proposal, the design, the deltas or the tasks. The only hit is inside the run-1 report.

## 5. Open decisions

- **R2-I1 (improvable): the order of the `## Pending` lines is fixed by the test but not by the spec.**
  - `tests/unit/seed/golden-reviews.spec.ts:558` compares the Pending lines with `toEqual(incorrect)`, built from the panel's items in input order.
  - The delta ("Golden review report") and task 8.5 say only "one line `- <project> <id>: DIS-<n>` per item".
  - The implementer learns the order only when the test goes red. The gap is inherited from the main spec (`openspec/specs/golden-answers/spec.md:675`), and the delta rewrites that requirement anyway, so it is cheap to close.
  - Correction: state "one line per item whose final verdict is `incorrect`, in input order" in the spec and in task 8.5.

- **R2-I2 (improvable): git history can reveal the previous verdicts to the panel.**
  - Unlike DIS-33, this round has a previous round in history. `git log -p seeds/cache/acme-shop.json`, `git show` of the DIS-33 report, and `git log` of `docs/golden-review/` all expose the old signatures and verdicts.
  - The Panel group forbids "everything not in the allowlist" and "running … any script". It does not name git history explicitly, and `sourcesRead` records files only, so such a read would leave no trace.
  - Correction: add git history to the Panel group's forbidden sources (exact text in Corrections). This paragraph is outside the Criterion block, so the criterion-equality test is not affected.

- **R2-I3 (improvable): the plan does not say what happens if the base branch moves after the regeneration.**
  - Task 0.1 merges `origin/final-project-CRN` only "before any code or data change".
  - If the base branch later changes a fingerprinted path, the regenerated golden files become stale. Fingerprinted paths are `ANALYZER_DIRECTORIES` and the migrations (`packages/cli/src/seed/fingerprint.ts:30-41`) and `ANSWER_FINGERPRINT_FILES` (`packages/cli/src/cache/answer-fingerprint.ts:13-27`).
  - The CI `verify` job on the PR merge ref would probably catch it. Still, nothing in the plan tells the implementer to stop instead of re-running `cache:build`, which would mean a third generation and an unplanned panel round.
  - Correction: add a check to task 15.7 (exact text in Corrections).

Everything else is fixed:
- the exact condition (D1);
- the line numbers 12–13 (D2);
- the rerun policy and clean stop (D3);
- the `LLM_*` environment (task 3.2 — `scripts/env.mjs:84-85` confirms that the shell wins over `.env`);
- `ALLOWED_REPOS_DIR` (task 11.1);
- the names of the round files;
- the formats of the report lines.

## 6. Contradictions inside the change

Clean.
- Run-1 I1 is fixed: the spec, D7, D10 and tasks 10.3/10.6 all say "step 10 report".
- Run-1 I2 is fixed: D8 and task 4.2 both close the red window at 7.1 and 8.5.
- B1 is fixed. Outside the Panel group (lines 38–69), `tasks.md` mentions `incorrect`, `signed`, DIS-108 and DIS-109 only in generic form (8.1–8.5, 13.2). The only places that name DIS-108/DIS-109 are inside the Panel group's forbidden list.
- D6, task 5.1 and the spec allowlist agree. The proposal, the design (D1–D11) and the deltas agree on the files, the order and the allowlists.

## 7. Contradictions with the project

Clean.
- **golden-answers.** The delta keeps every clause of `openspec/specs/golden-answers/spec.md:494-734`, changes the paths to `-dis-107`, drops `linear:DIS-33/description`, and adds:
  - the DIS-33 history clause;
  - the comparison of the criterion with DIS-33's;
  - the DIS-33 report as a forbidden path in `## Panel`;
  - the two extra rejection copies;
  - the extended git scenario.
- **code-analysis.** The delta keeps all 12 scenarios of "TypeScript symbol extraction".
- **ADRs.** The change follows `docs/adr/20261017-stale-fingerprint-fails-verify.md`. The agent merge in task 15.7 goes through the autonomous merge gate (`docs/adr/20261020-kit-autonomous-mode.md`).
- **Documentation targets.** Every other mention of DIS-33, DIS-108 or DIS-109 in the docs is covered by tasks 13.1–13.3:
  - `readme.md:618`;
  - `docs/project-context.md:1213` and `:1417`;
  - `docs/DEMO.md:292-295`, `:24`, `:536-560` and `:635`;
  - `fixtures/README.md:210-216` and `:332-334`.

## 8. Contrast with the real code

Clean.
- `packages/analyzers/typescript/src/symbols.ts:100` still holds `(list.flags & ts.NodeFlags.Const) !== 0`. It is the only `NodeFlags` test of the rule, and D1 replaces exactly that.
- The archived DIS-33 Criterion block (`openspec/changes/archive/2026-10-28-golden-independent-review/tasks.md:30-37`) is identical, line for line, to the one in this change's Panel group (lines 44–51).
- Every constant that task 4.1 retargets exists in `tests/unit/seed/golden-reviews.spec.ts`: l.11, 171–172, 187–194, 373, 419, 472, 599–626 and 698.
- `validPanelistOutput` reads the input file, so "Invalid panel outputs are rejected" can pass at task 4.2, as D8 says.
- A `linear:DIS-107/description` entry and a DIS-33 panel file are both rejected by `sourceProblem` under the rule `allowlist` (l.231-243). This matches the new scenario copies.
- `golden-file.ts` (task 13.3) is in neither fingerprint, so editing its TSDoc does not change them.
- No test pins the current fingerprint value: `a0262b` does not appear outside `seeds/` and `openspec/`.
- `index --name --language --framework --json` exists (`packages/cli/src/commands/index-repository.ts:92-95`).

## 9. Task size

Clean.
- The roughly one-hour `cache:build` (task 3.2) is started detached and its log is polled (D11).
- Task 4.1 (retargeting constants), task 8.5 (completing the report) and task 10.3 (git checks) are each large but mechanical. Each fits in one turn.
- Group 6 is run by separate agents outside the apply.

## 10. Mandatory steps

Clean.
- Step 0 creates the branch and comes first.
- Steps 9–13 and 15 carry their MANDATORY labels, in the order of `docs/openspec-tasks-mandatory-steps.md` §2. Step 12 is justified as not applicable.
- The report paths are named (10.6, 11.5, 15.3–15.5).
- State is restored in 11.1 (scratch project and directory deleted), 11.4 (counts, `git status`, `dev-processes stop`) and 10.6.
- Pre-merge review is last, with the archive commit before the merge.

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| code-analysis: TypeScript symbol extraction | Other variable forms are not function symbols | 2.1, 2.2, 2.4 |
| 〃 | Module-level const functions are function symbols (AC2) | 2.2, 10.1, 10.2 |
| 〃 | the other 10 unchanged scenarios | 2.2, 9.2, 10.1 |
| golden-answers: Blind panel input | The panel input projects the golden answers without their verification | 4.1, 4.2, 4.3 |
| golden-answers: Panel outputs | Each panelist output judges every item under the criterion | 6.1, 6.2, 6.3, 7.1 |
| 〃 | The resolution answers exactly the disagreements | 6.4, 7.1 |
| 〃 | Invalid panel outputs are rejected | 4.1, 4.2 |
| golden-answers: Signatures | Every golden answer judged correct or partial carries both panel signatures | 8.1, 8.2, 8.7 |
| 〃 | A golden answer judged incorrect carries no signature | 8.1, 8.3, 8.5 |
| golden-answers: Golden review report | The report's verdicts and agreement match the panel files | 8.1, 8.5 |
| 〃 | The report states its criterion, panel and limitations | 1.1, 8.1, 8.5 |
| golden-answers: Criterion first and immutable record | The report's criterion is the Panel group's criterion | 1.1, 1.2, 4.1, 4.2, 15.7 |
| 〃 | The criterion precedes the input and nothing in the record is rewritten | 1.2, 3.4, 4.3, 10.3 |

Every row has a task, so there is no hole.

---

## Corrections to apply

These are all improvable. They are not needed before the apply, but they are cheap to make now.

### `openspec/changes/ts-await-using-golden-regen/specs/golden-answers/spec.md`

- **"Golden review report" (R2-I1).**
  - Replace: "Each line of `## Pending` SHALL be `- <project> <id>: DIS-<n>`, naming the successor ticket."
  - With: "`## Pending` SHALL hold one line per item whose final verdict is `incorrect`, in input order, each `- <project> <id>: DIS-<n>`, naming the successor ticket."

### `openspec/changes/ts-await-using-golden-regen/tasks.md`

- **8.5 (R2-I1).**
  - Replace: "one line `- <project> <id>: DIS-<n>` per item"
  - With: "one line `- <project> <id>: DIS-<n>` per `incorrect` item, in input order"
- **Panel group, "Forbidden sources" (R2-I2).** Before "Also forbidden: running the analyzers…", add:
  - "the git history of any file (`git log -p`, `git show`, `git diff`, `git blame`, or reading any earlier commit): judge the files as they are in the working tree;"
  - Do not touch the Criterion block.
- **15.7 (R2-I3).** Before the merge, add:
  - "`git fetch`; if `origin/final-project-CRN` moved since task 0.1, `git diff --stat HEAD...origin/final-project-CRN -- packages/analyzers packages/core packages/cli/src/seed packages/adapters fixtures db` (the fingerprinted paths of `fingerprint.ts` and `answer-fingerprint.ts`) must be empty; if not, stop before merging and hand over to the author (destination C), because the golden files would need a new regeneration and a new panel round"
  - Use the real migrations directory of `fingerprint.ts` in place of `db`.

### `openspec/changes/ts-await-using-golden-regen/design.md`

- **D6 (R2-I2).** Append: "Git history is forbidden too: from this round on it holds the previous signatures and report."
- **Follow-ups.** Add the rows:
  - "| Audit 2 I1 | `## Pending` lines in input order, stated in the spec and task 8.5 | **A** |"
  - "| Audit 2 I2 | Git history forbidden to the panel | **A** |"
  - "| Audit 2 I3 | Base-branch drift on fingerprinted paths checked before merge; stop to the author | **A** (check) / **C** (new round, author) |"

### Linear DIS-107 (Spanish comment; the `[original]` block is not edited)

> Texto del agente (auditoría de la spec, ronda 2, ts-await-using-golden-regen). Veredicto: APPROVED, sin hallazgos bloqueantes. Las correcciones de la ronda 1 están aplicadas. Mejoras opcionales: (1) el orden de las líneas de `## Pending` (orden del input) se fija en la spec y en la tarea 8.5; (2) se prohíbe expresamente al panel leer el historial de git, que en esta ronda contiene las firmas y el informe anteriores; (3) antes del merge se comprueba que `final-project-CRN` no ha cambiado rutas que forman parte de la huella; si las ha cambiado, se para y decide la autora.
