# Verify Against Spec — ci-secret-scan (DIS-87)

- Date: 2026-10-08
- Head audited: `95d5540` (PR #26), diff `bc3e395..HEAD`
- Contract: DIS-87 `[enhanced]` C1–C6, Definition of Done, out-of-scope §4; `proposal.md`,
  `design.md`, `tasks.md` (`skip_specs: true`).

## Verdict

C1–C4 and C6 met, C1 green on the final head. Non-goals respected (only `ci.yml` under `.github/`;
nothing under `packages/`, `tests/`, migrations; no `.gitleaks.toml`, no pre-commit hook, no history
rewrite; no dependency change). Gaps and unspecified behaviour below, each with its resolution.

## Missing or partial → resolution

| # | Finding | Resolution |
|---|---|---|
| 1 | DoD «Linear en In Review»: DIS-87 was In Progress. Closing the throwaway PR #27 at 10:08 made the Linear–GitHub integration move it back (it links PRs by the `DIS-87` in title/branch). | Set to In Review again with a Spanish comment; recorded in design Risks. |
| 2 | DoD «Evidencia local de C5(a), C5(b) y C6 pegada en el PR»: the PR description only linked the report. | The PR description now pastes the three outputs (section «Evidencia local»). |
| 3 | Task 8.4 still open. | Expected: its last part waits for the merge, which comes after the archive. |
| 4 | C5(b): only the `range` step was executed; skipping the git step on an empty range is inferred from the `if:`. | Accepted by the DoD (local simulation, design D9); listed under «Not demonstrated» in the show-spec-working report. |
| 5 | C5(a) transcript did not say which recipe was used. | Step 5 report states it: the single-line shortcut of `fixtures/README.md`, with the `sed` expressions. |
| 6 | C6: 292 commits scanned vs 318 in the ticket, unexplained. | Explained in the step 5 report and the PR: 318 − 25 merges − `780194d` (rename only, no added line) = 292. |

## Unspecified behaviour → resolution

| # | Finding | Resolution |
|---|---|---|
| 1 | `.gitleaksignore` added to the readme repository tree, not in proposal Impact. | Kept (it is a new root file); proposal Impact updated. |
| 2 | Security Gateway row: «en cada PR» incomplete (also push to `main`). | Wording fixed: «en cada PR y cada push a `main`». |
| 3 | `fixtures/README.md`: «check a finding is synthetic before fingerprinting; a real secret is rotated and removed, never ignored». | Recorded in design D7 as a design choice (D2's reasoning applied to the file). |
| 4 | `fixtures/README.md`: single-line shortcut (replace the old line number). | Recorded in design D7. |
| 5 | Regeneration recipe moves the root `.gitleaksignore` aside; `[enhanced]` still showed the old command. | `[enhanced]` → Documentación patched; Spanish comment on DIS-87. |
| 6 | `reports/2026-10-08-show-spec-working.md` untracked. | Committed with this round. |
| minor | D6 log text lacked the `before` value that `ci.yml` prints. | Design D6 text aligned with `ci.yml`. |
