# Demonstration Report — store-graph-write

- Date: 2026-09-30
- Change: store-graph-write (DIS-23)
- Skill: `/show-spec-working`
- Interface: the `StorePort` implementation `createPostgresStore` (built `dist/` of
  `@codemind/core` and `@codemind/adapter-store-postgres`) and the domain `assertValidGraph` /
  `validateGraph`. The change adds no HTTP route, CLI command or UI, so there is no browser workflow
  and Playwright was not used.
- Environment: local `docker compose` Postgres 16 (`codemind-postgres-1`),
  `DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind`, migrations `0001`–`0003`.
- Driver: a scratch script in the session scratchpad (`demo-store.mts`, outside the repo). Synthetic
  data only (fixed hex shas, `author-<sha>` hashes, `demo-sgw-<random>-<n>` project names). Every
  project it creates is deleted in `finally` (the schema cascades files, symbols, edges, commits,
  links, claims and evidence).

## Demonstrated

| # | Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|---|
| 1 | A project is created unindexed | `createProject({ language: 'php', framework: 'laravel' })`, then `SELECT` the row | id returned; `node_count` 0, `edge_count` 0, `indexed_commit`/`indexed_at` null | yes | output #1 |
| 2 | A duplicate project name is rejected | `createProject` with the name of #1 | `ProjectNameTaken` (`PROJECT_NAME_TAKEN`); 1 row with that name, byte-identical | yes | output #2 |
| 3 | Edges connect the saved rows of the same project | `saveGraph` of the sample graph (symbol→symbol, symbol→file, file→symbol, file→file); join every endpoint to its file | all 4 endpoints resolve to the project's stored rows; 0 cross-project edges | yes | output #3 |
| 4 | A first save persists the whole graph | same call, compare result and table counts | result `{files 2, symbols 3, edges 4, commits 2, fileCommits 3}` = stored counts; `pr_number` 7 and weight 0.5 stored | yes | output #4 |
| 5 | An edge without resolution is rejected | `assertValidGraph` with `edges[1].resolution` removed | `InvalidGraph`, one violation `edges[1].resolution` | yes | output #5 |
| 6 | An edge without extractor is rejected | `edges[0].extractor` removed, `edges[2].extractor = ''` | `InvalidGraph`, two violations naming `edges[0]` and `edges[2]` `.extractor` | yes | output #6 |
| 7 | A dangling reference is rejected | edge target symbol `ghost@src/b.ts:99`, file–commit link to sha `d…d` | `InvalidGraph`, two violations naming both references | yes | output #7 |
| 8 | Duplicate keys are rejected | duplicate file `src/a.ts` and symbol `run@src/a.ts:1` | `InvalidGraph`, two violations naming both duplicates | yes | output #8 |
| 9 | Invalid history and span values are rejected | empty sha, `loc` −1, `linesAdded` −1, `linesRemoved` −1, `prNumber` −1, `startLine` 0, `endLine` < `startLine` | `InvalidGraph`, exactly 7 violations, one per value | yes | output #9 |
| 10 | A valid graph passes validation | `validateGraph` / `assertValidGraph` on the sample graph | `[]`, no throw | yes | output #10 |
| 11 | A rejected graph writes nothing | `saveGraph` on the saved project with `edges[0].resolution` removed; full project state before/after | `InvalidGraph` (`edges[0].resolution: is required`); state identical | yes | output #11 |
| 12 | Saving to an unknown project fails | `saveGraph(randomUUID(), sample)` | `ProjectNotFound`; total graph rows 14 → 14 | yes | output #12 |
| 13 | Saving with a malformed project id fails | `saveGraph('not-a-uuid', sample)` | `ProjectNotFound` (`PROJECT_NOT_FOUND`), no `22P02`; rows 14 → 14 | yes | output #13 |
| 14 | A database rejection rolls back the whole write | `saveGraph` of a valid snapshot (plus a new file) with edge weight 1.5 | pg `23514` on `edge_weight_range`; full project state identical (new file not stored) | yes | output #14 |
| 15 | Metadata reflects the saved snapshot | new project (framework `laravel`), snapshot `indexedCommit 'abc123'`, 2 files, 3 symbols, 4 edges | `indexed_commit` `abc123`, `node_count` 5, `edge_count` 4, `indexed_at` ≥ `now()` read before the call; `name`, `root_path`, `language`, `framework`, `is_sample` unchanged | yes | output #15 |
| 16 | A reindex keeps file ids, history and evidence | save, insert claim + evidence citing `src/a.ts` (plain SQL), save same snapshot again | same file id; 2 file–commit links and 1 evidence row still there | yes | output #16 |
| 17 | A changed content hash on reindex marks its claims stale | claim citing `src/b.ts`, snapshot with `src/b.ts` at `h2` | same id, hash `hash-src/b.ts` → `h2`; claim on `b` `stale`, claim on `a` still `current` | yes | output #17 |
| 18 | A file missing from the snapshot is deleted | project with `a` and `b` (symbols, edges, links on `b`), snapshot with only `a` | `filesDeleted` 1; `b`'s file, symbols, edges, links all 0; `a` keeps its id | yes | output #18 |
| 19 | Symbols and edges are replaced by the snapshot | same files, different symbols and edges | symbols exactly `a#boot@20`, `b#assist@30`; edges exactly `[extends]` | yes | output #19 |
| 20 | Commits are upserted and never dropped | save commits `c1, c2`, then `c2, c3` | one row each for `aaaaaaa`, `bbbbbbb`, `ccccccc`; `c2` keeps its id | yes | output #20 |
| 21 | Other projects are untouched | two projects with same paths; save a snapshot without those files to the first | second project's full state identical | yes | output #21 |
| 22 | Saving inside the caller's transaction does not commit it | pool client `BEGIN`, `createPostgresStore({ transaction: client })`, `saveGraph` | 2 files visible in the transaction, 0 from another connection, `txid_current()` unchanged | yes (see note) | output #22 |
| 23 | A failed save leaves the caller's transaction usable | same transaction, `saveGraph` with edge weight 1.5, then a `SELECT` | `23514` raised; following query succeeds and sees the 2 files from before; same txid | yes (see note) | output #23 |
| 24 | Saving on the store's own connections commits | `{ pool }` store, `saveGraph`, read from a separate `pg.Client` | separate client sees 2 files | yes | output #24 |

Note on #22–#23: the spec names the integration harness's per-test transaction (`db()` of
`useTransactionPerTest()`). The demo reproduces the same contract outside Vitest with a pool client
in an open `BEGIN` — the harness's `db()` is exactly that. The harness's own "committed / ended
early" detection is exercised by the Vitest tests of the same names, not by this demo.

## Evidence

### Commands

```
docker compose up -d
docker compose exec -T postgres pg_isready -U codemind -d codemind
DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind npm run db:migrate
npx tsc --build
DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind npx tsx <scratchpad>/demo-store.mts
docker compose exec -T postgres psql -U codemind -d codemind -At -c "<pgmigrations + row counts>"
```

`npm run db:migrate` → `No migrations to run!`. `npx tsc --build` → exit 0.

### Demo output (verbatim, final run; ids as generated)

```
[PASS] #1 A project is created unindexed
       {"id":"f54abeb4-6630-4846-8f65-9f439fe97e5b","name":"demo-sgw-39eb988c-1","root_path":"/demo/1","language":"php","framework":"laravel","is_sample":false,"indexed_commit":null,"indexed_at":null,"node_count":0,"edge_count":0}
[PASS] #2 A duplicate project name is rejected
       {"error":{"name":"ProjectNameTaken","code":"PROJECT_NAME_TAKEN","message":"Project name already taken: demo-sgw-39eb988c-1"},"rowsWithName":1,"unchanged":true}
[PASS] #3 Edges connect the saved rows of the same project
       {"edges":[{"kind":"imports","src":"symbol","tgt":"file"},{"kind":"tested_by","src":"file","tgt":"symbol"},{"kind":"co_changed","src":"file","tgt":"file"},{"kind":"calls","src":"symbol","tgt":"symbol"}],"crossProjectEdges":0}
[PASS] #4 A first save persists the whole graph
       {"result":{"files":2,"filesDeleted":0,"symbols":3,"edges":4,"commits":2,"fileCommits":3},"stored":{"files":2,"symbols":3,"edges":4,"commits":2,"fileCommits":3}}
[PASS] #5 An edge without resolution is rejected
       {"code":"INVALID_GRAPH","violations":[{"element":"edges[1]","field":"resolution","message":"is required"}]}
[PASS] #6 An edge without extractor is rejected
       {"code":"INVALID_GRAPH","violations":[{"element":"edges[0]","field":"extractor","message":"is required and must not be empty"},{"element":"edges[2]","field":"extractor","message":"is required and must not be empty"}]}
[PASS] #7 A dangling reference is rejected
       {"code":"INVALID_GRAPH","violations":[{"element":"edges[0]","field":"target","message":"symbol \"ghost\" at src/b.ts:99 is not in the graph"},{"element":"fileCommits[3]","field":"sha","message":"commit \"dddddddddddddddddddddddddddddddddddddddd\" is not in the graph"}]}
[PASS] #8 Duplicate keys are rejected
       {"code":"INVALID_GRAPH","violations":[{"element":"files[2]","field":"path","message":"duplicate file path \"src/a.ts\""},{"element":"symbols[3]","message":"duplicate symbol \"run\" at src/a.ts:1"}]}
[PASS] #9 Invalid history and span values are rejected
       {"code":"INVALID_GRAPH","count":7,"violations":[{"element":"files[0]","field":"loc","message":"must not be negative (got -1)"},{"element":"symbols[3]","field":"startLine","message":"must be at least 1 (got 0)"},{"element":"symbols[4]","field":"endLine","message":"must not be before startLine (got 5 < 10)"},{"element":"commits[0]","field":"prNumber","message":"must not be negative (got -1)"},{"element":"commits[2]","field":"sha","message":"must not be empty"},{"element":"fileCommits[0]","field":"linesAdded","message":"must not be negative (got -1)"},{"element":"fileCommits[0]","field":"linesRemoved","message":"must not be negative (got -1)"}]}
[PASS] #10 A valid graph passes validation
       {"violations":[],"assertThrew":false}
[PASS] #11 A rejected graph writes nothing
       {"error":{"name":"InvalidGraph","code":"INVALID_GRAPH","message":"Invalid graph: edges[0].resolution: is required"},"stateUnchanged":true}
[PASS] #12 Saving to an unknown project fails
       {"projectId":"3bcf3946-dcf0-457d-a5f8-6e0c33a96ef8","error":{"name":"ProjectNotFound","code":"PROJECT_NOT_FOUND","message":"Project not found: 3bcf3946-dcf0-457d-a5f8-6e0c33a96ef8"},"rowsBefore":"14","rowsAfter":"14"}
[PASS] #13 Saving with a malformed project id fails
       {"error":{"name":"ProjectNotFound","code":"PROJECT_NOT_FOUND","message":"Project not found: not-a-uuid"},"rowsBefore":"14","rowsAfter":"14"}
[PASS] #14 A database rejection rolls back the whole write
       {"error":{"name":"error","code":"23514","constraint":"edge_weight_range","message":"new row for relation \"edge\" violates check constraint \"edge_weight_range\""},"stateUnchanged":true}
[PASS] #15 Metadata reflects the saved snapshot
       {"indexed_commit":"abc123","node_count":5,"edge_count":4,"indexed_at":"2026-09-30T09:13:17.184Z","callStart":"2026-09-30T09:13:17.161Z","framework":"laravel","name":"demo-sgw-39eb988c-2","is_sample":false}
[PASS] #16 A reindex keeps file ids, history and evidence
       {"fileIdBefore":"934b3e68-47aa-4e85-8e8e-8ba064adee64","fileIdAfter":"934b3e68-47aa-4e85-8e8e-8ba064adee64","fileCommitLinks":2,"evidenceRows":1,"claimStatus":"current"}
[PASS] #17 A changed content hash on reindex marks its claims stale
       {"hashBefore":"hash-src/b.ts","hashAfter":"h2","sameId":true,"claims":[{"predicate":"cites-a","status":"current"},{"predicate":"cites-b","status":"stale"}]}
[PASS] #18 A file missing from the snapshot is deleted
       {"result":{"files":1,"filesDeleted":1,"symbols":1,"edges":0,"commits":1,"fileCommits":1},"remainingOfB":{"file":0,"symbols":0,"edges":0,"file_commits":0},"aKeptId":true}
[PASS] #19 Symbols and edges are replaced by the snapshot
       {"symbols":["src/a.ts#boot@20","src/b.ts#assist@30"],"edges":["extends"]}
[PASS] #20 Commits are upserted and never dropped
       {"commits":[{"sha":"aaaaaaa","n":1},{"sha":"bbbbbbb","n":1},{"sha":"ccccccc","n":1}],"c2KeptId":true}
[PASS] #21 Other projects are untouched
       {"p1":{"files":1,"symbols":0,"edges":0,"commits":2,"fileCommits":0},"p2":{"files":2,"symbols":3,"edges":4,"commits":2,"fileCommits":3},"p2Unchanged":true}
[PASS] #22 Saving inside the caller's transaction does not commit it
       {"filesVisibleInTx":2,"txidBefore":"11498","txidAfter":"11498","filesVisibleFromOtherConnection":0}
[PASS] #23 A failed save leaves the caller's transaction usable
       {"failure":{"name":"error","code":"23514","constraint":"edge_weight_range","message":"new row for relation \"edge\" violates check constraint \"edge_weight_range\""},"followingQueryError":null,"filesSeenAfterFailure":2,"sameTxid":true}
[PASS] #24 Saving on the store's own connections commits
       {"filesSeenFromSeparateClient":2}

cleanup: deleted 10 demo projects (prefix demo-sgw-39eb988c)
cleanup: demo projects left = 0

SUMMARY: 24/24 PASS
```

A first run (prefix `demo-sgw-7e631338`) was also 24/24 PASS; its #11 input dropped the graph's
files as well as the edge's `resolution`, so the rejection listed extra violations. The input was
narrowed to the edge's `resolution` alone, to match the scenario's WHEN exactly, and the whole
script was re-run (output above). Both runs cleaned up their projects.

Screenshots: none (no UI in this change).

## State

- Before: `pgmigrations` = `0001_graph-l1, 0002_history-claims, 0003_indexes-stale`; `project` 0,
  `file` 0, `symbol` 0, `edge` 0, `commit` 0, `file_commit` 0, `claim` 0, `evidence` 0.
- After: `pgmigrations` = `0001_graph-l1, 0002_history-claims, 0003_indexes-stale`; `project` 0,
  `file` 0, `symbol` 0, `edge` 0, `commit` 0, `file_commit` 0, `claim` 0, `evidence` 0.
- Restored: yes. Each run deleted its 10 `demo-sgw-*` projects in `finally` (cascade); the
  caller-owned transaction of #22–#23 was rolled back; counts re-checked with `psql` and equal the
  baseline. The Postgres container was left running (it was started for this demo).

## Not demonstrated

- Nothing of the 24 scenarios is missing.
- #22–#23 were exercised on an equivalent caller-owned transaction, not through the Vitest
  harness object itself; the harness's "ended early" detection is covered by the integration tests
  of the same names (`tests/integration/store/graph-write.spec.ts`).

## Handoff

The change is **demonstrably working**: all 24 scenarios of `specs/graph-store/spec.md` were run
against the real adapter on the real Postgres and each THEN held, including every error path
(`ProjectNameTaken`, `ProjectNotFound` for unknown and malformed ids, `InvalidGraph` with named
violations, database rejection with full rollback, failure inside a caller-owned transaction). The
database is back to its baseline. No screenshot or other file was written at the repository root.
