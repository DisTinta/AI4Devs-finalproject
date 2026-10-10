# Verify Against Spec

- Date: 2026-10-10
- Change: context-engine-anchor-expand (DIS-27, PR #33)
- Specs: `specs/context-engine/spec.md`, `specs/graph-store/spec.md`
- Run by a read-only forked agent; its report is saved here by the main session. Test states come
  from the step 11 report (940/940, Postgres included) and from reading the tests; CI `quality` was
  pending on the pushed head `e88fb4c` at the time.

**Verdict:** both specs are implemented and nothing is missing. One mismatch needs a decision: the
spec counts token length in letters and the code counts characters (2.1). The report also found seven
unspecified behaviours (3.x) and one scenario test that cannot fail. Destinations and fixes are in
the addendum and in `design.md` → Follow-ups.

## 1. Requirements implemented correctly

**context-engine: Question terms**
- **Normalise, split, length and stopword filter, dedup, 5-letter prefix right after the token.**
  `packages/core/src/context/anchor.ts:45-54`. Tests: `tests/unit/context/anchor.spec.ts:19` (exact
  `toEqual` of the 7 terms in order) and `:30` (`cupón`/`cupon` both give `['cupon']`).
- **Fixed stopword list.** `anchor.ts:22-33`, pinned word by word in `anchor.spec.ts:53`.
- **No network call.** `anchor.ts` imports only types.

**context-engine: Lexical anchoring**
- **Union of `findSymbols` results, deduplicated by id, one search per term, in order.**
  `anchor.ts:68-76`. Tests: `anchor.spec.ts:73` and `:84` (`arrayContaining` / `toContain`, which is
  what "includes" asks for), `:136` (dedup), `:147` (3 calls for 3 terms).
- **Name-only matching.** `anchor` only calls `store.findSymbols`. The name-only match itself is the
  store's, proven in `graph-read.spec.ts:222`.
- **No terms → empty anchor, no search, no project check.** Tests: `anchor.spec.ts:95`
  (`calls.findSymbols === 0`) and `:130` (`not-a-uuid` gives `[]`).
- **Terms that match nothing → empty anchor.** `anchor.spec.ts:107`.
- **`ProjectNotFound` for an unknown id and for a malformed id.** From the store; `anchor.spec.ts:119`.
- **Question never logged.** No `console` or logger in `context/**` or `store-postgres/src/**`
  (grep). No test covers it; see 2.2.

**context-engine: Graph expansion of the anchor**
- **Kinds and direction `both`.** `expand.ts:12`, `:41`.
- **Seeds = anchor symbols + each distinct file once.** `expand.ts:39-40`.
- **One traversal.** `expand.ts:41`. Tests: `expand.spec.ts:151` (exact arguments, one call), `:63`
  (co-change reached only through the file seed).
- **`hops` first, then empty anchor → `[]` without traversing or checking the project.**
  `expand.ts:37-38`. Tests: `expand.spec.ts:103`, `:119`, `:132`, `:138`.
- **Store result returned unchanged.** `expand.spec.ts:36`.
- **`ProjectNotFound` with a non-empty anchor.** `expand.spec.ts:144` (unknown UUID only; see 2.3).

**graph-store (MODIFIED)**
- **`fileId` on every symbol result (search and traversal).** `graph-read.ts:29`, `queries.ts:126,129,209`,
  `read-graph.ts:49,67`. Tests: `graph-read.spec.ts:222`, `:325`, `:705`.
- **Direction `out` / `in` / `both`, default `out`, one statement.** `graph-read.ts:45,48`,
  `StorePort.ts:81-87`, `postgres-store.ts:168-184`, `queries.ts:143-144,178-194` (four lateral
  branches gated by `$6`, each filtered by `e.project_id = $1`). Tests: `graph-read.spec.ts:378`,
  `:393`, `:415`, `:549`.
- **Invalid direction → `InvalidStoreQuery('direction')` before any query.** `read-arguments.ts:36-38`.
  Test: `graph-read.spec.ts:761` (also asserts 0 statements).
- **Unchanged scenarios still covered:** `graph-read.spec.ts:257, 271, 300, 312, 349, 365, 436, 481,
  500, 513, 529, 567, 666, 685, 735, 778`. The in-memory double runs 22 of them as
  `<title> (in-memory double)` in `tests/unit/store/in-memory-store.spec.ts`.

## 2. Requirements missing or partial

No requirement is missing outright. These are partial:

- **2.1 Token length is counted in characters, not letters.** The spec says "fewer than 3 letters"
  and "6 or more letters"; `anchor.ts:49,51` use `token.length`, which counts digits (the split keeps
  `\p{N}`) and UTF-16 code units. So `404` becomes a term. Design D1 also says "letters". No test
  covers a digit token.
- **2.2 Two requirement bullets have no test.** No test checks `fileId` (or any field other than
  `name`) on what `anchor()` returns. "The question SHALL NOT be written to any log" is checked only
  by grep.
- **2.3 Expansion with a malformed project id has no test.** `expand.spec.ts:144` only tests
  `randomUUID()`; `not-a-uuid` with a non-empty anchor is never asserted.

## 3. Unspecified behaviour

- **3.1** Terms are deduplicated across tokens and prefixes (`Set`); the spec only dedups tokens.
  Design D1 says "deduplicated too". The searches sent are the same either way.
- **3.2** Six new public constants (`ANCHOR_STOPWORDS`, `MIN_TOKEN_LENGTH`, `PREFIX_MIN_LENGTH`,
  `PREFIX_LENGTH`, `EXPANSION_EDGE_KINDS`, `TRAVERSAL_DIRECTIONS`) and `questionTerms` are exported
  from `@codemind/core`, and the spec does not name them.
- **3.3** The direction error message echoes the caller's value (`(got ${String(direction)})`), as
  the `hops` message already does.
- **3.4** The order of argument checks (hops, then kinds, then direction) is pinned by a unit test;
  the graph-store spec defines no order.
- **3.5** The double's `getProject` and `listProjects` are neither used nor tested.
- **3.6** `expand` dedups file seeds but passes duplicate symbol seeds through.
- **3.7** Documentation-only edit of `co-change.ts:27-28`. No action.

Specific checks: no dependency or manifest change; no authorisation required (no route); no
response field outside the spec in production code.

**Weak test.** "The expansion never leaves the project" (`expand.spec.ts:77`) cannot fail: the double
builds each project's edges from that project's own ids, so a cross-project edge cannot exist in it,
and `expand.ts` has no isolation logic. The real guard is the CTE's `e.project_id = $1`, covered only
by the extra integration test at 1 hop. "A question whose terms match nothing anchors nothing" asserts
more than its scenario (that searches were sent).

## Scenario → test → state

All 36 scenarios (12 `context-engine`, 24 `graph-store`) map to one test each, all green locally;
"The expansion never leaves the project" was green but weak. Full table: see the PR description's
Traceability section.

## Addendum — destinations and fixes (2026-10-10)

Author decision on 2.1: the spec follows the code ("characters", letters or digits).

| Finding | Destination | Action |
|---|---|---|
| 2.1 letters vs characters | A — fixed here | `specs/context-engine/spec.md` and design D1 say "characters" (letters or digits) |
| 2.2 anchor `fileId` untested | A — fixed here | Test "anchor symbols carry what a symbol search returns" in `anchor.spec.ts` |
| 2.2 question never logged | D — accepted | Verified by grep and the privacy check; nothing in `context/` can log (no logger dependency). DIS-39 owns logging at the entry points |
| 2.3 `not-a-uuid` in `expand` | A — fixed here | Case added to `expand.spec.ts` |
| 3.1 term dedup | A — fixed here | Spec bullet: terms are deduplicated, prefixes included |
| 3.2 public constants | D — accepted | They are the documented tuning knobs of design D1/D2 and DIS-28 will reuse them; the spec stays behavioural |
| 3.3 echo in direction message | D — accepted | Same shape as the existing `hops` message; the error stays with the caller and nothing in this change logs it |
| 3.4 pinned check order | A — fixed here | The unit test pinning hops → kinds → direction is removed |
| 3.5 unused double reads | A — fixed here | Tests "(in-memory double)" for `getProject` and `listProjects` |
| 3.6 duplicate symbol seeds | A — fixed here | `expand` dedups symbol seeds by id; test added |
| Weak isolation test | A — fixed here | The scenario test moves to Postgres (`tests/integration/context/expand.spec.ts`) with a cross-project edge inserted into the anchor's file, so it can fail; the unit version stays as `(in-memory double)` |
