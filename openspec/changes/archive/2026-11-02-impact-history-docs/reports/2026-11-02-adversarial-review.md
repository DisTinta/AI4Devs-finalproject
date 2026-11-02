# Adversarial review: impact-history-docs

- Date: 2026-11-02
- Change: impact-history-docs (DIS-94), PR #94
- Step: 13.5 `/adversarial-review`, inline mode (`docs/AUTONOMOUS-RUN.md` §6)

*Agent's text: written by an agent of the autonomous run, without the author, in a new step that did not write
the implementation. Read: proposal, design, tasks, the three delta specs, `git diff origin/final-project-CRN...HEAD`
(46 files) and the history of the change (`git log origin/final-project-CRN..HEAD`).*

## Adversarial review

### Findings

| Severity | File:line | Finding | Why it matters |
|---|---|---|---|
| Minor | `tests/unit/cli/impact-command.spec.ts:316` | An existing assertion was weakened: `toContain('TESTS\n  (ninguno)\n\nRIESGO HIGH')` became `toContain('TESTS\n  (ninguno)\n\nDOCUMENTACIÓN')`, so the test stopped checking that `RIESGO` follows; task 7.1 announced only the two new sections. | A test changed in the change asserted less than before. **Fixed** in this step: it now expects `TESTS`, `DOCUMENTACIÓN`, `HISTORIAL` (each `(ninguno)`) and `RIESGO HIGH` in sequence. |
| Minor | `tests/integration/impact/acme-shop.spec.ts:96` | "Q2 history over the seed" says in its AND that `direct`, `indirect` and `tests` are those of "Q2 is reproduced over the seed", but the test checked only the `indirect` symbols, not `hops` 2 and `heuristic`, nor the absence of `OrderObserver`. | A change to the walk caused by the new reads would have passed. **Fixed**: the same `indirect` checks as `:49-51`, `:55`. |
| Minor | `packages/core/src/impact/doc-staleness.ts:32` | `Math.max(...own)` spreads every dated commit of one document into a call; V8 throws `RangeError` above roughly 10^5 arguments. | Only a document touched by more than ~100 000 commits would fail; the seeds have 60 commits in all and the read is bounded by the report's files (design Risks). **Deferred, D — accepted**. |
| Question | `seeds/graph-dump.sql:1`, `seeds/cache/*.json` | The design Non-Goals say "no seed or golden regeneration", yet the seed header and the golden `seed.analyzerFingerprint` changed. | Answered in the code and the design: the rows are identical, the fingerprint inputs changed (Follow-ups A1, A2), `npm run verify` and the `verify` CI job pass. No action beyond A2 (C, optional). |

### What was checked to reach this

1. **Spec and task alignment.** 49 scenarios, 49 tests of the same name (table in
   `2026-11-02-verify-against-spec.md`). No task marked `[x]` lacks its evidence: the step 9 and 10 reports exist
   and list the totals, the Stryker run and the manual commands; 13.x were open. The code does nothing the specs
   do not ask for beyond what the design decided (exports, `ReportLists`, the fingerprint refresh). The specs were
   not edited after implementation: the implementation commit `0a6b840` touches `design.md` and `tasks.md` only
   among the artifacts, and the three `specs/` files last changed in the audit rounds before it.
2. **Hostile input**, read in the code:
   - empty `paths` → `ANY('{}')` matches nothing, the `LEFT JOIN LATERAL … ON true` keeps the project row, the mapper
     drops it (`read-graph.ts`, `toCoChanges` / `toDocumentLinks` / `toFileCommits`); an anchor with no file never
     happens (anchors are symbols);
   - a report with no document → `readFileCommits` not called (`impact.ts:75`, test "does not read file commits when
     no document is related");
   - a co-change between two anchor files, or a self edge → skipped by `fromAnchor === anchors.has(toPath)`
     (`history.ts:23`);
   - a commit at the same instant as the document's latest → not stale (`>` at `doc-staleness.ts:34`); shown on the
     real database in `2026-11-02-show-spec-working.md` E3, with an undated commit too;
   - a `NULL` weight → filtered in SQL (`queries.ts:171`) and in the double;
   - a malformed id, an unknown id, an invalid `paths` with an unknown id → order of checks
     (`postgres-store.ts:365-383`), tests `graph-read.spec.ts:1331`, `:1202`, `in-memory-store.spec.ts:757`;
   - a subject who owns nothing (another project's rows) → every join filtered by `$1`, including the
     cross-project `file_commit` case (`graph-read.spec.ts:1387`);
   - the same request twice or two at once → three read-only statements, no shared state; the only write is the
     existing `query_log` row, written after the report, and a failing read writes none (test "A failing history
     read fails the call without a row" and its extra cases);
   - control characters in a path or a sha → `terminalSafeText` (`impact.ts:157-165`).
3. **Blast radius.** `StorePort` gains three required methods: its only production implementation is the
   Postgres store; the doubles compile (`npm run typecheck` in the `quality` job). `ImpactReport` answered gains two
   required keys: its only consumer is the CLI (`packages/api/src` has no impact route; DIS-95). `buildReport` has one
   caller (`impact.ts:68`). `assessRisk` has one caller (`impact.ts:87`); with `D = 0` every DIS-90 rationale is
   unchanged (the DIS-90 tests are untouched and green). No migration. `query_log` rows are unchanged in shape.
4. **Evidence quality.** The tests assert behaviour (`toEqual` on `history`, `docs`, the store rows and the whole
   stdout), not the implementation. The most important one, "A document older than the code it describes is stale
   since the first change it missed", feeds `c2` before `c1` and expects `c1`: it kills a descending sort of
   `missed`, a `>=` instead of `>` is killed by "A document touched with or after its code is not stale", and
   dropping `stale === 0` from the `LOW` branch of `risk.ts:52` is killed by "A stale document turns a low risk into
   medium". The CI `mutation` job passed on PR #94. Existing tests modified: `tests/unit/explain/explain.spec.ts`
   (three exact `calls` assertions gain three keys at 0: stronger), `tests/unit/cli/impact-command.spec.ts` and
   `tests/integration/cli/impact-command.spec.ts` (the new sections, announced in tasks 7.1 and 7.5); all justified
   by task 8.1, and the one weakened assertion is fixed above.

### Verdict

PASS — no Blockers and no Majors, evidence is sufficient. The two test Minors are fixed in this PR; the
`Math.max` Minor is deferred with destination D in `design.md` → Follow-ups.

### Recommended next steps before archiving

1. Commit the two test fixes and the three reports to PR #94; wait for the CI.
2. `/opsx:archive` (task 13.7) with the `## Purpose` update of `openspec/specs/impact/spec.md`.
3. The author's items stay as recorded: E7 (PowerShell captures of `docs/DEMO.md` Paso 4, C) and A2 (optional
   golden regeneration, C).
