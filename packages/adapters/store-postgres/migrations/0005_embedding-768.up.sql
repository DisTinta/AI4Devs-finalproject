-- DIS-67 (CM-HU-19.1): the embedding dimension becomes 768, the one of the reference model
-- `nomic-embed-text` (design S6, S7). Contract: openspec/specs/graph-schema/spec.md
-- ("L1 column contract", "History, claim, usage and cache column contract").
--
-- Expand -> Contract exception (docs/backend-standards.md §5): no code reads or writes these three
-- columns before this change (every value is NULL and the seed holds none), so there is no reader to
-- migrate; this migration runs before the code that writes them. `USING NULL` is therefore lossless.
-- The HNSW indexes cannot follow a type change: they are dropped and recreated with the same names
-- and `vector_cosine_ops`, so 0003's down section still drops them.

DROP INDEX file_embedding_hnsw_idx;
DROP INDEX symbol_embedding_hnsw_idx;
DROP INDEX cache_entry_question_embedding_hnsw_idx;

ALTER TABLE file ALTER COLUMN embedding TYPE vector(768) USING NULL;
ALTER TABLE symbol ALTER COLUMN embedding TYPE vector(768) USING NULL;
ALTER TABLE cache_entry ALTER COLUMN question_embedding TYPE vector(768) USING NULL;

CREATE INDEX file_embedding_hnsw_idx ON file USING hnsw (embedding vector_cosine_ops);
CREATE INDEX symbol_embedding_hnsw_idx ON symbol USING hnsw (embedding vector_cosine_ops);
CREATE INDEX cache_entry_question_embedding_hnsw_idx ON cache_entry USING hnsw (question_embedding vector_cosine_ops);
