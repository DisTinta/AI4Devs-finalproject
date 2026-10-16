## Purpose

The HTTP endpoint `POST /api/projects/{projectId}/ask`: it validates a question about one indexed
project, answers it with the `explain` use case and returns the explanation in the public format of
`readme.md` §4 (typed statements, cited evidence, confidence and usage), or an honest `UNKNOWN` with
its reason, with every failure in the API's error format.

## ADDED Requirements

### Requirement: Ask request validation

`POST /api/projects/{projectId}/ask` SHALL validate its path parameter and its JSON body before
anything else runs, and a request that fails SHALL answer `400` `VALIDATION_ERROR` as defined by the
`api-foundation` capability ("Request validation by schema"), without any call to the store, the
source tree or the model. The rules:

| Part | Field | Rule |
|---|---|---|
| path | `projectId` | 8-4-4-4-12 hexadecimal digits separated by `-`, any letter case |
| body | `question` | required string of 5 to 500 Unicode code points (an astral character counts as one), not only whitespace, without U+0000 |
| body | `tokenBudget` | optional integer from 1000 to 32000 (the context pack's limits); when absent, the use case's default (8000) applies |
| body | `useCache` | optional boolean; accepted and without effect until the answer cache exists |
| body | any other key (`hops` included) | rejected (`unrecognized_keys`) |

No issue and no other part of the response SHALL contain a received value.

#### Scenario: An invalid question answers VALIDATION_ERROR without asking

- **GIVEN** the app built with doubles and a stored project
- **WHEN** `POST /api/projects/{id}/ask` is sent, in turn, `{ "question": "abc" }`,
  `{ "question": "<501 × U+1F600>" }`, `{ "question": "       " }`,
  `{ "question": "price\u0000calc" }` and `{}`
- **THEN** each answers `400` with `error.code` `VALIDATION_ERROR`, `error.message`
  `invalid request` and an issue whose `path` is `["question"]`; no response contains `abc`, `price`
  or `calc`; and the store, the source tree and the model received no call

#### Scenario: A question at the length bounds is accepted

- **GIVEN** the app built with doubles and a stored project
- **WHEN** `POST /api/projects/{id}/ask` is sent `{ "question": "<5 × U+1F600>" }` (10 UTF-16 code
  units) and then `{ "question": "<500 × U+1F600>" }` (1 000 UTF-16 code units)
- **THEN** both answer `200`

#### Scenario: An invalid token budget, cache flag or extra key answers VALIDATION_ERROR

- **GIVEN** the app built with doubles and a stored project
- **WHEN** a valid question is sent, in turn, with `tokenBudget` `50`, `999`, `32001`, `8000.5` and
  `"8000"`, with `useCache` `"yes"`, with `hops` `2`, and with an extra key `x`
- **THEN** each answers `400` `VALIDATION_ERROR` with one issue whose `code` is, in order,
  `too_small`, `too_small`, `too_big`, `invalid_type`, `invalid_type`, `invalid_type`,
  `unrecognized_keys` and `unrecognized_keys`, and the question was not answered

#### Scenario: A malformed project id answers VALIDATION_ERROR

- **GIVEN** the app built with doubles
- **WHEN** a valid body is sent to `/api/projects/not-a-uuid/ask`, to `/api/projects/123/ask` and to
  `/api/projects/<a UUID without its dashes>/ask`
- **THEN** each answers `400` `VALIDATION_ERROR` with an issue whose `path` is `["projectId"]`, no
  response contains the id sent, and the store received no call

#### Scenario: Optional fields are forwarded as the use case expects

- **GIVEN** the app built with doubles, a stored project and a use case that records its requests
- **WHEN** a valid question is sent without optional fields, then with `tokenBudget` `1000`, then with
  `tokenBudget` `32000` and `useCache` `false`
- **THEN** all three answer `200`, and the use case received, in order,
  `{ projectId, question }`, `{ projectId, question, tokenBudget: 1000 }` and
  `{ projectId, question, tokenBudget: 32000 }`, where `projectId` is the stored project's id and
  `question` the question exactly as sent

### Requirement: Ask project resolution

The endpoint SHALL resolve the project by its id in the store before answering, whatever the
question. A well-formed id that names no project SHALL answer `404` with the body exactly
`{ "error": { "code": "PROJECT_NOT_FOUND", "message": "project not found", "details": {} } }`, without
any call to the model and without the id in the body. An id that differs from a stored one only in
letter case SHALL resolve that project.

#### Scenario: An unknown project answers PROJECT_NOT_FOUND

- **GIVEN** the app built with doubles, a model that counts its calls, and a random UUID that names
  no stored project
- **WHEN** `POST /api/projects/<that UUID>/ask` is sent `{ "question": "¿Cómo se calcula el precio final de un pedido?" }`,
  and then `{ "question": "<5 × U+1F600>" }` (a question with no search term)
- **THEN** both answer `404` with the body exactly
  `{ "error": { "code": "PROJECT_NOT_FOUND", "message": "project not found", "details": {} } }`,
  neither body contains the UUID, and the model received no call

#### Scenario: An upper-case project id resolves the same project

- **GIVEN** acme-shop loaded from `seeds/graph-dump.sql` into Postgres and the model in evaluation mode
- **WHEN** `POST /api/projects/<acme-shop's id in upper case>/ask` is sent
  `{ "question": "¿Cómo se calcula el precio final de un pedido?" }`
- **THEN** it answers `200` with `answer` `UNKNOWN` and `reason` `llm-required`

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
  { calls, cacheHits, inputTokens, outputTokens, costUsd, latencyMs } }`, the use case's usage.

The evidence ids SHALL be public ids `ev-1`, `ev-2`… numbered in evidence order, and each statement's
`evidenceIds` SHALL name the public ids of the entries it cited, in its order. The body MUST NOT
contain a database id, a file id, the use case's prompt ids (`E1`…), its prior claims, its events,
whether the claims were stored, a statement's stale status or warning, or any provenance.

#### Scenario: An answered question returns only the public fields over the seed

- **GIVEN** acme-shop loaded from `seeds/graph-dump.sql` into Postgres with its history built at the
  seed commit, and a live model that answers one statement citing the anchor span
  `app/Services/PriceCalculator.php` lines 16–44 and accepts every verification
- **WHEN** `POST /api/projects/<acme-shop's id>/ask` is sent
  `{ "question": "¿Cómo se calcula el precio final de un pedido?" }`
- **THEN** it answers `200`; the body's keys are exactly `answer`, `statements`, `evidence`,
  `confidence`, `usage`; the one statement has exactly the keys `text`, `type`, `verification`,
  `evidenceIds`, with `type` `FACT`, `verification` `entailed` and `evidenceIds` `["ev-1"]`; the one
  evidence entry is exactly `{ "id": "ev-1", "file": "app/Services/PriceCalculator.php", "startLine": 16, "endLine": 44, "excerpt": <lines 16–44 of that file> }`;
  `confidence` is a number between 0 and 1; `usage` has exactly the keys listed above; the body
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

### Requirement: Ask UNKNOWN response

When the use case answers `UNKNOWN`, the endpoint SHALL answer `200` (never an error status) with
the body exactly `{ "answer": "UNKNOWN", "reason", "statements": [], "evidence": [] }` plus, only for
the reason `llm-required`, `message` with the use case's message, so the body of `llm-required` is
`{ "answer": "UNKNOWN", "reason": "llm-required", "message": "evaluation mode (cache-only): set LLM_* to enable free-form asks", "statements": [], "evidence": [] }`.
An `UNKNOWN` body has no `confidence` and no `usage`.

#### Scenario: Evaluation mode answers UNKNOWN llm-required over the seed

- **GIVEN** acme-shop loaded from `seeds/graph-dump.sql` into Postgres and a model in evaluation mode
  that counts its calls
- **WHEN** `POST /api/projects/<acme-shop's id>/ask` is sent
  `{ "question": "¿Cómo se calcula el precio final de un pedido?" }`
- **THEN** it answers `200` with the body exactly
  `{ "answer": "UNKNOWN", "reason": "llm-required", "message": "evaluation mode (cache-only): set LLM_* to enable free-form asks", "statements": [], "evidence": [] }`,
  the model received no call, and no claim row was written

#### Scenario: Another UNKNOWN reason carries no message

- **GIVEN** the app built with doubles and a use case that answers `UNKNOWN` with the reason
  `no-anchor`, then with the reason `broken-evidence` and one `evidence_broken` event
- **WHEN** a valid question is sent twice
- **THEN** both answer `200` with the bodies exactly
  `{ "answer": "UNKNOWN", "reason": "no-anchor", "statements": [], "evidence": [] }` and
  `{ "answer": "UNKNOWN", "reason": "broken-evidence", "statements": [], "evidence": [] }`

### Requirement: Ask error answers

The endpoint SHALL answer the domain errors raised while answering with these entries of its own
table (see "Domain error mapping" of `api-foundation`), each in the API's error format with the fixed
message and the details built only from the error's fields:

| Domain error | Status | `code` | `message` | `details` |
|---|---|---|---|---|
| The project does not exist | 404 | `PROJECT_NOT_FOUND` | `project not found` | `{}` |
| The use case rejects the request | 400 | `INVALID_EXPLAIN_REQUEST` | `invalid request` | `{ field }` |
| The model is unavailable | 503 | `LLM_UNAVAILABLE` | `the language model is unavailable` | `{ reason }` plus `status`, `expected`, `received`, `systemCode` when the error has them |
| The project's source cannot be read | 503 | `SOURCE_UNAVAILABLE` | `the project's source cannot be read` | `{ reason }` plus `path` when the error has it |
| The daily LLM budget is exhausted | 429 | `BUDGET_EXHAUSTED` | `the daily LLM budget is exhausted` | `{ spentUsd, dailyBudgetUsd, resetsAt, cacheOnly: true }` |

`cacheOnly: true` states that the system keeps serving what needs no model call. Any other error
SHALL answer `500` `INTERNAL`. The endpoint is limited by the API's rate limit by IP
("Rate limit by IP" of `api-foundation`).

#### Scenario: Domain errors of the use case map to their answers

- **GIVEN** the app built with doubles, a stored project and a use case that rejects, in turn, with
  `InvalidExplainRequest` naming `question`, `LlmUnavailable` with reason `http-status` and status
  `502`, `LlmUnavailable` with reason `network` and system code `ECONNREFUSED`, `SourceUnavailable`
  with reason `missing` and path `app/Gone.php`, `SourceUnavailable` with reason `not-indexed`, and
  `ProjectNotFound`
- **WHEN** a valid question is sent each time
- **THEN** the answers are, in order: `400` `INVALID_EXPLAIN_REQUEST` `invalid request`
  `{ "field": "question" }`; `503` `LLM_UNAVAILABLE` `the language model is unavailable`
  `{ "reason": "http-status", "status": 502 }`; `503` `LLM_UNAVAILABLE` with
  `{ "reason": "network", "systemCode": "ECONNREFUSED" }`; `503` `SOURCE_UNAVAILABLE`
  `the project's source cannot be read` `{ "reason": "missing", "path": "app/Gone.php" }`; `503`
  `SOURCE_UNAVAILABLE` with `{ "reason": "not-indexed" }`; `404` `PROJECT_NOT_FOUND`
  `project not found` `{}`; and no body contains the error's own message

#### Scenario: An exhausted budget on ask answers 429 with the cache-only notice

- **GIVEN** the app built with doubles, a stored project and a use case that rejects with
  `BudgetExhausted` with `spentUsd` 2.5, `dailyBudgetUsd` 2 and `resetsAt` 2026-10-17T00:00:00Z
- **WHEN** a valid question is sent
- **THEN** it answers `429` with the body exactly
  `{ "error": { "code": "BUDGET_EXHAUSTED", "message": "the daily LLM budget is exhausted", "details": { "spentUsd": 2.5, "dailyBudgetUsd": 2, "resetsAt": "2026-10-17T00:00:00.000Z", "cacheOnly": true } } }`

#### Scenario: A spent daily budget stops the model over the seed

- **GIVEN** acme-shop loaded from `seeds/graph-dump.sql` into Postgres with its history built, a
  `query_log` row of acme-shop dated today (UTC) with `cost_usd` 1.5, and a live model that counts its
  calls wrapped by the daily ceiling with `dailyBudgetUsd` 1 over that store
- **WHEN** `POST /api/projects/<acme-shop's id>/ask` is sent
  `{ "question": "¿Cómo se calcula el precio final de un pedido?" }`
- **THEN** it answers `429` with `error.code` `BUDGET_EXHAUSTED` and `error.details` exactly
  `{ "spentUsd": 1.5, "dailyBudgetUsd": 1, "resetsAt": <the next 00:00 UTC>, "cacheOnly": true }`,
  and the model received no call

#### Scenario: Another error of the use case answers INTERNAL

- **GIVEN** the app built with doubles, a stored project and a use case that rejects with
  `new Error('pool failed at 10.0.0.5')`
- **WHEN** a valid question is sent
- **THEN** it answers `500` with the body exactly
  `{ "error": { "code": "INTERNAL", "message": "unexpected error", "details": {} } }`, without
  `10.0.0.5`

#### Scenario: The ask route is rate limited

- **GIVEN** the app built with doubles, a stored project and a limit of 2 requests per 60 000 ms
- **WHEN** the IP `10.0.0.1` sends three valid questions
- **THEN** the first two answer `200`, the third answers `429` `RATE_LIMITED`, and the question was
  answered exactly twice

### Requirement: Ask events and verification verdicts

The endpoint SHALL write each event of the use case's answer (answered or `UNKNOWN`) to the request
log, in order, one line per event with the event's fields and the request's id: an `evidence_broken`
event at level `error`, every other event at level `info`. No log line SHALL contain the question.
The verdicts of the semantic check SHALL be shared by the requests of one running API: a (statement,
citation) pair already checked by an earlier request of the same API SHALL NOT be sent to the model
again.

#### Scenario: The answer's events are logged by level

- **GIVEN** the app built with its log written to a test stream, a stored project and a use case that
  answers with the events `untrusted_content_flagged` (source `question`), `evidence_broken` and
  `entailment_unverified`, in that order
- **WHEN** the question `SENTINEL-question-4d1e price` is sent
- **THEN** three log lines carrying the request's `reqId` hold those events in order, the
  `evidence_broken` one at level `error` (50) and the other two at level `info` (30), each with the
  event's `type`; and no log line contains `SENTINEL-question-4d1e`

#### Scenario: Requests to one API share verification verdicts

- **GIVEN** the app built with an in-memory store and source tree holding a project, and a live
  scripted model that answers one statement citing one span and accepts every verification
- **WHEN** the same question is sent twice to that app, and then once to a second app built with the
  same doubles
- **THEN** the first request makes one `answer` call and one `verify` call; the second makes one
  `answer` call and no `verify` call, and its `usage.verification.cacheHits` is `1`; the request to
  the second app makes one `answer` call and one `verify` call

### Requirement: Ask in the OpenAPI document

The OpenAPI document of the API SHALL list `POST /api/projects/{projectId}/ask` with the path
parameter `projectId` (required, a string of format `uuid`), the request body generated from its
schema and the `200` response generated from its schema (the answered and the `UNKNOWN` shapes), plus
the error responses `400`, `404`, `429`, `500` and `503` in the error format.

#### Scenario: The document lists ask with its parameter, body and responses

- **GIVEN** the app built with doubles
- **WHEN** `GET /docs/json` is sent
- **THEN** `paths` has `/api/projects/{projectId}/ask` with a `post` operation whose parameters
  include `projectId` in `path`, required, of type `string` and format `uuid`; whose request body
  schema has `required` `["question"]`, `additionalProperties` `false`, `question` of type `string`
  with `minLength` 5 and `maxLength` 500, `tokenBudget` of type `integer` with `minimum` 1000 and
  `maximum` 32000, and `useCache` of type `boolean`; whose `200` response schema offers two shapes, one
  with the keys `answer`, `statements`, `evidence`, `confidence`, `usage` and one with `answer`,
  `reason`, `message`, `statements`, `evidence`; and whose responses include `400`, `404`, `429`,
  `500` and `503`
