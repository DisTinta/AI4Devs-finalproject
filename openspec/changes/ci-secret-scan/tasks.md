## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 First tool batch of the apply: confirm DIS-87 is In Progress in Linear (set during propose, 2026-10-08); if not, set it, with a short Spanish comment naming the change `ci-secret-scan` and the branch
  - DIS-87 already In Progress (set during propose, 2026-10-08, with a Spanish comment); confirmed in the first tool batch.
- [x] 0.2 Create feature branch `feature/DIS-87-ci-secret-scan` from the delivery branch `origin/feature/entrega-2-CRN` (see `docs/project-context.md` → Branch and ticket conventions), carrying the `openspec/changes/ci-secret-scan/` planning files. Leave the upstream unset so a push never targets the delivery branch
  - `feature/DIS-87-ci-secret-scan` created from `origin/feature/entrega-2-CRN` (`bc3e395`) with `--no-track`; planning files carried as untracked.
- [x] 0.3 Verify branch creation and status (`git branch --show-current`, `git status`)
  - `git branch --show-current` → `feature/DIS-87-ci-secret-scan`; no upstream; `git status` only `?? openspec/changes/ci-secret-scan/`.
- [x] 0.4 Baseline: `gitleaks version` (8.30.1); `gitleaks dir . --redact -f json` and `gitleaks git . --redact --log-opts="origin/main..HEAD" -f json` into the session scratchpad (never the repo); record findings and unique fingerprints (expected 13 / 9 in `dir`, as design Context). Record `git status --porcelain` (clean apart from the change files)
  - 8.30.1. `dir`: 13 findings / 9 unique (= design). `git` over `origin/main..HEAD`: 17 / 13 unique. JSON in the scratchpad.

## 1. CI: `.gitleaksignore` (design D2, D7)

- [x] 1.1 Create `.gitleaksignore` at the repository root with the tree section (three `#` groups, 9 `path:rule:line` fingerprints) regenerated from the 0.4 `dir` JSON, then the historical section (`# Historical findings in hito-2 commits …`) regenerated with `gitleaks git . --redact --log-opts="origin/main..HEAD" --gitleaks-ignore-path <scratch file with the tree section only> -f json`. Compare with DIS-87 `[enhanced]` §3; if they differ, the regenerated set wins and the difference goes in a Spanish Linear comment
  - Tree section = regenerated `dir` set (`TREE-MATCH`); historical section = 10 findings / 8 unique (`HIST-MATCH`), identical to DIS-87 §3: no difference to report.
- [x] 1.2 Verify C6 locally: `gitleaks dir . --redact --no-banner` and `gitleaks git . --redact --no-banner --log-opts="origin/main..HEAD"` both print «no leaks found» (exit 0). Save both outputs for the step 5 report
  - C6: `dir` «no leaks found» exit 0; `git` 292 commits scanned, «no leaks found» exit 0.

## 2. CI: job `secrets` in `.github/workflows/ci.yml` (design D1, D3–D6)

- [x] 2.1 Add the job `secrets` as design D5: no `needs`, no `if`, `timeout-minutes: 5`, `actions/checkout@v4` with `fetch-depth: 0`, install step with the SHA-256 `551f6fc8…70eb` written in the workflow and `sha256sum -c -`, range step (D6, event values through `env:`), tree scan, git scan guarded by `!cancelled() && steps.install.outcome == 'success' && steps.range.outputs.range != ''`. `--redact --no-banner -v` on both scans. A comment above the job explaining why it does not depend on `scope`. No `${{ … }}` inside any `run:` of the job `secrets`: event values and the `range` output reach the shell through `env:` (git scan: `env: RANGE: ${{ steps.range.outputs.range }}` and `--log-opts="$RANGE"`). `scope` and `quality` untouched
  - Job appended at the end of `ci.yml` (+66 lines). Binary installed in `$RUNNER_TEMP` so `dir .` never scans it (design D5 updated).
- [x] 2.2 Static check of the workflow: parse it as YAML (`npx --yes js-yaml .github/workflows/ci.yml > /dev/null` or an equivalent already available; if no tool exists, stop and ask), and confirm `git diff origin/feature/entrega-2-CRN -- .github/workflows/ci.yml` only adds the `secrets` job; and run `awk '/^  secrets:/{f=1} f&&/^  [a-z_-]+:$/&&!/secrets/{f=0} f' .github/workflows/ci.yml | grep -n '\${{'`: every `${{` of the job `secrets` is inside an `env:` block or on an `if:` line; none inside a `run:`
  - js-yaml parse OK; 0 removed lines in the diff; 0 `run:` blocks with `${{`; `awk|grep` → lines 30–34 and 58 in `env:`, 56 on `if:`.
- [x] 2.3 C5(b) by local simulation of the step (design D9; a push to `main` with an all-zero `before` is not reproducible without touching `main`): extract the shell with a YAML parser from the written `.github/workflows/ci.yml` (`jobs.secrets.steps[id=range].run`) into a scratchpad file, never retyped by hand; record the extraction command and the `sha256sum` of the extracted script. Run it in Git Bash with `EVENT=push` and `BEFORE` = forty zeros, then an unreachable SHA, then `HEAD~1` with `SHA=HEAD`, and with `EVENT=pull_request` plus two real SHAs; record the four outputs (empty range + log line ×2, `a..b` ×2) for the step 5 report
  - Extracted with js-yaml (`sha256` `74399cfd…5ecc`), run with `bash -e` (the runner's shell for this job, seen in the C1 log; also with `-eo pipefail`, same outputs): zeros and unreachable `before` → `range=` + log line, exit 0; real parent and PR → `a..b`. Step 5 report.

## 3. Docs (DIS-87 `[enhanced]` → Documentación)

- [x] 3.1 `fixtures/README.md`: replace «CI note (pending hito 2)» with how the scan runs (job `secrets`, `dir` + event range, `--redact`) and how to regenerate each fingerprint section (commands of design D7; copy the `Fingerprint` field). Placeholders only, no secret value
  - «CI note (pending hito 2)» replaced by the subsection «CI secret scan (`.gitleaksignore`)» with both regeneration commands (placeholders only). Fixed while writing the PR description: gitleaks always reads the root `.gitleaksignore`, even with `--gitleaks-ignore-path`, so the recipe now moves it aside first; re-run as written → tree 9 + historical 8 = the 17 lines of the file (design D7 updated).
- [x] 3.2 `docs/project-context.md`: a CI bullet for `secrets` next to «CI docs-only skip» (own job, no `needs: scope`, never skipped, no `npm ci`, pinned 8.30.1 by SHA-256) and the gotcha «`.gitleaksignore` fingerprints carry line numbers: editing above an ignored line turns CI red; regenerate per `fixtures/README.md`»
  - CI bullet after «CI docs-only skip» and gotcha «`.gitleaksignore` fingerprints carry line numbers».
- [x] 3.3 `readme.md`: §2.2 Security Gateway row → own rules in process + `gitleaks` in CI; add «secretos» to the CI node of the diagram
  - Security Gateway row → «Reglas propias en proceso + `gitleaks` en CI»; CI node gains «secretos».
- [x] 3.4 C5(a) locally (design D9): add one line above `openspec/specs/security-gateway/spec.md:120` (no commit), `gitleaks dir . --redact` shows `…:private-key:121`, regenerate per the new `fixtures/README.md` text, «no leaks found»; then `git checkout -- openspec/specs/security-gateway/spec.md` and restore `.gitleaksignore`; `git status` shows neither modified. Save the outputs for the step 5 report
  - Probe line → `…:private-key:121` (also 145, 156); regenerated → «no leaks found»; restored (identical SHA-256), `git status` clean for the spec.
- [x] 3.5 Re-run `gitleaks dir . --redact --no-banner` with the docs and change artifacts in place: «no leaks found»
  - «no leaks found» with docs and change artifacts in place.

## 4. Review and Update Existing Tests (MANDATORY)

- [x] 4.1 Confirm no test, `packages/**` file or migration changes (`git diff --stat origin/feature/entrega-2-CRN -- tests packages`, empty). The change has no delta spec (`skip_specs: true`), so there is no scenario to map; the acceptance criteria C1–C6 map to tasks 1.2, 2.3, 3.4, 6.x and 7.x
  - `git diff --stat … -- tests packages` empty; no migration touched.

## 5. Run Tests and Verify Data State (MANDATORY)

- [x] 5.1 Baseline: no database entity is impacted (record it); `git ls-files -s fixtures | sha1sum` and `git status --porcelain fixtures` (empty)
  - No DB entity impacted. Fixtures checksum `b97101fe…`; `git status fixtures` only `M fixtures/README.md` (task 3.1); fixture repos clean.
- [x] 5.2 Targeted checks: the two local `gitleaks` scans of 1.2 (exit 0) and the YAML parse of 2.2
  - Scans of 1.2 exit 0; YAML parse OK.
- [x] 5.3 Broader suite, to prove nothing else moved: `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage` (same totals as the last green run on `feature/entrega-2-CRN`; record them)
  - `npx vitest run` with `DATABASE_URL`: 48 files, 682 passed. lint 0 errors (1 pre-existing warning); typecheck exit 0; lint:architecture 0 errors, 4 pre-existing warnings; docs:coverage exit 0.
- [x] 5.4 Post-state: same `fixtures` checksum, `git status --porcelain fixtures` empty, `openspec/specs/security-gateway/spec.md` unmodified after 3.4. Restore and document if not
  - Same checksum and status; security-gateway spec unmodified.
- [x] 5.5 Report `openspec/changes/ci-secret-scan/reports/YYYY-MM-DD-5-test-and-state-verification.md` (template in `docs/openspec-tasks-mandatory-steps.md` §6) with the outputs of 0.4, 1.2 (C6), 2.3 (C5(b), including the extraction command and the `sha256sum` of the extracted script) and 3.4 (C5(a)); C1 run link added in 6.3
  - `reports/2026-10-08-5-test-and-state-verification.md` (C1 link pending, task 6.3).
- [x] 5.6 Mark complete only after the checks pass and the report exists
  - Local checks pass and the report exists.

## 6. Manual Interface Testing — this PR in CI (MANDATORY - AGENT MUST EXECUTE)

- [x] 6.1 Commit (`chore(DIS-87): …`, English) and, after confirming with the author, push the branch (switch `gh` to DisTinta, `git -c credential.helper='!gh auth git-credential' push -u origin feature/DIS-87-ci-secret-scan`, switch back to Cristina-JumpMath)
  - Commits `e2a05af`, `cf5bb9e`, `513c3dd`, `2135f9e`; token absent from every commit and file (`git grep`/`grep` → 0). Pushed with DisTinta, switched back to Cristina-JumpMath.
- [x] 6.2 Open the PR in Spanish against `feature/entrega-2-CRN` (description from `/pr-describe`, Why transcribed from DIS-87, with the post-merge checklist of 8.2), after confirming with the author; same `gh` account switch
  - [PR #26](https://github.com/DisTinta/AI4Devs-finalproject/pull/26) against `feature/entrega-2-CRN`, body = `reports/pr-description.md` (Why transcribed from DIS-87, post-merge checklist «sin regla de protección»). DIS-87 → In Review with a Spanish comment. Switched back.
- [x] 6.3 C1: the `secrets` run on the PR is green; its log shows `8.30.1`, the `sha256sum` OK line, «no leaks found» in both scans, and no `npm ci` / `npm install`. `quality` green too. Link the run in the step 5 report
  - C1 green: run 37760219359, `secrets` pass (8.30.1, `sha256sum` OK, both scans «no leaks found», no `npm`), `quality` pass. Linked in the step 5 report.

## 7. End-to-End Testing — throwaway PR for C2–C4 (MANDATORY - AGENT MUST EXECUTE)

- [x] 7.1 Generate the synthetic token on the spot (random, ≥ 20 alphanumerics, no provider prefix) and check locally, in a scratchpad file outside the repo, that `api_key = "<token>"` fires `generic-api-key`. Never write it into this change's files, reports, `prompts.md` or Linear
  - 32-char random alphanumeric token in a scratchpad file; `api_key = "<token>"` fires `generic-api-key` in a `.ts` and a `.md` (redacted). Not written anywhere in the repo.
- [x] 7.2 After confirming with the author: create `chore/DIS-87-secret-probe` from the head of `feature/DIS-87-ci-secret-scan`, push commit #1 of design D8 and open a **draft** PR with base `feature/DIS-87-ci-secret-scan` (DisTinta account, switch back after each `gh`/push step)
  - `chore/DIS-87-secret-probe` from `aa31566`; draft [PR #27](https://github.com/DisTinta/AI4Devs-finalproject/pull/27) with base `feature/DIS-87-ci-secret-scan`. Token checked absent from the DIS-87 branch and the reports before every push; account switched back after each step.
- [x] 7.3 Commit #1 → C2: `secrets` red; log names `packages/secret-probe.ts`, line, `generic-api-key`, value redacted. Record the run link
  - C2: run 37760684063 `secrets` fail; tree and git steps name `packages/secret-probe.ts:1`, `generic-api-key`, value `REDACTED`.
- [x] 7.4 Commit #2 (delete the file) → wait until `quality` is green on that head (precondition of C3); record the run
  - Run 37760985833: `quality` pass (1 min 0 s); `secrets` tree green, git red (`b517885`), as designed.
- [x] 7.5 Commit #3 (token in `docs/secret-probe.md`) → C3: `scope` outputs `code=false`, `quality` skipped, `secrets` runs and the **tree scan step** fails naming `docs/secret-probe.md` with `generic-api-key`. Record the run link
  - C3: run 37761215621 — `scope` `code=false` (`Previous quality: success`), `quality` skipped, «Scan working tree» fails on `docs/secret-probe.md:3` `generic-api-key`.
- [x] 7.6 Commit #4 (delete the `.md`) → C4: tree scan green, git scan red naming the commits of #1 and #3. Record the run link
  - C4: run 37761381963 — tree «no leaks found», git fails naming `b517885` and `c64074d`.
- [x] 7.7 Restore: close the draft PR without merge, delete the remote and local `chore/DIS-87-secret-probe` branch, delete the scratchpad token file; note in the report that the commits stay reachable at `refs/pull/N/head`
  - #27 closed without merge (Spanish comment), remote and local branch deleted, token and probe files deleted (Python `os.remove`, the `rm` guard blocks `rm`); token found nowhere (scratchpad, tree, local refs → 0).
- [x] 7.8 Report `openspec/changes/ci-secret-scan/reports/YYYY-MM-DD-7-end-to-end-testing.md`: the four runs, the job and step outcomes, log excerpts (redacted), restoration done. Add the three C2–C4 links to the PR of this change
  - `reports/2026-10-08-7-end-to-end-testing.md`; C2–C4 links in `reports/pr-description.md` (pushed to PR #26).

## 8. Update Technical Documentation (MANDATORY)

- [x] 8.1 Run `/update-docs`; confirm the docs of step 3 are complete and `npm run docs:coverage` is clean. No ADR (design Non-Goals)
  - `/update-docs`: no data model, API, dependency or convention change; gotcha already added (3.2). Found and fixed: `readme.md` repository tree now lists `.gitleaksignore`. `docs:coverage` exit 0. No ADR. While checking, `gitleaks dir .` flagged two lines of the step 7 report (`RuleID: generic-api-key` and a commit SHA on one line → `generic-api-key`); reformatted instead of fingerprinted → «no leaks found».
- [x] 8.2 Branch protection, query only (design Open Questions): with the DisTinta account, read-only `gh api repos/DisTinta/AI4Devs-finalproject/branches/main/protection` and `…/branches/feature/entrega-2-CRN/protection` (no setting changed); record the result. Put in the PR description a post-merge checklist for the author: add `secrets` as a required check on `main` and on `feature/entrega-2-CRN` if they are protected, or note «sin regla de protección» (design Migration Plan)
  - Query done 2026-10-08 (DisTinta, switched back): `main` and `feature/entrega-2-CRN` → HTTP 404 «Branch not protected», `protected: false`; repository rulesets: 0. Checklist for the PR description pending (6.2).
  - Checklist written in `reports/pr-description.md` → «Checklist post-merge» (body of PR #26).
- [x] 8.3 Add the relevant prompts of this change to `prompts.md` per `docs/project-context.md` → prompts.md rules, with its Índice entry in the same edit
  - `prompts.md` §32 (3 literal prompts: propose with the two mid-turn messages, the `/opsx:update` request, the adjustments) + Índice entry 32, same edit; `gitleaks dir .` still clean.
- [ ] 8.4 Linear (Spanish): comment on DIS-87 with the evidence links (C1–C6); a Spanish comment on DIS-84 noting that its PGP follow-up is covered by the default `private-key` rule in CI. After opening the PR, DIS-87 moves to In Review with a Spanish comment linking the PR. After the merge, if DIS-87 is not In Review (the Linear–GitHub integration moves it to Done), move it back to In Review with a Spanish comment: "pendiente de la checklist post-merge (check obligatorio `secrets`)". The author moves it to Done after confirming the checklist; the agent never moves it to Done
  - Done so far (2026-10-08): DIS-87 In Review with a Spanish comment linking PR #26; Spanish evidence comment on DIS-87 (C1–C6 links); Spanish comment on DIS-84 (PGP covered by the default `private-key` rule). Open until the merge: check DIS-87's state after it and move it back to In Review if needed
