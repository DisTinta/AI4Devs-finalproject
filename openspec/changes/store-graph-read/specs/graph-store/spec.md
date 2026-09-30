## ADDED Requirements

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

- a symbol search term that is empty or only whitespace;
- a `hops` that is not an integer from 1 to 3 (the maximum traversal depth);
- a list of symbol kinds or edge kinds that is given but empty.

#### Scenario: Invalid read arguments are rejected before querying

- **WHEN** symbols are searched with the term `"  "` and with an empty list of symbol kinds,
  neighbours are requested with `hops` 0, 4 and 1.5, and neighbours are requested with an empty
  list of edge kinds
- **THEN** each call fails with `InvalidStoreQuery` naming the term, the kinds or `hops`
- **AND** no statement was sent to the database for any of them
