## Why

CM-HU-09 (DIS-29) promises an explanation split into statements marked as fact or inference, each
with its citations, and readme §2.5 (2) requires that the component reading repository content only
returns schema-conforming data: model output that fails the schema is discarded and audited, never
interpreted. Today nothing in `packages/core` knows what a claim, a piece of evidence or a valid model
output is: the `claim`/`evidence` tables and their `CHECK`s exist only in SQL (DIS-12), and the
fact/inference rule exists only in prose. This is DIS-38 (CM-HU-09.1): the domain types, the typing
rule and the quarantine schema, as pure functions, so that DIS-39 (explain use case) can compose them
without deciding any of it.

## What Changes

- **Claim and evidence types** (`packages/core/src/knowledge/{claim,evidence}.ts`, new): closed sets
  `CLAIM_LAYERS`, `CLAIM_TYPES`, `CLAIM_STATUSES`, `EVIDENCE_VERIFICATIONS` (one list each, equal to the
  SQL enums of `0002_history-claims`), and Zod schemas whose inferred types mirror the database
  checks: a `FACT` claim of layer `L2` is not representable (`fact_only_from_l1`), an `L2` claim needs
  a `provenance` (`l2_requires_provenance`), `confidence` lies in [0, 1] or is `null`
  (`claim_confidence_range`), and an evidence span has `startLine > 0` and `endLine >= startLine`.
  `provenanceSchema` fixes the provenance shape the readme leaves to the writer (model, prompt hash,
  input spans, timestamp).
- **Typing rule** (`packages/core/src/explain/typing-rules.ts`, new): `typeStatement(chain)` returns
  `FACT` only when every cited span was reached as `anchor` or by `exact` edges; any `heuristic` span
  makes it `INFERENCE`. The statement type does not depend on `layer`.
- **Quarantine** (`packages/core/src/explain/statement-schema.ts`, new): `parseModelOutput(text,
  knownEvidenceIds)` checks the size, parses JSON, validates a strict schema (no `type` field: the
  model never decides the type) and checks that every cited id is known and not repeated. Any failure
  discards the **whole** output and returns a `SchemaViolationEvent` with a subcode.
- **Limits** (`packages/core/src/explain/limits.ts`, new): five exported, provisional constants
  (output bytes, answer length, statement count, statement length, citations per statement).
- **Audit event** (`packages/core/src/explain/schema-violation.ts`, new): subcode, output size in
  bytes, SHA-256 of the output and, per issue, only its path and code. Never the raw output. Core
  returns it; it does not log it.
- **Dependency**: `zod` becomes a dependency of `@codemind/core`, at the version `adapters/llm`
  already uses (`^4.6.5`). No new package enters the lockfile.

## Non-goals

- How a statement typed `FACT` is persisted given `fact_only_from_l1` (moved to DIS-39 as an open
  question), and any persistence of `claim`/`evidence` (`saveClaims`/`saveEvidence`, DIS-39).
- The prompt, assigning ids (`E1…En`) to the spans of a context pack, the `UNKNOWN` policy, and writing
  the audit event to a log (DIS-39).
- Citation verification (`verification` stays `none`) and computed `confidence` (CM-HU-10/11).
- Sanitising span text before the prompt (CM-HU-09.5) and `stale` claims (09.2/09.4).
- New migrations, an ADR, HTTP or CLI.

## Privacy and logging impact

The function processes untrusted text (model output that may echo repository content or the
question). The audit event is designed so that none of that text leaves the function: no raw output,
no Zod `message`, `keys`, `input` or `received`; only schema paths and issue codes, the byte size and
a SHA-256 (for correlation, not anonymisation). Nothing is logged by core. `/privacy-ethics-check`
was run on 2026-10-11 during refinement (PASS WITH GAPS, the gaps are requirements of this change)
and runs again over the diff.

## Capabilities

### New Capabilities

- `claims-and-typing`: claim and evidence records that mirror the database checks, the
  fact/inference typing rule, the quarantine of model output with its limits, and the audit event of
  a discarded output.

### Modified Capabilities

(none)

## Impact

- Code (core): `packages/core/src/knowledge/{claim,evidence}.ts` and `knowledge/index.ts`;
  `packages/core/src/explain/{limits,schema-violation,statement-schema,typing-rules,index}.ts` (new
  directory) and `packages/core/src/index.ts`; `packages/core/package.json` (`zod`).
- Tests: `tests/unit/knowledge/claim.spec.ts`, `tests/unit/explain/{typing-rules,statement-schema}.spec.ts`.
- Seed: `packages/core/src/knowledge` is an input of the seed's analyzer fingerprint, so
  `seeds/graph-dump.sql` is regenerated with `npm run seed:build`; only its `analyzer-fingerprint`
  header may change (design D9).
- Mutation: the new core files are inside Stryker's `mutate` (≥ 70 %).
- Docs: `docs/backend-standards.md` §1 (Zod also in core), `readme.md` §2.5 (2) and §3.2 CLAIM,
  `docs/project-context.md`, `prompts.md`.
- Linear: DIS-38; parent DIS-29; DIS-39 (consumer, holds the open question on `FACT` persistence).
