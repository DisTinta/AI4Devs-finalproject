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
- Each result SHALL carry the symbol's id, its kind, start and end line, signature (or unset), the
  id and the kind of its file, and its natural identity: the path of its file, its name and its
  start line. The file kind SHALL be the kind stored for that file, not recomputed.
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

#### Scenario: A symbol result carries the kind of its file

- **WHEN** a project holds symbol `PriceCalculatorTest` in a file of kind `test` and symbol
  `PriceCalculator` in a file of kind `source`, and the term `PriceCalculator` is searched
- **THEN** `PriceCalculatorTest` carries file kind `test` and `PriceCalculator` carries file kind
  `source`

### Requirement: Bounded neighbour traversal

The store SHALL return the nodes of one project reachable from a set of seed nodes in at least 1
and at most `hops` steps, following edges in a direction: `out` (from source to target), `in` (from
target to source) or `both` (each step may follow an edge either way). When no direction is given
the direction SHALL be `out`.

- A seed SHALL be a symbol or a file, named by its type and its id. A node of the graph is a symbol
  or a file, and the traversal SHALL cross both: any edge whose source (for `out`) or target (for
  `in`) is the current node is followed, whatever the type of its other endpoint; `both` follows
  the edges of `out` and of `in`.
- When a non-empty list of edge kinds is given, only edges of those kinds SHALL be followed;
  otherwise edges of every kind are followed.
- Each reachable node SHALL appear exactly once, with its minimum distance in steps. Seeds SHALL
  NOT appear in the result, even when reachable from another seed.
- Cycles in the graph MUST NOT make the traversal loop, repeat a node or exceed `hops`, in any
  direction.
- Each result SHALL carry its type (`symbol` or `file`), its id, its distance and its resolution. A
  symbol result SHALL also carry its kind, span, signature (or unset), the id and kind of its file
  and its natural identity (file path, name, start line), as a symbol search does; a file result
  SHALL carry its path and kind.
- The resolution of a result SHALL be `exact` when at least one of its paths of minimum distance
  follows only `exact` edges, and `heuristic` otherwise.
- The work of a traversal SHALL grow with the nodes of the project, not with the paths between
  them: the rows the traversal produces SHALL be at most 2·(`hops`+1) times the number of nodes it
  can reach, seeds included.
- Results SHALL be ordered by distance, then files before symbols, then path, then start line,
  then name (paths and names in byte order).
- The traversal SHALL be answered by a single database statement, whatever `hops`, the direction
  and the number of seeds.
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
  at 2 hops with no direction given, and again with direction `out`
- **THEN** both results are only `B`

#### Scenario: Incoming edges are followed with direction in

- **WHEN** file `README.md` has an edge `describes` to symbol `S`, and the neighbours of `S` are
  requested at 1 hop with kinds `describes`, once with direction `in` and once with direction
  `out`
- **THEN** the `in` result is file `README.md` at distance 1, and the `out` result is empty

#### Scenario: Edges are followed both ways with direction both

- **WHEN** file `a.php` has an edge `co_changed` to file `b.php`, and the neighbours of file `b.php`
  are requested at 1 hop with kinds `co_changed`, once with direction `both` and once with
  direction `out`
- **THEN** the `both` result is file `a.php` at distance 1, and the `out` result is empty

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

- **WHEN** the neighbours of two seeds are requested at 3 hops on a graph with a cycle, once with
  each direction (`out`, `in`, `both`)
- **THEN** the store sends exactly one statement to the database for each call

#### Scenario: Traversing an unknown project fails

- **WHEN** neighbours are requested in a well-formed UUID that is no project's id, and in
  `not-a-uuid`
- **THEN** both calls fail with `ProjectNotFound`
- **AND** no statement was sent to the database for the `not-a-uuid` call

#### Scenario: A node reached by an exact shortest path is exact

- **WHEN** symbols have edges `A calls B` (exact), `B calls D` (exact), `A calls C` (heuristic) and
  `C calls D` (exact), and the neighbours of `A` are requested at 2 hops
- **THEN** `D` appears once, at distance 2, with resolution `exact`, and `C` with resolution
  `heuristic`

#### Scenario: A node reached only through heuristic edges is heuristic

- **WHEN** symbols have edges `A calls B` (heuristic) and `B calls C` (exact), and the neighbours of
  `A` are requested at 2 hops
- **THEN** `B` and `C` both have resolution `heuristic`

#### Scenario: A shorter heuristic path wins over a longer exact one

- **WHEN** symbols have edges `A calls C` (heuristic), `A calls B` (exact) and `B calls C` (exact),
  and the neighbours of `A` are requested at 2 hops
- **THEN** `C` appears at distance 1 with resolution `heuristic`

#### Scenario: The traversal work grows with nodes, not paths

- **WHEN** a project holds 40 files joined pairwise by `co_changed` edges, and the neighbours of one
  of them are requested at 3 hops with kinds `co_changed` and direction `both`
- **THEN** each of the other 39 files appears exactly once, at distance 1
- **AND** the database's execution plan shows the traversal produced at most 2·4·40 rows

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
the file's path; the file id a symbol result carries follows the same rule, and names the same file
a traversal or a file result names. Callers that need to name a symbol across reindexes SHALL use
its natural identity (file path, name, start line), which every symbol result carries.

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

#### Scenario: A symbol result carries the id of its file

- **WHEN** symbol `S` is declared in file `a.ts`, file `a.ts` has an edge `co_changed` to file
  `b.ts`, `S` is found by search and also reached by a traversal, and the file id of the search
  result is used as a file seed at 1 hop
- **THEN** the search result and the traversal result carry the same file id
- **AND** the traversal from that file id returns file `b.ts` at distance 1

### Requirement: Validation of read arguments

The store MUST reject invalid read arguments with the domain error `InvalidStoreQuery`, which
names the argument at fault, before querying the database:

- a symbol search term that is empty or only whitespace, or that contains a NUL character (no
  stored name can contain one, and the database rejects it as text);
- a `hops` that is not an integer from 1 to 3 (the maximum traversal depth);
- a list of symbol kinds or edge kinds that is given but empty;
- a traversal direction that is given but is not `out`, `in` or `both` (a caller without types can
  pass any value);
- an instant for the daily cost sum (`since`) that is not a valid date.

#### Scenario: Invalid read arguments are rejected before querying

- **WHEN** symbols are searched with the term `"  "`, with a term containing a NUL character and
  with an empty list of symbol kinds,
  neighbours are requested with `hops` 0, 4 and 1.5, and neighbours are requested with an empty
  list of edge kinds
- **THEN** each call fails with `InvalidStoreQuery` naming the term, the kinds or `hops`
- **AND** no statement was sent to the database for any of them

#### Scenario: An invalid traversal direction is rejected before querying

- **WHEN** neighbours are requested with direction `sideways`
- **THEN** the call fails with `InvalidStoreQuery` naming `direction`
- **AND** no statement was sent to the database

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
  unchanged and is not a `ClaimWriteFailed`; so does a failure to open the savepoint on a caller-owned
  transaction (a client outside a transaction block, or a transaction the caller already aborted),
  which is the caller's programming error. A failed rollback is a `ClaimWriteFailed` even when the
  write first failed with a domain error.
- An empty list SHALL resolve to an empty list without writing any row; the project is still
  checked, so a well-formed id that names no project fails with `ProjectNotFound`.
- The write SHALL cooperate with a caller-owned transaction as `saveGraph` does: on its own
  connections it commits before returning; on a caller-owned transaction it neither commits nor rolls
  it back, and on failure undoes only its own writes and leaves that transaction usable.
- The caller MAY give the commit its evidence was read at. When it is given and it is not the
  project's indexed commit at the moment of the write (read under the same lock that checks the
  files), every claim of the call SHALL be written with status `stale`, whatever status its record
  holds, and the result SHALL say so for each claim: a claim inferred from code the project no longer
  indexes is never stored `current`. A cited file the re-index deleted still fails the ownership
  check.
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

#### Scenario: Claims read at an older commit are written stale

- **GIVEN** a project indexed at commit `C2` with file `a.php`
- **WHEN** a `current` claim is saved with evidence on `a.php` read at `C1`, and another read at `C2`
- **THEN** the first is stored `stale` and its result says `stale`, and the second is stored
  `current` and its result says `current`

#### Scenario: Claims read at an older commit are written stale (in-memory double)

- **GIVEN** the in-memory store with a project indexed at `C2`
- **WHEN** a `current` claim is saved read at `C1`, and another read at `C2`
- **THEN** the first is stored `stale` and the second `current`, and each result says so

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
- Each claim SHALL appear once, with its id, its project id (lower case), subject, predicate,
  object, layer, type, status, confidence, provenance, the instant it was written and all its
  evidence (id, file id, file path, first and last line, verification, excerpt). Claims SHALL be ordered newest first: by the instant each was written, descending, then
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
instant) for a test to read and to seed, an invalid stored response included; SHALL store and return
a JSON round trip of each response (`JSON.parse(JSON.stringify(response))`), as the column does;
SHALL count the calls;
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

### Requirement: Running work in one transaction on a pooled store

A store opened by "Opening a pooled store from a URL" SHALL also offer to run a piece of work inside one
transaction of its pool: it SHALL take one connection from the pool, begin a transaction, give the work
a store bound to that transaction (requirement "Cooperation with a caller-owned transaction"), and
commit when the work resolves or roll back when it rejects, resolving or rejecting with what the work
did. The connection SHALL be released to the pool in every case. When the rollback itself fails, the
work's error SHALL still be the one propagated. A failure to commit SHALL reject, without the driver's
text, host, port or credentials in its message. No write of the work SHALL be visible to other
connections before the commit, and none SHALL remain after a rollback.

#### Scenario: Work that resolves is committed

- **GIVEN** a reachable, migrated database and a store opened on its URL
- **WHEN** work that creates a project with a unique name and resolves to its id runs in one
  transaction, and the projects are then listed with another connection
- **THEN** the run resolves to that id, the listing holds a project with that id and name, and it is
  deleted afterwards to restore the database

#### Scenario: Work that rejects leaves nothing

- **GIVEN** a reachable, migrated database and a store opened on its URL
- **WHEN** work that creates a project with a unique name and then throws an error `E` runs in one
  transaction
- **THEN** the run rejects with `E`, and no project with that name exists afterwards

#### Scenario: Work's writes are invisible to another connection before the commit

- **GIVEN** a reachable, migrated database and a store opened on its URL
- **WHEN** work that creates a project with a unique name runs in one transaction and, before
  resolving, lists the projects through another connection
- **THEN** that listing holds no project with that name, a listing after the run holds it, and it is
  deleted afterwards to restore the database

#### Scenario: Every connection is released after a run

- **GIVEN** a reachable, migrated database and a store opened on its URL with a unique application name
- **WHEN** one run that resolves and one that rejects have finished and the store is closed
- **THEN** `close()` resolves within 2 s and no session with that application name remains (polled for up to 2 s)
