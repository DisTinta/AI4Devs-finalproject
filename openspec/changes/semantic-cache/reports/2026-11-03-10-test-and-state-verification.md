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
