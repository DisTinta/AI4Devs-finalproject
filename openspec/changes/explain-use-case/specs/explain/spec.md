## Purpose

Answers a natural-language question about one indexed project in a single pass: builds the context,
asks the model once, types each statement from the code it cites, stores it as a claim with its
evidence and provenance, shows the stored claims that already cover that code, and answers `UNKNOWN`
with a reason instead of a plausible explanation when there is no anchor, no model or no evidence.

## ADDED Requirements

### Requirement: Explain request

The explain use case SHALL take the project id, the question, and optionally `tokenBudget` and `hops`
with the ranges and defaults of the context pack, plus the store, the source reader, the model, the
absolute workspace root and the clock. Before any call to the store, the source reader or the model:

- the request MUST be an object holding only `projectId`, `question`, `tokenBudget` and `hops`; a
  request that is not an object, or that holds any other field, is rejected naming `request`;
- `projectId` MUST be a string; its form is not checked here, because anchoring reports a malformed
  or unknown id as `ProjectNotFound`;
- the question MUST be a string of 1 to 1 000 Unicode code points (`MAX_QUESTION_CHARS`, an exported
  constant) that is not only whitespace; an astral character, such as an emoji, counts as one;
- `tokenBudget` and `hops`, when given, MUST be integers in their ranges;
- otherwise the call MUST fail with the domain error `InvalidExplainRequest` (code
  `INVALID_EXPLAIN_REQUEST`), whose `field` is one of `request`, `projectId`, `question`,
  `tokenBudget` and `hops` (a closed set declared once) and which never holds the value;
- a workspace root that is not absolute MUST fail with `RangeError` naming `workspaceRoot`, as the
  context pack does.

#### Scenario: An empty, blank or missing question is rejected before the store

- **WHEN** explain is called with the question `""`, with `"   "` and, from a caller without types,
  with `null` and with a request that has no `question`
- **THEN** each call fails with `InvalidExplainRequest` naming `question`
- **AND** no call was sent to the store, the source reader or the model

#### Scenario: A malformed request is rejected before the store

- **WHEN** explain is called, from a caller without types, with the request `"x"`, with a valid
  request plus the field `debug: true`, and with `projectId` `42`
- **THEN** the calls fail with `InvalidExplainRequest` naming `request`, `request` and `projectId`,
  and no error holds the value given
- **AND** no call was sent to the store

#### Scenario: The question length limit accepts its bound and rejects one more

- **WHEN** explain is called in evaluation mode with a question of 1 000 ASCII characters that
  anchors nothing, and with one of 1 001
- **THEN** the first is answered `UNKNOWN` with reason `no-anchor`, and the second fails with
  `InvalidExplainRequest` naming `question` before any store call

#### Scenario: The question length is counted in code points

- **WHEN** explain is called in evaluation mode with a question of 1 000 emojis (2 000 UTF-16 code
  units), and with one of 1 001 emojis
- **THEN** the first is answered `UNKNOWN` with reason `no-anchor`, and the second fails with
  `InvalidExplainRequest` naming `question`

#### Scenario: An invalid token budget, hop count or workspace root is rejected before the store

- **WHEN** explain is called with `tokenBudget` 999, with `hops` 4, and with the workspace root `repo`
- **THEN** the calls fail with `InvalidExplainRequest` naming `tokenBudget`, with
  `InvalidExplainRequest` naming `hops`, and with `RangeError` naming `workspaceRoot`
- **AND** no call was sent to the store

### Requirement: Precedence and UNKNOWN answers

Explain SHALL decide its answer in this order, and each step SHALL make exactly the calls below:

1. Validate the request (requirement "Explain request"). An invalid request is an error, not an
   `UNKNOWN` answer.
2. Anchor the question once. An empty anchor SHALL answer `UNKNOWN` with reason `no-anchor`, in live
   and in evaluation mode, without building the pack.
3. (The answer cache of DIS-21 will sit here.)
4. When the model is in evaluation mode, answer `UNKNOWN` with reason `llm-required` and the message
   `evaluation mode (cache-only): set LLM_* to enable free-form asks`, without building the pack.
5. Build the context pack from the anchor already computed. A pack with no span SHALL answer
   `UNKNOWN` with reason `over-budget`.
6. Read the prior claims of the pack's spans (requirement "Prior claims"), once.
7. Ask the model once, with the purpose `answer`.
8. Quarantine the output. A discarded output SHALL answer `UNKNOWN` with reason
   `invalid-model-output` and carry the schema-violation event.
9. An accepted output with no statement SHALL answer `UNKNOWN` with reason `no-evidence`.
10. Type, store and return the statements (requirements "Answer with typed statements" and
    "Persistence failure").

The prior-claims read SHALL therefore be called 0 times for an invalid request, `no-anchor`,
`llm-required` and `over-budget`, and once, before the model, for `invalid-model-output`,
`no-evidence` and an answer with statements. The model SHALL be called 0 times up to step 6.

An `UNKNOWN` answer SHALL have exactly `kind: 'unknown'`, `answer: 'UNKNOWN'`, `reason` (one of the
closed set `no-anchor`, `llm-required`, `over-budget`, `invalid-model-output`, `no-evidence`, declared
once), `message` only for `llm-required`, `statements: []`, `evidence: []` and `events`. It SHALL NOT
carry `persisted` nor prior claims, SHALL NOT carry the model's answer text, and no claim or evidence
SHALL be written for it.

Errors SHALL propagate unchanged and write nothing: `ProjectNotFound`, `SourceUnavailable`, the
model's `LlmUnavailable` and `BudgetExhausted`, and any failure of the prior-claims read (then the
model SHALL NOT have been called).

#### Scenario: A question without anchor is unknown in both modes without building the pack

- **WHEN** acme-shop is loaded and `¿Dónde vive el ornitorrinco?` is explained with a live model and
  with an evaluation model
- **THEN** both answers are `UNKNOWN` with reason `no-anchor`
- **AND** the model, the source reader and the prior-claims read received 0 calls, and no claim was
  written

#### Scenario: Evaluation mode answers llm-required without building the pack

- **WHEN** acme-shop is loaded and `¿Cómo se calcula el precio final de un pedido?` is explained with
  an evaluation model
- **THEN** the answer is `UNKNOWN` with reason `llm-required` and the message `evaluation mode
  (cache-only): set LLM_* to enable free-form asks`
- **AND** the model, the source reader, the traversal, the project read and the prior-claims read
  received 0 calls, and no claim was written

#### Scenario: A pack where nothing fits is unknown over budget

- **WHEN** a question is explained with a live model and a budget of 1000, where the anchor span and
  every candidate span are larger than that budget
- **THEN** the answer is `UNKNOWN` with reason `over-budget`
- **AND** the prior-claims read and the model received 0 calls

#### Scenario: A discarded model output is unknown and carries its event

- **WHEN** the price question is explained with a live model whose output carries `"type":"FACT"` in a
  statement, then with one citing an unknown evidence id, then with one whose statement text holds
  U+0000
- **THEN** each answer is `UNKNOWN` with reason `invalid-model-output`, without prior claims and
  without the model's answer, and its events hold one schema-violation event with subcode
  `invalid_shape`, `unknown_evidence_id` and `invalid_shape`
- **AND** the prior-claims read was called once before the model each time, and no claim or evidence
  was written

#### Scenario: An output without statements is unknown with no evidence

- **WHEN** the price question is explained with a live model whose output is
  `{"answer":"Se calcula sumando todo.","statements":[]}`
- **THEN** the answer is `UNKNOWN` with reason `no-evidence`, without prior claims, and no part of it
  holds `Se calcula sumando todo.`
- **AND** the prior-claims read was called once before the model, and no claim or evidence was written

#### Scenario: A failing prior-claims read stops before the model

- **WHEN** the price question is explained with a live model and the prior-claims read fails
- **THEN** explain fails with that error
- **AND** the model received 0 calls and no claim was written

#### Scenario: An unknown project or an unindexed one fails without calling the model

- **WHEN** the price question is explained with a live model in a well-formed UUID that names no
  project, and then in a project whose graph anchors the question but that has no indexed commit
- **THEN** the first call fails with `ProjectNotFound` and the second with `SourceUnavailable` with
  reason `not-indexed`
- **AND** the model received 0 calls and no claim was written

#### Scenario: Model failures propagate without writing

- **WHEN** the price question is explained with a live model that fails with `LlmUnavailable`, and
  with one that fails with `BudgetExhausted`
- **THEN** explain fails with that same error each time, and no claim was written

#### Scenario: The question is anchored once

- **WHEN** the price question is explained with a live model that returns a valid answer
- **THEN** the store received as many symbol searches as one anchoring of that question sends

### Requirement: Prompt and evidence ids

Explain SHALL give the model one evidence id per span of the pack, `E1` to `En` in the pack's rank
order, and SHALL accept from the model only those ids. The prompt SHALL hold the question and, for
each span, its id, its file path, its first and last line and its text, and SHALL instruct the model
to answer in the language of the question. The prompt hash of the provenance SHALL be the SHA-256, in
lowercase hexadecimal, of the UTF-8 bytes of `JSON.stringify(messages)`, the exact messages sent: the
same question and pack SHALL give the same hash, and any change of the question or of a span's text
SHALL change it.

#### Scenario: Each span of the pack gets one evidence id in rank order

- **WHEN** a question whose pack holds three spans is explained with a live model
- **THEN** the prompt sent names `E1`, `E2` and `E3` with the path, lines and text of the first,
  second and third span, holds the question, and tells the model to answer in the question's language
- **AND** an output citing `E4` is discarded as `unknown_evidence_id`

#### Scenario: The prompt hash covers the whole prompt

- **WHEN** the same question and pack are explained twice, then with a different question, then with
  one span's text changed
- **THEN** the first two provenances share one prompt hash, equal to the SHA-256 of
  `JSON.stringify` of the messages sent, and the other two each have a different one

### Requirement: Answer with typed statements

For an accepted output with statements, explain SHALL type each statement from the spans its
evidence ids name (the typing rule of `claims-and-typing`), store one claim per statement with its
evidence, and answer with:

- `kind: 'answered'`, `persisted: true`, the model's `answer`, `events: []`, the prior claims, and
  `statements`, each with its `text`, its `type` (`FACT` or `INFERENCE`), `status: 'current'`,
  `verification: 'none'` and `evidenceIds`, the ids of its evidence rows in the order the model cited
  them;
- `evidence`, one entry per citation, in statement order then citation order, each with the id of
  its stored evidence row, its file id, file path, first and last line and excerpt.

Each claim SHALL be stored with: the project id; as subject, the symbol name of the span of the
statement's **first** evidence id in the order the model gave them, or that span's file path when it
has no symbol; as predicate the exported constant `CLAIM_PREDICATE_EXPLAINS` (`explains`); as object
the statement text; layer `L2`; type `INFERENCE`, whatever the statement's type; status `current`;
`confidence` `null`; and a provenance with the model name the model reported, the prompt hash, as
input spans every span of the pack (file id, first and last line), the clock's instant in ISO 8601
with time zone, and the statement's type as statement type. A statement typed `FACT` is therefore
stored as an `L2` `INFERENCE` claim whose provenance keeps `FACT`, and is answered as `FACT`.

Each cited span SHALL give one evidence row of that claim, with the span's file id, first and last
line, verification `none` and, as excerpt, the span's redacted text.

#### Scenario: An answer with evidence is typed, stored and returned

- **GIVEN** acme-shop indexed in the database, its history rebuilt, and a live model whose output has
  one statement citing only the `anchor` span of `app/Services/PriceCalculator.php` (lines 16–44, which
  holds `PriceCalculator::compute`) and one citing a `heuristic` span
- **WHEN** `¿Cómo se calcula el precio final de un pedido?` is explained
- **THEN** the model was called once with the purpose `answer`, and the answer is `answered` with
  `persisted: true`, the first statement `FACT` and the second `INFERENCE`, both `current` and with
  verification `none`
- **AND** every evidence id of the statements names a stored evidence row whose excerpt equals the
  cited span's text

#### Scenario: A fact is stored as an inferred claim that keeps its type

- **WHEN** the answer of the previous scenario is stored
- **THEN** both claims have layer `L2`, type `INFERENCE`, status `current`, `confidence` `null`,
  predicate `explains` and the statement text as object, and their provenances hold the statement
  types `FACT` and `INFERENCE`, the model name, the prompt hash, every span of the pack as input spans
  and the clock's instant
- **AND** the answer still shows the first statement as `FACT`

#### Scenario: The evidence of a stored answer lists every citation in order

- **WHEN** a question is explained with a live model whose output has two statements, the first
  citing `E1` and `E2`, the second citing `E1`, and the claims are stored
- **THEN** the answer's evidence holds three entries, for the spans of `E1`, `E2` and `E1` in that
  order, each with a distinct stored evidence id
- **AND** the statements' evidence ids are the first two ids and the third id

#### Scenario: The subject of a claim is the symbol of its first cited span

- **GIVEN** a pack whose span `E1` is the symbol `PriceCalculator::compute` and whose span `E2` is the
  whole file `docs/pricing.md`
- **WHEN** a statement citing `E1` then `E2`, and a statement citing `E2` then `E1`, are stored
- **THEN** the first claim's subject is `PriceCalculator::compute` and the second's is
  `docs/pricing.md`

### Requirement: Persistence failure

When, and only when, the store rejects the write of the claims with `ClaimWriteFailed`, explain SHALL
still answer, with the same shape as a stored answer: `kind: 'answered'`, `persisted: false`, the
model's `answer`, the typed statements, the prior claims, `evidence` and `events`. Every evidence id
of a statement, and every evidence entry id, SHALL be the prompt's id (`E1`…); `evidence` SHALL hold
one entry per distinct cited prompt id, in first-citation order. Its events SHALL hold one event
`{ type: 'claims_not_persisted', code }`, whose `code` comes from the closed set
`store-write-failed`, declared once. The event SHALL carry no message, no detail, no cause, no part
of the question and no part of the model's output. Any other rejection of the write
(`InvalidStoreQuery`, `ProjectNotFound`, anything else) SHALL propagate as an error.

#### Scenario: A failed write still answers, unsaved and without leaking

- **GIVEN** the in-memory store with a write failure injected at the evidence of the second claim,
  raised as a `ClaimWriteFailed` while that evidence's excerpt holds a sentinel text
- **WHEN** a question is explained with a live model whose output has two statements, the first
  citing `E1` and `E2`, the second citing `E1`
- **THEN** the answer is `answered` with `persisted: false`, the model's `answer` and the prior
  claims; its statements cite `E1`, `E2` and `E1`; its evidence holds exactly one entry `E1` and one
  `E2`, in that order; and its events are exactly
  `[{ type: 'claims_not_persisted', code: 'store-write-failed' }]`
- **AND** the serialised events hold neither the sentinel nor the question, and no claim was stored

#### Scenario: A failed write over the database still answers without leaking

- **GIVEN** acme-shop indexed in the database, and the database rejecting the write of an evidence
  with an error whose `detail` quotes a sentinel text
- **WHEN** the price question is explained with a live model whose output cites that evidence
- **THEN** the answer is `answered` with `persisted: false` and its events are exactly
  `[{ type: 'claims_not_persisted', code: 'store-write-failed' }]`
- **AND** the serialised events hold neither the sentinel nor the question, and no claim of the call
  exists

#### Scenario: Other write errors propagate

- **WHEN** the write of the claims rejects with `InvalidStoreQuery`, and then with `ProjectNotFound`
- **THEN** explain fails with that same error each time
- **AND** no claim was written

### Requirement: Prior claims

Explain SHALL read, once and before calling the model, the stored claims of the project whose
evidence overlaps the spans of the pack (`graph-store`, "Claim retrieval by overlapping span"), and
SHALL return them in a list of prior claims, separate from the statements, always with their stored
ids, in the order the store returns them (at most the 20 most recent, newest first). Each prior claim
SHALL carry its id, its text (the stored object), its displayed type, its status, its evidence (id,
file id, file path, lines, excerpt) and, when stale, a warning.

The displayed type SHALL be the provenance's statement type when the claim has one, and its stored
type otherwise; when the claim is `stale`, a displayed `FACT` SHALL become `INFERENCE` (a stale
`INFERENCE` or `UNKNOWN` keeps its type), and the claim SHALL carry `warning: 'stale-evidence'`. A
stale claim SHALL never be displayed as `FACT`. Stale claims are not recomputed.

#### Scenario: Prior claims show their displayed type and stale warning

- **GIVEN** five stored claims of acme-shop, created in this order, whose evidence cites lines 25–35
  of `app/Services/PriceCalculator.php` (`PriceCalculator::compute`): current `L2` `INFERENCE` with
  statement type `INFERENCE`, current with `FACT`, stale with `INFERENCE`, stale with `FACT`, and a
  stale `L2` `UNKNOWN` claim
- **WHEN** the price question is explained with a live model that returns a valid answer
- **THEN** the prior claims show, newest first: `UNKNOWN` stale with `warning: 'stale-evidence'`,
  `INFERENCE` stale with the warning, `INFERENCE` stale with the warning, `FACT` current without a
  warning, and `INFERENCE` current without a warning, each with its evidence's file path
  `app/Services/PriceCalculator.php` and lines 25–35
- **AND** the prior-claims read was called once, before the model

### Requirement: Explain events and logging

The events of an answer SHALL be of the type `ExplainEvent`, the union of the schema-violation event
and the `claims_not_persisted` event, separate from the audit events of indexing. Explain SHALL
return its events and SHALL write nothing to any log; neither the question, nor a span's text, nor
the model's output SHALL be written to any log, event or error.

#### Scenario: Explaining writes nothing to the console

- **WHEN** a question is explained once for each `UNKNOWN` reason, once with a stored answer and once
  with a failed write
- **THEN** nothing is written through `console`
