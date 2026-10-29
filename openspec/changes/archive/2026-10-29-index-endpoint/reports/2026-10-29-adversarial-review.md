# Adversarial review — index-endpoint (DIS-9)

Date: 2026-10-29. Task 15.5, inline mode of `ai-specs/skills/adversarial-review/SKILL.md` (autonomous run).
Scope: `git diff final-project-CRN...HEAD` on `feature/dis-9-index-endpoint` (HEAD `3d7d04e`), the five
delta specs under `openspec/changes/index-endpoint/specs/`, `design.md` Follow-ups, and the DIS-9 golden
review round.

## Verdict

**PASS WITH GAPS.** No Blockers and no Majors. Four Minors and one Question, listed below. Each needs a
destination before archiving.

## Findings

| Severity | File:line | Finding | Why it matters |
|---|---|---|---|
| Minor | `packages/adapters/store-postgres/src/open-store.ts:73-83`; `tests/integration/store/open-store.spec.ts:147-212` | Two clauses of graph-store "Running work in one transaction on a pooled store" have no scenario and no test: "When the rollback itself fails, the work's error SHALL still be the one propagated" and "A failure to commit SHALL reject, without the driver's text…". The four integration scenarios cover only commit, rollback-on-reject, isolation and release. `open-store.ts` was also left out of the Stryker `--mutate` list (step 9 report, line 14). If someone replaced `throw new Error(COMMIT_FAILED_MESSAGE)` (line 82) with a rethrow of the driver error, or let a failing `ROLLBACK` at line 75 hide `error`, every test would still pass. Reading the code, it is correct today. | These are the error-hygiene clauses of the new adapter API: no driver text, host or credentials in the error. Nothing tests them, so a later edit could break them unnoticed. |
| Minor | `packages/adapters/store-postgres/src/open-store.ts:86` vs `packages/adapters/store-postgres/src/postgres-store.ts:131` | The new transaction runner always calls `client.release()` with no argument, even after a failed `BEGIN`, a failed `ROLLBACK` or a failed `COMMIT`. The store's own `atomically` follows a written rule: "A client whose rollback failed is in an unknown state: destroy it instead of pooling it" (`client.release(broken)`). The runner breaks that rule. pg-pool drops a client that is no longer queryable, but a client whose `ROLLBACK`/`COMMIT` failed while the socket stayed open goes back to the pool in an unknown transaction state. | A later checkout could get a connection that is still inside, or aborting, a transaction. The fix is small: pass the rollback or commit error to `release`. |
| Minor | `packages/core/src/index/reindex-project.ts:73-77`; `packages/adapters/store-postgres/src/save-graph.ts:31`; `packages/adapters/store-postgres/src/queries.ts:328-333,346-349`; `packages/adapters/store-postgres/src/postgres-store.ts:84-90` | A real deadlock between a reindex and a concurrent `/ask` cache save. The reindex locks the project `FOR UPDATE` in `saveGraph` and then deletes every `cache_entry` of the project. Meanwhile `saveCacheEntry` runs `DELETE_CACHE_KEY`, which locks an existing entry row of the same key, and then `INSERT … cache_entry`, whose foreign-key check needs `FOR KEY SHARE` on the project row. If the save deletes an old entry of its key after the reindex took `FOR UPDATE`, the two transactions wait on each other. That happens with two concurrent misses of one question, or a replaced entry. Postgres then aborts one of them with `40P01`. The store's own comment (`postgres-store.ts:84-90`) names this hazard and retries on its own connections, but a caller-owned transaction never retries. If the reindex is the victim, it answers `500 INTERNAL` and the whole snapshot is discarded. This conforms to the spec ("any other failure → 500, nothing changes"), but `design.md` does not record it: E10 covers only reindex-vs-reindex and E15 covers only a late save after the commit. | A reindex can fail at random under concurrent `/ask` traffic on the same project, and the client gets no hint to retry. It needs at least a recorded follow-up, for example retrying the unit of work on `40P01`/`40001` or taking the cache-key locks first. |
| Minor | commit `c753b8d` (whole feature); step 9 report, line 28 | Process debt, not code. The production code and every new test landed in one commit. The step 9 report says that 9/9 `reindexProject` scenarios, 11/12 route scenarios, 4/4 integration scenarios and 3/4 `open-store` scenarios passed as soon as they were written: they are characterisation tests, not TDD red-green. Stryker scores (94.2 % killed on the six mutated files) partly compensate, but `open-store.ts` and `composition.ts` were not mutated. | Most of the change has no evidence of red-first TDD. Under the project's `tracking deferred findings` rules this is process debt, not a Linear issue. |
| Question | `packages/api/src/routes/reindex.ts:196-243`; `packages/api/src/composition.ts:86-87` | Any client that can reach the API can trigger a full synchronous reindex (CPU-bound tree-sitter/TS analysis plus a git history read) and wipe a project's answer cache. The only limit is the shared IP rate limit, 30 requests per minute by default. There is no concurrency cap on reindexes. The product has no authentication by design, and indexing is off unless `ALLOWED_REPOS_DIR` and `AUTHOR_HASH_SALT` are set. Is "rate limit only" an accepted risk? The design does not say. | If this is accepted, one line in Follow-ups closes it. If not, it needs a concurrency guard. |

### Notes on the panel judgements (report only; panel files are never edited)

- acme-shop Q1 was judged `correct` by both panelists. The top-level `answer` text says the method applies
  "primero la descuento, luego el servicio gravable y finalmente el costo de envío". It garbles the
  taxable step and never names the tax step, although `PriceCalculator.php:31` computes tax. The statements
  S5/S7 do state tax correctly, and the criterion judges statements. The report justification ("the garbled
  wording is a slip of the model") does not mention that the summary leaves out tax.
- The resolver (`claude-opus-5-5`) is the same model as panelist 1. The rules allow it, and in this run it had
  no item to resolve. It is not an independent third opinion. The report's `## Limitations` covers this only
  in general terms.

## What was checked (and found to hold)

- **Spec alignment.** Every scenario of `http-index`, `repository-indexing`, `graph-store` and
  `api-foundation` has a test that asserts it. Checked: the call log in `tests/unit/index/reindex-project.spec.ts:179-190`,
  which asserts the order `saveGraph` before `invalidateCache` inside `transaction begin`/`commit`, and the
  integration scenarios over the seed in `tests/integration/api/reindex.spec.ts`. The specs were not edited
  after the feature commit, except the golden-answers delta (`b8b08bc`), which planned the golden round
  before its input existed.
- **Hostile input.**
  - Path-bearing bodies are rejected by `z.strictObject` (`schemas/reindex.ts`).
  - An absent body is handled as `{}` (`routes/reindex.ts:202-204`).
  - Empty `application/json` maps to `VALIDATION_ERROR` (`error-handler.ts` `BODY_ERRORS`).
  - A malformed id gets `400`; a well-formed unknown id gets `404`.
  - Without indexing, `INDEXING_DISABLED` is answered before the store (`routes/reindex.ts:209`).
  - A relative stored root resolves against `workspaceRoot`.
  - `ForbiddenPathError` names the stored root as stored (`confine-repository.ts:121-135`).
  - Error bodies have fixed messages and empty `details`. Domain errors are not logged. The completion log has counters only.
  - Same request twice: the second invalidates 0 entries.
  - Concurrency: reindex-vs-reindex is serialised by `LOCK_PROJECT` (E10). For reindex-vs-ask, see the Minor above.
- **Blast radius.**
  - `indexRepository` keeps its behaviour through `buildSnapshot` (`detectFramework: true`; `frameworkSource` rule unchanged). The existing index tests are unedited.
  - `askParamsSchema` now aliases `projectIdParamsSchema`, with the same regex.
  - `markOptionalBodies` changes only bodies with no `required` key. `/ask` keeps `required: true`.
  - Reindexing a sample project changes the seed fingerprint (E9, recorded).
  - No migration.
- **Existing tests modified.**
  - `tests/unit/api/composition.spec.ts`: the double gained `transaction`, plus two new scenarios. Justified.
  - `tests/unit/seed/golden-reviews.spec.ts`: retargeted to the DIS-9 files. It now checks the criterion against both previous rounds, and the forbidden-source cases cover both earlier panelists. This is a strengthening.
- **Golden round record.**
  - `git diff ad180f7 HEAD -- seeds/cache` changes only `reviews` (6 entries × 2 signatures).
  - Each panel file has one creating commit (`2851844`, `3ee9631`).
  - The DIS-33 and DIS-107 round files have no diff against the base.
  - The criterion report commit `35a7dd5` precedes the input commit `cb96611`.
  - No seed commit falls between `ad180f7` and `cb96611`.
- **Targeted tests run.** `npx vitest run tests/unit/api tests/unit/index tests/unit/seed`: 24 files, 217 tests, all passing.

## Recommended next steps before archiving

Each deferred finding needs a destination in `design.md` → Follow-ups (A/B/C/D per `docs/project-context.md`
→ *Tracking deferred findings*):

1. Commit-failure and rollback-failure clauses untested: **A**, fix in this change. Add a test with a
   pool/client double, or a Postgres scenario that forces `COMMIT` to fail (for example, a deferred
   constraint violated by the work). Assert the fixed message, and that a failing `ROLLBACK` does not hide
   the work's error.
2. `client.release()` without the error: **A**, fix in this change (one line; pass the rollback/commit error
   so the client is destroyed). Alternatively **D**, recorded with its reason.
3. Reindex-vs-`saveCacheEntry` deadlock: **C**, one Linear debt issue (retry the unit of work on
   `40P01`/`40001`, or document the client retry), or **D** recorded next to E10/E15.
4. Red-first evidence: **D**, process debt recorded in the step 9 report. No Linear issue.
5. Unauthenticated, uncapped synchronous reindex: answer the Question with a **D** line in Follow-ups, or a
   **C** issue if a concurrency guard is wanted.
