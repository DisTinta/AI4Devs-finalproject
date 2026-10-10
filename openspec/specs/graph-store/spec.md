# graph-store Specification

## Purpose

The knowledge-graph store behind `StorePort`, used by the domain without knowing SQL. The write
side creates a project and persists the L1 graph of an indexed repository (files, symbols, edges,
commits and file–commit links) atomically, keeping file identity across reindexes. The read side
looks projects up, finds symbols by name and walks the graph N hops in one recursive statement,
always isolated by project.

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

### Requirement: Project lookup

The store SHALL let the domain read one project by id, returning its id, name, root path,
language, framework (or unset), sample flag, indexed commit (or unset), indexed-at time (or unset),
`node_count`, `edge_count` and creation time.

Reading a project whose id matches no project, or whose id is not a well-formed UUID in the
hyphenated 8-4-4-4-12 form, MUST fail with the domain error `ProjectNotFound`, never with an empty
result or a database error. This rule applies to every read that names a project (lookup, symbol
search and traversal): a malformed id MUST fail without sending any statement to the database.
A well-formed id SHALL be accepted in any letter case: upper-case hexadecimal digits name the same
project as lower-case ones.

#### Scenario: An unindexed project is read

- **WHEN** a project created with framework `laravel` and no saved snapshot is read by its id
- **THEN** the result has that project's name, root path, language, framework `laravel` and sample
  flag, `node_count` and `edge_count` 0, and indexed commit and indexed-at time unset

#### Scenario: A project is read with its indexing metadata

- **WHEN** a project created with framework `laravel` has a saved snapshot declaring indexed commit
  `abc123`, with 2 files, 3 symbols and 4 edges, and the project is read by its id, and again by
  its id in upper case
- **THEN** the result has that project's name, root path, language, framework `laravel` and sample
  flag, indexed commit `abc123`, a set indexed-at time, `node_count` 5 and `edge_count` 4
- **AND** the upper-case read returns the same project

#### Scenario: Reading an unknown project fails

- **WHEN** a project is read with a well-formed UUID that is no project's id, and with `not-a-uuid`
- **THEN** both calls fail with `ProjectNotFound`
- **AND** no statement was sent to the database for the `not-a-uuid` call

### Requirement: Project listing

The store SHALL list every project, with the same attributes as the project lookup, ordered by
name ascending. With no project stored, the list SHALL be empty (`[]`), not an error.

Every ordering of names and paths in the reads of this capability SHALL compare them byte by byte
(binary order), not by the database locale: upper-case letters sort before lower-case ones (`Zeta`
before `alpha`), and non-ASCII characters sort by their UTF-8 bytes.

#### Scenario: Listing with no project returns an empty list

- **WHEN** no project is stored and the projects are listed
- **THEN** the result is an empty list

#### Scenario: Projects are listed by name

- **WHEN** projects named `beta` and `alpha` exist, `beta` unindexed and `alpha` with a saved
  snapshot
- **THEN** the list holds both, `alpha` before `beta`, each with its own counts and indexed commit

### Requirement: Symbol search by name

The store SHALL find the symbols of one project whose name contains a search term, compared
case-insensitively, and MAY narrow them to a non-empty list of symbol kinds.

- The term SHALL match literally: `%`, `_` and `\` in the term match those characters only.
- Each result SHALL carry the symbol's id, its kind, start and end line, signature (or unset), and
  its natural identity: the path of its file, its name and its start line.
- Results SHALL be ordered by file path, then start line, then name (paths and names in byte
  order).
- A project with no matching symbol SHALL give an empty list.
- Searching an unknown project, or a project id that is not a well-formed UUID, MUST fail with
  `ProjectNotFound`; the malformed id MUST fail without querying the database.

#### Scenario: Symbols are found by a case-insensitive fragment of the name

- **WHEN** a project holds symbols `PriceCalculator`, `computePrice` and `OrderService`, and the
  term `price` is searched
- **THEN** the result is `PriceCalculator` and `computePrice`, in file-path then start-line order,
  each with its file path, name, start line, kind, end line and signature

#### Scenario: The search can be narrowed by kind

- **WHEN** a project holds a class `PriceCalculator` and a method `priceFor`, and the term `price`
  is searched narrowed to kind `class`
- **THEN** the result is only `PriceCalculator`

#### Scenario: Wildcard characters in the term match literally

- **WHEN** a project holds symbols `get_total` and `getXtotal`, and the term `t_t` is searched
- **THEN** the result is only `get_total`

#### Scenario: A search with no match returns an empty list

- **WHEN** an existing project holds no symbol whose name contains the term `Missing`
- **THEN** the search returns an empty list

#### Scenario: Searching an unknown project fails

- **WHEN** symbols are searched in a well-formed UUID that is no project's id, and in `not-a-uuid`
- **THEN** both calls fail with `ProjectNotFound`
- **AND** no statement was sent to the database for the `not-a-uuid` call

### Requirement: Bounded neighbour traversal

The store SHALL return the nodes of one project reachable from a set of seed nodes by following
edges from source to target in at least 1 and at most `hops` steps.

- A seed SHALL be a symbol or a file, named by its type and its id. A node of the graph is a symbol or a file,
  and the traversal SHALL cross both: any edge whose source is the current node is followed,
  whatever the type of its endpoints.
- When a non-empty list of edge kinds is given, only edges of those kinds SHALL be followed;
  otherwise edges of every kind are followed.
- Each reachable node SHALL appear exactly once, with its minimum distance in steps. Seeds SHALL
  NOT appear in the result, even when reachable from another seed.
- Cycles in the graph MUST NOT make the traversal loop, repeat a node or exceed `hops`.
- Each result SHALL carry its type (`symbol` or `file`), its id and its distance. A symbol result
  SHALL also carry its kind, span, signature (or unset) and natural identity (file path, name,
  start line), as a symbol search does; a file result SHALL carry its path and kind.
- Results SHALL be ordered by distance, then files before symbols, then path, then start line,
  then name (paths and names in byte order).
- The traversal SHALL be answered by a single database statement, whatever `hops` and the number
  of seeds.
- A seed that names no node of the project SHALL contribute nothing: an unknown id, an id of
  another project, an id that is not a well-formed UUID, or a type that does not match the node its
  id names (for example type `file` with a symbol's id). An empty seed list SHALL give an empty
  result.
- Traversing an unknown project, or a project id that is not a well-formed UUID, MUST fail with
  `ProjectNotFound`; the malformed id MUST fail without querying the database.

#### Scenario: A cycle yields each node once with its minimum distance

- **WHEN** symbols `A`, `B` and `C` have edges `A calls B`, `B calls A` and `B calls C`, and the
  neighbours of `A` are requested at 3 hops
- **THEN** the result is `B` at distance 1 and `C` at distance 2, each exactly once, and `A` is
  not in it

#### Scenario: The traversal stops at the hop limit

- **WHEN** symbols form the chain `A calls B`, `B calls C`, `C calls D`, and the neighbours of `A`
  are requested at 2 hops
- **THEN** the result is `B` at distance 1 and `C` at distance 2, and `D` is not in it

#### Scenario: The minimum distance wins when a node is reachable by several paths

- **WHEN** symbols have edges `A calls B`, `B calls C` and `A calls C`, and the neighbours of `A`
  are requested at 3 hops
- **THEN** `C` appears once, at distance 1

#### Scenario: Edges are followed from source to target only

- **WHEN** symbols have edges `A calls B` and `C calls A`, and the neighbours of `A` are requested
  at 2 hops
- **THEN** the result is only `B`

#### Scenario: The traversal crosses files and symbols

- **WHEN** symbol `S` is declared in file `a.ts`, and the graph has edges `S → file b.ts`
  (`imports`), `file b.ts → file c.ts` (`co_changed`) and `file c.ts → symbol T` (`describes`),
  and the neighbours of `S` are requested at 3 hops
- **THEN** the result is file `b.ts` at distance 1, file `c.ts` at distance 2 and symbol `T` at
  distance 3, each with its type, and `T` with its file path, name and start line

#### Scenario: A file can be a seed

- **WHEN** the graph has an edge `file a.ts → symbol S` and the neighbours of file `a.ts` are
  requested at 1 hop
- **THEN** the result is symbol `S` at distance 1

#### Scenario: Only the requested edge kinds are followed

- **WHEN** symbols have edges `A calls B` and `A tested_by T`, and the neighbours of `A` are
  requested at 1 hop with kinds `tested_by`
- **THEN** the result is only `T`

#### Scenario: Seeds are never returned

- **WHEN** symbols have edges `A calls B` and `B calls C`, and the neighbours of seeds `A` and `B`
  are requested at 2 hops
- **THEN** the result is only `C`, at distance 1

#### Scenario: Unknown and empty seeds give no neighbours

- **WHEN** the neighbours of an existing project are requested with an empty seed list, with a
  single seed that is a well-formed UUID naming no node, with a single seed `not-a-uuid`, and with
  a single seed of type `file` carrying the id of a symbol that has outgoing edges
- **THEN** each call returns an empty result

#### Scenario: The traversal is one statement

- **WHEN** the neighbours of two seeds are requested at 3 hops on a graph with a cycle
- **THEN** the store sends exactly one statement to the database for that call

#### Scenario: Traversing an unknown project fails

- **WHEN** neighbours are requested in a well-formed UUID that is no project's id, and in
  `not-a-uuid`
- **THEN** both calls fail with `ProjectNotFound`
- **AND** no statement was sent to the database for the `not-a-uuid` call

### Requirement: Project isolation of reads

Every read that names a project MUST return only rows of that project: symbols, files and the
nodes a traversal reaches, and a traversal MUST follow only edges of that project. A seed that
belongs to another project SHALL contribute nothing.

#### Scenario: A symbol search never returns another project's symbols

- **WHEN** two projects each hold a symbol named `PriceCalculator`, and `PriceCalculator` is
  searched in the first project
- **THEN** every result belongs to the first project, and there is exactly one

#### Scenario: A traversal never reaches another project

- **WHEN** two projects hold graphs with the same file paths and symbol names and the edge
  `A calls B`, and the neighbours of the first project's `A` are requested at 3 hops in the first
  project, and the second project's `A` is used as a seed in the first project
- **THEN** the first call returns only the first project's `B`, and the second call returns an
  empty result

#### Scenario: A cross-project edge never returns another project's node

- **WHEN** an edge of the first project points from its symbol `A` to a symbol and to a file of the
  second project (edges the graph writer never produces, inserted directly in the database), and
  the neighbours of `A` are requested at 1 hop in the first project
- **THEN** the result is empty, and the call does not fail

### Requirement: Validity of ids returned by reads

A symbol id returned by a read SHALL be valid only until the next `saveGraph` of its project,
because symbols are replaced by each snapshot. A file id SHALL stay valid while a snapshot keeps
the file's path. Callers that need to name a symbol across reindexes SHALL use its natural
identity (file path, name, start line), which every symbol result carries.

#### Scenario: A symbol id from before a reindex names nothing after it

- **WHEN** symbol `A` (with an edge `A calls B`) is found by search, the same snapshot is saved
  again, and `A` is searched again
- **THEN** the second result has the same file path, name and start line as the first
- **AND** the neighbours requested with the first result's id as seed are an empty result, while
  those requested with the second result's id are `B`

#### Scenario: A file id stays valid across a reindex that keeps its path

- **WHEN** file `a.ts` (with an edge `file a.ts → file b.ts`) is reached by a traversal, the same
  snapshot is saved again, and the neighbours are requested with the file id from before the
  reindex as seed
- **THEN** the result is file `b.ts` at distance 1

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
