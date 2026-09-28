-- Reverts 0003_indexes-stale.up.sql in reverse order.
-- No IF EXISTS: rolling back a half-present schema must fail loudly, not silently.

DROP TRIGGER file_content_hash_marks_claims_stale ON file;
DROP FUNCTION mark_claims_stale_on_content_change();

DROP INDEX cache_entry_question_embedding_hnsw_idx;
DROP INDEX symbol_embedding_hnsw_idx;
DROP INDEX file_embedding_hnsw_idx;

DROP INDEX claim_stale_idx;
DROP INDEX file_commit_commit_id_idx;
DROP INDEX file_project_content_hash_idx;

DROP INDEX cache_entry_project_id_idx;
DROP INDEX query_log_project_id_idx;
DROP INDEX evidence_file_id_idx;
DROP INDEX evidence_claim_id_idx;
DROP INDEX claim_project_id_idx;
DROP INDEX symbol_file_id_idx;
DROP INDEX edge_project_id_idx;

DROP INDEX edge_target_file_kind_idx;
DROP INDEX edge_target_symbol_kind_idx;
DROP INDEX edge_source_file_kind_idx;
DROP INDEX edge_source_symbol_kind_idx;
