## Why

The Context Engine (CM-HU-08, DIS-19) must send the model only what a question needs, guided by the
graph. Its first half has no code yet: nothing turns a natural-language question into graph nodes,
and `StorePort.neighbors` only walks edges from source to target, so a symbol cannot reach the doc
that `describes` it, its callers, or a `co_changed` file in the reverse direction. This is DIS-27
(CM-HU-08.1): lexical anchoring, graph expansion in both directions and an in-memory `StorePort`
double, so that DIS-28 (ranking, token budget, `no-anchor`) starts from a candidate set grounded in
the code instead of whole files. It depends only on DIS-24 (graph reads, done).

## What Changes

- **Lexical anchoring** (`packages/core/src/context/anchor.ts`, new): `questionTerms(question)`
  normalises the question (lower case, diacritics removed, split on anything that is not a letter
  or a digit), drops tokens under 3 letters and ES/EN stopwords, and deduplicates.
  `anchor(store, projectId, question)` calls `findSymbols` with each term and, for terms of 6 or more
  letters, also with its 5-letter prefix (questions are in Spanish, identifiers in English); the
  anchor is the union of the results, deduplicated by symbol id. Anchoring is by name only.
- **Graph expansion** (`packages/core/src/context/expand.ts`, new): `expand(store, projectId,
  anchors, hops)` seeds one symbol per anchor and one file per distinct `fileId`, and makes one
  `neighbors` call with `direction: 'both'` and kinds `calls`, `tested_by`, `describes`,
  `co_changed`. It returns the neighbours (symbols and files) with their minimum distance, in the
  port's order; filtering them is DIS-28's ranking.
- **Traversal direction in the port** (`StorePort.neighbors`): new optional argument
  `direction: 'out' | 'in' | 'both'`, `'out'` by default (backwards compatible). Postgres implements
  it in the same single recursive statement; an invalid direction fails with `InvalidStoreQuery`
  (new argument `direction`) before querying. DIS-89 (`impact`) will reuse `'in'`.
- **`fileId` on `StoredSymbol`**: every symbol returned by `findSymbols` or `neighbors` carries the id
  of its file, so expansion can seed files (the only way to reach `co_changed`, which goes file to
  file). Same validity rule as `StoredFile.id`.
- **In-memory double** (`tests/support/in-memory-store.ts`, new) implementing the read side of
  `StorePort`, plus a real subset of the acme-shop graph (`tests/support/acme-shop-graph.ts`) checked
  against `seeds/graph-dump.sql` by a coherence test.

## Capabilities

### New Capabilities

- `context-engine`: turning a question into anchor symbols of one project and expanding them over
  the graph into a candidate set (lexical anchoring and bounded two-way expansion).

### Modified Capabilities

- `graph-store`: "Bounded neighbour traversal" gains the traversal direction (`out` by default,
  `in`, `both`); "Symbol search by name" and "Validity of ids returned by reads" make symbol results
  carry their file id; "Validation of read arguments" rejects an invalid direction.

## Non-goals

- Ranking, token budget, tokenizer, `baselineTokens` and the `no-anchor` answer: DIS-28
  (CM-HU-08.2). Here an empty anchor is just `[]`.
- Embeddings and semantic anchoring (PH-03, CM-HU-19): «cupones» stays unanchored.
- Searching by signature: `findSymbols` does not search `signature`, so anchoring is by name only.
- The `impact` use case (DIS-89), which only reuses `direction: 'in'`.
- A shared contract suite run against both Postgres and the double.
- Any HTTP route, CLI command or Zod schema: nothing here is exposed to a user.

## Scope notes (sub-issue vs parent)

DIS-27 records closed author decisions (2026-10-10) that refine the parent DIS-19:

- The double lives in `tests/support/`, not `packages/core/src/testing/` (outside Stryker's `mutate`
  and core's `dist`).
- Expansion returns files as well as symbols (the doc reached by `describes` is a file node); the
  parent's "only symbols" in its expansion criterion is left to DIS-28's ranking.
- The parent's "lexical match on name/signature" becomes name only (non-goal above).

## Impact

- **Core**: `packages/core/src/ports/StorePort.ts` (signature and JSDoc of `neighbors`),
  `knowledge/graph-read.ts` (`TraversalDirection`, `StoredSymbol.fileId`), `knowledge/read-arguments.ts`
  (`assertValidTraversal` checks `direction`), `knowledge/errors.ts` (`StoreQueryArgument` gains
  `direction`), new `context/` module exported from `packages/core/src/index.ts`.
- **Store adapter**: `packages/adapters/store-postgres/src/queries.ts` (`FIND_SYMBOLS` and
  `NEIGHBORS` select the file id; `NEIGHBORS` follows edges by direction as a parameter) and
  `postgres-store.ts`.
- **Seed**: `packages/core/src/knowledge` and `packages/adapters/store-postgres/src` are analyzer
  fingerprint inputs, so `npm run seed:build` must regenerate `seeds/graph-dump.sql`; only its
  `analyzer-fingerprint` header may change. No migration, so the contract fingerprint stays.
- **Tests**: integration `tests/integration/store/graph-read.spec.ts`; new unit specs under
  `tests/unit/context/` and `tests/unit/store/`.
- **Docs**: `docs/project-context.md` (Context Engine and the double). Commands as in
  `docs/project-context.md` → Commands.
- **Privacy / logging**: no personal data. The question is user text; it is never logged and leaves
  the process only as `findSymbols` search terms against the local database.
- **Dependencies**: none new.
