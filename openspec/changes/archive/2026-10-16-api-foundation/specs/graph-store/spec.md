## ADDED Requirements

### Requirement: Opening a pooled store from a URL

The store adapter SHALL open a store on its own pooled connections from a database URL and an
application name, for a long-running process such as the API; the store works on its own connections (requirement
"Cooperation with a caller-owned transaction"), so no transaction is held open between calls. Before
returning, it SHALL check that the database accepts
a connection; when it does not (refused, unreachable or not answering within the connection timeout
of 10 000 ms), it SHALL end the pool and fail with `DatabaseUnavailable`, whose message is exactly
`cannot connect to the database` and holds no text of the driver, host, port or credentials. The
sessions SHALL carry the given `application_name` unless the URL sets its own. The opened store SHALL come with a `close` that ends
every connection of the pool.

#### Scenario: An opened store answers and closes its connections

- **GIVEN** a reachable, migrated database
- **WHEN** a store is opened on its URL with the application name `codemind-api-test`, `listProjects()`
  is called, and the store is closed
- **THEN** `listProjects()` resolves to an array, a session with the application name
  `codemind-api-test` exists while the store is open, and none remains once `close` resolved (polled
  for up to 2 s)

#### Scenario: The URL's application name wins

- **GIVEN** a reachable, migrated database
- **WHEN** a store is opened on its URL with `application_name=codemind-url-test` in the query string
  and the application name `codemind-api-test`, `listProjects()` is called, and the store is closed
- **THEN** while it is open a session named `codemind-url-test` exists and none named
  `codemind-api-test`

#### Scenario: An unreachable database fails without leaking the URL

- **GIVEN** the URL `postgres://u:s3cret@127.0.0.1:1/db`, where nothing listens
- **WHEN** a store is opened on it
- **THEN** it rejects with `DatabaseUnavailable`, whose message is exactly
  `cannot connect to the database` and contains neither `s3cret`, `127.0.0.1` nor `u:`
