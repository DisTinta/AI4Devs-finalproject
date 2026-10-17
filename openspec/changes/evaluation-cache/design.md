## Context

See proposal.md (Why). The current state the design builds on:

- `packages/core/src/explain/explain.ts`: `explain()` validates the request, reads the clock
  (`startedAt`), wraps the model in a meter and runs `answerQuestion()`, which anchors, then hits the
  marked slot `// DIS-21: the answer cache is looked up here…`, then `if (llm.mode === 'evaluation')
  return unknown('llm-required')`, then pack → sanitise → prior claims → model → quarantine → typing →
  verification → `saveClaims`. Back in `explain()`, the second clock read gives the latency, the
  usage is aggregated (`usage.ts`, `cacheHit: false`), and `saveRow()` writes the `query_log` row,
  mapping `QueryLogWriteFailed` / `ProjectNotFound` / `InvalidStoreQuery` to a `query_not_logged`
  event. An error raised after a resolved model call writes the row and is rethrown.
- `StorePort` has no cache method. `cache_entry` (0002: `id`, `project_id` FK `ON DELETE CASCADE`,
  `question_normalized text NOT NULL`, `question_embedding vector(1536) NULL`, `response jsonb NULL`,
  `hit_count int NOT NULL DEFAULT 0`, `created_at`, `last_hit_at`) has no unique key; 0003 indexes
  `project_id` and the embedding (HNSW).
- `store-postgres` writes through `atomically(connection, work, mapWriteError)` (own pool: `BEGIN`/
  `COMMIT`; caller transaction: `SAVEPOINT store_write`) and maps database errors per write
  (`toQueryLogWriteError`); project-scoped reads go through `runProjectQuery` (no row → project
  missing).
- `tests/support/in-memory-store.ts` mirrors the adapter's checks; `tests/support/explain-doubles.ts`
  builds the explain doubles with a `store` wrapper hook.
- `/ask` (`packages/api/src/routes/ask.ts`) forwards `tokenBudget` only when sent and drops
  `useCache`; `toPublicAnswer` already publishes `usage.cacheHit`. The CLI `ask` passes no flag.

The DIS-21 `[enhanced]` description fixes D1–D14 and the post-audit amendments of D3, D5, D6 and D8
(agent as lead engineer, autonomous-run ADR `20261016-autonomous-workflow-run-entrega-2`, reviewable
by the author). This design turns them into units C1–C11.

## Goals / Non-Goals

**Goals:**

- One place (`core/cache`) owns the key, the cacheability rule, the stored-response schema and the
  hit's answer, so `explain`, the future `cache-build` script (DIS-26) and `verify` (CM-HU-14.1) share
  them.
- The cache sits in the slot the spec and the code already reserve, without changing any path that
  does not involve it (no new event on a miss, same `llm-required` body).
- The store keeps one entry per (project, key) without a migration.

**Non-Goals:** as in proposal.md (golden answers, similarity, invalidation callers, expiry, UI, CLI
flag, migration). Also: no change to the `UnknownExplain` shape, to the public `/ask` body, or to the
CLI output.

## Decisions

### C1 — `normalizeQuestion` (D1) — `packages/core/src/cache/normalize.ts`

```ts
export function normalizeQuestion(question: string): string {
  return question
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}
```

`toLowerCase()` (not `toLocaleLowerCase`) keeps it independent of the process locale. JS `\s` with the
`u` flag matches Unicode `White_Space` (NBSP, tabs, line breaks); NFKD already turns NBSP and
full-width forms into their ASCII compatibility forms. Lower-casing after NFKD + mark removal handles
`İ` (`I` + U+0307 → `I` → `i`). Idempotent by construction (each step is idempotent on the output of
the later ones; the spec has a scenario).

- *Alternative:* keep accents and only lower-case/strip punctuation. Rejected: DIS-16 asks for accent
  folding, and Spanish questions are typed both with and without accents.
- *Alternative:* stop-word removal or stemming. Rejected: changes meaning (`no`), and is a similarity
  concern (CM-HU-19).
- Accepted collision: pairs differing only in an accent or `ñ` (D1).
- Not shared with `normaliseText`/`questionTerms` of `context/anchor.ts` (NFD + mark removal, split
  on non-alphanumerics, stop words dropped, prefixes added): the two produce different outputs for
  different jobs (search terms vs. one stable key) and the key must not change when the anchoring
  heuristics are tuned. The common NFKD/NFD + `\p{M}` step is one line each; a shared helper would
  couple the cache key to the anchor's evolution.

### C2 — Cacheability, stored response and hit (D4, D5, D7) — `packages/core/src/cache/response-cache.ts`

- `isCacheable(answer: ExplainAnswer): boolean` — `kind === 'answered' && persisted && every
  statement.status === 'current'`, or `kind === 'unknown' && reason === 'no-evidence'`.
- `toStoredResponse(answer)` — the answer minus `events` (`const { events, ...stored } = answer`).
  For an `UNKNOWN`, `message` is never present (only `llm-required` has it, never cacheable).
- `storedResponseSchema` — Zod 4 `z.discriminatedUnion('kind', [answered, unknown])`, every object
  `z.strictObject`. The answered branch reuses the closed sets exported by core
  (`STATEMENT_VERIFICATIONS` of `claim-items.ts`, `CLAIM_TYPES` and `CLAIM_STATUSES` of
  `knowledge/claim.ts`, the `TOKEN_ESTIMATOR` literal of `context/tokenizer.ts`), never re-declared
  strings; `typing-rules.ts` gains `STATEMENT_TYPES = ['FACT', 'INFERENCE'] as const` and derives
  `StatementType` from it (same union, as DIS-78 did for `STATEMENT_VERIFICATIONS`); a
  `.superRefine` checks that every statement's `evidenceIds` names an `evidence[].id` (a broken
  reference would make `/ask` answer `500`, http-ask "A statement citing an unknown evidence id"),
  `endLine ≥ startLine`, and `warning` present iff `status === 'stale'` on prior claims. Closed sets
  go through `z.literal(ARRAY)` / `z.enum(ARRAY)` over the exported constants (`backend-standards.md`
  §4). An answer's `evidence[].excerpt` is `z.string()` (a `null` would make `toPublicAnswer` of `/ask`
  answer `500`); a prior claim's evidence `excerpt` is `z.string().nullable()`. In `usage`, tokens,
  calls, cache hits and latencies are `z.int().min(0)`, costs `z.number().min(0)` (finite), and
  `savingsPct` is `z.number()` (finite, **no** lower bound: it is negative when the answer used more
  tokens than the baseline, `explain` "Answer usage"). `usage.cacheHit` is `z.literal(false)`: a
  stored usage is always the original one.
- `parseStoredResponse(value: unknown): StoredResponse | undefined` — `safeParse`; failure →
  `undefined` (a miss), no error, no message (D5: nothing of the response reaches an error).
- `answerFromCache(stored, latencyMs): ExplainAnswer` — answered: `{ ...stored, events: [], usage:
  hitUsage(stored.usage, latencyMs) }`; unknown: `{ ...stored, events: [] }`. `hitUsage` builds the
  zero usage of the `answer-cache` spec, with `savingsPct(0, baselineTokens)` imported from
  `explain/usage.ts` (one formula).
- `packages/core/src/cache/index.ts` re-exports the module; `packages/core/src/index.ts` exports it.

Dependency direction: `cache/` imports **types and constants only** from `explain/explain-answer.ts`,
`explain/unknown-policy.ts`, `explain/claim-items.ts`, `explain/typing-rules.ts`, `explain/usage.ts`,
`knowledge/claim.ts` and `context/tokenizer.ts`, never `explain/explain.ts` or `explain/index.ts`;
`explain/explain.ts` imports `cache/`. No cycle (`no-circular` of `.dependency-cruiser.cjs`; checked by
`npm run lint:architecture`). `AnswerUsage.cacheHit` widens from `false` to `boolean`.

### C3 — `StorePort` methods (D3, D9) — `packages/core/src/ports/StorePort.ts`

```ts
findCacheEntry(projectId: string, questionNormalized: string): Promise<CacheEntry | undefined>;
saveCacheEntry(projectId: string, questionNormalized: string, response: object): Promise<void>;
touchCacheEntry(projectId: string, entryId: string, at: Date): Promise<void>;
invalidateCache(projectId: string): Promise<number>;
```

`CacheEntry = { id: string; response: unknown }` in `packages/core/src/knowledge/cache-entry.ts`,
with `assertValidCacheKey(question)` (non-empty, not only whitespace, no U+0000 → `InvalidStoreQuery`
naming `question`), `assertValidCacheResponse(response)` (plain non-null, non-array object →
`response`), `assertValidEntryId` (UUID form → `entryId`) and `assertValidHitInstant` (valid `Date` →
`at`), shared by the adapter and the in-memory double (the `assertValidQueryLogEntry` pattern).
`CacheWriteFailed` (code `CACHE_WRITE_FAILED`, fixed message `The cache entry could not be written`,
no `cause`) joins `knowledge/errors.ts`. The response is typed `object`/`unknown` at the port: the
store is shape-agnostic; core validates on read (C2).

### C4 — Postgres implementation (D3) — `postgres-store.ts`

- `findCacheEntry`: `runProjectQuery` with
  `SELECT … FROM project p LEFT JOIN LATERAL (SELECT id, response FROM cache_entry c WHERE
  c.project_id = p.id AND c.question_normalized = $2 ORDER BY c.created_at DESC, c.id DESC LIMIT 1) e
  ON true WHERE p.id = $1` — one statement; no project row → `ProjectNotFound`; `e.id` null → miss.
- `saveCacheEntry`: `atomically(connection, work, toCacheWriteError)` where `work` runs
  `SELECT pg_advisory_xact_lock(hashtextextended($1::text || ':' || $2::text, 0))` (explicit casts:
  node-postgres sends untyped parameters; key = project id + key, the
  lock is released with the transaction; on a caller transaction it lasts until that transaction
  ends, which is the harness's per-test rollback — harmless), then
  `DELETE FROM cache_entry WHERE project_id = $1 AND question_normalized = $2`, then
  `INSERT INTO cache_entry (project_id, question_normalized, response) SELECT id, $2, $3::jsonb FROM
  project WHERE id = $1` (`rowCount` 0 → `ProjectNotFound`, as `saveQueryLog`). The response is sent as
  `JSON.stringify(response)`.
  - *Alternative:* a unique index `(project_id, question_normalized)` + `ON CONFLICT DO UPDATE`.
    One `INSERT … ON CONFLICT` statement instead of lock + delete + insert, but needs migration 0005 and its rollback tests, and binds CM-HU-19's similarity
    cache to a uniqueness it may not want. Rejected for now (D3); revisitable by a migration later.
  - *Alternative:* `SERIALIZABLE` transaction. Rejected: retry logic on serialization failures.
- `touchCacheEntry`: inside `atomically`, one statement
  `WITH p AS (SELECT id FROM project WHERE id = $1), u AS (UPDATE cache_entry SET hit_count =
  hit_count + 1, last_hit_at = $3 WHERE id = $2 AND project_id = $1 RETURNING 1) SELECT (SELECT count(*)
  FROM p) AS project, (SELECT count(*) FROM u) AS touched` — no project → `ProjectNotFound`; 0 touched →
  resolve (D3: replaced or invalidated meanwhile).
- `invalidateCache`: inside `atomically`, the same CTE shape with `DELETE … RETURNING 1`, resolving to
  the deleted count.
- `toCacheWriteError`: a `DomainError` passes; anything else → `new CacheWriteFailed()`. With the two
  existing mappers it becomes the third of the same shape, so the refactor step (task 10.1) folds the
  three into one factory `domainErrorOr(() => new X())` without changing behaviour.
- The `0002` comment "no unique key… CM-HU-13 decides" stays true; the decision is recorded here and
  in `readme.md` §3.

### C5 — In-memory double — `tests/support/in-memory-store.ts`

Same checks in the same order (shared asserts of C3, then the project), entries in a `Map` keyed by
project id → list of `{ id, key, response, hitCount, lastHitAt, createdAt }` (a list so a test can
seed duplicates and invalid responses), `calls.findCacheEntry/saveCacheEntry/touchCacheEntry/
invalidateCache` counted before any check (as the other counters), `cacheEntries(projectId?)` to
read, `seedCacheEntry({ projectId, key, response, hitCount?, createdAt? })` to seed, and
`failCacheCall?: { find?, save?, touch?, invalidate? }: () => unknown` (the `failQueryLogWrite`
pattern) to inject failures. Ids come from `randomUUID()`, as the double's other rows; a test that
needs an order seeds `createdAt`. The double stores and returns a JSON round trip of each response
(`JSON.parse(JSON.stringify(response))`), as the `jsonb` column does, so no test passes by sharing a
reference. `doubles()` of `tests/support/explain-doubles.ts` forwards `failCacheCall` and pushes
`findCacheEntry`, `touchCacheEntry` and `saveCacheEntry` into its `order` list under their own names
(existing exact assertions on `order` and on the double's `calls` are extended with the cache calls,
never filtered: they pin the call order of "Precedence and UNKNOWN answers", which this change
modifies; see C8). Every
other `StorePort` double that is given to `explain` delegates the four methods to the in-memory double
(or answers a miss: `findCacheEntry` resolves `undefined`, `saveCacheEntry` resolves); only doubles
never given to `explain` may throw. Graph
writes and `sumCostSince` keep throwing; a test that needs `withDailyBudget` over the double wraps
it with a `sumCostSince` stub (the `store` hook of `doubles()`).

### C6 — `explain` integration (D2, D6, D7, D8, D10, D11, D12, D13)

- `explain-request.ts`: `useCache: z.boolean().optional()`; `EXPLAIN_REQUEST_FIELDS` gains `useCache`
  (last). `InvalidExplainRequest` unchanged otherwise.
- `answerQuestion` (slot after `no-anchor`): `const key = normalizeQuestion(question)`;
  `if (request.useCache !== false && key !== '')` → `store.findCacheEntry(projectId, key)`; when it
  returns an entry and `parseStoredResponse(entry.response)` accepts it →
  `await store.touchCacheEntry(projectId, entry.id, startedAt)` and `return { hit: stored }`. The
  `Outcome` union gains `{ hit: StoredResponse }`. Errors of both calls propagate (no model call has
  resolved, so `explain()` writes no row — the existing `meter.resolvedCalls() > 0` guard).
- `explain()` on `{ hit }`: latency from the second clock read; answer = `answerFromCache(hit,
  latency)`; row = `queryLogEntry({ …, cacheHit: true, generation: zero, verification: zero (latency
  0), baselineTokens: hit.kind === 'answered' ? hit.usage.baselineTokens : null })`. `QueryLogParts`
  gains `cacheHit?: boolean`, `false` when absent, so the existing call sites and
  `tests/unit/explain/usage.spec.ts` do not change.
- Save (the `{ hit }` outcome never reaches it, so a hit is never saved again and its entry keeps
  its hit count): after the second clock read and the aggregated usage, before `saveRow`, when
  `isCacheable(answer)` and `key !== ''` → `saveCacheEntry(projectId, key, toStoredResponse(answer))`
  through `saveCache()` mirroring `saveRow()`: `CacheWriteFailed` → `'store-write-failed'`,
  `ProjectNotFound` → `'project-not-found'`; any other error is kept as `pending`, and then the row is
  written exactly as on the rejection path (`store.saveQueryLog(row).catch(() => undefined)`,
  `explain.ts:151`) and `pending` is thrown, so the row with the spend is written and a failure of the
  row never replaces the save's error (D8 + "Query log"). Only when the save resolved or was mapped
  does `saveRow` run, with its `query_not_logged` mapping; the events get `answer_not_cached`, then
  `query_not_logged`. A hit's row goes through `saveRow` too: a failed row gives the hit the
  `query_not_logged` event as its only event. The `no-evidence` `UNKNOWN` is saved on the same path (it is
  returned from `answerQuestion` as an `UNKNOWN` outcome after the model resolved).
- Events: `ANSWER_NOT_CACHED_CODES = ['store-write-failed', 'project-not-found'] as const` and
  `AnswerNotCachedEvent` in `explain-event.ts`, in the `ExplainEvent` union; `withEvent` appends
  `answer_not_cached` before `query_not_logged`.
- The clock is still read exactly twice (D10): `startedAt` (also `last_hit_at`) and the latency read.
- Evaluation mode: a miss falls to the existing `llm-required` line (D2); `useCache: false` in
  evaluation also lands there (D6). Budget (D11): the lookup precedes any metered model call, so
  `withDailyBudget` is never reached on a hit; on `useCache: false` the `answer` call raises
  `BudgetExhausted` as today.
- D12: the cache stores the finished answer; it never rebuilds the prompt, so the `[TRUNCATED: …]`
  mark and `promptHash` are untouched. D13: a hit writes no claim; duplicates after `useCache: false`
  or an invalidation stay out of scope.

### C7 — Transports (D6, D11)

- `packages/api/src/routes/ask.ts`: add `...(body.useCache !== undefined && { useCache: body.useCache })`
  to the `explain` request (as `tokenBudget`). `schemas/ask.ts`: the `useCache` description says it
  skips the cache lookup when `false` (the `.meta({ default: true })` stays). `ASK_DOMAIN_ERRORS`
  unchanged: `CacheWriteFailed` from a hit record is an unexpected store failure → `500 INTERNAL`.
- `answer_not_cached` events reach `request.log` at `info` (only `evidence_broken` is `error`) and
  the CLI's stderr as `{"level":"info",…}` through the existing per-event code; no transport code
  change beyond the forward.
- CLI `ask`: no code change; it calls `explain` without `useCache` (default `true`).

### C8 — Tests (TDD, every scenario of the five deltas)

- `tests/unit/cache/normalize.spec.ts` (`answer-cache` "Question normalization").
- `tests/unit/cache/response-cache.spec.ts` ("Cacheable answers", "Stored response", "Answer of a
  cache hit"); `tests/support/cached-answer.ts` is a factory (`cachedAnswer(overrides?)`,
  `cachedNoEvidence()`) that returns a fresh object on each call (`backend-standards.md` §7: factories,
  never a shared fixture), used by the explain, API and CLI tests.
- `tests/unit/store/in-memory-store.spec.ts`: "The in-memory double keeps, checks and fails cache
  entries".
- `tests/integration/store/cache-entry.spec.ts` (harness, `createPostgresStore({ transaction: db() })`;
  the concurrent-save and own-connection scenarios use the pool with a unique project name and delete
  it in `finally`, as `graph-write-pool.spec.ts`); `tests/unit/store/postgres-cache-write-errors.spec.ts`
  for the failed-rollback and ended-pool scenarios (template `postgres-query-log-write-errors.spec.ts`).
  The leak scenario forces a rejection whose `detail` quotes the key with a temporary trigger created
  inside the test's transaction (rolled back with it).
- `tests/unit/explain/explain-cache.spec.ts` (new file, `explain` "Answer cache" scenarios and the
  new scenarios of the modified requirements) over `doubles()`; the existing
  `tests/unit/explain/explain.spec.ts` gets only the new scenarios of "Explain request" and
  "Precedence and UNKNOWN answers" if it is where their siblings live.
- `tests/integration/explain/explain.spec.ts`: "A hit over the database counts in its entry and its row".
- Existing tests whose contract this change modifies (each named in the step 11 report): in
  `tests/unit/api/ask.spec.ts`, "Optional fields are forwarded as the use case expects" (D6) and
  "Requests to one API share verification verdicts"; in `tests/integration/explain/explain.spec.ts`,
  "An answer leaves one query log row the daily spend sees"; in
  `tests/unit/explain/explain-verification.spec.ts`, "A valid but irrelevant citation is cited and never
  a fact". The last three ask the same question twice on one store: with the answer cache on by
  default the repeat would be a hit, so the modified scenarios send it with `useCache: false` (they are
  about the verification cache, the prior claims and the daily ceiling, not the answer cache).
  Eight exact call assertions of existing explain tests pin the precedence this change modifies and
  are extended with the cache calls, never filtered (design C5; task 9.2):
  - `tests/unit/explain/explain.spec.ts:306` and `tests/unit/explain/explain-verification.spec.ts:165`:
    `['findCacheEntry', 'findClaimsOverlapping', 'complete', 'saveQueryLog']`;
  - `explain.spec.ts:322` (no-evidence, cacheable): `['findCacheEntry', 'findClaimsOverlapping',
    'complete', 'saveCacheEntry', 'saveQueryLog']`;
  - `explain.spec.ts:769` (a stored answer): `'findCacheEntry'` first and `…, 'saveClaims',
    'saveCacheEntry', 'saveQueryLog']` at the end;
  - `explain-verification.spec.ts:206`: one expected array per run (the invalid-model-output run and
    the no-evidence run now differ);
  - `explain.spec.ts:106, 129, 183` (`calls` compared whole): add `findCacheEntry: 0,
    saveCacheEntry: 0, touchCacheEntry: 0, invalidateCache: 0`.
  The line numbers are those of the propose commit; the implementer re-locates them by test name.
  Two more existing unit tests ask the same cacheable question twice on one store, and their repeat
  would now be a cache hit. They send the repeat with `useCache: false`, because they are about the
  pack's options and the prompt hash, not the answer cache (separate doubles would weaken them: each
  compares two calls over one store):
  - `tests/unit/explain/explain.spec.ts` "builds the pack with the hops and budget of the request":
    the second call (`tokenBudget: 1000`) sends `useCache: false`;
  - `tests/unit/explain/explain-sanitization.spec.ts` "Untrusted text reaches the prompt wrapped and
    unchanged": the second call sends `useCache: false`.
  Neither main scenario describes the repeat, so no spec delta is needed.
- `tests/integration/api/ask.spec.ts`: the three `http-ask` "Ask from the answer cache" scenarios.
- `tests/integration/cli/ask-command.spec.ts`: "Evaluation mode prints a cached answer".
- Mutation: `npm run test:mutation` covers `packages/core/src` (and `cache/` with it); survivors in
  `normalize.ts` and `response-cache.ts` get a RED → GREEN test.

### C9 — Security and privacy

The key (normalized question) is written only to `cache_entry.question_normalized` (local DB, same
policy as `query_log.question`, DIS-74 D3). Errors and events carry codes only (`CacheWriteFailed`
without `cause`; `answer_not_cached` with a closed code). The stored response holds what the answer
already holds (model text, excerpts of the indexed repository); no secret, no new personal data. All
SQL parameterised; every statement filters by `project_id`. Run `/privacy-ethics-check` on the diff.

### C10 — Documentation

`readme.md` §2.4 (evaluation-mode table: exact hit by normalized text; similarity only with CM-HU-19),
§2.5 (6) (cached questions answer with the budget spent), §3 `CACHE_ENTRY` (exact key, one entry per
project and key kept by the store, `question_embedding` unused until CM-HU-19), §4 (`useCache`,
`usage.cacheHit`); `docs/project-context.md` (explain pipeline note "[DIS-21 cache slot]" → the real
step; the `cacheHit: false` line of the usage note → `true` for a hit; the line "until DIS-21 adds the
cache-only degradation" → a cached question is served before any model call, so it answers with the
ceiling spent, while a miss still propagates `BudgetExhausted`/`LlmUnavailable` (D11); the API and CLI `ask` notes "Until DIS-21…" → evaluation mode answers from the cache when an
entry exists, golden entries arrive with DIS-26; the in-memory double's cache API in Testing).

### C11 — The refund demo question keeps `no-anchor` first (D14, spec audit Q1)

The demo question Q6 `¿Cómo se gestionan los reembolsos de un pedido?` (`fixtures/README.md`) has the
search terms `gestionan`/`gesti`, `reembolsos`/`reemb` and `pedido`/`pedid` (`PREFIX_LENGTH` 5 of
`anchor.ts`; `como`, `los`, `se`, `de` and `un` are dropped); no symbol of the acme-shop
seed contains any of them (checked against `seeds/graph-dump.sql`), so it answers `UNKNOWN`
`no-anchor` at step 2, before the cache. Decision (agent as lead engineer): keep D2, `no-anchor`
before the lookup. `no-anchor` already answers that question honestly, with no model call and at no
cost, in both modes, which is what DIS-16 AC 6 asks the evaluator to see ("responde `UNKNOWN` sin
LLM"); its "también está cacheada" is a means, not an observable, and a cache entry would only
duplicate a deterministic answer. Looking the cache up before anchoring would also let a golden
entry answer a project whose graph no longer anchors the question, and would send an unvalidated
project id to the cache. The `no-evidence` caching (D4) stays for questions that anchor but have no
basis in the code. DIS-26 records that Q6 needs no golden entry while it does not anchor. Recorded in
the DIS-21 `[enhanced]` description as D14.

## Risks / Trade-offs

- **No unique key in the database** (C4) → duplicates are possible only from writes outside the store
  (seed scripts, manual SQL); the read picks the newest and the next save collapses them. A unique
  index can be added by a later migration without changing the port. Accepted (D).
- **Advisory lock hash collisions** (C4) → two different (project, key) pairs may share a 64-bit hash
  and serialise each other's saves; correctness holds, only throughput is affected. Accepted (D).
- **Normalization collisions** (`año`/`ano`, C1) → accepted product risk (D1): a collision needs two
  questions that differ only in an accent or `ñ`, and no two of the demo questions of
  `fixtures/README.md` share a key. Accepted (D).
- **A cached answer can outlive the code it cites** until the project is reindexed and DIS-9 calls
  `invalidateCache` → today the only way to change an indexed project is a new project (no reindex),
  so no stale hit can occur in this delivery; DIS-9 owns the call (B, PH-07).
- **Cached prior claims are a snapshot** (D5) → a hit shows the prior claims seen when the answer was
  produced, not the claims stored since (including the answer's own). Consistent with "the same
  answer"; the CLI and `/ask` do not hide it. Accepted (D).
- **`hit_count` is `integer`** → overflow after 2³¹ hits on one entry; unreachable locally. Accepted (D).
- **A golden response written by hand that fails the schema is silently a miss** (D5) → no event, so
  the evaluator sees `llm-required`; CM-HU-14.1 (`verify`) checks golden fingerprints and DIS-26 builds
  them through `toStoredResponse` (B, DIS-26 / CM-HU-14.1).
- **A degraded verification is cached as it is** (D4; adversarial review AR1) → an answer whose
  semantic check could not run (verifier unavailable, budget spent, verify call limit) is stored with
  its statements `cited`/`INFERENCE` and served until replaced or invalidated, without retrying the
  verifier. Nothing false is served (the types and the confidence stay honest); a live caller
  refreshes the entry with `"useCache": false`, and DIS-9 invalidates on reindex. Accepted (D).
- **A hit does not repeat the events of the first answer** (D5; adversarial review AR2) → the
  sanitisation and `entailment_unverified` log lines are written once, for the call that produced
  the answer, not for each hit; the response body never carried them. Accepted (D).
- **Any caller can replace an entry** (security review, Low; adversarial review AR3) → with a live
  model, `"useCache": false` replaces the key's entry with a new pipeline-checked answer, at the same
  trust level as every other write of the unauthenticated local API. Protecting golden entries, if
  needed, is DIS-26's decision. Accepted (D).

## Migration Plan

No migration, no new variable, no new dependency. The port gains four methods (every `StorePort`
implementation — the Postgres adapter and the in-memory double — implements them in this change).
Rollback is reverting the commits; entries already written stay in `cache_entry` and are harmless
(nothing reads them after a revert) and are deleted with their project.

## Open Questions

None: D1–D14 and the post-audit amendments are recorded in the DIS-21 `[enhanced]` description.

## Follow-ups

Every finding of the spec audit and the pre-merge checks is fixed in this change or gets an A/B/C/D
destination here (`docs/project-context.md` → Tracking deferred findings).

- **B — DIS-9 (CM-HU-05b.2)** calls `invalidateCache(projectId)` at the end of every indexing (PH-07).
- **B — DIS-26**: loading the golden entries must not turn the `http-ask` seed scenarios "Evaluation
  mode answers UNKNOWN llm-required over the seed" and "A spent daily budget stops the model over the
  seed" into cache hits: either keep the golden load out of `loadSeed` for those suites, or modify the
  two scenarios to use an uncached anchored question (e.g. `¿Qué hace CouponValidator?`). Q6 needs no
  golden entry while it does not anchor (D14; pinned by the `http-ask` scenario "The refund demo
  question answers no-anchor without the model over the seed").
- **B — DIS-26** builds the acme-shop golden entries with `normalizeQuestion` + `toStoredResponse` and
  loads them in `db:seed`; **B — CM-HU-14.1** checks their fingerprint.
- **D** — the accepted risks above.

CI (PR #47, `quality` job, run `38990401555`), 2026-10-17 — **A**, fixed in this change: "Concurrent
saves of one key leave one entry" (`tests/integration/store/cache-entry.spec.ts`) failed once under the
full suite's load with one of the six saves rejected. The job's Postgres log showed the real cause: a
genuine `deadlock detected` (`40P01`) between one save's implicit foreign-key check on the `project` row
(`INSERT INTO cache_entry ... SELECT p.id ... FROM project p WHERE p.id = $1`, which takes a `FOR KEY
SHARE` lock) and an unrelated concurrent `DELETE FROM project` from another test file's cleanup — a
known Postgres interaction between FK locks and deletes on the referenced table, not a bug in the
cache's own serialisation (the `pg_advisory_xact_lock` already serialises the six saves against each
other; this deadlock involves a seventh, unrelated transaction). `atomically` (own connections only) now
retries `work` on a fresh connection, up to three attempts, when the rollback succeeded and the error is
`40P01` (deadlock) or `40001` (serialization failure); any other error, or a failed rollback, is mapped
and thrown as before, unchanged. New tests: `tests/unit/store/postgres-cache-write-errors.spec.ts` "A
deadlocked cache write retries on a fresh connection and succeeds" and "A deadlock that keeps recurring
still fails as an opaque cache write error". `npx vitest run` (1492 tests), `npm run lint`, `npm run
typecheck`, `npm run lint:architecture` and `npm run docs:coverage` all green afterwards (see the step 11
report's CI addendum for the run links).

Spec audit (`reports/2026-10-17-spec-audit.md`), run 1 (CHANGES REQUIRED) — all **A**, fixed in this
change's artifacts on 2026-10-17:

- B1: three main-spec scenarios that ask the same question twice on one store are modified to send
  the repeat with `useCache: false` (`explain` "Query log" and "Answer with typed statements",
  `http-ask` "Ask events and verification verdicts"); proposal Impact, C8 and tasks 6.9, 7.1 and 9.2
  name the four edited tests (M8).
- B2: a stored `usage.savingsPct` may be negative; B3: an answer's evidence `excerpt` must be a string
  (only prior-claim evidence may be `null`) — `answer-cache` "Stored response" and C2.
- B4: a non-mapped cache save error is thrown after a row write that can never replace it (C6;
  scenario "Other cache write errors propagate after the row" extended).
- M1: new scenario "A hit whose row is not written still answers and says so". M2: the hit scenario
  checks the two clock reads. M3: the empty-key rule is marked as a guard. M4: the failing `SAVEPOINT`
  case added to the rollback scenario. M5: wording of C4 and Risks. M6: the double stores a JSON round
  trip. M7, M11, M12: C5 and task 3.3. M9: `cached-answer.ts` is a factory. M10: C10 and task 14.2
  list the two stale `project-context.md` lines. M13: casts in the advisory lock. M14: C1 explains why
  the key does not reuse `anchor.ts`; the write-error mappers fold in task 10.1. M15: tasks 4.3 and
  6.5 split. M16: manual step 12.4 adds the unknown-project call. M17 and Q2: tasks 16.1 and 16.9
  cite the ADR and say who merges.
- Q1: decided in C11 (D14).

Spec audit run 2 (CHANGES REQUIRED) — all **A**, fixed in this change's artifacts on 2026-10-17:
N1 (the eight exact `order`/`calls` assertions are extended, never filtered: C5, C8, proposal Impact,
task 9.2; `QueryLogParts.cacheHit` optional), N2 (new `http-ask` scenario pinning D14 over the seed,
task 7.3), N3 (a hit is never saved again: `explain` "Answer cache" → Save, C6), N4 (D1–D14 and
C1–C11 everywhere), N5 (tasks 16.1/16.9 say where the ADR lives), N7 (task 10.1 covers the mapper
fold), N9 (B follow-up for DIS-26 above).

Spec audit run 3 (CHANGES REQUIRED) — all **A**, fixed in this change's artifacts on 2026-10-17: P1
(two more repeated-question unit tests send the repeat with `useCache: false`: C8, proposal Impact,
tasks 6.9 and 9.2), P2 (the 5-character prefixes in C11), P3 (the source-reader count sentence of
"Precedence and UNKNOWN answers"), P4 (C8 and proposal counts of the `http-ask` cache scenarios).

Spec audit run 4 (APPROVED) — improvable findings, all **A**, folded by the main session on
2026-10-17: Q1 (the count of edited tests in task 9.2), Q2 ("rare" removed from `answer-cache`
"Question normalization").

Pre-merge checks (task 16.4–16.7, 2026-10-17): `reports/2026-10-17-show-spec-working.md` (demonstrably
working; no finding), `reports/2026-10-17-verify-against-spec.md` (CONFORMS),
`reports/2026-10-17-adversarial-review.md` (PASS) and `reports/2026-10-17-security-review.md` (PASS):

- **A**, fixed in this change: V1 ("A failed cache write still answers…" now compares every field of
  each answer but its events with the reference answer), V2 ("A hit whose row is not written…" now
  checks the exact hit of the stored response), V3 (the zero verification counters of the cached
  `UNKNOWN`'s row), V4 (the normalization test writes its full-width and `İ` inputs as escapes, as its
  comment says), V5 (`FIND_CACHE_ENTRY` no longer selects the unused `project_id`), AR4 (Major: the
  integration test "Saving a key again replaces its entry" picked the other key's entry by row order,
  which falls back to the random id inside one transaction; it now picks it by key).
- **D**, accepted (Risks above): AR1 (a degraded verification is cached as it is), AR2 (a hit does not
  repeat the events of the first answer), AR3 / security Low (any caller can replace an entry with
  `"useCache": false`).
