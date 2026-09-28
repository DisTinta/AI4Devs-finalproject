-- DIS-12 (CM-HU-01.2): Git history, claims with evidence, query usage and the answer cache.
-- Column contract: openspec/changes/schema-history-claims/specs/graph-schema/spec.md
-- ("History, claim, usage and cache column contract"). Every foreign key cascades (design.md D3).
-- The vector extension comes from 0001.

CREATE TYPE claim_layer AS ENUM ('L1', 'L2');
CREATE TYPE claim_type AS ENUM ('FACT', 'INFERENCE', 'UNKNOWN');
CREATE TYPE claim_status AS ENUM ('current', 'stale');
CREATE TYPE evidence_verification AS ENUM ('none', 'cited', 'entailed', 'broken');
-- drift is planned (F6), not delivered: included now so adding F6 needs no enum migration.
CREATE TYPE query_capability AS ENUM ('explain', 'impact', 'drift');

-- The author is stored only pseudonymised (author_hash): no column for a name or an e-mail.
CREATE TABLE commit (
  id           uuid        NOT NULL DEFAULT gen_random_uuid(),
  project_id   uuid        NOT NULL,
  sha          text        NOT NULL,
  message      text        NULL,
  author_hash  text        NULL,
  committed_at timestamptz NULL,
  pr_number    integer     NULL,
  CONSTRAINT commit_pkey PRIMARY KEY (id),
  CONSTRAINT commit_project_id_fkey FOREIGN KEY (project_id) REFERENCES project (id) ON DELETE CASCADE,
  CONSTRAINT commit_project_sha_key UNIQUE (project_id, sha)
);

-- Source of the co_changed edge weight. The database does NOT check that the file and the commit
-- belong to the same project: accepted risk, the writers own that consistency.
CREATE TABLE file_commit (
  file_id       uuid    NOT NULL,
  commit_id     uuid    NOT NULL,
  lines_added   integer NULL,
  lines_removed integer NULL,
  CONSTRAINT file_commit_pkey PRIMARY KEY (file_id, commit_id),
  CONSTRAINT file_commit_file_id_fkey FOREIGN KEY (file_id) REFERENCES file (id) ON DELETE CASCADE,
  CONSTRAINT file_commit_commit_id_fkey FOREIGN KEY (commit_id) REFERENCES commit (id) ON DELETE CASCADE
);

-- layer says where a claim came from; type says what guarantee it carries. The two named CHECKs are
-- verbatim from readme.md §3.2 and enforce the fact/inference distinction in the database itself.
-- l2_requires_provenance rejects SQL NULL only; the provenance shape is validated by the writer.
CREATE TABLE claim (
  id         uuid             NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid             NOT NULL,
  subject    text             NOT NULL,
  predicate  text             NOT NULL,
  object     text             NULL,
  layer      claim_layer      NOT NULL,
  type       claim_type       NOT NULL,
  confidence double precision NULL,
  status     claim_status     NOT NULL DEFAULT 'current',
  provenance jsonb            NULL,
  created_at timestamptz      NOT NULL DEFAULT now(),
  updated_at timestamptz      NOT NULL DEFAULT now(),
  CONSTRAINT claim_pkey PRIMARY KEY (id),
  CONSTRAINT claim_project_id_fkey FOREIGN KEY (project_id) REFERENCES project (id) ON DELETE CASCADE,
  CONSTRAINT fact_only_from_l1 CHECK (type <> 'FACT' OR layer = 'L1'),
  CONSTRAINT l2_requires_provenance CHECK (layer <> 'L2' OR provenance IS NOT NULL),
  CONSTRAINT claim_confidence_range CHECK (confidence BETWEEN 0 AND 1)
);

-- A concrete citation with an exact span and a frozen excerpt. Deleting the cited file deletes the
-- evidence but keeps the claim (design.md D3). The database does NOT check that the file belongs to
-- the claim's project: accepted risk, as for file_commit.
CREATE TABLE evidence (
  id           uuid                  NOT NULL DEFAULT gen_random_uuid(),
  claim_id     uuid                  NOT NULL,
  file_id      uuid                  NOT NULL,
  start_line   integer               NOT NULL,
  end_line     integer               NOT NULL,
  verification evidence_verification NOT NULL,
  excerpt      text                  NULL,
  CONSTRAINT evidence_pkey PRIMARY KEY (id),
  CONSTRAINT evidence_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES claim (id) ON DELETE CASCADE,
  CONSTRAINT evidence_file_id_fkey FOREIGN KEY (file_id) REFERENCES file (id) ON DELETE CASCADE,
  CONSTRAINT evidence_start_line_positive CHECK (start_line > 0),
  CONSTRAINT evidence_span_valid CHECK (end_line >= start_line)
);

-- One row per answered query: tokens, cost and the baseline the savings are measured against.
CREATE TABLE query_log (
  id              uuid             NOT NULL DEFAULT gen_random_uuid(),
  project_id      uuid             NOT NULL,
  question        text             NOT NULL,
  capability      query_capability NOT NULL,
  input_tokens    integer          NULL,
  output_tokens   integer          NULL,
  baseline_tokens integer          NULL,
  cost_usd        numeric(10,6)    NULL,
  latency_ms      integer          NULL,
  cache_hit       boolean          NOT NULL DEFAULT false,
  created_at      timestamptz      NOT NULL DEFAULT now(),
  CONSTRAINT query_log_pkey PRIMARY KEY (id),
  CONSTRAINT query_log_project_id_fkey FOREIGN KEY (project_id) REFERENCES project (id) ON DELETE CASCADE
);

-- Hits are by embedding similarity, not exact text. No unique key on question_normalized and no
-- vector index here: the cache feature (CM-HU-13) and DIS-13 decide them.
CREATE TABLE cache_entry (
  id                  uuid         NOT NULL DEFAULT gen_random_uuid(),
  project_id          uuid         NOT NULL,
  question_normalized text         NOT NULL,
  question_embedding  vector(1536) NULL,
  response            jsonb        NULL,
  hit_count           integer      NOT NULL DEFAULT 0,
  created_at          timestamptz  NOT NULL DEFAULT now(),
  last_hit_at         timestamptz  NULL,
  CONSTRAINT cache_entry_pkey PRIMARY KEY (id),
  CONSTRAINT cache_entry_project_id_fkey FOREIGN KEY (project_id) REFERENCES project (id) ON DELETE CASCADE
);
