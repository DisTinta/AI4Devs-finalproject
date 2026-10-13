## Why

CM-HU-09 (DIS-29) promises: "Como desarrolladora que va a modificar un módulo, quiero preguntar en
lenguaje natural y recibir afirmaciones marcadas como hecho o inferencia con sus citas, o un `UNKNOWN`
honesto, para entender el comportamiento real sin fiarme de una explicación plausible." DIS-38 built
the parts (claim records, typing rule, quarantine) and DIS-28 the context pack, but nothing composes
them: there is no use case that answers a question, no `UNKNOWN` policy, and no writer of the `claim`
and `evidence` rows. This is DIS-39 (CM-HU-09.2): the `explain` use case, its prompt, its `UNKNOWN`
policy and the persistence of claims with their provenance, plus the three hand-offs that earlier
changes left to it (DIS-27 input validation, DIS-28 pack latency, DIS-38 `FACT` persistence and
U+0000).

The decisions below were taken by the author during the refinement of DIS-39 (Linear, `[enhanced]`,
2026-10-13) and during this propose; their rationale is transcribed from there.

- **D1, a `FACT` statement is stored as an `L2` `INFERENCE` claim** and keeps its type in
  `provenance.statementType`; the answer shows `FACT`. "Sin promoción a `L1`: `layer` indica el origen
  (`L1` = indexador determinista) y elegirla para pasar el CHECK `fact_only_from_l1` la deja sin
  sentido."
- **D5, stale claims are shown, not recomputed**: retrieval reads the persisted claims whose evidence
  overlaps the pack's spans, and a `stale` one is shown marked, with a warning, and never as `FACT`
  (`docs/ai-sessions/03-planificacion-historias-de-usuario.md:676`). Recomputation is DIS-42.
- **D6, precedence**: input validation → anchoring → evaluation mode → LLM. Without an anchor the
  answer is `no-anchor`, also in evaluation mode; with an anchor in evaluation mode it is
  `llm-required` and the pack is not built. The DIS-21 cache will sit between anchoring and the
  evaluation-mode check.
- **A valid output with no statements is `UNKNOWN` with reason `no-evidence`** (decided in this
  propose): readme §1.1, criterion 3, "**Sabe callarse.** Si no hay evidencia suficiente, responde
  `UNKNOWN` en lugar de producir una explicación plausible", and readme line 1280, "Estado `UNKNOWN`
  con mensaje explícito de que no hay evidencia suficiente, no una respuesta vacía". The model's
  answer is not returned.
- **The claim's subject is the symbol of the span of the first evidence id** the model gives (its path
  when the span has no symbol), the predicate the named constant `explains`, the object the statement
  text. Using the question as subject was rejected: "guarda la pregunta en la BD, contra la regla de
  no registrarla."
- **The question is at most 1 000 code points.**

After the spec audit (2026-10-13), the author also decided:

- **One port method, `saveClaims`, instead of `saveClaims`/`saveEvidence`**: core cannot hold a
  transaction across two port calls, so `saveEvidence` becomes a step inside the adapter's write.
- **Prior claims: the 20 most recent**, newest first.
- **A stale claim keeps `INFERENCE` or `UNKNOWN`**; only a `FACT` becomes `INFERENCE`.
- **A whitespace-only question is rejected** with an error, not answered `no-anchor`.
- **New stable codes**: `ClaimWriteFailed` (`CLAIM_WRITE_FAILED`) and `InvalidExplainRequest`
  (`INVALID_EXPLAIN_REQUEST`).
- **The model answers in the language of the question.**

After the second pass of the spec audit (2026-10-13), the author accepted:

- **With an empty list, `saveClaims` and `findClaimsOverlapping` still check the project**: an
  unknown project fails with `ProjectNotFound`, as every other read of the store.
- **A failure to obtain a database connection propagates as an error** and is not `persisted: false`;
  only a failure once the write has started becomes `ClaimWriteFailed`.

## What Changes

- **Explain use case** (`packages/core/src/explain/explain.ts`, new): `explain(deps, request)` returns
  a union discriminated by `kind`: `answered` (with `persisted: true | false`, statements, evidence,
  `priorClaims`, events) or `unknown` (with a `reason` from a closed set: `no-anchor`, `llm-required`,
  `over-budget`, `invalid-model-output`, `no-evidence`, and the PH-08 message for `llm-required`).
  One pass Context Engine → model. Core returns events and never logs.
- **Input schema** (`explain/explain-request.ts`, new): Zod over the question (1 to
  `MAX_QUESTION_CHARS` = 1 000 code points), `tokenBudget` and `hops`, checked before any store call.
- **Prompt** (`explain/prompt.ts`, new): evidence ids `E1…En` local to the prompt, one per span in
  rank order; `promptHash` is the SHA-256 of the messages.
- **`UNKNOWN` policy** (`explain/unknown-policy.ts`, new) and **events** (`explain/explain-event.ts`,
  new): `ExplainEvent = SchemaViolationEvent | ClaimsNotPersistedEvent`, separate from `AuditEvent`.
- **Store** (`StorePort`, Postgres adapter, in-memory double): `saveClaims` writes the claims of one
  answer and their evidence in one transaction, and fails with a new domain error `ClaimWriteFailed`
  that carries no database text; `findClaimsOverlapping` reads, always scoped by project, the claims
  with evidence that overlaps a span of the pack (inclusive), at most the 20 most recent.
- **Claim records** (`knowledge/claim.ts`, `knowledge/evidence.ts`, modified): `provenance.statementType`
  is required on `L2` `INFERENCE`, forbidden on `L2` `UNKNOWN` and on `L1`; U+0000 is rejected in
  every text field, so the known exception of `claims-and-typing` is removed.
- **Quarantine** (`explain/statement-schema.ts`, modified): U+0000 in `answer`, `text` or an evidence
  id discards the output (`invalid_shape`).
- **Context pack** (`context/context-pack.ts`, modified): accepts anchors already computed, so
  `explain` anchors once; reads every file of the pack in one batched read.
- **Source tree** (`SourceTreePort`, git adapter, in-memory double): `readFilesAt(root, commit, paths)`,
  one repository check, one commit check, one tree listing, one `cat-file --batch-check` over the
  requested objects and at most one `cat-file --batch` per call, whatever the number of paths, plus
  one process only when git reports a damaged requested object. Q1's latency on acme-shop is measured before and after.
- **ADR** on D1 with the rejected alternative (promotion to `L1`).

## Non-goals

- Citation verification (`verification` stays `none`; DIS-68), and verifying a `persisted: false`
  answer, which has no evidence rows.
- `confidence` (stays `null`) and `query_log` rows (DIS-74): until then the daily budget does not see
  the spend of `explain`.
- Recomputing `stale` claims (DIS-42), the cache (DIS-21), prompt sanitisation (DIS-41).
- The CLI `ask` command (DIS-40), HTTP (CM-HU-12), a multi-pass loop (PH-10).
- A cap on the files a pack reads: after the batched read the author reads the measured median of Q1
  and decides whether to cap; the decision and its threshold go to `design.md`.
- Claims whose evidence lies outside the pack: they are neither searched nor shown.
- A migration: the `statementType` rule is checked by the records, not by the database.

## Privacy and logging impact

The prompt carries repository content (already redacted by the pack) and the question; the model
output is untrusted. Neither the question nor any span text nor any model output is logged by core:
`explain` returns events, and both events carry no content (the schema-violation event of DIS-38,
and `claims_not_persisted` with only a closed `code`, because the `detail` of a Postgres error can
quote an excerpt). The question is never stored: no claim column holds it. `/privacy-ethics-check`
runs over the diff.

## Capabilities

### New Capabilities

- `explain`: the explain use case — input, precedence and `UNKNOWN` policy, prompt and evidence ids,
  typing and persistence of statements, the answer shape with `persisted`, prior claims and their
  displayed type, events.

### Modified Capabilities

- `claims-and-typing`: claim records gain the `statementType` rule and reject U+0000 (the known
  exception is removed); the quarantine rejects U+0000.
- `graph-store`: claim write (atomic per answer, `ClaimWriteFailed`) and claim retrieval by
  overlapping span.
- `context-engine`: the context pack accepts precomputed anchors and reads its files in one batch.
- `repository-indexing`: the source tree contract gains `readFilesAt`.

## Impact

- Code (core): `packages/core/src/explain/{explain,explain-request,explain-answer,prompt,claim-items,prior-claims,unknown-policy,explain-event,limits,statement-schema,index}.ts`,
  `packages/core/src/knowledge/{claim,evidence,stored-claim,errors,index}.ts`,
  `packages/core/src/context/context-pack.ts`, `packages/core/src/ports/{StorePort,SourceTreePort}.ts`.
- Code (adapters): `packages/adapters/store-postgres/src/{postgres-store,queries}.ts`,
  `packages/adapters/git/src/git-source-tree.ts`. No migration.
- Test doubles: `tests/support/in-memory-store.ts` (claim write with failure injection, overlap read),
  `tests/support/in-memory-source-tree.ts` (`readFilesAt`).
- Tests: `tests/unit/explain/*` (including the existing `statement-schema.spec.ts`),
  `tests/unit/knowledge/{claim,errors}.spec.ts`, `tests/unit/context/context-pack.spec.ts`,
  `tests/unit/store/in-memory-store.spec.ts`, `tests/unit/git/` (the unsized tree parser),
  `tests/integration/explain/explain.spec.ts`, `tests/integration/store/claims-write.spec.ts`,
  `tests/integration/git/git-source-tree.spec.ts`; the typed `SourceTreePort` doubles of
  `tests/unit/index/index-repository.spec.ts` and `tests/unit/cli/{seed-build,index-command}.spec.ts`.
- Seed: `packages/core/src/knowledge` is an input of the seed fingerprint → `npm run seed:build` with
  its diff reviewed.
- Docs: ADR in `docs/adr/`, `readme.md` §3.2 and §4, `docs/project-context.md`, `prompts.md`.
- Linear: DIS-39; parent DIS-29; consumers DIS-40, DIS-41, DIS-42, DIS-21, DIS-68, DIS-74.
