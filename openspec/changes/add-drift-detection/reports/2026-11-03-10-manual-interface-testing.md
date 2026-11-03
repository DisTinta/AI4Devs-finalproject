# Manual Interface Testing Report

- Date: 2026-11-03
- Change: add-drift-detection
- Step: 10. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)
- Author of this report: the agent (autonomous run, apply step)

## Interface under test
The exported core function `drift` (no CLI command and no HTTP route in this change: both are DIS-73). It was called from a throwaway script in the session scratchpad (outside the repository, deleted at the end) that imports `drift` from `@codemind/core` with the real Postgres store (`createPostgresStore({ pool })`), the real git source tree and the workspace root, over the seeded acme-shop project (`npm run cli -- projects` lists `acme-shop` with 174 nodes, 170 edges). The model is a scripted double in `live` mode (the same claims and verdicts as task 6.1).

## Commands executed (OS user name masked)
1. Baseline, 2026-11-03T19:44:09Z: `claim` 0, `evidence` 0, `cache_entry` 6, `query_log` empty (via `psql` in the database container).
2. `npm run cli -- projects` (acme-shop and task-api listed; `npm run db:seed` was not needed).
3. `npx tsx --import=./scripts/load-env.mjs --tsconfig packages/cli/tsconfig.run.json <scratchpad>/drift-manual.mts` (run at 2026-11-03T20:41Z; Node v24.11.1).
4. Post-run counts with `psql`: `claim` 0, `evidence` 0, `cache_entry` 6, `query_log` empty.
5. `node scripts/dev-processes.mjs stop`: no process running.

## Results
### 10.2 Success path (scripted model)
- `drift(deps, { projectId })`: `status` `answered`, `commit` `4f028db4d51a3321031f3a24b3f36240410ed38c` (the seed's indexed commit), two documents: `README.md` (`claimsChecked` 0, no contradiction) and `docs/pricing.md` (`claimsChecked` 3, `omittedClaims` 0, `droppedClaims` 0, 2 contradictions). `events` empty.
- Contradiction 1: claim lines 11-17, statement "The code applies the discount before the tax.", evidence `app/Services/PriceCalculator.php` lines 16-44, `fileKind` `source`, verification `entailed`; `type` `INFERENCE`; provenance model `scripted`, 34 input spans, `createdAt` 2026-11-03T20:41:15.126Z, prompt hash starting `8fec8b20592b`.
- Contradiction 2: claim line 31, statement "The free shipping threshold is 75.", evidence `app/Services/ShippingService.php` lines 16-35 and `config/shop.php` lines 1-32 (includes line 22), `fileKind` `source` and `config`, both `entailed`; `type` `INFERENCE`; 36 input spans; prompt hash starting `f2be8aeb4f5a`.
- The claim of lines 21-27 (loyalty tiers) is not a contradiction.
- `usage`: 800 input and 80 output tokens, cost 0 USD (scripted model reports 100/10 per call, cost table prices it at 0), `latencyMs` 4179; `generation` 500/50 (5 `answer` calls: 2 extractions and 3 confrontations); `verification` 3 calls, 300/30.
- With `docPath: 'docs/pricing.md'`: one document entry, `claimsChecked` 3, 2 contradictions.
- All of this matches the spec (status, the two contradictions with their evidence paths and lines, `type`, provenance and usage).
- Live model: not run. `.env` is not readable by the agent (policy), so `LLM_MODE` could not be confirmed, although an Ollama endpoint answers on port 11434; a real run makes at least five model calls plus `verify` calls on CPU (minutes each, `docs/project-context.md` Ollama gotcha), beyond what this step may spend, and its observation is not part of the definition of done (the scripted run is). The spend of a live run would not be visible to `withDailyBudget` anyway until DIS-73 writes the `query_log` row.

### 10.3 Unknown and error cases
- Evaluation-mode model: `{ "status": "unknown", "reason": "llm-required" }`.
- `docPath: 'app/Services/PriceCalculator.php'`: `{ "status": "unknown", "reason": "no-docs" }`.
- Unknown project id `b3b9a7a0-0000-4000-8000-000000000000`: rejects with `ProjectNotFound` ("Project not found: ...").
- `tokenBudget: 10`: rejects with `InvalidDriftRequest`, message "Invalid drift request: tokenBudget", `field` `tokenBudget`, no value in the message.

### 10.4 Mutating effect
None expected and none found: the counts after the run equal the baseline (item 1 vs item 4). The scratchpad script (and its `.mts` copy) was deleted, it never was in the repository (`git status` shows no stray file), and no process was left running.

### 10.5 PowerShell
`docs/DEMO.md` has no step for `drift` in this change (the CLI is DIS-73), so there is no capture to take and no PowerShell command was run.

### 10.7 End-to-End Testing
Not applicable: the change reaches no user interface.

## Outcome
- Status: PASS
- Blocking issues: none
