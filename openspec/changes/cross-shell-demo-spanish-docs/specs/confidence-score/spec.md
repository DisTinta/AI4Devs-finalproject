## MODIFIED Requirements

### Requirement: Published weights

`docs/CONFIDENCE.md` SHALL be written in Spanish. Commands, identifiers (`w1`…`w6`,
`EVIDENCE_SATURATION`, `CONFIDENCE_WEIGHTS`, the signal names `evidence`, `diversity`,
`crossConfirmation`, `resolution`, `entailment` and `contradiction`, the verdicts `entailed` and
`cited`, the origins, file kinds and categories), file paths and the development questions SHALL stay
verbatim, and every number SHALL be written as in the code, with a decimal point (`0.5`, not `0,5`).

It SHALL publish the weights with a single table whose header cells are `Nombre`, `Señal`, `Valor` and
`Motivo`, holding one row for each of w₁…w₆ and `EVIDENCE_SATURATION`: its name, the signal it weighs
(`—` for `EVIDENCE_SATURATION`), its value and a non-empty reason. The values of the table and those of
`CONFIDENCE_WEIGHTS` and `EVIDENCE_SATURATION` SHALL be the same: a value changed on one side only
SHALL make a test fail. The document SHALL also explain the formula, the six signals as defined in
requirement "Confidence signals", and the limits: the contradiction signal is 0 in every answer until a
component produces contrary evidence, no citation has the `history` category yet (diversity at most
0.75), a set with no signal is worth 0.5, the value is ordinal and not calibrated, the value is
reproducible only for the same verdicts, an answer's value can rise when well-backed statements are
added to it (each claim keeps its own value), and a verdict left `cited` because the verifier was
unavailable lowers the stored value of its claim for good. The document SHALL state that the weights
were fixed once on the development questions of the sample repositories, list those questions and the
model used, and state that the weights are never re-tuned against the measurement questions.

#### Scenario: The published weights are the code's weights

- **WHEN** the weights table of `docs/CONFIDENCE.md` is read
- **THEN** its header cells are `Nombre`, `Señal`, `Valor` and `Motivo`
- **AND** it has exactly seven rows, w₁…w₆ and `EVIDENCE_SATURATION`, each with a non-empty reason
- **AND** each value equals the matching value of `CONFIDENCE_WEIGHTS` or `EVIDENCE_SATURATION`
- **AND** the row of `EVIDENCE_SATURATION` names no signal (`—`)

#### Scenario: The confidence document states its limits

- **WHEN** `docs/CONFIDENCE.md` is read
- **THEN** its level-2 sections are exactly `Fórmula`, `Señales`, `Pesos` and `Límites`, in that order
- **AND** its `Límites` section, with line breaks read as spaces, contains each of these statements:
  «La señal de contradicción vale 0 en todas las respuestas hasta DIS-71», «`diversity` vale como
  máximo 0.75», «vale exactamente 0.5», «El valor es ordinal y no está calibrado», «reproducible para
  las mismas citas y veredictos», «Añadir afirmaciones bien respaldadas a una respuesta puede subir el
  valor de la respuesta», «baja para siempre el valor guardado de su claim» and «Los pesos no se
  reajustan con las preguntas de medición»
