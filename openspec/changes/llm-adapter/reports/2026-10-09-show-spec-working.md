# Show Spec Working — llm-adapter (DIS-17)

- Date: 2026-10-09
- Commit exercised: `3a0390f` (PR #31), built with `npx tsc --build`

## How it was exercised

The adapter has no CLI or HTTP entry point yet (DIS-29 / CM-HU-12). Each scenario was driven through the
**built package** (`packages/adapters/llm/dist/index.js`) with Node's **real global `fetch`** over **real HTTP**, by a
throwaway Node script in the session scratchpad (never committed, deleted afterwards):

- a local `node:http` stub server on `127.0.0.1:<random port>`, one path prefix per behaviour, that records every
  request it receives (path, `Authorization`, `Content-Type`, JSON body) — used for the shapes a real model server
  will not produce on demand (reversed indexes, missing `usage`, 401/429, a key reflected in the body, a stalled
  body);
- the **real Ollama** 0.40.2 on `localhost:11434` (CPU mode, `CUDA_VISIBLE_DEVICES=-1`; see the step 12 report for
  the GPU driver finding) with `llama3.2` and `nomic-embed-text`, for the success path and the real embedding
  dimension;
- real closed ports for network failures.

Step 12's manual run (`2026-10-09-12-manual-interface-testing.md`) is consistent with this one and adds the cold
start (18.3 s) and an unknown model (404).

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| No URL and no key selects evaluation mode | `llmConfigFromEnv` with `{}`, empties, blanks | `{mode:'evaluation'}` ×3 | Yes | S1 |
| A URL without a key selects live mode | Ollama URL, empty key, `chat-x` | live, no `apiKey`, `timeoutMs` 120000 | Yes | S2 |
| A key without a URL fails without showing the key | key only | `LLM_CONFIG_INVALID`, `LLM_BASE_URL`, value absent | Yes | S3 |
| A URL without a model fails | URL, empty model, with/without key | `LLM_CONFIG_INVALID`, `LLM_MODEL`, no key/URL in message | Yes | S4 |
| A malformed timeout or URL fails naming the variable | `abc`,`0`,`-5`,`1.5`,`9999999999`; `localhost:11434`,`ftp://x` | named variable each time, value absent | Yes | S5 |
| A valid timeout overrides the default | `LLM_TIMEOUT_MS=50` | `timeoutMs: 50` | Yes | S6 |
| The verify purpose falls back to the generation model | two clients over HTTP stub | `[chat-x, chat-x]` / `[verify-y, chat-x]` | Yes | S7 |
| Without an embedding model, embeddings fail and completions work | complete then embed | `hola`; `not-configured`; only `/chat/completions` reached the server | Yes | S8 |
| Without a key the completion is sent without Authorization | stub records headers; also real Ollama | `authorization: null`, `application/json`; Ollama answered `hello` | Yes | S9, S9+ |
| With a key the completion is sent and parsed | trailing `/` URL, `clave-x` | one POST `/chat/completions`, `Bearer clave-x`, body `{model, messages}`, result 12/3 | Yes | S10 |
| A completion without usage reports zero tokens | stub without `usage` | `0/0` | Yes | S11 |
| Embeddings are returned in input order | stub `data` index 1 then 0 | vectors 0.1 then 0.2, 1536 each, `inputTokens` 7, body `{model, input}` (no `dimensions`) | Yes | S12 |
| Embeddings without usage report zero tokens | stub without `usage` | order kept, `inputTokens` 0 | Yes | S13 |
| Embeddings for no texts send nothing | `embed([])` | `{vectors:[], inputTokens:0}`, 0 requests | Yes | S14 |
| A vector of another dimension is rejected | **real Ollama `nomic-embed-text`** | `dimension-mismatch`, 1536 vs 768 | Yes | S15 |
| Embeddings with missing or duplicated indexes are an invalid response | one / `[0,0]` / `[0,2]` | `invalid-response` ×3 | Yes | S16 |
| A non-2xx status is reported with the status | 401, 429, 500, both calls | `http-status` with each status | Yes | S17 |
| A body that is not JSON or has another shape is an invalid response | non-JSON, `{}`, `choices: []`, `content: null`, `embedding: ['x']` | `invalid-response` ×10 | Yes | S18 |
| A network failure is reported as network | real closed port 59999; real port 1 | `network` + `ECONNREFUSED`; port 1: `network` without code | Partly (see below) | S19 |
| A request that exceeds the timeout is aborted | stub never answers; stub sends 200 and stalls the body; 200 ms | `timeout` ×4 | Yes | S20 |
| Errors never contain the key | key reflected in a 500 body, a non-JSON body, an invalid shape; timeout; network | `keyLeaked: false` in message, `String`, JSON, `cause` for all 9 | Yes | S21 |
| An evaluation configuration does not type-check against the client | `npx tsc -p tests/tsconfig.json` | 0 errors with the directive in place; its RED (TS2578) is in the step 11 report | Yes | typecheck |

## Evidence

Verbatim output of the driver:

```
== Requirement: LLM configuration is classified and validated at boot
S1 no URL, no key                        [{"mode":"evaluation"},{"mode":"evaluation"},{"mode":"evaluation"}]
S2 URL without key                       {"mode":"live","baseUrl":"http://localhost:11434/v1","model":"chat-x","verifyModel":"chat-x","timeoutMs":120000}
S3 key without URL                       {"error":{"name":"LlmConfigError","code":"LLM_CONFIG_INVALID","variable":"LLM_BASE_URL"},"message":"LLM_BASE_URL is missing or invalid; see .env.example","valueLeaked":false}
S4 URL without model                     [{"error":{"name":"LlmConfigError","code":"LLM_CONFIG_INVALID","variable":"LLM_MODEL"},"message":"LLM_MODEL is missing or invalid; see .env.example","valueLeaked":false},{"error":{"name":"LlmConfigError","code":"LLM_CONFIG_INVALID","variable":"LLM_MODEL"},"message":"LLM_MODEL is missing or invalid; see .env.example","valueLeaked":false}]
S5 LLM_TIMEOUT_MS=abc                    {"error":{"name":"LlmConfigError","code":"LLM_CONFIG_INVALID","variable":"LLM_TIMEOUT_MS"},"message":"LLM_TIMEOUT_MS is missing or invalid; see .env.example","valueLeaked":false}
S5 LLM_TIMEOUT_MS=0                      {"error":{"name":"LlmConfigError","code":"LLM_CONFIG_INVALID","variable":"LLM_TIMEOUT_MS"},"message":"LLM_TIMEOUT_MS is missing or invalid; see .env.example","valueLeaked":false}
S5 LLM_TIMEOUT_MS=-5                     {"error":{"name":"LlmConfigError","code":"LLM_CONFIG_INVALID","variable":"LLM_TIMEOUT_MS"},"message":"LLM_TIMEOUT_MS is missing or invalid; see .env.example","valueLeaked":false}
S5 LLM_TIMEOUT_MS=1.5                    {"error":{"name":"LlmConfigError","code":"LLM_CONFIG_INVALID","variable":"LLM_TIMEOUT_MS"},"message":"LLM_TIMEOUT_MS is missing or invalid; see .env.example","valueLeaked":false}
S5 LLM_TIMEOUT_MS=9999999999             {"error":{"name":"LlmConfigError","code":"LLM_CONFIG_INVALID","variable":"LLM_TIMEOUT_MS"},"message":"LLM_TIMEOUT_MS is missing or invalid; see .env.example","valueLeaked":false}
S5 LLM_BASE_URL=localhost:11434          {"error":{"name":"LlmConfigError","code":"LLM_CONFIG_INVALID","variable":"LLM_BASE_URL"},"message":"LLM_BASE_URL is missing or invalid; see .env.example","valueLeaked":false}
S5 LLM_BASE_URL=ftp://x                  {"error":{"name":"LlmConfigError","code":"LLM_CONFIG_INVALID","variable":"LLM_BASE_URL"},"message":"LLM_BASE_URL is missing or invalid; see .env.example","valueLeaked":false}
S6 LLM_TIMEOUT_MS=50                     {"mode":"live","baseUrl":"http://localhost:11434/v1","model":"x","verifyModel":"x","timeoutMs":50}
== Requirement: Model selection per purpose
S7 without VERIFY: verify, answer        ["chat-x","chat-x"]
S7 with VERIFY: verify, answer           ["verify-y","chat-x"]
S8 no embed model: complete              {"ok":"hola","requests":[{"path":"/ok/v1/chat/completions","authorization":null,"contentType":"application/json","body":{"model":"chat-x","messages":[{"role":"user","content":"Q"}]}}]}
S8 no embed model: embed                 {"error":{"name":"LlmUnavailable","code":"LLM_UNAVAILABLE","reason":"not-configured"},"keyLeaked":false,"requests":0}
S8 requests sent in total                ["/ok/v1/chat/completions"]
== Requirement: Completion request and response
S9 no key (stub records headers)         {"ok":{"text":"hola","model":"chat-x","usage":{"inputTokens":12,"outputTokens":3}},"requests":[{"path":"/ok/v1/chat/completions","authorization":null,"contentType":"application/json","body":{"model":"chat-x","messages":[{"role":"user","content":"Q"}]}}]}
S10 key, trailing slash                  {"ok":{"text":"hola","model":"chat-x","usage":{"inputTokens":12,"outputTokens":3}},"requests":[{"path":"/ok/v1/chat/completions","authorization":"Bearer clave-x","contentType":"application/json","body":{"model":"chat-x","messages":[{"role":"user","content":"Q"}]}}]}
S11 no usage                             {"ok":{"text":"hola","model":"chat-x","usage":{"inputTokens":0,"outputTokens":0}},"requests":[{"path":"/nousage/v1/chat/completions","authorization":null,"contentType":"application/json","body":{"model":"chat-x","messages":[{"role":"user","content":"Q"}]}}]}
S9+ real Ollama, no key                  {"ok":{"text":"hello","model":"llama3.2","usage":{"inputTokens":31,"outputTokens":2}},"requests":[]}
== Requirement: Embedding request, order and dimension
S12 input order                          {"ok":{"firstComponents":[0.1,0.2],"dims":[1536,1536],"usage":{"inputTokens":7}},"requests":[{"path":"/ok/v1/embeddings","authorization":null,"contentType":"application/json","body":{"model":"embed-z","input":["a","b"]}}]}
S13 no usage                             {"ok":{"firstComponents":[0.1,0.2],"dims":[1536,1536],"usage":{"inputTokens":0}},"requests":[{"path":"/nousage/v1/embeddings","authorization":null,"contentType":"application/json","body":{"model":"embed-z","input":["a","b"]}}]}
S14 no texts                             {"ok":{"vectors":[],"usage":{"inputTokens":0}},"requests":[]}
S15 real Ollama nomic-embed-text         {"error":{"name":"LlmUnavailable","code":"LLM_UNAVAILABLE","reason":"dimension-mismatch","expected":1536,"received":768},"keyLeaked":false,"requests":0}
S16 indexes one                          {"error":{"name":"LlmUnavailable","code":"LLM_UNAVAILABLE","reason":"invalid-response"},"keyLeaked":false,"requests":1}
S16 indexes dup                          {"error":{"name":"LlmUnavailable","code":"LLM_UNAVAILABLE","reason":"invalid-response"},"keyLeaked":false,"requests":1}
S16 indexes gap                          {"error":{"name":"LlmUnavailable","code":"LLM_UNAVAILABLE","reason":"invalid-response"},"keyLeaked":false,"requests":1}
== Requirement: Endpoint failures map to one error
S17 s401 complete                        {"error":{"name":"LlmUnavailable","code":"LLM_UNAVAILABLE","reason":"http-status","status":401},"keyLeaked":false,"requests":1}
S17 s401 embed                           {"error":{"name":"LlmUnavailable","code":"LLM_UNAVAILABLE","reason":"http-status","status":401},"keyLeaked":false,"requests":1}
S17 s429 complete                        {"error":{"name":"LlmUnavailable","code":"LLM_UNAVAILABLE","reason":"http-status","status":429},"keyLeaked":false,"requests":1}
S17 s429 embed                           {"error":{"name":"LlmUnavailable","code":"LLM_UNAVAILABLE","reason":"http-status","status":429},"keyLeaked":false,"requests":1}
S17 s500 complete                        {"error":{"name":"LlmUnavailable","code":"LLM_UNAVAILABLE","reason":"http-status","status":500},"keyLeaked":false,"requests":1}
S17 s500 embed                           {"error":{"name":"LlmUnavailable","code":"LLM_UNAVAILABLE","reason":"http-status","status":500},"keyLeaked":false,"requests":1}
S18 notjson complete                     {"error":{"name":"LlmUnavailable","code":"LLM_UNAVAILABLE","reason":"invalid-response"},"keyLeaked":false,"requests":1}
S18 notjson embed                        {"error":{"name":"LlmUnavailable","code":"LLM_UNAVAILABLE","reason":"invalid-response"},"keyLeaked":false,"requests":1}
S18 empty complete                       {"error":{"name":"LlmUnavailable","code":"LLM_UNAVAILABLE","reason":"invalid-response"},"keyLeaked":false,"requests":1}
S18 empty embed                          {"error":{"name":"LlmUnavailable","code":"LLM_UNAVAILABLE","reason":"invalid-response"},"keyLeaked":false,"requests":1}
S18 nochoices complete                   {"error":{"name":"LlmUnavailable","code":"LLM_UNAVAILABLE","reason":"invalid-response"},"keyLeaked":false,"requests":1}
S18 nochoices embed                      {"error":{"name":"LlmUnavailable","code":"LLM_UNAVAILABLE","reason":"invalid-response"},"keyLeaked":false,"requests":1}
S18 nullcontent complete                 {"error":{"name":"LlmUnavailable","code":"LLM_UNAVAILABLE","reason":"invalid-response"},"keyLeaked":false,"requests":1}
S18 nullcontent embed                    {"error":{"name":"LlmUnavailable","code":"LLM_UNAVAILABLE","reason":"invalid-response"},"keyLeaked":false,"requests":1}
S18 badvector complete                   {"error":{"name":"LlmUnavailable","code":"LLM_UNAVAILABLE","reason":"invalid-response"},"keyLeaked":false,"requests":1}
S18 badvector embed                      {"error":{"name":"LlmUnavailable","code":"LLM_UNAVAILABLE","reason":"invalid-response"},"keyLeaked":false,"requests":1}
S19 closed port 59999 complete           {"error":{"name":"LlmUnavailable","code":"LLM_UNAVAILABLE","reason":"network","systemCode":"ECONNREFUSED"},"keyLeaked":false,"requests":0}
S19 closed port 59999 embed              {"error":{"name":"LlmUnavailable","code":"LLM_UNAVAILABLE","reason":"network","systemCode":"ECONNREFUSED"},"keyLeaked":false,"requests":0}
S19 port 1 (fetch bad port)              {"error":{"name":"LlmUnavailable","code":"LLM_UNAVAILABLE","reason":"network"},"keyLeaked":false,"requests":0}
S20 never answers complete               {"error":{"name":"LlmUnavailable","code":"LLM_UNAVAILABLE","reason":"timeout"},"keyLeaked":false,"requests":1}
S20 never answers embed                  {"error":{"name":"LlmUnavailable","code":"LLM_UNAVAILABLE","reason":"timeout"},"keyLeaked":false,"requests":1}
S20 200 + stalled body complete          {"error":{"name":"LlmUnavailable","code":"LLM_UNAVAILABLE","reason":"timeout"},"keyLeaked":false,"requests":1}
S20 200 + stalled body embed             {"error":{"name":"LlmUnavailable","code":"LLM_UNAVAILABLE","reason":"timeout"},"keyLeaked":false,"requests":1}
== Requirement: The API key never leaks
S21 leak500 complete                     {"error":{"name":"LlmUnavailable","code":"LLM_UNAVAILABLE","reason":"http-status","status":500},"keyLeaked":false,"requests":1}
S21 leak500 embed                        {"error":{"name":"LlmUnavailable","code":"LLM_UNAVAILABLE","reason":"http-status","status":500},"keyLeaked":false,"requests":1}
S21 leaknotjson complete                 {"error":{"name":"LlmUnavailable","code":"LLM_UNAVAILABLE","reason":"invalid-response"},"keyLeaked":false,"requests":1}
S21 leaknotjson embed                    {"error":{"name":"LlmUnavailable","code":"LLM_UNAVAILABLE","reason":"invalid-response"},"keyLeaked":false,"requests":1}
S21 leakshape complete                   {"error":{"name":"LlmUnavailable","code":"LLM_UNAVAILABLE","reason":"invalid-response"},"keyLeaked":false,"requests":1}
S21 leakshape embed                      {"error":{"name":"LlmUnavailable","code":"LLM_UNAVAILABLE","reason":"invalid-response"},"keyLeaked":false,"requests":1}
S21 never complete                       {"error":{"name":"LlmUnavailable","code":"LLM_UNAVAILABLE","reason":"timeout"},"keyLeaked":false,"requests":1}
S21 never embed                          {"error":{"name":"LlmUnavailable","code":"LLM_UNAVAILABLE","reason":"timeout"},"keyLeaked":false,"requests":1}
S21 network                              {"error":{"name":"LlmUnavailable","code":"LLM_UNAVAILABLE","reason":"network","systemCode":"ECONNREFUSED"},"keyLeaked":false,"requests":0}
```

```
$ npx tsc -p tests/tsconfig.json && echo "tests typecheck OK"
tests typecheck OK
```

## State

- Before: `git status --porcelain seeds packages/web fixtures` empty; `sha1sum seeds/graph-dump.sql`
  `f79d94e26d65cd79b39612408dc10b3db0b476b5`; HEAD `3a0390f`; no Ollama process.
- After: same indicators; no Ollama process (the test server was stopped); scratch script deleted. `git status`
  shows `.env.example` modified, an edit made outside this session's commands (the agent cannot read that file).
- Restored: yes; nothing persistent was created (no database, no repository file).

## Not demonstrated

- **"A network failure is reported as network", the free-text-code case** (`cause.code` = `connect failed: secret`):
  a real runtime does not produce a non-`E…` code on demand. It is covered by the unit test at
  `tests/unit/llm/openai-compatible-llm.spec.ts:335`. The real "no code" case was observed (port 1, which `fetch`
  rejects as `bad port` with no code → `network` without `systemCode`).
- With the **real** Ollama the request headers are not observable from the client;
  the header itself was shown on the recording stub (S9) for the same code path.

## Handoff

The change is **demonstrably working**: 21 of 22 scenarios were exercised end to end through the built adapter,
the real `fetch` and real HTTP (two of them against the real Ollama), and the remaining one was exercised for two
of its three cases. No screenshot was produced and none was left at the repository root.

---

## Addendum — real-runtime evidence after the review rounds (2026-10-09)

The first run predates `26c3629` (cut body, `usage`), `b0b2e23` (redirects, base URL, cancelled body) and the
adversarial-review fixes (undici codes, timeout cap). Re-run with the **built** adapter (`npx tsc --build`), Node
v24.11.1's **real** `fetch` (undici) and a **real** local `node:http` server, driver in the session scratchpad
(deleted afterwards). `hits` lists what the server received.

| Scenario | Result | Matches spec |
|---|---|---|
| A redirect is not followed | `http-status` `302`, one request each, no hit on the target path | Yes |
| A connection cut while reading the body is a network failure (real `socket.destroy()` mid-body) | `network`, `systemCode` `UND_ERR_SOCKET` | Yes |
| A runtime socket failure carries its code | same real cut: `UND_ERR_SOCKET` carried | Yes |
| A null usage reports zero tokens | completion `0/0`, embeddings `inputTokens` `0` | Yes |
| A partial usage counts the missing field as zero | `12/0` | Yes |
| A usage field of the wrong type is an invalid response | `invalid-response` (completion `"12"`, embeddings `-1`) | Yes |
| A malformed timeout or URL fails naming the variable (new values) | user info, query, fragment → `LLM_BASE_URL`; `300001` → `LLM_TIMEOUT_MS`; `300000` accepted | Yes |
| A non-2xx status is reported with the status | `500`, body cancelled (never read) | Yes |

Not demonstrated with the real runtime: "A runtime header or body timeout is a timeout" — undici's own
`UND_ERR_HEADERS_TIMEOUT`/`UND_ERR_BODY_TIMEOUT` fire only after 300 s by default; covered by the unit test with
the exact Node shape (`TypeError('fetch failed')` with `cause.code`).

```
redirect: complete                   {"error":{"reason":"http-status","status":302,"hasSystemCode":false},"hits":["POST /redirect/v1/chat/completions"]}
redirect: embed                      {"error":{"reason":"http-status","status":302,"hasSystemCode":false},"hits":["POST /redirect/v1/embeddings"]}
real socket cut mid-body: complete   {"error":{"reason":"network","systemCode":"UND_ERR_SOCKET","hasSystemCode":true},"hits":["POST /cut/v1/chat/completions"]}
real socket cut mid-body: embed      {"error":{"reason":"network","systemCode":"UND_ERR_SOCKET","hasSystemCode":true},"hits":["POST /cut/v1/embeddings"]}
usage null: complete                 {"ok":{"text":"hola","model":"chat-x","usage":{"inputTokens":0,"outputTokens":0}},"hits":["POST /usagenull/v1/chat/completions"]}
usage null: embed                    {"ok":{"vectors":1,"usage":{"inputTokens":0}},"hits":["POST /usagenull/v1/embeddings"]}
usage partial: complete              {"ok":{"text":"hola","model":"chat-x","usage":{"inputTokens":12,"outputTokens":0}},"hits":["POST /usagepartial/v1/chat/completions"]}
usage wrong type: complete           {"error":{"reason":"invalid-response","hasSystemCode":false},"hits":["POST /usagebad/v1/chat/completions"]}
usage wrong type: embed              {"error":{"reason":"invalid-response","hasSystemCode":false},"hits":["POST /usagebad/v1/embeddings"]}
500 (body cancelled, not read)       {"error":{"reason":"http-status","status":500,"hasSystemCode":false},"hits":["POST /status500/v1/chat/completions"]}
LLM_BASE_URL=http://user:pw@localhost:11434/v1 LLM_CONFIG_INVALID LLM_BASE_URL
LLM_BASE_URL=http://localhost:11434/v1?k=1     LLM_CONFIG_INVALID LLM_BASE_URL
LLM_BASE_URL=http://localhost:11434/v1#x       LLM_CONFIG_INVALID LLM_BASE_URL
LLM_TIMEOUT_MS=300000                          300000
LLM_TIMEOUT_MS=300001                          LLM_CONFIG_INVALID LLM_TIMEOUT_MS
```
