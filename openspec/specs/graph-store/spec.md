# graph-store Specification

## Purpose

The write side of the knowledge-graph store: how the domain creates a project and persists the L1
graph of an indexed repository (files, symbols, edges, commits and file–commit links) through
`StorePort`, atomically and without knowing SQL, while keeping file identity across reindexes.

## Requirements

### Requirement: Project creation

The store SHALL let the domain create a project from its name, root path, language, optional
framework and sample flag, and SHALL return the new project's id.

- A new project SHALL start unindexed: `node_count` = 0, `edge_count` = 0, `indexed_commit` and
  `indexed_at` unset.
- `framework` SHALL be set only here (or left unset); no operation of this capability changes it
  afterwards.
- Creating a project whose name is already used MUST fail with the domain error
  `ProjectNameTaken` and MUST NOT modify the existing project.

#### Scenario: A project is created unindexed

- **WHEN** a project is created with a unique name, a root path, language `php` and framework
  `laravel`
- **THEN** the store returns an id, and a project with that id and those values exists
- **AND** its `node_count` and `edge_count` are 0 and its `indexed_commit` and `indexed_at` are
  unset

#### Scenario: A duplicate project name is rejected

- **WHEN** a project is created with the name of an existing project
- **THEN** the call fails with `ProjectNameTaken`
- **AND** the existing project is unchanged and no second project exists

### Requirement: Graph shape

The graph passed to `saveGraph` SHALL be database-agnostic: it SHALL NOT contain database ids.

- A file SHALL be identified by its repository-relative `path`.
- A symbol SHALL belong to one file of the graph and SHALL be identified within the graph by its
  file path, name and start line.
- An edge endpoint SHALL be exactly one file (by path) or one symbol (by its identity above), and
  every edge SHALL carry `kind`, `resolution` and a non-empty `extractor`.
- A commit SHALL be identified by its `sha`; a file–commit link SHALL reference one file path and
  one commit sha of the same graph.

Because every reference resolves inside the graph, and the graph belongs to one project, a saved
edge or file–commit link SHALL NEVER connect rows of two different projects.

#### Scenario: Edges connect the saved rows of the same project

- **WHEN** a graph with a symbol→symbol edge, a file→file edge and a symbol→file edge is saved
- **THEN** each stored edge references the stored symbol or file rows the graph named, and all of
  them belong to the project the graph was saved to

### Requirement: Graph validation before writing

`saveGraph` MUST validate the whole graph before writing anything, and MUST reject an invalid graph
with the domain error `InvalidGraph`, whose details name every violation found. A rejected graph
MUST leave the database unchanged.

The graph is invalid when any of these holds:

- an edge has no `resolution`, or its `extractor` is absent or the empty string;
- an edge endpoint names both a file and a symbol, or neither;
- an edge endpoint, a symbol's file or a file–commit link references a file, symbol or commit that
  is not in the graph;
- two files share a path, two symbols share an identity, or two commits share a sha, or the same
  file–commit pair appears twice;
- a commit `sha` is empty, or a counter is negative (`loc`, `lines_added`, `lines_removed`,
  `pr_number`), or a symbol's span is invalid (`start_line` < 1 or `end_line` < `start_line`).

Constraints the schema already enforces and that need no cross-reference (for example the edge
weight range) MAY be left to the database; their rejection is covered by the atomicity requirement.

#### Scenario: An edge without resolution is rejected

- **WHEN** a graph is validated whose only invalid element is an edge without `resolution`
- **THEN** validation fails with `InvalidGraph`, and its details name that edge and the missing
  `resolution`

#### Scenario: An edge without extractor is rejected

- **WHEN** a graph is validated whose only invalid elements are one edge without `extractor` and
  one edge whose `extractor` is the empty string
- **THEN** validation fails with `InvalidGraph`, and its details name both edges and the missing
  `extractor`

#### Scenario: A dangling reference is rejected

- **WHEN** a graph is validated with an edge whose target symbol is not in the graph, and a
  file–commit link whose commit sha is not in the graph
- **THEN** validation fails with `InvalidGraph`, and its details name both references

#### Scenario: Duplicate keys are rejected

- **WHEN** a graph is validated with two files of the same path and two symbols of the same
  identity
- **THEN** validation fails with `InvalidGraph`, and its details name both duplicates

#### Scenario: Invalid history and span values are rejected

- **WHEN** a graph is validated with an empty commit sha, a negative value in each counter (a
  file's `loc`, a file–commit link's `lines_added` and `lines_removed`, a commit's `pr_number`), a
  symbol whose `start_line` is 0 and a symbol whose `end_line` is before its `start_line`
- **THEN** validation fails with `InvalidGraph`, and its details name each of those seven values

#### Scenario: A valid graph passes validation

- **WHEN** a graph is validated with files, symbols, edges of every endpoint combination, commits
  and file–commit links, all consistent
- **THEN** validation succeeds

#### Scenario: A rejected graph writes nothing

- **WHEN** `saveGraph` is called with an edge without `resolution` on a project that already holds
  a saved graph
- **THEN** the call fails with `InvalidGraph`
- **AND** the project's files, symbols, edges, commits, file–commit links and indexing metadata are
  exactly as before the call

### Requirement: Saving requires an existing project

`saveGraph` MUST fail with the domain error `ProjectNotFound` when the project id does not exist
or is not a well-formed UUID, and MUST NOT write anything. A malformed id MUST NOT surface as a
database error.

Graph validation SHALL run before the project check: a graph that is invalid fails with
`InvalidGraph`, even when the project id is unknown or not a well-formed UUID.

#### Scenario: Saving to an unknown project fails

- **WHEN** `saveGraph` is called with a well-formed UUID that is no project's id and a valid graph
- **THEN** the call fails with `ProjectNotFound`
- **AND** no file, symbol, edge, commit or file–commit row was written

#### Scenario: Saving with a malformed project id fails

- **WHEN** `saveGraph` is called with the project id `not-a-uuid` and a valid graph
- **THEN** the call fails with `ProjectNotFound`, not with a database error
- **AND** no file, symbol, edge, commit or file–commit row was written

### Requirement: Atomic graph write

A `saveGraph` call SHALL write in a single transaction: either the whole snapshot is persisted, or,
when any statement fails, nothing of the call remains and the project keeps its previous state.

#### Scenario: A database rejection rolls back the whole write

- **WHEN** a project holds a saved graph and `saveGraph` is called with a snapshot that passes
  validation but has an edge whose weight is outside [0, 1]
- **THEN** the call fails
- **AND** the project's files, symbols, edges, commits, file–commit links and indexing metadata are
  exactly as before the call

#### Scenario: A first save persists the whole graph

- **WHEN** `saveGraph` is called on a newly created project with a graph of files, symbols, edges,
  commits and file–commit links
- **THEN** every element of the graph is stored under that project with the values given
- **AND** the result reports how many files, symbols, edges, commits and file–commit links were
  written, and how many files were deleted (`filesDeleted`, 0 on a first save)

### Requirement: Snapshot semantics

The graph passed to `saveGraph` SHALL be the complete L1 state of the project at the indexed
commit.

- A file in the snapshot whose path already exists in the project SHALL be updated in place,
  keeping its id; a new path SHALL be inserted. Files MUST NOT be deleted and re-inserted.
- A file of the project whose path is not in the snapshot SHALL be deleted (it left the
  repository), together with what the schema cascades from it.
- Before a file absent from the snapshot is deleted, in the same transaction, every `current`
  claim of the project with evidence citing that file SHALL become `stale`. The claim itself is
  kept; only its evidence on that file goes with the cascade. A claim already `stale` stays
  `stale`, and no claim is turned back to `current`.
- After the call, the project's symbols and edges SHALL be exactly those of the snapshot.
- Commits SHALL be upserted by sha and file–commit links by (file, commit); a commit or link absent
  from the snapshot SHALL be kept. History is only ever added to, except through the cascade of a
  deleted file.
- When a commit or file–commit link of the snapshot is already stored, each optional field the
  snapshot gives a value (`message`, `author_hash`, `committed_at`, `pr_number`; `lines_added`,
  `lines_removed`) SHALL overwrite the stored one, and each optional field it omits (absent or
  null) SHALL keep the stored value.
- A file of the snapshot SHALL take exactly the snapshot's `kind`, `loc`, `content_hash` and
  `redacted`: an omitted `loc` or `content_hash` becomes unset, an omitted `redacted` becomes
  false. `saveGraph` SHALL NOT write a file's `embedding`.
- Rows of any other project MUST NOT be read, modified or deleted.

#### Scenario: A reindex keeps file ids, history and evidence

- **WHEN** a project holds a saved graph with file `F`, a file–commit link on `F` and a claim with
  evidence citing `F`, and a new snapshot that still contains `F` is saved
- **THEN** `F` has the same id as before
- **AND** the file–commit link and the evidence citing `F` still exist

#### Scenario: A changed content hash on reindex marks its claims stale

- **WHEN** a project holds file `F` with `content_hash` `h1` and a `current` claim with evidence
  citing `F`, and a new snapshot with `F` at `content_hash` `h2` is saved
- **THEN** `F` keeps its id and has `content_hash` `h2`
- **AND** the claim is `stale`

#### Scenario: A file missing from the snapshot is deleted

- **WHEN** a project holds files `A` and `B`, with symbols and edges on `B`, and a snapshot
  containing only `A` is saved
- **THEN** `B` no longer exists, nor do its symbols, its edges or its file–commit links
- **AND** `A` still exists with its id
- **AND** the result reports 1 file deleted

#### Scenario: A deleted file marks its claims stale

- **WHEN** a project holds files `A` and `B`, a `current` claim `c1` with evidence citing `B`, and
  a `current` claim `c2` with evidence citing only `A`, and a snapshot containing only `A` (same
  `content_hash`) is saved
- **THEN** `B` and the evidence citing it no longer exist
- **AND** `c1` still exists and is `stale`
- **AND** `c2` is `current`

#### Scenario: Symbols and edges are replaced by the snapshot

- **WHEN** a project holds a saved graph and a snapshot with the same files but a different set of
  symbols and edges is saved
- **THEN** the project's symbols and edges are exactly those of the second snapshot

#### Scenario: Commits are upserted and never dropped

- **WHEN** a project holds commits `c1` and `c2`, and a snapshot with commits `c2` and `c3` is saved
- **THEN** the project has exactly one commit each for `c1`, `c2` and `c3`
- **AND** `c2` keeps its id

#### Scenario: An omitted history value keeps the stored one

- **WHEN** a project holds commit `c1` with message `m1` and `pr_number` 7, and a file–commit link
  (`F`, `c1`) with `lines_added` 3 and `lines_removed` 1, and a snapshot is saved in which `c1` has
  no message and `pr_number` 9, and the link has no `lines_added` and `lines_removed` 5
- **THEN** `c1` keeps its id, its message is `m1` and its `pr_number` is 9
- **AND** the link has `lines_added` 3 and `lines_removed` 5

#### Scenario: A file's optional values follow the snapshot

- **WHEN** a project holds file `F` with `loc` 10 and `redacted` true, and a snapshot is saved in
  which `F` has no `loc` and no `redacted`
- **THEN** `F` keeps its id, its `loc` is unset and its `redacted` is false

#### Scenario: Other projects are untouched

- **WHEN** two projects hold saved graphs with the same file paths, and a snapshot with none of
  those files is saved to the first project
- **THEN** the second project's files, symbols, edges, commits and file–commit links are exactly as
  before

### Requirement: Project indexing metadata

A successful `saveGraph` SHALL update the project's indexing metadata in the same transaction:
`indexed_commit` to the commit the snapshot declares (or unset when it declares none), `indexed_at`
to the time of the write, `node_count` to the number of files plus symbols, and `edge_count` to the
number of edges of the snapshot.

`saveGraph` MUST NOT change any other column of the project: `name`, `root_path`, `language`,
`framework` and `is_sample` keep the values set at creation. The graph carries no project
attributes besides the indexed commit.

#### Scenario: Metadata reflects the saved snapshot

- **WHEN** a snapshot declaring indexed commit `abc123`, with 2 files, 3 symbols and 4 edges, is
  saved to a project created with framework `laravel`
- **THEN** the project has `indexed_commit` `abc123`, `node_count` 5, `edge_count` 4 and an
  `indexed_at` no earlier than the start of the call
- **AND** its `name`, `root_path`, `language`, `framework` (`laravel`) and `is_sample` are
  unchanged

### Requirement: Cooperation with a caller-owned transaction

The store SHALL work either on its own connections or on a connection whose transaction the caller
owns.

- On its own connections, `saveGraph` SHALL commit its transaction before returning, so the result
  is visible to other connections.
- On a caller-owned transaction, `saveGraph` MUST NOT commit or roll back that transaction. On
  failure it SHALL undo only its own writes and leave the caller's transaction usable.

#### Scenario: Saving inside the caller's transaction does not commit it

- **WHEN** `saveGraph` runs on the integration harness's per-test transaction
- **THEN** the saved rows are readable in that transaction
- **AND** the harness does not report the transaction as committed or ended early

#### Scenario: A failed save leaves the caller's transaction usable

- **WHEN** `saveGraph` fails with a database rejection on the harness's per-test transaction
- **THEN** a following query on the same transaction succeeds and sees the rows written before the
  call

#### Scenario: Saving on the store's own connections commits

- **WHEN** `saveGraph` runs on the store's own connections and returns
- **THEN** another connection sees the saved rows
