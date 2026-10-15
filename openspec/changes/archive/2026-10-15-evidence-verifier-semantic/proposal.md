## Why

CM-HU-10 (DIS-56) promises that a citation that exists but does not back its statement never turns an
inference into a fact. Since DIS-68 every citation of an answer is checked syntactically (the file,
the range and the frozen excerpt exist at the pack's commit), but nothing checks that the cited code
supports what the statement says: a statement citing only `anchor`/`exact` spans is answered `FACT`
with `verification: 'cited'` even when the span is irrelevant to it, and `entailed`, a value of the
schema (`0002_history-claims`), is never written. The verifier's extra cost is not measured either,
so the Table 1 ratio (PH-27) cannot be published.

This is DIS-70 (CM-HU-10.2), the semantic half of the verifier; its user story reads: "Como
desarrolladora que lee una explicación de CODEMIND, quiero que cada cita válida se compruebe con un
modelo de verificación acotado (`LLM_MODEL_VERIFY`) para saber si el fragmento sustenta de verdad la
afirmación, y que una afirmación solo llegue como `FACT` cuando todas sus citas la sustentan, sin pagar
dos veces la misma comprobación y viendo aparte cuánto cuesta verificar, para que una cita existente
pero irrelevante nunca haga pasar una inferencia por hecho y el sobrecoste del verificador quede
medido."

The decisions below were taken by the author while refining DIS-70 (Linear, `[enhanced]`,
2026-10-15). D1–D4 are closed; D5–D8 were the proposed defaults, which the author confirmed with the answers Q1–Q6
to the spec audit (`design.md` S13).

- **D1, `FACT` requires every citation `entailed`**: "Una afirmación es `FACT` solo si `typeStatement`
  sobre sus citas da `FACT` **y** todas sus citas quedan `entailed`; si alguna queda `cited` →
  `INFERENCE`. Ninguna afirmación se elimina por quedar `cited`; `UNKNOWN` solo por los motivos que ya
  existen." A statement's `verification` is `entailed` when all its citations are, `cited` otherwise.
  This replaces the parent's draft criterion "o a `UNKNOWN` si no le queda ninguna `entailed`".
- **D2, an in-memory cache, injected**: a `VerificationCache` interface in `core/verify/` and a bounded
  (LRU) in-memory implementation the CLI creates once per process and passes in
  `ExplainDependencies`. No migration, no SQL. The key is a SHA-256 over the pair (the verification
  system prompt, the statement text, the path, the first and last line, the excerpt); "el modelo no
  entra en la clave: core no lo conoce antes de llamar y la caché vive lo que el proceso, con
  configuración fija".
- **D3, a failed verification degrades the citation to `cited`, with an event**: fail closed. An
  output out of schema, `LlmUnavailable` or `BudgetExhausted` leave the citation `cited` (never `FACT`
  through it), emit `entailment_unverified` with a closed code (`invalid-output`, `llm-unavailable`,
  `budget-exhausted`), are not cached, and the answer goes on.
- **D4, one call per pair**: one `complete({ purpose: 'verify' })` per distinct (statement, citation)
  pair not in the cache, in sequence, statement then citation order.
- **D5 (default), prompt and schema**: a fixed `VERIFY_SYSTEM_PROMPT`; as user message the statement
  and the excerpt (the citation's sanitised text) each wrapped in `<<<UNTRUSTED_DATA …>>>` and
  neutralised as `explain/prompt.ts` does, plus path and range; the output is accepted only when it is
  at most `MAX_VERIFY_OUTPUT_BYTES` (1 024, UTF-8), is JSON and matches
  `z.strictObject({ entails: z.boolean() })`; anything else is `invalid-output`.
- **D6 (default), `usage.verification`**: an `answered` answer carries `usage: { verification: {
  calls, cacheHits, inputTokens, outputTokens, costUsd } }`, counting only `purpose: 'verify'` calls
  (one that returned an invalid output counts, one that threw does not); `costUsd` is the sum of
  `costUsd(result.model, result.usage)` rounded to 6 decimals; generation tokens are left out (DIS-74
  aggregates). `UNKNOWN` carries no `usage`. After the first `LlmUnavailable` or `BudgetExhausted` the
  remaining uncached pairs are not tried: they degrade with the same code.
- **D7 (default), the `entailment_unverified` event**: `{ type: 'entailment_unverified',
  statementIndex, evidenceId, path, startLine, endLine, reason }`, one per failed pair, never the
  statement, excerpt or model output; after the `evidence_broken` events and before
  `claims_not_persisted`; `ask` writes it at level `info`.
- **D8 (default), pipeline order**: syntactic check → output policy (drops what is `broken`;
  `UNKNOWN (broken-evidence)` when nothing is left, with no verification call) → semantic check over
  the remaining citations → retyping with D1. Each `evidence` row stores the verdict of its pair
  (`entailed` or `cited`). A `stale` statement is still shown `INFERENCE`, with its computed
  `verification`.

## What Changes

- New `packages/core/src/verify/semantic.ts`: `verifyEntailment(llm, cache, pairs)` gives one verdict
  per (statement, citation) pair, `entailed` or `cited`, through the cache and, for a pair not in it,
  one `complete({ purpose: 'verify' })` whose output is parsed strictly (D4, D5); it fails closed
  (D3), reports the verification usage (D6) and, with a model in `evaluation` mode, gives `cited`
  without any call.
- New `packages/core/src/verify/verification-cache.ts`: the `VerificationCache` interface, the pair
  key and `createInMemoryVerificationCache(maxEntries?)`, a bounded LRU holding only a boolean per key
  hash (D2).
- The `UNTRUSTED_DATA` wrapping and the marker neutralisation move from `explain/prompt.ts` to one
  shared core module, so the verification prompt does not duplicate them.
- `verify/policy.ts` gains the entailment rule (D1); `verify-answer.ts` runs the semantic check after
  the syntactic policy and returns the verdict per citation, the usage and the
  `entailment_unverified` events (D8).
- `explain` takes a `verificationCache` dependency, answers each statement with the `verification` and
  the type D1 gives it, stores each evidence row with its pair's verdict, and adds
  `usage.verification` to every `answered` answer (D6).
- New event `entailment_unverified` in `ExplainEvent` with the closed set
  `ENTAILMENT_UNVERIFIED_REASONS` (D7).
- `ask` creates one `VerificationCache` per `ask` run (one process per question), passes it to `explain`, and writes
  `entailment_unverified` at level `info`.
- Documentation: `readme.md` (verifier step and `verification` table), `docs/project-context.md`
  (semantic verifier gotchas, per-run cache, the verification double of `scripted-llm`), and the
  DIS-70 comments left in `explain-answer.ts`, `claim-items.ts` and `verify-answer.ts`.

### Non-goals

- A persistent cache in Postgres, or one shared between processes (D2); invalidating it on re-index
  (the key already holds the excerpt).
- Persisting the usage in `query_log`, `savingsPct`, aggregating it with the generation tokens and the
  Table 1 ratio: DIS-74 (CM-HU-11.2).
- Computing `confidence` from the entailment signal: DIS-72 (CM-HU-11.1).
- A ceiling on the verification cost (readme: 25 %): it is only measured.
- Re-verifying prior claims or `stale` claims when they are read back: DIS-42.
- Showing the verification per evidence in `AnswerEvidence`, in `ask`'s readable output, or in the
  API/web (CM-HU-12); `ask` does not print `usage` either.
- Parallel calls, a different model per statement type, splitting the answer into atomic statements.
- Changing `LlmPort` or `adapters/llm`: `purpose: 'verify'` already selects `LLM_MODEL_VERIFY`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `evidence-verification`: "Output policy over typed statements" (a `cited` citation no longer leaves
  the type alone), and new requirements for the semantic check (pairs, prompt, strict output,
  fail-closed degradation, evaluation mode, usage), the verification cache and the entailment typing
  policy (D1).
- `explain`: "Precedence and UNKNOWN answers" (the semantic step after the policy, no verification
  call for `broken-evidence`, the verification errors that do not propagate), "Answer with typed
  statements" (`verification` per statement and per evidence row, the D1 type, `usage.verification`,
  the `verificationCache` dependency), "Persistence failure" (same fields unsaved) and "Explain events
  and logging" (the `entailment_unverified` event and its place).
- `claims-and-typing`: "Statement typing from the resolution of its evidence" (the typing rule is the
  type of the evidence chain; an answered statement is further capped by the entailment policy).
- `cli-ask`: "Ask answer output" (one cache per run, `entailment_unverified` at level `info`, the
  printed `FACT` needs a verifier that entails).

## Impact

- Code: `packages/core/src/verify/{semantic,verification-cache}.ts` (new), `verify/{policy,
  verify-answer,index}.ts`; a shared untrusted-text module in `packages/core/src/explain/` taken out of
  `prompt.ts`; `packages/core/src/explain/{explain,claim-items,explain-answer,explain-event,
  limits}.ts`; `packages/cli/src/commands/ask.ts`. No new port, adapter, SQL, migration, API or web
  change; `LlmPort`, `StorePort`, `SourceTreePort` and `typing-rules.ts` do not change.
- Tests: `tests/unit/verify/{semantic,verification-cache}.spec.ts` (new); `tests/unit/verify/{policy,
  verify-answer}.spec.ts`, `tests/unit/explain/{explain,explain-verification}.spec.ts`,
  `tests/unit/cli/ask-command.spec.ts`, `tests/integration/explain/explain.spec.ts` and
  `tests/integration/cli/ask-command.spec.ts` change where the spec changes (`verification`, `FACT`
  now needing `entailed`, request counts that now include `verify` calls); `tests/support/
  scripted-llm.ts` gains a verification script and configurable tokens, and `tests/support/explain-doubles.ts`
  puts a fresh verification cache in `deps` and forwards the verifier options.
- Cost and performance: one model call per distinct uncached pair, in sequence,
  each through `withDailyBudget` when a ceiling is set; at most `MAX_STATEMENTS` ×
  `MAX_EVIDENCE_IDS_PER_STATEMENT` pairs per answer. Since `ask` is one process per question, the
  per-run cache only saves the repeated pairs of one answer today; it pays off in a long-lived
  process (API, DIS-21 era).
- Database: no schema change. New `evidence` rows carry `entailed` or `cited`; rows written before keep
  their value. `broken` is still never written (ADR 20261014).
- Privacy and security: no personal data is added. The statement (model output) and the excerpt are
  untrusted text sent to the verification model wrapped and neutralised; its output passes a strict
  schema; the event and the cache hold no text (the cache holds a hash and a boolean).
