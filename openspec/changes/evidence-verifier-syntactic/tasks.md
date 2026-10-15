## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 First action of the apply: set DIS-68 to In Progress in Linear, with a short comment in Spanish (change `evidence-verifier-syntactic`, branch `feature/DIS-68-evidence-verifier-syntactic`)
- [x] 0.2 Feature branch `feature/DIS-68-evidence-verifier-syntactic` (`BRANCH_PREFIX=feature/`, `docs/project-context.md` → Branch and ticket conventions), created from `origin/feature/entrega-2-CRN` (1d6c105) during `/opsx:propose` with no upstream; confirm the upstream is still unset, so a bare `git push` cannot target the delivery branch, and that `openspec/changes/evidence-verifier-syntactic/`, `docs/adr/20261014-broken-citations-not-stored.md` and the `docs/adr/README.md` line are on it. `git fetch`; if `origin/feature/entrega-2-CRN` moved, stop and ask the author whether to rebase
- [x] 0.3 Verify branch creation and current branch status (`git status`, `git branch --show-current`); `.claude/sdd-harness.env` carries a local `KIT_PROTECT_SPECS="0"` that is never staged
- [x] 0.4 Baseline: run `npx vitest run` once, green, and record the totals for the step 9 report; record `SELECT count(*) FROM project`, `FROM claim`, `FROM evidence`, and `SELECT verification, count(*) FROM evidence GROUP BY 1` in the local database

## 1. Core: shared span text and the pack's root (design V2, V6) — `context-engine` → "Context pack"

- [x] 1.1 Refactor with the suite green: create `packages/core/src/context/span-text.ts` (`redactedLines`, `spanText`, JSDoc on both) and export it from `context/index.ts`; `buildContextPack` uses them in place of its private `linesOf`, inline `redactSecrets` and the slice of `cut`. `npx vitest run tests/unit/context tests/unit/explain` stays green with the same totals, no test edited
- [x] 1.2 RED: in `tests/unit/context/context-pack.spec.ts`, test "A pack names the root it was read from" (absolute and relative root path; `root` equals the root the batched read received). See it fail
- [x] 1.3 GREEN: `FilledContextPack.root: string` (JSDoc), set from the root `buildContextPack` already resolves; `npm run typecheck` passes

## 2. Core: events, reasons and types (design V5, V7)

- [x] 2.1 `packages/core/src/explain/explain-event.ts`: `EVIDENCE_BROKEN_REASONS`, `EvidenceBrokenReason`, `EvidenceBrokenEvent` (JSDoc: no content, excerpt or hash), `ExplainEvent` widened
- [x] 2.2 `packages/core/src/explain/unknown-policy.ts`: `'broken-evidence'` appended to `UNKNOWN_REASONS`; JSDoc of the reasons, `UnknownExplain.events` and `unknown` updated
- [x] 2.3 `packages/core/src/explain/claim-items.ts`: `TypedStatement.evidenceIds` (parallel to `spans`); `typeStatements` in `explain.ts` fills it; `unsavedAnswer` reads ids from the statements; `toClaimItems` takes `readonly Pick<TypedStatement, 'text' | 'type' | 'spans'>[]` (design V5). `packages/core/src/explain/sanitize.ts`: export `TRUNCATION_LINE_CUT_MARK` and use it in `truncate`
- [x] 2.4 `npm run typecheck` passes and `npx vitest run tests/unit/explain tests/unit/cli` stays green (no behaviour change yet)

## 3. Core: `verifyCitations` (TDD, design V1, V3, V4) — `evidence-verification` → "Syntactic citation check", "Expected text of a cited range"

- [x] 3.1 RED: create `tests/unit/verify/syntactic.spec.ts` (spec header comment as in `statement-schema.spec.ts`, one `describe` per requirement) with test "Valid citations are cited and each path is read once". See it fail
- [x] 3.2 GREEN: `packages/core/src/verify/syntactic.ts` (`Citation`, `CitationCut`, `CitationVerdict`, `verifyCitations`), `packages/core/src/verify/index.ts`, and `export * from './verify/index.js'` in `packages/core/src/index.ts`; JSDoc on every export
- [x] 3.3 RED → GREEN: test "A missing file or a range out of the file is broken" (per-path fallback on `missing`)
- [x] 3.4 RED → GREEN: test "Other read failures propagate"
- [x] 3.5 RED → GREEN: test "No citation reads nothing"
- [x] 3.6 RED → GREEN: test "A diverging excerpt is broken"
- [x] 3.7 RED → GREEN: test "A redacted secret matches its redacted excerpt" (a secret the indexing's scanner redacts; never a real credential)
- [x] 3.8 RED → GREEN: test "A cut CRLF span matches without its trailing carriage return"
- [x] 3.9 RED → GREEN: test "A line-cut span matches the first code points of its line" (astral characters, no half surrogate)
- [x] 3.10 RED → GREEN: test "A last line without a final line feed matches"
- [x] 3.11 Add the rule `verify-no-io` to `.dependency-cruiser.cjs` (design V10); check it fires by temporarily importing `node:fs` in `syntactic.ts` (then remove it), and run `npm run lint:architecture` green

## 4. Core: output policy and `verifyAnswer` (TDD, design V1, V4, V5) — `evidence-verification` → "Output policy over typed statements"

- [x] 4.1 RED: create `tests/unit/verify/policy.spec.ts` with test "A statement keeps only its valid citations and is retyped". See it fail
- [x] 4.2 GREEN: `packages/core/src/verify/policy.ts` (`applyVerdicts`), exported from `verify/index.ts`
- [x] 4.3 RED → GREEN: tests "A statement with no valid citation is dropped" and "Nothing is left when every citation is broken"
- [x] 4.4 RED → GREEN: create `tests/unit/verify/verify-answer.spec.ts` (extra, design V11) with the `cut` mapping from `truncation` (none, `lines`, `line-cut`); GREEN: `packages/core/src/verify/verify-answer.ts` (`verifyAnswer`, `VerifiedAnswer`), exported from `verify/index.ts`
- [x] 4.5 RED → GREEN: distinct ids are checked and their events built in evidence-id order, with eleven spans (`E2` before `E10`)
- [x] 4.6 RED → GREEN: one `evidence_broken` event per broken id, even when two statements cite it
- [x] 4.7 RED → GREEN: only cited spans are read (an uncited span's file is not in the batch)

## 5. Core: `explain` wiring (TDD, design V6, V9) — `explain` → "Precedence and UNKNOWN answers", "Answer with typed statements", "Persistence failure", "Explain events and logging"

- [x] 5.1 Extend `tests/support/in-memory-source-tree.ts` with `options.after: { when, contents, failures? }` and `tests/support/explain-doubles.ts` `doubles()` with `verificationContents` / `verificationFailures` (`when: () => order.includes('complete')`) and with `batchReads` / `reads` in its result (design V9); the existing suites stay green unchanged
- [x] 5.2 RED: create `tests/unit/explain/explain-verification.spec.ts` (same doubles, one `describe` per requirement) with test "Cited spans are verified in one read at the pack's commit". See it fail
- [x] 5.3 GREEN: wire `verifyAnswer` in `explain.ts` after `typeStatements` with `pack.root` and `pack.commit`; `storedAnswer`/`unsavedAnswer` over the verified statements with `verification: 'cited'`; `toClaimItems` writes `verification: 'cited'`; `AnswerStatement.verification: 'cited'` with the DIS-70 comment (replaces the DIS-68 one)
- [x] 5.4 RED → GREEN: test "A broken citation is neither stored nor shown"
- [x] 5.5 RED → GREEN: test "Every citation broken is unknown with broken evidence" (`unknown('broken-evidence', events)`, no `saveClaims` call)
- [x] 5.6 RED → GREEN: test "A verification read failure propagates without writing"
- [x] 5.7 RED → GREEN: test "No verification read without statements"
- [x] 5.8 RED → GREEN: test "An unsaved answer keeps only its verified citations" (events: `evidence_broken` then `claims_not_persisted`)
- [x] 5.9 RED → GREEN: test "Evidence broken events follow the sanitisation events and carry no content" (sentinel in the changed files)
- [x] 5.10 Rewrite the doc comments to the new behaviour: the JSDoc of `explain` (pipeline step order, `broken-evidence`, the verification read errors), `AnsweredCommon.events` and `UnsavedExplain` in `explain-answer.ts`, `toClaimItems` in `claim-items.ts`

## 6. CLI: event level (TDD, design V8) — `cli-ask` → "Ask answer output", "Ask UNKNOWN output"

- [x] 6.1 RED → GREEN: in `tests/unit/cli/ask-command.spec.ts`, test "A broken citation is logged as an error"; `ask.ts` writes `evidence_broken` with `logger.error`, the rest with `logger.info`; update the JSDoc of the command
- [x] 6.2 RED → GREEN: test "Every citation broken answers broken-evidence"

## 7. Core: refactor

- [x] 7.1 With the suite green, refactor `verify/*.ts`, `explain.ts` and `context-pack.ts` for naming and duplication only (no behaviour change, no test edits); `npx vitest run tests/unit/verify tests/unit/explain tests/unit/context` stays green

## 8. Backend: Review and Update Existing Tests (MANDATORY)

- [x] 8.1 Identify the tests affected by the change: `grep -rn "verification\|'none'\|events).toEqual\|events: \[\]\|UNKNOWN_REASONS\|readFilesAt\|calls.readFilesAt\|batchReads" tests/`
- [x] 8.2 Update, because the spec changed (not to make the suite pass), and without weakening any other assertion: `tests/unit/explain/explain.spec.ts` and `tests/integration/explain/explain.spec.ts` "An answer with evidence is typed, stored and returned" (verification `cited`, rows `cited`, empty events), "An answer written after a re-index is stored stale" (verification `cited`, the verification read at the pack's commit), "The subject of a claim is the symbol of its first cited span" (`toClaimItems` evidence verification `none` → `cited`), every other assertion of `verification: 'none'` on a new answer, and every count of source reads that now includes the verification read; extend "Explaining writes nothing to the console" with a broken citation. List every edited existing test with the reason in the step 9 report
- [x] 8.3 Re-run unchanged the existing tests of the other scenarios of the modified requirements (the nine older ones of "Precedence and UNKNOWN answers", "A fact is stored as an inferred claim that keeps its type", "The evidence of a stored answer lists every citation in order", the three of "Persistence failure", the three older ones of "Explain events and logging", every scenario of `context-engine` "Context pack", and of `cli-ask` "Ask answer output" and "Ask UNKNOWN output"); `tests/integration/cli/ask-command.spec.ts` "A typed answer is printed with its evidence and stored" must keep an empty stderr over real acme-shop
- [x] 8.4 Confirm that each `#### Scenario:` of the four delta specs maps 1:1 to a test with exactly the same name (grep each title in `tests/`)

## 9. Backend: Run Tests and Verify Data State (MANDATORY)

- [x] 9.1 Capture the pre-test baseline: the 0.4 indicators; integration tests run in rolled-back transactions
- [x] 9.2 Run the targeted tests: `npx vitest run tests/unit/verify tests/unit/explain tests/unit/context tests/unit/cli/ask-command.spec.ts tests/integration/explain tests/integration/cli/ask-command.spec.ts`
- [x] 9.3 Run the required broader suite and gates: `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- [x] 9.4 Run `npm run test:mutation -- --mutate "packages/core/src/verify/**/*.ts,packages/core/src/context/span-text.ts"` (score ≥ 80, the CI break threshold); for each meaningful survivor, a RED → GREEN test
- [x] 9.5 Run `/privacy-ethics-check` over the diff (the `evidence_broken` event carries an id, a path, line numbers and a closed-set reason only; no file content, excerpt or question reaches an event, log or error); record the result in the report
- [x] 9.6 Verify the post-test state: same `project`/`claim`/`evidence` counts as 9.1; no `.stryker-tmp/` left. Restore and document if not
- [x] 9.7 Create `openspec/changes/evidence-verifier-syntactic/reports/YYYY-MM-DD-9-test-and-state-verification.md` from the template of `docs/openspec-tasks-mandatory-steps.md` §6, with the baseline, the edited existing tests (8.2), the Stryker score and survivors (9.4) and the privacy check (9.5)
- [x] 9.8 Mark complete only after the tests pass and the report exists

## 10. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [x] 10.1 Preconditions: local database migrated with acme-shop loaded (`npx tsc --build` first, so `npm run cli` does not run stale code); record the 0.4 counts
- [x] 10.2 Live run: serve the local Ollama CPU-only (`docs/project-context.md`; a model the author names) and run `npm run cli -- ask acme-shop "¿Cómo se calcula el precio final de un pedido?"`; check exit `0`, no `evidence_broken` line on stderr, and that the new `evidence` rows have `verification = 'cited'` (`SELECT verification, count(*) FROM evidence … GROUP BY 1` before/after). ask the author for the model at the start of this step (`llama3.2` is known to give `invalid-model-output`). If Ollama cannot run, use a local OpenAI-compatible stub that echoes a fixed valid output citing `E1`, written outside the repository (session scratchpad) and removed in 10.6; record which one was used
- [x] 10.3 Broken path (design Risks: a graph range beyond its file is the real trigger under D1): under a temporary directory inside `ALLOWED_REPOS_DIR`, a small git repository indexed with `npm run cli -- index …`; `UPDATE symbol SET end_line = <file lines + 5>` for the symbol the question anchors (cited as `E1`); run `ask` with the step 10.2 stub (session scratchpad) returning an output citing only `E1`; check stderr has `{"level":"error","type":"evidence_broken",…,"reason":"range-out-of-file"}` with no file text and stdout is `UNKNOWN (broken-evidence)`; no `claim` row added
- [x] 10.4 Evaluation mode: the same `ask` without `LLM_*` → `UNKNOWN (llm-required)` and no verification read (no `evidence_broken` line)
- [x] 10.5 Document every command, exit code and output in `openspec/changes/evidence-verifier-syntactic/reports/YYYY-MM-DD-10-manual-interface-testing.md` (mask the OS user name in paths)
- [x] 10.6 Restore: delete every `claim`/`evidence` row the runs created (by id from a before/after diff) and the temporary project and repository, and confirm the `project`, `claim`, `evidence` counts equal the 0.4 baseline; `git status` shows no stray file

## 11. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 11.1 The change has no browser UI: the terminal is the client and step 10 drives it end to end; record "not applicable beyond step 10" in the step 9 report
- [ ] 11.2 After pushing (switch `gh` to the DisTinta account first, back to Cristina-JumpMath afterwards), confirm in the PR's CI run that the new spec files ran and passed and the mutation job is ≥ 80; link the run in the step 9 report

## 12. Update Technical Documentation (MANDATORY)

- [x] 12.1 `readme.md`: the syntactic verifier step in the pipeline (§2.1) and the `verification` table (§3.2): `cited` written by `explain`, `broken` never stored (ADR 20261014), `evidence_broken` at `error` on stderr
- [x] 12.2 `docs/project-context.md`: gotchas — the verification re-reads git at `pack.commit` from `pack.root` (one more batched read per answer); `createInMemorySourceTree` `options.after` (`when`, `contents`, `failures`) and `doubles()` `verificationContents` / `verificationFailures` (switched after the model call); `EVIDENCE_BROKEN_REASONS` lives in `explain-event.ts`
- [x] 12.3 The ADR of D2 (`docs/adr/20261014-broken-citations-not-stored.md`) and its `docs/adr/README.md` line are committed on this branch; no other ADR (design V12)
- [x] 12.4 Run `/update-docs` and confirm the docs gate passes. Add the relevant AI prompts to `prompts.md` per `docs/project-context.md` → prompts.md rules, with its Índice entry in the same edit

## 13. Pull request preparation

- [x] 13.1 Prepare the PR description (`/pr-describe`, in Spanish) against `feature/entrega-2-CRN`, with the author's Why transcribed (DIS-68 `[enhanced]` D1–D7 and any decision taken after the spec audit), the departure from readme task 6 (ADR 20261014), the Stryker score; after verification, set DIS-68 to In Review in Linear with a comment in Spanish linking the PR and the change

## 14. Pre-merge Review (MANDATORY - AGENT MUST EXECUTE)

- [x] 14.1 Open the pull request against `feature/entrega-2-CRN` (after confirming with the author; `gh` on the DisTinta account, back to Cristina-JumpMath afterwards)
- [x] 14.2 Run `/show-spec-working`, `/verify-against-spec` and `/adversarial-review`, in this order; one report each under `openspec/changes/evidence-verifier-syntactic/reports/` (`YYYY-MM-DD-show-spec-working.md`, `YYYY-MM-DD-verify-against-spec.md`, `YYYY-MM-DD-adversarial-review.md`); `/show-spec-working` may reuse the step 10 evidence and must show `verification = 'cited'` in the `evidence` rows of a real `ask` over acme-shop
- [x] 14.3 Fix every finding in this change (behaviour changes via TDD) and give each one an A/B/C/D destination in `design.md` → Follow-ups; re-run the verification each fix invalidates and add an addendum to the affected report
- [ ] 14.4 Commit the fixes to the same pull request (push confirmed with the author); re-run a check whose findings led to non-trivial fixes until it returns no Blocker or Major
- [ ] 14.5 `/opsx:archive`, and commit the archive to the same pull request; the author merges afterwards (never before the archive commit)
