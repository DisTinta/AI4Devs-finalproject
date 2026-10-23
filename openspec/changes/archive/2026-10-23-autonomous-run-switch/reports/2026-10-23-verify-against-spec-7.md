# Verify Against Spec Report (seventh run, bounded)

- Date: 2026-10-23
- Change: autonomous-run-switch (DIS-106), commit `8823985`
- Mode: inline, bounded by the author's decision (2026-10-23): one fresh read-only reviewer checks that
  the round-7 fixes are correct and complete and that round 7 broke nothing; it does not hunt for new
  bypass variants. Probes on fresh copies of the base and current hooks (scratchpad `v7/`).

## Targets

| Target | Status | Evidence |
|---|---|---|
| R7-1 gh rule | Fixed | gh commands not gh's own, `gh extension install/upgrade/exec/create/browse`, `gh alias set` and writes to gh's `config.yml`/`hosts.yml` (shell and editing tools) denied with the switch `"1"`; `gh pr create/view/checks`, `gh run list`, `gh api`, `gh auth status`, `gh extension list/search` free |
| R7-2 path classifier | Fixed | stalls after the length line and orphans covered by the round-7 tests; empty, invalid, array and truncated inputs denied in unattended mode by the three read/edit hooks; non-ASCII and over-8 KiB answers read correctly |
| R7-3 xargs | Fixed | `echo m \| xargs git`, `xargs -0 git`, `echo pr \| xargs gh` denied; `xargs git add`, `xargs gh pr view` free |
| R7-4 drive-relative | Fixed | with the switch `"0"`, `C:tests/…` and `C:packages/…` give the base's decision; with `"1"`, an existing test is denied |
| R7-5, R7-6 spec text | Fixed after this run | the spec now names `gh extension browse` and the classifier's 5 s bound, child kill and unparsable-input deny |

## Regressions

None. With the switch `"0"`, 48 everyday inputs: the only differences from the base are always-on items
(`.env.example` readable; `Grep` on `.env` denied). With the switch `"1"`, a normal SDD cycle (git
status/checkout -b/add/commit/push -u/fetch+rebase, `npm test`, `npx vitest run`, lint, typecheck,
`openspec validate`, `bash .claude/doctor.sh`, `gh pr create/view/checks`, editing `tasks.md`, writing a
report) gets no decision; `gh pr merge --squash` reaches the merge gate and is denied there, by design.

CI at `8823985` failed one assertion: the Ubuntu runner's git lists a builtin the set lacked
(`format-rev`); fixed in `bc570b3`, and the list comparison now runs only on the git versions the set
was built from.

## Verdict

**No Blocker or Major.** Per the author's stopping criterion (design.md → Follow-ups), the pre-merge
reviews are closed. The guard's known limits are recorded as D in design.md and
`docs/AUTONOMOUS-RUN.md` §9; the base-branch protection (D20) bounds them.
