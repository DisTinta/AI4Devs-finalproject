## ADDED Requirements

### Requirement: Contract of the history reads

The store SHALL offer three reads of the stored history of one project, each taking the project id
and a list of repository paths, `paths`: the co-change read, the document link read and the file
commit read (the next requirements). Each of them:

- SHALL write nothing and SHALL be answered by exactly one database statement, whatever the number
  of paths and the size of the graph;
- SHALL be isolated by project like every read ("Project isolation of reads"): no file, edge or
  commit of another project contributes to the result, even when a row links it to a row of the
  project (a `file_commit` row between a file of the project and a commit of another, which the
  database does not forbid, contributes nothing);
- SHALL fail with `ProjectNotFound` for an unknown or malformed project id, a malformed one before
  any other check and without querying;
- SHALL then check `paths` as "Validation of read arguments" says;
- SHALL return an empty list for an empty `paths`, the project still being checked; a path that
  names no file of the project SHALL contribute nothing, and a path given twice SHALL count once;
- SHALL return no author data (`author_hash`) and no commit message.

The in-memory double SHALL implement the same three reads with the same contract over its stored
graph.

#### Scenario: The history reads of an unknown project fail

- **GIVEN** a well-formed id that names no project, and the malformed id `not-a-uuid`
- **WHEN** each of the three history reads is called with each id, once with the paths `['a.php']`
  and once with no path
- **THEN** each call fails with `ProjectNotFound`, those with the malformed id without any statement

#### Scenario: Each history read is one statement

- **GIVEN** a saved project with three files, a `co_changed` edge, a `describes` edge and two commits,
  and a client that counts the statements it sends
- **WHEN** each of the three history reads is called with the paths of the three files
- **THEN** each call sent exactly one statement

#### Scenario: Empty and unknown paths give empty history reads

- **GIVEN** the saved project of the scenario "Co-changes are read from either end with their pull
  requests"
- **WHEN** each of the three history reads is called with no path, then with `['nope.php']`
- **THEN** each result is an empty list

#### Scenario: The history reads never hold another project's rows

- **GIVEN** two saved projects with files at the same paths, the same `co_changed` edge between
  `a.php` and `b.php`, the same `describes` edge from `README.md` to `a.php`, and in the second
  project a commit with pull request 77 that touches its `a.php` and `b.php`; and a `file_commit` row,
  inserted directly in the database, that links the first project's `a.php` and `b.php` to that
  commit of the second project
- **WHEN** the three history reads of the first project are called with the paths `a.php` and `b.php`
- **THEN** the co-change has no pull request 77, the file commit read returns no commit of the second
  project, and every path returned is a path of the first project's files

#### Scenario: The in-memory double reads the same history

- **GIVEN** the in-memory double loaded with the graphs of the scenarios "Co-changes are read from
  either end with their pull requests", "Document links are read through files and symbols" and
  "Dated commits of each path are read in order", and a project id it does not hold
- **WHEN** each read of those scenarios is made on the double, and each of the three reads with the
  id it does not hold
- **THEN** each result equals the one of its scenario, and each call with the unknown id fails with
  `ProjectNotFound`

### Requirement: Co-change read

The co-change read SHALL return, for one project, every stored edge of kind `co_changed` from a file
to a file with a set `weight`, one of whose ends is the file at one of `paths`, as
`{ fromPath, toPath, weight, prNumbers }`: `fromPath` and `toPath` the paths of the edge's source and
target files, `weight` the stored weight as a number, and `prNumbers` the distinct pull request
numbers, ascending, of the commits of the project that a `file_commit` row links to both files
(commits without a pull request number add none). Edges of other kinds SHALL NOT appear. The result
SHALL be ordered by `fromPath`, then `toPath`, in byte order.

#### Scenario: Co-changes are read from either end with their pull requests

- **GIVEN** a saved project whose graph has the files `a.php`, `b.php` and `c.php`, a `co_changed`
  edge from `a.php` to `b.php` with `weight` 0.5 and one from `c.php` to `a.php` with `weight` 1, the
  commits with pull requests 4 and 2 and a commit without a pull request touching `a.php` and `b.php`,
  and two commits with pull request 9 touching `a.php` and `c.php`
- **WHEN** the co-changes of `['a.php']` are read, then those of `['b.php']`
- **THEN** the first result is exactly `{ fromPath: 'a.php', toPath: 'b.php', weight: 0.5, prNumbers:
  [2, 4] }` then `{ fromPath: 'c.php', toPath: 'a.php', weight: 1, prNumbers: [9] }`
- **AND** the second is exactly the first of those two entries

#### Scenario: Edges of other kinds are not co-changes

- **GIVEN** a saved project whose graph has, between the files `a.php` and `b.php` or their symbols,
  edges of kinds `imports`, `calls`, `tested_by` and `describes`, and no `co_changed` edge
- **WHEN** the co-changes of `['a.php', 'b.php']` are read
- **THEN** the result is an empty list

### Requirement: Document link read

The document link read SHALL return, for one project, every distinct `{ docPath, describedPath }`
such that the project has an edge of kind `describes` whose source is the file of kind `doc` at
`docPath` and whose target is the file at `describedPath` or a symbol of that file, with
`describedPath` one of `paths`. Edges of other kinds, and `describes` edges whose source is not a file
of kind `doc`, SHALL NOT appear. The result SHALL be ordered by `docPath`, then `describedPath`, in
byte order.

#### Scenario: Document links are read through files and symbols

- **GIVEN** a saved project whose graph has the document `README.md` with `describes` edges towards
  the symbol `S` of `a.php`, towards the file `a.php` and towards the symbol `T` of `b.php`, the
  document `docs/x.md` with a `describes` edge towards the file `c.php`, and a `co_changed` edge from
  `README.md` to `c.php`
- **WHEN** the document links of `['a.php', 'b.php', 'c.php']` are read, then those of
  `['a.php', 'b.php']`
- **THEN** the first result is exactly `{ README.md, a.php }`, `{ README.md, b.php }` and
  `{ docs/x.md, c.php }`, in that order
- **AND** the second is exactly `{ README.md, a.php }` and `{ README.md, b.php }`

### Requirement: File commit read

The file commit read SHALL return, for one project, one `{ path, sha, committedAt }` per
`file_commit` row of the project between the file at one of `paths` and a commit of the project
whose commit date is set: `path` the file's path, `sha` the commit's full sha and `committedAt` its
commit date as an instant. Commits without a commit date SHALL NOT appear. The result SHALL be
ordered by `path` in byte order, then `committedAt` ascending, then `sha` in byte order.

#### Scenario: Dated commits of each path are read in order

- **GIVEN** a saved project whose graph has the files `a.php` and `b.php`, the commit `k1` dated
  2024-01-02 touching both, the commit `k2` dated 2024-01-01 touching `a.php`, and the commit `k3`
  without a date touching `a.php`
- **WHEN** the file commits of `['a.php', 'b.php']` are read
- **THEN** the result is exactly `{ a.php, k2, 2024-01-01 }`, `{ a.php, k1, 2024-01-02 }` and
  `{ b.php, k1, 2024-01-02 }`, in that order, each `committedAt` an instant

## MODIFIED Requirements

### Requirement: Validation of read arguments

The store MUST reject invalid read arguments with the domain error `InvalidStoreQuery`, which
names the argument at fault, before querying the database:

- a symbol search term that is empty or only whitespace, or that contains a NUL character (no
  stored name can contain one, and the database rejects it as text);
- a `hops` that is not an integer from 1 to 3 (the maximum traversal depth);
- a list of symbol kinds or edge kinds that is given but empty;
- a traversal direction that is given but is not `out`, `in` or `both` (a caller without types can
  pass any value);
- an instant for the daily cost sum (`since`) that is not a valid date;
- a `paths` of a history read that is not an array, or that holds a value that is not a string, an
  empty string or a string containing a NUL character.

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

#### Scenario: Invalid history read paths are rejected before querying

- **GIVEN** a saved project
- **WHEN** each of the three history reads of that project is called with the paths `'a.php'` (not an
  array), `[42]`, `['']` and `['a\u0000.php']`
- **THEN** each call fails with `InvalidStoreQuery` naming `paths`
- **AND** no statement was sent to the database for any of them
