## What changes?

A pure core rule, `coChangeEdges(fileCommits, knownPaths)` in `packages/core/src/knowledge/co-change.ts`,
derives one `co_changed` edge per pair of files that share at least 2 commits. Each edge has
`weight` = Jaccard of their commits, `resolution` `heuristic`, `extractor` `git`, and `source` = the
path smaller in byte order. Commits with more than 100 files are ignored, and line counts and author
data are never used. The edges persist through the existing `StorePort.saveGraph`, so there is no new
port and no migration. `fixtures/build-history.mjs` now makes every file a manifest entry lists
really change in its commit: task-api's built history was missing two of the documented co-change
links.

## Why?

GitPort.readHistory (DIS-35) already delivers every commit and the files it touched, but nothing turns that history into the co_changed edges the graph schema has had since DIS-21. Without them the impact report (DIS-94) cannot show the historical coupling [git] that static analysis misses — above all in PHP/Laravel, where DiscountService.php and ShippingService.php change together with no static edge between them. This is DIS-36 (CM-HU-03.2), a slice of CM-HU-03 (DIS-25).

## How to test it?

1. `docker compose up -d` and wait until Postgres is healthy.
2. `export DATABASE_URL=postgres://codemind:<password>@localhost:5432/codemind` (the value from `.env`).
3. `npm run db:migrate` (migrations `0001`–`0003`; this PR adds none).
4. `npx vitest run tests/unit/knowledge tests/integration/git` → 7 files, 89 tests passed. The git
   spec rebuilds both fixtures' `.git` itself in `beforeAll`.
5. `npx vitest run` → 17 files, 249 tests passed.
6. `npm run typecheck`, `npm run lint`, `npm run lint:architecture`, `npm run docs:coverage` → exit 0.
   Lint shows 2 pre-existing warnings on the empty `AnalyzerPort` / `LlmPort`, and architecture
   shows 6 pre-existing `no-orphans` warnings.
7. `npx stryker run` → `co-change.ts` 98.59 % (1 equivalent survivor), all core files 92.23 %
   (threshold `MIN_MUTATION_SCORE=70`).
8. `node fixtures/build-history.mjs`, then `git -C fixtures/acme-shop rev-parse HEAD` →
   `4f028db4d51a3321031f3a24b3f36240410ed38c` (unchanged by this PR).
   `git -C fixtures/task-api log --oneline --name-only -- src/schemas/task.schema.ts src/services/task.service.ts`
   → both files in `(#15)`, `(#31)` and `(#40)`.
9. Optional end-to-end driver: `npx tsc --build`, then
   `npx tsx openspec/changes/co-change-edges/reports/2026-10-01-demo.mts` → `ALL PASS`, and it
   deletes its two demo projects.
10. Check the shared database is back to its baseline: `project`, `file`, `edge`, `commit` and
    `file_commit` have the same row counts as before step 4.

## Decisions / trade-offs

- **The rule is a pure function in core** (design D1). It is not a `GitPort` method and not SQL over
  `file_commit`, so the formula is mutation-tested and the store needs no new port.
- **One canonical edge per pair, `heuristic`, support ≥ 2, cap at 100 files** (D4). The author
  validated these on 2026-10-01. Without the support threshold, acme-shop's bootstrap commit alone
  would create 10 spurious pairs. Because `neighbors` follows source → target only, consumers needing
  symmetry query both endpoints (DIS-94) until DIS-89 adds reverse traversal.
- **Byte order = code-point order** (D3). This matches the store's `COLLATE "C"`. It is not JS
  UTF-16 order, which differs above U+FFFF.
- **Paths outside `knownPaths` count in denominators but are never endpoints** (D5). Every edge
  therefore passes `validateGraph`, and renamed-away paths do not inflate weights.
- **Co-change edges must go in the same `saveGraph` snapshot as the analyzers' edges.** `saveGraph`
  replaces all of a project's edges. This is documented for DIS-85 in TSDoc, `docs/project-context.md`
  and a Linear hand-off.
- **Fixture builder fix (D9, scope expansion approved by the author).** `build-history.mjs` used to
  write unchanged content, so Git dropped the link: #15's schema re-touch and #31's
  byte-identical `r40` service snapshot. A non-final no-op re-touch now gets the `hist:rN` marker. A
  final touch that changes nothing fails the build. acme-shop rebuilds to the same `HEAD`.
- **No ADR** (D8): the change is local to one module and cheap to revert.

## Traceability

| Scenario in the specification | Test that covers it |
|---|---|
| Files changed together form a weighted edge | `tests/unit/knowledge/co-change.spec.ts:15` |
| A single shared commit is not enough | `tests/unit/knowledge/co-change.spec.ts:29` |
| Each pair yields one edge from the smaller path | `tests/unit/knowledge/co-change.spec.ts:47` |
| A path outside the snapshot yields no edge but still counts | `tests/unit/knowledge/co-change.spec.ts:68` |
| A commit with more than 100 files is ignored | `tests/unit/knowledge/co-change.spec.ts:83` |
| A commit with exactly 100 files is counted | `tests/unit/knowledge/co-change.spec.ts:94` |
| An empty history yields no edges | `tests/unit/knowledge/co-change.spec.ts:106` |
| Duplicate links in one commit count once | `tests/unit/knowledge/co-change.spec.ts:114` |
| Author hash and line counts do not affect co-change | `tests/unit/knowledge/co-change.spec.ts:132` |
| The documented fixture pairs are persisted | `tests/integration/git/simple-git-history.spec.ts:393` |

Spec: `openspec/changes/co-change-edges/specs/git-history/spec.md`, 10 scenarios ↔ 10 tests with the
same name. Two extra boundary tests (`co-change.spec.ts:159`, `:178`) pin the ordering rule against
mutants. Evidence lives in `openspec/changes/co-change-edges/reports/`: step 8 and 9 reports, the
show-spec-working report and the demo transcript. Linear: DIS-36 (parent DIS-25).

## Origin

agent+human-review

🤖 Generated with [Claude Code](https://claude.com/claude-code)
