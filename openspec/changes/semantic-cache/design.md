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

**Non-Goals (design level):** no new port (S13; the similarity decision is a pure core module over
`LlmPort` and `StorePort`); no change to `meterLlm`, `withDailyBudget`, the adapter's code, the API or
the CLI; no use of the HNSW index for the cache lookup (see S3); no seed or golden vectors (DIS-69).

## Decisions

Decisions D1–D12 come from the enrich step (Linear DIS-67, description "[enhanced]", agent's text)
and apply as written there, except D7, refined by S1. S1–S12 are taken in this proposal, and S13 in
correction round 1 of the spec audit. *Agent's
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
more entries of other projects nearer the query than `ef_search` (40), the project's entry can be
missed (pgvector's post-filtering; iterative scans exist only from 0.8 and are opt-in). The cache of
one project holds one entry per distinct question. `FIND_SIMILAR_CACHE_ENTRY` therefore starts from the
`project` row (as `FIND_CACHE_ENTRY`, so an unknown project is told apart from no entry), computes the
distance of the project's rows with an embedding in a `MATERIALIZED` CTE (planned through
`cache_entry_project_id_idx`, never ordered by the HNSW index), orders by distance, `created_at DESC`,
`id DESC`, takes the first row and applies `1 - distance >= $3` outside. The HNSW index stays (schema
contract; useful to DIS-69 or a global search later). The purpose column of the `graph-schema` index
table ("cache hit by question similarity") describes the intended use and stays unchanged; the cache
lookup of this change is exact and does not use the index. Alternative considered: `SET LOCAL
hnsw.iterative_scan`; rejected: depends on the pgvector version of the image and is still approximate.
The scenario "The similarity search is exact whatever the other projects hold" pins it.

**S4. The step lives in a pure core module plus one branch of `answerQuestion`.**
`packages/core/src/cache/similarity-cache.ts` exports `SEMANTIC_CACHE_MIN_SIMILARITY`, `usableVector(
result)` (exactly one vector, `EMBEDDING_DIMENSIONS` components, all finite, not all 0 → the vector,
else `undefined`) and `skipCode(error)` (`not-configured` → no code, other `LlmUnavailable` →
`embedding-unavailable`, `BudgetExhausted` → `budget-exhausted`, anything else → rethrown). It does
not import `explain/` (no cycle, as `response-cache.ts`); `SEMANTIC_CACHE_SKIPPED_CODES` and the event
type live in `explain-event.ts` with the other closed sets, and the module imports only the type of the
code. It also exports `reachesThreshold(similarity)` (similarity `>=` `SEMANTIC_CACHE_MIN_SIMILARITY`),
the single TypeScript statement of the inclusive rule, applied by the in-memory double. `answerQuestion`, after the exact lookup and before the evaluation check: `if (llm.mode ===
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
with `migration-review` before applying it to the shared local database. Exception to Expand →
Contract (`docs/backend-standards.md` §5): no code reads or writes the three columns before this
change, and the up migration runs before the code that writes them; there is no reader to migrate.
`/migration-review` must confirm it (task 3.2).

**S7. 768 is the dimension (D3), and changing it is a migration.** `EMBEDDING_DIMENSIONS = 768`, the
TSDoc says the columns, the migration and the reference model, and that a model of another dimension
needs a new migration (DIS-46 note correcting the DIS-5 non-goal). `docs/backend-standards.md` §5
says "changing the model means re-embedding and reindexing everything"; this change edits it (task
9.5): a model of another dimension needs a migration; a model of the same dimension needs every stored
cache vector discarded by invalidating each project's cache (a full reindex or `invalidateCache`); no
re-embedding is done. The same rule is stated in `semantic-cache`, "Embedding of a saved answer", in
`.env.example` on the `LLM_EMBED_MODEL` line and in `docs/project-context.md`.

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

**S11. Threshold calibration (D2) is recorded, not guessed.** The live verification (task 11.2)
embeds, with `nomic-embed-text` on the local Ollama, the development pairs of CM-HU-19 (the price
rephrasing and the coupon question) and three more rephrasing/different-topic pairs written for the
check (never the measurement questions), and records every similarity in the step 11 report
(`…-11-manual-interface-testing.md`). If a rephrasing pair falls below 0.85 or a different-topic pair
reaches it, the constant moves within [0.80, 0.95] in this change (TSDoc, `semantic-cache` delta and
tests together) and the report says why; if no value in that range separates them, the constant stays
0.85 and the limitation is recorded as a D follow-up. When the constant moves, the threshold-dependent
values of the scenarios are re-derived by one rule: the boundary vector is replaced by one whose
cosine with E1 is an exact rational equal to the new constant (computed exactly in double precision,
as `17 / 20` is for 0.85); A, B and every rephrasing similarity stay at least 0.03 above the
constant; `0.8499` becomes the constant minus 1e-4; and `0.85` in "The threshold is 0.85 and
inclusive" becomes the constant. A delta changed after apply follows `docs/base-standards.md` §7: the
artifacts are updated first, then the spec audit is run again.

**S12. Spec placement.** The behaviour of the step lives in the new `semantic-cache` capability; the
`explain` deltas only change what that step touches in its precedence, cache and events requirements.
`answer-cache` is not modified: a similarity hit uses "Answer of a cache hit" as it stands. The main
specs are edited only through `/opsx:archive` of these deltas (no direct edit is planned).

**S13. Embeddings stay on `LlmPort.embed()`; an ADR records it with the dimension (DIS-46 review
comment of 2026-10-16).** That comment asks the task that first uses embeddings for real, this one, to
decide in a short ADR between keeping `LlmPort.embed()` and splitting an `EmbeddingPort`. Decision:
keep `LlmPort.embed()`. `LLM_EMBED_MODEL` already selects a separate embedding model on the same
OpenAI-compatible endpoint; `mode` already drives degradation (evaluation mode never embeds); and
S1/S2 classify every failure of the request, a failing endpoint included. A separate `EmbeddingPort`
would duplicate the budget wrapper (`withDailyBudget`), the metering pass-through and the composition
of the live model, for no behaviour a test can observe today; a provider of embeddings different from
the chat one is not a requirement of any ticket and would be a new port in its own change. The record
is `docs/adr/YYYYMMDD-embeddings-stay-on-llm-port.md` (from `docs/adr/_template.md`, indexed in
`docs/adr/README.md`), and it also records D3/S6/S7 (dimension 768, migration `0005`, the rule for a
change of embedding model), which meet the README criterion (more than one module: core, the store
adapter, the LLM adapter and the docs). The embeddings note of `readme.md` §2.2 ("la decisión del
puerto la tomará DIS-46 … con su propio ADR") and the row of the DIS-101 review table that points to
it are updated to link the ADR (task 9.1).

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
- [Exact search grows linearly with a project's cache] → accepted (D): the lookup scans the project's
  rows with an embedding; acceptable while a project holds ≤ 1 000 entries (one per distinct
  question); beyond that, a new change measures it.
- [`LLM_EMBED_MODEL` changed to another 768-dimension model] → stored vectors are not comparable and
  could give false hits; the operator invalidates the caches (`.env.example`,
  `docs/project-context.md`, `docs/backend-standards.md` §5, `semantic-cache` "Embedding of a saved
  answer"); nothing detects it (D — accepted).
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

Decisions of the enrich step (Linear DIS-67, D1–D12) and of this proposal (S1–S13), with their
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
| S7 | `EMBEDDING_DIMENSIONS = 768`; a model of another dimension needs a migration, one of the same dimension needs the caches invalidated; `backend-standards` §5 edited | **A** — this change |
| S8 | `embed` uncounted through the meter; one more spend read per live miss | **D** — accepted |
| S9 | Scripted model `embed` option, default `not-configured`; doubles gain the method | **A** — this change |
| S10 | Boundary vector (17, 10, 3, 1, 1) for the exact 0.85 in the double; float4 margins in Postgres | **A** — this change |
| S11 | Live calibration of the threshold with `nomic-embed-text` (task 11.2), recorded in the step 11 report (`…-11-manual-interface-testing.md`), with the re-derivation rule of the scenario values | **A** — this change |
| S12 | Spec placement; main specs only through `/opsx:archive` | **A** — this change |
| S13 | Embeddings stay on `LlmPort.embed()`, no `EmbeddingPort`; ADR with D3/S6/S7 (task 9.4) | **A** — this change |
| R1 | Exact search cost grows with a project's cache size; acceptable while a project holds ≤ 1 000 entries, beyond that a new change measures it | **D** — accepted |
| R2 | Another 768-dimension embedding model makes stored vectors incomparable; the operator invalidates the caches, nothing detects it | **D** — accepted |

Spec audit, run 1 (2026-11-03). *Agent's text: decided as lead engineer in correction round 1, without
the author.*

| Id | Decision or finding | Destination |
|---|---|---|
| Q1 | The ADR asked by the DIS-46 review comment belongs to DIS-67, not DIS-69: DIS-67 is the first task that uses embeddings (S13) | **A** — this change |
| B1 | S13 and its ADR; `readme.md` embeddings note and DIS-101 row updated | **A** — this change |
| B2 | Rule for a change of embedding model: invalidate every project's cache; `backend-standards` §5 quote fixed and the section edited (task 9.5) | **A** — this change |
| B3 | `explain` "Query log" MODIFIED: an embedding request never counts as a resolved call; similarity and embedding failures write no row | **A** — this change |
| B4 | Explicit data in "The in-memory double searches by similarity like the database"; the 200-entry scenario excluded from the double | **A** — this change |
| B5 | Manual plan avoids the seeded acme-shop keys and restores `hit_count` / `last_hit_at` and replaced seed rows | **A** — this change |
| B6 | Scenario "A question without anchor requests no embedding" | **A** — this change |
| I1 | Report numbering: step 10 report for baseline, edited tests, migration review, ADR; step 11 for calibration | **A** — this change |
| I2 | Docs group stays before the run-tests group because `npm run docs:coverage` (10.3) gates it; reason stated in group 9 | **A** — this change |
| I3 | Measurable wording in S3 and R1; R1 no longer routed to DIS-69 | **A** — this change |
| I4 | `useCache: false` with a failing embedding adds the skip event (second WHEN of "Turning the cache off embeds only for the save") | **A** — this change |
| I5 | Re-derivation rule of threshold-dependent scenario values (S11, task 11.2) | **A** — this change |
| I6 | "Answer cache" → Lookup sentence rewritten without the contradiction | **A** — this change |
| I7 | Note appended to the `[enhanced]` part of DIS-67 (AC4 refined by S1; no `answer-cache` delta, S12; model change rule) | **A** — done in correction round 1 |
| I8 | Expand → Contract exception stated in S6, confirmed by `/migration-review` | **A** — this change |
| I10 | Similarity hit answer has exactly the keys of an exact-key hit | **A** — this change |

Spec audit, run 2 (2026-11-03). *Agent's text: decided as lead engineer in correction round 2, without
the author. The run asked no question for the author.*

| Id | Decision or finding | Destination |
|---|---|---|
| B7 | In `explain` scenarios a model "received" call is a completion (`answer`, `verify`); embedding requests count only where a scenario names them; "Query log" says "no completion was made"; the three "0 calls" scenarios keep their tests (7.3) | **A** — this change |
| B8 | Manual plan 11.4/11.5 uses three recorded fresh questions (D₁ embed model empty, D₂ broken embed model, D₃ with `useCache: false` in the API) and keeps the rephrased question only for the evaluation run | **A** — this change |
| I1 | "The threshold is inclusive at the boundary" names the live scripted model's completions | **A** — this change |
| I2 | "The most similar entry of the project wins": no entry is stored under the rephrased question's key | **A** — this change |

Spec audit, run 3 (2026-11-03). *Agent's text: decided as lead engineer in the apply step, without the author. The run asked no question for the author.*

| Id | Decision or finding | Destination |
|---|---|---|
| I1 | `reachesThreshold` declared in S4 and applied by the in-memory double (task 4.3) | **A** — this change |
| I2 | Similarities of C and D bounded in the tie scenario of `graph-store` | **A** — this change |
| I3 | Manual restoration covers the stale claims that the refresh rewrites (11.1, 11.7) | **A** — this change |
| I4 | Manual plan uses a rephrasing whose similarity measured in 11.2 reaches the constant; if none does, the miss is recorded as a limitation | **A** — this change |
| I5 | The `useCache: false` request of 11.5 names the rephrased question and checks the new entry in SQL | **A** — this change |
| I6 | Note appended to the `[enhanced]` part of DIS-67 (backend-standards §5 edited; exact search, not LATERAL over HNSW) | **A** — done in Linear |
| I7 | Sentence on the HNSW index purpose column in S3 | **A** — this change |

Apply step (2026-11-03). *Agent's text: decided as lead engineer in the apply step, without the author.*

| Id | Decision or finding | Destination |
|---|---|---|
| R3 | Calibration of design S11 with `nomic-embed-text` (step 11 report): rephrasings of the price question measured 0.8321 («explícame el cálculo del precio final»), 0.8328, 0.9260, 0.9518, 0.9708 and 0.9924, and of the coupon question 0.9084; different topics 0.5506, 0.6321, 0.6665, 0.7102, 0.8465 (taxes), 0.8745 (shipping, same sentence frame) and 0.8920 (apply instead of validate coupons). No constant in [0.80, 0.95] separates every pair (the lowest rephrasing is below the highest different topic), so by S11 the constant stays 0.85 and the limitation is recorded: a short question with the same frame and one different noun can hit (observed: the shipping question was answered with the price entry), and the headline rephrasing of CM-HU-19 misses. `useCache: false` bypasses it | **D** — accepted |
| R4 | A future calibration (another embedding model, a task prefix on the embedded text, or a second check on the hit) needs a delta change and its own spec audit; it is passed to DIS-69, which exposes the hit rate and so makes false hits measurable (comment there) | **B** — DIS-69 |
| R5 | The local chat model `qwen2.5-coder` mostly returns `invalid-model-output` for the explain prompt, so the manual run could not show a live cacheable answer saved with its embedding; the save is pinned by the unit and integration tests, and the manual run saved the seeded answer through the real store with the real embedding instead | **D** — accepted |
| R6 | The in-memory double compares with the `minSimilarity` it receives, not with the constant, because the minimum is a call argument; `reachesThreshold` stays the single statement of the rule for core and is tested on its own. The `explain` scenarios of `semantic-cache` live in `tests/unit/explain/explain-similarity.spec.ts`, not in `explain-cache.spec.ts` | **D** — accepted |
