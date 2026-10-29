# Manual Interface Testing Report

- Date: 2026-10-29
- Change: stale-claims-refresh
- Step: 11. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

*Agent's text: written by the agent of the autonomous run (`docs/AUTONOMOUS-RUN.md` §6), without the author. Paths mask the OS user name as `<user>`; every command ran in Git Bash.*

## Preconditions (task 11.1)
- Docker Postgres up (`docker compose up -d --wait`, container healthy), `npm run db:migrate` (`No migrations to run!`), `npm run db:seed` (2 projects loaded) after the regeneration of group 10.
- Indicators (task 0.4), before and at the start of this step: `claim` 0, `evidence` 0, `query_log` 0, `cache_entry` 6, projects `acme-shop` (`indexed_commit` 4f028db4d51a3321031f3a24b3f36240410ed38c) and `task-api` (83397076ae519d2cd8dc43af627e4efacae6ca21).
- A copy of `fixtures/acme-shop` without `.git` under the scratchpad (`C:/Users/<user>/AppData/Local/Temp/claude/…/scratchpad/dis42-repos/acme-shop`), its history built with `buildOne` of `fixtures/build-history.mjs` (32 commits, HEAD `4f028db`).
- Ollama: `curl http://127.0.0.1:11434/api/tags` did not answer, so the agent started `ollama.exe serve` from the local install as a detached process with `OLLAMA_CONTEXT_LENGTH=16384` (it listed `qwen2.5-coder`). The model runs on CPU only, hence `LLM_TIMEOUT_MS=1200000` for the asks (the first ask without it failed with `LLM_UNAVAILABLE`, `reason: timeout`, at the 120 s default; nothing was written).

## Steps and results
1. **Index the copy** (task 11.2): `ALLOWED_REPOS_DIR=<scratchpad>/dis42-repos npm run cli -- index <scratchpad>/dis42-repos/acme-shop --name dis-42-manual --language php` → framework `laravel (detected)`, 53 files, 121 symbols, 32 commits, 170 edges, 1 redaction in files. Project id `8fe020bb-4ffd-4595-b258-c8bd55bd44a6`.
2. **First ask** (CLI, `LLM_BASE_URL=http://127.0.0.1:11434/v1 LLM_MODEL=qwen2.5-coder LLM_MODEL_VERIFY=qwen2.5-coder LLM_TIMEOUT_MS=1200000 npm run cli -- ask dis-42-manual "¿Cómo se calcula el precio final de un pedido?"`): answered, four statements. `SELECT id, status, updated_at FROM claim WHERE project_id = …` → four claims, all `current`, `updated_at` 2026-10-29 19:19:16.959308+00. None of them cites `app/Services/PriceCalculator.php`: they cite `app/Models/Order.php`, `app/Services/DiscountService.php`, `TaxService.php` and `ShippingService.php`.
3. **Change and re-index** (task 11.3): in the copy, `app/Services/PriceCalculator.php` (a trailing comment) **and** `app/Services/DiscountService.php` (a trailing comment) were changed and committed, because the claims of step 2 cite `DiscountService.php` and not the calculator (deviation from the task's example, recorded below). The API ran with `ALLOWED_REPOS_DIR=<scratchpad>/dis42-repos`, `LLM_BASE_URL`, `LLM_MODEL`, `LLM_MODEL_VERIFY`, `LLM_TIMEOUT_MS=1200000` and `PORT=3042` set for that command only (`npm -w packages/api run dev`). `curl -i -X POST http://localhost:3042/api/projects/8fe0…/index` → `202 Accepted`, `{"mode":"full","indexedCommit":"52b55df7…","filesQueued":53,"cacheEntriesInvalidated":1}`. By SQL, exactly the claim citing `DiscountService.php` (`52dd735d-79ac-479b-8a9c-935da1ae4f0b`) turned `stale` (`updated_at` 19:27:15.979347+00); the other three stayed `current`.
4. **Second ask, CLI** (task 11.4): the answer showed `prior claims:` with that claim as `[INFERENCE] [stale]` and `warning: stale-evidence`, and stderr held `{"level":"info","type":"stale_claim_not_refreshed","claimId":"52dd735d-…","code":"invalid-model-output"}`: a code and no text. The local 7B model returned a refresh output that the quarantine discarded, so the claim stayed `stale` and its row unchanged (checked by SQL: status `stale`, `updated_at` 19:27:15.979347+00). This is the accepted "could not back it" path of the task.
5. **Third ask, API** (`POST /api/projects/8fe0…/ask` with `{"question":"…","useCache":false}`): `200`, the body has no `priorClaims` (grep of the body finds none). By SQL the claim `52dd735d-…` is now `current`, its object is a new text (`El método discountFor en DiscountService calcula descuen…`), `created_at` is unchanged (19:19:16.97141+00), `updated_at` is later (19:43:44.552221+00), its provenance holds `createdAt` 2026-10-29T19:37:50.315Z (the call's first instant), `statementType` `FACT` and a new `promptHash`, and its only evidence row is new (`88e4c0e1-e5ce-497a-b150-b7ae51b015eb`, `DiscountService.php` lines 21–66, verification `entailed`). The API log holds the answer's `entailment_unverified` events at `info` and no `stale_claim_not_refreshed` event (the refresh succeeded).
6. **Error paths** (task 11.5), after another committed change of `DiscountService.php` and `POST …/index` (`202`; 3 claims `stale` of 14):
   - `LLM_BASE_URL=http://127.0.0.1:9/v1 … npm run cli -- ask …` → `{"error":{"code":"LLM_UNAVAILABLE",…,"details":{"reason":"network","systemCode":"ECONNREFUSED"}}}`; no `query_log` row was written (3 rows before and after) and an md5 of every claim's id, status, `updated_at` and object was identical before and after (`77194d86f50dc9609327378b2eb60be4`, 14 claims).
   - Evaluation mode (`LLM_BASE_URL=`, `LLM_API_KEY=`, `LLM_MODEL=`, `LLM_MODEL_VERIFY=` empty) → `UNKNOWN (llm-required)`, message `evaluation mode (cache-only): set LLM_* to enable free-form asks`; one zero row was written (4 rows), the claims' md5 identical, the three claims still `stale`.

## Restoration (task 11.6)
- Server and every dev process stopped (`node scripts/dev-processes.mjs stop`: 1 process tree; `GET /health` no longer answers); the `ollama.exe` the agent started was stopped (the tray `ollama app.exe` was already there and was left alone) and no `llama-server.exe` remained.
- `DELETE FROM project WHERE name = 'dis-42-manual'` (the claims, evidence, query log and cache rows cascaded) and the scratchpad copy removed.
- Indicators after: `claim` 0, `evidence` 0, `query_log` 0, `cache_entry` 6, 2 projects, the same indexed commits: identical to the baseline.

## Deviations
- The change of step 3 touched `DiscountService.php` as well as `PriceCalculator.php`, because no claim of the model's first answer cited the calculator, so changing only that file would have turned nothing `stale` (decision of the agent, recorded in `design.md` → Follow-ups E7, destination A).
- The CLI run of step 4 hit the "could not back it" path with the real local model; the success path was shown by the API run of step 5. Both are variants the task accepts.

## PowerShell check for the author (task 11.8, design R13, destination C)
Not run by the agent (the autonomous classifier denies the PowerShell commands that set `$env:…`). Pending for the author: in a new PowerShell terminal, index a copy of acme-shop, ask with `npm run cli -- ask`, change `PriceCalculator.php`, re-index (`POST /api/projects/<id>/index`), ask again and see the prior claim without `[stale]`; the claim to watch is one whose evidence cites a file you changed.

## Outcome
- Status: PASS (the PowerShell check stays pending for the author)
- Blocking issues: none.
