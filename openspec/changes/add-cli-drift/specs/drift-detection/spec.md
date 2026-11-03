## MODIFIED Requirements

### Requirement: Drift request

`drift` SHALL take its dependencies (the store, the source reader, the model, an absolute workspace
root, a clock, a verification cache and, optionally, a cost table) and a request
`{ projectId, docPath?, tokenBudget?, useCache? }`, and SHALL check the request before any call to the
store, the source reader or the model. `projectId` SHALL be a string (a malformed or unknown id is
reported later by the store as `ProjectNotFound`); `docPath`, when present, SHALL be a string of 1 to
1,000 code points holding no U+0000; `tokenBudget`, when present, SHALL be an integer from
`TOKEN_BUDGET_MIN` to `TOKEN_BUDGET_MAX` (the context pack's bounds; `TOKEN_BUDGET_DEFAULT` when
absent); `useCache`, when present, SHALL be a boolean (`true` when absent; see "Golden drift report
lookup"). A request that is not an object, holds another field or breaks one of these rules SHALL be
rejected with `InvalidDriftRequest` (code `INVALID_DRIFT_REQUEST`) naming the field of the first issue
(`request` for the request as a whole) and never holding its value. A workspace root that is not
absolute SHALL be rejected with a `RangeError` naming `workspaceRoot`, before any call. The request
SHALL be validated first: a call whose request is invalid and whose workspace root is relative
rejects with `InvalidDriftRequest`.

#### Scenario: An invalid drift request is rejected before the store
- **GIVEN** the in-memory store, source reader and scripted model of the drift tests
- **WHEN** `drift` is called with each of: a request that is `null`, a `projectId` that is a number, a
  `docPath` that is the empty string, a `docPath` of 1,001 code points, a `docPath` holding U+0000, a
  `tokenBudget` of `TOKEN_BUDGET_MIN − 1`, a `tokenBudget` of `1000.5`, a `useCache` that is the string
  `no`, and a request with an extra field `question`
- **THEN** each call rejects with `InvalidDriftRequest` naming `request`, `projectId`, `docPath`,
  `docPath`, `docPath`, `tokenBudget`, `tokenBudget`, `useCache` and `request` respectively, whose
  message holds none of the values, and the store, the source reader and the model were not called

#### Scenario: A relative workspace root is rejected before the store
- **WHEN** `drift` is called with a valid request and the workspace root `workspace`
- **THEN** it rejects with a `RangeError` naming `workspaceRoot`, and the store, the source reader and
  the model were not called

### Requirement: Unknown drift answers

`drift` SHALL answer `{ status: 'unknown', reason }` with no other field, never an error, in two
cases, checked in this order after the request and after the golden drift report lookup (see "Golden
drift report lookup"), when that lookup found no golden report: when the model is in `evaluation`
mode, with reason `llm-required`, without reading the index state, the project or any file and without
calling the model; and when the project has no stored file of kind `doc` (by the canonical file-kind
rule applied to the paths of the project's index state), or `docPath` is given and is not one of
those paths, with reason `no-docs`, after reading the index state once and without reading any file
or calling the model. The reasons SHALL be the exported closed set `DRIFT_UNKNOWN_REASONS` =
`llm-required`, `no-docs`. An unknown report SHALL still leave its `query_log` row (see "Drift query
log").

#### Scenario: Evaluation mode answers llm-required without reading anything
- **GIVEN** a model in `evaluation` mode and a project with documents
- **WHEN** `drift` is called for that project with `useCache: false`
- **THEN** the report is exactly `{ status: 'unknown', reason: 'llm-required' }`; the store was not
  read (its only call is the one `saveQueryLog` of the row); and the source reader and the model were
  not called

#### Scenario: Evaluation mode without a golden report answers llm-required without reading the project
- **GIVEN** a model in `evaluation` mode and a project with documents and no answer cache entry
- **WHEN** `drift` is called for that project
- **THEN** the report is exactly `{ status: 'unknown', reason: 'llm-required' }`; the store received
  exactly one `findCacheEntry` (key `drift:`) and one `saveQueryLog`, and no `readIndexState`,
  `getProject` or other read; and the source reader and the model were not called

#### Scenario: A project without documents answers no-docs
- **GIVEN** a `live` model and a project whose stored files are `app/Calc.php` and `config/app.php`
- **WHEN** `drift` is called for that project
- **THEN** the report is exactly `{ status: 'unknown', reason: 'no-docs' }`, the index state was read
  once, and no file was read and the model was not called

#### Scenario: A docPath that is not a stored document answers no-docs
- **GIVEN** a `live` model and a project with the stored document `docs/pricing.md` and the source file
  `app/Calc.php`
- **WHEN** `drift` is called with `docPath` `app/Calc.php`, and then with `docPath` `docs/missing.md`
- **THEN** both reports are exactly `{ status: 'unknown', reason: 'no-docs' }`, and no file was read and
  the model was not called

### Requirement: Drift report

An answered call SHALL return
`{ status: 'answered', projectId, commit, documents, events, usage, cacheHit }`. `cacheHit` SHALL be
`false` for a call that checked the documents with the model and `true` only for a golden report
answered from the answer cache (see "Golden drift report lookup"). `commit` SHALL be the indexed
commit every file was read at. Each document entry SHALL be
`{ path, claimsChecked, omittedClaims, droppedClaims, contradictions }`. Each contradiction SHALL be
`{ claim: { text, path, startLine, endLine, excerpt, verification }, statement, evidence, type,
provenance }`, in the order of the confronted claims: `evidence` holds each kept code citation
`{ path, startLine, endLine, fileKind, excerpt, verification }` in the model's citation order; `type`
SHALL always be `INFERENCE`, never `FACT`, since a contradiction is a judgement between two sources;
`provenance` SHALL be `{ model, promptHash, inputSpans, createdAt }` with the model name the
confrontation call reported, the SHA-256 (lowercase hexadecimal) of the UTF-8 bytes of `JSON.stringify` of the messages its prompt
sent (the rule of `explain`), the
`{ path, startLine, endLine }` of every span that prompt held (the document citation first, then each
evidence span in id order) and the clock's first read as ISO 8601 with a time zone; it SHALL satisfy
the exported schema `driftProvenanceSchema`. `events` SHALL list, document by document in report
order, the extraction's sanitisation events and its `drift_doc_skipped` event, then claim by claim the
confrontation's sanitisation events, its `drift_claim_skipped` event, its `evidence_broken` events and
its `entailment_unverified` events; then the `drift_doc_skipped` `limit` events; then, last, at most
one `query_not_logged` event (see "Drift query log"). The events SHALL have
exactly these shapes: an inner event of `explain`'s shapes (`untrusted_content_flagged`,
`untrusted_content_truncated`, `evidence_broken`, `entailment_unverified`) is wrapped as
`{ type: 'drift_check_event', docPath, claimIndex?, event }`, with `claimIndex` present only for a
claim's events; `{ type: 'drift_doc_skipped', docPath, reason: 'invalid-model-output' | 'limit',
subcode? }`, with `subcode` present only for `invalid-model-output`; `{ type:
'drift_claim_skipped', docPath, claimIndex, reason: 'invalid-model-output', subcode }`; and
`{ type: 'query_not_logged', code }`, with `code` one of `store-write-failed`, `project-not-found`,
`invalid-entry`. No
`schema_violation` event is reported: a discarded output is reported only by its skip event and
subcode. No event holds text of the document, the claims or the model output. `usage` SHALL be the tokens and the cost
of every `answer` call (`generation`) and every `verify` call (`verification`) that resolved, priced
with the cost table, their totals (cost rounded once to 6 decimals) and the latency of the call in
whole milliseconds (at least 1) between the clock's first and last reads. An `unknown` report SHALL
carry no usage.

#### Scenario: The report of a contradiction carries both citations, its type and its provenance
- **GIVEN** a document `docs/pricing.md` with one claim on lines 11–17 and a confrontation returning
  `contradicted` with a statement and `E1`, a valid span of `app/Calc.php` lines 25–35, which the
  verifier entails, and a clock reading `2026-11-03T10:00:00.000Z` first
- **WHEN** `drift` is called
- **THEN** the report is `answered` with the indexed commit and `cacheHit` `false`; the document entry
  has `claimsChecked` 1
  and one contradiction whose claim is lines 11–17 of `docs/pricing.md` with their redacted text and
  verification `cited`, whose evidence is exactly lines 25–35 of `app/Calc.php` with `fileKind`
  `source`, its text and verification `entailed`, whose `type` is `INFERENCE`, and whose provenance
  satisfies `driftProvenanceSchema`, names the scripted model, hashes the sent prompt, lists
  `docs/pricing.md` 11–17 then `app/Calc.php` 25–35, and is dated `2026-11-03T10:00:00.000Z`

#### Scenario: The usage adds every answer and verify call of the run
- **GIVEN** a run with two extraction calls, one confrontation call and one `verify` call, each
  reporting 100 input and 10 output tokens, and a cost table pricing the scripted model
- **WHEN** `drift` is called
- **THEN** `usage.generation` has 300 input and 30 output tokens, `usage.verification` has 100 input,
  10 output tokens and 1 call, the totals are 400 and 40 with the cost of both rounded once, and
  `latencyMs` is the difference of the clock's first and last reads

### Requirement: Drift failures, logging and writes

`drift` SHALL propagate unchanged: `ProjectNotFound` and any failure of the store reads (the golden
drift report lookup included); `SourceUnavailable` (including reason `not-indexed`) and any failure of
the document, configuration or context-pack reads, including `SourceUnavailable` reason `missing` for
a stored file absent at the indexed commit; `LlmUnavailable`, `BudgetExhausted` and any other failure
of an `answer` call; any failure of a verification read other than a missing file, and of a `verify`
call other than those the semantic check absorbs; and any failure of the hit record of a golden entry
and of the `query_log` write other than those "Drift query log" absorbs. The only writes of `drift`
SHALL be its `query_log` row (see "Drift query log") and, for a golden report, the hit of its answer
cache entry: no claim, evidence or answer cache entry SHALL be saved. `drift` SHALL log nothing: no
document text, claim, statement, span text or model output leaves it other than in the returned
report.

#### Scenario: A failing answer call propagates unchanged
- **GIVEN** a model whose second `answer` call rejects with `BudgetExhausted`
- **WHEN** `drift` is called over a project whose first document has one claim with context
- **THEN** the call rejects with that same `BudgetExhausted` error

#### Scenario: A drift run writes nothing
- **WHEN** `drift` answers a `live` run that reports a contradiction
- **THEN** it wrote nothing but its query log row: the store's `saveClaims`, `refreshClaim`,
  `saveCacheEntry` and `touchCacheEntry` were never called, `saveQueryLog` was called exactly once,
  and nothing was written to the console

## ADDED Requirements

### Requirement: Golden drift report lookup

The answer cache key of a drift call SHALL be `drift:` when the request has no `docPath`, and
`drift:` followed by `docPath` exactly as given otherwise. After checking the request and the
workspace root, `drift` SHALL read the clock once (its first read) in every call. Then, unless the
request sets `useCache: false`, and before the evaluation-mode check, in both modes, it SHALL look the
key up once in the project's answer cache. An entry whose response is a **stored drift report** SHALL be a hit: an object with
exactly the keys `commit` (a non-empty string without U+0000) and `documents` (a non-empty list of
document entries of the shapes of "Drift report": counts that are integers from 0, every
contradiction with `type` `INFERENCE`, its claim verification `cited`, every evidence with a file kind
of the graph and verification `entailed` or `cited`, every line an integer from 1 with the last line
not before the first, every text without U+0000, and a provenance that satisfies
`driftProvenanceSchema`), as the exported `storedDriftReportSchema` checks it. On a hit `drift` SHALL
record one hit of that entry at the clock's first read and answer
`{ status: 'answered', projectId, commit, documents, events: [], usage, cacheHit: true }` with the
stored `commit` and `documents`, a `usage` whose every token, cost and call counter (`generation` and
`verification` included) is 0 and whose `latencyMs` (and only it) is the latency between the clock's
first and last reads, without reading the index state, the project or any file and without calling
the model. An entry whose response is not a stored drift report SHALL be a miss, with no event, and
the call SHALL go on as without an entry. `drift` SHALL never save an answer cache entry: a golden
drift report is only written by the seed load (`seed-load`). With `useCache: false` the lookup SHALL
not happen. A failure of the lookup or of the hit record SHALL propagate before the model is called;
for an id that names no project the lookup rejects with `ProjectNotFound`, in both modes.

#### Scenario: A golden report is answered from the cache in both modes
- **GIVEN** a project with documents whose answer cache holds, under the key `drift:`, a stored drift
  report with commit `C` and one document entry holding one contradiction
- **WHEN** `drift` is called for that project with a model in `evaluation` mode, and then with a model
  in `live` mode
- **THEN** both reports are `answered` with commit `C`, exactly the stored `documents`, `events` empty,
  `cacheHit` `true`, every usage counter 0 and `latencyMs` at least 1; each call recorded one hit of
  that entry at the clock's first read; and neither call read the index state, the project or any
  file, or called the model

#### Scenario: An invalid golden entry is a miss without an event
- **GIVEN** a project with documents whose entry under `drift:` holds a response without `commit`, and
  then one holding the extra key `events`
- **WHEN** `drift` is called with a model in `evaluation` mode, and then with a scripted `live` model
- **THEN** the evaluation calls answer exactly `{ status: 'unknown', reason: 'llm-required' }`, the live
  calls check the documents with the model and answer with `cacheHit` `false` and no event about the
  entry, and no hit was recorded

#### Scenario: A docPath is looked up under its own key
- **GIVEN** a project whose answer cache holds a stored drift report under `drift:` only
- **WHEN** `drift` is called with `docPath` `docs/pricing.md` and a model in `evaluation` mode
- **THEN** the lookup used the key `drift:docs/pricing.md`, the report is exactly
  `{ status: 'unknown', reason: 'llm-required' }` and no hit was recorded

#### Scenario: Turning the cache off skips the lookup and saves nothing
- **GIVEN** a project whose answer cache holds a stored drift report under `drift:`, and a scripted
  `live` model
- **WHEN** `drift` is called with `useCache: false`
- **THEN** no lookup was made, the documents were checked with the model, the report has `cacheHit`
  `false`, and the entry under `drift:` is unchanged (no save, no hit)

#### Scenario: A failing golden lookup stops before the model
- **GIVEN** a store whose `findCacheEntry` rejects with an `Error`, then an id that names no project,
  then a store holding a valid golden entry under `drift:` whose `touchCacheEntry` rejects with an
  `Error`
- **WHEN** `drift` is called with a `live` model, then with an `evaluation` model for the unknown id,
  then with a `live` model
- **THEN** the first call rejects with that same error, the second with `ProjectNotFound` and the third
  with that same `touchCacheEntry` error; none called the model or wrote a `query_log` row

### Requirement: Drift query log

Every report `drift` returns SHALL leave one `query_log` row, written after the report is built and
before it is returned, with: `projectId` the request's; `question` the call's answer cache key (see
"Golden drift report lookup"); `capability` `drift`; for an answered report, `inputTokens`,
`outputTokens` and `costUsd` the totals of its `usage` (verification included), `verifyInputTokens`,
`verifyOutputTokens`, `verifyCostUsd` and `verifyCalls` those of `usage.verification`, and
`verifyLatencyMs` the latency of `usage.verification` for a call that checked the documents and `null`
for a golden report; for an unknown report every token, cost and call counter 0 and
`verifyLatencyMs` `null`; `baselineTokens` `null`; `latencyMs` the latency between the clock's first
read and a last read (the report's `usage.latencyMs` for an answered report); and `cacheHit` the
report's `cacheHit` (`false` for an unknown report). When the pipeline rejects before its report is
built, after at least one model call resolved, `drift` SHALL write one row with `projectId` the
request's, `question` the call's key, `capability` `drift`, the tokens and cost of the `answer` and
`verify` calls that resolved (the `verify*` counters from the resolved `verify` calls),
`baselineTokens` `null`, `latencyMs` the latency between the clock's first read and a read taken at
the rejection, `verifyLatencyMs` `null` and `cacheHit` `false`, and then reject with the same error; a
failure of that write SHALL never replace the error. A failure of the row write of a returned report
SHALL NOT lead to a second row. No row SHALL be written when `drift` rejects before any model call resolved. When the write
of a returned report's row fails with `QueryLogWriteFailed`, `ProjectNotFound` or
`InvalidStoreQuery`, an answered report SHALL be returned with the event
`{ type: 'query_not_logged', code }` last (`store-write-failed`, `project-not-found` and
`invalid-entry` respectively), and an unknown report SHALL be returned unchanged; any other failure of
that write SHALL propagate.

#### Scenario: A run with the model leaves one row with its usage
- **GIVEN** the run of "The usage adds every answer and verify call of the run"
- **WHEN** `drift` is called with no `docPath`
- **THEN** exactly one row was written: `capability` `drift`, `question` `drift:`, `inputTokens` 400,
  `outputTokens` 40, `costUsd` the report's total cost, `verifyInputTokens` 100, `verifyOutputTokens`
  10, `verifyCalls` 1, `verifyCostUsd` the verification cost, `verifyLatencyMs` the verification
  latency, `baselineTokens` `null`, `latencyMs` the report's latency and `cacheHit` `false`

#### Scenario: A golden report leaves a cache-hit row with zero counters
- **GIVEN** the golden setting of "A golden report is answered from the cache in both modes"
- **WHEN** `drift` is called with a model in `evaluation` mode
- **THEN** exactly one row was written with `question` `drift:`, `cacheHit` `true`, every token, cost
  and call counter 0, `verifyLatencyMs` `null` and `latencyMs` the report's latency

#### Scenario: An unknown report leaves a zero row
- **WHEN** `drift` answers `llm-required` for a call with `docPath` `docs/pricing.md`, and then
  `no-docs` for a project without documents
- **THEN** each call wrote exactly one row with `capability` `drift`, `question`
  `drift:docs/pricing.md` and `drift:` respectively, every token, cost and call counter 0,
  `verifyLatencyMs` `null`, `cacheHit` `false` and `latencyMs` at least 1

#### Scenario: A failure after a model call leaves a row and keeps its error
- **GIVEN** a model whose first `answer` call resolves reporting 100 input and 10 output tokens and
  whose second `answer` call rejects with `BudgetExhausted`
- **WHEN** `drift` is called over a project whose first document has one claim with context, and then
  with a model whose second `answer` call rejects with `LlmUnavailable` reason `timeout`
- **THEN** it rejects with that same `BudgetExhausted` error, after writing exactly one row with
  `question` `drift:`, `capability` `drift`, `inputTokens` 100, `outputTokens` 10, every `verify*`
  counter 0, `baselineTokens` `null`, `latencyMs` at least 1, `verifyLatencyMs` `null` and `cacheHit`
  `false`; the same holds with that `LlmUnavailable` error; and with a store whose `saveQueryLog` also
  rejects, it still rejects with the `BudgetExhausted` error

#### Scenario: No row when drift fails before a model call resolves
- **WHEN** `drift` is called in `live` mode for a project that has stored documents but no indexed
  commit, and then with a model whose first `answer` call rejects with `LlmUnavailable`
- **THEN** the calls reject with `SourceUnavailable` reason `not-indexed` and with that
  `LlmUnavailable`, and no row was written

#### Scenario: A failed row write still answers and says so
- **GIVEN** a store whose `saveQueryLog` rejects with `QueryLogWriteFailed`, then with
  `ProjectNotFound`, then with `InvalidStoreQuery`
- **WHEN** `drift` answers a `live` run with a contradiction, and then answers `llm-required` in
  `evaluation` mode
- **THEN** the answered reports end with the event `{ type: 'query_not_logged', code }` with `code`
  `store-write-failed`, `project-not-found` and `invalid-entry` respectively, and the unknown reports
  are exactly `{ status: 'unknown', reason: 'llm-required' }`

#### Scenario: Other row write errors propagate
- **GIVEN** a store whose `saveQueryLog` rejects with an `Error`
- **WHEN** `drift` answers a `live` run
- **THEN** the call rejects with that same error and `saveQueryLog` was called exactly once
