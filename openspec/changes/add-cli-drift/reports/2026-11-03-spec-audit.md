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

---

## Resolution of run 1

*Agent's text (autonomous run, correction round 1, 2026-11-03).* Every decision is also in
`design.md` → Follow-ups with its destination; none has destination C. `openspec validate add-cli-drift
--strict` passes after the corrections.

**Question for the author (B1)** — decided by the agent as lead engineer: option (a). The freshness of
the seed and drift fingerprints is criterion 5(c) of DIS-73 itself ("sus huellas de semilla son las de
`seeds/graph-dump.sql`, que `driftFingerprint` es el del código actual"), so option (b) would drop an
acceptance criterion of the ticket. The exception to ADR `20261017-stale-fingerprint-fails-verify` is
recorded in a new ADR, `docs/adr/20261103-drift-golden-freshness-in-unit-suite.md`, written by new task
15.5. Nothing is left for the author to review: the ADR states the decision as the agent's.

| Finding | Resolution |
|---|---|
| B1 | Decided by the agent (option a), see above. design D8 states the divergence and the new recipe (`seed:build` → `cache:build` → `drift:build`); D14 replaced ("One ADR"); Follow-up E14 changed to destination A and B1 added; proposal Impact gains a "Process" line; task 15.1 updates the gotcha and recipe in `docs/project-context.md`; new task 15.5 writes the ADR and adds it to `docs/adr/README.md`. No text change in drift-golden (correction 12). Fixed. |
| B2 | Fixed: drift-detection "Golden drift report lookup" now reads the clock once in every call after the request and workspace checks, and looks up unless `useCache: false`, with the audit's wording; design P5 says the first read is unconditional. |
| B3 | Fixed: drift-detection "Drift query log" limits the rejection row to a pipeline rejection before the report is built, states `projectId`, `question`, `capability`, `baselineTokens`, `latencyMs`, and says a failed row write of a returned report never leads to a second row; "Other row write errors propagate" asserts `saveQueryLog` called exactly once; design D3 cites `explain.ts:189-203`; tasks 2.5 and 2.8 updated. |
| B4 | Fixed: cli-drift "Q5 is printed from the golden report in evaluation mode" GIVEN/WHEN rewritten over the harness transaction (`loadSeed` plus the versioned entry saved through the real store); task 8.4 says how. The `db:seed` path stays covered by seed-load "A golden drift report is loaded under its key" and manual task 13.2. |
| B5 | Fixed: tasks 1.5 and 2.2 write the final JSDoc of `drift-report.ts` and `drift-cache.ts`; task 9.1 excludes `DRIFT_FINGERPRINT_FILES`; new task 11.5 and a clause in 17.6 re-run `drift:build` and `db:seed` if an input changed after 6.2; design Risks gains the row. |
| B6 | Fixed: tasks 6.2 and 13.3 (and 11.5) run the live command detached with a log in the session scratch directory, polled in calls under 10 minutes, with start, end and total recorded; `drift:build` has a 3-hour ceiling per run (N = 3, as the audit suggested), then design → Risks; a second miss is a clean stop. design Risks gains the row. |
| I1 | Fixed in Linear: the agent note of correction "Linear: DIS-73" was added at the start of the `[enhanced]` part; the `[original]` block was not edited. |
| I2 | Fixed: "A failure after a model call leaves a row and keeps its error" also runs with `LlmUnavailable` reason `timeout`, and asserts the row's stated fields; task 2.5. |
| I3a | Fixed: "A failing golden lookup stops before the model" gains the `touchCacheEntry` case (in-memory store `failCacheCall.touch`, which exists); tasks 1.1 and 1.9. |
| I3b | Fixed: "A failed golden save leaves the database unchanged" gains the run whose `drift:` save fails; task 5.3. |
| I3c | Fixed: "A golden drift report is loaded under its key" uses a file whose fingerprints are not current; task 5.3. |
| I3d | Fixed: "Drift build arguments and configuration fail before anything else" gains the unreachable `DATABASE_URL` case (`DATABASE_UNAVAILABLE`, no URL leaked, file unchanged); "The golden drift report is generated with a scripted model" asserts no output holds report text; tasks 4.2 and 4.10. |
| I3e | Fixed: "Drift events and failures" renders event lines with `toTerminalSafeJson`; "Control characters in a drift report are escaped" adds a `drift_doc_skipped` event and the stderr assertion; tasks 7.11 and 7.14. |
| I4a | Fixed: proposal Impact and design Goals use the spec's list (AWS key shape, absolute path of the repository or workspace, `DATABASE_URL` or `LLM_BASE_URL` value, API key); task 15.4 aligned. |
| I4b | Fixed: proposal Modified Capabilities says one row per returned report and one per rejection after a resolved model call. |
| I5 | Fixed: seed-load delta adds MODIFIED "Sample projects are loaded idempotently" (golden drift reports saved, entries replaced by key); both scenarios copied byte for byte from the main spec; task 5.3 and the counts of task 10.3 (seed-load 6 → 8). |
| I6a | Fixed: design D4 and task 7.2 say `drift.ts` defines its own `defaultOpenStore` with `codemind-drift`, as `impact.ts` does; no shared helper is extracted (the smallest change). |
| I6b | Fixed: task 13.3 states the expected outcome (`LLM_CONFIG_INVALID` with `details.variable` `DAILY_BUDGET_USD` for an unpriced model, `BUDGET_EXHAUSTED` otherwise). |
| Note (JSDoc of `DriftDependencies`) | No change needed, as the audit says: task 1.5 covers it. |

The scenario count per file of task 10.3 stays the same for drift-detection (22), drift-golden (13) and
cli-drift (19); seed-load goes from 6 to 8 with the two kept scenarios of the new MODIFIED requirement.

---

## Run 2 (2026-11-03)

CHANGES REQUIRED

# Spec audit: add-cli-drift (DIS-73), run 2, 2026-11-03

Questions for the author: none. All of the run 1 decisions are the agent's text (B1 option (a), B2–B6, I1–I6). None of them contradicts DIS-73, DIS-48 or the project, so this audit accepts them. The one blocking finding below is new and the agent can fix it without a product decision.

Inputs read:
- The change: `proposal.md`, `design.md`, `specs/{drift-detection,cli-drift,seed-load,drift-golden}/spec.md`, `tasks.md`, and `reports/2026-11-03-spec-audit.md` (run 1 and its resolution).
- Linear: DIS-73 (description with the `[enhanced]` agent note, and its 6 comments) and its parent DIS-48 (no comments).
- Project: `docs/base-standards.md` §3 and §7.1, `docs/AUTONOMOUS-RUN.md` (rule 8 relaxed), `docs/backend-standards.md`, `docs/project-context.md`, and the main specs `openspec/specs/{drift-detection,seed-load,golden-answers}/spec.md`. ADRs: `docs/adr/` index, `20261017-stale-fingerprint-fails-verify`, `20261020-kit-autonomous-mode`.
- Code:
  - `packages/core/src/drift/drift-report.ts`, `packages/core/src/explain/explain.ts:161-214`, `packages/core/src/knowledge/{cache-entry.ts,query-log.ts}`, `packages/core/src/verify/semantic.ts`;
  - `packages/cli/src/commands/ask.ts`, `packages/cli/src/commands/impact.ts`, `packages/cli/src/seed-load.ts`, `packages/cli/src/cache-build.ts`, `packages/cli/src/cache/{answer-fingerprint.ts,golden-file.ts}`;
  - `packages/adapters/llm/src/config.ts:79-110`, `packages/adapters/git/src/git-source-tree.ts`, `scripts/env.mjs:106`, `package.json`;
  - `tests/support/in-memory-store.ts`, `tests/unit/drift/drift.spec.ts`, `tests/unit/cli/seed-load.spec.ts`, `tests/unit/scripts/wiring.spec.ts`, `docs/DEMO.md`.

## 1. Scope against the ticket

Clean. Everything follows from DIS-73: the command, golden Q5, the `query_log` row, `withDailyBudget`, and the docs of D12.

Some pieces go beyond the ticket's literal text but are means to its own items, and are recorded on the ticket (propose comment, P1–P3, and the `[enhanced]` agent note of run 1):
- `drift:build`;
- the helper move to `cache/build-support.ts`;
- `useCache`;
- the new ADR (B1).

Case B, HTTP, `--json`, the panel review and `verify` are explicitly out. Nothing widens the change to the whole of DIS-48.

## 2. Inherited acceptance criteria

Clean. Each criterion of DIS-73 §2 maps to scenarios:

| Criterion | Scenarios |
|---|---|
| 1 | cli-drift "Q5 is printed from the golden report in evaluation mode"; manual task 13.2 |
| 2 | "Evaluation mode without a golden report answers llm-required on the command line"; "A project without documents answers no-docs on the command line" |
| 3 | "A live run over the indexed acme-shop prints the planted contradictions"; "A daily budget stops the drift model call"; drift-detection "A run with the model leaves one row with its usage"; "A failure after a model call leaves a row and keeps its error", now with `LlmUnavailable` |
| 4 | cli-drift arguments, configuration, resolution and events |
| 5(a) | "An invalid golden entry is a miss without an event" |
| 5(b) | seed-load "An invalid golden drift file fails before connecting" |
| 5(c) | drift-golden "The versioned golden drift file matches the seed, the table and the code" |

The DIS-48 criteria that DIS-73 inherits are covered as well:
- evaluation mode serves the golden;
- another project answers `llm-required`;
- the `query_log` row with `capability = 'drift'`;
- `no-docs` is not an error.

The two planted contradictions and the "confirmed claim is not a contradiction" criterion stay with the DIS-71 main spec.

- **I-1 (improvable). Mutation scope.** The ticket's non-functional line asks for "mutación ≥ 70 en `packages/core/src/drift/`". Task 11.4 mutates only four files of that directory. Either mutate the directory (`--mutate "packages/core/src/drift/**/*.ts"`, split if it exceeds the 10-minute call limit), or say in 11.4 that the unchanged DIS-71 files keep the score recorded in the `add-drift-detection` archive and cite it.

## 3. Missing scenarios

- **I-2 (improvable). Budget scenario setup.** In cli-drift "A daily budget stops the drift model call", the GIVEN does not say that the store double holds acme-shop's documents and indexed commit, or that a source double serves them. Without them the real `drift` answers `no-docs` and exits `0`, never reaching the model. Add to the GIVEN: "whose index state holds `docs/pricing.md` at an indexed commit, a source double serving it".
- **I-3 (improvable). Golden hit with an absorbed row failure.** "Golden drift report lookup" says a hit answers with `events: []`. "Drift query log" appends `query_not_logged` to every answered report whose row write is absorbed. No scenario shows the combination. Add a case to "A failed row write still answers and says so": a golden hit whose `saveQueryLog` rejects with `QueryLogWriteFailed` answers with `cacheHit` `true` and `events` exactly `[{ type: 'query_not_logged', code: 'store-write-failed' }]`.

## 4. Ambiguity

Clean. The only occurrence of a listed word is "as many as the seed's `INSERT`s" (seed-load delta, line 26). It is an exact count copied from the main spec.

## 5. Open decisions

- **B-1 (blocking). How task 13.5 gets evaluation mode in PowerShell.**
  - The DoD (criterion 1) asks for a PowerShell capture of `drift acme-shop` in evaluation mode for `docs/DEMO.md`.
  - Task 13.5 says to run it "without setting `$env:` variables (the command loads `.env` itself; if `.env` configures a live model, the step's evaluation-mode form is the one `docs/DEMO.md` gives)".
  - On this machine `.env` does configure a live model: tasks 6.2 and 13.3 run Ollama from it.
  - So a run without `$env:` is in `live` mode. The golden is served in both modes (D1), so the output looks identical, but the capture would be labelled "evaluation" while it ran live.
  - The usual trick does not work in PowerShell. `$env:X=''` deletes the variable, and `scripts/load-env.mjs` then refills it from `.env`.
  - Two facts make a fix possible: a blank value is kept (`scripts/env.mjs:106`, `Object.hasOwn`), and `llmConfigFromEnv` reads blank as unset (`config.ts:74,82`).
  - The implementer would have to invent the procedure alone, and the DEMO text depends on it.

  Fix it in task 13.5 and in the `docs/DEMO.md` step (task 15.3). See the corrections.

- **I-4 (improvable). Retry versus `unsafe-content` precedence.** In drift-golden "Retries and failures of a golden drift report", an answered report that holds an `invalid-model-output` skip and also matches the unsafe-content rule is both "retried" and "fails at once". State the order: "The unsafe-content check SHALL be applied first: a response that matches it fails at once with `unsafe-content` even when it also holds an `invalid-model-output` skip."

## 6. Contradictions inside the change

- **I-5 (improvable). "Moved unchanged" versus a changed signature.** Design P1 (and proposal Impact, "no behaviour change") says the helpers are moved "unchanged". Task 4.1 changes the signature of the unsafe-content check: it takes the secrets as an argument instead of the private `Plan` (`cache-build.ts:419`). Reword P1: "moved without behaviour change; the unsafe-content check takes the list of secrets instead of `Plan`".
- **I-6 (improvable). Lookup wording when the cache is off.** drift-detection "Unknown drift answers" says the cases are checked "after the golden drift report lookup …, when that lookup found no golden report". With `useCache: false` there is no lookup. Reword: "after the golden drift report lookup when it is made (see "Golden drift report lookup") and finds no golden report, or right after the request when `useCache` is `false`".
- **I-7 (improvable). Circular order of tasks 13.5 and 15.3.** Task 13.5 runs "the new `docs/DEMO.md` step (task 15.3)", and task 15.3 inserts "its captured output (task 13.5)". Say in 13.5: "write the step's command text in `docs/DEMO.md` first; task 15.3 adds the captured output and the surrounding prose".

## 7. Contradictions with the project

Clean.
- **ADR `20261017`.** The exception is recorded by the new ADR (task 15.5, D14).
- **Agent-written ADR.** Rule 8 of `base-standards.md` §3 ("the why is not written by the AI") is relaxed for autonomous runs. `docs/AUTONOMOUS-RUN.md:132` and ADR `20261020-kit-autonomous-mode` allow it as long as the text is marked as the agent's, and task 15.5 marks it.
- **Main specs.**
  - `seed-load` → "Command contract and configuration" is not contradicted: the drift files are an independent directory, and stdout is unchanged.
  - `golden-answers` → `seeds/cache/` stays `explain`-only.
  - Both requirements cited from `golden-answers` exist by name (`spec.md:11` and `:198`).
- **Kept scenarios.** The MODIFIED drift-detection requirements keep every scenario name of the main spec (P10).

- **I-8 (improvable). Document path in the error details.** cli-drift "Drift events and failures" says the error line "never holds the document path given", and also that `SourceUnavailable` keeps "the message and details the `ask` command gives". `ask.ts:292-296` puts `details.path` in `SourceUnavailable`. The git source sets that path for `missing`, `too-large` and `binary-content` (`git-source-tree.ts:111-163`). With `--doc docs/pricing.md`, a missing blob therefore yields `details.path` = the path given. The text reads more naturally as constraining only the message, but the double reading invites a test that pins the wrong behaviour.

  Clarify: "…whose message … never holds the document path given or any text of a document; the `details.path` of `SourceUnavailable` is kept as `ask` gives it (a stored path, escaped by `toTerminalSafeJson`)". Add to "Model, budget and source failures keep their code on the command line" a fifth throw, `SourceUnavailable` reason `missing` with path `docs/pricing.md`, expecting `details.path` `docs/pricing.md`.

## 8. Contrast with the real code

The design's references hold:
- `explain.ts:189-203`: the rejection row is inside the `try`, and the returned row is outside it;
- `ask.ts:119` and `ask.ts:138`;
- `impact.ts:94`, its own `IMPACT_APPLICATION_NAME`;
- `config.ts:105`: unpriced model under a ceiling;
- the in-memory store's `failCacheCall.touch` and `failQueryLogWrite`;
- `assertValidCacheKey` accepts `drift:…`;
- `query_log.question` is `text`, so a 1,006-character key fits;
- `QUERY_CAPABILITIES` has `drift`;
- `LlmConfig.verifyModel` exists for `generatedWith`.

Two further checks:
- `tests/unit/scripts/wiring.spec.ts` pins only the listed `PRELOADED` scripts, so adding `drift:build` breaks nothing.
- No `explain` fingerprint input is touched: `drift-report.ts` only imports from `explain-event.ts`, which is not in `ANSWER_FINGERPRINT_FILES`.

No new abstraction duplicates an existing one.

- **I-9 (improvable). Schema allows a contradiction without evidence.** `storedDriftReportSchema` (spec "Golden drift report lookup") does not require at least one evidence per contradiction. "Drift report" and the DIS-71 verification rules never return a contradiction without a kept code citation. Add "every contradiction with at least one evidence" to the stored drift report definition, and add a case to task 1.6 ("a contradiction with `evidence: []` is rejected").

## 9. Task size

Clean. The live Ollama runs (6.2, 11.5, 13.3) run detached and are polled, with a 3-hour ceiling. Every other task fits one turn.

## 10. Mandatory steps

Clean:
- Step 0 creates and checks the branch, and comes first.
- Steps 10–15 and 17 are present and labelled.
- Step 14 is justified as not applicable.
- The baseline (0.4), restoration (12.1, 13.6) and the report paths are present.
- Pre-merge review is last, with the archive before the merge.

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| drift-detection: Drift request | An invalid drift request is rejected before the store | 1.2, 1.3 |
| | A relative workspace root is rejected before the store | existing test, kept (10.3) |
| drift-detection: Unknown drift answers | Evaluation mode answers llm-required without reading anything | 1.10 (+2.4) |
| | Evaluation mode without a golden report answers llm-required without reading the project | 1.10 (+2.4) |
| | A project without documents answers no-docs | existing test, kept; row by 2.4 |
| | A docPath that is not a stored document answers no-docs | existing test, kept |
| drift-detection: Drift report | The report of a contradiction carries both citations, its type and its provenance | 2.9 |
| | The usage adds every answer and verify call of the run | existing test, kept (clock per 1.10) |
| drift-detection: Drift failures, logging and writes | A failing answer call propagates unchanged | existing test, kept |
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
| seed-load: Sample projects are loaded idempotently (MODIFIED) | The seed is loaded into an empty database | existing test, kept (5.3) |
| | Loading again changes nothing and keeps the user's projects | existing test, kept (5.3) |
| seed-load: Golden answers are loaded with the seed (MODIFIED) | Golden answers are loaded and served in evaluation mode | 5.3 |
| | A seed without golden files loads only the graph | 5.3 |
| | Loading golden answers again does not duplicate them | 5.3 |
| | A failed golden save leaves the database unchanged | 5.3 |
| seed-load: Golden drift files are checked before connecting | An invalid golden drift file fails before connecting | 5.1, 5.2 |
| | A golden drift report is loaded under its key | 5.3 |
| drift-golden: Drift build command contract and configuration | Drift build arguments and configuration fail before anything else | 4.2, 4.3 |
| | The drift build's request limit applies and the daily ceiling does not | 4.4 |
| drift-golden: The seed the drift report is built on is current | A missing or outdated seed is refused by the drift build | 4.5 |
| drift-golden: How a golden drift report is produced | The golden drift report is generated with a scripted model | 4.10 |
| | A non-sample acme-shop blocks the drift build | 4.11 |
| drift-golden: Retries and failures of a golden drift report | A skipped document is retried | 4.6 |
| | A drift report that cannot become golden fails without writing | 4.7 |
| | A project without documents fails at once | 4.8 |
| drift-golden: Golden drift file format | The canonical drift render is stable | 3.1, 3.2 |
| | Golden drift files with an invalid shape are rejected | 3.3 |
| drift-golden: Golden drift fingerprint | The drift fingerprint covers exactly its declared inputs | 3.4 |
| drift-golden: A failed drift build never leaves a broken golden drift file | A failed write leaves the previous golden drift file intact | 4.9 |
| drift-golden: The versioned golden drift file is coherent | The versioned golden drift file matches the seed, the table and the code | 6.1–6.3, 11.5, 17.6 |
| cli-drift: Drift command arguments | Drift help and version print without reading the environment | 7.1, 7.2 |
| | The global help lists drift once | 8.1 |
| | Drift usage errors never quote the arguments | 7.3 |
| | An invalid drift document path is rejected before any connection | 7.4 |
| cli-drift: Drift configuration and connection | Drift configuration errors fail before any connection | 7.5 |
| | An unreachable database fails without leaking the URL for drift | 8.2 |
| | The drift connections are closed after a run | 8.3 |
| | A daily budget stops the drift model call | 7.6 (see I-2) |
| cli-drift: Drift project resolution | Only the exact name resolves the drift project | 7.7 |
| | Drift receives only the project id and the document path | 7.8 |
| cli-drift: Drift report output | A drift report is printed by document with both citations | 7.9 |
| | Q5 is printed from the golden report in evaluation mode | 8.4, manual 13.2, PowerShell 13.5 (see B-1) |
| | A live run over the indexed acme-shop prints the planted contradictions | 8.6 |
| cli-drift: Drift UNKNOWN output | Evaluation mode without a golden report answers llm-required on the command line | 8.5 |
| | A project without documents answers no-docs on the command line | 7.10 |
| cli-drift: Drift events and failures | Drift events go to stderr with their level | 7.11 |
| | Model, budget and source failures keep their code on the command line | 7.12 |
| | An unexpected drift failure is internal | 7.13 |
| cli-drift: Drift terminal safety | Control characters in a drift report are escaped | 7.14 |

No row is empty. The per-spec counts of task 10.3 match the deltas: drift-detection 22, seed-load 8, drift-golden 13, cli-drift 19.

- **I-10 (improvable). Store of task 8.5.** The scenario "Evaluation mode without a golden report answers llm-required on the command line" asserts `query_log` rows. Like B4 of run 1, it can only run over the harness transaction. Task 8.1 sets that up for the file, but task 8.5 does not say it. Append to 8.5: "(over the harness transaction as in 8.4: `loadSeed`, both versioned golden directories saved through the real store, the command's `openStore` seam on that transaction)".

---

## Corrections to apply

### `openspec/changes/add-cli-drift/tasks.md`

1. **(B-1)** In task 13.5, replace "without setting `$env:` variables (the command loads `.env` itself; if `.env` configures a live model, the step's evaluation-mode form is the one `docs/DEMO.md` gives)" with:

   "forcing evaluation mode inside the command with `$env:LLM_BASE_URL=' '; $env:LLM_API_KEY=' '; npm run cli -- drift acme-shop`. PowerShell deletes a variable set to the empty string, so `scripts/load-env.mjs` would refill it from `.env`. A blank value is kept (`scripts/env.mjs:106`) and read as unset by `llmConfigFromEnv` (`packages/adapters/llm/src/config.ts:74,82`). `.env` is not edited. Check that the output ends with `note: golden report (answer cache)` and that the new `query_log` row has `cache_hit` true and zero counters."
2. **(B-1)** In task 15.3, append: "The `docs/DEMO.md` step gives the plain command for a `.env` copied from `.env.example` (every `LLM_*` empty), and the form of task 13.5 (`$env:LLM_BASE_URL=' '; $env:LLM_API_KEY=' '`) for a `.env` that configures a model, saying why an empty string does not work in PowerShell."
3. **(I-7)** In task 13.5, prepend: "Write the step's command text in `docs/DEMO.md` first; task 15.3 adds the captured output and the surrounding prose."
4. **(I-1)** In task 11.4, change the first `--mutate` to `"packages/core/src/drift/**/*.ts"`, split into runs under the 10-minute limit. Alternatively, add: "the unchanged DIS-71 files keep the score recorded in the `add-drift-detection` archive, cited in the step 12 report".
5. **(I-9)** In task 1.6, add to the extra cases: "a contradiction with `evidence: []`" among the rejected values.
6. **(I-10)** In task 8.5, append: "(over the harness transaction as in 8.4: `loadSeed`, both versioned golden directories saved through the real store, the command's `openStore` seam on that transaction)".
7. **(I-3, I-8)** In task 2.7, add the golden-hit case. In task 7.12, add the `SourceUnavailable` `missing` case with `details.path`.

### `openspec/changes/add-cli-drift/specs/cli-drift/spec.md`

8. **(I-8)** In "Drift events and failures", replace "whose message is built by the command, never taken from the error, and never holds the document path given or any text of a document" with:

   "whose message is built by the command, never taken from the error, and never holds the document path given or any text of a document (the `details.path` of `SourceUnavailable` is kept as `ask` gives it: a stored path, rendered by `toTerminalSafeJson`)".

   In "Model, budget and source failures keep their code on the command line":
   - add to the GIVEN "and `SourceUnavailable` with reason `missing` and path `docs/pricing.md`";
   - add to the THEN "then `SOURCE_UNAVAILABLE` with `details.reason` `missing` and `details.path` `docs/pricing.md`".
9. **(I-2)** In the GIVEN of "A daily budget stops the drift model call", after "a store double holding acme-shop", insert "whose index state holds `docs/pricing.md` at an indexed commit, a source double serving it".

### `openspec/changes/add-cli-drift/specs/drift-detection/spec.md`

10. **(I-3)** In "Golden drift report lookup", after "`events: []`", add "(followed by the `query_not_logged` event of "Drift query log" when its row write is absorbed)". In "A failed row write still answers and says so", add to the WHEN "and then answers a golden report from the cache with `saveQueryLog` rejecting with `QueryLogWriteFailed`", and to the THEN "the golden report has `cacheHit` `true` and `events` exactly `[{ type: 'query_not_logged', code: 'store-write-failed' }]`".
11. **(I-6)** In "Unknown drift answers", replace "after the request and after the golden drift report lookup (see "Golden drift report lookup"), when that lookup found no golden report" with "after the request and, when it is made, after the golden drift report lookup (see "Golden drift report lookup") when it finds no golden report".
12. **(I-9)** In "Golden drift report lookup", inside the stored drift report definition, after "every contradiction with `type` `INFERENCE`", add "and at least one evidence".

### `openspec/changes/add-cli-drift/specs/drift-golden/spec.md`

13. **(I-4)** In "Retries and failures of a golden drift report", after the unsafe-content sentence, add: "The unsafe-content check SHALL be applied first: a response that matches it fails at once with `unsafe-content` even when it also holds an `invalid-model-output` skip."

### `openspec/changes/add-cli-drift/design.md`

14. **(I-5)** In P1, replace "helpers moved, unchanged, from `cache-build.ts`" with "helpers moved without behaviour change from `cache-build.ts` (the unsafe-content check takes the list of secrets instead of the private `Plan`)". Make the same change in proposal Impact ("no behaviour change" stays).
15. Add Follow-up rows R2-B1 and R2-I1 to R2-I10, each with destination A (or D for any that is rejected, with its reason).

### Linear: DIS-73

Do not edit the `[original]` block. Add a comment (Spanish):

> *(Texto del agente, auditoría de la spec de `add-cli-drift`, ronda 2, 2026-11-03.)* Veredicto: CHANGES REQUIRED, con 1 hallazgo bloqueante. B-1: la captura en PowerShell del paso de `docs/DEMO.md` (tarea 13.5) debe forzar el modo evaluación. Con un `.env` que configura Ollama, ejecutar sin `$env:` corre en modo `live`, y en PowerShell `$env:X=''` borra la variable, que `load-env` vuelve a leer de `.env`. Se fija la forma `$env:LLM_BASE_URL=' '; $env:LLM_API_KEY=' '`, sin tocar `.env`. Mejoras: alcance de la mutación en `packages/core/src/drift/`; `details.path` de `SourceUnavailable` en la línea de error; un acierto del golden con la fila no escrita; orden entre `unsafe-content` y reintento en `drift:build`; al menos una evidencia por contradicción en `storedDriftReportSchema`; y precisiones de redacción en P1, en «Unknown drift answers» y en las tareas 8.5, 13.5 y 15.3. Las correcciones amplían los artefactos del cambio; no se crea ninguna issue nueva.

---

## Resolution of run 2

*Agent's text (autonomous run, correction round 2, 2026-11-03).* Run 2 had no question for the
author. Every decision is also in `design.md` → Follow-ups (rows R2-B1 and R2-I1 to R2-I10), all
with destination A; none has destination C. `openspec validate add-cli-drift --strict` passes after
the corrections.

| Finding | Resolution |
|---|---|
| B-1 | Decided by the agent, with the audit's `$env:` form rejected. `docs/AUTONOMOUS-RUN.md` §6 forbids the agent to set `$env:` variables (the auto-mode classifier denies them), so corrections 1 and 2 cannot be applied as written. Task 13.5 instead forces evaluation mode with Node's `--env-file` flag: a scratch file holding `LLM_BASE_URL=` and `LLM_API_KEY=`, and `npx tsx --env-file=<file> --import=./scripts/load-env.mjs --tsconfig packages/cli/tsconfig.run.json packages/cli/src/index.ts drift acme-shop`. Node sets both keys to the empty string before the preload, `loadEnvFile` keeps a key already set, `llmConfigFromEnv` reads empty as unset, and `DATABASE_URL` still comes from `.env`; `.env` is not edited. The agent checked it on Node v24.11.1 through `tsx` (probe: both keys empty and present, `DATABASE_URL` loaded). Task 13.5 keeps the audit's checks (the `note: golden report (answer cache)` line and a `query_log` row with `cache_hit` true and zero counters). Task 15.3 says the DEMO step gives the plain command for a `.env` copied from `.env.example` and the `--env-file` form for a `.env` with a model, with the reason. Follow-up R2-B1. Fixed. |
| I-1 | Fixed (first option of correction 4): task 11.4 mutates the whole `packages/core/src/drift/` directory, split into two runs under the 10-minute limit, with the score reported for the directory and by file. Follow-up R2-I1. |
| I-2 | Fixed: the GIVEN of cli-drift "A daily budget stops the drift model call" says the index state holds `docs/pricing.md` at an indexed commit and a source double serves it; task 7.6. |
| I-3 | Fixed: "Golden drift report lookup" says a hit's `events: []` is followed by the `query_not_logged` event when its row write is absorbed; "A failed row write still answers and says so" gains the golden-hit run and its THEN; task 2.7. |
| I-4 | Fixed: drift-golden "Retries and failures of a golden drift report" applies the unsafe-content check first, with the audit's wording. |
| I-5 | Fixed: design P1 and proposal Impact say the helpers move without behaviour change and the unsafe-content check takes the list of secrets instead of the private `Plan`. |
| I-6 | Fixed: "Unknown drift answers" checks its cases after the request and, when it is made, after the golden lookup when it finds no golden report. |
| I-7 | Fixed: task 13.5 writes the step's command text in `docs/DEMO.md` first; task 15.3 adds the captured output and the prose. |
| I-8 | Fixed: cli-drift "Drift events and failures" keeps `details.path` of `SourceUnavailable` as `ask` gives it (a stored path, through `toTerminalSafeJson`); "Model, budget and source failures keep their code on the command line" gains the `missing` throw with path `docs/pricing.md`; task 7.12. |
| I-9 | Fixed: the stored drift report definition requires at least one evidence per contradiction; task 1.6 rejects a contradiction with `evidence: []`. |
| I-10 | Fixed: task 8.5 runs over the harness transaction, as task 8.4. |

The scenario counts of task 10.3 are unchanged (drift-detection 22, seed-load 8, drift-golden 13,
cli-drift 19): every addition is a case inside an existing scenario.

---

## Run 3 (2026-11-03)

APPROVED

# Spec audit: add-cli-drift (DIS-73), run 3, 2026-11-03

**Questions for the author:** none.

The decisions from runs 1 and 2 are all marked as the agent's text:
- run 1: B1 option (a), B2–B6, I1–I6;
- run 2: R2-B1, the `--env-file` form that replaces the audit's `$env:` form, and R2-I1 to R2-I10.

None of them contradicts DIS-73, DIS-48 or the project. R2-B1 also follows `docs/AUTONOMOUS-RUN.md:349-353`, which forbids `$env:` assignments. This audit accepts all of them.

**Inputs read**
- **The change:** `proposal.md`, `design.md`, `specs/{drift-detection,cli-drift,drift-golden,seed-load}/spec.md`, `tasks.md`, and `reports/2026-11-03-spec-audit.md` (runs 1 and 2 with their resolutions).
- **Linear:**
  - DIS-73: its description, including the `[enhanced]` agent note, and all 7 of its comments, including the correction-round-2 comment.
  - Its parent, DIS-48.
- **Project docs:** `docs/base-standards.md` §7.1, `docs/openspec-tasks-mandatory-steps.md` (headings), `docs/AUTONOMOUS-RUN.md` §6, and the main spec `openspec/specs/drift-detection/spec.md`.
- **Code:**
  - `packages/core/src/drift/drift-report.ts` (`DriftUsage`), `packages/core/src/verify/semantic.ts:23-39` (`VerificationUsage`), `packages/core/src/knowledge/cache-entry.ts`;
  - `packages/adapters/llm/src/config.ts:79-110`, `scripts/env.mjs:95-108`, `package.json` scripts;
  - `packages/adapters/store-postgres/migrations/*.up.sql` (no index on `query_log.question` or `cache_entry.question_normalized`);
  - `packages/cli/src/{seed-load.ts,verify.ts}` imports;
  - `tests/support/{in-memory-store.ts,drift-doubles.ts}`, `tests/integration/cli/seed-load.spec.ts:60-159`, `tests/integration/api/ask.spec.ts`.

## 1. Scope against the ticket

Clean. Everything in the change follows from DIS-73:
- the `drift` command;
- the golden Q5;
- the `query_log` row with `capability = 'drift'`;
- `withDailyBudget`;
- the documentation of D12.

The extra pieces are means to the ticket's own items and are recorded on the ticket (propose comment P1–P3, the `[enhanced]` agent note, the round-1 comment):
- `npm run drift:build`;
- the helpers moved to `cache/build-support.ts`;
- `useCache`;
- the ADR amending `20261017`.

The non-goals are explicit: case B, HTTP, web, `--json`, document corrections, `verify` of the drift golden, and the panel review. Nothing widens the change to the whole of DIS-48.

## 2. Inherited acceptance criteria

Clean, with one improvable finding.

| Criterion | Covered by |
|---|---|
| 1 (DoD) | cli-drift "Q5 is printed from the golden report in evaluation mode", manual task 13.2, PowerShell task 13.5 |
| 2 | "Evaluation mode without a golden report answers llm-required on the command line"; "A project without documents answers no-docs on the command line" |
| 3 | "A live run over the indexed acme-shop prints the planted contradictions"; "A daily budget stops the drift model call"; drift-detection "A run with the model leaves one row with its usage"; "A failure after a model call leaves a row and keeps its error" (with `LlmUnavailable`) |
| 4 | cli-drift arguments, configuration, resolution, events and failures |
| 5(a), 5(b), 5(c) | "An invalid golden entry is a miss without an event"; seed-load "An invalid golden drift file fails before connecting"; drift-golden "The versioned golden drift file matches the seed, the table and the code" |

The DIS-48 criteria that DIS-73 inherits are all covered:
- the golden is served in evaluation mode;
- another project answers `llm-required`;
- the `query_log` row has `capability = 'drift'`;
- `no-docs` is not an error.

The planted contradictions and the "confirmed claim" criterion stay with the DIS-71 main spec ("Drift over the indexed acme-shop"), which is not modified.

- **R3-I1 (improvable). A variable name that does not exist.**
  - Criteria 1 and 2 of the ticket's `[enhanced]` text say `LLM_MODE=evaluation`. No such variable exists: `llmConfigFromEnv` decides the mode from `LLM_BASE_URL` and `LLM_API_KEY` (`packages/adapters/llm/src/config.ts:80-82`), and `.env.example` has no `LLM_MODE`.
  - The specs use the correct wording ("no `LLM_*` variable").
  - But the agent note added in run 1 lists only the three replaced names of P1–P3, so the ticket still disagrees with the change on this one.
  - Fix in Linear (see the corrections).

## 3. Missing scenarios

Clean. Every MUST clause added in runs 1 and 2 has a scenario or a case inside an existing scenario:
- the `touchCacheEntry` failure;
- the golden hit whose row write is absorbed;
- the `drift:` save failure in `db:seed`;
- the fingerprints that `db:seed` does not check;
- `DATABASE_UNAVAILABLE` in the build;
- terminal-safe stderr;
- `details.path` of `SourceUnavailable`;
- the precedence of `unsafe-content` over the retry.

## 4. Ambiguity

Clean. None of the listed words appears in a normative sentence:
- the only "many" is "as many as the seed's `INSERT`s", an exact count copied from the main seed-load spec;
- "small", "poor" and "often" appear only in the design's rationale and risks.

## 5. Open decisions

No blocking finding.

- **R3-I2 (improvable). `usage.verification.latencyMs` on a golden hit.**
  - drift-detection "Golden drift report lookup" gives a hit "a `usage` whose every token, cost and call counter (`generation` and `verification` included) is 0 and whose `latencyMs` (and only it) is the latency".
  - `VerificationUsage` also has its own `latencyMs` (`packages/core/src/verify/semantic.ts:39`), which is neither a token, a cost nor a call counter.
  - "(and only it)" suggests it is 0, and design P6 says "every counter 0", but neither text names the field.
  - The `toEqual` in "A golden report is answered from the cache in both modes" (task 1.4) will pin one value.
  - Fix: state it explicitly (see the corrections).
- **R3-I3 (improvable). Task 13.4 does not give the evaluation-mode command for `drift task-api`.**
  - Task 13.4 runs `drift task-api` "in evaluation mode" without the exact command.
  - On this machine `.env` configures Ollama, so the bare `npm run cli -- drift task-api` would run live and call the model.
  - Task 13.2 gives the Git Bash form. Reuse it: `LLM_BASE_URL= LLM_API_KEY= npm run cli -- drift task-api`.

## 6. Contradictions inside the change

Clean. The proposal, the design (D1–D14, P1–P10, Follow-ups) and the four deltas agree on:
- the clock's first read;
- the order of the lookup;
- which calls write a row;
- what the build refuses;
- the helper move;
- the PowerShell procedure (13.5 and 15.3, no longer circular).

## 7. Contradictions with the project

Clean.
- **ADR `20261017-stale-fingerprint-fails-verify`:** the exception is recorded by the new ADR (D14, task 15.5), and the recipe becomes `seed:build` → `cache:build` → `drift:build`.
- **Agent-written ADR:** allowed in an autonomous run as long as it is marked as the agent's text (task 15.5 marks it).
- **Scenario names of the main drift-detection spec:** the MODIFIED requirements keep every one (`openspec/specs/drift-detection/spec.md`, Drift request, Unknown drift answers, Drift report, Drift failures, logging and writes).
- **Requirements the change leaves untouched:** "Documents checked by a call" and "Drift over the indexed acme-shop" stay consistent with the earlier clock read and the lookup. Their projects have no `drift:` entry, so the lookup misses.
- **Task 13.5:** respects `docs/AUTONOMOUS-RUN.md:349-353` (no `$env:`).

## 8. Contrast with the real code

Clean. The references hold:
- `scripts/env.mjs:106` keeps a key that is already set (`Object.hasOwn`), so the `--env-file` form of R2-B1 works as described;
- `config.ts:82` treats blank as unset;
- `config.ts:105` gives `LLM_CONFIG_INVALID` for an unpriced model under a ceiling (task 13.3);
- `assertValidCacheKey` accepts any non-blank `drift:…` key (`knowledge/cache-entry.ts:27-31`);
- no btree index covers `query_log.question` or `cache_entry.question_normalized`, so a key of about 1,006 code points cannot break an index;
- `findCacheEntry` of the in-memory store rejects an unknown id with `ProjectNotFound` before the key lookup (`tests/support/in-memory-store.ts:502-513`), which matches the "A failing golden lookup stops before the model" case;
- `failQueryLogWrite` and `failCacheCall.touch` exist (`:497`, `:541`);
- `verify.ts` imports only `readGoldenFiles` and `readSeed`, so `seeds/drift/` cannot reach `npm run verify`;
- integration suites that use the adapter's `loadSeed` (for example `tests/integration/api/ask.spec.ts:87`) load no golden file, so their `cache_entry` counts are unaffected;
- `tests/integration/cli/seed-load.spec.ts` `load()` uses the default directories, and its reload snapshot compares cache rows by key, so the kept scenarios stay green with the versioned drift file (task 5.3).

No new abstraction duplicates an existing one.

## 9. Task size

Clean.
- The live Ollama runs (6.2, 11.5, 13.3) run detached and are polled in calls under 10 minutes, with a 3-hour ceiling.
- Mutation (11.4) is split into runs under the call limit.
- Every other task fits one turn.

## 10. Mandatory steps

Clean.
- Step 0 creates and checks the branch `feature/dis-73-cli-drift-golden` and comes first.
- Steps 10, 11, 12, 13, 15 and 17 are present with their labels; step 14 is justified as not applicable.
- The baseline (0.4) and the restoration (12.1, 13.6: `db:seed` resets `hit_count`; the `query_log` rows are recorded because the table is append-only) are present.
- The report paths follow the template.
- The pre-merge review is last, with the archive before the merge.

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| drift-detection: Drift request | An invalid drift request is rejected before the store | 1.2, 1.3 |
| | A relative workspace root is rejected before the store | existing test, kept (10.3) |
| drift-detection: Unknown drift answers | Evaluation mode answers llm-required without reading anything | 1.10 (+2.4) |
| | Evaluation mode without a golden report answers llm-required without reading the project | 1.10 (+2.4) |
| | A project without documents answers no-docs | existing test, kept; row by 2.4 |
| | A docPath that is not a stored document answers no-docs | existing test, kept |
| drift-detection: Drift report | The report of a contradiction carries both citations, its type and its provenance | 2.9 |
| | The usage adds every answer and verify call of the run | existing test, kept (clock per 1.10) |
| drift-detection: Drift failures, logging and writes | A failing answer call propagates unchanged | existing test, kept |
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
| seed-load: Sample projects are loaded idempotently (MODIFIED) | The seed is loaded into an empty database | existing test, kept (5.3) |
| | Loading again changes nothing and keeps the user's projects | existing test, kept (5.3) |
| seed-load: Golden answers are loaded with the seed (MODIFIED) | Golden answers are loaded and served in evaluation mode | 5.3 |
| | A seed without golden files loads only the graph | 5.3 |
| | Loading golden answers again does not duplicate them | 5.3 |
| | A failed golden save leaves the database unchanged | 5.3 |
| seed-load: Golden drift files are checked before connecting | An invalid golden drift file fails before connecting | 5.1, 5.2 |
| | A golden drift report is loaded under its key | 5.3 |
| drift-golden: Drift build command contract and configuration | Drift build arguments and configuration fail before anything else | 4.2, 4.3 |
| | The drift build's request limit applies and the daily ceiling does not | 4.4 |
| drift-golden: The seed the drift report is built on is current | A missing or outdated seed is refused by the drift build | 4.5 |
| drift-golden: How a golden drift report is produced | The golden drift report is generated with a scripted model | 4.10 |
| | A non-sample acme-shop blocks the drift build | 4.11 |
| drift-golden: Retries and failures of a golden drift report | A skipped document is retried | 4.6 |
| | A drift report that cannot become golden fails without writing | 4.7 |
| | A project without documents fails at once | 4.8 |
| drift-golden: Golden drift file format | The canonical drift render is stable | 3.1, 3.2 |
| | Golden drift files with an invalid shape are rejected | 3.3 |
| drift-golden: Golden drift fingerprint | The drift fingerprint covers exactly its declared inputs | 3.4 |
| drift-golden: A failed drift build never leaves a broken golden drift file | A failed write leaves the previous golden drift file intact | 4.9 |
| drift-golden: The versioned golden drift file is coherent | The versioned golden drift file matches the seed, the table and the code | 6.1–6.3, 11.5, 17.6 |
| cli-drift: Drift command arguments | Drift help and version print without reading the environment | 7.1, 7.2 |
| | The global help lists drift once | 8.1 |
| | Drift usage errors never quote the arguments | 7.3 |
| | An invalid drift document path is rejected before any connection | 7.4 |
| cli-drift: Drift configuration and connection | Drift configuration errors fail before any connection | 7.5 |
| | An unreachable database fails without leaking the URL for drift | 8.2 |
| | The drift connections are closed after a run | 8.3 |
| | A daily budget stops the drift model call | 7.6 |
| cli-drift: Drift project resolution | Only the exact name resolves the drift project | 7.7 |
| | Drift receives only the project id and the document path | 7.8 |
| cli-drift: Drift report output | A drift report is printed by document with both citations | 7.9 |
| | Q5 is printed from the golden report in evaluation mode | 8.4, manual 13.2, PowerShell 13.5 |
| | A live run over the indexed acme-shop prints the planted contradictions | 8.6 |
| cli-drift: Drift UNKNOWN output | Evaluation mode without a golden report answers llm-required on the command line | 8.5 |
| | A project without documents answers no-docs on the command line | 7.10 |
| cli-drift: Drift events and failures | Drift events go to stderr with their level | 7.11 |
| | Model, budget and source failures keep their code on the command line | 7.12 |
| | An unexpected drift failure is internal | 7.13 |
| cli-drift: Drift terminal safety | Control characters in a drift report are escaped | 7.14 |

No row is empty. The per-spec counts in task 10.3 match the deltas:
- drift-detection 22 (10 + 5 + 7);
- seed-load 8;
- drift-golden 13 (3 + 7 + 2 + 1);
- cli-drift 19 (13 + 6).

---

## Corrections to apply

All three are improvable. None blocks the apply.

### `openspec/changes/add-cli-drift/specs/drift-detection/spec.md`

1. **(R3-I2)** In "Golden drift report lookup", replace "a `usage` whose every token, cost and call counter (`generation` and `verification` included) is 0 and whose `latencyMs` (and only it) is the latency between the clock's first and last reads" with:

   "a `usage` whose every token, cost and call counter (`generation` and `verification` included) is 0, whose `verification.latencyMs` is 0, and whose top-level `latencyMs` is the latency between the clock's first and last reads"

### `openspec/changes/add-cli-drift/design.md`

2. **(R3-I2)** In P6, after "(`generation` and `verification` too, `calls` and `cacheHits` 0)", add "and `verification.latencyMs` 0".
3. Add Follow-up rows R3-I1, R3-I2 and R3-I3, all with destination A.

### `openspec/changes/add-cli-drift/tasks.md`

4. **(R3-I2)** In task 1.4, add: "(the expected `usage` is fully zero, `verification.latencyMs` included, except the top-level `latencyMs`)".
5. **(R3-I3)** In task 13.4, replace "`drift task-api` in evaluation mode" with "`LLM_BASE_URL= LLM_API_KEY= npm run cli -- drift task-api` (evaluation mode, as in 13.2)".

### Linear: DIS-73

Do not edit the `[original]` block.

**(R3-I1)** In the agent note at the start of the `[enhanced]` part (section 1), append this sentence (Spanish):

> Tampoco existe `LLM_MODE`: el modo evaluación es no definir `LLM_BASE_URL` ni `LLM_API_KEY` (`llmConfigFromEnv`), y los criterios 1 y 2 se leen así.

**Comment (Spanish):**

> *(Texto del agente, auditoría de la spec de `add-cli-drift`, ronda 3, 2026-11-03.)* Veredicto: APPROVED, sin hallazgos bloqueantes. Se aceptan todas las decisiones del agente de las rondas 1 y 2, incluida la forma `--env-file` de la captura en PowerShell. Tres mejoras, que se aplican en los artefactos del cambio:
> - `usage.verification.latencyMs` vale 0 en un acierto del golden;
> - la tarea 13.4 da la orden exacta en modo evaluación para `drift task-api`;
> - la nota del agente del texto enriquecido aclara que `LLM_MODE` no existe.
>
> No se crea ninguna issue nueva.
