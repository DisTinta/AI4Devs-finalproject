## Purpose

The HTTP endpoint `POST /api/projects/{projectId}/impact`: it validates a change description for one
indexed project, answers it with the `impact` use case and returns the report in the public format of
`readme.md` §4 (affected components, covering tests, risk level with its rationale, related
documentation and the co-change history per file), or an honest `unknown` with its reason, with every
failure in the API's error format.

## Requirements

### Requirement: Impact request validation

`POST /api/projects/{projectId}/impact` SHALL validate its path parameter and its JSON body before
anything else runs, and a request that fails SHALL answer `400` `VALIDATION_ERROR` as defined by the
`api-foundation` capability ("Request validation by schema"), without any call to the store or to the
use case. The rules, whose limits are those of the `impact` capability ("Impact request validation"):

| Part | Field | Rule |
|---|---|---|
| path | `projectId` | 8-4-4-4-12 hexadecimal digits separated by `-`, any letter case |
| body | `change` | required string of 5 to 500 Unicode code points (an astral character counts as one), not only whitespace, without U+0000 |
| body | `maxHops` | optional integer from 1 to 3; forwarded to the use case only when sent; when absent, the use case's default (2) applies; the OpenAPI document publishes it as `default` |
| body | any other key (`hops` and `projectId` included) | rejected (`unrecognized_keys`) |

No issue and no other part of the response SHALL contain a received value; an `unrecognized_keys`
issue names the undeclared key, never a field's value.

#### Scenario: An invalid change answers VALIDATION_ERROR without a store call

- **GIVEN** the app built with doubles, a stored project, and the store and the use case wrapped by a
  call counter
- **WHEN** `POST /api/projects/{id}/impact` is sent, in turn, `{ "change": "<4 × U+1F600>" }`,
  `{ "change": "<501 × U+1F600>" }`, `{ "change": "       " }`,
  `{ "change": "price\u0000calc" }` and `{}`
- **THEN** each answers `400` with `error.code` `VALIDATION_ERROR`, `error.message`
  `invalid request` and an issue whose `path` is `["change"]`; no response contains `price` or
  `calc`; and the store and the use case received no call

#### Scenario: A change at the length bounds is accepted

- **GIVEN** the app built with doubles and a stored project
- **WHEN** `POST /api/projects/{id}/impact` is sent `{ "change": "<5 × U+1F600>" }` (10 UTF-16 code
  units) and then `{ "change": "<500 × U+1F600>" }` (1 000 UTF-16 code units)
- **THEN** both answer `200`

#### Scenario: An invalid hop limit or an extra key answers VALIDATION_ERROR

- **GIVEN** the app built with doubles, a stored project, and the store and the use case wrapped by a
  call counter
- **WHEN** the change `cambiar los descuentos de DiscountService` is sent, in turn, with `maxHops`
  `0`, `4`, `1.5` and `"2"`, with an extra key `hops` `2`, and with an extra key `projectId` holding a
  stored project's id
- **THEN** each answers `400` `VALIDATION_ERROR` with one issue whose `code` is, in order,
  `too_small`, `too_big`, `invalid_type`, `invalid_type`, `unrecognized_keys` and
  `unrecognized_keys`, no response contains the change text, and the store and the use case received
  no call

#### Scenario: A malformed project id answers VALIDATION_ERROR on impact

- **GIVEN** the app built with doubles and the store wrapped by a call counter
- **WHEN** a valid body is sent to `/api/projects/not-a-uuid/impact`, to `/api/projects/123/impact`
  and to `/api/projects/<a UUID without its dashes>/impact`
- **THEN** each answers `400` `VALIDATION_ERROR` with an issue whose `path` is `["projectId"]`, no
  response contains the id sent, and the store received no call

#### Scenario: The hop limit is forwarded only when sent

- **GIVEN** the app built with doubles, a stored project and a use case that records its requests and
  its options
- **WHEN** the change `cambiar los descuentos de DiscountService` is sent without `maxHops`, then with
  `maxHops` `1`, then with `maxHops` `3`
- **THEN** all three answer `200`, and the use case received, in order,
  `{ projectId, change }`, `{ projectId, change, maxHops: 1 }` and `{ projectId, change, maxHops: 3 }`,
  where `projectId` is the stored project's id and `change` the change exactly as sent, each time
  with the app's clock as its `now` option

### Requirement: Impact project resolution

The endpoint SHALL resolve the project by its id in the store before calling the use case, whatever
the change. A well-formed id that names no project SHALL answer `404` with the body exactly
`{ "error": { "code": "PROJECT_NOT_FOUND", "message": "project not found", "details": {} } }`, without
any call to the use case and without the id in the body. An id that differs from a stored one only in
letter case SHALL resolve that project, and the use case SHALL receive the stored project's id.

#### Scenario: An unknown project answers PROJECT_NOT_FOUND on impact

- **GIVEN** the app built with doubles, a use case that counts its calls, and a random UUID that names
  no stored project
- **WHEN** `POST /api/projects/<that UUID>/impact` is sent
  `{ "change": "cambiar los descuentos de DiscountService" }`, and then
  `{ "change": "<5 × U+1F600>" }` (a change with no search term)
- **THEN** both answer `404` with the body exactly
  `{ "error": { "code": "PROJECT_NOT_FOUND", "message": "project not found", "details": {} } }`,
  neither body contains the UUID, and the use case received no call

#### Scenario: An upper-case project id resolves the same project on impact

- **GIVEN** acme-shop loaded from `seeds/graph-dump.sql` into Postgres
- **WHEN** `POST /api/projects/<acme-shop's id in upper case>/impact` is sent
  `{ "change": "cambiar los descuentos de DiscountService" }`
- **THEN** it answers `200` with `status` `answered` and the same body as the request with the id in
  lower case

### Requirement: Impact answered response

When the use case answers a report, the endpoint SHALL answer `200` with a JSON object whose keys are
exactly `status`, `direct`, `indirect`, `tests`, `docs`, `history` and `risk`:

- `status`: `answered`;
- `direct` and `indirect`: in the use case's order, each entry exactly
  `{ symbol, file, origin, resolution, hops }`, `origin` `graph`, `resolution` `exact` or `heuristic`;
- `tests`: in the use case's order, each entry exactly `{ symbol, file, origin }`, `origin` `graph`;
- `docs`: in the use case's order, each entry exactly `{ path, stale }` when `stale` is `false`, and
  exactly `{ path, stale, staleSince }` when `stale` is `true`, `staleSince` the full sha the use case
  gives;
- `history`: in the use case's order, each entry exactly `{ file, coChangeRate, prs, origin }`, `prs`
  the use case's ascending pull request numbers (possibly empty), `origin` `git`;
- `risk`: exactly `{ level, rationale }`, `level` `HIGH`, `MEDIUM` or `LOW`, `rationale` the use case's
  sentence.

A field that the use case's report, one of its entries or its `risk` carries beyond those listed
SHALL NOT be sent. The body MUST NOT contain `events`, `usage`, `projectId`, the text of the change or any
database id. The endpoint makes no model call.

#### Scenario: Q2 answers only the public fields over the seed

- **GIVEN** acme-shop loaded from `seeds/graph-dump.sql` into Postgres
- **WHEN** `POST /api/projects/<acme-shop's id>/impact` is sent
  `{ "change": "cambiar los descuentos de DiscountService", "maxHops": 2 }`
- **THEN** it answers `200`; the body's keys are exactly `status`, `direct`, `indirect`, `tests`,
  `docs`, `history`, `risk`, with `status` `answered`
- **AND** `direct` holds `DiscountService` with `hops` 0 and `PriceCalculator` with `hops` 1 and
  `resolution` `exact`; `indirect` holds `CheckoutController`, `OrderController`, `RecalculateTotals`
  and `SendOrderConfirmation`, each with `hops` 2 and `resolution` `heuristic`; `tests` holds
  `DiscountServiceTest`, `PriceCalculatorTest` and `OrderPricingTest`; every entry of `direct` and
  `indirect` has exactly the keys `symbol`, `file`, `origin`, `resolution`, `hops`, every entry of
  `tests` exactly `symbol`, `file`, `origin`, and every one of them `origin` `graph`; and no entry
  of `direct`, `indirect` or `tests` has `file` `app/Services/ShippingService.php`
- **AND** `docs` is exactly `[{ "path": "README.md", "stale": false }]`, `history` is exactly
  `[{ "file": "app/Services/ShippingService.php", "coChangeRate": 1, "prs": [24, 33, 55], "origin": "git" }]`,
  and `risk` is exactly `{ "level": "HIGH", "rationale": "10 ficheros afectados, 3 tests que cubren el cambio, 4 elementos directos sin test, 0 elementos directos con cadena solo heurística." }`
- **AND** the body contains no UUID, none of the keys `events`, `usage`, `projectId`, and not the text
  `descuentos`; and acme-shop has one `query_log` row more, with `capability` `impact`

#### Scenario: An answered report over the in-memory subset makes no model call

- **GIVEN** the app built with an in-memory store holding the acme-shop subset, and the store, the
  model and the source tree wrapped by a call counter
- **WHEN** `POST /api/projects/<acme-shop's id>/impact` is sent
  `{ "change": "cambiar los descuentos de DiscountService" }`
- **THEN** it answers `200` with `status` `answered` and the keys `status`, `direct`, `indirect`,
  `tests`, `docs`, `history`, `risk`; the model and the source tree received no call; and the store
  received exactly one `query_log` write

#### Scenario: Fields the use case adds are not sent

- **GIVEN** the app built with doubles, a stored project and a use case that answers a report whose
  entries of `direct`, `indirect`, `tests`, `docs` and `history` and whose `risk` each carry an extra
  key `fileId` holding a UUID, with a top-level `events` holding one `query_not_logged` event and an
  extra top-level key `usage`, one stale document with `staleSince` a 40-character sha and one
  current document, and one `history` entry with `prs` `[]`
- **WHEN** a valid change is sent
- **THEN** it answers `200`; no entry nor `risk` has the key `fileId`, the body has neither `events`
  nor `usage` nor the UUID; the stale document is exactly `{ path, stale: true, staleSince }` with the
  40-character sha unchanged, the current one exactly `{ path, stale: false }`; and the `history`
  entry has `prs` `[]`

### Requirement: Impact unknown response

When the use case answers `unknown`, the endpoint SHALL answer `200` (never an error status) with the
body exactly `{ "status": "unknown", "reason": "no-anchor" }`.

#### Scenario: A change without search terms answers unknown

- **GIVEN** the app built with an in-memory store holding the acme-shop subset
- **WHEN** `POST /api/projects/<acme-shop's id>/impact` is sent `{ "change": "<5 × U+1F600>" }`
- **THEN** it answers `200` with the body exactly `{ "status": "unknown", "reason": "no-anchor" }`

#### Scenario: An unknown report with events sends no events

- **GIVEN** the app built with its log written to a test stream, a stored project and a use case that
  answers
  `{ status: 'unknown', reason: 'no-anchor', events: [{ type: 'query_not_logged', code: 'store-write-failed' }] }`
- **WHEN** a valid change is sent
- **THEN** it answers `200` with the body exactly `{ "status": "unknown", "reason": "no-anchor" }`;
  and one log line carrying the request's `reqId` holds `type` `query_not_logged` and `code`
  `store-write-failed` at level `info` (30)

### Requirement: Impact error answers

The endpoint SHALL answer the domain errors raised while answering with these entries of its own
table (see "Domain error mapping" of `api-foundation`), each in the API's error format with the fixed
message and the details built only from the error's fields:

| Domain error | Status | `code` | `message` | `details` |
|---|---|---|---|---|
| The project does not exist | 404 | `PROJECT_NOT_FOUND` | `project not found` | `{}` |
| The use case rejects the request | 400 | `INVALID_IMPACT_REQUEST` | `invalid request` | `{ field }` |

Any other error, a failure of the store included, SHALL answer `500` `INTERNAL`. The endpoint SHALL
never answer `BUDGET_EXHAUSTED` nor a model error: it makes no model call. The endpoint is limited by
the API's rate limit by IP ("Rate limit by IP" of `api-foundation`).

#### Scenario: Domain errors of the impact use case map to their answers

- **GIVEN** the app built with doubles, a stored project and a use case that rejects, in turn, with
  `InvalidImpactRequest` naming `maxHops` and with `ProjectNotFound`
- **WHEN** a valid change is sent each time
- **THEN** the answers are, in order: `400` with the body exactly
  `{ "error": { "code": "INVALID_IMPACT_REQUEST", "message": "invalid request", "details": { "field": "maxHops" } } }`,
  and `404` with the body exactly
  `{ "error": { "code": "PROJECT_NOT_FOUND", "message": "project not found", "details": {} } }`; no
  body contains the error's own message

#### Scenario: Another error on impact answers INTERNAL

- **GIVEN** the app built with doubles and a stored project, first with a use case that rejects with
  `new Error('pool failed at 10.0.0.5')`, then with core's use case over a store that resolves the
  project and whose traversal read rejects with `new Error('pool failed at 10.0.0.5')`
- **WHEN** a valid change is sent each time
- **THEN** both answer `500` with the body exactly
  `{ "error": { "code": "INTERNAL", "message": "unexpected error", "details": {} } }`, without
  `10.0.0.5`

#### Scenario: The impact route is rate limited

- **GIVEN** the app built with doubles, a stored project, a use case that counts its calls and a
  limit of 2 requests per 60 000 ms
- **WHEN** the IP `10.0.0.1` sends three valid changes
- **THEN** the first two answer `200`, the third answers `429` `RATE_LIMITED`, and the use case was
  called exactly twice

### Requirement: Impact events

The endpoint SHALL write each event of the use case's report (answered or `unknown`) to the request
log, in order, one line per event at level `info` with the event's fields and the request's id. No
log line SHALL contain the text of the change.

#### Scenario: A report's query_not_logged event is logged

- **GIVEN** the app built with its log written to a test stream, a stored project and a use case that
  answers a report with `events: [{ type: 'query_not_logged', code: 'store-write-failed' }]`
- **WHEN** the change `SENTINEL-change-7b2c DiscountService` is sent
- **THEN** it answers `200` without `events` in the body; one log line carrying the request's `reqId`
  holds `type` `query_not_logged` and `code` `store-write-failed` at level `info` (30); and no log line
  contains `SENTINEL-change-7b2c`

### Requirement: Impact in the OpenAPI document

The OpenAPI document of the API SHALL list `POST /api/projects/{projectId}/impact` with the path
parameter `projectId` (required, a string of format `uuid`), the request body generated from its
schema and the `200` response generated from its schema (the `answered` and the `unknown` shapes),
plus the error responses `400`, `404`, `429` and `500` in the error format.

#### Scenario: The document lists impact with its parameter, body and responses

- **GIVEN** the app built with doubles
- **WHEN** `GET /docs/json` is sent
- **THEN** `paths` has `/api/projects/{projectId}/impact` with a `post` operation whose parameters
  include `projectId` in `path`, required, of type `string` and format `uuid`; whose request body
  schema has `required` `["change"]`, `additionalProperties` `false`, `change` of type `string` with
  `minLength` 5 and `maxLength` 500, and `maxHops` of type `integer` with `minimum` 1, `maximum` 3 and
  `default` 2; whose `200` response schema offers two shapes, one with the keys `status`, `direct`,
  `indirect`, `tests`, `docs`, `history`, `risk` and one with the keys `status` and `reason`; and
  whose responses include `400`, `404`, `429` and `500`
