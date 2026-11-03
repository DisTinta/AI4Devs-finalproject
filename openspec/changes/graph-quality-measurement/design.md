## Context

See `proposal.md` → Why. The state that shapes the approach:

- The reference is frozen (DIS-80): `fixtures/annotations/{acme-shop,task-api}.callsites.json`, format
  1, 50 sites each (`acme-shop` 14 `exact` / 17 `heuristic` / 19 `none`; `task-api` 26 / 0 / 24), and
  the nine SHA-256 of `docs/measurements/annotation-agreement.md` → `## Hashes SHA-256`.
  `tests/unit/docs/annotation-freeze.spec.ts` already fails if any of them changes.
- `scripts/annotation-agreement.mjs` exports `checkFreeze(report, root)` (one problem per file, or
  `the report records no hash`) and `sha256`. Its CLI is the template: `.mjs` + `.d.mts`,
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
values are SQL string literals (with `''` escapes), `NULL`, `true`/`false` and numbers. Other tables
and comments are skipped; the header `-- analyzer-fingerprint: <value>` is kept. A malformed line of
those four tables is a seed error (exit 1). *Alternative:* import `seedProjects` / `readStatements`
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
4. Called name: last identifier (`[A-Za-z_$][A-Za-z0-9_$]*`) of `call` after removing `(`, `'`, `"`
   and `@`; `new` → `__construct` / `constructor` by language; `read` → the property, its camel case
   and `get<Studly>Attribute` (the Laravel accessor the PHP analyzer targets, e.g.
   `Order::getSubtotalAttribute`).
5. False positive: an attributed edge that is the hit of **no** site of the project, counted once per
   project (a set of edge ids). This is criterion 3(e) of the ticket: two `new` on one line
   (`task-api`) attribute each other's constructor edge, and neither is a false positive.
*Alternative:* attribute every edge of the scope — rejected: a method with ten calls would turn nine
correct edges into false positives of each site.

**D4 — Measures (ticket M4).** Coverage and precision as in the spec; precision's numerator is hits
(sites), its denominator hits plus false-positive edges. This follows the sub-issue (M4) and not the
parent's draft "edges with the expected resolution / emitted edges": the parent's ratio is kept as
`resolutionAgreement` in the JSON and the report, not as a README column. `callsEdges` counts every
`calls` edge of the project, not only those in some scope, because the README columns "Aristas
exact/heuristic" describe the analyzer's output. Ratios rounded to four decimals half away from zero
(`Math.sign(x) * Math.round(Math.abs(x) * 1e4) / 1e4`); `null` when the denominator is 0.

**D5 — Order of the run (ticket M5).** `runMeasureGraph`: parse arguments (exit 2) → read the report
and `checkFreeze` (exit 1) → read and check the two annotation files (exit 1) → read the seed (exit 1
on a missing project or a malformed line) → `measure` → write the JSON → print the summary. The JSON is
written only after everything succeeded, with `writeFileSync` of the full text (no partial file).

**D6 — JSON layout.** `{ formatVersion: 1, seed: { path: "seeds/graph-dump.sql", analyzerFingerprint },
projects: [ { fixture, language, positives, truePositives, falseNegatives, falsePositives,
trueNegatives, coverage, precision, resolutionAgreement: { agreed, of }, callsEdges: { exact,
heuristic }, sites: [ { id, expected, outcome, hit: { resolution, extractor } | null,
falsePositiveEdges: [ { file, symbol, resolution } ] } ] } ] }`. Key order fixed by construction;
`falsePositiveEdges` sorted by `file`, `symbol`; `JSON.stringify(value, null, 2) + "\n"`.

**D7 — Formatting for the README and the report (ticket M8).** `formatRatio(n, d)` →
`77,4 % (24/31)`: the percentage computed from the integers (`100 * n / d`), one decimal, half away
from zero, decimal comma, a space before `%`; `no definida` when `d = 0`. Agreement figures: the JSON
numbers with a decimal comma (`100 %`, `kappa 1`). The formatter is exported from the script so the
documentation test uses the same one; the README itself is edited by hand (agent) from the printed
values, and the test proves it.

**D8 — Report (ticket M6, M7).** `docs/measurements/graph-quality.md` is the agent's text, written once
from the JSON; its three parsed sections (spec) are checked by `tests/unit/docs/graph-quality.spec.ts`.
The construction breakdown joins `sites[].id` with `selection.json` rows (`construction`, `ids`). The
report states that the apply agent ran it and annotated no site (M7).

**D9 — Tests.** `tests/unit/scripts/measure-graph.spec.ts`: the rules and measures on synthetic,
in-memory inputs (one test per scenario of "Site matching and attribution", "Measures per project",
"Annotation files are complete"), the seed reader against `seedProjects`, and the CLI on temporary
copies under `os.tmpdir()` (freeze broken, missing report, missing project, unknown argument, two runs
byte-identical), with `stdout`/`stderr` doubles. `tests/unit/docs/graph-quality.spec.ts`: committed
JSON equals `serialize(measure(repository inputs))`; README Table 2 and caption; report sections. The
copies hold only the files the script reads (the report, the nine frozen files, the seed), so a test
never writes inside the repository.

**D10 — PowerShell check (ticket M10).** The apply agent runs `npm run measure:graph` from
`pwsh -NoProfile -Command '…'` and `powershell.exe -NoProfile -Command '…'` and checks with
`git diff --exit-code -- docs/measurements/graph-quality.json` that the file is unchanged, recording
both shells' versions in the test and state report. No `$env:` variable is set; the script reads no
`.env`.

**ADR.** Not needed: a script outside `packages/`, reversible, one module.

## Risks / Trade-offs

- [Attribution by called name misses a wrong edge whose target has another name] → declared as a
  limitation in the report; the count of false positives is a lower bound.
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
