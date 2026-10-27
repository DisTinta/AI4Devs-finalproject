# Show spec working: answer-language (DIS-104, PR #68)

- Date: 2026-10-27
- Branch: `feature/dis-104-answer-language` at `b287a78`
- Text written by the agent in an autonomous run (no author present).

## How the system was exercised

The real API (`npm -w packages/api run dev`) and the real CLI (`npm run cli -- ask`), with the real
OpenAI-compatible adapter, the real Postgres database (`codemind-postgres-1`, acme-shop seeded) and the
real retrieval, sanitisation, verification and cache. The only scripted part is the model: a local
OpenAI-compatible endpoint (`stub-llm.mjs` in the agent's scratchpad, not committed) on
`127.0.0.1:11499` that returns, for each `answer` call, the output the step needs, answers
`{"entails":true}` to every `verify` call, and appends to `requests.log` the fifth and last line of the
system message it received and a hash of it. A scripted model makes the language of the answer a
choice of the run, so every branch of the check is shown on purpose; the real `qwen2.5-coder` already
produced the event live in task 7.1 (`reports/2026-10-26-language-measurement.md`, the CLI capture of
`docs/DEMO.md`), which this run reuses as the real-model evidence.

Environment of both commands (given in the command, `.env` neither read nor edited):
`LLM_BASE_URL=http://127.0.0.1:11499/v1 LLM_MODEL=stub-model LLM_MODEL_VERIFY= LLM_EMBED_MODEL= LLM_API_KEY= LLM_TIMEOUT_MS=60000`.
Request bodies were UTF-8 files sent with `curl --data-binary @file` (the run B lesson of the
measurement report).

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| An English answer to a Spanish question is reported and still returned | API: `¿Qué hace DiscountService?`, `useCache: false`, model answer `DiscountService calculates discounts for orders based on the loyalty tier.` + 1 statement citing `E1` | 200, the answer and its `FACT` statement unchanged, `cacheHit: false`; API log: one `explain event` line `"type":"answer_language_mismatch","expected":"es"` with no other field; claim and cache rows written (claims 0 → 1, cache entries 3 → 4) | yes | E1, E2 |
| A Spanish question gets the explicit Spanish instruction | same call | the endpoint received a 9-line system message: line 5 is the Spanish instruction and the last line is `Responde en español: …`, exactly the spec's texts | yes | E1 |
| No language event for a cache hit | API: same question, cache on | 200, `cacheHit: true`, same English answer; no new `explain event` line, no new model request | yes | E2 |
| No language event for a Spanish answer | API: same question, `useCache: false`, model answer `DiscountService calcula los descuentos de los pedidos.` | 200, `cacheHit: false`; no `explain event` line | yes | E3 |
| An English or undecided question keeps the generic system message; no event for an English question | API: `What does DiscountService do?` and `price`, `useCache: false` | 8-line system message, line 5 `Answer in the language of the question.`, hash `d166550a…` for both; no `explain event` line | yes | E4, E6 |
| No language event for an `UNKNOWN` (`no-evidence`) | API: `¿Qué hace DiscountService?`, model output with English answer and `"statements": []` | `{"answer":"UNKNOWN","reason":"no-evidence",…}`; Spanish system message sent; no `explain event` line | yes | E5 |
| An all-caps Spanish question is Spanish (design D1, R1) | API: `COMO SE CALCULA EL PRECIO FINAL DE UN PEDIDO`, `useCache: false` | the Spanish 9-line system message was sent | yes | E6 |
| The CLI writes the event | CLI: `ask acme-shop "¿Qué hace TaxService?"`, English model answer | exit 0, answer printed unchanged; stderr exactly `{"level":"info","type":"answer_language_mismatch","expected":"es"}` | yes | E7 |
| Error cases unchanged | API: empty question; unknown project id | `400 VALIDATION_ERROR`; `404 PROJECT_NOT_FOUND` | yes | E8 |
| Live real-model event | CLI with `qwen2.5-coder` (task 7.1) | mixed answer, `answer_language_mismatch` line on stderr | yes (reused) | `reports/2026-10-26-language-measurement.md` |

## Evidence

E1. Spanish question, English answer (`POST /api/projects/a794456d-6d1b-5b55-a360-13fec83dc7bc/ask`):

```
{"answer":"DiscountService calculates discounts for orders based on the loyalty tier.","statements":[{"text":"DiscountService calculates the discount of an order.","type":"FACT","verification":"entailed","evidenceIds":["ev-1"]}],"evidence":[{"id":"ev-1","file":"tests/Unit/DiscountServiceTest.php","startLine":22,"endLine":82,…}],"confidence":0.85…,"usage":{…,"cacheHit":false,…,"verification":{"calls":1,…}}}
```

API log:

```
{"level":30,…,"reqId":"req-2","type":"answer_language_mismatch","expected":"es","msg":"explain event"}
```

`requests.log` (what the model endpoint received):

```
{"purpose":"answer","systemLines":9,"line5":"The question is in Spanish. Write \"answer\" and the \"text\" of every statement in Spanish, even when the code and the evidence are in English; keep code identifiers as they are.","lastLine":"Responde en español: \"answer\" y el \"text\" de cada statement van en español.","systemSha256":"686e37cbe6d0676e"}
{"purpose":"verify","systemLines":6,"systemSha256":"db3c01e6c3b90114"}
```

E2. Counts after E1: claims `1`, query_log `1`, cache entries `4`. Then the same question with the cache
on: `"answer":"DiscountService calculates discounts for orders based on the loyalty tier."`,
`"cacheHit":true`; `explain event` lines in the API log: still `1`; `requests.log` lines: still `2`.

E3. Spanish answer: `"answer":"DiscountService calcula los descuentos de los pedidos."`,
`"cacheHit":false`; `explain event` lines: still `1`; the Spanish system message (`686e37cb…`) was sent.

E4. English question: `"answer":"DiscountService calculates discounts for orders."`, `"cacheHit":false`;
`explain event` lines: still `1`; `requests.log`:

```
{"purpose":"answer","systemLines":8,"line5":"Answer in the language of the question.","lastLine":"Add no other field. If the evidence does not answer the question, return an empty \"statements\" list.","systemSha256":"d166550a8903ce96"}
```

E5. Empty statements: `{"answer":"UNKNOWN","reason":"no-evidence","statements":[],"evidence":[]}`;
`explain event` lines: still `1`; the Spanish system message was sent.

E6. `COMO SE CALCULA EL PRECIO FINAL DE UN PEDIDO`: system message `systemLines: 9`, Spanish line 5,
`686e37cb…`. `price`: `systemLines: 8`, `Answer in the language of the question.`, `d166550a…` (same hash as
E4: the system message alone is hashed, so the generic one is byte-identical for both). Both answered
`UNKNOWN` `no-evidence` (the scripted output still had no statement).

E7. CLI (`npm run --silent cli -- ask acme-shop "¿Qué hace TaxService?"`), exit `0`; stdout:

```
TaxService computes the tax of an order from the shipping country.

statements:
1. [FACT] TaxService computes the tax of an order.
   evidence: tests/Unit/TaxServiceTest.php:16-37
…
```

stderr:

```
{"level":"info","type":"answer_language_mismatch","expected":"es"}
```

E8. Errors:

```
{"error":{"code":"VALIDATION_ERROR","message":"invalid request","details":{"issues":[{"path":["question"],"code":"too_small",…},{"path":["question"],"code":"custom",…}]}}} HTTP 400
{"error":{"code":"PROJECT_NOT_FOUND","message":"project not found","details":{}}} HTTP 404
```

No event line, in the API log or on the CLI's stderr, holds any part of a question or an answer.

No screenshot was taken (no web interface is part of this change).

## State

- Before (acme-shop): claims `0`, query_log `0`, cache entries `3` with `0` hits.
- After the run: claims `4`, query_log `8`, cache entries `7` with `0` hits (the hit of E2 was on the
  entry that the later `useCache: false` call E3 replaced).
- Restored: yes. `npm run db:seed` (exit 0, `1 project loaded`), `npm run verify` (exit 0,
  `acme-shop: 3/3 golden answers match`), counts back to claims `0`, query_log `0`, cache entries `3`
  with `0` hits. The API and the scripted endpoint were stopped (port 3000 and 11499 free). The
  verification verdict cache is in memory and went away with the API.

## Not demonstrated

- `UNKNOWN` `broken-evidence` with a Spanish question and an English answer: it needs a file to change
  between the pack's read and the verification read, which the real interface cannot arrange in one
  call. Covered by the unit scenario "No language event for a Spanish answer, an English question, a
  cache hit or an UNKNOWN" (`tests/unit/explain/explain-language.spec.ts`).
- The event order with flagged question, failed claim write and failed query-log write: needs store
  failures. Covered by the unit scenario "The language event follows the verification events and
  precedes the write events".

## Handoff

The change is demonstrably working: through the real API and CLI, a Spanish question gets the Spanish
system message and an English or undecided one the generic message byte for byte; an English answer
to a Spanish question is returned unchanged, persisted and cached, with one code-only
`answer_language_mismatch` event in the API log and on the CLI's stderr; a Spanish answer, an English
question, a cache hit and an `UNKNOWN` carry none; error cases are unchanged. No screenshot or other
file was left at the repository root.
