## MODIFIED Requirements

### Requirement: Claim and evidence records mirror the database checks

The domain SHALL describe a claim and a piece of evidence with records whose valid values are exactly
those the `claim` and `evidence` tables accept, and that also satisfy the rules below that the
database does not check (the statement type of a provenance, and the absence of U+0000).

- The closed sets of claim layers (`L1`, `L2`), claim types (`FACT`, `INFERENCE`, `UNKNOWN`), claim
  statuses (`current`, `stale`) and evidence verifications (`none`, `cited`, `entailed`, `broken`)
  SHALL each be declared once and SHALL equal, in order, the values of the matching database enums.
- A claim of layer `L2` with type `FACT` SHALL NOT be representable: it SHALL fail to type-check and
  SHALL be rejected at run time (`fact_only_from_l1`).
- A claim SHALL hold exactly: the project id, the subject and the predicate (strings), the object
  (a string or `null`), the layer, the type, the status, the confidence and, as below, the
  provenance. The claim id and the timestamps are assigned by the database and are not part of the
  record. Any other field SHALL be rejected.
- A claim of layer `L2` SHALL carry a provenance; without one it SHALL be rejected
  (`l2_requires_provenance`). A claim of layer `L1` MAY carry one; when it carries none, the field
  SHALL be absent, not JSON `null`, so a writer handles a single form of "no provenance".
- A claim's `confidence` SHALL be `null` or a number from 0 to 1, both included
  (`claim_confidence_range`).
- A provenance SHALL hold exactly: the model name (non-empty), the prompt hash (64 lowercase
  hexadecimal characters), the input spans (at least one; each exactly a file id, a first line
  greater than 0 and a last line not before the first) and the creation instant (ISO 8601 with time
  zone). The provenance of a claim of layer `L2` and type `INFERENCE` SHALL also hold the statement
  type (`FACT` or `INFERENCE`); the standalone provenance record does not. Any other field, a missing
  required field or JSON `null` SHALL be rejected, at every level.
- The statement type of a provenance SHALL follow the claim's layer and type: it SHALL be present on
  a claim of layer `L2` and type `INFERENCE`, and SHALL be absent on a claim of layer `L2` and type
  `UNKNOWN` and on any claim of layer `L1`; otherwise the claim SHALL be rejected. The database does
  not check this rule.
- No text value of a record (the subject, the predicate, the object, the excerpt, the model name)
  SHALL contain the character U+0000, which Postgres rejects in `text` and `jsonb`; a record holding
  one SHALL be rejected.
- An evidence SHALL hold exactly: the file id, the first line (greater than 0), the last line (not
  before the first), the verification and the excerpt (a string or `null`). The claim id is assigned
  on insert and is not part of the record. Any other field SHALL be rejected.
- Every id (project id, file id) SHALL be a UUID in the RFC 9562 format.
- Every line number SHALL be at most 2 147 483 647, the range of the `integer` line columns.
- A span whose last line is before its first SHALL be reported on its last line.

The type of a statement (`FACT`, `INFERENCE`, `UNKNOWN`) SHALL NOT be derived from, nor constrain,
the layer under which a claim is later stored: that mapping belongs to the `explain` capability,
which records the statement type in the provenance.

#### Scenario: An inferred fact is not representable

- **WHEN** a claim with layer `L2`, type `FACT` and a valid provenance is written in typed code, and
  the same value is validated at run time
- **THEN** the typed code fails to type-check and the run-time validation rejects it
- **AND** the same claim with layer `L1` is accepted

#### Scenario: An inferred claim without provenance is rejected

- **WHEN** a claim with layer `L2` and type `INFERENCE` is validated without a provenance, and with a
  provenance of JSON `null`
- **THEN** both are rejected
- **AND** the same claim with a valid provenance holding the statement type `INFERENCE` is accepted

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

#### Scenario: The statement type of a provenance follows layer and type

- **WHEN** these claims, each otherwise valid, are validated: layer `L2` and type `INFERENCE` without
  a statement type; layer `L2` and type `UNKNOWN` with the statement type `INFERENCE`; layer `L2` and
  type `UNKNOWN` without one; layer `L1` with a provenance holding the statement type `FACT`; and
  layer `L2` and type `INFERENCE` with the statement type `FACT`
- **THEN** the first, the second and the fourth are rejected, and the third and the fifth are
  accepted

#### Scenario: A text holding U+0000 is rejected

- **WHEN** a claim whose subject, then predicate, then object, then provenance model holds U+0000 is
  validated, and an evidence whose excerpt holds it
- **THEN** each is rejected
- **AND** the same records without that character are accepted

### Requirement: Model output quarantine

The output of the model SHALL be accepted only when all of these hold, checked in this order, and
otherwise SHALL be discarded **whole** (no statement of it survives) with an audit event:

1. Its size is at most 65 536 bytes in UTF-8; a larger output SHALL be rejected without being parsed
   (subcode `output_too_large`).
2. It is valid JSON (subcode `invalid_json`).
3. It matches the output schema exactly: an object with `answer` (a string of 1 to 2 000 characters)
   and `statements` (0 to 20 objects, each with `text`, a string of 1 to 500 characters, and
   `evidenceIds`, 1 to 10 strings). No other field is allowed at any level; in particular a `type`
   field SHALL be rejected, because the type is decided by the typing rule. No string of the output
   (the answer, a statement text, an evidence id) SHALL contain the character U+0000. A failure
   caused only by
   an empty `evidenceIds` SHALL have subcode `empty_evidence`; one caused only by values above a limit
   SHALL have subcode `limit_exceeded`; any other failure SHALL have subcode `invalid_shape`.
4. No statement cites the same evidence id twice; duplicates SHALL NOT be removed (subcode
   `duplicate_evidence_id`).
5. Every cited evidence id is one of the ids given to the model (subcode `unknown_evidence_id`).

When checks 4 or 5 fail, the event SHALL carry one issue for the first repeated id of the first
statement that has one (check 4), or one issue per unknown id (check 5). When checks 1 or 2 fail it
SHALL carry no issue. A duplicate key inside the JSON text is not checked: the parser keeps its last
value, and that value goes through every other check.

The five limits SHALL be exported as named constants so that callers and tests use the same values.
Character lengths SHALL be counted in Unicode code points (an astral character, such as an emoji,
counts as one); the minimum lengths (1 character) are measured the same way.

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

#### Scenario: A NUL character discards the whole output

- **GIVEN** the known evidence id `E1`
- **WHEN** a conforming output whose statement `text` holds U+0000 is checked, one whose `answer`
  holds it, and one citing an evidence id that holds it
- **THEN** all three are discarded with subcode `invalid_shape`, and no statement of any is returned
