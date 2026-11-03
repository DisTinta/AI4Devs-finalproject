# Manual Interface Testing Report

- Date: 2026-11-03
- Change: answer-review
- Step: 9. Manual Interface Testing and 10. End-to-End Testing (text of the agent that ran apply-finish, DIS-82)

## Interface

The interface is the CLI `node scripts/answer-review.mjs <agreement|merge|hashes> [--root <dir>]`. It ran in Git Bash
(Windows 11) with Node from the repository, over a copy in the session scratchpad of
`docs/measurements/answer-review/`, `docs/measurements/context/answers/`, `docs/measurements/context/questions.json`
and the application code of the two fixtures, passed with `--root`. The frozen files of the repository were never the
target of a command that writes.

## Happy path (exit 0)

| Command (on the copy) | Exit | Result |
|---|---|---|
| `node scripts/answer-review.mjs agreement --root <copy>` | 0 | wrote `docs/measurements/answer-review/agreement.json`; `cmp` with the committed file: identical |
| `node scripts/answer-review.mjs merge --root <copy>` | 0 | wrote `docs/measurements/answer-review/verdicts.csv`; `cmp` with the committed file: identical |
| `node scripts/answer-review.mjs hashes --root <copy>` | 0 | eight `<sha256>  <path>` lines equal to the `## Hashes SHA-256` table of `docs/measurements/answer-review.md` |

## Error cases (separate copies, each with the file the command would write removed beforehand)

| Case | Command | Exit | Message (stderr) | File written |
|---|---|---|---|---|
| reviewer 1 with its last answer removed | `agreement` | 1 | `reviewer-1.json: missing answer task-api Q20` | no |
| reviewer 2 whose only citation in a reason is `app/Services/PriceCalculator.php:99999` | `agreement` | 1 | `reviewer-2.json: acme-shop Q01: no citation names an existing line of fixtures/acme-shop (cited app/Services/PriceCalculator.php:99999)` | no |
| reviewer 1 with `docs/measurements/context/context-savings.csv` in `sourcesRead` | `agreement` | 1 | `reviewer-1.json: sourcesRead entry docs/measurements/context/context-savings.csv is outside the allowlist` | no |
| resolution missing a disagreement | `merge` | 1 | `resolution.json: missing answer task-api Q03` | no |
| `reviewer-2.json` removed from the copy | `hashes` | 1 | `reviewer-2.json: the file cannot be read`; nothing on stdout | n/a |
| unknown command `frobnicate` | `frobnicate` | 2 | `Usage: node scripts/answer-review.mjs <agreement|merge|hashes> [--root <dir>]` | no |

The copies were broken with a scratch script outside the repository (`mutate.cjs` in the scratchpad), not by hand
editing of a frozen file.

## Restore

- The scratchpad copies were deleted.
- `git status --short docs/measurements fixtures` shows no change to a frozen file or a fixture (only the edited
  `docs/measurements/context-savings.md`, a documentation file outside the hash table).
- `node scripts/dev-processes.mjs stop`: no process was running.

## Step 10. End-to-End Testing

Not applicable: no user interface is involved.

## Outcome
- Status: PASS
- Blocking issues: none
