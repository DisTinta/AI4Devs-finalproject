## Context

See `proposal.md` → Why. Current state the approach builds on (reality map of DIS-67, checked on
`final-project-CRN` after the merge of DIS-82):

- `explain()` (`packages/core/src/explain/explain.ts`) runs `answerQuestion` over the metered model
  (`meterLlm`, which counts `complete` only and passes `embed` through). Inside it: anchor → exact
  lookup (`findCacheEntry` + `parseStoredResponse` + `touchCacheEntry`, DIS-21) → `llm.mode ===
  'evaluation'` → pack → … `finish` saves a cacheable answer (`saveCache` → `saveCacheEntry`) and the
  `query_log` row. Events are a closed union (`explain-event.ts`), returned, never logged by core; the
  API and the CLI log every event at `info`.
- `StorePort` has `findCacheEntry`, `saveCacheEntry` (delete + insert under an advisory lock, embedding
  always `NULL`), `touchCacheEntry`, `invalidateCache`; checks live in
  `packages/core/src/knowledge/cache-entry.ts`; the Postgres SQL in
  `packages/adapters/store-postgres/src/queries.ts`; the double in `tests/support/in-memory-store.ts`,
  wrapped by `doubles()` of `tests/support/explain-doubles.ts`, which records store calls in `order`.
- `EMBEDDING_DIMENSIONS = 1536` (`packages/core/src/llm/embedding-dimensions.ts`) matches the three
  `vector(1536)` columns (`0001_graph-l1`, `0002_history-claims`) and their HNSW `vector_cosine_ops`
  indexes (`0003_indexes-stale`). No code writes any embedding; the seed dump holds none.
- The live model is `withDailyBudget(openAiCompatibleLlm)`; the budget wrapper already checks the
  ceiling before `embed`. The adapter rejects a vector of another length with
  `LlmUnavailable('dimension-mismatch')` and, without `LLM_EMBED_MODEL`, with `not-configured`.
- The test model `createScriptedLlm` (`tests/support/scripted-llm.ts`) has an `embed` that throws a
  plain `Error('not used by explain')`; no explain-level test configures an embedding model.

## Goals / Non-Goals

**Goals:** the similarity step of `semantic-cache` at one point of `answerQuestion`, with one embedding
request per call at most; a store call that finds the most similar entry of a project exactly; the
embedding kept with every live cacheable answer; the free reference model (`nomic-embed-text`, 768)
usable; every existing explain test unchanged in what it asserts (only the call-count objects gain the
new counter).

**Non-Goals (design level):** no new port (the similarity decision is a pure core module over
`LlmPort` and `StorePort`); no change to `meterLlm`, `withDailyBudget`, the adapter's code, the API or
the CLI; no use of the HNSW index for the cache lookup (see S3); no seed or golden vectors (DIS-69).

## Decisions

Decisions D1–D12 come from the enrich step (Linear DIS-67, description "[enhanced]", agent's text)
and apply as written there, except D7, refined by S1. S1–S12 are taken in this proposal. *Agent's
text: decided as lead engineer in an autonomous run, without the author.*

**S1. A missing embedding model skips silently; other failures add the event (refines D7).** The ticket
listed `not-configured` among the failures that add `semantic_cache_skipped`. Rejected: without
`LLM_EMBED_MODEL` (the documented default of `.env.example` and the state of every live test) every
live answer would carry the event, which is noise, not a degradation, and would change the exact
events of dozens of existing tests. A missing embedding model is configuration, like evaluation mode,
which adds no event either. The event keeps its purpose: a configured embedding model that failed
(`network`, `timeout`, `http-status`, `invalid-response`, `dimension-mismatch`, an unusable vector →
`embedding-unavailable`) or a spent budget (`budget-exhausted`). Alternative considered: one event code
`not-configured`; rejected for the same noise.

**S2. Only `LlmUnavailable` and `BudgetExhausted` degrade; any other error propagates.** Same rule as a
`verify` call (`evidence-verification`): the port reports every failure as `LlmUnavailable`, so
another error is a defect and must not be hidden. It propagates before the pack, and as no completion
resolved no `query_log` row is written. Consequence: the test doubles whose `embed` throws a plain
`Error` and that reach a live `explain` change to throw `LlmUnavailable('not-configured')` (S9).

**S3. Exact search, not the HNSW index.** With `WHERE project_id = $1 ORDER BY question_embedding <=>
$2 LIMIT 1`, Postgres may walk the global HNSW index and filter afterwards: with `ef_search` 40 and
many entries of other projects nearer the query, the project's entry can be missed (pgvector's
post-filtering; iterative scans exist only from 0.8 and are opt-in). The cache of one project is
small (one entry per distinct question). `FIND_SIMILAR_CACHE_ENTRY` therefore starts from the
`project` row (as `FIND_CACHE_ENTRY`, so an unknown project is told apart from no entry), computes the
distance of the project's rows with an embedding in a `MATERIALIZED` CTE (planned through
`cache_entry_project_id_idx`, never ordered by the HNSW index), orders by distance, `created_at DESC`,
`id DESC`, takes the first row and applies `1 - distance >= $3` outside. The HNSW index stays (schema
contract; useful to DIS-69 or a global search later). Alternative considered: `SET LOCAL
hnsw.iterative_scan`; rejected: depends on the pgvector version of the image and is still approximate.
The scenario "The similarity search is exact whatever the other projects hold" pins it.

**S4. The step lives in a pure core module plus one branch of `answerQuestion`.**
`packages/core/src/cache/similarity-cache.ts` exports `SEMANTIC_CACHE_MIN_SIMILARITY`, `usableVector(
result)` (exactly one vector, `EMBEDDING_DIMENSIONS` components, all finite, not all 0 → the vector,
else `undefined`) and `skipCode(error)` (`not-configured` → no code, other `LlmUnavailable` →
`embedding-unavailable`, `BudgetExhausted` → `budget-exhausted`, anything else → rethrown). It does
not import `explain/` (no cycle, as `response-cache.ts`); `SEMANTIC_CACHE_SKIPPED_CODES` and the event
type live in `explain-event.ts` with the other closed sets, and the module imports only the type of the
code. `answerQuestion`, after the exact lookup and before the evaluation check: `if (llm.mode ===
'live' && key !== '')` request `llm.embed([key])`, classify, keep the vector and the skip code in
`state`; if `useCache !== false` and a vector exists, `findSimilarCacheEntry(projectId, vector,
SEMANTIC_CACHE_MIN_SIMILARITY)`, then `parseStoredResponse`, `touchCacheEntry`, `{ hit }` exactly as the
exact path. `finish` passes `state.embedding` to `saveCache` → `saveCacheEntry(…, embedding)`, and
`withEvents` puts the skip event first.

**S5. Port signatures.** `findSimilarCacheEntry(projectId: string, embedding: readonly number[],
minSimilarity: number): Promise<SimilarCacheEntry | undefined>` with `SimilarCacheEntry = CacheEntry &
{ similarity: number }` in `knowledge/cache-entry.ts`; `saveCacheEntry(projectId, questionNormalized,
response, embedding?: readonly number[])`. New checks in `cache-entry.ts`:
`assertValidEmbedding` (`InvalidStoreQuery` naming `embedding`) and `assertValidMinSimilarity`
(naming `minSimilarity`), in the order of the spec. The vector is sent as one text parameter
`[x,y,…]` built with `Number.prototype.toString` (finite numbers only, checked before) and cast
`$n::vector`; never interpolated.

**S6. Migration `0005_embedding-768`.** Up: drop the three HNSW indexes, `ALTER COLUMN … TYPE
vector(768) USING NULL` on `file.embedding`, `symbol.embedding` and `cache_entry.question_embedding`,
recreate the indexes with their names and `vector_cosine_ops`. Down: the same back to `vector(1536)`.
`USING NULL` is lossless on up (every value is `NULL` today: nothing writes them and the seed holds
none) and loses the stored cache vectors on down, which only makes the next rephrasing miss (the
entries and their responses stay). Index names unchanged, so `0003`'s down still drops them. Reviewed
with `migration-review` before applying it to the shared local database.

**S7. 768 is the dimension (D3), and changing it is a migration.** `EMBEDDING_DIMENSIONS = 768`, the
TSDoc says the columns, the migration and the reference model, and that a model of another dimension
needs a new migration (DIS-46 note correcting the DIS-5 non-goal). `docs/backend-standards.md` §5
("changing the model invalidates the cache") stays true and is not edited.

**S8. Accounting (D9).** `embed` goes through `meter.llm` (pass-through, uncounted), so `usage`,
`query_log` and `meter.resolvedCalls()` are unchanged by it. The budget wrapper reads the day's spend
before `embed` and before `complete`: one more `sumCostSince` read per live miss, accepted.

**S9. Test doubles.** `createScriptedLlm` gains `options.embed?: (texts) => number[][] | Promise<…>`;
without it `embed` throws `LlmUnavailable('not-configured')` (today a plain `Error`), so every existing
live test keeps its events and its `order`. With it, each embed request is recorded in a new
`embeddings: string[][]` list and pushes `embed` into the shared `order`. The in-memory double gains
`findSimilarCacheEntry` (cosine in double precision; same checks, ties and failure injection
`failCacheCall.similar`), `calls.findSimilarCacheEntry`, the embedding in `StoredCacheEntry` /
`SeedCacheEntry`, and `doubles()` records `findSimilarCacheEntry` in `order`. Every other `StorePort`
double that `npm run typecheck` reports gets the method (a double given to `explain` delegates or
answers `undefined`; one never given to it may throw).

**S10. Boundary vectors.** Tests build vectors of `EMBEDDING_DIMENSIONS` components from a few leading
components and zeros. The exact boundary uses E1 = (1, 0, …) and Q = (17, 10, 3, 1, 1, 0, …): `‖Q‖ =
√400 = 20` and `E1·Q = 17`, so the double computes exactly `17 / 20`, the same double as the literal
`0.85`. In Postgres the vectors are `real` (float4), so its scenarios compare within 1e-6 and test the
threshold with clear margins (0.9 / 0.4), not at the boundary.

**S11. Threshold calibration (D2) is recorded, not guessed.** The live verification (tasks group 12)
embeds, with `nomic-embed-text` on the local Ollama, the development pairs of CM-HU-19 (the price
rephrasing and the coupon question) and three more rephrasing/different-topic pairs written for the
check (never the measurement questions), and records every similarity in the step 12 report. If a
rephrasing pair falls below 0.85 or a different-topic pair reaches it, the constant moves within
[0.80, 0.95] in this change (TSDoc, `semantic-cache` delta and tests together) and the report says
why; if no value in that range separates them, the constant stays 0.85 and the limitation is recorded
as a D follow-up.

**S12. Spec placement.** The behaviour of the step lives in the new `semantic-cache` capability; the
`explain` deltas only change what that step touches in its precedence, cache and events requirements.
`answer-cache` is not modified: a similarity hit uses "Answer of a cache hit" as it stands. The main
specs are edited only through `/opsx:archive` of these deltas (no direct edit is planned).

No ADR: the decisions are local to the cache and reversible by a migration down; the dimension choice
is recorded here, in the TSDoc of `EMBEDDING_DIMENSIONS` and in `docs/project-context.md`.

## Risks / Trade-offs

- [`nomic-embed-text` embeds short Spanish questions with similarities that do not separate
  rephrasings from other topics] → S11 measures it on real pairs and adjusts within a bounded range;
  a false hit is bounded by the project scope and the anchor (a question without anchor never reaches
  the step).
- [A false similarity hit serves a wrong cached answer] → threshold inclusive at 0.85 cosine on the
  normalized key; the answer's evidence still cites real spans of that project; `useCache: false`
  always bypasses; DIS-69 exposes the hit rate.
- [One more model round trip per live miss] → `embed` of one short text; 0 USD with the reference
  model; a failure only skips the step.
- [Exact search grows linearly with a project's cache] → one entry per distinct question; acceptable
  for a local tool; revisit with DIS-69 if a project's cache grows large.
- [`down` discards stored cache vectors] → only later rephrasings miss; responses stay; documented in
  the migration's header comment.
- [A 1536-dimension model configured by someone] → it fails with `dimension-mismatch`, which now only
  skips the similarity step with an event; `.env.example`, `readme.md` and `docs/project-context.md`
  say 768.

## Migration Plan

1. `npm run db:migrate` applies `0005_embedding-768` (in the single migration transaction); existing
   cache entries keep their responses and get no embedding, so only exact hits serve them until they
   are saved again.
2. Rollback: `npm run db:rollback` once reverts `0005` (columns back to `vector(1536)`, vectors
   dropped) and the code must go back with it (`EMBEDDING_DIMENSIONS` 1536).
3. The local `.env` keeps working without `LLM_EMBED_MODEL`; setting `LLM_EMBED_MODEL=nomic-embed-text`
   (after `ollama pull nomic-embed-text`) enables the step.

## Follow-ups

Decisions of the enrich step (Linear DIS-67, D1–D12) and of this proposal (S1–S12), with their
destination (`docs/project-context.md` → Tracking deferred findings). *Agent's text: decided as lead
engineer in an autonomous run, without the author.* The spec audit and the pre-merge reviews add their
findings here. No line has destination C.

| Id | Decision or finding | Destination |
|---|---|---|
| D1 | Order: anchor → exact key → similarity (live only) → evaluation mode → live | **A** — this change |
| D2 | `SEMANTIC_CACHE_MIN_SIMILARITY = 0.85`, inclusive core constant, calibrated per S11 | **A** — this change |
| D3 | Dimension 768 with `nomic-embed-text`; migration `0005` of the three columns | **A** — this change |
| D4 | The normalized key is the embedded text, without task prefixes | **A** — this change |
| D5 | Every live cacheable answer saved with its embedding, one request per call | **A** — this change |
| D6 | A rejected most-similar entry is a miss, no next entry, no event | **A** — this change |
| D7 | Degradation without error, closed event `semantic_cache_skipped` (refined by S1) | **A** — this change |
| D8 | A similarity hit is served and logged as an exact hit; no public field | **A** — this change |
| D9 | `embed` tokens and cost not in `usage` nor `query_log`; ceiling still checked | **D** — accepted |
| D10 | Vectors in `seeds/cache` and golden answers; hit rate exposed in CLI and `UsagePanel` | **B** — DIS-69 (comment there) |
| D11 | New `semantic-cache` capability; deltas only where a requirement changes (`answer-cache` needs none, S12) | **A** — this change |
| D12 | Label `frontend` removed from DIS-67 | **A** — done in the enrich step |
| S1 | `not-configured` skips without an event | **A** — this change |
| S2 | Only `LlmUnavailable` / `BudgetExhausted` of `embed` degrade; other errors propagate | **A** — this change |
| S3 | Exact search through a materialized CTE, HNSW not used by the lookup | **A** — this change |
| S4 | Pure module `similarity-cache.ts` and one branch of `answerQuestion` | **A** — this change |
| S5 | Port signatures and the new store checks | **A** — this change |
| S6 | Migration `0005` with `USING NULL`, indexes rebuilt, reviewed with `migration-review` | **A** — this change |
| S7 | `EMBEDDING_DIMENSIONS = 768`; a model of another dimension needs a migration | **A** — this change |
| S8 | `embed` uncounted through the meter; one more spend read per live miss | **D** — accepted |
| S9 | Scripted model `embed` option, default `not-configured`; doubles gain the method | **A** — this change |
| S10 | Boundary vector (17, 10, 3, 1, 1) for the exact 0.85 in the double; float4 margins in Postgres | **A** — this change |
| S11 | Live calibration of the threshold with `nomic-embed-text`, recorded in the step 12 report | **A** — this change |
| S12 | Spec placement; main specs only through `/opsx:archive` | **A** — this change |
| R1 | Exact search cost grows with a project's cache size | **D** — accepted (local tool, one entry per question) |
