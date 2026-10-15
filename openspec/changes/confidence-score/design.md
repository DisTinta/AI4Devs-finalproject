## Context

See `proposal.md` → Why for the motivation and the author's decisions D1–D8 (DIS-72 `[enhanced]`).
The current state that shapes the approach:

- `packages/core/src/explain/claim-items.ts`: `toClaimItems(provenance, statements)` writes
  `confidence: null` on every claim. Its input is `Pick<VerifiedStatement, 'text' | 'type' | 'spans' |
  'evidenceVerifications'>`, and each `spans[j]` is a `ContextSpan` that already carries `fileId`,
  `startLine`, `endLine`, `fileKind` and `origin` (`anchor` | `exact` | `heuristic`,
  `context/rank.ts`); `evidenceVerifications[j]` is the verdict of the pair (DIS-70). Everything the
  six signals need is already in a `VerifiedStatement`.
- `packages/core/src/explain/explain.ts`: `storedAnswer` / `unsavedAnswer` build the `answered`
  answer from the `VerifiedStatement[]` left after the output and entailment policies (the `broken`
  citations are already gone). `AnsweredCommon` (`explain-answer.ts`) has no `confidence`.
- The `claim.confidence` column, its `claim_confidence_range` check, `claimSchema`
  (`z.number().min(0).max(1).nullable()`) and the Postgres insert/read
  (`store-postgres/src/{claims,queries}.ts`) exist: no SQL, migration, port or adapter change.
- `packages/core/src/knowledge/` is a seed fingerprint input (`packages/cli/src/seed/fingerprint.ts`,
  `ANALYZER_DIRECTORIES`): adding a file there changes `analyzer-fingerprint`, so the seed must be
  rebuilt and committed (`docs/project-context.md`, seed gotcha).
- `packages/core/src/knowledge/co-change.ts` + `tests/unit/knowledge/co-change.spec.ts` are the
  template of a pure function with exported constants and its test; `knowledge/index.ts` is the
  barrel (`no-orphans` rule of `.dependency-cruiser.cjs`).
- `docs/CONFIDENCE.md` holds only "pending — Entrega 2/3".

## Goals / Non-Goals

**Goals:**

- One pure, order-independent function that both the claim and the answer use (D1), so a claim's
  value and an answer's value are comparable.
- A single source for the weights: the constants in code, checked against the table of
  `docs/CONFIDENCE.md` by a test.
- `knowledge/` stays below `explain/` and `context/`: the function defines its own input types.

**Non-Goals:**

- Any change to the verifier, the typing rule or the output policies; the confidence reads their
  results and changes none of them.
- Showing the value anywhere (`ask`, API, web); see `proposal.md` → Non-goals.
- Rounding or formatting the value: presentation layers decide (CM-HU-12.2, CM-HU-15b).

## Decisions

### C1 — `knowledge/confidence.ts` with its own input types

New `packages/core/src/knowledge/confidence.ts`, pure, no I/O:

```ts
export type ConfidenceVerdict = 'entailed' | 'cited';
export interface ConfidenceCitation {
  fileId: string; startLine: number; endLine: number;
  fileKind: FileKind;      // from ./graph-file.js
  origin: string;          // 'anchor' | 'exact' resolve; anything else does not
  verification: ConfidenceVerdict;
}
export interface ConfidenceStatement { citations: readonly ConfidenceCitation[] }
export interface ConfidenceOptions { contradiction: boolean }
export interface ConfidenceSignals {
  evidence: number; diversity: number; crossConfirmation: number;
  resolution: number; entailment: number; contradiction: number;
}
export const CONFIDENCE_WEIGHTS: Readonly<Record<keyof ConfidenceSignals, number>>;
export const EVIDENCE_SATURATION: number;
export function confidenceSignals(statements: readonly ConfidenceStatement[], options: ConfidenceOptions): ConfidenceSignals;
export function confidence(statements: readonly ConfidenceStatement[], options: ConfidenceOptions): number;
```

`origin` is `string`, not `ContextOrigin`, so `knowledge/` does not import `context/` and an unknown
origin is representable (spec "Confidence signals": it counts as not resolved, as `typeStatement`
fails closed). `ConfidenceVerdict` is declared here rather than imported from `explain/claim-items.ts`
(`StatementVerification`), since `knowledge/` must not depend on `explain/`; the two unions are equal
and `explain/` assigns one to the other, so the compiler keeps them in step. Exported from
`knowledge/index.ts`; TSDoc on every export (`docs:coverage`).

*Alternative*: put the function in `explain/` next to its only caller. Rejected: the ticket and the
parent place it in `knowledge/` (the readme's §3.2 is a property of claims, and a later caller — the
lazy recompute of DIS-42, the API — should not depend on `explain/`).

### C2 — Signal computation details

The spec ("Confidence signals") fixes the definitions; the design fixes the choices it leaves:

- **Span key**: `` `${fileId}\u0000${startLine}\u0000${endLine}` `` in a `Set` (or a `Map` keyed by it),
  so distinctness never depends on order.
- **`resolution` per span requires *every* citation of the span to be `anchor`/`exact`** (confirmed by
  the author, Q2). In practice a
  span has one origin (the pack holds one `ContextSpan` per id), so "every" and "any" agree today;
  "every" is the fail-closed choice if two citations of one span ever disagree.
- **Every citation counts as given** (author, Q1): only `evidence` and `resolution` merge citations,
  by span; `entailment` counts a span cited twice by one statement twice, and `diversity` /
  `crossConfirmation` look at categories, not at spans. No `RangeError` for repeated spans (the
  quarantine already rejects repeated ids, so `explain` never sends them).
- **Counts, then one division each**: every signal is an integer count divided once by another
  integer (or by 4, or by `EVIDENCE_SATURATION`), so the signals of two orderings of the same set are
  the same doubles.
- **Validation first**: `confidenceSignals` throws `RangeError` when `statements` is empty or any
  statement has no citation, before counting; `confidence` calls `confidenceSignals`, so both reject.
  No other input check: the types already bound `fileKind` and `verification`, and the caller passes
  pack spans whose lines were validated upstream.

### C3 — The value: fixed sum order, `Math.exp`, no rounding

`confidence` sums `w·s` in the fixed key order `evidence, diversity, crossConfirmation, resolution,
entailment`, subtracts `contradiction·w₆`, and returns `1 / (1 + Math.exp(-z))`. A fixed order keeps
the floating-point sum, and therefore `Object.is` equality, independent of the input order (spec
"The value is reproducible and independent of order"). With no signal `z` is `0` (or `-0`) and the
value is exactly `0.5`. No rounding (D6): the column is `double precision` and stores the double as is.

### C4 — Initial constants (D7), replaced by the author in the apply (D4)

`CONFIDENCE_WEIGHTS = { evidence: 0.5, diversity: 0.5, crossConfirmation: 0.5, resolution: 0.5,
entailment: 1.0, contradiction: 1.5 } as const` and `EVIDENCE_SATURATION = 4`, frozen
(`Object.freeze`). The tests never hard-code the weights: they compute expected values from the
exported constants (spec "The value follows the formula with the published weights"), so the
author's final values change no test. Only the signal values are exact numbers in the tests.

The weight session (task group 9). The author delegated the recommendation of both the questions
and the weights to the agent (2026-10-15); the author still approves each before it ships:

1. The agent proposes 6–8 development questions over `acme-shop` (and `task-api` if it is indexed),
   chosen so their answers vary the signals: a well-anchored question (code + test evidence, high
   `resolution`), one that mostly reaches `heuristic` edges (facades, Laravel conventions), one about
   configuration, one about documentation, one the code barely answers (expected `cited` verdicts).
   Never the measurement questions (CM-HU-22). The author approves the list before any run.
2. The agent runs them with Ollama CPU-only and prints each answer's signals and value with a
   scratchpad script over `explain` (`ask` does not print the confidence).
3. The agent recommends the values with the evidence for each (which signals separated answers it
   judged better or worse supported, where the value saturated) and a draft reason. Criteria: keep
   Σ w₁..w₅ moderate so the value does not saturate near 1, keep `entailment` the heaviest positive
   weight (the only signal that checks the citation supports the statement), keep w₆ above any single
   positive weight.
4. The author approves, changes or rewrites each value and reason; only that approved text ships,
   recorded as the author's decision in the report (base-standards rule 8).

### C5 — `explain` wiring

- `explain/claim-items.ts` gains `toConfidenceStatement(statement)`, the mapping from a
  `Pick<VerifiedStatement, 'spans' | 'evidenceVerifications'>` to a `ConfidenceStatement`
  (`spans[j].{fileId,startLine,endLine,fileKind,origin}` + `evidenceVerifications[j]`). `toClaimItems`
  writes `confidence: confidence([toConfidenceStatement(statement)], { contradiction: false })`; its
  TSDoc drops "no confidence".
- `explain.ts` computes `confidence(statements.map(toConfidenceStatement), { contradiction: false })`
  once, after the entailment policy, and passes it to `storedAnswer` and `unsavedAnswer`, which set
  `confidence` on the answer. The stale branch does not touch it (D8).
- `explain-answer.ts`: `AnsweredCommon.confidence: number`, TSDoc: ordinal, not calibrated, computed
  from the remaining citations' metadata and verdicts, see `docs/CONFIDENCE.md`. `UnknownExplain` is
  unchanged (no `confidence`).
- `contradiction: false` is written at the two call sites with a comment naming DIS-71 (D2), not
  hidden in a default parameter, so the day DIS-71 lands the call sites are where the flag changes.

The `answered` path always has at least one statement with at least one citation (the output policy
answers `UNKNOWN (broken-evidence)` otherwise), so the `RangeError` of C2 cannot be reached from
`explain`; if it ever were, it propagates as a programming error.

### C6 — `docs/CONFIDENCE.md` format and its sync test

The document (English, like every doc of the repository) has four `##` sections, in this order:
`Formula`, `Signals`, `Weights`, `Limits` (spec "The confidence document states its limits"). The
`Weights` section holds one Markdown table:

```markdown
| Name | Signal | Value | Reason |
| --- | --- | --- | --- |
| w1 | `evidence` | 0.5 | … |
| … | … | … | … |
| EVIDENCE_SATURATION | — | 4 | … |
```

Values in plain decimal with a dot (`0.5`, `1.5`, `4`), so `Number(cell)` parses them. The reasons
are the author's words, transcribed verbatim (C4) in the language the author writes them.

`tests/unit/knowledge/confidence-doc.spec.ts` reads the file with
`new URL('../../../docs/CONFIDENCE.md', import.meta.url)`, as `tests/unit/knowledge/claim.spec.ts:20`
reads the migration, takes the table rows under `## Weights`, and checks:
exactly seven rows; names `w1`…`w6` and `EVIDENCE_SATURATION`; each `wᵢ` row's signal is the key of
`CONFIDENCE_WEIGHTS` in the order `evidence, diversity, crossConfirmation, resolution, entailment,
contradiction` and its value equals that weight; the `EVIDENCE_SATURATION` row's value equals the
constant; every reason is non-empty. A second test checks the four headings and that the `Limits`
section mentions `DIS-71`, `0.75`, `0.5`, "not calibrated" and that the weights are not re-tuned
against the measurement questions.

*Alternative*: generate the table from the constants (a script) and only diff it. Rejected: the
reasons live only in the document, and a script would be a second tool for one table.

### C7 — Tests

- `tests/unit/knowledge/confidence.spec.ts` (new, template `co-change.spec.ts`; spec header comment and
  one `describe` per requirement, as the other spec-mapped suites): every scenario of the
  requirements "Confidence signals", "Confidence value" and "Confidence needs evidence", with the
  citations E1–E4 of the spec built by a small local factory. Expected values are computed in C3's
  key order from the exported constants and compared exactly (`toBe` / `Object.is`), never with
  `toBeCloseTo`: exact comparison is what catches a rounding.
- `tests/unit/knowledge/confidence-doc.spec.ts` (new): the two scenarios of "Published weights".
- `tests/unit/explain/explain-verification.spec.ts`: the two new scenarios of "Answer with typed
  statements" and the new one of "Precedence and UNKNOWN answers" over the existing doubles (`scripted-llm`'s `verify` script, `in-memory-store`), the
  expected values computed with `confidence(…)` and the spans the pack holds, never hard-coded.
- `tests/unit/explain/explain.spec.ts` and `tests/integration/explain/explain.spec.ts`: the modified
  scenarios "A fact is stored as an inferred claim that keeps its type" and "An answer written after a
  re-index is stored stale"; the non-scenario test "stores each statement as an L2 inference that
  keeps its statement type" (`confidence: null` → computed).
- Hand-built `AnsweredExplain` values in tests (`tests/unit/cli/ask-command.spec.ts` helper
  `answered()`) gain `confidence` because the type requires it; `ask`'s output does not change.
- Stryker on `packages/core/src/knowledge/confidence.ts`, score ≥ 80 (CI break threshold).

### C8 — No ADR

The formula, the signals and the weights are recorded in the spec and in `docs/CONFIDENCE.md`, which
is the publication the readme promises; the decision does not span modules and is cheap to revert
(one function and two call sites). No new ADR.

### C9 — A fenced model output is parsed (author's decision, 2026-10-15)

Found during the weight session (task 9.2): `qwen2.5-coder` returns its JSON inside a Markdown code
fence, and `parseModelOutput` (`explain/statement-schema.ts`) calls `JSON.parse` on the raw text, so
every answer was discarded `invalid_json`. The author asked to solve it in this change (`proposal.md`
→ Why).

Before `JSON.parse`, the quarantine unwraps **one** fence when, and only when, the whole output
(leading and trailing whitespace aside) is: a line holding three backticks optionally followed by
`json` in any case, a line break, the body, a line break, and a line holding three backticks. The body
is then parsed and goes through checks 3–5 unchanged. Anything else (text before or after, two fences,
an unclosed fence, another info string such as `js`) is not unwrapped, so `JSON.parse` fails and the
output is discarded `invalid_json` as before: the quarantine stays fail-closed. The size check runs
before the unwrap and the audit event keeps the raw output's bytes and SHA-256, so an event still
identifies exactly what the model sent. One anchored regular expression over the trimmed text, with no
backtracking-heavy pattern (the body is `[\s\S]*` between fixed anchors, the input already bounded at
65 536 bytes).

*Alternative*: ask for JSON mode (`response_format: { type: 'json_object' }`) in the LLM adapter.
Rejected: it is provider-specific (not every OpenAI-compatible endpoint supports it), it changes the
adapter rather than the one place that decides what an output is, and it would not cover a model that
fences anyway.

*Operations note* (no code): Ollama cuts every prompt to its default context (`limit=2050` in its
log), while `explain` sends 5 000–7 500 tokens with the default budget of 8 000; the cut drops the
system prompt and the model answers free-form. Serve Ollama with `OLLAMA_CONTEXT_LENGTH=16384`
(`docs/project-context.md`).

## Risks / Trade-offs

- [The signals are coarse: a single-statement claim has `crossConfirmation` 0 unless it cites code and
  test, and `diversity` is at most 0.75 (no history), 0.25 for a single-category statement] → Accepted: the value is ordinal and compares answers of
  the same system; `docs/CONFIDENCE.md` → Limits says so.
- [`entailment` comes from a model call, so "reproducible" holds only for the same verdicts] → The spec
  states reproducibility over the same inputs; the readme sentence is corrected; the verification
  cache makes repeated pairs give the same verdict within a process.
- [Changing `knowledge/` changes the seed fingerprint] → Task: rerun `npm run seed:build` and commit
  the seed, whose recorded `analyzer-fingerprint` would no longer match otherwise.
- [The author's weight session needs a working local model (Ollama CPU, known `llama3.2` issues)] →
  Ask the author for the models at the start of the session; if no model works, the D7 values stay and
  the author records that in the reasons; the tests do not depend on the values.
- [A model that writes prose outside the fence is still discarded] → Accepted: C9 parses only an
  output that is nothing but one fence; widening it would let untrusted prose decide what is parsed.
- [Old claims keep `confidence` `NULL` next to new ones with a value] → Accepted; recomputing is
  DIS-42. Readers already handle `null` (`claimSchema`).

## Migration Plan

No data migration. Deploying the code makes new claims carry a value; rolling back makes them `NULL`
again. The seed is rebuilt only because its fingerprint covers `knowledge/`; its rows do not change.

## Open Questions

- Which development questions the weight session uses: no list exists in the repository. The agent
  proposes them at the start of task group 9 (C4) and the author approves them; the list is recorded
  in the step's report and in `docs/CONFIDENCE.md`. It changes neither the specs nor the tasks.

## Follow-ups

None yet.
