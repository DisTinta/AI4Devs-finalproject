# Test and State Verification Report

- Date: 2026-10-13
- Change: cli-ask (DIS-40)
- Step: 11 — Backend: Run Tests and Verify Data State

## Commands executed
- `npx vitest run tests/unit/cli tests/integration/cli`
- `npx vitest run`
- `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- `npx stryker run --mutate "packages/cli/src/commands/ask.ts"` (twice: before and after the survivor tests)

All with `DATABASE_URL` set to the migrated local database: no integration test was skipped.

## Test results
- Baseline (step 0.4, before any change): 85 files, 1134 tests passed, 0 skipped, 173 s.
- Targeted tests: 16 files, 202 passed, 0 failed, 0 skipped; 137 s.
- Required suite: 87 files, 1169 passed, 0 failed, 0 skipped; 145 s.
- `lint`, `typecheck`, `docs:coverage`: exit 0, no warning. `lint:architecture`: exit 0, the three
  `no-orphans` warnings that exist on the base commit.
- New tests: `tests/unit/cli/ask-command.spec.ts` (28) and `tests/integration/cli/ask-command.spec.ts`
  (7). Each of the 21 `#### Scenario:` of `specs/cli-ask/spec.md` maps 1:1 to an `it` of the same name
  (10.3, checked by grepping each title).
- Mutation (11.4), `MIN_MUTATION_SCORE=70`:
  - first run 87.63 % (248 killed, 24 survived, 11 no coverage);
  - after the survivor tests, **94.70 %** (268 killed, 0 timeout, 5 survived, 10 no coverage).
  - Survivors killed by a new test or assertion: an unknown evidence id kept or an empty
    `evidence:` line printed; an inner empty line indented; a `prior claims:` section without prior
    claims; the help texts; the `…(x !== undefined && { x })` spreads of `toFailure` (now
    `toStrictEqual`); `REPO_ROOT` (new test: a sample's relative `root_path` resolves against the
    repository root).
  - Equivalent: `projectId: ''` in the early question check (core only checks it is a string);
    `config.mode === 'live'` (an evaluation config has no `dailyBudgetUsd`); `writeErr` (the parser
    never writes an error: `outputError` is silenced); `error instanceof CommanderError` in the parse
    catch (`commander` throws nothing else there).
  - Covered only by integration (Stryker runs unit tests): `ASK_APPLICATION_NAME` and the 10
    no-coverage mutants of `defaultOpenStore` (the pool, its probe and `close`), exercised by
    "An unreachable database fails without leaking the URL" and "The connections are closed after a
    run". The latter was checked by hand: with `close` not ending the pool it fails with one
    `codemind-ask` session left.
- Notes on TDD order: the RED of steps 2.1, 2.3, 2.4, 3.1–3.3 and 3.6 and of the format tests of
  step 5 (7 tests) was seen before their code. The composition (configuration, pool, resolution,
  error table) was written in one GREEN after step 3's unit tests, so the tests of 3.4–3.5, 4.1, 6.x
  and 7.x passed on their first run; 3.5 was checked by mutation (above).

### Existing tests edited (10.2)
- None. `grep -rn "pending Ticket\|'ask'" tests/` finds no test of the old stub or of the global help;
  no test imports `packages/cli/src/index.ts` (`tests/unit/cli/seed-fingerprint.spec.ts` names the
  path in a synthetic file map only).

## Privacy and ethics check (9.1)
- Verdict: **PASS**. Surfaces: logging (stderr), AI context (model output and repository excerpts on
  the terminal), dependencies, delivery.
- The question is only passed to `parseExplainRequest` and `explain`; every error message is fixed
  (`toFailure`); unit sentinels `SENTINEL-question-3b8d` and `SENTINEL-ask-7f3a` never reach stderr.
- `LlmConfig` is only passed to `createLlm` and read for `mode`/`dailyBudgetUsd`, never logged or
  serialised; `SENTINEL-key-5d1e` reaches neither stdout nor stderr.
- Database URL: `DATABASE_UNAVAILABLE` has a fixed message; `u:s3cret@127.0.0.1:1` absent from the
  output; `pg` errors after the probe map to `INTERNAL` `unexpected error`.
- Terminal: the answer, statement and prior-claim texts, paths and excerpts are escaped line by line
  (`terminalSafeText`); events go through `createLogger` (terminal-safe JSON).
- Dependencies: only the workspace package `@codemind/adapter-llm` (one line in `package-lock.json`).
- Diff grep: no email, token or `Authorization` header; only synthetic credentials in tests. No PII.

## Data state verification
- Pre-test baseline (0.4 / 11.1):
  - `project` / `claim` / `evidence`: 0 / 0 / 0
  - `fixtures/acme-shop/.git`: present
- Post-test validation (11.5, after the suites, Stryker and step 12):
  - `project` / `claim` / `evidence`: 0 / 0 / 0
  - `.stryker-tmp/`: absent
- State restored: Yes
- Restoration actions: integration tests run in rolled-back transactions and the two default-pool
  tests write nothing; step 12 loaded the seed and deleted the acme-shop project afterwards (see its
  report).

## UI evidence (if applicable)
- None: the change has no browser UI. The terminal is the client and step 12
  (`./2026-10-13-12-manual-interface-testing.md`) drives it end to end; step 13.1 is not applicable
  beyond step 12.
- CI run (13.2): pending the push.

## Outcome
- Status: PASS
- Blocking issues: none
