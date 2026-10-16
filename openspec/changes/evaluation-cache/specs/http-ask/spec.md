## MODIFIED Requirements

### Requirement: Ask request validation

`POST /api/projects/{projectId}/ask` SHALL validate its path parameter and its JSON body before
anything else runs, and a request that fails SHALL answer `400` `VALIDATION_ERROR` as defined by the
`api-foundation` capability ("Request validation by schema"), without any call to the store, the
source tree or the model. The rules:

| Part | Field | Rule |
|---|---|---|
| path | `projectId` | 8-4-4-4-12 hexadecimal digits separated by `-`, any letter case |
| body | `question` | required string of 5 to 500 Unicode code points (an astral character counts as one), not only whitespace, without U+0000 |
| body | `tokenBudget` | optional integer from 1000 to 32000 (the context pack's limits); when absent, the use case's default (8000) applies; the OpenAPI document publishes it as `default` |
| body | `useCache` | optional boolean; forwarded to the use case only when sent (requirement "Ask from the answer cache"); when absent, the use case's default (`true`) applies; the OpenAPI document publishes `default` `true` |
| body | any other key (`hops` included) | rejected (`unrecognized_keys`) |

No issue and no other part of the response SHALL contain a received value; an `unrecognized_keys`
issue names the undeclared key, the client's own field name, never a field's value (as in
`api-foundation`).

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

- **GIVEN** the app built with doubles and a stored project, the store, the model and the source tree
  wrapped by a call counter
- **WHEN** a valid question is sent, in turn, with `tokenBudget` `50`, `999`, `32001`, `8000.5` and
  `"8000"`, with `useCache` `"yes"`, with `hops` `2`, and with an extra key `x`
- **THEN** each answers `400` `VALIDATION_ERROR` with one issue whose `code` is, in order,
  `too_small`, `too_small`, `too_big`, `invalid_type`, `invalid_type`, `invalid_type`,
  `unrecognized_keys` and `unrecognized_keys`, and the store, the source tree and the model received
  no call

#### Scenario: A malformed project id answers VALIDATION_ERROR

- **GIVEN** the app built with doubles
- **WHEN** a valid body is sent to `/api/projects/not-a-uuid/ask`, to `/api/projects/123/ask` and to
  `/api/projects/<a UUID without its dashes>/ask`
- **THEN** each answers `400` `VALIDATION_ERROR` with an issue whose `path` is `["projectId"]`, no
  response contains the id sent, and the store received no call

#### Scenario: Optional fields are forwarded as the use case expects

- **GIVEN** the app built with doubles, a stored project and a use case that records its requests
- **WHEN** a valid question is sent without optional fields, then with `tokenBudget` `1000`, then with
  `tokenBudget` `32000` and `useCache` `false`, then with `useCache` `true`
- **THEN** all four answer `200`, and the use case received, in order,
  `{ projectId, question }`, `{ projectId, question, tokenBudget: 1000 }`,
  `{ projectId, question, tokenBudget: 32000, useCache: false }` and
  `{ projectId, question, useCache: true }`, where `projectId` is the stored project's id and
  `question` the question exactly as sent

## ADDED Requirements

### Requirement: Ask from the answer cache

The endpoint SHALL answer a question the use case serves from the answer cache (`explain`, "Answer
cache") like any other answer of the use case: `200` with the answered shape, whose `usage` has
`cacheHit` `true`, `costUsd` 0 and `inputTokens` and `outputTokens` 0, or with the `UNKNOWN` shape of a
cached `UNKNOWN`. Because the cache is looked up before any model call, a cached question SHALL answer
`200` also when the daily LLM budget is spent; with `useCache: false`, or for a question that is not
cached, a spent budget SHALL still answer `429` `BUDGET_EXHAUSTED` with `cacheOnly: true` (requirement
"Ask error answers").

#### Scenario: A cached question answers from the cache over the seed

- **GIVEN** acme-shop loaded from `seeds/graph-dump.sql` into Postgres with its history built, its
  answer to `¿Cómo se calcula el precio final de un pedido?` saved in the cache by a first request with
  a live model that answers one statement citing the anchor span and accepts every verification, and
  then a model in evaluation mode that counts its calls
- **WHEN** `POST /api/projects/<acme-shop's id>/ask` is sent
  `{ "question": "COMO SE CALCULA EL PRECIO FINAL DE UN PEDIDO" }`
- **THEN** it answers `200` with the keys `answer`, `statements`, `evidence`, `confidence` and `usage`,
  the `answer`, `statements` and `evidence` of the first response, and `usage.cacheHit` `true`,
  `usage.costUsd` 0, `usage.inputTokens` 0 and `usage.outputTokens` 0
- **AND** the evaluation model received no call, the entry's `hit_count` is 1, and the newest
  `query_log` row of acme-shop has `cache_hit` true

#### Scenario: A spent daily budget still answers a cached question

- **GIVEN** acme-shop loaded from `seeds/graph-dump.sql` into Postgres with its history built, a cache
  entry of acme-shop for the price question holding a valid stored response, the app's clock fixed on
  a UTC day no other suite writes, a `query_log` row of acme-shop dated that day with `cost_usd` 1.5,
  and a live model that counts its calls wrapped by the daily ceiling with `dailyBudgetUsd` 1
- **WHEN** `POST /api/projects/<acme-shop's id>/ask` is sent
  `{ "question": "¿Cómo se calcula el precio final de un pedido?" }`, and then the same body with
  `"useCache": false`
- **THEN** the first answers `200` with `usage.cacheHit` `true`, and the second answers `429` with
  `error.code` `BUDGET_EXHAUSTED` and `error.details.cacheOnly` `true`
- **AND** the model received no call
