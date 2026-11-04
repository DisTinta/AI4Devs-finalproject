CHANGES REQUIRED

# Spec audit — `cache-hit-rate` (DIS-69, parent DIS-46)

- Date: 2026-11-04
- Inputs read: `proposal.md`, `design.md`, `tasks.md`, the seven deltas (`semantic-cache`, `graph-store`, `http-ask`, `ask-page`, `cli-projects`, `golden-answers`, `seed-load`); Linear DIS-69 (description `[original]` / `[reality-map]` / `[enhanced]`, 5 comments) and parent DIS-46 (description, 2 comments); `docs/base-standards.md`, `docs/openspec-tasks-mandatory-steps.md`, `docs/project-context.md` and `docs/backend-standards.md` (targeted), the main specs the deltas touch, ADRs `20261103-embeddings-stay-on-llm-port.md` and `20261017-stale-fingerprint-fails-verify.md`; code: `packages/api/src/routes/ask.ts`, `packages/cli/src/commands/projects.ts`, `packages/cli/src/cache/golden-file.ts`, `packages/core/src/cache/similarity-cache.ts`, `packages/core/src/explain/usage.ts`, `packages/adapters/store-postgres/src/postgres-store.ts`, `tests/support/in-memory-store.ts`, `tests/support/embedding-vector.ts`, `tests/unit/api/ask.spec.ts`, `tests/integration/api/ask.spec.ts`, `tests/integration/cli/cache-build.spec.ts`, `tests/unit/seed/golden-reviews.spec.ts`.

## Questions for the author

- **Q1 — AC5 demo rephrasing (design S12).** The `[enhanced]` AC5 of DIS-69 (and parent DIS-46 AC1) names «Explícame el cálculo del precio final». The change replaces it with «¿Cómo se calcula el precio total de un pedido?» because DIS-67 measured 0.8321 (below 0.85). The evidence supports the swap, but it changes a ticket acceptance criterion. Do you accept the replacement? Either way, the `[enhanced]` text of DIS-69 must stop naming the old question (see the Linear corrections). Today only a comment records the swap, although Follow-ups S12 says "recorded in the Linear ticket".
- **Q2 — Re-embedding after a model change (design R3).** R3 says "rerun `cache:embed` after a model change". Two sources say vectors are not re-embedded on a model change: the DIS-46 non-goal ("No re-embebe entradas al cambiar de modelo (cambiar modelo = vaciar caché)") and ADR `20261103-embeddings-stay-on-llm-port.md` → Consequences ("Vectors are never re-embedded"). Those statements are about stored cache entries, not versioned seed files, but the wording clashes. Please confirm the reading the change should state (see I6).
- **Q3 — Representation of the hit rate.** The DIS-46 AC says "el hit rate del proyecto es 0.4". The change publishes `hitRatePct: 40` and writes «40 %» and `(40%)`. The DIS-69 `[enhanced]` already chose a percentage (AC1–AC4). Please confirm the percentage form satisfies the parent AC. No artifact change is needed if you do.

---

## 1. Scope against the ticket

Clean. Every capability, requirement and task follows from the DIS-69 `[original]` DoD ("Métrica visible en web y CLI; `seeds/cache` incluye vectores") and from its `[enhanced]` decisions F1–F12:
- `cache:embed` is F6.
- `usage.projectCache` is F3. It replaces the parent's hypothesis `usage.cacheHitRate`, which the sub-issue explicitly re-decided.
- Dropping `cache_entry.hit_count` is F1. It departs from the parent's technical context, which named it, but the sub-issue decides that.

Nothing widens the change to the rest of DIS-46: the similarity step, the threshold and the degradation belong to DIS-67 and are not touched. The exported `isUsableVector` (task 7.3) is an implementation detail inside the change. The only deviation from the ticket is the AC5 rephrasing (Q1).

## 2. Inherited acceptance criteria

| Parent / sub-issue AC | Requirement → scenario | Status |
|---|---|---|
| DIS-46 AC5: 10 queries, 4 hits → hit rate 0.4, shown in CLI and `UsagePanel` | `semantic-cache` "Project cache hit rate" → "The hit rate is rounded…" (10,4 → 40); `ask-page` "Usage panel" → "An answer from the model shows its usage panel"; `cli-projects` "Project listing" → "Sample and user projects are listed" (`cache 4/10 (40%)`) | Covered (representation: Q3) |
| DIS-69 AC1 metric, `ProjectNotFound`, Postgres = in-memory | `graph-store` "Explain query counts" (3 scenarios); `semantic-cache` (2 scenarios) | Covered |
| DIS-69 AC2 API, `{2,2,100}`, UNKNOWN without usage, OpenAPI, `500` | `http-ask` "Ask answered response" (3 new or modified scenarios), "Ask in the OpenAPI document" | Covered, but see B2 |
| DIS-69 AC3 web line, `0 de 1 consulta`, `sin consultas`, a11y | `ask-page` 4 scenarios + "The project cache line is written with its counts"; a11y via task 5.4 | Covered |
| DIS-69 AC4 CLI field, `cache 0/0`, DB unchanged | `cli-projects` "Sample and user projects are listed" | Covered |
| DIS-69 AC5 vectors, responses and reviews unchanged, `db:seed` stores them, live rephrasing hit, `cache:embed` errors | `golden-answers` "Golden embeddings command" (4 scenarios), "The versioned golden file is coherent"; `seed-load` (2 modified scenarios + "A rephrased golden question is a similarity hit after the seed") | Covered with the S12 rephrasing (Q1). "Responses and reviews unchanged" is only a task-level check (9.3); B1 makes it a spec rule |

No inherited criterion is missing. There is no scope disagreement between DIS-69 and DIS-46 beyond Q1 and Q3.

## 3. Missing scenarios

- **I1 (improvable)** — `cli-projects` "Project listing": "With no project … no count SHALL be read" has no scenario. "An empty database lists no projects" cannot observe it, because the integration run uses the real store. Correction: in the scenario "A failing count read is an unexpected error", add a GIVEN case "then a listing that returns no project" and the THEN clause "stdout is exactly `no projects` and the count read was never called". This covers it at unit level with the seam of task 6.1.
- **I2 (improvable)** — `golden-answers` "Golden embeddings command": the two `INTERNAL` messages (`cache embed failed; nothing was written` / `cache embed failed after writing …`) have no scenario. Task 8.3 tests them "as a boundary case below the scenarios". Correction: add the scenario "A failed write leaves the golden files intact", mirroring `cache:build`'s "A failed write leaves the previous golden file intact" and "A failure in the second project keeps the first project's new file". Task 8.3 then implements it as a named scenario test.
- **I3 (improvable)** — the same requirement has two clauses without a scenario:
  - "No output SHALL contain an absolute path, the model's base URL or its API key, a question, an answer text or a vector component";
  - "Each embedding request SHALL be limited by the model configuration's time limit".

  Correction: in "A failed embedding leaves the golden file intact", run with `LLM_BASE_URL=http://127.0.0.1:1/v1` and `LLM_API_KEY=k3y`, and add to the THEN clause "no output contains `127.0.0.1:1`, `k3y`, the scratch directory's absolute path, any `question` or any vector component". In "Golden question embeddings are written without touching the answers", add "the model client is built with the `LLM_TIMEOUT_MS` limit of the configuration and the default request function".
- **I4 (improvable)** — `graph-store` "Explain query counts": "on its own connections it SHALL hold no transaction open after it returns" has no scenario. Correction: in "Explain queries and cache hits are counted per project", add a fourth read through a pooled store and the THEN clause "and, read through the store's own connections, no connection is left in a transaction". Alternatively, cite in the requirement the existing pooled-read scenario of `graph-store` that `runProjectQuery` already satisfies.

Every other MUST or SHALL clause has a scenario.

## 4. Ambiguity

None of «fast», «easy», «secure», «efficient», «many», «appropriate» or «robust» appears in the change. Two loose words appear in `design.md`:
- **I5 (improvable)** — `design.md` R6: "negligible at the project's volumes". Correction: "one indexed `count` over `query_log` rows of one project; measured in step 13 on the scratch database: N rows, < X ms". Record the value in the step 13 report.
- **I5b (improvable)** — `design.md` S7: "an embedding is short". Correction: "one embedding request of one question (< 200 characters), bounded by `LLM_TIMEOUT_MS`".

## 5. Open decisions

- **B3 (blocking)** — The signature of `toPublicAnswer` is left open. Design S3 says the second parameter is "used only for an answered answer". Task 4.3 edits the existing test "throws on a statement citing an evidence id absent from the answer…" "only if the new signature … requires a second argument". The implementer must decide alone whether `projectCache` is optional, and what an answered answer without it does: omit the key, which then fails the strict response schema as `500`, or throw. A test pins this name and signature. Correction in `design.md` S3: "`toPublicAnswer(answer: ExplainAnswer, projectCache?: ProjectCacheHitRate): AskResponse`; for an answered answer `projectCache` is required at runtime: its absence throws `Error('an answered answer needs the project cache hit rate')` (a route defect, `500`); it is ignored for `UNKNOWN`". Task 4.3 then names the existing test edit unconditionally: "the call gains a `projectCache` argument; the assertion stays".
- **B2** (section 6) is also an unresolved error case.
- Minor point folded into I8: the precision at which a stored vector equals V.

## 6. Contradictions inside the change

- **B2 (blocking)** — `ProjectNotFound` raised by the count read: the spec says `500`, the code would answer `404`. The `http-ask` delta says "A failure of that read SHALL answer `500` `INTERNAL`, like any other unexpected error", and design S3 says "A rejection of the read propagates to the error handler: `500 INTERNAL` (no domain mapping)". But the route's domain table maps `PROJECT_NOT_FOUND` to `404` (`packages/api/src/routes/ask.ts:20`, `ASK_DOMAIN_ERRORS`). `countExplainQueries` throws `ProjectNotFound` when the project disappears between `getProject`/`explain` and the read (a concurrent delete or reindex). That case would propagate and answer `404 PROJECT_NOT_FOUND`, not `500`.

  Correction: make the spec match the error table. In `http-ask` "Ask answered response", replace the sentence with: "A `ProjectNotFound` of that read (the project was deleted after the use case answered) SHALL answer `404` `PROJECT_NOT_FOUND`, as the route's error table maps it; any other failure of that read SHALL answer `500` `INTERNAL`, like any other unexpected error; in both cases the answer was already logged and, when cacheable, saved by the use case." In design S3, replace "(no domain mapping)" with "(a `ProjectNotFound` keeps the table's `404`; any other error is `500`)". Also add a case to "The hit rate is read only for an answered question and its failure answers INTERNAL": a fourth run with `failCountExplainQueries` returning `new ProjectNotFound(id)` answers `404` with the `PROJECT_NOT_FOUND` body.
- Proposal, design and specs otherwise agree. The tasks 13.2 and 14.2 arithmetic (3/3 → 3/4 after an `UNKNOWN`; 1/1 → 2/2 → 3/4) matches design → Context ("every other `explain` answer, `UNKNOWN` included, writes [a row] with `false`").
- **I10 (improvable)** — Follow-ups row S12 says "recorded in the Linear ticket". Only a comment records it; the `[enhanced]` AC5 still names the old question. Fixed by the Linear correction below.

## 7. Contradictions with the project

- **B1 (blocking)** — The change contradicts the main spec `openspec/specs/golden-answers/spec.md` → "Signatures of the reviewed golden answers" (lines 669–680): "against the version committed by the r2 regeneration commit …, nothing but `reviews` SHALL change in it, so nothing `verify` reads changes".
  - This change adds `questionEmbedding` to every entry of both versioned files (S10) and rewrites `seed.analyzerFingerprint` (S11).
  - After `/opsx:archive` the main spec would state a rule the repository breaks. The DIS-67 E1 fingerprint refresh already strains it.
  - It is also the rule that makes design S10's claim ("the DIS-110 r2 signatures stay valid and no panel round is needed") hold, and today no spec states that claim.

  Correction: add a MODIFIED "Signatures of the reviewed golden answers" to the `golden-answers` delta. Copy the full requirement and its two scenarios, and replace the last sentence with: "Each file SHALL stay the canonical render of its value, and, against the version committed by the r2 regeneration commit (task-api `Q1` alone regenerated; acme-shop untouched by it), every entry's `id`, `question`, `questionNormalized` and `response` SHALL be unchanged: only `reviews`, the `seed` fingerprints (refreshed without regenerating any answer, as in DIS-67 E1 and DIS-69) and `questionEmbedding` (filled by "Golden embeddings command") may change, so nothing `verify` compares and nothing the panel judged changes." Add the THEN clause "and, with every `questionEmbedding` set to `null` and the `seed` fingerprints ignored, each entry's `response` equals the one the panel input projects" to "Every golden answer judged correct or partial carries both panel signatures" (`tests/unit/seed/golden-reviews.spec.ts` gains that assertion). Then add that test to tasks 9.4 and 10.2.
- **I7 (improvable)** — ADR `docs/adr/20261017-stale-fingerprint-fails-verify.md` → Consequences says that a PR touching a seed fingerprint input runs "`npm run seed:build` and then `npm run cache:build`". Design S11 skips `cache:build` and copies the new fingerprint into the golden files, following the DIS-67 E1 precedent. That is sound, because the seed rows and the answer fingerprint do not change. Correction: in S11, cite the ADR and state the condition that makes the copy equivalent: "`seeds/graph-dump.sql` rows unchanged (checked in 9.1) and no `ANSWER_FINGERPRINT_FILES` input changed, so a `cache:build` would answer over the same seed; ADR 20261017 is not amended".
- **I6 (improvable)** — `design.md` R3 against ADR `20261103-embeddings-stay-on-llm-port.md` ("Vectors are never re-embedded") and the DIS-46 non-goal (Q2). Correction: reword R3 to "The versioned vectors belong to `nomic-embed-text`. A different 768-dimension embedding model makes the seeded vectors incomparable: per ADR 20261103 the operator invalidates the cache; no stored entry is re-embedded. Changing the reference model of the versioned files is a new change that reruns `cache:embed` on the files and reseeds." Also add to R3 that the golden file does not record the embedding model, so `db:seed` cannot detect the mismatch (accepted, D). Recording it would change the format (`generatedWith.embedModel`); that is a scope decision for the author.
- `backend-standards.md`: clean. The route holds no SQL (`GUARD_DB_IN_HTTP`), entities are serialised field by field (S3 builds `projectCache` from core's pure function), and no dependency is added. The other main specs are not duplicated: the rounding rule is referenced from `explain` "Answer usage", not restated.

## 8. Contrast with the real code

- `runProjectQuery` exists (`packages/adapters/store-postgres/src/postgres-store.ts:244`) and matches S2: malformed id → `ProjectNotFound` before any statement; zero rows → `ProjectNotFound`. The S2 SQL (`LEFT JOIN` + `GROUP BY p.id`) returns one row for an existing project, so it fits. `query_log_project_id_idx` exists (`migrations/0003_indexes-stale.up.sql:19`).
- `usableVector` (`packages/core/src/cache/similarity-cache.ts:36`) takes an `EmbeddingResult`, not a vector. S6 and task 7.3 extract `isUsableVector(vector)` and do not duplicate the rule. Good.
- `savingsPct` (`packages/core/src/explain/usage.ts:18-22`) is `Math.round(x*1000/d)/10`, the same rule S1 cites. Good.
- `formatProjectLine(project)` (`packages/cli/src/commands/projects.ts:75`) and the `listProjects` seam (`:25`) match S5. The counts must be read inside the `try` at `:46-51`, before the `finally` rollback. S5 says so.
- `toPublicAnswer(answer)` (`packages/api/src/routes/ask.ts:72`): see B3. `ASK_DOMAIN_ERRORS` (`:19-20`): see B2.
- `goldenFileSchema` (`packages/cli/src/cache/golden-file.ts:63-86`) is strict, and `renderGoldenFile` re-parses through it (`:99`). The S6 change slots in. `cache-build.ts:184` builds new entries with the four keys and must add `questionEmbedding: null` (S8, task 7.4). Good.
- **I8 (improvable)** — pgvector stores single-precision components. The `seed-load` scenario "Golden answers are loaded and served in evaluation mode" asserts "the first row's `question_embedding` is V". That holds only if V's components are exact in single precision. `tests/support/embedding-vector.ts` builds integer components, so it holds, but the spec does not say so. Correction: in that scenario, write "a usable vector V of small integer components (`embeddingVector`)"; in design S9, note that stored vectors are single-precision, so the versioned double-precision vectors are rounded on load, which leaves the cosine similarity of the "rephrased golden question" scenario at ≈ 1.
- The unit API tests build the app over the in-memory store (`tests/unit/api/ask.spec.ts:78`), so answered requests will reach the new method. Task 2.3 provides it. Good.

## 9. Task size

- **I9 (improvable)** — Task 5.3 bundles two fixture edits, three modified tests, one loosened negative check, one new test and the `UsagePanel` implementation. Split it into 5.3a (fixtures + the two modified usage-panel tests, RED), 5.3b ("No saving…" check change + new test "A project without logged queries shows no hit rate", RED) and 5.3c (`UsagePanel.tsx`, GREEN).
- **I9b (improvable)** — Task 11.2 (DEMO step 5 + `projects` output recaptured in three shells against a scratch database) depends on step 14's database and duplicates 13.5. Point it at the 13.5 evidence, or move the recapture to after 13.5.
- **I9c (improvable)** — Task 16.7 combines the archive, its commit and the merge. Split it into 16.7 (`/opsx:archive` + commit) and 16.8 (merge through the gate, autonomous run only).

Every other task fits one agent turn.

## 10. Mandatory steps

Clean.
- Step 0 is the branch creation (`feature/dis-69-cache-hit-rate`, 0.1), with verification (0.2) and a baseline (0.3).
- The mandatory groups are present and labelled: 10 Review and Update Existing Tests, 11 Docs, 12 Run Tests and Verify Data State (report path `reports/YYYY-MM-DD-12-test-and-state-verification.md`), 13 Manual Interface Testing (AGENT MUST EXECUTE), 14 End-to-End (AGENT MUST EXECUTE) and 16 Pre-merge Review, last, with the three checks in order, fixes on the same PR, and the archive commit before the merge.
- Docs before tests is justified in the group 11 note (the docs gate).
- Mutating tasks restore state: 9.1 restores `sample-projects.ts`, 12.6 checks the post-test state, 13.6 and 14.5 drop the scratch database and stop the servers. The live checks never run `db:seed` on the shared database (S13).
- Opening the PR (16.1) and merging (16.7) without confirming with the author are allowed only by the autonomous-run rule (`docs/AUTONOMOUS-RUN.md` §5, ADR `20261020-kit-autonomous-mode.md`). 16.7 states that condition.

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| semantic-cache: Project cache hit rate | The hit rate is rounded to one decimal and null without queries | 1.1, 1.2 |
| | Impossible counts are rejected | 1.3 |
| graph-store: Explain query counts | Explain queries and cache hits are counted per project | 3.1, 3.2 |
| | Counting the queries of an unknown project fails | 3.3 |
| | The in-memory double counts explain queries like the database | 2.1, 2.2, 2.3 |
| http-ask: Ask answered response | An answered question returns only the public fields over the seed | 4.4 |
| | Evidence ids are renumbered in evidence order (unchanged) | 10.3 (existing test) |
| | Internal fields of the answer are not sent (unchanged) | 10.3 (existing test) |
| | A statement citing an unknown evidence id answers INTERNAL (unchanged) | 4.3 (call signature, see B3), 10.3 |
| | The usage carries the project's cache hit rate over the seed | 4.4 |
| | The hit rate is read only for an answered question and its failure answers INTERNAL | 4.1, 4.2 (+ B2 case) |
| http-ask: Ask in the OpenAPI document | The document lists ask with its parameter, body and responses | 4.3 |
| ask-page: Usage panel | An answer from the model shows its usage panel | 5.3 |
| | A cache hit shows its usage panel | 5.3 |
| | No saving is not shown as a saving | 5.3 |
| | A project without logged queries shows no hit rate | 5.3 |
| | The usage panel and the states follow the wireframe | 14.2, 14.3 |
| ask-page: How usage figures and notice details are written | Confidence / Tokens / Cost / Latency / Savings / Budget reset / Rate-limit wait (unchanged) | 10.3 (existing tests) |
| | The project cache line is written with its counts | 5.1, 5.2 |
| cli-projects: Project listing | Sample and user projects are listed | 6.4 |
| | An empty database lists no projects (unchanged) | 6.4 |
| | Configuration, connection and usage errors (unchanged) | 10.3 (existing test) |
| | The cache field writes the hit rate with at most one decimal | 6.1, 6.2 |
| | A failing count read is an unexpected error | 6.1, 6.2 (+ I1 case) |
| golden-answers: Golden embeddings command | Golden question embeddings are written without touching the answers | 8.3 |
| | Embedding arguments and configuration are checked before any file | 8.1, 8.2 |
| | An invalid golden file stops the embedding before any request | 8.3 |
| | A failed embedding leaves the golden file intact | 8.3 |
| golden-answers: Golden file format | The canonical render is stable | 7.2, 7.3 |
| | Golden files with an invalid shape are rejected | 7.2, 7.3 |
| golden-answers: Partial regeneration | Only the named question is regenerated | 7.4 |
| | A stale golden file is not partially regenerated (unchanged) | 10.3 (existing test) |
| golden-answers: The versioned golden file is coherent | The versioned golden file matches the seed, the questions and the code | 9.3, 9.4 |
| | The versioned task-api golden file matches the seed, the questions and the code | 9.3, 9.4 |
| golden-answers: Signatures of the reviewed golden answers (to add, B1) | Every golden answer judged correct or partial carries both panel signatures | **hole until B1 is applied** → 9.4 / 10.2 |
| seed-load: Golden answers are loaded with the seed | Golden answers are loaded and served in evaluation mode | 7.5 |
| | A seed without golden files loads only the graph (unchanged) | 10.3 (existing test) |
| | Loading golden answers again does not duplicate them | 7.5 |
| | A failed golden save leaves the database unchanged (unchanged) | 10.3 (existing test) |
| | A rephrased golden question is a similarity hit after the seed | 7.6 (green after 9.3) |

Every scenario of the current deltas maps to a task. The single hole is the requirement B1 adds; it closes when B1's correction adds the scenario edit to tasks 9.4 and 10.2.

---

## Corrections to apply

### `openspec/changes/cache-hit-rate/specs/golden-answers/spec.md`

1. **(B1)** Under `## MODIFIED Requirements`, add `### Requirement: Signatures of the reviewed golden answers`, copied in full from `openspec/specs/golden-answers/spec.md` lines 669–694. Replace its last sentence with: "Each file SHALL stay the canonical render of its value, and, against the version committed by the r2 regeneration commit (task-api `Q1` alone regenerated; acme-shop untouched by it), every entry's `id`, `question`, `questionNormalized` and `response` SHALL be unchanged: only `reviews`, the `seed` fingerprints (refreshed without regenerating any answer, as in DIS-67 E1 and DIS-69) and `questionEmbedding` (filled by "Golden embeddings command") may change, so nothing `verify` compares and nothing the panel judged changes." Add to the THEN clause of "Every golden answer judged correct or partial carries both panel signatures": "and each entry's `question` and `response` equal those the panel input projects (`answer`, statements and evidence)".
2. **(I2)** Under "Golden embeddings command", add:
   `#### Scenario: A failed write leaves the golden files intact` — GIVEN previous golden files of acme-shop and task-api with known contents, a valid configuration and a model that answers every entry; first a failure while acme-shop's file is written, then a failure while task-api's file is written. WHEN the embeddings command runs without arguments. THEN each run exits with `1` and `INTERNAL`: the first with the message `cache embed failed; nothing was written`, both files unchanged and stdout empty; the second with `cache embed failed after writing <acme-shop file>; <task-api file> was not written — run npm run cache:embed -- --project task-api`, stdout exactly `acme-shop: 3 question embeddings -> <acme-shop file>`, the acme-shop file holding its new vectors and the task-api file unchanged; no `.tmp` file remains.
3. **(I3)** In "A failed embedding leaves the golden file intact", GIVEN: the configuration has `LLM_BASE_URL=http://127.0.0.1:1/v1` and `LLM_API_KEY=k3y`. THEN: add "and no output contains `127.0.0.1:1`, `k3y`, the scratch directory's absolute path, any golden `question` or any vector component". In "Golden question embeddings are written without touching the answers", THEN: add "the model client is built with the configuration's `LLM_TIMEOUT_MS` limit and the default request function".

### `openspec/changes/cache-hit-rate/specs/http-ask/spec.md`

4. **(B2)** In "Ask answered response", replace "A failure of that read SHALL answer `500` `INTERNAL`, like any other unexpected error; the answer was already logged and, when cacheable, saved by the use case." with: "A `ProjectNotFound` of that read (the project was deleted after the use case answered) SHALL answer `404` `PROJECT_NOT_FOUND`, as the route's error table maps it; any other failure of that read SHALL answer `500` `INTERNAL`, like any other unexpected error; in both cases the answer was already logged and, when cacheable, saved by the use case."
5. **(B2)** In "The hit rate is read only for an answered question and its failure answers INTERNAL", GIVEN: add "then the first use case with the store's explain query counts failing with `ProjectNotFound`". THEN: add "the fourth answers `404` with the body exactly `{ "error": { "code": "PROJECT_NOT_FOUND", "message": "project not found", "details": {} } }`".

### `openspec/changes/cache-hit-rate/specs/cli-projects/spec.md`

6. **(I1)** In "A failing count read is an unexpected error", GIVEN: add "; then a listing that returns no project". THEN: add "; and, for the empty listing, it exits with `0`, stdout is exactly `no projects` and the count read was never called".

### `openspec/changes/cache-hit-rate/specs/graph-store/spec.md`

7. **(I4)** In "Explain queries and cache hits are counted per project", WHEN: add "then A again through the store's own pooled connections". THEN: add "and that read leaves no connection of the pool in a transaction".

### `openspec/changes/cache-hit-rate/specs/seed-load/spec.md`

8. **(I8)** In "Golden answers are loaded and served in evaluation mode", replace "a usable vector V" with "a usable vector V of small integer components (exact in single precision)".

### `openspec/changes/cache-hit-rate/design.md`

9. **(B3)** S3: replace "passes the result to `toPublicAnswer(explained, projectCache)`, whose second parameter is used only for an answered answer" with "passes the result to `toPublicAnswer(answer: ExplainAnswer, projectCache?: ProjectCacheHitRate): AskResponse`; for an answered answer the parameter is required at runtime (its absence throws `Error('an answered answer needs the project cache hit rate')`, a route defect, `500`); it is ignored for `UNKNOWN`".
10. **(B2)** S3: replace "A rejection of the read propagates to the error handler: `500 INTERNAL` (no domain mapping)." with "A rejection of the read propagates to the error handler: a `ProjectNotFound` keeps the table's `404 PROJECT_NOT_FOUND` (`ASK_DOMAIN_ERRORS`); any other error is `500 INTERNAL`."
11. **(I7)** S11: add "ADR 20261017 asks for `seed:build` then `cache:build`; `cache:build` is skipped because the seed rows do not change (checked in 9.1) and no `ANSWER_FINGERPRINT_FILES` input changes, so a rebuild would answer over the same seed (precedent DIS-67 E1). The ADR is not amended."
12. **(I6)** R3: replace with "The versioned vectors belong to `nomic-embed-text`. A different 768-dimension embedding model makes the seeded vectors incomparable: per ADR 20261103 the operator invalidates the cache; no stored entry is re-embedded. Changing the reference model of the versioned files is a new change that reruns `cache:embed` on the files and reseeds. The golden file does not record the embedding model, so `db:seed` cannot detect a mismatch. Accepted (D)."
13. **(I8)** S9: add "pgvector stores single-precision components: the versioned double-precision vectors are rounded on load, which keeps the cosine similarity of a key with its own stored vector ≈ 1."
14. **(I5)** R6: replace "negligible at the project's volumes" with "one indexed `count` over one project's `query_log` rows; the row count and the latency measured in step 13 are recorded in its report". S7: replace "an embedding is short" with "one embedding request of one question (< 200 characters), bounded by `LLM_TIMEOUT_MS`".
15. Follow-ups table: add rows for B1, B2, B3 and I1–I10 with destination **A** — this change (I6's model-recording suggestion: **D** — accepted, unless the author decides otherwise in Q2). Fix the S12 row text to "recorded in the `[enhanced]` part of DIS-69 by a comment" once the Linear correction is applied.

### `openspec/changes/cache-hit-rate/tasks.md`

16. **(B3)** 4.3: replace "only if the new signature of `toPublicAnswer` requires a second argument (the call gains it, the assertion stays)" with "its call gains a `projectCache` argument (the assertion stays)".
17. **(B2)** 4.1: add "and a fourth case with `failCountExplainQueries` returning `ProjectNotFound` (404)".
18. **(B1)** 9.4: add "`tests/unit/seed/golden-reviews.spec.ts` 'Every golden answer judged correct or partial carries both panel signatures' gains the modified scenario's assertion (RED on a file whose response was altered in the test, GREEN on the 9.3 files); no assertion removed". Replace "stays unchanged and green" accordingly. 10.2: add 9.4's golden-reviews edit to the list.
19. **(I1)** 6.1: add the empty-listing case to "A failing count read is an unexpected error".
20. **(I2, I3)** 8.3: replace "an injected write failure gives `INTERNAL` with the messages of the requirement, tested as a boundary case below the scenarios" with the new scenario "A failed write leaves the golden files intact" (RED → GREEN), and add the I3 assertions to the two named scenarios.
21. **(I4)** 3.1: add the pooled-read case.
22. **(I9)** Split 5.3 into 5.3a/5.3b/5.3c (fixtures and modified tests RED; "No saving…" change and new test RED; `UsagePanel.tsx` GREEN). Make 11.2 reuse the 13.5 evidence, or order it after 13.5. Split 16.7 into 16.7 (archive + commit) and 16.8 (merge, autonomous run only).

### Linear DIS-69 (Spanish; never edit the `[original]` block)

23. **(Q1, I10)** In the `[enhanced]` part, AC5, replace «*Cuando* … «Explícame el cálculo del precio final» sobre acme-shop recién sembrado se sirve desde la entrada golden de Q1» with: «con `LLM_EMBED_MODEL=nomic-embed-text` en vivo, «¿Cómo se calcula el precio total de un pedido?» sobre acme-shop recién sembrado se sirve desde la entrada golden de Q1 (`usage.cacheHit: true`). La reformulación original, «Explícame el cálculo del precio final», dio 0,8321 con `nomic-embed-text` en la calibración de DIS-67, por debajo del umbral 0,85 (decisión S12 del cambio `cache-hit-rate`, pendiente de confirmar por la autora).»
24. Add a comment: «*Texto del agente (auditoría de spec del cambio `cache-hit-rate`, 2026-11-04).* Veredicto: CHANGES REQUIRED, con 3 hallazgos bloqueantes. (B1) El cambio de los ficheros golden contradice la regla «nada salvo `reviews`» de «Signatures of the reviewed golden answers»; el delta la modifica para permitir `questionEmbedding` y las huellas del seed manteniendo `question` y `response`. (B2) Un `ProjectNotFound` en la lectura de la métrica responde `404`, como mapea la tabla de errores de la ruta, no `500`. (B3) Queda fijada la firma de `toPublicAnswer`. Preguntas para la autora: aceptar la reformulación de la demo (S12); cómo se lee la R3 frente al non-goal de DIS-46 y el ADR de embeddings («no se re-embeben entradas»); y si el porcentaje (`40`) cumple el «0.4» del criterio de DIS-46.»

---

## Resolution of run 1

- Date: 2026-11-04 (correction round 1 of the autonomous run).
- *Agent's text: the questions for the author were answered and every finding was resolved by the agent as lead engineer, without the author. Each decision is in `design.md` → Follow-ups, table "Spec audit, run 1", with its destination; none has destination C.*
- `openspec validate cache-hit-rate --strict`: the change is valid after the corrections.

### Questions for the author

| Id | Resolution |
|---|---|
| Q1 | Decided by the agent: the rephrasing is accepted. «Explícame el cálculo del precio final» measured 0.8321 < 0.85 and cannot meet AC5 without recalibrating the threshold (out of scope, F9). AC5 of the `[enhanced]` part of DIS-69 was rewritten in Linear to name «¿Cómo se calcula el precio total de un pedido?» and the measurement; AC2 of the same part now states the `404` of B2. The `[original]` part is untouched. Design S12 records it. |
| Q2 | Decided by the agent: R3 now follows ADR 20261103 and the DIS-46 non-goal (a model change invalidates the cache; no stored entry is re-embedded; rerunning `cache:embed` only belongs to a new change of the versioned files' reference model). |
| Q3 | Decided by the agent: `hitRatePct: 40` is the same value as the parent's «0.4» in the representation the `[enhanced]` part already chose. No artifact change. |

### Findings

| Id | Resolution |
|---|---|
| B1 | Fixed. The `golden-answers` delta gains MODIFIED "Signatures of the reviewed golden answers" with the corrected last sentence (only `reviews`, the `seed` fingerprints and `questionEmbedding` may change) and both scenarios copied; the signatures scenario also checks that each judged entry's `question` and `response` project exactly onto its panel input item. Tasks 9.4 and 10.2 name the edit of the existing test in `tests/unit/seed/golden-reviews.spec.ts`. Design S10 cites the requirement. |
| B2 | Fixed. `http-ask` "Ask answered response": a `ProjectNotFound` of the count read answers `404` `PROJECT_NOT_FOUND`, any other failure `500` `INTERNAL`; the scenario gains the fourth case with the exact `404` body (message `project not found`, checked in `ASK_DOMAIN_ERRORS`). Design S3 and task 4.1 updated; the F3 row of Follow-ups notes it. |
| B3 | Fixed. Design S3 fixes `toPublicAnswer(answer: ExplainAnswer, projectCache?: ProjectCacheHitRate): AskResponse`, throwing for an answered answer without it and ignoring it for `UNKNOWN`. Tasks 4.2 and 4.3 name the signature and the unconditional edit of the existing test call. |
| I1 | Fixed. `cli-projects` "A failing count read is an unexpected error" gains the empty-listing case (`no projects`, exit `0`, no count read); task 6.1. |
| I2 | Fixed. New scenario "A failed write leaves the golden files intact" in `golden-answers` with both `INTERNAL` messages; task 8.3 implements it as a named scenario test instead of a boundary case. |
| I3 | Fixed. "A failed embedding leaves the golden file intact" runs with `LLM_BASE_URL=http://127.0.0.1:1/v1` and `LLM_API_KEY=k3y` and asserts that no output leaks them, the scratch path, a question or a vector component; "Golden question embeddings are written without touching the answers" asserts the `LLM_TIMEOUT_MS` client and the default request function. Task 8.3 updated. |
| I4 | Fixed by the audit's alternative, decided by the agent: the clause now refers to "Opening a pooled store from a URL" (no transaction held open between calls), whose scenarios already cover pooled reads, so it is no longer a new SHALL without a scenario. Task 3.1 unchanged. |
| I5 | Fixed. R6 names the indexed count and records the row count and the latency measured in task 13.4 (`EXPLAIN ANALYZE` on the scratch database). |
| I5b | Fixed. S7: one embedding request of one question (< 200 characters), bounded by `LLM_TIMEOUT_MS`. |
| I6 | Fixed (R3 reworded, see Q2). The suggestion to record the embedding model in the golden file was decided by the agent as not done (destination D): it would change the format for a mismatch the operator already handles by invalidating the cache. |
| I7 | Fixed. S11 cites ADR 20261017 and the condition that makes skipping `cache:build` equivalent; the ADR is not amended. |
| I8 | Fixed. `seed-load` "Golden answers are loaded and served in evaluation mode" uses a vector V of small integer components (exact in single precision); design S9 notes the single-precision storage. |
| I9 | Fixed. Task 5.3 split into 5.3a (fixtures and modified tests, RED), 5.3b (negative check and new test, RED) and 5.3c (`UsagePanel.tsx`, GREEN); task 10.2 lists 5.3a and 5.3b. |
| I9b | Fixed. Task 11.2 reuses the Git Bash captures of 13.2–13.3 and the PowerShell captures of 13.5 and is done after 13.5; no second scratch-database recapture. |
| I9c | Fixed. Task 16.7 is the archive and its commit; the new 16.8 is the merge, autonomous run only. |
| I10 | Fixed. The S12 row of Follow-ups points to the rewritten AC5 of DIS-69; the Linear correction was applied. |

---

## Run 2 (2026-11-04)

CHANGES REQUIRED

# Spec audit, run 2: `cache-hit-rate` (DIS-69, parent DIS-46)

- Date: 2026-11-04
- Inputs read:
  - The change: `proposal.md`, `design.md`, `tasks.md` and the seven deltas (`semantic-cache`, `graph-store`, `http-ask`, `ask-page`, `cli-projects`, `golden-answers`, `seed-load`). Also `reports/2026-11-04-spec-audit.md` (run 1 and its resolution), read for context.
  - Linear: DIS-69 (`[original]`, `[reality-map]`, `[enhanced]`, 6 comments) and parent DIS-46 (description, 2 comments).
  - Project docs: `docs/base-standards.md`, `docs/openspec-tasks-mandatory-steps.md` and `docs/project-context.md` (targeted: fingerprint policy, golden files).
  - Main specs: the MODIFIED requirements of `http-ask`, `ask-page`, `cli-projects`, `golden-answers` and `seed-load`. Every scenario of the main requirements was checked as copied.
  - ADRs: `20261017-stale-fingerprint-fails-verify`, `20261103-drift-golden-freshness-in-unit-suite`, `20261103-embeddings-stay-on-llm-port`, `20261026-autonomous-audit-correction-rounds`.
  - Code: `packages/api/src/routes/ask.ts`, `packages/cli/src/commands/projects.ts`, `packages/cli/src/commands/ask.ts`, `packages/cli/src/cache/golden-file.ts`, `packages/cli/src/seed-load.ts`, `packages/cli/src/cache-build.ts`, `packages/core/src/explain/explain.ts`, `packages/core/src/knowledge/query-log.ts`, `packages/adapters/llm/src/config.ts`, `tests/support/in-memory-store.ts`. Tests that read `seeds/cache/`: `tests/unit/seed/golden-coherence.spec.ts`, `tests/integration/cli/verify.spec.ts` and others.

## Questions for the author

None. The run 1 answers the agent recorded (Q1 to Q3) contradict neither the ticket nor the project, so they are accepted as decided.

---

## 1. Scope against the ticket

Clean. Everything follows from the DIS-69 DoD ("Métrica visible en web y CLI; `seeds/cache` incluye vectores") and from the `[enhanced]` decisions F1 to F12:
- the metric and the store read: F1, F2;
- `usage.projectCache`: F3;
- the web line: F4;
- the CLI field: F5;
- `questionEmbedding` and `cache:embed`: F6;
- `db:seed` storing the vectors: F7;
- the fingerprint refresh: F8.

The MODIFIED "Signatures of the reviewed golden answers" requirement is needed: without it the change would break the main spec. It is not new scope. Nothing widens the change to the rest of DIS-46: the similarity step, the threshold and the evaluation-mode fallback are not touched.

## 2. Inherited acceptance criteria

| AC | Requirement → scenario | Status |
|---|---|---|
| DIS-46: 10 queries with 4 hits give hit rate 0.4, shown in the CLI and in `UsagePanel` | `semantic-cache` "The hit rate is rounded…" (10, 4 → 40); `ask-page` "An answer from the model shows its usage panel"; `cli-projects` "Sample and user projects are listed" (`cache 4/10 (40%)`) | Covered (Q3 of run 1: the percentage form is accepted) |
| DIS-69 AC1: metric, `ProjectNotFound`, Postgres equals in-memory | `graph-store` "Explain query counts" (3 scenarios); `semantic-cache` (2 scenarios) | Covered |
| DIS-69 AC2: API `{2,2,100}`, `UNKNOWN` without usage, OpenAPI, `500`, or `404` for `ProjectNotFound` | `http-ask` "The usage carries…", "The hit rate is read only…" (4 cases), "The document lists ask…" | Covered |
| DIS-69 AC3: web line, «0 de 1 consulta», «sin consultas», accessibility | `ask-page`: the 4 usage-panel scenarios and "The project cache line is written with its counts"; the axe fixture in task 5.4 | Covered |
| DIS-69 AC4: CLI `cache 4/10 (40%)` and `cache 0/0`, database unchanged | `cli-projects` "Sample and user projects are listed" | Covered |
| DIS-69 AC5: vectors present, `response` and `reviews` unchanged, `db:seed` stores the vectors, live rephrasing hit, `cache:embed` errors | `golden-answers` "Golden embeddings command" (5 scenarios), "The versioned golden file is coherent", MODIFIED "Signatures…"; `seed-load` (2 modified scenarios and "A rephrased golden question is a similarity hit after the seed") | Covered. The task order breaks it, see B1 |

No inherited criterion is missing, and the sub-issue and the parent do not disagree on scope.

## 3. Missing scenarios

- **I5 (improvable).** In `golden-answers`, the MODIFIED "Signatures of the reviewed golden answers" requires that each entry's `response` be unchanged against the r2 regeneration commit. Its scenario only checks the projection onto the panel input: `answer`, statements, and evidence paths and lines. Nothing in the suite checks `excerpt`, `verification`, `confidence` or `usage`; only the uncommitted scratch script of task 9.3 compares the whole value. That projection check also duplicates the existing scenario "The panel input projects the golden answers without their verification" (`openspec/specs/golden-answers/spec.md`, lines 550–557), which already compares the input file with the projection of the current golden files. Correction, either one:
  - (a) Narrow the sentence to "every entry's `id`, `question`, `questionNormalized`, and the parts of `response` the panel judged (`answer`, statements and evidence, as "Blind panel input of the golden review" projects them) SHALL be unchanged". Then drop the new THEN clause, which repeats the panel-input scenario.
  - (b) Keep the sentence, and make the 9.3 comparison a committed test assertion.

Every other MUST or SHALL clause of the deltas has a scenario. The run 1 fixes I1 to I4 are in place.

## 4. Ambiguity

Clean. None of «fast», «easy», «secure», «efficient», «many» (only "how many"), «appropriate» or «robust» appears in the proposal, the design, the specs or the tasks. "Small integer components" is qualified with "exact in single precision". "About 768 / 770 lines" is descriptive (R5) and no test depends on it.

## 5. Open decisions

- **B1 (blocking): nothing migrates the two versioned golden files to the new format, so the task sequence cannot be executed.**
  - Task 7.3 makes `questionEmbedding` a mandatory key of `goldenFileSchema` (S6). From then on, `seeds/cache/acme-shop.json` and `seeds/cache/task-api.json`, which have no such key, fail `checkGoldenFile` (`packages/cli/src/cache/golden-file.ts:127-129`).
  - `npm run cache:embed` (task 9.3) first reads and checks every requested golden file "by the checks `db:seed` applies". By its own spec it would therefore stop with `INVALID_SEED` on exactly the files it is meant to fill.
  - The scenario "Golden question embeddings are written without touching the answers" (task 8.3) copies the versioned files as its input, so it cannot go green.
  - Task 7.6 would fail with `INVALID_SEED`, not "on the missing vector" as it says.
  - From 7.3 on, every existing test that reads the versioned files turns red, and no task foresees it: `tests/unit/seed/golden-coherence.spec.ts:31-37`, `tests/integration/cli/verify.spec.ts:27-30`, `tests/integration/cli/ask-command.spec.ts`, `tests/integration/cli/drift-command.spec.ts`, `tests/unit/seed/golden-reviews.spec.ts`, `tests/unit/cli/verify.spec.ts`, `tests/unit/cli/seed-load.spec.ts`, `tests/unit/seed/suggested-questions-coherence.spec.ts`.
  - Task 9.3 compares the result with "the 9.1 file with the key set to `null`", which assumes a migrated file exists.
  - Design S6 says the two files are "migrated in this change", but no step does it. The implementer would have to decide alone how, when, and with what check.

  Correction: add a task right after 7.3, and before 7.5, 7.6 and 8.x, that migrates both files. Also state the step in design S6 and in the Migration Plan.

## 6. Contradictions inside the change

- **I1 (improvable): the proposal was not updated after run 1.**
  - `proposal.md` → What Changes → API still says "A failing read answers `500 INTERNAL`". The spec, design S3 and the ticket AC2 now say that a `ProjectNotFound` from the read answers `404 PROJECT_NOT_FOUND`.
  - `proposal.md` → Capabilities → `http-ask` mentions only "the `500` of a failing read".
  - `proposal.md` → Capabilities → `golden-answers` does not list the MODIFIED "Signatures of the reviewed golden answers" that the delta now holds.
- **I2 (improvable): task 5.3b narrows an existing negative assertion, while task 10.2 says "No assertion is weakened".** "No saving is not shown as a saving" changes "no text «%»" to "no text «% vs bruto»". The region now accepts any «%» outside the savings badge, not only the one of the new line. Correction: keep the original check at full strength over the content it covered. In the scenario, write "…and no text «ahorro -», «ahorro 0» nor «%» before the project cache line" (or "outside the project cache line"). Task 5.3b then keeps the «%» check scoped to the text before that line, and 10.2 stays true. If the narrowing is kept instead, 10.2 must list it as the one deliberate exception, with its reason, in the step 12 report.

Proposal, design and specs agree on everything else. Checked:
- the arithmetic of 13.2 (3/3 → 3/4) and 14.2 (1/1 → 2/2 → 3/4) against `explain.ts:146-151, 215, 218`: every return, `UNKNOWN` included, writes a row;
- the six calls of the in-memory scenario;
- the rounding examples ((16, 1) → 6.3; (3, 2) → 66.7).

## 7. Contradictions with the project

- **I3 (improvable): the drift golden report and the regeneration recipe.**
  - `docs/project-context.md` (lines 1472–1477) and ADR `docs/adr/20261103-drift-golden-freshness-in-unit-suite.md` (Decision: "a `seed:build` … needs `npm run drift:build` in the same change") set the order `seed:build` → `cache:build` → `drift:build`.
  - Design S11 copies the new analyzer fingerprint into `seeds/drift/acme-shop.json` without `drift:build`. It cites only ADR 20261017, and only for skipping `cache:build`.
  - The skip is sound for the same reason: the seed rows are unchanged and no `DRIFT_FINGERPRINT_FILES` input changes. But neither the design nor the tasks state it, and `tests/unit/seed/drift-golden-coherence.spec.ts` is the check that will judge it.

  Correction: in S11, add the ADR and the condition. In 9.1, run that spec.
- `docs/backend-standards.md`: clean. The route holds no SQL (`GUARD_DB_IN_HTTP`); `projectCache` is built field by field from the core's pure function; no dependency is added.
- No main spec is duplicated. The MODIFIED requirements copy every scenario of their main counterparts, checked one by one:
  - `http-ask` "Ask answered response": 4 of 4;
  - `http-ask` "Ask in the OpenAPI document": 1 of 1;
  - `ask-page` "Usage panel": 4 of 4;
  - `ask-page` "How usage figures…": 7 of 7;
  - `cli-projects`: 3 of 3;
  - `golden-answers` "Golden file format", "Partial regeneration", "The versioned golden file is coherent" and "Signatures…": all;
  - `seed-load`: 4 of 4.

  So `/opsx:archive` removes nothing.

## 8. Contrast with the real code

- `ASK_DOMAIN_ERRORS` maps `PROJECT_NOT_FOUND` to `404 'project not found'` (`packages/api/src/routes/ask.ts:20`). This matches the fourth case of the `http-ask` scenario. `toPublicAnswer(answer)` (`:72`) and the event log before the return (`:152-153`) match S3.
- `formatProjectLine(project)` (`packages/cli/src/commands/projects.ts:75`). The counts must be read inside the `try` at `:46-48`, before the `finally` rollback. S5 and task 6.2 say so.
- `llmConfigFromEnv` returns evaluation mode only when both `LLM_BASE_URL` and `LLM_API_KEY` are absent, and accepts live mode without an API key (`packages/adapters/llm/src/config.ts:79-95`). This matches the spec and the 9.3 command line.
- **I6 (improvable).** The same function validates `DAILY_BUDGET_USD` against `COST_TABLE` (`config.ts:96-108`), and `npm run cache:embed` loads `.env` (`--import=./scripts/load-env.mjs`). The spec sentence "the daily ceiling `DAILY_BUDGET_USD` SHALL NOT be applied" can be read as "not read". Correction: write "SHALL NOT be applied (no budget meter); a `DAILY_BUDGET_USD` that the model configuration rejects still fails with `LLM_CONFIG_INVALID`, as `ask` reports it".
- `toFailure` of `packages/cli/src/commands/ask.ts:283-313` maps `LlmUnavailable` and `LlmConfigError` as S7 needs. `cache-build.ts:379` uses `longFetch`, and S7 deliberately uses the default request function. The `INVALID_SEED` message exists (`packages/cli/src/seed-load.ts:180`).
- `seed-load.ts:235` calls `saveCacheEntry` without an embedding, and S9 passes it.
- `QueryLogEntry.capability` exists (`packages/core/src/knowledge/query-log.ts:22`). The in-memory double keeps `queryLogRows` (`tests/support/in-memory-store.ts:289, 515-522`) and has the `fail…?: () => unknown` pattern (`:278`) that S2 extends.
- `renderGoldenFile` re-parses through the schema (`golden-file.ts:98-106`), so the new key's position follows the schema order, as S6 says.
- **I4 (improvable).** Task 13.3 expects "`usage.cacheHit: true`" from `npm run cli -- ask`, but the CLI `ask` prints no usage (`cli-ask` spec; `commands/ask.ts:109`). Correction: observe the hit through the `query_log` row of that call (`cache_hit = true`, zero tokens) and the `hit_count` of `Q1`'s `cache_entry`, both in SQL.
- See B1: `golden-file.ts:127-129` against the versioned files, and the tests that read `seeds/cache/`.

## 9. Task size

Clean. Every task fits one agent turn after the run 1 splits (5.3a/b/c, 16.7/16.8). The migration task that B1 adds is one script run, one diff check and one targeted test run.

## 10. Mandatory steps

Clean.
- Step 0 is the branch (`feature/dis-69-cache-hit-rate`), with verification (0.2) and a baseline (0.3).
- The mandatory groups are present and labelled: 10 Review and Update Existing Tests, 11 Docs (its order is justified by the docs gate), 12 Run Tests and Verify Data State (report `reports/YYYY-MM-DD-12-test-and-state-verification.md`), 13 Manual Interface Testing (AGENT MUST EXECUTE), 14 End-to-End (AGENT MUST EXECUTE) and 16 Pre-merge Review, last. Group 16 has the three checks in order, fixes on the same PR, and the archive commit (16.7) before the merge (16.8, autonomous run only, `docs/AUTONOMOUS-RUN.md` §5).
- Mutating steps restore state: 9.1 restores `sample-projects.ts`, 12.6, 13.6 and 14.5 restore theirs, and no `db:seed` runs on the shared database (S13).
- The PowerShell checks run through `pwsh -NoProfile` and `powershell.exe -NoProfile` without `$env:` (13.5).

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| semantic-cache: Project cache hit rate | The hit rate is rounded to one decimal and null without queries | 1.1, 1.2 |
| | Impossible counts are rejected | 1.3 |
| graph-store: Explain query counts | Explain queries and cache hits are counted per project | 3.1, 3.2 |
| | Counting the queries of an unknown project fails | 3.3 |
| | The in-memory double counts explain queries like the database | 2.1, 2.2, 2.3 |
| http-ask: Ask answered response | An answered question returns only the public fields over the seed | 4.4 |
| | Evidence ids are renumbered in evidence order (unchanged) | 10.3 |
| | Internal fields of the answer are not sent (unchanged) | 10.3 |
| | A statement citing an unknown evidence id answers INTERNAL | 4.3, 10.3 |
| | The usage carries the project's cache hit rate over the seed | 4.4 |
| | The hit rate is read only for an answered question and its failure answers INTERNAL | 4.1, 4.2 |
| http-ask: Ask in the OpenAPI document | The document lists ask with its parameter, body and responses | 4.3 |
| ask-page: Usage panel | An answer from the model shows its usage panel | 5.3a, 5.3c |
| | A cache hit shows its usage panel | 5.3a, 5.3c |
| | No saving is not shown as a saving | 5.3b (see I2) |
| | A project without logged queries shows no hit rate | 5.3b, 5.3c |
| | The usage panel and the states follow the wireframe | 14.2, 14.3 |
| ask-page: How usage figures and notice details are written | The 7 unchanged scenarios | 10.3 |
| | The project cache line is written with its counts | 5.1, 5.2 |
| cli-projects: Project listing | Sample and user projects are listed | 6.4 |
| | An empty database lists no projects (unchanged) | 6.4 |
| | Configuration, connection and usage errors (unchanged) | 10.3 |
| | The cache field writes the hit rate with at most one decimal | 6.1, 6.2 |
| | A failing count read is an unexpected error | 6.1, 6.2 |
| golden-answers: Golden embeddings command | Golden question embeddings are written without touching the answers | 8.3 (needs the B1 migration first) |
| | Embedding arguments and configuration are checked before any file | 8.1, 8.2 |
| | An invalid golden file stops the embedding before any request | 8.3 |
| | A failed embedding leaves the golden file intact | 8.3 |
| | A failed write leaves the golden files intact | 8.3 |
| golden-answers: Signatures of the reviewed golden answers | Every golden answer judged correct or partial carries both panel signatures | 9.4, 10.2 |
| | A golden answer judged incorrect carries no signature (unchanged) | 10.3 |
| golden-answers: Golden file format | The canonical render is stable | 7.2, 7.3 |
| | Golden files with an invalid shape are rejected | 7.2, 7.3 |
| golden-answers: Partial regeneration | Only the named question is regenerated | 7.4 |
| | A stale golden file is not partially regenerated (unchanged) | 10.3 |
| golden-answers: The versioned golden file is coherent | The versioned golden file matches the seed, the questions and the code | 9.3, 9.4 |
| | The versioned task-api golden file matches the seed, the questions and the code | 9.3, 9.4 |
| seed-load: Golden answers are loaded with the seed | Golden answers are loaded and served in evaluation mode | 7.5 |
| | A seed without golden files loads only the graph (unchanged) | 10.3 |
| | Loading golden answers again does not duplicate them | 7.5 |
| | A failed golden save leaves the database unchanged (unchanged) | 10.3 |
| | A rephrased golden question is a similarity hit after the seed | 7.6 (needs the B1 migration, then green after 9.3) |

No row is empty. Two rows depend on the B1 migration task, which does not exist yet.

---

## Corrections to apply

### `openspec/changes/cache-hit-rate/tasks.md`

1. **(B1)** After 7.3, insert:
   > - [ ] 7.3b Migrate the versioned golden files to the new format (design S6): with a scratchpad script (not committed), parse `seeds/cache/acme-shop.json` and `seeds/cache/task-api.json`, add `questionEmbedding: null` to every entry and write `renderGoldenFile` of the value; `git diff --numstat seeds/cache` shows only the six added `"questionEmbedding": null,` lines and no removed line; `npx vitest run tests/unit/seed tests/unit/cli tests/integration/cli/verify.spec.ts tests/integration/cli/ask-command.spec.ts tests/integration/cli/drift-command.spec.ts` green (the vector check of the coherence test only arrives in 9.4); record `git hash-object` of both files for 9.3
2. **(B1)** In 7.6, replace "see it fail on the missing vector" with "see it fail on the `null` vectors of the 7.3b files".
3. **(B1)** In 9.3, replace "the 9.1 file" with "the file after 7.3b and 9.1".
4. **(B1)** In 8.4, add: "the versioned files read by these tests are the 7.3b files".
5. **(I3)** In 9.1, add: "and `tests/unit/seed/drift-golden-coherence.spec.ts` green with the copied fingerprint (no `drift:build`: design S11)".
6. **(I2)** In 5.3b, replace "changes its negative check from «%» to «% vs bruto» (the new line holds «%»)" with "keeps its negative check «%», scoped to the region's text before the project cache line (the new line holds «%»)". Only if the narrowing is kept instead: in 10.2, add "5.3b is the only narrowed assertion; its reason is recorded in the step 12 report".
7. **(I4)** In 13.3, replace "(`usage.cacheHit: true`, no completion; that entry's `hit_count` 1, checked in SQL)" with "(the call's `query_log` row has `cache_hit = true` and zero tokens, and `Q1`'s `cache_entry.hit_count` is 1, both checked in SQL; the CLI `ask` prints no usage)".

### `openspec/changes/cache-hit-rate/design.md`

8. **(B1)** In S6, after "migrated in this change", add: "first with `questionEmbedding: null` in every entry (task 7.3b, a canonical re-render that only adds the key), then with the vectors of `cache:embed` (S10)". In the Migration Plan, change the order to: code and tests → versioned files migrated with `null` (7.3b) → seed fingerprints refreshed (S11) → `cache:embed` run (S10) → docs.
9. **(I3)** In S11, add: "ADR 20261103-drift-golden-freshness-in-unit-suite and `docs/project-context.md` add `drift:build` to the recipe; it is skipped for the same reason: no `DRIFT_FINGERPRINT_FILES` input changes and the seed rows do not change, so `tests/unit/seed/drift-golden-coherence.spec.ts` stays green with the copied fingerprint (precedent DIS-67 E1). Neither ADR is amended."
10. In Follow-ups, add a table "Spec audit, run 2" with rows B1, I1 to I6 and their destinations.

### `openspec/changes/cache-hit-rate/proposal.md`

11. **(I1)** In What Changes → API, replace "A failing read answers `500 INTERNAL`." with "A `ProjectNotFound` of the read (project deleted after the answer) answers `404 PROJECT_NOT_FOUND`; any other failing read answers `500 INTERNAL`."
12. **(I1)** In Capabilities → `http-ask`, replace "the `500` of a failing read" with "the `404`/`500` of a failing read".
13. **(I1)** In Capabilities → `golden-answers`, add "and "Signatures of the reviewed golden answers" (only `reviews`, the `seed` fingerprints and `questionEmbedding` may change)" to the MODIFIED list.
14. **(B1)** In What Changes → Golden answers with vectors, add: "the two versioned files are first migrated with `questionEmbedding: null`".

### `openspec/changes/cache-hit-rate/specs/ask-page/spec.md`

15. **(I2)** In "No saving is not shown as a saving", THEN: replace "and no text «ahorro -», «ahorro 0» nor «% vs bruto»" with "and no text «ahorro -», «ahorro 0» nor «%» before the project cache line".

### `openspec/changes/cache-hit-rate/specs/golden-answers/spec.md`

16. **(I5, choose one)**
    - (a) In "Signatures of the reviewed golden answers", replace "every entry's `id`, `question`, `questionNormalized` and `response` SHALL be unchanged" with "every entry's `id`, `question`, `questionNormalized`, and the parts of its `response` the panel judged (as "Blind panel input of the golden review" projects them) SHALL be unchanged". Then remove the added THEN clause of "Every golden answer judged correct or partial carries both panel signatures", which repeats "The panel input projects the golden answers without their verification".
    - (b) Keep the sentence, and make the 9.3 comparison a committed assertion of `tests/unit/seed/golden-coherence.spec.ts`.
17. **(I6)** In "Golden embeddings command", replace "the daily ceiling `DAILY_BUDGET_USD` SHALL NOT be applied" with "the daily ceiling `DAILY_BUDGET_USD` SHALL NOT be applied (no budget meter); a value the model configuration rejects still fails with `LLM_CONFIG_INVALID`, as `ask` reports it".

### Linear DIS-69 (Spanish; the `[original]` block is never edited)

18. Add a comment:
    > *Texto del agente (auditoría de spec del cambio `cache-hit-rate`, ronda 2, 2026-11-04).* Veredicto: CHANGES REQUIRED, con 1 hallazgo bloqueante.
    >
    > (B1) Al hacer obligatoria la clave `questionEmbedding`, los ficheros versionados `seeds/cache/*.json` dejan de pasar la comprobación del formato. Entonces `npm run cache:embed` no podría leerlos, y los tests que los leen fallarían desde la tarea 7.3. Se añade una tarea 7.3b que migra los dos ficheros con `questionEmbedding: null` (un re-render canónico que solo añade la clave); después, `cache:embed` rellena los vectores.
    >
    > Mejorables:
    > - la propuesta recoge el `404` de B2 y el requisito de firmas;
    > - la comprobación negativa «%» del panel de uso se mantiene completa delante de la línea nueva;
    > - S11 cita el ADR de frescura del informe golden de drift, que no necesita `drift:build`;
    > - la comprobación manual 13.3 mira el acierto en `query_log`, porque `ask` de la CLI no imprime la usage;
    > - la redacción de `DAILY_BUDGET_USD` en `cache:embed`;
    > - el alcance del requisito de firmas frente a su escenario.
19. Optional, in the `[enhanced]` part, Contexto técnico → Golden: replace "lee la configuración del modelo como `cache:build`" with "lee la configuración del modelo como `ask` (sin `longFetch`; decisión S7 del cambio)".

---

## Resolution of run 2

- Date: 2026-11-04 (correction round 2 of the autonomous run).
- *Agent's text: every finding was resolved by the agent as lead engineer, without the author. Run 2 had no question for the author. Each decision is in `design.md` → Follow-ups, table "Spec audit, run 2", with its destination; none has destination C.*
- `openspec validate cache-hit-rate --strict`: the change is valid after the corrections.

### Findings

| Id | Resolution |
|---|---|
| B1 | Fixed. New task 7.3b, right after 7.3 and before 7.5, 7.6 and 8.x, migrates `seeds/cache/acme-shop.json` and `seeds/cache/task-api.json` with `questionEmbedding: null` through `renderGoldenFile`. It checks that the diff only adds the six key lines, runs the tests that read the versioned files, and records the hashes for 9.3. Task 7.6 now fails on the `null` vectors of the 7.3b files, 8.4 names the 7.3b files, and 9.3 compares against the file after 7.3b and 9.1. Design S6 describes the two-step migration, the Migration Plan gains the step, and the proposal states it. |
| I1 | Fixed. Proposal → What Changes → API states the `404 PROJECT_NOT_FOUND` of a `ProjectNotFound` read and the `500 INTERNAL` of any other failure. Capabilities → `http-ask` says "the `404`/`500` of a failing read". Capabilities → `golden-answers` lists the MODIFIED "Signatures of the reviewed golden answers". |
| I2 | Fixed, at full strength: `ask-page` "No saving is not shown as a saving" now reads "no text «ahorro -», «ahorro 0» nor «%» before the project cache line". Task 5.3b keeps the «%» check scoped to the text before that line, so no assertion is weakened and 10.2 holds without exception. |
| I3 | Fixed. Design S11 cites ADR `20261103-drift-golden-freshness-in-unit-suite` and `docs/project-context.md`: `drift:build` is skipped because no `DRIFT_FINGERPRINT_FILES` input and no seed row changes. Neither ADR is amended. Task 9.1 runs `tests/unit/seed/drift-golden-coherence.spec.ts` green with the copied fingerprint. |
| I4 | Fixed. Task 13.3 observes the live similarity hit in SQL: the call's `query_log` row has `cache_hit = true` and zero tokens, and `Q1`'s `cache_entry.hit_count` is 1. The CLI `ask` prints no usage. |
| I5 | Decided by the agent: option (a), the narrower one. "Signatures of the reviewed golden answers" now requires unchanged `id`, `question`, `questionNormalized` and the parts of `response` the panel judged, as "Blind panel input of the golden review" projects them. The THEN clause added in run 1 is removed, because the existing test "The panel input projects the golden answers without their verification" (`tests/unit/seed/golden-reviews.spec.ts:100`) already compares the input file with the projection of the current golden files. The scenario is back to the main spec's text, and `golden-reviews.spec.ts` is no longer edited (tasks 9.4, 10.2). The full-value comparison stays the scratch check of 9.3, recorded in the step 12 report. |
| I6 | Fixed. "Golden embeddings command": `DAILY_BUDGET_USD` is not applied (no budget meter), but a value the model configuration rejects still fails with `LLM_CONFIG_INVALID`, as `ask` reports it. Checked: `nomic-embed-text` is priced in `COST_TABLE` (`packages/core/src/llm/cost-table.ts:22`), so a valid budget does not block the 9.3 run. |
| Linear 18 | Done: a Spanish comment summarises run 2 and this round's decisions. |
| Linear 19 (optional) | Done. In the `[enhanced]` part of DIS-69, Contexto técnico → Golden now says `cache:embed` reads the model configuration as `ask` does (no `longFetch`, decision S7). The `[original]` part is untouched. |

---

## Run 3 (2026-11-04)

CHANGES REQUIRED

# Spec audit, run 3: `cache-hit-rate` (DIS-69, parent DIS-46)

- Date: 2026-11-04
- Inputs read:
  - The change: `proposal.md`, `design.md` (Follow-ups up to the run 2 table), `tasks.md`, and the seven deltas (`semantic-cache`, `graph-store`, `http-ask`, `ask-page`, `cli-projects`, `golden-answers`, `seed-load`). I also read `reports/2026-11-04-spec-audit.md` (runs 1 and 2 and how they were resolved) for context.
  - Linear: DIS-69 (`[original]`, `[reality-map]`, `[enhanced]` with AC1–AC5 and F1–F12, 7 comments) and parent DIS-46 (description, 2 comments).
  - Project docs: `docs/base-standards.md` §7.1, and `docs/project-context.md` (the seed fingerprint inputs, lines 1351–1358).
  - Code:
    - `packages/api/src/routes/ask.ts` (lines 72–154)
    - `packages/api/src/app.ts:36`
    - `packages/adapters/store-postgres/src/postgres-store.ts:244-254`
    - `packages/cli/src/seed-load.ts:221-237`
    - `packages/cli/src/cache/answer-fingerprint.ts:13-27`
    - `packages/cli/src/cache/drift-golden-file.ts:160-171`
    - `packages/web/src/components/project-display.ts:68`
    - `packages/core/src/cache/similarity-cache.ts:36`
  - Tests:
    - `tests/unit/cli/seed-load.spec.ts`
    - `tests/unit/seed/golden-coherence.spec.ts`
    - `tests/integration/cli/verify.spec.ts`
    - `tests/e2e/ask-flow.spec.ts`
    - every test that reads `questionNormalized`

## Questions for the author

None. The answers the agent recorded in runs 1 and 2 (Q1–Q3, and the I5 option (a)) contradict neither the ticket nor the project, so I accept them as decided.

---

## 1. Scope against the ticket

Clean. Each part of the change traces to the DoD of DIS-69 ("Métrica visible en web y CLI; `seeds/cache` incluye vectores") and to the `[enhanced]` decisions:

| Part of the change | Ticket source |
|---|---|
| Metric and the store read | F1, F2 |
| `usage.projectCache` | F3 |
| Web line | F4 |
| CLI field | F5 |
| `questionEmbedding` and `cache:embed` | F6 |
| `db:seed` storing the vectors | F7 |
| Fingerprint refresh | F8 |

The MODIFIED "Signatures of the reviewed golden answers" is needed to stay consistent with the main spec; it is not new scope. Nothing extends the change into the similarity step of DIS-46, its threshold or its degradation.

## 2. Inherited acceptance criteria

| AC | Requirement → scenario | Status |
|---|---|---|
| DIS-46: 10 queries, 4 hits → hit rate 0.4, shown in CLI and `UsagePanel` | `semantic-cache` "The hit rate is rounded…" (10, 4 → 40); `ask-page` "An answer from the model shows its usage panel"; `cli-projects` "Sample and user projects are listed" (`cache 4/10 (40%)`) | Covered (percentage form accepted, run 1 Q3) |
| DIS-69 AC1: metric, `ProjectNotFound`, Postgres equals in-memory | `graph-store` "Explain query counts" (3 scenarios); `semantic-cache` (2 scenarios) | Covered |
| DIS-69 AC2: `{2,2,100}`, `UNKNOWN` without usage, OpenAPI, `500` / `404` | `http-ask` "The usage carries…", "The hit rate is read only…" (4 cases), "The document lists ask…" | Covered |
| DIS-69 AC3: web line, «0 de 1 consulta», «sin consultas», a11y | `ask-page`: 4 usage-panel scenarios and "The project cache line is written with its counts"; axe fixture (5.4) | Covered |
| DIS-69 AC4: CLI `cache 4/10 (40%)`, `cache 0/0`, database unchanged | `cli-projects` "Sample and user projects are listed" | Covered |
| DIS-69 AC5: vectors, `response`/`reviews` unchanged, `db:seed` stores them, live rephrasing hit, `cache:embed` errors | `golden-answers` "Golden embeddings command" (5 scenarios), "The versioned golden file is coherent", MODIFIED "Signatures…"; `seed-load` (2 modified scenarios and "A rephrased golden question is a similarity hit after the seed") | Covered |

No inherited criterion is missing. The sub-issue and the parent do not disagree on scope.

## 3. Missing scenarios

Clean. Every MUST or SHALL clause of the seven deltas has a scenario, or refers to an existing one: the pooled-connection clause points to "Opening a pooled store from a URL".

## 4. Ambiguity

Clean. A search for «fast», «easy», «secure», «efficient», «many», «appropriate» and «robust» finds only:
- "how many" (`graph-store`, line 5);
- "small integer components", which "exact in single precision" qualifies;
- "a small exported check" (design S6), which is descriptive and pinned by no test.

## 5. Open decisions

- **B1 (blocking): the new `saveCacheEntry` call of design S9 breaks two existing unit assertions that no task names.**
  - Design S9 and task 7.5 fix this call: `saveCacheEntry(projectId, entry.questionNormalized, entry.response, entry.questionEmbedding ?? undefined)`. It always passes a fourth argument, `undefined` for a `null` vector.
  - `tests/unit/cli/seed-load.spec.ts` records every call with `saveCacheEntry: async (...args: unknown[]) => { saves.push(args); }` (lines 422–424 and 519–521).
  - It then asserts three-element arrays:
    - "saves every golden entry after the seed, through the cache store on the transaction client" (line 433): `expect(saves).toEqual(file.entries.map((entry) => [ACME_ID, entry.questionNormalized, entry.response]))`;
    - "saves every golden drift entry under its key after the golden answers, in the same transaction" (line 529): `...golden.entries.map((entry) => [ACME_ID, entry.questionNormalized, entry.response])`.
  - Vitest's `toEqual` compares array lengths, so `[id, key, response, undefined]` does not equal `[id, key, response]`. Both tests turn red at 7.5.
  - No task covers this:
    - task 7.7 names this file only for fixtures, "assertions unchanged";
    - task 7.5 only edits `tests/integration/cli/seed-load.spec.ts`;
    - task 10.2 says "Update only the existing tests this change names".
  - So the implementer would have to decide alone between two options. One is to edit an unnamed assertion. The other is to change the call shape that S9 pins, for example by calling with three arguments when the vector is `null`.
  - **Correction:** keep S9's call and name the edit.
    - Task 7.5 adds: "in `tests/unit/cli/seed-load.spec.ts`, the expected golden saves of 'saves every golden entry after the seed, through the cache store on the transaction client' and 'saves every golden drift entry under its key after the golden answers, in the same transaction' gain the fourth element `entry.questionEmbedding ?? undefined`. The drift saves keep three elements. No assertion is removed: the assertion now also pins the vector argument."
    - Task 10.2 lists 7.5's unit edit.

## 6. Contradictions inside the change

- **I1 (improvable): the RED step of task 9.4, and task 9.1's reference to it, sit in the wrong order.**
  - Task 9.4 says its vector assertion is "seen failing on the 9.1 files, green on the 9.3 files". But 9.4 runs after 9.3, and by then the files already hold the vectors. Seeing it fail would need a revert.
  - Task 9.1 says "green except the vector check of 9.3", a check that does not exist until 9.4.
  - **Correction:**
    - Move the writing of 9.4's assertion before 9.3, as a new task 9.2b: "RED: add the usable-vector assertion to the two tests of `tests/unit/seed/golden-coherence.spec.ts`; see it fail on the `null` vectors of the 7.3b/9.1 files".
    - Leave 9.4 as the GREEN step after 9.3.
    - In 9.1, replace "except the vector check of 9.3" with "(the vector check is added in 9.2b)".
- **I2 (improvable): task 4.4 and the scenario "The usage carries the project's cache hit rate over the seed" save the golden answers differently.**
  - The scenario says the golden answers are saved "as the seed load saves them", which includes the vector after S9.
  - Task 4.4 says "saved with `saveCacheEntry` from `seeds/cache/*.json`" and does not mention the vector.
  - The result does not change, because evaluation mode never embeds. **Correction:** task 4.4 should say "with `entry.questionEmbedding ?? undefined` as the fourth argument, as the seed load passes it".

Everything else in the proposal, the design and the specs agrees. I checked:
- the arithmetic of 13.2 (3/3 → 3/4) and 14.2 (1/1 → 2/2 → 3/4);
- the six calls of the in-memory scenario;
- the six `"questionEmbedding": null` lines of 7.3b (3 entries per file, confirmed by the `MATCHING` list of `tests/integration/cli/verify.spec.ts:48-57`).

## 7. Contradictions with the project

Clean.
- Seed fingerprints (`docs/project-context.md:1351-1358`): the analyzer inputs include `packages/core/src/knowledge` and `packages/adapters/store-postgres/src`, so design S11's refresh is needed. The contract fingerprint (`AnalyzerPort.ts` and `migrations/*.up.sql`) does not change, because there is no migration, so copying only `analyzerFingerprint` is correct.
- `ANSWER_FINGERPRINT_FILES` (`packages/cli/src/cache/answer-fingerprint.ts:13-27`) does not include `similarity-cache.ts`, `hit-rate.ts`, `cache/index.ts`, `knowledge/query-log.ts` or `golden-file.ts`. So the `isUsableVector` export (7.3) and the new modules do not stale the golden answers.
- `DRIFT_FINGERPRINT_FILES` (`drift-golden-file.ts:160-171`) has no input this change edits. Design S11's skip of `drift:build` holds.
- ADRs 20261017 and 20261103 (drift freshness, embeddings on `LlmPort`) are cited and respected. `docs/backend-standards.md` is respected: the route holds no SQL (`GUARD_DB_IN_HTTP`) and no dependency is added.
- No main spec is duplicated. The MODIFIED requirements copy their unchanged scenarios (checked in run 2, and the text has not changed since).

## 8. Contrast with the real code

- `runProjectQuery` (`postgres-store.ts:244-254`) checks the id form, sends one statement, and treats zero rows as `ProjectNotFound`. This matches S2 and the scenario "each read sent exactly one statement".
- `app.deps.store` is a full `StorePort` (`packages/api/src/app.ts:36`). The route calls `explain` with `app.deps` on the same store (`ask.ts:139-153`), so a read after `explain` sees the row it logged. This matches S3.
- `toPublicAnswer(answer)` (`ask.ts:72`) builds `usage` field by field (lines 103–114). S3's second parameter slots in.
- `groupDigits` exists (`packages/web/src/components/project-display.ts:68`) and `usage-display.ts` already imports it. This matches S4.
- `tests/e2e/ask-flow.spec.ts:32-36` only checks patterns inside the «Uso» region, so the new line does not break it. Task 5.4 correctly leaves it out.
- `tests/unit/seed/golden-coherence.spec.ts:13-14` leaves fingerprint freshness to `verify`. `tests/integration/cli/verify.spec.ts:22-23` stubs the fingerprint seams. So the 7.3b test run is not made red by the stale analyzer fingerprint before 9.1. Good.
- See B1: `packages/cli/src/seed-load.ts:235` against `tests/unit/cli/seed-load.spec.ts:422-433, 519-531`.

## 9. Task size

Clean. Every task fits in one agent turn. B1's fix adds two expected-value edits to 7.5; I1 moves one assertion into a new small task, 9.2b.

## 10. Mandatory steps

Clean.
- Step 0 is the branch (`feature/dis-69-cache-hit-rate`, 0.1), with its verification (0.2) and a baseline (0.3).
- The labelled groups are all present:
  - 10 Review and Update Existing Tests;
  - 11 Docs (its order is justified by the docs gate);
  - 12 Run Tests and Verify Data State (report path given);
  - 13 Manual Interface Testing (AGENT MUST EXECUTE);
  - 14 End-to-End (AGENT MUST EXECUTE);
  - 16 Pre-merge Review, last: the three checks in order, fixes on the same PR, the archive commit (16.7) before the merge (16.8, autonomous run only).
- Mutating tasks restore state:
  - 9.1 restores `sample-projects.ts`;
  - 12.6 checks the post-test counts;
  - 13.6 and 14.5 drop the scratch database and stop the servers;
  - `db:seed` never runs on the shared database (S13).

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| semantic-cache: Project cache hit rate | The hit rate is rounded to one decimal and null without queries | 1.1, 1.2 |
| | Impossible counts are rejected | 1.3 |
| graph-store: Explain query counts | Explain queries and cache hits are counted per project | 3.1, 3.2 |
| | Counting the queries of an unknown project fails | 3.3 |
| | The in-memory double counts explain queries like the database | 2.1, 2.2, 2.3 |
| http-ask: Ask answered response | An answered question returns only the public fields over the seed | 4.4 |
| | Evidence ids are renumbered in evidence order (unchanged) | 10.3 |
| | Internal fields of the answer are not sent (unchanged) | 10.3 |
| | A statement citing an unknown evidence id answers INTERNAL | 4.3, 10.3 |
| | The usage carries the project's cache hit rate over the seed | 4.4 |
| | The hit rate is read only for an answered question and its failure answers INTERNAL | 4.1, 4.2 |
| http-ask: Ask in the OpenAPI document | The document lists ask with its parameter, body and responses | 4.3 |
| ask-page: Usage panel | An answer from the model shows its usage panel | 5.3a, 5.3c |
| | A cache hit shows its usage panel | 5.3a, 5.3c |
| | No saving is not shown as a saving | 5.3b |
| | A project without logged queries shows no hit rate | 5.3b, 5.3c |
| | The usage panel and the states follow the wireframe | 14.2, 14.3 |
| ask-page: How usage figures and notice details are written | The 7 unchanged scenarios | 10.3 |
| | The project cache line is written with its counts | 5.1, 5.2 |
| cli-projects: Project listing | Sample and user projects are listed | 6.4 |
| | An empty database lists no projects (unchanged) | 6.4 |
| | Configuration, connection and usage errors (unchanged) | 10.3 |
| | The cache field writes the hit rate with at most one decimal | 6.1, 6.2 |
| | A failing count read is an unexpected error | 6.1, 6.2 |
| golden-answers: Golden embeddings command | Golden question embeddings are written without touching the answers | 8.3 |
| | Embedding arguments and configuration are checked before any file | 8.1, 8.2 |
| | An invalid golden file stops the embedding before any request | 8.3 |
| | A failed embedding leaves the golden file intact | 8.3 |
| | A failed write leaves the golden files intact | 8.3 |
| golden-answers: Signatures of the reviewed golden answers | Every golden answer judged correct or partial carries both panel signatures | 9.4, 10.3 |
| | A golden answer judged incorrect carries no signature (unchanged) | 9.4, 10.3 |
| golden-answers: Golden file format | The canonical render is stable | 7.2, 7.3 |
| | Golden files with an invalid shape are rejected | 7.2, 7.3 |
| golden-answers: Partial regeneration | Only the named question is regenerated | 7.4 |
| | A stale golden file is not partially regenerated (unchanged) | 10.3 |
| golden-answers: The versioned golden file is coherent | The versioned golden file matches the seed, the questions and the code | 9.3, 9.4 (9.2b after I1) |
| | The versioned task-api golden file matches the seed, the questions and the code | 9.3, 9.4 (9.2b after I1) |
| seed-load: Golden answers are loaded with the seed | Golden answers are loaded and served in evaluation mode | 7.5 |
| | A seed without golden files loads only the graph (unchanged) | 10.3 |
| | Loading golden answers again does not duplicate them | 7.5 |
| | A failed golden save leaves the database unchanged (unchanged) | 10.3 |
| | A rephrased golden question is a similarity hit after the seed | 7.6 (green after 9.3) |

No row is empty. The requirement "Golden answers are loaded with the seed" is implemented in 7.5. Its unit-level side effect (B1) is the only missing task edit.

---

## Corrections to apply

### `openspec/changes/cache-hit-rate/tasks.md`

1. **(B1)** In 7.5, after "`packages/cli/src/seed-load.ts` passes the vector to `saveCacheEntry` (design S9)", add:
   "; in `tests/unit/cli/seed-load.spec.ts`, the expected golden saves of 'saves every golden entry after the seed, through the cache store on the transaction client' and 'saves every golden drift entry under its key after the golden answers, in the same transaction' gain the fourth element `entry.questionEmbedding ?? undefined` (the drift saves keep three elements); no assertion removed".
2. **(B1)** In 10.2, add "7.5 (`tests/unit/cli/seed-load.spec.ts`, the two expected-saves edits)" to the list of named edits.
3. **(I1)** Insert before 9.3:
   "- [ ] 9.2b RED: in `tests/unit/seed/golden-coherence.spec.ts`, the existing tests 'The versioned golden file matches the seed, the questions and the code' and 'The versioned task-api golden file matches the seed, the questions and the code' also assert that every `questionEmbedding` is a usable vector; see them fail on the `null` vectors of the 7.3b/9.1 files; no assertion removed".
   In 9.4, replace "RED → GREEN: … also assert that every `questionEmbedding` is a usable vector (seen failing on the 9.1 files, green on the 9.3 files)" with "GREEN: the 9.2b assertions pass on the 9.3 files". In 9.1, replace "green except the vector check of 9.3" with "green (the vector check is added in 9.2b)".
4. **(I2)** In 4.4, replace "golden answers of both projects saved with `saveCacheEntry` from `seeds/cache/*.json` read with `readGoldenFile`" with "golden answers of both projects saved with `saveCacheEntry` from `seeds/cache/*.json` read with `readGoldenFile`, passing `entry.questionEmbedding ?? undefined` as the seed load does".

### `openspec/changes/cache-hit-rate/design.md`

5. **(B1)** In S9, after the `saveCacheEntry(...)` call, add: "The unit test of `seed-load` that records the calls expects this four-argument call (task 7.5)."
6. In Follow-ups, add a table "Spec audit, run 3" with B1, I1 and I2, each with destination **A**, this change.

### Linear DIS-69 (Spanish; the `[original]` block is never edited)

7. Add a comment:
   > *Texto del agente (auditoría de spec del cambio `cache-hit-rate`, ronda 3, 2026-11-04).* Veredicto: CHANGES REQUIRED, con 1 hallazgo bloqueante y sin preguntas para la autora.
   >
   > (B1) La nueva llamada `saveCacheEntry(projectId, clave, respuesta, entry.questionEmbedding ?? undefined)` de la decisión S9 siempre pasa un cuarto argumento. Por eso fallan dos aserciones de `tests/unit/cli/seed-load.spec.ts`: «saves every golden entry after the seed…» y «saves every golden drift entry under its key…», que esperan tres argumentos. Ninguna tarea las nombraba. La tarea 7.5 añade el cuarto elemento esperado y la 10.2 lo registra. No se elimina ninguna aserción.
   >
   > Mejorables:
   > - el RED de la comprobación de vectores de `golden-coherence.spec.ts` pasa a una tarea 9.2b, antes de la ejecución de `cache:embed`;
   > - la tarea 4.4 guarda las golden con su vector, como lo hace la carga de la semilla.

## Resolution of run 3

- Date: 2026-11-04 (correction round 3 of the autonomous run).
- *Agent's text: every finding was resolved by the agent as lead engineer, without the author. Run 3 had no question for the author. Each decision is in `design.md` → Follow-ups, table "Spec audit, run 3", with its destination; none has destination C.*
- `openspec validate cache-hit-rate --strict`: the change is valid after the corrections.

### Findings

| Id | Resolution |
|---|---|
| B1 | Fixed, checked against the code: `saveGoldenAnswers` (`packages/cli/src/seed-load.ts:235`) and the two `toEqual` assertions of `tests/unit/cli/seed-load.spec.ts` (lines 433 and 529) are as the audit describes. Decided by the agent: S9's four-argument call is kept, and the alternative of a three-argument call when the vector is `null` is rejected, because it would add a branch only to keep a test's shape. Task 7.5 now names the edit: the expected golden saves of both tests gain the fourth element `entry.questionEmbedding ?? undefined`, the drift saves keep three elements, and no assertion is removed. Task 10.2 lists this edit. Design S9 states the call shape the unit test expects. |
| I1 | Fixed. New task 9.2b, before 9.3, is the RED step: the two tests of `tests/unit/seed/golden-coherence.spec.ts` also assert that every `questionEmbedding` is a usable vector (`isUsableVector`, task 7.3), and they fail on the `null` vectors of the 7.3b/9.1 files. Task 9.4 is now the GREEN step on the 9.3 files. Task 9.1 says "green (the vector check is added in 9.2b)". Task 10.2 names 9.2b/9.4. |
| I2 | Fixed. Task 4.4 saves the golden answers with `entry.questionEmbedding ?? undefined` as the fourth argument, as the seed load does (design S9). |
| Linear 7 | Done: a Spanish comment summarises run 3 and this round's decisions. |

---

## Run 4 (2026-11-04)

APPROVED

# Spec audit, run 4: `cache-hit-rate` (DIS-69, parent DIS-46)

- Date: 2026-11-04
- Inputs read:
  - The change: `proposal.md`, `design.md` (Follow-ups including the run 3 table), `tasks.md`, the seven deltas (`semantic-cache`, `graph-store`, `http-ask`, `ask-page`, `cli-projects`, `golden-answers`, `seed-load`), and `reports/2026-11-04-spec-audit.md` (runs 1–3 and their resolutions) for context.
  - Linear: DIS-69 (`[original]`, `[reality-map]`, `[enhanced]` with AC1–AC5 and F1–F12, 8 comments including the run 3 resolution) and parent DIS-46 (description, 2 comments).
  - Project: `docs/project-context.md` (seed fingerprint inputs, lines 1029–1030 and 1364–1372), `openspec/specs/http-ask/spec.md` ("Ask answered response"), `openspec/specs/cli-projects/spec.md:46`, `openspec/specs/local-startup/spec.md:110-140`, and the cross-referenced requirements (all resolve: `seed-load`/"Command contract and configuration", `golden-answers`/"A failed build never leaves a broken golden file" and "Blind panel input of the golden review", `graph-store`/"Query log write" and "Opening a pooled store from a URL", `semantic-cache`/"Similarity threshold and embedded text" and "Similarity lookup in explain", `explain`/"Answer usage").
  - Code:
    - `packages/api/src/routes/ask.ts:19-20, 72, 136`
    - `packages/api/src/schemas/ask.ts:36-75`
    - `packages/adapters/llm/src/config.ts:79-110`
    - `packages/adapters/llm/src/create-llm.ts:15`
    - `packages/adapters/llm/src/openai-compatible-llm.ts:15-37`
    - `packages/cli/src/commands/ask.ts:283-319`
    - `packages/cli/src/cache-build.ts:170-249`
    - `packages/cli/src/seed-load.ts:163-215`
    - `packages/cli/src/cache/golden-file.ts:156`
    - `packages/cli/src/cache/write-atomically.ts:14`
    - `packages/core/src/cache/similarity-cache.ts:36`
    - `packages/core/src/llm/cost-table.ts:21-22`
    - `scripts/load-env.mjs`
    - `scripts/measure-context.mjs:458-471`
    - `package.json:26-33`
    - `stryker.config.json`
  - Tests:
    - `tests/unit/api/ask.spec.ts` (the app over the counted in-memory store, lines 77–93; every exact `calls()` assertion)
    - `tests/unit/api/support.ts:96-108`
    - `tests/support/in-memory-store.ts` (query log rows)
    - `tests/integration/api/ask.spec.ts`
    - `tests/integration/api/reindex.spec.ts`
    - `tests/unit/api/reindex.spec.ts`
    - `packages/web/src/pages/AskPage.test.tsx`
    - `tests/unit/seed/drift-golden-coherence.spec.ts:49-54`
    - `tests/unit/scripts/wiring.spec.ts:92-110`
    - every exact `calls).toEqual` in `tests/`

## Questions for the author

None. The decisions the agent recorded in runs 1–3 are consistent with the ticket and the project, so I treat them as settled:
- Q1–Q3 of run 1;
- option (a) of run 2 I5;
- the four-argument call of run 3 B1.

---

## 1. Scope against the ticket

Clean. Every part of the change follows from the DoD of DIS-69 ("Métrica visible en web y CLI; `seeds/cache` incluye vectores") and from the `[enhanced]` decisions:
- F1/F2: the metric and the store read;
- F3: `usage.projectCache`;
- F4: the web line;
- F5: the CLI field;
- F6: `questionEmbedding` and `cache:embed`;
- F7: the vectors stored by `db:seed`;
- F8: the fingerprint refresh.

The MODIFIED "Signatures of the reviewed golden answers" is the consistency edit F6 requires. It is not new scope. Nothing reaches into the similarity step, the threshold or the degradation of DIS-46 (DIS-67).

## 2. Inherited acceptance criteria

| AC | Requirement → scenario | Status |
|---|---|---|
| DIS-46: 10 queries, 4 hits → hit rate 0.4, shown in CLI and `UsagePanel` | `semantic-cache` "The hit rate is rounded…" (10, 4 → 40); `ask-page` "An answer from the model shows its usage panel"; `cli-projects` "Sample and user projects are listed" (`cache 4/10 (40%)`) | Covered (percentage form accepted, run 1 Q3) |
| DIS-69 AC1: metric, `ProjectNotFound`, Postgres equals in-memory | `graph-store` "Explain query counts" (3 scenarios); `semantic-cache` (2 scenarios) | Covered |
| DIS-69 AC2: `{2,2,100}`, `UNKNOWN` without usage, OpenAPI, `500` / `404` | `http-ask` "The usage carries…", "The hit rate is read only…" (4 cases), "The document lists ask…" | Covered |
| DIS-69 AC3: web line, «0 de 1 consulta», «sin consultas», a11y | `ask-page`: 4 usage-panel scenarios, "The project cache line is written with its counts"; axe fixture (5.4) | Covered |
| DIS-69 AC4: CLI `cache 4/10 (40%)`, `cache 0/0`, database unchanged | `cli-projects` "Sample and user projects are listed" | Covered |
| DIS-69 AC5: vectors, `response`/`reviews` unchanged, `db:seed` stores them, live rephrasing hit, `cache:embed` errors | `golden-answers` "Golden embeddings command" (5 scenarios), "The versioned golden file is coherent", MODIFIED "Signatures…"; `seed-load` (2 modified scenarios and "A rephrased golden question is a similarity hit after the seed") | Covered |

No inherited criterion is missing, and the sub-issue and the parent agree on scope.

## 3. Missing scenarios

Clean. Every MUST or SHALL clause of the seven deltas has a scenario or points to an existing one. The pooled-connection clause points to "Opening a pooled store from a URL". The `DAILY_BUDGET_USD` clause of "Golden embeddings command" uses `llmConfigFromEnv` without change (`config.ts:96-108`), which the `ask` scenarios already cover.

## 4. Ambiguity

Clean. A search for «fast», «easy», «secure», «efficient», «many», «appropriate» and «robust» over the proposal, the design, the specs and the tasks finds only "how many" (`graph-store`, line 5), which is not a vague qualifier.

## 5. Open decisions

Clean. The names the tests will pin are all fixed:
- `cacheHitRate`, `ProjectCacheHitRate`, `ExplainQueryCounts`;
- `countExplainQueries`, `COUNT_EXPLAIN_QUERIES`, `failCountExplainQueries`;
- `toPublicAnswer(answer, projectCache?)` and its error message;
- `projectCacheLine`, `isUsableVector`, `runCacheEmbed`;
- the `cache:embed` script string.

The following are fixed too:
- the formats: the web line, the CLI field, the rounding, `null`;
- the error cases: `404`/`500` of the read, every `cache:embed` code and message, the two `INTERNAL` messages;
- the empty inputs: no project, no query, a `null` vector;
- the orderings: the arguments, then the configuration, then the files, then the requests; the projects `acme-shop` then `task-api`;
- the call shape of `saveCacheEntry` (S9, task 7.5).

I checked them against the code they extend:
- `ASK_DOMAIN_ERRORS` maps `PROJECT_NOT_FOUND` to `404 'project not found'` (`ask.ts:19-20`).
- `llmConfigFromEnv` returns `{ mode: 'evaluation' }` without `LLM_BASE_URL` and `LLM_API_KEY`, and rejects `ftp://x` as `LLM_BASE_URL` (`config.ts:82-83`).
- `qwen2.5-coder` and `nomic-embed-text` are priced in `COST_TABLE` (`cost-table.ts:21-22`), so the 9.3 run passes under a `DAILY_BUDGET_USD` too.
- `toFailure` gives `LlmUnavailable` its `details.reason` (`commands/ask.ts:304-312`).
- `cache:build` exits `1` for `USAGE` (`cache-build.ts:231-249`), the same as the `cache:embed` spec.

## 6. Contradictions inside the change

Clean. The run 3 corrections are in place and consistent:
- 7.5 names the two unit expected-saves edits, and 10.2 lists them;
- 9.2b is the RED step before 9.3, 9.4 is the GREEN step, and 9.1 says "(the vector check is added in 9.2b)";
- 4.4 passes `entry.questionEmbedding ?? undefined`;
- S9 states the call shape.

I rechecked the arithmetic:
- 13.2: 3/3, then 3/4;
- 14.2: 1/1, then 2/2, then 3/4;
- the six calls of the in-memory double scenario;
- the six `"questionEmbedding": null` lines of 7.3b.

## 7. Contradictions with the project

- **I1 (improvable): the new `cache:embed` script loads `.env`, but `local-startup` → "Which commands load .env" (`openspec/specs/local-startup/spec.md:110-130`) does not list it.**
  - Design S7 fixes the script as `tsx --import=./scripts/load-env.mjs …`. The requirement lists the scripts that SHALL load `.env` (`cli`, `verify`, `db:migrate`, `db:rollback`, `db:seed`, `cache:build`, `seed:build`), and this change adds none.
  - It is not a contradiction. The list does not exclude other scripts, and `tests/unit/scripts/wiring.spec.ts:98-109` only checks the listed scripts and the quality scripts, so nothing turns red. `drift:build` (`package.json:30`) already loads `.env` without being listed.
  - Still, the main spec stops describing the real set of scripts.
  - **Correction (pick one):**
    - (a) add to design S7: "`local-startup` → 'Which commands load .env' is not amended; its list is not exhaustive, as for `drift:build`", with a Follow-ups row of destination D;
    - (b) add a MODIFIED `local-startup` delta that adds `cache:embed` (and `drift:build`) to the list and to its scenario, plus a task line that extends the `PRELOADED` map of `wiring.spec.ts`.
  - (a) is the narrower option.

Everything else is clean:
- Seed fingerprints: `knowledge/` and `store-postgres/src` feed the analyzer fingerprint (`docs/project-context.md:1029-1030`), so the S11 refresh is needed. `drift-golden-coherence.spec.ts:49-54` compares the drift file with the header of `graph-dump.sql`, not with a recomputed value, so the test run of 7.3b (before 9.1) stays green and S11's copy keeps it green afterwards.
- ADRs 20261017, 20261103 (drift freshness) and 20261103 (embeddings on `LlmPort`) are cited and respected.
- `GUARD_DB_IN_HTTP` holds: the route calls the store port.
- No dependency or migration is added.
- The MODIFIED "Ask answered response" keeps the four scenarios of the main spec (`openspec/specs/http-ask/spec.md:125-162`) and adds two.

## 8. Contrast with the real code

- `tests/unit/api/ask.spec.ts` builds every app over `createInMemoryStore`, wrapped by the `counting` Proxy (`ask.spec.ts:77-93`, `support.ts:96-108`). After 2.3 the existing answered tests ("Evidence ids are renumbered…", "Internal fields…", "Requests to one API share verification verdicts", …) read `{0,0,null}` and keep passing. The only exact `store.calls()` assertions (lines 228 and 697) are validation failures that never reach the read.
- The other test files that send `/ask` only read `usage.cacheHit`:
  - `tests/integration/api/ask.spec.ts:276, 314`
  - `tests/integration/api/reindex.spec.ts:172`
- `scripts/measure-context.mjs:458-471` checks for the `usage` keys it needs and ignores extra keys, so the real API's new `projectCache` does not break it.
- Exact `calls).toEqual` objects of the in-memory store occur only in `tests/unit/explain/explain.spec.ts:107, 146, 216`, which task 2.4 already names.
- **I2 (improvable): task 12.4 points Stryker at a file outside its scope and leaves out the largest new mutated file.**
  - `stryker.config.json:20-29` mutates `packages/core`, `packages/cli`, `packages/api` and `long-fetch.ts`, not `packages/web`.
  - Task 12.4 still lists `packages/web/src/components/usage-display.ts` among the files whose survivors get tests. It can have no survivors.
  - The task leaves out `packages/cli/src/cache-embed.ts`. That file is new, has many branches, and is mutated: it counts toward the 80 break threshold of 16.2.
  - **Correction:** in 12.4, replace `packages/web/src/components/usage-display.ts` with `packages/cli/src/cache-embed.ts` (and optionally `packages/cli/src/cache/golden-file.ts`). Add: "`usage-display.ts` is outside the Stryker `mutate` scope; its scenarios are covered by `usage-display.test.ts`".

## 9. Task size

Clean. Every task fits in one agent turn. The largest are 4.4 (one test edited, one new) and 8.3 (four scenarios, done "one at a time").

## 10. Mandatory steps

Clean.
- Step 0 creates the branch (0.1), and its check (0.2) and the baseline (0.3) follow.
- The labelled groups are present:
  - 10 Review and Update Existing Tests;
  - 11 Docs, whose position before 12 is justified by the docs gate;
  - 12 Run Tests and Verify Data State, with the report path;
  - 13 Manual Interface Testing (AGENT MUST EXECUTE);
  - 14 End-to-End (AGENT MUST EXECUTE);
  - 15 the PR;
  - 16 Pre-merge Review, last, with the archive (16.7) before the merge (16.8).
- The mutating tasks restore state:
  - 7.3b and 9.3 check the rendered files with scratchpad scripts;
  - 9.1 restores `sample-projects.ts`;
  - 12.6 checks the counts after the tests;
  - 13.6 and 14.5 drop the scratch database and stop the servers;
  - `db:seed` never runs on the shared database (S13).

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| semantic-cache: Project cache hit rate | The hit rate is rounded to one decimal and null without queries | 1.1, 1.2 |
| | Impossible counts are rejected | 1.3 |
| graph-store: Explain query counts | Explain queries and cache hits are counted per project | 3.1, 3.2 |
| | Counting the queries of an unknown project fails | 3.3 |
| | The in-memory double counts explain queries like the database | 2.1, 2.2, 2.3 |
| http-ask: Ask answered response | An answered question returns only the public fields over the seed | 4.4 |
| | Evidence ids are renumbered in evidence order (unchanged) | 10.3 |
| | Internal fields of the answer are not sent (unchanged) | 10.3 |
| | A statement citing an unknown evidence id answers INTERNAL | 4.3, 10.3 |
| | The usage carries the project's cache hit rate over the seed | 4.4 |
| | The hit rate is read only for an answered question and its failure answers INTERNAL | 4.1, 4.2 |
| http-ask: Ask in the OpenAPI document | The document lists ask with its parameter, body and responses | 4.3 |
| ask-page: Usage panel | An answer from the model shows its usage panel | 5.3a, 5.3c |
| | A cache hit shows its usage panel | 5.3a, 5.3c |
| | No saving is not shown as a saving | 5.3b |
| | A project without logged queries shows no hit rate | 5.3b, 5.3c |
| | The usage panel and the states follow the wireframe | 14.2, 14.3 |
| ask-page: How usage figures and notice details are written | The 7 unchanged scenarios | 10.3 |
| | The project cache line is written with its counts | 5.1, 5.2 |
| cli-projects: Project listing | Sample and user projects are listed | 6.4 |
| | An empty database lists no projects (unchanged) | 6.4 |
| | Configuration, connection and usage errors (unchanged) | 10.3 |
| | The cache field writes the hit rate with at most one decimal | 6.1, 6.2 |
| | A failing count read is an unexpected error | 6.1, 6.2 |
| golden-answers: Golden embeddings command | Golden question embeddings are written without touching the answers | 8.3 |
| | Embedding arguments and configuration are checked before any file | 8.1, 8.2 |
| | An invalid golden file stops the embedding before any request | 8.3 |
| | A failed embedding leaves the golden file intact | 8.3 |
| | A failed write leaves the golden files intact | 8.3 |
| golden-answers: Signatures of the reviewed golden answers | Every golden answer judged correct or partial carries both panel signatures | 9.4, 10.3 |
| | A golden answer judged incorrect carries no signature | 9.4, 10.3 |
| golden-answers: Golden file format | The canonical render is stable | 7.2, 7.3 |
| | Golden files with an invalid shape are rejected | 7.2, 7.3 |
| golden-answers: Partial regeneration | Only the named question is regenerated | 7.4 |
| | A stale golden file is not partially regenerated (unchanged) | 10.3 |
| golden-answers: The versioned golden file is coherent | The versioned golden file matches the seed, the questions and the code | 9.2b, 9.3, 9.4 |
| | The versioned task-api golden file matches the seed, the questions and the code | 9.2b, 9.3, 9.4 |
| seed-load: Golden answers are loaded with the seed | Golden answers are loaded and served in evaluation mode | 7.5 |
| | A seed without golden files loads only the graph (unchanged) | 10.3 |
| | Loading golden answers again does not duplicate them | 7.5 |
| | A failed golden save leaves the database unchanged (unchanged) | 10.3 |
| | A rephrased golden question is a similarity hit after the seed | 7.6 (green after 9.3) |

No row is empty.

---

## Corrections to apply

There are no blocking corrections. The two improvable ones:

### `openspec/changes/cache-hit-rate/design.md`

1. **(I1, option a)** At the end of S7, after the `package.json` script, add: "`local-startup` → 'Which commands load .env' is not amended: its list of scripts that load `.env` is not exhaustive (`drift:build` already loads it without being listed), and `tests/unit/scripts/wiring.spec.ts` only checks the listed scripts." In Follow-ups, add a table "Spec audit, run 4" with the row `I1 | cache:embed loads .env without being listed in local-startup → "Which commands load .env" (precedent drift:build) | **D** — accepted`, plus the row for I2 below with destination **A**.

### `openspec/changes/cache-hit-rate/tasks.md`

2. **(I2)** In 12.4, replace "`packages/web/src/components/usage-display.ts`" with "`packages/cli/src/cache-embed.ts`", and add at the end: "(`usage-display.ts` is outside the `mutate` scope of `stryker.config.json`; `usage-display.test.ts` covers its scenarios)".

### Linear DIS-69 (Spanish; the `[original]` block is never edited)

3. Add a comment:
   > *Texto del agente (auditoría de spec del cambio `cache-hit-rate`, ronda 4, 2026-11-04).* Veredicto: `APPROVED`. No hay hallazgos bloqueantes ni preguntas para la autora. Quedan dos mejorables:
   >
   > - (I1) El script nuevo `cache:embed` carga `.env`, pero `local-startup` → «Which commands load .env» no lo lista. No es una contradicción, porque la lista no es exhaustiva: `drift:build` tampoco figura. Se deja constancia en S7 con destino D.
   > - (I2) La tarea 12.4 cita `usage-display.ts`, que está fuera del alcance de Stryker. Pasa a citar `packages/cli/src/cache-embed.ts`, que sí se muta y cuenta para el umbral 80.
