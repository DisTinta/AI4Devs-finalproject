# Test and State Verification Report

- Date: 2026-10-15
- Change: evidence-verifier-syntactic (DIS-68)
- Step: 9 — Run Tests and Verify Data State

## Commands executed

- `npx vitest run` (baseline, step 0.4, `DATABASE_URL` set to the local compose database)
- `npx vitest run tests/unit/verify tests/unit/explain tests/unit/context tests/unit/cli/ask-command.spec.ts tests/integration/explain tests/integration/cli/ask-command.spec.ts`
- `npx vitest run`
- `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- `npm run test:mutation -- --mutate "packages/core/src/verify/**/*.ts,packages/core/src/context/span-text.ts"` (twice: before and after the survivor tests)
- `docker exec codemind-postgres-1 psql -U codemind -d codemind -tAc "<count query>"` (before and after)

## Test results

- Baseline (before any change): 92 files, 1215 tests passed, 0 failed, 0 skipped (136.7 s).
- Targeted tests: 240 passed, 0 failed, 0 skipped (23.2 s).
- Required suite: 96 files, 1241 tests passed, 0 failed, 0 skipped (192.9 s). One test was added after this
  run (the Stryker survivor test below); `tests/unit/verify` re-ran green with it (17 tests).
- Gates: `lint` clean; `typecheck` clean; `lint:architecture` 0 errors (the 3 `no-orphans` warnings exist
  on the base branch too); `docs:coverage` clean.
- Architecture rule `verify-no-io` (3.11): a temporary `import { readFileSync } from 'node:fs'` in
  `syntactic.ts` made `lint:architecture` fail with `error verify-no-io: packages/core/src/verify/syntactic.ts → fs`;
  removed, green again.
- Notes:
  - RED seen before GREEN for 1.2, 3.1, 3.3, 3.5, 3.8, 3.9, 4.1, 4.3, 4.4, 5.2, 6.1, 6.2.
  - Green on arrival, recorded honestly: 3.4 (the `missing` fallback of 3.3 must rethrow every other
    rejection), 3.6, 3.7 and 3.10 (already guaranteed by the shared span-text rule extracted in 1.1),
    4.5–4.7 (behaviour written with `verifyAnswer` in 4.4) and 5.4–5.9 (the `explain` wiring of 5.3
    already held the `broken-evidence` branch). Each was proven not to be vacuous: 4.5 fails when the
    ids are string-sorted; 6 of the 7 `explain-verification.spec.ts` tests fail when `verifyAnswer` is
    replaced by a pass-through (the 7th, "No verification read without statements", guards the order
    of the early returns); the rest are covered by the Stryker run.

### Existing tests edited (8.2), because the spec changed

- `tests/unit/explain/explain.spec.ts`
  - "The subject of a claim is the symbol of its first cited span": `toClaimItems` evidence
    verification `none` → `cited` (D7).
  - "stores each statement as an L2 inference that keeps its statement type" (extra): statement
    verification `none` → `cited`.
  - "A failed write still answers, unsaved and without leaking": statement verification `none` → `cited`.
  - "An answer written after a re-index is stored stale": adds verification `cited`, no
    `evidence_broken` event, and every batched read at the pack's commit (new THEN clauses).
  - "Explaining writes nothing to the console": two more runs, `broken-evidence` and one broken
    citation of two.
- `tests/integration/explain/explain.spec.ts` "An answer with evidence is typed, stored and returned":
  verification `none` → `cited`, events empty, `evidence.verification = 'cited'` in the rows.
- `tests/unit/cli/ask-command.spec.ts` fixture `statement()`: `verification: 'none'` → `'cited'`
  (`AnswerStatement.verification` is now the literal `'cited'`).
- `tests/support/in-memory-source-tree.ts`, `tests/support/explain-doubles.ts`: `options.after`,
  `verificationContents` / `verificationFailures`, `batchReads` / `reads` (5.1); every existing suite
  stayed green unchanged.

No other assertion was weakened. Seeded prior claims and store fixtures keep `verification: 'none'`
(rows written before DIS-68). Every `#### Scenario:` of the four delta specs (69) maps to exactly one
test of the same name (8.4).

### Mutation testing (9.4)

| File | Score |
|---|---|
| `verify/policy.ts` | 100.00 |
| `verify/syntactic.ts` | 96.67 |
| `verify/verify-answer.ts` | 100.00 |
| `context/span-text.ts` | 100.00 |
| Whole run (incremental report) | 95.72, break threshold 80 |

First run: `verify/` 94.53 (7 survivors in `syntactic.ts`). Meaningful survivors killed with tests:
the batch `catch` mutants (a non-`missing` batch failure must not fall back to single reads:
assertion added to "Other read failures propagate"), `cut === 'line-cut'` → `true` and `> 0xffff` →
`>= 0xffff` (extra test "compares an uncut citation over the limit whole, and cuts a line of U+FFFF by
code points"). Remaining 3, equivalent: `return []` → `["Stryker was here"]` for an empty path list
(no citation reads the result), and the loop bound `index < text.length` → `<=` / `true` in
`firstCodePoints` (`slice` clamps at the end).

### Privacy and ethics check (9.5)

`/privacy-ethics-check` over the diff: **PASS**. `evidence_broken` carries the prompt id, a
repository-relative path, line numbers and a closed-set reason only; the test "Evidence broken events
follow the sanitisation events and carry no content" checks a sentinel and every line of the changed
files never reach the events. No PII, credentials (the AWS-shaped key of the test is built at run time)
or dependency change in the diff. No model call is added.

## Data state verification

- Pre-test baseline (0.4): `project` 1, `claim` 0, `evidence` 0, `evidence` by verification: none.
- Post-test validation: `project` 1, `claim` 0, `evidence` 0; no `.stryker-tmp/` left.
- State restored: Yes (integration tests run in rolled-back transactions).
- Restoration actions: none.

## UI evidence

- None: the change has no browser UI; the terminal is the client and step 10 drives it end to end
  (11.1, not applicable beyond step 10).
- CI run of the PR (11.2): [run 38715548456](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/38715548456) on `000db86`, all jobs green (see the addendum below).

## Outcome

- Status: PASS
- Blocking issues: none

## Addendum — after the pre-merge review (2026-10-15)

Fixes decided by the author on the verify-against-spec and adversarial-review findings (design V13 and
Follow-ups), each RED → GREEN:

- "Non-integer lines are out of the file", "A short batched read is an error", "A cut span whose
  original range leaves the file is broken" (new scenarios of `evidence-verification`), and the extra
  `verify-answer.spec.ts` test "passes the original last line of a cut span, so a range past its file
  breaks even when cut". All four failed before the fix.
- Strengthened assertions (no behaviour change): both batches of "Valid citations are cited and each
  path is read once"; a citation both out of range and mismatched (the range is checked first) and
  `EVIDENCE_BROKEN_REASONS` in "A missing file or a range out of the file is broken"; `UNKNOWN_REASONS`
  in "Every citation broken is unknown with broken evidence"; `pack.root` / `pack.commit` in "Cited spans
  are verified in one read at the pack's commit"; the exact error message of the short read (a Stryker
  survivor).

Re-run:

- `npx vitest run`: 1246 tests passed, 0 failed, 0 skipped (149.8 s).
- `lint`, `typecheck`, `lint:architecture` (0 errors, the 3 known warnings), `docs:coverage`,
  `openspec validate evidence-verifier-syntactic --strict`: clean.
- Stryker: whole run 95.73; `verify/` 97.87 (`syntactic.ts` keeps the 3 equivalent survivors listed
  above); `span-text.ts` 100.
- State after: `project` 1, `claim` 0, `evidence` 0 — equal to the baseline.

Process note (adversarial review): the delta specs, design and tasks were first committed in
`2c29886`, after the code commit `0e1aed0`, so git history alone cannot show they were not edited to
fit the code; the spec audit of 2026-10-14 (`2026-10-14-spec-audit.md`) predates the apply and its
Q1–Q4 match V4/V6/V10. The V13 additions are the only spec edits after the apply, decided by the author.

## Addendum — CI of PR #41 (11.2)

The PR fired no workflow run until the author re-enabled GitHub Actions on 2026-10-15 (the `CI` and
`Frontend` workflows themselves were `active`; the cause of the disablement is not visible from the
session). An empty commit, `000db86` ("ci(DIS-68): re-run CI after Actions was re-enabled"), triggered
[run 38715548456](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/38715548456):

- Jobs `scope`, `secrets`, `quality` (2m1s) and `mutation` (6m2s): all green.
- `quality` ran the four new spec files (`tests/unit/verify/{syntactic,policy,verify-answer}.spec.ts`,
  13 + 3 + 5 tests, and `tests/unit/explain/explain-verification.spec.ts`, 7 tests): 96 files,
  1245 passed, 1 skipped (`tests/unit/index/path-policy.spec.ts` "A path on another Windows drive is
  forbidden", `runIf(win32)`, skipped on the Linux runner as before this change).
- `mutation`: final score 95.78, break threshold 80; `verify/` 97.87.
- The `seed-build.spec.ts` failure of the base branch's last run (38604214188) did not recur.
