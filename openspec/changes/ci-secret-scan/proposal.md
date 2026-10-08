## Why

Transcribed from DIS-87 (`[enhanced]` §1 and decision D4, decided by the author on 2026-10-08):
every PR and every push to `main` must pass a `gitleaks` secret scan in a job of its own that is never
skipped, with the already-known synthetic fingerprints ignored explicitly, so that no real secret —
not even one pasted into a `.md` — enters the repository without CI turning red. The scan cannot live
inside `quality`: since DIS-86 the `scope` job skips `quality` on docs-only pushes (`openspec/`,
`docs/`, `*.md`), and a secret pasted into a `.md` is exactly the case to catch.

The in-process scanner of DIS-84 (`security-gateway`) protects the index, not the repository; the
`fixtures/README.md` note «CI note (pending hito 2)» and the DIS-84 follow-up (PGP keys, planted
fixture keys) both point at this ticket. Parent: DIS-64 (CM-HU-05a), whose non-goals already place
`gitleaks` "only in CI, 05a.4".

## What Changes

- **New job `secrets` in `.github/workflows/ci.yml`.** No `needs`, no `if`, runs on every event of
  the workflow (`pull_request` to any base, `push` to `main`), read-only permissions, no `npm ci`.
  It installs the official `gitleaks` 8.30.1 Linux x64 binary verified against a SHA-256 written in
  the workflow, then runs `gitleaks dir .` (working tree) and `gitleaks git` over the event range:
  `base.sha..head.sha` on a PR, `before..sha` on a push to `main`, tree-only when `before` is all
  zeros or unreachable. Both with `--redact`.
- **New `.gitleaksignore` at the repository root.** 9 tree fingerprints (`path:rule:line`: the two
  planted fixture secrets, the old fake fixture key quoted in a session log, six example PEM headers
  in the `security-gateway` specs) and 8 historical fingerprints (`commit:path:rule:line`) from
  hito-2 commits in `origin/main..HEAD`, grouped under `#` comments by reason.
- **Docs.** `fixtures/README.md` replaces «CI note (pending hito 2)» with how the scan runs and how to
  regenerate each fingerprint section; `docs/project-context.md` gets a CI bullet for `secrets` and a
  gotcha (fingerprints carry line numbers); `readme.md` §2.2 Security Gateway row and the CI node of
  the diagram mention the CI scan.
- **Evidence** (ticket C1–C6): the PR of this change green; one throwaway draft PR for C2–C4, closed
  without merge; local evidence for C5(a), C5(b) and C6 pasted in the PR.

## Non-goals

- No in-process scanning during indexing (DIS-84, done with its own rules); no change to
  `packages/**`, tests, migrations or the `security-gateway` spec.
- No custom rules and no `.gitleaks.toml` (the default `private-key` rule of 8.30.1 already detects
  `-----BEGIN PGP PRIVATE KEY BLOCK-----`); no path allowlist (it would silence a real future key in
  specs).
- No rewriting of content that triggers a finding (it would touch archived specs, protected) and no
  history rewrite.
- Findings in commits no CI range walks (already on `main`, e.g. the `curl` examples of `64a9d6a4`)
  and full-history scans are out of scope. The 8 hito-2 historical fingerprints are in scope.
- No local pre-commit hook with `gitleaks`; no scanning, in CI, of the repositories Codemind analyses.
- No `gitleaks-action` (third-party action, licence key for organisations); the binary is used.
- No change to `quality`, `scope`, `frontend.yml`, `claude-auto-review.yml`,
  `claude-interactive.yml`.

## Privacy and logging impact

Positive: a new CI gate against committing credentials. `--redact` keeps every secret value out of CI
logs; the log names file, line, rule and commit only. The synthetic token used for C2–C4 never lands
in this change's files; it lives only in the throwaway PR, whose commits stay reachable at
`refs/pull/N/head` after the branch is deleted, so it is random, synthetic and not reused. No personal
data involved.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

(none — `skip_specs: true`: a CI chore with no spec-level behaviour of the product, as the DIS-87
`[original]` states: "chore de CI; no requiere spec")

## Impact

- CI: `.github/workflows/ci.yml` (new job `secrets`; existing jobs untouched). This PR touches
  `ci.yml`, so the `runtime` paths filter makes `quality` run in full.
- Repository root: new `.gitleaksignore`.
- Docs: `fixtures/README.md`, `docs/project-context.md`, `readme.md`; `prompts.md` gets this change's
  prompts with its Índice entry.
- Dependencies: none in `package.json`; a pinned external binary downloaded in CI from the official
  `gitleaks/gitleaks` GitHub release, checked by SHA-256.
- GitHub settings (manual, post-merge): `secrets` as a required check on `main` and on
  `feature/entrega-2-CRN` if they are protected, or «sin regla de protección» noted. The author does it
  with the DisTinta account from a checklist in the PR description, outside the apply; the apply only
  queries the protection (task 8.2; the API returned 404 with the active account).
- Linear: DIS-87 status and Spanish comments.
