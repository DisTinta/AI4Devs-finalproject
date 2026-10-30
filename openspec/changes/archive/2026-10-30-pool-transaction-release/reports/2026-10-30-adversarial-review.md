## Adversarial review

- Date: 2026-10-30
- Change: pool-transaction-release (DIS-110)
- Mode: inline (autonomous run). The hostile read was done by a fresh read-only subagent (model
  Sonnet, `claude-sonnet-5-5`), over `git diff origin/final-project-CRN...HEAD` at `b4362b8`, the change
  artifacts and reports, and `node_modules/pg` / `node_modules/pg-pool`. Every finding was then checked
  against the code by the orchestrating agent (column "Check"); destinations are in `design.md` →
  Follow-ups, X14.

### Findings

| Id | Severity | File:line | Finding | Why it matters | Check | Destination |
|---|---|---|---|---|---|---|
| A1 | Major | `tasks.md` 3.1, 3.2, 10.1 | Tasks 3.1/3.2 are `[x]` but the `explain` Purpose edit was never made; 10.1 still asks to mention the `docs(DIS-110)` commit | An `[x]` that means "dropped" reads as completion | Confirmed. The checkboxes follow the run's instruction and carry the note "fuera de este cambio: bloqueado por el hook protect-specs-and-tests; destino C, la autora"; the work goes to the author (X8). 10.1 text fixed | C (X8); 10.1 A (fixed) |
| A2 | Major | `tasks.md` 2.1, `design.md` D5 | Both still require `projectCount()` back to the baseline, which the test no longer asserts | Artifacts disagree with the code | Confirmed; the spec never required it (X9). Text of 2.1 and D5 fixed | A (fixed) |
| A3 | Major | `reports/2026-10-30-6-test-and-state-verification.md` | The 1.3 old-code result and the Stryker score are prose only; one code commit holds code and tests | The only evidence that the integration tests are not vacuous | Confirmed. Re-run on the old runner with the raw output and a fresh Stryker summary in the step 6 addendum | A |
| A4 | Minor | `transaction.ts:41`, `:62-64` | No test for `pool.connect()` rejecting, a synchronous throw of the work, a non-`Error` throw | A refactor could double-release or leak silently | Correct by reading (connect outside the `try`; a sync throw is inside it; a non-`Error` is rethrown by identity). Any edit of `store-postgres/src` would also stale the seed fingerprint again (X11) | D |
| A5 | Minor | `transaction.ts:46-51` | `broken` doubles as a truthy flag; a falsy rejection would return a broken connection | Implicit contract on the driver | `pg` rejects only with `Error` instances; outside the contract (design D2) | D |
| A6 | Minor | unit spec :51-69; integration :250-317 | Two separate stub pools; the "no unhandled `error` event" clause rests on Vitest | Same as V1 | Vitest fails the run on an uncaught exception (D5); shown by the raw 1.3 run | D |
| A7 | Minor | `tests/integration/store/open-store.spec.ts` ("Every connection is released after a run") | The existing `it` is flaky under parallel files (`projectCount()`), left D with no owner | Will be lost | Confirmed (step 6 report). Existing test not edited by this change; no ticket in this run | C (author) |
| A8 | Question | `transaction.ts:67-69` | A failed `COMMIT` always becomes the fixed message, so causes are indistinguishable | Diagnostics | Pre-existing behaviour mandated by the spec (D4) | D |

Checks that produced no finding (reviewer, confirmed): the diff of `open-store.spec.ts` is purely
additive (no existing `it` or helper edited); the delta spec was last touched in `ab59d00`, before the
code commit `a9c0a59`; release exactly once through one `finally`, the listener removed before
`release` and `pg-pool` re-adding its idle listener only after; `ROLLBACK` on a terminated client
rejects (`pg/lib/client.js`), so the connection is destroyed and the work's error wins; no driver text
in the failed-commit error; `terminateSessions` waits until no session remains, so the integration
tests are not vacuous; `release()` without the error argument is caught by
`toHaveBeenCalledWith(begin / rollback)`; callers and the package index unchanged.

Not covered by the reviewer's diff (it ran before): the CI `verify` failure and the golden round of
design X11–X13, a seed fingerprint consequence and not a defect of the runner.

### Verdict

PASS WITH GAPS — no Blocker; the three Majors are artifact and evidence gaps, two fixed in the text
(A1's 10.1, A2) and one closed with re-run evidence (A3); A1's task 3 goes to the author (C). Every
gap has a destination.

### Recommended next steps before archiving

1. Add the raw 1.3 old-code output and the Stryker summary to the step 6 report (A3).
2. Finish the DIS-110 golden round (groups 12–12d) so the CI `verify` job is green.
3. Archive only with CI green on the archive commit.
