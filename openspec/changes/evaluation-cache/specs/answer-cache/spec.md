## Purpose

The answer cache of `explain`: how a question becomes its cache key, which answers can be kept, what a
kept response holds and how it is checked when read back, and what a cache hit answers, so a repeated
or sample question is answered without the model and at no cost.

## ADDED Requirements

### Requirement: Question normalization

The cache key of a question SHALL be its normalized form, computed by these steps in this order:

1. Unicode compatibility decomposition (NFKD);
2. every combining mark (Unicode general category `M`) removed, so `á` becomes `a` and `ñ` becomes `n`;
3. lower case, independent of the locale of the process;
4. every punctuation character (category `P`, `¿`, `?`, `¡`, `!`, `_` and `:` included) and every
   symbol character (category `S`, `$` included) replaced by one space;
5. every run of whitespace (Unicode `White_Space`) replaced by one space;
6. the leading and trailing spaces removed.

The normalization SHALL be a pure function of the question: the same question SHALL always give the
same key, whatever the process, and normalizing a key SHALL give that same key. A question whose
normalized form is empty has no key: it SHALL be neither looked up nor saved. Two questions that differ
only in letter case, accents, punctuation, symbols or whitespace SHALL share one key; this includes
rare pairs that differ only in an accent or in `ñ` (`año` and `ano`), an accepted collision.

#### Scenario: Case, accent and punctuation variants share one key

- **WHEN** `¿Cómo se calcula el precio final de un pedido?`, `COMO SE CALCULA EL PRECIO FINAL DE UN PEDIDO`,
  ` ¿cómo   se calcula el precio final de un pedido?? ` and
  `Cómo se calcula, el precio final de un pedido!` are normalized
- **THEN** each gives exactly `como se calcula el precio final de un pedido`

#### Scenario: Identifiers, symbols and compatibility characters become plain words

- **WHEN** `PriceCalculator::compute()`, `$final_price`, `ＰｒｉｃｅＣａｌｃｕｌａｔｏｒ` (full-width
  letters), `año`, `İstanbul` and `precio\tfinal\n pedido` are normalized
- **THEN** they give `pricecalculator compute`, `final price`, `pricecalculator`, `ano`, `istanbul` and
  `precio final pedido`

#### Scenario: A question of only punctuation has no key, and a key is stable

- **WHEN** `¿?¡!` and ` ... ` are normalized, and then every key of the two previous scenarios is
  normalized again
- **THEN** the first two give the empty string, and each key gives itself

### Requirement: Cacheable answers

An answer of `explain` SHALL be cacheable when, and only when, it is either an answered answer whose
claims were stored (`persisted: true`) and whose every statement has status `current`, or an `UNKNOWN`
answer with reason `no-evidence` (the model read the code and found no basis). An answer whose claims
were not stored, an answer with any `stale` statement, and an `UNKNOWN` with any other reason
(`no-anchor`, `llm-required`, `over-budget`, `invalid-model-output`, `broken-evidence`) SHALL NOT be
cacheable.

#### Scenario: Only stored current answers and no-evidence unknowns are cacheable

- **WHEN** cacheability is decided for a stored answer with two `current` statements, a stored answer
  with one `current` and one `stale` statement, an unsaved answer (`persisted: false`), and one
  `UNKNOWN` answer for each reason
- **THEN** only the first answer and the `UNKNOWN` with reason `no-evidence` are cacheable

### Requirement: Stored response

The stored response of a cacheable answer SHALL be that answer without its `events` (they describe
the call that produced it): for an answered answer exactly `kind`, `persisted`, `answer`, `statements`,
`evidence`, `priorClaims`, `usage` and `confidence`; for an `UNKNOWN` answer exactly `kind`, `answer`,
`reason`, `statements` and `evidence`. It SHALL be a JSON value that a JSON round trip leaves equal.

A response read back from the cache SHALL be accepted only when it has exactly one of those two shapes:

- answered: `kind` `answered`, `persisted` `true`, `answer` a string, `statements` a non-empty list of
  exactly `{ text, type, status, verification, evidenceIds }` with `type` `FACT` or `INFERENCE`,
  `status` `current`, `verification` `entailed` or `cited` and `evidenceIds` a non-empty list of
  strings, each the `id` of one entry of `evidence`; `evidence` a list of exactly
  `{ id, fileId, path, startLine, endLine, excerpt }` with integer lines, `startLine` at least 1,
  `endLine` not below `startLine` and `excerpt` a string (an answer's evidence always has its text;
  `/ask` publishes it); `priorClaims` a list of exactly `{ id, text, type, status, evidence }` plus
  `warning: 'stale-evidence'` only when `status` is `stale`, `type` `FACT`, `INFERENCE` or `UNKNOWN`,
  `text` a string or `null`, and `evidence` entries as above except that `excerpt` may also be `null`
  (a prior claim stored without one); `usage` exactly the fields of an answer's usage (`explain`,
  "Answer usage"), with non-negative integers for the tokens, the calls, the cache hits and the
  latencies, non-negative finite costs, `savingsPct` any finite number (it is negative when the answer
  used more tokens than its baseline), `baselineEstimator` `chars-div-4` and `cacheHit` `false`; and
  `confidence` a number greater than 0 and less than 1;
- `UNKNOWN`: `kind` `unknown`, `answer` `UNKNOWN`, `reason` `no-evidence`, `statements` `[]` and
  `evidence` `[]`, and no other key.

Any other value (`null`, a value that is not an object, another key such as `events` or `message`,
`persisted: false`, a `stale` statement, a statement citing an id absent from `evidence`, an answer
evidence whose `excerpt` is `null`, a missing `usage`, an `UNKNOWN` with another reason) SHALL be rejected. A rejected response SHALL count as a
cache miss, not as an error, and the check SHALL hold no part of the response in any message.

#### Scenario: A stored response keeps the answer without its events

- **GIVEN** a stored answer whose events are an `untrusted_content_flagged` event of the question and a
  `query_not_logged` event
- **WHEN** its stored response is built, serialised to JSON, parsed back and checked
- **THEN** the check accepts it, and it equals the answer without the key `events`
- **AND** the same answer with `usage.savingsPct` −25 and a prior claim whose evidence `excerpt` is
  `null` is accepted too

#### Scenario: A no-evidence unknown is stored without events

- **WHEN** the stored response of an `UNKNOWN` answer with reason `no-evidence` and one sanitisation
  event is built and checked
- **THEN** it is exactly `{ kind: 'unknown', answer: 'UNKNOWN', reason: 'no-evidence', statements: [],
  evidence: [] }` and the check accepts it

#### Scenario: Invalid stored responses are rejected without leaking

- **GIVEN** a valid stored answered response whose answer text is a sentinel text
- **WHEN** the check reads `null`, `"x"`, that response with the extra key `debug`, with `events: []`,
  with `persisted: false`, with its first statement `stale`, with a statement citing an id absent from
  its evidence, with an evidence `excerpt` `null`, without `usage`, with `usage.cacheHit` `true`, and
  the `UNKNOWN` responses with reason
  `llm-required` and with a `message`
- **THEN** each is rejected as a miss, without an error, and nothing the check reports holds the
  sentinel

### Requirement: Answer of a cache hit

A cache hit SHALL answer the accepted stored response with `events: []` and, for an answered response,
the usage of this call instead of the stored one:

- `inputTokens` 0, `outputTokens` 0 and `costUsd` 0;
- `generation` `{ inputTokens: 0, outputTokens: 0, costUsd: 0 }` and `verification`
  `{ calls: 0, cacheHits: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, latencyMs: 0 }`;
- `baselineTokens` and `baselineEstimator` the stored ones, and `savingsPct` computed as for any answer
  with 0 input tokens against that baseline (100 when the baseline is above 0, 0 otherwise);
- `latencyMs` the latency of this call (`explain`, "Answer usage");
- `cacheHit` `true`.

Every other field (`kind`, `persisted: true`, `answer`, `statements` with their evidence ids,
`evidence`, `priorClaims`, `confidence`) SHALL be the stored one. A hit of a stored `UNKNOWN` SHALL be
that `UNKNOWN` with `events: []` and, as any `UNKNOWN`, no `usage`.

#### Scenario: A hit carries the stored answer and the usage of this call

- **GIVEN** a stored answered response whose usage has 4 000 input and 300 output tokens, cost 0.0165,
  `baselineTokens` 40 000 and `savingsPct` 90
- **WHEN** it is answered as a hit with a latency of 7 ms, and again with the stored `baselineTokens` 0
- **THEN** the first usage is exactly `{ inputTokens: 0, outputTokens: 0, baselineTokens: 40000,
  baselineEstimator: 'chars-div-4', savingsPct: 100, costUsd: 0, latencyMs: 7, cacheHit: true,
  generation: { inputTokens: 0, outputTokens: 0, costUsd: 0 }, verification: { calls: 0, cacheHits: 0,
  inputTokens: 0, outputTokens: 0, costUsd: 0, latencyMs: 0 } }` and the second has `baselineTokens` 0
  and `savingsPct` 0
- **AND** both answers have the stored `answer`, `statements`, `evidence`, `priorClaims`, `confidence`
  and `persisted: true`, and `events: []`

#### Scenario: A cached unknown is answered without usage

- **WHEN** the stored `UNKNOWN` response with reason `no-evidence` is answered as a hit
- **THEN** the answer is exactly `{ kind: 'unknown', answer: 'UNKNOWN', reason: 'no-evidence',
  statements: [], evidence: [], events: [] }`
