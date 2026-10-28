## MODIFIED Requirements

### Requirement: Command contract and configuration

`npm run db:seed` SHALL take no arguments. It SHALL read `DATABASE_URL` from the environment,
trimmed; a value that is unset, empty or only whitespace SHALL fail with `MISSING_CONFIG` and
`details.variable` = `DATABASE_URL`. It SHALL NOT require `AUTHOR_HASH_SALT` nor any other variable.
It SHALL read the seed file `seeds/graph-dump.sql` of the repository. The seed's header SHALL be the
leading block of lines that start with `--`; its lines, and every line of the file, SHALL be read
ignoring trailing spaces and a trailing carriage return, so a seed checked out with CRLF line endings
loads like one with LF. The seed SHALL fail with `INVALID_SEED` and `details.reason`, one of this
closed list, when:

- `missing` — the file does not exist;
- `empty` — it is empty or holds only whitespace;
- `format` — its header has no line `-- codemind-seed-format: 1`; or it holds anything other than
  `--` comments, blank lines and readable `INSERT` statements into `project`, `file`, `symbol`,
  `edge`, `commit` and `file_commit` (a `DELETE`, `UPDATE`, `DROP`, `SET`, `COPY` or an `INSERT` into
  another table is rejected); or a `file`, `edge` or `commit` row names no project of the seed, or a
  `symbol` or `file_commit` row names no file of the seed;
- `no-project` — it holds no `INSERT INTO project` statement;
- `not-sample` — any `INSERT INTO project` statement does not set `is_sample` to `true` (every
  project the seed inserts must be a sample).

It SHALL then read every file whose name ends in `.json` directly in the directory `seeds/cache/` of
the repository, in name order (code-unit order); a missing or empty directory means no golden
answers. Each such file SHALL fail with `INVALID_SEED`, `details.reason` = `cache` and
`details.file` = the file named as the seed is named below, when: it is not valid JSON; it is
not a valid golden file (`golden-answers` → "Golden file format"); its `project` is not the name of a
project of the seed, or its file name is not `<project>.json`; an entry's `questionNormalized`
differs from the normalized `question`; two entries share an `id` or a `questionNormalized`; or an
entry's `response` is not a stored answered response the answer cache accepts. Its message SHALL be
`<file> is not a loadable codemind golden file`. The fingerprints of a golden file SHALL NOT be
checked.

The message of an `INVALID_SEED` failure of the seed file SHALL be
`<seed> is not a loadable codemind seed (<reason>)`. These checks SHALL happen before any database
connection is opened, so a successful load always loads at least one project, every project it loads
is a sample, and it never reports `0 projects loaded`.

The exit code SHALL be `0` on success and `1` on any failure. On success, stdout SHALL be exactly:
a first line `1 project loaded` when one sample project was loaded, or `N projects loaded` for any
other count `N`; followed by one line per loaded sample project, ordered by name (code-unit order),
with the template `  <name>  <language>/<framework>  <node_count> nodes · <edge_count> edges`: two
spaces of indentation, two spaces between fields, no column padding, `-` in place of a missing
framework, and the counts stored in the project row. A name, language or framework holding a
control character (U+0000–U+001F, U+007F–U+009F) or a bidirectional or line-separator character
SHALL be printed as its JSON string literal with those characters escaped; any other value as it is.
The loaded golden answers SHALL NOT change stdout. stderr SHALL be empty.

On failure, stdout SHALL stay empty and stderr SHALL hold exactly one line,
`{"error":{"code","message","details"}}`, and nothing else, with one of the codes `MISSING_CONFIG`,
`INVALID_SEED`, `DATABASE_UNAVAILABLE`, `PROJECT_NAME_TAKEN` or `INTERNAL`. An `INTERNAL` failure
SHALL have the message `seed load failed; the database is unchanged`, except a failure of the final
commit, whose message SHALL be `unexpected error; the seed may have been loaded`. No output SHALL
contain an absolute path, the database URL or its credentials; a seed or golden file SHALL be named
by its path relative to the repository root with `/` separators, or by its file name alone when it
is outside the repository root.

#### Scenario: Missing database configuration fails before connecting

- **GIVEN** `DATABASE_URL` unset, then empty, then `'   '`
- **WHEN** the seed load runs
- **THEN** each run exits with `1`, stdout is empty, stderr holds one error line with code
  `MISSING_CONFIG` and `details.variable` = `DATABASE_URL`, and no database connection is opened

#### Scenario: An invalid seed file fails before connecting

- **GIVEN** a valid `DATABASE_URL` and a seed file that does not exist, then one that is empty, then
  one without the line `-- codemind-seed-format: 1`, then one with `-- codemind-seed-format: 2`, then
  one with a valid header and no `INSERT INTO project`, then one with a valid header and a statement
  the seed reader cannot read, then one whose project row sets `is_sample` to `false`, then one with
  two projects of which only the second sets `is_sample` to `false`
- **WHEN** the seed load runs
- **THEN** each run exits with `1`, stdout is empty (never `0 projects loaded`), stderr holds one
  error line with code `INVALID_SEED`, `details.reason` = `missing`, `empty`, `format`, `format`,
  `no-project`, `format`, `not-sample` and `not-sample` respectively, and the message
  `<seed> is not a loadable codemind seed (<reason>)` with `<seed>` named as above; and no database
  connection is opened

#### Scenario: An invalid golden file fails before connecting

- **GIVEN** a valid `DATABASE_URL`, a seed whose only project is `acme-shop`, and a golden directory
  holding, one at a time: `acme-shop.json` with broken JSON; a valid golden file whose `project` is
  `other-api` (a project absent from the seed) named `other-api.json`; a valid acme-shop golden file
  named `other.json`; one whose entry's `questionNormalized` is the question unnormalized; one with
  two entries of the same `id`; one with two entries of different ids and the same
  `questionNormalized`; one whose entry's `response` has a statement citing an evidence id absent from
  its `evidence`; and one with `format` `2`
- **WHEN** the seed load runs
- **THEN** each run exits with `1`, stdout is empty, stderr holds one error line with code
  `INVALID_SEED`, `details.reason` = `cache`, `details.file` = the golden file's displayed path and
  the message `<file> is not a loadable codemind golden file`; no database connection is opened

#### Scenario: An unreachable database is reported without its URL by the seed load

- **GIVEN** `DATABASE_URL=postgres://u:s3cret@127.0.0.1:1/db` and a valid seed file
- **WHEN** the seed load runs
- **THEN** it exits with `1` and `DATABASE_UNAVAILABLE`; neither stdout nor stderr contains the URL,
  `s3cret` or `u:`

### Requirement: Sample projects are loaded idempotently

The seed load SHALL run in one database transaction: it SHALL delete every project with
`is_sample = true`, together with every row that depends on it, then execute the seed's statements,
then save the golden answers (see "Golden answers are loaded with the seed"), then commit. On any
failure the transaction SHALL be rolled back, so the database is left exactly as it was, and the
connection SHALL always be closed. Projects with `is_sample = false` and their rows SHALL never be
modified or deleted. Loading the same seed again SHALL leave the same rows, with the same ids, as
loading it once, except the answer cache entries of the sample projects, which SHALL be replaced by
entries with the same project, normalized question and response, new ids, a hit count of `0` and no
last hit.

#### Scenario: The seed is loaded into an empty database

- **GIVEN** a migrated database without projects and the versioned seed file
- **WHEN** the seed load runs
- **THEN** it exits with `0`; stdout is exactly the three lines `2 projects loaded`,
  `  acme-shop  php/laravel  174 nodes · 170 edges` and
  `  task-api  typescript/fastify  <n> nodes · <m> edges`, `<n>` and `<m>` being the `node_count` and
  `edge_count` of task-api's project row in the versioned seed; the project
  `a794456d-6d1b-5b55-a360-13fec83dc7bc` exists with `is_sample = true`, `node_count = 174` and
  `edge_count = 170`; its `file` plus `symbol` rows are 174 and its `edge` rows are 170; task-api
  exists with `is_sample = true` and its `file` plus `symbol` rows are `<n>` and its `edge` rows are
  `<m>`; the `commit` and `file_commit` rows of each project are as many as the seed's `INSERT`s into
  those tables for it; a symbol search for `Checkout` in acme-shop returns at least one symbol; and a
  symbol search for `TaskService` in task-api returns at least one symbol

#### Scenario: Loading again changes nothing and keeps the user's projects

- **GIVEN** the database of "The seed is loaded into an empty database" and a non-sample project with
  a saved graph
- **WHEN** the seed load runs again
- **THEN** it exits with `0` with the same stdout; acme-shop and task-api keep their ids and the same
  number of rows in every table; and the non-sample project keeps its id, its counts and all its rows
