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
  precargados · sin registro · sin instalación» and a list named «Proyectos de muestra» with exactly one
  article, named «acme-shop»; that article holds the level-2 heading «acme-shop», the text «PHP /
  Laravel», the counts «53 ficheros», «121 símbolos», «170 aristas» and «32 commits» in this order, the
  text «indexado», and a link named «Explorar proyecto acme-shop» whose target is
  `/p/a794456d-6d1b-5b55-a360-13fec83dc7bc`; every icon of the card (🐘, 📁, 🔷, ↔, 📝, ✓ and →) is
  inside an element hidden from assistive technology; the article shows the badge «comprobando…» and no
  text «listo»; there is no element with role `alert` and no button «Reintentar»; and the double
  recorded exactly one request, `GET /health`

#### Scenario: The project link is reached and followed with the keyboard

- **GIVEN** the routes of the web client mounted in a memory router at `/`, and `fetch` replaced by a
  double that never answers
- **WHEN** the person presses Tab until the link «Explorar proyecto acme-shop» has the focus, then presses
  Enter
- **THEN** the link received the focus by keyboard, and Screen 2 of acme-shop is rendered: the level-1
  heading «acme-shop» and the field «Pregunta» (`ask-page`)

### Requirement: API status on Screen 1

When Screen 1 is shown, it SHALL check the API once with the health check of the API client, without
blocking the cards. While that first check is pending, every card SHALL show the badge «comprobando…»
(with U+2026) in the place of «listo», and the page SHALL show no alert. When the check resolves, the
«comprobando…» badge SHALL give way to the badge «listo» next to «indexado» on every card; the first
check SHALL NOT move the focus, whatever its outcome. When
the check fails for any reason other than the page itself cancelling it (an unavailable API, an API
error answer, or the health check's time limit), the page SHALL show an alert (role `alert`) between the
subtitle and the list of projects, with the text «La API de CODEMIND no está disponible. Puedes ver los
proyectos, pero no preguntar hasta que vuelva. Arráncala con make up y pulsa Reintentar.» and a button
«Reintentar», and no card SHALL show «listo» nor «comprobando…»; the cards and their links stay as they
are.

Pressing «Reintentar» SHALL send exactly one new health check; while it is pending, the alert stays, its
button reads «Reintentando…» (with U+2026) and keeps the focus, and further presses SHALL send no
request. If it resolves, the alert SHALL disappear, every card SHALL show «listo» and the focus SHALL
move to the level-1 heading, unless the person moved the focus to another element while the retry was
pending: then the focus stays where the person put it. If it fails, the alert SHALL stay as it was, its button SHALL read
«Reintentar» again and keep the focus. The page SHALL NOT retry on its own: after a failed check, no
request is sent until the person presses «Reintentar». Leaving the page SHALL cancel a pending check, and that cancellation SHALL change nothing on
the screen.

#### Scenario: An available API adds the «listo» badge

- **GIVEN** `fetch` that answers `GET /health` with `200` and body `{"status":"ok"}`
- **WHEN** Screen 1 is shown
- **THEN** the article «acme-shop» shows the texts «indexado» and «listo» and not «comprobando…», there is
  no element with role `alert` and no button «Reintentar», and the focus is still on the document body

#### Scenario: An unavailable API shows the alert and keeps the cards

- **GIVEN** four runs where `fetch` is replaced by a double that records every request and, in turn:
  rejects with a `TypeError`; answers `500` with an empty body; answers `503` with
  `{"error":{"code":"SERVICE_UNAVAILABLE","message":"unavailable","details":{}}}`; answers `200` with
  `{"status":"down"}`
- **WHEN** Screen 1 is shown in each run
- **THEN** each time an element with role `alert` appears holding «La API de CODEMIND no está
  disponible» and a button «Reintentar», it comes after the subtitle and before the list «Proyectos de
  muestra», the article «acme-shop» and its link «Explorar proyecto acme-shop» are still rendered, the
  texts «listo» and «comprobando…» are not shown, the focus is still on the document body, and the double
  recorded exactly one request

#### Scenario: A health check that never answers shows the alert after its time limit

- **GIVEN** `fetch` replaced by a double that records every request and never answers (it rejects only
  when its request signal aborts), and a clock that the test advances
- **WHEN** Screen 1 is shown and the clock advances 4 999 ms, then 1 ms more, then 60 000 ms more
- **THEN** after 4 999 ms there is no element with role `alert` and the badge «comprobando…» is shown;
  after 5 000 ms the alert «La API de CODEMIND no está disponible» is shown and «comprobando…» is not;
  and after the last 60 000 ms the double has still received exactly one request

#### Scenario: Retrying after the API comes back removes the alert

- **GIVEN** Screen 1 showing the alert because `fetch` rejected with a `TypeError`, and `fetch` then
  replaced by a double that records requests and answers `200` with `{"status":"ok"}`
- **WHEN** the person presses «Reintentar»
- **THEN** the double recorded exactly one request, `GET /health`; the alert and the button «Reintentar»
  are gone; the article «acme-shop» shows «listo»; and the focus is on the level-1 heading «Elige un
  proyecto para explorar»

#### Scenario: A successful retry leaves the focus where the person moved it

- **GIVEN** Screen 1 showing the alert, and `fetch` then replaced by a double that records requests and
  answers `200` with `{"status":"ok"}` only when the test releases the answer
- **WHEN** the person presses «Reintentar», then presses Tab, which moves the focus to the link «Explorar
  proyecto acme-shop», and the answer is then released
- **THEN** the double recorded exactly one request; the alert is gone; the article «acme-shop» shows
  «listo»; and the focus is still on the link «Explorar proyecto acme-shop»

#### Scenario: Pressing again while a retry is pending sends no request

- **GIVEN** Screen 1 showing the alert, and `fetch` then replaced by a double that records requests and
  never answers
- **WHEN** the person presses «Reintentar» three times
- **THEN** the double recorded exactly one request; the alert is still shown, its button reads
  «Reintentando…» and has the focus

#### Scenario: A failed retry keeps the alert

- **GIVEN** Screen 1 showing the alert, and `fetch` still rejecting with a `TypeError`
- **WHEN** the person presses «Reintentar» and the new check fails
- **THEN** exactly one more request was sent; the alert and its text are still shown, its button reads
  «Reintentar» again and has the focus, and the text «listo» is not shown

#### Scenario: Leaving Screen 1 cancels a pending check

- **GIVEN** Screen 1 shown with `fetch` replaced by a double that records the signal of each request and
  never answers on its own
- **WHEN** the person follows the link «Explorar proyecto acme-shop»
- **THEN** the signal of the pending health check is aborted, the level-1 heading «acme-shop» of Screen 2
  is rendered, and no element with role `alert` is shown

#### Scenario: A check the page cancels itself changes nothing on the screen

- **GIVEN** `fetch` replaced by a double that records the signal of each request, never answers on its
  own and rejects with its signal's reason when that signal aborts, and the routes of the web client
  mounted inside React's `StrictMode`, which mounts the page, unmounts it and mounts it again, as the
  development server does
- **WHEN** the initial path is `/`
- **THEN** the double recorded two requests, the signal of the first one is aborted and that of the second
  one is not; the badge «comprobando…» is shown; and there is no element with role `alert`
