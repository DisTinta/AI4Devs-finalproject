CHANGES REQUIRED

# Spec audit: pool-transaction-release (DIS-110)

- Date: 2026-10-30
- Change: `openspec/changes/pool-transaction-release/` (proposal.md, design.md, specs/graph-store/spec.md, tasks.md)
- Ticket: DIS-110, loaded from Linear with its two comments. **DIS-110 has no parent** (`parentId: null`). Point 1 is judged against the `[original]` block, and point 2 against the ticket's own acceptance criteria (the `[enhanced]` block).
- Project sources read: `docs/base-standards.md`, `docs/openspec-tasks-mandatory-steps.md`, `docs/project-context.md` (testing list around lines 474-502, API runner around lines 1350-1353), `openspec/specs/graph-store/spec.md` (requirement at line 1194), `openspec/specs/explain/spec.md` (Purpose), `docs/AUTONOMOUS-RUN.md` (merge override).
- Code read: `packages/adapters/store-postgres/src/open-store.ts`, `packages/adapters/store-postgres/src/postgres-store.ts` (`atomically`), `packages/api/src/composition.ts`, `tests/integration/store/open-store.spec.ts`, `tests/unit/store/postgres-cache-write-errors.spec.ts`, `tests/integration/helpers/db.ts`, `node_modules/pg-pool/index.js`.

## Questions for the author

- **Q1 (scope, R5).** The `[original]` block does not mention the `## Purpose` of `openspec/specs/explain/spec.md` (carry-over A8 of DIS-42). The `[enhanced]` block adds it. It is unrelated to the pool runner. Do you confirm it stays bundled in DIS-110, as a separate `docs(DIS-110)` commit?
- **Q2 (procedure, R9).** `docs/openspec-tasks-mandatory-steps.md` §3 ("Manual Interface Testing", last paragraph) says a PowerShell check in an autonomous run is a destination C follow-up for the author, and the agent executes only the Git Bash half. Task 7.4 has the agent run `powershell.exe` itself, "by the author's instruction". That instruction is not in the ticket or its comments. Please confirm it, so the deviation is recorded rather than assumed.

## 1. Scope against the ticket — improvable

The `[original]` block asks for three things:
1. Pass the error of a failed `BEGIN` or `ROLLBACK` to `client.release(error)`.
2. Do it with TDD, through a pool seam or by terminating the backend.
3. Test the two untested clauses: a failed commit leaks no driver text, and a failed rollback does not hide the work's error.

Items beyond that, listed so the human can keep or cut them:
- **R4, borrowed-client `error` listener** (proposal "What Changes" bullet 2, design D3, tasks 1.9, spec sentence "While the run holds the connection, an `error` event … SHALL NOT crash the process"). It follows indirectly from the `[original]` choice to terminate the backend in a test, because without the listener the test process would crash. It is still new behaviour. Keeping it is reasonable.
- **R5, the `explain` Purpose edit** (proposal bullet 5, design D6, tasks 3.1-3.2). Not derived from the `[original]` block; see Q1.
- **X2, wrapping a thrown non-`Error`** (design D2 last paragraph, Follow-ups X2, task 1.8). Not in the ticket at all; it was added at propose time. See blocking finding B1.
- **X3, a local Stryker run** (design Risks, task 6.4). Informational only and does not change `stryker.config.json`. Acceptable.
- **Task 7.3, terminating the API's idle pooled backends.** This exercises `pool.on('error')` (open-store.ts:59), which does not change, not the runner. Harmless as a regression check, but it is not evidence for this change (see point 8).

## 2. Inherited acceptance criteria — clean (no parent)

There is no parent story. Each acceptance criterion of DIS-110 against the delta:
- AC1 → "A transaction that ends cleanly returns its connection to the pool"
- AC2 → "A failed begin destroys the connection"
- AC3 → "A failed rollback keeps the work's error and destroys the connection"
- AC4 (variants a and b) → "A failed commit rejects with a fixed message whatever its rollback does"
- AC5 (a and b) → the two "A connection terminated during …" scenarios
- AC6 (`explain` Purpose) → no requirement, which is correct: a delta cannot change a Purpose. Covered by tasks 3.1-3.2, and its THEN can be checked by reading. Not a hole.

## 3. Missing scenarios

- **B1 (blocking, shared with points 5, 6 and 11).** Design D2 and X2 add a behaviour: "A thrown non-`Error` value from `BEGIN` or `ROLLBACK` is wrapped so `release` always receives a truthy value". The requirement has no clause for it and the delta has no scenario. Task 1.8 tests it only as "an assertion added to 1.3 for a thrown string", inside an `it` whose scenario says the connection is released "with `B`".
- **B2 (blocking, shared with point 5).** Design D3 and task 1.9 say the runner removes its own `error` listener before `release`. The requirement says nothing about it. Without the removal, every run leaves one listener on a pooled client: the leak shows up as `MaxListenersExceededWarning` after 10 runs, and a no-op listener would mask errors on idle clients. No scenario pins it, and task 1.9 does not say whether this is a new `it` or what it is called.
- **Improvable.** The requirement says "The connection SHALL be released exactly once in every case". When `pool.connect()` rejects there is no connection; design D2 covers this ("its error propagates unchanged") but the spec does not. Reword to "Once a connection has been taken, it SHALL be released exactly once". No new scenario is needed, because the behaviour is unchanged.

## 4. Ambiguity — clean for the listed words; one improvable

A case-insensitive search for fast, easy, secure, efficient, many, appropriate, robust, quickly and safe found no occurrences anywhere in the change.

- **Improvable.** The scenario "A connection terminated during resolving work fails the commit without driver text" says "holding neither `terminat` nor the driver's text". "The driver's text" cannot be measured in the integration case, because the real driver message is not fixed. The message is already pinned by exact equality, so state what the test actually checks: "with no `cause`, and whose message and stack hold neither `terminat`, `57P01` nor `administrator command`". Mirror this in task 2.2.

## 5. Open decisions

- **B1 (blocking).** For a non-`Error` thrown by `BEGIN` or `ROLLBACK`, the implementer would have to decide alone:
  - (a) what the wrapper is (class, `message`, whether it carries the original value);
  - (b) whether the run **rejects** with the original thrown value or with the wrapper when `BEGIN` throws a non-`Error`;
  - (c) whether a non-`Error` from the `ROLLBACK` after a work error changes anything other than the `release` argument.

  Fix it in the requirement and in a new scenario. Proposed: the run rejects with the original value unchanged, and `release` receives `new Error('the connection is in an unknown state')` with no `cause`. If the author prefers to drop X2, remove it from design D2, from Follow-ups and from task 1.8 instead.
- **B2 (blocking).** The name and shape of the listener test (task 1.9: "in the same spec … on the clean path and on the failed-begin path") are open. Fix them with a requirement clause and a named scenario (text in the Corrections section) that task 1.9 implements as its own `it`.
- **Improvable.** The `applicationName` of the two new integration `it`s is not fixed. Task 0.4 and task 6.5 count sessions with `LIKE 'codemind-tx%'`, so pin `codemind-tx-terminated-reject-test` and `codemind-tx-terminated-commit-test` in design D5 and tasks 2.1/2.2.

## 6. Contradictions inside the change

- **B1 (blocking).** The delta requirement says a connection whose `BEGIN` or `ROLLBACK` failed "is released with the error of that failed statement". Design D2 and X2 say a non-`Error` is replaced by a wrapper before `release`. Both cannot hold. Resolve it as in point 5.
- Everything else is consistent across the proposal, the design and the spec: the destruction rule (R2), the fixed commit message with no `cause` (D4), "first error wins", the module seam (D1), and "no existing test is changed" (proposal Impact versus tasks 2.4 and 5.1: the only existing test file gains two `it`s, and none of its existing ones are edited).

## 7. Contradictions with the project — clean

- `openspec/specs/graph-store/spec.md` line 1194: the delta MODIFIES the same requirement with its full block, and the four existing scenarios are copied verbatim. The old clause "released to the pool in every case" is replaced, not duplicated.
- `docs/project-context.md` line 1352 says the runner lives in `open-store.ts`, and line 499 lists only `store/open-store.spec.ts`. Task 9.1 updates both, which is correct.
- Tests already import non-index modules of the adapter (`src/queries` in `tests/integration/store/graph-read.spec.ts:18`, `src/migrate` in `tests/integration/store/migrations.spec.ts:15`), so importing `src/transaction` follows precedent.
- Task 11.7 (agent merge) departs from `docs/base-standards.md` §3 rule 9 and from `docs/openspec-tasks-mandatory-steps.md` §3. The override is documented in `docs/AUTONOMOUS-RUN.md` (lines 133 and 135) and is gated on `KIT_AUTONOMOUS_RUN="1"`, so it is not a contradiction.
- No ADR is needed (D7). This agrees with the ADR criterion in the mandatory-steps example (§7, item 10.2).

## 8. Contrast with the real code

- **Confirmed.** `open-store.ts:66-88` matches design Context, and the `finally` calls `client.release()` with no argument (line 86). `postgres-store.ts:126-139` (`atomically`) keeps the rollback error in `broken` and calls `client.release(broken)`, and a failed `COMMIT` followed by a successful `ROLLBACK` releases without error. R2 copies that rule faithfully. `composition.ts:154,168` is the only consumer, and its contract does not change. `pg-pool` removes its idle `error` listener on checkout (`node_modules/pg-pool/index.js:344`) and adds it back on release (line 385), so the premise of D3 holds.
- **Intended divergence (improvable, record it).** `atomically` sends `ROLLBACK` after a failed `BEGIN` (its `catch` covers `BEGIN`, lines 128-136). The new runner does not, per AC2. Say this in design D2 so a reviewer does not "align" it back.
- **Improvable.** `node_modules/pg-pool/index.js:392` already discards a client on release when `!client._queryable || client._ending`, even when it is released without an error. A backend terminated by `pg_terminate_backend` makes the client non-queryable, so the old code already discards it in the two integration scenarios. Against the 1.2 code, those scenarios can only go red through the uncaught `error` event, not through "a broken pooled connection" (task 2.1). Record this expectation in design D5 and task 2.1. The "destroyed rather than returned" rule is proven only by the stub-pool scenarios, which is coherent with D1(c) but should be stated. It also weakens the Why: the risk is real only for a connection that is still queryable after a failed `BEGIN` or `ROLLBACK` (for example a statement timeout). That does not change the decision.
- No duplicated abstraction: the runner already existed (DIS-9). It moves to its own module, and `atomically` keeps its retry and error-mapping semantics.

## 9. Task size — clean; one improvable ordering

Every task fits in one agent turn. Task 6.4 (Stryker over one file) and task 11.6 (fix loop) are the longest, and both are bounded.

- **Improvable.** Task 2.1 asks to run the integration test "first against the code of 1.2", but step 2 runs after step 1 has replaced that code. Either move the writing of 2.1 and 2.2 to right after 1.2 (before 1.3), or say how to reach the 1.2 code: commit at 1.2 and run the test in a `git worktree` of that commit.

## 10. Mandatory steps — clean

- Step 0 comes first, is labelled, and the branch name follows `feature/` plus the ticket and a slug.
- Steps 5, 6, 7, 8, 9 and 11 are present and labelled MANDATORY. Steps 7, 8 and 11 carry AGENT MUST EXECUTE.
- The report paths and naming are given (6.6, 7.6, 11.3-11.5).
- Restoration: integration tests delete in `finally` and check the project count; 6.5 checks the post-test state and `.stryker-tmp/`; 7.5 deletes `dis-110-manual` and the scratchpad copy; and every step that starts a service ends with `node scripts/dev-processes.mjs stop`.
- Pre-merge Review is last, with the three checks in order and the archive before the merge.
- Every scenario maps to a task (5.2).
- Only open item: Q2 on 7.4.

## 11. Traceability

| Requirement clause / item | Scenario | Task(s) |
|---|---|---|
| Commit on resolve | Work that resolves is committed | existing test kept (2.4, 5.1, 5.2) |
| Rollback on reject, nothing remains | Work that rejects leaves nothing | existing test kept (2.4, 5.1, 5.2) |
| No write visible before commit | Work's writes are invisible to another connection before the commit | existing test kept (2.4, 5.1, 5.2) |
| Every connection released, close clean | Every connection is released after a run | existing test kept (2.4, 5.1, 5.2) |
| Clean end returns connection, released once | A transaction that ends cleanly returns its connection to the pool | 1.1, 1.2 |
| Failed `BEGIN` destroys, no work, no COMMIT/ROLLBACK | A failed begin destroys the connection | 1.3, 1.4 |
| Failed rollback keeps work's error, destroys | A failed rollback keeps the work's error and destroys the connection | 1.5, 1.6 |
| Failed commit fixed message, no cause, release per rollback outcome | A failed commit rejects with a fixed message whatever its rollback does | 1.7, 1.8 |
| `error` event does not crash; terminated connection, rejecting work | A connection terminated during rejecting work keeps the work's error | 1.9, 2.1, 2.3 |
| Terminated connection, resolving work; none remain after failed commit | A connection terminated during resolving work fails the commit without driver text | 1.9, 2.2, 2.3 |
| Non-`Error` from `BEGIN`/`ROLLBACK` is wrapped (design D2, X2) | **(none) — HOLE, blocking B1** | 1.8 (assertion folded into 1.3) |
| Listener removed before release (design D3) | **(none) — HOLE, blocking B2** | 1.9 |
| AC6 `explain` Purpose (no requirement, by design) | n/a: a delta cannot change a Purpose | 3.1, 3.2 |

## Corrections to apply

### `openspec/changes/pool-transaction-release/specs/graph-store/spec.md`

1. In the requirement paragraph, replace "The connection SHALL be released exactly once in every case." with:
   "Once a connection has been taken from the pool, it SHALL be released exactly once."
2. (B1) After "…so the pool discards it.", add, if X2 is kept:
   "When the failed statement threw a value that is not an `Error`, the connection SHALL be released with an `Error` whose message is exactly `the connection is in an unknown state` and that has no cause, and the run SHALL still reject with the thrown value itself when it came from `BEGIN`."
   Then add the scenario:
   ```
   #### Scenario: A failed begin that throws a non-error value still destroys the connection

   - **GIVEN** a pool whose connection fails `BEGIN` by throwing the string `begin failed`
   - **WHEN** any work runs in one transaction
   - **THEN** the run rejects with the string `begin failed` itself, and the work is never called
   - **AND** the connection is released exactly once, with an `Error` whose message is exactly
     `the connection is in an unknown state`, so the pool destroys it
   ```
   If the author drops X2, skip this correction and apply the X2 removal in design.md and tasks.md instead.
3. (B2) After "…the next statement reports the failure.", add:
   "The run SHALL remove the `error` listener it added before releasing the connection, so no listener of the run remains on a pooled connection."
   Then add the scenario:
   ```
   #### Scenario: A run leaves no error listener on its connection

   - **GIVEN** a pool whose connection answers every statement successfully, and a second pool whose connection fails `BEGIN` with an error `B`
   - **WHEN** work that resolves runs in one transaction on the first, and any work runs on the second
   - **THEN** on each connection the `error` listener the run added is the same function it removed, and it was removed before the connection was released
   ```
4. In "A connection terminated during resolving work fails the commit without driver text", replace "holding neither `terminat` nor the driver's text" with:
   "that has no cause, and whose message and stack hold neither `terminat`, `57P01` nor `administrator command`".

### `openspec/changes/pool-transaction-release/design.md`

1. D2: add at the end: "Unlike `atomically` (`postgres-store.ts:128-136`), the runner sends no `ROLLBACK` after a failed `BEGIN` (DIS-110 AC2)." Replace the X2 sentence with the exact wrapper contract of spec correction 2 (message `the connection is in an unknown state`, no cause; the run rejects with the original value) or remove it if X2 is dropped.
2. D3: add "The listener is removed before `release` on every path, so none accumulates on a pooled client (scenario 'A run leaves no error listener on its connection')."
3. D5: pin the integration application names `codemind-tx-terminated-reject-test` and `codemind-tx-terminated-commit-test`. Add: "`pg-pool` already discards a non-queryable client on release (`node_modules/pg-pool/index.js:392`), so against the 1.2 code the integration scenarios can only fail through the uncaught `error` event; destroy-versus-return is proven by the stub-pool scenarios." Change "named as the two terminated-connection scenarios" so that it includes the unit scenario of B2 in the unit bullet as its own `it`.
4. Follow-ups: update X2 to the decided contract (or mark it dropped).

### `openspec/changes/pool-transaction-release/tasks.md`

1. 1.8: split it. Make "1.8a RED: `it` 'A failed begin that throws a non-error value still destroys the connection'" and "1.8b GREEN: wrap (design D2, X2)". Remove "with an assertion added to 1.3 for a thrown string" (an earlier test is not modified during GREEN).
2. 1.9: "RED then GREEN: `it` 'A run leaves no error listener on its connection' (scenario of the delta; same function passed to `client.on('error', …)` and `client.removeListener('error', …)`, removal ordered before `release` in `mock.invocationCallOrder`)".
3. 2.1/2.2: either move them right after 1.2, or add "commit at 1.2 and run 2.1/2.2 against that commit in a `git worktree`". Pin the two `applicationName`s. Note that the expected red is the uncaught `error` event only (design D5). In 2.2, use the assertion wording of spec correction 4.
4. 5.2: the stub-pool scenarios become six (clean end, failed begin, non-error begin if kept, failed rollback, failed commit, no listener left).
5. 7.3: add "(this exercises the idle-client handler `pool.on('error')`, unchanged; it is a regression check, not evidence of the runner change)".

### `openspec/changes/pool-transaction-release/proposal.md`

1. "What Changes", bullet 1: add "a non-`Error` thrown by `BEGIN` or `ROLLBACK` still destroys the connection (X2)" (or nothing, if X2 is dropped). Bullet 2: add "and removes that listener before releasing the connection".

### Linear DIS-110 (comment in Spanish; the `[original]` block is not edited)

> *Texto del agente (auditoría de la spec, 2026-10-30).* La auditoría de `pool-transaction-release` devuelve CHANGES REQUIRED con dos hallazgos bloqueantes que se resuelven dentro del cambio:
> (B1) el envoltorio de un valor que no es `Error` lanzado por `BEGIN` o `ROLLBACK` (X2) no tenía requisito ni escenario y contradecía la frase «se libera con el error de esa sentencia». Se fija su contrato: la conexión se libera con un `Error` de mensaje exacto `the connection is in an unknown state`, sin `cause`, y la ejecución rechaza con el valor original. También se añade el escenario «A failed begin that throws a non-error value still destroys the connection».
> (B2) se añade al requisito que el listener `error` del ejecutor se retira antes del `release`, con el escenario «A run leaves no error listener on its connection».
> Preguntas para la autora: (Q1) confirmar que el arrastre A8 de DIS-42 (`## Purpose` de `explain`) se queda en DIS-110; (Q2) confirmar la instrucción de que el agente ejecute él mismo la comprobación PowerShell (R9), que se aparta de `docs/openspec-tasks-mandatory-steps.md` §3.

In the `[enhanced]` block, AC2: add the non-`Error` case with the same contract as spec correction 2 (or note that X2 is dropped).

## Resolution of run 1

*Agent's text: correction round 1 of the autonomous run (`docs/AUTONOMOUS-RUN.md` §6), 2026-10-30, without the author. Each decision is recorded in `design.md` → Follow-ups (X2, X4-X7) with its destination.*

| Finding | Resolution | Where |
|---|---|---|
| Q1, `explain` Purpose bundled in DIS-110 | Decided by the agent: kept in DIS-110 as a separate `docs(DIS-110)` commit. It is the author's per-ticket instruction for this run, matches R5/AC6, and R8 forbids a new ticket. | design Follow-ups X4 (A) |
| Q2, agent runs the PowerShell check | Decided by the agent: task 7.4 stays executed by the agent. The source is the author's instruction for DIS-110 in this run's notes, now quoted in a DIS-110 Linear comment; recorded as a deviation from `docs/openspec-tasks-mandatory-steps.md` §3; destination stays C. | design Follow-ups X5 (C); tasks 7.4 |
| B1, non-`Error` wrapper (points 3, 5, 6, 11) | Decided by the agent and fixed: X2 is dropped, the option that widens scope least. The thrown value goes to `release` unchanged; `pg` rejects only with `Error` instances and the ticket asks for the statement's own error. The spec sentence "released with the error of that failed statement" now holds without exception, so the contradiction is gone and no scenario is needed. Spec correction 2 was not applied, by design. | design D2, Follow-ups X2 (D, recorded); tasks 1.5 (old 1.8 wrapper removed); proposal What Changes |
| B2, listener removal (points 3, 5, 11) | Fixed: requirement clause "The run SHALL remove the `error` listener it added before releasing the connection…" and scenario "A run leaves no error listener on its connection"; task 1.10 is its own RED `it` (same function to `on` and `removeListener`, removal before `release` by `mock.invocationCallOrder`), 1.11 its GREEN. | spec; design D3, D5, X6; tasks 1.10, 1.11; proposal |
| Point 3, "released exactly once in every case" | Fixed: "Once a connection has been taken from the pool, it SHALL be released exactly once." | spec |
| Point 4, unmeasurable "the driver's text" | Fixed: "that has no cause, and whose message and stack hold neither `terminat`, `57P01` nor `administrator command`"; mirrored in task 2.2. | spec; tasks 2.2 |
| Point 5, integration application names | Fixed: `codemind-tx-terminated-reject-test` and `codemind-tx-terminated-commit-test` pinned. | design D5; tasks 2.1, 2.2 |
| Point 8, intended divergence from `atomically` | Fixed: D2 states the runner sends no `ROLLBACK` after a failed `BEGIN` (AC2), unlike `postgres-store.ts:128-136`. | design D2 |
| Point 8, `pg-pool` discards non-queryable clients | Fixed: D5 records that against the old code the integration scenarios can only go red through the uncaught `error` event, that destroy-versus-return is proven by the stub-pool scenarios, and that the real risk is a still-queryable connection; the decision is unchanged. | design D5; tasks 1.3 |
| Point 9, 2.1 run "against the code of 1.2" unreachable | Fixed by reordering, not by a worktree: new task 1.3 writes the two integration `it`s right after 1.2 and runs them on the old code; step 2 re-runs them on the final code. Later tasks of step 1 renumbered. | design X7; tasks 1.3, 2.1, 2.2, 6.6 |
| Point 1, task 7.3 not evidence of the change | Fixed: 7.3 now says it exercises the unchanged `pool.on('error')` and is a regression check only. | tasks 7.3 |
| Point 1, R4 listener and X3 Stryker | Kept, as the audit judged them reasonable; no change. | — |
| Point 11 / tasks correction 4, scenario count | Fixed: five stub-pool scenarios (clean end, failed begin, failed rollback, failed commit, no listener left); D6 says seven scenarios added. | tasks 5.2, step 1 title; design D6 |
| Linear, `[enhanced]` AC2 | Not edited: X2 is dropped, so AC2 needs no non-`Error` case; the drop is noted in the round's Linear comment. | Linear DIS-110 comment |

`openspec validate pool-transaction-release --strict` passes after these edits.
