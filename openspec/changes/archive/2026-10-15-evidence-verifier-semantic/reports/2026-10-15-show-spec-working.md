# Show Spec Working — evidence-verifier-semantic (DIS-70)

- Date: 2026-10-15
- Code: branch `feature/DIS-70-evidence-verifier-semantic` at `aef2698` (PR #42), re-run after the PR
  opened rather than reusing step 11, so the evidence is from the reviewed code.
- Interface: the real `ask` command over the local compose Postgres with acme-shop loaded, the real git
  source tree and the real OpenAI-compatible LLM adapter.
- Model: the local OpenAI-compatible stub of step 11 (`<scratchpad>/llm-stub.mjs`, outside the
  repository; the author's choice), `LLM_BASE_URL=http://127.0.0.1:11555/v1 LLM_MODEL=stub-answer
  LLM_MODEL_VERIFY=stub-verify`. The `answer` request gets S1 citing the first `PriceCalculator` span and
  S2 citing the first span of another file (1 000 / 200 tokens); a `verify` request is answered by
  `STUB_VERIFY`: `mixed` (`{"entails":true}` for S1, `{"entails":false}` for S2; 100 / 5 tokens), `yes`
  (the text `yes`) or `503` (HTTP 503). The stub logs every request it receives.
- `usage.verification`: `ask` does not print it, so runs B–D go through `<scratchpad>/ask-usage.mts`,
  which calls the real `runAskCommand` (default store, git source and LLM adapter) and wraps core's
  `explain` through the command's `explain` seam to print the `usage` of the very answer the command
  printed, and whether `explain` received a verification cache. Run from the repo root with
  `npx tsx --tsconfig packages/cli/tsconfig.run.json <scratchpad>/ask-usage.mts`.
- Question of every run: `¿Cómo se calcula el precio final de un pedido?`.

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| `explain` "Citations that support their statement are entailed and facts" / "A valid but irrelevant citation is cited and never a fact"; `evidence-verification` "Entailment policy over verified statements" | A: `npm run cli -- ask acme-shop "<question>"`, verifier `mixed` | exit 0; `1. [FACT] S1`, `2. [INFERENCE] S2`; stderr empty; rows S1 `entailed` (statement type `FACT`), S2 `cited` (`INFERENCE`) | Yes | A |
| `explain` "Answer with typed statements" (`usage` counts no token of the `answer` call); `cli-ask` "Explain receives a new verification cache per run" | B: `ask-usage.mts`, verifier `mixed`, right after A | exit 0; `usage.verification = {calls:2, cacheHits:0, inputTokens:200, outputTokens:10, costUsd:0}` (not 1 000 / 200); `explain` received a cache; the stub saw two new `verify` requests (A's verdicts were not reused: a new cache per run) | Yes | B |
| `explain` "An invalid verifier output degrades its pair to cited"; `cli-ask` "An unverified entailment is logged as information"; `evidence-verification` "Only a conforming output entails" | C: `ask-usage.mts`, verifier `yes` | exit 0; both `[INFERENCE]`; two `{"level":"info","type":"entailment_unverified",…,"reason":"invalid-output"}` lines with no text; `calls: 2` (an invalid output counts); new rows `cited` | Yes | C |
| `explain` "An unavailable verifier degrades every uncached pair and the answer is stored"; `evidence-verification` "An unavailable verifier degrades the remaining pairs" | D: `ask-usage.mts`, verifier `503` | exit 0; both `[INFERENCE]`; two `entailment_unverified` lines `llm-unavailable`; the stub received **one** `verify` request; `calls: 0`; answer stored, rows `cited` | Yes | D |
| `explain` "Evaluation mode answers llm-required without building the pack"; `evidence-verification` "Evaluation mode verifies nothing" (as reachable through `ask`) | E: `ask` with `LLM_*` unset | exit 0; `UNKNOWN (llm-required)` and its message; stderr empty; no row added | Yes | E |
| `cli-ask` "Ask answer output": no verification and no usage on stdout | A–D stdout | no `entailed`, `cited` or `usage` on stdout (grep count 0 in A) | Yes | A |

## Evidence

### Before

```
{"project":1,"claim":0,"evidence":0,"by":[]}
```

### A — real `ask`, verifier `mixed`

```
$ npm run --silent cli -- ask acme-shop "¿Cómo se calcula el precio final de un pedido?"
exit=0
El precio final lo calcula PriceCalculator::compute.

statements:
1. [FACT] S1: PriceCalculator::compute calcula el precio final.
   evidence: tests/Unit/PriceCalculatorTest.php:21-57
2. [INFERENCE] S2: otra parte del código interviene en el cálculo.
   evidence: tests/Feature/OrderPricingTest.php:31-51
```

followed by the evidence section; `prior claims:` / `note:` lines: 0; `entailed|cited|usage` on stdout: 0;
stderr: 0 bytes.

Database after A:

```
{"claim":2,"evidence":2,"by":[{"verification":"cited","n":1},{"verification":"entailed","n":1}]}
{"object":"S1: PriceCalculator::compute calcula el precio final.","statementType":"FACT","path":"tests/Unit/PriceCalculatorTest.php","start_line":21,"end_line":57,"verification":"entailed"}
{"object":"S2: otra parte del código interviene en el cálculo.","statementType":"INFERENCE","path":"tests/Feature/OrderPricingTest.php","start_line":31,"end_line":51,"verification":"cited"}
```

Stub log:

```
[stub] answer cites E1 E2
[stub] verify mixed tests/Unit/PriceCalculatorTest.php
[stub] verify mixed tests/Feature/OrderPricingTest.php
```

### B — the same `ask`, with the usage of its answer

```
exit=0
1. [FACT] S1: PriceCalculator::compute calcula el precio final.
2. [INFERENCE] S2: otra parte del código interviene en el cálculo.
--- exit=0 verificationCacheInDeps=true
--- usage={"verification":{"calls":2,"cacheHits":0,"inputTokens":200,"outputTokens":10,"costUsd":0}}
```

stderr: 0 bytes. The `prior claims:` section lists A's claims as `[INFERENCE] S2` and `[FACT] S1`. The
stub log shows a second `answer cites E1 E2` and two more `verify` requests. Database:
`{"claim":4,"evidence":4,"by":[{"verification":"cited","n":2},{"verification":"entailed","n":2}]}`.
`costUsd` is 0 because the stub's model names have no entry in `COST_TABLE`.

### C — verifier answers `yes`

```
exit=0
1. [INFERENCE] S1: PriceCalculator::compute calcula el precio final.
2. [INFERENCE] S2: otra parte del código interviene en el cálculo.
--- usage={"verification":{"calls":2,"cacheHits":0,"inputTokens":200,"outputTokens":10,"costUsd":0}}
-- stderr:
{"level":"info","type":"entailment_unverified","statementIndex":0,"evidenceId":"E1","path":"tests/Unit/PriceCalculatorTest.php","startLine":21,"endLine":57,"reason":"invalid-output"}
{"level":"info","type":"entailment_unverified","statementIndex":1,"evidenceId":"E2","path":"tests/Feature/OrderPricingTest.php","startLine":31,"endLine":51,"reason":"invalid-output"}
```

Database: `{"claim":6,"evidence":6,"by":[{"verification":"cited","n":4},{"verification":"entailed","n":2}]}`
(the two new rows `cited`). Stub: two `verify yes` requests.

### D — verifier returns HTTP 503

```
exit=0
1. [INFERENCE] S1: PriceCalculator::compute calcula el precio final.
2. [INFERENCE] S2: otra parte del código interviene en el cálculo.
--- usage={"verification":{"calls":0,"cacheHits":0,"inputTokens":0,"outputTokens":0,"costUsd":0}}
-- stderr:
{"level":"info","type":"entailment_unverified","statementIndex":0,"evidenceId":"E1","path":"tests/Unit/PriceCalculatorTest.php","startLine":21,"endLine":57,"reason":"llm-unavailable"}
{"level":"info","type":"entailment_unverified","statementIndex":1,"evidenceId":"E2","path":"tests/Feature/OrderPricingTest.php","startLine":31,"endLine":51,"reason":"llm-unavailable"}
```

Stub log, complete:

```
[stub] listening on 11555 (503)
[stub] answer cites E1 E2
[stub] verify 503 tests/Unit/PriceCalculatorTest.php
```

Database: `{"claim":8,"evidence":8,"by":[{"verification":"cited","n":6},{"verification":"entailed","n":2}]}`
(stored, the two new rows `cited`).

### E — evaluation mode

```
$ npm run --silent cli -- ask acme-shop "¿Cómo se calcula el precio final de un pedido?"   # LLM_* unset
exit=0
UNKNOWN (llm-required)
evaluation mode (cache-only): set LLM_* to enable free-form asks
```

stderr: 0 bytes. Database unchanged: `{"claim":8,"evidence":8}`.

## State

- Before: `project` 1, `claim` 0, `evidence` 0, no `verification` group.
- After the runs: `claim` 8, `evidence` 8 (`cited` 6, `entailed` 2).
- Restored: yes. Every claim was created by these runs on 2026-10-15 and the baseline had none:
  `DELETE FROM claim WHERE created_at >= '2026-10-15'` removed 8 rows (their evidence by cascade); then
  `project` 1, `claim` 0, `evidence` 0, no `verification` group. The stub was stopped after each mode.
  `git status` shows no stray file and no screenshot at the repository root (the change has no UI).

## Not demonstrated

- `budget-exhausted` through `ask`: the daily budget reads `query_log.cost_usd`, which nothing writes
  until DIS-74 (the spend read is 0), so it cannot be reached from the CLI today. Covered by
  `tests/unit/explain/explain-verification.spec.ts` "An unavailable verifier degrades every uncached pair
  and the answer is stored" (`withDailyBudget` over a store whose spend reaches the ceiling after the
  `answer` call) and `tests/unit/verify/semantic.spec.ts` "An unavailable verifier degrades the
  remaining pairs".
- A cache hit inside one `ask` run: each run is one answer with a new cache, and the stub's two
  statements cite different spans, so no pair repeats. The shared-cache behaviour (0 calls, 2 hits) was
  shown in step 11 with two `explain` calls over one cache
  ([`2026-10-15-11-manual-interface-testing.md`](./2026-10-15-11-manual-interface-testing.md)) and is
  covered by "A cached pair is not verified again by a second answer".
- A real local model (Ollama): not run, by the author's choice of the stub for this change.

## Handoff

Demonstrably working: through the real `ask` over acme-shop, a supported citation is stored `entailed`
and keeps its statement `FACT`, an unsupported one is stored `cited` and caps its statement to
`INFERENCE`, the answer's `usage.verification` counts only the verifier's calls, a fresh cache is used per
run, and an invalid or unavailable verifier fails closed to `cited` with `info` events that carry no
text, without changing the exit code. No screenshot was written anywhere (no browser UI).

## Addendum — real model (15.4, adversarial-review Major)

The author chose (2026-10-15) to settle the review's Major with a real model. Ollama 0.40.4 was served
CPU-only (`CUDA_VISIBLE_DEVICES=-1 GGML_VK_VISIBLE_DEVICES=-1 OLLAMA_VULKAN=0 OLLAMA_LLM_LIBRARY=cpu
ollama serve`; log `inference compute … library=cpu`; the tray app was stopped first), with `llama3.2`
and `qwen2.5-coder` (pulled for this run, the author's `LLM_*` choice). The stub gained a `proxy` mode
that forwards each `verify` request unchanged (system prompt `VERIFY_SYSTEM_PROMPT`, the same user
message) to Ollama's `/v1/chat/completions` with the given model and logs the model's raw reply. Every
run went through the real `ask` (`ask-usage.mts`), `LLM_TIMEOUT_MS=300000`.

### Fully real: `qwen2.5-coder` answers and verifies

`LLM_BASE_URL=http://127.0.0.1:11434/v1 LLM_MODEL=qwen2.5-coder LLM_MODEL_VERIFY=qwen2.5-coder` (2 min 36 s):

```
UNKNOWN (invalid-model-output)
--- usage="(none: unknown answer)"
{"level":"info","type":"schema_violation","stage":"l2_inference","subcode":"invalid_json","outputBytes":509,"outputSha256":"53d88a9c…","issues":[],"issueCount":0}
```

The answer itself failed the quarantine of `explain` (DIS-39), so no `verify` call was made. This is
outside this change (design Follow-ups, D).

### Real verifier `qwen2.5-coder`, stub answer

First with the stub's S1 `PriceCalculator::compute calcula el precio final.` citing
`tests/Unit/PriceCalculatorTest.php:21-57` (a test file, not the calculator), 61 s:

```
[stub] proxy 200 qwen2.5-coder statement="S1: PriceCalculator::compute calcula el precio final." -> "{\"entails\": false}"
[stub] proxy 200 qwen2.5-coder statement="S2: otra parte del código interviene en el cálculo." -> "{\"entails\": false}"
1. [INFERENCE] S1: …   2. [INFERENCE] S2: …
--- usage={"verification":{"calls":2,"cacheHits":0,"inputTokens":1230,"outputTokens":14,"costUsd":0}}
```

stderr empty; both rows `cited`. Then with S1 replaced (`STUB_S1`) by a statement the excerpt shows
(`class PriceCalculatorTest extends TestCase`), 36 s:

```
[stub] proxy 200 qwen2.5-coder statement="S1: PriceCalculatorTest es una clase que extiende TestCase." -> "{\"entails\": true}"
[stub] proxy 200 qwen2.5-coder statement="S2: otra parte del código interviene en el cálculo." -> "{\"entails\": false}"
1. [FACT] S1: PriceCalculatorTest es una clase que extiende TestCase.
2. [INFERENCE] S2: otra parte del código interviene en el cálculo.
--- usage={"verification":{"calls":2,"cacheHits":0,"inputTokens":1232,"outputTokens":14,"costUsd":0}}
```

stderr empty. Rows:

```
{"object":"S1: PriceCalculatorTest es una clase que extiende TestCase.","statementType":"FACT","path":"tests/Unit/PriceCalculatorTest.php","start_line":21,"end_line":57,"verification":"entailed"}
{"object":"S2: otra parte del código interviene en el cálculo.","statementType":"INFERENCE","path":"tests/Feature/OrderPricingTest.php","start_line":31,"end_line":51,"verification":"cited"}
```

`qwen2.5-coder` returned the bare JSON on all four pairs and told a supported statement from an
unsupported one; the usage holds the real token counts of the verifier only.

### Real verifier `llama3.2`, stub answer

44 s:

```
[stub] proxy 200 llama3.2 statement="S1: PriceCalculator::compute calcula el precio final." -> "Here is the JSON object with the answer:\n\n{\"entails\": true}"
[stub] proxy 200 llama3.2 statement="S2: otra parte del código interviene en el cálculo." -> "{\"entails\": true}"
1. [INFERENCE] S1: …   2. [FACT] S2: …
--- usage={"verification":{"calls":2,"cacheHits":0,"inputTokens":1208,"outputTokens":23,"costUsd":0}}
{"level":"info","type":"entailment_unverified","statementIndex":0,"evidenceId":"E1","path":"tests/Unit/PriceCalculatorTest.php","startLine":21,"endLine":57,"reason":"invalid-output"}
```

The prose before the JSON made the first pair `invalid-output` (fail closed: `cited`, event, still
counted as a call). The second, accepted, entailed a vague statement whose span is `anchor`/`exact` in
this pack, so S2 was `FACT`: correct under D1, and a sign that a small verifier is lenient. The author
keeps the strict parse (design Follow-ups, D).

### State

Before the first of these runs (`llama3.2`): `project` 1, `claim` 0, `evidence` 0. It stored 2 claims, the
fully real `qwen2.5-coder` run none (`UNKNOWN`), and the two `qwen2.5-coder` verifier runs 2 each:
`claim` 6, `evidence` 6. Restored with `DELETE FROM claim WHERE created_at >= '2026-10-15'` (6 rows):
`project` 1, `claim` 0, `evidence` 0. Ollama and the stub were stopped.
