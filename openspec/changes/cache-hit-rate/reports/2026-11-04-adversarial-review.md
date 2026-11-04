## Adversarial review

- Date: 2026-11-04
- Change: `cache-hit-rate` (DIS-69), PR #108, diff `origin/final-project-CRN...HEAD` at `6ec37eb`
- Mode: inline (`ai-specs/skills/adversarial-review/SKILL.md` → *Inline mode*), autonomous run, in a
  step separate from the one that implemented the change

*Agent's text (autonomous run, without the author).*

### What was checked

1. **Spec and task alignment.** Every requirement of the seven deltas has scenarios, and every scenario
   title maps to a test of the same name (`grep` of each `#### Scenario:` title in `tests/` and
   `packages/web/src`; the wireframe scenario is the step 14 screenshots). Tasks 0–15 are `[x]` with
   their reports (12, 13, 14) and the step 12 Stryker run. The specs were last changed at `26672c7`
   (13:25), the code at `31d3112` (15:51): no spec was edited after the implementation.
2. **Hostile input**, per entry point:
   - `cacheHitRate`: empty (0, 0) → `null`; boundary 2147483647 accepted, 2147483648 rejected;
     negative, fractional, `NaN`, hits above queries → `RangeError` without numbers
     (`packages/core/src/cache/hit-rate.ts:29`). Float division then `Math.round` is exact here: a
     non-half quotient is at least 1/(2·queries) ≥ 2.3e-10 away from a half, far above the 1e-13 rounding
     error at magnitude 1000, and a half quotient is representable, so the half-up rule holds.
   - `countExplainQueries`: malformed id → `ProjectNotFound` before a statement; unknown id → zero rows
     → `ProjectNotFound` (`runProjectQuery`, `postgres-store.ts:252-254`); project without rows → one
     row of zeros (LEFT JOIN from the project row, `queries.ts:235`); `'explain'` is a literal, the id a
     parameter.
   - `POST /ask`: malformed or unknown project → `404` before the use case (`getProject`); `UNKNOWN`
     → no read; a read failing with `ProjectNotFound` → `404`, any other → `500`
     (`routes/ask.ts:166`). The same request twice: each answer counts its own row (shown live:
     5/4 then 6/5). Two requests at once: see Q1 below.
   - `projects`: no project → no count read; a count rejecting → `INTERNAL`, rollback and release in
     `finally` (`commands/projects.ts`).
   - `cache:embed`: positional, unknown option, `--project=`, missing value, repeated `--project`,
     unknown project, evaluation mode, missing `LLM_EMBED_MODEL`, invalid or missing golden file, a
     zero vector, a failed request and a failed write (all in `tests/unit/cli/cache-embed.spec.ts`;
     two of them exercised live in `/show-spec-working`).
3. **Blast radius.** `StorePort` gained one method: every implementation compiles (`npm run typecheck`
   green). The golden format makes `questionEmbedding` mandatory: the only golden files are the two
   versioned ones, migrated and filled in this change; `cache:build`, `db:seed`, `verify` and the
   coherence tests read them and are green. `query_log` is only read (no write path changed); no
   migration. Existing behaviour that changes: the `/ask` usage and the `projects` line, both with
   modified scenarios.
4. **Evidence quality.** Existing tests modified in this change are exactly those named in `tasks.md`
   (2.4, 4.3, 4.4, 5.3a/b, 5.4, 6.3, 6.4, 7.2, 7.4, 7.5, 7.7, 9.2b), each adding expectations without
   removing one. Most important test: `tests/unit/cache/hit-rate.spec.ts` "The hit rate is rounded to
   one decimal and null without queries" — the pair (16, 1) → 6.3 kills `Math.floor` (6.2) and a
   round-half-even rule (6.2), (3, 2) → 66.7 kills truncation, (0, 0) → `null` kills a `0` default.

### Findings

| Severity | File:line | Finding | Why it matters |
|---|---|---|---|
| Minor | `tests/integration/api/ask.spec.ts:205` | "The usage carries the project's cache hit rate over the seed" asserted only `usage.cacheHit`, while the scenario states every other key of `usage` is the usage of a cache hit, unchanged. **Fixed in this step**: the test now asserts zero tokens, zero cost and the zero `generation`/`verification` usage for the three answers (green on `codemind_dis69_test`) | A regression adding the rate into another usage field, or a cache hit reporting model usage, would have passed |
| Minor | `packages/api/src/schemas/ask.ts:81` | The OpenAPI document publishes `maximum: 9007199254740991` on `queries` and `cacheHits` (`z.int()` rendering), not stated by the scenario | Harmless: same rendering as every integer of the document; the counts are bounded by the `::int` cast (R2). Accepted (D) |
| Minor | `packages/api/src/routes/ask.ts:166` | No test pins that the counts are read *after* the events were written to the request log (the spec's order); only "after the use case" is observable in the tests | The order has no visible effect on the response; the code reads after the `for` over the events. Accepted (D) |
| Question | `packages/api/src/routes/ask.ts:166` | The read is not in a transaction with the use case's `query_log` write, so two concurrent requests on one project may each count the other's row | The spec only requires the current call's row to be included, which holds; the metric is cumulative and approximate by nature. Accepted (D) |

### Verdict
PASS — no Blockers and no Majors, evidence is sufficient

### Recommended next steps before archiving
1. Push the strengthened test and wait for the CI of PR #108 until no check is pending.
2. Record the four findings in `design.md` → Follow-ups (one A, three D; none C) and in a Spanish
   comment on DIS-69.
3. Run `/opsx:archive` of `cache-hit-rate` (task 16.7) and merge (16.8).
