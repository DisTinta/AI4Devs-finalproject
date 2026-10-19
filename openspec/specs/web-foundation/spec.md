# web-foundation Specification

## Purpose
The base every screen of the CODEMIND web client is built on: its routes and the screens shown before
the real ones exist, one typed client of the API with a fixed error model, the same-origin path to the
API in local development, the theme colours and their minimum contrast, and an accessibility gate that
fails CI on the real routes.

## Requirements

### Requirement: Paths of the web client and their screens

The web client SHALL answer three kinds of path:

| Path | Screen | Level-1 heading |
|---|---|---|
| `/` | project selection, Screen 1 (`project-picker`) | «Elige un proyecto para explorar» |
| `/p/{projectId}` | project query, Screen 2 (`ask-page`) | the project's name, or the `projectId` when it is not a sample project |
| any other path | not found | «Página no encontrada» |

Screen 1 and the not-found screen SHALL render a banner landmark with the text «CODEMIND» and the tagline
«Comprensión de repositorios con evidencia verificable», and one main landmark holding the level-1
heading. Screen 2 SHALL render the project bar of `ask-page` as its banner landmark, holding its level-1
heading, and one main landmark. Screen 1 is specified by the `project-picker` capability and Screen 2 by
the `ask-page` capability. The not-found screen SHALL render a link «Volver a la selección de proyecto»
that leads to `/`. Every route SHALL be rendered under the app's error screen (`project-picker`, "App
error screen").

#### Scenario: An unknown path shows the not-found screen and leads back

- **GIVEN** the routes of the web client mounted in a memory router
- **WHEN** the initial path is `/no-existe` and the person activates the link «Volver a la selección de
  proyecto» with a pointer
- **THEN** before the click the level-1 heading is «Página no encontrada» and the banner shows «CODEMIND»
  and «Comprensión de repositorios con evidencia verificable», and after it the level-1 heading is «Elige
  un proyecto para explorar»

#### Scenario: The development server serves the three paths

- **GIVEN** the web client started with its development server
- **WHEN** a browser opens `http://localhost:5173/`, `http://localhost:5173/p/a794456d-6d1b-5b55-a360-13fec83dc7bc`
  and `http://localhost:5173/no-existe`
- **THEN** each one renders its screen of the table above (validated in the manual interface test and in
  `/show-spec-working`, with screenshots saved next to the report)

### Requirement: Health check through the API client

The API client SHALL expose a health check that sends `GET /health` to the same origin as the page (a
relative URL, never a host or port) and resolves with the body `{ status: 'ok' }` of a `2xx` answer. A
`2xx` body whose `status` is not `'ok'` SHALL reject as unavailable. The health check SHALL give up after
a time limit, 5 000 ms unless the caller passes another limit, and then reject as described in
"Unavailable API". A limit that is not a positive finite number, or that is above 2 147 483 647 ms (the
largest delay a timer honours: a longer one fires at once), SHALL make the call reject with a
`RangeError` without sending any request.

#### Scenario: A healthy API resolves the health check

- **GIVEN** the network answers `200` with body `{"status":"ok"}`
- **WHEN** the health check is called
- **THEN** it resolves `{ status: 'ok' }`, and exactly one request was sent, with method `GET` and URL
  `/health`

#### Scenario: A hanging API makes the health check time out

- **GIVEN** a network that never answers, and a clock that the test advances
- **WHEN** the health check is called without passing a limit (the default applies) and the clock advances 4 999 ms, then 1 ms more
- **THEN** the promise is still pending after 4 999 ms; after 5 000 ms it rejects as unavailable, with a
  `cause` named `TimeoutError`, and the signal the request was sent with is aborted

#### Scenario: A caller-chosen limit is honoured

- **GIVEN** a network that never answers, and a clock that the test advances
- **WHEN** the health check is called with a limit of 100 ms and the clock advances 99 ms, then 1 ms more
- **THEN** the promise is still pending after 99 ms and rejects as unavailable after 100 ms

#### Scenario: An invalid limit is refused

- **GIVEN** `fetch` replaced by a recording double
- **WHEN** the health check is called with a limit of `0`, then `-1`, then `NaN`, then `Infinity`, then
  `2147483648`
- **THEN** each call rejects with a `RangeError` and the double recorded no request

### Requirement: Asking a question through the API client

The API client SHALL expose `ask(projectId, body)` that sends `POST /api/projects/{projectId}/ask` to the
same origin, with the `projectId` percent-encoded as one path segment, the header
`content-type: application/json` and the JSON serialisation of `body` (the fields of the API's ask body:
`question`, optional `tokenBudget`, optional `useCache`) as the request body. On a `2xx` answer it SHALL
resolve with the response body unchanged, whether an answered question or an `UNKNOWN`. It SHALL have no
time limit of its own.

#### Scenario: An answered question is resolved as received

- **GIVEN** the network answers `200` with an answered-question body (answer, one statement, one evidence,
  confidence and usage)
- **WHEN** `ask('a794456d-6d1b-5b55-a360-13fec83dc7bc', { question: '¿Qué hace OrderObserver?' })` is called
- **THEN** exactly one request was sent, with method `POST`, URL
  `/api/projects/a794456d-6d1b-5b55-a360-13fec83dc7bc/ask`, header `content-type: application/json` and
  body exactly `{"question":"¿Qué hace OrderObserver?"}`, and the promise resolves to a value deeply equal
  to the received body

#### Scenario: An UNKNOWN is resolved as received

- **GIVEN** the network answers `200` with body
  `{"answer":"UNKNOWN","reason":"no-anchor","statements":[],"evidence":[]}`
- **WHEN** `ask` is called with a valid project id and question
- **THEN** the promise resolves to a value deeply equal to that body, not an error

#### Scenario: A question has no time limit of its own

- **GIVEN** a network that never answers, and a clock that the test advances
- **WHEN** `ask` is called without a caller signal and the clock advances 60 000 ms
- **THEN** the promise is still pending and the signal the request was sent with, if any, is not aborted

#### Scenario: The project id is encoded as one path segment

- **GIVEN** the network answers `200` with an `UNKNOWN` body
- **WHEN** `ask('a/b?c', { question: 'hola mundo' })` is called
- **THEN** the request URL is `/api/projects/a%2Fb%3Fc/ask`

### Requirement: API errors

When the API answers with a status of `400` or more and a JSON body in its single error format (`{ error:
{ code, message, details } }` with `code` and `message` strings and `details` an object), the client
SHALL reject with an API error that carries the response `status` and the `code`, `message` and
`details` of the body unchanged. The API error SHALL be distinguishable from an unavailable API by type.

#### Scenario: The error format becomes an API error

- **GIVEN** the network answers, one call each:
  `404` `{"error":{"code":"PROJECT_NOT_FOUND","message":"project not found","details":{}}}`,
  `400` `{"error":{"code":"VALIDATION_ERROR","message":"invalid request","details":{"issues":[]}}}` and
  `429` `{"error":{"code":"RATE_LIMITED","message":"too many requests","details":{"retryAfterSeconds":30}}}`
- **WHEN** `ask` is called for each
- **THEN** each promise rejects with an API error whose `status`, `code`, `message` and `details` are those
  of its answer (`details.retryAfterSeconds` is `30` for the third), and none of them is an unavailable-API
  error

### Requirement: Unavailable API

The client SHALL reject with an unavailable-API error, which keeps the original failure as its `cause`,
when: the request itself fails (network down, connection refused); the response body is not JSON; a
`2xx` body is not a JSON object (`null` and arrays included); a health body whose `status` is not `'ok'`;
a body of a status `400` or more is not in the single error format (for example the empty `500` the
development proxy answers while the API is stopped, or an HTML `502`); or the health check exceeds its
time limit. When a response arrived, the unavailable-API error SHALL carry its `status`. The
unavailable-API error SHALL be distinguishable from an API error by type.

#### Scenario: Failures that are not the API's answer become unavailable-API errors

- **GIVEN** seven calls where the network, in turn: rejects with a `TypeError`; answers `500` with an empty
  body; answers `502` with an HTML body; answers `200` with a body that is not JSON; answers `200` with the
  body `null`; answers `200` with the body `[]`; answers `200` with the body `{"status":"down"}`
- **WHEN** the health check is called for each, and `ask` is called three times more: with a network that
  rejects with a `TypeError`; with a network that answers `500` with the JSON body
  `{"statusCode":500,"error":"Internal Server Error","message":"boom"}`; with a network that answers `400`
  with `{"error":{"code":"VALIDATION_ERROR","message":"invalid request","details":[]}}`
- **THEN** each of the ten promises rejects with an unavailable-API error whose `cause` is set, and none of
  them is an API error; the `cause` of both `TypeError` cases is the `TypeError` itself; the `cause` of the
  empty and HTML bodies and of the non-JSON `200` is a `SyntaxError`; the `cause` of the two JSON bodies
  not in the error format is an `Error` with message `unexpected response 500` and `unexpected response
  400`; the errors of the `500`, `502`, `500` and `400` calls carry that `status`

### Requirement: Cancellation by the caller

Both client calls SHALL accept an abort signal from the caller and pass a signal to the network request
that aborts when the caller's signal aborts. A call cancelled by its caller SHALL reject with the reason
of the caller's signal, neither an API error nor an unavailable-API error, so the screen can ignore it;
this holds while the request is pending and while the response body is being read. A signal already
aborted when the call starts SHALL make the call reject with its reason without sending any request.

#### Scenario: Aborting a pending question cancels the request

- **GIVEN** a network that answers only when its request signal aborts (it then rejects with that signal's
  reason)
- **WHEN** `ask` is called with a caller signal and the caller aborts it
- **THEN** the request signal is aborted, and the promise rejects with an error named `AbortError` that is
  neither an API error nor an unavailable-API error

#### Scenario: Aborting a pending health check cancels the request

- **GIVEN** a network that answers only when its request signal aborts, and a clock that the test advances
- **WHEN** the health check is called with a caller signal, the clock advances 4 000 ms and the caller
  aborts
- **THEN** the request signal is aborted, and the promise rejects with an error named `AbortError` that is
  neither an API error nor an unavailable-API error

#### Scenario: Aborting while the body is read rejects with the caller's reason

- **GIVEN** a network that answers `200` with a body whose reading rejects once the caller's signal aborts
- **WHEN** `ask`, then the health check, are called with a caller signal and the caller aborts while the
  body is being read
- **THEN** both promises reject with an error named `AbortError`, not an unavailable-API error

#### Scenario: An already-aborted signal sends no request

- **GIVEN** `fetch` replaced by a recording double and a caller signal that is already aborted
- **WHEN** the health check is called with it, then `ask` is called with it
- **THEN** both reject with an error named `AbortError` and the double recorded no request

### Requirement: API types follow the API's schemas

The types of the client for the health body, the ask body, the ask response (answered question or
`UNKNOWN`) and the error body SHALL be declared once in the client and SHALL be equal to the types the
API derives from its own schemas. A divergence SHALL make the project's type check (`npm run typecheck`)
fail. The web client SHALL NOT import the API package at build or run time.

#### Scenario: A drift between the client types and the API schemas fails the type check

- **GIVEN** the contract test that compares each client type with the API type of the same body
- **WHEN** `npm run typecheck` runs on the change as delivered
- **THEN** it passes, and the contract test's negative control (a copy of the client's ask body with
  `question` renamed, compared with the API type under an expected-error marker) proves the comparison
  rejects a drift: if the comparison ever accepted it, the unused marker would fail the type check

#### Scenario: The web does not import the API or the backend

- **GIVEN** the architecture rules checked by `npm run lint:architecture`
- **WHEN** they run on the change as delivered, and on a probe file under `packages/web/src/` that imports
  `packages/api/src/schemas/common.ts` (created once during the implementation, not committed)
- **THEN** the first run passes, and the probe makes it fail with the web-isolation rule

### Requirement: Same-origin access to the API in local development

The development server and the preview server of the web client SHALL forward every request whose path
starts with `/api` or with `/health` (the servers match a forwarded path by its prefix) to the API at
`http://127.0.0.1:3000`, so the page calls the API from
its own origin and the API needs no CORS. No base URL of the API SHALL be configured through an
environment variable shipped to the browser.

#### Scenario: Both servers forward the API paths

- **GIVEN** the configuration of the web client's development and preview servers
- **WHEN** its forwarding table is read
- **THEN** both servers forward `/api` and `/health` to `http://127.0.0.1:3000`

#### Scenario: The health check reaches the API through the development server

- **GIVEN** the API listening on `127.0.0.1:3000` and the web development server on `5173`
- **WHEN** `GET http://localhost:5173/health` is sent, then sent again with the API stopped
- **THEN** the first answers `200` with body `{"status":"ok"}`; the second does not answer with the API's
  body, and the health check called from the page in that state rejects as unavailable (validated in the
  manual interface test)

### Requirement: Theme colours and minimum contrast

The theme of the web client SHALL take its colours, font family and radii from the wireframes of
`readme.md` §1.3, and every text/background pair of the following table SHALL have a contrast ratio of at
least 4.5:1 computed with the WCAG 2.2 formula:

| Text | Background | Use |
|---|---|---|
| `#212529` | `#ffffff` | body text on a card or container |
| `#212529` | `#f8f9fa` | body text on the page background |
| `#495057` | `#ffffff` | secondary text on a card |
| `#495057` | `#f8f9fa` | secondary text on the page background |
| `#6c757d` | `#ffffff` | tertiary text, only on white |
| `#ffffff` | `#212529` | header title |
| `#adb5bd` | `#212529` | header tagline |
| `#1971c2` | `#ffffff` | links and blue text |
| `#1971c2` | `#f8f9fa` | links on the page background |
| `#ffffff` | `#1971c2` | primary button |
| `#1971c2` | `#e7f5ff` | blue badge |
| `#1e6f31` | `#d3f9d8` | «indexado» badge |
| `#5c3d00` | `#fff9db` | warning text and icon |

The font family SHALL be `'Segoe UI', system-ui, sans-serif`, the card radius `8px` and the button
radius `4px`. The wireframe colours `#4dabf7` and `#74c0fc` SHALL be used only as decoration, never as a
text colour.

#### Scenario: Every declared text pair meets 4.5:1

- **GIVEN** the theme file of the web client
- **WHEN** the theme test reads the tokens declared in it and computes the ratio of every pair of the table
- **THEN** every pair resolves to the colours of the table and has a ratio of at least 4.5:1, and the font
  family, card radius and button radius tokens have the values above

#### Scenario: Wireframe accent colours are never text

- **GIVEN** every file under `packages/web/src/` except the theme file and the test files (`*.test.ts`,
  `*.test.tsx`, which hold those values on purpose)
- **WHEN** the theme test searches them for the text utilities of the decorative tokens (`text-stripe`,
  `text-stripe-soft`) and for the values `#4dabf7` and `#74c0fc`
- **THEN** none is found

#### Scenario: A token changed to a low-contrast value fails the theme test

- **GIVEN** the contrast check used by the theme test
- **WHEN** it is given the pair `#4dabf7` on `#ffffff` (the wireframe's button colour)
- **THEN** it reports a ratio under 4.5:1 and the pair as failing

### Requirement: Accessibility gate on the real routes

`npm run test:a11y` (root) SHALL run the accessibility tests under `tests/a11y/`, which render the routes
of the web client, not a placeholder of the kit, at `/`, at `/p/a794456d-6d1b-5b55-a360-13fec83dc7bc` and
at an unknown path, inside a document with `lang="es"` and a title, and SHALL fail when `axe-core` reports
any violation on any of them. A negative control SHALL prove that axe really runs in that environment.
The kit scaffold `tests/a11y/smoke.example.tsx` SHALL no longer exist, and the frontend CI workflow SHALL
run the script instead of printing that it is missing.

#### Scenario: The three routes have no axe violations

- **GIVEN** the routes of the web client rendered in a memory router at each of the three paths
- **WHEN** `axe-core` runs over the whole document
- **THEN** it reports zero violations for each path

#### Scenario: The negative control proves axe runs

- **GIVEN** a document holding an image without alternative text
- **WHEN** `axe-core` runs over it in the same environment
- **THEN** it reports at least one violation, with rule id `image-alt`

#### Scenario: The gate runs in CI instead of warning

- **GIVEN** the root `package.json` and the frontend CI workflow
- **WHEN** `npm run test:a11y` runs locally and the workflow runs on the pull request
- **THEN** the script exists and runs the files of `tests/a11y/`, the kit scaffold is gone, and the
  workflow's accessibility step runs the tests without printing the "not defined" warning and has no
  branch that skips them when the script is missing (a missing script fails the job)

### Requirement: Component test environment

Test files of the web client whose name ends in `.test.tsx` under `packages/web/src/`, and every test
file under `tests/a11y/`, SHALL run with a DOM (jsdom); every other test file SHALL keep running in Node.
Each test that renders SHALL start from an empty document body, whatever the previous test rendered.
Navigating between routes in a rendered test SHALL work in that environment (a link click changes the
rendered route).

#### Scenario: Rendered output does not leak between tests

- **GIVEN** two tests in the same component test file, the first rendering the not-found screen
- **WHEN** the second runs and renders Screen 1
- **THEN** exactly one level-1 heading is found in the document, «Elige un proyecto para explorar»
