# Manual Interface Testing Report

- Date: 2026-09-30
- Change: store-graph-read
- Step: 9 — Backend: Manual Interface Testing (agent executed)

## Interface and environment

The interface is the `StorePort` implementation (`createPostgresStore`); the change adds no HTTP route
or CLI command. It was driven in `{ pool }` mode (the store's own connections, committing) by a
scratch script in the session scratchpad (`manual-read.mts`, not in the repo, deleted afterwards),
against the local `docker compose` Postgres. Synthetic data only.

Graph saved to two projects (`…-alpha`, `…-beta`, same content): files
`app/Services/PriceCalculator.php` (source), `tests/Unit/PriceCalculatorTest.php` (test),
`docs/pricing.md` (doc); symbols `compute`, `applyDiscount`, `testCompute`; edges
`compute calls applyDiscount`, `applyDiscount calls compute` (cycle), `compute tested_by testCompute`,
`testCompute imports file docs/pricing.md`.

- Pre-test state: `project` 0, `file` 0, `symbol` 0, `edge` 0 (step 8 indicators).

## Commands executed

- `npx tsc --build` (the script imports the adapter's `dist/` and `pg` by absolute path, because the
  scratchpad is outside the workspace)
- `DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind npx tsx <scratchpad>/manual-read.mts`
- `docker compose exec -T postgres psql -U codemind -d codemind -tAc "<counts>"`

## Output (verbatim, ids as generated)

```
getProject(alpha) {"id":"88c087b1-9c46-4801-b99a-e8ced8b99945","name":"manual-read-f4549bd8-alpha","rootPath":"/repos/manual","language":"php","framework":"laravel","isSample":false,"indexedCommit":"1111111111111111111111111111111111111111","indexedAt":"2026-09-30T15:30:14.860Z","nodeCount":6,"edgeCount":4,"createdAt":"2026-09-30T15:30:14.817Z"}
listProjects (ours) [["manual-read-f4549bd8-alpha",6,4],["manual-read-f4549bd8-beta",6,4]]
findSymbols(alpha, "COMP") [{"id":"1d754c02-3d77-45c1-b24b-633523542c87","file":"app/Services/PriceCalculator.php","name":"compute","startLine":10,"endLine":14,"kind":"method"},{"id":"f45df9c6-0994-4518-91e5-ecc1b9fc2ab3","file":"tests/Unit/PriceCalculatorTest.php","name":"testCompute","startLine":5,"endLine":9,"kind":"method"}]
findSymbols(alpha, "compute", kinds=[class]) []
neighbors(alpha, compute, 1) ["applyDiscount@1","testCompute@1"]
neighbors(alpha, compute, 2) ["applyDiscount@1","testCompute@1","file:docs/pricing.md@2"]
neighbors(alpha, compute, 3) ["applyDiscount@1","testCompute@1","file:docs/pricing.md@2"]
neighbors(alpha, compute, 3, [calls]) ["applyDiscount@1"]
beta compute id differs from alpha true
neighbors(alpha, seed = beta compute, 3) (isolation) []
neighbors(beta, beta compute, 3) ids all in beta ["b359902a-3000-4c63-808b-9387481a3d8a","55007286-771f-4fea-97d9-f07a7b5b97c0","660636ad-950f-4363-831f-ff5dac627d1e"]
after reindex: same SymbolRef ["app/Services/PriceCalculator.php","compute",10]
after reindex: old id as seed []
after reindex: new id as seed ["applyDiscount@1","testCompute@1","file:docs/pricing.md@2"]
getProject(unknown): ProjectNotFound code=PROJECT_NOT_FOUND — Project not found: f6877979-2892-4907-90a0-30e95438025a
getProject(not-a-uuid): ProjectNotFound code=PROJECT_NOT_FOUND — Project not found: not-a-uuid
findSymbols(unknown): ProjectNotFound code=PROJECT_NOT_FOUND — Project not found: f6877979-2892-4907-90a0-30e95438025a
findSymbols(not-a-uuid): ProjectNotFound code=PROJECT_NOT_FOUND — Project not found: not-a-uuid
neighbors(unknown): ProjectNotFound code=PROJECT_NOT_FOUND — Project not found: f6877979-2892-4907-90a0-30e95438025a
neighbors(not-a-uuid): ProjectNotFound code=PROJECT_NOT_FOUND — Project not found: not-a-uuid
findSymbols blank term: InvalidStoreQuery code=INVALID_STORE_QUERY — Invalid store query: name must not be blank
findSymbols empty kinds: InvalidStoreQuery code=INVALID_STORE_QUERY — Invalid store query: kinds must not be empty when given
neighbors hops 0: InvalidStoreQuery code=INVALID_STORE_QUERY — Invalid store query: hops must be an integer from 1 to 3 (got 0)
neighbors hops 4: InvalidStoreQuery code=INVALID_STORE_QUERY — Invalid store query: hops must be an integer from 1 to 3 (got 4)
neighbors empty kinds: InvalidStoreQuery code=INVALID_STORE_QUERY — Invalid store query: kinds must not be empty when given
restored: project rows left = 0
```

## Checks

- Success path (9.2): `getProject` returns the metadata of the saved snapshot (`node_count` 6 =
  3 files + 3 symbols, `edge_count` 4); `listProjects` lists both projects in name order;
  `findSymbols("COMP")` is case-insensitive and carries `file` / `name` / `startLine`; the kind
  filter narrows to nothing for `class`; `neighbors` grows with `hops` and stops at the graph's end
  (3 hops = 2 hops here), the `calls ↔ calls` cycle yields `applyDiscount` once, the traversal
  crosses into a file node (`docs/pricing.md` at distance 2), and `kinds=[calls]` follows only
  `calls`. The beta project's `compute` used as a seed in alpha reaches nothing (isolation).
- Reindex path (9.3): after saving the same snapshot again, `compute` has the same `SymbolRef`,
  its old id as seed returns `[]`, and the new id returns the same neighbours. Both projects were
  then deleted (`restored: project rows left = 0`).
- Error cases (9.4): unknown and malformed project id on each read → `ProjectNotFound`
  (`PROJECT_NOT_FOUND`); blank term, empty kinds (search and traversal), `hops` 0 and 4 →
  `InvalidStoreQuery` (`INVALID_STORE_QUERY`) naming the argument.
- Post-test state (9.6): `project` 0, `file` 0, `symbol` 0, `edge` 0 — equal to the pre-test state.

## Outcome

- Status: PASS
- Scratch script deleted: yes
