CHANGES REQUIRED

# Spec audit: integration-test-races (DIS-110)

## Run 1

Audited: `openspec/changes/integration-test-races/` (proposal.md, design.md, tasks.md, .openspec.yaml, reports/2026-10-30-0-reproduction.md). Ticket: DIS-110 loaded from Linear (Done, no parent, `parentId: null`), with its comments. The 2026-10-30 10:00 comment lists F1–F3 exactly as the change takes them. The scope reference is the author instruction quoted by the caller. The ticket does not describe this follow-up.

**Questions for the author**

- Q1 (F3, claims-refresh). The change says the `claims-refresh.spec.ts` timeout comes from RC3 alone and needs no edit. On a clean database the same lock wait can still happen (see B1). Options: (a) accept the race and record it in Carreras conocidas (minimal, keeps the file out of scope); (b) remove it by making the evidence insert fail without DDL (edits `claims-refresh.spec.ts`, currently a non-goal). Which do you want?
- Q2 (F6, merge). Task 9.8 has the agent merge, citing an author request made "during the run". The instruction quoted to me does not include that request. Autonomous mode allows it (`docs/AUTONOMOUS-RUN.md` §2, §5), but please confirm the request was really made. If it was not, 9.8 must leave the PR to you.

### 1. Scope against the ticket

- Clean for F1, F2 and F3.
- F5 growth is justified: `query-cost`, `projects-command`, `ask`, `reindex` and `ask-command` each have an observed failure in the reproduction report, except one.
- Improvable — `claimCount()` scoping (design D3, task 3.2) was not observed failing. Two SQL lines with the same cause; keep it, but the proposal should say it is preventive.
- The `docs/project-context.md` edit (task 8.2) is justified: lines 439–441 repeat Carreras conocidas.
- No production code is touched (Non-goals; `git diff --stat` guards in 4.1 and 5.4).

### 2. Inherited acceptance criteria (the author's instruction)

| Instruction item | Covered by |
|---|---|
| F1: scope the three `projectCount()` assertions; remove `projectCount()` | D1, 1.1, 1.2 |
| F2: fix the comment at about line 105 | D1, 1.2 (see I3) |
| F3: real cause; fix in tests only; no timeout raised unless justified | RC1–RC4, D4; Non-goals. **Incomplete for claims-refresh (B1)** |
| Record every race not removed in Carreras conocidas | D4, 8.1. **Missing the claims-refresh residual (B1)** |
| Minimal change; `skip_specs` only if no scenario is affected | Correct |
| Pass rule fixed before the runs | D5, 5.2. **No termination (B3)** |
| ≥5 store runs + ≥3 full parallel runs, all green | 5.2 |
| tasks.md names every existing test file changed | 1.1–3.2, 4.1. **Comment edits missing (B2)** |

### 3. Missing scenarios

Not applicable (`skip_specs: true`). Each changed test still implements its main-spec scenario: graph-store "Daily cost sum" (spec.md:650–671), llm-adapter "The ceiling survives a restart" (:547), cli-projects "Project listing" (:39, :53), graph-store "Running work in one transaction on a pooled store" (:1214–1235). D1's scoped check matches "it is deleted afterwards to restore the database" better than the global count did.

### 4. Ambiguity

- Improvable — D3, last paragraph: "they lock only projects that other files commit for a moment" is wrong; the lock lasts until the deleting test's transaction rolls back.

### 5. Open decisions

- **B2 (blocking)** — stale file comments after D3: `api/ask.spec.ts:24`, `api/reindex.spec.ts:27`, `cli/ask-command.spec.ts:26` ("every project is deleted"). No task updates them.
- **B3 (blocking)** — the pass rule has no termination and no restart scope: (a) which series restarts; (b) no cap on correct-and-restart cycles; (c) "or of the same root causes" lets the run edit non-goal files mid-run.
- Improvable — D2: "reads the cost sum on the store's own connections" switches to `REPEATABLE READ` without a retry, adding a 40001 failure mode; add the retry.
- Improvable — I3: line 104 of the block is the spec reference and must stay; say "line 105 only".
- Improvable — 5.3: "The pass rule of 5.2 applies" is unclear (one run or three).

### 6. Contradictions inside the change

- **B1 (blocking)** — RC3 attributes the claims-refresh timeout entirely to the committed sample, F3 says no edit is needed, and D4's "remains" leaves it out. But its `CREATE TRIGGER … ON evidence` (`claims-refresh.spec.ts:115–126`, `lock_timeout = '10s'`) conflicts with `ROW EXCLUSIVE` on `evidence`, which on a clean database is still held by harness tests that write evidence (`api/ask`, `cli/ask-command`, `claims-write`, `explain`, seed-load's `addHistoryRows`) and by unscoped `DELETE FROM project` cascading over a committed project with files; `explain.spec.ts:310–314` raised its own bound to 60 s for the same lock. Not reproduced in 17 runs: RC3 is a hypothesis, not shown to be the only cause.

### 7. Contradictions with the project

- `test-db-isolation` untouched; `skip_specs: true` holds. `docs/TESTING.md:31–32` already forbids a seeded test database. Dropping the seed-load entry is correct (`seed-load.spec.ts:131–139` scopes its snapshot). Agent merge is relaxed for autonomous runs (`docs/AUTONOMOUS-RUN.md` §2); only Q2 remains. Base branch matches.
- Improvable — `docs/project-context.md` → "prompts.md — synchronous AI log" (:637) is not mentioned in tasks 8.x.

### 8. Contrast with the real code

The design's claims hold (graph-read retry pattern :212–233; `loadSeed` :51–61; `seeded()`/`claimCount()` lines; `projectCount` callers; the 0.0165 of `query-log-write.spec.ts:48`).

- Improvable — `query-log-write.spec.ts:160` (`sumCostSince(startOfUtcDay())` against `before + 0.0165`) is the RC1 pattern and is not listed.
- Duplication of the retry loop is routed to F4 (C). Acceptable.

### 9. Task size

- Improvable — 5.2: state one tool call per run with a timeout ≥ 420 000 ms.

### 10. Mandatory steps

Clean.

### 11. Traceability

Every changed test maps to tasks 1.1–3.2; holes: file comments (B2), claims-refresh residual (B1), pass-rule termination (B3).

### Corrections to apply

- design.md: RC3 claims-refresh bullet extended (conflict remains on a clean database; not reproduced); D3 file-comment bullet; D3 last paragraph reworded; D4 "remains" adds claims-refresh and `query-log-write.spec.ts:160`; D5 (both series restart; at most two cycles; fixes limited to the six files); D2 retry for the own-connections test; D1 "line 105 (line 104 stays)"; Follow-ups F3 reworded, rows for Q1 and Q2.
- tasks.md: 1.2, 2.1, 3.1, 5.2, 5.3, 8.1 as above; new 8.3 (`prompts.md`).
- proposal.md: D3 bullet mentions the comments; `claimCount()` marked preventive; Non-goals mention claims-refresh.
- Linear DIS-110 (stays Done): the closing comment says the claims-refresh timeout is explained, not reproduced, and stays in Carreras conocidas, and mentions the cap on stability restarts.

### Resolution of run 1 (agent, lead engineer)

| Finding | Resolution |
|---|---|
| Q1 | Decided by the agent: option (a). `claims-refresh.spec.ts` stays out of scope; its lock conflict goes to Carreras conocidas (design F3, Q1 row; proposal Non-goals; task 8.1). |
| Q2 | Confirmed: the author wrote in this session during the run asking the agent to take care of everything and merge so the next batch can start (design F6). |
| B1 | Fixed: RC3 bullet extended, D4 "remains" entry, F3 reworded, task 8.1. |
| B2 | Fixed: D3 file-comment bullet; task 3.1; proposal. |
| B3 | Fixed: D5 and task 5.2 (both series restart; at most two cycles then clean stop; fixes only in the six files). |
| D3 wording (§4) | Fixed. |
| D2 retry (§5) | Fixed: the own-connections test retries on `40001` (design D2, task 2.1). |
| I3 | Fixed: D1 and task 1.2 say line 105 only. |
| 5.3 | Fixed. |
| `prompts.md` (§7) | Fixed: task 8.3. |
| `query-log-write.spec.ts:160` (§8) | Fixed: listed in RC1 as not observed and in D4 "remains". |
| 5.2 timeout (§9) | Fixed: D5 and task 5.2. |
| `claimCount()` preventive (§1) | Fixed: proposal and RC1 say so. |
| Linear comment | Will be applied in task 9.8. |

## Run 2

CHANGES REQUIRED

Audited from scratch (proposal, design, tasks, `.openspec.yaml`, the reproduction report and run 1). DIS-110 loaded from Linear (Done, no parent). No blocking question for the author: Q1 was decided by the agent as `docs/AUTONOMOUS-RUN.md` §2 allows.

Findings:

- §1 Scope: clean. F5 growth justified by observed failures; `claimCount()` labelled preventive; no production code (the production `FOR SHARE` read in one deadlock cycle is correct behaviour, the cycle is closed by the tests' unscoped writes); D4 is an environment action consistent with `docs/TESTING.md:30-32`.
- §2 I1 (improvable): claims-refresh is not removed by decision, not because it cannot be removed; say so, and keep option (b) visible to the author (C).
- §3 Missing scenarios: clean; every changed test keeps its scenario's data and expected values; D1 matches "no project with that name exists afterwards" more exactly.
- §4 Ambiguity: clean.
- §5 **B1 (blocking)**: an outcome of 5.2 other than PASS does not stop tasks 9.x; 9.8 could merge with failed local stability evidence because CI runs the suite once. Any non-PASS outcome must be a clean stop before the reviews, archive and merge, and 9.8 must require 5.2 and 5.3 as PASS. I2 (improvable): state that every per-attempt value is created inside `work`. I3 (improvable): projects-command drops `useTransactionPerTest()` definitely.
- §6 Improvable: proposal → Impact must name `docs/project-context.md` definitely.
- §7 Improvable: `explain.spec.ts:310-312` documents the same `CREATE TRIGGER` conflict (60 s bound); name both in Carreras conocidas.
- §8 Code contrast: D1, D2, D3, RC3 and the claims-refresh analysis hold against the code; D3 changes no result of the ask/reindex/ask-command assertions (all per-project counts; budget tests at 2031 instants; no `DAILY_BUDGET_USD`). I5 (improvable): RC4 should name every file that loads the seed, including `cli/verify.spec.ts`.
- §9–§11: clean except the B1 rows (pass-rule gating of 9.x and of the merge).

Corrections to apply (summary): D5 and 5.2 clean stop on any non-PASS outcome, 9.8 gated on 5.2 and 5.3 PASS; D2 per-attempt values inside `work` (2.1, 2.2); D2 and 2.2 drop `useTransactionPerTest()` in projects-command; D4 "remains" adds `explain.spec.ts` and the full list of seed loaders; Q1 row says "not removed by decision", destination C for option (b); 8.1 mirrors these; proposal Impact and Non-goals wording; the Linear comment states the 5.2 result, the claims-refresh status with option (b) pending, the removed committed sample and F4.

### Resolution of run 2

| Finding | Resolution |
|---|---|
| B1 | Fixed: D5 and 5.2 (any non-PASS outcome is a clean stop, 9.3–9.8 not run); 9.8 requires 5.2 and 5.3 as PASS. |
| I1 | Fixed: Q1 row ("not removed by decision"; C for option (b)), proposal Non-goals, task 8.1. |
| I2 | Fixed: D2, tasks 2.1 and 2.2. |
| I3 | Fixed: D2 and task 2.2 (projects-command drops `useTransactionPerTest()`). |
| §6 Impact | Fixed: proposal Impact. |
| §7 explain.spec | Fixed: D4 "remains", task 8.1. |
| I5 | Fixed: D4 lists every seed loader, including `cli/verify.spec.ts`; task 8.1. |
| Linear comment | Will be applied in task 9.8 (or at the clean stop) with the four points listed. |

## Run 3

APPROVED

Audited from scratch (proposal, design, tasks, `.openspec.yaml`, reproduction report, runs 1–2). DIS-110 loaded from Linear (Done, no parent). Every blocking finding of runs 1 and 2 is reflected in the artifacts; no regression.

- Question for the author, not blocking (QA1): claims-refresh's remaining `CREATE TRIGGER` lock conflict is kept "not removed by decision" (option a); option (b) would remove it with a test-only edit. The apply is unambiguous either way: under D5 a claims-refresh failure in the stability runs is a clean stop with no merge.
- §1, §3, §4, §7, §9, §10: clean. §11: no empty row.
- Improvable: I2 (RC3's graph-read attribution is an inference: the previous change recorded no error line); I3 (a test-file edit after 5.2 passed must re-run 5.2 and 5.3 before 9.8); I4 (every run executed counts; a failing run beyond the minimum stops the series); I5 (proposal must mention the retry of the own-connections cost test); I6 (a local `names` constant shared by `loadSeed` and the scoped `DELETE`).
- Linear comment: also state the graph-read inference and that option (b) is pending the author.

### Resolution of run 3

| Finding | Resolution |
|---|---|
| QA1 | Kept as decided (design Q1: A by the agent, C for option b); listed for the author in the DIS-110 comment and the final report. |
| I2 | Fixed: design RC3. |
| I3 | Fixed: design D5, task 9.6. |
| I4 | Fixed: design D5, task 5.2. |
| I5 | Fixed: proposal. |
| I6 | Fixed: design D3, task 3.1. |
| Linear comment | Applied at task 9.8. |

## Run 4 (after correction cycles D2a and D2b of the stability runs)

APPROVED

Audited the artifacts and the working-tree helpers against `graph-read.spec.ts:212-241`, `projects-command.spec.ts`, `query-cost.spec.ts` and `vitest.config.ts:38-39`. DIS-110 unchanged in Linear.

- Focus question: extending D5's fix scope to `graph-read.spec.ts` is a recorded change, not a widening. The pass criterion, run counts, restart rule and cycle cap are unchanged; only where a fix may land changed. The file is the author's explicit F3 target, and the six-file limit was the agent's own, tighter than the instruction. The reason was recorded (D2b) and the artifacts were updated before the code (§7). Run 1's B3(c) concern (unbounded edits of non-goal files) does not return: one named file, cap unchanged.
- The D2b fix matches the code: `SET LOCAL lock_timeout` takes no snapshot, so the snapshot is still taken by the `DELETE`.
- Questions for the author (not blocking): QA1 (claims-refresh option b) still pending; QA2: confirm or reject the D2b amendment of the fix scope (rejecting it makes the step a clean stop with no merge).
- Improvable: I1 (the 10 s window against the 20 s `testTimeout`: write the trade-off down); I2a–g (proposal What Changes/Impact/Non-goals, design D2 and Risks, tasks 2.1/2.2 still describe the three-attempt policy; D2b over-claims "first recorded error line of F3's failure"); I3 (D5 "not widened" next to the amendment; tasks 4.1/5.2 say "six"); I4a ("step 3 report" in D4/D5); I4b (task 5.6 must record both cycles, the amendment and the diagnostic run).
- Linear comment: mention both correction cycles and the D2b amendment, and that the graph-read failure now has a recorded error line.

### Resolution of run 4

| Finding | Resolution |
|---|---|
| QA1, QA2 | For the author: listed in the DIS-110 comment and the final report. |
| I1 | Fixed: D2a trade-off bullet; task 8.1. |
| I2a–c | Fixed: proposal What Changes, new graph-read bullet, Impact, Non-goals. |
| I2d–e | Fixed: design D2 (superseded note), Risks. |
| I2f | Fixed: tasks 2.1 and 2.2 ("retry policy superseded by 2.3"). |
| I2g | Fixed: D2b wording. |
| I3 | Fixed: D5 ("not widened further…"), tasks 4.1 (seven) and 5.2. |
| I4a | Fixed: "step 5 report". |
| I4b | Fixed: task 5.6. |
| Linear comment | Applied at task 9.8. |

## Run 5 (second phase: RC5, D7–D10, delta spec)

CHANGES REQUIRED

Audited proposal, design (Second phase), tasks, the `test-db-isolation` delta, runs 1–4 and the step 5 report, against `postgres-store.ts` (`atomically`, `runQuery`, `saveQueryLog`, `saveCacheEntry`), `claims.ts`, `queries.ts`, the five trigger tests, `helpers/db.ts`, `vitest.config.ts`, `vitest.stryker.config.ts`, `ci.yml` and Vitest 4.1's globalSetup code. DIS-110 loaded (Done, no parent). No blocking question for the author.

- Focus: `rejectingWrites` still proves the five scenarios (P0001 raised at the same point inside `atomically`'s savepoint; the earlier statements of `writeClaims`/`rewriteClaim` still run before the rejected insert, so the rollback is still proven; explain rejects only `evidence`, so its exact events hold). The run's own commits cannot trip the guard (globalSetup runs before the pool). No production code changes; all 12 changed test files are named.
- **B1 (blocking):** D10 points at "tasks 10–12", which do not exist (task 5.8 says 4.1/4.3).
- **B2 (blocking):** D10 does not say what to do with projects left committed between series (both first-phase failures left one), nor whether a run refused by the start-up check counts.
- **B3 (blocking):** where `global-setup.ts` takes `DATABASE_URL` is not fixed; importing `helpers/db.ts` would throw in the CI `mutation` job (CI set, no URL; Stryker inherits the config).
- Improvable: missing scenarios (no lock / no object; non-matching insert passes; snapshot settings; URL unset); D7 types, insert regex, fixed dollar tag, array-aware `when`, explain's second store, `withThrowawayMigrated` alternative; D9 error propagation and once-per-project wording; stale text (D6 heading, D5/F6 merge, task 9.6 → D10, D4 check); D10 to mention 5.3–5.5; the historical clause of "Existing store test helpers keep their API"; unit-only runs checked too; task order 4.2/4.3 and 8.3/8.4.

### Resolution of run 5

| Finding | Resolution |
|---|---|
| B1 | Fixed: D10 "tasks 4.1 or 4.3 (the second-phase files of tasks 3.3–3.7)". |
| B2 | Fixed: D10 and task 5.8 (count 0 before run 1 and after any failed run, leftovers recorded and deleted; a refused run counts as failed). |
| B3 | Fixed: D9 and task 3.7 (`global-setup.ts` reads `process.env.DATABASE_URL`, imports nothing that imports `helpers/db.ts`, does nothing when unset); proposal. |
| Missing scenarios | Fixed in the delta (Req 1 "No database configured"; Req 2 settings; Req 3 no lock / no object, non-matching insert); task 3.5. |
| D7 details | Fixed: types, regex, `$rejected$`, `valuesInclude`, explain's second store, `withThrowawayMigrated` alternative; task 3.6. |
| D9 details | Fixed: error propagation, URL never in the message, once per registered project, unit-only runs; task 8.4. |
| Stale text | Fixed: D6 heading, D5/F6 "(superseded by L4)", task 9.6 → D10, D4 check. |
| D10 5.3–5.5 | Fixed. |
| Historical clause | Recorded in D9 as historical; not modified. |
| Task order | Fixed (4.2/4.3, 8.3/8.4). |

## Run 6

APPROVED

Audited the whole change again (proposal, design with its Second phase, tasks, delta, runs 1–5, step 5 report) against the store code, the five trigger tests, `helpers/db.ts`, `vitest.config.ts`, `vitest.stryker.config.ts`, `ci.yml`, Vitest 4.1's `initializeGlobalSetup` and the main specs. DIS-110 loaded (Done, no parent). Run 5's B1–B3 are fixed; nothing makes the apply wrong or ambiguous.

- Questions for the author, not blocking: QA1, the start-up check also refuses a unit-only run when `DATABASE_URL` points at a database with committed projects (recorded in D9); QA2, the D2b amendment, accepted by the lead (L1).
- Improvable: missing scenarios (retryable error after the window; connection closed; how "no database configured" is observed); I1 client type of `inOwnSnapshot`; I2 shape of `global-setup.ts`; I3 throwaway databases dropped; I4 the `$do$` tag in the quote guard; I5 scope the `pg_trigger`/`pg_proc` checks; I6 D2's "left as a follow-up" superseded by D8; I7 an invalid URL's Node error carries the input; I8 Req 1's "integration run" wording; I9 `helpers/db.ts`'s "only place that reads it" comment; I10 the `mutation` job's cache keys hash `vitest.config.ts` (full Stryker pass expected).

### Resolution of run 6

| Finding | Resolution |
|---|---|
| QA1, QA2 | For the author: DIS-110 comment and the final report. |
| Missing scenarios | Fixed in the delta (window scenario, connection closed, "resolves without querying any database"); tasks 3.3, 3.7. |
| I1, I2, I3 | Fixed: D8 signature; D9 `setup()`; tasks 3.3, 3.7. |
| I4, I5 | Fixed: D7, delta Req 3, task 3.5. |
| I6 | Fixed: D2 "(superseded by D8…)". |
| I7 | Fixed: D9 (errors without SQLSTATE rethrown as a generic error without the URL). |
| I8, I9 | Fixed: delta Req 1 wording and "not an availability gate"; D9, tasks 3.7 and 4.3, proposal Impact (`db.ts` comment only). |
| I10 | Fixed: design Risks, task 9.2. |
