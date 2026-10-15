# Test and State Verification Report

- Date: 2026-10-15
- Change: evidence-verifier-semantic (DIS-70)
- Step: 10 — Run Tests and Verify Data State

## Commands executed

- `npx vitest run` (baseline, step 0.4, with and without `DATABASE_URL` set to the local compose database)
- `npx vitest run tests/unit/verify tests/unit/explain tests/unit/cli/ask-command.spec.ts tests/integration/explain tests/integration/cli/ask-command.spec.ts`
- `npx vitest run`
- `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- `npm run test:mutation -- --mutate "packages/core/src/verify/**/*.ts"` (twice: before and after the survivor tests)
- A read-only `pg` client counting `project`, `claim`, `evidence` and `evidence` by `verification` (before and after)

## Test results

- Baseline (before any change): 96 files, 1246 tests passed, 0 failed, 0 skipped with `DATABASE_URL`
  set (without it: 80 files and 1024 tests passed, 16 files and 170 tests skipped, the DB suites).
- Targeted tests: 17 files, 198 passed, 0 failed, 0 skipped (26.2 s).
- Required suite: 98 files, 1276 tests passed, 0 failed, 0 skipped (145.9 s), `DATABASE_URL` set.
- Gates: `lint` clean; `typecheck` clean; `lint:architecture` 0 errors (the 3 `no-orphans` warnings,
  `packages/web/src/data/sample-projects.ts` and `packages/analyzers/typescript/{src,dist}/index.js`,
  exist on the base branch too); `docs:coverage` clean.
- Scenario mapping (8.4): each of the 62 `#### Scenario:` titles of the four delta specs has exactly
  one test of the same name under `tests/`.
- Notes, TDD order:
  - RED seen before GREEN for 3.1, 4.2, 4.5, 4.6, 4.8, 4.9, 5.1, 5.5, 6.2 and 7.1.
  - Green on arrival, recorded honestly as characterisation tests:
    - 4.4 "The verifier receives only the wrapped statement and excerpt" (the prompt was written in 3.3);
    - 4.7 "Other verifier failures propagate" (the `catch` of 4.6 rethrows anything else);
    - 4.10 "A cached pair is not verified again", "A changed statement or excerpt misses the cache" and
      4.11 "The cache holds no text" (dedup, cache and key of 3.3 and 4.3);
    - 5.3 "An entailed heuristic statement stays an inference", "No statement is dropped for a cited
      citation" (the `applyEntailment` of 5.2);
    - 6.4–6.10, the new scenarios of `tests/unit/explain/explain-verification.spec.ts` (6.3 wired the
      verdicts, usage and events of `verifyAnswer` end to end in one step);
    - 7.2 "An unverified entailment is logged as information" (the level rule was already `info` for
      every type but `evidence_broken`).
    Stryker (below) checks that these tests are not empty.

## Existing tests edited (8.2), each because the spec changed

- `tests/unit/explain/explain.spec.ts`:
  - "An answer written after a re-index is stored stale": verification `cited` → `entailed`, rows
    `entailed`, requests `answer`, `verify`, `verify`.
  - "A failed write still answers, unsaved and without leaking": verification `cited` → `entailed`,
    one `answer` and three `verify` requests.
  - "A discarded model output is unknown and carries its event", "An output without statements is
    unknown with no evidence": the model received only the `answer` request (no `verify`).
  - "Model failures propagate without writing": the failure is the one of the `answer` call (only that request).
  - "Explaining writes nothing to the console": one more run, a verifier that answers `yes`, checked to
    carry its `entailment_unverified` event (appended last, so no other index moved).
  - "The subject of a claim is the symbol of its first cited span": `toClaimItems` takes
    `evidenceVerifications`; the per-span verification is asserted for both claims.
  - "Prior claims show their displayed type and stale warning": its `order` gains `'verify'` before
    `'saveClaims'` (a test-double change, design S10, not a spec change).
  - Non-scenario tests: "builds the pack with the hops and budget of the request" (`sentSpans` reads
    only the `answer` requests) and "stores each statement as an L2 inference that keeps its statement
    type" (`cited` → `entailed`).
- `tests/unit/explain/explain-verification.spec.ts`:
  - "Cited spans are verified in one read at the pack's commit" and "An unsaved answer keeps only its
    verified citations": `cited` → `entailed` (statements and rows).
  - "A broken citation is neither stored nor shown": exactly two `verify` requests, (S1, `E1`) and
    (S2, `E1`), none naming `E3`'s span.
  - "Every citation broken is unknown with broken evidence": no `usage` and only the `answer` request.
  - "Evidence broken events follow the sanitisation events and carry no content": not edited; the
    default verifier entails, so its events are unchanged.
- `tests/unit/verify/verify-answer.spec.ts` (5.5): the five existing tests take the new
  `verifyAnswer({ source, llm, cache }, …)` signature; the first one asserts the verified statements
  (`entailed`, `evidenceVerifications`) and `usage` (3 calls).
- `tests/integration/explain/explain.spec.ts`: the helper `explainQ1` and "A failed write over the
  database still answers without leaking" pass `verificationCache`; requests become `answer`, `verify`,
  `verify` (and `answer`, `verify`); "An answer with evidence is typed, stored and returned" expects
  3 requests and rows `entailed`.
- `tests/integration/cli/ask-command.spec.ts`: "A typed answer is printed with its evidence and stored"
  expects `answer`, `verify`, `verify` and its two new `evidence` rows `entailed`; "answers through the
  default pool without holding a transaction while the model answers" counts only `answer` calls.
- `tests/unit/cli/ask-command.spec.ts`: the helpers `answered()` (gains a zero `usage`) and
  `statement()` (`verification: 'entailed'` for its `FACT`), and "resolves a sample's relative root path
  against the repository root" (counts only `answer` requests).
- Doubles: `tests/support/scripted-llm.ts` (the `verify` route, usage and model options) and
  `tests/support/explain-doubles.ts` (`verificationCache` in `deps`, options forwarded).

## Mutation testing (10.4)

- First run: `packages/core/src/verify/` 94.12 % (288 killed, 18 survived), whole incremental report
  95.51 %, over the break threshold 80.
- Survivors with a meaning, closed with tests:
  - `verification-cache.ts:66` (`entries.has(key)` → `false`) and `:59` (`entails !== undefined` →
    `true`): re-storing the most recently used key evicted another one, and a missed read took a slot.
    The eviction scenario now re-stores the newest key too, and the extra test "a missed read takes no
    slot" was added; `:52` (empty `RangeError` message): the scenario checks the message names `maxEntries`.
  - `verify-prompt.ts:52` (`''` → a text after an uncut excerpt): extra test "sends the excerpt of an
    uncut span with nothing after it".
  - `verify-prompt.ts:12–18` (each line of `VERIFY_SYSTEM_PROMPT` and its `join`): the scenario "The
    verifier receives only the wrapped statement and excerpt" now pins the exact prompt of design S4.
- Second run: `verify/` 95.42 % (292 killed, 14 survived), whole report 95.61 %.
  - The five `verify-prompt.ts:12–18` mutants still show as survived with "Ran all tests for this
    mutant": they are static mutants (a module-level constant), which the Vitest runner does not
    re-import per mutant. Applied by hand (first line emptied), the pinned test fails; restored after.
  - Equivalent: `semantic.ts:114` and `verification-cache.ts:38` (`'utf8'` → `''`, the same default
    encoding), `semantic.ts:118` (`catch {}`: `safeParse(undefined)` fails the same way),
    `verify-answer.ts:83` (`kept.length === 0` → `false`: an empty pair list makes no call and zero
    usage anyway) and `verify-answer.ts:92` (`'entailed' ||` → `false`: an `entailed` verdict has no
    `reason`; the condition is there for type narrowing).
  - `syntactic.ts:93` (two) and `:115`: unchanged code of DIS-68, out of this change's scope.
- No `.stryker-tmp/` left.

## Privacy and ethics check (10.5)

- Verdict: PASS. Surfaces: AI context (the verifier's prompt) and logging (the events).
- No `package.json` or lockfile change; no email, `Authorization`, API key, `sk-…` or password in the
  added lines of `packages/` and `tests/`; no `console.*` added under `packages/`.
- The verifier receives only `{ statement, evidence: { path, startLine, endLine, text } }`, the
  statement and the excerpt wrapped and neutralised and the path neutralised: not the question, the
  answer or another statement or span (pinned by "The verifier receives only the wrapped statement and
  excerpt").
- `entailment_unverified` carries `statementIndex`, `evidenceId`, path, lines and a closed-set reason
  (pinned with two sentinels by "Entailment unverified events follow the evidence broken events and
  carry no content"); the cache holds a SHA-256 key and a boolean ("The cache holds no text"); `usage`
  holds counters only. Fixtures are synthetic (acme-shop sample, sentinels).
- Not assessed: the retention terms of whatever endpoint `LLM_MODEL_VERIFY` names (a deployment
  choice; the demo uses a local Ollama).

## End-to-end and CI (12.1, 12.2)

- 12.1: not applicable beyond step 11. The change has no browser UI; the terminal is the client and
  step 11 drives `ask` end to end.
- 12.2: CI runs on `pull_request`, so the evidence that the new spec files ran and passed in CI, and
  that the mutation job is ≥ 80, is collected in 15.3 once the PR exists, as an addendum here.

## Data state verification

- Pre-test baseline:
  - `project`: 1 (acme-shop)
  - `claim`: 0
  - `evidence`: 0 (no `verification` group)
- Post-test validation (after steps 10 and 11):
  - `project`: 1
  - `claim`: 0
  - `evidence`: 0
- State restored: Yes
- Restoration actions: integration tests run in rolled-back transactions; the 10 claims of the step 11
  runs were deleted (see the step 11 report).

## UI evidence (if applicable)

- (none: the change has no browser UI)

## Outcome

- Status: PASS
- Blocking issues: none

## Addendum — CI of PR #42 (15.3)

- Run: https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/38749021316 (commit `aef2698`):
  `quality`, `mutation`, `scope`, `secrets` and `frontend` pass.
- `quality`: 98 test files passed, 1275 tests passed and 1 skipped (1276); the skipped one is in
  `tests/unit/index/path-policy.spec.ts`, a platform-dependent test that exists on the base branch. The
  new spec files ran and passed: `tests/unit/verify/semantic.spec.ts` (10 tests) and
  `tests/unit/verify/verification-cache.spec.ts` (4 tests).
- `mutation`: final score 95.81 (break threshold 80); `verify/` 97.06 (297 killed, 9 survived):
  `policy.ts` 100, `semantic.ts` 96.97, `syntactic.ts` 97.06, `verification-cache.ts` 96.30,
  `verify-answer.ts` 94.92, `verify-prompt.ts` 100. In CI the five static mutants of
  `VERIFY_SYSTEM_PROMPT` that survived locally are killed, as the manual check predicted; the 9
  survivors left are the equivalent and DIS-68 ones listed above.

## Addendum — pre-merge fixes (15.4)

- Tests strengthened, no production code changed: `tests/unit/cli/ask-command.spec.ts` "Explain receives
  a new verification cache per run" (default bound); `tests/integration/cli/ask-command.spec.ts`
  "answers through the default pool without holding a transaction while the model answers" (samples the
  `answer` and the `verify` call: `answer`, `verify`, no transaction in either); `tests/unit/verify/
  semantic.spec.ts` "A changed statement or excerpt misses the cache" (path, first line, truncation mark);
  `tests/unit/verify/verify-answer.spec.ts` pair order (one cut pair asserted literally).
- Re-run: `npx vitest run` 98 files, 1276 tests passed (`DATABASE_URL` set); `lint`, `typecheck`,
  `lint:architecture` (0 errors, the same 3 warnings), `docs:coverage` clean.
- Spec attestation (adversarial-review Question): the four delta specs were last written at 12:26–12:50
  on 2026-10-15, before the apply's first RED (3.1); the only later edit is the A fixes of 15.4 to
  `specs/evidence-verification/spec.md` (U1, U3, U4 and the self-verification note), made after
  every test of this change was green and without changing a scenario.
