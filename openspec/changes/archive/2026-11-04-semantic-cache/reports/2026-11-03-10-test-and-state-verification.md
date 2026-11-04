# Test and State Verification Report

- Date: 2026-11-03
- Change: semantic-cache
- Step: 10 Backend: Run Tests and Verify Data State

*Agent's text: written by the agent of the apply step in an autonomous run, without the author.*

## Commands executed
- `npx vitest run --project dom --project seed-build --project node` (baseline, no `DATABASE_URL`, then with `DATABASE_URL` of the scratch database `codemind_test`)
- `npx vitest run tests/unit/cache tests/unit/explain tests/unit/store tests/unit/llm tests/unit/cli tests/integration/store tests/integration/explain` (inside the full runs and per group while writing)
- `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- `npx stryker run` (whole project, incremental) and a narrow Stryker config in the scratchpad over `similarity-cache.ts` and `cache-entry.ts`
- `npm run db:migrate` (local database, `0005` applied for step 11)

## Test results
- Baseline before the change (`final-project-CRN` tip, no database): 188 files passed, 29 skipped; 1971 tests passed, 281 skipped (the integration files skip without `DATABASE_URL`).
- Required suite after the change, with `DATABASE_URL` pointing to `codemind_test` (the local `codemind` database holds the acme-shop and task-api seed, and the integration harness refuses a database with committed projects): 219 files passed, 0 skipped; 2341 tests passed, 0 failed. Runtime 342 s.
- Lint: clean. Typecheck: 0 errors. Architecture: 0 errors, 1 pre-existing warning (`no-orphans` of a web build asset). `docs:coverage`: clean.
- Stryker (whole project, 5 min 18 s, incremental): final score 92.89, above the break threshold 80. After the survivors below, a narrow run over the two new files: `similarity-cache.ts` 100.00, `cache-entry.ts` 97.22 (three survivors, all equivalent: the `typeof` guards before `Number.isFinite` / `UUID.test`, which already reject non-numbers and non-strings). The survivors of `explain.ts` in the similarity path are `key !== ''` conditions that no input reaches (a question with an anchor always has a non-empty key). Survivors killed by new tests: wrong-length vectors with a non-zero component (`similarity-cache.spec.ts`), and the checks `assertValidEmbedding` and `assertValidMinSimilarity`, which were covered on Postgres only (new `describe` in `tests/unit/knowledge/cache-entry.spec.ts`). The second full Stryker run could not finish inside the 10 minute limit of one foreground call (a changed test file invalidates the incremental report), so the score above is the one of the first full run.
- Notes: no flaky test; RED was seen for every group before its code (group 6.8 and the sanitisation test were written after the implementation of 6.3 and passed at once, which this report records).

## Data state verification
- Pre-test baseline (task 0.3, local database `codemind`):
  - `SELECT count(*) FROM project`: 2
  - `SELECT count(*) FROM cache_entry`: 6
  - `... WHERE question_embedding IS NOT NULL`: 0
  - `SELECT count(*) FROM query_log`: 0; `max(created_at)`: none
  - applied migrations: `0001_graph-l1`, `0002_history-claims`, `0003_indexes-stale`, `0004_query-log-verification`
- Post-test validation (after step 11 and its restoration): 2 projects, 6 cache entries, 0 with an embedding, 0 `query_log` rows, 0 claims and evidence; the three acme-shop entries equal to the snapshot (same ids, response hashes, `hit_count` 0, `last_hit_at` empty, `created_at`). Migration `0005_embedding-768` stays applied (precondition of step 11).
- The integration specs run on the scratch database `codemind_test` and roll back or clean up; no `.stryker-tmp/` left (removed); `node scripts/dev-processes.mjs stop` run.
- State restored: Yes
- Restoration actions: see the step 11 report (cache entries and claims of acme-shop, `query_log`).

## Existing tests edited (task 7.2), with the reason; no assertion weakened
- `tests/unit/llm/llm-unavailable.spec.ts`: "fixes the embedding dimension to the schema columns" renamed "The schema dimension is 768" and expects 768; "keeps both dimensions of a dimension mismatch" uses `received: 1536` (the dimension is now 768).
- `tests/unit/llm/openai-compatible-llm.spec.ts`: the `vector()` helper defaults to `EMBEDDING_DIMENSIONS`; "A vector of another dimension is rejected" answers 1536 components and expects `expected` 768, `received` 1536.
- `tests/integration/store/migrations.spec.ts`: the three columns are `vector(768)`; `0005_embedding-768` joins `ALL_MIGRATIONS`; "Roll back only the latest migration" now checks `0005` (columns back to `vector(1536)`, nullable, HNSW `vector_cosine_ops`, snapshot equal to a database migrated with `0001`-`0004`); the former test lives on as "Roll back the query log verification migration"; new "An embedding of another dimension is rejected by the column".
- `tests/unit/explain/explain.spec.ts`: three call-count objects gain `findSimilarCacheEntry: 0`.
- `tests/integration/store/cache-entry.spec.ts`: "Invalid cache arguments are rejected before querying" and "Cache calls on an unknown project fail without writing" extended to the five calls and the `embedding` / `minSimilarity` cases.
- `tests/unit/cli/ask-command.spec.ts`: "The API key never reaches an output": its double's `embed` throws `LlmUnavailable('not-configured')` instead of a plain `Error`; assertions unchanged.
- `tests/unit/knowledge/cache-entry.spec.ts` (named in task 10.4): a new `describe` only.
- Doubles: `tests/support/scripted-llm.ts` (`embed` option, `embeddings`, default `not-configured`), `tests/support/in-memory-store.ts` (similarity search, embedding), `tests/support/explain-doubles.ts` (`findSimilarCacheEntry` in `order`, `embed` forwarding); new `tests/support/embedding-vector.ts`.
- Traceability (task 7.3): every `#### Scenario:` title of the five delta specs was grepped in `tests/`; all exist except "A response after 300 s is accepted" (llm-adapter), an unchanged scenario the spec itself calls a recorded manual check.

## Migration review (task 3.2, inline)
`0005_embedding-768` read as the `migration-review` skill asks: up and down are symmetric and run in the single migration transaction; `USING NULL` loses nothing because every value is NULL (checked: 0 non-null embeddings in `file`, `symbol`, `cache_entry` of the local database); the three HNSW indexes cannot follow a type change, so they are dropped and recreated with the same names and `vector_cosine_ops` (the `0003` down still drops them, proven by "Roll back every migration leaves an empty schema" and "Apply, roll back and apply again"); the `ALTER ... TYPE` takes an `ACCESS EXCLUSIVE` lock on three small tables, acceptable for this local-first database; the `down` header says it discards vectors. The Expand to Contract exception of design S6 holds: before this change no code read or wrote the three columns (grep of `packages/` for `embedding` in SQL, and the integration `A saved entry is found by its project and key` that still asserts `NULL` for a save without embedding). Result: no finding.

## Privacy and ethics check (task 10.5, inline)
- The question already goes to the same endpoint in `complete`; `embed` adds no destination and sends only the normalized key.
- The vector is stored only in the local `cache_entry` of the project; it is never logged or returned. Stored vectors of an old model are not comparable: the operator rule is documented (ADR, `.env.example`, `docs/project-context.md`, `docs/backend-standards.md`).
- The event `semantic_cache_skipped` carries a closed code only (tests: "The skip event carries nothing of the question or the error"); the API log of the manual run held no question text.
- SQL is parameterised and project-scoped (the embedding is one text parameter cast to `vector`); no secret, no real e-mail and no personal data in the fixtures. No new dependency (`package.json` and `package-lock.json` untouched, so no `npm audit` run).
- Known ethical risk, recorded as R3 of the follow-ups: a false similarity hit serves another question's answer.

## End-to-end testing (task 12.1)
Not applicable beyond step 11: the change has no browser UI (`packages/web` untouched; the hit rate in `UsagePanel` is DIS-69). The CI evidence (the new spec files ran and passed, the mutation job at 80 or more) is collected in task 14.2.

## Outcome
- Status: PASS
- Blocking issues: none

## Addendum: Spec audit of the relaunch

*Agent's text: written by the agent of the apply step in an autonomous run, without the author. Date: 2026-11-04.*

### Tests edited by the audit (task 7.4), assertions only added
- `tests/unit/store/in-memory-store.spec.ts`, "The in-memory double searches by similarity like the database" (4.7): entry E seeded after D with D's embedding and exactly D's creation instant; the tie search expects the greater id in byte order. Seen green at once (the double already orders by id after `createdAt`); seen failing once with the smaller id expected, then restored. The former `expect(tie?.id).toBe(d)` became `toBe(greaterId)`, because with E present the greater of the two ids is the correct tie result.
- `tests/integration/store/cache-entry.spec.ts`, "The most similar entry wins and ties go to the most recent" (5.5): C and D with explicit ids, the two searches and their assertions kept, then E inserted with D's embedding and `created_at` and a greater id; the tie search resolves to E. Seen green at once; seen failing once expecting D (received E), then restored. Run against `codemind_test`.
- `tests/unit/explain/explain-similarity.spec.ts` (6.11): "The most similar entry of the project wins" also asserts C's hit count stays 0; "A live answer is saved with its embedding and found by a rephrasing" also asserts `calls.saveCacheEntry` is 1 and the entry still holds the price question's embedding; "An unavailable endpoint or an unusable vector degrades with an event" also asserts exactly one `semantic_cache_skipped` event per answer. Each seen green at once and failing once with a temporary wrong expectation (hit count 1, two events, two saves, the rephrasing's vector), then restored. "An entry without an embedding is never a similarity hit" keeps its assertions and now maps to its own scenario (title grep: found in `tests/unit/explain/explain-similarity.spec.ts` and in the `semantic-cache` delta).
- `packages/core/src/cache/similarity-cache.ts`: TSDoc of `reachesThreshold` only (6.11 a); no code change.

### Totals (task 10.10)
- `npx vitest run --project dom --project seed-build --project node` with `DATABASE_URL` of `codemind_test`: 233 files passed, 0 skipped; 2492 tests passed, 0 failed (357 s). The count is higher than the 2341 of the first report because the base branch now includes DIS-73 (merged in `e12bf8b`).
- `npm run lint`: clean. `npm run typecheck`: 0 errors. `npm run lint:architecture`: 0 errors, 1 warning (the pre-existing `no-orphans`). `npm run docs:coverage`: clean. No Stryker re-run (assertions added, no production code changed).

### Fingerprint check (task 10.9)
- `npm run seed:build` rewrote nothing: `git status --porcelain` shows only the files of this addendum's edits and the local, never staged `.claude/sdd-harness.env` (no change in `seeds/graph-dump.sql` or `packages/web/src/data/sample-projects.ts`).
- The `seed.*` analyzer and contract fingerprints (`sha256:6c2180ea...`, `sha256:597c2e98...`) of `seeds/cache/acme-shop.json`, `seeds/cache/task-api.json`, `seeds/drift/acme-shop.json` and `docs/measurements/graph-quality.json` equal the header of `seeds/graph-dump.sql`; the answer and drift fingerprints and the DIS-110 signatures are untouched (commit `f26c898`, header fingerprint lines only).
- `npx vitest run tests/unit/seed/golden-coherence.spec.ts tests/unit/seed/drift-golden-coherence.spec.ts`: 2 files, 3 tests passed.
- `verify` evidence: the CI `verify` job of PR #105 on the head commit (its own `verify` database); collected in 14.2. No local `npm run verify`.

### State of the local database `codemind` (task 10.10)
- `project` 2, `cache_entry` 7, `cache_entry` with an embedding 0, `query_log` 0 (`max(created_at)` none), `claim` 0; no `.stryker-tmp/`; `node scripts/dev-processes.mjs stop` run.
- `cache_entry` is 7 and not the 6 of the 10.1 baseline: the extra row is the key `drift:` of project acme-shop, loaded by `db:seed` at 2026-11-04 01:44 UTC (same `created_at` as every seed row) after the base branch merge brought the DIS-73 drift golden file. It is a seed row of the merged base, not a leftover of this change's tests (those run on `codemind_test`), so it is kept and the new baseline is 7. Migration `0005_embedding-768` stays applied.

## Addendum: CI of PR #105 (task 14.2)

*Agent's text: written by the agent of the review step in an autonomous run, without the author. Date: 2026-11-04.*

- Head `77db509` (before the reviews): CI run 41812095131, every check green (`quality`, `verify`, `e2e`, `mutation`, `scope`, `secrets`; `frontend` in run 41812095051).
- Head `430d98a` (fixes V1 and V2 of the pre-merge reviews): run 41816454640, `verify` red with `FINGERPRINT_MISMATCH` (`reason: seed`), because the V2 fix edits `queries.ts`, a seed fingerprint input. CI fix 1 of 2: commit `5caadbf` refreshes the `analyzer-fingerprint` as in task 10.9 (task 14.6.5); checked locally with `npx vitest run tests/unit/seed` (7 files, 18 tests) and `npm run verify` on a scratch database `verify_dis67` (6/6 golden answers match; the database was dropped). GitHub kept the PR on `430d98a` after that push for more than 8 minutes, so the empty commit `4d4e6a2` re-sent the push event.
- Head `4d4e6a2`: CI run 41819095373 (https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/41819095373) and Frontend run 41819095448, every check green: `quality` (the whole suite with the new spec files `tests/unit/cache/similarity-cache.spec.ts`, `tests/unit/explain/explain-similarity.spec.ts` and the extended integration specs), `verify` (6/6), `e2e`, `mutation` (incremental; mutation score 93.94 over all files, break threshold 80; the `semantic-cache` scenario tests listed as killing mutants), `scope`, `secrets`, `frontend`.
- The commit of this addendum only adds report text; its CI is checked by the review step before it returns.
