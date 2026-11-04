## Context

See `proposal.md` → Why. The facts that shape the approach (reality map of Linear DIS-69, checked on
`final-project-CRN` at `7c9ede5`, after the merge of DIS-67):

- `query_log` holds one row per `explain`, `impact` and `drift` call, with `capability` and
  `cache_hit` (`explain` → "Query log"). A cached answer, exact or by similarity, writes a row with
  `cache_hit = true`; every other `explain` answer, `UNKNOWN` included, writes one with `false`. The only
  aggregate read today is `SUM_COST_SINCE`. `query_log_project_id_idx` exists since migration `0003`.
- Every project-scoped read of `packages/adapters/store-postgres/src/postgres-store.ts` goes through
  `runProjectQuery`: the SQL starts from the `project` row, so zero rows means `ProjectNotFound`, and a
  malformed id fails before any statement.
- `POST /api/projects/{projectId}/ask` (`packages/api/src/routes/ask.ts`) resolves the project with
  `app.deps.store.getProject`, calls `explain`, logs its events and returns `toPublicAnswer(explained)`.
  `askUsageSchema` mirrors core's `AnswerUsage`; `tests/unit/web/api-contract.spec.ts` forces the web
  client's `AskUsage` to equal the API type.
- `projects` (`packages/cli/src/commands/projects.ts`) lists inside a transaction it always rolls back,
  with an injectable `listProjects(client)` seam; `formatProjectLine(project)` writes one line.
- Golden files (`packages/cli/src/cache/golden-file.ts`): `goldenFileSchema` is strict, the canonical
  render is `JSON.stringify(value, null, 2)` plus a final LF; `checkGoldenFile` is shared by `db:seed`,
  `cache:build` and `verify`. `seed-load.ts` saves each entry with `saveCacheEntry(projectId, key,
  response)` (no embedding); `saveCacheEntry` accepts an optional embedding since DIS-67.
- `cache:build` cannot regenerate the golden answers with the local `qwen2.5-coder` (DIS-67 E2), and
  every regenerated answer would need a new signed independent review (DIS-110 rule).
- Calibration of DIS-67 with `nomic-embed-text` (`openspec/changes/archive/2026-11-04-semantic-cache/
  reports/2026-11-03-11-manual-interface-testing.md`): «Explícame el cálculo del precio final» against
  the price question is 0.8321, below the 0.85 threshold; «¿Cómo se calcula el precio total de un
  pedido?» is 0.9260.
- Seed fingerprint inputs include `packages/core/src/knowledge` and `packages/adapters/store-postgres/
  src` (`docs/project-context.md` → seed build), so this change refreshes the seed fingerprints as
  DIS-67 E1 did. No input of `ANSWER_FINGERPRINT_FILES` changes.

## Goals / Non-Goals

**Goals:**

- One definition of the hit rate, computed in the core and read with one statement per project.
- The same figure in the API, the web and the CLI, read after the current call was logged.
- Golden vectors added without regenerating or re-reviewing any golden answer.

**Non-Goals:**

- No change to `explain`, `AnswerUsage`, the stored response, `answer-cache` or the similarity step.
- No new route, migration, index or dependency.
- No embedding of the drift golden entries (they are never looked up by similarity: `drift` has no
  similarity step).

## Decisions

**S1 — The metric is a pure core function over two counts.** `packages/core/src/cache/hit-rate.ts`
exports `cacheHitRate(counts: ExplainQueryCounts): ProjectCacheHitRate`, `ProjectCacheHitRate =
{ queries, cacheHits, hitRatePct: number | null }`, exported from `cache/index.ts`. `hitRatePct` is
`Math.round(cacheHits * 1000 / queries) / 10` (integer tenths, a half up as `savingsPct` does; both
operands are integers below 2³¹, so the product is exact). Impossible counts throw a `RangeError` with a
fixed message (the store never returns them; the check pins the contract and gives Stryker something
to kill). `ExplainQueryCounts = { queries, cacheHits }` lives next to `QueryLogEntry` in
`packages/core/src/knowledge/query-log.ts`, the module of the rows it counts. *Alternative rejected:*
computing the percentage in SQL — it would duplicate the rounding rule in two places and the in-memory
double would need a third copy.

**S2 — One counting statement from the project row.** `StorePort.countExplainQueries(projectId):
Promise<ExplainQueryCounts>`, with `COUNT_EXPLAIN_QUERIES` in `queries.ts`:

```sql
SELECT count(q.id)::int AS queries,
       (count(q.id) FILTER (WHERE q.cache_hit))::int AS cache_hits
  FROM project p
  LEFT JOIN query_log q ON q.project_id = p.id AND q.capability = 'explain'
 WHERE p.id = $1
 GROUP BY p.id
```

run through `runProjectQuery`, so a malformed id fails before any statement and a missing project
returns no row (`ProjectNotFound`), as `FIND_CACHE_ENTRY` does. `'explain'` is a literal of the closed
capability set, not user input. The in-memory double (`tests/support/in-memory-store.ts`) counts its
kept `queryLog` rows, adds `calls.countExplainQueries` and a `failCountExplainQueries?: () => unknown`
option raised after the checks. Every other `StorePort` double that `npm run typecheck` reports gains
the method (throwing, or delegating to the in-memory double where an app is built over it).
*Alternative rejected:* `cache_entry.hit_count` — no denominator, and it is lost when a reindex
invalidates the cache (F1).

**S3 — The route reads the counts, not the use case.** In `registerAskRoute`, after `explain` returned
and its events were logged, and only when `explained.kind !== 'unknown'`, the route calls
`app.deps.store.countExplainQueries(project.id)` and `cacheHitRate(...)`, and passes the result to
`toPublicAnswer(explained, projectCache)`, whose second parameter is used only for an answered answer.
The route holds no SQL (it satisfies `GUARD_DB_IN_HTTP`); `explain` stays untouched, so neither the
golden answer fingerprint nor the stored response changes. A rejection of the read propagates to the
error handler: `500 INTERNAL` (no domain mapping). `askUsageSchema` gains `projectCache:
z.strictObject({ queries: z.int().min(0), cacheHits: z.int().min(0), hitRatePct: z.number().min(0).max(100).nullable() })`
and its TSDoc changes from "exactly the fields of core's `AnswerUsage`" to "the fields of core's
`AnswerUsage` plus the project's cache hit rate". *Alternative rejected:* adding the field to core's
`AnswerUsage` — its stored form is strict, so every golden answer would have to be regenerated (F3).

**S4 — Web line under the baseline line.** `usage-display.ts` gains `projectCacheLine(projectCache)`,
reusing `groupDigits` of `project-display.ts`; `hitRatePct` is written with `String(value)` (the API
sends at most one decimal, so `40` stays «40» and `33.3` «33.3»). `UsagePanel.tsx` renders it in a `<p>`
under the baseline line with the muted text colour already used by the panel. `AskUsage` in
`packages/web/src/services/api-client.ts` gains `projectCache`; the type-level contract test keeps the
two sides equal.

**S5 — CLI field through a second seam.** `ProjectsCommandDeps` gains `countExplainQueries?: (client,
projectId) => Promise<ExplainQueryCounts>`, defaulting to `createPostgresStore({ transaction: client
}).countExplainQueries`. `runProjectsCommand` reads the counts project by project on the same
transaction, before the rollback, and `formatProjectLine(project, counts)` writes `cache h/q (p%)` or
`cache 0/0` with `p` = `String(cacheHitRate(counts).hitRatePct)`. A rejected read is the command's
`INTERNAL`.

**S6 — `questionEmbedding` is a mandatory key; `format` stays `1`.** The schema entry gains
`questionEmbedding: z.array(z.number()).length(EMBEDDING_DIMENSIONS).refine(usable).nullable()`
between `questionNormalized` and `response` (usability shared with `usableVector` of
`semantic-cache` through a small exported check, so the rules cannot drift), and `GoldenEntry` gains
`questionEmbedding: number[] | null`. The canonical render is unchanged in its rule: two-space JSON,
so each component sits on its own line (about 768 lines per entry). `format` stays `1`: the only files
of the format are the two versioned ones, migrated in this change, and no reader of another version
exists. *Alternatives rejected:* an optional key (two shapes for one meaning and a canonical render
that depends on presence); a compact one-line vector (a second render rule for one key); `format: 2`
(touches every format check and the seed-load scenario that rejects `2`, for no reader).

**S7 — `npm run cache:embed` (`packages/cli/src/cache-embed.ts`).** Shaped like `cache-build.ts`:
`runCacheEmbed(argv, deps)` returns the exit code and never touches `process`; seams `env`, `stdout`,
`stderr`, `repoRoot` (golden directory under it), `createLlm` and `write` (defaults: `createLlm` of
`@codemind/adapter-llm`, `writeAtomically`). Order: arguments → `llmConfigFromEnv` (the `ask` reading:
`LLM_CONFIG_INVALID`; evaluation mode → `MISSING_CONFIG LLM_BASE_URL`) → `LLM_EMBED_MODEL` trimmed →
read and check every requested golden file (`readGoldenFile` + `checkGoldenFile` with the golden
project names as the seed's) → per project, `llm.embed([questionNormalized])` per entry, then
`usableVector` (an unusable result becomes `new LlmUnavailable('invalid-response')`) → render with the
vectors replaced → `writeAtomically` → the line. Failures map with `toFailure` of `commands/ask.ts` for
`LlmUnavailable`; `INVALID_SEED` reuses the `db:seed` message. The default request function (not
`longFetch`) and `LLM_TIMEOUT_MS` apply: an embedding is short. No database, no budget meter. Script in
`package.json`: `"cache:embed": "tsx --import=./scripts/load-env.mjs --tsconfig
packages/cli/tsconfig.run.json packages/cli/src/cache-embed.ts"`.

**S8 — `cache:build` writes `null` for what it regenerates.** A regenerated entry gets
`questionEmbedding: null`; a kept entry is copied as it is, vector included. After a regeneration the
coherence test fails until `cache:embed` runs, which is the intended reminder (R4). *Alternative
rejected:* embedding inside `cache:build` — it would add `LLM_EMBED_MODEL` to a command the local model
already cannot complete (DIS-67 E2).

**S9 — `db:seed` passes the vector.** `saveGoldenAnswers` calls `saveCacheEntry(projectId,
entry.questionNormalized, entry.response, entry.questionEmbedding ?? undefined)`; the drift entries are
saved as today. The similarity lookup then treats a golden entry like any live entry; evaluation mode
never embeds (PH-04), so the vectors change nothing without `LLM_EMBED_MODEL`.

**S10 — The versioned vectors come from a live `cache:embed` run.** With Ollama and
`nomic-embed-text` (768) at `http://localhost:11434/v1`, the agent runs `cache:embed` once; the diff
of `seeds/cache/*.json` must only add the `questionEmbedding` lines (checked by the coherence test and
by a scripted comparison with the previous files with the key removed). No golden response or review
changes, so the DIS-110 r2 signatures stay valid and no panel round is needed (F6). If Ollama or the
model is unavailable, the ticket stops cleanly: the coherence requirement cannot be met with invented
vectors.

**S11 — Seed fingerprints refreshed as DIS-67 E1 (F8).** After the store and `core/knowledge` edits:
`npm run seed:build`, then the same `seed.analyzerFingerprint` in `seeds/cache/acme-shop.json`,
`seeds/cache/task-api.json`, `seeds/drift/acme-shop.json` and `docs/measurements/graph-quality.json`
(header fingerprint lines only); no `cache:build`. `seeds/graph-dump.sql` rows must not change.

**S12 — Demo rephrasing.** The ticket's AC5 names «Explícame el cálculo del precio final», which
measured 0.8321 with `nomic-embed-text` in DIS-67 (below 0.85); the demo and the manual check use
«¿Cómo se calcula el precio total de un pedido?» (0.9260). The spec scenario of `seed-load` uses a
scripted embedding, so it does not depend on the measured value.

**S13 — Manual checks on a scratch database.** The live checks (`db:seed` with vectors, the similarity
hit over the seeded golden entry, `projects`, the API) run against a scratch database
`codemind_dis69` created, migrated, seeded and dropped by the agent, never with `db:seed` on the shared
local database (DIS-67 10.9 rule). The PowerShell captures of `docs/DEMO.md` use the same database
URL on the command line.

**S14 — Spec placement.** The metric in `semantic-cache`, the read in `graph-store`, the command in
`golden-answers`, the exposure in `http-ask`, `ask-page` and `cli-projects`, the load in `seed-load`.
Main specs change only through `/opsx:archive` of these deltas; no direct edit of
`openspec/specs/` is planned.

## Risks / Trade-offs

- **R1 — False similarity hits stay (F9).** «¿Cómo se calcula el envío de un pedido?» (0.8745) is still
  served from the price answer; with seeded vectors it can now happen right after `db:seed`. → The
  metric makes it visible; a recalibration needs a `semantic-cache` change with its own audit.
  Accepted (D).
- **R2 — Counts above 2³¹ − 1 fail the `::int` cast.** → Far beyond the project's volumes; the error
  surfaces as `500`/`INTERNAL`, not a wrong figure. Accepted (D).
- **R3 — The vectors belong to `nomic-embed-text`.** Another 768-dimension embedding model makes the
  seeded vectors incomparable, as DIS-67 R2 says for live entries. → `.env.example` and `readme.md`
  name the model of the versioned vectors; rerun `cache:embed` after a model change. Accepted (D).
- **R4 — A `cache:build` leaves `null` vectors.** → The coherence test fails with the entry id until
  `npm run cache:embed` runs; `docs/project-context.md` states the order. Accepted (D).
- **R5 — Larger golden files** (about 770 more lines per entry). → Plain JSON, still reviewed as text;
  accepted (D).
- **R6 — One more statement per answered `/ask` and per listed project (F10).** → Indexed by
  `project_id`; negligible at the project's volumes. Accepted (D).
- **R7 — A `query_not_logged` call is not counted.** → The spec says the counts include the current
  call "whenever the use case wrote it"; the event already reports the missing row. Accepted (D).

## Migration Plan

No schema migration. Deploy order inside the PR: code and tests → seed fingerprints refreshed (S11) →
`cache:embed` run (S10) → docs. Rollback: revert the PR; old golden files without the key are the
previous commit's.

## Follow-ups

Decisions of the enrich step (Linear DIS-69, F1–F12) and of this proposal (S1–S14, R1–R7), with their
destination (`docs/project-context.md` → Tracking deferred findings). *Agent's text: decided as lead
engineer in an autonomous run, without the author.* The spec audit and the pre-merge reviews add their
findings here. No line has destination C.

| Id | Decision or finding | Destination |
|---|---|---|
| F1 | Metric over the project's `explain` rows of `query_log`, since always, exact and similarity hits together; one decimal; `null` without queries | **A** — this change |
| F2 | New read `countExplainQueries` + pure `cacheHitRate`; `ProjectNotFound` for unknown projects | **A** — this change |
| F3 | `usage.projectCache` in the HTTP answer only, read after the call; not in core's `AnswerUsage`; a failing read answers `500` | **A** — this change |
| F4 | Web line «Caché del proyecto: …» in `UsagePanel`; «sin consultas» with `null` | **A** — this change |
| F5 | CLI field `cache h/q (p%)` / `cache 0/0` in each `projects` line | **A** — this change |
| F6 | Mandatory `questionEmbedding`; versioned `nomic-embed-text` vectors from the new `cache:embed`; no golden regenerated, no new review | **A** — this change |
| F7 | `db:seed` stores each golden vector; evaluation mode still exact-key only | **A** — this change |
| F8 | Seed fingerprints refreshed in this change (S11) | **A** — this change |
| F9 | False similarity hits measured in DIS-67 not corrected here (R1) | **D** — accepted |
| F10 | One counting statement per answered `/ask` and per listed project, no metric cache or new index (R6) | **D** — accepted |
| F11 | OpenSpec change `cache-hit-rate` with deltas in seven capabilities (S14) | **A** — this change |
| F12 | `docs/DEMO.md` captures (step 5 and `projects`) by the agent in Git Bash, `pwsh -NoProfile` and `powershell.exe -NoProfile`, versions and results recorded | **A** — this change |
| S1 | Pure `cacheHitRate` in `core/cache/hit-rate.ts`, `RangeError` for impossible counts | **A** — this change |
| S2 | `COUNT_EXPLAIN_QUERIES` from the project row through `runProjectQuery`; in-memory double counts its kept rows | **A** — this change |
| S3 | The route reads the counts after `explain` and the event log, only for answered answers | **A** — this change |
| S4 | `projectCacheLine` in `usage-display.ts`, a `<p>` under the baseline line | **A** — this change |
| S5 | `countExplainQueries` seam of `projects`, read on the same rolled-back transaction | **A** — this change |
| S6 | Mandatory key, `format` stays `1`, unchanged canonical render rule | **A** — this change |
| S7 | `cache:embed` command, no database, `LLM_EMBED_MODEL` required, atomic writes | **A** — this change |
| S8 | `cache:build` writes `null` for regenerated entries, keeps the others' vectors | **A** — this change |
| S9 | `db:seed` passes the vector to `saveCacheEntry` | **A** — this change |
| S10 | Versioned vectors produced by a live `cache:embed` with `nomic-embed-text`; stop cleanly without it | **A** — this change |
| S11 | Seed fingerprint refresh without `cache:build` | **A** — this change |
| S12 | Demo rephrasing «¿Cómo se calcula el precio total de un pedido?» instead of the ticket's (0.8321 < 0.85); recorded in the Linear ticket | **A** — this change |
| S13 | Live checks on a scratch database `codemind_dis69`, created and dropped | **A** — this change |
| S14 | Spec placement; main specs only through `/opsx:archive` | **A** — this change |
| R1 | False similarity hits remain until a `semantic-cache` recalibration | **D** — accepted |
| R2 | `::int` cast limit of the counts | **D** — accepted |
| R3 | Versioned vectors tied to `nomic-embed-text`; rerun `cache:embed` after a model change | **D** — accepted |
| R4 | `cache:build` leaves `null` vectors until `cache:embed` runs | **D** — accepted |
| R5 | Golden files grow by about 770 lines per entry | **D** — accepted |
| R6 | One more statement per answered `/ask` and listed project | **D** — accepted |
| R7 | A call whose row was not logged is not counted | **D** — accepted |
