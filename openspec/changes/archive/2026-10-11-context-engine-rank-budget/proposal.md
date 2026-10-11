## Why

The Context Engine (CM-HU-08, DIS-19) must send the model only the code a question needs, inside a
token budget, and say how much the whole files would have cost. DIS-27 left the first half: an
anchor and its graph neighbourhood, unordered, with no text and no cost bound. Nothing yet ranks the
candidates, reads their code, counts tokens or answers `no-anchor`, so DIS-39 (`explain`) has no
context to prompt with and DIS-74 has no `baselineTokens` to show the saving. This is DIS-28
(CM-HU-08.2). It also takes DIS-27's hand-off B: today the work a single question costs has no
upper bound (uncapped terms and anchors, and a traversal that enumerates paths instead of nodes).

## What Changes

- **Context pack** (`packages/core/src/context/context-pack.ts`, new): `buildContextPack` anchors
  the question, expands it, ranks the candidates, reads their code from git at the project's
  `indexedCommit`, redacts secrets, cuts spans and fits them to `tokenBudget` (integer 1000..32000,
  8000 by default; `hops` 1..3, 2 by default). It returns `status: 'ok'` with ordered spans, `tokens`,
  `baselineTokens`, `omitted` and the declared `estimator`, or `status: 'empty'` with reason
  `no-anchor` (no anchor: no traversal, no project read, no git read) or `over-budget` (no span fits).
- **Ranking** (`rank.ts`, new): a lexicographic, explainable order with no weights: distance, then
  origin (`anchor` < `exact` < `heuristic`), then file kind (`test` < `source` < `doc` < `config`),
  then lexical match of name or path with a question term, then traversal order.
- **Token budget** (`budget.ts`, new): atomic spans, greedy with skip (a span that does not fit is
  skipped, never truncated); spans of one file never overlap (a contained candidate is dropped, a
  containing one replaces what it contains). The budget is never exceeded.
- **Token estimate** (`tokenizer.ts`, new): local `ceil(code points / 4)`, declared as
  `estimator: 'chars-div-4'` on every pack (PH-16).
- **Reading one file at a commit** (`SourceTreePort.readFileAt(root, commit, path)`, new, and its git
  adapter): committed content only, same size and UTF-8 limits as `readFiles`, never executes
  anything from the repository. New domain error `SourceUnavailable`.
- **Graph reads** (`StorePort`): every traversal result carries `resolution` (`exact` when some
  minimum-distance path uses only `exact` edges), every symbol result carries `fileKind`; the
  traversal deduplicates by node and depth, so its work is bounded by 2·(hops+1)·nodes rows.
- **Anchoring caps** (`anchor.ts`): at most `MAX_QUESTION_TERMS` searches and `MAX_ANCHORS` anchor
  symbols per question.
- New root devDependency `fast-check` for the budget's property test.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `context-engine`: ADDED "Candidate ranking", "Token estimate", "Token budget" and "Context pack";
  MODIFIED "Lexical anchoring" (caps on terms and anchors).
- `graph-store`: MODIFIED "Symbol search by name" (the file kind) and "Bounded neighbour traversal"
  (path resolution and bounded work).
- `repository-indexing`: ADDED "Reading one file at a commit".

## Non-goals

- Prompt, sanitisation, model call and `UNKNOWN`: DIS-39 and CM-HU-09.5.
- Persisting `baseline_tokens` or `savingsPct` in `query_log`: DIS-74.
- Measuring the estimator against the provider's count: CM-HU-22.2 (Table 1).
- Embeddings and semantic anchoring (PH-03, CM-HU-19), question-type classification, a trigram index
  on `symbol.name`, and any HTTP route, CLI command or Zod schema.
- Computing `workspaceRoot` in the API composition root: DIS-39.
- A hosted demo without the samples' `.git`: it yields `SourceUnavailable`; fixing it is deployment.
- `StorePort.readSpan` (DIS-68 planning): the store holds no content; DIS-68 should reuse
  `readFileAt`. Only noted here.

## Scope notes (sub-issue vs parent)

DIS-28 records author decisions 1–9 (2026-10-10) that refine the parent DIS-19 without widening it:
the `no-anchor` result keeps the parent's `{ spans: [], reason: 'no-anchor' }` and adds `status`;
"ranking = lexical + graph" is the lexicographic key above; the parent's local tokenizer is the
declared character estimate PH-16 allows; DIS-27's hand-off B (bounded cost) enters here.

## Impact

- **Core**: `knowledge/graph-read.ts` (`Neighbor.resolution`, `StoredSymbol.fileKind`),
  `knowledge/errors.ts` (`SourceUnavailable`), `ports/SourceTreePort.ts` (`readFileAt`),
  `context/anchor.ts` (caps), new `context/{tokenizer,rank,budget,context-pack}.ts`. Names must not
  collide with `llm/budget.ts` (both exported with `export *` from `packages/core/src/index.ts`).
- **Adapters**: `store-postgres/src/queries.ts` (`NEIGHBORS`, `FIND_SYMBOLS`) and `postgres-store.ts`;
  `adapters/git/src/git-source-tree.ts` (`readFileAt`). No migration.
- **Seed**: `packages/core/src/knowledge`, `packages/adapters/store-postgres/src` and
  `packages/adapters/git/src` are analyzer-fingerprint inputs, so `npm run seed:build` regenerates
  the `analyzer-fingerprint` header of `seeds/graph-dump.sql`; no row may change.
- **Tests**: doubles `tests/support/in-memory-store.ts` (updated) and
  `tests/support/in-memory-source-tree.ts` (new); unit specs under `tests/unit/context/`;
  integration `tests/integration/{store/graph-read,git/git-source-tree,context/context-pack}.spec.ts`.
- **Docs**: ADR "span text is read from git at the indexed commit" (`/adr-new`);
  `docs/project-context.md` (Context Engine); readme §2.2/§3.2 (declared estimator). Commands as in
  `docs/project-context.md` → Commands.
- **Privacy / security**: code, and possibly secrets, travel towards the model: every span is
  redacted before counting, and neither the question nor span text is logged (`/privacy-ethics-check`).
- **Dependencies**: `fast-check` (devDependency of the root, reviewed with `/privacy-ethics-check`).
