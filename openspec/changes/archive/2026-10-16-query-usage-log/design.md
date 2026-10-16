## Context

See `proposal.md` → Why for the motivation and the author's decisions D1–D11. Current state the
design builds on:

- `query_log` exists since `0002_history-claims` (no check constraints, all counters nullable,
  `cache_hit NOT NULL DEFAULT false`, `created_at NOT NULL DEFAULT now()`, FK to `project` with
  cascade). Only `sumCostSince` reads it (`postgres-store.ts`, `queries.ts` `SUM_COST_SINCE`);
  nothing writes it. Migrations already applied on the base branch are never edited.
- `saveClaims` is the write template: id check, record schema before any statement, the project
  check inside the write, `ClaimWriteFailed` with no database text, `BEGIN … COMMIT` on the store's
  own connections and a `SAVEPOINT` on a caller-owned transaction (`postgres-store.ts`).
- `explain.ts` drops the `usage` of the `answer` call (it keeps only `result.model` for the
  provenance) and returns `usage: { verification }`. It reads `now()` once, for the provenance.
- `verify/semantic.ts` keeps its `VerificationUsage` in a local object returned at the end: a `verify`
  call that propagates an error loses the usage of the calls before it. Its loop already has the
  `stopped` short-circuit; `verifyAnswer` does not pass a cost table down (the semantic check uses
  `COST_TABLE`).
- `withDailyBudget` wraps the model the composition root gives `explain` (CLI `ask`, live mode with
  a ceiling), so a `BudgetExhausted` happens inside `llm.complete`.
- The context pack exposes `baselineTokens` (0 when empty) and `estimator` (`'chars-div-4'`,
  `TOKEN_ESTIMATOR`).
- Doubles: `tests/support/in-memory-store.ts` (no `saveQueryLog`; `sumCostSince` not implemented),
  `tests/support/scripted-llm.ts` (answer model fixed to `scripted-model`, usage per purpose),
  `tests/support/explain-doubles.ts` (`now` fixed to `NOW`).

Layer order (`docs/backend-standards.md`): test → port → domain → adapter. `knowledge/` must not
import from `explain/` or `context/`.

## Goals / Non-Goals

**Goals:**

- One `query_log` row per `explain` call that returns, or that fails after a resolved model call,
  with the verification breakdown, so `sumCostSince` sees every dollar spent.
- One place that counts tokens and cost per purpose, that keeps the tokens and cost of every call
  that resolved before an error raised at any step.
- A pure, mutation-tested aggregation (`usage.ts`).
- A bound on the `verify` calls of one answer that reuses the semantic check's existing fail-closed
  path.

**Non-Goals (design level):**

- No new transaction spanning the claim write and the row: they are independent writes (U8).
- No read API over `query_log` beyond the existing `sumCostSince`; the in-memory double keeps its rows
  only for assertions.
- No change to `withDailyBudget` or to the composition root of `ask`.

## Decisions

### U1 — Migration `0004_query-log-verification`

`up`: `ALTER TABLE query_log ADD COLUMN verify_input_tokens integer NULL, ADD COLUMN
verify_output_tokens integer NULL, ADD COLUMN verify_cost_usd numeric(10,6) NULL, ADD COLUMN
verify_calls integer NULL, ADD COLUMN verify_latency_ms integer NULL;`. `down`: drops the five
columns. The two D11 columns go into `0004` rather than a `0005` because `0004` does not exist on any
branch yet: one migration per change. No check constraint, matching the existing counters of the table: the store validates
before writing (U2). Nullable because rows of other capabilities (`impact`, `drift`) may have no
verification. Alternative rejected: editing `0002` (already applied on the base branch).

### U2 — `knowledge/query-log.ts`: the record and its schema

`QueryLogEntry` (`projectId`, `question`, `capability`, `inputTokens`, `outputTokens`,
`baselineTokens: number | null`, `costUsd`, `latencyMs`, `cacheHit`, `verifyInputTokens`,
`verifyOutputTokens`, `verifyCostUsd`, `verifyCalls`, `verifyLatencyMs: number | null`), `QUERY_CAPABILITIES` (`explain`, `impact`, `drift`, the SQL
enum), a Zod `strictObject` schema and `assertValidQueryLogEntry(entry)` throwing
`InvalidStoreQuery('entry')` with a fixed message, after a `refine` for the three "verification ≤
total" rules. Integer bound `2_147_483_647`, cost bound `9_999.999999`. The question rule is
"non-empty, not only whitespace, no U+0000" without a length cap: the cap (`MAX_QUESTION_CHARS`) lives
in `explain/limits.ts`, and `knowledge/` does not import `explain/`. The projectId form check
(`UUID`) comes first and throws `ProjectNotFound`, as in `saveClaims` (D9). `QueryLogWriteFailed`
(code `QUERY_LOG_WRITE_FAILED`, fixed message, no `cause`) goes in `knowledge/errors.ts` next to
`ClaimWriteFailed`. Exported from `knowledge/index.ts`.

A test reads `0002_history-claims.up.sql` and checks `QUERY_CAPABILITIES` equals the
`query_capability` enum, as `EVIDENCE_VERIFICATIONS` is checked today.

### U3 — `StorePort.saveQueryLog(entry): Promise<void>` and the Postgres adapter

TSDoc at the level of `saveClaims` (order of checks, transaction cooperation, errors).
`queries.ts` gains `INSERT_QUERY_LOG`:

```sql
INSERT INTO query_log (project_id, question, capability, input_tokens, output_tokens, baseline_tokens,
  cost_usd, latency_ms, cache_hit, verify_input_tokens, verify_output_tokens, verify_cost_usd,
  verify_calls, verify_latency_ms)
SELECT p.id, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14 FROM project p WHERE p.id = $1
```

One statement: zero rows inserted means the project does not exist → `ProjectNotFound` (nothing was
written). The adapter runs it through the same write wrapper `saveClaims` uses (`BEGIN … COMMIT` on
its own pool, `SAVEPOINT` on a caller-owned client), mapping every database error once the write has
started to `QueryLogWriteFailed`, and letting the connection error and the savepoint error propagate
unchanged, as the claim write does. Concretely: `atomically(connection, work, toQueryLogWriteError)`
(`atomically` is already generic, `postgres-store.ts:76`), with a new mapper next to
`toClaimWriteError` (`:123`) that returns domain errors unchanged (so the zero-rows `ProjectNotFound`
passes through) and maps any other error to `QueryLogWriteFailed`. Alternative rejected: relying on the FK violation (`23503`) to detect
an unknown project — it aborts the statement after the fact and needs SQLSTATE parsing; the
`SELECT … WHERE` form keeps the "nothing written" rule explicit.

### U4 — In-memory store double

`saveQueryLog` with the same checks in the same order (`UUID` → `ProjectNotFound`, schema →
`InvalidStoreQuery`, unknown project → `ProjectNotFound`), a `queryLog` array of the written entries
(exposed on the double's result, as `calls` is), `calls.saveQueryLog`, and an option
`failQueryLogWrite?: () => unknown` whose value is thrown on the next writes. `sumCostSince` stays
not implemented (no unit test needs it; the budget scenario runs on Postgres).

### U5 — `explain/usage-meter.ts`: counting every resolved call

`meterLlm(llm, costTable)` returns `{ llm, generation(), verification(), resolvedCalls() }`. The
wrapped `llm` keeps `mode` and `embed`; its `complete` awaits the inner call and, only when it
resolves, adds the reported tokens and `costUsd(result.model, result.usage, costTable)` to the bucket
of the request's purpose (`answer` → generation, `verify` → verification). Each bucket returns
`{ inputTokens, outputTokens, costUsd }` with the cost sum rounded once to 6 decimals, the same
rounding the semantic check applies. `explain` wraps the model it was given, so the meter sits outside
`withDailyBudget`: a call the ceiling blocks never resolves and never counts.

Why a decorator: the usage of a `verify` call made before a propagated error is otherwise lost inside
`semantic.ts` (D1 needs it), and threading a mutable accumulator through `verifyAnswer` and
`verifyEntailment` changes two signatures for a concern they do not own. Alternative rejected: compute
the generation usage from `result.usage` in `explain` and take the verification from
`VerificationUsage` — it cannot cover the failure path.

The semantic check still returns its own `VerificationUsage` (it knows `calls` and `cacheHits`); on an
answered path its tokens and cost equal the meter's verification bucket, which a unit test asserts.

### U6 — `explain/usage.ts`: pure aggregation

- `savingsPct(inputTokens, baselineTokens)`: `0` when `baselineTokens === 0`, else
  `Math.round(1000 * (1 - inputTokens / baselineTokens)) / 10` (`Math.round` rounds a half toward +∞;
  negative values are kept), with a `-0` result normalised to `0` (`Math.round(-0.5)` is `-0`).
- `latencyMs(start, end)`: `Math.max(1, end.getTime() - start.getTime())` — at least 1 ms (author
  decision on the spec audit's Q5, parent CM-HU-11 AC 5: `latency_ms` > 0).
- `aggregateUsage({ generation, verification, baselineTokens, latencyMs })` → `AnswerUsage`
  (D5), totals as sums, `costUsd` rounded to 6 decimals, `baselineEstimator: TOKEN_ESTIMATOR`,
  `cacheHit: false`.
- `queryLogEntry(…)` → the `QueryLogEntry` of one call from the project id, the question, the
  generation usage, the verification tokens and cost, the verification calls and latency (or `null`),
  the baseline (or `null`) and the latency (U15 says where each comes from on each path); used on every path (U7) so the row is built
  in one place.

`AnswerUsage` (in `explain-answer.ts`) becomes the D5 interface with TSDoc per member;
`GenerationUsage` `{ inputTokens, outputTokens, costUsd }` is exported next to it. Exported from
`explain/index.ts` (`no-orphans`). Stryker target, score ≥ 80.

### U7 — `explain` wiring

`ExplainDependencies` gains `costTable?: CostTable` (default `COST_TABLE`). The body becomes:

1. Validate the request and the workspace root (unchanged; no row on failure).
2. `const startedAt = now()`; `const meter = meterLlm(llm, costTable)`; `let baselineTokens: number |
   null = null`.
3. `try { outcome = await answerQuestion(…) } catch (error) { if (meter.resolvedCalls() > 0) { const
   endedAt = now(); await saveQueryLog(queryLogEntry(…, latencyMs(startedAt, endedAt))).catch(() =>
   undefined); } throw error; }` — the row of a rejection takes the meter's two buckets; `answerQuestion` is the current
   pipeline, using `meter.llm`, `startedAt.toISOString()` as provenance instant, setting
   `baselineTokens` once the pack exists, and passing `costTable` to `verifyAnswer` (whose deps gain
   it, forwarded to `verifyEntailment`).
4. `const endedAt = now()`; for an answered outcome, attach `usage = aggregateUsage(…)` built from
   `meter.generation()`, the semantic check's `VerificationUsage`, the pack's `baselineTokens` and the
   latency; build the row from the same values (`queryLogEntry`); for an `UNKNOWN` outcome, the row
   from the meter buckets, with `verifyCalls` the meter's count of resolved `verify` calls (0) and
   `verifyLatencyMs` the state of U15 (0: the semantic check never started).
5. `await saveQueryLog(row)`: on `QueryLogWriteFailed` append `query_not_logged`
   `store-write-failed`; on `ProjectNotFound` append `project-not-found`; on `InvalidStoreQuery`
   append `invalid-entry`; rethrow anything else.
   Return.

So the clock is read exactly twice when a row is written; the provenance instant moves from "when
the claims are built" to "when explain started", still one instant per call. The answered answer is
assembled without `usage` inside `answerQuestion` (`storedAnswer` / `unsavedAnswer` take the
`VerificationUsage` and return it alongside), so the usage and the row share the same latency.
Latency therefore covers the claim write but not the row write.

### U8 — The row is its own write

The row is written after the claim write and outside it, on the store `explain` was given. A crash
between the two leaves claims without a row (spend invisible to the ceiling for that call) — the same
exposure as a process killed mid-`verify`; accepted (proposal Non-goals: atomic ceiling). Writing the
row inside the claim operation was rejected: `UNKNOWN` answers and failure paths have no claim write.

### U9 — Failure of the row (D7, D9)

On a return, only `QueryLogWriteFailed`, `ProjectNotFound` and `InvalidStoreQuery` are absorbed into
`query_not_logged` (`QUERY_NOT_LOGGED_CODES = ['store-write-failed', 'project-not-found',
'invalid-entry']` in `explain-event.ts`, with `QueryNotLoggedEvent` in the `ExplainEvent` union).
`ProjectNotFound` can only come from a `no-anchor` answer with a malformed or unknown project id
(every other return path read the project), or from a project deleted mid-call. `InvalidStoreQuery`
comes from counts the model reported: the LLM adapter accepts any non-negative integer token count,
so an endpoint can report more than an `integer` column holds, or a cost past `numeric(10,6)`
(adversarial review F1; the first version let it propagate as a programming error, but it is raised
after the claims are stored). Anything else propagates, a failure to obtain a connection included
(F2, accepted). On a rejection, any failure of the row is swallowed so the original
error is what the caller sees. `UnknownExplain` keeps its fields; only its `events` may now hold
`query_not_logged`, and its TSDoc says so. The CLI writes it at `info` like every non-`evidence_broken`
event (`cli-ask` unchanged).

### U10 — U+0000 in the question (D10)

`explainRequestSchema.question` gains `.refine((q) => !q.includes('\u0000'))`; the failure still
names `question` and holds no value. Rejecting at the request keeps "every return writes a row" true,
instead of a late `InvalidStoreQuery` after a paid answer.

### U11 — Verify call limit (D2)

`MAX_VERIFY_CALLS_PER_ANSWER = 20` in `explain/limits.ts` with TSDoc giving the D2 reason and the
"provisional, PH-27" note. `ENTAILMENT_UNVERIFIED_REASONS` gains `'call-limit'` (appended).
`verifyEntailment` counts the calls it sends; before sending one, when the count has reached the
limit, the pair resolves `cited` with `call-limit` without calling the model. The cache lookup and the
`stopped` check come first, so a cached pair never counts and a failed verifier keeps its own reason.
The limit is per `verifyEntailment` call, i.e. per answer.

### U12 — Tests

- `tests/unit/explain/usage.spec.ts` (new): savings, latency, aggregation, `queryLogEntry`; the
  "Savings follow the baseline…" scenario.
- `tests/unit/explain/usage-meter.spec.ts` (new): buckets by purpose, a failed call does not count,
  mode and `embed` pass through.
- `tests/unit/knowledge/query-log.spec.ts` (new): schema rules and the enum check against the SQL.
- `tests/unit/store/in-memory-query-log.spec.ts` or the existing in-memory store spec, for the double
  scenario.
- `tests/integration/store/query-log-write.spec.ts` (new): the Postgres scenarios of "Query log
  write" (the database rejection is forced as in `claims-write.spec.ts`).
- `tests/unit/explain/explain.spec.ts`, `explain-verification.spec.ts`: the `Answer usage`, `Query
  log` and modified scenarios; `tests/unit/verify/semantic.spec.ts`: the three call-limit scenarios ("The verifier is called at most the call limit", "A cached pair does not count toward the call limit", "A failed verifier keeps its reason past the call limit");
  `tests/integration/explain/explain.spec.ts`: "An answer leaves one query log row the daily spend
  sees".
- Doubles: `scripted-llm.ts` gains `answerModel`; `explain-doubles.ts` gains `now` (a list of instants
  read in turn, the last one repeated once the list is exhausted, `[NOW]` by default) and
  `failQueryLogWrite`, and forwards the store's `saveQueryLog` into `order`.
- The unit scenario "An answer carries its total, generation and verification usage" needs a pack whose
  `baselineTokens` is 40 000: `baselineTokens` is `ceil(code points / 4)` of the whole cited files
  (`context-pack.ts:201`, `tokenizer.ts:21`), so the test gives the included files 160 000 code points
  in total (e.g. one file of exactly 160 000 code points); no new seam in core.
- `migrations.spec.ts` and `schema-snapshot.ts`: the five columns, `ALL_MIGRATIONS` with `0004`, and
  the "Roll back only the latest migration" scenario rewritten for `0004`.

- D11 tests (design U15): `semantic.spec.ts` "The verification latency is the wall time of the
  check"; in `explain-verification.spec.ts` the five row scenarios "A row without cited statements
  records no verification", "A row of an answer verified from the cache counts no verifier call", "A
  row at the verify call limit counts the limit", "Evaluation mode records no verification", "An
  unavailable verifier midway counts only the calls made"; and the existing-test edits of task 5.4b.
  Each run of a scenario that runs explain more than once gets its own scripted clock.

Every `#### Scenario:` of the four delta specs maps 1:1 to a test with the same name.

### U13 — The question "tal cual" (D3)

The row stores the question string the request gave. node-postgres sends it as UTF-8, so an unpaired
UTF-16 surrogate (possible from a JavaScript caller, never from argv) reaches the database as U+FFFD;
the spec states this one exception. U+0000 is rejected earlier (U10). Tests use well-formed strings.

### U14 — No ADR

The decisions are local to `explain` and the store, additive and reversible (one migration with a
down). The product decisions (D1–D3) are recorded in the ticket and the proposal.

### U15 — Verifier latency and calls (D11)

- `VerificationUsage` gains `latencyMs` (TSDoc: wall-clock time of the check, a failed call's time
  included). `verifyEntailment(llm, cache, pairs, costTable?, now?)` — `now` defaults to
  `() => new Date()`; in `live` mode it reads `now()` before the loop and after it, and sets
  `latencyMs = Math.max(0, end - start)`; in `evaluation` mode it returns before reading the clock.
  `VerifyAnswerDependencies` gains an optional `now` (default `() => new Date()`, forwarded to
  `verifyEntailment`) and an optional `onSemanticStart` (below); `ZERO_USAGE` gains `latencyMs: 0`.
  Existing `verify/` tests that compare a usage exactly (`semantic.spec.ts` "An unavailable verifier
  degrades the remaining pairs", `verify-answer.spec.ts`) pass a fixed clock so `latencyMs` is
  deterministic (task 5.4b).
- `explain` passes its own `now` (from `ExplainDependencies`) down, so tests drive every read from
  one scripted clock: explain's start, the check's start and end, explain's end.
- `queryLogEntry` maps `verification.calls` → `verifyCalls` and `verification.latencyMs` →
  `verifyLatencyMs` on a return; `aggregateUsage` passes `verification` through unchanged, so
  `usage.verification.latencyMs` and `calls` are exposed with the rest of the breakdown.
- On a rejection (U7 step 3), `verifyCalls` is the meter's count of resolved `verify` calls (the meter
  gains it), and `verifyLatencyMs` comes from a state `explain` keeps: `0` until the semantic check
  starts, `null` from then on, and the check's `usage.latencyMs` once `verifyAnswer` returned.
  `verifyAnswer`'s deps gain an optional `onSemanticStart` callback, called just before
  `verifyEntailment`; `explain` uses it to move the state from `0` to `null`. So an error of the
  syntactic reads leaves `0`, an error raised inside the semantic check leaves `null` (its time is
  unknown), and an error after `verifyAnswer` returned (the claim write) records the check's latency.
- Non-goal kept explicit: no parallel `verify` calls, no selective verification (proposal
  Non-goals).

## Risks / Trade-offs

- [The ceiling still overshoots by the calls of each `ask` in flight] → the D2 limit bounds each one to
  one `answer` plus 20 `verify` calls, so N concurrent runs may overshoot N times that; declared in
  Non-goals and in the `DAILY_BUDGET_USD` docs.
- [The question is now persisted verbatim] → local database only, never logged, not in any event or
  error, `QueryLogWriteFailed` without database text; `/privacy-ethics-check` records it (D3).
- [Every `StorePort` implementer must add `saveQueryLog`] → `typecheck` finds them; the step that
  updates existing tests lists each one.
- [CLI integration scenarios on the command's own pool now commit `query_log` rows to the shared test
  database] → the existing-tests step checks which `ask-command.spec.ts` scenarios reach a return path
  on the pool and deletes their rows (or binds them to the harness transaction).
- [Meter and semantic check count the verification twice] → the row of an answered answer takes the
  answer's `usage` (generation from the meter, verification from the check); the row of a rejection
  takes the meter's two buckets; a unit test asserts that the meter's verification bucket equals the
  check's tokens and cost on an answered path.
- [Last statements lose `FACT` under the limit] → deterministic, declared in the spec; only reachable
  with more than 20 uncached pairs.
- [`savingsPct` uses a local `chars-div-4` estimate] → `baselineEstimator` says so in every answer.

## Migration Plan

`npm run db:migrate` applies `0004` (additive, nullable columns: existing rows get `NULL`).
Rollback: `npm run db:rollback` drops the five `verify_*` columns; the code of this change then fails on the
insert, so rolling back the migration means reverting the change. CI runs `db:migrate` →
`db:rollback` → `db:migrate`. `migrations/*.up.sql` is a seed fingerprint input: rerun `seed:build`.

## Follow-ups

Filled during the Pre-merge Review (A/B/C/D per finding, `docs/project-context.md` → Tracking
deferred findings). Sources: `reports/2026-10-16-verify-against-spec.md` (VAS) and
`reports/2026-10-16-adversarial-review.md` (AR). Every finding was fixed in this change or accepted; no
Linear issue was opened.

| Finding | Destination | Resolution |
|---|---|---|
| AR F1 — `InvalidStoreQuery` of the row write (token counts or cost past the columns) propagated after the claims were stored | **A** | Author decision 2026-10-16 ("Absorber como evento"): new code `invalid-entry` in `QUERY_NOT_LOGGED_CODES`; spec "Query log" updated, scenario "An out-of-range query log entry still answers and says so" (TDD, RED seen), "Other query log write errors propagate" now uses an error that is none of the three (U9 updated) |
| VAS (2nd run) U4/U5 — `invalid-entry` absorbs every `InvalidStoreQuery` of the row write, and its spend is not recorded | **A** | Spec "Query log" reworded: the cause is "the entry fails the store's record schema, for example …", and the unrecorded spend is stated for the three absorbed failures |
| VAS (2nd run) 2.1–2.3 — no cost-overflow case, `QUERY_NOT_LOGGED_CODES` not pinned, the new scenario compared only partly | **A** | The scenario's test also overflows the cost and compares each answer with the same run when the row is written (ids and usage aside); `explain.spec.ts` pins the exported set |
| AR F2 — a connection failure of the final row write rejects after the claims are stored | **D** | Author decision 2026-10-16 ("Documentar"): proposal Non-goals, spec "Query log" and U9 state it; same exposure as U8 |
| AR F3 — the meter/check consistency test promised under Risks did not exist | **A** | `usage-meter.spec.ts`: the meter's verification and `verifyCalls()` equal the check's usage over an accepted, an invalid and a failed call |
| AR Q4 — the overshoot bound ignored concurrent `ask` runs | **A** | Reworded "per `ask` in flight, N concurrent runs N times" in Risks, proposal Non-goals, `docs/project-context.md` and the readme `DAILY_BUDGET_USD` row |
| AR Q5 — the change folder was committed after the code | **D** | Process note: commit the change folder at `/opsx:propose` time in future changes; recorded in the step 12 report addendum |
| VAS 2.1 — "no row before a call resolves" tested only for three failures | **A** | The scenario's test also covers the pack's `SourceUnavailable`, a failing prior-claims read and the `LlmUnavailable` of the `answer` call |
| VAS 2.2 — rejection rows never priced | **A** | "A failure after the model calls leaves a row and keeps its error" and "A verifier failure other than unavailable or budget propagates without writing" run with a priced model and assert the cost |
| VAS 2.3 — the U+FFFD storage of an unpaired surrogate untested | **A** | `query-log-write.spec.ts`: a lone surrogate is stored as U+FFFD |
| VAS 4 — weak tests (exact `UNKNOWN` answer, unchanged fields of a not-logged answer, `null` verify latency, cache-row latency under a fixed clock, E21 not shown to be an anchor, `saveQueryLog` absent from a partial match) | **A** | Each strengthened: exact comparison with a reference run, field-by-field comparison without random ids, exact row with `verifyLatencyMs: null`, a clock giving 25 ms, an `anchor` assertion on E21, `saveQueryLog: 0` |
| VAS 4 — "shipped cost table → zero" cannot tell the shipped table from no table | **D** | Inherent to the scenario: the shipped table prices every model at 0 and an unpriced model also costs 0 |
| VAS U1 — new public exports of `@codemind/core` (`savingsPct`, `latencyMs`, `aggregateUsage`, `queryLogEntry`, `meterLlm`, their types) | **D** | Design U5/U6 name them; `explain/index.ts` exports them because the architecture lint forbids orphans and the unit tests import them from the package |
| VAS U2 — `onSemanticStart` on `verifyAnswer` | **D** | Internal plumbing of design U15 (the rejection row's verification latency); optional, no behaviour of its own |
| VAS U3 — `.gitleaksignore` entry for commit `21df2e1` | **D** | A synthetic sentinel named `SECRET` tripped `generic-api-key`; renamed in `7ee73c3`, the old commit fingerprinted as DIS-91 did |
