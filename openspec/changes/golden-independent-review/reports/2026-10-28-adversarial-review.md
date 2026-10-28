# Adversarial review: golden-independent-review (DIS-33, PR #79)

Agent's text (autonomous run, review step, inline mode; a fresh session, not the one that did the
apply). Inputs read: proposal, design (with Follow-ups), delta spec, tasks, the three earlier reports,
`git diff origin/final-project-CRN...HEAD` (22 files), the panel input, both panelist outputs, the
resolution, the report, the test, and the fixture lines the report cites
(`fixtures/acme-shop/app/Services/PriceCalculator.php:25-35`,
`fixtures/acme-shop/app/Jobs/RecalculateTotals.php:30-38`).

## Adversarial review

### Findings

| Severity | File:line | Finding | Why it matters |
|---|---|---|---|
| Major | `docs/DEMO.md:289` | The change rewrote the sentence under the demo's price answer to say it was "revisada por un panel de agentes independientes". The question is acme-shop `Q1`, which that panel judged `incorrect` (FACT S6 false against `fixtures/acme-shop/app/Services/PriceCalculator.php:29`) and left unsigned. | The evaluator reads the opposite of the report: the showcased answer is presented as reviewed when the review rejected it. **Fixed in this step**: the paragraph now says the panel judged it `incorrect`, why, and that DIS-108 regenerates or retires it. |
| Minor | `fixtures/README.md:210` | The acme-shop "Golden review" paragraph still called the DIS-104 report "the report of the current golden answers" and then added that "the current golden answers were reviewed in DIS-33": two different reports for the same "current" answers (DIS-32 regenerated them after DIS-104). | Contradictory pointer for a reader looking for the verdict of the served answers. **Fixed in this step**: the DIS-33 report is the current one, Q1 and Q4 named with DIS-108 and DIS-109, the DIS-104 and DIS-34 reports labelled as earlier reviews of replaced answers. |
| Minor | `tests/unit/seed/golden-reviews.spec.ts:543` | The spec says each line of `## Pending` is `- <project> <id>: DIS-<n>`; the test only checked that each incorrect item had a matching line, so an extra item (say a `correct` one) or a malformed line would pass. | A weaker assertion than the requirement. **Fixed in this step**: every `- ` line must match the format and the lines must name exactly the incorrect items, in input order; 9 of 9 tests green. |
| Minor | `tests/unit/seed/golden-reviews.spec.ts:231` | `sourceProblem` rejects only `..` segments, so `fixtures/task-api/./README.md` or `fixtures/task-api//README.md` would pass the allowlist although they name a forbidden file. | The spec fixes the check "by path string only" and names only `..`; the committed outputs have no such entry, and `sourcesRead` is self-declared (stated in `## Limitations`). Tightening it would change the spec of an approved, already-applied panel rule. Destination **D** (accepted). |
| Minor | `docs/golden-review/panel/2026-10-golden-review-panelist-2.json` (task-api Q4 `notes`) | Panelist 2 cites `fixtures/task-api/src/routes/index.ts:27`; the file has 9 lines. | Invalid citations are ignored by the rule (the same notes cite `fixtures/task-api/src/app.ts:25`, valid), so the output stays valid. A panel file is never edited (task 13.6). Destination **D** (accepted, recorded here). |
| Minor | `docs/DEMO.md:228` | The captured output above the paragraph (7 statements) is not the golden answer the seed serves today (6 statements, regenerated in DIS-32): pre-existing since DIS-32, not introduced by this change. | The guide's capture and the live demo differ. Recapturing `docs/DEMO.md` is a PowerShell check for the author (run contract §6). Destination **C** (author, at the next demo recapture or with DIS-108). |
| Question | `design.md` row AP-1 | Panelist 2 ran after panelist 1's output was committed to the branch; its blindness rests on its own `sourcesRead` (which does not list panelist 1's file). | Cannot be verified from the repository. Already recorded (AP-1, report `## Verdicts` note, `## Limitations` "sourcesRead is self-declared"). Destination **D**. |

What else was checked, with no finding:

- **Spec and task alignment.** Every requirement has a scenario; nine scenarios have a test of the
  same name, the tenth (git history) is verified in the step 8 report by design D9 and re-checked
  here (`git diff 538ae91 HEAD` over `tasks.md` changes checkboxes only; no spec commit after
  `f83e004`, before implementation). No existing test was modified (the only test file is new).
- **Hostile input.** Validators read with empty `sourcesRead` entries, non-strings, globs, a
  trailing `/`, an existing directory, `..`, a missing judgement, a citation past the end of the
  file, a citation of the other project, the generator model, a free-text model, an extra key, a
  resolution over an agreed item: each rejected with its rule (`:386`). A missing resolution item
  for a disagreement makes `finalVerdicts` return `undefined` and the signatures test fail
  (`:537`).
- **Blast radius.** `reviews` is read only by `checkGoldenFile` and `renderGoldenFile`
  (`packages/cli/src/cache/golden-file.ts`) and emptied by `cache-build.ts`; `verify`, `seed-load`
  and the fingerprints do not read it: `npm run verify` 3/3 and 3/3, exit 0, in this step. No
  migration. `packages/core` untouched. The two `incorrect` answers keep being served (design D5,
  successor tickets DIS-108 and DIS-109).
- **Evidence quality.** The tests assert data against an independent recomputation, not the
  implementation. Mutation the most important test catches: dropping the `FACT` clause of
  `deriveVerdict` (`:261`) derives `partial` for acme-shop Q1 (S1 to S3 `true`), which differs from
  both committed verdicts `incorrect`, so "Each panelist output judges every item under the
  criterion" fails.
- **Panel judgements spot-checked.** acme-shop Q1 S6: `return $taxable->add($tax)->add($shipping)`
  after `$taxable = $subtotal->subtract($discount)` (`PriceCalculator.php:29`, `:34`): the discount is
  subtracted, the FACT is false. acme-shop Q4: `RecalculateTotals::handle` computes and logs only
  (`RecalculateTotals.php:32`, `:34`): no database write, the answer is false.

### Verdict

PASS WITH GAPS — no Blocker; the one Major and two Minors are fixed in this step; the remaining
Minors and the Question have destinations (D, D, C, D) in `design.md` → Follow-ups.

### Recommended next steps before archiving

1. Commit the fixes of this step and wait for CI green on PR #79.
2. Archive (task 13.7) and re-run `golden-reviews.spec.ts` against the archived tasks path.
3. The author confirms DIS-108 and DIS-109 at review (destination B, AP-2) and recaptures
   `docs/DEMO.md` step 1 when convenient (destination C, RV-6).
