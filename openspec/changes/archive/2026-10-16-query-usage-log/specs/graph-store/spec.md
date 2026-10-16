## ADDED Requirements

### Requirement: Query log write

The store SHALL let the domain record the usage of one query as one `query_log` row:
`saveQueryLog(entry)`, where the entry holds the project id, the question, the capability (`explain`,
`impact` or `drift`), the input and output tokens, the baseline tokens (or none), the cost in USD,
the latency in milliseconds, the cache flag, and the input tokens, output tokens, cost in USD, number
of verifier calls and latency in milliseconds (or none) of the verification. It SHALL resolve with nothing once the row is written. The row SHALL hold each value in
its column (`question`, `capability`, `input_tokens`, `output_tokens`, `baseline_tokens` (`NULL` when
the entry has none), `cost_usd`, `latency_ms`, `cache_hit`, `verify_input_tokens`,
`verify_output_tokens`, `verify_cost_usd`, `verify_calls`, `verify_latency_ms` (`NULL` when the
entry has none)), and its `id` and `created_at` SHALL be the database
defaults. The totals include the verification: the daily cost sum ("Daily cost sum") reads `cost_usd`
alone.

- A `projectId` that is not a well-formed UUID MUST fail with `ProjectNotFound` before any other
  check and before any statement.
- Then the entry SHALL pass its record schema, otherwise the call MUST fail with `InvalidStoreQuery`
  naming `entry`, before any statement, with a fixed message that never holds a value of the entry.
  The schema SHALL accept only an object with exactly the fields above; a question that is a
  non-empty string, not only whitespace, holding no U+0000 (its length is the caller's limit); a
  capability of the closed set; token counts, a latency, a number of verifier calls and a
  verification latency that are integers from 0 to 2 147 483 647 (the range of the `integer`
  columns), the baseline tokens and the verification latency being such an integer or none; costs that
  are finite numbers from 0 to 9 999.999999 (the range of `numeric(10,6)`); a boolean cache flag; and
  verification counters that do not exceed their totals (verification input tokens ≤ input tokens,
  verification output tokens ≤ output tokens, verification cost ≤ cost).
- Then a `projectId` that names no project MUST fail with `ProjectNotFound`, and nothing SHALL be
  written.
- Any database failure once the write has started, including a failure to roll it back, SHALL reject
  with the domain error `QueryLogWriteFailed` (code `QUERY_LOG_WRITE_FAILED`), which SHALL carry no
  `cause` and no text of the database error (the database error's message, `detail`, `hint` or
  `where` may quote the question). A failure to obtain a
  connection, before the write starts, propagates unchanged and is not a `QueryLogWriteFailed`; so
  does a failure to open the savepoint on a caller-owned transaction, as for the claim write.
- The write SHALL send one parameterised statement for the row and SHALL cooperate with a
  caller-owned transaction as the claim write does: on its own connections it commits before
  returning; on a caller-owned transaction it neither commits nor rolls it back, and on failure undoes
  only its own write and leaves that transaction usable.
- The in-memory store double used by unit tests SHALL check the entry in the same order with the same
  errors, SHALL keep the rows it wrote, in order, for a test to read, and SHALL let a test inject a
  failure of the write, raised as the error the test gives.

#### Scenario: A query log entry is written as one row

- **GIVEN** a project, and the cost since the start of the current UTC day read before
- **WHEN** the entry `{ capability: 'explain', question: '¿Cómo se calcula el precio?', inputTokens:
  4000, outputTokens: 300, baselineTokens: 40000, costUsd: 0.0165, latencyMs: 1234, cacheHit: false,
  verifyInputTokens: 600, verifyOutputTokens: 40, verifyCostUsd: 0.0024, verifyCalls: 2,
  verifyLatencyMs: 900 }` of that project is saved on the caller's transaction, and then the same
  entry with `baselineTokens` and `verifyLatencyMs` none and every counter and cost 0
- **THEN** each call resolves, and `query_log` holds exactly two new rows of that project: the first
  with those values (`cost_usd` `0.016500`, `verify_cost_usd` `0.002400`, `verify_calls` 2,
  `verify_latency_ms` 900), the second with `baseline_tokens` and `verify_latency_ms` `NULL` and every
  counter and cost 0, both with a generated `id` and a non-null
  `created_at`
- **AND** the cost since the start of the current UTC day is the cost read before plus `0.0165`, as
  of the caller's transaction
- **AND** saving the entry again with `projectId` written in upper case also succeeds

#### Scenario: Invalid query log entries are rejected before writing

- **WHEN** an entry is saved with the project id `not-a-uuid`, and then entries of an existing project
  with `inputTokens` −1, with `outputTokens` 1.5, with `latencyMs` 2 147 483 648, with `costUsd`
  `NaN`, with `costUsd` 10 000, with `verifyInputTokens` greater than `inputTokens`, with
  `verifyCostUsd` greater than `costUsd`, with `verifyCalls` −1, with `verifyLatencyMs` 1.5, with a
  question holding U+0000, with a question of only
  spaces, with the capability `summarise`, and with an extra field
- **THEN** the first call fails with `ProjectNotFound` and every other call with `InvalidStoreQuery`
  naming `entry`, whose message holds no value of the entry
- **AND** no statement was sent to the database for any of them

#### Scenario: A query log entry of an unknown project writes nothing

- **WHEN** an entry is saved on the caller's transaction with a well-formed UUID that names no project
- **THEN** the call fails with `ProjectNotFound`
- **AND** no `query_log` row was written, and a following query on the same transaction succeeds

#### Scenario: A failed query log write does not leak

- **GIVEN** a project, and the database rejecting the insert of a `query_log` row whose question is a
  sentinel text with an error whose `detail` quotes that question
- **WHEN** an entry with that question is saved on the caller's transaction
- **THEN** the call rejects with `QueryLogWriteFailed`, and the serialised error holds neither the
  sentinel nor any text of the database error
- **AND** no `query_log` row of the call exists, and a following query on the same transaction
  succeeds

#### Scenario: A failed rollback of the query log write is a write failure

- **GIVEN** a store whose insert of the row fails and whose rollback then fails too
- **WHEN** an entry is saved on the store's own connections, and again on a caller-owned transaction
  whose rollback to the savepoint fails
- **THEN** each call rejects with `QueryLogWriteFailed`, which carries no `cause` and no text of either
  database error

#### Scenario: Saving a query log entry on the store's own connections commits

- **WHEN** an entry is saved on the store's own connections and the call returns
- **THEN** another connection sees its row

#### Scenario: A store that cannot give a connection fails the query log write with its own error

- **GIVEN** a store on its own connections whose pool has been ended
- **WHEN** an entry is saved
- **THEN** the call rejects with the pool's own error, not with `QueryLogWriteFailed`

#### Scenario: The in-memory double checks, keeps and fails query log entries

- **GIVEN** the in-memory store with one project
- **WHEN** an entry of that project is saved, then an entry with `inputTokens` −1, an entry of
  `not-a-uuid`, an entry of a well-formed UUID that names no project, and, with a write failure
  injected as `QueryLogWriteFailed`, a valid entry
- **THEN** the first resolves and the double holds exactly that row; the others fail with
  `InvalidStoreQuery` naming `entry`, `ProjectNotFound`, `ProjectNotFound` and `QueryLogWriteFailed`
- **AND** the double still holds exactly the first row
