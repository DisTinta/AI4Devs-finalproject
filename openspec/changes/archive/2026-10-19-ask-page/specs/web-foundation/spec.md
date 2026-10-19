## REMOVED Requirements

### Requirement: Routes and screens of the web client

**Reason**: `/p/{projectId}` is no longer a placeholder: it shows Screen 2 (`ask-page`), whose banner is
the project bar instead of the CODEMIND header, so the scenario "A project path shows the Screen 2
placeholder with its id" no longer holds and a MODIFIED block cannot drop a scenario (design D15).

**Migration**: replaced by "Paths of the web client and their screens" below, which keeps the not-found
and development-server scenarios unchanged; the checks of the retired scenario move to `ask-page` →
"Screen 2 opens on a sample project without any request".

## ADDED Requirements

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
