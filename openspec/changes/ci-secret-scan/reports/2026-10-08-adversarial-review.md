# Adversarial Review — ci-secret-scan (DIS-87)

- Date: 2026-10-08
- Head reviewed: `95d5540` plus the uncommitted `/verify-against-spec` fixes
- Question: refute that the `secrets` job catches secrets on every event and that the ignore file
  cannot hide a real one.
- Verdict: **PASS WITH GAPS** — no Blocker, one **Major** (real, fixed in this change), Minors
  deferred as destination C.

## Findings and decisions

| Severity | Finding | Decision | Where |
|---|---|---|---|
| Major | The 9 tree entries of `.gitleaksignore` (`path:rule:line`) carry no part of the secret: they hide *any* secret of the same rule on that file and line, in `dir` and in `git` mode. | **A — fixed now** (author: «Allowlist por valor»): `.gitleaks.toml` allows the synthetic tree findings by exact value; `.gitleaksignore` keeps commit-bound entries only; both scans pass `--config .gitleaks.toml`. | design D10, tasks 9.x |
| Minor | `fixtures/README.md` shortcut «replace the old line number» could re-point an entry onto a real key, with only `--redact` output in view. | A — the shortcut is gone with D10; the README requires an unredacted local run before allowing a finding. | `fixtures/README.md` |
| Minor | A PR can add or edit `.gitleaks.toml` / `.gitleaksignore` / the job and pass in that same PR; no CODEOWNERS, no branch protection. | C — explicit debt. (`--config` explicit now makes a deleted config fail.) | design Follow-ups, DIS-87 comment |
| Minor | Default allowlist skips lockfiles. | C, documented in `fixtures/README.md`. | idem |
| Minor | Direct pushes to branches other than `main` are not scanned. | C. | idem |
| Question | A secret added only in a merge-conflict resolution is not in `git log -p`. | C (untested). | idem |
| Minor | Design edited after implementation (process). | Recorded: every post-apply edit is in the change artifacts before code (base-standards §7), committed with this round. | — |

## RED — the hole, before the fix

Probe (`probe.sh`, scratchpad): a mini repository with the five affected files at their real
relative paths and the configuration under test; commit 1 = originals, commit 2 = a different
synthetic value of the same shape for each short value (AWS ×2 in the alphabet `[A-Z2-7]`, generic
×1) and one changed character in the body of the PEM block at `openspec/specs/security-gateway/
spec.md:120`. Values are never printed. Configuration under test: the `.gitleaksignore` of `95d5540`
(17 lines, no `.gitleaks.toml`).

```
config: (defaults) ; .gitleaksignore lines: 17
-- baseline dir (originals)
INF no leaks found
   probe: docs/ai-sessions/01-revision-fixtures-y-prompt-correccion.md
   probe: fixtures/task-api/src/config/env.ts
   probe: fixtures/acme-shop/config/services.php
   probe: openspec/specs/security-gateway/spec.md
-- validity: dir after probe, ignore file moved aside (every probe must be found)
WRN leaks found: 13      (generic env.ts:7, aws services.php:21, aws session log:116, private-key …)
-- dir after probe
INF no leaks found       <- RED: four different values hidden
-- git HEAD~1..HEAD
INF no leaks found       <- RED
```

Same hole shown directly on the repository: a different AWS-shaped key on
`fixtures/acme-shop/config/services.php:21` (uncommitted, restored) → «no leaks found» with
`.gitleaksignore`, «leaks found: 1» on that file without it.

## GREEN — after the fix

Two attempts failed before green; both are recorded because they changed the design:

1. Entries with `condition = "AND"`, `paths` = exact file, `regexes` = exact value. gitleaks 8.30.1
   logged `skipping file: global allowlist path=fixtures\acme-shop\config\services.php`: global
   allowlist `paths` are applied as a whole-file skip in `dir` mode, ignoring `AND` — it would have
   hidden whole files. → Entries are value-only (design D10).
2. Value-only entries, but the long PEM ones did not match. Bisection showed the first failing
   character at offset 306, `lines 3–5`: the generator had read gitleaks' JSON with Windows' default
   code page, so `–` became `â€“`. → JSON read as UTF-8; non-ASCII written as `\x{2013}` so the file
   is ASCII. Documented in `fixtures/README.md` and the project-context gotcha.

Final configuration: `.gitleaks.toml` (13 value-only allowlists, `[extend] useDefault = true`),
`.gitleaksignore` with 1 commit-bound entry (`cb4e6aa…:private-key:126`; the 7 other historical
findings carry values `.gitleaks.toml` allows), `--config .gitleaks.toml` on both scans.

```
config: --config .gitleaks.toml ; .gitleaksignore lines: 8   (before trimming to 1; same result after)
-- baseline dir (originals)
INF no leaks found
-- dir after probe
WRN leaks found: 5
    generic-api-key fixtures/task-api/src/config/env.ts 7
    aws-access-token fixtures/acme-shop/config/services.php 21
    aws-access-token docs/ai-sessions/01-revision-fixtures-y-prompt-correccion.md 116
    private-key openspec/specs/security-gateway/spec.md 120   (two overlapping matches)
    private-key openspec/specs/security-gateway/spec.md 120
-- git HEAD~1..HEAD
WRN leaks found: 3
    aws-access-token docs/ai-sessions/01-revision-fixtures-y-prompt-correccion.md 116
    aws-access-token fixtures/acme-shop/config/services.php 21
    generic-api-key fixtures/task-api/src/config/env.ts 7
```

The PEM body probe is not seen by `git` mode: only the added line of the diff is scanned and it does
not contain the `BEGIN` header. That is a limit of gitleaks' commit scan, not of the configuration
(with the defaults alone it is not seen either); the tree scan catches it. Documented and listed in
Follow-ups.

Repository, final configuration:

```
$ gitleaks dir . --config .gitleaks.toml --redact --no-banner                          → no leaks found
$ gitleaks git . --config .gitleaks.toml --redact --no-banner --log-opts="bc3e395..HEAD"   → no leaks found
$ gitleaks git . --config .gitleaks.toml --redact --no-banner --log-opts="origin/main..HEAD" → no leaks found  (C6)
$ gitleaks dir . --config <missing> …  → FTL unable to load gitleaks config … exit=1
$ gitleaks dir .gitleaks.toml (defaults) → skipped by the default allowlist; the escaped values do not
  match the rules in any case
```

C5(a) with the new behaviour (uncommitted edits, restored, sha256 identical):

```
-- line inserted above openspec/specs/security-gateway/spec.md:120 → INF no leaks found
-- one character of the matched PEM text changed                  → WRN leaks found: 2 (private-key, line 120)
```

Static checks: YAML parse OK, `secrets` has no `needs`/`if`, 0 `run:` blocks with `${{`, 0 removed
lines against the base, the `${{` lines of the job are in `env:` blocks or on the `if:` line.

## State

- `.gitleaksignore` was moved aside and back several times for the local runs; checked each time by
  SHA-256. One debugging command ran in the repository root instead of the probe directory (a glob
  picked a `.json` file and `cd` failed); it only moved `.gitleaksignore` out and back — verified
  intact. The probe script now aborts on a failed `cd`.
- Unredacted reports stayed in the scratchpad; `tree.json` deleted after use.

## CI on the final head

PR #26, head `426b7f1`, [run 37768286114](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/37768286114): `secrets` success — `gitleaks_8.30.1_linux_x64.tar.gz: OK`,
`8.30.1`, range `bc3e395..426b7f1`, both scans with `--config .gitleaks.toml`, tree «no leaks found»,
git «9 commits scanned.» «no leaks found», no `npm ci`/`npm install`; `scope` success; `quality`
success (1 min 38 s, ran in full because `ci.yml` changed); Frontend success.
