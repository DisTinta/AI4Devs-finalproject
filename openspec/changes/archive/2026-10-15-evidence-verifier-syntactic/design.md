## Context

See `proposal.md` → Why for the motivation and the author's decisions D1–D7. What exists today:

- `explain` (`packages/core/src/explain/explain.ts`) builds the pack, sanitises it
  (`sanitizeForPrompt`), reads the prior claims, builds the prompt (`buildPrompt`, whose
  `evidenceIds: Map<string, SanitizedSpan>` maps `E1…En` to the sanitised spans in rank order), asks
  the model, quarantines the output (`parseModelOutput`), then `typeStatements` → `toClaimItems` →
  `store.saveClaims(projectId, items, pack.commit)` → `storedAnswer` / `unsavedAnswer`. There is no
  verification step; `verification: 'none'` is hard-coded in `storedAnswer`, `unsavedAnswer`,
  `AnswerStatement` and `toClaimItems`.
- `TypedStatement` (`claim-items.ts`) holds `text`, `type` and `spans`, but not the prompt ids;
  `unsavedAnswer` recovers the ids from `output.statements` by position.
- `buildContextPack` (`context/context-pack.ts`) resolves the repository root inside itself
  (`isAbsolute(project.rootPath) ? … : join(workspaceRoot, …)`), reads every file with one
  `source.readFilesAt(root, commit, paths)`, redacts each with `redactSecrets`, splits it with the
  private `linesOf` (a final `\n` ends the last line) and cuts spans with the private `cut`
  (`lines.slice(start - 1, end).join('\n')`). An `ok` pack carries `commit` but not `root`.
- `sanitize.ts` `truncate` cuts a span over `MAX_EVIDENCE_TEXT_CHARS` before its last whole line and
  removes one trailing `\r`, or keeps the first `MAX` code points of the first line
  (`[TRUNCATED: line cut]`); the cut span keeps `truncation: { mark, originalEndLine }`. The excerpt
  stored is that cut text.
- `SourceTreePort.readFilesAt` rejects the whole batch with the `SourceUnavailable` of the first
  unreadable path in the order given; `readFileAt` reads one path. Reasons: `missing`, `too-large`,
  `binary-content`, `not-a-repository`.
- Events: `ExplainEvent = SchemaViolationEvent | ClaimsNotPersistedEvent | SanitizationEvent`, closed
  code sets declared next to their event (`CLAIMS_NOT_PERSISTED_CODES`, `INSTRUCTION_PATTERNS`). The
  CLI writes each event with `logger.info` (`ask.ts:100`); `logger.error` exists.
- ADR 20261011 (span text read from git at the indexed commit) rules out `StorePort.readSpan`; ADR
  20261014 records D2.

## Goals / Non-Goals

**Goals:**

- One rule computes the text of a range, used by the pack and by the verifier, so an unchanged file
  whose stored ranges fit it can never be reported `broken`.
- `verifyCitations` is reusable as is by DIS-42 (another commit) and extended by DIS-70 (semantic
  check after it) without touching `explain` again.
- No extra project read and no second root resolution in `explain`.

**Non-Goals:**

- Verifying spans no statement cites, re-verifying prior claims, or any LLM call (see `proposal.md` →
  Non-goals).
- Changing the typing rule (D3) or the SQL of the claim write.

## Decisions

### V1 — `verify/` module: three files, pure except for the port

```ts
// packages/core/src/verify/syntactic.ts
export type CitationCut = 'lines' | 'line-cut';
export interface Citation {
  path: string;
  startLine: number;
  endLine: number;
  excerpt: string;
  cut?: CitationCut;            // absent when the span was not cut by the sanitisation
}
export type CitationVerdict =
  | { verification: 'cited' }
  | { verification: 'broken'; reason: EvidenceBrokenReason };
export async function verifyCitations(
  source: SourceTreePort, root: string, commit: string, citations: readonly Citation[],
): Promise<CitationVerdict[]>;

// packages/core/src/verify/policy.ts
export function applyVerdicts(
  statements: readonly TypedStatement[], broken: ReadonlySet<string>,
): TypedStatement[];

// packages/core/src/verify/verify-answer.ts
export interface VerifiedAnswer { statements: TypedStatement[]; events: EvidenceBrokenEvent[] }
export async function verifyAnswer(
  source: SourceTreePort, root: string, commit: string,
  statements: readonly TypedStatement[], spanOf: ReadonlyMap<string, SanitizedSpan>,
): Promise<VerifiedAnswer>;
```

`verifyAnswer` collects the distinct cited ids, sorts them in evidence-id order (the order of
`spanOf`, i.e. rank order; `E2` before `E10`), maps each to a `Citation` (V4), calls
`verifyCitations` once, builds one `evidence_broken` event per broken id in that order, and calls
`applyVerdicts`. It is the seam where DIS-70 adds `semantic.ts` and the cache. `verify/index.ts`
exports the three files and `packages/core/src/index.ts` adds `export * from './verify/index.js'`.
`verify/` imports explain's leaf modules (`explain-event.js`, `sanitize.js`, `claim-items.js`,
`typing-rules.js`, `limits.js`), never `explain/index.js`: `.dependency-cruiser.cjs` sets
`tsPreCompilationDeps: true`, so even a type-only import through the barrel closes the cycle
`explain/index → explain.ts → verify-answer → explain/index`.

Alternative rejected: putting the check inside `explain.ts` or `typing-rules.ts`. DIS-42 must call it
with a different commit and no `explain`, and the backend standards place evidence verification in
domain logic of its own (`docs/backend-standards.md` §3, readme §2.3 `core/verify`).

### V2 — One shared span-text rule, extracted from `context-pack.ts`

New file `packages/core/src/context/span-text.ts`:

```ts
/** The redacted lines of a file (redactSecrets, then a final \n ends the last line; empty → ['']). */
export function redactedLines(path: string, content: string): { content: string; lines: string[] };
/** Lines startLine..endLine (1-based, inclusive) joined by '\n'. */
export function spanText(lines: readonly string[], startLine: number, endLine: number): string;
```

`buildContextPack` replaces its private `linesOf`, its inline `redactSecrets` call and the slice in
`cut` with these two (a pure move: `context-engine` tests stay green unchanged). `syntactic.ts` calls
the same two on the content of the verification read. Exported through `context/index.ts`.

Alternative rejected: a second copy of the rule in `verify/`. Any later change to how the pack cuts
(CRLF, BOM, redaction) would turn valid citations into `excerpt-mismatch` silently.

### V3 — Reading: one batch, a per-path fallback on `missing` only

`verifyCitations` takes the distinct paths in first-citation order and calls
`source.readFilesAt(root, commit, paths)` once (none when there is no citation). On
`SourceUnavailable` with reason `missing`, it calls `readFileAt` once per distinct path,
sequentially; a `missing` rejection marks the path missing, any other rejection propagates. Any other
rejection of the batch propagates unchanged. When the batch rejected `missing`, the contents checked
are those of the single reads. Then, per citation, in order: missing path →
`file-missing`; `startLine < 1 || endLine < startLine || endLine > lines.length` →
`range-out-of-file`; expected text (V4) `!== excerpt` → `excerpt-mismatch`; else `cited`.

The fallback reads only after a failure, so the happy path is one batch (≤ 6 git processes, the
port's contract). A missing path is a system failure (the pack read it at the same commit moments
earlier), so its cost does not matter.

Alternative rejected: reading each path with `readFileAt` from the start: one git process per path on
every answer.

### V4 — Expected text and the cut of a sanitised span (D5)

Confirmed by the author after the spec audit (2026-10-14, Q1): a line-cut excerpt must be exactly the
first `MAX_EVIDENCE_TEXT_CHARS` code points, not any prefix.

`expected = spanText(lines, startLine, endLine)`; with `cut: 'lines'`, one trailing `\r` removed
(`/\r$/`); with `cut: 'line-cut'`, its first `MAX_EVIDENCE_TEXT_CHARS` code points (`Array.from` or a
code-point walk, never a UTF-16 `slice`, so no half surrogate). Comparison with `===`.

`verifyAnswer` maps a `SanitizedSpan` to a `Citation` as `{ path, startLine, endLine, excerpt:
span.text, cut }` where `cut` comes from `span.truncation`: absent → no cut; `mark ===
TRUNCATION_LINE_CUT_MARK` → `line-cut`; any other mark → `lines`. `sanitize.ts` exports
`TRUNCATION_LINE_CUT_MARK = '[TRUNCATED: line cut]'` and `truncate` uses it, so the two cannot drift.

This makes D5's "prefijo de la primera línea" exact: the sanitisation keeps exactly the first `MAX`
code points, so the verifier asks for exactly those, not any prefix (a shorter prefix is
`excerpt-mismatch`, spec scenario "A line-cut span matches the first code points of its line").

Alternative rejected: re-running `truncate` over the original range (`startLine..originalEndLine`).
It would need the omitted lines to still exist, so a change only in the omitted lines would read as
`range-out-of-file` for lines the model never saw.

### V5 — `TypedStatement` carries its prompt ids

`TypedStatement` gains `evidenceIds: readonly [string, ...string[]]`, parallel to `spans`.
`typeStatements` fills it from the accepted output; `applyVerdicts` filters `evidenceIds` and `spans`
together and retypes with `typeStatement(spans)`; `unsavedAnswer` reads the ids from the verified
statements instead of `output.statements` (which would still hold the broken ids). `toClaimItems`
ignores it and takes `statements: readonly Pick<TypedStatement, 'text' | 'type' | 'spans'>[]`, so
callers without prompt ids (the existing test of "The subject of a claim is the symbol of its first
cited span") still compile.

### V6 — `explain` wiring

The root is exposed on the pack rather than resolved again in `explain` (author, 2026-10-14, Q2).

After `typeStatements`:

```ts
const verified = await verifyAnswer(source, pack.root, pack.commit, statements, prompt.evidenceIds);
const events = [...sanitized.events, ...verified.events];
if (verified.statements.length === 0) return unknown('broken-evidence', events);
const items = toClaimItems({ … }, verified.statements);
// storedAnswer / unsavedAnswer take verified.statements and events
```

`pack.root` (D1 says the commit is `pack.commit`; the root is the pack's too): `FilledContextPack`
gains `root: string`, the value `buildContextPack` already computes. `storedAnswer` and
`unsavedAnswer` write `verification: 'cited'`; `unsavedAnswer` appends `claims_not_persisted` after
`events`. Stale handling is unchanged: a stale statement is `INFERENCE` and `cited`.

Alternative rejected: resolving the root again in `explain` with a second `store.getProject` — one
more store call per answer and a second copy of the resolution rule.

### V7 — Types and the closed sets (D4, D6, D7)

- `explain-event.ts`: `EVIDENCE_BROKEN_REASONS = ['file-missing', 'range-out-of-file',
  'excerpt-mismatch'] as const`, `EvidenceBrokenReason`, `EvidenceBrokenEvent { type:
  'evidence_broken'; evidenceId; path; startLine; endLine; reason }`, and `ExplainEvent` widened. Same
  file as `INSTRUCTION_PATTERNS` (the ticket's D6), so `verify/` imports from `explain/` and
  `explain-event.ts` imports nothing from `verify/` (`no-circular`).
- `unknown-policy.ts`: `'broken-evidence'` appended to `UNKNOWN_REASONS`; JSDoc of the reasons and of
  `events` updated.
- `explain-answer.ts`: `AnswerStatement.verification: 'cited'` with a comment saying DIS-70 widens it
  to `'cited' | 'entailed'`; the doc of `events` and `UnsavedExplain` gain the `evidence_broken` place.
- `claim-items.ts`: evidence `verification: 'cited'`; its JSDoc says only verified citations reach it.
  A literal, not a verdict per span, because only `cited` evidence reaches `toClaimItems` after the
  output policy; DIS-70 will pass the verdict per span when `entailed` exists.

### V8 — CLI level

`ask.ts`: `for (const event of answer.events) (event.type === 'evidence_broken' ? logger.error :
logger.info)({ ...event })`. The exit code does not depend on it.

### V9 — Test double: reads after the model call can see another content

`createInMemorySourceTree(contents, failures, options?)` gains `options.after?: { when: () => boolean;
contents: SourceContents; failures?: Record<string, unknown> }`: every read (batched or single) made
while `when()` is true answers from `after.contents`/`after.failures` instead. `doubles()` in
`tests/support/explain-doubles.ts` gains `verificationContents` / `verificationFailures` and passes
`when: () => order.includes('complete')` (`scripted-llm.ts` pushes `'complete'` into the shared
`order`), so only the reads after the model call see them, whatever `packOf` read before through the
same source. `doubles()` also returns the double's `batchReads` and `reads`, which the new THEN
clauses assert. This simulates D1's failure modes (a file changed or gone between the pack's read and
the verification read at the same commit) without a real repository.

Alternative rejected: a read count (`after N reads`): `packOf` reads through the same source before
`explain` in the existing tests, so the count would shift and `explain`'s own pack read would see the
changed content. Also rejected: mutating `contents` from inside the scripted model's callback, which
couples the model double to the source double.

### V10 — Architecture rule

Kept by the author after the spec audit (2026-10-14, Q3), although the ticket did not ask for it.

`.dependency-cruiser.cjs` gains `verify-no-io`, the same shape as `explain-sanitize-no-io`, from
`^packages/core/src/verify/` to the I/O built-ins: the module reads only through `SourceTreePort`.

### V11 — Tests

- `tests/unit/verify/syntactic.spec.ts`: the scenarios of "Syntactic citation check" and "Expected
  text of a cited range" (`evidence-verification`), over `createInMemorySourceTree` directly.
- `tests/unit/verify/policy.spec.ts`: "Output policy over typed statements".
- `tests/unit/verify/verify-answer.spec.ts`: extra unit tests of the mapping (V4 `cut`, evidence-id
  order with `E10`, one event per id cited twice).
- `tests/unit/explain/explain-verification.spec.ts` (new, same doubles): the new `explain` scenarios
  ("Every citation broken is unknown with broken evidence", "A verification read failure propagates
  without writing", "No verification read without statements", "Cited spans are verified in one read
  at the pack's commit", "A broken citation is neither stored nor shown", "An unsaved answer keeps
  only its verified citations", "Evidence broken events follow the sanitisation events and carry no
  content"). Existing scenarios whose wording changed keep their test and name in `explain.spec.ts`.
- `tests/unit/context/context-pack.spec.ts`: "A pack names the
  root it was read from".
- `tests/unit/cli/ask-command.spec.ts`: the two new `cli-ask` scenarios.
- Integration (`tests/integration/explain/explain.spec.ts`, `tests/integration/cli/ask-command.spec.ts`)
  run the real git source tree over acme-shop: their happy paths now prove that real files verify
  `cited` (no false `broken` from CRLF, BOM or redaction in the fixture).

### V12 — No new ADR

D2 already has `docs/adr/20261014-broken-citations-not-stored.md`. V1–V11 are local to core and cheap
to revert. The ADR and its index line, written before this change, are committed on this branch.

### V13 — Hardening after the pre-merge review (author, 2026-10-15)

Decided by the author on the findings of `reports/2026-10-15-verify-against-spec.md` §3 and
`reports/2026-10-15-adversarial-review.md`, fixed in this change with TDD and added to the
`evidence-verification` delta:

- A first, last or original last line that is not an integer gives `range-out-of-file` (`NaN` failed
  every comparison and was `cited`; `slice` truncated a fraction).
- A batched read that resolves to fewer or more contents than paths fails with an error instead of
  reading as `file-missing`: the port promises never a partial result.
- A cut span's citation carries `originalEndLine`, and the range check applies to it too, so a graph
  range past the end of its file is `range-out-of-file` whatever the sanitisation kept. Before, a span
  over `MAX_EVIDENCE_TEXT_CHARS` with that defect was cut to lines inside the file and read `cited`.
  The pack is unchanged; the event keeps the kept last line, as the spec says.

## Risks / Trade-offs

- [The fixture holds a file whose text the pack and the verifier see differently] → impossible by
  construction after V2 (same functions, same commit, same root); the integration happy paths over
  acme-shop through real git check it.
- [The batched read starts git again on every answer] → bounded by the port (≤ 6 processes); no model
  call; measured in the step 8 report's runtime.
- [`truncation.mark` is a display string used to tell the cut kind] → one exported constant shared by
  `truncate` and the mapping (V4), and a unit test per kind.
- [A graph symbol range reaches beyond its file] → `context-pack.ts` slices silently, so the pack
  span is short and the verifier reports `range-out-of-file`, also for a span the sanitisation cut
  (V13). Under D1 this graph/code inconsistency is the main real trigger of `broken` in production,
  and the manual test (10.3) and show-spec-working reproduce it.
- [The batch rejects `missing` because the commit itself is missing] → every citation becomes
  `file-missing` instead of the error propagating. Harmless under D1 (the pack just read that
  commit); relevant to DIS-42's reuse with another commit.
- [DIS-42 verifies stored evidence that has no `truncation`] → a stored line-cut excerpt would read as
  `excerpt-mismatch` there; DIS-42 must store or infer the cut. Noted for DIS-42, out of this scope.
- [Prompt ids are ordered as strings by mistake (`E10` before `E2`)] → order taken from `spanOf`'s
  insertion order, with a test using eleven spans.

## Migration Plan

No data migration. Rows written before the change keep `verification = 'none'`; new rows are
`cited`. Rollback is reverting the PR: the schema already accepts both values.

## Follow-ups

Pre-merge review of 2026-10-15 (`reports/2026-10-15-verify-against-spec.md`,
`reports/2026-10-15-adversarial-review.md`). A: fixed in this change; B: handed to the issue that needs
it; C: technical-debt issue; D: no action, with the reason.

| Finding | Destination |
|---|---|
| Question — under D1 only `range-out-of-file` can fire inside `explain`; is one more batched read per answer worth it? | D — the author keeps it (2026-10-15): it is D1's trade-off, the read is bounded (≤ 6 git processes), it reports the real graph/code drift, and `verifyCitations` is ready for DIS-42 |
| Question — retyping can raise a statement from `INFERENCE` to `FACT` when a broken `heuristic` citation is dropped | D — the author confirms D2/D3 (2026-10-15): a statement is shown only with the evidence that passed the check, typed by it |
| Non-integer or `NaN` lines are `cited` (`syntactic.ts`) | A — `range-out-of-file`; spec scenario "Non-integer lines are out of the file" (V13) |
| A short batched read reads as `file-missing` | A — error; spec scenario "A short batched read is an error" (V13) |
| A graph range past end-of-file is hidden by the cut of a long span | A — the citation carries `originalEndLine`; spec scenario "A cut span whose original range leaves the file is broken" (V13), the author chose this fix over changing the pack |
| A missing commit reads as `file-missing` for every citation | B — DIS-42, comment posted 2026-10-15: telling a missing commit from missing paths needs the port, and only a caller with another commit reaches it |
| Weak assertions: second-run batch paths, `pack.root`, order of `UNKNOWN_REASONS`, `EVIDENCE_BROKEN_REASONS` and the check order | A — tests strengthened |
| "The contents of the single reads are the ones checked" is not distinguishable with the double | D — true by construction: a rejected batch returns no content |
| Specs first committed after the code (`2c29886` after `0e1aed0`) | D — process note: the spec audit of 2026-10-14 predates the apply and its Q1–Q4 match V4/V6/V10; recorded in report 9 |
| The base branch's last CI run failed in `tests/integration/cli/seed-build.spec.ts` "The database is unchanged after a build" | D — outside this change (run 38604214188, before DIS-68); reported to the author |
