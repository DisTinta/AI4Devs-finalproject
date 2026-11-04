## MODIFIED Requirements

### Requirement: Ask answered response

When the use case answers with statements, the endpoint SHALL answer `200` with a JSON object whose
keys are exactly `answer`, `statements`, `evidence`, `confidence` and `usage`:

- `answer`: the model's answer text;
- `statements`: in the use case's order, each exactly `{ text, type, verification, evidenceIds }`,
  `type` `FACT` or `INFERENCE`, `verification` `entailed` or `cited`;
- `evidence`: one entry per evidence entry of the use case, in its order, each exactly
  `{ id, file, startLine, endLine, excerpt }`, `file` the repository-relative path;
- `confidence`: the answer's confidence, a number;
- `usage`: exactly `{ inputTokens, outputTokens, baselineTokens, baselineEstimator, savingsPct,
  costUsd, latencyMs, cacheHit, generation: { inputTokens, outputTokens, costUsd }, verification:
  { calls, cacheHits, inputTokens, outputTokens, costUsd, latencyMs }, projectCache: { queries,
  cacheHits, hitRatePct } }`: the use case's usage, plus `projectCache`, the cache hit rate of the
  project (`semantic-cache`, "Project cache hit rate") computed from the project's explain query counts
  (`graph-store`, "Explain query counts").

The endpoint SHALL read the explain query counts of the resolved project after the use case answered
and after the answer's events were written to the request log, so the counts include the `query_log`
row of the current call whenever the use case wrote it. It SHALL read them only for an answered
question: an `UNKNOWN` answer, a validation failure and an error of the use case read no counts. A
failure of that read SHALL answer `500` `INTERNAL`, like any other unexpected error; the answer was
already logged and, when cacheable, saved by the use case. `projectCache` is not part of the use
case's usage nor of a stored response.

The evidence ids SHALL be public ids `ev-1`, `ev-2`… numbered in evidence order, and each statement's
`evidenceIds` SHALL name the public ids of the entries it cited, in its order. A use case answer
whose statement cites an id absent from its evidence breaks the use case's contract and SHALL answer
`500` `INTERNAL`; no id is dropped or invented. The text the endpoint passes through unchanged
(`answer` and each statement's `text`, written by the model, and each `excerpt`, read from the
repository) is sent as it is, whatever it mentions; outside that text, the body MUST NOT
contain a database id, a file id, the use case's prompt ids (`E1`…), its prior claims, its events,
whether the claims were stored, a statement's stale status or warning, any provenance, or the text of
any question of the project's query log.

#### Scenario: An answered question returns only the public fields over the seed

- **GIVEN** acme-shop loaded from `seeds/graph-dump.sql` into Postgres with its history built at the
  seed commit and no `query_log` row, and a live model that answers one statement citing the anchor
  span `app/Services/PriceCalculator.php` lines 16–44 and accepts every verification
- **WHEN** `POST /api/projects/<acme-shop's id>/ask` is sent
  `{ "question": "¿Cómo se calcula el precio final de un pedido?" }`
- **THEN** it answers `200`; the body's keys are exactly `answer`, `statements`, `evidence`,
  `confidence`, `usage`; the one statement has exactly the keys `text`, `type`, `verification`,
  `evidenceIds`, with `type` `FACT`, `verification` `entailed` and `evidenceIds` `["ev-1"]`; the one
  evidence entry is exactly `{ "id": "ev-1", "file": "app/Services/PriceCalculator.php", "startLine": 16, "endLine": 44, "excerpt": <lines 16–44 of that file> }`;
  `confidence` is a number between 0 and 1; `usage` has exactly the keys listed above and
  `usage.projectCache` is exactly `{ "queries": 1, "cacheHits": 0, "hitRatePct": 0 }`; the body
  contains no UUID and none of the keys `fileId`, `provenance`, `priorClaims`, `events`, `persisted`,
  `kind`, `status`, `warning`; and one claim row was written

#### Scenario: Evidence ids are renumbered in evidence order

- **GIVEN** the app built with doubles and a use case that answers with the evidence ids `X`, `Y`,
  `Z` (in that order, any id form) and two statements citing `[Y, X]` and `[Z]`
- **WHEN** a valid question is sent
- **THEN** the evidence ids are `ev-1`, `ev-2`, `ev-3` for `X`, `Y`, `Z`, the statements'
  `evidenceIds` are `["ev-2", "ev-1"]` and `["ev-3"]`, and none of `X`, `Y`, `Z` is in the body

#### Scenario: Internal fields of the answer are not sent

- **GIVEN** the app built with doubles and a use case that answers, unsaved, with a stale statement
  carrying a warning, a prior claim, two events and its evidence `fileId`s
- **WHEN** a valid question is sent
- **THEN** it answers `200` and the body contains none of the keys `fileId`, `priorClaims`, `events`,
  `persisted`, `kind`, `status`, `warning`, nor the prior claim's text or id

#### Scenario: A statement citing an unknown evidence id answers INTERNAL

- **GIVEN** the app built with doubles and a use case that answers with the evidence id `X` and one
  statement citing `[Y]`
- **WHEN** a valid question is sent
- **THEN** it answers `500` with the body exactly
  `{ "error": { "code": "INTERNAL", "message": "unexpected error", "details": {} } }`

#### Scenario: The usage carries the project's cache hit rate over the seed

- **GIVEN** acme-shop and task-api loaded from the versioned seed into a database without any
  `query_log` row, the versioned golden answers of both saved in their answer caches as the seed load
  saves them, and the API in evaluation mode
- **WHEN** `POST /api/projects/<acme-shop's id>/ask` is sent twice with
  `{ "question": "¿Cómo se calcula el precio final de un pedido?" }`, and then
  `POST /api/projects/<task-api's id>/ask` once with task-api's golden question `Q1`
- **THEN** the three requests answer `200` from the golden answers (`usage.cacheHit` `true`); the
  first acme-shop answer has `usage.projectCache` exactly `{ "queries": 1, "cacheHits": 1, "hitRatePct": 100 }`,
  the second exactly `{ "queries": 2, "cacheHits": 2, "hitRatePct": 100 }`, and the task-api answer
  exactly `{ "queries": 1, "cacheHits": 1, "hitRatePct": 100 }`; every other key of `usage` is the
  usage of a cache hit, unchanged; and no model was called

#### Scenario: The hit rate is read only for an answered question and its failure answers INTERNAL

- **GIVEN** the app built with doubles over the in-memory store, whose project holds 3 `explain` rows
  of which 1 has the cache flag and 2 `impact` rows; a use case that answers with statements without
  writing any row; then a use case that answers `UNKNOWN` (`no-anchor`); then the first use case with
  an injected failure of the store's explain query counts
- **WHEN** a valid question is sent in each case
- **THEN** the first answers `200` with `usage.projectCache` exactly
  `{ "queries": 3, "cacheHits": 1, "hitRatePct": 33.3 }` and the counts were read once; the second
  answers `200` with the `UNKNOWN` body, no `usage`, and the counts were not read; the third answers
  `500` with the body exactly
  `{ "error": { "code": "INTERNAL", "message": "unexpected error", "details": {} } }`, after the use
  case was called once

### Requirement: Ask in the OpenAPI document

The OpenAPI document of the API SHALL list `POST /api/projects/{projectId}/ask` with the path
parameter `projectId` (required, a string of format `uuid`), the request body generated from its
schema and the `200` response generated from its schema (the answered and the `UNKNOWN` shapes), plus
the error responses `400`, `404`, `429`, `500` and `503` in the error format. The answered shape's
`usage` SHALL publish `projectCache` with its three keys.

#### Scenario: The document lists ask with its parameter, body and responses

- **GIVEN** the app built with doubles
- **WHEN** `GET /docs/json` is sent
- **THEN** `paths` has `/api/projects/{projectId}/ask` with a `post` operation whose parameters
  include `projectId` in `path`, required, of type `string` and format `uuid`; whose request body
  schema has `required` `["question"]`, `additionalProperties` `false`, `question` of type `string`
  with `minLength` 5 and `maxLength` 500, `tokenBudget` of type `integer` with `minimum` 1000,
  `maximum` 32000 and `default` 8000, and `useCache` of type `boolean` with `default` `true`; whose
  `200` response schema offers two shapes, one
  with the keys `answer`, `statements`, `evidence`, `confidence`, `usage` and one with `answer`,
  `reason`, `message`, `statements`, `evidence`; whose answered shape's `usage` has the key
  `projectCache`, an object with `additionalProperties` `false` and `required`
  `["queries", "cacheHits", "hitRatePct"]`, whose `queries` and `cacheHits` are of type `integer` with
  `minimum` 0 and whose `hitRatePct` accepts a number from 0 to 100 and `null`; and whose responses
  include `400`, `404`, `429`, `500` and `503`
