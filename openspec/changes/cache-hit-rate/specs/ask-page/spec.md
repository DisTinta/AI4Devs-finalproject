## MODIFIED Requirements

### Requirement: Usage panel

After the evidence of an answered question, the result area SHALL show a section on the canvas background
whose accessible name is its level-2 heading «Uso», hidden visually and present for assistive technology.
The section SHALL show, in this order: «Confianza» followed by the confidence; the tokens of the answer
(input plus output tokens) as a count of «token» / «tokens»; the cost; the latency — these four figures
separated by « · » hidden from assistive technology —; the savings badge; the cache badge; the
baseline line «<baseline tokens> sin selección de contexto → <input tokens> con CODEMIND», the baseline
written as a count of «token» / «tokens» and the input tokens as a number; and, under it, the project
cache line of `usage.projectCache` (the cache hit rate of the project, `http-ask`, "Ask answered
response"), in the muted text colour. Every figure is written as in "How usage figures and notice details
are written". The badges are, always with their text (never colour alone):

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
  0.014, `latencyMs` 2100, `cacheHit` `false` and `projectCache` `{ queries: 10, cacheHits: 4,
  hitRatePct: 40 }`
- **WHEN** the person presses «¿Cómo se calcula el precio final de un pedido?»
- **THEN** a region named «Uso», whose level-2 heading is «Uso», comes after the heading «Evidencia» and
  after every evidence button; its text holds, in this order, «Confianza», «0.71», «4 812 tokens»,
  «$0.014», «2.1 s», «ahorro 88 % vs bruto», «sin caché», «41 200 tokens sin selección de contexto →
  4 000 con CODEMIND» and «Caché del proyecto: 40 % de aciertos (4 de 10 consultas)», each digit group
  separated by a no-break space (U+00A0); every « · » of the region is inside an element hidden from
  assistive technology; and the region holds no link, button or field

#### Scenario: A cache hit shows its usage panel

- **GIVEN** Screen 2 of acme-shop, and `fetch` answering `200` with the answered question of "An answered
  question shows the answer, its statements and its evidence" but with `confidence` `0.7772998611746911`
  and a `usage` with `inputTokens` 0, `outputTokens` 0, `baselineTokens` 7123, `savingsPct` 100,
  `costUsd` 0, `latencyMs` 12, `cacheHit` `true` and `projectCache` `{ queries: 1, cacheHits: 1,
  hitRatePct: 100 }`
- **WHEN** the person presses «¿Cómo se calcula el precio final de un pedido?»
- **THEN** the region «Uso» holds, in this order, «Confianza», «0.78», «0 tokens», «$0», «12 ms»,
  «ahorro 100 % vs bruto», «caché ✓», «7 123 tokens sin selección de contexto → 0 con CODEMIND» and
  «Caché del proyecto: 100 % de aciertos (1 de 1 consulta)»; the ✓ of the cache badge is inside an
  element hidden from assistive technology; and the region holds no text «sin caché»

#### Scenario: No saving is not shown as a saving

- **GIVEN** Screen 2 of acme-shop, in two runs where `fetch` answers `200` with the answered question of
  "An answered question shows the answer, its statements and its evidence" whose `savingsPct` is `-24.9`
  in the first run and `0` in the second
- **WHEN** the person presses «¿Cómo se calcula el precio final de un pedido?» in each run
- **THEN** in each run the region «Uso» holds «sin ahorro vs bruto» and no text «ahorro -», «ahorro 0»
  nor «%» before the project cache line

#### Scenario: A project without logged queries shows no hit rate

- **GIVEN** Screen 2 of acme-shop, and `fetch` answering `200` with the answered question of "An answered
  question shows the answer, its statements and its evidence" whose `usage.projectCache` is
  `{ queries: 0, cacheHits: 0, hitRatePct: null }`
- **WHEN** the person presses «¿Cómo se calcula el precio final de un pedido?»
- **THEN** the region «Uso» ends with «Caché del proyecto: sin consultas», holds no text «de aciertos»
  nor «null», and holds no link, button or field

#### Scenario: The usage panel and the states follow the wireframe

- **GIVEN** the web client and the API running locally in evaluation mode, with the seed and the golden
  answers loaded
- **WHEN** a browser opens Screen 2 of acme-shop, presses «¿Cómo se calcula el precio final de un
  pedido?», then sends a question with no anchor in the code, then a free question that names a class of
  acme-shop, then presses «¿Cómo se calcula el precio final de un pedido?» again; and, with the API
  stopped, presses «¿Cómo se validan los cupones?»
- **THEN** the usage strip is drawn as the wireframe's (one band in the canvas colour after the evidence,
  with no visible heading «Uso»; the figures in one line that, at 320 px wide, wraps without clipping any
  text; the green savings badge, the blue «caché ✓» badge and the baseline line under them, and the
  project cache line under the baseline line in the muted text colour, wrapping at 320 px without
  clipping); the `UNKNOWN` state is drawn in the muted colours, the configuration notice
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
| project cache line | «Caché del proyecto: sin consultas» when `hitRatePct` is `null`; otherwise «Caché del proyecto: <hitRatePct> % de aciertos (<cacheHits> de <queries> consulta)» for exactly 1 query and «… consultas)» otherwise, `hitRatePct` with at most one decimal and no trailing «.0», and both counts with the digit groups of a count of tokens, without a noun of their own |

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

#### Scenario: The project cache line is written with its counts

- **GIVEN** the usage writer of Screen 2
- **WHEN** it is given the project caches (queries, cache hits, hit rate) `(10, 4, 40)`, `(3, 1, 33.3)`,
  `(1, 0, 0)`, `(1, 1, 100)`, `(12345, 1234, 10)` and `(0, 0, null)`
- **THEN** it writes «Caché del proyecto: 40 % de aciertos (4 de 10 consultas)», «Caché del proyecto:
  33.3 % de aciertos (1 de 3 consultas)», «Caché del proyecto: 0 % de aciertos (0 de 1 consulta)»,
  «Caché del proyecto: 100 % de aciertos (1 de 1 consulta)», «Caché del proyecto: 10 % de aciertos
  (1 234 de 12 345 consultas)», the digit groups separated by U+00A0, and «Caché del proyecto: sin
  consultas»

#### Scenario: The budget reset time is written in UTC

- **GIVEN** the notice reader of Screen 2
- **WHEN** it is given, as `resetsAt`, «2026-10-20T00:00:00.000Z», «2026-10-20T02:00:00+02:00»,
  «2026-10-20», «mañana», «2026-13-45T00:00:00Z», the number `1760918400000` and no value
- **THEN** it writes «2026-10-20 a las 00:00 UTC» for the first two and no reset time for the other five

#### Scenario: The wait of a rate limit is read only when it is a whole number of seconds

- **GIVEN** the notice reader of Screen 2
- **WHEN** it is given, as `retryAfterSeconds`, `42`, `1`, `0`, `-1`, `1.5`, the text «42» and no value
- **THEN** it reads a wait of 42 and of 1 seconds for the first two and no wait for the other five
