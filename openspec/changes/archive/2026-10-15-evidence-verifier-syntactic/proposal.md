## Why

CM-HU-10 (DIS-56) asks that every citation of an explanation be "comprobada mecánicamente antes de
mostrármela, para que una afirmación con cita bonita pero falsa no llegue nunca como hecho". Today no
citation is checked: `explain` (`packages/core/src/explain/explain.ts`) goes from `typeStatements`
straight to `toClaimItems`, every statement is answered with `verification: 'none'` (the comment in
`explain-answer.ts` reads "citations are not verified yet (DIS-68)"), and every `evidence` row is
written with `verification = 'none'`. The value `broken` exists in the schema (`0002_history-claims`)
but no code assigns it.

This is DIS-68 (CM-HU-10.1), the syntactic half of the verifier; its user story reads: "Como
desarrolladora que lee una explicación de CODEMIND, quiero que cada cita se compruebe mecánicamente
contra el código indexado antes de mostrármela, y que la afirmación que solo se apoya en citas que no
existen desaparezca, para que ninguna cita bien formada pero falsa llegue a la respuesta ni a la base
de datos, y que cada cita rota quede registrada como fallo del sistema."

The decisions below were taken by the author while refining DIS-68 (Linear, `[enhanced]`,
2026-10-14). D1–D4 are closed; D5–D7 are the proposed defaults the ticket leaves open to review in the
spec audit.

- **D1, reference commit `pack.commit`**: each citation is checked against "el código que la
  respuesta dice haber leído (el commit del pack), no contra el `indexedCommit` del momento de
  verificar". A re-index during the answer "sigue siendo `stale` (DIS-39), no `broken`". The function
  takes the commit as a parameter "para que DIS-42 (09.4) la reutilice con el commit actual".
- **D2, a broken citation is neither stored nor shown**: a statement with broken and valid citations
  keeps only the valid ones and is retyped with them; the broken one only leaves the `evidence_broken`
  event. Recorded in `docs/adr/20261014-broken-citations-not-stored.md`, which departs from readme
  task 6 and travels in this change's PR.
- **D3, `FACT` with only `cited` stays `FACT` until DIS-70**: "DIS-68 no cambia la regla de tipado".
- **D4, no statement left: `UNKNOWN (broken-evidence)`**, a new reason at the end of
  `UNKNOWN_REASONS`, carrying the sanitisation events and the `evidence_broken` events; nothing is
  stored.
- **D5 (default), the excerpt matching rule**: the excerpt matches when it equals the text the
  pipeline produces for that range (content at `pack.commit` → `redactSecrets` → lines → `startLine..
  endLine` joined by `\n`), adjusted for a span the sanitisation cut; exact string comparison, no
  whitespace normalisation. Refined in design V4, confirmed by the author after the spec audit: a
  line-cut excerpt must be exactly the first `MAX_EVIDENCE_TEXT_CHARS` code points of its line.
- **D6 (default), the `evidence_broken` event**: `{ type: 'evidence_broken', evidenceId, path,
  startLine, endLine, reason }`, `reason` from the closed set `file-missing`, `range-out-of-file`,
  `excerpt-mismatch`; never text, excerpt or hash; one per broken prompt id; the CLI writes it with
  `logger.error`.
- **D7 (default), `verification` of a statement**: `AnswerStatement.verification` becomes `'cited'`
  and the `evidence` rows are written with `verification = 'cited'`.

## What Changes

- New module `packages/core/src/verify/` (readme §2.3 `core/verify`):
  - `syntactic.ts`: `verifyCitations(source, root, commit, citations)` reads the distinct cited paths
    at `commit` in one batched read through `SourceTreePort` and gives one verdict per citation:
    `cited`, or `broken` with reason `file-missing`, `range-out-of-file` or `excerpt-mismatch`. When the
    batch rejects with `SourceUnavailable('missing')`, it reads each path alone to tell which ones are
    missing; any other failure propagates.
  - `policy.ts`: drops the broken citations of each typed statement, drops a statement left with none,
    and retypes the rest with `typeStatement` over their remaining spans.
  - `verify-answer.ts`: runs both for `explain` and builds the `evidence_broken` events in prompt-id
    order; the seam where DIS-70 adds the semantic check.
- The text of a cited range is computed by one shared function in `packages/core/src/context/`,
  extracted from `context-pack.ts` (redact, split into lines, cut), so the pack and the verifier cannot
  drift apart.
- An `ok` context pack also carries `root`, the repository root its files were read from, so the
  verifier reads the same repository the pack did without reading the project again.
- `explain` verifies the cited spans after typing and before storing (D1, D2), answers
  `UNKNOWN (broken-evidence)` when no statement is left (D4), and stores and answers only the
  verified statements and their remaining citations, with `verification: 'cited'` (D7).
- New event `evidence_broken` in `ExplainEvent` (D6), after the sanitisation events and before
  `claims_not_persisted`.
- `ask` writes `evidence_broken` to stderr at level `error`; every other event stays at `info`.
- Documentation: `readme.md` (syntactic verifier step), `docs/project-context.md` (the verification
  re-reads git at `pack.commit`; the source double can serve another content to the second read), and
  the ADR of D2 with its index entry.

### Non-goals

- Semantic verification (entailment), `LLM_MODEL_VERIFY`, the per-pair cache, `usage.verification`
  and the rule "`FACT` requires `entailed`": DIS-70.
- Re-verifying prior claims or `stale` claims when they are read back: DIS-42 (09.4), which will reuse
  `verifyCitations` with the current commit.
- Storing or showing `broken` citations (D2), and persisting audit events (`saveAuditEvents`,
  `AuditPort`, PH-09).
- `StorePort.readSpan`, or storing file contents in the database (ADR 20261011): the parent's
  `readSpan` is replaced by `SourceTreePort.readFilesAt`/`readFileAt`, as that ADR already decided.
- Showing a verification mark in `ask`'s readable output (DIS-40 left it out) or in the web/API
  (CM-HU-12).
- Splitting the answer into atomic statements (readme, task 1): statements are verified as the model
  returns them.
- Checking the pack's spans that no statement cites: only cited spans are verified.
- Evaluation mode: it answers `llm-required` before the pack, so verification never runs there
  (parent DIS-56's evaluation-mode criterion needs nothing in DIS-68).

## Capabilities

### New Capabilities

- `evidence-verification`: the syntactic check of a batch of citations against the code of one
  commit (D1, D5, D6 reasons), the expected text of a cited range, and the output policy over typed
  statements (D2, D3).

### Modified Capabilities

- `explain`: "Precedence and UNKNOWN answers" (a verification step and the reason `broken-evidence`),
  "Answer with typed statements" (only verified statements and citations, `verification: 'cited'`),
  "Persistence failure" (an unsaved answer holds only the remaining ids, and its events order), and
  "Explain events and logging" (the `evidence_broken` event and its place in the order).
- `context-engine`: "Context pack" (an `ok` pack carries `root`).
- `cli-ask`: "Ask answer output" (`evidence_broken` at level `error`) and "Ask UNKNOWN output" (the
  `broken-evidence` reason).

## Impact

- Code: `packages/core/src/verify/{syntactic,policy,verify-answer,index}.ts` (new) and its export from
  `packages/core/src/index.ts`; `packages/core/src/context/` (new shared span-text function,
  `context-pack.ts` uses it and carries `root`); `packages/core/src/explain/{explain,claim-items,
  explain-answer,explain-event,unknown-policy}.ts`; `packages/cli/src/commands/ask.ts`. No new port,
  adapter, SQL, migration, API or web change; `StorePort` and `SourceTreePort` do not change.
- Tests: `tests/unit/verify/{syntactic,policy,verify-answer}.spec.ts` (new); a new
  `tests/unit/explain/explain-verification.spec.ts`; `tests/support/in-memory-source-tree.ts` gains a
  way to serve another content to a later read; the existing tests that expect `verification: 'none'`
  change to `'cited'` because the spec changes (`tests/unit/explain/explain.spec.ts`,
  `tests/integration/explain/explain.spec.ts`); `tests/unit/cli/ask-command.spec.ts` (level `error`).
- Architecture check: `.dependency-cruiser.cjs` gains a rule forbidding I/O imports in
  `packages/core/src/verify/` (the module reads only through the port).
- Performance: one more batched read per answered question (each cited path once, at most six git
  processes by the port's contract); no model call.
- Database: no schema change. Rows written after the change carry `verification = 'cited'`; rows
  written before keep `none`. `broken` is still never written (D2).
- Privacy and security: no personal data is added. `evidence_broken` carries an id, a path, line
  numbers and a closed-set reason, never file content, excerpt or hash. The verification is domain
  logic (`docs/backend-standards.md` §3); the adapter only reads.
