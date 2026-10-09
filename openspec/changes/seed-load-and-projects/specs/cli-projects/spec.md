## Purpose

Lets a developer or evaluator list, from the command line and without HTTP, every project stored in
the database (the loaded samples and their own indexed repositories) with its language, counts and
indexing state.

## ADDED Requirements

### Requirement: Project listing

The command SHALL be `projects`, with no arguments. It SHALL read `DATABASE_URL` from the
environment, trimmed; a value that is unset, empty or only whitespace SHALL fail with
`MISSING_CONFIG` and `details.variable` = `DATABASE_URL` before any database connection is opened.
It SHALL list the projects through the store's project listing, never modify the database, and
always close its connection.

On success the exit code SHALL be `0`, stderr SHALL be empty, and stdout SHALL hold one line per
project, in the order of the store's listing (name ascending), with the template
`<name>  <id>  <language>/<framework>  <nodeCount> nodes · <edgeCount> edges  <indexedAt>[ sample]`:
two spaces between fields, no column padding, `-` in place of a missing framework, `<indexedAt>` as
an ISO-8601 UTC timestamp with milliseconds or the text `not indexed` when the project was never
indexed, and the suffix ` sample` (one space) only for a sample project. With no project, stdout
SHALL be exactly `no projects`.

On failure, stdout SHALL stay empty and stderr SHALL hold exactly one line,
`{"error":{"code","message","details"}}`: `MISSING_CONFIG`, `DATABASE_UNAVAILABLE`, `USAGE` for any
positional argument or unknown option, or `INTERNAL` with the message
`unexpected error; nothing was changed`. `--help` SHALL print the help to stdout and exit with `0`,
without reading the environment or opening a connection. `USAGE` SHALL exit
with `2` and every other failure with `1`; the argument parser SHALL NOT print text of its own. No
output SHALL contain the database URL or its credentials.

#### Scenario: Sample and user projects are listed

- **GIVEN** a database holding the loaded acme-shop sample, a non-sample project indexed with a saved
  graph, and a non-sample project created and never indexed
- **WHEN** `projects` runs
- **THEN** it exits with `0`, stderr is empty, and stdout holds exactly one line per project in name
  order; the acme-shop line is exactly
  `acme-shop  a794456d-6d1b-5b55-a360-13fec83dc7bc  php/laravel  174 nodes · 170 edges  2024-05-06T09:31:00.000Z sample`;
  the indexed project's line is the template filled with its stored values and ends with its
  `indexedAt`, without ` sample`; the never-indexed project's line ends with
  `0 nodes · 0 edges  not indexed`; and the database is unchanged

#### Scenario: An empty database lists no projects

- **GIVEN** a migrated database without projects
- **WHEN** `projects` runs
- **THEN** it exits with `0`, stdout is exactly `no projects` and stderr is empty

#### Scenario: Configuration, connection and usage errors

- **GIVEN** `DATABASE_URL` unset, then `'   '`; then `DATABASE_URL=postgres://u:s3cret@127.0.0.1:1/db`;
  then a valid configuration and the extra argument `extra`, then the unknown option `--json`; and
  finally `--help` with `DATABASE_URL` unset
- **WHEN** `projects` runs
- **THEN** the first two exit with `1` and `MISSING_CONFIG` without opening a connection; the third
  exits with `1` and `DATABASE_UNAVAILABLE` and no output contains the URL, `s3cret` or `u:`; the
  extra argument and the unknown option exit with `2` and `USAGE`; in each of these cases stdout is
  empty and stderr holds exactly one error line; and `--help` exits with `0`, prints the help to
  stdout, leaves stderr empty and opens no connection
