# Manual Interface Testing Report

- Date: 2026-10-28
- Change: ts-await-using-golden-regen
- Step: 11. Manual Interface Testing (Git Bash, local Postgres seeded in step 10, no `LLM_*`)

## 11.1 Analyzer through the CLI
- Scratch git repository in the scratchpad (`dis107-scratch`) with one committed `src/v.ts`: the content of the scenario "Other variable forms are not function symbols", including `await using f = async () => 1;` and `using g = () => 1;`.
- `ALLOWED_REPOS_DIR=<scratchpad> npm run cli -- index <scratchpad>/dis107-scratch --name dis-107-scratch --language typescript --framework none --json` (the variable set for that command only; `.env` untouched): exit `0`; the summary says `"files":1,"symbols":2,"edges":{"total":0,...},"diagnostics":[]`.
- Read-only query of the project's symbols: `run|method` and `outer|function`, exactly the two expected; no symbol `f` or `g`.
- Restore: `DELETE` of the project row (1 row); its file rows are 0 and no symbol row is orphaned (cascade); `npm run cli -- projects` lists only `acme-shop` and `task-api`.
- Residue: the scratch directory (under the scratchpad, outside the repository) could not be removed by the agent because the shell policy blocks recursive deletion; it holds only the tiny scratch repository and is safe to delete.

## 11.2 Evaluation-mode demo
- `npm run cli -- ask task-api "¿Qué hace buildPage con los resultados paginados?"`: exit `0`, the golden answer from the cache, no model request. Output (Git Bash):

```
Los resultados paginados son procesados por la función buildPage, que toma los elementos, el total, la página actual y el tamaño de la página como argumentos, y devuelve un objeto de página con la información correspondiente.

statements:
1. [INFERENCE] buildPage toma como argumento los elementos, el total, la página actual y el tamaño de la página.
   evidence: src/domain/pagination.ts:13-21

evidence:
src/domain/pagination.ts:13-21
    export function buildPage<T>(items: T[], total: number, page: number, pageSize: number): Page<T> {
      return {
        items,
        total,
        page,
    … (+4 lines)
```

- `npm run cli -- ask acme-shop "¿Cómo se validan los cupones?"`: exit `0`; the answer is the cached golden answer (entry Q3), with the statements on `isRedeemable` and `percentFor` and the evidence `app/Services/CouponValidator.php:14-39` and `app/Http/Requests/StoreOrderRequest.php:41-47`.
- `npm run cli -- ask task-api "¿Cómo se autentican los usuarios?"`: `UNKNOWN (no-anchor)`, exit `0`.

## 11.3 Error case
- `npm run cache:build -- --project nope`: `{"error":{"code":"USAGE","message":"unknown golden project","details":{"allowed":["acme-shop","task-api"]}}}`, non-zero exit; `git status --short seeds` empty afterwards.
- `tests/unit/cache/golden-file.spec.ts` (unchanged) passes, so the signatures did not loosen the review format.

## 11.4 Restore
- `claim` / `cache_entry`: 0 / 6 before and after. `git status --short seeds docs fixtures` empty. `node scripts/dev-processes.mjs stop`: no dev process running.

## 12. End-to-end
- Not applicable (no user interface change). `npm run test:a11y` green (`tests/a11y`, 13 tests with the golden-file spec in the same run).

## Outcome
- Status: PASS
- Blocking issues: none
