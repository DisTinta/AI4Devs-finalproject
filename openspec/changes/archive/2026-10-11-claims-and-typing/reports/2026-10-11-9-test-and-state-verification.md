# Test and State Verification Report

- Date: 2026-10-11
- Change: claims-and-typing
- Step: 9 — Backend: Run Tests and Verify Data State

## Commands executed
- `npx vitest run` (baseline, step 0.5, without `DATABASE_URL` in the shell)
- `npx vitest run tests/unit/knowledge/claim.spec.ts tests/unit/explain`
- `DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind npx vitest run`
- `npm run lint`, `npm run typecheck`, `npm run docs:coverage`, `npm run lint:architecture`
- `npx stryker run --mutate "packages/core/src/explain/**/*.ts,packages/core/src/knowledge/claim.ts,packages/core/src/knowledge/evidence.ts"` (twice)
- `git status --porcelain seeds packages/web fixtures`, `sha1sum seeds/graph-dump.sql packages/web/src/data/sample-projects.ts`

## Test results
- Targeted tests: 28 passed, 0 failed, 0 skipped (`claim.spec.ts` 10, `typing-rules.spec.ts` 3, `statement-schema.spec.ts` 15 after task 9.4)
- Required suite: 81 files, 1046 passed, 0 failed, 0 skipped (with `DATABASE_URL`); 132.9 s
- Baseline (step 0.5): 64 files passed, 14 skipped; 821 passed, 147 skipped. The skips were the
  database suites: `DATABASE_URL` was not set in that shell. Not a regression of this change.
- Gates: lint 0 problems; typecheck 0 errors; `docs:coverage` 0 warnings (13 warnings appeared at task
  7.5 and were fixed with `z.literal`, design D1); `lint:architecture` exit 0 with the 3 pre-existing
  `no-orphans` warnings (`packages/web/src/data/sample-projects.ts`,
  `packages/analyzers/typescript/{src/index.ts,dist/index.js}`).
- Notes, TDD honesty:
  - 2.3 ("An inferred claim without provenance is rejected") and 3.3 ("Any heuristic evidence makes
    an inference") were green on arrival: the GREEN of 2.2 / 3.2 already covered them. Each was
    checked with a temporary mutation (a typed literal with provenance makes the `@ts-expect-error`
    unused; `'FACT' : 'FACT'` fails 3.3).
  - In section 4 three tests were green after the first GREEN (conforming output, extra field via
    `z.strictObject`, event shape); the other 11 were red before the pipeline was completed.
  - The code-point case of 4.9 is green by Zod's own behaviour; a temporary UTF-16 `refine` mutant
    makes it fail.

## Mutation testing (task 9.4)
- First run: 92.09 % (125 killed, 11 survived).
- Two meaningful survivors in `shapeSubcode` (`every` → `some`, `endsWith('.evidenceIds')` →
  `endsWith('')`) were killed with the extra case "keeps empty_evidence for failures made only of
  empty evidence"; the `refine` path of `evidence.ts` was pinned by "reports a reversed span on
  endLine" (commit `11fd0f6`, tests only, no seed regeneration).
- Final run: **95.68 %** (133 killed, 6 survived; threshold 70). `typing-rules.ts` and `evidence.ts`
  100 %, `statement-schema.ts` 96.63 %, `claim.ts` 90.32 %.
- The 6 survivors:
  - 3 equivalent: `'utf8'` → `""` in `Buffer.byteLength` (lines 44, 107) and `hash.update` (line
    108); Node's default encoding is UTF-8.
  - 3 static false survivors in `claim.ts` (lines 70, 71, 77: `discriminatedUnion("")` and an empty
    branch). Applied by hand, each throws "Invalid discriminated union option" at module load and the
    whole `claim.spec.ts` fails; Stryker's Vitest runner does not re-evaluate module-level code for
    static mutants (42 static mutants reported).
- No `.stryker-tmp/` left behind.

## Privacy check (task 5.1)
PASS. No PII or secret shapes in the diff; no `console`/logger in core; the event is built only from
`issue.path` and `issue.code`; the lockfile only adds the `packages/core` entry for `zod ^4.6.5`,
already resolved for `adapters/llm`; test data synthetic. Residual Low: the unsalted SHA-256 is for
correlation only (design D4); log retention belongs to DIS-39.

## Data state verification
- Pre-test baseline:
  - `git status --porcelain seeds packages/web fixtures`: empty
  - sha1 `seeds/graph-dump.sql`: `248ff519…` (analyzer-fingerprint `c4de5185…`, contract `95c72d62…`)
  - sha1 `packages/web/src/data/sample-projects.ts`: `62a2b908…`
- Step 8 (seed, commit `7f05017`): `seed:build` run by the author with `!` (salt loaded from `.env`,
  never shown): `acme-shop: 53 files, 121 symbols, 170 edges, 32 commits`. Only line 2 of
  `seeds/graph-dump.sql` changed: analyzer-fingerprint `c4de5185…` → `aa432b0d…`. Contract
  fingerprint and every row identical; `sample-projects.ts` unchanged; `fixtures/` clean.
- Post-test validation:
  - `git status --porcelain seeds packages/web fixtures`: empty
  - sha1 `seeds/graph-dump.sql`: `71705002…` (the step 8 commit), `sample-projects.ts`: `62a2b908…`
  - Local database: `project`, `claim`, `evidence`, `query_log` each hold 0 rows after the suite (the
    integration suites write only inside rolled-back transactions). No count was captured before
    the run, so this is a post-state reading, not a comparison.
- State restored: Yes (nothing to restore)
- Restoration actions: none; every temporary mutation was copied back and `git diff --stat
  packages/` was empty afterwards.

## UI evidence (if applicable)
- (none: the change has no browser UI)

## End-to-end (step 11.1)
Not applicable: no user interface uses these functions yet (DIS-39 / CM-HU-12); they are exercised
through `@codemind/core` in step 10.

## Outcome
- Status: PASS
- Blocking issues: none

## Addendum — after the verify-against-spec fixes (2026-10-11)

The fixes of `reports/2026-10-11-verify-against-spec.md` (commits `e672529`, `d6399f6`, `f6ca6d1`)
changed `typing-rules.ts`, `claim.ts` and `evidence.ts`, so the affected checks were re-run:

- Full suite with `DATABASE_URL`: 81 files, 1052 passed, 0 failed, 0 skipped. Lint, typecheck,
  `docs:coverage` (0 warnings) and `lint:architecture` (exit 0, the 3 pre-existing `no-orphans`)
  clean.
- Stryker on the same files: 95.21 % (139 killed, 7 survived). The new survivor, the message of the
  empty-chain `RangeError` emptied (`typing-rules.ts:28`), was killed by pinning the message
  (`f6ca6d1`, test only). The other 6 are the equivalent `'utf8'` and static `claim.ts` mutants
  classified above.
- Seed: `SPAN_LINE_MAX` touched `packages/core/src/knowledge`, so `seed:build` was run again by the
  author with `!` (same output: 53 files, 121 symbols, 170 edges, 32 commits). Only line 2 changed,
  analyzer-fingerprint `aa432b0d…` → `0e8048c2…`; contract fingerprint, every row and
  `sample-projects.ts` unchanged; `fixtures/` clean (commit `5805c80`, the last commit touching a
  fingerprint input).
- No `.stryker-tmp/` left behind.

## Addendum 2 — after the adversarial-review and verify re-run fixes (2026-10-11)

Commits `a38cf1c`, `7334994`, `0ecd201`, `eb3208a` changed only `packages/core/src/explain/` and
tests (no fingerprint input: the seed of `5805c80` stays current).

- Full suite with `DATABASE_URL` at `7334994`: 81 files, 1055 passed; at `eb3208a`: 81 files,
  1057 passed, 0 failed, 0 skipped. Lint, typecheck, `docs:coverage` (0 warnings),
  `lint:architecture` (exit 0, 3 pre-existing `no-orphans`) clean at both.
- Stryker at `7334994`: 95.60 % (152 killed, 7 survived; the new survivor was the sparse-chain
  message). Final at `eb3208a`: **96.23 %** (153 killed, 6 survived): `typing-rules.ts` 100 %,
  `evidence.ts` 100 %, `statement-schema.ts` 96.67 %, `claim.ts` 90.91 %. The 6 survivors are the 3
  equivalent `'utf8'` and the 3 static `claim.ts` mutants classified above. A `slice(-20)` mutant of
  the issue cap (not generated by Stryker) and the emptied sparse-chain message were checked by hand
  and fail the suite.
- No `.stryker-tmp/` left behind.

## CI evidence (task 11.2)

PR #36, head `7eb5af0`, run https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/38148647202
(job `quality` https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/38148647202/job/114497256209,
12 min 15 s) and the `frontend`, `scope` and `secrets` checks: all four pass.

- Tests: `tests/unit/explain/statement-schema.spec.ts` (19), `tests/unit/knowledge/claim.spec.ts` (12)
  and `tests/unit/explain/typing-rules.spec.ts` (6) ran and passed; 81 files, 1056 passed, 1 skipped
  (1057). The skip is in `tests/unit/index/path-policy.spec.ts`, unrelated to this change.
- Mutation step ("Mutation testing on critical paths") covered the new code: `explain` 97.37 %
  (`statement-schema.ts` 96.67 %, `typing-rules.ts` 100 %), `claim.ts` 100 %, `evidence.ts` 100 %.
  On CI the three static `claim.ts` mutants are killed, which confirms they were false survivors of
  the local scoped run. All files 95.45 %.

