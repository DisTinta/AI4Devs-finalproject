# Verify Against Spec — index-repository (DIS-85)

- Date: 2026-10-07
- Change: index-repository (DIS-85), PR #23
- Input: the `/verify-against-spec` run of 2026-10-07 (findings U1–U8, M1–M5, W1–W3) and the author's
  decisions on them. Everything was fixed in this change; no new issue was opened.

## Decisions and fixes

| Finding | Decision | Change | Test |
|---|---|---|---|
| U1 / M5 — a file the analyzer returns without having received it was saved without `redacted` / `contentHash` | Fix: same treatment as an edge to a symbol the analyzer does not return. Spec: new sentence in "Indexing order and no partial write" next to the invalid-graph rule, and scenario "A file the analyzer did not receive creates no project" | `index-repository.ts`: each such file becomes an `InvalidGraph` violation (`files[i]`, `path`, message naming the path) collected where the analyzer's files are mapped, raised in `save` together with `validateGraph`'s, before `createProject` | scenario: `tests/integration/index/acme-shop.spec.ts` "A file the analyzer did not receive creates no project" (real store, message names the path, no new project row); unit extra cases "rejects a file the analyzer did not receive with InvalidGraph naming its path, before createProject" (replaces "keeps a file the analyzer returns without an input as it is") and "saves every file with redacted and a 64-hex contentHash". Both rejection tests red before the fix |
| U2 — a leading BOM is dropped when decoding | Keep (design.md risk) | spec "Source tree contract" clarified: BOM dropped, `contentHash` over the content without it | `tests/integration/git/git-source-tree.spec.ts` "drops a leading UTF-8 byte order mark when decoding" (fails with `ignoreBOM: true`, checked and reverted) |
| U3 — edges deduplicated before saving and counting | Keep (code-analysis rule) | **Bug found**: `compareEdges` ignored `resolution`, so `sortUniqueEdges` kept whichever edge came first. `compareEdges` now ranks `exact` before `heuristic` as a last tie-break. Spec clarified ("every edge" / `edges.total` = saved edges after the dedup); design D8 updated | `tests/unit/knowledge/edge-order.spec.ts` (2 new, red before the fix); `index-repository.spec.ts` "saves one exact edge when an exact and a heuristic edge share kind, source and target" (red before the fix: `report.edges` `{ total: 1, exact: 1, heuristic: 0 }`) |
| M1 — `rootPath` untested | Test | — | `acme-shop.spec.ts` "acme-shop is indexed completely": `project.rootPath === realpathSync(copy)` |
| M3 — repository never modified | Test | — | same test: `git rev-parse HEAD` and `git status --porcelain` equal before and after |
| M4 — plain JSON-serialisable report | Test | — | `index-repository.spec.ts` "returns a report that survives a JSON round trip unchanged" (`toStrictEqual`, every collection populated) |
| W1 / W3 — the planted-secret test checked only `signature` and `message` | Test | — | `acme-shop.spec.ts` "The planted secret of acme-shop never reaches the database": `row_to_json` of every row of `file`, `symbol`, `edge`, `commit`, `file_commit`, with the row count of each; plus the files the real analyzer received (recorded) hold the marker and no key |
| W2 — `'/elsewhere'` never matches on Windows | Test | — | `index-repository.spec.ts`: checks `'elsewhere'` (no separators) plus the resolved path |

W1/W3 proof. The key of acme-shop sits in an array value that no row stores, so `row_to_json` alone
cannot see an unredacted analyzer input; the recorded analyzer input does. Both mutations were
applied to `index-repository.ts` locally, the test run, and the file restored (SHA-256 identical):

```
--- mutation A: analyzer receives the unredacted files
     → expected '<?php\n\ndeclare(strict_types=1);\n\n…' to contain '[REDACTED: possible secret]'
      Tests  1 failed | 1 skipped (2)
--- mutation B: no redaction at all
     → expected false to be true // Object.is equality
      Tests  1 failed | 1 skipped (2)
restored: identical
      Tests  1 passed | 1 skipped (2)
```

## Second /verify-against-spec run (2026-10-07)

No contradiction with the spec; 23 scenarios, each green. Its housekeeping notes, fixed here:

- Design D4 mapping and the helper list named only `assertValidGraph`: updated.
- `tasks.md` had no task for the new scenario: section 12 added, traceability line added.
- The new scenario lived only in `describe('extra cases')`: the scenario is now the integration test (the only one that can check the database); the unit test is a named extra case.
- U1-a, the unit test pinned the exact message wording (unspecified): now it pins `element` / `field` (the `GraphViolation` contract) and checks only that the message names the path.
- U1-b, the branch that kept an unanalysed file only fed a later rejection: violations are now collected where the file is mapped (`index-repository.ts`), and the separate helper is gone.
- U3-a, the `compareEdges` tie-break on `resolution` goes beyond the order written in `code-analysis` ("Analysis contract": kind, source, target). It only orders edges with equal keys, which `sortUniqueEdges` then collapses, and it is how the existing `code-analysis` dedup rule is met. Kept; note it in a `code-analysis` delta at archive time (task 11.6).

## Accepted without a test

- U4 — an error thrown by the progress callback stops indexing and propagates: accepted, documented on `IndexDependencies.onProgress`.
- U5 — `realPath` errors other than a missing path (`EACCES`) propagate unchanged; `ENOTDIR` counts as missing: accepted.
- U6 — the root of a linked worktree is accepted as a repository root: accepted, consistent with "top-level directory".
- U7 — `selectIndexableFiles`, `IndexableFiles` and `INDEX_PHASES` are public exports: accepted, the core barrel exports its helpers.
- U8 — `EmptyRepository` carries `repoPath` and a message with the path: accepted, same shape as `NotAGitRepository` (the Low privacy finding is routed to DIS-86).
- M2 — "no transaction, no log": not verifiable without instrumenting the database and the process output; met by construction (the use case receives the store already bound to the caller's connection and imports no logger).

## Checks (2026-10-07, after the fixes)

```
npx vitest run          Test Files 39 passed (39) | Tests 563 passed (563)   (DATABASE_URL set, Postgres up)
npm run lint            exit 0 — 0 errors, 1 warning (existing no-empty-object-type on an empty port interface)
npm run typecheck       exit 0
npx stryker run         All files 95.51 % — index-repository.ts 99.00 % (after pinning element/field), edge-order.ts 96.92 %
                        (survivors pre-existing: edge-order.ts:25; index-repository.ts:174 'utf8', equivalent)
```

## CI evidence

After the push of `d15d0d5` (2026-10-07): `quality` run 37598058350 passed, 562 passed / 1 skipped
(the Windows-only case), `index-repository.spec.ts` 24, `acme-shop.spec.ts` 3, `git-source-tree.spec.ts`
10, `edge-order.spec.ts` 16; core Stryker 96.07 %. `Frontend` run 37598058457 passed (no web change).
