## Purpose

The HTTP base every business endpoint of the API is built on: one error format with stable codes,
schema validation and response serialisation, the OpenAPI document at `/docs`, rate limiting by IP,
the liveness route, and the composition and validation of the environment at start-up.

## Requirements

### Requirement: Single error format

Every error response of the API SHALL have the JSON body `{ "error": { "code", "message", "details" } }`
and no other top-level key, where `code` is a stable string from the table below, `message` is the
fixed string of that code, and `details` is always a JSON object (`{}` when there is nothing to add).
The `content-type` of an error response SHALL be `application/json`.

| Situation | Status | `code` | `message` | `details` |
|---|---|---|---|---|
| A request fails its route's schema | 400 | `VALIDATION_ERROR` | `invalid request` | `{ issues }` (see "Request validation by schema") |
| A body that is not valid JSON, or an empty body, under `content-type: application/json` | 400 | `VALIDATION_ERROR` | `invalid request` | `{}` |
| No route matches the method and URL | 404 | `NOT_FOUND` | `route not found` | `{}` |
| The body is larger than the body limit | 413 | `PAYLOAD_TOO_LARGE` | `request body too large` | `{}` |
| The body's content type has no parser | 415 | `UNSUPPORTED_MEDIA_TYPE` | `unsupported media type` | `{}` |
| Any other error carrying a 4xx status (including a 400 or 404 thrown by a route) | that status | `BAD_REQUEST` | `bad request` | `{}` |
| The rate limit is exceeded | 429 | `RATE_LIMITED` | `too many requests` | `{ retryAfterSeconds }` |
| The daily LLM budget is exhausted | 429 | `BUDGET_EXHAUSTED` | `the daily LLM budget is exhausted` | `{ spentUsd, dailyBudgetUsd, resetsAt }` |
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

### Requirement: Request validation by schema

Every route that declares a schema for its body, query string or path parameters SHALL validate the
request against it before its handler runs; a request that fails SHALL answer `400` with
`VALIDATION_ERROR`, and the handler MUST NOT run. `details` SHALL be `{ "issues": [...] }`, one entry
per schema issue in the schema's order, each exactly `{ "path", "code", "message" }`: `path` the array
of keys and indexes to the offending field (relative to the validated part), `code` the issue code of
the schema language (e.g. `too_small`, `unrecognized_keys`, `invalid_type`) and `message` its text.
No issue SHALL carry the received value. A request body schema SHALL reject keys it does not declare
(`unrecognized_keys`).

#### Scenario: A field that fails its rule answers VALIDATION_ERROR with its issue

- **GIVEN** a test route `POST /api/test-only` whose body is an object with exactly one key `question`,
  a string of at least 5 characters
- **WHEN** it is sent `{ "question": "abc" }`
- **THEN** the status is `400`, `error.code` is `VALIDATION_ERROR`, `error.message` is
  `invalid request`, `error.details.issues` has one entry whose `path` is `["question"]`, whose `code`
  is `too_small` and whose `message` is a non-empty string, the entry has no other key, the response
  body does not contain `abc`, and the handler was not called

#### Scenario: An undeclared key answers VALIDATION_ERROR

- **GIVEN** the same test route
- **WHEN** it is sent `{ "question": "hello", "x": 1 }`
- **THEN** the status is `400`, `error.code` is `VALIDATION_ERROR` and an issue has `code`
  `unrecognized_keys`

#### Scenario: A query string that fails its schema answers VALIDATION_ERROR

- **GIVEN** a test route `GET /api/test-query` whose query string is an object with exactly one key
  `n`, an integer of at least 1 coerced from its text
- **WHEN** it is requested with `?n=0`
- **THEN** the status is `400`, `error.code` is `VALIDATION_ERROR`, `error.details.issues` has one
  entry whose `path` is `["n"]` and whose `code` is `too_small`, and the handler was not called

### Requirement: Response serialisation by schema

A route that declares a response schema for a status SHALL send only the fields that schema declares:
fields the handler returns beyond them are dropped. A handler result that does not satisfy its
response schema SHALL answer `500` `INTERNAL`.

#### Scenario: Undeclared response fields are dropped

- **GIVEN** a test route `POST /api/test-only` whose `200` response is an object with one string field
  `answer`, and whose handler returns `{ "answer": "ok", "provenance": "x" }`
- **WHEN** it is sent `{ "question": "hello" }`
- **THEN** the status is `200` and the body is exactly `{ "answer": "ok" }`

#### Scenario: A result that breaks its response schema answers INTERNAL

- **GIVEN** the same test route whose handler returns `{ "answer": 42 }`
- **WHEN** it is sent `{ "question": "hello" }`
- **THEN** the status is `500` and the body is exactly
  `{ "error": { "code": "INTERNAL", "message": "unexpected error", "details": {} } }`

### Requirement: Domain error mapping

The error handler SHALL map a domain error by its stable `code` through one table. This capability
maps only `BUDGET_EXHAUSTED`, to `429` with `details` = `{ spentUsd, dailyBudgetUsd, resetsAt }`
(`resetsAt` as an ISO 8601 UTC string), the numbers taken from the error. A domain error whose code is
not in the table SHALL answer `500` `INTERNAL`. The status, code, message and these three `details`
fields are fixed here; the route that serves cached answers (DIS-78, `POST /ask`) may add to
`details` the notice that cached answers are still served (DIS-59), without changing them.

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

### Requirement: Liveness route

`GET /health` SHALL answer `200` with the body exactly `{ "status": "ok" }`. It is a liveness check:
it MUST NOT read the store, the model or the source tree.

#### Scenario: Health answers ok without touching the store

- **GIVEN** the app built with store, model and source-tree doubles that count every method call
- **WHEN** `GET /health` is sent
- **THEN** the status is `200`, the body is exactly `{ "status": "ok" }` and none of the three doubles
  recorded a call

### Requirement: OpenAPI document at /docs

The API SHALL serve an OpenAPI `3.0.3` document generated from the schemas of its routes at
`GET /docs/json`, and an interactive HTML viewer of it at `GET /docs`. The document SHALL have
`info.title` `CODEMIND API`, `info.version` `1.0.0`, one server `http://localhost:3000`, and
`components.schemas.Error` describing the error format (an object with an `error` object whose
properties are `code` and `message`, strings, and `details`, an object). Every route with a schema
SHALL appear under `paths` with its request schema converted to JSON Schema; the `/docs` routes
themselves SHALL NOT appear.

#### Scenario: The document lists health, the error schema and a route's body schema

- **GIVEN** the app with the test route `POST /api/test-only` registered before it is ready
- **WHEN** `GET /docs/json` is sent
- **THEN** the status is `200`, `openapi` is `3.0.3`, `info.title` is `CODEMIND API`, `info.version`
  is `1.0.0`, `servers[0].url` is `http://localhost:3000`, `paths` has `/health` and
  `/api/test-only`, no path starts with `/docs`, the request body schema of `POST /api/test-only` has
  a `question` property of type `string` with `minLength` 5, and `components.schemas.Error` has the
  properties `error.code`, `error.message` and `error.details`

#### Scenario: The viewer is served as HTML

- **GIVEN** the app built with test doubles
- **WHEN** `GET /docs` is sent, following at most one redirect
- **THEN** the final status is `200` and its `content-type` starts with `text/html`

### Requirement: Rate limit by IP

The API SHALL count the requests of each client IP address (the socket's remote address; forwarding
headers such as `X-Forwarded-For` MUST NOT change it) within a window of the configured length, and SHALL answer every
request beyond the limit within the window with `429` `RATE_LIMITED`, `details.retryAfterSeconds` (the
whole seconds until the window resets, at least 1) and a `Retry-After` header with the same value,
without running the handler. Every request to a limited route counts, whatever its result.
`/health` and every path under `/docs` are neither limited nor counted, and neither is a request that
matches no route. The limit and the window come from the configuration (default 30 requests per
60 000 ms). A response of a limited route MAY carry the informational headers `x-ratelimit-limit`,
`x-ratelimit-remaining` and `x-ratelimit-reset`; they hold only counts and seconds, never a request
value.

#### Scenario: The request beyond the limit answers RATE_LIMITED

- **GIVEN** the app built with a limit of 2 requests per 60 000 ms and the test route
  `POST /api/test-only`
- **WHEN** the IP `10.0.0.1` sends three valid requests to it
- **THEN** the first two answer `200` and the third answers `429` with `error.code` `RATE_LIMITED`,
  `error.message` `too many requests`, `error.details.retryAfterSeconds` an integer greater than 0,
  a `Retry-After` header equal to it, and the handler ran exactly twice

#### Scenario: The limit is per IP and ignores forwarding headers

- **GIVEN** the same app after the IP `10.0.0.1` exhausted its limit
- **WHEN** the same request is sent from `10.0.0.2`, then from `10.0.0.1` with
  `X-Forwarded-For: 10.0.0.9`
- **THEN** the first answers `200` and the second `429` `RATE_LIMITED`

#### Scenario: Health and the documentation are not limited

- **GIVEN** the same app after the IP `10.0.0.1` exhausted its limit
- **WHEN** that IP sends five `GET /health` and five `GET /docs/json`
- **THEN** all ten answer `200`

#### Scenario: A request that matches no route is not counted

- **GIVEN** the app built with a limit of 2 requests per 60 000 ms and the test route
  `POST /api/test-only`
- **WHEN** the IP `10.0.0.1` sends five `GET /api/nope`, then two valid `POST /api/test-only`
- **THEN** the five answer `404` `NOT_FOUND` and the two answer `200`

#### Scenario: Rejected requests count towards the limit

- **GIVEN** the app built with a limit of 2 requests per 60 000 ms and the test route
  `POST /api/test-only`
- **WHEN** the IP `10.0.0.1` sends `{ "question": "abc" }` twice, then a valid request
- **THEN** the first two answer `400` `VALIDATION_ERROR` and the third `429` `RATE_LIMITED`

### Requirement: Request body limit and logging

The API SHALL reject a request body larger than 64 KiB (65 536 bytes) with `413`
`PAYLOAD_TOO_LARGE` (see "Single error format"). Its request log SHALL record, per request, the
method, the URL, the status and the response time (besides the `host` header, the client address
and port), and MUST NOT record the request body or any other header. An error answered with `500` SHALL be logged at level `error` with the original error; the
response still never carries it.

#### Scenario: The request log holds no body and a 500 logs its cause

- **GIVEN** the app built with its log written to a test stream, a test route `POST /api/test-only`
  and a test route `GET /api/test-throw` that throws `new Error('boom-7f3a')`
- **WHEN** `POST /api/test-only` is sent `{ "question": "SENTINEL-question-91b2" }` with the header
  `authorization: Bearer SENTINEL-hdr-55e1`, then `GET /api/test-throw` is sent
- **THEN** no log line contains `SENTINEL-question-91b2` or `SENTINEL-hdr-55e1`, the log lines sharing
  one `reqId` record `POST`, `/api/test-only` and status `200`, the `request completed` line of that
  `reqId` has a numeric `responseTime`, no log line has a `version` field, and one log line at level
  `error` contains `boom-7f3a`

### Requirement: Configuration from the environment

The API SHALL read its configuration once, at start-up, only from these variables, each trimmed; a
variable that is unset or empty after trimming takes its default:

| Variable | Rule | Default |
|---|---|---|
| `DATABASE_URL` | required, non-empty | — |
| `PORT` | decimal digits only, 1–65 535 | `3000` |
| `HOST` | any non-empty string | `127.0.0.1` |
| `RATE_LIMIT_MAX` | decimal digits only, 1–1 000 000 | `30` |
| `RATE_LIMIT_WINDOW_MS` | decimal digits only, 1–86 400 000 | `60000` |

It SHALL check them in that order and fail on the first invalid one with an error whose `code` is
`INVALID_CONFIG` (one code for missing and invalid, as `LLM_CONFIG_INVALID` does), whose `variable`
names it and whose message is `<VARIABLE> is missing or invalid; see .env.example`, never holding its
value; the start-up line carries that name as `details.variable` (requirement "Start-up failure"). It
SHALL then read the LLM configuration (`LLM_*`, `DAILY_BUDGET_USD`) with the rules of the
`llm-adapter` capability, failing with `LLM_CONFIG_INVALID`. Every check SHALL happen before any
connection is opened.

#### Scenario: Defaults apply to unset and empty variables

- **GIVEN** an environment with only `DATABASE_URL` set, then the same with `PORT`, `HOST`,
  `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW_MS` set to `'  '`
- **WHEN** the configuration is read
- **THEN** both give port 3000, host `127.0.0.1`, a limit of 30 and a window of 60 000 ms

#### Scenario: An invalid variable fails with its name and without its value

- **GIVEN** an otherwise valid environment with, in turn, `DATABASE_URL` unset, `DATABASE_URL` = `'  '`,
  `PORT` = `70000`, `PORT` = `0`, `PORT` = `3e3`, `RATE_LIMIT_MAX` = `0`, `RATE_LIMIT_MAX` = `abc`,
  `RATE_LIMIT_MAX` = `1000001`, `RATE_LIMIT_WINDOW_MS` = `0`, `RATE_LIMIT_WINDOW_MS` = `1m`,
  `RATE_LIMIT_WINDOW_MS` = `86400001`
- **WHEN** the configuration is read
- **THEN** each fails with an error whose `code` is `INVALID_CONFIG` and whose `variable` is that
  variable, and its message does not contain the value

### Requirement: Composition from the environment

The composition SHALL build, from a valid configuration, the API's dependencies: the store on
`DATABASE_URL` (through "Opening a pooled store from a URL" of `graph-store`, with the application
name `codemind-api`), the model for the configured mode, the source tree reader, the clock and the
repository root. In live mode with `DAILY_BUDGET_USD` set, every model call SHALL go through the daily
spend ceiling over that store and clock; in evaluation mode, or without a ceiling, the model SHALL be
used as built. A configuration or LLM configuration error SHALL be raised before the store is opened.
Closing the API SHALL close the store's connections.

#### Scenario: Configuration errors are raised before the store is opened

- **GIVEN** `DATABASE_URL` unset; then a valid `DATABASE_URL` with `LLM_API_KEY` set and
  `LLM_BASE_URL` unset
- **WHEN** the dependencies are composed with an `openStore` seam that records its calls
- **THEN** the first fails with an error whose `code` is `INVALID_CONFIG` and whose `variable` is
  `DATABASE_URL`, the second with an `LlmConfigError` (`code` `LLM_CONFIG_INVALID`) whose `variable`
  is `LLM_BASE_URL`, and `openStore` was never called

#### Scenario: Evaluation mode uses the model as built

- **GIVEN** a valid `DATABASE_URL` and no `LLM_*` variable
- **WHEN** the dependencies are composed with a `createLlm` seam returning a given model double
- **THEN** `createLlm` received a configuration in evaluation mode and the composed model is that
  same double

#### Scenario: A daily budget stops the model call

- **GIVEN** a live configuration (`LLM_BASE_URL` http, every model variable priced in the cost table)
  with `DAILY_BUDGET_USD=1`, and an `openStore` seam whose store reports a spend of 1 USD since
  00:00 UTC
- **WHEN** the composed model is asked to complete a prompt
- **THEN** it rejects with `BudgetExhausted` and the model double built by `createLlm` was not called;
  and with the same configuration without `DAILY_BUDGET_USD`, the model double is called once

#### Scenario: The API answers on its address and closes its connections

- **GIVEN** a reachable, migrated database, `DATABASE_URL` pointing to it, `HOST` = `127.0.0.1` and a
  free `PORT`
- **WHEN** the API is started from that environment, `GET /health` is sent over HTTP to that address,
  and the API is closed
- **THEN** the request answers `200` `{ "status": "ok" }` and, once closed, the database holds no
  session with the application name `codemind-api` (polled for up to 2 s)

#### Scenario: The composed repository root is the repository's top directory

- **GIVEN** a valid `DATABASE_URL`, no `LLM_*` variable and an `openStore` seam returning a store
  double
- **WHEN** the dependencies are composed
- **THEN** `workspaceRoot` is an absolute path and `packages/api/package.json` exists under it

### Requirement: Start-up failure

When the API process cannot start, it SHALL write exactly one line to stderr,
`{"error":{"code","message","details"}}`, and exit with code `1`:

| Cause | `code` | `message` | `details` |
|---|---|---|---|
| Invalid configuration | `INVALID_CONFIG` | `<VARIABLE> is missing or invalid; see .env.example` | `{ variable }` |
| Invalid LLM configuration | `LLM_CONFIG_INVALID` | `<variable> is missing or invalid; see .env.example`, or `<variable> is set but <modelVariable> has no price in COST_TABLE; see .env.example` when a model variable is at fault | `{ variable }`, plus `modelVariable` when a model variable is at fault |
| The database does not accept a connection | `DATABASE_UNAVAILABLE` | `cannot connect to the database` | `{}` |
| Anything else (e.g. the address is in use) | `STARTUP_FAILED` | `the API could not start` | `{ systemCode }` when the error's `code` is a system code (`E` followed by capital letters only, such as `EADDRINUSE`), else `{}` |

A start-up failure raised after the store was opened (for example, the address is in use) SHALL
close the store's connections before the process exits. The line MUST NOT contain the value of any
variable, the database URL, its credentials or
`LLM_API_KEY`.

#### Scenario: A missing DATABASE_URL stops the process with one line

- **GIVEN** an environment without `DATABASE_URL` and with `LLM_API_KEY` set to the sentinel `SENTINEL-key-3c9d`
- **WHEN** the API process is started
- **THEN** it exits with code `1`, stderr holds exactly one line, that line parses as
  `{ "error": { "code": "INVALID_CONFIG", "message": "DATABASE_URL is missing or invalid; see .env.example", "details": { "variable": "DATABASE_URL" } } }`,
  and no output contains `SENTINEL-key-3c9d`

#### Scenario: Start-up errors map to their line

- **GIVEN** the start-up errors `INVALID_CONFIG` for `PORT`, an LLM configuration error for
  `LLM_BASE_URL`, an LLM configuration error for `DAILY_BUDGET_USD` with the model variable
  `LLM_MODEL`, a `DatabaseUnavailable` of the store adapter, a listen error with system code
  `EADDRINUSE`, and an `Error` without a `code`
- **WHEN** each is turned into its start-up line
- **THEN** they give, in order: `INVALID_CONFIG`, `PORT is missing or invalid; see .env.example`,
  `{ "variable": "PORT" }`; `LLM_CONFIG_INVALID`, `LLM_BASE_URL is missing or invalid; see
  .env.example`, `{ "variable": "LLM_BASE_URL" }`; `LLM_CONFIG_INVALID`, `DAILY_BUDGET_USD is set but
  LLM_MODEL has no price in COST_TABLE; see .env.example`, `{ "variable": "DAILY_BUDGET_USD",
  "modelVariable": "LLM_MODEL" }`; `DATABASE_UNAVAILABLE`, `cannot connect to the database`, `{}`;
  `STARTUP_FAILED`, `the API could not start`, `{ "systemCode": "EADDRINUSE" }`; `STARTUP_FAILED`,
  `the API could not start`, `{}`

#### Scenario: A listen failure closes the store

- **GIVEN** a reachable, migrated database, `DATABASE_URL` pointing to it, `HOST` = `127.0.0.1` and a
  `PORT` already in use
- **WHEN** the API is started from that environment
- **THEN** it rejects with an error whose `code` is `EADDRINUSE`, and the database holds no session
  with the application name `codemind-api` (polled for up to 2 s)
