## Context

See `proposal.md` → Why. Current state:

- `openPostgresStore` (`packages/adapters/store-postgres/src/open-store.ts`) builds a `pg.Pool` with
  `pool.on('error', () => undefined)` for idle clients, and a `transaction` closure (lines 66-88):
  `pool.connect()`, `BEGIN`, `work(createPostgresStore({ transaction: client }))`, `COMMIT`, with
  `ROLLBACK` swallowed by `.catch(() => undefined)` on both failure paths, and `client.release()`
  without argument in a `finally`.
- `atomically` in `postgres-store.ts` is the reference: it keeps the rollback error in `broken` and
  calls `client.release(broken)`. In `pg`, `release(err)` with a truthy argument destroys the client
  instead of returning it to the pool.
- `pg-pool` removes its idle `error` listener from a client when it is checked out. A backend
  terminated while the client is checked out and between two queries makes the client emit `error`
  with no listener, which `EventEmitter` turns into an uncaught exception.
- The only caller is `packages/api/src/composition.ts` (lines 153-168), which passes `transaction` as
  `inTransaction` of the reindex use case. Its contract does not change.
- DIS-9 decision E21 (D) rejected a pool seam in `OpenStoreOptions`, because it widened the public
  adapter only for tests.
- `stryker.config.json` does not mutate `packages/adapters/store-postgres` (non-goal of the ticket).

## Goals / Non-Goals

**Goals:**

- Destroy the connection after a failed `BEGIN` or `ROLLBACK`; return it after a clean end; release
  exactly once.
- A red test for each failure path without a database, and the two untested clauses (failed commit,
  failed rollback) also proven against a real Postgres.
- A terminated backend during the work cannot crash the process.

**Non-Goals:**

- `atomically` of `postgres-store.ts` is not changed, and does not get the borrowed-client `error`
  listener (ticket non-goal; destination D, X1).
- No retry of the transaction; DIS-9's deadlock note E33 is not touched.
- The error of a failed `BEGIN` is propagated as is (the requirement does not ask to hide its text; the
  HTTP route already answers a generic `500`).
- `store-postgres` is not added to Stryker's `mutate` list.

## Decisions

### D1. The runner moves to an internal module `transaction.ts` (R1)

`packages/adapters/store-postgres/src/transaction.ts` exports
`runInTransaction<T>(pool: Pool, work: (store: StorePort) => Promise<T>): Promise<T>` and owns
`COMMIT_FAILED_MESSAGE`. `open-store.ts` keeps `transaction = (work) => runInTransaction(pool, work)`.
The package `index.ts` does not export the module; the unit test imports it from `src/transaction`
as the store tests already import from `src`.

*Alternatives:* (a) an optional `pool` factory in `OpenStoreOptions`: rejected by E21, it widens the
public API for tests; (b) `vi.mock('pg')` over `openPostgresStore`: couples the test to how the module
imports `pg` (default import `pg.Pool`) and also mocks the probe connection; (c) integration only, by
terminating the backend: cannot reach a failed `BEGIN` deterministically, nor tell "returned" from
"destroyed" except through session counts. The internal module is the smallest seam that respects E21.

### D2. When the connection is destroyed (R2)

```
connect ─► BEGIN ──fail(B)──────────────────────────► release(B)   reject B   (work not called)
             │ok
             ▼
           work ──reject(E)─► ROLLBACK ─ok──────────► release()    reject E
             │                   └─fail(R)──────────► release(R)   reject E
             │resolve
             ▼
           COMMIT ─ok───────────────────────────────► release()    resolve
             └─fail(C)─► ROLLBACK ─ok───────────────► release()    reject fixed message
                            └─fail(R)───────────────► release(R)   reject fixed message
```

One local `broken: Error | undefined` receives the error of a failed `BEGIN` or `ROLLBACK`; a single
`finally` calls `client.release(broken)`. A failed `COMMIT` alone does not destroy the connection: the
`ROLLBACK` that follows tells whether the session is usable, the same rule as `atomically`. If
`pool.connect()` itself rejects there is no client and its error propagates unchanged (no change).
The value thrown by a failed `BEGIN` or `ROLLBACK` is stored as is and passed to `release` unchanged;
it is not wrapped (X2, dropped in correction round 1 of the spec audit): `pg` rejects `client.query`
only with `Error` instances, and the ticket asks to pass the statement's own error to `release`. A
non-`Error` value is outside the contract and has no scenario.

Unlike `atomically` (`postgres-store.ts:128-136`), the runner sends no `ROLLBACK` after a failed
`BEGIN` (DIS-110 AC2). This divergence is intended; a reviewer must not align it back.

*Alternative:* destroy after any failure, including a failed commit with a successful rollback.
Rejected: it diverges from `atomically` without evidence, and the session is known clean then.

### D3. Borrowed-client `error` listener (R4)

After `pool.connect()` the runner adds a no-op `error` listener to the client and removes it in the
`finally`, before `release`. The next statement on a terminated connection rejects, which feeds D2.
The listener is removed before `release` on every path, so none accumulates on a pooled client
(otherwise `MaxListenersExceededWarning` after 10 runs, and a no-op listener would mask errors of
idle clients); scenario "A run leaves no error listener on its connection".
If the integration test (D5) shows `pg` does not emit the event in this path, the listener is kept as
defence and the observation is added to this decision during the apply.

### D4. Failed-commit error

Unchanged contract: `new Error(COMMIT_FAILED_MESSAGE)`, no `cause`, so neither the commit error nor
the rollback error text can be serialised with it. The first error wins on every path.

### D5. Tests

- **Unit** `tests/unit/store/open-store-transaction-errors.spec.ts` (new): a stub client
  `{ query: vi.fn, release: vi.fn, on: vi.fn, removeListener: vi.fn }` and a stub pool
  `{ connect: async () => client } as unknown as Pool`, template
  `tests/unit/store/postgres-cache-write-errors.spec.ts`. One `it` per new unit scenario of the delta
  (names identical to the scenario titles): clean end, failed begin, failed rollback, failed commit
  (both variants in one `it`), and "A run leaves no error listener on its connection" as its own `it`
  (the same function passed to `client.on('error', …)` and `client.removeListener('error', …)`, the
  removal ordered before `release` in `mock.invocationCallOrder`). These five stub-pool scenarios are
  the only proof of "destroyed rather than returned" (D1(c)).
- **Integration** `tests/integration/store/open-store.spec.ts`: two new `it`s in the block "running
  work in one transaction on a pooled store", named as the two terminated-connection scenarios, with
  the application names `codemind-tx-terminated-reject-test` and `codemind-tx-terminated-commit-test`
  (so the `LIKE 'codemind-tx%'` counts of tasks 0.4 and 6.5 see them). Each
  opens the store with its `applicationName` (`withApplicationName`), creates a project with
  `uniqueName`, and terminates the backend from another connection with
  `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = $1 AND pid <> pg_backend_pid()`
  through `connect()` of `tests/integration/helpers/db.ts`; it then waits until `sessions(name)` is 0
  (poll up to 2 s) so the termination has landed before the work settles. Afterwards: `projectIds`
  is empty, a later `transaction(async () => 'after')` resolves, `close()` < 2 s, `sessionsLeft` is 0,
  `projectCount()` equals the baseline; `deleteProjects` in `finally`. "No unhandled `error` event" is
  enforced by Vitest, which fails the run on an uncaught exception or unhandled rejection (the
  project does not set `dangerouslyIgnoreUnhandledErrors`); the poll keeps the event inside the test.
  `pg-pool` already discards a non-queryable client on release (`node_modules/pg-pool/index.js:392`,
  `!client._queryable || client._ending`), even when it is released without an error, so against the
  code of task 1.2 these integration scenarios can only fail through the uncaught `error` event;
  destroy-versus-return is proven by the stub-pool scenarios. The real-world risk the destruction rule
  closes is a connection that is still queryable after a failed `BEGIN` or `ROLLBACK` (for example a
  statement timeout); this does not change the decision.
- No existing test changes: the four existing scenarios keep their tests and assertions.

### D6. Spec and Purpose edits (R5)

The `graph-store` delta MODIFIES the requirement with the whole block (four existing scenarios kept
verbatim, seven added: five over a stub pool and two against a real Postgres). The Purpose of `openspec/specs/explain/spec.md` is edited directly (a delta
cannot change a Purpose) in a separate commit `docs(DIS-110): …`, to say that explain asks the model
for the answer and then lazily refreshes the due stale prior claims (requirement "Stale claim
refresh"), instead of "asks the model once".

### D7. No ADR

The decision is local to one adapter module, follows an existing rule of the same package
(`atomically`) and is cheap to revert. No ADR (`docs/adr`).

## Risks / Trade-offs

- [The CI or local database user may not be allowed to call `pg_terminate_backend` on the runner's
  sessions] → both run as the same role that owns the sessions (allowed without superuser since
  Postgres 9.6 for one's own role); if the apply finds otherwise, the integration scenarios stop the
  ticket rather than being skipped.
- [Timing: the termination might land after `COMMIT` in the resolving scenario] → the test polls until
  no session with that application name remains before the work settles.
- [A stub pool can drift from `pg`'s real `release(err)` semantics] → the integration scenarios check
  the real pool still serves a later run and closes with no session left.
- [Mutation testing does not cover the adapter in CI] → the apply runs Stryker once locally on
  `transaction.ts` (informational, threshold 80) and records the score; `mutate` is not changed.

## Migration Plan

No migration, no data change, no configuration change. Rollback is a revert of the code commit.

## Follow-ups

*Agent's text: decisions taken by the agent as lead engineer in the autonomous run
(`docs/AUTONOMOUS-RUN.md` §6), without the author; copied from the DIS-110 `[enhanced]` description
(R1–R9) plus the design decisions of this proposal (X1–X3). Destinations: A = this change; B = another
existing ticket; C = the author; D = out of scope, recorded.*

| Id | Decision | Destination |
|---|---|---|
| R1 | The red-test seam is the internal module `transaction.ts` (`runInTransaction(pool, work)`), tested over a stub pool. `OpenStoreOptions` does not change, so E21's objection (widening the adapter only for tests) does not apply (D1). | A |
| R2 | The connection is destroyed if `BEGIN` or `ROLLBACK` fails. A failed `COMMIT` followed by a successful `ROLLBACK` returns it, as `atomically` does (D2). | A |
| R3 | Both failure clauses are also tested against a real Postgres, terminating the backend with `pg_terminate_backend` from another connection, filtered by a unique `application_name` (D5). | A |
| R4 | The runner adds a no-op `error` listener to the borrowed client while it holds it. If the integration test shows `pg` does not emit the event, the listener stays as defence and it is noted in D3. | A |
| R5 | Carry-over A8 of DIS-42 (Purpose of `explain`) is fixed in a separate `docs(DIS-110)` commit while the change is active (D6). | A |
| R6 | No golden round: the change touches neither `export-seed.ts`, `load-seed.ts` nor the seed, so its fingerprint does not change. If the apply proves otherwise, the round is done inside DIS-110 with a blind Opus/Sonnet panel. Superseded by X11: the CI proved otherwise, and the round runs inside DIS-110. | A (since X11) |
| R7 | The ticket's source path (`openspec/changes/index-endpoint/...`) no longer exists; the valid one is `openspec/changes/archive/2026-10-29-index-endpoint/reports/2026-10-29-adversarial-review.md`. | D, recorded |
| R8 | No new tickets: any finding of this change is resolved inside DIS-110 (author's instruction). Non-goals stay as recorded D items. | D, recorded |
| R9 | PowerShell check: planned in `tasks.md` (task 7.4) for the author as destination C; by the author's instruction for this run the agent executes it with `powershell.exe -NoProfile -Command …` (no `$env:` changes; the API is started from Git Bash) and records it in the step 7 report. | C, author (executed by the agent) |
| X1 | `atomically` of `postgres-store.ts` also lacks a borrowed-client `error` listener; not changed here (ticket non-goal). | D, recorded |
| X2 | Dropped in correction round 1 (spec audit B1): a thrown non-`Error` from `BEGIN` or `ROLLBACK` is not wrapped; the thrown value goes to `release` unchanged. `pg` rejects only with `Error` instances and the ticket asks for the statement's own error, so the wrapper widened scope without need (D2). | D, recorded |
| X3 | Stryker runs once locally on `transaction.ts` (informational); `stryker.config.json` is not changed. | A |

*Agent's text: decisions of correction round 1 of the spec audit
(`reports/2026-10-30-spec-audit.md`, run 1), taken by the agent as lead engineer without the author.*

| Id | Decision | Destination |
|---|---|---|
| X4 | Q1 of the audit: the carry-over A8 of DIS-42 (`## Purpose` of `explain`) stays bundled in DIS-110 as a separate `docs(DIS-110)` commit. It is the author's instruction for this ticket in the autonomous run (also recorded as R5 and AC6 of the `[enhanced]` block), and a separate ticket is forbidden by R8. | A |
| X5 | Q2 of the audit: task 7.4 keeps the agent running the PowerShell check with `powershell.exe`. The source is the author's instruction for DIS-110 in the notes of this autonomous run ("Comprobaciones PowerShell las ejecuta el agente con powershell.exe"), now also quoted in a Linear comment of DIS-110 so it is traceable; it is a recorded deviation from `docs/openspec-tasks-mandatory-steps.md` §3. The destination stays C: the author may repeat the check. | C, author (executed by the agent) |
| X6 | B2 of the audit: the requirement gains the clause that the run removes its `error` listener before releasing, with the scenario "A run leaves no error listener on its connection", tested as its own `it` (D3, D5). | A |
| X7 | Task ordering (audit point 9): the two integration `it`s are written and run right after task 1.2, against the code that still releases without argument and has no listener, and the result is recorded; they are run again on the final code in step 2. No `git worktree` is used. | A |

*Agent's text: decisions taken during the apply (step 6 report).*

| Id | Decision | Destination |
|---|---|---|
| X8 | Task 3 (the `## Purpose` of `explain`) could not be done: the hook `protect-specs-and-tests` denied the edit of a main spec outside a sync of an approved delta ("the main spec explain is only synced from an approved delta of the active change"). A delta cannot change a Purpose and the denial is not worked around, so the edit is moved out of this change: tasks 3.1 and 3.2 are checked with the note "fuera de este cambio: bloqueado por el hook protect-specs-and-tests; destino C, la autora", and the PR carries no `docs(DIS-110)` commit for it. This supersedes the destination A of R5 and X4 for the Purpose edit. | C, author (blocked by the hook `protect-specs-and-tests`) |
| X9 | The two new integration `it`s dropped the global `projectCount()` baseline: another test file running in parallel creates projects and made the count flaky (the same flake hit the existing "Every connection is released after a run" once). `projectIds(name)` empty remains the assertion. The existing `it` is not edited. | A (new `it`s), D (existing `it`) |
| X10 | A unit `it` "The work receives a store bound to the borrowed connection" was added after Stryker showed one survivor; `transaction.ts` is at 100 %. | A |

*Agent's text: decisions taken after the PR's CI (the `verify` job failed with `FINGERPRINT_MISMATCH` `{reason:"seed"}` on run 40983358304).*

| Id | Decision | Destination |
|---|---|---|
| X11 | R6's premise was wrong: the analyzer fingerprint hashes the whole directory `packages/adapters/store-postgres/src` (`packages/cli/src/seed/fingerprint.ts`, `ANALYZER_DIRECTORIES`), not only `export-seed.ts` and `load-seed.ts`, so the new `transaction.ts` and the edit of `open-store.ts` change it. As R6 provides, the change runs the golden round inside DIS-110 (tasks groups 12–12d): `seed:build`, `cache:build` of both projects with the local Ollama `qwen2.5-coder`, and a blind Opus/Sonnet panel round with the suffix `-dis-110`, mirroring DIS-42 r3 (a `golden-answers` delta retargets the round-specific requirements, and `tests/unit/seed/golden-reviews.spec.ts` is retargeted). Moving the runner outside the fingerprinted directory to avoid the round was rejected: it would place adapter code outside its adapter only to dodge the fingerprint policy (ADR `20261017-stale-fingerprint-fails-verify`). | A |
| X12 | The DIS-110 round is a single round: no further round follows it, whatever the verdicts. An item judged `incorrect` stays unsigned (`reviews: []`), is listed in the report's `## Pending` as `- <project> <id>: DIS-110` and is recorded here as a known unsigned golden answer for the author (destination C). No Linear ticket is created (R8; destination B is forbidden in this run). | A (round), C (any `incorrect` item) |
| X13 | The round's criterion is fixed before the regeneration: the report with `## Criterion` is committed before `seed:build` and `cache:build` run, so the DIS-42 r3 ordering (report → regeneration → input) holds without the DIS-9 E31 relaxation. | A |
