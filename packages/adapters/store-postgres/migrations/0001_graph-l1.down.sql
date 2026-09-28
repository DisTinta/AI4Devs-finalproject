-- Reverts 0001_graph-l1.up.sql: drop in reverse dependency order.

DROP TABLE IF EXISTS edge;
DROP TABLE IF EXISTS symbol;
DROP TABLE IF EXISTS file;
DROP TABLE IF EXISTS project;

DROP TYPE IF EXISTS edge_resolution;
DROP TYPE IF EXISTS edge_kind;
DROP TYPE IF EXISTS symbol_kind;
DROP TYPE IF EXISTS file_kind;
DROP TYPE IF EXISTS project_framework;
DROP TYPE IF EXISTS project_language;

DROP EXTENSION IF EXISTS vector;
