# Spec audit — evidence-verifier-semantic

- Date: 2026-10-15
- Ticket: DIS-70 (parent DIS-56)
- Auditor: `spec-auditor` subagent, first pass

CHANGES REQUIRED

Questions for the author (product or scope decisions; I have not resolved them):

- **Q1 (D5 with D1 and D4): conjunctive statements can never be FACT.** `VERIFY_SYSTEM_PROMPT` (design S4) says "Answer true only if the evidence text alone shows that the statement is true", and D4 checks one call per (statement, citation). Take a statement whose support is split across two spans, with E1 proving one half and E2 the other. Each pair is judged alone, so both come back `cited`, and under D1 the statement is `INFERENCE` even though the two spans together entail it. Do you accept this consequence, or should the prompt ask whether "the evidence is relevant to and consistent with" the statement?
- **Q2 (D3): other verifier errors propagate.** The spec says "any other failure SHALL propagate", which the agent decided alone. D3 only names three codes. The consequence: a `sumCostSince` failure inside `withDailyBudget`, or any non-domain error of the adapter, during a `verify` call loses an answer whose `answer` call was already paid, and nothing is written. Should it propagate (as written), or degrade to `cited` under a fourth code?
- **Q3 (D2): cache bound and constructor check.** The agent set `MAX_VERIFICATION_CACHE_ENTRIES = 10_000` and a `RangeError` for invalid `maxEntries` itself (design S3 says "assumption, revisable"). Please confirm or give the value.
- **Q4 (D1): stored type of a statement.** The provenance `statementType` becomes the type after the entailment check (explain delta, "Answer with typed statements": "the statement's type (by the entailment policy) as statement type"). A statement whose spans would make it `FACT` but whose citation is only `cited` is stored as `INFERENCE`, and later answers show it as an `INFERENCE` prior claim. I think this is the intended reading of D1, but it changes what `ask` shows for prior claims. Please confirm.
- **Q5 (D1 against the parent):** D1 deliberately overrides DIS-56's criterion "o a `UNKNOWN` si no le queda ninguna `entailed`". DIS-56 still says the old thing. Should a Spanish comment on DIS-56 record the override? Should D1 get an ADR (design S12 leaves it to you)?
- **Q6 (D6): `cacheHits` and repeated pairs.** A pair repeated inside one answer counts as neither a call nor a cache hit (spec: "`cacheHits`, the distinct pairs answered from the cache"). DIS-74 will compute savings from these numbers. Please confirm.

---

## 1. Scope against the ticket

Mostly clean. Everything in the change comes from DIS-70 `[enhanced]` (D1–D8, AC 1–5, technical context, Done). Nothing widens the change to the whole of DIS-56.

- **Improvable: `costTable` 4th parameter.** `verifyEntailment(llm, cache, pairs, costTable = COST_TABLE)` (design S1) departs from the ticket's interface `verifyEntailment(llm, cache, pairs)`. It is only a test seam, so keep it, but record it in the ticket (see the Linear corrections).
- Proposal → Non-goals: "`ask` does not print `usage` either" and the new cli-ask MUST "SHALL NOT print a statement's verification nor the answer's `usage`" narrow scope rather than widen it, and they follow the ticket's non-goal. Fine.

## 2. Inherited acceptance criteria

All five DIS-70 ACs have requirements and scenarios. So do the DIS-56 ACs the sub-issue inherits:

- `entails:false` → `cited`;
- evaluation mode → `cited` at most;
- the same pair verified twice → no second call;
- `usage.verification` broken down per answer.

The only difference is DIS-56's "UNKNOWN si no le queda ninguna entailed", overridden on purpose by D1 (see Q5).

- **Improvable: AC1 in the `ClaimWriteFailed` run.** In explain → "Citations that support their statement are entailed and facts", the THEN says "the three stored evidence rows have verification `entailed`". In the second run (the write fails) nothing is stored. The ticket's observable is "los `ClaimItem` que recibe `saveClaims`". Fix the wording (see Corrections).

## 3. Missing scenarios

- **BLOCKING: no scenario for the type stored in the provenance.** The explain delta → "Answer with typed statements" changes a MUST: the provenance now stores the type after the entailment check. No scenario checks a statement whose spans would make it `FACT` but that was capped to `INFERENCE`. Every provenance assertion uses a verifier that entails everything. If the implementation regresses and stores the typing rule's `FACT`, the statement later shows as a `FACT` prior claim (explain → "Prior claims"). That breaks D1 and the readme criterion "ninguna afirmación sin soporte válido llega como `FACT`".
- **Improvable: "in sequence, never in parallel" is not tested.** Semantic check, step 3, has no scenario. "Each distinct pair is verified once in order" only checks the order of the requests, and a `Promise.all` that records in order would pass it.
- **Improvable: `statementIndex` is never other than 0.** It is only asserted as 0, and never after a statement dropped as broken. Task 5.5 tests it in `verify-answer.spec.ts`, but no spec scenario at the `explain` level pins "index among the answer's `statements`".
- **Improvable: the default cache bound.** cli-ask "with its default bound" has no scenario. Low risk.

## 4. Ambiguity

Clean. The only matches for the search words are "as many symbol searches as" (explain delta, line 150) and "however many statements cite it" (line 445). Both are copied from the main spec, and both are precise.

## 5. Open decisions

- **BLOCKING: what the double records in `order` for a `verify` request.** Design S10 does not say whether `scripted-llm` pushes `'complete'`, `'verify'` or nothing into the shared `order` for a `verify` request. A test pins this today:
  - `tests/unit/explain/explain.spec.ts:727` (scenario "Prior claims show their displayed type and stale warning", a requirement this change does not modify) asserts `d.order` equals `['findClaimsOverlapping', 'complete', 'saveClaims']`.
  - With the default verifier this becomes `[…, 'complete', 'complete', 'saveClaims']` if verify pushes `'complete'`.
  - The `later` predicate of `explain-doubles.ts:60` (`order.includes('complete')`) depends on it too.

  Decide it in design S10. Recommended: push `'verify'`, so `'complete'` still means the `answer` call. Then list the affected tests (see section 10).
- **Improvable: the LRU when re-storing a key.** Design S3 says "`set` evicts `map.keys().next()` when full", but the spec says "when the cache already holds `maxEntries` **other** keys". The design must say that re-storing an existing key deletes and re-inserts it without evicting anything.
- **Improvable: how "The cache holds no text" reads the cache.** The scenario says "the keys and values the cache holds are serialised", but `VerificationCache` only has `get`/`set`. Fix how the test reads it: a recording wrapper of the in-memory cache, or an exported inspection helper. Otherwise the implementer chooses.

## 6. Contradictions inside the change

- **Improvable: task 9.3 against the real test.** Task 9.3 re-runs "The subject of a claim is the symbol of its first cited span" unchanged. But its test (`tests/unit/explain/explain.spec.ts:462-476`) calls `toClaimItems` with `{ text, type, spans }` and asserts `'cited'`. Design S7 changes the parameter to `Pick<VerifiedStatement, 'text' | 'type' | 'spans' | 'evidenceVerifications'>`, so it will not type-check unchanged. Move it to 9.2. The vague "`tests/unit/explain/claim-items.spec.ts` or wherever `toClaimItems` is called" in 9.2 is this test.
- **Improvable: `maxEntries`.** The spec says "a positive integer", design S3 says "a positive safe integer". Align them; prefer "positive safe integer" in the spec too.
- **Improvable: "two pairs share a key exactly when they are the same pair" (spec, "Verification cache") is false.** The key hashes the neutralised messages, and `neutralise` is not injective. A text holding `<<<UNTRUSTED_DATA` and one holding `<​<<UNTRUSTED_DATA` (with a U+200B already present) both send `<​<<UNTRUSTED_DATA` (`prompt.ts:39-51`; `MARKER_SEQUENCE_SOURCE` requires `<<<`). Reword as "two pairs whose requests are identical share a key; a pair that differs in its statement text, path, lines, excerpt or truncation mark, as sent, gets another key".

## 7. Contradictions with the project

- **MODIFIED headers and full copies: clean.** I compared each delta with the main spec:
  - `evidence-verification` "Output policy over typed statements";
  - `explain` "Precedence and UNKNOWN answers" (12 + 1 scenarios), "Answer with typed statements" (7 + 5), "Persistence failure" (4 + 1), "Explain events and logging" (4 + 1);
  - `claims-and-typing` "Statement typing from the resolution of its evidence";
  - `cli-ask` "Ask answer output" (6 + 2).

  Every header matches exactly, and every existing scenario is carried over.
- **Improvable: `docs/project-context.md` will be wrong.**
  - Line 586: "`BudgetExhausted` propagates until DIS-21…" is no longer true for a `verify` call.
  - Lines 597-598: "New `evidence` rows are `cited`".
  - Lines 587-588: the `ExplainEvent` union.

  Task 13.2 must name these three spots explicitly.
- **Improvable: the Purpose of `openspec/specs/evidence-verification/spec.md`.** Lines 5-7 describe only the syntactic check. A delta cannot change Purpose, so add an archive-time task to update it.
- **Improvable: readme sections.** The ticket's Done names readme §2.2 (component table, `readme.md:477`), but task 13.1 says §2.1 (line 445). Cover both.
- `docs/backend-standards.md` §3/§4/§8 (closed sets as `as const`, `z.strictObject`, degrading on exhaustion) and ADRs 20261013/20261014: consistent.

## 8. Contrast with the real code

- Design S5/S6/S7 fit the code:
  - `TypedStatement` is at `claim-items.ts:27`;
  - `applyVerdicts` is at `policy.ts:18`;
  - `verifyAnswer(source, root, commit, statements, spanOf)` is at `verify-answer.ts:35`;
  - `storedAnswer`/`unsavedAnswer` hard-code `'cited'` at `explain.ts:150,157,193`;
  - `neutralise`/`wrap` are private at `prompt.ts:49-56`.

  No duplicate abstraction. There is no import cycle: `explain-answer` imports only a type from `verify/semantic`, `verify/` never imports `explain/index.js`, and `Buffer` is a global (the same as `statement-schema.ts:47`), so `verify-no-io` holds.
- **BLOCKING: the scenario paths are not acme-shop's.** explain → "Citations that support their statement are entailed and facts" (reused by "A valid but irrelevant…", "A cached pair is not verified again by a second answer", "An unavailable verifier…") pins `E1` = `src/Pricing/PriceCalculator.php` 10–24 and `E2` = `src/Orders/OrderService.php` 30–41. Those paths come from the ticket's example and do not exist in acme-shop: the anchor is `app/Services/PriceCalculator.php` 16–44, and the heuristic span is found at run time (`tests/unit/explain/explain-verification.spec.ts:73`).
  - `doubles()` / `threeSpans` / `ownGraph` cannot produce a `heuristic` span, because `ownGraph` has `edges: []`.
  - No task creates such a fixture.
  - A test named exactly after the scenario would have to invent a graph, or ignore the GIVEN.

  The same applies to "a file of `E2` whose lines 30–41 changed".
- **Improvable: "the model received … none the second time".** In explain → "An unavailable verifier degrades every uncached pair…", the phrase is ambiguous with `withDailyBudget` (`budget.ts:56-59`): the wrapper receives one `verify` call and throws, while the inner model receives none. Also, `sumCostSince` is `notImplemented` in `tests/support/in-memory-store.ts:285`, so the test must pass its own spend source (task 6.7 implies this). Say "the inner scripted model received no `verify` request, and the spend was read twice".
- **Improvable: explain-level tests can only check `costUsd` = 0.** `SCRIPTED_MODEL` is not in `COST_TABLE`, so `costUsd` is always 0 at the `explain` level. A wiring bug that drops the cost would pass there; only `semantic.spec.ts` (4.9) checks a non-zero cost. Accept this, but say it in design S11.

## 9. Task size

- **Improvable: task 9.2 is too big.** It edits about 15 scenarios across `explain.spec.ts`, `explain-verification.spec.ts`, `tests/integration/explain/explain.spec.ts`, `verify-answer.spec.ts`, the subject test and `tests/integration/cli/ask-command.spec.ts`. That will not fit in one agent turn. Split it per file (9.2a…9.2e), each with its own run.
- 6.3 is large but cohesive (types plus wiring). The other tasks fit.

## 10. Mandatory steps

The section with the branch is Step 0. 0.1 (Linear In Progress) before 0.2 (branch) follows the project's Linear-state rule. The `(MANDATORY)` labels, `AGENT MUST EXECUTE`, report paths, restoration (10.6, 11.6), the E2E step and Pre-merge Review last are all present.

- **BLOCKING (tied to the `order` decision in section 5): 9.1/9.2 miss existing tests that will break.**
  - `tests/unit/explain/explain.spec.ts:727` asserts `d.order` (see section 5).
  - `tests/integration/cli/ask-command.spec.ts:282` asserts `expect(during).toHaveLength(1)`: its wrapper counts every `complete` call, and with one `verify` call there are 2.

  The grep in 9.1 (`requests).toHaveLength|requests.length|…`) catches neither, and 9.3 claims the Prior-claims test runs unchanged. This goes against the design goal "Existing tests change only where the spec changes" (design → Goals).
- **Improvable: 14.1 links a PR that does not exist yet.** It sets DIS-70 to In Review "linking the PR" before 15.1 opens the PR. Move the state change after 15.1.
- **Improvable: 3.3 runs before `semantic.ts` exists.** It tests "The cache holds no text", whose GIVEN is "checked once and cached", but `semantic.ts` arrives in 4.3. Move that test after 4.3, or reword the GIVEN to "a pair's key stored with `true`".

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| ev-ver: Output policy over typed statements | 3 scenarios (keeps valid / drops / nothing left) | 5.4 |
| ev-ver: Semantic citation check | Each distinct pair is verified once in order | 4.2, 4.3 |
| | The verifier receives only the wrapped statement and excerpt | 4.4 |
| | Only a conforming output entails | 4.5 |
| | An unavailable verifier degrades the remaining pairs | 4.6 |
| | Other verifier failures propagate | 4.7 |
| | Evaluation mode verifies nothing | 4.8 |
| | The usage counts only the verifier's resolved calls | 4.9 |
| ev-ver: Verification cache | A cached pair is not verified again | 4.10 |
| | A changed statement or excerpt misses the cache | 4.10 |
| | The in-memory cache evicts the least recently used key | 3.1, 3.2 |
| | The cache holds no text | 3.3 (order defect, see section 10) |
| ev-ver: Entailment policy | A fact needs every citation entailed | 5.1, 5.2 |
| | An entailed heuristic statement stays an inference | 5.3 |
| | No statement is dropped for a cited citation | 5.3 |
| explain: Precedence | no-anchor, llm-required, over-budget, failing prior-claims, unknown project, verification read failure, no verification read, anchored once | 9.3 |
| | discarded output, no statements, model failures, every citation broken | 9.2 |
| | A verifier failure other than unavailable or budget propagates without writing | 6.8 |
| explain: Answer with typed statements | typed/stored/returned, re-index stale, cited spans one read, broken citation | 9.2 |
| | fact stored as inferred, evidence lists every citation | 9.3 |
| | subject of a claim | 9.3 (must be 9.2, see section 6) |
| | Citations that support… entailed and facts | 6.2, 6.3 |
| | A valid but irrelevant citation… | 6.4 |
| | A cached pair is not verified again by a second answer | 6.5 |
| | An invalid verifier output degrades its pair to cited | 6.6 |
| | An unavailable verifier degrades every uncached pair… | 6.7 |
| | *(missing)* provenance type capped by the entailment policy | **no scenario, no task: blocking** |
| explain: Persistence failure | failed write (memory, DB), unsaved keeps verified | 9.2 |
| | Other write errors propagate | 9.3 |
| | An unsaved answer carries its verification, usage and unverified events | 6.9 |
| explain: Events and logging | writes nothing to console, evidence broken events | 9.2 |
| | sanitisation first, no sanitisation without prompt | 9.3 |
| | Entailment unverified events follow… | 6.10 |
| claims-and-typing: Statement typing | 2 scenarios | 9.3 |
| cli-ask: Ask answer output | A typed answer is printed… | 9.2 |
| | stale, unsaved note, span cited twice, broken logged as error, explain receives only id and question | 9.3 |
| | An unverified entailment is logged as information | 7.2 |
| | Explain receives a new verification cache per run | 7.1 |

The only empty row is the missing provenance scenario, which is blocking.

### Notes on D5–D8 (open defaults)

D5, D7 and D8 are coherent with the code and the specs; the open points are Q1 (D5 prompt), Q6 (D6 counting) and Q4 (consequence of D8/D1).

Every number in the scenarios adds up:
- 8 outputs → 2 accepted, 4 + 1 `invalid-output`, 1 at 1 024 bytes accepted; 8 calls; 3 cached.
- 3 × (100 × 1 + 5 × 2) / 1e6 = 0.00033.
- 300/15 and 200/10 tokens.
- 0 calls / 3 hits, then 1 call / 2 hits.
- 2 `verify` requests for the broken-E3 case (S1 and S2 have different texts, so they are distinct pairs).

---

## Corrections to apply

### `specs/explain/spec.md`

1. **"Citations that support their statement are entailed and facts"**
   - Replace the GIVEN's pack with: "a pack whose `E1` is the `anchor` span of `app/Services/PriceCalculator.php` and whose `E2` is a `heuristic` span of another file (on acme-shop, found at run time as in the other scenarios of this requirement)".
   - Replace "the three stored evidence rows have verification `entailed`" with "the claim items the store received hold three evidence rows with verification `entailed`, in both runs".
2. **"A cached pair is not verified again by a second answer"**
   - Replace "over a file of `E2` whose lines 30–41 changed at the pack's commit" with "over the file of `E2` with one line inside `E2`'s range changed at the pack's commit".
3. **"A valid but irrelevant citation is cited and never a fact"**
   - Add: "**AND** the two stored claims' provenances hold the statement types `INFERENCE` and `INFERENCE`, and when the same question is explained again, the prior claim of S1 is shown `INFERENCE`" (this closes the blocking traceability hole).
4. **"An unavailable verifier degrades every uncached pair and the answer is stored"**
   - Replace "the model received exactly one `verify` request the first time and none the second" with "the scripted model received exactly one `verify` request the first time; the second time the wrapped model was asked once with the purpose `verify`, failed it with `BudgetExhausted`, and the scripted model received no `verify` request".
5. **"Entailment unverified events follow the evidence broken events and carry no content"**
   - Add a statement S0 before S1 whose only citation is broken, so the event carries `statementIndex: 0` while S1 was the model's second statement. Alternatively, add a scenario where the failed pair is on the answer's second statement (`statementIndex: 1`).

### `specs/evidence-verification/spec.md`

6. **"Semantic citation check" → "Each distinct pair is verified once in order":** add "**AND** each request was sent only after the previous one had resolved".
7. **"Only a conforming output entails":** replace "pairs are checked" with "eight distinct pairs are checked".
8. **"Verification cache":**
   - Replace "two pairs share a key exactly when they are the same pair" with "two pairs whose requests are identical share a key, and a pair whose statement text, path, lines, excerpt or truncation mark differs, as sent, gets another key".
   - Replace "a positive integer" with "a positive safe integer".
   - Add: "Storing a key the cache already holds SHALL replace its verdict and make it the most recently used, without evicting another key."
9. **"The cache holds no text":** say how the contents are observed, e.g. "**WHEN** every key and value the semantic check stored in the cache is recorded and serialised".

### `design.md`

10. **S3:** "`set` deletes an existing key before re-inserting it; it evicts `map.keys().next()` only when the key is new and the map holds `maxEntries` keys."
11. **S10:**
    - State what a `verify` request records in `order`. Recommended: `order.push('verify')`, so `'complete'` keeps meaning the `answer` call and `explain-doubles.ts:60` is unchanged.
    - List the tests this touches.
12. **S11:** "The `explain`-level `costUsd` is 0 (the scripted model has no price); the non-zero cost is covered only by `semantic.spec.ts`."
13. **S12, or a new Decision:** record the answers to Q1–Q6.

### `tasks.md`

14. **9.1:** add `order).toEqual\|during).toHaveLength` to the grep.
15. **9.2:**
    - Add `tests/unit/explain/explain.spec.ts` "Prior claims show their displayed type and stale warning" (line 727, `order`, only if S10 keeps pushing `'complete'`).
    - Add `tests/integration/cli/ask-command.spec.ts` "answers through the default pool without holding a transaction while the model answers" (line 282, `during` length 1 → 1 + the number of `verify` calls, or filter by `purpose`).
    - Move "The subject of a claim is the symbol of its first cited span" here from 9.3 (new `toClaimItems` parameter).
    - Split 9.2 into one sub-task per test file.
16. **3.3:** move the test "The cache holds no text" to after 4.3, or reword its GIVEN (correction 9).
17. **13.1:** "readme §2.1 (line ~445) and §2.2 (verifier row, line ~477)".
18. **13.2:** "update `docs/project-context.md` lines ~586 (a `verify` call's `BudgetExhausted` / `LlmUnavailable` no longer propagate), ~587-588 (`ExplainEvent` union) and ~597-598 (new rows `entailed` or `cited`)".
19. **New 15.x before the archive:** "update the Purpose of `openspec/specs/evidence-verification/spec.md` to include the semantic check and the entailment policy".
20. **14.1:** move "set DIS-70 to In Review with a comment linking the PR" to after 15.1.

### Linear (Spanish; never the `[original]` block)

21. **DIS-70, comment** (or the end of `[enhanced]`): "Spec-audit 2026-10-15: `verifyEntailment(llm, cache, pairs, costTable?)` recibe un cuarto parámetro opcional solo para que los tests puedan poner precio al modelo del verificador; `explain` no lo pasa. Decisiones pendientes de la autora: Q1–Q6 del informe `openspec/changes/evidence-verifier-semantic/reports/<fecha>-spec-audit.md`." Once the author answers, transcribe her answers to Q1–Q6 into `[enhanced]` under "Decisiones".
22. **DIS-56, comment** (if the author confirms Q5): "La sub-issue DIS-70 (decisión D1 de la autora, 2026-10-15) sustituye el criterio «o a `UNKNOWN` si no le queda ninguna `entailed`»: una afirmación con alguna cita `cited` se degrada a `INFERENCE` y nunca se elimina por ello; `UNKNOWN` solo por los motivos ya existentes."

---

## Resolution of the findings (2026-10-15)

Author decisions (asked through the session, recorded in `design.md` S13 and in a Spanish comment on
DIS-70):

| Question | Resolution |
|---|---|
| Q1 (D5) conjunctive statements | Decided by the author: accept the consequence; the prompt stays "the evidence alone shows the statement is true" |
| Q2 (D3) other verifier errors | Decided by the author: propagate, nothing written (spec unchanged) |
| Q3 (D2) cache bound | Decided by the author: 10 000, `RangeError` for a non positive safe integer |
| Q4 (D1) stored type | Decided by the author: the provenance stores the type after the entailment policy |
| Q5 (D1 vs DIS-56) | Decided by the author: Spanish comment on DIS-56 (posted 2026-10-15), no ADR (design S12) |
| Q6 (D6) repeated pairs | Decided by the author: neither a call nor a cache hit |

Corrections:

| # | Resolution |
|---|---|
| 1 | Fixed: the scenario uses the acme-shop anchor of `app/Services/PriceCalculator.php` and a run-time `heuristic` span; the claim items the store received are checked in both runs |
| 2 | Fixed: "one line inside `E2`'s range changed" |
| 3 | Fixed: provenance types `INFERENCE`/`INFERENCE` and the prior claim of S1 shown `INFERENCE` (closes the blocking traceability gap; task 6.4) |
| 4 | Fixed: wrapped model asked once and failing with `BudgetExhausted`, scripted model no `verify` request |
| 5 | Fixed: S0 dropped as broken, so `statementIndex` 0 names the model's second statement (task 6.10) |
| 6 | Fixed: "each request was sent only after the previous one had resolved"; design S10 describes the in-flight check |
| 7 | Fixed: "eight distinct pairs" |
| 8 | Fixed: key wording, "positive safe integer", re-storing a held key evicts nothing (plus `2 ** 53` in the scenario) |
| 9 | Fixed: the scenario reads the cache through a recording wrapper (design S3) |
| 10 | Fixed: design S3 |
| 11 | Fixed: design S10, `verify` pushes `'verify'` into `order`; affected tests listed |
| 12 | Fixed: design S11 |
| 13 | Fixed: design S13 |
| 14 | Fixed: task 9.1 grep |
| 15 | Fixed: 9.2 split into 9.2a–9.2e; adds the Prior-claims `order` test, the `during` integration test and the subject test |
| 16 | Fixed: "The cache holds no text" moved to task 4.11, after `semantic.ts` |
| 17 | Fixed: task 13.1 names §2.1 and §2.2 |
| 18 | Fixed: task 13.2 names the three spots of `docs/project-context.md` |
| 19 | Fixed: task 15.6 updates the Purpose of `evidence-verification` before the archive |
| 20 | Fixed: In Review moved to 15.2, after the PR opens |
| 21 | Fixed: Spanish comment on DIS-70 with Q1–Q6 and the `costTable` note (posted 2026-10-15) |
| 22 | Fixed: Spanish comment on DIS-56 (posted 2026-10-15) |

Not addressed separately: "the default cache bound has no cli-ask scenario" (low risk, as the
auditor notes; the bound is covered by `evidence-verification` "Verification cache").

---

## Second pass (2026-10-15)

CHANGES REQUIRED

One blocking finding: tasks 9.1/9.2 still missed existing tests the change breaks (B-1: `explain.spec.ts`
"builds the pack with the hops and budget of the request" and "stores each statement as an L2
inference that keeps its statement type"; `tests/unit/cli/ask-command.spec.ts` helpers `answered()` /
`statement()` and "resolves a sample's relative root path against the repository root";
`tests/integration/cli/ask-command.spec.ts` request count; the `explainQ1` helper of
`tests/integration/explain/explain.spec.ts`). Improvable: `VerifyScript` signature (I-4), dedup by pair
vs by key (I-5), `docs/project-context.md` lines ~575-582 (I-6), re-posting the DIS-56 comment (I-7),
ticket text lagging (I-8), red states between 5.5 and 6.3 (I-9), tests that may never be RED (I-10),
stale proposal wording on D5–D8 (I-11). No new author questions.

### Resolution

| # | Resolution |
|---|---|
| C1 | Fixed: 9.1 grep adds `requests\[` and `answered(` |
| C2 | Fixed: 9.2a drops the integration-only scenario and adds the two non-scenario unit tests |
| C3 | Fixed: new 9.2f (`tests/unit/cli/ask-command.spec.ts`); 9.2e adds the request count; 9.2d adds the `explainQ1` helper |
| C4 | Fixed: task 13.2 names lines ~575-582 |
| C5 | Fixed: task 13.3 only confirms the DIS-56 comment |
| C6 | Fixed: task 5.5 updates the `explain.ts` call site with a temporary cache; 6.3 replaces it |
| C7 | Fixed: 4.4, 4.10, 4.11 recorded as characterisation tests if they pass at once |
| C8 | Fixed: design S10 pins `VerifyScript` |
| C9 | Fixed: design S3, grouping by key |
| C10 | Fixed: spec "Semantic citation check", same pair = identical requests |
| C11 | Fixed: proposal Why points to design S13 |
| C12 | Fixed: Spanish comment on DIS-70 (2026-10-15) |

---

## Third pass (2026-10-15)

CHANGES REQUIRED

C1–C12 verified correct (C6 partly); the scan of `tests/` found the inventory of existing tests
complete. Findings: F1 (blocking) — the refactor step (old 8) could not be green before the existing
tests are updated, and 9.2c left `verify-answer.spec.ts` red from 5.5; F2 — 9.2d gave the
failed-write integration test the wrong reason (its own inline deps), and the grep missed it; F3 —
`proposal.md` Impact did not name `tests/support/explain-doubles.ts`. No new author questions.

### Resolution

| # | Resolution |
|---|---|
| F1 | Fixed: "Review and Update Existing Tests" is now step 8 (8.1–8.4) and "Core: refactor" step 9, "with the suite green after step 8"; the old 9.2c is folded into 5.5 (8.2c only re-runs the file); 5.5 states which `tests/unit/explain` tests stay red until step 8 and why; the step 10 report reference points to 8.2 |
| F2 | Fixed: 8.2d gives the failed-write test its own reason (inline deps gain `verificationCache`, one `verify` request); 8.1 grep adds `llm: model.llm` |
| F3 | Fixed: `proposal.md` Impact names `tests/support/explain-doubles.ts` |

---

## Fourth pass (2026-10-15)

APPROVED

F1–F3 verified fixed; numbering, mandatory steps, scenario coverage and red/green dependencies
coherent end to end. Three improvable findings, applied after the verdict:

| # | Resolution |
|---|---|
| I-1 | Fixed: 12.2 records that the CI evidence is collected in 15.3 (CI runs on `pull_request`); 15.3 first confirms the PR's CI run and links it in an addendum to the step 10 report |
| I-2 | Fixed: 5.5 names every suite that stays red until step 8, and the callers that throw from 6.3 until 7.1 / 8.2d |
| I-3 | Fixed: `proposal.md` says "per `ask` run" / "per-run cache" in What Changes, Capabilities and Impact; D2's quote of the ticket stays as is |

Final verdict: APPROVED. The apply may start.
