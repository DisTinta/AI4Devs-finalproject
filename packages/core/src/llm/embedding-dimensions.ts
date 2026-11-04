/**
 * Number of components of every embedding Codemind stores. It must equal the `vector(768)` columns
 * `file.embedding`, `symbol.embedding` and `cache_entry.question_embedding` (migration
 * `0005_embedding-768`; before it they were `vector(1536)`). The reference model is `nomic-embed-text`
 * (Ollama, 768 components, 0 USD; DIS-67). Changing it is a migration, not a setting: a model of
 * another dimension is rejected with `dimension-mismatch` until a new migration moves the columns.
 */
export const EMBEDDING_DIMENSIONS = 768;
