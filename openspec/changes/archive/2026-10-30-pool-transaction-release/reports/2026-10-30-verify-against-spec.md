# Verify against spec: pool-transaction-release (DIS-110)

- Date: 2026-10-30
- Mode: inline (autonomous run). The read was done by a fresh read-only subagent (model Sonnet,
  `claude-sonnet-5-5`), given the code and the skill, not the implementer's conclusions; every finding
  was then checked against the code by the orchestrating agent (column "Check").
- Compared: the delta `specs/graph-store/spec.md` (requirement "Running work in one transaction on a
  pooled store", 4 scenarios kept, 7 added) with `git diff origin/final-project-CRN...HEAD` at
  `b4362b8` (code unchanged since `a9c0a59`).

## 1. Requirements implemented correctly

- Connection taken, `BEGIN`, store bound to the transaction, commit or rollback, result or error
  propagated: `packages/adapters/store-postgres/src/transaction.ts:41-70`; tests "Work that resolves is
  committed" (`tests/integration/store/open-store.spec.ts:164`), "Work that rejects leaves nothing" (:182).
- Released exactly once, a single `finally` with `client.release(broken)`: `transaction.ts:70-73`;
  `pool.connect()` is outside the `try`, so a failed connect releases nothing. Every stub-pool `it`
  asserts `release` called once.
- Failed `BEGIN`: `transaction.ts:47-51` stores the raw error, never reaches `COMMIT`/`ROLLBACK`,
  releases with it; `tests/unit/store/open-store-transaction-errors.spec.ts:81-97`.
- Failed `ROLLBACK` after a work error: `transaction.ts:57-60`; the work's error wins; unit spec :99-116.
- Failed `COMMIT`: `transaction.ts:62-69`, fixed `Error(COMMIT_FAILED_MESSAGE)` with no cause, release
  with the rollback error or `undefined`; unit spec :118-145 (message, stack and own properties).
- Borrowed-client listener added at `transaction.ts:42`, removed at :72 before `release` at :73, same
  function (`ignoreConnectionError`, :9); unit spec :147-165 with `invocationCallOrder`.
- `open-store.ts:66` delegates to `runInTransaction`; the module is not exported by the package index.
- No new dependency: `pg` is already in `packages/adapters/store-postgres/package.json`.

## 2. Requirements missing or partial

| Id | Severity (reviewer) | Finding | Check | Destination |
|---|---|---|---|---|
| V1 | Major | The two terminated-connection tests (`open-store.spec.ts:250-277`, `:279-317`) do not assert the AND clause "the test process recorded no unhandled `error` event" themselves | Confirmed that no handler or assertion is in the tests. The clause is enforced by Vitest, which fails the run on an uncaught exception (design D5, no `dangerouslyIgnoreUnhandledErrors` in `vitest.config.ts`); the raw old-code run in the step 6 addendum shows exactly that failure. Downgraded to Minor | D (design X14) |
| V2 | Minor | Task 2.1 (and design D5) still say the tests assert `projectCount()` back to the baseline | Confirmed; the spec never asks for it (X9 dropped it as a test defect). Text fixed | A (fixed) |
| V3 | Minor | The clean-end `it` uses two stub pools where the scenario says "another" run | Confirmed; every THEN/AND is asserted, harmless | D |
| V4 | Question | Task 3 is `[x]` with no diff under `openspec/specs` | Confirmed; by the run's instruction the tasks are checked with the note "fuera de este cambio", blocked by the hook `protect-specs-and-tests` | C (design X8) |
| V5 | Minor | `.claude/sdd-harness.env` modified in the working tree | The local `KIT_AUTONOMOUS_RUN="1"` switch; never staged | D |

## 3. Unspecified behaviour

| Id | Severity | Finding | Check | Destination |
|---|---|---|---|---|
| V6 | Minor | `export const COMMIT_FAILED_MESSAGE` (`transaction.ts:6`) is exported from the module, imported by nothing | Confirmed (only `dist/` copies). Internal module, not re-exported; an edit of `store-postgres/src` would stale the seed fingerprint again (X11) | D |
| V7 | Minor | Extra unit `it` "The work receives a store bound to the borrowed connection" with loose assertions, mapped to no scenario | Confirmed; added for a Stryker survivor (X10), backs a requirement sentence | D |
| V8 | Minor | Non-spec files in the diff (`prompts.md`, `docs/project-context.md`, reports) | Expected documentation; no behaviour | D |

No logging, retry, wrapping of the `BEGIN` error, extra listener or package export was added.

## Specific checks

- Dependencies not in the manifest: none.
- Authorisation: none required, none performed.
- Extra response fields: not applicable (internal adapter; `OpenedStore.transaction` signature unchanged).
- Weaker-than-scenario assertions: V1 only.
- Test names equal the scenario titles, character for character, for all 11 scenarios.

## Scenario → test → state

Green = passing in the live run of `reports/2026-10-30-show-spec-working.md`.

| Scenario | Test | State |
|---|---|---|
| Work that resolves is committed | `tests/integration/store/open-store.spec.ts:164` | green |
| Work that rejects leaves nothing | `open-store.spec.ts:182` | green |
| Work's writes are invisible to another connection before the commit | `open-store.spec.ts:205` | green |
| Every connection is released after a run | `open-store.spec.ts:229` | green |
| A transaction that ends cleanly returns its connection to the pool | `tests/unit/store/open-store-transaction-errors.spec.ts:43` | green |
| A failed begin destroys the connection | unit spec :81 | green |
| A failed rollback keeps the work's error and destroys the connection | unit spec :99 | green |
| A failed commit rejects with a fixed message whatever its rollback does | unit spec :118 | green |
| A run leaves no error listener on its connection | unit spec :147 | green |
| A connection terminated during rejecting work keeps the work's error | `open-store.spec.ts:250` | green (unhandled-event clause enforced by Vitest, V1) |
| A connection terminated during resolving work fails the commit without driver text | `open-store.spec.ts:279` | green (unhandled-event clause enforced by Vitest, V1) |

## Verdict

Conformant. No Blocker; the reviewer's one Major (V1) is downgraded to Minor after the check, with the
raw evidence in the step 6 addendum. Every finding has a destination in `design.md` → Follow-ups, X14.
