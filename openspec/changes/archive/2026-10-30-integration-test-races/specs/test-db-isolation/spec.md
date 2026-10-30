## ADDED Requirements

### Requirement: A test database with committed projects is refused

When `DATABASE_URL` is configured, every Vitest run that includes a file of the `node` or
`seed-build` project SHALL check, before any test file runs, that the database holds no committed row
in `project`, and SHALL fail at once if it holds any,
with a message that names the number of projects, says that the test database must hold no
committed project, and points to `docs/TESTING.md` → Carreras conocidas. The message MUST NOT contain
the database URL or its credentials. When the `project` table does not exist yet (a database never
migrated), the check SHALL pass. When `DATABASE_URL` is not set, no check runs. This check is not a
database availability gate: it neither skips nor fails a test because `DATABASE_URL` is missing.

#### Scenario: A database with a committed project fails the run before any test

- **GIVEN** a configured database holding one committed project
- **WHEN** the integration run's start-up check runs
- **THEN** it fails with a message naming 1 committed project, `docs/TESTING.md` and Carreras
  conocidas, without the database URL or its password

#### Scenario: A database without committed projects passes the check

- **GIVEN** a configured, migrated database whose `project` table has no committed row (rows inside
  another connection's open transaction do not count)
- **WHEN** the start-up check runs
- **THEN** it passes

#### Scenario: A database never migrated passes the check

- **GIVEN** a configured database without a `project` table
- **WHEN** the start-up check runs
- **THEN** it passes

#### Scenario: No database configured

- **GIVEN** `DATABASE_URL` unset
- **WHEN** the start-up check runs
- **THEN** it resolves without querying any database

### Requirement: A rolled-back snapshot of a test's own

The harness SHALL provide `inOwnSnapshot(work)` for tests whose scenario reads a whole table: it
SHALL run `work` on a new connection of its own inside `BEGIN ISOLATION LEVEL REPEATABLE READ` with
`lock_timeout` set to 1 s, SHALL always roll the transaction back and close the connection, and SHALL
return `work`'s result. When `work` fails with SQLSTATE `40001` (serialization failure) or `55P03`
(lock not available), it SHALL roll back, wait 250 ms and run `work` again on a new transaction,
while less than 10 s have passed since the first attempt; any other error, or a retryable one after
that window, SHALL be rethrown unchanged.

#### Scenario: Rows committed by another connection after the snapshot are invisible

- **GIVEN** a test reading a table inside `inOwnSnapshot`
- **WHEN** another connection commits a row into that table after the snapshot was taken
- **THEN** the read inside `work` does not see it
- **AND** after `inOwnSnapshot` returns, nothing `work` wrote is left in the database

#### Scenario: A serialization failure runs the work again

- **GIVEN** a `work` whose first attempt fails with SQLSTATE `40001`
- **WHEN** it runs inside `inOwnSnapshot`
- **THEN** `work` runs a second time, on a new transaction, and `inOwnSnapshot` returns that
  attempt's result
- **AND** inside `work`, `SHOW transaction_isolation` returns `repeatable read` and
  `SHOW lock_timeout` returns `1s`

#### Scenario: Any other error is rethrown at once

- **GIVEN** a `work` that fails with an error whose SQLSTATE is neither `40001` nor `55P03`
- **WHEN** it runs inside `inOwnSnapshot`
- **THEN** `inOwnSnapshot` rejects with that same error after one attempt
- **AND** the connection `inOwnSnapshot` opened is closed

#### Scenario: A retryable error after the window is rethrown

- **GIVEN** an error with SQLSTATE `40001` or `55P03` and a first attempt that started 10 s or more
  ago
- **WHEN** `isRetryableSnapshotError` judges it
- **THEN** it is not retryable, and an error of any other SQLSTATE is not retryable either

### Requirement: A database write can be made to fail without DDL

The harness SHALL provide `rejectingWrites(client, rejection)`, which returns a client whose
`query(sql, values)` forwards every call to `client` unchanged, except a call whose SQL inserts into
`rejection.table` and whose values match `rejection.when` (every such insert when `when` is absent):
that call SHALL send instead, on the same client, a statement that makes PostgreSQL raise an error
whose message, `detail` and `hint` all contain `rejection.quote(values)`, so the current transaction
or savepoint is aborted exactly as by a failing insert. It SHALL take no lock on any table and
create no database object.

#### Scenario: A matching insert fails with a database error that quotes the given text

- **GIVEN** a client wrapped with `rejectingWrites` for table `query_log` and a quote of
  `SENTINEL-x`, inside a transaction
- **WHEN** an `INSERT INTO query_log …` is sent through it
- **THEN** it rejects with a PostgreSQL error whose message, `detail` and `hint` contain
  `SENTINEL-x`
- **AND** no `query_log` row was written and the transaction is aborted
- **AND** while the transaction is still open, another connection finds no lock of that backend on
  `query_log` in `pg_locks`, no new `pg_trigger` row on `query_log`, and no `pg_proc` row in that
  backend's temporary schema

#### Scenario: Other statements pass through unchanged

- **GIVEN** the same wrapped client, with a `when` that matches only values including `SENTINEL-x`
- **WHEN** a `SELECT`, an insert into another table and an insert into `query_log` whose values do
  not match `when` are sent through it
- **THEN** they run on the database unchanged and return their normal results
