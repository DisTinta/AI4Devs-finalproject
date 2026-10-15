# Verify against spec: evidence-verifier-syntactic (DIS-68), PR #41

- Date: 2026-10-15
- Run by: the `verify-against-spec` skill (read-only subagent); saved verbatim by the main session

**Overall:** every scenario in the four delta specs has a test with the same name, and none is red or absent. Nothing the spec requires is missing from the code. Block 3 has two fail-open paths in the newly exported verifier that need a decision before DIS-42 reuses it.

**What I checked:** the four delta specs (`evidence-verification`, `explain`, `context-engine`, `cli-ask`), plus `proposal.md` and `design.md`. I compared them with the diff `1d6c105..2e0b6a1`.

**Test state:** I did not re-run the tests. The "green" states come from `reports/2026-10-15-9-test-and-state-verification.md` (1241 tests passing, mutation score 95.72), which describes the same code. The working tree has two uncommitted edits that change no code: `.claude/sdd-harness.env` and the checkboxes in `tasks.md`.

---

## 1. Requirements implemented correctly

### evidence-verification

| Requirement | Code | Proving test |
|---|---|---|
| Syntactic citation check: one verdict per citation, in order, with reasons checked in the order `file-missing`, then `range-out-of-file`, then `excerpt-mismatch` | `packages/core/src/verify/syntactic.ts:44-62` | `tests/unit/verify/syntactic.spec.ts:40`, `:62` |
| One batched read of the distinct paths, in first-citation order; no read for an empty list | `syntactic.ts:50`, `:106-108` | `syntactic.spec.ts:40`, `:121` |
| Single read per path only when the batch fails with `missing`; any other failure propagates | `syntactic.ts:109-120` | `syntactic.spec.ts:62`, `:92` |
| The commit is a parameter; nothing is logged; a verdict carries no text | `syntactic.ts:44-49`, `:30` | `syntactic.spec.ts:40` (repeat run plus console spies) |
| Expected text uses the same rule as the pack | `packages/core/src/context/span-text.ts:15-33`, used by `context-pack.ts:194` and `syntactic.ts:52,75` | `syntactic.spec.ts:156` (redacted secret), `:227` (no final line feed, empty file) |
| Adjustment for a `lines` cut (trailing `\r`) and a `line-cut` cut (first code points), with exact comparison | `syntactic.ts:74-88`, `:61` | `syntactic.spec.ts:135`, `:172`, `:189`, `:211` |
| Output policy: drop broken citations, drop statements left with none, retype the rest, keep order | `packages/core/src/verify/policy.ts:18-26` | `tests/unit/verify/policy.spec.ts:31`, `:42`, `:50` |

### explain

| Requirement | Code | Proving test |
|---|---|---|
| Step 11: verify against `pack.root` and `pack.commit`; answer `broken-evidence` when nothing is left | `packages/core/src/explain/explain.ts:96-98` | `tests/unit/explain/explain-verification.spec.ts:80` |
| No verification read for `invalid-model-output` or `no-evidence` | `explain.ts:91-92` (both return before line 96) | `explain-verification.spec.ts:120` |
| Verification read failures propagate and nothing is written | `syntactic.ts:110,117` | `explain-verification.spec.ts:107` |
| Distinct cited ids checked in evidence-id order (E2 before E10); spans no statement cites are not read | `packages/core/src/verify/verify-answer.ts:42-46` | `explain-verification.spec.ts:141`; `tests/unit/verify/verify-answer.spec.ts:67`, `:105` |
| The citation's `cut` is mapped from the sanitised span | `verify-answer.ts:58-63`; `packages/core/src/explain/sanitize.ts:36,185` | `verify-answer.spec.ts:47` |
| `verification: 'cited'` on statements (stored, stale and unsaved) and on evidence rows | `explain.ts:150,157,193`; `claim-items.ts:79`; `explain-answer.ts:42` | `explain.spec.ts:442,506,543,608`; `tests/integration/explain/explain.spec.ts:121` |
| A broken citation is neither stored nor shown; the statement is retyped | `policy.ts:20-25`; `explain.ts:99-111` | `explain-verification.spec.ts:168` |
| An unsaved answer keeps only the verified ids, and its events follow the required order | `explain.ts:173-196` | `explain-verification.spec.ts:206` |
| `evidence_broken` event: its shape, one per id, after the sanitisation events, no content | `packages/core/src/explain/explain-event.ts:87-110`; `verify-answer.ts:47-52`; `explain.ts:97` | `explain-verification.spec.ts:237`; `verify-answer.spec.ts:84` |
| `broken-evidence` appended last to `UNKNOWN_REASONS` | `packages/core/src/explain/unknown-policy.ts:11-18` | `explain-verification.spec.ts:80` (exact `toEqual`) |
| Re-index during the answer: claims stay `stale` and are not marked broken; verification reads at the pack's commit | `explain.ts:96` | `explain.spec.ts:543` (all batched reads at `COMMIT`) |

### context-engine

| Requirement | Code | Proving test |
|---|---|---|
| An `ok` pack carries `root` | `packages/core/src/context/context-pack.ts:80`, `:185`, `:210` | `tests/unit/context/context-pack.spec.ts:371` |

### cli-ask

| Requirement | Code | Proving test |
|---|---|---|
| `evidence_broken` written at level `error`, every other event at `info`, exit code unchanged | `packages/cli/src/commands/ask.ts:102` | `tests/unit/cli/ask-command.spec.ts:559` |
| `UNKNOWN (broken-evidence)` output | `ask.ts:148-151` (generic over the reason) | `ask-command.spec.ts:582` |

### Other checks the skill asks for

- **Dependencies:** no `package.json` or lockfile changed. `verify/` imports only internal modules, and the `verify-no-io` rule in `.dependency-cruiser.cjs:82-94` enforces this. The rule was proven to fire, per report 9.
- **Authorisation:** the spec requires no authorisation check. Verification reuses the root and commit the pack already resolved (`context-pack.ts:185`), so it adds no new place where untrusted input enters.
- **Response fields:** none beyond the spec. `FilledContextPack.root` and the seven `evidence_broken` fields are both in the spec, and `ask-command.spec.ts:569-577` asserts the exact key list.

## 2. Requirements missing or partial

No required behaviour is missing. Three requirements are implemented but no test proves them, and two tests are weaker than their scenario:

1. **"`broken-evidence`… declared once in that order"** (explain, Precedence). The order is correct at `unknown-policy.ts:11-18`, but no test asserts the array. A reordering would not be caught.
2. **"one reason from the exported closed set `EVIDENCE_BROKEN_REASONS`"** and **"checked in this order"**. The set is correct at `explain-event.ts:87`, but no test imports `EVIDENCE_BROKEN_REASONS`. The check order is only proven where the reasons are mutually exclusive. No test has a citation that is both out of range and mismatched, but `syntactic.ts:60-61` puts `range-out-of-file` first by construction.
3. **"When the batched read rejected with reason `missing`, the contents of the single reads are the ones checked."** The in-memory double serves the same content to both reads, so this clause can't be told apart from the alternative. It holds trivially at `syntactic.ts:107-121`, because a rejected batch returns no content.
4. **Weaker assertion: "Valid citations are cited and each path is read once"** (`syntactic.spec.ts:56-57`). The test runs the check twice but only asserts the paths of `batchReads[0]`. The second run's batch is covered only by the total count of 2.
5. **Weaker assertion: "Cited spans are verified in one read at the pack's commit"** (`explain-verification.spec.ts:163`). It compares the root against the literal `ROOT` rather than `pack.root`. That is equivalent with this double, but it doesn't tie the read to the pack's value.

## 3. Unspecified behaviour

The design (V1, V2, V4, V5, V10) covers most of the extra surface: the public exports of `redactedLines`, `spanText`, `TRUNCATION_LINE_CUT_MARK`, `applyVerdicts` and `verifyAnswer`; the `toClaimItems` signature change to `Pick`; and the `verify-no-io` rule. These are reviewed and decided. Three behaviours appear in neither the spec nor the design, and each needs a decision:

1. **A citation with non-integer or NaN line numbers can come back as `cited`.**
   - **Where:** `syntactic.ts:60`.
   - **What happens:** `NaN < 1`, `NaN < NaN` and `NaN > length` are all false, so the range check passes. `spanText` then calls `slice(NaN, NaN)`, which gives `''` (`span-text.ts:32`), so a citation `{startLine: NaN, endLine: NaN, excerpt: ''}` is `cited`. A fractional value like `1.5` is silently truncated by `slice`.
   - **Reachable today?** Not through `explain`, because pack spans are integers. But `verifyCitations` is public and the proposal reserves it for DIS-42.
   - **Recommendation:** add it to the spec (non-integer lines give `range-out-of-file`) and test it. A verifier that passes malformed input is the wrong default.
2. **`verifyAnswer` lets a cited id that has no span through as verified.**
   - **Where:** `verify-answer.ts:44` keeps only ids found in `spanOf`, and `policy.ts:20` drops only ids in `broken`.
   - **What happens:** an id cited by a statement but absent from `spanOf` is never checked and never dropped. It reaches the answer as if it were verified.
   - **Reachable today?** Not through `explain`: the earlier output check (`explain.ts:91`) rejects unknown ids. `verifyAnswer` is exported, though.
   - **Recommendation:** either specify "an id with no span is `broken`" or throw. Don't leave it silent.
3. **A short array from `readFilesAt` becomes `file-missing`.**
   - **Where:** `syntactic.ts:52`.
   - **What happens:** if the adapter returns fewer contents than paths, `contents[i] === undefined` is read as a missing file. The port contract is broken, but it is reported as a broken citation rather than an error.
   - **Recommendation:** remove it (throw on a length mismatch), or state it in the spec.

There is also one known behaviour that matches the spec but is worth recording. Design Risks and the show-spec-working run confirm that the main real trigger for `broken` is a graph symbol whose range runs past the end of its file. The pack slices that span silently, then the verifier flags it `range-out-of-file` at the same commit. The pack's behaviour predates this change; whether the pack should catch it is a separate decision.

## Scenario → test → state

All 69 scenarios of the four delta specs map to a same-named test, all green (the integration ones need the database); the full table is in `pr-description.md` → Trazabilidad. Two are weaker than their scenario: "Valid citations are cited and each path is read once" (§2.4) and "Cited spans are verified in one read at the pack's commit" (§2.5).

## Addendum — resolution (2026-10-15)

§2.1, §2.2, §2.4 and §2.5 fixed with stronger assertions; §2.3 left as is (true by construction: a
rejected batch returns no content). §3.1 and §3.3 fixed with TDD and added to the spec as the scenarios
"Non-integer lines are out of the file" and "A short batched read is an error"; §3.2 (an id with no span)
cannot be reached from `explain`, whose output quarantine rejects unknown ids, and `applyVerdicts`
receives only ids the quarantine accepted — recorded with the missing-commit case in the DIS-42
hand-off. Destinations in `design.md` → Follow-ups.
