## MODIFIED Requirements

### Requirement: Sample-project cards without HTTP

The path `/` SHALL show Screen 1 of `readme.md` §1.3 inside the page frame of the web client (the banner
with «CODEMIND» and «Comprensión de repositorios con evidencia verificable», and the main landmark). The
main landmark SHALL hold, in this order: the level-1 heading «Elige un proyecto para explorar»; the
paragraph «Repositorios precargados · sin registro · sin instalación»; the API-unavailable alert when it
applies (see "API status on Screen 1"); a list named «Proyectos de muestra» with one item per project of
the versioned sample-project constant, in the constant's order; and the indexing hint (see "Indexing a
repository of one's own is a hint, not a control").

Each item SHALL be an article named by its project's name, holding: a level-2 heading with the name;
the language and framework label (see "How a project is written on its card"); a list of four counts,
files, symbols, edges and commits, in this order; the badge «indexado»; and a link whose visible text is
«Explorar proyecto», whose accessible name is «Explorar proyecto <name>» and which leads to
`/p/<id>`. The check mark ✓ of «indexado» and the arrow → of the link are decorative and SHALL be
hidden from assistive technology, like the icons of "How a project is written on its card". The cards SHALL be rendered from the constant on the first render, before and whatever the
API answers, and SHALL NOT cause any HTTP request: the only request the page sends is its health check.

#### Scenario: Screen 1 shows the sample projects without waiting for the API

- **GIVEN** the routes of the web client mounted in a memory router, and `fetch` replaced by a double
  that records every request and never answers
- **WHEN** the initial path is `/`
- **THEN** the banner shows «CODEMIND» and «Comprensión de repositorios con evidencia verificable»; the
  main landmark holds the level-1 heading «Elige un proyecto para explorar», the paragraph «Repositorios
  precargados · sin registro · sin instalación» and a list named «Proyectos de muestra» with exactly two
  articles, named «acme-shop» and «task-api» in this order; the acme-shop article holds the level-2
  heading «acme-shop», the text «PHP / Laravel», the counts «53 ficheros», «121 símbolos», «170 aristas»
  and «32 commits» in this order, the text «indexado», and a link named «Explorar proyecto acme-shop»
  whose target is `/p/a794456d-6d1b-5b55-a360-13fec83dc7bc`; the task-api article holds the level-2
  heading «task-api», the text «TypeScript / Fastify», the four counts of task-api's object in the
  constant, written as "How a project is written on its card" says, in the same order, the text
  «indexado», and a link named «Explorar proyecto task-api» whose target is `/p/<task-api's id in the
  constant>`; every icon of each card (🐘 or 📘, 📁, 🔷, ↔, 📝, ✓ and →) is inside an element hidden
  from assistive technology; each article shows the badge «comprobando…» and no text «listo»; there is
  no element with role `alert` and no button «Reintentar»; and the double recorded exactly one request,
  `GET /health`

#### Scenario: The project link is reached and followed with the keyboard

- **GIVEN** the routes of the web client mounted in a memory router at `/`, and `fetch` replaced by a
  double that never answers
- **WHEN** the person presses Tab until the link «Explorar proyecto acme-shop» has the focus, then presses
  Enter
- **THEN** the link received the focus by keyboard, and Screen 2 of acme-shop is rendered: the level-1
  heading «acme-shop» and the field «Pregunta» (`ask-page`)
