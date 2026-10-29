## ADDED Requirements

### Requirement: Running work in one transaction on a pooled store

A store opened by "Opening a pooled store from a URL" SHALL also offer to run a piece of work inside one
transaction of its pool: it SHALL take one connection from the pool, begin a transaction, give the work
a store bound to that transaction (requirement "Cooperation with a caller-owned transaction"), and
commit when the work resolves or roll back when it rejects, resolving or rejecting with what the work
did. The connection SHALL be released to the pool in every case. When the rollback itself fails, the
work's error SHALL still be the one propagated. A failure to commit SHALL reject, without the driver's
text, host, port or credentials in its message. No write of the work SHALL be visible to other
connections before the commit, and none SHALL remain after a rollback.

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
