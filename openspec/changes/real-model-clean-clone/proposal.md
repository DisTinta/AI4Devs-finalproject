## Why

On 2026-10-20 the author followed `docs/DEMO.md` on a clean clone of `feature/entrega-2-CRN` with
Windows PowerShell 5.1: every evaluation-mode step matched the guide. Then she configured Ollama in
`.env` and asked a question that is not in the cache. Two hidden walls stopped her:

1. `SOURCE_UNAVAILABLE` (`not-a-repository`): live `explain` reads the code of `fixtures/acme-shop`
   from its own `.git`, which is gitignored and never travels with the clone. It is built by
   `node fixtures/build-history.mjs`, but neither `npm run up` nor any guide says so.
2. After building it by hand, `LLM_UNAVAILABLE` (`timeout`): on a CPU-only machine one answer takes
   3.5–9 min, and the LLM adapter is capped at 300 s (`LLM_TIMEOUT_MS` ≤ 300000) because Node's
   `fetch` ends any request at 300 s on its own. `cache:build` and `demo:ask` already avoid that limit
   with `node:http`.

She also noted that `readme.md` §1.4 says «tres comandos» above a block of four, and asked for a
guide to try a real model (Ollama with GPU or on CPU, a hosted OpenAI-compatible API, or Claude).

This is DIS-103 (labels `docs`, `dx`; no parent issue in Linear, so the ticket alone bounds the
change). The author's decisions of 2026-10-20 frame it: a clean clone must reach free questions with
a real model without hidden steps (the fixture history built by `npm run up`, and documented anyway);
**the 300 s cap is removed** (the adapter sends with `node:http` and `LLM_TIMEOUT_MS` accepts values
above 300000); a Spanish section `Probar con un modelo real` in `docs/DEMO.md`, identical in
PowerShell and Bash; and the §1.4 title fixed. The lead-engineer decisions D1–D14 of the DIS-103
Enhanced description (autonomous run, ADR `20261016-autonomous-workflow-run-entrega-2`) and the design
decisions of this change make them concrete.

## What Changes

- **`npm run up` builds the fixture history** (Enhanced D1): a sixth step,
  `[up] node fixtures/build-history.mjs acme-shop`, after `npm run db:seed` and before `npm run dev`,
  run by the same Node executable without a shell, every time (deterministic, about 11 s). The built
  `HEAD` is the seed's `indexed_commit`. Evaluation mode, `npm run verify` and the seed fingerprint do
  not change.
- **Ctrl+C during that step never leaves the fixture modified** (design D3, replacing Enhanced D3):
  `up` starts the step with a preload with no imports, `scripts/defer-ctrl-c.mjs`, that keeps the
  process alive on Ctrl+C until the builder has restored the fixture's tracked files; `up` then
  reports `[up] stopped (Ctrl+C)` and exits `130` as for any step.
  `fixtures/build-history.mjs` itself is **not** edited: it is a seed fingerprint input, and any byte
  change would stale the seed and the reviewed golden file (design D3).
- **No 300 s cap on the language model** (author decision, Enhanced D4–D5): the OpenAI-compatible
  client sends over `node:http`/`node:https` by default (the `longFetch` of `cache:build`, moved into
  the LLM adapter and re-exported where it was), so the API, the CLI and the web inherit it.
  `LLM_TIMEOUT_MS` accepts 1 to 3600000 (the range of `CACHE_BUILD_TIMEOUT_MS`); the default stays
  120000. An injected `fetch` keeps working as before.
- **`docs/DEMO.md` → `Probar con un modelo real`** (Enhanced D2, D6–D9, D13): a Spanish section
  between `Recorrido por la web` and `Parar el sistema`: the history step for whoever does not use
  `up`; Ollama with GPU or on CPU (`OLLAMA_CONTEXT_LENGTH=16384` as the only labelled
  `powershell`/`bash` pair, `qwen2.5-coder`, `LLM_TIMEOUT_MS` for CPU); a hosted OpenAI-compatible API
  (not verified); Claude through Anthropic's OpenAI-compatible endpoint (not verified, from the
  official documentation); restart `npm run up` after editing `.env`. `Paso 0` shows the new step.
- **`readme.md`** (Enhanced D10–D11): «tres comandos» → «cuatro comandos» (§1.2, §1.3 and the §1.4
  title, with the links to its anchor), the `up` sequence with the new step, `Probar con un modelo
  real` linking to the DEMO section and no longer saying 300000 is the maximum, and the
  `LLM_TIMEOUT_MS` row «entero de 1 a 3600000».
- **Docs that state the cap or the history step**: `docs/project-context.md`, `fixtures/README.md`
  and, if it names the cap, `.env.example` (design D9).
- **Live proof past 300 s** (Enhanced acceptance criterion 3): a clean clone in the scratchpad with
  Ollama on CPU answers a free question through the CLI, the API and the web (the web check runs when
  the CLI answer took 15 min or less; otherwise the report and the guide say it was not run), with the
  measured duration in the change's report, plus a deterministic check with a local server that
  answers after 310 s.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `llm-adapter`: requirement "LLM configuration is classified and validated when read" — the
  largest accepted `LLM_TIMEOUT_MS` becomes 3600000 (the scenario that rejected `300001` rejects
  `3600001`, and a new scenario accepts `3600000`); a new requirement "The client waits as long as the
  configured timeout" says the client, without an injected `fetch`, imposes no limit of its own below
  `LLM_TIMEOUT_MS` (no request goes through Node's `fetch`).
- `local-startup`: requirement "One command starts the system" — six steps, the fixture history
  between `npm run db:seed` and `npm run dev`, and Ctrl+C during it leaves the fixture's tracked files
  unchanged; requirement "The demo guide runs the same in PowerShell and Bash" — the new level-2
  section `Probar con un modelo real` and what it must say.

## Impact

- New files: `packages/adapters/llm/src/long-fetch.ts` (moved code), `scripts/defer-ctrl-c.mjs`
  (the preload of design D3), tests for both.
- Changed (product): `packages/adapters/llm/src/openai-compatible-llm.ts` (default transport),
  `config.ts` (`MAX_TIMEOUT_MS`), `index.ts` (export); `packages/cli/src/cache/long-fetch.ts` becomes
  a re-export (`cache-build.ts` unchanged).
- Changed (tooling and docs): `scripts/up.mjs`, `stryker.config.json` (`long-fetch.ts` stays in the
  mutation scope, design D12), `.github/workflows/ci.yml` (the mutation job's path filter, design D12),
  `vitest.stryker.config.ts` (comment), `docs/DEMO.md`, `readme.md`, `fixtures/README.md`,
  `docs/project-context.md`, possibly `.env.example`, `prompts.md`.
- Tests that follow a modified requirement: `tests/unit/llm/llm-config.spec.ts` (`300001` →
  `3600001` in "A malformed timeout or URL fails naming the variable"),
  `tests/unit/scripts/up.spec.ts` ("Up runs the start sequence in order" and "Ctrl+C stops up without
  a failure line": six steps). `tests/unit/docs/guides.spec.ts` gains the new section's checks.
- Not changed: `fixtures/build-history.mjs`, `fixtures/acme-shop/`, `fixtures/history/`, `seeds/`,
  `packages/api/src`, `packages/cli/src/commands`, `packages/web/src`, `package-lock.json`, the CI jobs other than the mutation path filter. No
  input of the seed or answer fingerprint changes, so `npm run verify` stays green.
- Dependencies: none added. No migration, no API or CLI contract change.
- Security and privacy: no key is ever written in the guide, the repo or a report (the hosted and
  Claude paths are documented from official docs and marked «no verificado»); `.env` is never read
  or printed by the agent; the error messages keep hiding values. No personal data.
- Commands and constraints: as in `docs/project-context.md` → Commands.

### Non-goals

- Prices of paid models in `COST_TABLE`, or `DAILY_BUDGET_USD` with them (it stays empty for hosted
  APIs).
- A native Claude Messages API adapter, `max_tokens`, the `anthropic-workspace-id` header or
  structured outputs.
- Testing with a real hosted key (none is available; those paths stay «no verificado»).
- Changing the default `LLM_TIMEOUT_MS`, `CACHE_BUILD_TIMEOUT_MS` or the `cache:build` flow.
- Building the `task-api` history in `up` (not loaded in Entrega 2).
- Progress indicators in the web for long answers.
