## Context

See proposal.md → Why for the gap. The facts that shape the approach (checked on `final-project-CRN` @
`f643c28`):

- `vitest.config.ts` defines four projects (`dom`, `seed-build`, `harness`, `node`) that extend the root
  config; coverage in Vitest 4 is a root-level option and covers every project of the run.
  `vitest.stryker.config.ts` merges the root config (`mergeConfig`) and only adds `exclude` entries.
- `vitest` is `^4.1.12` (installed 4.1.12). `@vitest/coverage-v8` appears in `package-lock.json` only as
  an optional peer of `vitest`; it is not installed. The provider must match the `vitest` version.
- `ci.yml` → `quality` (Postgres service, 15 min limit, last measured 9m51s with Tests ~4 min and Hook
  timing ~4.5 min) runs `npx vitest run` in the step `Tests` under `if: steps.gate.outputs.run == 'true'`.
  The job `mutation` runs `npm run test:mutation` (incremental) or `test:mutation:full`; its cache key
  hashes `package-lock.json`, `stryker.config.json`, `vitest.config.ts` and `vitest.stryker.config.ts`.
- `.gitignore` already ignores `coverage/`.
- `scripts/*.mjs` follow one pattern: a pure exported function, a `run…` entry with injected I/O, a
  `.d.mts` for the typed tests, and an entry guard
  (`resolve(process.argv[1]) === fileURLToPath(import.meta.url)`), e.g. `scripts/dev-processes.mjs`.
  `tests/unit/scripts/wiring.spec.ts` asserts that no `scripts/*.mjs` uses Node's own `.env` APIs and
  that the quality scripts of `package.json` (its list `QUALITY`) never load `.env`.
- `tests/unit/ci/e2e-job.spec.ts` and `verify-job.spec.ts` parse `ci.yml` with `yaml`, never as text;
  `tests/unit/ci/e2e-config.spec.ts` imports `vitest.config.ts`.

## Goals / Non-Goals

**Goals:**

- Coverage collected in the same CI pass that already runs the suite, summarised per package in the job
  summary, never failing the run.
- Guard tests that would fail if someone turned coverage into a gate or weakened the mutation gate.

**Non-Goals:**

- No change to `stryker.config.json`, `vitest.stryker.config.ts` or the `mutation` job.
- No coverage in `frontend.yml`, no artifact upload, no third-party service.
- No new tests written to raise any coverage figure.

## Decisions

### D1 — `@vitest/coverage-v8` pinned to the installed `vitest` version

`npm install --save-dev --save-exact @vitest/coverage-v8@4.1.12`. The provider imports Vitest internals
and refuses a mismatched version, so it is pinned exactly (no caret) to the same `4.1.12`. Before
installing, `npm view` confirms the version exists and was published more than two weeks ago
(`docs/base-standards.md` §10); after, `npm audit --audit-level=high` (autonomous-run rule).
Alternative: `@vitest/coverage-istanbul` — rejected: it instruments the sources (slower on a 1 400-test
suite) and V8 is what the ticket and the parent name.

### D2 — The coverage block of `vitest.config.ts`

```ts
coverage: {
  provider: 'v8',
  include: ['packages/*/src/**/*.{ts,tsx}', 'packages/adapters/*/src/**/*.ts', 'packages/analyzers/*/src/**/*.ts'],
  exclude: ['**/*.d.ts', '**/*.test.*'],
  reporter: ['text-summary', 'json-summary'],
  reportsDirectory: 'coverage',
  reportOnFailure: true,
},
```

No `enabled` (off unless `--coverage`), no `thresholds` (the policy). `include` lists the product sources
so files no test loads still count as 0 % instead of vanishing; `packages/web` is included (its `.tsx`
too) as information only. `reportOnFailure: true` keeps the signal when a test fails, so the summary of
a red run still shows where the gaps are. `text-summary` prints the totals in the log; `json-summary` is
what D4 reads. The block lives at the root of `test`, not in a project: coverage is a root-level option in
Vitest 4 and applies to every project of the run. Stryker inherits the block through `mergeConfig` but runs Vitest with its own `perTest`
coverage analysis and never passes `--coverage`, so `enabled` stays off there; the CI `mutation` job of
this pull request confirms it (task 13).

### D3 — CI: one pass, one informative step

In `quality`, the `Tests` step's command becomes
`npx vitest run --coverage --exclude "**/*.linear.spec.ts" --exclude "**/*.scaling.spec.ts"` (the env is
unchanged; the exclusions are D7). Right after it:

```yaml
- name: Coverage summary (informative)
  if: ${{ !cancelled() && steps.gate.outputs.run == 'true' }}
  continue-on-error: true
  run: node scripts/coverage-summary.mjs coverage/coverage-summary.json >> "$GITHUB_STEP_SUMMARY"

- name: Timing budgets
  if: steps.gate.outputs.run == 'true'
  run: npx vitest run tests/unit/index/secret-scanner.linear.spec.ts tests/unit/index/secret-scanner.scaling.spec.ts tests/unit/explain/sanitize.linear.spec.ts tests/unit/explain/sanitize.scaling.spec.ts
```

`!cancelled()` makes the summary run when `Tests` failed but not after a cancellation or a job timeout,
the repository's pattern for "run even when the previous step failed" (`ci.yml` → `secrets`, "Scan
commits of the event"); it replaces the `always()` of the ticket's enhanced criterion 3 (audit I7). The
gate condition keeps it off when `quality` skipped the suite (docs-only push), and `continue-on-error`
means even a crash of the script cannot turn the job red. `Timing budgets` follows the `Hook timing`
pattern (only on a green run, no coverage).
A separate coverage job was rejected: it would run the whole suite a second time with its own Postgres
(enrich E3). The comment of the mutation step ("Coverage is published as a signal") is rewritten to
point at this step. If the measured `quality` duration on the pull request exceeds 13 of its 15 minutes,
`timeout-minutes` goes to 20 with a comment giving the figure (enrich E3); otherwise it stays.

### D4 — `scripts/coverage-summary.mjs`

Pure exports, typed in `scripts/coverage-summary.d.mts`:

- `packageOf(path)` → the package key of the spec (`core`, `adapters/llm`, …) or `undefined`; it
  normalises `\` to `/` and takes the segment after the last `packages/`.
- `summarise(summary)` → rows `{ name, lines, statements, functions, branches }` with summed
  `covered`/`total` per metric, sorted by name, plus the `Total` row.
- `renderMarkdown(rows)` → the heading, the sentence and the table of the spec; percentages with
  `toFixed(1)` and ` %`, `n/a` for a zero total; the target cell from a fixed map
  `{ core: 80, 'analyzers/*': 70 }` (the targets of `readme.md` §2.6, parent DIS-50), compared with
  `>=` on the unrounded line percentage (79.96 % is written `80.0 %` and marked `✗ 80 %`). The
  readme's ">80 %" / ">70 %" is read as "at least" (the parent DIS-50 writes "80 % core / 70 %
  analyzers"); aligning §2.6 is left to the docs work, as the ticket says (audit I4).
- `runCoverageSummary({ args, readFile, stdout })` → reads the file (default
  `coverage/coverage-summary.json`), writes the table or the one-line notice, and returns 0 in every
  case. The entry guard calls it with `node:fs` and `process.stdout` and sets `process.exitCode`.

Input cases (audit B4): a read error with `code === 'ENOENT'` → the "no report" notice. Any other read
error (`EISDIR`, `EACCES`, …), invalid JSON, JSON that is not a plain object (array, `null`, number), or
a file entry under `packages/` without one of `lines`, `statements`, `functions`, `branches` or with a
`covered`/`total` that is not a finite number → the "unreadable" notice. A plain object with no file
entry under `packages/` (for example only `total`) → the heading, the sentence and a table with only the
`Total` row, `n/a` in its four metrics and `—` as target. Entries outside `packages/` are ignored
without being validated.

Texts (Spanish, as `docs/`): heading `## Cobertura por paquete (informativa)`; sentence `La cobertura
no bloquea el pipeline: la puerta es la puntuación de mutación (stryker.config.json).`; notices
`Sin informe de cobertura: <path> no existe.` and `Informe de cobertura ilegible: <path>.` The script
loads no `.env` and imports only `node:` modules.

### D5 — Guard tests

- `tests/unit/scripts/coverage-summary.spec.ts`: the six scenarios of "Per-package coverage summary",
  one test each with the scenario's exact name, calling `runCoverageSummary` with an in-memory
  `readFile` and a string `stdout` (pattern of `tests/unit/scripts/dev-processes.spec.ts`); fixtures
  built in the test, absolute Windows and POSIX paths.
- `tests/unit/ci/coverage-gate.spec.ts`: "Coverage is off by default and has no thresholds" (imports
  `vitest.config.ts`, reads `package.json`), "The CI publishes coverage without blocking" and "The
  mutation gate stays hard" (parse `ci.yml`, `frontend.yml` with `yaml`, read `stryker.config.json`);
  local `Step`/`Job` interfaces as `e2e-job.spec.ts`.
- `tests/unit/scripts/wiring.spec.ts` (existing): `test:coverage` added to `QUALITY`; it implements the
  scenario "The guide's scripts load .env and the quality scripts do not" of `local-startup`, which this
  change modifies by a delta (audit B2).
- `tests/unit/docs/testing-guide.spec.ts` (new): "The testing guide documents the pyramid and the
  coverage policy"; reads `docs/TESTING.md` as text and checks the `Cobertura` row, the five levels of
  `## Pirámide de tests` with an integer count, the date and commit, and the `## Cobertura` section
  (audit B1).

### D6 — The pyramid in `docs/TESTING.md`

Traced by the requirement "The testing guide states the pyramid and the policy" (audit B1).

"Real pyramid" = test files per level, counted at implementation time with a command recorded in the
section, with date and commit (enrich E7): unit (`tests/unit` + `packages/web/src`), integration, kit
hooks, accessibility, end-to-end. One more row "Cobertura" in the levels table (`npm run
test:coverage`, `CI` → `quality`, informative), and a section "Cobertura" with the policy: coverage
informs per package with the §2.6 targets marked, never blocks; the mutation score (`break` 80) is the
only gate. The mutation row and section stay as they are.

### D7 — Wall-clock specs never run under coverage

The four timed specs (`tests/unit/index/secret-scanner.{linear,scaling}.spec.ts`,
`tests/unit/explain/sanitize.{linear,scaling}.spec.ts`) measure the time of hot loops against fixed
budgets (2000 ms per case, an 8× n/4n ratio); V8 block coverage changes exactly what they measure, as
`vitest.stryker.config.ts` already records for instrumented code. The coverage run excludes them with
two CLI `--exclude` globs, `"**/*.linear.spec.ts"` and `"**/*.scaling.spec.ts"`, in both the CI `Tests`
step and the `test:coverage` script; the globs are written with double quotes so the npm script works
the same under `cmd.exe`, PowerShell and Bash. A new CI step `Timing budgets` (D3) runs the four files
without coverage, so their budgets keep gating `quality` as before. Their modules keep coverage through
their other specs (`secret-scanner.spec.ts`, `sanitize.spec.ts`). Plain `npx vitest run` and `npm test`
still run them. Found at apply (task 2.4, A9): the CLI `--exclude` only reaches the root config, not the
`exclude` lists of the `test.projects`, so the four files still ran. `vitest.config.ts` therefore also adds
the two globs to the root and `node` project lists when `--coverage` is in `process.argv`; the CLI flags stay
as the documented intent and a test (`tests/unit/ci/coverage-gate.spec.ts`) guards it. Task 2.4 confirms that the coverage run lists none of the four files. Rejected
alternative: keep them under coverage and measure the margin, which turns a timing noise into a red
`Tests` step the next time a runner is slow.

## Risks / Trade-offs

- [V8 coverage slows the `Tests` step] → measured on the pull request; D3's rule raises the limit to 20
  minutes only if needed, with the figure recorded.
- [This pull request runs a full mutation pass] (the cache key hashes `package-lock.json` and
  `vitest.config.ts`) → accepted, 30–60 min; the CI wait follows the autonomous-run rule.
- [A future `vitest` bump without the provider] → `npm ci` installs a mismatched pair and `--coverage`
  fails the `Tests` step: the pin in D1 and a sentence in `docs/project-context.md` → Testing say both
  move together.
- [Coverage of a red run is partial] → informative by definition; the summary still shows it.
- [Timed specs under V8 coverage] → excluded from the coverage run and run in `Timing budgets` (D7).
- [`scripts/**` is not in the `runtime` filter of `quality`] → a pull request that changes only a
  `scripts/*.mjs` file (this summary script included) skips `Tests`. The gap already exists for every
  script and is not widened here; recorded, not fixed (audit I8, Follow-up A8).

## Migration Plan

None: additive configuration. Rollback is reverting the commit; no data or schema changes.

## Follow-ups

*Agent's text: decisions taken by the agent as lead engineer in the autonomous run
(`docs/AUTONOMOUS-RUN.md` §6), without the author. E1–E9 are the DIS-77 enrich decisions (comment of
2026-11-02 in the ticket); P1–P6 are design decisions of this proposal. Destinations: A = this change;
B = another existing ticket; C = the author (none in this change, by the author's instruction); D =
accepted and recorded.*

| Id | Decision | Destination |
|---|---|---|
| E1 | The mutation threshold stays at 80 (not lowered to 70): the DoD asks to fail below 70 in core and 80 over core, cli and api already meets it. Only a guard test is added that fails if the gate is removed or lowered below 70. | A |
| E2 | Coverage with `@vitest/coverage-v8` pinned to the exact `vitest` version (4.1.12), off by default and without `thresholds`; `npm run test:coverage` for local use (D1, D2). | A |
| E3 | In CI, coverage is collected in the existing `Tests` step of `quality`, not in a new job; if `quality` exceeds ~13 of its 15 minutes, the limit goes to 20 and the figure is recorded (D3). | A |
| E4 | The per-package summary is written by `scripts/coverage-summary.mjs` to `$GITHUB_STEP_SUMMARY` in a step with `continue-on-error: true` and `always()` (replaced by `!cancelled()`, A6); with no report it prints a notice and exits 0 (D3, D4). | A |
| E5 | No external service (Codecov, Coveralls) and no artifact upload: the job summary is enough and keeps the source on the runner. | D — accepted |
| E6 | `frontend.yml` does not change: its partial suite would give incomplete, duplicated coverage. | D — accepted |
| E7 | "The real pyramid" = test files per level, measured at implementation time with date and commit (D6). | A |
| E8 | Although the ticket calls it a DX chore, the change carries a delta of a new capability `test-quality-gates`, so "coverage never blocks" and "mutation is the gate" become verifiable requirements. | A |
| E9 | "PH-21" is not in `docs/`; it is read as the product decision the repository already applies (mutation as the only gate). | A |
| P1 | The parent DIS-50 asks for the `readme.md` §2.6 targets (80 % core, 70 % analyzers) marked ✓/✗ without blocking; the enrich step left them out. They are added as the `Objetivo (líneas)` column, on lines, compared with `>=` (spec, D4). | A |
| P2 | Inbound hand-off from DIS-14 (`impact-page` Follow-ups P7 and P18, destination B to this ticket): `packages/web` is in coverage (D2) but is **not** added to Stryker's `mutate`. The DoD scopes the gate to core, the author asked to limit the change to what is missing, and mutating the web needs jsdom in Stryker's dry run (excluded by DIS-58 D25) and marking the equivalent `signal.aborted` mutants of `useImpact.ts` and `useAsk.ts`. Recorded; the web's coverage row makes the gap visible. | D — accepted |
| P3 | `reportOnFailure: true`, so a red run still publishes the summary (D2). | A |
| P4 | The full mutation pass caused by the lock and `vitest.config.ts` changes is accepted (Risks). | D — accepted |
| P5 | Changed existing test: `tests/unit/scripts/wiring.spec.ts` → "The guide's scripts load .env and the quality scripts do not" gains `test:coverage` in `QUALITY`; the assertion is extended, not weakened, and the main spec `local-startup` is modified by a delta of this change (D5, audit B2). | A |
| P6 | The summary texts are in Spanish, like `docs/` and the job summary readers; the code and the CI step name stay in English (D4). | A |

*Agent's text: decisions of the spec-audit correction round 1 (report `reports/2026-11-02-spec-audit.md`
→ "Resolution of run 1"), taken by the agent as lead engineer without the author.*

| Id | Decision | Destination |
|---|---|---|
| A1 | Q1: `packages/web` stays out of Stryker's `mutate` (P2 confirmed). The DoD scopes the gate to core, the author asked to limit the change to what is missing, and mutating the web reverses DIS-58 D25. No owner ticket is opened (no new Linear issues in this run); the web's coverage row keeps the gap visible and the DIS-14 comment of task 11.4 records it. | D — accepted |
| A2 | B1: the DoD clause on `docs/TESTING.md` becomes the requirement "The testing guide states the pyramid and the policy" with a scenario implemented by `tests/unit/docs/testing-guide.spec.ts`; task 11.1 is RED → GREEN. | A |
| A3 | B2: the change carries a MODIFIED delta of `local-startup` ("Which commands load .env") adding `test:coverage`; proposal and task 13.9 updated. | A |
| A4 | B3: the four wall-clock specs never run under coverage; they are excluded from the coverage run and run in a new CI step `Timing budgets` (D7). The alternative of measuring their margin under coverage was rejected. | A |
| A5 | B4: input cases fixed — only `ENOENT` is "no report"; other read errors, non-object JSON, missing or non-numeric metrics are "unreadable"; an object with no `packages/` entry gives only the `Total` row with `n/a` (D4, two scenarios widened or added). | A |
| A6 | I7: the summary step uses `!cancelled()` instead of `always()`, the repository's pattern; the ticket's enhanced criterion 3 is updated in its `[enhanced]` section, never in `[original]`. | A |
| A7 | I1, I2, I3, I4, I5, I6, I9: no-argument default path in a scenario; target on the unrounded percentage with the 79.96 % case; "no coverage figure fails a run"; the readme's ">" read as "at least"; the local coverage runs filtered to `dom`, `seed-build`, `node` and run once; `docs/project-context.md` quality-scripts list gains `test:coverage`. | A |
| A8 | I8: `scripts/**` missing from the `runtime` filter is a pre-existing gap for every script; recorded in Risks and not widened here (least scope). | D — accepted |

*Agent's text: decisions taken during the apply (autonomous run), without the author.*

| Id | Decision | Destination |
|---|---|---|
| A9 | Task 2.4 found that the CLI `--exclude` does not reach the projects' own `exclude` lists, so the wall-clock specs still ran under coverage. The exclusion is also made in `vitest.config.ts` when `--coverage` is in `process.argv` (root and `node` project), with a guard test; the command strings of the spec stay unchanged (D7). | A |
| A10 | The real pyramid in `docs/TESTING.md` is counted on `dc23f9d` plus this change's new specs (the count cannot name the commit that contains it); the counting command is in the section. | D — accepted |

*Agent's text: decisions of the review step (reports `reports/2026-11-02-show-spec-working.md`,
`-verify-against-spec.md`, `-adversarial-review.md`), taken by the agent as lead engineer without the author.*

| Id | Decision | Destination |
|---|---|---|
| R1 | The guard "The wall-clock specs are excluded from every project when coverage is requested" built its plain case from the runner's argv, which holds `--coverage` in CI, and asserted only two lists. Fixed: the plain argv drops `--coverage` / `--coverage.*`, and every project with its own `exclude` is asserted (green plain, under `--coverage` and under `--pool threads`). | A — fixed |
| R2 | `COVERAGE_RUN` does not recognise `--coverage=true` (timed specs stay under coverage) and treats `--coverage.enabled=false` as a coverage run. Only hand-typed runs; the npm script, CI and Stryker use the covered forms, and editing `vitest.config.ts` would force another full mutation pass. | D — accepted |
| R3 | A package directory name with `|` or a line break would break the Markdown table; the names come from the repository's own `packages/`. | D — accepted |
| R4 | `Timing budgets` does not run when `Tests` failed (implicit `success()`), as D3/D7 specify; the job is red anyway. | D — accepted |
| R5 | `coverage.include` / `exclude` and the `text-summary` reporter are configuration details of "collected with the V8 provider", not in the spec; kept. | D — accepted |
| R6 | The CI job-summary table cannot be read back through the API; evidence is the step's success, the V8 totals in the `Tests` log and the identical local table. | D — accepted |
| R7 | Task 12.1: `quality` took 11 min 04 s (`Tests` 4 min 41 s) in run 41523599968, under 13 minutes; `timeout-minutes` stays 15. | D — accepted |
