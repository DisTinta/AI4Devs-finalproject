## MODIFIED Requirements

### Requirement: The client waits as long as the configured timeout

The OpenAI-compatible client built without an injected `fetch` (as the API and the CLI build it,
through the single entry point) SHALL impose no time limit of its own other than the configured
request timeout: a complete response that arrives after 300 s and within `LLM_TIMEOUT_MS` SHALL be
accepted. Such a client SHALL send its requests over Node's `http`/`https` modules, never through the
runtime's global `fetch` (whose header and body timeouts end any request at 300 s). The request it
sends and the way it maps responses and failures SHALL stay those of "Completion request and
response", "Embedding request, order and dimension" and "Endpoint failures map to one error": the
same method, URL, headers and body, redirects not followed, the configured timeout aborting the
request with reason `timeout`, and a refused connection reported as `network` with its `systemCode`.
A client built with an injected `fetch` SHALL use that `fetch` only, as before.

#### Scenario: Without an injected fetch the request does not use the global fetch

- **GIVEN** a local HTTP server on a free port that answers `POST /v1/chat/completions` with 200 and
  `{ "choices": [{ "message": { "content": "hola" } }], "usage": { "prompt_tokens": 12, "completion_tokens": 3 } }`,
  and `POST /v1/embeddings` with 200 and one vector of 768 components (`index` 0), a live
  configuration with `LLM_BASE_URL` pointing at `/v1` of that server, `LLM_API_KEY=clave-x`,
  `LLM_MODEL=chat-x` and `LLM_EMBED_MODEL=embed-z`, and the global `fetch` replaced by a recording spy
- **WHEN** the model is built through the entry point without a `fetch`, a completion with purpose
  `answer` and one `user` message is requested, and then embeddings for `["a"]`
- **THEN** the server received exactly one `POST /v1/chat/completions` with
  `Authorization: Bearer clave-x`, `Content-Type: application/json` and a JSON body with
  `model: "chat-x"` and the given messages; the result is text `hola`, model `chat-x`, `inputTokens`
  `12` and `outputTokens` `3`; the embeddings result holds that vector, after exactly one
  `POST /v1/embeddings`; and the spy recorded no call

#### Scenario: Without an injected fetch timeouts, refusals and redirects keep their mapping

- **GIVEN** a live configuration built through the entry point without a `fetch` and, in turn,
  `LLM_TIMEOUT_MS=50` against a local server that never answers, a URL on a local port where nothing
  listens, and a local server that answers 302 with a `Location` to a path that would answer 200
- **WHEN** a completion is requested against each
- **THEN** the first fails with `LLM_UNAVAILABLE` and reason `timeout`, the second with reason
  `network` and `systemCode` `ECONNREFUSED`, and the third with reason `http-status` and status `302`
  after exactly one request

#### Scenario: A response after 300 s is accepted

- **GIVEN** a live configuration with `LLM_TIMEOUT_MS=600000` built through the entry point without a
  `fetch`, against a local HTTP server that answers a valid completion 310 s after the request
- **WHEN** a completion is requested (a recorded check, run once by hand: too slow for the suite)
- **THEN** the result is the server's text, after more than 300 s, and no `LLM_UNAVAILABLE` is raised

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
  of 768 components (`index` 0) and `"usage": null`
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
makes the response not accepted. Every vector SHALL have exactly `EMBEDDING_DIMENSIONS` components,
768, the dimension of the schema's embedding columns and of the reference embedding model
`nomic-embed-text`; otherwise the request SHALL fail with `LLM_UNAVAILABLE`, reason
`dimension-mismatch`, the expected dimension and the received one. When `LLM_EMBED_MODEL` is
configured, embeddings for an empty list SHALL return no vectors and `inputTokens` `0` without sending
any HTTP request.

#### Scenario: Embeddings are returned in input order

- **GIVEN** a live configuration with `LLM_EMBED_MODEL=embed-z` and an endpoint that answers with 200,
  `data` holding two vectors of 768 components listed as `index` 1 then `index` 0, and
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
  and one vector of 1536 components for one input text
- **WHEN** embeddings for `["a"]` are requested
- **THEN** it fails with `LLM_UNAVAILABLE`, reason `dimension-mismatch`, expected `768` and received
  `1536`

#### Scenario: Embeddings with missing or duplicated indexes are an invalid response

- **GIVEN** a live configuration with `LLM_EMBED_MODEL=embed-z` and an endpoint that answers
  embeddings for two texts with 200 and vectors of 768 components, in turn: `data` holding a single
  vector (`index` 0); `data` with indexes `[0, 0]`; `data` with indexes `[0, 2]`
- **WHEN** embeddings for `["a", "b"]` are requested against each answer
- **THEN** every request fails with `LLM_UNAVAILABLE` and reason `invalid-response`

#### Scenario: The schema dimension is 768

- **WHEN** `EMBEDDING_DIMENSIONS` is read
- **THEN** it is `768`
