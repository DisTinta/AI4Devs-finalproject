## ADDED Requirements

### Requirement: Explain query counts

The store SHALL let the domain read how many `explain` queries of one project were logged and how many
of them were served from the answer cache: `countExplainQueries(projectId)` SHALL resolve with
`{ queries, cacheHits }`, where `queries` is the number of `query_log` rows of that project whose
capability is `explain` and `cacheHits` the number of those rows whose cache flag is `true`, both
integers from `0`. Rows of another capability (`impact`, `drift`) and rows of other projects SHALL NOT
count. A project without such rows SHALL resolve with `{ queries: 0, cacheHits: 0 }`.

- A `projectId` that is not a well-formed UUID MUST fail with `ProjectNotFound` before any statement.
- A `projectId` that names no project MUST fail with `ProjectNotFound`; the store SHALL tell it apart
  from a project without rows in the same statement, which starts from the project row.
- The read SHALL send exactly one parameterised statement and SHALL never write. On a caller-owned
  transaction it SHALL read inside that transaction (it sees the rows the transaction wrote) and SHALL
  neither commit nor roll it back; on a store opened on its own connections it runs as every other
  read of that store, as "Opening a pooled store from a URL" states (no transaction held open between
  calls). Any other failure of the database SHALL propagate as the store's other reads propagate it.
- The in-memory store double used by unit tests SHALL apply the same checks in the same order with the
  same errors, SHALL count the query log rows it kept (requirement "Query log write"), SHALL count its
  calls of the read, and SHALL let a test inject a failure of the read, raised as the error the test
  gives, after the checks.

#### Scenario: Explain queries and cache hits are counted per project

- **GIVEN** a database with two projects A and B and a third project C without any `query_log` row;
  for A, 10 rows of capability `explain` of which 4 have the cache flag `true`, 3 rows of capability
  `impact` and 2 rows of capability `drift`, all 5 with the cache flag `true`; for B, 5 rows of
  capability `explain`, all with the cache flag `true`
- **WHEN** the explain queries of A, of B and of C are counted, through a client that counts the
  statements it sends
- **THEN** the results are exactly `{ queries: 10, cacheHits: 4 }`, `{ queries: 5, cacheHits: 5 }`
  and `{ queries: 0, cacheHits: 0 }`; each read sent exactly one statement; and the number of
  `query_log` rows is the same as before

#### Scenario: Counting the queries of an unknown project fails

- **GIVEN** a migrated database, a client that counts the statements it sends, and a caller-owned
  transaction that wrote one `explain` row of a project P
- **WHEN** the explain queries are counted for `not-a-uuid`, then for a well-formed UUID that names no
  project, then for P on the caller's transaction
- **THEN** the first two fail with `ProjectNotFound`; the first sent no statement; the third resolves
  with `{ queries: 1, cacheHits: 0 }` and the caller's transaction is still open and usable

#### Scenario: The in-memory double counts explain queries like the database

- **GIVEN** the in-memory double holding the projects and the query log rows of "Explain queries and
  cache hits are counted per project", written through its query log write
- **WHEN** the explain queries of A, B and C are counted; then for `not-a-uuid` and for a well-formed
  UUID that names no project; then for A with an injected failure of the read
- **THEN** the first three results are those of the database; the next two fail with
  `ProjectNotFound`; the last rejects with exactly the injected error; and the double counted six calls
  of the read
