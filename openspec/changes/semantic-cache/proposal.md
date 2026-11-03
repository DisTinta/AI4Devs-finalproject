## Why

A developer who rephrases a question `explain` already answered for a project pays and waits again:
the answer cache of DIS-21 only hits when the normalized text is identical, although the schema has
had `cache_entry.question_embedding` and its HNSW index since DIS-13 and `LlmPort.embed()` exists since
DIS-17. DIS-67 (CM-HU-19.1, parent DIS-46 / CM-HU-19) closes that gap: with an embedding model
configured, a question similar enough to a cached one of the same project is answered from the cache,
and without embeddings (evaluation mode, no `LLM_EMBED_MODEL`, endpoint down, daily ceiling reached)
everything keeps working exactly as today, without an error (PH-04, PH-08).

Today the reference free embedding model of `docs/DEMO.md` (`nomic-embed-text` on Ollama, 768
dimensions) can never be used: `embed()` rejects it with `dimension-mismatch` because the columns are
`vector(1536)`. DIS-46 left that choice to this ticket.

## What Changes

- **Similarity lookup in `explain`.** After anchoring and a miss of the exact key (DIS-21), in live mode
  and unless `useCache: false`, `explain` embeds the question's normalized key once and asks the store
  for the most similar cache entry of the project at or above `SEMANTIC_CACHE_MIN_SIMILARITY` (0.85
  cosine similarity, a documented core constant). An accepted entry is answered and recorded exactly
  like an exact hit (hit count, last hit instant, `query_log` row with the cache flag, usage of a hit).
  Order: anchor → exact key → similarity (live only) → evaluation mode → live pipeline.
- **Cacheable answers keep their embedding.** In live mode the vector computed for the lookup (or, with
  `useCache: false`, computed for the save only) is saved with the cacheable answer, so later
  rephrasings can find it. Without a vector the entry is saved without one, as today.
- **Degradation without error.** Evaluation mode never calls `embed()`: only the exact key hits, and a
  miss is the `UNKNOWN` `llm-required` of today. In live mode, an embedding model that is not configured
  skips the similarity step silently; any other `LlmUnavailable` of `embed()`, an invalid vector or a
  `BudgetExhausted` skips it with a new closed event `{ type: 'semantic_cache_skipped', code }`
  (`embedding-unavailable`, `budget-exhausted`) and the call goes on exactly as today.
- **Store.** New `StorePort.findSimilarCacheEntry(projectId, embedding, minSimilarity)` (exact search
  over the project's entries with a non-null embedding, pgvector `<=>`, parameterised), and an optional
  `embedding` argument of `saveCacheEntry`, both with validation before any statement; the in-memory
  double implements both.
- **Schema, BREAKING for stored embeddings.** Migration `0005_embedding-768` changes `file.embedding`,
  `symbol.embedding` and `cache_entry.question_embedding` from `vector(1536)` to `vector(768)` (every
  value is `NULL` today: nothing writes them) and rebuilds their HNSW indexes; its `down` goes back to
  `vector(1536)`, discarding stored vectors. `EMBEDDING_DIMENSIONS` becomes 768, so an embedding model
  must return 768-dimension vectors (`nomic-embed-text`); a 1536-dimension model now fails with
  `dimension-mismatch`.
- **Docs.** `readme.md` (§1.3 step 5, §2.4, the embeddings note, the ER diagram), `docs/DEMO.md` step 5
  note, `.env.example` and `docs/project-context.md` say 768, `nomic-embed-text` as the reference
  model, and "similarity only with `LLM_EMBED_MODEL` configured; exact key only in evaluation".
  `docs/backend-standards.md` §5 says what a change of embedding model needs (another dimension: a
  migration; the same dimension: invalidate every project's cache). A new ADR records that embeddings
  stay on `LlmPort.embed()` (no `EmbeddingPort`) and the 768 dimension, as the DIS-46 review comment
  asks (design S13).

### Non-goals

- No UI, CLI or HTTP change: no public response field or Zod schema changes; the new event reaches the
  request log and the CLI's stderr through the existing event logging. Hit rate per project and its
  exposure in the CLI and `UsagePanel`, and vectors in `seeds/cache` and the golden answers, belong to
  DIS-69 (CM-HU-19.2).
- No embedding of the graph (`file.embedding`, `symbol.embedding` stay unwritten; only their dimension
  changes) and no semantic anchoring.
- No re-embedding of entries when the embedding model changes (after a change of embedding model the
  operator invalidates the caches; `docs/backend-standards.md` §5 is corrected to say so), no similarity cache for `/impact`, and the tokens of `embed()`
  are not counted in `usage` or `query_log`.
- The threshold is not an environment variable and is not tuned with the measurement questions
  (`docs/measurements/context/questions.json`).

## Capabilities

### New Capabilities

- `semantic-cache`: the similarity step of the answer cache: what is embedded, the threshold, when the
  step runs and when it is skipped, how a similar entry is chosen and served, the embedding saved with
  a cacheable answer, and the `semantic_cache_skipped` event.

### Modified Capabilities

- `explain`: "Precedence and UNKNOWN answers" (the similarity step between the exact key and evaluation
  mode; the embedding request is not a completion), "Answer cache" (lookup by similarity, save with the
  embedding), "Explain events and logging" (the new event in the union and its place in the order) and
  "Query log" (an embedding request never counts as a resolved call; similarity-lookup and embedding
  failures write no row).
- `graph-store`: "Answer cache entries" gains `findSimilarCacheEntry` and the optional embedding of
  `saveCacheEntry`, with their checks and the in-memory double.
- `graph-schema`: the three embedding columns become `vector(768)` ("L1 column contract", "History,
  claim, usage and cache column contract") and the latest migration that "Roll back the latest
  migration" reverts is now `0005`.
- `llm-adapter`: every vector has 768 components ("Embedding request, order and dimension", and the
  1536-component fixtures of "The client waits as long as the configured timeout" and "Completion
  request and response").

`answer-cache` keeps its requirements: a similarity hit is answered with "Answer of a cache hit" as it
stands.

## Impact

- **Core:** `packages/core/src/cache/similarity-cache.ts` (new), `cache/index.ts`,
  `explain/explain.ts`, `explain/explain-event.ts`, `ports/StorePort.ts`,
  `knowledge/cache-entry.ts` (embedding and threshold checks), `llm/embedding-dimensions.ts`.
- **Adapters:** `packages/adapters/store-postgres/src/queries.ts` and `postgres-store.ts`, new
  migration `0005_embedding-768` (up and down); `packages/adapters/llm` unchanged in code (it reads
  `EMBEDDING_DIMENSIONS`).
- **Tests:** new `tests/unit/cache/similarity-cache.spec.ts`; extended `tests/unit/explain/explain-cache.spec.ts`,
  `tests/integration/store/cache-entry.spec.ts`, `tests/unit/store/in-memory-store.spec.ts`; doubles
  `tests/support/in-memory-store.ts`, `tests/support/explain-doubles.ts`, `tests/support/scripted-llm.ts`;
  existing tests that fix 1536 or the latest migration change (named in `tasks.md`).
- **Privacy and security:** the question already goes to the same endpoint for `complete()`; `embed()`
  adds no destination. The vector is stored in the local database only; the new event carries a closed
  code and nothing of the question, the vector or the error. No log line gains content.
- **Cost:** one `embed()` call per live call that misses the exact key (0 USD with `nomic-embed-text`);
  the daily ceiling is checked before it, as before every model call.
- **Commands:** those of `docs/project-context.md` and `.claude/sdd-harness.env` (`npx vitest run`,
  `npm run typecheck`, `npm run lint`, `npm run db:migrate`, `npx stryker run`).
