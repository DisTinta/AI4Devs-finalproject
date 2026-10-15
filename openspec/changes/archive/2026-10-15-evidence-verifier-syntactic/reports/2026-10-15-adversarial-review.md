# Adversarial review: evidence-verifier-syntactic (DIS-68), PR #41

- Date: 2026-10-15
- Run by: the `adversarial-review` skill (read-only subagent, a different session from the one that implemented the change); saved verbatim by the main session
- Diff: `1d6c105..2e0b6a1` (43 files). Production code is in `packages/core/src/{verify,context,explain}` and `packages/cli/src/commands/ask.ts`.
- I did not re-run any tests. Test states come from report 9 and from `reports/2026-10-15-verify-against-spec.md`.

## Findings

| Severity | File:line | Finding | Why it matters |
|---|---|---|---|
| Question | `packages/core/src/explain/explain.ts:96` with `packages/core/src/context/context-pack.ts:238-239` | Inside `explain`, the excerpt is the pack's own text. The verifier re-reads the same commit and root and cuts it with the same `redactedLines`/`spanText`. The model only cites ids and never writes an excerpt or a range. So `excerpt-mismatch` and `file-missing` can't happen at a stable commit. The only reason that can fire is `range-out-of-file`, which comes from the pack's existing silent slice of a graph range that runs past the end of its file (design Risks says the same). | Every answer pays one more git batch to catch a pack/graph defect that could be caught at `cut()` with no extra read. The verifier's real value is for DIS-42 (another commit, stored excerpts). The author should confirm that this is the intended trade-off under D1, rather than an assumption that it catches model fabrication. |
| Question | `packages/core/src/verify/policy.ts:25` | Retyping can raise a statement's type. If a statement cites `anchor` + `heuristic` and the heuristic citation is broken, it becomes `FACT`. The statement text may have come from the span that was dropped. The spec requires this ("can only keep or raise it"). | Losing evidence makes a claim stronger. The rule is specified and the author decided it (D2/D3), but it should be confirmed on purpose and not inherited from `typeStatement`. |
| Minor | `packages/core/src/verify/syntactic.ts:60` | Malformed line numbers pass the range check. `NaN` fails every comparison, so `{startLine: NaN, endLine: NaN, excerpt: ''}` gives `cited`. Fractional lines are truncated silently by `slice`. It can't happen through `explain`, but `verifyCitations` is exported from `@codemind/core` for DIS-42. | A verifier that passes on malformed input is the wrong default for a public API (repeats verify-against-spec §3.1). |
| Minor | `packages/core/src/verify/syntactic.ts:52` | If the port returns fewer contents than paths, the missing ones are read as `file-missing`. That breaks the port contract (`SourceTreePort.ts:66-68`: "never a partial result"), but it is reported as a broken citation instead of an error. | An adapter bug would look like a code/citation problem in logs. Repeats verify-against-spec §3.3. |
| Minor | `packages/core/src/verify/syntactic.ts:108-117` with `packages/adapters/git/src/git-source-tree.ts:111,134` | The git adapter rejects a missing commit as `SourceUnavailable('missing')`. The fallback then marks every path `file-missing`, so a missing commit becomes `UNKNOWN (broken-evidence)` with error lines, not a propagated `SourceUnavailable`. Design Risks records this, but `design.md` → Follow-ups is still empty. | Harmless under D1, but a wrong diagnosis for DIS-42, which will pass arbitrary commits. It needs a destination. |
| Minor | `packages/core/src/explain/sanitize.ts:189` with `packages/core/src/context/context-pack.ts:238` | Whether a graph range past end-of-file is caught depends on span length. If the symbol's span is longer than `MAX_EVIDENCE_TEXT_CHARS`, `truncate` sets `endLine` to the kept line, inside the file, so the citation comes back `cited`. A shorter span with the same defect comes back `range-out-of-file`. | Follows the spec and is consistent per span, but the "main real trigger" in design Risks is detected unevenly, and the `untrusted_content_truncated` event still carries the out-of-file `originalEndLine`. |
| Minor | `git log 1d6c105..HEAD` | The four delta specs, design and tasks were first committed in `2c29886`, after the code commit `0e1aed0`. Git history can't show whether the spec was edited after implementation to match the code. The only earlier record is `reports/2026-10-14-spec-audit.md`, and its Q1–Q4 decisions match the final V4/V6/V10. | Axis 1 "spec edited after implementation" can't be checked from history. Process debt. |
| Minor | `tests/unit/verify/syntactic.spec.ts:56`, `tests/unit/explain/explain-verification.spec.ts:163` | Two assertions are weaker than their scenarios: the second run's batch paths aren't asserted, and the root is compared to a literal instead of `pack.root`. No test imports `EVIDENCE_BROKEN_REASONS` or asserts the order of `UNKNOWN_REASONS`. | Reordering the reason sets would go unnoticed. |
| Question | `tasks.md` 11.2, 14.2–14.5 | 11.2 (the CI run) is unchecked; the show-spec-working and verify-against-spec reports are untracked; `tasks.md` has uncommitted edits. | Archiving needs the CI evidence linked and these reports committed. |

**Checked and found clean:**

- **Spec alignment:** every one of the 69 scenarios maps to a same-named test. The code does nothing outside spec/design: `root` on the pack, the `verify-no-io` rule and the exports were approved in Q2/Q3/V1–V10.
- **Hostile input:** an empty citation list reads nothing; boundary ranges (`1–20` of 20 lines) and one past (`18–30`, `0–3`, `9–8`, `10–13`) behave correctly; an empty file gives one empty line; CRLF and astral line cuts agree with `truncate`; duplicate ids are rejected upstream (`statement-schema.ts:86`); the same request twice gives the same verdicts; concurrent requests share no state; non-`missing` failures propagate.
- **Blast radius:** the DB enum already contains `cited`; no reader filters on `verification = 'none'`; `ask.ts` formats any `UNKNOWN` reason generically; no `.claude/` files in the diff.
- **Existing tests modified:** `none` → `cited` as the spec requires; assertions added, none weakened; the doubles' `options.after` / `verificationContents` are additive.

**Mutation check on the most important test:** "A missing file or a range out of the file is broken" (`syntactic.spec.ts:62`) fails if `endLine > lines.length` becomes `>=`, if `startLine < 1` becomes `<= 1`, or if the per-path fallback is removed. The "redacted secret" test still fails if the verifier skips redaction, so it tests behaviour, not implementation.

## Verdict

**PASS WITH GAPS.** No Blockers, no Majors. Suggested destinations:

| Finding | Class | Destination |
|---|---|---|
| NaN or non-integer lines are `cited` (`syntactic.ts:60`) | B | DIS-42 hand-off, or fix now with TDD (cheap) |
| Short port result read as `file-missing` (`syntactic.ts:52`) | B | DIS-42 hand-off: throw on a length mismatch |
| Missing commit reported as `file-missing` (`syntactic.ts:108-117`) | B | DIS-42 hand-off (already in design Risks; add to Follow-ups) |
| Uneven detection of graph overrun for truncated spans; pack slices silently (`context-pack.ts:238`) | C | Linear debt issue |
| Weak assertions and untested reason-set order | A | Fix in this change (tests only) |
| Spec first committed after the code | n/a | Process debt, recorded in report 9 |

The two Questions (cost and tautology under D1; retyping can raise the type) need the author's answer recorded in `design.md` → Follow-ups.

## Recommended next steps before archiving

1. Author's answers to the two Questions, in `design.md` → Follow-ups.
2. Strengthen the weak assertions (A).
3. Fix the NaN/non-integer and length-mismatch cases with TDD, or hand them to DIS-42 (B), with the missing-commit case.
4. Linear debt issue (C) for the pack's silent slice past end-of-file.
5. Fill `design.md` → Follow-ups with each finding and its destination (14.3).
6. Complete 11.2; commit `tasks.md` and the reports to PR #41 (push confirmed with the author).
7. `/opsx:archive` only after steps 1–6.

## Addendum — resolution (2026-10-15)

The author answered both Questions (keep the verification read; confirm the retyping of D2/D3) and
chose to fix in this change the non-integer lines, the short read and the graph range hidden by a cut
(by checking the cut span's original last line, not by changing the pack). The missing commit went to
DIS-42 as a hand-off comment. Every finding has its destination in `design.md` → Follow-ups. Tests,
gates and Stryker re-run green (report 9, addendum). No Blocker or Major was raised, so the review is
not re-run.
