# Manual Interface Testing Report

- Date: 2026-11-03
- Change: graph-quality-measurement (DIS-79)
- Step: 8. Manual Interface Testing and 9. End-to-End Testing

*Agent's text, autonomous run. The interface is the command `npm run measure:graph`; the user name is masked as `<user>` in paths.*

## Versions
- OS: Windows 11 Pro 10.0.26300
- Node `v24.11.1`, npm `11.19.0`
- PowerShell 7 (`pwsh`) `7.6.9`; Windows PowerShell (`powershell.exe`) `5.1.26100.9818`

## 8.1 Happy path in three shells
No `$env:` variable was set; the script reads no `.env`.

| Shell | Command | Exit | stdout |
|---|---|---|---|
| Git Bash | `npm run measure:graph` | 0 | two lines below |
| `pwsh -NoProfile` | `pwsh -NoProfile -Command 'npm run measure:graph'` | 0 | same two lines |
| `powershell.exe -NoProfile` | `powershell.exe -NoProfile -Command 'npm run measure:graph'` | 0 | same two lines |

```
acme-shop: cobertura 77,4 % (24/31) · precisión 100,0 % (24/24) · calls 47 exact / 17 heuristic
task-api: cobertura 100,0 % (26/26) · precisión 100,0 % (26/26) · calls 37 exact / 0 heuristic
```

`docs/measurements/graph-quality.json` is a new, still untracked file at this point, so `git diff --exit-code` has nothing to compare; the byte-for-byte check was done with the SHA-256 of the file after each run:

- Bash: `085e82fbf99ac58c2cc6a3a994b8670d7a53a118e337967f5672a17f7451476c`
- `pwsh`: `085E82FBF99AC58C2CC6A3A994B8670D7A53A118E337967F5672A17F7451476C`
- `powershell.exe`: `085E82FBF99AC58C2CC6A3A994B8670D7A53A118E337967F5672A17F7451476C`

The three are the same hash (`Get-FileHash` writes upper case), so the file is byte-identical across shells and the Windows checkout (`.gitattributes` `eol=lf`) does not change it. After the commit, `git diff --exit-code -- docs/measurements/graph-quality.json` is the same check on the committed bytes, and `tests/unit/docs/graph-quality.spec.ts` guards it in CI.

## 8.2 Error cases (temporary copies in the scratchpad, deleted afterwards)
Each case is a copy of the nine frozen files, the report and the seed, run with `node scripts/measure-graph.mjs --root <copy>`.

| Case | Exit | stderr | Output file written |
|---|---|---|---|
| one space appended to `fixtures/annotations/task-api.callsites.json` | 1 | `fixtures/annotations/task-api.callsites.json: the SHA-256 differs from the one the report records` | no |
| seed without the project `task-api` | 1 | `seeds/graph-dump.sql: the project task-api is not in the seed` | no |
| `node scripts/measure-graph.mjs --verbose` | 2 | `Usage: node scripts/measure-graph.mjs [--root <dir>]` | no |

The copies were removed at the end of the run.

## 8.3 State restored
`git status` shows only the change's files (and the author's `.claude/sdd-harness.env`, not staged); the nine frozen hashes and the seed hash equal the baseline of the step 7 report; `node scripts/dev-processes.mjs stop` reported no running process.

## 9.1 End-to-end
Not applicable to a user interface: no screen of `packages/web` and no Playwright spec changes. The end-to-end evidence is the CI run of the pull request, recorded in the pre-merge review reports.

## Outcome
- Status: PASS
- Blocking issues: none
