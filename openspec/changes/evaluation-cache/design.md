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

The DIS-21 `[enhanced]` description fixes D1–D13 (agent as lead engineer, autonomous-run ADR
`20261016-autonomous-workflow-run-entrega-2`, reviewable by the author). This design turns them into
units C1–C10.

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
  `endLine ≥ startLine`, and `warning` present iff `status === 'stale'` on prior claims. `usage.cacheHit`
  is `z.literal(false)`: a stored usage is always the original one.
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
  `SELECT pg_advisory_xact_lock(hashtextextended($1 || ':' || $2, 0))` (key = project id + key, the
  lock is released with the transaction; on a caller transaction it lasts until that transaction
  ends, which is the harness's per-test rollback — harmless), then
  `DELETE FROM cache_entry WHERE project_id = $1 AND question_normalized = $2`, then
  `INSERT INTO cache_entry (project_id, question_normalized, response) SELECT id, $2, $3::jsonb FROM
  project WHERE id = $1` (`rowCount` 0 → `ProjectNotFound`, as `saveQueryLog`). The response is sent as
  `JSON.stringify(response)`.
  - *Alternative:* a unique index `(project_id, question_normalized)` + `ON CONFLICT DO UPDATE`.
    Simpler SQL, but needs migration 0005 and its rollback tests, and binds CM-HU-19's similarity
    cache to a uniqueness it may not want. Rejected for now (D3); revisitable by a migration later.
  - *Alternative:* `SERIALIZABLE` transaction. Rejected: retry logic on serialization failures.
- `touchCacheEntry`: inside `atomically`, one statement
  `WITH p AS (SELECT id FROM project WHERE id = $1), u AS (UPDATE cache_entry SET hit_count =
  hit_count + 1, last_hit_at = $3 WHERE id = $2 AND project_id = $1 RETURNING 1) SELECT (SELECT count(*)
  FROM p) AS project, (SELECT count(*) FROM u) AS touched` — no project → `ProjectNotFound`; 0 touched →
  resolve (D3: replaced or invalidated meanwhile).
- `invalidateCache`: inside `atomically`, the same CTE shape with `DELETE … RETURNING 1`, resolving to
  the deleted count.
- `toCacheWriteError`: a `DomainError` passes; anything else → `new CacheWriteFailed()`.
- The `0002` comment "no unique key… CM-HU-13 decides" stays true; the decision is recorded here and
  in `readme.md` §3.

### C5 — In-memory double — `tests/support/in-memory-store.ts`

Same checks in the same order (shared asserts of C3, then the project), entries in a `Map` keyed by
project id → list of `{ id, key, response, hitCount, lastHitAt, createdAt }` (a list so a test can
seed duplicates and invalid responses), `calls.findCacheEntry/saveCacheEntry/touchCacheEntry/
invalidateCache` counted before any check (as the other counters), `cacheEntries(projectId?)` to
read, `seedCacheEntry({ projectId, key, response, hitCount?, createdAt? })` to seed, and
`failCacheCall?: { find?, save?, touch?, invalidate? }: () => unknown` (the `failQueryLogWrite`
pattern) to inject failures. Ids come from the double's existing deterministic id source. Graph
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
  gains `cacheHit: boolean` (default call sites pass `false`).
- Save: after the second clock read and the aggregated usage, before `saveRow`, when
  `isCacheable(answer)` and `key !== ''` → `saveCacheEntry(projectId, key, toStoredResponse(answer))`
  through `saveCache()` mirroring `saveRow()`: `CacheWriteFailed` → `'store-write-failed'`,
  `ProjectNotFound` → `'project-not-found'`, anything else rethrown **after** the row: implemented as
  `const cacheCode = await saveCache(…).catch(error => { pending = error; })`, then `saveRow`, then
  `if (pending) throw pending`, so the row with the spend is written (D8 + "Query log": spend after a
  resolved call must reach the ceiling). The `no-evidence` `UNKNOWN` is saved on the same path (it is
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
  cache hit"); a valid stored answered response fixture is built once in
  `tests/support/cached-answer.ts` (also used by the explain, API and CLI tests).
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
- `tests/unit/api/ask.spec.ts`: the modified "Optional fields are forwarded as the use case expects"
  (the one existing test whose contract changes, D6). `tests/integration/api/ask.spec.ts`: the two
  `http-ask` "Ask from the answer cache" scenarios.
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
step; the API and CLI `ask` notes "Until DIS-21…" → evaluation mode answers from the cache when an
entry exists, golden entries arrive with DIS-26; the in-memory double's cache API in Testing).

## Risks / Trade-offs

- **No unique key in the database** (C4) → duplicates are possible only from writes outside the store
  (seed scripts, manual SQL); the read picks the newest and the next save collapses them. A unique
  index can be added by a later migration without changing the port. Accepted (D).
- **Advisory lock hash collisions** (C4) → two different (project, key) pairs may share a 64-bit hash
  and serialise each other's saves; correctness holds, only throughput is affected. Accepted (D).
- **Normalization collisions** (`año`/`ano`, C1) → accepted product risk (D1); questions about code
  rarely differ only in an accent. Accepted (D).
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

## Migration Plan

No migration, no new variable, no new dependency. The port gains four methods (every `StorePort`
implementation — the Postgres adapter and the in-memory double — implements them in this change).
Rollback is reverting the commits; entries already written stay in `cache_entry` and are harmless
(nothing reads them after a revert) and are deleted with their project.

## Open Questions

None: D1–D13 are recorded in the DIS-21 `[enhanced]` description.

## Follow-ups

Every finding of the spec audit and the pre-merge checks is fixed in this change or gets an A/B/C/D
destination here (`docs/project-context.md` → Tracking deferred findings).

- **B — DIS-9 (CM-HU-05b.2)** calls `invalidateCache(projectId)` at the end of every indexing (PH-07).
- **B — DIS-26** builds the acme-shop golden entries with `normalizeQuestion` + `toStoredResponse` and
  loads them in `db:seed`; **B — CM-HU-14.1** checks their fingerprint.
- **D** — the accepted risks above.
