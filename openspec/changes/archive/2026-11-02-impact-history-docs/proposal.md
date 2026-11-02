## Why

The impact report of DIS-89 and DIS-90 tells a developer what depends on a change, which tests cover
it and how risky it is, from the deterministic graph only. Where the static graph is incomplete (PHP
reached through the container, facades, events), the repository history knows more: files that
always change together, and documents that describe code changed after them. The parent story
(DIS-93, CM-HU-16b; readme §1.3 Pantalla 3, Historia de Usuario 3) asks for that history and that
documentation in the report, **separated from the graph and labelled by origin**, so the developer
can tell how far to trust each line. This is DIS-94 (CM-HU-16b.1), the core half of CM-HU-16b; the
`POST /impact` route is DIS-95. Its blockers DIS-90 and DIS-36 are done.

## What Changes

- **`history`** in every answered report: the files that co-change with the files of the anchor,
  read from the stored `co_changed` edges (both ends), each `{ file, coChangeRate, prs, origin: 'git' }`
  with the edge's `weight` as the rate and the pull requests of the commits the two files share. No
  threshold beyond the two shared commits the edge already needs; ordered by rate. Anchor files are
  left out.
- **`docs`** in every answered report: the documents with a `describes` edge towards a file of the
  report (or one of its symbols), each `{ path, stale, staleSince? }`. A document is `stale` when a
  dated commit touching the code it describes is later than its own last dated commit; `staleSince`
  is the sha of the first such commit (the first change the document missed).
- **Widened risk**: a new count `D`, the stale documents of `docs`. `D ≥ 1` turns `LOW` into
  `MEDIUM` (`HIGH` and `MEDIUM` stay), and the rationale gains `, <D> documento(s) desalineado(s)`
  only when `D ≥ 1`, so every DIS-90 sentence with `D = 0` is unchanged.
- **Three store reads** (graph-store capability), with the contract of the existing reads (isolated
  by project, `ProjectNotFound`, one statement each, no write), in the Postgres store and in the
  in-memory double: the co-change pairs of some paths with their pull requests, the document links
  towards some paths, and the dated commits of some paths.
- **CLI `impact`**: two new sections, `DOCUMENTACIÓN` and `HISTORIAL`, between `TESTS` and `RIESGO`;
  each history line is marked `[git]`.
- **Docs**: `readme.md` (§1.4 CLI output, the risk text), `docs/DEMO.md` Paso 4, the Q2 row of
  `fixtures/README.md` (the stale document of Q2 is not `docs/pricing.md`; design D1),
  `docs/project-context.md` (the three reads).

Out of scope (non-goals): the `POST /impact` route and the projection to the readme §4 shape
(DIS-95); the web screen 3 (CM-HU-17); reading the document's content or contradictions between a
document and the code (`drift`, DIS-71), so `docs/pricing.md`, which names no symbol in backticks,
does not enter `docs`; changing the fixtures or the `describes` rule of DIS-49; a `coChangeRate`
threshold, weighting by lines or any author data; the history of files reached by the traversal (only
the anchor's files).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `impact`: an answered report gains `docs` and `history` ("Report by component"); two new
  requirements "Co-change history" and "Related documentation", with scenarios over small graphs and
  over the acme-shop seed; the risk rule gains the stale-document count ("Risk level of a report").
- `graph-store`: three new reads (co-changes, document links, file commits) and the validation of
  their `paths` argument ("Validation of read arguments").
- `cli-impact`: the report output gains the `DOCUMENTACIÓN` and `HISTORIAL` sections ("Impact report
  output"), and their paths go through the terminal-safe rendering ("Impact terminal safety").

## Impact

- **Code**: `packages/core/src/impact/` (new `history.ts`, `doc-staleness.ts`; `impact.ts`,
  `impact-report.ts`, `risk.ts`, `index.ts`), `packages/core/src/ports/StorePort.ts` and
  `packages/core/src/knowledge/graph-read.ts` (three methods and their row types),
  `packages/adapters/store-postgres/src/` (three SQL reads), `tests/support/in-memory-store.ts` (the
  double), `packages/cli/src/commands/impact.ts` (output).
- **Contract**: the core `ImpactReport` gains two required keys on `answered`. Its only consumer
  today is the CLI (changed here); DIS-95 projects it to the HTTP shape. No HTTP route changes.
- **Database**: no migration; the reads use the `edge`, `file`, `commit` and `file_commit` tables of
  DIS-24 and DIS-36. Three more statements per answered call, bounded by the files of the report.
- **Seed**: no regeneration; `seeds/graph-dump.sql` already holds the commits, `file_commit` links,
  the `co_changed` edge and the `describes` edges.
- **Cost and privacy**: no model call, cost 0, deterministic. No author data (`author_hash`) leaves
  the store: the reads return paths, shas, dates, weights and pull request numbers only.
- **Commands** (`docs/project-context.md`): tests with `npx vitest run`, `npm run lint`,
  `npm run typecheck`, `npx stryker run` (score ≥ 70).
