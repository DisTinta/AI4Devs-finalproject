# Test and State Verification Report

- Date: 2026-10-11
- Change: context-engine-rank-budget
- Step: 14. Backend: Run Tests and Verify Data State

`DATABASE_URL` was the local compose default documented in `docs/project-context.md`
(`postgres://codemind:codemind@localhost:5432/codemind`), passed per command; `.env` was never read
by the agent. Docker Desktop and the Postgres container were stopped at the start of the session and
were started by the agent (`docker compose up -d`).

## Commands executed

- `npx vitest run tests/unit/context tests/unit/store/in-memory-store.spec.ts tests/integration/store/graph-read.spec.ts tests/integration/git/git-source-tree.spec.ts tests/integration/context`
- `npx vitest run`
- `CI=1 npx vitest run tests/unit/context/budget.spec.ts` (property test with the fixed seed)
- `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- `npx stryker run --mutate "packages/core/src/context/**/*.ts"` (three passes, see Mutation testing)
- `node <scratchpad>/counts.cjs` (row counts of `project`, `file`, `symbol`, `edge`, `query_log`)
- `npm run seed:build` (step 13, run by the author so the salt never entered the session),
  `git diff seeds/graph-dump.sql`, `sha1sum seeds/graph-dump.sql packages/web/src/data/sample-projects.ts`

## Test results

- Baseline (0.5, before any change, with the database): 73 files passed (73); 948 tests passed (948); 132 s.
- Targeted tests: 12 files, 162 passed, 0 failed, 0 skipped (before the mutation-driven extra cases).
- Required suite (`npx vitest run`, with the database), final head: 78 files passed (78); 1010 tests
  passed (1010); 0 skipped; 131 s.
- Property test under `CI=1` (seed `20261011`, 200 runs): green.
- `npm run lint`: 0 problems. `npm run typecheck`: 0 errors. `npm run docs:coverage`: no warning.
  `npm run lint:architecture`: 0 errors, 3 warnings, the same three `no-orphans` as before the change
  (`packages/web/src/data/sample-projects.ts`, `packages/analyzers/typescript/{src,dist}/index`).
- Guards: `grep -rn "adapters|store-postgres|process.cwd|console." packages/core/src/context` prints
  nothing.

### TDD evidence

- RED seen against the real system before each first implementation: the work-bound scenario failed
  on Postgres with `Actual Rows` 56 356 > 320 on the path-enumerating CTE; the four new double tests
  (three `resolution`, one `fileKind`); `readFileAt is not a function`; 60 searches > 16 and 40 anchors
  for the caps; `estimateTokens`, `rankCandidates`, `fitToTokenBudget` and `buildContextPack` missing.
- Tests born green after a first GREEN were each proven able to fail by a temporary mutation of the
  production code (copy, mutate, run, restore; `cmp` against the copy after each):
  - SQL (`queries.ts`): `bool_or` → `bool_and`; drop `w.all_exact AND`; `w.depth = n.distance` →
    `>=`; file kind constant for symbols. Each failed 1–2 of the new traversal tests.
  - `readFileAt`: no mode check; no size check; arguments checked after the root; binary content
    accepted; unknown commit propagated. Each failed one test.
  - `fitToTokenBudget`: replacement budget check removed → the property test found a minimal
    counterexample.
  - `buildContextPack`: no redaction; baseline per span; root joined to `process.cwd()` (5 tests
    failed); no `not-indexed` check; trailing line feed kept as a line; `workspaceRoot` checked late.
- Existing tests changed without weakening them: three exact-equality tests in
  `graph-read.spec.ts` and three in `in-memory-store.spec.ts` now also expect `fileKind` and
  `resolution`; three `SourceTreePort` literals (`index-repository`, `index-command`, `seed-build`
  unit specs) gained a `readFileAt` that throws, since indexing never calls it.
- Ranking: the author's expected order for Q1 matched the double at the first run.

### Scenario map (step 10.2)

Every `#### Scenario:` of the three delta specs maps to exactly one test whose name is the title:

| Spec | Scenarios | New | Test files |
|---|---|---|---|
| `context-engine` | 31 | 26 | `tests/unit/context/{anchor,rank,tokenizer,budget,context-pack}.spec.ts`, `tests/integration/context/context-pack.spec.ts` |
| `graph-store` | 23 | 5 | `tests/integration/store/graph-read.spec.ts` |
| `repository-indexing` | 21 | 7 | `tests/integration/git/git-source-tree.spec.ts` |

The double's copies of the five new `graph-store` scenarios are in
`tests/unit/store/in-memory-store.spec.ts`, named `<title> (in-memory double)`.

### Mutation testing

Score on `packages/core/src/context` (threshold `MIN_MUTATION_SCORE=70`):

| Pass | Score | Survived |
|---|---|---|
| 1 | 93.33 % | 24 |
| 2 (boundary cases added: exact budget fit, exact replacement fit, `text` of a symbol span, file without final line feed, empty file, largest budget) | 96.80 % | 11 |
| 3 (shared first/last line replacement, earlier span of the same file, name-only lexical match) | 97.87 % | 7 |

The 7 survivors are equivalent mutants:

- `anchor.ts:60` regex `+` removed: single separators give empty tokens, dropped by the length rule.
- `anchor.ts:65` prefix condition forced: a token under 6 characters adds itself again (`Set`).
- `anchor.ts:101` (×2) cap check `<=` → `<` / removed: with at most 32 symbols the capped path keeps all
  of them in first-found order, the same result.
- `budget.ts:77` `some` → `every`: two included spans never overlap, so one containing the candidate
  is the only overlapping one.
- `context-pack.ts:192` `?.` removed: every included path was read into the cache.
- `rank.ts:73` loop bound `<=`: the extra comparison is `NaN`, which sorts as a tie.

### Privacy and ethics check (step 9.1)

Verdict PASS WITH GAPS, all findings Low: span text heads to the model redacted by the indexer's
scanner (secrets of unknown shapes would pass, same residual risk as indexing; prompt-side
sanitisation is DIS-39); no logger or `console` added; `SourceUnavailable` and `RangeError` messages
carry no content; `fast-check` 4.10.2 and `pure-rand` 8.4.2 verified on npmjs (MIT, same author, no
install scripts, devDependency only); test data synthetic (AWS key built by concatenation). Not
assessed: the plan the session runs on.

### Seed regeneration (step 13)

`npm run seed:build` printed `acme-shop: 53 files, 121 symbols, 170 edges, 32 commits`. The diff of
`seeds/graph-dump.sql` is one line: `analyzer-fingerprint` `sha256:38d3edc1…` →
`sha256:f15c5fc5…`. `contract-fingerprint` and every row unchanged; `sample-projects.ts` sha1
unchanged (`62a2b908…`). Committed last (`chore(DIS-28): regenerate the seed fingerprint`).

### End-to-end testing (step 16.1)

Not applicable: no user interface uses the Context Engine yet (DIS-39 / CM-HU-12); it is exercised
against the real database and git in step 15. The CI run is linked in step 16.2.

## Data state verification

- Pre-test baseline:
  - `project`, `file`, `symbol`, `edge`, `query_log`: 0, 0, 0, 0, 0 (local database, empty)
  - `git status --porcelain seeds packages/web fixtures`: empty
  - `seeds/graph-dump.sql` sha1 `c342d55f…` (before step 13), `sample-projects.ts` sha1 `62a2b908…`
  - `codemind-*` directories under the OS temp dir: 16 (left by earlier runs)
- Post-test validation:
  - row counts: 0, 0, 0, 0, 0 (the integration tests write only inside rolled-back transactions)
  - `git status --porcelain seeds packages/web fixtures`: empty after the step 13 commit
    (`seeds/graph-dump.sql` sha1 `e0216f6d…`, the regenerated one)
  - `codemind-*` temp directories: 8 (the new tests remove their own; none added)
  - no `.stryker-tmp/` left behind
- State restored: Yes (nothing to restore)
- Restoration actions: none

## UI evidence (if applicable)

- (none: the change has no browser UI)

## Outcome

- Status: PASS
- Blocking issues: none
