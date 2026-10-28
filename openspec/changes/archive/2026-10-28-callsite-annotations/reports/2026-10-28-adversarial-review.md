# Adversarial review — callsite-annotations

- Date: 2026-10-28
- Change: callsite-annotations (DIS-80), PR #78, head `90db49b`, diff against `origin/final-project-CRN`
- Step: 13.5, inline mode (agent's text, autonomous run, `review` step; a fresh session, not the one
  that implemented the change)

## Adversarial review

### What was checked

1. **Spec and task alignment.** 28 scenarios ↔ 28 tests of the same name (verify-against-spec report).
   Spec history: the last edit of `specs/` and of the Panel group of `tasks.md` is `c5d4fd0` (audit
   run 5), before the preparation commit `e8041f7`; the spec was not edited after the code. Task marks:
   13.1 and 13.2 were done (PR #78 open, CI green) but left unchecked, DIS-80 was still *In Progress*
   and the step 8 report had no CI addendum.
2. **Hostile input** on every entry point (`validateOutput`, `agreement`, `mergeAnnotations`,
   `checkFreeze`, the CLI): empty output, `null` fields, non-array `sites`/`sourcesRead`, repeated and
   unknown ids, `..`/absolute target paths (`scripts/annotation-agreement.mjs:122`), globs and
   directories in `sourcesRead` (`:147-165`), citation at line 0 and past the end (`:187-198`), kappa at
   p_e = 1 and n = 0 (`:288-300`), negative kappa rounding (`:274-279`, half away from zero on the
   absolute value), an empty hash table (`:461`), `--root` with no value, unknown options and two
   commands (`:605-626`). Running the same command twice is idempotent (merge determinism, demonstrated);
   concurrent runs are not a use case (a one-off local script).
3. **Blast radius.** Readers of `fixtures/`: `scripts/demo-excerpt.mjs:40` (project lookup by directory
   name; `annotations` is not a project name it is asked for; its test passes unchanged), the seed and
   cache builds (iterate the fixed list of sample projects, not the directory). `fixtures/history/`
   was already a non-project directory there. `.gitattributes` (`* text=auto eol=lf`) keeps the hashed
   files LF on every checkout, so the freeze test cannot fail on a Windows clone. No migration. No
   change to `packages/**` or to the fixtures' code.
4. **Evidence quality.** The most important test is "Agreement with the control per panelist"
   (`tests/unit/scripts/annotation-agreement.spec.ts:427`): it compares the whole `agreement.json`
   text, so it catches a swapped panelist order, a control computed over all sites instead of the
   control ones, `indicative` missing, or kappa rounded to two decimals. "The recorded hashes match
   the frozen files" (`tests/unit/docs/annotation-freeze.spec.ts:170`) catches a one-byte edit of any of
   the nine files (proved by `:185`). No existing test was modified.
5. **The data itself.** Independence of the panel and plausibility of the 100 % agreement (below).

### Findings

| Severity | File:line | Finding | Why it matters |
|---|---|---|---|
| Minor | `docs/measurements/annotation-agreement.md:124-126` | The panel agreed on 100/100 sites and 22/22 controls. Beyond the same answers, the two outputs share the citation set of the reason in 61 of 100 sites and the first citation in 74; the distribution of `expected` is identical (40 exact, 17 heuristic, 43 none). Both outputs were committed together in `bda6228` after both agents returned, so neither could read the other through the repository, but the report does not give these figures and the limitation only says "un sesgo compartido no se vería" | A reader of Table 2 should be able to judge how independent the two annotations were; the convergence figures are the evidence for it. Cannot be fixed in the data (frozen); it belongs in the report's limitations |
| Minor | `openspec/changes/callsite-annotations/tasks.md:198-199`; `reports/2026-10-28-8-test-and-state-verification.md` | Tasks 13.1/13.2 done but unchecked; DIS-80 still *In Progress* (task 13.1 asks for *In Review* with a comment linking the PR); no CI addendum in the step 8 report | Process traceability: the archive gate and the author read these marks |
| Minor | `scripts/annotation-agreement.mjs:546`, `:571` | `agreement` and `merge` print `wrote <path>` on stdout, not described by the spec | Unspecified behaviour; harmless operator output |
| Question | `scripts/annotation-agreement.mjs:215-218` | `model`, `date` and `resolver` are checked for presence only (a number or an ill-formed date passes) | The spec asks only for presence; the committed outputs have well-formed strings. Stricter checks would be new scope |
| Question | `scripts/annotation-agreement.mjs:540-541` | `agreement` checks only that `control.json` has a `sites` array, not its entries | `control.json` is frozen and fully checked by `annotation-sites.spec.ts:244`; a malformed control would surface there, not silently in the figures |

No finding on correctness of the code under hostile input: every case listed in "What was checked"
gives the specified result or a rejection naming the problem.

### Verdict

PASS WITH GAPS — no Blockers and no Majors; the Minors are fixed in this change and the Questions are
accepted with a destination.

| Finding | Destination |
|---|---|
| Panel convergence figures | **A** — added to the report's limitations in this PR (the report is not a hashed file); **C** — note for the author in the Spanish comment on DIS-80 |
| Task marks, ticket state, CI addendum | **A** — fixed in this PR and in Linear |
| `wrote <path>` on stdout | **D** — accepted (design Follow-ups RV-3) |
| Type checks of `model` / `date` / `resolver` | **D** — accepted (RV-5) |
| `control.json` entries not re-validated by the CLI | **D** — accepted (RV-5) |

### Recommended next steps before archiving

1. Add the convergence figures to the report's limitations (no hashed file touched; the freeze test
   must stay green).
2. Check tasks 13.1–13.6, add the CI addendum to the step 8 report, move DIS-80 to *In Review* with a
   Spanish comment linking the PR and the review reports.
3. Record RV-1…RV-5 in `design.md` → Follow-ups; then `/opsx:archive` (task 13.7).
