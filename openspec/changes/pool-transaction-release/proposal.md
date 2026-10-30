## Why

The transaction runner that DIS-9 added to the pooled store (`transaction` of `OpenedStore`, in
`packages/adapters/store-postgres/src/open-store.ts`) always calls `client.release()` without an
argument, also after a failed `BEGIN`, `ROLLBACK` or `COMMIT`. A connection whose transaction state is
unknown (a lost backend, a transaction still open) can therefore go back to the pool, and the next
reindex of `POST /api/projects/{projectId}/index` may inherit it. The store already follows the opposite
rule in `atomically` (`postgres-store.ts`, `client.release(broken)`): such a connection is destroyed.
Two clauses of the `graph-store` requirement "Running work in one transaction on a pooled store" (a
failed commit does not leak the driver's text; a failed rollback does not hide the work's error) have
no test either.

This is DIS-110, a successor of findings 1 and 2 of the DIS-9 adversarial review
(`openspec/changes/archive/2026-10-29-index-endpoint/reports/2026-10-29-adversarial-review.md`; the
ticket's path `openspec/changes/index-endpoint/...` no longer exists because that change is archived,
decision R7). *(Agent's text: the decisions R1–R9 of the ticket's `[enhanced]` description were taken
by the agent as lead engineer in the autonomous run, `docs/AUTONOMOUS-RUN.md` §6, without the author;
they are copied to `design.md` → Follow-ups with their A/B/C/D destination.)*

## What Changes

- The pooled store's transaction runner **destroys** the connection (releases it with the error) when
  its `BEGIN` or its `ROLLBACK` fails, instead of returning it to the pool. A `COMMIT` that fails and
  whose `ROLLBACK` then succeeds returns the connection, as `atomically` does (R2).
- While the runner holds a connection it listens for that connection's `error` event, so a backend
  terminated between two queries cannot crash the process; the next query reports the failure (R4).
- The runner moves to an internal module of the adapter (`transaction.ts`, not exported from the
  package index), which takes the pool as an argument; this is the seam the red test needs.
  `OpenStoreOptions`, `OpenedStore` and the package's public API do not change, so decision E21 of
  DIS-9 (no test seam in `OpenStoreOptions`) still holds (R1).
- New tests: a unit test over a stub pool for the commit, rollback, failed `BEGIN`, failed rollback
  and failed commit paths, and two integration scenarios against a real Postgres that terminate the
  runner's backend from another connection during the work (R3).
- Carry-over A8 of DIS-42 (stale-claims-refresh): the `## Purpose` header of
  `openspec/specs/explain/spec.md`, which still says the model is asked once, is corrected in a
  separate `docs(DIS-110)` commit while this change is active (R5).

No breaking change: callers (`packages/api/src/composition.ts`) see the same function and the same
resolutions and rejections.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `graph-store`: requirement "Running work in one transaction on a pooled store" gains the rule that
  a connection whose `BEGIN` or `ROLLBACK` failed is destroyed instead of being returned to the pool,
  and scenarios for a failed `BEGIN`, a failed rollback, a failed commit and a connection terminated
  during the work.

The Purpose header of `explain` is edited directly in the main spec (a delta cannot change a Purpose),
with no requirement change.

## Impact

- Code: `packages/adapters/store-postgres/src/open-store.ts` (delegates to the new module, TSDoc of
  `OpenedStore.transaction`), new `packages/adapters/store-postgres/src/transaction.ts`. No port,
  domain, Zod schema, route, migration or dependency changes.
- Tests: new `tests/unit/store/open-store-transaction-errors.spec.ts`; two new `it`s in the existing
  `tests/integration/store/open-store.spec.ts` (block "running work in one transaction on a pooled
  store"); no existing test is changed.
- Specs: delta of `graph-store`; direct edit of the Purpose of `openspec/specs/explain/spec.md`.
- Seed and golden answers: untouched; the seed fingerprint does not change, so no golden review round
  (R6).
- Security and privacy: no personal data. The failed-commit error keeps carrying no driver text, host,
  port or credentials; the new tests assert it. Logging and observability unchanged.
- Commands and gates as in `docs/project-context.md` and `.claude/sdd-harness.env`.
