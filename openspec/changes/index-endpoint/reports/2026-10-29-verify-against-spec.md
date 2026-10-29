Verdict: PASS (0 Blocker, 0 Major, 5 Minor)

# Verify against spec: index-endpoint (DIS-9)

*Agent's text: written by the agent of the autonomous run, following the Inline mode of `ai-specs/skills/verify-against-spec/SKILL.md`, without the author.*

- Date: 2026-10-29
- Scope: `git diff final-project-CRN...HEAD` against the five delta specs (`api-foundation`, `graph-store`, `http-index`, `repository-indexing`, `golden-answers`), `proposal.md`, `design.md` (E1-E31, P1-P3) and `tasks.md`.
- Run: `npx vitest run tests/unit/api tests/unit/index tests/unit/seed` -> 24 files, 217 tests, all green. Integration specs (`tests/integration/api/reindex.spec.ts`, `tests/integration/store/open-store.spec.ts`) were read, not run (they need and write the database); their state is the one recorded in the step 9 report.
- Git facts rechecked: `35a7dd5` (report) is an ancestor of `cb96611` (input); no commit touches `seeds/cache` in `ad180f7..cb96611`; the input, panelist 1/2 and resolution files have one commit each (`cb96611`, `2851844`, `2851844`, `3ee9631`); `git diff ad180f7 HEAD -- seeds/cache` changes only `reviews` entries; the DIS-33 and DIS-107 round files are absent from `git diff final-project-CRN...HEAD --name-only`.

## 1. Requirements implemented correctly

| Requirement | Code | Test |
|---|---|---|
| repository-indexing: Reindexing an existing project (steps enabled, project, confine, build, save; report; one unit of work, save before invalidate; project fields untouched; no framework detection) | `packages/core/src/index/reindex-project.ts:56-95`, `confine-repository.ts:114-137`, `build-snapshot.ts:74-143` | `tests/unit/index/reindex-project.spec.ts:169-355` |
| `indexRepository` unchanged in behaviour (shared `confineRepository`/`buildSnapshot`) | `index-repository.ts` (diff) | existing `index-repository.spec.ts` and `acme-shop.spec.ts` unedited (step 9 report) |
| graph-store: Running work in one transaction (connect, BEGIN, bound store, COMMIT/ROLLBACK, first error wins, fixed commit message, release in `finally`) | `packages/adapters/store-postgres/src/open-store.ts:66-88` | `tests/integration/store/open-store.spec.ts:147-230` |
| api-foundation: indexing variables optional, trimmed, never fail start-up; both set composes `IndexingDeps` (analyzers, extractor names, transaction runner) | `packages/api/src/composition.ts:91-111,150-170`, `app.ts:15-45` | `tests/unit/api/composition.spec.ts` (two new `it`s) |
| http-index: validation before anything (strict body, uuid-shaped id, absent body = `{}`, empty declared JSON = 400) | `routes/reindex.ts:59-68`, `schemas/reindex.ts:116-128`, `schemas/common.ts:18-27` | `tests/unit/api/reindex.spec.ts:186-234`, integration `:193` |
| http-index: 202 body with the seven keys, `mode` `full`, analyzer name, `filesSkipped` 0 | `routes/reindex.ts:96-105` | unit `:293,317`, integration `:126` |
| http-index: error table with fixed messages and `{}` details; `INDEXING_DISABLED` before the store; `INVALID_GRAPH` and others -> 500 `INTERNAL`; rate limit | `routes/reindex.ts:18-27,71-72` | unit `:173,236,248,266,335,406`, integration `:164,218` |
| http-index: completion log (info, counters only, `redactions` = file + commit events) | `routes/reindex.ts:85-95` | unit `:376` |
| http-index: OpenAPI (`requestBody.required` false, `/ask` unchanged) | `plugins/openapi.ts:11-37,58` | unit `:423` |
| golden-answers: input, outputs, resolution, report, criterion, immutability | `docs/golden-review/**` | `tests/unit/seed/golden-reviews.spec.ts`; git-checked scenario in the addendum of `reports/2026-10-29-9-test-and-state-verification.md` (every claim rechecked above) |

## 2. Requirements missing or partial

None. Every requirement and every scenario has code and a test. Notes that are not gaps:
- graph-store: "When the rollback itself fails ..." and "A failure to commit SHALL reject, without the driver's text" have code (`open-store.ts:72-83`) and no scenario or test; recorded as D in design E21. Matches the spec, which gives no scenario for them.
- repository-indexing: "an unknown or malformed id rejects with `ProjectNotFound`": only the unknown id is tested at core level (the malformed-id rule belongs to the store, existing behaviour).

## 3. Unspecified behaviour

Small; no behaviour a client can see. Each needs a decision (remove, or add to the spec).

- Minor 1. `ReindexDependencies.onProgress`, the `progress('confine')` call and the test "reports the phases of the build in order" (`reindex-project.ts:27-28,59,63`; `reindex-project.spec.ts:357`). The spec says nothing about progress for a reindex and the route never passes it. Decision needed: remove it, or add a line to "Reindexing an existing project".
- Minor 2. Test seams and public exports not named by the specs: `AppOptions.reindex` (`app.ts:56`), `ReindexRouteOptions` (`routes/reindex.ts:30-33`) and the re-exports of the reindex schemas and `registerReindexRoute` (`packages/api/src/index.ts:39-47`). Documented as a test seam (TSDoc, `docs/project-context.md`); harmless, but outside the specs.
- Minor 3. Behaviour-preserving refactor of `/ask` to share `projectIdParamsSchema` (`schemas/ask.ts`, `schemas/common.ts:18-27`). Not in a spec; the existing `/ask` tests are unedited and green.

Specific checks: no dependency imported that is missing from the manifest (`@codemind/analyzer-php` and `@codemind/analyzer-typescript` were added to `packages/api/package.json`; lockfile +2 workspace links; audit 0); no authorisation check is required by the specs beyond the path confinement, which is performed (`reindex-project.ts:65`); the 202 body has exactly the seven specified keys (response schema `schemas/reindex.ts:134-142`, asserted by `Object.keys` in the integration test); no log field beyond the six specified.

## 4. Tests weaker than their scenario

- Minor 4. "A reindex keeps the stored project fields and detects no framework" (`reindex-project.spec.ts:276-299`) compares `getProject` before and after on the in-memory fake, whose `saveGraph` cannot alter those fields, so it passes whatever the use case does after the `getProject`. The no-framework half is still guarded by the `composer.json` manifest in the tree. No Postgres test checks `name`, `root_path`, `language`, `framework` and `is_sample` after a real reindex (`tests/integration/api/reindex.spec.ts:126-162` checks `indexed_at`, counters and the cache only).
- Minor 5. graph-store "Every connection is released after a run": the spec asks for a unique application name; the test uses the constant `codemind-tx-release-test` (`open-store.spec.ts:213`). It cannot collide with other specs today, but two concurrent runs on one database could.

## Scenario -> test -> state

| Spec | Scenario | Test | State |
|---|---|---|---|
| api-foundation | Defaults apply to unset and empty variables | `composition.spec.ts` (existing) | green |
| api-foundation | An invalid variable fails with its name and without its value | `composition.spec.ts` (existing) | green |
| api-foundation | Missing indexing variables do not stop the API | `composition.spec.ts` | green |
| api-foundation | Configuration errors are raised before the store is opened | `composition.spec.ts` (existing) | green |
| api-foundation | Evaluation mode uses the model as built | `composition.spec.ts` (existing) | green |
| api-foundation | A daily budget stops the model call | `composition.spec.ts` (existing) | green |
| api-foundation | The API answers on its address and closes its connections | integration (existing) | green (step 9 report; not run here) |
| api-foundation | The composed repository root is the repository's top directory | `composition.spec.ts` (existing) | green |
| api-foundation | Both indexing variables compose the indexing dependencies | `composition.spec.ts` | green |
| graph-store | Work that resolves is committed | `open-store.spec.ts:147` | green (step 9; not run here) |
| graph-store | Work that rejects leaves nothing | `open-store.spec.ts:165` | green (step 9; not run here) |
| graph-store | Work's writes are invisible to another connection before the commit | `open-store.spec.ts:188` | green (step 9; not run here) |
| graph-store | Every connection is released after a run | `open-store.spec.ts:212` | green (step 9; not run here); see Minor 5 |
| repository-indexing | A reindex saves over the stored project and then invalidates its cache | `reindex-project.spec.ts:169` | green |
| repository-indexing | A relative stored root resolves against the workspace root | `:200` | green |
| repository-indexing | Reindexing is disabled without an allowed root, before reading the project | `:212` | green |
| repository-indexing | An unknown project is not reindexed | `:226` | green |
| repository-indexing | A stored root outside the allowed root is rejected before reading | `:238` | green |
| repository-indexing | An allowed root that does not exist disables reindexing | `:263` | green |
| repository-indexing | A reindex keeps the stored project fields and detects no framework | `:276` | green; see Minor 4 |
| repository-indexing | A workspace root that is not absolute is rejected before any call | `:302` | green |
| repository-indexing | A failed cache invalidation fails the unit of work | `:315` | green |
| repository-indexing | An invalid graph writes nothing | `:330` | green |
| http-index | A body with a path or a language answers VALIDATION_ERROR without indexing | `api/reindex.spec.ts:186` | green |
| http-index | A malformed project id answers VALIDATION_ERROR without indexing | `:204` | green |
| http-index | A request without a body is a full reindex | `:218` | green |
| http-index | An invalid request answers VALIDATION_ERROR over the seed | `integration/api/reindex.spec.ts:193` | green (step 9; not run here) |
| http-index | A reindex answers 202 and invalidates the cache over the seed | `integration:126` | green (step 9; not run here) |
| http-index | An incremental request is accepted as a full reindex | `unit:293` | green |
| http-index | A TypeScript project answers with the ts-compiler analyzer | `unit:317` | green |
| http-index | Indexing disabled answers 403 without touching the store | `unit:173` | green |
| http-index | An unknown project answers PROJECT_NOT_FOUND | `unit:236` | green |
| http-index | A stored root outside the allowed root answers FORBIDDEN_PATH without a path over the seed | `integration:164` | green (step 9; not run here) |
| http-index | An unknown project answers PROJECT_NOT_FOUND over the seed | `integration:218` | green (step 9; not run here) |
| http-index | An unreadable stored repository answers 503 without a path | `unit:248` | green |
| http-index | An invalid graph answers INTERNAL and saves nothing | `unit:266` | green |
| http-index | The index route is rate limited | `unit:335` | green |
| http-index | A reindex logs its counters without paths | `unit:376` | green |
| http-index | The document lists index with its parameter, body and responses | `unit:423` | green |
| golden-answers | The panel input projects the golden answers without their verification | `golden-reviews.spec.ts:98` | green |
| golden-answers | Each panelist output judges every item under the criterion | `:446` | green |
| golden-answers | The resolution answers exactly the disagreements | `:462` | green |
| golden-answers | Invalid panel outputs are rejected | `:393` | green |
| golden-answers | The report's verdicts and agreement match the panel files | `:645` | green |
| golden-answers | The report states its criterion, panel and limitations | `:690` | green |
| golden-answers | The report's criterion is the Panel group's criterion | `:718` | green |
| golden-answers | The criterion precedes the input and nothing in the record is rewritten | addendum of `reports/2026-10-29-9-test-and-state-verification.md` (git-checked, no test by design) | present and rechecked with git in this run |

No scenario is red or absent. Two extra tests exist beyond the scenarios (`unit:406` FORBIDDEN_PATH fixed message, `reindex-project.spec.ts:357` phases); the first is recorded in the step 9 report, the second is Minor 1.

## Design and tasks coherence

- E1-E14, P1-P3, E15-E31: the code and documents follow each one that is destination A (E19 `preValidation`, E22 `detectFramework: false`, E23 `AppDeps.source` reused, E25 `transformObject`, E26 relative `ALLOWED_REPOS_DIR` resolved by `confinePath`). E13 holds: `docs/DEMO.md` gets no endpoint step (its only change is the golden-review note).
- `tasks.md`: every task up to 15.3 is checked; 15.4 (this report) and 15.5-15.7 are open, as expected at this point.
