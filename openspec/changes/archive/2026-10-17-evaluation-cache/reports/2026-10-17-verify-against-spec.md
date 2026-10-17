# Verify Against Spec — evaluation-cache (DIS-21)

- Date: 2026-10-17
- Change: evaluation-cache (DIS-21)
- Task: 16.5 (`/verify-against-spec`)
- Specs: `openspec/changes/evaluation-cache/specs/{answer-cache,cli-ask,explain,graph-store,http-ask}/spec.md`
- Code: `git diff origin/feature/entrega-2-CRN...HEAD` at `5c6a60b` (19 source files under `packages/`)
- Run by the agent inline (the forked skill reports to the main session, not to this step), in the
  autonomous workflow of Entrega 2.

## 1. Requirements implemented correctly

| Requirement | Code | Tests |
|---|---|---|
| answer-cache — Question normalization (NFKD, marks, locale-free lower case, `P`/`S` to space, whitespace runs, trim; pure and idempotent) | `packages/core/src/cache/normalize.ts:15-23` | `tests/unit/cache/normalize.spec.ts` (3 scenarios) |
| answer-cache — Cacheable answers (stored + every statement `current`, or `no-evidence`) | `packages/core/src/cache/response-cache.ts:31-34` | `tests/unit/cache/response-cache.spec.ts` "Only stored current answers…" |
| answer-cache — Stored response (exact fields without `events`; strict schema; reference check; answer `excerpt` a string; negative `savingsPct`; `cacheHit` literal `false`; a rejection is a silent miss) | `response-cache.ts:42` (`toStoredResponse`), `:51-145` (schemas), `:153` (`parseStoredResponse`) | `response-cache.spec.ts` 3 scenarios + boundary test |
| answer-cache — Answer of a cache hit (usage of this call, stored baseline, `savingsPct` at 0 input tokens; `UNKNOWN` without usage) | `response-cache.ts:162-188` (`hitUsage`, `answerFromCache`) | `response-cache.spec.ts` 2 scenarios |
| graph-store — Answer cache entries (four calls, check order, `ProjectNotFound`, `CacheWriteFailed` without cause, parameterised SQL, advisory-lock serialised save, caller-owned transaction) | `packages/core/src/ports/StorePort.ts:158-214` (`findCacheEntry` … `invalidateCache`), `packages/core/src/knowledge/cache-entry.ts`, `packages/core/src/knowledge/errors.ts:131` (`CacheWriteFailed`), `packages/adapters/store-postgres/src/postgres-store.ts:142-172,346-385`, `packages/adapters/store-postgres/src/queries.ts:304-349` | `tests/integration/store/cache-entry.spec.ts` (10), `tests/unit/store/postgres-cache-write-errors.spec.ts` (2), `tests/unit/store/in-memory-store.spec.ts` (1) |
| explain — Explain request (`useCache` boolean, `EXPLAIN_REQUEST_FIELDS`) | `packages/core/src/explain/explain-request.ts:13,49` | `tests/unit/explain/explain.spec.ts` "A non-boolean cache flag is rejected before the store" |
| explain — Precedence (lookup after anchoring, before the evaluation-mode check; no lookup without anchor) | `packages/core/src/explain/explain.ts:289-313` (`answerQuestion`, lookup at :303) | `explain-cache.spec.ts` "A question without anchor is not looked up in the cache"; unchanged scenarios in `explain.spec.ts` |
| explain — Answer cache (lookup, hit record at the first clock read, save after the claim write and the second clock read and before the row, never re-saving a hit, failures) | `explain.ts:143-196` (`explain`), `:205` (`finish`), `:231` (`saveCache`) | `tests/unit/explain/explain-cache.spec.ts` (14), `tests/integration/explain/explain.spec.ts` "A hit over the database…" |
| explain — Events and logging (`answer_not_cached` after `claims_not_persisted`, before `query_not_logged`; codes only) | `packages/core/src/explain/explain-event.ts:51-67`, `explain.ts:271` (`withEvents`) | `explain-cache.spec.ts` "A failed cache write still answers and says so without leaking" |
| explain — Answer usage (`cacheHit: boolean`) and Query log (`cacheHit` of a hit row, zero counters, stored baseline) | `packages/core/src/explain/explain-answer.ts:98-102`, `packages/core/src/explain/usage.ts:101-124` | `explain-cache.spec.ts` "A cached question is answered from the cache in both modes", "A no-evidence unknown…" |
| http-ask — Ask request validation (`useCache` forwarded only when sent; OpenAPI description) | `packages/api/src/schemas/ask.ts:51-59`, `packages/api/src/routes/ask.ts:142-148` (forward at :147) | `tests/unit/api/ask.spec.ts` (5 validation scenarios + 2 events scenarios) |
| http-ask — Ask from the answer cache (cached 200 over the seed, spent budget still answers a cached question, refund question `no-anchor`) | (no route code beyond forwarding: the use case serves the hit) | `tests/integration/api/ask.spec.ts` (3) |
| cli-ask — Ask from the answer cache (prints a cached answer exactly as any answer, exit 0, no new option) | no CLI change (`packages/cli/src/commands/ask.ts` unchanged) | `tests/integration/cli/ask-command.spec.ts` "Evaluation mode prints a cached answer" |

## 2. Requirements missing or partial

No requirement is missing in the code. Four tests asserted less than their scenario states, and one
test comment did not match its code; all were fixed in this change (destination **A**):

| Id | Severity | Scenario / file | What was weaker | Fix |
|---|---|---|---|---|
| V1 | Minor | explain "A failed cache write still answers and says so without leaking" — `tests/unit/explain/explain-cache.spec.ts` | THEN "each answer is the stored answer with its fields unchanged": the test compared only `kind`, `persisted`, `answer`, `usage.cacheHit` and each statement's text, type and verification, not `evidence`, `priorClaims`, `confidence` or the whole `usage` | Each answer, without its events, now equals the reference answer field by field (`comparable`: evidence ids by position and file ids dropped, as both are random per in-memory store) |
| V2 | Minor | explain "A hit whose row is not written still answers and says so" — same file | THEN "the answer is the hit of the stored response": `toMatchObject` on three fields | The answer without its events now strictly equals `answerFromCache(cachedAnswer(), latency)` |
| V3 | Minor | explain "A no-evidence unknown is cached and served without the model" — same file | THEN "its `query_log` row has … every counter and cost 0": `verifyInputTokens`, `verifyOutputTokens` and `verifyCostUsd` were not asserted | The three fields are asserted 0 |
| V4 | Nit | answer-cache "Identifiers, symbols and compatibility characters become plain words" — `tests/unit/cache/normalize.spec.ts` | Its comment says the full-width word and `İ` are written as escapes "so the source shows them", but they were raw characters (an editor tool had unescaped them) | Written as `Ｐ…` and `İ` escapes (same values) |

All four pass with the code as it is (characterisation strengthening, no behaviour change):
`npx vitest run tests/unit/cache tests/unit/explain/explain-cache.spec.ts` → 3 files, 25 tests passed.

## 3. Unspecified behaviour

| Id | Severity | Code | Behaviour | Decision |
|---|---|---|---|---|
| V5 | Nit | `packages/adapters/store-postgres/src/queries.ts` `FIND_CACHE_ENTRY` | The lookup selected `p.id AS project_id`, a column nothing reads (the project's existence is the presence of the row) | Removed (**A**); `tests/integration/store/cache-entry.spec.ts` 10/10 green against Postgres |
| — | — | `packages/api/src/schemas/ask.ts:51-59` | The OpenAPI `description` of `useCache` | Specified by design C7 and task 7.2; kept |
| — | — | `packages/core/src/explain/explain.ts` (`explain`, `const key`) | The key is computed before anchoring, even for a question that will answer `no-anchor` | Pure computation, no observable effect (no lookup, no save, no event); kept |

No other behaviour outside the five deltas was found: the transports add nothing but the forwarded
flag, the CLI is unchanged, and every new store statement is one the graph-store delta lists.

### Specific checks

- Dependency not in the manifest: none (`package.json` and `package-lock.json` unchanged; `zod` and
  `pg` were already dependencies).
- Authorisation required by the spec and not performed: none required (the API has no authentication
  by design); every cache statement is scoped by `project_id`.
- Response fields the spec does not mention: none; a hit answers exactly the answered shape, and the
  stored response is re-validated with strict objects on read.
- Scenarios whose test asserts something weaker: V1–V3 above, fixed.

## Scenario → test → state

All 109 `#### Scenario:` titles of the five delta specs map to a test of exactly that name (grep of
each title in `tests/`); "A pack where nothing fits is unknown over budget" maps to two tests (one in
`explain.spec.ts`, one in `explain-verification.spec.ts`, both pre-existing).

| Scenario (delta) | Test file | State |
|---|---|---|
| answer-cache: 9 scenarios | `tests/unit/cache/normalize.spec.ts`, `tests/unit/cache/response-cache.spec.ts` | green |
| cli-ask: Evaluation mode prints a cached answer | `tests/integration/cli/ask-command.spec.ts` | green |
| explain (ADDED "Answer cache"): 15 scenarios | `tests/unit/explain/explain-cache.spec.ts`, `tests/integration/explain/explain.spec.ts` | green (V1–V3 strengthened) |
| explain (MODIFIED requirements): 61 scenarios, incl. "A non-boolean cache flag…" and "A question without anchor is not looked up in the cache" | `tests/unit/explain/{explain,explain-verification,explain-sanitization,explain-cache,usage}.spec.ts`, `tests/integration/explain/explain.spec.ts` | green |
| graph-store: 13 scenarios | `tests/integration/store/cache-entry.spec.ts`, `tests/unit/store/postgres-cache-write-errors.spec.ts`, `tests/unit/store/in-memory-store.spec.ts` | green |
| http-ask: 10 scenarios | `tests/unit/api/ask.spec.ts`, `tests/integration/api/ask.spec.ts` | green |

The full suite after the fixes is recorded in the addendum of the step 11 report.

## Verdict

**CONFORMS** — every requirement of the five deltas is implemented and tested; no Blocker or Major.
Five Minor/Nit findings (V1–V5), all fixed in this change (**A**) and listed in `design.md` →
Follow-ups.

## Addendum — 2026-10-17, after the fixes

V1–V5 are in the tree; the full suite run of this step also found AR4 (an order-dependent test of
`cache-entry.spec.ts`, fixed; see `2026-10-17-adversarial-review.md`). On the fixed tree:
`npx vitest run` 123 files, 1 490 tests passed; lint, typecheck, architecture (0 errors) and docs
coverage clean. Verdict unchanged: **CONFORMS**.
