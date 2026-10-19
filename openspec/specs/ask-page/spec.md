# ask-page Specification

## Purpose

Screen 2 of the CODEMIND web client: the person writes a question about a project, or presses one of its
suggested questions, and reads the answer with each statement marked as fact or inference and as
verified or not, and opens the code fragment each piece of evidence cites, without leaving the page.

## Requirements

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
evidence and its usage panel, an `UNKNOWN` state, or a notice ("Pending question", "Answer with typed and
verified statements", "Expandable evidence", "Usage panel", "UNKNOWN states", "Error, rate-limit and
budget notices"), and nothing before the first question. Screen 2 SHALL also hold, from the moment it
opens, the status region of "Screen reader announcements of Screen 2", empty before the first question.
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
  final de un pedido?», «¿Cómo se validan los cupones?» y «¿Qué hace OrderObserver al crear un
  pedido?» in this order; there is no heading «Respuesta» nor «Evidencia», no text «Buscando evidencia…»
  and no element with role `alert`; exactly one element has role `status`, and its text is empty; and
  the double recorded no request

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
focus on the field. Every invalid send SHALL insert the message as a new element, even when the message
is already shown after a previous invalid send, so that assistive technology announces it again. The
mark and the message SHALL go away as soon as the person changes the field's text, or sends a valid
question. The page checks only the length: any other rule of the API (such as U+0000) is reported by the
API's answer ("Error, rate-limit and budget notices").

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

#### Scenario: Sending the same invalid question again announces the message again

- **GIVEN** Screen 2 of acme-shop showing the message «Escribe una pregunta de 5 a 500 caracteres.» after
  the person wrote «hola» and pressed Enter, and `fetch` replaced by a double that records every request
  and never answers
- **WHEN** the person presses Enter again without changing the field
- **THEN** exactly one element with role `alert` holds the message, and it is not the element that held
  it before the second Enter (a new element was inserted); the field has `aria-invalid="true"` and that
  new element is its accessible description; the focus is on the field; and the double recorded no
  request

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
the text «Buscando evidencia…» (with U+2026), hidden from assistive technology, and the status region of
"Screen reader announcements of Screen 2" SHALL hold «Buscando evidencia…»: whatever the result area
showed before (an answer with its evidence and its usage panel, an `UNKNOWN` state, or a notice) SHALL be
removed when the question is sent, so an answer to another question is never shown. While a question is
pending, sending from the field, from the button «Preguntar» or from a suggested question SHALL send no
request and change nothing on the screen, the field's text included, whether or not the field holds a
valid question: no invalid mark and no message either. The page SHALL NOT set a time limit of its own (a
local model takes tens of seconds). Leaving the page SHALL abort the pending request, and that abort SHALL
show nothing. When the answer arrives, the focus SHALL stay where it is.

#### Scenario: Sending again while a question is pending sends no request

- **GIVEN** Screen 2 of acme-shop, and `fetch` replaced by a double that records every request and never
  answers
- **WHEN** the person presses «¿Cómo se calcula el precio final de un pedido?», then «¿Cómo se validan los
  cupones?», then presses Enter in the field, then presses «Preguntar»
- **THEN** the double recorded exactly one request, whose body holds «¿Cómo se calcula el precio final de
  un pedido?»; the field still holds that question; and the status «Buscando evidencia…» is shown

#### Scenario: An invalid send while a question is pending changes nothing

- **GIVEN** Screen 2 of acme-shop, and `fetch` replaced by a double that records every request and never
  answers
- **WHEN** the person presses «¿Cómo se calcula el precio final de un pedido?», then clears the field,
  writes «hola» and presses Enter
- **THEN** the double recorded exactly one request, whose body holds «¿Cómo se calcula el precio final de
  un pedido?»; the field holds «hola» and has no `aria-invalid="true"` and no accessible description; the
  message «Escribe una pregunta de 5 a 500 caracteres.» is not shown and there is no element with role
  `alert`; and the status «Buscando evidencia…» is shown

#### Scenario: A new question replaces what was shown

- **GIVEN** two runs: Screen 2 of acme-shop showing the answer of «¿Cómo se calcula el precio final de un
  pedido?»; and Screen 2 of acme-shop showing the alert of an unavailable API after `fetch` rejected with
  a `TypeError`; in each run `fetch` is then replaced by a double that records every request and never
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
the evidence ("Expandable evidence"); and the usage panel ("Usage panel"). In the answer text and in each
statement's text, every fragment between a pair of back-quotes SHALL be shown, without the back-quotes,
in a `code` element ("How a question, an answer and an evidence location are written"); no other markup
is interpreted and every text is rendered as text. Each statement item SHALL show its text, then a type
badge and a verification badge, then «Evidencia: » followed by the ids of the evidence it cites joined by
«, » (omitted when it cites none). The badges are, with their icon hidden from assistive technology and
the text always present (never colour alone):

| Value | Badge |
|---|---|
| type `FACT` | ● «HECHO», in the success colours |
| type `INFERENCE` | ⚠ «INFERIDO», in the warning colours |
| verification `entailed` | ✓ «verificado», in the success colours |
| verification `cited` | ○ «sin verificar», in the muted colours |

An `INFERENCE` item SHALL be drawn on the warning background with the warning border, and a `FACT` item
with the decorative success stripe. The status region SHALL hold «Respuesta recibida.» while the answer
is shown ("Screen reader announcements of Screen 2").

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
  «Evidencia» comes after the list; there is no text «Buscando evidencia…» and the element with role
  `status` holds «Respuesta recibida.»; and the focus is still on the pressed button

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

### Requirement: Usage panel

After the evidence of an answered question, the result area SHALL show a section on the canvas background
whose accessible name is its level-2 heading «Uso», hidden visually and present for assistive technology.
The section SHALL show, in this order: «Confianza» followed by the confidence; the tokens of the answer
(input plus output tokens) as a count of «token» / «tokens»; the cost; the latency — these four figures
separated by « · » hidden from assistive technology —; the savings badge; the cache badge; and the
baseline line «<baseline tokens> sin selección de contexto → <input tokens> con CODEMIND», the baseline
written as a count of «token» / «tokens» and the input tokens as a number. Every figure is written as in
"How usage figures and notice details are written". The badges are, always with their text (never colour
alone):

| Value | Badge |
|---|---|
| `savingsPct`, rounded to one decimal, greater than 0 | «ahorro <savings> % vs bruto», in the success colours |
| `savingsPct`, rounded to one decimal, 0 or less | «sin ahorro vs bruto», in the muted colours |
| `cacheHit` `true` | «caché ✓», the ✓ hidden from assistive technology, in the accent colours |
| `cacheHit` `false` | «sin caché», in the muted colours |

The section SHALL hold no link, button or field. An `UNKNOWN` SHALL show no usage panel (the API sends no
usage nor confidence with it).

#### Scenario: An answer from the model shows its usage panel

- **GIVEN** Screen 2 of acme-shop, and `fetch` answering `200` with the answered question of "An answered
  question shows the answer, its statements and its evidence", whose `confidence` is `0.71` and whose
  `usage` has `inputTokens` 4000, `outputTokens` 812, `baselineTokens` 41200, `savingsPct` 88, `costUsd`
  0.014, `latencyMs` 2100 and `cacheHit` `false`
- **WHEN** the person presses «¿Cómo se calcula el precio final de un pedido?»
- **THEN** a region named «Uso», whose level-2 heading is «Uso», comes after the heading «Evidencia» and
  after every evidence button; its text holds, in this order, «Confianza», «0.71», «4 812 tokens»,
  «$0.014», «2.1 s», «ahorro 88 % vs bruto», «sin caché» and «41 200 tokens sin selección de contexto →
  4 000 con CODEMIND», each digit group separated by a no-break space (U+00A0); every « · » of the region
  is inside an element hidden from assistive technology; and the region holds no link, button or field

#### Scenario: A cache hit shows its usage panel

- **GIVEN** Screen 2 of acme-shop, and `fetch` answering `200` with the answered question of "An answered
  question shows the answer, its statements and its evidence" but with `confidence` `0.7772998611746911`
  and a `usage` with `inputTokens` 0, `outputTokens` 0, `baselineTokens` 7123, `savingsPct` 100,
  `costUsd` 0, `latencyMs` 12 and `cacheHit` `true`
- **WHEN** the person presses «¿Cómo se calcula el precio final de un pedido?»
- **THEN** the region «Uso» holds, in this order, «Confianza», «0.78», «0 tokens», «$0», «12 ms»,
  «ahorro 100 % vs bruto», «caché ✓» and «7 123 tokens sin selección de contexto → 0 con CODEMIND»; the
  ✓ of the cache badge is inside an element hidden from assistive technology; and the region holds no
  text «sin caché»

#### Scenario: No saving is not shown as a saving

- **GIVEN** Screen 2 of acme-shop, in two runs where `fetch` answers `200` with the answered question of
  "An answered question shows the answer, its statements and its evidence" whose `savingsPct` is `-24.9`
  in the first run and `0` in the second
- **WHEN** the person presses «¿Cómo se calcula el precio final de un pedido?» in each run
- **THEN** in each run the region «Uso» holds «sin ahorro vs bruto» and no text «ahorro -», «ahorro 0»
  nor «%»

#### Scenario: The usage panel and the states follow the wireframe

- **GIVEN** the web client and the API running locally in evaluation mode, with the seed and the golden
  answers loaded
- **WHEN** a browser opens Screen 2 of acme-shop, presses «¿Cómo se calcula el precio final de un
  pedido?», then sends a question with no anchor in the code, then a free question that names a class of
  acme-shop, then presses «¿Cómo se calcula el precio final de un pedido?» again; and, with the API
  stopped, presses «¿Cómo se validan los cupones?»
- **THEN** the usage strip is drawn as the wireframe's (one band in the canvas colour after the evidence,
  with no visible heading «Uso»; the figures in one line that, at 320 px wide, wraps without clipping any
  text; the green savings badge, the blue «caché ✓» badge and the baseline line under them); the `UNKNOWN` state is drawn in the muted colours, the configuration notice
  in the blue accent colours and the alert in the yellow warning colours; the text of the status region
  («Respuesta recibida.» and the others) is never visible on the page (validated in the manual interface
  test and in `/show-spec-working`, with screenshots saved next to the report and next to the wireframe)

### Requirement: How usage figures and notice details are written

Every figure SHALL be written with a point as the decimal separator, the same in every browser locale and
time zone:

| Figure | Written |
|---|---|
| confidence | with exactly two decimals («0.71», «1.00») |
| a count of tokens | as Screen 1 writes its counts: digit groups of three from 1 000 up separated by U+00A0, then « token» for exactly 1 and « tokens» otherwise |
| the input tokens of the baseline line | the number with its digit groups, without a noun |
| cost | «$0» when it is 0; «< $0.001» when it is greater than 0 and rounds to 0.000; otherwise «$» and the amount with exactly three decimals |
| latency | «<n> ms» under 1 000 ms; otherwise the seconds with exactly one decimal and « s» |
| savings | rounded to one decimal; when the rounded value is greater than 0, «ahorro <savings> % vs bruto» with that value and no trailing «.0»; otherwise «sin ahorro vs bruto», so no badge reads «ahorro 0 %» |

The details of an API error SHALL be read only when they have the expected type and form, and are
otherwise treated as absent: the reset time of an exhausted budget is `details.resetsAt` when it is a
string of the form `YYYY-MM-DDTHH:MM`, optionally followed by seconds and fractions, and then `Z` or an
offset `±HH:MM`, that denotes a real instant; it is written in UTC as «<YYYY-MM-DD> a las <HH:MM> UTC». The
wait of a rate limit is `details.retryAfterSeconds` when it is a whole number of 1 or more.

#### Scenario: Confidence is written with two decimals

- **GIVEN** the usage writer of Screen 2
- **WHEN** it is given the confidences `0.71`, `0.7772998611746911`, `0.6222`, `1` and `0`
- **THEN** it writes «0.71», «0.78», «0.62», «1.00» and «0.00»

#### Scenario: Tokens are counted with grouped digits

- **GIVEN** the usage writer of Screen 2
- **WHEN** it is given the token pairs (input, output) `(4000, 812)`, `(0, 0)`, `(1, 0)` and the baseline
  lines (baseline, input) `(41200, 4000)`, `(7123, 0)`, `(1, 1)` and `(1234567, 12345)`
- **THEN** it writes «4 812 tokens», «0 tokens», «1 token», then «41 200 tokens sin selección de contexto
  → 4 000 con CODEMIND», «7 123 tokens sin selección de contexto → 0 con CODEMIND», «1 token sin selección
  de contexto → 1 con CODEMIND» and «1 234 567 tokens sin selección de contexto → 12 345 con CODEMIND»,
  every digit group separated by U+00A0

#### Scenario: Cost is written in dollars

- **GIVEN** the usage writer of Screen 2
- **WHEN** it is given the costs `0`, `0.0004`, `0.014`, `0.0123` and `1.23456`
- **THEN** it writes «$0», «< $0.001», «$0.014», «$0.012» and «$1.235»

#### Scenario: Latency is written in milliseconds or seconds

- **GIVEN** the usage writer of Screen 2
- **WHEN** it is given the latencies `12`, `999`, `1000`, `2100` and `539201` (milliseconds)
- **THEN** it writes «12 ms», «999 ms», «1.0 s», «2.1 s» and «539.2 s»

#### Scenario: Savings are written only when there are savings

- **GIVEN** the usage writer of Screen 2
- **WHEN** it is given the savings `88`, `88.3`, `100`, `0`, `-24.9`, `0.04` and `-0.04`
- **THEN** it writes «ahorro 88 % vs bruto», «ahorro 88.3 % vs bruto», «ahorro 100 % vs bruto», and «sin
  ahorro vs bruto» for the other four

#### Scenario: The budget reset time is written in UTC

- **GIVEN** the notice reader of Screen 2
- **WHEN** it is given, as `resetsAt`, «2026-10-20T00:00:00.000Z», «2026-10-20T02:00:00+02:00»,
  «2026-10-20», «mañana», «2026-13-45T00:00:00Z», the number `1760918400000` and no value
- **THEN** it writes «2026-10-20 a las 00:00 UTC» for the first two and no reset time for the other five

#### Scenario: The wait of a rate limit is read only when it is a whole number of seconds

- **GIVEN** the notice reader of Screen 2
- **WHEN** it is given, as `retryAfterSeconds`, `42`, `1`, `0`, `-1`, `1.5`, the text «42» and no value
- **THEN** it reads a wait of 42 and of 1 seconds for the first two and no wait for the other five

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

### Requirement: UNKNOWN states

When the API answers `200` with `answer: 'UNKNOWN'`, the result area SHALL show a state, never an empty
area, with no heading «Respuesta» nor «Evidencia», no statement list, no usage panel and no element with
role `alert`. The state holds no control and no live role (the status region announces it, "Screen reader
announcements of Screen 2"). Every text of the API is rendered as text.

- **Reason `llm-required`** — the configuration notice, in the accent colours: a level-2 heading «Hace
  falta un modelo de lenguaje»; the paragraph «La API está en modo evaluación: solo responde las preguntas
  que tiene en caché. Para preguntas libres, configura las variables LLM_* de la API y reiníciala.» with
  «LLM_*» in a `code` element; only when the project has suggested questions, «Las preguntas sugeridas
  siguen respondiendo desde la caché.»; and only when the API sent a `message`, «Mensaje de la API:
  <message>».
- **Any other reason** — the state without evidence, in the muted colours, with a decorative ○ hidden
  from assistive technology: a level-2 heading «Sin respuesta verificada», the sentence of its reason, and
  «Motivo: <reason>».

| Reason | Sentence |
|---|---|
| `no-anchor` | «La pregunta no nombra nada que CODEMIND encuentre en el código de este proyecto (ningún símbolo ni fichero), así que no hay evidencia en la que apoyar una respuesta. CODEMIND prefiere no inventarla.» |
| `over-budget` | «Ningún fragmento de código relevante cabe en el presupuesto de tokens de la consulta.» |
| `invalid-model-output` | «El modelo devolvió una respuesta con un formato no válido y se ha descartado.» |
| `no-evidence` | «El modelo no dio ninguna afirmación apoyada en evidencia.» |
| `broken-evidence` | «Ninguna cita del modelo coincide con el código del proyecto y se ha descartado la respuesta.» |
| any other value | «CODEMIND no ha encontrado evidencia suficiente para dar una respuesta verificada.» |

#### Scenario: An UNKNOWN without anchors explains that there is no evidence

- **GIVEN** Screen 2 of acme-shop, and `fetch` answering `200` with
  `{"answer":"UNKNOWN","reason":"no-anchor","statements":[],"evidence":[]}`
- **WHEN** the person writes «¿Por qué existe legacy_ref?» and presses Enter
- **THEN** a level-2 heading «Sin respuesta verificada» is shown, followed by the sentence of
  `no-anchor` and by «Motivo: no-anchor»; the ○ is inside an element hidden from assistive technology;
  there is no heading «Respuesta» nor «Evidencia», no ordered list, no region «Uso», no button after the
  group «Prueba:» and no element with role `alert`; and the focus is still on the field

#### Scenario: Every other reason without evidence has its own sentence

- **GIVEN** Screen 2 of acme-shop, in five runs where `fetch` answers `200` with an `UNKNOWN` whose
  `reason` is `over-budget`, `invalid-model-output`, `no-evidence`, `broken-evidence` and
  `a-future-reason`
- **WHEN** the person presses «¿Cómo se validan los cupones?» in each run
- **THEN** each run shows the heading «Sin respuesta verificada», the sentence of its reason in the
  table (the last one for `a-future-reason`) and «Motivo: <reason>»; and no element with role `alert`

#### Scenario: An UNKNOWN that needs a language model shows the configuration notice

- **GIVEN** Screen 2 of acme-shop, and `fetch` answering `200` with
  `{"answer":"UNKNOWN","reason":"llm-required","message":"evaluation mode (cache-only): set LLM_* to enable free-form asks","statements":[],"evidence":[]}`
- **WHEN** the person writes «¿Qué hace OrderService?» and presses Enter
- **THEN** a level-2 heading «Hace falta un modelo de lenguaje» is shown, followed by the paragraph of
  the configuration notice with «LLM_*» as the text of its `code` element, by «Las preguntas sugeridas
  siguen respondiendo desde la caché.» and by «Mensaje de la API: evaluation mode (cache-only): set LLM_*
  to enable free-form asks»; there is no text «Sin respuesta verificada» nor «Motivo:», no heading
  «Respuesta», no region «Uso» and no element with role `alert`; and the focus is still on the field

#### Scenario: Texts of the API in a state are shown as text

- **GIVEN** Screen 2 of acme-shop, and `fetch` answering `200` with
  `{"answer":"UNKNOWN","reason":"llm-required","message":"<img src=x onerror=alert(1)>","statements":[],"evidence":[]}`
- **WHEN** the person writes «¿Qué hace OrderService?» and presses Enter
- **THEN** the configuration notice holds the text «Mensaje de la API: <img src=x onerror=alert(1)>»; and
  the main landmark holds no `img` element

#### Scenario: The configuration notice of a project without suggested questions

- **GIVEN** Screen 2 of the project `0b5c7f2e-1d3a-4e6b-8f90-1a2b3c4d5e6f`, and `fetch` answering `200`
  with `{"answer":"UNKNOWN","reason":"llm-required","statements":[],"evidence":[]}` (no `message`)
- **WHEN** the person writes «¿Qué hace OrderService?» and presses Enter
- **THEN** the heading «Hace falta un modelo de lenguaje» and the paragraph of the configuration notice
  are shown; and there is no text «Las preguntas sugeridas siguen respondiendo desde la caché.» nor
  «Mensaje de la API:»

### Requirement: Error, rate-limit and budget notices

Every failure of a sent question, except the page's own abort, SHALL show in the result area exactly one
element with role `alert`, in the warning colours, with a decorative ⚠ hidden from assistive technology,
holding first «No se ha podido obtener la respuesta.» and then the lines of its case; never an empty
area, and no heading «Respuesta», no usage panel and no button. The notice SHALL NOT move the focus, and
it offers no retry: sending a question again asks again ("Pending question"). An API error is told apart
by the code of the API's error format, whatever its HTTP status:

| Failure | Lines after «No se ha podido obtener la respuesta.» |
|---|---|
| `BUDGET_EXHAUSTED` | «Se ha agotado el presupuesto diario del modelo de lenguaje.», «Las preguntas que ya están en caché siguen respondiendo, sin coste.», when the details hold a reset time «El presupuesto se renueva el <reset time>.», and «Código: BUDGET_EXHAUSTED.» |
| `RATE_LIMITED` | «Demasiadas peticiones seguidas a la API.», «Espera <wait> s y vuelve a preguntar.» when the details hold a wait and «Espera un momento y vuelve a preguntar.» otherwise, and «Código: RATE_LIMITED.» |
| `PROJECT_NOT_FOUND` | «La API no tiene este proyecto: vuelve a la selección de proyecto o indéxalo con la CLI.» and «Código: PROJECT_NOT_FOUND.» |
| `LLM_UNAVAILABLE` | «El modelo de lenguaje no responde; las preguntas en caché siguen respondiendo.» and «Código: LLM_UNAVAILABLE.» |
| `SOURCE_UNAVAILABLE` | «La API no puede leer el código del proyecto.» and «Código: SOURCE_UNAVAILABLE.» |
| any other code | «Código: <code>.» |
| an unavailable API (the request fails, or the answer is not the API's error format) | «La API de CODEMIND no responde.» |

The reset time and the wait are read and written as in "How usage figures and notice details are
written". Only `BUDGET_EXHAUSTED` and `LLM_UNAVAILABLE` say that cached questions still answer.

#### Scenario: An exhausted budget says the cached questions still answer

- **GIVEN** Screen 2 of acme-shop, in two runs where `fetch` answers `429` with
  `{"error":{"code":"BUDGET_EXHAUSTED","message":"the daily LLM budget is exhausted","details":{"spentUsd":5,"dailyBudgetUsd":5,"resetsAt":"2026-10-20T00:00:00.000Z","cacheOnly":true}}}`
  in the first and with the same body whose `details` is `{"cacheOnly":true}` in the second
- **WHEN** the person presses «¿Cómo se validan los cupones?» in each run
- **THEN** in the first run one element with role `alert` holds, in this order, «No se ha podido obtener
  la respuesta.», «Se ha agotado el presupuesto diario del modelo de lenguaje.», «Las preguntas que ya
  están en caché siguen respondiendo, sin coste.», «El presupuesto se renueva el 2026-10-20 a las 00:00
  UTC.» and «Código: BUDGET_EXHAUSTED.»; in the second it holds the same lines except «El presupuesto se
  renueva…»; in both it holds no button, its ⚠ is inside an element hidden from assistive technology,
  there is no heading «Respuesta», the element with role `status` is empty, and the focus is still on the
  pressed button

#### Scenario: A rate limit says how long to wait

- **GIVEN** Screen 2 of acme-shop, in two runs where `fetch` answers `429` with
  `{"error":{"code":"RATE_LIMITED","message":"too many requests","details":{"retryAfterSeconds":42}}}` in
  the first and with the same body whose `details` is `{}` in the second
- **WHEN** the person presses «¿Cómo se validan los cupones?» in each run
- **THEN** the element with role `alert` holds, in this order, «No se ha podido obtener la respuesta.»,
  «Demasiadas peticiones seguidas a la API.», «Espera 42 s y vuelve a preguntar.» (in the second run
  «Espera un momento y vuelve a preguntar.») and «Código: RATE_LIMITED.»; it holds no text «caché»; and
  the focus is still on the pressed button

#### Scenario: An API error names its code

- **GIVEN** Screen 2 of acme-shop, in five runs where `fetch` answers in the API's error format `404`
  `PROJECT_NOT_FOUND`, `503` `LLM_UNAVAILABLE`, `503` `SOURCE_UNAVAILABLE`, `500` `INTERNAL` and `500` with
  the code «<i>X</i>», each with `details` `{}`
- **WHEN** the person presses «¿Cómo se validan los cupones?» in each run
- **THEN** the element with role `alert` holds, in this order, «No se ha podido obtener la respuesta.»,
  the sentence of its code in the table (none for `INTERNAL` nor «<i>X</i>») and «Código: <code>.», the
  last run's as the text «Código: <i>X</i>.»; the main landmark holds no `i` element; and the alert holds
  no button

#### Scenario: An unavailable API says so

- **GIVEN** Screen 2 of acme-shop, in two runs where `fetch` rejects with a `TypeError`, and answers
  `500` with an empty body
- **WHEN** the person presses «¿Cómo se validan los cupones?» in each run
- **THEN** each time one element with role `alert` holds exactly «No se ha podido obtener la respuesta.»
  and «La API de CODEMIND no responde.», with no text «Código:», and there is no heading «Respuesta»

### Requirement: Screen reader announcements of Screen 2

Screen 2 SHALL hold, from the moment it opens, exactly one element with role `status`, hidden visually,
whose text is: empty before the first question; «Buscando evidencia…» while a question is pending;
«Respuesta recibida.» while an answered question is shown; «Sin respuesta verificada.» while an `UNKNOWN`
other than `llm-required` is shown; «Hace falta un modelo de lenguaje.» while the configuration notice is
shown; and empty while an alert of "Error, rate-limit and budget notices" is shown (the alert announces
itself). It SHALL remain the same element across every state, so that each change of its text is
announced. An invalid send SHALL NOT change it. No other element of Screen 2 has role `status`, and the
`UNKNOWN` states and the usage panel have neither role `status` nor role `alert`.

#### Scenario: The status region announces every outcome

- **GIVEN** Screen 2 of acme-shop, and `fetch` answering, in turn, `200` with the answered question of "An
  answered question shows the answer, its statements and its evidence", `200` with an `UNKNOWN`
  `no-anchor`, `200` with an `UNKNOWN` `llm-required`, and `429` `BUDGET_EXHAUSTED`
- **WHEN** the person presses «¿Cómo se calcula el precio final de un pedido?»; then sends «hola»; then
  writes «¿Por qué existe legacy_ref?» and presses Enter; then writes «¿Qué hace OrderService?» and
  presses Enter; then presses «¿Cómo se validan los cupones?»
- **THEN** exactly one element has role `status` throughout and it is the same element as when the page
  opened; its text is empty on open, «Respuesta recibida.» once the answer is shown and still after
  «hola», «Sin respuesta verificada.» after the third send, «Hace falta un modelo de lenguaje.» after the
  fourth, and empty once the alert of the fifth is shown

#### Scenario: The pending text is not read twice

- **GIVEN** Screen 2 of acme-shop, and `fetch` replaced by a double that never answers
- **WHEN** the person presses «¿Cómo se calcula el precio final de un pedido?»
- **THEN** the text «Buscando evidencia…» is in the document twice: once as the whole text of the only
  element with role `status`, and once inside the result area in an element hidden from assistive
  technology

### Requirement: Accessibility of Screen 2

Screen 2 SHALL have no `axe-core` violation in any of its states: before any question (the existing gate
of `web-foundation` → "Accessibility gate on the real routes", not edited), with a question pending, with
an answer from the model whose first evidence is expanded and whose usage panel is shown, with an answer
from the cache, with the invalid-question message, with the `UNKNOWN` state of `no-anchor`, with the
configuration notice of `llm-required`, and with the alerts of an exhausted budget, a rate limit, another
API error and an unavailable API. The keyboard tab order of Screen 2 with an answer SHALL follow the flow
of the page: the back link, the field, the button «Preguntar», the suggested questions in order, and the
evidence buttons in order. The usage panel, the `UNKNOWN` states and the notices SHALL add no tab stop and
SHALL NOT move the focus. Every control of Screen 2 SHALL show a visible focus indicator when it receives
the focus from the keyboard.

#### Scenario: Screen 2 has no axe violations in any of its states

- **GIVEN** a document with `lang="es"` and a title, and the routes of the web client at
  `/p/a794456d-6d1b-5b55-a360-13fec83dc7bc` with `fetch` replaced by a double for each state
- **WHEN** `axe-core` runs over the whole document with a question pending; with the answer of "An
  answered question shows the answer, its statements and its evidence", its usage panel and `ev-1`
  expanded; with the cache hit of "A cache hit shows its usage panel"; with the invalid-question message;
  with the `UNKNOWN` state of `no-anchor`; with the configuration notice of `llm-required`; and with the
  alerts of `429` `BUDGET_EXHAUSTED`, `429` `RATE_LIMITED`, `503` `LLM_UNAVAILABLE` and a `fetch` that
  rejects with a `TypeError`
- **THEN** it reports zero violations in each of the ten states

#### Scenario: The tab order follows question, suggestions and evidence

- **GIVEN** Screen 2 of acme-shop showing the answer of "An answered question shows the answer, its
  statements and its evidence", and the focus on the document body
- **WHEN** the person presses Tab eight times
- **THEN** the focus visits, in this order, the link «Volver a la selección de proyecto», the field
  «Pregunta», the button «Preguntar», the three suggested questions in their order, the button of `ev-1`
  and the button of `ev-2`

#### Scenario: The result states add no tab stop

- **GIVEN** Screen 2 of acme-shop, in five runs where `fetch` answers with the answer of "An answered
  question shows the answer, its statements and its evidence", with the `UNKNOWN` `no-anchor`, with the
  `UNKNOWN` `llm-required` and its message, with `429` `BUDGET_EXHAUSTED`, and rejects with a `TypeError`
- **WHEN** the person presses «¿Cómo se validan los cupones?» in each run and the result is shown
- **THEN** in each run the focus is still on the pressed button; and every link, button, field and
  element with a `tabindex` of the main landmark that comes after the group «Prueba:» is an evidence
  button: the two evidence buttons in the first run, and none in the other four

#### Scenario: The focus is visible on every control

- **GIVEN** the web client and the API running locally in evaluation mode, with the seed and the golden
  answers loaded
- **WHEN** a browser opens Screen 2 of acme-shop, presses «¿Cómo se calcula el precio final de un
  pedido?», and the person moves through the page with Tab and Shift+Tab
- **THEN** each control (the back link, the field, the button «Preguntar», the suggested questions and
  the evidence buttons) shows a visible outline while it has the focus, and the usage panel is never
  focused (validated in the manual interface test and in `/show-spec-working`, with screenshots saved
  next to the report)
</content>
