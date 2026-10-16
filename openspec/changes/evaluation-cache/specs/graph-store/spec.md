## ADDED Requirements

### Requirement: Answer cache entries

The store SHALL let the domain keep the answer cache of a project in `cache_entry`, at most one entry
per project and normalized question, through four calls:

- `findCacheEntry(projectId, questionNormalized)` SHALL resolve to the entry of that project with that
  key, as its id and its stored response (the JSON value written, or `null` when the column is
  `NULL`), or to nothing when there is none. When the table holds more than one entry for the pair
  (rows written outside the store), the most recently created SHALL be returned (by `created_at`,
  then by `id`, both descending). It SHALL write nothing.
- `saveCacheEntry(projectId, questionNormalized, response)` SHALL leave exactly one entry for the
  pair: it deletes every entry of the pair and inserts the new one, with `hit_count` 0, `last_hit_at`
  `NULL` and `question_embedding` `NULL`, as one atomic write. Two saves of the same pair running at
  the same time SHALL leave exactly one entry (the saves of one pair are serialised). It SHALL resolve
  with nothing.
- `touchCacheEntry(projectId, entryId, at)` SHALL add 1 to the entry's `hit_count` and set its
  `last_hit_at` to `at`, in one statement, only when the entry belongs to that project. An entry id
  that names no entry of the project SHALL change nothing and resolve (the entry may have been
  replaced or invalidated since it was found).
- `invalidateCache(projectId)` SHALL delete every entry of the project, and only of it, and resolve
  to the number of entries deleted.

Every call SHALL check, in this order and before any statement:

- a `projectId` that is not a well-formed UUID MUST fail with `ProjectNotFound`, before any other
  check;
- a `questionNormalized` that is not a string, is empty or only whitespace, or holds U+0000 MUST fail
  with `InvalidStoreQuery` naming `question`;
- a `response` that is not an object (`null`, an array, a string, a number) MUST fail with
  `InvalidStoreQuery` naming `response`;
- an `entryId` that is not a well-formed UUID MUST fail with `InvalidStoreQuery` naming `entryId`;
- an `at` that is not a valid date MUST fail with `InvalidStoreQuery` naming `at`.

The message of each such error SHALL be fixed text that holds no value given. Then a well-formed
`projectId` that names no project MUST fail with `ProjectNotFound`, and nothing SHALL be written.

A database failure once a write (`saveCacheEntry`, `touchCacheEntry`, `invalidateCache`) has started,
including a failure to roll it back, SHALL reject with the domain error `CacheWriteFailed` (code
`CACHE_WRITE_FAILED`), which SHALL carry no `cause` and no text of the database error (its message,
`detail`, `hint` or `where` may quote the key or the response). A failure to obtain a connection,
before the write starts, propagates unchanged and is not a `CacheWriteFailed`; so does a failure to
open the savepoint on a caller-owned transaction, as for the claim write. A failure of
`findCacheEntry` propagates unchanged.

Every statement SHALL be parameterised. The calls SHALL cooperate with a caller-owned transaction as
the claim write does: on its own connections a write commits before returning; on a caller-owned
transaction it neither commits nor rolls it back, and on failure undoes only its own write and leaves
that transaction usable.

The in-memory store double used by unit tests SHALL implement the four calls with the same checks, in
the same order, with the same errors; SHALL keep its entries (key, stored response, hit count, last hit
instant) for a test to read and to seed, an invalid stored response included; SHALL count the calls;
and SHALL let a test inject a failure of each call, raised as the error the test gives.

#### Scenario: A saved entry is found by its project and key

- **GIVEN** two projects
- **WHEN** a response is saved in the first project under the key `como se calcula el precio`, and that
  key is looked up in the first project, then the key `otra pregunta` in the first project, then the
  first key in the second project
- **THEN** the first lookup resolves to an entry whose response equals the saved one, and the other
  two resolve to nothing
- **AND** the saved row has `hit_count` 0, `last_hit_at` `NULL` and `question_embedding` `NULL`

#### Scenario: Saving a key again replaces its entry

- **GIVEN** a project with a response R₁ saved under a key and touched once, and an entry under
  another key
- **WHEN** a response R₂ is saved under the first key
- **THEN** the project holds exactly one entry for that key, whose response is R₂, whose `hit_count` is
  0 and whose `last_hit_at` is `NULL`
- **AND** the entry of the other key is unchanged

#### Scenario: Concurrent saves of one key leave one entry

- **GIVEN** a project committed on the store's own connections
- **WHEN** two responses are saved under the same key at the same time on the store's own connections
- **THEN** both calls resolve and the project holds exactly one entry for that key, holding one of the
  two responses

#### Scenario: The most recent of duplicated entries is found

- **GIVEN** a project whose `cache_entry` holds, inserted directly, two rows of the same key created at
  `2026-10-01T00:00:00Z` (response R₁) and `2026-10-02T00:00:00Z` (response `NULL`)
- **WHEN** that key is looked up
- **THEN** the lookup resolves to the second row, with response `null`

#### Scenario: Touching an entry records the hit

- **GIVEN** two projects, each with one entry
- **WHEN** the first project's entry is touched at t₁ and then at t₂, the second project's entry is
  touched naming the first project, and a random UUID is touched in the first project
- **THEN** every call resolves; the first project's entry has `hit_count` 2 and `last_hit_at` t₂, and
  the second project's entry has `hit_count` 0 and `last_hit_at` `NULL`

#### Scenario: Invalidating a project deletes only its entries

- **GIVEN** a project A with two entries and a project B with one
- **WHEN** the cache of A is invalidated, and then invalidated again
- **THEN** the first call resolves to 2 and the second to 0; A has no `cache_entry` and B keeps its
  entry

#### Scenario: Invalid cache arguments are rejected before querying

- **WHEN** each of the four calls is made with the project id `not-a-uuid`; a lookup and a save of an
  existing project with the key `""`, with `"   "` and with a key holding U+0000; a save with the
  response `null`, `[]` and `"x"`; and a touch with the entry id `x` and with the instant
  `new Date('x')`
- **THEN** the first four fail with `ProjectNotFound`, and the others with `InvalidStoreQuery` naming
  `question`, `response`, `entryId` and `at` respectively, whose messages hold no value given
- **AND** no statement was sent to the database for any of them

#### Scenario: Cache calls on an unknown project fail without writing

- **WHEN** each of the four calls is made on the caller's transaction with a well-formed UUID that
  names no project
- **THEN** each fails with `ProjectNotFound`
- **AND** no `cache_entry` row was written, and a following query on the same transaction succeeds

#### Scenario: A failed cache write does not leak

- **GIVEN** a project, and the database rejecting the insert of a cache entry whose key is a sentinel
  text with an error whose `detail` quotes that key
- **WHEN** a response is saved under that key on the caller's transaction
- **THEN** the call rejects with `CacheWriteFailed`, and the serialised error holds neither the
  sentinel nor any text of the database error
- **AND** no `cache_entry` row of the call exists, and a following query on the same transaction
  succeeds

#### Scenario: A failed rollback of a cache write is a write failure

- **GIVEN** a store whose cache write fails and whose rollback then fails too
- **WHEN** a response is saved, an entry is touched and a cache is invalidated on the store's own
  connections, and again on a caller-owned transaction whose rollback to the savepoint fails
- **THEN** each call rejects with `CacheWriteFailed`, which carries no `cause` and no text of either
  database error

#### Scenario: Cache writes on the store's own connections commit

- **WHEN** a response is saved and touched on the store's own connections, and the calls return
- **THEN** another connection sees the entry with `hit_count` 1, and after `invalidateCache` returns it
  sees none

#### Scenario: A store that cannot give a connection fails cache writes with its own error

- **GIVEN** a store on its own connections whose pool has been ended
- **WHEN** a response is saved
- **THEN** the call rejects with the pool's own error, not with `CacheWriteFailed`

#### Scenario: The in-memory double keeps, checks and fails cache entries

- **GIVEN** the in-memory store with two projects
- **WHEN** a response is saved and looked up in the first project, touched, saved again, the first
  project's cache is invalidated, a lookup is made with `not-a-uuid` and with the key `""`, and, with a
  save failure injected as `CacheWriteFailed`, a response is saved in the second project
- **THEN** the lookup resolves to the saved response; after the touch the entry has hit count 1; after
  the second save the project holds one entry with hit count 0; the invalidation resolves to 1; the
  invalid lookups fail with `ProjectNotFound` and `InvalidStoreQuery` naming `question`; the injected
  failure rejects with `CacheWriteFailed`
- **AND** the double holds no entry of either project, and its call counts record each call
