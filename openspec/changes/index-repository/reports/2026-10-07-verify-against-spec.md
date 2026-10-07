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
- U3-a, the `compareEdges` tie-break on `resolution` goes beyond the order written in `code-analysis` ("Analysis contract": kind, source, target). It only orders edges with equal keys, which `sortUniqueEdges` then collapses, and it is how the existing `code-analysis` dedup rule is met. Kept. No `code-analysis` delta: see the adversarial review follow-up, #1.

## Adversarial review follow-up (2026-10-07)

Verdict of the first `/adversarial-review`: PASS WITH GAPS, six Minor findings and one question.
Author decisions and outcome:

| # | Finding | Decision | Outcome | Test |
|---|---|---|---|---|
| 1 | `compareEdges` tie-break changes `code-analysis` without a delta | Check first whether it only enforces an existing rule | It does: "no two edges SHALL share `kind`, source and target", the line-700 rule and its scenario "An exact edge takes precedence over a heuristic one" already require it, and the PHP analyzer filters before `sortUniqueEdges`, so its output is unchanged. No delta (it would duplicate that scenario). `AnalyzerPort` JSDoc and task 11.6 updated | PHP analyzer suite: 10 files, 164 tests green |
| 2 | A file the analyzer was given but did not return vanished silently | Fix, same rule as U1 | Spec: one sentence ("the returned paths SHALL be exactly the received ones", `InvalidGraph` naming every missing or extra path) and scenario "A file the analyzer did not return creates no project". The port contract and the PHP analyzer were checked first (an unparseable file stays in `files`) | integration scenario (real store) and a unit extra case, both red before the fix |
| 3 | Redaction events of a file that is not saved | Closed by #2 | A rejected indexing returns no report | same tests assert no report |
| 4 | `hasCommits` turned any failure into "no commit" | Fix | Probe: `rev-parse --verify --quiet HEAD` is silent both for an unborn branch and a broken ref, so `symbolic-ref --quiet HEAD` tells them apart; every git failure propagates | `tests/unit/git/has-commits.spec.ts` (git missing via a fake); "propagates a broken HEAD as a git error, never as EmptyRepository" |
| 5 | No per-blob size cap | Document only | design Risks: declared non-goal, DIS-35 streaming debt | — |
| 6 | Window between confinement and the git calls | B → DIS-86 | Files come from the object database and inner links are never followed, so only the repository path itself can be swapped; design Follow-up and Spanish comment on DIS-86 | — |
| P | Does reading execute nothing? | Harden and test | **Real hole found**: with `log.showSignature=true` and `gpg.program` in the repository's config, `readHistory` ran that program. `GIT_CONFIG` now sets `core.fsmonitor=false`, `core.hooksPath=<null device>`, `core.attributesFile=`, `log.showSignature=false` for every git call (`readerGit`; simple-git needs `allowUnsafeFsMonitor` / `allowUnsafeHooksPath`). Filters and textconv have no off switch and stay unused by the commands the readers run | scenario "Reading executes nothing from the repository": red without hardening (`trap.sh --keyid-format=long --status-fd=1 --verify …`), green with it; a temporary `git status` in `readFiles` makes it fail (the clean filter ran), file restored identical |

## Second review round (2026-10-07)

Third `/verify-against-spec`: two contradictions (U-a, U-b). Second `/adversarial-review`: PASS WITH
GAPS (four Minor, two questions). The previous round was committed locally first (`62817d6`,
`b88b4c4`, `bbfe6ea`, 571/571). Author decisions:

| # | Finding | Outcome | Test |
|---|---|---|---|
| a | `git-history` changed, but the proposal said it did not | Delta with two ADDED requirements (broken `HEAD` propagates; reading the history executes nothing and repository config does not change it); proposal corrected | 3 scenarios in `simple-git-history.spec.ts`; the first two red against the adapter of `3985502` |
| b | The root check turned every git failure into `NotAGitRepository` | Only git's "not a git repository" maps to it; everything else propagates. Git runs with `GIT_ENV` (`LC_ALL=C`, `LANGUAGE=C`, closed variable list). Narrowing exposed that simple-git refuses a full environment holding `EDITOR`: the old catch-all would have shown it as "not a Git repository" | `tests/unit/git/repository-root.spec.ts` (fake git: not a repo, dubious ownership, `EACCES`, `ENOENT`, other; environment), red first. No localised red possible: this machine's git has no translations |
| c | `hasCommits` threw a bare error | Spec: "any other git failure propagates unchanged"; message "HEAD names no commit and no branch" | `has-commits.spec.ts`, red first |
| d | Repository config could change the history (`log.showRoot=false`) | Flags in `LOG_ARGUMENTS`: `--root`, `--no-renames` (the `git-history` policy), `--no-ext-diff`, `--no-textconv`, `--no-relative`; `GIT_CONFIG` keeps quoting and encoding | trap scenarios with `log.showRoot=false`, `diff.renames=copies`, `diff.relative=true`, `core.quotePath=true` and an accented path, compared with a clean read: red (root commit lost its links), then green |
| e | Broken ref only tested through `readFiles` | Scenario "A broken HEAD propagates git's error" reads the history too | `git-source-tree.spec.ts` |
| f | Trap scenario omitted textconv; "every hook" | GIVEN corrected | — |
| g | "every path" never asserted | Unit case with two missing and one extra path | `index-repository.spec.ts` |
| h | Orphan branch read as `EmptyRepository` | Spec: "`HEAD` names no commit → `EmptyRepository`" (only `HEAD` is indexed); scenario added | "A HEAD on an orphan branch is rejected as empty" (green at once: the behaviour already existed) |
| i | CI evidence predates the fixes | Updated after the push | — |

## Third review round (2026-10-07, last round for Minor findings)

Fourth `/verify-against-spec`: three conflicts with the delta wording (C1–C3) and one unspecified
behaviour (U-A). Third `/adversarial-review`: two Major findings, both contradicting a SHALL, plus
Minor findings and two questions. Previous round committed first (`2b65a87`…`8a82cd1`, 584/584).
Criterion set by the author: contradictions, Blockers and Majors are fixed; new Minor findings are
accepted with their reason unless trivial (under 5 lines, no spec change).

Fixed:

| Finding | Outcome | Test (red first) |
|---|---|---|
| Major 1: `<repo>/.git` and a bare repository surfaced "must be run in a work tree" as a plain error (regression of round b) | Mapped to `NotAGitRepository` | "A .git directory or a bare repository is not a repository root" / "… is rejected"; unit case |
| Major 2: a partial clone's lazy fetch ran the promisor remote's upload program (reproduced: `upload-pack …` written three times) | `GIT_NO_LAZY_FETCH=1` in `GIT_ENV` | "A partial clone never fetches a missing object"; "Reading the history never fetches a missing object" |
| Contradiction: `mailmap.file`/`mailmap.blob` in config remapped authors | Both emptied in `GIT_CONFIG`; `core.useReplaceRefs=false` too (question on replace refs) | "Repository configuration does not change the history" and the trap scenario, now with a remapping `mailmap.file` and `i18n.logOutputEncoding=ISO-8859-1` |
| C1: `realpath` `EACCES` became `NotAGitRepository` | Only `ENOENT`/`ENOTDIR` map to it | `repository-root.spec.ts` (injected `realpath`) |
| C2: `hasCommits` threw its own error | `rev-parse --verify HEAD` lets git say why; its error propagates | `has-commits.spec.ts` |
| C3: junk `.git/HEAD` pinned inside a scenario-named test | Moved to an extra case (git itself sees no repository: "Not a repository") | — |
| U-A: closed environment and C locale unspecified | Written into both deltas | `repository-root.spec.ts` |
| Trivial: `trim` of the top-level path; weak `/HEAD/` assertions; stale port JSDoc | Trailing newline only; `fatal: No such ref: HEAD`; JSDoc updated | — |

Accepted Minor findings (no code change):

- `HEAD` resolved twice (`readFiles`, then `readHistory`): a commit landing in between would label the files of one commit with the next sha. Fixing it changes `SourceTreePort`; the CLI (DIS-86) indexes a repository nobody commits to during the run. Design Risks.
- Hooks and fsmonitor traps are not sensitive with the current commands (they never trigger them): shown by a temporary `git status` in round P, which the scenario catches. Design Risks.
- "Malformed, repeated and binary entries…" asserts "no `InvalidGraph`" against a fake `saveGraph`: the real store's validation runs in the acme-shop integration scenarios.
- Questions: a shallow clone is read as what its objects hold (repository content); one `git cat-file` per blob stays with the DIS-35 batching debt.

## Fourth review round (2026-10-07)

Fifth `/verify-against-spec`: no confirmed contradiction; two probable ones (P1 `diff.algorithm`,
P2 `diff.orderFile`) and weak partial-clone assertions. Fourth `/adversarial-review`: **PASS WITH
GAPS, no Blocker, no Major**. Previous round committed first (`47529f5`, `c82a033`, 593/593).

Fixed (narrow contradictions and trivial Minor findings):

| Finding | Outcome | Test (red first) |
|---|---|---|
| P2 `diff.orderFile` reordered a commit's files (reproduced); P1 `diff.algorithm` | `-O/dev/null`, `--diff-algorithm=myers` in `LOG_ARGUMENTS` | config scenarios of both readers, now arming both keys. Correction (sixth verification): only P2 was red; the hostile files are too small for myers and patience to differ, so the `diff.algorithm` arm cannot fail and the flag is a pin without a red test |
| "not a repository" regex matched anywhere, so a dubious-ownership path holding the words read as `NotAGitRepository` | Anchored to the start of git's `fatal:` line | `repository-root.spec.ts` |
| Partial-clone tests accepted any `Error` | Assert git's `fatal:` and not a `DomainError` | both partial-clone scenarios |
| `GIT_NO_LAZY_FETCH` needs git from the 2024-05 security releases | Git ≥ 2.45.1 (or 2.39.4–2.44.1) documented as a prerequisite | — (documentation) |

Accepted Minor findings (no code change), with reason:

- Replace refs (`core.useReplaceRefs=false`) and `mailmap.blob=` have no test of their own: one-line pins next to tested ones; `mailmap.file` is tested.
- `.git/info/grafts` and shallow clones are read as what the repository holds, like a committed `.mailmap`.
- Global and system git configuration: the same `-c` and flag pins override them (superseded in the fifth round: `git-history` now names all three levels).
- A `.git` file or `objects/info/alternates` can point the object store outside `allowedRoot`: same attacker as the path window, added to the DIS-86 follow-up in design.md (B).
- `hasCommits`'s last-resort error is unreachable (git's own `rev-parse --verify HEAD` speaks first); `GIT_ENV` is read once at import; `core.attributesFile=` turns off the operator's global attributes file (hardening).
- The scenario "Progress phases…" says the source tree is "called once": it means `readFiles`; `realPath` runs twice by design (confinement), and the test pins the exact log.

## Fifth review round (2026-10-07)

Sixth `/verify-against-spec` and fifth `/adversarial-review` at `6960dc8`. Fixed (red first):

| Finding | Outcome | Test |
|---|---|---|
| Major / C1: `core.bigFileThreshold` in the repository's config turned numstat into `-` and dropped line counts (reproduced) | `core.bigFileThreshold=512m` (git's default) in `GIT_CONFIG` | config scenarios of both readers arm `core.bigFileThreshold=1`: red, then green |
| C3: `diff.ignoreSubmodules=all` could hide gitlink rows | `--ignore-submodules=none` in `LOG_ARGUMENTS` | armed in the same scenarios (no gitlink in the hostile repository, so not red by itself) |
| M-b: GIVEN said the order file "reverses" | "reorders" | — |
| M-a: report claimed P1 red | corrected above | — |

C2, author decision (option 1, accepted limit): a committed `.gitattributes` with `diff=<driver>`
plus `diff.<driver>.binary=true` in the local config, or a local `.git/info/attributes` with
`-diff`, makes numstat print `-` and drops that file's line counts. Only line counts are lost: nothing
runs and nothing outside the repository is read. Neutralising it in code (`-c
diff.<driver>.binary=false` per driver named in `HEAD`'s `.gitattributes`) was discarded: new logic
that still misses `.git/info/attributes`. The `git-history` sentence now names what it covers
(git's local, global and system configuration) and states the attributes case; scenario "A file
marked not diffable by attributes carries no line counts". Its test was **green from the start**:
it pins existing behaviour, there was no red/green cycle.

P1, author decision: `--diff-algorithm=myers` stays as a pin with no test that tells it apart
(the hostile files are too small for myers and patience to differ; no bigger fixture for this).

## Sixth review round (2026-10-07)

Seventh `/verify-against-spec`: one probable contradiction (C-7a, `attr.tree`) and two Minor items.
Sixth `/adversarial-review`: two Major findings, the first contradicting the `git-history` SHALL,
plus one Minor. Previous round committed first (`96b281e`, `c7dd406`, 595/595).

Fixed (red first):

| Finding | Outcome | Test |
|---|---|---|
| Major / C-7a: `attr.tree` in config, or an uncommitted work-tree `.gitattributes`, changed which attributes apply (line counts lost or regained) | `attr.tree=HEAD` in `GIT_CONFIG`; git floor raised to 2.45.1 or 2.43.4 / 2.44.1 (readme, project-context) | config scenarios of both readers arm `attr.tree` and an uncommitted `.gitattributes` with `* -diff`: red, then green |
| Major: `git log HEAD` without `--` failed when the work tree held an entry named `HEAD` ("ambiguous argument", reproduced) | `LOG_ARGUMENTS` ends with `--` | "A work-tree entry named HEAD does not change the history" (new `git-history` scenario) |
| M-7a: the attributes sentence named the wrong source | Now exact: `HEAD`'s committed `.gitattributes` and `.git/info/attributes`, never an uncommitted one nor a configured tree | — |

Accepted Minor findings:

- An uncommitted work-tree `.mailmap` remaps authors (git reads it from the work tree): same class as the committed `.mailmap` accepted in git-history-extraction; turning mailmap off changes the pseudonymised identity, out of scope. Design Risks; the `GIT_CONFIG` comment now says so.
- M-7b: the "committed `.gitattributes`" half of the attributes sentence has no test of its own; the scenario's GIVEN uses `.git/info/attributes`, and the hostile config proves the uncommitted one is ignored.

## Seventh review round (2026-10-07)

Eighth `/verify-against-spec`: one contradiction (C-8a) and one Minor (M-8a). Seventh
`/adversarial-review`: PASS WITH GAPS, no Blocker, no Major; two of its Minor findings conflict with
a SHALL. Previous round committed first (`1762683`, `fcb8707`, 596/596).

Fixed (red first, no spec change: the code now meets the existing SHALLs):

| Finding | Outcome | Test |
|---|---|---|
| C-8a / adversarial 3: a `HEAD` or branch ref holding a tree's sha listed the tree (`readFiles`) and read as an empty history (`readHistory`) | `hasCommits` probes `HEAD^{commit}`; git's own error propagates | "propagates git's error for a HEAD that names a tree…" (detached and on a branch, both readers); `has-commits.spec.ts` |
| Adversarial 2: a repository's own `core.worktree` made a subdirectory a "root" that read the enclosing repository | Root check also requires `<dir>/.git` to be the git directory, or a `.git` file (linked worktree) | "a subdirectory made a work tree by the repository's core.worktree…" (both readers) |
| M-8a: the system attributes file applied (Git for Windows `astextplain`); spec names two sources | `GIT_ATTR_NOSYSTEM=1` | `repository-root.spec.ts` |

Accepted Minor: a tracked path that is not valid UTF-8 is decoded lossily (two such paths can
collapse into one `duplicate-path`); reading paths as bytes belongs with the DIS-35 streaming debt.
Design Risks.

## Accepted without a test

- U4 — an error thrown by the progress callback stops indexing and propagates: accepted, documented on `IndexDependencies.onProgress`.
- U5 — `realPath` errors other than a missing path (`EACCES`) propagate unchanged; `ENOTDIR` counts as missing: accepted.
- U6 — the root of a linked worktree is accepted as a repository root: accepted, consistent with "top-level directory".
- U7 — `selectIndexableFiles`, `IndexableFiles` and `INDEX_PHASES` are public exports: accepted, the core barrel exports its helpers.
- U8 — `EmptyRepository` carries `repoPath` and a message with the path: accepted, same shape as `NotAGitRepository` (the Low privacy finding is routed to DIS-86).
- M2 — "no transaction, no log": not verifiable without instrumenting the database and the process output; met by construction (the use case receives the store already bound to the caller's connection and imports no logger).

## Checks (2026-10-07, after the seventh review round)

```
npx vitest run          Test Files 41 passed (41) | Tests 600 passed (600)   (DATABASE_URL set, Postgres up)
npm run lint            exit 0 — 0 errors, 1 warning (existing no-empty-object-type in LlmPort.ts)
npm run typecheck       exit 0
npm run docs:coverage   exit 0
openspec validate index-repository --strict   valid
```

## CI evidence

After the push of `d15d0d5` (2026-10-07): `quality` run 37598058350 passed, 562 passed / 1 skipped
(the Windows-only case), `index-repository.spec.ts` 24, `acme-shop.spec.ts` 3, `git-source-tree.spec.ts`
10, `edge-order.spec.ts` 16; core Stryker 96.07 %. `Frontend` run 37598058457 passed (no web change).
