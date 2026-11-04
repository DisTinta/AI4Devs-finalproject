# Embeddings stay on `LlmPort.embed()`, at 768 dimensions, and changing the embedding model is a migration or a cache invalidation

*Agent's text: decided as lead engineer in an autonomous run (DIS-67), without the author.*

## Status
Accepted

## Context and problem
DIS-67 is the first task that uses embeddings for real: the answer cache of `explain` now serves a
rephrased question from a similar cached entry (`semantic-cache`). The review comment of DIS-46 (2026-10-16)
asked the task that first used embeddings to decide, in a short record, between keeping `LlmPort.embed()`
and splitting an `EmbeddingPort`.

At the same time the schema and the reference model disagreed. `EMBEDDING_DIMENSIONS` was 1536 and so
were the three `vector(1536)` columns (`file.embedding`, `symbol.embedding`,
`cache_entry.question_embedding`), but the only embedding model that costs 0 USD in `docs/DEMO.md`,
`nomic-embed-text` on Ollama, returns 768 components and failed every request with
`dimension-mismatch`. No code wrote any embedding yet (every value is `NULL`, the seed holds none), so the
dimension could still move without losing data.

## Options considered
* Keep `LlmPort.embed()` and `LLM_EMBED_MODEL` (an embedding model selected apart from the chat model on
  the same OpenAI-compatible endpoint).
* Split an `EmbeddingPort` with its own adapter, budget wrapper and composition.
* Keep 1536 dimensions (a paid embedding model) or move the columns to 768.

## Decision
We keep **`LlmPort.embed()`** and move the dimension to **768** (`EMBEDDING_DIMENSIONS = 768`, migration
`0005_embedding-768`, reference model `nomic-embed-text`) because:
* `LLM_EMBED_MODEL` already selects a separate embedding model; `mode` already drives degradation
  (evaluation mode never embeds); the daily budget wrapper already checks the ceiling before `embed`; and
  the similarity step classifies every failure of the request (a missing model, an unavailable endpoint,
  an unusable vector, a spent budget).
* A separate `EmbeddingPort` would duplicate that wrapper, the metering pass-through and the composition
  of the live model, for no behaviour a test can observe today. A provider of embeddings different from
  the chat one is not a requirement of any ticket; it would be a new port in its own change.
* 768 is the only dimension that makes the free demo path work. Staying at 1536 would force a paid model
  to show the similarity hit.

## Consequences
* The three columns are `vector(768)` and the HNSW indexes were rebuilt (`USING NULL`, lossless today). The
  `down` migration returns them to `vector(1536)` and discards stored vectors: later rephrasings only miss,
  the cached responses stay.
* A model of another dimension fails with `dimension-mismatch`, which only skips the similarity step with an
  event; it needs a new migration. A model of the same dimension makes the stored vectors incomparable and
  could give false hits: the operator invalidates every project's cache (a full reindex or `invalidateCache`).
  Nothing detects the change (accepted, design R2). Vectors are never re-embedded.
* The cache lookup is an exact search over the project's entries, not the HNSW index (whose post-filtering
  could miss the project's entry); the cost grows with a project's cache and is accepted up to about 1 000
  entries (design R1).
* The tokens and cost of `embed` are not counted in `usage` or `query_log` (0 USD with the reference model);
  the daily ceiling is still checked before the request (design S8).
* If a provider of embeddings different from the chat one is ever needed, a new change splits the port.
