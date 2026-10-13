## ADDED Requirements

### Requirement: Claim write

The store SHALL write the claims of one answer, each with its evidence, in one atomic operation:
`saveClaims(projectId, items)`, where each item is a claim record and the list of its evidence
records (the records of the `claims-and-typing` capability), SHALL resolve to one entry per item, in
the order given, holding the id the claim was stored under and the ids each evidence was stored
under, in the order given.

- A `projectId` that is not a well-formed UUID MUST fail with `ProjectNotFound` before any other
  check and before any statement. Then every claim and every evidence SHALL pass its record schema
  and every claim's project id SHALL equal `projectId` (compared in any letter case, as a well-formed
  id is accepted in any letter case), otherwise the call MUST fail with
  `InvalidStoreQuery` naming `claims` before any statement. Then a `projectId` that names no project
  MUST fail with `ProjectNotFound`, and an evidence whose file is not a file of that project MUST fail
  with `InvalidStoreQuery` naming `claims`; in both cases nothing SHALL be written. The error's
  message SHALL be fixed text that never holds a record value. An item whose evidence list is empty
  SHALL fail the same way, with `InvalidStoreQuery` naming `claims`, before any statement.
- Every claim and every evidence of the call SHALL be written, or none: a failure while writing any
  of them SHALL leave no row of the call.
- Any database failure once the write has started, including a failure to roll it back, SHALL reject
  with the domain error `ClaimWriteFailed` (code `CLAIM_WRITE_FAILED`), which SHALL carry no `cause`
  and no text of the database error (its message, `detail`, `hint` or `where` may quote a written
  value, such as an excerpt). A failure to obtain a connection, before the write starts, propagates
  unchanged and is not a `ClaimWriteFailed`.
- An empty list SHALL resolve to an empty list without writing any row; the project is still
  checked, so a well-formed id that names no project fails with `ProjectNotFound`.
- The write SHALL cooperate with a caller-owned transaction as `saveGraph` does: on its own
  connections it commits before returning; on a caller-owned transaction it neither commits nor rolls
  it back, and on failure undoes only its own writes and leaves that transaction usable.
- The in-memory store double used by unit tests SHALL behave the same way and SHALL let a test inject
  a failure at the write of a given evidence.

#### Scenario: The claims of an answer are written with their evidence

- **GIVEN** a project with files `a.php` and `b.php`
- **WHEN** two claims are saved, the first with evidence on `a.php` lines 3–5 and on `b.php` lines
  1–2, the second with evidence on `a.php` lines 10–12
- **THEN** the result holds two claim ids and, in order, two and one evidence ids
- **AND** the database holds those two claims and three evidence rows, each linked to its claim with
  the lines and excerpt given
- **AND** saving the same claims again with `projectId` written in upper case also succeeds

#### Scenario: A failure while writing evidence leaves no claim

- **GIVEN** a project with file `a.php`, and the database rejecting the write of an evidence whose
  excerpt is a sentinel text with an error whose `detail` quotes that excerpt
- **WHEN** two claims are saved on the caller's transaction, the second with that evidence
- **THEN** the call rejects with `ClaimWriteFailed`, and the serialised error holds neither the
  sentinel nor any text of the database error
- **AND** no claim and no evidence of the call exist, and a following query on the same transaction
  succeeds

#### Scenario: A failure while writing evidence leaves no claim (in-memory double)

- **GIVEN** the in-memory store with a project and a failure injected at the write of the evidence of
  the second claim
- **WHEN** two claims are saved
- **THEN** the call rejects with `ClaimWriteFailed`
- **AND** the double holds no claim and no evidence of the call

#### Scenario: Invalid claims are rejected before writing

- **WHEN** claims are saved with an `L2` `INFERENCE` claim without a statement type, with a claim
  whose object holds U+0000, and with a claim of another project id
- **THEN** each call fails with `InvalidStoreQuery` naming `claims`, and no statement was sent to the
  database
- **AND** when claims are saved with evidence citing a file of another project, the call fails with
  `InvalidStoreQuery` naming `claims`, nothing was written, and a following query on the caller's
  transaction succeeds

#### Scenario: Saving claims on the store's own connections commits

- **WHEN** a claim is saved on the store's own connections and the call returns
- **THEN** another connection sees the claim and its evidence

#### Scenario: A store that cannot give a connection fails with its own error

- **GIVEN** a store on its own connections whose pool has been ended
- **WHEN** a claim is saved
- **THEN** the call rejects with the pool's own error, not with `ClaimWriteFailed`

#### Scenario: Claim operations in an unknown project fail

- **WHEN** claims are saved and read in the project `not-a-uuid`, and then, with a non-empty and with
  an empty list each, in a well-formed UUID that names no project
- **THEN** each call fails with `ProjectNotFound`, and the first two sent no statement to the database
- **AND** reading overlapping claims in an existing project that has no claim resolves to an empty
  list

#### Scenario: Unknown projects and invalid spans are rejected (in-memory double)

- **GIVEN** the in-memory store with one project
- **WHEN** claims are saved and read in `not-a-uuid`, and in a well-formed UUID that names no project
  with an empty list, and claims are read in the project with a span whose last line is before its
  first
- **THEN** the first calls fail with `ProjectNotFound` and the last with `InvalidStoreQuery` naming
  `spans`

#### Scenario: Empty inputs read and write nothing

- **WHEN** an empty list of claims is saved, and overlapping claims are read with an empty list of
  spans, in an existing project
- **THEN** both resolve to an empty list, no claim or evidence row was read or written, and only the
  project check was sent to the database

### Requirement: Claim retrieval by overlapping span

The store SHALL let the domain read the most recent claims of a project whose evidence overlaps given
spans: `findClaimsOverlapping(projectId, spans)`, where each span is a file id, a first line and a
last line, SHALL resolve to the claims of that project with at least one evidence on the file of a
span whose lines overlap it, inclusively (`evidence first line ≤ span last line` and
`evidence last line ≥ span first line`), at most `MAX_PRIOR_CLAIMS` (20, an exported constant) of
them: the most recent ones.

- The result SHALL be scoped by project first: a claim of another project SHALL never be returned,
  even when its evidence cites the same lines of a file with the same id.
- Each claim SHALL appear once, with its id, subject, predicate, object, layer, type, status,
  provenance and all its evidence (id, file id, file path, first and last line, verification,
  excerpt). Claims SHALL be ordered newest first: by the instant each was written, descending, then
  by id descending (the order of the claims of one answer is not the order of its statements);
  evidence by first line, then by id. The instant a claim was written SHALL be the time of its
  write, not the start of the transaction it was written in.
- A `projectId` that is not a well-formed UUID MUST fail with `ProjectNotFound` before querying. A
  span that the input-span record of `claims-and-typing` rejects (a file id that is not a UUID, a
  first line below 1, a last line before the first, a line above 2 147 483 647) MUST fail with
  `InvalidStoreQuery` naming `spans` before querying. A well-formed `projectId` that names no project
  MUST fail with `ProjectNotFound`, also with an empty span list, while a project with no matching
  claim, or an empty span list in a known project, resolves to an empty list without reading any
  claim.
- The read SHALL write nothing and SHALL work on the store's own connections and on a caller-owned
  transaction.
- The in-memory store double SHALL behave the same way.

#### Scenario: Overlap is inclusive at both ends

- **GIVEN** a project with files `F` and `G` and five claims whose only evidence is on `F` lines
  10–20, `F` lines 20–25, `F` lines 21–30, `F` lines 1–9 and `G` lines 10–20
- **WHEN** the claims overlapping `F` lines 10–20 are read
- **THEN** the result holds exactly the first two claims

#### Scenario: Overlap is inclusive at both ends (in-memory double)

- **GIVEN** the in-memory store with the same files and five claims
- **WHEN** the claims overlapping `F` lines 10–20 are read
- **THEN** the result holds exactly the first two claims

#### Scenario: Claims of another project are never returned

- **GIVEN** two projects, and a claim of the second whose evidence cites lines 10–20 of a file of
  the first (a row the claim writer never produces, inserted directly in the database)
- **WHEN** the claims overlapping that file's lines 10–20 are read in the first project
- **THEN** the result is empty

#### Scenario: Claims of another project are never returned (in-memory double)

- **GIVEN** the in-memory store with two projects, and a claim of the second seeded with evidence on
  lines 10–20 of a file of the first
- **WHEN** the claims overlapping that file's lines 10–20 are read in the first project
- **THEN** the result is empty

#### Scenario: A claim with several overlapping evidences appears once with all its evidence

- **GIVEN** a claim with evidence on `F` lines 1–3, `F` lines 15–16 and `G` lines 1–2
- **WHEN** the claims overlapping `F` lines 1–20 are read
- **THEN** the result holds that claim once, with its three evidences and their file paths

#### Scenario: The most recent claims come first, at most twenty

- **GIVEN** a project with file `F` and 21 claims on `F` lines 1–10, each saved in its own call, the
  third of them with evidence on lines 5–6, 1–2 and 3–4
- **WHEN** the claims overlapping `F` lines 1–10 are read, on the store's own connections and on a
  caller-owned transaction
- **THEN** both results hold the 20 most recent claims, newest first, without the first one saved
- **AND** the third claim's evidence is ordered by first line: 1–2, 3–4, 5–6

#### Scenario: Invalid spans are rejected before querying

- **WHEN** claims are read with a span whose file id is `x`, and with a span whose last line is
  before its first
- **THEN** each call fails with `InvalidStoreQuery` naming `spans`
- **AND** no statement was sent to the database
