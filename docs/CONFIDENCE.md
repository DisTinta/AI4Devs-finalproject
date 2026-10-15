# Confidence

CODEMIND gives every stored claim and every answered answer a `confidence`, computed by
`packages/core/src/knowledge/confidence.ts` from observable signals of the citations: never
self-reported by the model. A claim's value is the confidence of its own statement; an answer's value
is the confidence of all its statements together. `UNKNOWN` answers carry none.

## Formula

```text
confidence = σ(w1·evidence + w2·diversity + w3·crossConfirmation + w4·resolution + w5·entailment − w6·contradiction)
σ(z)       = 1 / (1 + e^(−z))
```

There is no intercept. Every weight is positive, so no positive signal can lower the value and a
contradiction always lowers it. The sum runs in a fixed order, so the same citations and verdicts give
the same number whatever the order of statements and citations. The value is not rounded.

## Signals

Each signal is a number in [0, 1], computed over a set of statements with their citations. A citation
carries its span (file id, first and last line), the kind of the cited file, the origin of the span
and the verifier's verdict for its (statement, citation) pair, `entailed` or `cited`. A citation's
category is `code` for `source` and `config` files, `test` for `test` and `doc` for `doc`; `history`
is a fourth category that no citation can have yet.

| Signal | Definition |
| --- | --- |
| `evidence` | min(E, `EVIDENCE_SATURATION`) / `EVIDENCE_SATURATION`, where E is the number of distinct spans with at least one `entailed` citation |
| `diversity` | Distinct categories among the `entailed` citations, divided by 4 (`history` included) |
| `crossConfirmation` | 1 when a statement has an `entailed` `code` citation and an `entailed` `test` citation, 0 otherwise |
| `resolution` | Distinct cited spans all of whose citations have origin `anchor` or `exact`, divided by the distinct cited spans; every verdict counts, and any other origin counts as not resolved |
| `entailment` | `entailed` citations divided by all citations, every citation counted as given |
| `contradiction` | 1 when contrary evidence exists for the set, 0 otherwise |

The signals read only span metadata and verdicts: never a statement's text, an excerpt, a status or
the model's output. A set with no statement, or a statement with no citation, has no confidence (the
function throws `RangeError`).

## Weights

| Name | Signal | Value | Reason |
| --- | --- | --- | --- |
| w1 | `evidence` | 0.5 | More spans that back the answer add support; capped so long answers are not rewarded. |
| w2 | `diversity` | 0.5 | Sources of different kind fail independently; not exercised by the development questions. |
| w3 | `crossConfirmation` | 0.5 | Code and test backing the same statement agree; not exercised by the development questions. |
| w4 | `resolution` | 0.5 | `heuristic` edges (facades, Laravel conventions) can be wrong; weaker than the verifier's verdict. |
| w5 | `entailment` | 1.0 | The only signal that checks the citation supports the statement; the verifier also errs. |
| w6 | `contradiction` | 1.5 | Contrary evidence must outweigh any single positive signal. |
| EVIDENCE_SATURATION | — | 4 | Answers cite a few spans; saturating keeps long answers from winning on length. |

The author fixed these values and reasons on 2026-10-15, after running the development questions
below over `acme-shop` with `qwen2.5-coder` (Ollama, CPU) as answer model and verifier
(`openspec/changes/confidence-score/reports/2026-10-15-9-weights-session.md`, archived with the change):

1. ¿Cómo aplica DiscountService los descuentos a un pedido?
2. ¿Cómo calcula TaxService el impuesto de un pedido?
3. ¿Qué hace la fachada Pricing?
4. ¿Qué ocurre cuando se dispara el evento OrderPlaced?
5. ¿Qué tarifas de envío y umbral de envío gratis configura la tienda?
6. ¿Qué dice la documentación sobre el orden de impuestos y descuentos?
7. ¿Qué valida StoreOrderRequest al crear un pedido?
8. ¿Cómo se envía la factura en PDF al cliente?

`entailment` separated the statements most and `resolution` ordered them within a verdict;
`diversity`, `crossConfirmation` and `contradiction` were never active on these questions, so their
weights keep their initial values.

These values live in `CONFIDENCE_WEIGHTS` and `EVIDENCE_SATURATION`;
`tests/unit/knowledge/confidence-doc.spec.ts` fails when this table and the code disagree. The
weights were fixed once on the development questions of the sample repositories and are never
re-tuned against the measurement questions.

## Limits

- The value is ordinal and not calibrated: it orders answers of this system, it is no probability.
- The contradiction signal is 0 in every answer until DIS-71: no component produces contrary
  evidence yet (the verifier's `entails: false` leaves a citation `cited`, it does not contradict).
- No citation has the `history` category yet, so `diversity` is at most 0.75.
- A set with no signal (every citation `cited`, no resolved span) is worth exactly 0.5.
- `entailment` comes from the verifier, a model call: the value is reproducible for the same
  citations and verdicts (the per-pair verification cache keeps a verdict within a process).
- The weights are not re-tuned against the measurement questions.
