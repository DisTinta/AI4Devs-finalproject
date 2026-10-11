## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Set DIS-38 to In Progress in Linear right away, with a short comment in Spanish (change name `claims-and-typing` and branch)
- [x] 0.2 `git fetch` and confirm that `origin/feature/entrega-2-CRN` contains DIS-28 (`packages/core/src/context/context-pack.ts` exports `ContextSpan` with `origin`). If not, stop and ask the author which base to use
- [x] 0.3 Feature branch `feature/DIS-38-claims-and-typing` from `origin/feature/entrega-2-CRN` (`docs/project-context.md` → Branch and ticket conventions; `BRANCH_PREFIX=feature/`), created during `/opsx:propose` with the upstream unset; confirm the upstream is still unset so a bare `git push` cannot target the delivery branch, and that the `openspec/changes/claims-and-typing/` planning files are on it
- [x] 0.4 Verify branch creation and current branch status (`git status`, `git branch --show-current`)
- [x] 0.5 Baseline: run `npx vitest run` once, green, and record the totals for the step 9 report; record `git status --porcelain seeds packages/web fixtures` (must be empty), `sha1sum seeds/graph-dump.sql packages/web/src/data/sample-projects.ts`, and the `analyzer-fingerprint` / `contract-fingerprint` header lines of `seeds/graph-dump.sql`

## 1. Dependency: `zod` in core (design D2)

- [x] 1.1 Add `"zod": "^4.6.5"` to `packages/core/package.json` `dependencies`; run `npm install`; confirm `node -p "require('zod/package.json').version"` is `4.6.5`, that `git diff package-lock.json` only adds the `packages/core` dependency entry (no new package), and that `npm run lint:architecture` stays green

## 2. Core: claim and evidence records (TDD, design D1) — requirement "Claim and evidence records mirror the database checks"

- [x] 2.1 Create `tests/unit/knowledge/claim.spec.ts` (pattern of `tests/unit/knowledge/validate-graph.spec.ts`; one `describe` per requirement, each test named exactly after its scenario). RED: test "An inferred fact is not representable" (`// @ts-expect-error` on a typed `Claim` literal with `layer: 'L2', type: 'FACT'` + `claimSchema.safeParse` of the same value fails + the `L1` version passes). See it fail (module missing)
- [x] 2.2 GREEN: `packages/core/src/knowledge/claim.ts` with `CLAIM_LAYERS`, `CLAIM_TYPES`, `CLAIM_STATUSES`, derived types, `provenanceSchema`, `Provenance`, `claimSchema` (strict discriminated union on `layer`), `Claim`; export from `packages/core/src/knowledge/index.ts`. JSDoc on every export. Confirm RED of the type test by temporarily allowing `FACT` in `l2` and seeing `npm run typecheck` fail on the unused directive, then restore
- [x] 2.3 RED → GREEN: test "An inferred claim without provenance is rejected"
- [x] 2.4 RED → GREEN: test "Confidence outside its range is rejected"
- [x] 2.5 RED → GREEN: test "The provenance shape is validated" (extra cases not scenarios, to give Stryker something to kill: uppercase hex hash, 63-char hash, `inputSpans` with `startLine` 0 and with `endLine` < `startLine`, empty `model`, offset time `2026-10-11T12:00:00+02:00` accepted)
- [x] 2.6 RED → GREEN: test "The evidence span mirrors the database checks": `packages/core/src/knowledge/evidence.ts` with `EVIDENCE_VERIFICATIONS`, `EvidenceVerification`, `evidenceSchema`, `Evidence`; export from `knowledge/index.ts`
- [x] 2.7 RED → GREEN: test "The closed sets equal the database enums": read `packages/adapters/store-postgres/migrations/0002_history-claims.up.sql` as text in the test, extract the four `CREATE TYPE … AS ENUM (…)` lists and compare with the arrays (`toEqual`, order included). The test reads a file; core stays I/O-free

## 3. Core: typing rule (TDD, design D7) — requirement "Statement typing from the resolution of its evidence"

- [ ] 3.1 Create `tests/unit/explain/typing-rules.spec.ts`. RED: test "A chain of anchor and exact evidence is a fact"
- [ ] 3.2 GREEN: `packages/core/src/explain/typing-rules.ts` with `CitedSpan`, `StatementType` and `typeStatement`; `packages/core/src/explain/index.ts` and `export * from './explain/index.js'` in `packages/core/src/index.ts` (check no name clashes with the other `export *`). JSDoc on every export
- [ ] 3.3 RED → GREEN: test "Any heuristic evidence makes an inference" (extra case not a scenario: `// @ts-expect-error` on `typeStatement([])`). Add a one-line comment in the spec file: the "type independent of layer" clause is guaranteed by the signature (design D7), not by a run-time scenario

## 4. Core: quarantine, limits and audit event (TDD, design D3, D4, D5, D6) — requirements "Model output quarantine", "Audit event of a discarded output"

- [ ] 4.1 Create `tests/unit/explain/statement-schema.spec.ts` with small builders for a conforming output (statements citing `E1`), a padding helper to an exact UTF-8 byte size, and a helper that asserts `ok: false` and returns the event. RED: test "A conforming output is accepted"
- [ ] 4.2 GREEN: `packages/core/src/explain/limits.ts` (five constants of design D6, each with its one-line why), `packages/core/src/explain/schema-violation.ts` (`SCHEMA_VIOLATION_SUBCODES`, `SchemaViolationSubcode`, `SchemaViolationIssue`, `SchemaViolationEvent`), `packages/core/src/explain/statement-schema.ts` (`modelOutputSchema`, `ModelOutput`, `ModelOutputResult`, `parseModelOutput`, pipeline of design D3, `createHash` from `node:crypto`); export from `explain/index.ts`. JSDoc on every export
- [ ] 4.3 RED → GREEN: test "An extra field discards the whole output". Every object schema is `z.strictObject()` (design D1, strictness); the extra field sits on a **nested** statement so a `z.object()` there would make the test fail. Extra cases not scenarios: an unexpected top-level field, and one inside the claim's `provenance.inputSpans[0]` (in `claim.spec.ts`), both rejected
- [ ] 4.4 RED → GREEN: test "An unknown evidence id discards the whole output" (also assert the issue `code` is `unknown_evidence_id`, design D3)
- [ ] 4.5 RED → GREEN: test "A statement without evidence discards the whole output"
- [ ] 4.6 RED → GREEN: test "A repeated evidence id discards the whole output" (extra case not a scenario: `["E9","E9"]` reports `duplicate_evidence_id`, proving step 4 runs before step 5; assert the issue `code` is `duplicate_evidence_id`, design D3)
- [ ] 4.7 RED → GREEN: test "Malformed JSON discards the output" (event has no issues)
- [ ] 4.8 RED → GREEN: test "The output size limit accepts its bound and rejects one byte more" (`vi.spyOn(JSON, 'parse')` sees no call for the 65 537-byte output; restored in `afterEach`; extra case not a scenario: a multi-byte character makes a 65 535-char string exceed the bound)
- [ ] 4.9 RED → GREEN: tests "The answer length limit accepts its bound and rejects one more", "The statement count limit accepts its bound and rejects one more", "The statement length limit accepts its bound and rejects one more", "The citations limit accepts its bound and rejects one more" — one test each, built from the exported constants, not literals (extra cases not scenarios: an output with one `too_big` and one unexpected field is `invalid_shape`; a statement `text` of 499 ASCII characters plus one non-BMP character such as `😀` — 501 UTF-16 code units, 500 code points — is rejected with `limit_exceeded`, pinning "UTF-16 code units" of the spec)
- [ ] 4.10 RED → GREEN: test "The event identifies the output without carrying it" (`outputBytes` and `outputSha256` compared with values computed in the test with `Buffer.byteLength` and `node:crypto`; `JSON.stringify(event)` checked with `not.toContain` for each forbidden fragment; every issue has exactly the keys `path` and `code`; comment in the test that `ok` is safe to forbid because the event, unlike the wrapping result, has no `ok` field)
- [ ] 4.11 RED → GREEN: test "Checking an output writes nothing to the console" (`vi.spyOn` on `console.log`, `info`, `warn`, `error`, `debug`; zero calls across the conforming output and one output per subcode)
- [ ] 4.12 REFACTOR with the suite green (`/tdd-refactor`) over `knowledge/claim.ts`, `knowledge/evidence.ts` and `explain/*`; no behaviour change

## 5. Privacy and ethics check

- [ ] 5.1 Run `/privacy-ethics-check` over the diff (event content: no raw output, no Zod `message`/`keys`/`input`; hash for correlation only; `zod` resolved from the existing lockfile entry). Record the outcome in the step 9 report; fix any finding in this change or classify it (A/B/C/D, `docs/project-context.md` → Tracking deferred findings)

## 6. Backend: Review and Update Existing Tests (MANDATORY)

- [ ] 6.1 Identify tests affected by the change: `grep -rn "@codemind/core" tests | grep -i "claim\|evidence\|explain"` and check that the new `export *` of `explain/` collides with no existing name (`npm run typecheck`)
- [ ] 6.2 Update affected tests without weakening their assertions. Confirm that each of the 21 `#### Scenario:` of `specs/claims-and-typing/spec.md` maps 1:1 to a test with exactly the same name (grep each title in `tests/`; no scenario without a test, no scenario with two)

## 7. Update Technical Documentation (MANDATORY)

- [ ] 7.1 `docs/backend-standards.md` §1: Zod is also a dependency of `packages/core` since DIS-38 (domain schemas: claim records, model-output quarantine). §4: scope "Schemas live in `packages/api/schemas` and are the only description of a payload's shape" to HTTP payloads, and add that domain validation schemas (records, model-output quarantine) live in `packages/core` and are built with `z.strictObject()` (design D2)
- [ ] 7.2 `readme.md` §2.5 (2): replace the illustrative `InferredRuleSchema` / `audit.log` snippet with the real contract (strict schema, whole output discarded, subcodes, event with size + SHA-256 + `{path, code}` only, returned by core and logged by the transport); §3.2 CLAIM: the provenance shape (`model`, `promptHash`, `inputSpans`, `createdAt`) is validated by `provenanceSchema`; the statement type comes from the typing rule and FACT persistence is decided in DIS-39
- [ ] 7.3 `docs/project-context.md`: add the `explain/` area of core (typing rule, quarantine, limits) and the gotcha that `SchemaViolationEvent` is not part of `AuditEvent`
- [ ] 7.4 No ADR (design D8); confirm nothing in the implementation contradicted that
- [ ] 7.5 Run `/update-docs` and confirm the docs gate passes. Add the relevant AI prompts to `prompts.md` per `docs/project-context.md` → prompts.md rules, with its Índice entry in the same edit

## 8. Seed: regenerate the analyzer fingerprint (design D9) — last commit of the series

- [ ] 8.1 Preconditions: `git status --porcelain fixtures` and `git clean -ndX fixtures/acme-shop` both print nothing; `DATABASE_URL` points to a migrated local database (`npm run db:migrate`). When reaching this step, ask the author to provide `AUTHOR_HASH_SALT` in the session with `!` — never ask earlier, never write it to any file
- [ ] 8.2 Run `npm run seed:build`
- [ ] 8.3 Check the diff: in `seeds/graph-dump.sql` only the `analyzer-fingerprint` header line changes (the `contract-fingerprint` line and every row identical); `packages/web/src/data/sample-projects.ts` unchanged. If any other line changes, stop and tell the author; do not commit
- [ ] 8.4 Commit the regenerated seed as the last commit of the series (`chore(DIS-38): regenerate the seed for the new analyzer fingerprint`). If a later fix touches a fingerprint input (`packages/core/src/knowledge`, …), repeat 8.1–8.4 so the seed commit stays last

## 9. Backend: Run Tests and Verify Data State (MANDATORY)

- [ ] 9.1 Capture the pre-test baseline: the 0.5 indicators. No test of this change touches the database
- [ ] 9.2 Run the targeted tests: `npx vitest run tests/unit/knowledge/claim.spec.ts tests/unit/explain`
- [ ] 9.3 Run the required broader suite and gates: `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- [ ] 9.4 Run `npx stryker run --mutate "packages/core/src/explain/**/*.ts,packages/core/src/knowledge/claim.ts,packages/core/src/knowledge/evidence.ts"` (score ≥ `MIN_MUTATION_SCORE=70`). List surviving mutants; for each meaningful one, a RED → GREEN test (confirm a `z.strictObject` → `z.object` mutant is killed). If a new test touches only `tests/`, no seed regeneration is needed; if a fix touches `packages/core/src/knowledge`, redo step 8
- [ ] 9.5 Verify the post-test state: `seeds/`, `packages/web/`, `fixtures/` unchanged since the step 8 commit; no `.stryker-tmp/` left behind. Restore and document if not
- [ ] 9.6 Create the report `openspec/changes/claims-and-typing/reports/YYYY-MM-DD-9-test-and-state-verification.md` from the template in `docs/openspec-tasks-mandatory-steps.md` §6, including the 0.5 baseline, the lockfile diff of 1.1, the seed diff of step 8, the Stryker score and surviving mutants of 9.4, and the privacy check of 5.1
- [ ] 9.7 Mark complete only after the tests pass and the report exists

## 10. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [ ] 10.1 No CLI or HTTP entry point uses these functions yet (DIS-39): exercise them through a throwaway `tsx` script in the session scratchpad (never committed) importing from `@codemind/core`
- [ ] 10.2 Success path: a conforming output with known ids `E1`, `E2` is accepted; `typeStatement` over `anchor`+`exact` gives `FACT` and over `exact`+`heuristic` gives `INFERENCE`; a valid `L2` `INFERENCE` claim with provenance passes `claimSchema`
- [ ] 10.3 Error paths: one discarded output per subcode (`output_too_large`, `invalid_json`, `invalid_shape`, `limit_exceeded`, `empty_evidence`, `duplicate_evidence_id`, `unknown_evidence_id`); print each event and confirm it holds no fragment of its input; an `L2` `FACT` claim is rejected
- [ ] 10.4 Delete the scratchpad script; confirm `git status` shows no stray file
- [ ] 10.5 Document every command and output in `openspec/changes/claims-and-typing/reports/YYYY-MM-DD-10-manual-interface-testing.md` (mask the OS user name in paths)

## 11. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 11.1 No user interface uses these functions yet (DIS-39 / CM-HU-12): record "not applicable; exercised through `@codemind/core` in step 10" in the step 9 report
- [ ] 11.2 After pushing (switch `gh` to the DisTinta account first, back to Cristina-JumpMath afterwards), confirm in the PR's CI run that `tests/unit/knowledge/claim.spec.ts` and `tests/unit/explain/` ran and passed, that the seed-freshness check (if any) is green, and that the mutation step covered `packages/core/src/explain`. Link the run in the step 9 report

## 12. Pull request preparation

- [ ] 12.1 Prepare the PR description (`/pr-describe`, in Spanish) against `feature/entrega-2-CRN`, with the author's Why transcribed (Linear DIS-38 "Decisiones del refinamiento"), the open question moved to DIS-39, the seed regeneration explained (D9) and the Stryker score; after verification, set DIS-38 to In Review in Linear with a comment in Spanish linking the PR and the change

## 13. Pre-merge Review (MANDATORY - AGENT MUST EXECUTE)

- [ ] 13.1 Open the pull request against `feature/entrega-2-CRN` (after confirming with the author; `gh` on the DisTinta account, back to Cristina-JumpMath afterwards)
- [ ] 13.2 Run `/show-spec-working`, `/verify-against-spec` and `/adversarial-review`, in this order; one report each under `openspec/changes/claims-and-typing/reports/` (`YYYY-MM-DD-show-spec-working.md`, `YYYY-MM-DD-verify-against-spec.md`, `YYYY-MM-DD-adversarial-review.md`)
- [ ] 13.3 Fix every finding in this change (behaviour changes via TDD) and give each one an A/B/C/D destination in `design.md` → Follow-ups; re-run the verification each fix invalidates and add an addendum to the affected report; if a fix touches a fingerprint input, redo step 8 so the seed commit stays last
- [ ] 13.4 Commit the fixes to the same pull request (push confirmed with the author); re-run a check whose findings led to non-trivial fixes until it returns no Blocker or Major
- [ ] 13.5 `/opsx:archive`, and commit the archive to the same pull request; the author merges afterwards
