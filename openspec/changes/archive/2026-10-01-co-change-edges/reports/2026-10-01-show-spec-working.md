# Show Spec Working — co-change-edges (DIS-36)

- Date: 2026-10-01
- Change: co-change-edges (delta on `git-history`, 10 scenarios)
- Interface: the exported core rule `coChangeEdges` (compiled `packages/core/dist`, as a consumer
  imports it), the `GitPort` adapter `createSimpleGitHistory`, and `StorePort.saveGraph` through
  `createPostgresStore({ pool })` — the production connection mode, real commits. No HTTP route or
  CLI command exists for this capability.
- Driver: [`./2026-10-01-demo.mts`](./2026-10-01-demo.mts), independent of the repo's test specs;
  transcript: [`./2026-10-01-demo-output.txt`](./2026-10-01-demo-output.txt).

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| Files changed together form a weighted edge | `coChangeEdges` on s1–s3 (a, b) + s4 (b) | one edge `a.ts → b.ts`, `co_changed`/`heuristic`/`git`, 0.75 | Yes | transcript §1 |
| A single shared commit is not enough | a/b share 1 commit, c alone | `[]` | Yes | transcript §1 |
| Each pair yields one edge from the smaller path | `z.ts`/`m.ts`/`Z.ts` in 2 commits, input in two orders | `Z.ts→m.ts`, `Z.ts→z.ts`, `m.ts→z.ts`, weight 1; both runs equal | Yes | transcript §1 |
| A path outside the snapshot yields no edge but still counts | `old.ts` not known | one edge `a.ts → b.ts`, 2/3 | Yes | transcript §1 |
| A commit with more than 100 files is ignored | `big1`/`big2` of 101 files | one edge `a.ts → b.ts`, 1 | Yes | transcript §1 |
| A commit with exactly 100 files is counted | `big1`/`big2` of 100 files | `a.ts → b.ts` 0.5 and `a.ts → c.ts` 0.5 (4951 edges in total) | Yes | transcript §1 |
| An empty history yields no edges | no links | `[]` | Yes | transcript §1 |
| Duplicate links in one commit count once | `a.ts`@s1 twice | one edge `a.ts → b.ts`, 2/3 | Yes | transcript §1 |
| Author hash and line counts do not affect co-change | two histories differing only in `authorHash` and line counts | equal results, `a.ts → b.ts` 1 | Yes | transcript §1 |
| The documented fixture pairs are persisted | real `git log` of both rebuilt fixtures → `coChangeEdges` → `saveGraph` (pool) → `SELECT` on `edge` | acme-shop: exactly `DiscountService.php → ShippingService.php`, `heuristic`, `git`, 1; task-api: exactly `task.schema.ts → task.service.ts`, `heuristic`, `git`, 0.75 | Yes | transcript §2 |
| Error path (ticket AC 5, `graph-store` validation) | `saveGraph` with a `co_changed` edge whose target is not in `files` | `InvalidGraph` / `INVALID_GRAPH`; stored edge count still 1 | Yes | transcript §3 |

## Evidence

Commands, from the repository root:

```
docker compose ps                      # postgres Up (healthy)
npx tsc --build                        # core dist fresh
node fixtures/build-history.mjs        # acme-shop: 32 commits, task-api: 28 commits
set -a && . ./.env && set +a
npx tsx openspec/changes/co-change-edges/reports/2026-10-01-demo.mts \
  > openspec/changes/co-change-edges/reports/2026-10-01-demo-output.txt   # exit 0
```

Verbatim output: [`./2026-10-01-demo-output.txt`](./2026-10-01-demo-output.txt). Key lines:

```
constants: MIN_CO_CHANGES=2 MAX_FILES_PER_COMMIT=100
PASS | Files changed together form a weighted edge
       observed: [{"source":{"file":"a.ts"},"target":{"file":"b.ts"},"kind":"co_changed","resolution":"heuristic","extractor":"git","weight":0.75}]
...
PASS | The documented fixture pairs are persisted
       observed: {"acme-shop":{"saved":{"files":53,"filesDeleted":0,"symbols":0,"edges":1,"commits":32,"fileCommits":59},"rows":[{"source":"app/Services/DiscountService.php","target":"app/Services/ShippingService.php","kind":"co_changed","resolution":"heuristic","extractor":"git","weight":1}]},"task-api":{"saved":{"files":38,"filesDeleted":0,"symbols":0,"edges":1,"commits":28,"fileCommits":43},"rows":[{"source":"src/schemas/task.schema.ts","target":"src/services/task.service.ts","kind":"co_changed","resolution":"heuristic","extractor":"git","weight":0.75}]}}
PASS | co_changed edge to a file outside `files` is rejected, nothing written
       observed: {"name":"InvalidGraph","code":"INVALID_GRAPH","message":"Invalid graph: edges[0].target: file \"app/Services/ShippingService.php\" is not in the graph","rowsAfter":1}
cleanup: deleted 2 demo projects, 0 left
ALL PASS
```

No screenshots: the change has no browser UI.

## State

- Before: `pgmigrations` 3 rows; `project`, `file`, `edge`, `commit`, `file_commit` 0 rows each;
  fixture `HEAD`s acme-shop `4f028db…`, task-api `8339707…`.
- After: identical counts (0 rows in all five tables); fixture `HEAD`s unchanged.
- Restored: yes — the two demo projects were deleted in `finally` (the schema cascades files, edges,
  commits and links); the driver confirms 0 left and the table counts match the baseline.

## Not demonstrated

- None of the 10 scenarios. CI behaviour of the fixture rebuild on the Ubuntu runner (task 6.2) is
  pending the push, not a scenario of the spec.

## Handoff

**Demonstrably working.** Every scenario of the delta spec was exercised against the real interface
(compiled core, real `git log` of both fixtures, Postgres on pool connections) and matched its THEN
exactly, plus the `saveGraph` error path. No screenshot or other evidence was written at the
repository root; all evidence lives in this `reports/` folder.
