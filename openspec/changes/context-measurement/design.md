## Context

See `proposal.md` → Why. The state that shapes the approach (checked by the propose agent on
2026-11-03):

- `POST /api/projects/{projectId}/ask` (`packages/api/src/schemas/ask.ts`) takes `question`, optional
  `tokenBudget` and optional `useCache` (absent = `true`). An answered body carries `usage` with
  `inputTokens`, `outputTokens`, `baselineTokens`, `baselineEstimator: 'chars-div-4'`, `savingsPct`,
  `costUsd`, `latencyMs`, `cacheHit`, `generation{inputTokens,outputTokens,costUsd}` and
  `verification{calls,cacheHits,inputTokens,outputTokens,costUsd,latencyMs}`. An `UNKNOWN` body carries
  only `answer`, `reason` (`no-anchor`, `llm-required`, `over-budget`, `invalid-model-output`,
  `no-evidence`, `broken-evidence`), an optional `message` and empty `statements` / `evidence`: **no
  usage**, although `query_log` records the spend of an `UNKNOWN` after a model call (`readme.md` §3.2).
- `usage.ts`: totals are generation + verification; `savingsPct(input, baseline)` =
  `Math.round((baseline − input) · 1000 / baseline) / 10`, 0 when the baseline is 0.
  `baselineTokens` = Σ `estimateTokens` over the cited files whole (redacted content);
  `estimateTokens(text) = ceil(code points / 4)`.
- The API creates one in-memory verification cache per process, shared by every request
  (`packages/api/src/routes/ask.ts:130`); `packages/core/src/verify/semantic.ts:77-81` answers a
  repeated (statement, path, lines, excerpt) pair from it with no call and no token and counts it in
  `usage.verification.cacheHits`. `useCache: false` skips only the *answer* cache
  (`packages/core/src/explain/explain.ts:321`), and the new answer still replaces the cached one
  (`packages/api/src/schemas/ask.ts:50-51`), so the live run replaces the golden `cache_entry` rows of the
  sample projects until `npm run db:seed`. *(Added by the agent, correction round 1 of the spec audit.)*
- `GET /health` answers `{ "status": "ok" }` and says nothing about the LLM mode; evaluation mode shows
  only as `UNKNOWN` `llm-required`.
- `scripts/demo-ask.mjs` has `sendWithHttp` (`node:http`, no time limit, design D23 of DIS-102) and
  `apiPort` (not exported); `runDemoAsk` takes an injected `send`. `scripts/env.mjs` exports
  `loadEnvFile` and `DOTENV_PATH`. `scripts/annotation-agreement.mjs` exports `sha256` and
  `checkFreeze(report, root)`. `scripts/measure-graph.mjs` exports `readSeed` (projects with id and
  name; files with id, project and path only) but not its row reader `readRow`.
- `tests/unit/scripts/wiring.spec.ts` → "The startup scripts need no installed dependency": a
  `scripts/*.mjs` imports only `node:` built-ins and sibling `./*.mjs`. So the script cannot import
  `estimateTokens` or `savingsPct`; its tests (TypeScript) can, and guard the parity.
- `seeds/graph-dump.sql`: 91 `file` rows (53 `acme-shop`, 38 `task-api`), `content_hash` = SHA-256 of the
  raw bytes (checked on `fixtures/acme-shop/.gitignore`), two `redacted = true`
  (`fixtures/acme-shop/config/services.php`, `fixtures/task-api/src/config/env.ts`); 82 370 code points
  in the other 89, the largest 2 622.
- Ollama 0.40.13 on this machine, `qwen2.5-coder:latest` (7.6B, Q4_K_M, digest `dae161e2…`). It has no
  `/api/tokenize` (404). A throwaway probe in the scratchpad (not committed) sent
  `POST /api/generate` with `raw: true`, `num_predict: 1` twice for the same text and once for a text
  with a shared prefix: `prompt_eval_count` was 10, 10, 7 — the count is the whole prompt even when
  Ollama reuses its cache, so prefix reuse does not bias the deviation.
- `docs/DEMO.md` and the DIS-42 reports: on this machine one live answer takes 5–10 minutes on the CPU
  (598 s measured), with `LLM_TIMEOUT_MS=1200000` and `OLLAMA_CONTEXT_LENGTH=16384`; past autonomous
  runs started the API and Ollama as detached processes with the `LLM_*` variables set for that command
  only (`.env` is not edited by the agent).
- `scripts/annotation-agreement.mjs:274` and `scripts/measure-graph.mjs:309` each hold an unexported
  `roundRatio` (the second, non-negative only, says it copies the first).
- `readme.md` §2.6: the intro paragraph (tested by `tests/unit/docs/graph-quality.spec.ts`, which needs
  `npm run measure:graph` and `DIS-81` in it), Table 1 with five *(pendiente)* columns, the limitations
  paragraph («preguntas de la Tabla 1 realizadas por la autora»). Line 29: «Medir el verificador |
  Previsto». §3.2 line 1138: «La desviación frente al conteo real se mide en la Tabla 1 (CM-HU-22.2)».
  Line 1528: «La respuesta llega en menos de 10 segundos…».

## Goals / Non-Goals

**Goals:**

- One pure `build(inputs)` that the CLI and the documentation test both call, so CI proves the
  published figures are the aggregation of the committed raw data without a model.
- A run that survives hours on a CPU: every response and every count is on disk the moment it arrives,
  and a new run resumes.
- A failure mode for every broken input or environment, with exit 1 and no final output written.

**Non-Goals:**

- Any product code change, any new dependency, a hosted or paid model.
- A general CSV library: only the writer and the reader the tests need.

## Decisions

**D1 — Questions written by an agent and frozen first (ticket D1).** The apply agent writes
`questions.json` from the fixtures, the graph and the golden table, commits it with
`docs/measurements/context-savings.md` holding only its title and `## Hashes SHA-256` (the hash from
`node -e` over `sha256`), and only then starts the run. Git history is the evidence of the order. Each
question has `expected: "answer" | "unknown"`, declared beforehand, so the report can say how many
expected `UNKNOWN` really were. Layout: `{ "formatVersion": 1, "projects": [ { "fixture": "acme-shop",
"questions": [ { "id": "Q01", "question": "…", "expected": "answer" } ] } ] }`.

**D2 — The figures come from the `/ask` response, not from `query_log` (ticket D2).** Same `usage.ts`
for both; the script needs no database. Consequence: an `UNKNOWN` carries no usage, so every `UNKNOWN`
row is left out of the token figures and counted by reason, and the report declares that the spend of
an `UNKNOWN` after a model call (`invalid-model-output`, `no-evidence`, `broken-evidence`) is not in
Table 1.

**D3 — `useCache: false` always; `cacheHit: true` aborts (ticket D3).** A cached answer measures 0
tokens. Also a response missing any usage field aborts: the measurement never guesses a value.
*Verification cache (spec audit B1, agent's decision):* the API's per-process verification cache
(Context) is not bypassed by `useCache: false`. The measurement records it instead of aborting:
`usage.verification.cacheHits` goes to the CSV column `verifyCacheHits` and is summed per project in the
JSON (`verification.cacheHits`), and the report and the README limitations state that a verification
answered from that cache costs no token. *Alternative:* abort on `cacheHits > 0` — rejected: it is how
the product behaves in use, the answer cache is the one the ticket asks to avoid, and an abort would make
a 40-question run on a CPU depend on the questions never sharing a cited excerpt. The figure depends on
question order and API restarts; the report records the launches (task 7.4c), so that dependence is
visible.

**D4 — «CODEMIND» = total `inputTokens` (ticket D4).** Generation plus verification, the definition of
`savingsPct`; the CSV also gives the generation alone. «Ahorro» is recomputed from the sums with the
`savingsPct` formula (integer tenths, `Math.round`), not averaged per question.

**D5 — Verification shares (ticket D5).** Tokens (input + output) and latency; cost is `null` and
published `n/a (0 USD con Ollama local)` when the total cost is 0. The CSV gains `verifyCostUsd` (not in
the ticket's draft column list) so the cost share can be recomputed from the CSV when a priced model is
used.

**D6 — Deviation sample (ticket D6).** Every non-redacted seed file of both projects (89): a redacted
file's indexed content is not its bytes on disk, so it is excluded and named in the JSON. Each file's
SHA-256 must equal the seed's `content_hash`, which proves the counted text is the indexed one.
`POST /api/generate` with `raw: true` (no chat template), `stream: false`, `options.num_predict: 1`;
the count is `prompt_eval_count`. Deviation = Σ estimate / Σ provider − 1 (positive = the estimate
overcounts), per file the same, ties by path.

**D7 — Raw data and resume.** Under `docs/measurements/context/raw/`:
`run.json` `{ formatVersion: 1, startedAt, ollamaVersion, model, modelDigest, verifyModel }` (written
once at the first run; a later run with another Ollama version, model, digest or `verifyModel` exits 1,
so a published run never mixes models, and raw responses or `tokenizer.json` present without `run.json`
exit 1 naming `docs/measurements/context/raw/run.json` instead of rewriting it, spec audit run 2,
agent's decision: a rewrite would let a deleted `run.json` hide a change of model; and so does a
`run.json` that cannot be read or parsed as JSON or lacks one of its fields, spec audit run 4, B2,
agent's decision; it is never rewritten); `<fixture>/<id>.json` `{ formatVersion: 1, fixture, questionId, question,
receivedAt, status: 200, body }`; `tokenizer.json` `{ formatVersion: 1, counts: [ { file, sha256,
providerTokens } ] }` (rewritten whole after each count, sorted by file; `file` is the
repository-relative path `fixtures/<fixture>/<path>` with `/` separators, spec audit run 4). Writes use `writeFileSync` of
the full text. *Raw-data integrity (spec audit run 3, B1, agent's decision):* right after `run.json`
and before the first request, every file under `raw/` is read and validated: JSON that parses, the
required fields above (a raw response's `fixture` and `questionId` equal to its path; each count with
`file`, `sha256` and a positive integer `providerTokens`), a known question id or sample file, at most
one count per `file` (spec audit run 4), no other file, each count's `sha256` equal to its file's current hash, and each raw response's `question` equal
to the question file (stale raw). Any failure exits 1 naming the file, before any ask or generate
request. A count with another `sha256` is not redone: a silent recount would hide that the seed or a
fixture changed after the count. *Alternative:* validate lazily when a file is reached — rejected: a
stale `Q20` would only stop the run after `Q03` had been sent, hours in. The final outputs are written only when nothing is missing, after building all their texts in memory.
*Alternative:* one in-process run writing only the final files — rejected: on a CPU it takes hours, a
dropped connection or a stopped process would lose everything, and the apply agent's tool calls are
bounded to 10 minutes.

**D8 — Order of the run.** Arguments (exit 2) → `.env` (`loadEnvFile`, as `demo:ask`) → `PORT` read
with `apiPort` (invalid: exit 2, as `scripts/demo-ask.mjs:140-144`; spec audit run 2) →
`checkFreeze` on `docs/measurements/context-savings.md` (problems about the report prefixed with its
path) → question file shape (no golden-text check: see the next paragraph) → seed (`readSeed` for
project ids, its own `seeds/graph-dump.sql: …` errors written to stderr with exit 1; a sample fixture
with no `project` row exits 1 naming the fixture and `seeds/graph-dump.sql`; `readRow` for the `file`
rows with `content_hash` and `redacted`) and the sample files' hashes → `LLM_BASE_URL` set → `LLM_MODEL`
set and not blank → `GET /health` (unreachable: `measure:context: the API is not reachable at
http://127.0.0.1:<port> (start it with npm run up)`, as `scripts/demo-ask.mjs:155`) →
Ollama `GET /api/version` and `GET /api/tags` → `raw/run.json` → every raw file read and validated
(D7; exit 1 naming the file) → missing questions in file order →
missing counts in path order → `build` → write the outputs → summary. The Ollama origin is
`LLM_BASE_URL` trimmed, without a trailing `/`, then without a trailing `/v1`. The API origin is
`http://127.0.0.1:<PORT>` with `PORT` read by `apiPort` of `demo-ask.mjs` (exported, D9) at the step
above. The verification model is `LLM_MODEL_VERIFY` trimmed, or `LLM_MODEL` when it is unset or blank,
as `packages/adapters/llm/src/config.ts:90`. The project
id is the seed's `project.id` for the fixture name (the same deterministic ids as `SAMPLE_PROJECTS`).
*Golden texts (spec audit B2, agent's decision):* the command does not check that each project holds
its golden question texts, because the source of those texts is `GOLDEN_PROJECTS` in
`packages/cli/src/cache/demo-questions.ts` (TypeScript, which a `scripts/*.mjs` may not import). The
rule is checked by `tests/unit/docs/context-savings.spec.ts` → "The committed question set is
complete" against `GOLDEN_PROJECTS` (itself checked against `fixtures/README.md` by
`tests/unit/seed/golden-questions.spec.ts`). *Alternative:* parse the demo-question table of
`fixtures/README.md` in the script — rejected: a second parser of a Markdown table for a check the
TypeScript test already does with the canonical list.

**D9 — Reuse by exports.** `scripts/demo-ask.mjs` exports `sendWithHttp` and `apiPort` (and its
`.d.mts` the declarations); `scripts/measure-graph.mjs` exports `readRow` (and its `.d.mts`);
`scripts/annotation-agreement.mjs` exports `roundRatio` (and its `.d.mts`), so this script imports it
instead of a third copy (spec audit, pattern duplication; the copy in `measure-graph.mjs` is left as it
is, out of scope). No behaviour of any of the three scripts changes and no existing test changes.
GET requests (`/health`, `/api/version`, `/api/tags`) pass `body: ''` and `headers: {}`, since
`sendWithHttp` computes `Buffer.byteLength(body)` (`scripts/demo-ask.mjs:37`) and `Send` requires a
string body (`scripts/demo-ask.d.mts:7`); without it an API that is up would read as unreachable (spec
audit run 2). `send` is injected as in `runDemoAsk`:
`runMeasureContext(args, { root, env, dotenvPath, send, now, stdout, stderr })`, where `now(): Date`
gives the `receivedAt` / `startedAt` timestamps for the tests, written as `now().toISOString()`; the
earliest and latest `receivedAt` are compared as those ISO strings (spec audit run 4).

**D10 — Output layouts.** CSV: the header of the spec (with `verifyCacheHits` after `verifyCalls`),
values as `String(n)`, booleans `true` / `false`, empty cells for an `UNKNOWN`'s usage, a field quoted
when it holds `,`, `"`, CR or LF (inner `"` doubled), LF line ends and a final LF. JSON:
`{ formatVersion: 1, run: <run.json without formatVersion, plus questionsSha256, firstReceivedAt and
lastReceivedAt (the earliest and latest receivedAt of the raw responses)>, projects: [ { fixture, questions, answered, unknown: { <reason>: n } (reasons sorted),
baselineTokens, inputTokens, outputTokens, savingsTenths, latencyMs, generation: { inputTokens,
outputTokens }, verification: { calls, cacheHits, inputTokens, outputTokens, costUsd, latencyMs,
maxCallsPerAnswer }, costUsd, shares: { tokens, latency, cost }, latency: { medianMs, verifyMedianMs,
under10s }, expectedUnknown: { declared, answeredUnknown } } ], tokenizer: { model, files, excluded:
[paths], estimated, provider, deviation, min: { file, estimated, provider, deviation }, max: { file,
estimated, provider, deviation } } }`, where `latencyMs` is Σ `latencyMs` of the answered rows,
`savingsTenths` the integer tenths of «Ahorro» (883 for 88,3 %; the key is not `savingsPct`, which in
the product and in the CSV is a percentage, spec audit run 4, B1), each `file` of `tokenizer` the
repository-relative `fixtures/<fixture>/<path>`,
`expectedUnknown.declared` the number of questions with `expected: "unknown"` and
`expectedUnknown.answeredUnknown` the number of those whose response is `UNKNOWN` (spec audit run 3).
Every ratio is computed from integers except the cost share, a quotient of the summed `costUsd`
numbers (`null` at a total cost of 0, which is always the case with Ollama). Ratios
are numbers rounded to four decimals half away from zero from the integer numerator and denominator,
with the `roundRatio` exported from `scripts/annotation-agreement.mjs` (D9), `null` on a zero
denominator. Boundary rules (spec audit B4, agent's decision): `savingsTenths` (integer tenths, `-0`
normalised to `0` as the product's `savingsPct` does) is `null` when `baselineTokens` is 0 (the product's `savingsPct` returns 0 there, but a project with no answered row
has no savings; published `no definido`); `medianMs`, `verifyMedianMs` and `maxCallsPerAnswer` are
`null` with no answered row; `under10s` counts `latencyMs` < 10 000 (strict, since the README criterion
is «menos de 10 segundos»); `verifyMedianMs` is the `⌈n/2⌉`-th smallest `verification.latencyMs`.
`JSON.stringify(value, null, 2) + "\n"`. Answer files: `{ formatVersion: 1, fixture, answers: [ {
questionId, question, answer, reason?, statements: [ { text, type, evidenceIds } ], evidence } ] }`
with `evidence` copied from the body; `confidence` and `usage` dropped, and each statement's
`verification` (`entailed` / `cited`) dropped too (spec audit, agent's decision: the DIS-82 reviewers
judge correctness from the evidence, and the verifier's own verdict would anchor them). The `/ask` body
has no `events` key, so nothing else is dropped.

**D11 — Formatting for README and report.** Exported `formatTokens(n)` (digits grouped by three with a
space from 10 000 up: `60 000`, `7000`), `formatPercent(n, d)` (one decimal, decimal comma, a space
before `%`, from the integers: `88,3 %`), `formatSigned(n, d)` for deviations (`+5,9 %`, `-25,0 %`,
`0,0 %`) and `formatSeconds(ms)` (`412,3 s`). The lines below Table 1:
`` - `<fixture>`: <answered> respondidas y <unknown> UNKNOWN (<reason> <n>, …); verificación <tokens> de los tokens y <latency> del tiempo; coste de verificación <cost | n/a (0 USD con Ollama local)>; latencia mediana <s> (verificación <s>) ``
and `` - Desviación de `baselineTokens` (chars/4) frente al tokenizador de `<model>` en <files> ficheros: <signed> en total (mínimo <signed>, máximo <signed> por fichero) ``.
*Spec audit run 2, agent's decisions:* «Ahorro» has its own `formatSavings(tenths)`, which takes the
JSON's `savingsTenths` (spec audit run 4) (`883` → `88,3 %`,
`-952` → `-95,2 %`, `-2` → `-0,2 %`, `0` → `0,0 %`, `null` → `no definido`), used for every «Ahorro» of
the README, the report and the stdout summary; it does no rounding, since the tenths come from the
`savingsPct` formula (D4), and a negative value starts with hyphen-minus `-`, a non-negative one has no
sign. `formatPercent`, `formatSigned` and `formatSeconds` round to one decimal half away from zero from
the integers, as `roundRatio` does (`formatSigned(-1, 8)` → `-12,5 %`, exact; `formatSigned(-1, 16)` →
`-6,3 %`; `formatSeconds(412_350)` → `412,4 s`). A project with no `UNKNOWN` gives
`<answered> respondidas y 0 UNKNOWN` with no parentheses; otherwise the reasons appear in the JSON's
sorted order. The documentation test uses the same formatters. Every formatter takes integers (a numerator and a
denominator, or a count), never a rounded ratio of the JSON, so no figure is rounded twice; a `null`
measure is written `no definido`.

**D12 — Model (ticket D8).** `qwen2.5-coder:latest` local for the answer and the verification
(`LLM_MODEL_VERIFY` empty). The script records the model of its own environment; the apply agent
starts the API and the script with the same `LLM_*` values on the command line, and the report says so.
*Ollama context length (spec audit run 3, B2, agent's decision):* Ollama is served by the agent with
`OLLAMA_CONTEXT_LENGTH=16384` after recording whether the tray app or an `ollama.exe` was running and
stopping the tray app and every `ollama.exe` / `llama-server` (`docs/project-context.md` → Gotcha
DIS-72): with the default context Ollama cuts `explain`'s 5–7k-token prompt, which gives an
all-`UNKNOWN` Table 1 or truncated `prompt_tokens` that understate «CODEMIND». The OpenAI-compatible
route takes no `num_ctx` and the script cannot see the server's setting, so the apply logs Ollama to the
scratchpad, records its `inference compute … library=` line, checks the log for
`truncating input prompt` on every wait (on a hit: stop, delete that launch's raw responses, re-launch;
the frozen questions are never edited), and the report's `## Entorno` records the context length and
the clean log. At the end the agent stops its own `ollama.exe` and restores the Ollama state it
recorded. *Alternative:* reuse whatever Ollama is running — rejected: a tray app with the default
context would bias the published figure silently.

**D13 — Verifier (Entrega 1 review note, moved from DIS-79).** The JSON and the report give per project
the verifier's share of the latency, the median latency of an answer and of its verification against
the 10 s criterion of `readme.md`, and the largest `verification.calls` of one answer against
`MAX_VERIFY_CALLS_PER_ANSWER` (20, "provisional, revised with the Table 1 measurements", PH-27). The
report states the agent's conclusion on that constant from the data; the constant does not change in
this change.

**D14 — The shared §2.6 intro.** It becomes one paragraph saying both tables are measured, naming
`npm run measure:graph` (DIS-79) and `npm run measure:context` (DIS-81), so
`tests/unit/docs/graph-quality.spec.ts` stays green unchanged; the `graph-quality` delta rewrites the
sentence of "Published Table 2" that called Table 1 pending.

## Risks / Trade-offs

- **Hours of CPU time.** 40 answers at 5–10 minutes each. Mitigation: D7 resume; the apply agent runs
  the script as a detached process with a log in the scratchpad and waits with bounded foreground calls
  (never `Monitor` or `run_in_background`); a GPU, when Ollama uses it, only shortens it.
- **One run of a 7.6B model.** The figures are a product measurement, not research; declared in the
  limitations, with no repetition (parent non-goal).
- **The script cannot see the API's configuration.** It records the model of its own environment and
  detects evaluation mode only by `llm-required`; declared.
- **Spend of `UNKNOWN` answers outside Table 1** (D2); declared, with the count by reason.
- **Raw data size.** 40 responses with evidence excerpts and 89 counts: expected under 1 MB of JSON,
  acceptable in the repository; the step 9 report records the measured size.
- **Negative savings.** The six golden answers of `seeds/cache/*.json` all have a negative `savingsPct`
  (−1,3 % to −97,8 %): on the small sample files the prompt and the verification can exceed the raw
  context. Mitigation: published as measured, with the explanation paragraph of "Published Table 1"
  and the §0.3 sentence qualified (P30), never adjusted.

## Follow-ups

*(Agent's text, propose of DIS-81, autonomous run, 2026-11-03.)* Every decision the ticket left open,
with its destination (`docs/project-context.md` → Tracking deferred findings):

- **P1 (ticket D1)** — questions written by the apply agent and frozen before the run. **A**.
- **P2 (ticket D2)** — figures from the `/ask` response; `UNKNOWN` rows out of the token figures,
  counted by reason; the spend of post-model `UNKNOWN` answers declared as a limitation. **A** (the
  limitation itself: **D**, accepted: `query_log` already has it).
- **P3 (ticket D3)** — `useCache: false`; a cached or incomplete usage aborts. **A**.
- **P4 (ticket D4)** — «CODEMIND» = total input tokens. **A**.
- **P5 (ticket D5)** — verification shares of tokens and latency; cost `n/a` at 0 USD; extra CSV column
  `verifyCostUsd`. **A**.
- **P6 (ticket D6)** — deviation over the 89 non-redacted seed files, hash-checked; the two redacted
  files excluded and named. **A**.
- **P7 (ticket D7)** — «Correctas (de 20)» filled by DIS-82 from `answers/`; this change writes
  `pendiente de DIS-82`. **B** (DIS-82, blocked by this ticket).
- **P8 (ticket D8)** — `qwen2.5-coder:latest` for answer and verification. **A**.
- **P9** — raw data and resume (D7). **A**.
- **P10** — answer files without confidence and cache flag too (the `/ask` body has no events; see P26
  for the statements' verdict), besides model and tokens
  (DIS-82: the reviewers do not see the model nor the tokens column). **A**.
- **P11** — reuse by exporting `sendWithHttp`, `apiPort` and `readRow` (D9); no existing test edited. **A**.
- **P12** — `graph-quality` "Published Table 2" modified so the shared intro can say Table 1 is
  measured (D14). **A**.
- **P13** — verifier latency and calls against the 10 s criterion and `MAX_VERIFY_CALLS_PER_ANSWER`
  (D13), with the agent's conclusion in the report; no change of the constant here. **A**.
- **P14** — the review note's "measure also with a hosted model": not done; paid or hosted providers
  are a non-goal of the ticket and the parent, and no ticket of the roadmap owns it. **D**.
- **P15** — Ollama prefix reuse: the probe shows `prompt_eval_count` is the whole prompt in Ollama
  0.40.13, so it is not a limitation; the report records the version it was checked on. **A**. It
  replaces the sentence of the ticket's enhanced D6 that said prefix reuse «se declara como
  limitación»; task 12.3 records the replacement in the enhanced part of DIS-81.

*(Agent's text, correction round 1 of the spec audit of DIS-81, autonomous run, 2026-11-03.)* Decisions
taken by the agent as lead engineer on the questions and blocking findings of the audit:

- **P16 (audit B1)** — the API's per-process verification cache is recorded (`verifyCacheHits`, per row
  and per project) and declared as a limitation, not an abort (D3). **A**.
- **P17 (audit B2)** — the golden question texts are checked by
  `tests/unit/docs/context-savings.spec.ts` against `GOLDEN_PROJECTS`, not by the command (D8). **A**.
- **P18 (audit B3)** — JSON ratios rounded to four decimals half away from zero with `roundRatio`
  exported from `scripts/annotation-agreement.mjs`; the JSON gains Σ `latencyMs` and the `estimated` /
  `provider` counts of `min` / `max`; every published figure is formatted from integers (D9, D10, D11).
  **A**.
- **P19 (audit B4)** — «Ahorro» `null` (`no definido`) at a zero baseline, medians and
  `maxCallsPerAnswer` `null` with no answered row, `under10s` strict `< 10 000` (D10). **A**.
- **P20 (audit B5)** — `LLM_MODEL` blank, a fixture missing from the seed and a seed error each exit 1
  before any request (D8). **A**.
- **P21 (audit B6)** — the README limitations keep the small sample repositories and the Table 2
  annotation by two independent agents, and add the verification cache; pinned by the spec and its
  test. **A**.
- **P22 (audit Q1)** — a Table 1 with «Correctas (de 20)» `pendiente de DIS-82` is the DoD of DIS-81
  («Tabla 1 rellena» of the sub-issue); the parent's AC 3 («sin *(pendiente)*») is met when DIS-82 fills
  the column, which is its scope and is blocked by this ticket. **B** (DIS-82).
- **P23 (audit Q2)** — PH-27's verification ratio is published as the token and latency shares; the cost
  share is `n/a (0 USD con Ollama local)`, and `verifyCostUsd` lets it be recomputed with a priced
  model. No priced estimate from a reference price table: it would invent a price for a model the run
  did not pay for, and hosted or paid models are a non-goal (P14). **D** (accepted).
- **P24 (audit Q3)** — the ticket's AC 5 «sin escribir salidas parciales» means the final outputs (CSV,
  JSON, `answers/`); the raw responses of `docs/measurements/context/raw/` are kept so a run resumes
  (D7). Recorded in the enhanced part of DIS-81. **A**.
- **P25 (audit Q4)** — the parent's «CSV revisado por la autora» no longer applies: the no-author-work
  rule and the DIS-53 comment of 2026-10-28 give that review to independent agents (DIS-82). **A**.
- **P26 (audit, answer files)** — the statements' `verification` verdict is left out of `answers/` so
  the DIS-82 reviewers are not anchored (D10). **A**.
- **P27 (audit, scope notes)** — the `scripts/` line of the README tree and the extra CSV columns
  `verifyCostUsd` and `verifyCacheHits` are recorded in the enhanced part of DIS-81. **A**.

*(Agent's text, correction round 2 of the spec audit of DIS-81, autonomous run, 2026-11-03.)* Decisions
taken by the agent as lead engineer on the question and findings of audit run 2:

- **P28 (audit run 2, B1)** — a negative «Ahorro» is the likely outcome (the six golden answers are all
  negative). It is computed as integer tenths with the `savingsPct` formula (half toward +∞), written
  by `formatSavings` with a hyphen-minus, and explained below Table 1 in a paragraph starting
  `**Por qué CODEMIND envía más tokens que el contexto bruto.**`; the figures are never adjusted, the
  same explain-don't-adjust rule the parent DIS-53 gives Table 2. **A**.
- **P29 (audit run 2, B2)** — the other one-decimal formatters round half away from zero from the
  integers, as `roundRatio`; the D11 line reads `… y 0 UNKNOWN` with no parentheses when there is none,
  and lists reasons in the JSON's sorted order. **A**.
- **P30 (audit run 2, Q1)** — the §0.3 sentence «lo que reduce coste y latencia de forma medida» is in
  scope only when the measurement contradicts it: if any project's «Ahorro» is below 0, this change
  rewrites it (agent's text) without that claim and with a link to Table 1; otherwise it is kept. Out
  of scope would leave the README contradicting its own Table 1; rewriting it unconditionally would
  widen the change. The sentence's latency claim has no raw-context latency to compare with in this
  measurement; that is accepted as it stands when the savings are non-negative. **A** (the latency
  wording: **D**, accepted). Recorded in a Spanish comment on DIS-81; DIS-53's description is not
  edited.
- **P31 (audit run 2, improvable)** — `run.json` compares `verifyModel` too; raw data without
  `run.json` exits 1 rather than rewriting it; `LLM_MODEL_VERIFY` unset or blank falls back to
  `LLM_MODEL`; `PORT` is checked right after `.env`; GET requests send `body: ''`; the "no variable
  value" rule excepts `PORT`; the seed's unreadable-file line is attributed to the command. **A**.

*(Agent's text, correction round 3 of the spec audit of DIS-81, autonomous run, 2026-11-03.)* Decisions
taken by the agent as lead engineer on the findings of audit run 3 (it asked no question of the author):

- **P32 (audit run 3, B1)** — raw-data integrity on resume: after `raw/run.json` and before any ask or
  generate request, every file under `raw/` is read and validated (JSON, required fields, a known
  question id or sample file, no stray file, each count's `sha256` equal to its file's current hash, no
  stale question text); any failure exits 1 naming the file. A count with a changed `sha256` exits 1
  rather than being recounted, so a seed or fixture change cannot be hidden (D7, D8; new scenario
  "Unusable raw data stops the run before any question", task 5.4). **A**.
- **P33 (audit run 3, B2)** — Ollama context length: the agent serves Ollama with
  `OLLAMA_CONTEXT_LENGTH=16384` after stopping the tray app and every `ollama.exe` / `llama-server`,
  checks its log for `truncating input prompt` during the run, records both in `## Entorno`, and
  restores the Ollama state recorded before (D12; tasks 7.3, 7.4b, 7.8, 7.9, 10.3). **A**.
- **P34 (audit run 3, improvable)** — the shared §2.6 intro must contain `npm run measure:context` and
  not `sigue pendiente`; the Table 1 caption drops `~`; the §0.3 link is `(#26-tests)`; a freeze table
  without the `questions.json` row is a problem; question lengths in UTF-16 code units with no U+0000 and
  trimmed texts unique per project, as `askBodySchema`; `prompt_eval_count` must be a positive integer;
  the cost share is the one ratio not from integers; `expectedUnknown` and `run.firstReceivedAt` /
  `run.lastReceivedAt` defined (D10); the resumed-run scenario holds `raw/run.json` and the same clock.
  **A**.

*(Agent's text, correction round 4 of the spec audit of DIS-81, autonomous run, 2026-11-03.)* Decisions
taken by the agent as lead engineer on the findings of audit run 4 (it asked no question of the author):

- **P35 (audit run 4, B1)** — the per-project «Ahorro» of `context-savings.json` is written under the
  key `savingsTenths` as integer tenths (883 for 88,3 %) or `null`, with `-0` written `0`; the key
  `savingsPct` is kept for the CSV column only, where it is the product's percentage per row. The README
  and report format «Ahorro» from `savingsTenths` with `formatSavings` (spec "Aggregation rules", D10,
  D11; tasks 6.1, 6.1b, 7.6a). **A**.
- **P36 (audit run 4, B2)** — a `raw/run.json` that cannot be read or parsed as JSON, or that lacks
  `formatVersion` 1, `startedAt`, `ollamaVersion`, `model`, `modelDigest` or `verifyModel`, exits 1
  naming `docs/measurements/context/raw/run.json`, asking nothing, and is never rewritten, so a broken
  file cannot hide a change of model (spec "Live environment check", D7; task 4.2). **A**.
- **P37 (audit run 4, improvable)** — every `file` of `raw/tokenizer.json` and of the JSON's
  `tokenizer` part is the repository-relative `fixtures/<fixture>/<path>` with `/` separators (the
  stdout line keeps `tokenizer <fixture>/<path>`); `now(): Date`, timestamps written with
  `toISOString()` and compared as ISO strings (D9); `-0` tenths normalised to `0` with the pair
  baseline 3000 / input 3001; two counts for the same `file` are a raw-data failure (5.4b); the
  scenarios "UNKNOWN rows are counted apart" and "The outputs are deterministic" now pin
  `expectedUnknown` and `run.firstReceivedAt` / `run.lastReceivedAt` (tasks 6.1, 6.3). **A**.

*(Agent's text, apply of DIS-81, autonomous run, 2026-11-03.)* Decisions taken by the agent as lead engineer while applying the change (it asked no question of the author):

- **P38 (apply)** — Ollama for the live run: the auto mode classifier denied stopping the machine's tray app and `ollama.exe` (task 7.3, D12), so the agent started its own `ollama serve` on `127.0.0.1:11435` with `OLLAMA_CONTEXT_LENGTH=16384` and pointed the API and the script at it, leaving the user's Ollama untouched. The context length, the model and the clean log are the ones D12 requires; only the port differs. The report's `## Entorno` says so. **A**.
- **P39 (apply)** — the figures are negative («Ahorro» -34,4 % and -62,5 %), so the explanation paragraph and the §0.3 rewrite of P28/P30 apply, and no figure is adjusted. **A**.
- **P40 (apply)** — the script was written before its test file in one pass; the RED run was obtained afterwards by moving the module away (module missing), and is declared in the step 9 report. The tests were not weakened. **A**.
- **P41 (apply)** — `readSample` names a sample project with no `project` row before `readSeed` reports the rows left dangling by it, so the scenario "The seed has no row of a sample project" gets the fixture name in stderr (found by the test, not by the spec). **A**.
- **P42 (apply)** — the verifier conclusion on `MAX_VERIFY_CALLS_PER_ANSWER`: the largest number of calls of one answer was 9 and 15 against 20, so the constant is kept; the median latency (162,5 s and 93,6 s) does not meet the README criterion of 10 s on this hardware, declared in the report. No follow-up ticket: the criterion belongs to a hosted-model setup (P14). **D** (accepted).
