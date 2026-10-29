## Why

Since DIS-39 a question that reaches a stored claim whose evidence changed shows it marked `stale`
with the warning `stale-evidence`, and nothing ever turns it back to `current`: `readme.md` §3.2
promises that stale claims are recomputed lazily the first time retrieval reaches them, and the
stale trigger of the database leaves that job to this ticket (DIS-42, CM-HU-09.4, Entrega 3). Without
it every re-index makes the stored knowledge of the touched files permanently stale.

## What Changes

- When `explain` returns an answered answer, it recomputes, after the answer's claim write, up to
  `MAX_STALE_REFRESHES` (3) of the stale prior claims the question reached (the most recent ones,
  `L2` `INFERENCE` only, with an object and a statement type): one re-inference per claim with the purpose `answer` (a prompt of its own
  holding the stored statement as untrusted data and the pack's spans that overlap the claim's
  evidence), the same quarantine, typing rule, syntactic and semantic verification and entailment
  policy as an answer, at the pack's commit and root.
- A refresh that yields a verified statement rewrites the claim **in its own row** (same id): new
  text, type, confidence and provenance (the call's instant, the refresh prompt's hash, the pack's
  spans), status `current`, its old evidence replaced by the new one. The prior claim is then shown
  `current`, without warning.
- A refresh that cannot back the claim leaves the row untouched, shows it `stale` as today and adds
  one event `stale_claim_not_refreshed` `{ claimId, code }` with a closed code (`no-evidence`,
  `invalid-model-output`, `broken-evidence`, `llm-unavailable`, `budget-exhausted`, `superseded`,
  `store-write-failed`). A refresh never fails the answer for those reasons; `LlmUnavailable` and
  `BudgetExhausted` stop the remaining refreshes of the call.
- New store operation `refreshClaim(projectId, claimId, item, readAtCommit)`: a conditional, atomic
  write that only rewrites a claim that is still `stale` and whose `readAtCommit` is still the
  project's indexed commit, under the same lock as the claim write; otherwise it writes nothing.
  Postgres adapter and in-memory double.
- The refresh's model calls count in the answer's `usage` (generation and verification) and in its
  `query_log` row, so the daily budget sees them.
- Because the store adapter is a seed fingerprint input, the seed and the golden answers are
  regenerated and the regenerated golden answers go through a new blind panel review round (DIS-42),
  as in DIS-9.
- No HTTP or CLI contract change: `/ask` does not expose `priorClaims` and logs events as before; the
  CLI shows a refreshed prior claim without `[stale]`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `explain`: new requirement "Stale claim refresh"; "Precedence and UNKNOWN answers" gains step 14
  (the refresh, after the claim write and before the cache save) and its call counts; "Prior claims" no longer says stale claims are
  never recomputed; "Explain events and logging" gains `stale_claim_not_refreshed` and its place in
  the order; "Answer usage" and "Query log" count every `answer` call and every semantic check of the
  call, the refresh's included.
- `graph-store`: new requirement "Claim refresh" (`refreshClaim`).
- `golden-answers`: the current review round becomes DIS-42 (input, panel outputs, report, criterion
  and immutable record), DIS-9 and the two DIS-10 rounds (DIS-10 and DIS-10 r2, merged into the base
  before this round's panel) joining the previous rounds.

## Impact

- Core: `packages/core/src/explain/explain.ts`, `prior-claims.ts`, `explain-event.ts`, `usage.ts`
  (`sumVerificationUsage`), new `stale-refresh.ts` and `refresh-prompt.ts`;
  `packages/core/src/ports/StorePort.ts`; `packages/core/src/knowledge/stored-claim.ts` (the refresh
  result type); `packages/core/src/verify/syntactic.ts` (a comment only, design A4).
- Adapter: `packages/adapters/store-postgres/src/claims.ts`, `queries.ts`, `postgres-store.ts` (no
  migration: the columns and the partial index `claim_stale_idx` exist).
- Tests: new unit, store-integration and explain-integration specs; existing doubles
  (`tests/support/in-memory-store.ts`, `tests/support/scripted-llm.ts`,
  `tests/support/explain-doubles.ts`) and the prior-claims scenario of
  `tests/unit/explain/explain.spec.ts` change (named in `tasks.md`).
- Seed and golden files: `seeds/graph-dump.sql` header, `seeds/cache/*.json` regenerated with
  Ollama (`qwen2.5-coder`), a DIS-42 golden review round under `docs/golden-review/`.
- Docs: `readme.md` §3.2, `docs/project-context.md`, `prompts.md`, a new ADR (claims refreshed in
  place).
- Privacy and security: no personal data. The stored statement returns to a prompt: it is treated as
  untrusted text (neutralised, wrapped, flagged in the prompt); events carry only a claim id and a
  closed code; no model output, statement or excerpt reaches a log. Cost: at most three extra
  `answer` calls (plus their `verify` calls) per question, all under the daily budget.
