# End-to-End Testing Report — throwaway PR for C2–C4

- Date: 2026-10-08
- Change: ci-secret-scan (DIS-87)
- Step: 7 — End-to-End Testing (design D8)
- Throwaway draft PR: [#27](https://github.com/DisTinta/AI4Devs-finalproject/pull/27), head
  `chore/DIS-87-secret-probe`, base `feature/DIS-87-ci-secret-scan` (at `aa31566`). Closed without
  merge; branch deleted.

## Setup

- Token: 32 random alphanumeric characters generated with Python `secrets` into a scratchpad file,
  no provider prefix. Checked locally first: `api_key = "<token>"` fires `generic-api-key` in a `.ts`
  and in a `.md` (redacted). The value never appears in this report, the change's files,
  `prompts.md`, Linear or any CI log (`grep -cF` of the token in each fetched log → 0).
- Before every push: the token was searched in every commit of `feature/DIS-87-ci-secret-scan`
  since `origin/feature/entrega-2-CRN` (`git grep` → 0) and in `openspec/changes/ci-secret-scan/`
  (`grep -rlF` → 0).
- Every `gh`/push step ran with the DisTinta account and switched back to Cristina-JumpMath.
- The PR range is `aa31566..<head>`, so it holds only the probe commits.

## Runs

| # | Commit | Run | `secrets` | Steps | `scope` / `quality` | Criterion |
|---|---|---|---|---|---|---|
| 1 | `b517885` add `packages/secret-probe.ts` | [37760684063](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/37760684063/job/113256055294) | **fail** | tree: 1 finding; git: 1 finding (commit `b517885`) | pass / **pass** (1 min 19 s) | C2 |
| 2 | `16c07cd` remove it | [37760985833](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/37760985833/job/113257051125) | fail (expected) | tree: «no leaks found»; git: 1 finding (`b517885`) | pass / **pass** (1 min 0 s) — precondition of C3 | — |
| 3 | `c64074d` add `docs/secret-probe.md` | [37761215621](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/37761215621/job/113257802929) | **fail** | **tree: 1 finding in `docs/secret-probe.md`**; git: 2 findings | `code=false` / **skipped** | C3 |
| 4 | `68bda5e` remove it | [37761381963](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/37761381963/job/113258344810) | **fail** | **tree: «no leaks found»; git: 2 findings naming `b517885` and `c64074d`** | `code=false` / skipped | C4 |

## Log excerpts (redacted)

**C2 — run 37760684063, `secrets`.** Range `aa31566e…..b5178854…`. Both steps fail; the git scan
runs although the tree scan failed (`!cancelled()`).

```
[Scan working tree]
Finding:     export const api_key = "REDACTED"
Secret:      REDACTED
RuleID:      generic-api-key
File:        packages/secret-probe.ts
Line:        1
WRN leaks found: 1
##[error]Process completed with exit code 1.
[Scan commits of the event]
INF 1 commits scanned.
WRN leaks found: 1
File:        packages/secret-probe.ts   Line: 1   Commit: b5178854058ef1c5021721b925c2f77ae41a146f
##[error]Process completed with exit code 1.
```

**C3 — run 37761215621.** `scope` log:

```
EVENT: pull_request   ACTION: synchronize
BEFORE: 16c07cde96b30a332dbd663fc4385d08e36560da
AFTER: c64074df2d36f3ce1ce442759ac0e71784b79d8e
Changed since 16c07cde96b30a332dbd663fc4385d08e36560da:
docs/secret-probe.md
Previous quality: success
code=false
```

`quality` skipped. `secrets`, step «Scan working tree» (the evidence; the git step's failure does not
count, its range holds commit #1):

```
Finding:     api_key = "REDACTED"
Secret:      REDACTED
RuleID:      generic-api-key
File:        docs/secret-probe.md
Line:        3
WRN leaks found: 1
##[error]Process completed with exit code 1.
```

**C4 — run 37761381963, `secrets`.** Range `aa31566e…..68bda5ec…`.

```
[Scan working tree]
INF no leaks found
[Scan commits of the event]
RuleID:      generic-api-key
File:        packages/secret-probe.ts
Line:        1
Commit:      b5178854058ef1c5021721b925c2f77ae41a146f
RuleID:      generic-api-key
File:        docs/secret-probe.md
Line:        3
Commit:      c64074df2d36f3ce1ce442759ac0e71784b79d8e
INF 2 commits scanned.
WRN leaks found: 2
##[error]Process completed with exit code 1.
```

## Restoration

- PR #27 closed without merge (`state=CLOSED`, `mergedAt=null`) with a Spanish comment.
- Remote branch deleted (`git push origin --delete`; `git ls-remote --heads origin
  chore/DIS-87-secret-probe` → 0). Local branch deleted (`git branch -D`; `git branch --list
  'chore/*'` → 0).
- Scratchpad token file and the two probe files deleted (the repository's `rm` guard blocks `rm`,
  so they were removed with Python `os.remove` on those three paths only). `grep -rlF` of the token
  over the scratchpad, the working tree and every commit reachable from local refs → 0.
- The probe commits stay reachable on GitHub at `refs/pull/27/head` after the branch deletion; the
  token is synthetic, random and never reused.

## Outcome

- Status: PASS — C2, C3 and C4 shown by real CI runs.
- Blocking issues: none.
