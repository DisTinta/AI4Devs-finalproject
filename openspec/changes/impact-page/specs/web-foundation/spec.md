## MODIFIED Requirements

### Requirement: Paths of the web client and their screens

The web client SHALL answer four kinds of path:

| Path | Screen | Level-1 heading |
|---|---|---|
| `/` | project selection, Screen 1 (`project-picker`) | «Elige un proyecto para explorar» |
| `/p/{projectId}` | project query, Screen 2 (`ask-page`) | the project's name, or the `projectId` when it is not a sample project |
| `/p/{projectId}/impact` | impact of a change, Screen 3 (`impact-page`) | the project's name, or the `projectId` when it is not a sample project |
| any other path | not found | «Página no encontrada» |

Screen 1 and the not-found screen SHALL render a banner landmark with the text «CODEMIND» and the tagline
«Comprensión de repositorios con evidencia verificable», and one main landmark holding the level-1
heading. Screen 2 and Screen 3 SHALL render the project bar of `ask-page` as their banner landmark,
holding their level-1 heading, and one main landmark. Screen 1 is specified by the `project-picker`
capability, Screen 2 by the `ask-page` capability and Screen 3 by the `impact-page` capability. The
not-found screen SHALL render a link «Volver a la selección de proyecto» that leads to `/`. Every route
SHALL be rendered under the app's error screen (`project-picker`, "App error screen").

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

#### Scenario: The development server serves Screen 3

- **GIVEN** the web client started with its development server
- **WHEN** a browser opens `http://localhost:5173/p/a794456d-6d1b-5b55-a360-13fec83dc7bc/impact`
- **THEN** it renders Screen 3 of acme-shop, with the level-1 heading «acme-shop» and the field «Cambio»
  (validated in the manual interface test and in `/show-spec-working`, with screenshots saved next to the
  report)

### Requirement: Cancellation by the caller

Every client call (the health check, `ask` and `impact`) SHALL accept an abort signal from the caller and
pass a signal to the network request that aborts when the caller's signal aborts. A call cancelled by its
caller SHALL reject with the reason of the caller's signal, neither an API error nor an unavailable-API
error, so the screen can ignore it; this holds while the request is pending and while the response body is
being read. A signal already aborted when the call starts SHALL make the call reject with its reason
without sending any request.

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
`UNKNOWN`), the impact body, the impact response (answered report or `unknown`) and the error body SHALL be
declared once in the client and SHALL be equal to the types the API derives from its own schemas. A
divergence SHALL make the project's type check (`npm run typecheck`) fail. The web client SHALL NOT import
the API package at build or run time.

#### Scenario: A drift between the client types and the API schemas fails the type check

- **GIVEN** the contract test that compares each client type with the API type of the same body
- **WHEN** `npm run typecheck` runs on the change as delivered
- **THEN** it passes, and the contract test's negative controls (a copy of the client's ask body with
  `question` renamed, and a copy of the client's impact body with `change` renamed, each compared with the
  API type under an expected-error marker) prove the comparison rejects a drift: if the comparison ever
  accepted one, its unused marker would fail the type check

#### Scenario: The web does not import the API or the backend

- **GIVEN** the architecture rules checked by `npm run lint:architecture`
- **WHEN** they run on the change as delivered, and on a probe file under `packages/web/src/` that imports
  `packages/api/src/schemas/common.ts` (created once during the implementation, not committed)
- **THEN** the first run passes, and the probe makes it fail with the web-isolation rule

### Requirement: Accessibility gate on the real routes

`npm run test:a11y` (root) SHALL run the accessibility tests under `tests/a11y/`, which render the routes
of the web client, not a placeholder of the kit, at `/`, at `/p/a794456d-6d1b-5b55-a360-13fec83dc7bc`, at
`/p/a794456d-6d1b-5b55-a360-13fec83dc7bc/impact` and at an unknown path, inside a document with
`lang="es"` and a title, and SHALL fail when `axe-core` reports any violation on any of them. The first
three paths are scanned by the gate's own test; the impact path by its own test under `tests/a11y/`. A negative
control SHALL prove that axe really runs in that environment. The kit scaffold `tests/a11y/smoke.example.tsx`
SHALL no longer exist, and the frontend CI workflow SHALL run the script instead of printing that it is
missing.

#### Scenario: The three routes have no axe violations

- **GIVEN** the routes of the web client rendered in a memory router at each of the three paths `/`,
  `/p/a794456d-6d1b-5b55-a360-13fec83dc7bc` and an unknown path
- **WHEN** `axe-core` runs over the whole document
- **THEN** it reports zero violations for each path

#### Scenario: The impact route has no axe violations

- **GIVEN** the routes of the web client rendered in a memory router at
  `/p/a794456d-6d1b-5b55-a360-13fec83dc7bc/impact`, inside a document with `lang="es"` and a title
- **WHEN** `axe-core` runs over the whole document before any send
- **THEN** it reports zero violations

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

## ADDED Requirements

### Requirement: Asking for the impact of a change through the API client

The API client SHALL expose `impact(projectId, body)` that sends `POST /api/projects/{projectId}/impact`
to the same origin, with the `projectId` percent-encoded as one path segment, the header
`content-type: application/json` and the JSON serialisation of `body` (the fields of the API's impact body:
`change` and optional `maxHops`) as the request body. On a `2xx` answer it SHALL resolve with the response
body unchanged, whether an answered report or an `unknown`. It SHALL have no time limit of its own. Its
failures and its cancellation SHALL follow "API errors", "Unavailable API" and "Cancellation by the
caller".

#### Scenario: An impact report is resolved as received

- **GIVEN** the network answers `200` with an answered report (one entry in each list and a `HIGH` risk)
- **WHEN** `impact('a794456d-6d1b-5b55-a360-13fec83dc7bc', { change: 'cambiar los descuentos de DiscountService', maxHops: 2 })`
  is called
- **THEN** exactly one request was sent, with method `POST`, URL
  `/api/projects/a794456d-6d1b-5b55-a360-13fec83dc7bc/impact`, header `content-type: application/json`
  and body exactly `{"change":"cambiar los descuentos de DiscountService","maxHops":2}`, and the promise
  resolves to a value deeply equal to the received body

#### Scenario: An unknown impact is resolved as received

- **GIVEN** the network answers `200` with body `{"status":"unknown","reason":"no-anchor"}`
- **WHEN** `impact('a/b?c', { change: 'mejorar el rendimiento' })` is called
- **THEN** the request URL is `/api/projects/a%2Fb%3Fc/impact`, its body is exactly
  `{"change":"mejorar el rendimiento"}`, and the promise resolves to a value deeply equal to the received
  body, not an error

#### Scenario: Impact failures become API or unavailable-API errors

- **GIVEN** the network answers, one call each:
  `400` `{"error":{"code":"INVALID_IMPACT_REQUEST","message":"invalid request","details":{"field":"maxHops"}}}`,
  then rejects with a `TypeError`
- **WHEN** `impact` is called for each with a valid project id and change
- **THEN** the first promise rejects with an API error whose `status` is `400`, `code`
  `INVALID_IMPACT_REQUEST` and `details` `{"field":"maxHops"}`; the second rejects with an unavailable-API
  error whose `cause` is the `TypeError`

#### Scenario: Aborting a pending impact request cancels it, and it has no time limit

- **GIVEN** a network that answers only when its request signal aborts (it then rejects with that signal's
  reason), and a clock that the test advances
- **WHEN** `impact` is called with a caller signal, the clock advances 60 000 ms, and then the caller aborts
- **THEN** after 60 000 ms the promise is still pending and the request signal is not aborted; after the
  abort the request signal is aborted and the promise rejects with an error named `AbortError` that is
  neither an API error nor an unavailable-API error
