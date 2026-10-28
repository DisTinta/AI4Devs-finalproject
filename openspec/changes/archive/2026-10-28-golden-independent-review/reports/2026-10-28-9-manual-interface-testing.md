# Step 9: manual interface testing (DIS-33, apply-finish)

Agent's text (autonomous run). Git Bash, database seeded in step 8 (`2 projects loaded`), no `LLM_*`.

## 9.1 Evaluation-mode demo

| Command | Result |
|---|---|
| `npm run cli -- ask task-api "¿Qué hace buildPage con los resultados paginados?"` | exit 0; the golden answer from the cache (statement 2: `La función buildPage devuelve un objeto Page con las propiedades items, total, page, pageSize y pageCount.`), evidence `src/domain/pagination.ts:13-21`; no model request |
| `npm run cli -- ask acme-shop "¿Cómo se validan los cupones?"` | exit 0; the golden answer, evidence `CouponValidator` and `DiscountService` (`app/Services/DiscountService.php:21-66`) |
| `npm run cli -- ask task-api "¿Cómo se autentican los usuarios?"` | `UNKNOWN (no-anchor)`, exit 0 |

## 9.2 Error case

`tests/unit/cache/golden-file.spec.ts` is unchanged and green in the step 8 runs: `checkGoldenFile`
still rejects a review with an extra key, so the signatures did not loosen the format.

## 9.3 Restore

After the three `ask` calls (run twice, once for the output and once for the exit codes, all 0) the
database holds `claim` 0 and `cache_entry` 6, which are the six golden answers loaded by the seed: the
asks wrote nothing. `git status --short seeds docs fixtures` shows only the files of this change.
`node scripts/dev-processes.mjs stop` run at the end.

## 10.1 End-to-end

Not applicable: no user interface changes (the web shows the same answers; `reviews` is not displayed).
No PowerShell check is planned (design Follow-ups P1).
