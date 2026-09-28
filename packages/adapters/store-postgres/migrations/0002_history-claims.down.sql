-- Reverts 0002_history-claims.up.sql: drop in reverse dependency order.
-- No IF EXISTS: rolling back a half-present schema must fail loudly, not silently.
-- The vector extension belongs to 0001 and is not touched here.

DROP TABLE cache_entry;
DROP TABLE query_log;
DROP TABLE evidence;
DROP TABLE claim;
DROP TABLE file_commit;
DROP TABLE commit;

DROP TYPE query_capability;
DROP TYPE evidence_verification;
DROP TYPE claim_status;
DROP TYPE claim_type;
DROP TYPE claim_layer;
