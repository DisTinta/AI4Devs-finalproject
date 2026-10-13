## Context

See `proposal.md` → Why for the motivation and the author's decisions. The pieces this change
composes already exist:

- `buildContextPack` (`packages/core/src/context/context-pack.ts`, DIS-28) anchors, expands, ranks,
  reads each candidate's file with one `SourceTreePort.readFileAt` per distinct file, redacts, cuts
  and fits. `anchor` (`context/anchor.ts`) is exported. A Q1 pack on acme-shop reads 29 files with
  about 145 git processes (five per `readFileAt`: two repository checks in `assertRepositoryRoot`,
  `cat-file --batch-check`, `ls-tree`, `cat-file blob`) and takes about 10.5 s on Windows (DIS-28
  hand-off).
- `parseModelOutput` and `typeStatement` (`packages/core/src/explain/`, DIS-38); `claimSchema`,
  `evidenceSchema`, `provenanceSchema` (`packages/core/src/knowledge/{claim,evidence}.ts`), which
  today accept U+0000 and have no statement type.
- `LlmPort` with `mode` (`live` / `evaluation`), `complete({ messages, purpose })` and
  `CompletionResult.model`; `withDailyBudget` and `BudgetExhausted` (DIS-17, DIS-18).
- `StorePort` has no claim operation. The Postgres adapter's `atomically` gives a transaction on a
  pool and a `SAVEPOINT store_write` on a caller-owned transaction (DIS-23).
- `readFiles` in `packages/adapters/git/src/git-source-tree.ts` already reads a whole tree with a
  fixed number of processes: the repository checks, one `ls-tree -r -z -l --full-tree` and at most
  one `cat-file --batch` (`readBlobs`).
- Doubles: `tests/support/in-memory-store.ts` (reads only; writes throw) and
  `tests/support/in-memory-source-tree.ts` (`readFileAt` only). `tests/unit/index/index-repository.spec.ts`
  has its own inline `SourceTreePort` double.
- The seed's analyzer fingerprint reads `packages/core/src/knowledge`, `packages/adapters/git/src` and
  `packages/adapters/store-postgres/src` (`packages/cli/src/seed/fingerprint.ts`): all three change.

## Goals / Non-Goals

**Goals:**

- One use case in core that follows the precedence of the `explain` spec exactly, with every branch
  observable through call counts on the doubles.
- No text from the question, a span, the model or the database in any event or error.
- A pack's file reads in a constant number of git processes, measured before and after on Q1.

**Non-Goals:**

- A prompt tuned for quality: the prompt states the contract (JSON shape, cite only given ids) and
  nothing more; sanitisation is DIS-41.
- A unit-of-work port: the store's write is one method (D7).
- Changing the database schema.

## Decisions

### D1 — A `FACT` statement is stored as `L2` `INFERENCE` with `provenance.statementType`

Author decision (proposal → Why). Recorded in an ADR, `docs/adr/20261013-fact-statements-stored-as-l2-inference.md`,
with the rejected alternative (promotion to `L1`) and the author's reason transcribed. It qualifies
under `docs/documentation-standards.md` §4: a reader of the `claim` table would ask why no `L2` row is
ever `FACT`; it touches core records, the store and every later reader of claims (DIS-42, DIS-21,
DIS-68, DIS-71); reverting it means migrating stored provenances.

### D2 — Three claim variants, two provenance shapes

`claimSchema` becomes three strict variants: `L1` (any type, optional provenance without
`statementType`), `L2` + `INFERENCE` (provenance with `statementType` required) and `L2` + `UNKNOWN`
(provenance without it). `provenanceSchema` keeps its shape (no `statementType`, so its existing
scenario is unchanged) and a second schema extends it with `statementType: z.literal(['FACT',
'INFERENCE'])`. Zod 4 `z.discriminatedUnion` needs unique discriminator values; whether it accepts a
nested discriminated union on `type` inside the `L2` branch is checked with Context7 at apply time;
if not, `z.union` of the three strict objects. The inferred `Claim` type must keep `L2` + `FACT`
unrepresentable (the existing `@ts-expect-error` test) and make `statementType` required on the
`L2` + `INFERENCE` branch at compile time.

Checked at apply time (Context7, `/colinhacks/zod`, "Nest discriminated unions"; Zod 4.6.5): an
option of `z.discriminatedUnion` may itself be a `z.discriminatedUnion` on another key, and the outer
union routes by the values the inner one advertises (`propValues` merged from its options). A
scratch run confirmed it: `L2` + `INFERENCE` with the statement type parses, without it fails, `L2` +
`UNKNOWN` without it parses, `L2` + `FACT` fails on `type`. Chosen form: `z.discriminatedUnion('layer',
[L1, z.discriminatedUnion('type', [L2 INFERENCE, L2 UNKNOWN])])`.

Alternative rejected: a `superRefine` on one `L2` object. It would keep one shape but lose the
compile-time guarantee and produce a `custom` issue instead of a structural one.

### D3 — U+0000 is rejected by one shared string check

A single `textWithoutNul` refinement (in `knowledge/`, exported for `explain/`) is used by every free
text of the records (subject, predicate, object, excerpt, model name) and of the quarantine (answer,
statement text, evidence id). In the quarantine its failure is a `custom` issue, so the subcode is
`invalid_shape` (the existing `shapeSubcode` rule: not only `too_small` on evidence ids, not only
`too_big`). Rejected: stripping the character (it rewrites untrusted output and stored evidence
silently).

### D4 — Explain is one function over injected ports, with a fixed pipeline

`explain(dependencies, request)` in `explain/explain.ts`; dependencies are `{ store, source, llm,
workspaceRoot, now }`. Pipeline, one function per step so each is testable and each `UNKNOWN` exit
is a single `return`:

1. `parseExplainRequest` (`explain/explain-request.ts`): `z.strictObject({ projectId: z.string(),
   question: z.string().refine(non-blank).max(MAX_QUESTION_CHARS), tokenBudget, hops })` — Zod
   counts code points (DIS-38 D6); the ranges come from `TOKEN_BUDGET_MIN/MAX` and `MAX_HOPS`. The
   first issue names the error's `field`: its first path segment when it is `projectId`, `question`,
   `tokenBudget` or `hops`, and `request` otherwise (a non-object request, or `unrecognized_keys`,
   whose key names are never copied). `EXPLAIN_REQUEST_FIELDS` is the closed set; the value never
   enters the error. A blank question is rejected (author decision, 2026-10-13), although anchoring
   would answer `no-anchor`. Then the workspace-root check (`RangeError`, as the pack's).
2. `anchor(store, projectId, question)`; `[]` → `unknown('no-anchor')`.
3. `llm.mode === 'evaluation'` → `unknown('llm-required')` with the PH-08 message. A comment marks
   where DIS-21's cache lookup goes, before this check.
4. `buildContextPack(deps, { …, anchors })` (D9); `status: 'empty'` → `unknown('over-budget')`.
5. `store.findClaimsOverlapping(projectId, pack.spans)` → prior claims (D11).
6. `buildPrompt(question, pack.spans)` (D5) → `llm.complete({ messages, purpose: 'answer' })`.
7. `parseModelOutput(result.text, knownIds)`; failure → `unknown('invalid-model-output')` with the
   event; `statements.length === 0` → `unknown('no-evidence')`.
8. Type (`typeStatement` over the cited spans), build the claim items (D6), `store.saveClaims`;
   `ClaimWriteFailed` → `persisted: false` (D8).

`MAX_QUESTION_CHARS = 1_000` lives in `explain/limits.ts` with the other limits. The `UNKNOWN`
reasons are one `as const` array in `explain/unknown-policy.ts` (`UNKNOWN_REASONS`), with the
`unknown(reason, events?)` constructor and the `LLM_REQUIRED_MESSAGE` constant. The answer types
(`ExplainAnswer = AnsweredExplain | UnknownExplain`, discriminated by `kind`; `AnsweredExplain`
itself a union on `persisted`) live in `explain/explain-answer.ts`.

Alternative rejected: an `Explainer` class. Every other use case in core (`indexRepository`,
`buildContextPack`) is a function over a dependencies object.

### D5 — Prompt: two messages, spans as JSON data, hash of the serialised messages

`explain/prompt.ts` exports `buildPrompt(question, spans)` → `{ messages, evidenceIds, promptHash }`.

- Ids: `E1…En` in the pack's span order (rank order); `evidenceIds` maps each id to its span.
- `system` message: a fixed English instruction — answer only from the evidence given, answer in the
  language of the question (author decision, 2026-10-13: a Spanish question must not get an English
  answer), return only the JSON object `{ "answer": string, "statements": [{ "text": string,
  "evidenceIds": string[] }] }`, cite only the given ids, every statement cites at least one, no other
  field. The instruction is an exported constant, so the test asserts it was sent. Two more lines of
  the contract were added at apply time and are part of the hashed prompt (verify-against-spec,
  2026-10-13): each statement is one checkable sentence (readme §2.5, `MAX_STATEMENT_CHARS`), and when
  the evidence does not answer the question the model returns an empty `statements` list — the
  `no-evidence` path, instead of a plausible answer.
- `user` message: `JSON.stringify({ question, evidence: [{ id, path, startLine, endLine, text }] })`.
  JSON gives the span text an unambiguous frame without inventing delimiters (DIS-41 adds the
  sanitisation on top).
- `promptHash` = SHA-256 (lowercase hex, `node:crypto`) of the UTF-8 bytes of
  `JSON.stringify(messages)`: what is hashed is exactly what is sent.

The answer's `evidence` list: with `persisted: true`, one entry per citation (statement order, then
citation order), each with its stored row id; with `persisted: false`, one entry per distinct cited
prompt id, in first-citation order (spec "Persistence failure").

### D6 — Claim items from statements

For each statement: its cited spans are `evidenceIds.map(id => spanOf[id])` in the model's order;
`type = typeStatement(spans)`; the claim is `{ projectId, subject, predicate:
CLAIM_PREDICATE_EXPLAINS, object: text, layer: 'L2', type: 'INFERENCE', status: 'current',
confidence: null, provenance: { model: result.model, promptHash, inputSpans, createdAt:
now().toISOString(), statementType: type } }`, where `subject = spans[0].symbol?.name ??
spans[0].path` (author decision) and `inputSpans` are all the pack's spans as `{ fileId, startLine,
endLine }`. Evidence: one per cited span, `{ fileId, startLine, endLine, verification: 'none',
excerpt: span.text }`. The mapping is a pure function in `explain/claim-items.ts`, which also
exports `CLAIM_PREDICATE_EXPLAINS = 'explains'`.

### D7 — The store writes one answer in one call; `saveEvidence` is a step, not a port method

The ticket names `saveClaims` / `saveEvidence`. Core cannot hold a transaction across two port
calls, and two calls cannot be atomic without a unit-of-work port, so the port has one method (the
author accepted it on 2026-10-13),
`saveClaims(projectId, items: { claim: Claim; evidence: Evidence[] }[]): Promise<SavedClaim[]>`. In
the Postgres adapter it runs inside `atomically` as two steps: insert the claims, then insert the
evidence (the `saveEvidence` step, where the failure of the atomicity scenario is injected).

- Validation order: well-formed `projectId` first (`isWellFormedId` → `ProjectNotFound`, no
  statement); then `claimSchema` / `evidenceSchema` per record and `claim.projectId` equal to
  `projectId`, both lower-cased (a well-formed id is accepted in any letter case, main spec
  "Project lookup"; `InvalidStoreQuery` naming `claims`, fixed message, no statement); then, inside
  the transaction, one query that the project exists and that every cited file id belongs to it
  (`ProjectNotFound` / `InvalidStoreQuery` naming `claims`). An item with an empty evidence list is
  rejected with the schemas (`InvalidStoreQuery` naming `claims`). An empty list still runs the
  project check — `SELECT_PROJECT` through `runProjectQuery`, outside `atomically` (no `BEGIN`, no
  `SAVEPOINT`), as `neighbors` does with no seed — and resolves `[]` without writing: an unknown
  project is never an empty result (main spec "Project lookup").
- Ids are generated in the adapter with `crypto.randomUUID()`, so both inserts are one statement each
  (`unnest` of arrays) and the returned ids map to the input order without relying on the order of
  `RETURNING`. The claim insert sets `created_at = clock_timestamp()`, not the column default
  `now()`: `now()` is the transaction start, so every claim written inside one harness transaction
  (or one long caller transaction) would share it and "most recent" would be undefined.
- The `ClaimWriteFailed` mapping lives inside `atomically`, which gains an optional `mapWriteError`
  argument. `atomically` obtains the client itself (`pool.connect()`), so a wrapper around it could
  not tell a connect failure from a write failure. The mapper is applied only once the write has
  started: on a pool, after `connect()` succeeded (from `BEGIN` to `COMMIT`, the rollback and the
  release included); on a caller-owned transaction, once `SAVEPOINT store_write` has succeeded (the
  rollback to it and `RELEASE` included). A failing `SAVEPOINT` (a client outside a transaction
  block, `25P01`, or a caller transaction already aborted, `25P02`) is a programming error of the
  caller and propagates unchanged, not as `ClaimWriteFailed`. A failure of `pool.connect()` propagates unchanged (scenario "A store
  that cannot give a connection fails with its own error": an ended pool). Domain errors raised
  inside pass through the mapper unchanged; every other error becomes `new ClaimWriteFailed()`
  (`knowledge/errors.ts`, code `CLAIM_WRITE_FAILED`, no `cause`, a fixed message): `pg` errors carry
  `detail`/`where` that can quote an excerpt. `saveGraph` and `createProject` pass no mapper and keep
  their behaviour.
- The ownership check locks the project row `FOR SHARE` (added at apply time, verify-against-spec
  2026-10-13): a concurrent `saveGraph` of the same project, which locks it `FOR UPDATE`, waits until
  the claims are written, so a file checked as owned cannot be deleted between the check and the
  evidence insert. Claims of different projects do not wait on each other.
- A failed rollback is mapped too: on a pool, when the write first raised a domain error and the
  `ROLLBACK` then fails, the call rejects with `ClaimWriteFailed` (the rollback failure is the error
  then), as it already did on a caller-owned transaction (verify-against-spec, 2026-10-13).
- `StoreQueryArgument` gains `'claims'` and `'spans'`, and the JSDoc of `InvalidStoreQuery` and
  `StoreQueryArgument` stops saying "a read" (they now also cover a write whose ownership check sends
  one query). `SavedClaim = { claimId; evidenceIds }`.

Alternative rejected: `saveClaims` then `saveEvidence` as two port methods with the caller passing a
transaction — it leaks persistence into core.

### D8 — `persisted: false` only for `ClaimWriteFailed`

`explain` catches only `ClaimWriteFailed` around `saveClaims`. It then answers with the prompt's ids
as evidence ids and evidence entry ids, and one `ClaimsNotPersistedEvent = { type:
'claims_not_persisted', code: 'store-write-failed' }` (`CLAIMS_NOT_PERSISTED_CODES` as an `as const`
array) in `explain/explain-event.ts`, with `ExplainEvent = SchemaViolationEvent |
ClaimsNotPersistedEvent`. `InvalidStoreQuery` there means explain built an invalid record — a bug, so
it propagates; `ProjectNotFound` means the project vanished mid-answer and propagates too.

### D9 — The pack accepts anchors and reads its files in one batch

`ContextPackRequest` gains `anchors?: StoredSymbol[]`. When given, `buildContextPack` checks each has
a well-formed `fileId` with `z.uuid()`, as the claim records do (`RangeError` naming `anchors`, before
any store call; core cannot import the adapter's id regex), and skips `anchor()`. After ranking, it collects the distinct paths of all
candidates and calls `source.readFilesAt(root, commit, paths)` once, then redacts each file and cuts
the spans as today. Order of failures is preserved: the first unreadable path in rank order rejects,
as the per-file loop did.

### D10 — `readFilesAt`: whole-tree listing, one `cat-file --batch`

`readFilesAt(root, commit, paths)`:

1. Check the commit first, then every path (`RangeError`), before any process; `[]` with a valid
   commit resolves `[]` before any process.
2. `assertRepositoryRoot(root)` once (→ `not-a-repository` naming the first path), `commitExists`
   once (→ `missing` naming the first path).
3. One `ls-tree -r -z --full-tree <commit>^{commit}` without `-l` and without pathspecs, parsed into a
   map by path (mode, type and object id) by a new parser for the unsized record
   (`<mode> SP <type> SP <oid> TAB <path> NUL`, unit-tested next to `parseTree`). `parseTree` assumes
   the `-l` format (without it `size` is `undefined` and `missing` is `true` for every entry), so it
   is not reused here. Listing the whole tree keeps the command line bounded (Windows
   caps it near 32 K characters) whatever the number of paths; without `-l` git does not size every
   blob of the repository, so the cost of the listing does not include reading other objects, and an
   unreadable object elsewhere in the tree prints nothing that fails the call.
4. One `cat-file --batch-check` over the object ids of the requested regular files only, parsed as
   `<oid> blob <size>` or `<oid> missing`: each requested entry takes its `size` from that answer, so
   `readBlobs`'s header check (`${oid} blob ${size}`) keeps working. A requested object git reports
   `missing` propagates git's error (`missingObjectError`) at this step, before any per-path reason
   (spec: "before any of these per-path reasons is reported").
5. Entries within `MAX_BLOB_BYTES` are read with the existing `readBlobs` (one `cat-file --batch`,
   deduplicated object ids); no process when none is within the limit.
6. Scan `paths` in order and reject at the first failure (`missing` for an absent or non-regular
   entry, `too-large`, `binary-content`); otherwise resolve the decoded contents in order.

Processes per call: 2 (repository checks) + 1 (`commitExists`) + 1 (`ls-tree`) + 1 (`--batch-check`)
+ at most 1 (`cat-file --batch`) = at most 6, whatever the number of paths, plus the one process of
`missingObjectError` when a requested object is damaged. `readFileAt` keeps its own
implementation (no behaviour change).

Measurement (task group 39c): a scratchpad `tsx` script builds Q1's pack over a temporary copy of
acme-shop indexed in the local database, with `gitSourceTreeWith` wrapping `spawnReaderGit` to count
processes, and times it, before and after D9–D10. The index is written inside a transaction the
script rolls back (store on `{ transaction }`), so the local database ends as it started.
Processes are counted by wrapping `spawnReaderGit`, plus 2 for every `assertRepositoryRoot` call
(it runs through simple-git's `readerGit`, which the wrapper does not see), so the BEFORE figure is
comparable to DIS-28's ≈145. Result in a
`reports/` file. After the AFTER measurement the author reads the median and decides whether to cap
the files a pack reads; the threshold she uses and the decision are recorded here (Follow-ups).

### D11 — Prior claims: one overlap query, display rule in core

`findClaimsOverlapping(projectId, spans)` returns `StoredClaim[]` (`knowledge/stored-claim.ts`:
claim columns plus `id` and `evidence: StoredEvidence[]` with `path`). In Postgres, one statement
that starts from the `project` row (`WHERE p.id = $1`) and LEFT JOINs a subquery of the matched
claims: `claim c` with `c.project_id = $1` first, then `EXISTS` an evidence of the claim on a span's
file with `e.start_line <= span.end AND e.end_line >= span.start` (spans validated with
`inputSpanSchema` before querying, then passed as three arrays and `unnest`ed), ordered by `c.created_at DESC, c.id DESC` and limited to `MAX_PRIOR_CLAIMS` (20,
exported from `knowledge/stored-claim.ts`; author decision 2026-10-13, "los 20 más recientes"), each
with all its evidence aggregated (`json_agg` ordered by `start_line, id`, joined to `file` for the
path). Zero rows means an unknown project (`ProjectNotFound`); one row with no claim means none
matched. So `runProjectQuery` keeps its meaning and is reusable. An empty span list still runs the
project check (no claim subquery) and resolves `[]`. The in-memory double does the same
in TypeScript. The claims of one answer are written by one statement, so their `clock_timestamp()`
values are close but their relative order is not the order of the statements.

`explain/prior-claims.ts` maps each stored claim to `PriorClaim { id, text: object, type, status,
evidence, warning? }` with `displayType(claim)`: `provenance?.statementType ?? claim.type`, and when
`status === 'stale'` a `FACT` becomes `INFERENCE` (a stale `INFERENCE` or `UNKNOWN` keeps its type:
author decision 2026-10-13) and `warning: 'stale-evidence'` is set.

### D12 — The in-memory store gains the claim operations and a failure hook

`createInMemoryStore({ projects, failClaimWrite? })`, where `failClaimWrite = { claim: number;
evidence: number }` (zero-based) makes `saveClaims` reject with `ClaimWriteFailed` when it reaches
that evidence, after validating and before committing anything to its arrays. `calls` gains
`saveClaims` and `findClaimsOverlapping`. The double stamps each saved claim with a strictly
increasing write instant (a counter on top of a fixed base, never `Date.now()`, which ties within a
millisecond and would make "newest first" fall back to random ids) that always starts after the
latest `createdAt` the seeding helper received, compares project ids
lower-cased, and checks the project also for empty lists. A helper seeds stored claims directly
(with `status`, `createdAt`, provenance and evidence) without the ownership check, so a test can
seed a claim of one project whose evidence cites a file of another. `in-memory-source-tree.ts` gains `readFilesAt`
(recorded in `calls.readFilesAt` and `batchReads`). Three test files type a `SourceTreePort` literal
and gain a throwing `readFilesAt`: `tests/unit/index/index-repository.spec.ts`,
`tests/unit/cli/seed-build.spec.ts` and `tests/unit/cli/index-command.spec.ts`.

### D13 — Test placement

- Unit, with the doubles and `tests/support/acme-shop-graph.ts`: every `explain` scenario except the
  three over a real index; the `context-engine` and `claims-and-typing` scenarios; the in-memory
  variants of `graph-store`.
- Integration over Postgres (`describeWithDatabase`, `useTransactionPerTest`):
  `tests/integration/store/claims-write.spec.ts` (claim write and overlap scenarios; the evidence
  failure is injected with a trigger created inside the harness transaction that raises on the
  sentinel excerpt with a `DETAIL` quoting it, rolled back with the test; every trigger test runs
  `SET LOCAL lock_timeout = '10s'` first: `CREATE TRIGGER` waits for the parallel tests holding
  `ROW EXCLUSIVE` on `evidence`, each a few hundred milliseconds, so 10 s never trips on a healthy run
  and still turns a stuck lock into a failure instead of a hang); `tests/integration/explain/explain.spec.ts`
  ("An answer with evidence is typed, stored and returned", "A fact is stored as an inferred claim
  that keeps its type", "A failed write over the database still answers without leaking"),
  following `tests/integration/context/context-pack.spec.ts` (temporary copy of acme-shop, history
  built with `buildOne`, real adapters) with a scripted `LlmPort` that reads the ids from the prompt;
  the failed-write scenario uses a trigger that raises on **every** `evidence` insert, with a
  `DETAIL` quoting `NEW.excerpt` and a sentinel (a real span's excerpt never holds the store test's
  sentinel), and asserts the serialised events hold neither the sentinel, nor any excerpt, nor the
  question.
- "The subject of a claim is the symbol of its first cited span" runs on the pure `claim-items`
  mapping with hand-built spans: on Q1 the method span of `PriceCalculator::compute` is absorbed by
  its class span, so `explain` cannot produce that `GIVEN`.
- Integration over git: `readFilesAt` scenarios in `tests/integration/git/git-source-tree.spec.ts`.

### D14 — Seed regeneration after the last fingerprint change

`knowledge/`, `adapters/git/src` and `adapters/store-postgres/src` are fingerprint inputs. Only the
`analyzer-fingerprint` header of `seeds/graph-dump.sql` may change; `npm run seed:build` runs after
the last commit that touches a fingerprint input (reports, docs and the archive may follow it) and
its diff is reviewed (DIS-38 D9 procedure).

## Risks / Trade-offs

- [A cited file whose committed text holds U+0000] → cannot happen: indexing skips any file whose
  content holds NUL as `binary-content` (`openspec/specs/repository-indexing/spec.md`, "Input hygiene
  before analysis"), so it is never a node, and the pack reads only files of nodes at the indexed
  commit.
- [`ls-tree -r` of the whole tree per pack] → cost grows with the number of entries of the
  repository, not with the pack; without `-l` no blob is read to list it. Measured in 39c on
  acme-shop only, which does not show the cost on a large repository.
- [Model name empty in `CompletionResult`] → `provenanceSchema` rejects it, `saveClaims` raises
  `InvalidStoreQuery` and explain fails; the live adapter always reports a model.
- [Prior claims read on every live answer] → one indexed query (`evidence_file_id_idx`), at most
  `MAX_PRIOR_CLAIMS` (20) claims returned (author decision, 2026-10-13), satisfying "every listing is
  paginated" (`docs/backend-standards.md` §3) with a fixed first page.
- [`BudgetExhausted` propagates instead of degrading to cache-only] → `docs/backend-standards.md` §8
  says the use case degrades to cache-only with a warning; there is no cache until DIS-21, which adds
  the degradation. Until then the transport maps the error to `429` (CM-HU-12, DIS-40).
- [`statementType` rule has no database `CHECK`] → `docs/backend-standards.md` §5 asks for one; the
  author decided "sin migración; la BD no lo comprueba". The ADR of D1 records it as an accepted
  exception.
- [The test triggers in `claims-write.spec.ts` and `explain.spec.ts` lock `evidence` (`CREATE
  TRIGGER` takes SHARE ROW EXCLUSIVE) until their test rolls back] → `history-claims-constraints`,
  `graph-write`, `indexes-stale` and `seed-load` insert into `evidence` and, running in parallel,
  wait at most one test. Each trigger test sets `SET LOCAL lock_timeout = '10s'` (D13) so a stuck
  lock fails instead of hanging the suite.
- [`db:seed` / `make up` replace every sample project] → the claims `explain` stored for a sample
  project (acme-shop) are deleted with it by the cascade; documented in `docs/project-context.md`.
- [`explain` makes `buildContextPack` skip anchoring only when anchors are given] → callers that
  pass a stale anchor get a pack for it; only `explain` passes one, computed in the same call.

## Migration Plan

No migration and no data change. Rollback is reverting the commits; the seed commit goes with them.

## Follow-ups

- **Cap on the files a pack reads (task 9.11): none.** After the batched read, Q1 on acme-shop reads
  29 files with 6 git processes in a median of 580 ms (10 825 ms and 145 processes before;
  `reports/2026-10-13-9-pack-latency.md`). The author read the median on 2026-10-13 and decided not
  to cap: the process count no longer grows with the files, so the threshold that would justify a cap
  was not reached.
- **Privacy check, L1 (Low) — B, DIS-41.** The question reaches the model unredacted; only the span
  text is redacted by the pack. Sanitising the content sent to the model is DIS-41's scope; a Spanish
  comment on DIS-41 records it.
- **Privacy check, L2 (Low) — D, accepted.** No claim column holds the question (subject: symbol or
  path; predicate: constant; object: the statement), but a model statement may paraphrase the
  question and is stored as the object. Accepted: the statement is the answer, and the rule is that
  the question itself is never stored.
- **verify-against-spec (2026-10-13), destinations** (report `reports/2026-10-13-verify-against-spec.md`):
  - Missing 1, a failed rollback (pool and caller transaction) — **A, fixed**: on a pool a domain
    error followed by a failed `ROLLBACK` gave the domain error; now `ClaimWriteFailed` on both paths
    (TDD, `tests/unit/store/postgres-claim-write-errors.spec.ts`), design D7 and the `graph-store`
    delta updated.
  - Missing 2, "undoes only its own writes" — **A, fixed**: "A failure while writing evidence leaves
    no claim" now saves a claim first on the same transaction and asserts it survives.
  - Missing 3, unknown commit in a batch — **A, fixed**: non-scenario test "reports a commit the
    repository does not have as missing on the first path".
  - Missing 4, "at most six processes" not measured — **D, accepted**: the test counts the processes
    of the spawner (4) and the two of `assertRepositoryRoot`, which runs through simple-git and is
    called once per batch by the code, are added, as in DIS-28's measurement; the 39c latency report
    uses the same count.
  - Weak asserts — **A, fixed**: the malformed-request and budget/hops/root tests assert every store,
    source and model call is 0 and `instanceof InvalidExplainRequest`; the integration "A fact is
    stored…" asserts the stored hash equals the SHA-256 of the messages sent and the stored subject
    of each claim. The unit subject scenario stays on the pure mapping (design D13: on Q1 the method
    span is absorbed by its class span).
  - Weak assert, the double's `ClaimWriteFailed` cannot carry database text — **D, accepted**: the
    database variant "A failed write over the database still answers without leaking" covers the leak
    path.
  - Unspecified 1, two prompt lines — **A, documented** in D5 (they implement the `no-evidence` contract).
  - Unspecified 2, `FOR SHARE` lock — **A, documented** in D7.
  - Unspecified 3, failing `SAVEPOINT` — **A, specified** in the `graph-store` delta.
  - Unspecified 4, `createdAt`, `confidence`, `projectId` in stored claims — **A, specified** in the
    `graph-store` delta; the in-memory double now returns the project id lower-cased like the adapter
    (TDD, `returns the ids of the stored claims and evidence in order`).
  - Unspecified 5, wider public API of `@codemind/core` — **D, accepted**: core exports each module
    through its `index.ts` (every export documented, `docs:coverage`); the adapter needs
    `assertValidClaim*` and the tests the rest.
  - Unspecified 6, `assertValidObjectId` in `distinctRegularFiles` — **D, accepted**: the same defensive
    check `readFileAt` makes, so a batch fails as each single read would.
