## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 First action of the apply: set DIS-72 to In Progress in Linear, with a short comment in Spanish (change `confidence-score`, branch `feature/DIS-72-confidence-score`)
- [x] 0.2 Feature branch `feature/DIS-72-confidence-score` (`BRANCH_PREFIX=feature/`, `docs/project-context.md` → Branch and ticket conventions), created from `origin/feature/entrega-2-CRN` (3630f6a) during `/opsx:propose` with no upstream; confirm the upstream is still unset, so a bare `git push` cannot target the delivery branch, and that `openspec/changes/confidence-score/` is on it. `git fetch`; if `origin/feature/entrega-2-CRN` moved, stop and ask the author whether to rebase
- [x] 0.3 Verify branch creation and current branch status (`git status`, `git branch --show-current`); `.claude/sdd-harness.env` carries a local `KIT_PROTECT_SPECS="0"` that is never staged
- [x] 0.4 Baseline: run `npx vitest run` once, green, and record the totals for the step 8 report; record `SELECT count(*) FROM project`, `FROM claim`, `FROM evidence`, and `SELECT count(*) FILTER (WHERE confidence IS NULL), count(*) FROM claim` in the local database

## 1. Core: confidence signals (TDD, design C1, C2) — `confidence-score` → "Confidence signals", "Confidence needs evidence"

- [x] 1.1 RED: create `tests/unit/knowledge/confidence.spec.ts` (template `co-change.spec.ts`; spec header comment and one `describe` per requirement; a local factory for the citations E1–E4 of the spec) with test "Signals of a set backed by code and test". See it fail
- [x] 1.2 GREEN: `packages/core/src/knowledge/confidence.ts` with the types of design C1, `CONFIDENCE_WEIGHTS` and `EVIDENCE_SATURATION` at the D7 values (design C4, frozen) and `confidenceSignals`; export it from `knowledge/index.ts`; TSDoc on every export and on every member of the exported interfaces (`docs:coverage`). It imports only `FileKind` from `./graph-file.js`
- [x] 1.3 RED → GREEN: test "Config counts as code and an unresolved origin lowers resolution"
- [x] 1.4 RED → GREEN: test "A cited citation backs nothing" (if it passes at once, record it as a characterisation test in the step 8 report)
- [x] 1.5 RED → GREEN: test "A set without citations has no confidence" (`RangeError` before any count, design C2)

## 2. Core: confidence value (TDD, design C3) — `confidence-score` → "Confidence value"

- [x] 2.1 RED: test "The value follows the formula with the published weights" (expected value computed from the exported constants, never hard-coded). See it fail
- [x] 2.2 GREEN: `confidence(statements, { contradiction })` (fixed sum order, `1 / (1 + Math.exp(-z))`, no rounding), TSDoc (ordinal, not calibrated, see `docs/CONFIDENCE.md`)
- [x] 2.3 RED → GREEN: tests "The value is reproducible and independent of order", "A citation left cited lowers the value", "A contradiction lowers the value", "Exact resolution beats heuristic resolution", "Evidence saturates and never lowers the value" and "A set with no signal is worth one half" (each one a characterisation test if it passes at once, recorded in the step 8 report)
- [x] 2.4 `npm run lint:architecture` green (`no-orphans`: `knowledge/confidence.ts` is reachable from the barrel), and `grep -nE "from '\.\./(explain|context)/" packages/core/src/knowledge/confidence.ts` prints nothing (no dependency-cruiser rule covers that direction)

## 3. Docs: `docs/CONFIDENCE.md` and its sync test (TDD, design C6) — `confidence-score` → "Published weights"

- [x] 3.1 RED: create `tests/unit/knowledge/confidence-doc.spec.ts` with test "The published weights are the code's weights" (reads the file from the repository root as the other tests that read repository files do; parses the table under `## Weights`). See it fail on the placeholder
- [x] 3.2 GREEN: replace the placeholder of `docs/CONFIDENCE.md` with the sections `Formula`, `Signals`, `Weights`, `Limits` (design C6); the table holds the D7 values and, as reason of each row, `Pending: fixed by the author in DIS-72 (D4).` until step 9 replaces it with the author's words
- [x] 3.3 RED → GREEN: test "The confidence document states its limits"
- [x] 3.4 Check the test bites: change one weight in the code only, then in the document only, and see the test fail each time; revert both (record it in the step 8 report)

## 4. Core: `explain` wiring (TDD, design C5) — `explain` → "Precedence and UNKNOWN answers", "Answer with typed statements", "Persistence failure"

- [x] 4.1 RED: in `tests/unit/explain/explain-verification.spec.ts`, test "An answer carries the confidence of its statements" (stored run, second run with another empty cache, `ClaimWriteFailed` run with a third empty cache; expected values computed with `confidence(…)` over the pack's spans). See it fail
- [x] 4.2 GREEN: `toConfidenceStatement` in `explain/claim-items.ts`; `toClaimItems` writes the statement's confidence instead of `null` (TSDoc updated); `explain.ts` computes the answer's confidence once after the entailment policy and passes it to `storedAnswer` / `unsavedAnswer`, both call sites with `contradiction: false` and a comment naming DIS-71; `AnsweredCommon.confidence: number` with TSDoc in `explain-answer.ts`
- [x] 4.3 RED → GREEN: test "The confidence follows the verifier's verdicts"
- [x] 4.4 Characterisation test "An unknown answer has no confidence" (no-anchor question and every citation `broken`; `'confidence' in answer` is `false`): it passes at once because `UnknownExplain` never had the field; record it in the step 8 report
- [x] 4.5 Rewrite the JSDoc of `explain` (the answer carries `confidence`; claims are stored with their confidence)

## 5. Backend: Review and Update Existing Tests (MANDATORY)

- [x] 5.1 Identify the tests affected by the change: `grep -rn "confidence\|answered(\|AnsweredExplain\|toClaimItems(" tests/`
- [x] 5.2 Update, because the spec changed (not to make the suite pass), and without weakening any other assertion, one file per sub-task, each followed by its own `npx vitest run <file>`; list every edited existing test with the reason in the step 8 report:
  - [ ] 5.2a `tests/unit/explain/explain.spec.ts`: the modified scenario "An answer written after a re-index is stored stale" (each stale claim carries its statement's confidence), and the non-scenario test "stores each statement as an L2 inference that keeps its statement type" (`confidence: null` → the computed value)
  - [ ] 5.2b `tests/integration/explain/explain.spec.ts`: the modified scenario "A fact is stored as an inferred claim that keeps its type" (rows with non-`NULL` `confidence`, first above second; answer `confidence` over both statements)
  - [ ] 5.2c `tests/unit/cli/ask-command.spec.ts`: the helper `answered()` gains `confidence` (the type requires it; `ask`'s output is unchanged)
  - [ ] 5.2d Any other hit of 5.1 that builds an `AnsweredExplain` or asserts `confidence: null` on a claim `explain` writes (claims seeded by hand with `confidence: null` as prior claims stay as they are)
  - [ ] 5.2e `tests/unit/explain/explain-verification.spec.ts`: the modified scenario "An unsaved answer carries its verification, usage and unverified events" (its `confidence` with (S1, `E1`) `entailed` and (S1, `E2`) `cited`)
- [x] 5.3 Re-run unchanged the existing tests of the other scenarios of the three modified requirements (the thirteen scenarios of "Precedence and UNKNOWN answers", "An answer with evidence is typed, stored and returned", "The evidence of a stored answer lists every citation in order", "Cited spans are verified in one read at the pack's commit", "A broken citation is neither stored nor shown", "The subject of a claim is the symbol of its first cited span", "Citations that support their statement are entailed and facts", "A valid but irrelevant citation is cited and never a fact", "A cached pair is not verified again by a second answer", "An invalid verifier output degrades its pair to cited", "An unavailable verifier degrades every uncached pair and the answer is stored", and the other four scenarios of "Persistence failure")
- [x] 5.4 Confirm that each `#### Scenario:` of the two delta specs maps 1:1 to a test with exactly the same name (grep each title in `tests/`)

## 6. Core: refactor

- [x] 6.1 With the suite green after step 5, refactor `knowledge/confidence.ts`, `explain/claim-items.ts` and `explain.ts` for naming and duplication only (no behaviour change, no test edits); `npx vitest run tests/unit/knowledge tests/unit/explain` stays green

## 7. Seed fingerprint

- [x] 7.1 `packages/core/src/knowledge` is a seed fingerprint input: check `git status --porcelain fixtures` and `git clean -ndX fixtures/acme-shop` print nothing, run `npm run seed:build`, confirm the seed's rows are unchanged (only the `analyzer-fingerprint` line differs in `git diff`) and that the seed tests pass (`npx vitest run tests/unit/cli/seed-build.spec.ts tests/unit/cli/seed-load.spec.ts tests/integration/cli/seed-build.spec.ts`). Rerun this task after step 9 if the weights change `confidence.ts`

## 8. Backend: Run Tests and Verify Data State (MANDATORY)

- [x] 8.1 Capture the pre-test baseline: the 0.4 indicators; integration tests run in rolled-back transactions
- [x] 8.2 Run the targeted tests: `npx vitest run tests/unit/knowledge tests/unit/explain tests/unit/cli/ask-command.spec.ts tests/integration/explain`
- [x] 8.3 Run the required broader suite and gates: `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- [x] 8.4 Run `npm run test:mutation -- --mutate "packages/core/src/knowledge/confidence.ts"` (score ≥ 80, the CI break threshold); for each meaningful survivor, a RED → GREEN test
- [x] 8.5 Run `/privacy-ethics-check` over the diff (the function reads only span metadata and verdicts; no text, no personal data); record the result in the report
- [x] 8.6 Verify the post-test state: same `project`/`claim`/`evidence` counts as 8.1; no `.stryker-tmp/` left. Restore and document if not
- [x] 8.7 Create `openspec/changes/confidence-score/reports/YYYY-MM-DD-8-test-and-state-verification.md` from the template of `docs/openspec-tasks-mandatory-steps.md` §6, with the baseline, the characterisation tests (1.4, 2.3), the bite check (3.4), the edited existing tests (5.2), the Stryker score and survivors (8.4) and the privacy check (8.5)
- [x] 8.8 Mark complete only after the tests pass and the report exists

## 8b. Core: fenced model output (TDD, design C9) — `claims-and-typing` → "Model output quarantine"

Added on 2026-10-15 by the author's decision (`proposal.md` → Why), after the weight session found every live answer fenced.

- [x] 8b.1 RED: in `tests/unit/explain/statement-schema.spec.ts`, test "A conforming output inside a json fence is accepted". See it fail (`invalid_json`)
- [x] 8b.2 GREEN: in `explain/statement-schema.ts`, unwrap exactly one fence enclosing the whole trimmed output before `JSON.parse` (design C9: one anchored regular expression; the size check before it; the event keeps the raw output); update the module comment and the TSDoc of `parseModelOutput`
- [x] 8b.3 RED → GREEN: tests "Text outside a fence discards the output", "An unclosed fence or another info string discards the output" and "The event of a fenced output identifies the raw output" (each one a characterisation test if it passes at once, recorded in the 8b.5 addendum)
- [x] 8b.4 Re-run unchanged the existing scenarios of "Model output quarantine" and "Audit event of a discarded output" (`npx vitest run tests/unit/explain`), then `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`, and `npm run test:mutation -- --mutate "packages/core/src/explain/statement-schema.ts"` (score ≥ 80; a RED → GREEN test per meaningful survivor); confirm each new `#### Scenario:` of `specs/claims-and-typing/spec.md` maps 1:1 to a test name
- [x] 8b.5 Addendum to the step 8 report: the 8b TDD record, the suite totals, the Stryker score and survivors, and the unchanged database counts

## 9. Author's weights (D4, design C4)

- [x] 9.1 Preconditions: local database migrated with acme-shop loaded (`npx tsc --build` first); serve the local Ollama CPU-only with `OLLAMA_CONTEXT_LENGTH=16384` (`docs/project-context.md`, design C9 operations note); ask the author which models to use for `LLM_MODEL` and `LLM_MODEL_VERIFY`; propose the development questions (design C4: 6–8 questions over `acme-shop` that vary the expected signals; never the measurement questions of CM-HU-22) and run them only after the author approves the list
- [x] 9.2 After step 8b, run each development question through `explain` with a script in the session scratchpad over the same database, printing per answer the six signals and the value with the D7 weights; record them in `openspec/changes/confidence-score/reports/YYYY-MM-DD-9-weights-session.md`
- [x] 9.3 From the results, recommend values for w₁…w₆ and `EVIDENCE_SATURATION`, each with the evidence from 9.2 that supports it and a draft reason, in the 9.2 report (design C4); wait for the author to approve, change or rewrite each value and reason; write into `CONFIDENCE_WEIGHTS` / `EVIDENCE_SATURATION`, the `Weights` table of `docs/CONFIDENCE.md` (no `Pending:` reason left) and the document's list of questions only what the author approved, verbatim (base-standards rule 8: the reason that ships is the author's decision, recorded as such in the report)
- [x] 9.4 Re-run `npx vitest run tests/unit/knowledge tests/unit/explain` and 8.4 if `confidence.ts` changed; rerun 7.1; add an addendum with these reruns to the step 8 report; delete the `claim`/`evidence` rows the session created (by id, before/after diff) and confirm the 0.4 counts

## 10. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [x] 10.1 Preconditions: as 9.1; record the 0.4 counts
- [x] 10.2 Live run: `npm run cli -- ask acme-shop "¿Cómo se calcula el precio final de un pedido?"`; check exit `0`, that the printed output is the same shape as before (no confidence printed), and that every new `claim` row has a non-`NULL` `confidence` in (0, 1) equal to the value the scratchpad script of 9.2 computes for its statement (`SELECT id, confidence FROM claim WHERE …` before/after). If Ollama cannot run, use a local OpenAI-compatible stub written outside the repository (session scratchpad) that answers a fixed valid output and `{"entails":true}`, removed in 10.5; record which one was used
- [x] 10.3 Degraded and unknown paths: with the stub and one fixed valid output, run the same `ask` answering `{"entails":true}` and then `{"entails":false}` to every verification → the second run's rows have a lower `confidence` than the first's for the same statement (Ollama, if used in 10.2, only serves the non-null check); and without `LLM_*` → `UNKNOWN (llm-required)`, no row added
- [x] 10.4 Document every command, exit code and output in `openspec/changes/confidence-score/reports/YYYY-MM-DD-10-manual-interface-testing.md` (mask the OS user name in paths); `answer.confidence` is shown with the scratchpad script, since `ask` does not print it
- [x] 10.5 Restore: delete every `claim`/`evidence` row the runs created (by id from a before/after diff) and confirm the `project`, `claim`, `evidence` counts equal the 0.4 baseline; `git status` shows no stray file

## 11. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 11.1 The change has no browser UI and changes no interface output: step 10 drives the CLI end to end against the database; record "not applicable beyond step 10" in the step 8 report
- [x] 11.2 Record in the step 8 report that the CI evidence (new spec files ran and passed, mutation job ≥ 80) is collected in 14.3, once the PR exists

## 12. Update Technical Documentation (MANDATORY)

- [x] 12.1 `readme.md` §3.2 "Cómo se calcula `confidence`": the confidence is stored per claim and given per answer (`answer.confidence`); fix "ninguno de los seis términos depende de una generación del modelo" (`entailment` comes from the verifier; reproducibility holds for the same verdicts, e.g. with the per-pair cache); state that `contradiccion` is 0 until DIS-71 and `historial` does not exist yet; check the `CONFIDENCE.md` line of the tree (~525)
- [x] 12.2 `docs/project-context.md`: line ~549 and the `explain` gotchas (claims are stored with a computed `confidence`, the answer carries `confidence`, `contradiction: false` until DIS-71); a gotcha for `knowledge/confidence.ts` (pure, own input types, weights mirrored in `docs/CONFIDENCE.md` and checked by `confidence-doc.spec.ts`; changing a weight means the document, the test run and `seed:build`); the quarantine parses one Markdown code fence enclosing the whole output (design C9); serve the local Ollama with `OLLAMA_CONTEXT_LENGTH=16384`, since its default context cuts `explain`'s prompt (no `invalid_json` from a truncated system prompt)
- [x] 12.3 No new ADR (design C8)
- [x] 12.4 Run `/update-docs` and confirm the docs gate passes. Add the relevant AI prompts to `prompts.md` per `docs/project-context.md` → prompts.md rules, with its Índice entry in the same edit

## 13. Pull request preparation

- [ ] 13.1 Prepare the PR description (`/pr-describe`, in Spanish) against `feature/entrega-2-CRN`, with the author's Why transcribed (DIS-72 `[enhanced]` D1–D4, the author's rulings on D5–D8 and Q1–Q3 from the spec audit, and the author's weight reasons of step 9) and the Stryker score

## 14. Pre-merge Review (MANDATORY - AGENT MUST EXECUTE)

- [ ] 14.1 Open the pull request against `feature/entrega-2-CRN` (after confirming with the author; `gh` on the DisTinta account, back to Cristina-JumpMath afterwards)
- [ ] 14.2 Set DIS-72 to In Review in Linear with a comment in Spanish linking the PR and the change
- [ ] 14.3 First confirm in the PR's CI run that the new spec files ran and passed and the mutation job is ≥ 80, and link the run in an addendum to the step 8 report; then run `/show-spec-working`, `/verify-against-spec` and `/adversarial-review`, in this order; one report each under `openspec/changes/confidence-score/reports/` (`YYYY-MM-DD-show-spec-working.md`, `YYYY-MM-DD-verify-against-spec.md`, `YYYY-MM-DD-adversarial-review.md`); `/show-spec-working` may reuse the step 10 evidence and must show `claim` rows with non-`NULL` `confidence` from a real `ask` over acme-shop and the `answer.confidence` of that answer
- [ ] 14.4 Fix every finding in this change (behaviour changes via TDD) and give each one an A/B/C/D destination in `design.md` → Follow-ups; re-run the verification each fix invalidates and add an addendum to the affected report
- [ ] 14.5 Commit the fixes to the same pull request (push confirmed with the author); re-run a check whose findings led to non-trivial fixes until it returns no Blocker or Major
- [ ] 14.6 `/opsx:archive`, and commit the archive to the same pull request; the author merges afterwards (never before the archive commit)
