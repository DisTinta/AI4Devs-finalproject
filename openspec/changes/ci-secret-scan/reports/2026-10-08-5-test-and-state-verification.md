# Test and State Verification Report

- Date: 2026-10-08
- Change: ci-secret-scan (DIS-87)
- Step: 5 — Run Tests and Verify Data State (with the local evidence of tasks 0.4, 1.2, 2.2, 2.3, 3.4)
- Branch: `feature/DIS-87-ci-secret-scan`, from `origin/feature/entrega-2-CRN` = `bc3e395`
  (`origin/main` = `a15993b`). gitleaks 8.30.1 (WinGet) on Windows 11, Git Bash.

All gitleaks output below is `--redact`: no secret value appears in this report. JSON reports were
written to the session scratchpad, never to the repository.

## Commands executed

- `gitleaks version`
- `gitleaks dir . --redact -f json -r <scratch>/base-dir.json`
- `gitleaks git . --redact --log-opts="origin/main..HEAD" -f json -r <scratch>/base-git.json`
- `gitleaks git . --redact --log-opts="origin/main..HEAD" --gitleaks-ignore-path <scratch>/tree.ignore -f json -r <scratch>/hist.json`
- `gitleaks dir . --redact --no-banner` and `gitleaks git . --redact --no-banner --log-opts="origin/main..HEAD"` (C6)
- `node -e "<js-yaml load of ci.yml>"` (YAML parse, job list, `${{` inside `run:` count)
- `awk '/^  secrets:/{f=1} f&&/^  [a-z_-]+:$/&&!/secrets/{f=0} f' .github/workflows/ci.yml | grep -n '\${{'`
- C5(b) extraction and runs (below)
- C5(a) edit, scans and restore (below)
- `git diff --stat origin/feature/entrega-2-CRN -- tests packages`
- `export DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind; npx vitest run`
- `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`

## Baseline (task 0.4)

- `gitleaks version` → `8.30.1`.
- `gitleaks dir .` → 13 findings, 9 unique fingerprints, exactly the tree list of design Context and
  DIS-87.
- `gitleaks git` over `origin/main..HEAD` (no ignore file) → 17 findings, 13 unique fingerprints.
- `git status --porcelain` → only `?? openspec/changes/ci-secret-scan/`.

## `.gitleaksignore` (task 1.1)

- Tree section: the 9 fingerprints of the regenerated `dir` report, compared with `diff` against the
  file → identical (`TREE-MATCH`).
- Historical section: `gitleaks git` with an ignore file holding only the tree section → 10
  findings, 8 unique fingerprints, compared with `diff` against the file → identical
  (`HIST-MATCH`). They are the same 8 lines as DIS-87 `[enhanced]` §3, so there is no difference to
  report in Linear.
- File: 17 fingerprint lines, `#` headers by reason, UTF-8, LF.

## C6 — range of the milestone green, locally (task 1.2)

```
$ gitleaks dir . --redact --no-banner
INF scanned ~8131257 bytes (8.13 MB) in 700ms
INF no leaks found                                   (exit 0)

$ gitleaks git . --redact --no-banner --log-opts="origin/main..HEAD"
INF 292 commits scanned.
INF scanned ~6312596 bytes (6.31 MB) in 4.93s
INF no leaks found                                   (exit 0)
```

## Workflow static check (task 2.2)

- js-yaml parse: OK. Jobs `scope,quality,secrets`. `secrets`: `needs` and `if` undefined; steps
  `actions/checkout@v4 | install | range | Scan working tree | Scan commits of the event`.
- `git diff origin/feature/entrega-2-CRN -- .github/workflows/ci.yml`: 0 removed lines (only the
  `secrets` job is added; `scope` and `quality` untouched).
- `run:` blocks of `secrets` containing `${{`: **0** (parser count).
- `awk … | grep -n '\${{'` over the `secrets` job: lines 30–34 (`EVENT`, `BASE`, `HEAD`, `BEFORE`,
  `SHA` under the `env:` of the range step), 56 (the `if:` of the git scan), 58 (`RANGE` under its
  `env:`). Every `${{` is inside an `env:` block or on an `if:` line; none inside a `run:`.
- Design note applied during the apply (design D5 updated): the binary is downloaded and extracted
  in `$RUNNER_TEMP`, so `gitleaks dir .` never scans the tarball or the binary itself.

## C5(b) — push without a usable `before`, by local simulation of the step (task 2.3)

A push to `main` with an all-zero `before` cannot be reproduced without touching `main`, so the
`range` step is simulated locally. The shell is the step's `run:` string, extracted with a YAML
parser from the written workflow (never retyped):

```
node -e "const y=require('js-yaml');const d=y.load(require('fs').readFileSync('.github/workflows/ci.yml','utf8'));process.stdout.write(d.jobs.secrets.steps.find(s=>s.id==='range').run)" > "$S/range-step.sh"
sha256sum range-step.sh
74399cfd29406aa8b8544cb9925a24ee0b6c1a74e30c8e6fde269b7cfa955ecc
```

Run with the options of the Actions default shell (`bash --noprofile --norc -eo pipefail`) and
`GITHUB_OUTPUT` pointing at a scratch file:

```
### push, before all zeros
No usable 'before' commit (0000000000000000000000000000000000000000): tree scan only
range=
exit=0 GITHUB_OUTPUT: range=
### push, unreachable before
No usable 'before' commit (1234567890abcdef1234567890abcdef12345678): tree scan only
range=
exit=0 GITHUB_OUTPUT: range=
### push, real parent
range=7e6d25a0393323712dc15df94e5eae55dd2b9516..bc3e3952438dbf002b2224bb9c0453f7a6954a85
exit=0 GITHUB_OUTPUT: range=7e6d25a0393323712dc15df94e5eae55dd2b9516..bc3e3952438dbf002b2224bb9c0453f7a6954a85
### pull_request, two real SHAs
range=a15993bc3b697a59ff5c8dedfb288f7395d4af12..bc3e3952438dbf002b2224bb9c0453f7a6954a85
exit=0 GITHUB_OUTPUT: range=a15993bc3b697a59ff5c8dedfb288f7395d4af12..bc3e3952438dbf002b2224bb9c0453f7a6954a85
```

With `range=` empty, the `if:` of "Scan commits of the event" is false, so the job runs the tree
scan only, says so in the log, and does not fail for lack of a range.

## C5(a) — shifted fingerprint, locally (task 3.4)

```
## 1. add one line above openspec/specs/security-gateway/spec.md:120   (uncommitted probe line)
## 2. scan
WRN leaks found: 5
openspec/specs/security-gateway/spec.md:private-key:121
openspec/specs/security-gateway/spec.md:private-key:145
openspec/specs/security-gateway/spec.md:private-key:156
## 3. regenerate tree fingerprints per fixtures/README.md (replace the moved lines)
## 4. rescan
INF no leaks found
## 5. restore
restored: identical sha256        (spec.md and .gitleaksignore, before vs after)
INF no leaks found
```

The probe line shifts all three PEM headers of that spec (120 → 121, 144 → 145, 155 → 156), the
expected `…:private-key:121` among them. `git status --porcelain openspec/specs` is empty after the
restore.

## Test results

- Task 3.5: `gitleaks dir . --redact` with the new docs and the change artifacts in place → «no
  leaks found».
- Task 4.1: `git diff --stat origin/feature/entrega-2-CRN -- tests packages` empty; no migration
  touched. No test added, changed or removed. No delta spec (`skip_specs: true`).
- Required suite: `npx vitest run` with `DATABASE_URL` → **48 files passed, 682 tests passed**,
  65–68 s. (Without `DATABASE_URL`: 40 passed, 8 skipped; 521 passed, 109 skipped — integration
  skipped by design.) No test or package file changed, so the totals are those of the base branch.
- `npm run lint`: 0 errors, 1 warning (pre-existing). `npm run typecheck`: exit 0.
  `npm run lint:architecture`: 0 errors, 4 `no-orphans` warnings (pre-existing). `npm run
  docs:coverage`: exit 0.
- Notes: no flaky behaviour.

## Data state verification

- Pre-test baseline:
  - Database entities impacted: none (CI configuration and docs only).
  - `git ls-files -s fixtures | sha1sum`: `b97101fedecb07b21ca67c6156224d81bc13a3e8`.
  - `git status --porcelain fixtures`: `M fixtures/README.md` only (the intended edit of task 3.1);
    `fixtures/acme-shop`, `fixtures/task-api`, `fixtures/history` clean.
- Post-test validation:
  - Same checksum `b97101fe…`; same `git status` (README only); fixture repositories clean.
  - `openspec/specs/security-gateway/spec.md` unmodified after C5(a).
- State restored: Yes (C5(a) probe line and `.gitleaksignore`, identical SHA-256).
- Restoration actions: `git checkout -- openspec/specs/security-gateway/spec.md`; `.gitleaksignore`
  copied back from the scratchpad backup.

## UI evidence (if applicable)

- (none: the change has no browser UI)

## CI evidence

- C1 (`secrets` on the PR of this change): pending — added in task 6.3.

## Outcome

- Status: PASS (local)
- Blocking issues: none
