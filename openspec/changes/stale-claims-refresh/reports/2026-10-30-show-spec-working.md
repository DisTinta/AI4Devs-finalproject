# Show spec working: stale-claims-refresh (DIS-42)

- Date: 2026-10-30
- Change: stale-claims-refresh (task 15.3)
- Interfaces: the CLI (`npm run cli -- index | ask`) and the HTTP API (`POST /api/projects/<id>/index`, `POST /api/projects/<id>/ask`), against the real Postgres and a real local model (Ollama `qwen2.5-coder`). The change has no browser UI (task 12.1), so Playwright does not apply.

*Agent's text: written by the agent of the autonomous run (`docs/AUTONOMOUS-RUN.md` §6), without the author. It reuses the evidence of two runs, step 11 in Git Bash on 2026-10-29 and the R13 check in PowerShell on 2026-10-30. Their full commands, outputs and SQL results are in `reports/2026-10-29-11-manual-interface-testing.md`, in the body of the report and in its addendum.*

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| A stale claim is refreshed after a re-index (explain) | index a copy of acme-shop, ask, change a cited file and commit it, `POST …/index`, ask again (`useCache: false`) | the claim keeps its id and turns `current`; `created_at` unchanged, `updated_at` later; new provenance (`createdAt` of the call, new `promptHash`, `statementType`); its only evidence row is new; the old one is gone | yes | step 11, step 5 (`52dd735d-…`, Git Bash, API); R13 table rows 4–6 (`0c705675-…`, PowerShell, API) |
| Prior claims show the refreshed claim without `[stale]` | the next CLI ask | `prior claims:` shows the refreshed claim `[FACT]` with no `[stale]` and no warning | yes | R13 row 7 |
| A refresh without backing leaves the claim stale | asks whose refresh output the quarantine discarded | the claim is shown `[INFERENCE] [stale]` with `warning: stale-evidence`; its row is unchanged by SQL; stderr / the API log holds `{"type":"stale_claim_not_refreshed","claimId":…,"code":"invalid-model-output"}`, a code and no text | yes | step 11, step 4; R13 rows 5 and 6 |
| At most three stale claims are refreshed per question | four due claims, one ask | three refresh calls, three events; the fourth claim (the oldest) is shown `[stale]` with no event | yes | R13 row 5 |
| Nothing is refreshed without a live answered answer | an ask with the model on a closed port; an ask in evaluation mode | `LLM_UNAVAILABLE` and no row; `UNKNOWN (llm-required)`; in both, the md5 of every claim's id, status, `updated_at` and object is identical before and after | yes | step 11, step 6 |
| The `/ask` contract does not change | `POST …/ask` | `200` with the keys `answer,statements,evidence,confidence,usage`, no `priorClaims` | yes | step 11, step 5; R13 row 6 |
| Graph-store "Claim refresh" (rewrite in place, no longer due, failure, invalid arguments) and the explain scenarios that need injected failures (superseded, `store-write-failed`, `llm-unavailable`, `budget-exhausted`, propagation after the row, usage and event order) | the real Postgres adapter inside a rolled-back transaction, and the unit doubles | `DATABASE_URL=… npx vitest run --project dom --project seed-build --project node`: 185 files, 1975 tests passed, 0 failed (2026-10-30, after the review fixes of commit `737e8b8`) | yes | this run; the scenario-to-test table in `2026-10-30-verify-against-spec.md` |

## Evidence

The commands and their verbatim results are in `reports/2026-10-29-11-manual-interface-testing.md`, both in its steps and in its R13 addendum. Two excerpts:

```
# PowerShell 5.1, second ask after the re-index (R13 row 5), stderr:
{"level":"info","type":"stale_claim_not_refreshed","claimId":"0c705675-1cf6-40ec-aabb-70e0021bd897","code":"invalid-model-output"}
# PowerShell 5.1, after the API ask with useCache false (R13 rows 6 and 7):
0c705675-…|current|created_at 2026-10-29 23:13:11.237833+00|updated_at 2026-10-29 23:23:26.038491+00|statementType FACT|evidence 0c98839f-… (before c40db8bb-…)
7. [FACT] El método `compute` en `PriceCalculator` invoca primero `discountFor` de `DiscountService`, luego `taxFor` de `TaxService`, y finalmente `shippingFor` de `ShippingService`.
   evidence: app/Services/PriceCalculator.php:16-44
```

## State

- Before: `claim` 0, `evidence` 0, `query_log` 0, `cache_entry` 6, 2 projects (acme-shop `4f028db4…`, task-api `83397076…`).
- After: the same.
- Restored: yes. The projects `dis-42-manual` and `dis-42-ps` were deleted (their rows cascade), the scratchpad copies were removed, the API and dev processes were stopped (`node scripts/dev-processes.mjs stop`), and the `ollama.exe` the agent started was stopped.

## Not demonstrated

- `superseded` through a real concurrent re-index (between a refresh's model call and its write) cannot be timed by hand on the live system. It is shown by the double (`beforeRefreshCheck`) and by the Postgres adapter's "no longer due" integration scenario. Its file-deletion variant (design X2) is shown by the double only.
- `budget-exhausted` on the live system would need a daily budget of nearly zero. It is shown by the unit scenario.

Handoff: the change is **demonstrably working** through its real interfaces, in Git Bash and in PowerShell. No screenshot was taken, and nothing was left at the repository root.
