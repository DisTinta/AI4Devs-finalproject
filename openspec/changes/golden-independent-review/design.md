## Context

See proposal.md (Why). Current state: `seeds/cache/task-api.json` (Q1–Q3) and
`seeds/cache/acme-shop.json` (Q1, Q3, Q4), both `generatedWith.model = qwen2.5-coder`, all six
entries with `reviews: []`. `packages/cli/src/cache/golden-file.ts` defines `reviews` as a list of
strict `{by, date}` objects; `verify`, `seed-load` and the fingerprints do not read `reviews`, so
adding signatures leaves nothing stale. task-api Q4 has no golden: `ask` answers it
`UNKNOWN (no-anchor)` before the cache is read (`tests/integration/cli/ask-command.spec.ts`).

The autonomous workflow (`autonomous-sdd`, `runPanel`, the DIS-80 precedent) runs the panel between
two halves of the apply: `apply-prepare` does the tasks before the group **Panel** of `tasks.md`;
each panelist reads that group and returns its output; `panel-record` (Sonnet) writes and commits
the outputs; `panel-resolve` (Opus) writes the resolution; `apply-finish` does the tasks after the
group.

Constraints: no production behaviour change; `packages/core` untouched; JSON stored with LF
(`.gitattributes`); the golden files keep their canonical render (`golden-coherence.spec.ts`).

## Goals / Non-Goals

**Goals:** every versioned golden answer judged blind, against the fixture code, by two agents of
models other than the generator, under a criterion fixed before judging; signatures traceable to the
panel files; figures any reader can recompute from committed files.

**Non-Goals:** regenerating answers; a validation script for panel outputs (the coherence test is
the validator); a SHA-256 freeze of the panel files; any model call from repository code.

## Decisions

Decisions R1–R10 come from the enrich step (Linear DIS-33, description "[enhanced]", agent's text);
D1–D9 refine them in this proposal (agent's text, lead engineer in an autonomous run, without the
author).

**D1 — Panel (R1).** Two panelists blind to each other: panelist 1 Opus, panelist 2 Sonnet; a
resolver Opus in a fresh context, only over the items whose verdicts differ. Both are models other
than the generator (`qwen2.5-coder`), which meets the ticket's rule "if Opus generated them, Sonnet
reviews". The signature uses the `model` each panelist writes in its own output
(`agent:<model>`). That `model` is the exact model id, matching `^claude-[a-z]+-[0-9]+(-[0-9]+)*$`;
the Panel group tells panelist 1 to write `claude-opus-5-5` and panelist 2 `claude-sonnet-5-5`, so
the signatures are those of AC 3 and of the DIS-34 precedent (`agent:claude-opus-5-5`). The test
checks the pattern (a free-text `model` such as `Opus` rejects the output), not the literal ids. *Alternative rejected:* one reviewer (the ticket's
original wording) — two give an agreement measure and catch a single reviewer's slips.

**D2 — Blindness (R2).** Allowed to a panelist: the Panel group of this `tasks.md` (it holds the
criterion), the `## Criterion` and `## Panel` sections of the report (the same text, committed
before the input), the panel input, the description of Linear DIS-33 (never its comments), `docs/base-standards.md`
(process doctrine the step contract points at; no fixture content), and the
code of the two fixtures: every file under `fixtures/task-api/` and `fixtures/acme-shop/` except
their `README.md`, `docs/**` and `node_modules/**` (a golden may cite a fixture test, and the
behaviour item needs the whole tree to check there is no authentication). Forbidden: everything
else, in particular `fixtures/README.md` (it holds the expected answers), `seeds/**`, the previous
reports of `docs/golden-review/` (all but this change's report), Linear comments of DIS-33 and
DIS-32 (they hold the generating agent's notes), `openspec/changes/archive/**`, this change's
`design.md`, `proposal.md`, specs and spec-audit report, `packages/**`, `tests/**` (repository
tests), `scripts/**`, the database and the other panelist's output. Every file read goes in
`sourcesRead`. The test checks `sourcesRead` against an **allowlist per role**, by path string, as
the spec fixes it (panelists: the five exact entries, `linear:DIS-33/description` among them, plus
the prefixes `fixtures/task-api/` and `fixtures/acme-shop/` minus their `README.md`, `docs/` and
`node_modules/`; resolver: the same plus the two panelist outputs and `docs/AUTONOMOUS-RUN.md`),
like `sourceProblem` of `scripts/annotation-agreement.mjs` (DIS-80). The forbidden list of the
Panel group is explanatory: what it names is outside the allowlist. *Alternative rejected:* a
denylist check — it lets through any path nobody thought to list. *Alternative rejected:* an
allowlist of the cited files only — the behaviour item and a `false` judgement need the rest of the
code.

**D3 — Verdict stays out of the golden format (R3).** `reviews` keeps `{by, date}`; the strict schema
does not change (a `verdict` key would change format 1, its canonical render, `cache-build` and their
spec). The verdict lives in the report and the panel files, and the test joins them with the
golden entries by project and id.

**D4 — Criterion (R4), made mechanical.** Each statement is judged `true`, `false`, `unverifiable`
or `overtyped`; an *error* is any judgement other than `true` (a false statement, a citation that
cannot be checked or does not back the statement, a `FACT` the code does not state literally). The
item's `answer` text is judged `"true"` / `"false"`. Verdict: `incorrect` if the answer is false,
or a `FACT` is judged `false`, or every statement has an error; else `correct` with zero errors;
else `partial`. Model typos ("shemas") are noted, not errors. Behaviour item task-api Q4: answer
`"true"` iff the fixture has no authentication (no route, middleware, hook or plugin that does it),
no statements, so `correct` or `incorrect`. Because the verdict follows from the judgements, the test
checks it: a panelist cannot write a verdict its own judgements contradict. *Alternative rejected:*
a free verdict per item — the ticket asks for a criterion written before judging, and a derived
verdict makes it checkable.

**D5 — Incorrect answers are handed off, not retired here (revises R5).** R5 said retire. Retiring
an answer removes a golden question: it changes `GOLDEN_PROJECTS`, the "Golden questions"
requirement of this capability (which lists the ids), the web's suggested questions and several
existing tests (`tests/unit/seed/golden-questions.spec.ts`, `tests/unit/seed/suggested-questions-coherence.spec.ts`,
`packages/web/src/pages/AskPage.test.tsx`, among others) — none of which can be named before the
panel says which item, and a plan that cannot name the tests it changes is refused by the kit.
Regenerating needs Ollama and a second panel, and `runPanel` runs once per ticket. So an entry whose
final verdict is `incorrect` stays in its file **unsigned** (`reviews: []`), the report lists it
under `## Pending`, and a successor ticket (destination B) regenerates or retires it and has it
reviewed again. The DoD bullet "the incorrect ones are regenerated or retired" is thereby met by the
successor ticket, not by this PR; `verify` keeps its counts. Spec-audit question Q-A (run 1) asked
whether this bullet moves out of DIS-33 or a conditional retirement group is planned here (the
audit showed the affected files form a closed set). *Agent's decision (correction round 1, lead
engineer, autonomous run):* the bullet moves to the successor ticket (option a), because it widens
scope least: a conditional group would plan edits to `GOLDEN_PROJECTS`, the main spec's "Golden
questions", `fixtures/README.md` and three existing tests that most likely never run, and would
change existing tests in a review chore. AC 4 and R9 of the ticket's `[enhanced]` part are amended
accordingly (agent's text). *Alternative rejected:* conditional retirement in this change (wider
scope, existing tests changed for a hypothetical case); stopping the ticket (not a clean-stop
condition of the run contract).

**D6 — Blind input by projection (R6).** The input is written with the edit tools in the preparation
from the two golden files, by the projection the spec fixes; each statement keeps the numbers of the
evidence it cites (without them a panelist could not know what each statement claims to rest on).
No `excerpt` is copied: the panelist reads the code itself, and the planted secret
(`fixtures/task-api/src/config/env.ts`) never leaves the fixture. The test recomputes the projection
and compares.

**D7 — Output shapes (R7).** As the spec fixes, with `date` and `sourcesRead` added to R7's shape
(the signature needs the date; `sourcesRead` is the DIS-80 blindness record). Every object has
exactly the keys listed; an extra or missing key rejects the output (the Panel group says so, since
a rejection stops the ticket). Citations are repository-relative (`fixtures/<project>/<path>:<line>`),
matched by `/fixtures\/(task-api|acme-shop)\/([A-Za-z0-9_.\/-]+):([0-9]+)/g` (any extension, unlike
the `.php|.ts` pattern of DIS-80, because acme-shop has `.blade.php`, `.json` and `.md` files); a
range `:a-b` is read as its first line; at least one valid citation per statement, per `notes` and
per resolved item; other citations are ignored (DIS-80 rule R2-B5). `panel-record` writes
the outputs as returned; nobody edits them afterwards. If the test rejects an output, the ticket
stops with that reason (a panel output is never corrected).

**D8 — Agreement (R8).** n = 7 verdicts (6 golden + the behaviour item). Percent = agreed / 7 × 100,
one decimal, half away from zero. Kappa with `cohenKappa` of `scripts/annotation-agreement.mjs`
(three decimals; `null` → `undefined` in the report, which happens when both panelists give one same
verdict to all seven). No new script: the report's figures are computed in the apply and the test
recomputes them. With n = 7 kappa is indicative. The Panel group has no agreement task, so
`panel-record` only records. The report renders the percent with exactly one decimal (`100.0%`) and
the kappa with exactly three (`0.500`), and the test compares them as text. Only `cohenKappa` is
exported by the script; the test copies the integer rounding of `roundRatio` (l. 274) for the
percent and the line-count rule of `fixtureLines` (l. 121: the last line is the number of lines, a
final LF not counting) for citations. *Agent's decision:* the duplication is accepted, because
changing `scripts/annotation-agreement.mjs` (and its tests) is out of this change's scope; the
copied rules keep the results consistent with DIS-80.

**D9 — Order and immutability of the criterion (AC 1).** The criterion is fixed now, in the Panel
group of `tasks.md`. The preparation copies it verbatim into the report's `## Criterion` and commits
the report before the commit that creates the panel input; the step 8 report records both commit
SHAs and that `git log -p` shows no later change to the `## Criterion` section. A test does not
check git order (CI clones may be shallow). The spec requirement "Criterion first and immutable panel
record" fixes this: its verbatim-equality scenario is a test, its git-history scenario is verified
in the step 8 report (task 8.3).

**Layer order.** No production code: test (`tests/unit/seed/golden-reviews.spec.ts`) → data
(`docs/golden-review/panel/*.json`, `seeds/cache/*.json`) → docs. ADR not warranted: no
cross-module or hard-to-revert decision.

## Risks / Trade-offs

- **A panelist reads a forbidden source anyway.** `sourcesRead` is self-declared. → The Panel group
  lists the allowlist and the forbidden paths; the report states the limitation.
- **Two models of one family are not independent reviewers in the sense of two people.** → Stated in
  `## Limitations`; kappa reported as indicative (n = 7).
- **A derived verdict makes an inconsistent output fail the test and stop the ticket.** → The Panel
  group spells the derivation out; a stop is the honest outcome (no output is ever corrected).
- **An `incorrect` golden stays served by the demo until the successor ticket.** → It is unsigned
  and listed under `## Pending`; `fixtures/README.md` points at the report.
- **The criterion was written by an agent that read the golden answers** (to design the input). → It
  names classes of error, never an item, a statement or a line; the report says so in its
  limitations.
- **The ticket description, readable by panelists, has a first version of the criterion (R4).** → The
  Panel group says it prevails where they differ; D4 only makes R4 mechanical, it does not change
  what counts as an error.

## Migration Plan

None: data and docs only. Rollback = revert the PR (the `reviews` return to empty).

## Open Questions

None open. The three questions of spec-audit run 1 (Q-A, Q-B, Q-C) were answered by the agent as
lead engineer in correction round 1 (rows SA-Q-A, SA-Q-B, SA-Q-C below); every other choice is
recorded above and below as the agent's decision.

## Follow-ups

Decisions of the enrich step (Linear DIS-33, R1–R10) and of this proposal (D1–D9), with their
destination (`docs/project-context.md` → Tracking deferred findings). *Agent's text: decided as lead
engineer in an autonomous run, without the author.* The spec audit and the pre-merge reviews add
their findings here.

| Id | Decision or finding | Destination |
|---|---|---|
| R1 / D1 | Two blind panelists (Opus, Sonnet), Opus resolver; signature from each output's `model` | **A** — this change (Panel group) |
| R2 / D2 | Allowed and forbidden sources; `sourcesRead` per file | **A** — this change (Panel group, test) |
| R3 / D3 | `reviews` stays `{by, date}`; verdict in the report and panel files | **A** — this change |
| R4 / D4 | Criterion with four statement judgements and a derived verdict | **A** — this change (Panel group, report) |
| R5 / D5 | An `incorrect` golden is left unsigned and handed off instead of retired here | **A** — this change (report `## Pending`); **B** — a successor ticket per incorrect item, created in task 6.6 only if one exists |
| R6 / D6 | Blind input by projection, statements keep their evidence numbers, no excerpts | **A** — this change |
| R7 / D7 | Output shapes with `date` and `sourcesRead`; at least one valid citation | **A** — this change |
| R8 / D8 | Agreement over 7 verdicts with `cohenKappa`; no new script | **A** — this change |
| R9 | Delta of `golden-answers`. Ticket text: «los golden versionados llevan las firmas del panel independiente; ninguna firma de la autora; ninguna entrada con veredicto final `incorrect`». The last clause is replaced by D5 / SA-Q-A: an `incorrect` entry stays unsigned and listed under `## Pending` | **A** — this change (input, outputs, signatures, report, criterion record); **B** — the "no `incorrect` entry" clause goes to the successor ticket of D5 |
| R10 | Docs: `docs/project-context.md`, `readme.md`, `docs/DEMO.md`, `fixtures/README.md`, TSDoc of `reviews` | **A** — this change |
| D9 | Criterion committed before the input; order checked in the step 8 report, not by a test | **A** — this change |
| P1 | No PowerShell check is needed (no command of the guide changes, no capture); nothing planned for the author | **D** — accepted |
| P2 | No ADR, no Stryker run (no production code changes) | **D** — accepted |

Spec audit run 1 (`reports/2026-10-28-spec-audit.md`), resolved in correction round 1. *Agent's
text: decided as lead engineer in an autonomous run, without the author.*

| Id | Decision or finding | Destination |
|---|---|---|
| SA-Q-A | DoD bullet «las incorrectas se regeneran o se retiran» and AC 4: moved to the successor ticket of D5 (option a, least scope); `[enhanced]` AC 4 and R9 amended in Linear | **A** — this change (unsigned + `## Pending`); **B** — successor ticket, task 6.6, only if an item is `incorrect` |
| SA-Q-B | The DoD's «y el veredicto» is met by the report's `## Verdicts` table, joined to each entry by project and id in the test (D3); `reviews` stays `{by, date}` | **A** — this change |
| SA-Q-C | Confirmed in scope: the three acme-shop golden answers (the demo serves them; DIS-32 E7 reset their reviews), two panelists plus a resolver (agreement measure, D1), the TSDoc of `golden-file.ts` (documentation only) | **A** — this change |
| SA-1 (B1) | New requirement "Criterion first and immutable panel record" with a test scenario (verbatim criterion) and a step-8-report scenario (git order, one commit per panel file) | **A** — this change (spec, tasks 6.2, 7.2, 8.3) |
| SA-2 (B2) | AC 4 contradiction resolved by SA-Q-A; the "Signatures" requirement now says the entry stays and is not retired here | **A** — this change |
| SA-3 (B3) | `model` matches `^claude-[a-z]+-[0-9]+(-[0-9]+)*$`; Panel group names `claude-opus-5-5` / `claude-sonnet-5-5`; AC 3 of the ticket gains the exact ids | **A** — this change (spec, D1, Panel group) |
| SA-4 (B4) | `## Panel` and `## Limitations` content required and tested | **A** — this change (spec, task 6.2) |
| SA-5 (B5) | Scenario "Invalid panel outputs are rejected"; task 5.1 RED over synthetic invalid copies, 5.2 GREEN | **A** — this change |
| SA-6 (B6) | `sourcesRead` checked against an allowlist per role (resolver included), `linear:DIS-33/description` allowed literally | **A** — this change (spec, D2, Panel group, task 5.2) |
| SA-7 (B7) | Citation pattern of any extension, a range read as its first line, exact keys in every object | **A** — this change (spec, D7, Panel group) |
| SA-8 (B8) | Report rendering fixed: section order with `## Pending` before `## Limitations`, bare verdicts, `Errors` cell grammar and error source, `<x.y>%`, `<k.kkk>`, `Resolved by the resolver: <k> of 7`, `## Pending` line format; compared as text | **A** — this change (spec, tasks 6.2, 6.4) |
| SA-9 | Improvable findings: quoted forbidden keys in the input scenario and task 2.1; measurable "imprecise but true" rule in the criterion; "task 6.2" → task 6.4 in the Agreement measure; task 6.1 split into 6.1 and 6.2; helper duplication accepted (D8); `verify` unchanged named in the "Signatures" requirement | **A** — this change |
