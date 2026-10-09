## Purpose

Puts every language model behind one port: an OpenAI-compatible client for completions and
embeddings, configured from the environment and validated when read, with Ollama (no key) as the real
development endpoint, so the rest of CODEMIND never knows the vendor and never leaks its key.

## ADDED Requirements

### Requirement: LLM configuration is classified and validated when read

The LLM configuration SHALL be read from the environment variables `LLM_BASE_URL`, `LLM_API_KEY`,
`LLM_MODEL`, `LLM_MODEL_VERIFY`, `LLM_EMBED_MODEL` and `LLM_TIMEOUT_MS`. Every value SHALL be
trimmed; a value that is unset, empty or only whitespace SHALL count as absent. `LLM_BASE_URL` SHALL
decide the mode:

- `LLM_BASE_URL` and `LLM_API_KEY` both absent → mode `evaluation`, whatever the other variables hold;
- `LLM_BASE_URL` present → mode `live`; `LLM_API_KEY` is optional in this mode;
- `LLM_API_KEY` present and `LLM_BASE_URL` absent → configuration error naming `LLM_BASE_URL`;
- mode `live` and `LLM_MODEL` absent → configuration error naming `LLM_MODEL`;
- mode `live` and `LLM_BASE_URL` not an absolute `http` or `https` URL, or one with user info, a query
  or a fragment (the endpoint paths are appended to it) → configuration error naming `LLM_BASE_URL`;
- mode `live` and `LLM_TIMEOUT_MS` present but not a positive integer in decimal digits no greater
  than 2147483647 (the largest delay a Node timer honours; above it Node fires after 1 ms) →
  configuration error naming `LLM_TIMEOUT_MS`; absent → a request timeout of 120000 ms.

In mode `evaluation` no other variable is checked. The configuration SHALL be validated when it is read;
reading it at boot is the composition root's job (DIS-29 / CM-HU-12).

A configuration error SHALL have the stable code `LLM_CONFIG_INVALID` and SHALL carry the name of
the variable at fault. Its message SHALL name that variable and SHALL NOT contain the value of any
variable.

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
  `-5`, then `1.5`, then `9999999999`; and then a valid `LLM_TIMEOUT_MS` with `LLM_BASE_URL` set to
  `localhost:11434`, then `ftp://x`, then `http://user:pw@localhost:11434/v1`, then
  `http://localhost:11434/v1?k=1`, then `http://localhost:11434/v1#x`
- **WHEN** the LLM configuration is read
- **THEN** each read fails with `LLM_CONFIG_INVALID` naming `LLM_TIMEOUT_MS` (the first five) or
  `LLM_BASE_URL` (the last five), and no message contains the rejected value

#### Scenario: A valid timeout overrides the default

- **GIVEN** a valid live configuration with `LLM_TIMEOUT_MS=50`
- **WHEN** the LLM configuration is read
- **THEN** it returns a request timeout of 50 ms

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
timeout; the request SHALL be aborted). Nothing else SHALL escape a request. A `network` error SHALL
carry `systemCode` when the runtime reports a system error code matching `^E[A-Z]+$` (for example
`ECONNREFUSED`), on the error or on its cause, and SHALL have no `systemCode` property otherwise; no
other text of the underlying failure SHALL be carried. A detail that does not apply to a failure
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
