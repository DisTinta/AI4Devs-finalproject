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
