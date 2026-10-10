# llm-adapter Specification

## Purpose

Puts every language model behind one port: an OpenAI-compatible client for completions and
embeddings, configured from the environment and validated when read, with Ollama (no key) as the real
development endpoint, so the rest of CODEMIND never knows the vendor and never leaks its key.

## Requirements

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
  digits and at most one decimal point (no sign, no exponent, greater than 0), or one too large to be
  represented as a finite number → configuration error naming `DAILY_BUDGET_USD`; otherwise it is the
  daily spend ceiling in USD;
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
  `0`, then `0.0`, then `-1`, then `1e3`, then `1.`, then 400 digits `9` (beyond a finite number)
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

### Requirement: Model selection per purpose

A completion request SHALL carry a purpose, `answer` or `verify`. A completion with purpose `answer`
SHALL use `LLM_MODEL`. A completion with purpose `verify` SHALL use `LLM_MODEL_VERIFY` when it is
present and `LLM_MODEL` otherwise. Embeddings SHALL use `LLM_EMBED_MODEL` only: when it is absent,
completions SHALL keep working and every embedding request SHALL fail with `LLM_UNAVAILABLE` and
reason `not-configured` without sending any HTTP request, even for an empty list of texts;
`LLM_MODEL` SHALL NOT be used for embeddings.

#### Scenario: The verify purpose falls back to the generation model

- **GIVEN** a live configuration with `LLM_MODEL=chat-x` and `LLM_MODEL_VERIFY` absent, then the same
  with `LLM_MODEL_VERIFY=verify-y`, and an endpoint that answers every completion with 200
- **WHEN** a completion with purpose `verify` and one with purpose `answer` are requested in each
  configuration
- **THEN** without `LLM_MODEL_VERIFY` both requests carry `model: "chat-x"`; with it, the `verify`
  request carries `model: "verify-y"` and the `answer` request carries `model: "chat-x"`

#### Scenario: Without an embedding model, embeddings fail and completions work

- **GIVEN** a live configuration with `LLM_MODEL=chat-x` and `LLM_EMBED_MODEL` absent, and an
  endpoint that answers every completion with 200
- **WHEN** a completion is requested and then embeddings for `["a"]` are requested
- **THEN** the completion succeeds; the embedding request fails with `LLM_UNAVAILABLE` and reason
  `not-configured`; exactly one HTTP request was sent (the completion), and none carries
  `model: "chat-x"` towards the embeddings endpoint

### Requirement: Completion request and response

A completion SHALL be one `POST` to `<base>/chat/completions`, where `<base>` is `LLM_BASE_URL`
without trailing `/`. The request SHALL carry `Content-Type: application/json` and a JSON body with
the selected `model` and the `messages` (each with a `role` among `system`, `user` and `assistant`,
and a `content`), and SHALL NOT ask for streaming. The request SHALL carry
`Authorization: Bearer <LLM_API_KEY>` when a key is configured and SHALL NOT carry any
`Authorization` header otherwise. The value of `LLM_API_KEY` SHALL NOT appear in the URL nor in the
body. A response SHALL be accepted only when its status is 2xx and its body is JSON with a non-empty
`choices` whose first element has a string `message.content`; the other elements of `choices` are not
checked. Redirects SHALL NOT be followed, for completions and embeddings alike: a 3xx answer is a non-2xx
status, reported as such, and no second request is sent. The result SHALL be that text, the model used, and `usage` with `inputTokens` =
`usage.prompt_tokens` and `outputTokens` = `usage.completion_tokens`. A `usage` that is absent or
`null`, and a field of `usage` that is absent or `null`, SHALL count as `0`; a field of `usage` that is
present and is not a non-negative integer (a string, a negative or a fractional number) SHALL make the
response not accepted.

#### Scenario: Without a key the completion is sent without Authorization

- **GIVEN** `LLM_BASE_URL=http://localhost:11434/v1`, `LLM_API_KEY` empty, `LLM_MODEL=chat-x` and an
  endpoint that answers with 200 and a valid completion
- **WHEN** a completion with purpose `answer` is requested
- **THEN** the single request sent has no `Authorization` header (neither empty nor `Bearer `) and
  has `Content-Type: application/json`

#### Scenario: With a key the completion is sent and parsed

- **GIVEN** `LLM_BASE_URL=http://localhost:11434/v1/` (trailing `/`), `LLM_API_KEY=clave-x`,
  `LLM_MODEL=chat-x` and an endpoint that answers with 200 and
  `{ "choices": [{ "message": { "content": "hola" } }], "usage": { "prompt_tokens": 12, "completion_tokens": 3 } }`
- **WHEN** a completion with purpose `answer` and one `user` message is requested
- **THEN** exactly one `POST http://localhost:11434/v1/chat/completions` is sent with
  `Authorization: Bearer clave-x`, `Content-Type: application/json`, `model: "chat-x"`, the given
  messages and no `stream: true`; the result is text `hola`, model `chat-x`, `inputTokens` `12` and
  `outputTokens` `3`

#### Scenario: A completion without usage reports zero tokens

- **GIVEN** a live configuration and an endpoint that answers with 200 and
  `{ "choices": [{ "message": { "content": "hola" } }] }`
- **WHEN** a completion is requested
- **THEN** the result is text `hola` with `inputTokens` `0` and `outputTokens` `0`

#### Scenario: A null usage reports zero tokens

- **GIVEN** a live configuration with `LLM_EMBED_MODEL=embed-z` and an endpoint that answers a
  completion with 200, text `hola` and `"usage": null`, and embeddings for `["a"]` with 200, one vector
  of 1536 components (`index` 0) and `"usage": null`
- **WHEN** a completion and embeddings for `["a"]` are requested
- **THEN** the completion is text `hola` with `inputTokens` `0` and `outputTokens` `0`, and the
  embeddings hold the vector with `inputTokens` `0`

#### Scenario: A partial usage counts the missing field as zero

- **GIVEN** a live configuration and an endpoint that answers a completion with 200, text `hola` and,
  in turn, `"usage": { "prompt_tokens": 12 }` and
  `"usage": { "prompt_tokens": 12, "completion_tokens": null }`
- **WHEN** a completion is requested against each answer
- **THEN** each result is text `hola` with `inputTokens` `12` and `outputTokens` `0`

#### Scenario: A usage field of the wrong type is an invalid response

- **GIVEN** a live configuration with `LLM_EMBED_MODEL=embed-z` and an endpoint that answers with 200
  and a valid text or vector but, in turn, `prompt_tokens` `"12"`, `-1` and `1.5`, and, for the
  completion, `completion_tokens` `"3"`
- **WHEN** a completion and embeddings for `["a"]` are requested against each answer
- **THEN** every request fails with `LLM_UNAVAILABLE` and reason `invalid-response`

### Requirement: Embedding request, order and dimension

Embeddings for a non-empty list of texts SHALL be one `POST` to `<base>/embeddings` with
`Content-Type: application/json`, the same `Authorization` rule as completions, and a JSON body with
`model` = `LLM_EMBED_MODEL` and `input` = the texts, without a `dimensions` parameter. A response
SHALL be accepted only when its status is 2xx and its body is JSON with a `data` list holding exactly
one numeric vector per input text, each with its `index`. The result SHALL return the vectors in the
order of the input texts (by `index`, not by position in `data`; the indexes SHALL be exactly
`0..n-1` for `n` texts, each once, or the response is not accepted) and `usage.inputTokens` =
`usage.prompt_tokens`, with the same rule as completions: `usage` or `usage.prompt_tokens` absent or
`null` counts as `0`, and a `usage.prompt_tokens` that is present and is not a non-negative integer
makes the response not accepted. Every vector SHALL have exactly
1536 components, the dimension of the schema's embedding columns; otherwise the request SHALL fail
with `LLM_UNAVAILABLE`, reason `dimension-mismatch`, the expected dimension and the received one.
When `LLM_EMBED_MODEL` is configured, embeddings for an empty list SHALL return no vectors and
`inputTokens` `0` without sending any HTTP request.

#### Scenario: Embeddings are returned in input order

- **GIVEN** a live configuration with `LLM_EMBED_MODEL=embed-z` and an endpoint that answers with 200,
  `data` holding two vectors of 1536 components listed as `index` 1 then `index` 0, and
  `usage: { "prompt_tokens": 7 }`
- **WHEN** embeddings for `["a", "b"]` are requested
- **THEN** exactly one `POST <base>/embeddings` is sent with `model: "embed-z"`,
  `input: ["a", "b"]` and no `dimensions` field; the result holds the `index` 0 vector first and the
  `index` 1 vector second, with `inputTokens` `7`

#### Scenario: Embeddings without usage report zero tokens

- **GIVEN** the configuration of the previous scenario and the same response without `usage`
- **WHEN** embeddings for `["a", "b"]` are requested
- **THEN** the vectors are returned in input order with `inputTokens` `0`

#### Scenario: Embeddings for no texts send nothing

- **GIVEN** a live configuration with `LLM_EMBED_MODEL=embed-z`
- **WHEN** embeddings for `[]` are requested
- **THEN** the result holds no vectors and `inputTokens` `0`, and no HTTP request is sent

#### Scenario: A vector of another dimension is rejected

- **GIVEN** a live configuration with `LLM_EMBED_MODEL=embed-z` and an endpoint that answers with 200
  and one vector of 768 components for one input text
- **WHEN** embeddings for `["a"]` are requested
- **THEN** it fails with `LLM_UNAVAILABLE`, reason `dimension-mismatch`, expected `1536` and received
  `768`

#### Scenario: Embeddings with missing or duplicated indexes are an invalid response

- **GIVEN** a live configuration with `LLM_EMBED_MODEL=embed-z` and an endpoint that answers
  embeddings for two texts with 200 and vectors of 1536 components, in turn: `data` holding a single
  vector (`index` 0); `data` with indexes `[0, 0]`; `data` with indexes `[0, 2]`
- **WHEN** embeddings for `["a", "b"]` are requested against each answer
- **THEN** every request fails with `LLM_UNAVAILABLE` and reason `invalid-response`

### Requirement: Endpoint failures map to one error

Every failure of a completion or embedding request SHALL be reported as `LLM_UNAVAILABLE` with one
reason of this closed list: `http-status` (a non-2xx status, which the error SHALL carry),
`invalid-response` (a body that is not JSON, or JSON that does not have the accepted shape),
`network` (the request could not be sent, or the connection failed, including while the body was
being read), `timeout` (no complete response — status, headers and whole body — within the configured
timeout; the request SHALL be aborted). A failure whose error, or its cause, has the code
`UND_ERR_HEADERS_TIMEOUT` or `UND_ERR_BODY_TIMEOUT` (the runtime's own header or body timeout), while
sending the request or while reading the body, SHALL also be `timeout`, without `systemCode`. Nothing
else SHALL escape a request. A `network` error SHALL carry `systemCode` when the error, or its cause,
has a code matching `^E[A-Z]+$` (for example `ECONNREFUSED`) or `^UND_ERR_[A-Z_]+$` (for example
`UND_ERR_SOCKET`), and SHALL have no `systemCode` property otherwise; no other text of the underlying
failure SHALL be carried. A detail that does not apply to a failure
(`status`, `expected`, `received`, `systemCode`) SHALL be absent from the error, not present with an
empty value.

#### Scenario: A non-2xx status is reported with the status

- **GIVEN** a live configuration with `LLM_EMBED_MODEL=embed-z` and an endpoint that answers with
  401, then 429, then 500
- **WHEN** a completion and embeddings for `["a"]` are requested against each answer
- **THEN** every request fails with `LLM_UNAVAILABLE`, reason `http-status` and the received status

#### Scenario: A redirect is not followed

- **GIVEN** a live configuration with `LLM_EMBED_MODEL=embed-z` and an endpoint that answers every request
  with 302 and `Location` pointing to another path that would answer 200
- **WHEN** a completion and embeddings for `["a"]` are requested
- **THEN** both fail with `LLM_UNAVAILABLE`, reason `http-status` and status `302`, and each sent exactly one
  request, which asked not to follow redirects

#### Scenario: A body that is not JSON or has another shape is an invalid response

- **GIVEN** a live configuration with `LLM_EMBED_MODEL=embed-z` and an endpoint that answers with 200
  and, in turn, a body that is not JSON, `{}`, `{ "choices": [] }`,
  `{ "choices": [{ "message": { "content": null } }] }` and, for embeddings,
  `{ "data": [{ "index": 0, "embedding": ["x"] }] }`
- **WHEN** a completion and embeddings for `["a"]` are requested against each answer
- **THEN** every request fails with `LLM_UNAVAILABLE` and reason `invalid-response`

#### Scenario: A network failure is reported as network

- **GIVEN** a live configuration with `LLM_EMBED_MODEL=embed-z` and an endpoint whose connection fails,
  first with a system error code `ECONNREFUSED`, then with a failure whose code is free text
  (`connect failed: secret`), then with no code at all
- **WHEN** a completion and embeddings for `["a"]` are requested against each failure
- **THEN** every request fails with `LLM_UNAVAILABLE` and reason `network`; `systemCode` is
  `ECONNREFUSED` for the first failure and absent (no such property) for the other two

#### Scenario: A connection cut while reading the body is a network failure

- **GIVEN** a live configuration with `LLM_EMBED_MODEL=embed-z` and an endpoint that sends status 200
  and its headers, then cuts the connection before the body ends (without any abort), first with a
  system error code `ECONNRESET` and then without a code
- **WHEN** a completion and embeddings for `["a"]` are requested against each endpoint
- **THEN** every request fails with `LLM_UNAVAILABLE` and reason `network`; `systemCode` is
  `ECONNRESET` for the first endpoint and absent (no such property) for the second

#### Scenario: A runtime socket failure carries its code

- **GIVEN** a live configuration with `LLM_EMBED_MODEL=embed-z` and, in turn, an endpoint whose request
  is rejected as `TypeError('fetch failed')` with a cause of code `UND_ERR_SOCKET`, and an endpoint that
  sends status 200 and its headers and then fails the body with the same shape
- **WHEN** a completion and embeddings for `["a"]` are requested against each endpoint
- **THEN** every request fails with `LLM_UNAVAILABLE`, reason `network` and `systemCode` `UND_ERR_SOCKET`

#### Scenario: A runtime header or body timeout is a timeout

- **GIVEN** a live configuration with `LLM_EMBED_MODEL=embed-z` and, in turn, an endpoint whose request
  is rejected as `TypeError('fetch failed')` with a cause of code `UND_ERR_HEADERS_TIMEOUT`, and an
  endpoint that sends status 200 and its headers and then fails the body as `TypeError('terminated')`
  with a cause of code `UND_ERR_BODY_TIMEOUT`
- **WHEN** a completion and embeddings for `["a"]` are requested against each endpoint
- **THEN** every request fails with `LLM_UNAVAILABLE` and reason `timeout`, and no error has a
  `systemCode` property

#### Scenario: A request that exceeds the timeout is aborted

- **GIVEN** a live configuration with `LLM_TIMEOUT_MS=50`, `LLM_EMBED_MODEL=embed-z` and, in turn, an
  endpoint that never answers until the request is aborted, and an endpoint that sends status 200 and
  its headers but does not finish the body until the request is aborted
- **WHEN** a completion and embeddings for `["a"]` are requested against each endpoint
- **THEN** every request is aborted and fails with `LLM_UNAVAILABLE` and reason `timeout`

### Requirement: The API key never leaks

The value of `LLM_API_KEY` SHALL only be sent in the `Authorization` header. It SHALL NOT appear in
the message of any error, in its `cause` (nor the cause's message), in its JSON serialisation nor in
its string form. An error SHALL NOT copy the raw body of the endpoint's response.

#### Scenario: Errors never contain the key

- **GIVEN** `LLM_API_KEY=centinela-secreta-123`, `LLM_EMBED_MODEL=embed-z`, and an endpoint that
  answers each request with one of the failures of the previous requirement (a 500 whose body holds
  `centinela-secreta-123`, a non-JSON body holding it, an invalid JSON shape holding it, a network
  failure whose error message holds it, and a timeout)
- **WHEN** a completion and embeddings for `["a"]` are requested against each failure and the error
  is captured
- **THEN** for every error, `centinela-secreta-123` appears neither in its message, nor in its
  `cause` or the cause's message, nor in its JSON serialisation, nor in its string form

### Requirement: Only a live configuration builds the HTTP client

The OpenAI-compatible client SHALL be constructible only from a configuration in mode `live`; passing
a configuration in mode `evaluation` SHALL be rejected by the type check, so no code that type-checks
can build an HTTP client from an evaluation configuration (a runtime guard is not required). The
client SHALL report its mode as `live`; the `evaluation` mode belongs to the evaluation adapter
(DIS-18).

#### Scenario: An evaluation configuration does not type-check against the client

- **GIVEN** a configuration value in mode `evaluation`
- **WHEN** code passes it to the HTTP client's constructor and the project's type check runs
- **THEN** the type check reports that call as an error, while the same call with a live
  configuration type-checks and the client it builds reports mode `live`

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
