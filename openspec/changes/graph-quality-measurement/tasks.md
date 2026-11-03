## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [ ] 0.1 Feature branch `feature/dis-79-measure-graph` (`BRANCH_PREFIX=feature/`, `docs/project-context.md` → Branch and ticket conventions), created from `final-project-CRN` before `/opsx:propose`; confirm `git merge-base --is-ancestor origin/final-project-CRN HEAD` and that `openspec/changes/graph-quality-measurement/` is on it. `git fetch`; if `origin/final-project-CRN` moved, merge it before any code (never force-push a published branch)
- [ ] 0.2 Confirm DIS-79 is In Progress in Linear, with a short comment in Spanish naming the change `graph-quality-measurement` and the branch `feature/dis-79-measure-graph`
- [ ] 0.3 Verify the current branch (`git branch --show-current`) and `git status`; nothing under `.claude/` or `.cursor/` is ever staged; one `git` command per call; nothing under `fixtures/annotations/`, `docs/measurements/annotation/` or `docs/measurements/annotation-agreement.md` is ever edited (author's note on DIS-79)
- [ ] 0.4 Baseline for the step 8 report: run `npx vitest run --project dom --project seed-build --project node` once, green, and record files, tests and duration; run `npm run typecheck` and `npm run lint`, green; record that `scripts/measure-graph.mjs` and `docs/measurements/graph-quality.json` do not exist, and the output of `node scripts/annotation-agreement.mjs hashes` (it must equal the `## Hashes SHA-256` table)

## 1. Script skeleton and CLI (TDD, design D5) — `graph-quality` → "Measurement output and CLI", "Freeze check before measuring"

- [ ] 1.1 RED: create `tests/unit/scripts/measure-graph.spec.ts` with the test "An unknown argument is a usage error" (calls `runMeasureGraph(['--verbose'], { root: <temp copy>, stdout, stderr })` with stream doubles; exit 2, the usage line on stderr, no `docs/measurements/graph-quality.json` in the copy). Add a helper that builds a temporary copy under `os.tmpdir()` holding only `docs/measurements/annotation-agreement.md`, the nine frozen files and `seeds/graph-dump.sql` (design D9), removed in `afterEach`. See it fail (module missing)
- [ ] 1.2 GREEN: create `scripts/measure-graph.mjs` (imports only `node:` built-ins and `./annotation-agreement.mjs`) and `scripts/measure-graph.d.mts`, with `runMeasureGraph(args, { root, stdout, stderr })`, `--root <dir>` as the only option and the main-module guard of `scripts/annotation-agreement.mjs`. Run `npx vitest run tests/unit/scripts/measure-graph.spec.ts` (green)
- [ ] 1.3 RED → GREEN: tests "A frozen annotation file was modified" (one space appended to the copy's `fixtures/annotations/task-api.callsites.json`, the copy's seed replaced by an unparseable file; exit 1, one stderr line naming that file, no seed error, no output file) and "The agreement report is missing" (exit 1, stderr names the report, no output file); implement the freeze step with `checkFreeze` first (design D5)

## 2. Annotation and seed reading (TDD, design D2, D5) — `graph-quality` → "Annotation files are complete", "The graph is read from the seed"

- [ ] 2.1 RED → GREEN: test "An annotation file has 49 sites" on in-memory data (`checkAnnotations` returns one problem naming `fixtures/annotations/acme-shop.callsites.json` and 49); also `formatVersion` 2 and a duplicated id each give a problem (same test, extra assertions). Implement it
- [ ] 2.2 RED → GREEN: test "The seed reader agrees with the CLI's seed parser": `readSeed` on the repository's `seeds/graph-dump.sql` gives, per project, the same edge count as `seedProjects(sql)` imported from `packages/cli/src/seed/parse-seed.ts`, and the `analyzer-fingerprint` of the header line. Implement the bounded reader (string literals with `''`, `NULL`, booleans, numbers; other tables and comments skipped; a malformed line of the four tables is an error)
- [ ] 2.3 RED → GREEN: test "A project of the annotations is not in the seed" (CLI on a temporary copy whose seed has the `task-api` rows removed: exit 1, stderr names `task-api`, no output file). Wire steps 2.1–2.2 into `runMeasureGraph` in the D5 order

## 3. Matching, attribution and measures (TDD, design D3, D4) — `graph-quality` → "Site matching and attribution", "Measures per project"

- [ ] 3.1 RED → GREEN, one test per scenario on synthetic in-memory graphs, each written first and seen failing: "An edge from the enclosing symbol to the annotated target is a hit", "An edge from the site's file is in scope", "A positive site without a matching edge is a miss"
- [ ] 3.2 RED → GREEN: "An edge with the called name to another target is a false positive", "A none site with an attributed edge is a false positive", "A none site without an attributed edge is a true negative" (called name rules of D3.4, including `read` → `get<Studly>Attribute`, asserted in the first)
- [ ] 3.3 RED → GREEN: "Two sites in one symbol do not count each other's hit as a false positive", "An edge of another kind or another project does not count", "A source symbol whose range ends before the site is out of scope"
- [ ] 3.4 RED → GREEN: "Measures of a synthetic project" and "Undefined measures are null" (rounding half away from zero to four decimals, `null` on a zero denominator); export `formatRatio` (design D7) and assert `formatRatio(24, 31) === '77,4 % (24/31)'` and `formatRatio(0, 0) === 'no definida'` in the first
- [ ] 3.5 RED → GREEN: "The measurement is deterministic" (CLI twice on a temporary copy, exit 0 both times, byte-identical JSON with the D6 layout, a final LF, no absolute path: the copy's path does not appear in the file; one stdout line per project)

## 4. Refactor (design D3)

- [ ] 4.1 With the suite green, simplify `scripts/measure-graph.mjs` (one function per rule, JSDoc on each export, as `scripts/annotation-agreement.mjs`) without touching the tests; `npx vitest run tests/unit/scripts/measure-graph.spec.ts`, `npm run lint` and `npm run typecheck` green

## 5. Run the measurement and publish it (design D8, D10; ticket M7) — `graph-quality` → "Committed measurement matches the repository", "Published Table 2", "Measurement report", "The frozen sources are not modified"

- [ ] 5.1 Add `"measure:graph": "node scripts/measure-graph.mjs"` to `package.json` → `scripts`. Run `npm run measure:graph` from Bash on the repository (the apply agent, who annotated no site, M7); record the exit code and the stdout lines. It writes `docs/measurements/graph-quality.json`
- [ ] 5.2 RED: create `tests/unit/docs/graph-quality.spec.ts` with "The committed JSON is the current measurement" (serialize `measure` of the repository's seed and annotation files; equal to the committed bytes; the failure message names `npm run measure:graph`) and "The frozen sources still match their hashes" (`checkFreeze` on the repository returns `[]`). Run it: the first passes after 5.1; temporarily point it at a changed copy to see it fail, then restore
- [ ] 5.3 RED → GREEN: test "The README table agrees with the measurement" (parse Table 2 of `readme.md` §2.6; each cell equals `formatRatio` / the `callsEdges` counts of the JSON; the text under the table holds each project's percent and kappa of `docs/measurements/annotation/agreement.json` with a decimal comma and a link to `docs/measurements/graph-quality.md`). See it fail; then edit `readme.md` §2.6: fill Table 2 from the 5.1 output, add the agreement citation and the link under the table, rewrite the stale introduction of «Mediciones que se publicarán» (Table 2 measured with `npm run measure:graph`, Table 1 pending of DIS-81), and if the TypeScript coverage or precision is below the PHP one explain why (P3). Green
- [ ] 5.4 RED → GREEN: test "The report agrees with the measurement" (parse `## Resultados`, `## Desglose por construcción` with `### acme-shop` / `### task-api` in `selection.json` order, `## Sitios fallados`; no «anotación humana» nor «a mano»). See it fail; then write `docs/measurements/graph-quality.md` (agent's text, marked so): method, inputs, freeze check, the seed and its `analyzer-fingerprint`, the M7 independence statement, definitions of scope, hit, attribution and measures, the three sections, `resolutionAgreement` per project, and the limitations of the spec. Green
- [ ] 5.5 Confirm `git diff --stat origin/final-project-CRN -- fixtures/annotations docs/measurements/annotation docs/measurements/annotation-agreement.md` is empty

## 6. Review and Update Existing Tests (MANDATORY)

- [ ] 6.1 Identify the tests affected (`grep -rn "readme.md\|package.json\|scripts/\|graph-dump\|annotation" tests --include=*.ts -l`, every type error of `npm run typecheck`). No existing test file is edited by this change (Follow-up P8): `tests/unit/docs/annotation-freeze.spec.ts`, `tests/unit/scripts/wiring.spec.ts` ("The startup scripts need no installed dependency" now also covers `scripts/measure-graph.mjs`), `tests/unit/docs/guides.spec.ts` (README links) and `tests/unit/scripts/annotation-agreement.spec.ts` keep passing unchanged. Confirm with `git diff --stat origin/final-project-CRN -- tests` that only the two new files appear; if an existing test fails, the fix goes in the script or the docs, never in the test
- [ ] 6.2 Confirm each `#### Scenario:` of `specs/graph-quality/spec.md` (22 titles) maps 1:1 to a test with exactly the same name (grep each title in `tests/`)

## 7. Run Tests and Verify Data State (MANDATORY)

- [ ] 7.1 Capture the pre-test baseline: the 0.4 totals and duration; the change touches no database (no migration, no seed), so the data indicators are the nine frozen hashes (`node scripts/annotation-agreement.mjs hashes`), the SHA-256 of `seeds/graph-dump.sql` and `git status` clean apart from the change's files
- [ ] 7.2 Run the targeted tests: `npx vitest run tests/unit/scripts tests/unit/docs` (record passed, failed, duration)
- [ ] 7.3 Run the required broader suite and gates: `npx vitest run --project dom --project seed-build --project node` (0.4 totals plus the new tests), `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- [ ] 7.4 Mutation testing: `scripts/**` is outside `stryker.config.json` → `mutate`; record that no mutated source changes and that the CI `mutation` job is the check
- [ ] 7.5 Run `/privacy-ethics-check` over the diff (no personal data: fixtures, seed and annotation files only; no external service) and record the result
- [ ] 7.6 Verify the post-test state: the nine hashes and the seed hash equal 7.1; no temporary copy left under `os.tmpdir()` by the tests; `node scripts/dev-processes.mjs stop`
- [ ] 7.7 Create `openspec/changes/graph-quality-measurement/reports/YYYY-MM-DD-7-test-and-state-verification.md` from the template of `docs/openspec-tasks-mandatory-steps.md` §6: baseline and after, the RED evidence of each TDD task, the hashes before and after, the mutation note, the privacy check; mark complete only after the tests pass and the report exists

## 8. Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [ ] 8.1 The interface is the command `npm run measure:graph`. Run it from Bash and record exit code, stdout and `git diff --exit-code -- docs/measurements/graph-quality.json` (unchanged). Then run it from `pwsh -NoProfile -Command 'npm run measure:graph'` and `powershell.exe -NoProfile -Command 'npm run measure:graph'` (never setting `$env:` variables), each followed by the same `git diff --exit-code` (design D10); record the PowerShell, Node and npm versions and the results
- [ ] 8.2 Error cases, on temporary copies in the scratchpad directory (never on the repository's frozen files): a broken hash (exit 1, nothing written), a missing project in the seed (exit 1), `--verbose` (exit 2); record each command and output; delete the copies
- [ ] 8.3 Restore the state: `git status` shows only the change's files, the nine hashes equal 7.1; `node scripts/dev-processes.mjs stop`
- [ ] 8.4 Document every command, output and version in `openspec/changes/graph-quality-measurement/reports/YYYY-MM-DD-8-manual-interface-testing.md` (OS user name masked in paths)

## 9. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 9.1 Not applicable to a user interface: the change reaches no screen of `packages/web` and no Playwright spec changes. Its end-to-end check is the CI run of the pull request (11.2): record it in the step 8 report as the end-to-end evidence

## 10. Update Technical Documentation (MANDATORY)

- [ ] 10.1 `readme.md`: the review-table row «Medir el verificador» (line ~29) points to DIS-81 (Table 1) instead of DIS-79 (M9); the `scripts/` line of the repository tree names `measure:graph`. Re-run `npx vitest run tests/unit/docs` (green)
- [ ] 10.2 `docs/project-context.md`: a bullet next to "The Table 2 reference lives in `fixtures/annotations/`" for `npm run measure:graph` (inputs, the freeze check first, exit codes, and the gotcha that regenerating the seed makes `tests/unit/docs/graph-quality.spec.ts` fail until the measurement and Table 2 are refreshed)
- [ ] 10.3 Run `/update-docs` and confirm the docs gate passes. Add the relevant AI prompts of this change to `prompts.md` per `docs/project-context.md` → prompts.md rules, as a new section appended at the end of the file with its Índice entry in the same edit
- [ ] 10.4 Linear: add to the `[enhanced]` description of DIS-79, in Spanish, never inside `[original]`, every decision of the propose (P1–P8), the spec audit and the apply (design → Follow-ups), marked as the agent's text. M9 hand-off: a Spanish comment on DIS-81, marked as the agent's text, moving the Entrega 1 review note on the verifier's latency and calls (comment of 2026-10-16 on DIS-79) to it, and a reply on that DIS-79 comment saying it was moved

## 11. Pre-merge Review (MANDATORY - AGENT MUST EXECUTE)

- [ ] 11.1 Open the pull request against `final-project-CRN` (title and body in Spanish via `/pr-describe`, the Why marked as the agent's text, the Table 2 figures quoted); commit by explicit paths only (nothing under `.claude/` or `.cursor/`), English messages ending with the co-author line; one `git` command per call; set DIS-79 to In Review with a Spanish comment linking the PR
- [ ] 11.2 Wait for CI in the foreground with repeated bounded calls: `gh pr checks <n> --watch --interval 60` in Bash with the 10-minute tool timeout, re-run until no check is pending, queued or in progress (the `mutation` job takes 30-60 min); never `Monitor` or a background run. Confirm every check green and record the run link
- [ ] 11.3 Run `/show-spec-working`: may reuse the step 8 evidence and the CI run. Report `openspec/changes/graph-quality-measurement/reports/YYYY-MM-DD-show-spec-working.md`
- [ ] 11.4 Run `/verify-against-spec` (inline mode); report `openspec/changes/graph-quality-measurement/reports/YYYY-MM-DD-verify-against-spec.md`
- [ ] 11.5 Run `/adversarial-review` (inline mode); report `openspec/changes/graph-quality-measurement/reports/YYYY-MM-DD-adversarial-review.md`
- [ ] 11.6 Fix every finding in this change (behaviour changes via TDD) and give each one an A/B/C/D destination in `design.md` → Follow-ups (never C); re-run the verification each fix invalidates (a fix that changes the figures re-runs 5.1 and updates Table 2 and the report) and add an addendum to the affected report
- [ ] 11.7 Commit the fixes to the same pull request; re-run a check whose findings led to non-trivial fixes until it returns no Blocker or Major
- [ ] 11.8 Main specs: this change has one delta, the new capability `graph-quality` (with `## Purpose`); no main spec is edited by hand. The sync of `/opsx:archive` creates `openspec/specs/graph-quality/spec.md`; confirm after the archive that it holds the ten requirements and their 22 scenarios
- [ ] 11.9 `/opsx:archive`, and commit the archive to the same pull request (no test-file edits in that commit); merge only through the merge gate (`gh pr merge <n> --merge`), after the archive commit and with CI green (autonomous-run ADR)
