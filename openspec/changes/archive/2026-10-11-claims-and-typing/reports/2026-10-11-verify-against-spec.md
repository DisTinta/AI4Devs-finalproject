# Verify Against Spec — claims-and-typing

- Date: 2026-10-11
- Change: claims-and-typing (DIS-38), PR #36
- Scope: `openspec/changes/claims-and-typing/specs/claims-and-typing/spec.md` against commits
  `076fd74..c339388` on `feature/DIS-38-claims-and-typing`.
- Run by: `/verify-against-spec` (forked, read-only session: it could not write this file, so the
  main session saved its report verbatim). It did not re-run the tests; the "green" states come from
  `reports/2026-10-11-9-test-and-state-verification.md` (1046 passed, typecheck clean, Stryker
  95.68 %).

**Overall:** 19 of 20 scenarios have a test that proves them. The rule against typing an empty chain
is only enforced at compile time, and its test checks the opposite at run time. Two record rules
don't fully match the database. Block 3 has 13 items.

## 1. Requirements implemented correctly

**Claim and evidence records match the database checks**
- Closed sets declared once, equal to the database enums in order. Code:
  `packages/core/src/knowledge/claim.ts:8,14,20` and `packages/core/src/knowledge/evidence.ts:7`.
  Test: `tests/unit/knowledge/claim.spec.ts:120` (reads the enums out of the migration).
- An L2 FACT claim fails to type-check and is rejected at run time. Code: `claim.ts:61-83`. Test:
  `claim.spec.ts:45-57` (`@ts-expect-error` plus `safeParse`; tests are type-checked by
  `npm run typecheck`).
- L2 needs a provenance, missing or `null` is rejected; L1 may carry one. Code: `claim.ts:75,81`.
  Test: `claim.spec.ts:59-72`.
- Confidence is `null` or 0 to 1. Code: `claim.ts:58`. Test: `claim.spec.ts:74-83`.
- Provenance shape. Code: `claim.ts:26-45`. Tests: `claim.spec.ts:85-100`, edge cases `:173-197`.
- Evidence first line > 0, last line not before the first. Code: `evidence.ts:20-25`. Test:
  `claim.spec.ts:102-118`.
- Statement type does not depend on the layer: proven by the signature
  (`packages/core/src/explain/typing-rules.ts:21`); no run-time test, and
  `tests/unit/explain/typing-rules.spec.ts:5-7` says so.

**Statement typing**
- FACT when every span is anchor or exact, INFERENCE when any is heuristic. Code:
  `typing-rules.ts:21-23`. Tests: `typing-rules.spec.ts:10-16`, `:18-26`.
- The origin is used as given (`typing-rules.ts:10`, `Pick<ContextSpan,'origin'>`).

**Model output quarantine**
- Check order size → JSON → schema → duplicates → unknown ids. Code:
  `packages/core/src/explain/statement-schema.ts:43-69`. Tests: `statement-schema.spec.ts:123-138`,
  `:202-217`.
- Strict schema at every level, no `type` field. Code: `statement-schema.ts:18-28`. Tests: `:68-82`,
  `:206`.
- Subcodes `empty_evidence`, `limit_exceeded`, `invalid_shape`. Code: `statement-schema.ts:72-76`.
  Tests: `:96-103`, `:140-199`, `:220-231`.
- Duplicates not removed (`:79-88`, test `:105-112`); unknown ids (`:91-97`, test `:84-94`).
- Five limits exported (`packages/core/src/explain/limits.ts:6-18`), imported by the tests.
- Lengths in code points: Zod 4.6.5 (`node_modules/zod/v4/core/checks.js:273,296`); test
  `statement-schema.spec.ts:234-248`.

**Audit event**
- Fields and closed subcode set: `packages/core/src/explain/schema-violation.ts:7-42`,
  `statement-schema.ts:100-112`; test `statement-schema.spec.ts:252-274`.
- Issues keep only path and code; nothing logged: `statement-schema.ts:58`; test `:276-309`.

**Specific checks**
- Dependencies: `zod ^4.6.5` in `packages/core/package.json:11-13`, lockfile resolves 4.6.5;
  `node:crypto` allowed by `.dependency-cruiser.cjs:64`.
- Authorisation: none required by the spec.
- Response fields: the event has no field the spec does not name.

## 2. Requirements missing or partial

1. **"typing an empty chain SHALL NOT be possible"** (spec line 82): compile-time only.
   `typeStatement([])` returns `'FACT'` at run time (`every` on an empty array), and the test at
   `typing-rules.spec.ts:29-32` asserts `not.toThrow()`. A caller bypassing the types gets a FACT
   with no evidence.
2. **"valid values are exactly those the tables accept"** (spec lines 12-13):
   - `z.int()` (`evidence.ts:20-21`, `claim.ts:29-30`) accepts up to 2^53−1; the columns are
     Postgres `integer` (max 2 147 483 647).
   - L1 `provenance: null`: the column accepts it, `claim.ts:75` (`.optional()`) rejects it.
     Ambiguous against spec line 27; needs a decision.
   - Lesser: `\u0000` in `text`/`jsonb` passes `z.string()`, Postgres rejects it.
3. **"Any other field, a missing field or JSON `null` SHALL be rejected"** (spec lines 26-27):
   implemented, but no test for a missing provenance field or a `null` field inside it.
4. **"the event SHALL carry the kind `schema_violation`"** (spec line 189): the field is `type`
   (`schema-violation.ts:31`). Align wording or field.
5. **"nothing is written through `console`"** (spec line 207): the test spies only on
   `log/info/warn/error/debug`, not `trace`, `dir`, `table`, `assert`, `group*`.

## 3. Unspecified behaviour

1. Run-time empty chain returns FACT (`typing-rules.ts:22`, pinned by `typing-rules.spec.ts:31`).
   Recommendation: remove it.
2. Typing is fail-open (`origin !== 'heuristic'` instead of "is anchor or exact"); a future origin
   value would count as FACT. Recommendation: write the condition as the spec states it.
3. UUID format required for `projectId`, `inputSpans.fileId`, `evidence.fileId` (`z.uuid()`, RFC
   9562, stricter than Postgres `uuid`). Seed ids are v5 and pass. Recommendation: add to the spec.
4. Strict objects for claims, evidence and input spans (spec only requires it for provenance and
   model output). Recommendation: add to the spec (design D1).
5. The field lists of the claim and evidence records are not in the spec. Recommendation: add.
6. Unknown ids report every offending id; duplicates only the first. Recommendation: add (D3).
7. `issues` is empty for `output_too_large` and `invalid_json`. Recommendation: add.
8. Issue `code` exposes Zod's own codes (`unrecognized_keys`, `too_big`, `too_small`), compared
   literally by tests `:79` and `:102`. Recommendation: decide, then specify the set or map them.
9. Duplicate JSON keys are accepted silently (`JSON.parse` keeps the last). Recommendation: decide.
10. Reversed spans reported on `endLine` (`claim.ts:32`, `evidence.ts:25`; test `claim.spec.ts:142`).
    Recommendation: add to the spec or accept as detail.
11. Public exports the spec does not mention: `modelOutputSchema`, `ModelOutput`,
    `ModelOutputResult`, `SCHEMA_VIOLATION_SUBCODES`, `inputSpanSchema`, `CitedSpan`,
    `StatementType`. Recommendation: decide which are public.
12. Policy change in `docs/backend-standards.md` §4 (Zod schemas in core) is in design D2, not the
    spec. Recommendation: confirm it was reviewed.
13. Seed fingerprint changed (`seeds/graph-dump.sql:2`), every row identical. Recommendation: accept.

## Scenario → test → state

| Scenario | Test | State |
|---|---|---|
| An inferred fact is not representable | `tests/unit/knowledge/claim.spec.ts:45` | green |
| An inferred claim without provenance is rejected | `claim.spec.ts:59` | green |
| Confidence outside its range is rejected | `claim.spec.ts:74` | green |
| The provenance shape is validated | `claim.spec.ts:85` | green (missing/null field not covered, 2.3) |
| The evidence span mirrors the database checks | `claim.spec.ts:102` | green |
| The closed sets equal the database enums | `claim.spec.ts:120` | green |
| A chain of anchor and exact evidence is a fact | `tests/unit/explain/typing-rules.spec.ts:10` | green |
| Any heuristic evidence makes an inference | `typing-rules.spec.ts:18` | green |
| (rule) An empty chain cannot be typed | `typing-rules.spec.ts:29` | red: compile-time only; run time returns FACT |
| A conforming output is accepted | `tests/unit/explain/statement-schema.spec.ts:50` | green |
| An extra field discards the whole output | `statement-schema.spec.ts:68` | green |
| An unknown evidence id discards the whole output | `statement-schema.spec.ts:84` | green |
| A statement without evidence discards the whole output | `statement-schema.spec.ts:96` | green |
| A repeated evidence id discards the whole output | `statement-schema.spec.ts:105` | green |
| Malformed JSON discards the output | `statement-schema.spec.ts:114` | green |
| The output size limit accepts its bound and rejects one byte more | `statement-schema.spec.ts:123` | green |
| The answer length limit accepts its bound and rejects one more | `statement-schema.spec.ts:140` | green |
| The statement count limit accepts its bound and rejects one more | `statement-schema.spec.ts:155` | green |
| The statement length limit accepts its bound and rejects one more | `statement-schema.spec.ts:170` | green |
| The citations limit accepts its bound and rejects one more | `statement-schema.spec.ts:185` | green |
| The event identifies the output without carrying it | `statement-schema.spec.ts:252` | green |
| Checking an output writes nothing to the console | `statement-schema.spec.ts:276` | green (only 5 methods watched, 2.5) |

Nothing was fixed by the check itself. Destinations of each finding: `design.md` → Follow-ups.

## Addendum — after the adversarial-review fixes (2026-10-11, HEAD `7334994`)

Re-run by `/verify-against-spec` (forked, read-only; the main session saved it). It re-checked every
finding of this report and of `reports/2026-10-11-adversarial-review.md` against `7e4fb2d..7334994`.
It did not run the tests; the main session had run the full suite at `7334994` just before (81 files,
1055 passed, gates clean), recorded in the step 9 report addendum.

**Overall:** 22 scenarios, each with a test of the same name; no requirement red.

Closed: empty chain (2.1/3.1), fail-open typing (3.2), line range (2.2), L1 `null` provenance
(specified), U+0000 (named B exception, owner DIS-39), missing/`null` provenance field (2.3),
console methods (2.5), unspecified behaviour 3.3–3.10 (now specified), the adversarial Major
(`MAX_EVENT_ISSUES` + `issueCount`), the sparse chain, the raw NUL byte (0 NUL bytes in every file of
the change), extra exports `inputSpanSchema`/`SPAN_LINE_MAX`/`MAX_EVENT_ISSUES` (now named).

Still open or new:

1. The test of "The issues of an event are bounded" checks how many issues are kept, not which: a
   mutant `issues.slice(-MAX_EVENT_ISSUES)` would pass (the spec says "the first ones in the order
   they were found").
2. The sparse-chain `RangeError` message is not pinned (likely Stryker survivor).
3. The scenario "The event identifies the output without carrying it" still says "kind
   `schema_violation`" (the requirement text says `type`): rest of 2.4.
4. Unspecified: a `null` element of the chain throws `TypeError` (not the documented `RangeError`); `{}`
   is typed `INFERENCE` (fail closed). Decide: specify "an error", or widen the guard to `span == null`.
5. Unspecified, accept as detail: an explicit `undefined` element is rejected like a hole;
   `issueCount` for `duplicate_evidence_id` is always 1.
6. Public exports not named in the spec's export sentence (`SchemaViolationEvent`, its issue and
   subcode types, `CitedSpan`, `StatementType`, `provenanceSchema`, `Provenance`, `Claim*`,
   `EvidenceVerification`): decide whether to name `SchemaViolationEvent` or accept the broad reading.
7. Process: `KIT_PROTECT_SPECS="0"` is still in the author's working tree, uncommitted.

Destinations are recorded in `design.md` → Follow-ups once decided.

