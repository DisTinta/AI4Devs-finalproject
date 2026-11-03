# Adversarial review

- Date: 2026-11-03
- Change: answer-review (DIS-82), PR #104, branch `feature/dis-82-answer-review` at `ba9c4b3`, against
  `final-project-CRN`
- Mode: inline (`ai-specs/skills/adversarial-review/SKILL.md` → *Inline mode*), in the review step of the autonomous
  run, a session different from the ones that proposed, implemented and ran the panel. Text of that agent.
- Author's instruction checked explicitly: «Los revisores no ven qué modelo dio cada respuesta ni la columna de
  tokens».

## Adversarial review

### Findings

| Severity | File:line | Finding | Why it matters |
|---|---|---|---|
| Minor | `scripts/answer-review.mjs:519` | Through the CLI, a resolution that also answers an agreed answer is rejected by `validateReview` (expected = the disagreements) as `unknown answer acme-shop Q01`; the clearer message of `mergeVerdicts` (`:375`, «which the reviewers did not disagree on») is reachable only by a direct call. | The spec only asks that the project and question be named, which they are, so behaviour is correct; the operator reads a less precise reason. |
| Minor | `scripts/answer-review.mjs:184-195` | A valid citation may name any existing `.php`/`.ts`/`.json` file of the fixture, also under `tests/` or `node_modules/`, which the reviewer may not read. | Already decided by the spec and recorded in design → Follow-ups («Audit run 2, 5-I1», D). Checked here: none of the 83 reasons of the three outputs cites a path outside `app/`, `routes/`, `config/`, `database/`, `src/` or the three manifest files. |
| Minor | `docs/measurements/answer-review/reviewer-1.json` (`sourcesRead`) | `sourcesRead` is self-declared and may be empty: reviewer 1 does not list `linear:DIS-82/description` nor `docs/base-standards.md`, though the workflow points reviewers to the ticket. Validation can only reject a declared forbidden read. | Blindness rests on the allowlist, the scrubbed description and the blindness search, not on the declaration; the report's `## Limitaciones` already says the list is self-declared. A frozen output is never edited (task 13.6). |
| Minor | `readme.md` (paragraph «Qué dice la columna «Correctas».», and the line before it) | The prose repeats figures («tres desacuerdos», «22 son correctas, 11 parciales y 7 incorrectas», «2 son respuestas `UNKNOWN`») that no test ties to `verdicts.csv`. | Correct today (checked against `verdicts.csv` and the answer files in this review). A regeneration of the verdicts changes the hashes and fails `tests/unit/docs/answer-review.spec.ts`, which forces the report and the README to be rewritten; the risk is a stale sentence after such a rewrite. |

No Blocker and no Major.

### What was checked to reach this table

1. **Spec and task alignment.** Every requirement of both deltas has scenarios and every scenario a test of the same
   name (29, see `reports/2026-11-03-verify-against-spec.md`). Tasks 0-12 are `[x]` with their evidence in the step 8
   and step 9 reports (commit order, eol, hashes, blindness search). The specs were last edited in `2ece69a` (15:04),
   before the code (`dcaaf00`, 15:18): not adjusted to the code. No code beyond the spec except the five behaviours
   decided in block 3 of the verification report.
2. **Author's instruction (blindness).** A case-insensitive search for
   `qwen|ollama|llm_|inputtokens|baselinetokens|outputtokens|latenc` over every reviewer allowlist file finds nothing
   (grep exit 1, this step); `tasks.md` names neither the runtime, nor DIS-81, nor PR #103, nor a token figure (only a
   generic reference in task 3.1 to what was scrubbed). The answer files hold no model, token or latency field. The
   declared sources of both reviewers and the resolver are inside their allowlists (the script validated them, and
   re-ran clean here); none declares `context-savings.*`, `raw/`, `readme.md` or the other reviewer's output.
3. **Hostile input** (read in the code and, where useful, run on a scratchpad copy): empty or missing fields → named
   (`:211-214`); `reviewer` `"1"` and `3/11/2026` → rejected (run); repeated / unknown / missing answer → named
   (`:255-266`, run); citation at line 0, beyond EOF, in the other fixture, with `..` or absolute → invalid
   (`:132`, `:190`, run); `sourcesRead` glob, trailing slash, allowlisted directory, existing subdirectory → rejected
   (run); `--root` without value, unknown option, two commands → exit 2 (run); same command twice → identical bytes
   (run). Case-sensitivity: all citations of the committed outputs are valid with the exact case of the path, so a
   `merge` on Linux accepts them as on Windows (checked here).
4. **Blast radius.** `verdicts.csv`, `agreement.json` and the new script are read only by
   `tests/unit/docs/answer-review.spec.ts` and `tests/unit/scripts/answer-review.spec.ts` (grep). No product code
   (`packages/**`), fixture or `docs/measurements/context/**` changes (`git diff --stat` empty, step 8).
   `scripts/annotation-agreement.mjs` is imported, not modified. No migration. The only existing behaviour that changes
   is the README cell, described by the modified "Published Table 1".
5. **Evidence quality.** The existing test changed is `tests/unit/docs/context-savings.spec.ts` → "The README Table 1
   agrees with the measurement": it now compares the first four columns only. Justified by design P8 and task 6.1, and
   not a weakening overall: the fifth column is asserted cell by cell against `verdicts.csv` by "The Correctas column
   agrees with the verdicts". The most important test is "Percent agreement and Cohen's kappa per project": it compares
   the whole `agreement.json` object against a hand-computed 3×3 table (kappa 0.508 and 0.636), so it would catch a
   weighted kappa, a swapped marginal, rounding to the wrong digit or disagreements out of answer order. The freeze
   test would catch one changed byte in any of the eight files ("A changed review file fails the freeze check"
   appends one space and expects exactly that path).

### Verdict

PASS WITH GAPS — no Blockers, no Majors; the four Minors are tracked below.

### Recommended next steps before archiving

1. Record the four Minors in `design.md` → Follow-ups (all destination **D**, accepted, with the reason in the table
   above; the second one is the existing row «Audit run 2, 5-I1»). None is fixed by editing a frozen file, and none
   needs a Linear debt issue: they are wording and process limits, already stated in the report where they touch the
   verdicts.
2. Keep CI green on PR #104 and archive with `/opsx:archive` (main specs `answer-review` and `context-measurement`
   synced by the archive).
