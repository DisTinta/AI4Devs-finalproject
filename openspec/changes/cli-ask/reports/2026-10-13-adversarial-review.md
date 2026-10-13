# Adversarial review — cli-ask (DIS-40)

**Change:** `cli-ask` (DIS-40) · **PR:** #38 · **Branch:** `feature/DIS-40-cli-ask` · **Date:** 2026-10-13

Run by the `/adversarial-review` skill (forked, read-only), after `/show-spec-working` and
`/verify-against-spec`. Diffed against the branch base `14df42a`, not `main` (which pulls in 618
unrelated files).

## Findings

| Severity | File:line | Finding | Why it matters |
|---|---|---|---|
| Major | `packages/cli/src/commands/ask.ts:328-334` | `commander`'s default short flags are still on, so `ask -h`, `ask -V` and `ask acme q -h` exit `0` with help or version. Checked against the installed `commander`: the codes are `commander.helpDisplayed` and `commander.version`. The spec allows "no options besides `--help` and `--version`" and says an unknown option SHALL fail with `USAGE`, exit `2`. No test covers `-h` or `-V`. | The shipped behaviour contradicts a SHALL. verify-against-spec raised it as "Unspecified behaviour 1". |
| Major | `ask.ts:121-135`; `tests/integration/cli/ask-command.spec.ts:106-107`, `:127-145` | No automated test runs the real composition: `defaultOpenStore`, then `createPostgresStore({ pool })`, then `explain`, then the claim write. Every test that reaches `explain` injects `createPostgresStore({ transaction: db() })`. The two tests that use the default pool stop before `explain`. The SHALL "each write committing on its own (no transaction held open while the model answers)" is backed only by the manual show-spec-working run. The step 11 report lists `defaultOpenStore` as 10 no-coverage mutants. | This is the production path. If someone later wraps the run in `BEGIN … COMMIT`, or passes `{ transaction }`, no test would fail. |
| Minor | `tests/integration/cli/ask-command.spec.ts:139-145`, `ask.ts:125` | "The connections are closed after a run" only checks that 0 `codemind-ask` sessions are left. It never checks that any session ever carried that name. Deleting `application_name: ASK_APPLICATION_NAME` keeps it green, and then a leaking `close` would pass too. A `DATABASE_URL` carrying `?application_name=` overrides the option (pg gives the connection string precedence; design D3) and would also make it pass vacuously. | The test can pass without checking anything. Fix: call `defaultOpenStore(databaseUrl)` directly, assert ≥ 1 `codemind-ask` session before `close()` and 0 after. |
| Minor | `tests/integration/cli/ask-command.spec.ts:181-184` | "A typed answer is printed with its evidence and stored" checks only that the first evidence line starts with 4 spaces, and only that the heuristic span's header exists. Dropping the heuristic span's excerpt, or printing the wrong excerpt, survives. Also raised by verify-against-spec. | The scenario requires "each cited span's excerpt". |
| Minor | `ask.ts:91`; `tests/unit/cli/ask-command.spec.ts:258` | `withDailyBudget(model, { store, dailyBudgetUsd })` doesn't receive `deps.now`: the budget runs on the system clock while `explain` uses the injected one, so the unit test can only assert `typeof resetsAt === 'string'`. Separately, the ceiling can't trip in real use until DIS-74 writes `query_log.cost_usd`; nothing writes `query_log` today (grepped `packages/`). Already documented in `docs/project-context.md:407` and `readme.md`. | The injected clock doesn't reach the budget, so `resetsAt` can't be pinned in tests. One-line fix. |
| Minor | `ask.ts:236-238`; `tests/unit/cli/ask-command.spec.ts:393`, `:448` | `spanOf` escapes a path as one literal: no line split, no tab expansion. The spec lists paths among the texts that are split and tab-expanded. No `ask` test sends a bidi character (U+202E), C1 (U+009B) or U+2028 through `formatAnswer`; only ESC is tested. | Spec and code disagree on paths. Removing the bidi range from `TERMINAL_UNSAFE` would survive the `ask` suite. |
| Minor | `ask.ts:170-171`, `:251`, `:231-233`, `:146` | Behaviour the spec doesn't describe, locked in by tests (U:613, U:638): an empty `evidence:` line is dropped and unknown ids are skipped; inner empty lines of statements and excerpts are not indented; `formatUnknown` prints `message` for any reason, not only `llm-required`. | The spec has to say so, or the code has to change. |
| Minor | `packages/cli/src/index.ts:15-16` | Handing `ask` to `runAskCommand` has no automated test (manual task 8.2 only). | A regression in the entry point would go unnoticed. |
| Question | `openspec/changes/cli-ask/specs/cli-ask/spec.md` (commit `c475481`) | The spec was first committed 1 s after the code commit `bd34675`, and `.claude/sdd-harness.env` has had `KIT_PROTECT_SPECS="0"` in the working tree the whole time (uncommitted). Git history can't show that the spec wasn't edited after the code. The open mismatches (paths, `-h`/`-V`) suggest it wasn't retrofitted. | Spec history can't be audited. Set `KIT_PROTECT_SPECS` back to `"1"` before archiving. |
| Minor (process) | `openspec/changes/cli-ask/tasks.md:28-29`, `:34`, `:49-51`, `:56-59`, `:98`, `:109` | Tasks marked "RED → GREEN" whose RED was never seen: 3.4–3.5, 4.1, 6.x and 7.x, as the step 11 report admits. 15.1 is unchecked while 16.1 is checked and the PR is open. 13.2 (CI run link) is still pending. | The evidence doesn't match the checkboxes. Process debt, not a Linear issue. |

## What was checked and found clean

- **Question length:** zod 4.6.5 counts code points. 1,000 × `😀` passes and 1,001 is rejected (run).
- **Check order:** the question is checked before the config, and the config before `openStore`. Swapping either is caught by U:161 and U:179.
- **Malformed `DATABASE_URL`:** `not a url`, `postgres://u:p@[bad/db` and port 99999 all reject inside `pool.connect()`, so they become `DATABASE_UNAVAILABLE` and the driver text is dropped (run against `pg`).
- **Odd arguments:** an empty project name, a project id used as the name, and a question after `--` are all handled.
- **Same request twice / two requests at once:** claim and evidence writes in pool mode are atomic, one transaction per write (`postgres-store.ts:81-97`). Asking twice only adds prior claims.
- **Events:** explain events carry no `level` key that could override `info` (`explain-event.ts`, `schema-violation.ts`).
- **Error messages:** `toFailure` never reuses a foreign error message.
- **Leaks:** no API key, URL or question reaches stdout or stderr.

## Blast radius

- `compose-index.ts` only gains an `export`.
- The global `ask` stub, which printed "not implemented" and exited `0`, is replaced. The spec covers this.
- No migration, and no existing test was modified (the diff adds 2 new test files only).
- The gitleaks allowlist matches the exact sentinel value only.

## Mutation check

"Control characters are escaped line by line" (U:448) catches three hand-applied mutants:
- `safeLine` returning the line unescaped (stdout keeps U+001B);
- escaping the whole answer at once instead of line by line (`lines[0] === 'Primer párrafo.'` fails);
- `safeLine` called before splitting (the clean excerpt lines would come out quoted).

## Verdict

**PASS WITH GAPS.** No Blocker. The two Majors and the Minors must be fixed in this change or
tracked before archiving.

## Recommended next steps before archiving

1. `-h`/`-V` (Major) — A. Either update the spec to allow them, or turn them off with `.helpOption('--help')` and `.version(CLI_VERSION, '--version')`; either way, a test with `-h`, `-V` and `-x` (the last must give `USAGE`).
2. Pool path untested (Major) — A, or C if deferred: one integration test through the default `openStore` on the real `DATABASE_URL`, whose scripted model queries `pg_stat_activity` for `codemind-ask` sessions `idle in transaction` and asserts 0; clean up the rows afterwards.
3. Vacuous connections test — A: ≥ 1 `codemind-ask` session before `close()`, 0 after.
4. Weak typed-answer test — A: assert each cited span's first excerpt line.
5. Budget clock — A: pass `now: deps.now` to `withDailyBudget` and pin `resetsAt`.
6. Unspecified behaviours (paths, empty lines, `formatUnknown`) — A: bring the spec in line with the code, plus a `formatAnswer` test with U+202E, U+009B and U+2028.
7. `index.ts` hand-off — C or D; record the choice in `design.md` → Follow-ups.
8. Process: `KIT_PROTECT_SPECS` back to `"1"`; reconcile 15.1/16.1; link the CI run (13.2); record "RED not observed for 3.4–3.5, 4.1, 6.x, 7.x" as process debt in the step 11 report.
9. Re-run what the fixes invalidate (`cli/` unit and integration suites, Stryker on `ask.ts`), add an addendum here, and give every finding its A/B/C/D line in `design.md` → Follow-ups.

## Addendum — after the pre-merge review fixes (2026-10-13)

The findings of `/verify-against-spec` and `/adversarial-review` were fixed in this change; each one
has its A/B/C/D line in `design.md` → Follow-ups. Re-run after the fixes:

- `npx vitest run tests/unit/cli tests/integration/cli`: 206 passed, 0 failed, 0 skipped.
- `npx vitest run`: 1173 passed, 0 failed, 0 skipped (87 files).
- `npm run lint`, `npm run typecheck`, `npm run docs:coverage`: exit 0, no warning;
  `npm run lint:architecture`: the three pre-existing `no-orphans` warnings.
- `npx stryker run --mutate "packages/cli/src/commands/ask.ts"`: **94.46 %** (273 killed, 6 survived,
  10 no coverage). The one new survivor (`answer.message !== undefined` → `true` in `formatUnknown`)
  got a unit case (`llm-required` without a message), which fails with the mutant applied by hand.
  The others are the equivalent or integration-only mutants listed above (`projectId: ''`,
  `config.mode === 'live'`, `writeErr`, the `CommanderError` check, `ASK_APPLICATION_NAME`, now killed
  by the integration tests "The connections are closed after a run" and the new pool-path test, both
  checked by hand).
- New tests: unit "prints the message only for llm-required, escaped", "escapes bidirectional, C1 and
  line-separator characters, and a path as a whole"; integration "the entry point hands ask over to
  runAskCommand", "answers through the default pool without holding a transaction while the model
  answers". Strengthened: "Help and version print without reading the environment" (`-h`, `-V`, an
  environment that records reads), "A daily budget stops the model call" (`resetsAt` pinned), "The
  connections are closed after a run" (sessions seen open first), "A typed answer is printed with its
  evidence and stored" (each excerpt's first line). "An unreachable database fails without leaking the
  URL" moved out of `describeWithDatabase`.
- Data state: the pool-path test commits one project and deletes it in `finally`; `project` /
  `claim` / `evidence` after the runs: 0 / 0 / 0.
- CI: the first run of PR #38 failed only in `secrets` (gitleaks flagged the synthetic key
  `SENTINEL-key-5d1e`); allowed by exact value in `.gitleaks.toml` (commit `cc6618d`), re-checked
  locally with `gitleaks git` and `gitleaks dir` (no leaks).
