## Context

`npm run measure:context` (DIS-81) asked 20 frozen questions per sample project through the API and
wrote `docs/measurements/context/answers/acme-shop.json` and `task-api.json`: per answer `questionId`,
`question`, `answer`, `reason` (for `UNKNOWN`), `statements` and `evidence`, with no model, no
measurement figure and no verifier verdict, so they are the blind input of this review. The figures
(tokens, latency, model) live in `context-savings.csv`/`.json`, `raw/`, `docs/measurements/context-savings.md`
and `readme.md`, which the reviewers never read. Seven answers are `UNKNOWN`: three
`invalid-model-output` to `answer` questions (`acme-shop` Q13, `task-api` Q01 and Q07) and four
`no-anchor` to the `unknown` questions Q19 and Q20 of each project.

The autonomous workflow (`autonomous-sdd`, `runPanel`) runs the panel between two halves of the
apply: `apply-prepare` does the tasks before the group **Panel** of `tasks.md`; each reviewer reads
the ticket and that group; `panel-record` (Sonnet) commits their outputs and runs the agreement task;
`panel-resolve` (Opus) writes the resolution; `apply-finish` does the tasks after the group. The
pattern is the one of DIS-80 (`scripts/annotation-agreement.mjs`, `docs/measurements/annotation/`,
`docs/measurements/annotation-agreement.md`, `tests/unit/docs/annotation-freeze.spec.ts`).

Constraints: no change to `packages/**`, `fixtures/**` or `docs/measurements/context/**`
(`tests/unit/docs/context-savings.spec.ts` protects the last one: the CSV and the JSON must stay the
exact aggregation of `raw/`); files are stored with LF (`.gitattributes`: `* text=auto eol=lf`), so a
SHA-256 is stable across Windows and Linux; the script follows the `scripts/*.mjs` pattern (ESM,
typed `.d.mts`, pure functions plus a thin CLI, TSDoc).

## Goals / Non-Goals

**Goals:** one verdict per answer (40), judged blind under a criterion fixed beforehand; agreement
figures anyone can recompute from committed files; a frozen, linked record behind the «Correctas
(de 20)» cells; a README that says how the verdicts were obtained.

**Non-Goals:** regenerating or re-measuring answers; changing the product in view of the verdicts;
Table 2; human judges; a hook guarding `docs/measurements/answer-review/`; any model call from
repository code; an npm script.

## Decisions

Decisions D1–D12 come from the enrich step (Linear DIS-82, description "[enhanced]", agent's text)
and are applied as written there. P1–P10 are taken in this proposal (agent's text, lead engineer in
an autonomous run, without the author).

### D1–D12 (enrich step, summarised)

D1 verdicts in a new `verdicts.csv`, never in `context-savings.csv`; each row links the criterion.
D2 three-value scale; the cell counts only `correct`. D3 `UNKNOWN` rules of the criterion. D4
unweighted kappa over three categories per project, reusing `cohenKappa`. D5 closed allowlist of
sources per role, one file per entry, no directory or glob; the resolver never reads
`agreement.json`. D6 every reason holds at least one valid `fichero:línea` citation. D7 merge rules.
D8 criterion in its own file, committed before the panel, hashed. D9 reviewer 1 Opus, reviewer 2
Sonnet, resolver Opus in a fresh context, none of them the apply agent. D10 new script that imports
the pure functions of `annotation-agreement.mjs` instead of generalising it; that script is not
modified, to keep DIS-80's merged code and tests untouched (it is not itself in DIS-80's hash table,
only its data files are; correction of the spec audit, finding 8-I1). D11 no npm script. D12
wording "dos agentes revisores independientes de modelos distintos", never "revisión humana".

### P1. Blindness search and scrub of the ticket description

The author's instruction is that the reviewers do not see which model produced each answer nor the
token column. The reviewer prompt of the workflow tells each reviewer to read the ticket, and the
DIS-82 description, as written by the enrich step, names the generating model and runtime and the
measurement column names (and its mentions of DIS-81 and of PR #103 render with a URL slug that names
the runtime). Decision: a preparation task rewrites the `[reality-map]` and `[enhanced]` sections of
the DIS-82 description without those words and without the DIS-81 and PR mentions (plain text such
as "el ticket 22.2 de la medición"), keeping their meaning; `[original]` is not touched (it has no
hit). Then a case-insensitive search for `qwen|ollama|llm_|inputtokens|baselinetokens|outputtokens|latenc`
over every concrete file of the reviewer allowlist, this `tasks.md` and the description must find
nothing. The plain word "tokens" is not in the pattern: `[original]` says the reviewers do not see
"la columna de tokens", which names no value. `docs/AUTONOMOUS-RUN.md` (resolver only) has one generic
line about the workflow's `ollama` field; it names no model id and no figure of these answers, and is
accepted and stated in the report's limitations. The pattern lives here and in the spec, not in the
Panel group, so `tasks.md` itself passes the search.

### P2. Reviewer allowlist narrowed to the fixtures' application code

The ticket said "ficheros bajo `fixtures/<fixture>/`". Decision: the DIS-80 set of application code
(`app/`, `routes/`, `config/`, `database/`, `composer.json`; `src/`, `package.json`,
`tsconfig.json`), not the fixtures' `README.md`, `docs/` or `tests/`.
`fixtures/acme-shop/docs/pricing.md` deliberately contradicts the code (it is the product's drift
demo), and the criterion judges against the code. `node_modules/`, `seeds/` (golden answers),
`packages/`, `scripts/` and every measurement output are forbidden.

### P3. Output shape and answer key

Reviewer: `{ reviewer, model, date, sourcesRead, answers: [{ project, questionId, verdict, reason }] }`;
resolution: `{ resolver, date, sourcesRead, answers }` with the disagreements only. The key is
`project` + `questionId` (the CSV columns), not a synthetic id. The expected answers are read from the
two answer files, in their order.

### P4. Citation rule

`<path>:<line>` with `<path>` ending in `.php`, `.ts` or `.json` (to cite `routes/api.php`,
`composer.json` or `package.json`), relative to the answer's fixture root, existing, line 1..last; at
least one valid citation per reason, others ignored (DIS-80 P4 rule). Implemented in the new script:
the DIS-80 regex is not exported and that script is not touched (D10).

### P5. `agreement.json` shape

`{ projects: [{ fixture, n, agreed, percent, kappa, disagreements }] }`. It holds no control data, but
the resolver still does not read it (D5): one rule for both panels, and the resolver derives the
disagreement ids from the two reviewer outputs.

### P6. CSV writer

RFC 4180 quoting implemented in the new script (the field writer of `scripts/measure-context.mjs` is
not exported and that script is not touched). Header `project,questionId,verdict,reason,source,criterion`,
LF row ends, final newline.

### P7. Reuse from DIS-80

`scripts/answer-review.mjs` imports `cohenKappa`, `roundRatio`, `sha256` and `checkFreeze` from
`scripts/annotation-agreement.mjs`. `checkFreeze` reads the `## Hashes SHA-256` table of any report,
so the freeze test calls it with `docs/measurements/answer-review.md`. The script also exports
`formatReviewLine` (the README / report line of the spec "Published Table 1"), used by the docs test,
with the decimal-comma rule of `formatAgreement` in `scripts/measure-graph.mjs`: every number is
written in its shortest decimal form with a decimal comma (`String(value).replace('.', ',')`, so `1`,
`0,85`, `-0,111`, `92,5`), stated in the "Published Table 1" delta.

### P8. Existing test that changes

`tests/unit/docs/context-savings.spec.ts`, test "The README Table 1 agrees with the measurement":
it compares the first four columns only (no `pendiente de DIS-82`); the fifth column, the verdict
lines, the link, the conclusions paragraph and the limitations wording are checked by the new
scenario "The Correctas column agrees with the verdicts" in `tests/unit/docs/answer-review.spec.ts`,
together with "The measurement report links the answer review". The other two tests of that file are
unchanged.

### P9. Commit order as evidence

Order: criterion (and the scrubbed description) → reviewer outputs → `agreement.json` → resolution
→ `verdicts.csv` → README conclusions. A unit test cannot check it (CI clones shallowly), so step 8
records `git log --format='%h %s' -- <path>` for each file in the report, and the review report
names the commit of the criterion.

### P10. Language and scope details

`criterion.md` and the report in Spanish (the answers and the questions are in Spanish); verdict
values in English (`correct`, `partial`, `incorrect`). No ADR (local, reversible, follows DIS-80). No
Stryker run: `scripts/**` is outside `stryker.config.json` → `mutate`. No PowerShell check: the
change has no `docs/DEMO.md` capture and no PowerShell-specific command.

### P11. Duplicated helpers accepted (spec audit run 1, 8-I1)

*Agent's text (correction round 1, 2026-11-03).* The new script re-implements the non-exported
helpers of `scripts/annotation-agreement.mjs` (`isObject`, `isDirectory`, `fixtureLines`,
`sourceProblem`, `loadJson`, `fail`, `parseArguments`, about 120 lines) instead of exporting them.
Exporting would edit a merged script of another ticket and widen this change; the duplication is
accepted (destination D) and a shared `scripts/lib/` module is not created here.

### P12. A rejected reviewer output stops the ticket (spec audit run 1, 5-I4)

*Agent's text (correction round 1, 2026-11-03).* When `agreement` or `merge` rejects a reviewer
output or the resolution, the ticket stops cleanly with the script's message (docs/AUTONOMOUS-RUN.md
§6). The output is neither completed, corrected nor re-run inside this run: a re-run would let the
panel be repeated until it passes. A later run that reopens the ticket starts the panel again from
scratch, with fresh reviewers, and records why. Destination D.

### P13. Claims about files outside the allowlist (spec audit run 1, 5-B2)

*Agent's text (correction round 1, 2026-11-03).* 12 of the 134 `evidence` entries of the answers
point to a fixture's `tests/`, `docs/` or `README` paths, which P2 forbids. The criterion fixes,
before any judgement, that such a claim is judged only by the behaviour it states, against the
application code, and that a claim stating only what such a file says counts as a claim without
support in the code. The rule is in the Panel group, in the spec "Correctness criterion" and, by task
3.1, in the rewritten DIS-82 description.

### P14. Output and report formats fixed (spec audit run 1, 5-B1, 5-B3, 5-I2, 5-I3, 6-I1)

*Agent's text (correction round 1, 2026-11-03).* `reviewer` is a JSON number; `date` is checked
only for the form `YYYY-MM-DD`; the order of `answers` is not checked (agreement and merge follow the
answer files). `hashes` exits `1` with `<path>: the file cannot be read` and no hash line when a
frozen file cannot be read (as DIS-80). In the report, «Repositorio» is the fixture name in
backticks, «Pregunta» the `questionId`, the verdict cells the English values in backticks, counts
plain integers, and the `## Concordancia` lines are the README lines with their leading `- `.

## Risks / Trade-offs

- **A reviewer reads a forbidden source anyway.** `sourcesRead` is self-declared; the check catches a
  declared read only. Mitigation: explicit allowlist and forbidden list in the Panel group; stated in
  the report's limitations.
- **The answers betray their origin.** `reason: invalid-model-output` and the wording of the answers
  show that a model wrote them, which is inherent; they do not say which model. Accepted.
- **Two models of one provider** are not independent judges in the human sense; kappa is reported, not
  interpreted beyond its value.
- **"Central claim" is a judgement.** The criterion defines it as the claims needed to answer the
  question; borderline cases become disagreements and the resolver justifies them with `file:line`.
- **Comments vs. code.** The fixtures contain comments and docs that may disagree with the code on
  purpose; the criterion says the executable code prevails.
- **Small n.** 20 answers per project; kappa is unstable at this size, and the report says so.

## Migration Plan

None: new files and three edited documents. Rollback = revert the PR.

## Open Questions

None open: every choice is recorded above and below as the agent's decision.

## Follow-ups

Decisions of the enrich step (Linear DIS-82, D1–D12) and of this proposal (P1–P10), with their
destination (`docs/project-context.md` → Tracking deferred findings). *Agent's text: decided as lead
engineer in an autonomous run, without the author.* The spec audit and the pre-merge reviews add
their findings here. No line has destination C.

| Id | Decision or finding | Destination |
|---|---|---|
| D1 | Verdicts in `docs/measurements/answer-review/verdicts.csv`, linked to the criterion per row | **A** — this change |
| D2 | Three-value scale; the cell counts `correct` only | **A** — this change |
| D3 | `UNKNOWN` rules of the criterion | **A** — this change (Panel group, `criterion.md`) |
| D4 | Unweighted Cohen's kappa over three verdicts per project | **A** — this change |
| D5 | Allowlist per role; resolver never reads `agreement.json` | **A** — this change |
| D6 | At least one valid citation per reason | **A** — this change |
| D7 | Merge rules; no hand edit of `verdicts.csv` | **A** — this change |
| D8 | `criterion.md` committed before the panel and hashed | **A** — this change |
| D9 | Opus / Sonnet reviewers, Opus resolver | **A** — this change |
| D10 | New script importing the DIS-80 pure functions | **A** — this change |
| D11 | No npm script | **D** — accepted |
| D12 | Wording: two independent reviewer agents, never "revisión humana" | **A** — this change |
| P1 | Blindness search and scrub of the DIS-82 description (`[original]` untouched) | **A** — this change (tasks 3.1, 3.2) |
| P2 | Allowlist narrowed to the fixtures' application code | **A** — this change |
| P3 | Output shape and `project` + `questionId` key | **A** — this change |
| P4 | Citation rule (`.php`, `.ts`, `.json`) | **A** — this change |
| P5 | `agreement.json` shape | **A** — this change |
| P6 | RFC 4180 writer in the new script | **A** — this change |
| P7 | Reuse of `cohenKappa`, `roundRatio`, `sha256`, `checkFreeze`; `formatReviewLine` exported | **A** — this change |
| P8 | One existing test changes (named) | **A** — this change |
| P9 | Commit order recorded in the step 8 report | **A** — this change |
| P10 | Spanish documents; no ADR, no Stryker run, no PowerShell check | **D** — accepted |
| P11 | Duplicated non-exported DIS-80 helpers in the new script (8-I1) | **D** — accepted |
| P12 | Rejected output stops the ticket; no re-run within the run (5-I4) | **D** — accepted |
| P13 | Criterion rule for claims about files outside the allowlist (5-B2) | **A** — this change (Panel group, spec, task 3.1) |
| P14 | Output, `hashes` error and report cell formats fixed (5-B1, 5-B3, 5-I2, 5-I3, 6-I1) | **A** — this change |
| Audit 2-B1 | Scenario "A failed merge writes no verdicts file" (merge exit `1`) | **A** — this change (tasks 1.5, 7.2) |
| Audit 2-I1 | Comment on DIS-53: the sub-issue's decision on the review prevails | **A** — done in correction round 1 (Linear) |
| Audit 3-I1 | Resolution with `reviewer` / `model` covered by a scenario | **A** — this change |
| Audit 3-I2 | Report scenario checks the forbidden wording in the whole report | **A** — this change |
| Audit 5-I1 | Shortest decimal form stated in "Published Table 1" | **A** — this change (P7) |
| Audit 7-I1 | First paragraph of proposal "## Why" marked as agent's text | **A** — done in correction round 1 |
| Audit 9-I1 | Task 1 split into three red-green pairs | **A** — this change (tasks 1.1–1.7) |
| Audit run 2, 5-I1 | A valid citation stays "an existing `.php`, `.ts` or `.json` file of the fixture" as the approved spec says; restricting it to the reviewer allowlist was an improvement, not a blocker, and would change an approved requirement during the apply. The criterion already tells reviewers not to read those files and the report states that `sourcesRead` is self-declared (*agent's text, apply-prepare, 2026-11-03*) | **D** — accepted |

| Review 13.4, block 3 | Unspecified behaviour of the script: the `wrote <path>` stdout line (as DIS-80), `percent` `null` / `no definida` for a project with no answers (guard, unreachable with 20 answers), `checkFreeze` re-exported (P7) (*agent's text, review step, 2026-11-03*) | **D** — accepted |
| Review 13.5, Minor 1 | Through the CLI a resolution answering an agreed answer is rejected as `unknown answer <project> <questionId>`; the spec only asks that the answer be named, which it is (*agent's text, review step*) | **D** — accepted |
| Review 13.5, Minor 2 | A valid citation may name any existing fixture file (also `tests/`); no real reason does (checked over the 83 reasons). Same decision as «Audit run 2, 5-I1» (*agent's text, review step*) | **D** — accepted |
| Review 13.5, Minor 3 | `sourcesRead` is self-declared and may omit a source (reviewer 1 lists neither the ticket description nor `docs/base-standards.md`); frozen outputs are not edited, and the report's limitations already say it (*agent's text, review step*) | **D** — accepted |
| Review 13.5, Minor 4 | The README prose repeats verdict figures no test ties to `verdicts.csv`; correct today, and any regeneration fails the freeze test and forces the rewrite (*agent's text, review step*) | **D** — accepted |

*Agent's text (correction round 1, 2026-11-03): rows P11–P14 and "Audit" come from the first spec
audit; the audit asked no question of the author.*
