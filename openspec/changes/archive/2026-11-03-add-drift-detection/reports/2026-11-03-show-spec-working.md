# Show spec working

- Date: 2026-11-03
- Change: add-drift-detection (DIS-71), PR #106
- Step: 13.3, run in the review step of the autonomous run (text of the agent that ran the review step)
- Environment: Windows 11, Git Bash, Node v24.11.1, Docker container `codemind-postgres-1` (healthy), branch
  `feature/dis-71-drift-detection` at `9acea03`

The interface of the change is the exported core function `drift` of `@codemind/core` (no CLI command and no HTTP
route: both are DIS-73). It was exercised from a throwaway script in the session scratchpad (outside the
repository, deleted at the end) run with
`npx tsx --import=./scripts/load-env.mjs --tsconfig packages/cli/tsconfig.run.json <scratchpad>/ssw-drift.mts`.
The script imports `drift` and `driftProvenanceSchema` from `@codemind/core`, the real Postgres store
(`createPostgresStore({ pool })` over the local `codemind` database) and the real git source tree
(`createGitSourceTree()`), with the repository as the absolute workspace root, over the seeded `acme-shop`
project (`a794456d-6d1b-5b55-a360-13fec83dc7bc`, indexed commit `4f028db4d51a3321031f3a24b3f36240410ed38c`, stored
root path `fixtures/acme-shop`, relative, so every read went through the workspace-root join). The model is a
scripted `LlmPort` written in the script (100 input and 10 output tokens per call, model name `scripted`), with
the claims and verdicts of task 6.1; the clock advances 1 s per read. No live model was called (the definition of
done is the scripted run, task 10.2). No browser UI is involved, so Playwright was not used.

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| The two planted contradictions of the pricing document are found | S1: `drift(deps, { projectId })` | `answered`, commit `4f028db…`; `docs/pricing.md` `claimsChecked` 3, two contradictions: lines 11–17 with evidence `app/Services/PriceCalculator.php:16-44` (`source`, `entailed`), line 31 with `app/Services/ShippingService.php:16-35` and `config/shop.php:1-32` (includes line 22), both `entailed`; both `INFERENCE`, provenance valid | yes | E1 |
| A claim the code confirms is not a contradiction | S1 | no contradiction inside lines 21–27; `README.md` has none | yes | E1 |
| Documents are checked in byte order (README.md first) | S1 | documents `README.md`, `docs/pricing.md`; model calls `extract README.md`, `extract docs/pricing.md`, then the confrontations | yes | E1 |
| The report of a contradiction carries both citations, its type and its provenance | S1 | claim citation `cited`, `type` `INFERENCE`, `driftProvenanceSchema` passes, model `scripted`, first input span the document citation, `createdAt` the clock's first read `2026-11-03T10:00:00.000Z` | yes | E1 |
| The usage adds every answer and verify call of the run | S1 | 5 `answer` calls (500/50) + 3 `verify` calls (300/30) = 800/80; `latencyMs` 5000 = first to last clock read | yes | E1 |
| A docPath checks only that document | S2: `docPath: 'docs/pricing.md'` | one document entry; model calls start with `extract docs/pricing.md` only | yes | E1 |
| Evaluation mode answers llm-required without reading anything | S3: model in `evaluation` mode | `{ status: 'unknown', reason: 'llm-required' }`, no model call | yes | E2 |
| A docPath that is not a stored document answers no-docs | S4 `app/Services/PriceCalculator.php`, S5 `docs/missing.md` | both `{ status: 'unknown', reason: 'no-docs' }`, no model call | yes | E2 |
| An unknown or unindexed project fails without calling the model (unknown half) | S6: unknown UUID | rejects `ProjectNotFound`, no model call | yes | E2 |
| An invalid drift request is rejected before the store | S7 `tokenBudget: 10`, S8 extra field `question` | `InvalidDriftRequest` naming `tokenBudget` and `request`; the message holds neither value (`secret-value` absent) | yes | E2 |
| A relative workspace root is rejected before the store | S9: `workspaceRoot: 'workspace'` | `RangeError` "workspaceRoot must be an absolute path", no model call | yes | E2 |
| An invalid extraction skips the document and the next one is checked | S10: the pricing extraction answers `not json at all` | `docs/pricing.md` 0/0/0, one `drift_doc_skipped` `invalid-model-output` `invalid_json`; `README.md` still checked | yes | E3 |
| A contradicted verdict citing an unknown id / without evidence skips the claim | S11: verdicts citing `D1`, `E99` and `[]` | three `drift_claim_skipped` events, subcodes `unknown_evidence_id` (claims 0 and 1) and `empty_evidence` (claim 2); `claimsChecked` 0; no `verify` call | yes | E3 |
| A claim outside the document is dropped | S12: claims on line 31 and lines 900–905 | `droppedClaims` 1, `claimsChecked` 1, the line-31 contradiction reported | yes | E3 |
| A drift run writes nothing | database counts before and after S1–S12 | `claim` 0, `evidence` 0, `cache_entry` 6, `query_log` 0, unchanged | yes | State |

The scenarios that need a broken repository, a failing model or a planted secret (broken citations, unavailable
verifier, `BudgetExhausted`, redaction, no-context claims, configuration limits) were not re-run against the real
adapters: they are covered by their unit tests over the doubles (84 tests green, see the verify-against-spec report).

## Evidence

E1, the success path (output of the script, trimmed to the fields the spec names):

```
project acme-shop a794456d-6d1b-5b55-a360-13fec83dc7bc indexedCommit 4f028db4d51a3321031f3a24b3f36240410ed38c rootPath fixtures/acme-shop
### S1 whole project, scripted live model
documents: README.md 0/0/0 []; docs/pricing.md claimsChecked 3, omittedClaims 0, droppedClaims 0
 contradiction 1: claim docs/pricing.md:11-17 cited; statement "The code applies the discount before the tax."; type INFERENCE
   evidence app/Services/PriceCalculator.php:16-44 source entailed
   provenanceValid true, model scripted, promptHash 8fec8b20592b…, inputSpans 34 (first docs/pricing.md 11-17), createdAt 2026-11-03T10:00:00.000Z
 contradiction 2: claim docs/pricing.md:31-31 cited; statement "The free shipping threshold is 75."; type INFERENCE
   evidence app/Services/ShippingService.php:16-35 source entailed, config/shop.php:1-32 config entailed
   provenanceValid true, model scripted, promptHash f2be8aeb4f5a…, inputSpans 36 (first docs/pricing.md 31-31), createdAt 2026-11-03T10:00:00.000Z
events: []
usage: inputTokens 800, outputTokens 80, costUsd 0, latencyMs 5000; generation 500/50/0; verification calls 3, cacheHits 0, 300/30, latencyMs 2000
model calls: ["extract README.md","extract docs/pricing.md","confront VAT is calcu","verify","confront Loyalty tier","confront Orders over ","verify","verify"]
### S2 docPath docs/pricing.md
documents: docs/pricing.md only, claimsChecked 3, the same two contradictions
```

E2, unknown answers and rejections:

```
### S3 evaluation mode            {"status":"unknown","reason":"llm-required"}   model calls: []
### S4 docPath is a source file   {"status":"unknown","reason":"no-docs"}        model calls: []
### S5 docPath missing            {"status":"unknown","reason":"no-docs"}        model calls: []
### S6 unknown project            rejects ProjectNotFound code=PROJECT_NOT_FOUND message="Project not found: b3b9a7a0-0000-4000-8000-000000000000"   model calls: []
### S7 tokenBudget 10             rejects InvalidDriftRequest code=INVALID_DRIFT_REQUEST field=tokenBudget message="Invalid drift request: tokenBudget"
### S8 extra field               rejects InvalidDriftRequest code=INVALID_DRIFT_REQUEST field=request message="Invalid drift request: request"
### S9 relative workspace root   rejects RangeError message="workspaceRoot must be an absolute path"   model calls: []
```

E3, invalid model output and dropped claims:

```
### S10 extraction not JSON
documents: README.md 0/0/0, docs/pricing.md 0/0/0
events: [{"type":"drift_doc_skipped","docPath":"docs/pricing.md","reason":"invalid-model-output","subcode":"invalid_json"}]
model calls: ["extract README.md","extract docs/pricing.md"]
### S11 confrontation cites D1 / empty evidence / E99   (docPath docs/pricing.md)
documents: docs/pricing.md claimsChecked 0, contradictions []
events: drift_claim_skipped claimIndex 0 unknown_evidence_id; claimIndex 1 unknown_evidence_id; claimIndex 2 empty_evidence
usage.verification.calls 0
### S12 extraction claim beyond the document
documents: docs/pricing.md claimsChecked 1, omittedClaims 0, droppedClaims 1, one contradiction (line 31)
model calls: ["extract docs/pricing.md","confront Orders over ","verify","verify"]
```

## State

- Before (2026-11-03 20:58:18 UTC, `psql` in `codemind-postgres-1`): `claim` 0, `evidence` 0, `cache_entry` 6,
  `query_log` 0.
- After (2026-11-03 20:58:58 UTC): `claim` 0, `evidence` 0, `cache_entry` 6, `query_log` 0.
- Restored: yes, nothing to restore (`drift` writes nothing). The scratchpad script was deleted; `git status` shows
  no stray file; `node scripts/dev-processes.mjs stop`: no dev process running.

## Not demonstrated

- A run with a real model: not part of the definition of done (task 10.2) and not run in this step for the reasons
  of the step 10 report (CPU-only Ollama, at least five `answer` calls plus `verify` calls per run).
- The unindexed-project half of "An unknown or unindexed project fails without calling the model": the seeded
  projects are all indexed; covered by its unit test.
- The scenarios listed above the evidence that need a broken repository, a failing model or a planted secret:
  covered by unit tests only.

## Handoff

The change is demonstrably working: over the real Postgres store, the real git source tree and the seeded
acme-shop (with its relative root), `drift` reports exactly the two planted contradictions of `docs/pricing.md` with
verified citations on both sides, answers the unknown cases, rejects invalid input before any call, isolates an
invalid model output to its document or claim, and writes nothing. No screenshot was taken and none was left at the
repository root.
