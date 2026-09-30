# Manual Interface Testing Report

- Date: 2026-09-29
- Change: store-graph-write
- Step: 9 — Backend: Manual Interface Testing (agent executed)

## Interface and environment

The interface is the `StorePort` implementation (`createPostgresStore`); the change adds no HTTP route
or CLI command. It was driven in `{ pool }` mode (the store's own connections, committing) by a scratch
script in the session scratchpad (`manual-store.mts`, not in the repo, deleted afterwards), against the
local `docker compose` Postgres. Synthetic data only (fixed shas, `author-synthetic`).

- Pre-test state: `project` 0, `file` 0, `symbol` 0, `edge` 0, `commit` 0, `file_commit` 0, `claim` 0,
  `evidence` 0 (step 8 indicators).

## Commands executed

- `npx tsc --build` (the script resolves `@codemind/core` through `node_modules` → `dist/`)
- `DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind npx tsx <scratchpad>/manual-store.mts`
- `docker compose exec -T postgres psql -U codemind -d codemind -At -c "<counts>"`

## Output (verbatim, ids as generated)

```
createProject -> 940ed965-80e7-4b32-9f1b-4dc31b32d3ad
saveGraph #1: OK {"files":3,"filesDeleted":0,"symbols":3,"edges":2,"commits":1,"fileCommits":2}
counts after #1 {"file":3,"symbol":3,"edge":2,"commit":1,"file_commit":2,"project":{"framework":"laravel","indexed_commit":"1111111111111111111111111111111111111111","node_count":6,"edge_count":2,"indexed":true}}
files after #1 [{"path":"app/Services/PriceCalculator.php","id":"9876af30-9676-44e6-9806-332daa99340a","content_hash":"h-price-1"},{"path":"app/Services/TaxService.php","id":"a4094348-8ed4-4b58-8cd6-1da166373567","content_hash":"h-tax-1"},{"path":"tests/Unit/PriceCalculatorTest.php","id":"a1d0e337-5bb3-4c9b-a7a7-1ad4b9abfdd3","content_hash":"h-test-1"}]
saveGraph #2: OK {"files":2,"filesDeleted":1,"symbols":2,"edges":1,"commits":1,"fileCommits":1}
counts after #2 {"file":2,"symbol":2,"edge":1,"commit":2,"file_commit":2,"project":{"framework":"laravel","indexed_commit":"2222222222222222222222222222222222222222","node_count":4,"edge_count":1,"indexed":true}}
files after #2 [{"path":"app/Services/PriceCalculator.php","id":"9876af30-9676-44e6-9806-332daa99340a","content_hash":"h-price-2"},{"path":"tests/Unit/PriceCalculatorTest.php","id":"a1d0e337-5bb3-4c9b-a7a7-1ad4b9abfdd3","content_hash":"h-test-1"}]
unknown project: ProjectNotFound code=PROJECT_NOT_FOUND — Project not found: 40ffeba4-1edc-4022-9304-0f736865e527
non-UUID id: ProjectNotFound code=PROJECT_NOT_FOUND — Project not found: not-a-uuid
duplicate name: ProjectNameTaken code=PROJECT_NAME_TAKEN — Project name already taken: manual-store-ca4ccec1-02ff-4cfd-943c-532f868f4d05
edge without resolution: InvalidGraph code=INVALID_GRAPH — Invalid graph: edges[0].resolution: is required
edge weight 1.5: error code=23514 constraint=edge_weight_range — new row for relation "edge" violates check constraint "edge_weight_range"
counts after errors (must equal #2) {"file":2,"symbol":2,"edge":1,"commit":2,"file_commit":2,"project":{"framework":"laravel","indexed_commit":"2222222222222222222222222222222222222222","node_count":4,"edge_count":1,"indexed":true}}
restored: project rows left = 0
```

## Checks

- 9.2 Success path: `createProject` returned an id; the first snapshot stored 3 files, 3 symbols,
  2 edges, 1 commit, 2 file–commit links, matching the graph; `node_count` 6 (3 + 3), `edge_count` 2,
  `indexed_commit` set, `framework` `laravel` as created.
- 9.3 Mutating path (second snapshot drops `TaxService.php`, changes the hash of `PriceCalculator.php`,
  adds commit `2…2`):
  - `PriceCalculator.php` and the test file kept their ids; the hash became `h-price-2`;
  - `TaxService.php` was deleted (`filesDeleted` 1) with its symbol and its `file_commit` (cascade);
  - commits went 1 → 2 (the first one kept); links: `(PriceCalculator, 1…1)` kept, `(PriceCalculator, 2…2)`
    added, `(TaxService, 1…1)` gone with its file → 2;
  - `framework` unchanged; `node_count` 4, `edge_count` 1, `indexed_commit` `2…2`.
- 9.4 Error cases: unknown UUID and `not-a-uuid` → `ProjectNotFound`; duplicate name →
  `ProjectNameTaken`; edge without `resolution` → `InvalidGraph` naming `edges[0].resolution`; edge
  weight 1.5 → database error `23514` on `edge_weight_range`. Counts after the errors are identical to
  those after the second snapshot: none of the failed calls wrote anything.
- Restoration: the project was deleted in `finally` (the schema cascades files, symbols, edges,
  commits, links); 0 project rows left with that name.

## Data state verification

- Post-test state: `project` 0, `file` 0, `symbol` 0, `edge` 0, `commit` 0, `file_commit` 0, `claim` 0,
  `evidence` 0 — equal to the pre-test state.
- State restored: Yes. The scratch script was deleted.

## Outcome

- Status: PASS
- Blocking issues: none
