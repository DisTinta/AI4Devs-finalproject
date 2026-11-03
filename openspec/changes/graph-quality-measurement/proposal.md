## Why

Table 2 of the README (§2.6, graph quality by analyzer) is still *(pendiente)*. Its reference exists
since DIS-80: 50 call sites per sample project, annotated blind by two independent agents and frozen
by SHA-256 in `docs/measurements/annotation-agreement.md`. What is missing is the measurement itself
(Linear DIS-79, CM-HU-22.1, parent DIS-53 / CM-HU-22): a deterministic script that compares the
`calls` edges of the indexed graph with that reference, refuses to measure when the reference has
changed, and gives coverage and precision per analyzer that anyone can reproduce with one command.
Without it the README cannot back the claim it makes about the limit of the PHP analyzer against the
TypeScript one.

## What Changes

- **Measurement script.** `scripts/measure-graph.mjs` (+ `scripts/measure-graph.d.mts`), run by the
  new npm script `measure:graph`: pure functions and a small CLI (`--root <dir>` only; exit codes 0,
  1 and 2, like the other scripts). It imports only Node built-ins and `./annotation-agreement.mjs`.
- **Freeze first.** Before reading anything else, the script calls `checkFreeze` of
  `scripts/annotation-agreement.mjs` on the `## Hashes SHA-256` table of the DIS-80 agreement report.
  Any mismatch or unreadable file → exit 1, one line per problem on stderr, nothing written, the seed
  never read (author's note on the ticket).
- **The graph is the seed.** The `file`, `symbol` and `edge` rows of `seeds/graph-dump.sql` (format
  1), the rows `npm run db:seed` loads into the `edge` table. No database, no LLM, no network: the
  measurement runs in CI and is reproducible. The seed's freshness against the analyzers is already
  guarded by the CI `verify` job; the JSON records the seed's `analyzer-fingerprint`.
- **Matching and attribution rules** (ticket M3): only `calls` edges of the site's project count; a
  site's *scope* is the edges whose source is a symbol of `site.file` whose line range contains
  `site.line`, or the file `site.file` itself; a *hit* is an edge of the scope whose target is the
  symbol `target.file` + `target.symbol`; an *attributed* edge is one of the scope whose target's last
  name segment is the site's called name; a false positive is an attributed edge that is the hit of no
  site.
- **Measures** per project: coverage = hits / positive sites; precision = hits / (hits + false
  positive edges); resolution agreement of the hits with `expected`; all `calls` edges by resolution;
  `null` ("no definida") instead of a division by zero. The result goes to
  `docs/measurements/graph-quality.json` with the detail of every site; two runs give identical bytes.
- **Structural checks.** A project missing from the seed, an annotation file whose `formatVersion` is
  not 1 or that does not hold exactly 50 sites (parent DIS-53: "the script fails if sites are
  missing") → exit 1, nothing written.
- **Report and README.** New `docs/measurements/graph-quality.md` (agent's text: method, definitions,
  results, breakdown by construction from `selection.json`, every failed site, limitations).
  `readme.md` §2.6: Table 2 filled from the JSON, its caption citing the inter-annotator agreement of
  `docs/measurements/annotation/agreement.json`, the stale introduction rewritten (Table 1 stays
  pending, DIS-81), and the "Medir el verificador" row of the review table re-pointed to DIS-81.
- **Tests.** `tests/unit/scripts/measure-graph.spec.ts` (pure rules on synthetic graphs, the CLI on
  temporary copies) and `tests/unit/docs/graph-quality.spec.ts` (the committed JSON equals a fresh
  measurement of the repository; the README table and the report agree with the JSON).

**Non-goals.** Modifying anything under `fixtures/annotations/`, `docs/measurements/annotation/` or
`docs/measurements/annotation-agreement.md`; fixing the analyzers for the misses the measurement finds
(listed in the report, destination D); Table 1, `measure-context`, the verifier's latency or any LLM
call (DIS-81); measuring a live database or re-indexing the fixtures; enlarging the sample.

## Capabilities

### New Capabilities

- `graph-quality`: the deterministic measurement of the call graph against the frozen call-site
  annotations — freeze check, seed reading, matching and attribution rules, measures, CLI, and the
  published Table 2 and report.

### Modified Capabilities

None. `graph-annotations` already names `scripts/measure-graph.mjs` in its requirement "Frozen
annotations and agreement report", and nothing in it changes.

## Impact

- New files: `scripts/measure-graph.mjs`, `scripts/measure-graph.d.mts`,
  `docs/measurements/graph-quality.json`, `docs/measurements/graph-quality.md`,
  `tests/unit/scripts/measure-graph.spec.ts`, `tests/unit/docs/graph-quality.spec.ts`.
- Edited: `package.json` (`scripts.measure:graph`), `readme.md` §2.6, the review table row and the
  `scripts/` line of the tree; `docs/project-context.md` (the command and its gotcha).
- No product code (`packages/**`), no migration, no dependency, no API or UI change. `scripts/` is
  outside Stryker's scope, so the mutation gate is not affected.
- A change of an analyzer that regenerates `seeds/graph-dump.sql` makes
  `tests/unit/docs/graph-quality.spec.ts` fail until `npm run measure:graph` is re-run and the README
  table updated: intended, so the published figures cannot go stale.
- No personal data: the inputs are the sample fixtures, the seed and the annotation files.
