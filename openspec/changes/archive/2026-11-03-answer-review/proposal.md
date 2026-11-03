## Why

*Agent's text (autonomous run, 2026-11-03).* Table 1 of the README (§2.6, context savings) is measured, but its column «Correctas (de 20)» still
reads `pendiente de DIS-82`: a token saving means little without knowing whether the answers were
right. On 2026-10-27 the author decided that this judgement is not human work: two independent
reviewer agents of different models judge each answer, blind to each other, to the model that
produced the answers and to the measurement figures, a third agent resolves only their
disagreements, and everything is frozen by hash. This change (Linear DIS-82, CM-HU-22.4, parent
DIS-53 / CM-HU-22) produces those verdicts so the column is reproducible and auditable, not an
opinion, and so the README says honestly how it was obtained.

*Agent's text (autonomous run, 2026-11-03): the parent DIS-53 still describes the review as the
author's work; the sub-issue records the author's later decision and prevails (as in DIS-80, Q1).*

## What Changes

- **Criterion (preparation).** `docs/measurements/answer-review/criterion.md`: the written criterion
  of `correct` / `partial` / `incorrect`, with the rules for `UNKNOWN` answers, committed and pushed
  before any reviewer reads an answer; its SHA-256 enters the freeze.
- **Blindness (preparation).** The reviewers read a closed list of sources: the 40 answers of
  `docs/measurements/context/answers/*.json` (no model, no measurement figures), the questions, the
  criterion, the fixture application code, `docs/base-standards.md`, this change's `tasks.md` and the
  DIS-82 description. A preparation task searches that list for the generating model's name and for
  measurement field names before the panel, and scrubs the DIS-82 description of them (its
  `[original]` section is not touched).
- **Review script.** `scripts/answer-review.mjs` (+ `.d.mts`): validation of each reviewer output and
  of the resolution (shape, ids, verdict values, `fichero:línea` citations, allowlist of sources by
  role), agreement per project (percent and unweighted Cohen's kappa over the three verdicts),
  deterministic merge into `docs/measurements/answer-review/verdicts.csv` (one row per answer, each
  linking the criterion), and `hashes`. CLI `node scripts/answer-review.mjs <agreement|merge|hashes>
  [--root <dir>]`, exit codes 0/1/2. It imports `cohenKappa`, `roundRatio`, `sha256` and
  `checkFreeze` from `scripts/annotation-agreement.mjs` (DIS-80), which is not modified.
- **Panel (outside the apply).** Reviewer 1 (Opus) and reviewer 2 (Sonnet) write
  `docs/measurements/answer-review/reviewer-1.json` and `reviewer-2.json`; a recording agent commits
  them and writes `agreement.json`; a resolver (Opus, fresh context) writes `resolution.json` for the
  disagreements only.
- **Report and freeze.** `docs/measurements/answer-review.md` (Spanish): method, results per project,
  agreement, every disagreement, limitations and the SHA-256 of the eight frozen files;
  `tests/unit/docs/answer-review.spec.ts` fails when a byte of any of them changes.
- **Table 1.** `readme.md` §2.6: «Correctas (de 20)» = the number of `correct` verdicts of each
  project, one line per project below the table with the counts and the agreement, a link to the
  report, a conclusions paragraph written after `verdicts.csv` is committed, and the limitations
  stating that the verdicts come from two independent reviewer agents of different models (never
  "revisión humana"). `docs/measurements/context-savings.md` § Limitaciones links the report.
- **Existing test that changes:** `tests/unit/docs/context-savings.spec.ts`, test "The README Table 1
  agrees with the measurement", stops requiring `pendiente de DIS-82` in the fifth column; the new
  test checks that cell against `verdicts.csv`.

Out of scope (non-goals): regenerating answers, re-running `npm run measure:context`, touching
`docs/measurements/context/` (`context-savings.csv`/`.json`, `answers/`, `raw/`, `questions.json`);
changing the product (prompt, verifier, context engine) in view of the verdicts; Table 2 and
`fixtures/annotations/` (DIS-79, DIS-80); human judges or more than two reviewers; any model call
from repository code; a new npm script.

## Capabilities

### New Capabilities

- `answer-review`: the correctness criterion, the review output contract and its validation, the
  agreement measures, the deterministic merge into `verdicts.csv`, the CLI and the frozen report.

### Modified Capabilities

- `context-measurement`: requirement "Published Table 1" (the «Correctas (de 20)» cell comes from
  `verdicts.csv`, with the lines, link, conclusions and limitations wording of the review) and
  requirement "Measurement report" (§ Limitaciones links the answer review instead of announcing
  DIS-82).

## Impact

- New: `scripts/answer-review.mjs`, `scripts/answer-review.d.mts`,
  `tests/unit/scripts/answer-review.spec.ts`, `tests/unit/docs/answer-review.spec.ts`,
  `docs/measurements/answer-review/` (criterion, two reviewer outputs, resolution, agreement,
  verdicts), `docs/measurements/answer-review.md`.
- Modified: `readme.md` §2.6, `docs/measurements/context-savings.md` § Limitaciones,
  `tests/unit/docs/context-savings.spec.ts` (one test, named above), `docs/project-context.md`
  (where the verdicts live and how they are regenerated), `prompts.md`.
- Untouched: `packages/**`, `fixtures/**`, `docs/measurements/context/**`,
  `scripts/annotation-agreement.mjs`, `scripts/measure-context.mjs`. No dependency, no network, no
  personal data (the fixtures are synthetic). Commands from `docs/project-context.md` and
  `.claude/sdd-harness.env` only.
