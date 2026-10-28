## Context

See `proposal.md` for the why. The state this design starts from (`final-project-CRN` @ `2b97b00`):

- `packages/cli/src/seed-build.ts` indexes one fixed project (`SEED_PROJECT = 'acme-shop'`, `php`)
  in a never-committed transaction (`createSeedTransaction`), renders it with
  `renderSeedDump(rows, fingerprints, name)` and `renderSampleProjects(rows, name)`, and rebuilds one
  history (`buildOne('acme-shop')`).
- `packages/cli/src/compose-index.ts` → `defaultPorts(authorHashSalt)` always builds
  `createPhpAnalyzer()`; `PortsFactory` takes only the salt. `commands/index-repository.ts` refuses
  `--language typescript` with `typescript: not available yet (CM-HU-18)`.
- `packages/cli/src/seed/fingerprint.ts` hashes the PHP analyzer, core's `index/` and `knowledge/`,
  the adapters, the seed renderer, `fixtures/history/` and `fixtures/acme-shop/`; it skips only
  `.git`. `fixtures/task-api/node_modules/` exists locally (ignored by git), so hashing
  `fixtures/task-api/` without skipping it would give a local fingerprint CI never reproduces.
- `packages/cli/src/cache-build.ts` + `cache/demo-questions.ts`: `GOLDEN_PROJECT = 'acme-shop'` and
  `GOLDEN_QUESTIONS` fixed; argv = ids; default output `seeds/cache/acme-shop.json`.
- `seed-load.ts`, `parse-seed.ts`, `verify.ts` and the golden-file readers already handle N projects
  and N golden files (unit tests with a two-project seed exist).
- The TypeScript analyzer (`packages/analyzers/typescript/src/`) keeps private copies of
  `bySymbolOrder`, `keepFirst`, `uniqueInputs` and `byPath` in `shared.ts` (DIS-30 design D7);
  `php-analyzer.ts` has the originals as private functions.
- `@codemind/cli` does not depend on `@codemind/analyzer-typescript` yet; `typescript` is a root
  dependency already resolved in `package-lock.json`.

Constraints: layer order `test → port → domain (core) → adapter → CLI`; `packages/core` may change
only by the helpers move (author's exception of 2026-10-28); the dependency rule
`analyzers-are-siblings` of `.dependency-cruiser.cjs` stays as it is; the seed stays byte-for-byte
reproducible; Ollama (`qwen2.5-coder`, CPU) is the only model available to build golden answers.

## Goals / Non-Goals

**Goals:**

- Pay the two DIS-30 debts first, with no change to the PHP or TypeScript outputs for the fixtures.
- Make `seed:build`, `cache:build`, `db:seed`, `verify`, Screen 1 and Screen 2 work with the two
  samples, with the smallest change to their contracts.
- Leave `packages/core`'s diff limited to the helpers move, provable in the PR.

**Non-Goals (design level):**

- No generic "list of samples" configuration file: the two samples are a constant of the CLI.
- No new seed format version: format 1 already allows several projects.
- No change to `verify.ts`, `seed-load.ts` or the golden-file format.
- No change to `npm run up` (it keeps rebuilding only acme-shop's history; see Follow-ups P7).

## Decisions

### D1 — `const` functions in `extractSymbols` (enrich E1)

`extractSymbols` (`symbols.ts`) adds one branch: a `VariableStatement` whose parent is the
`SourceFile`, without `declare`, whose `declarationList` has the `Const` flag and exactly one
declaration with an `Identifier` name and an initializer that is directly an `ArrowFunction` or a
`FunctionExpression`. It calls `add('function', name, statement, signatureEnd)` with the **statement**
as node (so `export` is in the span and a JSDoc is not, as for every other declaration), and
`signatureEnd` = the body's `getStart` when the body is a `Block`, otherwise the end of the arrow's
`equalsGreaterThanToken` (the `=>` is kept). The walk keeps descending, so declarations nested in the
body are still emitted.

The statement is what lands in the `declarations` sink, so `symbolOf` maps the `VariableStatement`.
`calls.ts` never sees it as a boundary (only function declarations, class members and static blocks
are) and `targetOfDeclaration` only accepts callable declarations (`FunctionDeclaration`,
`MethodDeclaration`, `ConstructorDeclaration`, `MethodSignature`), so neither source nor target can
be one of these symbols: the spec's "no endpoint of `calls`" holds **without touching `calls.ts`**,
and a scenario pins it. Alternatives: registering the `ArrowFunction` node (would make it a `calls`
target through `getResolvedSignature`, which the ticket excludes); a single-declarator rule vs. one
symbol per declarator (`const a = () => 1, b = () => 2`): one per declarator would need a span rule
for a statement shared by two symbols; the single-declarator rule is enough for real code and keeps
spans unambiguous (Follow-ups P1).

### D2 — Helpers move to core (enrich E2, author's exception)

New `packages/core/src/index/analyzer-helpers.ts` with `bySymbolOrder`, `keepFirst` and
`uniqueInputs`, copied verbatim with their TSDoc, exported from `packages/core/src/index/index.ts`
(already re-exported by `packages/core/src/index.ts`, so `src/index.ts` does not change). Both
analyzers import them from `@codemind/core`; `php-analyzer.ts` deletes its private copies;
`shared.ts` keeps only `byPath`, with its comment updated. `byPath` stays duplicated: the exception
covers only the three helpers the author named (Follow-ups E2). The move is a refactor done with the
suite green: the structure tests of both analyzers do not change; the new
`tests/unit/index/analyzer-helpers.spec.ts` covers the three functions in their new home (needed for
Stryker, which mutates `packages/core/src/**`).

The `packages/core` diff of the PR is therefore exactly two files:
`packages/core/src/index/analyzer-helpers.ts` (added) and `packages/core/src/index/index.ts` (one
export line).

### D3 — Analyzer chosen by language (enrich E4)

`PortsFactory` becomes `(authorHashSalt: string, language: ProjectLanguage) => IndexPorts`, and
`defaultPorts` returns `createTypeScriptAnalyzer()` for `typescript` and `createPhpAnalyzer()` for
`php`. `indexWithEnvironment` passes the language it already has. `index-repository.ts`:
`SUPPORTED_LANGUAGES = ['php', 'typescript']` and the special message disappears.
`packages/cli/package.json` gains `"@codemind/analyzer-typescript": "*"`; `npm install` only links the
workspace and updates `package-lock.json` (no download), followed by `npm audit --audit-level=high`.
Alternative: a separate factory per language passed by the caller — more seams for no gain.

### D4 — Multi-project seed build (enrich E3, E4)

`seed-build.ts` replaces `SEED_PROJECT` by
`SEED_PROJECTS = [{ name: 'acme-shop', language: 'php' }, { name: 'task-api', language: 'typescript' }]`
(name order). For each, sequentially: a new `createSeedTransaction` over the same `openTransaction`
seam, `indexWithEnvironment` under `__codemind_seed_build__` with `path` = the project name, and the
rows read back. Only when both are read back are the files rendered and written (constant, then
seed), so any failure of either indexing writes nothing. `renderSeedDump` takes
`(projects: { name, rows }[], fingerprints)`: one header, then each project's block in name order with
the existing per-project rendering; `renderSampleProjects` takes the same list. The default
`buildHistory` calls `buildOne` for both fixtures. One summary line per project. Alternatives: two
seed files (rejected: `db:seed` reads one file and `verify` one header); indexing both in one
transaction (rejected: the temporary name would collide).

### D5 — Analyzer fingerprint inputs (enrich E5)

`ANALYZER_DIRECTORIES` gains `packages/analyzers/typescript/src` and `fixtures/task-api`;
`PARSER_DEPENDENCIES` gains `typescript`; `filesUnder` skips entries named `node_modules` as it skips
`.git`. The analyzer fingerprint changes (core `index/`, the new directories), the contract
fingerprint does not.

### D6 — Multi-project cache build (enrich E6)

`cache/demo-questions.ts` exports `GOLDEN_PROJECTS: readonly { name, questions }[]` (acme-shop Q1, Q3,
Q4; task-api Q1, Q2, Q3, texts copied from `fixtures/README.md`) instead of `GOLDEN_PROJECT` and
`GOLDEN_QUESTIONS`. `cache-build.ts`: a small argument parser (no `commander` dependency needed; the
order of checks is the spec's) produces the list of `{ project, ids | all }`; the configuration
checks run once; the plan is built for every requested project before any connection (seed check,
project row and `indexed_commit`, partial-file checks, history rebuilt and `HEAD` compared); then
projects run in order, each writing its file right after its last question. The seams change from
`outputPath` to `outputDir` (default `seeds/cache`), and `buildHistory` receives the project name. The
attempt lines keep their `<id>:` form (the project's final line follows its attempts, so they are not
ambiguous in practice). Writing per project keeps an hour of CPU work when the second project fails;
the price is the `INTERNAL` message that names the files already written (spec).

Alternatives: build everything then write all files (an Ollama failure in task-api would throw away
~30 min of acme-shop answers); keep bare ids meaning acme-shop (an implicit default that becomes wrong
as soon as there are two projects).

### D7 — Golden regeneration and reviews (revises enrich E7)

D2 and D5 change the analyzer fingerprint, so `seeds/cache/acme-shop.json` must be regenerated even
though acme-shop's rows do not change. Enrich E7 proposed keeping the DIS-104 reviews of an entry
whose `response` comes out JSON-identical. That never happens: every stored response holds
`usage.latencyMs` and the model's token counts, which differ on every run. So the rule would be dead
code; the spec keeps today's rule (a regenerated entry has empty `reviews`) and the loss of acme-shop's
reviews is recorded for DIS-33, whose independent review now covers acme-shop's regenerated entries
too (Follow-ups E7). Alternative: a "same content" comparison on the verify fields plus texts — new
behaviour, more code and tests for a one-off; rejected under "least scope".

The agent runs `npm run seed:build`, then `npm run cache:build` (both projects, about an hour on CPU)
with `LLM_BASE_URL` pointing to the local Ollama and `qwen2.5-coder` as answer and verification
model, then `npm run db:seed` and `npm run verify` (enrich E11). If a task-api question cannot be made
cacheable after the build's retries, the step is retried once with `--project task-api <id>`; a
second failure is a finding of the apply step, not a reason to change the question set silently.

### D8 — task-api Q1 evidence (enrich E8)

No core change for `const`/`type` kinds: the Zod schemas of `src/schemas/` are not symbols (D1 only
covers `const` *functions*). The golden answer cites what the context engine gives (`taskRoutes`,
spans of the schema files when they are in the pack) and is judged by DIS-33. No golden answer may
rely on a `TasksController` → `TaskService` edge (none exists, DIS-31 E1).

### D9 — Web (enrich E9)

`sample-projects.ts` is regenerated by `seed:build`; `suggested-questions.ts` gains the task-api entry
with its three golden questions. The existing coherence tests (`sample-projects-coherence`,
`suggested-questions-coherence`) guard both; the latter is extended with an explicit task-api
assertion.

### D10 — No ADR

Every decision follows an existing pattern (seed format 1 already multi-project, analyzer per
language behind `AnalyzerPort`, golden file per project) and is cheap to revert. The core exception is
the author's decision, recorded in Linear and here.

## Risks / Trade-offs

- [Ollama produces an answer that fails the cache rules for a task-api question] → three attempts per
  question, then one targeted retry (D7); task-api Q2/Q3 have clear anchors (`buildPage`,
  `canTransition`).
- [A task-api golden answer cites weak evidence for Q1 (schemas are not symbols)] → accepted for now,
  judged by DIS-33 (D8).
- [`fixtures/task-api/node_modules` locally makes the fingerprint differ from CI] → skipped (D5);
  the CI `verify` job proves the fingerprints match.
- [acme-shop loses the DIS-104 reviews] → recorded for DIS-33 (D7).
- [Mutation score on the new CLI code] → unit tests for the argument parser, per-project plan and
  failure messages; the CI mutation job is the gate.
- [The regenerated seed changes acme-shop's rows unexpectedly] → the seed-build scenario "Adding
  task-api leaves the acme-shop rows unchanged" is checked on the real files (diff of the block).

## Migration Plan

No database migration. After the merge an evaluator runs `npm run db:seed` (or `make up`): the
sample projects are replaced idempotently and `task-api` appears. Rollback: revert the PR and run
`npm run db:seed` again (it deletes every sample, task-api included).

## Follow-ups

Decisions of the enrich step (Linear DIS-32, description and comment of 2026-10-28) and of this
proposal, with their destination (`docs/project-context.md` → Tracking deferred findings). *Agent's
text: decided as lead engineer in an autonomous run, without the author.* The spec audit and the
pre-merge reviews add their findings here.

| Id | Decision or finding | Destination |
|---|---|---|
| E1 | Module-level `const` functions (arrow or function expression, single declarator) are `function` symbols; `let`/`var`/nested/destructured are not; no `calls` edge from or to them. task-api has none, so its inventory does not change (the original ticket assumed it would) | **A** — this change (D1) |
| E1b | `calls` edges from or to `const` functions | **B** — future ticket if Table 2 or a golden answer needs them; recorded in the DIS-32 comment |
| E2 | Only `bySymbolOrder`, `keepFirst` and `uniqueInputs` move to core; `byPath` stays duplicated (the author's exception covers only those three) | **A** — this change (D2) |
| E3 | One `seeds/graph-dump.sql`, format 1, one header, projects in name order | **A** — this change (D4) |
| E4 | `defaultPorts` picks the analyzer by language; `index --language typescript` is enabled | **A** — this change (D3) |
| E5 | Fingerprint covers `packages/analyzers/typescript/src`, `fixtures/task-api` and `typescript`; skips `node_modules` | **A** — this change (D5) |
| E6 | `cache:build` per project with `--project`; task-api golden Q1, Q2, Q3; Q4 (authentication) has no golden answer | **A** — this change (D6) |
| E7 | Revised: no review preservation (JSON equality never holds because of `usage.latencyMs`); acme-shop's regenerated entries carry no reviews and DIS-33's review covers them too | **B** — Spanish comment on DIS-33 |
| E8 | task-api Q1 cites what the graph offers; judged by DIS-33 | **B** — DIS-33 |
| E10 | Docs: `fixtures/README.md`, `docs/DEMO.md`, `readme.md`, `docs/project-context.md` | **A** — this change |
| E11 | The agent runs `seed:build`, `cache:build` and `verify` locally with Ollama; CI runs only `verify` | **A** — this change (D7) |
| E12 | PowerShell checks (the `docs/DEMO.md` commands in a new PowerShell terminal: `npm run db:seed`, `npm run verify`, `npm run cli -- ask task-api "…"`) are for the author; the agent runs the same commands in Git Bash | **C** — author (tasks 9.6) |
| P1 | A `const` statement with several declarators gives no symbol (unambiguous spans) | **D** — accepted |
| P2 | `cache:build` arguments: ids need `--project`; unknown project and malformed arguments are `USAGE` | **A** — this change (D6) |
| P3 | Golden files are written per project; an `INTERNAL` failure after a written file names it | **A** — this change (D6) |
| P4 | Attempt lines keep the `<id>:` form without the project name | **D** — accepted |
| P5 | The `cli-projects`, `project-picker`, `seed-load` and `verify-smoke` scenarios that assumed a single sample are updated (deltas), not left contradicting the versioned seed | **A** — this change |
| P6 | No ADR (D10) | **D** — accepted |
| P7 | `npm run up` keeps rebuilding only acme-shop's history; a live (non-golden) question about task-api needs `node fixtures/build-history.mjs task-api` first, documented in `docs/DEMO.md` and `readme.md` | **C** — explicit debt, Spanish checklist comment on DIS-32 |
