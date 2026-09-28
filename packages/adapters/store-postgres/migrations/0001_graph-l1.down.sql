-- Reverts 0001_graph-l1.up.sql: drop in reverse dependency order.
-- No IF EXISTS: rolling back a half-present schema must fail loudly, not silently.
-- The vector extension is not dropped: it is shared with later migrations (DIS-12/13), and the up
-- section only creates it IF NOT EXISTS.

DROP TABLE edge;
DROP TABLE symbol;
DROP TABLE file;
DROP TABLE project;

DROP TYPE edge_resolution;
DROP TYPE edge_kind;
DROP TYPE symbol_kind;
DROP TYPE file_kind;
DROP TYPE project_framework;
DROP TYPE project_language;
