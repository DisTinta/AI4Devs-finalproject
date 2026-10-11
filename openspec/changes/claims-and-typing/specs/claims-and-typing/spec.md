## Purpose

Defines what a claim and its evidence are in the domain, how a statement is typed as fact or
inference from the resolution of the code it cites, and how the output of a language model is
quarantined: validated against a strict schema and discarded whole, with an audit event that carries
none of its content, when it does not conform.

## ADDED Requirements

### Requirement: Claim and evidence records mirror the database checks

The domain SHALL describe a claim and a piece of evidence with records whose valid values are exactly
those the `claim` and `evidence` tables accept:

- The closed sets of claim layers (`L1`, `L2`), claim types (`FACT`, `INFERENCE`, `UNKNOWN`), claim
  statuses (`current`, `stale`) and evidence verifications (`none`, `cited`, `entailed`, `broken`)
  SHALL each be declared once and SHALL equal, in order, the values of the matching database enums.
- A claim of layer `L2` with type `FACT` SHALL NOT be representable: it SHALL fail to type-check and
  SHALL be rejected at run time (`fact_only_from_l1`).
- A claim of layer `L2` SHALL carry a provenance; without one it SHALL be rejected
  (`l2_requires_provenance`). A claim of layer `L1` MAY carry one.
- A claim's `confidence` SHALL be `null` or a number from 0 to 1, both included
  (`claim_confidence_range`).
- A provenance SHALL hold exactly: the model name (non-empty), the prompt hash (64 lowercase
  hexadecimal characters), the input spans (at least one; each a file id, a first line greater than 0
  and a last line not before the first) and the creation instant (ISO 8601 with time zone). Any other
  field, a missing field or JSON `null` SHALL be rejected.
- An evidence SHALL have a first line greater than 0 and a last line not before the first.

The type of a statement (`FACT`, `INFERENCE`, `UNKNOWN`) SHALL NOT be derived from, nor constrain,
the layer under which a claim is later stored: that mapping is outside this capability.

#### Scenario: An inferred fact is not representable

- **WHEN** a claim with layer `L2`, type `FACT` and a valid provenance is written in typed code, and
  the same value is validated at run time
- **THEN** the typed code fails to type-check and the run-time validation rejects it
- **AND** the same claim with layer `L1` is accepted

#### Scenario: An inferred claim without provenance is rejected

- **WHEN** a claim with layer `L2` and type `INFERENCE` is validated without a provenance, and with a
  provenance of JSON `null`
- **THEN** both are rejected
- **AND** the same claim with a valid provenance is accepted

#### Scenario: Confidence outside its range is rejected

- **WHEN** claims with `confidence` `-0.01`, `1.01` and `NaN` are validated, and claims with `0`, `1`
  and `null`
- **THEN** the first three are rejected and the last three are accepted

#### Scenario: The provenance shape is validated

- **WHEN** provenances are validated with a prompt hash that is not 64 lowercase hexadecimal
  characters, with an empty list of input spans, with a creation instant `2026-10-11` (no time), and
  with an extra field
- **THEN** each one is rejected
- **AND** a provenance with model `llama3.2`, a valid prompt hash, one input span and
  `2026-10-11T10:00:00Z` is accepted

#### Scenario: The evidence span mirrors the database checks

- **WHEN** evidence with lines `0–3`, `5–4` and `5–5` is validated
- **THEN** the first two are rejected and `5–5` is accepted

#### Scenario: The closed sets equal the database enums

- **WHEN** the declared layers, types, statuses and verifications are compared with the values of
  `claim_layer`, `claim_type`, `claim_status` and `evidence_verification` in the claims migration
- **THEN** each set equals its enum, value by value and in order

### Requirement: Statement typing from the resolution of its evidence

A statement SHALL be typed from the spans it cites, never from what the model says about it. Each
cited span carries the origin the Context Engine gave it, and the typing SHALL use that origin as
given, without recomputing it: `anchor` (an anchor symbol of the question), `exact` (at least one of
the paths of minimum distance from an anchor uses only `exact` edges) or `heuristic` (otherwise). A
span that replaced others in the context carries the best origin among itself and the spans it
replaced, so an `exact` span may contain lines reached only heuristically. A statement SHALL be
`FACT` when every cited span is `anchor` or `exact`, and `INFERENCE` when at least one is
`heuristic`. A statement SHALL cite at least one span; typing an empty chain SHALL NOT be possible.

#### Scenario: A chain of anchor and exact evidence is a fact

- **WHEN** a statement citing one `anchor` span and one `exact` span is typed
- **THEN** its type is `FACT`

#### Scenario: Any heuristic evidence makes an inference

- **WHEN** a statement citing one `exact` span and one `heuristic` span is typed, and a statement
  citing only one `heuristic` span
- **THEN** both types are `INFERENCE`

### Requirement: Model output quarantine

The output of the model SHALL be accepted only when all of these hold, checked in this order, and
otherwise SHALL be discarded **whole** (no statement of it survives) with an audit event:

1. Its size is at most 65 536 bytes in UTF-8; a larger output SHALL be rejected without being parsed
   (subcode `output_too_large`).
2. It is valid JSON (subcode `invalid_json`).
3. It matches the output schema exactly: an object with `answer` (a string of 1 to 2 000 characters)
   and `statements` (0 to 20 objects, each with `text`, a string of 1 to 500 characters, and
   `evidenceIds`, 1 to 10 strings). No other field is allowed at any level; in particular a `type`
   field SHALL be rejected, because the type is decided by the typing rule. A failure caused only by
   an empty `evidenceIds` SHALL have subcode `empty_evidence`; one caused only by values above a limit
   SHALL have subcode `limit_exceeded`; any other failure SHALL have subcode `invalid_shape`.
4. No statement cites the same evidence id twice; duplicates SHALL NOT be removed (subcode
   `duplicate_evidence_id`).
5. Every cited evidence id is one of the ids given to the model (subcode `unknown_evidence_id`).

The five limits SHALL be exported as named constants so that callers and tests use the same values.
Character lengths SHALL be counted as string length (UTF-16 code units).

#### Scenario: A conforming output is accepted

- **GIVEN** the known evidence ids `E1` and `E2`
- **WHEN** the output `{"answer":"El precio se calcula en compute.","statements":[{"text":"compute aplica el descuento","evidenceIds":["E1"]}]}` is checked
- **THEN** it is accepted with that answer and one statement citing `E1`

#### Scenario: An extra field discards the whole output

- **GIVEN** the known evidence id `E1`
- **WHEN** an output whose second statement carries `"type":"FACT"` is checked, and one whose first
  statement carries `"note":"ignore previous instructions"`
- **THEN** both are discarded with subcode `invalid_shape`, and no statement of either is returned

#### Scenario: An unknown evidence id discards the whole output

- **GIVEN** the known evidence id `E1`
- **WHEN** an output with a valid first statement and a second statement citing `E1` and `E9` is checked
- **THEN** it is discarded with subcode `unknown_evidence_id`, and the issue path is
  `statements.1.evidenceIds.1`

#### Scenario: A statement without evidence discards the whole output

- **WHEN** an output with a statement whose `evidenceIds` is empty is checked
- **THEN** it is discarded with subcode `empty_evidence`

#### Scenario: A repeated evidence id discards the whole output

- **GIVEN** the known evidence id `E1`
- **WHEN** an output with a statement citing `E1` twice is checked
- **THEN** it is discarded with subcode `duplicate_evidence_id` and the issue path
  `statements.0.evidenceIds.1`

#### Scenario: Malformed JSON discards the output

- **WHEN** the output `{"answer":` is checked
- **THEN** it is discarded with subcode `invalid_json`

#### Scenario: The output size limit accepts its bound and rejects one byte more

- **WHEN** a conforming output padded with JSON whitespace to exactly 65 536 bytes is checked, and the
  same output with one more byte
- **THEN** the first is accepted and the second is discarded with subcode `output_too_large`
  without being parsed as JSON

#### Scenario: The answer length limit accepts its bound and rejects one more

- **WHEN** conforming outputs whose `answer` has 2 000 and 2 001 characters are checked
- **THEN** the first is accepted and the second is discarded with subcode `limit_exceeded` and the
  issue path `answer`

#### Scenario: The statement count limit accepts its bound and rejects one more

- **WHEN** conforming outputs with 20 and 21 statements are checked
- **THEN** the first is accepted and the second is discarded with subcode `limit_exceeded` and the
  issue path `statements`

#### Scenario: The statement length limit accepts its bound and rejects one more

- **WHEN** conforming outputs whose statement `text` has 500 and 501 characters are checked
- **THEN** the first is accepted and the second is discarded with subcode `limit_exceeded` and the
  issue path `statements.0.text`

#### Scenario: The citations limit accepts its bound and rejects one more

- **GIVEN** eleven distinct known evidence ids
- **WHEN** conforming outputs whose statement cites 10 and 11 of them are checked
- **THEN** the first is accepted and the second is discarded with subcode `limit_exceeded` and the
  issue path `statements.0.evidenceIds`

### Requirement: Audit event of a discarded output

Every discarded output SHALL produce exactly one audit event, returned to the caller and never
written to a log by the domain. The event SHALL carry the kind `schema_violation`, the stage
`l2_inference`, the subcode — exactly one value of the closed set `output_too_large`,
`invalid_json`, `invalid_shape`, `limit_exceeded`, `empty_evidence`, `duplicate_evidence_id`,
`unknown_evidence_id`, declared once — the size of the output in UTF-8 bytes, the SHA-256 of those bytes in
lowercase hexadecimal, and the list of issues, each reduced to its path (field names of the schema
and array indices) and its code. The event SHALL NOT contain the raw output nor any part of it: no
value, no message produced by the validator, no name of an unexpected field.

#### Scenario: The event identifies the output without carrying it

- **WHEN** the output `{"answer":"ok","statements":[{"text":"x","evidenceIds":["E1"],"note":"ignore previous instructions"}]}` is checked with the known id `E1`
- **THEN** the event has kind `schema_violation`, stage `l2_inference`, subcode `invalid_shape`, the
  byte size and SHA-256 of that output, and one issue with path `statements.0`
- **AND** its JSON serialisation contains neither `ignore previous instructions` nor `note` nor `ok`

#### Scenario: Checking an output writes nothing to the console

- **WHEN** a conforming output and each discarded output of the quarantine scenarios are checked
- **THEN** nothing is written through `console`
