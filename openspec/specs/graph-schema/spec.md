# graph-schema Specification

## Purpose

Versioned, reversible PostgreSQL schema for Codemind's knowledge store, plus the commands that apply
and revert it. It holds the L1 knowledge graph (projects, files, symbols and the edges between
them), the Git history (commits and the files each one touched), the claims with the evidence that
supports them, the per-query usage log and the answer cache. Every later store, indexing and query
feature builds on a schema whose integrity the database itself enforces, including the rule that
an inferred claim is never stored as a fact. The schema also carries the query and vector indexes, and a trigger that marks claims `stale` when
the content of a file they cite changes.

## Requirements

### Requirement: Apply pending migrations

`npm run db:migrate` SHALL apply, in order, every migration not yet recorded as applied in the
database named by `DATABASE_URL`, and SHALL exit with code 0 when it succeeds. Running it when no
migration is pending MUST change nothing and MUST still exit with code 0.

#### Scenario: Migrate an empty database

- **WHEN** `npm run db:migrate` runs against an empty PostgreSQL 16 database with pgvector available
- **THEN** the command exits with code 0
- **AND** exactly the tables `project`, `file`, `symbol`, `edge`, `commit`, `file_commit`, `claim`,
  `evidence`, `query_log` and `cache_entry` exist

#### Scenario: Migrate an up-to-date database

- **WHEN** `npm run db:migrate` runs against a database where every migration is already applied
- **THEN** the command exits with code 0
- **AND** the schema is unchanged

### Requirement: Roll back the latest migration

`npm run db:rollback` SHALL revert only the most recently applied migration and SHALL exit with
code 0 when it succeeds. The rollback removes every table, enum type, index, trigger and function
that migration created and leaves every earlier migration applied. Each further call reverts the
next most recent migration. The `vector` extension is shared database infrastructure and is not
removed by rollback.

#### Scenario: Roll back only the latest migration

- **WHEN** every migration is applied and `npm run db:rollback` runs once
- **THEN** the command exits with code 0
- **AND** the indexes, the trigger and the function created by the index and invalidation
  migration no longer exist
- **AND** the ten tables `project`, `file`, `symbol`, `edge`, `commit`, `file_commit`, `claim`,
  `evidence`, `query_log` and `cache_entry` and their enum types still exist
- **AND** the L1 graph migration and the history migration are the only migrations recorded as
  applied

#### Scenario: Roll back the L1 graph migration

- **WHEN** only the L1 graph migration is applied and `npm run db:rollback` runs
- **THEN** the command exits with code 0
- **AND** the tables `project`, `file`, `symbol` and `edge` no longer exist
- **AND** the enum types created by that migration no longer exist

#### Scenario: Roll back both migrations leaves an empty schema

- **WHEN** only the L1 graph migration and the history migration are applied and
  `npm run db:rollback` runs twice
- **THEN** both commands exit with code 0
- **AND** no table and no enum type created by the migrations exists
- **AND** the `vector` extension still exists

#### Scenario: Roll back every migration leaves an empty schema

- **WHEN** every migration is applied and `npm run db:rollback` runs once per applied migration
- **THEN** every command exits with code 0
- **AND** no table, enum type, index, trigger or function created by the migrations exists
- **AND** no migration is recorded as applied
- **AND** the `vector` extension still exists

### Requirement: Migrations are reversible and reproducible

Applying, rolling back and re-applying the migrations SHALL leave the database with a schema
identical to the one produced by the first application. "Identical" covers tables, columns, types,
nullability, defaults, constraints, indexes (with their definitions), triggers and functions. Both
schemas SHALL satisfy the L1 column contract and the history, claim, usage and cache column
contract.

#### Scenario: Apply, roll back and apply again

- **WHEN** the migrations are applied, then rolled back, then applied again
- **THEN** every step exits with code 0
- **AND** the schema after the second application is identical to the schema after the first,
  including indexes, triggers and functions
- **AND** the schema after the second application satisfies both column contracts

### Requirement: Fail clearly without a connection string

`npm run db:migrate` and `npm run db:rollback` MUST exit with a non-zero code and an error message
naming `DATABASE_URL` when that variable is not set.

> Note (not a separately tested behaviour): a migration that fails part-way leaves no partial
> changes because the migration tool runs pending migrations in a single transaction (see
> `design.md` D1). The implementation must not disable that transaction.

#### Scenario: DATABASE_URL is missing on migrate

- **WHEN** `npm run db:migrate` runs with `DATABASE_URL` unset
- **THEN** the command exits with a non-zero code
- **AND** its error output mentions `DATABASE_URL`

#### Scenario: DATABASE_URL is missing on rollback

- **WHEN** `npm run db:rollback` runs with `DATABASE_URL` unset
- **THEN** the command exits with a non-zero code
- **AND** its error output mentions `DATABASE_URL`

### Requirement: L1 column contract

After migration, the four L1 tables SHALL have exactly the columns below (from `readme.md` §3.1,
with the `edge` endpoint deviation of this change), with the stated type, nullability and default.
"enum" means a PostgreSQL enum type restricted to the listed values. Every `id` is a `uuid` primary
key generated by the database when omitted.

| Table | Column | Type | Null | Default |
|---|---|---|---|---|
| `project` | `id` | uuid | NOT NULL | generated |
| `project` | `name` | text | NOT NULL | — |
| `project` | `root_path` | text | NOT NULL | — |
| `project` | `language` | enum (`php`, `typescript`) | NOT NULL | — |
| `project` | `framework` | enum (`laravel`, `fastify`, `none`) | NULL | — |
| `project` | `is_sample` | boolean | NOT NULL | `false` |
| `project` | `indexed_commit` | text | NULL | — |
| `project` | `node_count` | integer | NOT NULL | `0` |
| `project` | `edge_count` | integer | NOT NULL | `0` |
| `project` | `indexed_at` | timestamptz | NULL | — |
| `project` | `created_at` | timestamptz | NOT NULL | `now()` |
| `file` | `id` | uuid | NOT NULL | generated |
| `file` | `project_id` | uuid | NOT NULL | — |
| `file` | `path` | text | NOT NULL | — |
| `file` | `kind` | enum (`source`, `test`, `doc`, `config`) | NOT NULL | — |
| `file` | `loc` | integer | NULL | — |
| `file` | `content_hash` | text | NULL | — |
| `file` | `redacted` | boolean | NOT NULL | `false` |
| `file` | `embedding` | vector(1536) | NULL | — |
| `symbol` | `id` | uuid | NOT NULL | generated |
| `symbol` | `file_id` | uuid | NOT NULL | — |
| `symbol` | `name` | text | NOT NULL | — |
| `symbol` | `kind` | enum (`class`, `interface`, `method`, `function`, `route`) | NOT NULL | — |
| `symbol` | `start_line` | integer | NOT NULL | — |
| `symbol` | `end_line` | integer | NOT NULL | — |
| `symbol` | `signature` | text | NULL | — |
| `symbol` | `embedding` | vector(1536) | NULL | — |
| `edge` | `id` | uuid | NOT NULL | generated |
| `edge` | `project_id` | uuid | NOT NULL | — |
| `edge` | `source_symbol_id` | uuid | NULL | — |
| `edge` | `source_file_id` | uuid | NULL | — |
| `edge` | `target_symbol_id` | uuid | NULL | — |
| `edge` | `target_file_id` | uuid | NULL | — |
| `edge` | `kind` | enum (`calls`, `imports`, `extends`, `implements`, `tested_by`, `co_changed`, `describes`) | NOT NULL | — |
| `edge` | `resolution` | enum (`exact`, `heuristic`) | NOT NULL | — |
| `edge` | `extractor` | text | NOT NULL | — |
| `edge` | `weight` | double precision | NULL | — |

#### Scenario: Migrated schema matches the column contract

- **WHEN** `npm run db:migrate` runs against an empty database
- **THEN** for each of `project`, `file`, `symbol` and `edge`, the set of columns equals the set in
  the table above
- **AND** every column has the listed type, nullability and default

#### Scenario: Defaults apply on a minimal insert

- **WHEN** a `project` row is inserted with only `name`, `root_path` and `language`, and a `file`
  row with only `project_id`, `path` and `kind`
- **THEN** the project has a generated `id`, `is_sample = false`, `node_count = 0`,
  `edge_count = 0` and a non-null `created_at`
- **AND** the file has a generated `id` and `redacted = false`

### Requirement: Project table

The schema SHALL provide a `project` table whose `name` is required and unique, whose `root_path` is
required, whose `language` is required and limited to `php` or `typescript`, and whose `framework`
is optional and limited to `laravel`, `fastify` or `none`.

#### Scenario: Duplicate project name is rejected

- **WHEN** two `project` rows with the same `name` are inserted
- **THEN** the database rejects the second insert

#### Scenario: Unknown language is rejected

- **WHEN** a `project` row with `language = 'python'` is inserted
- **THEN** the database rejects the insert

### Requirement: File table

The schema SHALL provide a `file` table that belongs to exactly one `project`, whose `path` is
required and unique within its project, and whose `kind` is required and limited to `source`,
`test`, `doc` or `config`. Deleting a project MUST delete its files.

#### Scenario: Duplicate path within a project is rejected

- **WHEN** two `file` rows with the same `project_id` and `path` are inserted
- **THEN** the database rejects the second insert

#### Scenario: Same path in two projects is accepted

- **WHEN** two `file` rows with the same `path` but different `project_id` are inserted
- **THEN** both inserts succeed

#### Scenario: Deleting a project deletes its files

- **WHEN** a `project` that has `file` rows is deleted
- **THEN** its `file` rows no longer exist

### Requirement: Symbol table

The schema SHALL provide a `symbol` table that belongs to exactly one `file`, with a required
`name`, a `kind` limited to `class`, `interface`, `method`, `function` or `route`, and a required
span where `start_line` is greater than 0 and `end_line` is greater than or equal to `start_line`.
Deleting a file MUST delete its symbols.

#### Scenario: Invalid span is rejected

- **WHEN** a `symbol` row with `start_line = 10` and `end_line = 9` is inserted
- **THEN** the database rejects the insert

#### Scenario: Non-positive start line is rejected

- **WHEN** a `symbol` row with `start_line = 0` is inserted
- **THEN** the database rejects the insert

#### Scenario: Deleting a file deletes its symbols

- **WHEN** a `file` that has `symbol` rows is deleted
- **THEN** its `symbol` rows no longer exist

### Requirement: Edge table

The schema SHALL provide an `edge` table whose `project_id` is required and references `project`
with delete cascade, and which connects a source endpoint to a target endpoint, where each endpoint
references exactly one existing `symbol` or exactly one existing `file`. `kind` is required and
limited to `calls`, `imports`, `extends`, `implements`, `tested_by`, `co_changed` or `describes`;
`resolution` is required and limited to `exact` or `heuristic`; `extractor` is required and MUST NOT
be the empty string; `weight` is optional and, when present, MUST be between 0 and 1 inclusive.
Deleting the edge's project, or a symbol or file referenced by either endpoint, MUST delete the
edge.

The database does NOT require an edge's endpoints to belong to the same project as the edge's
`project_id`. This is an accepted L1 risk: the writers (analyzer adapters) own that consistency.

#### Scenario: Edge without resolution is rejected

- **WHEN** an `edge` row is inserted with `resolution` null
- **THEN** the database rejects the insert

#### Scenario: Empty extractor is rejected

- **WHEN** an `edge` row is inserted with `extractor = ''`
- **THEN** the database rejects the insert

#### Scenario: Endpoint with both a symbol and a file is rejected

- **WHEN** an `edge` row is inserted whose source references both a `symbol` and a `file`
- **THEN** the database rejects the insert

#### Scenario: Endpoint with neither a symbol nor a file is rejected

- **WHEN** an `edge` row is inserted whose target references neither a `symbol` nor a `file`
- **THEN** the database rejects the insert

#### Scenario: Endpoint pointing to a missing row is rejected

- **WHEN** an `edge` row is inserted whose source symbol id does not exist in `symbol`
- **THEN** the database rejects the insert

#### Scenario: File-to-symbol edge is accepted

- **WHEN** an `edge` row is inserted with a `file` source, a `symbol` target, `kind = 'describes'`,
  `resolution = 'heuristic'` and a non-empty `extractor`
- **THEN** the insert succeeds

#### Scenario: Weight at the bounds is accepted

- **WHEN** one `edge` row is inserted with `weight = 0` and another with `weight = 1`
- **THEN** both inserts succeed

#### Scenario: Weight outside 0..1 is rejected

- **WHEN** an `edge` row is inserted with `weight = 1.5`
- **THEN** the database rejects the insert

#### Scenario: Deleting a symbol deletes its edges

- **WHEN** a `symbol` referenced as the target of an `edge` is deleted
- **THEN** that `edge` row no longer exists

#### Scenario: Deleting a file deletes its edges

- **WHEN** a `file` referenced as the source of an `edge` is deleted
- **THEN** that `edge` row no longer exists

#### Scenario: Deleting a project deletes its edges even when the endpoints survive

- **WHEN** an `edge` whose `project_id` is project A connects two files of project B, and project A
  is deleted
- **THEN** that `edge` row no longer exists
- **AND** the files of project B still exist

### Requirement: History, claim, usage and cache column contract

After migration, the tables `commit`, `file_commit`, `claim`, `evidence`, `query_log` and
`cache_entry` SHALL have exactly the columns below (from `readme.md` §3.1), with the stated type,
nullability and default. "enum" means a PostgreSQL enum type restricted to the listed values.
Nullability follows two rules:

- A column that §3.1 marks `not null` or gives an explicit default is NOT NULL (with that default,
  if any). Every other column not covered by the next rule is nullable.
- Audit timestamp columns (`*_at`) that §3.1 does not mark are NOT NULL DEFAULT `now()`, the same
  convention as the L1 `project.created_at` (author decision). This applies to
  `claim.created_at`, `claim.updated_at`, `query_log.created_at` and `cache_entry.created_at`;
  `commit.committed_at` (a Git value, not an audit column) and `cache_entry.last_hit_at` (unset
  until the first hit) stay nullable.

Every `id` is a `uuid`
primary key generated by the database when omitted; `file_commit` has no `id` and its primary key
is the pair (`file_id`, `commit_id`).

| Table | Column | Type | Null | Default |
|---|---|---|---|---|
| `commit` | `id` | uuid | NOT NULL | generated |
| `commit` | `project_id` | uuid | NOT NULL | — |
| `commit` | `sha` | text | NOT NULL | — |
| `commit` | `message` | text | NULL | — |
| `commit` | `author_hash` | text | NULL | — |
| `commit` | `committed_at` | timestamptz | NULL | — |
| `commit` | `pr_number` | integer | NULL | — |
| `file_commit` | `file_id` | uuid | NOT NULL | — |
| `file_commit` | `commit_id` | uuid | NOT NULL | — |
| `file_commit` | `lines_added` | integer | NULL | — |
| `file_commit` | `lines_removed` | integer | NULL | — |
| `claim` | `id` | uuid | NOT NULL | generated |
| `claim` | `project_id` | uuid | NOT NULL | — |
| `claim` | `subject` | text | NOT NULL | — |
| `claim` | `predicate` | text | NOT NULL | — |
| `claim` | `object` | text | NULL | — |
| `claim` | `layer` | enum (`L1`, `L2`) | NOT NULL | — |
| `claim` | `type` | enum (`FACT`, `INFERENCE`, `UNKNOWN`) | NOT NULL | — |
| `claim` | `confidence` | double precision | NULL | — |
| `claim` | `status` | enum (`current`, `stale`) | NOT NULL | `current` |
| `claim` | `provenance` | jsonb | NULL | — |
| `claim` | `created_at` | timestamptz | NOT NULL | `now()` |
| `claim` | `updated_at` | timestamptz | NOT NULL | `now()` |
| `evidence` | `id` | uuid | NOT NULL | generated |
| `evidence` | `claim_id` | uuid | NOT NULL | — |
| `evidence` | `file_id` | uuid | NOT NULL | — |
| `evidence` | `start_line` | integer | NOT NULL | — |
| `evidence` | `end_line` | integer | NOT NULL | — |
| `evidence` | `verification` | enum (`none`, `cited`, `entailed`, `broken`) | NOT NULL | — |
| `evidence` | `excerpt` | text | NULL | — |
| `query_log` | `id` | uuid | NOT NULL | generated |
| `query_log` | `project_id` | uuid | NOT NULL | — |
| `query_log` | `question` | text | NOT NULL | — |
| `query_log` | `capability` | enum (`explain`, `impact`, `drift`) | NOT NULL | — |
| `query_log` | `input_tokens` | integer | NULL | — |
| `query_log` | `output_tokens` | integer | NULL | — |
| `query_log` | `baseline_tokens` | integer | NULL | — |
| `query_log` | `cost_usd` | numeric(10,6) | NULL | — |
| `query_log` | `latency_ms` | integer | NULL | — |
| `query_log` | `cache_hit` | boolean | NOT NULL | `false` |
| `query_log` | `created_at` | timestamptz | NOT NULL | `now()` |
| `cache_entry` | `id` | uuid | NOT NULL | generated |
| `cache_entry` | `project_id` | uuid | NOT NULL | — |
| `cache_entry` | `question_normalized` | text | NOT NULL | — |
| `cache_entry` | `question_embedding` | vector(1536) | NULL | — |
| `cache_entry` | `response` | jsonb | NULL | — |
| `cache_entry` | `hit_count` | integer | NOT NULL | `0` |
| `cache_entry` | `created_at` | timestamptz | NOT NULL | `now()` |
| `cache_entry` | `last_hit_at` | timestamptz | NULL | — |

#### Scenario: Migrated schema matches the history, claim, usage and cache column contract

- **WHEN** `npm run db:migrate` runs against an empty database
- **THEN** for each of `commit`, `file_commit`, `claim`, `evidence`, `query_log` and `cache_entry`,
  the set of columns equals the set in the table above
- **AND** every column has the listed type, nullability and default
- **AND** the primary key of `file_commit` is (`file_id`, `commit_id`) and every other table's
  primary key is `id`

#### Scenario: Defaults apply on a minimal claim, query log and cache entry

- **WHEN** a `claim` row is inserted with only `project_id`, `subject`, `predicate`, `layer = 'L1'`
  and `type = 'FACT'`, a `query_log` row with only `project_id`, `question` and `capability`, and a
  `cache_entry` row with only `project_id` and `question_normalized`
- **THEN** the claim has a generated `id`, `status = 'current'` and non-null `created_at` and
  `updated_at`
- **AND** the query log has a generated `id`, `cache_hit = false` and a non-null `created_at`
- **AND** the cache entry has a generated `id`, `hit_count = 0` and a non-null `created_at`

### Requirement: Commit table

The schema SHALL provide a `commit` table that belongs to exactly one `project`, whose `sha` is
required and unique within its project. The table has no column for an author's name or e-mail:
the author is stored only as `author_hash`. Deleting a project MUST delete its commits.

#### Scenario: Duplicate sha within a project is rejected

- **WHEN** two `commit` rows with the same `project_id` and `sha` are inserted
- **THEN** the database rejects the second insert

#### Scenario: Same sha in two projects is accepted

- **WHEN** two `commit` rows with the same `sha` but different `project_id` are inserted
- **THEN** both inserts succeed

#### Scenario: Deleting a project deletes its commits

- **WHEN** a `project` that has `commit` rows is deleted
- **THEN** its `commit` rows no longer exist

### Requirement: File-commit table

The schema SHALL provide a `file_commit` table that joins one existing `file` to one existing
`commit`, where each (`file_id`, `commit_id`) pair appears at most once. Deleting the file or the
commit MUST delete the row.

The database does NOT require the file and the commit to belong to the same project. This is the
same accepted risk as the L1 edge endpoints: the writers own that consistency.

#### Scenario: Duplicate file and commit pair is rejected

- **WHEN** two `file_commit` rows with the same `file_id` and `commit_id` are inserted
- **THEN** the database rejects the second insert

#### Scenario: File-commit pointing to a missing commit is rejected

- **WHEN** a `file_commit` row is inserted whose `commit_id` does not exist in `commit`
- **THEN** the database rejects the insert

#### Scenario: File-commit pointing to a missing file is rejected

- **WHEN** a `file_commit` row is inserted whose `file_id` does not exist in `file`
- **THEN** the database rejects the insert

#### Scenario: Deleting a file deletes its file-commit rows

- **WHEN** a `file` that has `file_commit` rows is deleted
- **THEN** its `file_commit` rows no longer exist
- **AND** the `commit` rows still exist

#### Scenario: Deleting a commit deletes its file-commit rows

- **WHEN** a `commit` that has `file_commit` rows is deleted
- **THEN** its `file_commit` rows no longer exist
- **AND** the `file` rows still exist

### Requirement: Claim table

The schema SHALL provide a `claim` table that belongs to exactly one `project`, with a required
`subject` and `predicate`, a required `layer` limited to `L1` or `L2`, a required `type` limited to
`FACT`, `INFERENCE` or `UNKNOWN`, a `status` limited to `current` or `stale`, and an optional
`confidence` that, when present, MUST be between 0 and 1 inclusive. The database MUST enforce the
fact/inference distinction with two named constraints:

- `fact_only_from_l1`: a claim with `type = 'FACT'` MUST have `layer = 'L1'`.
- `l2_requires_provenance`: a claim with `layer = 'L2'` MUST have a non-null `provenance`.
  The constraint rejects SQL `NULL` only: a JSON `null` (`'null'::jsonb`) and any JSON shape are
  accepted here. Validating the provenance content belongs to the writer (CM-HU-09).

Deleting a project MUST delete its claims.

#### Scenario: Fact from the inferred layer is rejected

- **WHEN** a `claim` row is inserted with `type = 'FACT'`, `layer = 'L2'` and a non-null
  `provenance`
- **THEN** the database rejects the insert
- **AND** the rejection names the constraint `fact_only_from_l1`

#### Scenario: Inferred claim without provenance is rejected

- **WHEN** a `claim` row is inserted with `type = 'INFERENCE'`, `layer = 'L2'` and `provenance`
  null
- **THEN** the database rejects the insert
- **AND** the rejection names the constraint `l2_requires_provenance`

#### Scenario: Fact from the observed layer without provenance is accepted

- **WHEN** a `claim` row is inserted with `type = 'FACT'`, `layer = 'L1'` and `provenance` null
- **THEN** the insert succeeds

#### Scenario: Inference from the inferred layer with provenance is accepted

- **WHEN** a `claim` row is inserted with `type = 'INFERENCE'`, `layer = 'L2'` and a non-null
  `provenance`
- **THEN** the insert succeeds

#### Scenario: Invalid claim type is rejected

- **WHEN** a `claim` row is inserted with `type = 'GUESS'`
- **THEN** the database rejects the insert

#### Scenario: Confidence at the bounds is accepted

- **WHEN** one `claim` row is inserted with `confidence = 0` and another with `confidence = 1`
- **THEN** both inserts succeed

#### Scenario: Confidence outside 0..1 is rejected

- **WHEN** a `claim` row is inserted with `confidence = 1.5`
- **THEN** the database rejects the insert

#### Scenario: Deleting a project deletes its claims

- **WHEN** a `project` that has `claim` rows is deleted
- **THEN** its `claim` rows no longer exist

### Requirement: Evidence table

The schema SHALL provide an `evidence` table where each row belongs to exactly one existing `claim`
and cites exactly one existing `file`, with a required span where `start_line` is greater than 0
and `end_line` is greater than or equal to `start_line`, and a required `verification` limited to
`none`, `cited`, `entailed` or `broken`. Deleting the claim MUST delete its evidence. Deleting the
cited file MUST delete the evidence and MUST NOT delete the claim.

The database does NOT require the cited file to belong to the claim's project (accepted risk, as
for `file_commit`).

#### Scenario: Invalid evidence span is rejected

- **WHEN** an `evidence` row with `start_line = 10` and `end_line = 9` is inserted
- **THEN** the database rejects the insert

#### Scenario: Single-line evidence span is accepted

- **WHEN** an `evidence` row with `start_line = 10` and `end_line = 10` is inserted
- **THEN** the insert succeeds

#### Scenario: Non-positive evidence start line is rejected

- **WHEN** an `evidence` row with `start_line = 0` is inserted
- **THEN** the database rejects the insert

#### Scenario: Evidence without verification is rejected

- **WHEN** an `evidence` row is inserted with `verification` null
- **THEN** the database rejects the insert

#### Scenario: Deleting a claim deletes its evidence

- **WHEN** a `claim` that has `evidence` rows is deleted
- **THEN** its `evidence` rows no longer exist

#### Scenario: Deleting a cited file deletes the evidence but keeps the claim

- **WHEN** a `file` cited by an `evidence` row is deleted
- **THEN** that `evidence` row no longer exists
- **AND** the `claim` it supported still exists

### Requirement: Query log table

The schema SHALL provide a `query_log` table that belongs to exactly one `project`, with a required
`question` and a required `capability` limited to `explain`, `impact` or `drift` (`drift` is
accepted although its feature is planned, not delivered). Deleting a project MUST delete its query
log rows.

#### Scenario: Planned drift capability is accepted

- **WHEN** a `query_log` row is inserted with `capability = 'drift'`
- **THEN** the insert succeeds

#### Scenario: Unknown capability is rejected

- **WHEN** a `query_log` row is inserted with `capability = 'summarise'`
- **THEN** the database rejects the insert

#### Scenario: Deleting a project deletes its query log

- **WHEN** a `project` that has `query_log` rows is deleted
- **THEN** its `query_log` rows no longer exist

### Requirement: Cache entry table

The schema SHALL provide a `cache_entry` table that belongs to exactly one `project`, with a
required `question_normalized`. Deleting a project MUST delete its cache entries.

The database does NOT require `question_normalized` to be unique within a project; whether it must
be is decided by the cache feature that writes the table.

#### Scenario: Cache entry without a normalized question is rejected

- **WHEN** a `cache_entry` row is inserted with `question_normalized` null
- **THEN** the database rejects the insert

#### Scenario: Deleting a project deletes its cache entries

- **WHEN** a `project` that has `cache_entry` rows is deleted
- **THEN** its `cache_entry` rows no longer exist

### Requirement: Query and vector indexes

After migration, the schema SHALL provide exactly the secondary indexes below, and no other.
"Secondary" means every index except those implied by primary keys and unique constraints. Each
row fixes the table, the key columns in order, the
access method and, for a partial index, its predicate. None of these indexes is unique, none has
`INCLUDE` (non-key) columns, and every btree key column uses its type's default operator class.
Index names are not part of this contract.

| Table | Key columns (in order) | Method | Predicate | Purpose |
|---|---|---|---|---|
| `edge` | `source_symbol_id`, `kind` | btree | `source_symbol_id IS NOT NULL` | traversal from a symbol; cascade from `symbol` |
| `edge` | `source_file_id`, `kind` | btree | `source_file_id IS NOT NULL` | traversal from a file; cascade from `file` |
| `edge` | `target_symbol_id`, `kind` | btree | `target_symbol_id IS NOT NULL` | traversal to a symbol; cascade from `symbol` |
| `edge` | `target_file_id`, `kind` | btree | `target_file_id IS NOT NULL` | traversal to a file; cascade from `file` |
| `edge` | `project_id` | btree | — | cascade from `project` |
| `symbol` | `file_id` | btree | — | symbols of a file; cascade from `file` |
| `file` | `project_id`, `content_hash` | btree | — | unchanged-file lookup on re-index (`readme.md` §3.2) |
| `file_commit` | `commit_id` | btree | — | files of a commit (co-change); cascade from `commit` |
| `claim` | `project_id`, `status` | btree | `status = 'stale'` | lazy re-inference of stale claims (`readme.md` §3.2) |
| `claim` | `project_id` | btree | — | cascade from `project` |
| `evidence` | `claim_id` | btree | — | evidence of a claim; cascade from `claim` |
| `evidence` | `file_id` | btree | — | evidence citing a file (invalidation); cascade from `file` |
| `query_log` | `project_id` | btree | — | cascade from `project` |
| `cache_entry` | `project_id` | btree | — | cascade from `project` |
| `file` | `embedding` | hnsw, `vector_cosine_ops` | — | semantic search over files |
| `symbol` | `embedding` | hnsw, `vector_cosine_ops` | — | semantic search over symbols |
| `cache_entry` | `question_embedding` | hnsw, `vector_cosine_ops` | — | cache hit by question similarity |

#### Scenario: Migrated schema has the query and vector indexes

- **WHEN** `npm run db:migrate` runs against an empty database
- **THEN** for every row of the table above, the database has an index on that table with exactly
  those key columns in that order, that access method (and operator class for the HNSW rows) and
  that predicate
- **AND** none of them is unique or has `INCLUDE` columns, and no btree one uses a non-default
  operator class
- **AND** no other secondary index exists

#### Scenario: Every cascading foreign key is indexed

- **WHEN** `npm run db:migrate` runs against an empty database
- **THEN** every foreign-key column declared with `ON DELETE CASCADE` is the first key column of at
  least one index on its table, whether from a primary key, a unique constraint or the table above

### Requirement: Stale invalidation on content change

When the `content_hash` of a `file` row changes, the database itself SHALL mark as `stale`, in the
same statement, every claim with `status = 'current'` that has at least one `evidence` row citing
that file. It SHALL also set `updated_at` to the transaction time (`now()`) on each claim it changes. A change
means the new value is distinct from the old one. So setting a hash on a file whose hash was
`NULL` counts as a change, and so does clearing a hash to `NULL`: the content is no longer known,
so the citations are no longer guaranteed. The database MUST NOT touch a claim that is already `stale`, and MUST
NOT turn any claim back to `current`: recomputing claims is the lazy re-inference's job.
The invalidation MUST depend only on the old and new values of `content_hash`. It MUST NOT depend
on which columns the `UPDATE` names: a hash changed by another trigger still counts. It MUST NOT
depend on the session's `search_path` either, including a session temporary table that has the
same name as a schema table.
The guarantee covers the `evidence` rows that are visible to the statement that changes the hash:
rows committed before it, or written earlier in the same transaction. It does not cover `evidence`
that a concurrent transaction has not yet committed, or evidence written after the change but
inferred from the old content. Guarding against those is the writers' job.

#### Scenario: Changing a file's content hash marks the claims that cite it stale

- **GIVEN** a `current` claim with an `evidence` row citing a file, and an `updated_at` in the past
- **WHEN** that file's `content_hash` is updated to a different value
- **THEN** the claim has `status = 'stale'`
- **AND** its `updated_at` equals the transaction time of the update (`now()`), which is later
  than before

#### Scenario: Claims citing only other files stay current

- **GIVEN** a `current` claim whose only evidence cites file A, and another `current` claim whose
  evidence cites file B
- **WHEN** the `content_hash` of file B changes
- **THEN** the claim citing only file A still has `status = 'current'` and an unchanged
  `updated_at`
- **AND** the claim citing file B has `status = 'stale'`

#### Scenario: Updating other columns of a file leaves its claims current

- **GIVEN** a `current` claim with evidence citing a file
- **WHEN** that file's `loc` and `redacted` columns are updated and `content_hash` is not
- **THEN** the claim still has `status = 'current'`

#### Scenario: Writing the same content hash again leaves claims current

- **GIVEN** a `current` claim with evidence citing a file whose `content_hash` is `h1`
- **WHEN** that file's `content_hash` is updated to `h1`
- **THEN** the claim still has `status = 'current'`

#### Scenario: Setting a first content hash marks the claims that cite it stale

- **GIVEN** a `current` claim with evidence citing a file whose `content_hash` is `NULL`
- **WHEN** that file's `content_hash` is set to a value
- **THEN** the claim has `status = 'stale'`

#### Scenario: Clearing a content hash marks the claims that cite it stale

- **GIVEN** a `current` claim with evidence citing a file whose `content_hash` is `h1`
- **WHEN** that file's `content_hash` is set to `NULL`
- **THEN** the claim has `status = 'stale'`

#### Scenario: A claim already stale is not touched

- **GIVEN** a `stale` claim with evidence citing a file, and an `updated_at` in the past
- **WHEN** that file's `content_hash` changes
- **THEN** the claim still has `status = 'stale'`
- **AND** its `updated_at` is unchanged

#### Scenario: A claim citing several files becomes stale when one of them changes

- **GIVEN** a `current` claim with evidence citing file A and file B
- **WHEN** only file B's `content_hash` changes
- **THEN** the claim has `status = 'stale'`

#### Scenario: One statement that changes several files marks every claim citing them stale

- **GIVEN** a `current` claim citing files A and B, a `current` claim citing only file B, and a
  `current` claim citing only file C, all with an `updated_at` in the past
- **WHEN** a single `UPDATE` statement changes the `content_hash` of both A and B
- **THEN** the claims citing A and B, and only B, have `status = 'stale'` and an `updated_at` equal
  to the transaction time (`now()`)
- **AND** the claim citing only C still has `status = 'current'` and an unchanged `updated_at`

#### Scenario: An upsert that changes a file's content hash marks the claims that cite it stale

- **GIVEN** a `current` claim with evidence citing a file, and an `updated_at` in the past
- **WHEN** `INSERT … ON CONFLICT (project_id, path) DO UPDATE SET content_hash = EXCLUDED.content_hash`
  runs with that file's project and path and a different hash
- **THEN** no new `file` row exists, and the file has the new hash
- **AND** the claim has `status = 'stale'` and an `updated_at` equal to the transaction time
  (`now()`)

#### Scenario: A content hash rewritten by another trigger still marks the claims that cite it stale

- **GIVEN** a `current` claim with evidence citing a file, and a `BEFORE UPDATE` trigger on
  `file` that sets a new `content_hash` on that file
- **WHEN** that file is updated with a statement that sets only `loc`
- **THEN** the claim has `status = 'stale'`

#### Scenario: Invalidation works whatever the session's search_path

- **GIVEN** a `current` claim with evidence citing a file, and a session whose `search_path` is
  `pg_catalog` only
- **WHEN** that file's `content_hash` is updated through a schema-qualified statement
- **THEN** the update succeeds
- **AND** the claim has `status = 'stale'`

#### Scenario: A session temporary table named claim does not intercept invalidation

- **GIVEN** a `current` claim with evidence citing a file, and a session temporary table named
  `claim`
- **WHEN** that file's `content_hash` is updated
- **THEN** the claim in the schema table has `status = 'stale'`
- **AND** the temporary table is unchanged
