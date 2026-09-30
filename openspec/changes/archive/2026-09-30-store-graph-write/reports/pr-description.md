## What changes?

`StorePort` gains its write contract, `createProject` and `saveGraph`. Core validates the graph and
defines the domain errors, and the Postgres adapter writes the L1 graph as a full snapshot in one
transaction (or a `SAVEPOINT` inside a caller-owned transaction), keeping file ids across reindexes
and marking `stale` the claims whose cited file leaves the snapshot. A separate commit adds the
process rule for tracking deferred review findings (`docs/project-context.md`, `adversarial-review`
skill 1.1.0).

## Why?

<!-- filled in by the human: the business rationale is not yours to generate -->

## How to test it?

1. `docker compose up -d` and wait until Postgres is healthy.
2. `export DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind`
3. `npm run db:migrate` (migrations `0001`–`0003`; this PR adds none).
4. `npx vitest run tests/unit/knowledge tests/integration/store` → 8 files, 117 tests passed.
5. `npx vitest run` → 10 files, 141 tests passed.
6. `npm run typecheck`, `npm run lint`, `npm run lint:architecture`, `npm run docs:coverage` → exit 0
   (lint: 3 pre-existing warnings on the empty ports; architecture: 8 pre-existing warnings).
7. `npx stryker run` → mutation score above `MIN_MUTATION_SCORE=70` for `packages/core/src/knowledge/`.
8. Check the shared database is back to its baseline: every table of `project`, `file`, `symbol`,
   `edge`, `commit`, `file_commit`, `claim`, `evidence` has the same row count as before step 4.

## Decisions / trade-offs

- **Full snapshot, not a partial write** (`design.md` D4). Files are upserted by
  `(project_id, path)` and keep their ids, so `file_commit`, `evidence` and the stale trigger
  survive a reindex; files absent from the snapshot are deleted. Delete-and-reinsert was rejected
  because it loses history and evidence by cascade and skips the trigger. The orchestrator (DIS-85)
  must always send the whole graph (hand-off comment on DIS-85).
- **Stale marking of deleted files in the adapter** (D4 step 5), right before the delete, because
  the trigger fires only on `UPDATE`. A `BEFORE DELETE` trigger on `file` was rejected for now: it
  needs a migration; it may be proposed separately.
- **Transaction ownership by connection mode** (D3): `{ pool }` opens and commits its own
  transaction; `{ transaction }` runs in `SAVEPOINT store_write` and never commits the caller's
  transaction. Detecting an open transaction was rejected (`pg_current_xact_id_if_assigned()` is
  `NULL` until the first write).
- **Validation in core** (D1): a business rule, unit-tested without a database; it collects every
  violation. Weight range and enum membership are left to the database.
- **History is only added to** (D4 steps 10–11): an omitted optional value of a commit or
  file–commit link keeps the stored one (`COALESCE`); a file's values always follow the snapshot.
- **Symbol ids change on every save** (D4 step 4, intended): symbols have no natural key and only
  edges reference them. DIS-24 must not expose them as stable.
- **Known gaps** (`design.md` → Follow-ups): ten technical minors recorded as one Spanish checklist
  comment on DIS-23; the DIS-22 inbound note is absorbed there.

## Traceability

| Scenario in the specification | Test that covers it |
|---|---|
| A project is created unindexed | `tests/integration/store/graph-write.spec.ts:111` |
| A duplicate project name is rejected | `tests/integration/store/graph-write.spec.ts:133` |
| Edges connect the saved rows of the same project | `tests/integration/store/graph-write.spec.ts:208` |
| An edge without resolution is rejected | `tests/unit/knowledge/validate-graph.spec.ts:28` |
| An edge without extractor is rejected | `tests/unit/knowledge/validate-graph.spec.ts:40` |
| A dangling reference is rejected | `tests/unit/knowledge/validate-graph.spec.ts:56` |
| Duplicate keys are rejected | `tests/unit/knowledge/validate-graph.spec.ts:73` |
| Invalid history and span values are rejected | `tests/unit/knowledge/validate-graph.spec.ts:89` |
| A valid graph passes validation | `tests/unit/knowledge/validate-graph.spec.ts:119` |
| A rejected graph writes nothing | `tests/integration/store/graph-write.spec.ts:253` |
| Saving to an unknown project fails | `tests/integration/store/graph-write.spec.ts:234` |
| Saving with a malformed project id fails | `tests/integration/store/graph-write.spec.ts:243` |
| A database rejection rolls back the whole write | `tests/integration/store/graph-write.spec.ts:528` |
| A first save persists the whole graph | `tests/integration/store/graph-write.spec.ts:151` |
| A reindex keeps file ids, history and evidence | `tests/integration/store/graph-write.spec.ts:296` |
| A changed content hash on reindex marks its claims stale | `tests/integration/store/graph-write.spec.ts:332` |
| A file missing from the snapshot is deleted | `tests/integration/store/graph-write.spec.ts:354` |
| A deleted file marks its claims stale | `tests/integration/store/graph-write.spec.ts:392` |
| Symbols and edges are replaced by the snapshot | `tests/integration/store/graph-write.spec.ts:425` |
| Commits are upserted and never dropped | `tests/integration/store/graph-write.spec.ts:448` |
| An omitted history value keeps the stored one | `tests/integration/store/graph-write.spec.ts:463` |
| A file's optional values follow the snapshot | `tests/integration/store/graph-write.spec.ts:490` |
| Other projects are untouched | `tests/integration/store/graph-write.spec.ts:507` |
| Metadata reflects the saved snapshot | `tests/integration/store/graph-write.spec.ts:271` |
| Saving inside the caller's transaction does not commit it | `tests/integration/store/graph-write.spec.ts:549` |
| A failed save leaves the caller's transaction usable | `tests/integration/store/graph-write.spec.ts:561` |
| Saving on the store's own connections commits | `tests/integration/store/graph-write-pool.spec.ts:29` |

## Origin

agent+human-review

🤖 Generated with [Claude Code](https://claude.com/claude-code)
