CHANGES REQUIRED

# Spec audit: openspec/changes/confidence-score (DIS-72, parent DIS-57)

I loaded the inputs with the Linear tools: DIS-72 and DIS-57 have no comments; DIS-72 `[enhanced]` holds D1–D8.

## Questions for the author (product or scope decisions; the agent must not settle these alone)

- **Q1 (F1, D5): how repeated citations count.** If a statement lists the same span twice, possibly with different verdicts, does `entailment` count two citations or one (statement, span) pair? `explain` can never send this today, but `confidenceSignals` is a public `knowledge/` function and DIS-42 will reuse it. Pick one:
  - (a) Count citations as given. Only `evidence` and `resolution` look at distinct spans. This is my recommendation: it adds no error case.
  - (b) Reject a statement that repeats a span with `RangeError`. This widens "Confidence needs evidence".
- **Q2 (F7, D5): `resolution` rule.** Do you accept that a span counts as resolved only when *every* citation of it is `anchor`/`exact` (spec + design C2)? D5 in the ticket says "spans with origin anchor or exact", which leaves undefined the case where one span has two different origins. The refinement is reasonable, but D5 is your default, so you confirm it.
- **Q3 (F9): where the UNKNOWN rule lives.** The rule "an UNKNOWN answer has no `confidence`" is restated in "Answer with typed statements". "Precedence and UNKNOWN answers" already fixes it: the UNKNOWN answer "SHALL have exactly" its listed fields. Pick one:
  - Add `confidence` to that requirement's SHALL NOT list (a third MODIFIED requirement).
  - Keep the restatement as a cross-reference.

No sub-issue/parent disagreement needs a question. The parent's "historial" evidence and its answer-level contradiction AC are already narrowed in DIS-72 by closed decisions D2 and D3.

## The eleven points

### 1. Scope against the ticket: clean
Everything follows from DIS-72:
- `confidence.ts`, the explain wiring, `docs/CONFIDENCE.md`, the sync test, the readme §3.2 fix, the project-context gotcha.
- The seed rebuild (forced by `packages/cli/src/seed/fingerprint.ts:30`, `ANALYZER_DIRECTORIES` includes `packages/core/src/knowledge`).
- The `ask-command.spec.ts` helper update (forced by the type).

Nothing is widened to DIS-74 (usage, query_log). A few small extras (not cuts):
- `toConfidenceStatement` as a new export of `claim-items.ts`.
- `Object.freeze` on the constants.
- 12.1 also states in the readme that `contradiccion` is 0 and `historial` does not exist yet. This is documentation consistency, not new scope.

### 2. Inherited acceptance criteria
AC1, AC2(a)(b)(d)(e), AC4 and AC5 are covered. Parent ACs 1, 2 and 6 are covered as narrowed by DIS-72. Gaps:

- **F2 (Major): AC3 asks for the signals, not only the value.** AC3 says "s₁…s₅ valen 0" for the no-signal set. The scenario "A set with no signal is worth one half" only asserts the value 0.5 and σ(−w₆).
  - Correction: add `AND its signals are { evidence: 0, diversity: 0, crossConfirmation: 0, resolution: 0, entailment: 0, contradiction: 0 }`.
- **F3 (Minor): AC2(c) asks for the s₄ values.** AC2(c) says "s₄ 1 frente a 0". The scenario "Exact resolution beats heuristic resolution" does not say which set it uses and does not assert `resolution`.
  - Correction: pin the set to the one of "The value follows the formula with the published weights", and add `AND their resolution signals are 1 and 0`.

### 3. Missing scenarios
- **F4 (Minor): "Persistence failure" has no scenario for its new clause.** The clause "`confidence` (computed as for a stored answer)" is covered only by the third run of "An answer carries the confidence of its statements", which belongs to the other requirement.
  - Correction: add to "An unsaved answer carries its verification, usage and unverified events" an AND: "its `confidence` is the confidence of S1 with (S1, `E1`) `entailed` and (S1, `E2`) `cited`".
- **F5 (Minor): two SHALL clauses of "Confidence value" have no scenario.** "`EVIDENCE_SATURATION` SHALL be an integer" is never asserted. "The value SHALL NOT be rounded" is only covered if the formula test compares exactly (see F10).
  - Correction: in "The value follows the formula…" change the AND to "every weight … and `EVIDENCE_SATURATION` is greater than 0, and `EVIDENCE_SATURATION` is an integer".
- **F6 (Minor): one SHALL clause of "Published weights" cannot be tested.** "The weights SHALL be fixed once on the development questions …, never re-tuned" is a process rule.
  - Correction: reword it to "The document SHALL state that the weights were fixed once on the development questions of the sample repositories and are never re-tuned against the measurement questions". Add "and that the weights are not re-tuned against the measurement questions" to the Limits scenario and to the design C6 check.

### 4. Ambiguity
The spec deltas contain none of the listed words. Two items in design.md:
- **F11 (Minor):** Risks says "`diversity` ≤ 0.5 in practice". One statement citing code, test and doc already reaches 0.75.
  - Correction: "≤ 0.75 (no history); 0.25 for a statement with one category".
- **F15 (Minor):** "Hence it SHALL never decrease…" in "Confidence value" draws monotonicity from reproducibility, which is not where it comes from. It follows from every weight being > 0 and each signal being non-decreasing under those changes. The three monotonicity claims are arithmetically true; I checked each, including (a+1)/(b+1) ≥ a/b for `resolution` and `entailment`.
  - Correction: replace "Hence it" with "Because every weight is positive and none of the five positive signals decreases under these changes, the value".

### 5. Open decisions
- **F1 (Blocker): repeated citations (Q1).** "each (statement, citation) pair counted once" (spec "Confidence signals" item 5; D5 "cada par … cuenta una vez") can be read as "merge repeated spans within a statement". With conflicting verdicts the result is then undefined.
  - Correction if (a): replace item 5 with "`entailment` = the number of `entailed` citations divided by the number of citations, every citation of every statement counted as given (a span cited twice by one statement counts twice)". Add to C2: "No signal other than `evidence` and `resolution` merges citations."
- **F10 (Minor): exact vs approximate comparison in the formula test.** "The value follows the formula…" does not say whether the test compares exactly or approximately. C3 fixes the sum order, so exact equality is achievable and is what catches rounding.
  - Correction in design C7: "the expected value is computed in the key order of C3 and compared with `toBe`/`Object.is`, never `toBeCloseTo`".
- **F12 (Minor): which cache the third run uses.** "An answer carries the confidence of its statements" does not say which cache the `ClaimWriteFailed` run uses. The scripted model must provide the `verify` replies accordingly.
  - Correction: "and then with the claim write failing with `ClaimWriteFailed` and a third empty cache".
- **F13 (Minor): one set or three.** "Config counts as code and an unresolved origin lowers resolution" can be read as one set of three statements. Read that way, `resolution` would be 1/3 for the whole set.
  - Correction: "each computed as a set of its own".

### 6. Contradictions inside the change
- **F7 (Minor, Q2):** spec and design use the "every citation" rule for `resolution`; the ticket's D5 says "spans with origin anchor or exact". Once the author confirms, record it in Linear (see Corrections).
- **F14 (Minor):** proposal D7 says "the maximum is σ(3) ≈ 0.953". With `history` impossible, the reachable maximum today is σ(2.875) ≈ 0.947.
  - Correction: add "(σ(2.875) ≈ 0.947 while no history evidence exists)".
- Design C1 types `CONFIDENCE_WEIGHTS` as `Readonly<Record<…, number>>`; C4 says `as const`. These are compatible, not a contradiction.

### 7. Contradictions with the project
- **F9 (Minor, Q3):** duplication with `openspec/specs/explain/spec.md` "Precedence and UNKNOWN answers" (lines 108–113, "SHALL have exactly …"), as described in Q3.
- `openspec/specs/claims-and-typing/spec.md:29` (`confidence` null or in [0, 1]) and `openspec/specs/graph-schema/spec.md:458` agree with the change.
- `docs/project-context.md:549` stays true.
- The tasks follow base-standards rule 4 (5.2 edits tests because the spec changed) and rule 8 (`Pending:` reasons in 3.2, verbatim transcription in 9.3).
- **F16 (Minor):** 13.1 transcribes "D1–D8" as "the author's Why". D5–D8 are AI-proposed defaults, so labelling them the author's why goes against rule 8.
  - Correction: "D1–D4 and the author's rulings on D5–D8 from the spec audit".

### 8. Contrast with the real code
- **F8 (Major): task 2.4 claims a check that `lint:architecture` does not perform.** It says `npm run lint:architecture` verifies "knowledge/confidence.ts imports nothing from explain/ or context/". `.dependency-cruiser.cjs` has no such rule. Its rules are core-no-infra, core-no-transport, analyzers-*, explain-sanitize-no-io, verify-no-io, api-no-sql, no-circular and no-orphans (lines 14–113). Only `no-circular` might catch it, and only indirectly. The task would record evidence that was never produced.
  - Correction: keep `lint:architecture` for `no-orphans`. Add an explicit check: `grep -nE "from '\.\./(explain|context)/" packages/core/src/knowledge/confidence.ts` prints nothing. Alternatively, as part of this change, add a `knowledge-below-explain-context` forbidden rule to `.dependency-cruiser.cjs` (`from: ^packages/core/src/knowledge/`, `to: ^packages/core/src/(explain|context)/`).
- The wiring matches the code:
  - `ContextSpan` carries `fileKind` and `origin` (`packages/core/src/context/context-pack.ts:37,51`).
  - `ContextOrigin` is a `string` subtype (`rank.ts:11`).
  - `VerifiedStatement.evidenceVerifications` is position-aligned with `spans` (`explain/claim-items.ts:45-50`, `verify/policy.ts:42-57`).
  - `toClaimItems` writes `confidence: null` at `claim-items.ts:80`; its TSDoc says "no confidence" at line 56.
  - `storedAnswer`/`unsavedAnswer` are at `explain.ts:143,187`.
  - `FileKind` is in `knowledge/graph-file.ts:5`.
  - Postgres already inserts and reads the column (`store-postgres/src/queries.ts:247`, `claims.ts:47,93`).
  - The answered path always has at least one statement with at least one citation (`explain.ts:110`; quarantine rejects duplicate ids, `statement-schema.ts:66,86`), so C5's "RangeError unreachable" holds.
- No existing abstraction is duplicated. `ConfidenceVerdict` mirrors `StatementVerification` by design (C1).
- **F17 (Minor):** design C6 says the doc test reads the file "as the other tests that read repository files resolve it". No existing test reads a `.md` file.
  - Correction: name the precedent, `new URL('../../../docs/CONFIDENCE.md', import.meta.url)` as in `tests/unit/knowledge/claim.spec.ts:20`.
- **F18 (Minor):** `docs:coverage` is typedoc with `--validation.notDocumented`, so interface members need TSDoc too, as every existing interface has.
  - Correction in 1.2: "TSDoc on every export and on every member of the exported interfaces".
- Existing `confidence: null` hits:
  - The real ones are `tests/unit/explain/explain.spec.ts:534` (5.2a) and `tests/integration/explain/explain.spec.ts:181` (5.2b).
  - `explain.spec.ts:707` and `explain-sanitization.spec.ts:338` are hand-seeded prior claims and stay as they are (5.2d already says so).
  - The store, claim and schema tests are unaffected.
  - The integration test identifies rows by object (`explain.spec.ts:177-179`), so "first claim's higher than second's" is testable.

### 9. Task size
- No task exceeds one turn. Group 9 waits for the author, which is acceptable because it is split into 9.1–9.4.
- **F19 (Minor): 4.4 cannot go RED.** UNKNOWN answers already lack `confidence`, so "An unknown answer has no confidence" will pass at once.
  - Correction: "4.4 Characterisation test …, recorded in the step 8 report".
- 2.3 bundles six tests; it already allows characterisation tests. No finding.

### 10. Mandatory steps
The structure is clean:
- Step 0 is the branch section. 0.1 is the Linear state, per the project's rule; the branch already exists.
- All mandatory sections are present, labelled, and in order.
- The report paths follow the pattern.
- Restoration is covered in 8.6, 9.4 and 10.5. Pre-merge Review is last, with archive before merge.
- Every scenario maps to a task.

Two findings:
- **F20 (Minor): step 8 is closed before step 9 changes the weights.** Group 9 can change `confidence.ts` and the document after step 8 has been marked complete and its report written. 9.4 reruns the tests but writes no addendum.
  - Correction in 9.4: "… and add an addendum with the reruns to the step 8 report".
- **F21 (Minor): the 10.3 comparison needs the same statement.** "lower `confidence` than 10.2's for the same statement" is only possible if 10.2 also used the stub; Ollama's statements differ from run to run.
  - Correction: "run 10.3 and, for the comparison, a 10.2 rerun with the stub answering `{"entails":true}`, both with the same fixed output".

### 11. Traceability
| Requirement | Scenario | Task(s) |
|---|---|---|
| Confidence signals | Signals of a set backed by code and test | 1.1, 1.2 |
| Confidence signals | Config counts as code and an unresolved origin lowers resolution | 1.3 |
| Confidence signals | A cited citation backs nothing | 1.4 |
| Confidence value | The value follows the formula with the published weights | 2.1, 2.2 |
| Confidence value | The value is reproducible and independent of order | 2.3 |
| Confidence value | A citation left cited lowers the value | 2.3 |
| Confidence value | A contradiction lowers the value | 2.3 |
| Confidence value | Exact resolution beats heuristic resolution | 2.3 |
| Confidence value | Evidence saturates and never lowers the value | 2.3 |
| Confidence value | A set with no signal is worth one half | 2.3 |
| Confidence needs evidence | A set without citations has no confidence | 1.5 |
| Published weights | The published weights are the code's weights | 3.1, 3.2, 3.4 |
| Published weights | The confidence document states its limits | 3.3 |
| Answer with typed statements | An answer with evidence is typed, stored and returned | 5.3 |
| Answer with typed statements | A fact is stored as an inferred claim that keeps its type (modified) | 5.2b |
| Answer with typed statements | The evidence of a stored answer lists every citation in order | 5.3 |
| Answer with typed statements | An answer written after a re-index is stored stale (modified) | 5.2a |
| Answer with typed statements | Cited spans are verified in one read at the pack's commit | 5.3 |
| Answer with typed statements | A broken citation is neither stored nor shown | 5.3 |
| Answer with typed statements | The subject of a claim is the symbol of its first cited span | 5.3 |
| Answer with typed statements | Citations that support their statement are entailed and facts | 5.3 |
| Answer with typed statements | A valid but irrelevant citation is cited and never a fact | 5.3 |
| Answer with typed statements | A cached pair is not verified again by a second answer | 5.3 |
| Answer with typed statements | An invalid verifier output degrades its pair to cited | 5.3 |
| Answer with typed statements | An unavailable verifier degrades every uncached pair and the answer is stored | 5.3 |
| Answer with typed statements | An answer carries the confidence of its statements | 4.1, 4.2 |
| Answer with typed statements | The confidence follows the verifier's verdicts | 4.3 |
| Answer with typed statements | An unknown answer has no confidence | 4.4 |
| Persistence failure | the five existing scenarios (unchanged) | 5.3 (+ F4 for the new clause) |

No empty row.

### Checks requested by the caller
- **Signal arithmetic: all correct.**
  - S1+S2: {0.5, 0.5, 1, 1, 1, 0}; S1 alone: {0.25, 0.25, 0, 1, 1, 0}.
  - E1+E4: diversity 0.25, cross 0. E1+E3: resolution 0.5. "guessed": resolution 0.
  - Cited E2: {0.25, 0.25, 0, 1, 2/3, 0}.
  - σ(2.5) ≈ 0.924, as the ticket says. σ(0) = 0.5 exactly. σ(−1.5) ≈ 0.18.
  - The explain comparisons (anchor claim above heuristic claim; the answer with (S2, E2) `cited` lower) hold for any positive weights.
- **Monotonicity claims: all three hold** (see F15 for the wording).
- **MODIFIED requirements: faithful copies.** I diffed "Answer with typed statements" and "Persistence failure" line by line against `openspec/specs/explain/spec.md:475-748`. Nothing was lost. The only edits:
  - The `usage` bullet now ends with ";".
  - New `confidence` bullet and the UNKNOWN/status paragraph.
  - "`confidence` `null`" replaced by "as `confidence` the confidence of that statement alone…".
  - In "A fact is stored…", "`confidence` `null`" removed and an AND added.
  - An AND clause on stale claims in the re-index scenario.
  - "`confidence` (computed as for a stored answer)" added to "Persistence failure".
  - All other scenarios are verbatim.

## Corrections to apply

**specs/confidence-score/spec.md**
1. "Confidence signals", item 5: the wording chosen for Q1 (F1). If (a): "`entailment` = the number of `entailed` citations divided by the number of citations, every citation of every statement counted as given (a span cited twice by one statement counts twice)".
2. "Config counts as code…", WHEN: append "each computed as a set of its own" (F13).
3. "Confidence value" body: replace "Hence it SHALL never decrease" with "Because every weight is positive and none of the five positive signals decreases under these changes, the value SHALL never decrease" (F15).
4. "The value follows the formula…", AND: "every weight of `CONFIDENCE_WEIGHTS` and `EVIDENCE_SATURATION` is greater than 0, and `EVIDENCE_SATURATION` is an integer" (F5).
5. "Exact resolution beats heuristic resolution": WHEN "…for the set of 'The value follows the formula with the published weights' with every citation's origin `heuristic` and with every one `exact`"; add "AND their `resolution` signals are 0 and 1" (F3).
6. "A set with no signal is worth one half": add "AND the signals of the first are `{ evidence: 0, diversity: 0, crossConfirmation: 0, resolution: 0, entailment: 0, contradiction: 0 }`" (F2).
7. "Published weights": replace the last sentence with "The document SHALL state that the weights were fixed once on the development questions of the sample repositories and are never re-tuned against the measurement questions." In "The confidence document states its limits", add "and that the weights are not re-tuned against the measurement questions" (F6).

**specs/explain/spec.md**
8. "An answer carries the confidence of its statements", WHEN: "…and then with the claim write failing with `ClaimWriteFailed` and a third empty cache" (F12).
9. "An unsaved answer carries its verification, usage and unverified events": add "AND its `confidence` is the confidence of S1 with (S1, `E1`) `entailed` and (S1, `E2`) `cited`, without contradiction" (F4).
10. Per Q3, one of two (F9):
    - MODIFY "Precedence and UNKNOWN answers" (copy it whole) so that its line reads "It SHALL NOT carry `persisted`, prior claims, `usage` nor `confidence`", and drop the restated sentence from "Answer with typed statements".
    - Change that sentence to "As requirement 'Precedence and UNKNOWN answers' fixes, an `UNKNOWN` answer has no `confidence` property."

**design.md**
11. C2: add "Every citation counts as given; only `evidence` and `resolution` merge citations, by span" (or the Q1(b) rule) (F1).
12. C6: the test reads `new URL('../../../docs/CONFIDENCE.md', import.meta.url)` as `tests/unit/knowledge/claim.spec.ts:20`, and the Limits check also looks for the no-re-tuning sentence (F17, F6).
13. C7: "the expected value is computed in C3's key order and compared exactly (`toBe`), never `toBeCloseTo`" (F10).
14. Risks: "`diversity` ≤ 0.75 (no history); 0.25 for a single-category statement" (F11).

**proposal.md**
15. D7: append "(σ(2.875) ≈ 0.947 while no history evidence exists)" (F14).

**tasks.md**
16. 1.2: "TSDoc on every export and on every member of the exported interfaces (`docs:coverage`)" (F18).
17. 2.4: add "and `grep -nE \"from '\\.\\./(explain|context)/\" packages/core/src/knowledge/confidence.ts` prints nothing (no depcruise rule covers it)", or add the forbidden rule to `.dependency-cruiser.cjs` in this task (F8).
18. 4.4: "Characterisation test 'An unknown answer has no confidence' …, recorded in the step 8 report" (F19).
19. 9.4: append "and add an addendum with these reruns to the step 8 report" (F20).
20. 10.2/10.3: the comparison uses the stub for both runs with the same fixed output; Ollama, if used, only for the 10.2 non-null check (F21).
21. 13.1: "D1–D4 and the author's rulings on D5–D8 from the spec audit" instead of "D1–D8" (F16).

**Linear DIS-72** (never the `[original]` block; in Spanish)
22. Comment, or edit of the `[enhanced]` D5 entry, once Q1 and Q2 are answered:

    «Spec-audit (2026-10-15): D5 se precisa así — s₄ cuenta un span como resuelto solo si todas sus citas tienen origen `anchor` o `exact` (falla cerrado si dos citas del mismo span discrepan); s₅ cuenta cada cita tal como llega [o la regla elegida en Q1]. D7: con historial imposible, el máximo alcanzable hoy es σ(2,875) ≈ 0,947. La afirmación UNKNOWN sin `confidence` ya la fija el requisito "Precedence and UNKNOWN answers" [según Q3].»

No change is needed on DIS-57.

## Resolution of the findings (2026-10-15)

Author decisions (asked in the session, 2026-10-15):

- **Q1 → (a)**: every citation counts as given; only `evidence` and `resolution` merge by span.
- **Q2 → "every"**: a span is resolved only when every citation of it is `anchor`/`exact`.
- **Q3 → MODIFY "Precedence and UNKNOWN answers"**: copied whole into the `explain` delta, its SHALL NOT
  line now reads "`persisted`, prior claims, `usage` nor `confidence`"; the scenario "An unknown answer
  has no confidence" moved there; the restated sentence was dropped from "Answer with typed statements".

| Finding | Resolution |
|---|---|
| F1 (Blocker) | Fixed per Q1: spec item 5 reworded; design C2 bullet "Every citation counts as given" |
| F2 (Major) | Fixed: AND with the six zero signals in "A set with no signal is worth one half" |
| F3 | Fixed: scenario pinned to the formula scenario's set; AND `resolution` 0 and 1 |
| F4 | Fixed: AND on `confidence` in "An unsaved answer carries its verification, usage and unverified events"; task 5.2e |
| F5 | Fixed: AND "`EVIDENCE_SATURATION` is an integer" |
| F6 | Fixed: the requirement states what the document says; Limits scenario and design C6 check the no-re-tuning sentence |
| F7 | Decided by the author (Q2); recorded on DIS-72 (comment 89e63e8f) |
| F8 (Major) | Fixed: task 2.4 keeps `lint:architecture` for `no-orphans` and adds the explicit `grep` check (no new dependency-cruiser rule) |
| F9 | Decided by the author (Q3); proposal Capabilities lists the third MODIFIED requirement |
| F10 | Fixed: design C7, exact comparison (`toBe` / `Object.is`) |
| F11 | Fixed: design Risks, diversity ≤ 0.75, 0.25 for one category |
| F12 | Fixed: "a third empty cache" in the scenario and in task 4.1 |
| F13 | Fixed: "each computed as a set of its own" |
| F14 | Fixed: proposal D7 adds σ(2.875) ≈ 0.947 |
| F15 | Fixed: monotonicity sentence rests on positive weights and non-decreasing signals |
| F16 | Fixed: task 13.1 transcribes D1–D4 and the author's rulings on D5–D8 and Q1–Q3 |
| F17 | Fixed: design C6 names `new URL(…, import.meta.url)` as in `claim.spec.ts:20` |
| F18 | Fixed: task 1.2, TSDoc on every interface member |
| F19 | Fixed: task 4.4 is a characterisation test recorded in the step 8 report |
| F20 | Fixed: task 9.4 adds an addendum to the step 8 report |
| F21 | Fixed: task 10.3 compares two stub runs with the same fixed output |
| Linear (22) | Done: Spanish comment on DIS-72 (89e63e8f); `[original]` untouched |

## Re-audit (2026-10-15)

APPROVED. Every finding F1–F21 verified as landed; the Precedence copy is faithful (lines 68–224 of
the main spec, only the `confidence` edit plus the moved scenario). Two new Minor findings:

| Finding | Resolution |
|---|---|
| N1 (Minor) | Fixed: tasks 0.4, 1.4, 2.3, 3.4 and 5.2 now name the step 8 report |
| N2 (Minor, cosmetic) | Rejected: rewrapping changes no text, and the main `explain` spec the deltas copy already has lines over 100 columns (e.g. its "Answer with typed statements" first bullet); the archive merge is whitespace-insensitive |
