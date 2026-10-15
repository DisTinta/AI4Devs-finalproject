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
- CI run of the PR (11.2): pending, linked here after the push.

## Outcome

- Status: PASS
- Blocking issues: none
