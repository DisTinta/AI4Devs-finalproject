## Context

See `proposal.md` → Why. The design decisions D1–D12 were taken by the agent as lead engineer while
enriching DIS-71 (autonomous run, 2026-11-03; Linear comment on DIS-71) and are carried here; D13–D16
were taken while proposing. All of them are the agent's text.

What the change builds on, as it is today on `final-project-CRN`:

- `explain` (`packages/core/src/explain/explain.ts`, DIS-39) is the flow `drift` imitates: pack →
  sanitisation (`sanitizeForPrompt`, `untrusted-text.ts`) → one `answer` call → quarantine
  (`statement-schema.ts`) → verification (`verifyAnswer`, DIS-68 syntactic + DIS-70 semantic) → usage
  (`meterLlm`, `usage.ts`, DIS-74).
- The context pack (`buildContextPack`, DIS-28/39) anchors a question on symbol names; its spans carry
  `fileId`, `fileKind`, `origin`, `distance`. Files without symbols (`config/shop.php`) only enter
  through traversal, and `docs/pricing.md` names no symbol, so it has no `describes` edge (DIS-49,
  DIS-94; `fixtures/README.md` row Q2).
- The store gives the paths of a project's files (`readIndexState`), but no read maps a path to its
  file id. `provenanceSchema` (`knowledge/claim.ts`) requires a file id (UUID) per input span.
- `LlmPurpose` is `answer | verify`; the daily ceiling (`withDailyBudget`) is applied by the
  composition root around the model, not by the use cases.

## Goals / Non-Goals

**Goals:**

- A pure core use case `drift(dependencies, request)` with the dependencies of `explain` and no new
  port, store read, table or LLM purpose.
- Reuse, not copy: the context pack, the sanitisation, the untrusted-text wrapping, the quarantine
  helpers, `verifyCitations`, `verifyAnswer` and the usage meter are called as they are.
- Every model output is untrusted and quarantined; one bad output costs one document or one claim,
  never the run.
- Deterministic tests: the model is a scripted double that recognises the two new prompts.

**Non-Goals:**

- The CLI, the golden Q5 answer, the `query_log` row (DIS-73, D10); case B of the fixture (D11);
  persistence of contradictions (D7); feeding `explain`'s confidence (D14).
- Any change to `explain`'s behaviour, prompts or hashes.

## Decisions

### D1. The use case and its dependencies (enrich D1)

`drift(dependencies: DriftDependencies, request: DriftRequest): Promise<DriftReport>` in
`packages/core/src/drift/drift.ts`. `DriftDependencies` has the fields of `ExplainDependencies`
(`store`, `source`, `llm`, `workspaceRoot`, `now`, `verificationCache`, `costTable?`), declared as its
own interface so `explain` and `drift` evolve separately. `DriftRequest` is a strict Zod object
(`drift-request.ts`) with `InvalidDriftRequest` mirroring `InvalidExplainRequest` (closed field set
`request | projectId | docPath | tokenBudget`). Order of a call: validate → `workspaceRoot` absolute
→ `evaluation` ⇒ `llm-required` → `readIndexState` ⇒ `no-docs` → `getProject` (root and commit;
`not-indexed`) → clock first read → batched read of the checked documents → per document: extract,
then per claim: context, confront, verify → clock last read → report.

*Alternative rejected:* passing `ExplainDependencies` directly; it couples the two use cases' JSDoc
contracts (the clock's read count differs).

### D2. Which documents (enrich D2)

The documents are the paths of `readIndexState(projectId).files` with `fileKindOf(path) === 'doc'`,
in byte order (the order the store already returns), not the `describes` edges: `docs/pricing.md` has
none. `docPath` narrows to one path; a `docPath` that is not one of them is `no-docs`, never an error,
so a caller cannot probe for non-document files. `MAX_DRIFT_DOCS = 10` (exported); later documents
get `drift_doc_skipped` `limit` and are not read.

### D3. Claim extraction (enrich D3)

`doc-claims.ts`. The document is read once (batched with the other checked documents) at the indexed
commit and redacted with `redactedLines` (the rule of the pack and the verifier). It is turned into
one whole-file `ContextSpan` (kind `doc`, D13) and passed through `sanitizeForPrompt` with an empty
question, which gives the flags, the cut at `MAX_EVIDENCE_TEXT_CHARS` and the sanitisation events with
no new code. A cut ends the span at its kept last line (`endLine`), and that is "the last line sent"
of the spec: a claim ending after it is dropped (`droppedClaims`). A document whose first line alone
exceeds the limit is cut inside that line, so only claims on line 1 can be kept. The prompt (`drift-prompts.ts`,
`buildExtractionPrompt`) has a fixed system message and a user message JSON
`{ "document": { "path", "lines": "<<<UNTRUSTED_DATA D1>>>\n11\t…\n<<<END_UNTRUSTED_DATA D1>>>" } }`,
each line neutralised and prefixed by its number and a tab. The output schema is a strict Zod object
in `doc-claims.ts` reusing the fence unwrapping and the `SchemaViolationEvent` construction of
`statement-schema.ts` (the two private helpers `unfenced` and `discard` are exported from it for this,
unchanged in behaviour; D16). Limits exported: `MAX_EXTRACTED_CLAIMS = 50` (schema bound, an output
with more is `limit_exceeded`), `MAX_DOC_CLAIMS = 12` (confronted), `MAX_CLAIM_CHARS = 500`.
No new LLM purpose: extraction is an `answer` call, so the adapter's model choice and the meter's
`generation` bucket apply.

*Alternative rejected:* a new purpose `extract`; it would change `LlmPurpose`, the adapter's model
configuration and the cost table for no gain at this size.

### D4. Context of a claim (enrich D4)

`contradiction.ts`, `claimContext`. `buildContextPack({ store, source, workspaceRoot }, { projectId,
question: claim.text, tokenBudget })`, keeping the spans whose `fileKind !== 'doc'`. Then the config
files: the paths of the index state with `fileKindOf(path) === 'config'` whose name does not start with
`.env` (D15), read once per call in one batched `readFilesAt` at the indexed commit (lazily, before the
first confrontation that needs them), redacted; a file matches a claim when
`normaliseText(redactedContent)` contains any of `questionTerms(claim.text)`. Matching files not
already in the pack, in byte order, at most `MAX_CONFIG_SPANS = 3`, each a whole-file span of its
first `MAX_CONFIG_LINES = 200` lines (`spanText`), `origin: 'heuristic'`, `distance: 1`, included while
`estimateTokens(text)` fits `tokenBudget − pack.tokens`. A context with no span ⇒ no call, the claim
is checked (no contradiction). Without this addition `config/shop.php` (the €75 value), which has no
symbol, never reaches the model.

*Alternative rejected:* anchoring configuration keys as symbols (analyzer change, reindex of the seed).

### D5. Confrontation (enrich D5)

One `answer` call per claim with context. `buildConfrontationPrompt(claim, citation, sanitized)`:
fixed system message; user message JSON `{ "claim": wrapped(neutralised text), "document": { path,
startLine, endLine, text: wrapped }, "evidence": [ … as in explain's prompt … ] }`, the spans
sanitised by `sanitizeForPrompt(claim.text, spans)` (the claim is the "question": its flags and the
spans' events come from there). Output schema strict: `verdict` enum, `statement` ≤ 500 code points,
`evidenceIds` ≤ 10 distinct known ids; a `superRefine` turns a `contradicted` with a blank statement
or no ids into `invalid_shape`/`empty_evidence`; unknown ids → `unknown_evidence_id`, duplicates →
`duplicate_evidence_id` (the explain quarantine's subcodes and order).

### D6. Verification and type (enrich D6)

The document citation goes through `verifyCitations(source, root, commit, [{ path, startLine,
endLine, excerpt }])` (syntactic only: the document is the claim's own source, there is nothing to
entail), under the id `D1` in its `evidence_broken` event. The code side is one `TypedStatement`
`{ text: statement, type: 'INFERENCE', spans, evidenceIds }` passed to `verifyAnswer` with the
prompt's id → span map, so broken citations, the semantic check, the cache and the
`entailment_unverified` events are exactly `explain`'s. The document citation is checked first; when
it is broken the code side is not checked (no `verify` call). The contradiction's `type` is always
`INFERENCE` (a judgement between two sources), whatever the entailment policy says.

### D7. No persistence (enrich D7, destination D)

Contradictions are not written as `claim`/`evidence` rows: the report is recomputed on every call, and
stored contradictions would mix with the prior claims `explain` reads (`findClaimsOverlapping`). No
`query_log` row here either (DIS-73 writes it from the CLI, D10).

### D8. Unknown answers (enrich D8)

`evaluation` ⇒ `{ status: 'unknown', reason: 'llm-required' }` before any read (cheaper and honest:
nothing can be judged without a model; the golden Q5 of DIS-73 is a CLI concern). No documents ⇒
`no-docs`. Both are values, not errors.

### D9. Failure isolation (enrich D9)

An invalid extraction ⇒ `drift_doc_skipped` (`invalid-model-output`, subcode); an invalid
confrontation ⇒ `drift_claim_skipped`. Store, source and `answer` failures propagate unchanged, as in
`explain` (an `answer` failure is not a model *output* problem).

### D10. What DIS-73 owns (enrich D10, destination B → DIS-73)

The `drift` CLI command, the golden Q5 answer in evaluation mode and the `query_log` row with
`capability = 'drift'` (the column value exists since DIS-74). DIS-73 wires `withDailyBudget` around
the model as the `ask` command does. A Spanish comment on DIS-73 records this.

### D11. Case B out (enrich D11, destination D)

Rules implemented and tested but undocumented (`fixtures/README.md` case B) need the opposite
direction (code → docs) and are a different story; the parent HU lists them as a non-goal.

### D12. The scripted model (enrich D12)

`tests/support/drift-doubles.ts`: `createDriftLlm({ extract, confront, verify?, usage? })` parses the
user message of each `answer` request, tells the extraction prompt (`document` key) from the
confrontation prompt (`claim` key), unwraps the markers and hands the script a view (`{ path, lines }`
or `{ claim, document, evidence: [{ id, path, startLine, endLine }] }`), so a script can cite "the span
of `config/shop.php`" without knowing its id; `verify` requests go to a verifier script that entails
every pair by default. Plus `driftDeps(...)` over the in-memory store and source tree. It reuses
`tests/support/in-memory-store.ts` and `in-memory-source-tree.ts` without changing them;
`tests/support/scripted-llm.ts` is not touched, so no existing test changes.

### D13. Provenance by path; spans without a file id (propose)

`readIndexState` gives paths, not file ids, and no store read maps one to the other; the document and
configuration spans therefore have no file id, and `provenanceSchema` (which requires a UUID per input
span) cannot hold them. Since the report is not persisted (D7), the contradiction's provenance is
`{ model, promptHash, inputSpans: [{ path, startLine, endLine }], createdAt }`, validated by an exported
`driftProvenanceSchema` (same rules as `provenanceSchema` with `path` — a non-empty string — in place
of `fileId`). Internally, the whole-file spans of documents and configuration files are `ContextSpan`
values whose `fileId` is the exported constant `UNSTORED_FILE_ID = ''`: `sanitizeForPrompt`,
`verifyCitations` and `verifyAnswer` never read `fileId` (checked: `grep fileId` over
`explain/sanitize.ts` and `verify/` finds nothing), and nothing of `drift` writes a claim. The report
never exposes a `fileId`. This deviates from the ticket's AC 1 wording ("`provenance` válida para
`provenanceSchema`"); the substance (model, prompt hash, non-empty input spans, instant) is kept.

*Alternative rejected:* a new store read `listFiles(projectId)` with ids — a port change, a Postgres
query, the in-memory double and the `calls` assertions of `tests/unit/explain/explain.spec.ts` (as
DIS-94 had to change), for a provenance nobody stores. Recorded as a follow-up only if DIS-73 or a
later story persists contradictions.

### D14. `explain`'s confidence stays without contradictions (propose, destination D)

`explain.ts` passes `{ contradiction: false }` to `confidence` with the comment "No component produces
contrary evidence until DIS-71". `drift` produces contradictions but does not persist them (D7), so
`explain` still has none to read; the comment is reworded to say so (no code or behaviour change). If a
later story persists them, it decides whether they lower the confidence of overlapping answers.

### D15. `.env*` files never enter a prompt (propose)

`fileKindOf` classifies `.env.example` as `config` (a name starting with `.`). Redaction removes
secrets, but a configuration prompt does not need environment templates, so names starting with `.env`
are excluded from the configuration context: the least data sent to the model.

### D16. Two quarantine helpers exported (propose)

`unfenced(text)` and `discard(text, subcode, issues)` of `statement-schema.ts` are exported (renamed
`unfenceModelOutput` and `discardModelOutput`) so the two drift schemas build the same
`SchemaViolationEvent` (size, SHA-256, issues capped) without a copy. Behaviour of
`parseModelOutput` unchanged; its tests (`tests/unit/explain/statement-schema.spec.ts`) stay green
unchanged.

### D17. Events of the report

Inner events keep `explain`'s shapes (`SanitizationEvent`, `EvidenceBrokenEvent`,
`EntailmentUnverifiedEvent`), whose evidence ids are local to one prompt; so each reaches the report
wrapped: `{ type: 'drift_check_event', docPath, claimIndex?, event }`. The two drift events are
`{ type: 'drift_doc_skipped', docPath, reason: 'invalid-model-output' | 'limit', subcode? }` and
`{ type: 'drift_claim_skipped', docPath, claimIndex, reason: 'invalid-model-output', subcode }`. None
holds text from the document, the claims or the model output (the subcode only).

### D18. Usage and clock

`meterLlm(llm, costTable ?? COST_TABLE)` wraps the model once per call; `usage = { inputTokens,
outputTokens, costUsd, latencyMs, generation: meter.generation(), verification: sum of the
`VerificationUsage` of every `verifyAnswer` (`sumVerificationUsage`) }`. The clock is read first after
`getProject` (provenance instant, latency start) and last after the final verification; each
semantic check reads it twice more, as in `explain`. No baseline or savings: there is no single pack.

### D19. No ADR

The change adds a module behind the existing ports and reuses existing patterns; nothing is costly to
revert. No ADR (destination D).

## Risks / Trade-offs

- [Cost per run: up to 10 × (1 + 12) = 130 `answer` calls plus `verify` calls] → the two limits are
  exported constants, the CLI of DIS-73 runs under `withDailyBudget`, and `docPath` narrows a run to
  one document.
- [The model may extract vague or non-checkable claims] → only `contradicted` with verified evidence on
  both sides is reported; the type is always `INFERENCE`; the DoD is the scripted run, and live quality
  is measured by DIS-73's golden Q5.
- [Configuration matching by term substring is coarse (a short term like `tax` matches many files)] →
  at most 3 files, 200 lines each, inside the token budget; byte order makes it deterministic.
- [`fileId: ''` inside internal spans could leak into a write if a later change persists drift output]
  → `UNSTORED_FILE_ID` is named and documented, `ClaimItem` validation (`inputSpanSchema`, UUID) would
  reject it, and D13 says persistence needs a file-id read first.
- [Exporting two quarantine helpers widens `@codemind/core`'s surface] → they are pure and already the
  single rule; mutation testing covers them through both callers.

## Migration Plan

None: new module, no migration, no seed regeneration (no fingerprint input changes: the analyzer
fingerprint covers `packages/core/src/knowledge` and the store adapter, which this change does not
edit; task 9.5 checks the header lines anyway).

## Follow-ups

All rows are the agent's text (autonomous run, 2026-11-03). No row has destination C.

| Id | Decision or finding | Destination |
|---|---|---|
| E1 | (D1) Use case `drift(dependencies, request)` in `packages/core/src/drift/`, dependencies of `explain`, request `{ projectId, docPath?, tokenBudget? }`; no port or database change. | A |
| E2 | (D2) Documents from `readIndexState` filtered by `fileKindOf === 'doc'`, not `describes` edges. | A |
| E3 | (D3) One `answer` call per document; strict schema; `MAX_DOC_CLAIMS = 12`, `MAX_DRIFT_DOCS = 10`; no new purpose. | A |
| E4 | (D4) Context: pack without document spans plus matching configuration files as whole-file spans. | A |
| E5 | (D5) One `answer` call per claim; `contradicted | consistent | unrelated`; only `contradicted` with known evidence counts. | A |
| E6 | (D6) Document citation syntactic; code side `verifyAnswer`; type always `INFERENCE`. | A |
| E7 | (D7) Contradictions not persisted; no `query_log` row in this change. | D — accepted |
| E8 | (D8) `evaluation` ⇒ `llm-required`; no documents or a non-document `docPath` ⇒ `no-docs`. | A |
| E9 | (D9) Invalid output skips a document or a claim with an event; other failures propagate. | A |
| E10 | (D10) CLI `drift`, golden Q5, `query_log` row with `capability = 'drift'`, `withDailyBudget` wiring. | B — DIS-73 |
| E11 | (D11) Case B of `fixtures/README.md` (undocumented rule) out of scope. | D — accepted |
| E12 | (D12) New double `tests/support/drift-doubles.ts`; `scripted-llm.ts` untouched. | A |
| P1 | (D13) Provenance by path (`driftProvenanceSchema`), not `provenanceSchema`; internal spans of documents and configuration files carry `UNSTORED_FILE_ID`. Deviation from the wording of AC 1, recorded on DIS-71. | A |
| P2 | (D14) `explain` keeps `contradiction: false`; its comment is reworded. | D — accepted |
| P3 | (D15) `.env*` configuration files are excluded from the context. | A |
| P4 | (D16) `unfenced`/`discard` exported from `statement-schema.ts` as `unfenceModelOutput`/`discardModelOutput`. | A |
| P5 | (D19) No ADR. | D — accepted |
