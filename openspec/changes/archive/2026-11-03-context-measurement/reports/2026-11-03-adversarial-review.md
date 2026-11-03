# Adversarial review: context-measurement (DIS-81), PR #103

*(Agent's text, inline mode of `adversarial-review`, review step of the autonomous run, 2026-11-03. The step that
reviews is not the one that implemented the change; it read the artifacts, the diff
`origin/final-project-CRN...HEAD` and the code, and exercised the command live, see
`2026-11-03-show-spec-working.md`.)*

## Adversarial review

### What was checked

1. **Spec and task alignment.** Every requirement has scenarios and every scenario title is a test name (44 of 44,
   grep). Tasks `[x]` up to 13.1 carry their evidence in the step 9 and step 10 reports. The spec was not edited
   after implementation: its last change is spec-audit run 5 (`9706f1a`), before the apply commits `0ef47aa`,
   `32b6ebd`, `d1f9b0e`. No existing test file is modified (`git diff --stat origin/final-project-CRN...HEAD --
   tests` shows only the two new files). Existing scripts change only by four `export` keywords.
2. **Hostile input**, per entry point of `runMeasureContext`: empty and repeated `--root`, `--root` followed by an
   option, blank and non-numeric `PORT`, blank `LLM_MODEL` / `LLM_BASE_URL`, trailing `/` and `/v1`, an Ollama that
   lacks the model or lists another digest, a report without the table / with only another row / with the path
   in prose, a question file with 19, duplicate, 4- and 501-unit, astral, U+0000 questions, raw files that are
   truncated, stray (`Q21`), stale, of another `questionId`, without body, an `UNKNOWN` without lists, tokenizer
   counts duplicated, out of sample, of another SHA-256, `0` or missing `prompt_eval_count`, a seed missing, with
   a malformed row, without a project row, and the same command run twice (deterministic, no request).
3. **Blast radius.** Writes only under `docs/measurements/context/` of `--root`. The live run writes `query_log`,
   claims and (with `useCache: false`) `cache_entry` rows through the API; the apply step and this step restored
   them with `npm run db:seed` and checked `npm run verify` (3/3 and 3/3). `sendWithHttp`, `apiPort`, `readRow`
   and `roundRatio` became exports without a behaviour change; their callers' tests are unchanged and green. No
   migration, no product code, `scripts/` is outside Stryker's `mutate`.
4. **Evidence quality.** The most important test is "The committed outputs are the current aggregation": it
   rebuilds the CSV, JSON and answer files from the committed raw data and compares bytes, so it catches any
   mutation of the aggregation that changes a figure (for example `Math.round` → `Math.ceil` in
   `savingsTenths` turns `-344` into `-343` for `acme-shop`, since the exact value is −343,58 tenths, or adding
   `outputTokens` to «CODEMIND»), and
   "The README Table 1 agrees with the measurement" then catches the README not following. "Every question is
   sent without the cache" compares each request body exactly, so `useCache: true` or a wrong project id fails.

### Findings

| Severity | File:line | Finding | Why it matters |
|---|---|---|---|
| Minor | `scripts/measure-context.mjs:247` (before the fix) | The "the table lists `questions.json`" check scanned every line of the report: a mention of the path with any 64-hex string in prose satisfied it, although the spec says the `## Hashes SHA-256` table must list it. | A report whose table lost the question row would pass the freeze check while the questions are no longer frozen. **Fixed**: `hashTableLists` (`:246`), test `measure-context.spec.ts:275` (seen failing first). |
| Minor | `scripts/measure-context.mjs:445` (before the fix) | A `200` `UNKNOWN` body, live or raw, without `statements` / `evidence` lists (or a non-object statement) passed `bodyProblem` and crashed `build` with an uncaught `TypeError`. | The command must exit 1 with a line naming the question or raw file; a stack trace names neither. **Fixed**, test `:563` (seen failing first). |
| Minor | `scripts/measure-context.mjs:975` (before the fix) | The failed-generate line named `<fixture>/<path>`, not the repository-relative `fixtures/<fixture>/<path>` every other file problem uses. | Inconsistent file naming in stderr. **Fixed**, test `:667` (seen failing first). |
| Minor | `scripts/measure-context.mjs:185` (before the fix) | A priced cost share was printed from the 4-decimal rounded ratio (double rounding: 12,345 % → `12,4 %`), against "formatted from its integers, never from a rounded ratio". | Unreachable at 0 USD (the published run), but wrong with a priced model. **Fixed**: formatted from micro-dollar integers (`:190`), test `:920` (seen failing first). |
| Minor | `design.md` P40 | The script was written before its test file; the RED run was obtained afterwards by moving the module away. | Process debt of the apply, already declared in the step 9 report and in P40; the tests were not weakened and all four fixes of this review were made test-first. No code action. |
| Question | `scripts/measure-context.mjs:888` | `npm run measure:context` without `LLM_MODEL_VERIFY=` on the command line picks the verification model of `.env`, which on this machine differs from the published run, so the command exits 1 naming `raw/run.json` (seen live). | Intended (the raw data is never mixed); `docs/project-context.md` already says `LLM_BASE_URL`, `LLM_MODEL` and `LLM_MODEL_VERIFY` go on the command line. No action. |
| Question | `scripts/measure-context.mjs:921` | Two runs at once on the same root could both ask a missing question and write the same raw file. | A local, single-operator measurement CLI; the second write would be the same kind of record and the outputs are rebuilt from whatever is on disk. Out of scope; no action. |

No Blocker, no Major.

### Verdict

PASS WITH GAPS — no Blockers and no Majors. The four code findings are fixed in this PR (test-first, suite green);
the only gap left is the process note of P40.

### Recommended next steps before archiving

1. Commit the four fixes, their tests and these reports to PR #103 and wait for CI green.
2. Destinations (`docs/project-context.md` → Tracking deferred findings), recorded in `design.md` → Follow-ups as
   P43-P48: the four fixed findings **A** (fixed in this change); P40 process note **A** (declared, no action);
   the two questions **D** (accepted, no action). None has destination C.
3. Archive with `/opsx:archive` (two deltas) after CI is green.
