## Context

See `proposal.md` → Why. The state this design builds on:

- `packages/core/src/impact/impact.ts` builds the answered report in `answer()`: anchor, reverse
  traversal, `groupComponents`, `findTests`, `buildReport`, `directCoverage`, then `assessRisk`. The
  report types live in `impact-report.ts`; `risk.ts` is pure.
- The `StorePort` has no read of `commit` or `file_commit`, and `neighbors` returns neither an edge's
  `weight` nor which seed reached a node, so neither the co-change rate nor "which report file this
  document describes" can be read through it.
- The stored `co_changed` edge is one per pair, from the smaller path to the larger in byte order,
  `weight` = Jaccard over the commits, only with at least two shared commits (DIS-36).
- `describes` edges go from a `doc` file to a symbol (DIS-49: the doc names the symbol in backticks or
  a fenced block). Over the acme-shop seed every `describes` edge leaves `README.md`; `docs/pricing.md`
  has none.
- The migration of DIS-24/DIS-36 does not check that a `file_commit` row joins a file and a commit of
  the same project (accepted risk, `0002_history-claims.up.sql`).
- The `cli-impact` output prints `DIRECTO`, `INDIRECTO`, `TESTS` and `RIESGO`.

## Goals / Non-Goals

**Goals:**

- The history and the documentation are computed in the core by two pure functions over plain rows,
  so their rules are tested without a database, and the SQL only selects rows.
- Three statements more per answered call at most, each bounded by the files of the report.
- No change to `direct`, `indirect`, `tests`, nor to any DIS-90 rationale with `D = 0`.

**Non-Goals:**

- No migration, no index, no seed or golden regeneration.
- No change to `neighbors`, `readIndexState` or any other existing read.
- The HTTP projection (DIS-95).

## Decisions

### D1. Q2's stale document over acme-shop (enrich decision 1)

The fixture row Q2 says "doc `docs/pricing.md` stale", but `docs/pricing.md` has no `describes` edge
(DIS-49, signed; the fixtures are not changed). The only related document of Q2 is `README.md`, last
touched on 2024-05-06, after every commit of the code it describes, so over the real seed it is
`stale: false`. The DoD "Q2 completa" is met as: `history` with `ShippingService.php` and PRs 24, 33
and 55, and `docs` with `README.md` current; the stale path is proven over the seed by adding, inside
the test's transaction, a later commit that touches `PriceCalculator.php` (spec scenario "A later
change to the price calculator makes the readme stale"). The Q2 row of `fixtures/README.md` is
corrected in this change. `docs/pricing.md`'s drift is Q5, DIS-71.

*Alternative rejected:* match `docs/pricing.md` by file name or by prose — that is a new `describes`
rule, out of scope and owned by DIS-49/DIS-71.

### D2. Widened risk (enrich decision 2, answering DIS-90's notice)

`D` = entries of `docs` with `stale: true`. `D ≥ 1` turns `LOW` into `MEDIUM`; `HIGH` and `MEDIUM`
stay, because a stale document is a documentation risk, not a coverage one, and the DIS-90 rule
(PH-15) is about tests and resolution. The rationale gains `, <D> documento(s) desalineado(s)` before
the period only when `D ≥ 1`, so no DIS-90 sentence changes. `assessRisk(report, facts)` reads `D`
from `report.docs` (the `ReportBody` gains `docs` and `history`); `RiskFacts` does not change.

*Alternative rejected:* always print `0 documentos desalineados` — it would change the rationale of
every DIS-90 scenario and of the demo for no information.

### D3. Three port reads instead of `lastCommitTouching` (enrich decision 3)

`staleSince` is the first commit the document missed: the earliest commit of the described code
later than the document's last commit. "The last commit touching a file" alone cannot give it. So the
port returns rows and the core computes:

- `readCoChanges(projectId, paths)` → `StoredCoChange { fromPath, toPath, weight, prNumbers }[]`;
- `readDocumentLinks(projectId, paths)` → `StoredDocumentLink { docPath, describedPath }[]`;
- `readFileCommits(projectId, paths)` → `StoredFileCommit { path, sha, committedAt: Date }[]`.

Row types go in `packages/core/src/knowledge/graph-read.ts`, the methods in `StorePort.ts`, with
JSDoc. Paths, not ids, because the core holds paths for every entry of the report and paths survive
reindexes. Each read is one SQL statement in `packages/adapters/store-postgres/src/queries.ts` that
checks the project in the same statement (a `project` row joined with a lateral subquery, so an
unknown id gives no project row and fails with `ProjectNotFound`), filtering `file.project_id`,
`edge.project_id` and `commit.project_id` against the project on every join (the `file_commit`
cross-project risk of the Context). `prNumbers` is computed in SQL (`array_agg(DISTINCT pr_number
ORDER BY pr_number)` over the commits linked to both files), so the core never sees commit rows of a
co-change. Validation (`paths` an array of non-empty strings without NUL) is shared by the three
reads in the store and in the double.

*Alternative rejected:* extend `neighbors` with `weight` and seed provenance — it changes a read with
many callers and a one-statement recursive query, for a need of one use case.

### D4. Co-change history, no threshold (enrich decision 4)

`history.ts` exports `coChangeHistory(anchorFiles, coChanges)` → `ImpactHistoryEntry[]`: pure, rule
of spec "Co-change history" (both ends, anchor files excluded, max weight, union of PRs, order by
rate then path). No threshold beyond the two shared commits of the edge; only the anchor's files, not
those reached by the traversal (that would mix the signal of the change with that of its
dependants).

### D5. History entry shape in the core (enrich decision 5, destination B → DIS-95)

Core gives one entry per file: `ImpactHistoryEntry { file, coChangeRate, prs: number[], origin: 'git' }`.
The readme §4 shape `history[{ pr, coChangeRate, origin }]` is a projection DIS-95 makes in the HTTP
schema. `ImpactDocEntry` is `{ path: string; stale: false } | { path: string; stale: true; staleSince:
string }`, so a `staleSince` without `stale` cannot be built.

### D6. Documentation staleness

`doc-staleness.ts` exports `relatedDocs(links, commits)` → `ImpactDocEntry[]`: pure, rule of spec
"Related documentation". `impact.ts` computes the report files (distinct `file` of `body.direct` and
`body.indirect`), calls `readDocumentLinks(projectId, reportFiles)`, then — only when some link was
returned — `readFileCommits(projectId, docs ∪ described files)`. Dates are compared as
`getTime()`; ties for `staleSince` broken by sha in byte order (`<` on strings, never
`localeCompare`).

### D7. Where the reads run in `impact.ts`

After `buildReport` and before `assessRisk`, only for answered reports: `readCoChanges` with the
anchor files, `readDocumentLinks` with the report files, then `readFileCommits` when needed. They run
in sequence (one connection pool, determinism of the statement order that the unit tests assert). A
failure of any of them propagates unchanged and, since the row is written after the report, writes
no `query_log` row (spec scenario "A failing history read fails the call without a row"). An
`unknown` report makes none of them. The `ImpactReport` answered variant gains `docs` and `history`
before `risk`.

### D8. CLI output (enrich decision 6)

`packages/cli/src/commands/impact.ts` prints `DOCUMENTACIÓN` and `HISTORIAL` between `TESTS` and
`RIESGO` with the formats of the `cli-impact` spec, through the same terminal-safe helper as the other
lines. The rate is `Math.round(coChangeRate * 100)`. The document line carries no origin tag: its
link is from the graph and its state from git; the `HISTORIAL` lines carry `[git]`, which is the
separation the demo shows.

### D9. The in-memory double

`tests/support/in-memory-store.ts` implements the three reads over its stored `KnowledgeGraph`
(`edges`, `files`, `symbols`, `commits`, `fileCommits`), with the same validation, ordering and
`ProjectNotFound`, and counts each in `calls` (`readCoChanges`, `readDocumentLinks`,
`readFileCommits`). The unit scenarios of `impact` build their commits with it.

### D10. No ADR

The decisions are local to the impact module, the port gains reads in the style of the existing ones,
and everything is cheap to revert.

## Risks / Trade-offs

- [Q2's DoD said `docs/pricing.md` stale; the report shows `README.md` current] → D1: the fixture row
  is corrected, the stale path is proven over the seed with an added commit, the drift of
  `docs/pricing.md` is DIS-71's.
- [`readFileCommits` returns every dated commit of the docs and described files] → bounded by the
  report's files; acme-shop has 32 commits in total.
- [A document whose own commits are undated is never stale] → the ticket's rule; the seed's commits
  all carry a date.
- [Commit dates compare committer time, which a rebase can reorder] → accepted; the history is what
  the store holds.
- [Adding three methods to `StorePort` breaks typed doubles] → the doubles built `as unknown as
  StorePort` or by spreading the in-memory double compile unchanged; `npm run typecheck` finds any
  other (task 8.1).

## Migration Plan

None: no migration, no seed or golden regeneration. Rollback is reverting the merge.

## Follow-ups

*Agent's text: decisions taken by the agent as lead engineer in the autonomous run
(`docs/AUTONOMOUS-RUN.md` §6), without the author. E1–E7 are the DIS-94 enrich decisions 1–7
(comment of 2026-11-02 in the ticket); P1–P6 are design decisions of this proposal. Destinations: A =
this change; B = another existing ticket; C = the author; D = accepted and recorded.*

| Id | Decision | Destination |
|---|---|---|
| E1 | (1) Q2's stale document: `docs/pricing.md` has no `describes`, so `docs` over the seed is `README.md` current; the stale case is proven with an added commit in the test transaction; the Q2 row of `fixtures/README.md` is corrected here (design D1). | A |
| E1b | (1) `docs/pricing.md` never enters `docs`: its drift is Q5 of DIS-71. | D — accepted |
| E2 | (2) `D` stale documents; `LOW` → `MEDIUM` when `D ≥ 1`; the rationale clause only when `D ≥ 1` (design D2). | A |
| E3 | (3) `lastCommitTouching` replaced by `readFileCommits`, plus `readCoChanges` and `readDocumentLinks` (design D3). | A |
| E4 | (4) No `coChangeRate` threshold; only the anchor's files (design D4). | D — accepted |
| E5 | (5) Core history entry per file; the readme §4 projection is DIS-95's (design D5). | B — DIS-95 |
| E6 | (6) The CLI prints `DOCUMENTACIÓN` and `HISTORIAL` between `TESTS` and `RIESGO` (design D8). | A |
| E7 | (7) The `docs/DEMO.md` Paso 4 captures in a new PowerShell terminal are the author's; the agent runs the same commands in Git Bash (task 10.6). | C — author |
| P1 | A co-changed file is listed in `history` even when it is also in `direct`/`indirect`: the two origins are independent signals, and the parent AC forbids only mixing them in one list. | A |
| P2 | A `co_changed` edge without `weight` is ignored (DIS-36 always writes one; a null would be a store anomaly). | A |
| P3 | Each history read is one statement that also checks the project (`ProjectNotFound`), as the existing reads. | A |
| P4 | `readFileCommits` is skipped when no document is related, so a report without documents costs two statements more, not three. | A |
| P5 | `ImpactDocEntry` is a discriminated union on `stale`, so `staleSince` exists only on stale entries. | A |
| P6 | No ADR (design D10). | D — accepted |
