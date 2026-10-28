## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [ ] 0.1 Feature branch `feature/dis-33-golden-independent-review` (`BRANCH_PREFIX=feature/`), created from `final-project-CRN` before `/opsx:propose`; confirm `git merge-base --is-ancestor origin/final-project-CRN HEAD` and that `openspec/changes/golden-independent-review/` is on it. `git fetch`; if `origin/final-project-CRN` moved, merge it before any data or test change (never force-push a published branch). Every commit scope is `DIS-33`
- [ ] 0.2 Confirm DIS-33 is In Progress in Linear, with a short comment in Spanish naming the change `golden-independent-review` and the branch
- [ ] 0.3 Verify the current branch and `git status`; nothing under `.claude/` or `.cursor/` is ever staged (explicit paths only)
- [ ] 0.4 Baseline: `npx vitest run tests/unit/seed tests/unit/cache` and record the totals; record `git diff --stat final-project-CRN -- packages fixtures` (empty) and that every entry of `seeds/cache/task-api.json` and `seeds/cache/acme-shop.json` has `reviews: []`; then `node scripts/dev-processes.mjs stop`

## 1. Preparation: criterion first (design D9; spec "Golden review report")

- [ ] 1.1 Create `docs/golden-review/2026-10-task-api-golden-review.md` with the edit tools: a title and a short intro (DIS-33, the six golden answers and the behaviour item, generator `qwen2.5-coder`), `## Criterion` copied **verbatim** from the **Criterion** block of the Panel group below, and `## Panel` (panelist 1 Opus, panelist 2 Sonnet, resolver Opus only over disagreements; the allowed and forbidden sources of the Panel group; outputs under `docs/golden-review/panel/`). No other section yet, no verdict, nothing about any item's content. English, no words `human`, `humana`, `a mano`
- [ ] 1.2 Commit the report alone (scope `DIS-33`, explicit path) and push; record its SHA for task 8.3. This commit must precede the one that creates the panel input

## 2. Preparation: blind panel input (TDD; spec "Blind panel input of the golden review"; design D6)

- [ ] 2.1 RED: create `tests/unit/seed/golden-reviews.spec.ts` with the `it` "The panel input projects the golden answers without their verification": it reads the two versioned golden files, computes the projection of the spec (seven items in the order task-api Q1, Q2, Q3, the behaviour item task-api Q4, acme-shop Q1, Q3, Q4; statement `evidence` = the 1-based positions of its `evidenceIds` in the response's `evidence` list), and compares it with `docs/golden-review/panel/2026-10-golden-review-input.json`; it also checks the file text has none of `excerpt`, `verification`, `"status"`, `confidence`, `fileId`, `evidenceIds`, `sha256:`, ends with one LF and has no CR. A header comment cites DIS-33 and the delta of `golden-answers`. See it fail (file missing)
- [ ] 2.2 GREEN: write `docs/golden-review/panel/2026-10-golden-review-input.json` with the edit tools (two-space JSON, LF, final newline), by the projection above; never copy an `excerpt`. `npx vitest run tests/unit/seed/golden-reviews.spec.ts` green
- [ ] 2.3 Commit (scope `DIS-33`, explicit paths: the input and the test) and push, so the input exists before any panelist runs; `node scripts/dev-processes.mjs stop`

## 3. Preparation: hand-off to the panel

- [ ] 3.1 Check that the panel input and the report hold no verdict and no judgement of any item, and that `git status --short seeds fixtures` is empty
- [ ] 3.2 Spanish comment on DIS-33: preparation done, SHAs of tasks 1.2 and 2.3, the panel can start

## 4. Panel

This group is done by independent agents launched by the workflow, outside the apply: panelist 1 (Opus) and panelist 2 (Sonnet), blind to each other; then the recording agent; then a resolver (Opus, fresh context). The apply does not do these tasks. Every rule below is fixed before any judgement (design D1, D2, D4, D7). Where the description of DIS-33 (its R4 criterion, R7 format) differs from this group, this group prevails.

**Input set.** The seven items of `docs/golden-review/panel/2026-10-golden-review-input.json`, in order: task-api `Q1`, `Q2`, `Q3` (golden), task-api `Q4` (behaviour item, `kind: "unknown"`, answer `UNKNOWN (no-anchor)`, no statements), acme-shop `Q1`, `Q3`, `Q4` (golden). For a golden item you get the question, the `answer` text, each statement (`n`, `text`, `type` `FACT` or `INFERENCE`, and `evidence`: the numbers of the evidence entries it cites) and each evidence entry (`n`, `path` relative to the fixture root `fixtures/<project>/`, `startLine`, `endLine`). The input has no excerpt: open the cited lines in the fixture yourself.

**Criterion** (judge against the fixture code at this commit; the golden answers are in Spanish):

- Judge each statement as one of: `true` — true against the code and backed by the lines of the evidence it cites; `false` — contradicted by the code; `unverifiable` — a cited evidence entry does not exist (file or lines) or its lines do not back the statement, even if the statement is true elsewhere; `overtyped` — typed `FACT` but the code does not state it literally (true only by inference). A statement typed `INFERENCE` that the code states literally is `true` (under-typing is not an error).
- An **error** is any statement judgement other than `true`.
- Judge the item's `answer` text: `"true"` if what it says is true against the code, `"false"` otherwise. For the behaviour item task-api `Q4` («¿Cómo se autentican los usuarios?»): `"true"` if the fixture has no authentication (no route, middleware, hook, plugin or check that authenticates a user), so `UNKNOWN` is the due answer; `"false"` if it has any.
- **Verdict**, derived from the judgements, never chosen apart from them: `incorrect` if `answer` is `"false"`, or a `FACT` statement is judged `false`, or the item has statements and every one has an error; otherwise `correct` if every statement is `true` (the behaviour item, with no statements, is `correct` when its `answer` is `"true"`); otherwise `partial`.
- Spelling slips or typos of the model (for example a misspelt word) are noted in `notes` but are not errors. Loose wording that is not false is noted, not an error.

**Output format.** One JSON object per panelist, two-space indent:
`{ "panelist": <1|2>, "model": "<your model id>", "date": "YYYY-MM-DD", "sourcesRead": ["<repository-relative path of one file, or 'linear:DIS-33/description'>", ...], "items": [ { "project": "task-api", "id": "Q1", "answer": "true" | "false", "verdict": "correct" | "partial" | "incorrect", "statements": [ { "n": 1, "judgement": "true" | "false" | "unverifiable" | "overtyped", "cites": ["fixtures/task-api/src/<file>.ts:<line>", ...] } ], "notes": "<one to three sentences in English, citing at least one fixtures/<project>/<path>:<line>>" } ] }`, with the seven items in input order and one judgement per input statement, in order (the behaviour item has `"statements": []`). Every statement and every `notes` must carry at least one citation naming an existing file of the item's project with a line between 1 and that file's last line; other citations are ignored. Each `sourcesRead` entry names one file, never a directory or a glob. The resolution is `{ "resolver": "<model id>", "date": "YYYY-MM-DD", "sourcesRead": [...], "items": [ { "project", "id", "verdict", "justification": "<one to three sentences>", "cites": ["fixtures/<project>/<path>:<line>", ...] } ] }`, with no `panelist` and no `model` field, holding only the items whose two verdicts differ, in input order (`"items": []` when there is none).

**Output paths.** Panelist 1: `docs/golden-review/panel/2026-10-golden-review-panelist-1.json`. Panelist 2: `docs/golden-review/panel/2026-10-golden-review-panelist-2.json`. Resolution: `docs/golden-review/panel/2026-10-golden-review-resolution.json`.

**Allowed sources (allowlist).** Panelists: this `tasks.md` (Panel group), the sections `## Criterion` and `## Panel` of `docs/golden-review/2026-10-task-api-golden-review.md`, `docs/golden-review/panel/2026-10-golden-review-input.json`, the **description** of Linear DIS-33 (`get_issue`, never its comments), `docs/base-standards.md`, and every file under `fixtures/task-api/` and `fixtures/acme-shop/` except their `README.md`, `docs/**` and `node_modules/**`. The resolver may also read the two panelist outputs and `docs/AUTONOMOUS-RUN.md`. Every file read goes in `sourcesRead`, one entry per file.

**Resolver and its step contract.** The general contract of your workflow step applies to git and commits only: you record no decision in `design.md` and write no Linear comment; you read neither `design.md`, the specs, the spec-audit report nor any Linear comment; every process document you read goes in `sourcesRead`.

**Forbidden sources.** Everything not in the allowlist, in particular: `fixtures/README.md` (it holds the expected answers); `fixtures/task-api/README.md`, `fixtures/task-api/docs/**`, `fixtures/acme-shop/README.md`, `fixtures/acme-shop/docs/**`, `fixtures/*/node_modules/**`; `seeds/**` (the golden files: the input replaces them); `docs/golden-review/2026-10-acme-shop-golden-review.md`, `docs/golden-review/2026-10-acme-shop-golden-review-dis-104.md` and any section of this change's report other than `## Criterion` and `## Panel`; the other panelist's output (and, for panelists, the resolution); `docs/**` otherwise (including `docs/project-context.md` and `docs/DEMO.md`); `readme.md`, `prompts.md`; `packages/**`, `tests/**` (the repository's tests, not the fixtures'), `scripts/**`; `openspec/**` except this `tasks.md` (never `design.md`, `proposal.md`, the specs, the reports or `openspec/changes/archive/**`); Linear comments of DIS-33, DIS-32 and any other ticket. Also forbidden: running the analyzers, `ask`, `verify`, the fixtures' tests or any script; reading the database or the answer cache.

**Agreement measure** (design D8). n = 7 items; agreed item = same `verdict`; percent agreement = agreed / 7 × 100, one decimal, half away from zero; Cohen's kappa over the seven verdicts (categories `correct`, `partial`, `incorrect`) with `cohenKappa` of `scripts/annotation-agreement.mjs`, `undefined` when it returns `null`, indicative with n = 7. It is computed after this group (task 6.2), not by the recording agent.

- [ ] 4.1 Panelist 1 (Opus): judge the seven items under the criterion above, from the allowlist only; output `docs/golden-review/panel/2026-10-golden-review-panelist-1.json`
- [ ] 4.2 Panelist 2 (Sonnet): the same, blind to panelist 1; output `docs/golden-review/panel/2026-10-golden-review-panelist-2.json`
- [ ] 4.3 Recording agent: write both outputs exactly as returned (two-space JSON, LF, final newline), commit them (explicit paths) and push. Do not complete, reorder or correct any content
- [ ] 4.4 Resolver (Opus, fresh context): derive the disagreement items from the two panelist outputs (different `verdict`); for each, and only those, read both judgements and the fixture code and decide the verdict under the same criterion, justifying with `file:line`; output `docs/golden-review/panel/2026-10-golden-review-resolution.json` (`"items": []` when there is no disagreement); commit it (explicit path) and push

## 5. After the panel: validate the panel files (TDD; spec "Panel outputs of the golden review"; design D4, D7)

- [ ] 5.1 RED/GREEN: add to `tests/unit/seed/golden-reviews.spec.ts` the `it` "Each panelist output judges every item under the criterion" and "The resolution answers exactly the disagreements", checking every rule of the spec over the real files (forbidden-path check by the Forbidden sources list above: `fixtures/README.md`, `seeds/`, `packages/`, `tests/`, `scripts/`, `openspec/` other than this `tasks.md`, the two earlier `docs/golden-review/*.md` reports, the other panelist's output, a directory or a glob). Run it. If it rejects a panel output or the resolution, do not edit them: stop the ticket with the message of the failing check (design D7)

## 6. After the panel: signatures and report (TDD; spec "Signatures of the reviewed golden answers", "Golden review report"; design D3, D5, D8)

- [ ] 6.1 RED: add the `it` "Every golden answer judged correct or partial carries both panel signatures", "A golden answer judged incorrect carries no signature" (a synthetic `incorrect` verdict through the same helper that computes the expected `reviews`, plus the real files and the report's `## Pending`), "The report's verdicts and agreement match the panel files" (parses the `## Verdicts` table and the `Percent agreement:` / `Cohen's kappa:` lines and recomputes them, importing `cohenKappa` from `scripts/annotation-agreement.mjs`) and "The report states its criterion, panel and limitations". See them fail (no signatures, no verdict table yet)
- [ ] 6.2 GREEN data: in `seeds/cache/task-api.json` and `seeds/cache/acme-shop.json`, with the edit tools, set `reviews` of every entry whose final verdict is `correct` or `partial` to the two signatures of the spec (`agent:<model>` and `date` of panelist 1, then of panelist 2); leave `reviews: []` for an `incorrect` one; change nothing else. `npx vitest run tests/unit/seed/golden-coherence.spec.ts` stays green (canonical render)
- [ ] 6.3 GREEN report: complete `docs/golden-review/2026-10-task-api-golden-review.md` without touching `## Criterion`: fill the panel's model ids and date in `## Panel`; `## Verdicts` with the table of the spec (justification and errors drawn from the panel outputs and the resolution, each with `fixtures/<project>/<path>:<line>`; never quote the planted secret); `## Agreement` (`n = 7`, `Percent agreement: <x>%`, `Cohen's kappa: <k>` from `cohenKappa`, marked indicative; how many items went to the resolver); `## Pending` only if an item is `incorrect`; `## Limitations` (self-declared `sourcesRead`; two models of one family are not independent reviewers in the sense of two people; the generator is a local 7B model; the criterion was written by an agent that had read the golden answers to build the input). `npx vitest run tests/unit/seed/golden-reviews.spec.ts` green
- [ ] 6.4 REFACTOR the test with the suite green; `npm run typecheck`, `npm run lint`
- [ ] 6.5 Only if some final verdict is `incorrect`: create one Linear issue per such item (Spanish, «Regenerar o retirar la golden <proyecto> <id> y revisarla de nuevo», related to DIS-33, linking the report), name it in the report's `## Pending` and in `design.md` → Follow-ups (destination B, agent's text)
- [ ] 6.6 Commit (scope `DIS-33`, explicit paths: the two golden files, the report, the test) and push; `node scripts/dev-processes.mjs stop`

## 7. Review and Update Existing Tests (MANDATORY)

- [ ] 7.1 No existing test is changed by this change: the only test file is new (`tests/unit/seed/golden-reviews.spec.ts`). Review that `tests/unit/seed/golden-coherence.spec.ts` (canonical render with the new `reviews`), `tests/unit/seed/golden-questions.spec.ts`, `tests/unit/cache/golden-file.spec.ts`, `tests/unit/cli/verify.spec.ts` and `tests/integration/cli/verify.spec.ts` pass unchanged; if one fails, fix the data or the doc, not the test
- [ ] 7.2 Every `#### Scenario:` of the delta maps to a test of the same name in `golden-reviews.spec.ts`: 1 (task 2.1), 2 (task 5.1), 4 (task 6.1); 7 in total

## 8. Run Tests and Verify Data State (MANDATORY)

- [ ] 8.1 Targeted: `npx vitest run tests/unit/seed tests/unit/cache`
- [ ] 8.2 Broader: `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- [ ] 8.3 Data state: `git diff --stat final-project-CRN -- packages/core fixtures` is empty; `git diff final-project-CRN -- seeds/cache` touches only `reviews` lines; the commit of task 1.2 is an ancestor of the commit that added the panel input (`git log --diff-filter=A --format=%H -- docs/golden-review/panel/2026-10-golden-review-input.json`, then `git merge-base --is-ancestor <1.2 SHA> <that SHA>`), and `git log -p` over the report shows no change to the `## Criterion` section after task 1.2 (design D9); the panel files are unchanged since their commits (`git log --format=%H -- docs/golden-review/panel` lists only the commits of tasks 2.3, 4.3 and 4.4)
- [ ] 8.4 Docker Postgres up (`docker compose up -d --wait`), `npm run db:migrate`, `npm run db:seed` (`2 projects loaded`), `npm run verify` with no `LLM_*`: `acme-shop: 3/3 golden answers match`, `task-api: 3/3 golden answers match`, exit `0`
- [ ] 8.5 No dependency is added, so no `npm install` and no `npm audit` run; `/privacy-ethics-check` over the diff (no personal data, no network, no model call from code; the planted secret not copied)
- [ ] 8.6 `node scripts/dev-processes.mjs stop`; report `openspec/changes/golden-independent-review/reports/YYYY-MM-DD-8-test-and-state-verification.md` (template of `docs/openspec-tasks-mandatory-steps.md` §6) with the SHAs and checks of 8.3

## 9. Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [ ] 9.1 The interface is the evaluation-mode demo: with the database seeded in 8.4 and no `LLM_*`, in Git Bash run `npm run cli -- ask task-api "¿Qué hace buildPage con los resultados paginados?"` and `npm run cli -- ask acme-shop "¿Cómo se validan los cupones?"`: exit `0`, the golden answer served from the cache (same answer text as the golden file), no model request; and `npm run cli -- ask task-api "¿Cómo se autentican los usuarios?"`: `UNKNOWN (no-anchor)`, exit `0`
- [ ] 9.2 Error case: `npm run verify` against a scratchpad copy of `seeds/cache/` is not needed (verify does not read `reviews`); instead confirm `checkGoldenFile` still rejects a review with an extra key (`tests/unit/cache/golden-file.spec.ts`, unchanged, green) so the signatures did not loosen the format
- [ ] 9.3 Restore: record `claim` and task-api `cache_entry` counts before and after 9.1 (unchanged); `git status --short seeds docs fixtures` shows nothing unexpected; `node scripts/dev-processes.mjs stop`
- [ ] 9.4 Report `openspec/changes/golden-independent-review/reports/YYYY-MM-DD-9-manual-interface-testing.md` with the commands and outputs. No PowerShell check is planned (design Follow-ups P1)

## 10. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 10.1 Not applicable: no user interface changes (the web shows the same answers; `reviews` is not displayed); state it in the step 9 report

## 11. Update Technical Documentation (MANDATORY)

- [ ] 11.1 `fixtures/README.md`: the acme-shop paragraph «Golden review (DIS-34, DIS-104)» and the task-api paragraph «Golden answers (DIS-32)» say that the current golden answers were reviewed in DIS-33 by a blind panel of two agents of models other than the generator, with a link to `docs/golden-review/2026-10-task-api-golden-review.md`; the demo-question tables are not changed
- [ ] 11.2 `docs/project-context.md` (around «the author signs a sample»): the golden answers are reviewed by an independent agent panel (DIS-33: blind input, criterion first, signatures `agent:<model>`, report in `docs/golden-review/`), an `incorrect` one stays unsigned and goes to a successor ticket; a regenerated entry comes back with empty `reviews` and needs a new panel
- [ ] 11.3 `readme.md`: the comment of the `golden-review/` tree line names DIS-33 next to DIS-34; `docs/DEMO.md` (around line 289): «revisada por un panel de agentes independientes (`docs/golden-review/`)»
- [ ] 11.4 TSDoc of `GoldenReview` and of `GoldenEntry.reviews` in `packages/cli/src/cache/golden-file.ts`: who fills them now (the DIS-33 panel, `agent:<model>`), no behaviour change; `npm run docs:coverage` green. ADR not warranted (design P2), recorded in the step 8 report
- [ ] 11.5 `/update-docs`: the docs gate passes; `prompts.md` gains the DIS-33 prompts with its Índice entry in the same edit

## 12. Pull request preparation

- [ ] 12.1 `/pr-describe` in Spanish against `final-project-CRN`: the Why marked as the agent's text; the panel (models, date, verdict per item, agreement, items resolved, any `incorrect` and its successor ticket); that no existing test changed and `packages/core` is untouched

## 13. Pre-merge Review (MANDATORY - AGENT MUST EXECUTE)

- [ ] 13.1 Open the PR against `final-project-CRN`; DIS-33 to In Review with a Spanish comment linking it
- [ ] 13.2 CI green: wait in the foreground with `gh pr checks <n> --watch --interval 60`, repeated until no check is pending; link the run in an addendum to the step 8 report
- [ ] 13.3 `/show-spec-working` (may reuse the step 9 evidence) → `reports/YYYY-MM-DD-show-spec-working.md`
- [ ] 13.4 `/verify-against-spec` (inline mode) → `reports/YYYY-MM-DD-verify-against-spec.md`
- [ ] 13.5 `/adversarial-review` (inline mode) → `reports/YYYY-MM-DD-adversarial-review.md`
- [ ] 13.6 Fix every finding in this change (TDD for behaviour), each with an A/B/C/D destination in `design.md` → Follow-ups; a finding on a panel judgement is never fixed by editing a panel file (it goes to the report and, if needed, to the author, destination C); re-run what each fix invalidates; commit to the same PR; re-run a check whose findings led to non-trivial fixes until no Blocker or Major
- [ ] 13.7 `/opsx:archive`, commit it to the same PR; merge (`gh pr merge <n> --merge`, through the merge gate) only after the archive commit and with CI green
