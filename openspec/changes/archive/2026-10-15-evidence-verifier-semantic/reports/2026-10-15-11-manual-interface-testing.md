# Manual Interface Testing Report

- Date: 2026-10-15
- Change: evidence-verifier-semantic (DIS-70)
- Step: 11 — Manual Interface Testing

## Setup

- Local compose Postgres (`codemind-postgres-1`), migrated, acme-shop loaded
  (`npm run cli -- projects` → `acme-shop  a794456d-6d1b-5b55-a360-13fec83dc7bc  php/laravel  174 nodes · 170 edges`).
- `npx tsc --build` before the runs.
- `DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind`.
- Model: the author chose (2026-10-15) a local OpenAI-compatible stub instead of Ollama. It lives in the
  session scratchpad (`<scratchpad>/llm-stub.mjs`, outside the repository) and listens on
  `http://127.0.0.1:11555/v1`. For the `answer` request it returns S1 citing the first span whose path
  holds `PriceCalculator` and S2 citing the first span of another file, reporting 1 000 / 200 tokens.
  For a `verify` request (system prompt starting `You check whether`) it answers by `STUB_VERIFY`:
  `mixed` → `{"entails":true}` for S1 and `{"entails":false}` for S2 (100 / 5 tokens); `yes` → the text
  `yes`; `503` → HTTP 503. The stub is the model of every live run below:
  `LLM_BASE_URL=http://127.0.0.1:11555/v1 LLM_MODEL=stub-answer LLM_MODEL_VERIFY=stub-verify`.
- Database snapshots: a read-only `pg` client (`<scratchpad>/db.mjs`) counting `project`, `claim`,
  `evidence`, `evidence` by `verification`, and listing each row with its claim's statement type.

Baseline (0.4): `project` 1, `claim` 0, `evidence` 0, no `verification` group.

## 11.2 Live run: entailed and cited rows

Command (stub `mixed`):

```
npm run cli -- ask acme-shop "¿Cómo se calcula el precio final de un pedido?"
```

- Exit code: `0`.
- stdout (statements):

```
El precio final lo calcula PriceCalculator::compute.

statements:
1. [FACT] S1: PriceCalculator::compute calcula el precio final.
   evidence: tests/Unit/PriceCalculatorTest.php:21-57
2. [INFERENCE] S2: otra parte del código interviene en el cálculo.
   evidence: tests/Feature/OrderPricingTest.php:31-51
```

  followed by the evidence section with both excerpts; no `prior claims:` section, no `note:` line, no
  `entailed`, `cited` or `usage` printed.
- stderr: empty (no `entailment_unverified` line: both verdicts were answered).
- Stub log: `answer cites E1 E2`, then one `verify` for `tests/Unit/PriceCalculatorTest.php` and one for
  `tests/Feature/OrderPricingTest.php`.
- Database after: `claim` 2, `evidence` 2, `verification` `cited` 1 and `entailed` 1:

| claim object | statement type | path | lines | verification |
|---|---|---|---|---|
| S1: PriceCalculator::compute calcula el precio final. | FACT | tests/Unit/PriceCalculatorTest.php | 21–57 | `entailed` |
| S2: otra parte del código interviene en el cálculo. | INFERENCE | tests/Feature/OrderPricingTest.php | 31–51 | `cited` |

### `usage.verification` (11.5)

`ask` does not print the usage, so `explain` was run twice, with one shared
`createInMemoryVerificationCache()`, through a script in the scratchpad (`<scratchpad>/explain-usage.mts`,
`npx tsx --tsconfig packages/cli/tsconfig.run.json <scratchpad>/explain-usage.mts`) over the same
database, stub and environment:

```
{"run":1,"kind":"answered","persisted":true,"statements":[["FACT","entailed"],["INFERENCE","cited"]],"usage":{"verification":{"calls":2,"cacheHits":0,"inputTokens":200,"outputTokens":10,"costUsd":0}},"events":[]}
{"run":2,"kind":"answered","persisted":true,"statements":[["FACT","entailed"],["INFERENCE","cited"]],"usage":{"verification":{"calls":0,"cacheHits":2,"inputTokens":0,"outputTokens":0,"costUsd":0}},"events":[]}
```

The first answer counts the two `verify` calls (2 × 100 / 5 tokens) and none of the `answer` call's
1 000 / 200; the second answer, with the same cache, made no `verify` request (the stub log shows only its
`answer` request) and counts 2 cache hits. `costUsd` is 0: the stub's model names have no entry in
`COST_TABLE`.

## 11.3 Degraded paths

### Invalid verifier output (stub `yes`)

- Same command; exit code `0`.
- Statements: `1. [INFERENCE] S1: …` and `2. [INFERENCE] S2: …` (S1 is no longer `FACT`); the
  `prior claims:` section lists the claims of the earlier runs.
- stderr, exactly:

```
{"level":"info","type":"entailment_unverified","statementIndex":0,"evidenceId":"E1","path":"tests/Unit/PriceCalculatorTest.php","startLine":21,"endLine":57,"reason":"invalid-output"}
{"level":"info","type":"entailment_unverified","statementIndex":1,"evidenceId":"E2","path":"tests/Feature/OrderPricingTest.php","startLine":31,"endLine":51,"reason":"invalid-output"}
```

  No statement, excerpt or verifier output in them.
- Database: the two new `evidence` rows are `cited` (`cited` 5, `entailed` 3 over the runs so far,
  `claim` 8 including the four of the `usage` script).

### Unavailable verifier (stub `503`)

- Same command; exit code `0`; both statements `[INFERENCE]`; the answer is stored (`claim` 8 → 10).
- stderr, exactly:

```
{"level":"info","type":"entailment_unverified","statementIndex":0,"evidenceId":"E1","path":"tests/Unit/PriceCalculatorTest.php","startLine":21,"endLine":57,"reason":"llm-unavailable"}
{"level":"info","type":"entailment_unverified","statementIndex":1,"evidenceId":"E2","path":"tests/Feature/OrderPricingTest.php","startLine":31,"endLine":51,"reason":"llm-unavailable"}
```

- Stub log: one `verify` request only (`verify 503 tests/Unit/PriceCalculatorTest.php`): after the first
  `LlmUnavailable` the second pair was degraded without a call.
- Database: the two new rows are `cited` (`cited` 7, `entailed` 3).

## 11.4 Evaluation mode

```
npm run cli -- ask acme-shop "¿Cómo se calcula el precio final de un pedido?"   # LLM_* unset
```

- Exit code `0`; stdout `UNKNOWN (llm-required)` and
  `evaluation mode (cache-only): set LLM_* to enable free-form asks`; stderr empty (no
  `entailment_unverified` line); `claim` and `evidence` stay at 10.

## 11.6 Restore

- The stub was stopped after each mode.
- Every claim of these runs was created on 2026-10-15 and the baseline had none, so
  `DELETE FROM claim WHERE created_at >= '2026-10-15'` removed them (10 rows; their evidence went with them
  by cascade).
- After: `project` 1, `claim` 0, `evidence` 0, no `verification` group: equal to the baseline.
- `git status`: no stray file (the stub, the scripts and the outputs live in the session scratchpad).

## Outcome

- Status: PASS
- Blocking issues: none
