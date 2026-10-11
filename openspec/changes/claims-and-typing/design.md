## Context

See `proposal.md` → Why. State that shapes the approach:

- `packages/adapters/store-postgres/migrations/0002_history-claims.up.sql` defines the enums
  `claim_layer`, `claim_type`, `claim_status`, `evidence_verification` and the checks
  `fact_only_from_l1`, `l2_requires_provenance` (rejects SQL `NULL` only), `claim_confidence_range`,
  `evidence_start_line_positive`, `evidence_span_valid`. readme §3.2 leaves the provenance shape to the
  writer, "with Zod, before inserting (CM-HU-09)".
- `packages/core/src/context/context-pack.ts` (DIS-28): every `ContextSpan` carries `origin:
  ContextOrigin` (`'anchor' | 'exact' | 'heuristic'`, `context/rank.ts:11`). Spans have no id. The
  co-change and doc-mention edges are always `heuristic` (`knowledge/co-change.ts:66`,
  `knowledge/doc-mentions.ts:44`).
- `packages/core/src/llm/llm-request.ts`: `CompletionResult.text` is a plain, untrusted string.
- Core has no dependencies today; `zod@4.6.5` is installed for `packages/adapters/llm`.
  `.dependency-cruiser.cjs` only forbids `@codemind/*` infra packages and transports in core.
- `packages/core/src/index/audit-event.ts`: `AuditEvent = SecretRedactedEvent`; `sortEvents`
  (`index/index-repository.ts:186`) reads `event.file`.
- Core convention for closed sets: an `as const` array plus a derived type (`EDGE_RESOLUTIONS`).
  backend-standards §4: closed sets declared once, the type derived with `z.infer`.
- `packages/core/src/knowledge` is an input of the seed's analyzer fingerprint
  (`packages/cli/src/seed/fingerprint.ts`, `ANALYZER_DIRECTORIES`); `packages/core/src/explain` is not.

Refinement decisions accepted by the author on 2026-10-11 (Linear DIS-38, "Decisiones del
refinamiento") are the frame: D1–D7 below implement them.

## Goals / Non-Goals

**Goals:**

- Pure, synchronous functions and schemas; no port, no I/O except hashing.
- One source of truth per closed set and per limit, shared by types, schemas and tests.
- A discarded output is observable (subcode, size, hash, issue paths) without its content.

**Non-Goals:**

- Mapping a `FACT` statement to a stored `layer` (DIS-39, open question in its Linear thread).
- A `Claim` id, timestamps or `claimId` on evidence: the database assigns them; DIS-39 adds read
  shapes if it needs them.

## Decisions

### D1 — Records are Zod schemas; the TypeScript types are inferred from them

`knowledge/claim.ts` declares `CLAIM_LAYERS`, `CLAIM_TYPES`, `CLAIM_STATUSES` as `as const` arrays
(core convention) and `claimSchema` as `z.discriminatedUnion('layer', [l1, l2])`:

- `l1`: `type: z.literal(CLAIM_TYPES)`, `provenance: provenanceSchema.optional()`;
- `l2`: `type: z.literal(INFERRED_CLAIM_TYPES)` (`['INFERENCE', 'UNKNOWN']`, typed
  `readonly Exclude<ClaimType, 'FACT'>[]`), `provenance: provenanceSchema` (required);
- common: `projectId` (uuid), `subject`, `predicate` (strings; the columns are `NOT NULL` and accept
  `''`, so no length rule is added), `object` (string or `null`), `status: z.enum(CLAIM_STATUSES)`,
  `confidence: z.number().min(0).max(1).nullable()`.

**Closed sets use `z.literal([...])`, not `z.enum`** (found at task 7.5). `z.enum(ARRAY)` types the
schema as `ZodEnum<{ FACT: 'FACT', … }>`, and TypeDoc reports each key of that object as an
undocumented property of the exported schema (13 `docs:coverage` warnings; the gate had none before).
`z.literal(ARRAY)` accepts the same values with the same issue code (`invalid_value`) and its public
type is a union of literals. The sets are still declared once, as the `as const` arrays (core
convention, `EDGE_RESOLUTIONS`), and `docs/backend-standards.md` §4 is reworded to say so. Hiding the
schema behind `z.ZodType<Claim>` was tried and rejected: the inferred type then points at an
unexported constant, which TypeDoc also warns about.

**Strictness, every schema of this change:** every object schema, at every nesting level (claim
branches, provenance, its input spans, evidence, the model output, each statement), is built with
`z.strictObject()`. Zod 4's `z.object()` defaults to stripping unknown keys silently, which would let
a `type` or `note` field vanish instead of discarding the output. `z.object()` and `.passthrough()`
are not used in these files.

`type Claim = z.infer<typeof claimSchema>` makes `{ layer: 'L2', type: 'FACT' }` a compile error and
the same schema rejects it at run time, so the type test (`// @ts-expect-error`) and the run-time
test exercise one definition. The fields mirror the `claim` columns a writer supplies. Zod 4 rejects
`NaN` in `z.number()`.

`provenanceSchema` (strict): `model` (non-empty), `promptHash` (`/^[0-9a-f]{64}$/`), `inputSpans`
(≥ 1 of `{ fileId: uuid, startLine: int > 0, endLine: int >= startLine }`, both ≤ `SPAN_LINE_MAX`
= 2 147 483 647, the Postgres `integer`), `createdAt`
(`z.iso.datetime({ offset: true })`).

`knowledge/evidence.ts`: `EVIDENCE_VERIFICATIONS` and `evidenceSchema` (strict): `fileId` (uuid),
`startLine` (int > 0), `endLine` (int, refined `>= startLine`), `verification`, `excerpt` (string
or `null`).

Alternatives: hand-written interfaces plus a separate validator (two definitions that can drift; the
standard asks for `z.infer`); a class with a throwing constructor and a new `DomainError` (more code,
and DIS-39 still needs a schema to validate rows it builds). Rejected.

*Naming:* the ticket text said `inputEvidenceIds`. Evidence rows do not exist when the model is
called, and prompt-local ids (`E1…`) mean nothing after the call, so the provenance records the
input **spans** (`fileId` + lines). The accepted rule — an empty list is rejected — is unchanged.

### D2 — `zod` becomes a dependency of `@codemind/core`

Added to `packages/core/package.json` as `"zod": "^4.6.5"`, the range `adapters/llm` already uses;
`npm install` must resolve the same 4.6.5 and leave no new package in `package-lock.json` beyond the
workspace entry. Core is the right home: the quarantine and the typing rule are domain rules
(backend-standards §3), and placing the schema in `adapters/llm` would put business logic in an
adapter. No dependency-cruiser rule changes.

This contradicts `docs/backend-standards.md` §4 as written ("Schemas live in `packages/api/schemas`
and are the only description of a payload's shape"). That rule is about HTTP payloads; the change
amends §4 to say so and to place domain validation schemas (records, model-output quarantine) in
core, alongside the §1 note (task 7.1).

### D3 — `parseModelOutput` is a fixed pipeline with one subcode per failure

`parseModelOutput(text: string, knownEvidenceIds: ReadonlySet<string>): ModelOutputResult`, where the
result is `{ ok: true; output: ModelOutput } | { ok: false; event: SchemaViolationEvent }`. Steps, the
first failure wins:

1. `bytes = Buffer.byteLength(text, 'utf8')`; `> MAX_MODEL_OUTPUT_BYTES` → `output_too_large`
   (`JSON.parse` never runs).
2. `JSON.parse` in `try`; failure → `invalid_json` (no issue entries: the parser message may quote
   the input).
3. `modelOutputSchema.safeParse` (strict at every level, never `parse`). Subcode from the issues:
   all `too_small` on an `evidenceIds` path → `empty_evidence`; all `too_big` → `limit_exceeded`;
   otherwise `invalid_shape`.
4. Per statement, the first repeated id → `duplicate_evidence_id`, one issue with path
   `statements.<i>.evidenceIds.<j>` of the repetition and code `duplicate_evidence_id`.
5. Per statement, every id not in `knownEvidenceIds` → `unknown_evidence_id`, one issue per unknown
   id with path `statements.<i>.evidenceIds.<j>` and code `unknown_evidence_id`.

Steps 4–5 are not Zod issues: their issue `code` is the subcode literal itself. Step 1 and step 2
produce no issue entries.

Steps 4–5 run after the schema rather than in `superRefine`, so their subcodes do not depend on how
Zod mixes custom issues with structural ones. Discarding the whole output (not only the bad
statement) is the accepted rule: one fabricated id is evidence that the output does not follow the
contract.

Alternative: deduplicate repeated ids. Rejected (accepted decision 5): it would rewrite the model's
output instead of judging it.

*Naming:* the ticket text named the limit subcode after Zod's `too_big`. The event uses
`limit_exceeded`: one subcode for the five limits, with the issue `path` saying which one, so the
event's contract is not tied to an internal code of the validator library. The issue's own `code`
stays `too_big`, as Zod reports it.

### D4 — The audit event carries metadata only

```ts
interface SchemaViolationEvent {
  type: 'schema_violation';
  stage: 'l2_inference';
  subcode: SchemaViolationSubcode;
  outputBytes: number;
  outputSha256: string; // hex SHA-256 of the UTF-8 bytes, node:crypto as in index-repository.ts
  issues: { path: string; code: string }[];
}
```

Each Zod issue is copied as `{ path: issue.path.join('.'), code: issue.code }` and nothing else:
`message`, `keys` (the unexpected field names of `unrecognized_keys`), `input` and any value are
dropped, because all of them can carry text the model produced. Paths only contain schema field names
and array indices: unknown keys never appear in a path, only in `keys`. The hash is computed for every
discarded output, including oversized ones (linear cost; the text is already in memory). It serves
correlation between runs, not anonymisation.

### D5 — `SchemaViolationEvent` stays out of `AuditEvent`

It lives in `explain/schema-violation.ts`. Adding it to the `AuditEvent` union in `index/` would break
`sortEvents` (it reads `file`) and would mix indexing events with explain events in `IndexReport`.
DIS-39 returns it from the explain use case and the transport logs it (PH-09).

### D6 — Limits are named, exported, provisional constants

`explain/limits.ts`, one JSDoc line of why each, `as const` numbers:

| Constant | Value | Why |
|---|---|---|
| `MAX_MODEL_OUTPUT_BYTES` | 65 536 | Bounds parse memory and time against a runaway or adversarial output |
| `MAX_ANSWER_CHARS` | 2 000 | The answer is a summary; detail belongs in statements, which carry evidence |
| `MAX_STATEMENTS` | 20 | More statements do not fit a context budget with useful citations, and each one costs the verifier (CM-HU-10) |
| `MAX_STATEMENT_CHARS` | 500 | A statement is one checkable sentence (readme §2.5) |
| `MAX_EVIDENCE_IDS_PER_STATEMENT` | 10 | More citations dilute verification without adding guarantee |

Character lengths are Unicode code points: Zod 4.6.5 measures a string's `.min`/`.max` in code points
(`$ZodCheckMaxLength` in `node_modules/zod/v4/core/checks.js`, through `util.codePointLength`), which
is coherent with the token estimator of DIS-28 (`context/tokenizer.ts`, where an astral character
counts as one). Documented on the constants.
"Provisional" means they may change after the Table 1 measurements (CM-HU-22) without a spec change
beyond the numbers.

### D7 — The typing rule only sees `origin`

`typeStatement(chain: readonly [CitedSpan, ...CitedSpan[]]): 'FACT' | 'INFERENCE'`, with
`CitedSpan = Pick<ContextSpan, 'origin'>`. The non-empty tuple makes an empty chain a compile error.
`FACT` iff every span's origin is in `FACT_ORIGINS` (`anchor`, `exact`): the rule fails closed, so
an origin it does not know is an `INFERENCE`. An empty chain throws `RangeError` at run time (the
tuple only guards typed callers; `every` on `[]` would otherwise give `FACT`). `UNKNOWN` is not produced here: it is the
answer policy of DIS-39. The function takes no `layer`, so the statement type cannot be bent to pass
`fact_only_from_l1` (accepted decision 1).

**`origin` is taken as the Context Engine gives it; the rule does not recompute it.** Per the main
specs, a node's resolution is `exact` when at least one of its paths of minimum distance from an
anchor uses only `exact` edges, `heuristic` otherwise (`graph-store`, bounded neighbour traversal);
and a span that replaces others carries the best origin among itself and the spans it replaces
(`context-engine`, token budget). Accepted consequence: an `exact` span can contain lines that were
reached only heuristically — e.g. a whole-file span that replaces an `exact` symbol span and also
covers a method reached through a `heuristic` edge. This stays coherent with the parent's criterion
(DIS-29: "a chain with `heuristic` → `INFERENCE`") because the chain this rule judges is the list of
spans the Context Engine delivers, each with the origin it declares; the granularity of that chain is
DIS-28's contract. Making the origin finer (per line, or worst-of-replaced) is a change to the Context
Engine, not to this capability. Recomputing it here was rejected: it would need the graph and the
replaced spans, which `CitedSpan` deliberately does not carry.

### D8 — No ADR

The change adds pure domain code behind no port and defers the one cross-module decision (FACT
persistence) to DIS-39. No migration and no runtime wiring: reverting the commits removes it
completely. No ADR (accepted decision 1).

### D9 — The seed's analyzer fingerprint changes; `seed:build` closes the series

`knowledge/claim.ts`, `knowledge/evidence.ts` and the `knowledge/index.ts` export are inside
`ANALYZER_DIRECTORIES`, so the `analyzer-fingerprint` header of `seeds/graph-dump.sql` changes.
`explain/` is not an input. The contract fingerprint (`AnalyzerPort.ts` + `.up.sql`) does not change.
Alternative: put the records in `explain/` to avoid the regeneration. Rejected: the ticket and the
parent place them in `knowledge/`, next to the other domain records, and DIS-39's store code will
import them from there.

## Risks / Trade-offs

- [The limits are guesses] → named constants, boundary tests on each, revisited with CM-HU-22 data.
- [A Zod version that goes back to measuring string lengths in UTF-16 code units] → the extra case
  of task 4.9 (499 + an emoji accepted, 500 + an emoji rejected) detects it.
- [Zod 4 issue codes or `path` shapes change in a minor release] → the event tests pin `code` and
  `path` for each subcode; a Zod upgrade that changes them fails the suite.
- [`z.discriminatedUnion` error for a wrong `type` under `L2` reports `invalid_value`, not a CHECK
  name] → callers only need accept/reject; the CHECK name lives in the database error (DIS-39).
- [The SHA-256 of a short, guessable output can be confirmed by brute force] → the event never claims
  anonymity; spans are already redacted before the prompt (DIS-28). Accepted (privacy check, Low).
- [Discarding the whole output on one bad id loses good statements] → accepted on purpose: the
  answer degrades to `UNKNOWN` (DIS-39), which is the product's honest failure mode.

## Migration Plan

No migration, no runtime wiring. Deploy is the merge; rollback is reverting the commits, seed commit
included.

## Follow-ups

`spec-auditor` on the planning artifacts (2026-10-11), no Blocker; all fixed in this change before
apply (destination A):

- Major: `subject`/`predicate` "non-empty" was invented scope → removed (D1).
- Major: `docs/backend-standards.md` §4 contradicted by schemas in core → task 7.1 amends §4 (D2).
- Major: strictness API unstated (Zod 4 `z.object()` strips) → `z.strictObject()` everywhere (D1),
  pinned by tasks 4.3 and 9.4.
- Minor: the character count had no distinguishing case → extra case in task 4.9 (which then showed
  that Zod counts code points; see below).
- Minor: issue `code` of steps 4–5 unpinned → D3; asserted in tasks 4.4 and 4.6.
- Minor: "Easy to revert" wording → D8.
- Minor: task 9.3 bundled gates with mutant killing → split into 9.3 and 9.4.

Second review of the planning artifacts (another session, 2026-10-11), accepted by the author; fixed
in this change before apply (destination A):

- `limit_exceeded` vs the ticket's `too_big` → naming note in D3.
- The subcodes were not a closed set in the spec → stated in "Audit event of a discarded output".
- The spec's definition of `exact`/`heuristic` was looser than the real one, and the best-origin rule
  of replacing spans was not acknowledged → spec requirement "Statement typing…" and D7.

Found during apply (task 4.9, 2026-10-11), decided by the author (option 1); destination A, resolved
in this change:

- The premise of D6 and of the spec ("lengths are `string.length`, UTF-16 code units, as Zod's `.max`
  does") was false. `node_modules/zod/v4/core/checks.js:273` (`$ZodCheckMaxLength`) counts
  `input.length` and, when that exceeds the maximum, recounts in code points with
  `util.codePointLength`. Counterexample: `'a'.repeat(499) + '😀'` (501 UTF-16 units, 500 code points)
  passes `z.string().max(500)`. Spec, D6, the JSDoc of `limits.ts`, task 4.9 and its test now say
  code points; `MAX_MODEL_OUTPUT_BYTES` (UTF-8 bytes) is unchanged.

`/verify-against-spec` (2026-10-11, report `reports/2026-10-11-verify-against-spec.md`); the author
approved the proposed destinations:

- A — run-time `typeStatement([])` returned `FACT` and its test pinned that (2.1, 3.1): now throws
  `RangeError`; test changed (TDD, red first).
- A — fail-open condition `origin !== 'heuristic'` (3.2): `FACT_ORIGINS` set, fail closed; new test
  with an unknown origin (red first). D7 updated.
- A — no test for a missing or `null` provenance field (2.3): extra case added.
- A — the console test watched five methods (2.5): now every output method of `console`.
- A — spec said "kind" for the field `type` (2.4): spec wording aligned.
- A — line numbers accepted up to 2^53 (2.2): `SPAN_LINE_MAX` (2 147 483 647) on evidence and input
  spans, test red first; spec states it. Touches `knowledge/`: seed regenerated again.
- A, spec only — L1 `provenance: null` rejected (2.2): kept, specified ("absent, not `null`"), case
  added that pins it.
- C, owner DIS-39 — ` ` in text fields passes the schemas but Postgres rejects it (2.2): the
  writer of the rows (DIS-39) handles it; noted in DIS-39 on Linear.
- A, spec only — issue `code` is Zod's own for schema failures (3.8): kept (decided in D3), the set
  and the "subcode is the stable classification" rule are now in the spec.
- A, spec only — duplicate JSON keys (3.9): accepted, specified (the last value goes through every
  check, so nothing escapes the quarantine).
- A, spec only — UUID format, strict records, field lists, issue counts of the id checks, empty
  `issues` for size/JSON, reversed span on `endLine`, public exports (3.3–3.7, 3.10, 3.11).
- Accepted — `docs/backend-standards.md` §4 policy (3.12), reviewed by the author with this change;
  seed fingerprint change (3.13).

