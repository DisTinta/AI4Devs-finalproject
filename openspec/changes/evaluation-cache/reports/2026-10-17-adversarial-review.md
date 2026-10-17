# Adversarial Review — evaluation-cache (DIS-21)

- Date: 2026-10-17
- Change: evaluation-cache (DIS-21)
- Task: 16.6 (`/adversarial-review`)
- Diff: `git diff origin/feature/entrega-2-CRN...HEAD` at `5c6a60b`, plus the uncommitted fixes of
  `2026-10-17-verify-against-spec.md` (V1–V5)
- Reviewer: the agent, inline, in the autonomous workflow of Entrega 2. The skill asks for a session
  other than the implementer's; the forked skill runs as a read-only agent that reports to the main
  session and cannot reach this step, so the review was run here with a deliberate refutation stance
  and every claim checked in the code. Inputs: proposal, design, the five delta specs, tasks, the
  spec audit, the step 11 and 12 reports, `2026-10-17-show-spec-working.md`,
  `2026-10-17-verify-against-spec.md` and `2026-10-17-security-review.md`.

## Adversarial review

### 1. Spec and task alignment

- Every requirement of the five deltas has scenarios, and all 109 scenario titles map to a test of the
  same name (`2026-10-17-verify-against-spec.md`). Three tests asserted less than their scenario (V1–V3)
  and were strengthened in this change.
- Tasks marked `[x]` (0–14) have their evidence: baseline and totals, characterisation tests, the
  edited existing tests with reasons, the Stryker run and survivors, the privacy check, the state
  check, "E2E not applicable" and "no ADR for D3" are in `2026-10-17-11-test-and-state-verification.md`;
  the manual run in `2026-10-17-12-manual-interface-testing.md`.
- Spec edited after implementation: no. `git log` of `openspec/changes/evaluation-cache/specs` shows the
  last spec commit (`4c4dfd5`, spec audit run 4) before the first code commit (`5b0a425`).
- Unspecified behaviour: only the unused `project_id` column of `FIND_CACHE_ENTRY` (V5, removed).

### 2. Correctness under hostile input

Entry points: `POST /api/projects/{id}/ask`, `codemind ask`, `explain`, the four store calls.

| Input | What happens (read in the code) |
|---|---|
| empty / blank / only-punctuation question | rejected by the request schemas (blank) or answers `no-anchor` before the lookup (`explain.ts:300`); the empty-key guard (`key !== ''`, `explain.ts:303` and `finish`) never reaches the store |
| boundary lengths | unchanged validation (5–500 at the API, 1–1 000 in core); the key is computed on the validated question |
| `useCache: null`, `"yes"`, `1`, extra key | 400 `VALIDATION_ERROR` (`z.boolean().optional()` in `z.strictObject`), and `InvalidExplainRequest` naming `useCache` in core |
| right type, wrong meaning: a stored response that is not an answer (hand-written golden, `null`, extra key) | strict schema on read → silent miss (`response-cache.ts:153`); the answer is never built from it |
| same request twice | first live answer saved, second served from the entry (scenario "A live answer is saved once…"); a hit is never saved again |
| two requests at once | concurrent saves of a key are serialised by `pg_advisory_xact_lock` and leave one entry (integration test with a pool of 4 and 6 saves); a touch of an entry replaced in between changes nothing and resolves |
| a subject who owns nothing / another project's entry | every statement is scoped by `project_id`; `touchCacheEntry` with another project's entry id changes nothing (integration test) |
| a key or response the database rejects (e.g. a `\u0000` inside a JSON string, which `jsonb` refuses) | the save fails inside `atomically` → `CacheWriteFailed` → the answer is still returned with `answer_not_cached` |

### 3. Blast radius

- Data written: `cache_entry` (read only by `findCacheEntry`; deleted with its project by the existing
  `ON DELETE CASCADE`) and the `cache_hit` column of `query_log` (read by nothing that filters on it;
  `sumCostSince` adds `cost_usd`, which is 0 for a hit).
- Code modified with other callers: `AnswerUsage.cacheHit` widened from `false` to `boolean` — read by
  the `/ask` serialiser (passes it through) and nothing in `packages/web` (grep: no `cacheHit` there);
  `queryLogEntry` gains an optional `cacheHit` defaulting to `false`, so DIS-74's callers are unchanged;
  `StorePort` gains four methods implemented by both stores.
- Migration: none (the table and its `project_id` index exist since migrations 0002/0003).
- Behaviour changed without a scenario: none. The four existing scenarios whose repeated question
  would now hit the cache were modified in the delta to send `useCache: false` (spec audit B1/P1).

### 4. Evidence quality

- The tests assert behaviour (answers, rows, entries, call counts, errors), not the implementation.
- The most important test, "A cached question is answered from the cache in both modes", fails under
  each of these mutations: moving the lookup after the evaluation-mode check (the first call answers
  `llm-required`); dropping `touchCacheEntry` (hit count 0, not 2); touching at the second clock read
  (`last_hit_at` would be t₂ + 9 ms, not t₂); writing the hit's row with `cacheHit: false`; building
  the pack or reading prior claims on a hit (`neighbors` / `findClaimsOverlapping` counts); a third
  clock read (reads `[2, 4]`).
- Existing tests modified: the four modified scenarios, two repeated-question unit tests and the
  eight exact `order`/`calls` assertions, each justified in the step 11 report ("Existing tests
  edited"), extended and never filtered. In this step only tests created by this change were
  strengthened (V1–V4).

### Findings

| Severity | File:line | Finding | Why it matters |
|---|---|---|---|
| Minor | `packages/core/src/cache/response-cache.ts:31-34` (`isCacheable`) | An answer whose semantic check was degraded (verifier unavailable, budget spent, verify call limit: statements left `cited`/`INFERENCE`) is cacheable, so it is served unchanged until the entry is replaced or invalidated; the verifier is not retried while the entry lives | Quality frozen at its worst moment. It is what D4 decided (stored + every statement `current`), and nothing false is served: the statements keep their honest `INFERENCE`/`cited` type and the lower confidence. A live caller refreshes with `"useCache": false` (the new answer replaces the entry), and DIS-9 invalidates on reindex. **AR1 → D** (accepted, added to design Risks) |
| Minor | `packages/core/src/cache/response-cache.ts:42-48` (`toStoredResponse`) and `packages/api/src/routes/ask.ts:152` | A hit carries no events (D5), so the `untrusted_content_flagged` / `entailment_unverified` log lines of the first answer are not repeated for later hits of it | Operators see the flag once, at the first answer, not on every hit. The events never reach the response body (they are logged), the first answer logged them, and the stored statements keep their verification. **AR2 → D** (accepted, added to design Risks) |
| Minor | `packages/core/src/explain/explain.ts` (`finish`) | Any `/ask` caller with a live model can replace a project's entry with `useCache: false` (security review, Low) | Same trust level as every other write of the unauthenticated local API; only pipeline-checked answers are saved, and the key comes from the question's words. If DIS-26's golden entries must be protected from replacement, DIS-26 decides it. **AR3 → D** (accepted) |
| Minor | `tests/unit/explain/explain-cache.spec.ts` | V1–V3 of the verify report: three tests asserted less than their scenario | Fixed in this change (**A**) |
| Minor | `tests/unit/cache/normalize.spec.ts`, `packages/adapters/store-postgres/src/queries.ts` | V4 (comment said escapes, code had raw characters) and V5 (unused selected column) | Fixed in this change (**A**) |

| Major | `tests/integration/store/cache-entry.spec.ts` "Saving a key again replaces its entry" | **AR4** — order-dependent test: it took the other key's entry as the second row of `entriesOf` (`ORDER BY created_at, id`), but rows written in one transaction share `created_at`, so the order fell back to the random UUID and the test failed about half of the runs (seen in the full-suite run of this step) | A flaky test of this change would fail CI at random. Fixed in this change (**A**): the entry is now picked by its key; 5 consecutive runs and the full suite green (see Addendum) |

No Blocker, no Major left open, no Question left open.

### Verdict

**PASS** — no Blockers and no Majors left open (AR4, the only Major, is fixed); the evidence is sufficient. The Minor findings are fixed (A) or
accepted with their reasoning (D), each with its destination in `design.md` → Follow-ups.

### Recommended next steps before archiving

1. Commit the V1–V5 fixes and the reports; run the full suite and the gates (recorded in the step 11
   report addendum).
2. Open the PR, collect the CI evidence (task 16.3), then `/opsx:archive` and merge with CI green.
3. Clean the local `query_log` rows left by `/show-spec-working` (see that report, State).

## Addendum — 2026-10-17, after the fixes

- AR4 fixed: `tests/integration/store/cache-entry.spec.ts` picks the other key's entry by
  `question_normalized`. `npx vitest run tests/integration/store/cache-entry.spec.ts` with
  `DATABASE_URL` set, 5 consecutive runs: 10/10 passed each time.
- Re-check of the axes the fixes touch: V1–V3 strengthen assertions only; V4 keeps the same input
  values; V5 removes a column nothing read (the lookup still starts from the project row, so an
  unknown project still yields no row and `ProjectNotFound`). No new finding.
- Full suite and gates on the fixed tree: `npx vitest run` (with `DATABASE_URL`) 123 files, 1 490
  tests passed; `npm run lint`, `npm run typecheck`, `npm run docs:coverage` clean;
  `npm run lint:architecture` 0 errors (the 3 pre-existing `no-orphans` warnings of
  `packages/web/src/data/sample-projects.ts` and `packages/analyzers/typescript`).
- Verdict unchanged: **PASS**, no Blocker or Major open.
