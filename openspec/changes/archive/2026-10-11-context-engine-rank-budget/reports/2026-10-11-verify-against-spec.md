# Verify against spec: context-engine-rank-budget (DIS-28)

Run by `/verify-against-spec` in a read-only forked session; saved by the main session verbatim
(paths shortened to repository-relative). Findings are resolved in `design.md` → Follow-ups and in the
addendum at the end of this file.

**Scope and evidence**
- Compared branch `feature/DIS-28-context-engine-rank-budget` with `origin/feature/entrega-2-CRN` (PR #34) against the three delta specs in `openspec/changes/context-engine-rank-budget/specs/`.
- Local HEAD is `6e1546e`. The PR head is `27f90d7`. The one extra local commit only touches docs.
- The last commit that changed code or tests is `a236e86`. The step-14 report records the full suite at that commit: 1010/1010 tests passing, and the property test passing with `CI=1`. Not re-run (read-only session).
- Three working-tree changes are not on the branch and must stay out of the PR: `.claude/sdd-harness.env`, `.gitignore` (7 lines removed) and the untracked `proposal-codemind/`.

**Overall:** every one of the 75 scenarios has a test named after it, and all are green. Block 3 is not empty. The one real problem is in the git adapter: some git failures are reported as `missing` when the spec says they must propagate as errors.

## 1. Requirements implemented correctly

**context-engine**

| Requirement | Code | Test that proves it |
|---|---|---|
| Lexical anchoring: at most 16 terms, at most 32 anchor symbols, the ones matching most terms kept, returned in first-found order | `packages/core/src/context/anchor.ts:71-105` | `tests/unit/context/anchor.spec.ts:177`, `:191`, `:213`; earlier scenarios at `:80-126` |
| Candidate ranking: sort key distance, origin, file kind, lexical match, input order; no weights | `packages/core/src/context/rank.ts:23-79` | `tests/unit/context/rank.spec.ts:31` checks the full order; `:65-111` checks each key |
| Token estimate: code points ÷ 4, rounded up; estimator `chars-div-4` | `packages/core/src/context/tokenizer.ts:7-22` | `tests/unit/context/tokenizer.spec.ts:8`, `:21`, `:26` |
| Token budget: spans are atomic, greedy with skip, contained or crossing spans dropped, containing spans replace | `packages/core/src/context/budget.ts:62-92` | `tests/unit/context/budget.spec.ts:16`, `:29`, `:43`, `:56`, `:70` (fast-check, 200 runs, seed `20261011` in CI), `:105-171` |
| Whole-file span for a file candidate | `packages/core/src/context/context-pack.ts:203-226` | `tests/unit/context/context-pack.spec.ts:354`, `:321` |
| Context pack: validation before any store call, `no-anchor` / `over-budget`, redaction, baseline, root resolution, no `cwd`, each file read once | `packages/core/src/context/context-pack.ts:149-201` | `tests/unit/context/context-pack.spec.ts:91-304`; `tests/integration/context/context-pack.spec.ts:87`, `:105` |
| Fields of the pack and of each span | `packages/core/src/context/context-pack.ts:28-88` | `tests/unit/context/context-pack.spec.ts:119-128` (exact equality on an empty pack) |

**graph-store**
- Symbol search carries `fileKind`: `queries.ts:126-129`, `read-graph.ts:52,71`; tests `graph-read.spec.ts:342` plus its in-memory-double copy.
- Traversal carries `resolution`, with bounded work: the `walk` / `nearest` / `reached` part of `NEIGHBORS` (`queries.ts:~175-220`) and `read-graph.ts:95-101`; tests `graph-read.spec.ts:696`, `:712`, `:725`, `:762` (the plan's `Recursive Union` produces at most 320 rows).
- The other 18 scenarios of the two modified requirements stay green at `graph-read.spec.ts:252-793`.

**repository-indexing**
- `readFileAt`: `packages/adapters/git/src/git-source-tree.ts:103-168`, port `packages/core/src/ports/SourceTreePort.ts:39-54`, error `packages/core/src/knowledge/errors.ts:102-129`; tests `git-source-tree.spec.ts:573`, `:593`, `:624`, `:639`, `:664`, `:687`, `:717`.
- The `readFiles` scenarios still pass at `git-source-tree.spec.ts:72-417`.

## 2. Requirements missing or partial

1. **Partial: `readFileAt` hides some git failures as `missing`.** The spec says (`repository-indexing/spec.md:179`) *"Any other git failure propagates as an error."*; `missing` covers only *"`commit` names no commit … or `path` names no entry … or names an entry that is not a regular file"* (`:174-175`).
   - `git-source-tree.ts:112` (`|| entry.missing`) turns a blob object git cannot read (`ls-tree -l` prints `BAD`) into `SourceUnavailable('missing')`; `readFiles` propagates git's error for the same case (`:82-83`).
   - `git-source-tree.ts:159-166`: when `ls-tree` fails and the `cat-file -e` probe also fails for any reason (git missing, a permission error, a broken object store), the result is `missing` instead of git's error.
   - No test covers either path.
2. **Partial: "the replacing span SHALL take the place of the first span it replaces"** (`context-engine/spec.md:126-127`). Implemented (`budget.ts:85-88`), but no test has a span ranked after the replaced one, so appending would also pass.
3. **Requirement bullets with no test:**
   - No log of the question or span text (`context-engine/spec.md:216`, `:23`): only a grep guard in the step-14 report.
   - `readFileAt`: 64-character object ids accepted; rejection of `.` segments and NUL; the process count does not depend on the file size; the caller's git environment variables do not change what is read (`repository-indexing/spec.md:166-169,180-182`).
   - Context pack: `hops` defaults to 2 (`context-engine/spec.md:184-185`).
   - Context pack: a project id that is not a UUID fails with `ProjectNotFound` (`:207`); tested only through `anchor`.
   - Span `text` keeps each line *"as stored"* (`:192`), CRLF included; no test uses CRLF.

## 3. Unspecified behaviour

1. `readFileAt` maps git failures to `missing` (block 2, item 1); contradicts the spec, so propagate.
2. An annotated tag id is accepted as a commit: `${commit}^{commit}` (`git-source-tree.ts:156,160`) peels it.
3. An empty file counts as one line (`context-pack.ts:123-128`): in design D9 and pinned by `context-pack.spec.ts:321`, not in the spec. Recommend adding it to the spec.
4. Symbol lines past the end of the file are silently cut short (`context-pack.ts:208-210`); spec silent, noted as a risk in `design.md:266`, untested.
5. Validation order is fixed (`workspaceRoot`, `tokenBudget`, `hops`, `context-pack.ts:155-159`); the spec only says validation comes first.
6. A `no-anchor` pack always has `omitted: 0` (`context-pack.ts:164`); the spec requires the field but not its value.
7. Public API beyond the spec, re-exported from `@codemind/core`: `normaliseText`, `candidateFileKind`, `fitToTokenBudget` / `CutSpan` / `FittedSpans`, `TOKEN_BUDGET_MIN/MAX/DEFAULT`, `DEFAULT_CONTEXT_HOPS`, `MAX_QUESTION_TERMS`, `MAX_ANCHORS`. Most are named in design D9; confirm they are meant to be public.

## Specific checks

- Dependencies not in the manifest: none. `fast-check` is in the root `devDependencies` (4.10.2, with `pure-rand` 8.4.2), declared in the proposal and design D11.
- Authorisation: none required. The pack reads whatever `rootPath` is stored and does not re-apply `ALLOWED_REPOS_DIR`/`confinePath`; design D9 says this is deliberate.
- Response fields the spec does not mention: none.
- Tests that assert less than their scenario states:
  1. «An anchor that does not fit leaves room for its neighbours» (`budget.spec.ts:43`) calls `fitToTokenBudget` and never checks the pack `status`.
  2. «A whole file replaces the symbol spans it contains» (`context-pack.spec.ts:367`): the method's span was already last, so appending would also pass.
  3. «A long question sends a bounded number of searches» (`anchor.spec.ts:177`) only asserts `≤ 16`; nothing checks that the searched terms are the first 16, in order.
  4. «Unreadable source fails without its content» (`context-pack.spec.ts:245`): the error comes from the test's own fake; one substring checked.
  5. «A method inside an included class is not counted twice» (`budget.spec.ts:29`) uses made-up files; the one-span-of-`PriceCalculator.php` part is covered only by the integration test.

## Scenario → test → state

All 75 scenarios map to one test each, all green in the step-14 run at `a236e86` (the full table is in
the verifier's output; its line numbers match the PR description's traceability table for the new
scenarios, and `graph-read.spec.ts:252-793` / `git-source-tree.spec.ts:72-417` for the unchanged ones).
No scenario is red or absent.

## Addendum (2026-10-11, main session)

Every finding has a destination in `design.md` → Follow-ups → verify-against-spec. Fixed in this
change (A): `readFileAt` now checks the commit with `rev-parse --verify --quiet` and propagates every
other git failure, a `BAD` entry included (two tests seen failing first); the replacing-span placement,
the first-16-terms order, the pack-level `ok` of an anchor that does not fit, the exact error message,
`hops` default 2, a non-UUID project at pack level, CRLF lines, 64-character ids, `.`/NUL paths and
the process count by file size are now tested; the spec states the empty-file and `no-anchor`
`omitted: 0` rules. Re-run after the fixes: `tests/unit/context` 70/70,
`tests/integration/git/git-source-tree.spec.ts` 35/35. Because `packages/adapters/git/src` is an
analyzer-fingerprint input, the seed is regenerated again as the last commit (step 13).
