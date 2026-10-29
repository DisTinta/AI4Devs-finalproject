## ADDED Requirements

### Requirement: Reindexing an existing project

Reindexing with input `{ projectId, allowedRoot, workspaceRoot }` SHALL rebuild the graph of a project
that already exists, from its stored `rootPath`, `language` and `framework`, and SHALL never create a
project. It SHALL run these steps, in this order, and a failing step's error SHALL propagate unchanged
(except as stated) with no later step started:

| Step | Work |
| -- | -- |
| enabled | when `allowedRoot` is missing, empty or only whitespace, reject with `IndexingDisabled` before any call to the store |
| project | read the project; an unknown or malformed id rejects with `ProjectNotFound` |
| confine | resolve a relative stored `rootPath` against `workspaceRoot` (an absolute one is used as is), then confine it to `allowedRoot` exactly as the `confine` phase of "Indexing order and no partial write" does (lexically, then on real paths; a missing allowed root rejects with `IndexingDisabled`); a `ForbiddenPathError` names the stored `rootPath`, never the resolved real path |
| build | read, apply the input hygiene, redact, analyse with the analyzer of the stored `language`, read and redact the history and add the `co_changed` edges, with the same rules as the `read`, `redact`, `analyze` and `history` phases of "Indexing order and no partial write"; the framework is not detected |
| save | validate the graph (rejecting with `InvalidGraph` as indexing does); then, in **one** unit of work, save the graph over the existing project id and delete every answer cache entry of the project |

Nothing SHALL be written to the store before the `save` step. Within it, the graph save SHALL come
before the cache invalidation, and when either fails, neither SHALL remain: the project keeps its
previous graph, indexing metadata and answer cache entries. The project's `name`, `rootPath`,
`language`, `framework` and `isSample` SHALL NOT change.

A successful reindex SHALL resolve to a report holding: `projectId`; `language`; `indexedCommit`;
`files`, `filesDeleted`, `symbols`, `commits` and `fileCommits` as counted by the snapshot write;
`edges` as in "Index report"; `events`; `commitEvents`; `diagnostics`; `skipped`, ordered as in "Index
report"; and `cacheEntriesInvalidated`, the number of cache entries deleted. The report SHALL be plain
JSON-serialisable data.

#### Scenario: A reindex saves over the stored project and then invalidates its cache

- **GIVEN** a stored PHP project with framework `laravel`, the absolute root `/repos/acme-shop` inside
  the allowed root `/repos`, two answer cache entries, and doubles of the source tree, the history
  reader and the analyzers that record their calls
- **WHEN** the project is reindexed
- **THEN** the PHP analyzer (not the TypeScript one) received the redacted files; inside one unit of
  work the store received `saveGraph` with the project's id and then `invalidateCache` with the same
  id; `createProject` was never called; and the report has that `projectId`, `language` `php`,
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
- **WHEN** it is reindexed
- **THEN** it rejects with `ProjectNotFound` and the source tree received no call

#### Scenario: A stored root outside the allowed root is rejected before reading

- **GIVEN** a stored project whose root is `/elsewhere/acme-shop` and the allowed root `/repos`; then
  one whose root `/repos/link` is a symbolic link whose real path is `/secret/acme-shop`
- **WHEN** each is reindexed
- **THEN** each rejects with `ForbiddenPathError` naming the stored root, the second's message does
  not contain `/secret`, and no file was read and nothing was written

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
