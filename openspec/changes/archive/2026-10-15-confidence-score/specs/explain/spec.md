## MODIFIED Requirements

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
6. Sanitise the question and the pack's spans (requirement "Untrusted content sanitization"). From
   here on, the spans of the pack are the sanitised spans.
7. Read the prior claims of the pack's spans (requirement "Prior claims"), once.
8. Ask the model once, with the purpose `answer`.
9. Quarantine the output. A discarded output SHALL answer `UNKNOWN` with reason
   `invalid-model-output` and carry the sanitisation events followed by the schema-violation event.
10. An accepted output with no statement SHALL answer `UNKNOWN` with reason `no-evidence` and carry
    the sanitisation events.
11. Type the statements, then verify their citations (requirement "Answer with typed statements"):
    the syntactic check of `evidence-verification` over the distinct cited spans, at the commit the
    pack was read at and from the root it was read from, then the output policy. When no statement is
    left, answer `UNKNOWN` with reason `broken-evidence`, carrying the sanitisation events followed by
    the `evidence_broken` events.
12. Check semantically every remaining citation of every remaining statement (the semantic check of
    `evidence-verification`, with the verification cache explain was given), then apply the
    entailment policy.
13. Store and return the verified statements (requirements "Answer with typed statements" and
    "Persistence failure").

The prior-claims read SHALL therefore be called 0 times for an invalid request, `no-anchor`,
`llm-required` and `over-budget`, and once, before the model, for `invalid-model-output`,
`no-evidence`, `broken-evidence` and an answer with statements. The model SHALL be called 0 times up
to step 7, once with the purpose `answer` at step 8, and with the purpose `verify` only at step 12:
0 times for `invalid-model-output`, `no-evidence` and `broken-evidence`. The source reader SHALL
receive the pack's batched read and, for `broken-evidence` and an answer with statements only, the
verification reads of step 11 after the model; none for `invalid-model-output` or `no-evidence`.

An `UNKNOWN` answer SHALL have exactly `kind: 'unknown'`, `answer: 'UNKNOWN'`, `reason` (one of the
closed set `no-anchor`, `llm-required`, `over-budget`, `invalid-model-output`, `no-evidence`,
`broken-evidence`, declared once in that order), `message` only for `llm-required`,
`statements: []`, `evidence: []` and `events`. It SHALL NOT
carry `persisted`, prior claims, `usage` nor `confidence`, SHALL NOT carry the model's answer text, and no claim or
evidence SHALL be written for it.

Errors SHALL propagate unchanged and write nothing: `ProjectNotFound`, `SourceUnavailable`, the
`LlmUnavailable` and `BudgetExhausted` of the `answer` call, any failure of the prior-claims read
(then the model SHALL NOT have been called), any failure of the verification reads that the syntactic
check propagates, and any failure of a `verify` call that the semantic check propagates. An
`LlmUnavailable` or `BudgetExhausted` of a `verify` call SHALL NOT propagate: it degrades the
citations it could not check (`evidence-verification`, "Semantic citation check").

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
- **AND** the prior-claims read was called once before the model each time, the model received no
  `verify` request, and no claim or evidence was written

#### Scenario: An output without statements is unknown with no evidence

- **WHEN** the price question is explained with a live model whose output is
  `{"answer":"Se calcula sumando todo.","statements":[]}`
- **THEN** the answer is `UNKNOWN` with reason `no-evidence`, without prior claims, and no part of it
  holds `Se calcula sumando todo.`
- **AND** the prior-claims read was called once before the model, the model received no `verify`
  request, and no claim or evidence was written

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

- **WHEN** the price question is explained with a live model whose `answer` call fails with
  `LlmUnavailable`, and with one whose `answer` call fails with `BudgetExhausted`
- **THEN** explain fails with that same error each time, and no claim was written

#### Scenario: Every citation broken is unknown with broken evidence

- **GIVEN** a live model whose output has two statements citing `E1` and `E2`, and the files of both
  spans changed between the pack's read and the verification read, both at the pack's commit
- **WHEN** the price question is explained
- **THEN** the answer is exactly `{ kind: 'unknown', answer: 'UNKNOWN', reason: 'broken-evidence',
  statements: [], evidence: [], events }`, without prior claims, without `usage` and without the
  model's answer, and `events` are the sanitisation events followed by one `evidence_broken` event for
  `E1` and one for `E2`, each with reason `excerpt-mismatch`
- **AND** the prior-claims read was called once before the model, the model received no `verify`
  request, and the claim write received 0 calls

#### Scenario: A verification read failure propagates without writing

- **GIVEN** a live model whose output cites `E1`, and a source whose verification read rejects with
  `SourceUnavailable` with reason `too-large`
- **WHEN** the price question is explained
- **THEN** explain fails with that same error
- **AND** the claim write received 0 calls

#### Scenario: No verification read without statements

- **WHEN** the price question is explained with a live model whose output is not JSON, and then with
  one whose output has no statement
- **THEN** each time the source reader received only the pack's batched read

#### Scenario: The question is anchored once

- **WHEN** the price question is explained with a live model that returns a valid answer
- **THEN** the store received as many symbol searches as one anchoring of that question sends

#### Scenario: A verifier failure other than unavailable or budget propagates without writing

- **GIVEN** a live model whose output cites `E1`, and whose `verify` call fails with an error that is
  neither `LlmUnavailable` nor `BudgetExhausted`
- **WHEN** the price question is explained
- **THEN** explain fails with that same error
- **AND** the claim write received 0 calls

#### Scenario: An unknown answer has no confidence

- **WHEN** a question without an anchor is explained, and a question is explained with an output
  whose every citation is `broken`
- **THEN** each answer is `UNKNOWN` and has no `confidence` property

### Requirement: Answer with typed statements

For an accepted output with statements, explain SHALL type each statement from the spans its
evidence ids name (the typing rule of `claims-and-typing`), then verify the citations:

- the syntactic check of `evidence-verification` SHALL run once over the distinct cited evidence ids,
  in evidence-id order, each as a citation of its span's path, first and last line, its text as
  excerpt and how the sanitisation cut it, with its last line before the cut; at the commit the pack was read at (never the project's
  indexed commit at the time of the check) and from the root the pack was read from. Spans of the pack
  that no statement cites SHALL NOT be checked nor read for it;
- the output policy of `evidence-verification` SHALL then drop the `broken` citations and the
  statements left with none, and retype the rest. A `broken` citation SHALL NOT appear in the answer,
  in its evidence ids, nor in any stored evidence row; it only leaves its `evidence_broken` event
  (requirement "Explain events and logging");
- the semantic check of `evidence-verification` SHALL then run over every remaining (statement,
  citation) pair, in statement order then citation order, each as the statement's text and its
  citation's path, first and last line, sanitised text as excerpt and truncation mark when the span
  was cut, with the model and the verification cache explain was given;
- the entailment policy of `evidence-verification` SHALL then give each remaining statement its type
  and its verification. Every pair the semantic check left `cited` with a reason leaves its
  `entailment_unverified` event (requirement "Explain events and logging").

Explain SHALL take, besides the store, the source reader, the model, the workspace root and the
clock, a verification cache, which it SHALL only pass to the semantic check.

Explain SHALL store one claim per remaining statement with its remaining evidence, and answer with:

- `kind: 'answered'`, `persisted: true`, the model's `answer`, as `events` the sanitisation events
  followed by the `evidence_broken` events and then the `entailment_unverified` events (empty when
  nothing was flagged, cut, broken or left unverified), the prior claims, and `statements`, the
  remaining statements in the model's order, each with its `text`, its `type` (`FACT` or `INFERENCE`,
  by the entailment policy), its `status` (`current`, or `stale` when the claims were written stale,
  below), its `verification` (`entailed` when every remaining citation of it is `entailed`, `cited`
  otherwise) and `evidenceIds`, the ids of its evidence rows in the order the model cited the
  remaining spans;
- `evidence`, one entry per remaining citation, in statement order then citation order, each with the
  id of its stored evidence row, its file id, file path, first and last line and excerpt;
- `usage`, `{ verification: { calls, cacheHits, inputTokens, outputTokens, costUsd } }`, the usage of
  the semantic check of this answer, which counts no token of the `answer` call;
- `confidence`, the confidence (`confidence-score`) of all the remaining statements together, each
  with its remaining citations, every citation with its span's file id, first and last line, file
  kind and origin and the verdict of its (statement, citation) pair, and the contradiction flag
  `false`: no component produces contrary evidence yet (DIS-71).

The confidence SHALL NOT depend on a statement's status: a `stale` statement counts with its citations and verdicts like a `current` one.

All spans here are the sanitised spans (requirement "Untrusted content sanitization"): a cut span
ends at its kept last line.

Each claim SHALL be stored with: the project id; as subject, the symbol name of the span of the
statement's **first** remaining evidence id in the order the model gave them, or that span's file path when it
has no symbol; as predicate the exported constant `CLAIM_PREDICATE_EXPLAINS` (`explains`); as object
the statement text; layer `L2`; type `INFERENCE`, whatever the statement's type; status `current`;
as `confidence` the confidence of that statement alone, computed as for the answer; and a provenance with the model name the `answer` call reported, the prompt hash, as
input spans every sanitised span of the pack (file id, first and last line), the clock's instant in
ISO 8601 with time zone, and the statement's type (by the entailment policy) as statement type. A
statement typed `FACT` is therefore stored as an `L2` `INFERENCE` claim whose provenance keeps `FACT`,
and is answered as `FACT`.

Each remaining cited span SHALL give one evidence row of that claim, with the span's file id, first and last
line, as verification the verdict of its (statement, citation) pair (`entailed` or `cited`) and, as
excerpt, the sanitised span's text: redacted, cut when it was over the limit, without the truncation
mark and without neutralisation.

Explain SHALL give the store the commit the pack was read at. When the project was re-indexed at
another commit while the answer was being produced, the store writes the claims `stale`
(`graph-store`, "Claim write"); the answer then shows each statement with `status: 'stale'`,
`warning: 'stale-evidence'`, its computed `verification` and, as for a prior claim, never as `FACT` (a
`FACT` statement is shown as `INFERENCE`), while its provenance keeps the statement type.

#### Scenario: An answer with evidence is typed, stored and returned

- **GIVEN** acme-shop indexed in the database, its history rebuilt, and a live model whose output has
  one statement citing only the `anchor` span of `app/Services/PriceCalculator.php` (lines 16–44, which
  holds `PriceCalculator::compute`) and one citing a `heuristic` span, and that answers
  `{"entails":true}` to every verification
- **WHEN** `¿Cómo se calcula el precio final de un pedido?` is explained
- **THEN** the model was called once with the purpose `answer` and then twice with the purpose
  `verify`, and the answer is `answered` with `persisted: true`, the first statement `FACT` and the
  second `INFERENCE`, both `current` and with verification `entailed`, and its events are empty
- **AND** every evidence id of the statements names a stored evidence row with verification
  `entailed` whose excerpt equals the cited span's text

#### Scenario: A fact is stored as an inferred claim that keeps its type

- **WHEN** the answer of the previous scenario is stored
- **THEN** both claims have layer `L2`, type `INFERENCE`, status `current`, predicate `explains` and
  the statement text as object, and their provenances hold the statement types `FACT` and
  `INFERENCE`, the model name, the prompt hash, every span of the pack as input spans and the clock's
  instant
- **AND** each stored claim's `confidence` is not `NULL`: it is the confidence of its own statement
  with its citation `entailed`, strictly between 0 and 1, and the first claim's (an `anchor` span) is
  higher than the second's (a `heuristic` span)
- **AND** the answer still shows the first statement as `FACT`, and its `confidence` is the confidence
  of both statements together

#### Scenario: The evidence of a stored answer lists every citation in order

- **WHEN** a question is explained with a live model whose output has two statements, the first
  citing `E1` and `E2`, the second citing `E1`, and the claims are stored
- **THEN** the answer's evidence holds three entries, for the spans of `E1`, `E2` and `E1` in that
  order, each with a distinct stored evidence id
- **AND** the statements' evidence ids are the first two ids and the third id

#### Scenario: An answer written after a re-index is stored stale

- **GIVEN** acme-shop loaded in the in-memory store, and a live model during whose `answer` call the
  project is re-indexed at another commit, and that answers `{"entails":true}` to every verification
- **WHEN** the price question is explained with an output whose first statement cites only the
  anchor span of the calculator and whose second cites a `heuristic` span
- **THEN** the answer is `answered` with `persisted: true`, and both statements have
  `status: 'stale'`, `warning: 'stale-evidence'` and verification `entailed`, the first shown as
  `INFERENCE`, and its events hold no `evidence_broken` event
- **AND** both stored claims are `stale`, with statement types `FACT` and `INFERENCE`, and each with
  the confidence of its own statement, as if it were `current`
- **AND** the verification read was made at the pack's commit, not at the commit of the re-index

#### Scenario: Cited spans are verified in one read at the pack's commit

- **GIVEN** a pack whose `E1` is an `anchor` span of one file, whose `E2` is a `heuristic` span of
  another file and whose `E3` is a span of a third file that no statement cites, and a live model
  whose output has S1 citing `E1` and S2 citing `E1` then `E2`, and that answers `{"entails":true}` to
  every verification
- **WHEN** a question is explained and the claims are stored
- **THEN** S1 is `FACT` and S2 `INFERENCE`, both with verification `entailed`, and the three stored
  evidence rows have verification `entailed` and the cited spans' text as excerpt
- **AND** after the model call the source reader received exactly one batched read, at the pack's
  root and commit, naming the file of `E1` then the file of `E2`, each once, and not the file of `E3`

#### Scenario: A broken citation is neither stored nor shown

- **GIVEN** a pack whose `E1` is an `anchor` span and whose `E3` is a `heuristic` span, the file of
  `E3` changed between the pack's read and the verification read, and a live model whose output has
  S1 citing `E1`, S2 citing `E1` then `E3`, and S3 citing `E3`, and that answers `{"entails":true}` to
  every verification
- **WHEN** a question is explained and the claims are stored
- **THEN** the answer is `answered` with `persisted: true` and two statements, S1 and S2, each citing
  one evidence row, the one of `E1`; S2 is typed `FACT`; no statement holds the text of S3
- **AND** the answer's evidence holds two entries, both for the span of `E1`, and no entry for the
  span of `E3`
- **AND** two claims were stored, with statement types `FACT` and `FACT`, and no evidence row of the
  call cites the lines of `E3`
- **AND** the model received exactly two `verify` requests, for (S1, `E1`) and (S2, `E1`), and none
  naming the span of `E3`
- **AND** the answer's events end with exactly one `evidence_broken` event, for `E3`

#### Scenario: The subject of a claim is the symbol of its first cited span

- **GIVEN** a pack whose span `E1` is the symbol `PriceCalculator::compute` and whose span `E2` is the
  whole file `docs/pricing.md`
- **WHEN** a statement citing `E1` then `E2`, and a statement citing `E2` then `E1`, are stored
- **THEN** the first claim's subject is `PriceCalculator::compute` and the second's is
  `docs/pricing.md`

#### Scenario: Citations that support their statement are entailed and facts

- **GIVEN** acme-shop loaded, a pack whose `E1` is the `anchor` span of
  `app/Services/PriceCalculator.php` and whose `E2` is a `heuristic` span of another file (found at run
  time, as in the other scenarios of this requirement), a live model whose output has S1
  citing `E1` and S2 citing `E1` then `E2`, whose `answer` call reports 1 000 input and 200 output
  tokens, and that answers `{"entails":true}` to every verification reporting 100 input and 5 output
  tokens, and an empty verification cache
- **WHEN** a question is explained and the claims are stored, and then again with the claim write
  failing with `ClaimWriteFailed` and another empty cache
- **THEN** the model received one `answer` request and then three `verify` requests, for (S1, `E1`),
  (S2, `E1`) and (S2, `E2`) in that order, each time
- **AND** S1 is `FACT` and S2 `INFERENCE`, both with verification `entailed`; in both runs the claim
  items the store received hold three evidence rows with verification `entailed`
- **AND** both answers' `usage` is `{ verification: { calls: 3, cacheHits: 0, inputTokens: 300,
  outputTokens: 15, costUsd: 0 } }`, with nothing of the `answer` call's tokens

#### Scenario: A valid but irrelevant citation is cited and never a fact

- **GIVEN** the pack and the output of the previous scenario
- **WHEN** a question is explained with a verifier that answers `{"entails":false}` to (S1, `E1`) and
  to (S2, `E2`), and `{"entails":true}` to (S2, `E1`)
- **THEN** the answer is `answered` with both statements: S1 `INFERENCE` with verification `cited`,
  and S2 `INFERENCE` with verification `cited`
- **AND** the stored evidence row of S1 has verification `cited`, and those of S2 have `entailed` then
  `cited`; the answer's events are empty
- **AND** the two stored claims' provenances hold the statement types `INFERENCE` and `INFERENCE`, and
  when the same question is explained again, the prior claim of S1 is shown `INFERENCE`

#### Scenario: A cached pair is not verified again by a second answer

- **GIVEN** the scenario "Citations that support their statement are entailed and facts" explained
  once with a verification cache
- **WHEN** the same question is explained again over the same code with the same cache, and then with
  the same cache over the file of `E2` with one line inside `E2`'s range changed at the pack's commit
- **THEN** the second answer made one `answer` request and no `verify` request, has the same types and
  verifications, and its `usage` is `{ verification: { calls: 0, cacheHits: 3, inputTokens: 0,
  outputTokens: 0, costUsd: 0 } }`
- **AND** the third answer made exactly one `verify` request, for (S2, `E2`), and counts 2 cache hits

#### Scenario: An invalid verifier output degrades its pair to cited

- **GIVEN** a pack whose `E1` is an `anchor` span, and a live model whose output has S1 citing `E1`
- **WHEN** a question is explained with a verifier that answers `yes`, and again with the same cache
- **THEN** each answer is `answered` and stored, S1 is `INFERENCE` with verification `cited` and its
  evidence row `cited`, the events end with
  `{ type: 'entailment_unverified', statementIndex: 0, evidenceId: 'E1', path, startLine, endLine,
  reason: 'invalid-output' }` with the span's path and lines, and `usage.verification.calls` is 1
- **AND** the second answer made one `verify` request again

#### Scenario: An unavailable verifier degrades every uncached pair and the answer is stored

- **GIVEN** the pack and the output of "Citations that support their statement are entailed and
  facts"
- **WHEN** a question is explained with a model whose first `verify` call fails with `LlmUnavailable`,
  and then with the model wrapped by a daily budget whose ceiling is reached after the `answer` call
- **THEN** each answer is `answered` and stored, both statements are `INFERENCE` with verification
  `cited`, every stored evidence row of the call is `cited`, and `usage.verification.calls` is 0
- **AND** the events end with one `entailment_unverified` event per pair, for (S1, `E1`), (S2, `E1`)
  and (S2, `E2`) in that order, with reason `llm-unavailable` the first time and `budget-exhausted` the
  second
- **AND** the scripted model received exactly one `verify` request the first time; the second time the
  wrapped model was asked once with the purpose `verify` and failed it with `BudgetExhausted`, and the
  scripted model received no `verify` request

#### Scenario: An answer carries the confidence of its statements

- **GIVEN** the pack and the output of "Citations that support their statement are entailed and
  facts", and a verifier that answers `{"entails":true}` to every verification
- **WHEN** a question is explained and the claims are stored, then again with another empty cache,
  and then with the claim write failing with `ClaimWriteFailed` and a third empty cache
- **THEN** the first answer's `confidence` is the confidence of S1 and S2 together, each citation with
  its span's file id, lines, file kind and origin and verdict `entailed`, without contradiction
- **AND** the claim items the store received hold, for S1 and for S2, the confidence of that statement
  alone, computed the same way
- **AND** the second answer's `confidence` is the same number as the first's (`Object.is`), and the
  unsaved third answer carries that same `confidence`

#### Scenario: The confidence follows the verifier's verdicts

- **GIVEN** the pack and the output of the previous scenario
- **WHEN** a question is explained with a verifier that answers `{"entails":false}` to (S2, `E2`) and
  `{"entails":true}` to the other pairs
- **THEN** the answer's `confidence` is the confidence of S1 and S2 with (S2, `E2`) `cited` and the other
  citations `entailed`, lower than the `confidence` of the previous scenario's first answer
- **AND** the stored claim of S2 has the confidence of S2 with those verdicts, and that of S1 the same
  confidence as in the previous scenario

### Requirement: Persistence failure

When, and only when, the store rejects the write of the claims with `ClaimWriteFailed`, explain SHALL
still answer, with the same shape as a stored answer: `kind: 'answered'`, `persisted: false`, the
model's `answer`, the verified statements (each with the type and the verification of the entailment
policy), the prior claims, `evidence`, `usage`, `confidence` (computed as for a stored answer) and
`events`. Every evidence id of a statement, and
every evidence entry id, SHALL be the prompt's id (`E1`…) of a remaining citation; `evidence` SHALL
hold one entry per distinct remaining cited prompt id, in first-citation order, and no entry for a
`broken` one. Its events SHALL be the sanitisation events, then the `evidence_broken` events, then the
`entailment_unverified` events, then one event `{ type: 'claims_not_persisted', code }`, whose `code`
comes from the closed set `store-write-failed`, declared once. The event SHALL carry no message, no
detail, no cause, no part of the question and no part of the model's output. Any other rejection of
the write (`InvalidStoreQuery`, `ProjectNotFound`, anything else) SHALL propagate as an error.

#### Scenario: A failed write still answers, unsaved and without leaking

- **GIVEN** the in-memory store with a write failure injected at the evidence of the second claim,
  raised as a `ClaimWriteFailed` while that evidence's excerpt holds a sentinel text
- **WHEN** a question is explained with a live model whose output has two statements, the first
  citing `E1` and `E2`, the second citing `E1`, and that answers `{"entails":true}` to every
  verification
- **THEN** the answer is `answered` with `persisted: false`, the model's `answer` and the prior
  claims; its statements cite `E1`, `E2` and `E1`; its evidence holds exactly one entry `E1` and one
  `E2`, in that order; and its events are exactly
  `[{ type: 'claims_not_persisted', code: 'store-write-failed' }]`
- **AND** the serialised events hold neither the sentinel nor the question, and no claim was stored

#### Scenario: A failed write over the database still answers without leaking

- **GIVEN** acme-shop indexed in the database, and the database rejecting the write of an evidence
  with an error whose `detail` quotes a sentinel text
- **WHEN** the price question is explained with a live model whose output cites that evidence, and
  that answers `{"entails":true}` to every verification
- **THEN** the answer is `answered` with `persisted: false` and its events are exactly
  `[{ type: 'claims_not_persisted', code: 'store-write-failed' }]`
- **AND** the serialised events hold neither the sentinel nor the question, and no claim of the call
  exists

#### Scenario: An unsaved answer keeps only its verified citations

- **GIVEN** the in-memory store with a claim write failing with `ClaimWriteFailed`, and the file of
  `E3` changed between the pack's read and the verification read, and a live model that answers
  `{"entails":true}` to every verification
- **WHEN** a question is explained with a live model whose output has S1 citing `E1` and S2 citing
  `E3` then `E1`
- **THEN** the answer is `answered` with `persisted: false`; its statements are S1 and S2, both with
  verification `entailed`, each citing exactly `E1`; its evidence holds exactly one entry, `E1`
- **AND** its events are exactly the `evidence_broken` event of `E3` followed by
  `{ type: 'claims_not_persisted', code: 'store-write-failed' }`

#### Scenario: Other write errors propagate

- **WHEN** the write of the claims rejects with `InvalidStoreQuery`, and then with `ProjectNotFound`
- **THEN** explain fails with that same error each time
- **AND** no claim was written

#### Scenario: An unsaved answer carries its verification, usage and unverified events

- **GIVEN** the in-memory store with a claim write failing with `ClaimWriteFailed`, and a live model
  whose output has S1 citing `E1` then `E2`, and that answers `{"entails":true}` to (S1, `E1`) and an
  invalid output to (S1, `E2`), reporting 100 input and 5 output tokens per verification
- **WHEN** a question is explained
- **THEN** S1 has verification `cited`; `usage` is `{ verification: { calls: 2, cacheHits: 0,
  inputTokens: 200, outputTokens: 10, costUsd: 0 } }`
- **AND** its events are exactly the `entailment_unverified` event of (0, `E2`) with reason
  `invalid-output`, followed by `{ type: 'claims_not_persisted', code: 'store-write-failed' }`
- **AND** its `confidence` is the confidence of S1 with (S1, `E1`) `entailed` and (S1, `E2`) `cited`,
  without contradiction

