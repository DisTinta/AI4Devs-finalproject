## Why

CM-HU-18 (Linear DIS-20) promises that the same core indexes a PHP and a TypeScript repository, and
proves it with the evaluator's own commands: `npm run db:seed` must load `acme-shop` **and**
`task-api`, and `npm run verify` must check the golden answers of both (readme §1.1, §1.4, §7 PR 3).
DIS-30 and DIS-31 built the TypeScript analyzer, but nothing uses it yet: `seed:build`, `cache:build`,
the web's sample-project constant and the `index` command still know only `acme-shop` and PHP, so
the second sample does not exist for anyone who clones the repository. This change (Linear DIS-32,
CM-HU-18.3) closes that gap, after first paying the two debts DIS-30 left to it (author's decision,
2026-10-28).

## What Changes

**First, the debt inherited from DIS-30** (it changes the analyzer, so it goes before the seed is
regenerated):

- The TypeScript analyzer emits a `function` symbol for a module-level `const` whose only declarator
  is initialised with an arrow function or a function expression (`export const f = () => …`,
  `const h = function () {}`), with its span and signature. `let`, `var`, destructuring, nested
  `const`, class properties and other initialisers still produce no symbol, and these new symbols
  are neither source nor target of `calls` edges. `fixtures/task-api` has no such declaration, so its
  symbol inventory does not change.
- The helpers duplicated between the PHP and TypeScript analyzers (`bySymbolOrder`, `keepFirst`,
  `uniqueInputs`) move to `packages/core/src/index/` and are exported by `@codemind/core`. This is the
  only change to `packages/core`, approved by the author on 2026-10-28 as an exception to the DoD
  "`git diff --stat` empty in core"; behaviour does not change.

**Then, seed, golden answers and web:**

- `index --language typescript` is accepted and indexes with the TypeScript analyzer; the message
  `typescript: not available yet (CM-HU-18)` disappears (not breaking: it only accepts what was
  refused).
- `npm run seed:build` indexes `acme-shop` (PHP) and `task-api` (TypeScript), each in its own
  never-committed transaction, and writes one `seeds/graph-dump.sql` (format 1, one header, the two
  projects in name order) and a `packages/web/src/data/sample-projects.ts` with both; one stdout line
  per project. The analyzer fingerprint covers the TypeScript analyzer, `fixtures/task-api` and the
  `typescript` version; under the two fixtures it hashes only the files tracked by the repository,
  so a local `node_modules`, an untracked file or an ignored file never reaches it.
  An indexing error names the failing project (`"task-api" is not the root of a git repository`).
- `npm run db:seed` prints `2 projects loaded` (it already supported N projects).
- `npm run cache:build` builds the golden answers of every sample project (`acme-shop`: Q1, Q3, Q4;
  `task-api`: Q1, Q2, Q3 of the task-api table of `fixtures/README.md`; the texts of task-api's Q1
  and Q2 in that table are rewritten to name a symbol of the graph, `taskRoutes` and `buildPage`, so
  that every golden question anchors, design D6, Follow-ups Q-C), one file per project in
  `seeds/cache/`. **BREAKING** (author-only command): partial regeneration now needs
  `--project <name>`; question ids without it are a usage error.
- `seeds/graph-dump.sql`, `seeds/cache/acme-shop.json`, a new `seeds/cache/task-api.json` and
  `sample-projects.ts` are regenerated with Ollama (`qwen2.5-coder`). The fingerprint change forces
  acme-shop's golden answers to be regenerated; the regenerated entries carry no reviews.
- Screen 1 shows two sample cards; Screen 2 of `task-api` suggests its three golden questions.
  `npm run verify` prints `acme-shop: 3/3 …` and `task-api: 3/3 golden answers match`. task-api's Q4
  (authentication) answers `UNKNOWN (no-anchor)` without a model, pinned by a test of `ask`; it is
  not part of `verify`, which compares golden answers only.
- Docs: `fixtures/README.md`, `docs/DEMO.md`, `readme.md`, `docs/project-context.md`.
- The PR carries `git diff --stat origin/final-project-CRN...HEAD -- packages/core`, which lists only
  the helpers file and the barrel's export line.

**Non-goals:** Table 2 and the hand annotation of call sites (CM-HU-22, DIS-80); the independent
review of task-api's golden answers (DIS-33); new core symbol kinds (`variable`, `type`) and `calls`
edges from or to `const` functions; the HTTP indexing endpoint (DIS-6); regenerating the seed in CI;
rebuilding task-api's history in `npm run up` (live, non-golden questions about task-api need
`node fixtures/build-history.mjs task-api` first — documented, not automated). No personal data is
touched: the planted secret of `fixtures/task-api/src/config/env.ts:7` stays redacted in the seed
and the commit authors stay pseudonymised.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `code-analysis`: "TypeScript symbol extraction" — module-level `const` functions become `function`
  symbols.
- `cli-indexing`: "Command line contract" and "Errors in the project format without real paths" —
  `--language typescript` is accepted.
- `seed-build`: the seed holds both sample projects; per-project summary lines; the fingerprint's
  inputs; the sample-project constant with two objects.
- `seed-load`: the versioned seed loads two projects (`2 projects loaded`); the invalid golden
  example no longer uses `task-api`, which is now a seed project.
- `golden-answers`: golden questions per project, a multi-project `cache:build` with `--project`,
  per-project files and checks, and both versioned golden files coherent.
- `verify-smoke`: the expected output with task-api's golden answers.
- `project-picker`: Screen 1 shows the two sample cards.
- `ask-page`: "Suggested questions" — the coherence scenario names task-api's three suggested
  questions.
- `cli-projects`: the listing scenario with both samples loaded.

## Impact

- Code: `packages/core/src/index/` (helpers file and barrel only), `packages/analyzers/typescript/src/`
  (`symbols.ts`, `shared.ts`), `packages/analyzers/php/src/php-analyzer.ts`, `packages/cli/src/`
  (`compose-index.ts`, `commands/index-repository.ts`, `seed-build.ts`, `seed/fingerprint.ts`,
  `seed/render-dump.ts`, `seed/render-sample-projects.ts`, `cache-build.ts`,
  `cache/demo-questions.ts`), `packages/cli/package.json` (workspace dependency on
  `@codemind/analyzer-typescript`), `packages/web/src/data/` (generated constant, suggested questions).
- Data: `seeds/graph-dump.sql`, `seeds/cache/acme-shop.json`, `seeds/cache/task-api.json`.
- Tests: new tests for the helpers and for `const` functions; existing tests of the seed build, cache
  build, seed load, verify, index command, projects listing and Screen 1 updated where they assert a
  single sample (listed in `tasks.md`).
- CI: the `verify` job is unchanged and now checks six golden answers.
- No new external dependency (`typescript` is already a root dependency); no migration; no HTTP API
  change.
