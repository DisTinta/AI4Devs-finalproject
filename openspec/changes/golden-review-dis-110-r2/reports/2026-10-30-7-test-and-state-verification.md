# Test and State Verification Report

**Change:** `golden-review-dis-110-r2` (DIS-110 r2 golden round). **Date:** 2026-10-30. **Shell:** Git
Bash on Windows. Paths under the user profile are masked as `<user>`.

## Commands executed

| Step | Command | Result |
|---|---|---|
| 0.3 | `docker compose exec -T postgres psql …` (indicators), `npm run db:migrate`, `curl -s http://127.0.0.1:11434/api/tags` | 2 projects (`acme-shop`, `task-api`), each 0 `claim`, 0 `query_log`, 3 `cache_entry`; no non-sample project; no migration to run; `qwen2.5-coder` listed |
| 1.1 | `sha256sum` of the 45 previous-round files | recorded in the scratchpad; unchanged at 3.5 and 5.6 |
| 2.1 | `git log --format=%h ebc47ba..HEAD` over every seed and answer fingerprint input | empty (the only later commit under such a path, `7a99646`, touches `fixtures/README.md` and a TSDoc, neither an input) |
| 2.1 | `npm run db:seed` | `2 projects loaded` |
| 2.2 (first run) | `LLM_BASE_URL=http://127.0.0.1:11434/v1 LLM_MODEL=qwen2.5-coder LLM_MODEL_VERIFY=qwen2.5-coder npm run cache:build -- --project task-api Q1` | 3 × `invalid-model-output`, `GOLDEN_NOT_CACHEABLE`, exit 1, 07:35–07:50 UTC; `/api/ps` showed `context_length: 4096` (design F6) |
| 2.2b | second server `OLLAMA_HOST=127.0.0.1:11435 OLLAMA_CONTEXT_LENGTH=16384` (CPU) and the rerun against it | both stopped by the session for low system memory before the model answered: 3 × `network`, `LLM_UNAVAILABLE` (`ECONNREFUSED`); `seeds/` unchanged; no orphan process (design F7). Change stopped for the author |
| 2.2 (resumed, F8) | author restarted Ollama on 11434 with 16384; one load with a 1-token chat request, then `curl -s http://127.0.0.1:11434/api/ps` | `"context_length":16384` |
| 2.2 (resumed) | the same `cache:build -- --project task-api Q1` against 11434 | `Q1: attempt 1/3 not cacheable (invalid-model-output)`, `Q1: answered in 104 s (attempt 2/3)`, `task-api: 3 golden answers -> seeds/cache/task-api.json`, exit 0, 08:04:23–08:07:32 UTC |
| 2.3 | Node comparison with `git show HEAD:seeds/cache/task-api.json` | `format`, `project`, `seed`, `answerFingerprint`, `generatedWith` unchanged; ids `Q1`, `Q2`, `Q3`; `Q2`, `Q3` identical (reviews included); `Q1` same question, `reviews: []`; no `AKIA` key; only `seeds/cache/task-api.json` changed under `seeds/` |
| 2.3 | `npm run db:seed`; `npm run verify` (no `LLM_*`); `npx vitest run tests/unit/seed/golden-coherence.spec.ts tests/unit/seed/golden-questions.spec.ts` | `2 projects loaded`; 3/3 per project, exit 0; 5/5 tests |
| 3.3 | `npx vitest run tests/unit/seed/golden-reviews.spec.ts -t "The panel input projects …"` | RED: `ENOENT` on the r2 input |
| 3.4 | input written by the spec's projection (scratchpad script, `JSON.stringify(x, null, 2) + '\n'`) | 3 passed (input, invalid outputs, criterion), 6 failing until group 5 |
| 4.3 | key-set check of each output before committing (scratchpad Node script comparing the exact key sets of the output, of each item and of each statement judgement) | both panelist outputs and the resolution: `keys: ok`; no re-emission needed |
| 5.1 | `-t "Each panelist output judges every item under the criterion"`, `-t "The resolution answers exactly the disagreements"` | 1 passed; 2 passed |
| 5.2 | full `golden-reviews.spec.ts` before signing | RED: the signatures `it` and the two report `it`s failed; "A golden answer judged incorrect carries no signature" already passed (no item `incorrect`, no `## Pending`) |
| 5.3–5.4 | signatures in `seeds/cache/task-api.json` (`Q1` only: the five other entries already held the identical `agent:claude-opus-5-5`/`agent:claude-sonnet-5-5`, `2026-10-30` signatures); report completed | `golden-reviews.spec.ts` + `golden-coherence.spec.ts`: 11/11 |

### Original and regenerated task-api Q1 answer

- Before (DIS-110, judged `incorrect`): «taskRoutes valida las peticiones entrantes mediante el uso de
  esquemas de validación definidos en src/schemas/»
- After (r2): «La validación de las peticiones entrantes en el sistema es realizada mediante el
  enrutamiento en Fastify con esquemas definidos. Para cada método y ruta especificada, se aplican
  esquemas que verifican la estructura y los datos de las peticiones. Luego, los controladores
  procesan las peticiones según la lógica de negocio definida en los servicios.» (four statements:
  one `FACT`, three `INFERENCE`; nine evidence entries, one of them the fixture's `README.md`)

## Spec scenario "The criterion precedes the input and nothing in the record is rewritten" (task 5.6)

- Report creating commit `ba73d30` is an ancestor of the regeneration `5d78990`, which is an ancestor
  of the input commit `bf8f189` (`git merge-base --is-ancestor`: both true).
- `git log 5d78990..bf8f189 -- seeds/cache`: empty.
- The report has two commits (`ba73d30`, `3d66d36`); `git log -p` from `ba73d30` changes no line of
  `## Criterion` (0 matching lines).
- One commit per r2 panel file: input `bf8f189`, panelist 1 `4d800f9`, panelist 2 `7c20908`,
  resolution `df5566e`.
- The 45 previous-round files keep their SHA-256; `git diff --stat origin/final-project-CRN` over them
  is empty; `git log d9dc18c..HEAD` over the 40 files of the rounds before DIS-110 is empty.
- `git diff 5d78990 -- seeds/cache`: one file, 10 insertions, 1 deletion, only `reviews` lines.

## Test results

| Run | Result |
|---|---|
| `npx vitest run tests/unit/seed tests/unit/cache` | 13 files, 54 tests passed |
| `npm run db:seed` + `npm run verify` (no `LLM_*`) | `2 projects loaded`; acme-shop 3/3, task-api 3/3, exit 0 |
| `npx vitest run --project dom --project seed-build --project node` | 162 files passed, 24 skipped; 1684 tests passed, 248 skipped; 80 s. The 24 skipped files are the integration files (`describeWithDatabase`: no `DATABASE_URL` in the shell) |
| `DATABASE_URL=<the .env.example URL> npx vitest run --project node tests/integration` | 35 files, 380 tests passed (the flaky "Every connection is released after a run" passed) |
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm run docs:coverage` | exit 0 |

Privacy check over the diff: the change adds golden-review JSON and Markdown, the regenerated golden
answer and test constants; no secret, no personal data, no `AKIA` key (the planted fixture secret is
not quoted anywhere); the model ids and dates are not personal data.

## Data state verification

| Indicator | Before (0.3) | After the regeneration (2.5) | After the tests (7.5) |
|---|---|---|---|
| `project` rows | 2 | 2 | 2 |
| `acme-shop` claim / query_log / cache_entry | 0 / 0 / 3 | 0 / 0 / 3 | 0 / 0 / 3 |
| `task-api` claim / query_log / cache_entry | 0 / 0 / 3 | 0 / 0 / 3 | 0 / 0 / 3 |

No restoration needed. `node scripts/dev-processes.mjs stop`: no repository process was running.
The author's Ollama (`ollama.exe`, its `llama-server`) was not stopped.

## Red CI window

`golden-reviews.spec.ts` is red from the regeneration commit `5d78990` (the DIS-110 input no longer
matches the golden file) until the signature commit `3d66d36` (expected, design Risks).

## UI evidence

Not applicable (task 9.1): no browser UI changes; `packages/web` is untouched.

## Outcome

All checks pass. The round's final verdicts: task-api `Q1` partial, `Q2` correct, `Q3` partial, `Q4`
correct, acme-shop `Q1` partial, `Q3` partial, `Q4` correct; agreement 85.7 %, kappa 0.720; no item
`incorrect`, so no r3 round.
