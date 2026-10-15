# Show Spec Working Report

- Date: 2026-10-15
- Change: confidence-score (DIS-72), PR #43
- Interface: the real CLI `ask` and the `explain` use case over acme-shop in the local Postgres, through
  the real store, git source tree and LLM adapter. The model is a local OpenAI-compatible stub in the
  session scratchpad (`llm-stub.mjs`; `stub-answer` returns a fixed valid output citing `E1`, then
  `E1` and `E2`, as plain JSON, inside a ` ```json ` fence, or inside a fence preceded by prose;
  `stub-verify` answers `{"entails":true}` or `{"entails":false}`). Ollama on this machine's CPU cannot
  answer `ask` within the adapter's 300 s (`2026-10-15-10-manual-interface-testing.md`); the real
  `qwen2.5-coder` through `explain` is in `2026-10-15-9-weights-session.md` (19 stored claims, each equal
  to its recomputed value, including fenced answers parsed by step 8b). Ollama was stopped before this
  run, including an orphan `llama-server` left by the earlier session.
- Helper scripts (scratchpad): `confidence-check.mjs` recomputes each new claim's confidence from its
  evidence rows (file kind and origin from the pack of the same question); `explain-demo.mjs` calls
  `explain` once and prints the answer's kind, `confidence` and the claim rows it wrote.

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| explain → "An answer carries the confidence of its statements" | A: CLI `ask`, stub plain, entails true; then `explain-demo` | `exit 0`; 2 new rows with `confidence` 0.8520 / 0.8670, equal to the recomputed values; `answer.confidence` 0.8670 = confidence of both statements | Yes | A, A2 |
| explain → "A fact is stored as an inferred claim that keeps its type" (non-`NULL` confidence) | A | both rows non-`NULL`, in (0, 1) | Yes | A |
| explain → "The confidence follows the verifier's verdicts" | D: `explain-demo`, entails false | both statements `INFERENCE/cited`, rows and `answer.confidence` 0.6225, lower than A's 0.8520 / 0.8670 | Yes | D |
| explain → "An unknown answer has no confidence" | E: `explain-demo`, `¿Dónde vive el ornitorrinco?` | `kind=unknown reason=no-anchor`, `'confidence' in answer = false`, 0 rows | Yes | E |
| claims-and-typing → "A conforming output inside a json fence is accepted" | B: CLI `ask`, stub fenced | the answer is typed and printed (`[FACT]` ×2), `exit 0`, rows written with confidence 0.8520 / 0.8670 | Yes | B |
| claims-and-typing → "Text outside a fence discards the output" | C: CLI `ask`, stub prose before the fence | `UNKNOWN (invalid-model-output)`, event `schema_violation` / `invalid_json`, `exit 0` | Yes | C |
| `ask` output unchanged (proposal → Non-goals) | A | same shape as before the change; no confidence printed | Yes | A |

The pure-function scenarios of `confidence-score` (signals, value, monotonicity, `RangeError`,
published weights) have no interface of their own beyond `explain`; they are covered by
`tests/unit/knowledge/confidence.spec.ts` and `confidence-doc.spec.ts` (CI run 38790861935).

## Evidence

Commands (shell with `.env` loaded, `LLM_BASE_URL=http://127.0.0.1:11500/v1 LLM_MODEL=stub-answer
LLM_MODEL_VERIFY=stub-verify`, question `¿Cómo se calcula el precio final de un pedido?`); excerpt lines
of the CLI output omitted.

```
##### A: plain, entails=true — CLI ask
$ npm run cli --silent -- ask acme-shop "¿Cómo se calcula el precio final de un pedido?"
El precio final lo calcula PriceCalculator::compute.
statements:
1. [FACT] PriceCalculator::compute calcula el precio final.
   evidence: tests/Unit/PriceCalculatorTest.php:21-57
2. [FACT] Otra parte del código interviene en el cálculo.
   evidence: tests/Unit/PriceCalculatorTest.php:21-57, tests/Feature/OrderPricingTest.php:31-51
evidence:
tests/Unit/PriceCalculatorTest.php:21-57
tests/Feature/OrderPricingTest.php:31-51
exit 0
$ node confidence-check.mjs <ids before A> "<question>"
claim 3b8583ed-… confidence=0.8519528019683106 expected=0.8519528019683106 equal=true inRange=true
  "PriceCalculator::compute calcula el precio final." :: tests/Unit/PriceCalculatorTest.php:21-57 test/anchor/entailed
claim 79c90b54-… confidence=0.8670357598021706 expected=0.8670357598021706 equal=true inRange=true
  "Otra parte del código interviene en el cálculo." :: tests/Unit/PriceCalculatorTest.php:21-57 test/anchor/entailed | tests/Feature/OrderPricingTest.php:31-51 test/anchor/entailed
answer.confidence (recomputed over the 2 statements) = 0.8670357598021706

##### A2: same stub — explain (answer.confidence)
$ node explain-demo.mjs "<question>"
kind=answered persisted=true
'confidence' in answer = true, answer.confidence = 0.8670357598021706
statement [FACT/entailed] PriceCalculator::compute calcula el precio final.
statement [FACT/entailed] Otra parte del código interviene en el cálculo.
claim row 89e8d553-… confidence=0.8519528019683106 :: PriceCalculator::compute calcula el precio final.
claim row adc392a7-… confidence=0.8670357598021706 :: Otra parte del código interviene en el cálculo.
new claim rows: 2

##### B: fenced, entails=true — CLI ask
1. [FACT] PriceCalculator::compute calcula el precio final.
2. [FACT] Otra parte del código interviene en el cálculo.
(prior claims of A and A2 listed after them)
exit 0
rows written: 20336b75-… 0.8519528019683106, 0777a466-… 0.8670357598021706

##### C: prose outside fence — CLI ask
UNKNOWN (invalid-model-output)
{"level":"info","type":"schema_violation","stage":"l2_inference","subcode":"invalid_json","outputBytes":287,"outputSha256":"076ab480dd334c9002e43163644453502f998be4e328d9507447db6665d83b23","issues":[],"issueCount":0}
exit 0

##### D: plain, entails=false — explain
kind=answered persisted=true
'confidence' in answer = true, answer.confidence = 0.6224593312018546
statement [INFERENCE/cited] PriceCalculator::compute calcula el precio final.
statement [INFERENCE/cited] Otra parte del código interviene en el cálculo.
claim row 73412ae6-… confidence=0.6224593312018546 :: PriceCalculator::compute calcula el precio final.
claim row 2a6d70e2-… confidence=0.6224593312018546 :: Otra parte del código interviene en el cálculo.
new claim rows: 2

##### E: no anchor — explain
$ node explain-demo.mjs "¿Dónde vive el ornitorrinco?"
kind=unknown reason=no-anchor
'confidence' in answer = false
events = []
new claim rows: 0
```

No screenshots: the change has no browser UI.

## State

- Before: `project` 1, `claim` 0, `evidence` 0.
- After the runs: `project` 1, `claim` 8, `evidence` 12 (A 2, A2 2, B 2, D 2 claims).
- Restored: yes. The 8 claims and 12 evidence rows were deleted by id in one transaction
  (`DELETE 12`, `DELETE 8`); after: `project` 1, `claim` 0, `evidence` 0. `git status` shows no stray
  file; no screenshot at the repository root. Ollama and its `llama-server` are stopped.

## Not demonstrated

- A live `ask` answered by Ollama on this machine: on CPU the prompt takes longer than the adapter's
  300 s maximum (recorded in the step 10 report). The real model was exercised through `explain`
  with a longer timeout in the weights session.
- `contradiction: true` from `explain`: nothing produces contrary evidence until DIS-71 (D2); covered
  at function level by "A contradiction lowers the value".

## Handoff

Demonstrably working: through the real CLI and the real `explain` over acme-shop and Postgres, every
answered answer carries `confidence`, every stored claim has a non-`NULL` confidence equal to its
statement's recomputed value, verdicts move it, `UNKNOWN` carries none, a fenced model output is parsed
and prose outside the fence is still discarded `invalid_json`.
