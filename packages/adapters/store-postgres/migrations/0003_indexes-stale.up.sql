-- DIS-13 (CM-HU-01.3): query and vector indexes, and stale invalidation on content change.
-- Contract: openspec/changes/schema-indexes-stale/specs/graph-schema/spec.md
-- ("Query and vector indexes", "Stale invalidation on content change"). No table, column or enum.

-- Traversal by endpoint (design.md D3): each endpoint is two nullable FKs (0001), so each column gets
-- a partial index that leads with the endpoint. An endpoint id belongs to one project, so a leading
-- project_id would narrow nothing; leading with the endpoint also serves the FK delete cascade.
CREATE INDEX edge_source_symbol_kind_idx ON edge (source_symbol_id, kind) WHERE source_symbol_id IS NOT NULL;
CREATE INDEX edge_source_file_kind_idx ON edge (source_file_id, kind) WHERE source_file_id IS NOT NULL;
CREATE INDEX edge_target_symbol_kind_idx ON edge (target_symbol_id, kind) WHERE target_symbol_id IS NOT NULL;
CREATE INDEX edge_target_file_kind_idx ON edge (target_file_id, kind) WHERE target_file_id IS NOT NULL;

-- Cascading FKs that no primary key or unique constraint already leads (design.md D4).
CREATE INDEX edge_project_id_idx ON edge (project_id);
CREATE INDEX symbol_file_id_idx ON symbol (file_id);
CREATE INDEX claim_project_id_idx ON claim (project_id);
CREATE INDEX evidence_claim_id_idx ON evidence (claim_id);
CREATE INDEX evidence_file_id_idx ON evidence (file_id);
CREATE INDEX query_log_project_id_idx ON query_log (project_id);
CREATE INDEX cache_entry_project_id_idx ON cache_entry (project_id);

-- From readme.md §3.2.
CREATE INDEX file_project_content_hash_idx ON file (project_id, content_hash);
CREATE INDEX file_commit_commit_id_idx ON file_commit (commit_id);
CREATE INDEX claim_stale_idx ON claim (project_id, status) WHERE status = 'stale';

-- Semantic search (pgvector HNSW, default m / ef_construction).
CREATE INDEX file_embedding_hnsw_idx ON file USING hnsw (embedding vector_cosine_ops);
CREATE INDEX symbol_embedding_hnsw_idx ON symbol USING hnsw (embedding vector_cosine_ops);
CREATE INDEX cache_entry_question_embedding_hnsw_idx ON cache_entry USING hnsw (question_embedding vector_cosine_ops);

-- Stale invalidation (design.md D5): when a file's content changes, every current claim with evidence
-- citing it becomes stale, in the same statement. Already-stale claims are left alone, and nothing
-- is ever turned back to current: recomputing claims is the lazy re-inference's job (CM-HU-09.4).
-- CREATE FUNCTION without OR REPLACE: a function left behind by a broken down section must make the
-- next migrate fail loudly.
CREATE FUNCTION mark_claims_stale_on_content_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE claim
     SET status = 'stale', updated_at = now()
   WHERE status = 'current'
     AND EXISTS (SELECT 1 FROM evidence e WHERE e.claim_id = claim.id AND e.file_id = NEW.id);
  RETURN NULL;
END;
$$;

-- IS DISTINCT FROM: same-value writes do not fire it, and a first hash set on NULL does.
CREATE TRIGGER file_content_hash_marks_claims_stale
  AFTER UPDATE OF content_hash ON file
  FOR EACH ROW
  WHEN (OLD.content_hash IS DISTINCT FROM NEW.content_hash)
  EXECUTE FUNCTION mark_claims_stale_on_content_change();
