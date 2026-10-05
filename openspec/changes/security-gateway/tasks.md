## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Set DIS-84 to In Progress in Linear right away, with a short comment in Spanish (change name `security-gateway` and branch)
- [x] 0.2 Create feature branch `feature/DIS-84-security-gateway` from the delivery branch `origin/feature/entrega-2-CRN` (`docs/project-context.md` → Branch and ticket conventions), carrying the untracked `openspec/changes/security-gateway/` planning files with it. DIS-99 (PR #21, TSDoc only) is not needed as a base
  - Branch created 2026-10-05 from `origin/feature/entrega-2-CRN` at `bd8be6c` (DIS-99 / PR #21 already merged there). Upstream unset so a bare `git push` cannot target the delivery branch.
- [x] 0.3 Verify branch creation and current branch status (`git status`, `git branch --show-current`)
- [x] 0.4 Baseline: run `npx vitest run` once, green, and record the totals for the step 6 report; record `git status --porcelain fixtures` (must be empty), `git ls-files -s fixtures | sha1sum`, and the current Stryker score if a recent report exists (else note "run in 6.3")
  - Baseline (2026-10-05): 24 test files passed, 7 skipped (31); 311 tests passed, 99 skipped (462); 54.63s. `git status --porcelain fixtures` empty. `git ls-files -s fixtures | sha1sum` = `b97101fedecb07b21ca67c6156224d81bc13a3e8`. Only Stryker report is from 2026-10-01 (98.59 %, 70/71, before DIS-96/97): stale, score taken in 6.3.

## 1. Test support: ignored directories (design D7)

- [x] 1.1 Add the optional `ignoredDirs: readonly string[] = ['.git']` parameter to `readFixtureFiles` in `tests/support/read-fixture-files.ts`, compared with each directory entry's name; update its TSDoc. Run the 6 existing callers' specs (`npx vitest run tests/unit/analyzers/php`) green, unchanged

## 2. Domain: path confinement (TDD, design D6)

- [x] 2.1 Create `tests/unit/index/path-policy.spec.ts` (template `tests/unit/knowledge/errors.spec.ts`, Arrange-Act-Assert, spec reference comment). RED: test "A missing or blank root disables indexing" (`undefined`, `''`, `'   '`; also a path that would be inside; `instanceof DomainError`, code, exact message, never `ForbiddenPathError`). See it fail (module missing)
- [x] 2.2 GREEN: `packages/core/src/index/path-policy.ts` with `IndexingDisabled`, `ForbiddenPathError` (`requestedPath`) extending `DomainError`, and `confinePath`; barrel `packages/core/src/index/index.ts`; `export * from './index/index.js';` in `packages/core/src/index.ts`
- [x] 2.3 RED → GREEN: tests "Paths inside the root are accepted" and "Paths outside the root are forbidden" (all expectations built with `path.resolve`; `/repos-evil/x` included)
- [x] 2.4 RED → GREEN: test "A path on another Windows drive is forbidden" with `it.runIf(process.platform === 'win32')`; confirm it runs locally (Windows) and is skipped on Linux CI
- [x] 2.5 Extra cases (not scenarios): `confinePath('', root)` and `confinePath('.', root)` return the root; `confinePath('..', root)` and `'../x'` throw; a root with a trailing separator behaves like without it

## 3. Domain: secret redaction (TDD, design D1–D5, D8)

- [x] 3.1 Create `tests/unit/index/secret-scanner.spec.ts` (template `tests/unit/knowledge/author-hash.spec.ts`; `readFixtureFiles` usage as in `tests/unit/analyzers/php/structure.spec.ts`). Every synthetic secret-shaped literal built by concatenation (D8)
- [x] 3.2 RED: test "The acme-shop planted secret is redacted" (exact line 21, every other line byte-identical, line count unchanged, exact event, no 8+-char substring of the key in `JSON.stringify(events)`). See it fail
- [x] 3.3 GREEN: `packages/core/src/index/audit-event.ts` (`AuditEvent`, `SecretRedactedEvent`, `SecretRule`) and `packages/core/src/index/secret-scanner.ts` (`REDACTION_MARKER`, `MIN_SECRET_ENTROPY`, `MIN_SECRET_LENGTH`, `redactSecrets`, line model of D2, span claiming of D3, `aws-access-key-id` first). Export them from the barrel
- [x] 3.4 RED → GREEN: test "Every rule produces one ordered event per span" — add `jwt`, linear `generic-high-entropy` (maximal runs + sticky tail + entropy, D3) and multiline `private-key` form a (D4)
- [x] 3.5 RED → GREEN: tests "A private key without a closing keeps the following code", "A single-line private key keeps the surrounding JSON", "A multiline private key inside a string keeps the code around it" and "A header followed by prose redacts only the header" (forms b with body, c, a inside a string, b without body)
- [x] 3.6 RED → GREEN: test "The fixtures produce no false positive" (`readFixtureFiles(root, ['.git', 'node_modules'])` over both fixtures; exactly the two expected files and events, priority over `generic-high-entropy` in `src/config/env.ts`, `package-lock.json` untouched)
- [x] 3.7 Extra cases (not scenarios, D3 Risks): 19 vs 20-character value; entropy just under and at 3.5; `api-key`/`api_key`/`apikey` keys; unquoted and mismatched-quote values; lowercase `akia…`; `X_AKIA…` (no match, `\b`); JWT with two segments; `Proc-Type`/`DEK-Info` headers and the empty line after them in a form a block; two keys on one line after a form c block; a `secret =` assignment with the quoted value on the next line is not redacted (no match across lines); a CRLF line emptied by a private-key block keeps its `\r`; content with no match returned identical; ~200 000-character line of repeated `secret` returns
- [x] 3.8 Prove the key tests can fail: back up each file to the scratchpad, mutate it with a node script whose anchor must match, run, restore and confirm with `cmp`: (1) drop the overlap check → "The fixtures produce no false positive" fails (second event in `env.ts`); (2) `startsWith(root)` instead of `path.relative` → "Paths outside the root are forbidden" fails (`/repos-evil/x`); (3) form a without the "directly after the body run" condition → "A header followed by prose redacts only the header" fails. Record the results for the step 6 report
- [x] 3.9 REFACTOR with the suite green: TSDoc on every export; core imports only `node:path` and its own modules; `npm run lint:architecture`, `npm run docs:coverage`, `npm run typecheck` and `npm run lint` green

## 4. Privacy and ethics check

- [x] 4.1 Run `/privacy-ethics-check` over the diff (repository content, audit events, error messages, test literals). Record the outcome in the step 6 report; fix any finding in this change or classify it (A/B/C/D, `docs/project-context.md` → Tracking deferred findings)
  - PASS WITH GAPS, two Low: synthetic service-account e-mail of AC3 (ii) (D, accepted); `ForbiddenPathError.message` carries the requested path, which may hold an OS user name once DIS-86 logs it (B → DIS-86, added to design.md Follow-ups). No secret-shaped literal, no logging, no env or file access in core, no dependency change.

## 5. Backend: Review and Update Existing Tests (MANDATORY)

- [x] 5.1 Identify tests affected by the change: the 6 `readFixtureFiles` callers (signature unchanged for them). Confirm with `git diff --stat origin/feature/entrega-2-CRN -- tests` that only `tests/support/read-fixture-files.ts` changed besides the two new specs
  - Only `tests/support/read-fixture-files.ts` changed (8+/5-); untracked: `tests/unit/index/` (the two new specs).
- [x] 5.2 Update affected tests without weakening their assertions (none expected). Confirm that every `#### Scenario:` of `openspec/changes/security-gateway/specs/security-gateway/spec.md` (11 scenarios) maps 1:1 to a test with exactly the same name (grep each title in `tests/`; no scenario without a test, no scenario with two)
  - No existing assertion touched. The 11 scenario titles each match exactly one `it('…'` (grep count 1 each).

## 6. Backend: Run Tests and Verify Data State (MANDATORY)

- [x] 6.1 Capture the pre-test baseline: `git status --porcelain fixtures` (empty), `git ls-files -s fixtures | sha1sum`. The change has no database state; record "no DB entity impacted"
- [x] 6.2 Run the targeted tests: `npx vitest run tests/unit/index`, twice, to check for flakiness
- [x] 6.3 Run the required broader suite and gates: `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`, `npx stryker run` (new core code included; score ≥ `MIN_MUTATION_SCORE=70`; list surviving mutants of `packages/core/src/index/` and kill the meaningful ones with extra cases). Reproduce the no-database run with `npx vitest run --exclude 'tests/integration/**'` and no `DATABASE_URL`
- [x] 6.4 Verify the post-test state matches the baseline (same checksum, `git status --porcelain fixtures` empty: no test modified a fixture). Restore and document if not
- [x] 6.5 Create the report `openspec/changes/security-gateway/reports/YYYY-MM-DD-6-test-and-state-verification.md` from the template in `docs/openspec-tasks-mandatory-steps.md` §6. Include the baseline of 0.4, the forced failures of 3.8 and the privacy check of 4.1
- [x] 6.6 Mark complete only after the tests pass and the report exists

## 7. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [x] 7.1 Note the current state (6.1 indicators). The interface is the core API `redactSecrets` / `confinePath` (no HTTP route or CLI command uses it yet)
- [x] 7.2 Exercise the success path: a scratch script in the scratchpad (not in the repo), run with `npx tsx`, that redacts every file of both fixtures (skipping `.git` and `node_modules`) and prints the files with `redacted: true`, their events and the redacted lines; and confines `acme-shop` and an absolute child to a temporary root
- [x] 7.3 Mutating operations: none (pure functions). Confirm with the 6.1 checksum after the script ran
- [x] 7.4 Exercise the error cases from the same script: `/repos/../etc`, `/repos-evil/x`, blank root; print each error's `name`, `code`, message and check no message or event contains a redacted value
- [x] 7.5 Document every command and output in `openspec/changes/security-gateway/reports/YYYY-MM-DD-7-manual-interface-testing.md`. Delete the scratch script
  - Report `reports/2026-10-05-7-manual-interface-testing.md` (OS user name masked). The scratch script stays in the session scratchpad, outside the repository: the repository hook blocks `rm`.
- [x] 7.6 Verify the state matches the pre-test state (6.1 indicators)

## 8. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 8.1 Confirm no user interface or user workflow is affected (no route, no CLI, no web change). Record "not applicable", with that reason, in the step 6 report
- [x] 8.2 After pushing (switch `gh` to the DisTinta account first, back to Cristina-JumpMath afterwards), confirm in the PR's CI run that `secret-scanner.spec.ts` and `path-policy.spec.ts` ran (the Windows-only test skipped) and that "The fixtures produce no false positive" passed without `node_modules`. Link the run in the step 6 report
  - PR #22, `quality` run 37289394636 and `frontend` run 37289394697 passed. `secret-scanner.spec.ts` 33/33 (oracle included, no `node_modules` in CI), `path-policy.spec.ts` 6 with the Windows test skipped; 500 passed / 1 skipped. Linked in the step 6 report "CI evidence (task 8.2)".

## 9. Update Technical Documentation (MANDATORY)

- [x] 9.1 Add the security-gateway gotcha to `docs/project-context.md`: rules and priority; `private-key` unified span (first dash of the header to block end, text before and after kept on the end lines), forms checked c, a, b, form a only when the closing directly follows the PEM body run; marker, line preservation and `column`; `\b` after `_` not matching; `confinePath` lexical with its acceptance rule (`..x` is a valid child, `..` and `../…` are not); `ALLOWED_REPOS_DIR` read only at the composition root; `readFixtureFiles` ignored dirs
- [x] 9.2 Update `readme.md` §2.5 practices 3 and 4: snippets reflect `redactSecrets` / `RedactionResult.events` (returned, not logged by core) and `confinePath` with `path.relative` instead of `startsWith`
- [x] 9.3 No ADR (design D10); confirm nothing in the implementation contradicted that
- [x] 9.4 Run `/update-docs` and confirm the docs gate passes (`npm run docs:coverage`). Add the relevant AI prompts to `prompts.md` per `docs/project-context.md` → prompts.md rules, with its Índice entry in the same edit
  - `/update-docs`: besides 9.1/9.2, the second `.stryker-tmp/` note (DB integration gotcha) no longer says to delete by hand, and the mutation-score line names `index/` and 95.56 %. Checked, no change: data model, API spec, dependencies, ADRs, standards, `fixtures/README.md`, `docs/ai-sessions/` (history). `docs:coverage` exit 0. `prompts.md` §28 (3 literal prompts) + Índice entry 28.
- [x] 9.5 Prepare the PR description (`/pr-describe`, in Spanish) against `feature/entrega-2-CRN`, with the author's Why transcribed. After verification, set DIS-84 to In Review in Linear with a comment in Spanish linking the PR and the change
  - PR #22 opened against `feature/entrega-2-CRN` with the author's Why copied verbatim from the author's message (`reports/pr-description.md`). DIS-84 → In Review with a Spanish comment linking the PR and the change.
- [ ] 9.6 At archive time, leave the Follow-ups of design.md as Spanish Linear comments on DIS-85 and DIS-86

## 10. Fixes after `/adversarial-review` (PASS WITH GAPS; author decision 2026-10-05, same PR #22, design D3 correction)

- [x] 10.1 RED: four timed cases (2 s, elapsed time asserted), one line of more than 100k characters each, literals by concatenation: repeated keywords, JWTs, AWS keys and headers without a closing. Run on the unfixed code
  - JWT 25 880 ms, AWS 12 460 ms, headers 15 717 ms failed; repeated keywords passed (already linear).
- [x] 10.2 GREEN: per-line sorted interval index (`Claims`) for overlap tests, multi-line claims on every line they cover; closings not found and the body run cached per header line; each covered line rendered once
  - The first two alone left 21 863 / 11 169 / 12 287 ms: the per-claim line rebuild was the main cost. After rendering once: 42/42 in 1.76 s.
- [x] 10.3 Stryker: kill new non-equivalent survivors; re-measure the Major cases before/after
  - Cache reset (`:101`, 3 mutants) killed by "what a header line learned about closings and body is not reused on a later line". Final 95.39 % core (745/781), 98.18 % `index/` (269/274), 5 equivalent survivors. Times in the step 6 report.
- [x] 10.4 Record the review's other findings as decided by the author: PEM body limitation in `docs/project-context.md` and design.md Risks; PGP → DIS-87 follow-up; root trim → DIS-86 follow-up; process note in the step 6 report
- [ ] 10.5 Commit test and fix separately, push (gh DisTinta, then back to Cristina-JumpMath), CI green. Then a new `/adversarial-review` on the two Majors before archiving
