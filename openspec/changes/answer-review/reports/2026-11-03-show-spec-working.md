# Show spec working

- Date: 2026-11-03
- Change: answer-review (DIS-82), PR #104
- Step: 13.3, run in the review step of the autonomous run (text of the agent that ran the review step)
- Environment: Windows 11, Git Bash, Node v24.11.1, branch `feature/dis-82-answer-review` at `ba9c4b3`

The interface of the change is the CLI `node scripts/answer-review.mjs <agreement|merge|hashes> [--root <dir>]`
and the documents it feeds (`docs/measurements/answer-review.md`, `readme.md` §2.6). Every command that writes ran
over a copy in the session scratchpad (`ssw1/`: `docs/measurements/answer-review/`,
`docs/measurements/context/answers/` and the application code of the two fixtures), passed with `--root`, never over
the frozen files. The broken copies were built by a scratch script outside the repository (`mutate.cjs`, one copy per
case) and run by a second scratch script (`run-cases.cjs`). No browser UI is involved, so Playwright was not used.

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| A complete review output is accepted (real outputs) | `agreement --root ssw1` with `agreement.json` removed from the copy | exit 0, `wrote docs/measurements/answer-review/agreement.json`, byte-identical to the committed file | yes | E1 |
| Percent agreement and Cohen's kappa per project | same run; values recomputed by hand from the two outputs | acme-shop 19/20, 95 %, kappa 0.908 (p_o 0.95, p_e 183/400); task-api 18/20, 90 %, kappa 0.826 (p_o 0.9, p_e 170/400) | yes | E1 |
| Agreed answers take the common verdict / Disagreements take the resolution | `merge --root ssw1` with `verdicts.csv` removed | exit 0, byte-identical to the committed `verdicts.csv` (37 `agreed`, 3 `resolved`) | yes | E1 |
| The merge is deterministic | `merge` a second time | identical bytes, 41 lines | yes | E1 |
| hashes prints the eight files in order | `hashes --root ssw1` | exit 0, eight lines in the spec order, equal to `sha256sum` of the committed files and to the report table | yes | E1 |
| An incomplete review output is rejected / A rejected review output writes no agreement file | reviewer 1 without its last answer; reviewer 1 with `reviewer: "1"` and `date: "3/11/2026"` | exit 1, `missing answer task-api Q20`; `reviewer "1" is not the number 1 or 2` and `date 3/11/2026 is not in the form YYYY-MM-DD`; no `agreement.json` | yes | E2 |
| A verdict outside the three values is rejected | reviewer 2 with `Correct` on acme-shop Q04 | exit 1, `acme-shop Q04: verdict "Correct" is not correct, partial or incorrect` | yes | E2 |
| A reason without a valid citation is rejected | reviewer 2 whose only citation is `app/Services/PriceCalculator.php:99999` | exit 1, names acme-shop Q01 and the citation | yes | E2 |
| A declared forbidden source is rejected | reviewer 1 declaring `docs/measurements/context/context-savings.csv` | exit 1, `... is outside the allowlist` | yes | E2 |
| A sourcesRead entry that is a directory or a glob is rejected | `fixtures/task-api/src`, `fixtures/task-api/src/**`, `fixtures/acme-shop/app/Http` | exit 1, each named (`is a directory`, `is a glob`) | yes | E2 |
| A resolution with a source outside the resolver allowlist is rejected (and a forbidden field) | resolution with `model` and `agreement.json` in `sourcesRead` | exit 1, both named | yes | E2 |
| A failed merge writes no verdicts file | resolution without task-api Q03; resolution also answering the agreed acme-shop Q01 | exit 1, `missing answer task-api Q03`; `unknown answer acme-shop Q01`; no `verdicts.csv` | yes (project and question named) | E2 |
| hashes fails on a missing frozen file | copy without `reviewer-2.json` | exit 1, `docs/measurements/answer-review/reviewer-2.json: the file cannot be read`, empty stdout | yes | E2 |
| An unknown command is a usage error | no command, `frobnicate`, `hashes --verbose`, `hashes --root` | exit 2 and the usage line every time | yes | E2 |
| Frozen report, Table 1 and criterion scenarios | `npx vitest run tests/unit/scripts/answer-review.spec.ts tests/unit/docs` | 9 files, 54 tests passed | yes | E3 |

## Evidence

E1, happy path on the copy:

```
$ node scripts/answer-review.mjs agreement --root ssw1
wrote docs/measurements/answer-review/agreement.json
exit=0
agreement-identical            (cmp with the committed agreement.json)
$ node scripts/answer-review.mjs merge --root ssw1
wrote docs/measurements/answer-review/verdicts.csv
exit=0
verdicts-identical             (cmp with the committed verdicts.csv)
$ node scripts/answer-review.mjs merge --root ssw1     (second run)
exit=0
deterministic
41                             (wc -l verdicts.csv)
$ node scripts/answer-review.mjs hashes --root ssw1
6b802c38c0e3b4d28303105ea0421d8c63c62c07b75cd35886090b6115aec11d  docs/measurements/answer-review/criterion.md
d062e645851c22e61bdee0566c5e097367736400af1fbf4f93b6f48bcb2dd9ed  docs/measurements/answer-review/reviewer-1.json
95a50495a9284f6ba8eb8a8a1b62d9ef030f0bce7ec5a53304fb0e1d66a48f4b  docs/measurements/answer-review/reviewer-2.json
8bf331d75cb8bd4f1b4472c6a426519468d1c7f13b6001ca9bb837c9e6e50964  docs/measurements/answer-review/resolution.json
585210e7da5f2b91f0c71af1284522cef8fc597661dd1556368f62a443eee836  docs/measurements/answer-review/agreement.json
52cb02430feeef8106817fc1d3c7b079d709a039af098a76d09ab1a9f1dc4988  docs/measurements/answer-review/verdicts.csv
cd60866dc6be631ad9b390fdb2e30fb33602a1279e0a45d6122c0935006aaf0b  docs/measurements/context/answers/acme-shop.json
239484ea51f48149cd98f4b573faff4dcecebd9d50a7caf09542ebb4403bb241  docs/measurements/context/answers/task-api.json
exit=0
```

The eight hashes equal `sha256sum` of the committed files and the `## Hashes SHA-256` table of
`docs/measurements/answer-review.md`.

E2, error cases (each on its own broken copy; `files` is the content of the copy's `docs/measurements/answer-review/`
after the run):

```
== missing-answer: agreement            exit=1
stderr: answer-review: docs/measurements/answer-review/reviewer-1.json: missing answer task-api Q20
files: criterion.md resolution.json reviewer-1.json reviewer-2.json
== citation-eof: agreement              exit=1
stderr: answer-review: docs/measurements/answer-review/reviewer-2.json: acme-shop Q01: no citation names an existing line of fixtures/acme-shop (cited app/Services/PriceCalculator.php:99999)
== forbidden-source: agreement          exit=1
stderr: answer-review: docs/measurements/answer-review/reviewer-1.json: sourcesRead entry docs/measurements/context/context-savings.csv is outside the allowlist
== dir-glob: agreement                  exit=1
stderr: ... sourcesRead entry fixtures/task-api/src is a directory
        ... sourcesRead entry fixtures/task-api/src/** is a glob
        ... sourcesRead entry fixtures/acme-shop/app/Http is a directory
== reviewer-string: agreement           exit=1
stderr: ... reviewer "1" is not the number 1 or 2
        ... date 3/11/2026 is not in the form YYYY-MM-DD
== invalid-verdict: agreement           exit=1
stderr: ... acme-shop Q04: verdict "Correct" is not correct, partial or incorrect
== resolution-missing: merge            exit=1
stderr: answer-review: docs/measurements/answer-review/resolution.json: missing answer task-api Q03
== resolution-extra: merge              exit=1
stderr: answer-review: docs/measurements/answer-review/resolution.json: unknown answer acme-shop Q01
== resolution-model: merge              exit=1
stderr: ... a resolution has no `model` field
        ... sourcesRead entry docs/measurements/answer-review/agreement.json is outside the allowlist
== hashes-missing: hashes               exit=1
stdout: (empty)
stderr: answer-review: docs/measurements/answer-review/reviewer-2.json: the file cannot be read
== usage: (no command) / frobnicate / hashes --verbose / hashes --root     exit=2 each
stderr: Usage: node scripts/answer-review.mjs <agreement|merge|hashes> [--root <dir>]
```

In every validation and merge case the copy kept only its four input files: neither `agreement.json` nor
`verdicts.csv` was written.

E3, frozen documents (real files, read only):

```
$ npx vitest run tests/unit/scripts/answer-review.spec.ts tests/unit/docs
 Test Files  9 passed (9)
      Tests  54 passed (54)
```

Also checked by hand: every one of the 83 reasons of the two reviewer outputs and of the resolution holds at least one
citation that is valid with the exact case of the path (so the outputs validate on a case-sensitive file system, not
only on Windows); the blindness search of design P1 over the reviewer allowlist files finds nothing (grep exit 1); the
claims of the README paragraph «Qué dice la columna «Correctas»» (2 `invalid-model-output` among the 6 task-api
`incorrect`, the 4 `UNKNOWN` to `unknown` questions counted `correct`) match `verdicts.csv`.

## State

- Before: `sha256sum docs/measurements/answer-review/*` as in E1; `git status --short docs/measurements fixtures`
  empty.
- After: the same hashes (the copy was the only target of a write); `git status --short docs/measurements fixtures`
  empty.
- Restored: yes. The scratchpad copies live outside the repository and are discarded with the session; nothing was
  written under the repository by the demonstration.

## Not demonstrated

- The panel itself (two reviewer agents and the resolver) is not re-run: it is done once by the workflow and frozen by
  hash (design P12). Its outputs were exercised through the script above.

## Handoff

The change is demonstrably working: the committed panel outputs regenerate the committed `agreement.json` and
`verdicts.csv` byte for byte, the hashes match the report, and every error case of the spec exits as specified without
writing a file. No screenshot was taken, and nothing was left at the repository root.
