# Manual Interface Testing Report

- Date: 2026-10-01
- Change: co-change-edges
- Step: 9 — Manual Interface Testing (tasks.md group 5)

The interface is the exported core function `coChangeEdges` plus the existing `StorePort.saveGraph`
(no HTTP route or CLI command exists for it). Exercised with a scratch script in the session
scratchpad (outside the repository), run with `npx tsx` after `npx tsc --build`, against the local
Postgres (`docker compose`, `DATABASE_URL` from `.env`) and both fixtures rebuilt by
`node fixtures/build-history.mjs`. Salt: a scratch value; no name or e-mail is printed.

## Commands executed

- `npx tsc --build`
- `npx tsx <scratchpad>/manual.mts`
- DB indicators before and after: `SELECT count(*)` of `pgmigrations`, `project`, `file`, `edge`,
  `commit`, `file_commit`

## 5.2 Success path

```
acme-shop commits 32 non-merge commits with links 32 edges 1
   app/Services/DiscountService.php -> app/Services/ShippingService.php co_changed heuristic git 1
task-api commits 28 non-merge commits with links 28 edges 1
   src/schemas/task.schema.ts -> src/services/task.service.ts co_changed heuristic git 0.75
```

Matches `fixtures/README.md` (one documented pair per fixture) and the expected weights (1, 0.75).

## 5.3 Mutating path (pool connection, real commits)

```
save 1 {"files":53,"filesDeleted":0,"symbols":0,"edges":1,"commits":32,"fileCommits":59}
rows [{"source":"app/Services/DiscountService.php","target":"app/Services/ShippingService.php","resolution":"heuristic","extractor":"git","weight":1}]
save 2 {"files":53,"filesDeleted":0,"symbols":0,"edges":1,"commits":32,"fileCommits":59}
rows after re-save 1
```

Re-saving the same snapshot replaces the edges: still exactly one `co_changed` row.

## 5.4 Error and edge cases

```
rejected: InvalidGraph INVALID_GRAPH Invalid graph: edges[0].target: file "app/Services/ShippingService.php" is not in the graph
rows after rejected save 1
empty history -> []
```

Edges computed with `knownPaths` wider than `files` are rejected by `saveGraph` before writing; the
stored edge is untouched. An empty history yields `[]`.

## Restoration

```
left in file 0
left in edge 0
left in commit 0
```

The project was deleted in `finally`; the schema cascaded its rows.

## Data state verification

- Before: `pgmigrations` 3; `project`, `file`, `edge`, `commit`, `file_commit` 0 each
- After: identical
- State restored: Yes
- Scratch script deleted after the run.

## Outcome

- Status: PASS
- Blocking issues: none
