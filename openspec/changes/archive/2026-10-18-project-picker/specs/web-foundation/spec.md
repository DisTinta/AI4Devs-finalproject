## REMOVED Requirements

### Requirement: Routes of the web client

**Reason**: `/` is no longer a placeholder: it shows Screen 1 (`project-picker`), so the scenario "The root
path shows the Screen 1 placeholder" no longer holds and a MODIFIED block cannot drop a scenario.

**Migration**: replaced by "Routes and screens of the web client" below, which keeps the Screen 2,
not-found and development-server scenarios unchanged; the checks of the retired scenario move to
`project-picker` → "Screen 1 shows the sample projects without waiting for the API".

## ADDED Requirements

### Requirement: Routes and screens of the web client

The web client SHALL answer three kinds of path:

| Path | Screen | Level-1 heading |
|---|---|---|
| `/` | project selection, Screen 1 (`project-picker`) | «Elige un proyecto para explorar» |
| `/p/{projectId}` | project query placeholder (Screen 2) | «Consulta del proyecto» |
| any other path | not found | «Página no encontrada» |

Every one of these screens SHALL render a banner landmark with the text «CODEMIND» and the tagline
«Comprensión de repositorios con evidencia verificable», and one main landmark holding the level-1
heading. Screen 1 is specified by the `project-picker` capability. The Screen 2 placeholder SHALL show
the `projectId` of its path as text and the line «Esta pantalla está en construcción.»; no other text is
rendered on it besides the banner, the heading, that line and the `projectId`, and it SHALL make no
request to the API. The not-found screen SHALL render a link «Volver a la selección de proyecto» that
leads to `/`. Every route SHALL be rendered under the app's error screen (`project-picker`, "App error
screen").

#### Scenario: A project path shows the Screen 2 placeholder with its id

- **GIVEN** the routes of the web client mounted in a memory router, and `fetch` replaced by a recording
  double
- **WHEN** the initial path is `/p/a794456d-6d1b-5b55-a360-13fec83dc7bc`
- **THEN** the level-1 heading «Consulta del proyecto» is rendered, the text
  `a794456d-6d1b-5b55-a360-13fec83dc7bc` is shown, the banner shows «CODEMIND» and «Comprensión de
  repositorios con evidencia verificable», the double recorded no request, and the main landmark
  holds, in this order, the level-1 heading, a paragraph «Esta pantalla está en construcción.» and a
  paragraph with the `projectId`, and no other text

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

## MODIFIED Requirements

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
