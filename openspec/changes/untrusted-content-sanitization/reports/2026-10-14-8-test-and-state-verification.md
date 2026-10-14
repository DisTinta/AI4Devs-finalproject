# Test and State Verification Report

- Date: 2026-10-14
- Change: untrusted-content-sanitization (DIS-41)
- Step: 8, Backend: test and state verification (with 6.1, 7.2 and 10.1 recorded here)

## Commands executed

- `npx vitest run` (0.4 baseline, then the required suite; `DATABASE_URL` of the local compose
  database set, so the DB integration tests ran instead of being skipped)
- `npx vitest run tests/unit/explain tests/integration/explain`
- `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- `npx stryker run --mutate "packages/core/src/explain/sanitize.ts,packages/core/src/explain/prompt.ts"`
  (three runs, then `--mutate packages/core/src/explain/prompt.ts` after the last test)
- `SELECT count(*) FROM project` / `claim` / `evidence` before and after

## Test results

- Baseline (0.4): 87 files / 1,173 tests green with `DATABASE_URL`, on an empty database. A first
  run without `DATABASE_URL` skipped the DB specs (71 files passed, 16 skipped); a second, run while
  other Vitest processes were running, had 2 timing failures and was discarded; the clean rerun is
  the baseline.
- Targeted tests (8.2): `tests/unit/explain` + `tests/integration/explain`: 9 files, 92 passed,
  0 failed, 0 skipped (20.6 s).
- Required suite (8.3): **92 files, 1,208 passed, 0 failed, 0 skipped** (141 s) on the database without
  a committed sample project. New: 5 files (`sanitize.spec.ts` 16 tests, `sanitize.linear.spec.ts`
  5, `sanitize.scaling.spec.ts` 3, `explain-sanitization.spec.ts` 10, `prompt.spec.ts` 1), 35 tests.
- Gates: `lint` exit 0; `typecheck` exit 0; `lint:architecture` exit 0 (0 errors, the 3 existing
  `no-orphans` warnings: `packages/web/src/data/sample-projects.ts` and the TypeScript analyzer's
  `src/index.ts` and `dist/index.js`); `docs:coverage` exit 0.
- Notes:
  - **Environment interaction, not caused by this change.** With acme-shop seeded and committed
    (`npm run db:seed`, loaded for step 9 by the author's decision), two full runs failed 3 and 2
    tests outside this change: `tests/integration/index/acme-shop.spec.ts` "A file the analyzer did
    not receive / return creates no project" (`count(*) FROM project` before/after differ) and
    `tests/integration/explain/explain.spec.ts` "A failed write over the database still answers
    without leaking" (`55P03` lock not available). Both files pass when run alone with the seed
    present, and the whole suite passes after deleting the sample project (run above). Those specs
    count or lock rows of a shared database that a committed sample project disturbs when files run
    in parallel. They are untouched by this change; recorded for `design.md` → Follow-ups.
  - The timed and scaling specs printed ratios 1.04 (256 KiB vs 1 MiB, one line), 1.13 (one per line)
    and 4.06 (2,000 vs 8,000 code points, below the cap), all under 8; every call under 2 s.

### TDD evidence

| Task | Red | Green |
| --- | --- | --- |
| 2.1–2.2 patterns | `sanitizeForPrompt is not a function` | `sanitize.ts` |
| 2.3 cut | 7 of 9 failing | `truncate` in `sanitize.ts` |
| 2.4 flags and events | passed at once: behaviour already written in 2.2/2.3 (characterisation) | — |
| 2.5 purity | made to fail by a temporary `Date.now()` in `sanitizeForPrompt` (`now: 2`), then removed | — |
| 2.6 architecture rule | fires on a temporary `node:fs` import (`explain-sanitize-no-io`), then removed | — |
| 2.7 linear time | passed at once | — |
| 3.2 wrapped prompt | text not wrapped | `buildPrompt(sanitized)` (3.3) |
| 3.4 omitted-lines hash | passed at once (the cut of 2.3) | — |
| 4.1 flagged and kept | `events` was `[]` | sanitised spans everywhere, events in the stored answer |
| 4.2–4.6 | passed at once after 3.3/4.1; reverting the prior-claims read and `packSpans` to `pack.spans` fails 4.3 and 4.6 | — |
| 4.7 events first | `no-evidence` events `[]` | events in every `UNKNOWN` and unsaved answer |
| 4.8 no prompt, no event | passed at once (guard) | — |

### Edited existing tests (7.2)

- `tests/unit/explain/explain.spec.ts` "Each span of the pack gets one evidence id in rank order"
  (3.3): the user message now expects the wrapped question and texts, and two `toContain`
  assertions on the new system lines; every other assertion unchanged.
- `tests/unit/explain/explain.spec.ts` "Explaining writes nothing to the console" (7.2): an eighth
  run over a pack whose one span is flagged and cut, with its two event types asserted; no assertion
  removed.
- `tests/unit/explain/explain.spec.ts` helpers moved unchanged to `tests/support/explain-doubles.ts`
  (3.1; 28 tests before and after). `NO_ANCHOR` and `SENTINEL`, used only by the spec, stayed there.
- `tests/support/scripted-llm.ts` (7.3): `PromptView`/`PromptEvidence` gain the optional
  `questionFlags`/`flags` and a comment; scripts match spans by path and lines, none by text.
- Re-run unchanged and green: "The prompt hash covers the whole prompt", the nine scenarios of
  "Precedence and UNKNOWN answers", the five of "Answer with typed statements", "Prior claims show
  their displayed type and stale warning", and the "Persistence failure" scenarios.
- `tests/unit/cli/*` and `tests/integration/cli/*` (7.1): unchanged and green; their stub answers
  carry literal events, and the integration "stderr is empty" checks hold because acme-shop is clean
  (53 files through `sanitizeForPrompt`, no event).

### Mutation testing (8.4)

`MIN_MUTATION_SCORE=70`.

| Run | Score | Killed | Timeout | Survived |
| --- | --- | --- | --- | --- |
| 1 | 93.29 % | 138 | 1 | 10 |
| 2 (machine loaded by Ollama on CPU: 7 timeouts, discarded) | 99.33 % | 141 | 7 | 1 |
| 3 (idle) | 95.30 % (`sanitize.ts` 100 %, `prompt.ts` 86.27 %) | 141 | 1 | 7 |
| 4, `prompt.ts` after `prompt.spec.ts` | `prompt.ts` 98.04 % | 50 | 0 | 1 |

Final, both files: **148 of 149 detected, 99.33 %**.

Survivors and their fate:

- `sanitize.ts` `codePoint > 0xffff` → `>=`: new test "counts U+FFFF as one code unit of one code
  point".
- `sanitize.ts` second gap of the Spanish `ignore-instructions` form `.{0,40}` → `.`, and the
  `system-impersonation` `\s*` after a comment prefix → `\s`: new test "bounds both gaps of the
  Spanish form and allows no or more space after a comment prefix". Each of the three mutants was
  applied by hand and fails its test.
- `prompt.ts` six lines of `EXPLAIN_SYSTEM_PROMPT` that no test pinned (they predate this change):
  new `tests/unit/explain/prompt.spec.ts` pins the exact system message, since every word reaches the
  prompt hash.
- `prompt.ts` `update(…, 'utf8')` → `''`: equivalent (`'utf8'` is the default of `Hash.update`, as
  recorded for DIS-39).

### Privacy and ethics (6.1)

`/privacy-ethics-check` over the diff: **PASS**. Events carry only `type`, `source`, `evidenceId`,
a repository-relative `path`, line numbers and a code of the closed set (`sanitize.ts`, the event
literals of `sanitizeForPrompt`); the explain core has no `console`, logger or `process.env`, and
`sanitize.ts`/`prompt.ts` throw nothing; no PII or secret shapes in the diff; no dependency added.
Low, accepted: the paths reach stderr through the CLI, as `secret_redacted` events already do.

## Data state verification

- Pre-test baseline (0.4): `project` 0, `claim` 0, `evidence` 0. Integration tests run in
  rolled-back transactions.
- Post-test validation (8.5): `project` 0 / `claim` 0 / `evidence` 0 after the suites; step 9 then
  seeded acme-shop by the author's decision, so the state left is `project` 1 (acme-shop) / `claim` 0
  / `evidence` 0, the step-9 baseline (see the step 9 report).
- No `.stryker-tmp/` left after any Stryker run.
- State restored: Yes (to the 0.4 baseline for the suites; to the author-chosen step-9 baseline at the
  end).
- Restoration actions: the sample project was deleted once to confirm the environment interaction
  above, then reseeded (`1 project loaded`).

## UI evidence (if applicable)

- None: the change has no browser UI and no new interface; the terminal is the client and step 9
  drives it end to end (10.1: "not applicable beyond step 9").
- The CI run of the PR (10.2) is linked here after the push.

## Outcome

- Status: PASS
- Blocking issues: none. Follow-up candidate: the two integration specs that fail beside a committed
  sample project (see Notes).

## Addendum: CI (10.2) and the pre-merge review fixes (13.3)

- **CI (10.2).** PR #39, run `38581960328`
  (https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/38581960328): `quality` passed in
  16 min 12 s; Vitest 92 files, 1,207 passed and 1 skipped (`tests/unit/index/path-policy.spec.ts`,
  platform-specific, existing), with `explain-sanitization.spec.ts` (10), `sanitize.spec.ts` (16),
  `sanitize.scaling.spec.ts` (3), `sanitize.linear.spec.ts` (5) and `prompt.spec.ts` (1) all passed.
  `frontend`, `scope` and `secrets` passed.
- **Fixes** (each with its destination in `design.md` → Follow-ups): patterns on the path and its
  neutralisation; `\r`, U+2028 and U+2029 split lines for matching; forged `[TRUNCATED:` neutralised;
  the three scenario tests also assert the stored evidence rows (storing `span.text + 'x'` in
  `claim-items.ts` fails all three, checked by hand); the console test holds a flagged span and a
  separate cut span; the spec states U1–U4. RED observed for the new behaviour: line separators
  (`expected [] to deeply equal ['system-impersonation']`), path flags (`['ignore-instructions']` vs
  two codes), path and forged-mark neutralisation (both prompt tests failed first).
- **Shared-database specs** (author's decision: fixed in this PR): `acme-shop.spec.ts` counts its own
  project name; the explain trigger test waits up to 60 s for the lock; `graph-read.spec.ts` "Listing
  with no project returns an empty list" runs in its own REPEATABLE READ transaction, retried on
  `40001`.
- **Required suite after the fixes:** with acme-shop seeded and committed, 92 files / 1,212 passed in
  three full runs (one more run failed `graph-read` before its retry was added, `40001`, then fixed).
  `lint`, `typecheck`, `lint:architecture` (3 existing warnings) and `docs:coverage` exit 0.
- **Mutation after the fixes:** 98.85 % (171 killed, 1 timeout, 2 survived:
  `prompt.ts` `'utf8'` → `''` and `sanitize.ts` `'u'` → `''` on `LINE_SEPARATORS`, both equivalent).
  `prompt.ts` 98.25 %, `sanitize.ts` 99.15 %. No `.stryker-tmp/` left.
- **State:** `project` 1 (acme-shop) / `claim` 0 / `evidence` 0, as left by step 9.
- **Second round** (after the re-runs of the two reviews): whole-line-or-part matching, the other
  Unicode line breaks, and two new tests (unneutralised answer and store path; a marker split by a
  line break). Required suite with acme-shop seeded: **92 files, 1,215 passed**; gates exit 0;
  mutation **98.86 %** (172 killed, 1 timeout, the same 2 equivalent survivors). State 1 / 0 / 0. The
  CI run of the final commit is linked below once it passes.
