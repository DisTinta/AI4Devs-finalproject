# Adversarial review — claims-and-typing (DIS-38)

- Date: 2026-10-11
- Change: claims-and-typing (DIS-38), PR #36
- Scope: commits `bc2c80a..7e4fb2d` (15 DIS-38 commits on `feature/DIS-38-claims-and-typing`) plus
  the uncommitted working tree. Hostile inputs were run in memory with `node -e` against zod 4.6.5;
  nothing was written to disk.
- Run by: `/adversarial-review` (forked, read-only: the main session saved its report verbatim and
  confirmed by hand the Major, the sparse-chain Minor and the NUL byte before acting on them).

## Verdict

**PASS WITH GAPS.** No Blocker. One Major (the unbounded `issues` list), introduced by this change in
a security boundary, so it is fixed now rather than deferred.

## Findings

| Severity | File:line | Finding | Why it matters |
|---|---|---|---|
| Major | `packages/core/src/explain/statement-schema.ts:58` | The event's `issues` list has no upper bound. Zod checks every array element even after `.max(MAX_STATEMENTS)` failed. `{"answer":"a","statements":[{},{},…]}` with 21 000 elements is 63 029 bytes (under 65 536) and gives 42 001 issues, 2 434 820 bytes of serialised issues (~39× the input). | The quarantine bounds adversarial output, but turns a 63 KB output into a 2.4 MB audit event; the transport logs the event (readme §2.5), so a prompt-injected output can flood the log. The spec bounds issue counts for checks 1, 2, 4, 5, not 3. |
| Minor | `packages/core/src/explain/typing-rules.ts:28-29` | The guard only rejects `length === 0`. A sparse chain (`new Array(1)`) has length 1 and `every` skips holes, so it returns `FACT` with no span cited. | spec: an empty chain is "rejected at run time … never typed as a fact". Same fail-open as the empty-chain bug of `e672529`; no test. |
| Minor | `specs/claims-and-typing/spec.md:12-13`; `design.md` Follow-ups | The spec says the records accept "exactly" what the tables accept, but `z.string()` accepts `\u0000` and Postgres `text`/`jsonb` reject it (`subject`, `predicate`, `object`, `excerpt`, `provenance.model`). design.md classifies it "C, owner DIS-39"; per `docs/project-context.md` → Tracking deferred findings, a later ticket that owns the gap is B. | The normative sentence is false as written and the destination is mislabelled. |
| Minor | `design.md` Follow-ups | The file holds a literal NUL byte (0x00) between backticks; `grep` reports "Binary file matches". | It would be carried into the archive; text tools treat the file as binary. Write `\u0000` as text. |
| Minor | `.claude/sdd-harness.env:50` (uncommitted) | The working tree has `KIT_PROTECT_SPECS="0"`; the file says "do not commit it as 0". | Spec/test protection is off while 13.3 fixes are made; a careless `git add -A` would commit it. |
| Minor | `tasks.md:17,27`; step 9 report | Tasks 2.3 and 3.3 are `[x]` "RED → GREEN", but the step 9 report says both were green on arrival. | Evidence does not match the task wording; the report discloses it. Process debt, not a Linear item. |
| Question | `spec.md` (`abf373c`, `d6399f6`) | The spec was edited after the code (code points in `abf373c`; `d6399f6` specified existing behaviour after `e672529`). Several new normative sentences have no `#### Scenario`: fail-closed unknown origin, run-time empty-chain error, line maximum, L1 null provenance, reversed span on `endLine`; their tests are named "Not a scenario". | The author confirms whether they stay as unscenario'd normative text (D) or get scenarios before sync. |
| Question | `packages/core/src/knowledge/claim.ts:27`; `packages/core/src/knowledge/evidence.ts:7` | `inputSpanSchema` and `SPAN_LINE_MAX` are public exports; the spec's export list does not name them. | Public surface DIS-39 will start depending on. |

## What was checked and found sound

- Spec alignment: 21 scenarios, 21 tests with the same names; the four enums match
  `0002_history-claims.up.sql` lines 6–9; the three `CHECK`s mirrored at compile and run time.
- Hostile input: a parsed top-level `__proto__` key gives `unrecognized_keys` at path `[]` (no key
  name leaks); JSON `null` and `[]` give `invalid_shape`; a datetime without zone and `2026-02-30T…`
  are rejected; `NaN` rejected, `-0` accepted (Postgres accepts it too); code-point lengths confirmed
  (`node_modules/zod/v4/core/checks.js:271-273`); only `path.join('.')` and `code` reach the event.
- Blast radius: no caller in `packages/` yet (DIS-39); no migration; the seed diff is the
  `analyzer-fingerprint` line only; no pre-existing test modified.
- Evidence quality: "An extra field discards the whole output" (`statement-schema.spec.ts:68`)
  kills `z.strictObject` → `z.object` on the nested statement; Stryker 95.21 %; the reversed
  empty-chain test is justified as A in design.md Follow-ups.

## Recommended next steps (as proposed by the review)

1. A — Major: add a requirement and scenario that bound the event's issues, then fix with TDD (the
   21 000-element case red first). No `knowledge/` change, no seed regeneration.
2. A — sparse chain: reject holes, test red first, extend the spec sentence.
3. B — NUL in text fields: name the exception and its owner (DIS-39) in the spec; C → B in design.md;
   confirm the DIS-39 comment.
4. A — replace the raw 0x00 in design.md with the text `\u0000`.
5. Process: `KIT_PROTECT_SPECS="1"` before committing 13.3 fixes; keep the 2.3/3.3 note as is.
6. D or A — the Question rows, decided by the author.
7. Re-run `/verify-against-spec` (addendum), then 11.2 and 13.4 before `/opsx:archive`.

## Main-session confirmation

- Major: `JSON.stringify({ answer: 'a', statements: Array(21000).fill({}) })` is 63 029 bytes.
- Sparse chain: `typeStatement(new Array(1))` printed `FACT`.
- NUL byte: `od -c` on the Follow-ups line of design.md shows `` ` \0 ` ``.
