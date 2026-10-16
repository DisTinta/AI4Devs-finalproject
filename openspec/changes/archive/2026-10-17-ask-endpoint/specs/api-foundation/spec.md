## MODIFIED Requirements

### Requirement: Single error format

Every error response of the API SHALL have the JSON body `{ "error": { "code", "message", "details" } }`
and no other top-level key, where `code` is a stable string from the table below or, for a domain
error, from the domain error table of the route that raised it (requirement "Domain error mapping"),
`message` is the fixed string of that code, and `details` is always a JSON object (`{}` when there is
nothing to add). The `content-type` of an error response SHALL be `application/json`.

| Situation | Status | `code` | `message` | `details` |
|---|---|---|---|---|
| A request fails its route's schema | 400 | `VALIDATION_ERROR` | `invalid request` | `{ issues }` (see "Request validation by schema") |
| A body that is not valid JSON, or an empty body, under `content-type: application/json` | 400 | `VALIDATION_ERROR` | `invalid request` | `{}` |
| No route matches the method and URL | 404 | `NOT_FOUND` | `route not found` | `{}` |
| The body is larger than the body limit | 413 | `PAYLOAD_TOO_LARGE` | `request body too large` | `{}` |
| The body's content type has no parser | 415 | `UNSUPPORTED_MEDIA_TYPE` | `unsupported media type` | `{}` |
| Any other error carrying a 4xx status (including a 400 or 404 thrown by a route) | that status | `BAD_REQUEST` | `bad request` | `{}` |
| The rate limit is exceeded | 429 | `RATE_LIMITED` | `too many requests` | `{ retryAfterSeconds }` |
| The daily LLM budget is exhausted | 429 | `BUDGET_EXHAUSTED` | `the daily LLM budget is exhausted` | `{ spentUsd, dailyBudgetUsd, resetsAt }` (a route's own table may add fields, never change these) |
| Anything else | 500 | `INTERNAL` | `unexpected error` | `{}` |

An error response MUST NOT contain the message of the error that caused it (unless it is the fixed
message above), a value received in the request, a database URL, a host, a port or a driver message.

#### Scenario: An unknown route answers NOT_FOUND

- **GIVEN** the app built with test doubles
- **WHEN** `GET /api/nope` is sent
- **THEN** the status is `404`, the body is exactly
  `{ "error": { "code": "NOT_FOUND", "message": "route not found", "details": {} } }`, and the
  `content-type` starts with `application/json`

#### Scenario: A body error on a route that does not exist answers NOT_FOUND

- **GIVEN** the app built with test doubles
- **WHEN** `POST /api/nope` is sent the body `{` with `content-type: application/json`, then a JSON body
  of 70 000 bytes, then the body `<q/>` with `content-type: application/xml`
- **THEN** all three answer `404` with body exactly
  `{ "error": { "code": "NOT_FOUND", "message": "route not found", "details": {} } }`, since no route
  matches whatever the body is

#### Scenario: A malformed or empty JSON body answers VALIDATION_ERROR

- **GIVEN** a test route `POST /api/test-only`
- **WHEN** it is sent the body `{` with `content-type: application/json`, then an empty body with the
  same content type
- **THEN** both answer `400` with body exactly
  `{ "error": { "code": "VALIDATION_ERROR", "message": "invalid request", "details": {} } }`

#### Scenario: A body over the limit answers PAYLOAD_TOO_LARGE

- **GIVEN** a test route `POST /api/test-only`
- **WHEN** it is sent the JSON body `{"question":"<'a' × 66 545>"}` (66 560 bytes, over 65 536)
- **THEN** the status is `413` and the body is exactly
  `{ "error": { "code": "PAYLOAD_TOO_LARGE", "message": "request body too large", "details": {} } }`

#### Scenario: An unsupported content type answers UNSUPPORTED_MEDIA_TYPE

- **GIVEN** a test route `POST /api/test-only`
- **WHEN** it is sent the body `<q>hello</q>` with `content-type: application/xml`
- **THEN** the status is `415`, `error.code` is `UNSUPPORTED_MEDIA_TYPE`, `error.message` is
  `unsupported media type` and `error.details` is `{}`

#### Scenario: Another 4xx error answers BAD_REQUEST with its status

- **GIVEN** a test route `GET /api/test-throw` that throws an `Error('teapot at 10.0.0.5')` carrying
  `statusCode` 418
- **WHEN** it is requested
- **THEN** the status is `418`, the body is exactly
  `{ "error": { "code": "BAD_REQUEST", "message": "bad request", "details": {} } }` and does not
  contain `10.0.0.5`

#### Scenario: A 400 that is not a body error answers BAD_REQUEST

- **GIVEN** a test route `GET /api/test-throw` that throws an `Error('bad 10.0.0.5')` carrying
  `statusCode` 400 and no transport error code
- **WHEN** it is requested
- **THEN** the status is `400`, the body is exactly
  `{ "error": { "code": "BAD_REQUEST", "message": "bad request", "details": {} } }` and does not
  contain `10.0.0.5`

#### Scenario: An unexpected error answers INTERNAL without its text

- **GIVEN** a test route `GET /api/test-throw` that throws
  `new Error('connect ECONNREFUSED 10.0.0.5:5432 password=secret')`, as a store failure inside the
  daily budget would
- **WHEN** it is requested
- **THEN** the status is `500`, the body is exactly
  `{ "error": { "code": "INTERNAL", "message": "unexpected error", "details": {} } }`, it contains
  neither `10.0.0.5` nor `secret`, and the `content-type` starts with `application/json`

### Requirement: Domain error mapping

The error handler SHALL map a domain error by its stable `code` through two tables: first the
domain error table of the route that raised it, when that route declares one, then the global table.
The global table maps only `BUDGET_EXHAUSTED`, to `429` with `details` =
`{ spentUsd, dailyBudgetUsd, resetsAt }` (`resetsAt` as an ISO 8601 UTC string), the numbers taken
from the error. A route's table SHALL apply only to the requests of that route, and SHALL build its
details only from the error's fields. A domain error whose code is in neither table SHALL answer
`500` `INTERNAL`. The status, code, message and these three `details` fields of `BUDGET_EXHAUSTED`
are fixed: a route's table may map `BUDGET_EXHAUSTED` only to the same status, code, message and
three fields, plus fields of its own (the route `POST /api/projects/{projectId}/ask` adds
`cacheOnly: true`, capability `http-ask`).

#### Scenario: An exhausted budget answers 429 BUDGET_EXHAUSTED

- **GIVEN** a test route `GET /api/test-throw` that throws a `BudgetExhausted` with `spentUsd` 2.5,
  `dailyBudgetUsd` 2 and `resetsAt` 2026-10-17T00:00:00Z
- **WHEN** it is requested
- **THEN** the status is `429`, the body's only top-level key is `error`, `error.code` is
  `BUDGET_EXHAUSTED`, `error.message` is `the daily LLM budget is exhausted`, and `error.details` is
  exactly `{ "spentUsd": 2.5, "dailyBudgetUsd": 2, "resetsAt": "2026-10-17T00:00:00.000Z" }`

#### Scenario: A domain error without a mapping answers INTERNAL

- **GIVEN** a test route `GET /api/test-throw` that throws a `ProjectNotFound` for a random UUID
- **WHEN** it is requested
- **THEN** the status is `500`, the body is exactly
  `{ "error": { "code": "INTERNAL", "message": "unexpected error", "details": {} } }` and does not
  contain the UUID

#### Scenario: A route's own mapping applies only to that route

- **GIVEN** the app with a test route `GET /api/test-mapped` that declares a domain error table
  mapping `PROJECT_NOT_FOUND` to `404` `project not found` `{}` and `BUDGET_EXHAUSTED` to the global
  answer plus `extra: true`, and the test route `GET /api/test-throw`, both throwing the same
  `ProjectNotFound`, then the same `BudgetExhausted` with `spentUsd` 2.5, `dailyBudgetUsd` 2 and
  `resetsAt` 2026-10-17T00:00:00Z
- **WHEN** each route is requested for each error
- **THEN** `GET /api/test-mapped` answers `404` with the body exactly
  `{ "error": { "code": "PROJECT_NOT_FOUND", "message": "project not found", "details": {} } }`,
  then `429` `BUDGET_EXHAUSTED` with `details` exactly
  `{ "spentUsd": 2.5, "dailyBudgetUsd": 2, "resetsAt": "2026-10-17T00:00:00.000Z", "extra": true }`;
  and `GET /api/test-throw` answers `500` `INTERNAL`, then `429` `BUDGET_EXHAUSTED` with `details`
  exactly `{ "spentUsd": 2.5, "dailyBudgetUsd": 2, "resetsAt": "2026-10-17T00:00:00.000Z" }`

