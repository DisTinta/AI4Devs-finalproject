## Why

`POST /api/projects/{projectId}/index` (DIS-9) always rebuilds and rewrites the whole graph, and it
accepts `incremental` without effect: it answers `mode: "full"` and `filesSkipped: 0` whatever the
repository did. A maintainer cannot tell what knowledge was recalculated, and a reindex of an
unchanged repository repeats all the analysis. DIS-10 (CM-HU-05b.1, `should`, gate PH-20) adds the
incremental plan: compare each file's `content_hash` with the stored one, queue the changed files and
their direct dependents, count the rest as skipped, and skip the analysis entirely when nothing
changed. Only the claims of files whose content changed become `stale` (the DIS-13 trigger already
does it on an in-place hash update).

Scope comes from DIS-10 only; its parent DIS-6 gives context. The decisions D1–D8 of the ticket's
`[enhanced]` description were taken by the agent as lead engineer in the autonomous run
(`docs/AUTONOMOUS-RUN.md` §6) and are recorded in `design.md` → Follow-ups.

## What Changes

- **New pure plan** in core: from the current files' hashes and the stored index state (files with
  their hashes, file-to-file dependencies), it returns the queued, skipped and deleted paths. A
  direct dependent is a current file with a stored `imports`, `calls`, `extends` or `implements` edge
  into a modified or deleted file (one hop).
- **New store read** `readIndexState(projectId)` on `StorePort`: the project's stored file paths with
  their content hashes and the stored dependencies between distinct files, read-only, isolated by
  project, at most two statements; implemented in the Postgres adapter and in the in-memory double.
- **Reindex use case**: the input gains `incremental`. Full mode is today's behaviour. Incremental
  mode reads the history before analysing; when nothing is queued, nothing is deleted and `HEAD`
  equals the stored `indexed_commit`, it neither analyses nor saves the graph and only deletes the
  answer cache entries (fast path, PH-07). Otherwise it analyses every file and saves the whole
  snapshot as today (D1), with the plan's counters. The report gains `mode`, `filesQueued` and
  `filesSkipped`.
- **API**: `incremental` defaults to `true` (contract of `readme.md` §4); `incremental: false`
  forces a full reindex. The `202` body answers the real `mode` (`"full"` or `"incremental"`),
  `filesQueued` and `filesSkipped`; the completion log adds `filesSkipped`; the OpenAPI document
  declares `mode` as `enum: ["full", "incremental"]`. **BREAKING** for a client that relied on a
  request without `incremental` being a full reindex: it now gets an incremental one (same graph
  afterwards, different counters).
- **Seed and golden answers**: the change touches seed fingerprint inputs (`packages/core/src/index`,
  `packages/core/src/knowledge`, `packages/adapters/store-postgres/src`), so `seeds/graph-dump.sql` and the two golden files are
  regenerated (same seed rows, new header), and the regenerated golden answers get a new blind panel
  review round (DIS-10), as DIS-9 did.
- No CLI change: `codemind index` only creates projects and there is no reindex command (D5,
  destination C).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `repository-indexing`: "Reindexing an existing project" gains the `incremental` input and the
  `mode`/`filesQueued`/`filesSkipped` report fields; new requirements for the incremental plan and
  the incremental reindex (fast path, phases, the DoD over Postgres).
- `http-index`: request validation (`incremental` with effect, default `true`) and accepted response
  (`mode`, `filesQueued`, `filesSkipped`) are replaced by renamed requirements (REMOVED + ADDED: each
  drops one scenario that no longer holds, which a MODIFIED block cannot do); completion log
  (`filesSkipped`) and OpenAPI (`mode` enum) are modified.
- `graph-store`: new read "Index state read".
- `golden-answers`: the round-specific golden review requirements move from the DIS-9 round to the
  DIS-10 round (DIS-9 becomes history).

## Non-goals

- Lazy recalculation of claims or of dependents (09.4).
- Per-file analysis or an analysis cache: the analyzer still sees the whole repository (D1).
- A CLI reindex command and changes to the `codemind index` report (D5).
- Rename detection (D6), transitive dependents, asynchronous reindex with a job status.
- A per-project lock or a reindex queue (D8).
- Marking the claims of direct dependents `stale` (D7).

## Impact

- Core: `packages/core/src/index/` (new `incremental-plan.ts`, `reindex-project.ts`,
  `build-snapshot.ts` split, `index-report.ts`), `packages/core/src/ports/StorePort.ts`,
  `packages/core/src/knowledge/graph-read.ts`, the shared byte-order comparator
  `packages/core/src/knowledge/byte-order.ts` (also used by `co-change.ts`), exports.
- Adapter: `packages/adapters/store-postgres/src/` (`postgres-store.ts`, `queries.ts`,
  `read-graph.ts`); no migration (uses `file_project_content_hash_idx` of `0003`).
- API: `packages/api/src/schemas/reindex.ts`, `packages/api/src/routes/reindex.ts`.
- Tests: new `tests/unit/index/incremental-plan.spec.ts`,
  `tests/integration/index/incremental-reindex.spec.ts`; existing tests changed are named in
  `tasks.md`.
- Seed and golden files regenerated with the local Ollama; new golden review round files under
  `docs/golden-review/`.
- Docs: `readme.md` §4, `docs/project-context.md`, the golden review round mentions.
- Privacy and logging: no new personal data. Hashes are computed over **redacted** content, so a
  secret never reaches the comparison; the response and the log keep holding counters only, never a
  path nor a content.
