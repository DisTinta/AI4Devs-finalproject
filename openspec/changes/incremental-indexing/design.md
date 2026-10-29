## Context

See `proposal.md` → Why. Current state the approach builds on:

- `reindexProject` (`packages/core/src/index/reindex-project.ts`, DIS-9) composes `confineRepository`
  → `buildSnapshot` → one unit of work with `saveGraph` + `invalidateCache`. `buildSnapshot` reads,
  applies the hygiene, redacts, analyses, reads the history, adds `co_changed` and validates, in the
  phase order of `INDEX_PHASES`. It sets each file's `contentHash` to the SHA-256 of its **redacted**
  content.
- `saveGraph` treats its graph as the **complete** snapshot: files are updated in place by path
  (keeping their id, their `file_commit` rows and the `evidence` citing them), absent ones are deleted
  with their cascade (warnings of DIS-12 and DIS-23 on this ticket). The DIS-13 trigger
  `file_content_hash_marks_claims_stale` marks the claims citing a file `stale` only when its
  `content_hash` changes (`IS DISTINCT FROM`), so rewriting an unchanged file with the same hash
  touches no claim.
- No store read returns the stored hashes or the stored edges by file path.
- The analyzers resolve calls, imports and inheritance across files: they need every file of the
  repository to produce correct edges for any one of them.
- The API route (`packages/api/src/routes/reindex.ts`) answers `mode: 'full'`, `filesQueued:
  report.files`, `filesSkipped: 0`; the body schema accepts `incremental` without effect.
- The change touches seed fingerprint inputs (`packages/core/src/index`, `packages/core/src/knowledge`,
  `packages/adapters/store-postgres/src`; `packages/cli/src/seed/fingerprint.ts`), so CI `verify`
  fails until `seeds/graph-dump.sql` and the golden files are regenerated (ADR
  `20261017-stale-fingerprint-fails-verify`), and the regenerated golden entries come back with empty
  `reviews`, which `tests/unit/seed/golden-reviews.spec.ts` rejects until a review round signs them.

## Goals / Non-Goals

**Goals:**

- A pure, deterministic plan over hashes and stored dependencies, unit-tested on its own.
- One new read on `StorePort`, two statements at most, no N+1, no migration.
- Incremental mode as the default of the API, full mode kept bit-for-bit for `incremental: false`.
- A fast path that does no analysis and no graph write when nothing changed.
- The DoD (a modified file and its direct dependents reprocessed, the rest skipped, only the changed
  file's claims `stale`, file id and history kept) proven over Postgres.

**Non-Goals:** see `proposal.md` → Non-goals. At design level also: no new phase in `INDEX_PHASES`,
no change to `saveGraph`, no change to `indexRepository`'s behaviour or report, no new `GitPort`
operation.

## Decisions

### I1. The plan (`packages/core/src/index/incremental-plan.ts`)

`planIncremental(current, stored)` with `current: { path, contentHash }[]` and `stored: IndexState`
(I2) returns `IncrementalPlan { queued: string[]; skipped: string[]; deleted: string[] }`, exactly the
contract of the `repository-indexing` requirement "Incremental reindex plan". Sets and maps, then one
sort per list in UTF-8 byte order. The byte-order comparison is today a private function of
`build-snapshot.ts` (`compareBytes`) and, identically, of `packages/core/src/knowledge/co-change.ts`
(`compareByteOrder`); it moves to `packages/core/src/knowledge/byte-order.ts` (`compareBytes`, so
`knowledge` never imports `index`), which replaces both private copies; `build-snapshot.ts`,
`incremental-plan.ts` and `co-change.ts` import it (no behaviour change). The dependency kinds are a frozen constant
`DEPENDENCY_KINDS = ['calls', 'extends', 'implements', 'imports']` in the plan module, filtered again
by the plan even though the store already filters them, so the plan's contract does not depend on the
store's. Exported through `packages/core/src/index/index.ts` and `packages/core/src/index.ts`, with
TSDoc. Template: the pure modules `source-path.ts` and `framework-detect.ts`.

*Alternative rejected:* computing dependents with `neighbors(..., 'in')` per changed file (parent
DIS-6's sketch): one statement per changed file (N+1) and node-level results that still need mapping
to files.

### I2. The store read (`StorePort.readIndexState`)

Types in `packages/core/src/knowledge/graph-read.ts`: `IndexState { files: StoredFileHash[];
dependencies: StoredDependency[] }`, `StoredFileHash { path: string; contentHash?: string }`,
`StoredDependency { fromPath: string; toPath: string; kind: EdgeKind }`. The port method's TSDoc
states the `graph-store` requirement "Index state read".

Postgres (`queries.ts`, `read-graph.ts`, `postgres-store.ts`), after the usual well-formed id check
(no statement on a malformed id):

1. Files, with the existence check folded in: `project LEFT JOIN file` on the project id, ordered by
   `path COLLATE "C"`; no row means `ProjectNotFound`, one row with a `NULL` path means a project
   without files.
2. Dependencies: each `edge` of the project of the four kinds, its source resolved to a file id as
   `COALESCE(source_file_id, source symbol's file_id)` and its target likewise, both joined to `file`
   rows **of the same project** (so an end in another project drops the edge), `from <> to`,
   `SELECT DISTINCT from.path, to.path, kind`, ordered by `from.path COLLATE "C"`,
   `to.path COLLATE "C"`, `kind::text COLLATE "C"` (`edge_kind` is an enum whose declaration order,
   `calls, imports, extends, implements`, is not byte order).

Both run on the store's client (or the caller's transaction) like the other reads; the
`file_project_content_hash_idx` and the existing edge indexes serve them. The in-memory double
(`tests/support/in-memory-store.ts`) implements the same contract over its stored graph (symbol →
file by its stored file, the same filters and orders).

### I3. Splitting the snapshot build (`build-snapshot.ts`)

`buildSnapshot` becomes the composition of two exported functions with no behaviour change:

- `readSources(deps, realRepo, options)`: phases `read` and `redact` (read, hygiene, redact, framework
  decision); returns the redactions, the redacted files, each file's `contentHash`, the framework,
  its source and the skipped entries.
- `completeSnapshot(deps, sources, history?)`: phases `analyze`, `history` (only when `history` is
  not given: then it reads it), `save` (validation). Given a history it does not read it again and
  does not report `history`.

`contentHash` is computed once in `readSources` and reused in `completeSnapshot` (the same SHA-256 of
the redacted content). `indexRepository` and the full reindex keep calling `buildSnapshot`, so their
phases and outputs are unchanged; `tests/unit/index/index-repository.spec.ts` and
`tests/integration/index/acme-shop.spec.ts` stay unedited as the safety net.

### I4. The use case (`reindex-project.ts`)

`ReindexInput.incremental: boolean` is required in core: the default belongs to the API (I6). With
`false`, the current code path (plus the three new report fields). With `true`:

1. `enabled`, `project`, `confine` as today.
2. `readSources` (phases `read`, `redact`).
3. `deps.store.readIndexState(project.id)` outside the unit of work (a read), then
   `planIncremental`.
4. `progress('history')`, `deps.git.readHistory(realRepo)`; `EmptyRepository` when it has no head, as
   `buildSnapshot` does.
5. Unchanged (`queued` and `deleted` empty and `history.head === project.indexedCommit`): `progress(
   'save')`, one `inTransaction` with only `invalidateCache`; the fast-path report (I5).
6. Otherwise `completeSnapshot(deps, sources, history)` (phases `analyze`, `save`) and the same unit
   of work as the full mode; report from `saveGraph`'s result with the plan's counters.

The phase order of incremental mode (`history` before `analyze`) differs from `INDEX_PHASES`' order;
no phase is added and the CLI (the only consumer of the progress callback) never reindexes. A project
never indexed (`indexedCommit` absent) is never unchanged.

### I5. The fast-path report

Nothing is written, so every "written" count is `0` (`files`, `filesDeleted`, `symbols`, `commits`,
`fileCommits`, `edges`), `diagnostics` and `commitEvents` are empty (no analysis, commit messages not
redacted because nothing is saved), `events` and `skipped` are those of the files read, and
`indexedCommit` is the stored one (equal to `HEAD`). `filesSkipped` carries the information the
caller needs. *Alternative rejected:* filling `files`/`symbols` from the stored graph: it needs a
third read and blurs "what this reindex wrote".

### I6. API (`schemas/reindex.ts`, `routes/reindex.ts`)

`reindexBodySchema` unchanged (`incremental` optional; its TSDoc no longer says "without effect").
`reindexResponseSchema.mode` becomes `z.enum(['full', 'incremental'])`. The route passes
`incremental: body.incremental ?? true` and answers `mode`, `filesQueued`, `filesSkipped` from the
report; the completion log gains `filesSkipped` and logs the report's `mode`. Error table unchanged:
`ProjectNotFound` from `readIndexState` maps to `404` like any other.

### I7. Tests

- New: `tests/unit/index/incremental-plan.spec.ts` (5 scenarios); new `it`s in
  `tests/unit/index/reindex-project.spec.ts` (7 unit scenarios of "Incremental reindex");
  `tests/integration/index/incremental-reindex.spec.ts` (the 2 Postgres scenarios; template
  `tests/integration/index/acme-shop.spec.ts` for the copy and the real adapters, plus
  `tests/integration/store/indexes-stale.spec.ts` for claims); new `it`s in
  `tests/integration/store/graph-read.spec.ts` (6 `graph-store` scenarios) and
  `tests/unit/store/in-memory-store.spec.ts` (the double's scenario).
- Existing tests changed are named in `tasks.md` (task 8.1).
- The DoD integration test indexes the copy with `indexRepository` (a state consistent with the copy
  by construction) instead of loading the seed and reindexing it; the commit in the copy is made with
  `git` through `execFileSync` with a fixed author and date, like `fixtures/build-history.mjs`.

### I8. Seed, golden answers and the DIS-10 review round

As DIS-9 (E16, E30, E31), planned from the start this time: the round's report with its
`## Criterion` (the DIS-33 criterion verbatim) is committed **before** the regeneration; then
`seed:build` (only the header's `analyzer-fingerprint` may change) and `cache:build` with the local
Ollama (`qwen2.5-coder`) as the last commit touching a fingerprint input; then the panel input, the
two panelists, the resolver and the signatures; the `golden-answers` delta retargets the four
round-specific requirements from DIS-9 to DIS-10. If Ollama cannot serve the model, the ticket stops
(CI `verify` would stay red).

### I9. Documentation

`readme.md` §4: `incremental` defaults to `true` (incremental) and `false` forces a full reindex; the
`202` example with `mode: "incremental"` and a non-zero `filesSkipped`; the note "sin efecto hasta
DIS-10" removed; one line saying that after an analyzer upgrade a reindex must use `incremental:
false` (P7). `docs/project-context.md`: the body line of `/index`, the new port read, the Testing
list. The golden review round mentions (as DIS-9's task 10d.8). No ADR: the decisions are local to
the reindex use case and reversible (`incremental: false` restores today's behaviour).

## Risks / Trade-offs

- [The index state is read outside the unit of work; a concurrent reindex of the same project can
  change it before the save] → the counters may be off by that concurrent change, but the graph is
  always the complete snapshot of `HEAD`, so the stored state stays correct; deadlocks keep the
  `40P01` retry of `atomically` (D8).
- [After an analyzer upgrade, an unchanged repository takes the fast path and keeps the graph of the
  old analyzer] → `incremental: false` forces the full reindex; documented in `readme.md` §4 (P7).
- [A change of the redaction rules changes every hash] → every file is queued and the full path runs:
  correct, only slower.
- [The full path still analyses every file] → by design (D1); the real gain is the fast path; the
  per-file reuse is debt (D1, destination C).
- [Default change: a client sending no `incremental` now gets an incremental reindex] → same graph
  afterwards; only the counters differ; documented in `readme.md` §4.
- [Seed and golden regeneration depends on the local Ollama] → if it cannot serve the model, the
  ticket stops (P6).
- [A review fix after the regeneration that touches a fingerprint input] → it forces another
  regeneration and a rerun of the round; after the input commit such a fix goes to the author
  (destination C) unless the round is rerun (tasks 10.5, 15.6).

## Migration Plan

No schema migration. Deploying changes the default of `POST /index`; rollback is reverting the merge.
The seed and golden files are regenerated in this change.

## Follow-ups

*Agent's text: decisions taken by the agent as lead engineer in the autonomous run
(`docs/AUTONOMOUS-RUN.md` §6), without the author; D1–D8 copied from the DIS-10 `[enhanced]`
description, P1–P9 taken in this proposal. Destinations: A = this change; B = another existing
ticket; C = explicit debt (Spanish checklist comment on DIS-10 and this list); D = accepted, recorded
in spec or non-goals.*

| Id | Decision | Destination |
|---|---|---|
| D1 | When anything is queued the analyzer still receives **every** file (cross-file resolution needs them, `saveGraph` needs the complete snapshot). `filesQueued` counts what can change; skipped files are rewritten with the same hash and the trigger leaves their claims alone. Reusing the per-file analysis is debt. | D (decision); C (reuse debt) |
| D2 | `incremental` defaults to `true` in `POST /index` (`readme.md` §4 contract); `false` forces the full mode. | A |
| D3 | Direct dependents = stored `imports`, `calls`, `extends`, `implements` edges, one hop, from modified **and** deleted files. | A |
| D4 | Fast path: nothing queued, nothing deleted and `HEAD` = `indexed_commit` → no analysis and no `saveGraph`; the cache is invalidated anyway (PH-07). | A |
| D5 | No CLI reindex command in this ticket (`codemind index` only creates projects; the plan does not apply). Debt: `codemind reindex <projectId> [--full] [--json]`. | C |
| D6 | A rename is a delete + add (it loses history and evidence by the cascade, DIS-12 warning). | D |
| D7 | Only the claims of files whose hash changed become `stale`; the dependents' claims do not (lazy recalculation is 09.4). | D |
| D8 | No per-project lock; deadlocks are covered by the `40P01` retry of `atomically`. The lost invalidation with concurrent claim writers (DIS-13 warning) stays as it was. | C |
| P1 | Fast-path report: written counts `0`, empty `diagnostics` and `commitEvents`, stored `indexedCommit` (I5). | A |
| P2 | Incremental mode reads the history right after redaction, so its phase order is `confine`, `read`, `redact`, `history`, then `analyze`, `save` or only `save`; no phase added (I4). History is read once (I3). | A |
| P3 | `readIndexState` returns file-level dependencies aggregated by pair and kind, `contentHash` absent when `NULL`, in at most two statements with the existence check folded into the first (I2). | A |
| P4 | The DoD integration test builds its stored state with `indexRepository` over the copy instead of the seed plus a reindex (I7). | A |
| P5 | The `http-index` Postgres scenario "A reindex answers 202 and invalidates the cache over the seed" now sends `{ "incremental": false }` (with `{}` the seed's state would take the fast path and `indexed_at` would not move). | A |
| P6 | The change regenerates the seed and the golden files with the local Ollama and runs a DIS-10 blind panel round, with the criterion committed before the regeneration (I8). This run's ticket entry carries no `ollama` flag: the apply starts Ollama from its local install if it is not serving; if it cannot serve, the ticket stops. | A |
| P7 | An unchanged repository keeps the graph of an older analyzer on the fast path; `incremental: false` is the documented way to rebuild after an analyzer upgrade. | D |
| P9 | In `http-index`, "Index request validation" and "Index accepted response" are REMOVED and re-ADDED as "Index request validation and mode selection" and "Index accepted response with the plan's counters": each loses one scenario that no longer holds ("A request without a body is a full reindex", "An incremental request is accepted as a full reindex"), and `openspec validate` refuses a MODIFIED block that drops a scenario. Every other rule and scenario is kept word for word. | A |
| P8 | PowerShell check for the author: run the `readme.md` §4 `POST /index` example in a new PowerShell terminal against a local API and confirm `mode: "incremental"`; the agent runs the Git Bash half (task 15.8). | C |

*Agent's text: spec audit run 1 (`reports/2026-10-29-spec-audit.md`), correction round 1. Answers to
the questions for the author, taken by the agent as lead engineer without the author, and the
destination of each finding applied.*

| Id | Decision | Destination |
|---|---|---|
| Q1 | D5 confirmed: the CLI reindex command stays out. The sub-issue's `[original]` description and its DoD (the integration test) do not name the CLI; only its title and the parent DIS-6 do, and `codemind index` only creates projects. Least scope: debt `codemind reindex <projectId> [--full] [--json]`, already in the checklist comment of DIS-10. | C |
| Q2 | D3 confirmed: dependents are `imports`, `calls`, `extends` and `implements` edges. A change to a parent class or an interface changes what its subclasses and implementers resolve to, exactly as a change to a called or imported file does; leaving them out would under-count `filesQueued`. It widens no work: the analyzer already receives every file (D1). | A |
| Q3 | D2 confirmed: `incremental` defaults to `true`. It is the contract already published in `readme.md` §4 ("sin efecto hasta DIS-10"), the graph after the reindex is the same in both modes, and `incremental: false` keeps the full mode; the BREAKING note stays in the proposal and goes into the PR. | A |
| Q4 | The cost of regenerating the seed and the golden files with the local Ollama and of the DIS-10 panel round (groups 10–14) is accepted inside this ticket: ADR `20261017-stale-fingerprint-fails-verify` and `tests/unit/seed/golden-reviews.spec.ts` make CI red without it, so it cannot be split off without a red base branch. The estimate gap is stated in the Linear comment of this round; the `[enhanced]` description is not edited. | A |
| B1 | The Postgres DoD scenario requires N ≥ 1 direct dependents of `app/Services/PriceCalculator.php` and names them exactly. | A |
| B2 | Steps 11 and 14.6 record the 0.4 indicators before and after `db:seed`/`cache:build` and document or restore any drift (tasks 11.1, 11.6, 14.6); 15.6 re-checks the 15.1 indicators. | A |
| I-1 | The completion log's `mode` and `filesSkipped` are asserted for incremental, default and full requests ("An incremental request answers the plan's counters"). | A |
| I-2 | "An unknown project is not reindexed" runs in both modes. | A |
| I-3 | New scenario "A failed cache invalidation on the fast path fails the reindex". | A |
| I-4 | A project with no stored `indexedCommit` is never unchanged: in the `decide` row and in "A new HEAD with no changed file runs the whole reindex". | A |
| I-5 | `filesSkipped` counts the plan's `skipped`, never the hygiene's `skipped` entries. | A |
| I-6 | Task 6.1: a fresh copy per `it`, built in `beforeEach`, removed in `afterEach`. | A |
| I-7 | The second claim's file is the first stored path in byte order outside the changed file and its N dependents. | A |
| I-8 | Dependencies ordered by `kind::text COLLATE "C"`; the graph-store scenario has an `extends` and an `imports` edge between the same pair. | A |
| I-9 | `packages/core/src/knowledge` named as a touched fingerprint input in the proposal and in Context. | A |
| I-10 | The byte-order comparator moves to `packages/core/src/knowledge/byte-order.ts` and replaces `compareByteOrder` of `co-change.ts` too (I1, task 1.1). | A |
| I-11 | Task 4.2 amends the TSDoc of `INDEX_PHASES`/`IndexPhase`. | A |
| I-12 | Task 4.4 split into 4.4 (fast path), 4.5 (full path) and 4.6 (phases). | A |
| I-13 | Task 12.1 split into 12.1a and 12.1b. | A |
| I-14 | Task 4.1's RED is seen through `npm run typecheck`. | A |
