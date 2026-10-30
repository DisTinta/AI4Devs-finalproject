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
A thrown non-`Error` value from `BEGIN` or `ROLLBACK` is wrapped so `release` always receives a truthy
value (`pg` treats a falsy argument as "return to the pool").

*Alternative:* destroy after any failure, including a failed commit with a successful rollback.
Rejected: it diverges from `atomically` without evidence, and the session is known clean then.

### D3. Borrowed-client `error` listener (R4)

After `pool.connect()` the runner adds a no-op `error` listener to the client and removes it in the
`finally`, before `release`. The next statement on a terminated connection rejects, which feeds D2.
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
  (both variants in one `it`). It also asserts that the `error` listener added is the one removed.
- **Integration** `tests/integration/store/open-store.spec.ts`: two new `it`s in the block "running
  work in one transaction on a pooled store", named as the two terminated-connection scenarios. Each
  opens the store with a unique `applicationName` (`withApplicationName`), creates a project with
  `uniqueName`, and terminates the backend from another connection with
  `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = $1 AND pid <> pg_backend_pid()`
  through `connect()` of `tests/integration/helpers/db.ts`; it then waits until `sessions(name)` is 0
  (poll up to 2 s) so the termination has landed before the work settles. Afterwards: `projectIds`
  is empty, a later `transaction(async () => 'after')` resolves, `close()` < 2 s, `sessionsLeft` is 0,
  `projectCount()` equals the baseline; `deleteProjects` in `finally`. "No unhandled `error` event" is
  enforced by Vitest, which fails the run on an uncaught exception or unhandled rejection (the
  project does not set `dangerouslyIgnoreUnhandledErrors`); the poll keeps the event inside the test.
- No existing test changes: the four existing scenarios keep their tests and assertions.

### D6. Spec and Purpose edits (R5)

The `graph-store` delta MODIFIES the requirement with the whole block (four existing scenarios kept
verbatim, six added). The Purpose of `openspec/specs/explain/spec.md` is edited directly (a delta
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
| R6 | No golden round: the change touches neither `export-seed.ts`, `load-seed.ts` nor the seed, so its fingerprint does not change. If the apply proves otherwise, the round is done inside DIS-110 with a blind Opus/Sonnet panel. | D, recorded |
| R7 | The ticket's source path (`openspec/changes/index-endpoint/...`) no longer exists; the valid one is `openspec/changes/archive/2026-10-29-index-endpoint/reports/2026-10-29-adversarial-review.md`. | D, recorded |
| R8 | No new tickets: any finding of this change is resolved inside DIS-110 (author's instruction). Non-goals stay as recorded D items. | D, recorded |
| R9 | PowerShell check: planned in `tasks.md` (task 7.4) for the author as destination C; by the author's instruction for this run the agent executes it with `powershell.exe -NoProfile -Command …` (no `$env:` changes; the API is started from Git Bash) and records it in the step 7 report. | C, author (executed by the agent) |
| X1 | `atomically` of `postgres-store.ts` also lacks a borrowed-client `error` listener; not changed here (ticket non-goal). | D, recorded |
| X2 | A thrown non-`Error` from `BEGIN` or `ROLLBACK` is wrapped so `release` always destroys (D2). | A |
| X3 | Stryker runs once locally on `transaction.ts` (informational); `stryker.config.json` is not changed. | A |
