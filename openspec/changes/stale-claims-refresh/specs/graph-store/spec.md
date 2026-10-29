## ADDED Requirements

### Requirement: Claim refresh

The store SHALL let the domain rewrite one stale claim in place, in one atomic and conditional
operation: `refreshClaim(projectId, claimId, item, readAtCommit)`, where `item` is a claim record and
the list of its evidence records (as one item of "Claim write") and `readAtCommit` is the commit the
item's evidence was read at, SHALL resolve to `{ refreshed: true, evidenceIds }`, with the ids the
new evidence was stored under in the order given, or to `{ refreshed: false }` when it wrote nothing.

- A `projectId` that is not a well-formed UUID MUST fail with `ProjectNotFound` before any other
  check and before any statement. Then a `claimId` that is not a well-formed UUID MUST fail with
  `InvalidStoreQuery` naming `claimId`, and an item that "Claim write" would reject (a record that
  fails its schema, a claim of another project id, an empty evidence list), or whose claim status is
  not `current`, MUST fail with `InvalidStoreQuery` naming `claims`, both before any statement. Then
  a `projectId` that names no project MUST fail with `ProjectNotFound`, and an evidence whose file is
  not a file of that project MUST fail with `InvalidStoreQuery` naming `claims`; in both cases nothing
  SHALL be written. The error's message SHALL be fixed text that never holds a record value.
- Under the same lock as "Claim write" (the project row, so a concurrent graph write of the project
  waits) and with the claim's row locked against another refresh, the store SHALL write only when the
  claim is a claim of that project, its status is `stale`, and `readAtCommit` is the project's indexed
  commit at that moment. Otherwise it SHALL write nothing and resolve `{ refreshed: false }`: a claim
  another call already refreshed, a claim read before a re-index moved the indexed commit, and an id
  that names no claim of the project are not rewritten.
- When it writes, it SHALL, in the claim's own row (same id, same project, same instant of creation),
  replace the subject, predicate, object, layer, type, confidence and provenance with the item's, set
  the status to `current` and the instant it was last written to the time of the write; delete every
  evidence row of the claim; and insert the item's evidence with new ids. All of it SHALL be written,
  or none.
- A refreshed claim SHALL then be read by "Claim retrieval by overlapping span" with its new values
  and evidence, at the position its unchanged instant of creation gives it.
- Any database failure once the write has started, including a failure to roll it back, SHALL reject
  with `ClaimWriteFailed`, with no `cause` and no text of the database error, and SHALL leave the
  claim and its evidence as they were. A failure to obtain a connection, or to open the savepoint on
  a caller-owned transaction, propagates unchanged, as in "Claim write".
- The operation SHALL cooperate with a caller-owned transaction as "Claim write" does.
- The in-memory store double SHALL behave the same way, SHALL let a test inject a `ClaimWriteFailed`
  at the refresh of a given claim, and SHALL let a test run a callback just before the condition is
  checked (to move the indexed commit or change the claim in between).

#### Scenario: A stale claim is refreshed in place

- **GIVEN** a project indexed at commit `C2` with files `a.php` and `b.php`, and a `stale` claim `c1`
  with two evidence rows on `a.php`, written before the call
- **WHEN** `c1` is refreshed, read at `C2`, with a `current` record of a new object and provenance and
  one evidence on `b.php` lines 4–6
- **THEN** the result is `{ refreshed: true }` with one new evidence id
- **AND** the database holds `c1` with the same id and creation instant, the new object, provenance
  and confidence, status `current` and a later last-written instant, one evidence row with the new id
  on `b.php` lines 4–6, and neither of its two previous evidence rows
- **AND** reading the claims overlapping `b.php` lines 1–10 returns `c1` with that evidence

#### Scenario: A stale claim is refreshed in place (in-memory double)

- **GIVEN** the in-memory store with a project indexed at `C2` and a seeded `stale` claim `c1` with
  two evidence entries
- **WHEN** `c1` is refreshed, read at `C2`, with a new `current` record and one evidence
- **THEN** the result is `{ refreshed: true }` with one new evidence id, and the double holds `c1`
  `current` with the new record and only the new evidence, at the same position among the claims

#### Scenario: A refresh that is no longer due writes nothing

- **GIVEN** a project indexed at `C2` with a `stale` claim `c1`, a `current` claim `c2`, and a claim
  `c3` of another project
- **WHEN** `c1` is refreshed twice in a row, read at `C2`; then a new `stale` claim is refreshed read
  at `C1`; then `c2` is refreshed; then `c3` is refreshed in the first project; then a well-formed id
  that names no claim is refreshed
- **THEN** the first refresh of `c1` resolves `{ refreshed: true }` and every other call resolves
  `{ refreshed: false }`
- **AND** none of those other calls changed any claim or evidence row

#### Scenario: A refresh that is no longer due writes nothing (in-memory double)

- **GIVEN** the in-memory store with a project indexed at `C2` and a `stale` claim `c1`
- **WHEN** `c1` is refreshed read at `C1`; then refreshed read at `C2` with a callback that moves the
  indexed commit to `C3` just before the check; then refreshed twice in a row read at `C3`
- **THEN** the results are `{ refreshed: false }`, `{ refreshed: false }`, `{ refreshed: true }` and
  `{ refreshed: false }`, and only the third call changed `c1`

#### Scenario: A failure while refreshing leaves the claim as it was

- **GIVEN** a project with file `a.php`, a `stale` claim `c1` with one evidence, and the database
  rejecting the insert of a new evidence whose excerpt is a sentinel text with an error whose `detail`
  quotes that excerpt
- **WHEN** `c1` is refreshed on the caller's transaction with that evidence
- **THEN** the call rejects with `ClaimWriteFailed`, and the serialised error holds neither the
  sentinel nor any text of the database error
- **AND** `c1` is still `stale` with its previous values and its previous evidence row, and a
  following query on the same transaction succeeds

#### Scenario: A failure while refreshing leaves the claim as it was (in-memory double)

- **GIVEN** the in-memory store with a `stale` claim `c1` and a failure injected at its refresh
- **WHEN** `c1` is refreshed
- **THEN** the call rejects with `ClaimWriteFailed` and the double holds `c1` unchanged

#### Scenario: Invalid refresh arguments are rejected

- **WHEN** a claim is refreshed in the project `not-a-uuid`; with the claim id `x`; with an item whose
  claim status is `stale`; with an item without evidence; with an `L2` `INFERENCE` record without a
  statement type; in a well-formed UUID that names no project; and with an evidence citing a file of
  another project
- **THEN** the calls fail with `ProjectNotFound`, `InvalidStoreQuery` naming `claimId`,
  `InvalidStoreQuery` naming `claims` three times, `ProjectNotFound` and `InvalidStoreQuery` naming
  `claims`, respectively
- **AND** the first five sent no statement to the database, no call wrote anything, and a following
  query on the caller's transaction succeeds

#### Scenario: Invalid refresh arguments are rejected (in-memory double)

- **WHEN** a claim is refreshed in the in-memory store in `not-a-uuid`, with the claim id `x`, and
  with an item whose claim status is `stale`
- **THEN** the calls fail with `ProjectNotFound`, `InvalidStoreQuery` naming `claimId` and
  `InvalidStoreQuery` naming `claims`
