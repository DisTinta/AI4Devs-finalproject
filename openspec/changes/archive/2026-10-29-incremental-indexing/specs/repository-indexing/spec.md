## MODIFIED Requirements

### Requirement: Reindexing an existing project

Reindexing with input `{ projectId, allowedRoot, workspaceRoot, incremental }` SHALL rebuild the
graph of a project that already exists, from its stored `rootPath`, `language` and `framework`, and
SHALL never create a project. `incremental` is a boolean the caller always gives. This requirement
describes the **full** mode (`incremental` `false`); with `incremental` `true` the reindex follows
"Incremental reindex", which reuses the `enabled`, `project` and `confine` steps below and every rule
of this requirement it does not replace. Unless a scenario says otherwise, the scenarios of this
requirement reindex with `incremental` `false`.

A full reindex SHALL run these steps, in this order, and a failing step's error SHALL propagate
unchanged (except as stated) with no later step started:

| Step | Work |
| -- | -- |
| enabled | when `workspaceRoot` is not an absolute path, throw `RangeError` before any call; when `allowedRoot` is missing, empty or only whitespace, reject with `IndexingDisabled` before any call to the store |
| project | read the project; an unknown or malformed id rejects with `ProjectNotFound` |
| confine | resolve a relative stored `rootPath` against `workspaceRoot` (an absolute one is used as is) and confine the resolved path to `allowedRoot` exactly as the `confine` phase of "Indexing order and no partial write" does (lexically, then on real paths; an allowed root that does not exist rejects with `IndexingDisabled`); a `ForbiddenPathError` names the stored `rootPath` as stored (relative or absolute), never the resolved path nor the real path |
| build | read, apply the input hygiene, redact, analyse with the analyzer of the stored `language`, read and redact the history and add the `co_changed` edges, with the same rules as the `read`, `redact`, `analyze` and `history` phases of "Indexing order and no partial write"; the framework is not detected, not even when the stored project has none |
| save | validate the graph (rejecting with `InvalidGraph` as indexing does); then, in **one** unit of work, save the graph over the existing project id and delete every answer cache entry of the project |

A full reindex SHALL NOT read the project's index state (graph-store, "Index state read"). Nothing
SHALL be written to the store before the `save` step. Within it, the graph save SHALL come before the
cache invalidation, and when either fails, neither SHALL remain: the project keeps its previous
graph, indexing metadata and answer cache entries. The project's `name`, `rootPath`, `language`,
`framework` and `isSample` SHALL NOT change.

A successful reindex SHALL resolve to a report holding: `projectId`; `language`; `mode`;
`indexedCommit`; `files`, `filesDeleted`, `symbols`, `commits` and `fileCommits` as counted by the
snapshot write; `edges` as in "Index report"; `events`; `commitEvents`; `diagnostics`; `skipped`,
ordered as in "Index report"; `filesQueued`; `filesSkipped`; and `cacheEntriesInvalidated`, the
number of cache entries deleted. In full mode `mode` SHALL be `full`, `filesQueued` SHALL equal
`files` and `filesSkipped` SHALL be `0`. The report SHALL be plain JSON-serialisable data.

#### Scenario: A reindex saves over the stored project and then invalidates its cache

- **GIVEN** a stored PHP project with framework `laravel`, the absolute root `/repos/acme-shop` inside
  the allowed root `/repos`, two answer cache entries, and doubles of the source tree, the history
  reader and the analyzers that record their calls
- **WHEN** the project is reindexed with `incremental` `false`
- **THEN** the PHP analyzer (not the TypeScript one) received the redacted files; inside one unit of
  work the store received `saveGraph` with the project's id and then `invalidateCache` with the same
  id; `createProject` and the index state read were never called; and the report has that
  `projectId`, `language` `php`, `mode` `full`, `filesQueued` equal to its `files`, `filesSkipped` 0,
  `cacheEntriesInvalidated` 2 and survives a JSON round trip unchanged

#### Scenario: A relative stored root resolves against the workspace root

- **GIVEN** a stored project whose `rootPath` is `fixtures/acme-shop`, the workspace root `/work` and
  the allowed root `/work/fixtures`
- **WHEN** the project is reindexed
- **THEN** the source tree read `/work/fixtures/acme-shop`

#### Scenario: Reindexing is disabled without an allowed root, before reading the project

- **GIVEN** an `allowedRoot` that is, in turn, absent, empty and `'   '`
- **WHEN** a project is reindexed
- **THEN** each rejects with `IndexingDisabled` and the store, the source tree, the history reader and
  the analyzer received no call

#### Scenario: An unknown project is not reindexed

- **GIVEN** no project with the requested id
- **WHEN** it is reindexed with `incremental` `false`, then with `incremental` `true`
- **THEN** each rejects with `ProjectNotFound` and the source tree received no call

#### Scenario: A stored root outside the allowed root is rejected before reading

- **GIVEN** a stored project whose root is `/elsewhere/acme-shop` and the allowed root `/repos`; then
  one whose root `/repos/link` is a symbolic link whose real path is `/secret/acme-shop`; then one
  whose stored root is the relative `fixtures/acme-shop`, with the workspace root `/work` and the
  allowed root `/repos`
- **WHEN** each is reindexed
- **THEN** each rejects with `ForbiddenPathError` naming the stored root as stored (the third names
  `fixtures/acme-shop`, not `/work/fixtures/acme-shop`), the second's message does not contain
  `/secret`, and no file was read and nothing was written

#### Scenario: An allowed root that does not exist disables reindexing

- **GIVEN** a stored project and an allowed root `/missing` that does not exist
- **WHEN** the project is reindexed
- **THEN** it rejects with `IndexingDisabled`, no file was read and no unit of work was opened

#### Scenario: A reindex keeps the stored project fields and detects no framework

- **GIVEN** a stored PHP project with no framework whose repository holds a `composer.json` declaring
  `laravel/framework`
- **WHEN** the project is reindexed
- **THEN** `getProject` afterwards returns the same `name`, `rootPath`, `language`, `framework` (none)
  and `isSample` as before

#### Scenario: A workspace root that is not absolute is rejected before any call

- **GIVEN** the workspace root `work` (relative) and a valid allowed root
- **WHEN** a project is reindexed
- **THEN** it throws `RangeError`, and the store, the source tree, the history reader and the analyzer
  received no call

#### Scenario: A failed cache invalidation fails the unit of work

- **GIVEN** a stored project, and a unit of work that records how its work settled and whose store's
  `invalidateCache` rejects with an error `E`
- **WHEN** the project is reindexed
- **THEN** the work given to the unit of work rejected with `E` after `saveGraph` was called (so the
  unit of work rolls both back; graph-store, "Running work in one transaction on a pooled store"),
  and the reindex rejects with `E`

#### Scenario: An invalid graph writes nothing

- **GIVEN** a stored project whose analyzer returns an edge to a symbol it does not return
- **WHEN** the project is reindexed
- **THEN** it rejects with `InvalidGraph`, and no unit of work was opened

## ADDED Requirements

### Requirement: Incremental reindex plan

The incremental plan SHALL be computed from three inputs and nothing else:

- the **current files**: each indexable file of the repository (after the input hygiene) with its
  current hash, the lowercase hexadecimal SHA-256 of its redacted content (the `contentHash` a
  snapshot writes for it);
- the **stored files**: each file path of the project's stored graph with its stored hash, or none
  when the stored hash is unset;
- the **stored dependencies**: `{ from path, to path, kind }` triples of the stored graph.

A current file is **added** when its path is not stored, and **modified** when its path is stored and
its stored hash is none or differs from its current hash. A stored path that is not current is
**deleted**. A current file G is a **direct dependent** of a file F when G ≠ F and some stored
dependency has from path G, to path F and a kind among `imports`, `calls`, `extends` and
`implements`; any other kind (`co_changed`, `tested_by`, `describes`) makes no dependent, and a
dependent of a dependent is not a dependent (one hop).

The plan SHALL return three lists of paths, each in UTF-8 byte order and with each path once:
`queued`, the current files that are added, modified, or a direct dependent of a modified or deleted
file; `skipped`, every other current file; and `deleted`. `queued` and `skipped` SHALL be disjoint and
together hold exactly the current paths. The plan SHALL be deterministic and SHALL NOT depend on the
order of its inputs. It reads and writes nothing.

#### Scenario: Changed files and their direct dependents are queued

- **GIVEN** the stored files `A.php` (hash `h1`), `B.php` (`h2`), `C.php` (`h3`) and `D.php` (`h4`),
  the stored dependencies `B.php → A.php` (`calls`) and `C.php → B.php` (`imports`), and the current
  files `A.php` (`h1x`), `B.php` (`h2`), `C.php` (`h3`) and `E.php` (`h5`)
- **WHEN** the plan is computed
- **THEN** `queued` is `["A.php", "B.php", "E.php"]`, `skipped` is `["C.php"]` and `deleted` is
  `["D.php"]` (`C.php` depends on `B.php`, which did not change)

#### Scenario: A dependent of a deleted file is queued

- **GIVEN** the inputs of "Changed files and their direct dependents are queued" plus the stored
  dependency `C.php → D.php` (`extends`)
- **WHEN** the plan is computed
- **THEN** `queued` is `["A.php", "B.php", "C.php", "E.php"]`, `skipped` is `[]` and `deleted` is
  `["D.php"]`

#### Scenario: Edges that are not dependencies queue nothing

- **GIVEN** the inputs of "Changed files and their direct dependents are queued" plus the stored
  triples `C.php → A.php` of kinds `co_changed`, `tested_by` and `describes`
- **WHEN** the plan is computed
- **THEN** `skipped` is still `["C.php"]`

#### Scenario: A stored file without a hash counts as modified

- **GIVEN** the stored files `A.php` (`h1`), `B.php` (no hash) and `C.php` (`h3`), the stored
  dependency `C.php → B.php` (`imports`), and the current files `A.php` (`h1`), `B.php` (`h2`) and
  `C.php` (`h3`)
- **WHEN** the plan is computed
- **THEN** `queued` is `["B.php", "C.php"]`, `skipped` is `["A.php"]` and `deleted` is `[]`

#### Scenario: The plan does not depend on the order of its inputs

- **GIVEN** the inputs of "A dependent of a deleted file is queued", and the same inputs with each
  list reversed
- **WHEN** both plans are computed
- **THEN** they are equal

### Requirement: Incremental reindex

With `incremental` `true`, reindexing SHALL run the `enabled`, `project` and `confine` steps of
"Reindexing an existing project" and then these steps, in this order, a failing step's error
propagating unchanged with no later step started:

| Step | Work |
| -- | -- |
| read | read, apply the input hygiene and redact as the full mode does, and compute each indexable file's current hash |
| plan | read the project's index state (graph-store, "Index state read") and compute the plan of "Incremental reindex plan" |
| history | read the history, with the rules of the full mode; it is read once per reindex |
| decide | the reindex is **unchanged** when the plan's `queued` and `deleted` are empty and the history's `HEAD` equals the project's stored `indexedCommit`; a project with no stored `indexedCommit` is never unchanged |
| fast path (unchanged) | in **one** unit of work, delete every answer cache entry of the project; nothing else is written and the analyzer is not called |
| full path (otherwise) | analyse **every** indexable file (not only the queued ones), redact the commit messages, add the `co_changed` edges and validate the graph as the full mode does (rejecting with `InvalidGraph` before any unit of work); then, in one unit of work, save the whole graph and delete every answer cache entry, as the full mode's `save` step |

The progress phases SHALL be reported once each, in this order: `confine`, `read`, `redact`,
`history`, then `analyze` and `save` on the full path, or only `save` on the fast path. Nothing SHALL
be written to the store before the unit of work, and the atomicity rules of the full mode's `save`
step apply.

The report SHALL have `mode` `incremental`, `filesQueued` the number of `queued` paths and
`filesSkipped` the number of `skipped` paths, so `filesQueued + filesSkipped` is the number of
indexable files. On the full path its other fields are those of the full mode. On the fast path
`indexedCommit` SHALL be the stored one; `files`, `filesDeleted`, `symbols`, `commits`,
`fileCommits` and every count of `edges` SHALL be `0` (nothing was written); `diagnostics` and
`commitEvents` SHALL be empty; `events` and `skipped` SHALL be those of the files read, ordered as in
"Index report"; and `cacheEntriesInvalidated` the number of entries deleted. `filesSkipped` counts
the plan's `skipped` paths only; it never counts the report's `skipped` entries (files left out by
the input hygiene), which are not indexable files.

#### Scenario: An unchanged repository takes the fast path

- **GIVEN** a stored PHP project whose `indexedCommit` is the `HEAD` of its repository, whose index
  state holds exactly the repository's two indexable files with their current hashes, and one answer
  cache entry, with doubles that record their calls
- **WHEN** the project is reindexed with `incremental` `true`
- **THEN** the report has `mode` `incremental`, `filesQueued` 0, `filesSkipped` 2, `indexedCommit`
  the stored one, `files` 0, `symbols` 0 and `cacheEntriesInvalidated` 1; the analyzer received no
  call; and the only unit of work received `invalidateCache` and no `saveGraph`

#### Scenario: A failed cache invalidation on the fast path fails the reindex

- **GIVEN** the project of "An unchanged repository takes the fast path" and a unit of work whose
  store's `invalidateCache` rejects with an error `E`
- **WHEN** the project is reindexed with `incremental` `true`
- **THEN** the reindex rejects with `E` and `saveGraph` was never called

#### Scenario: A new HEAD with no changed file runs the whole reindex

- **GIVEN** the project of "An unchanged repository takes the fast path" whose stored `indexedCommit`
  differs from the repository's `HEAD`; then the same project with no stored `indexedCommit`
- **WHEN** each is reindexed with `incremental` `true`
- **THEN** for each, the analyzer received both files, one unit of work received `saveGraph` and then
  `invalidateCache`, and the report has `mode` `incremental`, `filesQueued` 0, `filesSkipped` 2 and
  `indexedCommit` the repository's `HEAD`

#### Scenario: A changed file is reprocessed with the whole snapshot

- **GIVEN** a stored PHP project whose repository holds `app/A.php`, `app/B.php` and `app/C.php`,
  whose index state holds the three paths with the current hashes of `app/B.php` and `app/C.php` and
  another hash for `app/A.php`, and the stored dependency `app/B.php → app/A.php` (`calls`)
- **WHEN** the project is reindexed with `incremental` `true`
- **THEN** the analyzer received the three files, `saveGraph` received a graph with the three files,
  and the report has `mode` `incremental`, `filesQueued` 2, `filesSkipped` 1 and `files` 3

#### Scenario: A full reindex ignores the stored index state

- **GIVEN** the project of "An unchanged repository takes the fast path"
- **WHEN** the project is reindexed with `incremental` `false`
- **THEN** the index state was not read, the analyzer received both files, one unit of work received
  `saveGraph` and then `invalidateCache`, and the report has `mode` `full`, `filesQueued` 2 and
  `filesSkipped` 0

#### Scenario: The phases of an incremental reindex are reported in order

- **GIVEN** the project of "An unchanged repository takes the fast path", then the project of "A
  changed file is reprocessed with the whole snapshot", and a progress callback that records the
  phases
- **WHEN** each is reindexed with `incremental` `true`
- **THEN** the first reports `confine`, `read`, `redact`, `history`, `save` and the second `confine`,
  `read`, `redact`, `history`, `analyze`, `save`

#### Scenario: An invalid graph in an incremental reindex writes nothing

- **GIVEN** the project of "A changed file is reprocessed with the whole snapshot" whose analyzer
  returns an edge to a symbol it does not return
- **WHEN** the project is reindexed with `incremental` `true`
- **THEN** it rejects with `InvalidGraph` and no unit of work was opened

#### Scenario: An incremental reindex over Postgres reprocesses the changed file and its direct dependents

- **GIVEN** a copy of `fixtures/acme-shop` with its history built, under an allowed root, indexed into
  Postgres with the real adapters and the PHP analyzer; the number N of distinct files with a stored
  `imports`, `calls`, `extends` or `implements` dependency into `app/Services/PriceCalculator.php`,
  read with the index state before the change, N being at least 1 (the test fails when it is 0); one
  `current` claim with evidence on `app/Services/PriceCalculator.php` and one `current` claim with
  evidence on the first stored path in byte order that is neither `app/Services/PriceCalculator.php`
  nor one of those N dependents; and one answer cache entry of the project
- **WHEN** a commit changes the content of `app/Services/PriceCalculator.php` in the copy and the
  project is reindexed with `incremental` `true`
- **THEN** the report has `mode` `incremental`, `filesQueued` 1 + N, the N dependents being exactly
  the stored `imports`, `calls`, `extends` or `implements` sources into
  `app/Services/PriceCalculator.php`, `filesSkipped` equal to the
  project's `file` rows minus `filesQueued`, `indexedCommit` the copy's new `HEAD` and
  `cacheEntriesInvalidated` 1; the first claim is `stale` and the second `current`; the `file` row of
  `app/Services/PriceCalculator.php` keeps its id, and its `file_commit` rows and the first claim's
  evidence still exist; the project's `indexed_commit` is the new `HEAD`

#### Scenario: An unchanged repository keeps its indexing metadata over Postgres

- **GIVEN** the indexed copy of "An incremental reindex over Postgres reprocesses the changed file and
  its direct dependents", before any change, with one `current` claim and one answer cache entry
- **WHEN** the project is reindexed with `incremental` `true`
- **THEN** the report has `filesQueued` 0 and `filesSkipped` equal to the project's `file` rows; the
  project's `indexed_at` and `indexed_commit` are unchanged; the claim is still `current`; and the
  project has no answer cache entry
