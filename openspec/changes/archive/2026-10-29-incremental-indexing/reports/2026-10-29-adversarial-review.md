# Adversarial review: incremental-indexing

- Date: 2026-10-29
- Change: incremental-indexing (DIS-10), branch `feature/dis-10-incremental-indexing`, HEAD 74e16ab, against `origin/final-project-CRN`
- Step: 19.5, run inline (autonomous run, `docs/AUTONOMOUS-RUN.md` §6). Limitation: the reviewer is the same agent session that ran groups 24 and 19 (not the session that wrote the code of groups 1–7), so it may share blind spots with the run's own reports.

## What was checked

- Axis 1: the four delta specs against the code and the tests (the scenario map of task 8.2 and `2026-10-29-verify-against-spec.md`); every `[x]` task against its evidence in the step 9 and step 15 reports; the history of the specs (`git log origin/final-project-CRN..HEAD -- openspec/changes/incremental-indexing/specs`: 8efe6e0 propose, 4a60126 spec-audit corrections, 8eb36ad the r2 retarget of `golden-answers`).
- Axis 2: hostile input on `POST /api/projects/{projectId}/index` (`packages/api/src/routes/reindex.ts`, `packages/api/src/schemas/reindex.ts`), `reindexProject` (`packages/core/src/index/reindex-project.ts`), `planIncremental` (`packages/core/src/index/incremental-plan.ts`) and `readIndexState` (`packages/adapters/store-postgres/src/postgres-store.ts`, `queries.ts`, `read-graph.ts`), read in the code; plus the live PowerShell run of P8.
- Axis 3: the callers of the modified code and the readers of the data it writes; migrations; behaviour changes without a scenario.
- Axis 4: the strength of the main tests and the existing tests changed (task 8.1).

## Adversarial review

### Findings

| Severity | File:line | Finding | Why it matters |
|---|---|---|---|
| Minor | `readme.md` §4 (YAML comment of `/api/projects/{projectId}/index`) | A PowerShell user who runs `Invoke-RestMethod -Method Post` with no `-Body` (Windows PowerShell 5.1 and PowerShell 7) gets `415 UNSUPPORTED_MEDIA_TYPE`: PowerShell declares `application/x-www-form-urlencoded`. Found live in the P8 run. The API behaves as its error table says; only a body without `Content-Type` is `{}` (`routes/reindex.ts`, `preValidation`). | The documented "no body = incremental" path did not work as written from PowerShell, the shell the project supports alongside Bash. |
| Minor | `packages/core/src/index/incremental-plan.ts:54-57` | Only dependents of modified or deleted files are queued; a file that references a newly **added** file (for example a call that resolves only once the new class exists) is counted as `skipped`. | `filesQueued` under-counts what can change in that case. The graph stays correct because the full path analyses every file (D1), and the spec defines `queued` exactly this way ("a direct dependent of a modified or deleted file"): the stored state has no edge into a path that did not exist. |
| Minor | `packages/adapters/store-postgres/src/postgres-store.ts` (`readIndexState`) and `reindex-project.ts:88` | The two statements of `readIndexState` run outside the unit of work and, on the store's client, not in one snapshot: a concurrent reindex of the same project committing between them, or between the read and the save, can make the plan's counters (or the fast-path decision) reflect a mixed state. | Counters, or one fast path that leaves the concurrent reindex's (complete, valid) graph in place. Recorded in `design.md` → Risks and D8; deadlocks keep the `40P01` retry. |
| Question | `reindex-project.ts:97-118` | The fast path leaves `indexed_at` unchanged, so a client reading the project after a successful incremental reindex sees the time of the last write, not of the last check. | Required by the spec ("An unchanged repository keeps its indexing metadata over Postgres") and consistent with "what this reindex wrote" (design I5). No consumer in the repository reads `indexed_at` as "last checked". |
| Question | `reindex-project.ts:97` | The fast path keeps a graph produced by an older analyzer when the repository is unchanged. | Already decided and documented: P7, `readme.md` §4 (`incremental: false` after an analyzer upgrade). |
| Minor | `openspec/changes/incremental-indexing/tasks.md` (8.2, 11.5) | Task 8.2 (scenario → test map) was still unchecked although its evidence exists (the map in `2026-10-29-verify-against-spec.md`: 24 + 7 + 9 + 8, the git-checked scenario recorded in Addendum 4); task 11.5 (conditional regeneration) was unchecked although its condition was handled by the r2 round (groups 20–24) and `git log d50956a..HEAD` over every seed and answer fingerprint input is empty. | The archive needs a tasks file whose open boxes are real open work. |

Axis 1, also checked: the r2 retarget of the `golden-answers` delta (8eb36ad) was made before the r2 regeneration and panel, on the author's decision G1; it changes which round's files are current and does not loosen any rule to match code. No `[x]` task lacks its evidence other than the two above. The code does nothing the specs do not ask for beyond the items of block 3 of the verify report (`REINDEX_MODES`, `SnapshotSources.realRepo`/`events`, `CurrentFileHash`), each internal or documented (X-2, X-3).

Axis 2, also checked without finding: empty body (→ `{}`, `preValidation`); `Content-Type: application/json` with an empty body (400); `{"incremental":"yes"}`, `null` or an extra key (400, strict schema, value not echoed); a malformed id (400 before any store call) and an unknown UUID (404, `ProjectNotFound` from `getProject` or `readIndexState`); a stored file with a `NULL` hash (modified); a stored edge whose end is in another project (dropped by the `JOIN … AND project_id = $1`); a self edge (excluded, `ff.id <> tf.id` and `fromPath !== toPath`); a dependent that is itself deleted (not queued, `currentHash.has(fromPath)`); a project with no stored `indexedCommit` (never fast path); an empty repository (`EmptyRepository` before any write); the same request twice (the second takes the fast path, measured in step 15); a changed redaction rule (every hash differs, full path).

Axis 3: `reindexProject` has one caller, the API route; `readIndexState` is read only by `reindexProject`; `StorePort` gains one method, implemented by the Postgres store and the in-memory double (type-checked). No migration. The default change of `incremental` has its scenario ("A request without a body is an incremental reindex") and the BREAKING note in the proposal and the PR. `buildSnapshot` keeps its phases and outputs: `index-repository.spec.ts` and `acme-shop.spec.ts` pass unedited.

Axis 4: `tests/unit/index/incremental-plan.spec.ts:33` asserts the whole plan with `toEqual`; it fails if the dependency direction is swapped (it would queue `C.php` and leave `B.php` skipped), if dependents become transitive (`C.php` queued), or if deleted files stop seeding dependents (with `:41`). `tests/integration/index/incremental-reindex.spec.ts:127` derives N from the stored state and fails if N is 0. Stryker 93–100 per file (step 9 report), CI `mutation` green. Existing tests changed: those named in task 8.1, each with its reason; none weakened (checked in the diff of `tests/unit/api/reindex.spec.ts`: the replaced `it` belongs to a scenario the spec removed, P9).

### Verdict

PASS — no Blockers and no Majors, evidence is sufficient. Every Minor and Question has a destination below.

### Recommended next steps before archiving

1. `readme.md` §4 PowerShell line — destination A, fixed in commit 74e16ab (design X-6).
2. Dependents of added files — destination D (the spec defines `queued`; the graph is unaffected; D1).
3. Non-snapshot index state read under concurrency — destination D (design Risks; D8 stays C).
4. `indexed_at` on the fast path and the analyzer-upgrade fast path — destination D (spec scenario; P7).
5. Tasks 8.2 and 11.5 — destination A: mark them done with their evidence in this step.
