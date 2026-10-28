# Verify Against Spec — callsite-annotations

- Date: 2026-10-28
- Change: callsite-annotations (DIS-80), PR #78, head `90db49b`
- Step: 13.4, inline mode (agent's text, autonomous run, `review` step). Spec:
  `openspec/changes/callsite-annotations/specs/graph-annotations/spec.md`. Script: `scripts/annotation-agreement.mjs` (paths below are repository-relative).

## 1. Requirements implemented correctly

| Requirement | Code | Test |
|---|---|---|
| Call-site lists (shape, 50 sites, controls first, application code, call on the line, no answer, selection record) | `docs/measurements/annotation/acme-shop.sites.json`, `task-api.sites.json`, `selection.json` (data) | `tests/unit/docs/annotation-sites.spec.ts:136`, `:187`, `:226`; selection table `tests/unit/docs/annotation-freeze.spec.ts:245` |
| Control reference (22 README rows, event row → first listener `handle`, ts-03 rule, README untouched) | `docs/measurements/annotation/control.json`; README rows unchanged (`git diff origin/final-project-CRN -- fixtures/README.md` touches only the title, intro and two headings) | `tests/unit/docs/annotation-sites.spec.ts:244` |
| Panel output validation: fields of both shapes, `panelist` vs file, ids, `expected`/`target` consistency, at least one valid citation, `target.file` and symbol, allowlists per role, directory/glob by path string | `scripts/annotation-agreement.mjs:62-85` (allowlists, citation, glob), `:121` `fixtureLines`, `:147` `sourceProblem`, `:168` `answerProblems`, `:212` `validateOutput` | `tests/unit/scripts/annotation-agreement.spec.ts:210`, `:229`, `:250`, `:270`, `:281`, `:295`, `:307`, `:327`, `:352` |
| Agreement measures: percent (1 decimal) and kappa (3 decimals) half away from zero, `null` kappa when p_e = 1, control figures flagged indicative, exact `agreement.json` shape | `:274` `roundRatio`, `:288` `cohenKappa`, `:339` `figures`, `:360` `agreement` | `:391`, `:412`, `:427` (the last compares the whole JSON text, CLI included) |
| Deterministic merge: common answer + panelist 1's reason / resolution + `tiebreak`, failure with no file on missing or extra resolution, byte-identical two-space LF output | `:390` `jsonText`, `:404` `mergeAnnotations`, `:558` `commandMerge` (validates the resolution first) | `:484`, `:501`, `:523`, `:535` |
| Agreement CLI: commands, `--root`, exit 0/1/2, usage line, no file on failure, `hashes` nine lines in order with forward slashes | `:538`, `:558`, `:584`, `:605` `parseArguments`, `:634` `runAnnotationAgreement` | `:564`, `:580`, `:595` |
| Frozen annotations and agreement report: method, models, sections, disagreements, control discrepancies, hashes, freeze check, no "a mano" | `:452` `checkFreeze`; `docs/measurements/annotation-agreement.md` | `tests/unit/docs/annotation-freeze.spec.ts:170`, `:185`, `:203`, `:225`, `:245` |
| Freeze before measuring | `scripts/measure-graph.mjs` absent at the freeze commit `80a1d9c` (step 8 report) and still absent on the branch | — (state check, task 8.3) |

## 2. Requirements missing or partial

None found. Every requirement and every `#### Scenario:` (28) has code and a test of the same name, and
the 28 pass (`npx vitest run` of the three files: 28 passed). The CI of the head `90db49b` is green
(run 40721587024).

## 3. Unspecified behaviour

| Behaviour | Where | Decision |
|---|---|---|
| `agreement` and `merge` print `wrote <path>` on stdout on success; the spec only defines the stdout of `hashes` | `scripts/annotation-agreement.mjs:546`, `:571` | Kept: an operator message, not data; no consumer parses it. Recorded in `design.md` → Follow-ups (RV-3, D) rather than edited into the spec after implementation |
| A `sourcesRead` entry that is not a non-empty string is rejected (`is not a path`) | `:147-148` | Implied by "each entry SHALL be a path of a single file or the literal"; kept (RV-4, D) |
| `fixtureLines` refuses paths with `..` or a leading `/` | `:121-122` | Implied by "an existing file of the site's fixture": a `..` path would leave the fixture; kept (RV-4, D) |
| `checkFreeze` reports "the report records no SHA-256 hash" when the table is empty | `:461` | Implied by "every recorded hash SHALL match": an empty table would pass vacuously otherwise; kept (RV-4, D) |
| `validateOutput` checks `model`, `date` and `resolver` only for presence, not for type or format | `:215-218` | Matches the spec literally (a missing field); stricter checks would be unspecified scope. Recorded (RV-5, D) |

Specific checks:

- Dependency not in the manifest: none; only `node:crypto`, `node:fs`, `node:path`, `node:url`.
- Authorisation checks required by the spec: none apply (a local script over JSON files).
- Fields in an output the spec does not mention: none; `agreement.json` and the annotation files have
  exactly the specified keys (`annotation-agreement.spec.ts:427` compares the whole text; `:498`
  checks the key order of a merged site).
- Tests weaker than their scenario: "A rejected panel output writes no agreement file" (`:580`) checks
  one problem, not "every problem"; `validateOutput` collects every problem without short-circuit
  (`:212-262`), and "An incomplete panel output is rejected" (`:229`) exercises several, so the gap is
  cosmetic (RV-4, D).

## Scenario → test → state

| Scenario | Test | State |
|---|---|---|
| Each site list has 50 sites with the controls first | annotation-sites.spec.ts:136 | green |
| Every site points at its call in the fixture | annotation-sites.spec.ts:187 | green |
| A site list carries no answer | annotation-sites.spec.ts:226 | green |
| The report counts the selection per construction | annotation-freeze.spec.ts:245 | green |
| The control reference transcribes the 22 README rows | annotation-sites.spec.ts:244 | green |
| A complete panel output is accepted | annotation-agreement.spec.ts:210 | green |
| An incomplete panel output is rejected | annotation-agreement.spec.ts:229 | green |
| A citation to a line that does not exist is rejected | annotation-agreement.spec.ts:250 | green |
| A reason without a citation is rejected | annotation-agreement.spec.ts:270 | green |
| An answer inconsistent between expected and target is rejected | annotation-agreement.spec.ts:281 | green |
| A target that does not exist in the fixture is rejected | annotation-agreement.spec.ts:295 | green |
| A declared forbidden source is rejected | annotation-agreement.spec.ts:307 | green |
| A sourcesRead entry that is a directory or a glob is rejected | annotation-agreement.spec.ts:327 | green |
| A resolution with a source outside the resolver allowlist is rejected | annotation-agreement.spec.ts:352 | green |
| Percent agreement and Cohen's kappa per language | annotation-agreement.spec.ts:391 | green |
| Kappa is undefined when the expected agreement is 1 | annotation-agreement.spec.ts:412 | green |
| Agreement with the control per panelist | annotation-agreement.spec.ts:427 | green |
| Agreed sites take the common answer | annotation-agreement.spec.ts:484 | green |
| Disagreements take the resolution | annotation-agreement.spec.ts:501 | green |
| A missing or extra resolution fails the merge | annotation-agreement.spec.ts:523 | green |
| The merge is deterministic | annotation-agreement.spec.ts:535 | green |
| An unknown command is a usage error | annotation-agreement.spec.ts:564 | green |
| A rejected panel output writes no agreement file | annotation-agreement.spec.ts:580 | green |
| hashes prints the nine files in order | annotation-agreement.spec.ts:595 | green |
| The recorded hashes match the frozen files | annotation-freeze.spec.ts:170 | green |
| A changed annotation file fails the freeze check | annotation-freeze.spec.ts:185 | green |
| The report states the method and every disagreement | annotation-freeze.spec.ts:203 | green |
| The report lists every control discrepancy | annotation-freeze.spec.ts:225 | green |

## Verdict

Conformant: no missing or partial requirement; the unspecified behaviour of block 3 is decided and
recorded in `design.md` → Follow-ups.
