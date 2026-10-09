/**
 * Number of components of every embedding Codemind stores. It must equal the `vector(1536)` columns
 * `file.embedding`, `symbol.embedding` (migration `0001_graph-l1`) and
 * `cache_entry.question_embedding` (migration `0002_history-claims`). Changing it is a migration,
 * not a setting: the model whose dimension differs is rejected instead (DIS-46 owns the choice).
 */
export const EMBEDDING_DIMENSIONS = 1536;
