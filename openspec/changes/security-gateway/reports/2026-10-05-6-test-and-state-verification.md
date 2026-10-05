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

## Second linearity cycle (second `/adversarial-review`: FAIL, one Blocker)

The second review found the first fix incomplete:

- **Blocker:** the closing cache keyed on the exact closing text, so headers with distinct labels
  stayed quadratic.
- **Major:** the timed header test repeated one label, the only case the cache covered.
- **Minor:** `splice` insertion was quadratic when a later rule lands between an earlier rule's
  claims.

Tasks 10.1 and 10.3 were unticked. Author decision: fix all three in this PR, with no issue.

### RED (code before this cycle)

| Timed case (one line) | Size | Time |
| -- | -- | -- |
| 20k headers, distinct labels, no closing | 641k chars | **failed**, 4 786 ms |
| Same, closed once at the end (label of header 10 000) | 641k chars | **failed**, 3 472 ms |
| JWT and AWS keys alternating | 5.1 MB | **failed**, 12 242 ms |

### GREEN

The code changed in two steps:

1. A `ClosingIndex` per header line (one scan, one pointer per label) and a `LinePass` per rule and
   line (forward-only pointer, linear merge, no `splice`).
2. Intervals became the only record of a claim. There is no claim array and no final sort, and one
   walk over the lines rebuilds the text and emits the events.

The AC1–AC3 tests were not touched and pass. Design D3 has the full correction.

### Scaling (median of 5, default garbage collector)

| Case | n | 2n | 4n | Ratios |
| -- | -- | -- | -- | -- |
| Headers, distinct labels (20k / 40k / 80k) | 38.8 ms | 70.5 ms | 160.3 ms | 1.82, 2.27 |
| Distinct labels, closed once at the end | 28.4 ms | 52.8 ms | 100.0 ms | 1.86, 1.89 |
| JWT/AWS alternating (5.1 / 10.2 / 20.4 MB) | 420.3 ms | 675.5 ms | 1 558.1 ms | 1.61, 2.31 |
| JWT (100k / 200k / 400k) | 43.8 ms | 72.5 ms | 132.5 ms | 1.65, 1.83 |
| AWS keys (20k / 40k / 80k) | 21.0 ms | 33.7 ms | 69.3 ms | 1.61, 2.06 |
| Identical headers (20k / 40k / 80k) | 34.4 ms | 52.5 ms | 117.6 ms | 1.53, 2.24 |
| Repeated keywords (35k / 70k / 140k) | 0.9 ms | 1.3 ms | 2.7 ms | 1.49, 2.11 |

Every ratio is 2.31 or less: the first exit criterion. Before step 2 (with the sort in place), the
alternating case gave 317 / 675 / 2 210 ms (ratio 3.27 at the last step), and 1.38 with the V8 young
generation raised to 128 MB. Recorded in D3. A first single-run measurement of AWS keys gave 2.58;
over 7 runs the median ratios were 1.44 to 1.80, so it was noise.

### Stryker and the timed tests (design D14)

The first full run after the fix failed its dry run. Under instrumentation and 15 parallel runners,
the 5.1 MB alternating case took 2 517 ms against its 2 s budget (about 420 ms outside Stryker). The
seven timed cases moved, unchanged and byte-identical, to
`tests/unit/index/secret-scanner.linear.spec.ts`, which `vitest.stryker.config.ts` now excludes.

- Resolved excludes, printed from both configs:
  - base: `["fixtures/**","node_modules/**",".stryker-tmp/**"]`;
  - Stryker: the same three plus `"tests/integration/**"` and the linear spec.
- `npx vitest run tests/unit/index` runs 3 files (49 tests); with the Stryker config it runs 2 files.

Final `npx stryker run` (13:35–13:39): **95.18 %** for core (809/850) and **95.63 %** for `index/`
(328/343): `path-policy.ts` 94.44 %, `secret-scanner.ts` 95.77 %. The first run without the timed
tests had 22 survivors in `index/`. They fall into three groups.

**Equivalent (14):**

- `path-policy.ts:42:18` and `:42:26`: `rel === ''` is redundant (as before).
- `secret-scanner.ts:89:20`, `cachedLine = -1` → `+1`: the first iteration has `lineIndex` 0, so
  the caches are reset either way.
- `:125:14`, `indent + closing.length` → `-`: the closing line is re-scanned from 0, and before the
  closing's end there is only indent and the closing itself.
- `:165:12`, `index < list.length` → `true` and `<=`: `list[length]` is `undefined`, and
  `undefined < from` is `false`, so the loop stops at the same index.
- `:261:19`, `new Array(lineCount)` → `new Array()`: assigning by index grows the array, and reads of
  missing lines give `undefined` either way.
- `:287:25`, `index < lines.length` → `<=`: `byLine[lines.length]` is `undefined`, so the extra
  iteration does nothing.
- `:301:11`, `column !== Infinity` → `true`: `slice(Infinity)` is `''`.
- `:330:34`, `last.from < end` → `true` and `<=`: the accepted intervals of a pass start before every
  later candidate's end, so the clause is always true.
- `:330:53`, `last.to > start` → `>=`: a candidate never starts exactly where the previous accepted
  span ends. A span ends at a quote or a token boundary, never at the start of a run or a match.
- `:340:9`, `accepted.length === 0` → `false`: merging with an empty list copies the same intervals
  (still linear).
- `:350:52`, `<` → `<=` in the merge: the two lists are disjoint with non-empty intervals, so two
  `from` values are never equal.

**Only observable in time (1)**, covered by the linear spec outside Stryker:

- `secret-scanner.ts:93:9`, `cachedLine !== lineIndex` → `true`: the closing index and the body run
  are rebuilt for every header. The result is the same, but the cost is quadratic. Forced failure:
  `secret-scanner.spec.ts` passed 36/36, and `secret-scanner.linear.spec.ts` failed 3 of 7 (distinct
  labels, distinct labels closed once, and headers without a closing).

**Functional (7)**, each killed by a new case and confirmed by a forced failure (mutate, run, restore,
`cmp`):

- `:165:35`, `<` → `<=`: a closing that starts right at the header's end is missed. Killed by "a
  closing right after its header on the same line closes it".
- `:167:12`, `true` and `<=`, and `:167:49`, `-1` → `+1` (was NoCoverage): a closing earlier on the
  line than the header was taken as found. Covered by "a closing earlier on the line does not close a
  later header"; the mutants loop until the worker runs out of memory, so the run fails.
- `:329:32`, `length - 1` → `+ 1`, `:330:12`, `false`, and `:330:34`, `>=`: without the same-pass
  check, a key-like run inside a redacted value starts a second `generic-high-entropy` match. Killed
  by "a key-like run inside a redacted value does not start a second generic match".

### Suite and gates after this cycle

- `tests/unit/index`: 3 files, **49 passed**, twice (3.81 s, 1.81 s).
- `npx vitest run`: `Tests  360 passed | 99 skipped (511)` (27 files passed, 7 skipped). The 52
  unlabelled tests are the same pending database tests.
- No-database run: `Tests  334 passed (334)` (23 files).
- Gates: lint 0 errors (same pre-existing warning), typecheck exit 0, `lint:architecture` 0 errors
  (same 4 warnings), `docs:coverage` clean, `openspec validate --strict` valid.
- Fixtures: `git status --porcelain fixtures` empty, checksum `b97101fe…` (unchanged).

### CI evidence for this cycle

PR #22, head `31ba78c`: `quality` [run 37304673799](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/37304673799) and `frontend` [run 37304673808](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/37304673808), both green.

- `secret-scanner.spec.ts` 36 tests (77 ms), `secret-scanner.linear.spec.ts` 7 tests (407 ms for the
  whole file), `path-policy.spec.ts` 6 tests with the Windows-only one skipped;
  `Tests  510 passed | 1 skipped (511)`.
- The 5.1 MB alternating case took at most **407 ms** on the GitHub runner. The default reporter
  prints only per-file times, and that file holds all seven timed cases, so 407 ms is an upper
  bound against the 2 s budget. Locally the case takes about 420 ms.
- Mutation step in CI: 95.41 % for core; `index/` 95.63 %, the same 15 survivors as locally.

## Third `/adversarial-review` (linear time only, HEAD `31ba78c`): PASS WITH GAPS

Verbatim output of the review, with heading levels lowered by one so it nests under this section:

### Adversarial review: linear-time clause of `redactSecrets` (HEAD 31ba78c, `feature/DIS-84-security-gateway`)

I could not refute the linear-time claim. All 63 adversarial shapes I tried scale linearly, both on one line and across many lines. The gaps I did find are in how the requirement is specified and tested, not in the code.

**How I measured.** I ran the real `C:/Users/cristina/Desktop/AI4Dev/00-TFM/Codemind/packages/core/src/index/secret-scanner.ts` (the working tree matches 31ba78c) under Node 24 with in-memory input fed via stdin. No files were written. I built every secret-shaped literal by concatenation. For each case I grew the input until one call took at least 15–40 ms, then took the median time at n, 2n, 4n (and 8n for re-runs).

**How to read the ratios.** I took "a ratio near 4 is a failure" to mean the time ratio for each doubling of the input. Linear code gives about 2; quadratic code gives about 4. Over a 4x span, linear gives about 4 and quadratic about 16.

**Control.** I checked that this setup can actually see quadratic growth. Running the literal spec regex from the code comment (lines 46–47) on `("tok"+"en").repeat(k)` gave doubling ratios of 4.14, 3.61 and 4.45. So it does.

#### Results (doubling ratios t(2n)/t(n), t(4n)/t(2n))
| Rule | Cases tried | Ratios seen |
|---|---|---|
| private-key a | blocks repeated over many lines; closing with the wrong indent or wrong label | 1.59–2.15 |
| private-key b | header-only lines; body with no closing; body of name-value lines with blank lines in between; `a: <header>` lines (body lines that are also header lines); a header line followed by thousands of body lines | 1.70–2.38 |
| private-key c | header and closing pairs on one line; closing before header; many headers then all closings | 1.73–2.00 |
| private-key header/closing regexes | 20k distinct labels on one line; one label repeated; long label with no `PRIVATE KEY` after it; `BEGIN`/`END` with no trailing dashes; 5M dashes; long `END` labels | 1.50–2.26 |
| jwt | `eyJ` followed by a long run with no dot; `.eyJa` chains; two-segment repeats; long seg1 and seg2 with no seg3; a class character right after a token; valid tokens repeated | 1.35–2.41 (one 2.93 at a tiny n; 2.05/1.86/1.94 on re-run at 16x the size) |
| aws-access-key-id | `AKIA` repeated; `AKIA` followed by a long run; ASIA/AKIA nested; valid keys repeated | 1.50–2.37 |
| generic-high-entropy | keyword run repeated; keyword followed by 10M spaces or quotes; `token=` chains; unterminated value; mismatched closing quote; `token' = '` chain; values made of keywords; long low-entropy values; `=>` / `api_key` forms; valid matches repeated; CRLF lines | 1.30–2.40 |
| Combinations | all rules on one line (with and without a closing); all rules across many lines with CRLF; jwt, aws and generic inside a PEM body; overlapping claims; rules packed together with no separators | 1.41–2.24 |

I also read the code and found no hidden quadratic step. The private-key loop runs `bodyRunAndIndent` once per header line, and every long body run is either claimed or ends in a closing, so the loop jumps past it (lines 119–130). `ClosingIndex` pointers only move forward. A `generic-high-entropy` value cannot contain a quote, so the assigned-value check after each keyword reads a separate stretch of text. `LinePass` and `mergeCovered` are each a single pass.

#### Findings
| Severity | File:line | Finding | Why it matters |
|---|---|---|---|
| Minor | `openspec/changes/security-gateway/specs/security-gateway/spec.md:36` | The linear-time clause is a SHALL with no scenario of its own. A search for a linear, adversarial or long scenario finds nothing. | Axis 1: a requirement with no scenario. `secret-scanner.linear.spec.ts` points back to the requirement text, not to a scenario. |
| Minor | `tests/unit/index/secret-scanner.linear.spec.ts:13-79` | The tests check a fixed 2000 ms limit on one size each. They do not compare times as the input grows. | A slowdown that is quadratic but has a small constant, or only shows at sizes larger than these, still passes. The tests do catch a revert to the literal spec regex (the comment on lines 10–12 says that version took more than 10 s). They would not catch, for example, dropping the per-line cache (`run ??=`, line 119) on inputs whose body runs are short. |
| Minor | `tests/unit/index/secret-scanner.linear.spec.ts` (whole file) | Every timed case is a single line. There is no multi-line case (private-key b body runs, name-value body lines, case a jumping lines), no `generic-high-entropy` case with real matches (the keyword case at line 21 yields 0 events), and no case with all four rules together. | The multi-line paths (`bodyRunEnd`, `Claims.add` across lines, lines 172–191 and 265–271) have no timing test. They are linear today (ratios 1.70–2.38 above), but a regression there would go unnoticed. |

#### Verdict
**PASS WITH GAPS.** No Blockers or Majors. My measurements back the linear-time clause, but the existing tests and spec do not fully pin it down.

#### Recommended next steps before archiving
1. Add a scenario under "Secret redaction" for the linear-time clause and point `secret-scanner.linear.spec.ts` at it. (Fix in this change; if deferred: **A**, process debt.)
2. Make at least one timed test compare sizes, for example assert t(4n)/t(n) < 8 with a median of a few runs. Also add one multi-line case (a header followed by many body or name-value lines) and one all-rules case. (Fix in this change, or **C**: one Linear debt issue that groups the two test-gap Minors.)
3. Keep the 2 s limit as a backstop: it is what catches a revert to the literal regex.

## Third cycle: the third review's gaps (author decision 2026-10-05, same PR, no issue)

1. **Scenario.** `/opsx:update` added "Redaction time grows linearly on adversarial lines" under
   "Secret redaction". It covers the same input families as the linear spec, and the spec now has 12
   scenarios. The test is the `describe` block of that name in `secret-scanner.linear.spec.ts`
   (grep count 1), and design D9 records the mapping. DIS-84 has a Spanish comment explaining the
   change. `openspec validate --strict` is valid.
2. **Scaling check.** "four times the input takes less than eight times as long": on the four-rules
   line, the median of 3 runs at 10k units (980k chars, about 113–129 ms locally) is compared with the
   median at 40k units (3.9 MB), after a warm-up, with `t(4n)/t(n) < 8`. The 2 s budget stays as a
   backstop. Locally the ratio was 3.35 (linear is about 4). Forced failures, each file backed up,
   mutated by script, restored and checked with `cmp`:
   - `cachedLine !== lineIndex` → `true`: ratio **16.98**, failed;
   - the linear merge replaced by a splice insertion: ratio **16.97**, failed.
3. **Two more timed cases.**
   - Many lines: one header over 40k PEM body lines (base64 alternating with `Proc-Type: …`), a plain
     line, then 10k consecutive form a blocks (3 MB, 10 001 events).
   - One line of 40k units alternating JWT, AWS key, a real `generic-high-entropy` assignment and a
     header without a closing (3.9 MB, 160 000 events).

   Both are linear: medians of 5 gave 99.8 / 178.4 / 398.5 ms for the multi-line case at n / 2n / 4n
   (ratios 1.79, 2.23), and 129.3 / 229.6 ms for the four-rules line at n / 2n (ratio 1.78). So
   `secret-scanner.ts` was not touched (empty diff) and Stryker was not re-run: the last score,
   95.18 % for core and 95.63 % for `index/`, still applies.

After this cycle:

- `tests/unit/index`: 3 files, **52 passed**, twice (4.72 s, 4.37 s). The linear spec ran 3 more
  times on its own, 10/10 each time.
- `npx vitest run`: `Tests  363 passed | 99 skipped (514)`.
- No-database run: `Tests  337 passed (337)`.
- Gates: lint 0 errors (same warning), typecheck exit 0, `lint:architecture` 0 errors (same 4
  warnings), `docs:coverage` clean.
- Fixtures: unchanged (`b97101fe…`).
