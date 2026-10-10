# Adversarial review

- Date: 2026-10-10
- Change: context-engine-anchor-expand (DIS-27, PR #33)
- Reviewed range `8cc5dec..e629271` (35 files) plus the uncommitted working tree, by a read-only
  forked agent; its report is saved here by the main session.

## Findings

| Severity | File:line | Finding | Why it matters |
|---|---|---|---|
| Major | `queries.ts:178-193`; `graph-read.spec.ts:428,562,657`; `tests/integration/context/expand.spec.ts` | Only one Postgres test asserts what `'both'` returns (one hop, file seed, one `co_changed` edge), so only the file-incoming branch is exercised. Nothing checks the symbol branches or file-outgoing under `'both'`, or the cycle rule for `'in'`/`'both'`. Changing the guard at `:188` from `IN ('in', 'both')` to `IN ('in')` passes every automated test while `expand` loses callers and the `README.md` that describes the symbol. | `'both'` is the only direction production code uses; Stryker cannot mutate SQL strings; the only proof was the throwaway step-12 script. |
| Major | `anchor.ts:70`; `queries.ts:171-198` | Nothing bounds the work one question causes: one sequential `ILIKE '%term%'` scan per term with no trigram index; no cap on anchor size (a 3-letter term can match much of the project, and every match is a seed); the `walk` CTE enumerates paths (`UNION ALL` + per-path `visited`), and `'both'` makes every edge undirected, so a `co_changed` cluster gives roughly d³ paths per seed at 3 hops. No `statement_timeout`. The design's risk covers result size only. | Once DIS-39 exposes questions, one request can hold a connection or exhaust the database; DIS-28's budget trims after the cost is paid. |
| Minor | `anchor.ts:49,51`; spec "Question terms" | Lengths are UTF-16 code units, not characters: two astral letters pass the 3-character filter, and a long astral token can be cut mid surrogate pair. | The spec and code disagree exactly where the spec was edited to match the code. |
| Minor | `e629271` → spec `:16-21`; design Follow-ups | The spec was edited after implementation (characters, dedup of prefixes); the new rules have no scenario of their own, only extra tests. | Traceable, but no scenario guards them. |
| Minor | `anchor.ts:47`; `expand.ts:33-41` | No runtime checks for untyped callers: a `null` question throws a raw `TypeError`; an anchor without `fileId` becomes a dropped `{type:'file', id: undefined}` seed. | Inconsistent errors until a Zod schema exists at the DIS-39 entry point. |
| Minor | PR #33 checks | CI evidence is for `e88fb4c`; `quality` was pending on `e629271`, which carries the `expand.ts` fix. | No green run on the head being archived yet. |
| Question | working tree | Uncommitted edits: `.claude/settings.json` removes a `Read(.env.*)` deny rule (not part of this change, not authorisable by an agent), plus `tasks.md` and the step-11 report. | Must not be committed with DIS-27 without the user's confirmation. |

Checked and clean: all 36 scenario titles map to exactly one test; every `[x]` up to 15.1 has a
report or commit; the seed commit is still the last fingerprint-input change; modified tests match
MODIFIED scenarios; `neighbors` has no other caller and `'out'` stays the default; hostile inputs
(empty question, invalid `hops`, empty anchor, foreign/unknown seeds, duplicates, repeated and
concurrent requests) are handled. Strongest test: `tests/unit/context/expand.spec.ts:152`.

## Verdict

**PASS WITH GAPS.** No Blockers; two Majors to fix or give a destination before archiving.

## Addendum — destinations and fixes (2026-10-10)

| Finding | Destination | Action |
|---|---|---|
| Major 1: `'both'` under-tested on Postgres | A — fixed here | Extra integration cases in `graph-read.spec.ts` assert `'both'` from a symbol seed (incoming `calls` and `describes`, outgoing `calls`), from a file seed (outgoing), and cycles at 3 hops under `'in'` and `'both'`; seen failing with the `:188` guard mutated to `IN ('in')` |
| Major 2: unbounded work per question | B — DIS-28 and DIS-39 | Spanish hand-off comment on DIS-28 (cap terms and anchor symbols; per-depth node dedup in `walk` or a `statement_timeout`; trigram index on `symbol.name` or accept the scans) with a note on DIS-39 for the entry point; recorded in design Follow-ups |
| Minor: UTF-16 code units | A — fixed here | `questionTerms` counts and slices by code point (`[...token]`); test with astral letters |
| Minor: spec edited after implementation | D — accepted | Author decision recorded in the verify addendum; the extra tests in `anchor.spec.ts` guard the rules |
| Minor: no runtime checks in `anchor`/`expand` | B — DIS-39 | Same decision as the DIS-24 hand-off: TypeScript types bind core callers, and the untyped entry point (DIS-39) validates before calling; included in the DIS-39 note |
| Minor: CI on head | A — closed | A green `quality` run on the final head is linked in the step-11 report before archiving |
| Question: `.claude/settings.json` | — | Left uncommitted; the author decides |
