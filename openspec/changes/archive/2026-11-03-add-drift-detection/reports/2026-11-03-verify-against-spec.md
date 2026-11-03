# Verify against spec

- Date: 2026-11-03
- Change: add-drift-detection (DIS-71), PR #106
- Step: 13.4, inline mode of `verify-against-spec` (autonomous run; text of the agent that ran the review step)
- Compared: `openspec/changes/add-drift-detection/specs/drift-detection/spec.md` (9 requirements, 29 scenarios)
  against `packages/core/src/drift/` and `tests/unit/drift/`, `tests/integration/drift/` at `9acea03`, plus the
  test fix of this step (see the addendum; test line numbers are those after the fix)

## 1. Requirements implemented correctly

| Requirement | Code | Tests |
|---|---|---|
| Drift request | `drift-request.ts:35-39` (strict schema: `projectId` string, `docPath` 1–1,000 code points without U+0000, `tokenBudget` integer in the pack's bounds; Zod 4.6.7 counts code points, checked: `'😀'.repeat(3)` passes `.max(3)`), `drift-request.ts:55-60` (first issue's field or `request`, value never copied), `drift.ts:107-108` (request first, then `RangeError` for a relative workspace root) | `drift.spec.ts:49` "An invalid drift request is rejected before the store", `:107` "A relative workspace root is rejected before the store", `:122` (order request → root) |
| Unknown drift answers | `drift.ts:110` (`evaluation` before any read), `drift.ts:112-115` (one `readIndexState`, canonical `fileKindOf`, `docPath` must be one of the docs), `drift-report.ts:27` (closed set) | `drift.spec.ts:135`, `:149`, `:167`, `:186` |
| Documents checked by a call | `drift.ts:113-114` (index-state order, byte order per the `StorePort.readIndexState` contract, `ORDER BY f.path COLLATE "C"` in `queries.ts:124`), `drift.ts:117-120` (`ProjectNotFound`, `not-indexed`, relative root joined to the workspace root), `drift.ts:137-146` (`MAX_DRIFT_DOCS`, one batched read, `limit` events after the documents) | `drift.spec.ts:192`, `:220`, `:232`; the root clause by the new tests `:249` and `:262` "A relative project root is joined to the workspace root for every read" (addendum) |
| Claim extraction | `doc-claims.ts:103-145` (redacted lines, whole-file `doc` span, `sanitizeForPrompt`, events rewritten to `D1`, one `answer` call, dropped/omitted counts, line-cut rule), `doc-claims.ts:28-40` and `drift-quarantine.ts:42-59` (size → fence/JSON → shape, `limit_exceeded` only when every issue is `too_big`), `drift-prompts.ts:78-95` (numbered, neutralised, wrapped `D1`) | `doc-claims.spec.ts:38`, `:64`, `:84`, `:109`, `:131` and the extra cases `:164-229`; `drift-quarantine.spec.ts`, `drift-prompts.spec.ts` |
| Context of a claim | `contradiction.ts:86-120` (pack without `doc` spans, config files not `.env*` and not in the pack, term match on normalised redacted content, byte order, `MAX_CONFIG_SPANS`, `MAX_CONFIG_LINES`, budget minus kept and added spans, skip and go on), `contradiction.ts:45-57` (one lazy batched read per call), `drift.ts:214` (no span → checked, no model call) | `contradiction.spec.ts:42`, `:62`, `:88` and the extra cases `:120-223` |
| Confrontation of a claim | `drift-prompts.ts:105-132` (`C1`, `D1`, `E1…En`), `contradiction.ts:126-158` (check order of the spec: size, JSON, shape, blank statement, empty ids, duplicate, unknown; `C1`/`D1` unknown), `drift.ts:219-225` (`drift_claim_skipped`, not counted; `consistent`/`unrelated` counted) | `contradiction.spec.ts:246`, `:258`, `:285` and the extra cases `:316-383` |
| Verification of a contradiction | `drift.ts:228-243` (document citation first, `evidence_broken` under `D1`, code side skipped), `drift.ts:245-264` (`verifyAnswer` with one `INFERENCE` statement through the cache; dropped when no code citation is left; counted either way) | `drift.spec.ts:292`, `:316`, `:345`, `:377` |
| Drift report | `drift-report.ts:87-92` (`driftProvenanceSchema`), `drift.ts:266-294` (claim `cited`, evidence in citation order with the pair's verdict, `INFERENCE`, provenance: document citation then the prompt's spans in id order, first clock read), `drift.ts:141-149` (event order), `drift.ts:153-168` (usage, cost rounded once on the total) | `drift.spec.ts:402`, `:452`, `:488-499` |
| Drift failures, logging and writes | `drift.ts` and its helpers catch nothing besides what `verifyAnswer` absorbs; no `console` and no store write in `packages/core/src/drift/` (grep) | `drift.spec.ts:503`, `:525`, `:540`, `:558`, `:580` |
| Drift over the indexed acme-shop | no specific code; the whole use case over the real adapters | `tests/integration/drift/acme-shop.spec.ts:121`, `:154` (green in CI and in the step 9 run with `DATABASE_URL`) |

## 2. Requirements missing or partial

None in the code. One evidence gap, fixed in this step:

- "Documents checked by a call" says `drift` SHALL resolve "the project's repository root (its root path, joined to
  the workspace root when relative)". `drift.ts:120` does it, but no automated test exercised the relative branch:
  the unit test "The documents and the commit are resolved against the workspace root" used the double's absolute
  root `/repos/drift` and ended with `expect(WORKSPACE).toBe('/workspace')`, an assertion on a test constant; the
  integration test indexes the copy with `indexRepository`, which stores the real absolute path
  (`packages/core/src/index/index-repository.ts:57`), so the note of task 6.1 ("The seed's relative project root
  covers the joined clause") does not hold for the integration spec. The seeded projects do store a relative root
  (`fixtures/acme-shop`, observed by show-spec-working), so this branch is the production path. Fixed: see the
  addendum.

## 3. Unspecified behaviour

- **Public surface beyond `drift`, its request, report and events.** `packages/core/src/drift/index.ts:22-25`
  re-exports every export of `drift-prompts.ts`, `doc-claims.ts` and `contradiction.ts` (`claimContext`,
  `configFilesOf`, `confrontClaim`, `isPromptableConfig`, `extractClaims`, `parseClaimsOutput`,
  `parseConfrontationOutput`, `buildExtractionPrompt`, `buildConfrontationPrompt`, the two system prompts, the
  schemas, `CONFRONTATION_VERDICTS`, the limits). The spec names only the limits and `DRIFT_UNKNOWN_REASONS`,
  `driftProvenanceSchema`. Decision: keep. It is the pattern of every core module (`explain/index.ts` re-exports
  its prompt, sanitisation, schema and usage helpers the same way), tasks 3.2 and 4.2 name these exports, and the
  internal ones the design wanted hidden (`UNSTORED_FILE_ID`, `driftShapeSubcode`, `unfenceDriftOutput`) are not
  re-exported. Recorded in design Follow-ups V2 (A).
- **Fields of `usage.verification` not named by the spec** (`calls`, `cacheHits`, `latencyMs`): the
  `VerificationUsage` shape of `explain`, which the proposal names ("as `explain` reports them") and the usage
  scenario uses (`1 call`). Kept, no change.
- **`flags` and `claimFlags` keys in the prompts** (`drift-prompts.ts:87`, `:114`, `:118`): the flagging "as in
  `explain`" the spec requires, carried the way `explain`'s prompt carries it. Kept.
- No dependency was added (`git diff origin/final-project-CRN...HEAD -- package.json package-lock.json` is empty);
  the change has no authorisation surface (core function, local single-user product; DIS-73 adds the CLI); every
  field of the report is named by the spec.

## Scenario → test → state

| Scenario | Test | State |
|---|---|---|
| An invalid drift request is rejected before the store | `tests/unit/drift/drift.spec.ts` | green |
| A relative workspace root is rejected before the store | `tests/unit/drift/drift.spec.ts` | green |
| Evaluation mode answers llm-required without reading anything | `tests/unit/drift/drift.spec.ts` | green |
| A project without documents answers no-docs | `tests/unit/drift/drift.spec.ts` | green |
| A docPath that is not a stored document answers no-docs | `tests/unit/drift/drift.spec.ts` | green |
| Documents are checked in byte order and the rest is skipped by the limit | `tests/unit/drift/drift.spec.ts` | green |
| A docPath checks only that document | `tests/unit/drift/drift.spec.ts` | green |
| An unknown or unindexed project fails without calling the model | `tests/unit/drift/drift.spec.ts` | green |
| The document is sent numbered and as untrusted data | `tests/unit/drift/doc-claims.spec.ts` | green |
| An invalid extraction skips the document and the next one is checked | `tests/unit/drift/doc-claims.spec.ts` | green |
| A claim outside the document is dropped | `tests/unit/drift/doc-claims.spec.ts` | green |
| Claims beyond the per-document limit are omitted | `tests/unit/drift/doc-claims.spec.ts` | green |
| Secrets are redacted before any drift prompt | `tests/unit/drift/doc-claims.spec.ts` | green |
| Document spans are left out of a claim's context | `tests/unit/drift/contradiction.spec.ts` | green |
| A configuration file that shares a term with the claim joins the context | `tests/unit/drift/contradiction.spec.ts` | green |
| A claim with no context is checked without a model call | `tests/unit/drift/contradiction.spec.ts` | green |
| A consistent claim is checked and not reported | `tests/unit/drift/contradiction.spec.ts` | green |
| A contradicted verdict citing an unknown id skips the claim | `tests/unit/drift/contradiction.spec.ts` | green |
| A contradicted verdict without evidence or statement skips the claim | `tests/unit/drift/contradiction.spec.ts` | green |
| A contradiction whose only code citation is broken is not reported | `tests/unit/drift/drift.spec.ts` | green |
| A contradiction keeps only its valid code citations | `tests/unit/drift/drift.spec.ts` | green |
| An unavailable verifier leaves the evidence cited | `tests/unit/drift/drift.spec.ts` | green |
| A broken document citation drops the contradiction | `tests/unit/drift/drift.spec.ts` | green |
| The report of a contradiction carries both citations, its type and its provenance | `tests/unit/drift/drift.spec.ts` | green |
| The usage adds every answer and verify call of the run | `tests/unit/drift/drift.spec.ts` | green |
| A failing answer call propagates unchanged | `tests/unit/drift/drift.spec.ts` | green |
| A drift run writes nothing | `tests/unit/drift/drift.spec.ts` | green |
| The two planted contradictions of the pricing document are found | `tests/integration/drift/acme-shop.spec.ts` | green (needs `DATABASE_URL`; skipped locally without it, run in CI) |
| A claim the code confirms is not a contradiction | `tests/integration/drift/acme-shop.spec.ts` | green (same) |

29 scenarios, 29 tests with the same name, none absent.

## Addendum (fix of this step)

- `tests/support/drift-doubles.ts`: new option `rootPath` (the project's stored root; a relative one is served by the
  source double only at its join to `WORKSPACE`).
- `tests/unit/drift/drift.spec.ts`: the test with the constant assertion is replaced by "An absolute project root is
  read as it is" (the batched read at `/repos/drift`) and "A relative project root is joined to the workspace root
  for every read" (project root `repos/drift`; every batched read at `join(WORKSPACE, 'repos/drift')`, the
  contradiction reported, no event). Neither is a scenario name, so the 1:1 map is unchanged.
- Proof that the new test guards the clause: with `drift.ts:120` mutated by hand to use `project.rootPath` unjoined,
  `npx vitest run tests/unit/drift/drift.spec.ts` gave 1 failed (the new test), 27 passed; restored, 5 files and 84
  tests passed. `npm run typecheck` and `eslint` over both files pass.
