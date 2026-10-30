# Adversarial review: integration-test-races (DIS-110)

- Date: 2026-10-30
- Mode: inline (`ai-specs/skills/adversarial-review/SKILL.md` → Inline mode). A fresh read-only
  subagent (Sonnet), which did not write the change, reviewed the diff `origin/final-project-CRN...HEAD`
  (33 files, none under `packages/**`) and the artifacts; the agent verified each finding in the code
  and gave it a destination (`design.md` → Follow-ups, R-rows).

## Findings

| Id | Severity | File:line | Finding | Resolution / destination |
|---|---|---|---|---|
| R1 | Major | reports; tasks 3.6 | No executed evidence that the five rewritten failure tests still fail when the store leaks the database error or skips its rollback | **A, fixed**: throwaway mutations run and reverted (step 5 report, addendum). Leak: the four graph-store tests fail; the explain test passes by design (its events never carry the store error). No rollback: all five fail |
| R2 | Minor | `tests/integration/helpers/snapshot.ts:49-58` | A failing `ROLLBACK` (dead connection) replaces `work`'s error; no `'error'` listener on the own client | C, author (H1) |
| R3 | Minor | `snapshot.spec.ts` | The rollback between attempts, the pause and the rethrow after the window are not tested through `inOwnSnapshot` itself (the window through the predicate) | C, author (H1) |
| R4 | Minor | `snapshot.ts:35-52` | The retry would also absorb a genuine `40001`/`55P03` raised by code under test | D: the three users have no such production path; trade-off recorded in D2a and Carreras conocidas |
| R5 | Minor | `rejecting-writes.ts:28-33, 56-58` | The quoting guard checks whole tags only; a quote ending in `$do`/`$rejected` could close a literal | C, author (H1); unreachable with today's callers |
| R6 | Minor | `rejecting-writes.ts:46` | The regex misses schema-qualified, quoted or `WITH … INSERT` statements and a `QueryConfig`; `table` is not escaped | C, author (H1); fail-loud (the expected store error does not appear) |
| R7 | Minor | `global-setup.ts`, `vitest.config.ts` | Blast radius: (a) an unreachable database aborts unit-only runs when `DATABASE_URL` is set; (b) a second concurrent run can be refused while another holds transient committed projects; (c) the registration has no test | (a), (b) **A, fixed** in `docs/TESTING.md` → Comprobación al arrancar; (c) C with V1 (H1). CI not affected (checked: `mutation` has no URL, `quality` starts on a fresh database, `verify` does not use Vitest) |
| R8 | Minor | `open-store.spec.ts:168-171, 190-192, 212-214` | The scoped final check runs after the `finally` clean-up, so it cannot catch a leak of the store | D: it checks that the clean-up left nothing of the test's own, exactly what the removed global count checked after the same clean-up (D1); the scenario itself is proven by the in-`try` assertions |
| R9 | Minor | step 5 report; tasks 4.1 | First-phase "Outcome: FAIL" next to ticked tasks | **A, fixed**: the first-phase outcome is marked superseded by the second phase; 4.1 extended by 4.3 |
| R10 | Minor | step 5 report, D10 | 5 + 3 green runs are a weak statistical claim | D: the rule was fixed before the runs (D10); CI `quality` adds one more full run per push |
| Q1 | Question | `vitest.config.ts` | Does the `node` project's check run for a `--project dom` run? | D, answered: Vitest 4.1 runs the `globalSetup` only of projects that have test files in the run (spec audit run 6 read `initializeGlobalSetup`), so a `dom`-only run is not checked |

## Verdict

PASS WITH GAPS. No Blocker. The only Major (R1) is closed with executed mutation evidence. Every
remaining gap has a destination: H1 (C, one hardening item for the author: `snapshot.ts` dead-connection
handling and retry-path tests, `rejectingWrites` quoting/regex edges, a test of the `globalSetup`
registration), the rest D.

## Next steps before archiving (done)

1. R1 mutation evidence recorded (step 5 report, addendum).
2. Destinations in `design.md` → Follow-ups.
3. `docs/TESTING.md` updated (R7 a, b); report consistency fixed (R9).
4. CI on the pushed head: see the step 5 report addendum of task 9.2.
