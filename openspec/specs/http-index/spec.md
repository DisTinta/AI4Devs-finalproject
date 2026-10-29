# http-index Specification

## Purpose
The HTTP endpoint `POST /api/projects/{projectId}/index`: it re-indexes a project that already exists
from its stored repository, language and framework, invalidates the project's answer cache in the same
unit of work, and never receives a file system path, with every failure in the API's error format.

## Requirements

### Requirement: Index request validation

`POST /api/projects/{projectId}/index` SHALL validate its path parameter and its JSON body before
anything else runs, and a request that fails SHALL answer `400` `VALIDATION_ERROR` as defined by the
`api-foundation` capability ("Request validation by schema"), without any call to the store, the
source tree, the history reader or the analyzer. The rules:

| Part | Field | Rule |
|---|---|---|
| path | `projectId` | 8-4-4-4-12 hexadecimal digits separated by `-`, any letter case (as `/ask`) |
| body | `incremental` | optional boolean; accepted and without effect on the reindex (the incremental plan is not part of this capability) |
| body | any other key (`rootPath`, `language`, `name`, `framework` included) | rejected (`unrecognized_keys`) |

The body MAY be `{}`. A request without a body (no `Content-Type` and no content, as `curl -X POST`
sends) SHALL be handled exactly as the body `{}`. A request declaring `application/json` with an empty
body SHALL answer `400` `VALIDATION_ERROR` (`api-foundation`, "Single error format"). The endpoint SHALL NOT accept a file system path, a language or a framework in
any part of the request. No issue and no other part of the response SHALL contain a received value.

#### Scenario: A body with a path or a language answers VALIDATION_ERROR without indexing

- **GIVEN** the app built with doubles, indexing configured, and a stored project
- **WHEN** `POST /api/projects/{id}/index` is sent, in turn, `{ "rootPath": "/tmp/x" }`,
  `{ "language": "ruby" }`, `{ "incremental": "yes" }` and `{ "incremental": true, "name": "n" }`
- **THEN** each answers `400` with `error.code` `VALIDATION_ERROR` and `error.message`
  `invalid request`; no response contains `/tmp/x` nor `ruby`; and the store, the source tree, the
  history reader and the analyzer received no call

#### Scenario: A malformed project id answers VALIDATION_ERROR without indexing

- **GIVEN** the app built with doubles and indexing configured
- **WHEN** `POST /api/projects/not-a-uuid/index` is sent with the body `{}`
- **THEN** it answers `400` with `error.code` `VALIDATION_ERROR` and an issue whose `path` is
  `["projectId"]`, and the store received no call

#### Scenario: A request without a body is a full reindex

- **GIVEN** the app built with doubles, indexing configured, and a stored PHP project whose repository
  can be indexed
- **WHEN** `POST /api/projects/{id}/index` is sent with no body and no `Content-Type`, then with `{}`,
  then with `Content-Type: application/json` and an empty body
- **THEN** the first two answer `202` and their bodies are equal, and the third answers `400` with
  `error.code` `VALIDATION_ERROR`

#### Scenario: An invalid request answers VALIDATION_ERROR over the seed

- **GIVEN** acme-shop loaded from `seeds/graph-dump.sql` into Postgres with its `root_path` pointing at
  a copy of `fixtures/acme-shop` with its history built, under the API's allowed repositories root, and
  one answer cache entry of acme-shop
- **WHEN** `POST /api/projects/not-a-uuid/index` is sent `{}`, and
  `POST /api/projects/<acme-shop's id>/index` is sent `{ "rootPath": "/tmp/x" }`
- **THEN** both answer `400` with `error.code` `VALIDATION_ERROR`; no response contains `/tmp/x`; and
  acme-shop's `indexed_at`, `indexed_commit` and its `cache_entry` row are unchanged

### Requirement: Index accepted response

A valid request for a stored project whose repository can be indexed SHALL run the reindex of the
`repository-indexing` capability ("Reindexing an existing project") to completion within the request
and SHALL then answer `202` with exactly these keys:

| Key | Value |
|---|---|
| `projectId` | the stored project's id |
| `mode` | `"full"` |
| `analyzer` | the extractor of the project's language: `php-treesitter-laravel` for `php`, `ts-compiler` for `typescript` |
| `indexedCommit` | the sha of `HEAD` the snapshot was indexed at |
| `filesQueued` | the number of files written by the snapshot |
| `filesSkipped` | `0` |
| `cacheEntriesInvalidated` | the number of answer cache entries of the project deleted by the reindex |

`incremental: true` SHALL produce the same answer as an absent `incremental`. After the `202`, the
project's graph is the new snapshot and no answer cache entry saved before the reindex's commit
remains, so a question cached before the reindex and asked after the `202` is answered again by the
use case (`usage.cacheHit` `false`). An answer to a question that was still running when the reindex
committed may be saved afterwards from the previous snapshot; this capability does not prevent it
(`design.md`, E15).

The reindex runs to completion inside the request although it answers `202`: this is a recorded
deviation from the `202` rule of `docs/backend-standards.md` §6 (`design.md`, U9).

#### Scenario: A reindex answers 202 and invalidates the cache over the seed

- **GIVEN** acme-shop loaded from `seeds/graph-dump.sql` into Postgres with its `root_path` pointing at
  a copy of `fixtures/acme-shop` with its history built, under a directory that is the API's allowed
  repositories root; one answer cache entry of acme-shop for
  `¿Cómo se calcula el precio final de un pedido?`; and a live model that answers one statement citing
  the anchor span and counts its calls
- **WHEN** `POST /api/projects/<acme-shop's id>/index` is sent `{}`, and then
  `POST /api/projects/<acme-shop's id>/ask` is sent that question
- **THEN** the first answers `202` with exactly the keys of the table, `projectId` acme-shop's id,
  `mode` `full`, `analyzer` `php-treesitter-laravel`, `indexedCommit` the copy's `HEAD`,
  `filesQueued` equal to the number of `file` rows of acme-shop after the request, `filesSkipped` 0 and
  `cacheEntriesInvalidated` 1; the project's `indexed_at` is later than before the request and it has
  no `cache_entry` row
- **AND** the second answers `200` with `usage.cacheHit` `false` and the model received a call

#### Scenario: An incremental request is accepted as a full reindex

- **GIVEN** the app built with doubles, indexing configured, and a stored PHP project whose repository
  can be indexed
- **WHEN** `POST /api/projects/{id}/index` is sent `{ "incremental": true }`, and then `{}`
- **THEN** both answer `202` with `mode` `full` and `filesSkipped` 0, and the two bodies are equal

#### Scenario: A TypeScript project answers with the ts-compiler analyzer

- **GIVEN** the app built with doubles, indexing configured, and a stored TypeScript project whose
  repository can be indexed
- **WHEN** `POST /api/projects/{id}/index` is sent `{}`
- **THEN** it answers `202` with `analyzer` `ts-compiler`, and the TypeScript analyzer (not the PHP
  one) was called

### Requirement: Index error answers

The route SHALL answer the failures of the reindex with its own domain error table (`api-foundation`,
"Domain error mapping"), with fixed messages and details that never hold a path, a value of the
request or the text of the original error:

| Failure | Status | `code` | `message` | `details` |
|---|---|---|---|---|
| The API has no allowed repositories root or no author-hash salt | `403` | `INDEXING_DISABLED` | `indexing disabled (fixtures-only mode)` | `{}` |
| No project has that id | `404` | `PROJECT_NOT_FOUND` | `project not found` | `{}` |
| The stored repository root is outside the allowed repositories root | `403` | `FORBIDDEN_PATH` | `the project's repository is outside the allowed repositories directory` | `{}` |
| The stored repository is no longer a git repository or has no commit | `503` | `NOT_A_GIT_REPOSITORY` or `EMPTY_REPOSITORY` | `the project's source cannot be read` | `{}` |
| The analysis produced an invalid graph | `500` | `INTERNAL` | `unexpected error` | `{}` |
| Any other failure (the cache invalidation or the commit included) | `500` | `INTERNAL` | `unexpected error` | `{}` |

`INDEXING_DISABLED` SHALL be answered before any call to the store. On every failure the project's
graph and answer cache SHALL stay as they were. The route SHALL be rate limited by IP like every
business route (`api-foundation`, "Rate limit by IP").

#### Scenario: Indexing disabled answers 403 without touching the store

- **GIVEN** the app built with doubles and without indexing dependencies
- **WHEN** `POST /api/projects/{a well-formed id}/index` is sent `{}`
- **THEN** it answers `403` with exactly
  `{ "error": { "code": "INDEXING_DISABLED", "message": "indexing disabled (fixtures-only mode)", "details": {} } }`
  and the store received no call

#### Scenario: An unknown project answers PROJECT_NOT_FOUND

- **GIVEN** the app built with doubles, indexing configured, and no project with the id
  `00000000-0000-4000-8000-000000000000`
- **WHEN** `POST /api/projects/00000000-0000-4000-8000-000000000000/index` is sent `{}`
- **THEN** it answers `404` with exactly
  `{ "error": { "code": "PROJECT_NOT_FOUND", "message": "project not found", "details": {} } }`

#### Scenario: A stored root outside the allowed root answers FORBIDDEN_PATH without a path over the seed

- **GIVEN** acme-shop loaded from `seeds/graph-dump.sql` into Postgres with its `root_path` pointing at
  a copy of `fixtures/acme-shop` with its history built, one answer cache entry of acme-shop, and the
  API's allowed repositories root set to another existing directory
- **WHEN** `POST /api/projects/<acme-shop's id>/index` is sent `{}`
- **THEN** it answers `403` with `error.code` `FORBIDDEN_PATH`, the fixed message of the table and
  `details` `{}`; the response contains neither the copy's path nor the allowed root's path; and the
  project's `indexed_at`, `indexed_commit` and its `cache_entry` row are unchanged

#### Scenario: An unknown project answers PROJECT_NOT_FOUND over the seed

- **GIVEN** acme-shop loaded from `seeds/graph-dump.sql` into Postgres as in the scenarios above, and
  no project with the id `00000000-0000-4000-8000-000000000000`
- **WHEN** `POST /api/projects/00000000-0000-4000-8000-000000000000/index` is sent `{}`
- **THEN** it answers `404` with exactly
  `{ "error": { "code": "PROJECT_NOT_FOUND", "message": "project not found", "details": {} } }`, and
  acme-shop's `indexed_at`, `indexed_commit` and its `cache_entry` row are unchanged

#### Scenario: An unreadable stored repository answers 503 without a path

- **GIVEN** the app built with doubles, indexing configured, and a stored project whose repository
  reading rejects with `NotAGitRepository`, then one whose history has no commit (`EmptyRepository`)
- **WHEN** `POST /api/projects/{id}/index` is sent `{}` for each
- **THEN** each answers `503` with `error.code` `NOT_A_GIT_REPOSITORY` and `EMPTY_REPOSITORY`
  respectively, `error.message` `the project's source cannot be read` and `details` `{}`, and no
  response contains the project's root path

#### Scenario: An invalid graph answers INTERNAL and saves nothing

- **GIVEN** the app built with doubles, indexing configured, and a stored project whose analyzer
  returns an edge to a symbol it does not return
- **WHEN** `POST /api/projects/{id}/index` is sent `{}`
- **THEN** it answers `500` with exactly
  `{ "error": { "code": "INTERNAL", "message": "unexpected error", "details": {} } }`, and the store
  received no `saveGraph` and no `invalidateCache` call

#### Scenario: The index route is rate limited

- **GIVEN** the app built with doubles, indexing configured, a stored project whose repository can be
  indexed, and a rate limit of 2 requests per window
- **WHEN** `POST /api/projects/{id}/index` is sent `{}` three times from the same client
- **THEN** the first two answer `202`, the third answers `429` with `error.code` `RATE_LIMITED`, and
  the reindex ran exactly twice

### Requirement: Index completion log

After a successful reindex the route SHALL write one log line at level `info`, with the message
`reindex completed`, whose fields are
`projectId`, `mode`, `filesQueued`, `redactions` (the number of redaction events of files and commit
messages), `cacheEntriesInvalidated` and `durationMs`. The line SHALL NOT contain the project's root
path, the allowed repositories root, any file path of the repository nor any file content.

#### Scenario: A reindex logs its counters without paths

- **GIVEN** the app built with doubles, a logger writing to a test stream, indexing configured, and a
  stored project whose root path is `/repos/SENTINEL-root-4d1e` and whose one file holds an AWS
  access key
- **WHEN** `POST /api/projects/{id}/index` is sent `{}`
- **THEN** exactly one log line has the message `reindex completed`, at level `info`, with the fields `projectId`, `mode`, `filesQueued`,
  `redactions` (at least 1), `cacheEntriesInvalidated` and a numeric `durationMs`; and no log line
  contains `SENTINEL-root-4d1e`, the file's path nor the key

### Requirement: Index in the OpenAPI document

The OpenAPI document of the API SHALL list `POST /api/projects/{projectId}/index` with the path
parameter `projectId` (required, a string of format `uuid`), the request body generated from its
schema and not required (`requestBody.required` `false`), the `202` response generated from its schema, and the error responses `400`, `403`, `404`,
`429`, `500` and `503` in the error format.

#### Scenario: The document lists index with its parameter, body and responses

- **GIVEN** the app built with doubles
- **WHEN** `GET /docs/json` is sent
- **THEN** `paths` has `/api/projects/{projectId}/index` with a `post` operation whose parameters
  include `projectId` in `path`, required, of type `string` and format `uuid`; whose request body
  schema has `additionalProperties` `false`, no `required` key and only the property `incremental`
  of type `boolean`, and whose `requestBody.required` is `false`; whose `202` response schema has the properties `projectId`, `mode`, `analyzer`,
  `indexedCommit`, `filesQueued`, `filesSkipped` and `cacheEntriesInvalidated`; and whose responses
  include `400`, `403`, `404`, `429`, `500` and `503`
