# Verify against spec — cache-hit-rate (DIS-69)

- Date: 2026-11-04
- Change: `cache-hit-rate`, PR #108, compared at head `6ec37eb` plus the test fix of this step
- Mode: inline (`ai-specs/skills/verify-against-spec/SKILL.md` → *Inline mode*), autonomous run

*Agent's text (autonomous run, without the author).* The seven delta specs of
`openspec/changes/cache-hit-rate/specs/` were compared with the diff `origin/final-project-CRN...HEAD`.
The specs were last edited at `26672c7` (13:25), before the implementation commit `31d3112` (15:51): no
spec was edited to match the code.

## 1. Requirements implemented correctly

| Requirement (capability) | Code | Test |
|---|---|---|
| Project cache hit rate (`semantic-cache`): counts as given, tenths with a half up, `null` without queries, `RangeError` without counts in its message | `packages/core/src/cache/hit-rate.ts:29` | `tests/unit/cache/hit-rate.spec.ts:9`, `:38` |
| Explain query counts (`graph-store`): one statement from the project row, `ProjectNotFound` for a malformed id before any statement and for an unknown id, `explain` only | `packages/adapters/store-postgres/src/queries.ts:235`, `postgres-store.ts:442` (through `runProjectQuery`, which checks the id form and throws on zero rows), port `packages/core/src/ports/StorePort.ts:247` | `tests/integration/store/explain-query-counts.spec.ts` (both scenarios) |
| Explain query counts — in-memory double: same checks and order, counts kept rows, counts calls, injected failure after the checks | `tests/support/in-memory-store.ts:534` | `tests/unit/store/in-memory-store.spec.ts` "The in-memory double counts explain queries like the database" |
| Ask answered response (`http-ask`): `usage.projectCache`, read after the use case and the event log, only for answered answers; `404` for `ProjectNotFound`, `500` otherwise | `packages/api/src/routes/ask.ts:166`, `:88`, schema `packages/api/src/schemas/ask.ts:81` | `tests/unit/api/ask.spec.ts:380`; `tests/integration/api/ask.spec.ts` "An answered question returns only the public fields over the seed" and "The usage carries the project's cache hit rate over the seed" |
| Ask in the OpenAPI document (`http-ask`): `projectCache` published | `packages/api/src/schemas/ask.ts:81` | `tests/unit/api/ask.spec.ts` "The document lists ask with its parameter, body and responses" |
| Usage panel and how the line is written (`ask-page`) | `packages/web/src/components/usage-display.ts:56`, `UsagePanel.tsx:80`, type `packages/web/src/services/api-client.ts` (`AskUsage.projectCache`) | `packages/web/src/components/usage-display.test.ts` "The project cache line is written with its counts"; `packages/web/src/pages/AskPage.test.tsx` (four scenarios); wireframe by the step 14 screenshots |
| Project listing (`cli-projects`): `cache h/q (p%)` / `cache 0/0`, reads on the same rolled-back transaction, no count with no project, `INTERNAL` for a failing count | `packages/cli/src/commands/projects.ts:89` and the read loop above it | `tests/unit/cli/projects-command.spec.ts` (3 scenarios), `tests/integration/cli/projects-command.spec.ts` (2 scenarios) |
| Golden file format (`golden-answers`): mandatory `questionEmbedding`, `null` or usable vector, key position | `packages/cli/src/cache/golden-file.ts:80`, `isUsableVector` `packages/core/src/cache/similarity-cache.ts:49` | `tests/unit/cache/golden-file.spec.ts` (both scenarios) |
| Partial regeneration: regenerated entries `null`, kept entries keep their vector | `packages/cli/src/cache-build.ts:186` | `tests/integration/cli/cache-build.spec.ts` "Only the named question is regenerated"; `tests/unit/cli/cache-build.spec.ts` "A stale golden file is not partially regenerated" |
| Golden embeddings command (`cache:embed`): argument, configuration and file checks in order, one request per entry, atomic writes, error messages, no secret or path in the output | `packages/cli/src/cache-embed.ts:72` | `tests/unit/cli/cache-embed.spec.ts` (five scenarios) |
| The versioned golden file is coherent (usable vector per entry) and Signatures of the reviewed golden answers | `seeds/cache/acme-shop.json`, `seeds/cache/task-api.json` | `tests/unit/seed/golden-coherence.spec.ts`, `tests/unit/seed/golden-reviews.spec.ts` |
| Golden answers are loaded with the seed (`seed-load`): the vector saved with the entry, a rephrasing is a similarity hit | `packages/cli/src/seed-load.ts:237` | `tests/integration/cli/seed-load.spec.ts` (five scenarios), `tests/unit/cli/seed-load.spec.ts` |

## 2. Requirements missing or partial

None in the code. One test was weaker than its scenario and was corrected in this step:

- `http-ask`, "The usage carries the project's cache hit rate over the seed" states «every other key of
  `usage` is the usage of a cache hit, unchanged», but `tests/integration/api/ask.spec.ts:205` only
  asserted `usage.cacheHit`. Fixed: the test now also asserts, for the three answers, zero input and
  output tokens, zero cost, and the zero `generation` and `verification` usage of a cache hit (the
  baseline and the latency depend on the entry and the clock and are not fixed by the scenario). Green
  against `codemind_dis69_test`.

## 3. Unspecified behaviour

Each item has a decision; none is left open.

| Behaviour | Where | Decision |
|---|---|---|
| `toPublicAnswer` throws `Error('an answered answer needs the project cache hit rate')` when the route omits the rate for an answered answer | `packages/api/src/routes/ask.ts:88` | Keep: a route-internal contract guard fixed by design S3 and task 4.2 (audit run 1 B3); no HTTP input reaches it, and a failure would answer the specified `500 INTERNAL` |
| The OpenAPI document publishes `maximum: 9007199254740991` on `queries` and `cacheHits` | `packages/api/src/schemas/ask.ts:81` (`z.int()`) | Keep: the generator's rendering of every `z.int()` of the document (the other usage integers carry it too); the scenario fixes type and `minimum`, and the counts never exceed `2147483647` (`::int` cast, design R2). Destination D |
| `isUsableVector` and `CACHE_EMBED_FAILED` are new exports | `packages/core/src/cache/similarity-cache.ts:49`, `packages/cli/src/cache-embed.ts` | Keep: module API required by design S6 / S7 (shared rule with `usableVector`; message reused by the tests); not user-visible behaviour |

Specific checks:

- Dependency imported that is not in a manifest: none (`git diff` of `package.json` only adds the
  `cache:embed` script; no `package-lock.json` change).
- Authorisation required and not performed: none required (the API has no authentication, unchanged).
- Response field not in the spec: none; `usage` keys equal the spec's list (integration test of the
  public fields sorts and compares them).
- Scenario whose test asserts something weaker: the one of block 2, corrected.

## Scenario → test → state

State from this step's runs: `DATABASE_URL=…/codemind_dis69_test npx vitest run tests/unit/cache tests/unit/store tests/unit/api tests/unit/cli tests/unit/seed tests/unit/explain tests/integration/store tests/integration/api tests/integration/cli`
(98 files, 1110 tests passed) and `npx vitest run --project dom` (9 files, 79 tests passed); CI of PR #108
green at `6ec37eb` (e2e, frontend, mutation, quality, scope, secrets, verify).

| Scenario | Test | State |
|---|---|---|
| The hit rate is rounded to one decimal and null without queries | `tests/unit/cache/hit-rate.spec.ts` | green |
| Impossible counts are rejected | `tests/unit/cache/hit-rate.spec.ts` | green |
| Explain queries and cache hits are counted per project | `tests/integration/store/explain-query-counts.spec.ts` | green |
| Counting the queries of an unknown project fails | `tests/integration/store/explain-query-counts.spec.ts` | green |
| The in-memory double counts explain queries like the database | `tests/unit/store/in-memory-store.spec.ts` | green |
| An answered question returns only the public fields over the seed | `tests/integration/api/ask.spec.ts` | green |
| Evidence ids are renumbered in evidence order | `tests/unit/api/ask.spec.ts` | green |
| Internal fields of the answer are not sent | `tests/unit/api/ask.spec.ts` | green |
| A statement citing an unknown evidence id answers INTERNAL | `tests/unit/api/ask.spec.ts` | green |
| The usage carries the project's cache hit rate over the seed | `tests/integration/api/ask.spec.ts` | green (strengthened) |
| The hit rate is read only for an answered question and its failure answers INTERNAL | `tests/unit/api/ask.spec.ts` | green |
| The document lists ask with its parameter, body and responses | `tests/unit/api/ask.spec.ts` | green |
| An answer from the model shows its usage panel | `packages/web/src/pages/AskPage.test.tsx` | green |
| A cache hit shows its usage panel | `packages/web/src/pages/AskPage.test.tsx` | green |
| No saving is not shown as a saving | `packages/web/src/pages/AskPage.test.tsx` | green |
| A project without logged queries shows no hit rate | `packages/web/src/pages/AskPage.test.tsx` | green |
| The usage panel and the states follow the wireframe | step 14 screenshots (`reports/2026-11-04-14-end-to-end-testing.md`) | green (manual) |
| Confidence / Tokens / Cost / Latency / Savings (unchanged scenarios) | `packages/web/src/components/usage-display.test.ts` | green |
| The project cache line is written with its counts | `packages/web/src/components/usage-display.test.ts` | green |
| The budget reset time is written in UTC; The wait of a rate limit… (unchanged) | `packages/web/src/components/notice-display.test.ts` | green |
| Sample and user projects are listed | `tests/integration/cli/projects-command.spec.ts` | green |
| An empty database lists no projects | `tests/integration/cli/projects-command.spec.ts` | green |
| Configuration, connection and usage errors | `tests/unit/cli/projects-command.spec.ts` | green |
| The cache field writes the hit rate with at most one decimal | `tests/unit/cli/projects-command.spec.ts` | green |
| A failing count read is an unexpected error | `tests/unit/cli/projects-command.spec.ts` | green |
| Golden question embeddings are written without touching the answers | `tests/unit/cli/cache-embed.spec.ts` | green |
| Embedding arguments and configuration are checked before any file | `tests/unit/cli/cache-embed.spec.ts` | green |
| An invalid golden file stops the embedding before any request | `tests/unit/cli/cache-embed.spec.ts` | green |
| A failed embedding leaves the golden file intact | `tests/unit/cli/cache-embed.spec.ts` | green |
| A failed write leaves the golden files intact | `tests/unit/cli/cache-embed.spec.ts` | green |
| Every golden answer judged correct or partial carries both panel signatures | `tests/unit/seed/golden-reviews.spec.ts` | green |
| A golden answer judged incorrect carries no signature | `tests/unit/seed/golden-reviews.spec.ts` | green |
| The canonical render is stable | `tests/unit/cache/golden-file.spec.ts` | green |
| Golden files with an invalid shape are rejected | `tests/unit/cache/golden-file.spec.ts` | green |
| Only the named question is regenerated | `tests/integration/cli/cache-build.spec.ts` | green |
| A stale golden file is not partially regenerated | `tests/unit/cli/cache-build.spec.ts` | green |
| The versioned golden file matches the seed, the questions and the code | `tests/unit/seed/golden-coherence.spec.ts` | green |
| The versioned task-api golden file matches the seed, the questions and the code | `tests/unit/seed/golden-coherence.spec.ts` | green |
| Golden answers are loaded and served in evaluation mode | `tests/integration/cli/seed-load.spec.ts` | green |
| A seed without golden files loads only the graph | `tests/integration/cli/seed-load.spec.ts` | green |
| Loading golden answers again does not duplicate them | `tests/integration/cli/seed-load.spec.ts` | green |
| A failed golden save leaves the database unchanged | `tests/integration/cli/seed-load.spec.ts` | green |
| A rephrased golden question is a similarity hit after the seed | `tests/integration/cli/seed-load.spec.ts` | green |

Verdict: the implementation does what the seven deltas state, no less; block 3 holds three items, each
decided above; the one weak test was strengthened in this step.
