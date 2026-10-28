## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Feature branch `feature/dis-80-callsite-annotations` (`BRANCH_PREFIX=feature/`), created from `final-project-CRN` before `/opsx:propose`; confirm `git merge-base --is-ancestor origin/final-project-CRN HEAD` and that `openspec/changes/callsite-annotations/` is on it. `git fetch`; if `origin/final-project-CRN` moved, merge it before any code (never force-push a published branch). Every commit scope is `DIS-80`
- [ ] 0.2 Confirm DIS-80 is In Progress in Linear, with a short comment in Spanish naming the change `callsite-annotations` and the branch
- [ ] 0.3 Verify the current branch and `git status`; nothing under `.claude/` or `.cursor/` is ever staged, nor the unrelated `openspec/specs/*` edits and `openspec/changes/archive/2026-10-28-task-api-seed-golden/` left in the working copy by another ticket (explicit paths only)
- [ ] 0.4 Baseline: `npx vitest run tests/unit/scripts tests/unit/docs` and record the totals; record `git diff --stat final-project-CRN -- packages fixtures/acme-shop fixtures/task-api` (empty); then `node scripts/dev-processes.mjs stop`

## 1. Preparation: agreement script (TDD; spec "Panel output validation", "Agreement measures", "Deterministic merge into the annotation files"; design D6, D7, D10, P4)

- [ ] 1.1 RED: create `tests/unit/scripts/annotation-agreement.spec.ts` with one `it` per scenario, named exactly after it: "A complete panel output is accepted", "An incomplete panel output is rejected", "A citation to a line that does not exist is rejected", "A declared forbidden source is rejected", "Percent agreement and Cohen's kappa per language", "Kappa is undefined when the expected agreement is 1", "Agreement with the control per panelist", "Agreed sites take the common answer", "Disagreements take the resolution", "A missing or extra resolution fails the merge", "The merge is deterministic". Data built in the test (small site lists over a temporary fixture root written with `mkdtempSync`, never the real panel files, which do not exist yet); the kappa case uses a contingency table computed by hand and written in a comment (for example 10 sites, p_o = 0.8, p_e = 0.34, κ = 0.697). See them fail (no script yet)
- [ ] 1.2 GREEN: `scripts/annotation-agreement.mjs` and `scripts/annotation-agreement.d.mts` with `validateOutput`, `agreement`, `cohenKappa`, `mergeAnnotations`, `sha256` and `checkFreeze` (design D10), the allowlists of design D4 per role (panelist, resolver), the citation rule of design P4, and the CLI commands `agreement`, `merge`, `hashes` with an optional root for tests; TSDoc citing DIS-80 and the design decisions on every function; output JSON with two-space indent, LF and a final newline. `npx vitest run tests/unit/scripts/annotation-agreement.spec.ts` green
- [ ] 1.3 REFACTOR with the suite green; `npm run typecheck`, `npm run lint`, `npm run docs:coverage`

## 2. Preparation: site lists and control reference (TDD; spec "Call-site lists", "Control reference"; design D3, D5, P1, P3)

- [ ] 2.1 RED: create `tests/unit/docs/annotation-sites.spec.ts` with one `it` per scenario, named exactly after it: "Each site list has 50 sites with the controls first", "Every site points at its call in the fixture", "A site list carries no answer", "The control reference transcribes the 22 README rows" (this one parses the two tables of `fixtures/README.md` § "Table 2 seed" and compares their *Expected* column with `control.json`, `no edge` read as `none`). It reads the real files of `docs/measurements/annotation/`; see it fail (files missing)
- [ ] 2.2 GREEN: `docs/measurements/annotation/acme-shop.sites.json` and `task-api.sites.json` (`{ "fixture", "language", "sites": [...] }`), written with the edit tools. Controls first, in README order, located in the fixture code (for a README row that describes two edges, the call that leaves the row's source symbol, design D3); then 38 / 40 new sites from application code ordered by file path and line, covering the constructions of design D5. Nothing in the site lists hints an answer: no target, no resolution, no comment, no per-construction label. Record the count per construction in the scratchpad for the report (task 6.2), not in the site lists
- [ ] 2.3 GREEN: `docs/measurements/annotation/control.json` (`{ "sites": [ { "id", "target", "expected" } ] }`), transcribing the 22 README rows by the rules of the spec "Control reference" and design D3: the row's graph target when the row names one, a listener or job reached by a convention as its `handle` method, the symbol names of design D1, `no edge` as `none` with a `null` target. The README is not edited. `npx vitest run tests/unit/docs/annotation-sites.spec.ts` green
- [ ] 2.4 Commit (scope `DIS-80`, explicit paths: the script, its types, the two new tests, the three JSON files) and push, so the site lists and the control reference are committed before any panelist runs; `node scripts/dev-processes.mjs stop`

## 3. Preparation: hand-off to the panel

- [ ] 3.1 Check that no tracked file written by this change, and nothing in the Panel group below, contains an answer of a control site; `git status --short fixtures/` shows no change
- [ ] 3.2 Spanish comment on DIS-80: preparation done, commit SHA of task 2.4, the panel can start

## 4. Panel

This group is done by independent agents launched by the workflow, outside the apply: panelist 1 (Opus) and panelist 2 (Sonnet), blind to each other; then the recording agent; then a resolver (Opus, fresh context). The apply does not do these tasks. Every rule below is fixed before any judgement (design D2, D4, D6, D8).

**Input set.** The 100 sites of `docs/measurements/annotation/acme-shop.sites.json` (50, PHP, ids `php-01`…`php-50`) and `docs/measurements/annotation/task-api.sites.json` (50, TypeScript, ids `ts-01`…`ts-50`). Each site gives `site.file` and `site.line` (relative to the fixture root: `fixtures/acme-shop/` or `fixtures/task-api/`), `form` (`call`, `new` or `reference`), `call` (the call text up to its opening parenthesis, or the reference passed as an argument) and `source` (the enclosing symbol, or the file for a call outside any function or method). `control` only says whether the site is also used to measure agreement with a reference you may not read; judge every site the same way.

**Criterion** (the resolution a static analyzer *should* give when it reads only the fixture's own source files: no `vendor/`, no `node_modules/`, no standard-library or package declarations):

- `exact` — the target is fixed by declarations inside the fixture: a declared or inferred type of the receiver declared in the fixture, an explicit import or `use`, an explicit class name (`X::m()`, `new X(...)`, `[X::class, 'm']`), or a reference to a declared function or method.
- `heuristic` — the target is reached only by applying a known framework convention to fixture code: a Laravel facade (through its accessor and the container binding), a binding by string in the container, `__call` / `__callStatic`, an Eloquent attribute or relation read through `__get` (target: the declared accessor or relation method), a route action written as a string (`'Controller@method'`), `dispatch(new Job)` → the job's `handle`, `event(new E)` → the `handle` of the listener registered for `E` in `EventServiceProvider::$listen`.
- `none` — the target is outside the fixture's code (PHP or framework functions, `vendor`, `node_modules`, the standard library, Zod, Fastify), or it is only reachable through a receiver whose type is declared outside the fixture (a package or the standard library) and no convention of the `heuristic` list applies, or it cannot be determined statically.
- `expected` is `none` exactly when `target` is `null`.
- When a call names a method that is not declared and is served by a magic method, `target` is the symbol that exists in the code (the `__call`, the accessor). When a call can reach several symbols, `target` is the one declared first in the code and the reason names the others.
- A `form: reference` site is judged as the call the reference stands for: the target is the function or method it names.
- Symbol names: `Class::method` for methods (constructors `Class::__construct` in PHP, `Class::constructor` in TypeScript), a function by its name; `target.file` is relative to the fixture root.

**Output format.** One JSON object per agent, two-space indent:
`{ "panelist": <1|2>, "model": "<model id>", "date": "YYYY-MM-DD", "sourcesRead": ["<repository-relative path or 'linear:DIS-80/description'>", ...], "sites": [ { "id": "php-01", "target": { "file": "app/...", "symbol": "Class::method" } | null, "expected": "exact" | "heuristic" | "none", "reason": "<one or two sentences citing at least one file:line, path relative to the fixture root, e.g. app/Services/TaxService.php:21>" }, ... ] }`, with the 100 sites in id order. The resolution uses `"resolver": "<model id>"` instead of `"panelist"` and contains only the disagreement ids.

**Allowed sources (allowlist).** Panelists: `fixtures/acme-shop/app/**`, `fixtures/acme-shop/routes/**`, `fixtures/acme-shop/config/**`, `fixtures/acme-shop/database/**`, `fixtures/acme-shop/composer.json`, `fixtures/task-api/src/**`, `fixtures/task-api/package.json`, `fixtures/task-api/tsconfig.json`, the two `*.sites.json`, this `tasks.md` and the **description** of Linear DIS-80 (`get_issue`, never its comments). The resolver may also read `docs/measurements/annotation/panelist-1.json`, `panelist-2.json` and `agreement.json`. Every path read goes in `sourcesRead`; a path outside the allowlist makes the output invalid.

**Forbidden sources.** Everything not in the allowlist, in particular: `fixtures/README.md`; `fixtures/acme-shop/README.md`, `fixtures/acme-shop/docs/**`, `fixtures/acme-shop/tests/**`, `fixtures/task-api/README.md`, `fixtures/task-api/docs/**`, `fixtures/task-api/tests/**`, `fixtures/task-api/node_modules/**`; `fixtures/annotations/**`; `docs/measurements/annotation/control.json` and the other panelist's output; `docs/measurements/annotation-agreement.md`; `docs/**` otherwise (including `docs/project-context.md`); `README.md`, `prompts.md`; `packages/**`, `tests/**`, `seeds/**`, `scripts/**`; `openspec/**` except this `tasks.md` (never `design.md`, `proposal.md`, the specs, the reports or the archive); Linear comments of DIS-80 and any other ticket. Also forbidden: running the analyzers, `measure-graph` or any script; reading the graph tables, the database or the answer cache.

**Agreement measure** (design D6). Per language, n = 50: agreed site = same `expected` and same `target` (`file` and `symbol`); percent agreement = agreed / n × 100; Cohen's kappa over `expected` (categories `exact`, `heuristic`, `none`), `null` when the expected agreement is 1. Per panelist and language, the same against the control sites (n = 12 / 10), kappa marked indicative.

- [ ] 4.1 Panelist 1 (Opus): annotate the 100 sites under the criterion above, from the allowlist only; output `docs/measurements/annotation/panelist-1.json`
- [ ] 4.2 Panelist 2 (Sonnet): the same, blind to panelist 1; output `docs/measurements/annotation/panelist-2.json`
- [ ] 4.3 Recording agent: write both outputs exactly as returned, commit them (explicit paths) and push; then run `node scripts/annotation-agreement.mjs agreement`. If it rejects an output (ids missing, repeated or unknown; a citation to a missing file or line; a `sourcesRead` path outside the allowlist), do not complete or correct it: stop the ticket with that reason (spec "Panel output validation"). Otherwise commit `docs/measurements/annotation/agreement.json` and push
- [ ] 4.4 Resolver (Opus, fresh context): for each disagreement id in `agreement.json`, and only those, read both answers and the fixture code and decide under the same criterion, justifying with `file:line`; output `docs/measurements/annotation/resolution.json` (empty `sites` when there is no disagreement); commit it (explicit path) and push

## 5. After the panel: merge the annotations (spec "Deterministic merge into the annotation files"; design D7)

- [ ] 5.1 `node scripts/annotation-agreement.mjs merge`: it validates `resolution.json` (resolver allowlist, exactly the disagreement ids) and writes `fixtures/annotations/acme-shop.callsites.json` and `fixtures/annotations/task-api.callsites.json`. If it fails, stop the ticket with its message; never edit a panel output, the resolution or a generated file by hand
- [ ] 5.2 Run the merge a second time and confirm `git status --short fixtures/annotations` shows no further change (determinism)

## 6. After the panel: agreement report and freeze (TDD; spec "Frozen annotations and agreement report"; design D8, D9, D11, P6)

- [ ] 6.1 RED: create `tests/unit/docs/annotation-freeze.spec.ts` with one `it` per scenario, named exactly after it: "The recorded hashes match the frozen files" (real report and files), "A changed annotation file fails the freeze check" (`checkFreeze` over a temporary copy with one byte changed), "The report states the method and every disagreement" (real report and `agreement.json`). See the first and third fail (no report yet)
- [ ] 6.2 GREEN: `docs/measurements/annotation-agreement.md`, in Spanish, written with the edit tools: method ("dos agentes anotadores independientes de modelos distintos", blind to each other and to the control, a third agent resolving only the disagreements), models and date; the selection and its count per construction (task 2.2); per language n, percent and kappa from `agreement.json`; control agreement per panelist (kappa marked orientativo); every disagreement with both answers and the resolution; every control site whose final annotation differs from its README row, listed as a discrepancy with the justification (the README is not edited, design D9); limitations (self-declared `sourcesRead`, two models of one family); and the table `## Hashes SHA-256` filled from `node scripts/annotation-agreement.mjs hashes`. `npx vitest run tests/unit/docs/annotation-freeze.spec.ts` green
- [ ] 6.3 Freeze commit (scope `DIS-80`, explicit paths: the two annotation files, the report, the freeze test) and push. From here on no task modifies `fixtures/annotations/` or any file of the hash table
- [ ] 6.4 Every control discrepancy of 6.2 (if any) becomes a Follow-up with destination C in `design.md` and one Spanish checklist comment on DIS-80 for the author; P1 (`form` in format 1) gets a Spanish comment on DIS-79 (destination B)

## 7. Review and Update Existing Tests (MANDATORY)

- [ ] 7.1 No existing test is changed by this change: the three test files are new (`tests/unit/scripts/annotation-agreement.spec.ts`, `tests/unit/docs/annotation-sites.spec.ts`, `tests/unit/docs/annotation-freeze.spec.ts`). Review that `tests/unit/scripts/demo-excerpt.spec.ts` (its fixture-project lookup now sees `fixtures/annotations/` as a directory) and `tests/unit/docs/guides.spec.ts` (README and guide checks after the edits of task 9) pass unchanged; if one fails, fix the code or the doc, not the test
- [ ] 7.2 Every `#### Scenario:` of the delta maps to a test of the same name: 11 in `annotation-agreement.spec.ts` (1.1), 4 in `annotation-sites.spec.ts` (2.1), 3 in `annotation-freeze.spec.ts` (6.1)

## 8. Run Tests and Verify Data State (MANDATORY)

- [ ] 8.1 Targeted: `npx vitest run tests/unit/scripts/annotation-agreement.spec.ts tests/unit/docs`
- [ ] 8.2 Broader: `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- [ ] 8.3 Data state: `git diff --stat final-project-CRN -- packages fixtures/acme-shop fixtures/task-api` is empty; the 22 rows of `fixtures/README.md` are unchanged (`git diff final-project-CRN -- fixtures/README.md` touches only the pointer sentences); `node scripts/annotation-agreement.mjs hashes` equals the report's table
- [ ] 8.4 No dependency is added, so no `npm install` and no `npm audit` run; `/privacy-ethics-check` over the diff (no personal data, no network, no model call from code)
- [ ] 8.5 `node scripts/dev-processes.mjs stop`; report `openspec/changes/callsite-annotations/reports/YYYY-MM-DD-8-test-and-state-verification.md` (template of `docs/openspec-tasks-mandatory-steps.md` §6)

## 9. Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [ ] 9.1 The interface is the CLI `node scripts/annotation-agreement.mjs <agreement|merge|hashes>`. In Git Bash, on a copy of `docs/measurements/annotation/` and `fixtures/` in the scratchpad (passing that root), never on the frozen files: run `agreement`, `merge` and `hashes` and verify exit code `0` and that their outputs equal the committed `agreement.json`, the two annotation files and the report's hash table
- [ ] 9.2 Error cases on the scratchpad copy: a panel output with one site removed, one with a citation beyond the end of its file, one with `fixtures/README.md` in `sourcesRead`, a resolution missing a disagreement, and an unknown command; verify exit code `1` (usage `2` for the unknown command if the script follows `demo-excerpt`), the message naming the problem, and that no file was written
- [ ] 9.3 Restore: delete the scratchpad copy; `git status --short docs/measurements fixtures` is empty; `node scripts/dev-processes.mjs stop`
- [ ] 9.4 Report `openspec/changes/callsite-annotations/reports/YYYY-MM-DD-9-manual-interface-testing.md` with the commands and outputs

## 10. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 10.1 Not applicable: no user interface is involved; state it in the step 9 report

## 11. Update Technical Documentation (MANDATORY)

- [ ] 11.1 `fixtures/README.md` § "Table 2 seed" (design D12): the intro sentence "the remainder is pending (see final report)" and the headings "(12 of 50; **38 pending**)" / "(10 sites listed of 50; **40 pending**)" point at `fixtures/annotations/` and `docs/measurements/annotation-agreement.md`; the title "hand-annotated" says the control rows were written by hand and the 50 sites per language were annotated by two independent agents; the 22 rows are not changed
- [ ] 11.2 `README.md` §2.6: the caption of Table 2 says "50 sitios de llamada por lenguaje anotados por dos agentes independientes" with a link to the report; the limitations paragraph keeps the questions as the author's and says the call-site annotation was made by two independent annotator agents of different models (no "a mano", no "anotación humana")
- [ ] 11.3 `docs/project-context.md`: where the Table 2 reference lives (`fixtures/annotations/`, format 1, frozen by `tests/unit/docs/annotation-freeze.spec.ts`; regenerate only with `node scripts/annotation-agreement.mjs merge`, which changes the hashes and fails the test)
- [ ] 11.4 TSDoc on the new script; `npm run docs:coverage` green; ADR not warranted (design P8), recorded in the step 8 report
- [ ] 11.5 `/update-docs`: the docs gate passes; `prompts.md` gains the DIS-80 prompts with its Índice entry in the same edit

## 12. Pull request preparation

- [ ] 12.1 `/pr-describe` in Spanish against `final-project-CRN`: the Why marked as the agent's text; the panel (models, date, agreement figures, number of disagreements and of control discrepancies); the hashes; that no existing test changed and `packages/**` is untouched

## 13. Pre-merge Review (MANDATORY - AGENT MUST EXECUTE)

- [ ] 13.1 Open the PR against `final-project-CRN`; DIS-80 to In Review with a Spanish comment linking it
- [ ] 13.2 CI green: wait in the foreground with `gh pr checks <n> --watch --interval 60`, repeated until no check is pending; link the run in an addendum to the step 8 report
- [ ] 13.3 `/show-spec-working` (may reuse the step 9 evidence) → `reports/YYYY-MM-DD-show-spec-working.md`
- [ ] 13.4 `/verify-against-spec` (inline mode) → `reports/YYYY-MM-DD-verify-against-spec.md`
- [ ] 13.5 `/adversarial-review` (inline mode) → `reports/YYYY-MM-DD-adversarial-review.md`
- [ ] 13.6 Fix every finding in this change (TDD for behaviour), each with an A/B/C/D destination in `design.md` → Follow-ups; a finding on the annotations themselves is never fixed by editing a frozen file (it goes to the report and to the author, destination C); re-run what each fix invalidates; commit to the same PR; re-run a check whose findings led to non-trivial fixes until no Blocker or Major
- [ ] 13.7 `/opsx:archive`, commit it to the same PR; merge (`gh pr merge <n> --merge`, through the merge gate) only after the archive commit and with CI green
