CHANGES REQUIRED

# Spec audit — golden-review-dis-110-r2 (Run 1)

Auditor: `spec-auditor` subagent (read-only), 2026-10-30. Ticket: Linear DIS-110 plus the author's
instruction for this autonomous run.

Questions for the author: none. The two blocking findings (B1, B2) are open procedural decisions
inside the change; the agent settles each by stating a rule.

## 1. Scope against the ticket
Clean. Everything traces to the author's instruction for this run or to DIS-110 acceptance
criterion 6 (the explain Purpose). Small additions from project practice: the `prompts.md` entry
(11.2), the manual error path `--project task-api Q9` (8.1), the one rerun of a failed `cache:build`
(G1).

## 2. Inherited acceptance criteria
Clean. Every item of the instruction has a task (criterion first 1.2; regeneration 0.3, 2.2, 2.4,
7.6; input 3.4; retargeted test 3.1, 3.2, 6.1; panel 4.1–4.4; signatures 5.3; report 5.4; history
5.6; db:seed and verify 7.3; gates 7.4; docs 11.1; r3 G2, 5.5; Purpose 10; PR and review 12, 13).

## 3. Missing scenarios
Clean.

## 4. Ambiguity
No vague wording; imprecise points under I3, I5, I6.

## 5. Open decisions
- **B1 (blocking)**, tasks 4.3 and 5.1: the `it` "Each panelist output judges every item under the
  criterion" reads both outputs, so it cannot validate one output before recording; nothing says what
  happens on a rejection other than extra keys. Fix: check key sets only before committing (method
  recorded); extra or missing keys → re-emit the same judgements; any other problem → record as
  returned, commit, stop under 5.1 (C). In 5.1 run both `it`s once both outputs are committed.
- **B2 (blocking)**, tasks 0.3, 2.2, design G1: no rule when Ollama does not answer or lacks
  `qwen2.5-coder`. Fix: stop before 1.2 and report to the author (C); the agent does not start Ollama.
- **I1**: exact Purpose wording not pinned (proposed text given).
- **I3**: 2.1 should name `package-lock.json`, the migrations directory and the analyzer port.

## 6. Contradictions inside the change
- **I4**: the red-CI window starts at 2.4 (the DIS-110 input stops matching at the regeneration),
  not 3.4 (design Risks, 3.5, 7.6).
- **I5**: the r2 Pending sentence for another `incorrect` item should name r3 when r3 follows.
- **I6**: 5.3 "leave `reviews: []`" → "set `reviews` to `[]`" (an entry signed by DIS-110 may turn
  `incorrect`).

## 7. Contradictions with the project
None. **I7**: the delta's historical sentence "Those files were already frozen…" has no task check:
drop it or add a `git log` check to 5.6.

## 8. Contrast with the real code
Constants of G4 exist; `changeTasksPath()` works for the new change; counts `[1, 3, 2, 1, 1, 1]`
consistent. **I8**: literal DIS-110 strings in the test (assertion messages at lines 763 and 766, the
JSDoc of `PREVIOUS_ROUND_REPORTS` and `PREVIOUS_ROUND_TASKS`) must be named in 3.1/3.2. **I9**: G2's
r3 update is underspecified (two Criterion blocks, test count 2, fifty history files, groups 14–18
before 6–13) and the audit re-run must be unconditional.

## 9. Task size
Clean.

## 10. Mandatory steps
Present and ordered. **I10**: 7.4 should handle the known flaky "Every connection is released after a
run" (rerun alone once). **I2**: 10.1 needs a check (`grep "asks the model once"` empty).

## 11. Traceability
Every requirement and scenario of the delta maps to tasks; no empty rows. The Panel group (group 4)
is consistent with the delta's allowlists, forbidden sources, output paths, and its Criterion block
equals DIS-110 12c and DIS-42 group 24 line by line.

## Corrections to apply
tasks.md: 0.3 (B2), 2.1 (I3), 3.1 and 3.2 (I8), 3.5 and 7.6 (I4), 4.3 (B1), 5.1 (B1), 5.3 (I6),
5.6 (I7), 7.4 (I10), 10.1 (I1, I2). design.md: G1 (B2), G2 (I9), G5 (I1), Risks (I4). Delta: "Golden
review report" Pending paragraph (I5); "Criterion first" historical sentence (I7).

## Resolution of the findings (correction round 1)

*Agent's text: resolved by the agent as lead engineer (`docs/AUTONOMOUS-RUN.md` §6).*

| Finding | Resolution |
|---|---|
| B1 | Fixed: 4.3 states the key-set check before committing (Node one-liner over the exact key sets of the Output format, result in the step 7 report), re-emit only for extra or missing keys, any other problem recorded as returned and the change stops under 5.1 (C); 5.1 runs both `it`s once both outputs are committed. Design G7 added. |
| B2 | Fixed: 0.3 and design G1 stop before 1.2 (destination C) when Ollama does not answer or does not list `qwen2.5-coder`. |
| I1 | Fixed: G5 and 10.1 pin the Purpose text proposed by the audit. |
| I2 | Fixed: 10.1 gains the grep check. |
| I3 | Fixed: 2.1 names `ANALYZER_DIRECTORIES`, `ANALYZER_FILES`, the tracked fixture directories, `package-lock.json`, the migrations directory, the analyzer port and the answer fingerprint inputs. |
| I4 | Fixed: the red-CI window is 2.4 → 5.4 in design Risks, 3.5 and 7.6. |
| I5 | Fixed in the delta as proposed. |
| I6 | Fixed in 5.3. |
| I7 | Fixed: the sentence is kept and 5.6 gains the `git log` check over the forty files of the rounds before DIS-110 since the DIS-110 report's commit. |
| I8 | Fixed: 3.1 and 3.2 name the literal strings (assertion messages and JSDoc). |
| I9 | Fixed: G2 lists the r3 update (two Criterion blocks, count 2, fifty history files, groups 14–18 before 6–13) and makes the audit re-run unconditional. |
| I10 | Fixed in 7.4. |

## Run 2

APPROVED

Auditor: a fresh `spec-auditor` subagent (read-only), 2026-10-30, without the context of the
correction round and without reading this report.

Questions for the author: none. Sections 1–4 and 7–11 clean: scope traces to the author's
instruction and DIS-110 AC6; every MUST clause of the five MODIFIED requirements has its scenario;
the delta modifies exactly the round-specific requirements of the main spec; the test constants,
`PANELIST_FILES` (built from `TASKS_PATH`), the archive filter and the literal messages at lines 763
and 766–767 are covered by tasks 3.1–3.2; the fingerprint inputs of task 2.1 match
`packages/cli/src/seed/fingerprint.ts`; the Criterion block equals the DIS-110 and DIS-42 blocks;
mandatory steps present and ordered; traceability has no holes.

Improvable findings (none blocking):

- 5a: G2 should start r3 after 5.6 (the r2 history check), not after 5.5.
- 5b: 4.3/G7 should cover unparsable output (stop, C, raw text in the step 7 report) and say a
  re-emission resumes the same panelist agent (stop, C, if it cannot).
- 6a: the r2 `## Pending` paragraph of the delta should tie the r3 sentence to task-api `Q1` only.
- 6b: G7 came before G6 in `design.md`.

### Resolution (applied after the APPROVED verdict)

| Finding | Resolution |
|---|---|
| 5a | Fixed in design G2. |
| 5b | Fixed in design G7 and task 4.3. |
| 6a | Fixed in the delta ("Golden review report"). |
| 6b | Fixed: G6 now precedes G7. |
