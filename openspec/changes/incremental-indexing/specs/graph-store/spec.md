## ADDED Requirements

### Requirement: Index state read

`readIndexState(projectId)` SHALL return what an incremental reindex compares against, read from the
project's stored graph only:

- `files`: every stored file of the project as `{ path, contentHash }`, `contentHash` absent when the
  stored hash is unset, ordered by path in byte order;
- `dependencies`: every distinct `{ fromPath, toPath, kind }` such that the project has at least one
  stored edge of kind `imports`, `calls`, `extends` or `implements` whose source is the file at
  `fromPath` or one of its symbols and whose target is the file at `toPath` or one of its symbols,
  with `fromPath` ≠ `toPath`; ordered by `fromPath`, `toPath`, `kind`, in byte order. Edges of other
  kinds, and edges whose two ends are in the same file, SHALL NOT appear.

It SHALL write nothing, SHALL be answered by at most two database statements whatever the size of the
graph, and SHALL be isolated by project like every read ("Project isolation of reads"): no row of
another project appears, even through an edge whose end belongs to another project. A project that
exists and has no stored graph SHALL return `{ files: [], dependencies: [] }`. An unknown or
malformed project id SHALL fail with `ProjectNotFound`, a malformed one before querying. The
in-memory double SHALL implement the same contract over its stored graph.

#### Scenario: The index state lists the stored files and their file dependencies

- **GIVEN** a saved project whose graph has the files `app/A.php` (hash `h1`), `app/B.php` (hash `h2`)
  and `app/C.php` (no hash), a symbol `B::run` in `app/B.php` with a `calls` edge to a symbol of
  `app/A.php`, a second `calls` edge between the same two files, and an `imports` edge from the file
  `app/C.php` to the file `app/B.php`
- **WHEN** its index state is read
- **THEN** `files` is `app/A.php` with `h1`, `app/B.php` with `h2` and `app/C.php` without
  `contentHash`, in that order, and `dependencies` is exactly
  `{ app/B.php → app/A.php, calls }` and `{ app/C.php → app/B.php, imports }`, in that order

#### Scenario: Edges that are not dependencies are left out of the index state

- **GIVEN** a saved project whose graph has, between two of its files or their symbols, edges of kinds
  `co_changed`, `tested_by` and `describes`, and a `calls` edge between two symbols of the same file
- **WHEN** its index state is read
- **THEN** `dependencies` is empty

#### Scenario: A project without a graph has an empty index state

- **GIVEN** a project created and never saved
- **WHEN** its index state is read
- **THEN** it is `{ files: [], dependencies: [] }`

#### Scenario: The index state never holds another project's rows

- **GIVEN** two saved projects with files at the same paths and different hashes, and an edge stored
  under the first project whose target is a symbol of the second
- **WHEN** the first project's index state is read
- **THEN** every file and hash is the first project's, and no dependency leads to a file of the second

#### Scenario: Reading the index state of an unknown project fails

- **GIVEN** a well-formed id that names no project, and the malformed id `not-a-uuid`
- **WHEN** the index state of each is read
- **THEN** each fails with `ProjectNotFound`, the malformed one without any statement

#### Scenario: The index state is read in at most two statements

- **GIVEN** a saved project with three files and two dependencies, and a client that counts the
  statements it sends
- **WHEN** its index state is read
- **THEN** at most two statements were sent

#### Scenario: The in-memory double reads the same index state

- **GIVEN** the in-memory double loaded with the graph of "The index state lists the stored files and
  their file dependencies", and a project id it does not hold
- **WHEN** the index state of each is read
- **THEN** the first equals the one of that scenario and the second fails with `ProjectNotFound`
