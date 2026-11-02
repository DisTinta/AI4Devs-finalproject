# Verify against spec: impact-history-docs

- Date: 2026-11-02
- Change: impact-history-docs (DIS-94), PR #94
- Step: 13.4 `/verify-against-spec`, inline mode (`docs/AUTONOMOUS-RUN.md` §6)

*Agent's text: written by the agent of the autonomous run, without the author. Compared: the three delta specs
(`specs/impact/spec.md`, `specs/graph-store/spec.md`, `specs/cli-impact/spec.md`) against
`git diff origin/final-project-CRN...HEAD` at `0a6b840`, plus the two test fixes of this step.*

## 1. Requirements implemented correctly

| Requirement | Code | Test that proves it |
|---|---|---|
| impact "Co-change history": both ends, anchor files excluded, max weight, union of PRs, order rate then byte order, no threshold | `packages/core/src/impact/history.ts:18-33`; anchor files and the read at `packages/core/src/impact/impact.ts:71-72` | `tests/unit/impact/history.spec.ts:37` and the three following scenarios; extra cases from line 120 |
| impact "Related documentation": report files = files of `direct` ∪ `indirect`, strictly later, undated ignored, `staleSince` earliest then smaller sha, stale first then path | `packages/core/src/impact/doc-staleness.ts:20-39`; `packages/core/src/impact/impact.ts:73-75` | `tests/unit/impact/doc-staleness.spec.ts` (the six scenarios and the extra cases) |
| impact "Report by component" (modified): answered `{ status, direct, indirect, tests, docs, history, risk }`; unknown without `docs`/`history` and without the reads | `packages/core/src/impact/impact.ts:76` (`{ ...lists, docs, history }` then `risk`); `packages/core/src/impact/impact-report.ts:78-84` | `tests/unit/impact/impact.spec.ts:234` |
| impact "Risk level of a report" (modified): `D` from `docs`, `LOW` → `MEDIUM` only, the clause only when `D ≥ 1` | `packages/core/src/impact/risk.ts:49-52` | `tests/unit/impact/risk.spec.ts:435`, `:449`, `:463`, extra cases `:477`, `:492`; the DIS-90 scenarios `:53`–`:234` unchanged and green |
| impact "History and documentation over the indexed acme-shop seed" | the Postgres reads below | `tests/integration/impact/acme-shop.spec.ts:89`, `:112`, `:120` |
| graph-store "Contract of the history reads": check order, one statement, project isolation, empty/unknown/duplicate paths, no author data | `packages/adapters/store-postgres/src/postgres-store.ts:365-383`; statements `packages/adapters/store-postgres/src/queries.ts:157`, `:181`, `:199`; double `tests/support/in-memory-store.ts` (`historyArguments`) | `tests/integration/store/graph-read.spec.ts:1331`, `:1349`, `:1373`, `:1387`; `tests/unit/store/in-memory-store.spec.ts:714`, `:757`, `:780` |
| graph-store "Co-change read": `weight IS NOT NULL`, file-to-file only, PRs of commits of the project linked to both files | `queries.ts:157-175` | `graph-read.spec.ts:1223`, `:1239`, `:1265` |
| graph-store "Document link read": `doc` sources only, file or symbol targets, distinct | `queries.ts:181-193` | `graph-read.spec.ts:1286` |
| graph-store "File commit read": dated commits only, order path / date / sha | `queries.ts:199-210` | `graph-read.spec.ts:1309` |
| graph-store "Validation of read arguments" (modified): `paths` | `packages/core/src/knowledge/read-arguments.ts:47-55`; `packages/core/src/knowledge/errors.ts` (`'paths'`) | `graph-read.spec.ts:1202`; the three existing scenarios `:1143`, `:1169`, `:1186` unchanged |
| cli-impact "Impact report output" (modified): the two sections between `TESTS` and `RIESGO`, `al día` / `desactualizado desde <7>`, `co-cambia <rate> %`, `PR #a, #b` / `sin PR`, `[git]` | `packages/cli/src/commands/impact.ts:128-133`, `:156-166` | `tests/unit/cli/impact-command.spec.ts:254`, `:319`, `:369`; `tests/integration/cli/impact-command.spec.ts:154` |
| cli-impact "Impact terminal safety" (modified) | `impact.ts:157-158`, `:165` (every path and the 7 sha characters through `terminalSafeText`) | `tests/unit/cli/impact-command.spec.ts:478`, `:491` |

The running system matches as well (report `2026-11-02-show-spec-working.md`).

## 2. Requirements missing or partial

None missing. Two scenarios had a test that asserted less than the scenario states; both fixed in this step:

- impact "Q2 history over the seed", its AND: "`direct`, `indirect` and `tests` are those of the scenario
  'Q2 is reproduced over the seed'". `tests/integration/impact/acme-shop.spec.ts:96-98` checked only the symbols
  of `indirect`, while "Q2 is reproduced over the seed" (`:49-51`, `:55`) checks `hops` 2, `heuristic` and the
  absence of `OrderObserver`. **Fixed:** the test now makes the same `indirect` checks (green against
  `codemind_test`, 7/7).
- cli-impact "Impact report output", the existing test "prints the entries of indirect and tests, a file test
  once, and an empty tests list": its last assertion went from `'TESTS\n  (ninguno)\n\nRIESGO HIGH'` to
  `'TESTS\n  (ninguno)\n\nDOCUMENTACIÓN'`, so it no longer checked that `RIESGO` follows (task 7.1 said only the two
  new sections would change). **Fixed:** `tests/unit/cli/impact-command.spec.ts:316` now expects the full run
  `TESTS`, `DOCUMENTACIÓN`, `HISTORIAL` (each `(ninguno)`) and `RIESGO HIGH` (green, 22/22).

## 3. Unspecified behaviour

- `coChangeHistory` and `relatedDocs` are exported from the core root (`packages/core/src/impact/index.ts:4-5`).
  No spec asks for it; design D3/D4/D6 and task 3.3 do, as for every other export of the module. **Kept**, decided
  in the design.
- `ReportLists` (`packages/core/src/impact/relevance.ts:9`): `buildReport` now returns the lists without `docs` and
  `history`. Internal type, no behaviour; design Follow-ups A4. **Kept.**
- `seeds/graph-dump.sql` (one header line, `analyzer-fingerprint`) and `seed.analyzerFingerprint` of
  `seeds/cache/acme-shop.json` and `seeds/cache/task-api.json` changed, while the proposal and design Non-Goals say
  "no seed or golden regeneration". The rows are identical; the fingerprint changes because `knowledge/` and
  `store-postgres/src` are fingerprint inputs, and `npm run verify` fails with it stale. Already decided in design
  Follow-ups A1 (A) and A2 (C, optional regeneration by the author). **Kept**; the Non-Goal wording is the plan's,
  the decision supersedes it and is recorded.
- The CLI prints `DOCUMENTACIÓN` for the task-api command (design Follow-ups A5): it is what the cli-impact
  requirement asks for every answered report; the spec only did not fix its content. Not scope beyond the spec.

Specific checks:

- No dependency imported outside the manifests: the diff adds no import of a new package.
- No authorisation check is required by the specs; none is missing.
- No response field beyond the spec: `ImpactHistoryEntry` is exactly `{ file, coChangeRate, prs, origin }`,
  `ImpactDocEntry` exactly `{ path, stale }` or `{ path, stale, staleSince }`; the store rows are exactly the keys
  of the spec, which the Postgres tests check with `Object.keys`.
- Scenario tests weaker than their scenario: the two of block 2, now fixed. The rest assert the exact value the
  `THEN` states (`toEqual` on `history`, `docs`, the rows and the stdout).

## Scenario → test → state

| Scenario | Test | State |
|---|---|---|
| Files co-changed with the anchor's file are the history | `tests/unit/impact/history.spec.ts:37` | green |
| A co-change whose commits have no pull request has no PR | `tests/unit/impact/history.spec.ts` | green |
| A file of the anchor is not in the history | `tests/unit/impact/history.spec.ts` | green |
| A file co-changed with several anchor files appears once | `tests/unit/impact/history.spec.ts` | green |
| A document older than the code it describes is stale since the first change it missed | `tests/unit/impact/doc-staleness.spec.ts` | green |
| A document touched with or after its code is not stale | `tests/unit/impact/doc-staleness.spec.ts` | green |
| A document described through a file and a symbol appears once | `tests/unit/impact/doc-staleness.spec.ts` | green |
| Stale documents come first | `tests/unit/impact/doc-staleness.spec.ts` | green |
| Without commits no document is stale and the history is empty | `tests/unit/impact/doc-staleness.spec.ts` | green |
| A failing history read fails the call without a row | `tests/unit/impact/doc-staleness.spec.ts` | green |
| Q2 history over the seed | `tests/integration/impact/acme-shop.spec.ts:89` | green (strengthened) |
| Q2 documentation over the seed is current | `tests/integration/impact/acme-shop.spec.ts:112` | green |
| A later change to the price calculator makes the readme stale | `tests/integration/impact/acme-shop.spec.ts:120` | green |
| Q2 is reproduced over the acme-shop subset | `tests/unit/impact/impact.spec.ts:124` | green |
| A component appears once at its minimum distance | `tests/unit/impact/components.spec.ts:211` | green |
| A reached file without symbols is reported by its path | `tests/unit/impact/components.spec.ts:239` | green |
| The anchor's own file is not a dependant | `tests/unit/impact/components.spec.ts:258` | green |
| An unknown report has neither documents nor history | `tests/unit/impact/impact.spec.ts:234` | green |
| A direct component without a test makes the risk high | `tests/unit/impact/risk.spec.ts:53` | green |
| Every direct component tested and exact makes the risk low | `tests/unit/impact/risk.spec.ts:107` | green |
| A covered direct component whose chains are all heuristic makes the risk high | `tests/unit/impact/risk.spec.ts:120` | green |
| A covered direct component with an exact chain beyond its first hop makes the risk medium | `tests/unit/impact/risk.spec.ts:135` | green |
| An untested heuristic direct component makes the risk high | `tests/unit/impact/risk.spec.ts:173` | green |
| The rationale counts in the singular | `tests/unit/impact/risk.spec.ts:188` | green |
| A test written file to file covers a direct component | `tests/unit/impact/risk.spec.ts:207` | green |
| The test of an indirect component does not cover a direct one | `tests/unit/impact/risk.spec.ts:234` | green |
| A stale document turns a low risk into medium | `tests/unit/impact/risk.spec.ts:435` | green |
| Two stale documents are counted in the plural | `tests/unit/impact/risk.spec.ts:449` | green |
| A stale document leaves a high risk high | `tests/unit/impact/risk.spec.ts:463` | green |
| The history reads of an unknown project fail | `tests/integration/store/graph-read.spec.ts:1331` | green |
| Each history read is one statement | `tests/integration/store/graph-read.spec.ts:1349` | green |
| Empty and unknown paths give empty history reads | `tests/integration/store/graph-read.spec.ts:1373` | green |
| The history reads never hold another project's rows | `tests/integration/store/graph-read.spec.ts:1387` | green |
| The in-memory double reads the same history | `tests/unit/store/in-memory-store.spec.ts:714` | green |
| Co-changes are read from either end with their pull requests | `tests/integration/store/graph-read.spec.ts:1223` | green |
| Edges of other kinds are not co-changes | `tests/integration/store/graph-read.spec.ts:1239` | green |
| A co-change without weight is not read | `tests/integration/store/graph-read.spec.ts:1265` | green |
| Document links are read through files and symbols | `tests/integration/store/graph-read.spec.ts:1286` | green |
| Dated commits of each path are read in order | `tests/integration/store/graph-read.spec.ts:1309` | green |
| Invalid read arguments are rejected before querying | `tests/integration/store/graph-read.spec.ts:1143` | green |
| An invalid traversal direction is rejected before querying | `tests/integration/store/graph-read.spec.ts:1169` | green |
| An invalid instant for the cost sum is rejected before querying | `tests/integration/store/graph-read.spec.ts:1186` | green |
| Invalid history read paths are rejected before querying | `tests/integration/store/graph-read.spec.ts:1202` | green |
| An impact report is printed by section with its risk | `tests/unit/cli/impact-command.spec.ts:254` | green |
| Documents and history are printed with their state and origin | `tests/unit/cli/impact-command.spec.ts:319` | green |
| Impact receives only the project id, the change and the hop count | `tests/unit/cli/impact-command.spec.ts:369` | green |
| Q2 over the seed is printed with its risk | `tests/integration/cli/impact-command.spec.ts:154` | green |
| Control characters in a report are escaped | `tests/unit/cli/impact-command.spec.ts:478` | green |
| Control characters in documents and history are escaped | `tests/unit/cli/impact-command.spec.ts:491` | green |

49 scenarios, 49 tests with the same name, none absent, none red.
