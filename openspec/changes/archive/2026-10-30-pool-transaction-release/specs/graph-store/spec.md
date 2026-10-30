## MODIFIED Requirements

### Requirement: Running work in one transaction on a pooled store

A store opened by "Opening a pooled store from a URL" SHALL also offer to run a piece of work inside one
transaction of its pool: it SHALL take one connection from the pool, begin a transaction, give the work
a store bound to that transaction (requirement "Cooperation with a caller-owned transaction"), and
commit when the work resolves or roll back when it rejects, resolving or rejecting with what the work
did. Once a connection has been taken from the pool, it SHALL be released exactly once. A connection whose `BEGIN` or
`ROLLBACK` failed SHALL be destroyed instead of being returned to the pool: it is released with the
error of that failed statement, so the pool discards it. A connection whose transaction ended with a
successful `COMMIT` or a successful `ROLLBACK` SHALL be returned to the pool. When `BEGIN` fails, the
run SHALL reject with that error without running the work and without sending `COMMIT` or `ROLLBACK`.
When the rollback itself fails, the work's error SHALL still be the one propagated. A failure to
commit SHALL reject with an error whose message is exactly `the transaction could not be committed`,
without a cause and without the driver's text, host, port or credentials, whether the rollback that
follows it succeeds or fails. While the run holds the connection, an `error` event of that connection
(a backend terminated between two queries) SHALL NOT crash the process; the next statement reports the
failure. The run SHALL remove the `error` listener it added before releasing the connection, so no
listener of the run remains on a pooled connection. No write of the work SHALL be visible to other connections before the commit, and none SHALL
remain after a rollback or a failed commit.

#### Scenario: Work that resolves is committed

- **GIVEN** a reachable, migrated database and a store opened on its URL
- **WHEN** work that creates a project with a unique name and resolves to its id runs in one
  transaction, and the projects are then listed with another connection
- **THEN** the run resolves to that id, the listing holds a project with that id and name, and it is
  deleted afterwards to restore the database

#### Scenario: Work that rejects leaves nothing

- **GIVEN** a reachable, migrated database and a store opened on its URL
- **WHEN** work that creates a project with a unique name and then throws an error `E` runs in one
  transaction
- **THEN** the run rejects with `E`, and no project with that name exists afterwards

#### Scenario: Work's writes are invisible to another connection before the commit

- **GIVEN** a reachable, migrated database and a store opened on its URL
- **WHEN** work that creates a project with a unique name runs in one transaction and, before
  resolving, lists the projects through another connection
- **THEN** that listing holds no project with that name, a listing after the run holds it, and it is
  deleted afterwards to restore the database

#### Scenario: Every connection is released after a run

- **GIVEN** a reachable, migrated database and a store opened on its URL with a unique application name
- **WHEN** one run that resolves and one that rejects have finished and the store is closed
- **THEN** `close()` resolves within 2 s and no session with that application name remains (polled for up to 2 s)

#### Scenario: A transaction that ends cleanly returns its connection to the pool

- **GIVEN** a pool whose connection answers every statement successfully
- **WHEN** work that resolves to `42` runs in one transaction, and then work that rejects with an error
  `E` runs in another
- **THEN** the first run resolves to `42` after `BEGIN` and `COMMIT` were sent, and the second rejects
  with `E` itself after `BEGIN` and `ROLLBACK` were sent
- **AND** each connection is released exactly once and returned to the pool (released without an error)

#### Scenario: A failed begin destroys the connection

- **GIVEN** a pool whose connection fails `BEGIN` with an error `B`
- **WHEN** any work runs in one transaction
- **THEN** the run rejects with `B` itself, the work is never called, and neither `COMMIT` nor
  `ROLLBACK` is sent
- **AND** the connection is released exactly once, with `B`, so the pool destroys it

#### Scenario: A failed rollback keeps the work's error and destroys the connection

- **GIVEN** a pool whose connection fails `ROLLBACK` with an error `R`
- **WHEN** work that rejects with an error `E` runs in one transaction
- **THEN** the run rejects with `E` itself, not with `R`
- **AND** the connection is released exactly once, with `R`, so the pool destroys it

#### Scenario: A failed commit rejects with a fixed message whatever its rollback does

- **GIVEN** a pool whose connection fails `COMMIT` with an error whose text is
  `commit failed: password=s3cret host=db.internal`, in a first variant with a `ROLLBACK` that
  succeeds and in a second variant with a `ROLLBACK` that fails with an error `R`
- **WHEN** work that resolves runs in one transaction in each variant
- **THEN** both runs reject with an `Error` whose message is exactly
  `the transaction could not be committed` and that has no cause, and whose serialisation (message,
  stack and own properties) holds neither `s3cret`, `db.internal`, the commit error's text nor the
  text of `R`
- **AND** in the first variant the connection is released exactly once and returned to the pool; in
  the second it is released exactly once, with `R`, so the pool destroys it

#### Scenario: A run leaves no error listener on its connection

- **GIVEN** a pool whose connection answers every statement successfully, and a second pool whose
  connection fails `BEGIN` with an error `B`
- **WHEN** work that resolves runs in one transaction on the first, and any work runs on the second
- **THEN** on each connection the `error` listener the run added is the same function it removed, and
  it was removed before the connection was released

#### Scenario: A connection terminated during rejecting work keeps the work's error

- **GIVEN** a reachable, migrated database and a store opened on its URL with a unique application name
- **WHEN** work that creates a project with a unique name, then terminates from another connection
  every backend with that application name, then throws an error `E` runs in one transaction
- **THEN** the run rejects with `E` itself, and no project with that name exists afterwards
- **AND** a later run on the same store resolves, `close()` resolves within 2 s, no session with that
  application name remains (polled for up to 2 s), and the test process recorded no unhandled `error`
  event

#### Scenario: A connection terminated during resolving work fails the commit without driver text

- **GIVEN** a reachable, migrated database and a store opened on its URL with a unique application name
- **WHEN** work that creates a project with a unique name, then terminates from another connection
  every backend with that application name, then resolves runs in one transaction
- **THEN** the run rejects with an error whose message is exactly
  `the transaction could not be committed`, that has no cause, and whose message and stack hold
  neither `terminat`, `57P01` nor `administrator command`, and no project with that name exists
  afterwards
- **AND** a later run on the same store resolves, `close()` resolves within 2 s, no session with that
  application name remains (polled for up to 2 s), and the test process recorded no unhandled `error`
  event
