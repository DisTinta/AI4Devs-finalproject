# Verify Against Spec Report (fourth run)

- Date: 2026-10-22
- Change: autonomous-run-switch (DIS-106), commit `9eba71c`
- Mode: inline; a fresh read-only auditor (about 190 probes), an edge-case runner (about 420 hook
  calls on copies of the base and the current hooks) and an evidence/blast-radius reviewer (108
  everyday inputs with the switch `"0"`, about 100 SDD-cycle commands with the switch `"1"`).

## 1. Implemented correctly

R4-1 to R4-10 confirmed by probe: quoted prefix assignments, globs, braces, short names and dynamic
words, `::$DATA` streams, top-level keys, `.env.sh`/`.env.md`, kit scripts without options. All 110
scenarios have a test of the same name. With the switch `"0"`, every changed decision matches an
always-on item except the `+refspec` force push below. With the switch `"1"`, a normal SDD cycle passes:
explicit `git add`, `git commit` (heredoc too), `git push -u origin <branch>`, `npm test`, `npx vitest`,
`npx stryker run`, `gh pr create/checks/view/list/comment`, every `openspec` command, reports written by
redirection, `bash .claude/doctor.sh --autonomous`.

## 2. Missing or partial

| Id | Severity | Finding |
|---|---|---|
| R5-1 | Blocker | An append assignment `NAME+=value` is read as the command name: with the switch `"0"` `X+=1 git reset --hard` gets no decision; with `"1"` `X+=1 gh pr merge …` and `GH_REPO+=o/x …` are not seen. |
| R5-2 | Blocker | CI red at `9eba71c`: `guard-round4.spec.ts:45` expected a lower-case command name, which only Windows produces (fixed in `954ce65`). |
| R5-3 | Major | Non-ASCII long paths (45 000 `é`) take 14–17 s in the secret hooks, past the 10 s hook timeout; streams on 60 KB paths take 13–16 s. Root cause: bash string operations are quadratic. |
| R5-4 | Minor | `cd` into a glob or brace (`cd .clau* && echo > lib`) is not seen as entering `.claude`. |
| R5-5 | Minor | `declare -x`/`typeset -x` of `GIT_CONFIG_PARAMETERS` is not an alias definition; `GIT_CONFIG_GLOBAL`, `HOME=` before git and `include.path` can carry an alias. |
| R5-6 | Minor | With the switch `"0"`, `git push origin +main` is now denied as a force push; not an always-on item in the spec. |
| R5-7 | Minor | The spec exempts `pwsh` of a kit script but the code treats its words as interpreter text; the 4 KiB edit rule is measured after squeezing and applies to every edit path, wider than the scenario. |
| R5-8 | Minor | Short names, the program-variable list and stream names other than `$DATA` are only in the design and the guide. |

## Tests weaker than their THEN

The mixed files page (one valid line plus garbage) is not tested in the gate; most program variables
(`NODE_OPTIONS`, `PAGER`, `EDITOR`…) are untested; the short-name deny runs only on Windows; the timing
tests use ASCII paths only.

## Docs

The `Edit` cost is 1.54 → 1.27 s (the guide says 1.28 → 1.02 s); the guide overstates the variable
rule (a commit or PR message with a variable passes); the design records the timing tolerance as 5 s
(it is min(4 × baseline + 1.5 s, 8 s)).

## Verdict

**Not conformant.** Blocker 2 (one already fixed), Major 1, Minor 5. The author decided on 2026-10-22
to keep the variable-word rule and to move path and secret classification to Node (round 5).
