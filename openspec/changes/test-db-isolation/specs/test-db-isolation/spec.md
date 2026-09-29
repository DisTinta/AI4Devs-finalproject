## Purpose

Shared harness for integration tests that need PostgreSQL. It gives every test a database
connection and its own transaction, which is always reverted, so the next test starts from the
same state. It fails loudly when that guarantee is broken. It provides valid L1 graph rows to
build on, so store stories test behaviour instead of re-writing setup.

## ADDED Requirements

### Requirement: Single database availability gate

Integration tests that need PostgreSQL SHALL take the database from `DATABASE_URL`, and SHALL
decide in exactly one place what happens when it is missing.

- `DATABASE_URL` unset and `CI` unset: every database test SHALL be skipped, and one warning
  SHALL say how to enable them.
- `DATABASE_URL` unset and `CI` set: the run MUST fail.
- The store specs and the harness specs MUST use this same gate: the same implementation, not a
  copy of it.

The two gate scenarios below run one harness spec (`tests/integration/helpers/harness.spec.ts`)
and one store spec (`tests/integration/store/graph-schema-constraints.spec.ts`) together, in a
separate test run. One file from each side is enough, because both reach the same gate.

#### Scenario: Database tests are skipped locally without a database

- **WHEN** the harness spec and the store spec above run with `DATABASE_URL` unset and `CI`
  unset
- **THEN** every test in both files is reported as skipped
- **AND** the output contains the warning that explains how to set `DATABASE_URL`
- **AND** the run exits with code 0

#### Scenario: Database tests fail in CI without a database

- **WHEN** the harness spec and the store spec above run with `DATABASE_URL` unset and `CI` set
- **THEN** the run exits with a non-zero code
- **AND** the output states that `DATABASE_URL` must be set in CI

#### Scenario: Database tests run when a database is configured

- **WHEN** the integration suite runs with `DATABASE_URL` pointing at a migrated database
- **THEN** the harness example tests run and pass (none of them is skipped)

### Requirement: One reverted transaction per test

A test that opts into the harness SHALL run inside its own database transaction. The transaction
is opened before the test body and reverted after it, whether the body passes or throws. The rows
the test writes MUST be visible to that test. They MUST NOT be visible to any other connection,
during the test or after it.

#### Scenario: A test reads back the row it wrote

- **WHEN** a test writes a `project` row through the harness transaction and reads it back
  through the same transaction
- **THEN** the read returns that row with the values written

#### Scenario: Rows are invisible to other connections while the test runs

- **WHEN** a test has written a `project` row through the harness transaction
- **AND** a separate connection looks for that row by id before the test ends
- **THEN** the separate connection finds no row

#### Scenario: Rows are gone after the test ends

- **WHEN** a test wrote a `project` row and has ended
- **AND** a later test looks for that row by id through a separate connection
- **THEN** no row is found

#### Scenario: The transaction is reverted when the test body throws

- **WHEN** the body of a harness transaction writes a `project` row and then throws
- **THEN** the transaction is still reverted
- **AND** a separate connection finds no row with that id

### Requirement: A committed harness transaction fails the test

When a test ends, the harness SHALL check that the test's transaction is still the one it opened
and is still open. If it is not, for example because the code under test ran `COMMIT` on the
harness connection, the harness MUST fail that test. The error message MUST say that the harness
transaction was committed or ended early, so its rows may have persisted.

#### Scenario: Committing the harness transaction is reported

- **WHEN** code running inside a harness transaction commits it
- **THEN** the harness end-of-test check fails
- **AND** its error message states that the harness transaction was committed or ended early

#### Scenario: Rolling back the harness transaction is reported

- **WHEN** code running inside a harness transaction rolls it back
- **THEN** the harness end-of-test check fails
- **AND** its error message states that the harness transaction was committed or ended early

#### Scenario: Committing and opening a new transaction is reported

- **WHEN** code running inside a harness transaction commits it and then opens a new
  transaction on the same connection
- **THEN** the harness end-of-test check fails
- **AND** its error message states that the harness transaction was committed or ended early

#### Scenario: An untouched harness transaction passes the check

- **WHEN** a test writes rows and leaves the harness transaction open
- **THEN** the harness end-of-test check passes and the transaction is reverted

#### Scenario: An aborted harness transaction passes the check

- **WHEN** a test writes a row and then runs a statement that fails, which leaves the harness
  transaction aborted but still open
- **THEN** the harness end-of-test check passes
- **AND** the transaction is reverted, so a separate connection finds no row with that id

### Requirement: Factories create valid L1 graph rows

The harness SHALL provide one factory per L1 graph table: `project`, `file`, `symbol` and `edge`.

- A factory inserts one row through the connection it is given, and returns the stored row
  (including its generated `id`).
- The defaults satisfy every constraint of the schema, so a call with only the required parents
  succeeds.
- Defaults that must be unique (`project.name`, the pair `file (project_id, path)`) MUST be unique
  per call. So factories never collide with each other, with parallel test files, or with rows
  that already exist in the database (for example a loaded seed).
- Any column MAY be overridden by the caller, and the stored row MUST carry the overridden value.
- Factory defaults MUST be synthetic: fixed placeholders plus a random unique suffix. They are
  never real names, email addresses or host paths.

#### Scenario: Each factory creates a row with defaults

- **WHEN** a test creates a project, a file in it, and two symbols in that file, using only
  default values
- **AND** creates an edge between the two symbols in that project
- **THEN** every insert succeeds
- **AND** each returned row has an `id` that can be read back through the harness transaction

#### Scenario: Default unique values never collide

- **WHEN** a test creates two projects, and two files in the same project, with default values
- **THEN** all four inserts succeed with distinct `project.name` values and distinct `file.path`
  values

#### Scenario: Overridden columns are stored

- **WHEN** a test creates a project with `language` overridden to `php` and `is_sample` to `true`,
  and a symbol with `kind` overridden to `class`
- **THEN** reading the rows back returns `php`, `true` and `class`

#### Scenario: Default values are synthetic

- **WHEN** a test creates a project, a file and a symbol with default values
- **THEN** `project.root_path` is `/repos/sample`
- **AND** `project.name` starts with `project-`
- **AND** `file.path` starts with `src/file-` and ends with `.ts`
- **AND** `symbol.name` is `handle`

#### Scenario: An edge can connect files as well as symbols

- **WHEN** a test creates an edge whose source and target are two files of the same project
- **THEN** the insert succeeds with `source_file_id` and `target_file_id` set, and both symbol
  endpoints `NULL`

### Requirement: Existing store test helpers keep their API

The helpers that the existing store specs import SHALL keep their names and behaviour:
`withRollback`, `describeWithDatabase`, `migrateSharedDatabase`, `SQLSTATE`, `expectSqlState`,
`unique`, `runCommand`, `runNpmScript`, `repoRoot`, `databaseUrl` and `CHILD_TIMEOUT_MS`. The
existing store spec files MUST pass without being edited.

#### Scenario: Existing store specs pass unchanged

- **WHEN** the store integration suite (`tests/integration/store`) runs against a configured
  database after this change
- **THEN** every test passes
- **AND** no file under `tests/integration/store/` other than the support module has changed
