## ADDED Requirements

### Requirement: Daily cost sum

The store SHALL let the domain read the total cost recorded in `query_log` from a given instant: the
sum of `cost_usd` over every row whose `created_at` is at or after that instant, across every project
(the daily budget is global). Rows whose `cost_usd` is unset SHALL be ignored. With no matching row the
result SHALL be `0`. The result SHALL be a number, not text. The read SHALL work both on the store's
own connections and on a caller-owned transaction, and SHALL write nothing.

#### Scenario: The cost since an instant is summed across projects

- **GIVEN** two projects and `query_log` rows with `cost_usd` `0.4` at `2026-10-08T23:59:59Z`, `0.3`
  at `2026-10-09T00:00:00Z` and `0.2` at `2026-10-09T10:00:00Z` for the first project, a row with
  unset `cost_usd` at `2026-10-09T11:00:00Z`, and `0.1` at `2026-10-09T12:00:00Z` for the second
  project
- **WHEN** the cost since `2026-10-09T00:00:00Z` is read
- **THEN** the result is the number `0.6`

#### Scenario: With no matching row the cost is zero

- **GIVEN** `query_log` holds only a row at `2026-10-08T10:00:00Z`, and then no row at all
- **WHEN** the cost since `2026-10-09T00:00:00Z` is read in each case
- **THEN** each result is the number `0`

## MODIFIED Requirements

### Requirement: Validation of read arguments

The store MUST reject invalid read arguments with the domain error `InvalidStoreQuery`, which
names the argument at fault, before querying the database:

- a symbol search term that is empty or only whitespace, or that contains a NUL character (no
  stored name can contain one, and the database rejects it as text);
- a `hops` that is not an integer from 1 to 3 (the maximum traversal depth);
- a list of symbol kinds or edge kinds that is given but empty;
- an instant for the daily cost sum (`since`) that is not a valid date.

#### Scenario: Invalid read arguments are rejected before querying

- **WHEN** symbols are searched with the term `"  "`, with a term containing a NUL character and
  with an empty list of symbol kinds,
  neighbours are requested with `hops` 0, 4 and 1.5, and neighbours are requested with an empty
  list of edge kinds
- **THEN** each call fails with `InvalidStoreQuery` naming the term, the kinds or `hops`
- **AND** no statement was sent to the database for any of them

#### Scenario: An invalid instant for the cost sum is rejected before querying

- **WHEN** the daily cost sum is read since an invalid date (`new Date('x')`)
- **THEN** the call fails with `InvalidStoreQuery` naming `since`
- **AND** no statement was sent to the database
