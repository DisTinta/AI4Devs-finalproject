## MODIFIED Requirements

### Requirement: Model output quarantine

The output of the model SHALL be accepted only when all of these hold, checked in this order, and
otherwise SHALL be discarded **whole** (no statement of it survives) with an audit event:

1. Its size is at most 65 536 bytes in UTF-8; a larger output SHALL be rejected without being parsed
   (subcode `output_too_large`).
2. It is valid JSON (subcode `invalid_json`), either as the whole output or as the content of exactly
   one Markdown code fence that encloses the whole output: an opening line of three backticks,
   optionally followed by the info string `json` in any letter case; then the JSON; then a closing
   line of three backticks. Only whitespace MAY appear before the opening line and after the closing
   one. Any other text outside the fence, a second fence, a fence that is not closed or another info
   string SHALL be discarded with subcode `invalid_json`.
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

Check 1 and the audit event SHALL use the output exactly as received, fence included: the fence is
removed only to parse the JSON of check 2.

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

#### Scenario: A conforming output inside a json fence is accepted

- **GIVEN** the known evidence id `E1`
- **WHEN** the conforming output of "A conforming output is accepted" is checked wrapped as
  `` ```json `` + line break + output + line break + `` ``` ``, then wrapped the same way with the info
  string `JSON`, then with no info string, then with a line break before the opening line and spaces
  after the closing one
- **THEN** each is accepted with the same answer and statements as the unwrapped output

#### Scenario: Text outside a fence discards the output

- **GIVEN** the known evidence id `E1`
- **WHEN** the fenced conforming output is checked preceded by `Aquí está la respuesta:`, then
  followed by `Espero que ayude.`, then followed by a second fenced copy of itself
- **THEN** each is discarded with subcode `invalid_json`

#### Scenario: An unclosed fence or another info string discards the output

- **GIVEN** the known evidence id `E1`
- **WHEN** the conforming output is checked after an opening `` ```json `` line with no closing line,
  and wrapped in a fence whose info string is `js`
- **THEN** each is discarded with subcode `invalid_json`

#### Scenario: The event of a fenced output identifies the raw output

- **GIVEN** the known evidence id `E1`
- **WHEN** an output whose statement carries `"note":"x"` is checked wrapped in a `` ```json `` fence
- **THEN** it is discarded with subcode `invalid_shape`, and the event's byte size and SHA-256 are
  those of the wrapped output as received, fence included
