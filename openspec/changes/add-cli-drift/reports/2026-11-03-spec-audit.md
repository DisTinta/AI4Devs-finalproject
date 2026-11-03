CHANGES REQUIRED

# Spec audit: add-cli-drift (DIS-73), first audit, 2026-11-03

Inputs read:
- The change: `proposal.md`, `design.md`, `specs/{cli-drift,drift-golden,drift-detection,seed-load}/spec.md`, `tasks.md`.
- Linear: DIS-73 (description and its 5 comments) and its parent DIS-48.
- Project: `docs/base-standards.md` §7.1, `docs/openspec-tasks-mandatory-steps.md`, `docs/project-context.md` (drift and Ollama gotchas), the main specs `openspec/specs/{drift-detection,seed-load,golden-answers,verify-smoke}/spec.md`, ADR `docs/adr/20261017-stale-fingerprint-fails-verify.md`.
- Code: `packages/core/src/drift/drift.ts`, `explain/explain.ts`, `explain/usage-meter.ts`, `impact/query-log.ts`, `knowledge/query-log.ts`, `knowledge/cache-entry.ts`, `cli/src/commands/ask.ts`, `cli/src/cache-build.ts`, `cli/src/cache/answer-fingerprint.ts`, `adapters/llm/src/config.ts`, `tests/support/in-memory-store.ts`, `tests/integration/cli/{ask-command,verify,seed-load}.spec.ts`.

## Questions for the author

1. **(B1)** The proposal has the unit coherence test fail whenever the golden drift report's fingerprints are stale. ADR `20261017-stale-fingerprint-fails-verify` says only the `verify` job goes red for a stale fingerprint. Two ways to go:
   - **(a)** Keep the unit-test check and record the exception in an ADR. This is the default the corrections below apply.
   - **(b)** Drop the freshness check and accept that the drift golden can go stale without anything failing.

   Under the autonomous-run rules the agent may pick (a) as lead engineer, but the decision overrides a consequence of an accepted ADR, so the author should review it afterwards.

---

## 1. Scope against the ticket

Clean, with one improvable finding. Everything in the change follows from DIS-73: the command, the golden Q5, the `query_log` row, `withDailyBudget`, and the docs listed in D12. Case B, HTTP, `--json` and the panel are explicitly out. Nothing widens the change to the whole of DIS-48.

Some pieces were not in the ticket's text but are means of delivering the ticket's own "golden" item, and the DIS-73 comment (P1–P3) records them:
- the new `npm run drift:build` command;
- the helper move to `cache/build-support.ts`;
- `useCache` in the request.

None of them is invented scope.

- **I1 (improvable).** The `[enhanced]` part of DIS-73 still says three things the change no longer does:
  - `cache:build acme-shop Q5` and `GOLDEN_DRIFT` in `demo-questions.ts` (§3 "Golden");
  - `LLM_DAILY_BUDGET_USD` (§2 criterion 3).

  The change supersedes them through P1, P2 and P3, so the ticket and the change disagree. The correction is in the Linear section below.

## 2. Inherited acceptance criteria

Clean, with one improvable finding. Every criterion of DIS-73 §2 (1–5) and every DIS-48 criterion that DIS-73's DoD inherits has a requirement and a scenario:

| Criterion | Where it is covered |
|---|---|
| Golden in evaluation mode (DoD) | cli-drift "Q5 is printed from the golden report in evaluation mode" |
| Evaluation mode without a golden | "Evaluation mode without a golden report answers llm-required on the command line" |
| `no-docs` | "A project without documents answers no-docs on the command line" and the core scenario |
| Live run with the planted contradictions | "A live run over the indexed acme-shop prints the planted contradictions" |
| Budget | "A daily budget stops the drift model call" |
| Spend row on failure | "A failure after a model call leaves a row and keeps its error" |
| Usage, configuration and terminal errors | cli-drift arguments, configuration and failures |
| Integrity (a) | "An invalid golden entry is a miss without an event" |
| Integrity (b) | seed-load "An invalid golden drift file fails before connecting" |
| Integrity (c) | "The versioned golden drift file matches the seed, the table and the code" |
| DIS-48: `verification` on each contradiction, `query_log` row with `capability = 'drift'`, `no-docs` not an error | covered by the above together with the DIS-71 main spec |

- **I2 (improvable).** Criterion 3 says "si una llamada `answer` falla (`LlmUnavailable`) después de al menos una llamada resuelta… la fila se escribe igualmente". The only scenario for that case uses `BudgetExhausted`. The mechanism is the same, but the case the ticket names is not pinned. Add an `LlmUnavailable` variant to drift-detection "A failure after a model call leaves a row and keeps its error".

## 3. Missing scenarios

These MUST clauses have no scenario. All are improvable.

- **I3a.** drift-detection "Drift failures, logging and writes" and "Golden drift report lookup" require that a failure of the hit record (`touchCacheEntry`) propagates before the model is called. "A failing golden lookup stops before the model" covers only `findCacheEntry`. Add a case where `touchCacheEntry` rejects with an `Error`: the call rejects with that error, the model is not called and no row is written.
- **I3b.** seed-load "Golden answers are loaded with the seed" (MODIFIED) requires that a failed save of a golden drift entry fails as `INTERNAL` and rolls back. "A failed golden save leaves the database unchanged" only fails an `explain` entry. Extend its GIVEN with a second run where the save of the `drift:` entry fails.
- **I3c.** seed-load "Golden drift files are checked before connecting" says the fingerprints of a golden drift file SHALL NOT be checked. No scenario shows that. In "A golden drift report is loaded under its key", make the file's `driftFingerprint` differ from the current one.
- **I3d.** drift-golden "Drift build command contract and configuration": no scenario covers `DATABASE_UNAVAILABLE`, nor the rule "no output SHALL contain… any text of the report" on a successful run. The success scenario should assert that stdout does not contain the statements' text.
- **I3e.** cli-drift "Drift events and failures" writes the events, which carry `docPath`, to stderr. "Drift terminal safety" constrains only stdout. Say that event lines go through `toTerminalSafeJson`, as `ask` writes its error line (`packages/cli/src/commands/ask.ts:119`). Then extend "Control characters in a drift report are escaped" with an event whose `docPath` holds `\u001b[2J` and assert stderr holds no raw control character.

## 4. Ambiguity

Clean. None of the listed words (fast, easy, secure, efficient, many, appropriate, robust) appears in a requirement or a scenario. "poor", "small", "often" and "few" appear only in the rationale and risks of `design.md` (lines 70, 188, 234). They are not normative.

## 5. Open decisions

- **B2 (blocking). When the clock is first read.**
  - drift-detection ADDED "Golden drift report lookup" says: "Unless the request sets `useCache: false`, `drift` SHALL … read the clock once (its first read) and look the key up once".
  - That makes the first read conditional on the cache being on.
  - Design P5 and task 1.5 read the clock on every call, right after validation.
  - "Drift query log" needs a latency of at least 1 for every unknown row, including `useCache: false`.

  The `drift.spec.ts` tests script the clock's reads (task 1.10), so they will pin whichever reading the implementer picks. Fix the requirement text: "After checking the request and the workspace root, `drift` SHALL read the clock once (its first read) in every call; then, unless the request sets `useCache: false`, and before the evaluation-mode check, in both modes, it SHALL look the key up once in the project's answer cache."

- **B3 (blocking). Which rejections write a row.**
  - drift-detection "Drift query log" says: "When `drift` rejects after at least one model call resolved, it SHALL write one row". Read literally, this also covers a rejection caused by the row write of a returned report (the scenario "Other row write errors propagate", after a live run whose calls resolved). That would mean a second `saveQueryLog`.
  - `explain` does not do this: its rejection row covers only the pipeline (`packages/core/src/explain/explain.ts:189-197`); the row of a returned answer is written outside the `try`.
  - The rejection row's `question`, `capability`, `baselineTokens` and `latencyMs` are not stated.

  A test that counts `saveQueryLog` calls will pin this. Fix: "When the pipeline rejects before its report is built, after at least one model call resolved, `drift` SHALL write one row with `question` the call's key, `capability` `drift`, `baselineTokens` `null`, `latencyMs` the latency between the clock's first read and a read taken at the rejection, the tokens and cost of the resolved `answer` and `verify` calls…, `verifyLatencyMs` `null` and `cacheHit` `false`. A failure of the row write of a returned report SHALL NOT lead to a second row." In "Other row write errors propagate", add "and `saveQueryLog` was called exactly once".

## 6. Contradictions inside the change

- **B4 (blocking). The DoD scenario versus its task.** cli-drift "Q5 is printed from the golden report in evaluation mode" has the GIVEN "a migrated database where `db:seed` loaded…" and the WHEN "runs through the default connections". Task 8.4 instead saves the golden in the harness transaction, which the ticket also asks for ("el golden guardado en la transacción del arnés"). The command's default connections (its own `pg.Pool`, `ask.ts:134-149`) cannot see rows of an uncommitted harness transaction. As written, the scenario cannot be implemented with the harness, and the test named after it would not do what it says.

  Fix the scenario: GIVEN "the versioned seed loaded with `loadSeed` and the entry of the versioned `seeds/drift/acme-shop.json` saved through the real store under `drift:` in the harness transaction, as `db:seed` saves it, and no `LLM_*` variable"; WHEN "`drift acme-shop` runs over a store on that transaction". The `db:seed` path is covered by seed-load "A golden drift report is loaded under its key" and by manual task 13.2.

- **I4a (improvable). What the build refuses.** The proposal (Impact, "Cost and privacy") and design Goals say the golden is refused when it holds "a URL". drift-golden "Retries and failures" refuses only the values of `DATABASE_URL` and `LLM_BASE_URL`, not any URL. Align the proposal and design wording: "the planted AWS key shape, the absolute path of the repository or workspace, the value of `DATABASE_URL` or `LLM_BASE_URL`, or the API key".
- **I4b (improvable). Rows per call.** The proposal (Modified Capabilities) says `drift` "writes one `query_log` row per call". The spec writes no row when `drift` rejects before any model call resolves. Reword: "one row per returned report, and one per rejection after a resolved model call".

## 7. Contradictions with the project

- **B1 (blocking). A stale fingerprint fails the unit suite, against an ADR.**
  - Design D8 and drift-golden "The versioned golden drift file is coherent" make the unit test `tests/unit/seed/drift-golden-coherence.spec.ts` fail when `driftFingerprint` is stale or the `seed` fingerprints differ from `seeds/graph-dump.sql`.
  - ADR `docs/adr/20261017-stale-fingerprint-fails-verify.md` → Consequences says: "Only the `verify` job goes red: the unit and integration tests inject the fingerprints … so a stale fingerprint does not fail the whole suite".
  - The `explain` coherence requirement (`openspec/specs/golden-answers/spec.md`, "The versioned golden file is coherent", lines 469-477) deliberately checks no fingerprint.
  - Four drift fingerprint inputs are also inputs of the answer fingerprint (`packages/cli/src/cache/answer-fingerprint.ts:17-23`): `explain/sanitize.ts`, `explain/untrusted-text.ts`, `verify/verify-prompt.ts` and `verify/policy.ts`.
  - So from now on, any later change to those files, or any `seed:build`, turns the unit suite red until `drift:build` is run with a live model.
  - The ADR's regeneration recipe ("`seed:build`, then `cache:build`") becomes incomplete.
  - D14 says "No ADR".

  Fix, default (a):
  - add an ADR that amends `20261017` for the golden drift report and says the recipe is now `seed:build`, then `cache:build`, then `drift:build`;
  - change D14 accordingly;
  - add a task in step 15 that writes the ADR and updates the Ollama/golden gotcha of `docs/project-context.md`.

  Alternative (b), if the author chooses it: drop the two freshness checks from the requirement and the test, and record in Risks that a stale golden drift report goes unnoticed.

- **I5 (improvable). A seed-load requirement left untouched.** `openspec/specs/seed-load/spec.md` → "Sample projects are loaded idempotently" (lines 109-119) is not in the delta. It still says the load saves "the golden answers" and that the sample cache entries are replaced "by entries with the same project, normalized question and response". A `drift:` entry is keyed by its `key`, not a normalized question. Add it as MODIFIED: "…then save the golden answers and the golden drift reports…" and "…with the same project, key (normalized question or golden drift key) and response…". Keep both of its scenarios by name.

## 8. Contrast with the real code

What the design names exists as described:
- `safeLines`, `excerptLines`, `toFailure` and `MAX_EXCERPT_LINES` are exported by `ask.ts` (lines 165-277).
- The `cache-build.ts` helpers exist: `readBuildTimeout:317`, `isUnsafe:419`, `gitHead:429`, `defaultBuildHistory:434`, `missingConfig:444`, `staleSeed:448`, `MAX_ATTEMPTS:54`, `RETRIED_LLM_REASONS:63`.
- `QueryNotLoggedEvent` is at `explain-event.ts:40`.
- `meterLlm` exposes `resolvedCalls`, `verification` and `verifyCalls` (`usage-meter.ts:16-27`).
- The in-memory store has `failQueryLogWrite` and `failCacheCall` (`tests/support/in-memory-store.ts:257-258`).
- `assertValidCacheKey` accepts a `drift:…` key (`knowledge/cache-entry.ts:27-31`).
- `assertValidQueryLogEntry` accepts `capability` `drift` (`knowledge/query-log.ts:10`).

No new abstraction duplicates an existing one, apart from I6a.

- **I6a (improvable). The connection's application name.** Design D4 says the command uses "`defaultOpenStore`" among the seams of `ask`. `ask.ts:134-149` hard-codes `application_name: ASK_APPLICATION_NAME`, so reusing it would break "The drift connections are closed after a run". `impact.ts:90` already has its own copy. Say in D4 and task 7.2 that `drift.ts` defines its own `defaultOpenStore` with `DRIFT_APPLICATION_NAME`, as `impact.ts` does, or extract a shared `openStoreWith(applicationName)`. Do not leave the choice to the implementer.
- **I6b (improvable). Manual budget check.** `packages/adapters/llm/src/config.ts:105`: with `DAILY_BUDGET_USD` set and a model without a price, `llmConfigFromEnv` throws `LLM_CONFIG_INVALID` before anything runs. Manual task 13.3 says "`BUDGET_EXHAUSTED` only if the price table prices the model; record what happens". State the expected outcome instead: `LLM_CONFIG_INVALID` with `details.variable` = `DAILY_BUDGET_USD` when `qwen2.5-coder` has no price, `BUDGET_EXHAUSTED` otherwise.
- **Note.** The JSDoc of `DriftDependencies.store` ("only read") and `now` ("read first after the project is resolved") at `drift.ts:44-56` becomes false. Task 1.5 covers it ("JSDoc on every export"); no correction is needed.

## 9. Task size

- **B6 (blocking). The live-model runs do not fit one tool call.** Tasks 6.2 (`npm run drift:build` with Ollama) and 13.3 (a live `drift acme-shop --doc docs/pricing.md`) are long:
  - `docs/project-context.md` (DIS-72 Ollama gotcha, around line 1151) gives 3.5–9 min per answer on CPU;
  - one acme-shop run makes 2 extraction calls, up to 24 confrontations and the `verify` calls;
  - `drift:build` makes up to 3 attempts.

  That is tens of minutes to hours, well beyond the 10-minute call limit the change itself cites in task 11.4. Neither task says how to run it. Add to both: run the command detached, with stdout and stderr to a log under the session scratch directory, poll it in calls under 10 minutes, and record the start, end and total. For 6.2, also set an explicit wall-clock ceiling after which the agent stops and follows design → Risks.

- **B5 (blocking). Task order leaves the golden stale.** Task 6.2 generates the golden before tasks that edit `DRIFT_FINGERPRINT_FILES` inputs:
  - 9.1 completes JSDoc on `packages/core/src/drift/`, including `drift-report.ts` and `drift-cache.ts`;
  - 11.4 kills mutants with new code where needed;
  - 17.6 applies review fixes.

  Any byte changed in `drift-report.ts`, `drift-cache.ts` or the other inputs makes the versioned golden stale. Under D8 the coherence test then fails, and an Ollama run nobody planned is needed. Fix:
  - task 1.5 and task 2.2 finish the final JSDoc of `drift-report.ts` and `drift-cache.ts`;
  - task 9.1 excludes the fingerprint inputs;
  - add a task after 11.4 and in 17.6: "if any file of `DRIFT_FINGERPRINT_FILES` changed after task 6.2, re-run `npm run drift:build` (as in B6) and `npm run db:seed`, and record it in the step 12 report".

The other tasks fit a turn.

## 10. Mandatory steps

Clean.
- Step 0 creates and checks the branch `feature/dis-73-cli-drift-golden` and comes first.
- These steps are present, in order, with their labels:
  - 10, Review and Update Existing Tests (MANDATORY);
  - 11, Run Tests and Verify Data State (MANDATORY);
  - 12, Verify Data State and Report (MANDATORY), with the report path `reports/YYYY-MM-DD-12-test-and-state-verification.md`;
  - 13, Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE), including PowerShell run by the agent;
  - 14, E2E, justified as not applicable;
  - 15, Update Technical Documentation (MANDATORY);
  - 17, Pre-merge Review (MANDATORY - AGENT MUST EXECUTE), last, with the three checks in order, fixes on the same PR, and the archive before the merge.
- State restoration: task 13.6 runs `db:seed` to reset `hit_count`; the `query_log` rows are recorded (the table is append-only); task 12.1 compares against the baseline from task 0.4.

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| drift-detection: Drift request | An invalid drift request is rejected before the store | 1.2, 1.3 |
| | A relative workspace root is rejected before the store | existing test, kept (10.3) |
| drift-detection: Unknown drift answers | Evaluation mode answers llm-required without reading anything | 1.10 (+2.4) |
| | Evaluation mode without a golden report answers llm-required without reading the project | 1.10 (+2.4) |
| | A project without documents answers no-docs | existing test, kept (10.3); row by 2.4 |
| | A docPath that is not a stored document answers no-docs | existing test, kept (10.3) |
| drift-detection: Drift report | The report of a contradiction carries both citations, its type and its provenance | 2.9 |
| | The usage adds every answer and verify call of the run | existing test, kept (10.3) |
| drift-detection: Drift failures, logging and writes | A failing answer call propagates unchanged | existing test, kept (10.3) |
| | A drift run writes nothing | 2.9 |
| drift-detection: Golden drift report lookup | A golden report is answered from the cache in both modes | 1.4, 1.5 |
| | An invalid golden entry is a miss without an event | 1.6 |
| | A docPath is looked up under its own key | 1.7 |
| | Turning the cache off skips the lookup and saves nothing | 1.8 |
| | A failing golden lookup stops before the model | 1.9 |
| drift-detection: Drift query log | A run with the model leaves one row with its usage | 2.1, 2.2 |
| | A golden report leaves a cache-hit row with zero counters | 2.3 |
| | An unknown report leaves a zero row | 2.4 |
| | A failure after a model call leaves a row and keeps its error | 2.5 |
| | No row when drift fails before a model call resolves | 2.6 |
| | A failed row write still answers and says so | 2.7 |
| | Other row write errors propagate | 2.8 |
| seed-load: Golden answers are loaded with the seed (MODIFIED) | the 4 existing scenarios | 5.3 |
| seed-load: Golden drift files are checked before connecting | An invalid golden drift file fails before connecting | 5.1, 5.2 |
| | A golden drift report is loaded under its key | 5.3 |
| drift-golden: Drift build command contract and configuration | Drift build arguments and configuration fail before anything else | 4.2, 4.3 |
| | The drift build's request limit applies and the daily ceiling does not | 4.4 |
| drift-golden: The seed the drift report is built on is current | A missing or outdated seed is refused by the drift build | 4.5 |
| drift-golden: How a golden drift report is produced | The golden drift report is generated with a scripted model | 4.10 |
| | A non-sample acme-shop blocks the drift build | 4.11 |
| drift-golden: Retries and failures | A skipped document is retried | 4.6 |
| | A drift report that cannot become golden fails without writing | 4.7 |
| | A project without documents fails at once | 4.8 |
| drift-golden: Golden drift file format | The canonical drift render is stable | 3.1, 3.2 |
| | Golden drift files with an invalid shape are rejected | 3.3 |
| drift-golden: Golden drift fingerprint | The drift fingerprint covers exactly its declared inputs | 3.4 |
| drift-golden: A failed drift build never leaves a broken golden drift file | A failed write leaves the previous golden drift file intact | 4.9 |
| drift-golden: The versioned golden drift file is coherent | The versioned golden drift file matches the seed, the table and the code | 6.1–6.3 (see B1, B5) |
| cli-drift: Drift command arguments | Drift help and version print without reading the environment | 7.1, 7.2 |
| | The global help lists drift once | 8.1 |
| | Drift usage errors never quote the arguments | 7.3 |
| | An invalid drift document path is rejected before any connection | 7.4 |
| cli-drift: Drift configuration and connection | Drift configuration errors fail before any connection | 7.5 |
| | An unreachable database fails without leaking the URL for drift | 8.2 |
| | The drift connections are closed after a run | 8.3 (see I6a) |
| | A daily budget stops the drift model call | 7.6 |
| cli-drift: Drift project resolution | Only the exact name resolves the drift project | 7.7 |
| | Drift receives only the project id and the document path | 7.8 |
| cli-drift: Drift report output | A drift report is printed by document with both citations | 7.9 |
| | Q5 is printed from the golden report in evaluation mode | 8.4 (see B4) |
| | A live run over the indexed acme-shop prints the planted contradictions | 8.6 |
| cli-drift: Drift UNKNOWN output | Evaluation mode without a golden report answers llm-required on the command line | 8.5 |
| | A project without documents answers no-docs on the command line | 7.10 |
| cli-drift: Drift events and failures | Drift events go to stderr with their level | 7.11 |
| | Model, budget and source failures keep their code on the command line | 7.12 |
| | An unexpected drift failure is internal | 7.13 |
| cli-drift: Drift terminal safety | Control characters in a drift report are escaped | 7.14 |

No row is empty. The per-file counts in task 10.3 match the deltas: 22, 6, 13 and 19 scenarios. The scenarios to be added for I2 and I3 need tasks: see the corrections.

---

## Corrections to apply

### `openspec/changes/add-cli-drift/specs/drift-detection/spec.md`

1. **(B2)** In "Golden drift report lookup", replace the sentence "Unless the request sets `useCache: false`, `drift` SHALL, after checking the request and the workspace root and before the evaluation-mode check, in both modes, read the clock once (its first read) and look the key up once in the project's answer cache." with: "After checking the request and the workspace root, `drift` SHALL read the clock once (its first read) in every call. Then, unless the request sets `useCache: false`, and before the evaluation-mode check, in both modes, it SHALL look the key up once in the project's answer cache."
2. **(B3)** In "Drift query log", replace "When `drift` rejects after at least one model call resolved, it SHALL write one row with the tokens and cost of the `answer` and `verify` calls that resolved (the `verify*` counters from the resolved `verify` calls), `verifyLatencyMs` `null` and `cacheHit` `false`, and then reject with the same error; a failure of that write SHALL never replace the error." with: "When the pipeline rejects before its report is built, after at least one model call resolved, `drift` SHALL write one row with `question` the call's key, `capability` `drift`, the tokens and cost of the `answer` and `verify` calls that resolved (the `verify*` counters from the resolved `verify` calls), `baselineTokens` `null`, `latencyMs` the latency between the clock's first read and a read taken at the rejection, `verifyLatencyMs` `null` and `cacheHit` `false`, and then reject with the same error; a failure of that write SHALL never replace the error. A failure of the row write of a returned report SHALL NOT lead to a second row."
3. **(B3)** In the THEN of "Other row write errors propagate", append: "and `saveQueryLog` was called exactly once".
4. **(I2)** In the WHEN of "A failure after a model call leaves a row and keeps its error", add: "and then with a model whose second `answer` call rejects with `LlmUnavailable` reason `timeout`". In the THEN add: "the same holds with that `LlmUnavailable` error".
5. **(I3a)** In the GIVEN of "A failing golden lookup stops before the model", add a third case: "then a store holding a valid golden entry whose `touchCacheEntry` rejects with an `Error`". In the THEN add: "the third rejects with that same error".

### `openspec/changes/add-cli-drift/specs/cli-drift/spec.md`

6. **(B4)** Rewrite the GIVEN and WHEN of "Q5 is printed from the golden report in evaluation mode": GIVEN "the versioned seed loaded with `loadSeed` in the harness transaction, the entry of the versioned `seeds/drift/acme-shop.json` saved under `drift:` through the real store on that transaction (as `db:seed` saves it), and no `LLM_*` variable (evaluation mode)"; WHEN "`drift acme-shop` runs over a store on that transaction". The THEN is unchanged.
7. **(I3e)** In "Drift events and failures", after "as one JSON line", add "rendered terminal-safe as the error line is (`toTerminalSafeJson`)". In "Control characters in a drift report are escaped", add to the GIVEN "and one `drift_doc_skipped` event of that path", and to the THEN "and stderr holds no character U+0000 to U+001F other than the line feed, nor U+007F".

### `openspec/changes/add-cli-drift/specs/seed-load/spec.md`

8. **(I5)** Add a MODIFIED "Sample projects are loaded idempotently". Copy the main requirement and change two passages:
   - "then save the golden answers (see …)" becomes "then save the golden answers and the golden drift reports (see "Golden answers are loaded with the seed")";
   - "entries with the same project, normalized question and response" becomes "entries with the same project, key (the normalized question of a golden answer or the `key` of a golden drift report) and response".

   Keep both of its scenarios by name.
9. **(I3b)** In the GIVEN of "A failed golden save leaves the database unchanged", add: "then a load, with a golden drift directory holding a valid `acme-shop.json`, whose save of the `drift:` entry fails".
10. **(I3c)** In the GIVEN of "A golden drift report is loaded under its key", add "whose `driftFingerprint` and `seed` fingerprints are not the ones of the current code".

### `openspec/changes/add-cli-drift/specs/drift-golden/spec.md`

11. **(I3d)** In the THEN of "The golden drift report is generated with a scripted model", add "and no output contains the text of any statement or claim of the report". In "Drift build arguments and configuration fail before anything else", add a case with an unreachable `DATABASE_URL` that expects `DATABASE_UNAVAILABLE` and leaves the previous file unchanged.
12. **(B1, option a)** No text change. If the author chooses (b), remove "whose `seed` fingerprints are the header fingerprints of the versioned `seeds/graph-dump.sql`; whose `driftFingerprint` is the one of the current code" from "The versioned golden drift file is coherent", and replace them with "whose fingerprints are well formed".

### `openspec/changes/add-cli-drift/proposal.md`

13. **(I4a)** In Impact → "Cost and privacy", replace "the planted AWS key shape, an absolute path, a URL or the API key" with "the planted AWS key shape, the absolute path of the repository or of the build workspace, the value of `DATABASE_URL` or `LLM_BASE_URL`, or the API key".
14. **(I4b)** In Modified Capabilities → `drift-detection`, replace "writes one `query_log` row per call" with "writes one `query_log` row per returned report and one per rejection after a resolved model call".

### `openspec/changes/add-cli-drift/design.md`

15. **(I4a)** In Goals, replace "refused when it holds a secret, an absolute path or a URL" with the wording of correction 13.
16. **(B1)** In D8, add: "This diverges from the consequence of ADR `20261017-stale-fingerprint-fails-verify` that only the `verify` job goes red for a stale fingerprint. The divergence is recorded in the ADR `<date>-drift-golden-freshness-in-unit-suite` (step 15). From now on, a change to a shared input (`explain/sanitize.ts`, `explain/untrusted-text.ts`, `verify/verify-prompt.ts`, `verify/policy.ts`) or a `seed:build` also needs `npm run drift:build`." Replace D14 with: "D14. One ADR: the freshness of the golden drift report is checked by the unit suite (amends `20261017`)." Update Follow-up E14 (destination A) and add E-B1 (destination A).
17. **(I6a)** In D4, replace "`defaultOpenStore`" with "its own `defaultOpenStore` with `application_name` `codemind-drift` (as `impact.ts:90` has its own; `ask.ts:138` hard-codes `codemind-ask`)".
18. **(B2, B3)** In P5, add: "The first read is unconditional (also with `useCache: false`)". In D3, add: "The rejection row covers only a rejection of the pipeline before the report is built. A failed row write of a returned report is never followed by a second row (as `explain.ts:189-203`)."
19. Add Follow-up rows B1–B6 and I1–I6, each with its destination (A, or D where accepted).

### `openspec/changes/add-cli-drift/tasks.md`

20. **(B5)** In task 1.5 and task 2.2, append: "the final JSDoc of `drift-report.ts` and `drift-cache.ts` is written here; they are inputs of `driftFingerprint` and are not edited after task 6.2 without task 11.5". In task 9.1, append: "excluding `DRIFT_FINGERPRINT_FILES`, finished in 1.5 and 2.2". Add a new task 11.5 and a clause in 17.6: "If any file of `DRIFT_FINGERPRINT_FILES` changed after task 6.2, re-run `npm run drift:build` (as task 6.2) and `npm run db:seed`, check that the coherence test is green, and record the run in the step 12 report".
21. **(B6)** In tasks 6.2 and 13.3, append: "Run the command detached (stdout and stderr to a log in the session scratch directory), poll the log in calls shorter than 10 minutes, and record the start, end and total time. For 6.2, stop after <N> hours without a written file and follow design → Risks." Pick N; 3 is consistent with 3 attempts at 3.5–9 min per answer.
22. **(I6b)** In task 13.3, replace "(`BUDGET_EXHAUSTED` only if the price table prices the model; record what happens and why)" with "(expected: `LLM_CONFIG_INVALID` with `details.variable` `DAILY_BUDGET_USD` if `qwen2.5-coder` has no price in the cost table, `packages/adapters/llm/src/config.ts:105`; `BUDGET_EXHAUSTED` otherwise)".
23. **(B4)** In task 8.4, append: "(the scenario's GIVEN as rewritten: `loadSeed` plus `saveCacheEntry` in the harness transaction, the command's `openStore` seam on that transaction)".
24. **(I2, I3)** Add the new cases to the existing tasks:
    - I2 → task 2.5;
    - I3a → task 1.9;
    - I3b → task 5.3, which also adds `seed-load.ts` to its GREEN if needed;
    - I3c → task 5.3;
    - I3d → tasks 4.2 and 4.10;
    - I3e → tasks 7.11 and 7.14.

    Task 10.3 keeps the same counts, since these are cases inside existing scenarios.
25. **(I5)** In task 5.3 and in the counts of task 10.3, add the 2 kept scenarios of the MODIFIED "Sample projects are loaded idempotently": seed-load goes from 6 to 8 scenarios, and both are existing tests in `tests/integration/cli/seed-load.spec.ts`.
26. **(B1)** Add to step 15 a task: "Write the ADR `docs/adr/<date>-drift-golden-freshness-in-unit-suite.md` (template `docs/adr/_template.md`), add it to `docs/adr/README.md`, and update the regeneration recipe in `docs/project-context.md` (`seed:build` → `cache:build` → `drift:build`)".

### Linear: DIS-73

Do not edit the `[original]` block. Two changes:

**(I1)** At the start of the `[enhanced]` part, add this note (Spanish):

> *Nota del agente (auditoría de la spec, 2026-11-03):* el cambio `add-cli-drift` sustituye tres puntos de este texto, según las decisiones P1–P3 del comentario de propose: el golden de drift lo genera `npm run drift:build` (no `cache:build acme-shop Q5`); `DRIFT_GOLDEN` vive en `packages/cli/src/cache/drift-golden-file.ts` (no `GOLDEN_DRIFT` en `demo-questions.ts`); la variable del techo diario es `DAILY_BUDGET_USD` (no `LLM_DAILY_BUDGET_USD`). Los criterios 3 y §3 «Golden» se leen con esos nombres.

**Comment (Spanish):**

> *(Texto del agente, auditoría de la spec de `add-cli-drift`, 2026-11-03.)* Veredicto: CHANGES REQUIRED, con 6 hallazgos bloqueantes. B1: el test unitario de coherencia del golden de drift comprueba la frescura de las huellas, en contra de la consecuencia del ADR `20261017-stale-fingerprint-fails-verify`; se propone un ADR que lo modifique (opción a), pendiente de que la autora lo revise. B2: la primera lectura del reloj no debe depender de `useCache`. B3: qué rechazos escriben fila y con qué campos. B4: el escenario del DoD debe usar la transacción del arnés, no las conexiones por defecto. B5: el golden se genera antes de tareas que tocan sus entradas de huella. B6: las ejecuciones con Ollama deben correr en segundo plano y consultarse por sondeo. Las correcciones se aplican en los artefactos del cambio; no se crea ninguna issue nueva.
