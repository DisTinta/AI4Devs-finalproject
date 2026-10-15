## MODIFIED Requirements

### Requirement: Ask answer output

The command SHALL call `explain` once with the resolved project id, the question and `explain`'s
default budget and hops. For an answered question it SHALL exit with `0` and print to stdout, in this
order and nothing else:

1. the answer, one output line per line of the answer; one trailing line break of the answer or of
   a statement text SHALL NOT produce an empty line, and inner empty lines SHALL be printed as empty
   lines;
2. an empty line and `statements:`, then each statement numbered from `1`, in the answer's order:
   `<n>. [<type>]` (`FACT` or `INFERENCE`), followed by ` [stale]` when its status is `stale`, a
   space and the first line of its text; each further line of the text indented by 3 spaces; the line
   `   warning: stale-evidence` when it carries that warning; and the line
   `   evidence: <path>:<startLine>-<endLine>` listing the spans of its evidence ids in citation
   order, separated by `, ` (an id absent from the answer's evidence is skipped, and a statement
   with no span left has no `evidence:` line);
3. an empty line and `evidence:`, then each distinct cited span (same file and lines counted once),
   in first-citation order: the line `<path>:<startLine>-<endLine>` followed by its excerpt, each
   excerpt line indented by 4 spaces; an excerpt of more than 5 lines SHALL show its first 5 lines
   and then the line `    … (+<k> lines)`, `k` being the lines left out; one trailing line break of
   an excerpt SHALL NOT count as a line; a `null` excerpt SHALL print the span line only;
4. only when there are prior claims: an empty line and `prior claims:`, then each prior claim
   numbered from `1`, newest first, as a statement is printed, with its displayed type (`FACT`,
   `INFERENCE` or `UNKNOWN`), `(no text)` in place of a `null` text, and its evidence spans;
5. only when the claims were not stored: an empty line and `note: claims not saved` as the last line.

An empty line inside a statement text, a prior-claim text or an excerpt SHALL be printed as an empty
line, without indentation.

Every event the answer carries SHALL be written to stderr as one JSON line, in the answer's order:
`{"level":"error",…event}` for an `evidence_broken` event, which reports a system failure, and
`{"level":"info",…event}` for every other event; with no events stderr SHALL stay empty. The level
of an event SHALL NOT change the exit code. The command SHALL NOT print the question itself, and stderr
SHALL NOT contain it.

#### Scenario: A typed answer is printed with its evidence and stored

- **GIVEN** acme-shop seeded, a valid `DATABASE_URL`, and a live model that answers one statement
  citing only `anchor`/`exact` spans of `PriceCalculator.php` and one statement citing a `heuristic`
  span
- **WHEN** `ask acme-shop "¿Cómo se calcula el precio final de un pedido?"` runs
- **THEN** it exits with `0`; stdout starts with the model's answer and holds `1. [FACT] …` followed
  by `   evidence: app/Services/PriceCalculator.php:16-44`, and `2. [INFERENCE] …` followed by an
  `evidence:` line naming the cited heuristic span's own `<path>:<startLine>-<endLine>` (on acme-shop,
  `app/Http/Controllers/CheckoutController.php:19-33`), and the evidence section with each cited
  span's excerpt; stdout has no `prior claims:` section and no `note:` line; stderr is empty; and
  two new `claim` rows are stored

#### Scenario: Stale statements and prior claims are marked

- **GIVEN** an answer, stored, with one `INFERENCE` statement of status `stale` and warning
  `stale-evidence`, and two prior claims, one `stale` with warning `stale-evidence` and one `current`
  `FACT` with a `null` text
- **WHEN** `ask` prints it
- **THEN** it exits with `0`; the statement line starts with `1. [INFERENCE] [stale] ` and is
  followed by `   warning: stale-evidence`; the `prior claims:` section lists both, the first as
  `1. [INFERENCE] [stale] …` with its warning line and the second as `2. [FACT] (no text)` with no
  `[stale]` and no warning line

#### Scenario: An unsaved answer is printed with a closing note

- **GIVEN** a live model that answers one statement and a store whose claim write fails
- **WHEN** `ask acme-shop "¿Cómo se calcula el precio final de un pedido?"` runs
- **THEN** it exits with `0`; stdout prints the answer, its statements and evidence, and its last
  line is `note: claims not saved`, after the evidence and prior-claims sections; stderr is exactly
  `{"level":"info","type":"claims_not_persisted","code":"store-write-failed"}` and one line feed

#### Scenario: A span cited twice is listed once

- **GIVEN** an answer whose first statement cites span `B` then span `A`, and whose second statement
  cites span `A`
- **WHEN** `ask` prints it
- **THEN** the first statement's line is `   evidence: <B>, <A>` and the second's
  `   evidence: <A>`; the evidence section lists `B` then `A`, each exactly once

#### Scenario: A broken citation is logged as an error

- **GIVEN** an answer, stored, with one statement, whose events are a sanitisation event followed by
  an `evidence_broken` event
- **WHEN** `ask` prints it
- **THEN** it exits with `0`; stderr is exactly two lines, the first starting `{"level":"info",` and
  the second starting `{"level":"error","type":"evidence_broken",`, and the second line's fields are
  exactly `level`, `type`, `evidenceId`, `path`, `startLine`, `endLine` and `reason`

#### Scenario: Explain receives only the project id and the question

- **GIVEN** acme-shop stored and a recording `explain`
- **WHEN** `ask acme-shop "¿Cómo se calcula el precio final de un pedido?"` runs
- **THEN** `explain` is called exactly once, with the request `{ projectId: <acme-shop's id>,
  question: "¿Cómo se calcula el precio final de un pedido?" }` and no `tokenBudget` or `hops`

### Requirement: Ask UNKNOWN output

When `explain` answers `UNKNOWN`, the command SHALL exit with `0` and print to stdout exactly
`UNKNOWN (<reason>)` and, for `llm-required`, the line
`evaluation mode (cache-only): set LLM_* to enable free-form asks` (escaped as any other text);
nothing else, whatever other field the answer carries. Its events SHALL go
to stderr as in an answer. No claim SHALL be stored.

#### Scenario: Evaluation mode answers llm-required

- **GIVEN** acme-shop seeded and neither `LLM_BASE_URL` nor `LLM_API_KEY` set
- **WHEN** `ask acme-shop "¿Cómo se calcula el precio final de un pedido?"` runs
- **THEN** it exits with `0`, stdout is exactly `UNKNOWN (llm-required)` and
  `evaluation mode (cache-only): set LLM_* to enable free-form asks`, each followed by a line feed,
  stderr is empty, the model is never called and no `claim` row is added

#### Scenario: A question without anchor answers no-anchor

- **GIVEN** acme-shop seeded and a live model
- **WHEN** `ask acme-shop "¿Dónde vive el ornitorrinco?"` runs
- **THEN** it exits with `0`, stdout is exactly `UNKNOWN (no-anchor)` and a line feed, stderr is
  empty, the model is never called and no `claim` row is added

#### Scenario: A discarded model output answers invalid-model-output

- **GIVEN** acme-shop seeded and a live model whose output is not valid JSON and holds a sentinel
- **WHEN** `ask acme-shop "¿Cómo se calcula el precio final de un pedido?"` runs
- **THEN** it exits with `0`, stdout is exactly `UNKNOWN (invalid-model-output)` and a line feed,
  stderr is one line starting `{"level":"info","type":"schema_violation",` that does not contain the
  sentinel, and no `claim` row is added

#### Scenario: Every citation broken answers broken-evidence

- **GIVEN** an `UNKNOWN` answer with reason `broken-evidence` whose events are two `evidence_broken`
  events
- **WHEN** `ask` prints it
- **THEN** it exits with `0`, stdout is exactly `UNKNOWN (broken-evidence)` and a line feed, and
  stderr is two lines, each starting `{"level":"error","type":"evidence_broken",`
