## Why

Table 1 of the README (§2.6, context savings) is still *(pendiente)*, and §0.3 shows the savings as a
measured figure. What is missing (Linear DIS-81, CM-HU-22.2, parent DIS-53 / CM-HU-22) is the
measurement with a real model: 20 questions per sample repository sent to the running API, the
raw context against the tokens CODEMIND really sends, how much of that is the verifier (PH-27), and how
far the local `baselineTokens` estimate (`chars-div-4`, PH-16) is from the provider's count. It also
closes the Entrega 1 review note "Medir el verificador" (latency and calls of the verifier per query),
moved here from DIS-79. Without it the README cannot back its savings claim, nor say with which error.

## What Changes

- **Measurement script.** `scripts/measure-context.mjs` (+ `scripts/measure-context.d.mts`), run by the
  new npm script `measure:context`: `--root <dir>` as the only option, exit codes 0 / 1 / 2 like the
  other scripts, `.env` loaded as `demo:ask` loads it. It imports only Node built-ins and sibling
  scripts (`env.mjs`, `demo-ask.mjs`, `annotation-agreement.mjs`, `measure-graph.mjs`).
- **Frozen questions.** `docs/measurements/context/questions.json`: 20 questions per sample project
  (`acme-shop`, `task-api`), ids `Q01`–`Q20`, the three golden questions of each project among them and
  at least two declared beforehand as expected `UNKNOWN`. Written by the apply agent (no work of the
  author) and frozen by SHA-256 in `docs/measurements/context-savings.md` → `## Hashes SHA-256`
  **before** any answer exists. The script checks the hash first and stops on any mismatch, before
  any network call.
- **Live run against the real API.** The script checks `GET /health`, that `LLM_BASE_URL` points to an
  Ollama that holds `LLM_MODEL` (records Ollama's version and the model's digest), and sends each
  question to `POST /api/projects/{id}/ask` with `useCache: false`. An `UNKNOWN` `llm-required`
  (evaluation mode), a response with `cacheHit: true`, a non-2xx status or an unreachable API stop the
  run with exit 1. Each received response is kept as raw evidence under
  `docs/measurements/context/raw/`, so a run on a CPU (5–10 minutes per question on this machine, 598 s measured in DIS-42) can resume.
  The API's per-process verification cache, which `useCache: false` does not bypass, is recorded per
  answer (`verifyCacheHits`) and declared as a limitation.
- **Tokenizer deviation (PH-16).** For every non-redacted file of the two projects listed in
  `seeds/graph-dump.sql` (89 of 91; its bytes checked against the seed's `content_hash`), the local
  estimate against Ollama's `prompt_eval_count` of the raw text: files, aggregate deviation, minimum
  and maximum per file.
- **Outputs.** Written only when the 40 responses and the 89 counts are all present, all from the raw
  data and deterministic: `docs/measurements/context/context-savings.csv` (one row per question),
  `docs/measurements/context/context-savings.json` (per-project aggregates: raw context, tokens sent,
  savings, `UNKNOWN` by reason, verification share of tokens and latency, cost ratio `n/a` at 0 USD,
  median latency against the 10 s criterion, verifier calls and verification cache hits per answer;
  and the deviation; `null`, published `no definido`, for a savings or median with no answered row) and
  `docs/measurements/context/answers/<project>.json` for DIS-82, with no model, token, cost, latency,
  confidence or verifier verdict. A negative «Ahorro» (CODEMIND sends more than the raw context, as the
  six golden answers of `seeds/cache/*.json` already do) is published as measured, never adjusted.
- **Report and README.** New `docs/measurements/context-savings.md` (agent's text: hashes, method,
  versions, results, deviation, verifier, the revision of `MAX_VERIFY_CALLS_PER_ANSWER` asked by PH-27,
  limitations). `readme.md`: Table 1 filled except «Correctas (de 20)» («pendiente de DIS-82»), its
  caption and the limitations paragraph rewritten (questions written by an agent and frozen; one run;
  local 7.6B model; measured deviation, PH-16; verification ratio, PH-27; verification cache; and,
  kept, the small sample repositories and the two-agent annotation of Table 2), the review-table row «Medir
  el verificador» to applied, the §3.2 `baseline_tokens` paragraph with the measured deviation, the
  `scripts/` line of the tree. When a project's «Ahorro» is negative, a paragraph
  «Por qué CODEMIND envía más tokens que el contexto bruto.» below Table 1 explains it, and the §0.3
  sentence «lo que reduce coste y latencia de forma medida» is rewritten without that claim, linking
  Table 1 (design P28, P30); otherwise §0.3 is left as it is.
- **Tests, without network.** `tests/unit/scripts/measure-context.spec.ts` (pure rules and the CLI on
  temporary copies with a fake `send`) and `tests/unit/docs/context-savings.spec.ts` (the committed
  outputs equal a fresh aggregation of the committed raw data; README and report agree with the JSON).
  No test calls a model or Ollama.
- **Small reuse edits.** `scripts/demo-ask.mjs` exports its time-limit-free HTTP client
  (`sendWithHttp`) and its `PORT` reader (`apiPort`), `scripts/measure-graph.mjs` exports its seed row
  reader (`readRow`), and `scripts/annotation-agreement.mjs` exports `roundRatio`; no behaviour changes.

**Non-goals.** Judging the answers or filling «Correctas (de 20)» (DIS-82); the private repository,
paid or hosted providers, repetitions or confidence intervals; changing the local tokenizer,
`usage.ts`, `query_log`, `MAX_VERIFY_CALLS_PER_ANSWER` or any product code under `packages/`; reading
`query_log` (the figures come from the `/ask` responses); tests that call a real model in CI.

## Capabilities

### New Capabilities

- `context-measurement`: the live measurement of Table 1 — frozen question set, environment checks,
  asking each question with resumable raw evidence, tokenizer deviation sample, aggregation rules,
  outputs, CLI, and the published Table 1 and report.

### Modified Capabilities

- `graph-quality`: requirement "Published Table 2" — its last sentence says Table 1 is pending; it
  becomes "the paragraph names `DIS-81`, which fills Table 1", so the shared introduction of §2.6 can
  say both tables are measured. Its test does not change.

## Impact

- New files: `scripts/measure-context.mjs`, `scripts/measure-context.d.mts`,
  `docs/measurements/context/questions.json`, `docs/measurements/context/raw/**`,
  `docs/measurements/context/context-savings.csv`, `docs/measurements/context/context-savings.json`,
  `docs/measurements/context/answers/{acme-shop,task-api}.json`, `docs/measurements/context-savings.md`,
  `tests/unit/scripts/measure-context.spec.ts`, `tests/unit/docs/context-savings.spec.ts`.
- Edited: `scripts/demo-ask.mjs` and `scripts/demo-ask.d.mts` (two exports), `scripts/measure-graph.mjs`
  and `scripts/measure-graph.d.mts` (one export), `scripts/annotation-agreement.mjs` and
  `scripts/annotation-agreement.d.mts` (one export), `package.json` (`scripts.measure:context`),
  `readme.md` (§0 review table, §0.3 only on a negative «Ahorro», §2.6, §3.2, tree), `docs/project-context.md` (the command and its
  gotchas). No existing test file is edited.
- No product code (`packages/**`), no migration, no dependency, no API or UI change. `scripts/` is
  outside Stryker's `mutate`, so the mutation gate is not affected.
- The real run needs the API in live mode with Ollama (`qwen2.5-coder:latest`, 7.6B Q4_K_M, local, 0
  USD) and takes hours on a CPU; the apply agent runs it and commits the raw data and the outputs. CI
  only re-aggregates the committed raw data.
- No personal data: questions and answers are about the sample fixtures; the script never writes the
  value of `LLM_BASE_URL`, `LLM_API_KEY` or any other variable except the model names.
