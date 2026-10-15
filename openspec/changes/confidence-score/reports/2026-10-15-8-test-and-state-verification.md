# Test and State Verification Report

- Date: 2026-10-15
- Change: confidence-score
- Step: 8, run tests and verify data state (with the records tasks 1.4, 2.3, 3.4, 5.2, 11.1 and 11.2
  ask for)

## Commands executed

- `npx vitest run` (with `.env` loaded, so the database suites run), before the change (task 0.4) and after
- `npx vitest run tests/unit/knowledge tests/unit/explain tests/unit/cli/ask-command.spec.ts tests/integration/explain`
- `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- `npm run test:mutation -- --mutate "packages/core/src/knowledge/confidence.ts"`
- `npm run seed:build`, then `npx vitest run tests/unit/cli/seed-build.spec.ts tests/unit/cli/seed-load.spec.ts tests/integration/cli/seed-build.spec.ts`
- `SELECT count(*) FROM project` / `claim` / `evidence` in the local database (before and after)

## Test results

- Baseline (task 0.4): 98 files, 1276 tests passed, 0 failed, 0 skipped (146 s). Without
  `DATABASE_URL` the same run skips 16 files / 170 tests; every run below loads `.env`.
- Targeted tests: 23 files, 307 passed, 0 failed, 0 skipped.
- Required suite: 100 files, 1292 passed, 0 failed, 0 skipped (16 new tests: 11 in
  `confidence.spec.ts`, 2 in `confidence-doc.spec.ts`, 3 in `explain-verification.spec.ts`).
- Gates: `lint` clean; `typecheck` clean; `lint:architecture` 0 errors (3 `no-orphans` warnings, all
  pre-existing and outside this change: `packages/web/src/data/sample-projects.ts`,
  `packages/analyzers/typescript/src/index.ts`, `packages/analyzers/typescript/dist/index.js`);
  `docs:coverage` clean. `grep -nE "from '\.\./(explain|context)/" packages/core/src/knowledge/confidence.ts`
  prints nothing.
- Mutation (task 8.4): `confidence.ts` 97.06 % (66 killed, 2 survived), above the break threshold 80;
  global run 95.64 %. Both survivors are `StringLiteral` mutants of the `RangeError` messages (lines
  93 and 95): the spec fixes the error class, not its message, so they are not meaningful and no test
  was added.
- Seed (task 7.1): `git status --porcelain fixtures` and `git clean -ndX fixtures/acme-shop` printed
  nothing; `seed:build` changed only the `analyzer-fingerprint` line of `seeds/graph-dump.sql`
  (`9e9f7966…` → `143d8452…`); the seed tests passed (42).

### TDD record

- 1.1 RED (`confidenceSignals is not a function`) → 1.2 GREEN.
- 1.3 "Config counts as code and an unresolved origin lowers resolution" and 1.4 "A cited citation
  backs nothing": characterisation tests, green at once, because 1.2 implemented every signal.
- 1.5 RED (no `RangeError`) → GREEN.
- 2.1 RED (`confidence is not a function`) → 2.2 GREEN.
- 2.3: the six scenarios ("The value is reproducible and independent of order", "A citation left
  cited lowers the value", "A contradiction lowers the value", "Exact resolution beats heuristic
  resolution", "Evidence saturates and never lowers the value", "A set with no signal is worth one
  half") are characterisation tests, green at once.
- 3.1 RED (empty weights table on the placeholder) → 3.2 GREEN. 3.3 "The confidence document states
  its limits" RED against the placeholder document, GREEN against the real one.
- 3.4 bite check: `diversity` 0.5 → 0.6 in the code only fails with `expected 0.5 to be 0.6`; in the
  document only, with `expected 0.6 to be 0.5`; both reverted (no `0.6` left in either file).
- 4.1 "An answer carries the confidence of its statements" and 4.3 "The confidence follows the
  verifier's verdicts", written together, RED (`expected undefined to be …`) before 4.2, GREEN after.
- 4.4 "An unknown answer has no confidence": characterisation test, green at once (`UnknownExplain`
  never had the field).
- 6.1 refactor: in `explain.ts` the `storedAnswer` / `unsavedAnswer` parameter is `answerConfidence`,
  so it no longer shadows the imported `confidence`; suites stayed green.

### Existing tests edited (task 5.2), because the spec changed

- `tests/unit/explain/explain.spec.ts`: "An answer written after a re-index is stored stale" now
  checks that each stale claim carries the confidence of its own statement; the non-scenario test
  "stores each statement as an L2 inference that keeps its statement type" expects the computed
  confidence instead of `null` (helper `aloneConfidence`).
- `tests/integration/explain/explain.spec.ts`: "A fact is stored as an inferred claim that keeps its
  type" no longer expects `confidence: null`; it checks each row's confidence equals its own
  statement's, in (0, 1), the anchor row above the heuristic one, and the answer's confidence over
  both (helper `citingAlone`).
- `tests/unit/cli/ask-command.spec.ts`: the helper `answered()` gains `confidence: 0.5`, which the
  type requires; `ask`'s output is unchanged and no assertion changed.
- `tests/unit/explain/explain-verification.spec.ts`: "An unsaved answer carries its verification,
  usage and unverified events" also checks its `confidence`.
- 5.2d: no other hit. The `confidence: null` of `claims-write.spec.ts`, `in-memory-store.spec.ts`,
  `postgres-claim-write-errors.spec.ts`, `explain-sanitization.spec.ts`, `claim.spec.ts` and the prior
  claims seeded in `explain.spec.ts` are claims built by hand, not written by `explain`: unchanged.
- 5.4: every `#### Scenario:` of both delta specs has a test with exactly its name.

### Privacy / ethics check (task 8.5)

Verdict PASS. The function reads only span metadata (file id, lines, file kind, origin) and verdicts,
never a statement, excerpt or model output; nothing new is logged; no dependency changes
(`package.json` / `package-lock.json` untouched). A grep of the diff for e-mail addresses,
`Authorization:`, passwords, tokens, API keys, `console.*` and long digit runs found nothing. Not
assessed: the tooling plan of the session (outside the diff).

## Data state verification

- Pre-test baseline (task 0.4): `project` 1, `claim` 0, `evidence` 0; `claim` rows with `NULL`
  `confidence` 0 of 0.
- Post-test validation: `project` 1, `claim` 0, `evidence` 0 (integration tests run in rolled-back
  transactions; `seed:build` left the counts unchanged). No `.stryker-tmp/` left.
- State restored: Yes
- Restoration actions: none needed.

## UI evidence (if applicable)

- None: the change has no browser UI and changes no interface output; step 10 drives the CLI end to
  end against the database (task 11.1: not applicable beyond step 10).

## CI evidence

- Collected in task 14.3, once the pull request exists: the run where the new spec files ran and
  passed and the mutation job is ≥ 80 (task 11.2).

## Outcome

- Status: PASS
- Blocking issues: none

## Addendum — step 8b, fenced model output (2026-10-15)

Added by the author's decision after the weight session found every live answer of `qwen2.5-coder`
fenced (`proposal.md` → Why, design C9).

- TDD record: 8b.1 "A conforming output inside a json fence is accepted" RED (`{ ok: false, … }`
  instead of the accepted output) → 8b.2 GREEN (`FENCED_OUTPUT` and `unfenced` in
  `explain/statement-schema.ts`). 8b.3 "Text outside a fence discards the output", "An unclosed fence
  or another info string discards the output" and "The event of a fenced output identifies the raw
  output": characterisation tests, green at once (the GREEN of 8b.2 already unwraps only one enclosing
  fence and leaves the size check and the event on the raw text).
- Existing scenarios of "Model output quarantine" and "Audit event of a discarded output" unchanged
  and green (`tests/unit/explain/statement-schema.spec.ts`: 24 passed).
- Required suite: 100 files, 1296 passed, 0 failed, 0 skipped. `lint`, `typecheck`, `docs:coverage`
  clean; `lint:architecture` 0 errors (the same 3 pre-existing warnings).
- Mutation: `statement-schema.ts` 97.09 % (100 killed, 3 survived), global 95.65 %. The 3 survivors
  are `'utf8'` → `''` in `Buffer.byteLength` / `hash.update` on lines that predate this change
  (56, 124, 125): equivalent mutants (an empty encoding falls back to UTF-8). No survivor in the new
  code.
- Every `#### Scenario:` of `specs/claims-and-typing/spec.md` has a test with exactly its name.
- Data state: `project` 1, `claim` 0, `evidence` 0, as the baseline; no `.stryker-tmp/` left.

## Addendum — step 9 reruns (2026-10-15)

- The author kept the D7 values (`reports/2026-10-15-9-weights-session.md`): `confidence.ts` did not
  change, so neither the mutation run (8.4) nor `seed:build` (7.1) needed a rerun. Only
  `docs/CONFIDENCE.md` changed (reasons and list of development questions).
- `npx vitest run tests/unit/knowledge tests/unit/explain`: 274 passed (the weights table test
  included).
- Database after the session cleanup: `project` 1, `claim` 0, `evidence` 0, as the baseline.

## Addendum — CI evidence (task 14.3, 2026-10-15)

PR #43, run [38790861935](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/38790861935):
every check passed (`scope`, `secrets`, `frontend`, `quality`, `mutation`).

- `quality`: 100 files, 1295 passed, 1 skipped (1296). The new and changed spec files ran and passed:
  `tests/unit/knowledge/confidence.spec.ts` (11), `tests/unit/knowledge/confidence-doc.spec.ts` (2),
  `tests/unit/explain/statement-schema.spec.ts` (24). The skipped test is in
  `tests/unit/index/path-policy.spec.ts`, which this change does not touch; it is platform-dependent
  (it runs on the Windows machine, where the local suite reported 0 skipped).
- `mutation`: final score 95.80 (break threshold 80); `confidence.ts` 97.06, `statement-schema.ts`
  97.09, the same survivors as locally.

## Addendum — review fixes (task 14.4, 2026-10-15)

Findings of `2026-10-15-verify-against-spec.md` and `2026-10-15-adversarial-review.md`, destinations in
`design.md` → Follow-ups, approved by the author ("si, adelante con el plan").

- 14.4b: "A fence with carriage returns is accepted" passed at once (characterisation: the C9 pattern
  already took `\r?\n`); "Other whitespace around a fence discards the output" RED (`trim()` accepted a
  BOM and a non-breaking space) → GREEN (`FENCED_OUTPUT` allows only `[ \t\r\n]` around the fence,
  no `trim()`).
- 14.4c: strengthened tests, each seen failing against a deliberately broken variant, then restored:

  | Finding | Broken variant | Result |
  |---|---|---|
  | V1 | `confidence()` swallows the `RangeError` | `expected function to throw an error, but it didn't` |
  | A3a | `resolution` last write wins per span | first attempt passed (the `heuristic` citation came last); test extended to both orders → `expected 1 to be +0` |
  | A3b | `crossConfirmation` set-wide | `expected 1 to be +0` |
  | A2 | `w.resolution` multiplied by `entailment` | `expected 0.9292… to be 0.9223…` |
  | V3 | `EVIDENCE_SATURATION` row names `evidence` | `expected 'evidence' to be '—'` |
  | A1 | the unsaved run answers `UNKNOWN` | `[ [ 'answered', true ], … ]` mismatch |
  | V2 | the new Limits sentences missing | `expected '…' to contain 'Adding well-backed statements…'` (RED before 14.4d) |

- Suite: 100 files, 1298 passed. `lint`, `typecheck`, `docs:coverage` clean; `lint:architecture`
  0 errors (the same 3 warnings).
- Mutation: `confidence.ts` 97.06 (same 2 survivors), `statement-schema.ts` 97.17 (103 killed, the same
  3 equivalent `'utf8'` survivors); global 95.65.
- Data state: `project` 1, `claim` 0, `evidence` 0.
