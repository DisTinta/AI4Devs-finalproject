# Verify Against Spec: incremental-indexing

- Date: 2026-10-29
- Change: incremental-indexing (DIS-10), branch `feature/dis-10-incremental-indexing`, HEAD 74e16ab
- Step: 19.4, run inline (autonomous run, `docs/AUTONOMOUS-RUN.md` §6) by the agent that ran groups 24 and 19; it read the four delta specs, the diff of `packages/` against `origin/final-project-CRN` and the tests named below.

## 1. Requirements implemented correctly

**repository-indexing, "Incremental reindex plan"** — `packages/core/src/index/incremental-plan.ts:38-65`. Added (`:45`), modified with an unset or different stored hash (`:46`), deleted (`:51`); one-hop dependents over `DEPENDENCY_KINDS` (`:6`, `:54-57`) of modified or deleted files only, `G ≠ F` and current `G` (`:56`); `skipped` the rest (`:59`); each list sorted with `compareBytes` (`:61-63`, `packages/core/src/knowledge/byte-order.ts`). Tests: `tests/unit/index/incremental-plan.spec.ts:33`, `:41`, `:49`, `:64`, `:112`, plus the characterisation test `:85` (byte order, `implements`).

**repository-indexing, "Incremental reindex"** — `packages/core/src/index/reindex-project.ts:86-128`. `read` through `readSources` (`:87`; phases `read`, `redact`, hashes once, `packages/core/src/index/build-snapshot.ts:112-131`); `plan` (`:88-92`); `history` once (`:93-95`, `EmptyRepository` on no head); `decide` with `project.indexedCommit` (`:97`, an absent stored commit never equals a head); fast path: one unit of work with only `invalidateCache` and the report of I5 (`:98-118`); full path: `completeSnapshot` with the history given (`:121`, every file analysed, commit messages redacted, `co_changed` added, validation before any unit of work, `build-snapshot.ts:146-213`) and the same unit of work as the full mode (`:122`, `:140-150`) with the plan's counters (`:123-127`). Tests: `tests/unit/index/reindex-project.spec.ts:395`, `:423`, `:436`, `:456`, `:476`, `:495`, `:548`; over Postgres `tests/integration/index/incremental-reindex.spec.ts:127`, `:172`.

**repository-indexing, "Reindexing an existing project"** (modified: `incremental` input, `mode`, `filesQueued`, `filesSkipped`) — `reindex-project.ts:36-48`, `:130-136`; `packages/core/src/index/index-report.ts` (`mode`, `filesQueued`, `filesSkipped`; phase TSDoc). Tests: `tests/unit/index/reindex-project.spec.ts:177`, `:212`, `:224`, `:238` (both modes), `:252`, `:277`, `:290`, `:316`, `:329`, `:344`.

**graph-store, "Index state read"** — `packages/core/src/ports/StorePort.ts` (`readIndexState`, TSDoc of the requirement); `packages/adapters/store-postgres/src/queries.ts` (`INDEX_STATE_FILES`: `project LEFT JOIN file`, `COLLATE "C"`; `INDEX_STATE_DEPENDENCIES`: four kinds, ends resolved through the symbol's file, both files of the project, `ff.id <> tf.id`, `DISTINCT`, ordered by `kind::text COLLATE "C"`); `read-graph.ts` (`toIndexState`, `contentHash` absent when `NULL`); `postgres-store.ts` (`runProjectQuery` = well-formed id check and existence from the first statement; two statements). In-memory double: `tests/support/in-memory-store.ts`. Tests: `tests/integration/store/graph-read.spec.ts:852`, `:875`, `:901`, `:913`, `:934`, `:955`; `tests/unit/store/in-memory-store.spec.ts:594`.

**http-index, "Index request validation and mode selection" / "Index accepted response with the plan's counters" / "Index completion log" / "Index in the OpenAPI document"** — `packages/api/src/routes/reindex.ts`: absent body is `{}` (`preValidation`), `incremental: body.incremental ?? true`, the `202` body with exactly `projectId`, `mode`, `analyzer`, `indexedCommit`, `filesQueued`, `filesSkipped`, `cacheEntriesInvalidated` from the report, the completion log with `mode` and `filesSkipped` and no path; `packages/api/src/schemas/reindex.ts`: strict body with optional boolean `incremental`, `mode` `z.literal(REINDEX_MODES)` rendered as `enum ["full","incremental"]`. Tests: `tests/unit/api/reindex.spec.ts:195`, `:213`, `:227`, `:306`, `:350`, `:412`, `:466`; `tests/integration/api/reindex.spec.ts:130`, `:201`.

**golden-answers** (four round requirements retargeted to DIS-10 r2) — the r2 report, input, panel files and the signatures in `seeds/cache/*.json`. Tests: `tests/unit/seed/golden-reviews.spec.ts` (9 `it`s, green); "The criterion precedes the input and nothing in the record is rewritten" checked with git in Addendum 4 of the step 9 report.

## 2. Requirements missing or partial

None found. Each requirement of the four deltas has code and a test under the exact scenario name (task 8.2: repository-indexing 24, graph-store 7, http-index 9, golden-answers 7 by test plus 1 by git), and every test is green locally (`--project dom --project seed-build --project node`: 1647 passed; the Postgres files: 54 passed) and in CI (run 40951311292).

## 3. Unspecified behaviour

- `REINDEX_MODES` is a new exported constant of `packages/api/src/schemas/reindex.ts`, not named by any spec. It exists so the `mode` schema is a documented constant (`docs:coverage`); its rendering is exactly the `enum` the spec requires. Decision: keep; recorded in `design.md` → Follow-ups X-3 (destination A).
- `SnapshotSources` carries `realRepo` and the sorted `events` (`build-snapshot.ts:96-98`), beyond the fields task 3.1 lists. Internal to core, no observable behaviour. Decision: keep; recorded as X-2 (destination A).
- `CurrentFileHash` is an exported type of `incremental-plan.ts` that the spec does not name (it is the plan's first input, described by the requirement). Decision: keep; it is the typed form of a specified input.
- `readme.md` §4 now tells PowerShell users to send `-ContentType 'application/json' -Body '{}'` (design X-6). Documentation of the existing `415` behaviour, no new behaviour.

Nothing else: the route adds no response field, the use case adds no write, and the fast path writes only the cache invalidation the spec requires.

### Specific checks

- Dependency imported that is not in the manifest: none (the diff adds no import outside the workspace packages and `node:` modules).
- Authorisation the spec requires and the code skips: none; `IndexingDisabled`, the confinement and `FORBIDDEN_PATH` run before any read in both modes (`reindex-project.ts:68-76`).
- Response field not in the spec: none (`routes/reindex.ts`, seven keys, asserted by `tests/unit/api/reindex.spec.ts:306`).
- Scenario whose test asserts something weaker than the scenario: none found in the scenarios read (`incremental-plan.spec.ts:33` asserts the whole plan with `toEqual`; `reindex-project.spec.ts:395` asserts the calls of the unit of work and the absence of analyzer calls; `incremental-reindex.spec.ts:127` derives N from `readIndexState` and asserts the queued count, the claim states, the file id and the history rows).

## Scenario → test → state

| Scenario | Test | State |
|---|---|---|
| Changed files and their direct dependents are queued | `tests/unit/index/incremental-plan.spec.ts:33` | green |
| A dependent of a deleted file is queued | `tests/unit/index/incremental-plan.spec.ts:41` | green |
| Edges that are not dependencies queue nothing | `tests/unit/index/incremental-plan.spec.ts:49` | green |
| A stored file without a hash counts as modified | `tests/unit/index/incremental-plan.spec.ts:64` | green |
| The plan does not depend on the order of its inputs | `tests/unit/index/incremental-plan.spec.ts:112` | green |
| A reindex saves over the stored project and then invalidates its cache | `tests/unit/index/reindex-project.spec.ts:177` | green |
| A relative stored root resolves against the workspace root | `tests/unit/index/reindex-project.spec.ts:212` | green |
| Reindexing is disabled without an allowed root, before reading the project | `tests/unit/index/reindex-project.spec.ts:224` | green |
| An unknown project is not reindexed | `tests/unit/index/reindex-project.spec.ts:238` | green |
| A stored root outside the allowed root is rejected before reading | `tests/unit/index/reindex-project.spec.ts:252` | green |
| An allowed root that does not exist disables reindexing | `tests/unit/index/reindex-project.spec.ts:277` | green |
| A reindex keeps the stored project fields and detects no framework | `tests/unit/index/reindex-project.spec.ts:290` | green |
| A workspace root that is not absolute is rejected before any call | `tests/unit/index/reindex-project.spec.ts:316` | green |
| A failed cache invalidation fails the unit of work | `tests/unit/index/reindex-project.spec.ts:329` | green |
| An invalid graph writes nothing | `tests/unit/index/reindex-project.spec.ts:344` | green |
| An unchanged repository takes the fast path | `tests/unit/index/reindex-project.spec.ts:395` | green |
| A failed cache invalidation on the fast path fails the reindex | `tests/unit/index/reindex-project.spec.ts:423` | green |
| A new HEAD with no changed file runs the whole reindex | `tests/unit/index/reindex-project.spec.ts:436` | green |
| A changed file is reprocessed with the whole snapshot | `tests/unit/index/reindex-project.spec.ts:456` | green |
| A full reindex ignores the stored index state | `tests/unit/index/reindex-project.spec.ts:476` | green |
| The phases of an incremental reindex are reported in order | `tests/unit/index/reindex-project.spec.ts:495` | green |
| An invalid graph in an incremental reindex writes nothing | `tests/unit/index/reindex-project.spec.ts:548` | green |
| An incremental reindex over Postgres reprocesses the changed file and its direct dependents | `tests/integration/index/incremental-reindex.spec.ts:127` | green |
| An unchanged repository keeps its indexing metadata over Postgres | `tests/integration/index/incremental-reindex.spec.ts:172` | green |
| The index state lists the stored files and their file dependencies | `tests/integration/store/graph-read.spec.ts:852` | green |
| Edges that are not dependencies are left out of the index state | `tests/integration/store/graph-read.spec.ts:875` | green |
| A project without a graph has an empty index state | `tests/integration/store/graph-read.spec.ts:901` | green |
| The index state never holds another project's rows | `tests/integration/store/graph-read.spec.ts:913` | green |
| Reading the index state of an unknown project fails | `tests/integration/store/graph-read.spec.ts:934` | green |
| The index state is read in at most two statements | `tests/integration/store/graph-read.spec.ts:955` | green |
| The in-memory double reads the same index state | `tests/unit/store/in-memory-store.spec.ts:594` | green |
| A body with a path or a language answers VALIDATION_ERROR without indexing | `tests/unit/api/reindex.spec.ts:195` | green |
| A malformed project id answers VALIDATION_ERROR without indexing | `tests/unit/api/reindex.spec.ts:213` | green |
| A request without a body is an incremental reindex | `tests/unit/api/reindex.spec.ts:227` | green |
| An invalid request answers VALIDATION_ERROR over the seed | `tests/integration/api/reindex.spec.ts:201` | green |
| A reindex answers 202 and invalidates the cache over the seed | `tests/integration/api/reindex.spec.ts:130` | green |
| An incremental request answers the plan's counters | `tests/unit/api/reindex.spec.ts:306` | green |
| A TypeScript project answers with the ts-compiler analyzer | `tests/unit/api/reindex.spec.ts:350` | green |
| A reindex logs its counters without paths | `tests/unit/api/reindex.spec.ts:412` | green |
| The document lists index with its parameter, body and responses | `tests/unit/api/reindex.spec.ts:466` | green |
| The panel input projects the golden answers without their verification | `tests/unit/seed/golden-reviews.spec.ts:99` | green |
| Invalid panel outputs are rejected | `tests/unit/seed/golden-reviews.spec.ts:405` | green |
| Each panelist output judges every item under the criterion | `tests/unit/seed/golden-reviews.spec.ts:458` | green |
| The resolution answers exactly the disagreements | `tests/unit/seed/golden-reviews.spec.ts:474` | green |
| The report's verdicts and agreement match the panel files | `tests/unit/seed/golden-reviews.spec.ts:657` | green |
| The report states its criterion, panel and limitations | `tests/unit/seed/golden-reviews.spec.ts:702` | green |
| The report's criterion is the Panel group's criterion | `tests/unit/seed/golden-reviews.spec.ts:730` | green |
| The criterion precedes the input and nothing in the record is rewritten | git check, step 9 report Addendum 4 | green (checked) |

## Verdict

Conforms. No missing or partial requirement; the unspecified behaviour is internal or documentation and each item has a recorded decision.
