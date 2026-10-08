# Show Spec Working — ci-secret-scan (DIS-87)

> **Superseded in part (2026-10-08, after `/adversarial-review`, design D10).** The tree entries of
> `.gitleaksignore` described below were replaced by value-only allowlists in `.gitleaks.toml`;
> `.gitleaksignore` keeps 1 commit-bound entry. C5(a) and C6 were re-run with the final
> configuration: see `2026-10-08-adversarial-review.md`.

- Date: 2026-10-08
- Branch head: `95d5540` (PR [#26](https://github.com/DisTinta/AI4Devs-finalproject/pull/26))
- Contract: the acceptance criteria C1–C6 of DIS-87 (`skip_specs: true`, no delta spec), plus the
  error paths of the job.
- Real interfaces: the `secrets` job on GitHub Actions (runs and logs fetched with `gh run view
  --log`, DisTinta account, switched back to Cristina-JumpMath after each call), and gitleaks 8.30.1
  plus the job's own step scripts, parsed out of `.github/workflows/ci.yml`, run locally.

## Demonstrated

| Scenario | Interaction | Result | Matches | Evidence |
|---|---|---|---|---|
| C1 — tree green on the PR | CI run 37762054431 on head `95d5540` | `secrets` success: `sha256sum` OK, `8.30.1`, range `bc3e395..95d5540`, tree «no leaks found», git «6 commits scanned» «no leaks found», 0 `npm ci`/`npm install` lines | yes | [run](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/37762054431) |
| D4 — never skipped on a docs-only push (C1 run) | same run, `scope` log | changed: 3 `openspec/` files + `readme.md`; `code=false`; `quality` skipped; `secrets` ran | yes | same run |
| C2 — new secret outside `fixtures/` → red | CI run 37760684063 (#27, commit `b517885`) | both steps exit 1; `packages/secret-probe.ts`, line 1, `generic-api-key`, value `REDACTED` | yes | [run](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/37760684063/job/113256055294) |
| C3 — secret only in Markdown, docs-only push → red | CI run 37761215621 (#27, commit `c64074d`) | `scope` `code=false`, `quality` skipped; step «Scan working tree» exit 1 on `docs/secret-probe.md:3`, `generic-api-key` | yes | [run](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/37761215621/job/113257802929) |
| C4 — added and removed in the same PR → red | CI run 37761381963 (#27, commit `68bda5e`) | tree «no leaks found»; git exit 1 naming `b517885` and `c64074d` | yes | [run](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/37761381963/job/113258344810) |
| C5(a) — shifted fingerprint | local, line added above `spec.md:120`, uncommitted | new `…:private-key:121` (and 145, 156); after regenerating «no leaks found»; restored | yes | below |
| C5(b) — push without usable `before` | local, `range` step parsed from `ci.yml` (sha256 `74399cfd…5ecc`), `bash -e` | zeros and unreachable `before` → `range=` exit 0; real parent and PR → `a..b`; other event → `range=` | yes | below |
| C6 — milestone range green | local `gitleaks git --log-opts="origin/main..HEAD"` and `dir .` on `95d5540` | both «no leaks found», exit 0 | yes | below |
| Error — tampered SHA-256 | local, `install` step parsed from `ci.yml`, `SHA256` = 64 zeros | `gitleaks_8.30.1_linux_x64.tar.gz: FAILED`, exit 1; tar never runs (no binary extracted) | yes (D3) | below |
| Error — fingerprints are what filters | local, `.gitleaksignore` moved aside | `leaks found: 13`; file restored | yes (D2) | below |

## Evidence

C1 — `secrets` log, run 37762054431 (step names in brackets):

```
[Install gitleaks 8.30.1 (pinned SHA-256)] gitleaks_8.30.1_linux_x64.tar.gz: OK
[Install gitleaks 8.30.1 (pinned SHA-256)] 8.30.1
[Commit range of this event] range=bc3e3952438dbf002b2224bb9c0453f7a6954a85..95d554098f147d77ef5cc9007d7a12141e2065b0
[Scan working tree] INF no leaks found
[Scan commits of the event] INF 6 commits scanned.
[Scan commits of the event] INF no leaks found
npm lines: 0
```

`scope` log of the same run:

```
Changed since aa31566e1ebf90a728ec7990a2878cf93cc4f00c:
openspec/changes/ci-secret-scan/reports/2026-10-08-7-end-to-end-testing.md
openspec/changes/ci-secret-scan/reports/pr-description.md
openspec/changes/ci-secret-scan/tasks.md
readme.md
Previous quality: skipped
code=false
```

C2–C4 — `secrets` logs of #27 (fetched earlier the same day; full excerpts in
`2026-10-08-7-end-to-end-testing.md`):

```
== C2 (b517885)
[Scan working tree] RuleID: generic-api-key / File: packages/secret-probe.ts / Line: 1 / leaks found: 1 / exit code 1
[Scan commits of the event] 1 commits scanned / leaks found: 1 / Commit: b5178854… / exit code 1
== C3 (c64074d)
[Scan working tree] RuleID: generic-api-key / File: docs/secret-probe.md / Line: 3 / leaks found: 1 / exit code 1
[Scan commits of the event] 2 commits scanned / leaks found: 2 (c64074df…, b5178854…) / exit code 1
== C4 (68bda5e)
[Scan working tree] no leaks found
[Scan commits of the event] packages/secret-probe.ts:1 (b5178854…), docs/secret-probe.md:3 (c64074df…) / 2 commits scanned / leaks found: 2 / exit code 1
```

C6, local on `95d5540`:

```
$ gitleaks dir . --redact --no-banner                          → INF no leaks found   exit=0
$ gitleaks git . --redact --no-banner --log-opts="origin/main..HEAD"
INF scanned ~6386821 bytes (6.39 MB) in 4.85s
INF no leaks found                                             exit=0
```

C5(a):

```
WRN leaks found: 5
openspec/specs/security-gateway/spec.md:private-key:121
openspec/specs/security-gateway/spec.md:private-key:145
openspec/specs/security-gateway/spec.md:private-key:156
(three lines updated in .gitleaksignore)
INF no leaks found
restored (sha256 identical)
```

C5(b), `node -e "<js-yaml> …steps.find(s=>s.id==='range').run"` → `sw-range.sh`, sha256
`74399cfd29406aa8b8544cb9925a24ee0b6c1a74e30c8e6fde269b7cfa955ecc` (same as in the step 5 report),
run with `bash -e`:

```
push zeros → exit=0 output: range=
push unreachable → exit=0 output: range=
push parent → exit=0 output: range=aa31566e1ebf90a728ec7990a2878cf93cc4f00c..95d554098f147d77ef5cc9007d7a12141e2065b0
pull_request → exit=0 output: range=bc3e3952438dbf002b2224bb9c0453f7a6954a85..95d554098f147d77ef5cc9007d7a12141e2065b0
workflow_dispatch → exit=0 output: range=
```

Tampered SHA-256, `install` step parsed from `ci.yml`, `RUNNER_TEMP=<scratch>/rt`,
`SHA256=0…0` (the real tarball is downloaded from the official release):

```
gitleaks_8.30.1_linux_x64.tar.gz: FAILED
sha256sum: WARNING: 1 computed checksum did NOT match
exit=1
$ ls <scratch>/rt
gitleaks_8.30.1_linux_x64.tar.gz          (no extracted binary: tar did not run)
```

The correct-SHA path is the C1 log (`: OK`, then `8.30.1`); the Linux binary cannot run on this
Windows machine, so it is not repeated locally.

`.gitleaksignore` moved aside: `WRN leaks found: 13`; moved back, SHA-256 identical.

## State

- Before: HEAD `95d5540`, `git status --porcelain` 0 lines, `git ls-files -s fixtures | sha1sum`
  `b51aa6f4…`, `.gitleaksignore` sha256 `620416a9…`, `openspec/specs/security-gateway/spec.md`
  sha256 `f3e41bd6…`.
- After: identical (0 lines, `b51aa6f4…`, `620416a9…`, `f3e41bd6…`).
- Restored: yes — C5(a) probe line reverted with `git checkout --`, `.gitleaksignore` copied back from
  a scratchpad backup, scratch `rt/` (downloaded tarball) removed. No database or remote state
  touched by this demonstration (C2–C4 runs and their cleanup are in the step 7 report).

## Not demonstrated

- C5(b) on a real push to `main`: not reproducible without touching `main` (design D9). Shown by
  simulating the exact `run:` of the step, and the `if:` that skips the git scan on an empty range
  is shown working the other way in every CI run (non-empty range → git step ran).
- No screenshots: no browser UI. Nothing written at the repository root.

## Handoff

The change is **demonstrably working**: every acceptance criterion of DIS-87 and the two error
paths (tampered binary, missing fingerprints) were exercised against the real CI job or the job's
own step scripts, with matching results.
