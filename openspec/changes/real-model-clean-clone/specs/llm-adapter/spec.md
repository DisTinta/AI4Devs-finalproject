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
  than 3600000 (one hour, the range of `CACHE_BUILD_TIMEOUT_MS`; enough for the slowest CPU answer
  measured, about 9 minutes per request) → configuration error naming `LLM_TIMEOUT_MS`; absent → a
  request timeout of 120000 ms;
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
  `-5`, then `1.5`, then `9999999999`, then `3600001`; and then a valid `LLM_TIMEOUT_MS` with
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

#### Scenario: A timeout above 300 s is accepted

- **GIVEN** a valid live configuration with `LLM_TIMEOUT_MS=300001`, then `1200000`, then `3600000`
- **WHEN** the LLM configuration is read
- **THEN** each read returns mode `live` with that request timeout (300001, 1200000 and 3600000 ms)

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

## ADDED Requirements

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
  and `POST /v1/embeddings` with 200 and one vector of 1536 components (`index` 0), a live
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
