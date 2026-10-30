CHANGES REQUIRED

# Spec audit: open-store-test-flake (DIS-110)

- Date: 2026-10-30
- Change: `openspec/changes/open-store-test-flake/` (proposal.md, design.md, tasks.md; `skip_specs: true`)
- Ticket: DIS-110, loaded from Linear (Done, no parent). This change is not described in the ticket: it is the follow-up the author approved under DIS-110, judged against the author's instruction.
- Sources read: `tests/integration/store/open-store.spec.ts`, `openspec/specs/graph-store/spec.md` (requirement at line 1194), `packages/cli/src/seed/fingerprint.ts`, `docs/openspec-tasks-mandatory-steps.md`, `docs/TESTING.md`, `vitest.config.ts`, `openspec/changes/archive/2026-10-30-pool-transaction-release/`.

## Questions for the author

None blocking. Optional (I-3): should the race left in the three F1 `it`s be listed in `docs/TESTING.md` → Carreras conocidas? The proposal excludes that file.

## 1. Scope against the ticket — clean

The change removes `const before = await projectCount();` and `expect(await projectCount()).toBe(before);` from "Every connection is released after a run" (`open-store.spec.ts:234`, `:247`), keeps the close-time (`:245`) and `sessionsLeft` (`:246`) assertions, keeps `projectCount()` (still used at 167/179, 185/202, 208/226), changes no production code and creates no ticket. F1 is recorded for the author (C), which matches "this test only".

## 2. Inherited acceptance criteria — clean

DIS-110's criteria 1–6 were delivered by `pool-transaction-release`; none is touched. Improvable: the ticket's `[enhanced]` → Contexto técnico still says the new `it`s compare the project count; X9 of the archived design overrode that. The planned Linear comment should say so.

## 3. Missing scenarios — clean

No new MUST clause. The scenario (`graph-store/spec.md:1237-1241`) is fully covered by the two remaining assertions.

## 4. Ambiguity — clean

"Five times in a row", "2 s" and "exactly two removed lines" are measurable.

## 5. Open decisions

- **B-1 (blocking).** `tasks.md` 3.1 does not say what counts as a pass. The three F1 `it`s keep the same race and are not in Carreras conocidas, so a failure of one of them leaves the implementer to decide alone whether 3.1 passed. Same gap in 3.6 and 7.2.
- **I-1 (improvable).** 3.2 drops the `harness` Vitest project (`vitest.config.ts:70-76`) without saying why.

## 6. Contradictions inside the change — clean

Proposal, design (D1, D2, F0, F1) and tasks (1.1, 1.2, 2.1) agree.

## 7. Contradictions with the project

- Spec: clean. The scenario never mentions the project count; no delta and `skip_specs: true` is correct.
- **I-2 (improvable).** `open-store.spec.ts:105` says "Every scenario deletes what it commits; the project count is checked before and after." Already false for the two terminated-connection `it`s (X9) and, after this edit, for this `it`. Task 1.2 forbids touching it. Either update it or record the stale comment as a D row.
- **I-3 (improvable).** `docs/TESTING.md:72-80` does not list the F1 `it`s; F1 should say this is deliberate.
- Mandatory-steps doc: clean.

## 8. Contrast with the real code — clean

Line references match; removing `before` leaves no unused variable; D2 is correct (`fingerprint.ts:30-57`: no input under `tests/`); history matches the archived change (X9, X14, A7).

## 9. Task size — clean

## 10. Mandatory steps — clean apart from B-1

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| graph-store "Running work in one transaction on a pooled store" (unchanged) | "Every connection is released after a run" (`spec.md:1237`) | 1.1, 1.2, 2.1, 3.1, 7.4 |
| (none other) | — | 3.3, 6.1 |

## Corrections to apply

- `tasks.md` 3.1 (B-1): append the pass criterion: the `it` "Every connection is released after a run" passes in all six runs; a failure of an F1 `it` on its `projectCount()` assertion is recorded as F1 evidence and not fixed; any other failure not listed in Carreras conocidas stops the step. Same rule for the CI wait in 7.2 (F1 or Carreras conocidas failure re-run once and recorded; anything else fixed).
- `tasks.md` 3.2 (I-1): the `harness` project is not run, and why.
- I-2: either rewrite line 105 (and adjust 1.2, proposal Impact, F2 = A) or record F2 = D.
- `design.md` F1 (I-3): note that Carreras conocidas does not list these three `it`s; left to the author.
- Linear DIS-110: one Spanish comment at 7.7, mentioning that X9 already overrode the `[enhanced]` text on the project count.

## Resolution of run 1

*Agent's text: correction round 1, decisions taken by the agent as lead engineer (`docs/AUTONOMOUS-RUN.md` §6).*

| Finding | Resolution |
|---|---|
| B-1 | Fixed: pass criterion added to 3.1, and to 7.2 for CI, as proposed (design X1). |
| I-1 | Fixed: 3.2 states why the `harness` project is not run. |
| I-2 | Decided by the agent: the comment at line 105 is not edited (the author's instruction limits the edit to this `it`; least scope). Recorded as F2, destination C with F1, since it describes the same block the author may fix later. |
| I-3 | Fixed: F1 notes that Carreras conocidas does not list the three `it`s, left to the author. |
| Optional question (I-3) | Decided by the agent: `docs/TESTING.md` is not edited in this change (proposal non-goal); left to the author with F1. |
| Linear comment | Accepted: the 7.7 comment will mention X9. |

## Run 2 (2026-10-30)

APPROVED

Fresh `spec-auditor`, whole change, after correction round 1. Ticket DIS-110 loaded from Linear (Done, no parent); judged against the author's instruction.

- Questions for the author: none.
- 1 Scope: clean. Exactly `open-store.spec.ts:234` and `:247` removed; `:245` and `:246` kept; `projectCount()` kept (callers at :167/:179, :185/:202, :208/:226); F1 and F2 destination C; no invented scope.
- 2 Inherited criteria: clean. DIS-110 criteria 1-6 delivered by `pool-transaction-release`, untouched; the instruction is covered in full.
- 3 Missing scenarios: clean. The two remaining assertions are exactly the THEN of `graph-store/spec.md:1241`.
- 4 Ambiguity: clean.
- 5 Open decisions: B-1 of run 1 fixed (3.1, 7.2, design X1). I-1 (improvable): 3.1 "any other failure stops the step" does not say what follows.
- 6 Contradictions inside the change: clean.
- 7 Contradictions with the project: clean; no delta is correct; `docs/TESTING.md` and `docs/project-context.md` do not describe the removed assertion. I-2 (improvable): 7.4 names the `graph-store` scenario instead of the ticket's criteria without saying why (`docs/openspec-tasks-mandatory-steps.md` §3).
- 8 Real code: clean (line references, no unused binding, helper callers, fingerprint D2, Vitest projects and scripts exist, history matches).
- 9 Task size: clean. 10 Mandatory steps: clean. 11 Traceability: no empty row.

### Corrections to apply (improvable, none blocking)

- `tasks.md` 3.1 (I-1): add "; it is diagnosed and fixed in this change (design X1), and the six runs are repeated".
- `tasks.md` 7.4 (I-2): add that DIS-110's criteria 1-6 do not apply and the author's instruction (proposal → Why, What Changes) stands in for them.
- Optional: the same clause in design X1.
- Linear: the 7.7 comment names this change, says A7 is fixed, F1 and F2 left to the author, and X9 already overrode the `[enhanced]` line on the project count.

### Resolution of run 2

All three improvable corrections applied as proposed (fixed). The Linear comment content is adopted for task 7.7.

## Run 3 (2026-10-30)

CHANGES REQUIRED

Fresh `spec-auditor`, whole change, after the post-apply update (base-standards §7): during the apply, stability runs 2 and 4 of task 3.1 failed on two tests of other files (`claims-refresh.spec.ts` "A failure while refreshing leaves the claim as it was", 10 s timeout; `graph-read.spec.ts` "Listing with no project returns an empty list"), both passing alone; X1 and 3.1 were widened and F3 added. Ticket DIS-110 loaded (Done, no parent).

- Questions for the author: none blocking. Optional: list F3 in `docs/TESTING.md` → Carreras conocidas (left to the author, C).
- Legitimacy of the widening: yes in substance. The changed `it` still must pass all six runs; the change only removes a `SELECT count(*)` and cannot affect other files; "passes alone" separates load symptoms from defects; `graph-read` was already recorded as intermittent (`archive/2026-10-29-incremental-indexing/reports/2026-10-29-9-test-and-state-verification.md:22`); `docs/openspec-tasks-mandatory-steps.md` asks to record flaky behaviour. Not a §10 rewrite: the requirement and the changed test's criterion did not move.
- 1 Scope, 2 Criteria, 3 Scenarios, 4 Ambiguity, 7 Project, 8 Real code, 9 Task size: clean.
- **B-1 (blocking).** `tasks.md` 7.2 lists only F1 and Carreras conocidas, while X1 also covers F3: contradiction for CI.
- **B-2 (blocking).** X1 sits under correction round 1 though its F3 clause was added after runs 2 and 4: the widening must be recorded as a post-apply decision.
- **I-1 (improvable).** 3.5 does not require the run-alone evidence for F3 failures.
- **I-2 (improvable).** Nothing says what happens to an unrelated failure that also fails alone.
- **I-3 (improvable).** A blank line before F3 split the Follow-ups table.
- Traceability: no empty row (X1/X2 consistent once B-1 is fixed).

### Resolution of run 3

*Agent's text: correction round 2.*

| Finding | Resolution |
|---|---|
| B-1 | Fixed: 7.2 now refers to the full pass criterion of 3.1 (F1, Carreras conocidas, F3) and to X1, X2. |
| B-2 | Fixed: X1 restored to its run-2 wording; the widening recorded as X2 under a post-apply heading with date and trigger. |
| I-1 | Fixed: 3.5 asks for the command and totals of each F3 file run alone. |
| I-2 | Fixed: 3.1 and X2 say a failure that also fails alone is diagnosed and recorded for the author (C), fixed here only if tied to `open-store.spec.ts`. |
| I-3 | Fixed: blank line removed; F3 is part of the table. |
| Optional question | Decided by the agent: `docs/TESTING.md` not edited (proposal non-goal); left to the author with F3. |

## Run 4 (2026-10-30)

CHANGES REQUIRED

Fresh `spec-auditor`, whole change, after correction round 2. Ticket DIS-110 loaded (Done, no parent; its latest comment confirms only A7 was pending).

- Questions for the author: none.
- 1 Scope, 2 Criteria, 3 Scenarios, 4 Ambiguity, 9 Task size: clean. 7 Project: clean.
- **B-1 (blocking).** 3.1 and X2 do not say whether 3.1 passes or stays stopped when a test of another file also fails alone and is not tied to `open-store.spec.ts`. Correction: run it alone on `origin/final-project-CRN`; failing there too makes it pre-existing (C, recorded, non-blocking); passing there makes it caused by this change.
- **I-1.** "Passes alone" does not say how many runs: fix it at one run, recorded.
- **I-2.** 7.2 does not say what happens if the CI re-run fails again.
- **I-3.** The fix clauses collide with the non-goals and 1.2/2.1: add "after updating the artifacts under base-standards §7".
- **I-4 (note only).** Lower-case ticket id in the branch, stated in 0.1 and used by earlier DIS-110 branches: no action.
- **I-5.** D2 omits `PARSER_DEPENDENCIES` (`fingerprint.ts:54`, `:91-98`, versions from `package-lock.json`); add it, and `package-lock.json` to 3.3's diff.
- **I-6.** Missing sentence break before "Pass criterion" in 3.1.
- Traceability: no empty row.

### Resolution of run 4

*Agent's text: correction round 3.*

| Finding | Resolution |
|---|---|
| B-1 | Fixed: 3.1 and X2 run an also-fails-alone failure alone on `origin/final-project-CRN`; pre-existing → C, recorded, non-blocking; otherwise caused by this change and fixed. 3.5 records both runs. |
| I-1 | Fixed: one run of its file alone, recorded (X2). |
| I-2 | Fixed: 7.2 and X2 add the second-failure path and the clean stop after two corrections. |
| I-3 | Fixed: 3.1, X1 and X2 say the fix comes after updating the proposal non-goals, design and tasks 1.2 and 2.1 under base-standards §7. |
| I-4 | No action (note only). |
| I-5 | Fixed: D2 lists `PARSER_DEPENDENCIES`; 3.3 adds `package-lock.json`. |
| I-6 | Fixed: sentence break and "(design X1, X2)". |

## Run 5 (2026-10-30)

APPROVED

Fresh `spec-auditor`, whole change, after correction round 3. Ticket DIS-110 loaded (Done, no parent).

- Questions for the author: none.
- 1 Scope, 2 Criteria, 3 Scenarios, 4 Ambiguity, 6 Contradictions inside, 7 Project, 8 Real code, 9 Task size, 10 Mandatory steps: clean. The pass criterion is decidable in every case (changed `it`, F1, Carreras conocidas, another file passing alone, another file also failing alone and checked on `origin/final-project-CRN`, any other failure, CI re-run, second failure and clean stop).
- **I-1 (improvable).** 3.1's parenthetical "(a whole-database read or a timeout under parallel load, design F3)" could read as narrowing the class; X2 has no such restriction.
- 11 Traceability: no empty row.

### Resolution of run 5

| Finding | Resolution |
|---|---|
| I-1 | Fixed: "(e.g. a whole-database read or a timeout under parallel load; design F3, X2)". |
