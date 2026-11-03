CHANGES REQUIRED

# Spec audit: add-drift-detection (DIS-71)

- Date: 2026-11-03
- Change: `openspec/changes/add-drift-detection/` (proposal, design D1–D19, delta `specs/drift-detection/spec.md` with 28 scenarios, tasks 0–13)
- Ticket: DIS-71 (sub-issue, In Progress) and parent DIS-48 (CM-HU-20), both loaded from Linear with their comments. DIS-48 has no comments.
- First audit.

## Questions for the author

1. **AC 1 of DIS-71 vs D13.** The `[enhanced]` AC 1 asks for "`provenance` válida para `provenanceSchema`". D13 replaces that with an exported `driftProvenanceSchema` that keys spans by path instead of file id. The substance is kept (model, prompt hash, non-empty input spans, instant). The agent made this decision and wrote it in a Linear comment. Do you accept the deviation? If not, the change has to add a store read that maps a path to its file id, which is a port change. This is the alternative D13 rejects.
2. **Parent AC 3 vs D8.** DIS-48 says that in `evaluation` mode, `drift acme-shop` serves the golden Q5 report without calling the model. The core `drift` of this change answers `llm-required` for every project in evaluation mode, before any read. Confirm that DIS-73 will serve the golden Q5 from the CLI without changing this core branch. If DIS-73 needs the golden lookup inside core, as `explain` does with the answer cache, D8 would have to be reopened.

## 1. Scope against the ticket

Clean. Everything in the proposal, the spec and the tasks follows from DIS-71's `[original]` (three modules, a scripted-LLM DoD, no CLI) and its `[enhanced]` part. The parent's CLI, golden Q5 and `query_log` row are explicitly left to DIS-73. Three small additions do not come from the ticket. Each is justified and kept small, so none of them is invented scope:
- D16: two private helpers of `statement-schema.ts` are exported, for reuse.
- D14: one comment in `explain.ts` is reworded (but see finding B5).
- D15: `.env*` files are excluded from prompts, for least data.

The additive report fields (`droppedClaims`, `excerpt`) go beyond the `[enhanced]` §3 shape. The ticket should be aligned with them (see "Corrections → Linear").

## 2. Inherited acceptance criteria

All five ACs of DIS-71 `[enhanced]` have a requirement and a scenario:
- AC1 → "Drift over the indexed acme-shop" / "The two planted contradictions…"
- AC2 → "A claim the code confirms is not a contradiction"
- AC3 → the three "Unknown drift answers" scenarios
- AC4 → "An invalid extraction…", "A claim outside the document is dropped", "A contradicted verdict citing an unknown id…", "…without evidence or statement…"
- AC5 → the four "Verification of a contradiction" scenarios plus "An unknown or unindexed project fails…" and "A failing answer call propagates unchanged"

The parent's ACs that DIS-71 inherits are covered: at least two contradictions typed `INFERENCE` with provenance; a confirmed claim not reported; `verification` on both sides; `no-docs`. The parent's golden Q5, `query_log` row and CLI belong to DIS-73. AC1's `provenanceSchema` wording is the deviation in Question 1. **No blocking finding.**

## 3. Missing scenarios

- **B6 (blocking): secret redaction has no scenario and no test.** "Claim extraction" requires the document lines "as the indexing redacts them (secrets redacted)". "Context of a claim" requires the configuration files' "redacted content". No scenario covers either, and no task lists even an extra case. It is the privacy guarantee of the change (proposal → Impact → Privacy). Correction: add a scenario (in the "Claim extraction" requirement, test in `tests/unit/drift/doc-claims.spec.ts`) covering both prompts. Text under Corrections.
- Improvable: the following MUST behaviours are covered only by "extra cases" in tasks (3.5, 4.3, 4.7), not by scenarios. They are tested, so this is acceptable, but they are invisible in the spec:
  - the truncation of a document over `MAX_EVIDENCE_TEXT_CHARS`
  - fence unwrapping
  - `MAX_CONFIG_SPANS`, `MAX_CONFIG_LINES`, the budget fit, and the single configuration read
- Improvable: "Drift request" has no scenario case for "a request that is not an object" (`null`, an array). Add it to the list of the first scenario, naming `request`.
- Improvable: "Documents checked by a call" requires the repository root to be "joined to the workspace root when relative", with no scenario. The acme-shop integration (relative seed root) covers it implicitly. Say so in task 6.1.

## 4. Ambiguity

- `design.md` → Risks, third bullet: "a short term like `tax` matches many files". Improvable, because it is a risk note, not a requirement. Replace it with "a short term like `tax` can match every configuration file of the project; at most `MAX_CONFIG_SPANS` (3) are added, in path byte order".
- No other occurrence of fast, easy, secure, efficient, many, appropriate or robust in the proposal, the spec or the tasks.

## 5. Open decisions

- **B1 (blocking): `claimsChecked` of a `contradicted` claim that verification drops.** The spec says:
  - a claim with no context counts as checked;
  - `consistent` and `unrelated` count as checked;
  - an invalid confrontation does not count;
  - the "unknown id" scenario implies that a reported contradiction counts.

  It does not say whether a `contradicted` claim still counts when the claim is dropped because its document citation is broken, or because every code citation is broken. A test of "A broken document citation drops the contradiction" or "A contradiction whose only code citation is broken…" will pin it. Fix it in the "Verification of a contradiction" requirement, and add `claimsChecked` 1 to the THEN of both scenarios. Text under Corrections.
- **B2 (blocking): a stored document or configuration file missing at the indexed commit.**
  - The spec ("Drift failures…") propagates "any failure of the document, configuration or context-pack reads", so `SourceUnavailable` `missing` aborts the whole run.
  - Task 5.8 tests "a failure of the batched document read **other than `missing`** propagates", which implies `missing` is handled some other way.
  - Neither artifact says what that other way is (skip the document with an event? `file-missing`?).

  Decide in the spec and align task 5.8. Proposed default, the simplest one and coherent with the spec: `missing` propagates like any other read failure, and task 5.8 says "a failure of the batched document read, including `missing`, propagates unchanged".
- **B3 (blocking): the budget the configuration spans fit into.** D4 says "while `estimateTokens(text)` fits `tokenBudget − pack.tokens`". The spec says "the budget left by the pack". `pack.tokens` (`packages/core/src/context/context-pack.ts:206`) counts every fitted span, **including the `doc` spans this change removes**. Decide whether the remaining budget is `tokenBudget − Σ tokens of the kept (non-doc) spans` or `tokenBudget − pack.tokens`. Task 4.3's extra case ("does not fit the budget left by the pack") pins it. Fix it in the spec ("Context of a claim") and in D4. Recommended: subtract the kept spans only, because the removed spans are never sent.
- **B4 (blocking): quarantine subcodes and the schema-violation event are undecided, and the design contradicts itself.**
  - D16 exports `unfenced` and `discard` "so the two drift schemas build the same `SchemaViolationEvent` (size, SHA-256, issues capped)". D17 and the spec never put a `schema_violation` event in the report. The report only carries `drift_doc_skipped` and `drift_claim_skipped` with a subcode. The event that `discard` builds is thrown away.
  - The subcode rule is the **private** `shapeSubcode` (`packages/core/src/explain/statement-schema.ts:90-94`), which D16 does not export. Its `empty_evidence` rule only matches issues whose path `endsWith('.evidenceIds')` with code `too_small`. In the confrontation schema the path is the top-level `evidenceIds` (no leading dot), and D5's `superRefine` raises `custom` issues. With the rule as it is, "contradicted with no ids" would come out `invalid_shape`, not `empty_evidence`.
  - The size limit (`MAX_MODEL_OUTPUT_BYTES`, `output_too_large`) is not stated for either drift output.
  - `discard` returns `ModelOutputResult`, which is typed to explain's `ModelOutput` (`statement-schema.ts:46,118`).

  Fix in design D5, D16 and D17 and in the spec:
  - whether a `schema_violation` event is reported (wrapped in `drift_check_event`) or only the subcode;
  - which helper computes the subcode (export `shapeSubcode` too, or a drift-local rule);
  - the exact subcode for each failure: blank statement → `invalid_shape`, `[]` ids → `empty_evidence`, 11 ids → `limit_exceeded`, output over 65,536 bytes → `output_too_large`;
  - the signature of the exported helpers (returning a `SchemaViolationEvent`, not a `ModelOutputResult`).
- Improvable: the evidence id of the extraction's sanitisation events. D3 passes the document through `sanitizeForPrompt('', [span])`. That function names it `E1` in its `untrusted_content_flagged` and `untrusted_content_truncated` events (`sanitize.ts:85` → `evidenceIdAt(0)`). The prompt wraps the same text as `D1`, and D6 reports the document citation as `D1`. Say in D3 and D17 that extraction events carry `evidenceId` `E1` (or rewrite it to `D1` while wrapping), so task 3.1's test does not decide it.
- Improvable: a claim on line 1 of a document whose first line exceeds `MAX_EVIDENCE_TEXT_CHARS` (D3's line-cut case). The spec's document-citation excerpt is "the redacted text of its lines", that is the whole line. That uncut line then goes into the confrontation prompt with no bound. State either that the citation carries `cut: 'line-cut'` and the cut text (the way `verifyCitations` already supports), or that such a claim is dropped.
- Improvable: precedence when the request is invalid **and** the workspace root is relative. D1 validates the request first. Say so in "Drift request".

## 6. Contradictions inside the change

- B4 (above): D16's justification contradicts D17 and the spec, which do not report the event.
- B2 (above): task 5.8 contradicts the spec's "Drift failures" requirement.
- Improvable: D6 says that when the document citation is broken, "the code side is not checked (no `verify` call)". The spec's "Verification of a contradiction" requirement does not say this. Its scenario "A broken document citation drops the contradiction" asserts neither the absence of `verify` calls nor the absence of code `evidence_broken` events. Move the rule into the spec and the THEN.
- Improvable: the spec says "lines matching an instruction pattern flagged". `sanitizeForPrompt` flags only the **first** matching line per pattern (`sanitize.ts:147-153`). Reword the spec to "the first line matching each instruction pattern is flagged, as in `explain`".
- Improvable: D17 fixes the event shapes:
  - `drift_check_event { docPath, claimIndex?, event }`
  - `drift_doc_skipped { docPath, reason, subcode? }`
  - `drift_claim_skipped { docPath, claimIndex, reason, subcode }`

  The spec only says "wrapped with the document path and … the claim's index". The field names the scenarios assert should live in the spec ("Drift report").

## 7. Contradictions with the project

- **B5 (blocking): the "until DIS-71" statements.** D14 keeps `contradiction: false` and rewords only `packages/core/src/explain/explain.ts:375`. The same promise ("nothing produces contrary evidence until DIS-71") is pinned elsewhere, and becomes misleading once DIS-71 merges:
  - `openspec/specs/confidence-score/spec.md` → "Published weights", scenario "The confidence document states its limits": it pins the sentence «La señal de contradicción vale 0 en todas las respuestas hasta DIS-71», tested at `tests/unit/knowledge/confidence-doc.spec.ts:84`.
  - `docs/CONFIDENCE.md:79`
  - `readme.md:1131` («hasta que DIS-71 produzca evidencia contraria»)
  - `docs/project-context.md:1118`
  - `openspec/specs/explain/spec.md:601` ("no component produces contrary evidence yet (DIS-71)")
  - `packages/core/src/explain/claim-items.ts:82,106`
  - `packages/core/src/knowledge/confidence.ts:30`. This file is in an **analyzer-fingerprint input** (`packages/cli/src/seed/fingerprint.ts:34`), so editing it forces `seed:build`.

  The implementer is left to choose which ones to touch. Decide in D14 and the tasks. Recommended:
  - keep every pinned or fingerprinted text unchanged (`confidence.ts`, `docs/CONFIDENCE.md` and the confidence-score spec, which would otherwise need a MODIFIED delta and an edit to `confidence-doc.spec.ts`);
  - reword only the free-text places (`explain.ts:375`, `claim-items.ts:82,106`, `docs/project-context.md:1118`, `readme.md:1131`) to "`drift` (DIS-71) finds contradictions but does not store them, so the signal stays 0";
  - list in D14 the texts left unchanged and why.

  Alternatively, drop the comment rewording entirely and leave all texts as they are, with the reason recorded in D14.
- Improvable: the `docs/backend-standards.md` §8 ceiling reads its spend from `query_log.cost_usd`. `drift` writes no row (D7, D10), so a run of up to 130 `answer` calls plus `verify` calls is invisible to `withDailyBudget`, both during the run and after it, until DIS-73 writes the row. This also applies to the live run of task 10.2. Add a Risks entry and say in 10.2 that the live run's spend is not counted against the ceiling.
- Improvable: proposal → Impact names `UNSTORED_FILE_ID` among the exports. `docs/backend-standards.md` §3 asks for explicit outputs, so exporting an internal sentinel widens `@codemind/core` for no caller. Keep it module-internal unless a test needs it, and justify it in D13 if it stays.
- No contradiction with ADR 20261013: `drift` reads no claims. `openspec/specs/graph-schema` already allows `capability = 'drift'`, and this change writes no row. Merging by the agent in 13.7 is the documented exception in `docs/AUTONOMOUS-RUN.md` §5 and the table near line 135.

## 8. Contrast with the real code

- Verified, and correct:
  - `sanitizeForPrompt`, `verifyCitations` and `verifyAnswer` never read `fileId` (`packages/core/src/verify/` has no match; `sanitize.ts` spreads the span).
  - `readIndexState` throws `ProjectNotFound` for an unknown id and returns paths in byte order (`packages/core/src/ports/StorePort.ts:98-110`).
  - `questionTerms` of the line-31 claim includes `ship` and `free`, which `config/shop.php:22` holds.
  - In path byte order, only `composer.json` and `config/shop.php` among acme-shop's configuration files match those terms, so `MAX_CONFIG_SPANS = 3` does not cut `config/shop.php`.
  - `verifyCitations` supports the cut citations that D3 relies on.
  - The in-memory source tree supports the "after" stage that task 5.6 needs.
- B3 and B4 above come from the code (`context-pack.ts:206`, `statement-schema.ts:46,90-94,118`).
- Improvable: `buildContextPack` calls `getProject` and reads its files again for each claim, up to 120 packs per run. That is acceptable, but `commit` in the report (the "the indexed commit every file was read at" rule) assumes no reindex happens during the run. Note it in Risks.
- Improvable: task 1.1 does not list the `verificationContents` option that task 5.6 relies on. In `explain-doubles.ts:97`, the switch is "after the first `complete`". `drift` makes several model calls, and the configuration and pack reads happen after the first one. Define the switch in 1.1 as "after the first confrontation call".
- Improvable: the scenario "Document spans are left out of a claim's context" assumes a symbol of `docs/guide.md`. The PHP analyzer produces no symbols in Markdown, and in the real graph doc spans enter through `describes` edges. The in-memory store can hold such a symbol, so the test works. Saying "a span of `docs/guide.md` reached through a `describes` edge" would match the real path.

## 9. Task size

- Improvable: task 3.2 creates `drift-prompts.ts` (extraction), all of `doc-claims.ts` and the document reading in `drift.ts`. Task 5.2 does the whole verification, contradiction building, provenance, event ordering, meter and clock in one GREEN. Task 6.1 sets up the full integration harness and scripts. Each is at the edge of a single turn. Split 5.2 into:
  - 5.2a: verification and the contradiction
  - 5.2b: provenance and event order
  - 5.2c: meter and clock

  Split 3.2 into prompt, then schema and extraction.
- The other tasks fit.

## 10. Mandatory steps

Clean.
- Step 0 is the branch (`feature/dis-71-drift-detection`, commit scope `DIS-71`).
- The mandatory sections carry their labels: 8 Review existing tests, 9 Run tests and verify data state (report path and template named), 10 Manual interface testing with AGENT MUST EXECUTE, 11 Documentation, 13 Pre-merge review with AGENT MUST EXECUTE (last; three checks in order; fixes on the same PR; archive before merge).
- E2E is declared not applicable with a reason (10.7).
- Mutating effects: the change writes nothing. 0.4, 9.5 and 10.4 compare counts. 10.1 records counts around the conditional `db:seed`. The scratchpad script is deleted.
- Minor: 10.1 should say that `db:seed` reloads the seed idempotently, which is the restoration.

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| Drift request | An invalid drift request is rejected before the store | 1.2, 1.3 |
| Drift request | A relative workspace root is rejected before the store | 1.4 |
| Unknown drift answers | Evaluation mode answers llm-required without reading anything | 1.5 |
| Unknown drift answers | A project without documents answers no-docs | 1.6 |
| Unknown drift answers | A docPath that is not a stored document answers no-docs | 1.7 |
| Documents checked by a call | Documents are checked in byte order and the rest is skipped by the limit | 3.6 |
| Documents checked by a call | A docPath checks only that document | 3.7 |
| Documents checked by a call | An unknown or unindexed project fails without calling the model | 3.8 |
| Claim extraction | The document is sent numbered and as untrusted data | 3.1, 3.2 |
| Claim extraction | An invalid extraction skips the document and the next one is checked | 3.3 |
| Claim extraction | A claim outside the document is dropped | 3.4 |
| Claim extraction | Claims beyond the per-document limit are omitted | 3.5 |
| Claim extraction | (missing: secret redaction, B6) | — (to add with B6) |
| Context of a claim | Document spans are left out of a claim's context | 4.1, 4.2 |
| Context of a claim | A configuration file that shares a term with the claim joins the context | 4.3 |
| Context of a claim | A claim with no context is checked without a model call | 4.4 |
| Confrontation of a claim | A consistent claim is checked and not reported | 4.5 |
| Confrontation of a claim | A contradicted verdict citing an unknown id skips the claim | 4.6 |
| Confrontation of a claim | A contradicted verdict without evidence or statement skips the claim | 4.7 |
| Verification of a contradiction | A contradiction whose only code citation is broken is not reported | 5.3 |
| Verification of a contradiction | A contradiction keeps only its valid code citations | 5.4 |
| Verification of a contradiction | An unavailable verifier leaves the evidence cited | 5.5 |
| Verification of a contradiction | A broken document citation drops the contradiction | 5.6 |
| Drift report | The report of a contradiction carries both citations, its type and its provenance | 5.1, 5.2 |
| Drift report | The usage adds every answer and verify call of the run | 5.7 |
| Drift failures, logging and writes | A failing answer call propagates unchanged | 5.8 |
| Drift failures, logging and writes | A drift run writes nothing | 5.9 |
| Drift over the indexed acme-shop | The two planted contradictions of the pricing document are found | 6.1, 6.2 |
| Drift over the indexed acme-shop | A claim the code confirms is not a contradiction | 6.3 |

All 28 existing scenarios have a task, and task 8.2's per-file count (16/4/6/2) matches. The only hole is the redaction scenario that B6 requires. It is already counted as blocking under point 3. When it is added, task 8.2's count becomes 29, with 5 in `doc-claims.spec.ts`.

## Corrections to apply

### `specs/drift-detection/spec.md`

1. **Requirement "Claim extraction" (B6).** Add the scenario:
   ```
   #### Scenario: Secrets are redacted before any drift prompt
   - **GIVEN** a document `docs/setup.md` whose line 4 holds `password = "s3cr3t-value"` and a claim on lines 1–5 whose confrontation context includes the configuration file `config/services.php` whose line 3 holds `'secret' => 'sk_live_abcdef123456'`
   - **WHEN** `drift` checks it
   - **THEN** neither the extraction prompt nor the confrontation prompt holds `s3cr3t-value` or `sk_live_abcdef123456`, each line being sent as the indexing redacts it
   ```
   Use whatever secret shapes `redactedLines` actually redacts. Copy them from the existing redaction tests.
2. **Requirement "Verification of a contradiction" (B1, and the improvable item of point 6).** Append: "The document citation SHALL be checked first; when it is broken, the code side SHALL not be checked (no code `evidence_broken` event and no `verify` call). A `contradicted` claim SHALL count in `claimsChecked` whether or not its contradiction survives verification." Add "the document's `claimsChecked` is 1, and no `verify` call was made" to the THEN of "A broken document citation drops the contradiction". Add "the document's `claimsChecked` is 1" to "A contradiction whose only code citation is broken is not reported". If the decision is the opposite (not counted), write it that way instead, but write it.
3. **Requirement "Drift failures, logging and writes" (B2).** Make it explicit: "…any failure of the document, configuration or context-pack reads, including `SourceUnavailable` reason `missing` for a stored file absent at the indexed commit…".
4. **Requirement "Context of a claim" (B3).** Replace "each only while its estimated tokens fit the budget left by the pack" with "each only while its estimated tokens fit the token budget minus the tokens of the pack's kept (non-`doc`) spans and of the configuration spans already added".
5. **Requirements "Claim extraction" and "Confrontation of a claim" (B4).**
   - State: "an output over `MAX_MODEL_OUTPUT_BYTES` (65,536 UTF-8 bytes) is discarded with subcode `output_too_large`".
   - In Confrontation, state the subcode of each failure: blank statement in a `contradicted` verdict → `invalid_shape`; empty `evidenceIds` in a `contradicted` verdict → `empty_evidence`; more than 10 ids → `limit_exceeded`; a repeated id → `duplicate_evidence_id`; an id not in the prompt → `unknown_evidence_id`.
   - Add to the THEN of "A contradicted verdict without evidence or statement skips the claim": "with subcode `empty_evidence` and `invalid_shape` respectively".
   - State whether a `schema_violation` event is in `events`, consistently with D17.
6. **Requirement "Claim extraction" (point 6).** Replace "lines matching an instruction pattern flagged" with "the first line matching each instruction pattern flagged, as in `explain`". State the evidence id the extraction's sanitisation events carry (`E1`, or `D1` if the design rewrites it).
7. **Requirement "Drift report" (point 6).** Insert the event shapes of D17 verbatim (`drift_check_event { docPath, claimIndex?, event }`, `drift_doc_skipped { docPath, reason: 'invalid-model-output' | 'limit', subcode? }`, `drift_claim_skipped { docPath, claimIndex, reason: 'invalid-model-output', subcode }`). Add `schema_violation` to them if B4 decides to report it.
8. **Requirement "Drift request".** Add "a request that is `null`" to the list of the first scenario (naming `request`). Add: "request validation precedes the workspace-root check".
9. **Line-cut case (point 5).** In "Claim extraction" or "Verification of a contradiction", say how a claim on a cut first line is cited (with `cut: 'line-cut'` and the cut text) or that it is dropped.

### `design.md`

1. **D4 (B3).** Replace "`tokenBudget − pack.tokens`" with the rule chosen in spec correction 4.
2. **D5, D16, D17 (B4).**
   - D16: name every exported helper and its exact signature (e.g. `discardModelOutput(text, subcode, issues): SchemaViolationEvent` and `modelOutputSubcode(issues)` if `shapeSubcode` is exported), and remove or rewrite the sentence "so the two drift schemas build the same `SchemaViolationEvent`" if that event is not reported.
   - D5: list the subcode of each failure as in spec correction 5. Note that the `custom` issues of `superRefine` and the top-level `evidenceIds` path do not match `shapeSubcode`'s `.evidenceIds` rule.
   - D17: say whether `schema_violation` is wrapped into `events`.
3. **D14 (B5).** Replace the decision text with the list of every "until DIS-71" occurrence (`explain.ts:375`, `claim-items.ts:82,106`, `knowledge/confidence.ts:30` (fingerprint input), `docs/CONFIDENCE.md:79` (pinned by the confidence-score spec and `confidence-doc.spec.ts:84`), `readme.md:1131`, `docs/project-context.md:1118`, `openspec/specs/explain/spec.md:601`), stating for each whether it is reworded or left, and why. Recommended: reword only the unpinned, non-fingerprinted ones.
4. **D3.** State the evidence id of the extraction's sanitisation events (point 5). Also state the line-cut handling of the document citation.
5. **D13.** Make `UNSTORED_FILE_ID` module-internal, or justify the export.
6. **Risks.**
   - Replace "matches many files" (point 4).
   - Add: "`drift` writes no `query_log` row, so `withDailyBudget` does not see its spend (up to 130 `answer` calls plus `verify` calls per run) until DIS-73 logs it."
   - Add: "only the first `MAX_EVIDENCE_TEXT_CHARS` (8,000) code points of a document are checked."
   - Add: "a reindex during a run could make the per-claim packs read another commit than the report's `commit`."

### `tasks.md`

1. **Task 5.8 (B2).** Replace "a failure of the batched document read other than `missing` propagates" with "a failure of the batched document read, including `SourceUnavailable` `missing`, propagates unchanged".
2. **Task 3.5 or a new task 3.5b (B6).** Add "RED → GREEN: test "Secrets are redacted before any drift prompt"". Update 8.2 to 29 scenarios, with 5 in `doc-claims.spec.ts`.
3. **Task 5.10 (B5).** Extend it to the list decided in D14, naming each file. If `docs/CONFIDENCE.md` or `confidence-doc.spec.ts` change, name them in 8.1 first. If `knowledge/confidence.ts` changes, add `npm run seed:build` and the seed commit in 9.3 and 9.5 (fingerprint input). Recommended: do not touch them.
4. **Task 4.7 (B4).** Add the extra cases of an output over 65,536 bytes (`output_too_large`) for both prompts and of 11 evidence ids (`limit_exceeded`).
5. **Task 1.1.** Add the `verificationContents` and `verificationFailures` options, and define their switch as "reads after the first confrontation call".
6. **Tasks 3.2 and 5.2.** Split as in point 9.
7. **Task 6.1.** Note that the relative seed root covers the "joined to the workspace root" clause.
8. **Task 10.2.** Note that a live run's spend is not visible to `withDailyBudget` (no `query_log` row). **Task 10.1:** say that `db:seed` is the idempotent restoration.

### Linear (written in Spanish; the `[original]` block is not touched)

- **DIS-71, `[enhanced]` part, §2 AC 1.** Once the author answers Question 1, replace «`provenance` válida para `provenanceSchema`» with «`provenance` válida para `driftProvenanceSchema` (los spans de entrada por ruta: `{ path, startLine, endLine }`; ver D13)». In §3 "Informe", add `droppedClaims` to `DriftDocument` and `excerpt` to the claim and to each evidence.
- **DIS-71, new comment:** «*(Texto del agente, spec-audit, 2026-11-03.)* Auditoría de la spec de `add-drift-detection`: CHANGES REQUIRED, 6 hallazgos bloqueantes: B1 `claimsChecked` de una afirmación `contradicted` que la verificación descarta; B2 un fichero guardado que falta en el commit indexado (`missing`); B3 el presupuesto que queda para los ficheros de configuración; B4 los subcódigos de la cuarentena y el evento `schema_violation`; B5 las frases «hasta DIS-71» de `docs/CONFIDENCE.md`, `readme.md`, `confidence.ts` y la spec `confidence-score`; B6 falta un escenario de redacción de secretos. Dos preguntas para la autora: la desviación de D13 respecto al criterio 1 (`provenanceSchema`) y si DIS-73 servirá el golden Q5 en evaluación sin cambiar la rama `llm-required` del núcleo.»

## Resolution of run 1

*Agent's text (correction round 1, autonomous run, 2026-11-03).* Every decision below is recorded in
`design.md` → Follow-ups (R1–R11) with its destination. `openspec validate add-drift-detection
--strict` passes after the edits.

### Questions for the author

- **Question 1 (AC 1 vs D13): decided by the agent.** The deviation is accepted: provenance keyed by
  path (`driftProvenanceSchema`) keeps the substance of AC 1 without a port change for a provenance
  nobody stores. D13 records it; the `[enhanced]` AC 1 and §3 "Informe" of DIS-71 are aligned in
  Linear (`driftProvenanceSchema`, `droppedClaims`, `excerpt`). Follow-up R10 (A).
- **Question 2 (parent AC 3 vs D8): decided by the agent.** DIS-73 serves the golden Q5 from the CLI
  in `evaluation` mode and does not change the core `llm-required` branch; if it needs otherwise, it
  reopens D8 in its own change. D8 records it, and a Spanish comment on DIS-73 says so. Follow-up R8
  (B → DIS-73).

### Blocking findings

- **B1: fixed.** A `contradicted` claim counts in `claimsChecked` whether or not its contradiction
  survives verification. Spec "Verification of a contradiction" states it; both scenarios ("A broken
  document citation…", "A contradiction whose only code citation is broken…") assert `claimsChecked`
  1. D6, R1.
- **B2: fixed.** `SourceUnavailable` `missing` in the batched document or configuration read
  propagates. Spec "Drift failures, logging and writes" names it; task 5.8 tests it for both reads.
  D6, R2.
- **B3: fixed.** The configuration spans fit `tokenBudget` minus the kept (non-`doc`) pack spans and
  the configuration spans already added; a file that does not fit is skipped and the next one tried.
  Spec "Context of a claim", D4 and task 4.3. R3.
- **B4: fixed.** No `schema_violation` event is reported (spec "Drift report", D17). Only
  `unfenceModelOutput` is exported; `discard` and `shapeSubcode` stay private, and a drift-local
  `driftShapeSubcode` (`limit_exceeded` when every issue is `too_big`, else `invalid_shape`) lives in
  `drift-quarantine.ts` (D16). The check order and subcode of each failure are in D5 and in the spec
  (size → `output_too_large`; not JSON → `invalid_json`; shape → `limit_exceeded` or `invalid_shape`;
  blank statement → `invalid_shape`; `[]` ids → `empty_evidence`; repeated id →
  `duplicate_evidence_id`; unknown id → `unknown_evidence_id`). The scenario "A contradicted verdict
  without evidence or statement…" asserts `empty_evidence` and `invalid_shape`; tasks 3.5 and 4.7 add
  the `output_too_large` and 11-id cases. R4.
- **B5: fixed.** D14 lists every "until DIS-71" text and its action: reworded in `explain.ts:375`,
  `claim-items.ts:82,106`, `docs/project-context.md:1118` and `readme.md:1131`; left in
  `knowledge/confidence.ts:30` (fingerprint input), `docs/CONFIDENCE.md:79` (pinned by the
  `confidence-score` spec and `confidence-doc.spec.ts:84`; no delta) and
  `openspec/specs/explain/spec.md:601` (no delta). Tasks 5.10, 8.1 and 11.3 follow it. R5.
- **B6: fixed.** New scenario "Secrets are redacted before any drift prompt" in "Claim extraction"
  (an AWS access key id in the document and in a configuration file, absent from both prompts and
  replaced by the redaction marker); task 4.8; task 8.2 now counts 29 scenarios, 5 in
  `doc-claims.spec.ts`.

### Improvable findings

- MUST behaviours covered only by extra cases (point 3): **decided by the agent**, kept as extra
  cases of tasks 3.5, 4.3 and 4.7, not scenarios; the spec now states them (truncation, fence,
  `MAX_CONFIG_SPANS`, `MAX_CONFIG_LINES`, budget fit, single read). R11 (D, accepted).
- Request that is not an object (point 3): **fixed**, `null` added to the first scenario, naming
  `request`.
- Relative root joined to the workspace root (point 3): **fixed**, task 6.1 notes the seed's relative
  root covers it.
- "matches many files" (point 4): **fixed**, Risks reworded with `MAX_CONFIG_SPANS` and byte order.
- Evidence id of the extraction's sanitisation events (point 5): **fixed**, rewritten to `D1` (spec
  "Claim extraction", D3, task 3.2a and 3.5). R6.
- Claim on a cut first line (point 5): **fixed**, every claim of a document whose first line exceeds
  the limit is dropped (spec "Claim extraction", D3, task 3.5). R7.
- Precedence of request validation over the workspace-root check (point 5): **fixed** in "Drift
  request".
- D6 rule absent from the spec (point 6): **fixed**, "Verification of a contradiction" states that the
  code side is not checked after a broken document citation; its scenario asserts no code
  `evidence_broken` event and no `verify` call.
- First matching line per instruction pattern (point 6): **fixed** in "Claim extraction".
- Event shapes in the spec (point 6): **fixed**, "Drift report" carries the three shapes of D17.
- Spend invisible to `withDailyBudget` (point 7): **fixed**, Risks entry and task 10.2 note.
- `UNSTORED_FILE_ID` export (point 7): **fixed**, module-internal (D13, task 1.3, proposal). R9.
- Reindex during a run (point 8): **fixed**, Risks entry.
- `verificationContents` switch (point 8): **fixed**, task 1.1 defines `verificationContents` and
  `verificationFailures` for the reads after the first confrontation call.
- Doc span through a `describes` edge (point 8): **fixed**, scenario "Document spans are left out of a
  claim's context" reworded; task 1.1 lets the double hold `describes` edges.
- Task size (point 9): **fixed**, task 3.2 split into 3.2a (prompt) and 3.2b (schema and extraction),
  task 5.2 into 5.2a, 5.2b and 5.2c.
- `db:seed` as the restoration (point 10): **fixed** in task 10.1.
- Risk "only the first 8,000 code points are checked" (Corrections → design): **fixed**, Risks entry.

### Linear

- DIS-71 `[enhanced]` §2 AC 1 and §3 "Informe" aligned as the audit asked; the `[original]` block is
  untouched. A Spanish comment summarises this round. A Spanish comment on DIS-73 records R8.

---

## Run 2 (2026-11-03)

CHANGES REQUIRED

# Spec audit: add-drift-detection (DIS-71), run 2

- Date: 2026-11-03
- Change: `openspec/changes/add-drift-detection/` as it is after commit `e214bdb` (round 1 corrections). It contains the proposal, design D1–D19 with Follow-ups E1–E12, P1–P5 and R1–R11, the delta `specs/drift-detection/spec.md` with 29 scenarios, and tasks 0–13.
- Ticket: DIS-71 (sub-issue, In Progress) with its 3 comments, the parent DIS-48 (Backlog, no comments) and the DIS-73 comments, all loaded from Linear.
- Earlier run: run 1 (CHANGES REQUIRED, B1–B6). Its resolution section was checked against the artifacts. Every fix it lists is present.
- The answers to the two run-1 questions are the agent's text (R10 and R8). They do not contradict the ticket: the `[enhanced]` AC 1 now says `driftProvenanceSchema`, and the DIS-73 comment records R8. They are accepted here.

## Questions for the author

None. Both blocking findings below are technical decisions. The agent can take them without a product or scope call.

## 1. Scope against the ticket

Clean. The change stays within DIS-71:
- the three modules of the `[original]` block;
- the scripted-LLM DoD;
- no CLI.

The CLI, the golden Q5 and the `query_log` row of the parent stay with DIS-73 (D10, R8). The additions from round 1 are consequences of the change, not new scope:
- R5: rewording the "until DIS-71" texts;
- R6/R7: the `D1` id and the line-cut drop;
- R9: the internal `UNSTORED_FILE_ID`.

## 2. Inherited acceptance criteria

Clean. All five ACs of DIS-71 `[enhanced]` map to a requirement and a scenario:
- AC1 maps to "The two planted contradictions…". AC 1 now names `driftProvenanceSchema`, so the run-1 deviation is gone.
- AC2 maps to "A claim the code confirms…".
- AC3 maps to the three "Unknown drift answers" scenarios.
- AC4 maps to "An invalid extraction…", "A claim outside the document is dropped", "…citing an unknown id…" and "…without evidence or statement…".
- AC5 maps to the four "Verification of a contradiction" scenarios, "An unknown or unindexed project fails…" and "A failing answer call propagates unchanged".

The parent's ACs that DIS-71 inherits (`INFERENCE` with provenance, confirmed claims not reported, `verification` on both sides, `no-docs`) are covered. The golden Q5 and `query_log` belong to DIS-73.

## 3. Missing scenarios

Clean for blocking purposes. The behaviours that are tested only as extra cases (tasks 3.5, 4.3, 4.7, 5.8) were accepted in R11 (destination D).

- Improvable. Scenario "The document is sent numbered and as untrusted data": line 2 (`<<<END_UNTRUSTED_DATA doc>>>`) also matches the `delimiter-spoof` pattern (`packages/core/src/explain/sanitize.ts:29`, `firstMatches` at `:147-153`). The run therefore emits two `untrusted_content_flagged` events: `delimiter-spoof` for line 2 and `ignore-instructions` for line 3. The THEN names only the line-3 event, so a test that asserts the whole event list would fail against a correct implementation. State both events in the THEN.

## 4. Ambiguity

- Improvable. `design.md` → Risks, the reindex bullet says "a run is short". This is a risk note, not a requirement. Replace it with "a run makes at most 130 `answer` calls plus their `verify` calls in one process".
- No occurrence of fast, easy, secure, efficient, appropriate or robust in the proposal, the spec, the design or the tasks.
- "many" appears once, in task 4.3 ("however many claims are confronted"), meaning "any number". It is not a defect.

## 5. Open decisions

- **B7 (blocking): the untrusted-data ids of the claim and the document in the confrontation prompt, and whether they count as known evidence ids.**
  - D5's user message wraps the claim's text and the document's text (`wrapped(...)`), but names the id of neither wrapper. `wrapUntrusted(id, text)` (`packages/core/src/explain/untrusted-text.ts:35`) requires one.
  - The spec says "each under an evidence id local to the prompt (`E1…En`)", which can be read as covering the claim and the document too.
  - D6 reports the document citation under `D1`.
  - Quarantine step 7 rejects "an id the prompt does not hold". If the model cites `D1` (or the claim's id) and the implementer counts it as held, the id reaches `verifyAnswer`. `verifyAnswer` maps only the ids of `spanOf`. `applyVerdicts` keeps the statement, and then `spanOf.get(evidenceId) as SanitizedSpan` is `undefined` in `located`/`pairOf` (`packages/core/src/verify/verify-answer.ts:96-99,127-128`). That is a `TypeError`, not a skipped claim.
  - The double of D12 also has to know these ids to "unwrap the markers".

  Fix in D5, in the spec "Confrontation of a claim" and in task 4.7. Correction text below.
- **B8 (blocking): the serialisation that `promptHash` hashes, for both drift prompts.**
  - The spec ("Drift report") says "the SHA-256 (lowercase hexadecimal) of exactly what its prompt sent". D3 says "`promptHash` over the sent messages".
  - Neither says which bytes are hashed. The scenario "The report of a contradiction carries both citations…" asserts that the provenance "hashes the sent prompt", so its test pins the format.
  - `explain` has one rule: the UTF-8 bytes of `JSON.stringify(messages)` (`packages/core/src/explain/prompt.ts:56,95`).

  Fix in the spec and in D3/D5 by naming that rule.
- No other open decision. Run 1's B1–B4 are settled in the spec and the design:
  - `claimsChecked`: settled;
  - `missing`: propagates;
  - the budget for the configuration spans: settled;
  - the subcodes: the closed set, checked against `packages/core/src/explain/schema-violation.ts:7-14`.

## 6. Contradictions inside the change

- Improvable. Task 8.1 still says "`tests/unit/explain/statement-schema.spec.ts` (the helpers of task 2.1 are renamed and exported…)". After R4 only one helper is exported: `unfenced`, renamed `unfenceModelOutput`. D16, task 2.1 and the proposal say so. Align the wording of 8.1.
- No other contradiction. The proposal, D1–D19 and the spec agree on the following points:
  - the order of the call;
  - the event shapes, which D17 and "Drift report" give verbatim;
  - no `schema_violation` event;
  - the `D1` id of the extraction events;
  - the line-cut drop;
  - the check order of the quarantine;
  - the D14 table and tasks 5.10, 11.1 and 11.3.

## 7. Contradictions with the project

Clean.
- The D14 table covers every "until DIS-71" text in the code, specs and docs. The grep also finds `docs/DEMO.md:485` ("su desfase es la pregunta Q5, DIS-71") and `fixtures/README.md:192`. The first stays true. Task 11.2 edits the second.
- `docs/adr/20261013-fact-statements-stored-as-l2-inference.md` is not contradicted, because `drift` reads and writes no claims.
- `openspec/specs/graph-schema` already allows `capability = 'drift'`.
- The `withDailyBudget` blind spot of `docs/backend-standards.md` §8 is now a Risks entry and a note in task 10.2.

## 8. Contrast with the real code

Verified, and correct:
- `sanitizeForPrompt(question, spans)` (`sanitize.ts:77`) names spans `E{i+1}` (`:64-66`) and flags the first matching line per pattern (`:147-153`). For a cut first line it sets `keptEndLine = startLine` (`:182`), which supports D3/R7.
- `verifyCitations(source, root, commit, citations)` (`packages/core/src/verify/syntactic.ts:51`) never reads `fileId`. `verifyAnswer(deps, root, commit, statements, spanOf)` (`verify-answer.ts:75`) has the shape D6 assumes. `TypedStatement` (`claim-items.ts:29-38`) matches D6's `{ text, type, spans, evidenceIds }`.
- `pack.tokens` (`context-pack.ts:206`) counts every fitted span, including `doc` spans, which supports R3. An empty pack (`no-anchor` / `over-budget`, `:83-95`) carries no `root`/`commit`. `drift` takes both from `getProject` (D1), so this is consistent.
- `ContextOrigin` includes `heuristic` (`context-pack.ts:214`, `rank.ts:11`).
- The constants and helpers the design reuses exist: `TOKEN_BUDGET_MIN/MAX/DEFAULT` (`budget.ts:8-14`), `MAX_EVIDENCE_TEXT_CHARS` (`limits.ts:51`), `REDACTION_MARKER` (`index/secret-scanner.ts:5`), `normaliseText`/`questionTerms` (`anchor.ts:42,57`), `estimateTokens`, `redactedLines`, `spanText`, `meterLlm`, `sumVerificationUsage`.
- The fingerprint inputs (`packages/cli/src/seed/fingerprint.ts:30-41`) do not include `packages/core/src/explain` or `packages/core/src/drift`. Task 2.1 and the rewording in 5.10 therefore need no `seed:build`. `knowledge/confidence.ts` is left alone, as D14 says.
- `fileKindOf('README.md')` is `doc` and `'R' < 'd'` in byte order. The 12-document scenario's expected order is right.
- No test pins the export surface of `@codemind/core`, which answers the DIS-71 §3 note. Task 8.1's "none planned" holds.

Improvable:
- Task 1.1 switches the source double to `verificationContents` "after the first confrontation call". With two or more claims, the context-pack reads of claim 2 come after claim 1's confrontation and would see the verification contents. No current scenario uses `verificationContents` with more than one claim. Say in task 1.1 that the option is meant for single-claim tests. Alternatively, switch on "reads made by the verification", for example after the first confrontation whose verdict is `contradicted`, and let the per-claim pack reads see the normal contents.

## 9. Task size

Clean. 3.2 and 5.2 are split as run 1 asked. Task 1.1 (the double) and task 6.1 (the integration harness) are the largest. Both follow existing templates (`tests/support/explain-doubles.ts`, `tests/integration/explain/explain.spec.ts`) and fit one turn.

## 10. Mandatory steps

Clean.
- Step 0 is the branch (`feature/dis-71-drift-detection`, scope `DIS-71`).
- The mandatory sections are present and labelled per `docs/openspec-tasks-mandatory-steps.md`:
  - 8: Review existing tests;
  - 9: Run tests and verify data state, with the report template;
  - 10: Manual interface testing, AGENT MUST EXECUTE;
  - 11: Documentation;
  - 13: Pre-merge review, AGENT MUST EXECUTE, last.
- E2E is declared not applicable with a reason (10.7).
- The change writes nothing. 0.4, 9.5 and 10.4 compare counts and fingerprints. 10.1 says `db:seed` is the idempotent restoration. The scratchpad script is deleted.

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| Drift request | An invalid drift request is rejected before the store | 1.2, 1.3 |
| Drift request | A relative workspace root is rejected before the store | 1.4 |
| Unknown drift answers | Evaluation mode answers llm-required without reading anything | 1.5 |
| Unknown drift answers | A project without documents answers no-docs | 1.6 |
| Unknown drift answers | A docPath that is not a stored document answers no-docs | 1.7 |
| Documents checked by a call | Documents are checked in byte order and the rest is skipped by the limit | 3.6 |
| Documents checked by a call | A docPath checks only that document | 3.7 |
| Documents checked by a call | An unknown or unindexed project fails without calling the model | 3.8 |
| Claim extraction | The document is sent numbered and as untrusted data | 3.1, 3.2a |
| Claim extraction | An invalid extraction skips the document and the next one is checked | 3.2b, 3.3 |
| Claim extraction | A claim outside the document is dropped | 3.4 |
| Claim extraction | Claims beyond the per-document limit are omitted | 3.5 |
| Claim extraction | Secrets are redacted before any drift prompt | 4.8 |
| Context of a claim | Document spans are left out of a claim's context | 4.1, 4.2 |
| Context of a claim | A configuration file that shares a term with the claim joins the context | 4.3 |
| Context of a claim | A claim with no context is checked without a model call | 4.4 |
| Confrontation of a claim | A consistent claim is checked and not reported | 4.5 |
| Confrontation of a claim | A contradicted verdict citing an unknown id skips the claim | 4.6 |
| Confrontation of a claim | A contradicted verdict without evidence or statement skips the claim | 4.7 |
| Verification of a contradiction | A contradiction whose only code citation is broken is not reported | 5.2a, 5.3 |
| Verification of a contradiction | A contradiction keeps only its valid code citations | 5.4 |
| Verification of a contradiction | An unavailable verifier leaves the evidence cited | 5.5 |
| Verification of a contradiction | A broken document citation drops the contradiction | 5.6 |
| Drift report | The report of a contradiction carries both citations, its type and its provenance | 5.1, 5.2a, 5.2b |
| Drift report | The usage adds every answer and verify call of the run | 5.2c, 5.7 |
| Drift failures, logging and writes | A failing answer call propagates unchanged | 5.8 |
| Drift failures, logging and writes | A drift run writes nothing | 5.9 |
| Drift over the indexed acme-shop | The two planted contradictions of the pricing document are found | 6.1, 6.2 |
| Drift over the indexed acme-shop | A claim the code confirms is not a contradiction | 6.3 |

No empty row. All 29 scenarios have a task. Task 8.2's per-file count matches the spec:
- 16 in `drift.spec.ts`;
- 5 in `doc-claims.spec.ts`;
- 6 in `contradiction.spec.ts`;
- 2 in the integration file.

## Corrections to apply

### `specs/drift-detection/spec.md`

1. **Requirement "Confrontation of a claim" (B7).**
   - Replace "the claim's text and its document citation (path, lines and their text) and the context's sanitised spans, each under an evidence id local to the prompt (`E1…En`)" with: "the claim's text as untrusted data under the id `C1`, its document citation (path, lines and their text) as untrusted data under the id `D1`, and the context's sanitised spans, each under an evidence id local to the prompt (`E1…En`)".
   - Replace "then an id the prompt does not hold → `unknown_evidence_id`" with "then an id that is not one of the prompt's evidence ids `E1…En` (`C1` and `D1` included) → `unknown_evidence_id`".
2. **Requirement "Drift report" (B8).** Replace "the SHA-256 (lowercase hexadecimal) of exactly what its prompt sent" with "the SHA-256 (lowercase hexadecimal) of the UTF-8 bytes of `JSON.stringify` of the messages its prompt sent, the rule of `explain`".
3. **Scenario "The document is sent numbered and as untrusted data" (improvable, point 3).** Replace the THEN's last clause with: "and the report's events hold, wrapped with `docPath` `docs/pricing.md`, one `untrusted_content_flagged` event with pattern `delimiter-spoof` for line 2 and one with pattern `ignore-instructions` for line 3, both under the evidence id `D1`".

### `design.md`

1. **D5 (B7).** Replace the user message with `{ "claim": wrapUntrusted('C1', neutralised claim text), "document": { path, startLine, endLine, text: wrapUntrusted('D1', neutralised lines) }, "evidence": [ … as in explain's prompt, ids E1…En ... ] }`. In step 7, write "an id not in the prompt's `E1…En` (so `C1` or `D1` cited → `unknown_evidence_id`); only `E` ids reach `verifyAnswer`'s `spanOf`".
2. **D3 and D5 (B8).** Add: "`promptHash` is the SHA-256, lowercase hexadecimal, of the UTF-8 bytes of `JSON.stringify(messages)`, as `packages/core/src/explain/prompt.ts:95`."
3. **Risks (improvable, point 4).** Replace "a run is short" with "a run makes at most 130 `answer` calls plus their `verify` calls in one process".
4. **Follow-ups.** Add the following rows, both destination A:
   - "R12 (Audit run 2, B7; D5) The claim and the document of the confrontation prompt are wrapped as `C1` and `D1`; only `E1…En` are known evidence ids, so citing `C1` or `D1` is `unknown_evidence_id`."
   - "R13 (Audit run 2, B8; D3, D5) `promptHash` hashes `JSON.stringify(messages)` as `explain`."

### `tasks.md`

1. **Task 4.7 (B7).** Add an extra case: "a `contradicted` verdict citing `D1` (or `C1`) gives `unknown_evidence_id` and no `verify` call."
2. **Task 1.1 (B7).** The double unwraps `C1`, `D1` and `E1…En`. Also add one of the following:
   - "`verificationContents`/`verificationFailures` are meant for tests with one confronted claim";
   - or switch them on after the first confrontation whose verdict is `contradicted`.
3. **Task 3.2a and 5.2b (B8).** Name the hash rule: "`promptHash` = SHA-256 of `JSON.stringify(messages)`".
4. **Task 8.1 (point 6).** Replace "(the helpers of task 2.1 are renamed and exported; behaviour unchanged)" with "(`unfenced` is renamed `unfenceModelOutput` and exported by task 2.1; behaviour unchanged)".

### Linear (Spanish; the `[original]` block is not touched)

- **DIS-71, `[enhanced]` §3 "Confrontación":** after «una llamada `answer` con `sanitizeForPrompt` y la afirmación con su cita del doc», add «(la afirmación envuelta como `C1` y la cita del doc como `D1`; solo los ids `E1…En` son evidencias citables, y citar `C1` o `D1` es `unknown_evidence_id`)».
- **DIS-71, new comment:** «*(Texto del agente, spec-audit ronda 2, 2026-11-03.)* Segunda auditoría de `add-drift-detection`: CHANGES REQUIRED, 2 hallazgos bloqueantes. B7: no se fijaban los ids de los marcadores de la afirmación y del documento en el prompt de confrontación, ni si cuentan como evidencias conocidas; si el modelo citara `D1`, `verifyAnswer` fallaría con un `TypeError` en vez de descartar la afirmación. B8: no se fijaba qué bytes hashea `promptHash`; se adopta la regla de `explain` (`JSON.stringify(messages)`). Mejorables: el escenario del documento con marcadores debe nombrar también el evento `delimiter-spoof` de la línea 2; la tarea 8.1 aún habla de «los ayudantes» exportados; el cambio de contenidos del doble tras la primera confrontación afecta a pruebas con varias afirmaciones; y en Riesgos, «a run is short».»
