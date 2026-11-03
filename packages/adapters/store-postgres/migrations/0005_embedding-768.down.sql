-- Reverts 0005_embedding-768.up.sql: the three columns go back to vector(1536).
-- WARNING: this discards every stored embedding (`USING NULL`; a 768-component vector cannot become a
-- 1536-component one). For `cache_entry` it only makes the next rephrasing miss: the entries and their
-- responses stay. The code must go back with it (`EMBEDDING_DIMENSIONS` 1536).
-- No IF EXISTS: rolling back a half-present schema must fail loudly, not silently.

DROP INDEX file_embedding_hnsw_idx;
DROP INDEX symbol_embedding_hnsw_idx;
DROP INDEX cache_entry_question_embedding_hnsw_idx;

ALTER TABLE file ALTER COLUMN embedding TYPE vector(1536) USING NULL;
ALTER TABLE symbol ALTER COLUMN embedding TYPE vector(1536) USING NULL;
ALTER TABLE cache_entry ALTER COLUMN question_embedding TYPE vector(1536) USING NULL;

CREATE INDEX file_embedding_hnsw_idx ON file USING hnsw (embedding vector_cosine_ops);
CREATE INDEX symbol_embedding_hnsw_idx ON symbol USING hnsw (embedding vector_cosine_ops);
CREATE INDEX cache_entry_question_embedding_hnsw_idx ON cache_entry USING hnsw (question_embedding vector_cosine_ops);
