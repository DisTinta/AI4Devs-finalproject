# Test and State Verification Report

- Date: 2026-11-02
- Change: impact-history-docs
- Step: 9. Backend: Run Tests and Verify Data State (MANDATORY)

*Agent's text: written by the agent of the autonomous run (`docs/AUTONOMOUS-RUN.md` §6), without the author.*

## Commands executed
- Baseline (task 0.4): `npx vitest run tests/unit/impact tests/integration/impact tests/unit/cli/impact-command.spec.ts tests/integration/cli/impact-command.spec.ts tests/unit/store/in-memory-store.spec.ts tests/integration/store/graph-read.spec.ts`, first without `DATABASE_URL` (integration skipped) and then with `DATABASE_URL` on the `codemind_test` database (the local `codemind` database holds the seed and the integration run refuses a database with committed projects)
- Targeted (task 9.2): the same plus `tests/unit/seed/golden-questions.spec.ts`
- `npx vitest run --project dom --project seed-build --project node` (whole suite, with `DATABASE_URL` on `codemind_test`), `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`, `npm run verify`
- `npm run seed:build` (design Follow-ups A1, A2)
- `npx stryker run --mutate "packages/core/src/impact/**/*.ts,packages/cli/src/commands/impact.ts"` and, after four extra tests, `npx stryker run --mutate "packages/core/src/impact/history.ts,packages/core/src/impact/doc-staleness.ts,packages/core/src/impact/risk.ts,packages/cli/src/commands/impact.ts"`
- `node scripts/dev-processes.mjs stop` after every run that started anything

## Test results
- Baseline (task 0.4): without `DATABASE_URL`, 9 files passed, 2 skipped, 129 tests passed, 55 skipped. With `DATABASE_URL`: 11 files passed, 184 tests passed.
- Targeted after the change (task 9.2): 14 files passed, 228 tests passed (before the four mutation tests; 232 after).
- Whole suite with a database (task 9.3): the first run had 7 failures, all in `tests/integration/cli/verify.spec.ts`: the golden files carried the previous analyzer fingerprint (design Follow-ups A1, A2). After `seed:build` and the refresh of `seed.analyzerFingerprint` in the two golden files, the file passes (7 tests). The rest of the suite: 200 files and 2122 tests passed in that run.
- `npm run lint`: no output (clean). `npm run typecheck`: green. `npm run lint:architecture`: 0 errors (1 pre-existing `no-orphans` warning for a `packages/web/dist` asset). `npm run docs:coverage`: no output, 0 warnings. `npm run verify`: 3/3 golden answers match for each of the two projects.
- Red first: only task 1.1 was run red before its implementation (`store.readCoChanges is not a function`); the other new tests were written together with their implementation, as design Follow-ups A6 says.
- Stryker (break threshold 80; the task's floor is `MIN_MUTATION_SCORE=70`): whole project 93.12. `history.ts` 100 (23 mutants), `doc-staleness.ts` 100 (46), `risk.ts` 100 (51), `impact.ts` of core 98.46 (64, 1 survivor, not examined: it is accepted, the file stays above the threshold), `commands/impact.ts` 91.67 (the survivors are in the pre-existing argument parsing and `defaultOpenStore`, none in `docLine` or `historyLine`). The first run left 9 survivors in `history.ts` (3), `doc-staleness.ts` (6) and `risk.ts` (1): they got a test each (the PR order of several edges, the earliest missed commit and the sha tie over rows given out of order, and a current document that must not be counted). No survivor is accepted.

## Existing tests changed (task 8.1)
- `tests/unit/explain/explain.spec.ts`: the three exact `calls` assertions gained `readCoChanges: 0, readDocumentLinks: 0, readFileCommits: 0`; nothing else.
- `tests/unit/store/in-memory-store.spec.ts`, `tests/integration/store/graph-read.spec.ts`, `tests/unit/impact/impact.spec.ts`, `tests/unit/impact/risk.spec.ts`, `tests/integration/impact/acme-shop.spec.ts`: new tests only (plus, in `graph-read.spec.ts`, an import and two helpers at the top).
- `tests/unit/impact/small-graph.ts`: optional `commits` and `fileCommits`.
- `tests/unit/cli/impact-command.spec.ts`: `sampleReport` (`docs: []`, `history: []`), "An impact report is printed by section with its risk", "prints the entries of indirect and tests, a file test once, and an empty tests list" (the two new sections in the expected stdout; its last `toContain` now ends at `DOCUMENTACIÓN` instead of `RIESGO HIGH`, because the new section comes between) and two new tests.
- `tests/integration/cli/impact-command.spec.ts`: "Q2 over the seed is printed with its risk" gained the `DOCUMENTACIÓN` and `HISTORIAL` assertion.
- `tests/support/in-memory-store.ts`: the three reads, three counters, edge weight and the commits and links kept. New: `tests/support/history-graphs.ts`.
- `tests/unit/seed/golden-questions.spec.ts`: unchanged and green.
- `npm run typecheck` and the search `grep -rn "calls).toEqual" tests` found no other double or exact `calls` assertion to change.
- Every `#### Scenario:` of the three deltas (49 titles) maps to a test with its name: 44 titles appear once and 4 twice in `tests/` (an unchanged test of the same name in the double and in the Postgres spec, or the title repeated in a comment); the 49th, "Files co-changed with the anchor's file are the history", is found with its apostrophe escaped in `tests/unit/impact/history.spec.ts`. None without a test.

## Data state verification
- Pre-test baseline (local `codemind` database, 2026-11-02T10:18Z):
  - `project` 2, `commit` 60, `file_commit` 102, `edge` 270, `query_log` by capability: `impact` 2.
  - `seeds/graph-dump.sql` header: `analyzer-fingerprint: sha256:153d943e…fc44f`, `contract-fingerprint: sha256:e94eef96…603fb392f`.
- Post-test validation:
  - Same counts (`project` 2, `commit` 60, `file_commit` 102, `edge` 270, `impact` 2) after the suite, Stryker and the manual runs (step 10 deleted its own rows).
  - `contract-fingerprint` unchanged. `analyzer-fingerprint` is now `sha256:c7da76ca…796df`: expected, `seed:build` after the edit of `knowledge/` and `store-postgres/src` (design Follow-ups A1); no other line of the dump changed (`git diff --stat seeds/graph-dump.sql`: 1 line).
  - `git status --porcelain seeds packages/web fixtures`: `seeds/graph-dump.sql` and the two files of `seeds/cache/` (A1, A2) and `fixtures/README.md` (task 11.3). No `.stryker-tmp/` left.
- State restored: Yes (the database); the seed and golden fingerprints are changed on purpose.
- Restoration actions: none.

## Privacy and ethics check (task 11.5, `/privacy-ethics-check`)
Scope: three new store reads, two new report sections, two new CLI sections; no new dependency, endpoint, authentication change or log.
- No `author_hash` and no commit message leaves the store: the three statements select neither, the row types hold neither, and the tests compare the exact key set of every row and check that the double's rows hold no `author` or `message`.
- The change text is still stored only in `query_log` by the existing row; `history` and `docs` hold repository paths, pull request numbers, rates and a commit sha.
- The CLI prints every path and the 7 printed characters of the sha through the terminal-safe helper (test "Control characters in documents and history are escaped").
- Fixtures are synthetic; no new fixture holds an e-mail or a secret. No `npm install` was run, so `npm audit --audit-level=high` was not needed.
- Verdict: PASS.

## UI evidence (if applicable)
- none: the change has no browser UI.

## Outcome
- Status: PASS
- Blocking issues: none. One item for the author (optional): the golden files were refreshed by hand, not regenerated (design Follow-ups A2).
