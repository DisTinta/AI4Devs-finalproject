## Purpose

Measures, with a real model through the running API, how many tokens CODEMIND sends against the raw
context it replaces on about 20 frozen questions per sample repository, how much of that is the
verifier, and how far the local token estimate is from the provider's count, and publishes Table 1 of
the README and its report from versioned raw data that anyone can re-aggregate.

## ADDED Requirements

### Requirement: Freeze check before measuring

`npm run measure:context` (`node scripts/measure-context.mjs`) SHALL, before reading any other input and
before any network call, compare every file listed in the `## Hashes SHA-256` table of
`docs/measurements/context-savings.md` with the SHA-256 recorded there, with the same freeze check as
`graph-annotations` → "Frozen annotations and agreement report". The table SHALL list
`docs/measurements/context/questions.json`. When the report cannot be read, records no hash, or a listed
file is unreadable or differs from its hash, the command SHALL exit with code 1, write one stderr line
per problem naming the file, send no request and write nothing. A problem about the report itself SHALL
be written prefixed `docs/measurements/context-savings.md: `.

#### Scenario: A frozen question file was modified

- **GIVEN** a temporary copy of the inputs whose `docs/measurements/context/questions.json` has one byte
  changed after its hash was recorded
- **WHEN** `node scripts/measure-context.mjs --root <copy>` runs with a fake sender
- **THEN** it exits with code 1, stderr has one line naming `docs/measurements/context/questions.json`,
  the sender received no request, and nothing was written under `docs/measurements/context/` of the copy

#### Scenario: The savings report records no hash

- **GIVEN** a temporary copy whose `docs/measurements/context-savings.md` has no `## Hashes SHA-256` row
- **WHEN** the command runs with `--root <copy>`
- **THEN** it exits with code 1 with one stderr line starting `docs/measurements/context-savings.md: `,
  the sender received no request, and nothing is written

### Requirement: The question set

`docs/measurements/context/questions.json` SHALL have `formatVersion` 1 and, for each sample project in
the order `acme-shop`, `task-api`, exactly 20 questions with the ids `Q01` to `Q20` in that order, each
with a `question` of 5 to 500 Unicode code points that is not only whitespace and an `expected` of
`answer` or `unknown` declared before the run. Each project SHALL hold the exact texts of its golden
questions (`packages/cli/src/cache/demo-questions.ts`) and at least two questions with `expected`
`unknown`. Any other shape SHALL make the command exit with code 1, naming the file and the problem on
stderr, before any request.

#### Scenario: A project has 19 questions

- **GIVEN** a question file whose `task-api` entry holds 19 questions, recorded with its new hash
- **WHEN** the command runs with `--root <copy>`
- **THEN** it exits with code 1, stderr names `docs/measurements/context/questions.json` and `task-api`,
  and the sender received no request

#### Scenario: The committed question set is complete

- **GIVEN** the repository's `docs/measurements/context/questions.json`
- **WHEN** its shape is checked
- **THEN** it has no problem, each project holds its golden question texts and at least two questions
  with `expected` `unknown`

### Requirement: Live environment check

After the freeze and the question checks, and before asking any question, the command SHALL check, in
this order, exiting with code 1 and one stderr line on the first failure: `LLM_BASE_URL` is set (the
measurement needs the live mode); `GET /health` of the API at `http://127.0.0.1:<PORT>` (`PORT` read as
`demo:ask` reads it) answers `200` with `{ "status": "ok" }`; the Ollama server at `LLM_BASE_URL` without
a trailing `/` and `/v1` answers `GET /api/version` and lists `LLM_MODEL` (or `LLM_MODEL:latest`) in
`GET /api/tags`. The run SHALL record the Ollama version, the model name and digest and the
verification model (`LLM_MODEL_VERIFY`, or `LLM_MODEL` when unset) in
`docs/measurements/context/raw/run.json`; when that file already exists with another version, model or
digest, the command SHALL exit with code 1 without asking anything. No output SHALL contain the value
of `LLM_BASE_URL`, `LLM_API_KEY` or any variable other than the model names.

#### Scenario: The API does not answer

- **GIVEN** valid inputs and a fake sender that rejects every request to the API
- **WHEN** the command runs
- **THEN** it exits with code 1, stderr says the API is not reachable, and no question was sent

#### Scenario: The health check is not ok

- **GIVEN** valid inputs and a fake sender whose `GET /health` answers `503`
- **WHEN** the command runs
- **THEN** it exits with code 1 and no question was sent

#### Scenario: The model is not in Ollama

- **GIVEN** valid inputs and a fake Ollama whose `/api/tags` does not list `LLM_MODEL`
- **WHEN** the command runs
- **THEN** it exits with code 1, stderr names `LLM_MODEL`, and no question was sent

#### Scenario: A raw run of another model is not mixed

- **GIVEN** a copy whose `raw/run.json` records another model digest than the fake Ollama reports
- **WHEN** the command runs
- **THEN** it exits with code 1, stderr names `docs/measurements/context/raw/run.json`, and no question
  was sent

### Requirement: Asking each question

For each question in file order without a raw response, the command SHALL send
`POST /api/projects/<project id>/ask` with the body `{ "question": <text>, "useCache": false }`, where the
project id is the `project` row of `seeds/graph-dump.sql` whose name is the fixture, without a time
limit. A `200` body that is an answered question SHALL have a `usage` with integer token counts and a
`verification` part; it is kept. A `200` `UNKNOWN` SHALL be kept with its reason. Each kept response
SHALL be written at once to `docs/measurements/context/raw/<fixture>/<id>.json` with the question text,
the time it was received and the body as it came. The command SHALL exit with code 1, keeping the
responses already written and writing no output of the requirement "Measurement outputs", when the API
cannot be reached or its body cannot be read, the status is not `200`, the body is an `UNKNOWN` with
reason `llm-required`, an answered body has `usage.cacheHit` `true` or lacks a usage field, or a raw
response on disk names another question text than the question file. A new run SHALL skip every
question that already has a raw response.

#### Scenario: Every question is sent without the cache

- **GIVEN** valid inputs and a fake API that answers every question
- **WHEN** the command runs
- **THEN** it sent 40 `POST` requests, one per question in file order, each to the project id of the
  seed and with `useCache` `false`, and exited with code 0

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

#### Scenario: A resumed run skips the answered questions

- **GIVEN** a copy that already holds the raw responses of the 20 `acme-shop` questions
- **WHEN** the command runs with a fake API
- **THEN** it sends only the 20 `task-api` questions and the outputs are identical to those of a run
  that sent all 40

### Requirement: Tokenizer deviation sample

The sample SHALL be every `file` row of the two sample projects in `seeds/graph-dump.sql` whose
`redacted` is `false`, read from `fixtures/<fixture>/<path>`; a file whose SHA-256 differs from the
row's `content_hash`, or that cannot be read, SHALL make the command exit with code 1 naming it, before
any request. For each file without a recorded count, the command SHALL ask Ollama
`POST /api/generate` with the model, the file text as `prompt`, `raw` `true`, `stream` `false` and
`num_predict` 1, and record its `prompt_eval_count` in `docs/measurements/context/raw/tokenizer.json`
at once. The estimate of a file SHALL be the local one, its Unicode code points divided by 4 rounded up,
equal to the product's `estimateTokens`. A failed or malformed Ollama answer SHALL make the command
exit with code 1, keeping the counts already written.

#### Scenario: The local estimate equals the product's

- **GIVEN** texts with ASCII, accented letters and an astral character
- **WHEN** the script's estimate and the product's `estimateTokens` are computed
- **THEN** they are equal for every text

#### Scenario: A sample file differs from the seed

- **GIVEN** a copy whose `fixtures/task-api/src/app.ts` has one byte appended
- **WHEN** the command runs
- **THEN** it exits with code 1, stderr names `fixtures/task-api/src/app.ts`, and no request was sent

#### Scenario: Every non-redacted file is counted once

- **GIVEN** the repository's seed and a fake Ollama
- **WHEN** the command runs
- **THEN** it asked `/api/generate` once per non-redacted file of the two projects with `raw` `true` and
  `num_predict` 1, and never for `fixtures/acme-shop/config/services.php` or
  `fixtures/task-api/src/config/env.ts`

### Requirement: Aggregation rules

Per project, over its answered rows only: «Contexto bruto» SHALL be the sum of `baselineTokens`;
«CODEMIND» the sum of `inputTokens` (generation plus verification, the definition of `savingsPct`);
«Ahorro» `100 × (1 − CODEMIND / Contexto bruto)` in tenths of a percent rounded half up from the
integers, as the product's `savingsPct`. `UNKNOWN` rows SHALL be left out of every token figure and
counted by reason. The verification share of tokens SHALL be
`(Σ verification input + Σ verification output) / (Σ input + Σ output)`, of latency
`Σ verification latency / Σ latency`, and of cost `Σ verification cost / Σ cost`, or `null` (published
`n/a (0 USD con Ollama local)`) when the total cost is 0. The median latency SHALL be the
`⌈n/2⌉`-th smallest `latencyMs` of the answered rows, with the number of answers under 10 000 ms and
the largest number of verification calls of one answer. The tokenizer deviation SHALL be
`Σ estimate / Σ provider − 1` over the sample, with the minimum and maximum per-file deviation (ties by
path order). Every ratio SHALL be computed from integers, and a ratio with a zero denominator is `null`.

#### Scenario: Savings of two answered rows

- **GIVEN** answered rows with `baselineTokens` 40 000 and 20 000 and `inputTokens` 4 000 and 3 000, of
  which 1 000 and 500 are verification input
- **WHEN** they are aggregated
- **THEN** «Contexto bruto» is 60 000, «CODEMIND» is 7 000, «Ahorro» is 88,3 %, the verification token
  share equals the formula over those rows, and the cost share is `null` at a total cost of 0

#### Scenario: UNKNOWN rows are counted apart

- **GIVEN** 18 answered rows and two `UNKNOWN` rows with reasons `no-anchor` and `no-evidence`
- **WHEN** they are aggregated
- **THEN** the token figures use the 18 answered rows only and the `UNKNOWN` count is
  `{ "no-anchor": 1, "no-evidence": 1 }`

#### Scenario: The savings equal the product's formula

- **GIVEN** pairs of input and baseline totals, among them one whose exact savings end in a half tenth
- **WHEN** the script's savings and the product's `savingsPct` are computed
- **THEN** they are equal for every pair

#### Scenario: The tokenizer deviation of a sample

- **GIVEN** three files with estimates 100, 50, 30 and provider counts 80, 50, 40
- **WHEN** the deviation is computed
- **THEN** the aggregate is 180 / 170 − 1, the minimum is the third file at −25 % and the maximum the
  first at +25 %

### Requirement: Measurement outputs

When every question has a raw response and every sample file a count, the command SHALL build, from the
raw data, the question file, the seed and the fixtures only, and then write in full:
`docs/measurements/context/context-savings.csv` with the header
`project,questionId,answer,unknownReason,inputTokens,outputTokens,baselineTokens,savingsPct,generationInputTokens,generationOutputTokens,verifyCalls,verifyInputTokens,verifyOutputTokens,verifyCostUsd,verifyLatencyMs,latencyMs,costUsd,cacheHit`
and one row per question in file order (RFC 4180 quoting, LF line ends, empty usage cells for an
`UNKNOWN`); `docs/measurements/context/context-savings.json` with the run record, the aggregates of
each project and the deviation; and `docs/measurements/context/answers/<fixture>.json` with, per
question, only its id, text, answer, `UNKNOWN` reason, statements and evidence. The answer files SHALL
NOT contain the model, any token count, cost, latency, confidence or `cacheHit`. Two builds from the
same raw data SHALL give identical bytes, with no absolute path. When the run stops before that, none
of these files SHALL be written or changed.

#### Scenario: The outputs are deterministic

- **GIVEN** a copy with all the raw data
- **WHEN** the command runs twice with a fake API and Ollama
- **THEN** both runs exit with code 0, send no request after the checks, and write byte-identical CSV,
  JSON and answer files that hold no path of the copy

#### Scenario: The answer files are blind

- **GIVEN** the outputs of a run
- **WHEN** the answer files are read
- **THEN** they hold the 20 questions of their project in order, and no key or value names the model,
  tokens, cost, latency, confidence or the cache

#### Scenario: A CSV field with a comma, a quote and a line break

- **GIVEN** an answer text holding `,`, `"` and a line break
- **WHEN** its CSV row is built
- **THEN** the field is quoted, the inner quote doubled, and the row reads back to the same values

### Requirement: Measurement CLI

`--root <dir>` SHALL be the only option; an unknown argument, `--root` without a value or given twice
SHALL exit with code 2 and the stderr line `Usage: node scripts/measure-context.mjs [--root <dir>]`,
before any other step; a `PORT` that is not a port number (read as `demo:ask` reads it) SHALL exit with
code 2 and the stderr line `measure:context: PORT must be a port number`, before any request. During the run the command SHALL print one stdout line per question sent and per
file counted, and at the end one line per project:
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
up), whose «Ahorro» is the percentage with one decimal and a decimal comma (`88,3 %`), and whose
«Correctas (de 20)» cell is `pendiente de DIS-82`. Its caption SHALL NOT say `revisión manual`. Below
the table, one line per project SHALL give its answered and `UNKNOWN` counts, the verification share of
tokens and latency, the cost share and the median latency, and one line SHALL give the tokenizer
deviation, all formatted from the JSON, with a link to `docs/measurements/context-savings.md`. The
limitations paragraph SHALL NOT say the questions were asked by the author and SHALL name: questions
written by an agent and frozen before the run, one run, the local 7.6B model, the estimated
`baselineTokens` with its measured deviation (PH-16) and the verification ratio (PH-27). The review
table row «Medir el verificador» SHALL NOT read `Previsto`, and the §3.2 paragraph on `baseline_tokens`
SHALL give the measured aggregate deviation.

#### Scenario: The README Table 1 agrees with the measurement

- **GIVEN** the committed `context-savings.json`
- **WHEN** Table 1 and the lines below it are parsed
- **THEN** every cell and line equals the value formatted from the JSON, «Correctas (de 20)» reads
  `pendiente de DIS-82`, and the text links `docs/measurements/context-savings.md`

#### Scenario: The README limitations and verifier row are current

- **GIVEN** `readme.md`
- **WHEN** the limitations paragraph, the review-table row «Medir el verificador» and the §3.2
  `baseline_tokens` paragraph are read
- **THEN** none says the author asked the questions or that the verifier measurement is `Previsto`,
  the limitations name PH-16 and PH-27, and the §3.2 paragraph holds the formatted aggregate deviation

### Requirement: Measurement report

`docs/measurements/context-savings.md` SHALL hold `## Hashes SHA-256` (recorded before the run),
`## Método` (the inputs, the freeze check, the live checks, `useCache: false`, the raw data, the agent
who wrote the questions, and the sentence `Las preguntas se escribieron y congelaron antes de ver
ninguna respuesta.`), `## Entorno` (date, Ollama version, model and digest, verification model, the
hardware class, the `LLM_TIMEOUT_MS` used), `## Resultados` with the Table 1 figures, `## Verificador`
(shares, median latency against the 10 s criterion of the README, the largest number of verification
calls of one answer against `MAX_VERIFY_CALLS_PER_ANSWER`, with the agent's conclusion on that
constant), `## Desviación del estimador` and `## Limitaciones` (among them: the tokens spent on an
`UNKNOWN` after a model call are not in the `/ask` response and so not in Table 1, and the model
recorded is the one of the script's environment). Its figures SHALL equal the JSON's.

#### Scenario: The report agrees with the measurement

- **GIVEN** the committed `context-savings.json` and `docs/measurements/context-savings.md`
- **WHEN** the report is parsed
- **THEN** every section is present, the figures of `## Resultados`, `## Verificador` and
  `## Desviación del estimador` equal the formatted JSON values, `## Entorno` names the JSON's Ollama
  version and model digest, and `## Método` holds the freeze sentence
