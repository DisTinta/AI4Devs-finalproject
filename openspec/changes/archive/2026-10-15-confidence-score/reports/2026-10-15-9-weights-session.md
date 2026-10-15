# Weights Session Report

- Date: 2026-10-15
- Change: confidence-score
- Step: 9, author's weights (D4, design C4)

## Setup

- Database: local, migrated, acme-shop loaded (`project` 1, `claim` 0, `evidence` 0 before the run).
- Model: Ollama 0.40.4, CPU-only (`CUDA_VISIBLE_DEVICES=-1 GGML_VK_VISIBLE_DEVICES=-1 OLLAMA_VULKAN=0
  OLLAMA_LLM_LIBRARY=cpu`) with `OLLAMA_CONTEXT_LENGTH=16384`; `LLM_MODEL` and `LLM_MODEL_VERIFY`
  `qwen2.5-coder`, the author's choice.
- Script: `weights-session.mjs` in the session scratchpad (not committed). It runs each question
  through `explain` (real store, real git source tree, real model, one empty verification cache per
  question), then reads the claims and evidence rows the answer wrote, takes each citation's file kind
  and origin from the pack built for the same question, and prints the six signals and the value with
  the D7 weights. It also checks that its value equals the answer's `confidence` (`Object.is`). The
  model's call goes through an `http`-based `fetch` passed to `createLlm` with `timeoutMs` 900 000,
  because Node's `fetch` ends a request after 300 s on its own and a CPU prompt of 5–7k tokens takes
  longer (see "Earlier runs").
- Questions: the eight development questions the author approved (design C4); none is a measurement
  question.

## Earlier runs (not used for the weights)

1. Default Ollama context: every prompt was cut to 2 050 tokens (Ollama log `truncating input
   prompt`), the system prompt was lost, and the answers were discarded `invalid_json` (5), timed out
   (1) or had no anchor (2). Fixed by `OLLAMA_CONTEXT_LENGTH=16384`.
2. 16k context, before step 8b: answers fenced in ` ```json `, discarded `invalid_json`; this led to
   the author's decision and step 8b (design C9).
3. 16k context, after step 8b: five answers hit Node's 300 s `fetch` timeout; the fenced answer of
   question 5 was now parsed and discarded `invalid_shape` (empty `answer`).

No run wrote a claim before the final one.

## Results (final run, D7 weights)

| # | Question | Outcome | Time | `answer.confidence` | Signals of the answer |
| --- | --- | --- | --- | --- | --- |
| 1 | ¿Cómo aplica DiscountService los descuentos a un pedido? | 6 statements | 394 s | 0.7571 | evidence 0.5, diversity 0.25, cross 0, resolution 0.667, entailment 0.429 |
| 2 | ¿Cómo calcula TaxService el impuesto de un pedido? | `UNKNOWN (invalid-model-output)`, `invalid_shape`: `evidenceIds` written as a string, not an array | 150 s | — | — |
| 3 | ¿Qué hace la fachada Pricing? | 2 statements | 67 s | 0.7773 | evidence 0.25, diversity 0.25, cross 0, resolution 1, entailment 0.5 |
| 4 | ¿Qué ocurre cuando se dispara el evento OrderPlaced? | 4 statements | 258 s | 0.7700 | evidence 0.5, diversity 0.25, cross 0, resolution 0.667, entailment 0.5 |
| 5 | ¿Qué tarifas de envío y umbral de envío gratis configura la tienda? | 2 statements | 55 s | 0.7311 | evidence 0.25, diversity 0.25, cross 0, resolution 0.5, entailment 0.5 |
| 6 | ¿Qué dice la documentación sobre el orden de impuestos y descuentos? | `UNKNOWN (no-anchor)` | 0 s | — | — |
| 7 | ¿Qué valida StoreOrderRequest al crear un pedido? | 5 statements | 206 s | 0.8048 | evidence 0.25, diversity 0.25, cross 0, resolution 1, entailment 0.667 |
| 8 | ¿Cómo se envía la factura en PDF al cliente? | `UNKNOWN (no-anchor)` | 0 s | — | — |

Contradiction is 0 everywhere (D2). In every answer the script's value equals `answer.confidence`.

### Per statement (each stored claim's `confidence`)

The 19 statements fall into five shapes; every stored claim's `confidence` equals the value of its
shape:

| Shape (citations of the statement) | Statements | Signals | `claim.confidence` |
| --- | --- | --- | --- |
| one `anchor`/`exact` code span, `entailed` | 9 (Q1 ×3, Q3, Q4 ×2, Q7 ×3) | 0.25, 0.25, 0, 1, 1 | 0.8520 |
| one `heuristic` code span, `entailed` | 1 (Q5: `ShippingService::shippingFor`) | 0.25, 0.25, 0, 0, 1 | 0.7773 |
| two code spans, `anchor` `entailed` + `anchor` `cited` | 1 (Q7: `coupon_code`) | 0.25, 0.25, 0, 1, 0.5 | 0.7773 |
| one `anchor` span (code or test), `cited` | 6 (Q1 ×2, Q3 test, Q4, Q5, Q7) | 0, 0, 0, 1, 0 | 0.6225 |
| `exact` + `heuristic` code, both `cited` | 1 (Q1) | 0, 0, 0, 0.5, 0 | 0.5622 |
| one `heuristic` span, `cited` | 1 (Q4: `PriceCalculator` as Pricing) | all 0 | 0.5000 |

### What the run shows

- `entailment` separates statements most: an `entailed` single span is worth 0.852 against 0.6225 for
  the same span `cited` (w₅ = 1.0).
- `resolution` orders the rest: at equal verdict, `heuristic` is below `anchor`/`exact` (0.7773
  against 0.852 entailed; 0.5 against 0.6225 cited).
- `diversity` is 0.25 in every answer and `crossConfirmation` is never 1: the model cited a test file
  once (Q3, `cited`) and never a `doc` or `config` file, so w₂ and w₃ had no effect on this run.
- `evidence` saturation was never reached: answers had 1 or 2 distinct `entailed` spans (0.25–0.5).
- Answer values are compressed in 0.73–0.80, and their order follows mostly the share of `entailed`
  citations (Q7 > Q3 > Q4 > Q1 > Q5).
- Verifier false negatives exist: Q4 "El listener SendOrderConfirmation maneja el evento OrderPlaced"
  and Q7 "Verifica que el shipping_country sea requerido…" are supported by their spans but were left
  `cited`. A heavier w₅ would punish those more.

## Recommendation

Draft for the author to approve, change or rewrite; nothing below ships until the author decides.

| Name | Signal | Recommended | Evidence from this run | Draft reason |
| --- | --- | --- | --- | --- |
| w1 | `evidence` | 0.5 | 1–2 entailed spans per answer; never saturated | More spans that back the answer add support; capped so long answers are not rewarded |
| w2 | `diversity` | 0.5 | Always 0.25: no evidence to move it | Sources of different kind fail independently; not exercised by the development questions |
| w3 | `crossConfirmation` | 0.5 | Never 1: no evidence to move it | Code and test backing the same statement agree; not exercised by the development questions |
| w4 | `resolution` | 0.5 | Puts `heuristic` below `anchor`/`exact` at equal verdict without overriding the verdict (entailed heuristic 0.777 > cited anchor 0.6225) | `heuristic` edges (facades, Laravel conventions) can be wrong; weaker than the verifier's verdict |
| w5 | `entailment` | 1.0 | The main separator (0.852 vs 0.6225); the verifier has false negatives, so not heavier | The only signal that checks the citation supports the statement; the verifier also errs |
| w6 | `contradiction` | 1.5 | Never active (D2) | Contrary evidence must outweigh any single positive signal |
| EVIDENCE_SATURATION | — | 4 | Answers reached at most 2 entailed spans | Answers cite a few spans; saturating keeps long answers from winning on length |

In short: keep the D7 values. The run supports the relative order of w₁, w₄ and w₅ and gives no
evidence for moving w₂, w₃ or w₆.

## Author's decision

2026-10-15, the author's words: "si son los motivos que aconsejas, confío en ti". The author approved
the recommended values (the D7 values, unchanged) and the draft reasons as written above; both were
transcribed verbatim into `docs/CONFIDENCE.md` → Weights, with the list of development questions.
`CONFIDENCE_WEIGHTS` and `EVIDENCE_SATURATION` did not change, so `confidence.ts` did not change.

## Data state

- Claims written by the final run: 19 (ids recorded in the scratchpad). They are deleted in task 9.4,
  by id, and the counts are checked against the baseline.

## Cleanup (task 9.4)

- Before: `project` 1, `claim` 19, `evidence` 21; no claim outside the 19 ids the script recorded.
- One transaction deleted the 21 evidence rows and the 19 claims by id.
- After: `project` 1, `claim` 0, `evidence` 0, the task 0.4 baseline.
