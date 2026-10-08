## Context

See proposal.md (Why, What Changes). Current state that shapes the approach:

- `.github/workflows/ci.yml` has two jobs. `scope` decides whether `quality` runs: on a
  `pull_request` `synchronize` whose diff (`before..after`) only touches `openspec/**`, `docs/**` or
  `*.md`, with `quality` green or skipped on the previous head, it outputs `code=false` and `quality`
  is skipped. `quality` (`needs: scope`) runs `npm ci`, lint, typecheck, depcruise, migrations, tests,
  Stryker. Triggers: `pull_request` (any base) and `push` to `main`. Workflow permissions:
  `contents`, `pull-requests`, `checks: read`.
- Local scan on 2026-10-08, `gitleaks` 8.30.1, `gitleaks dir . --redact` on `feature/entrega-2-CRN`
  (`bc3e395`): 13 findings, 9 unique fingerprints, the same list as the DIS-87 reality map (re-run
  while writing this design). `origin/main` = `a15993b`; `origin/main..HEAD` = 318 commits.
- Official release asset `gitleaks_8.30.1_linux_x64.tar.gz`, SHA-256 from the release
  `gitleaks_8.30.1_checksums.txt` (fetched 2026-10-08):
  `551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb`.
- Precedent for a no-spec change: `archive/2026-10-04-analyzer-port-edges-tsdoc` (`skip_specs: true`).

## Goals / Non-Goals

**Goals:**

- A `secrets` check that runs on every CI event, independent of `scope`, and fails on any finding
  not allowed by exact value in `.gitleaks.toml` or fingerprinted by commit in `.gitleaksignore`,
  in the tree or in the commits of the event range (design D10).
- Both scans report even when the other one failed, so one run shows the whole picture.
- Every acceptance criterion of DIS-87 (C1–C6) backed by a CI run link or pasted local output.

**Non-Goals:**

- No reusable script file for the range logic (it stays inline in the workflow, like `scope`).
- No caching of the binary between runs (download is ~7 MB; `< 1 min` budget holds without it).
- No ADR: a single CI job, reversible by deleting it; decisions recorded here and in DIS-87.

## Decisions

D1–D4 below were decided by the author in DIS-87 (`[enhanced]` §3, 2026-10-08) and are transcribed;
D5–D9 are design choices of this change within those limits.

**D1 — What is scanned (author).** `gitleaks dir .` (working tree) plus `gitleaks git` over the
event range: PR → `github.event.pull_request.base.sha..github.event.pull_request.head.sha`; push to
`main` → `github.event.before..github.sha`; tree only when `before` is all zeros or not a reachable
commit. Fingerprints `path:rule:line` also filter in git mode (checked by the author: 17 → 10 on
`origin/main..HEAD`); the remaining hito-2 findings go in a historical section with
`commit:path:rule:line` (history is never rewritten, so the SHAs are stable). The job never runs
`npm ci`: `dir` would otherwise scan `node_modules` and untracked files.

**D2 — The 11 findings outside `fixtures/` (author).** Fingerprints in `.gitleaksignore`, grouped
under `#` comments by reason. Rejected: a path allowlist in `.gitleaks.toml` (would silence a real
future key in specs); rewriting the content (touches archived specs).

**D3 — Installation (author).** Official binary 8.30.1, verified with `sha256sum -c` against the
SHA-256 above, **written in the workflow** (never downloaded in the same step). No `gitleaks-action`.

**D4 — Own job, never skipped (author, blocking).** Not inside `quality`, no `needs: scope`, no `if`.
Making it a required check is a manual post-merge step of the author (Migration Plan), outside the
apply.

**D5 — Job layout.** One job, `secrets`, in `ci.yml` (same workflow, so its check shows next to
`quality` and needs no new trigger block):

```yaml
secrets:
  runs-on: ubuntu-latest
  timeout-minutes: 5
  steps:
    - uses: actions/checkout@v4
      with: { fetch-depth: 0 }
    - name: Install gitleaks 8.30.1 (pinned SHA-256)
      id: install
      # curl -sSfL <release URL> -o <tarball>
      # echo "<sha256>  <tarball>" | sha256sum -c -
      # all in $RUNNER_TEMP: tar -xzf <tarball> gitleaks ; ./gitleaks version
    - name: Commit range of this event
      id: range
      # env: EVENT, BASE, HEAD (PR) / BEFORE, SHA (push)
      # writes range=<a>..<b> or range= (empty) to $GITHUB_OUTPUT and logs which
    - name: Scan working tree
      run: '"$RUNNER_TEMP/gitleaks" dir . --redact --no-banner -v'
    - name: Scan commits of the event
      if: ${{ !cancelled() && steps.install.outcome == 'success' && steps.range.outputs.range != '' }}
      env:
        RANGE: ${{ steps.range.outputs.range }}
      run: '"$RUNNER_TEMP/gitleaks" git . --redact --no-banner -v --log-opts="$RANGE"'
```

The range step runs **before** the tree scan so a failing tree scan does not hide the git scan
(`!cancelled()` overrides the implicit `success()`; the `install` guard keeps a failed download from
producing a second, misleading failure). The binary is downloaded and extracted in `$RUNNER_TEMP`,
outside the checkout, so `gitleaks dir .` never scans the tarball or the binary itself. Inherits the workflow `permissions` (read only); uses no
token. No `${{ … }}` appears inside a `run:` of the job: values from `github.event` and step outputs
reach the shell through `env:` (same pattern as `scope`); expressions appear only in `env:` and `if:`. Alternatives rejected: one step running both scans (the first non-zero exit
stops it, or needs `set +e` bookkeeping, and the log no longer says which mode failed); a separate
workflow file (a second trigger block to keep in sync with `ci.yml`).

**D6 — Range step.** On `pull_request`: `range=$BASE..$HEAD` (both SHAs are fetched by
`fetch-depth: 0`; the checkout is the merge ref, whose parents are the base and head). On `push`:
if `BEFORE` matches `^0+$` or `git cat-file -e "$BEFORE^{commit}"` fails (first push, force-push to a
commit no longer present) → `range=` and log `No usable 'before' commit (<before or none>): tree scan only`; otherwise
`range=$BEFORE..$SHA`. Any other event → `range=` with the same kind of log line. The step never
fails for lack of a range (C5(b)).

**D7 — `.gitleaksignore` content (tree section superseded by D10).** The 17 lines of DIS-87 `[enhanced]` §3, in its three tree groups
plus the historical group, with its `#` headers. Regenerated right before committing: tree section
from `gitleaks dir . --redact -f json` (`Fingerprint` field); historical section from
`gitleaks git . --redact --log-opts="origin/main..HEAD" --gitleaks-ignore-path <file with the tree
section only> -f json`, both with the root `.gitleaksignore` moved aside: gitleaks always reads it, even
with `--gitleaks-ignore-path` (found during the apply; `fixtures/README.md` gives the full recipe). If the result differs from DIS-87 (an edit moved a line, a new hito commit
added a finding), the regenerated set wins and the difference is reported in a Spanish Linear comment.
Two rules written in `fixtures/README.md` alongside the recipe (added during the apply, accepted by
`/verify-against-spec` as design choices): a single shifted line can be fixed by replacing its old
line number with the one `gitleaks dir . --redact` now reports (what C5(a) did), without
regenerating the section; and a finding is checked to be synthetic before it is fingerprinted — a
real secret is rotated and removed, never ignored (the reason D2 rejects allowlists, applied to the
file itself).

**D8 — Evidence plan for C2–C4.** One draft PR from a throwaway branch `chore/DIS-87-secret-probe`
created from the head of `feature/DIS-87-ci-secret-scan`, **with that branch as the PR base**, so the
PR range holds only the probe commits and the workflow under test is this change's `ci.yml`. The
token is generated on the spot (`api_key = "<≥ 20 random alphanumerics>"`), checked locally to fire
`generic-api-key`, and never written into this change's files, reports, `prompts.md` or Linear.
Commit sequence, one push each, waiting for CI in between:

| # | Commit | Expected `secrets` | Expected `quality` | Criterion |
|---|---|---|---|---|
| 1 | add `packages/secret-probe.ts` with the token (exported, so lint does not flag an unused var) | red, `dir` and `git` both name the file, line, `generic-api-key` | any | C2 |
| 2 | delete `packages/secret-probe.ts` | `dir` green; `git` red (range still holds #1) | **green** (needed by `scope` for #3) | — |
| 3 | add the token to a new `docs/secret-probe.md` | `dir` red naming `docs/secret-probe.md` | skipped (`scope` → `code=false`) | C3 |
| 4 | delete `docs/secret-probe.md` | `dir` green; `git` red naming the commits #1 and #3 | skipped | C4 |

Then the PR is closed without merge and the branch deleted; the run links of #1, #3 and #4 go in the
step report and the PR of this change, with the note that the commits stay at `refs/pull/N/head`.
Pushing and opening the draft PR are confirmed with the author first (outward-facing), using the
DisTinta `gh` account and switching back to Cristina-JumpMath afterwards.

**D9 — Local evidence for C5 and C6.** C5(a): add one line above `openspec/specs/security-gateway/
spec.md:120` without committing, run `gitleaks dir . --redact`, see `…:private-key:121`, regenerate
per `fixtures/README.md`, see «no leaks found», then `git checkout --` the file and restore the
ignore file (both checked by `git status`). C5(b) is shown by local simulation of the step, because
a push to `main` with an all-zero `before` cannot be reproduced without touching `main`: the shell is
extracted with a YAML parser from the `ci.yml` already written (`jobs.secrets.steps[id=range].run`,
the exact string the runner executes) into a scratchpad file, never retyped by hand; the step 5
report records the extraction command and the `sha256sum` of the extracted script. It is then run in
Git Bash with `EVENT=push` and `BEFORE` = forty zeros, then an unreachable SHA, then a real parent,
and with `EVENT=pull_request` and two real SHAs; the four outputs are recorded. C6: `gitleaks git . --redact --log-opts="origin/main..HEAD"` and `gitleaks dir . --redact`
with the final ignore → «no leaks found» both.

**D10 — Value-bound allowlist instead of tree fingerprints (author, 2026-10-08, after
`/adversarial-review`).** A `path:rule:line` fingerprint carries no part of the secret: it hid *any*
secret of the same rule on that line, in `dir` and in `git` mode (shown locally: a different AWS key
on `fixtures/acme-shop/config/services.php:21` gave «no leaks found»). The tree findings move to
`.gitleaks.toml`: `[extend] useDefault = true` plus one `[[allowlists]]` entry per unique value (13),
each with `regexes` = the exact secret (anchored `^…$`; target `secret`, which equals the whole match
for `private-key`). No `paths`: the first GREEN run showed that gitleaks 8.30.1 applies a global
allowlist's `paths` as a whole-file skip in `dir` mode even with `condition = "AND"`, which would have
hidden the whole file. In the file the values are escaped (a backslash before each regex
metacharacter, one bracketed character in short values, `\x{…}` for non-ASCII so the file stays
ASCII) so the config does not match the rules itself. A different value on the same line, or a real key inside one of the
long PEM matches of the specs, now turns the job red; moving a line no longer does. Both scans pass
`--config .gitleaks.toml` explicitly, so deleting the file fails the job instead of silently falling
back to the defaults. `.gitleaksignore` keeps only commit-bound fingerprints, which cannot hide new
commits: 1 entry (`cb4e6aa…:private-key:126`), because the other 7 historical findings carry the
same synthetic values that `.gitleaks.toml` now allows. Limit kept: `git` mode scans only the added
lines of a diff, so changing one body line of an existing PEM block is caught by the tree scan, not by
the commit scan. Rejected: a guard that pins the hash of each ignored line (tree only; a commit in
the range with a real key on that line would still pass in `git` mode); documenting the gap only.
Trade-off: the PEM entries are long (they are whole matched blocks of spec text), and editing the
matched text in those specs turns the job red until the entry is regenerated.

## Risks / Trade-offs

- [Superseded by D10] Tree fingerprints carried line numbers and hid any secret on that line. Now the
  allowlist is bound to the exact value: editing the matched text (not moving it) turns CI red, which
  is the intended signal; regeneration is in `fixtures/README.md`.
- [This change's own docs and artifacts could add a finding (e.g. an example key in prose)] →
  Placeholders only (`<sha256>`, `<random>`); `gitleaks dir . --redact` runs on the branch before
  every push; the PR's own `secrets` run is C1.
- [A new hito-2 commit with a finding lands on `feature/entrega-2-CRN` after this change] → C6 is
  re-run before the hito PR to `main`; the regeneration command for the historical section is in
  `fixtures/README.md`.
- [GitHub release download fails or the asset changes] → `curl -f` fails the step; a changed asset
  fails `sha256sum -c` (by design). Re-run the job; never update the SHA without re-reading the
  official `checksums.txt`.
- [`base.sha` of a PR is the base tip at event time; a later base update is not rescanned by that
  run] → The next push or the push to `main` scans its own range; acceptable.
- [The throwaway token stays reachable at `refs/pull/N/head`] → Synthetic, random, never reused,
  `--redact` keeps it out of logs.
- [The Linear–GitHub integration links any PR whose title or branch carries `DIS-87`; closing the
  throwaway PR #27 moved DIS-87 from In Review back to In Progress (10:08, found by
  `/verify-against-spec`)] → State set back to In Review with a Spanish comment; check the state
  after closing any PR linked to the ticket.
- [Required check: if `secrets` is required and a PR predates this job, it waits for a check that
  never reports] → Add the required check only after this PR merges; rebase/push older PRs.
- [C5(b) is proven by local simulation, not by a CI run on `main`] → Not reproducible without
  touching `main`; the simulated shell is the `run:` of the `range` step parsed from `ci.yml` (its
  `sha256sum` recorded), so only the GitHub-provided values are simulated.

## Migration Plan

Merge the PR into `feature/entrega-2-CRN`; the job runs from then on in every PR. Required check,
manual and post-merge, outside the apply: the PR description carries a checklist for the author —
add `secrets` as a required check on `main` and on `feature/entrega-2-CRN` if they are protected, or
note «sin regla de protección». The Linear–GitHub integration moves DIS-87 to Done on merge; task 8.4
moves it back to In Review until the author confirms that checklist. Rollback: delete the `secrets`
job and `.gitleaksignore` (and the required check); nothing else depends on them.

## Open Questions

- Whether `main` and `feature/entrega-2-CRN` have branch protection (API returned 404 with the active
  account). Does not change what is built: task 8.2 only queries it (read-only GET with the DisTinta
  account) and records the result; the author acts on it from the post-merge checklist.

## Follow-ups

Deferred Minors of `/adversarial-review` (2026-10-08), destination **C** (explicit debt): a Spanish
checklist comment on DIS-87, the same list here. None is a hole this change introduces; each is a
limit of the scan or of the repository's settings.

- [ ] A PR can weaken its own scan: editing `.gitleaks.toml`, `.gitleaksignore` or the `secrets` job
  passes in that same PR. Mitigation today: human review (no branch protection, no CODEOWNERS).
- [ ] Add a CODEOWNERS entry for `.gitleaks.toml`, `.gitleaksignore` and `.github/workflows/ci.yml`
  (needs branch protection to bite).
- [ ] Direct pushes to `feature/entrega-2-CRN` (or any branch other than `main`) are not scanned: the
  workflow triggers on `pull_request` and on `push` to `main` only.
- [ ] A secret introduced only while resolving a merge conflict: `gitleaks git` reads `git log -p`,
  which shows no diff for merge commits. Not tested; the tree scan catches it while it is in the tree.
- [ ] gitleaks' default allowlist skips lockfiles (documented in `fixtures/README.md`): a credential
  in a `resolved` URL of `package-lock.json` is not reported.
- [ ] `git` mode scans only added lines: a body-line change inside an existing PEM block is caught by
  the tree scan, not by the commit scan (documented in `fixtures/README.md`).

