## Context

See `proposal.md` → Why. Decisions D1–D14 were taken by the agent as lead engineer while enriching
DIS-73 (autonomous run, 2026-11-03; Spanish comment on DIS-73) and are carried here; P1–P10 were taken
while proposing. All of them, and every row of Follow-ups, are the agent's text.

What the change builds on, as it is today on `final-project-CRN`:

- The core `drift` (`packages/core/src/drift/drift.ts`, DIS-71) validates the request, answers
  `unknown` `llm-required` in `evaluation` mode before reading anything, reads the index state
  (`no-docs`), resolves the project, reads the clock (first read), extracts, confronts and verifies,
  and returns a report with `usage`; it writes nothing (its D7, D8, D10).
- `explain` (`packages/core/src/explain/explain.ts`) is the pattern for the cache lookup (after
  validation, before the `evaluation` branch, in both modes; an invalid entry is a miss without an
  event; `touchCacheEntry` on a hit) and for the `query_log` row (one per returned answer, one on a
  rejection after a resolved call, `.catch` so the row never masks the error, `query_not_logged`).
  `impact/query-log.ts` is the smaller template of a row builder and its `save…Row`.
- `ask` (`packages/cli/src/commands/ask.ts`) is the pattern of the command: test seams, `commander`
  with `exitOverride`, `defaultOpenStore`, `withDailyBudget` in `live` with `DAILY_BUDGET_USD`,
  `safeLines`, `excerptLines`, `toFailure`, exit codes 0/1/2.
- `npm run cache:build` (`packages/cli/src/cache-build.ts`, DIS-26/32) builds the `explain` golden
  answers: argument and configuration checks, seed and history checks, one rolled-back transaction per
  attempt, `MAX_ATTEMPTS = 3`, an unsafe-content check, an atomic write. Its contract
  (`golden-answers`) is shaped by question ids and normalized questions.
- `npm run db:seed` (`packages/cli/src/seed-load.ts`) reads `seeds/cache/*.json`, checks them before
  connecting and saves them through `saveCacheEntry` in the load's transaction.
- The answer cache table `cache_entry` has no capability column; `normalizeQuestion` replaces every
  punctuation and symbol with a space, so no `explain` key holds `:`.

## Goals / Non-Goals

**Goals:**

- One place decides a drift call's cache hit and writes its row: the core `drift`, so the row of a
  golden hit and the row of a live run (and the spend before a failure, which only the meter sees)
  come out the same way, as in `explain`.
- The command is a thin composition root: parse, check, resolve, compose, print.
- The golden drift report is reproducible (fingerprint, canonical render, rolled-back build) and
  refused when it holds the planted AWS key shape, the absolute path of the repository or of the build
  workspace, the value of `DATABASE_URL` or `LLM_BASE_URL`, or the API key.
- No change to `explain`, to `npm run cache:build` or to any fingerprint input of the `explain`
  golden answers or of the seed.

**Non-Goals:**

- See `proposal.md` → non-goals. At the design level also: no new port, store method, table,
  column or migration; no new LLM purpose.

## Decisions

### D1. The golden lookup lives in the core `drift` (enrich D1; reopens D8 of DIS-71 as its R8 allowed)

In `drift.ts`, after `parseDriftRequest` and the workspace-root check, the clock is read once
(`startedAt`, the first read; it is also the provenance instant and the start of the latency) and,
unless `useCache === false`, `store.findCacheEntry(projectId, driftCacheKey(docPath))` runs before the
`evaluation` branch, in both modes. `parseStoredDriftReport(entry.response)` (strict Zod,
`storedDriftReportSchema`, in the new `drift/drift-cache.ts`) decides: a valid report is a hit
(`touchCacheEntry(projectId, entry.id, startedAt)`, answer with `events: []`, zero usage, the latency,
`cacheHit: true`); anything else is a miss without an event. `driftCacheKey(undefined) = 'drift:'`,
`driftCacheKey(path) = 'drift:' + path` (the path as given: it is matched exactly, as `docPath` is).
`DriftRequest` gains `useCache: z.boolean().optional()` (`DRIFT_REQUEST_FIELDS` gains `useCache`);
`AnsweredDrift` gains `cacheHit: boolean`. `UnknownDrift` keeps no other field.

*Alternative rejected:* the lookup in the CLI (D8/R8 of DIS-71 as first written). The CLI would then
write the row of a hit while the core wrote the row of a live run, two writers of one table; and a
future HTTP route would have to repeat the lookup.

### D2. A live run never writes the cache (enrich D2, destination D)

Only `db:seed` writes a golden drift entry. A live report is recomputed on each call (D7 of DIS-71
stands). This keeps a scripted or poor live report from becoming the evaluation answer by accident.

### D3. The row is written by the core (enrich D3)

New `drift/query-log.ts`: `driftQueryLogEntry(...)` builds the `QueryLogEntry` (capability `drift`,
`question` = the cache key, totals from `usage` with the verification included, `baselineTokens:
null`, `verify*` from `usage.verification`, `verifyLatencyMs` its latency for a live report and `null`
otherwise, `cacheHit`) and `saveDriftRow(store, entry)` maps `QueryLogWriteFailed`,
`ProjectNotFound` and `InvalidStoreQuery` to the `QueryNotLoggedCode`s and rethrows anything else, as
`saveImpactRow`. `drift.ts` wraps the model with the meter before anything else and puts the whole
pipeline in a `try`: on a rejection with `meter.resolvedCalls() > 0` it sends the row of the resolved
calls (`meter.generation()`, `meter.verification()`, `meter.verifyCalls()`, `verifyLatencyMs: null`)
with `.catch(() => undefined)` and rethrows. The rejection row covers only a rejection of the pipeline
before the report is built; a failed row write of a returned report is never followed by a second row
(as `explain.ts:189-203`, where the row of a returned answer is written outside the `try`). A returned answered report gets
`{ type: 'query_not_logged', code }` appended last when the write was absorbed; an unknown report has
no `events` field (its shape is closed), so the code is dropped. `DriftEvent` gains the
`query_not_logged` member (the `QueryNotLoggedEvent` type of `explain-event.ts`, imported, not
edited).

*Alternative rejected:* the CLI writes the row (D10 of DIS-71). The CLI does not see the spend of the
calls that resolved before a failure.

### D4. The command (enrich D4)

`packages/cli/src/commands/drift.ts`, `runDriftCommand(argv, deps)` with the seams of `ask`
(`openStore`, `createLlm`, `source`, `drift`, `now`). `drift.ts` defines its own `defaultOpenStore`
with `application_name` `codemind-drift` (`DRIFT_APPLICATION_NAME`), as `impact.ts:90` has its own;
`ask.ts:138` hard-codes `codemind-ask`, so its `defaultOpenStore` is not reused and no shared helper is
extracted (the smallest change).
Order: parse (`commander`, `exitOverride`, fixed `USAGE` messages) → `parseDriftRequest({ projectId:
'', ...(doc !== undefined && { docPath: doc }) })` (exit 2) → `DATABASE_URL` → `llmConfigFromEnv` →
open store → resolve the name exactly → compose (`withDailyBudget` in `live` with a budget, a new
`createInMemoryVerificationCache()`, `workspaceRoot` = the repository root as in `ask`) → `drift` →
print → events to stderr → close. The text rendering reuses `safeLines` and `excerptLines` exported
by `ask.ts` and the `terminalSafeText` of `safe-json.ts`. `toFailure` of the drift command handles
`InvalidDriftRequest` (exit 2, `invalid drift request`, `{ field }`) and delegates every other error
to `toFailure` of `ask.ts`, which already maps `CliError`, `LlmConfigError`, `DatabaseUnavailable`,
`ProjectNotFound`, `SourceUnavailable`, `LlmUnavailable`, `BudgetExhausted` and `INTERNAL`.
`packages/cli/src/index.ts` dispatches `drift` and lists `drift <project>` in the global help.

### D5. The golden lives in its own file (enrich D5)

`seeds/drift/acme-shop.json`, format `drift-golden` → "Golden drift file format". Not an entry of
`seeds/cache/acme-shop.json`, as DIS-48 first wrote: that format only holds `explain` stored
responses, `golden-answers` requires that `seeds/cache/` holds no other golden file, and `verify`
reads every file there.

### D6. Generated by `npm run drift:build` (enrich D6, revised by P1)

See P1. Generated in this change with local Ollama (`qwen2.5-coder`, answering at enrich time).

### D7. `db:seed` loads `seeds/drift/*.json` (enrich D7)

Read and checked after `seeds/cache/*.json`, before connecting; saved after the golden answers in the
same transaction. A new seam `driftDir?` (default `<repoRoot>/seeds/drift`) next to `cacheDir?`.

### D8. A coherence test of the versioned golden (enrich D8)

`tests/unit/seed/drift-golden-coherence.spec.ts`: canonical render, the seed header fingerprints, the
current `driftFingerprint`, acme-shop's `indexed_commit`, every cited path a file row of acme-shop in
the seed, no `AKIA…`, the `Q5` row of `fixtures/README.md`, and `seeds/drift/` holding only
`acme-shop.json`. Unlike the `explain` golden coherence test, it checks fingerprint freshness, since
`verify` does not check this file (D9): a change to a fingerprint input then needs `npm run
drift:build` in the same change. The freshness check is criterion 5(c) of DIS-73, so it is kept
(audit run 1, B1, option a).

This diverges from the consequence of ADR `20261017-stale-fingerprint-fails-verify` that only the
`verify` job goes red for a stale fingerprint. The divergence is recorded in the ADR
`docs/adr/20261103-drift-golden-freshness-in-unit-suite.md` (task 15.5). From now on, a change to a
shared input (`explain/sanitize.ts`, `explain/untrusted-text.ts`, `verify/verify-prompt.ts`,
`verify/policy.ts`) or a `seed:build` also needs `npm run drift:build`; the regeneration recipe
becomes `seed:build`, then `cache:build`, then `drift:build`.

### D9. `verify` does not check the golden drift report (enrich D9, destination D)

D8 and the command's integration test cover it.

### D10. No blind panel review (enrich D10, destination D)

The run carries no `panel`; the entry ships with `reviews: []` and `fixtures/README.md` says so.

### D11. Out: `--json`, HTTP, web, corrections, case B (enrich D11, destination D)

### D12. Docs (enrich D12)

`readme.md` (lines about `drift` as planned), `docs/project-context.md` (core/drift reads the golden
and writes the row; the command; `drift:build`; the new tests), `fixtures/README.md` (Q5 row and the
golden paragraph), `docs/DEMO.md` (a `drift acme-shop` step in evaluation mode, captured by the agent
with `pwsh -NoProfile` and `powershell.exe -NoProfile`).

### D13. No migration (enrich D13, destination D)

`query_capability` holds `drift` since 0002; the golden is a `cache_entry` row.

### D14. One ADR: the freshness of the golden drift report is checked by the unit suite (amends `20261017`; revised in audit run 1, B1)

The enrich said "No ADR", since the change reuses the patterns of `explain`, `impact`, `ask` and
`cache:build`. The spec audit (run 1, B1) showed that D8 goes against a consequence of the accepted
ADR `20261017-stale-fingerprint-fails-verify`. The agent keeps D8 (it is criterion 5(c) of the ticket)
and records the exception in `docs/adr/20261103-drift-golden-freshness-in-unit-suite.md`, added to
`docs/adr/README.md` (task 15.5).

### P1. A separate `npm run drift:build`, not an extension of `cache:build` (propose; revises D6)

The ticket's D6 put the drift golden in `npm run cache:build` (`cache:build acme-shop Q5`). The
`cache:build` contract is built around `explain` questions: its arguments allow only golden question
ids (`details.allowed` = `["Q1","Q3","Q4"]`), its partial regeneration compares normalized questions
and the answer fingerprint, its final line counts golden answers, and `golden-answers` →
"Golden questions" says Q5 is not a golden question. Extending it would modify five requirements and
about ten scenarios of `golden-answers` and the tests that pin them. A separate command with no
arguments (`packages/cli/src/drift-build.ts`, script `drift:build` in `package.json`) reuses the same
steps through helpers moved without behaviour change from `cache-build.ts` to
`packages/cli/src/cache/build-support.ts` (the unsafe-content check takes the list of secrets instead
of the private `Plan`)
(`readBuildTimeout`, `missingConfig`, `staleSeed`, `isUnsafe`, `gitHead`, `defaultBuildHistory`,
`MAX_ATTEMPTS`, the retried LLM reasons), and states its contract by reference to `cache:build`'s.
This is the option that changes least of the existing behaviour (the lead-engineer rule of
`docs/AUTONOMOUS-RUN.md` §6). `npm run cache:build` and its tests are unchanged.

### P2. The golden drift definition lives with its file format (propose)

`DRIFT_GOLDEN = { project: 'acme-shop', id: 'Q5', key: 'drift:' }` is exported by
`packages/cli/src/cache/drift-golden-file.ts`, with `DRIFT_FINGERPRINT_FILES`, `driftFingerprint`,
`driftGoldenFileSchema`, `checkDriftGoldenFile`, `readDriftGoldenFile` and `renderDriftGoldenFile`.
`demo-questions.ts` (`GOLDEN_PROJECTS`) is not edited, so `golden-questions.spec.ts` is unchanged.
The canonical render reuses the render of `golden-file.ts` (JSON with two spaces, LF, final line feed)
and orders keys from the parsed value, as the `explain` golden does.

### P3. The daily ceiling variable is `DAILY_BUDGET_USD` (propose)

The `[enhanced]` text of DIS-73 says `LLM_DAILY_BUDGET_USD`; the variable `llmConfigFromEnv` reads is
`DAILY_BUDGET_USD` (`packages/adapters/llm/src/config.ts`). The spec and the code use the real name.

### P4. Retries of the drift build (propose)

An answered report with a `drift_doc_skipped` or `drift_claim_skipped` event of reason
`invalid-model-output` is retried (a small local model often breaks the JSON once); `timeout` and
`network` are retried as in `cache:build`; `unknown` (`no-docs`) and `unsafe-content` fail at once.
The number of contradictions is not checked (enrich D6): the build prints it, and the apply report
records which contradictions of case A the versioned golden holds.

### P5. Clock reads (propose)

The first clock read moves from after the project is resolved to right after validation (before the
lookup), so a hit, an unknown and a live report all measure their latency from the same instant and
the row of an unknown report has a latency. The first read is unconditional (also with
`useCache: false`). The provenance instant stays "the clock's first read".
The tests of `drift.spec.ts` that script the clock are adjusted (tasks step 9).

### P6. Zero usage of a golden hit (propose)

A hit's `usage` has every counter 0 (`generation` and `verification` too, `calls` and `cacheHits` 0, and `verification.latencyMs` 0)
and the call's `latencyMs`; the stored response keeps no usage, as `explain`'s stored responses.

### P7. Stored drift report schema (propose)

`storedDriftReportSchema` is strict on every level (unknown keys rejected), reuses
`driftProvenanceSchema` and `FILE_KINDS`, and bounds lines with `SPAN_LINE_MAX`; it is the only check
of a cache entry and of a golden file's `response`. It is exported from `@codemind/core` so the CLI
checks golden files with the same rule the core reads them with.

### P8. `db:seed` drift directory seam (propose)

`SeedLoadDeps.driftDir?`. The existing seed-load tests that point `cacheDir` at a temporary directory
and count acme-shop's `cache_entry` rows also set `driftDir` to a missing directory; they are named in
tasks step 9 and their assertions are not weakened.

### P9. Command output words (propose)

`<k> contradictions` and `<n> claims checked` are printed without plural agreement (`1 contradictions`),
a fixed template that tests can pin; the report is for a terminal, not prose.

### P10. Two scenario names of `drift-detection` are kept (propose)

A MODIFIED requirement must keep every scenario name of the main spec. "Evaluation mode answers
llm-required without reading anything" keeps its name and is now called with `useCache: false` (the
only path that reads nothing; its row is a write); the default path gets the new scenario
"Evaluation mode without a golden report answers llm-required without reading the project". "A drift
run writes nothing" keeps its name, and its THEN says it writes nothing but its query log row. The
existing tests keep their names (tasks 1.10, 2.9).

## Risks / Trade-offs

- [The local model produces a golden with few or no contradictions] → The DoD is that the golden is
  printed, not its content; P4 retries broken outputs; the apply report records the contradictions and
  `fixtures/README.md` says the golden is unreviewed (D10). If Ollama cannot produce an answered report
  in three attempts, `CACHE_BUILD_TIMEOUT_MS` is raised and the build re-run; the apply records it.
- [A live Ollama run takes tens of minutes to hours on CPU (3.5–9 min per answer, DIS-72 gotcha of
  `docs/project-context.md`), beyond the 10-minute limit of one tool call] → Tasks 6.2, 11.5 and 13.3
  run the command detached with its output to a log in the session scratch directory, poll the log in
  calls shorter than 10 minutes and record start, end and total. `drift:build` has a wall-clock
  ceiling of 3 hours per run (3 attempts at up to about 9 min per answer over 2 extractions, up to 24
  confrontations and their `verify` calls); past it with no file written the agent stops the run and
  applies the previous risk (raise `CACHE_BUILD_TIMEOUT_MS`, one more run); a second miss is a clean
  stop of the ticket.
- [The golden is generated before tasks that could edit its fingerprint inputs] → The final JSDoc of
  `drift-report.ts` and `drift-cache.ts` is written in tasks 1.5 and 2.2, task 9.1 excludes
  `DRIFT_FINGERPRINT_FILES`, and tasks 11.5 and 17.6 re-run `drift:build` and `db:seed` if any input
  changed after task 6.2.
- [A future change to a fingerprint input breaks the coherence test until `drift:build` runs] →
  Intended (D8): the golden would otherwise go stale silently. The test's failure message names the
  command.
- [The cache lookup now reads the store in `evaluation` mode] → One indexed read, as `explain` does;
  an unknown project now fails `ProjectNotFound` in evaluation mode instead of `llm-required`, which
  the CLI never reaches (it resolves the name first).
- [A `drift:` key shares the table with `explain` keys] → No collision (no `:` in an `explain` key);
  `invalidateCache` on re-index drops the golden drift entry too, the same as the `explain` golden
  answers, until the next `db:seed`.
- [`db:seed` now writes one more row per run] → Covered by the seed-load tests (P8); `verify` reads
  only `seeds/cache/`.

## Migration Plan

No migration. `npm run db:seed` after pulling loads the golden drift report. Rollback: revert the
change; a `drift:` entry left in a database is ignored by `explain` (no question normalizes to it).

## Follow-ups

All rows are the agent's text (autonomous run, 2026-11-03). No row has destination C.

| Id | Decision or finding | Destination |
|---|---|---|
| E1 | (D1) Golden lookup in the core `drift`, key `drift:` + `docPath`, before the `evaluation` branch; `useCache`, `cacheHit`; invalid entry is a miss without an event. Reopens D8 of DIS-71 (its R8). | A |
| E2 | (D2) A live run never writes the cache. | D — accepted |
| E3 | (D3) The core writes the `query_log` row (`drift/query-log.ts`); `query_not_logged` on answered reports. | A |
| E4 | (D4) `codemind drift <project> [--doc <path>]` in `packages/cli/src/commands/drift.ts`. | A |
| E5 | (D5) Golden in `seeds/drift/acme-shop.json`, its own format. | A |
| E6 | (D6, revised by P1) Golden generated by `npm run drift:build` with Ollama in this change. | A |
| E7 | (D7) `db:seed` loads `seeds/drift/*.json`. | A |
| E8 | (D8) Coherence test of the versioned golden, fingerprint freshness included. | A |
| E9 | (D9) `npm run verify` does not check the golden drift report. | D — accepted |
| E10 | (D10) No blind panel review; `reviews: []`. | D — accepted |
| E11 | (D11) `--json`, HTTP, web, corrections and case B out. | D — accepted |
| E12 | (D12) Docs: `readme.md`, `docs/project-context.md`, `fixtures/README.md`, `docs/DEMO.md` with the PowerShell captures done by the agent. | A |
| E13 | (D13) No migration. | D — accepted |
| E14 | (D14, revised in audit run 1) One ADR, `docs/adr/20261103-drift-golden-freshness-in-unit-suite.md`, amending `20261017-stale-fingerprint-fails-verify` for the golden drift report; recipe `seed:build` → `cache:build` → `drift:build` (task 15.5). | A |
| P1 | (P1) Separate `npm run drift:build`; `cache:build` and its tests unchanged; helpers moved to `cache/build-support.ts`. Deviation from the ticket's D6, recorded on DIS-73. | A |
| P2 | (P2) `DRIFT_GOLDEN` and the format in `cache/drift-golden-file.ts`; `demo-questions.ts` not edited. | A |
| P3 | (P3) The ceiling variable is `DAILY_BUDGET_USD`, not `LLM_DAILY_BUDGET_USD`. | A |
| P4 | (P4) The build retries `invalid-model-output` skips; no content check. | A |
| P5 | (P5) First clock read right after validation. | A |
| P6 | (P6) Zero usage on a golden hit. | A |
| P7 | (P7) Strict `storedDriftReportSchema`, exported. | A |
| P8 | (P8) `driftDir` seam of `db:seed`; seed-load tests set it. | A |
| P9 | (P9) Fixed output template without plural agreement. | D — accepted |
| P10 | (P10) Scenario names "Evaluation mode answers llm-required without reading anything" and "A drift run writes nothing" kept, their THEN updated; one new evaluation scenario. | A |
| B1 | (Spec audit run 1, question for the author, decided by the agent as lead engineer) Option (a): the unit coherence test keeps the fingerprint freshness check, because it is criterion 5(c) of DIS-73 ("`driftFingerprint` es el del código actual", "sus huellas de semilla son las de `seeds/graph-dump.sql`"); option (b) would drop an acceptance criterion. The exception to ADR `20261017` is recorded in a new ADR (D8, D14, task 15.5). | A |
| B2 | (Audit run 1) The clock's first read happens in every call, right after the request and workspace checks; the lookup follows unless `useCache: false` (spec "Golden drift report lookup", P5). | A |
| B3 | (Audit run 1) The rejection row covers only a pipeline rejection before the report is built, with all its fields stated; a failed row write of a returned report never leads to a second row; "Other row write errors propagate" asserts one `saveQueryLog` (D3). | A |
| B4 | (Audit run 1) The DoD scenario "Q5 is printed from the golden report in evaluation mode" runs over the harness transaction (`loadSeed` plus the versioned entry saved through the real store); the `db:seed` path is covered by seed-load and manual task 13.2 (task 8.4). | A |
| B5 | (Audit run 1) Fingerprint inputs are final before the golden is generated (tasks 1.5, 2.2, 9.1); tasks 11.5 and 17.6 re-run `drift:build` and `db:seed` if an input changed after task 6.2. | A |
| B6 | (Audit run 1) Live Ollama runs (tasks 6.2, 11.5, 13.3) run detached with a log in the session scratch directory, polled in calls under 10 minutes; `drift:build` has a 3-hour ceiling per run (Risks). | A |
| I1 | (Audit run 1) The `[enhanced]` text of DIS-73 gets an agent note saying P1–P3 supersede `cache:build acme-shop Q5`, `GOLDEN_DRIFT` and `LLM_DAILY_BUDGET_USD`; the `[original]` block is not edited. | A — done in Linear |
| I2 | (Audit run 1) The rejection-row scenario also covers `LlmUnavailable` reason `timeout` (task 2.5). | A |
| I3 | (Audit run 1) Cases added inside existing scenarios: `touchCacheEntry` failure (1.9), failed `drift:` save (5.3), stale fingerprints not checked by `db:seed` (5.3), `DATABASE_UNAVAILABLE` and no report text in build output (4.2, 4.10), terminal-safe event lines on stderr (7.11, 7.14). | A |
| I4 | (Audit run 1) Proposal and design wording aligned with the spec: what the build refuses, and the rows per call. | A |
| I5 | (Audit run 1) seed-load "Sample projects are loaded idempotently" added as MODIFIED (golden drift reports, entries replaced by key), both scenarios kept by name (task 5.3, counts of 10.3). | A |
| I6 | (Audit run 1) `drift.ts` has its own `defaultOpenStore` with `codemind-drift` (D4, task 7.2); the manual budget check of task 13.3 states its expected outcome (`LLM_CONFIG_INVALID` for an unpriced model, `BUDGET_EXHAUSTED` otherwise). | A |
| R2-B1 | (Spec audit run 2, decided by the agent as lead engineer) The PowerShell capture of task 13.5 forces evaluation mode with Node's `--env-file` flag pointing at a scratch file with empty `LLM_BASE_URL` and `LLM_API_KEY` (`npx tsx --env-file=<file> --import=./scripts/load-env.mjs --tsconfig packages/cli/tsconfig.run.json packages/cli/src/index.ts drift acme-shop`): Node sets the two keys to the empty string before the preload, `loadEnvFile` keeps a key that is already set (`scripts/env.mjs`, `Object.hasOwn`), and `llmConfigFromEnv` reads empty as unset; `DATABASE_URL` still comes from `.env`. Checked by the agent on Node v24.11.1 (probe printed `["","",true,"string"]`). The audit's `$env:LLM_BASE_URL=' '` form is rejected: `docs/AUTONOMOUS-RUN.md` §6 forbids setting `$env:` variables (the auto-mode classifier denies them). `.env` is not edited. `docs/DEMO.md` (task 15.3) gives the plain `npm run cli -- drift acme-shop` for a `.env` copied from `.env.example` and this form for a `.env` that configures a model. | A |
| R2-I1 | (Audit run 2) Mutation of task 11.4 covers the whole `packages/core/src/drift/` directory, as the ticket's non-functional line asks, split into runs under the 10-minute call limit. | A |
| R2-I2 | (Audit run 2) cli-drift "A daily budget stops the drift model call" states that the index state holds `docs/pricing.md` and a source double serves it, so the real use case reaches the model call. | A |
| R2-I3 | (Audit run 2) A golden hit whose row write is absorbed answers with `events` exactly the `query_not_logged` event (spec "Golden drift report lookup", case in "A failed row write still answers and says so", task 2.7). | A |
| R2-I4 | (Audit run 2) In `drift:build` the unsafe-content check is applied before the retry rule (drift-golden "Retries and failures of a golden drift report"). | A |
| R2-I5 | (Audit run 2) P1 and proposal Impact say the helpers move without behaviour change and the unsafe-content check takes the list of secrets instead of `Plan`. | A |
| R2-I6 | (Audit run 2) "Unknown drift answers" wording covers `useCache: false`, when no lookup is made. | A |
| R2-I7 | (Audit run 2) Task 13.5 writes the step's command text in `docs/DEMO.md` first; task 15.3 adds the captured output and prose. | A |
| R2-I8 | (Audit run 2) The error line keeps the `details.path` of `SourceUnavailable` as `ask` gives it (a stored path, terminal-safe); only the message never holds the document path given; new throw in "Model, budget and source failures keep their code on the command line" (task 7.12). | A |
| R2-I9 | (Audit run 2) `storedDriftReportSchema` requires at least one evidence per contradiction (task 1.6). | A |
| R2-I10 | (Audit run 2) Task 8.5 runs over the harness transaction, as task 8.4. | A |
| R3-I1 | (Audit run 3) The agent note of the `[enhanced]` text of DIS-73 says `LLM_MODE` does not exist: evaluation mode is not defining `LLM_BASE_URL` nor `LLM_API_KEY`. | A — done in Linear |
| R3-I2 | (Audit run 3) `usage.verification.latencyMs` is 0 on a golden hit; only the top-level `latencyMs` is measured (spec "Golden drift report lookup", P6, task 1.4). | A |
| R3-I3 | (Audit run 3) Task 13.4 gives the exact evaluation-mode command for `drift task-api`. | A |
| R8-in | Inbound from DIS-71 (`add-drift-detection` Follow-ups E10 and R8): CLI, golden Q5, row, `withDailyBudget`, `readme.md`. Closed by E1, E3–E8, E12. | A |
