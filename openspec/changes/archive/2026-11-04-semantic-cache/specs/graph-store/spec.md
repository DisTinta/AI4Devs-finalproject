## MODIFIED Requirements

### Requirement: Answer cache entries

The store SHALL let the domain keep the answer cache of a project in `cache_entry`, at most one entry
per project and normalized question, through five calls:

- `findCacheEntry(projectId, questionNormalized)` SHALL resolve to the entry of that project with that
  key, as its id and its stored response (the JSON value written, or `null` when the column is
  `NULL`), or to nothing when there is none. When the table holds more than one entry for the pair
  (rows written outside the store), the most recently created SHALL be returned (by `created_at`,
  then by `id`, both descending). It SHALL write nothing.
- `findSimilarCacheEntry(projectId, embedding, minSimilarity)` SHALL resolve to the entry of that
  project, among those whose `question_embedding` is not `NULL`, with the greatest cosine similarity
  to `embedding` (1 minus the pgvector cosine distance `<=>`), as its id, its stored response (as for
  `findCacheEntry`) and that `similarity`, when that similarity is at least `minSimilarity`; and to
  nothing when the project has no entry with an embedding or its most similar one is below
  `minSimilarity`. Equal similarities SHALL go to the most recently created entry, then to the greatest
  `id`. The search SHALL be exact over the project's entries: whatever the entries of other projects,
  the most similar entry of the project is found when it reaches `minSimilarity`. It SHALL write
  nothing.
- `saveCacheEntry(projectId, questionNormalized, response, embedding?)` SHALL leave exactly one entry
  for the pair: it deletes every entry of the pair and inserts the new one, with `hit_count` 0,
  `last_hit_at` `NULL` and `question_embedding` the given `embedding`, or `NULL` when none is given
  (`undefined`), as one atomic write. Two saves of the same pair running at the same time SHALL leave
  exactly one entry (the saves of one pair are serialised). It SHALL resolve with nothing.
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
- an `embedding` (required by `findSimilarCacheEntry`, optional in `saveCacheEntry`) that is not an
  array of exactly `EMBEDDING_DIMENSIONS` numbers, that holds a number that is not finite, or whose
  every component is 0, MUST fail with `InvalidStoreQuery` naming `embedding`;
- a `minSimilarity` that is not a finite number between 0 and 1, both included, MUST fail with
  `InvalidStoreQuery` naming `minSimilarity`;
- an `entryId` that is not a well-formed UUID MUST fail with `InvalidStoreQuery` naming `entryId`;
- an `at` that is not a valid date MUST fail with `InvalidStoreQuery` naming `at`.

The message of each such error SHALL be fixed text that holds no value given (no key, no response and
no component of an embedding). Then a well-formed `projectId` that names no project MUST fail with
`ProjectNotFound`, and nothing SHALL be written.

A database failure once a write (`saveCacheEntry`, `touchCacheEntry`, `invalidateCache`) has started,
including a failure to roll it back, SHALL reject with the domain error `CacheWriteFailed` (code
`CACHE_WRITE_FAILED`), which SHALL carry no `cause` and no text of the database error (its message,
`detail`, `hint` or `where` may quote the key, the response or the embedding). A failure to obtain a
connection, before the write starts, propagates unchanged and is not a `CacheWriteFailed`; so does a
failure to open the savepoint on a caller-owned transaction, as for the claim write. A failure of
`findCacheEntry` or of `findSimilarCacheEntry` propagates unchanged.

Every statement SHALL be parameterised, the embedding included (sent as one parameter cast to
`vector`, never spliced into the statement text). The calls SHALL cooperate with a caller-owned
transaction as the claim write does: on its own connections a write commits before returning; on a
caller-owned transaction it neither commits nor rolls it back, and on failure undoes only its own write
and leaves that transaction usable.

The in-memory store double used by unit tests SHALL implement the five calls with the same checks, in
the same order, with the same errors; SHALL keep its entries (key, stored response, embedding, hit
count, last hit instant, creation order) for a test to read and to seed, an invalid stored response
and an entry without embedding included; SHALL compute the similarity as the cosine similarity of the
two vectors in double precision, with the same choice of entry and the same ties as the database;
SHALL store and return a JSON round trip of each response (`JSON.parse(JSON.stringify(response))`),
as the column does; SHALL count the calls; and SHALL let a test inject a failure of each call, raised
as the error the test gives.

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

- **WHEN** each of the five calls is made with the project id `not-a-uuid`; a lookup and a save of an
  existing project with the key `""`, with `"   "` and with a key holding U+0000; a save with the
  response `null`, `[]` and `"x"`; a similarity lookup and a save with an embedding of
  `EMBEDDING_DIMENSIONS − 1` components, with a `NaN` component, with an `Infinity` component, with
  every component 0, and the embedding `"[1,2]"`; a similarity lookup with the minimum similarity
  `-0.1`, `1.1` and `NaN`; and a touch with the entry id `x` and with the instant `new Date('x')`
- **THEN** the first five fail with `ProjectNotFound`, and the others with `InvalidStoreQuery` naming
  `question`, `response`, `embedding`, `minSimilarity`, `entryId` and `at` respectively, whose
  messages hold no value given
- **AND** no statement was sent to the database for any of them

#### Scenario: Cache calls on an unknown project fail without writing

- **WHEN** each of the five calls is made on the caller's transaction with a well-formed UUID that
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
- **AND** with a caller-owned transaction whose `SAVEPOINT` rejects, a save rejects with that same
  error, not with `CacheWriteFailed`

#### Scenario: Cache writes on the store's own connections commit

- **WHEN** a response is saved and touched on the store's own connections, and the calls return
- **THEN** another connection sees the entry with `hit_count` 1, and after `invalidateCache` returns it
  sees none

#### Scenario: A store that cannot give a connection fails cache writes with its own error

- **GIVEN** a store on its own connections whose pool has been ended
- **WHEN** a response is saved
- **THEN** the call rejects with the pool's own error, not with `CacheWriteFailed`

#### Scenario: A saved embedding is found by similarity within its project

- **GIVEN** two projects; in the first, a response R₁ saved under `como se calcula el precio final de
  un pedido` with the embedding E1 (the unit vector of the first component) and a response R₂ saved
  under `otra pregunta` without an embedding; in the second, a response R₃ saved with E1
- **WHEN** the first project is searched with E1 and minimum 0.85, with a vector Q (first five
  components `17, 10, 3, 1, 1`, the rest 0) and minimum 0.8, with Q and minimum 0.9, and with the unit
  vector of the second component and minimum 0
- **THEN** the first resolves to R₁'s id and response with a similarity within 1e-6 of 1, the second to
  R₁ with a similarity within 1e-6 of 0.85, the third to nothing, and the fourth to R₁ with a
  similarity within 1e-6 of 0 (R₂ has no embedding and is never returned)
- **AND** R₁'s row holds `question_embedding` equal to E1, and no row's `hit_count` changed

#### Scenario: The most similar entry wins and ties go to the most recent

- **GIVEN** a project with entries A (similarity 0.88 with a query vector Q) and B (similarity 0.95),
  and two entries C and D of the same embedding inserted directly with `created_at`
  `2026-10-01T00:00:00Z` and `2026-10-02T00:00:00Z`; C and D have a similarity below 0.88 with Q, and
  A and B a similarity below 0.99 with the embedding of C and D; then an entry E inserted directly with
  the embedding and `created_at` of D and an `id` greater than D's (both ids given explicitly)
- **WHEN** the project is searched with Q and minimum 0.85, and with the embedding of C and D and
  minimum 0.99, before and after E is inserted
- **THEN** the first resolves to B, the second to D before E exists and to E after

#### Scenario: The similarity search is exact whatever the other projects hold

- **GIVEN** a first project with one entry whose embedding has a similarity of 0.9 with a query vector
  Q, and a second project with 200 entries whose embeddings have similarities between 0.95 and 1 with Q
- **WHEN** the first project is searched with Q and minimum 0.85
- **THEN** it resolves to the first project's entry

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

#### Scenario: The in-memory double searches by similarity like the database

- **GIVEN** the in-memory store seeded with the entries of "A saved embedding is found by similarity
  within its project" (in the first project R₁ with E1 and R₂ without an embedding, in the second
  project R₃ with E1) and, in a third project, the entries A, B, C and D of "The most similar entry
  wins and ties go to the most recent" with their embeddings and with C created at
  `2026-10-01T00:00:00Z` and D at `2026-10-02T00:00:00Z`, and E seeded after them with the embedding
  and creation instant of D (the double assigns both ids)
- **WHEN** the four searches of the first of those scenarios are made in the first project and the two
  of the second in the third project (with E present); then the first project is searched with the vector Q whose
  first five components are `17, 10, 3, 1, 1` (the rest 0) and minimum 0.85; then with an embedding
  of `EMBEDDING_DIMENSIONS − 1` components; then with a similarity failure injected as an `Error`
- **THEN** the first six searches resolve as in those two scenarios (R₁ with similarity 1, R₁, nothing,
  R₁ with similarity 0; B, and whichever of D and E has the greater id in byte order), with exactly
  computed similarities; the search with Q and minimum 0.85
  resolves to R₁ with a similarity of exactly `0.85`; the short embedding fails with
  `InvalidStoreQuery` naming `embedding`; the injected failure rejects with that `Error`
- **AND** its call counts record each similarity search
- **AND** the scenario "The similarity search is exact whatever the other projects hold" is not
  repeated on the double, which has no index and always scans every entry of the project
