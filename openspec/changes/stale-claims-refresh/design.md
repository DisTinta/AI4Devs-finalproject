## Context

See `proposal.md` → Why. The pieces of a refresh already exist and are used by `explain` for an
answer: the sanitisation (`sanitize.ts`, `untrusted-text.ts`), the quarantine (`statement-schema.ts`),
the typing rule (`typing-rules.ts`), the verification (`verify/verify-answer.ts`: syntactic at the
pack's commit and root, semantic with the verification cache, entailment policy), the claim record
(`claim-items.ts`), the metered model (`usage-meter.ts`) and the claim write with its lock and its
`readAtCommit` check (`store-postgres/src/claims.ts`, `CHECK_CLAIM_FILES`). What is missing is the
orchestration per stale claim, a prompt that is not a question, and a store write that rewrites a
claim instead of inserting one.

Constraints that shape the approach:

- `explain` reads the prior claims before the model call and returns them in `priorClaims`; the
  `/ask` `200` body does not expose them and the API and CLI log every event generically
  (`evidence_broken` at `error`, the rest at `info`), so a new event needs no transport change.
- The stale trigger of migration `0003` only turns `current` into `stale`; nothing in the schema
  forbids an `UPDATE` back to `current`. No migration is needed: `claim.updated_at` and the partial
  index `claim_stale_idx` exist.
- `packages/adapters/store-postgres/src` is a seed fingerprint input
  (`packages/cli/src/seed/fingerprint.ts`): any byte changed there stales `seeds/graph-dump.sql` and,
  through it, both golden files, which then need regeneration with Ollama and a new review round
  (DIS-9 precedent, groups 10–10d of its tasks).
- The answer fingerprint inputs (`ANSWER_FINGERPRINT_FILES`) include `prompt.ts` and `sanitize.ts`;
  this design touches neither.

## Goals / Non-Goals

**Goals:**

- A due stale claim reached by an answered question is recomputed against the code the pack read,
  with the same guarantees as a new answer (quarantine, typing, two-level verification), and written
  back in its row only when that code is still the indexed one.
- No refresh failure that the ticket lists makes the answer fail; every one is visible as a closed
  code.
- The refresh's spend is counted where the answer's is (usage, `query_log`, daily budget).

**Non-Goals:**

- Background or re-index-time recomputation; refreshing every stale claim of a project.
- Keeping the previous version of a refreshed claim (no history table).
- Refreshing `L1` claims, `L2` `UNKNOWN` claims, or cached answers that hold stale prior claims.
- Any change to the `/ask` contract, the CLI output format or the answer prompt.

## Decisions

### D1. Where the refresh runs (`explain.ts`)

In `answerQuestion`, after the `saveClaims` `try`/`catch` (both branches: a stored and an unsaved
answer are answered answers) and before returning the outcome, `explain` calls
`refreshStaleClaims` (new `packages/core/src/explain/stale-refresh.ts`) with the metered model
(`meter.llm`), the store, the source, the verification cache, the clock, the cost table, `pack.root`,
`pack.commit`, `startedAt`, the pack's raw spans, the sanitised spans and the prior claims read
before the model. It returns the prior claims to show (refreshed ones replaced at their position),
the `stale_claim_not_refreshed` events in prior-claims order, and the summed verification usage of
the refresh's semantic checks. `explain` appends those events after `claims_not_persisted` (or at
the end of the answered events when there is none), replaces `priorClaims`, and adds the refresh
verification usage to the answer's before `aggregateUsage`. The cache save and the row come after, in
`finish`, unchanged: the cached response holds the prior claims as shown.

*Alternative rejected:* refreshing before the answer's model call, so the answer's prompt could see
current claims. The answer prompt does not include prior claims, so nothing would gain, and an
`UNKNOWN` answer would then pay for refreshes it never shows (R5).

### D2. Which claims are due (`stale-refresh.ts`)

`MAX_STALE_REFRESHES = 3` (exported). Due = `status === 'stale'`, `layer === 'L2'`,
`type === 'INFERENCE'`, `object !== null` and a provenance with `statementType` (the shape
`toClaimItems` writes; `claimSchema` requires `statementType` on `L2` `INFERENCE`). The first three
due claims in the order `findClaimsOverlapping` returned (newest first) are refreshed, sequentially.
Sequential, not parallel: the verification cache and the meter are shared, the order of events is
deterministic, and an `LlmUnavailable` can stop the rest (R8).

### D3. The refresh's spans and sanitisation

The spans of a claim are the indices `i` of the pack whose sanitised span `sanitized.spans[i]`
overlaps one of the claim's evidence (same `fileId`, `start ≤ evidence.end` and
`end ≥ evidence.start`, using the sanitised span's lines, so a cut span counts by its kept lines),
in pack order. The refresh calls `sanitizeForPrompt(claim.object, rawSpans)` with the raw pack spans
at those indices: the spans come out exactly as the answer's prompt saw them (same cut, same flags),
and the stored object is checked against `INSTRUCTION_PATTERNS` like a question. The events of that
sanitisation are not returned (P2): the spans' events are already in the answer's events, and the
object's flags appear in the prompt as `claimFlags`. A due claim with no overlapping span (not
possible today, since the claim was read by overlap with these spans) gets `no-evidence` without a
call.

### D4. The refresh prompt (`packages/core/src/explain/refresh-prompt.ts`, new)

`buildRefreshPrompt(sanitized)` returns `{ messages, evidenceIds, promptHash }` like `buildPrompt`:
system message `REFRESH_SYSTEM_PROMPT` (exported; same untrusted-data and output-format lines as the
explain prompt, but asking to restate or correct the earlier statement using only the evidence, in
the earlier statement's language, and to return an empty `statements` list when the evidence does
not support it); user message `JSON.stringify({ claim, claimFlags?, evidence })`, `claim` being
`wrapUntrusted('claim', neutralise(object))`, each evidence entry built as in `buildPrompt` (path
neutralised, text neutralised and wrapped under its id, real truncation mark inside the markers,
`flags` only when present). `prompt.ts` is not edited (P1): the few lines of evidence mapping are
repeated in `refresh-prompt.ts`, so the answer prompt, its hash and the answer fingerprint do not
change. `refresh-prompt.ts` is not added to `ANSWER_FINGERPRINT_FILES`: no golden answer goes
through a refresh (the seed holds no stale claim).

### D5. Output, typing, verification and record

`parseModelOutput(text, ids)`: not ok → `invalid-model-output` (its schema-violation event dropped);
no statements → `no-evidence`; otherwise the first statement only (P5). It is typed with
`typeStatement` over its cited spans and verified with `verifyAnswer` exactly as an answer's
statements (`pack.root`, `pack.commit`, the same cache, clock and cost table; the verify call limit
per call of `verifyAnswer`, hence per refresh). No statement left → `broken-evidence`. Its
`evidence_broken` and `entailment_unverified` events are dropped (P2). The record is
`toClaimItems({ projectId, model: result.model, promptHash, createdAt: startedAt, packSpans:
sanitized.spans }, [statement])[0]`: subject and predicate are rewritten too (P6), so the row
describes what the new statement cites.

### D6. Store: `refreshClaim` (port, adapter, double)

`StorePort.refreshClaim(projectId, claimId, item, readAtCommit): Promise<ClaimRefresh>`, with
`ClaimRefresh = { refreshed: true; evidenceIds: string[] } | { refreshed: false }` in
`packages/core/src/knowledge/stored-claim.ts`. Validation before any statement, in this order:
`projectId` UUID (`ProjectNotFound`), `claimId` UUID (`InvalidStoreQuery('claimId')`),
`assertValidClaimItems(projectId, [item])` plus `item.claim.status === 'current'`
(`InvalidStoreQuery('claims')`).

Postgres (`claims.ts`, `queries.ts`, `postgres-store.ts`), in the same transaction/savepoint wrapper
as `saveClaims`:

1. `CHECK_CLAIM_FILES` (project `FOR SHARE`, ownership of the cited files, indexed commit), as in
   `writeClaims`: `ProjectNotFound` / `InvalidStoreQuery('claims')`;
2. new `LOCK_CLAIM_FOR_REFRESH`: `SELECT status FROM claim WHERE id = $1 AND project_id = $2
   FOR UPDATE`; no row, a status other than `stale`, or `readAtCommit !== indexed_commit` →
   `{ refreshed: false }` with nothing written;
3. new `UPDATE_REFRESHED_CLAIM`: subject, predicate, object, layer, type, confidence, provenance,
   `status = 'current'`, `updated_at = clock_timestamp()` (the write instant, as `INSERT_CLAIMS`
   uses for `created_at`); `created_at` untouched, so the retrieval order does not change (P7);
4. new `DELETE_CLAIM_EVIDENCE` (`WHERE claim_id = $1`), then `INSERT_EVIDENCE` reused with new
   `randomUUID()` ids.

Any database error after the write started → `ClaimWriteFailed` (same mapping as `saveClaims`). A
second concurrent refresh waits on the row lock and then sees `current` (R9). The in-memory double
gets the same checks, `failClaimRefresh?: (claimId: string) => unknown` (a value is thrown instead of
writing) and `beforeRefreshCheck?: (claimId: string) => void` (to move the indexed commit or change
the claim between the call and the check), and counts `calls.refreshClaim`.

### D7. Event (`explain-event.ts`)

`STALE_CLAIM_NOT_REFRESHED_CODES = ['no-evidence', 'invalid-model-output', 'broken-evidence',
'llm-unavailable', 'budget-exhausted', 'superseded', 'store-write-failed'] as const` and
`StaleClaimNotRefreshedEvent { type: 'stale_claim_not_refreshed'; claimId: string; code }`, added to
`ExplainEvent`. `claimId` is a UUID the store generated; no other field.

### D8. Errors

Inside one refresh: `LlmUnavailable` / `BudgetExhausted` from the `answer` call → that claim and the
remaining due claims get the matching code and the loop stops; `ClaimWriteFailed` from
`refreshClaim` → `store-write-failed`, the loop continues. Every other error propagates unchanged
(R7), which `explain`'s existing `catch` turns into a rejection row (the meter already counts every
resolved call). `CallState.verifyLatencyMs` becomes the running sum of the semantic checks that
returned (the answer's, then each refresh's): `onSemanticStart` sets it to `null` and each returned
check adds its `latencyMs` back, so a rejection raised inside any check leaves it `null` and one
raised between checks reports the sum.

### D9. Usage

`generation` already comes from the meter, which counts every `answer`-purpose call, so the refresh's
calls are in it with no change. `verification` becomes `sumVerificationUsage(answerCheck,
...refreshChecks)` (new helper in `usage.ts`: sums calls, cache hits, tokens and latency, rounds the
summed cost to 6 decimals). `aggregateUsage` and `queryLogEntry` are unchanged.

### D10. Showing a refreshed claim (`prior-claims.ts`)

`stale-refresh.ts` builds the `StoredClaim` of a refreshed claim from the read one (id, project,
creation instant) plus the record written and the new evidence ids, with each evidence's path taken
from its span, and passes it to the existing `toPriorClaim`. `displayType` does not change. The
file's comment ("they are not recomputed (DIS-42)") is rewritten.

### D11. Test doubles

- `tests/support/in-memory-store.ts`: `refreshClaim`, `failClaimRefresh`, `beforeRefreshCheck`,
  `calls.refreshClaim` (D6).
- `tests/support/scripted-llm.ts`: the parsed prompt given to a `Script` gains
  `kind: 'answer' | 'refresh'` and, for a refresh, `claim` (the unwrapped text) and `claimFlags`, so
  one script answers both prompts.
- `tests/support/explain-doubles.ts`: its `StorePort` wrapper gains `refreshClaim`, recorded as
  `'refreshClaim'` in `d.order`, and passes the two new store options through.

### D12. Seed, golden answers and review round

Touching `store-postgres/src` stales the seed fingerprint, so after the code is final the change
runs `seed:build` and `cache:build` with Ollama (`qwen2.5-coder`), as DIS-9 did, and the regenerated
golden answers go through a DIS-42 blind panel round (Opus and Sonnet panelists, Opus resolver), with
the `golden-answers` delta retargeting the round from DIS-9 to DIS-42. The regenerated answers differ
only by the model's sampling: no golden question reaches a stale claim. Without a working Ollama the
ticket stops cleanly (P8).

### D13. ADR

`docs/adr/20261029-stale-claims-refreshed-in-place.md`: a refreshed claim keeps its id and row, its
evidence is replaced, and no previous version is kept. It spans core, port and adapter and is costly
to reverse (a later history table or versioned claims would need a migration and a data backfill).

## Risks / Trade-offs

- [Up to three extra `answer` calls, each with its `verify` calls, make an `/ask` that reaches stale
  claims slower (seconds per call on a local Ollama)] → capped at 3 per question (R6); each call goes
  through `withDailyBudget`; a background refresh is out of scope (D).
- [A refresh overwrites the previous text and evidence: no audit trail of what the claim said before]
  → accepted and recorded in the ADR (P10, destination D).
- [The stored object returns to a prompt and could carry an injection planted by an earlier model
  output] → wrapped and neutralised like any untrusted text, flagged in `claimFlags`, quarantine of
  the output, verification of every citation; the sanitisation is defence in depth, not a barrier
  (PH-13).
- [A re-index between the refresh's read and its write] → `readAtCommit` compared with the indexed
  commit under the project lock; the claim stays `stale` (`superseded`).
- [Two refreshes of one claim at once] → row lock; the second sees `current` and writes nothing.
- [The regeneration needs Ollama and a panel round, which can fail or find an incorrect golden
  answer] → handled as in DIS-9 (a successor ticket per `incorrect` item); a missing Ollama stops the
  ticket (P8).
- [Another change of this block (DIS-10) may merge its own golden round first] → this change then
  merges the base, regenerates again after the merge (its fingerprint changes too) and rebases the
  `golden-answers` delta: that round becomes a previous round in every list of the delta (P9).

## Migration Plan

No schema migration. Deploy is the code plus the regenerated seed and golden files; `npm run
db:seed` reloads them. Rollback: revert the PR; refreshed claims stay `current` in local databases
(true of the code they were verified against at that commit), and the trigger turns them `stale` again
on the next content change.

## Follow-ups

*Agent's text: decisions taken by the agent as lead engineer in the autonomous run
(`docs/AUTONOMOUS-RUN.md` §6), without the author; R1–R14 copied from the DIS-42 `[enhanced]`
description, P1–P11 taken in this proposal. Destinations: A = this change; B = another existing
ticket; C = the author; D = out of scope, recorded.*

| Id | Decision | Destination |
|---|---|---|
| R1 | "When retrieved" = when `explain` reads the prior claims of the pack's spans and is about to show them; there is no other reader of claims. | A |
| R2 | "Re-infer" = one `answer` call per claim with a prompt of its own (stored statement + current spans) and the output of `parseModelOutput`; the original question is not stored nor repeated; no new purpose or model. | A |
| R3 | "Current span" = the pack's sanitised spans overlapping the claim's evidence, read at `pack.commit` with their cut: no arbitrary commit and no stored excerpt are compared (the DIS-68 notes do not apply). | A |
| R4 | The claim is recomputed in its own row (same id; text, type, provenance, confidence and evidence new, old evidence deleted); ADR. | A |
| R5 | Only answered answers refresh, after their claim write; `UNKNOWN`, cache hits and evaluation mode do not. | A |
| R6 | `MAX_STALE_REFRESHES = 3` per question, the most recent; the rest shown `stale` without event. | A |
| R7 | A refresh that does not reach a verified statement leaves the row intact and emits `stale_claim_not_refreshed` with a closed code; never fails the answer for those codes; other errors propagate as in the rest of `explain`. | A |
| R8 | `LlmUnavailable` or `BudgetExhausted` in a refresh's `answer` call stop the remaining refreshes of that question, each with its event. | A |
| R9 | Conditional write: only while `stale` and while `readAtCommit` is the indexed commit, under lock; otherwise `superseded`. | A |
| R10 | Only `L2` `INFERENCE` claims with an object are refreshed; a stale `L1` (or `L2` `UNKNOWN`) is shown as today. | D |
| R11 | Evidence on a deleted file was cascaded away; such a claim is only refreshed if retrieval reaches it by other evidence. | D |
| R12 | Cached answers holding stale prior claims are not rewritten by a refresh (the cache is invalidated on re-index, DIS-9). | D |
| R13 | PowerShell check for the author: in a new PowerShell terminal, index a copy of acme-shop, ask with `npm run cli -- ask`, change `PriceCalculator.php`, re-index (`POST /api/projects/<id>/index`), ask again and see the prior claim without `[stale]`. The agent does the Git Bash half (tasks group 11). | C — author |
| R14 | The incremental plan (DIS-10) changes nothing here: it still marks claims stale through the same trigger. | D |
| P1 | The refresh prompt lives in `refresh-prompt.ts`; `prompt.ts` is not edited, so the answer prompt, its hash and the answer fingerprint stay the same; `refresh-prompt.ts` is not an answer fingerprint input (no golden answer goes through a refresh). | A |
| P2 | The refresh's own sanitisation, schema-violation, `evidence_broken` and `entailment_unverified` events are not added to the answer (they would name ids of another prompt); the stored object's flags go to the prompt as `claimFlags`. Supersedes the ticket's "eventos de saneado incluidos". | A |
| P3 | Due also requires a provenance with `statementType` (the shape explain writes). | A |
| P4 | Unsaved answers (`ClaimWriteFailed`) also refresh: they are answered answers and show prior claims. | A |
| P5 | Only the first statement of a refresh output is kept; the rest is ignored. | A |
| P6 | Subject and predicate are rewritten with the record of the new statement. | A |
| P7 | `created_at` is kept and `updated_at` set to the write instant: a refreshed claim keeps its place in the newest-first retrieval order. | A |
| P8 | The store adapter is a seed fingerprint input: the seed and golden files are regenerated with Ollama and reviewed by a DIS-42 blind panel round in this change (DIS-9 precedent). Without Ollama the ticket stops cleanly. | A |
| P9 | If another golden round merges into the base first, this change regenerates after merging it and turns that round into a previous round of the `golden-answers` delta. | A |
| P10 | No history of a refreshed claim's previous version is kept. | D |
| P11 | The refresh re-sanitises the raw pack spans at the overlapping indices, so its spans equal the answer prompt's. | A |
