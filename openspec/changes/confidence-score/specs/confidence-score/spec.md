## Purpose

Computes the confidence of a set of statements from observable signals of their citations (the
evidence behind them, its diversity, cross-confirmation, edge resolution, the verifier's verdicts and
any contradiction) with a fixed formula and published weights, never from the model's own opinion, so
that two answers of the system can be ordered reproducibly. The value is ordinal and not calibrated.

## ADDED Requirements

### Requirement: Confidence signals

The confidence computation SHALL take a set of statements and a contradiction flag (`true` or
`false`). Each statement SHALL carry its citations; each citation SHALL carry a file id, a first and a
last line, the file kind of the cited file (`source`, `test`, `doc` or `config`), the origin of the
cited span (a string; `anchor`, `exact` and `heuristic` are the ones the context engine gives) and the
verdict of its (statement, citation) pair, `entailed` or `cited`. A **span** is the triple (file id,
first line, last line); two citations name the same span when the three are equal. A citation's
**category** is `code` for the file kinds `source` and `config`, `test` for `test` and `doc` for
`doc`; `history` is a fourth category that no citation can have yet.

It SHALL compute six signals, each a number in [0, 1], and return them as `evidence`, `diversity`,
`crossConfirmation`, `resolution`, `entailment` and `contradiction`:

1. `evidence` = min(E, `EVIDENCE_SATURATION`) / `EVIDENCE_SATURATION`, where E is the number of
   distinct spans with at least one `entailed` citation in the set;
2. `diversity` = the number of distinct categories among the `entailed` citations of the set, divided
   by 4 (the four categories, `history` included, so its maximum today is 0.75);
3. `crossConfirmation` = 1 when at least one statement has an `entailed` citation of category `code`
   and an `entailed` citation of category `test`, 0 otherwise;
4. `resolution` = the number of distinct cited spans all of whose citations have origin `anchor` or
   `exact`, divided by the number of distinct cited spans, counting every citation whatever its
   verdict; any other origin, an unknown one included, counts as not resolved (fail closed);
5. `entailment` = the number of `entailed` citations divided by the number of citations, every
   citation of every statement counted as given (a span cited twice by one statement counts twice);
6. `contradiction` = 1 when the contradiction flag is `true`, 0 otherwise.

The signals SHALL depend only on these fields: never on a statement's text, an excerpt, a status or
the model's output.

#### Scenario: Signals of a set backed by code and test

- **GIVEN** the citations E1 = `src/Pricing/PriceCalculator.php` lines 10–24 (`source`, `anchor`) and
  E2 = `tests/Unit/PriceCalculatorTest.php` lines 5–20 (`test`, `exact`)
- **WHEN** the signals are computed for S1 citing E1 `entailed` and S2 citing E1 `entailed` then E2
  `entailed`, without contradiction
- **THEN** they are `{ evidence: 0.5, diversity: 0.5, crossConfirmation: 1, resolution: 1,
  entailment: 1, contradiction: 0 }`
- **AND** for S1 alone they are `{ evidence: 0.25, diversity: 0.25, crossConfirmation: 0,
  resolution: 1, entailment: 1, contradiction: 0 }`

#### Scenario: Config counts as code and an unresolved origin lowers resolution

- **GIVEN** E1 as above, E3 = `src/Orders/OrderService.php` lines 30–41 (`source`, `heuristic`) and
  E4 = `config/shop.php` lines 1–9 (`config`, `exact`)
- **WHEN** the signals are computed for one statement citing E1 `entailed` then E4 `entailed`, then for
  one citing E1 `entailed` then E3 `entailed`, then for one citing only E1 but with origin `guessed`,
  each computed as a set of its own
- **THEN** the first has `diversity` 0.25 and `crossConfirmation` 0
- **AND** the second has `resolution` 0.5, and the third `resolution` 0

#### Scenario: A cited citation backs nothing

- **WHEN** the signals are computed for S1 citing E1 `entailed` and S2 citing E1 `entailed` then E2
  `cited`
- **THEN** they are `{ evidence: 0.25, diversity: 0.25, crossConfirmation: 0, resolution: 1 }` with
  `entailment` 2/3 and `contradiction` 0
- **AND** the same set with the contradiction flag `true` has `contradiction` 1 and the other five
  signals unchanged

### Requirement: Confidence value

The confidence of a set SHALL be σ(w₁·`evidence` + w₂·`diversity` + w₃·`crossConfirmation` +
w₄·`resolution` + w₅·`entailment` − w₆·`contradiction`), with σ(z) = 1 / (1 + e^(−z)), no intercept,
and the weights w₁…w₆ of the exported constant `CONFIDENCE_WEIGHTS` (keys `evidence`, `diversity`,
`crossConfirmation`, `resolution`, `entailment`, `contradiction`). Every weight and the exported
constant `EVIDENCE_SATURATION` SHALL be greater than 0, and `EVIDENCE_SATURATION` SHALL be an
integer. The value SHALL NOT be rounded.

The value SHALL be reproducible: the same set and flag give the same number (`Object.is`), whatever the
order of the statements and of the citations within each statement, with no clock, randomness or
input other than the set and the flag. Because every weight is positive and none of the five
positive signals decreases under these changes, the value SHALL never decrease when a citation's verdict goes
from `cited` to `entailed`, when an origin goes from not resolved to `anchor` or `exact`, or when an
`entailed` citation of a new span with origin `anchor` or `exact` is added, and it SHALL be lower with the contradiction flag `true`
than with `false`.

#### Scenario: The value follows the formula with the published weights

- **WHEN** the confidence of S1 citing E1 `entailed` and S2 citing E1 `entailed` then E2 `entailed` is
  computed without contradiction
- **THEN** it equals σ(0.5·w₁ + 0.5·w₂ + w₃ + w₄ + w₅) with the weights of `CONFIDENCE_WEIGHTS`, and is
  strictly between 0 and 1
- **AND** every weight of `CONFIDENCE_WEIGHTS` and `EVIDENCE_SATURATION` is greater than 0, and
  `EVIDENCE_SATURATION` is an integer

#### Scenario: The value is reproducible and independent of order

- **WHEN** the confidence of the set of the previous scenario is computed twice, and then with S2
  before S1 and with S2's citations in the order E2, E1
- **THEN** the four values are the same number (`Object.is`)

#### Scenario: A citation left cited lowers the value

- **WHEN** the confidence of the set of "The value follows the formula with the published weights" is
  computed, and then with E2 of S2 `cited`
- **THEN** the second value is lower than the first

#### Scenario: A contradiction lowers the value

- **WHEN** the confidence of the same set is computed with the contradiction flag `false` and with
  `true`
- **THEN** the value with `true` is lower

#### Scenario: Exact resolution beats heuristic resolution

- **WHEN** the confidence is computed for the set of "The value follows the formula with the
  published weights" with every citation's origin `heuristic`, and with every one `exact`
- **THEN** the set with `exact` origins has the higher value
- **AND** their `resolution` signals are 0 and 1

#### Scenario: Evidence saturates and never lowers the value

- **GIVEN** a statement citing `EVIDENCE_SATURATION` distinct spans of `source` files with origin
  `exact`, all `entailed`
- **WHEN** a further `entailed` citation of another such span is added
- **THEN** `evidence` stays 1 and the value does not decrease

#### Scenario: A set with no signal is worth one half

- **WHEN** the confidence is computed for one statement citing one span `cited` with origin
  `heuristic`, without contradiction, and then with the contradiction flag `true`
- **THEN** the first value is exactly 0.5 and the second is σ(−w₆), below 0.5
- **AND** the signals of the first are `{ evidence: 0, diversity: 0, crossConfirmation: 0,
  resolution: 0, entailment: 0, contradiction: 0 }`

### Requirement: Confidence needs evidence

The confidence computation SHALL reject with a `RangeError`, without computing anything, a set with no
statement or with a statement that has no citation: there is no confidence without evidence.

#### Scenario: A set without citations has no confidence

- **WHEN** the signals or the confidence are computed for an empty set, and for a set whose second
  statement has no citation
- **THEN** each call throws a `RangeError`

### Requirement: Published weights

`docs/CONFIDENCE.md` SHALL publish the weights with a single table holding one row for each of w₁…w₆
and `EVIDENCE_SATURATION`: its name, the signal it weighs (none for `EVIDENCE_SATURATION`), its value
and a non-empty reason. The values of the table and those of `CONFIDENCE_WEIGHTS` and
`EVIDENCE_SATURATION` SHALL be the same: a value changed on one side only SHALL make a test fail. The
document SHALL also explain the formula, the six signals as defined in requirement "Confidence
signals", and the limits: the contradiction signal is 0 in every answer until a component produces
contrary evidence, no citation has the `history` category yet (diversity at most 0.75), a set with no
signal is worth 0.5, and the value is ordinal and not calibrated. The document SHALL state that the weights were fixed once
on the development questions of the sample repositories and are never re-tuned against the
measurement questions.

#### Scenario: The published weights are the code's weights

- **WHEN** the weights table of `docs/CONFIDENCE.md` is read
- **THEN** it has exactly seven rows, w₁…w₆ and `EVIDENCE_SATURATION`, each with a non-empty reason
- **AND** each value equals the matching value of `CONFIDENCE_WEIGHTS` or `EVIDENCE_SATURATION`

#### Scenario: The confidence document states its limits

- **WHEN** `docs/CONFIDENCE.md` is read
- **THEN** it has the sections `Formula`, `Signals`, `Weights` and `Limits`
- **AND** its `Limits` section states that the contradiction signal is 0 until DIS-71, that the
  diversity is at most 0.75, that a set with no signal is worth 0.5, that the value is not
  calibrated, and that the weights are not re-tuned against the measurement questions
