## MODIFIED Requirements

### Requirement: Published Table 1

`readme.md` §2.6, Table 1 "Ahorro de contexto", SHALL have one row per sample project whose «Contexto
bruto» and «CODEMIND» cells are the JSON's integers (digits grouped by three with a space from 10 000
up), whose «Ahorro» is written from its tenths with one decimal and a decimal comma, a negative value
starting with `-` (hyphen-minus) and a non-negative one without sign (`88,3 %`, `-95,2 %`, or
`no definido` for a `null`), and whose «Correctas (de 20)» cell is the number of rows of that project
whose `verdict` is `correct` in `docs/measurements/answer-review/verdicts.csv` (capability
`answer-review`), written as a plain integer. When the
«Ahorro» of a project is below 0, the text below Table 1 SHALL contain a paragraph starting
`**Por qué CODEMIND envía más tokens que el contexto bruto.**` that explains it, the figures SHALL NOT
be adjusted, and the §0.3 sentence of `readme.md` SHALL NOT contain
`reduce coste y latencia de forma medida` and SHALL link Table 1 with the anchor `(#26-tests)`; when no
«Ahorro» is below 0, that paragraph SHALL be absent and the §0.3 sentence is left as it is. Its caption
SHALL NOT say `revisión manual` and SHALL NOT contain `~` (the set is exactly
`20 preguntas por repositorio`). The first paragraph after `#### Mediciones que se publicarán` SHALL
contain `npm run measure:context` and SHALL NOT contain `sigue pendiente`. Below the table, one line per project SHALL give its answered and `UNKNOWN` counts,
the verification share of tokens and latency, the cost share and the median latency, and one line SHALL
give the tokenizer deviation, all formatted from the JSON's integers, with a link to
`docs/measurements/context-savings.md`. Below the table, one more line per project SHALL give its
verdict counts and the reviewers' agreement, exactly
`` - `<fixture>`: <C> correctas, <P> parciales, <I> incorrectas (de 20); concordancia entre revisores <percent> % (<agreed>/<n>), kappa <kappa> ``,
with the counts from `verdicts.csv`, `percent` and `kappa` from
`docs/measurements/answer-review/agreement.json` written with a decimal comma and no trailing `,0`
(`95 %`, `92,5 %`, kappa `0,857`), and `no definido` for a `null` kappa; the text SHALL link
`docs/measurements/answer-review.md` and SHALL hold a paragraph starting
`**Qué dice la columna «Correctas».**` marked as the agent's text, written after `verdicts.csv` was
committed. The limitations paragraph SHALL NOT say the questions were asked
by the author and SHALL name: questions written by an agent and frozen before the run, one run, the
local 7.6B model, the estimated `baselineTokens` with its measured deviation (PH-16), the verification
ratio (PH-27), that a verification answered from the API's in-memory cache costs no token, the small
sample repositories built on purpose, the annotation of the Table 2 call sites by two independent
agents of different models (DIS-80), and the correctness verdicts of Table 1 given by
`dos agentes revisores independientes de modelos distintos` (DIS-82); neither it nor the text below
Table 1 SHALL say `revisión humana`. The review table row «Medir el verificador» SHALL NOT read
`Previsto`, and the §3.2 paragraph on `baseline_tokens` SHALL give the measured aggregate deviation.

#### Scenario: The README Table 1 agrees with the measurement

- **GIVEN** the committed `context-savings.json`
- **WHEN** Table 1 and the lines below it are parsed
- **THEN** the «Repositorio», «Contexto bruto», «CODEMIND» and «Ahorro» cells and the measurement
  lines equal the values formatted from the JSON, and the text links
  `docs/measurements/context-savings.md`

#### Scenario: A negative savings is explained

- **GIVEN** the committed `context-savings.json`
- **WHEN** the «Ahorro» of each project is read
- **THEN** if either is below 0, the README text below Table 1 holds the paragraph starting
  `**Por qué CODEMIND envía más tokens que el contexto bruto.**` and the §0.3 sentence does not contain
  `reduce coste y latencia de forma medida` and links `(#26-tests)`; otherwise the paragraph is absent

#### Scenario: The README limitations and verifier row are current

- **GIVEN** `readme.md`
- **WHEN** the first paragraph after `#### Mediciones que se publicarán`, the Table 1 caption, the
  limitations paragraph, the review-table row «Medir el verificador» and the §3.2 `baseline_tokens`
  paragraph are read
- **THEN** none says the author asked the questions or that the verifier measurement is `Previsto`,
  the first paragraph contains `npm run measure:context` and not `sigue pendiente`, the caption
  contains neither `revisión manual` nor `~`, the limitations name PH-16, PH-27, the verification
  cache, the small sample repositories and the two independent annotating agents, and the §3.2
  paragraph holds the formatted aggregate deviation

#### Scenario: The Correctas column agrees with the verdicts

- **GIVEN** the committed `verdicts.csv` and `agreement.json`
- **WHEN** the «Correctas (de 20)» cells of Table 1 and the lines below it are parsed
- **THEN** each cell is the number of `correct` rows of its project, each project's verdict line
  equals the line formatted from `verdicts.csv` and `agreement.json`, the text links
  `docs/measurements/answer-review.md` and holds the paragraph `**Qué dice la columna «Correctas».**`,
  the limitations contain `dos agentes revisores independientes de modelos distintos`, and no cell
  reads `pendiente de DIS-82` and neither the limitations nor the text below Table 1 say
  `revisión humana`

### Requirement: Measurement report

`docs/measurements/context-savings.md` SHALL hold `## Hashes SHA-256` (recorded before the run),
`## Método` (the inputs, the freeze check, the live checks, `useCache: false`, the raw data, the agent
who wrote the questions, and the sentence `Las preguntas se escribieron y congelaron antes de ver
ninguna respuesta.`), `## Entorno` (date, Ollama version, model and digest, verification model, whether
Ollama ran on CPU or GPU and that processor's model name, the `LLM_TIMEOUT_MS` used, the Ollama
context length used (`OLLAMA_CONTEXT_LENGTH=16384`), and that Ollama's log showed no
`truncating input prompt` during the published run), `## Resultados`
with the Table 1 figures, `## Verificador` (shares, median latency against the 10 s criterion of the
README, the largest number of verification calls of one answer against `MAX_VERIFY_CALLS_PER_ANSWER`,
the verification cache hits, with the agent's conclusion on that constant), `## Desviación del
estimador` and `## Limitaciones` (among them: the tokens spent on an `UNKNOWN` after a model call are not
in the `/ask` response and so not in Table 1, a verification answered from the API's in-memory cache
costs no token, the model recorded is the one of the script's environment, and «Correctas (de 20)»
comes from the blind review of the answers in `docs/measurements/answer-review.md`, linked, with no
sentence saying it is pending or `es de DIS-82`). Its figures SHALL equal the JSON's, formatted from
its integers.

#### Scenario: The report agrees with the measurement

- **GIVEN** the committed `context-savings.json` and `docs/measurements/context-savings.md`
- **WHEN** the report is parsed
- **THEN** every section is present, the figures of `## Resultados`, `## Verificador` and
  `## Desviación del estimador` equal the formatted JSON values, `## Entorno` names the JSON's Ollama
  version and model digest and contains `OLLAMA_CONTEXT_LENGTH=16384` and `truncating input prompt`,
  and `## Método` holds the freeze sentence

#### Scenario: The measurement report links the answer review

- **GIVEN** `docs/measurements/context-savings.md`
- **WHEN** its `## Limitaciones` section is read
- **THEN** it links `answer-review.md` and contains neither `es de DIS-82` nor `pendiente`
