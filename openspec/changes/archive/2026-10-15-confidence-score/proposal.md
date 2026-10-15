## Why

The schema promises a `confidence` that is "calculado, no autoinformado" (`readme.md` §3.2, the
`claim.confidence` column and its `claim_confidence_range` check), but nothing computes it: since
DIS-39 every claim `explain` stores carries `confidence` `null`, and an answer carries none.
`docs/CONFIDENCE.md`, which the readme names as the place where the six weights are published with
their value and reason, still reads "pending — Entrega 2/3". Since DIS-70 the verifier gives each
citation an `entailed` or `cited` verdict, so every signal of the readme formula except the
contradiction one can now be derived from observable data.

This is DIS-72 (CM-HU-11.1), the confidence half of CM-HU-11 (DIS-57); its user story reads: "Como
desarrolladora que compara dos respuestas de CODEMIND, quiero un valor de confianza calculado con una
fórmula fija a partir de señales observables del grafo y del verificador (no autoinformado por el
modelo), guardado en cada afirmación y mostrado por respuesta, con sus seis pesos publicados en
`docs/CONFIDENCE.md`, para ordenar cuánto fiarme de cada respuesta de forma reproducible y
comprobable."

The decisions below were taken by the author while refining DIS-72 (Linear, `[enhanced]`,
2026-10-15). D1–D4 are closed; D5–D8 are proposed defaults, open to the spec audit.

- **D1, answer and claim**: "Una sola función sobre un conjunto de afirmaciones. Aplicada a cada
  afirmación → `claim.confidence` guardado (sustituye el `null` de `toClaimItems`). Aplicada a todas
  las afirmaciones de la respuesta → `answer.confidence` en toda respuesta `answered` (`persisted:
  true` y `false`). `UNKNOWN` no lleva `confidence`."
- **D2, contradiction at 0 until DIS-71**: "La función recibe `contradiction: boolean` y resta `w₆`
  cuando es `true`; `explain` pasa siempre `false` en esta entrega porque nada produce hoy evidencia
  contraria (el verificador es binario y `entails: false` no es contradicción). `docs/CONFIDENCE.md` lo
  declara. La monotonía de `w₆` se prueba a nivel de función."
- **D3, diversity over four categories**: "Categorías: código (`source` y `config`), `test`, `doc`,
  historial. Denominador fijo 4; historial no puede aparecer en E2, así que el máximo hoy es 0,75. Los
  valores seguirán siendo comparables cuando exista evidencia de historial."
- **D4, weights: the AI proposes, the author validates**: "Los valores de abajo son iniciales y con
  motivo provisional. En el apply se ejecutan las preguntas de desarrollo de los repositorios de
  muestra (no las de medición, CM-HU-22) y la autora fija los valores; sus motivos se transcriben
  literalmente en `docs/CONFIDENCE.md`."
- **D5 (default), the six signals**, all in [0, 1], over a set of statements with their citations:
  `evidence` (distinct spans with an `entailed` citation, saturated at `EVIDENCE_SATURATION`),
  `diversity` (D3), `crossConfirmation` (a statement backed by `entailed` code and `entailed` test),
  `resolution` (share of distinct cited spans with origin `anchor` or `exact`), `entailment` (share of
  `entailed` citations), `contradiction` (D2). Defined exactly in `design.md` C2.
- **D6 (default), formula without intercept**: `confidence = σ(Σᵢ₌₁..₅ wᵢ·sᵢ − w₆·s₆)`; with no signal
  the value is 0.5; ordinal, not rounded in core.
- **D7 (default), initial weights**: w₁…w₄ 0.5, w₅ 1.0, w₆ 1.5, `EVIDENCE_SATURATION` 4 (Σ w₁..w₅ = 3,
  so the maximum is σ(3) ≈ 0.953; σ(2.875) ≈ 0.947 while no history evidence exists). Replaced in the apply by the author's values (D4).
- **D8 (default), `stale` statements**: confidence ignores `status`; it is computed from the citations
  and verdicts the statement has. The `stale-evidence` warning already says the rest.

The author settled the spec audit's questions on 2026-10-15
(`reports/2026-10-15-spec-audit.md`): Q1, every citation counts as given (a span cited twice by one
statement counts twice in `entailment`); Q2, a span is resolved only when every citation of it is
`anchor` or `exact`; Q3, the "no `confidence` on `UNKNOWN`" rule lives in "Precedence and UNKNOWN
answers".

During the weight session of the apply (task 9.2), every live answer of `qwen2.5-coder` was
discarded with `invalid_json`: Ollama cut the prompt to its default context (about 2 000 tokens, an
operations fix: serve it with `OLLAMA_CONTEXT_LENGTH=16384`), and the model wrapped its JSON in a
Markdown code fence, which the quarantine rejects. The author decided on 2026-10-15 to solve the fence
in this change: "voy a querer que resuelvas en esta tarea lo de las vallas de json, no quiero dejar
flecos y ahora que ha salido el problema lo vas a resolver".

## What Changes

- New `packages/core/src/knowledge/confidence.ts`: a pure function over its own input types
  (`ConfidenceStatement`, `ConfidenceCitation`), with `CONFIDENCE_WEIGHTS`, `EVIDENCE_SATURATION`,
  `ConfidenceSignals`, `confidenceSignals(statements, { contradiction })` and
  `confidence(statements, { contradiction })`; an empty set, or a statement without citations, throws
  `RangeError`. Exported from `knowledge/index.ts`.
- `explain`: every `answered` answer (stored or not) carries `confidence`, the value over all its
  remaining statements with `contradiction: false` (D1, D2); every stored claim carries the value over
  its own statement instead of `null`. `UNKNOWN` carries none.
- `docs/CONFIDENCE.md` replaces its placeholder with the formula, the six signals, a weights table
  (w₁…w₆ and `EVIDENCE_SATURATION`, each with signal, value and reason), and the limits: s₆ is 0
  until DIS-71, no history evidence yet (diversity at most 0.75), 0.5 with no signal, ordinal and not
  calibrated. A unit test parses that table and checks it against the exported constants (one
  source).
- The quarantine of the model output (`claims-and-typing`) also accepts valid JSON enclosed in exactly
  one Markdown code fence (` ``` ` or ` ```json `, any case) that wraps the whole output, with only
  whitespace around it; any other text outside the fence, a second fence, an unclosed fence or another
  info string is still discarded `invalid_json`. The size check and the audit event still use the
  output as received.
- `readme.md` §3.2: confidence is stored per claim and given per answer; the sentence "ninguno de los
  seis términos depende de una generación del modelo" is corrected (`entailment` comes from the
  verifier; reproducibility holds for the same verdicts).

### Non-goals

- Calibrating confidence (reliability curve, ECE): the readme excludes it. Re-tuning the weights
  against the measurement questions (CM-HU-22).
- Producing the contradiction signal: DIS-71 (CM-HU-20.1) or a three-state verifier; `explain` always
  passes `contradiction: false` here.
- History evidence (commits, PRs) as a citation: it does not exist yet.
- Showing `confidence` in `ask`'s output, in the API or in the web: CM-HU-12.2 and CM-HU-15b. Showing
  the confidence of `priorClaims`.
- `usage`, `savingsPct`, `costUsd` and `query_log`: DIS-74 (CM-HU-11.2).
- Recomputing the confidence of claims already stored, or of `stale` ones: DIS-42.
- Any SQL, migration, port or adapter change: the `claim.confidence` column and its check exist.

## Capabilities

### New Capabilities

- `confidence-score`: the computed confidence of a set of statements — its six signals, the formula,
  the published weights and their single source shared by `docs/CONFIDENCE.md` and the code.

### Modified Capabilities

- `claims-and-typing`: "Model output quarantine" (a fenced JSON output is parsed; the size check and
  the audit event keep the raw output).
- `explain`: "Precedence and UNKNOWN answers" (an `UNKNOWN` answer carries no `confidence`), "Answer
  with typed statements" (`answer.confidence` on every answered answer, each stored claim's
  `confidence` computed instead of `null`) and "Persistence failure" (an unsaved answer carries
  `confidence` too).

## Impact

- Code: `packages/core/src/knowledge/{confidence,index}.ts` (new, barrel);
  `packages/core/src/explain/{explain,claim-items,explain-answer,statement-schema}.ts`. No new port, adapter, SQL,
  migration, API, web or CLI change; `knowledge/` imports nothing from `explain/` or `context/`.
- Tests: `tests/unit/knowledge/{confidence,confidence-doc}.spec.ts` (new); the quarantine's spec
  file gains the fence scenarios;
  `tests/unit/explain/{explain,explain-verification}.spec.ts` and
  `tests/integration/explain/explain.spec.ts` change where the spec changes (`confidence` `null` →
  computed); test helpers that build an `AnsweredExplain` by hand (`tests/unit/cli/ask-command.spec.ts`)
  gain the new required field.
- Database: no schema change. New `claim` rows carry a non-null `confidence` in (0, 1); rows written
  before keep `NULL`.
- Documentation: `docs/CONFIDENCE.md`, `readme.md` §3.2, `docs/project-context.md` (the gotcha that
  claims are no longer stored with `confidence` `null`; the fenced output; Ollama's context length).
- Reproducibility and security: a pure function with no clock, randomness or I/O, independent of
  statement and citation order; it reads only span metadata and verdicts, never the statement or
  evidence text, so no personal data or untrusted text is involved. Cost O(number of citations).
