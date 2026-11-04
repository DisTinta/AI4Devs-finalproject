## Why

DIS-67 (CM-HU-19.1) made the answer cache of `explain` answer rephrased questions by similarity, but
nobody can see how often the cache answers: no read aggregates `query_log`, and neither the web
(`UsagePanel`) nor the CLI shows a cache figure per project. DIS-69 (CM-HU-19.2, parent DIS-46 /
CM-HU-19) closes the last acceptance criterion of CM-HU-19: "given 10 queries of which 4 were hits, the
project's hit rate is 0.4 and is shown in the CLI and in `UsagePanel`".

The sample projects cannot show a similarity hit either: the versioned golden answers of `seeds/cache`
carry no question embedding, so `db:seed` stores them without a vector and a rephrasing of a golden
question is never a similarity hit, even with `LLM_EMBED_MODEL` configured. DIS-67 left both points to
this ticket (its decision D10, destination B). Regenerating the golden answers to add the vectors is not
an option: `cache:build` failed 3 of 3 times with the local `qwen2.5-coder` (DIS-67 E2), and new answers
would need a new signed independent review.

## What Changes

- **Metric.** The cache hit rate of a project is computed over its `query_log` rows of capability
  `explain`, since the beginning, exact and similarity hits together: `queries` (rows), `cacheHits`
  (rows with the cache flag) and `hitRatePct` = 100 × hits / queries rounded to one decimal with the rule
  of `savingsPct`, `null` with no query. A pure core function `cacheHitRate` and a new store read
  `StorePort.countExplainQueries(projectId)` (one parameterised statement from the project row,
  `ProjectNotFound` for a malformed or unknown id, implemented in Postgres and in the in-memory double).
  `impact` and `drift` rows never count; `cache_entry.hit_count` is not used.
- **API.** The answered response of `POST /api/projects/{projectId}/ask` gains
  `usage.projectCache = { queries, cacheHits, hitRatePct }`, read by the route after the use case
  answered, so it includes the current call's row. Core's `AnswerUsage`, the stored response and
  `explain` do not change. An `UNKNOWN` answer still carries no usage. A `ProjectNotFound` of the read
  (project deleted after the answer) answers `404 PROJECT_NOT_FOUND`; any other failing read answers
  `500 INTERNAL`. The OpenAPI document publishes the field.
- **Web.** The `UsagePanel` shows a line under the baseline line: «Caché del proyecto: 40 % de aciertos
  (4 de 10 consultas)», «… (0 de 1 consulta)», or «Caché del proyecto: sin consultas» when `hitRatePct`
  is `null`; text only, no control.
- **CLI.** Each line of `projects` gains the field `cache <hits>/<queries> (<pct>%)`, or `cache 0/0` for
  a project without queries, after `<indexedAt>` and before ` sample`, read in the same read-only
  transaction.
- **Golden answers with vectors.** The golden file format gains a mandatory key `questionEmbedding`
  per entry (between `questionNormalized` and `response`): `null` or a usable vector (`semantic-cache`).
  A new command `npm run cache:embed [-- --project <name>]` fills the vectors of the versioned golden
  files with the configured embedding model (live mode and `LLM_EMBED_MODEL` required, no database),
  keeping every response and review unchanged. `cache:build` writes `null` for the entries it
  regenerates and keeps the vector of the entries it keeps. The two versioned files are first
  migrated with `questionEmbedding: null`, then filled by `cache:embed`; they carry
  `nomic-embed-text` vectors (768). `db:seed` saves each golden entry's vector with its cache entry, so
  on freshly seeded sample projects a rephrasing of a golden question is a similarity hit in live mode
  with `LLM_EMBED_MODEL` configured (evaluation mode stays exact-key only, PH-04). The demo rephrasing
  is «¿Cómo se calcula el precio total de un pedido?» (0.9260 with `nomic-embed-text`, measured in
  DIS-67), not the ticket's «Explícame el cálculo del precio final» (0.8321, below the 0.85 threshold).
- **Seed fingerprints** are refreshed (the store adapter and `core/knowledge` are seed fingerprint
  inputs), as in DIS-67 E1; no golden answer is regenerated.
- **Docs.** `readme.md` §1.3 step 5, §2.4 and §4; `docs/DEMO.md` step 5 and the `projects` output,
  recaptured in Git Bash, PowerShell 7 and Windows PowerShell 5.1; `.env.example`;
  `docs/project-context.md`.

### Non-goals

- No hit rate of `impact` or `drift`, and no change to their answers; their rows never count.
- No split between exact and similarity hits, no time window or history of the metric, no new route or
  statistics screen, no metric in the CLI `ask` (its spec prints no usage) nor in the web project picker
  (static data).
- No regenerated golden answer and no changed review; no recalibration of the similarity threshold
  (the false hits measured in DIS-67, R4, stay a known limitation: this ticket only makes them
  measurable).
- No new index or migration, and no cache of the metric.

## Capabilities

### New Capabilities

None. The metric belongs to `semantic-cache`, the read to `graph-store`, the command to
`golden-answers`.

### Modified Capabilities

- `semantic-cache`: ADDED "Project cache hit rate" (definition, rounding, `null` without queries, the
  pure function).
- `graph-store`: ADDED "Explain query counts" (`countExplainQueries`, its checks, the in-memory double).
- `http-ask`: MODIFIED "Ask answered response" (`usage.projectCache`, the read after the use case, the
  `404`/`500` of a failing read) and "Ask in the OpenAPI document" (the published field).
- `ask-page`: MODIFIED "Usage panel" (the project cache line) and "How usage figures and notice details
  are written" (how the line is written).
- `cli-projects`: MODIFIED "Project listing" (the `cache` field and its read).
- `golden-answers`: MODIFIED "Golden file format" (`questionEmbedding`), "Partial regeneration" (what
  `cache:build` writes for the key), "The versioned golden file is coherent" (every versioned entry
  has a usable vector) and "Signatures of the reviewed golden answers" (only `reviews`, the `seed`
  fingerprints and `questionEmbedding` may change); ADDED "Golden embeddings command" (`cache:embed`).
- `seed-load`: MODIFIED "Golden answers are loaded with the seed" (the vector saved with the entry,
  and a rephrasing of a seeded golden question is a similarity hit in live mode).

## Impact

- **Core:** `packages/core/src/cache/hit-rate.ts` (new), `cache/index.ts`,
  `knowledge/query-log.ts` (`ExplainQueryCounts`), `ports/StorePort.ts`.
- **Adapters:** `packages/adapters/store-postgres/src/queries.ts` (`COUNT_EXPLAIN_QUERIES`) and
  `postgres-store.ts`; no migration (`query_log_project_id_idx` exists since `0003`).
- **API:** `packages/api/src/routes/ask.ts`, `packages/api/src/schemas/ask.ts`.
- **Web:** `packages/web/src/services/api-client.ts`, `components/usage-display.ts`,
  `components/UsagePanel.tsx`.
- **CLI:** `packages/cli/src/commands/projects.ts`, `cache/golden-file.ts`, `cache-build.ts`,
  `seed-load.ts`, `cache-embed.ts` (new) and the `cache:embed` script of `package.json`.
- **Seed:** `seeds/cache/acme-shop.json` and `seeds/cache/task-api.json` (vectors and refreshed seed
  fingerprint), `seeds/graph-dump.sql`, `seeds/drift/acme-shop.json` and
  `docs/measurements/graph-quality.json` (header fingerprint lines only).
- **Tests:** new `tests/unit/cache/hit-rate.spec.ts`, `tests/unit/cli/cache-embed.spec.ts`,
  `tests/integration/store/explain-query-counts.spec.ts`; existing tests that change are named in
  `tasks.md`.
- **Privacy and security:** the metric is two integers per project; no question text reaches the
  response, the CLI or the logs. The golden vectors are embeddings of demo questions already public in
  the repository; `cache:embed` sends those questions to the configured embedding endpoint, as `explain`
  already does for every live question.
- **Cost and performance:** one counting statement per answered `/ask` and per listed project (indexed
  by `project_id`); `cache:embed` makes one embedding request per golden entry (0 USD with
  `nomic-embed-text`).
- **Commands:** those of `docs/project-context.md` and `.claude/sdd-harness.env` (`npx vitest run`,
  `npm run typecheck`, `npm run lint`, `npx stryker run`, `npm run seed:build`, `npm run db:seed`).
