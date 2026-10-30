CHANGES REQUIRED

# Spec audit: `stale-claims-refresh` (DIS-42, parent DIS-29)

- Date: 2026-10-29
- Inputs read: `proposal.md`, `design.md`, `specs/explain/spec.md`, `specs/graph-store/spec.md`, `specs/golden-answers/spec.md` and `tasks.md`; Linear DIS-42 (description and its 3 comments) and parent DIS-29; `docs/base-standards.md`, `docs/openspec-tasks-mandatory-steps.md`, `docs/project-context.md` (base branch), `docs/AUTONOMOUS-RUN.md` (merge gate); the main specs `openspec/specs/explain`, `graph-store`, `graph-schema` and `golden-answers`; the code in `packages/core/src/explain/{explain,prior-claims,claim-items,prompt,sanitize,untrusted-text}.ts`, `packages/core/src/knowledge/{stored-claim,claim}.ts`, `packages/core/src/ports/StorePort.ts`, `packages/adapters/store-postgres/src/queries.ts`, `packages/cli/src/seed/fingerprint.ts`, `packages/cli/src/cache/answer-fingerprint.ts`, `packages/cli/src/commands/ask.ts`, `tests/support/{in-memory-store,scripted-llm}.ts` and `tests/unit/explain/explain.spec.ts`.

## Questions for the author

- **Q1 (scope).** Groups 10–10d (regenerating the seed and golden files with Ollama, plus a full blind-panel round DIS-42) and the whole `golden-answers` delta are not in DIS-42. They follow from a project rule: `packages/adapters/store-postgres/src` and `packages/core/src/knowledge` are seed fingerprint inputs (`packages/cli/src/seed/fingerprint.ts:30-41`), and ADR `20261017-stale-fingerprint-fails-verify` applies. Do you accept roughly 30 tasks of golden work inside this ticket, as in DIS-9?
- **Q2 (behaviour).** A cacheable answer stores its `priorClaims` "as shown" (`packages/core/src/cache/response-cache.ts:47-48`). A due claim that was not refreshed is then frozen as `stale` in that cache entry until the next re-index, because a cache hit never refreshes (R5). This covers a claim past the cap of 3, `llm-unavailable`, `budget-exhausted`, `superseded` and `store-write-failed`. Should an answer that carries a due claim that was not refreshed be stored in the cache anyway (the current design), or be non-cacheable?
- **Q3 (provenance).** Step 5 of the spec, following AC 1 of the ticket, writes `provenance.inputSpans` = every sanitised span of the pack. The refresh prompt, however, only sends the spans that overlap the claim. The provenance would then name inputs the model never saw. Keep "every span of the pack" as the ticket says, or record only the refresh prompt's spans?

## 1. Scope against the ticket

Not in the sub-issue (list for the author to cut or confirm):

- **Improvable.** Groups 10, 10b, 10c and 10d and the whole `specs/golden-answers/spec.md` delta: seed and golden regeneration and the DIS-42 panel round (see Q1). They are derived from a project invariant, not invented, but the ticket says nothing about them. Task 10d.3 also opens Linear issues for `incorrect` items (DIS-9 precedent).
- **Improvable.** Task 5.6 rewrites the comment of `packages/core/src/verify/syntactic.ts:10`. It is harmless (the file is not a fingerprint input) but it is not in the ticket and not in the proposal's Impact list.
- **Improvable.** P4 (unsaved answers also refresh) widens R5 of the ticket ("después de guardar las afirmaciones de la respuesta"). It is consistent with "answered answers", but it is a scope choice the ticket did not make.

Nothing else goes beyond the sub-issue. The change does not widen to the whole user story of DIS-29.

## 2. Inherited acceptance criteria

- DoD and ACs 1–5 of DIS-42 each have a requirement and a scenario:
  - AC1: "A stale claim is refreshed after a re-index" and "A stale prior claim is refreshed on the first question…".
  - AC2: "A refresh without backing leaves the claim stale".
  - AC3: "An unavailable model or an exhausted budget stops the refresh".
  - AC4: "A refresh that is no longer due is superseded…" plus graph-store "A refresh that is no longer due writes nothing" (two refreshes in a row).
  - AC5: "At most three stale claims are refreshed per question".
- The parent DIS-29 AC "a stale claim … never as `FACT`" is kept in the modified "Prior claims".
- No conflict between the sub-issue and the parent. Clean.

## 3. Missing scenarios

All improvable:

- **3.1** explain "Stale claim refresh": "a `verify` call of a refresh failing with either [`LlmUnavailable`/`BudgetExhausted`] leaves its pairs `cited`" has no scenario. The refresh then goes on and writes a `current` claim with `cited` evidence and type `INFERENCE`. Add a scenario.
- **3.2** "Any other failure of a refresh … SHALL propagate": only a `verify` call failure is covered. Add a verification-read failure (other than a missing file) and a `refreshClaim` rejection that is not `ClaimWriteFailed` to "A failure inside a refresh propagates after the row". The list in the requirement also leaves out the refresh's own `answer` call failing with any other error (design D8 propagates it). Add it to the text.
- **3.3** "its cache entry holds the prior claims as shown": no scenario. Add an AND clause to "A stale prior claim is refreshed…": the saved cache entry's `priorClaims` holds `c1` as `current`.
- **3.4** graph-store "Claim refresh":
  - "with the claim's row locked against another refresh" is only covered by two sequential calls. Concurrency is not exercised. Acceptable, but say so in the design, or add a two-connection test.
  - "A failure to obtain a connection … propagates unchanged" has no scenario. This is the same gap as "Claim write".

## 4. Ambiguity

The only hit for the listed words is "however many statements cite it" (explain delta, l. 262). It is precise wording, not a defect. Clean.

## 5. Open decisions

- **B3, blocking.** The in-memory double has no "last written" instant. Its `StoredClaimRow` is `{ projectId, claim: StoredClaim }` (`tests/support/in-memory-store.ts:146-149`), and `StoredClaim` only has `createdAt` (`packages/core/src/knowledge/stored-claim.ts:45-52`). The graph-store requirement says the double "SHALL behave the same way", including setting that instant. The unit scenario "A refresh without backing leaves the claim stale" asserts that the store holds `c1` with "the instant it was last written" unchanged. The implementer has to decide alone whether the double gains an `updatedAt` (and how it is stamped and exposed), or how the unit test observes that clause. Fix it in design D6/D11 and task 2.3.
- **Improvable.** "A due claim with no overlapping span gets `no-evidence` without a call" is decided only in design D3. Move it into spec step 1.
- **Improvable.** Design D8: "`onSemanticStart` sets it to `null` and each returned check adds its `latencyMs` back". Once the value is `null`, the previous sum is lost (`explain.ts:347-356` assigns, it does not accumulate). State that a separate accumulator keeps the sum of the returned checks and `verifyLatencyMs` is set to `accumulated + latencyMs` when each check returns.

## 6. Contradictions inside the change

- **B2, blocking.** The definition of a due claim disagrees:
  - Design D2, the proposal ("`L2` `INFERENCE` only", with an object), follow-up R10 and the ticket's R10 all require `object !== null`.
  - The spec's due clause ("status `stale`, layer `L2`, type `INFERENCE` and its provenance holds a statement type") does not.
  - `claimSchema` allows a null `object` on any layer (`packages/core/src/knowledge/claim.ts:73`), so a stale `L2` `INFERENCE` claim with a statement type and no object is due by the spec and not by the design.
  - Fix: add "and a non-null object" to the spec.
- **Improvable.** Proposal → Impact leaves out three files the tasks touch: `packages/core/src/explain/usage.ts` (`sumVerificationUsage`, D9), `packages/core/src/verify/syntactic.ts` (comment, task 5.6) and `prompts.md` (task 13.3).

## 7. Contradictions with the project

- **B1, blocking.** The main spec's "Precedence and UNKNOWN answers" (`openspec/specs/explain/spec.md:87-126`) says "each step SHALL make exactly the calls below" and step 8 says "Ask the model once, with the purpose `answer`". The steps end at 13 (store and return), and the cache paragraph puts the cache save right after the claim write. The delta adds up to three more `answer` calls, plus their `verify` calls and `refreshClaim`, after step 13 without modifying this requirement. The two requirements would contradict each other after sync. The delta must MODIFY "Precedence and UNKNOWN answers":
  - step 8 becomes "Ask the model once, with the purpose `answer`, for the answer";
  - add step 14 "For an answered answer, refresh the due stale prior claims (requirement "Stale claim refresh")";
  - the cache paragraph says "after the claim write and the stale claim refresh".
- **Improvable.** The Purpose header of the main explain spec (l. 4-5, "asks the model once") should be updated at sync.
- Checked and consistent:
  - `graph-schema` l. 658-659 ("MUST NOT turn any claim back to `current`: recomputing claims is the lazy re-inference's job") is about the database trigger.
  - `graph-store` l. 180 is about the graph write.
  - Neither forbids the new store operation.
  - The MODIFIED "Explain events and logging", "Answer usage" and "Query log" keep every clause of the main spec. Base branch `final-project-CRN` matches `docs/project-context.md:545`.

## 8. Contrast with the real code

- The ADR, prompt, sanitisation, record and store plan fit the code:
  - `sanitizeForPrompt` returns `questionFlags` (`sanitize.ts:51`), which can serve as `claimFlags`.
  - `wrapUntrusted(id, …)` accepts any id (`untrusted-text.ts:35`).
  - `toClaimItems` already builds the record of D5 (`claim-items.ts:90-125`).
  - `INSERT_CLAIMS` uses `clock_timestamp()` while the trigger uses `now()` (`queries.ts:27,253-259`), so `updated_at` advances inside the harness transaction as the DoD needs.
  - `CHECK_CLAIM_FILES` takes `FOR SHARE` (`queries.ts:246-249`), which is compatible with a later row-level `FOR UPDATE`.
  - The CLI logs every event generically (`packages/cli/src/commands/ask.ts:110-112`).
  - None of `ANSWER_FINGERPRINT_FILES` (`packages/cli/src/cache/answer-fingerprint.ts:13-27`) is edited.
- **Improvable (accepted duplication).** `refresh-prompt.ts` repeats the evidence mapping of `prompt.ts:72-95`. This is deliberate (P1: editing or extracting from `prompt.ts` would change the answer fingerprint). Keep task 4.1's field-by-field equality test as the guard; it is already planned.
- **Improvable.** `REFRESH_SYSTEM_PROMPT` reuses "the same untrusted-data lines" as the explain prompt. The explain head line names `"questionFlags"` (`prompt.ts:25`). D4 should say that the refresh prompt names `"claimFlags"` and `claim` instead, or the model is told about a key that is not there.
- **B3** (point 5) also comes from this check: `tests/support/in-memory-store.ts:146-149`.

## 9. Task size

All improvable:

- **5.2**: 11 RED `it`s in one task, several with heavy setups (six-read clock, usage figures, the injected sanitisation case). Split it in two or three groups, for example selection and stop rules / prompt and usage / failure and order.
- **5.5**: the whole of `stale-refresh.ts` (D2, D3, D4 wiring, D5, D8, D10) in one GREEN task. Split it into due selection and spans; output, verification and record; and store write, codes and stop rule.
- The other tasks fit one turn. 10.2 is long but is already planned as a detached process.

## 10. Mandatory steps

- Step 0 is the branch creation and comes first, labelled MANDATORY, with the right base and name.
- Present and labelled: Review existing tests (8), Run tests and verify data state (9, report path and template named), Manual interface testing (11, AGENT MUST EXECUTE, with restoration in 11.6), End-to-end (12, justified as not applicable), Documentation (13), Pre-merge review last (15, three checks in order, fixes on the same PR, archive before merge).
- Mutating steps restore state: 0.4/6.2/9.5 and 11.6.
- **Improvable.** Steps 10, 10b, 10c and 10d are not numbered sequentially (checklist §4, "Steps are numbered sequentially"). This is a DIS-9 precedent; renumber or accept.
- **Improvable.** Task 15.7 has the agent merge. That is valid only with `KIT_AUTONOMOUS_RUN="1"` (`docs/AUTONOMOUS-RUN.md` §2 table, §5); otherwise `docs/openspec-tasks-mandatory-steps.md` §3 point 5 and base rule 9 apply. Add "only in an autonomous run through the merge gate; otherwise the author merges".

## 11. Traceability

| Requirement | Scenario(s) | Task(s) |
|---|---|---|
| explain · Stale claim refresh (ADDED) | the 10 unit scenarios (refreshed on first question, without backing, unavailable/budget, superseded/write failed, at most three, only L2 inference, nothing without live answered answer, prompt untrusted, usage, failure propagates) | 4.1–4.2, 5.1, 5.2, 5.4, 5.5, 5.6 |
| explain · Stale claim refresh (ADDED) | "A stale claim is refreshed after a re-index" (DoD) | 6.1, 6.2 |
| explain · Prior claims (MODIFIED) | "Prior claims show their displayed type and stale warning" (changed) | 5.3, 5.6 |
| explain · Prior claims (MODIFIED) | "Prior claims are read over the kept lines of a cut span" (unchanged) | 8.2 (existing test) |
| explain · Explain events and logging (MODIFIED) | "Stale claim events follow the write event and precede the row event" | 1.1, 1.2, 5.2, 5.6 |
| explain · Explain events and logging (MODIFIED) | unchanged scenarios | 8.2 |
| explain · Answer usage (MODIFIED) | unchanged scenarios; refresh case in "The refresh calls count in the answer usage and its row" | 5.2, 5.4, 5.6, 8.2 |
| explain · Query log (MODIFIED) | unchanged scenarios; refresh case in "A failure inside a refresh propagates after the row" | 5.2, 5.6, 8.2 |
| **explain · Precedence and UNKNOWN answers (must be MODIFIED, B1)** | **— (hole)** | **— (hole)** |
| graph-store · Claim refresh (ADDED) | 4 Postgres scenarios | 2.1, 3.1, 3.2, 3.3 |
| graph-store · Claim refresh (ADDED) | 4 in-memory scenarios | 2.1, 2.2, 2.3 |
| golden-answers · Blind panel input (MODIFIED) | "The panel input projects…" | 10b.3, 10b.4 |
| golden-answers · Panel outputs (MODIFIED) | "Each panelist output judges…", "The resolution answers exactly the disagreements", "Invalid panel outputs are rejected" | 10b.4, 10c.1–10c.4, 10d.1 |
| golden-answers · Golden review report (MODIFIED) | "The report's verdicts and agreement match…", "The report states its criterion, panel and limitations" | 10b.2, 10d.4 |
| golden-answers · Criterion first and immutable panel record (MODIFIED) | "The report's criterion is the Panel group's criterion", "The criterion precedes the input…" | 10b.2, 10b.4, 10d.6 |

The empty row (Precedence and UNKNOWN answers) is blocking and is resolved by B1.

## Corrections to apply

### `specs/explain/spec.md`

1. **(B1)** Add under `## MODIFIED Requirements` the whole requirement `### Requirement: Precedence and UNKNOWN answers`, copied from `openspec/specs/explain/spec.md:87-126`, with these changes:
   - step 8: "Ask the model once, with the purpose `answer`, for the answer.";
   - new step 14: "When the answer is answered (stored or not), refresh the due stale prior claims (requirement "Stale claim refresh"); an `UNKNOWN` answer, a cache hit and evaluation mode refresh nothing.";
   - the paragraph after the list: "A cacheable answer of steps 10 and 13 SHALL be saved in the answer cache after the claim write and, for an answered answer, after the stale claim refresh, and before its `query_log` row (requirement "Answer cache")."
   - Keep its existing scenarios verbatim.
2. **(B2)** "Stale claim refresh", first paragraph: replace "its type `INFERENCE` and its provenance holds a statement type (the claims explain writes)" with "its type `INFERENCE`, its object is not null and its provenance holds a statement type (the claims explain writes)". In the list "Every other prior claim (current, `L1`, `L2` `UNKNOWN`, or past the limit)", add "an `L2` `INFERENCE` claim without object or without statement type".
3. Step 1 of "Stale claim refresh" (improvable): append "; a due claim with no such span gets the code `no-evidence` without a model call".
4. Failure paragraph (improvable): replace "(a verification read other than a missing file, a `verify` call, or the claim refresh other than `ClaimWriteFailed` and its not-written result)" with "(the refresh's `answer` call with an error other than `LlmUnavailable` and `BudgetExhausted`, a verification read other than a missing file, a `verify` call, or the claim refresh other than `ClaimWriteFailed` and its not-written result)".
5. Add scenarios (improvable):
   - "A refresh whose verifier is unavailable stores cited evidence": the refresh `verify` call fails with `LlmUnavailable`; `c1` is rewritten `current`, type `INFERENCE`, evidence `cited`, with no `stale_claim_not_refreshed` and no `entailment_unverified` event.
   - Add to "A failure inside a refresh propagates after the row" the variants of a verification read failing with an error other than a missing file, and `refreshClaim` rejecting with an `Error` that is not `ClaimWriteFailed`.
   - Add to "A stale prior claim is refreshed on the first question that reaches it": "**AND** the saved cache entry's `priorClaims` holds `c1` `current`".

### `specs/graph-store/spec.md`

6. (improvable) State whether concurrency is tested. Either add the scenario "Two concurrent refreshes of one claim write once" (two connections, the second resolves `{ refreshed: false }`), or add a design note that the row lock is covered only by the sequential case.

### `design.md`

7. **(B3)** D6/D11:
   - Add "The in-memory double keeps an `updatedAt` per claim row: a seeded claim gets its `createdAt`, a refresh sets it to the next stamp after every stamp so far; `claims()` exposes it."
   - Name the field and its accessor, and reflect it in task 2.3.
   - Alternative: reword the unit-level clause "the instant it was last written" to "and `calls.refreshClaim` wrote nothing".
8. D2: keep `object !== null` and quote the corrected spec clause (B2).
9. D3: move the "no overlapping span → `no-evidence`" sentence into the spec (correction 3) and reference it.
10. D4: "the untrusted-data line names `claimFlags` and `claim` instead of `questionFlags` and `question`".
11. D8: rewrite the latency sentence: "`CallState` keeps `verifySumMs` (the sum of the checks that returned); `onSemanticStart` sets `verifyLatencyMs` to `null`; when a check returns, `verifySumMs += latencyMs` and `verifyLatencyMs = verifySumMs`."
12. Risks: add the cache-freeze consequence of Q2 and the author's decision. Follow-ups: record the answers to Q1–Q3 (destination C until decided).

### `proposal.md`

13. Impact → Core: add `packages/core/src/explain/usage.ts` and `packages/core/src/verify/syntactic.ts` (comment). Docs: add `prompts.md`. What Changes: after "`L2` `INFERENCE` only", add "with an object and a statement type".

### `tasks.md`

14. 2.3: add the double's `updatedAt` (B3).
15. Add a new task, or extend 5.2/5.3, to cover the modified "Precedence and UNKNOWN answers" (B1). Its existing scenarios keep their tests; 8.2 lists the requirement among the modified ones.
16. Split 5.2 into 5.2a/5.2b/5.2c and 5.5 into 5.5a/5.5b/5.5c (point 9).
17. 15.7: prefix "Only in an autonomous run (`KIT_AUTONOMOUS_RUN="1"`), through the merge gate; otherwise the author merges."
18. 8.2: add the new scenarios of corrections 5 and 6 to the mapping.

### Linear DIS-42 (never the `[original]` block)

19. In the `[enhanced]` part, under "Contexto técnico → Seguridad", replace «eventos de saneado incluidos» with: «los eventos de saneado, cuarentena y verificación del recálculo no se añaden a la respuesta (nombrarían ids de otro prompt); las marcas del enunciado guardado van en el prompt como `claimFlags` (P2)». Under "Re-inferencia (R2)", change the ids `e1…` to `E1…`.
20. Comment in Spanish: «Auditoría de especificación del cambio `stale-claims-refresh` (2026-10-29): `CHANGES REQUIRED` con tres hallazgos bloqueantes: (1) el delta de `explain` debe modificar «Precedence and UNKNOWN answers» (el paso 8 dice «una sola llamada `answer`» y el recálculo añade llamadas tras el paso 13); (2) la definición de afirmación «due» de la spec omite `object` no nulo, que sí exigen el diseño y R10; (3) el doble en memoria no guarda el instante de última escritura que pide un escenario. Preguntas para la autora: aceptar la ronda golden DIS-42 dentro del ticket; si una respuesta con afirmaciones `stale` sin recalcular debe guardarse en la caché; y si `inputSpans` debe ser todo el pack o solo los spans del prompt de recálculo.»

## Resolution of run 1

*Agent's text: correction round 1 of 5 (`docs/AUTONOMOUS-RUN.md` §6), 2026-10-29. The questions were
decided by the agent as lead engineer, without the author; each decision is in `design.md` →
Follow-ups (A0–A9) with its destination. `openspec validate stale-claims-refresh --strict` passes
after the corrections.*

### Questions for the author

- **Q1 (scope)** — decided by the agent (A0, destination A): the seed and golden regeneration and the
  DIS-42 panel round stay in the change; they follow from the seed fingerprint invariant, and without
  them the `verify` job fails and the PR cannot merge.
- **Q2 (cache)** — decided by the agent (A1, destination D): such an answer stays cacheable; the
  cached claim is shown `stale` with its warning until the entry is invalidated. Added to design
  Risks and as a sentence of "Stale claim refresh".
- **Q3 (provenance)** — decided by the agent (A2, destination A): `inputSpans` keeps every sanitised
  span of the pack, as AC 1 of the ticket says and as an answer's claims record it.

### Blocking findings

- **B1** — fixed: the explain delta now modifies "Precedence and UNKNOWN answers" (copied whole from
  the main spec with its scenarios unchanged): step 8 is the answer's `answer` call, step 13 stores,
  new step 14 refreshes and returns, the cache paragraph puts the save after the refresh, and the
  call counts, source reads and error paragraph name the refresh calls. Design D1 points to it;
  tasks 5 and 5.6 name it; 8.2 maps its unchanged scenarios to their existing tests.
- **B2** — fixed: the due clause requires a non-null object, and the list of claims not refreshed
  names an `L2` `INFERENCE` claim without object or without statement type. The scenario "Only stale
  L2 inference claims are refreshed" gains such a claim; design D2 quotes the clause; proposal What
  Changes says "with an object and a statement type".
- **B3** — fixed: the in-memory double keeps `updatedAt` per claim row and exposes it through
  `claimUpdatedAt(claimId)` (design D6, D11, A6; task 2.3); the graph-store requirement says the
  double exposes the last-written instant and its in-memory "refreshed in place" scenario asserts it.

### Improvable findings

- 1 (groups 10–10d and the `golden-answers` delta) — decided by the agent: kept (Q1, A0).
- 1 (task 5.6, comment of `syntactic.ts`) — decided by the agent: kept, since the comment becomes
  false (A4); the file is now in the proposal's Impact.
- 1 (P4, unsaved answers refresh) — decided by the agent: kept (A3).
- 3.1 — fixed: new scenario "A refresh whose verifier is unavailable stores cited evidence".
- 3.2 — fixed: the failure list names the refresh's `answer` call with another error; "A failure
  inside a refresh propagates after the row" gains the verification read and claim refresh variants.
- 3.3 — fixed: the first scenario asserts the saved cache entry's `priorClaims`.
- 3.4 — fixed by a design note (D6, A7): the row lock is tested only sequentially, and the
  connection failure has no scenario, as for "Claim write".
- 5 (no overlapping span) — fixed: moved into step 1 of the spec; D3 references it.
- 5 (latency accumulator) — fixed: D8 rewritten with `verifySumMs`; task 5.6 names it.
- 6 (Impact) — fixed: `usage.ts`, `syntactic.ts` and `prompts.md` added to the proposal.
- 7 (Purpose header) — decided by the agent: updated at sync (A8, task 15.7).
- 8 (duplicated evidence mapping) — accepted as the audit says; task 4.1 keeps the guard.
- 8 (untrusted-data line) — fixed: D4 says the refresh prompt names `claimFlags` and `claim`.
- 9 (task size) — fixed: 5.2 split into 5.2a–5.2c and 5.5 into 5.5a–5.5c.
- 10 (numbering of 10–10d) — rejected: the groups are sub-steps of one step (DIS-9 precedent), and
  renumbering would shift every mandatory step and cross-reference (A5).
- 10 (task 15.7 merge) — fixed: the merge happens only in an autonomous run through the merge gate,
  otherwise the author merges (A9).

### Linear

- Correction 19 — fixed: the `[enhanced]` "Seguridad" bullet now says the refresh's sanitisation,
  quarantine and verification events are not added (P2), and "Re-inferencia (R2)" uses `E1…`.
- Correction 20 — fixed: a Spanish comment on DIS-42 summarises the audit and the decisions of this
  round.

---

## Run 2 (2026-10-29)

APPROVED

# Spec audit: `stale-claims-refresh` (DIS-42, parent DIS-29), run 2

- Date: 2026-10-29
- Inputs read:
  - The change: `proposal.md`, `design.md` (Follow-ups R1–R14, P1–P11, A0–A9 included), `specs/explain/spec.md`, `specs/graph-store/spec.md`, `specs/golden-answers/spec.md`, `tasks.md`, and the run 1 report with its resolution section.
  - Linear: DIS-42 (description and its 4 comments) and its parent DIS-29 (description and its comment).
  - Project docs: `docs/base-standards.md`, `docs/openspec-tasks-mandatory-steps.md`, `docs/project-context.md` (stale, re-index and fingerprint sections), `docs/backend-standards.md`, the list of ADRs.
  - Main specs: `openspec/specs/explain` (Purpose, Precedence, Untrusted content sanitization, Prompt and evidence ids, Answer with typed statements, Persistence failure, Prior claims, Question and answer language), `graph-store`, `graph-schema` (stale trigger) and `golden-answers`.
  - Code: `packages/core/src/explain/explain.ts`, the exports of `untrusted-text.ts`, `sanitize.ts`, `usage.ts`, `prior-claims.ts` and `claim-items.ts`, `packages/cli/src/cache/answer-fingerprint.ts`, `packages/cli/src/seed/fingerprint.ts`, the migrations (`updated_at`, triggers), `tests/support/in-memory-store.ts`, `tests/support/explain-doubles.ts`, `tests/unit/explain/explain.spec.ts`, `tests/unit/explain/explain-cache.spec.ts`, `tests/integration/api/reindex.spec.ts`.

## Questions for the author

None. The three questions of run 1 were settled by the agent (A0, A1, A2). None of those answers contradicts the ticket or the project: A2 follows AC 1 literally, and A0 follows ADR `20261017-stale-fingerprint-fails-verify`.

## 1. Scope against the ticket

Clean.

- The improvable scope points of run 1 have recorded decisions that fit the ticket:
  - groups 10–10d and the `golden-answers` delta (A0);
  - P4, unsaved answers also refresh (A3; R5 says «respuestas `answered`»);
  - the comment of `syntactic.ts` (A4).
- The change does not grow into the whole user story of DIS-29.

## 2. Inherited acceptance criteria

Clean. The DoD and ACs 1–5 of DIS-42 each map to a requirement and a scenario:

| Criterion | Scenario(s) |
|---|---|
| AC1 / DoD | "A stale claim is refreshed after a re-index"; "A stale prior claim is refreshed on the first question that reaches it" |
| AC2 | "A refresh without backing leaves the claim stale" (the last-written instant is now observable through `claimUpdatedAt`) |
| AC3 | "An unavailable model or an exhausted budget stops the refresh" (resolved calls in the row) |
| AC4 | "A refresh that is no longer due is superseded and a failed refresh write is reported"; graph-store "A refresh that is no longer due writes nothing" (two refreshes in a row) |
| AC5 | "At most three stale claims are refreshed per question" |

The parent's criterion "a stale claim is never shown as `FACT`" stays in the modified "Prior claims". The sub-issue and the parent do not conflict.

## 3. Missing scenarios

All improvable:

- **I2.** Step 1 of "Stale claim refresh" says "a due claim with no such span gets the code `no-evidence` without a model call". No scenario covers it.
  - It cannot be reached through `explain`: prior claims are read by the same overlap (design D3).
  - Either cover it with a direct unit `it` of `refreshStaleClaims` (not a scenario) in task 5.5a, or state in D3 that the branch is defensive and only unit-tested.
- **I3.** "A refresh whose verifier is unavailable stores cited evidence" runs twice ("and again with … `BudgetExhausted`"). After the first run `c1` is already `current`, so the second run is only meaningful on a new store.
  - Fix: in the WHEN, write "and again, over a new store holding the same `c1`, with that `verify` call failing with `BudgetExhausted`".

## 4. Ambiguity

Clean. The only matches for the listed words are "as many symbol searches as one anchoring … sends" and "however many statements cite it". Both are copied verbatim from the main spec and are precise.

## 5. Open decisions

All improvable:

- **I4.** Suppose a refresh propagates an error (for example the `verify` call of the second due claim) after an earlier refresh of the same call already rewrote its claim. The spec says the error "is raised after the answer's own claim write, which it does not undo". It says nothing about the refreshes already written.
  - The implementation will not undo them; each `refreshClaim` is its own transaction.
  - Fix: say so in "Stale claim refresh", failure paragraph.
- **I5.** P9 (another golden round merges first) says only that the `golden-answers` delta gains that round as a previous round. Several places in `tasks.md` hard-code three previous rounds and would also change:
  - 10b.1 ("the fifteen files");
  - the `## Panel` forbidden paths of 10b.2;
  - the previous-round constants and rejection copies of 10b.3;
  - 10b.5 and 10d.6;
  - the forbidden sources of the Panel group;
  - and, in the delta, the "Invalid panel outputs are rejected" copies.

  DIS-10 is being relaunched in parallel and touches `packages/core/src/index`, which is a seed fingerprint input, so this is a real possibility.
  - Fix: extend P9 to list those tasks, to be updated before 10b.2 is committed. The Criterion block is never touched.

## 6. Contradictions inside the change

Clean. Proposal, design D1–D13, the three deltas and the tasks agree on all of the following:

- due-claim definition, cap and order;
- codes and event order;
- the step 14 placement;
- usage, row and latency accumulation (D8 `verifySumMs`);
- the double's `updatedAt` and `claimUpdatedAt`.

I recomputed the figures of "The refresh calls count in the answer usage and its row" and they are consistent:

- generation 3900/280 and 0.0159;
- verification 700/50, 0.00285, 3 calls and 1000 ms;
- total 0.01875, savings 88.5, latency 1300.

The figures of "A failure inside a refresh propagates after the row" are also consistent: 300/30 tokens, of which 100/10 are verification, 1 call, no latency.

## 7. Contradictions with the project

- **I1 (improvable).** The main requirement "Prompt and evidence ids" (`openspec/specs/explain/spec.md:477-510`) is written in general terms. It says "Explain SHALL give the model one evidence id per span of the pack, `E1` to `En` in the pack's rank order", and describes "the prompt" as `{ question, questionFlags?, evidence }` with a system message chosen by the question's language. The refresh prompt sends only the overlapping spans, renumbered `E1…`, under `{ claim, claimFlags?, evidence }`.
  - The new requirement makes the difference explicit ("a fixed system message of its own (not explain's)", "as in the explain prompt"), so nothing is left for the implementer to decide.
  - After sync, though, the general sentence reads wider than intended.
  - Fix: add a scoping sentence to "Stale claim refresh" (correction 1 below).
- **Improvable.** The ticket's `[enhanced]` → "Escritura (R4)" says `updated_at = now()`. Design D6 rightly uses `clock_timestamp()`:
  - the stale trigger of `0003_indexes-stale.up.sql:45` writes `now()`;
  - inside the harness transaction `now()` does not advance;
  - so `now()` would break the DoD clause "`updated_at` is later than before the second call".

  Update the ticket text (Linear correction below).
- Checked and consistent:
  - `graph-schema` l. 658-659 and `graph-store` l. 180 concern the trigger and the graph write; neither forbids `refreshClaim`.
  - ADR `20261013-fact-statements-stored-as-l2-inference`: the record is `L2` `INFERENCE` and keeps `statementType`.
  - ADR `20261014-broken-citations-not-stored`: the refresh drops broken citations through `verifyAnswer`.
  - ADR `20261017-stale-fingerprint-fails-verify`: covered by groups 10–10d.
  - The modified "Precedence and UNKNOWN answers" copies all 15 scenarios of the main spec unchanged and only adds the step 14 clauses.
  - The Purpose header is updated at sync (A8).

## 8. Contrast with the real code

Clean. The design fits the code:

- **`explain.ts`:**
  - `answerQuestion` has the `saveClaims` `try`/`catch` with both branches (`packages/core/src/explain/explain.ts:374-381`);
  - `onSemanticStart` sets `verifyLatencyMs` to `null` (`explain.ts:347-349`);
  - the rejection row uses `state.verifyLatencyMs` (`explain.ts:167-171`), which is the reason for D8's accumulator;
  - `finish` saves the cache and then the row (`explain.ts:208-225`).
- **Helpers:** `neutralise`, `wrapUntrusted`, `evidenceIdAt`, `toClaimItems` and `toPriorClaim` exist and are exported.
- **Fingerprint inputs:**
  - `untrusted-text.ts` is an answer fingerprint input (`packages/cli/src/cache/answer-fingerprint.ts:17`); the design only imports it, and task 4.2 checks this.
  - `packages/core/src/knowledge` and `packages/adapters/store-postgres/src` are seed fingerprint inputs (`packages/cli/src/seed/fingerprint.ts:30-41`), so step 10 is needed.
- **No hidden trigger on `claim`:** the migrations have no trigger that sets `updated_at` on `claim` updates (only the stale trigger), so the explicit `clock_timestamp()` takes effect.
- **In-memory double:** `nextStamp` and `seedClaim` exist (`tests/support/in-memory-store.ts:340-355`), so D6's `updatedAt` is implementable as written.
- **Existing tests:**
  - The only existing test that seeds due stale claims reached by an answered answer is "Prior claims show their displayed type and stale warning" (`tests/unit/explain/explain.spec.ts:773-829`). Task 5.3 names it, and its expected `claim 3` then `claim 2` and its `d.order` match the delta.
  - The stale claims in `explain-cache.spec.ts:329-372` and `explain.spec.ts:638` are written by the call itself, never read back as prior claims.
  - `tests/integration/api/reindex.spec.ts` re-indexes at the same commit over a seed without stale claims.
  - The claim of task 8.1 ("no other existing test changes") therefore holds.
- The evidence mapping repeated from `prompt.ts` is accepted as in run 1 (P1); task 4.1 keeps the field-by-field guard.

## 9. Task size

Clean. Since run 1, 5.2 and 5.5 are split into a–c and every task fits one turn. 10b.3 is long but follows the DIS-9 precedent and changes one file through its constants.

## 10. Mandatory steps

Clean.

- Step 0 is first: branch `feature/dis-42-stale-claims-refresh` from `final-project-CRN`.
- The mandatory groups are present and labelled:
  - Review existing tests (8);
  - Run tests and verify data state (9, with report path and template);
  - Manual interface testing (11, AGENT MUST EXECUTE, success and error paths, restoration in 11.6, PowerShell half as destination C in 11.8);
  - End-to-end (12, justified as not applicable);
  - Documentation (13);
  - Pre-merge review last (15, the three checks in order, fixes on the same PR, archive commit before merge).
- Mutating steps restore state (0.4/6.2/9.5 and 11.6).
- Groups 10–10d are not numbered sequentially. This was rejected with a reason (A5).
- The merge in 15.7 is limited to an autonomous run through the merge gate (A9).

## 11. Traceability

| Requirement | Scenario(s) | Task(s) |
|---|---|---|
| explain · Stale claim refresh (ADDED) | "At most three…", "Only stale L2 inference claims…", "Nothing is refreshed without a live answered answer", "An unavailable model or an exhausted budget stops the refresh" | 5.1, 5.2a, 5.5a, 5.5c, 5.6 |
| explain · Stale claim refresh (ADDED) | "A stale prior claim is refreshed on the first question…", "A refresh whose verifier is unavailable stores cited evidence", "A refresh without backing leaves the claim stale", "A refresh that is no longer due is superseded…" | 5.1, 5.2b, 5.5b, 5.5c, 5.6 |
| explain · Stale claim refresh (ADDED) | "The refresh prompt holds the stored statement as untrusted data…", "The refresh calls count in the answer usage and its row", "A failure inside a refresh propagates after the row" | 4.1, 4.2, 5.2c, 5.4, 5.5a–c, 5.6 |
| explain · Stale claim refresh (ADDED) | "A stale claim is refreshed after a re-index" (DoD) | 6.1, 6.2 |
| explain · Precedence and UNKNOWN answers (MODIFIED) | 15 unchanged scenarios | 5.6 (stay green), 8.2 |
| explain · Prior claims (MODIFIED) | "Prior claims show their displayed type and stale warning" (changed) | 5.3, 5.6 |
| explain · Prior claims (MODIFIED) | "Prior claims are read over the kept lines of a cut span" | 8.2 (existing test) |
| explain · Explain events and logging (MODIFIED) | "Stale claim events follow the write event and precede the row event" | 1.1, 1.2, 5.2c, 5.6 |
| explain · Explain events and logging (MODIFIED) | unchanged scenarios | 8.2 |
| explain · Answer usage (MODIFIED) | unchanged scenarios; refresh case in "The refresh calls count…" | 5.2c, 5.4, 5.6, 8.2 |
| explain · Query log (MODIFIED) | unchanged scenarios; refresh case in "A failure inside a refresh propagates after the row" | 5.2c, 5.6, 8.2 |
| graph-store · Claim refresh (ADDED) | 4 Postgres scenarios | 2.1, 3.1, 3.2, 3.3 |
| graph-store · Claim refresh (ADDED) | 4 in-memory scenarios | 2.1, 2.2, 2.3 |
| golden-answers · Blind panel input (MODIFIED) | "The panel input projects…" | 10b.3, 10b.4 |
| golden-answers · Panel outputs (MODIFIED) | "Each panelist output judges…", "The resolution answers exactly the disagreements", "Invalid panel outputs are rejected" | 10b.3, 10b.4, 10c.1–10c.4, 10d.1 |
| golden-answers · Golden review report (MODIFIED) | "The report's verdicts and agreement match…", "The report states its criterion, panel and limitations" | 10b.2, 10d.4 |
| golden-answers · Criterion first and immutable panel record (MODIFIED) | "The report's criterion is the Panel group's criterion", "The criterion precedes the input…" | 10b.2, 10b.4, 10d.6 |

No empty row. Task 8.2's count (12 + 8 scenarios, 11 unit and 1 integration for "Stale claim refresh") matches the deltas.

## Corrections to apply

All optional (improvable); none blocks the apply.

### `specs/explain/spec.md`

1. **(I1)** "Stale claim refresh", end of the first paragraph, add: "Requirements "Prompt and evidence ids" and "Question and answer language" describe the prompt of the answer's own `answer` call (step 8 of "Precedence and UNKNOWN answers"); a refresh prompt follows only this requirement."
2. **(I4)** "Stale claim refresh", failure paragraph, after "SHALL propagate unchanged, after the row of requirement "Query log"", add: "; it undoes neither the answer's claim write nor the claims already rewritten by earlier refreshes of the call".
3. **(I3)** Scenario "A refresh whose verifier is unavailable stores cited evidence", WHEN: "the price question is explained, and again, over a new store holding the same `c1`, with that `verify` call failing with `BudgetExhausted`".

### `design.md`

4. **(I2)** D3, last sentence, append: "The branch is covered by a direct unit `it` of `refreshStaleClaims` (not a scenario), since `explain` cannot reach it."
5. **(I5)** Follow-ups, P9: append "In `tasks.md` that round's files are also added, before 10b.2 is committed, to 10b.1 (the SHA list), 10b.2 (`## Panel` forbidden paths), 10b.3 (previous-round constants and rejection copies), 10b.5, 10d.6 and the Panel group's forbidden sources; the Criterion block is not touched."

### `tasks.md`

6. **(I2)** 5.5a: append "with a direct unit `it` (not a scenario) for a due claim with no overlapping span: `no-evidence`, no model call".

### Linear DIS-42 (never the `[original]` block)

7. In `[enhanced]` → "Contexto técnico" → "Escritura (R4)", replace «`updated_at = now()`» with «`updated_at = clock_timestamp()` (el instante de la escritura; `now()` no avanza dentro de una transacción y el disparador de `stale` ya lo usa)». In `[reality-map]` → "Tubería reutilizable", change «ids de evidencia `e1…`» to «ids de evidencia `E1…`».
8. Comment in Spanish: «Auditoría de especificación de `stale-claims-refresh`, ejecución 2 (2026-10-29): `APPROVED`, sin hallazgos bloqueantes. Mejoras opcionales: acotar en «Stale claim refresh» que «Prompt and evidence ids» describe solo el prompt de la respuesta; decir que un error propagado no deshace los recálculos ya escritos; usar un almacén nuevo en la segunda ejecución del escenario del verificador caído; cubrir con un test unitario directo el caso sin span solapado; y ampliar P9 a las tareas 10b.1–10b.5, 10d.6 y al grupo Panel si otra ronda golden (p. ej. DIS-10) se integra antes.»
