# Manual Interface Testing Report

- Date: 2026-10-28
- Change: callsite-annotations
- Step: 9 Manual Interface Testing (agent's text, `apply-finish`)

The interface is the CLI `node scripts/annotation-agreement.mjs <agreement|merge|hashes> [--root <dir>]`.
Everything ran in Git Bash on a partial copy of the repository in the scratchpad (`<copy>` below:
`docs/measurements/annotation/`, `fixtures/acme-shop/{app,routes,config,database,composer.json}` and
`fixtures/task-api/{src,package.json,tsconfig.json}`), never on the frozen files. The partial copy also
exercises the rule that `sourcesRead` is checked by path string (spec "Panel output validation").

## Success path

| Command | Exit | Result |
|---|---|---|
| `node scripts/annotation-agreement.mjs agreement --root <copy>` (copy's `agreement.json` replaced by `{}` first) | 0 | wrote `agreement.json`; byte-identical to the committed file |
| `node scripts/annotation-agreement.mjs merge --root <copy>` | 0 | wrote both `*.callsites.json`; byte-identical to the committed files |
| `node scripts/annotation-agreement.mjs hashes --root <copy>` | 0 | nine lines; identical to `hashes` over the repository and to the report's table |

## Error cases (copy rebuilt from the repository before each one)

| Case | Command | Exit | Message (stderr) | File written |
|---|---|---|---|---|
| a panel output with one site removed | `agreement --root <copy>` | 1 | `panelist-1.json: missing site id php-20` | none |
| the only citation beyond the end of its file | `agreement --root <copy>` | 1 | `panelist-2.json: ts-20: no citation names an existing line of fixtures/task-api (cited src/app.ts:99999)` | none |
| `fixtures/README.md` in `sourcesRead` | `agreement --root <copy>` | 1 | `panelist-1.json: sourcesRead entry fixtures/README.md is outside the allowlist` | none |
| a resolution missing a disagreement (panelist 2 changed on `php-01`, resolution empty) | `merge --root <copy>` | 1 | `resolution.json: missing site id php-01` | none |
| an unknown command | `frobnicate --root <copy>` | 2 | `Usage: node scripts/annotation-agreement.mjs <agreement|merge|hashes> [--root <dir>]` | none |

## Restore
- `git status --short docs/measurements fixtures/annotations` is empty (the frozen files are untouched).
- `node scripts/dev-processes.mjs stop`: no repository process running.
- The scratchpad copy was not deleted: the repository policy blocks `rm -rf`. It lives outside the
  repository and holds only copies (design Follow-ups, AF-4).

## End-to-end (step 10)
Not applicable: no user interface is involved (task 10.1).

## Outcome
- Status: PASS
- Blocking issues: none
