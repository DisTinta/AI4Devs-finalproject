# Show spec working — graph-quality-measurement (DIS-79)

*Agent's text, autonomous run, review step (2026-11-03). Task 11.3. PR #102, branch
`feature/dis-79-measure-graph`.*

The interface of this change is the command `npm run measure:graph` (`node scripts/measure-graph.mjs
[--root <dir>]`). No database, server or browser is involved, so there is no Playwright evidence and no
screenshot. Every scenario was exercised against the real command: on the repository for the success
case, and on temporary copies of the inputs in the session scratchpad for the error cases (driven by a
throw-away scratchpad script that spawns `node scripts/measure-graph.mjs --root <copy>`; the copies were
deleted at the end). User name masked as `<user>`; copy paths as `<copy>`.

Versions: Node v24.11.1, npm 11.19.0, PowerShell 7.6.9 (`pwsh`), Windows PowerShell 5.1.26100.9818,
Windows 11 Pro 10.0.26300.

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| The measurement is deterministic | `npm run measure:graph` on the repository (Bash, `pwsh`, `powershell.exe`), then twice on a copy | exit 0, two stdout lines `acme-shop…` then `task-api…`; JSON byte-identical between runs and equal to the committed file; no copy path inside | yes | E1, E2, E3 |
| A frozen annotation file was modified | copy with one space appended to `fixtures/annotations/task-api.callsites.json` and an unparseable seed | exit 1, one stderr line naming that file, no seed error, no output file | yes | E4 |
| The agreement report is missing | copy without `docs/measurements/annotation-agreement.md`; copy whose report has no hash table | exit 1 both; stderr `docs/measurements/annotation-agreement.md: the file cannot be read` and `docs/measurements/annotation-agreement.md: the report records no SHA-256 hash`; no output file | yes | E5 |
| A project of the annotations is not in the seed | copy whose seed has the `task-api` rows removed | exit 1, `seeds/graph-dump.sql: the project task-api is not in the seed`, no output file | yes | E6 |
| A malformed seed line is an error | copy whose first `INSERT INTO edge` line (184) is truncated before `);`; copy without the seed | exit 1, `seeds/graph-dump.sql:184: the statement does not end with );`; exit 1, `seeds/graph-dump.sql: the file cannot be read`; no output file | yes | E7 |
| A `symbol` row naming no `file` row is malformed (requirement "The graph is read from the seed") | copy with a symbol row whose `file_id` is `no-such-file` (line 63) | exit 1, `seeds/graph-dump.sql:63: the symbol row names no file of the seed` | yes | E8 |
| Other tables are ignored (requirement "The graph is read from the seed") | copy with `INSERT INTO constructor (id) VALUES ('x');` appended | **before the fix:** exit 1, stderr `(SEED_COLUMNS[table] ?? []).find is not a function`; **after the fix:** exit 0, the normal two lines | no → fixed | E9 |
| An unknown argument is a usage error | `--verbose`; `--root` alone; `--root <copy> --root <copy>` | exit 2, stderr exactly `Usage: node scripts/measure-graph.mjs [--root <dir>]`, nothing written | yes | E10 |
| (hostile) `--root` to a directory that does not exist | `--root <scratch>/does-not-exist` | exit 1, `docs/measurements/annotation-agreement.md: the file cannot be read`, nothing created | yes (freeze first) | E10 |
| An annotation file has 49 sites | covered by the CLI test `An annotation file has 49 sites through the CLI` (a copy needs the report row rewritten with the new hash); run in the suite | green | yes | E11 |
| Matching, attribution and measures scenarios (11) | in-memory synthetic graphs, the unit tests of `tests/unit/scripts/measure-graph.spec.ts` | green | yes | E11 |
| Committed JSON, Table 2, report, frozen sources (5) | `tests/unit/docs/graph-quality.spec.ts`, `tests/unit/docs/annotation-freeze.spec.ts` | green | yes | E11 |

## Evidence

E1 — repository, Bash:

```
$ npm run measure:graph
> codemind@0.0.1 measure:graph
> node scripts/measure-graph.mjs

acme-shop: cobertura 77,4 % (24/31) · precisión 100,0 % (24/24) · calls 47 exact / 17 heuristic
task-api: cobertura 100,0 % (26/26) · precisión 100,0 % (26/26) · calls 37 exact / 0 heuristic
exit=0
$ git diff --exit-code --stat -- docs/measurements/graph-quality.json
diff-exit=0
```

E2 — repository, PowerShell (no `$env:` variable set):

```
$ pwsh -NoProfile -Command 'npm run measure:graph; "exit=$LASTEXITCODE"; $PSVersionTable.PSVersion.ToString()'
acme-shop: cobertura 77,4 % (24/31) · precisión 100,0 % (24/24) · calls 47 exact / 17 heuristic
task-api: cobertura 100,0 % (26/26) · precisión 100,0 % (26/26) · calls 37 exact / 0 heuristic
exit=0
7.6.9
git diff --exit-code → 0

$ powershell.exe -NoProfile -Command 'npm run measure:graph; "exit=$LASTEXITCODE"; $PSVersionTable.PSVersion.ToString()'
(same two lines)
exit=0
5.1.26100.9818
git diff --exit-code → 0
```

E3 — copy, two runs:

```
### success (1st run)  exit=0  stderr=""  output written=true
### success (2nd run)  exit=0  stderr=""  output written=true
byte-identical=true equal-to-committed=true contains-copy-path=false
```

E4:

```
### frozen annotation modified, unparseable seed
exit=1
stdout=""
stderr="fixtures/annotations/task-api.callsites.json: the SHA-256 differs from the one the report records\n"
output written=false
```

E5:

```
### agreement report missing
exit=1
stderr="docs/measurements/annotation-agreement.md: the file cannot be read\n"
output written=false
### agreement report without hashes
exit=1
stderr="docs/measurements/annotation-agreement.md: the report records no SHA-256 hash\n"
output written=false
```

E6:

```
### task-api not in the seed
exit=1
stderr="seeds/graph-dump.sql: the project task-api is not in the seed\n"
output written=false
```

E7:

```
(truncated line number 184)
### edge line truncated before );
exit=1
stderr="seeds/graph-dump.sql:184: the statement does not end with );\n"
output written=false
### seed missing
exit=1
stderr="seeds/graph-dump.sql: the file cannot be read\n"
output written=false
```

E8:

```
### symbol row naming no file (line 63)
exit=1
stderr="seeds/graph-dump.sql:63: the symbol row names no file of the seed\n"
output written=false
```

E9 — the finding of this review (adversarial-review F1):

```
### INSERT INTO constructor (prototype-named table)      [before the fix]
exit=1
stderr="(SEED_COLUMNS[table] ?? []).find is not a function\n"
output written=false

### INSERT INTO constructor (prototype-named table)      [after the fix, scripts/measure-graph.mjs:213]
exit=0
stdout="acme-shop: cobertura 77,4 % (24/31) · precisión 100,0 % (24/24) · calls 47 exact / 17 heuristic\ntask-api: cobertura 100,0 % (26/26) · precisión 100,0 % (26/26) · calls 37 exact / 0 heuristic\n"
stderr=""
output written=true
```

E10:

```
### --verbose                 exit=2  stderr="Usage: node scripts/measure-graph.mjs [--root <dir>]\n"  output written=false
### --root without value      exit=2  stderr="Usage: node scripts/measure-graph.mjs [--root <dir>]\n"  output written=false
### --root twice              exit=2  stderr="Usage: node scripts/measure-graph.mjs [--root <dir>]\n"  output written=false
### --root to a directory that does not exist
exit=1  stderr="docs/measurements/annotation-agreement.md: the file cannot be read\n"
copies removed=true
```

E11 — suites, after the fix:

```
$ npx vitest run tests/unit/scripts tests/unit/docs
 Test Files  16 passed (16)
      Tests  122 passed (122)
$ npm run typecheck   → exit 0
$ npm run lint        → exit 0
```

CI of PR #102 before this step (run 41605471928): `e2e`, `frontend`, `mutation`, `quality`, `scope`,
`secrets`, `verify` all `pass`. The CI of the fix commit is recorded in the adversarial-review report.

## State

- Before: the nine frozen SHA-256 equal the `## Hashes SHA-256` table (`node scripts/annotation-agreement.mjs
  hashes`, e.g. `fixtures/annotations/acme-shop.callsites.json` `4389d1b6…416f`, `task-api.callsites.json`
  `8364de46…17814`); `seeds/graph-dump.sql` `771ddaf5…6d16`; `docs/measurements/graph-quality.json`
  `085e82fb…476c`; `git status` clean apart from `.claude/sdd-harness.env` (not touched by the agent).
- After: the same nine hashes (`tests/unit/docs/graph-quality.spec.ts` → "The frozen sources still match their
  hashes" green), the same seed hash, `graph-quality.json` unchanged (`git diff --exit-code` 0); `git diff
  origin/final-project-CRN -- fixtures/annotations docs/measurements/annotation docs/measurements/annotation-agreement.md`
  is empty (0 lines).
- Restored: yes. Only temporary copies under the scratchpad were written, and all were deleted
  (`copies removed=true`); no `measure-graph-*` directory left under the system temp folder.

## Not demonstrated

Nothing. The scenarios that need a hand-made graph (matching and measures) cannot be built through the
CLI without editing the frozen inputs, so they are demonstrated by their unit tests on in-memory seeds,
as the spec states ("on synthetic in-memory graphs").

**Handoff:** the change is demonstrably working. One defect was found while exercising it (a seed
table named like an `Object.prototype` member broke the reader instead of being ignored); it was fixed in
this PR with a test first (RED seen) and re-demonstrated (E9). No screenshot was produced, and none was
left at the repository root.
