# Adversarial review — graph-quality-measurement (DIS-79)

*Agent's text, autonomous run, review step (2026-11-03), inline mode of `adversarial-review`
(`docs/AUTONOMOUS-RUN.md` §6). Task 11.5. Reviewed in a new session, not the one that implemented the
change. Inputs: proposal, design (Follow-ups), `specs/graph-quality/spec.md`, tasks, the step 7 and 8
reports, the three spec-audit runs, and `git diff origin/final-project-CRN...HEAD` (18 files).*

## Adversarial review

### Findings

| Severity | File:line | Finding | Why it matters |
|---|---|---|---|
| Minor | `scripts/measure-graph.mjs:213` | **F1 (fixed).** `table in SEED_COLUMNS` is true for `constructor`, `__proto__` and the other `Object.prototype` members, so a seed line `INSERT INTO constructor (…)` was not ignored: `readSeed` threw `(SEED_COLUMNS[table] ?? []).find is not a function` and the CLI exited 1 with a line that names no seed line. Reproduced through the CLI (show-spec-working E9). | The spec says every other table SHALL be ignored, and every seed error SHALL name `seeds/graph-dump.sql`. The seed is generated, so it is hostile input only, hence Minor. Fixed with `Object.hasOwn`; test `tests/unit/scripts/measure-graph.spec.ts:231` written first, seen failing with that TypeError, green after. |
| Minor | `docs/measurements/graph-quality.md:24-25` | **F2 (fixed).** `## Método` → *Independencia* stated the fixed sentence twice («…La frase fija que lo declara es la siguiente: La medición la ejecutó…»). | Reads as filler written for the test; the test only needs the sentence once. Second copy removed; `tests/unit/docs/graph-quality.spec.ts:131` still green. |
| Minor | `tests/unit/docs/graph-quality.spec.ts:78-80` | **F3.** "The frozen sources still match their hashes" asserts only `checkFreeze(...) === []`; the `THEN` also says the freeze test passes unmodified and the branch diff touches no frozen path. | Weaker than the scenario. The other two clauses are proved by the suite (`annotation-freeze.spec.ts` is not in the diff) and by `git diff origin/final-project-CRN -- fixtures/annotations docs/measurements/annotation docs/measurements/annotation-agreement.md` = 0 lines (task 5.6, show-spec-working → State). A unit test cannot read the base branch offline. D — accepted. |
| Question | `scripts/measure-graph.mjs:57-67` | **F4.** The freeze check trusts the list of the report: a report whose table dropped the two `callsites.json` rows would let modified annotations be measured. | Answered: the report is itself guarded — `tests/unit/docs/annotation-freeze.spec.ts:17-27,178` requires the table to list exactly the nine frozen files, so such an edit fails CI. The spec ("every file listed") is met. D — accepted. |
| Minor | `openspec/changes/graph-quality-measurement/specs/graph-quality/spec.md:222` | **F5.** The spec was edited in the implementation commit `7ec718b` (JSON projects start with `fixture` and `language`). | Checked the history: it is the improvable finding R3-I4 of spec-audit run 3, recorded in design → Follow-ups before the commit, additive, and the layout test (`measure-graph.spec.ts:632`, keys `fixture`, `language` first) asserts it. Not a spec bent to fit a bug. D — accepted. |
| Minor | `readme.md` §2.6, paragraph after Table 2 | **F6.** «se espera que TypeScript salga claramente mejor…» keeps the pre-measurement hypothesis wording now that the table is filled. | The figures right above confirm it (TypeScript 100,0 % / 100,0 % vs PHP 77,4 % / 100,0 %), so it does not mislead; restating the figures in prose would go stale without a test. D — accepted. |
| Minor | `openspec/changes/graph-quality-measurement/reports/2026-11-03-7-test-and-state-verification.md` | **F7.** The freeze tests of task 1.3 have no separate RED run (design AP4). | Process debt, recorded in the step 7 report; the tests do fail when the freeze step is removed (the copy's seed is unparseable, so without the freeze the stderr line would name `seeds/graph-dump.sql`, which `measure-graph.spec.ts:109` forbids). D — accepted, no Linear issue (process debt). |

What was checked to reach this table:

1. **Spec and task alignment.** Ten requirements, 26 scenarios, 26 tests with the same names (grep of
   each title in `tests/`); every `[x]` task up to 11.1 has its evidence in the step 7 / step 8 reports
   and the CI run 41605471928. No code path without a requirement (verify-against-spec, block 3).
2. **Hostile input, through the real CLI** (show-spec-working): empty / missing report, report with no
   hash table, a frozen file one byte off, missing seed, truncated `edge` line, `symbol` row naming no
   file, `task-api` missing from the seed, a table named `constructor` (F1), `--verbose`, `--root`
   without value, `--root` twice, `--root` to a non-existent directory, and the same run twice
   (byte-identical). Read in the code: a `null` `start_line` compares as `0`/false and is simply out of
   scope; a `none` site has no hit by construction (`:429`); a zero denominator gives `null` (`:468`),
   never `NaN`; two runs at once write the same bytes.
3. **Blast radius.** Nothing reads `docs/measurements/graph-quality.json` except the new docs test. The
   modified shared files are `package.json` (one script; `tests/unit/scripts/wiring.spec.ts` covers the
   new `.mjs` imports, green), `readme.md` (§2.6, the review row, the tree line; `tests/unit/docs/guides.spec.ts`
   green) and `docs/project-context.md` (one bullet). No migration, no product code, no existing
   behaviour changed.
4. **Evidence quality.** No existing test was modified (`git diff --stat origin/final-project-CRN -- tests`
   shows only the two new files). The most important test, "Two sites in one symbol do not count each
   other's hit as a false positive" (`measure-graph.spec.ts:486`), catches the mutation that computes
   false positives against the site's own hits instead of every site's hits (`:434`, `hitEdges` built
   from one site): each constructor edge would then be a false positive of the other site and the
   assertion `falsePositives === 0` fails. "Measures of a synthetic project" catches a float quotient
   or an off-by-one in `roundRatio`, and "Of two hits…" catches `hits[0]` without the resolution
   preference.

### Verdict

PASS — no Blockers and no Majors, evidence is sufficient. The two fixable Minors (F1, F2) are fixed in this
PR; the rest have destination D in design → Follow-ups (none has destination C).

### Recommended next steps before archiving

1. Wait for the CI of the fix commit to be green (addendum below).
2. `/opsx:archive` creates `openspec/specs/graph-quality/spec.md` (task 11.8: ten requirements, 26 scenarios).
3. Merge only through the gate (`gh pr merge 102 --merge`).

## Addendum — CI of the fix commit

Commit `ffeda2e` (RV-F1, RV-F2 and these reports): run 41608332388 (+ 41608332379 for `frontend`),
every check `pass`: `e2e` 1m12s, `frontend` 4m13s, `mutation` 2m55s, `quality` 10m26s, `scope` 14s,
`secrets` 8s, `verify` 40s. No re-review needed: the two fixes are local (one condition, one sentence)
and leave the measurement byte-identical.
