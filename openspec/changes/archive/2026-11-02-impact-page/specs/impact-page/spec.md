## Purpose

Screen 3 of the CODEMIND web client: the person describes a change to a project in words and reads the
impact report by sections, where every element says whether it comes from the graph or from the Git
history, with the risk level and its rationale, so they know what else is affected and how far to trust
each line before touching the code.

## ADDED Requirements

### Requirement: Screen 3 frame and navigation

The path `/p/{projectId}/impact` SHALL show Screen 3 inside the page frame of the web client, with the
project bar of Screen 2 as its banner landmark (`ask-page` → "Screen 2 frame and project bar": the link
«←» to `/` named «Volver a la selección de proyecto», the level-1 heading with the project's name or the
`projectId`, and the sample project's label and edge count). The main landmark SHALL hold, in this
order: the change box ("Change box") and the result area, which shows nothing before the first send, then
the pending state, the answered report, the unknown state or an error alert. After the main landmark the
screen SHALL hold a navigation landmark named «Navegación del proyecto» with one link, «Volver a las
preguntas», that leads to `/p/{projectId}` with the `projectId` percent-encoded as one path segment.
Opening Screen 3 SHALL NOT send any request. Going to another project's Screen 3 SHALL start from an empty
Screen 3.

#### Scenario: Screen 3 opens on a sample project without any request

- **GIVEN** the routes of the web client mounted in a memory router, and `fetch` replaced by a double
  that records every request and never answers
- **WHEN** the initial path is `/p/a794456d-6d1b-5b55-a360-13fec83dc7bc/impact`
- **THEN** the banner holds the link «Volver a la selección de proyecto» to `/`, the level-1 heading
  «acme-shop» and the text «PHP / Laravel · 170 aristas»; the main landmark holds, in this order, a text
  field named «Cambio», a combobox named «Saltos del grafo» whose options are «1», «2» and «3» with «2»
  selected, and a button named «Analizar»; there is no level-2 heading, no element with role `alert`, and
  exactly one element with role `status`, whose text is empty; a navigation landmark named «Navegación del
  proyecto» comes after the main landmark and holds a link «Volver a las preguntas» whose target is
  `/p/a794456d-6d1b-5b55-a360-13fec83dc7bc`; and the double recorded no request

#### Scenario: Screen 3 of a project outside the sample constant is shown by its id and leads back

- **GIVEN** the routes of the web client mounted in a memory router, and `fetch` replaced by a double
  that records every request and never answers
- **WHEN** the initial path is `/p/0b5c7f2e-1d3a-4e6b-8f90-1a2b3c4d5e6f/impact` and the person activates
  the link «Volver a las preguntas» with a pointer
- **THEN** before the click the level-1 heading is «0b5c7f2e-1d3a-4e6b-8f90-1a2b3c4d5e6f» and the banner
  shows no text «aristas»; after it the path is `/p/0b5c7f2e-1d3a-4e6b-8f90-1a2b3c4d5e6f`, the field
  «Pregunta» of Screen 2 is shown and there is no field «Cambio»; and the double recorded no request

#### Scenario: Another project's Screen 3 starts empty

- **GIVEN** Screen 3 of acme-shop showing the answered report of "The answered report shows its five
  sections, its origins and its risk", with «Saltos del grafo» set to «3»
- **WHEN** the path becomes `/p/0b5c7f2e-1d3a-4e6b-8f90-1a2b3c4d5e6f/impact`
- **THEN** the level-1 heading is «0b5c7f2e-1d3a-4e6b-8f90-1a2b3c4d5e6f», no level-2 heading is shown, the
  field «Cambio» is empty, «Saltos del grafo» shows «2», and the only element with role `status` is empty

### Requirement: Change box

The change box SHALL be a form with a one-line text field whose visible label is «Cambio», a single-choice
list whose visible label is «Saltos del grafo», with the options 1, 2 and 3 and 2 selected when the screen
opens, and a submit button «Analizar» that is never disabled. Pressing Enter in the field or pressing the
button SHALL send the change: the page trims the field's text and, when the trimmed text is a valid change
("How a change and the entries of a report are written"), sends exactly one impact request for the project
of the path whose body is exactly `{"change":"<trimmed text>","maxHops":<selected number>}`. The field
SHALL keep the text the person wrote, the list SHALL keep its choice, and sending SHALL NOT move the
focus.

When the trimmed text is not a valid change, the page SHALL send no request, leave the result area as it
was, mark the field with `aria-invalid="true"` and show the message «Describe el cambio en 5 a 500
caracteres.» in an element with role `alert` that is the field's accessible description; each invalid send
SHALL insert that alert as a new element, so assistive technology announces it again. The mark and the
message SHALL go away as soon as the person changes the field's text or sends a valid change.

#### Scenario: A valid change is sent trimmed with the selected hops

- **GIVEN** Screen 3 of acme-shop, and `fetch` replaced by a double that records every request and never
  answers, in three runs
- **WHEN** the person writes «  cambiar los descuentos de DiscountService  » in the field and presses the
  button «Analizar» with a pointer in the first run; selects «1» in the list «Saltos del grafo» and presses
  Enter in the field in the second; selects «3» in the list «Saltos del grafo» and presses Enter in the
  field in the third
- **THEN** in each run the double recorded exactly one request, with method `POST`, URL
  `/api/projects/a794456d-6d1b-5b55-a360-13fec83dc7bc/impact`, header `content-type: application/json`
  and body exactly `{"change":"cambiar los descuentos de DiscountService","maxHops":2}`,
  `{"change":"cambiar los descuentos de DiscountService","maxHops":1}` and
  `{"change":"cambiar los descuentos de DiscountService","maxHops":3}` respectively; the field still
  holds the untrimmed text; the list still shows the chosen number; and the focus is on the button
  «Analizar» in the first run and on the field «Cambio» in the second and third

#### Scenario: An invalid change is not sent

- **GIVEN** Screen 3 of acme-shop, and `fetch` replaced by a double that records every request and never
  answers
- **WHEN** the person sends with Enter, one after the other, the field holding «hola», then «     » (five
  spaces), then «  hola  », then 501 times the letter «a», then «cambiar\u0000descuentos» (with the
  character U+0000), then presses Enter again without changing the field
- **THEN** after each send the double has recorded no request; the field has `aria-invalid="true"` and the
  accessible description «Describe el cambio en 5 a 500 caracteres.»; exactly one element with role
  `alert` holds that message, and it is a different element from the one shown after the previous send —
  including after the last Enter, which repeats the previous send on the same unchanged text; the focus is
  on the field; and there is no text «Calculando impacto…»

#### Scenario: Changing an invalid change clears the mark

- **GIVEN** Screen 3 of acme-shop showing the message «Describe el cambio en 5 a 500 caracteres.» after the
  person sent «hola», and `fetch` replaced by a double that records every request and never answers
- **WHEN** the person writes one more character in the field
- **THEN** the field has no `aria-invalid="true"` and no accessible description, the message is not
  shown, and the double recorded no request

### Requirement: Pending report

From the moment a valid change is sent until the API's answer arrives, the result area SHALL show only the
text «Calculando impacto…» (with U+2026), hidden from assistive technology because the status region
announces it: whatever it showed before SHALL be removed when the change is sent. While a report is
pending, sending again from the field or the button SHALL send no request and change nothing on the screen,
whether or not the field holds a valid change. The page SHALL NOT set a time limit of its own. Leaving the
page SHALL abort the pending request, and that abort SHALL show nothing.

#### Scenario: Sending again while a report is pending sends no request

- **GIVEN** Screen 3 of acme-shop, and `fetch` replaced by a double that records every request and never
  answers
- **WHEN** the person sends «cambiar los descuentos de DiscountService», then changes the field to «hola»
  and presses Enter, then presses «Analizar»
- **THEN** the double recorded exactly one request; the text «Calculando impacto…» is shown; the field is
  not marked invalid and there is no element with role `alert`

#### Scenario: A pending report has no time limit of its own

- **GIVEN** Screen 3 of acme-shop, `fetch` replaced by a double that never answers, and a clock that the
  test advances
- **WHEN** the person sends «cambiar los descuentos de DiscountService» and the clock advances 60 000 ms
- **THEN** the text «Calculando impacto…» is still shown, the only element with role `status` holds
  «Calculando impacto…», and there is no element with role `alert`

#### Scenario: A new change replaces the report that was shown

- **GIVEN** Screen 3 of acme-shop showing the answered report of "The answered report shows its five
  sections, its origins and its risk", and `fetch` now replaced by a double that never answers
- **WHEN** the person sends «cambiar el envío de ShippingService»
- **THEN** no level-2 heading is shown, the text «Calculando impacto…» is shown and the only element with
  role `status` holds «Calculando impacto…»

#### Scenario: Leaving the page aborts the pending report

- **GIVEN** Screen 3 of acme-shop, and `fetch` replaced by a double that records the signal of each
  request and rejects with that signal's reason when it aborts
- **WHEN** the person sends «cambiar los descuentos de DiscountService» and then activates the link
  «Volver a las preguntas»
- **THEN** the recorded signal is aborted, Screen 2 is shown, and no element with role `alert` is shown

### Requirement: Answered report

An answered report SHALL be shown in the result area as, in this order: five sections, each a level-2
heading followed by its list of entries in the order the API sent them (never re-sorted), or by the text
«Sin elementos» when the list is empty (the section is never hidden) — «Directo» (`direct`), «Indirecto»
(`indirect`), «Tests» (`tests`), «Documentación» (`docs`), «Historial» (`history`); then the risk block
("Risk"); then the origin legend, «Origen: [grafo] análisis estático determinista · [git] señal histórica
de co-cambio»; then the line «Informe determinista: sin llamada al modelo de lenguaje.». Each entry SHALL
be written as "How a change and the entries of a report are written" says. Every entry of `direct`,
`indirect` and `tests` SHALL end with the origin tag «[grafo]» and every entry of `history` with the origin
tag «[git]», each a visible text, not colour alone; documents carry no origin tag (the API sends none).
Every text the API sends (symbols, files, paths, the rationale) SHALL be shown as text, never interpreted
as markup. The report adds no tab stop and does not move the focus. Every text of the report SHALL use a
text/background pair of `web-foundation` → "Theme colours and minimum contrast"; the tertiary text colour
(`#6c757d`) only on white.

#### Scenario: The answered report shows its five sections, its origins and its risk

- **GIVEN** Screen 3 of acme-shop, and `fetch` answering `200` with the Q2 report of `docs/DEMO.md` «Paso
  4»: `direct` DiscountApplied, DiscountService, RecordDiscountAudit (each 0 hops, `exact`),
  PriceCalculator (1 hop, `exact`) and the two files `app/Providers/AppServiceProvider.php` and
  `app/Providers/EventServiceProvider.php` (symbol equal to the file, 1 hop, `exact`); `indirect`
  CheckoutController, OrderController, RecalculateTotals, SendOrderConfirmation (2 hops, `heuristic`);
  `tests` DiscountServiceTest, OrderPricingTest, PriceCalculatorTest; `docs` `README.md` not stale;
  `history` `app/Services/ShippingService.php` with `coChangeRate` 1 and `prs` [24, 33, 55]; `risk`
  `HIGH` with its rationale
- **WHEN** the person sends «cambiar los descuentos de DiscountService»
- **THEN** the level-2 headings are, in this order, «Directo», «Indirecto», «Tests», «Documentación»,
  «Historial» and «Riesgo alto»; «Directo» lists six entries in the order received (the text of the fourth
  is exactly «PriceCalculator · app/Services/PriceCalculator.php · 1 salto · exacta · [grafo]»; the text
  of the fifth is exactly «app/Providers/AppServiceProvider.php · 1 salto · exacta · [grafo]»); every
  entry of «Indirecto» holds
  «2 saltos» and «heurística»; every entry of «Directo», «Indirecto» and «Tests» ends with «[grafo]»; the
  document entry holds «README.md» and «al día» and no origin tag; the history entry holds
  «app/Services/ShippingService.php», «co-cambia 100 %», «PR #24, #33, #55» and ends with «[git]»; the
  rationale is shown verbatim after «Riesgo alto»; the legend and the line «Informe determinista: sin
  llamada al modelo de lenguaje.» come after it; the only element with role `status` holds «Informe de
  impacto recibido.»; and the focus is on the field

#### Scenario: An empty section, a stale document and a history entry without pull requests

- **GIVEN** Screen 3 of acme-shop, and `fetch` answering `200` with a report whose `indirect` is empty,
  whose `docs` holds `{ "path": "docs/pricing.md", "stale": true, "staleSince":
  "0123456789abcdef0123456789abcdef01234567" }` and whose `history` holds one entry with `coChangeRate`
  0.8 and `prs` []
- **WHEN** the person sends «cambiar los descuentos de DiscountService»
- **THEN** the section «Indirecto» is shown and holds the text «Sin elementos» and no list item; the
  document entry holds «docs/pricing.md» and «desactualizada desde el commit 0123456», and its «⚠» is
  hidden from assistive technology; the history entry holds «co-cambia 80 %» and «sin PR»

#### Scenario: Texts of the API in the report are shown as text

- **GIVEN** Screen 3 of acme-shop, and `fetch` answering `200` with a report whose first `direct` symbol
  is «<img src=x onerror=alert(1)>» and whose rationale is «<b>alto</b>»
- **WHEN** the person sends «cambiar los descuentos de DiscountService»
- **THEN** the texts «<img src=x onerror=alert(1)>» and «<b>alto</b>» are shown literally, and the main
  landmark holds no `img` and no `b` element

### Requirement: Risk

The risk block SHALL be a section whose level-2 heading writes the level in words — «Riesgo alto» for
`HIGH`, «Riesgo medio» for `MEDIUM`, «Riesgo bajo» for `LOW` — followed by the API's `rationale`
verbatim. The level SHALL be readable as text, not by colour alone, and the block SHALL use only colour
pairs of the theme that meet the contrast of `web-foundation` → "Theme colours and minimum contrast".

#### Scenario: Every risk level is written in words

- **GIVEN** Screen 3 of acme-shop, in three runs where `fetch` answers `200` with a report whose risk level
  is `HIGH`, `MEDIUM` and `LOW`, and whose rationale is «r»
- **WHEN** the person sends «cambiar los descuentos de DiscountService» in each run
- **THEN** the risk heading is «Riesgo alto», «Riesgo medio» and «Riesgo bajo» respectively, followed by the
  text «r»

### Requirement: How a change and the entries of a report are written

A change SHALL be valid when, after trimming the whitespace at both ends, it has from 5 to 500 code points
(a character outside the Basic Multilingual Plane counts once) and holds no U+0000. An entry of `direct` or
`indirect` SHALL be written as its symbol (left out when it equals its file), its file, its hops («1 salto»
for 1, «<n> saltos» otherwise, «0 saltos» included), its resolution («exacta» for `exact`, «heurística» for
`heuristic`) and the tag «[grafo]». A test SHALL be written as its symbol (left out when it equals its
file), its file and «[grafo]». A document SHALL be written as its path and «al día», or as its path and
«⚠ desactualizada desde el commit <the first 7 characters of `staleSince`>». A history entry SHALL be
written as its file, «co-cambia <the rate times 100, rounded to a whole number> %» with a normal space
(U+0020) before «%», «PR #<a>, #<b>…» in the order received or «sin PR» when there are none, and «[git]».
The parts of an entry SHALL be separated by « · » (U+00B7 with a normal space on each side), in the order
listed above, with the origin tag last, so the entry's text reads the same to a screen reader as on the
screen. The risk heading SHALL be «Riesgo alto» for `HIGH`, «Riesgo medio» for `MEDIUM` and «Riesgo bajo»
for `LOW`.

#### Scenario: Change length is counted in code points after trimming

- **GIVEN** the change checker
- **WHEN** it checks «  hola  », «hola!», 500 times «a», 501 times «a», 250 times «😀» (two UTF-16 units
  each), «     » and «hola\u0000!»
- **THEN** it accepts «hola!» (as «hola!»), the 500 «a» and the 250 «😀», and rejects the other four

#### Scenario: Hops, resolution, document and history are written in Spanish

- **GIVEN** the entry writers
- **WHEN** they write hops 0, 1 and 2; the resolutions `exact` and `heuristic`; a document with `staleSince`
  «abcdef0123456789»; the co-change rates 1, 0.8 and 0.333; the pull-request lists [24, 33, 55], [7] and
  []; and the risk levels `HIGH`, `MEDIUM` and `LOW`
- **THEN** they give «0 saltos», «1 salto», «2 saltos»; «exacta», «heurística»; «desactualizada desde el
  commit abcdef0»; «co-cambia 100 %», «co-cambia 80 %», «co-cambia 33 %» (each with U+0020 before «%»);
  «PR #24, #33, #55», «PR #7» and «sin PR»; «Riesgo alto», «Riesgo medio» and «Riesgo bajo»

### Requirement: Unknown report

When the API answers `200` with `{ "status": "unknown", "reason": "no-anchor" }`, the result area SHALL show
a section with a decorative «○» hidden from assistive technology, the level-2 heading «Sin ancla en el
grafo», the sentence «El cambio no nombra ningún símbolo ni fichero que CODEMIND encuentre en el grafo de
este proyecto, así que no hay nada desde lo que calcular el impacto. Nombra una clase o un fichero, por
ejemplo DiscountService.» and the text «Motivo: <reason>» with the reason as received. It SHALL show no
section of the report and no risk, have neither role `status` nor role `alert`, and add no tab stop.

#### Scenario: An unknown report says the change anchors nothing

- **GIVEN** Screen 3 of acme-shop, and `fetch` answering `200` with `{"status":"unknown","reason":"no-anchor"}`
- **WHEN** the person sends «mejorar el rendimiento general»
- **THEN** the level-2 heading «Sin ancla en el grafo» is the only level-2 heading; the sentence of the
  requirement and «Motivo: no-anchor» follow it; there is no «Directo» nor «Riesgo» text and no element with
  role `alert`; the only element with role `status` holds «Sin ancla en el grafo.»; and the focus is on the
  field

### Requirement: Error alerts

When the impact request fails, the result area SHALL show the alert of Screen 2 (`ask-page` → "Error,
rate-limit and budget notices"): an element with role `alert`, a decorative «⚠» hidden from assistive
technology and one paragraph per line of that requirement's table for the API's `code` (chosen by the
code, never the HTTP status), ending with «Código: <code>.», or the two lines «No se ha podido obtener la
respuesta.» and «La API de CODEMIND no responde.» for an unavailable API. No report or unknown state shown
before SHALL remain, the status region SHALL be empty, and the alert SHALL add no tab stop.

#### Scenario: A rate limit, an API error and an unavailable API are alerted

- **GIVEN** Screen 3 of acme-shop, in five runs where `fetch` answers `429`
  `{"error":{"code":"RATE_LIMITED","message":"too many requests","details":{"retryAfterSeconds":30}}}`,
  `404` with `PROJECT_NOT_FOUND`, `400` `{"error":{"code":"INVALID_IMPACT_REQUEST","message":"invalid request","details":{"field":"maxHops"}}}`,
  `500` with `INTERNAL`, and rejects with a `TypeError`
- **WHEN** the person sends «cambiar los descuentos de DiscountService» in each run
- **THEN** the alert's paragraphs are, in order: «No se ha podido obtener la respuesta.», «Demasiadas
  peticiones seguidas a la API.», «Espera 30 s y vuelve a preguntar.», «Código: RATE_LIMITED.» in the
  first run; «No se ha podido obtener la respuesta.», «La API no tiene este proyecto: vuelve a la selección
  de proyecto o indéxalo con la CLI.», «Código: PROJECT_NOT_FOUND.» in the second; «No se ha podido obtener
  la respuesta.», «Código: INVALID_IMPACT_REQUEST.» in the third; «No se ha podido obtener la respuesta.»,
  «Código: INTERNAL.» in the fourth; «No se ha podido obtener la respuesta.», «La API de CODEMIND no
  responde.» in the fifth; in every run there is no level-2 heading, the status region is empty and the
  focus is on the field

#### Scenario: A failure removes the report that was shown

- **GIVEN** Screen 3 of acme-shop showing the answered report of "The answered report shows its five
  sections, its origins and its risk", and `fetch` now rejecting with a `TypeError`
- **WHEN** the person sends «cambiar el envío de ShippingService»
- **THEN** the alert «La API de CODEMIND no responde.» is shown and none of the headings «Directo» or
  «Riesgo alto» remains

### Requirement: Screen reader announcements of Screen 3

Screen 3 SHALL hold, from the moment it opens, exactly one element with role `status`, hidden visually,
that remains the same element in every state, whose text is: empty before the first send; «Calculando
impacto…» while a report is pending; «Informe de impacto recibido.» while an answered report is shown; «Sin
ancla en el grafo.» while the unknown state is shown; and empty while an error alert is shown. An invalid
send SHALL NOT change it.

#### Scenario: The status region announces every outcome

- **GIVEN** Screen 3 of acme-shop, and `fetch` answering, in turn, `200` with the Q2 report, `200` with
  `{"status":"unknown","reason":"no-anchor"}` and rejecting with a `TypeError`
- **WHEN** the person sends «cambiar los descuentos de DiscountService»; then sends «hola»; then sends
  «mejorar el rendimiento general»; then sends «cambiar el envío de ShippingService»
- **THEN** exactly one element has role `status` throughout and it is the same element as when the page
  opened; its text is empty on open, «Informe de impacto recibido.» after the first send and still after
  «hola», «Sin ancla en el grafo.» after the third send and empty once the alert of the fourth is shown

### Requirement: Accessibility of Screen 3

Screen 3 SHALL have no `axe-core` violation in any of its states: before any send, with a report pending,
with the answered Q2 report, with a stale document and an empty section, with the invalid-change message,
with the unknown state, and with the alerts of a rate limit and an unavailable API. The keyboard tab order
of Screen 3 SHALL be: the back link, the field «Cambio», the list «Saltos del grafo», the button
«Analizar», and the link «Volver a las preguntas»; the report, the unknown state and the alerts SHALL add
no tab stop. The list SHALL be operable with the keyboard alone. Every control SHALL show a visible focus
indicator when it receives the focus from the keyboard.

#### Scenario: Screen 3 has no axe violations in any of its states

- **GIVEN** a document with `lang="es"` and a title, and the routes of the web client at
  `/p/a794456d-6d1b-5b55-a360-13fec83dc7bc/impact` with `fetch` replaced by a double for each state
- **WHEN** `axe-core` runs over the whole document before any send; with a report pending; with the Q2
  report; with the report of "An empty section, a stale document and a history entry without pull
  requests"; with the invalid-change message; with the unknown state; and with the alerts of `429`
  `RATE_LIMITED` and of a `fetch` that rejects with a `TypeError`
- **THEN** it reports zero violations in each of the eight states

#### Scenario: The tab order of Screen 3 skips the report

- **GIVEN** Screen 3 of acme-shop, in three runs: showing the Q2 report, showing the alert of a `fetch`
  that rejects with a `TypeError`, and showing the unknown state of `{"status":"unknown","reason":"no-anchor"}`;
  in each run the focus on the document body
- **WHEN** the person presses Tab five times in each run
- **THEN** in each run the focus visits, in this order, the link «Volver a la selección de proyecto», the
  field «Cambio», the list «Saltos del grafo», the button «Analizar» and the link «Volver a las preguntas»

#### Scenario: The walkthrough step 4 runs in a real browser

- **GIVEN** the system started with `npm run up` in evaluation mode, with the seed loaded
- **WHEN** a browser opens `http://localhost:5173/`, opens acme-shop, follows «Analizar el impacto de un
  cambio», sends «cambiar los descuentos de DiscountService» with «Saltos del grafo» at 2, changes «Saltos
  del grafo» to 1 and then to 3 with the arrow keys only and sends each time, and then moves through the
  page with Tab and Shift+Tab
- **THEN** the report shows the sections, entries and risk of `docs/DEMO.md` «Paso 4» («Riesgo alto», 6
  direct, 4 indirect, 3 tests, `README.md` «al día», one history entry «[git]»); the list changes value
  with the arrow keys and each send shows its report; every control shows a visible outline while
  focused; every text of the report uses a contrast pair of the theme table (checked with the browser's
  contrast inspector, at least 4.5:1); and the page has no horizontal scroll at 320 px wide (validated in the
  manual interface test and in `/show-spec-working`, with screenshots saved next to the report)
