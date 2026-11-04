## MODIFIED Requirements

### Requirement: Golden answers are loaded with the seed

After executing the seed's statements and inside the same transaction, the seed load SHALL save, for
every entry of every golden file read, one answer cache entry of the seed project named by the file's
`project`, keyed by the entry's `questionNormalized`, holding its `response` and, when the entry's
`questionEmbedding` is a vector, that vector as the entry's question embedding (no embedding when it is
`null`), with a hit count of `0` and no last hit, through the same store operation the answer cache
uses; and then, for every entry of every golden drift file read (see "Golden drift files are checked
before connecting"), one answer cache entry of the seed project named by the file's `project`, keyed by
the entry's `key`, holding its `response`, without embedding, through the same operation. A failure
while saving SHALL fail the load as `INTERNAL` and roll the whole load back. Cache entries of
non-sample projects SHALL never be touched. The golden directory and the golden drift directory are
read independently: either may be missing or empty. A golden answer loaded with its embedding SHALL be
found by the similarity step of the answer cache (`semantic-cache`, "Similarity lookup in explain")
like any live answer saved with its embedding.

#### Scenario: Golden answers are loaded and served in evaluation mode

- **GIVEN** a migrated database without projects, the versioned seed, a golden drift directory that
  does not exist, and a golden directory holding
  a valid `acme-shop.json` whose fingerprints are not the ones of the current code, with one entry for
  `¿Cómo se calcula el precio final de un pedido?` whose `questionEmbedding` is a usable vector V and
  another for `¿Cómo se validan los cupones?` whose `questionEmbedding` is `null`
- **WHEN** the seed load runs, and then `POST /api/projects/{acme-shop's id}/ask` is sent in
  evaluation mode with `{ "question": "COMO SE CALCULA EL PRECIO FINAL DE UN PEDIDO" }`
- **THEN** the load exits with `0` with the same stdout as without golden answers; acme-shop has
  exactly two `cache_entry` rows, keyed by the two normalized questions, holding the two responses,
  with `hit_count` `0`; the first row's `question_embedding` is V and the second's is `NULL`; the
  request answers `200` with the first entry's answer, statements and evidence, `usage.cacheHit`
  `true` and `usage.costUsd` `0`, without calling the model; and that entry's `hit_count` is then `1`

#### Scenario: A seed without golden files loads only the graph

- **GIVEN** a migrated database without projects and the versioned seed, with a golden drift directory
  that does not exist and a golden directory that does not exist; then one that is empty; then one
  holding only `README.md` and a subdirectory `old/` with a valid `acme-shop.json`
- **WHEN** the seed load runs
- **THEN** each run exits with `0` with the same stdout as "The seed is loaded into an empty
  database", and acme-shop has no `cache_entry` row

#### Scenario: Loading golden answers again does not duplicate them

- **GIVEN** the database after "Golden answers are loaded and served in evaluation mode", and a
  non-sample project with one cache entry
- **WHEN** the seed load runs again with the same golden directory and golden drift directory
- **THEN** it exits with `0`; acme-shop has exactly two `cache_entry` rows, with `hit_count` `0`, the
  first still holding V and the second no embedding; and the non-sample project's cache entry keeps
  its id, response and hit count

#### Scenario: A failed golden save leaves the database unchanged

- **GIVEN** a database holding a loaded seed and its golden answers, recorded, and a load whose save
  of the second golden entry fails; then a load, with a golden drift directory holding a valid
  `acme-shop.json`, whose save of the `drift:` entry fails
- **WHEN** the seed load runs
- **THEN** each run exits with `1` and `INTERNAL` with the message `seed load failed; the database is
  unchanged`; the projects, their rows and the `cache_entry` rows are those recorded

#### Scenario: A rephrased golden question is a similarity hit after the seed

- **GIVEN** a migrated database without projects, loaded by the seed load from the versioned seed and
  the versioned golden files, and `explain` in live mode with a scripted model whose embedding request
  for the key of «¿Cómo se calcula el precio total de un pedido?» answers exactly the
  `questionEmbedding` of acme-shop's golden entry `Q1`
- **WHEN** acme-shop is asked «¿Cómo se calcula el precio total de un pedido?»
- **THEN** the answer is served from the cache entry of `Q1` (its answer, statements and evidence),
  with `usage.cacheHit` `true`; the model received one embedding request and no completion; and that
  entry's `hit_count` is `1`
