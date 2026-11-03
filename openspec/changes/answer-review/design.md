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
the pure functions of `annotation-agreement.mjs` instead of generalising it. D11 no npm script. D12
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
with the decimal-comma rule of `formatAgreement` in `scripts/measure-graph.mjs`.

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
