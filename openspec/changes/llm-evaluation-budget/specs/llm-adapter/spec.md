## MODIFIED Requirements

### Requirement: LLM configuration is classified and validated when read

The LLM configuration SHALL be read from the environment variables `LLM_BASE_URL`, `LLM_API_KEY`,
`LLM_MODEL`, `LLM_MODEL_VERIFY`, `LLM_EMBED_MODEL`, `LLM_TIMEOUT_MS` and `DAILY_BUDGET_USD`. Every
value SHALL be trimmed; a value that is unset, empty or only whitespace SHALL count as absent.
`LLM_BASE_URL` SHALL decide the mode:

- `LLM_BASE_URL` and `LLM_API_KEY` both absent → mode `evaluation`, whatever the other variables hold;
- `LLM_BASE_URL` present → mode `live`; `LLM_API_KEY` is optional in this mode;
- `LLM_API_KEY` present and `LLM_BASE_URL` absent → configuration error naming `LLM_BASE_URL`;
- mode `live` and `LLM_MODEL` absent → configuration error naming `LLM_MODEL`;
- mode `live` and `LLM_BASE_URL` not an absolute `http` or `https` URL, or one with user info, a query
  or a fragment (the endpoint paths are appended to it) → configuration error naming `LLM_BASE_URL`;
- mode `live` and `LLM_TIMEOUT_MS` present but not a positive integer in decimal digits no greater
  than 300000 (the default `headersTimeout` and `bodyTimeout` of the undici agent behind Node's `fetch`:
  above it Node ends the request by itself at 300 s, before the configured timeout) → configuration
  error naming `LLM_TIMEOUT_MS`; absent → a request timeout of 120000 ms;
- mode `live` and `DAILY_BUDGET_USD` absent → no daily spend ceiling;
- mode `live` and `DAILY_BUDGET_USD` present but not a positive decimal number in USD written with
  digits and at most one decimal point (no sign, no exponent, greater than 0) → configuration error
  naming `DAILY_BUDGET_USD`; otherwise it is the daily spend ceiling in USD;
- mode `live`, a daily spend ceiling, and a configured model without an entry of its exact name in
  the cost table (checked in this order: `LLM_MODEL`, `LLM_MODEL_VERIFY` when present,
  `LLM_EMBED_MODEL` when present) → configuration error naming `DAILY_BUDGET_USD` and that model
  variable. Without a ceiling, models need no entry.

In mode `evaluation` no other variable is checked. The configuration SHALL be validated when it is read;
reading it at boot is the composition root's job (DIS-29 / CM-HU-12).

A configuration error SHALL have the stable code `LLM_CONFIG_INVALID` and SHALL carry the name of
the variable at fault, and, for a model without a price, also the name of the model variable. Its
message SHALL name those variables and SHALL NOT contain the value of any variable. The message for a
model without a price SHALL also say that with a local Ollama `DAILY_BUDGET_USD` is left empty.

#### Scenario: No URL and no key selects evaluation mode

- **GIVEN** `LLM_BASE_URL` and `LLM_API_KEY` unset, then both empty, then both `'   '`, and
  `LLM_MODEL` empty
- **WHEN** the LLM configuration is read
- **THEN** each read returns mode `evaluation` and raises no error

#### Scenario: A URL without a key selects live mode

- **GIVEN** `LLM_BASE_URL=http://localhost:11434/v1`, `LLM_API_KEY` empty and `LLM_MODEL=chat-x`
- **WHEN** the LLM configuration is read
- **THEN** it returns mode `live` with base URL `http://localhost:11434/v1`, model `chat-x`, no API
  key and a timeout of 120000 ms

#### Scenario: A key without a URL fails without showing the key

- **GIVEN** `LLM_API_KEY=centinela-secreta` and `LLM_BASE_URL` empty
- **WHEN** the LLM configuration is read
- **THEN** it fails with `LLM_CONFIG_INVALID` naming `LLM_BASE_URL`, and the message does not
  contain `centinela-secreta`

#### Scenario: A URL without a model fails

- **GIVEN** `LLM_BASE_URL=http://localhost:11434/v1` and `LLM_MODEL` empty, first without
  `LLM_API_KEY`, then with `LLM_API_KEY=centinela-secreta`
- **WHEN** the LLM configuration is read
- **THEN** each read fails with `LLM_CONFIG_INVALID` naming `LLM_MODEL`, and no message contains
  `centinela-secreta` nor the URL

#### Scenario: A malformed timeout or URL fails naming the variable

- **GIVEN** an otherwise valid live configuration with `LLM_TIMEOUT_MS` set to `abc`, then `0`, then
  `-5`, then `1.5`, then `9999999999`, then `300001`; and then a valid `LLM_TIMEOUT_MS` with
  `LLM_BASE_URL` set to
  `localhost:11434`, then `ftp://x`, then `http://user:pw@localhost:11434/v1`, then
  `http://localhost:11434/v1?k=1`, then `http://localhost:11434/v1#x`
- **WHEN** the LLM configuration is read
- **THEN** each read fails with `LLM_CONFIG_INVALID` naming `LLM_TIMEOUT_MS` (the first six) or
  `LLM_BASE_URL` (the last five), and no message contains the rejected value

#### Scenario: A valid timeout overrides the default

- **GIVEN** a valid live configuration with `LLM_TIMEOUT_MS=50`
- **WHEN** the LLM configuration is read
- **THEN** it returns a request timeout of 50 ms

#### Scenario: The daily budget is read in live mode only

- **GIVEN** a live configuration with `LLM_MODEL=llama3.2` and `DAILY_BUDGET_USD` unset, then `'  '`,
  then `2.5`; and an evaluation configuration (no URL, no key) with `DAILY_BUDGET_USD=abc`
- **WHEN** the LLM configuration is read
- **THEN** the first two live reads have no daily spend ceiling, the third has a ceiling of `2.5`,
  and the evaluation read returns mode `evaluation` without error

#### Scenario: A malformed daily budget fails naming the variable

- **GIVEN** a live configuration with `LLM_MODEL=llama3.2` and `DAILY_BUDGET_USD` set to `abc`, then
  `0`, then `0.0`, then `-1`, then `1e3`, then `1.`
- **WHEN** the LLM configuration is read
- **THEN** each read fails with `LLM_CONFIG_INVALID` naming `DAILY_BUDGET_USD`, and no message
  contains the rejected value

#### Scenario: With a ceiling every configured model needs a price

- **GIVEN** `LLM_BASE_URL=http://localhost:11434/v1`, `DAILY_BUDGET_USD=1` and, in turn:
  `LLM_MODEL=llama3.2`; `LLM_MODEL=llama3.2:3b`; `LLM_MODEL=llama3.2` with
  `LLM_MODEL_VERIFY=sin-precio`; `LLM_MODEL=llama3.2` with `LLM_EMBED_MODEL=sin-precio`
- **WHEN** the LLM configuration is read
- **THEN** the first read returns mode `live` with a ceiling of `1`; the others fail with
  `LLM_CONFIG_INVALID` naming `DAILY_BUDGET_USD` and, respectively, `LLM_MODEL`, `LLM_MODEL_VERIFY` and
  `LLM_EMBED_MODEL`; no message contains `llama3.2:3b` nor `sin-precio`, and each says that with a
  local Ollama `DAILY_BUDGET_USD` is left empty

#### Scenario: Without a ceiling a model needs no price

- **GIVEN** `LLM_BASE_URL=http://localhost:11434/v1`, `DAILY_BUDGET_USD` empty,
  `LLM_MODEL=llama3.2:3b`, `LLM_MODEL_VERIFY=sin-precio` and `LLM_EMBED_MODEL=sin-precio`
- **WHEN** the LLM configuration is read
- **THEN** it returns mode `live` with no daily spend ceiling

## ADDED Requirements

### Requirement: Evaluation mode never calls the model

A language model built from a configuration in mode `evaluation` SHALL report its mode as
`evaluation` and SHALL NOT send any network request. Every completion (whatever its purpose) and every
embedding request (even for an empty list of texts) SHALL fail with `LLM_UNAVAILABLE` and reason
`evaluation-mode`, a reason distinct from `not-configured` (which keeps meaning a live configuration
without `LLM_EMBED_MODEL`). The evaluation model SHALL be constructible only from a configuration in
mode `evaluation`; passing a live configuration SHALL be rejected by the type check.

#### Scenario: Without URL and key no request is sent

- **GIVEN** an empty environment, and then `LLM_BASE_URL` and `LLM_API_KEY` blank with `LLM_MODEL=x`,
  and a spy on the global `fetch`
- **WHEN** the model for the configuration read from each environment is built and a completion with
  purpose `answer`, a completion with purpose `verify`, embeddings for `["a"]` and embeddings for `[]`
  are requested
- **THEN** the model reports mode `evaluation`, every request fails with `LLM_UNAVAILABLE` and reason
  `evaluation-mode`, and the spy records no call

#### Scenario: A live configuration does not type-check against the evaluation model

- **GIVEN** a configuration value in mode `live`
- **WHEN** code passes it to the evaluation model's constructor and the project's type check runs
- **THEN** the type check reports that call as an error, while the same call with an evaluation
  configuration type-checks

### Requirement: One entry point builds the model for the configured mode

A single entry point SHALL build the language model from any LLM configuration: the evaluation model
for mode `evaluation`, the OpenAI-compatible client for mode `live` (accepting the same injectable
`fetch` as the client). It SHALL NOT apply the daily spend ceiling: that is composed on top of the live
model by the composition root, only when the configuration is `live` and has a ceiling.

#### Scenario: The entry point builds a live model for a live configuration

- **GIVEN** `LLM_BASE_URL=http://localhost:11434/v1`, `LLM_MODEL=chat-x`, `DAILY_BUDGET_USD` empty and
  a recording `fetch` that answers with 200 and a valid completion
- **WHEN** the model is built through the entry point with that `fetch` and one completion is
  requested
- **THEN** the model reports mode `live` and exactly one request was sent to
  `http://localhost:11434/v1/chat/completions`

### Requirement: Cost of a call from the cost table

The cost of a call SHALL be computed from a cost table that gives, per exact model name, a price in
USD per million input tokens and per million output tokens: `input tokens × input price / 10⁶ +
output tokens × output price / 10⁶`, rounded to 6 decimals (the scale of `query_log.cost_usd`). A model
without an entry SHALL cost `0`. Whether a model has a price SHALL be decided by its exact name: no
case folding and no tag normalisation (`llama3.2:3b` is not `llama3.2`). The shipped table SHALL NOT
contain invented paid prices: it SHALL hold at `0` the example models of `.env.example` (`llama3.2`,
`mistral`, `qwen2.5-coder`, `nomic-embed-text`), and any paid entry added later SHALL carry the
official pricing URL and the date it was checked.

#### Scenario: The cost of a priced model is computed and rounded

- **GIVEN** an injected table with `paid-x` at 3 USD input and 15 USD output per million tokens
- **WHEN** the cost of 1000 input and 200 output tokens of `paid-x` is computed, and the cost of 1 input
  and 0 output tokens
- **THEN** the first cost is `0.006` and the second is `0.000003`

#### Scenario: A model without a price costs nothing and has no price

- **GIVEN** an injected table with `paid-x` priced and `local-y` at 0, and `llama3.2` at 0
- **WHEN** the cost of 1000 input and 200 output tokens of `local-y` and of `otro` is computed, and
  whether `paid-x`, `local-y`, `otro` and `llama3.2:3b` have a price is asked
- **THEN** both costs are `0`; `paid-x` and `local-y` have a price; `otro` and `llama3.2:3b` do not

#### Scenario: The shipped table holds only the Ollama examples at zero

- **GIVEN** the shipped cost table
- **WHEN** it is read
- **THEN** it has entries `llama3.2`, `mistral`, `qwen2.5-coder` and `nomic-embed-text`, every one
  with both prices `0`, and no other entry

### Requirement: Daily spend ceiling

A live model with a daily spend ceiling SHALL, before **every** completion and every embedding
request, read the spend of the current day as the sum of `query_log.cost_usd` since the start of the
current UTC day (00:00:00 UTC), from the database and never from process memory. When that spend is
greater than or equal to the ceiling, the request SHALL fail with the domain error `BUDGET_EXHAUSTED`
without calling the model; the error SHALL carry the spend, the ceiling and the time the ceiling
resets (the start of the next UTC day), and no text from the database or the model. Otherwise the
request SHALL be passed to the model unchanged and its result or failure returned unchanged. The
model SHALL keep reporting mode `live`. The ceiling applies to embeddings as well as completions.

#### Scenario: A reached ceiling blocks completions and embeddings

- **GIVEN** a ceiling of `1`, a clock at `2026-10-09T15:00:00Z`, a recording inner model, and a
  spend source that answers `1.000001`, then `1`
- **WHEN** a completion and embeddings for `["a"]` are requested against each answer
- **THEN** every request fails with `BUDGET_EXHAUSTED` carrying the spend read, ceiling `1` and reset
  time `2026-10-10T00:00:00Z`; the spend was read from `2026-10-09T00:00:00Z`; the inner model
  recorded no call

#### Scenario: Below the ceiling the request reaches the model

- **GIVEN** a ceiling of `1`, a clock at `2026-10-09T15:00:00Z`, a spend source that answers
  `0.999999`, and an inner model that answers a completion with text `hola` and embeddings with one
  vector
- **WHEN** a completion and embeddings for `["a"]` are requested
- **THEN** the results are exactly those of the inner model, which recorded one call of each, and the
  model reports mode `live`

#### Scenario: The ceiling survives a restart

- **GIVEN** a migrated database whose `query_log` holds rows of today summing `1.5` USD, a ceiling of
  `1`, and a recording inner model
- **WHEN** a new store and a new ceiling-wrapped model, sharing no state with any earlier instance,
  are built over that database and a completion is requested
- **THEN** the request fails with `BUDGET_EXHAUSTED` and the inner model recorded no call
