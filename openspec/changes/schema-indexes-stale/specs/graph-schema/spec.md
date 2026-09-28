## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Query and vector indexes

After migration, the schema SHALL provide exactly the secondary indexes below, and no other.
"Secondary" means every index except those implied by primary keys and unique constraints. Each
row fixes the table, the key columns in order, the
access method and, for a partial index, its predicate. Index names are not part of this contract.

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
- **AND** no other secondary index exists

#### Scenario: Every cascading foreign key is indexed

- **WHEN** `npm run db:migrate` runs against an empty database
- **THEN** every foreign-key column declared with `ON DELETE CASCADE` is the first key column of at
  least one index on its table, whether from a primary key, a unique constraint or the table above

### Requirement: Stale invalidation on content change

When the `content_hash` of a `file` row changes, the database itself SHALL mark as `stale`, in the
same statement, every claim with `status = 'current'` that has at least one `evidence` row citing
that file. It SHALL also set `updated_at` to the transaction time (`now()`) on each claim it changes. A change
means the new value is distinct from the old one, so setting a hash on a file whose hash was
`NULL` counts as a change. The database MUST NOT touch a claim that is already `stale`, and MUST
NOT turn any claim back to `current`: recomputing claims is the lazy re-inference's job.

#### Scenario: Changing a file's content hash marks the claims that cite it stale

- **GIVEN** a `current` claim with an `evidence` row citing a file, and an `updated_at` in the past
- **WHEN** that file's `content_hash` is updated to a different value
- **THEN** the claim has `status = 'stale'`
- **AND** its `updated_at` is later than before the update

#### Scenario: Claims citing only other files stay current

- **GIVEN** a `current` claim whose only evidence cites file A
- **WHEN** the `content_hash` of another file B changes
- **THEN** the claim still has `status = 'current'`

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

#### Scenario: A claim already stale is not touched

- **GIVEN** a `stale` claim with evidence citing a file, and an `updated_at` in the past
- **WHEN** that file's `content_hash` changes
- **THEN** the claim still has `status = 'stale'`
- **AND** its `updated_at` is unchanged

#### Scenario: A claim citing several files becomes stale when one of them changes

- **GIVEN** a `current` claim with evidence citing file A and file B
- **WHEN** only file B's `content_hash` changes
- **THEN** the claim has `status = 'stale'`
