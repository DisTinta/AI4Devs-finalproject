## MODIFIED Requirements

### Requirement: Golden answers are loaded with the seed

After executing the seed's statements and inside the same transaction, the seed load SHALL save, for
every entry of every golden file read, one answer cache entry of the seed project named by the file's
`project`, keyed by the entry's `questionNormalized`, holding its `response`, with a hit count of `0`
and no last hit, through the same store operation the answer cache uses; and then, for every entry of
every golden drift file read (see "Golden drift files are checked before connecting"), one answer
cache entry of the seed project named by the file's `project`, keyed by the entry's `key`, holding its
`response`, through the same operation. A failure while saving SHALL fail the load as `INTERNAL` and
roll the whole load back. Cache entries of non-sample projects SHALL never be touched. The golden
directory and the golden drift directory are read independently: either may be missing or empty.

#### Scenario: Golden answers are loaded and served in evaluation mode

- **GIVEN** a migrated database without projects, the versioned seed, a golden drift directory that
  does not exist, and a golden directory holding
  a valid `acme-shop.json` whose fingerprints are not the ones of the current code, with one entry for
  `¿Cómo se calcula el precio final de un pedido?` and another for `¿Cómo se validan los cupones?`
- **WHEN** the seed load runs, and then `POST /api/projects/{acme-shop's id}/ask` is sent in
  evaluation mode with `{ "question": "COMO SE CALCULA EL PRECIO FINAL DE UN PEDIDO" }`
- **THEN** the load exits with `0` with the same stdout as without golden answers; acme-shop has
  exactly two `cache_entry` rows, keyed by the two normalized questions, holding the two responses,
  with `hit_count` `0`; the request answers `200` with the first entry's answer, statements and
  evidence, `usage.cacheHit` `true` and `usage.costUsd` `0`, without calling the model; and that
  entry's `hit_count` is then `1`

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
- **THEN** it exits with `0`; acme-shop has exactly two `cache_entry` rows, with `hit_count` `0`; and
  the non-sample project's cache entry keeps its id, response and hit count

#### Scenario: A failed golden save leaves the database unchanged

- **GIVEN** a database holding a loaded seed and its golden answers, recorded, and a load whose save
  of the second golden entry fails
- **WHEN** the seed load runs
- **THEN** it exits with `1` and `INTERNAL` with the message `seed load failed; the database is
  unchanged`; the projects, their rows and the `cache_entry` rows are those recorded

## ADDED Requirements

### Requirement: Golden drift files are checked before connecting

After reading the golden files, the seed load SHALL read every file whose name ends in `.json`
directly in the directory `seeds/drift/` of the repository, in name order (code-unit order); a missing
or empty directory means no golden drift report. Each such file SHALL fail with `INVALID_SEED`,
`details.reason` = `cache`, `details.file` = the file named as the seed is named, and the message
`<file> is not a loadable codemind golden file`, when: it is not valid JSON; it is not a valid golden
drift file (`drift-golden` → "Golden drift file format"), which includes an entry whose `response` is
not a stored drift report (`drift-detection` → "Golden drift report lookup"); its `project` is not the
name of a project of the seed, or its file name is not `<project>.json`; or two entries share an `id`
or a `key`. The fingerprints of a golden drift file SHALL NOT be checked. These checks SHALL happen
before any database connection is opened. The loaded golden drift reports SHALL NOT change stdout.

#### Scenario: An invalid golden drift file fails before connecting

- **GIVEN** a valid `DATABASE_URL`, a seed whose only project is `acme-shop`, an empty golden
  directory, and a golden drift directory holding, one at a time: `acme-shop.json` with broken JSON;
  a valid golden drift file whose `project` is `other-api` named `other-api.json`; a valid acme-shop
  golden drift file named `other.json`; one with two entries of the same `key`; one whose entry's
  `response` holds the extra key `events`; and one whose entry's `key` is `pricing`
- **WHEN** the seed load runs
- **THEN** each run exits with `1`, stdout is empty, stderr holds one error line with code
  `INVALID_SEED`, `details.reason` = `cache`, `details.file` = the golden drift file's displayed path
  and the message `<file> is not a loadable codemind golden file`; no database connection is opened

#### Scenario: A golden drift report is loaded under its key

- **GIVEN** a migrated database without projects, the versioned seed, an empty golden directory, and a
  golden drift directory holding a valid `acme-shop.json` with one entry under the key `drift:`
- **WHEN** the seed load runs, and then runs again
- **THEN** each run exits with `0` with the same stdout as "The seed is loaded into an empty
  database"; after each, acme-shop has exactly one `cache_entry` row, keyed `drift:`, holding the
  entry's `response`, with `hit_count` `0` and no last hit
