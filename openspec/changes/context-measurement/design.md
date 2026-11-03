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
once at the first run; a later run with another version, model or digest exits 1, so a published run
never mixes models); `<fixture>/<id>.json` `{ formatVersion: 1, fixture, questionId, question,
receivedAt, status: 200, body }`; `tokenizer.json` `{ formatVersion: 1, counts: [ { file, sha256,
providerTokens } ] }` (rewritten whole after each count, sorted by file). Writes use `writeFileSync` of
the full text. A raw response whose `question` differs from the question file exits 1 (stale raw).
The final outputs are written only when nothing is missing, after building all their texts in memory.
*Alternative:* one in-process run writing only the final files — rejected: on a CPU it takes hours, a
dropped connection or a stopped process would lose everything, and the apply agent's tool calls are
bounded to 10 minutes.

**D8 — Order of the run.** Arguments (exit 2) → `.env` (`loadEnvFile`, as `demo:ask`) →
`checkFreeze` on `docs/measurements/context-savings.md` (problems about the report prefixed with its
path) → question file shape → seed (`readSeed` for project ids; `readRow` for the `file` rows with
`content_hash` and `redacted`) and the sample files' hashes → `LLM_BASE_URL` set → `GET /health` →
Ollama `GET /api/version` and `GET /api/tags` → `raw/run.json` → missing questions in file order →
missing counts in path order → `build` → write the outputs → summary. The Ollama origin is
`LLM_BASE_URL` trimmed, without a trailing `/`, then without a trailing `/v1`. The API origin is
`http://127.0.0.1:<PORT>` with `PORT` read by `apiPort` of `demo-ask.mjs` (exported, D9); an invalid
`PORT` is a usage error (exit 2), as in `demo:ask`. The project
id is the seed's `project.id` for the fixture name (the same deterministic ids as `SAMPLE_PROJECTS`).

**D9 — Reuse by exports.** `scripts/demo-ask.mjs` exports `sendWithHttp` and `apiPort` (and its
`.d.mts` the declarations); `scripts/measure-graph.mjs` exports `readRow` (and its `.d.mts`). No behaviour of either
script changes and no existing test changes. `send` is injected as in `runDemoAsk`:
`runMeasureContext(args, { root, env, dotenvPath, send, now, stdout, stderr })`, where `now` gives the
`receivedAt` / `startedAt` timestamps for the tests.

**D10 — Output layouts.** CSV: the header of the spec, values as `String(n)`, booleans `true` /
`false`, empty cells for an `UNKNOWN`'s usage, a field quoted when it holds `,`, `"`, CR or LF (inner
`"` doubled), LF line ends and a final LF. JSON: `{ formatVersion: 1, run: <run.json without
formatVersion, plus questionsSha256 and the first and last receivedAt>, projects: [ { fixture,
questions, answered, unknown: { <reason>: n } (reasons sorted), baselineTokens, inputTokens,
outputTokens, savingsPct, generation: { inputTokens, outputTokens }, verification: { calls, inputTokens,
outputTokens, costUsd, latencyMs, maxCallsPerAnswer }, costUsd, shares: { tokens, latency, cost },
latency: { medianMs, verifyMedianMs, under10s }, expectedUnknown: { declared, answeredUnknown } } ],
tokenizer: { model, files, excluded: [paths], estimated, provider, deviation, min: { file, deviation },
max: { file, deviation } } }`; ratios as numbers rounded to four decimals half up from the integers (the
`roundRatio` formula of `annotation-agreement.mjs`), `null` on a zero denominator;
`JSON.stringify(value, null, 2) + "\n"`. Answer files: `{ formatVersion: 1, fixture, answers: [ {
questionId, question, answer, reason?, statements, evidence } ] }` with `statements` and `evidence`
copied from the body; `confidence`, `usage` and `events` dropped.

**D11 — Formatting for README and report.** Exported `formatTokens(n)` (digits grouped by three with a
space from 10 000 up: `60 000`, `7000`), `formatPercent(n, d)` (one decimal, decimal comma, a space
before `%`, from the integers: `88,3 %`), `formatSigned(n, d)` for deviations (`+5,9 %`, `-25,0 %`,
`0,0 %`) and `formatSeconds(ms)` (`412,3 s`). The lines below Table 1:
`` - `<fixture>`: <answered> respondidas y <unknown> UNKNOWN (<reason> <n>, …); verificación <tokens> de los tokens y <latency> del tiempo; coste de verificación <cost | n/a (0 USD con Ollama local)>; latencia mediana <s> (verificación <s>) ``
and `` - Desviación de `baselineTokens` (chars/4) frente al tokenizador de `<model>` en <files> ficheros: <signed> en total (mínimo <signed>, máximo <signed> por fichero) ``.
The documentation test uses the same formatters.

**D12 — Model (ticket D8).** `qwen2.5-coder:latest` local for the answer and the verification
(`LLM_MODEL_VERIFY` empty). The script records the model of its own environment; the apply agent
starts the API and the script with the same `LLM_*` values on the command line, and the report says so.

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
- **Raw data size.** 40 responses with evidence excerpts and 89 counts: some hundreds of kB of JSON,
  acceptable in the repository.

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
- **P10** — answer files without confidence, events and cache flag too, besides model and tokens
  (DIS-82: the reviewers do not see the model nor the tokens column). **A**.
- **P11** — reuse by exporting `sendWithHttp`, `apiPort` and `readRow` (D9); no existing test edited. **A**.
- **P12** — `graph-quality` "Published Table 2" modified so the shared intro can say Table 1 is
  measured (D14). **A**.
- **P13** — verifier latency and calls against the 10 s criterion and `MAX_VERIFY_CALLS_PER_ANSWER`
  (D13), with the agent's conclusion in the report; no change of the constant here. **A**.
- **P14** — the review note's "measure also with a hosted model": not done; paid or hosted providers
  are a non-goal of the ticket and the parent, and no ticket of the roadmap owns it. **D**.
- **P15** — Ollama prefix reuse: the probe shows `prompt_eval_count` is the whole prompt in Ollama
  0.40.13, so it is not a limitation; the report records the version it was checked on. **A**.
