## MODIFIED Requirements

### Requirement: Statement typing from the resolution of its evidence

A statement SHALL be typed from the spans it cites, never from what the model says about it. Each
cited span carries the origin the Context Engine gave it, and the typing SHALL use that origin as
given, without recomputing it, and SHALL fail closed: a span whose origin is not `anchor` or
`exact` (including an origin the rule does not know) makes the statement an `INFERENCE`. The
origins are: `anchor` (an anchor symbol of the question), `exact` (at least one of
the paths of minimum distance from an anchor uses only `exact` edges) or `heuristic` (otherwise). A
span that replaced others in the context carries the best origin among itself and the spans it
replaced, so an `exact` span may contain lines reached only heuristically. A statement SHALL be
`FACT` when every cited span is `anchor` or `exact`, and `INFERENCE` when at least one is
`heuristic`. A statement SHALL cite at least one span; typing an empty chain SHALL NOT be possible:
it SHALL fail to type-check and SHALL be rejected at run time with an error, never typed as a fact.
A chain with a missing position (a sparse array), or with a position that is `undefined` or `null`,
SHALL be rejected the same way, with the same error: every position SHALL hold a cited span.

This rule types the evidence chain only and SHALL NOT read any verification verdict. The type an
answer of `explain` shows and stores is this type capped by the entailment policy of
`evidence-verification`: a statement this rule types `FACT` is answered `FACT` only when every one of
its citations is `entailed`.

#### Scenario: A chain of anchor and exact evidence is a fact

- **WHEN** a statement citing one `anchor` span and one `exact` span is typed
- **THEN** its type is `FACT`

#### Scenario: Any heuristic evidence makes an inference

- **WHEN** a statement citing one `exact` span and one `heuristic` span is typed, and a statement
  citing only one `heuristic` span
- **THEN** both types are `INFERENCE`
