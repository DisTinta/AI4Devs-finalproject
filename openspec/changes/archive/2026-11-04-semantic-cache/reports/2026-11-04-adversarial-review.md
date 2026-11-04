# Adversarial review: semantic-cache (DIS-67)

- Date: 2026-11-04
- Change: semantic-cache · PR #105 · head reviewed `77db509`
- Step: 14.5 of `tasks.md`, inline mode of `adversarial-review` (`docs/AUTONOMOUS-RUN.md` §6)

*Agent's text: written by the agent of the review step in an autonomous run, without the author. This
session did not implement the change (the apply step and its relaunch ran in other sessions), but it is
the same model family; the review read the artifacts, the full diff against `final-project-CRN`, the
history of the deltas and the real database, and verified each finding in the code or in SQL.*

## Adversarial review

### Findings

| Severity | File:line | Finding | Why it matters |
|---|---|---|---|
| Major | `tests/unit/explain/explain-similarity.spec.ts:269-295` | The test of "Turning the cache off embeds only for the save" never asserts its first THEN «the new entry under the rephrased key holds E2»; it only checks, after the second call, that the entry has no embedding. | The save of the vector with `useCache: false` (`packages/core/src/explain/explain.ts:250`, requirement "Embedding of a saved answer": «whatever `useCache` is») is pinned by no test: a mutation that saved `undefined` when the cache is off survives the whole suite. Same as V1 of the verify-against-spec report. |
| Minor | `packages/adapters/store-postgres/src/queries.ts:452-463` | `FIND_SIMILAR_CACHE_ENTRY` can resolve to an entry whose similarity is `NaN`. With components that are finite in JavaScript (so accepted by `assertValidEmbedding`) but whose products overflow single precision, pgvector's `<=>` is `NaN`; `1 - NaN` is `NaN`, and Postgres compares `NaN >= 0.85` as true (checked: `select (1 - ('[3e38,3e38]'::vector <=> '[1,1]'::vector)) >= 0.85` → `t`). | A project whose only embedded entry holds such a vector would serve that entry for queries it does not resemble, against the store contract (resolved only at or above the minimum). Reachable only with an embedding endpoint returning absurd magnitudes, but it is a hole this change introduces. Same as V2. |
| Minor | `packages/core/src/cache/similarity-cache.ts:36`, `packages/core/src/knowledge/cache-entry.ts:76` | A component above the single-precision range (for example `1e300`) is finite in JavaScript, so the vector is usable and valid, but Postgres rejects its cast (`"1e300" is out of range for type vector`). The similarity lookup then rejects and `explain` fails, where the in-memory double would succeed. | The requirement already says a failure of the similarity lookup propagates, and "usable" is defined as finite components, so the code conforms; the effect needs a broken endpoint. Recorded as an accepted limit, not fixed (see the resolution). |
| Question | `packages/core/src/cache/similarity-cache.ts:25` | `reachesThreshold` is exported and tested but no production code calls it (the store applies `>=` to the `minSimilarity` it receives). | Already decided in design S4, R6 and relaunch B2 as the single statement of the inclusive rule; the inclusive boundary is also pinned on Postgres (`cache-entry.spec.ts`, boundary search at 0.85) and in `explain` ("The threshold is inclusive at the boundary"). No new action. |

What was checked to reach the rest of the table empty:

1. **Spec and task alignment.** Every `#### Scenario:` of the five deltas has a test of the same name
   (title grep; the only one absent, "A response after 300 s is accepted", is a recorded manual check
   by its own text and unchanged here). Every task `[x]` up to 14.1 has its evidence in the step 10 and
   11 reports. The deltas were edited after implementation once in the implementation commit
   (`73dc10f`, the bound on C and D's similarities in `graph-store`, decided by spec audit run 3, I2)
   and in the relaunch's correction rounds (audited, `APPROVED` in run 3 of the relaunch): no edit to
   make a test pass.
2. **Hostile input.** Empty key: no embedding (`explain.ts:384`); a question without anchor: no
   lookup and no embedding (test "A question without anchor requests no embedding"); the boundary
   0.85 and one step below (tests); NaN, Infinity, zero, short and long vectors from the model:
   unusable → event (`usableVector`); a plain `Error` from `embed`: propagates with no row; the same
   request twice: an exact hit the second time (no embedding); two at once: both miss and both save,
   serialised by the advisory lock of `saveCacheEntry` (unchanged); a project that owns nothing: the
   search resolves `undefined` (`LEFT JOIN` from `project`), an unknown project fails with
   `ProjectNotFound` before any write (tests).
3. **Blast radius.** `cache_entry.question_embedding` is read only by `FIND_SIMILAR_CACHE_ENTRY`;
   written only by `INSERT_CACHE_ENTRY`. The other callers of `saveCacheEntry`
   (`packages/cli/src/seed-load.ts:226`, `:235`) pass no embedding, so the seed and the drift entry
   (`drift:` key) stay without one and are never similarity hits. Migration `0005` is reversible
   (`down` restores `vector(1536)` and the indexes, discarding vectors, as its header says; tests
   "Roll back only the latest migration" and "Apply, roll back and apply again"). The new event reaches
   the API request log and the CLI stderr through the generic loops (`packages/api/src/routes/ask.ts:152`,
   `packages/cli/src/commands/ask.ts:112`), which accept any event type; the public answer has no
   `events` field.
4. **Evidence quality.** The most important test, "A rephrased question is answered from the similar
   entry", would catch swapping the order of the exact and the similarity lookups (`order` indexes),
   passing a constant other than 0.85 (`searches`), and skipping `touchCacheEntry` (hit count 1). The
   existing tests modified by the change are all named in `tasks.md` (7.2, 7.4) with their reason.

### Verdict

PASS WITH GAPS

The Major and the first Minor are fixed in this PR (see the resolution); the second Minor is accepted
with destination D; the Question needs no action. After the fixes no Blocker or Major remains.

### Recommended next steps before archiving

1. Strengthen "Turning the cache off embeds only for the save" with the assertion of E2 (RED by a
   temporary wrong expectation, then green).
2. Leave `NaN` distances out of `FIND_SIMILAR_CACHE_ENTRY`, test first on Postgres.
3. Record the out-of-range limit as D in `design.md` → Follow-ups.
4. Push, wait for the CI and archive.

## Resolution

*Agent's text: applied by the agent of the review step, 2026-11-04.*

| Finding | Resolution | Destination |
|---|---|---|
| Major · cache-off test (V1) | Corrected. `tests/unit/explain/explain-similarity.spec.ts`, existing test "Turning the cache off embeds only for the save": reads the entry under the rephrased key after the first call and asserts it holds E2; no assertion removed. Green at once (the behaviour exists); seen failing once with a temporary `toBeNull()` (`expected [ 0.9, 0.4358898943540673, +0, …(765) ] to be null`), then restored. | **A** — this change (task 14.6) |
| Minor · `NaN` similarity (V2) | Corrected. RED: new test "An entry whose similarity is not a number is never found" in `tests/integration/store/cache-entry.spec.ts` (an entry saved with `embeddingVector(3e38, 3e38)`, searched with `embeddingVector(1, 1)` at 0.85 and at 0) failed against `codemind_test` (`expected { …(3) } to be undefined`). GREEN: `FIND_SIMILAR_CACHE_ENTRY` filters `s.distance <> 'NaN'::float8` in the lateral subquery, with its TSDoc. It pins the existing requirement text, so no delta changes. | **A** — this change (task 14.6) |
| Minor · component above single precision | Accepted. The code conforms to the deltas (usable = finite components; a lookup failure propagates). Only an embedding endpoint returning magnitudes above ~3.4e38 reaches it; the reference model returns unit-length vectors; changing the definition of a usable vector would reopen an approved delta for a broken-endpoint case. | **D** — accepted (`design.md` → Follow-ups, V3) |
| Question · `reachesThreshold` | No action: decided before (S4, R6, relaunch B2). | **D** — already recorded (R6) |

Re-run after the fixes: `npx vitest run tests/integration/store/cache-entry.spec.ts tests/integration/explain tests/unit/explain tests/unit/cache tests/unit/store` with `DATABASE_URL` of `codemind_test`: 35 files, 373 tests passed; `npm run typecheck` and `npm run lint` clean. The fixes touch one SQL statement and add assertions, so a new adversarial pass is not needed: no Blocker or Major is left.
