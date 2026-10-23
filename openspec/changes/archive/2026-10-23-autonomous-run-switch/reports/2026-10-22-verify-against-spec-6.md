# Verify Against Spec Report (sixth run)

- Date: 2026-10-22
- Change: autonomous-run-switch (DIS-106), commit `10fc192` (CI green on the first run)
- Mode: inline; a fresh read-only auditor (about 260 hook calls), an edge-case runner and an
  evidence/blast-radius reviewer (81 everyday inputs with the switch `"0"`, 64 SDD-cycle commands with
  the switch `"1"`, mutations of the round-6 tests).

## 1. Implemented correctly

R6-1 to R6-6 confirmed by probe: `paths.mjs` stubs that hang, read then hang, exit, print garbage or
fail to parse give deny (switch `"1"`) or the fallback decision (switch `"0"`) in 0.5–6.4 s in both
clients; unreachable UNC paths are decided in about 1 s; drive-relative paths are protected in
unattended mode; the fallback keeps the input; the git-subcommand rule denies 26 forms and lets 24
normal git subcommands through; 20 kinds of git-config writes are denied; the narrowed over-denials
pass. The spec text of round 6 matches the code except as below.

## 2. Missing or partial

| Id | Severity | Finding |
|---|---|---|
| R7-1 | Major | gh has no counterpart of the git rule: a gh alias written to gh's `config.yml` (editing tools or shell), or a `gh extension install`, lets `gh <alias>` merge with `--admin --squash` without the merge gate. |
| R7-2 | Minor | The 5 s bound covers only the first output line of `paths.mjs`; a numeric line followed by a stall waits 30 s. |
| R7-3 | Minor | `xargs git` with the subcommand from stdin is not seen by the git-subcommand rule. |
| R7-4 | Minor | With the switch `"0"`, drive-relative edit paths changed decision (base: none; now: ask), which is not an always-on item. |
| R7-5 | Minor | The spec's "path or pattern longer than 4 KiB" for search tools: only patterns count, and the reason is the secret one. |
| R7-6 | Minor | Unspecified: `GIT_EXEC_PATH`/`--exec-path=`, the wider git-config-file match, the `PF_UNSURE` denial, `cd {a,b}` taking the first expansion; the "this machine's name" spelling was added to the spec without a design note. |

## Tests weaker than their THEN

No stub stalls after a length line; `PF_UNSURE` is untested (a mutation survives); the merge gate's
`kit .+` survives as `kit .*`; the kit-contract removal reason is not pinned with the switch `"0"`;
`paths-round6.spec.ts` asserts timing in the parallel suite; nothing compares the git built-in set with
git's own list.

## Docs

The guide's `Bash` cost row counts only the shell guard; a real Bash call runs three hooks (2.16 →
1.85 s with the switch `"0"`; 3.85 s with `"1"`, the merge gate doing its parse).

## Verdict

**Not conformant.** Blocker 0, Major 1 (R7-1), Minor 5. Round 7 fixes them; per the author's stopping
criterion, the seventh pass closes the reviews if it returns no Blocker and no Major.
