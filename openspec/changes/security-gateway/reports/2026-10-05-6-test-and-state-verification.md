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

## CI evidence (task 8.2)

PR [#22](https://github.com/DisTinta/AI4Devs-finalproject/pull/22), head `cb4e6aa`.

- `quality`: [run 37289394636](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/37289394636), pass (4 min 31 s).
  - `npx vitest run` with the Postgres service: `Test Files  33 passed (33)`,
    `Tests  500 passed | 1 skipped (501)`. With `DATABASE_URL` set, the 151 database tests that are
    skipped or pending locally ran here; the only skipped test is the Windows-only one.
  - `tests/unit/index/secret-scanner.spec.ts`: 33 tests, all passed, including "The fixtures produce
    no false positive". `fixtures/task-api/node_modules` does not exist in CI: it is gitignored
    (`fixtures/task-api/.gitignore`), not tracked, and not an npm workspace, so the root `npm ci`
    does not create it.
  - `tests/unit/index/path-policy.spec.ts`: 6 tests, 1 skipped ("A path on another Windows drive is
    forbidden", `it.runIf(process.platform === 'win32')`).
  - Mutation step: 96.61 % for all of core; `index/` 98.84 %, the same 3 survivors
    (`path-policy.ts:42:18`, `:42:26`, `secret-scanner.ts:122:14`). Core moves from the local 95.56 %
    only through timeouts in other modules (20 in CI vs 11 locally); `index/` is identical.
- `frontend`: [run 37289394697](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/37289394697), pass (43 s).

## Fixes after `/adversarial-review` (two Majors, linear time; design D3 correction)

`/adversarial-review` gave PASS WITH GAPS. It reported two Majors: the spec's "linear … including
adversarial input" SHALL was broken. Author decision: fix both in this PR before archiving.

### RED

Four timed cases in `tests/unit/index/secret-scanner.spec.ts`. Each is one line of more than 100k
characters, with every literal built by concatenation. Each test has `{ timeout: 2000 }` and also
asserts `elapsed < 2000 ms`, because Vitest cannot interrupt a synchronous call. Run on the code
before the fix:

| Case | Size | Before the fix |
| -- | -- | -- |
| repeated keywords (`secret`) | 35k repetitions, 210k chars | passed (2 ms): already linear |
| repeated JWT (`eyJa.`) | 100k repetitions, 500k chars | **failed**, 25 880 ms |
| repeated AWS keys | 20k keys, 420k chars | **failed**, 12 460 ms |
| headers without a closing | 20k headers, ~560k chars | **failed**, 15 717 ms |

### GREEN, and a third quadratic path

The first fix followed the review: a per-line interval index for the overlap test, and remembering
the closings not found on a header line. It left the three tests red: 21 863 ms, 11 169 ms and
12 287 ms. The dominant cost was a path the review did not name: the replacement rebuilt the whole
line with `slice` once per claim. With each covered line rendered once from its sorted intervals,
`tests/unit/index` passes 42/42 in 1.76 s.

### Times before and after

Measured with a scratch script in the session scratchpad (not in the repository) on the same inputs:

| Input | Before (review) | Before (this run) | After |
| -- | -- | -- | -- |
| JWT, 50k repetitions (250k chars) | 8.8 s | 9 170 ms | 48 ms |
| JWT, 100k repetitions (500k chars) | 24.1 s | 26 872 ms | 83 ms |
| JWT, 200k repetitions (1M chars) | 75.9 s | — | 154 ms |
| AWS keys, 20k (420k chars) | — | 14 369 ms | 66 ms |
| AWS keys, 40k (840k chars) | — | 36 162 ms | 97 ms |
| Headers without a closing, 16k (448k chars) | 11.2 s | 11 357 ms | 84 ms |
| Headers without a closing, 20k (560k chars) | — | — | 87 ms |
| Repeated keywords, 35k | — | 2 ms | 3 ms |

Doubling the input now roughly doubles the time (JWT: 83 → 154 ms).

### Mutation after the fix

`npx stryker run` (12:27–12:31): **95.39 %** for core (745/781) and **98.18 %** for `index/` (269/274):
`path-policy.ts` 94.44 %, `secret-scanner.ts` 98.74 %.

The first run after the fix left six new survivors in `secret-scanner.ts`. Three were not
equivalent: `:101`, the cache reset when the line changes (`false`, `===`, empty block). A header on
a later line would reuse the "closing not found" set and the body run of an earlier line. They were
killed by "what a header line learned about closings and body is not reused on a later line", with
the kill confirmed by forced failures (mutated, run, restored, checked with `cmp`).

Survivors in `index/` now, all equivalent:

- `path-policy.ts:42:18` and `:42:26`: as above; `rel === ''` is redundant.
- `secret-scanner.ts:97:20`, UnaryOperator, `cachedLine = -1` → `+1`: the first iteration always
  has `lineIndex` 0, so the cache is reset either way.
- `secret-scanner.ts:134:14`, ArithmeticOperator, `indent + closing.length` → `-`: the same survivor
  as before (it was line 122).
- `secret-scanner.ts:263:11`, ConditionalExpression, `column !== Infinity` → `true`:
  `slice(Infinity)` returns `''`, so the rendered line is the same.

### Suite and gates after the fix

- `tests/unit/index`: 43 passed, twice (1.72 s, 1.50 s).
- `npx vitest run`: `Tests  354 passed | 99 skipped (505)`. The 52 unlabelled tests are the same
  pending database tests; the 4 new ones are the timed cases (3) and the cache case (1).
- No-database run: `Tests  328 passed (328)`.
- Gates: lint 0 errors (same pre-existing warning), typecheck exit 0, `lint:architecture` 0 errors
  (same 4 warnings), `docs:coverage` clean.
- Fixtures: `git status --porcelain fixtures` empty, checksum `b97101fe…` (unchanged).
- `openspec validate security-gateway --strict`: valid.

### Other review findings (author decisions, 2026-10-05; no new issue)

- **PEM body test is loose** (question): kept as is. It is documented as a known limitation in
  `docs/project-context.md` and accepted in design.md Risks (D): it over-redacts and never leaks.
- **PGP private key blocks** (question): out of scope, since the ticket excludes secrets outside the
  four rules. `gitleaks` must cover them: one line in the DIS-87 follow-up (design.md Follow-ups).
- **`confinePath` root with spaces** (Minor): handed to DIS-86, which trims `ALLOWED_REPOS_DIR` when
  reading it (design.md Follow-ups, task 9.6).
- **Untimed linearity test** (Minor): fixed by the four timed cases above.

### Process note: the spec was committed after the code

The planning artifacts (`openspec/changes/security-gateway/`) were first committed in `cb4e6aa`,
after the implementation commit `6907905`, so git history cannot show what the spec said before
apply. The spec was changed twice before apply, both through `/opsx:update` at the author's request
(prompts.md §28, Prompt 2): the line model, the UTF-16 column and the adversarial-input clause of the
linearity SHALL. During apply only `design.md` (D5, D7, D11–D13 and this D3 correction), `proposal.md`
(Impact) and `tasks.md` changed; the spec did not. No further action, per the author.
