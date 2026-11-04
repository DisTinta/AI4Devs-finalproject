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
`toPublicAnswer(answer: ExplainAnswer, projectCache?: ProjectCacheHitRate): AskResponse`. For an
answered answer the parameter is required at runtime: its absence throws
`Error('an answered answer needs the project cache hit rate')` (a route defect, `500`); it is ignored
for `UNKNOWN`. The route holds no SQL (it satisfies `GUARD_DB_IN_HTTP`); `explain` stays untouched, so
neither the golden answer fingerprint nor the stored response changes. A rejection of the read
propagates to the error handler: a `ProjectNotFound` (the project was deleted between `explain` and
the read) keeps the table's `404 PROJECT_NOT_FOUND` (`ASK_DOMAIN_ERRORS`); any other error is
`500 INTERNAL`. `askUsageSchema` gains `projectCache:
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
exists. They are migrated in two steps: first with `questionEmbedding: null` in every entry (task
7.3b, right after the schema change: a canonical re-render that only adds the key, so every test and
command that reads them, `cache:embed` included, keeps loading them), then with the vectors of
`cache:embed` (S10). *Alternatives rejected:* an optional key (two shapes for one meaning and a canonical render
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
`longFetch`) and `LLM_TIMEOUT_MS` apply: each request embeds one golden question (< 200 characters)
and is bounded by `LLM_TIMEOUT_MS`. No database, no budget meter. Script in
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
never embeds (PH-04), so the vectors change nothing without `LLM_EMBED_MODEL`. pgvector stores
single-precision components: the versioned double-precision vectors are rounded on load, which keeps
the cosine similarity of a key with its own stored vector ≈ 1; the `seed-load` scenario that compares
a stored vector uses small integer components, exact in single precision.

**S10 — The versioned vectors come from a live `cache:embed` run.** With Ollama and
`nomic-embed-text` (768) at `http://localhost:11434/v1`, the agent runs `cache:embed` once; the diff
of `seeds/cache/*.json` must only add the `questionEmbedding` lines (checked by the coherence test and
by a scripted comparison with the previous files with the key removed). No golden response or review
changes, so the DIS-110 r2 signatures stay valid and no panel round is needed (F6); the
`golden-answers` delta states this as the MODIFIED requirement "Signatures of the reviewed golden
answers" (audit B1). If Ollama or the
model is unavailable, the ticket stops cleanly: the coherence requirement cannot be met with invented
vectors.

**S11 — Seed fingerprints refreshed as DIS-67 E1 (F8).** After the store and `core/knowledge` edits:
`npm run seed:build`, then the same `seed.analyzerFingerprint` in `seeds/cache/acme-shop.json`,
`seeds/cache/task-api.json`, `seeds/drift/acme-shop.json` and `docs/measurements/graph-quality.json`
(header fingerprint lines only); no `cache:build`. `seeds/graph-dump.sql` rows must not change.
ADR `docs/adr/20261017-stale-fingerprint-fails-verify.md` asks for `seed:build` then `cache:build`;
`cache:build` is skipped because the seed rows do not change (checked in 9.1) and no
`ANSWER_FINGERPRINT_FILES` input changes, so a rebuild would answer over the same seed (precedent
DIS-67 E1). ADR `docs/adr/20261103-drift-golden-freshness-in-unit-suite.md` and
`docs/project-context.md` add `drift:build` to the recipe; it is skipped for the same reason: no
`DRIFT_FINGERPRINT_FILES` input changes and the seed rows do not change, so
`tests/unit/seed/drift-golden-coherence.spec.ts` stays green with the copied fingerprint (checked in
9.1; precedent DIS-67 E1). Neither ADR is amended.

**S12 — Demo rephrasing.** The ticket's AC5 names «Explícame el cálculo del precio final», which
measured 0.8321 with `nomic-embed-text` in DIS-67 (below 0.85); the demo and the manual check use
«¿Cómo se calcula el precio total de un pedido?» (0.9260). The spec scenario of `seed-load` uses a
scripted embedding, so it does not depend on the measured value. The agent accepted the replacement
(audit run 1, Q1) and rewrote AC5 of the `[enhanced]` part of DIS-69 accordingly; the `[original]`
part is not touched.

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
- **R3 — The vectors belong to `nomic-embed-text`.** A different 768-dimension embedding model makes
  the seeded vectors incomparable, as DIS-67 R2 says for live entries. → `.env.example` and
  `readme.md` name the model of the versioned vectors. Per ADR `20261103-embeddings-stay-on-llm-port.md`
  and the DIS-46 non-goal, the operator invalidates the cache on a model change; no stored entry is
  re-embedded. Changing the reference model of the versioned files is a new change that reruns
  `cache:embed` on the files and reseeds. The golden file does not record the embedding model, so
  `db:seed` cannot detect a mismatch. Accepted (D).
- **R4 — A `cache:build` leaves `null` vectors.** → The coherence test fails with the entry id until
  `npm run cache:embed` runs; `docs/project-context.md` states the order. Accepted (D).
- **R5 — Larger golden files** (about 770 more lines per entry). → Plain JSON, still reviewed as text;
  accepted (D).
- **R6 — One more statement per answered `/ask` and per listed project (F10).** → Indexed by
  `project_id` (`query_log_project_id_idx`): one indexed `count` over one project's `query_log` rows;
  the row count and the latency measured in step 13 are recorded in its report. Accepted (D).
- **R7 — A `query_not_logged` call is not counted.** → The spec says the counts include the current
  call "whenever the use case wrote it"; the event already reports the missing row. Accepted (D).

## Migration Plan

No schema migration. Deploy order inside the PR: code and tests → versioned golden files migrated with
`questionEmbedding: null` (S6, task 7.3b) → seed fingerprints refreshed (S11) → `cache:embed` run
(S10) → docs. Rollback: revert the PR; old golden files without the key are the
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
| F3 | `usage.projectCache` in the HTTP answer only, read after the call; not in core's `AnswerUsage`; a failing read answers `500` (`404` for a `ProjectNotFound`, audit B2) | **A** — this change |
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
| S12 | Demo rephrasing «¿Cómo se calcula el precio total de un pedido?» instead of the ticket's (0.8321 < 0.85); recorded in AC5 of the `[enhanced]` part of DIS-69 (audit run 1) | **A** — this change |
| S13 | Live checks on a scratch database `codemind_dis69`, created and dropped | **A** — this change |
| S14 | Spec placement; main specs only through `/opsx:archive` | **A** — this change |
| R1 | False similarity hits remain until a `semantic-cache` recalibration | **D** — accepted |
| R2 | `::int` cast limit of the counts | **D** — accepted |
| R3 | Versioned vectors tied to `nomic-embed-text`; a model change invalidates the cache (ADR 20261103), no stored entry re-embedded; the golden file does not record the embedding model | **D** — accepted |
| R4 | `cache:build` leaves `null` vectors until `cache:embed` runs | **D** — accepted |
| R5 | Golden files grow by about 770 lines per entry | **D** — accepted |
| R6 | One more statement per answered `/ask` and listed project | **D** — accepted |
| R7 | A call whose row was not logged is not counted | **D** — accepted |

Spec audit, run 1 (`reports/2026-11-04-spec-audit.md`). *Agent's text: questions for the author
answered and findings resolved by the agent as lead engineer in an autonomous run, without the
author.*

| Id | Decision or finding | Destination |
|---|---|---|
| Q1 | The demo rephrasing of S12 is accepted: «Explícame el cálculo del precio final» measured 0.8321 < 0.85 and cannot meet AC5; AC5 of the `[enhanced]` part of DIS-69 now names «¿Cómo se calcula el precio total de un pedido?» (the `[original]` part is untouched) | **A** — this change |
| Q2 | R3 is read as the ADR 20261103 and the DIS-46 non-goal state: stored entries are never re-embedded, a model change invalidates the cache; rerunning `cache:embed` only applies to a new change of the versioned files' reference model | **A** — this change |
| Q3 | The percentage `hitRatePct: 40` («40 %», `(40%)`) satisfies the DIS-46 «hit rate 0.4»: same value, the representation the `[enhanced]` part of DIS-69 already chose; no artifact change | **A** — this change |
| B1 | MODIFIED "Signatures of the reviewed golden answers" in the `golden-answers` delta: `id`, `question`, `questionNormalized` and `response` unchanged, only `reviews`, `seed` fingerprints and `questionEmbedding` may change; the signatures scenario also checked the projection on the panel input (superseded by run 2 I5) | **A** — this change |
| B2 | A `ProjectNotFound` of the count read answers `404 PROJECT_NOT_FOUND` (route error table); any other failure `500` (spec, S3, task 4.1) | **A** — this change |
| B3 | `toPublicAnswer(answer, projectCache?)` signature fixed in S3; throws for an answered answer without it (task 4.3) | **A** — this change |
| I1 | Empty listing reads no count: case added to "A failing count read is an unexpected error" (task 6.1) | **A** — this change |
| I2 | New scenario "A failed write leaves the golden files intact" for the two `INTERNAL` messages of `cache:embed` (task 8.3) | **A** — this change |
| I3 | No secret, path, question or vector in the output, and the `LLM_TIMEOUT_MS` client, asserted in the `cache:embed` scenarios (task 8.3) | **A** — this change |
| I4 | The pooled-connection clause of "Explain query counts" refers to "Opening a pooled store from a URL", whose scenarios already cover it, instead of a new scenario | **A** — this change |
| I5 | R6 and S7 reworded without loose words; the count latency is measured in step 13 (task 13.4) | **A** — this change |
| I6 | R3 reworded (see Q2); recording the embedding model in the golden file (`generatedWith.embedModel`) is not done: it would change the format for a mismatch the operator handles by invalidating the cache | **D** — accepted |
| I7 | S11 cites ADR 20261017 and the condition that makes skipping `cache:build` equivalent; the ADR is not amended | **A** — this change |
| I8 | Single-precision storage noted in S9; the `seed-load` scenario uses a vector of small integer components | **A** — this change |
| I9 | Tasks split: 5.3 → 5.3a/5.3b/5.3c, 16.7 → 16.7/16.8; 11.2 reuses the 13.5 evidence and runs after it | **A** — this change |
| I10 | The S12 row now points to the rewritten AC5 of DIS-69 | **A** — this change |

Spec audit, run 2 (`reports/2026-11-04-spec-audit.md`). *Agent's text: findings resolved by the agent
as lead engineer in an autonomous run, without the author; the run had no question for the author.*

| Id | Decision or finding | Destination |
|---|---|---|
| B1 | New task 7.3b migrates both versioned golden files with `questionEmbedding: null` right after the schema change (7.3), so `cache:embed`, 7.6, 8.x and the existing tests that read `seeds/cache/` keep loading them; S6, the Migration Plan, 7.6, 8.4, 9.3 and the proposal state the step | **A** — this change |
| I1 | Proposal aligned with run 1: the `404 PROJECT_NOT_FOUND` of a `ProjectNotFound` count read, and the MODIFIED "Signatures of the reviewed golden answers" listed | **A** — this change |
| I2 | The negative check «%» of "No saving is not shown as a saving" keeps its full strength over the text before the project cache line (spec and task 5.3b); no assertion is weakened, so 10.2 holds without exception | **A** — this change |
| I3 | S11 cites ADR 20261103-drift-golden-freshness-in-unit-suite: `drift:build` is skipped for the same reason as `cache:build`; task 9.1 runs `drift-golden-coherence.spec.ts` | **A** — this change |
| I4 | Task 13.3 observes the live similarity hit through SQL (`query_log.cache_hit`, zero tokens, `Q1`'s `hit_count`), since the CLI `ask` prints no usage | **A** — this change |
| I5 | Option (a), the narrower one: "Signatures…" requires unchanged only the parts of `response` the panel judged (as "Blind panel input of the golden review" projects them); the added THEN clause is removed because the existing scenario "The panel input projects the golden answers without their verification" already checks it; `golden-reviews.spec.ts` is no longer edited (9.4, 10.2). The full-value comparison stays the 9.3 scratch check | **A** — this change |
| I6 | `DAILY_BUDGET_USD` in `cache:embed`: not applied (no budget meter), but a value the model configuration rejects still fails with `LLM_CONFIG_INVALID` (`nomic-embed-text` is priced in `COST_TABLE`, so a valid budget does not block the run) | **A** — this change |
| L1 | `[enhanced]` of DIS-69, Contexto técnico → Golden: `cache:embed` reads the model configuration as `ask` does (no `longFetch`, S7), not as `cache:build` | **A** — this change |
