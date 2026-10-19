## Purpose

Screen 2 of the CODEMIND web client: the person writes a question about a project, or presses one of its
suggested questions, and reads the answer with each statement marked as fact or inference and as
verified or not, and opens the code fragment each piece of evidence cites, without leaving the page.

## ADDED Requirements

### Requirement: Screen 2 frame and project bar

The path `/p/{projectId}` SHALL show Screen 2 of `readme.md` §1.3 inside the page frame of the web client,
with the project bar as its banner landmark instead of the CODEMIND header. The project bar SHALL hold, in
this order: a link to `/` whose visible text is the arrow «←» and whose accessible name is «Volver a la
selección de proyecto»; the level-1 heading, which is the project's name when `projectId` is the id of a
project of the versioned sample-project constant, and the `projectId` itself otherwise; and, only for a
sample project, its language and framework label and its edge count, written as on its card on Screen 1
(`project-picker` → "How a project is written on its card"), separated by « · ». The main landmark SHALL
hold, in this order: the question box ("Question box"); the suggested questions, when the project has
any ("Suggested questions"); and the result area, which shows the pending state, the answer with its
evidence, or a notice ("Pending question", "Answer with typed and verified statements", "Expandable
evidence", "Provisional notice for what is not an answer"), and nothing before the first question.
Opening Screen 2 SHALL NOT send any request: the page calls the API only when a question is sent.

#### Scenario: Screen 2 opens on a sample project without any request

- **GIVEN** the routes of the web client mounted in a memory router, and `fetch` replaced by a double
  that records every request and never answers
- **WHEN** the initial path is `/p/a794456d-6d1b-5b55-a360-13fec83dc7bc`
- **THEN** the banner holds a link named «Volver a la selección de proyecto» whose visible text is «←»
  and whose target is `/`, the level-1 heading «acme-shop» and the text «PHP / Laravel · 170 aristas»,
  and neither «CODEMIND» nor «Comprensión de repositorios con evidencia verificable» is shown; the main
  landmark holds, in this order, a text field named «Pregunta», a button named «Preguntar», the text
  «Prueba:» and a group named «Prueba:» with exactly three buttons, named «¿Cómo se calcula el precio
  final de un pedido?», «¿Cómo se validan los cupones?» and «¿Qué hace OrderObserver al crear un
  pedido?» in this order; there is no heading «Respuesta» nor «Evidencia», no text «Buscando evidencia…»
  and no element with role `alert` or `status`; and the double recorded no request

#### Scenario: A project outside the sample constant is shown by its id

- **GIVEN** the routes of the web client mounted in a memory router, and `fetch` replaced by a double
  that records every request and never answers
- **WHEN** the initial path is `/p/0b5c7f2e-1d3a-4e6b-8f90-1a2b3c4d5e6f`
- **THEN** the level-1 heading is «0b5c7f2e-1d3a-4e6b-8f90-1a2b3c4d5e6f»; the banner shows no language
  label and no text «aristas»; the main landmark holds the text field «Pregunta» and the button
  «Preguntar», and no text «Prueba:» nor any other button; and the double recorded no request

### Requirement: Question box

The question box SHALL be a form with a one-line text field whose accessible name is «Pregunta» and a
submit button whose visible text «→» is hidden from assistive technology and whose accessible name is
«Preguntar». Pressing Enter in the field or pressing the button SHALL send the question: the page trims
the field's text and, when the trimmed text is a valid question ("How a question, an answer and an
evidence location are written"), sends exactly one ask request for the project of the path with the body
exactly `{"question":"<trimmed text>"}` (no `tokenBudget`, no `useCache`: the API's defaults apply). The
field SHALL keep the text the person wrote, and sending SHALL NOT move the focus.

When the trimmed text is not a valid question, the page SHALL send no request, leave the result area as
it was, mark the field with `aria-invalid="true"`, show the message «Escribe una pregunta de 5 a 500
caracteres.» in an element with role `alert` that is the field's accessible description, and keep the
focus on the field. The mark and the message SHALL go away as soon as the person changes the field's
text, or sends a valid question. The page checks only the length: any other rule of the API (such as
U+0000) is reported by the API's answer ("Provisional notice for what is not an answer").

#### Scenario: A written question is sent trimmed

- **GIVEN** Screen 2 of acme-shop, and `fetch` replaced by a double that records every request and never
  answers, in two runs
- **WHEN** the person writes «  ¿Qué hace OrderService?  » in the field and presses Enter in the first
  run, and writes the same text and presses the button «Preguntar» with a pointer in the second run
- **THEN** in each run the double recorded exactly one request, with method `POST`, URL
  `/api/projects/a794456d-6d1b-5b55-a360-13fec83dc7bc/ask`, header `content-type: application/json` and
  body exactly `{"question":"¿Qué hace OrderService?"}`; the field still holds «  ¿Qué hace
  OrderService?  »; it is not marked invalid; and the focus is on the element the person used (the
  field in the first run, the button in the second)

#### Scenario: An invalid question is not sent

- **GIVEN** Screen 2 of acme-shop, and `fetch` replaced by a double that records every request and never
  answers
- **WHEN** the person sends, one after the other with Enter, the field holding «hola», then «     » (five
  spaces), then «  hola  », then 501 times the letter «a»
- **THEN** after each send the double has recorded no request; the field has `aria-invalid="true"` and the
  accessible description «Escribe una pregunta de 5 a 500 caracteres.»; one element with role `alert`
  holds that message; the focus is on the field; and there is no text «Buscando evidencia…»

#### Scenario: Changing an invalid question clears the mark

- **GIVEN** Screen 2 of acme-shop showing the message «Escribe una pregunta de 5 a 500 caracteres.» after
  the person sent «hola», and `fetch` replaced by a double that records every request and never
  answers, in two runs
- **WHEN** the person writes one more character in the field in the first run, and presses the suggested
  question «¿Cómo se validan los cupones?» in the second run
- **THEN** in both runs the field has no `aria-invalid="true"` and no accessible description and the
  message is not shown; the double recorded no request in the first run, and exactly one request, whose
  body is `{"question":"¿Cómo se validan los cupones?"}`, in the second

### Requirement: Suggested questions

For a project that has suggested questions, the main landmark SHALL show, after the question box, the
text «Prueba:» and a group named by that text holding one button per suggested question, in the order of
the versioned suggested-question constant, each named by its question. The suggested questions of a
sample project SHALL be exactly the questions of its golden answers file (`seeds/cache/<project>.json`),
in the file's order, so that in evaluation mode each of them is answered from the answer cache; a project
without golden answers has none, and then neither «Prueba:» nor the group is shown. Pressing a suggested
question SHALL put its text in the field and send it at once, exactly as a written question ("Question
box"); the focus SHALL stay on the pressed button.

#### Scenario: A suggested question is sent at once

- **GIVEN** Screen 2 of acme-shop, and `fetch` replaced by a double that records every request and never
  answers
- **WHEN** the person presses the button «¿Cómo se calcula el precio final de un pedido?»
- **THEN** the double recorded exactly one request, `POST /api/projects/a794456d-6d1b-5b55-a360-13fec83dc7bc/ask`
  with body exactly `{"question":"¿Cómo se calcula el precio final de un pedido?"}`; the field holds «¿Cómo
  se calcula el precio final de un pedido?»; an element with role `status` holds «Buscando evidencia…»;
  and the focus is on the pressed button

#### Scenario: The suggested questions are the golden questions

- **GIVEN** the versioned suggested-question constant, the versioned sample-project constant and every
  golden answers file `seeds/cache/*.json`
- **WHEN** the coherence test compares them
- **THEN** for every golden file, the sample project whose name is the file's `project` has as suggested
  questions exactly the `question` of the file's entries, in the file's order; every key of the
  suggested-question constant is the id of a sample project that has a golden file; and the suggested
  questions of acme-shop are «¿Cómo se calcula el precio final de un pedido?», «¿Cómo se validan los
  cupones?» and «¿Qué hace OrderObserver al crear un pedido?»

### Requirement: Pending question

From the moment a valid question is sent until the API's answer arrives, the result area SHALL show only
an element with role `status` holding «Buscando evidencia…» (with U+2026): whatever it showed before (an
answer with its evidence, or a notice) SHALL be removed when the question is sent, so an answer to another
question is never shown. While a question is pending, sending from the field, from the button «Preguntar»
or from a suggested question SHALL send no request and change nothing on the screen, the field's text
included. The page SHALL NOT set a time limit of its own (a local model takes tens of seconds). Leaving
the page SHALL abort the pending request, and that abort SHALL show nothing. When the answer arrives, the
focus SHALL stay where it is.

#### Scenario: Sending again while a question is pending sends no request

- **GIVEN** Screen 2 of acme-shop, and `fetch` replaced by a double that records every request and never
  answers
- **WHEN** the person presses «¿Cómo se calcula el precio final de un pedido?», then «¿Cómo se validan los
  cupones?», then presses Enter in the field, then presses «Preguntar»
- **THEN** the double recorded exactly one request, whose body holds «¿Cómo se calcula el precio final de
  un pedido?»; the field still holds that question; and the status «Buscando evidencia…» is shown

#### Scenario: A new question replaces what was shown

- **GIVEN** two runs: Screen 2 of acme-shop showing the answer of «¿Cómo se calcula el precio final de un
  pedido?»; and Screen 2 of acme-shop showing the provisional alert after `fetch` rejected with a
  `TypeError`; in each run `fetch` is then replaced by a double that records every request and never
  answers
- **WHEN** the person presses «¿Cómo se validan los cupones?» in each run
- **THEN** in each run the double recorded exactly one request and the status «Buscando evidencia…» is
  shown; in the first there is no heading «Respuesta» nor «Evidencia» and no statement of the previous
  answer; in the second there is no element with role `alert`

#### Scenario: A pending question has no time limit of its own

- **GIVEN** Screen 2 of acme-shop, `fetch` replaced by a double that records the signal of each request
  and never answers on its own, and a clock that the test advances
- **WHEN** the person presses «¿Cómo se calcula el precio final de un pedido?» and the clock advances
  120 000 ms
- **THEN** the status «Buscando evidencia…» is still shown, the double recorded exactly one request, and
  its signal is not aborted

#### Scenario: Leaving the page aborts the pending question

- **GIVEN** Screen 2 of acme-shop, and `fetch` replaced by a double that records the signal of each
  request, never answers on its own and rejects with its signal's reason when that signal aborts
- **WHEN** the person presses «¿Cómo se calcula el precio final de un pedido?», then follows the link
  «Volver a la selección de proyecto»
- **THEN** the signal of the ask request is aborted; the level-1 heading «Elige un proyecto para
  explorar» is rendered; and no element with role `alert` is shown

### Requirement: Answer with typed and verified statements

When the API answers with an answered question, the result area SHALL show, in this order: a level-2
heading «Respuesta»; the answer text; an ordered list with one item per statement, in the API's order;
and the evidence ("Expandable evidence"). In the answer text and in each statement's text, every fragment
between a pair of back-quotes SHALL be shown, without the back-quotes, in a `code` element ("How a
question, an answer and an evidence location are written"); no other markup is interpreted and every
text is rendered as text. Each statement item SHALL show its text, then a type badge and a verification
badge, then «Evidencia: » followed by the ids of the evidence it cites joined by «, » (omitted when it
cites none). The badges are, with their icon hidden from assistive technology and the text always
present (never colour alone):

| Value | Badge |
|---|---|
| type `FACT` | ● «HECHO», in the success colours |
| type `INFERENCE` | ⚠ «INFERIDO», in the warning colours |
| verification `entailed` | ✓ «verificado», in the success colours |
| verification `cited` | ○ «sin verificar», in the muted colours |

An `INFERENCE` item SHALL be drawn on the warning background with the warning border, and a `FACT` item
with the decorative success stripe. The page SHALL NOT show the answer's `confidence` nor its `usage`
(DIS-66).

#### Scenario: An answered question shows the answer, its statements and its evidence

- **GIVEN** Screen 2 of acme-shop, and `fetch` answering `200` with an answered question whose answer is
  «El precio final se calcula en `PriceCalculator::compute()`.», whose statements are «`compute()` aplica
  el descuento antes del impuesto.» (`FACT`, `entailed`, citing `ev-1`) and «El envío se suma al final.»
  (`INFERENCE`, `cited`, citing `ev-1` and `ev-2`), whose evidence is `ev-1`
  (`app/Services/PriceCalculator.php`, lines 16 to 44) and `ev-2` (`app/Services/ShippingService.php`,
  line 12 to 12), and whose `confidence` is `0.71`
- **WHEN** the person presses «¿Cómo se calcula el precio final de un pedido?»
- **THEN** a level-2 heading «Respuesta» is shown, followed by a paragraph whose text is «El precio final
  se calcula en PriceCalculator::compute().» with «PriceCalculator::compute()» in a `code` element; an
  ordered list has two items: the first holds «compute()» in a `code` element, «HECHO», «verificado» and
  «Evidencia: ev-1», and the second holds «INFERIDO», «sin verificar» and «Evidencia: ev-1, ev-2»; the
  icons ●, ✓, ⚠ and ○ are inside elements hidden from assistive technology; the level-2 heading
  «Evidencia» comes after the list; there is no status «Buscando evidencia…», no text «0.71» and no text
  «Confianza»; and the focus is still on the pressed button

#### Scenario: Every combination of type and verification is labelled

- **GIVEN** Screen 2 of acme-shop, and `fetch` answering `200` with an answered question whose four
  statements are, in order, `FACT`/`entailed`, `FACT`/`cited`, `INFERENCE`/`entailed` and
  `INFERENCE`/`cited`, the first three citing `ev-1` and the fourth citing no evidence
- **WHEN** the person sends a question
- **THEN** the four statement items hold, in order, «HECHO» and «verificado», «HECHO» and «sin
  verificar», «INFERIDO» and «verificado», and «INFERIDO» and «sin verificar»; the first three hold
  «Evidencia: ev-1» and the fourth holds no text «Evidencia:»

#### Scenario: Markup in an answer is shown as text

- **GIVEN** Screen 2 of acme-shop, and `fetch` answering `200` with an answered question whose answer is
  «Usa <b>negrita</b> y `<i>x</i>`.» and whose only statement is «<img src=x onerror=alert(1)>»
- **WHEN** the person sends a question
- **THEN** the answer paragraph's text is «Usa <b>negrita</b> y <i>x</i>.», with «<i>x</i>» as the text
  of its `code` element; the statement item's text includes «<img src=x onerror=alert(1)>»; and the
  result area holds no `b`, `i` or `img` element

#### Scenario: Statement colours follow the wireframe

- **GIVEN** the web client and the API running locally in evaluation mode, with the seed and the golden
  answers loaded
- **WHEN** a browser opens Screen 2 of acme-shop and presses «¿Cómo se calcula el precio final de un
  pedido?»
- **THEN** each `FACT` statement shows the green stripe and each `INFERENCE` statement the yellow
  background and border; the badges «HECHO» and «verificado» are green, «INFERIDO» yellow-brown and «sin
  verificar» grey, each with its icon (validated in the manual interface test and in
  `/show-spec-working`, with screenshots saved next to the report)

### Requirement: Expandable evidence

After the statements, the result area SHALL show a level-2 heading «Evidencia» and a list with one item
per evidence of the answer, in the API's order, repeated evidence included. Each item SHALL be a button
whose accessible name is «<id> · <location>» (the location as in "How a question, an answer and an
evidence location are written"), with `aria-expanded`, preceded by a decorative ▸ when collapsed and ▾
when expanded, hidden from assistive technology. Every item SHALL be collapsed when the answer arrives.
Activating an item's button with a pointer, Enter or Space SHALL toggle it: when expanded, a `pre` block
follows the button whose text content is exactly the evidence's `excerpt` as the API sent it (no line
numbers, no highlighting); when collapsed, that block is not in the document. Each item SHALL toggle
independently of the others.

#### Scenario: Evidence expands and collapses with a pointer

- **GIVEN** Screen 2 of acme-shop showing the answer of "An answered question shows the answer, its
  statements and its evidence", whose `ev-1` excerpt is «class PriceCalculator\n{\n    public function
  compute(Order $order): float\n}» (with its line breaks and leading spaces)
- **WHEN** the person presses the button «ev-1 · app/Services/PriceCalculator.php:16-44» with a pointer,
  then presses it again
- **THEN** before the first press both buttons have `aria-expanded="false"` and the document holds no
  `pre` element; after it the button has `aria-expanded="true"` and the only `pre` element's text content
  is exactly that excerpt; and after the second press the button has `aria-expanded="false"` and the
  document holds no `pre` element

#### Scenario: Evidence expands with the keyboard, one item at a time

- **GIVEN** Screen 2 of acme-shop showing the answer of "An answered question shows the answer, its
  statements and its evidence"
- **WHEN** the person presses Tab until the button «ev-2 · app/Services/ShippingService.php:12» has the
  focus, presses Enter, then presses Space
- **THEN** the button received the focus by keyboard; after Enter it has `aria-expanded="true"`, the
  excerpt of `ev-2` is shown, and the button of `ev-1` still has `aria-expanded="false"`; and after Space
  it has `aria-expanded="false"` and no `pre` element is in the document

#### Scenario: Repeated evidence is listed as received

- **GIVEN** Screen 2 of acme-shop, and `fetch` answering `200` with an answered question whose evidence is
  `ev-1` and `ev-2`, both `app/Observers/OrderObserver.php`, lines 14 to 28, with the same excerpt
- **WHEN** the person sends a question
- **THEN** the evidence list has two items, in order, named «ev-1 · app/Observers/OrderObserver.php:14-28»
  and «ev-2 · app/Observers/OrderObserver.php:14-28»; expanding the second leaves the first collapsed

### Requirement: How a question, an answer and an evidence location are written

A question SHALL be valid when its text, once trimmed of leading and trailing whitespace, has from 5 to
500 Unicode code points (an astral character counts as one), the limits of the API's ask body. A text
SHALL be split into plain fragments and code fragments at its back-quotes: each pair of back-quotes with
at least one character between them encloses a code fragment, read from left to right; a back-quote
without a pair, and an empty pair, stay as plain text. An evidence location SHALL be written
«<file>:<startLine>-<endLine>», or «<file>:<startLine>» when both lines are the same.

#### Scenario: Question length is counted in code points after trimming

- **GIVEN** the question check of Screen 2
- **WHEN** it is given, in turn, «¿Qué?», «  ¿Qué?  », «😀😀😀😀😀» (five astral characters), 500 times
  «a», «hola», «😀😀😀😀», 501 times «a», an empty text and «     »
- **THEN** the first four are valid, and the question sent for them is the text without its leading and
  trailing whitespace; the last five are not valid

#### Scenario: Back-quoted fragments are shown as code

- **GIVEN** the text splitter of Screen 2
- **WHEN** it is given «El método `compute()` de `PriceCalculator`.», then «sin código», then «una ` sin
  pareja», then «vacío `` aquí»
- **THEN** the first gives, in order, the plain «El método », the code «compute()», the plain « de », the
  code «PriceCalculator» and the plain «.»; the second gives only the plain «sin código»; the third gives
  only the plain «una ` sin pareja»; and the fourth gives only the plain «vacío `` aquí»

#### Scenario: Evidence locations name the file and its lines

- **GIVEN** the location writer of Screen 2
- **WHEN** it is given `app/Services/PriceCalculator.php` with lines 16 to 44, then
  `app/Services/ShippingService.php` with lines 12 to 12
- **THEN** it writes «app/Services/PriceCalculator.php:16-44», then «app/Services/ShippingService.php:12»

### Requirement: Provisional notice for what is not an answer

Until DIS-66 replaces them with the final states, every outcome of a sent question that is not an
answered question SHALL show a notice in the result area, never an empty area, and no heading
«Respuesta», statement or evidence:

| Outcome | Notice |
|---|---|
| `200` with `answer: 'UNKNOWN'` | an element with role `status` holding «Sin respuesta verificada (motivo: <reason>).» |
| an API error (the API's error format) | an element with role `alert` holding «No se ha podido obtener la respuesta.» and «Código: <code>.» |
| an unavailable API, or any other failure except the page's own abort | an element with role `alert` holding «No se ha podido obtener la respuesta.» and «La API de CODEMIND no responde.» |

The notice SHALL offer no retry button: sending a question again asks again ("Pending question"). The
notice SHALL NOT move the focus.

#### Scenario: An UNKNOWN shows the provisional status

- **GIVEN** Screen 2 of acme-shop, and `fetch` answering `200` with
  `{"answer":"UNKNOWN","reason":"no-anchor","statements":[],"evidence":[]}`
- **WHEN** the person sends «¿Por qué existe legacy_ref?»
- **THEN** an element with role `status` holds exactly «Sin respuesta verificada (motivo: no-anchor).»;
  there is no heading «Respuesta» nor «Evidencia», no ordered list and no element with role `alert`

#### Scenario: An API error shows the provisional alert with its code

- **GIVEN** Screen 2 of acme-shop, and `fetch` answering `429` with
  `{"error":{"code":"BUDGET_EXHAUSTED","message":"the daily LLM budget is exhausted","details":{"cacheOnly":true}}}`
- **WHEN** the person presses «¿Cómo se validan los cupones?»
- **THEN** one element with role `alert` holds «No se ha podido obtener la respuesta.» and «Código:
  BUDGET_EXHAUSTED.»; it holds no button; there is no heading «Respuesta» and no status «Buscando
  evidencia…»; and the focus is still on the pressed button

#### Scenario: An unavailable API shows the provisional alert

- **GIVEN** Screen 2 of acme-shop, in two runs where `fetch` rejects with a `TypeError`, and answers
  `500` with an empty body
- **WHEN** the person presses «¿Cómo se validan los cupones?» in each run
- **THEN** each time one element with role `alert` holds «No se ha podido obtener la respuesta.» and «La
  API de CODEMIND no responde.», and there is no heading «Respuesta»

### Requirement: Accessibility of Screen 2

Screen 2 SHALL have no `axe-core` violation in any of its states: before any question (the existing gate
of `web-foundation` → "Accessibility gate on the real routes", not edited), with a question pending, with
an answer whose first evidence is expanded, with the invalid-question message, with the provisional
status and with the provisional alert. The keyboard tab order of Screen 2 with an answer SHALL follow the
flow of the page: the back link, the field, the button «Preguntar», the suggested questions in order, and
the evidence buttons in order.

#### Scenario: Screen 2 has no axe violations in any of its states

- **GIVEN** a document with `lang="es"` and a title, and the routes of the web client at
  `/p/a794456d-6d1b-5b55-a360-13fec83dc7bc` with `fetch` replaced by a double for each state
- **WHEN** `axe-core` runs over the whole document with a question pending, with the answer of "An
  answered question shows the answer, its statements and its evidence" and `ev-1` expanded, with the
  invalid-question message, with the provisional status of an `UNKNOWN` and with the provisional alert of
  an API error
- **THEN** it reports zero violations in each of the five states

#### Scenario: The tab order follows question, suggestions and evidence

- **GIVEN** Screen 2 of acme-shop showing the answer of "An answered question shows the answer, its
  statements and its evidence", and the focus on the document body
- **WHEN** the person presses Tab eight times
- **THEN** the focus visits, in this order, the link «Volver a la selección de proyecto», the field
  «Pregunta», the button «Preguntar», the three suggested questions in their order, the button of `ev-1`
  and the button of `ev-2`
