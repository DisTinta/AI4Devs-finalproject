## Purpose

Measures, with a real model through the running API, how many tokens CODEMIND sends against the raw
context it replaces on 20 frozen questions per sample repository, how much of that is the verifier, and
how far the local token estimate is from the provider's count, and publishes Table 1 of the README and
its report from versioned raw data that anyone can re-aggregate.

## ADDED Requirements

### Requirement: Freeze check before measuring

`npm run measure:context` (`node scripts/measure-context.mjs`) SHALL, after parsing the arguments,
loading `.env` and reading `PORT`, and before reading any other input and before any network call, compare every file
listed in the `## Hashes SHA-256` table of `docs/measurements/context-savings.md` with the SHA-256
recorded there, with the same freeze check as `graph-annotations` → "Frozen annotations and agreement
report". The table SHALL list `docs/measurements/context/questions.json`. When the report cannot be
read, records no hash, or a listed file is unreadable or differs from its hash, the command SHALL exit
with code 1, write one stderr line per problem naming the file, send no request and write nothing. A
problem about the report itself SHALL be written prefixed `docs/measurements/context-savings.md: `.

#### Scenario: A frozen question file was modified

- **GIVEN** a temporary copy of the inputs whose `docs/measurements/context/questions.json` has one byte
  changed after its hash was recorded
- **WHEN** `node scripts/measure-context.mjs --root <copy>` runs with a fake sender
- **THEN** it exits with code 1, stderr has one line naming `docs/measurements/context/questions.json`,
  the sender received no request, and no file under `docs/measurements/context/` other than
  `questions.json` exists or changed in the copy

#### Scenario: The savings report records no hash

- **GIVEN** a temporary copy whose `docs/measurements/context-savings.md` has no `## Hashes SHA-256` row
- **WHEN** the command runs with `--root <copy>`
- **THEN** it exits with code 1 with one stderr line starting `docs/measurements/context-savings.md: `,
  the sender received no request, and nothing is written

### Requirement: The question set

`docs/measurements/context/questions.json` SHALL have `formatVersion` 1 and, for each sample project in
the order `acme-shop`, `task-api`, exactly 20 questions with the ids `Q01` to `Q20` in that order, each
with a `question` of 5 to 500 Unicode code points that is not only whitespace and an `expected` of
`answer` or `unknown` declared before the run, and at least two questions with `expected` `unknown`.
The command SHALL check the shape, the ids, the lengths, the `expected` values and the count of
`unknown`; any other shape SHALL make it exit with code 1, naming the file and the problem on stderr,
before any request. Each project SHALL also hold the exact texts of its golden questions; that rule SHALL
be checked by `tests/unit/docs/context-savings.spec.ts` against `GOLDEN_PROJECTS` of
`packages/cli/src/cache/demo-questions.ts`, not by the command (a `scripts/*.mjs` cannot import
TypeScript).

#### Scenario: A project has 19 questions

- **GIVEN** a question file whose `task-api` entry holds 19 questions, recorded with its new hash
- **WHEN** the command runs with `--root <copy>`
- **THEN** it exits with code 1, stderr names `docs/measurements/context/questions.json` and `task-api`,
  and the sender received no request

#### Scenario: The committed question set is complete

- **GIVEN** the repository's `docs/measurements/context/questions.json`
- **WHEN** its shape is checked and its texts are compared with `GOLDEN_PROJECTS`
- **THEN** it has no problem, each project holds its golden question texts and at least two questions
  with `expected` `unknown`

### Requirement: Live environment check

After the freeze, the question and the seed checks, and before asking any question, the command SHALL
check, in this order, exiting with code 1 and one stderr line on the first failure: `LLM_BASE_URL` is
set and not blank (the measurement needs the live mode), with a line naming `LLM_BASE_URL`; `LLM_MODEL`
is set and not blank, with a line naming `LLM_MODEL`; `GET /health` of the API at
`http://127.0.0.1:<PORT>` (`PORT` read as `demo:ask` reads it) answers `200` with `{ "status": "ok" }`,
an unreachable API giving the line
`measure:context: the API is not reachable at http://127.0.0.1:<port> (start it with npm run up)`; the
Ollama server at `LLM_BASE_URL` without a trailing `/` and `/v1` answers `GET /api/version` with `200`
and a `version` string, with a line naming `/api/version`; and it lists `LLM_MODEL` (or
`LLM_MODEL:latest`) in `GET /api/tags`. The run SHALL record the Ollama version, the model name and
digest and the verification model (`LLM_MODEL_VERIFY`, or `LLM_MODEL` when it is unset or blank) in
`docs/measurements/context/raw/run.json`, written once on the first run with the start time from the
injected clock; when that file already exists with another Ollama version, model, digest or
verification model, the command SHALL exit with code 1 without asking anything. Raw responses or a
`raw/tokenizer.json` present without `raw/run.json` SHALL make the command exit with code 1 with a
stderr line naming `docs/measurements/context/raw/run.json`, without asking anything. No stdout or
stderr line and no written file SHALL contain the value of `LLM_BASE_URL`, `LLM_API_KEY` or any
variable other than the model names and `PORT`.

#### Scenario: The API does not answer

- **GIVEN** valid inputs and a fake sender that rejects every request to the API
- **WHEN** the command runs
- **THEN** it exits with code 1, stderr is the line
  `measure:context: the API is not reachable at http://127.0.0.1:<port> (start it with npm run up)`, and
  no question was sent

#### Scenario: The health check is not ok

- **GIVEN** valid inputs and a fake sender whose `GET /health` answers `503`
- **WHEN** the command runs
- **THEN** it exits with code 1 and no question was sent

#### Scenario: The model variable is not set

- **GIVEN** valid inputs and an environment whose `LLM_MODEL` is blank
- **WHEN** the command runs
- **THEN** it exits with code 1, stderr names `LLM_MODEL`, and no request was sent, `GET /health`
  included

#### Scenario: The Ollama version check fails

- **GIVEN** valid inputs and a fake Ollama whose `GET /api/version` answers `500`
- **WHEN** the command runs
- **THEN** it exits with code 1, stderr names `/api/version`, and no question was sent

#### Scenario: The model is not in Ollama

- **GIVEN** valid inputs and a fake Ollama whose `/api/tags` does not list `LLM_MODEL`
- **WHEN** the command runs
- **THEN** it exits with code 1, stderr names `LLM_MODEL`, and no question was sent

#### Scenario: A raw run of another model is not mixed

- **GIVEN** a copy whose `raw/run.json` records another model digest than the fake Ollama reports; then
  a copy whose `raw/run.json` records another verification model; then a copy holding
  `raw/acme-shop/Q01.json` but no `raw/run.json`
- **WHEN** the command runs on each
- **THEN** each exits with code 1, stderr names `docs/measurements/context/raw/run.json`, and no question
  was sent; and on a first run with no raw data the command writes `raw/run.json` with the injected
  clock's time as `startedAt`

#### Scenario: No variable value is written

- **GIVEN** valid inputs, `LLM_BASE_URL` and `LLM_API_KEY` set to distinctive values and a fake API and
  Ollama that answer everything
- **WHEN** the command runs to the end, and once more with the API rejecting every request
- **THEN** neither value appears in stdout, in stderr or in any file written under
  `docs/measurements/context/`

### Requirement: Asking each question

For each question in file order without a raw response, the command SHALL send
`POST /api/projects/<project id>/ask` with the body `{ "question": <text>, "useCache": false }`, where the
project id is the `project` row of `seeds/graph-dump.sql` whose name is the fixture, without a time
limit. A `200` body that is an answered question SHALL have a `usage` with integer token counts and a
`verification` part with integer `calls`, `cacheHits`, `inputTokens`, `outputTokens` and `latencyMs`;
it is kept. A `200` `UNKNOWN` SHALL be kept with its reason. Each kept response SHALL be written at once
to `docs/measurements/context/raw/<fixture>/<id>.json` with the question text, the time it was received
and the body as it came. The API keeps one in-memory verification cache per process that `useCache:
false` does not bypass; an answered body's `usage.verification.cacheHits` SHALL be kept, written in the
CSV column `verifyCacheHits` and summed per project, and the report and the README limitations SHALL
state that a verification answered from that cache costs no token. The command SHALL exit with code 1,
keeping the responses already written and writing no output of the requirement "Measurement outputs",
when the API cannot be reached or its body cannot be read as JSON, the status is not `200`, the body is
an `UNKNOWN` with reason `llm-required`, an answered body has `usage.cacheHit` `true` or lacks a usage
field, or a raw response on disk names another question text than the question file. A new run SHALL
skip every question that already has a raw response. "No output" means the files of "Measurement
outputs"; the raw responses are kept so a run can resume.

#### Scenario: Every question is sent without the cache

- **GIVEN** valid inputs and a fake API that answers every question
- **WHEN** the command runs
- **THEN** it sent 40 `POST` requests, one per question in file order, each to the project id of the
  seed and with `useCache` `false`, printed one stdout line per question starting `<fixture> <id>: `,
  and exited with code 0

#### Scenario: An evaluation-mode API stops the run

- **GIVEN** a fake API whose third answer is `UNKNOWN` with reason `llm-required`
- **WHEN** the command runs
- **THEN** it exits with code 1, the first two raw responses exist, no third raw response and no file of
  the measurement outputs exist

#### Scenario: A cached answer stops the run

- **GIVEN** a fake API whose first answer has `usage.cacheHit` `true`
- **WHEN** the command runs
- **THEN** it exits with code 1, stderr names the project and `Q01`, and nothing is written under
  `docs/measurements/context/raw/<fixture>/`

#### Scenario: A verification answered from the API cache

- **GIVEN** a fake API whose second answer has `usage.verification.cacheHits` 2
- **WHEN** the command runs to the end
- **THEN** it exits with code 0, that CSV row has `verifyCacheHits` 2, and the project's
  `verification.cacheHits` in the JSON is the sum over its answered rows

#### Scenario: A non-200 status stops the run

- **GIVEN** a fake API whose second answer has status `500`
- **WHEN** the command runs
- **THEN** it exits with code 1, the first raw response exists, no second raw response and no file of
  the measurement outputs exist

#### Scenario: A body that is not JSON stops the run

- **GIVEN** a fake API whose first answer is status `200` with the body `<html>`
- **WHEN** the command runs
- **THEN** it exits with code 1, stderr names the project and `Q01`, and no raw response and no file of
  the measurement outputs exist

#### Scenario: An answered body without a usage field stops the run

- **GIVEN** a fake API whose first answer is an answered body without `usage.verification`
- **WHEN** the command runs
- **THEN** it exits with code 1, stderr names `usage.verification`, and no raw response exists

#### Scenario: A stale raw response stops the run

- **GIVEN** a copy whose `raw/acme-shop/Q01.json` holds a `question` different from the question file's
  `Q01`
- **WHEN** the command runs
- **THEN** it exits with code 1, stderr names `docs/measurements/context/raw/acme-shop/Q01.json`, and no
  question was sent

#### Scenario: A resumed run skips the answered questions

- **GIVEN** a copy that already holds the raw responses of the 20 `acme-shop` questions
- **WHEN** the command runs with a fake API
- **THEN** it sends only the 20 `task-api` questions and the outputs are identical to those of a run
  that sent all 40

### Requirement: Tokenizer deviation sample

The sample SHALL be every `file` row of the two sample projects in `seeds/graph-dump.sql` whose
`redacted` is `false`, read from `fixtures/<fixture>/<path>`; a file whose SHA-256 differs from the
row's `content_hash`, or that cannot be read, SHALL make the command exit with code 1 naming it, before
any request. A sample project with no `project` row in the seed SHALL make it exit with code 1 with a
stderr line naming the fixture and `seeds/graph-dump.sql`, and a seed that cannot be read or holds a
malformed row SHALL make it exit with code 1 with the stderr line
`seeds/graph-dump.sql: the file cannot be read` (written by the command) or the
`seeds/graph-dump.sql:<line>: <reason>` message of `readSeed`, both before any request. For each file without a recorded count, the command SHALL ask Ollama
`POST /api/generate` with the model, the file text as `prompt`, `raw` `true`, `stream` `false` and
`num_predict` 1, print one stdout line starting `tokenizer <fixture>/<path>: `, and record its
`prompt_eval_count` in `docs/measurements/context/raw/tokenizer.json` at once. The estimate of a file
SHALL be the local one, its Unicode code points divided by 4 rounded up, equal to the product's
`estimateTokens`. A failed Ollama answer, or one without an integer `prompt_eval_count`, SHALL make the
command exit with code 1 naming the file, keeping the counts already written.

#### Scenario: The local estimate equals the product's

- **GIVEN** texts with ASCII, accented letters and an astral character
- **WHEN** the script's estimate and the product's `estimateTokens` are computed
- **THEN** they are equal for every text

#### Scenario: A sample file differs from the seed

- **GIVEN** a copy whose `fixtures/task-api/src/app.ts` has one byte appended
- **WHEN** the command runs
- **THEN** it exits with code 1, stderr names `fixtures/task-api/src/app.ts`, and no request was sent

#### Scenario: The seed has no row of a sample project

- **GIVEN** a copy whose `seeds/graph-dump.sql` has no `project` row for `task-api`
- **WHEN** the command runs
- **THEN** it exits with code 1, stderr names `task-api` and `seeds/graph-dump.sql`, and no request was
  sent

#### Scenario: A malformed generate answer stops the count

- **GIVEN** a fake Ollama whose third `/api/generate` answer has no `prompt_eval_count`
- **WHEN** the command runs
- **THEN** it exits with code 1, stderr names the third sample file, `raw/tokenizer.json` holds the first
  two counts, and no file of the measurement outputs exists

#### Scenario: Every non-redacted file is counted once

- **GIVEN** the repository's seed and a fake Ollama
- **WHEN** the command runs
- **THEN** it asked `/api/generate` once per non-redacted file of the two projects with `raw` `true` and
  `num_predict` 1, and never for `fixtures/acme-shop/config/services.php` or
  `fixtures/task-api/src/config/env.ts`

### Requirement: Aggregation rules

Per project, over its answered rows only: «Contexto bruto» SHALL be the sum of `baselineTokens`;
«CODEMIND» the sum of `inputTokens` (generation plus verification, the definition of `savingsPct`);
«Ahorro» the integer number of tenths `Math.round((Contexto bruto − CODEMIND) · 1000 / Contexto bruto)`,
which is negative when CODEMIND exceeds the raw context and rounds a half toward +∞, as the product's
`savingsPct` does (equal to it, times 10, when «Contexto bruto» is above 0), and `null` (published
`no definido`) when «Contexto bruto» is 0. `UNKNOWN` rows SHALL be left out of every token figure and counted by
reason. The verification share of tokens SHALL be
`(Σ verification input + Σ verification output) / (Σ input + Σ output)`, of latency
`Σ verification latency / Σ latency`, and of cost `Σ verification cost / Σ cost`, or `null` (published
`n/a (0 USD con Ollama local)`) when the total cost is 0. `medianMs` SHALL be the `⌈n/2⌉`-th smallest
`latencyMs` of the n answered rows and `verifyMedianMs` the `⌈n/2⌉`-th smallest
`verification.latencyMs`, both `null` when n is 0; `under10s` the number of answered rows with
`latencyMs` < 10 000; `maxCallsPerAnswer` the largest `verification.calls` of one answered row (`null`
when n is 0); and `verification.cacheHits` the sum of `verifyCacheHits`. The tokenizer deviation SHALL
be `Σ estimate / Σ provider − 1` over the sample, with the minimum and maximum per-file deviation (ties
by path order). Every ratio SHALL be computed from integers, and a ratio with a zero denominator is
`null`. Ratios written in the JSON SHALL be rounded to four decimals half away from zero from the
integer numerator and denominator (as `graph-quality` → "Measures per project"); the JSON SHALL hold,
per project, Σ `latencyMs` and Σ `verification.latencyMs`, and for `tokenizer.min` and `tokenizer.max`
the file's `estimated` and `provider` counts; every figure of the README and the report SHALL be
formatted from those integers, never from a rounded ratio. A published one-decimal percentage or
number of seconds other than «Ahorro» SHALL be rounded half away from zero from its integer numerator
and denominator, as `roundRatio` does; «Ahorro» is written from its tenths, with no second rounding.

#### Scenario: Savings of two answered rows

- **GIVEN** answered rows with `baselineTokens` 40 000 and 20 000, `inputTokens` 4 000 and 3 000, of
  which 1 000 and 500 are verification input, and `outputTokens` 300 and 200, of which 100 and 50 are
  verification output
- **WHEN** they are aggregated
- **THEN** «Contexto bruto» is 60 000, «CODEMIND» is 7 000, «Ahorro» is 88,3 %, the verification token
  share is 0.22, and the cost share is `null` at a total cost of 0

#### Scenario: UNKNOWN rows are counted apart

- **GIVEN** 18 answered rows and two `UNKNOWN` rows with reasons `no-anchor` and `no-evidence`
- **WHEN** they are aggregated
- **THEN** the token figures use the 18 answered rows only and the `UNKNOWN` count is
  `{ "no-anchor": 1, "no-evidence": 1 }`

#### Scenario: The savings equal the product's formula

- **GIVEN** pairs of input and baseline totals above 0, among them one whose exact savings end in a half
  tenth and one with input above the baseline whose savings end in a half tenth (baseline 400, input
  401)
- **WHEN** the script's savings and the product's `savingsPct` are computed
- **THEN** they are equal for every pair (the script's tenths divided by 10), and the second gives −2
  tenths, written `-0,2 %`

#### Scenario: Verifier latency and calls of three answered rows

- **GIVEN** three answered rows with `latencyMs` 9 000, 12 000 and 30 000, `verification.latencyMs`
  4 000, 6 000 and 20 000, and `verification.calls` 3, 7 and 20
- **WHEN** they are aggregated
- **THEN** `medianMs` is 12 000, `verifyMedianMs` 6 000, `under10s` 1, `maxCallsPerAnswer` 20, Σ
  `latencyMs` 51 000 and the latency share 0.5882

#### Scenario: A project with no answered row

- **GIVEN** a project whose 20 rows are all `UNKNOWN`
- **WHEN** it is aggregated
- **THEN** «Contexto bruto» and «CODEMIND» are 0, «Ahorro», `medianMs`, `verifyMedianMs`,
  `maxCallsPerAnswer` and every share are `null`, `under10s` is 0, and the README formatter writes
  «Ahorro» as `no definido`

#### Scenario: The tokenizer deviation of a sample

- **GIVEN** three files with estimates 100, 50, 30 and provider counts 80, 50, 40
- **WHEN** the deviation is computed
- **THEN** the aggregate is 180 / 170 − 1, the minimum is the third file at −25 % and the maximum the
  first at +25 %, each with its `estimated` and `provider` counts

### Requirement: Measurement outputs

When every question has a raw response and every sample file a count, the command SHALL build, from the
raw data, the question file, the seed and the fixtures only, and then write in full:
`docs/measurements/context/context-savings.csv` with the header
`project,questionId,answer,unknownReason,inputTokens,outputTokens,baselineTokens,savingsPct,generationInputTokens,generationOutputTokens,verifyCalls,verifyCacheHits,verifyInputTokens,verifyOutputTokens,verifyCostUsd,verifyLatencyMs,latencyMs,costUsd,cacheHit`
and one row per question in file order (RFC 4180 quoting, LF line ends, empty usage cells for an
`UNKNOWN`); `docs/measurements/context/context-savings.json` with the run record, the aggregates of
each project and the deviation; and `docs/measurements/context/answers/<fixture>.json` with, per
question, only its id, text, answer, `UNKNOWN` reason, evidence and statements, each statement with its
`text`, `type` and `evidenceIds` only (its `verification` verdict is left out so the reviewers of DIS-82
are not anchored by it). The answer files SHALL NOT contain the model, any token count, cost, latency,
confidence, the verifier's verdict or `cacheHit`. Two builds from the same raw data SHALL give
identical bytes, with no absolute path. When the run stops before that, none of these files SHALL be
written or changed.

#### Scenario: The outputs are deterministic

- **GIVEN** a copy with all the raw data
- **WHEN** the command runs twice with a fake API and Ollama
- **THEN** both runs exit with code 0, send no request after the checks, write byte-identical CSV,
  JSON and answer files that hold no path of the copy, and print one stdout line per project matching
  `<fixture>: contexto bruto <n> · CODEMIND <n> · ahorro <percent> · <answered> respondidas, <unknown> UNKNOWN`

#### Scenario: The answer files are blind

- **GIVEN** the outputs of a run
- **WHEN** the answer files are read
- **THEN** they hold the 20 questions of their project in order, no key is `usage`, `confidence`,
  `cacheHit`, `model`, `latencyMs`, `costUsd` or `verification`, and no value contains the model name

#### Scenario: A CSV field with a comma, a quote and a line break

- **GIVEN** an answer text holding `,`, `"` and a line break
- **WHEN** its CSV row is built
- **THEN** the field is quoted, the inner quote doubled, and the row reads back to the same values

### Requirement: Measurement CLI

`--root <dir>` SHALL be the only option; an unknown argument, `--root` without a value or given twice
SHALL exit with code 2 and the stderr line `Usage: node scripts/measure-context.mjs [--root <dir>]`,
before any other step; a `PORT` that is not a port number (read as `demo:ask` reads it) SHALL exit with
code 2 and the stderr line `measure:context: PORT must be a port number`, checked right after loading
`.env` and before the freeze check, so it is reported before any other input problem and any request. During the
run the command SHALL print one stdout line per question sent (`<fixture> <id>: respondida` or
`<fixture> <id>: UNKNOWN <reason>`) and per file counted (`tokenizer <fixture>/<path>: <n> tokens`), and
at the end one line per project:
`<fixture>: contexto bruto <n> · CODEMIND <n> · ahorro <percent> · <answered> respondidas, <unknown> UNKNOWN`.

#### Scenario: An unknown argument is a usage error

- **GIVEN** the arguments `--verbose`, then `--root` alone, then `--root a --root b`
- **WHEN** the command runs with each
- **THEN** each exits with code 2, stderr holds exactly the usage line, and no request was sent; and a
  run with valid arguments and `PORT` `abc` exits with code 2 with the `PORT` line and sends no request

### Requirement: Committed measurement matches the raw data

The repository SHALL hold the raw data of the published run under `docs/measurements/context/raw/`, and
the committed CSV, JSON and answer files SHALL equal, byte for byte, what the build of the requirement
"Measurement outputs" gives from them, so CI can check the published figures without a model.

#### Scenario: The committed outputs are the current aggregation

- **GIVEN** the committed raw data, question file, seed and fixtures
- **WHEN** the outputs are built in memory
- **THEN** they equal the committed CSV, JSON and answer files, and a mismatch names
  `npm run measure:context`

#### Scenario: The frozen questions still match their hash

- **GIVEN** the repository
- **WHEN** the freeze check of `docs/measurements/context-savings.md` runs
- **THEN** it reports no problem

### Requirement: Published Table 1

`readme.md` §2.6, Table 1 "Ahorro de contexto", SHALL have one row per sample project whose «Contexto
bruto» and «CODEMIND» cells are the JSON's integers (digits grouped by three with a space from 10 000
up), whose «Ahorro» is written from its tenths with one decimal and a decimal comma, a negative value
starting with `-` (hyphen-minus) and a non-negative one without sign (`88,3 %`, `-95,2 %`, or
`no definido` for a `null`), and whose «Correctas (de 20)» cell is `pendiente de DIS-82`. When the
«Ahorro» of a project is below 0, the text below Table 1 SHALL contain a paragraph starting
`**Por qué CODEMIND envía más tokens que el contexto bruto.**` that explains it, the figures SHALL NOT
be adjusted, and the §0.3 sentence of `readme.md` SHALL NOT contain
`reduce coste y latencia de forma medida` and SHALL link Table 1; when no «Ahorro» is below 0, that
paragraph SHALL be absent and the §0.3 sentence is left as it is. Its caption SHALL NOT say
`revisión manual`. Below the table, one line per project SHALL give its answered and `UNKNOWN` counts,
the verification share of tokens and latency, the cost share and the median latency, and one line SHALL
give the tokenizer deviation, all formatted from the JSON's integers, with a link to
`docs/measurements/context-savings.md`. The limitations paragraph SHALL NOT say the questions were asked
by the author and SHALL name: questions written by an agent and frozen before the run, one run, the
local 7.6B model, the estimated `baselineTokens` with its measured deviation (PH-16), the verification
ratio (PH-27), that a verification answered from the API's in-memory cache costs no token, the small
sample repositories built on purpose, and the annotation of the Table 2 call sites by two independent
agents of different models (DIS-80). The review table row «Medir el verificador» SHALL NOT read
`Previsto`, and the §3.2 paragraph on `baseline_tokens` SHALL give the measured aggregate deviation.

#### Scenario: The README Table 1 agrees with the measurement

- **GIVEN** the committed `context-savings.json`
- **WHEN** Table 1 and the lines below it are parsed
- **THEN** every cell and line equals the value formatted from the JSON, «Correctas (de 20)» reads
  `pendiente de DIS-82`, and the text links `docs/measurements/context-savings.md`

#### Scenario: A negative savings is explained

- **GIVEN** the committed `context-savings.json`
- **WHEN** the «Ahorro» of each project is read
- **THEN** if either is below 0, the README text below Table 1 holds the paragraph starting
  `**Por qué CODEMIND envía más tokens que el contexto bruto.**` and the §0.3 sentence does not contain
  `reduce coste y latencia de forma medida` and links Table 1; otherwise the paragraph is absent

#### Scenario: The README limitations and verifier row are current

- **GIVEN** `readme.md`
- **WHEN** the Table 1 caption, the limitations paragraph, the review-table row «Medir el verificador»
  and the §3.2 `baseline_tokens` paragraph are read
- **THEN** none says the author asked the questions or that the verifier measurement is `Previsto`,
  the caption does not contain `revisión manual`, the limitations name PH-16, PH-27, the verification
  cache, the small sample repositories and the two independent annotating agents, and the §3.2
  paragraph holds the formatted aggregate deviation

### Requirement: Measurement report

`docs/measurements/context-savings.md` SHALL hold `## Hashes SHA-256` (recorded before the run),
`## Método` (the inputs, the freeze check, the live checks, `useCache: false`, the raw data, the agent
who wrote the questions, and the sentence `Las preguntas se escribieron y congelaron antes de ver
ninguna respuesta.`), `## Entorno` (date, Ollama version, model and digest, verification model, whether
Ollama ran on CPU or GPU and that processor's model name, the `LLM_TIMEOUT_MS` used), `## Resultados`
with the Table 1 figures, `## Verificador` (shares, median latency against the 10 s criterion of the
README, the largest number of verification calls of one answer against `MAX_VERIFY_CALLS_PER_ANSWER`,
the verification cache hits, with the agent's conclusion on that constant), `## Desviación del
estimador` and `## Limitaciones` (among them: the tokens spent on an `UNKNOWN` after a model call are not
in the `/ask` response and so not in Table 1, a verification answered from the API's in-memory cache
costs no token, and the model recorded is the one of the script's environment). Its figures SHALL equal
the JSON's, formatted from its integers.

#### Scenario: The report agrees with the measurement

- **GIVEN** the committed `context-savings.json` and `docs/measurements/context-savings.md`
- **WHEN** the report is parsed
- **THEN** every section is present, the figures of `## Resultados`, `## Verificador` and
  `## Desviación del estimador` equal the formatted JSON values, `## Entorno` names the JSON's Ollama
  version and model digest, and `## Método` holds the freeze sentence
