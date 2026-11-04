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
