-- Reverts 0004_query-log-verification.up.sql.
-- No IF EXISTS: rolling back a half-present schema must fail loudly, not silently.

ALTER TABLE query_log
  DROP COLUMN verify_latency_ms,
  DROP COLUMN verify_calls,
  DROP COLUMN verify_cost_usd,
  DROP COLUMN verify_output_tokens,
  DROP COLUMN verify_input_tokens;
