# Test and State Verification Report

*(Agent's text, autonomous run, DIS-81.)*

- Date: 2026-11-03
- Change: context-measurement
- Step: 9 Run Tests and Verify Data State

## Commands executed

- `npx vitest run --project dom --project seed-build --project node` (baseline and final)
- `npm run typecheck`, `npm run lint`, `npm run lint:architecture`, `npm run docs:coverage`
- `npx vitest run tests/unit/scripts tests/unit/docs`
- `npm run measure:context` (the live run, launch 1, with `LLM_BASE_URL=http://127.0.0.1:11435/v1 LLM_MODEL=qwen2.5-coder:latest LLM_MODEL_VERIFY= LLM_TIMEOUT_MS=1200000` on its command line)
- `npm run db:seed`, `npm run verify`, `node scripts/dev-processes.mjs stop`

## RED evidence of each TDD task

The script `scripts/measure-context.mjs` was written before its test file (a deviation from the task order; the
agent wrote both in one pass to keep the layer order of the design). The RED run was obtained afterwards by moving
the module out of `scripts/` and running `npx vitest run tests/unit/scripts/measure-context.spec.ts`: the file
failed to load (module missing, no test ran). With the module back, 40 of 41 tests passed; the one failure was
"The seed has no row of a sample project" (a seed without the `task-api` project row made `readSeed` fail on the
dangling rows before the project was named), fixed in the script by checking the `project` rows first, and the file
went to 41 of 41. `tests/unit/docs/context-savings.spec.ts` was written before the live run: "The committed
outputs are the current aggregation" failed with `raw/run.json: the file does not exist` until the run (task 7.5),
and the four Table 1 and report tests failed until `readme.md` and `docs/measurements/context-savings.md` were
edited (tasks 7.6 to 7.8).

## Test results

- Baseline (0.4), before any change: 184 files passed, 29 skipped; 1894 tests passed, 281 skipped; 78,7 s.
  `npm run typecheck` and `npm run lint` green.
- Targeted (`tests/unit/scripts tests/unit/docs`): 18 files, 170 tests passed, 0 failed; 34,2 s.
- Required suite (final): 186 files passed, 29 skipped; 2275 tests of which 1942 passed, 281 skipped, 0 failed;
  86,0 s. Two new files (`tests/unit/scripts/measure-context.spec.ts`, 41 tests;
  `tests/unit/docs/context-savings.spec.ts`, 7 tests).
- `npm run typecheck`, `npm run lint`, `npm run docs:coverage` green; `npm run lint:architecture` has the one
  existing `no-orphans` warning for `packages/web/dist`, 0 errors.
- Notes: no flaky test; no existing test edited (`git diff --stat origin/final-project-CRN -- tests` lists only the two
  new files).

## Live run (tasks 7.3 to 7.4c)

- Versions: Ollama 0.40.13; model `qwen2.5-coder:latest`, digest
  `dae161e27b0e90dd1856c8bb3209201fd6736d8eb66298e75ed87571486f4364`; GPU NVIDIA GeForce GTX 970 (CUDA, compute
  5.2), 9 of 29 layers offloaded; Node v24.11.1, npm 11.19.0.
- Ollama state before: the tray app (`ollama app.exe`) and `ollama.exe` were running, no model loaded. The auto
  mode classifier denied closing them, so the agent started a separate `OLLAMA_HOST=127.0.0.1:11435
  OLLAMA_CONTEXT_LENGTH=16384 ollama serve` (log in the scratchpad) and pointed the API and the script at it. At
  the end that process tree was stopped (`taskkill` on its own PID); the user's tray app and `ollama.exe` were never
  touched and still answer on port 11434. State restored: yes (unchanged).
- The API was started detached with the same `LLM_*` values (`npm -w packages/api run dev`) and stopped with
  `node scripts/dev-processes.mjs stop`; `GET /health` no longer answers.
- Launches: 1. Start 2026-11-03 11:53:44 (local), 40 answers received between 11:58 and 13:22, the 89 counts until
  13:30, exit code 0 (the summary lines were printed), no restart, so no resume. Raw files added: `raw/run.json`,
  40 responses, `raw/tokenizer.json`. Total about 1 h 37 min.
- Ollama log: 0 lines with `truncating input prompt` (checked on every wait); `n_ctx = 16384`.
- Raw data size: 280 KB under `docs/measurements/context/raw/`.

## Data state verification

- Pre-test baseline (9.1):
  - SHA-256 of `seeds/graph-dump.sql`: `771ddaf556a7ebcf41632fa7a487b44eee9a7f71371ae4f84bd1e7b9658c6d16`
  - SHA-256 of `docs/measurements/context/questions.json`: `e01752687bbf6be2bcba95c7f2dc116c0ea5f3666100b387db7d170e14c893e6`
  - rows before the API started: `project` 2, `query_log` 0, `claim` 0, `cache_entry` 6
- After the live run (7.9), before restoring: `project` 2, `query_log` 40, `claim` 107, `cache_entry` 34 (the run
  with `useCache: false` wrote 28 new answer-cache rows next to the 6 golden ones).
- Post-test validation (9.6): hashes equal the baseline (checked again at the end); after `npm run db:seed`:
  `project` 2, `query_log` 0, `claim` 0, `cache_entry` 6; `npm run verify` exit 0 (acme-shop 3/3 and task-api 3/3
  golden answers match). No temporary copy left under `os.tmpdir()` (the CLI tests remove theirs in `afterEach`);
  the scratchpad copy of task 10.2 is in the session scratchpad. `node scripts/dev-processes.mjs stop`: nothing
  running.
- State restored: Yes
- Restoration actions: `npm run db:seed`; Ollama state unchanged.

## Mutation testing (9.4)

`scripts/**` is outside `stryker.config.json` → `mutate` (it lists `packages/core`, `cli`, `api` and
`long-fetch.ts`), and this change edits no mutated source: only the export keyword of three helpers in `scripts/`.
The CI `mutation` job is the check and its result is in the pull request.

## Privacy check (9.5, `/privacy-ethics-check` over the diff)

- Personal data: none. The inputs are the sample fixtures (made-up shop and task code), 40 questions about them
  and the answers of a local model; no user data, no real emails or secrets (checked with a grep of the raw data
  and the answers for key, secret, password and the endpoints).
- Third-party processing: none. The model is local (Ollama on this machine); nothing is sent to a hosted provider.
- No variable value is written: `LLM_BASE_URL` and `LLM_API_KEY` appear in no output, log or committed file (test
  "No variable value is written", and the committed raw data holds no endpoint). `.env` is not edited.
- Dependencies: none added (`npm audit` not needed).
- Result: no finding.

## Outcome

- Status: PASS
- Blocking issues: none
