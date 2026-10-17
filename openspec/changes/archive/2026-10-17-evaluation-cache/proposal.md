## Why

`explain` (DIS-39, with verification by DIS-68/DIS-70, confidence by DIS-72 and usage by DIS-74) and
its two transports, the CLI `ask` (DIS-40) and `POST /api/projects/{projectId}/ask` (DIS-78), call the
model for every question, even one already answered, and in evaluation mode (no `LLM_BASE_URL`, the
closed decision of `docs/project-context.md`) they answer `UNKNOWN` / `llm-required` to every question,
the sample ones included. The table `cache_entry` exists since migration 0002, but nothing reads or
writes it: `explain` keeps a marked slot for the answer cache between anchoring and the evaluation-mode
check, `usage.cacheHit` is always `false`, and `/ask` validates `useCache` without effect.

This is DIS-21 (CM-HU-13.1), the first sub-issue of CM-HU-13 (DIS-16, "Caché de evaluación"). Its user
story: "Como persona que evalúa CODEMIND (sin cuenta de LLM o con el techo diario agotado) o que repite
una pregunta ya contestada, quiero que `explain` (CLI `ask` y `POST /api/projects/{projectId}/ask`)
sirva desde la caché la respuesta guardada para la misma pregunta normalizada del mismo proyecto, sin
llamar al modelo y a coste cero, y que una pregunta no cacheada en modo evaluación me diga claramente
que necesita un LLM, para probar el producto sin gasto y no pagar dos veces la misma respuesta." Its
DoD: tests of a hit with case and punctuation variants; a miss in evaluation mode answers `200`
`UNKNOWN` with `reason` and no model call; `invalidateCache` leaves the project without entries.

It is the base the rest of CM-HU-13 needs: the golden answers of acme-shop (DIS-26) are cache entries,
and the reindex of DIS-9 (Entrega 3) calls `invalidateCache` (PH-07). The decisions D1–D14 (and the post-audit amendments of D3, D5, D6 and
D8) were taken by the agent as lead engineer in the autonomous run of Entrega 2 (ADR
`20261016-autonomous-workflow-run-entrega-2`) and recorded in the DIS-21 `[enhanced]` description on
2026-10-17; the author reviews them afterwards.

## What Changes

- New module `packages/core/src/cache/` (exported from `@codemind/core`):
  - `normalizeQuestion(question)`: NFKD, combining marks removed, lower case without locale, every
    punctuation and symbol character replaced by a space, Unicode whitespace collapsed and trimmed (D1);
  - which answers are cacheable: a stored answer (`persisted: true`) with no `stale` statement, and an
    `UNKNOWN` with reason `no-evidence` (D4);
  - the stored response: the answer without its `events`, checked on read by a strict Zod schema; an
    entry that fails it is a cache miss (D5);
  - the answer of a hit: the stored answer with this call's usage (zero tokens and cost, the stored
    baseline, this call's latency, `cacheHit: true`) and no events (D7).
- `StorePort` gains `findCacheEntry`, `saveCacheEntry`, `touchCacheEntry` and `invalidateCache`, with
  their SQL in `store-postgres` and their behaviour in the in-memory double; one entry per (project,
  normalized question), kept by the store without a new migration (D3, D9). New domain error
  `CacheWriteFailed` (code `CACHE_WRITE_FAILED`), without the database's text.
- `explain`:
  - the request accepts `useCache` (boolean, default `true`); `false` skips the lookup but still saves
    the new answer, which replaces the entry (D6);
  - after anchoring and before the evaluation-mode check, unless `useCache` is `false`, the normalized
    question is looked up; a valid entry answers from the cache with no pack, no prior-claims read, no
    model call and no claim write, and its hit is recorded (`hit_count + 1`, `last_hit_at`) (D2);
  - a miss continues as today: `llm-required` in evaluation mode; in live mode a cacheable answer is
    saved after the claim write and before the `query_log` row;
  - a failed save does not lose a paid answer: new event `answer_not_cached` with a closed code (D8);
  - `usage.cacheHit` and the `query_log` row's `cache_hit` are `true` for a hit, with zero tokens and
    cost (D7, D10).
- `POST /api/projects/{projectId}/ask` forwards `useCache` when it is sent; a cached question answers
  `200` even with the daily budget spent; with `useCache: false` or an uncached question the spent
  budget still answers `429` `BUDGET_EXHAUSTED` with `cacheOnly: true` (D11).
- The CLI `ask` answers from the cache like any answer (no new flag).
- Docs: `readme.md` §2.4, §2.5 (6), §3 `CACHE_ENTRY`, §4 (`useCache`, `cacheHit`);
  `docs/project-context.md` (explain, API and CLI `ask` notes).

## Capabilities

### New Capabilities

- `answer-cache`: the normalization of a question into its cache key, which answers can be cached,
  the shape of a stored response and how it is checked on read, and the answer and usage of a cache
  hit.

### Modified Capabilities

- `explain`: "Explain request" (`useCache`), "Precedence and UNKNOWN answers" (step 3, the cache
  lookup), "Explain events and logging" (`answer_not_cached`), "Answer usage" (`cacheHit` of a hit),
  "Query log" (`cache_hit` of a hit; the repeat of its daily-spend scenario sends `useCache: false`),
  "Answer with typed statements" (the repeat of its irrelevant-citation scenario sends
  `useCache: false`); new requirement "Answer cache" (lookup, hit, save, failures).
- `graph-store`: new requirement "Answer cache entries" (`findCacheEntry`, `saveCacheEntry`,
  `touchCacheEntry`, `invalidateCache`, their checks, errors and transaction behaviour, and the
  in-memory double).
- `http-ask`: "Ask request validation" (`useCache` forwarded and effective), "Ask events and
  verification verdicts" (its repeated requests send `useCache: false`); new requirement "Ask from the
  answer cache" (a hit over the seed, the spent budget, and the refund demo question answering
  `no-anchor` without the model, D14).
- `cli-ask`: new requirement "Ask from the answer cache" (a cached answer printed in evaluation mode).

## Impact

- Code: `packages/core/src/cache/{normalize,response-cache,index}.ts` (new);
  `packages/core/src/explain/{explain,explain-request,explain-answer,explain-event,usage}.ts`;
  `packages/core/src/ports/StorePort.ts`; `packages/core/src/knowledge/errors.ts`
  (`CacheWriteFailed`); `packages/core/src/index.ts`;
  `packages/adapters/store-postgres/src/postgres-store.ts` (four methods and their SQL);
  `packages/api/src/routes/ask.ts` (forwards `useCache`), `packages/api/src/schemas/ask.ts` (the
  `useCache` description). The CLI `ask` code does not change.
- Database: no migration. `cache_entry` (0002) and its project index (0003) are used as they are;
  `question_embedding` stays `NULL`.
- Tests: `tests/unit/cache/normalize.spec.ts`, `tests/unit/cache/response-cache.spec.ts`,
  `tests/integration/store/cache-entry.spec.ts`, new scenarios in `tests/unit/explain/`,
  `tests/unit/store/in-memory-store.spec.ts`, `tests/integration/explain/explain.spec.ts`,
  `tests/unit/api/ask.spec.ts`, `tests/integration/api/ask.spec.ts` and
  `tests/integration/cli/ask-command.spec.ts`. Four existing tests change because their contract
  changes: `http-ask` "Optional fields are forwarded as the use case expects" (`useCache` is now
  forwarded, D6), and three scenarios that ask the same question twice on the same store, whose repeat
  would now be a cache hit and is sent with `useCache: false`: `explain` "An answer leaves one query
  log row the daily spend sees" (`tests/integration/explain/explain.spec.ts`) and "A valid but
  irrelevant citation is cited and never a fact" (`tests/unit/explain/explain-verification.spec.ts`),
  and `http-ask` "Requests to one API share verification verdicts" (`tests/unit/api/ask.spec.ts`).
  The exact call-order and call-count assertions of eight existing explain tests are extended with
  the cache calls (`tests/unit/explain/explain.spec.ts` and `explain-verification.spec.ts`, design
  C8): the precedence they pin now includes the lookup and the save. Two more existing unit tests
  that repeat a cacheable question on one store send the repeat with `useCache: false`: "builds the
  pack with the hops and budget of the request" (`explain.spec.ts`) and "Untrusted text reaches the
  prompt wrapped and unchanged" (`explain-sanitization.spec.ts`).
- Dependencies: none new.
- Security and privacy: the normalized question is stored only in `cache_entry.question_normalized`,
  the same local-database policy as `query_log.question` (DIS-74 D3); it never reaches a log, an
  event or an error. Every statement is parameterised; every read and write is scoped by project. A
  hit sends nothing to the model. No new personal data.
- Commands and constraints: as in `docs/project-context.md` (`npx vitest run`, `npm run typecheck`,
  `npm run lint`, `npm run lint:architecture`, `npm run test:mutation`, `npm run docs:coverage`,
  `npm run db:migrate`).

### Non-goals

- Golden answers: generating or loading `seeds/cache/*.json`, `scripts/cache-build.mjs`, loading
  them in `db:seed` (DIS-26); their human review (DIS-34); checking their fingerprint (CM-HU-14.1).
- Similarity hits and filling `question_embedding` (CM-HU-19, PH-04).
- Calling `invalidateCache` from indexing: there is no reindex today; DIS-9 (CM-HU-05b.2) calls it
  (PH-07).
- Time-based expiry, caching `impact` (CM-HU-16) or verifications (they have their own cache), a cache
  hit rate in the UI (CM-HU-19), a cache flag in the CLI.
- Deduplicating claims written again after `useCache: false` or after an invalidation (D13).
- A migration or a unique key on `cache_entry` (D3).
