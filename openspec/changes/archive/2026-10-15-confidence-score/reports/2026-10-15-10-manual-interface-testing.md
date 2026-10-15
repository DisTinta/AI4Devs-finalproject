# Manual Interface Testing Report

- Date: 2026-10-15
- Change: confidence-score
- Step: 10, manual interface testing (CLI `ask` end to end against the local database)

## Preconditions

- Local database migrated, acme-shop loaded; baseline `project` 1, `claim` 0, `evidence` 0.
- `.env` loaded into the shell (`DATABASE_URL`, `LLM_*`); the paths of the session scratchpad are
  written below as `<scratchpad>`.
- Ollama 0.40.4 served CPU-only with `OLLAMA_CONTEXT_LENGTH=16384` (design C9, operations note).
- `<scratchpad>/llm-stub.mjs`: a local OpenAI-compatible stub, outside the repository, removed with the
  session. Model `stub-answer` returns a fixed valid output (S1 citing `E1`, S2 citing `E1` then
  `E2`); model `stub-verify` answers `{"entails":true}` or `{"entails":false}` to every verification,
  per its start argument.
- `<scratchpad>/confidence-check.mjs`: for the claims written by a run (ids not in a "before" list), it
  recomputes each claim's confidence from its evidence rows, with the file kind and origin from the
  pack of the same question, and the answer's confidence over all of them; `ask` does not print the
  confidence.

## 10.2 Live run

### With Ollama (`qwen2.5-coder`, CPU)

```
$ LLM_TIMEOUT_MS=300000 npm run cli -- ask acme-shop "¿Cómo se calcula el precio final de un pedido?"
{"error":{"code":"LLM_UNAVAILABLE","message":"the language model is unavailable","details":{"reason":"timeout"}}}
exit 1   (20:50:16 → 20:55:19)
```

Counts after: `project` 1, `claim` 0, `evidence` 0. On this machine Ollama processes the prompt on
CPU at about 18 tokens/s, so a 5–7k-token prompt needs more than the adapter's 300 s maximum (also
Node's own `fetch` limit). Ollama could not serve `ask` in time, so the stub was used, as task 10.2
allows. The real model's confidence was already exercised through `explain` in the weights session
(`2026-10-15-9-weights-session.md`: 19 stored claims, every one equal to its recomputed value).

### With the stub, `{"entails":true}`

```
$ LLM_BASE_URL=http://127.0.0.1:11500/v1 LLM_MODEL=stub-answer LLM_MODEL_VERIFY=stub-verify \
  npm run cli -- ask acme-shop "¿Cómo se calcula el precio final de un pedido?"
El precio final lo calcula PriceCalculator::compute.

statements:
1. [FACT] PriceCalculator::compute calcula el precio final.
   evidence: tests/Unit/PriceCalculatorTest.php:21-57
2. [FACT] Otra parte del código interviene en el cálculo.
   evidence: tests/Unit/PriceCalculatorTest.php:21-57, tests/Feature/OrderPricingTest.php:31-51

evidence:
tests/Unit/PriceCalculatorTest.php:21-57
    … (excerpt)
tests/Feature/OrderPricingTest.php:31-51
    … (excerpt)
exit 0
```

The output has the same shape as before the change: no confidence is printed.

```
$ node <scratchpad>/confidence-check.mjs <before: no claim> "¿Cómo se calcula el precio final de un pedido?"
claim 0a69a4a5-… confidence=0.8519528019683106 expected=0.8519528019683106 equal=true inRange=true
  "PriceCalculator::compute calcula el precio final." :: tests/Unit/PriceCalculatorTest.php:21-57 test/anchor/entailed
claim 2799cead-… confidence=0.8670357598021706 expected=0.8670357598021706 equal=true inRange=true
  "Otra parte del código interviene en el cálculo." :: tests/Unit/PriceCalculatorTest.php:21-57 test/anchor/entailed | tests/Feature/OrderPricingTest.php:31-51 test/anchor/entailed
answer.confidence (recomputed over the 2 statements) = 0.8670357598021706
```

Every new `claim` row has a non-`NULL` `confidence` in (0, 1), equal (`Object.is`) to the value the
script computes for its statement.

## 10.3 Degraded and unknown paths

### Stub, `{"entails":false}` to every verification

```
$ … same command, stub started with entails=false
1. [INFERENCE] PriceCalculator::compute calcula el precio final.
2. [INFERENCE] Otra parte del código interviene en el cálculo.
(prior claims of the first run listed after them, as before the change)
exit 0

claim 1c8aba6a-… confidence=0.6224593312018546 expected=0.6224593312018546 equal=true inRange=true
  "PriceCalculator::compute calcula el precio final." :: tests/Unit/PriceCalculatorTest.php:21-57 test/anchor/cited
claim 645f325a-… confidence=0.6224593312018546 expected=0.6224593312018546 equal=true inRange=true
  "Otra parte del código interviene en el cálculo." :: … test/anchor/cited | … test/anchor/cited
answer.confidence (recomputed over the 2 statements) = 0.6224593312018546
```

For the same statements, the second run's rows are lower than the first's (0.6225 < 0.8520 and
0.6225 < 0.8670).

### Without `LLM_*`

```
$ env -u LLM_BASE_URL -u LLM_API_KEY -u LLM_MODEL -u LLM_MODEL_VERIFY \
  npm run cli -- ask acme-shop "¿Cómo se calcula el precio final de un pedido?"
UNKNOWN (llm-required)
evaluation mode (cache-only): set LLM_* to enable free-form asks
exit 0
```

`claim` / `evidence` counts 4 / 6 before and after: no row added.

## 10.5 Restore

- Rows created by the two stub runs: 4 claims (`0a69a4a5…`, `1c8aba6a…`, `2799cead…`, `645f325a…`)
  and 6 evidence rows; deleted by id in one transaction (`DELETE 6`, `DELETE 4`).
- After: `project` 1, `claim` 0, `evidence` 0, the task 0.4 baseline.
- `git status` shows only the change's own files; no stray file. The stub and the scripts stay in the
  session scratchpad.

## Outcome

- Status: PASS (live model: not possible in time on this machine's CPU, recorded above; stub runs
  through the real CLI, store and database).
