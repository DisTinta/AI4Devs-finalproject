APPROVED (re-audit; first pass CHANGES REQUIRED, see below)

# Spec audit — evidence-verifier-syntactic (DIS-68)

- Date: 2026-10-14
- Auditor: `spec-auditor` subagent (read-only); report saved by the main session
- Ticket: DIS-68 (parent DIS-56)

**Questions for the author** (each one blocks until answered; recorded in the closing section):

- **Q1 (V4 tightens D5).** D5 says a line-cut excerpt matches if it is a *prefijo de la primera línea*. V4 and the scenario "A line-cut span matches the first code points of its line" make that exact: the excerpt must be exactly the first `MAX_EVIDENCE_TEXT_CHARS` code points, and anything shorter is `excerpt-mismatch`. Recommended: accept, because `truncate` keeps exactly that many code points (`sanitize.ts:175`) and "any prefix" would accept an empty excerpt. It narrows a default the author wrote, so it needs a yes.
- **Q2 (V6 picks one of two options).** The ticket offered "exponerlo en el pack o resolverlo igual" for the root. The agent chose to expose it: `FilledContextPack.root`, plus a new `MODIFIED` delta of `context-engine` that the ticket's OpenSpec list (explain, cli-ask) does not name. Confirm the choice.
- **Q3 (V10 is not in the ticket).** The `verify-no-io` dependency-cruiser rule is new scope. Cheap, copies `explain-sanitize-no-io`; the author decides whether it stays.
- **Q4 (Rule 8, ADR rationale).** `docs/adr/20261014-broken-citations-not-stored.md` §Decision says "for the reasons it was presented with". That reads as AI-written reasons the author accepted. Confirm the three bullets are the author's own reasons, or replace them with the author's words, before the ADR is committed (task 12.3).

Sub-issue vs parent: the two disagreements are already settled by DIS-68 `[enhanced]`: `StorePort.readSpan` is dropped (ADR 20261011) and citations are checked at `pack.commit`, not at the `indexed_commit` of the moment (D1).

---

## 1. Scope against the ticket

Everything follows from DIS-68's reality map, its `[enhanced]` block or its Done list. Invented or chosen-alone items:

| # | Item | Severity | Correction |
|---|---|---|---|
| 1.1 | V10 / task 3.11 / proposal Impact "Architecture check": the `verify-no-io` rule | improvable (Q3) | Keep only if approved; otherwise delete V10, task 3.11 and the Impact bullet. |
| 1.2 | `context-engine` delta + V6 + tasks 1.2–1.3 | improvable (Q2) | Allowed by the ticket's either-or. Record the choice in a Linear comment. |
| 1.3 | `sanitize.ts` exports `TRUNCATION_LINE_CUT_MARK` (V4, task 2.3) | clean | — |

## 2. Inherited acceptance criteria

- DIS-68 AC1 → explain "Cited spans are verified in one read at the pack's commit"; `persisted: false` + `cited` via "Persistence failure" and "An unsaved answer keeps only its verified citations". Covered.
- AC2 → "A missing file or a range out of the file is broken", "Other read failures propagate"; events without content → "Evidence broken events follow…". Covered.
- AC3 → "A diverging excerpt is broken"; edges (a)–(d) → the four boundary scenarios. Covered.
- AC4 → "A broken citation is neither stored nor shown", "Every citation broken is unknown with broken evidence"; event order → "An unsaved answer keeps only its verified citations". Covered.
- AC5 → cli-ask "A broken citation is logged as an error", "Every citation broken answers broken-evidence". Covered.
- Parent DIS-56 AC1, AC2 covered (`pack.commit` per D1). AC3, AC5, AC6 → DIS-70 (Non-goals).
- Parent AC4 (evaluation mode gives `cited` at most): unreachable, evaluation mode answers `llm-required` before the pack. **Improvable:** add a Non-goals line.

No blocking gap.

## 3. Missing scenarios

| # | Requirement / clause | Severity | Correction |
|---|---|---|---|
| 3.1 | "Expected text": "an empty file has one empty line" | improvable | Add to "A last line without a final line feed matches": an empty file, lines 1–1, empty excerpt → `cited`. |
| 3.2 | explain: "Spans of the pack that no statement cites SHALL NOT be checked nor read" | improvable | In "Cited spans are verified in one read at the pack's commit", add an uncited `E3` of a third file and assert it is not read. |
| 3.3 | "SHALL write nothing to any log" / determinism | improvable | Add to "Valid citations are cited…": same verdicts again, nothing through `console`. |

## 4. Ambiguity

Vague-word search clean. 4.1 (improvable): cli-ask "A broken citation is logged as an error" — "no other field" ignores `level` and `type`; state the exact field set.

## 5. Open decisions

| # | Where | Severity | Correction |
|---|---|---|---|
| 5.1 | V9: `afterReads.count: 1` assumes the pack's batch is the first read. `packOf(d, …)` (`tests/support/explain-doubles.ts:71-78`) reads through `d.deps.source` before `explain` in existing tests; `explain`'s own pack read would then see the changed content. | **blocking** | Tie the switch to the model call: `options.after?: { when: () => boolean; contents; failures? }`; `doubles()` passes `when: () => order.includes('complete')` (`scripted-llm.ts:64` pushes `'complete'`). Also expose `batchReads` and `reads` from `doubles()`. |
| 5.2 | V5 makes `TypedStatement.evidenceIds` required; `explain.spec.ts:461-467` builds `TypedStatement` literals without it, so task 2.4's typecheck fails; task 8.3 lists that scenario as unchanged though its `'none'` assertion must become `'cited'`. | **blocking** | `toClaimItems` takes `readonly Pick<TypedStatement, 'text' \| 'type' \| 'spans'>[]`; move the scenario from 8.3 to 8.2. |
| 5.3 | V3: which content is checked after a `missing` batch whose single reads succeed | improvable | "the contents of the single reads are the ones checked". |
| 5.4 | Batch `missing` also means "no such commit" | improvable | Note in Risks (DIS-42). |
| 5.5 | The event's lines for a cut span | improvable | "the cited sanitised span's (a cut span ends at its kept last line)". |
| 5.6 | Task 10.2 "a model the author names"; the stub exists nowhere | improvable | Name the model or the stub's location. |

## 6. Contradictions inside the change

| # | Severity | Problem | Correction |
|---|---|---|---|
| 6.1 | **blocking** | Same as 5.2. | As 5.2. |
| 6.2 | improvable | Task 8.3 "eight older ones" of "Precedence…"; there are nine. | "nine". |
| 6.3 | improvable | Ticket: evidence verification "viene del veredicto"; V7 hard-codes `'cited'`. | Explain in V7 why the literal holds; DIS-70 passes the verdict. |
| 6.4 | improvable | "Each cited span SHALL give one evidence row". | "Each remaining cited span". |
| 6.5 | improvable | Goal "an unchanged file can never be reported `broken`" is false for a graph range beyond the file (`context-pack.ts:241-243` slices silently). | Reword; list it as the main real trigger of `range-out-of-file`. |

## 7. Contradictions with the project

- ADRs 20261011, 20261013, `docs/backend-standards.md` §3, `claims-and-typing`, `graph-schema`: no contradiction.
- `MODIFIED` blocks compared paragraph by paragraph with the main specs: nothing dropped. Cosmetic: explain delta line 41 over-long.
- 7.1 (improvable): task 9.4 should use the documented `npm run test:mutation -- --mutate …`.
- 7.2: Q4.

## 8. Contrast with the real code

- V2, V4, V5, V6, V8 match the code (`context-pack.ts:138-142, 187, 196, 243`; `sanitize.ts:172-187`; `explain.ts:171-186`; `logger.ts:17,34`). No CLI prints a pack, so `root` does not leak.
- 8.1 (improvable): `.dependency-cruiser.cjs` uses `tsPreCompilationDeps: true`; `verify/` must import explain's leaf modules, never `explain/index.js`, or it closes a cycle.
- V9: defect 5.1. V10: Q3.
- Existing unit tests: no `readFilesAt == 1` count in `tests/unit/explain`; all acme-shop subset and `threeSpans` ranges fit their synthetic files. No false `range-out-of-file`.
- D1 observation: at a fixed commit git content cannot change; in production `broken` comes from a graph/code range inconsistency (6.5) or pack/verifier drift. Bears on task 10.3.

## 9. Task size

| # | Task | Severity | Correction |
|---|---|---|---|
| 9.1 | 4.4 bundles four behaviours and the whole `verify-answer.ts` | improvable | Split into 4.4–4.7. |
| 9.2 | 10.3 has no working route under D1 | improvable | On the temporary project, raise `symbol.end_line` past the file for the symbol cited as `E1` → `range-out-of-file`, `UNKNOWN (broken-evidence)`. |
| 9.3 | 5.3 GREEN touches three files | clean | — |

## 10. Mandatory steps

All present and ordered; only finding 7.1.

## 11. Traceability

Every scenario maps to a task; the only wrong row is "The subject of a claim is the symbol of its first cited span" (8.3 → 8.2, finding 5.2).

## Corrections to apply

1. design V9 → `after.when` double; `doubles()` returns `batchReads`, `reads` (5.1).
2. design V5 → `toClaimItems` takes `Pick<…>` (5.2).
3. design V1/V7 → leaf imports only (8.1).
4. design V3 → single-read contents are checked (5.3).
5. design Goals/Risks → reworded goal; range-beyond-file and missing-commit risks (6.5, 5.4).
6. design V7 → why the literal `'cited'` (6.3).
7. design V4/V6/V10 → author confirmations (Q1–Q3).
8. proposal Non-goals → evaluation mode never verifies (§2).
9. proposal Impact → remove "Architecture check" if V10 is cut (Q3).
10. proposal D5 bullet → refined by V4 (Q1).
11–13. evidence-verification spec → single-read contents; determinism + no console; empty file (5.3, 3.3, 3.1).
14–17. explain spec → "remaining cited span"; uncited `E3`; event lines of a cut span; wrap line 41 (6.4, 3.2, 5.5).
18. cli-ask spec → exact field set (4.1).
19–27. tasks → 2.3 `Pick`; split 4.4; 5.1 double; 8.2/8.3 moves and "nine"; 9.4 command; 10.2 model/stub; 10.3 route; delete 3.11 if V10 cut.
28. ADR 20261014 → author's own rationale (Q4).
29. Linear DIS-68 → a Spanish comment with the Q1–Q3 outcomes, the D1 observation and the illustrative paths of AC1.

## Resolution

Author's answers (2026-10-14): Q1 accept the exact line-cut rule; Q2 expose `root` on the pack;
Q3 keep `verify-no-io`; Q4 the three ADR reasons are the author's own.

| # | Correction | Resolution |
|---|---|---|
| 1 | design V9 `after.when` double, `batchReads`/`reads` | fixed (blocking 5.1) |
| 2 | design V5 `toClaimItems` takes `Pick<…>` | fixed (blocking 5.2) |
| 3 | design V1 leaf imports only | fixed |
| 4 | design V3 single-read contents | fixed |
| 5 | design Goals/Risks | fixed (goal reworded; two risks added) |
| 6 | design V7 literal `'cited'` | fixed |
| 7 | design V4/V6/V10 confirmations | decided by the author (Q1–Q3), recorded in design |
| 8 | proposal Non-goals: evaluation mode | fixed |
| 9 | proposal Impact "Architecture check" | not applicable: V10 kept (Q3) |
| 10 | proposal D5 bullet | fixed, refined by V4 (Q1) |
| 11–13 | evidence-verification spec | fixed |
| 14–17 | explain spec | fixed (line 41 wrapped) |
| 18 | cli-ask exact field set | fixed |
| 19–24, 26 | tasks 2.3, 4.4–4.7, 5.1, 8.2, 8.3, 9.4, 10.3 | fixed |
| 25 | task 10.2 model / stub | fixed: the author names the model at step 10 (no model chosen now); the stub lives in the session scratchpad and is removed in 10.6 |
| 27 | delete 3.11 | not applicable: V10 kept (Q3) |
| 28 | ADR rationale | decided by the author (Q4): reasons confirmed; "for the reasons it was presented with" → "for these reasons" |
| 29 | Linear comment | done (DIS-68, comment in Spanish, 2026-10-14) |

## Re-audit (2026-10-14)

APPROVED

Both blocking findings fixed; Q1–Q4 recorded; every improvable correction present; no empty
traceability row. Two remaining improvable findings, both fixed after the verdict:

| # | Finding | Resolution |
|---|---|---|
| R1 | task 12.2 named the dropped `afterReads` option | fixed: `options.after` (`when`, `contents`, `failures`) and `doubles()` `verificationContents` / `verificationFailures` |
| R2 | task 10.3 needs the stub to force a citation of `E1` | fixed: 10.3 uses the step 10.2 stub |
