-- DIS-11 (CM-HU-01.1): L1 knowledge graph — project, file, symbol, edge.
-- Column contract: openspec/changes/schema-graph-l1/specs/graph-schema/spec.md ("L1 column contract").

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TYPE project_language AS ENUM ('php', 'typescript');
CREATE TYPE project_framework AS ENUM ('laravel', 'fastify', 'none');
CREATE TYPE file_kind AS ENUM ('source', 'test', 'doc', 'config');
CREATE TYPE symbol_kind AS ENUM ('class', 'interface', 'method', 'function', 'route');
CREATE TYPE edge_kind AS ENUM (
  'calls', 'imports', 'extends', 'implements', 'tested_by', 'co_changed', 'describes'
);
CREATE TYPE edge_resolution AS ENUM ('exact', 'heuristic');

CREATE TABLE project (
  id             uuid              NOT NULL DEFAULT gen_random_uuid(),
  name           text              NOT NULL,
  root_path      text              NOT NULL,
  language       project_language  NOT NULL,
  framework      project_framework NULL,
  is_sample      boolean           NOT NULL DEFAULT false,
  indexed_commit text              NULL,
  node_count     integer           NOT NULL DEFAULT 0,
  edge_count     integer           NOT NULL DEFAULT 0,
  indexed_at     timestamptz       NULL,
  created_at     timestamptz       NOT NULL DEFAULT now(),
  CONSTRAINT project_pkey PRIMARY KEY (id),
  CONSTRAINT project_name_key UNIQUE (name)
);

CREATE TABLE file (
  id           uuid         NOT NULL DEFAULT gen_random_uuid(),
  project_id   uuid         NOT NULL,
  path         text         NOT NULL,
  kind         file_kind    NOT NULL,
  loc          integer      NULL,
  content_hash text         NULL,
  redacted     boolean      NOT NULL DEFAULT false,
  embedding    vector(1536) NULL,
  CONSTRAINT file_pkey PRIMARY KEY (id),
  CONSTRAINT file_project_id_fkey FOREIGN KEY (project_id) REFERENCES project (id) ON DELETE CASCADE,
  CONSTRAINT file_project_path_key UNIQUE (project_id, path)
);

CREATE TABLE symbol (
  id         uuid         NOT NULL DEFAULT gen_random_uuid(),
  file_id    uuid         NOT NULL,
  name       text         NOT NULL,
  kind       symbol_kind  NOT NULL,
  start_line integer      NOT NULL,
  end_line   integer      NOT NULL,
  signature  text         NULL,
  embedding  vector(1536) NULL,
  CONSTRAINT symbol_pkey PRIMARY KEY (id),
  CONSTRAINT symbol_file_id_fkey FOREIGN KEY (file_id) REFERENCES file (id) ON DELETE CASCADE,
  CONSTRAINT symbol_start_line_positive CHECK (start_line > 0),
  CONSTRAINT symbol_span_valid CHECK (end_line >= start_line)
);

-- Each endpoint is exactly one symbol or one file (two nullable FKs + CHECK), so referential
-- integrity and cascades are enforced by the database. The database does NOT check that the
-- endpoints belong to edge.project_id: accepted L1 risk, the writers own that consistency.
CREATE TABLE edge (
  id               uuid             NOT NULL DEFAULT gen_random_uuid(),
  project_id       uuid             NOT NULL,
  source_symbol_id uuid             NULL,
  source_file_id   uuid             NULL,
  target_symbol_id uuid             NULL,
  target_file_id   uuid             NULL,
  kind             edge_kind        NOT NULL,
  resolution       edge_resolution  NOT NULL,
  extractor        text             NOT NULL,
  weight           double precision NULL,
  CONSTRAINT edge_pkey PRIMARY KEY (id),
  CONSTRAINT edge_project_id_fkey FOREIGN KEY (project_id) REFERENCES project (id) ON DELETE CASCADE,
  CONSTRAINT edge_source_symbol_id_fkey FOREIGN KEY (source_symbol_id) REFERENCES symbol (id) ON DELETE CASCADE,
  CONSTRAINT edge_source_file_id_fkey FOREIGN KEY (source_file_id) REFERENCES file (id) ON DELETE CASCADE,
  CONSTRAINT edge_target_symbol_id_fkey FOREIGN KEY (target_symbol_id) REFERENCES symbol (id) ON DELETE CASCADE,
  CONSTRAINT edge_target_file_id_fkey FOREIGN KEY (target_file_id) REFERENCES file (id) ON DELETE CASCADE,
  CONSTRAINT edge_source_exactly_one CHECK (num_nonnulls(source_symbol_id, source_file_id) = 1),
  CONSTRAINT edge_target_exactly_one CHECK (num_nonnulls(target_symbol_id, target_file_id) = 1),
  CONSTRAINT edge_extractor_not_empty CHECK (extractor <> ''),
  CONSTRAINT edge_weight_range CHECK (weight BETWEEN 0 AND 1)
);
