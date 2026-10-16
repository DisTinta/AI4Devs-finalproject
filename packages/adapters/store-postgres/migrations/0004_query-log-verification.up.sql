-- DIS-74 (CM-HU-11.2): verification breakdown of query_log (PH-27) and the verifier's calls and
-- latency per query (D11).
-- Contract: openspec/specs/graph-schema/spec.md ("History, claim, usage and cache column contract").
-- Nullable, with no check constraint, like the existing counters of the table: the store validates
-- each entry before writing it (saveQueryLog), and rows of other capabilities may have no
-- verification.

ALTER TABLE query_log
  ADD COLUMN verify_input_tokens integer NULL,
  ADD COLUMN verify_output_tokens integer NULL,
  ADD COLUMN verify_cost_usd numeric(10,6) NULL,
  ADD COLUMN verify_calls integer NULL,
  ADD COLUMN verify_latency_ms integer NULL;
