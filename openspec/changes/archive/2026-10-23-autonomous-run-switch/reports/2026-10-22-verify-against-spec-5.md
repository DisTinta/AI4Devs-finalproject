# Verify Against Spec Report (fifth run)

- Date: 2026-10-22
- Change: autonomous-run-switch (DIS-106), commit `e075823` (CI green on the first run, including the
  new "Hook timing" step)
- Mode: inline; a fresh read-only auditor (about 260 hook calls and a differential test of 6 000 random
  inputs between `paths.mjs` and the bash fallback, 0 mismatches), an edge-case runner (about 250
  cases) and an evidence/blast-radius reviewer (125 everyday inputs with the switch `"0"`, 69 SDD-cycle
  commands with the switch `"1"`).

## 1. Implemented correctly

R5-1 to R5-8 confirmed by probe. `paths.mjs` classifies secret files, environment files, streams, case,
relative paths and protected paths in every spelling (17 spellings × 5 targets) as the spec says; `..`
is denied outright; the 4 KiB rule counts bytes as written; a failing, slow (watchdog) or forged
`paths.mjs` denies in unattended mode and falls back to the bash checks with the switch `"0"`. With the
switch `"0"`, every changed decision matches an always-on item. Windows medians: `Bash` 0.73 s, `Read`
0.55 s, `Grep` 0.58 s, `Glob` 0.50 s, `Edit` 1.09 s.

## 2. Missing or partial

| Id | Severity | Finding |
|---|---|---|
| R6-1 | Major | `paths.mjs` runs with no outer time limit: a hang before its watchdog, or a blocking `realpath` on an unreachable UNC path (21 s), passes the 10 s hook timeout and the call goes through in both switches. |
| R6-2 | Minor | Drive-relative paths (`C:tests/…`, `C:.claude/…`) are taken as absolute and escape the protections in unattended mode. |
| R6-3 | Minor | With the switch `"0"`, a `paths.mjs` that consumes stdin and then fails leaves the bash fallback with no input: `.env` passes. |
| R6-4 | Minor | An alias written by hand into `.git/config` or `~/.gitconfig`, or reached through `GIT_DIR`/`git -C <other repo>`, is not seen. |
| R6-5 | Minor | Over-denials: `GIT_CONFIG_NOSYSTEM=1 git status`; a `cd` into any glob; a Grep/Glob pattern over 4 KiB with the switch `"0"`. |
| R6-6 | Minor | The `+refspec` always-on item was added without a recorded author decision. |

## Tests weaker than their THEN

Mutations that survive: the merge gate's page-line anchors, `hostname()` in the local admin-share list,
the `NAME[i]=` subscript; several round-5 alias cases assert only parser facts; the kit-contract
removal reason is not distinguished from the kit-configuration one; the doctors' `paths.mjs` check has
no test; the timing docstrings still describe the old relative bound.

## Verdict

**Not conformant.** Blocker 0, Major 1, Minor 5. The author decided on 2026-10-22: keep the `+refspec`
item; narrow the over-denials; a generic rule for unknown git subcommands; accept that the timing step
runs on Linux CI only (Windows timing runs locally and is recorded). Round 6 fixes the rest.
