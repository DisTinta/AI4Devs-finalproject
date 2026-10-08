## Purpose

Lets the author regenerate the versioned seed of the sample repositories: `npm run seed:build`
rebuilds the sample history, indexes it with the real pipeline without committing anything to the
database, and writes `seeds/graph-dump.sql` byte for byte reproducibly, with the fingerprint that
tells when the seed no longer matches the code.

## ADDED Requirements

### Requirement: Command contract and configuration

`npm run seed:build` SHALL take no arguments. It SHALL read `AUTHOR_HASH_SALT` and `DATABASE_URL`
from the environment, trimmed; a variable that is unset, empty or only whitespace SHALL fail with
`MISSING_CONFIG` and `details.variable` naming it (`AUTHOR_HASH_SALT` is checked first). Both
checks SHALL happen before the history is rebuilt, before any database connection and before the
seed file is touched.

`ALLOWED_REPOS_DIR` of the environment SHALL be ignored: the allowed root of the build SHALL be the
repository's `fixtures/` directory.

The exit code SHALL be `0` on success and `1` on any failure. The build SHALL print no progress. On
success, stdout SHALL be exactly one line,
`acme-shop: <files> files, <symbols> symbols, <edges> edges, <commits> commits -> <output>`, with the
counts of the written seed, and stderr SHALL be empty. `<output>` SHALL be the seed file's path
relative to the repository root, with `/` separators, when the file is inside the repository root;
when it is outside (for example under the OS temporary directory, or on another drive on Windows),
`<output>` SHALL be only the file name. On failure, stdout SHALL stay empty and stderr SHALL hold
exactly one line, `{"error":{"code","message","details"}}`, and nothing else, with the codes of the
`index` command for the same failures (`MISSING_CONFIG`, `DATABASE_UNAVAILABLE`,
`PROJECT_NAME_TAKEN`, `FORBIDDEN_PATH`, `INVALID_GRAPH`, `NOT_A_GIT_REPOSITORY`, `EMPTY_REPOSITORY`)
and `INTERNAL` for anything else. An `INTERNAL` failure SHALL have the message
`seed build failed; nothing was written`. No output SHALL contain an absolute path, the database URL
or its credentials, or the text `may have been saved`.

#### Scenario: Missing configuration fails before anything else

- **GIVEN** a previous seed file with known content, and `AUTHOR_HASH_SALT` unset, then empty, then
  `'   '`; and then a valid salt with `DATABASE_URL` unset, then `'   '`
- **WHEN** the seed build runs
- **THEN** each run exits with `1`, stdout is empty, stderr holds one error line with code
  `MISSING_CONFIG` and `details.variable` = `AUTHOR_HASH_SALT` or `DATABASE_URL`; the history is not
  rebuilt, no database connection is opened, and the previous seed file is unchanged

#### Scenario: An unreachable database is reported without its URL

- **GIVEN** a valid salt and `DATABASE_URL=postgres://u:s3cret@127.0.0.1:1/db`, and a previous seed
  file with known content
- **WHEN** the seed build runs
- **THEN** it exits with `1` and `DATABASE_UNAVAILABLE`; neither stdout nor stderr contains the URL,
  `s3cret` or `u:`; the previous seed file is unchanged

#### Scenario: The allowed repositories directory of the environment is ignored

- **GIVEN** a migrated database, a valid salt, and `ALLOWED_REPOS_DIR` empty, and then pointing to an
  unrelated existing directory
- **WHEN** the seed build runs
- **THEN** each run exits with `0` and writes the same seed as a run without `ALLOWED_REPOS_DIR`

### Requirement: Seed content

The seed SHALL hold exactly one project, `acme-shop`, built from the sample repository with its
history rebuilt from the versioned manifest, and SHALL contain, in this order: one `INSERT` into
`project`, then the `INSERT`s into `file`, `symbol`, `edge`, `commit` and `file_commit`. Every
`INSERT` SHALL name its columns explicitly. The seed SHALL NOT contain rows of `claim`, `evidence`,
`query_log` or `cache_entry`, any `embedding` value, any `DELETE`, `ON CONFLICT`, transaction
statement or session setting.

The project row SHALL have `name = 'acme-shop'`, `is_sample = true`, `language = 'php'`,
`framework = 'laravel'`, `root_path = 'fixtures/acme-shop'`, `indexed_commit` = the `HEAD` commit
of the rebuilt history, `created_at` and `indexed_at` = that commit's date, `node_count` = the
number of `file` plus `symbol` rows of the seed and `edge_count` = the number of `edge` rows.

The seed SHALL NOT contain a secret the indexing redacts, an absolute path of the machine that built
it, or a commit author's name or e-mail address (authors appear only as `author_hash`).

#### Scenario: The acme-shop seed is generated

- **GIVEN** a migrated database, `AUTHOR_HASH_SALT=test-salt`, and the build pointed at a copy of
  the sample repository under a temporary directory and at a temporary output file
- **WHEN** the seed build runs
- **THEN** it exits with `0`; the output holds one `project` row with the attributes above and
  `indexed_commit` = `git rev-parse HEAD` of the copy; `file`, `symbol`, `edge`, `commit` and
  `file_commit` rows in that order; `node_count` and `edge_count` equal to the row counts of the
  output; stdout is exactly one line naming the same counts and the output file name, and stderr is
  empty; and the output does not match
  `/AKIA[A-Z0-9]{16}/`, does not contain the temporary directory's path, and does not contain
  `@acme.test`

### Requirement: The database is never changed

The build SHALL NOT commit anything to the database: every row the indexing writes SHALL be read
back and then rolled back, on success and on failure, and the connection SHALL always be closed. The
build SHALL index under the temporary project name `__codemind_seed_build__` and write `acme-shop`
in the seed, so an existing project named `acme-shop` neither blocks the build nor is touched.

#### Scenario: The database is unchanged after a build

- **GIVEN** a migrated database and the set of its project ids
- **WHEN** the seed build runs and succeeds, using its own connection to `DATABASE_URL`
- **THEN** the set of project ids is the same afterwards and no project named
  `__codemind_seed_build__` exists

#### Scenario: An existing acme-shop project does not block the build

- **GIVEN** a database that already holds a project named `acme-shop`
- **WHEN** the seed build runs
- **THEN** it exits with `0`, writes the seed, and the existing `acme-shop` project keeps its id and
  its row counts

### Requirement: Deterministic identifiers

Every id in the seed SHALL be a version 5 UUID derived, under one fixed namespace, from the row's
natural key, never from an id read from the database. Every key SHALL start with the project's name
in the seed, and its components SHALL be separated by the NUL character, which cannot occur in any
of them. The keys SHALL be:

- project: name;
- file: name, path;
- symbol: name, file path, kind, start line, symbol name;
- commit: name, sha;
- edge: name, kind, resolution, extractor, for its source and its target the endpoint type
  (`file` or `symbol`) followed by that endpoint's key without the project name, and always, last,
  an occurrence index `#n`.

Every edge key SHALL end with its occurrence index, joined with the separator. Edges equal in the
rest of the key SHALL be ordered by weight (a missing weight first) and then by order of appearance,
and SHALL get `#0`, `#1`, … in that order; an edge whose key is unique SHALL get `#0`. Every reference
(`project_id`, `file_id`, `commit_id`, the endpoints of an edge) SHALL point to the derived id of
the row it referenced.

#### Scenario: Ids derive from natural keys, not from the database

- **GIVEN** the rows of one project, with random ids, where an edge links two symbols and a
  file–commit link joins a file and a commit
- **WHEN** the seed is rendered, and then rendered again from the same rows with other random ids
  and the rows of each table shuffled
- **THEN** both outputs are identical byte for byte; each id equals the version 5 UUID of its key;
  and every reference names the derived id of its target row

#### Scenario: Identical edges get distinct ids whatever the row order

- **GIVEN** two edges equal in kind, resolution, extractor, source, target and weight
- **WHEN** the seed is rendered with the rows in several different orders
- **THEN** the two edges have two different ids (keys ending in `#0` and `#1`) and every order
  produces the same output byte for byte

#### Scenario: Keys are prefixed by the project name

- **GIVEN** two projects that each hold a file with the same path
- **WHEN** their file ids are derived
- **THEN** the two ids differ

### Requirement: Canonical values and ordering

Values SHALL be written in one canonical form, independent of the time zone of the process and of
the database session: a timestamp as an ISO-8601 UTC literal with milliseconds
(`'2024-01-02T03:04:05.000Z'`); a double as the shortest decimal that reads back to the same value;
a missing value as `NULL`; a boolean as `true` or `false`; a text as a single-quoted literal with
each `'` doubled, written as an escape string literal when it contains a control character other
than the line feed. Rows SHALL be ordered by their natural key: files by path; symbols by file path,
start line, kind and name; commits by sha; file–commit links by file path and sha; edges by their key.
Text comparisons SHALL use code-unit order, not locale order. The file SHALL use LF line endings and
end with a line feed.

#### Scenario: Values are written in canonical form

- **GIVEN** rows with a timestamp, a weight of `0.1`, a weight of `1`, a missing weight, a commit
  message `O'Brien \ fix`, and a message holding a carriage return
- **WHEN** the seed is rendered
- **THEN** the timestamp is written as `'YYYY-MM-DDTHH:MM:SS.mmmZ'` in UTC, the weights as `0.1`, `1`
  and `NULL`, the first message as `'O''Brien \ fix'`, the second as an escape string literal with
  no raw carriage return, and the output contains no `\r` byte

### Requirement: Byte-for-byte reproducibility

Two builds with the same sources, the same history manifest and the same `AUTHOR_HASH_SALT` SHALL
write identical files, whatever the ids already in the database, the time zone of the process or
the order in which the database returns rows.

#### Scenario: Two consecutive builds produce identical files

- **GIVEN** a migrated database that already holds other projects, and the build of "The acme-shop
  seed is generated"
- **WHEN** the seed build runs twice in a row with the same salt
- **THEN** both outputs are identical byte for byte and none of their ids equals an id in the
  database

#### Scenario: The time zone does not change the file

- **GIVEN** the build of "The acme-shop seed is generated"
- **WHEN** it runs once with the process time zone `UTC` and once with `America/Bogota`
- **THEN** both outputs are identical byte for byte

### Requirement: Fingerprints

The seed SHALL start with the header lines `-- codemind-seed-format: 1`,
`-- analyzer-fingerprint: sha256:<64 lowercase hex>` and
`-- contract-fingerprint: sha256:<64 lowercase hex>`. Each fingerprint SHALL be the SHA-256 of its
inputs, taken in path order, each one as its repository-relative path and its content with line
endings normalised to LF:

- analyzer: every file under `packages/analyzers/php/src/`, `packages/core/src/index/` and
  `packages/core/src/knowledge/`, plus one synthetic input per parser dependency,
  `deps:tree-sitter-php@<version>` and `deps:web-tree-sitter@<version>`, with the versions resolved
  in `package-lock.json`;
- contract: `packages/core/src/ports/AnalyzerPort.ts` and every
  `packages/adapters/store-postgres/migrations/*.up.sql`.

A fingerprint SHALL depend only on those inputs: not on line endings, on the order in which files
are listed, or on any other file.

#### Scenario: A fingerprint ignores line endings and listing order

- **GIVEN** a set of inputs
- **WHEN** the fingerprint is computed twice, once more with the same contents in CRLF, and once more
  with the inputs listed in another order
- **THEN** the four fingerprints are equal

#### Scenario: A fingerprint changes with content, files or parser versions

- **GIVEN** a set of inputs and its fingerprint
- **WHEN** one byte of one input changes, then one input is added, then the resolved version of
  `tree-sitter-php`, and then of `web-tree-sitter`, changes
- **THEN** each of the four fingerprints differs from the original

#### Scenario: Each fingerprint covers exactly its declared inputs

- **GIVEN** a repository tree holding every declared input and a file outside them
  (`packages/api/src/x.ts`)
- **WHEN** a file changes under each analyzer input directory, in `AnalyzerPort.ts` and in one
  `.up.sql` migration, and then the outside file changes
- **THEN** each analyzer change alters only the analyzer fingerprint, each contract change alters only
  the contract fingerprint, and the outside change alters neither

### Requirement: A failed build never leaves a broken seed

The seed file SHALL be replaced only once the whole new content is written; on any failure the
previous file SHALL stay byte for byte as it was and no partial or temporary file SHALL remain. A
failure after the indexing, while its rows are being read back, SHALL be reported as `INTERNAL`
with the message `seed build failed; nothing was written`, with the indexing's writes rolled back
and the connection closed.

#### Scenario: A failed indexing leaves the previous seed intact

- **GIVEN** a previous seed file with known content and an indexing that throws
- **WHEN** the seed build runs
- **THEN** it exits with `1` and `INTERNAL` with the message `seed build failed; nothing was
  written`; stderr holds exactly one line; the transaction is rolled back and released; the seed
  file is unchanged and no temporary
  file remains next to it

#### Scenario: A failed read-back is not reported as saved

- **GIVEN** a previous seed file with known content and an indexing that succeeds, followed by a
  failure while its rows are read back
- **WHEN** the seed build runs
- **THEN** it exits with `1` and `INTERNAL` with the message `seed build failed; nothing was
  written`; no output contains `may have been saved`; nothing was committed (the transaction is
  rolled back and released); the seed file is unchanged
