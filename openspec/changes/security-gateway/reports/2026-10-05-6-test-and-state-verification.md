# Test and State Verification Report

- Date: 2026-10-05
- Change: security-gateway
- Step: 6. Backend: Run Tests and Verify Data State (MANDATORY)

## Commands executed

- `ls -a | grep stryker-tmp` → nothing (`.stryker-tmp/` absent before any `npx vitest run`)
- `git status --porcelain fixtures` and `git ls-files -s fixtures | sha1sum` (before and after)
- `npx vitest run tests/unit/index` (twice)
- `npx vitest run`
- `npx vitest run --exclude 'tests/integration/**'` with `DATABASE_URL` unset (`env -u DATABASE_URL`)
- `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- `npx stryker run` (run of 10:54–10:57, after D12 and the line-ending fix; not repeated, per the
  author's decision)

Environment: Windows 11, Node v24.11.1, Vitest 1.6.1.

## Test results

- Baseline (task 0.4, before any change): 24 files passed, 7 skipped (31); 311 tests passed, 99
  skipped (462); 54.63 s.
- Targeted, run 1: `tests/unit/index`, 2 files, **39 passed**, 0 failed; 1.67 s.
- Targeted, run 2: 2 files, **39 passed**, 0 failed; 1.60 s. No flakiness.
- Required suite (`npx vitest run`): 26 files passed, 7 skipped (33); **350 passed**, 0 failed,
  99 skipped (501); 48.64 s. Includes `tests/integration/helpers/gate.spec.ts`, which had failed
  while the old sandboxes were present (design D12).
- No-database run (`--exclude 'tests/integration/**'`, no `DATABASE_URL`): 22 files passed (22);
  **324 passed**, 0 failed; 4.32 s. This is the CI `quality` shape.
- Gates:
  - `npm run lint`: 0 errors, 1 warning, pre-existing and untouched
    (`packages/core/src/ports/LlmPort.ts:2:18`, `no-empty-object-type`).
  - `npm run typecheck`: exit 0.
  - `npm run lint:architecture`: 0 errors, the same 4 `no-orphans` warnings as before the change
    (stubs `analyzers/typescript`, `adapters/llm`).
  - `npm run docs:coverage`: exit 0, no warning.
- Notes: Vitest 1.6 accepts a single `--exclude` on the command line; `.stryker-tmp/**` is now
  excluded in `vitest.config.ts` (D12), so a second flag is not needed.

### What the totals are made of

The `Tests` lines Vitest prints, verbatim (colour codes removed):

- Baseline (0.4): `Tests  311 passed | 99 skipped (462)`
- Required suite (6.3): `Tests  350 passed | 99 skipped (501)`

311 + 99 = 410 and 350 + 99 = 449: both totals hold **52 more** tests, which the summary line does not
label. A run with `--reporter=json` (same suite, same state) gives the per-file statuses:

- **99 `skipped`**: `harness.spec.ts` 22, `graph-read.spec.ts` 27, `graph-write.spec.ts` 20,
  `indexes-stale.spec.ts` 13, `migrations.spec.ts` 14, `graph-write-pool.spec.ts` 1, and 2 in
  `simple-git-history.spec.ts` ("git history persistence", "co-change persistence").
- **52 `pending`**: `graph-schema-constraints.spec.ts` 24 and `history-claims-constraints.spec.ts`
  28. These two files nest `describeWithDatabase` blocks inside `describeWithDatabase`, and Vitest 1.6
  reports the tests of the inner skipped blocks as `pending`: it counts them in the total but prints
  no label for them.
- All 151 (99 + 52) are database tests: they sit under `describeWithDatabase` from
  `tests/integration/helpers/db.ts`, which is `describe.skip` when `DATABASE_URL` is unset (the run
  printed `WARNING: DATABASE_URL is not set`).
- The difference between the two runs is 501 − 462 = **39**, exactly the tests this change adds
  (`tests/unit/index/`: 39); passed went from 311 to 350, skipped and pending did not change.

So the "required suite" ran **without a database**, and so did the baseline. Nothing here exercises
PostgreSQL. That is acceptable for this change because it adds no port, adapter, migration or
persistence. The database specs run in CI's `quality` job against its Postgres service (task 8.2).

## Mutation testing

`npx stryker run` over `packages/core/src/**`: **95.56 %** (732/766: 721 killed, 11 timeout,
33 survived, 1 no coverage); threshold `MIN_MUTATION_SCORE=70`.

| File | Score | Killed | Timeout | Survived |
| -- | -- | -- | -- | -- |
| `packages/core/src/index/` (total) | **98.84 %** (256/259) | 249 | 7 | 3 |
| `path-policy.ts` | 94.44 % | 34 | 0 | 2 |
| `secret-scanner.ts` | 99.55 % | 215 | 7 | 1 |

(`audit-event.ts` and `index.ts` hold types and re-exports only: no mutants.)

Survivors in `packages/core/src/index/`, all equivalent:

- `path-policy.ts:42:18`, ConditionalExpression, `rel === ''` → `false`: with `rel === ''` the other
  branch also accepts (`'' !== '..'`, no `../` prefix, `path.isAbsolute('')` is `false`).
- `path-policy.ts:42:26`, StringLiteral, `''` → `"Stryker was here!"`: same reason; `rel === ''` is
  still accepted by the other branch.
- `secret-scanner.ts:122:14`, ArithmeticOperator, `indent + closing.length` → `indent -
  closing.length`: after form a the scan of the closing line restarts at column 0 instead of after the
  closing, but before the closing's end there is only indentation and the closing itself, never a
  `-----BEGIN`, so the claims are the same.

The two `path-policy.ts:42` survivors show that `rel === ''` is redundant: the condition could be
simplified to `rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel)`. The code is
not changed in this change (author's decision).

Earlier runs had survivors first reported as equivalent that were not. The chat summary called them
"4"; the exact count is **5 mutants in 3 places**. Each was killed with an
extra case and the kill confirmed by a forced failure (file backed up, mutated by script, restored and
checked with `cmp`):

1. `secret-scanner.ts:43`, Regex, `PEM_NAME_VALUE` `:\s*\S` → `:\s*\s` (requires whitespace after the
   colon) and `:\s\S` (exactly one space): killed by "a Name: value header may have no space or several
   after the colon" (`Proc-Type:4,ENCRYPTED`, `DEK-Info:  AES-128-CBC,0123`).
2. `secret-scanner.ts:112`, ArithmeticOperator, `from = sameLine + closing.length` → `-`: resuming
   earlier can find a shorter header nested inside a single-line block with a longer label (a duplicate
   event): killed by "a shorter header nested inside a single-line block is not reported again".
3. `secret-scanner.ts:40`, Regex, the JWT lookahead `(?![A-Za-z0-9_-])` → `(?=[A-Za-z0-9_-])` and
   `(?![^A-Za-z0-9_-])`: the regex backtracks one character and leaves the token's last character
   unredacted; no test checked the redacted JWT line. Killed by the content assertions added to "jwt
   needs three segments and no adjacent token character" (`x=<jwt>;` and `x=<jwt>` at end of line).

(Items 1 and 3 hold two mutants each, item 2 one: 5 mutants.) Before those, other meaningful survivors were killed by the extra cases on the marker
text, the `ForbiddenPathError` message, event order by column, spans touching a block, text after a
header, indented body and closing, empty lines in the body run, a `Name: value` that does not start the
line, and inner block lines left and right of the header and closing columns. The `rule` tie-break of
the event order was unreachable (`NoCoverage`) and was removed (design D5).

## Forced failures of task 3.8

Each file backed up to the scratchpad, mutated with a node script whose anchor must match once,
run, restored and confirmed byte-identical with `cmp`:

1. Overlap check dropped in `claimIfFree` (jwt/aws) → "a lower-priority match inside a private key
   block is not reported again" failed. Dropped in `claimHighEntropyValues` → "The fixtures produce no
   false positive" failed (second event in `src/config/env.ts`), as planned.
2. `resolved.startsWith(root)` instead of `path.relative` → "Paths outside the root are forbidden" and
   "a trailing separator on the root changes nothing" failed.
3. Form a searching any later closing → "A header followed by prose redacts only the header", "A
   private key without a closing keeps the following code" and two extra cases failed.

## Privacy and ethics check (task 4.1)

PASS WITH GAPS, two Low findings: the synthetic service-account e-mail of AC3 (ii) (D, accepted);
`ForbiddenPathError.message` carries the requested path, which may contain an OS user name once
DIS-86 logs it (B → DIS-86, in design.md Follow-ups). No secret-shaped literal in the diff, no logging,
environment or file access in core, no dependency change.

## Data state verification

- Pre-test baseline:
  - `git status --porcelain fixtures`: empty
  - `git ls-files -s fixtures | sha1sum`: `b97101fedecb07b21ca67c6156224d81bc13a3e8`
  - Database: no entity impacted (pure functions, no persistence)
- Post-test validation:
  - `git status --porcelain fixtures`: empty
  - `git ls-files -s fixtures | sha1sum`: `b97101fedecb07b21ca67c6156224d81bc13a3e8` (unchanged)
  - `.stryker-tmp/`: absent
- State restored: not needed (no mutation)
- Restoration actions: none

## End-to-end testing (task 8.1)

Not applicable: the change adds pure functions to `packages/core` and no route, CLI command or web
screen uses them yet (the CLI wiring is DIS-86, the API is CM-HU-05b). There is no user workflow to
drive. Task 8.2 (CI evidence) is pending the push.

## Changes outside the plan found during apply

- D11: `stryker.config.json` limits `disableTypeChecks` to `packages/core/src/**/*.ts`. Stryker's
  `// @ts-nocheck` shifted the planted secret of `fixtures/task-api/src/config/env.ts` to line 8.
- D12: `vitest.config.ts` excludes `.stryker-tmp/**`. The sandboxes of failed Stryker runs were
  collected, and `gate.spec.ts` failed.
- D13: `.gitattributes` rule `* text=eol=lf` → `* text=auto eol=lf`. The old rule set `text` to
  `eol=lf`, so no `eol` conversion applied, and CRLF slipped into four edited files.
  `git add --renormalize .` changed no other file. Own commit `4c3b177` (`chore: fix .gitattributes eol
  rule`).

## UI evidence

None: the change has no browser UI.

## Outcome

- Status: PASS
- Blocking issues: none
