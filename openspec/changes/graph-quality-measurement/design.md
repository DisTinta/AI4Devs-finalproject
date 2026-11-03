## Context

See `proposal.md` → Why. The state that shapes the approach:

- The reference is frozen (DIS-80): `fixtures/annotations/{acme-shop,task-api}.callsites.json`, format
  1, 50 sites each (`acme-shop` 14 `exact` / 17 `heuristic` / 19 `none`; `task-api` 26 / 0 / 24), and
  the nine SHA-256 of `docs/measurements/annotation-agreement.md` → `## Hashes SHA-256`.
  `tests/unit/docs/annotation-freeze.spec.ts` already fails if any of them changes.
- `scripts/annotation-agreement.mjs` exports `checkFreeze(report, root)` (one problem per file, or
  `the report records no SHA-256 hash`) and `sha256`. Its `roundRatio` (integer arithmetic) and
  `parseArguments` are not exported. Its CLI is the template: `.mjs` + `.d.mts`,
  `run…(args, { root, stdout, stderr })`, exit codes 0 / 1 / 2, `--root <dir>`.
- `seeds/graph-dump.sql` is seed format 1: header comments (`codemind-seed-format`,
  `analyzer-fingerprint`, `contract-fingerprint`) and one `INSERT INTO <table> (<cols>) VALUES (…);`
  per line. 2 `project`, 91 `file`, 185 `symbol` (`start_line`, `end_line`), 270 `edge` rows
  (`source_symbol_id | source_file_id`, `target_symbol_id | target_file_id`, `kind`, `resolution`,
  `extractor`). The CI `verify` job fails on a stale seed (analyzer or fixture fingerprint).
- `tests/unit/scripts/wiring.spec.ts` → "The startup scripts need no installed dependency": every
  `scripts/*.mjs` may import only `node:` built-ins and sibling `./*.mjs` files.
- `scripts/` is outside Stryker's `mutate`; its tests live in `tests/unit/scripts/` typed through
  sibling `.d.mts` files (`docs/project-context.md`).
- A throwaway prototype of the D3 rules, run by the propose agent in its scratchpad (not committed,
  not published), gave `acme-shop` 24/31 hits and no false positive, `task-api` 26/26 and no false
  positive once rule D3.5 is applied, and `calls` edges 47 `exact` + 17 `heuristic` / 37 `exact` + 0
  `heuristic`. It only checks that the rules are workable; the published figures are the apply run's.

## Goals / Non-Goals

**Goals:**

- One pure function `measure(inputs)` that the CLI and the documentation test both call, so the test
  can prove the committed JSON is the current measurement.
- A failure mode for every broken input (freeze, structure, seed), each with exit 1 and nothing
  written.

**Non-Goals:**

- A general SQL parser: only the four tables of the seed format the generator writes.
- Changing `scripts/annotation-agreement.mjs` or its exports.
- Any analyzer change, any new dependency.

## Decisions

**D1 — The seed is the graph (ticket M1).** The script reads `seeds/graph-dump.sql`, not a database.
These are the rows `npm run db:seed` loads into `edge`, so "the edges of the graph" and "the edges of
the seed" are the same set for the sample projects. *Alternative:* query PostgreSQL through
`StorePort` (the parent's technical context) — rejected: it needs a running database, depends on what
each person indexed, and could not run in the `quality` job. Freshness is already the `verify` job's.

**D2 — An own, bounded seed reader (ticket M2).** `readSeed(sql)` accepts only the generator's line
form `INSERT INTO <table> (<cols>) VALUES (<values>);` for `project`, `file`, `symbol`, `edge`;
values are SQL string literals `'…'` (with `''` escapes) and `E'…'` (with `\\` and `\uXXXX`, as
`packages/cli/src/seed/parse-seed.ts:163-201`; the current seed has none, the parity keeps a later
seed loadable by both), `NULL`, `true`/`false` and numbers. Other tables and comments are skipped; the
header `-- analyzer-fingerprint: <value>` is kept. An unreadable seed is the error
`seeds/graph-dump.sql: the file cannot be read`; a malformed line of those four tables is
`seeds/graph-dump.sql:<line>: <reason>` (exit 1, nothing written). A `file`, `symbol` or `edge` row
whose `project_id` or `file_id` names no `project` or `file` row read before it is a malformed line too
(the same condition makes `seedProjects` throw, `parse-seed.ts:54`). *Alternative:* import `seedProjects` / `readStatements`
from `packages/cli` — rejected: a `.mjs` in `scripts/` cannot import TypeScript or a workspace package
(wiring test), and exporting the internal reader widens `packages/cli` for a script. Parity is guarded
instead: the unit test compares the per-project edge count with `seedProjects(sql)` (TypeScript test
code may import it).

**D3 — Matching and attribution (ticket M3, spec "Site matching and attribution").**
1. Edges of the site's project with `kind = calls` only.
2. Scope: source symbol declared in `site.file` with `start_line ≤ line ≤ end_line` (any such symbol:
   a method and its class both qualify), or source file `site.file`. The innermost-symbol rule is not
   used: a route statement is a `route` symbol and module-level calls have a file source.
3. Hit: target symbol named `target.symbol` in the file `target.file`. A target file (a
   `target_file_id` edge) never matches, because every annotated target is a symbol.
4. Called name: last match of `[A-Za-z_$][A-Za-z0-9_$]*` in `call` after **replacing** each `(`,
   `)`, `[`, `]`, `'`, `"` and `@` with a space (replacing, not removing: removing `@` would turn
   `'…CheckoutController@store'` of `php-12` into `CheckoutControllerstore`); `new` → `__construct` /
   `constructor` by language; `read` → the property, its camel case (split on `_`, later parts with
   their first letter upper-cased: `shipping_country` → `shippingCountry`) and `get<Studly>Attribute`
   with Studly = camel case with its first letter upper-cased (`getShippingCountryAttribute`; the
   Laravel accessor the PHP analyzer targets, e.g. `Order::getSubtotalAttribute`). Checked on the
   frozen calls: `[OrderController::class, 'show']` → `show`, `TRANSITIONS[from].includes(` →
   `includes`. An *attributed* edge is an edge of the scope whose target is the annotated target (a
   hit) or whose target's last name segment (after the last `::`) is a called name (ticket M3, both
   clauses), so `attributedEdges` always contains the site's hits.
5. False positive: an attributed edge that is the hit of **no** site of the project, counted once per
   project (a set of edge ids). This is criterion 3(e) of the ticket: two `new` in one symbol
   (`ts-21`, `ts-22` in `registerDb`, `src/plugins/db.ts:12-13` of `task-api`) attribute each other's
   constructor edge, and neither is a false positive. Every hit
   edge of a site (not only the recorded one, 6) is in that set.
6. The recorded hit: when several edges of the scope are hits (a method and its class both as
   sources, or an `exact` and a `heuristic` edge to one target), the site's `hit` is the one whose
   `resolution` equals `expected`, otherwise the first in seed order. This favours the analyzer: a
   right resolution emitted at all counts as agreed, which is what `resolutionAgreement` asks.
*Alternative:* attribute every edge of the scope — rejected: a method with ten calls would turn nine
correct edges into false positives of each site.

**D4 — Measures (ticket M4).** Coverage and precision as in the spec; precision's numerator is hits
(sites), its denominator hits plus false-positive edges. This follows the sub-issue (M4) and not the
parent's draft "edges with the expected resolution / emitted edges": the parent's ratio is kept as
`resolutionAgreement` in the JSON and the report, not as a README column. `callsEdges` counts every
`calls` edge of the project, not only those in some scope, because the README columns "Aristas
exact/heuristic" describe the analyzer's output. Ratios rounded to four decimals half away from zero
from the integers, `Math.floor((2·n·10^k + d) / (2·d)) / 10^k` with `k = 4` (the formula of `roundRatio`
in `scripts/annotation-agreement.mjs:274-277`, reimplemented because it is not exported and that file's
exports do not change); never from the float quotient. `null` when the denominator is 0.

**D5 — Order of the run (ticket M5).** `runMeasureGraph`: parse arguments (exit 2) → read the report
and `checkFreeze` (exit 1; a problem about the report itself, an unreadable report or
`the report records no SHA-256 hash`, is prefixed `docs/measurements/annotation-agreement.md: ` because
`checkFreeze` does not name the report) → read and check the two annotation files (exit 1, also for a file that cannot be read or parsed as
JSON) → read the seed (exit 1
on an unreadable seed, a missing project or a malformed line) → `measure` → write the JSON → print the
summary. The JSON is written only after everything succeeded, with `writeFileSync` of the full text (no
partial file). The projects are the fixed list `acme-shop`, `task-api`, read from
`fixtures/annotations/<fixture>.callsites.json`. Texts: usage
`Usage: node scripts/measure-graph.mjs [--root <dir>]` (an unknown argument, `--root` without a value
or `--root` twice, as `parseArguments` of `scripts/annotation-agreement.mjs:604-620`); one stdout line
per project `<fixture>: cobertura <formatRatio> · precisión <formatRatio> · calls <exact> exact /
<heuristic> heuristic`.

**D6 — JSON layout.** `{ formatVersion: 1, seed: { path: "seeds/graph-dump.sql", analyzerFingerprint },
projects: [ { fixture, language, positives, truePositives, falseNegatives, falsePositives,
trueNegatives, coverage, precision, resolutionAgreement: { agreed, of }, callsEdges: { exact,
heuristic }, sites: [ { id, call, site: { file, line }, expected, outcome, hit: { resolution,
extractor } | null, attributedEdges: [ { file, symbol, resolution } ], falsePositiveEdges: [ { file,
symbol, resolution } ] } ] } ] }`. `call` and `site` are copied from the annotation so the report's
`## Sitios fallados` cells come from the JSON alone, and `attributedEdges` is the "aristas atribuidas"
of the sub-issue's AC 1. Key order fixed by construction; both edge lists sorted by `file`, then
`symbol`, then `resolution` (a total order), duplicates (same edge id) kept once;
`JSON.stringify(value, null, 2) + "\n"`.

**D7 — Formatting for the README and the report (ticket M8).** `formatRatio(n, d)` →
`77,4 % (24/31)`: the percentage rounded from the integers with the D4 formula on `100·n / d` with
`k = 1`, decimal comma, a space before `%`, the decimal always written (`formatRatio(26, 26)` →
`100,0 % (26/26)`); `no definida` when `d = 0`. The agreement line keeps the opposite convention (no
trailing `,0`) because it copies `agreement.json` as written there. The README intro predicate
(spec "Published Table 2"): the first paragraph after `#### Mediciones que se publicarán` does not start
with `*(pendiente`, contains `npm run measure:graph`, does not contain `Las dos tablas se rellenan`,
and states that Table 1 is pending only through a sentence naming `DIS-81`. `formatAgreement(language)` →
`` `acme-shop`: concordancia 100 % (50/50), kappa 1 ``: the `percent` and `kappa` of `agreement.json`
as written there, with a decimal comma and no trailing `,0`, and `no definido` for a `null` kappa. Both
formatters are exported from the script so the documentation test uses the same ones; the README and
the report are edited by the agent from the printed values, and the tests prove them.

**D8 — Report (ticket M6, M7).** `docs/measurements/graph-quality.md` is the agent's text, written once
from the JSON; its three parsed sections (spec) are checked by `tests/unit/docs/graph-quality.spec.ts`.
The construction breakdown joins `sites[].id` with `selection.json` rows (`construction`, `ids`); a
construction with no ids (the `reexport` row of `task-api`) prints a row of zeros. The
report states that the apply agent ran it and annotated no site (M7), with the fixed sentence
`La medición la ejecutó un agente que no anotó ningún sitio.` under `## Método`; the limitations go
under `## Limitaciones`.

**D9 — Tests.** `tests/unit/scripts/measure-graph.spec.ts`: the rules and measures on synthetic,
in-memory inputs (one test per scenario of "Site matching and attribution", "Measures per project",
"Annotation files are complete"), the seed reader against `seedProjects`, and the CLI on temporary
copies under `os.tmpdir()` (freeze broken, missing report, report without hashes, missing project,
malformed seed line, missing seed, 49 sites, unknown argument, `--root` without a value and `--root`
twice, two runs byte-identical), with `stdout`/`stderr`
doubles. `tests/unit/docs/graph-quality.spec.ts`: committed JSON equals
`serialize(measure(repository inputs))`; README Table 2, agreement lines, intro and the TypeScript
paragraph rule; report sections. The
copies hold only the files the script reads (the report, the nine frozen files, the seed), so a test
never writes inside the repository.

**D10 — PowerShell check (ticket M10).** The apply agent runs `npm run measure:graph` from
`pwsh -NoProfile -Command '…'` and `powershell.exe -NoProfile -Command '…'` and checks with
`git diff --exit-code -- docs/measurements/graph-quality.json` that the file is unchanged, recording
both shells' versions in the test and state report. No `$env:` variable is set; the script reads no
`.env`.

**ADR.** Not needed: a script outside `packages/`, reversible, one module.

## Risks / Trade-offs

- [Attribution by called name can miss a wrong edge whose target has another name, and can count as a
  false positive a correct edge of an unannotated call with the same name in the same scope] →
  declared as a limitation in the report; the false-positive count is approximate in both directions.
- [A seed regenerated by an analyzer change makes the documentation test fail] → intended (spec
  "Committed measurement matches the repository"); the failure message names `npm run measure:graph`.
- [The two seed readers could diverge] → the parity test with `seedProjects` (D2).
- [CRLF on a Windows checkout would change the frozen hashes] → `.gitattributes` forces `eol=lf`;
  the PowerShell check runs on the Windows checkout and would expose it.
- [CI path filters] → the change touches `package.json` and `tests/`, which trigger the test jobs;
  `scripts/**` missing from the `runtime` filter is pre-existing (DIS-77 A8) and not widened here.

## Follow-ups

*Agent's text: decisions taken by the agent as lead engineer in the autonomous run
(`docs/AUTONOMOUS-RUN.md` §6), without the author. M1–M10 are the DIS-79 enrich decisions (comment of
2026-11-03 in the ticket); P1–P8 are design decisions of this proposal. Destinations: A = this change;
B = another existing ticket; C = the author (none in this change); D = accepted and recorded.*

| Id | Decision | Destination |
|---|---|---|
| M1 | Measure the `edge` rows of `seeds/graph-dump.sql`, no database or LLM (D1). Measuring a live database is discarded. | D — accepted |
| M2 | Own bounded seed reader in the script, parity-tested against `seedProjects` (D2). Exporting the `packages/cli` reader is discarded. | D — accepted |
| M3 | Matching and attribution rules (D3, spec). | A |
| M4 | Coverage, precision, `resolutionAgreement`, `callsEdges` (D4, spec). | A |
| M5 | Freeze check first; exit 1 and nothing written; only option `--root` (D5, spec). | A |
| M6 | Report `docs/measurements/graph-quality.md`, checked against the JSON (D8, spec). | A |
| M7 | The measurement is run by the apply agent, who annotated no site; the report says so (D8). | A |
| M8 | README number format `77,4 % (24/31)`, `no definida` for `null` (D7, spec). | A |
| M9 | README §2.6 Table 2 filled, its introduction rewritten, the "Medir el verificador" row re-pointed to DIS-81; the Entrega 1 review note on the verifier's latency (comment of 2026-10-16 in DIS-79) is moved to DIS-81 with a comment there. | B — DIS-81 (comment) |
| M10 | The PowerShell check is the agent's (D10). | A |
| — | Fixing the analyzers for the misses the measurement lists. | D — accepted (future improvement, listed in the report) |
| P1 | The parent's "the script fails if sites are missing" becomes the requirement "Annotation files are complete" (exactly 50 sites, `formatVersion` 1). | A |
| P2 | The parent's precision draft ("edges with the expected resolution / emitted edges") is kept as `resolutionAgreement`, not as the README's precision; the sub-issue's M4 governs (D4). | A |
| P3 | The parent's "TS ≥ PHP, otherwise explained" becomes a clause of "Published Table 2". | A |
| P4 | `read` sites also match the `get<Studly>Attribute` accessor and the camel-case name when attributing (D3.4), so an Eloquent read is not left without attribution. | A |
| P5 | A false-positive edge is counted once per project and never when it is any site's hit (D3.5); a site can be `tp` and still list false-positive edges. | A |
| P6 | The scope takes every enclosing symbol, not the innermost (D3.2). | A |
| P7 | No delta on `graph-annotations`: its freeze requirement already names `scripts/measure-graph.mjs` and does not change. | D — accepted |
| P8 | No existing test changes. `tests/unit/docs/annotation-freeze.spec.ts`, `tests/unit/scripts/wiring.spec.ts` and `tests/unit/docs/guides.spec.ts` (README links) must stay green unmodified. | A |

*Agent's text, spec audit run 1 (2026-11-03): the questions and findings of
`reports/2026-11-03-spec-audit.md` → run 1, decided by the agent as lead engineer (correction round 1).*

| Id | Decision | Destination |
|---|---|---|
| Q1 | "Cobertura" stays `tp / positives` (sub-issue M4), not the parent's "/ 50": a `none` site has no edge to find, so counting it in the denominator would cap coverage at 62 % (`acme-shop`) and 52 % (`task-api`) for a perfect analyzer. The fraction printed in each cell (`24/31`) makes the denominator visible. | D — accepted (sub-issue governs) |
| Q2 | "Precisión" stays `tp / (tp + false-positive edges)` (M4); the parent's "right resolution / emitted edges" is published as `resolutionAgreement` in the JSON and the report's `Resolución coincidente` column, not in Table 2. | D — accepted (sub-issue governs) |
| B1 | The parent's "TS ≥ PHP, otherwise explained" is a testable rule: the paragraph `**Por qué TypeScript no supera a PHP.**` and the scenario "A TypeScript figure below PHP is explained". | A |
| B2 | Called name: replace `(`, `)`, `[`, `]`, quotes and `@` with spaces, then the last identifier; camel case and `get<Studly>Attribute` defined for snake_case; scenario with `php-12`, an array callable and `shipping_country` (D3.4). | A |
| B3 | Several hits: the one with the expected resolution is recorded, else the first in seed order (D3.6, scenario). | A |
| B4 | Each JSON site holds `call`, `site` and `attributedEdges`; the `## Sitios fallados` cell formats are fixed (D6, spec). | A |
| B5 | `## Resultados` cell formats fixed per column (spec). | A |
| B6 | One agreement line per project under Table 2 with a fixed text, through the exported `formatAgreement` (D7, spec). | A |
| B7 | An unreadable seed or a malformed line of the four tables → exit 1 naming `seeds/graph-dump.sql` and the line, nothing written; scenario "A malformed seed line is an error" (D2, spec). | A |
| I1 | Report scenario also checks `## Método` with the fixed independence sentence and `## Limitaciones`. | A |
| I2 | "Annotation files are complete" scenario also covers `formatVersion: 2`, a repeated id and the CLI exit 1. | A |
| I3 | The sample limitation states its size: 50 sites per language in two sample repositories built on purpose. | A |
| I4 | Usage and stdout lines have exact texts; project list fixed; edge lists sorted with `resolution` as tie-break; `--root` without value or twice is exit 2 (D5, D6, spec). | A |
| I5 | Context quotes `checkFreeze`'s text exactly: `the report records no SHA-256 hash`. | A |
| I6 | The limitation names two different models of one family (`claude-opus-5-5`, `claude-sonnet-5-5`), so it agrees with `readme.md` and `docs/project-context.md`. | A |
| I7 | Ratios and percentages rounded from the integers with the `roundRatio` formula, reimplemented in the script (D4, D7). | A |
| I8 | The seed reader also accepts `E'…'` with `\\` and `\uXXXX`, as `parse-seed.ts` (D2). | A |
| I9 | The spec quotes the README headers ``Aristas `exact` `` and ``Aristas `heuristic` ``. | A |
| I10 | "Published Table 2" requires that the «Mediciones que se publicarán» intro no longer marks Table 2 as pending, asserted in the README scenario. | A |
| I11 | Task 5.4 is split into a RED test task and the report-writing task. | A |

*Agent's text, spec audit run 2 (2026-11-03): the findings of `reports/2026-11-03-spec-audit.md` →
run 2, decided by the agent as lead engineer (correction round 2). Run 2 had no question for the
author.*

| Id | Decision | Destination |
|---|---|---|
| R2-B1 | The README intro rule is a testable predicate: the first paragraph after `#### Mediciones que se publicarán` does not start with `*(pendiente`, contains `npm run measure:graph`, does not contain `Las dos tablas se rellenan`, and names `DIS-81` for Table 1 (spec, D7, task 5.3). | A |
| R2-I1 | An attributed edge is one reaching the annotated target or ending in a called name, both clauses of ticket M3 (spec, proposal, D3.4), so `attributedEdges` always lists the hits. | A |
| R2-I2 | `--root a --root b` is part of the scenario "An unknown argument is a usage error" (task 1.1). | A |
| R2-I3 | A problem about the agreement report itself is prefixed `docs/measurements/annotation-agreement.md: `; the no-hash case extends "The agreement report is missing" (spec, D5, task 1.3). | A |
| R2-I4 | A missing seed gives `seeds/graph-dump.sql: the file cannot be read`, inside "A malformed seed line is an error"; the count stays 26 scenarios (spec, task 2.4). | A |
| R2-I5 | Table 2 percentages always carry one decimal: `formatRatio(26, 26)` is `100,0 % (26/26)` (spec, D7, task 3.4). | A |
| R2-I6 | An annotation file that cannot be read or parsed as JSON is a problem naming the file, exit 1 (spec, D5, task 2.1). | A |
| R2-I7 | A `file`, `symbol` or `edge` row naming no `project` or `file` row is a malformed line (spec, D2, task 2.3). | A |
| R2-I8 | D3.5 cites the real case: `ts-21` and `ts-22` are two `new` in one symbol (`registerDb`, lines 12-13), not on one line. | A |
| R2-I9 | The false-positive count is approximate in both directions; Risks and the report limitation say so (spec, Risks). | A |
| R2-I10 | D8: a construction of `selection.json` without ids (`reexport` of `task-api`) prints a row of zeros. | A |
| R2-I11 | The README link to `docs/measurements/graph-quality.md` is added in task 5.5, when the report exists, so `tests/unit/docs/guides.spec.ts` never goes red between 5.3 and 5.5. | A |
